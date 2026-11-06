import { entorno } from '@/config/entorno';
import { solicitar } from './cliente';
import { mockJefatura } from './mockJefatura';

/**
 * HU-28 — Menú de Jefatura (supervisores y administradores de cualquier área menos Servicio Técnico).
 * Backend: GET api/movil/jefatura/menu → SP_ObtenerMenuJefaturaMovil
 * Tablas: usuario (rol_sistema + area), tabla_maestra (AREA_USUARIO, SEDE_OPERATIVA_TW), orden_servicio, expediente_digital,
 *   requerimiento, area_servicio_rq, demora_registro, autorizacion_salida_os.
 * Metrología se filtra por el área de la RQ de cada servicio; las demás áreas ven todos los servicios. Contadores de HOY (hora de Lima).
 */
export interface MenuJefatura {
  /** Área del usuario ('metrologia', 'operaciones', 'ti'…). */
  areaCodigo: string;
  /** "Metrología", "Operaciones", "TI"… */
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
  if (entorno.usarMock) return mockJefatura.menu(token);
  const r = await solicitar<MenuJefatura>('/api/movil/jefatura/menu', { token });
  return r.datos!;
}
