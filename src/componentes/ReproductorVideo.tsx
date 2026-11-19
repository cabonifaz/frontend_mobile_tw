import { StyleSheet, Text, View } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import { colores } from '@/tema/colores';

type ModuloVideo = typeof import('expo-video');
let modulo: ModuloVideo | null | undefined;

/** El módulo de video de Expo; null si la app instalada no lo trae (el video llega con la próxima versión instalada). */
function moduloVideo(): ModuloVideo | null {
  if (modulo !== undefined) return modulo;
  modulo = null;
  // Se comprueba primero la parte NATIVA: si falta y se pide el módulo de JavaScript, Metro lo reporta como error fatal que el try/catch no atrapa.
  if (requireOptionalNativeModule('ExpoVideo')) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      modulo = require('expo-video') as ModuloVideo;
    } catch {
      modulo = null;
    }
  }
  return modulo;
}

/** ¿Esta app instalada puede reproducir video? */
export const puedeReproducirVideo = (): boolean => moduloVideo() !== null;

interface Props {
  /** Dirección del video en el servidor. */
  uri: string;
  /** Token de la sesión: el servidor exige autenticación para entregar el archivo. */
  token: string;
  alto?: number;
}

/** Reproductor del video de una evidencia, con sus controles (play, pausa, barra de avance y pantalla completa). */
export function ReproductorVideo({ uri, token, alto = 300 }: Props) {
  const m = moduloVideo();
  if (!m) {
    return (
      <View style={[estilos.aviso, { height: alto }]}>
        <Text style={estilos.avisoTexto}>Para ver el video instala la versión más reciente de la app.</Text>
      </View>
    );
  }
  return <VideoInterno modulo={m} uri={uri} token={token} alto={alto} />;
}

function VideoInterno({ modulo: m, uri, token, alto }: Props & { modulo: ModuloVideo }) {
  const reproductor = m.useVideoPlayer({ uri, headers: { Authorization: `Bearer ${token}` } }, (p) => {
    p.loop = false;
  });
  return <m.VideoView player={reproductor} style={[estilos.video, { height: alto }]} nativeControls fullscreenOptions={{ enable: true }} contentFit="contain" />;
}

const estilos = StyleSheet.create({
  video: { width: '100%', borderRadius: 12, backgroundColor: '#0F172A' },
  aviso: { width: '100%', borderRadius: 12, backgroundColor: '#0F172A', alignItems: 'center', justifyContent: 'center', padding: 20 },
  avisoTexto: { color: colores.blanco, fontSize: 14.5, textAlign: 'center', lineHeight: 20 },
});
