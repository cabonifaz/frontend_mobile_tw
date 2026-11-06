import type { ContextoDemoras, DemoraRegistrada, MotivoDemora, TipoDemora } from '@/api/ruta';
import { horaDe, sumarMinutos } from './formato';

/** Duración de una demora (el back valida lo mismo: SP_RegistrarDemoraMovil). */
export const MIN_DEMORA = 1;
export const MAX_DEMORA = 480;
export const MAX_DESCRIPCION_DEMORA = 500;

export interface TiposDisponibles {
  llegada: boolean;
  ingreso: boolean;
}

/**
 * Qué tipos de demora se pueden registrar ahora. Son excluyentes (antes de llegar: "llegada"; ya en planta sin iniciar el trabajo: "ingreso").
 * Un back anterior solo enviaba `puedeRegistrar` y solo conocía las demoras de llegada.
 */
export function tiposDisponibles(c: Pick<ContextoDemoras, 'puedeRegistrar' | 'puedeLlegada' | 'puedeIngreso'>): TiposDisponibles {
  return { llegada: c.puedeLlegada ?? c.puedeRegistrar, ingreso: c.puedeIngreso ?? false };
}

/** El tipo con el que abre el formulario: el que se puede registrar (llegada primero). Nulo si no hay ninguno. */
export function tipoInicial(d: TiposDisponibles): TipoDemora | null {
  return d.llegada ? 'llegada' : d.ingreso ? 'ingreso' : null;
}

/** Motivos del catálogo que valen para el tipo: ámbito traslado → llegada, ingreso → ingreso; vacío o "ambos" → los dos. */
export function motivosDelTipo(motivos: readonly MotivoDemora[], tipo: TipoDemora): MotivoDemora[] {
  return motivos.filter((m) => {
    const ambito = (m.ambito ?? '').toString().trim().toLowerCase();
    if (ambito === 'traslado') return tipo === 'llegada';
    if (ambito === 'ingreso') return tipo === 'ingreso';
    return true;
  });
}

/** "15" → 15; vacío, "0", "481" o con letras → null (el rango es el del back: 1 a 480 minutos). */
export function minutosValidos(texto: string): number | null {
  if (!/^\d{1,3}$/.test(texto.trim())) return null;
  const n = Number.parseInt(texto, 10);
  return n >= MIN_DEMORA && n <= MAX_DEMORA ? n : null;
}

export interface FilaImpacto {
  etiqueta: string;
  valor: string;
  tono?: 'normal' | 'tenue' | 'alerta';
}

/**
 * Panel "Impacto estimado" mientras se escribe la duración.
 *  - llegada: ETA original (hora programada) + demoras anteriores → ETA recalculada = ETA vigente + minutos.
 *  - ingreso: llegada a planta e inicio previsto del trabajo → inicio recalculado = inicio previsto + minutos.
 * El servidor recalcula con su hora al registrar: esto es solo la vista previa.
 */
export function impactoDemora(c: ContextoDemoras, tipo: TipoDemora, minutos: number | null): FilaImpacto[] {
  if (tipo === 'llegada') {
    const nueva = minutos === null ? null : sumarMinutos(c.etaVigente, minutos);
    return [
      { etiqueta: 'ETA original', valor: horaDe(c.etaOriginal) },
      ...(c.minutosDemora > 0 ? [{ etiqueta: 'Demoras anteriores', valor: `+${c.minutosDemora} min`, tono: 'tenue' as const }] : []),
      { etiqueta: 'ETA recalculada', valor: nueva ? horaDe(nueva) : '—', tono: 'alerta' },
    ];
  }
  const base = c.inicioPrevisto ?? c.ahora;
  const nuevo = minutos === null ? null : sumarMinutos(base, minutos);
  return [
    ...(c.llegadaEn ? [{ etiqueta: 'Llegada a planta', valor: horaDe(c.llegadaEn) }] : []),
    { etiqueta: 'Inicio previsto', valor: horaDe(base) },
    { etiqueta: 'Inicio recalculado', valor: nuevo ? horaDe(nuevo) : '—', tono: 'alerta' },
  ];
}

/** Total de minutos de las demoras de un tipo. Una demora sin tipo (back anterior) es de llegada. */
export function demoraAcumulada(demoras: readonly DemoraRegistrada[], tipo: TipoDemora): number {
  return demoras.filter((x) => (x.tipo ?? 'llegada') === tipo).reduce((suma, x) => suma + x.duracionMinutos, 0);
}

/** "-12.04531, -77.11372" (5 decimales, ~1 m). Vacío si falta alguna. */
export function coordenadasTexto(latitud: number | null | undefined, longitud: number | null | undefined): string {
  if (latitud == null || longitud == null || !Number.isFinite(latitud) || !Number.isFinite(longitud)) return '';
  return `${latitud.toFixed(5)}, ${longitud.toFixed(5)}`;
}

/** Texto del tipo para títulos y listas. */
export function nombreTipoDemora(tipo: TipoDemora | string | undefined): string {
  return tipo === 'ingreso' ? 'Ingreso a planta' : 'Llegada a planta';
}
