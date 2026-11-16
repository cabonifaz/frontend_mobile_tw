import type { ImpactoIncidencia, Severidad } from '@/api/alertasCampo';

/** HU-32 — textos y reglas de las alertas de campo (sin acceso al teléfono ni al servidor: se prueban solos). */

/** 4.0 → "4"; 0.5 → "0.5"; null → "—". */
export function numero(v: number | null | undefined): string {
  return v === null || v === undefined || Number.isNaN(v) ? '—' : String(Math.round(v * 10000) / 10000);
}

/** Error con signo: 4 → "+4"; −1 → "−1"; 0 → "0". */
export function errorConSigno(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  const n = numero(v);
  return v > 0 ? `+${n}` : n.replace('-', '−');
}

/** EMP con ±: 2 → "±2". */
export function empTexto(v: number | null | undefined): string {
  return v === null || v === undefined || Number.isNaN(v) ? '—' : `±${numero(Math.abs(v))}`;
}

/** "hace 2 min", "hace 1 h", "hace 3 h", "hace 2 d". */
export function haceTexto(min: number): string {
  if (min < 1) return 'ahora';
  if (min < 60) return `hace ${min} min`;
  if (min < 1440) return `hace ${Math.floor(min / 60)} h`;
  return `hace ${Math.floor(min / 1440)} d`;
}

/** Lo que falta para poder registrar o escalar la incidencia (null = listo). */
export function faltaIncidencia(d: { idTipo: number | null; severidad: Severidad | null; impacto: ImpactoIncidencia | null; descripcion: string }): string | null {
  if (!d.idTipo) return 'Elige el tipo de incidencia.';
  if (!d.severidad) return 'Elige la severidad.';
  if (!d.impacto) return 'Elige el impacto en el servicio.';
  if (d.descripcion.trim().length < 3) return 'Escribe la descripción.';
  return null;
}

/** Texto del estado SSOMA de un técnico candidato. */
export function textoSsoma(estado: string): string {
  switch (estado) {
    case 'conforme':
      return 'SSOMA conforme';
    case 'por_vencer':
      return 'SSOMA por vencer';
    case 'incompleto':
      return 'SSOMA incompleto';
    case 'pendiente':
      return 'Falta documento SSOMA';
    case 'bloqueado':
      return 'SSOMA bloqueado';
    default:
      return estado;
  }
}
