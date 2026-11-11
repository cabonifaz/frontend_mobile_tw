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

// ── HU-16 · Hard Stop de "Finalizar trabajo en equipo" ───────────────────────────────────────────
// El SERVIDOR valida las 5 etapas (SP_ValidarCierreEquipoMovil); aquí solo se arman los textos y a qué pantalla lleva cada etapa.

/** Una etapa conforme (o con las lecturas fuera de EMP ya notificadas al encargado) está resuelta; en curso, pendiente, bloqueada o no conforme bloquean el cierre. */
export function etapaResuelta(estado: string): boolean {
  return estado === 'conforme' || estado === 'notificado';
}

/** Las etapas que bloquean el cierre, en su orden. */
export function etapasPorResolver<T extends { estado: string; orden: number }>(etapas: T[]): T[] {
  return etapas.filter((e) => !etapaResuelta(e.estado)).sort((a, b) => a.orden - b.orden);
}

/** "Hay 4 etapas incompletas o no conformes:" (singular: "Hay 1 etapa incompleta o no conforme:"). */
export function textoNoSePuedeFinalizar(n: number): string {
  return n === 1 ? 'Hay 1 etapa incompleta o no conforme:' : `Hay ${n} etapas incompletas o no conformes:`;
}

/** Banner de "Revisar pendientes": "4 pendientes por resolver. Toca una etapa marcada en rojo para completarla." */
export function textoPendientesPorResolver(n: number): string {
  return `${n} ${n === 1 ? 'pendiente por resolver' : 'pendientes por resolver'}. Toca una etapa marcada en rojo para completarla.`;
}

/** Pantalla de cada etapa (HU-09 variables · HU-11 fotos · HU-10 ensayos · HU-15 cabecera · HU-14 correlativo). */
export function rutaDeEtapa(codigo: string): '/variables-ambientales' | '/registro-fotografico' | '/ensayos' | '/cabecera-informe' | '/solicitud-correlativo' | null {
  switch (codigo) {
    case 'variables':
      return '/variables-ambientales';
    case 'fotos':
      return '/registro-fotografico';
    case 'ensayos':
      return '/ensayos';
    case 'cabecera':
      return '/cabecera-informe';
    case 'correlativo':
      return '/solicitud-correlativo';
    default:
      return null;
  }
}

/** Etiqueta de una etapa: CONFORME · NOTIFICADO · EN CURSO · PENDIENTE · BLOQUEADO · NO CONFORME. */
export function textoEstadoEtapa(estado: string): string {
  switch (estado) {
    case 'conforme':
      return 'CONFORME';
    case 'notificado':
      return 'NOTIFICADO';
    case 'en_curso':
      return 'EN CURSO';
    case 'bloqueado':
      return 'BLOQUEADO';
    case 'no_conforme':
      return 'NO CONFORME';
    default:
      return 'PENDIENTE';
  }
}
