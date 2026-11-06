import { useEffect, useState } from 'react';
import { llegadaPendiente, suscribirColaLlegadas, type LlegadaPendiente } from '@/api/colaLlegadas';

/**
 * La llegada del técnico a ese servicio que se confirmó sin conexión y aún no se envió (HU-06), o null.
 * Mientras exista, la llegada cuenta como registrada: los objetivos no se bloquean.
 */
export function useLlegadaPendiente(idUsuario: number | undefined, idOs: number): LlegadaPendiente | null {
  const [pendiente, setPendiente] = useState<LlegadaPendiente | null>(null);

  useEffect(() => {
    let vigente = true;
    const leerCola = async () => {
      const p = idUsuario && idOs > 0 ? await llegadaPendiente(idUsuario, idOs) : null;
      if (vigente) setPendiente(p);
    };
    void leerCola();
    const baja = suscribirColaLlegadas(() => void leerCola());
    return () => {
      vigente = false;
      baja();
    };
  }, [idUsuario, idOs]);

  return pendiente;
}
