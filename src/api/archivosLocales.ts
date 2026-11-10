import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

/**
 * Archivos del teléfono (fotos y videos) para subirlos y para guardarlos mientras no hay señal.
 *
 * El `fetch` global de Expo (expo/fetch, desde el SDK 53) NO acepta el formato clásico de React Native `{ uri, name, type }` dentro de un FormData:
 * falla en el teléfono, antes de enviar nada, con "Unsupported FormDataPart implementation". Lo que sí acepta es un `File` de expo-file-system
 * (es un Blob que se lee del disco al enviar). Por eso todas las subidas pasan por `agregarArchivo`.
 */

type Fs = typeof import('expo-file-system');
let modulo: Fs | null | undefined;

/** El módulo de archivos de Expo; null si la app instalada no lo trae. */
export function sistemaArchivos(): Fs | null {
  if (modulo !== undefined) return modulo;
  modulo = null;
  // Primero se comprueba que la parte NATIVA esté instalada en el teléfono: si falta y se pide el módulo de JavaScript, Metro lo reporta como error
  // fatal ("Uncaught Error: Cannot find native module") y el try/catch no lo atrapa.
  if (requireOptionalNativeModule('FileSystem')) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      modulo = require('expo-file-system') as Fs;
    } catch {
      modulo = null;
    }
  }
  return modulo;
}

/**
 * Agrega un archivo del teléfono a un FormData:
 *  - web: la cámara devuelve un data URI y se convierte a Blob con nombre;
 *  - Android / iOS: un `File` de expo-file-system (formato que acepta expo/fetch);
 *  - sin el módulo de archivos (app instalada anterior): el formato clásico `{ uri, name, type }` de React Native.
 * `nombre` solo se usa en web y en el formato clásico: en el `File` el nombre es el del archivo.
 */
export async function agregarArchivo(form: FormData, campo: string, uri: string, nombre: string, tipo: string): Promise<void> {
  if (Platform.OS === 'web') {
    form.append(campo, await (await fetch(uri)).blob(), nombre);
    return;
  }
  const fs = sistemaArchivos();
  if (fs) {
    form.append(campo, new fs.File(uri) as unknown as Blob);
    return;
  }
  form.append(campo, { uri, name: nombre, type: tipo } as unknown as Blob);
}
