import { entorno } from '@/config/entorno';
import { solicitar } from './cliente';
import { mockJefatura } from './mockJefatura';

/**
 * HU-28 — Menú de Jefatura (supervisores y administradores de cualquier área menos Servicio Técnico).
 * Backend: GET api/movil/jefatura/menu → SP_ObtenerMenuJefaturaMovil
 * Tablas: usuario (rol_sistema + area), tabla_maestra (AREA_USUARIO, SEDE_OPERATIVA_TW), orden_servicio, expediente_digital,
 *   requerimiento, area_servicio_rq, demora_registro, autorizacion_salida_os; y para los contadores de las tarjetas: notificacion (prioridad),
 *   informe_tecnico (SP_ArmarBaseInformes), orden_metrologia, ticket_metrologia, os_personal, SP_ArmarConflictosProgramacion y gasto_viatico.
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
  /**
   * Contadores de las demás tarjetas (HU-28, actualización). null / ausente = sin dato para este usuario (no tiene el permiso, el área no aplica o la
   * fuente no existe): la tarjeta no muestra contador. Ver SP_ObtenerMenuJefaturaMovil.
   */
  /** Notificaciones CRÍTICAS sin leer (las mismas del filtro "Críticas" de Notificaciones). */
  alertasCriticas?: number | null;
  /** Informes de servicio técnico pendientes de revisión (misma cuenta que la bandeja de Revisión Técnica). */
  informesPorRevisar?: number | null;
  /** Órdenes de metrología con el certificado pendiente (solo Metrología). */
  certificadosPendientes?: number | null;
  /** Tickets de correlativo solicitados (solo Metrología). */
  ticketsCorrelativo?: number | null;
  /** Técnicos activos del área (Servicio Técnico y Metrología). */
  miEquipoTotal?: number | null;
  /** De ellos, los que hoy tienen una orden en ruta, en ejecución o pausada. */
  miEquipoEnLabores?: number | null;
  /** Conflictos sobrevenidos de la Programación (HU-39). */
  agendaConflictos?: number | null;
  /** Gastos rendidos por revisar (solo quien los revisa: Jefe de Operaciones). */
  viaticosPorRevisar?: number | null;
}

export async function obtenerMenuJefatura(token: string): Promise<MenuJefatura> {
  if (entorno.usarMock) return mockJefatura.menu(token);
  const r = await solicitar<MenuJefatura>('/api/movil/jefatura/menu', { token });
  return r.datos!;
}
