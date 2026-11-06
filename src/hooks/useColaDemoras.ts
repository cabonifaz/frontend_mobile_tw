import { useEffect, useState } from 'react';
import { enviadasDesdeApertura, pendientesDe, suscribirCola, type DemoraPendiente } from '@/api/colaDemoras';

/**
 * Demoras del técnico guardadas en el teléfono que aún no se enviaron (HU-05 sin conexión), y cuántas se han enviado desde que abrió
 * la app: una pantalla vuelve a leer sus datos cuando `enviadas` cambia (la demora ya quedó registrada en el servidor).
 */
export function useColaDemoras(idUsuario: number | undefined) {
  const [estado, setEstado] = useState<{ pendientes: DemoraPendiente[]; enviadas: number }>({
    pendientes: [],
    enviadas: enviadasDesdeApertura(),
  });

  useEffect(() => {
    let vigente = true;
    const leerCola = async () => {
      const pendientes = idUsuario ? await pendientesDe(idUsuario) : [];
      if (vigente) setEstado({ pendientes, enviadas: enviadasDesdeApertura() });
    };
    void leerCola();
    const baja = suscribirCola(() => void leerCola());
    return () => {
      vigente = false;
      baja();
    };
  }, [idUsuario]);

  return estado;
}
