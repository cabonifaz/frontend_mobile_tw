import { entorno } from '@/config/entorno';
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
 * Rendir un gasto desde la app (HU-27) todavía no está disponible: esta pantalla solo muestra lo que registró la intranet.
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
}

export interface ViaticosYGastos {
  resumen: ResumenViaticos;
  viaticos: Viatico[];
  lineas: LineaViatico[];
  gastos: Gasto[];
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
