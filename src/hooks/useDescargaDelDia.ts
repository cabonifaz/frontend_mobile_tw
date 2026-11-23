import { useEffect, useState } from 'react';
import { leerMarcadorDescarga, suscribirDescarga, type MarcadorDescarga } from '@/api/descargaDelDia';
import { fechaLimaHoy } from '@/utilidades/agenda';

/**
 * HU-18 — La descarga del día de este técnico: devuelve la hora ("07:40") si HOY ya se descargó la agenda, las órdenes y lo demás para trabajar sin señal; null si aún no.
 * Se actualiza sola cuando termina una descarga.
 */
export function useDescargaDelDia(idUsuario: number | null | undefined): MarcadorDescarga | null {
  const [marcador, setMarcador] = useState<MarcadorDescarga | null>(null);
  useEffect(() => {
    if (!idUsuario) return;
    let vigente = true;
    const leer = () => {
      void leerMarcadorDescarga(idUsuario).then((m) => {
        if (vigente) setMarcador(m && m.fecha === fechaLimaHoy() ? m : null);
      });
    };
    leer();
    const baja = suscribirDescarga(leer);
    return () => {
      vigente = false;
      baja();
    };
  }, [idUsuario]);
  return idUsuario ? marcador : null;
}
