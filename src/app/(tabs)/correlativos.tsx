import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { nombreDeCodigo, obtenerCatalogo } from '@/api/catalogos';
import { asignarCorrelativo, generarReservaJefatura, obtenerCorrelativosJefaturaConRespaldo, type TicketJefatura } from '@/api/correlativos';
import { horaRespaldo } from '@/api/respaldo';
import { Aviso } from '@/componentes/Aviso';
import { Boton } from '@/componentes/Boton';
import { EncabezadoApp } from '@/componentes/EncabezadoApp';
import { useConsulta } from '@/hooks/useConsulta';
import { useDiseno } from '@/hooks/useDiseno';
import { useRefrescoAutomatico } from '@/hooks/useRefrescoAutomatico';
import { useSesion } from '@/sesion/SesionContext';
import { colores, radios } from '@/tema/colores';
import {
  codigosCortos,
  correlativoValido,
  equipoCapacidad,
  etiquetaTicket,
  normalizarCorrelativo,
  separarTicketsJefatura,
  textoAntiguedad,
  textoAsignado,
  textoLibres,
  textoResultado,
  textoUsados,
  toastAsignado,
} from '@/utilidades/correlativos';

/**
 * HU-34 — Correlativos de Metrología (Jefe de Metrología): las solicitudes de los técnicos. KPIs (Pendientes · Asignados hoy · Reservados), los tickets pendientes
 * desplegables (técnico, orden, equipo, tipo de certificado, patrón y resultado) con el SIGUIENTE CORRELATIVO SUGERIDO (editable) y "Asignar correlativo", que avisa al
 * técnico; y la RESERVA PARA TRABAJO SIN CONEXIÓN de cada técnico de Metrología (la reserva diaria se genera al abrir la pantalla). La secuencia CC-####-AAAA es única y la
 * resuelve el back. Se actualiza sola cada ~30 s; asignar exige conexión. Solo el área de Metrología.
 */
export default function PantallaCorrelativos() {
  const { sesion } = useSesion();
  const usuario = sesion?.usuario;
  const d = useDiseno();
  const token = sesion?.token ?? '';

  const [abierto, setAbierto] = useState<number | null | undefined>(undefined); // undefined = el primer pendiente abierto; null = todos cerrados
  const [editando, setEditando] = useState<number | null>(null);
  const [valor, setValor] = useState('');
  const [asignando, setAsignando] = useState<number | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [toast, setToast] = useState<{ titulo: string; detalle: string } | null>(null);

  const { datos, cargando, recargando, error, recargar } = useConsulta(async (t) => {
    const [r, cargos] = await Promise.all([obtenerCorrelativosJefaturaConRespaldo(t, usuario?.idUsuario ?? 0), obtenerCatalogo(t, 'CARGO_USUARIO').catch(() => undefined)]);
    return { panel: r.datos, sinConexion: r.sinConexion, guardadoEn: r.guardadoEn, cargos };
  });
  useRefrescoAutomatico(recargar, 30);

  // La reserva diaria de todos los técnicos de Metrología se genera al abrir (idempotente por día)
  const reservaPedida = useRef(false);
  const hayPanel = !!datos && !error;
  useEffect(() => {
    if (!hayPanel || reservaPedida.current || !token) return;
    reservaPedida.current = true;
    void generarReservaJefatura(token)
      .then((r) => (r.generados > 0 ? recargar() : undefined))
      .catch(() => undefined);
  }, [hayPanel, token, recargar]);

  const cargo = nombreDeCodigo(datos?.cargos, usuario?.cargo) ?? usuario?.cargo ?? 'Jefe de Metrología';
  const panel = datos?.panel ?? null;
  const k = panel?.kpis;
  const { pendientes, asignados } = separarTicketsJefatura(panel?.tickets ?? []);
  const idAbierto = abierto === undefined ? (pendientes[0]?.idTicket ?? null) : abierto;

  async function asignar(t: TicketJefatura) {
    const escrito = editando === t.idTicket ? valor : '';
    if (!correlativoValido(escrito)) return setMensaje('El correlativo debe tener el formato CC-0000-2026.');
    setAsignando(t.idTicket);
    setMensaje(null);
    try {
      const r = await asignarCorrelativo(token, t.idTicket, normalizarCorrelativo(escrito));
      setEditando(null);
      setValor('');
      setToast(toastAsignado(r.datos?.tecnico ?? t.tecnico));
      setTimeout(() => setToast(null), 4500);
      await recargar();
    } catch (e) {
      setMensaje(e instanceof Error ? e.message : 'No se pudo asignar el correlativo.');
    } finally {
      setAsignando(null);
    }
  }

  return (
    <SafeAreaView style={estilos.area} edges={['top']}>
      <EncabezadoApp nombre={usuario?.nombre ?? ''} apellido={usuario?.apellido} subtitulo={`${usuario?.nombre ?? ''} · ${cargo}`} />
      <ScrollView
        contentContainerStyle={[estilos.contenido, { paddingHorizontal: d.margen, maxWidth: d.anchoMaximo }]}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={recargando} onRefresh={() => void recargar()} colors={[colores.primario]} />}
      >
        <View style={estilos.tituloFila}>
          <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Volver">
            <Ionicons name="arrow-back" size={24} color={colores.titulo} />
          </Pressable>
          <Text style={[estilos.titulo, { fontSize: d.tituloPantalla }]} accessibilityRole="header">
            Correlativos
          </Text>
        </View>
        <Text style={estilos.subtitulo}>Solicitudes de los técnicos</Text>

        {datos?.sinConexion && (
          <View style={{ marginBottom: 10 }}>
            <Aviso mensaje={`Sin conexión: se muestra lo último guardado (${horaRespaldo(datos.guardadoEn)}). Asignar exige conexión.`} />
          </View>
        )}

        {cargando ? (
          <ActivityIndicator color={colores.primario} style={{ marginTop: 40 }} />
        ) : error || !panel || !k ? (
          <Aviso tipo="error" mensaje={error ?? 'No se pudo cargar los correlativos.'} />
        ) : (
          <>
            <View style={estilos.kpis} testID="kpis-correlativos">
              <Kpi valor={k.pendientes} texto="Pendientes" color={colores.naranja} />
              <Kpi valor={k.asignadosHoy} texto="Asignados hoy" color={colores.verde} />
              <Kpi valor={k.reservados} texto="Reservados" color={colores.primario} />
            </View>

            {!!mensaje && (
              <View style={{ marginTop: 12 }} testID="mensaje-correlativos">
                <Aviso tipo="error" mensaje={mensaje} />
              </View>
            )}

            <Text style={estilos.seccion}>TICKETS PENDIENTES</Text>
            {pendientes.length === 0 ? (
              <View style={estilos.vacio}>
                <Ionicons name="checkmark-circle-outline" size={22} color={colores.verde} />
                <Text style={estilos.vacioTexto}>No hay solicitudes pendientes.</Text>
              </View>
            ) : (
              pendientes.map((t) => {
                const abierta = idAbierto === t.idTicket;
                const et = etiquetaTicket(t.estado, 'jefe');
                return (
                  <View key={t.idTicket} style={[estilos.ticket, abierta && { borderColor: colores.primario, borderWidth: 2 }]} testID={`ticket-${t.numero}`}>
                    <Pressable onPress={() => setAbierto(abierta ? null : t.idTicket)} style={estilos.ticketCab} accessibilityRole="button" accessibilityState={{ expanded: abierta }}>
                      <View style={{ flex: 1 }}>
                        <Text style={estilos.ticketNumero}>{t.numero}</Text>
                        <Text style={estilos.ticketSub}>{[t.tecnico, t.numeroOs, textoAntiguedad(t.minutos, t.solicitadoEn)].filter(Boolean).join(' · ')}</Text>
                      </View>
                      <View style={[estilos.pill, { backgroundColor: et.fondo }]}>
                        <Text style={[estilos.pillTexto, { color: et.color }]}>{et.texto}</Text>
                      </View>
                      <Ionicons name={abierta ? 'chevron-up' : 'chevron-down'} size={22} color={colores.textoSecundario} />
                    </Pressable>

                    {abierta && (
                      <View style={{ marginTop: 10 }}>
                        <View style={estilos.rejilla}>
                          <Dato k="EQUIPO" v={equipoCapacidad(t.codigoEquipo, t.capacidad)} />
                          <Dato k="TIPO" v={t.tipoCertificado ?? '—'} />
                          <Dato k="PATRÓN" v={t.patron ?? '—'} />
                          <Dato k="RESULTADO" v={textoResultado(t.resultado)} />
                        </View>
                        {!!t.observacion && <Text style={estilos.observacion}>“{t.observacion}”</Text>}

                        <View style={estilos.sugerido}>
                          <View style={{ flex: 1 }}>
                            <Text style={estilos.sugeridoEtiqueta}>SIGUIENTE CORRELATIVO SUGERIDO</Text>
                            {editando === t.idTicket ? (
                              <TextInput
                                value={valor}
                                onChangeText={(x) => setValor(x.toUpperCase().slice(0, 12))}
                                placeholder={k.siguienteSugerido ?? 'CC-0000-2026'}
                                placeholderTextColor={colores.placeholder}
                                autoCapitalize="characters"
                                autoCorrect={false}
                                style={estilos.sugeridoInput}
                                testID="correlativo-editable"
                              />
                            ) : (
                              <Text style={estilos.sugeridoValor}>{k.siguienteSugerido ?? '—'}</Text>
                            )}
                          </View>
                          <Pressable
                            onPress={() => {
                              setEditando((e) => (e === t.idTicket ? null : t.idTicket));
                              setValor(k.siguienteSugerido ?? '');
                            }}
                            hitSlop={10}
                            accessibilityRole="button"
                            accessibilityLabel="Editar el correlativo"
                            testID="editar-correlativo"
                          >
                            <Ionicons name={editando === t.idTicket ? 'close-circle-outline' : 'create-outline'} size={26} color={colores.primario} />
                          </Pressable>
                        </View>

                        <Boton titulo="Asignar correlativo" onPress={() => void asignar(t)} cargando={asignando === t.idTicket} deshabilitado={asignando !== null} />
                      </View>
                    )}
                  </View>
                );
              })
            )}

            {asignados.map((t) => {
              const et = etiquetaTicket(t.estado === 'despachado' ? 'asignado' : t.estado, 'jefe');
              return (
                <View key={t.idTicket} style={estilos.ticket} testID={`ticket-${t.numero}`}>
                  <View style={estilos.ticketCab}>
                    <View style={{ flex: 1 }}>
                      <Text style={estilos.ticketNumero}>{t.numero}</Text>
                      <Text style={estilos.ticketSub}>{[t.tecnico, t.numeroOs, textoAntiguedad(t.minutos, t.solicitadoEn)].filter(Boolean).join(' · ')}</Text>
                    </View>
                    <View style={[estilos.pill, { backgroundColor: et.fondo }]}>
                      <Text style={[estilos.pillTexto, { color: et.color }]}>{et.texto}</Text>
                    </View>
                  </View>
                  <View style={estilos.asignadoFila}>
                    <Ionicons name="checkmark-circle" size={20} color={colores.verde} />
                    <Text style={estilos.asignadoTexto}>{textoAsignado(t.correlativo, t.asignadoEn, t.asignadoPor)}</Text>
                  </View>
                </View>
              );
            })}

            <Text style={estilos.seccion}>RESERVA PARA TRABAJO SIN CONEXIÓN</Text>
            <View style={estilos.tarjeta}>
              <Text style={estilos.reservaTexto}>
                Cada técnico de Metrología recibe correlativos reservados al iniciar el día ({k.reservaDiaria} por técnico), para usarlos si no tiene señal.
              </Text>
              {panel.reserva.length === 0 ? (
                <Text style={[estilos.reservaTexto, { marginTop: 10 }]}>Aún no hay correlativos reservados.</Text>
              ) : (
                <View style={estilos.reservaLista}>
                  {panel.reserva.map((r, i) => (
                    <View key={r.idUsuario} style={[estilos.reservaFila, i > 0 && estilos.reservaSeparador]} testID={`reserva-${r.idUsuario}`}>
                      <View style={{ flex: 1 }}>
                        <Text style={estilos.reservaNombre}>{r.tecnico}</Text>
                        {r.libres > 0 && <Text style={estilos.reservaDetalle}>{codigosCortos(r.codigosLibres)}</Text>}
                        {r.usados > 0 && <Text style={estilos.reservaDetalle}>{codigosCortos(r.usadosTexto)}</Text>}
                      </View>
                      <View style={{ gap: 4, alignItems: 'flex-end' }}>
                        {r.libres > 0 && (
                          <View style={[estilos.pill, { backgroundColor: colores.azulFondo }]}>
                            <Text style={[estilos.pillTexto, { color: colores.azulTexto }]}>{textoLibres(r.libres)}</Text>
                          </View>
                        )}
                        {r.usados > 0 && (
                          <View style={[estilos.pill, { backgroundColor: colores.amarilloFondo }]}>
                            <Text style={[estilos.pillTexto, { color: colores.amarilloTexto }]}>{textoUsados(r.usados)}</Text>
                          </View>
                        )}
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </View>
          </>
        )}
      </ScrollView>

      {toast && (
        <View style={estilos.toast} accessibilityLiveRegion="polite" testID="toast-asignado">
          <Ionicons name="checkmark-circle" size={26} color="#4ADE80" />
          <View style={{ flex: 1 }}>
            <Text style={estilos.toastTitulo}>{toast.titulo}</Text>
            <Text style={estilos.toastDetalle}>{toast.detalle}</Text>
          </View>
        </View>
      )}
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

function Dato({ k, v }: { k: string; v: string }) {
  return (
    <View style={estilos.dato}>
      <Text style={estilos.datoK}>{k}</Text>
      <Text style={estilos.datoV}>{v}</Text>
    </View>
  );
}

const estilos = StyleSheet.create({
  area: { flex: 1, backgroundColor: colores.fondo },
  contenido: { paddingTop: 18, paddingBottom: 90, width: '100%', alignSelf: 'center' },
  tituloFila: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4 },
  titulo: { fontWeight: '700', color: colores.titulo, flexShrink: 1 },
  subtitulo: { color: colores.textoSecundario, fontSize: 14.5, marginBottom: 12 },
  kpis: { flexDirection: 'row', gap: 10 },
  kpi: { flex: 1, backgroundColor: colores.blanco, borderWidth: 1, borderColor: colores.bordeSuave, borderRadius: radios.tarjeta, paddingVertical: 12, alignItems: 'center' },
  kpiValor: { fontSize: 30, fontWeight: '800' },
  kpiTexto: { fontSize: 14, fontWeight: '700', color: colores.textoSecundario, marginTop: 2 },
  seccion: { fontSize: 14, fontWeight: '800', color: colores.textoSecundario, letterSpacing: 1.2, marginTop: 20, marginBottom: 10 },
  vacio: { flexDirection: 'row', gap: 8, alignItems: 'center', backgroundColor: colores.blanco, borderWidth: 1, borderColor: colores.bordeSuave, borderRadius: radios.tarjeta, padding: 14 },
  vacioTexto: { color: colores.textoSecundario, fontSize: 16 },
  ticket: { backgroundColor: colores.blanco, borderWidth: 1, borderColor: colores.bordeSuave, borderRadius: radios.tarjeta, padding: 14, marginBottom: 12 },
  ticketCab: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  ticketNumero: { fontSize: 20, fontWeight: '800', color: colores.titulo },
  ticketSub: { fontSize: 14.5, color: colores.textoSecundario, marginTop: 2, lineHeight: 20 },
  pill: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  pillTexto: { fontSize: 12, fontWeight: '800', letterSpacing: 0.3 },
  rejilla: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 14, marginBottom: 12 },
  dato: { width: '50%', paddingRight: 8 },
  datoK: { fontSize: 12.5, fontWeight: '700', color: colores.textoSecundario, letterSpacing: 0.6 },
  datoV: { fontSize: 17, color: colores.titulo, marginTop: 2 },
  observacion: { fontSize: 14.5, color: colores.textoSecundario, fontStyle: 'italic', marginBottom: 12, lineHeight: 20 },
  sugerido: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colores.primarioSuave, borderWidth: 1, borderColor: '#BFDBFE', borderRadius: radios.tarjeta, padding: 14, marginBottom: 12 },
  sugeridoEtiqueta: { fontSize: 12.5, fontWeight: '800', color: colores.textoSecundario, letterSpacing: 0.8 },
  sugeridoValor: { fontSize: 30, fontWeight: '800', color: colores.primario, marginTop: 4 },
  sugeridoInput: { fontSize: 26, fontWeight: '800', color: colores.primario, marginTop: 2, padding: 0, borderBottomWidth: 1.5, borderBottomColor: colores.primario },
  asignadoFila: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  asignadoTexto: { flex: 1, color: colores.verde, fontSize: 16, fontWeight: '600' },
  tarjeta: { backgroundColor: colores.blanco, borderWidth: 1, borderColor: colores.bordeSuave, borderRadius: radios.tarjeta, padding: 16 },
  reservaTexto: { color: colores.textoSecundario, fontSize: 15, lineHeight: 22 },
  reservaLista: { marginTop: 12, borderWidth: 1, borderColor: colores.bordeSuave, borderRadius: radios.tarjeta, paddingHorizontal: 14 },
  reservaFila: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  reservaSeparador: { borderTopWidth: 1, borderTopColor: colores.bordeSuave },
  reservaNombre: { fontSize: 18, color: colores.titulo },
  reservaDetalle: { fontSize: 14.5, color: colores.textoSecundario, marginTop: 2 },
  toast: { position: 'absolute', left: 16, right: 16, bottom: 18, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#0F172A', borderRadius: 16, padding: 16 },
  toastTitulo: { color: colores.blanco, fontSize: 18, fontWeight: '800' },
  toastDetalle: { color: '#CBD5E1', fontSize: 15, marginTop: 1 },
});
