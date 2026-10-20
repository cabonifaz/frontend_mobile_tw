import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import * as api from '@/api/autenticacion';
import { ErrorApi, registrarManejadorSesionInvalida } from '@/api/cliente';
import { borrar, guardar, leer } from './almacenamiento';
import { obtenerIdDispositivo, obtenerNombreDispositivo } from './dispositivo';

/**
 * Sesión de la app (App Mobile HU-01).
 *  - "Recordar sesión" marcado: el token se guarda en el almacenamiento seguro y al
 *    abrir la app se entra directo (si la sesión sigue vigente en el servidor).
 *  - Sin marcar: la sesión vive solo mientras la app esté abierta.
 *  - Si el servidor responde 401 (sesión vencida, liberada por el jefe o usuario
 *    desactivado) se vuelve al login con un aviso.
 */

const CLAVE_SESION = 'tw.sesion';
const CLAVE_ULTIMO_USUARIO = 'tw.ultimoUsuario';

interface SesionGuardada {
  token: string;
  expiraEn: string;
  usuario: api.UsuarioSesion;
}

interface ValorSesion {
  cargando: boolean;
  sesion: api.SesionIniciada | null;
  /** Mensaje para mostrar en el login (p. ej. "Tu sesión terminó"). */
  aviso: string | null;
  ultimoUsuario: string | null;
  iniciarSesion: (usuario: string, contrasena: string, recordar: boolean) => Promise<void>;
  cerrarSesion: () => Promise<void>;
  cambiarContrasena: (actual: string, nueva: string) => Promise<string>;
  limpiarAviso: () => void;
}

const ContextoSesion = createContext<ValorSesion | null>(null);

export function ProveedorSesion({ children }: { children: ReactNode }) {
  const [cargando, setCargando] = useState(true);
  const [sesion, setSesion] = useState<api.SesionIniciada | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ultimoUsuario, setUltimoUsuario] = useState<string | null>(null);
  const recordarRef = useRef(false);

  const terminarSesionLocal = useCallback(async (mensaje: string | null) => {
    setSesion(null);
    setAviso(mensaje);
    recordarRef.current = false;
    await borrar(CLAVE_SESION);
  }, []);

  // 401 desde cualquier endpoint → vuelve al login.
  useEffect(() => {
    registrarManejadorSesionInvalida(() => {
      void terminarSesionLocal('Tu sesión terminó. Vuelve a iniciar sesión.');
    });
    return () => registrarManejadorSesionInvalida(null);
  }, [terminarSesionLocal]);

  // Al abrir la app: recupera la sesión recordada si sigue vigente.
  useEffect(() => {
    (async () => {
      try {
        setUltimoUsuario(await leer(CLAVE_ULTIMO_USUARIO));
        const crudo = await leer(CLAVE_SESION);
        if (!crudo) return;

        const guardada = JSON.parse(crudo) as SesionGuardada;
        const expiraEn = new Date(guardada.expiraEn);
        if (Number.isNaN(expiraEn.getTime()) || expiraEn.getTime() <= Date.now()) {
          await terminarSesionLocal('Tu sesión venció. Vuelve a iniciar sesión.');
          return;
        }

        try {
          await api.validarSesion(guardada.token);
        } catch (e) {
          if (e instanceof ErrorApi && e.esSesionInvalida) return; // el manejador ya limpió todo
          // Sin conexión u otro error: se mantiene la sesión local; el próximo request lo resolverá.
        }

        recordarRef.current = true;
        setSesion({ token: guardada.token, expiraEn, usuario: guardada.usuario });
      } catch {
        await borrar(CLAVE_SESION);
      } finally {
        setCargando(false);
      }
    })();
  }, [terminarSesionLocal]);

  const persistir = useCallback(async (s: api.SesionIniciada) => {
    if (!recordarRef.current) return;
    const guardada: SesionGuardada = { token: s.token, expiraEn: s.expiraEn.toISOString(), usuario: s.usuario };
    await guardar(CLAVE_SESION, JSON.stringify(guardada));
  }, []);

  const iniciarSesion = useCallback(
    async (usuario: string, contrasena: string, recordar: boolean) => {
      const nueva = await api.iniciarSesion({
        usuario: usuario.trim().toLowerCase(),
        contrasena,
        idDispositivo: await obtenerIdDispositivo(),
        nombreDispositivo: obtenerNombreDispositivo(),
      });

      recordarRef.current = recordar;
      if (recordar) {
        await persistir(nueva);
        await guardar(CLAVE_ULTIMO_USUARIO, nueva.usuario.usuario);
        setUltimoUsuario(nueva.usuario.usuario);
      } else {
        await borrar(CLAVE_SESION);
        await borrar(CLAVE_ULTIMO_USUARIO);
        setUltimoUsuario(null);
      }
      setAviso(null);
      setSesion(nueva);
    },
    [persistir],
  );

  const cerrarSesion = useCallback(async () => {
    const token = sesion?.token;
    // Se libera el equipo en el servidor; si no hay conexión, la sesión local se cierra igual.
    if (token) {
      try {
        await api.cerrarSesion(token);
      } catch {
        // la sesión del servidor vencerá sola o el jefe puede liberarla
      }
    }
    await terminarSesionLocal(null);
  }, [sesion, terminarSesionLocal]);

  const cambiarContrasena = useCallback(
    async (actual: string, nueva: string) => {
      if (!sesion) throw new ErrorApi('No hay una sesión activa.', 401);
      const mensaje = await api.cambiarContrasena(sesion.token, actual, nueva);
      const actualizada = { ...sesion, usuario: { ...sesion.usuario, forzarCambioContrasena: false } };
      setSesion(actualizada);
      await persistir(actualizada);
      return mensaje;
    },
    [sesion, persistir],
  );

  const valor = useMemo<ValorSesion>(
    () => ({
      cargando,
      sesion,
      aviso,
      ultimoUsuario,
      iniciarSesion,
      cerrarSesion,
      cambiarContrasena,
      limpiarAviso: () => setAviso(null),
    }),
    [cargando, sesion, aviso, ultimoUsuario, iniciarSesion, cerrarSesion, cambiarContrasena],
  );

  return <ContextoSesion.Provider value={valor}>{children}</ContextoSesion.Provider>;
}

export function useSesion(): ValorSesion {
  const ctx = useContext(ContextoSesion);
  if (!ctx) throw new Error('useSesion debe usarse dentro de <ProveedorSesion>.');
  return ctx;
}
