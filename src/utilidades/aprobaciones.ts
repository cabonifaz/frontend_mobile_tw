import type { Aprobacion, TipoAprobacion } from '@/api/aprobaciones';

/** Reglas de la bandeja de aprobaciones (HU-31) que se resuelven en la app. */

export type FiltroAprobaciones = 'todas' | TipoAprobacion;

export const etiquetaTipo: Record<TipoAprobacion, { plural: string; kicker: string }> = {
  salida: { plural: 'Salidas', kicker: 'AUTORIZACIÓN DE SALIDA' },
  evidencia: { plural: 'Evidencias', kicker: 'EVIDENCIA FORZADA' },
  ensayo: { plural: 'Ensayos', kicker: 'ENSAYO GUARDADO CON ERROR' },
  gasto: { plural: 'Gastos', kicker: 'SOLICITUD DE GASTO' },
};

export function filtrarAprobaciones(items: readonly Aprobacion[], filtro: FiltroAprobaciones): Aprobacion[] {
  return filtro === 'todas' ? [...items] : items.filter((i) => i.tipo === filtro);
}

/** Urgentes primero (HU-31): las que son de hoy; el resto en "Pendientes". Respeta el orden que envía el back. */
export function separarUrgentes(items: readonly Aprobacion[]): { urgentes: Aprobacion[]; pendientes: Aprobacion[] } {
  return { urgentes: items.filter((i) => i.urgente), pendientes: items.filter((i) => !i.urgente) };
}

/** "Luis Medina" → "LM"; vacío → "?". */
export function inicialesDe(nombre: string | null | undefined): string {
  const partes = (nombre ?? '').trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return '?';
  return (partes[0][0] + (partes.length > 1 ? partes[partes.length - 1][0] : '')).toUpperCase();
}

const aMinutos = (iso: string): number | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso);
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) / 60000 : null;
};

/**
 * "hace 8 min", "hace 3 h", o "dd/MM HH:mm" si pasó más de un día. Las dos fechas son de Lima ("yyyy-MM-ddTHH:mm:ss"):
 * no pasan por la zona horaria del celular. `ahoraLima` se puede pasar para probarla.
 */
export function haceTexto(solicitadaEn: string | null | undefined, ahoraLima: string = new Date(Date.now() - 5 * 3600_000).toISOString()): string {
  if (!solicitadaEn) return '';
  const desde = aMinutos(solicitadaEn);
  const hasta = aMinutos(ahoraLima);
  if (desde == null || hasta == null) return '';
  const minutos = Math.round(hasta - desde);
  if (minutos < 1) return 'ahora';
  if (minutos < 60) return `hace ${minutos} min`;
  if (minutos < 24 * 60) return `hace ${Math.floor(minutos / 60)} h`;
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(solicitadaEn)!;
  return `${m[3]}/${m[2]} ${m[4]}:${m[5]}`;
}
