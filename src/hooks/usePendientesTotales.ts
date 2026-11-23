import { useEffect, useState } from 'react';
import { contarPendientes, suscribirPendientes } from '@/api/sincronizador';

/** HU-18 — Cuántos registros hay guardados en el teléfono por enviar (todas las colas); se actualiza solo cuando cambia alguna. */
export function usePendientesTotales(idUsuario: number | null | undefined): number {
  const [total, setTotal] = useState(0);
  useEffect(() => {
    if (!idUsuario) return;
    let vigente = true;
    const leer = () => {
      void contarPendientes(idUsuario).then((n) => {
        if (vigente) setTotal(n);
      });
    };
    leer();
    const baja = suscribirPendientes(leer);
    return () => {
      vigente = false;
      baja();
    };
  }, [idUsuario]);
  return idUsuario ? total : 0;
}
