import { entorno } from '@/config/entorno';
import { solicitar } from './cliente';
import { mockUsuario } from './mock';

/**
 * Datos del usuario que inició sesión, leídos de la BD (tabla usuario).
 * Backend: GET api/autenticacion/me → SP_ObtenerUsuarioPorId (MisDatosDto).
 */
export interface MisDatos {
  idUsuario: number;
  nombre: string;
  apellido: string;
  correo: string;
  rolSistema: string;
  rolSistemaLabel: string;
  /** Código del catálogo AREA_USUARIO (p. ej. "servicio_tecnico"). */
  area: string;
  forzarCambioContrasena: boolean;
}

export async function obtenerMisDatos(token: string): Promise<MisDatos> {
  if (entorno.usarMock) return mockUsuario.misDatos();
  const r = await solicitar<MisDatos>('/api/autenticacion/me', { token });
  return r.datos!;
}
