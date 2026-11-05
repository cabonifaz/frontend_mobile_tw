import type { FiltroServicios, ServicioProgramado } from '@/api/servicios';

/**
 * Reglas de la agenda de servicios (HU-03) que se resuelven en la app.
 * Se piden TODOS los servicios del técnico una sola vez y los filtros Todos / Hoy / Pendientes y sus contadores salen de esa
 * lista: cambiar de filtro no vuelve a llamar al back y los números siempre coinciden con lo que se ve.
 * Mismas reglas que SP_ObtenerServiciosProgramadosMovil, que sigue aceptando el filtro por si se pide desde otro lugar.
 */

const ESTADOS_EN_CURSO = ['en_ruta', 'en_ejecucion', 'pausada'];
const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

export interface ContadoresAgenda {
  todos: number;
  hoy: number;
  pendientes: number;
  enCurso: number;
}

/** Fecha de hoy en Lima ("yyyy-MM-dd"), sin depender de la zona horaria configurada en el celular. */
export function fechaLimaHoy(ahora: number = Date.now()): string {
  return new Date(ahora - 5 * 3600_000).toISOString().slice(0, 10);
}

/** El servicio sigue en campo (en ruta, en ejecución o pausado). */
export function estaEnCurso(s: ServicioProgramado): boolean {
  return ESTADOS_EN_CURSO.includes(s.estadoOs);
}

/** Pendiente = falta la confirmación del cliente o la aprobación SSOMA (los bloqueados no cuentan). */
export function filtrarServicios(
  servicios: readonly ServicioProgramado[],
  filtro: FiltroServicios,
  hoy: string = fechaLimaHoy(),
): ServicioProgramado[] {
  switch (filtro) {
    case 'hoy':
      return servicios.filter((s) => s.fechaEjecucion?.slice(0, 10) === hoy);
    case 'pendientes':
      return servicios.filter((s) => s.estadoGeneral === 'PENDIENTE');
    case 'en_ejecucion':
      return servicios.filter(estaEnCurso);
    default:
      return [...servicios];
  }
}

export function contarServicios(servicios: readonly ServicioProgramado[], hoy: string = fechaLimaHoy()): ContadoresAgenda {
  return {
    todos: servicios.length,
    hoy: filtrarServicios(servicios, 'hoy', hoy).length,
    pendientes: filtrarServicios(servicios, 'pendientes', hoy).length,
    enCurso: filtrarServicios(servicios, 'en_ejecucion', hoy).length,
  };
}

/** "2026-10-26" → "Lunes 26/10/2026". */
export function etiquetaDia(fecha: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(fecha);
  if (!m) return fecha;
  const dia = DIAS[new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay()];
  return `${dia} ${m[3]}/${m[2]}/${m[1]}`;
}

/** 1 → "1 servicio", 3 → "3 servicios". */
export function textoServicios(cantidad: number): string {
  return `${cantidad} ${cantidad === 1 ? 'servicio' : 'servicios'}`;
}
