import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { nombreDeCodigo, obtenerCatalogo } from '@/api/catalogos';
import { obtenerServiciosJefaturaConRespaldo, type FiltroServicios } from '@/api/panelCampo';
import { horaRespaldo } from '@/api/respaldo';
import { Aviso } from '@/componentes/Aviso';
import { EncabezadoApp } from '@/componentes/EncabezadoApp';
import { useConsulta } from '@/hooks/useConsulta';
import { useDiseno } from '@/hooks/useDiseno';
import { useRefrescoAutomatico } from '@/hooks/useRefrescoAutomatico';
import { useSesion } from '@/sesion/SesionContext';
import { colores, radios } from '@/tema/colores';
import { FILTROS, etiquetaEstado, lugarLlegada, textoFiltro } from '@/utilidades/panelCampo';

/**
 * HU-29 — "Servicios activos": vista lista del Panel de Campo. Búsqueda por OS, cliente o técnico y filtros Activos / Con demora / Incidencias / Finalizados.
 * Cada tarjeta muestra el estado, el técnico, el lugar con la llegada (o la ETA si va en ruta) y el avance (estimación por hitos). Toca una para ver su seguimiento.
 */
export default function PantallaServiciosActivos() {
  const { sesion } = useSesion();
  const usuario = sesion?.usuario;
  const d = useDiseno();
  const [filtro, setFiltro] = useState<FiltroServicios>('activos');
  const [texto, setTexto] = useState('');
  const [busqueda, setBusqueda] = useState('');

  // La búsqueda se aplica cuando el usuario deja de escribir
  useEffect(() => {
    const t = setTimeout(() => setBusqueda(texto), 400);
    return () => clearTimeout(t);
  }, [texto]);

  const { datos, cargando, recargando, error, recargar } = useConsulta(async (token) => {
    const [r, cargos] = await Promise.all([
      obtenerServiciosJefaturaConRespaldo(token, usuario?.idUsuario ?? 0, filtro, busqueda),
      obtenerCatalogo(token, 'CARGO_USUARIO').catch(() => undefined),
    ]);
    return { lista: r.datos, sinConexion: r.sinConexion, guardadoEn: r.guardadoEn, cargos };
  }, `${filtro}|${busqueda}`);
  useRefrescoAutomatico(recargar, datos?.lista.chips.refrescoSegundos ?? 30);

  const cargo = nombreDeCodigo(datos?.cargos, usuario?.cargo) ?? usuario?.cargo ?? 'Jefe de Área';
  const chips = datos?.lista.chips;
  const servicios = datos?.lista.servicios ?? [];

  return (
    <SafeAreaView style={estilos.area} edges={['top']}>
      <EncabezadoApp nombre={usuario?.nombre ?? ''} apellido={usuario?.apellido} subtitulo={`${usuario?.nombre ?? ''} · ${cargo}`} />
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
          <Text style={[estilos.titulo, { fontSize: d.tituloPantalla }]} accessibilityRole="header">
            Servicios activos
          </Text>
        </View>
        <Text style={estilos.subtitulo}>Panel de Campo · vista lista</Text>

        <View style={estilos.buscador}>
          <Ionicons name="search-outline" size={20} color={colores.textoTenue} />
          <TextInput
            value={texto}
            onChangeText={setTexto}
            placeholder="Buscar OS, cliente o técnico"
            placeholderTextColor={colores.placeholder}
            style={estilos.buscadorTexto}
            maxLength={100}
            autoCorrect={false}
            testID="buscar-servicio"
          />
        </View>

        <View style={estilos.chips}>
          {FILTROS.map((f) => {
            const activo = f.id === filtro;
            return (
              <Pressable
                key={f.id}
                onPress={() => setFiltro(f.id)}
                style={[estilos.chip, activo && estilos.chipActivo]}
                accessibilityRole="button"
                accessibilityState={{ selected: activo }}
                testID={`filtro-${f.id}`}
              >
                <Text style={[estilos.chipTexto, activo && { color: colores.blanco }]}>{textoFiltro(f.id, chips?.activos ?? 0)}</Text>
              </Pressable>
            );
          })}
        </View>

        {datos?.sinConexion && (
          <View style={{ marginBottom: 10 }}>
            <Aviso mensaje={`Sin conexión: se muestra lo último guardado (${horaRespaldo(datos.guardadoEn)}).`} />
          </View>
        )}

        {cargando ? (
          <ActivityIndicator color={colores.primario} style={{ marginTop: 36 }} />
        ) : error ? (
          <Aviso tipo="error" mensaje={error} />
        ) : servicios.length === 0 ? (
          <Text style={estilos.vacio}>{busqueda.trim() ? 'Ningún servicio coincide con tu búsqueda.' : 'No hay servicios en esta vista.'}</Text>
        ) : (
          servicios.map((s) => {
            const et = etiquetaEstado(s.estado);
            return (
              <Pressable
                key={s.idOs}
                onPress={() => router.push({ pathname: '/servicio-jefatura', params: { id: String(s.idOs) } })}
                style={estilos.tarjeta}
                accessibilityRole="button"
                accessibilityLabel={`${s.numero}, ${et.texto}`}
                testID={`servicio-${s.idOs}`}
              >
                <View style={estilos.cabecera}>
                  <Text style={estilos.nombre}>
                    {s.numero}
                    {s.cliente ? ` · ${s.cliente}` : ''}
                  </Text>
                  <View style={[estilos.pill, { backgroundColor: et.fondo }]}>
                    <Text style={[estilos.pillTexto, { color: et.color }]}>{et.texto}</Text>
                  </View>
                </View>
                {!!s.tecnico && (
                  <View style={estilos.fila}>
                    <Ionicons name="person-outline" size={17} color={colores.textoSecundario} />
                    <Text style={estilos.linea}>{s.tecnico}</Text>
                  </View>
                )}
                <View style={[estilos.fila, { justifyContent: 'space-between' }]}>
                  <View style={[estilos.fila, { flex: 1 }]}>
                    <Ionicons name="location-outline" size={17} color={colores.textoSecundario} />
                    <Text style={[estilos.linea, { flex: 1 }]} numberOfLines={2}>
                      {lugarLlegada(s) || '—'}
                    </Text>
                  </View>
                  <Text style={estilos.pct}>{s.avancePct} %</Text>
                </View>
                <View style={estilos.barra}>
                  <View style={[estilos.barraRelleno, { width: `${Math.max(0, Math.min(100, s.avancePct))}%` }]} />
                </View>
              </Pressable>
            );
          })
        )}
        <Text style={estilos.nota}>El avance es una estimación por hitos del servicio, no un dato medido.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const estilos = StyleSheet.create({
  area: { flex: 1, backgroundColor: colores.fondo },
  contenido: { paddingTop: 18, paddingBottom: 28, width: '100%', alignSelf: 'center' },
  tituloFila: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 2 },
  titulo: { fontWeight: '800', color: colores.titulo, flexShrink: 1 },
  subtitulo: { color: colores.textoSecundario, fontSize: 15, marginBottom: 12 },
  buscador: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colores.blanco, borderWidth: 1, borderColor: colores.borde, borderRadius: radios.campo, paddingHorizontal: 14, minHeight: 54 },
  buscadorTexto: { flex: 1, fontSize: 17, color: colores.texto },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12, marginBottom: 14 },
  chip: { borderWidth: 1, borderColor: colores.borde, backgroundColor: colores.blanco, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 10 },
  chipActivo: { backgroundColor: colores.primario, borderColor: colores.primario },
  chipTexto: { fontSize: 16, color: colores.texto, fontWeight: '600' },
  vacio: { textAlign: 'center', color: colores.textoSecundario, fontSize: 16, marginTop: 34 },
  tarjeta: { backgroundColor: colores.blanco, borderWidth: 1, borderColor: colores.bordeSuave, borderRadius: radios.tarjeta, padding: 14, marginBottom: 12 },
  cabecera: { flexDirection: 'row', gap: 8, justifyContent: 'space-between', alignItems: 'flex-start' },
  nombre: { flex: 1, fontSize: 18, fontWeight: '800', color: colores.titulo, lineHeight: 24 },
  pill: { borderRadius: 8, paddingHorizontal: 9, paddingVertical: 4 },
  pillTexto: { fontSize: 11.5, fontWeight: '800', letterSpacing: 0.3 },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 7 },
  linea: { fontSize: 15.5, color: colores.textoSecundario },
  pct: { fontSize: 16.5, fontWeight: '800', color: colores.primario, marginLeft: 8 },
  barra: { height: 7, backgroundColor: colores.grisFondo, borderRadius: 4, overflow: 'hidden', marginTop: 8 },
  barraRelleno: { height: '100%', backgroundColor: colores.primario },
  nota: { textAlign: 'center', fontSize: 12.5, color: colores.textoTenue, marginTop: 6 },
});
