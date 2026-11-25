import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ErrorApi } from '@/api/cliente';
import { nombreDeCodigo, obtenerCatalogo } from '@/api/catalogos';
import { MAX_FOTOS_ADICIONALES, capturarEvidencia, obtenerEvidenciasConRespaldo, quitarFotoAdicional, urlArchivoEvidencia, type Evidencia, type Evidencias, type FotoAdicional } from '@/api/evidencias';
import { guardarCapturaPendiente, puedeGuardarSinConexion, sincronizarEvidencias } from '@/api/colaEvidencias';
import { evaluarQrLocal } from '@/utilidades/qrEquipo';
import { horaRespaldo } from '@/api/respaldo';
import { Aviso } from '@/componentes/Aviso';
import { CamaraApp } from '@/componentes/CamaraApp';
import { CapturaEvidencia } from '@/componentes/CapturaEvidencia';
import { EncabezadoApp } from '@/componentes/EncabezadoApp';
import { useCapturasPendientes } from '@/hooks/useCapturasPendientes';
import { useConsulta } from '@/hooks/useConsulta';
import { useDiseno } from '@/hooks/useDiseno';
import { useSesion } from '@/sesion/SesionContext';
import { colores, radios } from '@/tema/colores';
import { fechaCorta, horaDe } from '@/utilidades/formato';
import {
  ETIQUETA_EN_COLA,
  EVIDENCIA_ADICIONAL,
  estaCompleta,
  etiquetaEvidencia,
  puedeAgregarAdicional,
  siguientePagina,
  textoAdicionales,
  textoAvance,
  textoDuracion,
  textoEnCola,
  textoFaltan,
  textoForzadas,
  tituloServicio,
} from '@/utilidades/evidencias';

/**
 * HU-11 — Registro fotográfico y validación IA (con HU-12 evidencia forzada y HU-13 microvideo de encendido).
 *  - Panel de las 9 evidencias con su estado y el avance "N de 9 completas"; las fotos se toman solo con la cámara de la app y cada una la valida la IA.
 *  - HU-12: una toma rechazada se puede aceptar a la fuerza con un motivo escrito: queda FORZADA y, con "Ver detalles", se ve el motivo, el rechazo de la IA,
 *    quién la aceptó, cuándo y los intentos previos.
 *  - HU-13: "Encendido" es un microvideo de 3 a 5 s; el QR se lee con la cámara y debe ser el del equipo; el informe a mano admite varias hojas.
 *  - "Guardar y volver" se habilita con las 9 completas. Capturar sube el archivo y espera a la IA; sin señal la toma queda EN COLA en el teléfono
 *    (`colaEvidencias`), se envía sola al volver la conexión y NO cuenta como completa hasta que la IA la valide.
 */
export default function PantallaRegistroFotografico() {
  const { sesion } = useSesion();
  const usuario = sesion?.usuario;
  const d = useDiseno();
  const params = useLocalSearchParams<{ id?: string; equipo?: string }>();
  const idOs = Number(params.id);
  const idOsEquipo = Number(params.equipo);
  const valido = Number.isInteger(idOs) && idOs > 0 && Number.isInteger(idOsEquipo) && idOsEquipo > 0;

  const [panel, setPanel] = useState<Evidencias | null>(null);
  const [captura, setCaptura] = useState<{ evidencia: Evidencia; pagina: number } | null>(null);
  const [escaner, setEscaner] = useState(false);
  const [abierta, setAbierta] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<{ tipo: 'error' | 'info'; texto: string } | null>(null);

  const { datos, cargando, recargando, error, recargar } = useConsulta(async (token) => {
    if (!valido) throw new ErrorApi('Servicio o equipo no válido.', 400, 1);
    const [r, cargos] = await Promise.all([
      obtenerEvidenciasConRespaldo(token, usuario?.idUsuario ?? 0, idOs, idOsEquipo),
      obtenerCatalogo(token, 'CARGO_USUARIO').catch(() => undefined),
    ]);
    return { evidencias: r.datos, sinConexion: r.sinConexion, guardadoEn: r.guardadoEn, cargos };
  }, `${params.id ?? ''}|${params.equipo ?? ''}`);

  const primeraVez = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (primeraVez.current) primeraVez.current = false;
      else void recargar();
    }, [recargar]),
  );

  // Tomas guardadas en el teléfono sin señal: esperan a la IA y no cuentan como completas
  const pendientes = useCapturasPendientes(usuario?.idUsuario, idOs, idOsEquipo);
  const enCola = new Set(pendientes.map((p) => p.codigo as string));
  const [enviando, setEnviando] = useState(false);
  const anteriores = useRef(0);
  useEffect(() => {
    // Cuando la cola se vacía (la envió el monitor o el botón) el panel se vuelve a leer con lo que dijo la IA
    const bajo = pendientes.length < anteriores.current;
    anteriores.current = pendientes.length;
    if (!bajo) return;
    void (async () => {
      await recargar();
      setPanel(null);
    })();
  }, [pendientes.length, recargar]);

  async function enviarAhora() {
    if (!sesion || enviando) return;
    setEnviando(true);
    setMensaje(null);
    try {
      const r = await sincronizarEvidencias(sesion.token, sesion.usuario.idUsuario);
      if (r.sinConexion) setMensaje({ tipo: 'error', texto: 'Sigue sin conexión con el servidor. Se enviarán solas cuando la haya.' });
      else if (r.avisos.length > 0) setMensaje({ tipo: 'error', texto: r.avisos.join('\n\n') });
      else if (r.enviadas > 0) setMensaje({ tipo: 'info', texto: 'Evidencias enviadas: la IA ya las validó.' });
      await recargar();
      setPanel(null);
    } catch (e) {
      setMensaje({ tipo: 'error', texto: e instanceof Error ? e.message : 'No se pudieron enviar las evidencias.' });
    } finally {
      setEnviando(false);
    }
  }

  const cargo = nombreDeCodigo(datos?.cargos, usuario?.cargo) ?? usuario?.cargo ?? 'Técnico de Campo';
  const actual = panel && datos && panel.cabecera.idOsEquipo === datos.evidencias.cabecera.idOsEquipo && !recargando ? panel : (datos?.evidencias ?? null);
  const c = actual?.cabecera;
  const token = sesion?.token ?? '';

  function tocar(e: Evidencia) {
    setMensaje(null);
    if (!c?.puedeRegistrar) {
      return setMensaje({ tipo: 'info', texto: 'Para registrar evidencias el equipo debe estar en ejecución. Reanúdalo o inícialo desde los objetivos.' });
    }
    const abrir = (pagina = 1) => (e.medio === 'qr' ? setEscaner(true) : setCaptura({ evidencia: e, pagina }));
    if (e.estado === 'pendiente' || e.estado === 'rechazada') return abrir(1);
    // Ya está completa: no se repite por accidente
    const opciones = [
      ...(e.codigo === 'informe' ? [{ text: 'Agregar página', onPress: () => abrir(siguientePagina(e.paginas)) }] : []),
      { text: e.medio === 'video' ? 'Grabar de nuevo' : e.medio === 'qr' ? 'Leer de nuevo' : 'Repetir foto', onPress: () => abrir(1) },
      { text: 'Cancelar', style: 'cancel' as const },
    ];
    Alert.alert(e.nombre, 'Esta evidencia ya está registrada. ¿Qué quieres hacer?', opciones);
  }

  /** Fotos adicionales: extras opcionales, sin IA; no cuentan en las 9 ni en "Guardar y volver". */
  function agregarAdicional() {
    setMensaje(null);
    if (!c?.puedeRegistrar) {
      return setMensaje({ tipo: 'info', texto: 'Para agregar fotos el equipo debe estar en ejecución. Reanúdalo o inícialo desde los objetivos.' });
    }
    setCaptura({ evidencia: EVIDENCIA_ADICIONAL, pagina: 1 });
  }

  function quitarAdicional(f: FotoAdicional) {
    Alert.alert(`Quitar la foto adicional ${f.numero}`, 'La foto dejará de formar parte del servicio. ¿Quieres quitarla?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Quitar',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            if (!sesion || !c) return;
            setMensaje(null);
            try {
              await quitarFotoAdicional(sesion.token, c.idOs, c.idOsEquipo, f.idEvidencia);
              await recargar();
              setPanel(null);
            } catch (e) {
              setMensaje({ tipo: 'error', texto: e instanceof Error ? e.message : 'No se pudo quitar la foto.' });
            }
          })();
        },
      },
    ]);
  }

  async function alLeerQr(contenido: string) {
    setEscaner(false);
    if (!sesion || !c) return;
    setMensaje(null);
    // Sin señal el QR se verifica en el teléfono con los datos del equipo (el técnico está junto al equipo) y se registra al volver la conexión
    if (datos?.sinConexion) return void (await leerQrSinSenal(contenido));
    try {
      const r = await capturarEvidencia(sesion.token, c.idOs, c.idOsEquipo, { codigo: 'qr', capturadoEn: new Date().toISOString(), qrTexto: contenido.slice(0, 300) });
      setMensaje({ tipo: r.estado === 'rechazada' ? 'error' : 'info', texto: r.estado === 'rechazada' ? `${r.motivoRechazo ?? 'El QR no corresponde a este equipo.'} Se leyó: «${contenido.slice(0, 80)}»` : r.mensaje || 'QR del equipo leído.' });
      await recargar();
      setPanel(null);
    } catch (e) {
      if (e instanceof ErrorApi && e.estadoHttp === 0) return void (await leerQrSinSenal(contenido));
      setMensaje({ tipo: 'error', texto: e instanceof Error ? e.message : 'No se pudo registrar el QR.' });
    }
  }

  /** QR sin conexión: la misma regla del servidor contra el equipo guardado; si corresponde se guarda en el teléfono y se envía solo con señal. */
  async function leerQrSinSenal(contenido: string) {
    if (!sesion || !c) return;
    const veredicto = evaluarQrLocal(contenido, c);
    if (veredicto === 'invalido') return setMensaje({ tipo: 'error', texto: 'El código leído no es válido.' });
    if (veredicto === 'no_coincide') {
      return setMensaje({ tipo: 'error', texto: `El QR leído no corresponde a este equipo. Escanea la etiqueta del equipo que estás trabajando. Se leyó: «${contenido.slice(0, 80)}»` });
    }
    if (!puedeGuardarSinConexion()) return setMensaje({ tipo: 'error', texto: 'Sin conexión: esta versión de la app no puede guardar el QR en el teléfono.' });
    try {
      await guardarCapturaPendiente({
        idUsuario: sesion.usuario.idUsuario,
        idOs: c.idOs,
        idOsEquipo: c.idOsEquipo,
        numeroOs: c.numeroOs,
        equipo: `${c.nombre} #${String(c.numero).padStart(2, '0')}`,
        codigo: 'qr',
        nombreEvidencia: 'QR del equipo',
        pagina: 1,
        capturadoEn: new Date().toISOString(),
        qrTexto: contenido.slice(0, 300),
      });
      setMensaje({
        tipo: 'info',
        texto: veredicto === 'coincide'
          ? `QR verificado en el teléfono: corresponde a este equipo${c.codigoTw ? ` (${c.codigoTw})` : ''}. Se registra solo al volver la señal.`
          : 'Etiqueta QR leída. El servidor la confirma con este equipo al volver la señal.',
      });
    } catch {
      setMensaje({ tipo: 'error', texto: 'No se pudo guardar el QR en el teléfono. Inténtalo de nuevo.' });
    }
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
            Registro fotográfico
          </Text>
        </View>

        {cargando ? (
          <ActivityIndicator color={colores.primario} style={{ marginTop: 40 }} />
        ) : error || !actual || !c ? (
          <Aviso tipo="error" mensaje={error ?? 'No se encontró el equipo.'} />
        ) : (
          <>
            <Text style={estilos.subtitulo}>
              {c.nombre} #{String(c.numero).padStart(2, '0')} · {c.numeroOs}
            </Text>
            {datos?.sinConexion && (
              <View style={{ marginBottom: 10 }}>
                <Aviso mensaje={`Sin conexión: se muestra lo último guardado (${horaRespaldo(datos.guardadoEn)}). ${puedeGuardarSinConexion() ? 'Las tomas se guardan en el teléfono y la IA las valida al volver la señal.' : 'Capturar evidencias exige conexión.'}`} />
              </View>
            )}

            <View style={estilos.tarjeta} testID="cabecera-evidencias">
              <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
                <Text style={[estilos.servicio, { flex: 1 }]}>{tituloServicio(c)}</Text>
                <View style={[estilos.pill, { backgroundColor: c.estado === 'pausado' ? colores.amarilloFondo : colores.azulFondo }]}>
                  <Text style={[estilos.pillTexto, { color: c.estado === 'pausado' ? colores.amarilloTexto : colores.azulTexto }]}>{c.estado === 'pausado' ? 'PAUSADO' : 'EN EJECUCIÓN'}</Text>
                </View>
              </View>
              <Text style={estilos.linea}>
                NS: {c.numeroSerie ?? '—'} · COD: {c.codigoCliente ?? '—'} · COD TW: {c.codigoTw ?? '—'}
              </Text>
              <Text style={estilos.linea}>
                Marca: {c.marca ?? '—'} · Modelo: {c.modelo ?? '—'}
              </Text>
            </View>

            {c.puedeGuardar ? (
              <View style={[estilos.banner, estilos.bannerVerde]}>
                <Ionicons name="checkmark-circle" size={22} color={colores.verde} />
                <Text style={estilos.bannerTexto}>
                  <Text style={{ fontWeight: '800' }}>Registro fotográfico completo.</Text> Todas las evidencias fueron validadas por la IA.
                </Text>
              </View>
            ) : (
              <View style={[estilos.banner, estilos.bannerAzul]}>
                <Ionicons name="camera-outline" size={22} color={colores.titulo} />
                <Text style={estilos.bannerTexto}>Solo cámara de la app: la galería está deshabilitada. Cada evidencia la valida la IA.</Text>
              </View>
            )}
            {c.informeFisico === false && (
              <View style={[estilos.banner, estilos.bannerAzul]} testID="aviso-sin-informe-fisico">
                <Ionicons name="document-outline" size={22} color={colores.titulo} />
                <Text style={estilos.bannerTexto}>Este servicio no lleva informe físico: no se pide la foto del informe.</Text>
              </View>
            )}
            {c.forzadas > 0 && (
              <View style={[estilos.banner, estilos.bannerAmarillo]} testID="aviso-forzadas">
                <Ionicons name="alert-circle-outline" size={22} color={colores.titulo} />
                <Text style={estilos.bannerTexto}>{textoForzadas(c.forzadas)}</Text>
              </View>
            )}
            {pendientes.length > 0 && (
              <View style={[estilos.banner, estilos.bannerAzul, { flexDirection: 'column', alignItems: 'stretch' }]} testID="aviso-en-cola">
                <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                  <Ionicons name="cloud-upload-outline" size={22} color={colores.titulo} />
                  <Text style={estilos.bannerTexto}>{textoEnCola(pendientes.length)}</Text>
                </View>
                <Pressable
                  onPress={() => void enviarAhora()}
                  disabled={enviando}
                  style={[estilos.enviarAhora, enviando && { opacity: 0.6 }]}
                  accessibilityRole="button"
                  testID="enviar-ahora"
                >
                  {enviando ? <ActivityIndicator color={colores.blanco} /> : <Text style={estilos.enviarAhoraTexto}>Enviar ahora</Text>}
                </Pressable>
              </View>
            )}
            {mensaje && (
              <View style={{ marginTop: 12 }} testID="mensaje-evidencias">
                <Aviso tipo={mensaje.tipo} mensaje={mensaje.texto} />
              </View>
            )}

            <View style={estilos.avanceFila}>
              <Text style={estilos.avanceK}>Evidencias</Text>
              <Text style={[estilos.avanceV, c.puedeGuardar && { color: colores.verde }]}>{textoAvance(c)}</Text>
            </View>
            <View style={estilos.barra}>
              <View style={[estilos.barraRelleno, { width: `${c.total ? Math.round((c.completas / c.total) * 100) : 0}%` }, c.puedeGuardar && { backgroundColor: colores.verde }]} />
            </View>

            <View style={estilos.rejilla}>
              {actual.evidencias.map((e) => (
                <TarjetaEvidencia
                  key={e.codigo}
                  e={e}
                  enCola={enCola.has(e.codigo)}
                  abierta={abierta === e.codigo}
                  idOs={c.idOs}
                  idOsEquipo={c.idOsEquipo}
                  token={token}
                  onTocar={() => tocar(e)}
                  onDetalles={() => setAbierta((v) => (v === e.codigo ? null : e.codigo))}
                />
              ))}
            </View>

            <SeccionAdicionales
              fotos={actual.adicionales ?? []}
              enCola={pendientes.filter((p) => p.codigo === 'adicional').length}
              idOs={c.idOs}
              idOsEquipo={c.idOsEquipo}
              token={token}
              onAgregar={agregarAdicional}
              onQuitar={quitarAdicional}
            />

            <Pressable
              onPress={() => router.back()}
              disabled={!c.puedeGuardar}
              style={[estilos.guardar, c.puedeGuardar ? estilos.guardarActivo : estilos.guardarBloqueado]}
              accessibilityRole="button"
              accessibilityState={{ disabled: !c.puedeGuardar }}
              testID="guardar-y-volver"
            >
              <Ionicons name={c.puedeGuardar ? 'checkmark-done' : 'lock-closed-outline'} size={22} color={colores.blanco} />
              <Text style={estilos.guardarTexto}>{c.puedeGuardar ? 'Guardar y volver a trabajo en el equipo' : 'Guardar y volver'}</Text>
            </Pressable>
            {!c.puedeGuardar && <Text style={estilos.ayuda}>{textoFaltan(c)}</Text>}
          </>
        )}
      </ScrollView>

      {c && (
        <CapturaEvidencia
          visible={!!captura}
          evidencia={captura?.evidencia ?? null}
          pagina={captura?.pagina ?? 1}
          cabecera={c}
          token={token}
          idUsuario={usuario?.idUsuario ?? 0}
          onPanel={(p) => setPanel(p)}
          onCerrar={(cambios) => {
            setCaptura(null);
            if (cambios) {
              void recargar();
              setPanel(null);
            }
          }}
        />
      )}
      <CamaraApp visible={escaner} modo="qr" onCerrar={() => setEscaner(false)} onQr={(t) => void alLeerQr(t)} />
    </SafeAreaView>
  );
}

function TarjetaEvidencia(props: {
  e: Evidencia;
  /** Hay una toma guardada en el teléfono esperando señal para esta evidencia. */
  enCola: boolean;
  abierta: boolean;
  idOs: number;
  idOsEquipo: number;
  token: string;
  onTocar: () => void;
  onDetalles: () => void;
}) {
  const { e } = props;
  const completa = estaCompleta(e);
  // Una evidencia aún no completa con su toma en cola se muestra EN COLA; si ya estaba completa conserva su estado y avisa de la nueva toma
  const et = props.enCola && !completa ? ETIQUETA_EN_COLA : etiquetaEvidencia(e);
  const forzada = e.estado === 'forzada';
  const conImagen = e.idEvidencia !== null && e.medio !== 'qr' && !(e.medio === 'video' && !e.tieneCuadro);
  const uri = conImagen && e.idEvidencia !== null ? urlArchivoEvidencia(props.idOs, props.idOsEquipo, e.idEvidencia, e.medio === 'video') : null;

  return (
    <View style={[estilos.evidencia, forzada && estilos.evidenciaForzada, props.abierta && { width: '100%' }]} testID={`evidencia-${e.codigo}`}>
      <Pressable onPress={props.onTocar} accessibilityRole="button" accessibilityLabel={`${e.nombre}: ${et.texto}`}>
        <View style={[estilos.miniatura, e.medio === 'video' && !uri && { backgroundColor: '#0F172A' }, !uri && e.medio !== 'video' && estilos.miniaturaVacia]}>
          {uri ? (
            <Image source={{ uri, headers: { Authorization: `Bearer ${props.token}` } }} style={StyleSheet.absoluteFill} resizeMode="cover" accessibilityLabel={`Toma de ${e.nombre}`} />
          ) : e.medio === 'qr' && completa ? (
            <Ionicons name="qr-code" size={64} color={colores.titulo} />
          ) : e.medio === 'video' ? (
            <Ionicons name="videocam" size={34} color={colores.blanco} />
          ) : (
            <Ionicons name="camera-outline" size={34} color={colores.primario} />
          )}
          {e.medio === 'video' && (
            <View style={[estilos.insignia, completa && { backgroundColor: 'rgba(0,0,0,0.65)' }]}>
              <Text style={estilos.insigniaTexto}>{completa && e.duracionSeg ? textoDuracion(e.duracionSeg) : '3–5 s'}</Text>
            </View>
          )}
          {e.medio === 'video' && uri && <Ionicons name="play-circle" size={44} color="rgba(255,255,255,0.9)" />}
          {e.codigo === 'informe' && e.paginas > 1 && (
            <View style={[estilos.insignia, { backgroundColor: 'rgba(0,0,0,0.65)', left: 6, right: undefined }]}>
              <Text style={estilos.insigniaTexto}>{e.paginas} hojas</Text>
            </View>
          )}
        </View>
        <Text style={estilos.nombre}>
          {e.nombre}
          {e.obligatoria ? <Text style={{ color: colores.rojo }}> *</Text> : null}
        </Text>
        <Text style={estilos.descripcion}>{e.descripcion}</Text>
        <View style={[estilos.pill, { backgroundColor: et.fondo, alignSelf: 'flex-start', marginTop: 8 }]}>
          <Text style={[estilos.pillTexto, { color: et.color }]}>{et.texto}</Text>
        </View>
        {props.enCola && completa && <Text style={estilos.nuevaEnCola}>Nueva toma en cola</Text>}
      </Pressable>

      {forzada && (
        <>
          <Pressable onPress={props.onDetalles} style={estilos.verDetalles} accessibilityRole="button" accessibilityState={{ expanded: props.abierta }} testID={`detalles-${e.codigo}`}>
            <Text style={estilos.verDetallesTexto}>{props.abierta ? 'Ocultar detalles' : 'Ver detalles'}</Text>
            <Ionicons name={props.abierta ? 'chevron-up' : 'chevron-down'} size={18} color={colores.primario} />
          </Pressable>
          {props.abierta && (
            <View style={{ marginTop: 6 }} testID={`detalle-forzada-${e.codigo}`}>
              <Dato k="Motivo del técnico" v={e.motivoForzado ?? '—'} largo />
              <Dato k="Rechazo de la IA" v={e.motivoRechazoIa ?? '—'} largo />
              <Dato k="Aceptada por" v={e.forzadaPor ?? '—'} />
              <Dato k="Fecha y hora" v={e.forzadaEn ? `${fechaCorta(e.forzadaEn)} ${horaDe(e.forzadaEn)}` : '—'} />
              <Dato k="Intentos previos" v={String(e.intentosPrevios)} />
              <Dato k="Registro" v="Bitácora de auditoría" />
              <Dato k="Visible para" v="Jefatura" />
            </View>
          )}
        </>
      )}
    </View>
  );
}

/** «Fotos adicionales»: extras opcionales del servicio (hasta 20). No pasan por la IA, no cuentan en "N de 9 completas" y no bloquean "Guardar y volver". */
function SeccionAdicionales(props: {
  fotos: FotoAdicional[];
  /** Fotos adicionales guardadas en el teléfono esperando señal. */
  enCola: number;
  idOs: number;
  idOsEquipo: number;
  token: string;
  onAgregar: () => void;
  onQuitar: (f: FotoAdicional) => void;
}) {
  const puede = puedeAgregarAdicional(props.fotos.length, props.enCola, MAX_FOTOS_ADICIONALES);
  return (
    <View style={estilos.adicionales} testID="fotos-adicionales">
      <View style={estilos.adicionalesCabecera}>
        <Text style={[estilos.nombre, { marginTop: 0, flex: 1 }]}>Fotos adicionales</Text>
        <View style={[estilos.pill, { backgroundColor: colores.grisFondo }]}>
          <Text style={[estilos.pillTexto, { color: colores.grisTexto }]}>OPCIONAL</Text>
        </View>
      </View>
      <Text style={estilos.descripcion}>Fotos extra del servicio. No cuentan en las 9 evidencias ni las revisa la IA.</Text>
      <Text style={estilos.adicionalesContador}>{textoAdicionales(props.fotos.length, props.enCola, MAX_FOTOS_ADICIONALES)}</Text>

      {(props.fotos.length > 0 || props.enCola > 0) && (
        <View style={estilos.adicionalesRejilla}>
          {props.fotos.map((f) => (
            <View key={f.idEvidencia} style={estilos.adicionalMiniatura} testID={`adicional-${f.numero}`}>
              <Image
                source={{ uri: urlArchivoEvidencia(props.idOs, props.idOsEquipo, f.idEvidencia), headers: { Authorization: `Bearer ${props.token}` } }}
                style={StyleSheet.absoluteFill}
                resizeMode="cover"
                accessibilityLabel={`Foto adicional ${f.numero}`}
              />
              <View style={estilos.adicionalNumero}>
                <Text style={estilos.insigniaTexto}>{f.numero}</Text>
              </View>
              <Pressable
                onPress={() => props.onQuitar(f)}
                hitSlop={8}
                style={estilos.adicionalQuitar}
                accessibilityRole="button"
                accessibilityLabel={`Quitar la foto adicional ${f.numero}`}
                testID={`quitar-adicional-${f.numero}`}
              >
                <Ionicons name="close" size={16} color={colores.blanco} />
              </Pressable>
            </View>
          ))}
          {Array.from({ length: props.enCola }, (_, i) => (
            <View key={`cola-${i}`} style={[estilos.adicionalMiniatura, estilos.miniaturaVacia]}>
              <Ionicons name="cloud-upload-outline" size={24} color={colores.azulTexto} />
              <Text style={estilos.nuevaEnCola}>En cola</Text>
            </View>
          ))}
        </View>
      )}

      <Pressable
        onPress={props.onAgregar}
        disabled={!puede}
        style={[estilos.adicionalBoton, !puede && { opacity: 0.5 }]}
        accessibilityRole="button"
        accessibilityState={{ disabled: !puede }}
        testID="agregar-adicional"
      >
        <Ionicons name="camera-outline" size={22} color={colores.primario} />
        <Text style={estilos.adicionalBotonTexto}>{puede ? 'Agregar foto adicional' : `Máximo ${MAX_FOTOS_ADICIONALES} fotos`}</Text>
      </Pressable>
    </View>
  );
}

function Dato({ k, v, largo = false }: { k: string; v: string; largo?: boolean }) {
  return largo ? (
    <View style={estilos.datoLargo}>
      <Text style={estilos.datoK}>{k}</Text>
      <Text style={estilos.datoDetalle}>{v}</Text>
    </View>
  ) : (
    <View style={estilos.dato}>
      <Text style={estilos.datoK}>{k}</Text>
      <Text style={estilos.datoV}>{v}</Text>
    </View>
  );
}

const estilos = StyleSheet.create({
  area: { flex: 1, backgroundColor: colores.fondo },
  contenido: { paddingTop: 18, paddingBottom: 28, width: '100%', alignSelf: 'center' },
  tituloFila: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4 },
  titulo: { fontWeight: '700', color: colores.titulo, flexShrink: 1 },
  subtitulo: { color: colores.textoSecundario, fontSize: 14, marginBottom: 10 },
  tarjeta: { backgroundColor: colores.blanco, borderWidth: 1, borderColor: colores.bordeSuave, borderRadius: radios.tarjeta, padding: 16 },
  servicio: { fontSize: 18, fontWeight: '800', color: colores.titulo, lineHeight: 24 },
  linea: { fontSize: 15, color: colores.textoSecundario, marginTop: 5, lineHeight: 21 },
  pill: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  pillTexto: { fontSize: 11.5, fontWeight: '800', letterSpacing: 0.3 },
  banner: { flexDirection: 'row', gap: 10, alignItems: 'center', borderRadius: radios.tarjeta, padding: 14, marginTop: 12, borderWidth: 1 },
  bannerAzul: { backgroundColor: colores.primarioSuave, borderColor: '#BFDBFE' },
  bannerVerde: { backgroundColor: colores.verdeFondo, borderColor: colores.verdeBorde },
  bannerAmarillo: { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' },
  bannerTexto: { flex: 1, color: colores.titulo, fontSize: 15.5, lineHeight: 22 },
  avanceFila: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 16 },
  avanceK: { fontSize: 16, color: colores.titulo },
  avanceV: { fontSize: 16, fontWeight: '800', color: colores.primario },
  barra: { height: 8, backgroundColor: colores.grisFondo, borderRadius: 4, overflow: 'hidden', marginTop: 8 },
  barraRelleno: { height: '100%', backgroundColor: colores.primario },
  rejilla: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 14 },
  evidencia: { width: '48%', flexGrow: 1, backgroundColor: colores.blanco, borderWidth: 1, borderColor: colores.bordeSuave, borderRadius: radios.tarjeta, padding: 10 },
  evidenciaForzada: { borderColor: '#FDE68A', backgroundColor: '#FFFDF5' },
  miniatura: { height: 110, borderRadius: 10, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: '#CBD5E1' },
  miniaturaVacia: { backgroundColor: '#EEF2F7', borderWidth: 1.5, borderStyle: 'dashed', borderColor: colores.borde },
  insignia: { position: 'absolute', top: 6, right: 6, backgroundColor: '#F59E0B', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
  insigniaTexto: { color: colores.blanco, fontWeight: '800', fontSize: 13 },
  nombre: { fontSize: 17.5, fontWeight: '800', color: colores.titulo, marginTop: 10 },
  descripcion: { fontSize: 14.5, color: colores.textoSecundario, marginTop: 2, minHeight: 20 },
  verDetalles: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 8 },
  verDetallesTexto: { color: colores.primario, fontWeight: '700', fontSize: 16 },
  dato: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, paddingVertical: 12, borderTopWidth: 1, borderTopColor: '#F1E7B8' },
  datoLargo: { paddingVertical: 12, borderTopWidth: 1, borderTopColor: '#F1E7B8' },
  datoK: { fontSize: 16, color: colores.titulo },
  datoV: { fontSize: 16, fontWeight: '800', color: colores.titulo, flexShrink: 1, textAlign: 'right' },
  datoDetalle: { fontSize: 15, color: colores.textoSecundario, marginTop: 3, lineHeight: 21 },
  adicionales: { marginTop: 12, backgroundColor: colores.blanco, borderWidth: 1, borderColor: colores.bordeSuave, borderRadius: radios.tarjeta, padding: 14 },
  adicionalesCabecera: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  adicionalesContador: { fontSize: 14, fontWeight: '700', color: colores.textoSecundario, marginTop: 6 },
  adicionalesRejilla: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 },
  adicionalMiniatura: { width: 78, height: 78, borderRadius: 10, overflow: 'hidden', backgroundColor: '#CBD5E1', alignItems: 'center', justifyContent: 'center' },
  adicionalNumero: { position: 'absolute', left: 4, bottom: 4, backgroundColor: 'rgba(0,0,0,0.65)', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 1 },
  adicionalQuitar: { position: 'absolute', top: 4, right: 4, width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.65)', alignItems: 'center', justifyContent: 'center' },
  adicionalBoton: { marginTop: 12, minHeight: 50, borderRadius: radios.boton, borderWidth: 1.5, borderColor: colores.primario, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  adicionalBotonTexto: { color: colores.primario, fontSize: 16.5, fontWeight: '700' },
  enviarAhora: { minHeight: 46, borderRadius: radios.boton, backgroundColor: colores.primario, alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  enviarAhoraTexto: { color: colores.blanco, fontSize: 16.5, fontWeight: '700' },
  nuevaEnCola: { color: colores.azulTexto, fontSize: 13, fontWeight: '700', marginTop: 4 },
  guardar: { marginTop: 18, minHeight: 56, borderRadius: radios.boton, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  guardarActivo: { backgroundColor: colores.primario },
  guardarBloqueado: { backgroundColor: '#CBD3DF' },
  guardarTexto: { color: colores.blanco, fontSize: 18, fontWeight: '700' },
  ayuda: { textAlign: 'center', color: colores.textoSecundario, fontSize: 15, marginTop: 8 },
});
