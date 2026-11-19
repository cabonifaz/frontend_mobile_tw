import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { nombreDeCodigo, obtenerCatalogo } from '@/api/catalogos';
import {
  asignarViaticoEquipo,
  obtenerViaticoServicio,
  obtenerViaticosEquipo,
  type ServicioViaticoEquipo,
  type ViaticoServicio,
} from '@/api/viaticosEquipo';
import { Aviso } from '@/componentes/Aviso';
import { Boton } from '@/componentes/Boton';
import { EncabezadoApp } from '@/componentes/EncabezadoApp';
import { useConsulta } from '@/hooks/useConsulta';
import { useDiseno } from '@/hooks/useDiseno';
import { useRefrescoAutomatico } from '@/hooks/useRefrescoAutomatico';
import { useSesion } from '@/sesion/SesionContext';
import { colores, radios } from '@/tema/colores';
import { soles } from '@/utilidades/dinero';
import {
  CONCEPTOS_ASIGNACION,
  colorAvance,
  errorAsignacion,
  etiquetaGasto,
  etiquetaServicio,
  montosDeTecnico,
  montosVacios,
  leerMonto,
  totalAsignacion,
} from '@/utilidades/viaticosEquipo';
import { diaMes } from '@/utilidades/viaticos';

/**
 * HU-35 — Viáticos y gastos del equipo (Jefe de Área): lo asignado, lo rendido y lo que falta por revisar de cada servicio.
 *  - Toca un servicio para ver, por técnico, lo asignado por concepto (y si ya está depositado) y sus gastos; toca un gasto para revisarlo con su comprobante y la lectura de
 *    la IA (Aprobar · Observar con comentario · Rechazar con motivo): es la misma pantalla de Aprobaciones.
 *  - «Asignar viático»: el monto por concepto (movilidad, alimentación, alojamiento y otros) de un técnico del servicio y si ya está depositado. El técnico lo ve al instante en
 *    «Viáticos y Gastos» de su app. Las reglas (servicio confirmado, rendición abierta, tope, concurrencia) y el alcance por Área + Rol los valida el back.
 */
export default function PantallaViaticosEquipo() {
  const { sesion } = useSesion();
  const usuario = sesion?.usuario;
  const token = sesion?.token ?? '';
  const d = useDiseno();

  const { datos, cargando, recargando, error, recargar } = useConsulta(async (tk) => {
    const [r, cargos] = await Promise.all([obtenerViaticosEquipo(tk), obtenerCatalogo(tk, 'CARGO_USUARIO').catch(() => undefined)]);
    return { ...r, cargos };
  }, '');
  useRefrescoAutomatico(recargar, datos?.kpis.refrescoSegundos ?? 30);

  const [abierto, setAbierto] = useState<number | null>(null);
  const [detalles, setDetalles] = useState<Record<number, ViaticoServicio>>({});
  const [cargandoDetalle, setCargandoDetalle] = useState<number | null>(null);
  const [falloDetalle, setFalloDetalle] = useState<string | null>(null);

  // Formulario «Asignar viático»
  const [modal, setModal] = useState(false);
  const [idOsForm, setIdOsForm] = useState<number | null>(null);
  const [idTecnico, setIdTecnico] = useState<number | null>(null);
  const [montos, setMontos] = useState(montosVacios());
  const [depositado, setDepositado] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [fallo, setFallo] = useState<string | null>(null);
  const [resultado, setResultado] = useState<string | null>(null);

  const cargo = nombreDeCodigo(datos?.cargos, usuario?.cargo) ?? usuario?.cargo ?? 'Jefe de Área';
  const k = datos?.kpis;
  const servicios = datos?.servicios ?? [];
  const asignables = servicios.filter((s) => s.puedeAsignar);
  const detalleForm = idOsForm !== null ? detalles[idOsForm] : undefined;
  const form = { idTecnico, montos, depositado };
  const errorForm = errorAsignacion(form);
  const total = totalAsignacion(form);

  async function cargarDetalle(idOs: number, forzar = false): Promise<ViaticoServicio | null> {
    if (!forzar && detalles[idOs]) return detalles[idOs];
    setCargandoDetalle(idOs);
    setFalloDetalle(null);
    try {
      const det = await obtenerViaticoServicio(token, idOs);
      setDetalles((prev) => ({ ...prev, [idOs]: det }));
      return det;
    } catch (e) {
      setFalloDetalle(e instanceof Error ? e.message : 'No se pudo cargar el servicio.');
      return null;
    } finally {
      setCargandoDetalle(null);
    }
  }

  async function alternar(s: ServicioViaticoEquipo) {
    if (abierto === s.idOs) return setAbierto(null);
    setAbierto(s.idOs);
    await cargarDetalle(s.idOs);
  }

  async function abrirAsignar(idOs?: number) {
    const objetivo = idOs ?? (abierto !== null && asignables.some((s) => s.idOs === abierto) ? abierto : asignables[0]?.idOs ?? null);
    setFallo(null);
    setResultado(null);
    setDepositado(false);
    setMontos(montosVacios());
    setIdTecnico(null);
    setIdOsForm(objetivo);
    setModal(true);
    if (objetivo !== null) await prepararServicio(objetivo);
  }

  /** Carga el servicio y deja listo al técnico (si es uno solo, o el principal) con lo que ya tenía asignado. */
  async function prepararServicio(idOs: number) {
    const det = await cargarDetalle(idOs);
    const t = det?.tecnicos.length === 1 ? det.tecnicos[0] : (det?.tecnicos.find((x) => x.principal) ?? null);
    if (t) elegirTecnico(t.idTecnico, det);
  }

  function elegirTecnico(id: number, det: ViaticoServicio | null | undefined) {
    const t = det?.tecnicos.find((x) => x.idTecnico === id);
    setIdTecnico(id);
    setMontos(montosDeTecnico(t));
    setDepositado(!!t && t.lineas.length > 0 && t.lineas.every((l) => l.depositado));
  }

  async function asignar() {
    if (idOsForm === null || enviando) return;
    if (errorForm) return setFallo(errorForm);
    setEnviando(true);
    setFallo(null);
    try {
      const r = await asignarViaticoEquipo(token, idOsForm, {
        idTecnico: idTecnico!,
        movilidad: leerMonto(montos.movilidad),
        alimentacion: leerMonto(montos.alimentacion),
        alojamiento: leerMonto(montos.alojamiento),
        otros: leerMonto(montos.otros),
        depositado,
        version: detalleForm?.cabecera.version ?? null,
      });
      setModal(false);
      setResultado(r.mensaje);
      await Promise.all([recargar(), cargarDetalle(idOsForm, true)]);
    } catch (e) {
      setFallo(e instanceof Error ? e.message : 'No se pudo asignar el viático.');
    } finally {
      setEnviando(false);
    }
  }

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
            Viáticos y gastos
          </Text>
        </View>
        <Text style={estilos.subtitulo}>Equipo del área{k?.actualizado ? ` · actualizado ${k.actualizado}` : ''}</Text>

        <View style={estilos.kpis} testID="viaticos-kpis">
          <Kpi valor={k ? soles(k.asignado) : '—'} texto="Asignado" color={colores.titulo} />
          <Kpi valor={k ? soles(k.rendido) : '—'} texto="Rendido" color={colores.primario} />
          <Kpi valor={k ? soles(k.porRevisar) : '—'} texto="Por revisar" color={k && k.porRevisar > 0 ? colores.naranja : colores.titulo} />
        </View>

        {!!resultado && (
          <View style={{ marginTop: 12 }} testID="viaticos-resultado">
            <Aviso tipo="info" mensaje={resultado} />
          </View>
        )}

        <Text style={estilos.seccion}>POR SERVICIO</Text>
        {cargando ? (
          <ActivityIndicator color={colores.primario} style={{ marginTop: 30 }} />
        ) : error ? (
          <Aviso tipo="error" mensaje={error} />
        ) : servicios.length === 0 ? (
          <Text style={estilos.vacio} testID="viaticos-vacio">
            No hay servicios con viáticos para mostrar.
          </Text>
        ) : (
          <View style={{ gap: 10 }}>
            {servicios.map((s) => {
              const et = etiquetaServicio(s.estado);
              const abiertoAqui = abierto === s.idOs;
              const det = detalles[s.idOs];
              return (
                <View key={s.idOs} style={estilos.tarjeta} testID={`viatico-servicio-${s.idOs}`}>
                  <Pressable onPress={() => void alternar(s)} accessibilityRole="button" accessibilityState={{ expanded: abiertoAqui }} style={{ gap: 6 }}>
                    <View style={estilos.cabecera}>
                      <Text style={estilos.servicioTitulo} numberOfLines={2}>
                        {s.numeroOs}
                        {s.cliente ? ` · ${s.cliente}` : ''}
                      </Text>
                      <View style={[estilos.badge, { backgroundColor: et.fondo }]}>
                        <Text style={[estilos.badgeTexto, { color: et.color }]}>{et.texto}</Text>
                      </View>
                    </View>
                    <Text style={estilos.meta} numberOfLines={2}>
                      {s.tecnicos}
                      {s.gastosPorRevisar > 0 ? ` · ${s.gastosPorRevisar} ${s.gastosPorRevisar === 1 ? 'gasto' : 'gastos'} por revisar` : s.estado === 'por_depositar' ? ' · sin depósito' : ''}
                    </Text>
                    <View style={estilos.montosFila}>
                      <Text style={estilos.montos}>
                        Asignado {soles(s.asignado)} · rendido {soles(s.rendido)}
                      </Text>
                      <Text style={[estilos.porcentaje, { color: colorAvance(s.avance) }]}>{s.avance} %</Text>
                    </View>
                    <View style={estilos.barra}>
                      <View style={[estilos.barraRelleno, { width: `${Math.min(100, s.avance)}%`, backgroundColor: colorAvance(s.avance) }]} />
                    </View>
                  </Pressable>

                  {abiertoAqui && (
                    <View style={estilos.detalle}>
                      {cargandoDetalle === s.idOs && !det ? (
                        <ActivityIndicator color={colores.primario} />
                      ) : !det ? (
                        <Aviso tipo="error" mensaje={falloDetalle ?? 'No se pudo cargar el servicio.'} />
                      ) : (
                        <>
                          {det.tecnicos.map((t) => (
                            <View key={t.idTecnico} style={estilos.tecnico}>
                              <View style={estilos.tecnicoCabecera}>
                                <Text style={estilos.tecnicoNombre}>{t.nombre}</Text>
                                <Text style={estilos.tecnicoMonto}>{soles(t.asignado)}</Text>
                              </View>
                              {t.lineas.length === 0 ? (
                                <Text style={estilos.sinDatos}>Sin viático asignado.</Text>
                              ) : (
                                t.lineas.map((l) => (
                                  <View key={l.idGasto} style={estilos.linea}>
                                    <Text style={estilos.lineaTexto}>{l.concepto}</Text>
                                    <Text style={estilos.lineaTexto}>{soles(l.monto)}</Text>
                                    <View style={[estilos.chipDeposito, { backgroundColor: l.depositado ? '#DCFCE7' : '#FEF3C7' }]}>
                                      <Text style={[estilos.chipDepositoTexto, { color: l.depositado ? '#166534' : '#92400E' }]}>{l.depositado ? 'Depositado' : 'Pendiente'}</Text>
                                    </View>
                                  </View>
                                ))
                              )}
                            </View>
                          ))}

                          <Text style={estilos.subSeccion}>GASTOS RENDIDOS</Text>
                          {det.gastos.length === 0 ? (
                            <Text style={estilos.sinDatos}>Aún no hay gastos rendidos.</Text>
                          ) : (
                            det.gastos.map((g) => {
                              const eg = etiquetaGasto(g.estado);
                              const noCoincide = g.coincideIa === false;
                              return (
                                <Pressable
                                  key={g.idGasto}
                                  onPress={() => router.push({ pathname: '/aprobacion-detalle', params: { tipo: 'gasto', id: String(g.idGasto) } })}
                                  style={estilos.gasto}
                                  accessibilityRole="button"
                                  accessibilityLabel={`Gasto ${g.concepto} de ${g.tecnico}`}
                                  testID={`gasto-${g.idGasto}`}
                                >
                                  <View style={{ flex: 1, gap: 2 }}>
                                    <Text style={estilos.gastoTitulo} numberOfLines={1}>
                                      {g.concepto} · {soles(g.monto)}
                                    </Text>
                                    <Text style={estilos.meta} numberOfLines={1}>
                                      {[g.tecnico, g.fecha ? diaMes(g.fecha) : null, g.tieneComprobante ? 'con comprobante' : 'sin comprobante'].filter(Boolean).join(' · ')}
                                    </Text>
                                    {noCoincide && g.montoIa != null && (
                                      <Text style={estilos.alertaIa}>La IA leyó {soles(g.montoIa)}: no coincide con lo declarado.</Text>
                                    )}
                                  </View>
                                  <View style={[estilos.badge, { backgroundColor: eg.fondo }]}>
                                    <Text style={[estilos.badgeTexto, { color: eg.color }]}>{eg.texto}</Text>
                                  </View>
                                  <Ionicons name="chevron-forward" size={18} color={colores.textoSecundario} />
                                </Pressable>
                              );
                            })
                          )}

                          {s.puedeAsignar ? (
                            <Pressable onPress={() => void abrirAsignar(s.idOs)} style={estilos.enlace} accessibilityRole="button">
                              <Ionicons name="add-circle-outline" size={18} color={colores.primario} />
                              <Text style={estilos.enlaceTexto}>Asignar viático a este servicio</Text>
                            </Pressable>
                          ) : (
                            !!det.cabecera.motivoNoAsignar && <Text style={estilos.sinDatos}>{det.cabecera.motivoNoAsignar}</Text>
                          )}
                        </>
                      )}
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}

        {!cargando && !error && (
          <View style={{ marginTop: 16 }}>
            <Boton titulo="Asignar viático" onPress={() => void abrirAsignar()} deshabilitado={asignables.length === 0} />
            {asignables.length === 0 && servicios.length > 0 && <Text style={estilos.nota}>Ningún servicio admite asignar viáticos ahora (solo los confirmados, con la rendición abierta y que aún no salieron a campo).</Text>}
          </View>
        )}
      </ScrollView>

      {/* Asignar viático */}
      <Modal visible={modal} transparent animationType="fade" onRequestClose={() => { if (!enviando) setModal(false); }}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={estilos.fondoModal}>
          <View style={estilos.modal} testID="viaticos-dialogo">
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
              <Text style={estilos.modalTitulo}>Asignar viático</Text>

              <Text style={estilos.campo}>Servicio</Text>
              <View style={estilos.chips}>
                {asignables.map((s) => (
                  <Pressable
                    key={s.idOs}
                    onPress={() => {
                      setIdOsForm(s.idOs);
                      setIdTecnico(null);
                      setMontos(montosVacios());
                      void prepararServicio(s.idOs);
                    }}
                    style={[estilos.chip, idOsForm === s.idOs && estilos.chipActivo]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: idOsForm === s.idOs }}
                  >
                    <Text style={[estilos.chipTexto, idOsForm === s.idOs && { color: colores.blanco }]}>{s.numeroOs}</Text>
                  </Pressable>
                ))}
              </View>

              <Text style={estilos.campo}>Técnico</Text>
              {cargandoDetalle !== null && !detalleForm ? (
                <ActivityIndicator color={colores.primario} />
              ) : (
                <View style={estilos.chips}>
                  {(detalleForm?.tecnicos ?? []).map((t) => (
                    <Pressable
                      key={t.idTecnico}
                      onPress={() => elegirTecnico(t.idTecnico, detalleForm)}
                      style={[estilos.chip, idTecnico === t.idTecnico && estilos.chipActivo]}
                      accessibilityRole="button"
                      accessibilityState={{ selected: idTecnico === t.idTecnico }}
                      testID={`asignar-tecnico-${t.idTecnico}`}
                    >
                      <Text style={[estilos.chipTexto, idTecnico === t.idTecnico && { color: colores.blanco }]}>{t.nombre}</Text>
                    </Pressable>
                  ))}
                </View>
              )}

              <View style={estilos.rejilla}>
                {CONCEPTOS_ASIGNACION.map((c) => (
                  <View key={c.clave} style={estilos.campoMonto}>
                    <Text style={estilos.campo}>{c.titulo}</Text>
                    <View style={estilos.monto}>
                      <Text style={estilos.montoPrefijo}>S/</Text>
                      <TextInput
                        value={montos[c.clave]}
                        onChangeText={(t) => setMontos((m) => ({ ...m, [c.clave]: t }))}
                        placeholder="0.00"
                        placeholderTextColor={colores.placeholder}
                        keyboardType="decimal-pad"
                        maxLength={8}
                        editable={!enviando}
                        style={estilos.montoEntrada}
                        testID={`asignar-${c.clave}`}
                      />
                    </View>
                  </View>
                ))}
              </View>

              <View style={estilos.total}>
                <Text style={estilos.totalTexto}>Total</Text>
                <Text style={estilos.totalValor}>{soles(total)}</Text>
              </View>

              <Text style={estilos.campo}>Depósito</Text>
              <View style={estilos.dos}>
                <Pressable onPress={() => setDepositado(false)} style={[estilos.opcion, !depositado && estilos.opcionActiva]} accessibilityRole="button" accessibilityState={{ selected: !depositado }}>
                  <Text style={[estilos.opcionTexto, !depositado && { color: colores.blanco }]}>Pendiente</Text>
                </Pressable>
                <Pressable onPress={() => setDepositado(true)} style={[estilos.opcion, depositado && estilos.opcionActiva]} accessibilityRole="button" accessibilityState={{ selected: depositado }} testID="asignar-depositado">
                  <Text style={[estilos.opcionTexto, depositado && { color: colores.blanco }]}>Ya depositado</Text>
                </Pressable>
              </View>
              {depositado && <Text style={estilos.nota}>Lo depositado ya no se puede cambiar.</Text>}

              {!!fallo && <Aviso tipo="error" mensaje={fallo} />}
              <View style={estilos.botones}>
                <View style={{ flex: 1 }}>
                  <Boton titulo="Cancelar" variante="secundario" onPress={() => setModal(false)} deshabilitado={enviando} />
                </View>
                <View style={{ flex: 1 }}>
                  <Boton titulo="Asignar" onPress={() => void asignar()} cargando={enviando} deshabilitado={!!errorForm} />
                </View>
              </View>
              <Text style={estilos.pie}>El técnico lo ve al instante en Viáticos de su app.</Text>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

function Kpi({ valor, texto, color }: { valor: string; texto: string; color: string }) {
  return (
    <View style={estilos.kpi}>
      <Text style={[estilos.kpiValor, { color }]} numberOfLines={1} adjustsFontSizeToFit>
        {valor}
      </Text>
      <Text style={estilos.kpiTexto}>{texto}</Text>
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
  kpi: { flex: 1, backgroundColor: colores.blanco, borderWidth: 1, borderColor: colores.bordeSuave, borderRadius: 14, paddingVertical: 11, paddingHorizontal: 6, alignItems: 'center' },
  kpiValor: { fontSize: 19, fontWeight: '800' },
  kpiTexto: { fontSize: 11.5, color: colores.textoSecundario, marginTop: 1 },
  seccion: { fontSize: 13, fontWeight: '800', letterSpacing: 1.2, color: colores.textoSecundario, marginTop: 20, marginBottom: 10 },
  vacio: { textAlign: 'center', color: colores.textoSecundario, fontSize: 15, marginTop: 24 },
  tarjeta: { backgroundColor: colores.blanco, borderWidth: 1, borderColor: colores.bordeSuave, borderRadius: radios.tarjeta, padding: 14 },
  cabecera: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  servicioTitulo: { flex: 1, fontSize: 15.5, fontWeight: '800', color: colores.titulo },
  badge: { borderRadius: 8, paddingHorizontal: 9, paddingVertical: 4 },
  badgeTexto: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.3 },
  meta: { fontSize: 13, color: colores.textoSecundario },
  montosFila: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  montos: { flex: 1, fontSize: 13.5, color: colores.titulo, fontWeight: '600' },
  porcentaje: { fontSize: 14, fontWeight: '800' },
  barra: { height: 6, borderRadius: 3, backgroundColor: '#E2E8F0', overflow: 'hidden' },
  barraRelleno: { height: 6, borderRadius: 3 },
  detalle: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: colores.bordeSuave, gap: 10 },
  tecnico: { gap: 4 },
  tecnicoCabecera: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  tecnicoNombre: { fontSize: 14.5, fontWeight: '800', color: colores.titulo },
  tecnicoMonto: { fontSize: 14.5, fontWeight: '800', color: colores.titulo },
  linea: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 4 },
  lineaTexto: { flex: 1, fontSize: 13.5, color: colores.texto },
  chipDeposito: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  chipDepositoTexto: { fontSize: 11, fontWeight: '700' },
  subSeccion: { fontSize: 11.5, fontWeight: '800', letterSpacing: 1, color: colores.textoSecundario, marginTop: 4 },
  sinDatos: { fontSize: 13.5, color: colores.textoSecundario },
  gasto: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderTopWidth: 1, borderTopColor: colores.bordeSuave },
  gastoTitulo: { fontSize: 14.5, fontWeight: '700', color: colores.titulo },
  alertaIa: { fontSize: 12.5, color: '#B45309', fontWeight: '600' },
  enlace: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 },
  enlaceTexto: { color: colores.primario, fontSize: 14.5, fontWeight: '700' },
  nota: { fontSize: 12.5, color: colores.textoTenue, marginTop: 6, lineHeight: 18 },
  fondoModal: { flex: 1, backgroundColor: 'rgba(11,31,58,0.55)', justifyContent: 'center', padding: 20 },
  modal: { backgroundColor: colores.tarjeta, borderRadius: 18, padding: 20, maxWidth: 520, width: '100%', alignSelf: 'center', maxHeight: '92%' },
  modalTitulo: { fontSize: 19, fontWeight: '800', color: colores.titulo },
  campo: { fontSize: 13.5, fontWeight: '700', color: colores.titulo, marginTop: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 18, borderWidth: 1, borderColor: colores.borde, backgroundColor: colores.blanco },
  chipActivo: { backgroundColor: colores.primario, borderColor: colores.primario },
  chipTexto: { fontSize: 13.5, fontWeight: '600', color: colores.titulo },
  rejilla: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  campoMonto: { width: '47%', flexGrow: 1 },
  monto: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colores.borde, borderRadius: radios.campo, paddingHorizontal: 10, marginTop: 4 },
  montoPrefijo: { fontSize: 15, color: colores.textoSecundario, marginRight: 6 },
  montoEntrada: { flex: 1, paddingVertical: 10, fontSize: 15.5, color: colores.texto },
  total: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#F1F5F9', borderRadius: radios.campo, paddingHorizontal: 14, paddingVertical: 12 },
  totalTexto: { fontSize: 15, color: colores.textoSecundario },
  totalValor: { fontSize: 21, fontWeight: '800', color: colores.titulo },
  dos: { flexDirection: 'row', gap: 10 },
  opcion: { flex: 1, paddingVertical: 11, borderRadius: radios.campo, borderWidth: 1, borderColor: colores.borde, alignItems: 'center', backgroundColor: colores.blanco },
  opcionActiva: { backgroundColor: colores.primario, borderColor: colores.primario },
  opcionTexto: { fontSize: 14.5, fontWeight: '700', color: colores.titulo },
  botones: { flexDirection: 'row', gap: 12, marginTop: 8 },
  pie: { fontSize: 12.5, color: colores.textoSecundario, textAlign: 'center' },
});
