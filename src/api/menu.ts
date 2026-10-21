import { entorno } from '@/config/entorno';
import { solicitar } from './cliente';
import { mockMenu } from './mock';

/**
 * Indicadores del menú principal (HU-02).
 * Backend: GET api/movil/menu/resumen → SP_ObtenerResumenMenuMovil
 * Tablas: orden_servicio, os_personal, cliente, sede_cliente, tabla_maestra (TIPO_SERVICIO).
 */
export interface ProximoServicio {
  idOs: number;
  numero: string;
  cliente: string | null;
  sede: string | null;
  distrito: string | null;
  tipoServicio: string | null;
  /** "yyyy-MM-dd" (hora de Lima). */
  fechaEjecucion: string | null;
  /** "HH:mm". */
  horaInicio: string | null;
  /** programada | en_ruta | en_ejecucion | pausada | reprogramada | bloqueada */
  estado: string;
}

export interface ResumenMenu {
  serviciosAsignados: number;
  serviciosHoy: number;
  proximoServicio: ProximoServicio | null;
}

export async function obtenerResumenMenu(token: string): Promise<ResumenMenu> {
  if (entorno.usarMock) return mockMenu.resumen();
  const r = await solicitar<ResumenMenu>('/api/movil/menu/resumen', { token });
  return r.datos ?? { serviciosAsignados: 0, serviciosHoy: 0, proximoServicio: null };
}
