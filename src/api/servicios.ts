import { entorno } from '@/config/entorno';
import { solicitar } from './cliente';
import { mockPresalida, mockServicios } from './mock';

/**
 * Agenda de servicios programados (HU-03).
 * Backend: GET api/movil/servicios?filtro=&busqueda= → SP_ObtenerServiciosProgramadosMovil
 * Tablas: orden_servicio, os_personal, os_equipo, informe_tecnico, alerta_predictiva,
 *         expediente_digital, expediente_bloqueador, requerimiento, orden_metrologia,
 *         cliente, sede_cliente, usuario.
 */
export type FiltroServicios = 'todos' | 'hoy' | 'pendientes' | 'en_ejecucion';
export type EstadoGeneralServicio = 'LISTO' | 'PENDIENTE' | 'BLOQUEADO';
export type EstadoSsoma = 'habilitado' | 'pendiente' | 'bloqueado';

export interface ServicioProgramado {
  idOs: number;
  numeroOs: string;
  numeroRq: string | null;
  numeroOm: string | null;
  cliente: string | null;
  /** "yyyy-MM-dd" (hora de Lima). */
  fechaEjecucion: string | null;
  /** "HH:mm". */
  horaInicio: string | null;
  /** programada | en_ruta | en_ejecucion | pausada | reprogramada | bloqueada */
  estadoOs: string;
  sede: string | null;
  responsable: string | null;
  objetivosTotal: number;
  objetivosCompletados: number;
  clienteConfirmado: boolean;
  estadoSsoma: EstadoSsoma;
  alertasPredictivas: number;
  estadoGeneral: EstadoGeneralServicio;
  motivoBloqueo: string | null;
}

export async function obtenerServiciosProgramados(
  token: string,
  filtro: FiltroServicios,
  busqueda: string,
): Promise<ServicioProgramado[]> {
  if (entorno.usarMock) return mockServicios.programados(filtro, busqueda);
  const params = new URLSearchParams({ filtro });
  if (busqueda.trim()) params.set('busqueda', busqueda.trim());
  const r = await solicitar<ServicioProgramado[]>(`/api/movil/servicios?${params.toString()}`, { token });
  return r.datos ?? [];
}

// ── HU-04 — Detalle del servicio y checklist de pre-salida ──────────────────
/**
 * Backend (todas validan que la OS sea del técnico del token):
 *   GET  api/movil/servicios/{idOs}                          → SP_ObtenerDetalleServicioMovil
 *   GET  api/movil/servicios/{idOs}/checklist                → SP_ObtenerChecklistSalidaMovil
 *   PUT  api/movil/servicios/{idOs}/checklist/{codigo}       → SP_MarcarChecklistSalidaMovil
 *   POST api/movil/servicios/{idOs}/solicitar-autorizacion   → SP_SolicitarAutorizacionSalidaMovil
 *   POST api/movil/servicios/{idOs}/iniciar-traslado         → SP_IniciarTrasladoMovil
 * El visto bueno lo da desde la intranet (api/operaciones/...) el encargado del área del servicio según la RQ:
 * Jefe de Servicio Técnico o Jefe de Metrología.
 */
export interface ServicioDetalle {
  idOs: number;
  numeroOs: string;
  numeroRq: string | null;
  numeroOm: string | null;
  cliente: string | null;
  idTipoServicio: number;
  tipoServicio: string | null;
  fechaEjecucion: string | null;
  horaInicio: string | null;
  estadoOs: string;
  sede: string | null;
  direccion: string | null;
  contactoNombre: string | null;
  contactoCargo: string | null;
  contactoTelefono: string | null;
  responsable: string | null;
  clienteConfirmado: boolean;
  estadoSsoma: EstadoSsoma;
  objetivosTotal: number;
  notasOperativas: string | null;
}

export interface AlertaServicio {
  idAlerta: number;
  tipo: string | null;
  descripcion: string;
  prioridad: string | null;
  equipo: string | null;
  fechaGeneracion: string | null;
}

export interface RiesgoServicio {
  idRiesgo: number;
  nombre: string | null;
  codigo: string | null;
  icono: string | null;
  observacion: string | null;
}

export interface RepuestoServicio {
  idItem: number;
  descripcion: string;
  asignado: boolean;
}

/** Una modificación con su valor anterior y el actual. */
export interface HistorialServicio {
  fecha: string | null;
  origen: 'equipo' | 'servicio' | string;
  titulo: string | null;
  referencia: string | null;
  valorAnterior: string | null;
  valorNuevo: string | null;
  detalle: string | null;
  usuario: string | null;
}

export interface DocumentoServicio {
  idDocumento: number;
  nombreArchivo: string;
  tipo: string | null;
  version: number;
  fechaCarga: string | null;
}

export interface DetalleServicio {
  servicio: ServicioDetalle;
  alertas: AlertaServicio[];
  riesgos: RiesgoServicio[];
  repuestos: RepuestoServicio[];
  historial: HistorialServicio[];
  documentos: DocumentoServicio[];
}

export type CodigoManual = 'expediente' | 'epp' | 'materiales' | 'herramientas' | 'pesas_patron';
export type EstadoItemChecklist = 'conforme' | 'pendiente' | 'bloqueado' | 'no_aplica' | 'opcional';

export interface ItemChecklist {
  codigo: string;
  nombre: string;
  tipo: 'manual' | 'automatico' | 'autorizacion';
  obligatorio: boolean;
  estado: EstadoItemChecklist;
  detalle: string | null;
  editable: boolean;
}

export interface AutorizacionSalida {
  estado: 'pendiente' | 'aprobada' | 'rechazada';
  jefe: string | null;
  comentario: string | null;
  solicitadaEn: string | null;
  resueltaEn: string | null;
}

/** Quién autoriza la salida según el área de la RQ (codigo null = la RQ no indica área: ambos encargados). */
export interface AreaAutorizaSalida {
  codigo: 'servicio_tecnico' | 'metrologia' | null;
  area: string | null;
  cargo: string | null;
  encargado: string | null;
}

export interface ChecklistSalida {
  idOs: number;
  numeroOs: string;
  cliente: string | null;
  fechaEjecucion: string | null;
  horaInicio: string | null;
  tecnico: string | null;
  estadoOs: string;
  items: ItemChecklist[];
  faltantes: string[];
  puedeIniciar: boolean;
  saleConVistoBueno: boolean;
  puedeSolicitarAutorizacion: boolean;
  trasladoIniciado: boolean;
  autorizacion: AutorizacionSalida | null;
  areaAutoriza: AreaAutorizaSalida | null;
}

/** Resultado de una acción: mensaje del back y el checklist ya actualizado. */
export interface ResultadoChecklist {
  mensaje: string;
  checklist: ChecklistSalida | null;
}

const rutaServicio = (idOs: number) => `/api/movil/servicios/${encodeURIComponent(String(idOs))}`;

export async function obtenerDetalleServicio(token: string, idOs: number): Promise<DetalleServicio> {
  if (entorno.usarMock) return mockPresalida.detalle(idOs);
  const r = await solicitar<DetalleServicio>(rutaServicio(idOs), { token });
  return r.datos!;
}

export async function obtenerChecklistSalida(token: string, idOs: number): Promise<ChecklistSalida> {
  if (entorno.usarMock) return mockPresalida.checklist(idOs);
  const r = await solicitar<ChecklistSalida>(`${rutaServicio(idOs)}/checklist`, { token });
  return r.datos!;
}

export async function marcarItemChecklist(
  token: string,
  idOs: number,
  codigo: CodigoManual,
  confirmado: boolean,
): Promise<ResultadoChecklist> {
  if (entorno.usarMock) return mockPresalida.marcar(idOs, codigo, confirmado);
  const r = await solicitar<ChecklistSalida>(`${rutaServicio(idOs)}/checklist/${codigo}`, {
    token,
    metodo: 'PUT',
    cuerpo: { confirmado },
  });
  return { mensaje: r.mensaje, checklist: r.datos ?? null };
}

export async function solicitarAutorizacionSalida(token: string, idOs: number, motivo: string): Promise<ResultadoChecklist> {
  if (entorno.usarMock) return mockPresalida.solicitar(idOs);
  const r = await solicitar<ChecklistSalida>(`${rutaServicio(idOs)}/solicitar-autorizacion`, {
    token,
    metodo: 'POST',
    cuerpo: { motivo: motivo.trim() || null },
  });
  return { mensaje: r.mensaje, checklist: r.datos ?? null };
}

export async function iniciarTraslado(token: string, idOs: number): Promise<ResultadoChecklist> {
  if (entorno.usarMock) return mockPresalida.iniciar(idOs);
  const r = await solicitar<ChecklistSalida>(`${rutaServicio(idOs)}/iniciar-traslado`, { token, metodo: 'POST' });
  return { mensaje: r.mensaje, checklist: r.datos ?? null };
}
