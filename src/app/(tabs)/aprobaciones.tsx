import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { obtenerAprobaciones, type Aprobacion, type TipoAprobacion } from '@/api/aprobaciones';
import { nombreDeCodigo, obtenerCatalogo } from '@/api/catalogos';
import { guardarMarcaAprobaciones, leerMarcaAprobaciones } from '@/almacen/aprobacionesLeidas';
import { marcarNotificacionLeida, obtenerNotificaciones } from '@/api/notificaciones';
import { Aviso } from '@/componentes/Aviso';
import { EncabezadoApp } from '@/componentes/EncabezadoApp';
import { Chips } from '@/componentes/ViaticosUI';
import { useConsulta } from '@/hooks/useConsulta';
import { useDiseno } from '@/hooks/useDiseno';
import { useSesion } from '@/sesion/SesionContext';
import { colores, radios } from '@/tema/colores';
import { esAvisoDeAprobacion } from '@/utilidades/notificaciones';
import { etiquetaTipo, filtrarAprobaciones, haceTexto, marcaDeLectura, separarUrgentes, sinLeer, type FiltroAprobaciones } from '@/utilidades/aprobaciones';

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
  llegada: 'navigate-circle-outline',
  evidencia: 'camera-outline',
  ensayo: 'speedometer-outline',
  gasto: 'receipt-outline',
};

export default function PantallaAprobaciones() {
  const { sesion } = useSesion();
  const usuario = sesion?.usuario;
  const d = useDiseno();
  const [filtro, setFiltro] = useState<FiltroAprobaciones>('todas');
  const [leyendo, setLeyendo] = useState(false);
  const [verLeidas, setVerLeidas] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const { datos, cargando, recargando, error, recargar } = useConsulta(async (token) => {
    const [bandeja, cargos, marca] = await Promise.all([
      obtenerAprobaciones(token),
      obtenerCatalogo(token, 'CARGO_USUARIO').catch(() => null),
      usuario ? leerMarcaAprobaciones(usuario.idUsuario) : Promise.resolve(null),
    ]);
    return { bandeja, cargos, marca };
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
  const marca = datos?.marca ?? null;
  // «Leer todo» saca de la bandeja lo pedido hasta la marca; «Ver leídas» las vuelve a mostrar
  const visibles: Aprobacion[] = useMemo(() => (verLeidas ? (bandeja?.items ?? []) : sinLeer(bandeja?.items ?? [], marca)), [bandeja, marca, verLeidas]);
  const ocultas = (bandeja?.items.length ?? 0) - sinLeer(bandeja?.items ?? [], marca).length;
  const items: Aprobacion[] = useMemo(() => filtrarAprobaciones(visibles, filtro), [visibles, filtro]);
  const { urgentes, pendientes } = useMemo(() => separarUrgentes(items), [items]);

  // «Leer todo»: marca como leídos los avisos de aprobaciones (salidas, llegadas forzadas, ensayos con error, evidencias forzadas, equipos nuevos).
  // Las aprobaciones siguen pendientes hasta que el jefe las decide.
  async function leerTodo() {
    const token = sesion?.token;
    if (!token || leyendo) return;
    setLeyendo(true);
    setAviso(null);
    try {
      const pendientes = (await obtenerNotificaciones(token)).filter((n) => !n.leida && esAvisoDeAprobacion(n.tipo));
      await Promise.all(pendientes.map((n) => marcarNotificacionLeida(token, n.id).catch(() => undefined)));
      // La bandeja queda limpia: se guarda la marca y se relee (el globo de la pestaña se actualiza solo)
      const total = bandeja?.items ?? [];
      if (usuario && total.length > 0) await guardarMarcaAprobaciones(usuario.idUsuario, marcaDeLectura(total));
      setVerLeidas(false);
      setFiltro('todas');
      await recargar();
      setAviso(total.length === 0 && pendientes.length === 0 ? 'No tienes aprobaciones ni avisos sin leer.' : 'Bandeja limpia. Las aprobaciones siguen pendientes hasta que las decidas: puedes verlas en «Ver leídas».');
    } catch {
      setAviso('No se pudieron marcar los avisos. Inténtalo de nuevo.');
    } finally {
      setLeyendo(false);
    }
  }

  const opciones = [
    { id: 'todas' as FiltroAprobaciones, texto: 'Todas', cantidad: visibles.length },
    ...(bandeja?.tipos ?? [])
      .map((t) => ({ id: t.tipo as FiltroAprobaciones, texto: etiquetaTipo[t.tipo]?.plural ?? t.tipo, cantidad: visibles.filter((v) => v.tipo === t.tipo).length }))
      .filter((o) => o.cantidad > 0),
  ];

  return (
    <SafeAreaView style={estilos.area} edges={['top']}>
      <EncabezadoApp nombre={usuario?.nombre ?? ''} apellido={usuario?.apellido} subtitulo={`${usuario?.nombre ?? ''} · ${cargo}`} />

      <ScrollView
        contentContainerStyle={[estilos.contenido, { paddingHorizontal: d.margen, maxWidth: d.anchoMaximo }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={recargando} onRefresh={recargar} colors={[colores.primario]} />}
      >
        <View style={estilos.tituloFila}>
          <Text style={[estilos.titulo, { fontSize: d.tituloPantalla, flex: 1 }]} accessibilityRole="header">
            Aprobaciones
          </Text>
          <Pressable onPress={() => void leerTodo()} disabled={leyendo} accessibilityRole="button" accessibilityLabel="Leer todo" style={[estilos.leerTodo, leyendo && { opacity: 0.6 }]} testID="aprobaciones-leer-todo">
            {leyendo ? <ActivityIndicator size="small" color={colores.primario} /> : <Ionicons name="checkmark-done" size={18} color={colores.primario} />}
            <Text style={estilos.leerTodoTexto}>Leer todo</Text>
          </Pressable>
        </View>
        <Text style={estilos.subtitulo}>Todo lo que espera tu decisión</Text>
        {!!aviso && (
          <View style={{ marginBottom: 8 }} testID="aprobaciones-aviso">
            <Aviso tipo="info" mensaje={aviso} />
          </View>
        )}

        {cargando ? (
          <ActivityIndicator color={colores.primario} style={{ marginTop: 32 }} />
        ) : error || !bandeja ? (
          <Aviso tipo="error" mensaje={error ?? 'No se pudieron cargar las aprobaciones.'} />
        ) : (
          <>
            {opciones.length > 1 && <Chips opciones={opciones} activo={filtro} onCambiar={setFiltro} />}
            {ocultas > 0 && (
              <Pressable onPress={() => setVerLeidas((v) => !v)} accessibilityRole="button" hitSlop={8} style={estilos.verLeidas} testID="aprobaciones-ver-leidas">
                <Ionicons name={verLeidas ? 'eye-off-outline' : 'eye-outline'} size={16} color={colores.primario} />
                <Text style={estilos.verLeidasTexto}>{verLeidas ? 'Ocultar leídas' : `Ver leídas (${ocultas})`}</Text>
              </Pressable>
            )}

            {items.length === 0 ? (
              <View style={estilos.vacio}>
                <Ionicons name="checkmark-done-circle-outline" size={44} color={colores.textoTenue} />
                <Text style={estilos.vacioTitulo}>{ocultas > 0 ? 'Bandeja limpia' : 'No tienes nada pendiente'}</Text>
                <Text style={estilos.vacioTexto}>Cuando un técnico de tu área pida tu visto bueno o una llegada forzada, aparecerá aquí.</Text>
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
        // Salidas (HU-04) y llegadas forzadas (HU-06) se resuelven por OS; evidencias, ensayos y gastos (HU-31) por su propio id.
        if (a.tipo === 'salida') router.push({ pathname: '/aprobacion-salida', params: { id: String(a.id) } });
        else if (a.tipo === 'llegada') router.push({ pathname: '/aprobacion-llegada', params: { id: String(a.id) } });
        else router.push({ pathname: '/aprobacion-detalle', params: { tipo: a.tipo, id: String(a.id) } });
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
  tituloFila: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  leerTodo: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, marginTop: 4, borderRadius: 18, borderWidth: 1, borderColor: colores.primario, backgroundColor: colores.blanco },
  leerTodoTexto: { fontSize: 13.5, fontWeight: '700', color: colores.primario },
  verLeidas: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingVertical: 8 },
  verLeidasTexto: { fontSize: 13.5, fontWeight: '700', color: colores.primario },
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
