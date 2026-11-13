import { useEffect, useState } from 'react';
import { gastosPendientes, suscribirColaGastos, type GastoPendiente } from '@/api/colaGastos';

/** Los gastos del técnico guardados en el teléfono que aún no se enviaron (HU-27 · POR ENVIAR). Se actualiza solo cuando cambia la cola. */
export function useGastosPendientes(idUsuario: number | undefined): GastoPendiente[] {
  const [lista, setLista] = useState<GastoPendiente[]>([]);

  useEffect(() => {
    let vigente = true;
    const leerCola = async () => {
      const l = idUsuario ? await gastosPendientes(idUsuario) : [];
      if (vigente) setLista(l);
    };
    void leerCola();
    const baja = suscribirColaGastos(() => void leerCola());
    return () => {
      vigente = false;
      baja();
    };
  }, [idUsuario]);

  return lista;
}
