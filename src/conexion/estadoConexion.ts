import { useMemo, useSyncExternalStore } from 'react';

/**
 * HU-18 — Estado global de la conexión con el servidor, SIN librerías nativas: se deduce de lo que pasa con las llamadas a la API (`solicitar`).
 *  - Una respuesta del servidor (con cualquier código HTTP) = en línea. Un fallo de red (no un simple tiempo de espera, que puede ser un servidor lento) = sin conexión.
 *  - Mientras está sin conexión, `VigilanteConexion` sondea al servidor cada ~10 s y al volver la app a primer plano; la primera respuesta devuelve el estado a «en línea».
 *  - Al pasar de sin conexión a en línea queda anotada la «recuperación» (hora y registros enviados desde entonces) para el aviso «Conexión recuperada».
 * Es un almacén simple en memoria con suscriptores (`useSyncExternalStore`); no depende de la sesión ni de la API, así que `cliente.ts` puede importarlo sin ciclos.
 */
export interface RecuperacionConexion {
  /** Hora (ms) en que volvió la señal. */
  en: number;
  /** Registros guardados en el teléfono que se enviaron solos desde que volvió la señal. */
  enviados: number;
}

export interface EstadoConexion {
  enLinea: boolean;
  /** Hora (ms) en que se perdió la señal; null si hay conexión. */
  sinConexionDesde: number | null;
  /** Solo tras recuperar la señal; se limpia cuando el aviso se cierra. */
  recuperada: RecuperacionConexion | null;
}

/** Los envíos que ocurren hasta este tiempo después de volver la señal cuentan para el aviso «Conexión recuperada». */
export const VENTANA_RECUPERACION_MS = 120_000;

const INICIAL: EstadoConexion = { enLinea: true, sinConexionDesde: null, recuperada: null };

let estado: EstadoConexion = INICIAL;
const escuchas = new Set<() => void>();

function fijar(nuevo: EstadoConexion) {
  estado = nuevo;
  escuchas.forEach((f) => f());
}

export function leerEstadoConexion(): EstadoConexion {
  return estado;
}

export function suscribirConexion(f: () => void): () => void {
  escuchas.add(f);
  return () => {
    escuchas.delete(f);
  };
}

/** Falló la red: pasa a «sin conexión» (si ya lo estaba no cambia nada, ni la hora en que se perdió). */
export function marcarSinConexion(ahora: number = Date.now()): void {
  if (!estado.enLinea) return;
  fijar({ enLinea: false, sinConexionDesde: ahora, recuperada: null });
}

/** El servidor respondió: pasa a «en línea». Si estaba sin conexión queda anotada la recuperación (para el aviso). */
export function marcarEnLinea(ahora: number = Date.now()): void {
  if (estado.enLinea) return;
  fijar({ enLinea: true, sinConexionDesde: null, recuperada: { en: ahora, enviados: 0 } });
}

/** Suma registros enviados al aviso «Conexión recuperada» (solo si la señal volvió hace poco). */
export function anotarEnviadosTrasRecuperar(cantidad: number, ahora: number = Date.now()): void {
  const r = estado.recuperada;
  if (!r || cantidad <= 0 || ahora - r.en > VENTANA_RECUPERACION_MS) return;
  fijar({ ...estado, recuperada: { ...r, enviados: r.enviados + cantidad } });
}

/** Cierra el aviso «Conexión recuperada». */
export function cerrarRecuperacion(): void {
  if (!estado.recuperada) return;
  fijar({ ...estado, recuperada: null });
}

/** Vuelve al estado inicial (al cerrar la sesión). */
export function reiniciarConexion(): void {
  if (estado === INICIAL) return;
  fijar(INICIAL);
}

/** `enLinea` y desde cuándo está sin conexión. La pantalla se vuelve a pintar cuando cambia. */
export function useConexion(): { enLinea: boolean; sinConexionDesde: Date | null } {
  const e = useSyncExternalStore(suscribirConexion, leerEstadoConexion, leerEstadoConexion);
  return useMemo(() => ({ enLinea: e.enLinea, sinConexionDesde: e.sinConexionDesde === null ? null : new Date(e.sinConexionDesde) }), [e.enLinea, e.sinConexionDesde]);
}

/** El estado completo (incluida la recuperación): lo usa el aviso global. */
export function useEstadoConexion(): EstadoConexion {
  return useSyncExternalStore(suscribirConexion, leerEstadoConexion, leerEstadoConexion);
}
