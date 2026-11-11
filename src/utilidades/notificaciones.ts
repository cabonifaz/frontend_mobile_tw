import type { Notificacion, TipoNotificacion } from '@/api/notificaciones';

/** Tipos que clasifica el back (SP_ObtenerNotificacionesMovil). Uno desconocido se muestra como aviso general. */
const TIPOS: readonly TipoNotificacion[] = [
  'autorizacion_aprobada',
  'autorizacion_rechazada',
  'autorizacion_solicitud',
  'solicitud_enviada',
  'llegada_forzada_solicitud',
  'llegada_forzada_aprobada',
  'llegada_forzada_rechazada',
  'gasto_aprobado',
  'gasto_observado',
  'gasto_rechazado',
  'servicio',
  'demora',
  'ensayo_critico',
  'evidencia_forzada',
  'equipo_nuevo',
  'servicio_detenido',
  'alerta_campo',
  'correlativo',
  'correlativo_asignado',
  'correlativo_solicitado',
  'correlativo_solicitud',
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
  pantalla: 'servicio' | 'aprobacion' | 'aprobacion_llegada' | 'llegada' | 'gastos' | 'tickets' | 'correlativos';
  /** Id de la OS (servicio y aprobación). */
  idOs?: number;
  etiqueta: string;
}

/**
 * `jefatura` = quien mira es un jefe de área: "Ir al servicio" abre el detalle del servicio del TÉCNICO (solo de sus OS asignadas), así que al jefe no se
 * le ofrece en los avisos de servicio y demora (lo llevaría a un error "no asignado a tu usuario"). Sus avisos de ensayo crítico, evidencia forzada,
 * equipo nuevo y alertas no tienen pantalla propia en la app todavía: solo se marcan como leídos.
 */
export function destinoNotificacion(n: Pick<Notificacion, 'tipo' | 'entidadTipo' | 'idEntidad'>, jefatura = false): DestinoNotificacion | null {
  const idOs = n.entidadTipo === 'orden_servicio' && n.idEntidad ? n.idEntidad : null;
  switch (n.tipo) {
    case 'autorizacion_aprobada':
    case 'autorizacion_rechazada':
    case 'solicitud_enviada':
    case 'servicio':
    case 'demora':
      return idOs && !jefatura ? { pantalla: 'servicio', idOs, etiqueta: 'Ir al servicio' } : null;
    // HU-06: el jefe abre la solicitud; el técnico vuelve a Registrar llegada (donde ve la respuesta)
    case 'llegada_forzada_solicitud':
      return idOs && jefatura ? { pantalla: 'aprobacion_llegada', idOs, etiqueta: 'Revisar solicitud' } : null;
    case 'llegada_forzada_aprobada':
    case 'llegada_forzada_rechazada':
      return idOs && !jefatura ? { pantalla: 'llegada', idOs, etiqueta: 'Ir a registrar llegada' } : null;
    case 'autorizacion_solicitud':
      return idOs ? { pantalla: 'aprobacion', idOs, etiqueta: 'Revisar solicitud' } : null;
    // HU-14: el técnico abre Mis tickets; HU-34: el Jefe de Metrología abre Correlativos (solo si lo mira como jefe)
    case 'correlativo':
    case 'correlativo_asignado':
    case 'correlativo_solicitado':
      return jefatura ? null : { pantalla: 'tickets', etiqueta: 'Ver ticket' };
    case 'correlativo_solicitud':
      return jefatura ? { pantalla: 'correlativos', etiqueta: 'Atender solicitud' } : null;
    case 'gasto_aprobado':
    case 'gasto_observado':
    case 'gasto_rechazado':
      return { pantalla: 'gastos', etiqueta: 'Ver mis gastos' };
    default:
      return null;
  }
}

/** Filtros de la pestaña Notificaciones: Todas, No leídas y Críticas (esta última solo para el jefe). */
export type FiltroNotificaciones = 'todas' | 'no-leidas' | 'criticas';

export function filtrarNotificaciones(lista: readonly Notificacion[], filtro: FiltroNotificaciones): Notificacion[] {
  if (filtro === 'no-leidas') return lista.filter((n) => !n.leida);
  if (filtro === 'criticas') return lista.filter((n) => n.critica);
  return [...lista];
}

/** El filtro con el que se abre la pestaña: "Alertas de Campo" llega con `?filtro=criticas`; cualquier otro valor, Todas. */
export function filtroInicial(parametro: string | string[] | undefined): FiltroNotificaciones {
  const v = Array.isArray(parametro) ? parametro[0] : parametro;
  return v === 'criticas' ? 'criticas' : 'todas';
}

/** El título que se muestra: el aviso de ensayo crítico se llama como en la maqueta; los demás conservan el texto del servidor. */
export function tituloNotificacion(n: Pick<Notificacion, 'tipo' | 'titulo'>): string {
  return n.tipo === 'ensayo_critico' ? 'Error crítico en ensayo' : n.titulo;
}

/** Marca como leídas las notificaciones cuyo id está en `leidas` (estado local mientras el back confirma). */
export function conLeidas(lista: readonly Notificacion[], leidas: ReadonlySet<number>): Notificacion[] {
  return lista.map((n) => (leidas.has(n.id) ? { ...n, leida: true } : n));
}
