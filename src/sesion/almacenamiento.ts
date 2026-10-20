import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

/**
 * Almacenamiento seguro (Keystore en Android / Keychain en iOS).
 * En web (solo para revisar pantallas en el navegador) usa localStorage.
 */
const esWeb = Platform.OS === 'web';

export async function leer(clave: string): Promise<string | null> {
  try {
    if (esWeb) return globalThis.localStorage?.getItem(clave) ?? null;
    return await SecureStore.getItemAsync(clave);
  } catch {
    return null;
  }
}

export async function guardar(clave: string, valor: string): Promise<void> {
  try {
    if (esWeb) {
      globalThis.localStorage?.setItem(clave, valor);
      return;
    }
    await SecureStore.setItemAsync(clave, valor);
  } catch {
    // Si el almacenamiento falla, la sesión sigue en memoria mientras la app esté abierta.
  }
}

export async function borrar(clave: string): Promise<void> {
  try {
    if (esWeb) {
      globalThis.localStorage?.removeItem(clave);
      return;
    }
    await SecureStore.deleteItemAsync(clave);
  } catch {
    // nada que hacer
  }
}
