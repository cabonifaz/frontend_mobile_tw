import type { Progreso, TipoProgreso } from '@/api/progreso';

/** HU-21 — textos y filtros del Progreso Guardado (sin acceso al teléfono: se prueba solo). */
export type FiltroProgreso = 'todo' | TipoProgreso;

export const FILTROS_PROGRESO: { valor: FiltroProgreso; texto: string }[] = [
  { valor: 'todo', texto: 'Todo' },
  { valor: 'servicio', texto: 'Servicios' },
  { valor: 'gasto', texto: 'Gastos' },
  { valor: 'ingreso', texto: 'Ingresos' },
];

export const ETIQUETA_TIPO: Record<TipoProgreso, string> = {
  servicio: 'SERVICIO PROGRAMADO · TRABAJO EN EL EQUIPO',
  gasto: 'SOLICITUD DE GASTOS',
  ingreso: 'INGRESO DE EQUIPOS OS',
};

export function filtrarProgreso(lista: Progreso[], filtro: FiltroProgreso): Progreso[] {
  return filtro === 'todo' ? lista : lista.filter((p) => p.tipo === filtro);
}

/** Porcentaje entero 0–100 de «hechos de total». */
export function porcentaje(hechos: number, total: number): number {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((hechos / total) * 100)));
}

const dia = (d: Date) => new Date(d.getTime() - 5 * 3600_000).toISOString().slice(0, 10);

/** «hoy 11:19», «ayer 18:02» o «12/11 09:30» (hora de Lima, sin depender de la zona del celular). */
export function textoGuardado(iso: string, ahora: Date = new Date()): string {
  const f = new Date(iso);
  if (Number.isNaN(f.getTime())) return '—';
  const lima = new Date(f.getTime() - 5 * 3600_000).toISOString();
  const hora = lima.slice(11, 16);
  const d = dia(f);
  if (d === dia(ahora)) return `hoy ${hora}`;
  if (d === dia(new Date(ahora.getTime() - 86400_000))) return `ayer ${hora}`;
  return `${lima.slice(8, 10)}/${lima.slice(5, 7)} ${hora}`;
}

export function textoContador(n: number): string {
  return `${n} EN CURSO`;
}
