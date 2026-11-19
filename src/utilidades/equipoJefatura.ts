import type { EstadoEquipo, HoraDia, HoraSemana } from '@/api/equipoJefatura';
import { colores } from '@/tema/colores';

/**
 * HU-36 — Reglas de pantalla de Mi equipo: etiquetas de estado del Reloj Marcador, colores de la carga de la semana, SSOMA y el calendario de horas contabilizadas
 * (armado del mes por semanas de lunes a domingo, con el acumulado de cada semana). El estado de cada técnico, la carga y las horas las calcula el back.
 */
export function etiquetaEquipo(estado: EstadoEquipo | string): { texto: string; fondo: string; color: string; avatar: string } {
  switch (estado) {
    case 'refrigerio':
      return { texto: 'REFRIGERIO', fondo: '#DBEAFE', color: '#1E40AF', avatar: '#2563EB' };
    case 'tardanza':
      return { texto: 'TARDANZA', fondo: '#FEF3C7', color: '#92400E', avatar: '#EA580C' };
    case 'sin_marcar':
      return { texto: 'SIN MARCAR', fondo: '#FEE2E2', color: '#B91C1C', avatar: '#DC2626' };
    case 'finalizada':
      return { texto: 'FINALIZÓ', fondo: '#E2E8F0', color: '#475569', avatar: '#64748B' };
    default:
      return { texto: 'EN LABORES', fondo: '#DCFCE7', color: '#166534', avatar: '#16A34A' };
  }
}

export function etiquetaSsoma(estado: string | null | undefined): { texto: string; fondo: string; color: string } | null {
  switch (estado) {
    case 'conforme':
      return { texto: 'SSOMA CONFORME', fondo: '#DCFCE7', color: '#166534' };
    case 'por_vencer':
      return { texto: 'SSOMA POR VENCER', fondo: '#FEF3C7', color: '#92400E' };
    case 'incompleto':
      return { texto: 'SSOMA INCOMPLETO', fondo: '#FFEDD5', color: '#9A3412' };
    case 'pendiente':
      return { texto: 'SSOMA PENDIENTE', fondo: '#E2E8F0', color: '#475569' };
    case 'bloqueado':
      return { texto: 'SSOMA BLOQUEADO', fondo: '#FEE2E2', color: '#B91C1C' };
    default:
      return null;
  }
}

/** Color de la barra de la carga: azul con holgura, naranja cerca del tope, rojo si lo supera. */
export const colorCarga = (porcentaje: number): string => (porcentaje >= 100 ? colores.rojo : porcentaje >= 75 ? colores.naranja : colores.primario);

export const textoNivelCarga = (nivel: string): { texto: string; color: string } =>
  nivel === 'alta' ? { texto: 'Alta', color: colores.naranja } : nivel === 'baja' ? { texto: 'Baja', color: colores.primario } : { texto: 'Normal', color: colores.verde };

export const tonoMarcacion = (tono: string): string =>
  tono === 'verde' ? colores.verde : tono === 'naranja' ? colores.naranja : tono === 'rojo' ? colores.rojo : '#CBD5E1';

// ── Horas contabilizadas ────────────────────────────────────────────────────────────────────────────────────────────

/** "7 h 30 min", "45 min", "0 h". */
export function textoHoras(minutos: number | null | undefined): string {
  const m = Math.max(0, Math.round(minutos ?? 0));
  if (m === 0) return '0 h';
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return `${r} min`;
  return r === 0 ? `${h} h` : `${h} h ${String(r).padStart(2, '0')} min`;
}

/** "7:30" para la celda de un día del calendario. */
export function textoHorasCorto(minutos: number): string {
  const m = Math.max(0, Math.round(minutos));
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const DIAS_SEMANA = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

/** "noviembre 2026" a partir de "2026-11". */
export function nombreMes(mes: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(mes);
  return m ? `${MESES[Number(m[2]) - 1] ?? mes} ${m[1]}` : mes;
}

/** El mes de hoy en Lima ("yyyy-MM"). */
export const mesActualLima = (ahora: number = Date.now()): string => new Date(ahora - 5 * 3600_000).toISOString().slice(0, 7);

/** Suma (o resta) meses a "yyyy-MM". */
export function moverMes(mes: string, delta: number): string {
  const [a, m] = mes.split('-').map(Number);
  const f = new Date(Date.UTC(a, m - 1 + delta, 1));
  return f.toISOString().slice(0, 7);
}

/** Meses que el back acepta consultar hacia atrás. */
export const MESES_ATRAS_MAX = 24;
export const puedeIrAtras = (mes: string, ahora: number = Date.now()): boolean => mes > moverMes(mesActualLima(ahora), -MESES_ATRAS_MAX);
export const puedeIrAdelante = (mes: string, ahora: number = Date.now()): boolean => mes < mesActualLima(ahora);

export interface CeldaCalendario {
  /** "yyyy-MM-dd" o null si la celda es de otro mes (relleno). */
  fecha: string | null;
  dia: number | null;
  minutos: number;
  trabajo: boolean;
  sinCierre: boolean;
  esHoy: boolean;
}

export interface FilaCalendario {
  celdas: CeldaCalendario[];
  /** Lunes de la semana ("yyyy-MM-dd"). */
  desde: string;
  /** Acumulado de la semana (solo los días de este mes). */
  minutos: number;
  diasTrabajados: number;
}

/** Arma el mes por semanas de lunes a domingo; el acumulado de cada semana sale del back (`semanas`) y, si falta, se suma de los días. */
export function construirCalendario(mes: string, dias: readonly HoraDia[], semanas: readonly HoraSemana[], hoy: string = new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 10)): FilaCalendario[] {
  const [a, m] = mes.split('-').map(Number);
  const primero = new Date(Date.UTC(a, m - 1, 1));
  const ultimoDia = new Date(Date.UTC(a, m, 0)).getUTCDate();
  const porFecha = new Map(dias.map((d) => [d.fecha, d]));
  const desplazamiento = (primero.getUTCDay() + 6) % 7; // lunes = 0
  const filas: FilaCalendario[] = [];
  let dia = 1 - desplazamiento;
  while (dia <= ultimoDia) {
    const celdas: CeldaCalendario[] = [];
    let desde = '';
    for (let c = 0; c < 7; c++, dia++) {
      const f = new Date(Date.UTC(a, m - 1, dia));
      const iso = f.toISOString().slice(0, 10);
      if (c === 0) desde = iso;
      if (dia < 1 || dia > ultimoDia) {
        celdas.push({ fecha: null, dia: null, minutos: 0, trabajo: false, sinCierre: false, esHoy: false });
        continue;
      }
      const d = porFecha.get(iso);
      celdas.push({ fecha: iso, dia, minutos: d?.minutos ?? 0, trabajo: !!d && (d.minutos > 0 || d.sinCierre), sinCierre: !!d?.sinCierre, esHoy: iso === hoy });
    }
    const delBack = semanas.find((s) => s.desde === desde);
    filas.push({
      celdas,
      desde,
      minutos: delBack ? delBack.minutos : celdas.reduce((x, c) => x + c.minutos, 0),
      diasTrabajados: delBack ? delBack.diasTrabajados : celdas.filter((c) => c.trabajo).length,
    });
  }
  return filas;
}

/** "17/11" a partir de "yyyy-MM-dd". */
export function diaMesCorto(fecha: string | null | undefined): string {
  const m = /^\d{4}-(\d{2})-(\d{2})/.exec(fecha ?? '');
  return m ? `${m[2]}/${m[1]}` : '';
}

/** "lunes 17 de noviembre" a partir de "yyyy-MM-dd". */
export function textoDiaLargo(fecha: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha);
  if (!m) return fecha;
  const f = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  const nombres = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  return `${nombres[f.getUTCDay()]} ${Number(m[3])} de ${MESES[Number(m[2]) - 1]}`;
}
