import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  descargarProcedimiento,
  estaDescargado,
  etiquetaTipo,
  fechaDMA,
  filtrarProcedimientos,
  obtenerBiblioteca,
  ProcedimientoNoDescargado,
  sincronizarProcedimientos,
  textoTamano,
  verProcedimiento,
  type FiltroProcedimiento,
  type Procedimiento,
} from '@/api/procedimientos';
import { horaRespaldo } from '@/api/respaldo';
import { Aviso } from '@/componentes/Aviso';
import { Boton } from '@/componentes/Boton';
import { EncabezadoApp } from '@/componentes/EncabezadoApp';
import { useConsulta } from '@/hooks/useConsulta';
import { useDiseno } from '@/hooks/useDiseno';
import { useSesion } from '@/sesion/SesionContext';
import { colores, radios } from '@/tema/colores';
import { avisar } from '@/utilidades/dialogos';

/**
 * HU-24 — Biblioteca de procedimientos (Menú → Procedimientos).
 *  - Buscador (código, norma, descripción) y filtros Todos · Descargados · Calibración · Verificación.
 *  - Una tarjeta por procedimiento aprobado: norma, versión, fecha de actualización y si está «DISPONIBLE OFFLINE» o «SOLO ONLINE».
 *  - «Ver» abre el PDF con el lector del teléfono (lo descarga antes si hace falta); «Descargar» lo guarda para leerlo sin señal.
 *  - Los procedimientos de tus servicios de hoy se descargan solos; si Calidad aprueba una versión nueva, reemplaza sola a la anterior.
 *  - Sin conexión: solo los descargados (los demás avisan «No está en tu teléfono»).
 */
const FILTROS: { valor: FiltroProcedimiento; texto: string }[] = [
  { valor: 'todos', texto: 'Todos' },
  { valor: 'descargados', texto: 'Descargados' },
  { valor: 'calibracion', texto: 'Calibración' },
  { valor: 'verificacion', texto: 'Verificación' },
];

export default function PantallaProcedimientos() {
  const { sesion } = useSesion();
  const usuario = sesion?.usuario;
  const token = sesion?.token ?? '';
  const d = useDiseno();
  const [busqueda, setBusqueda] = useState('');
  const [filtro, setFiltro] = useState<FiltroProcedimiento>('todos');
  const [ocupado, setOcupado] = useState<number | null>(null);
  const [mensaje, setMensaje] = useState<{ tipo: 'error' | 'info'; texto: string } | null>(null);
  // Cambia cuando se descarga o borra un archivo: vuelve a calcular qué hay en el teléfono
  const [marca, setMarca] = useState(0);

  const { datos, cargando, recargando, error, recargar } = useConsulta(
    (t) => obtenerBiblioteca(t, usuario?.idUsuario ?? 0),
    `${usuario?.idUsuario ?? 0}`,
  );
  const lista = useMemo(() => datos?.datos ?? [], [datos]);
  const sinConexion = !!datos?.sinConexion;

  // Con señal: descarga lo de hoy y reemplaza versiones anteriores, sin molestar
  useEffect(() => {
    if (!datos || datos.sinConexion || !token) return;
    void sincronizarProcedimientos(token, datos.datos).then((n) => {
      if (n > 0) setMarca((m) => m + 1);
    });
  }, [datos, token]);

  // `marca` fuerza el recálculo de lo descargado
  const descargado = useMemo(() => {
    void marca;
    return (p: Procedimiento) => estaDescargado(p);
  }, [marca]);

  const visibles = filtrarProcedimientos(lista, busqueda, filtro, descargado);
  const nDescargados = lista.filter(descargado).length;
  const hayDeHoy = lista.some((p) => p.paraServicioHoy);

  async function ver(p: Procedimiento) {
    setMensaje(null);
    setOcupado(p.idProcedimiento);
    try {
      await verProcedimiento(token, p, sinConexion);
      setMarca((m) => m + 1);
    } catch (e) {
      if (e instanceof ProcedimientoNoDescargado) avisar('No está en tu teléfono', e.message);
      else setMensaje({ tipo: 'error', texto: e instanceof Error ? e.message : 'No se pudo abrir el procedimiento.' });
    } finally {
      setOcupado(null);
    }
  }

  async function descargar(p: Procedimiento) {
    setMensaje(null);
    if (sinConexion) return avisar('No está en tu teléfono', `${p.codigo} es solo online. Podrás descargarlo cuando vuelvas a tener señal.`);
    setOcupado(p.idProcedimiento);
    try {
      await descargarProcedimiento(token, p);
      setMarca((m) => m + 1);
      setMensaje({ tipo: 'info', texto: `${p.codigo} guardado en el teléfono: ahora también está disponible sin conexión.` });
    } catch (e) {
      setMensaje({ tipo: 'error', texto: e instanceof Error ? e.message : 'No se pudo descargar el procedimiento.' });
    } finally {
      setOcupado(null);
    }
  }

  return (
    <SafeAreaView style={estilos.area} edges={['top']}>
      <EncabezadoApp nombre={usuario?.nombre ?? ''} apellido={usuario?.apellido} subtitulo={`${usuario?.nombre ?? ''} · ${usuario?.cargo ?? 'Técnico de Campo'}`} />
      <ScrollView
        contentContainerStyle={[estilos.contenido, { paddingHorizontal: d.margen, maxWidth: d.anchoMaximo }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={recargando} onRefresh={() => void recargar()} colors={[colores.primario]} />}
      >
        <View style={estilos.tituloFila}>
          <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Volver">
            <Ionicons name="arrow-back" size={24} color={colores.titulo} />
          </Pressable>
          <Text style={estilos.titulo} accessibilityRole="header">
            Procedimientos
          </Text>
        </View>
        <Text style={estilos.subtitulo}>Biblioteca de la intranet · solo aprobados</Text>

        {sinConexion && datos && (
          <Aviso tipo="info" mensaje={`Sin conexión · solo puedes ver los procedimientos descargados. Lista guardada a las ${horaRespaldo(datos.guardadoEn)}.`} />
        )}

        <View style={estilos.buscador}>
          <Ionicons name="search" size={20} color={colores.textoTenue} />
          <TextInput
            value={busqueda}
            onChangeText={setBusqueda}
            placeholder="Buscar por código, norma o descripción"
            placeholderTextColor={colores.placeholder}
            style={estilos.buscadorTexto}
            autoCorrect={false}
            maxLength={100}
            returnKeyType="search"
            testID="buscador-procedimientos"
          />
          {!!busqueda && (
            <Pressable onPress={() => setBusqueda('')} hitSlop={10} accessibilityRole="button" accessibilityLabel="Limpiar búsqueda">
              <Ionicons name="close-circle" size={18} color={colores.textoTenue} />
            </Pressable>
          )}
        </View>

        <View style={estilos.filtros}>
          {FILTROS.map((f) => {
            const activo = filtro === f.valor;
            const n = f.valor === 'todos' ? lista.length : f.valor === 'descargados' ? nDescargados : null;
            return (
              <Pressable
                key={f.valor}
                onPress={() => setFiltro(f.valor)}
                accessibilityRole="button"
                accessibilityState={{ selected: activo }}
                style={[estilos.chip, activo && estilos.chipActivo]}
                testID={`filtro-${f.valor}`}
              >
                <Text style={[estilos.chipTexto, activo && { color: colores.blanco }]}>{n === null ? f.texto : `${f.texto} (${n})`}</Text>
              </Pressable>
            );
          })}
        </View>

        {hayDeHoy && !sinConexion && (
          <Aviso tipo="info" mensaje="Los procedimientos de tus servicios de hoy se descargan solos en el teléfono." />
        )}
        {!!mensaje && <Aviso tipo={mensaje.tipo} mensaje={mensaje.texto} />}

        {cargando ? (
          <ActivityIndicator color={colores.primario} style={{ marginTop: 32 }} />
        ) : error ? (
          <Aviso tipo="error" mensaje={error} />
        ) : visibles.length === 0 ? (
          <View style={estilos.vacio} testID="procedimientos-vacio">
            <Ionicons name="book-outline" size={34} color={colores.textoTenue} />
            <Text style={estilos.vacioTexto}>
              {busqueda || filtro !== 'todos' ? 'Ningún procedimiento coincide con tu búsqueda.' : 'Aún no hay procedimientos aprobados con PDF.'}
            </Text>
          </View>
        ) : (
          visibles.map((p) => {
            const offline = descargado(p);
            const trabajando = ocupado === p.idProcedimiento;
            return (
              <View key={p.idProcedimiento} style={estilos.tarjeta} testID={`procedimiento-${p.codigo}`}>
                <Pressable
                  onPress={() => router.push({ pathname: '/procedimiento-ficha', params: { id: String(p.idProcedimiento) } })}
                  accessibilityRole="button"
                  accessibilityLabel={`Ficha de ${p.codigo}`}
                  style={{ gap: 3 }}
                >
                  <View style={estilos.cabecera}>
                    <Text style={estilos.codigo}>{p.codigo}</Text>
                    <View style={[estilos.etiqueta, { backgroundColor: offline ? colores.verdeEtiquetaFondo : colores.grisFondo }]}>
                      <Text style={[estilos.etiquetaTexto, { color: offline ? colores.verdeEtiquetaTexto : colores.grisTexto }]}>
                        {offline ? 'DISPONIBLE OFFLINE' : 'SOLO ONLINE'}
                      </Text>
                    </View>
                  </View>
                  <Text style={estilos.norma}>{[p.autorNorma, p.normaBase].filter(Boolean).join(' · ')}</Text>
                  <Text style={estilos.descripcion}>{p.descripcion}</Text>
                  {!!p.paraServicioHoy && (
                    <View style={estilos.hoy}>
                      <Ionicons name="calendar-outline" size={13} color={colores.azulTexto} />
                      <Text style={estilos.hoyTexto}>PARA TU SERVICIO DE HOY · {p.paraServicioHoy}</Text>
                    </View>
                  )}
                  <Text style={estilos.meta}>
                    {[`Versión ${p.version}`, `Actualizado ${fechaDMA(p.actualizado)}`, [etiquetaTipo(p.tipo), p.pdfTamanoBytes ? `PDF ${textoTamano(p.pdfTamanoBytes)}` : ''].filter(Boolean).join(' · ')]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                </Pressable>
                <View style={estilos.acciones}>
                  {!offline && (
                    <View style={{ flex: 1 }}>
                      <Boton titulo="Descargar" variante="secundario" onPress={() => void descargar(p)} deshabilitado={trabajando} />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Boton titulo="Ver" onPress={() => void ver(p)} cargando={trabajando} deshabilitado={trabajando} />
                  </View>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const estilos = StyleSheet.create({
  area: { flex: 1, backgroundColor: colores.fondo },
  contenido: { padding: 16, paddingBottom: 28, maxWidth: 560, width: '100%', alignSelf: 'center', gap: 12 },
  tituloFila: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  titulo: { fontSize: 24, fontWeight: '700', color: colores.titulo, flexShrink: 1 },
  subtitulo: { fontSize: 14, color: colores.textoSecundario, marginLeft: 34, marginTop: -6 },
  buscador: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colores.tarjeta,
    borderWidth: 1,
    borderColor: colores.borde,
    borderRadius: radios.campo,
    paddingHorizontal: 14,
    minHeight: 48,
  },
  buscadorTexto: { flex: 1, minWidth: 0, fontSize: 15, color: colores.texto, paddingVertical: 10 },
  filtros: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: colores.borde, backgroundColor: colores.tarjeta },
  chipActivo: { backgroundColor: colores.primario, borderColor: colores.primario },
  chipTexto: { fontSize: 13.5, fontWeight: '700', color: colores.titulo },
  vacio: { alignItems: 'center', gap: 8, paddingVertical: 36 },
  vacioTexto: { fontSize: 14.5, color: colores.textoSecundario, textAlign: 'center' },
  tarjeta: { backgroundColor: colores.tarjeta, borderRadius: radios.tarjeta, borderWidth: 1, borderColor: colores.bordeSuave, padding: 14, gap: 10 },
  cabecera: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  codigo: { fontSize: 18, fontWeight: '800', color: colores.titulo, flexShrink: 1 },
  etiqueta: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  etiquetaTexto: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.4 },
  norma: { fontSize: 12.5, color: colores.textoSecundario },
  descripcion: { fontSize: 14.5, color: colores.texto, lineHeight: 20, marginTop: 2 },
  hoy: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', backgroundColor: colores.azulFondo, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, marginTop: 4 },
  hoyTexto: { fontSize: 10.5, fontWeight: '800', color: colores.azulTexto, letterSpacing: 0.3 },
  meta: { fontSize: 12, color: colores.textoTenue, marginTop: 4 },
  acciones: { flexDirection: 'row', gap: 10 },
});
