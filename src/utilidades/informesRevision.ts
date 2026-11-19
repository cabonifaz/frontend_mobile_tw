import type { EstadoValidacion, GrupoInformes, InformeRevisionItem } from '@/api/informesRevision';
import { colores } from '@/tema/colores';

/**
 * HU-33 — Reglas de pantalla de la Revisión de informes técnicos: pestañas, textos de espera y plazo, colores de las validaciones y la validación del formulario
 * "Observar informe" (los mismos límites que el servidor: instrucción de 10 a 1000 caracteres, al menos una sección y el plazo de la lista). Qué informes ve cada
 * jefe, cuándo se puede aprobar u observar y el cambio de estado los decide el back.
 */

export const MIN_INSTRUCCION = 10;
export const MAX_INSTRUCCION = 1000;
export const MAX_NOTA = 500;
export const MAX_BUSQUEDA = 80;

export const PESTANAS: { id: GrupoInformes; texto: string }[] = [
  { id: 'por_revisar', texto: 'Por revisar' },
  { id: 'en_correccion', texto: 'En corrección' },
  { id: 'aprobados', texto: 'Aprobados' },
];

export function etiquetaInforme(i: Pick<InformeRevisionItem, 'estado' | 'slaVencido'>): { texto: string; fondo: string; color: string } {
  if (i.estado === 'aprobado') return { texto: 'APROBADO', fondo: '#DCFCE7', color: '#166534' };
  if (i.estado === 'en_correccion') return { texto: 'EN CORRECCIÓN', fondo: '#FFEDD5', color: '#9A3412' };
  if (i.slaVencido) return { texto: 'SLA VENCIDO', fondo: '#FEE2E2', color: '#B91C1C' };
  return { texto: 'POR REVISAR', fondo: '#FEF3C7', color: '#92400E' };
}

/** "20 h", "3 días": cuánto lleva esperando la revisión. */
export function textoEspera(horas: number | null | undefined): string {
  const h = Math.max(0, Math.round(horas ?? 0));
  if (h < 1) return 'hace un momento';
  if (h < 48) return `hace ${h} h`;
  return `hace ${Math.floor(h / 24)} días`;
}

/** Segunda línea de la tarjeta: lo que importa según la pestaña. */
export function resumenInforme(i: InformeRevisionItem): string {
  if (i.estado === 'en_correccion') return `Corrección pedida${i.plazoEn ? ` · plazo ${textoPlazo(i.plazoEn)}` : ''}`;
  const partes = [i.evidencias === 0 ? 'sin evidencias' : `${i.evidencias} ${i.evidencias === 1 ? 'evidencia' : 'evidencias'}`];
  if (i.forzadas > 0) partes.push(`${i.forzadas} ${i.forzadas === 1 ? 'forzada' : 'forzadas'}`);
  partes.push(i.firmadoPorCliente ? 'firmado por cliente' : 'sin firma del cliente');
  return partes.join(' · ');
}

/** "20/11 12:00" a partir de "yyyy-MM-dd HH:mm" (hora de Lima, sin pasar por la zona del celular). */
export function textoPlazo(plazo: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(plazo ?? '');
  return m ? `${m[3]}/${m[2]} ${m[4]}:${m[5]}` : '';
}

/** "27/10/2026 · 12:00" para el formulario y el detalle. */
export function textoFechaHora(valor: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/.exec(valor ?? '');
  if (!m) return '';
  return m[4] ? `${m[3]}/${m[2]}/${m[1]} · ${m[4]}:${m[5]}` : `${m[3]}/${m[2]}/${m[1]}`;
}

export function estiloValidacion(estado: EstadoValidacion | string): { icono: 'checkmark-circle' | 'alert-circle' | 'close-circle'; color: string } {
  if (estado === 'ok') return { icono: 'checkmark-circle', color: colores.verde };
  if (estado === 'atencion') return { icono: 'alert-circle', color: colores.naranja };
  return { icono: 'close-circle', color: colores.rojo };
}

export interface FormularioObservar {
  motivo: string | null;
  secciones: string[];
  instruccion: string;
  plazoHoras: number | null;
}

/** Mensaje de lo que falta en el formulario "Observar informe", o null si está completo. */
export function errorObservar(f: FormularioObservar): string | null {
  if (!f.motivo) return 'Elige el motivo.';
  if (f.secciones.length === 0) return 'Marca al menos una sección afectada.';
  const largo = f.instruccion.trim().length;
  if (largo < MIN_INSTRUCCION) return `Explica qué debe corregir (mínimo ${MIN_INSTRUCCION} caracteres).`;
  if (largo > MAX_INSTRUCCION) return `La instrucción no puede superar los ${MAX_INSTRUCCION} caracteres.`;
  if (!f.plazoHoras) return 'Elige el plazo.';
  return null;
}

/** Marca o desmarca una sección (sin repetidas, en el orden de la lista). */
export function alternarSeccion(actuales: readonly string[], codigo: string, orden: readonly string[]): string[] {
  const nuevas = actuales.includes(codigo) ? actuales.filter((s) => s !== codigo) : [...actuales, codigo];
  return orden.filter((c) => nuevas.includes(c));
}

/** "50", "0.5", "100.25": el número sin ceros de más; "—" si no hay dato. */
export function numeroTexto(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  return String(Number(n.toFixed(4)));
}

export const tituloEnsayo = (tipo: string): string => (tipo === 'pesaje' ? 'Pesaje (linealidad)' : tipo === 'excentricidad' ? 'Excentricidad' : tipo);

export function estadoEquipoTexto(estado: string | null | undefined): string | null {
  if (estado === 'operativo') return 'Operativo';
  if (estado === 'con_observaciones') return 'Operativo con observaciones';
  if (estado === 'inoperativo') return 'Inoperativo';
  return null;
}
