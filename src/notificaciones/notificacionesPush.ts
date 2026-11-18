import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { requireOptionalNativeModule } from 'expo';

/**
 * Notificaciones push: cada aviso nuevo llega a la bandeja de notificaciones del teléfono, aunque la app esté cerrada.
 * Canales de Android: "criticas" (alertas críticas, máxima importancia) y "general" (el resto). El servidor elige el canal con la prioridad.
 * expo-notifications es una librería NATIVA: un APK anterior a la versión nativa 6 no la trae, y entonces todo esto se omite sin romper la app
 * (primero se comprueba la parte nativa; ver el mismo patrón en VozAsistente).
 */
type ModuloNotificaciones = typeof import('expo-notifications');
let modulo: ModuloNotificaciones | null | undefined;

/** expo-notifications; null si el APK instalado no lo trae, en web o si falla al cargar. */
export function moduloNotificaciones(): ModuloNotificaciones | null {
  if (modulo !== undefined) return modulo;
  modulo = null;
  if (Platform.OS !== 'web' && requireOptionalNativeModule('ExpoPushTokenManager')) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      modulo = require('expo-notifications') as ModuloNotificaciones;
    } catch {
      modulo = null;
    }
  }
  return modulo;
}

let preparado = false;

/** Con la app abierta el aviso también se muestra arriba (y suena); se llama una vez al abrir. */
export function prepararNotificaciones(): void {
  const N = moduloNotificaciones();
  if (!N || preparado) return;
  preparado = true;
  N.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

async function crearCanales(N: ModuloNotificaciones): Promise<void> {
  if (Platform.OS !== 'android') return;
  await N.setNotificationChannelAsync('criticas', {
    name: 'Alertas críticas',
    description: 'Errores críticos de ensayo, servicios detenidos y otras alertas urgentes.',
    importance: N.AndroidImportance.MAX,
    vibrationPattern: [0, 400, 200, 400],
    lockscreenVisibility: N.AndroidNotificationVisibility.PUBLIC,
  });
  await N.setNotificationChannelAsync('general', {
    name: 'Avisos',
    description: 'Aprobaciones, programaciones, gastos y demás avisos de la app.',
    importance: N.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 150, 250],
    lockscreenVisibility: N.AndroidNotificationVisibility.PUBLIC,
  });
}

/**
 * Pide el permiso de notificaciones (Android 13+) si falta y devuelve el token de Expo Push de este teléfono.
 * null = sin permiso, sin librería nativa, sin projectId o sin Firebase configurado. Nunca lanza.
 * Solo pregunta si el sistema todavía lo permite: si el técnico dijo que no y marcó "no volver a preguntar", no insiste.
 */
export async function obtenerTokenPush(): Promise<string | null> {
  const N = moduloNotificaciones();
  if (!N) return null;
  try {
    // En Android 13+ el canal debe existir ANTES de pedir el permiso o el diálogo no aparece
    await crearCanales(N);

    let permiso = await N.getPermissionsAsync();
    if (!permiso.granted && permiso.canAskAgain) permiso = await N.requestPermissionsAsync();
    if (!permiso.granted) return null;

    const projectId: string | undefined = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId ?? undefined;
    if (!projectId) return null;

    return (await N.getExpoPushTokenAsync({ projectId })).data;
  } catch {
    // Sin Firebase configurado en el APK, sin Google Play Services o sin red: la app sigue; se reintenta al volver a abrirla
    return null;
  }
}
