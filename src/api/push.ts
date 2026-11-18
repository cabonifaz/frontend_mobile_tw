import { Platform } from 'react-native';
import { entorno } from '@/config/entorno';
import { obtenerIdDispositivo } from '@/sesion/dispositivo';
import { solicitar } from './cliente';

/**
 * Notificaciones push (bandeja de notificaciones del teléfono). Backend (el usuario sale del token):
 *   POST   api/movil/push/dispositivo                  → SP_RegistrarDispositivoPushMovil (token de Expo Push de este teléfono)
 *   DELETE api/movil/push/dispositivo/{idDispositivo}  → SP_QuitarDispositivoPushMovil (al cerrar sesión)
 * Tabla: dispositivo_push_movil. El servidor envía cada notificación nueva (tabla `notificacion`) a los teléfonos con sesión de su destinatario.
 * En modo demo no hay servidor: no hace nada.
 */
export async function registrarDispositivoPush(token: string, tokenPush: string): Promise<void> {
  if (entorno.usarMock) return;
  await solicitar<boolean>('/api/movil/push/dispositivo', {
    metodo: 'POST',
    token,
    cuerpo: { idDispositivo: await obtenerIdDispositivo(), token: tokenPush, plataforma: Platform.OS === 'ios' ? 'ios' : 'android' },
    manejarSesionInvalida: false,
  });
}

export async function quitarDispositivoPush(token: string): Promise<void> {
  if (entorno.usarMock) return;
  const id = encodeURIComponent(await obtenerIdDispositivo());
  await solicitar<boolean>(`/api/movil/push/dispositivo/${id}`, { metodo: 'DELETE', token, manejarSesionInvalida: false });
}
