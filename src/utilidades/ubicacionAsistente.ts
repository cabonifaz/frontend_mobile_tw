import * as Location from 'expo-location';
import { conTope, posicionReciente } from '@/utilidades/posicionActual';

/**
 * Ubicación para que el asistente calcule la distancia y la llegada a la planta. NUNCA pide permisos ni espera al GPS: usa la posición que ya sigue la app
 * (≤ 2 min) o la última conocida del sistema (≤ 2 min, con tope de 2,5 s). Sin permiso o sin posición devuelve null y el asistente lo explica.
 */
export async function ubicacionParaAsistente(): Promise<{ latitud: number; longitud: number } | null> {
  try {
    const seguida = posicionReciente(120_000);
    if (seguida) return { latitud: seguida.latitud, longitud: seguida.longitud };
    const permiso = await conTope(Location.getForegroundPermissionsAsync(), 1_500);
    if (permiso?.status !== 'granted') return null;
    const ultima = await conTope(Location.getLastKnownPositionAsync({ maxAge: 120_000 }), 2_500);
    return ultima ? { latitud: ultima.coords.latitude, longitud: ultima.coords.longitude } : null;
  } catch {
    return null;
  }
}
