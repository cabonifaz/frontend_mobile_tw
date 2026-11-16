import type { ObjetivoEquipo } from '@/api/ruta';

/**
 * HU-22 — Ingreso de equipos (OS): reglas y textos (sin acceso al teléfono ni al servidor: se prueban solos).
 * Las mismas reglas las valida el servidor (SP_RegistrarIngresoEquipoMovil); aquí se usan para no dejar enviar un formulario incompleto.
 */
export type EstadoIngreso = 'operativo' | 'con_observaciones' | 'inoperativo';

export const MAX_FOTOS_INGRESO = 5;
export const MIN_OBSERVACION_INGRESO = 3;
export const MAX_OBSERVACION_INGRESO = 500;

export const ESTADOS_INGRESO: { valor: EstadoIngreso; texto: string }[] = [
  { valor: 'operativo', texto: 'Operativo' },
  { valor: 'con_observaciones', texto: 'Operativo con observaciones' },
  { valor: 'inoperativo', texto: 'Inoperativo' },
];

export function textoEstadoIngreso(estado: string): string {
  return ESTADOS_INGRESO.find((e) => e.valor === estado)?.texto ?? estado;
}

/** Con observaciones o inoperativo se exige observación y fotos de evidencia. */
export const requiereEvidencia = (estado: EstadoIngreso | null): boolean => estado === 'con_observaciones' || estado === 'inoperativo';

/** Lo que falta para poder pulsar «Registrar equipo» (null = todo listo). */
export function faltaParaRegistrar(estado: EstadoIngreso | null, observacion: string, nFotos: number): string | null {
  if (!estado) return 'Selecciona el estado de ingreso para continuar.';
  if (!requiereEvidencia(estado)) return null;
  if (observacion.trim().length < MIN_OBSERVACION_INGRESO) return 'Escribe la observación del estado del equipo.';
  if (nFotos < 1) return 'Toma al menos una foto de evidencia.';
  return null;
}

export type SituacionIngreso = 'registrado' | 'por_registrar';

/**
 * Equipo registrado en campo y todavía pendiente de validar en la intranet (BORRADOR): su COD TW es provisional (NEW-…).
 * Un equipo ya registrado que se agregó a la OS con su QR también cuenta como «de campo», pero NO es borrador.
 */
export const esBorrador = (e: Pick<ObjetivoEquipo, 'enCampo' | 'codigoTw'>): boolean => e.enCampo && /^NEW-/i.test(e.codigoTw ?? '');

/** Cuántos equipos de la OS ya se ingresaron. */
export function contarIngresados(equipos: Pick<ObjetivoEquipo, 'idOsEquipo'>[], ingresados: ReadonlySet<number>): number {
  return equipos.filter((e) => ingresados.has(e.idOsEquipo)).length;
}

/** «hoy 09:12» → solo la hora de «2026-11-16T09:12:00». */
export function horaIngreso(iso: string | null): string {
  const m = iso ? /T(\d{2}):(\d{2})/.exec(iso) : null;
  return m ? `${m[1]}:${m[2]}` : '';
}
