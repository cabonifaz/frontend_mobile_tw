import type { CabeceraEvidencias, DatosIa, Evidencia } from '@/api/evidencias';
import { colores } from '@/tema/colores';

/**
 * HU-11 / HU-12 / HU-13 — Textos y reglas de pantalla del registro fotográfico. Quien decide si una evidencia está completa, rechazada o forzada es el
 * back; aquí solo se arman los textos (etiquetas, avance, "Ver detalles") y los tiempos del microvideo.
 */

export const DURACION_MIN_SEG = 3;
export const DURACION_MAX_SEG = 5;
export const MIN_MOTIVO_FORZAR = 3;
export const MAX_MOTIVO_FORZAR = 300;

/** Aprobada por la IA, forzada por el técnico o sin validar (IA no disponible): cuenta para "Guardar y volver". */
export function estaCompleta(e: Pick<Evidencia, 'estado'>): boolean {
  return e.estado === 'aprobada' || e.estado === 'forzada' || e.estado === 'omitida';
}

export interface EtiquetaEstado {
  texto: string;
  fondo: string;
  color: string;
}

/** La etiqueta de la tarjeta: VERIFICADA (placa), APROBADO (video), LEÍDO (QR), APROBADA, FORZADA, RECHAZADA, SIN VALIDAR o PENDIENTE. */
export function etiquetaEvidencia(e: Pick<Evidencia, 'estado' | 'codigo'>): EtiquetaEstado {
  switch (e.estado) {
    case 'aprobada':
      return {
        texto: e.codigo === 'placa' ? 'VERIFICADA' : e.codigo === 'encendido' ? 'APROBADO' : e.codigo === 'qr' ? 'LEÍDO' : 'APROBADA',
        fondo: colores.verdeEtiquetaFondo,
        color: colores.verdeEtiquetaTexto,
      };
    case 'forzada':
      return { texto: 'FORZADA', fondo: colores.amarilloFondo, color: colores.amarilloTexto };
    case 'rechazada':
      return { texto: 'RECHAZADA', fondo: colores.rojoEtiquetaFondo, color: colores.rojoEtiquetaTexto };
    case 'omitida':
      return { texto: 'SIN VALIDAR', fondo: colores.grisFondo, color: colores.grisTexto };
    default:
      return { texto: 'PENDIENTE', fondo: colores.amarilloFondo, color: colores.amarilloTexto };
  }
}

/** "5 de 9 completas". */
export function textoAvance(c: Pick<CabeceraEvidencias, 'completas' | 'total'>): string {
  return `${c.completas} de ${c.total} completas`;
}

/** Bajo "Guardar y volver" cuando está bloqueado: "Faltan 4 evidencias · (*) obligatorias para cerrar el equipo." */
export function textoFaltan(c: Pick<CabeceraEvidencias, 'completas' | 'total'>): string {
  const n = c.total - c.completas;
  return `${n === 1 ? 'Falta 1 evidencia' : `Faltan ${n} evidencias`} · (*) obligatorias para cerrar el equipo.`;
}

/** "1 evidencia forzada · registrada como excepción y visible para Jefatura." */
export function textoForzadas(n: number): string {
  return `${n} ${n === 1 ? 'evidencia forzada' : 'evidencias forzadas'} · registrada${n === 1 ? '' : 's'} como excepción y visible para Jefatura.`;
}

/** "0:04" para la duración del microvideo. */
export function textoDuracion(seg: number | null | undefined): string {
  const s = Math.max(0, Math.round(seg ?? 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Se puede detener la grabación desde los 3 s (el mínimo del microvideo). */
export function puedeDetener(seg: number): boolean {
  return seg >= DURACION_MIN_SEG;
}

/** Avance de la barra de grabación (0 a 1 sobre el máximo de 5 s). */
export function progresoGrabacion(seg: number): number {
  return Math.max(0, Math.min(1, seg / DURACION_MAX_SEG));
}

/** El motivo escrito para forzar una foto rechazada: de 3 a 300 caracteres. */
export function motivoForzarValido(texto: string): boolean {
  const n = texto.trim().length;
  return n >= MIN_MOTIVO_FORZAR && n <= MAX_MOTIVO_FORZAR;
}

/** Lo que leyó la IA de la placa, para "LO QUE LEYÓ LA IA". */
export function datosPlaca(d: DatosIa | null | undefined): { clave: string; valor: string }[] {
  if (!d) return [];
  const filas: [string, unknown][] = [
    ['Marca', d.marca],
    ['Modelo', d.modelo],
    ['Serie', d.serie],
    ['Capacidad máxima', d.capacidad],
  ];
  return filas.filter(([, v]) => typeof v === 'string' && v.trim()).map(([k, v]) => ({ clave: k, valor: String(v).trim() }));
}

/** Resultado de la IA sobre la hoja del informe: legibilidad, hoja completa y firma. */
export function datosInforme(d: DatosIa | null | undefined): { legibilidad: string | null; hojaCompleta: boolean | null; firmaVisible: boolean | null } {
  return {
    legibilidad: typeof d?.legibilidad === 'string' ? d.legibilidad : null,
    hojaCompleta: typeof d?.hojaCompleta === 'boolean' ? d.hojaCompleta : null,
    firmaVisible: typeof d?.firmaVisible === 'boolean' ? d.firmaVisible : null,
  };
}

/** La página que corresponde a la próxima captura del informe: la siguiente a las ya válidas (máximo 10). */
export function siguientePagina(paginas: number): number {
  return Math.min(10, Math.max(1, paginas + 1));
}

/** Convierte lo que llega del back (objeto) o de un texto JSON en los datos de la IA; cualquier otra cosa → null. */
export function leerDatosIa(valor: unknown): DatosIa | null {
  if (valor && typeof valor === 'object' && !Array.isArray(valor)) return valor as DatosIa;
  if (typeof valor === 'string') {
    try {
      const x: unknown = JSON.parse(valor);
      return x && typeof x === 'object' && !Array.isArray(x) ? (x as DatosIa) : null;
    } catch {
      return null;
    }
  }
  return null;
}

/** Etiqueta de una evidencia cuya toma está en el teléfono esperando señal para pasar por la IA. */
export const ETIQUETA_EN_COLA: EtiquetaEstado = { texto: 'EN COLA', fondo: colores.azulFondo, color: colores.azulTexto };

/** Banner del registro fotográfico: "2 evidencias esperando señal · se envían solas a la IA; hasta entonces no cuentan como completas." */
export function textoEnCola(n: number): string {
  return `${n} ${n === 1 ? 'evidencia esperando señal' : 'evidencias esperando señal'} · se ${n === 1 ? 'envía sola' : 'envían solas'} a la IA al recuperar la conexión; hasta entonces no ${n === 1 ? 'cuenta' : 'cuentan'} como completa${n === 1 ? '' : 's'}.`;
}

/** Título de la cabecera: "SERVICIO: MC · Báscula Camionera #01". */
export function tituloServicio(c: Pick<CabeceraEvidencias, 'servicioSigla' | 'nombre' | 'numero'>): string {
  return `SERVICIO: ${c.servicioSigla ? `${c.servicioSigla} · ` : ''}${c.nombre} #${String(c.numero).padStart(2, '0')}`;
}
