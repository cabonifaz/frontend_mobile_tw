import { useSyncExternalStore } from 'react';
import { borradorVacio, instrumentoVacio, type Borrador, type InstrumentoBorrador } from '@/utilidades/recepcionOm';

/**
 * HU-23 — Borrador de la recepción de una OM (en memoria): lo que el técnico va llenando entre las pantallas (instrumentos marcados, trazabilidad, estado físico,
 * observaciones, accesorios y las fotos ya subidas). Las fotos se suben al servidor al tomarlas, así que no se pierden; el resto se pierde si se cierra la app.
 * Se limpia al registrar la recepción.
 */
let borradores = new Map<number, Borrador>();
const escuchas = new Set<() => void>();

function avisar() {
  escuchas.forEach((f) => f());
}

/** Mismo objeto mientras no haya borrador: `useSyncExternalStore` exige un valor estable. */
const SIN_BORRADOR: Borrador = borradorVacio();

export function leerBorrador(idOs: number): Borrador {
  return borradores.get(idOs) ?? SIN_BORRADOR;
}

export function actualizarBorrador(idOs: number, cambiar: (b: Borrador) => Borrador): void {
  const nuevo = new Map(borradores);
  nuevo.set(idOs, cambiar(leerBorrador(idOs)));
  borradores = nuevo;
  avisar();
}

export function actualizarInstrumento(idOs: number, idOsEquipo: number, cambiar: (i: InstrumentoBorrador) => InstrumentoBorrador): void {
  actualizarBorrador(idOs, (b) => ({ ...b, instrumentos: { ...b.instrumentos, [idOsEquipo]: cambiar(b.instrumentos[idOsEquipo] ?? instrumentoVacio()) } }));
}

export function limpiarBorrador(idOs: number): void {
  if (!borradores.has(idOs)) return;
  const nuevo = new Map(borradores);
  nuevo.delete(idOs);
  borradores = nuevo;
  avisar();
}

function suscribir(f: () => void): () => void {
  escuchas.add(f);
  return () => {
    escuchas.delete(f);
  };
}

/** El borrador de una OM; la pantalla se vuelve a pintar cuando cambia. */
export function useBorradorRecepcion(idOs: number): Borrador {
  return useSyncExternalStore(suscribir, () => leerBorrador(idOs), () => SIN_BORRADOR);
}
