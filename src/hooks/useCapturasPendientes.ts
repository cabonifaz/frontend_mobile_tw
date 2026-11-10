import { useEffect, useState } from 'react';
import { capturasPendientes, suscribirColaEvidencias, type CapturaPendiente } from '@/api/colaEvidencias';

/**
 * Capturas de ese equipo que el técnico tomó sin conexión y aún no se enviaron a la IA (HU-11 / HU-12 / HU-13).
 * Mientras estén en cola, la tarjeta de la evidencia muestra "EN COLA" y no cuenta como completa.
 */
export function useCapturasPendientes(idUsuario: number | undefined, idOs: number, idOsEquipo: number): CapturaPendiente[] {
  const [pendientes, setPendientes] = useState<CapturaPendiente[]>([]);

  useEffect(() => {
    let vigente = true;
    const leerCola = async () => {
      const lista = idUsuario && idOs > 0 && idOsEquipo > 0 ? await capturasPendientes(idUsuario, idOs, idOsEquipo) : [];
      if (vigente) setPendientes(lista);
    };
    void leerCola();
    const baja = suscribirColaEvidencias(() => void leerCola());
    return () => {
      vigente = false;
      baja();
    };
  }, [idUsuario, idOs, idOsEquipo]);

  return pendientes;
}
