import { entorno } from '@/config/entorno';
import type { AreaJefatura } from '@/utilidades/perfil';
import { solicitar } from './cliente';
import { mockJefatura } from './mockJefatura';

/**
 * HU-28 — Menú de Jefatura (Jefe de Metrología; el Jefe de Servicio Técnico usa el menú de campo).
 * Backend: GET api/movil/jefatura/menu → SP_ObtenerMenuJefaturaMovil
 * Tablas: usuario, tabla_maestra (CARGO_USUARIO, AREA_USUARIO, SEDE_OPERATIVA_TW), orden_servicio, expediente_digital,
 *   requerimiento, area_servicio_rq, demora_registro, autorizacion_salida_os.
 * Todo se filtra por el área del jefe según la RQ de cada servicio. Los contadores son de HOY (hora de Lima).
 */
export interface MenuJefatura {
  areaCodigo: AreaJefatura;
  /** "Servicio Técnico" | "Metrología" */
  areaNombre: string | null;
  /** "Lima Central" */
  sede: string | null;
  programados: number;
  enRuta: number;
  /** En ejecución o pausados (ya están en planta). */
  enEjecucion: number;
  conDemora: number;
  /** Solicitudes de salida esperando su decisión (también el globo de la pestaña Aprobaciones). */
  aprobacionesPendientes: number;
}

export async function obtenerMenuJefatura(token: string): Promise<MenuJefatura> {
  if (entorno.usarMock) return mockJefatura.menu();
  const r = await solicitar<MenuJefatura>('/api/movil/jefatura/menu', { token });
  return r.datos!;
}
