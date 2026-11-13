import { useState } from 'react';
import { ActivityIndicator, Image, KeyboardAvoidingView, Modal, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  obtenerDetalleAprobacion,
  resolverAprobacion,
  urlArchivoAprobacion,
  type TipoDetalleAprobacion,
} from '@/api/aprobaciones';
import { nombreDeCodigo, obtenerCatalogo } from '@/api/catalogos';
import { ErrorApi } from '@/api/cliente';
import { Aviso } from '@/componentes/Aviso';
import { Boton } from '@/componentes/Boton';
import { EncabezadoApp } from '@/componentes/EncabezadoApp';
import { EtiquetaEstado } from '@/componentes/EtiquetaEstado';
import { useConsulta } from '@/hooks/useConsulta';
import { useDiseno } from '@/hooks/useDiseno';
import { useSesion } from '@/sesion/SesionContext';
import { colores, radios } from '@/tema/colores';
import { inicialesDe } from '@/utilidades/aprobaciones';
import { diaMesHora } from '@/utilidades/viaticos';

/**
 * HU-31 — Detalle de una evidencia forzada (HU-12), un ensayo guardado con error (HU-10) o un gasto rendido (HU-26/27) para el jefe.
 *  - Evidencia y ensayo: Aprobar o Rechazar (el motivo es obligatorio al rechazar). Gasto: Aprobar, Observar o Rechazar (motivo obligatorio al observar o rechazar; solo el Jefe de Operaciones).
 *  - El técnico recibe la notificación al instante y la decisión queda en la auditoría (lo hace el back, que además valida quién puede resolver).
 * Se abre desde Aprobaciones (?tipo=evidencia|ensayo|gasto&id=…).
 */
type Accion = 'aprobar' | 'observar' | 'rechazar';
const MAX_TEXTO = 500;
const TITULO: Record<TipoDetalleAprobacion, string> = { evidencia: 'Evidencia forzada', ensayo: 'Ensayo con error', gasto: 'Solicitud de gasto' };

const soles = (n: number | null | undefined) => (n === null || n === undefined ? '—' : `S/ ${n.toFixed(2)}`);

export default function PantallaAprobacionDetalle() {
  const { sesion } = useSesion();
  const usuario = sesion?.usuario;
  const token = sesion?.token ?? '';
  const d = useDiseno();
  const params = useLocalSearchParams<{ tipo?: string; id?: string }>();
  const tipo = (['evidencia', 'ensayo', 'gasto'] as const).find((t) => t === params.tipo) ?? null;
  const id = Number(params.id);
  const valido = tipo !== null && Number.isInteger(id) && id > 0;

  const { datos, cargando, recargando, error, recargar } = useConsulta(async (tk) => {
    if (!valido || !tipo) throw new ErrorApi('Solicitud no válida.', 400, 1);
    const [detalle, cargos] = await Promise.all([obtenerDetalleAprobacion(tk, tipo, id), obtenerCatalogo(tk, 'CARGO_USUARIO').catch(() => null)]);
    return { detalle, cargos };
  }, `${params.tipo ?? ''}-${params.id ?? ''}`);

  const [accion, setAccion] = useState<Accion | null>(null);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [fallo, setFallo] = useState<string | null>(null);
  const [resultado, setResultado] = useState<string | null>(null);

  const cargo = nombreDeCodigo(datos?.cargos, usuario?.cargo) ?? usuario?.cargo ?? 'Jefe de Área';
  const c = datos?.detalle.cabecera ?? null;
  const pendiente = c?.estado === 'pendiente';
  const textoObligatorio = accion !== 'aprobar';

  function abrir(a: Accion) {
    setTexto('');
    setFallo(null);
    setAccion(a);
  }

  async function confirmar() {
    if (!sesion || !tipo || !accion || enviando) return;
    const limpio = texto.trim();
    if (textoObligatorio && limpio.length < 3) {
      setFallo(accion === 'observar' ? 'Indica qué debe corregir el técnico.' : 'Indica el motivo del rechazo.');
      return;
    }
    setEnviando(true);
    setFallo(null);
    try {
      const mensaje = await resolverAprobacion(sesion.token, tipo, id, accion, limpio);
      setAccion(null);
      setResultado(mensaje);
      setTimeout(() => router.back(), 1200);
    } catch (e) {
      setFallo(e instanceof ErrorApi ? e.message : 'No se pudo registrar tu decisión. Inténtalo de nuevo.');
    } finally {
      setEnviando(false);
    }
  }

  const etiqueta =
    c?.estado === 'pendiente' ? (
      <EtiquetaEstado estado="pendiente" texto="PENDIENTE" />
    ) : c?.estado === 'observado' ? (
      <EtiquetaEstado estado="pendiente" texto="OBSERVADO" />
    ) : c?.estado === 'aprobada' || c?.estado === 'aprobado' ? (
      <EtiquetaEstado estado="conforme" texto="APROBADO" />
    ) : (
      <EtiquetaEstado estado="bloqueado" texto="RECHAZADO" />
    );

  return (
    <SafeAreaView style={estilos.area} edges={['top']}>
      <EncabezadoApp nombre={usuario?.nombre ?? ''} apellido={usuario?.apellido} subtitulo={`${usuario?.nombre ?? ''} · ${cargo}`} />
      <ScrollView
        contentContainerStyle={[estilos.contenido, { paddingHorizontal: d.margen, maxWidth: d.anchoMaximo }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={recargando} onRefresh={recargar} colors={[colores.primario]} />}
      >
        <View style={estilos.tituloFila}>
          <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Volver">
            <Ionicons name="arrow-back" size={24} color={colores.titulo} />
          </Pressable>
          <Text style={estilos.titulo} accessibilityRole="header">
            {tipo ? TITULO[tipo] : 'Aprobación'}
          </Text>
        </View>

        {cargando ? (
          <ActivityIndicator color={colores.primario} style={{ marginTop: 32 }} />
        ) : error ? (
          <Aviso tipo="error" mensaje={error} />
        ) : !c || !tipo ? (
          <Aviso tipo="error" mensaje="No se encontró la solicitud." />
        ) : (
          <>
            <View style={estilos.tarjeta} testID="aprobacion-detalle">
              <View style={estilos.quienFila}>
                <View style={estilos.avatar}>
                  <Text style={estilos.avatarTexto}>{inicialesDe(c.tecnico)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={estilos.tecnico} numberOfLines={2}>
                    {c.tecnico ?? 'Técnico'}
                  </Text>
                  <Text style={estilos.solicito}>
                    {c.titulo}
                    {c.solicitadaEn ? ` · ${diaMesHora(c.solicitadaEn)}` : ''}
                  </Text>
                </View>
                {etiqueta}
              </View>
              <View style={estilos.datos}>
                <Dato titulo="OS" valor={c.numeroOs} />
                <Dato titulo="CLIENTE" valor={c.cliente ?? '—'} />
                {tipo === 'evidencia' && <Dato titulo="EVIDENCIA" valor={c.codigoEvidencia ?? '—'} />}
                {tipo === 'ensayo' && <Dato titulo="EQUIPO" valor={c.equipo ?? '—'} />}
                {tipo === 'ensayo' && <Dato titulo="LECTURAS FUERA DEL EMP" valor={String(c.nCriticas ?? datos?.detalle.lecturas.length ?? 0)} />}
                {tipo === 'gasto' && <Dato titulo="CÓDIGO" valor={c.codigo ?? '—'} />}
                {tipo === 'gasto' && <Dato titulo="CONCEPTO" valor={c.concepto ?? '—'} />}
                {tipo === 'gasto' && <Dato titulo="MONTO" valor={soles(c.monto)} />}
                {tipo === 'gasto' && <Dato titulo="ORIGEN" valor={c.origen === 'reembolso' ? 'Reembolso' : 'Viático asignado'} />}
              </View>
              {!!c.detalle && <Text style={estilos.detalle}>{c.detalle}</Text>}
              {!!c.descripcion && <Text style={estilos.detalle}>{c.descripcion}</Text>}
            </View>

            {!!c.motivo && (
              <View style={estilos.motivo} testID="aprobacion-motivo">
                <Ionicons name="chatbubble-ellipses-outline" size={18} color={colores.primario} />
                <Text style={estilos.motivoTexto}>
                  <Text style={{ fontWeight: '800' }}>Motivo del técnico: </Text>“{c.motivo}”
                </Text>
              </View>
            )}
            {!!c.motivoRechazoIa && (
              <View style={{ marginTop: 12 }}>
                <Aviso tipo="info" mensaje={`La IA no validó la toma: ${c.motivoRechazoIa}`} />
              </View>
            )}

            {tipo === 'evidencia' && (
              <Image
                source={{ uri: urlArchivoAprobacion('evidencia', id, 1, !!c.esVideo), headers: { Authorization: `Bearer ${token}` } }}
                style={estilos.foto}
                resizeMode="contain"
                accessibilityLabel={c.esVideo ? 'Cuadro del video de la evidencia' : 'Foto de la evidencia'}
              />
            )}

            {tipo === 'ensayo' && datos && datos.detalle.lecturas.length > 0 && (
              <View style={[estilos.tarjeta, { marginTop: 14, gap: 8 }]} testID="aprobacion-lecturas">
                <Text style={estilos.seccion}>LECTURAS FUERA DEL EMP</Text>
                {datos.detalle.lecturas.map((l, i) => (
                  <Text key={i} style={estilos.detalle}>
                    {[l.tipo, l.punto].filter(Boolean).join(' · ') || 'Lectura'}: carga {l.carga ?? '—'} · lectura {l.lectura ?? '—'} · error {l.error ?? '—'} (EMP ±{l.tolerancia ?? '—'})
                  </Text>
                ))}
              </View>
            )}

            {tipo === 'gasto' && datos && (
              <>
                {datos.detalle.reparto.length > 0 && (
                  <View style={[estilos.tarjeta, { marginTop: 14, gap: 6 }]}>
                    <Text style={estilos.seccion}>REPARTO DEL VIÁTICO</Text>
                    {datos.detalle.reparto.map((r) => (
                      <Text key={r.idViaticoLinea} style={estilos.detalle}>
                        {r.concepto}: {soles(r.monto)}
                      </Text>
                    ))}
                  </View>
                )}
                {datos.detalle.fotos.length > 0 ? (
                  datos.detalle.fotos.map((f) => (
                    <Image
                      key={f.orden}
                      source={{ uri: urlArchivoAprobacion('gasto', id, f.orden), headers: { Authorization: `Bearer ${token}` } }}
                      style={estilos.foto}
                      resizeMode="contain"
                      accessibilityLabel={`Foto ${f.orden} del comprobante`}
                    />
                  ))
                ) : (
                  <View style={{ marginTop: 12 }}>
                    <Aviso tipo="info" mensaje={`Sin foto del comprobante${c.motivoSinFoto ? `: “${c.motivoSinFoto}”` : '.'}`} />
                  </View>
                )}
                {c.coincideIa !== null && (
                  <View style={{ marginTop: 12 }}>
                    <Aviso
                      tipo={c.coincideIa ? 'info' : 'error'}
                      mensaje={c.coincideIa ? `La IA leyó ${soles(c.montoIa)}: coincide con el monto.` : `La IA leyó ${soles(c.montoIa)}, distinto del monto declarado (${soles(c.monto)}).`}
                    />
                  </View>
                )}
              </>
            )}

            {!pendiente && (
              <View style={{ marginTop: 14 }}>
                <Aviso
                  tipo="info"
                  mensaje={`${c.resueltoPor ? `Resuelto por ${c.resueltoPor}` : 'Resuelto'}${c.resueltoEn ? ` · ${diaMesHora(c.resueltoEn)}` : ''}${c.comentario ? `: “${c.comentario}”` : '.'}`}
                />
              </View>
            )}
            {!!resultado && (
              <View style={{ marginTop: 14 }} testID="aprobacion-resultado">
                <Aviso tipo="info" mensaje={resultado} />
              </View>
            )}

            {pendiente && !resultado && !c.puedeResolver && (
              <View style={{ marginTop: 14 }}>
                <Aviso tipo="info" mensaje={tipo === 'gasto' ? 'Los gastos solo los resuelve el Jefe de Operaciones.' : 'Esta solicitud la resuelve el encargado del área del servicio.'} />
              </View>
            )}
            {pendiente && !resultado && c.puedeResolver && (
              <View style={estilos.botones}>
                <View style={{ flex: 1 }}>
                  <Boton titulo="Rechazar" variante="secundario" onPress={() => abrir('rechazar')} />
                </View>
                {tipo === 'gasto' && (
                  <View style={{ flex: 1 }}>
                    <Boton titulo="Observar" variante="secundario" onPress={() => abrir('observar')} />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Boton titulo="Aprobar" onPress={() => abrir('aprobar')} />
                </View>
              </View>
            )}
          </>
        )}
      </ScrollView>

      <Modal visible={accion !== null} transparent animationType="fade" onRequestClose={() => { if (!enviando) setAccion(null); }}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={estilos.fondoModal}>
          <View style={estilos.modal} testID="aprobacion-dialogo">
            <Ionicons
              name={accion === 'aprobar' ? 'checkmark-circle' : accion === 'observar' ? 'alert-circle' : 'close-circle'}
              size={44}
              color={accion === 'aprobar' ? colores.verde : accion === 'observar' ? colores.naranja : colores.rojo}
              style={{ alignSelf: 'center' }}
            />
            <Text style={estilos.modalTitulo}>{accion === 'aprobar' ? 'Aprobar' : accion === 'observar' ? 'Observar' : 'Rechazar'}</Text>
            <Text style={estilos.modalSub}>
              {accion === 'observar'
                ? `${c?.tecnico ?? 'El técnico'} recibirá tu observación y podrá corregir y reenviar el gasto.`
                : `${c?.tecnico ?? 'El técnico'} recibirá la notificación al instante y la decisión quedará en la auditoría.`}
            </Text>
            <Text style={estilos.modalCampo}>{accion === 'aprobar' ? 'Comentario (opcional)' : accion === 'observar' ? 'Qué debe corregir *' : 'Motivo del rechazo *'}</Text>
            <TextInput
              value={texto}
              onChangeText={setTexto}
              placeholder={accion === 'aprobar' ? 'Ej.: Conforme.' : accion === 'observar' ? 'Ej.: La foto no se lee, vuelve a tomarla.' : 'Ej.: El comprobante no corresponde al servicio.'}
              placeholderTextColor={colores.placeholder}
              maxLength={MAX_TEXTO}
              multiline
              editable={!enviando}
              style={estilos.entrada}
              testID="aprobacion-texto"
            />
            <Text style={estilos.contador}>
              {texto.length}/{MAX_TEXTO}
            </Text>
            {!!fallo && <Aviso tipo="error" mensaje={fallo} />}
            <View style={estilos.botones}>
              <View style={{ flex: 1 }}>
                <Boton titulo="Cancelar" variante="secundario" onPress={() => setAccion(null)} deshabilitado={enviando} />
              </View>
              <View style={{ flex: 1 }}>
                <Boton
                  titulo={accion === 'aprobar' ? 'Aprobar' : accion === 'observar' ? 'Observar' : 'Rechazar'}
                  onPress={confirmar}
                  cargando={enviando}
                  deshabilitado={textoObligatorio && texto.trim().length < 3}
                />
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

function Dato({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <View style={estilos.dato}>
      <Text style={estilos.datoTitulo}>{titulo}</Text>
      <Text style={estilos.datoValor}>{valor}</Text>
    </View>
  );
}

const estilos = StyleSheet.create({
  area: { flex: 1, backgroundColor: colores.fondo },
  contenido: { padding: 16, paddingBottom: 28, maxWidth: 560, width: '100%', alignSelf: 'center' },
  tituloFila: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4, marginBottom: 12 },
  titulo: { fontSize: 24, fontWeight: '700', color: colores.titulo, flexShrink: 1 },
  tarjeta: { backgroundColor: colores.tarjeta, borderRadius: radios.tarjeta, borderWidth: 1, borderColor: colores.bordeSuave, padding: 16, gap: 14 },
  quienFila: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#EA580C', alignItems: 'center', justifyContent: 'center' },
  avatarTexto: { color: colores.blanco, fontWeight: '800', fontSize: 15 },
  tecnico: { fontSize: 17, fontWeight: '800', color: colores.titulo },
  solicito: { fontSize: 12.5, color: colores.textoSecundario, marginTop: 1 },
  datos: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  dato: { width: '47%', flexGrow: 1, gap: 2 },
  datoTitulo: { fontSize: 10.5, fontWeight: '700', letterSpacing: 0.8, color: colores.textoSecundario },
  datoValor: { fontSize: 14.5, color: colores.titulo, lineHeight: 20 },
  detalle: { fontSize: 13.5, lineHeight: 19, color: colores.texto },
  seccion: { fontSize: 11, fontWeight: '800', letterSpacing: 1, color: colores.textoSecundario },
  foto: { width: '100%', height: 260, borderRadius: radios.campo, backgroundColor: '#E2E8F0', marginTop: 14 },
  motivo: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: colores.tarjeta,
    borderRadius: radios.campo,
    borderWidth: 1,
    borderColor: colores.bordeSuave,
    padding: 12,
    marginTop: 14,
  },
  motivoTexto: { flex: 1, fontSize: 13.5, lineHeight: 19, color: colores.texto },
  botones: { flexDirection: 'row', gap: 12, marginTop: 16 },
  fondoModal: { flex: 1, backgroundColor: 'rgba(11,31,58,0.55)', justifyContent: 'center', padding: 20 },
  modal: { backgroundColor: colores.tarjeta, borderRadius: 18, padding: 20, gap: 10, maxWidth: 520, width: '100%', alignSelf: 'center' },
  modalTitulo: { fontSize: 19, fontWeight: '800', color: colores.titulo, textAlign: 'center' },
  modalSub: { fontSize: 13.5, lineHeight: 19, color: colores.textoSecundario, textAlign: 'center' },
  modalCampo: { fontSize: 13.5, fontWeight: '700', color: colores.titulo, marginTop: 4 },
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
