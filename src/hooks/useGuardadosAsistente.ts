import { useEffect, useState } from 'react';
import { listarLocales, suscribirGuardados, type GuardadoLocal } from '@/api/guardadosAsistente';

/**
 * Guardados del Asistente IA que el técnico tiene en el teléfono (HU-19). Se actualiza solo cuando se guarda, se elimina o se sincroniza algo, así
 * los botones "Guardar offline" / "Fragmento" pasan a "Guardado" y la pantalla de Guardados se refresca sin recargar.
 */
export function useGuardadosAsistente(idUsuario: number | undefined, busqueda = ''): GuardadoLocal[] {
  const [lista, setLista] = useState<GuardadoLocal[]>([]);

  useEffect(() => {
    let vigente = true;
    const leer = async () => {
      const guardados = idUsuario ? await listarLocales(idUsuario, busqueda) : [];
      if (vigente) setLista(guardados);
    };
    void leer();
    const baja = suscribirGuardados(() => void leer());
    return () => {
      vigente = false;
      baja();
    };
  }, [idUsuario, busqueda]);

  return lista;
}
