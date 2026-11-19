import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { nombreDeCodigo, obtenerCatalogo } from '@/api/catalogos';
import { obtenerEquipo } from '@/api/equipoJefatura';
import { Aviso } from '@/componentes/Aviso';
import { EncabezadoApp } from '@/componentes/EncabezadoApp';
import { useConsulta } from '@/hooks/useConsulta';
import { useDiseno } from '@/hooks/useDiseno';
import { useRefrescoAutomatico } from '@/hooks/useRefrescoAutomatico';
import { useSesion } from '@/sesion/SesionContext';
import { colores, radios } from '@/tema/colores';
import { etiquetaEquipo } from '@/utilidades/equipoJefatura';

/**
 * HU-36 — Mi equipo (Jefe de Área): la asistencia de hoy de cada técnico según el Reloj Marcador (en labores · refrigerio · tardanza · sin marcar), su servicio actual
 * (OS u OM) y dónde está. Toca un técnico para ver su ficha: marcaciones del día, SSOMA, carga de la semana, horas contabilizadas y llamarlo.
 * Quién aparece lo decide el back (las áreas que ven todo y los Administradores, todos los técnicos; el Supervisor de Servicio Técnico / Metrología, los de su área).
 */
export default function PantallaEquipo() {
  const { sesion } = useSesion();
  const usuario = sesion?.usuario;
  const d = useDiseno();

  const { datos, cargando, recargando, error, recargar } = useConsulta(async (token) => {
    const [r, cargos] = await Promise.all([obtenerEquipo(token), obtenerCatalogo(token, 'CARGO_USUARIO').catch(() => undefined)]);
    return { ...r, cargos };
  }, '');
  useRefrescoAutomatico(recargar, datos?.kpis.refrescoSegundos ?? 30);

  const cargo = nombreDeCodigo(datos?.cargos, usuario?.cargo) ?? usuario?.cargo ?? 'Jefe de Área';
  const k = datos?.kpis;

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
            Mi equipo
          </Text>
        </View>
        <Text style={estilos.subtitulo}>Asistencia y ubicación{k?.actualizado ? ` · actualizado ${k.actualizado}` : ''}</Text>

        <View style={estilos.kpis} testID="equipo-kpis">
          <Kpi valor={k?.enLabores} texto="En labores" color="#16A34A" />
          <Kpi valor={k?.refrigerio} texto="Refrigerio" color="#2563EB" />
          <Kpi valor={k?.tardanza} texto="Tardanza" color="#EA580C" />
          <Kpi valor={k?.sinMarcar} texto="Sin marcar" color="#DC2626" />
        </View>

        <Text style={estilos.seccion}>TÉCNICOS · HOY</Text>
        {cargando ? (
          <ActivityIndicator color={colores.primario} style={{ marginTop: 30 }} />
        ) : error ? (
          <Aviso tipo="error" mensaje={error} />
        ) : !datos || datos.tecnicos.length === 0 ? (
          <Text style={estilos.vacio} testID="equipo-vacio">
            No hay técnicos en tu equipo.
          </Text>
        ) : (
          <View style={{ gap: 10 }}>
            {datos.tecnicos.map((t) => {
              const et = etiquetaEquipo(t.estado);
              const servicio = t.numeroOs ? [t.numeroOs, t.lugar].filter(Boolean).join(' · ') : null;
              return (
                <Pressable
                  key={t.idUsuario}
                  onPress={() => router.push({ pathname: '/equipo-tecnico', params: { id: String(t.idUsuario) } })}
                  style={estilos.tarjeta}
                  accessibilityRole="button"
                  accessibilityLabel={`Ficha de ${t.nombre}`}
                  testID={`equipo-tecnico-${t.idUsuario}`}
                >
                  <View style={[estilos.avatar, { backgroundColor: et.avatar }]}>
                    <Text style={estilos.avatarTexto}>{t.iniciales}</Text>
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <View style={estilos.cabecera}>
                      <Text style={estilos.nombre} numberOfLines={1}>
                        {t.nombre}
                      </Text>
                      <View style={[estilos.badge, { backgroundColor: et.fondo }]}>
                        <Text style={[estilos.badgeTexto, { color: et.color }]}>{et.texto}</Text>
                      </View>
                    </View>
                    <Text style={estilos.detalle} numberOfLines={2}>
                      {t.detalle}
                    </Text>
                    <View style={estilos.servicio}>
                      <Ionicons name="location-outline" size={14} color={colores.textoSecundario} />
                      <Text style={estilos.servicioTexto} numberOfLines={2}>
                        {servicio ? `${servicio}${t.estadoServicio ? ` · ${textoEstadoServicio(t.estadoServicio)}` : ''}` : `Sin servicio${t.motivoSinServicio ? ` · ${t.motivoSinServicio}` : ''}`}
                      </Text>
                    </View>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colores.textoSecundario} />
                </Pressable>
              );
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const ESTADOS_SERVICIO: Record<string, string> = {
  sin_salir: 'sin salir',
  en_ruta: 'en ruta',
  en_planta: 'en planta',
  en_ejecucion: 'en ejecución',
  con_demora: 'con demora',
  con_incidente: 'con incidente',
  finalizado: 'finalizado',
};
const textoEstadoServicio = (e: string): string => ESTADOS_SERVICIO[e] ?? e;

function Kpi({ valor, texto, color }: { valor: number | undefined; texto: string; color: string }) {
  return (
    <View style={estilos.kpi}>
      <Text style={[estilos.kpiValor, { color: valor ? color : colores.titulo }]}>{valor ?? '—'}</Text>
      <Text style={estilos.kpiTexto} numberOfLines={1}>
        {texto}
      </Text>
    </View>
  );
}

const estilos = StyleSheet.create({
  area: { flex: 1, backgroundColor: colores.fondo },
  contenido: { paddingTop: 18, paddingBottom: 28, width: '100%', alignSelf: 'center' },
  tituloFila: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 2 },
  titulo: { fontWeight: '800', color: colores.titulo, flexShrink: 1 },
  subtitulo: { color: colores.textoSecundario, fontSize: 14.5, marginBottom: 14 },
  kpis: { flexDirection: 'row', gap: 8 },
  kpi: { flex: 1, backgroundColor: colores.blanco, borderWidth: 1, borderColor: colores.bordeSuave, borderRadius: 14, paddingVertical: 11, alignItems: 'center' },
  kpiValor: { fontSize: 24, fontWeight: '800' },
  kpiTexto: { fontSize: 11.5, color: colores.textoSecundario, marginTop: 1 },
  seccion: { fontSize: 13, fontWeight: '800', letterSpacing: 1.2, color: colores.textoSecundario, marginTop: 20, marginBottom: 10 },
  vacio: { textAlign: 'center', color: colores.textoSecundario, fontSize: 15, marginTop: 24 },
  tarjeta: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colores.blanco, borderWidth: 1, borderColor: colores.bordeSuave, borderRadius: radios.tarjeta, padding: 12 },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  avatarTexto: { color: colores.blanco, fontWeight: '800', fontSize: 14 },
  cabecera: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  nombre: { flex: 1, fontSize: 15.5, fontWeight: '800', color: colores.titulo },
  badge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  badgeTexto: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.3 },
  detalle: { fontSize: 13, color: colores.textoSecundario },
  servicio: { flexDirection: 'row', alignItems: 'flex-start', gap: 4 },
  servicioTexto: { flex: 1, fontSize: 12.5, color: colores.textoSecundario },
});
