import { entorno } from '@/config/entorno';
import { solicitar } from './cliente';
import { mockJefatura } from './mockJefatura';
import type { ItemChecklist } from './servicios';

/**
 * HU-31 — Centro de aprobaciones del Jefe de Metrología.
 * Backend: GET api/movil/aprobaciones · GET/PUT api/movil/aprobaciones/salidas/{idOs}
 *   → SP_ObtenerAutorizacionesSalida, SP_ObtenerChecklistSalidaMovil (el checklist del técnico) y SP_ResolverAutorizacionSalida.
 * Hoy reúne las solicitudes de salida de los técnicos (HU-04). Las evidencias forzadas, los ensayos con error y los gastos se
 * suman cuando existan sus módulos (la lista `tipos` dice qué hay). Solo ve las de su área según la RQ.
 */
export type TipoAprobacion = 'salida' | 'llegada' | 'evidencia' | 'ensayo' | 'gasto';

export interface Aprobacion {
  tipo: TipoAprobacion;
  /** Id de la OS (la salida se resuelve por OS). */
  id: number;
  titulo: string;
  numeroOs: string;
  tecnico: string | null;
  cliente: string | null;
  /** "falta: EPP revisado, Alerta predictiva" */
  detalle: string | null;
  /** "yyyy-MM-dd" */
  fechaEjecucion: string | null;
  horaInicio: string | null;
  /** El servicio es de hoy: el técnico está por salir. */
  urgente: boolean;
  /** "yyyy-MM-ddTHH:mm:ss" (hora de Lima). */
  solicitadaEn: string | null;
}

export interface BandejaAprobaciones {
  total: number;
  urgentes: number;
  tipos: { tipo: TipoAprobacion; cantidad: number }[];
  items: Aprobacion[];
}

export interface SolicitudSalida {
  idAutorizacion: number;
  idOs: number;
  numeroOs: string;
  cliente: string | null;
  fechaEjecucion: string | null;
  horaInicio: string | null;
  estadoOs: string;
  tecnico: string | null;
  /** Motivo que escribió el técnico al pedir el visto bueno. */
  motivo: string | null;
  pendientes: string | null;
  /** pendiente | aprobada | rechazada */
  estado: 'pendiente' | 'aprobada' | 'rechazada';
  areaCodigo: string | null;
  area: string | null;
  solicitadaEn: string | null;
  jefe: string | null;
  resueltaEn: string | null;
  comentario: string | null;
}

export interface AprobacionSalida {
  solicitud: SolicitudSalida;
  /** Checklist del técnico (sin el ítem del visto bueno). */
  items: ItemChecklist[];
  faltantes: string[];
  areaAutoriza: string | null;
}

/** HU-06: solicitud de llegada forzada (el técnico fuera del radio pide registrar su llegada). */
export interface SolicitudLlegada {
  idSolicitud: number;
  idOs: number;
  numeroOs: string;
  cliente: string | null;
  sede: string | null;
  tecnico: string | null;
  estado: 'pendiente' | 'aprobada' | 'rechazada';
  motivo: string | null;
  /** Veces que volvió a capturar su ubicación estando fuera del rango. */
  intentos: number;
  latitud: number | null;
  longitud: number | null;
  precisionMetros: number | null;
  distanciaMetros: number | null;
  latPlanta: number | null;
  lonPlanta: number | null;
  radioMetros: number;
  area: string | null;
  solicitadaEn: string | null;
  jefe: string | null;
  resueltaEn: string | null;
  comentario: string | null;
}

export async function obtenerAprobaciones(token: string): Promise<BandejaAprobaciones> {
  if (entorno.usarMock) return mockJefatura.aprobaciones();
  const r = await solicitar<BandejaAprobaciones>('/api/movil/aprobaciones', { token });
  return r.datos ?? { total: 0, urgentes: 0, tipos: [], items: [] };
}

export async function obtenerAprobacionSalida(token: string, idOs: number): Promise<AprobacionSalida> {
  if (entorno.usarMock) return mockJefatura.salida(idOs);
  const r = await solicitar<AprobacionSalida>(`/api/movil/aprobaciones/salidas/${encodeURIComponent(String(idOs))}`, { token });
  return r.datos!;
}

/** Autoriza con una condición (aprobar = true) o rechaza con un motivo (aprobar = false). El texto es obligatorio. */
export async function resolverAprobacionSalida(token: string, idOs: number, aprobar: boolean, texto: string): Promise<string> {
  if (entorno.usarMock) return mockJefatura.resolver(idOs, aprobar);
  const r = await solicitar<boolean>(`/api/movil/aprobaciones/salidas/${encodeURIComponent(String(idOs))}`, {
    token,
    metodo: 'PUT',
    cuerpo: { aprobar, comentario: texto.trim() },
  });
  return r.mensaje;
}

/** GET api/movil/aprobaciones/llegadas/{idOs} → SP_ObtenerLlegadasForzadas (la solicitud más reciente de la OS). */
export async function obtenerAprobacionLlegada(token: string, idOs: number): Promise<SolicitudLlegada> {
  if (entorno.usarMock) throw new Error('Sin datos de demostración para la llegada forzada.');
  const r = await solicitar<SolicitudLlegada>(`/api/movil/aprobaciones/llegadas/${encodeURIComponent(String(idOs))}`, { token });
  return r.datos!;
}

/** PUT api/movil/aprobaciones/llegadas/{idOs} → SP_ResolverLlegadaForzada. El texto es obligatorio (condición al autorizar, motivo al rechazar). */
export async function resolverAprobacionLlegada(token: string, idOs: number, aprobar: boolean, texto: string): Promise<string> {
  if (entorno.usarMock) return aprobar ? 'Llegada autorizada.' : 'Llegada no autorizada.';
  const r = await solicitar<boolean>(`/api/movil/aprobaciones/llegadas/${encodeURIComponent(String(idOs))}`, {
    token,
    metodo: 'PUT',
    cuerpo: { aprobar, comentario: texto.trim() },
  });
  return r.mensaje;
}
