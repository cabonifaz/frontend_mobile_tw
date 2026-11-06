/** Lado largo máximo (px) de la foto de evidencia: suficiente para leer un equipo y pesa cientos de KB, no varios MB. */
export const LADO_MAXIMO_FOTO = 1920;
const LADO_MINIMO_FOTO = 800;

/**
 * Elige el tamaño de foto de la cámara (Android: "4000x3000", "1920x1080"…). La evidencia no necesita los 12–50 megapíxeles del sensor:
 * una foto de varios MB tarda y falla al subirse con señal débil o contra el límite del servidor. Se prefiere 4:3 (como el sensor),
 * con el lado largo entre 800 y 1920 px, y de ellos el más grande. Si ninguno califica, no se fuerza tamaño (undefined).
 */
export function elegirTamanoFoto(tamanos: readonly string[]): string | undefined {
  const candidatos = tamanos
    .map((texto) => {
      const m = /^(\d{3,5})x(\d{3,5})$/.exec(texto.trim());
      if (!m) return null;
      const ancho = Number(m[1]);
      const alto = Number(m[2]);
      const largo = Math.max(ancho, alto);
      const corto = Math.min(ancho, alto);
      return { texto: texto.trim(), area: ancho * alto, largo, razon: largo / corto };
    })
    .filter((t): t is { texto: string; area: number; largo: number; razon: number } => t !== null)
    .filter((t) => t.largo <= LADO_MAXIMO_FOTO && t.largo >= LADO_MINIMO_FOTO);

  const cuatroTercios = candidatos.filter((t) => Math.abs(t.razon - 4 / 3) < 0.05);
  const lista = cuatroTercios.length > 0 ? cuatroTercios : candidatos;
  if (lista.length === 0) return undefined;
  return lista.reduce((mejor, t) => (t.area > mejor.area ? t : mejor)).texto;
}
