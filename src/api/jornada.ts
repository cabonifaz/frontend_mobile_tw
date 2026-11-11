import { entorno } from '@/config/entorno';
import { solicitar } from './cliente';
import { conRespaldo, type ConRespaldo } from './respaldo';
import type { Ubicacion } from './ruta';
import type { ExtrasUbicacion } from './ubicacion';

/**
 * HU-20 — Reloj marcador de jornada.
 *   GET  api/movil/jornada                 → SP_ObtenerJornadaMovil (la jornada de hoy, hora de Lima)
 *   POST api/movil/jornada/marcaciones     → SP_RegistrarMarcacionJornadaMovil (orden estricto, GPS, a tiempo / tardanza; idempotente)
 *   POST api/movil/jornada/ubicacion       → SP_RegistrarUbicacionJornadaMovil (posición mientras la jornada está en curso; alimenta el mapa de la intranet)
 * El servidor decide el orden, la hora válida y la puntualidad; la app solo muestra y guarda sin conexión (ver colaJornada.ts).
 */

export type TipoMarcacion = 'inicio_labores' | 'inicio_refrigerio' | 'fin_refrigerio' | 'salida_planta' | 'fin_labores';
export type EstadoJornada = 'sin_iniciar' | 'en_labores' | 'en_refrigerio' | 'salio_planta' | 'finalizada';
export type Puntualidad = 'a_tiempo' | 'tardanza';

export interface Marcacion {
  tipo: TipoMarcacion;
  /** "HH:mm" (hora de Lima). */
  hora: string;
  /** ISO 8601 UTC ("…Z"). */
  marcadoUtc: string;
  lugar: string | null;
  latitud: number | null;
  longitud: number | null;
  precisionM: number | null;
  /** Solo el ingreso (inicio de labores). */
  puntualidad: Puntualidad | null;
  minutosDiferencia: number | null;
  /** Se marcó sin conexión y se envió después. */
  sinConexion: boolean;
  /** Solo en la app: todavía está guardada en el teléfono (no llegó al servidor). */
  pendiente?: boolean;
}

export interface ResumenJornada {
  trabajadoMin: number;
  refrigerioMin: number;
  ingreso: Puntualidad | null;
  minutosTardanza: number | null;
}

export interface Jornada {
  /** "yyyy-MM-dd" (Lima). */
  fecha: string;
  ahoraUtc: string;
  estado: EstadoJornada;
  /** El único paso habilitado (null cuando la jornada terminó). */
  siguiente: TipoMarcacion | null;
  /** "HH:mm". */
  inicioProgramado: string;
  finProgramado: string;
  toleranciaMin: number;
  refrigerioMaxMin: number;
  marcaciones: Marcacion[];
  resumen: ResumenJornada | null;
}

export interface MarcacionRegistrada {
  tipo: TipoMarcacion;
  repetida: boolean;
  estado: EstadoJornada;
  siguiente: TipoMarcacion | null;
  hora: string | null;
  lugar: string | null;
  puntualidad: Puntualidad | null;
  minutosDiferencia: number | null;
}

export interface NuevaMarcacion {
  tipo: TipoMarcacion;
  ubicacion: Ubicacion;
  /** ISO 8601 UTC: la hora en que el teléfono tomó la marcación (la validada al marcar sin conexión). */
  marcadoEn?: string;
  sinConexion?: boolean;
}

const JORNADA_VACIA: Jornada = {
  fecha: '',
  ahoraUtc: '',
  estado: 'sin_iniciar',
  siguiente: 'inicio_labores',
  inicioProgramado: '07:45',
  finProgramado: '17:00',
  toleranciaMin: 5,
  refrigerioMaxMin: 60,
  marcaciones: [],
  resumen: null,
};

export async function obtenerJornada(token: string): Promise<Jornada> {
  if (entorno.usarMock) return { ...JORNADA_VACIA, ahoraUtc: new Date().toISOString() };
  return (await solicitar<Jornada>('/api/movil/jornada', { token })).datos ?? JORNADA_VACIA;
}

/** La jornada de hoy; sin conexión devuelve la última guardada (la pantalla le suma las marcaciones pendientes del teléfono). */
export function obtenerJornadaConRespaldo(token: string, idUsuario: number): Promise<ConRespaldo<Jornada>> {
  return conRespaldo(idUsuario, 'jornada', () => obtenerJornada(token));
}

export async function marcarJornada(token: string, m: NuevaMarcacion): Promise<{ mensaje: string; datos: MarcacionRegistrada | null }> {
  if (entorno.usarMock) {
    return { mensaje: 'Marcación registrada.', datos: { tipo: m.tipo, repetida: false, estado: 'en_labores', siguiente: null, hora: null, lugar: null, puntualidad: null, minutosDiferencia: null } };
  }
  const r = await solicitar<MarcacionRegistrada>('/api/movil/jornada/marcaciones', {
    token,
    metodo: 'POST',
    cuerpo: {
      tipo: m.tipo,
      latitud: m.ubicacion.latitud,
      longitud: m.ubicacion.longitud,
      precisionMetros: m.ubicacion.precisionMetros,
      ...(m.marcadoEn ? { marcadoEn: m.marcadoEn } : {}),
      sinConexion: m.sinConexion === true,
    },
  });
  return { mensaje: r.mensaje, datos: r.datos ?? null };
}

/** Posición GPS con la jornada en curso (la acepta el servidor aunque no haya un servicio en curso). */
export async function enviarUbicacionJornada(token: string, u: Ubicacion, extras: ExtrasUbicacion = {}): Promise<void> {
  if (entorno.usarMock) return;
  await solicitar('/api/movil/jornada/ubicacion', {
    token,
    metodo: 'POST',
    cuerpo: {
      latitud: u.latitud,
      longitud: u.longitud,
      precisionMetros: u.precisionMetros,
      ...(extras.velocidadKmh != null ? { velocidadKmh: extras.velocidadKmh } : {}),
      ...(extras.altitudM != null ? { altitudM: extras.altitudM } : {}),
    },
  });
}
