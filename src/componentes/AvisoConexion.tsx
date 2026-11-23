import { useEffect, useRef } from 'react';
import { AppState, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { validarSesion } from '@/api/autenticacion';
import { cerrarRecuperacion, leerEstadoConexion, reiniciarConexion, useConexion, useEstadoConexion } from '@/conexion/estadoConexion';
import { entorno } from '@/config/entorno';
import { usePendientesTotales } from '@/hooks/usePendientesTotales';
import { useSesion } from '@/sesion/SesionContext';
import { colores, radios } from '@/tema/colores';
import { DURACION_AVISO_RECUPERADA_MS, textoBannerSinConexion, textoRegistrosEnviados } from '@/utilidades/conexion';

/** Cada cuánto se sondea al servidor mientras no hay conexión. */
const CADA_SONDEO_MS = 10_000;

/** El estado de conexión solo se muestra en la app instalada (no en la demo ni en la versión web de pruebas). */
const mostrarConexion = !entorno.usarMock && Platform.OS !== 'web';

/**
 * HU-18 — Aviso «Sin conexión · lo que registres se guarda en el teléfono». Va justo debajo de la barra superior de cada pantalla (`EncabezadoApp`), así se ve en TODAS
 * las pantallas con sesión sin cambiar la navegación ni las pantallas. Muestra, si los hay, cuántos registros esperan señal. Desaparece solo al volver la conexión.
 */
export function BannerSinConexion() {
  const { enLinea } = useConexion();
  if (!mostrarConexion || enLinea) return null;
  return <ContenidoBannerSinConexion />;
}

/** Solo se monta sin conexión: así el recuento de registros guardados no se calcula en cada pantalla con señal. */
function ContenidoBannerSinConexion() {
  const { sesion } = useSesion();
  const pendientes = usePendientesTotales(sesion?.usuario.idUsuario);
  return (
    <View style={estilos.banner} accessibilityRole="alert" accessibilityLiveRegion="polite" testID="banner-sin-conexion">
      <Ionicons name="cloud-offline-outline" size={18} color={colores.amarilloTexto} />
      <Text style={estilos.bannerTexto}>{textoBannerSinConexion(pendientes)}</Text>
    </View>
  );
}

/**
 * HU-18 — Aviso «Conexión recuperada» (flota sobre la barra de pestañas unos segundos): sin botón de sincronizar, todo lo guardado se envía solo y aquí se dice cuántos
 * registros salieron. Se cierra solo o al tocarlo.
 */
export function AvisoConexionRecuperada() {
  const e = useEstadoConexion();
  const { bottom } = useSafeAreaInsets();
  const recuperada = e.recuperada;
  const enviados = recuperada?.enviados ?? 0;

  // Se queda visible DURACION_AVISO_RECUPERADA_MS desde la recuperación o desde el último envío anotado
  useEffect(() => {
    if (!recuperada) return;
    const t = setTimeout(cerrarRecuperacion, DURACION_AVISO_RECUPERADA_MS);
    return () => clearTimeout(t);
  }, [recuperada, enviados]);

  if (!mostrarConexion || !recuperada || !e.enLinea) return null;
  const detalle = textoRegistrosEnviados(enviados);
  return (
    <View pointerEvents="box-none" style={[estilos.capa, { bottom: bottom + 84 }]}>
      <Pressable onPress={cerrarRecuperacion} style={estilos.toast} accessibilityRole="alert" accessibilityLiveRegion="polite" testID="aviso-conexion-recuperada">
        <Ionicons name="cloud-done-outline" size={22} color="#4ADE80" />
        <View style={{ flex: 1 }}>
          <Text style={estilos.toastTitulo}>Conexión recuperada</Text>
          {!!detalle && <Text style={estilos.toastDetalle}>{detalle}</Text>}
        </View>
      </Pressable>
    </View>
  );
}

/**
 * HU-18 — No pinta nada: confirma la conexión mientras no hay señal. Sondea al servidor cada ~10 s (con una consulta barata, la misma de la vigilancia de la sesión) y al volver
 * la app a primer plano; la primera respuesta, aunque sea un error del servidor, devuelve el estado a «en línea» (lo hace `solicitar`). Con señal no sondea: las demás
 * llamadas de la app ya lo mantienen al día. Al cerrar la sesión el estado vuelve al inicial.
 */
export function VigilanteConexion() {
  const { sesion } = useSesion();
  const token = sesion?.token ?? null;
  const sondeando = useRef(false);

  useEffect(() => {
    if (!token || !mostrarConexion) {
      reiniciarConexion();
      return;
    }
    async function sondear(siempre: boolean) {
      if (sondeando.current || AppState.currentState !== 'active' || !token) return;
      if (!siempre && leerEstadoConexion().enLinea) return;
      sondeando.current = true;
      try {
        await validarSesion(token, false);
      } catch {
        // sin respuesta: sigue sin conexión (y un error del servidor ya la devolvió a «en línea»)
      } finally {
        sondeando.current = false;
      }
    }
    const reloj = setInterval(() => void sondear(false), CADA_SONDEO_MS);
    const estadoApp = AppState.addEventListener('change', (e) => {
      if (e === 'active') void sondear(true);
    });
    return () => {
      clearInterval(reloj);
      estadoApp.remove();
    };
  }, [token]);

  return null;
}

const estilos = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 12,
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radios.campo,
    borderWidth: 1,
    borderColor: '#FDE68A',
    backgroundColor: colores.amarilloFondo,
  },
  bannerTexto: { flex: 1, fontSize: 13, lineHeight: 18, color: colores.amarilloTexto, fontWeight: '600' },
  capa: { position: 'absolute', left: 14, right: 14, alignItems: 'center' },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    alignSelf: 'stretch',
    maxWidth: 520,
    backgroundColor: '#0F172A',
    borderRadius: radios.tarjeta,
    paddingHorizontal: 14,
    paddingVertical: 12,
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  toastTitulo: { color: colores.blanco, fontSize: 14.5, fontWeight: '800' },
  toastDetalle: { color: '#CBD5E1', fontSize: 12.5, marginTop: 1 },
});
