import { AppState } from 'react-native';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import * as api from '@/api/autenticacion';
import { limpiarCacheCatalogos } from '@/api/catalogos';
import { ErrorApi, MENSAJE_SESION_TERMINADA, registrarManejadorSesionInvalida } from '@/api/cliente';
import { entorno } from '@/config/entorno';
import { borrarRespaldos } from '@/api/respaldo';
import { borrar, guardar, leer } from './almacenamiento';
import { obtenerIdDispositivo, obtenerNombreDispositivo } from './dispositivo';

/**
 * Sesión de la app (App Mobile HU-01).
 *  - "Recordar sesión" marcado: el token se guarda en el almacenamiento seguro y al
 *    abrir la app se entra directo (si la sesión sigue vigente en el servidor).
 *  - Sin marcar: la sesión vive solo mientras la app esté abierta.
 *  - Si el servidor responde 401 (sesión vencida, liberada por el jefe, usuario desactivado o ingreso del mismo usuario en
 *    otro equipo) se vuelve al login con el motivo que trae el servidor.
 *  - Sesión única: un usuario solo puede estar en un equipo. Al ingresar en otro, el servidor cierra la sesión de este; para que
 *    se note sin esperar a que el técnico toque algo, la app consulta la sesión cada 30 s y al volver a primer plano
 *    (sin conexión no pasa nada: se reintenta luego). Lo guardado sin conexión (demoras, llegadas) no se borra al cerrar.
 *  - Modo offline: con "Recordar sesión", la app abre aunque no haya conexión y muestra lo
 *    último guardado en el teléfono (src/api/respaldo.ts). El primer ingreso sí necesita internet.
 *  - Al salir de la app o terminar la sesión se borra todo lo guardado en el teléfono.
 */

const CLAVE_SESION = 'tw.sesion';
const CLAVE_ULTIMO_USUARIO = 'tw.ultimoUsuario';
const CADA_VIGILANCIA_MS = 30_000;

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
    limpiarCacheCatalogos();
    await borrar(CLAVE_SESION);
    await borrarRespaldos();
  }, []);

  // 401 desde cualquier endpoint → vuelve al login.
  useEffect(() => {
    registrarManejadorSesionInvalida((mensaje) => {
      void terminarSesionLocal(mensaje);
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

  // Vigilancia de la sesión única: detecta pronto que otro equipo ingresó con este usuario.
  const tokenVigilado = sesion?.token ?? null;
  useEffect(() => {
    if (!tokenVigilado || entorno.usarMock) return;
    let vigente = true;
    let enCurso = false;

    async function vigilar() {
      if (enCurso || AppState.currentState !== 'active' || !tokenVigilado) return;
      enCurso = true;
      try {
        await api.validarSesion(tokenVigilado, false);
      } catch (e) {
        // Solo un 401 cierra la sesión (y solo si sigue siendo la misma); sin conexión u otro error se reintenta luego.
        if (vigente && e instanceof ErrorApi && e.esSesionInvalida) {
          await terminarSesionLocal(e.idTipoMensaje === 1 && e.message ? e.message : MENSAJE_SESION_TERMINADA);
        }
      } finally {
        enCurso = false;
      }
    }

    const reloj = setInterval(() => void vigilar(), CADA_VIGILANCIA_MS);
    const estadoApp = AppState.addEventListener('change', (e) => {
      if (e === 'active') void vigilar();
    });
    return () => {
      vigente = false;
      clearInterval(reloj);
      estadoApp.remove();
    };
  }, [tokenVigilado, terminarSesionLocal]);

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
