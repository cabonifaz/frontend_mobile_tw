import { entorno } from '@/config/entorno';
import { agregarArchivo } from './archivosLocales';
import { solicitar } from './cliente';
import { mockViaticos } from './mockViaticos';

/**
 * HU-25 Rendición de viáticos · HU-26 Solicitudes de gastos (lectura).
 * Backend: GET api/movil/viaticos → SP_ObtenerViaticosMovil (reglas en SP_ObtenerViaticosUsuarioMovil).
 * Tablas: gasto_viatico, programacion, programacion_rendicion, orden_servicio, cliente, sede_cliente, tabla_maestra (CONCEPTO_GASTO, MONEDA).
 *
 * Modelo de la intranet (Gestionar Viáticos, HU-45): el Jefe de Operaciones asigna al programar un adelanto por técnico y
 * concepto (el "viático"); el técnico rinde sus gastos y el Jefe los aprueba, observa o rechaza.
 *  - Depositado  : el viático asignado ya lo depositó Contabilidad (se marca en la intranet).
 *  - Rendido     : gastos que no fueron rechazados. Por rendir = asignado - rendido.
 *  - Activo      : la rendición de esa programación aún no se cerró. Finalizado = rendición cerrada (con saldo final).
 * HU-27: rendir un gasto (del adelanto con reparto, o reembolso), corregir uno observado y pedir sus fotos (POST/PUT api/movil/viaticos/gastos).
 */
export interface ResumenViaticos {
  /** Suma de lo que falta rendir en los viáticos activos. */
  saldoPorRendir: number;
  viaticosActivos: number;
  viaticosFinalizados: number;
  /** Gastos esperando la revisión del Jefe de Operaciones (monto y cantidad). */
  gastosEnRevision: number;
  gastosEnRevisionCantidad: number;
  gastosObservadosCantidad: number;
}

export type TipoSaldo = 'reembolso' | 'devolucion' | 'cuadrado';

/** Un viático = el adelanto de una programación para este técnico. */
export interface Viatico {
  idProgramacion: number;
  /** PRG-2026-0012 */
  codigo: string;
  estadoProgramacion: string;
  estadoProgramacionLabel: string;
  /** true = rendición cerrada (finalizado). */
  cerrado: boolean;
  idOs: number;
  numeroOs: string;
  cliente: string | null;
  sede: string | null;
  /** "yyyy-MM-dd" (hora de Lima). */
  fechaEjecucion: string | null;
  horaInicio: string | null;
  horaFin: string | null;
  asignado: number;
  depositado: number;
  pendienteDeposito: number;
  rendido: number;
  porRendir: number;
  porcentajeRendido: number;
  cerradoEn: string | null;
  /** Solo con rendición cerrada: aprobado - asignado. */
  saldoFinal: number | null;
  tipoSaldo: TipoSaldo | null;
}

/** Adelanto de un concepto dentro de un viático. */
export interface LineaViatico {
  idProgramacion: number;
  idConcepto: number;
  concepto: string;
  asignado: number;
  depositado: number;
  /** "yyyy-MM-dd" cuando Contabilidad lo depositó. */
  fechaDeposito: string | null;
  rendido: number;
  porRendir: number;
  estadoDeposito: 'depositado' | 'pendiente';
  /** La línea a usar en el reparto al rendir un gasto (HU-27). */
  idViaticoLinea?: number;
}

export type EstadoGasto = 'pendiente' | 'aprobado' | 'observado' | 'rechazado';

/** Gasto rendido por el técnico (lo revisa el Jefe de Operaciones en la intranet). */
export interface Gasto {
  idGasto: number;
  /** GS-000318 */
  codigo: string;
  /** "yyyy-MM-dd": cuándo gastó. */
  fecha: string | null;
  idConcepto: number;
  concepto: string;
  monto: number;
  moneda: string;
  descripcion: string | null;
  estado: EstadoGasto;
  /** Observación o motivo de rechazo del Jefe. */
  comentarioRevision: string | null;
  revisadoPor: string | null;
  /** "yyyy-MM-ddTHH:mm:ss" (hora de Lima). */
  revisadoEn: string | null;
  creadoEn: string | null;
  tieneComprobante: boolean;
  idOs: number;
  numeroOs: string;
  idProgramacion: number | null;
  codigoProgramacion: string | null;
  /** viatico | reembolso (null = gasto anterior a HU-27). */
  origen?: 'viatico' | 'reembolso' | null;
  /** El texto del concepto cuando es "Otro". */
  conceptoTexto?: string | null;
  motivoSinFoto?: string | null;
  /** Total que leyó la IA en la primera foto y si coincide con el monto declarado. */
  montoIa?: number | null;
  coincideIa?: boolean | null;
  nFotos?: number;
}

/** Una parte de un gasto rendida contra una línea del adelanto. */
export interface RepartoGasto {
  idGasto: number;
  idViaticoLinea: number;
  concepto: string;
  monto: number;
}

export interface FotoGasto {
  idGasto: number;
  /** n de la foto (1 a 5). */
  orden: number;
}

export interface ViaticosYGastos {
  resumen: ResumenViaticos;
  viaticos: Viatico[];
  lineas: LineaViatico[];
  gastos: Gasto[];
  repartos?: RepartoGasto[];
  fotos?: FotoGasto[];
}

const vacio: ViaticosYGastos = {
  resumen: {
    saldoPorRendir: 0,
    viaticosActivos: 0,
    viaticosFinalizados: 0,
    gastosEnRevision: 0,
    gastosEnRevisionCantidad: 0,
    gastosObservadosCantidad: 0,
  },
  viaticos: [],
  lineas: [],
  gastos: [],
};

export async function obtenerViaticos(token: string): Promise<ViaticosYGastos> {
  if (entorno.usarMock) return mockViaticos.obtener();
  const r = await solicitar<ViaticosYGastos>('/api/movil/viaticos', { token });
  return r.datos ?? vacio;
}

// ── HU-27 — Rendir un gasto o corregir uno observado ───────────────────────────────────────

/** Concepto del catálogo de la intranet para un reembolso. esOtro: la app pide el texto del concepto. */
export interface ConceptoGasto {
  idConcepto: number;
  concepto: string;
  esOtro: boolean;
}

export async function obtenerConceptosGasto(token: string): Promise<ConceptoGasto[]> {
  if (entorno.usarMock) return mockViaticos.conceptos();
  const r = await solicitar<ConceptoGasto[]>('/api/movil/viaticos/conceptos', { token });
  return r.datos ?? [];
}

/** Campo "datos" del multipart (mismo formato que el back). */
export interface EntradaGasto {
  /** GUID de la app: un reintento con el mismo valor no duplica el gasto. */
  idCliente: string;
  origen: 'viatico' | 'reembolso';
  idOs: number;
  idConcepto?: number;
  conceptoTexto?: string;
  monto: number;
  /** yyyy-MM-dd */
  fechaGasto: string;
  descripcion?: string;
  reparto?: { idViaticoLinea: number; monto: number }[];
  motivoSinFoto?: string;
  /** Solo al corregir: el orden de las fotos que se quedan. */
  fotosConservar?: number[];
}

export interface ResultadoGasto {
  idGasto: number;
  codigo: string;
  estado: string;
  /** El idCliente ya existía (un reintento): no se creó otro gasto. */
  duplicado: boolean;
  advertencias: string[];
  montoIa: number | null;
  coincideIa: boolean | null;
}

/** Rinde un gasto nuevo (idGasto = 0, POST) o corrige uno observado (PUT). Las fotos son JPEG de la cámara de la app. */
export async function enviarGasto(token: string, idGasto: number, entrada: EntradaGasto, fotos: string[]): Promise<{ mensaje: string; resultado: ResultadoGasto }> {
  if (entorno.usarMock) return mockViaticos.enviar(entrada, fotos.length);
  const form = new FormData();
  form.append('datos', JSON.stringify(entrada));
  for (let i = 0; i < fotos.length; i++) await agregarArchivo(form, 'fotos', fotos[i], `comprobante-${i + 1}.jpg`, 'image/jpeg');
  const ruta = idGasto > 0 ? `/api/movil/viaticos/gastos/${idGasto}` : '/api/movil/viaticos/gastos';
  const r = await solicitar<ResultadoGasto>(ruta, { token, metodo: idGasto > 0 ? 'PUT' : 'POST', cuerpo: form });
  return { mensaje: r.mensaje, resultado: r.datos as ResultadoGasto };
}

/** Dirección de la foto n de un gasto propio (se pide con el token en la cabecera Authorization). */
export function urlFotoGasto(idGasto: number, n: number): string {
  return `${entorno.apiUrl}/api/movil/viaticos/gastos/${idGasto}/fotos/${n}`;
}
