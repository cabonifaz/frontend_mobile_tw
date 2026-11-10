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
 * Cada una trae `critica`: la prioridad que ya clasifica el Centro de Notificaciones (notificacion.prioridad = critica). Es lo que filtra "Críticas"
 * en la pestaña del jefe y lo que cuenta la tarjeta "Alertas de Campo" del menú de Jefatura (HU-28).
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
  /** HU-10: error crítico de ensayo (le llega al encargado del área). */
  | 'ensayo_critico'
  /** HU-12: evidencia rechazada por la IA que el técnico aceptó con un motivo. */
  | 'evidencia_forzada'
  /** HU-07: equipo NEW registrado en campo, por aprobar. */
  | 'equipo_nuevo'
  | 'servicio_detenido'
  /** Otra alerta operativa del Control de Campo. */
  | 'alerta_campo'
  | 'correlativo'
  /** HU-14: Metrología asignó el correlativo del ticket (abre Mis tickets). */
  | 'correlativo_asignado'
  /** HU-14: confirmación al técnico de que su solicitud de correlativo se envió. */
  | 'correlativo_solicitado'
  /** HU-34: un técnico solicita un correlativo (le llega al Jefe de Metrología). */
  | 'correlativo_solicitud'
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
  /** Prioridad crítica (filtro "Críticas"). */
  critica: boolean;
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
  critica?: boolean | number | null;
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
    critica: !!n.critica,
  };
}

function haceDias(dias: number, hora: string): string {
  const d = new Date();
  d.setDate(d.getDate() - dias);
  const f = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return `${f}T${hora}:00`;
}

const base = { entidadTipo: null, idEntidad: null, pendientesAprobados: null };
type DemoNotificacion = Omit<Notificacion, 'critica'> & { critica?: boolean };
const conCritica = (lista: DemoNotificacion[]): Notificacion[] => lista.map((n) => ({ critica: false, ...n }));
let demo: Notificacion[] | null = null;
let demoJefe: Notificacion[] | null = null;
/** Modo demo: el usuario jefe.* ve las notificaciones del jefe de la maqueta; los demás, las del técnico. */
const esDemoJefe = (token: string) => token.includes('jefe');

/** Notificaciones de la maqueta del jefe (HU-28): lo que dejan HU-10 (ensayo), HU-12 (evidencia forzada), demoras y autorizaciones de salida. */
const demoVigenteJefe = (): Notificacion[] =>
  (demoJefe ??= conCritica([
    { id: 14, tipo: 'ensayo_critico', titulo: 'Ensayo con error crítico', cuerpo: 'OS-000845 · Juan Pérez pide apoyo (pesaje E = 4 kg)',
      fecha: haceDias(0, '11:20'), leida: false, entidadTipo: 'orden_servicio', idEntidad: 845, pendientesAprobados: null, critica: true },
    { id: 13, tipo: 'autorizacion_solicitud', titulo: 'Autorización de salida', cuerpo: 'OS-000851 · Luis Medina · falta EPP',
      fecha: haceDias(0, '07:32'), leida: false, entidadTipo: 'orden_servicio', idEntidad: 851, pendientesAprobados: null },
    { id: 12, tipo: 'demora', titulo: 'Demora en ruta', cuerpo: 'OS-000849 · Ingreso a planta +35 min',
      fecha: haceDias(0, '08:10'), leida: true, entidadTipo: 'orden_servicio', idEntidad: 849, pendientesAprobados: null },
    { id: 11, tipo: 'evidencia_forzada', titulo: 'Evidencia forzada', cuerpo: 'OS-000845 · Placa de identificación',
      fecha: haceDias(0, '10:44'), leida: true, entidadTipo: 'orden_servicio', idEntidad: 845, pendientesAprobados: null },
  ]));

const demoVigente = (): Notificacion[] =>
  (demo ??= conCritica([
    { id: 7, tipo: 'autorizacion_aprobada', titulo: 'Autorización de salida aprobada',
      cuerpo: 'OS-000791 · Cervecería Backus · Jorge Salas (Jefe de Servicio Técnico) dio el visto bueno. Condición: revisar repuestos en planta.',
      fecha: haceDias(0, '07:40'), leida: false, entidadTipo: 'orden_servicio', idEntidad: 791, pendientesAprobados: 'Repuestos asignados, Alerta predictiva' },
    { id: 6, tipo: 'solicitud_enviada', titulo: 'Solicitud de autorización enviada', cuerpo: 'OS-000791 · avisado a Jorge Salas',
      fecha: haceDias(0, '07:12'), leida: false, entidadTipo: 'orden_servicio', idEntidad: 791, pendientesAprobados: null },
    { id: 5, tipo: 'demora', titulo: 'Demora en ruta', cuerpo: 'OS-000790 · Tráfico · 20 min · nueva llegada estimada 10:20',
      fecha: haceDias(0, '09:50'), leida: true, entidadTipo: 'orden_servicio', idEntidad: 790, pendientesAprobados: null },
    { id: 4, tipo: 'correlativo_asignado', titulo: 'Correlativo asignado', cuerpo: 'TK-MET-00241 · BAL-012 · Metrología asignó el correlativo CC-1712-2026.', fecha: haceDias(0, '11:10'), leida: false, ...base, entidadTipo: 'ticket_metrologia', idEntidad: 241 },
    { id: 3, tipo: 'gasto_aprobado', titulo: 'Gasto aprobado', cuerpo: 'Movilidad · S/ 40.00', fecha: haceDias(0, '09:15'), leida: true, ...base },
    { id: 2, tipo: 'servicio', titulo: 'Nueva programación: OS-000795', cuerpo: 'OS-000795 · Gloria S.A. · 27/10 08:00',
      fecha: haceDias(1, '18:20'), leida: true, entidadTipo: 'orden_servicio', idEntidad: 795, pendientesAprobados: null },
    { id: 1, tipo: 'gasto_observado', titulo: 'Gasto observado', cuerpo: 'Peaje · el monto no coincide con el comprobante', fecha: haceDias(1, '16:05'), leida: true, ...base },
  ]));

export async function obtenerNotificaciones(token: string): Promise<Notificacion[]> {
  if (entorno.usarMock) return (esDemoJefe(token) ? demoVigenteJefe() : demoVigente()).map((n) => ({ ...n }));
  const r = await solicitar<NotificacionApi[]>('/api/movil/notificaciones', { token });
  return (r.datos ?? []).map(aNotificacion);
}

/** Marca una notificación como leída en el servidor (solo las propias). */
export async function marcarNotificacionLeida(token: string, id: number): Promise<void> {
  if (entorno.usarMock) {
    if (esDemoJefe(token)) demoJefe = demoVigenteJefe().map((n) => (n.id === id ? { ...n, leida: true } : n));
    else demo = demoVigente().map((n) => (n.id === id ? { ...n, leida: true } : n));
    return;
  }
  await solicitar<{ marcadas: number }>(`/api/movil/notificaciones/${encodeURIComponent(String(id))}/leida`, { token, metodo: 'PUT' });
}

/** Marca todas las no leídas. Devuelve cuántas se marcaron. */
export async function marcarTodasLeidas(token: string): Promise<number> {
  if (entorno.usarMock) {
    const lista = esDemoJefe(token) ? demoVigenteJefe() : demoVigente();
    const pendientes = lista.filter((n) => !n.leida).length;
    if (esDemoJefe(token)) demoJefe = lista.map((n) => ({ ...n, leida: true }));
    else demo = lista.map((n) => ({ ...n, leida: true }));
    return pendientes;
  }
  const r = await solicitar<{ marcadas: number }>('/api/movil/notificaciones/leidas', { token, metodo: 'PUT' });
  return r.datos?.marcadas ?? 0;
}
