/**
 * HU-08 / HU-09 — Reglas de texto y validación del trabajo en el equipo que se calculan en el teléfono.
 * El back vuelve a validar todo (mismos rangos y mensajes en SP_GuardarVariablesAmbientalesMovil).
 */

export const TEMPERATURA_MIN = -20;
export const TEMPERATURA_MAX = 60;
export const HUMEDAD_MIN = 0;
export const HUMEDAD_MAX = 100;
export const MAX_PROCEDENCIA = 100;
/** Procedencia por defecto: "no indicado". */
export const PROCEDENCIA_POR_DEFECTO = 'N.I';

/** "25,4" o "25.4" → 25.4; vacío o con letras → null. Acepta el signo menos para temperaturas bajo cero. */
export function leerNumero(texto: string): number | null {
  const t = texto.trim().replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export interface ErroresVariables {
  temperatura?: string;
  humedad?: string;
  procedencia?: string;
}

/** Temperatura y humedad obligatorias y dentro de rango; procedencia opcional (hasta 100 caracteres). Vacío = todo bien. */
export function validarVariables(temperatura: string, humedad: string, procedencia: string): ErroresVariables {
  const e: ErroresVariables = {};
  const t = leerNumero(temperatura);
  const h = leerNumero(humedad);
  if (!temperatura.trim()) e.temperatura = 'Ingresa la temperatura (°C).';
  else if (t === null) e.temperatura = 'La temperatura debe ser un número.';
  else if (t < TEMPERATURA_MIN || t > TEMPERATURA_MAX) e.temperatura = `La temperatura debe estar entre ${TEMPERATURA_MIN} y ${TEMPERATURA_MAX} °C.`;
  if (!humedad.trim()) e.humedad = 'Ingresa la humedad relativa (%).';
  else if (h === null) e.humedad = 'La humedad debe ser un número.';
  else if (h < HUMEDAD_MIN || h > HUMEDAD_MAX) e.humedad = `La humedad relativa debe estar entre ${HUMEDAD_MIN} y ${HUMEDAD_MAX} %.`;
  if (procedencia.trim().length > MAX_PROCEDENCIA) e.procedencia = `Máximo ${MAX_PROCEDENCIA} caracteres.`;
  return e;
}

/** Texto de un número con coma decimal y sin ceros sobrantes: 25.4 → "25,4"; 62 → "62". */
export function textoNumero(n: number): string {
  return String(Math.round(n * 100) / 100).replace('.', ',');
}

/** "Procedencia" que se muestra: vacía = "N.I". */
export function procedenciaVisible(texto: string | null | undefined): string {
  return texto?.trim() || PROCEDENCIA_POR_DEFECTO;
}

/** Etapas que ya están conformes, de las 5: para "1 de 5 etapas" y la barra de avance (0 a 1). */
export function avanceEtapas(conformes: number, total: number): { texto: string; fraccion: number } {
  const t = total > 0 ? total : 5;
  const c = Math.max(0, Math.min(conformes, t));
  return { texto: `${c} de ${t} etapas`, fraccion: c / t };
}
