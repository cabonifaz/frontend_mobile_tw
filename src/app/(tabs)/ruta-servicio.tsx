import { useState } from 'react';
import { ActivityIndicator, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { nombreDeCodigo, obtenerCatalogo } from '@/api/catalogos';
import { obtenerRutaServicioConRespaldo } from '@/api/panelCampo';
import { horaRespaldo } from '@/api/respaldo';
import { AvisarClienteModal } from '@/componentes/AvisarClienteModal';
import { Aviso } from '@/componentes/Aviso';
import { EncabezadoApp } from '@/componentes/EncabezadoApp';
import { MapaOSM, type LineaMapa } from '@/componentes/MapaOSM';
import type { PinMapa } from '@/componentes/MapaEsquematico';
import { useConsulta } from '@/hooks/useConsulta';
import { useDiseno } from '@/hooks/useDiseno';
import { useRefrescoAutomatico } from '@/hooks/useRefrescoAutomatico';
import { useSesion } from '@/sesion/SesionContext';
import { colores, radios } from '@/tema/colores';
import { textoDuracion } from '@/utilidades/jornada';
import {
  colorBadge,
  colorTono,
  distanciaMetros,
  enlaceLlamada,
  enlacePuntoMapas,
  enlaceRutaMapas,
  haceMinutos,
  horaLlegada,
  horaPreLlegada,
  mensajeRetrasoCliente,
  minutosEnPunto,
  minutosHastaPlanta,
  textoDistancia,
  textoMinutos,
  textoVelocidad,
} from '@/utilidades/panelCampo';

/** Colores del mapa: la ruta por calles es azul, el recorrido real del técnico verde (como el Mapa Operativo de la intranet). */
const AZUL_RUTA = '#2563EB';
const VERDE_RECORRIDO = '#16A34A';
const ROJO_PLANTA = '#DC2626';

/**
 * HU-30 — Ubicación y ruta de un servicio, como el Mapa Operativo de la intranet: mapa real de calles con el técnico, la planta del cliente, la ruta por calles
 * que le falta recorrer (la calcula el back con OSRM) y el recorrido GPS que ya hizo; debajo, la posición, la distancia, la llegada estimada, la velocidad, la precisión
 * del GPS, el tiempo detenido en el mismo punto, el cronograma GPS del día, la demora que registró y los eventos en ruta.
 * "Llamar al técnico" marca su teléfono; "Avisar al cliente" prepara el mensaje, lo comparte por el canal que el jefe elija y deja constancia en el seguimiento.
 * "Abrir en Maps" abre la ruta en la app de mapas del teléfono. La velocidad y la hora de llegada son referenciales.
 */
export default function PantallaRutaServicio() {
  const { sesion } = useSesion();
  const usuario = sesion?.usuario;
  const d = useDiseno();
  const params = useLocalSearchParams<{ id?: string }>();
  const idOs = Number(params.id);
  const valido = Number.isInteger(idOs) && idOs > 0;
  const [aviso, setAviso] = useState(false);
  const [tocandoMapa, setTocandoMapa] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: 'error' | 'info'; texto: string } | null>(null);

  const { datos, cargando, recargando, error, recargar } = useConsulta(async (token) => {
    if (!valido) throw new Error('El servicio indicado no es válido.');
    const [r, cargos] = await Promise.all([
      obtenerRutaServicioConRespaldo(token, usuario?.idUsuario ?? 0, idOs),
      obtenerCatalogo(token, 'CARGO_USUARIO').catch(() => undefined),
    ]);
    return { ruta: r.datos, sinConexion: r.sinConexion, guardadoEn: r.guardadoEn, cargos };
  }, params.id ?? '');
  useRefrescoAutomatico(recargar, 30);

  const cargo = nombreDeCodigo(datos?.cargos, usuario?.cargo) ?? usuario?.cargo ?? 'Jefe de Área';
  const r = datos?.ruta.resumen ?? null;
  const recorrido = datos?.ruta.recorrido ?? [];
  const eventos = datos?.ruta.eventos ?? [];
  const calles = datos?.ruta.calles ?? [];

  // Tiempo hasta la planta: el del servidor si viene (técnico en movimiento); si no, un cálculo referencial con la distancia
  const minutosServidor = r?.etaMinutos != null ? Math.round(r.etaMinutos) : null;
  const minutosEstimados = minutosServidor ?? minutosHastaPlanta(r?.distanciaM);
  const posicion = r && r.latitud !== null && r.longitud !== null ? { latitud: r.latitud, longitud: r.longitud } : null;
  const destino = r && r.destinoLatitud !== null && r.destinoLongitud !== null ? { latitud: r.destinoLatitud, longitud: r.destinoLongitud } : null;

  // Mapa: el técnico (flecha azul), la planta (edificio rojo), la ruta por calles que le falta y el recorrido real ya hecho.
  // Sin el trazado por calles (el servicio externo no respondió) se une el técnico con la planta con una línea recta tenue.
  const rutaPrevista = calles.length >= 2 ? calles : posicion && destino ? [posicion, destino] : [];
  const lineas: LineaMapa[] = [
    ...(rutaPrevista.length >= 2
      ? [
          { clave: 'ruta-borde', puntos: rutaPrevista, color: colores.blanco, grosor: 10 },
          { clave: 'ruta', puntos: rutaPrevista, color: AZUL_RUTA, grosor: 6, opacidad: calles.length >= 2 ? 0.95 : 0.55 },
        ]
      : []),
    ...(recorrido.length >= 2
      ? [
          { clave: 'recorrido-borde', puntos: recorrido, color: colores.blanco, grosor: 8 },
          { clave: 'recorrido', puntos: recorrido, color: VERDE_RECORRIDO, grosor: 4.5 },
        ]
      : []),
  ];
  const pines: PinMapa[] = [
    ...(destino ? [{ clave: 'destino', ...destino, texto: 'CL', color: ROJO_PLANTA, tamano: 38, icono: 'business' as const, cuadrado: true, etiqueta: 'Planta del cliente' }] : []),
    ...(posicion && r ? [{ clave: 'tecnico', ...posicion, texto: 'TEC', color: AZUL_RUTA, tamano: 42, icono: 'navigate' as const, etiqueta: r.tecnico ?? 'Técnico' }] : []),
  ];

  // Tiempo detenido en el mismo punto y cronograma GPS del día (salida · pre-llegada a menos de 300 m · llegada)
  const enPunto = minutosEnPunto(recorrido, r?.actualizado);
  const lejosDePlanta = !posicion || !destino || distanciaMetros(posicion, destino) > 150;
  const detenido = enPunto >= 10 && (r?.velocidadKmh ?? 0) < 3 && lejosDePlanta && r?.estado !== 'finalizado';
  const horaDe = (patron: RegExp) => eventos.find((e) => e.badge === 'OK' && patron.test(e.titulo))?.hora ?? null;
  const cronograma = [
    { clave: 'salida', titulo: 'Salida', hora: horaDe(/salida/i), pendiente: 'aún no registrada', color: '#10B981' },
    { clave: 'pre', titulo: 'Pre-llegada', hora: horaPreLlegada(recorrido, destino), pendiente: 'aún no detectada', color: '#6366F1', nota: 'A menos de 300 m del cliente' },
    { clave: 'llegada', titulo: 'Llegada', hora: horaDe(/llegada/i), pendiente: 'aún no registrada', color: '#10B981' },
  ];

  const distancia = r?.distanciaRutaM ?? r?.distanciaM ?? null;
  const llegada =
    minutosEstimados === null
      ? (r?.etaEstimada ?? r?.eta ?? '—')
      : minutosEstimados === 0
        ? 'En planta'
        : `≈ ${textoMinutos(minutosEstimados)} · ${r?.etaEstimada ?? horaLlegada(minutosEstimados)}`;
  const llegaTarde = !!(r?.etaEstimada ?? r?.eta) && !!r?.etaProgramada && (r?.etaEstimada ?? r?.eta)! > r.etaProgramada;

  async function abrir(url: string | null, vacio: string) {
    setMensaje(null);
    if (!url) return setMensaje({ tipo: 'info', texto: vacio });
    try {
      await Linking.openURL(url);
    } catch {
      setMensaje({ tipo: 'error', texto: 'No se pudo abrir la aplicación del teléfono.' });
    }
  }

  return (
    <SafeAreaView style={estilos.area} edges={['top']}>
      <EncabezadoApp nombre={usuario?.nombre ?? ''} apellido={usuario?.apellido} subtitulo={`${usuario?.nombre ?? ''} · ${cargo}`} />
      <ScrollView
        scrollEnabled={!tocandoMapa}
        contentContainerStyle={[estilos.contenido, { paddingHorizontal: d.margen, maxWidth: d.anchoMaximo }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={recargando} onRefresh={() => void recargar()} colors={[colores.primario]} />}
      >
        <View style={estilos.tituloFila}>
          <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Volver">
            <Ionicons name="arrow-back" size={24} color={colores.titulo} />
          </Pressable>
          <Text style={[estilos.titulo, { fontSize: d.tituloPantalla }]} accessibilityRole="header">
            Ubicación y ruta
          </Text>
        </View>
        {!!r && <Text style={estilos.subtitulo}>{[r.numero, r.cliente, r.tecnico].filter(Boolean).join(' · ')}</Text>}

        {datos?.sinConexion && (
          <View style={{ marginBottom: 10 }}>
            <Aviso mensaje={`Sin conexión: se muestra lo último guardado (${horaRespaldo(datos.guardadoEn)}).`} />
          </View>
        )}

        {cargando ? (
          <ActivityIndicator color={colores.primario} style={{ marginTop: 40 }} />
        ) : error || !r ? (
          <Aviso tipo="error" mensaje={error ?? 'No se pudo cargar la ruta.'} />
        ) : (
          <>
            <MapaOSM pines={pines} lineas={lineas} alto={320} vacio="El técnico aún no envía su ubicación hoy." alTocarMapa={setTocandoMapa} />
            <View style={estilos.leyenda} testID="leyenda-mapa">
              <ItemLeyenda color={AZUL_RUTA} texto="Técnico" />
              <ItemLeyenda color={ROJO_PLANTA} texto="Planta" cuadrado />
              <ItemLeyenda color={AZUL_RUTA} texto={calles.length >= 2 ? 'Ruta por calles' : 'Ruta prevista'} linea />
              <ItemLeyenda color={VERDE_RECORRIDO} texto="Recorrido real" linea />
            </View>

            <View style={estilos.mapaPie}>
              <Text style={estilos.nota}>
                {r.minutosUbicacion === null ? 'Sin posición GPS hoy.' : `Última actualización ${haceMinutos(r.minutosUbicacion)}${r.actualizado ? ` (${r.actualizado})` : ''}.`}
              </Text>
              <Pressable
                onPress={() => void abrir(enlaceRutaMapas(destino, posicion) ?? enlacePuntoMapas(posicion), 'No hay coordenadas para abrir el mapa.')}
                accessibilityRole="button"
                testID="abrir-maps"
                style={estilos.enlaceMaps}
              >
                <Ionicons name="map-outline" size={18} color={colores.primario} />
                <Text style={estilos.enlaceMapsTexto}>Abrir en Maps</Text>
              </Pressable>
            </View>

            {/* Posición y planta */}
            <View style={estilos.tarjeta} testID="destino-servicio">
              {!!posicion && (
                <View style={estilos.fila}>
                  <Ionicons name="locate-outline" size={20} color={AZUL_RUTA} />
                  <View style={{ flex: 1 }}>
                    <Text style={estilos.etiquetaPequena}>POSICIÓN ACTUAL</Text>
                    <Text style={estilos.coordenadas}>
                      {posicion.latitud.toFixed(5)}, {posicion.longitud.toFixed(5)}
                    </Text>
                  </View>
                </View>
              )}
              {(!!r.destinoNombre || !!r.destinoDireccion) && (
                <View style={[estilos.fila, !!posicion && estilos.filaBorde]}>
                  <Ionicons name="business-outline" size={20} color={ROJO_PLANTA} />
                  <View style={{ flex: 1 }}>
                    <Text style={estilos.etiquetaPequena}>{r.estado === 'en_ruta' ? 'SE DIRIGE A' : 'PLANTA DEL SERVICIO'}</Text>
                    <Text style={estilos.destinoNombre}>{r.destinoNombre ?? r.destinoDireccion}</Text>
                    {!!r.destinoDireccion && r.destinoDireccion !== r.destinoNombre && <Text style={estilos.detalle}>{r.destinoDireccion}</Text>}
                    {!destino && (
                      <Text style={estilos.detalle}>
                        La sede no tiene ubicación exacta registrada, por eso no se dibuja el destino ni se calcula el tiempo. Pide registrarla en la intranet (Clientes › Sedes).
                      </Text>
                    )}
                  </View>
                </View>
              )}
            </View>

            {/* Distancia y llegada estimada */}
            <View style={estilos.dos}>
              <View style={estilos.cajita}>
                <View style={estilos.cajitaTitulo}>
                  <Ionicons name="navigate-outline" size={15} color={colores.textoSecundario} />
                  <Text style={estilos.etiquetaPequena}>DISTANCIA AL CLIENTE</Text>
                </View>
                <Text style={estilos.cajitaValor}>{textoDistancia(distancia)}</Text>
                <Text style={estilos.cajitaNota}>{r.distanciaRutaM != null ? 'por calles' : 'en línea recta'}</Text>
              </View>
              <View style={[estilos.cajita, estilos.cajitaAzul]}>
                <View style={estilos.cajitaTitulo}>
                  <Ionicons name="time-outline" size={15} color={colores.primario} />
                  <Text style={[estilos.etiquetaPequena, { color: colores.primario }]}>LLEGADA ESTIMADA</Text>
                </View>
                <Text style={[estilos.cajitaValor, { color: llegaTarde ? colores.naranja : colores.primario }]} testID="eta-referencial">
                  {llegada}
                </Text>
                <Text style={estilos.cajitaNota}>{r.etaProgramada ? `programado ${r.etaProgramada}` : r.etaPorCalles ? 'según las calles' : 'referencial'}</Text>
              </View>
            </View>

            {/* Velocidad · precisión · tiempo en el punto */}
            <View style={estilos.tres}>
              <Dato titulo="VELOCIDAD" valor={textoVelocidad(r.velocidadKmh ?? 0)} />
              <Dato titulo="PRECISIÓN" valor={r.precisionM != null ? `± ${Math.round(r.precisionM)} m` : '—'} />
              <Dato titulo="TIEMPO EN PUNTO" valor={enPunto >= 1 ? textoMinutos(enPunto) : '—'} destacado={enPunto >= 10} />
            </View>

            {detenido && (
              <View style={estilos.alerta} testID="gps-detenido">
                <Ionicons name="pause-circle-outline" size={21} color="#B45309" />
                <Text style={estilos.alertaTexto}>GPS detenido en el mismo punto hace {textoMinutos(enPunto)}</Text>
              </View>
            )}

            {/* Cronograma GPS del día */}
            <Text style={estilos.seccion}>CRONOGRAMA GPS DEL DÍA</Text>
            <View style={estilos.cronograma}>
              {cronograma.map((c, i) => (
                <View key={c.clave} style={[estilos.cronoFila, i > 0 && estilos.eventoBorde]}>
                  <View style={[estilos.cronoPunto, { backgroundColor: c.hora ? c.color : '#CBD5E1' }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={[estilos.eventoTitulo, !c.hora && { color: colores.textoSecundario }]}>
                      {c.hora ?? '—'} · {c.titulo}
                      {!c.hora ? ` (${c.pendiente})` : ''}
                    </Text>
                    {!!c.nota && <Text style={estilos.eventoDetalle}>{c.nota}</Text>}
                  </View>
                </View>
              ))}
            </View>

            {!!r.demoraTexto && (
              <View style={estilos.demora} testID="demora-registrada">
                <Ionicons name="time-outline" size={22} color={colores.titulo} />
                <Text style={estilos.demoraTexto}>
                  <Text style={{ fontWeight: '800' }}>Demora registrada por {r.demoraOrigen === 'asistente' ? 'el asistente' : 'el técnico'}</Text> · {r.demoraTexto}
                </Text>
              </View>
            )}

            <Text style={estilos.seccion}>EVENTOS EN RUTA</Text>
            <View style={estilos.eventos}>
              {eventos.length === 0 ? (
                <Text style={estilos.vacio}>Aún no hay eventos registrados.</Text>
              ) : (
                eventos.map((e, i) => {
                  const b = colorBadge(e.tono);
                  return (
                    <View key={`${e.hora}-${i}`} style={[estilos.evento, i > 0 && estilos.eventoBorde]}>
                      <View style={{ flex: 1 }}>
                        <Text style={estilos.eventoTitulo}>{[e.hora, e.titulo].filter(Boolean).join(' · ')}</Text>
                        {!!e.detalle && <Text style={estilos.eventoDetalle}>{e.detalle}</Text>}
                      </View>
                      <View style={[estilos.badge, { backgroundColor: b.fondo }]}>
                        <Text style={[estilos.badgeTexto, { color: b.color }]}>{e.badge}</Text>
                      </View>
                      <View style={[estilos.eventoPunto, { backgroundColor: colorTono(e.tono) }]} />
                    </View>
                  );
                })
              )}
            </View>
            <Text style={estilos.nota}>
              {r.etaPorCalles
                ? 'La distancia y la hora de llegada se calculan por las calles con tráfico aproximado; la velocidad es referencial.'
                : 'La distancia es en línea recta hasta la planta; la velocidad y la hora de llegada estimada son referenciales.'}
              {r.etaEstimada && r.etaMinutos != null ? ` Llegaría a las ${r.etaEstimada} (≈ ${textoDuracion(r.etaMinutos)}).` : ''}
            </Text>

            {!!mensaje && (
              <View style={{ marginTop: 12 }} testID="mensaje-ruta">
                <Aviso tipo={mensaje.tipo} mensaje={mensaje.texto} />
              </View>
            )}

            <View style={estilos.botones}>
              <Pressable
                onPress={() => void abrir(enlaceLlamada(r.telefonoTecnico), 'El técnico no tiene un teléfono registrado en su ficha.')}
                style={[estilos.boton, estilos.botonBorde]}
                accessibilityRole="button"
                testID="llamar-tecnico"
              >
                <Ionicons name="call-outline" size={20} color={colores.primario} />
                <Text style={[estilos.botonTexto, { color: colores.primario }]}>Llamar al técnico</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setMensaje(null);
                  setAviso(true);
                }}
                style={[estilos.boton, estilos.botonPrimario]}
                accessibilityRole="button"
                testID="avisar-cliente"
              >
                <Ionicons name="paper-plane-outline" size={20} color={colores.blanco} />
                <Text style={estilos.botonTexto}>Avisar al cliente</Text>
              </Pressable>
            </View>
          </>
        )}
      </ScrollView>

      {r && (
        <AvisarClienteModal
          visible={aviso}
          token={sesion?.token ?? ''}
          idOs={idOs}
          sugerido={mensajeRetrasoCliente({ cliente: r.cliente, numero: r.numero, tecnico: r.tecnico, eta: r.eta })}
          onLlamarCliente={enlaceLlamada(r.contactoTelefono) ? () => void abrir(enlaceLlamada(r.contactoTelefono), '') : undefined}
          onCerrar={() => setAviso(false)}
          onRegistrado={(m) => {
            setAviso(false);
            setMensaje({ tipo: 'info', texto: m });
          }}
        />
      )}
    </SafeAreaView>
  );
}

function Dato({ titulo, valor, destacado }: { titulo: string; valor: string; destacado?: boolean }) {
  return (
    <View style={estilos.dato}>
      <Text style={estilos.etiquetaPequena}>{titulo}</Text>
      <Text style={[estilos.datoValor, destacado && { color: colores.naranja }]}>{valor}</Text>
    </View>
  );
}

function ItemLeyenda({ color, texto, linea, cuadrado }: { color: string; texto: string; linea?: boolean; cuadrado?: boolean }) {
  return (
    <View style={estilos.itemLeyenda}>
      <View style={linea ? { width: 16, height: 4, borderRadius: 2, backgroundColor: color } : { width: 11, height: 11, borderRadius: cuadrado ? 3 : 6, backgroundColor: color }} />
      <Text style={estilos.leyendaTexto}>{texto}</Text>
    </View>
  );
}

const estilos = StyleSheet.create({
  area: { flex: 1, backgroundColor: colores.fondo },
  contenido: { paddingTop: 18, paddingBottom: 28, width: '100%', alignSelf: 'center' },
  tituloFila: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 2 },
  titulo: { fontWeight: '800', color: colores.titulo, flexShrink: 1 },
  subtitulo: { color: colores.textoSecundario, fontSize: 15, marginBottom: 12 },
  leyenda: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 8 },
  itemLeyenda: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  leyendaTexto: { fontSize: 12.5, color: colores.textoSecundario },
  mapaPie: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6, gap: 8 },
  enlaceMaps: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 },
  enlaceMapsTexto: { color: colores.primario, fontSize: 15.5, fontWeight: '700' },
  tarjeta: { backgroundColor: colores.blanco, borderWidth: 1, borderColor: colores.bordeSuave, borderRadius: radios.tarjeta, paddingHorizontal: 14, marginTop: 10 },
  fila: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', paddingVertical: 12 },
  filaBorde: { borderTopWidth: 1, borderTopColor: colores.bordeSuave },
  etiquetaPequena: { fontSize: 11.5, fontWeight: '800', letterSpacing: 0.5, color: colores.textoSecundario },
  coordenadas: { fontSize: 16.5, fontWeight: '700', color: colores.titulo, marginTop: 2 },
  destinoNombre: { fontSize: 16, fontWeight: '800', color: colores.titulo, marginTop: 2 },
  detalle: { fontSize: 13.5, color: colores.textoSecundario, marginTop: 2, lineHeight: 19 },
  dos: { flexDirection: 'row', gap: 10, marginTop: 10 },
  cajita: { flex: 1, backgroundColor: colores.blanco, borderWidth: 1, borderColor: colores.bordeSuave, borderRadius: 14, padding: 12 },
  cajitaAzul: { backgroundColor: colores.primarioSuave, borderColor: '#BFD7F5' },
  cajitaTitulo: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  cajitaValor: { fontSize: 19, fontWeight: '800', color: colores.titulo, marginTop: 6 },
  cajitaNota: { fontSize: 12.5, color: colores.textoSecundario, marginTop: 2 },
  tres: { flexDirection: 'row', gap: 10, marginTop: 10 },
  dato: { flex: 1, backgroundColor: colores.blanco, borderWidth: 1, borderColor: colores.bordeSuave, borderRadius: 14, paddingVertical: 11, paddingHorizontal: 10 },
  datoValor: { fontSize: 17, fontWeight: '800', color: colores.titulo, marginTop: 5 },
  alerta: { flexDirection: 'row', gap: 10, alignItems: 'center', backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FDE68A', borderRadius: 14, padding: 12, marginTop: 10 },
  alertaTexto: { flex: 1, color: '#92400E', fontSize: 14.5, fontWeight: '600' },
  demora: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FDE68A', borderRadius: radios.tarjeta, padding: 14, marginTop: 12 },
  demoraTexto: { flex: 1, color: colores.titulo, fontSize: 15.5, lineHeight: 22 },
  seccion: { fontSize: 14, fontWeight: '800', letterSpacing: 1.2, color: colores.textoSecundario, marginTop: 20, marginBottom: 10 },
  cronograma: { backgroundColor: colores.blanco, borderWidth: 1, borderColor: colores.bordeSuave, borderRadius: radios.tarjeta, paddingHorizontal: 14 },
  cronoFila: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  cronoPunto: { width: 11, height: 11, borderRadius: 6 },
  eventos: { backgroundColor: colores.blanco, borderWidth: 1, borderColor: colores.bordeSuave, borderRadius: radios.tarjeta, paddingHorizontal: 14 },
  evento: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 13 },
  eventoBorde: { borderTopWidth: 1, borderTopColor: colores.bordeSuave },
  eventoTitulo: { fontSize: 16, color: colores.titulo, fontWeight: '600' },
  eventoDetalle: { fontSize: 13.5, color: colores.textoSecundario, marginTop: 2 },
  eventoPunto: { width: 8, height: 8, borderRadius: 4 },
  badge: { borderRadius: 8, paddingHorizontal: 9, paddingVertical: 4 },
  badgeTexto: { fontSize: 11.5, fontWeight: '800', letterSpacing: 0.3 },
  vacio: { color: colores.textoSecundario, fontSize: 15, paddingVertical: 16, textAlign: 'center' },
  nota: { fontSize: 12.5, color: colores.textoTenue, marginTop: 8, lineHeight: 18, flexShrink: 1 },
  botones: { flexDirection: 'row', gap: 10, marginTop: 16 },
  boton: { flex: 1, minHeight: 54, borderRadius: radios.boton, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  botonBorde: { borderWidth: 1.5, borderColor: colores.primario, backgroundColor: colores.blanco },
  botonPrimario: { backgroundColor: colores.primario },
  botonTexto: { color: colores.blanco, fontSize: 16, fontWeight: '700' },
});
