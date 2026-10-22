import { useEffect, useState } from 'react';
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
import { useSesion } from '@/sesion/SesionContext';
import { colores, radios } from '@/tema/colores';

/**
 * HU-03 — Agenda de Servicios Programados.
 *  - Buscador por N° de RQ, OS, OM o cliente.
 *  - Filtros rápidos: Todos, Hoy, Pendientes, En ejecución.
 *  - Tarjetas con cliente, fecha/hora, RQ y OS, objetivos, responsable/lugar,
 *    estado LISTO / PENDIENTE / BLOQUEADO e indicadores (cliente confirmado, SSOMA, alerta predictiva).
 *  Sin "Disponible offline" ni "Pendiente sincronizar" (el modo offline se quitó en la HU-01).
 *  Se abre desde el menú: "Servicios Programados", "Ruta del Día" (filtro Hoy) o el banner "Próximo Hit".
 */
const filtros: { id: FiltroServicios; texto: string }[] = [
  { id: 'todos', texto: 'Todos' },
  { id: 'hoy', texto: 'Hoy' },
  { id: 'pendientes', texto: 'Pendientes' },
  { id: 'en_ejecucion', texto: 'En ejecución' },
];

const esFiltro = (v: unknown): v is FiltroServicios => filtros.some((f) => f.id === v);

export default function PantallaServiciosProgramados() {
  const { sesion } = useSesion();
  const usuario = sesion?.usuario;

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

  const { datos, cargando, recargando, error, recargar } = useConsulta(
    async (token) => {
      const [servicios, cargos] = await Promise.all([
        obtenerServiciosProgramados(token, filtro, busqueda),
        obtenerCatalogo(token, 'CARGO_USUARIO'),
      ]);
      return { servicios, cargos };
    },
    `${filtro}|${busqueda}`,
  );

  const cargo = nombreDeCodigo(datos?.cargos, usuario?.cargo) ?? usuario?.cargo ?? 'Técnico de Campo';
  const servicios: ServicioProgramado[] = datos?.servicios ?? [];

  function verDetalle(s: ServicioProgramado) {
    router.push({ pathname: '/modulo/[id]', params: { id: 'detalle-servicio', titulo: `Servicio ${s.numeroOs}` } });
  }

  return (
    <SafeAreaView style={estilos.area} edges={['top']}>
      <EncabezadoApp nombre={usuario?.nombre ?? ''} apellido={usuario?.apellido} subtitulo={`${usuario?.nombre ?? ''} · ${cargo}`} />

      <ScrollView
        contentContainerStyle={estilos.contenido}
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
            return (
              <Pressable
                key={f.id}
                onPress={() => setEleccion({ desde: filtroDelMenu, filtro: f.id })}
                accessibilityRole="tab"
                accessibilityState={{ selected: activo }}
                style={[estilos.filtro, activo && estilos.filtroActivo]}
                testID={`filtro-${f.id}`}
              >
                <Text style={[estilos.filtroTexto, activo && estilos.filtroTextoActivo]}>{f.texto}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {cargando ? (
          <ActivityIndicator color={colores.primario} style={{ marginTop: 32 }} />
        ) : error ? (
          <Aviso tipo="error" mensaje={error} />
        ) : servicios.length === 0 ? (
          <View style={estilos.vacio}>
            <Ionicons name="calendar-clear-outline" size={40} color={colores.textoTenue} />
            <Text style={estilos.vacioTitulo}>{busqueda ? 'Sin resultados' : 'No tienes servicios aquí'}</Text>
            <Text style={estilos.vacioTexto}>
              {busqueda
                ? `No hay servicios que coincidan con "${busqueda}".`
                : 'Cuando te asignen un servicio aparecerá en esta lista.'}
            </Text>
          </View>
        ) : (
          <View style={{ gap: 16 }}>
            {servicios.map((s) => (
              <TarjetaServicio key={s.idOs} servicio={s} onVerDetalle={() => verDetalle(s)} />
            ))}
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
    paddingHorizontal: 22,
    paddingVertical: 9,
  },
  filtroActivo: { backgroundColor: colores.primarioOscuro, borderColor: colores.primarioOscuro },
  filtroTexto: { fontSize: 15, fontWeight: '500', color: colores.titulo },
  filtroTextoActivo: { color: colores.blanco, fontWeight: '700' },
  vacio: { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 20 },
  vacioTitulo: { fontSize: 17, fontWeight: '700', color: colores.titulo, marginTop: 12 },
  vacioTexto: { fontSize: 14, color: colores.textoSecundario, textAlign: 'center', marginTop: 6, lineHeight: 20 },
});
