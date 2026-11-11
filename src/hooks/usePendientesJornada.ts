import { useEffect, useState } from 'react';
import { pendientesJornada, suscribirColaJornada } from '@/api/colaJornada';
import type { PendienteDeJornada } from '@/utilidades/jornada';

/** Marcaciones de la jornada guardadas en el teléfono que aún no llegaron al servidor (se actualiza sola cuando cambia la cola). */
export function usePendientesJornada(idUsuario: number): PendienteDeJornada[] {
  const [pendientes, setPendientes] = useState<PendienteDeJornada[]>([]);
  useEffect(() => {
    if (!idUsuario) return;
    let vigente = true;
    const leer = () => {
      void pendientesJornada(idUsuario).then((p) => {
        if (vigente) setPendientes(p);
      });
    };
    leer();
    const baja = suscribirColaJornada(leer);
    return () => {
      vigente = false;
      baja();
    };
  }, [idUsuario]);
  return idUsuario ? pendientes : [];
}
