import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { Boton } from './Boton';
import { colores } from '@/tema/colores';
import { elegirTamanoFoto } from '@/utilidades/camara';

/** Segundos que se muestra el QR leído antes de enviarlo (para poder verlo y comprobar qué leyó la cámara). */
const PAUSA_QR_SEGUNDOS = 5;

interface Props {
  visible: boolean;
  /** foto: toma una foto (evidencia). qr: lee el código QR del activo. */
  modo: 'foto' | 'qr';
  onCerrar: () => void;
  onFoto?: (uri: string) => void;
  onQr?: (contenido: string) => void;
}

/**
 * Cámara de la app (HU-05 evidencia y HU-07 QR).
 * La foto SOLO se toma aquí: la app no tiene acceso a la galería (no se usa image-picker),
 * así la evidencia es siempre del momento y del lugar.
 */
export function CamaraApp({ visible, modo, onCerrar, onFoto, onQr }: Props) {
  const [permiso, pedirPermiso] = useCameraPermissions();
  const camara = useRef<CameraView>(null);
  const [tomando, setTomando] = useState(false);
  /** Tamaño de foto (Android): la evidencia no necesita los megapíxeles del sensor, y una foto pesada falla al subirse. */
  const [tamanoFoto, setTamanoFoto] = useState<string | undefined>(undefined);
  const leido = useRef(false);
  /** QR recién leído: se muestra PAUSA_QR_SEGUNDOS segundos con una cuenta regresiva y recién entonces se envía. */
  const [qrLeido, setQrLeido] = useState<{ texto: string; segundos: number } | null>(null);
  const reloj = useRef<ReturnType<typeof setInterval> | null>(null);

  function detenerReloj() {
    if (reloj.current) clearInterval(reloj.current);
    reloj.current = null;
  }
  // Si se cierra la cámara durante la pausa, no se envía nada
  useEffect(() => {
    if (!visible) detenerReloj(); // el estado se limpia al abrir de nuevo (onShow)
    return detenerReloj;
  }, [visible]);

  async function alEstarLista() {
    if (modo !== 'foto' || Platform.OS !== 'android' || !camara.current) return;
    try {
      setTamanoFoto(elegirTamanoFoto(await camara.current.getAvailablePictureSizesAsync()));
    } catch {
      // sin lista de tamaños: se usa el de la cámara (la calidad igual baja el peso)
    }
  }

  async function tomarFoto() {
    if (!camara.current || tomando) return;
    setTomando(true);
    try {
      const foto = await camara.current.takePictureAsync({ quality: 0.5, exif: false });
      if (foto?.uri) onFoto?.(foto.uri);
    } finally {
      setTomando(false);
    }
  }

  function alLeer(r: BarcodeScanningResult) {
    if (leido.current || !r.data) return;
    leido.current = true;
    const texto = r.data;
    let faltan = PAUSA_QR_SEGUNDOS;
    setQrLeido({ texto, segundos: faltan });
    detenerReloj();
    reloj.current = setInterval(() => {
      faltan -= 1;
      if (faltan > 0) {
        setQrLeido({ texto, segundos: faltan });
        return;
      }
      detenerReloj();
      setQrLeido(null);
      onQr?.(texto);
    }, 1000);
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onCerrar} onShow={() => {
      leido.current = false;
      setQrLeido(null);
    }}>
      <SafeAreaView style={estilos.area}>
        <View style={estilos.cabecera}>
          <Text style={estilos.titulo}>{modo === 'foto' ? 'Foto de evidencia' : 'Escanear QR del equipo'}</Text>
          <Pressable onPress={onCerrar} hitSlop={12} accessibilityRole="button" accessibilityLabel="Cerrar cámara">
            <Ionicons name="close" size={28} color={colores.blanco} />
          </Pressable>
        </View>

        {!permiso ? (
          <ActivityIndicator color={colores.blanco} style={{ marginTop: 40 }} />
        ) : !permiso.granted ? (
          <View style={estilos.sinPermiso}>
            <Ionicons name="camera-outline" size={40} color={colores.blanco} />
            <Text style={estilos.texto}>La app necesita la cámara para {modo === 'foto' ? 'tomar la foto de evidencia' : 'leer el código QR'}.</Text>
            <Boton titulo="Permitir cámara" onPress={() => void pedirPermiso()} />
          </View>
        ) : (
          <View style={{ flex: 1 }}>
            <CameraView
              ref={camara}
              style={{ flex: 1 }}
              facing="back"
              pictureSize={modo === 'foto' ? tamanoFoto : undefined}
              onCameraReady={() => void alEstarLista()}
              barcodeScannerSettings={modo === 'qr' ? { barcodeTypes: ['qr'] } : undefined}
              onBarcodeScanned={modo === 'qr' ? alLeer : undefined}
            />
            {modo === 'qr' && <View pointerEvents="none" style={[estilos.marcoQr, qrLeido && { borderColor: '#22C55E', borderWidth: 5 }]} />}
            {modo === 'qr' && !!qrLeido && (
              <View style={estilos.lectura} testID="qr-leido">
                <Text style={estilos.lecturaTitulo}>QR leído · se envía en {qrLeido.segundos} s</Text>
                <Text style={estilos.lecturaTexto} selectable numberOfLines={4}>
                  {qrLeido.texto}
                </Text>
                <Pressable
                  onPress={() => {
                    detenerReloj();
                    setQrLeido(null);
                    leido.current = false;
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Leer de nuevo"
                  hitSlop={8}
                >
                  <Text style={estilos.lecturaOtra}>Leer otro</Text>
                </Pressable>
              </View>
            )}
            <View style={estilos.pie}>
              {modo === 'foto' ? (
                <Pressable
                  onPress={() => void tomarFoto()}
                  style={estilos.disparador}
                  accessibilityRole="button"
                  accessibilityLabel="Tomar foto"
                  testID="disparar-foto"
                >
                  {tomando ? <ActivityIndicator color={colores.primario} /> : <View style={estilos.disparadorInterno} />}
                </Pressable>
              ) : (
                <Text style={estilos.texto}>Apunta al código QR pegado en el equipo.</Text>
              )}
            </View>
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
}

const estilos = StyleSheet.create({
  area: { flex: 1, backgroundColor: '#000' },
  cabecera: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 },
  titulo: { color: colores.blanco, fontSize: 17, fontWeight: '600' },
  sinPermiso: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16, padding: 24 },
  texto: { color: colores.blanco, fontSize: 15, textAlign: 'center', lineHeight: 21 },
  pie: { padding: 20, alignItems: 'center' },
  disparador: { width: 72, height: 72, borderRadius: 36, backgroundColor: colores.blanco, alignItems: 'center', justifyContent: 'center' },
  disparadorInterno: { width: 58, height: 58, borderRadius: 29, borderWidth: 3, borderColor: colores.primario },
  lectura: { position: 'absolute', left: 16, right: 16, bottom: 90, backgroundColor: 'rgba(0,0,0,0.78)', borderRadius: 14, padding: 14, gap: 6 },
  lecturaTitulo: { color: '#22C55E', fontSize: 14, fontWeight: '800' },
  lecturaTexto: { color: colores.blanco, fontSize: 16, fontWeight: '600' },
  lecturaOtra: { color: colores.blanco, fontSize: 13.5, textDecorationLine: 'underline', alignSelf: 'flex-end' },
  marcoQr: {
    position: 'absolute',
    alignSelf: 'center',
    top: '25%',
    width: 230,
    height: 230,
    borderWidth: 3,
    borderColor: colores.blanco,
    borderRadius: 18,
  },
});
