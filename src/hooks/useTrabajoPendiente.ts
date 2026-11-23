import { useEffect, useState } from 'react';
import { enviadasTrabajoDesdeApertura, pendientesDeEquipoTrabajo, suscribirColaTrabajo, type TrabajoPendiente } from '@/api/colaTrabajo';

interface Estado {
  pendientes: TrabajoPendiente[];
  enviadas: number;
  /** Ya se leyó lo guardado en el teléfono (la pantalla espera a esto para armarse con lo pendiente ya aplicado). */
  cargado: boolean;
}

/**
 * HU-18 — Lo que el técnico guardó en el teléfono de un equipo (variables, ensayos, cabecera) y todavía no se envió, más cuántos registros se enviaron desde que abrió
 * la app: la pantalla suma `enviadas` a la clave de su consulta para volver a leer del servidor cuando el envío termina. Se actualiza solo cuando cambia la cola.
 */
export function useTrabajoPendiente(idUsuario: number, idOs: number, idOsEquipo: number): Estado {
  const [estado, setEstado] = useState<Estado>({ pendientes: [], enviadas: enviadasTrabajoDesdeApertura(), cargado: false });

  useEffect(() => {
    if (!idUsuario || !idOs || !idOsEquipo) return;
    let vigente = true;
    const leer = () => {
      void pendientesDeEquipoTrabajo(idUsuario, idOs, idOsEquipo).then((pendientes) => {
        if (vigente) setEstado({ pendientes, enviadas: enviadasTrabajoDesdeApertura(), cargado: true });
      });
    };
    leer();
    const dejar = suscribirColaTrabajo(leer);
    return () => {
      vigente = false;
      dejar();
    };
  }, [idUsuario, idOs, idOsEquipo]);

  // Sin equipo válido no hay nada que leer: la pantalla no debe esperar
  return idUsuario && idOs && idOsEquipo ? estado : { ...estado, cargado: true };
}
