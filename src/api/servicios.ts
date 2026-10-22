import { entorno } from '@/config/entorno';
import { solicitar } from './cliente';
import { mockServicios } from './mock';

/**
 * Agenda de servicios programados (HU-03).
 * Backend: GET api/movil/servicios?filtro=&busqueda= → SP_ObtenerServiciosProgramadosMovil
 * Tablas: orden_servicio, os_personal, os_equipo, informe_tecnico, alerta_predictiva,
 *         expediente_digital, expediente_bloqueador, requerimiento, orden_metrologia,
 *         cliente, sede_cliente, usuario.
 */
export type FiltroServicios = 'todos' | 'hoy' | 'pendientes' | 'en_ejecucion';
export type EstadoGeneralServicio = 'LISTO' | 'PENDIENTE' | 'BLOQUEADO';
export type EstadoSsoma = 'habilitado' | 'pendiente' | 'bloqueado';

export interface ServicioProgramado {
  idOs: number;
  numeroOs: string;
  numeroRq: string | null;
  numeroOm: string | null;
  cliente: string | null;
  /** "yyyy-MM-dd" (hora de Lima). */
  fechaEjecucion: string | null;
  /** "HH:mm". */
  horaInicio: string | null;
  /** programada | en_ruta | en_ejecucion | pausada | reprogramada | bloqueada */
  estadoOs: string;
  sede: string | null;
  responsable: string | null;
  objetivosTotal: number;
  objetivosCompletados: number;
  clienteConfirmado: boolean;
  estadoSsoma: EstadoSsoma;
  alertasPredictivas: number;
  estadoGeneral: EstadoGeneralServicio;
  motivoBloqueo: string | null;
}

export async function obtenerServiciosProgramados(
  token: string,
  filtro: FiltroServicios,
  busqueda: string,
): Promise<ServicioProgramado[]> {
  if (entorno.usarMock) return mockServicios.programados(filtro, busqueda);
  const params = new URLSearchParams({ filtro });
  if (busqueda.trim()) params.set('busqueda', busqueda.trim());
  const r = await solicitar<ServicioProgramado[]>(`/api/movil/servicios?${params.toString()}`, { token });
  return r.datos ?? [];
}
