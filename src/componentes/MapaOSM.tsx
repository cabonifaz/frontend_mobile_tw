import { useCallback, useEffect, useRef, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View, type GestureResponderEvent } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colores } from '@/tema/colores';
import type { PinMapa } from './MapaEsquematico';

/**
 * Mapa REAL de calles (OpenStreetMap), como el Mapa Operativo de la intranet: se arrastra con el dedo, tiene los botones + y −, "Centrar" (encuadra a todos los
 * técnicos) y un pin con las iniciales de cada técnico del color de su estado. Sin librería nativa ni claves (no hace falta instalar un APK nuevo): las calles
 * son las imágenes («tiles») de OpenStreetMap colocadas según la proyección Web Mercator y los pines se dibujan encima.
 * El servidor de mapas se puede cambiar con la variable EXPO_PUBLIC_MAPA_TILES (por ejemplo un proveedor propio, con {z}/{x}/{y}); OpenStreetMap pide
 * identificar la app (cabecera User-Agent) y mostrar su atribución, ambas cosas están aquí. Sin conexión las calles no cargan pero los pines se ven igual.
 */
const TILE = 256;
const ZOOM_MIN = 3;
const ZOOM_MAX = 18;
const URL_TILES = process.env.EXPO_PUBLIC_MAPA_TILES || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const CABECERAS = { 'User-Agent': 'TWCampo/1.0 (app de campo Total Weight)' };
const LIMA = { latitud: -12.0464, longitud: -77.0428 };

interface Vista {
  latitud: number;
  longitud: number;
  zoom: number;
}

const limitar = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
const mundo = (zoom: number) => TILE * 2 ** zoom;
const mundoX = (longitud: number, zoom: number) => ((longitud + 180) / 360) * mundo(zoom);
const mundoY = (latitud: number, zoom: number) => {
  const r = (limitar(latitud, -85, 85) * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * mundo(zoom);
};
const longitudDe = (x: number, zoom: number) => (x / mundo(zoom)) * 360 - 180;
const latitudDe = (y: number, zoom: number) => {
  const n = Math.PI - (2 * Math.PI * y) / mundo(zoom);
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
};

/** Vista que deja a todos los pines dentro del mapa (uno solo: cerca; ninguno: Lima). */
function encuadrar(pines: PinMapa[], ancho: number, alto: number): Vista {
  if (pines.length === 0) return { ...LIMA, zoom: 11 };
  if (pines.length === 1) return { latitud: pines[0].latitud, longitud: pines[0].longitud, zoom: 15 };

  const lats = pines.map((p) => p.latitud);
  const lons = pines.map((p) => p.longitud);
  const norte = Math.max(...lats);
  const sur = Math.min(...lats);
  const este = Math.max(...lons);
  const oeste = Math.min(...lons);
  for (let zoom = 17; zoom >= ZOOM_MIN; zoom--) {
    const w = mundoX(este, zoom) - mundoX(oeste, zoom);
    const h = mundoY(sur, zoom) - mundoY(norte, zoom);
    if (w <= ancho - 100 && h <= alto - 100) {
      return {
        latitud: latitudDe((mundoY(norte, zoom) + mundoY(sur, zoom)) / 2, zoom),
        longitud: longitudDe((mundoX(este, zoom) + mundoX(oeste, zoom)) / 2, zoom),
        zoom,
      };
    }
  }
  return { ...LIMA, zoom: ZOOM_MIN };
}

interface Props {
  pines: PinMapa[];
  alto?: number;
  /** Texto cuando todavía no hay ninguna posición. */
  vacio?: string;
  /** Cada vez que cambia, el mapa se centra en ese punto (p. ej. al tocar un técnico de la lista). */
  enfoque?: { latitud: number; longitud: number; n: number } | null;
  /** Avisa cuando el dedo está sobre el mapa: la pantalla desactiva su desplazamiento mientras tanto, para que arrastrar mueva el mapa y no la página. */
  alTocarMapa?: (tocando: boolean) => void;
}

export function MapaOSM({ pines, alto = 320, vacio = 'Aún no hay posiciones GPS de hoy.', enfoque = null, alTocarMapa }: Props) {
  const [ancho, setAncho] = useState(0);
  const [vista, setVista] = useState<Vista>({ ...LIMA, zoom: 11 });
  const [arrastre, setArrastre] = useState({ dx: 0, dy: 0 });
  const [enfoqueAplicado, setEnfoqueAplicado] = useState(0);
  const encuadrado = useRef(false);
  const toque = useRef<{ x: number; y: number } | null>(null);

  // Arrastrar con el dedo: mientras se mueve se desplaza la vista; al soltar se guarda el nuevo centro. Son eventos de toque del propio mapa, así que
  // tocar un pin sigue funcionando (un toque sin movimiento no cambia nada).
  function alTocar(e: GestureResponderEvent) {
    toque.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY };
    alTocarMapa?.(true);
  }
  function alMover(e: GestureResponderEvent) {
    const inicio = toque.current;
    if (!inicio || e.nativeEvent.touches.length > 1) return;
    const dx = e.nativeEvent.pageX - inicio.x;
    const dy = e.nativeEvent.pageY - inicio.y;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) setArrastre({ dx, dy });
  }
  function alSoltar() {
    toque.current = null;
    alTocarMapa?.(false);
    if (arrastre.dx === 0 && arrastre.dy === 0) return;
    const x = mundoX(vista.longitud, vista.zoom) - arrastre.dx;
    const y = limitar(mundoY(vista.latitud, vista.zoom) - arrastre.dy, 0, mundo(vista.zoom));
    setVista({ latitud: latitudDe(y, vista.zoom), longitud: longitudDe(x, vista.zoom), zoom: vista.zoom });
    setArrastre({ dx: 0, dy: 0 });
  }

  // Al llegar las primeras posiciones se encuadra a todos los técnicos (después el jefe mueve el mapa a su gusto)
  useEffect(() => {
    if (ancho > 0 && pines.length > 0 && !encuadrado.current) {
      encuadrado.current = true;
      setVista(encuadrar(pines, ancho, alto));
    }
  }, [ancho, alto, pines]);

  // Tocar un técnico de la lista centra el mapa en él (se aplica una sola vez por cada toque: «n» cambia)
  if (enfoque && enfoque.n !== enfoqueAplicado) {
    setEnfoqueAplicado(enfoque.n);
    setVista({ latitud: enfoque.latitud, longitud: enfoque.longitud, zoom: Math.max(vista.zoom, 16) });
  }

  const cambiarZoom = useCallback((delta: number) => setVista((v) => ({ ...v, zoom: limitar(v.zoom + delta, ZOOM_MIN, ZOOM_MAX) })), []);

  // Esquina superior izquierda del mapa en píxeles del mundo, con el arrastre en curso
  const izquierda = mundoX(vista.longitud, vista.zoom) - arrastre.dx - ancho / 2;
  const arriba = mundoY(vista.latitud, vista.zoom) - arrastre.dy - alto / 2;
  const n = 2 ** vista.zoom;

  const tiles: { clave: string; uri: string; x: number; y: number }[] = [];
  if (ancho > 0) {
    const x0 = Math.floor(izquierda / TILE);
    const x1 = Math.floor((izquierda + ancho) / TILE);
    const y0 = Math.max(0, Math.floor(arriba / TILE));
    const y1 = Math.min(n - 1, Math.floor((arriba + alto) / TILE));
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const txMundo = ((tx % n) + n) % n;
        tiles.push({
          clave: `${vista.zoom}/${txMundo}/${ty}/${tx}`,
          uri: URL_TILES.replace('{z}', String(vista.zoom)).replace('{x}', String(txMundo)).replace('{y}', String(ty)),
          x: tx * TILE - izquierda,
          y: ty * TILE - arriba,
        });
      }
    }
  }

  return (
    <View
      style={[estilos.mapa, { height: alto }]}
      onLayout={(e) => setAncho(e.nativeEvent.layout.width)}
      accessibilityLabel="Mapa de las ubicaciones de los técnicos"
      onTouchStart={alTocar}
      onTouchMove={alMover}
      onTouchEnd={alSoltar}
      onTouchCancel={alSoltar}
    >
      {tiles.map((t) => (
        <Image key={t.clave} source={{ uri: t.uri, headers: CABECERAS }} style={[estilos.tile, { left: t.x, top: t.y }]} fadeDuration={0} />
      ))}

      {ancho > 0 &&
        pines.map((p) => {
          const px = mundoX(p.longitud, vista.zoom) - izquierda;
          const py = mundoY(p.latitud, vista.zoom) - arriba;
          if (px < -40 || px > ancho + 40 || py < -40 || py > alto + 40) return null;
          const t = p.tamano ?? 38;
          return (
            <Pressable
              key={p.clave}
              onPress={p.onPress}
              disabled={!p.onPress}
              style={[estilos.pin, { left: px - t / 2, top: py - t / 2, width: t, height: t, borderRadius: t / 2, backgroundColor: p.color }]}
              accessibilityRole={p.onPress ? 'button' : 'image'}
              accessibilityLabel={p.etiqueta ?? p.texto}
            >
              <Text style={estilos.pinTexto}>{p.texto}</Text>
            </Pressable>
          );
        })}

      {/* Zoom (como en la intranet) */}
      <View style={estilos.zoom}>
        <Pressable onPress={() => cambiarZoom(1)} style={estilos.zoomBoton} accessibilityRole="button" accessibilityLabel="Acercar el mapa" hitSlop={4}>
          <Ionicons name="add" size={22} color={colores.titulo} />
        </Pressable>
        <View style={estilos.zoomLinea} />
        <Pressable onPress={() => cambiarZoom(-1)} style={estilos.zoomBoton} accessibilityRole="button" accessibilityLabel="Alejar el mapa" hitSlop={4}>
          <Ionicons name="remove" size={22} color={colores.titulo} />
        </Pressable>
      </View>

      <Pressable
        onPress={() => setVista(encuadrar(pines, ancho, alto))}
        style={estilos.centrar}
        accessibilityRole="button"
        accessibilityLabel="Centrar el mapa en todos los técnicos"
      >
        <Ionicons name="scan-outline" size={16} color={colores.primario} />
        <Text style={estilos.centrarTexto}>Centrar</Text>
      </Pressable>

      {pines.length === 0 && (
        <View style={estilos.vacio} pointerEvents="none">
          <Text style={estilos.vacioTexto}>{vacio}</Text>
        </View>
      )}

      <View style={estilos.atribucion} pointerEvents="none">
        <Text style={estilos.atribucionTexto}>© OpenStreetMap</Text>
      </View>
    </View>
  );
}

const estilos = StyleSheet.create({
  mapa: { backgroundColor: '#E8ECE6', borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: colores.bordeSuave },
  tile: { position: 'absolute', width: TILE, height: TILE },
  pin: { position: 'absolute', alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: colores.blanco, elevation: 4 },
  pinTexto: { color: colores.blanco, fontWeight: '800', fontSize: 13 },
  zoom: { position: 'absolute', left: 10, top: 10, backgroundColor: colores.blanco, borderRadius: 8, borderWidth: 1, borderColor: colores.bordeSuave, elevation: 3 },
  zoomBoton: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  zoomLinea: { height: 1, backgroundColor: colores.bordeSuave },
  centrar: {
    position: 'absolute',
    right: 10,
    top: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colores.blanco,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colores.bordeSuave,
    paddingHorizontal: 11,
    height: 38,
    elevation: 3,
  },
  centrarTexto: { color: colores.primario, fontWeight: '700', fontSize: 14 },
  vacio: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', padding: 24 },
  vacioTexto: { color: colores.titulo, fontSize: 14.5, textAlign: 'center', backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, overflow: 'hidden' },
  atribucion: { position: 'absolute', right: 0, bottom: 0, backgroundColor: 'rgba(255,255,255,0.8)', paddingHorizontal: 6, paddingVertical: 2, borderTopLeftRadius: 6 },
  atribucionTexto: { fontSize: 10.5, color: '#475569' },
});
