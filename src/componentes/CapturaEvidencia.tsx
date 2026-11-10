import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { ErrorApi } from '@/api/cliente';
import { capturarEvidencia, forzarEvidencia, type CabeceraEvidencias, type CodigoEvidencia, type Evidencia, type Evidencias, type ResultadoEvidencia } from '@/api/evidencias';
import { guardarCapturaPendiente, puedeGuardarSinConexion } from '@/api/colaEvidencias';
import { Boton } from '@/componentes/Boton';
import { useUbicacion } from '@/hooks/useUbicacion';
import { colores, radios } from '@/tema/colores';
import {
  DURACION_MAX_SEG,
  DURACION_MIN_SEG,
  MAX_MOTIVO_FORZAR,
  datosInforme,
  datosPlaca,
  motivoForzarValido,
  progresoGrabacion,
  puedeDetener,
  siguientePagina,
  textoDuracion,
} from '@/utilidades/evidencias';

const FONDO = '#0B1220';

interface Props {
  visible: boolean;
  evidencia: Evidencia | null;
  /** Hoja del informe que se va a capturar (1 para las demás evidencias). */
  pagina: number;
  cabecera: CabeceraEvidencias;
  token: string;
  /** Técnico de la sesión: dueño de las tomas que se guardan sin conexión. */
  idUsuario: number;
  /** Cierra la cámara. `huboCambios` = se guardó o se forzó algo: el panel se vuelve a leer. */
  onCerrar: (huboCambios: boolean) => void;
  /** Panel actualizado que devuelve el back al forzar una foto. */
  onPanel?: (p: Evidencias) => void;
}

/**
 * HU-11 / HU-12 / HU-13 — Captura de una evidencia con la cámara de la app (la galería está deshabilitada).
 *  - Foto: marco, GPS y hora sobre la imagen, "Analizando con IA…" y el resultado: VERIFICADA/APROBADA (con lo que leyó la IA) o RECHAZADA.
 *  - Microvideo de encendido (HU-13): graba de 3 a 5 s (sin audio), con el contador y la barra; al terminar toma un cuadro del display que analiza la IA
 *    ("Display detectado" / "No se detectó el display"). El GPS y la hora (UTC y local) se guardan con la captura.
 *  - Toma rechazada: "Repetir foto" o aceptarla a la fuerza (HU-12) solo con un motivo escrito; antes se muestran las consecuencias.
 */
export function CapturaEvidencia(props: Props) {
  if (!props.visible || !props.evidencia) return null;
  return (
    <Modal visible animationType="slide" onRequestClose={() => props.onCerrar(false)}>
      <CapturaActiva {...props} evidencia={props.evidencia} />
    </Modal>
  );
}

type Fase = 'camara' | 'grabando' | 'analizando' | 'resultado';

function CapturaActiva({ evidencia, pagina, cabecera, token, idUsuario, onCerrar, onPanel }: Props & { evidencia: Evidencia }) {
  const [permiso, pedirPermiso] = useCameraPermissions();
  const { ubicacion } = useUbicacion(true);
  const camara = useRef<CameraView>(null);
  const esVideo = evidencia.medio === 'video';
  const codigo = evidencia.codigo as CodigoEvidencia;

  const [fase, setFase] = useState<Fase>('camara');
  const [modo, setModo] = useState<'picture' | 'video'>('picture');
  const [listaCamara, setListaCamara] = useState(false);
  const [paginaActual, setPaginaActual] = useState(pagina);
  const [vista, setVista] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoEvidencia | null>(null);
  const [duracion, setDuracion] = useState(0);
  const [segundos, setSegundos] = useState(0);
  const [ahora, setAhora] = useState(() => new Date());
  const [error, setError] = useState<string | null>(null);
  const [rechazo, setRechazo] = useState(false);
  const [forzando, setForzando] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [hubo, setHubo] = useState(false);
  /** La toma quedó guardada en el teléfono esperando señal (la IA la valida al enviarla). */
  const [enCola, setEnCola] = useState(false);
  /** Causa técnica del último fallo al enviar (excepción, ruta, tiempos): se le pasa a soporte. */
  const [detalle, setDetalle] = useState<string | null>(null);
  const inicioGrabacion = useRef(0);
  const detenida = useRef(false);

  // Reloj de la marca de GPS y hora, y contador de la grabación
  useEffect(() => {
    const t = setInterval(() => {
      setAhora(new Date());
      if (inicioGrabacion.current > 0 && !detenida.current) {
        const s = (Date.now() - inicioGrabacion.current) / 1000;
        setSegundos(s);
        if (s >= DURACION_MAX_SEG) void detener();
      }
    }, 200);
    return () => clearInterval(t);
  }, []);

  const marcaGps = ubicacion ? `GPS ${ubicacion.latitud.toFixed(4)}, ${ubicacion.longitud.toFixed(4)}` : 'GPS buscando…';
  const marcaHora = `${ahora.toLocaleDateString('es-PE')} ${ahora.toLocaleTimeString('es-PE', { hour12: false })}`;
  const marcaUtc = ahora.toISOString().slice(11, 19);

  async function subir(archivoUri: string | undefined, cuadroUri: string | undefined, capturadoEn: string, dur?: number) {
    setFase('analizando');
    setError(null);
    try {
      const r = await capturarEvidencia(token, cabecera.idOs, cabecera.idOsEquipo, {
        codigo,
        pagina: codigo === 'informe' ? paginaActual : 1,
        archivoUri,
        cuadroUri,
        ubicacion,
        capturadoEn,
        duracionSeg: dur,
      });
      setHubo(true);
      setResultado(r);
      setFase('resultado');
      if (r.estado === 'rechazada') setRechazo(true);
    } catch (e) {
      // Causa real del fallo (para soporte): se muestra en pantalla y en la consola de la app
      const causa = e instanceof ErrorApi ? (e.detalleTecnico ?? `HTTP ${e.estadoHttp} · ${e.message}`) : e instanceof Error ? `${e.name}: ${e.message}` : String(e);
      setDetalle(causa);
      // Sin señal: la toma se guarda en el teléfono y se envía a la IA sola al volver la conexión (no cuenta como completa hasta entonces)
      if (e instanceof ErrorApi && e.estadoHttp === 0 && puedeGuardarSinConexion()) {
        try {
          await guardarCapturaPendiente({
            idUsuario,
            idOs: cabecera.idOs,
            idOsEquipo: cabecera.idOsEquipo,
            numeroOs: cabecera.numeroOs,
            equipo: `${cabecera.nombre} #${String(cabecera.numero).padStart(2, '0')}`,
            codigo,
            nombreEvidencia: evidencia.nombre,
            pagina: codigo === 'informe' ? paginaActual : 1,
            archivoUri,
            cuadroUri,
            ubicacion,
            capturadoEn,
            duracionSeg: dur,
          });
          setHubo(true);
          setEnCola(true);
          setFase('resultado');
          return;
        } catch {
          // no se pudo guardar en el teléfono: se muestra el aviso de siempre
        }
      }
      setError(
        e instanceof ErrorApi && e.estadoHttp === 0
          ? 'Sin conexión: la evidencia se valida con IA y se sube con señal. Vuelve a intentarlo cuando la tengas.'
          : e instanceof Error
            ? e.message
            : 'No se pudo guardar la evidencia.',
      );
      setFase('camara');
    }
  }

  async function tomarFoto() {
    if (!camara.current || fase !== 'camara') return;
    try {
      const f = await camara.current.takePictureAsync({ quality: 0.6, exif: false });
      if (!f?.uri) throw new Error('sin foto');
      setVista(f.uri);
      await subir(f.uri, undefined, new Date().toISOString());
    } catch (e) {
      if (!(e instanceof ErrorApi)) setError('No se pudo tomar la foto. Inténtalo de nuevo.');
    }
  }

  async function grabar() {
    if (!camara.current || fase !== 'camara') return;
    setError(null);
    setSegundos(0);
    detenida.current = false;
    setModo('video');
    setTimeout(() => {
      void (async () => {
        try {
          inicioGrabacion.current = Date.now();
          setFase('grabando');
          const v = await camara.current?.recordAsync({ maxDuration: DURACION_MAX_SEG });
          const dur = Math.min(DURACION_MAX_SEG, (Date.now() - inicioGrabacion.current) / 1000);
          inicioGrabacion.current = 0;
          detenida.current = true;
          setDuracion(dur);
          if (!v?.uri) throw new Error('sin video');
          // Cuadro del display para la IA: se toma ya fuera del modo video
          setModo('picture');
          setFase('analizando');
          await new Promise((r) => setTimeout(r, 900));
          let cuadro: string | undefined;
          for (let i = 0; i < 2 && !cuadro; i++) {
            try {
              cuadro = (await camara.current?.takePictureAsync({ quality: 0.5, exif: false }))?.uri;
            } catch {
              await new Promise((r) => setTimeout(r, 500));
            }
          }
          if (!cuadro) throw new Error('sin cuadro');
          setVista(cuadro);
          await subir(v.uri, cuadro, new Date().toISOString(), Math.round(dur * 10) / 10);
        } catch {
          inicioGrabacion.current = 0;
          setModo('picture');
          setFase('camara');
          setError('No se pudo grabar el video. Inténtalo de nuevo.');
        }
      })();
    }, 400);
  }

  async function detener() {
    if (detenida.current) return;
    detenida.current = true;
    try {
      camara.current?.stopRecording();
    } catch {
      // la grabación ya terminó
    }
  }

  function repetir() {
    setEnCola(false);
    setDetalle(null);
    setResultado(null);
    setVista(null);
    setRechazo(false);
    setForzando(false);
    setMotivo('');
    setError(null);
    setFase('camara');
  }

  async function aceptarForzada() {
    if (!resultado || !motivoForzarValido(motivo)) return;
    setOcupado(true);
    try {
      const r = await forzarEvidencia(token, cabecera.idOs, cabecera.idOsEquipo, resultado.idEvidencia, motivo);
      if (r.evidencias) onPanel?.(r.evidencias);
      setForzando(false);
      setRechazo(false);
      onCerrar(true);
    } catch (e) {
      setForzando(false);
      setError(e instanceof Error ? e.message : 'No se pudo aceptar la foto.');
    } finally {
      setOcupado(false);
    }
  }

  const rechazada = resultado?.estado === 'rechazada';
  const aprobada = !!resultado && !rechazada;
  const datos = resultado?.datosIa ?? null;
  const etiquetaCabecera = enCola
    ? { t: 'EN COLA · SIN SEÑAL', f: colores.azulFondo, c: colores.azulTexto }
    : !resultado
    ? esVideo ? { t: `REQUERIDO ${DURACION_MIN_SEG}–${DURACION_MAX_SEG} s`, f: '#FEE2E2', c: colores.rojoEtiquetaTexto }
              : null
    : rechazada
      ? { t: 'RECHAZADA POR IA', f: '#FEE2E2', c: colores.rojoEtiquetaTexto }
      : resultado.estado === 'omitida'
        ? { t: 'GUARDADA · SIN IA', f: colores.grisFondo, c: colores.grisTexto }
        : { t: codigo === 'placa' ? 'VERIFICADA POR IA' : esVideo ? `APROBADO ${Math.round(duracion)} s` : 'APROBADA', f: '#DCFCE7', c: colores.verdeEtiquetaTexto };

  return (
    <SafeAreaView style={estilos.area}>
      <View style={estilos.cabecera}>
        <Pressable onPress={() => onCerrar(hubo)} hitSlop={12} accessibilityRole="button" accessibilityLabel="Cerrar cámara" testID="cerrar-captura">
          <Ionicons name="close" size={28} color={colores.blanco} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={estilos.titulo}>{esVideo ? 'Validación de encendido' : evidencia.nombre}</Text>
          <Text style={estilos.subtitulo}>
            {esVideo ? `Captura de microvideo · ${cabecera.nombre} #${String(cabecera.numero).padStart(2, '0')}` : evidencia.descripcion}
            {resultado ? ` · intento ${resultado.intento}` : ''}
            {codigo === 'informe' && paginaActual > 1 ? ` · hoja ${paginaActual}` : ''}
          </Text>
        </View>
        {!!etiquetaCabecera && (
          <View style={[estilos.etiqueta, { backgroundColor: etiquetaCabecera.f }]}>
            <Text style={[estilos.etiquetaTexto, { color: etiquetaCabecera.c }]}>{etiquetaCabecera.t}</Text>
          </View>
        )}
      </View>

      {!permiso ? (
        <ActivityIndicator color={colores.blanco} style={{ marginTop: 40 }} />
      ) : !permiso.granted ? (
        <View style={estilos.sinPermiso}>
          <Ionicons name="camera-outline" size={40} color={colores.blanco} />
          <Text style={estilos.texto}>La app necesita la cámara para tomar la evidencia.</Text>
          <Boton titulo="Permitir cámara" onPress={() => void pedirPermiso()} />
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          {/* Vista de la cámara (o la toma ya hecha) */}
          <View style={{ flex: 1, backgroundColor: '#000' }}>
            {fase === 'camara' || fase === 'grabando' || (fase === 'analizando' && !vista) ? (
              <CameraView
                ref={camara}
                style={{ flex: 1 }}
                facing="back"
                mode={modo}
                mute
                videoQuality="480p"
                onCameraReady={() => setListaCamara(true)}
              />
            ) : vista ? (
              <Image source={{ uri: vista }} style={{ flex: 1 }} resizeMode="contain" accessibilityLabel="Toma de la evidencia" />
            ) : null}

            {fase === 'camara' && listaCamara && <View pointerEvents="none" style={[estilos.marco, esVideo && { height: 170, top: '30%' }]} />}
            {aprobada && <View pointerEvents="none" style={[estilos.marco, { borderColor: '#22C55E' }]} />}
            {rechazada && <View pointerEvents="none" style={[estilos.marco, { borderColor: '#F87171', borderStyle: 'dashed' }]} />}

            <View pointerEvents="none" style={estilos.marcaAgua}>
              <Text style={estilos.marcaTexto}>{marcaGps}</Text>
              {esVideo && <Text style={estilos.marcaTexto}>UTC: {marcaUtc}</Text>}
              <Text style={estilos.marcaTexto}>{esVideo ? `TS: ${marcaHora}` : marcaHora}</Text>
            </View>

            {fase === 'grabando' && (
              <View style={estilos.rec}>
                <View style={estilos.recPunto} />
                <Text style={estilos.recTexto}>REC {textoDuracion(segundos).replace(/^0:/, '00:')}</Text>
              </View>
            )}
            {fase === 'camara' && (
              <View pointerEvents="none" style={estilos.indicacion}>
                <Text style={estilos.indicacionTexto}>
                  {esVideo ? 'Enfoca el display del equipo y graba el encendido.' : codigo === 'placa' ? 'Encuadra la placa completa dentro del marco' : `Toma la foto: ${evidencia.descripcion.toLowerCase()}`}
                </Text>
              </View>
            )}
            {fase === 'analizando' && (
              <View style={estilos.analizando}>
                <ActivityIndicator color={colores.blanco} />
                <Text style={estilos.analizandoTexto}>Analizando con IA…</Text>
              </View>
            )}
          </View>

          {/* Panel inferior */}
          <View style={estilos.pie}>
            {error && <Text style={estilos.error}>{error}</Text>}
            {(error || enCola) && !!detalle && (
              <Text style={estilos.detalleTecnico} selectable testID="detalle-tecnico">
                Detalle técnico: {detalle}
              </Text>
            )}

            {fase === 'camara' && (
              <>
                {esVideo ? (
                  <Pressable onPress={() => void grabar()} style={estilos.disparador} accessibilityRole="button" accessibilityLabel="Grabar video" testID="grabar-video">
                    <View style={[estilos.disparadorInterno, { backgroundColor: colores.rojo, borderWidth: 0 }]} />
                  </Pressable>
                ) : (
                  <View style={estilos.herramientas}>
                    <View style={estilos.herramienta}>
                      <Ionicons name="images-outline" size={26} color="#64748B" />
                      <Text style={estilos.herramientaTexto}>Galería off</Text>
                    </View>
                    <Pressable onPress={() => void tomarFoto()} style={estilos.disparador} accessibilityRole="button" accessibilityLabel="Tomar foto" testID="disparar-evidencia">
                      <View style={estilos.disparadorInterno} />
                    </Pressable>
                    <View style={estilos.herramienta} />
                  </View>
                )}
                <Text style={estilos.ayuda}>{esVideo ? `Graba de ${DURACION_MIN_SEG} a ${DURACION_MAX_SEG} segundos` : 'Solo cámara de la app: la galería está deshabilitada'}</Text>
              </>
            )}

            {fase === 'grabando' && (
              <>
                <View style={estilos.barra}>
                  <View style={[estilos.barraRelleno, { width: `${Math.round(progresoGrabacion(segundos) * 100)}%` }, puedeDetener(segundos) && { backgroundColor: colores.rojo }]} />
                  <View style={[estilos.barraMarca, { left: `${(DURACION_MIN_SEG / DURACION_MAX_SEG) * 100}%` }]} />
                </View>
                <View style={estilos.barraEtiquetas}>
                  <Text style={estilos.ayuda}>0 s</Text>
                  <Text style={estilos.ayuda}>mín {DURACION_MIN_SEG} s</Text>
                  <Text style={estilos.ayuda}>máx {DURACION_MAX_SEG} s</Text>
                </View>
                <Pressable
                  onPress={() => void detener()}
                  disabled={!puedeDetener(segundos)}
                  style={[estilos.disparador, !puedeDetener(segundos) && { opacity: 0.4 }]}
                  accessibilityRole="button"
                  accessibilityLabel="Detener"
                  testID="detener-video"
                >
                  <View style={estilos.detener} />
                </Pressable>
                <Text style={estilos.ayuda}>{puedeDetener(segundos) ? 'DETENER' : `Sigue grabando · mínimo ${DURACION_MIN_SEG} s`}</Text>
              </>
            )}

            {fase === 'resultado' && enCola && (
              <>
                <View style={estilos.cajaAzul} testID="captura-en-cola">
                  <Text style={estilos.cajaAzulTexto}>
                    <Text style={{ fontWeight: '800' }}>Guardada en el teléfono, sin señal. </Text>
                    Se enviará sola a la IA cuando haya conexión (con la hora y el GPS de esta toma). Hasta que la IA la valide, la evidencia NO cuenta como completa.
                  </Text>
                </View>
                <View style={estilos.botones}>
                  <Pressable onPress={repetir} style={[estilos.boton, estilos.botonBorde]} accessibilityRole="button" testID="repetir-en-cola">
                    <Text style={[estilos.botonTexto, { color: colores.blanco }]}>{esVideo ? 'Grabar de nuevo' : 'Tomar de nuevo'}</Text>
                  </Pressable>
                  {codigo === 'informe' && paginaActual < 10 && (
                    <Pressable
                      onPress={() => {
                        setPaginaActual(siguientePagina(paginaActual));
                        repetir();
                      }}
                      style={[estilos.boton, estilos.botonBorde]}
                      accessibilityRole="button"
                      testID="agregar-pagina-en-cola"
                    >
                      <Ionicons name="add" size={20} color={colores.blanco} />
                      <Text style={[estilos.botonTexto, { color: colores.blanco }]}>Página</Text>
                    </Pressable>
                  )}
                  <Pressable onPress={() => onCerrar(true)} style={[estilos.boton, { backgroundColor: colores.primario }]} accessibilityRole="button" testID="listo-en-cola">
                    <Ionicons name="checkmark" size={20} color={colores.blanco} />
                    <Text style={estilos.botonTexto}>Listo</Text>
                  </Pressable>
                </View>
              </>
            )}

            {fase === 'resultado' && resultado && (
              <>
                {rechazada ? (
                  <>
                    <Text style={estilos.motivoIa}>
                      <Text style={{ color: '#FCA5A5', fontWeight: '800' }}>Motivo de la IA: </Text>
                      {resultado.motivoRechazo ?? 'La IA no pudo validar la toma.'}
                    </Text>
                    {!!datos?.sugerencia && <Text style={estilos.ayuda}>Sugerencia: {datos.sugerencia}</Text>}
                    <View style={estilos.botones}>
                      <Pressable onPress={repetir} style={[estilos.boton, { backgroundColor: colores.blanco }]} accessibilityRole="button" testID="repetir-foto">
                        <Ionicons name={esVideo ? 'videocam-outline' : 'camera-outline'} size={20} color={FONDO} />
                        <Text style={[estilos.botonTexto, { color: FONDO }]}>{esVideo ? 'Grabar de nuevo' : 'Repetir foto'}</Text>
                      </Pressable>
                      <Pressable onPress={() => setForzando(true)} style={[estilos.boton, estilos.botonForzar]} accessibilityRole="button" testID="aceptar-como-evidencia">
                        <Ionicons name="checkmark-done-outline" size={20} color="#FCA5A5" />
                        <Text style={[estilos.botonTexto, { color: '#FCA5A5' }]}>Aceptar como evidencia</Text>
                      </Pressable>
                    </View>
                  </>
                ) : (
                  <>
                    <Detalle codigo={codigo} datos={datos} coincide={resultado.coincide} numeroRq={resultado.numeroRq} duracion={duracion} omitida={resultado.estado === 'omitida'} />
                    <View style={estilos.botones}>
                      <Pressable onPress={repetir} style={[estilos.boton, estilos.botonBorde]} accessibilityRole="button" testID="repetir">
                        <Text style={[estilos.botonTexto, { color: colores.blanco }]}>Repetir</Text>
                      </Pressable>
                      {codigo === 'informe' && paginaActual < 10 && (
                        <Pressable
                          onPress={() => {
                            setPaginaActual(siguientePagina(paginaActual));
                            repetir();
                          }}
                          style={[estilos.boton, estilos.botonBorde]}
                          accessibilityRole="button"
                          testID="agregar-pagina"
                        >
                          <Ionicons name="add" size={20} color={colores.blanco} />
                          <Text style={[estilos.botonTexto, { color: colores.blanco }]}>Página</Text>
                        </Pressable>
                      )}
                      <Pressable onPress={() => onCerrar(true)} style={[estilos.boton, { backgroundColor: colores.primario }]} accessibilityRole="button" testID="usar-captura">
                        <Ionicons name="checkmark" size={20} color={colores.blanco} />
                        <Text style={estilos.botonTexto}>{esVideo ? 'Guardar video' : 'Usar foto'}</Text>
                      </Pressable>
                    </View>
                  </>
                )}
                {!!error && null}
              </>
            )}
          </View>
        </View>
      )}

      {/* Evidencia rechazada */}
      <Modal visible={rechazo && !forzando} transparent animationType="fade" onRequestClose={() => setRechazo(false)}>
        <View style={estilos.velo}>
          <View style={estilos.modal} testID="modal-rechazo">
            <View style={[estilos.iconoModal, { backgroundColor: colores.rojo }]}>
              <Ionicons name="close" size={36} color={colores.blanco} />
            </View>
            <Text style={[estilos.modalTitulo, { color: colores.rojoEtiquetaTexto, textAlign: 'center' }]}>Evidencia rechazada</Text>
            <View style={estilos.cajaRoja}>
              <Text style={estilos.cajaRojaTexto}>
                <Text style={{ fontWeight: '800' }}>Motivo: </Text>
                {resultado?.motivoRechazo ?? 'La IA no pudo validar la toma.'}
              </Text>
            </View>
            {!!datos?.sugerencia && <Text style={estilos.sugerencia}>Sugerencia: {datos.sugerencia}</Text>}
            <Pressable onPress={repetir} style={[estilos.botonPrimario, { backgroundColor: colores.primario }]} accessibilityRole="button" testID="modal-repetir">
              <Ionicons name={esVideo ? 'videocam-outline' : 'camera-outline'} size={20} color={colores.blanco} />
              <Text style={estilos.botonPrimarioTexto}>{esVideo ? 'Grabar de nuevo' : 'Repetir foto'}</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                setRechazo(false);
                setForzando(true);
              }}
              style={estilos.enlace}
              accessibilityRole="button"
              testID="forzar-continuacion"
            >
              <Text style={estilos.enlaceTexto}>Forzar continuación</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* HU-12 — Aceptar foto rechazada: consecuencias y motivo obligatorio */}
      <Modal visible={forzando} transparent animationType="fade" onRequestClose={() => setForzando(false)}>
        <View style={estilos.velo}>
          <View style={estilos.modal} testID="modal-forzar">
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Ionicons name="warning" size={32} color={colores.rojo} />
              <Text style={[estilos.modalTitulo, { color: colores.rojoEtiquetaTexto, flex: 1 }]}>Aceptar {esVideo ? 'video' : 'foto'} rechazada</Text>
            </View>
            <Text style={estilos.sugerencia}>
              La {esVideo ? 'toma' : 'foto'} de <Text style={{ fontWeight: '800', color: colores.titulo }}>{evidencia.nombre}</Text> se guardará como evidencia aunque la IA la rechazó.
            </Text>
            <View style={estilos.cajaRoja}>
              <Text style={estilos.cajaRojaTexto}>
                <Ionicons name="document-text-outline" size={14} /> Se registra como <Text style={{ fontWeight: '800' }}>excepción</Text> en el expediente.
              </Text>
              <Text style={estilos.cajaRojaTexto}>
                <Ionicons name="trending-down-outline" size={14} /> Impacta tu <Text style={{ fontWeight: '800' }}>scorecard</Text>.
              </Text>
              <Text style={estilos.cajaRojaTexto}>
                <Ionicons name="eye-outline" size={14} /> Queda <Text style={{ fontWeight: '800' }}>visible para Jefatura</Text>.
              </Text>
            </View>
            <Text style={estilos.etiquetaMotivo}>Escribe el motivo *</Text>
            <TextInput
              value={motivo}
              onChangeText={(t) => setMotivo(t.slice(0, MAX_MOTIVO_FORZAR))}
              placeholder="Describe por qué no se puede obtener una mejor toma"
              placeholderTextColor={colores.placeholder}
              multiline
              style={estilos.motivo}
              testID="motivo-forzar"
            />
            <Text style={estilos.contador}>
              {motivo.length} / {MAX_MOTIVO_FORZAR}
            </Text>
            <Pressable
              onPress={() => void aceptarForzada()}
              disabled={!motivoForzarValido(motivo) || ocupado}
              style={[estilos.botonPrimario, { backgroundColor: colores.rojo }, (!motivoForzarValido(motivo) || ocupado) && { opacity: 0.5 }]}
              accessibilityRole="button"
              testID="aceptar-foto-continuar"
            >
              {ocupado ? <ActivityIndicator color={colores.blanco} /> : <Text style={estilos.botonPrimarioTexto}>Aceptar {esVideo ? 'video' : 'foto'} y continuar</Text>}
            </Pressable>
            <Pressable onPress={() => setForzando(false)} style={estilos.enlace} accessibilityRole="button">
              <Text style={[estilos.enlaceTexto, { color: colores.textoSecundario }]}>Cancelar</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

/** Lo que muestra el panel cuando la IA aprobó la toma, según la evidencia. */
function Detalle(props: { codigo: CodigoEvidencia; datos: ResultadoEvidencia['datosIa']; coincide: boolean | null; numeroRq: string | null; duracion: number; omitida: boolean }) {
  const { codigo, datos } = props;
  if (props.omitida) return <Text style={estilos.ayuda}>La IA no estuvo disponible: la evidencia se guardó sin validar.</Text>;
  if (codigo === 'placa') {
    const filas = datosPlaca(datos);
    return (
      <View>
        <Text style={estilos.seccionIa}>LO QUE LEYÓ LA IA</Text>
        {filas.map((f) => (
          <View key={f.clave} style={estilos.filaIa}>
            <Text style={estilos.filaIaK}>{f.clave}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={estilos.filaIaV}>{f.valor}</Text>
              <Ionicons name="checkmark-circle" size={20} color="#22C55E" />
            </View>
          </View>
        ))}
        {props.coincide === true && (
          <Text style={estilos.coincide}>
            <Ionicons name="checkmark-done" size={14} /> Coincide con el equipo de la {props.numeroRq ?? 'RQ'}.
          </Text>
        )}
      </View>
    );
  }
  if (codigo === 'informe') {
    const d = datosInforme(datos);
    return (
      <View>
        <View style={estilos.filaIa}>
          <Text style={estilos.filaIaK}>Legibilidad</Text>
          <Text style={[estilos.filaIaV, { color: '#86EFAC' }]}>{d.legibilidad ?? '—'}</Text>
        </View>
        <View style={estilos.filaIa}>
          <Text style={estilos.filaIaK}>Hoja completa en el encuadre</Text>
          <Ionicons name={d.hojaCompleta === false ? 'close-circle' : 'checkmark-circle'} size={20} color={d.hojaCompleta === false ? '#F87171' : '#22C55E'} />
        </View>
        <View style={estilos.filaIa}>
          <Text style={estilos.filaIaK}>Firma del técnico visible</Text>
          <Ionicons name={d.firmaVisible === false ? 'close-circle' : 'checkmark-circle'} size={20} color={d.firmaVisible === false ? '#F87171' : '#22C55E'} />
        </View>
      </View>
    );
  }
  if (codigo === 'encendido') {
    return (
      <View>
        <View style={estilos.cajaVerde}>
          <Text style={estilos.cajaVerdeTexto}>
            <Ionicons name="checkmark-circle" size={16} /> Display detectado{datos?.lectura ? `: enciende y estabiliza en ${datos.lectura}.` : '.'}
          </Text>
        </View>
        <View style={estilos.filaIa}>
          <Text style={estilos.filaIaK}>Duración</Text>
          <Text style={estilos.filaIaV}>{Math.round(props.duracion)} s</Text>
        </View>
        <View style={estilos.filaIa}>
          <Text style={estilos.filaIaK}>Marca de agua</Text>
          <Text style={estilos.filaIaV}>GPS · UTC · TS</Text>
        </View>
      </View>
    );
  }
  return <Text style={estilos.ayuda}>La IA validó la toma como evidencia.</Text>;
}

const estilos = StyleSheet.create({
  area: { flex: 1, backgroundColor: '#000' },
  cabecera: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#000' },
  titulo: { color: colores.blanco, fontSize: 19, fontWeight: '800' },
  subtitulo: { color: '#94A3B8', fontSize: 14, marginTop: 1 },
  etiqueta: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, maxWidth: 150 },
  etiquetaTexto: { fontSize: 11.5, fontWeight: '800', letterSpacing: 0.3 },
  sinPermiso: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16, padding: 24 },
  texto: { color: colores.blanco, fontSize: 15, textAlign: 'center', lineHeight: 21 },
  marco: { position: 'absolute', alignSelf: 'center', top: '24%', width: '76%', height: 230, borderWidth: 3, borderColor: colores.blanco, borderRadius: 14 },
  marcaAgua: { position: 'absolute', left: 14, bottom: 14, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  marcaTexto: { color: colores.blanco, fontSize: 12.5, fontFamily: 'monospace' },
  rec: { position: 'absolute', right: 14, top: 14, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colores.rojo, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  recPunto: { width: 10, height: 10, borderRadius: 5, backgroundColor: colores.blanco },
  recTexto: { color: colores.blanco, fontWeight: '800', fontSize: 14 },
  indicacion: { position: 'absolute', left: 16, right: 16, top: 14, backgroundColor: 'rgba(0,87,184,0.92)', borderRadius: 10, padding: 12 },
  indicacionTexto: { color: colores.blanco, fontSize: 15, textAlign: 'center' },
  analizando: { position: 'absolute', alignSelf: 'center', top: '58%', flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colores.primario, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 8 },
  analizandoTexto: { color: colores.blanco, fontWeight: '800', fontSize: 15 },
  pie: { backgroundColor: FONDO, padding: 16, gap: 10 },
  herramientas: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16 },
  herramienta: { width: 70, alignItems: 'center', gap: 2 },
  herramientaTexto: { color: '#64748B', fontSize: 12.5 },
  disparador: { width: 76, height: 76, borderRadius: 38, backgroundColor: colores.blanco, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  disparadorInterno: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#E5E7EB', borderWidth: 3, borderColor: colores.blanco },
  detener: { width: 30, height: 30, borderRadius: 6, backgroundColor: colores.rojo },
  ayuda: { color: '#94A3B8', fontSize: 14, textAlign: 'center' },
  error: { color: '#FCA5A5', fontSize: 14.5, textAlign: 'center' },
  detalleTecnico: { color: '#94A3B8', fontSize: 11.5, textAlign: 'center', fontFamily: 'monospace' },
  barra: { height: 8, borderRadius: 4, backgroundColor: '#334155', overflow: 'hidden' },
  barraRelleno: { height: '100%', backgroundColor: '#F59E0B' },
  barraMarca: { position: 'absolute', top: 0, bottom: 0, width: 2, backgroundColor: colores.blanco },
  barraEtiquetas: { flexDirection: 'row', justifyContent: 'space-between' },
  motivoIa: { color: colores.blanco, fontSize: 15.5, lineHeight: 22 },
  botones: { flexDirection: 'row', gap: 10 },
  boton: { flex: 1, minHeight: 52, borderRadius: radios.boton, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 8 },
  botonBorde: { borderWidth: 1.5, borderColor: '#475569' },
  botonForzar: { borderWidth: 1.5, borderColor: '#F87171' },
  botonTexto: { color: colores.blanco, fontWeight: '700', fontSize: 15.5 },
  seccionIa: { color: '#94A3B8', fontSize: 13, fontWeight: '800', letterSpacing: 1 },
  filaIa: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: '#1E293B' },
  filaIaK: { color: '#CBD5E1', fontSize: 16, flexShrink: 1 },
  filaIaV: { color: colores.blanco, fontSize: 16.5, fontWeight: '800' },
  coincide: { color: '#86EFAC', fontSize: 15, marginTop: 8 },
  cajaAzul: { backgroundColor: 'rgba(59,130,246,0.15)', borderRadius: 10, padding: 12 },
  cajaAzulTexto: { color: '#BFDBFE', fontSize: 15, lineHeight: 21 },
  cajaVerde: { backgroundColor: 'rgba(34,197,94,0.15)', borderRadius: 10, padding: 10, marginBottom: 6 },
  cajaVerdeTexto: { color: '#86EFAC', fontSize: 15 },
  velo: { flex: 1, backgroundColor: 'rgba(2,6,23,0.7)', justifyContent: 'center', padding: 22 },
  modal: { backgroundColor: colores.blanco, borderRadius: 22, padding: 20, gap: 8 },
  iconoModal: { width: 74, height: 74, borderRadius: 37, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  modalTitulo: { fontSize: 24, fontWeight: '800' },
  cajaRoja: { backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FCA5A5', borderRadius: 12, padding: 12, gap: 6 },
  cajaRojaTexto: { color: colores.titulo, fontSize: 15.5, lineHeight: 22 },
  sugerencia: { color: colores.textoSecundario, fontSize: 15, lineHeight: 21 },
  botonPrimario: { minHeight: 54, borderRadius: radios.boton, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 6 },
  botonPrimarioTexto: { color: colores.blanco, fontSize: 18, fontWeight: '700' },
  enlace: { alignItems: 'center', paddingVertical: 10 },
  enlaceTexto: { color: colores.rojo, fontSize: 18, fontWeight: '700' },
  etiquetaMotivo: { fontSize: 17, fontWeight: '700', color: colores.titulo, marginTop: 6 },
  motivo: { borderWidth: 1, borderColor: colores.borde, borderRadius: radios.campo, padding: 12, fontSize: 16, minHeight: 84, textAlignVertical: 'top', color: colores.texto },
  contador: { textAlign: 'right', color: colores.textoSecundario, fontSize: 13.5 },
});
