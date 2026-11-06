import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { obtenerAprobaciones, type Aprobacion, type TipoAprobacion } from '@/api/aprobaciones';
import { nombreDeCodigo, obtenerCatalogo } from '@/api/catalogos';
import { Aviso } from '@/componentes/Aviso';
import { EncabezadoApp } from '@/componentes/EncabezadoApp';
import { Chips } from '@/componentes/ViaticosUI';
import { useConsulta } from '@/hooks/useConsulta';
import { useDiseno } from '@/hooks/useDiseno';
import { useSesion } from '@/sesion/SesionContext';
import { colores, radios } from '@/tema/colores';
import { etiquetaTipo, filtrarAprobaciones, haceTexto, separarUrgentes, type FiltroAprobaciones } from '@/utilidades/aprobaciones';

/**
 * HU-31 — Centro de aprobaciones del Jefe de Servicio Técnico / Jefe de Metrología.
 *  - Una sola bandeja con todo lo que espera su decisión, con las urgentes primero (el servicio es de hoy).
 *  - Hoy reúne las solicitudes de salida de los técnicos (HU-04); las evidencias forzadas, los ensayos con error y los gastos
 *    aparecen aquí cuando existan sus módulos (los filtros salen de lo que envía el back).
 *  - Solo ve las de su área según la RQ. Tocar una abre la solicitud con el checklist del técnico y su motivo.
 * Se abre desde la pestaña "Aprobaciones" o la tarjeta del menú de Jefatura.
 */
const icono: Record<TipoAprobacion, keyof typeof Ionicons.glyphMap> = {
  salida: 'hand-left-outline',
  evidencia: 'camera-outline',
  ensayo: 'speedometer-outline',
  gasto: 'receipt-outline',
};

export default function PantallaAprobaciones() {
  const { sesion } = useSesion();
  const usuario = sesion?.usuario;
  const d = useDiseno();
  const [filtro, setFiltro] = useState<FiltroAprobaciones>('todas');

  const { datos, cargando, recargando, error, recargar } = useConsulta(async (token) => {
    const [bandeja, cargos] = await Promise.all([obtenerAprobaciones(token), obtenerCatalogo(token, 'CARGO_USUARIO').catch(() => null)]);
    return { bandeja, cargos };
  });

  // Al volver de decidir una solicitud, se relee la bandeja (la decidida ya no está).
  const primeraVez = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (primeraVez.current) {
        primeraVez.current = false;
        return;
      }
      void recargar();
    }, [recargar]),
  );

  const cargo = nombreDeCodigo(datos?.cargos, usuario?.cargo) ?? usuario?.cargo ?? 'Jefe de Área';
  const bandeja = datos?.bandeja ?? null;
  const items: Aprobacion[] = useMemo(() => filtrarAprobaciones(bandeja?.items ?? [], filtro), [bandeja, filtro]);
  const { urgentes, pendientes } = useMemo(() => separarUrgentes(items), [items]);

  const opciones = [
    { id: 'todas' as FiltroAprobaciones, texto: 'Todas', cantidad: bandeja?.total ?? 0 },
    ...(bandeja?.tipos ?? []).map((t) => ({ id: t.tipo as FiltroAprobaciones, texto: etiquetaTipo[t.tipo]?.plural ?? t.tipo, cantidad: t.cantidad })),
  ];

  return (
    <SafeAreaView style={estilos.area} edges={['top']}>
      <EncabezadoApp nombre={usuario?.nombre ?? ''} apellido={usuario?.apellido} subtitulo={`${usuario?.nombre ?? ''} · ${cargo}`} />

      <ScrollView
        contentContainerStyle={[estilos.contenido, { paddingHorizontal: d.margen, maxWidth: d.anchoMaximo }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={recargando} onRefresh={recargar} colors={[colores.primario]} />}
      >
        <Text style={[estilos.titulo, { fontSize: d.tituloPantalla }]} accessibilityRole="header">
          Aprobaciones
        </Text>
        <Text style={estilos.subtitulo}>Todo lo que espera tu decisión</Text>

        {cargando ? (
          <ActivityIndicator color={colores.primario} style={{ marginTop: 32 }} />
        ) : error || !bandeja ? (
          <Aviso tipo="error" mensaje={error ?? 'No se pudieron cargar las aprobaciones.'} />
        ) : (
          <>
            {opciones.length > 1 && <Chips opciones={opciones} activo={filtro} onCambiar={setFiltro} />}

            {items.length === 0 ? (
              <View style={estilos.vacio}>
                <Ionicons name="checkmark-done-circle-outline" size={44} color={colores.textoTenue} />
                <Text style={estilos.vacioTitulo}>No tienes nada pendiente</Text>
                <Text style={estilos.vacioTexto}>Cuando un técnico de tu área pida tu visto bueno, aparecerá aquí.</Text>
              </View>
            ) : (
              <>
                {urgentes.length > 0 && (
                  <Grupo titulo="URGENTES">
                    {urgentes.map((a) => (
                      <Tarjeta key={`${a.tipo}-${a.id}`} aprobacion={a} urgente />
                    ))}
                  </Grupo>
                )}
                {pendientes.length > 0 && (
                  <Grupo titulo="PENDIENTES">
                    {pendientes.map((a) => (
                      <Tarjeta key={`${a.tipo}-${a.id}`} aprobacion={a} />
                    ))}
                  </Grupo>
                )}
              </>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Grupo({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <View style={{ marginTop: 6, marginBottom: 14, gap: 10 }}>
      <Text style={estilos.grupo}>{titulo}</Text>
      {children}
    </View>
  );
}

function Tarjeta({ aprobacion: a, urgente = false }: { aprobacion: Aprobacion; urgente?: boolean }) {
  const quien = [a.numeroOs, a.tecnico].filter(Boolean).join(' · ');
  const sub = [a.cliente, a.detalle].filter(Boolean).join(' · ');
  return (
    <Pressable
      onPress={() => {
        // Hoy solo existen las solicitudes de salida; las demás se abrirán con su propio detalle.
        if (a.tipo === 'salida') router.push({ pathname: '/aprobacion-salida', params: { id: String(a.id) } });
      }}
      accessibilityRole="button"
      accessibilityLabel={`${etiquetaTipo[a.tipo]?.kicker ?? a.titulo}, ${quien}`}
      style={({ pressed }) => [estilos.tarjeta, urgente && estilos.tarjetaUrgente, pressed && { opacity: 0.75 }]}
      testID={`aprobacion-${a.tipo}-${a.id}`}
    >
      <View style={[estilos.icono, urgente && { backgroundColor: '#FFEDD5' }]}>
        <Ionicons name={icono[a.tipo] ?? 'document-outline'} size={22} color={urgente ? colores.naranja : colores.primario} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <View style={estilos.fila}>
          <Text style={estilos.kicker} numberOfLines={1}>
            {etiquetaTipo[a.tipo]?.kicker ?? a.titulo.toUpperCase()}
          </Text>
          <Text style={estilos.hace}>{haceTexto(a.solicitadaEn)}</Text>
        </View>
        <Text style={estilos.quien} numberOfLines={2}>
          {quien}
        </Text>
        {!!sub && (
          <Text style={estilos.sub} numberOfLines={2}>
            {sub}
          </Text>
        )}
      </View>
      <Ionicons name="chevron-forward" size={18} color={colores.textoTenue} />
    </Pressable>
  );
}

const estilos = StyleSheet.create({
  area: { flex: 1, backgroundColor: colores.fondo },
  contenido: { padding: 16, paddingBottom: 28, maxWidth: 560, width: '100%', alignSelf: 'center' },
  titulo: { fontSize: 26, fontWeight: '700', color: colores.titulo, marginTop: 4 },
  subtitulo: { fontSize: 14, color: colores.textoSecundario, marginTop: 4, marginBottom: 6 },
  grupo: { fontSize: 12.5, fontWeight: '700', letterSpacing: 1.4, color: colores.textoSecundario },
  tarjeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colores.tarjeta,
    borderRadius: radios.tarjeta,
    borderWidth: 1,
    borderColor: colores.bordeSuave,
    padding: 14,
  },
  tarjetaUrgente: { backgroundColor: '#FFF7ED', borderColor: '#FED7AA' },
  icono: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colores.primarioSuave },
  fila: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  kicker: { flex: 1, fontSize: 10.5, fontWeight: '800', letterSpacing: 0.6, color: colores.textoSecundario },
  hace: { fontSize: 11.5, color: colores.textoSecundario },
  quien: { fontSize: 15.5, fontWeight: '800', color: colores.titulo, lineHeight: 20 },
  sub: { fontSize: 12.5, lineHeight: 17, color: colores.textoSecundario },
  vacio: { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 20 },
  vacioTitulo: { fontSize: 17, fontWeight: '700', color: colores.titulo, marginTop: 12 },
  vacioTexto: { fontSize: 14, color: colores.textoSecundario, textAlign: 'center', marginTop: 6, lineHeight: 20 },
});
