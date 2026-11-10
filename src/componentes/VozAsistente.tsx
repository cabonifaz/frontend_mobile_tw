import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { transcribirVoz } from '@/api/asistente';
import { ErrorApi } from '@/api/cliente';
import { colores, radios } from '@/tema/colores';
import { DURACION_MAX_VOZ_SEG, textoSegundos, textoTranscripcion } from '@/utilidades/asistente';

type ModuloAudio = typeof import('expo-audio');
let modulo: ModuloAudio | null | undefined;

/** El módulo de audio de Expo; null si la app instalada no lo trae (la voz llega con la próxima versión instalada). */
function moduloAudio(): ModuloAudio | null {
  if (modulo !== undefined) return modulo;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    modulo = require('expo-audio') as ModuloAudio;
  } catch {
    modulo = null;
  }
  return modulo;
}

/** ¿Esta app instalada puede grabar voz? */
export function vozDisponible(): boolean {
  return moduloAudio() !== null;
}

interface Props {
  visible: boolean;
  /** Token de la sesión para subir el audio a transcribir. */
  token: string;
  /** Se envía la consulta con el texto transcrito (origen "voz"). */
  onEnviar: (texto: string) => void;
  onCerrar: () => void;
}

/**
 * HU-19 — Consulta por voz: "Escuchando…" mientras graba (hasta 30 s), "Transcribiendo…" cuando el técnico detiene, y el texto transcrito entre «»
 * con "Cancelar" / "Enviar consulta". Diferencia con la maqueta: la transcripción aparece al terminar de grabar, no en vivo (no hay reconocimiento
 * de voz nativo en la app): el audio se manda al servidor, que lo transcribe con la IA y no lo guarda.
 */
export function VozAsistente(props: Props) {
  if (!props.visible || !moduloAudio()) return null;
  return (
    <Modal visible transparent animationType="slide" onRequestClose={props.onCerrar}>
      <View style={estilos.velo}>
        <Grabadora {...props} audio={moduloAudio()!} />
      </View>
    </Modal>
  );
}

type Fase = 'preparando' | 'grabando' | 'transcribiendo' | 'listo' | 'error';

function Grabadora({ token, onEnviar, onCerrar, audio }: Props & { audio: ModuloAudio }) {
  const recorder = audio.useAudioRecorder(audio.RecordingPresets.HIGH_QUALITY);
  const [fase, setFase] = useState<Fase>('preparando');
  const [segundos, setSegundos] = useState(0);
  const [texto, setTexto] = useState('');
  const [error, setError] = useState<{ mensaje: string; detalle?: string } | null>(null);
  const [pulso, setPulso] = useState(0);
  const inicio = useRef(0);
  const cerrada = useRef(false);
  const grabando = useRef(false);

  async function detenerGrabacion(): Promise<string | null> {
    if (!grabando.current) return null;
    grabando.current = false;
    try {
      await recorder.stop();
    } catch {
      // ya estaba detenida
    }
    try {
      await audio.setAudioModeAsync({ allowsRecording: false });
    } catch {
      // nada que restaurar
    }
    return recorder.uri ?? null;
  }

  async function transcribir(uri: string | null, duracion: number) {
    if (!uri || duracion < 1) {
      setError({ mensaje: 'La grabación fue muy corta. Habla con claridad y pulsa Detener cuando termines.' });
      setFase('error');
      return;
    }
    setFase('transcribiendo');
    try {
      const t = await transcribirVoz(token, uri);
      if (cerrada.current) return;
      if (!t) throw new ErrorApi('No se entendió el audio. Inténtalo de nuevo.', 400, 1);
      setTexto(t);
      setFase('listo');
    } catch (e) {
      if (cerrada.current) return;
      setError({ mensaje: e instanceof Error ? e.message : 'No se pudo transcribir el audio.', detalle: e instanceof ErrorApi ? e.detalleTecnico : undefined });
      setFase('error');
    }
  }

  async function detener() {
    const duracion = (Date.now() - inicio.current) / 1000;
    const uri = await detenerGrabacion();
    await transcribir(uri, duracion);
  }

  /** "Grabar de nuevo" / "Reintentar": limpia lo anterior y vuelve a empezar. */
  function reiniciar() {
    setError(null);
    setTexto('');
    setSegundos(0);
    setFase('preparando');
    void iniciarGrabacion();
  }

  /** Pide el micrófono y empieza a grabar (al abrir ya está en "preparando", no hace falta limpiar nada). */
  async function iniciarGrabacion() {
    try {
      const permiso = await audio.requestRecordingPermissionsAsync();
      if (cerrada.current) return;
      if (!permiso.granted) {
        setError({ mensaje: 'Para consultar por voz permite el micrófono en los ajustes de la app.' });
        setFase('error');
        return;
      }
      await audio.setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      if (cerrada.current) return;
      recorder.record();
      grabando.current = true;
      inicio.current = Date.now();
      setFase('grabando');
    } catch {
      if (cerrada.current) return;
      setError({ mensaje: 'No se pudo iniciar la grabación. Inténtalo de nuevo.' });
      setFase('error');
    }
  }

  useEffect(() => {
    void iniciarGrabacion();
    return () => {
      cerrada.current = true;
      if (grabando.current) {
        grabando.current = false;
        void recorder.stop().catch(() => undefined);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Contador y animación mientras graba; se corta solo a los 30 s
  useEffect(() => {
    if (fase !== 'grabando') return;
    const t = setInterval(() => {
      const s = (Date.now() - inicio.current) / 1000;
      setSegundos(s);
      setPulso((p) => p + 1);
      if (s >= DURACION_MAX_VOZ_SEG) void detener();
    }, 180);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fase]);

  function cancelar() {
    cerrada.current = true;
    void detenerGrabacion();
    onCerrar();
  }

  const barras = [10, 22, 14, 32, 20, 38, 16, 28, 12, 24, 36, 18].map((base, i) => (fase === 'grabando' ? Math.max(6, Math.round(base * (0.45 + 0.55 * Math.abs(Math.sin((pulso + i * 2) / 2.2))))) : base));

  return (
    <View style={estilos.hoja} testID="voz-asistente">
      <View style={estilos.circulos}>
        <View style={[estilos.circulo, estilos.circuloGrande]} />
        <View style={[estilos.circulo, estilos.circuloMedio]} />
        <View style={estilos.microfono}>
          <Ionicons name="mic" size={36} color={colores.blanco} />
        </View>
      </View>

      {fase === 'preparando' && <Text style={estilos.estado}>Preparando micrófono…</Text>}
      {fase === 'grabando' && (
        <>
          <Text style={estilos.estado}>Escuchando…</Text>
          <View style={estilos.barras} accessibilityElementsHidden>
            {barras.map((h, i) => (
              <View key={i} style={[estilos.barra, { height: h }]} />
            ))}
          </View>
          <Text style={estilos.tiempo}>
            {textoSegundos(segundos)} / {textoSegundos(DURACION_MAX_VOZ_SEG)} · pulsa Detener cuando termines
          </Text>
        </>
      )}
      {fase === 'transcribiendo' && (
        <View style={estilos.fila}>
          <ActivityIndicator color={colores.primario} />
          <Text style={estilos.estado}>Transcribiendo…</Text>
        </View>
      )}
      {fase === 'listo' && (
        <View style={estilos.cajaTexto} testID="voz-transcripcion">
          <Text style={estilos.transcripcion}>{textoTranscripcion(texto)}</Text>
        </View>
      )}
      {fase === 'error' && error && (
        <View style={estilos.cajaError} testID="voz-error">
          <Text style={estilos.errorTexto}>{error.mensaje}</Text>
          {!!error.detalle && (
            <Text style={estilos.detalle} selectable>
              Detalle técnico: {error.detalle}
            </Text>
          )}
        </View>
      )}

      <View style={estilos.botones}>
        <Pressable onPress={cancelar} style={[estilos.boton, estilos.botonBorde]} accessibilityRole="button" testID="voz-cancelar">
          <Text style={[estilos.botonTexto, { color: colores.primario }]}>Cancelar</Text>
        </Pressable>
        {fase === 'grabando' && (
          <Pressable onPress={() => void detener()} style={[estilos.boton, { backgroundColor: colores.rojo }]} accessibilityRole="button" testID="voz-detener">
            <Ionicons name="stop" size={18} color={colores.blanco} />
            <Text style={estilos.botonTexto}>Detener</Text>
          </Pressable>
        )}
        {fase === 'listo' && (
          <>
            <Pressable onPress={reiniciar} style={[estilos.boton, estilos.botonBorde]} accessibilityRole="button" testID="voz-repetir">
              <Ionicons name="mic-outline" size={18} color={colores.primario} />
            </Pressable>
            <Pressable onPress={() => onEnviar(texto)} style={[estilos.boton, { backgroundColor: colores.primario, flex: 2 }]} accessibilityRole="button" testID="voz-enviar">
              <Text style={estilos.botonTexto}>Enviar consulta</Text>
            </Pressable>
          </>
        )}
        {fase === 'error' && (
          <Pressable onPress={reiniciar} style={[estilos.boton, { backgroundColor: colores.primario }]} accessibilityRole="button" testID="voz-reintentar">
            <Text style={estilos.botonTexto}>Reintentar</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const estilos = StyleSheet.create({
  velo: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'flex-end' },
  hoja: { backgroundColor: colores.blanco, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingBottom: 28, paddingTop: 12, alignItems: 'center', gap: 12 },
  circulos: { width: 150, height: 150, alignItems: 'center', justifyContent: 'center' },
  circulo: { position: 'absolute', borderRadius: 999 },
  circuloGrande: { width: 150, height: 150, backgroundColor: '#F1F6FD' },
  circuloMedio: { width: 118, height: 118, backgroundColor: '#E3EDF9' },
  microfono: { width: 80, height: 80, borderRadius: 40, backgroundColor: colores.primario, alignItems: 'center', justifyContent: 'center' },
  estado: { fontSize: 19, fontWeight: '800', color: colores.titulo },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  barras: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 44 },
  barra: { width: 5, borderRadius: 3, backgroundColor: colores.primario },
  tiempo: { fontSize: 14, color: colores.textoSecundario, textAlign: 'center' },
  cajaTexto: { alignSelf: 'stretch', borderWidth: 1, borderColor: colores.bordeSuave, borderRadius: radios.tarjeta, padding: 14 },
  transcripcion: { fontSize: 18, color: colores.titulo, lineHeight: 26 },
  cajaError: { alignSelf: 'stretch', backgroundColor: colores.errorFondo, borderWidth: 1, borderColor: colores.errorBorde, borderRadius: radios.tarjeta, padding: 12, gap: 6 },
  errorTexto: { fontSize: 15, color: colores.error, lineHeight: 21 },
  detalle: { fontSize: 11.5, color: colores.textoSecundario, fontFamily: 'monospace' },
  botones: { flexDirection: 'row', gap: 10, alignSelf: 'stretch', marginTop: 6 },
  boton: { flex: 1, minHeight: 52, borderRadius: radios.boton, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  botonBorde: { borderWidth: 1.5, borderColor: colores.primario },
  botonTexto: { color: colores.blanco, fontWeight: '700', fontSize: 17 },
});
