/**
 * HU-27 — Reglas de pantalla para rendir un gasto o solicitar un reembolso (las valida también el back; aquí solo se evita enviar algo que se sabe que fallará).
 */

/** Fotos del comprobante por gasto. */
export const MAX_FOTOS_GASTO = 5;
/** Antigüedad máxima del gasto (días). */
export const DIAS_MAXIMOS_GASTO = 90;

/** Identificador del gasto generado en el teléfono: un reintento con el mismo valor no duplica el gasto. */
export function nuevoIdCliente(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/** "45", "45.5", "45,50" → número con hasta 2 decimales (> 0); otra cosa → null. */
export function leerMontoGasto(texto: string): number | null {
  const t = texto.trim().replace(/\s+/g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Suma en céntimos, para que 30.00 + 15.50 sea exactamente 45.50. */
export function sumar(montos: number[]): number {
  return montos.reduce((a, m) => a + Math.round(m * 100), 0) / 100;
}

/** "yyyy-MM-dd" → "dd/mm/aaaa". */
export function fechaParaCampo(iso: string): string {
  const [a, m, d] = iso.split('-');
  return a && m && d ? `${d}/${m}/${a}` : iso;
}

/** "26/10/2026" o "26-10-2026" → "2026-10-26"; fecha inexistente → null. */
export function fechaDeCampo(texto: string): string | null {
  const m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(texto.trim());
  if (!m) return null;
  const dia = Number(m[1]);
  const mes = Number(m[2]);
  const anio = Number(m[3]);
  const f = new Date(Date.UTC(anio, mes - 1, dia));
  if (f.getUTCFullYear() !== anio || f.getUTCMonth() !== mes - 1 || f.getUTCDate() !== dia) return null;
  return `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

/** Mensaje si la fecha (yyyy-MM-dd) es futura o tiene más de 90 días respecto a hoy (yyyy-MM-dd, hora de Lima); null si es válida. */
export function errorDeFecha(fecha: string | null, hoy: string): string | null {
  if (!fecha) return 'Escribe la fecha como dd/mm/aaaa.';
  if (fecha > hoy) return 'La fecha del gasto no puede ser futura.';
  const dias = (Date.parse(hoy) - Date.parse(fecha)) / 86_400_000;
  return dias > DIAS_MAXIMOS_GASTO ? `El gasto no puede tener más de ${DIAS_MAXIMOS_GASTO} días.` : null;
}
