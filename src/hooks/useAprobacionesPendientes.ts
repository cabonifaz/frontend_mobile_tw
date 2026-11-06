import { useEffect, useState } from 'react';
import { obtenerMenuJefatura } from '@/api/jefatura';
import { useSesion } from '@/sesion/SesionContext';

/**
 * Cantidad de solicitudes que esperan la decisión del jefe (globo de la pestaña "Aprobaciones", HU-28 / HU-31).
 * Solo se consulta si el usuario tiene el menú de Jefatura (`activo`). Se vuelve a consultar cuando cambia `refrescarCon`
 * (el layout le pasa la ruta abierta: al volver de decidir una solicitud el número baja solo). Si la consulta falla, el globo se oculta.
 */
export function useAprobacionesPendientes(activo: boolean, refrescarCon: string): number {
  const { sesion } = useSesion();
  const token = sesion?.token ?? null;
  const [cantidad, setCantidad] = useState(0);

  useEffect(() => {
    if (!activo || !token) return;
    let vigente = true;
    obtenerMenuJefatura(token).then(
      (m) => {
        if (vigente) setCantidad(m.aprobacionesPendientes);
      },
      () => {
        if (vigente) setCantidad(0);
      },
    );
    return () => {
      vigente = false;
    };
  }, [activo, token, refrescarCon]);

  // Sin perfil de Jefatura (o sin sesión) no hay globo, aunque quede un número de una consulta anterior.
  return activo && token ? cantidad : 0;
}
