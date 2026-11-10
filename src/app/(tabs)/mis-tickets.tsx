import { useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { nombreDeCodigo, obtenerCatalogo } from '@/api/catalogos';
import { obtenerTicketsConRespaldo, type FiltroTickets, type TicketCorrelativo } from '@/api/correlativos';
import { horaRespaldo } from '@/api/respaldo';
import { Aviso } from '@/componentes/Aviso';
import { Boton } from '@/componentes/Boton';
import { EncabezadoApp } from '@/componentes/EncabezadoApp';
import { useConsulta } from '@/hooks/useConsulta';
import { useDiseno } from '@/hooks/useDiseno';
import { useRefrescoAutomatico } from '@/hooks/useRefrescoAutomatico';
import { useSesion } from '@/sesion/SesionContext';
import { colores, radios } from '@/tema/colores';
import { AYUDA_USAR, AYUDA_USAR_BLOQUEADO, etiquetaTicket, horaDe, lineaTiempo, ticketParaUsar } from '@/utilidades/correlativos';

const FILTROS: { id: FiltroTickets; texto: string }[] = [
  { id: 'todos', texto: 'Todos' },
  { id: 'pendientes', texto: 'Pendientes' },
  { id: 'asignados', texto: 'Asignados' },
];

/**
 * HU-14 — "Mis tickets": los correlativos que el técnico pidió a Metrología, con filtros Todos / Pendientes / Asignados y cada ticket desplegable con su estado
 * en tiempo real (se actualiza solo cada ~30 s y al deslizar hacia abajo). El ticket asignado muestra el correlativo CC-####-AAAA; "Usar correlativo" se habilita
 * cuando Metrología lo asigna y lleva al modal "Correlativo y certificado" del trabajo en el equipo.
 */
export default function PantallaMisTickets() {
  const { sesion } = useSesion();
  const usuario = sesion?.usuario;
  const d = useDiseno();
  const params = useLocalSearchParams<{ id?: string; equipo?: string; creado?: string }>();
  const idOs = Number(params.id);
  const filtroOs = Number.isInteger(idOs) && idOs > 0 ? idOs : undefined;
  const [filtro, setFiltro] = useState<FiltroTickets>('todos');
  const [abierto, setAbierto] = useState<number | null>(null);

  const { datos, cargando, recargando, error, recargar } = useConsulta(async (token) => {
    const [r, cargos] = await Promise.all([
      obtenerTicketsConRespaldo(token, usuario?.idUsuario ?? 0, filtro, filtroOs),
      obtenerCatalogo(token, 'CARGO_USUARIO').catch(() => undefined),
    ]);
    return { tickets: r.datos, sinConexion: r.sinConexion, guardadoEn: r.guardadoEn, cargos };
  }, `${filtro}|${filtroOs ?? 0}`);
  useRefrescoAutomatico(recargar, 30);

  const cargo = nombreDeCodigo(datos?.cargos, usuario?.cargo) ?? usuario?.cargo ?? 'Técnico de Campo';
  const tickets = datos?.tickets ?? [];
  const usable = ticketParaUsar(tickets);

  function usar(t: TicketCorrelativo) {
    if (!t.idOsEquipo) return;
    router.replace({ pathname: '/trabajo-equipo', params: { id: String(t.idOs), equipo: String(t.idOsEquipo), usar: String(Date.now()) } });
  }

  return (
    <SafeAreaView style={estilos.area} edges={['top']}>
      <EncabezadoApp nombre={usuario?.nombre ?? ''} apellido={usuario?.apellido} subtitulo={`${usuario?.nombre ?? ''} · ${cargo}`} />
      <ScrollView
        contentContainerStyle={[estilos.contenido, { paddingHorizontal: d.margen, maxWidth: d.anchoMaximo }]}
        refreshControl={<RefreshControl refreshing={recargando} onRefresh={() => void recargar()} colors={[colores.primario]} />}
      >
        <View style={estilos.tituloFila}>
          <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Volver">
            <Ionicons name="arrow-back" size={24} color={colores.titulo} />
          </Pressable>
          <Text style={[estilos.titulo, { fontSize: d.tituloPantalla }]} accessibilityRole="header">
            Mis tickets
          </Text>
        </View>
        <Text style={estilos.subtitulo}>Correlativos a Metrología{filtroOs ? ' · de este servicio' : ''}</Text>

        {!!params.creado && (
          <View style={estilos.exito} testID="ticket-creado">
            <Ionicons name="checkmark-circle" size={22} color={colores.verde} />
            <Text style={estilos.exitoTexto}>
              Solicitud enviada · ticket <Text style={{ fontWeight: '800' }}>{params.creado}</Text> creado.
            </Text>
          </View>
        )}
        {datos?.sinConexion && (
          <View style={{ marginBottom: 10 }}>
            <Aviso mensaje={`Sin conexión: se muestra lo último guardado (${horaRespaldo(datos.guardadoEn)}).`} />
          </View>
        )}

        <View style={estilos.filtros}>
          {FILTROS.map((f) => (
            <Pressable
              key={f.id}
              onPress={() => setFiltro(f.id)}
              style={[estilos.chip, filtro === f.id && estilos.chipActivo]}
              accessibilityRole="button"
              accessibilityState={{ selected: filtro === f.id }}
              testID={`filtro-${f.id}`}
            >
              <Text style={[estilos.chipTexto, filtro === f.id && { color: colores.blanco }]}>{f.texto}</Text>
            </Pressable>
          ))}
        </View>

        {cargando ? (
          <ActivityIndicator color={colores.primario} style={{ marginTop: 40 }} />
        ) : error ? (
          <Aviso tipo="error" mensaje={error} />
        ) : tickets.length === 0 ? (
          <View style={estilos.vacio}>
            <Ionicons name="ribbon-outline" size={28} color={colores.textoSecundario} />
            <Text style={estilos.vacioTexto}>Aún no tienes tickets de correlativo.</Text>
          </View>
        ) : (
          tickets.map((t) => <TarjetaTicket key={t.idTicket} t={t} abierto={abierto === t.idTicket} onAlternar={() => setAbierto((v) => (v === t.idTicket ? null : t.idTicket))} />)
        )}

        {!cargando && !error && (
          <>
            {usable && (
              <View style={estilos.correlativoCaja} testID="correlativo-metrologico">
                <Text style={estilos.correlativoEtiqueta}>CORRELATIVO METROLÓGICO</Text>
                <Text style={estilos.correlativoValor}>{usable.correlativo}</Text>
                <Text style={estilos.correlativoPie}>{[usable.tipoCertificado, usable.equipo, usable.codigoEquipo].filter(Boolean).join(' · ')}</Text>
              </View>
            )}
            <View style={{ marginTop: 14 }}>
              <Boton titulo="Usar correlativo" onPress={() => usable && usar(usable)} deshabilitado={!usable} />
            </View>
            <Text style={estilos.ayuda}>{usable ? AYUDA_USAR : AYUDA_USAR_BLOQUEADO}</Text>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function TarjetaTicket({ t, abierto, onAlternar }: { t: TicketCorrelativo; abierto: boolean; onAlternar: () => void }) {
  const et = etiquetaTicket(t.estado, 'tecnico');
  const pendiente = t.estado === 'solicitado';
  const pasos = lineaTiempo(t);
  return (
    <View style={[estilos.ticket, { borderLeftColor: pendiente ? colores.rojo : colores.primario }, abierto && { borderColor: colores.primario }]} testID={`ticket-${t.numero}`}>
      <View style={estilos.ticketCabecera}>
        <View style={{ flex: 1 }}>
          <Text style={estilos.ticketNumero}>{t.numero}</Text>
          <Text style={estilos.ticketSub}>
            {[t.codigoEquipo, `hoy ${horaDe(t.solicitadoEn)}`].filter(Boolean).join(' · ')}
          </Text>
        </View>
        <View style={[estilos.pill, { backgroundColor: et.fondo }]}>
          <Text style={[estilos.pillTexto, { color: et.color }]}>{et.texto}</Text>
        </View>
      </View>

      {!pendiente && !!t.correlativo && (
        <View style={estilos.correlativoFila}>
          <Text style={estilos.correlativoFilaK}>Correlativo</Text>
          <Text style={estilos.correlativoFilaV}>{t.correlativo}</Text>
        </View>
      )}

      <Pressable onPress={onAlternar} style={estilos.detalles} accessibilityRole="button" accessibilityState={{ expanded: abierto }}>
        <Text style={estilos.detallesTexto}>{abierto ? 'Ocultar detalles' : 'Ver detalles'}</Text>
        <Ionicons name={abierto ? 'chevron-up' : 'chevron-down'} size={20} color={colores.primario} />
      </Pressable>

      {abierto && (
        <View style={estilos.cuerpo}>
          {pasos.map((p, i) => (
            <View key={p.titulo} style={estilos.paso}>
              <View style={{ alignItems: 'center' }}>
                <View style={[estilos.punto, { backgroundColor: p.hecho ? colores.verde : '#CBD5E1' }]} />
                {i < pasos.length - 1 && <View style={estilos.hilo} />}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[estilos.pasoTitulo, !p.hecho && { color: colores.textoSecundario }]}>{p.titulo}</Text>
                <Text style={[estilos.pasoDetalle, !p.hecho && { color: '#94A3B8' }]}>{p.detalle}</Text>
              </View>
            </View>
          ))}
          <Fila k="Tipo de certificado" v={t.tipoCertificado ?? '—'} />
          <Fila k="Orden" v={t.numeroOs} />
          {!!t.equipo && <Fila k="Equipo" v={t.equipo} />}
          {!!t.observacion && (
            <View style={estilos.observacion}>
              <Text style={estilos.filaK}>Observación</Text>
              <Text style={estilos.observacionTexto}>{t.observacion}</Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

function Fila({ k, v }: { k: string; v: string }) {
  return (
    <View style={estilos.fila}>
      <Text style={estilos.filaK}>{k}</Text>
      <Text style={estilos.filaV}>{v}</Text>
    </View>
  );
}

const estilos = StyleSheet.create({
  area: { flex: 1, backgroundColor: colores.fondo },
  contenido: { paddingTop: 18, paddingBottom: 28, width: '100%', alignSelf: 'center' },
  tituloFila: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4 },
  titulo: { fontWeight: '700', color: colores.titulo, flexShrink: 1 },
  subtitulo: { color: colores.textoSecundario, fontSize: 14.5, marginBottom: 10 },
  exito: { flexDirection: 'row', gap: 10, alignItems: 'center', backgroundColor: colores.verdeFondo, borderColor: colores.verdeBorde, borderWidth: 1, borderRadius: radios.tarjeta, padding: 14, marginBottom: 12 },
  exitoTexto: { flex: 1, color: colores.titulo, fontSize: 16, lineHeight: 22 },
  filtros: { flexDirection: 'row', gap: 8, marginBottom: 12, flexWrap: 'wrap' },
  chip: { borderWidth: 1, borderColor: colores.borde, backgroundColor: colores.blanco, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 9 },
  chipActivo: { backgroundColor: colores.primario, borderColor: colores.primario },
  chipTexto: { fontSize: 16, fontWeight: '600', color: colores.titulo },
  vacio: { alignItems: 'center', gap: 8, paddingVertical: 30 },
  vacioTexto: { color: colores.textoSecundario, fontSize: 16 },
  ticket: { backgroundColor: colores.blanco, borderWidth: 1, borderColor: colores.bordeSuave, borderLeftWidth: 5, borderRadius: radios.tarjeta, padding: 14, marginBottom: 12 },
  ticketCabecera: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  ticketNumero: { fontSize: 21, fontWeight: '800', color: colores.titulo },
  ticketSub: { fontSize: 14.5, color: colores.textoSecundario, marginTop: 2 },
  pill: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  pillTexto: { fontSize: 12, fontWeight: '800', letterSpacing: 0.3 },
  correlativoFila: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colores.primarioSuave, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, marginTop: 10 },
  correlativoFilaK: { color: colores.primario, fontSize: 16 },
  correlativoFilaV: { color: colores.primario, fontSize: 21, fontWeight: '800' },
  detalles: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 10 },
  detallesTexto: { color: colores.primario, fontWeight: '700', fontSize: 16.5 },
  cuerpo: { marginTop: 10, borderTopWidth: 1, borderTopColor: colores.bordeSuave, paddingTop: 12 },
  paso: { flexDirection: 'row', gap: 12, marginBottom: 6 },
  punto: { width: 14, height: 14, borderRadius: 7, marginTop: 4 },
  hilo: { width: 2, flex: 1, minHeight: 22, backgroundColor: '#CBD5E1', marginTop: 2 },
  pasoTitulo: { fontSize: 16.5, fontWeight: '800', color: colores.titulo },
  pasoDetalle: { fontSize: 14.5, color: colores.textoSecundario, marginTop: 1 },
  fila: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, paddingVertical: 12, borderTopWidth: 1, borderTopColor: colores.bordeSuave },
  filaK: { fontSize: 16, color: colores.titulo },
  filaV: { fontSize: 17, fontWeight: '800', color: colores.titulo, flexShrink: 1, textAlign: 'right' },
  observacion: { paddingVertical: 12, borderTopWidth: 1, borderTopColor: colores.bordeSuave },
  observacionTexto: { fontSize: 14.5, color: colores.textoSecundario, marginTop: 3, lineHeight: 20 },
  correlativoCaja: { backgroundColor: colores.primarioSuave, borderWidth: 1, borderColor: '#BFDBFE', borderRadius: radios.tarjeta, padding: 16, alignItems: 'center', marginTop: 4 },
  correlativoEtiqueta: { fontSize: 13, fontWeight: '800', color: colores.primario, letterSpacing: 0.8 },
  correlativoValor: { fontSize: 34, fontWeight: '800', color: colores.primario, marginTop: 4 },
  correlativoPie: { fontSize: 14.5, color: colores.textoSecundario, marginTop: 4, textAlign: 'center' },
  ayuda: { textAlign: 'center', color: colores.textoSecundario, fontSize: 14.5, marginTop: 8, lineHeight: 20 },
});
