import { SplashScreen, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useBuscarActualizacion } from '@/actualizaciones/actualizaciones';
import { ProveedorSesion, useSesion } from '@/sesion/SesionContext';
import { colores } from '@/tema/colores';

SplashScreen.preventAutoHideAsync();

export default function RaizApp() {
  // Mientras se ve el splash, revisa si hay un avance nuevo publicado (EAS Update).
  const actualizacionRevisada = useBuscarActualizacion();
  if (!actualizacionRevisada) return null;

  return (
    <SafeAreaProvider>
      <ProveedorSesion>
        <ControladorSplash />
        <Navegacion />
        <StatusBar style="dark" />
      </ProveedorSesion>
    </SafeAreaProvider>
  );
}

/** Mantiene el splash hasta revisar actualizaciones y saber si hay una sesión recordada. */
function ControladorSplash() {
  const { cargando } = useSesion();
  if (!cargando) SplashScreen.hide();
  return null;
}

/**
 * Rutas protegidas:
 *  - Sin sesión ................................ login y recuperar contraseña.
 *  - Con sesión y contraseña temporal .......... solo "cambiar contraseña" (obligatorio).
 *  - Con sesión ................................ la app: pestañas (tabs), módulos (modulo/[id]).
 */
function Navegacion() {
  const { sesion, cargando } = useSesion();
  if (cargando) return null;

  const conSesion = !!sesion;
  const debeCambiar = !!sesion?.usuario.forzarCambioContrasena;

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colores.fondo } }}>
      <Stack.Protected guard={conSesion && !debeCambiar}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="modulo/[id]" />
      </Stack.Protected>

      <Stack.Protected guard={conSesion}>
        <Stack.Screen name="cambiar-contrasena" />
      </Stack.Protected>

      <Stack.Protected guard={!conSesion}>
        <Stack.Screen name="login" />
        <Stack.Screen name="recuperar-contrasena" />
      </Stack.Protected>
    </Stack>
  );
}
