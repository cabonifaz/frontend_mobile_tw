import { entorno } from '@/config/entorno';
import { fechaDesdeApi, solicitar } from './cliente';
import { mockAutenticacion } from './mock';

/**
 * Endpoints de acceso a la app (App Mobile HU-01).
 *   POST api/movil/autenticacion/iniciar-sesion   (nuevo — solo usuario, 1 equipo a la vez)
 *   POST api/movil/autenticacion/cerrar-sesion    (nuevo)
 *   POST api/autenticacion/cambiar-contrasena     (existente en la intranet)
 *   GET  api/autenticacion/me                     (existente en la intranet)
 */

export interface UsuarioSesion {
  idUsuario: number;
  usuario: string;
  nombre: string;
  apellido: string;
  cargo: string | null;
  area: string | null;
  rolSistema: string;
  forzarCambioContrasena: boolean;
}

export interface SesionIniciada {
  token: string;
  expiraEn: Date;
  usuario: UsuarioSesion;
}

interface IniciarSesionApi {
  token: string;
  expiraEn: string;
  idUsuario: number;
  usuario: string;
  nombre: string;
  apellido: string;
  cargo: string | null;
  area: string | null;
  rolSistema: string;
  forzarCambioContrasena: boolean;
}

export interface DatosIngreso {
  usuario: string;
  contrasena: string;
  idDispositivo: string;
  nombreDispositivo: string | null;
}

export async function iniciarSesion(datos: DatosIngreso): Promise<SesionIniciada> {
  if (entorno.usarMock) return mockAutenticacion.iniciarSesion(datos);

  const r = await solicitar<IniciarSesionApi>('/api/movil/autenticacion/iniciar-sesion', {
    metodo: 'POST',
    cuerpo: datos,
    manejarSesionInvalida: false,
  });
  const d = r.datos!;
  return {
    token: d.token,
    expiraEn: fechaDesdeApi(d.expiraEn),
    usuario: {
      idUsuario: d.idUsuario,
      usuario: d.usuario,
      nombre: d.nombre,
      apellido: d.apellido,
      cargo: d.cargo,
      area: d.area,
      rolSistema: d.rolSistema,
      forzarCambioContrasena: d.forzarCambioContrasena,
    },
  };
}

export async function cerrarSesion(token: string): Promise<void> {
  if (entorno.usarMock) return mockAutenticacion.cerrarSesion();
  await solicitar<boolean>('/api/movil/autenticacion/cerrar-sesion', {
    metodo: 'POST',
    token,
    manejarSesionInvalida: false,
  });
}

export async function cambiarContrasena(token: string, contrasenaActual: string, contrasenaNueva: string): Promise<string> {
  if (entorno.usarMock) return mockAutenticacion.cambiarContrasena(contrasenaActual, contrasenaNueva);
  const r = await solicitar<boolean>('/api/autenticacion/cambiar-contrasena', {
    metodo: 'POST',
    token,
    cuerpo: { contrasenaActual, contrasenaNueva },
  });
  return r.mensaje;
}

/** Comprueba que la sesión siga vigente en el servidor (al abrir la app con "Recordar sesión"). */
export async function validarSesion(token: string): Promise<void> {
  if (entorno.usarMock) return;
  await solicitar('/api/autenticacion/me', { token });
}
