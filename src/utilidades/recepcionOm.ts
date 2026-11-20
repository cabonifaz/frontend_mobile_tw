import type { EstadoOm, MedioEntrega } from '@/api/recepcionOm';
import { colores } from '@/tema/colores';

/**
 * HU-23 — Reglas de pantalla de la Recepción de instrumentos (OM): textos, colores y la validación del borrador antes de registrar (los mismos límites que el servidor).
 * Qué OM ve cada técnico, el estado de cada recepción (conforme · observado · parcial) y el registro lo decide el back; aquí solo se avisa qué falta.
 */
export const MIN_FOTOS_RECEPCION = 3;
export const MAX_FOTOS_RECEPCION = 8;
export const MIN_OBSERVACIONES = 10;
export const MAX_OBSERVACIONES = 500;
export const MIN_GUIA = 3;
export const MAX_GUIA = 40;
export const MIN_ENTREGO = 3;
export const MAX_ENTREGO = 120;
export const MAX_CARGO_ENTREGO = 120;
export const MIN_MOTIVO_PARCIAL = 10;
export const MAX_MOTIVO_PARCIAL = 300;
export const MAX_BUSQUEDA = 80;

export const MEDIOS_ENTREGA: { valor: MedioEntrega; texto: string }[] = [
  { valor: 'cliente_taller', texto: 'Cliente en taller' },
  { valor: 'courier', texto: 'Courier' },
  { valor: 'traslado_tw', texto: 'Traslado TW' },
];

export const ACCESORIOS: { codigo: string; texto: string }[] = [
  { codigo: 'caja_original', texto: 'Caja original' },
  { codigo: 'adaptador_corriente', texto: 'Adaptador de corriente' },
  { codigo: 'protector_plato', texto: 'Protector de plato' },
  { codigo: 'manual', texto: 'Manual' },
  { codigo: 'otro', texto: 'Otro' },
];

export const textoAccesorio = (codigo: string): string => ACCESORIOS.find((a) => a.codigo === codigo)?.texto ?? codigo;
export const textoMedio = (m: string | null | undefined): string => MEDIOS_ENTREGA.find((x) => x.valor === m)?.texto ?? '—';

export type EstadoFisico = 'conforme' | 'observado';

export const ESTADOS_FISICOS: { valor: EstadoFisico; texto: string }[] = [
  { valor: 'conforme', texto: 'Conforme' },
  { valor: 'observado', texto: 'Observado' },
];

export function etiquetaOm(estado: EstadoOm | string): { texto: string; fondo: string; color: string } {
  switch (estado) {
    case 'conforme':
      return { texto: 'CONFORME', fondo: colores.verdeEtiquetaFondo, color: colores.verdeEtiquetaTexto };
    case 'observado':
      return { texto: 'OBSERVADO', fondo: colores.rojoEtiquetaFondo, color: colores.rojoEtiquetaTexto };
    case 'parcial':
      return { texto: 'PARCIAL', fondo: colores.amarilloFondo, color: colores.amarilloTexto };
    default:
      return { texto: 'POR RECIBIR', fondo: colores.amarilloFondo, color: colores.amarilloTexto };
  }
}

export function etiquetaFisico(estado: string | null | undefined): { texto: string; fondo: string; color: string } | null {
  if (estado === 'conforme') return { texto: 'CONFORME', fondo: colores.verdeEtiquetaFondo, color: colores.verdeEtiquetaTexto };
  if (estado === 'observado') return { texto: 'OBSERVADO', fondo: colores.rojoEtiquetaFondo, color: colores.rojoEtiquetaTexto };
  return null;
}

/** "2 de 3 recibidos". */
export const textoAvance = (recibidos: number, total: number): string => `${recibidos} de ${total} recibidos`;

/** "3 instrumentos" / "1 instrumento". */
export const textoInstrumentos = (n: number): string => `${n} ${n === 1 ? 'instrumento' : 'instrumentos'}`;

/** "2 de mín. 3" del panel de fotos. */
export const textoFotos = (n: number): string => (n >= MIN_FOTOS_RECEPCION ? `${n} fotos` : `${n} de mín. ${MIN_FOTOS_RECEPCION}`);

/** "yyyy-MM-dd HH:mm" (Lima) → "26/10/2026 10:24"; "HH:mm" se deja igual. */
export function textoFechaHora(valor: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(valor ?? '');
  return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}` : (valor ?? '');
}

export const horaDe = (valor: string | null | undefined): string => /(\d{2}:\d{2})/.exec(valor ?? '')?.[1] ?? '';

// ── Borrador de la recepción (lo que el técnico va llenando) ────────────────────────────────────────

export interface FotoBorrador {
  idFoto: number;
  /** Archivo de la cámara (para mostrar la miniatura); null si la foto se recuperó del servidor. */
  uri: string | null;
}

export interface InstrumentoBorrador {
  estadoFisico: EstadoFisico | null;
  observaciones: string;
  accesorios: string[];
  fotos: FotoBorrador[];
}

export interface Borrador {
  /** Instrumentos (idOsEquipo) que el técnico marcó como recibidos. */
  marcados: number[];
  guia: string;
  medio: MedioEntrega | null;
  entrego: string;
  entregoCargo: string;
  motivoParcial: string;
  instrumentos: Record<number, InstrumentoBorrador>;
}

export const instrumentoVacio = (): InstrumentoBorrador => ({ estadoFisico: null, observaciones: '', accesorios: [], fotos: [] });

export const borradorVacio = (): Borrador => ({ marcados: [], guia: '', medio: null, entrego: '', entregoCargo: '', motivoParcial: '', instrumentos: {} });

/** Lo que falta de un instrumento (estado físico, observaciones y fotos), o null si está completo. */
export function faltaInstrumento(i: InstrumentoBorrador | undefined): string | null {
  if (!i || !i.estadoFisico) return 'Elige el estado físico.';
  const largo = i.observaciones.trim().length;
  if (largo < MIN_OBSERVACIONES) return `Escribe las observaciones (mínimo ${MIN_OBSERVACIONES} caracteres).`;
  if (largo > MAX_OBSERVACIONES) return `Las observaciones no pueden superar los ${MAX_OBSERVACIONES} caracteres.`;
  if (i.fotos.length < MIN_FOTOS_RECEPCION) return `Toma al menos ${MIN_FOTOS_RECEPCION} fotos de recepción (${i.fotos.length} de ${MIN_FOTOS_RECEPCION}).`;
  return null;
}

/** Lo que falta de la trazabilidad de la entrega (guía, medio y quién entrega), o null. */
export function faltaTrazabilidad(b: Pick<Borrador, 'guia' | 'medio' | 'entrego'>): string | null {
  const guia = b.guia.trim().length;
  if (guia < MIN_GUIA) return 'Escribe el N° de guía de remisión.';
  if (guia > MAX_GUIA) return `La guía no puede superar los ${MAX_GUIA} caracteres.`;
  if (!b.medio) return 'Elige el medio de entrega.';
  const entrego = b.entrego.trim().length;
  if (entrego < MIN_ENTREGO) return 'Escribe el nombre de quien entrega.';
  if (entrego > MAX_ENTREGO) return `El nombre de quien entrega no puede superar los ${MAX_ENTREGO} caracteres.`;
  return null;
}

/** Instrumentos marcados que aún no tienen estado físico, observaciones y fotos completos. */
export function instrumentosIncompletos(b: Borrador): number[] {
  return b.marcados.filter((id) => faltaInstrumento(b.instrumentos[id]) !== null);
}

/** ¿Faltan instrumentos de la OM por recibir en esta recepción? (los pendientes que no se marcaron) */
export function pendientesSinMarcar(pendientes: readonly number[], marcados: readonly number[]): number[] {
  return pendientes.filter((id) => !marcados.includes(id));
}

export function faltaMotivoParcial(motivo: string): string | null {
  const n = motivo.trim().length;
  if (n < MIN_MOTIVO_PARCIAL) return `Escribe el motivo de la recepción parcial (mínimo ${MIN_MOTIVO_PARCIAL} caracteres).`;
  if (n > MAX_MOTIVO_PARCIAL) return `El motivo no puede superar los ${MAX_MOTIVO_PARCIAL} caracteres.`;
  return null;
}

/** Estado que tendrá la recepción: parcial si queda algo sin recibir; si no, observado si algún instrumento lo está; si no, conforme. (El servidor lo calcula igual.) */
export function estadoPrevisto(b: Borrador, pendientes: readonly number[]): 'parcial' | 'observado' | 'conforme' {
  if (pendientesSinMarcar(pendientes, b.marcados).length > 0) return 'parcial';
  return b.marcados.some((id) => b.instrumentos[id]?.estadoFisico === 'observado') ? 'observado' : 'conforme';
}

/** Primer motivo por el que todavía no se puede registrar la recepción, o null. `pendientes` = instrumentos de la OM sin recibir. */
export function faltaParaRegistrar(b: Borrador, pendientes: readonly number[], firmada: boolean): string | null {
  if (b.marcados.length === 0) return 'Marca al menos un instrumento recibido.';
  const t = faltaTrazabilidad(b);
  if (t) return t;
  const incompletos = instrumentosIncompletos(b);
  if (incompletos.length > 0) return `Completa el estado físico, las observaciones y las fotos de ${incompletos.length === 1 ? 'un instrumento' : `${incompletos.length} instrumentos`}.`;
  if (pendientesSinMarcar(pendientes, b.marcados).length > 0) {
    const m = faltaMotivoParcial(b.motivoParcial);
    if (m) return m;
  }
  if (!firmada) return 'Falta la firma de quien entrega.';
  return null;
}
