import type { EstadoAgenda, NivelCarga } from '@/api/agendaArea';
import { colores } from '@/tema/colores';

/**
 * HU-37 — Reglas de pantalla de la Agenda del área (Jefe de Área): colores por estado y por nivel de carga, textos de la semana y validación de las dos formas de mover un servicio
 * en conflicto (cambiar el horario del mismo día, o reprogramar a otra fecha con motivo). Quién ve qué, qué es un conflicto, el nivel de carga y el circuito
 * (directo o solicitud) los decide el back con las reglas de la Programación de la intranet.
 */
export const MAX_COMENTARIO_AGENDA = 400;

export const ESTADOS_AGENDA: { estado: EstadoAgenda; texto: string; color: string; fondo: string }[] = [
  { estado: 'confirmado', texto: 'Confirmado', color: '#2563EB', fondo: '#DBEAFE' },
  { estado: 'en_curso', texto: 'En curso', color: '#16A34A', fondo: '#DCFCE7' },
  { estado: 'demora', texto: 'Demora', color: '#EA580C', fondo: '#FFEDD5' },
  { estado: 'conflicto', texto: 'Conflicto', color: '#DC2626', fondo: '#FEE2E2' },
];

export function estiloEstadoAgenda(estado: string): { texto: string; color: string; fondo: string } {
  const e = ESTADOS_AGENDA.find((x) => x.estado === estado);
  if (e) return e;
  if (estado === 'pendiente') return { texto: 'Pendiente', color: '#B45309', fondo: '#FEF3C7' };
  if (estado === 'finalizado') return { texto: 'Finalizado', color: '#475569', fondo: '#E2E8F0' };
  return { texto: estado, color: '#475569', fondo: '#E2E8F0' };
}

export function estiloNivelCarga(nivel: NivelCarga | string): { texto: string; color: string } {
  switch (nivel) {
    case 'sobrecarga':
      return { texto: 'Sobrecarga', color: colores.rojo };
    case 'alta':
      return { texto: 'Alta', color: colores.naranja };
    case 'optima':
      return { texto: 'Óptima', color: colores.verde };
    case 'baja':
      return { texto: 'Baja', color: colores.primario };
    default:
      return { texto: 'Libre', color: '#94A3B8' };
  }
}

const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const DIAS_CORTOS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

const partes = (f: string) => /^(\d{4})-(\d{2})-(\d{2})/.exec(f);

/** "26 – 30 oct 2026" (o "26 oct – 1 nov 2026" si cruza de mes). */
export function textoSemana(desde: string, hasta: string): string {
  const a = partes(desde);
  const b = partes(hasta);
  if (!a || !b) return '';
  const mesA = MESES_CORTOS[Number(a[2]) - 1];
  const mesB = MESES_CORTOS[Number(b[2]) - 1];
  return a[2] === b[2] ? `${Number(a[3])} – ${Number(b[3])} ${mesB} ${b[1]}` : `${Number(a[3])} ${mesA} – ${Number(b[3])} ${mesB} ${b[1]}`;
}

/** "Lun 26" para la cabecera de una columna. */
export function cabeceraDia(fecha: string): string {
  const m = partes(fecha);
  if (!m) return fecha;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return `${DIAS_CORTOS[d.getUTCDay()]} ${Number(m[3])}`;
}

/** "miércoles 28/10" para el título de un conflicto. */
export function textoDiaConflicto(fecha: string | null | undefined): string {
  const m = partes(fecha ?? '');
  if (!m) return '';
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  const nombres = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  return `${nombres[d.getUTCDay()]} ${m[3]}/${m[2]}`;
}

/** Suma (o resta) semanas a un lunes ("yyyy-MM-dd"). */
export function moverSemana(desde: string, delta: number): string {
  const d = new Date(`${desde}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta * 7);
  return d.toISOString().slice(0, 10);
}

export const horaValida = (h: string): boolean => /^([01]\d|2[0-3]):[0-5]\d$/.test(h.trim());
export const fechaValida = (f: string): boolean => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(f.trim());
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]);
};

export interface FormularioMover {
  fecha: string;
  horaInicio: string;
  horaFin: string;
  idMotivo: number | null;
  comentario: string;
  /** true = «Reprogramar con motivo» (otra fecha, motivo obligatorio); false = «Cambiar horario» (el mismo día). */
  conMotivo: boolean;
  /** Día del conflicto ("yyyy-MM-dd"), para «Cambiar horario». */
  fechaConflicto: string | null;
  hoy: string;
}

/** Lo que falta o está mal al mover un servicio, o null si se puede enviar. */
export function errorMover(f: FormularioMover): string | null {
  const fecha = f.conMotivo ? f.fecha.trim() : (f.fechaConflicto ?? f.fecha).trim();
  if (!fechaValida(fecha)) return 'Escribe la fecha como AAAA-MM-DD.';
  if (fecha < f.hoy) return 'La fecha no puede ser anterior a hoy.';
  if (!horaValida(f.horaInicio) || !horaValida(f.horaFin)) return 'Escribe las horas como HH:MM (por ejemplo 09:00).';
  if (f.horaFin.trim() <= f.horaInicio.trim()) return 'La hora de fin debe ser posterior a la de inicio.';
  if (f.conMotivo && !f.idMotivo) return 'Elige el motivo de la reprogramación.';
  if (f.comentario.length > MAX_COMENTARIO_AGENDA) return `El comentario no puede superar los ${MAX_COMENTARIO_AGENDA} caracteres.`;
  return null;
}
