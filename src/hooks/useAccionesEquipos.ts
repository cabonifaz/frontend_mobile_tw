import { useEffect, useState } from 'react';
import { accionesPendientes, suscribirColaEquipos, type AccionEquipoPendiente } from '@/api/colaEquipos';

/**
 * Acciones sobre los equipos de ese servicio que el técnico hizo sin conexión y aún no se enviaron (HU-07).
 * Mientras existan, la lista de objetivos las muestra ya aplicadas (`aplicarPendientes`).
 */
export function useAccionesEquipos(idUsuario: number | undefined, idOs: number): AccionEquipoPendiente[] {
  const [pendientes, setPendientes] = useState<AccionEquipoPendiente[]>([]);

  useEffect(() => {
    let vigente = true;
    const leerCola = async () => {
      const lista = idUsuario && idOs > 0 ? await accionesPendientes(idUsuario, idOs) : [];
      if (vigente) setPendientes(lista);
    };
    void leerCola();
    const baja = suscribirColaEquipos(() => void leerCola());
    return () => {
      vigente = false;
      baja();
    };
  }, [idUsuario, idOs]);

  return pendientes;
}
