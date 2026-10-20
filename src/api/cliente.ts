import { entorno } from '@/config/entorno';

/**
 * Sobre de respuesta del backend (RespuestaDto<T> en .NET):
 *   idTipoMensaje 1 = regla de negocio, 2 = éxito, 3 = error del sistema.
 */
export interface Respuesta<T> {
  idTipoMensaje: 1 | 2 | 3;
  mensaje: string;
  datos?: T | null;
}

/** Error de la API ya traducido a un mensaje para mostrar al usuario. */
export class ErrorApi extends Error {
  constructor(
    mensaje: string,
    /** Código HTTP (0 = sin conexión / timeout). */
    readonly estadoHttp: number,
    /** idTipoMensaje del backend, si vino. */
    readonly idTipoMensaje?: number,
  ) {
    super(mensaje);
    this.name = 'ErrorApi';
  }

  /** La sesión ya no es válida (vencida, liberada por el jefe o usuario desactivado). */
  get esSesionInvalida(): boolean {
    return this.estadoHttp === 401;
  }
}

type ManejadorSesionInvalida = () => void;
let alInvalidarSesion: ManejadorSesionInvalida | null = null;

/** El proveedor de sesión se registra aquí para cerrar la sesión local ante un 401. */
export function registrarManejadorSesionInvalida(fn: ManejadorSesionInvalida | null) {
  alInvalidarSesion = fn;
}

interface OpcionesRequest {
  metodo?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  cuerpo?: unknown;
  token?: string | null;
  /** false = un 401 no cierra la sesión local (p. ej. el propio login). */
  manejarSesionInvalida?: boolean;
}

/**
 * Llama al backend y devuelve `datos` si idTipoMensaje = 2.
 * En cualquier otro caso lanza ErrorApi con el mensaje del backend.
 */
export async function solicitar<T>(ruta: string, opciones: OpcionesRequest = {}): Promise<Respuesta<T>> {
  const { metodo = 'GET', cuerpo, token, manejarSesionInvalida = true } = opciones;

  if (!entorno.apiUrl) {
    throw new ErrorApi('La app no tiene configurada la URL del backend (EXPO_PUBLIC_API_URL).', 0);
  }

  const controlador = new AbortController();
  const temporizador = setTimeout(() => controlador.abort(), entorno.timeoutMs);

  let respuestaHttp: Response;
  try {
    respuestaHttp = await fetch(`${entorno.apiUrl}${ruta}`, {
      method: metodo,
      headers: {
        Accept: 'application/json',
        ...(cuerpo !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined,
      signal: controlador.signal,
    });
  } catch (e) {
    const abortado = e instanceof Error && e.name === 'AbortError';
    throw new ErrorApi(
      abortado
        ? 'El servidor tardó demasiado en responder. Revisa tu conexión e inténtalo de nuevo.'
        : 'No se pudo conectar con el servidor. Revisa tu conexión a internet.',
      0,
    );
  } finally {
    clearTimeout(temporizador);
  }

  let cuerpoRespuesta: Respuesta<T> | null = null;
  try {
    cuerpoRespuesta = (await respuestaHttp.json()) as Respuesta<T>;
  } catch {
    cuerpoRespuesta = null;
  }

  // 401 en un endpoint protegido = la sesión ya no existe en el servidor.
  if (respuestaHttp.status === 401 && token && manejarSesionInvalida) {
    alInvalidarSesion?.();
    throw new ErrorApi('Tu sesión terminó. Vuelve a iniciar sesión.', 401);
  }

  if (cuerpoRespuesta && typeof cuerpoRespuesta.idTipoMensaje === 'number') {
    if (cuerpoRespuesta.idTipoMensaje === 2) return cuerpoRespuesta;
    throw new ErrorApi(
      cuerpoRespuesta.mensaje || 'No se pudo completar la operación.',
      respuestaHttp.status,
      cuerpoRespuesta.idTipoMensaje,
    );
  }

  throw new ErrorApi(
    respuestaHttp.status >= 500
      ? 'El servidor tuvo un problema. Inténtalo en unos minutos.'
      : `Respuesta inesperada del servidor (HTTP ${respuestaHttp.status}).`,
    respuestaHttp.status,
  );
}

/**
 * El backend envía las fechas en hora de Lima y sin zona ("2026-10-21T00:50:33").
 * Las convierte a Date agregando -05:00 cuando no traen zona.
 */
export function fechaDesdeApi(valor: string): Date {
  const tieneZona = /([zZ]|[+-]\d{2}:?\d{2})$/.test(valor);
  return new Date(tieneZona ? valor : `${valor}-05:00`);
}
