import type { ExpoConfig } from 'expo/config';

/**
 * Configuración de la App Mobile de Total Weight (Servicio de Campo).
 *
 * La URL del backend sale de EXPO_PUBLIC_API_URL: archivo .env en local (Expo Go),
 * o las variables del entorno "preview" en expo.dev para el APK y las actualizaciones. Si apunta a http:// (backend en tu PC),
 * se permite tráfico sin HTTPS en Android; con https:// (Railway) no hace falta.
 */
const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? '';
const permitirHttp = apiUrl.startsWith('http://');

// Desarrollo seguro: la versión de producción nunca viaja sin cifrar (el token y los datos irían en claro).
if (process.env.EAS_BUILD_PROFILE === 'production' && !apiUrl.startsWith('https://')) {
  throw new Error('El build de producción necesita EXPO_PUBLIC_API_URL con https://');
}

/**
 * Proyecto de EAS (expo.dev). Pega aquí el projectId que muestra `npx eas-cli@latest init`.
 * Con esto se habilitan las actualizaciones por internet (EAS Update): se instala
 * UN solo APK y cada avance llega con `npm run actualizar`, sin reinstalar.
 */
const EAS_PROJECT_ID = '550fdce7-c8a4-473f-97c7-e301b92cd08e';

/**
 * Versión nativa del APK. Las actualizaciones solo llegan a APKs con la misma versión nativa.
 * Súbela ('2', '3'...) SOLO cuando se agregue una librería nativa (cámara, GPS, etc.):
 * en ese caso hay que generar e instalar un APK nuevo con `npm run apk`.
 */
const VERSION_NATIVA = '2';

/**
 * Variante de la app:
 *  - "development": APK de desarrollo (como Ranked). Se conecta a `npx expo start`
 *    y muestra los cambios en tiempo real. Se instala como "TW Campo (Dev)",
 *    al lado de la app normal (paquete distinto), así no se pisan.
 *  - normal: el APK que recibe los avances con `npm run actualizar`.
 */
const esDesarrollo = process.env.APP_VARIANT === 'development';
const paquete = esDesarrollo ? 'com.totalweight.campo.dev' : 'com.totalweight.campo';

const config: ExpoConfig = {
  name: esDesarrollo ? 'TW Campo (Dev)' : 'TW Campo',
  slug: 'tw-campo',
  owner: 'cryjack18',
  version: '0.1.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  scheme: 'twcampo',
  userInterfaceStyle: 'light',
  ios: {
    supportsTablet: false,
    bundleIdentifier: paquete,
  },
  android: {
    package: paquete,
    versionCode: 1,
    adaptiveIcon: {
      backgroundColor: '#FFFFFF',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    'expo-font',
    'expo-updates',
    'expo-dev-client',
    [
      'expo-splash-screen',
      {
        image: './assets/splash-icon.png',
        imageWidth: 220,
        resizeMode: 'contain',
        backgroundColor: '#F7F9FC',
      },
    ],
    [
      'expo-build-properties',
      {
        android: { usesCleartextTraffic: permitirHttp },
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
  },
  runtimeVersion: VERSION_NATIVA,
  ...(EAS_PROJECT_ID
    ? {
        extra: { eas: { projectId: EAS_PROJECT_ID } },
        updates: {
          url: `https://u.expo.dev/${EAS_PROJECT_ID}`,
          // La app busca la actualización al abrirse (ver src/actualizaciones).
          checkAutomatically: 'NEVER' as const,
          fallbackToCacheTimeout: 0,
        },
      }
    : {}),
};

export default config;
