import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { nombreDeCodigo, obtenerCatalogo } from '@/api/catalogos';
import { obtenerServiciosProgramados, type FiltroServicios, type ServicioProgramado } from '@/api/servicios';
import { Aviso } from '@/componentes/Aviso';
import { EncabezadoApp } from '@/componentes/EncabezadoApp';
import { TarjetaServicio } from '@/componentes/TarjetaServicio';
import { useConsulta } from '@/hooks/useConsulta';
import { useDiseno } from '@/hooks/useDiseno';
import { useSesion } from '@/sesion/SesionContext';
import { colores, radios } from '@/tema/colores';
import { contarServicios, etiquetaDia, fechaLimaHoy, filtrarServicios, textoServicios } from '@/utilidades/agenda';

/**
 * HU-03 — Agenda de Servicios Programados.
 *  - Buscador por N° de RQ, OS, OM o cliente (lo resuelve el back, 400 ms después de dejar de escribir).
 *  - Filtros Todos, Hoy y Pendientes con su contador. Se pide la lista completa una vez y los filtros y contadores salen de
 *    ella (src/utilidades/agenda.ts): cambiar de filtro es instantáneo y el número siempre coincide con lo que se ve.
 *    Si hay un servicio en campo (en ruta, en ejecución o pausado) aparece además el filtro "En curso".
 *  - Tarjetas con cliente, fecha/hora, RQ y OS, objetivos, responsable/lugar, estado LISTO / PENDIENTE / BLOQUEADO e
 *    indicadores (cliente confirmado, SSOMA, alerta predictiva). El detalle de un servicio BLOQUEADO queda deshabilitado.
 *  - El estado sale de lo que registra la intranet: la programación (HU-36) deja la OS programada con su personal, y la
 *    respuesta del cliente (HU-37) la pasa a LISTO. Si se reprograma la fecha, vuelve a PENDIENTE hasta que el cliente confirme.
 * Se abre desde el menú: "Servicios Programados", "Ruta del Día" (filtro Hoy) o el banner "Próximo Hit".
 */
const filtrosBase: { id: FiltroServicios; texto: string }[] = [
  { id: 'todos', texto: 'Todos' },
  { id: 'hoy', texto: 'Hoy' },
  { id: 'pendientes', texto: 'Pendientes' },
];
const filtroEnCurso = { id: 'en_ejecucion' as const, texto: 'En curso' };

const esFiltro = (v: unknown): v is FiltroServicios =>
  v === 'todos' || v === 'hoy' || v === 'pendientes' || v === 'en_ejecucion';

const vacios: Record<FiltroServicios, { titulo: string; texto: string }> = {
  todos: { titulo: 'No tienes servicios aquí', texto: 'Cuando te asignen un servicio aparecerá en esta lista.' },
  hoy: { titulo: 'No tienes servicios para hoy', texto: 'Los servicios programados para hoy aparecerán aquí.' },
  pendientes: {
    titulo: 'No tienes servicios pendientes',
    texto: 'Aquí verás los servicios que esperan la confirmación del cliente o la aprobación SSOMA.',
  },
  en_ejecucion: { titulo: 'No tienes servicios en curso', texto: 'Cuando salgas a un servicio aparecerá aquí.' },
};

export default function PantallaServiciosProgramados() {
  const { sesion } = useSesion();
  const usuario = sesion?.usuario;
  const d = useDiseno();

  // El filtro inicial puede venir del menú (?filtro=hoy). Si la persona elige otro, se respeta
  // mientras no vuelva a entrar con otro filtro desde el menú.
  const params = useLocalSearchParams<{ filtro?: string }>();
  const filtroDelMenu: FiltroServicios = esFiltro(params.filtro) ? params.filtro : 'todos';
  const [eleccion, setEleccion] = useState<{ desde: FiltroServicios; filtro: FiltroServicios } | null>(null);
  const filtro = eleccion && eleccion.desde === filtroDelMenu ? eleccion.filtro : filtroDelMenu;

  // Búsqueda: se consulta 400 ms después de dejar de escribir
  const [texto, setTexto] = useState('');
  const [busqueda, setBusqueda] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setBusqueda(texto.trim()), 400);
    return () => clearTimeout(t);
  }, [texto]);

  // Siempre se pide "todos": los filtros y contadores se calculan aquí, sobre la misma lista.
  const { datos, cargando, recargando, error, recargar } = useConsulta(
    async (token) => {
      const [servicios, cargos] = await Promise.all([
        obtenerServiciosProgramados(token, 'todos', busqueda),
        obtenerCatalogo(token, 'CARGO_USUARIO'),
      ]);
      return { servicios, cargos };
    },
    busqueda,
  );

  const cargo = nombreDeCodigo(datos?.cargos, usuario?.cargo) ?? usuario?.cargo ?? 'Técnico de Campo';
  const hoy = fechaLimaHoy();
  const todos: ServicioProgramado[] = useMemo(() => datos?.servicios ?? [], [datos]);
  const contadores = useMemo(() => contarServicios(todos, hoy), [todos, hoy]);
  const servicios = useMemo(() => filtrarServicios(todos, filtro, hoy), [todos, filtro, hoy]);

  const mostrarEnCurso = contadores.enCurso > 0 || filtro === 'en_ejecucion';
  const filtros = mostrarEnCurso ? [...filtrosBase, filtroEnCurso] : filtrosBase;
  const cantidadDe = (id: FiltroServicios) =>
    id === 'todos' ? contadores.todos : id === 'hoy' ? contadores.hoy : id === 'pendientes' ? contadores.pendientes : contadores.enCurso;

  function verDetalle(s: ServicioProgramado) {
    router.push({ pathname: '/detalle-servicio', params: { id: String(s.idOs) } });
  }

  return (
    <SafeAreaView style={estilos.area} edges={['top']}>
      <EncabezadoApp nombre={usuario?.nombre ?? ''} apellido={usuario?.apellido} subtitulo={`${usuario?.nombre ?? ''} · ${cargo}`} />

      <ScrollView
        contentContainerStyle={[estilos.contenido, { paddingHorizontal: d.margen, maxWidth: d.anchoMaximo }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={recargando} onRefresh={recargar} colors={[colores.primario]} />}
      >
        <View style={estilos.tituloFila}>
          <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Volver al menú">
            <Ionicons name="arrow-back" size={24} color={colores.titulo} />
          </Pressable>
          <Text style={estilos.titulo} accessibilityRole="header">
            Servicios Programados
          </Text>
        </View>
        <Text style={estilos.subtitulo}>Agenda técnica asignada</Text>

        <View style={estilos.buscador}>
          <Ionicons name="search" size={20} color={colores.textoTenue} />
          <TextInput
            value={texto}
            onChangeText={setTexto}
            placeholder="Buscar por RQ, OS, OM o cliente"
            placeholderTextColor={colores.placeholder}
            style={estilos.buscadorTexto}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={100}
            returnKeyType="search"
            testID="buscador-servicios"
          />
          {!!texto && (
            <Pressable onPress={() => setTexto('')} hitSlop={10} accessibilityRole="button" accessibilityLabel="Limpiar búsqueda">
              <Ionicons name="close-circle" size={18} color={colores.textoTenue} />
            </Pressable>
          )}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={estilos.filtros}>
          {filtros.map((f) => {
            const activo = f.id === filtro;
            const cantidad = cargando ? null : cantidadDe(f.id);
            return (
              <Pressable
                key={f.id}
                onPress={() => setEleccion({ desde: filtroDelMenu, filtro: f.id })}
                accessibilityRole="tab"
                accessibilityLabel={cantidad === null ? f.texto : `${f.texto}, ${textoServicios(cantidad)}`}
                accessibilityState={{ selected: activo }}
                style={[estilos.filtro, activo && estilos.filtroActivo]}
                testID={`filtro-${f.id}`}
              >
                <Text style={[estilos.filtroTexto, activo && estilos.filtroTextoActivo]}>
                  {f.texto}
                  {cantidad !== null && <Text style={estilos.filtroCantidad}> {cantidad}</Text>}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {filtro === 'hoy' && !cargando && !error && (
          <Text style={estilos.diaHoy} testID="dia-hoy">
            {etiquetaDia(hoy)} · {textoServicios(servicios.length)}
          </Text>
        )}

        {cargando ? (
          <ActivityIndicator color={colores.primario} style={{ marginTop: 32 }} />
        ) : error ? (
          <Aviso tipo="error" mensaje={error} />
        ) : servicios.length === 0 ? (
          <View style={estilos.vacio}>
            <Ionicons name="calendar-clear-outline" size={40} color={colores.textoTenue} />
            <Text style={estilos.vacioTitulo}>{busqueda ? 'Sin resultados' : vacios[filtro].titulo}</Text>
            <Text style={estilos.vacioTexto}>
              {busqueda ? `No hay servicios que coincidan con "${busqueda}".` : vacios[filtro].texto}
            </Text>
          </View>
        ) : (
          <View style={{ gap: 16 }}>
            {servicios.map((s) => (
              <TarjetaServicio key={s.idOs} servicio={s} onVerDetalle={() => verDetalle(s)} />
            ))}
            {filtro === 'pendientes' && (
              <View style={estilos.nota} testID="nota-pendientes">
                <Ionicons name="information-circle-outline" size={20} color={colores.azulTexto} />
                <Text style={estilos.notaTexto}>Pendiente: falta la confirmación del cliente o la aprobación SSOMA.</Text>
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const estilos = StyleSheet.create({
  area: { flex: 1, backgroundColor: colores.fondo },
  contenido: { padding: 16, paddingBottom: 28, maxWidth: 520, width: '100%', alignSelf: 'center' },
  tituloFila: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  titulo: { fontSize: 24, fontWeight: '700', color: colores.titulo, flexShrink: 1 },
  subtitulo: { fontSize: 15, color: colores.textoSecundario, marginTop: 4, marginBottom: 16, marginLeft: 34 },
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
  filtros: { gap: 10, paddingVertical: 14 },
  filtro: {
    borderWidth: 1,
    borderColor: colores.borde,
    backgroundColor: colores.tarjeta,
    borderRadius: 22,
    paddingHorizontal: 20,
    paddingVertical: 9,
  },
  filtroActivo: { backgroundColor: colores.primarioOscuro, borderColor: colores.primarioOscuro },
  filtroTexto: { fontSize: 15, fontWeight: '500', color: colores.titulo },
  filtroCantidad: { fontWeight: '700' },
  filtroTextoActivo: { color: colores.blanco, fontWeight: '700' },
  diaHoy: { fontSize: 14, color: colores.textoSecundario, marginBottom: 12 },
  nota: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 14,
    borderRadius: radios.campo,
    backgroundColor: colores.azulFondo,
  },
  notaTexto: { flex: 1, fontSize: 14, lineHeight: 20, color: colores.azulTexto },
  vacio: { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 20 },
  vacioTitulo: { fontSize: 17, fontWeight: '700', color: colores.titulo, marginTop: 12 },
  vacioTexto: { fontSize: 14, color: colores.textoSecundario, textAlign: 'center', marginTop: 6, lineHeight: 20 },
});
