import { useEffect, useState } from 'react';
import { alCambiarMarcaAprobaciones, leerMarcaAprobaciones } from '@/almacen/aprobacionesLeidas';
import { obtenerAprobaciones } from '@/api/aprobaciones';
import { obtenerMenuJefatura } from '@/api/jefatura';
import { useSesion } from '@/sesion/SesionContext';
import { sinLeer } from '@/utilidades/aprobaciones';

/**
 * Cantidad de solicitudes que esperan la decisión del jefe (globo de la pestaña "Aprobaciones", HU-28 / HU-31).
 * Solo se consulta si el usuario tiene el menú de Jefatura (`activo`). Se vuelve a consultar cuando cambia `refrescarCon`
 * (el layout le pasa la ruta abierta: al volver de decidir una solicitud el número baja solo) o cuando el jefe pulsa «Leer todo» en Aprobaciones.
 * Si el jefe ya dio por leída su bandeja, el globo cuenta solo las solicitudes posteriores a esa marca (HU-31). Si la consulta falla, el globo se oculta.
 */
export function useAprobacionesPendientes(activo: boolean, refrescarCon: string): number {
  const { sesion } = useSesion();
  const token = sesion?.token ?? null;
  const idUsuario = sesion?.usuario.idUsuario ?? 0;
  const [cantidad, setCantidad] = useState(0);
  const [version, setVersion] = useState(0);

  useEffect(() => alCambiarMarcaAprobaciones(() => setVersion((v) => v + 1)), []);

  useEffect(() => {
    if (!activo || !token) return;
    let vigente = true;
    (async () => {
      const marca = idUsuario ? await leerMarcaAprobaciones(idUsuario) : null;
      if (marca) {
        const bandeja = await obtenerAprobaciones(token);
        return sinLeer(bandeja.items, marca).length;
      }
      return (await obtenerMenuJefatura(token)).aprobacionesPendientes;
    })().then(
      (n) => {
        if (vigente) setCantidad(n);
      },
      () => {
        if (vigente) setCantidad(0);
      },
    );
    return () => {
      vigente = false;
    };
  }, [activo, token, idUsuario, refrescarCon, version]);

  // Sin perfil de Jefatura (o sin sesión) no hay globo, aunque quede un número de una consulta anterior.
  return activo && token ? cantidad : 0;
}
