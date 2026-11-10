import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { nombreDeCodigo, obtenerCatalogo } from '@/api/catalogos';
import { obtenerPanelCampoConRespaldo } from '@/api/panelCampo';
import { horaRespaldo } from '@/api/respaldo';
import { Aviso } from '@/componentes/Aviso';
import { EncabezadoApp } from '@/componentes/EncabezadoApp';
import { MapaEsquematico, type PinMapa } from '@/componentes/MapaEsquematico';
import { useConsulta } from '@/hooks/useConsulta';
import { useDiseno } from '@/hooks/useDiseno';
import { useRefrescoAutomatico } from '@/hooks/useRefrescoAutomatico';
import { useSesion } from '@/sesion/SesionContext';
import { colores, radios } from '@/tema/colores';
import { LEYENDA_MAPA, colorPin, insigniaAlerta, lineaDetalleAlerta, lineaTecnicoAlerta, textoActualizado } from '@/utilidades/panelCampo';

/**
 * HU-29 — Panel de Campo en tiempo real (Jefe de Área): KPIs de los servicios de hoy (en ruta, en ejecución, con demora, con incidencia, finalizados), un mapa
 * con un pin por técnico del color de su estado y las alertas críticas primero. Muestra solo los servicios de su alcance (área de la RQ para Servicio Técnico y
 * Metrología). Se actualiza solo cada ~30 s y al deslizar hacia abajo; sin conexión muestra lo último guardado. El mapa es esquemático (sin librería de mapas).
 */
export default function PantallaPanelCampo() {
  const { sesion } = useSesion();
  const usuario = sesion?.usuario;
  const d = useDiseno();

  const { datos, cargando, recargando, error, recargar } = useConsulta(async (token) => {
    const [r, cargos] = await Promise.all([obtenerPanelCampoConRespaldo(token, usuario?.idUsuario ?? 0), obtenerCatalogo(token, 'CARGO_USUARIO').catch(() => undefined)]);
    return { panel: r.datos, sinConexion: r.sinConexion, guardadoEn: r.guardadoEn, cargos };
  });
  useRefrescoAutomatico(recargar, datos?.panel.kpis.refrescoSegundos ?? 30);

  const cargo = nombreDeCodigo(datos?.cargos, usuario?.cargo) ?? usuario?.cargo ?? 'Jefe de Área';
  const panel = datos?.panel ?? null;
  const k = panel?.kpis;

  const abrirServicio = (idOs: number | null) => {
    if (idOs) router.push({ pathname: '/servicio-jefatura', params: { id: String(idOs) } });
  };
  const conPosicion = (panel?.pines ?? []).filter((p) => p.latitud !== null && p.longitud !== null);
  const pines: PinMapa[] = conPosicion.map((p) => ({
    clave: String(p.idUsuario),
    latitud: p.latitud as number,
    longitud: p.longitud as number,
    texto: p.iniciales,
    color: colorPin(p.estado),
    etiqueta: `${p.tecnico}${p.numeroOs ? ` · ${p.numeroOs}` : ''}`,
    onPress: p.idOs ? () => abrirServicio(p.idOs) : undefined,
  }));
  const sinUbicacion = (panel?.pines.length ?? 0) - conPosicion.length;

  return (
    <SafeAreaView style={estilos.area} edges={['top']}>
      <EncabezadoApp nombre={usuario?.nombre ?? ''} apellido={usuario?.apellido} subtitulo={`${usuario?.nombre ?? ''} · ${cargo}`} />
      <ScrollView
        contentContainerStyle={[estilos.contenido, { paddingHorizontal: d.margen, maxWidth: d.anchoMaximo }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={recargando} onRefresh={() => void recargar()} colors={[colores.primario]} />}
      >
        <View style={estilos.tituloFila}>
          <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Volver">
            <Ionicons name="arrow-back" size={24} color={colores.titulo} />
          </Pressable>
          <Text style={[estilos.titulo, { fontSize: d.tituloPantalla }]} accessibilityRole="header">
            Panel de Campo
          </Text>
        </View>
        <Text style={estilos.subtitulo}>{textoActualizado('Hoy', k?.actualizado)}</Text>

        {datos?.sinConexion && (
          <View style={{ marginBottom: 10 }}>
            <Aviso mensaje={`Sin conexión: se muestra lo último guardado (${horaRespaldo(datos.guardadoEn)}).`} />
          </View>
        )}

        {cargando ? (
          <ActivityIndicator color={colores.primario} style={{ marginTop: 40 }} />
        ) : error || !panel || !k ? (
          <Aviso tipo="error" mensaje={error ?? 'No se pudo cargar el panel.'} />
        ) : (
          <>
            <View style={estilos.kpis} testID="kpis-panel">
              <Kpi valor={k.enRuta} texto="En ruta" color={colores.primario} />
              <Kpi valor={k.ejecucion} texto="Ejecución" color={colores.verde} />
              <Kpi valor={k.demora} texto="Demora" color={colores.naranja} />
              <Kpi valor={k.incidencia} texto="Incidencia" color={colores.rojo} />
              <Kpi valor={k.finalizados} texto="Finaliz." color={colores.textoSecundario} />
            </View>

            <View style={{ marginTop: 14 }}>
              <MapaEsquematico pines={pines} alto={300} vacio="Aún no hay posiciones GPS de tus técnicos hoy." />
            </View>
            <View style={estilos.leyenda}>
              {LEYENDA_MAPA.map((l) => (
                <View key={l.texto} style={estilos.leyendaItem}>
                  <View style={[estilos.punto, { backgroundColor: l.color }]} />
                  <Text style={estilos.leyendaTexto}>{l.texto}</Text>
                </View>
              ))}
            </View>
            <Text style={estilos.nota}>
              Mapa esquemático: los pines muestran quién está dónde respecto a los demás.
              {sinUbicacion > 0 ? ` ${sinUbicacion} ${sinUbicacion === 1 ? 'técnico aún no envía' : 'técnicos aún no envían'} su ubicación hoy.` : ''} Toca un pin para ver su servicio.
            </Text>

            <Text style={estilos.seccion}>ALERTAS CRÍTICAS</Text>
            {panel.alertas.length === 0 ? (
              <View style={estilos.vacioTarjeta}>
                <Ionicons name="checkmark-circle-outline" size={22} color={colores.verde} />
                <Text style={estilos.vacioTexto}>Sin alertas por ahora.</Text>
              </View>
            ) : (
              panel.alertas.map((a) => {
                const ins = insigniaAlerta(a);
                const critica = a.severidad === 'critica';
                return (
                  <Pressable
                    key={a.clave}
                    onPress={() => abrirServicio(a.idOs)}
                    style={[estilos.alerta, critica && estilos.alertaCritica]}
                    accessibilityRole="button"
                    accessibilityLabel={`${ins.texto}: ${a.numeroOs}`}
                    testID={`alerta-${a.clave}`}
                  >
                    <View style={estilos.alertaCabecera}>
                      <Text style={estilos.alertaTitulo}>
                        {a.numeroOs}
                        {a.cliente ? ` · ${a.cliente}` : ''}
                      </Text>
                      <View style={[estilos.insignia, { backgroundColor: ins.fondo }]}>
                        <Text style={[estilos.insigniaTexto, { color: ins.color }]}>{ins.texto}</Text>
                      </View>
                    </View>
                    {!!lineaTecnicoAlerta(a) && (
                      <View style={estilos.alertaFila}>
                        <Ionicons name="person-outline" size={16} color={colores.textoSecundario} />
                        <Text style={estilos.alertaLinea}>{lineaTecnicoAlerta(a)}</Text>
                      </View>
                    )}
                    <Text style={[estilos.alertaDetalle, critica && { color: colores.error }]}>{lineaDetalleAlerta(a)}</Text>
                  </Pressable>
                );
              })
            )}

            <Pressable onPress={() => router.push('/servicios-activos')} style={estilos.verLista} accessibilityRole="button" testID="ver-servicios-activos">
              <Ionicons name="list-outline" size={22} color={colores.blanco} />
              <Text style={estilos.verListaTexto}>Ver servicios activos</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Kpi({ valor, texto, color }: { valor: number; texto: string; color: string }) {
  return (
    <View style={estilos.kpi}>
      <Text style={[estilos.kpiValor, { color }]}>{valor}</Text>
      <Text style={estilos.kpiTexto}>{texto}</Text>
    </View>
  );
}

const estilos = StyleSheet.create({
  area: { flex: 1, backgroundColor: colores.fondo },
  contenido: { paddingTop: 18, paddingBottom: 28, width: '100%', alignSelf: 'center' },
  tituloFila: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 2 },
  titulo: { fontWeight: '800', color: colores.titulo, flexShrink: 1 },
  subtitulo: { color: colores.textoSecundario, fontSize: 15, marginBottom: 12 },
  kpis: { flexDirection: 'row', gap: 8 },
  kpi: { flex: 1, backgroundColor: colores.blanco, borderWidth: 1, borderColor: colores.bordeSuave, borderRadius: 14, paddingVertical: 10, alignItems: 'center' },
  kpiValor: { fontSize: 26, fontWeight: '800' },
  kpiTexto: { fontSize: 11.5, color: colores.textoSecundario, marginTop: 1 },
  leyenda: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 10 },
  leyendaItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  punto: { width: 12, height: 12, borderRadius: 6 },
  leyendaTexto: { fontSize: 14.5, color: colores.texto },
  nota: { fontSize: 13, color: colores.textoSecundario, marginTop: 8, lineHeight: 18 },
  seccion: { fontSize: 14, fontWeight: '800', letterSpacing: 1.2, color: colores.textoSecundario, marginTop: 22, marginBottom: 10 },
  alerta: { backgroundColor: colores.blanco, borderWidth: 1, borderColor: colores.bordeSuave, borderRadius: radios.tarjeta, padding: 14, marginBottom: 10 },
  alertaCritica: { backgroundColor: '#FEF2F2', borderColor: '#FCA5A5' },
  alertaCabecera: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', justifyContent: 'space-between' },
  alertaTitulo: { flex: 1, fontSize: 17, fontWeight: '800', color: colores.titulo, lineHeight: 23 },
  insignia: { borderRadius: 8, paddingHorizontal: 9, paddingVertical: 4 },
  insigniaTexto: { fontSize: 11.5, fontWeight: '800', letterSpacing: 0.3 },
  alertaFila: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  alertaLinea: { fontSize: 15, color: colores.textoSecundario },
  alertaDetalle: { fontSize: 15, color: colores.textoSecundario, marginTop: 6, lineHeight: 21 },
  vacioTarjeta: { flexDirection: 'row', gap: 8, alignItems: 'center', backgroundColor: colores.verdeFondo, borderWidth: 1, borderColor: colores.verdeBorde, borderRadius: radios.tarjeta, padding: 14 },
  vacioTexto: { color: colores.texto, fontSize: 15.5 },
  verLista: { marginTop: 8, minHeight: 54, borderRadius: radios.boton, backgroundColor: colores.primario, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' },
  verListaTexto: { color: colores.blanco, fontSize: 17.5, fontWeight: '700' },
});
