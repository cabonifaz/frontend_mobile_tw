import type { EstadoJornada } from '@/api/jornada';

/**
 * Último estado de la jornada que conoce la app (lo deja la pantalla «Reloj marcador» al leer o marcar). El monitor de campo lo usa para saber si debe enviar
 * la posición del técnico sin esperar a consultar el servidor otra vez (así, apenas marca «Inicio de labores», ya se ve en el mapa de la intranet).
 */
let actual: { estado: EstadoJornada; en: number } | null = null;

export function recordarJornada(estado: EstadoJornada, en: number = Date.now()): void {
  actual = { estado, en };
}

/** El estado conocido, si es de hace `maxMs` milisegundos o menos; si no, null. */
export function jornadaReciente(maxMs: number, ahora: number = Date.now()): EstadoJornada | null {
  return actual && ahora - actual.en <= maxMs ? actual.estado : null;
}

/** Olvida el estado (al cerrar sesión: no debe verlo otro técnico en el mismo teléfono). */
export function olvidarJornada(): void {
  actual = null;
}
