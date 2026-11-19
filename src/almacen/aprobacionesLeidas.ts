import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

/**
 * «Leer todo» de la bandeja de Aprobaciones (HU-31): guarda en el teléfono hasta qué momento el jefe dio por leída su bandeja.
 * Es una marca de tiempo por usuario (la hora de Lima de la solicitud más reciente que había en ese momento): las aprobaciones pedidas hasta esa marca salen de la bandeja y del
 * globo de la pestaña; las que lleguen después aparecen normalmente. No decide ni borra nada en el servidor: las aprobaciones siguen pendientes hasta que se resuelvan.
 */
const esWeb = Platform.OS === 'web';
const clave = (idUsuario: number) => `tw.aprobaciones.leidas.${idUsuario}`;

const oyentes = new Set<() => void>();

/** Avisa a quien muestre un contador (el globo de la pestaña) que la marca cambió. */
export function alCambiarMarcaAprobaciones(fn: () => void): () => void {
  oyentes.add(fn);
  return () => {
    oyentes.delete(fn);
  };
}

export async function leerMarcaAprobaciones(idUsuario: number): Promise<string | null> {
  try {
    const v = esWeb ? (typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(clave(idUsuario)) : null) : await SecureStore.getItemAsync(clave(idUsuario));
    return v && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(v) ? v : null;
  } catch {
    return null;
  }
}

export async function guardarMarcaAprobaciones(idUsuario: number, marca: string | null): Promise<void> {
  try {
    if (esWeb) {
      if (typeof sessionStorage === 'undefined') return;
      if (marca) sessionStorage.setItem(clave(idUsuario), marca);
      else sessionStorage.removeItem(clave(idUsuario));
    } else if (marca) await SecureStore.setItemAsync(clave(idUsuario), marca);
    else await SecureStore.deleteItemAsync(clave(idUsuario));
  } catch {
    // Almacenamiento no disponible: la marca vale mientras la pantalla esté abierta.
  } finally {
    oyentes.forEach((fn) => fn());
  }
}
