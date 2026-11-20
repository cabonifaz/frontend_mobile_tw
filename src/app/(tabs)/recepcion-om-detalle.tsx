import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect, useLocalSearchParams, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ErrorApi } from '@/api/cliente';
import { abrirPdf } from '@/api/procedimientos';
import { buscarInstrumentoPorQr, descargarConstanciaRecepcion, obtenerDetalleRecepcion, type InstrumentoRecepcion } from '@/api/recepcionOm';
import { actualizarBorrador, useBorradorRecepcion } from '@/almacen/borradorRecepcionOm';
import { Aviso } from '@/componentes/Aviso';
import { Boton } from '@/componentes/Boton';
import { CamaraApp } from '@/componentes/CamaraApp';
import { CampoTexto } from '@/componentes/CampoTexto';
import { EncabezadoApp } from '@/componentes/EncabezadoApp';
import { useConsulta } from '@/hooks/useConsulta';
import { useDiseno } from '@/hooks/useDiseno';
import { useSesion } from '@/sesion/SesionContext';
import { colores, radios } from '@/tema/colores';
import {
  MAX_CARGO_ENTREGO,
  MAX_ENTREGO,
  MAX_GUIA,
  MAX_MOTIVO_PARCIAL,
  MEDIOS_ENTREGA,
  etiquetaFisico,
  etiquetaOm,
  faltaInstrumento,
  faltaMotivoParcial,
  faltaTrazabilidad,
  instrumentosIncompletos,
  pendientesSinMarcar,
  textoAvance,
  textoFechaHora,
  textoFotos,
  textoMedio,
} from '@/utilidades/recepcionOm';

type Paso = 'instrumentos' | 'trazabilidad' | 'estado';

const nombreCorto = (i: Pick<InstrumentoRecepcion, 'nombre' | 'marca' | 'modelo'>) => i.nombre;
const lineaInstrumento = (i: InstrumentoRecepcion) => [[i.marca, i.modelo].filter(Boolean).join(' '), i.serie ? `N/S ${i.serie}` : null, i.capacidad].filter(Boolean).join(' · ');

/**
 * HU-23 — Recepción de una OM en tres pasos (Menú → Recepción Instrumentos OM → una OM):
 *  1. Instrumentos: se marcan (a mano o escaneando la etiqueta QR) los que llegaron; los ya recibidos antes quedan bloqueados.
 *  2. Trazabilidad de la entrega: N° de guía, medio de entrega y quién entrega (recibió y fecha salen del técnico y del servidor).
 *  3. Estado de cada instrumento recibido (estado físico, observaciones, accesorios y fotos con la cámara de la app; ver `recepcion-om-instrumento`).
 * Si quedan instrumentos sin recibir se pide el motivo de la recepción parcial (se avisa a Programación; la OM queda abierta). Sigue la firma de quien entrega
 * y el registro (`recepcion-om-constancia`). Lo que se va llenando vive en un borrador en memoria (las fotos ya están en el servidor).
 */
export default function PantallaRecepcionOmDetalle() {
  const { sesion } = useSesion();
  const usuario = sesion?.usuario;
  const d = useDiseno();
  const params = useLocalSearchParams<{ om?: string }>();
  const idOs = Number(params.om);
  const valido = Number.isInteger(idOs) && idOs > 0;
  const borrador = useBorradorRecepcion(idOs);

  const [paso, setPaso] = useState<Paso>('instrumentos');
  const [escaner, setEscaner] = useState(false);
  const [leyendo, setLeyendo] = useState(false);
  const [modalParcial, setModalParcial] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: 'error' | 'info'; texto: string } | null>(null);
  const [descargando, setDescargando] = useState<number | null>(null);
  /** Hora en que se abrió la recepción (solo se muestra: el servidor guarda la hora real al registrar). */
  const [ahora] = useState(() => new Date(Date.now() - 5 * 3_600_000).toISOString().slice(0, 16).replace('T', ' '));

  const { datos, cargando, recargando, error, recargar } = useConsulta(async (token) => {
    if (!valido) throw new ErrorApi('Orden no válida.', 400, 1);
    return obtenerDetalleRecepcion(token, idOs);
  }, params.om ?? '');

  const primeraVez = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (primeraVez.current) primeraVez.current = false;
      else void recargar();
    }, [recargar]),
  );

  const instrumentos = useMemo(() => datos?.instrumentos ?? [], [datos]);
  const pendientes = useMemo(() => instrumentos.filter((i) => !i.recibido).map((i) => i.idOsEquipo), [instrumentos]);
  // Solo cuentan los marcados que siguen pendientes (la OM pudo recibir otro en otro teléfono)
  const marcados = useMemo(() => borrador.marcados.filter((id) => pendientes.includes(id)), [borrador.marcados, pendientes]);
  const cab = datos?.cabecera;
  const total = cab?.totalInstrumentos ?? 0;
  const recibidos = cab?.recibidos ?? 0;
  const incompletos = instrumentosIncompletos({ ...borrador, marcados });
  const sinMarcar = pendientesSinMarcar(pendientes, marcados);
  const faltaTraz = faltaTrazabilidad(borrador);

  function alternar(i: InstrumentoRecepcion) {
    if (i.recibido) return;
    setMensaje(null);
    actualizarBorrador(idOs, (b) => ({ ...b, marcados: b.marcados.includes(i.idOsEquipo) ? b.marcados.filter((x) => x !== i.idOsEquipo) : [...b.marcados, i.idOsEquipo] }));
  }

  async function alLeerQr(contenido: string) {
    setEscaner(false);
    if (!sesion) return;
    setMensaje(null);
    setLeyendo(true);
    try {
      const r = await buscarInstrumentoPorQr(sesion.token, idOs, contenido.trim().slice(0, 300));
      const ya = instrumentos.find((x) => x.idOsEquipo === r.idOsEquipo);
      if (ya?.recibido) return setMensaje({ tipo: 'info', texto: `«${r.nombre}» ya se recibió en esta OM.` });
      actualizarBorrador(idOs, (b) => (b.marcados.includes(r.idOsEquipo) ? b : { ...b, marcados: [...b.marcados, r.idOsEquipo] }));
      setMensaje({ tipo: 'info', texto: `Instrumento marcado como recibido: ${r.nombre}.` });
    } catch (e) {
      setMensaje({ tipo: 'error', texto: e instanceof Error ? e.message : 'No se pudo leer el código.' });
    } finally {
      setLeyendo(false);
    }
  }

  function continuar() {
    setMensaje(null);
    if (paso === 'instrumentos') {
      if (marcados.length === 0) return setMensaje({ tipo: 'error', texto: 'Marca al menos un instrumento recibido.' });
      // Los marcados que ya no están pendientes se quitan del borrador
      actualizarBorrador(idOs, (b) => ({ ...b, marcados }));
      return setPaso('trazabilidad');
    }
    if (paso === 'trazabilidad') {
      if (faltaTraz) return setMensaje({ tipo: 'error', texto: faltaTraz });
      return setPaso('estado');
    }
    if (incompletos.length > 0) return setMensaje({ tipo: 'error', texto: 'Completa el estado físico, las observaciones y las fotos de cada instrumento recibido.' });
    if (sinMarcar.length > 0) return setModalParcial(true);
    irAFirma();
  }

  function irAFirma() {
    router.push({ pathname: '/recepcion-om-constancia', params: { om: String(idOs) } } as unknown as Href);
  }

  function atras() {
    setMensaje(null);
    if (paso === 'estado') return setPaso('trazabilidad');
    if (paso === 'trazabilidad') return setPaso('instrumentos');
    router.back();
  }

  async function verConstancia(idRecepcion: number) {
    if (!sesion || descargando) return;
    setDescargando(idRecepcion);
    setMensaje(null);
    try {
      await abrirPdf(await descargarConstanciaRecepcion(sesion.token, idRecepcion));
    } catch (e) {
      setMensaje({ tipo: 'error', texto: e instanceof Error ? e.message : 'No se pudo abrir la constancia.' });
    } finally {
      setDescargando(null);
    }
  }

  const faltaMotivo = faltaMotivoParcial(borrador.motivoParcial);
  const titulos: Record<Paso, string> = { instrumentos: 'Recepción en taller', trazabilidad: 'Trazabilidad de entrega', estado: 'Estado de los instrumentos' };

  return (
    <SafeAreaView style={estilos.area} edges={['top']}>
      <EncabezadoApp nombre={usuario?.nombre ?? ''} apellido={usuario?.apellido} subtitulo={`${usuario?.nombre ?? ''} · ${usuario?.cargo ?? 'Técnico de Metrología'}`} />
      <ScrollView
        contentContainerStyle={[estilos.contenido, { paddingHorizontal: d.margen, maxWidth: d.anchoMaximo }]}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={recargando} onRefresh={() => void recargar()} colors={[colores.primario]} />}
      >
        <View style={estilos.tituloFila}>
          <Pressable onPress={atras} hitSlop={12} accessibilityRole="button" accessibilityLabel="Volver">
            <Ionicons name="arrow-back" size={24} color={colores.titulo} />
          </Pressable>
          <Text style={[estilos.titulo, { fontSize: d.tituloPantalla }]} accessibilityRole="header">
            {titulos[paso]}
          </Text>
        </View>

        {cargando ? (
          <ActivityIndicator color={colores.primario} style={{ marginTop: 32 }} />
        ) : error || !cab ? (
          <Aviso tipo="error" mensaje={error ?? 'No se encontró la orden.'} />
        ) : (
          <>
            <Text style={estilos.subtitulo}>
              {cab.numero}
              {cab.cliente ? ` · ${cab.cliente}` : ''}
            </Text>

            <View style={estilos.resumen} testID="recepcion-resumen">
              <Dato k="OM" v={cab.numero} />
              <Dato k="CLIENTE" v={cab.cliente} />
              <Dato k="RQ" v={cab.numeroRq} />
              <Dato k="SERVICIO" v={cab.servicio} />
            </View>

            {!!mensaje && <Aviso tipo={mensaje.tipo} mensaje={mensaje.texto} />}

            {!cab.puedeRecibir ? (
              <View style={[estilos.tarjeta, { borderColor: colores.verde }]} testID="recepcion-completa">
                <Text style={estilos.tarjetaTitulo}>Recepción completa</Text>
                <Text style={estilos.nota}>Los {total} instrumentos de esta OM ya se recibieron. No hay nada más que recibir.</Text>
              </View>
            ) : paso === 'instrumentos' ? (
              <>
                <View style={estilos.avanceFila}>
                  <Text style={estilos.seccion}>INSTRUMENTOS DE LA OM</Text>
                  <Text style={estilos.avance}>{textoAvance(recibidos + marcados.length, total)}</Text>
                </View>
                <View style={estilos.barra}>
                  <View style={[estilos.barraRelleno, { width: `${total ? Math.round(((recibidos + marcados.length) / total) * 100) : 0}%` }]} />
                </View>
                {instrumentos.map((i) => {
                  const marcado = i.recibido || marcados.includes(i.idOsEquipo);
                  return (
                    <Pressable
                      key={i.idOsEquipo}
                      onPress={() => alternar(i)}
                      disabled={i.recibido}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: marcado, disabled: i.recibido }}
                      style={[estilos.instrumento, marcado && estilos.instrumentoMarcado, i.recibido && { opacity: 0.8 }]}
                      testID={`instrumento-${i.idOsEquipo}`}
                    >
                      <View style={[estilos.caja, marcado && estilos.cajaMarcada]}>{marcado && <Ionicons name="checkmark" size={16} color={colores.blanco} />}</View>
                      <View style={{ flex: 1 }}>
                        <Text style={estilos.instrumentoNombre}>{nombreCorto(i)}</Text>
                        <Text style={estilos.nota}>{lineaInstrumento(i)}</Text>
                      </View>
                      <View style={[estilos.pill, { backgroundColor: marcado ? colores.verdeEtiquetaFondo : colores.amarilloFondo }]}>
                        <Text style={[estilos.pillTexto, { color: marcado ? colores.verdeEtiquetaTexto : colores.amarilloTexto }]}>{marcado ? 'RECIBIDO' : 'PENDIENTE'}</Text>
                      </View>
                    </Pressable>
                  );
                })}
                <Pressable onPress={() => setEscaner(true)} disabled={leyendo} style={[estilos.escanear, leyendo && { opacity: 0.6 }]} accessibilityRole="button" testID="escanear-instrumento">
                  {leyendo ? <ActivityIndicator color={colores.primario} /> : <Ionicons name="qr-code-outline" size={20} color={colores.primario} />}
                  <Text style={estilos.escanearTexto}>Escanear etiqueta del instrumento</Text>
                </Pressable>
                <Boton titulo="Continuar" onPress={continuar} deshabilitado={marcados.length === 0} />
              </>
            ) : paso === 'trazabilidad' ? (
              <>
                <Text style={estilos.seccion}>TRAZABILIDAD DE ENTREGA</Text>
                <View style={estilos.tarjeta}>
                  <CampoTexto
                    etiqueta="N° guía de remisión *"
                    value={borrador.guia}
                    onChangeText={(t) => actualizarBorrador(idOs, (b) => ({ ...b, guia: t.slice(0, MAX_GUIA) }))}
                    placeholder="Ej.: T001-004587"
                    autoCapitalize="characters"
                    testID="recepcion-guia"
                  />
                  <Text style={estilos.etiquetaCampo}>MEDIO DE ENTREGA *</Text>
                  <View style={estilos.medios}>
                    {MEDIOS_ENTREGA.map((m) => {
                      const activo = borrador.medio === m.valor;
                      return (
                        <Pressable
                          key={m.valor}
                          onPress={() => actualizarBorrador(idOs, (b) => ({ ...b, medio: m.valor }))}
                          accessibilityRole="radio"
                          accessibilityState={{ checked: activo }}
                          style={[estilos.medio, activo && estilos.medioActivo]}
                          testID={`medio-${m.valor}`}
                        >
                          <Text style={[estilos.medioTexto, activo && { color: colores.blanco }]}>{m.texto}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  <CampoTexto
                    etiqueta="Entregó *"
                    value={borrador.entrego}
                    onChangeText={(t) => actualizarBorrador(idOs, (b) => ({ ...b, entrego: t.slice(0, MAX_ENTREGO) }))}
                    placeholder="Nombre de quien entrega"
                    autoCapitalize="words"
                    testID="recepcion-entrego"
                  />
                  <CampoTexto
                    etiqueta="Cargo o empresa (opcional)"
                    value={borrador.entregoCargo}
                    onChangeText={(t) => actualizarBorrador(idOs, (b) => ({ ...b, entregoCargo: t.slice(0, MAX_CARGO_ENTREGO) }))}
                    placeholder={cab.cliente ?? 'Ej.: Jefe de almacén'}
                    autoCapitalize="words"
                    testID="recepcion-entrego-cargo"
                  />
                  <CampoTexto etiqueta="Recibió" value={`${usuario?.nombre ?? ''} ${usuario?.apellido ?? ''}`.trim()} editable={false} />
                  <CampoTexto etiqueta="Fecha y hora" value={textoFechaHora(ahora)} editable={false} />
                </View>
                <Boton titulo="Continuar" onPress={continuar} deshabilitado={!!faltaTraz} />
                {!!faltaTraz && <Text style={estilos.faltan}>{faltaTraz}</Text>}
              </>
            ) : (
              <>
                <Text style={estilos.seccion}>INSTRUMENTOS RECIBIDOS · TOCA UNO PARA COMPLETARLO</Text>
                {marcados.map((id) => {
                  const i = instrumentos.find((x) => x.idOsEquipo === id);
                  const b = borrador.instrumentos[id];
                  const falta = faltaInstrumento(b);
                  const fis = etiquetaFisico(b?.estadoFisico);
                  if (!i) return null;
                  return (
                    <Pressable
                      key={id}
                      onPress={() => router.push({ pathname: '/recepcion-om-instrumento', params: { om: String(idOs), eq: String(id) } } as unknown as Href)}
                      accessibilityRole="button"
                      style={[estilos.instrumento, !falta && estilos.instrumentoMarcado]}
                      testID={`completar-${id}`}
                    >
                      <Ionicons name={falta ? 'ellipse-outline' : 'checkmark-circle'} size={24} color={falta ? colores.textoTenue : colores.verde} />
                      <View style={{ flex: 1 }}>
                        <Text style={estilos.instrumentoNombre}>{nombreCorto(i)}</Text>
                        <Text style={estilos.nota}>{falta ?? `${textoFotos(b?.fotos.length ?? 0)} · listo`}</Text>
                      </View>
                      {fis ? (
                        <View style={[estilos.pill, { backgroundColor: fis.fondo }]}>
                          <Text style={[estilos.pillTexto, { color: fis.color }]}>{fis.texto}</Text>
                        </View>
                      ) : (
                        <Ionicons name="chevron-forward" size={20} color={colores.textoSecundario} />
                      )}
                    </Pressable>
                  );
                })}
                {sinMarcar.length > 0 && (
                  <Aviso mensaje={`Faltan ${sinMarcar.length} ${sinMarcar.length === 1 ? 'instrumento' : 'instrumentos'} por recibir: será una recepción parcial y la OM quedará abierta.`} />
                )}
                <Boton titulo="Continuar" onPress={continuar} deshabilitado={incompletos.length > 0} />
              </>
            )}

            {datos && datos.recepciones.length > 0 && (
              <>
                <Text style={estilos.seccion}>RECEPCIONES REGISTRADAS</Text>
                {datos.recepciones.map((r) => {
                  const et = etiquetaOm(r.estado);
                  return (
                    <View key={r.idRecepcion} style={estilos.tarjeta} testID={`recepcion-${r.idRecepcion}`}>
                      <View style={estilos.tarjetaCabecera}>
                        <Text style={estilos.tarjetaTitulo}>Guía {r.guia}</Text>
                        <View style={[estilos.pill, { backgroundColor: et.fondo }]}>
                          <Text style={[estilos.pillTexto, { color: et.color }]}>{et.texto}</Text>
                        </View>
                      </View>
                      <Text style={estilos.nota}>
                        {textoFechaHora(r.fecha)} · {textoMedio(r.medio)} · entregó {r.entrego} · recibió {r.recibio}
                      </Text>
                      {!!r.motivoParcial && <Text style={estilos.nota}>Motivo: {r.motivoParcial}</Text>}
                      {r.tieneConstancia && (
                        <Pressable onPress={() => void verConstancia(r.idRecepcion)} disabled={descargando !== null} style={estilos.enlace} accessibilityRole="button" testID={`constancia-${r.idRecepcion}`}>
                          {descargando === r.idRecepcion ? <ActivityIndicator color={colores.primario} /> : <Ionicons name="document-text-outline" size={18} color={colores.primario} />}
                          <Text style={estilos.enlaceTexto}>Ver constancia (PDF)</Text>
                        </Pressable>
                      )}
                    </View>
                  );
                })}
              </>
            )}
          </>
        )}
      </ScrollView>

      <CamaraApp visible={escaner} modo="qr" onCerrar={() => setEscaner(false)} onQr={(t) => void alLeerQr(t)} />

      {/* Recepción parcial: falta un instrumento → motivo obligatorio */}
      <Modal visible={modalParcial} transparent animationType="fade" onRequestClose={() => setModalParcial(false)}>
        <View style={estilos.velo}>
          <View style={estilos.modal} testID="modal-parcial">
            <Ionicons name="alert-circle-outline" size={44} color={colores.naranja} style={{ alignSelf: 'center' }} />
            <Text style={estilos.modalTitulo}>Recepción parcial</Text>
            <Text style={estilos.modalTexto}>
              Falta {sinMarcar.length} de {total} {total === 1 ? 'instrumento' : 'instrumentos'}:{' '}
              <Text style={{ fontWeight: '800', color: colores.titulo }}>
                {sinMarcar
                  .map((id) => instrumentos.find((x) => x.idOsEquipo === id)?.nombre)
                  .filter(Boolean)
                  .join(', ')}
              </Text>
              .
            </Text>
            <CampoTexto
              etiqueta="Motivo *"
              value={borrador.motivoParcial}
              onChangeText={(t) => actualizarBorrador(idOs, (b) => ({ ...b, motivoParcial: t.slice(0, MAX_MOTIVO_PARCIAL) }))}
              placeholder="Ej.: El cliente lo enviará el 28/10 con otra guía."
              multiline
              testID="motivo-parcial"
            />
            <Text style={estilos.nota}>Se avisa a Programación; la OM queda abierta hasta recibirlo.</Text>
            {!!faltaMotivo && <Text style={estilos.faltan}>{faltaMotivo}</Text>}
            <Boton
              titulo="Registrar recepción parcial"
              onPress={() => {
                setModalParcial(false);
                irAFirma();
              }}
              deshabilitado={!!faltaMotivo}
            />
            <Boton titulo="Volver" variante="secundario" onPress={() => setModalParcial(false)} />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function Dato({ k, v }: { k: string; v: string | null }) {
  if (!v) return null;
  return (
    <View style={estilos.dato}>
      <Text style={estilos.datoK}>{k}</Text>
      <Text style={estilos.datoV}>{v}</Text>
    </View>
  );
}

const estilos = StyleSheet.create({
  area: { flex: 1, backgroundColor: colores.fondo },
  contenido: { paddingTop: 18, paddingBottom: 28, width: '100%', alignSelf: 'center', gap: 10 },
  tituloFila: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  titulo: { fontWeight: '700', color: colores.titulo, flexShrink: 1 },
  subtitulo: { color: colores.textoSecundario, fontSize: 14, marginTop: -4, marginLeft: 36 },
  resumen: { backgroundColor: colores.tarjeta, borderRadius: radios.tarjeta, borderWidth: 1, borderColor: colores.bordeSuave, padding: 14, flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  dato: { width: '47%', flexGrow: 1, gap: 2 },
  datoK: { fontSize: 10.5, fontWeight: '700', letterSpacing: 0.8, color: colores.textoSecundario },
  datoV: { fontSize: 14.5, color: colores.titulo, lineHeight: 20 },
  seccion: { fontSize: 11.5, fontWeight: '800', letterSpacing: 1, color: colores.textoSecundario, marginTop: 6 },
  avanceFila: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  avance: { fontSize: 13.5, fontWeight: '800', color: colores.primario },
  barra: { height: 6, backgroundColor: colores.grisFondo, borderRadius: 3, overflow: 'hidden' },
  barraRelleno: { height: '100%', backgroundColor: colores.primario },
  instrumento: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colores.tarjeta, borderRadius: radios.tarjeta, borderWidth: 1, borderColor: colores.bordeSuave, padding: 14 },
  instrumentoMarcado: { borderColor: colores.verdeBorde, backgroundColor: colores.verdeFondo },
  instrumentoNombre: { fontSize: 15.5, fontWeight: '800', color: colores.titulo },
  caja: { width: 24, height: 24, borderRadius: 6, borderWidth: 1.5, borderColor: colores.borde, backgroundColor: colores.blanco, alignItems: 'center', justifyContent: 'center' },
  cajaMarcada: { backgroundColor: colores.primario, borderColor: colores.primario },
  pill: { borderRadius: 8, paddingHorizontal: 9, paddingVertical: 3 },
  pillTexto: { fontSize: 11, fontWeight: '800', letterSpacing: 0.3 },
  nota: { fontSize: 12.5, color: colores.textoSecundario, lineHeight: 18, flexShrink: 1 },
  escanear: { minHeight: 50, borderRadius: radios.boton, borderWidth: 1.5, borderColor: colores.primario, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colores.tarjeta },
  escanearTexto: { color: colores.primario, fontSize: 16, fontWeight: '700' },
  tarjeta: { backgroundColor: colores.tarjeta, borderRadius: radios.tarjeta, borderWidth: 1, borderColor: colores.bordeSuave, padding: 14, gap: 10 },
  tarjetaCabecera: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  tarjetaTitulo: { flex: 1, fontSize: 15.5, fontWeight: '800', color: colores.titulo },
  etiquetaCampo: { fontSize: 11.5, fontWeight: '800', letterSpacing: 1, color: colores.textoSecundario },
  medios: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  medio: { borderWidth: 1, borderColor: colores.borde, borderRadius: radios.campo, paddingHorizontal: 14, paddingVertical: 11, backgroundColor: colores.tarjeta },
  medioActivo: { backgroundColor: colores.primario, borderColor: colores.primario },
  medioTexto: { fontSize: 14.5, fontWeight: '700', color: colores.titulo },
  faltan: { fontSize: 12.5, color: colores.textoSecundario, textAlign: 'center' },
  enlace: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 },
  enlaceTexto: { color: colores.primario, fontSize: 15, fontWeight: '700' },
  velo: { flex: 1, backgroundColor: 'rgba(2,6,23,0.6)', justifyContent: 'center', padding: 20 },
  modal: { backgroundColor: colores.blanco, borderRadius: 22, padding: 20, gap: 10 },
  modalTitulo: { fontSize: 22, fontWeight: '800', color: colores.titulo, textAlign: 'center' },
  modalTexto: { fontSize: 14.5, color: colores.textoSecundario, textAlign: 'center', lineHeight: 21 },
});
