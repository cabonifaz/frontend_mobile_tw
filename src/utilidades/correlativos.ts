import type { EstadoTicket, TicketCorrelativo, TicketJefatura } from '@/api/correlativos';
import { colores } from '@/tema/colores';

/**
 * HU-14 / HU-34 — Textos y reglas de pantalla de los correlativos de Metrología. Quien decide todo (secuencia CC-####-AAAA, estados, permisos) es el back; aquí solo se
 * arman los textos de las maquetas.
 */

export const MAX_OBSERVACION = 300;
const FORMATO_CORRELATIVO = /^CC-\d{4}-\d{4}$/;

export interface Etiqueta {
  texto: string;
  fondo: string;
  color: string;
}

/**
 * La etiqueta del ticket. Técnico: PENDIENTE (rojizo) · ASIGNADO (azul) · USADO. Jefe: PENDIENTE (amarillo) · ASIGNADO (verde).
 * `despachado` = asignado y ya usado en el certificado.
 */
export function etiquetaTicket(estado: EstadoTicket | string, vista: 'tecnico' | 'jefe'): Etiqueta {
  if (estado === 'solicitado') {
    return vista === 'tecnico'
      ? { texto: 'PENDIENTE', fondo: colores.rojoEtiquetaFondo, color: colores.rojoEtiquetaTexto }
      : { texto: 'PENDIENTE', fondo: colores.amarilloFondo, color: colores.amarilloTexto };
  }
  if (estado === 'despachado') return { texto: 'USADO', fondo: colores.grisFondo, color: colores.grisTexto };
  return vista === 'tecnico'
    ? { texto: 'ASIGNADO', fondo: colores.azulFondo, color: colores.azulTexto }
    : { texto: 'ASIGNADO', fondo: colores.verdeEtiquetaFondo, color: colores.verdeEtiquetaTexto };
}

/** "11:02" de una fecha ISO sin zona ("2026-11-10T11:02:00"). */
export function horaDe(iso: string | null | undefined): string {
  const m = /T(\d{2}:\d{2})/.exec(iso ?? '');
  return m ? m[1] : '';
}

/** "26/10/2026 10:42" de una fecha ISO sin zona. */
export function fechaHoraDe(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}:\d{2})/.exec(iso ?? '');
  return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}` : '';
}

/** "hace 4 min" (menos de una hora) o la hora de la solicitud ("10:58"). */
export function textoAntiguedad(minutos: number, solicitadoEn: string | null | undefined): string {
  if (minutos < 1) return 'hace un momento';
  if (minutos < 60) return `hace ${Math.round(minutos)} min`;
  return horaDe(solicitadoEn) || `hace ${Math.floor(minutos / 60)} h`;
}

/** "III · 3,000 kg" (lo que no esté se omite). */
export function claseCapacidad(clase: string | null | undefined, capacidad: string | null | undefined): string {
  return [clase, capacidad].map((x) => x?.trim()).filter(Boolean).join(' · ') || '—';
}

/** "BAL-012 · 3,000 kg" (código y capacidad del equipo del ticket). */
export function equipoCapacidad(codigo: string | null | undefined, capacidad: string | null | undefined): string {
  return [codigo, capacidad].map((x) => x?.trim()).filter(Boolean).join(' · ') || '—';
}

/** La etiqueta de la orden en "Datos del equipo": OS · SERVICIO TÉCNICO u OM · METROLOGÍA. */
export function etiquetaOrden(tipoOrden: string | null | undefined): string {
  return tipoOrden === 'OM' ? 'OM · METROLOGÍA' : 'OS · SERVICIO TÉCNICO';
}

/** El subtítulo de la solicitud: "Balanza de plataforma · BAL-012 · OS-000845". */
export function subtituloSolicitud(equipo: string, codigo: string | null | undefined, numeroOs: string): string {
  return [equipo, codigo?.trim() || null, numeroOs].filter(Boolean).join(' · ');
}

export interface PasoTiempo {
  titulo: string;
  detalle: string;
  hecho: boolean;
}

/** Línea de tiempo del ticket: "Solicitud enviada · 10:31 · Juan Pérez" y "Correlativo asignado por Metrología · 10:42 · Supervisor / Esperando…". */
export function lineaTiempo(t: Pick<TicketCorrelativo, 'solicitadoEn' | 'solicitante' | 'asignadoEn' | 'asignadoPor' | 'estado'>): PasoTiempo[] {
  const asignado = t.estado !== 'solicitado';
  return [
    { titulo: 'Solicitud enviada', detalle: [horaDe(t.solicitadoEn), t.solicitante].filter(Boolean).join(' · '), hecho: true },
    {
      titulo: 'Correlativo asignado por Metrología',
      detalle: asignado ? [horaDe(t.asignadoEn), t.asignadoPor ?? 'Supervisor de Metrología'].filter(Boolean).join(' · ') : 'Esperando…',
      hecho: asignado,
    },
  ];
}

/** "CC-1720-2026 · asignado 10:52 por Ana Torres" (tarjeta del Jefe de Metrología ya asignada). */
export function textoAsignado(correlativo: string | null | undefined, asignadoEn: string | null | undefined, asignadoPor: string | null | undefined): string {
  return `${correlativo ?? ''} · asignado ${horaDe(asignadoEn)}${asignadoPor ? ` por ${asignadoPor}` : ''}`.trim();
}

/** Toast del jefe tras asignar: título y detalle. */
export function toastAsignado(tecnico: string | null | undefined): { titulo: string; detalle: string } {
  return { titulo: 'Correlativo asignado', detalle: `${tecnico?.trim() || 'El técnico'} ya puede usarlo en su certificado` };
}

/** El correlativo escrito por el jefe: mayúsculas y sin espacios; "" = el sugerido. */
export function normalizarCorrelativo(texto: string): string {
  return texto.trim().toUpperCase();
}

/** ¿Tiene el formato CC-####-AAAA? Vacío cuenta como válido (se usa el sugerido). */
export function correlativoValido(texto: string): boolean {
  const t = normalizarCorrelativo(texto);
  return t === '' || FORMATO_CORRELATIVO.test(t);
}

/** Texto bajo "Usar correlativo" cuando todavía no hay uno asignado. */
export const AYUDA_USAR_BLOQUEADO = 'Se habilita cuando Metrología asigne el correlativo · el estado se actualiza en tiempo real';
export const AYUDA_USAR = 'Se coloca como N° de certificado en «Correlativo y certificado».';

/** "2 LIBRES" / "1 LIBRE" y "1 USADO" / "2 USADOS" (etiquetas de la reserva por técnico). */
export function textoLibres(n: number): string {
  return `${n} ${n === 1 ? 'LIBRE' : 'LIBRES'}`;
}
export function textoUsados(n: number): string {
  return `${n} ${n === 1 ? 'USADO' : 'USADOS'}`;
}

/** "CC-1721-2026 · CC-1722-2026" → "CC-1721 · CC-1722" (la maqueta muestra solo el número de la reserva). */
export function codigosCortos(codigos: string): string {
  return codigos.replace(/CC-(\d{4})-\d{4}/g, 'CC-$1');
}

/** Tickets del técnico: el primero asignado y sin usar (el que se muestra en "CORRELATIVO METROLÓGICO" con el botón "Usar correlativo"). */
export function ticketParaUsar(tickets: readonly TicketCorrelativo[]): TicketCorrelativo | null {
  return tickets.find((t) => t.puedeUsar && t.correlativo) ?? null;
}

/** Pendientes primero y luego los asignados de hoy (el back ya los ordena; esto lo asegura en la pantalla del jefe). */
export function separarTicketsJefatura(tickets: readonly TicketJefatura[]): { pendientes: TicketJefatura[]; asignados: TicketJefatura[] } {
  return { pendientes: tickets.filter((t) => t.estado === 'solicitado'), asignados: tickets.filter((t) => t.estado !== 'solicitado') };
}

/** Resultado de los ensayos para "RESULTADO": Conforme / No conforme, o "—" si no se finalizaron. */
export function textoResultado(resultado: string | null | undefined): string {
  return resultado?.trim() || '—';
}
