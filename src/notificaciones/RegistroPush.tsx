import { useEffect, useRef } from 'react';
import { router } from 'expo-router';
import { registrarDispositivoPush } from '@/api/push';
import { useSesion } from '@/sesion/SesionContext';
import { moduloNotificaciones, obtenerTokenPush, prepararNotificaciones } from './notificacionesPush';

prepararNotificaciones();

/**
 * Notificaciones push, sin pantalla propia:
 *  1. Con la sesión iniciada pide el permiso de notificaciones (una vez), toma el token de este teléfono y se lo entrega al servidor, que desde
 *     ese momento manda cada aviso nuevo a la bandeja de notificaciones del teléfono (aunque la app esté cerrada). Si no hay permiso o Firebase
 *     no está configurado en el APK, la app funciona igual y los avisos se ven al abrirla (pestaña Notificaciones).
 *  2. Al tocar un aviso de la bandeja del teléfono (con la app abierta, en segundo plano o cerrada) abre la pestaña Notificaciones.
 * Al cerrar sesión el token se da de baja (SesionContext.cerrarSesion); el servidor además solo envía a quien tiene la sesión vigente.
 */
export function RegistroPush() {
  const { sesion } = useSesion();
  const token = sesion?.token ?? null;
  const puedeUsarApp = !!sesion && !sesion.usuario.forzarCambioContrasena;
  const tokenRegistrado = useRef<string | null>(null);

  // Registra el teléfono una vez por sesión
  useEffect(() => {
    if (!token || !puedeUsarApp || tokenRegistrado.current === token) return;
    tokenRegistrado.current = token;
    let vigente = true;
    (async () => {
      const tokenPush = await obtenerTokenPush();
      if (!vigente || !tokenPush) return;
      try {
        await registrarDispositivoPush(token, tokenPush);
      } catch {
        // sin conexión o el servidor aún sin la tabla: se reintenta la próxima vez que se abra la app
        if (vigente) tokenRegistrado.current = null;
      }
    })();
    return () => {
      vigente = false;
    };
  }, [token, puedeUsarApp]);

  // Tocar un aviso de la bandeja del teléfono abre Notificaciones
  useEffect(() => {
    const N = moduloNotificaciones();
    if (!N || !puedeUsarApp) return;

    const abrir = () => router.navigate('/notificaciones');

    // App cerrada: el aviso que la abrió
    const inicial = N.getLastNotificationResponse();
    if (inicial) {
      N.clearLastNotificationResponse();
      abrir();
    }

    const suscripcion = N.addNotificationResponseReceivedListener(() => {
      N.clearLastNotificationResponse();
      abrir();
    });
    return () => suscripcion.remove();
  }, [puedeUsarApp]);

  return null;
}
