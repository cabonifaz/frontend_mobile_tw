import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { marcarOEncolar } from '@/api/colaJornada';
import { obtenerJornadaConRespaldo, type Marcacion } from '@/api/jornada';
import { Aviso } from '@/componentes/Aviso';
import { EncabezadoApp } from '@/componentes/EncabezadoApp';
import { useConsulta } from '@/hooks/useConsulta';
import { useDiseno } from '@/hooks/useDiseno';
import { usePendientesJornada } from '@/hooks/usePendientesJornada';
import { useRefrescoAutomatico } from '@/hooks/useRefrescoAutomatico';
import { useUbicacion } from '@/hooks/useUbicacion';
import { useSesion } from '@/sesion/SesionContext';
import { colores, radios } from '@/tema/colores';
import { coordenadasTexto } from '@/utilidades/demoras';
import { recordarJornada } from '@/utilidades/jornadaActual';
import {
  PASOS,
  actividadDelDia,
  coloresEstado,
  conPendientes,
  cronometro,
  detalleMarcacion,
  fechaCortaLima,
  fechaLargaLima,
  horaLima,
  jornadaVacia,
  pasoDe,
  porcentajeRefrigerio,
  puntualidadIngreso,
  refrigerioTranscurridoSeg,
  textoDuracion,
  textoEstado,
  textoPuntualidad,
  trabajadoMin,
  type PasoJornada,
} from '@/utilidades/jornada';

/**
 * HU-20 — Reloj marcador de jornada. Reloj digital (hora de Lima) con el estado de la jornada y el horario programado; cinco botones de colores —Inicio de labores,
 * Inicio y Fin de refrigerio, Salida de planta y Fin de labores— de los que solo se habilita el siguiente. Cada marcación se confirma con la hora, el GPS y, en
 * el ingreso, si es a tiempo o tardanza; queda en «Actividad del día» y, al terminar la jornada, en un resumen. Sin conexión la marcación se guarda en el teléfono
 * con su hora y GPS y se envía sola al volver la señal. Mientras la jornada está en curso la app envía la posición (monitor de campo) y el técnico se ve en el
 * mapa del Seguimiento Operativo de la intranet.
 */
export default function PantallaRelojMarcador() {
  const { sesion } = useSesion();
  const usuario = sesion?.usuario;
  const token = sesion?.token ?? null;
  const idUsuario = usuario?.idUsuario ?? 0;
  const d = useDiseno();
  const [ahora, setAhora] = useState(() => Date.now());
  const [paso, setPaso] = useState<PasoJornada | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [errorMarca, setErrorMarca] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const gps = useUbicacion(false);
  const pendientes = usePendientesJornada(idUsuario);

  const { datos, cargando, recargando, error, recargar } = useConsulta((t) => obtenerJornadaConRespaldo(t, idUsuario), String(idUsuario));
  useRefrescoAutomatico(recargar, 30);

  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const j = datos ? conPendientes(datos.datos, pendientes) : error ? conPendientes(jornadaVacia(ahora), pendientes) : null;
  const sinConexion = !!datos?.sinConexion || (!!error && !datos);
  const estado = j?.estado ?? null;
  useEffect(() => {
    if (estado) recordarJornada(estado);
  }, [estado]);

  const capturar = gps.capturar;
  useEffect(() => {
    if (paso) void capturar();
  }, [paso, capturar]);

  function abrir(p: PasoJornada) {
    setErrorMarca(null);
    setAviso(null);
    setPaso(p);
  }

  async function confirmar() {
    if (!token || !paso || !gps.ubicacion) return;
    setGuardando(true);
    setErrorMarca(null);
    try {
      const r = await marcarOEncolar(token, idUsuario, paso.tipo, gps.ubicacion);
      if (r.estado === 'en_cola') setAviso('Sin conexión: la marcación quedó guardada en el teléfono y se enviará sola al volver la señal.');
      else if (r.datos?.estado) recordarJornada(r.datos.estado);
      setPaso(null);
      await recargar();
    } catch (e) {
      setErrorMarca(e instanceof Error ? e.message : 'No se pudo registrar la marcación.');
    } finally {
      setGuardando(false);
    }
  }

  const trabajado = j ? trabajadoMin(j, ahora) : null;
  const estadoColor = coloresEstado(j?.estado ?? 'sin_iniciar');
  const refriSeg = j ? refrigerioTranscurridoSeg(j, ahora) : 0;
  const hayMarcaSinConexion = !!j?.marcaciones.some((m) => m.sinConexion);
  const previaIngreso = paso?.tipo === 'inicio_labores' && j ? puntualidadIngreso(ahora, j.inicioProgramado, j.toleranciaMin) : null;

  return (
    <SafeAreaView style={estilos.area} edges={['top']}>
      <EncabezadoApp nombre={usuario?.nombre ?? ''} apellido={usuario?.apellido} subtitulo={usuario?.cargo ?? 'Técnico de Campo'} />
      <ScrollView
        contentContainerStyle={[estilos.contenido, { paddingHorizontal: d.margen, maxWidth: d.anchoMaximo }]}
        refreshControl={<RefreshControl refreshing={recargando} onRefresh={() => void recargar()} />}
      >
        <View style={estilos.tituloFila}>
          <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Volver">
            <Ionicons name="arrow-back" size={24} color={colores.titulo} />
          </Pressable>
          <Text style={[estilos.titulo, { fontSize: d.tituloPantalla }]} accessibilityRole="header">
            Reloj marcador
          </Text>
        </View>
        <Text style={estilos.subtitulo}>Marcador {fechaCortaLima(ahora)}</Text>

        {cargando && !j ? (
          <ActivityIndicator color={colores.primario} style={{ marginTop: 40 }} />
        ) : !j ? (
          <Aviso tipo="error" mensaje={error ?? 'No se pudo cargar la jornada.'} />
        ) : (
          <>
            {sinConexion && (
              <View style={[estilos.banner, estilos.bannerAmarillo]} testID="banner-sin-conexion">
                <Ionicons name="cloud-offline-outline" size={20} color={colores.amarilloTexto} />
                <Text style={estilos.bannerTexto}>Sin conexión · las marcaciones se guardan en el teléfono</Text>
              </View>
            )}
            {!sinConexion && pendientes.length > 0 && (
              <View style={[estilos.banner, estilos.bannerAmarillo]}>
                <Ionicons name="sync-outline" size={20} color={colores.amarilloTexto} />
                <Text style={estilos.bannerTexto}>
                  {pendientes.length === 1 ? 'Hay 1 marcación guardada en el teléfono' : `Hay ${pendientes.length} marcaciones guardadas en el teléfono`}: se envía sola.
                </Text>
              </View>
            )}
            {!!aviso && <Aviso mensaje={aviso} />}

            <View style={estilos.reloj} testID="reloj">
              <Text style={estilos.hora} accessibilityLabel={`Hora ${horaLima(ahora)}`}>
                {horaLima(ahora)}
              </Text>
              <Text style={estilos.fecha}>{fechaLargaLima(ahora)}</Text>
              <View style={[estilos.pildora, { backgroundColor: estadoColor.fondo }]}>
                <View style={[estilos.punto, { backgroundColor: estadoColor.punto }]} />
                <Text style={[estilos.pildoraTexto, { color: estadoColor.texto }]} testID="estado-jornada">
                  {textoEstado(j.estado, trabajado)}
                </Text>
              </View>
              {j.estado === 'en_refrigerio' && (
                <View style={{ width: '100%', marginTop: 12 }} testID="refrigerio">
                  <Text style={estilos.refrigerioTexto}>
                    Tiempo de refrigerio <Text style={{ color: refriSeg > j.refrigerioMaxMin * 60 ? colores.rojo : '#EA580C', fontWeight: '800' }}>{cronometro(refriSeg)}</Text> / {j.refrigerioMaxMin} min
                  </Text>
                  <View style={estilos.barra}>
                    <View style={[estilos.barraRelleno, { width: `${porcentajeRefrigerio(refriSeg, j.refrigerioMaxMin)}%` }]} />
                  </View>
                </View>
              )}
              {j.estado === 'finalizada' && j.resumen && (
                <View style={estilos.resumenFila} testID="resumen-jornada">
                  <Dato titulo="Trabajado" valor={textoDuracion(j.resumen.trabajadoMin)} />
                  <Dato titulo="Refrigerio" valor={textoDuracion(j.resumen.refrigerioMin)} color="#EA580C" />
                  <Dato titulo="Ingreso" valor={j.resumen.ingreso === 'tardanza' ? 'Tardanza' : 'A tiempo'} color={j.resumen.ingreso === 'tardanza' ? colores.rojo : colores.verde} />
                </View>
              )}
            </View>
            <Text style={estilos.programado}>
              <Ionicons name="time-outline" size={13} color={colores.textoSecundario} /> Inicio programado: <Text style={{ fontWeight: '800' }}>{j.inicioProgramado}</Text> · Fin programado:{' '}
              <Text style={{ fontWeight: '800' }}>{j.finProgramado}</Text>
            </Text>

            {PASOS.map((p) => {
              const hecha = j.marcaciones.find((m) => m.tipo === p.tipo);
              const habilitado = j.siguiente === p.tipo;
              return (
                <Pressable
                  key={p.tipo}
                  onPress={() => abrir(p)}
                  disabled={!habilitado}
                  style={[estilos.paso, { backgroundColor: habilitado ? p.color : p.suave }, habilitado && estilos.pasoActivo]}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: !habilitado }}
                  accessibilityLabel={`${p.titulo}${hecha ? `, marcado a las ${hecha.hora}` : habilitado ? '' : ', bloqueado'}`}
                  testID={`paso-${p.tipo}`}
                >
                  <Text style={estilos.pasoTexto}>{p.titulo}</Text>
                  {hecha ? (
                    <View style={estilos.pasoHora}>
                      <View style={estilos.puntoBlanco} />
                      <Text style={estilos.pasoHoraTexto}>{hecha.hora}</Text>
                    </View>
                  ) : habilitado ? (
                    <Ionicons name="chevron-forward" size={20} color={colores.blanco} />
                  ) : (
                    <Ionicons name="lock-closed-outline" size={17} color="rgba(255,255,255,0.85)" />
                  )}
                </Pressable>
              );
            })}

            <Text style={estilos.seccion}>ACTIVIDAD DEL DÍA</Text>
            <View style={estilos.actividad}>
              {j.marcaciones.length === 0 ? (
                <Text style={estilos.vacio}>Aún no hay marcaciones hoy.</Text>
              ) : (
                actividadDelDia(j).map((m, i, lista) => <FilaActividad key={m.tipo} m={m} inicioProgramado={j.inicioProgramado} ultima={i === lista.length - 1} />)
              )}
            </View>
            {hayMarcaSinConexion && <Text style={estilos.nota}>La hora se toma del reloj del teléfono validado al iniciar la jornada; no se puede editar.</Text>}
          </>
        )}
      </ScrollView>

      <Modal visible={!!paso} transparent animationType="fade" onRequestClose={() => {
          if (!guardando) setPaso(null);
        }}>
        <View style={estilos.velo}>
          {paso && (
            <View style={estilos.modal} testID="modal-marcar">
              <View style={[estilos.modalIcono, { backgroundColor: `${paso.color}22` }]}>
                <Ionicons name={paso.icono === 'play' ? 'play' : paso.icono === 'cafe' ? 'cafe' : paso.icono === 'restaurant' ? 'restaurant' : paso.icono === 'exit' ? 'exit' : 'stop-circle'} size={30} color={paso.color} />
              </View>
              <Text style={estilos.modalTitulo}>Marcar {paso.titulo.charAt(0).toLowerCase() + paso.titulo.slice(1)}</Text>
              <View style={estilos.modalCaja}>
                <FilaModal etiqueta="Hora" valor={horaLima(ahora)} fuerte />
                <FilaModal
                  etiqueta="Ubicación"
                  valor={
                    gps.ubicacion
                      ? `GPS ± ${Math.round(gps.ubicacion.precisionMetros)} m`
                      : gps.estado === 'buscando'
                        ? 'Buscando GPS…'
                        : 'Sin GPS'
                  }
                  detalle={gps.ubicacion ? coordenadasTexto(gps.ubicacion.latitud, gps.ubicacion.longitud) : undefined}
                />
                {previaIngreso && j && (
                  <FilaModal
                    etiqueta="Estado"
                    valor={textoPuntualidad(previaIngreso.puntualidad, previaIngreso.minutos).toUpperCase()}
                    detalle={`Programado ${j.inicioProgramado}`}
                    color={previaIngreso.puntualidad === 'a_tiempo' ? colores.verde : colores.rojo}
                    ultima
                  />
                )}
              </View>
              {gps.estado !== 'activo' && gps.estado !== 'buscando' && !!gps.mensaje && <Aviso tipo="error" mensaje={gps.mensaje} />}
              {!!errorMarca && <Aviso tipo="error" mensaje={errorMarca} />}
              <Pressable
                onPress={() => void confirmar()}
                disabled={guardando || !gps.ubicacion}
                style={[estilos.confirmar, { backgroundColor: paso.color }, (guardando || !gps.ubicacion) && { opacity: 0.55 }]}
                accessibilityRole="button"
                testID="confirmar-marcacion"
              >
                {guardando ? <ActivityIndicator color={colores.blanco} /> : <Text style={estilos.confirmarTexto}>Confirmar marcación</Text>}
              </Pressable>
              {!gps.ubicacion && gps.estado !== 'buscando' && (
                <Pressable onPress={() => void gps.capturar()} style={estilos.enlace} accessibilityRole="button">
                  <Text style={[estilos.enlaceTexto, { color: colores.primario }]}>Volver a capturar ubicación</Text>
                </Pressable>
              )}
              <Pressable onPress={() => setPaso(null)} disabled={guardando} style={estilos.enlace} accessibilityRole="button" testID="cancelar-marcacion">
                <Text style={estilos.enlaceTexto}>Cancelar</Text>
              </Pressable>
            </View>
          )}
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function Dato({ titulo, valor, color = colores.titulo }: { titulo: string; valor: string; color?: string }) {
  return (
    <View style={estilos.dato}>
      <Text style={estilos.datoTitulo}>{titulo.toUpperCase()}</Text>
      <Text style={[estilos.datoValor, { color }]}>{valor}</Text>
    </View>
  );
}

function FilaModal({ etiqueta, valor, detalle, color, fuerte, ultima }: { etiqueta: string; valor: string; detalle?: string; color?: string; fuerte?: boolean; ultima?: boolean }) {
  return (
    <View style={[estilos.filaModal, !ultima && estilos.filaModalLinea]}>
      <View style={{ flex: 1 }}>
        <Text style={estilos.filaModalEtiqueta}>{etiqueta}</Text>
        {!!detalle && <Text style={estilos.filaModalDetalle}>{detalle}</Text>}
      </View>
      <Text style={[estilos.filaModalValor, fuerte && { fontSize: 18 }, !!color && { color }]}>{valor}</Text>
    </View>
  );
}

function FilaActividad({ m, inicioProgramado, ultima }: { m: Marcacion; inicioProgramado: string; ultima: boolean }) {
  const p = pasoDe(m.tipo);
  const detalle = detalleMarcacion(m, inicioProgramado);
  return (
    <View style={[estilos.actFila, !ultima && { marginBottom: 12 }]} testID={`actividad-${m.tipo}`}>
      <View style={estilos.actRiel}>
        <View style={[estilos.actPunto, { backgroundColor: p?.color ?? colores.textoTenue }]} />
        {!ultima && <View style={estilos.actLinea} />}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={estilos.actTitulo}>
          {m.hora} · {p?.titulo ?? m.tipo}
        </Text>
        {!!detalle && <Text style={estilos.actDetalle}>{detalle}</Text>}
        {m.pendiente ? (
          <Text style={[estilos.actEstado, { color: colores.naranja }]}>▯ en el teléfono · se envía sola al volver la señal</Text>
        ) : m.sinConexion ? (
          <Text style={[estilos.actEstado, { color: colores.verde }]}>✓ enviada</Text>
        ) : null}
      </View>
    </View>
  );
}

const estilos = StyleSheet.create({
  area: { flex: 1, backgroundColor: colores.fondo },
  contenido: { paddingTop: 18, paddingBottom: 110, width: '100%', alignSelf: 'center' },
  tituloFila: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 2 },
  titulo: { fontWeight: '800', color: colores.titulo, flexShrink: 1 },
  subtitulo: { color: colores.textoSecundario, fontSize: 13.5, marginBottom: 12, marginLeft: 36 },
  banner: { flexDirection: 'row', gap: 10, alignItems: 'center', borderRadius: radios.tarjeta, padding: 12, borderWidth: 1, marginBottom: 10 },
  bannerAmarillo: { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' },
  bannerTexto: { flex: 1, color: colores.amarilloTexto, fontSize: 14, lineHeight: 19 },
  reloj: { backgroundColor: colores.blanco, borderRadius: 18, borderWidth: 1, borderColor: colores.bordeSuave, alignItems: 'center', paddingVertical: 20, paddingHorizontal: 16 },
  hora: { fontSize: 46, fontWeight: '800', color: colores.titulo, letterSpacing: 1, fontVariant: ['tabular-nums'] },
  fecha: { color: colores.textoSecundario, fontSize: 14.5, marginTop: 2, marginBottom: 10 },
  pildora: { flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6 },
  punto: { width: 9, height: 9, borderRadius: 5 },
  pildoraTexto: { fontSize: 13.5, fontWeight: '700' },
  refrigerioTexto: { textAlign: 'center', color: colores.texto, fontSize: 14.5, marginBottom: 6 },
  barra: { height: 5, borderRadius: 3, backgroundColor: '#E5E7EB', overflow: 'hidden' },
  barraRelleno: { height: 5, backgroundColor: '#EA580C' },
  resumenFila: { flexDirection: 'row', gap: 8, width: '100%', marginTop: 14 },
  dato: { flex: 1, alignItems: 'center', borderWidth: 1, borderColor: colores.bordeSuave, borderRadius: 12, paddingVertical: 8, backgroundColor: colores.fondo },
  datoTitulo: { fontSize: 10.5, fontWeight: '700', color: colores.textoSecundario, letterSpacing: 0.4 },
  datoValor: { fontSize: 17, fontWeight: '800', marginTop: 2 },
  programado: { textAlign: 'center', color: colores.textoSecundario, fontSize: 13.5, marginVertical: 12 },
  paso: { minHeight: 54, borderRadius: 12, paddingHorizontal: 16, marginBottom: 9, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pasoActivo: { shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 5, shadowOffset: { width: 0, height: 2 }, elevation: 3 },
  pasoTexto: { color: colores.blanco, fontSize: 16.5, fontWeight: '700' },
  pasoHora: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  puntoBlanco: { width: 8, height: 8, borderRadius: 4, backgroundColor: colores.blanco },
  pasoHoraTexto: { color: colores.blanco, fontSize: 14.5, fontWeight: '700' },
  seccion: { marginTop: 12, marginBottom: 8, fontSize: 12.5, fontWeight: '800', color: colores.textoSecundario, letterSpacing: 0.8 },
  actividad: { backgroundColor: colores.blanco, borderRadius: radios.tarjeta, borderWidth: 1, borderColor: colores.bordeSuave, padding: 14 },
  vacio: { textAlign: 'center', color: colores.textoSecundario, fontSize: 14, paddingVertical: 6 },
  actFila: { flexDirection: 'row', gap: 10 },
  actRiel: { width: 14, alignItems: 'center' },
  actPunto: { width: 11, height: 11, borderRadius: 6, marginTop: 4 },
  actLinea: { flex: 1, width: 1.5, backgroundColor: colores.bordeSuave, marginTop: 3 },
  actTitulo: { fontSize: 15, fontWeight: '800', color: colores.titulo },
  actDetalle: { fontSize: 13, color: colores.textoSecundario, marginTop: 1 },
  actEstado: { fontSize: 12.5, fontWeight: '600', marginTop: 2 },
  nota: { textAlign: 'center', color: colores.textoSecundario, fontSize: 12.5, marginTop: 10, lineHeight: 17 },
  velo: { flex: 1, backgroundColor: 'rgba(2,6,23,0.65)', justifyContent: 'center', padding: 20 },
  modal: { backgroundColor: colores.blanco, borderRadius: 20, padding: 18, gap: 8 },
  modalIcono: { width: 62, height: 62, borderRadius: 31, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  modalTitulo: { fontSize: 20, fontWeight: '800', textAlign: 'center', color: colores.titulo, marginBottom: 4 },
  modalCaja: { borderWidth: 1, borderColor: colores.bordeSuave, borderRadius: 12, paddingHorizontal: 12 },
  filaModal: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  filaModalLinea: { borderBottomWidth: 1, borderBottomColor: colores.bordeSuave },
  filaModalEtiqueta: { fontSize: 14.5, color: colores.texto },
  filaModalDetalle: { fontSize: 11.5, color: colores.textoSecundario, marginTop: 1 },
  filaModalValor: { fontSize: 15, fontWeight: '800', color: colores.titulo, flexShrink: 1, textAlign: 'right' },
  confirmar: { minHeight: 50, borderRadius: radios.boton, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  confirmarTexto: { color: colores.blanco, fontSize: 16.5, fontWeight: '800' },
  enlace: { alignItems: 'center', paddingVertical: 8 },
  enlaceTexto: { color: colores.textoSecundario, fontSize: 16, fontWeight: '600' },
});
