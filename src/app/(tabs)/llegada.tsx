import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ErrorApi } from '@/api/cliente';
import { nombreDeCodigo, obtenerCatalogo } from '@/api/catalogos';
import { obtenerLlegada, registrarLlegada, validarLlegada, type ReferenciaGps, type Ubicacion, type ValidacionLlegada } from '@/api/ruta';
import { Aviso } from '@/componentes/Aviso';
import { Boton } from '@/componentes/Boton';
import { EncabezadoApp } from '@/componentes/EncabezadoApp';
import { useConsulta } from '@/hooks/useConsulta';
import { useDiseno } from '@/hooks/useDiseno';
import { useUbicacion } from '@/hooks/useUbicacion';
import { useSesion } from '@/sesion/SesionContext';
import { colores, radios } from '@/tema/colores';
import { horaDe, horaLimaAhora } from '@/utilidades/formato';

/**
 * HU-06 — Registrar llegada.
 *  - Captura el GPS y su precisión (± m) y la compara con la coordenada de la planta del cliente.
 *  - Dentro del rango: validación verde y "Confirmar llegada". Fuera: rojo y no deja confirmar.
 *  - La comparación la hace el back (aquí solo se muestra); al confirmar el back vuelve a validar.
 *  - Con la llegada registrada se habilitan los objetivos (se levanta el Hard Stop).
 */
export default function PantallaLlegada() {
  const { sesion } = useSesion();
  const usuario = sesion?.usuario;
  const d = useDiseno();
  const params = useLocalSearchParams<{ id?: string }>();
  const idOs = Number(params.id);
  const idValido = Number.isInteger(idOs) && idOs > 0;
  const { datos, cargando, recargando, error, recargar } = useConsulta(async (token) => {
    if (!idValido) throw new ErrorApi('Servicio no válido.', 400, 1);
    const [llegada, cargos] = await Promise.all([obtenerLlegada(token, idOs), obtenerCatalogo(token, 'CARGO_USUARIO')]);
    return { llegada, cargos };
  }, params.id ?? '');

  const [validacion, setValidacion] = useState<ValidacionLlegada | null>(null);
  const [validando, setValidando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [horaCaptura, setHoraCaptura] = useState<string | null>(null);

  const l = datos?.llegada ?? null;
  const cargo = nombreDeCodigo(datos?.cargos, usuario?.cargo) ?? usuario?.cargo ?? 'Técnico de Campo';

  // Cada vez que llega una ubicación nueva, el back la compara con la de la planta
  const validar = useCallback(
    (u: Ubicacion) => {
      if (!sesion) return;
      setValidando(true);
      setHoraCaptura(horaLimaAhora());
      validarLlegada(sesion.token, idOs, u)
        .then((v) => {
          setValidacion(v);
          setMensaje(null);
        })
        .catch((e) => setMensaje(e instanceof Error ? e.message : 'No se pudo validar la ubicación.'))
        .finally(() => setValidando(false));
    },
    [sesion, idOs],
  );
  const gps = useUbicacion(true, validar);

  async function confirmar() {
    if (!sesion || !gps.ubicacion || enviando) return;
    setEnviando(true);
    setMensaje(null);
    try {
      await registrarLlegada(sesion.token, idOs, gps.ubicacion);
      router.replace({ pathname: '/objetivos', params: { id: String(idOs) } });
    } catch (e) {
      setMensaje(e instanceof Error ? e.message : 'No se pudo registrar la llegada.');
      await recargar();
    } finally {
      setEnviando(false);
    }
  }

  const tono = !validacion
    ? null
    : validacion.resultado === 'valida'
      ? 'ok'
      : validacion.resultado === 'sin_referencia'
        ? 'aviso'
        : 'error';

  return (
    <SafeAreaView style={estilos.area} edges={['top']}>
      <EncabezadoApp nombre={usuario?.nombre ?? ''} apellido={usuario?.apellido} subtitulo={`${usuario?.nombre ?? ''} · ${cargo}`} />
      <ScrollView
        contentContainerStyle={[estilos.contenido, { paddingHorizontal: d.margen, maxWidth: d.anchoMaximo }]}
        refreshControl={<RefreshControl refreshing={recargando} onRefresh={recargar} colors={[colores.primario]} />}
      >
        <View style={estilos.tituloFila}>
          <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Volver">
            <Ionicons name="arrow-back" size={24} color={colores.titulo} />
          </Pressable>
          <Text style={[estilos.titulo, { fontSize: d.tituloPantalla }]} accessibilityRole="header">
            Registrar llegada
          </Text>
        </View>

        {cargando ? (
          <ActivityIndicator color={colores.primario} style={{ marginTop: 40 }} />
        ) : error || !l ? (
          <Aviso tipo="error" mensaje={error ?? 'No se encontró el servicio.'} />
        ) : l.llegada ? (
          <>
            <View style={[estilos.validacion, estilos.validacionOk]}>
              <Ionicons name="checkmark-circle" size={22} color={colores.verde} />
              <View style={{ flex: 1 }}>
                <Text style={[estilos.validacionTitulo, { color: colores.verdeEtiquetaTexto }]}>Llegada registrada a las {horaDe(l.llegada.en)}</Text>
                <Text style={estilos.nota}>
                  {l.llegada.distanciaMetros !== null ? `A ${Math.round(l.llegada.distanciaMetros)} m de la planta · ` : ''}
                  precisión ± {Math.round(l.llegada.precisionMetros ?? 0)} m
                </Text>
              </View>
            </View>
            <View style={{ marginTop: 16 }}>
              <Boton titulo="Ver objetivos →" onPress={() => router.replace({ pathname: '/objetivos', params: { id: String(idOs) } })} />
            </View>
          </>
        ) : (
          <>
            <View style={estilos.tarjeta} testID="llegada-destino">
              <Text style={estilos.etiqueta}>CLIENTE</Text>
              <Text style={estilos.valorFuerte}>{l.cliente ?? '—'}</Text>
              <Text style={[estilos.etiqueta, { marginTop: 12 }]}>UBICACIÓN ESPERADA</Text>
              <Text style={estilos.valor}>{l.sede ?? '—'}</Text>
              {!!l.direccion && <Text style={estilos.nota}>{l.direccion}</Text>}
              <View style={estilos.separador} />
              <View style={estilos.dosColumnas}>
                <View style={{ flex: 1 }}>
                  <Text style={estilos.etiqueta}>HORA AUTOMÁTICA</Text>
                  <Text style={estilos.valor}>{horaCaptura ?? horaLimaAhora()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={estilos.etiqueta}>PRECISIÓN</Text>
                  <Text style={estilos.valor} testID="precision-gps">
                    {gps.ubicacion ? `± ${Math.round(gps.ubicacion.precisionMetros)} m` : '—'}
                  </Text>
                </View>
              </View>
              <View style={estilos.gpsFila}>
                <Ionicons
                  name={gps.estado === 'activo' ? 'location' : 'location-outline'}
                  size={16}
                  color={gps.estado === 'activo' ? colores.primario : colores.rojo}
                />
                <Text style={[estilos.gpsTexto, gps.estado !== 'activo' && { color: colores.textoSecundario }]}>
                  {gps.estado === 'activo' ? 'GPS: Capturado' : gps.estado === 'buscando' ? 'GPS: Buscando…' : 'GPS: Sin ubicación'}
                </Text>
              </View>
            </View>

            <Mapa referencia={l.referencia} ubicacion={gps.ubicacion} />

            {!!gps.mensaje && (
              <View style={{ marginTop: 12 }}>
                <Aviso tipo="error" mensaje={gps.mensaje} />
              </View>
            )}

            {validando ? (
              <ActivityIndicator color={colores.primario} style={{ marginTop: 16 }} />
            ) : validacion ? (
              <View
                style={[estilos.validacion, tono === 'ok' ? estilos.validacionOk : tono === 'aviso' ? estilos.validacionAviso : estilos.validacionError]}
                testID="validacion-llegada"
              >
                <Ionicons
                  name={tono === 'ok' ? 'checkmark-circle' : tono === 'aviso' ? 'alert-circle' : 'close-circle'}
                  size={22}
                  color={tono === 'ok' ? colores.verde : tono === 'aviso' ? colores.naranja : colores.rojo}
                />
                <View style={{ flex: 1 }}>
                  <Text
                    style={[
                      estilos.validacionTitulo,
                      { color: tono === 'ok' ? colores.verdeEtiquetaTexto : tono === 'aviso' ? colores.amarilloTexto : colores.rojo },
                    ]}
                  >
                    {tono === 'ok' ? 'Ubicación válida' : tono === 'aviso' ? 'Sin coordenada de la planta' : 'Fuera del rango permitido'}
                  </Text>
                  <Text style={estilos.nota}>{validacion.mensaje}</Text>
                </View>
              </View>
            ) : null}

            {!!mensaje && (
              <View style={{ marginTop: 12 }} testID="mensaje-llegada">
                <Aviso tipo="error" mensaje={mensaje} />
              </View>
            )}

            <View style={{ gap: 12, marginTop: 18 }}>
              <Boton
                titulo="Confirmar llegada →"
                onPress={() => void confirmar()}
                cargando={enviando}
                deshabilitado={!validacion?.registrable || enviando || validando || !l.puedeRegistrar}
              />
              <Boton titulo="Volver a capturar ubicación" variante="secundario" onPress={() => void gps.capturar()} deshabilitado={gps.estado === 'buscando'} />
            </View>
            {!l.puedeRegistrar && (
              <View style={{ marginTop: 12 }}>
                <Aviso mensaje="Primero inicia el traslado desde la validación antes de salir." />
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

/**
 * Mapa esquemático (sin mapas de terceros): círculo del radio permitido alrededor de la planta
 * y la posición del técnico a escala. Si la sede no tiene coordenada, solo se muestra el técnico.
 */
function Mapa({ referencia, ubicacion }: { referencia: ReferenciaGps | null; ubicacion: Ubicacion | null }) {
  const LADO = 220;
  const radioPx = 70;
  let dx = 0;
  let dy = 0;
  let fuera = false;
  if (referencia && ubicacion) {
    const mLat = 111_320;
    const mLon = 111_320 * Math.cos((referencia.latitud * Math.PI) / 180);
    const este = (ubicacion.longitud - referencia.longitud) * mLon;
    const norte = (ubicacion.latitud - referencia.latitud) * mLat;
    const escala = radioPx / referencia.radioMetros;
    dx = este * escala;
    dy = -norte * escala;
    const dist = Math.hypot(dx, dy);
    const max = LADO / 2 - 14;
    if (dist > max) {
      fuera = true;
      dx = (dx / dist) * max;
      dy = (dy / dist) * max;
    }
  }
  return (
    <View style={estilos.mapa} accessibilityLabel="Mapa de tu ubicación y la planta">
      <View style={{ width: LADO, height: LADO, alignItems: 'center', justifyContent: 'center' }}>
        {referencia && (
          <>
            <View style={[estilos.radio, { width: radioPx * 2, height: radioPx * 2, borderRadius: radioPx }]} />
            <Ionicons name="location" size={30} color={colores.rojo} style={{ position: 'absolute', marginTop: -30 }} />
            <Text style={estilos.planta}>PLANTA</Text>
          </>
        )}
        {ubicacion && (
          <View style={[estilos.yo, { transform: [{ translateX: dx }, { translateY: dy }] }, fuera && { borderColor: colores.rojo }]}>
            <View style={[estilos.yoPunto, fuera && { backgroundColor: colores.rojo }]} />
          </View>
        )}
      </View>
      {referencia && <Text style={estilos.mapaNota}>Radio permitido: {referencia.radioMetros} m</Text>}
    </View>
  );
}

const estilos = StyleSheet.create({
  area: { flex: 1, backgroundColor: colores.fondo },
  contenido: { paddingTop: 18, paddingBottom: 28, width: '100%', alignSelf: 'center' },
  tituloFila: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  titulo: { fontWeight: '700', color: colores.titulo, flexShrink: 1 },
  tarjeta: { backgroundColor: colores.blanco, borderWidth: 1, borderColor: colores.bordeSuave, borderRadius: radios.tarjeta, padding: 18 },
  etiqueta: { fontSize: 11.5, fontWeight: '600', letterSpacing: 0.8, color: colores.textoSecundario },
  valorFuerte: { fontSize: 17, fontWeight: '700', color: colores.titulo, marginTop: 2 },
  valor: { fontSize: 15, color: colores.texto, marginTop: 2 },
  nota: { fontSize: 13, color: colores.textoSecundario, marginTop: 2, lineHeight: 18 },
  separador: { height: 1, backgroundColor: colores.bordeSuave, marginVertical: 12 },
  dosColumnas: { flexDirection: 'row', gap: 12 },
  gpsFila: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 },
  gpsTexto: { color: colores.primario, fontWeight: '600', fontSize: 14 },
  mapa: {
    marginTop: 14,
    backgroundColor: '#E5E9F0',
    borderRadius: radios.tarjeta,
    borderWidth: 1,
    borderColor: colores.bordeSuave,
    alignItems: 'center',
    paddingVertical: 10,
    overflow: 'hidden',
  },
  radio: { position: 'absolute', borderWidth: 2, borderStyle: 'dashed', borderColor: colores.primario, backgroundColor: 'rgba(0,87,184,0.10)' },
  planta: {
    position: 'absolute',
    marginTop: -78,
    fontSize: 10,
    fontWeight: '800',
    color: colores.titulo,
    backgroundColor: 'rgba(255,255,255,0.85)',
    paddingHorizontal: 6,
    borderRadius: 4,
  },
  yo: {
    position: 'absolute',
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 3,
    borderColor: colores.primario,
    backgroundColor: colores.blanco,
    alignItems: 'center',
    justifyContent: 'center',
  },
  yoPunto: { width: 10, height: 10, borderRadius: 5, backgroundColor: colores.primario },
  mapaNota: { fontSize: 12, color: colores.textoSecundario, marginTop: 2 },
  validacion: { flexDirection: 'row', gap: 10, borderRadius: 12, padding: 14, marginTop: 14, borderWidth: 1 },
  validacionOk: { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' },
  validacionAviso: { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' },
  validacionError: { backgroundColor: '#FEF2F2', borderColor: '#FECACA' },
  validacionTitulo: { fontSize: 15, fontWeight: '700' },
});
