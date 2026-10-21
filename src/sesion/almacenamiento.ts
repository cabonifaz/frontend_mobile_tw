import * as SecureStore from 'expo-secure-store';

/** Almacenamiento seguro del celular (Keystore en Android). */
export async function leer(clave: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(clave);
  } catch {
    return null;
  }
}

export async function guardar(clave: string, valor: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(clave, valor);
  } catch {
    // Si falla, la sesión sigue en memoria mientras la app esté abierta.
  }
}

export async function borrar(clave: string): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(clave);
  } catch {
    // nada que hacer
  }
}
