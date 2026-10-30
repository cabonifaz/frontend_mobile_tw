import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { nombreDeCodigo, obtenerCatalogo } from '@/api/catalogos';
import { obtenerNotificaciones, type Notificacion, type TipoNotificacion } from '@/api/notificaciones';
import { Aviso } from '@/componentes/Aviso';
import { EncabezadoApp } from '@/componentes/EncabezadoApp';
import { useConsulta } from '@/hooks/useConsulta';
import { useDiseno } from '@/hooks/useDiseno';
import { useSesion } from '@/sesion/SesionContext';
import { colores, radios } from '@/tema/colores';

/**
 * Pestaña Notificaciones (HU-02): avisos del técnico agrupados por día (Hoy, Ayer, fecha),
 * filtro Todas / No leídas, punto azul en las no leídas. Al tocar una, queda como leída.
 */
type IconoIon = 'checkmark-circle' | 'ribbon-outline' | 'receipt-outline' | 'calendar-outline' | 'alert-circle-outline' | 'notifications-outline';
const iconos: Record<TipoNotificacion, { nombre: IconoIon; color: string }> = {
  autorizacion: { nombre: 'checkmark-circle', color: colores.verde },
  correlativo: { nombre: 'ribbon-outline', color: colores.primario },
  gasto_aprobado: { nombre: 'receipt-outline', color: colores.verde },
  gasto_observado: { nombre: 'alert-circle-outline', color: colores.naranja },
  servicio: { nombre: 'calendar-outline', color: colores.primario },
  general: { nombre: 'notifications-outline', color: colores.primario },
};

function claveDia(iso: string): string {
  return iso.slice(0, 10);
}
function etiquetaDia(clave: string): string {
  const hoy = new Date();
  const f = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const ayer = new Date(hoy);
  ayer.setDate(hoy.getDate() - 1);
  if (clave === f(hoy)) return 'HOY';
  if (clave === f(ayer)) return 'AYER';
  const [a, m, d] = clave.split('-');
  return `${d}/${m}/${a}`;
}

export default function PantallaNotificaciones() {
  const { sesion } = useSesion();
  const usuario = sesion?.usuario;
  const d = useDiseno();
  const [filtro, setFiltro] = useState<'todas' | 'no-leidas'>('todas');
  const [leidas, setLeidas] = useState<Set<number>>(new Set());

  const { datos, cargando, recargando, error, recargar } = useConsulta(async (token) => {
    const [lista, cargos] = await Promise.all([obtenerNotificaciones(token), obtenerCatalogo(token, 'CARGO_USUARIO')]);
    return { lista, cargos };
  });
  const cargo = nombreDeCodigo(datos?.cargos, usuario?.cargo) ?? usuario?.cargo ?? 'Técnico de Campo';

  const lista = useMemo(
    () => (datos?.lista ?? []).map((n) => (leidas.has(n.id) ? { ...n, leida: true } : n)),
    [datos, leidas],
  );
  const noLeidas = lista.filter((n) => !n.leida).length;
  const visibles = filtro === 'todas' ? lista : lista.filter((n) => !n.leida);

  // Agrupa por día, del más reciente al más antiguo
  const grupos = useMemo(() => {
    const mapa = new Map<string, Notificacion[]>();
    [...visibles].sort((a, b) => b.fecha.localeCompare(a.fecha)).forEach((n) => {
      const k = claveDia(n.fecha);
      mapa.set(k, [...(mapa.get(k) ?? []), n]);
    });
    return [...mapa.entries()];
  }, [visibles]);

  return (
    <SafeAreaView style={estilos.area} edges={['top']}>
      <EncabezadoApp nombre={usuario?.nombre ?? ''} apellido={usuario?.apellido} subtitulo={`${usuario?.nombre ?? ''} · ${cargo}`} />
      <ScrollView
        contentContainerStyle={[estilos.contenido, { paddingHorizontal: d.margen, maxWidth: d.tablet ? 560 : 480 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={recargando} onRefresh={recargar} colors={[colores.primario]} />}
      >
        <Text style={estilos.titulo} accessibilityRole="header">
          Notificaciones
        </Text>

        <View style={estilos.filtros}>
          <Chip texto="Todas" activo={filtro === 'todas'} onPress={() => setFiltro('todas')} />
          <Chip texto={`No leídas (${noLeidas})`} activo={filtro === 'no-leidas'} onPress={() => setFiltro('no-leidas')} />
        </View>

        {cargando ? (
          <ActivityIndicator color={colores.primario} style={{ marginTop: 32 }} />
        ) : error ? (
          <Aviso tipo="error" mensaje={`No se pudieron cargar las notificaciones. ${error}`} />
        ) : grupos.length === 0 ? (
          <View style={estilos.vacio}>
            <View style={estilos.circulo}>
              <Ionicons name="notifications-outline" size={32} color={colores.primario} />
            </View>
            <Text style={estilos.vacioTitulo}>{filtro === 'todas' ? 'Aún no tienes notificaciones' : 'No tienes notificaciones sin leer'}</Text>
            <Text style={estilos.vacioTexto}>Aquí verás los avisos de tus servicios, autorizaciones, correlativos y gastos.</Text>
          </View>
        ) : (
          grupos.map(([clave, items]) => (
            <View key={clave}>
              <Text style={estilos.seccion}>{etiquetaDia(clave)}</Text>
              <View style={estilos.tarjeta}>
                {items.map((n, i) => (
                  <Pressable
                    key={n.id}
                    onPress={() => setLeidas((p) => new Set(p).add(n.id))}
                    accessibilityRole="button"
                    accessibilityLabel={`${n.leida ? '' : 'No leída. '}${n.titulo}. ${n.cuerpo}`}
                    style={({ pressed }) => [estilos.fila, i > 0 && estilos.filaBorde, pressed && { opacity: 0.7 }]}
                  >
                    <Ionicons name={iconos[n.tipo].nombre} size={24} color={iconos[n.tipo].color} style={{ marginTop: 1 }} />
                    <View style={{ flex: 1 }}>
                      <Text style={[estilos.filaTitulo, !n.leida && estilos.filaTituloNoLeida]}>{n.titulo}</Text>
                      <Text style={estilos.filaCuerpo}>{n.cuerpo}</Text>
                      <Text style={estilos.filaHora}>{n.fecha.slice(11, 16)}</Text>
                    </View>
                    {!n.leida && <View style={estilos.punto} />}
                  </Pressable>
                ))}
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Chip({ texto, activo, onPress }: { texto: string; activo: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: activo }}
      style={[estilos.chip, activo && estilos.chipActivo]}
    >
      <Text style={[estilos.chipTexto, activo && estilos.chipTextoActivo]}>{texto}</Text>
    </Pressable>
  );
}

const estilos = StyleSheet.create({
  area: { flex: 1, backgroundColor: colores.fondo },
  contenido: { padding: 20, paddingBottom: 28, width: '100%', alignSelf: 'center' },
  titulo: { fontSize: 26, fontWeight: '700', color: colores.titulo, marginBottom: 12 },
  filtros: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  chip: { borderWidth: 1, borderColor: colores.borde, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 7, backgroundColor: colores.tarjeta },
  chipActivo: { backgroundColor: colores.primario, borderColor: colores.primario },
  chipTexto: { fontSize: 14, color: colores.texto },
  chipTextoActivo: { color: colores.blanco, fontWeight: '600' },
  seccion: { fontSize: 13, fontWeight: '700', letterSpacing: 1.2, color: colores.textoSecundario, marginTop: 16, marginBottom: 8 },
  tarjeta: { backgroundColor: colores.tarjeta, borderRadius: radios.tarjeta, borderWidth: 1, borderColor: colores.bordeSuave, paddingHorizontal: 16 },
  fila: { flexDirection: 'row', gap: 14, paddingVertical: 14 },
  filaBorde: { borderTopWidth: 1, borderTopColor: '#EEF2F7' },
  filaTitulo: { fontSize: 15, color: colores.titulo },
  filaTituloNoLeida: { fontWeight: '700' },
  filaCuerpo: { fontSize: 13.5, color: colores.textoSecundario, marginTop: 2, lineHeight: 19 },
  filaHora: { fontSize: 12.5, color: colores.textoTenue, marginTop: 4 },
  punto: { width: 9, height: 9, borderRadius: 5, backgroundColor: colores.primario, marginTop: 6 },
  vacio: { alignItems: 'center', marginTop: 40, paddingHorizontal: 16 },
  circulo: { width: 72, height: 72, borderRadius: 36, backgroundColor: colores.primarioSuave, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  vacioTitulo: { fontSize: 17, fontWeight: '700', color: colores.titulo, textAlign: 'center' },
  vacioTexto: { fontSize: 14, color: colores.textoSecundario, textAlign: 'center', marginTop: 6, lineHeight: 20 },
});
