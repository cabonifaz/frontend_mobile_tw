import { useCallback, useEffect, useRef, useState } from 'react';
import { ErrorApi } from '@/api/cliente';
import { useSesion } from '@/sesion/SesionContext';

/**
 * Carga datos del backend en una pantalla, con estado de carga, error y recarga.
 *
 *   const { datos, cargando, error, recargar } = useConsulta((token) => obtenerMisDatos(token));
 *
 * - Usa el token de la sesión actual.
 * - `clave`: cuando cambia, se vuelve a consultar (p. ej. el id de un servicio).
 * - Si el servidor responde 401, la sesión se cierra sola (lo maneja src/api/cliente.ts).
 * - `recargar()` sirve para "deslizar hacia abajo para actualizar".
 */
export function useConsulta<T>(consulta: (token: string) => Promise<T>, clave: string = '') {
  const { sesion } = useSesion();
  const token = sesion?.token ?? null;

  const [datos, setDatos] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [claveCargada, setClaveCargada] = useState<string | null>(null);
  const [recargando, setRecargando] = useState(false);

  // Siempre la última versión de la función, sin volver a disparar la consulta en cada render.
  const consultaRef = useRef(consulta);
  useEffect(() => {
    consultaRef.current = consulta;
  });

  const idConsulta = `${token ?? ''}|${clave}`;

  useEffect(() => {
    if (!token) return;
    let vigente = true;
    consultaRef.current(token).then(
      (resultado) => {
        if (!vigente) return;
        setDatos(resultado);
        setError(null);
        setClaveCargada(idConsulta);
      },
      (e: unknown) => {
        if (!vigente) return;
        setError(mensajeDeError(e));
        setClaveCargada(idConsulta);
      },
    );
    return () => {
      vigente = false;
    };
  }, [token, idConsulta]);

  const recargar = useCallback(async () => {
    if (!token) return;
    setRecargando(true);
    try {
      setDatos(await consultaRef.current(token));
      setError(null);
    } catch (e) {
      setError(mensajeDeError(e));
    } finally {
      setRecargando(false);
    }
  }, [token]);

  return { datos, cargando: claveCargada !== idConsulta, recargando, error, recargar };
}

function mensajeDeError(e: unknown): string {
  return e instanceof ErrorApi ? e.message : 'No se pudieron cargar los datos.';
}
