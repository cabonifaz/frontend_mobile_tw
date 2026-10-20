import type { ExpoConfig } from 'expo/config';

/**
 * Configuración de la App Mobile de Total Weight (Servicio de Campo).
 *
 * La URL del backend sale de EXPO_PUBLIC_API_URL (archivo .env en local, o el
 * perfil de eas.json al generar el APK). Si apunta a http:// (backend en tu PC),
 * se permite tráfico sin HTTPS en Android; con https:// (Railway) no hace falta.
 */
const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? '';
const permitirHttp = apiUrl.startsWith('http://');

const config: ExpoConfig = {
  name: 'TW Campo',
  slug: 'tw-campo',
  version: '0.1.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  scheme: 'twcampo',
  userInterfaceStyle: 'light',
  ios: {
    supportsTablet: false,
    bundleIdentifier: 'com.totalweight.campo',
  },
  android: {
    package: 'com.totalweight.campo',
    versionCode: 1,
    adaptiveIcon: {
      backgroundColor: '#FFFFFF',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
  },
  web: {
    favicon: './assets/favicon.png',
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    'expo-font',
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
};

export default config;
