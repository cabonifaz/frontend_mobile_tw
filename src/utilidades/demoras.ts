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

// ── Sin conexión: demoras guardadas en el teléfono ───────────────────────────────────────────

/** Qué hacer con una demora guardada cuando su envío falla. */
export type DestinoFallo = 'sin_conexion' | 'sesion' | 'rechazada' | 'reintentar';

/**
 * Clasifica el fallo de un envío (estadoHttp 0 = sin conexión o tiempo agotado, como lo informa `solicitar`):
 *  - sin_conexion: se conserva y se reintenta cuando vuelva la señal.
 *  - sesion: la sesión terminó (401): se conserva hasta que el técnico vuelva a entrar.
 *  - rechazada: el servidor la rechazó por una regla de negocio o por datos que nunca serán válidos (4xx): se descarta y se avisa.
 *  - reintentar: error del servidor (5xx) u otro: se conserva y se reintenta, con tope de intentos.
 */
export function clasificarFallo(estadoHttp: number, idTipoMensaje?: number): DestinoFallo {
  if (estadoHttp === 0) return 'sin_conexion';
  if (estadoHttp === 401) return 'sesion';
  if (idTipoMensaje === 1) return 'rechazada';
  if (estadoHttp >= 400 && estadoHttp < 500 && estadoHttp !== 408 && estadoHttp !== 429) return 'rechazada';
  return 'reintentar';
}

/** Intentos con conexión confirmada tras los cuales una demora con foto se envía sin la foto (la foto no se puede subir). */
export const INTENTOS_ANTES_DE_SOLTAR_FOTO = 3;
/** Intentos tras los cuales una demora que el servidor no logra procesar (5xx) se descarta y se avisa. */
export const INTENTOS_MAXIMOS = 10;

/** Bytes que ocupa un texto en UTF-8 (el almacenamiento seguro del teléfono limita el tamaño de cada valor). */
export function bytesUtf8(texto: string): number {
  let bytes = 0;
  for (const caracter of texto) {
    const c = caracter.codePointAt(0) ?? 0;
    bytes += c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4;
  }
  return bytes;
}

/**
 * Recorta la descripción hasta que `armar(descripcion)` entre en `maximoBytes`. Lo demás de la demora no se toca: es mejor
 * guardar la demora con una descripción más corta que perderla.
 */
export function descripcionQueEntra(descripcion: string, maximoBytes: number, armar: (d: string) => string): string {
  let d = descripcion;
  while (d.length > 0 && bytesUtf8(armar(d)) > maximoBytes) d = d.slice(0, Math.max(0, d.length - Math.max(10, Math.ceil(d.length / 10))));
  return d;
}

/** Lo mínimo de una demora pendiente que necesita el cálculo de horas. */
export interface DemoraPendienteCalculo {
  tipo: TipoDemora;
  duracionMinutos: number;
  capturadoEn: string;
}

/**
 * El contexto de la pantalla (ETA, inicio previsto) más las demoras que aún no se enviaron: sin conexión, el técnico ve la ETA
 * que tendrá cuando se registren. Las de llegada suman a la ETA vigente; las de ingreso se encadenan desde el inicio previsto.
 */
export function contextoConPendientes(c: ContextoDemoras, pendientes: readonly DemoraPendienteCalculo[]): ContextoDemoras {
  if (pendientes.length === 0) return c;
  const llegada = pendientes.filter((p) => p.tipo === 'llegada').reduce((suma, p) => suma + p.duracionMinutos, 0);
  let inicio = c.inicioPrevisto ?? c.ahora;
  [...pendientes]
    .filter((p) => p.tipo === 'ingreso')
    .sort((a, b) => a.capturadoEn.localeCompare(b.capturadoEn))
    .forEach((p) => {
      inicio = sumarMinutos(inicio, p.duracionMinutos) ?? inicio;
    });
  return {
    ...c,
    minutosDemora: c.minutosDemora + llegada,
    etaVigente: llegada > 0 ? (sumarMinutos(c.etaVigente, llegada) ?? c.etaVigente) : c.etaVigente,
    inicioPrevisto: inicio,
  };
}
