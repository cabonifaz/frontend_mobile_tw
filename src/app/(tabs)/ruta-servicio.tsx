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
import { MapaEsquematico, type PinMapa } from '@/componentes/MapaEsquematico';
import { useConsulta } from '@/hooks/useConsulta';
import { useDiseno } from '@/hooks/useDiseno';
import { useRefrescoAutomatico } from '@/hooks/useRefrescoAutomatico';
import { useSesion } from '@/sesion/SesionContext';
import { colores, radios } from '@/tema/colores';
import { textoDuracion } from '@/utilidades/jornada';
import {
  colorBadge,
  colorPin,
  colorTono,
  enlaceLlamada,
  enlacePuntoMapas,
  enlaceRutaMapas,
  haceMinutos,
  inicialesDe,
  mensajeRetrasoCliente,
  textoDistancia,
  textoVelocidad,
} from '@/utilidades/panelCampo';

/**
 * HU-30 — Ubicación y ruta de un servicio: el recorrido GPS del técnico, la velocidad, la ETA, la distancia a la planta, la demora que registró y los eventos en ruta.
 * "Llamar al técnico" marca su teléfono; "Avisar al cliente" prepara el mensaje, lo comparte por el canal que el jefe elija y deja constancia en el seguimiento.
 * El mapa es esquemático; "Abrir en Maps" abre la ruta en la app de mapas del teléfono. La distancia es en línea recta y la velocidad y la ETA son referenciales.
 */
export default function PantallaRutaServicio() {
  const { sesion } = useSesion();
  const usuario = sesion?.usuario;
  const d = useDiseno();
  const params = useLocalSearchParams<{ id?: string }>();
  const idOs = Number(params.id);
  const valido = Number.isInteger(idOs) && idOs > 0;
  const [aviso, setAviso] = useState(false);
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

  const posicion = r && r.latitud !== null && r.longitud !== null ? { latitud: r.latitud, longitud: r.longitud } : null;
  const destino = r && r.destinoLatitud !== null && r.destinoLongitud !== null ? { latitud: r.destinoLatitud, longitud: r.destinoLongitud } : null;
  const origen = r && r.origenLatitud !== null && r.origenLongitud !== null ? { latitud: r.origenLatitud, longitud: r.origenLongitud } : null;
  const pines: PinMapa[] = [
    ...(origen ? [{ clave: 'origen', ...origen, texto: 'TW', color: '#64748B', tamano: 34, etiqueta: 'Salida de la sede' }] : []),
    ...(destino ? [{ clave: 'destino', ...destino, texto: 'CL', color: '#0F172A', tamano: 34, etiqueta: 'Planta del cliente' }] : []),
    ...(posicion && r ? [{ clave: 'tecnico', ...posicion, texto: inicialesDe(r.tecnico), color: colorPin(r.estado), tamano: 42, etiqueta: r.tecnico ?? 'Técnico' }] : []),
  ];

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
            <MapaEsquematico pines={pines} ruta={recorrido} alto={280} vacio="El técnico aún no envía su ubicación hoy." />
            <View style={estilos.mapaPie}>
              <Text style={estilos.nota}>{r.minutosUbicacion === null ? 'Sin posición GPS hoy.' : `Última posición ${haceMinutos(r.minutosUbicacion)}.`}</Text>
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

            <View style={estilos.stats}>
              <Stat valor={textoVelocidad(r.velocidadKmh)} texto="Velocidad" />
              <Stat
                valor={r.etaEstimada ?? r.eta ?? '—'}
                texto={r.etaEstimada ? 'Llegada est.' : 'ETA'}
                color={(r.etaEstimada ?? r.eta) && r.etaProgramada && (r.etaEstimada ?? r.eta)! > r.etaProgramada ? colores.naranja : undefined}
              />
              <Stat valor={textoDistancia(r.distanciaM)} texto="Distancia" />
            </View>

            {(!!r.destinoNombre || !!r.destinoDireccion) && (
              <View style={estilos.destino} testID="destino-servicio">
                <Ionicons name="flag-outline" size={22} color={colores.primario} />
                <View style={{ flex: 1 }}>
                  <Text style={estilos.destinoTitulo}>{r.estado === 'en_ruta' ? 'Se dirige a' : 'Planta del servicio'}</Text>
                  <Text style={estilos.destinoNombre}>{r.destinoNombre ?? r.destinoDireccion}</Text>
                  {!!r.destinoDireccion && r.destinoDireccion !== r.destinoNombre && <Text style={estilos.destinoDetalle}>{r.destinoDireccion}</Text>}
                  {r.etaEstimada && r.etaMinutos != null ? (
                    <Text style={estilos.destinoEta}>
                      Llegaría a las {r.etaEstimada} (≈ {textoDuracion(r.etaMinutos)}){r.etaProgramada ? ' · programado ' + r.etaProgramada : ''}
                    </Text>
                  ) : null}
                  {!destino && <Text style={estilos.destinoDetalle}>La planta no tiene coordenadas registradas: no se puede dibujar el destino ni calcular la llegada.</Text>}
                </View>
              </View>
            )}

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
            <Text style={estilos.nota}>La distancia es en línea recta hasta la planta; la velocidad y la hora de llegada estimada son referenciales.</Text>

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

function Stat({ valor, texto, color }: { valor: string; texto: string; color?: string }) {
  return (
    <View style={estilos.stat}>
      <Text style={[estilos.statValor, color ? { color } : null]}>{valor}</Text>
      <Text style={estilos.statTexto}>{texto}</Text>
    </View>
  );
}

const estilos = StyleSheet.create({
  area: { flex: 1, backgroundColor: colores.fondo },
  contenido: { paddingTop: 18, paddingBottom: 28, width: '100%', alignSelf: 'center' },
  tituloFila: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 2 },
  titulo: { fontWeight: '800', color: colores.titulo, flexShrink: 1 },
  subtitulo: { color: colores.textoSecundario, fontSize: 15, marginBottom: 12 },
  mapaPie: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  enlaceMaps: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 },
  enlaceMapsTexto: { color: colores.primario, fontSize: 15.5, fontWeight: '700' },
  stats: { flexDirection: 'row', gap: 10, marginTop: 10 },
  stat: { flex: 1, backgroundColor: colores.blanco, borderWidth: 1, borderColor: colores.bordeSuave, borderRadius: 14, paddingVertical: 12, alignItems: 'center' },
  statValor: { fontSize: 20, fontWeight: '800', color: colores.titulo },
  statTexto: { fontSize: 13, color: colores.textoSecundario, marginTop: 2 },
  destino: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', backgroundColor: colores.primarioSuave, borderWidth: 1, borderColor: '#BFD7F5', borderRadius: radios.tarjeta, padding: 14, marginTop: 12 },
  destinoTitulo: { fontSize: 12.5, fontWeight: '800', color: colores.primario, letterSpacing: 0.4 },
  destinoNombre: { fontSize: 16, fontWeight: '800', color: colores.titulo, marginTop: 1 },
  destinoDetalle: { fontSize: 13.5, color: colores.textoSecundario, marginTop: 2, lineHeight: 19 },
  destinoEta: { fontSize: 14.5, fontWeight: '700', color: colores.titulo, marginTop: 4 },
  demora: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FDE68A', borderRadius: radios.tarjeta, padding: 14, marginTop: 12 },
  demoraTexto: { flex: 1, color: colores.titulo, fontSize: 15.5, lineHeight: 22 },
  seccion: { fontSize: 14, fontWeight: '800', letterSpacing: 1.2, color: colores.textoSecundario, marginTop: 20, marginBottom: 10 },
  eventos: { backgroundColor: colores.blanco, borderWidth: 1, borderColor: colores.bordeSuave, borderRadius: radios.tarjeta, paddingHorizontal: 14 },
  evento: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 13 },
  eventoBorde: { borderTopWidth: 1, borderTopColor: colores.bordeSuave },
  eventoTitulo: { fontSize: 16.5, color: colores.titulo, fontWeight: '600' },
  eventoDetalle: { fontSize: 14, color: colores.textoSecundario, marginTop: 2 },
  eventoPunto: { width: 8, height: 8, borderRadius: 4 },
  badge: { borderRadius: 8, paddingHorizontal: 9, paddingVertical: 4 },
  badgeTexto: { fontSize: 11.5, fontWeight: '800', letterSpacing: 0.3 },
  vacio: { color: colores.textoSecundario, fontSize: 15, paddingVertical: 16, textAlign: 'center' },
  nota: { fontSize: 12.5, color: colores.textoTenue, marginTop: 8, lineHeight: 18 },
  botones: { flexDirection: 'row', gap: 10, marginTop: 16 },
  boton: { flex: 1, minHeight: 54, borderRadius: radios.boton, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  botonBorde: { borderWidth: 1.5, borderColor: colores.primario, backgroundColor: colores.blanco },
  botonPrimario: { backgroundColor: colores.primario },
  botonTexto: { color: colores.blanco, fontSize: 16, fontWeight: '700' },
});
