import type { Notificacion, TipoNotificacion } from '@/api/notificaciones';

/** Tipos que clasifica el back (SP_ObtenerNotificacionesMovil). Uno desconocido se muestra como aviso general. */
const TIPOS: readonly TipoNotificacion[] = [
  'autorizacion_aprobada',
  'autorizacion_rechazada',
  'autorizacion_solicitud',
  'solicitud_enviada',
  'gasto_aprobado',
  'gasto_observado',
  'gasto_rechazado',
  'servicio',
  'demora',
  'correlativo',
  'general',
];

export function tipoNotificacion(valor: string | null | undefined): TipoNotificacion {
  const v = (valor ?? '').trim().toLowerCase();
  return TIPOS.find((t) => t === v) ?? 'general';
}

/** "Repuestos asignados, Alerta predictiva" → ["Repuestos asignados", "Alerta predictiva"] (el back los guarda separados por coma). */
export function pendientesComoLista(texto: string | null | undefined): string[] {
  return (texto ?? '')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
}

/** A qué pantalla lleva la tarjeta de una notificación. */
export interface DestinoNotificacion {
  pantalla: 'servicio' | 'aprobacion' | 'gastos';
  /** Id de la OS (servicio y aprobación). */
  idOs?: number;
  etiqueta: string;
}

export function destinoNotificacion(n: Pick<Notificacion, 'tipo' | 'entidadTipo' | 'idEntidad'>): DestinoNotificacion | null {
  const idOs = n.entidadTipo === 'orden_servicio' && n.idEntidad ? n.idEntidad : null;
  switch (n.tipo) {
    case 'autorizacion_aprobada':
    case 'autorizacion_rechazada':
    case 'solicitud_enviada':
    case 'servicio':
    case 'demora':
      return idOs ? { pantalla: 'servicio', idOs, etiqueta: 'Ir al servicio' } : null;
    case 'autorizacion_solicitud':
      return idOs ? { pantalla: 'aprobacion', idOs, etiqueta: 'Revisar solicitud' } : null;
    case 'gasto_aprobado':
    case 'gasto_observado':
    case 'gasto_rechazado':
      return { pantalla: 'gastos', etiqueta: 'Ver mis gastos' };
    default:
      return null;
  }
}

/** Marca como leídas las notificaciones cuyo id está en `leidas` (estado local mientras el back confirma). */
export function conLeidas(lista: readonly Notificacion[], leidas: ReadonlySet<number>): Notificacion[] {
  return lista.map((n) => (leidas.has(n.id) ? { ...n, leida: true } : n));
}
