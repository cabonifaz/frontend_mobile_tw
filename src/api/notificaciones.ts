import { entorno } from '@/config/entorno';
import { tipoNotificacion } from '@/utilidades/notificaciones';
import { solicitar } from './cliente';

/**
 * Notificaciones del técnico (pestaña Notificaciones, HU-02 / HU-04).
 * Backend (el usuario sale del token):
 *   GET api/movil/notificaciones              → SP_ObtenerNotificacionesMovil (las 60 más recientes, con el tipo ya clasificado)
 *   PUT api/movil/notificaciones/{id}/leida   → SP_MarcarNotificacionMovil (solo las propias)
 *   PUT api/movil/notificaciones/leidas       → SP_MarcarNotificacionMovil con id 0 (todas las no leídas)
 * Tablas: notificacion, autorizacion_salida_os.
 */
export type TipoNotificacion =
  | 'autorizacion_aprobada'
  | 'autorizacion_rechazada'
  | 'autorizacion_solicitud'
  | 'solicitud_enviada'
  | 'gasto_aprobado'
  | 'gasto_observado'
  | 'gasto_rechazado'
  | 'servicio'
  | 'demora'
  | 'correlativo'
  | 'general';

export interface Notificacion {
  id: number;
  tipo: TipoNotificacion;
  titulo: string;
  cuerpo: string;
  /** ISO 8601 (hora de Lima). */
  fecha: string;
  leida: boolean;
  /** "orden_servicio" = `idEntidad` es la OS (la tarjeta abre ese servicio). */
  entidadTipo: string | null;
  idEntidad: number | null;
  /** Solo en `autorizacion_aprobada`: los pendientes con los que el jefe autorizó la salida ("A, B"). */
  pendientesAprobados: string | null;
}

/** Forma que envía el back (NotificacionMovilDto). */
interface NotificacionApi {
  idNotificacion: number;
  tipo: string;
  titulo: string;
  cuerpo: string;
  entidadTipo?: string | null;
  idEntidad?: number | null;
  leida: boolean;
  fecha?: string | null;
  pendientesAprobados?: string | null;
}

export function aNotificacion(n: NotificacionApi): Notificacion {
  return {
    id: n.idNotificacion,
    tipo: tipoNotificacion(n.tipo),
    titulo: n.titulo,
    cuerpo: n.cuerpo,
    fecha: n.fecha ?? '',
    leida: !!n.leida,
    entidadTipo: n.entidadTipo ?? null,
    idEntidad: n.idEntidad ?? null,
    pendientesAprobados: n.pendientesAprobados ?? null,
  };
}

function haceDias(dias: number, hora: string): string {
  const d = new Date();
  d.setDate(d.getDate() - dias);
  const f = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return `${f}T${hora}:00`;
}

const base = { entidadTipo: null, idEntidad: null, pendientesAprobados: null };
let demo: Notificacion[] | null = null;
const demoVigente = (): Notificacion[] =>
  (demo ??= [
    { id: 7, tipo: 'autorizacion_aprobada', titulo: 'Autorización de salida aprobada',
      cuerpo: 'OS-000791 · Cervecería Backus · Jorge Salas (Jefe de Servicio Técnico) dio el visto bueno. Condición: revisar repuestos en planta.',
      fecha: haceDias(0, '07:40'), leida: false, entidadTipo: 'orden_servicio', idEntidad: 791, pendientesAprobados: 'Repuestos asignados, Alerta predictiva' },
    { id: 6, tipo: 'solicitud_enviada', titulo: 'Solicitud de autorización enviada', cuerpo: 'OS-000791 · avisado a Jorge Salas',
      fecha: haceDias(0, '07:12'), leida: false, entidadTipo: 'orden_servicio', idEntidad: 791, pendientesAprobados: null },
    { id: 5, tipo: 'demora', titulo: 'Demora en ruta', cuerpo: 'OS-000790 · Tráfico · 20 min · nueva llegada estimada 10:20',
      fecha: haceDias(0, '09:50'), leida: true, entidadTipo: 'orden_servicio', idEntidad: 790, pendientesAprobados: null },
    { id: 4, tipo: 'correlativo', titulo: 'Correlativo despachado', cuerpo: 'TK-MET-00241 → CC-2026-01458', fecha: haceDias(0, '11:10'), leida: false, ...base },
    { id: 3, tipo: 'gasto_aprobado', titulo: 'Gasto aprobado', cuerpo: 'Movilidad · S/ 40.00', fecha: haceDias(0, '09:15'), leida: true, ...base },
    { id: 2, tipo: 'servicio', titulo: 'Nueva programación: OS-000795', cuerpo: 'OS-000795 · Gloria S.A. · 27/10 08:00',
      fecha: haceDias(1, '18:20'), leida: true, entidadTipo: 'orden_servicio', idEntidad: 795, pendientesAprobados: null },
    { id: 1, tipo: 'gasto_observado', titulo: 'Gasto observado', cuerpo: 'Peaje · el monto no coincide con el comprobante', fecha: haceDias(1, '16:05'), leida: true, ...base },
  ]);

export async function obtenerNotificaciones(token: string): Promise<Notificacion[]> {
  if (entorno.usarMock) return demoVigente().map((n) => ({ ...n }));
  const r = await solicitar<NotificacionApi[]>('/api/movil/notificaciones', { token });
  return (r.datos ?? []).map(aNotificacion);
}

/** Marca una notificación como leída en el servidor (solo las propias). */
export async function marcarNotificacionLeida(token: string, id: number): Promise<void> {
  if (entorno.usarMock) {
    demo = demoVigente().map((n) => (n.id === id ? { ...n, leida: true } : n));
    return;
  }
  await solicitar<{ marcadas: number }>(`/api/movil/notificaciones/${encodeURIComponent(String(id))}/leida`, { token, metodo: 'PUT' });
}

/** Marca todas las no leídas. Devuelve cuántas se marcaron. */
export async function marcarTodasLeidas(token: string): Promise<number> {
  if (entorno.usarMock) {
    const pendientes = demoVigente().filter((n) => !n.leida).length;
    demo = demoVigente().map((n) => ({ ...n, leida: true }));
    return pendientes;
  }
  const r = await solicitar<{ marcadas: number }>('/api/movil/notificaciones/leidas', { token, metodo: 'PUT' });
  return r.datos?.marcadas ?? 0;
}
