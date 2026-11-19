import { useState } from 'react';
import { ActivityIndicator, Image, KeyboardAvoidingView, Modal, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { nombreDeCodigo, obtenerCatalogo } from '@/api/catalogos';
import { ErrorApi } from '@/api/cliente';
import { aprobarInforme, obtenerInformeRevision, observarInforme, urlEvidenciaInforme, type EvidenciaInforme } from '@/api/informesRevision';
import { Aviso } from '@/componentes/Aviso';
import { Boton } from '@/componentes/Boton';
import { EncabezadoApp } from '@/componentes/EncabezadoApp';
import { useConsulta } from '@/hooks/useConsulta';
import { useDiseno } from '@/hooks/useDiseno';
import { useSesion } from '@/sesion/SesionContext';
import { colores, radios } from '@/tema/colores';
import {
  MAX_INSTRUCCION,
  MAX_NOTA,
  alternarSeccion,
  errorObservar,
  estiloValidacion,
  etiquetaInforme,
  textoEspera,
  textoFechaHora,
} from '@/utilidades/informesRevision';

/**
 * HU-33 — Revisar un informe técnico (Jefe de Área): resumen y diagnóstico, validaciones (datos, ensayos, evidencias —con las FORZADAS resaltadas y su motivo—,
 * procedimiento y firmas) y las evidencias del informe. Dos decisiones, ambas con registro en el historial del informe y aviso al técnico:
 *  · Aprobar y liberar — solo con las validaciones obligatorias completas; el informe queda revisado (cerrado) y sigue a conformidad. Lo valida el back.
 *  · Observar — motivo, secciones afectadas, qué corregir y plazo; el informe pasa a "en corrección" y el técnico recibe la solicitud en su app.
 * Se abre desde Informes por revisar (?id=).
 */
export default function PantallaInformeRevision() {
  const { sesion } = useSesion();
  const usuario = sesion?.usuario;
  const token = sesion?.token ?? '';
  const d = useDiseno();
  const params = useLocalSearchParams<{ id?: string }>();
  const id = Number(params.id);
  const valido = Number.isInteger(id) && id > 0;

  const { datos, cargando, recargando, error, recargar } = useConsulta(async (tk) => {
    if (!valido) throw new ErrorApi('El informe indicado no es válido.', 400, 1);
    const [detalle, cargos] = await Promise.all([obtenerInformeRevision(tk, id), obtenerCatalogo(tk, 'CARGO_USUARIO').catch(() => undefined)]);
    return { detalle, cargos };
  }, params.id ?? '');

  const [modal, setModal] = useState<'observar' | 'aprobar' | null>(null);
  const [visor, setVisor] = useState<EvidenciaInforme | null>(null);
  const [motivo, setMotivo] = useState<string | null>(null);
  const [secciones, setSecciones] = useState<string[]>([]);
  const [instruccion, setInstruccion] = useState('');
  const [plazoHoras, setPlazoHoras] = useState<number | null>(null);
  const [nota, setNota] = useState('');
  const [lista, setLista] = useState<'motivo' | 'plazo' | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [fallo, setFallo] = useState<string | null>(null);
  const [resultado, setResultado] = useState<string | null>(null);

  const cargo = nombreDeCodigo(datos?.cargos, usuario?.cargo) ?? usuario?.cargo ?? 'Jefe de Área';
  const det = datos?.detalle ?? null;
  const c = det?.cabecera ?? null;
  const et = c ? etiquetaInforme({ estado: c.estado, slaVencido: c.slaVencido }) : null;
  const errorForm = errorObservar({ motivo, secciones, instruccion, plazoHoras });
  const motivoNombre = det?.motivos.find((m) => m.codigo === motivo)?.nombre ?? null;
  const plazoTexto = det?.plazos.find((p) => p.horas === plazoHoras)?.texto ?? null;

  function abrirObservar() {
    setMotivo(null);
    setSecciones([]);
    setInstruccion('');
    setPlazoHoras(null);
    setLista(null);
    setFallo(null);
    setModal('observar');
  }
  function abrirAprobar() {
    setNota('');
    setFallo(null);
    setModal('aprobar');
  }

  async function confirmar() {
    if (!modal || enviando) return;
    if (modal === 'observar' && errorForm) return setFallo(errorForm);
    setEnviando(true);
    setFallo(null);
    try {
      const r =
        modal === 'observar'
          ? await observarInforme(token, id, { motivo: motivo!, secciones, instruccion, plazoHoras: plazoHoras! })
          : await aprobarInforme(token, id, nota);
      setModal(null);
      setResultado(r.mensaje);
      void recargar();
    } catch (e) {
      setFallo(e instanceof Error ? e.message : 'No se pudo registrar la decisión.');
    } finally {
      setEnviando(false);
    }
  }

  const abierto = !!c && c.estado !== 'aprobado';

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
            Revisar informe
          </Text>
        </View>
        {!!c && <Text style={estilos.subtitulo}>{[c.cliente, c.numeroOs].filter(Boolean).join(' · ')}</Text>}

        {cargando ? (
          <ActivityIndicator color={colores.primario} style={{ marginTop: 40 }} />
        ) : error || !c || !det ? (
          <Aviso tipo="error" mensaje={error ?? 'No se pudo cargar el informe.'} />
        ) : (
          <>
            {/* Resumen */}
            <View style={estilos.tarjeta} testID="informe-resumen">
              <View style={estilos.cabecera}>
                <Text style={estilos.numero} numberOfLines={3}>
                  {c.numeroInforme}
                  {c.tipoServicio ? ` · ${c.tipoServicio}` : ''}
                </Text>
                {!!et && (
                  <View style={[estilos.badge, { backgroundColor: et.fondo }]}>
                    <Text style={[estilos.badgeTexto, { color: et.color }]}>{et.texto}</Text>
                  </View>
                )}
              </View>
              <Text style={estilos.meta}>
                {[c.codigoTw ?? c.equipo, c.tecnico, c.fechaEjecucion ? textoFechaHora(c.fechaEjecucion) : null].filter(Boolean).join(' · ')}
              </Text>
              {!!c.diagnostico && (
                <Text style={estilos.diagnostico}>
                  <Text style={{ fontWeight: '800' }}>Diagnóstico: </Text>
                  {c.diagnostico}
                </Text>
              )}
              {c.estado === 'por_revisar' && <Text style={estilos.espera}>En la bandeja {textoEspera(c.horasEspera)}{c.slaVencido ? ' · SLA vencido' : ''}</Text>}
            </View>

            {/* Corrección pedida al técnico */}
            {!!det.correccion && det.correccion.estado === 'pendiente' && (
              <View style={estilos.correccion} testID="informe-correccion">
                <Ionicons name="construct-outline" size={20} color="#9A3412" />
                <View style={{ flex: 1 }}>
                  <Text style={estilos.correccionTitulo}>Corrección pedida al técnico</Text>
                  <Text style={estilos.correccionTexto}>
                    <Text style={{ fontWeight: '800' }}>{det.correccion.motivoNombre ?? det.correccion.motivo}</Text>
                    {det.correccion.secciones.length > 0
                      ? ` · ${det.correccion.secciones.map((s) => det.secciones.find((x) => x.codigo === s)?.nombre ?? s).join(', ')}`
                      : ''}
                  </Text>
                  <Text style={estilos.correccionTexto}>{det.correccion.instruccion}</Text>
                  <Text style={estilos.correccionPie}>
                    {det.correccion.plazoEn ? `Plazo: ${textoFechaHora(det.correccion.plazoEn)}` : ''}
                    {det.correccion.por ? ` · pedida por ${det.correccion.por}` : ''}
                  </Text>
                </View>
              </View>
            )}

            {/* Aprobado */}
            {c.estado === 'aprobado' && (
              <View style={estilos.aprobado} testID="informe-aprobado">
                <Ionicons name="checkmark-circle" size={20} color="#166534" />
                <Text style={estilos.aprobadoTexto}>
                  Informe aprobado{c.revisor ? ` por ${c.revisor}` : ''}
                  {c.fechaRevision ? ` · ${textoFechaHora(c.fechaRevision)}` : ''}
                  {c.nota ? `\nNota: ${c.nota}` : ''}
                </Text>
              </View>
            )}

            {/* Validaciones */}
            <Text style={estilos.seccion}>VALIDACIONES</Text>
            <View style={estilos.lista} testID="informe-validaciones">
              {det.validaciones.map((v, i) => {
                const e = estiloValidacion(v.estado);
                return (
                  <View key={v.codigo} style={[estilos.validacion, i > 0 && estilos.separador]}>
                    <Ionicons name={e.icono} size={22} color={e.color} />
                    <View style={{ flex: 1 }}>
                      <Text style={estilos.validacionTitulo}>{v.titulo}</Text>
                      {!!v.detalle && <Text style={[estilos.validacionDetalle, v.estado !== 'ok' && { color: e.color }]}>{v.detalle}</Text>}
                    </View>
                  </View>
                );
              })}
            </View>

            {/* Evidencias */}
            <Text style={estilos.seccion}>EVIDENCIAS</Text>
            {det.evidencias.length === 0 ? (
              <Text style={estilos.vacio}>El informe no tiene evidencias.</Text>
            ) : (
              <View style={estilos.rejilla} testID="informe-evidencias">
                {det.evidencias.map((ev) => (
                  <Pressable
                    key={ev.idEvidencia}
                    onPress={() => setVisor(ev)}
                    style={[estilos.evidencia, ev.forzada && estilos.evidenciaForzada]}
                    accessibilityRole="button"
                    accessibilityLabel={`Evidencia ${ev.etiqueta}${ev.forzada ? ' forzada' : ''}`}
                  >
                    <Image
                      source={{ uri: urlEvidenciaInforme(id, ev.idEvidencia, ev.esVideo), headers: { Authorization: `Bearer ${token}` } }}
                      style={estilos.miniatura}
                      resizeMode="cover"
                    />
                    <Text style={[estilos.evidenciaTexto, ev.forzada && { color: '#B45309', fontWeight: '800' }]} numberOfLines={1}>
                      {ev.etiqueta}
                      {ev.forzada ? ' · FORZADA' : ''}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}

            {!!resultado && (
              <View style={{ marginTop: 14 }} testID="informe-resultado">
                <Aviso tipo="info" mensaje={resultado} />
              </View>
            )}

            {abierto && !resultado && !!c.motivoBloqueo && !c.puedeAprobar && (
              <View style={{ marginTop: 14 }} testID="informe-bloqueo">
                <Aviso tipo="info" mensaje={c.motivoBloqueo} />
              </View>
            )}

            {abierto && !resultado && (c.puedeObservar || c.puedeAprobar) && (
              <View style={estilos.botones}>
                <View style={{ flex: 1 }}>
                  <Boton titulo="Observar" variante="secundario" onPress={abrirObservar} deshabilitado={!c.puedeObservar} />
                </View>
                <View style={{ flex: 1 }}>
                  <Boton titulo="Aprobar y liberar" onPress={abrirAprobar} deshabilitado={!c.puedeAprobar} />
                </View>
              </View>
            )}
          </>
        )}
      </ScrollView>

      {/* Evidencia ampliada con su motivo si es forzada */}
      <Modal visible={visor !== null} transparent animationType="fade" onRequestClose={() => setVisor(null)}>
        <View style={estilos.fondoModal}>
          <View style={estilos.visor}>
            {!!visor && (
              <>
                <Text style={estilos.modalTitulo}>
                  {visor.etiqueta}
                  {visor.forzada ? ' · FORZADA' : ''}
                </Text>
                <Image
                  source={{ uri: urlEvidenciaInforme(id, visor.idEvidencia, visor.esVideo), headers: { Authorization: `Bearer ${token}` } }}
                  style={estilos.fotoGrande}
                  resizeMode="contain"
                />
                {visor.forzada && (
                  <Text style={estilos.motivoForzada}>
                    La IA no validó esta toma{visor.validacionIa ? ` (${visor.validacionIa})` : ''}. {visor.motivoForzada ? `Motivo del técnico: “${visor.motivoForzada}”` : ''}
                  </Text>
                )}
                <Boton titulo="Cerrar" variante="secundario" onPress={() => setVisor(null)} />
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* Observar informe / Aprobar y liberar */}
      <Modal visible={modal !== null} transparent animationType="fade" onRequestClose={() => { if (!enviando) setModal(null); }}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={estilos.fondoModal}>
          <View style={estilos.modal} testID="informe-dialogo">
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
              {modal === 'observar' ? (
                <>
                  <Text style={estilos.modalTitulo}>Observar informe</Text>
                  <Text style={estilos.modalSub}>{c?.tecnico ?? 'El técnico'} recibe la solicitud de corrección en su app.</Text>

                  <Text style={estilos.campo}>Motivo *</Text>
                  <Selector texto={motivoNombre} vacio="Elige el motivo" abierto={lista === 'motivo'} alAbrir={() => setLista(lista === 'motivo' ? null : 'motivo')} testID="observar-motivo" />
                  {lista === 'motivo' && (
                    <View style={estilos.opciones}>
                      {det?.motivos.map((m) => (
                        <Pressable key={m.codigo} onPress={() => { setMotivo(m.codigo); setLista(null); }} style={estilos.opcion} accessibilityRole="button">
                          <Text style={[estilos.opcionTexto, m.codigo === motivo && { color: colores.primario, fontWeight: '800' }]}>{m.nombre}</Text>
                        </Pressable>
                      ))}
                    </View>
                  )}

                  <Text style={estilos.campo}>Secciones afectadas *</Text>
                  <View style={estilos.chips}>
                    {det?.secciones.map((s) => {
                      const activa = secciones.includes(s.codigo);
                      return (
                        <Pressable
                          key={s.codigo}
                          onPress={() => setSecciones(alternarSeccion(secciones, s.codigo, det.secciones.map((x) => x.codigo)))}
                          style={[estilos.chip, activa && estilos.chipActivo]}
                          accessibilityRole="button"
                          accessibilityState={{ selected: activa }}
                          testID={`observar-seccion-${s.codigo}`}
                        >
                          <Text style={[estilos.chipTexto, activa && { color: colores.blanco }]}>{s.nombre}</Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  <Text style={estilos.campo}>Qué debe corregir *</Text>
                  <TextInput
                    value={instruccion}
                    onChangeText={setInstruccion}
                    placeholder="Ej.: Tomar foto de la placa del indicador o del certificado anterior con el N/S."
                    placeholderTextColor={colores.placeholder}
                    maxLength={MAX_INSTRUCCION}
                    multiline
                    editable={!enviando}
                    style={estilos.entrada}
                    testID="observar-instruccion"
                  />
                  <Text style={estilos.contador}>
                    {instruccion.length}/{MAX_INSTRUCCION}
                  </Text>

                  <Text style={estilos.campo}>Plazo *</Text>
                  <Selector texto={plazoTexto} vacio="Elige el plazo" abierto={lista === 'plazo'} alAbrir={() => setLista(lista === 'plazo' ? null : 'plazo')} testID="observar-plazo" />
                  {lista === 'plazo' && (
                    <View style={estilos.opciones}>
                      {det?.plazos.map((p) => (
                        <Pressable key={p.horas} onPress={() => { setPlazoHoras(p.horas); setLista(null); }} style={estilos.opcion} accessibilityRole="button">
                          <Text style={[estilos.opcionTexto, p.horas === plazoHoras && { color: colores.primario, fontWeight: '800' }]}>{p.texto}</Text>
                        </Pressable>
                      ))}
                    </View>
                  )}
                </>
              ) : (
                <>
                  <Ionicons name="checkmark-circle" size={44} color={colores.verde} style={{ alignSelf: 'center' }} />
                  <Text style={estilos.modalTitulo}>Aprobar y liberar</Text>
                  <Text style={estilos.modalSub}>
                    El informe {c?.numeroInforme} queda revisado y cerrado: ya no se podrá editar y sigue a conformidad. {c?.tecnico ?? 'El técnico'} recibirá el aviso.
                  </Text>
                  <Text style={estilos.campo}>Nota interna (opcional)</Text>
                  <TextInput
                    value={nota}
                    onChangeText={setNota}
                    placeholder="Ej.: Conforme."
                    placeholderTextColor={colores.placeholder}
                    maxLength={MAX_NOTA}
                    multiline
                    editable={!enviando}
                    style={estilos.entrada}
                    testID="aprobar-nota"
                  />
                  <Text style={estilos.contador}>
                    {nota.length}/{MAX_NOTA}
                  </Text>
                </>
              )}
              {!!fallo && <Aviso tipo="error" mensaje={fallo} />}
              <View style={estilos.botones}>
                <View style={{ flex: 1 }}>
                  <Boton titulo="Cancelar" variante="secundario" onPress={() => setModal(null)} deshabilitado={enviando} />
                </View>
                <View style={{ flex: 1 }}>
                  <Boton
                    titulo={modal === 'observar' ? 'Enviar a corrección' : 'Aprobar'}
                    onPress={() => void confirmar()}
                    cargando={enviando}
                    deshabilitado={modal === 'observar' && !!errorForm}
                  />
                </View>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

function Selector({ texto, vacio, abierto, alAbrir, testID }: { texto: string | null; vacio: string; abierto: boolean; alAbrir: () => void; testID?: string }) {
  return (
    <Pressable onPress={alAbrir} style={estilos.selector} accessibilityRole="button" testID={testID}>
      <Text style={[estilos.selectorTexto, !texto && { color: colores.placeholder }]}>{texto ?? vacio}</Text>
      <Ionicons name={abierto ? 'chevron-up' : 'chevron-down'} size={18} color={colores.textoSecundario} />
    </Pressable>
  );
}

const estilos = StyleSheet.create({
  area: { flex: 1, backgroundColor: colores.fondo },
  contenido: { paddingTop: 18, paddingBottom: 28, width: '100%', alignSelf: 'center' },
  tituloFila: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 2 },
  titulo: { fontWeight: '800', color: colores.titulo, flexShrink: 1 },
  subtitulo: { color: colores.textoSecundario, fontSize: 14.5, marginBottom: 12 },
  tarjeta: { backgroundColor: colores.blanco, borderWidth: 1, borderColor: colores.bordeSuave, borderRadius: radios.tarjeta, padding: 14, gap: 6 },
  cabecera: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  numero: { flex: 1, fontSize: 17, fontWeight: '800', color: colores.titulo },
  badge: { borderRadius: 8, paddingHorizontal: 9, paddingVertical: 4 },
  badgeTexto: { fontSize: 11, fontWeight: '800', letterSpacing: 0.3 },
  meta: { fontSize: 13.5, color: colores.textoSecundario },
  diagnostico: { fontSize: 14, lineHeight: 20, color: colores.texto, marginTop: 4 },
  espera: { fontSize: 12.5, color: colores.textoTenue, marginTop: 2 },
  correccion: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', backgroundColor: '#FFF7ED', borderWidth: 1, borderColor: '#FED7AA', borderRadius: radios.tarjeta, padding: 14, marginTop: 12 },
  correccionTitulo: { fontSize: 14.5, fontWeight: '800', color: '#9A3412' },
  correccionTexto: { fontSize: 13.5, lineHeight: 19, color: colores.titulo, marginTop: 3 },
  correccionPie: { fontSize: 12.5, color: colores.textoSecundario, marginTop: 4 },
  aprobado: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', backgroundColor: '#F0FDF4', borderWidth: 1, borderColor: '#BBF7D0', borderRadius: radios.tarjeta, padding: 14, marginTop: 12 },
  aprobadoTexto: { flex: 1, fontSize: 14, lineHeight: 20, color: '#166534', fontWeight: '600' },
  seccion: { fontSize: 13, fontWeight: '800', letterSpacing: 1.2, color: colores.textoSecundario, marginTop: 20, marginBottom: 10 },
  lista: { backgroundColor: colores.blanco, borderWidth: 1, borderColor: colores.bordeSuave, borderRadius: radios.tarjeta, paddingHorizontal: 14 },
  validacion: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', paddingVertical: 12 },
  separador: { borderTopWidth: 1, borderTopColor: colores.bordeSuave },
  validacionTitulo: { fontSize: 15.5, fontWeight: '700', color: colores.titulo },
  validacionDetalle: { fontSize: 13.5, color: colores.textoSecundario, marginTop: 2, lineHeight: 19 },
  vacio: { color: colores.textoSecundario, fontSize: 14.5, textAlign: 'center', paddingVertical: 14 },
  rejilla: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  evidencia: { width: '31.5%', flexGrow: 1, borderRadius: 10, borderWidth: 1, borderColor: colores.bordeSuave, backgroundColor: colores.blanco, padding: 4, gap: 4 },
  evidenciaForzada: { borderColor: '#F59E0B', borderWidth: 2 },
  miniatura: { width: '100%', aspectRatio: 1.25, borderRadius: 7, backgroundColor: '#E2E8F0' },
  evidenciaTexto: { fontSize: 11.5, color: colores.textoSecundario, textAlign: 'center' },
  botones: { flexDirection: 'row', gap: 12, marginTop: 16 },
  fondoModal: { flex: 1, backgroundColor: 'rgba(11,31,58,0.55)', justifyContent: 'center', padding: 20 },
  modal: { backgroundColor: colores.tarjeta, borderRadius: 18, padding: 20, maxWidth: 520, width: '100%', alignSelf: 'center', maxHeight: '92%' },
  visor: { backgroundColor: colores.tarjeta, borderRadius: 18, padding: 16, gap: 10, maxWidth: 520, width: '100%', alignSelf: 'center' },
  fotoGrande: { width: '100%', height: 320, borderRadius: radios.campo, backgroundColor: '#0F172A' },
  motivoForzada: { fontSize: 13.5, lineHeight: 19, color: '#92400E', backgroundColor: '#FFFBEB', borderRadius: 10, padding: 10 },
  modalTitulo: { fontSize: 19, fontWeight: '800', color: colores.titulo, textAlign: 'center' },
  modalSub: { fontSize: 13.5, lineHeight: 19, color: colores.textoSecundario, textAlign: 'center' },
  campo: { fontSize: 13.5, fontWeight: '700', color: colores.titulo, marginTop: 4 },
  selector: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: colores.borde, borderRadius: radios.campo, paddingHorizontal: 12, minHeight: 46 },
  selectorTexto: { flex: 1, fontSize: 14.5, color: colores.texto },
  opciones: { borderWidth: 1, borderColor: colores.bordeSuave, borderRadius: radios.campo, backgroundColor: colores.blanco },
  opcion: { paddingHorizontal: 12, paddingVertical: 12 },
  opcionTexto: { fontSize: 14.5, color: colores.texto },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 18, borderWidth: 1, borderColor: colores.borde, backgroundColor: colores.blanco },
  chipActivo: { backgroundColor: colores.primario, borderColor: colores.primario },
  chipTexto: { fontSize: 13.5, fontWeight: '600', color: colores.titulo },
  entrada: {
    borderWidth: 1,
    borderColor: colores.borde,
    borderRadius: radios.campo,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 84,
    fontSize: 14.5,
    color: colores.texto,
    textAlignVertical: 'top',
  },
  contador: { fontSize: 11.5, color: colores.textoSecundario, textAlign: 'right' },
});
