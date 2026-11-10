import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { nombreDeCodigo, obtenerCatalogo } from '@/api/catalogos';
import { ErrorApi } from '@/api/cliente';
import { generarMiReserva, obtenerSolicitudConRespaldo, solicitarCorrelativo } from '@/api/correlativos';
import { horaRespaldo } from '@/api/respaldo';
import { Aviso } from '@/componentes/Aviso';
import { Boton } from '@/componentes/Boton';
import { EncabezadoApp } from '@/componentes/EncabezadoApp';
import { Selector } from '@/componentes/Selector';
import { useConsulta } from '@/hooks/useConsulta';
import { useDiseno } from '@/hooks/useDiseno';
import { useSesion } from '@/sesion/SesionContext';
import { colores, radios } from '@/tema/colores';
import { MAX_OBSERVACION, claseCapacidad, etiquetaOrden, fechaHoraDe, subtituloSolicitud } from '@/utilidades/correlativos';

/**
 * HU-14 — Solicitud de correlativo a Metrología (etapa 5 "Correlativo y certificado" del trabajo en el equipo).
 *  - "Datos del equipo" (orden, equipo, serie, código, COD TW, clase y capacidad) con la etiqueta OS · Servicio técnico u OM · Metrología según la RQ.
 *  - "Nueva solicitud": tipo de certificado* y observación. El back exige el equipo en ejecución y los ensayos finalizados, y un solo ticket abierto por equipo.
 *  - Si Metrología ya asignó el correlativo, aquí mismo se ve y se usa ("Usar correlativo" lleva al modal "Correlativo y certificado" del trabajo en el equipo).
 *  - Solicitar exige conexión. Un técnico de Metrología recibe además su reserva diaria de correlativos al abrir esta pantalla.
 */
export default function PantallaSolicitudCorrelativo() {
  const { sesion } = useSesion();
  const usuario = sesion?.usuario;
  const d = useDiseno();
  const params = useLocalSearchParams<{ id?: string; equipo?: string }>();
  const idOs = Number(params.id);
  const idOsEquipo = Number(params.equipo);
  const valido = Number.isInteger(idOs) && idOs > 0 && Number.isInteger(idOsEquipo) && idOsEquipo > 0;
  const token = sesion?.token ?? '';

  const [tipo, setTipo] = useState<string | null>(null);
  const [observacion, setObservacion] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: 'error' | 'info'; texto: string } | null>(null);

  const { datos, cargando, recargando, error, recargar } = useConsulta(async (t) => {
    if (!valido) throw new ErrorApi('Servicio o equipo no válido.', 400, 1);
    const [r, cargos] = await Promise.all([
      obtenerSolicitudConRespaldo(t, usuario?.idUsuario ?? 0, idOs, idOsEquipo),
      obtenerCatalogo(t, 'CARGO_USUARIO').catch(() => undefined),
    ]);
    return { sol: r.datos, sinConexion: r.sinConexion, guardadoEn: r.guardadoEn, cargos };
  }, `${params.id ?? ''}|${params.equipo ?? ''}`);

  // Técnico de Metrología: la reserva diaria de correlativos se genera al abrir (idempotente por día)
  const reservaPedida = useRef(false);
  const esTecnicoMet = datos?.sol.cabecera.tecnicoMetrologia ?? false;
  useEffect(() => {
    if (!esTecnicoMet || reservaPedida.current || !token) return;
    reservaPedida.current = true;
    void generarMiReserva(token)
      .then((r) => (r.generados > 0 ? recargar() : undefined))
      .catch(() => undefined);
  }, [esTecnicoMet, token, recargar]);

  const cargo = nombreDeCodigo(datos?.cargos, usuario?.cargo) ?? usuario?.cargo ?? 'Técnico de Campo';
  const sol = datos?.sol;
  const c = sol?.cabecera;

  async function enviar() {
    if (!c || !tipo) return;
    setEnviando(true);
    setMensaje(null);
    try {
      const r = await solicitarCorrelativo(token, idOs, idOsEquipo, Number(tipo), observacion);
      router.replace({ pathname: '/mis-tickets', params: { id: String(idOs), equipo: String(idOsEquipo), creado: r.datos?.numero ?? '' } });
    } catch (e) {
      setMensaje({ tipo: 'error', texto: e instanceof Error ? e.message : 'No se pudo enviar la solicitud.' });
    } finally {
      setEnviando(false);
    }
  }

  function usarCorrelativo() {
    router.replace({ pathname: '/trabajo-equipo', params: { id: String(idOs), equipo: String(idOsEquipo), usar: String(Date.now()) } });
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
            Solicitud de correlativo
          </Text>
        </View>

        {cargando ? (
          <ActivityIndicator color={colores.primario} style={{ marginTop: 40 }} />
        ) : error || !sol || !c ? (
          <Aviso tipo="error" mensaje={error ?? 'No se encontró el equipo.'} />
        ) : (
          <>
            <Text style={estilos.subtitulo}>{subtituloSolicitud(c.equipo, c.codigoCliente, c.numeroOs)}</Text>
            {datos?.sinConexion && (
              <View style={{ marginBottom: 10 }}>
                <Aviso mensaje={`Sin conexión: se muestra lo último guardado (${horaRespaldo(datos.guardadoEn)}). Solicitar el correlativo exige conexión.`} />
              </View>
            )}

            <View style={estilos.tarjeta} testID="datos-equipo">
              <View style={estilos.cabeceraTarjeta}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                  <Ionicons name="information-circle-outline" size={18} color={colores.textoSecundario} />
                  <Text style={estilos.seccion}>DATOS DEL EQUIPO</Text>
                </View>
                <View style={estilos.pillOrden}>
                  <Text style={estilos.pillOrdenTexto}>{etiquetaOrden(c.tipoOrden)}</Text>
                </View>
              </View>
              <View style={estilos.rejilla}>
                <Dato k="ORDEN" v={c.numeroOs} />
                <Dato k="EQUIPO" v={c.equipo} />
                <Dato k="SERIE" v={c.numeroSerie ?? '—'} />
                <Dato k="CÓDIGO" v={c.codigoCliente ?? '—'} />
                <Dato k="COD TW" v={c.codigoTw ?? '—'} />
                <Dato k="CLASE / CAPACIDAD" v={claseCapacidad(c.clase, c.capacidad)} />
              </View>
            </View>

            {!!c.numeroCertificado && (
              <View style={[estilos.banner, estilos.bannerVerde]} testID="certificado-guardado">
                <Ionicons name="checkmark-circle" size={22} color={colores.verde} />
                <Text style={estilos.bannerTexto}>
                  <Text style={{ fontWeight: '800' }}>Certificado {c.numeroCertificado}</Text> ya forma parte del informe técnico de este equipo.
                </Text>
              </View>
            )}

            {!!sol.asignado && !c.numeroCertificado && (
              <View style={[estilos.tarjeta, { borderColor: '#BFDBFE', backgroundColor: colores.primarioSuave }]} testID="correlativo-asignado">
                <Text style={estilos.seccion}>CORRELATIVO ASIGNADO</Text>
                <Text style={estilos.correlativo}>{sol.asignado.correlativo}</Text>
                <Text style={estilos.linea}>
                  {sol.asignado.ticket}
                  {sol.asignado.asignadoEn ? ` · ${fechaHoraDe(sol.asignado.asignadoEn)}` : ''}
                  {sol.asignado.asignadoPor ? ` · ${sol.asignado.asignadoPor}` : ''}
                </Text>
                <View style={{ marginTop: 12 }}>
                  <Boton titulo="Usar correlativo" onPress={usarCorrelativo} />
                </View>
              </View>
            )}

            <View style={estilos.tarjeta}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="clipboard-outline" size={18} color={colores.textoSecundario} />
                <Text style={estilos.seccion}>NUEVA SOLICITUD</Text>
              </View>

              <View style={{ marginTop: 10 }}>
                <Selector
                  etiqueta="Tipo de certificado *"
                  placeholder="Elige el tipo de certificado"
                  opciones={sol.tipos.map((t) => ({ valor: String(t.idTipo), texto: t.nombre }))}
                  valor={tipo}
                  onCambio={setTipo}
                  testID="tipo-certificado"
                />
              </View>

              <Text style={estilos.etiqueta}>Observación</Text>
              <TextInput
                value={observacion}
                onChangeText={(t) => setObservacion(t.slice(0, MAX_OBSERVACION))}
                placeholder="Ensayos conformes; excentricidad dentro de EMP."
                placeholderTextColor={colores.placeholder}
                multiline
                style={estilos.observacion}
                testID="observacion-correlativo"
              />
              <Text style={estilos.contador}>
                {observacion.length} / {MAX_OBSERVACION}
              </Text>

              {!c.puedeSolicitar && !!c.motivoBloqueo && !c.numeroCertificado && (
                <View style={{ marginBottom: 10 }}>
                  <Aviso mensaje={c.motivoBloqueo} />
                </View>
              )}
              {mensaje && (
                <View style={{ marginBottom: 10 }} testID="mensaje-solicitud">
                  <Aviso tipo={mensaje.tipo} mensaje={mensaje.texto} />
                </View>
              )}

              <Boton titulo="Solicitar correlativo" onPress={() => void enviar()} cargando={enviando} deshabilitado={!c.puedeSolicitar || !tipo} />
            </View>

            <Pressable
              onPress={() => router.push({ pathname: '/mis-tickets', params: { id: String(idOs), equipo: String(idOsEquipo) } })}
              style={estilos.enlace}
              accessibilityRole="button"
              testID="ver-mis-tickets"
            >
              <Ionicons name="receipt-outline" size={20} color={colores.primario} />
              <Text style={estilos.enlaceTexto}>Ver mis tickets</Text>
            </Pressable>

            <View style={estilos.info}>
              <Ionicons name="information-circle-outline" size={20} color={colores.primario} />
              <Text style={estilos.infoTexto}>
                {c.tipoOrden === 'OM' ? 'La solicitud llega al Jefe de Metrología en la intranet.' : 'La solicitud llega al supervisor de Metrología en la intranet.'} El correlativo
                será el N° de certificado del informe técnico.
              </Text>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
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
  contenido: { paddingTop: 18, paddingBottom: 28, width: '100%', alignSelf: 'center' },
  tituloFila: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4 },
  titulo: { fontWeight: '700', color: colores.titulo, flexShrink: 1 },
  subtitulo: { color: colores.textoSecundario, fontSize: 14.5, marginBottom: 10 },
  tarjeta: { backgroundColor: colores.blanco, borderWidth: 1, borderColor: colores.bordeSuave, borderRadius: radios.tarjeta, padding: 16, marginTop: 12 },
  cabeceraTarjeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  seccion: { fontSize: 13.5, fontWeight: '800', color: colores.textoSecundario, letterSpacing: 0.8 },
  pillOrden: { backgroundColor: colores.azulFondo, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  pillOrdenTexto: { color: colores.azulTexto, fontSize: 11.5, fontWeight: '800' },
  rejilla: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 14 },
  dato: { width: '50%', paddingRight: 8 },
  datoK: { fontSize: 12.5, fontWeight: '700', color: colores.textoSecundario, letterSpacing: 0.6 },
  datoV: { fontSize: 17, color: colores.titulo, marginTop: 2 },
  correlativo: { fontSize: 28, fontWeight: '800', color: colores.primario, marginTop: 4 },
  linea: { fontSize: 14.5, color: colores.textoSecundario, marginTop: 4 },
  etiqueta: { fontSize: 16.5, fontWeight: '700', color: colores.titulo, marginTop: 14, marginBottom: 6 },
  observacion: { borderWidth: 1, borderColor: colores.borde, borderRadius: radios.campo, padding: 12, fontSize: 16, minHeight: 84, textAlignVertical: 'top', color: colores.texto },
  contador: { textAlign: 'right', color: colores.textoSecundario, fontSize: 13, marginTop: 4, marginBottom: 10 },
  banner: { flexDirection: 'row', gap: 10, alignItems: 'center', borderRadius: radios.tarjeta, padding: 14, marginTop: 12, borderWidth: 1 },
  bannerVerde: { backgroundColor: colores.verdeFondo, borderColor: colores.verdeBorde },
  bannerTexto: { flex: 1, color: colores.titulo, fontSize: 15.5, lineHeight: 22 },
  enlace: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, marginTop: 4 },
  enlaceTexto: { color: colores.primario, fontSize: 17, fontWeight: '700' },
  info: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', backgroundColor: colores.primarioSuave, borderRadius: radios.tarjeta, padding: 14, marginTop: 4 },
  infoTexto: { flex: 1, color: colores.titulo, fontSize: 15, lineHeight: 22 },
});
