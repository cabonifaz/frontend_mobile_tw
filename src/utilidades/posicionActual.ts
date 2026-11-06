import type { Ubicacion } from '@/api/ruta';

/**
 * Última posición que ya está siguiendo la app (el monitor de campo la actualiza cada ~30 s o cada 15 m). Sirve de respaldo cuando una
 * lectura nueva del GPS tarda: en interiores o con señal débil `getCurrentPositionAsync` puede no terminar nunca.
 */
let ultima: { u: Ubicacion; en: number } | null = null;

export function recordarPosicion(u: Ubicacion, en: number = Date.now()): void {
  ultima = { u, en };
}

/** La posición que sigue la app, si es de hace `maxMs` milisegundos o menos; si no, null. */
export function posicionReciente(maxMs: number, ahora: number = Date.now()): Ubicacion | null {
  return ultima && ahora - ultima.en <= maxMs ? ultima.u : null;
}

/** Olvida la posición (al cerrar sesión: no debe verla otro técnico en el mismo teléfono). */
export function olvidarPosicion(): void {
  ultima = null;
}

/**
 * Espera la promesa, pero no más de `ms`: devuelve su valor, o null si tarda más o falla. La promesa original sigue su curso (no se cancela),
 * pero ya no bloquea la pantalla.
 */
export function conTope<T>(promesa: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolver) => {
    const reloj = setTimeout(() => resolver(null), ms);
    promesa.then(
      (valor) => {
        clearTimeout(reloj);
        resolver(valor);
      },
      () => {
        clearTimeout(reloj);
        resolver(null);
      },
    );
  });
}
