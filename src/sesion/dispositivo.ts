import { Platform } from 'react-native';
import * as Application from 'expo-application';
import * as Device from 'expo-device';
import { guardar, leer } from './almacenamiento';

/**
 * Identificador del equipo, para la regla "1 usuario = 1 equipo a la vez".
 *  - Android: ANDROID_ID (estable para esta app en este celular, incluso si se reinstala).
 *  - iOS: identifierForVendor.
 *  - Si no hay ninguno: un UUID generado y guardado en el almacenamiento seguro.
 */
const CLAVE_ID_GENERADO = 'tw.dispositivo.id';

let idEnMemoria: string | null = null;

function uuid(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export async function obtenerIdDispositivo(): Promise<string> {
  if (idEnMemoria) return idEnMemoria;

  let id: string | null = null;
  try {
    if (Platform.OS === 'android') id = Application.getAndroidId();
    else if (Platform.OS === 'ios') id = await Application.getIosIdForVendorAsync();
  } catch {
    id = null;
  }

  if (id) {
    id = `${Platform.OS}-${id}`;
  } else {
    id = await leer(CLAVE_ID_GENERADO);
    if (!id) {
      id = `${Platform.OS}-${uuid()}`;
      await guardar(CLAVE_ID_GENERADO, id);
    }
  }

  idEnMemoria = id;
  return id;
}

/** Nombre legible del equipo (se muestra si alguien intenta entrar desde otro celular). */
export function obtenerNombreDispositivo(): string | null {
  const partes = [Device.manufacturer, Device.modelName].filter(Boolean) as string[];
  if (partes.length === 0) return null;
  // Evita "samsung samsung SM-A546E"
  const [fabricante, modelo] = partes;
  if (modelo && fabricante && modelo.toLowerCase().startsWith(fabricante.toLowerCase())) return modelo;
  return partes.join(' ');
}
