import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { ErrorApi } from './cliente';

/**
 * Respaldo local para trabajar sin conexión (HU-01 · modo offline).
 *
 * Cada vez que una consulta responde bien, su resultado se guarda en el teléfono
 * (almacenamiento seguro del celular, cifrado con el Keystore de Android). Si después
 * no hay conexión (ErrorApi con estadoHttp 0), se devuelve lo último guardado con la hora
 * en que se guardó, para que el técnico pueda seguir usando la app.
 *
 *  - Las claves llevan el id del usuario: un técnico nunca ve lo guardado por otro.
 *  - Al salir de la app (o si la sesión termina) se borra todo lo guardado.
 *  - En la versión web (solo para pruebas) se usa sessionStorage, que se borra al cerrar la pestaña.
 */

const CLAVE_INDICE = 'tw.respaldo.indice';
const CLAVE_VALIDA = /^[A-Za-z0-9._-]+$/;

export interface ConRespaldo<T> {
  datos: T;
  /** true = no hubo conexión y se muestran los datos guardados. */
  sinConexion: boolean;
  /** Cuándo se guardaron los datos que se muestran. */
  guardadoEn: Date;
}

interface Guardado<T> {
  guardadoEn: string;
  datos: T;
}

const esWeb = Platform.OS === 'web';

async function leerCrudo(clave: string): Promise<string | null> {
  try {
    if (esWeb) return typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(clave) : null;
    return await SecureStore.getItemAsync(clave);
  } catch {
    return null;
  }
}

async function guardarCrudo(clave: string, valor: string): Promise<void> {
  try {
    if (esWeb) {
      if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(clave, valor);
      return;
    }
    await SecureStore.setItemAsync(clave, valor);
  } catch {
    // Sin espacio o almacenamiento no disponible: la app sigue funcionando con conexión.
  }
}

async function borrarCrudo(clave: string): Promise<void> {
  try {
    if (esWeb) {
      if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(clave);
      return;
    }
    await SecureStore.deleteItemAsync(clave);
  } catch {
    // nada que hacer
  }
}

function claveDe(idUsuario: number, nombre: string): string {
  const clave = `tw.respaldo.${idUsuario}.${nombre}`;
  if (!CLAVE_VALIDA.test(clave)) throw new Error(`Clave de respaldo inválida: ${nombre}`);
  return clave;
}

async function registrarEnIndice(clave: string): Promise<void> {
  const crudo = await leerCrudo(CLAVE_INDICE);
  let claves: string[] = [];
  try {
    claves = crudo ? (JSON.parse(crudo) as string[]) : [];
  } catch {
    claves = [];
  }
  if (!claves.includes(clave)) {
    claves.push(clave);
    await guardarCrudo(CLAVE_INDICE, JSON.stringify(claves));
  }
}

/**
 * Ejecuta la consulta; si responde, guarda el resultado. Si no hay conexión, devuelve lo guardado.
 * Cualquier otro error (regla de negocio, 401, 500) se propaga igual que antes.
 */
export async function conRespaldo<T>(idUsuario: number, nombre: string, consulta: () => Promise<T>): Promise<ConRespaldo<T>> {
  const clave = claveDe(idUsuario, nombre);
  try {
    const datos = await consulta();
    const ahora = new Date();
    const guardado: Guardado<T> = { guardadoEn: ahora.toISOString(), datos };
    await guardarCrudo(clave, JSON.stringify(guardado));
    await registrarEnIndice(clave);
    return { datos, sinConexion: false, guardadoEn: ahora };
  } catch (e) {
    if (!(e instanceof ErrorApi) || e.estadoHttp !== 0) throw e;
    const crudo = await leerCrudo(clave);
    if (!crudo) throw e;
    try {
      const guardado = JSON.parse(crudo) as Guardado<T>;
      return { datos: guardado.datos, sinConexion: true, guardadoEn: new Date(guardado.guardadoEn) };
    } catch {
      await borrarCrudo(clave);
      throw e;
    }
  }
}

/** Lee lo guardado sin consultar al servidor (p. ej. catálogos sin conexión). */
export async function leerRespaldo<T>(idUsuario: number, nombre: string): Promise<T | null> {
  const crudo = await leerCrudo(claveDe(idUsuario, nombre));
  if (!crudo) return null;
  try {
    return (JSON.parse(crudo) as Guardado<T>).datos;
  } catch {
    return null;
  }
}

/** Borra todo lo guardado en el teléfono (al salir de la app o al terminar la sesión). */
export async function borrarRespaldos(): Promise<void> {
  const crudo = await leerCrudo(CLAVE_INDICE);
  let claves: string[] = [];
  try {
    claves = crudo ? (JSON.parse(crudo) as string[]) : [];
  } catch {
    claves = [];
  }
  await Promise.all(claves.map(borrarCrudo));
  await borrarCrudo(CLAVE_INDICE);
}

/** "08:42" o "27/10 08:42" si no es de hoy. */
export function horaRespaldo(fecha: Date): string {
  const hoy = new Date();
  const hora = fecha.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: false });
  const mismoDia = fecha.toDateString() === hoy.toDateString();
  if (mismoDia) return hora;
  const dia = fecha.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit' });
  return `${dia} ${hora}`;
}
