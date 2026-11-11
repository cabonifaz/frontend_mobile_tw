import { entorno } from '@/config/entorno';
import { borrar, guardar, leer } from '@/sesion/almacenamiento';
import { INTENTOS_MAXIMOS, clasificarFallo } from '@/utilidades/demoras';
import { tituloPaso, type PendienteDeJornada } from '@/utilidades/jornada';
import { validarSesion } from './autenticacion';
import { ErrorApi } from './cliente';
import { marcarJornada, type MarcacionRegistrada, type TipoMarcacion } from './jornada';
import type { Ubicacion } from './ruta';

/**
 * Marcaciones de la jornada guardadas en el teléfono para enviarlas cuando vuelva la señal (HU-20 · trabajo sin conexión).
 *
 * Sin conexión la marcación se guarda con la hora del teléfono y el GPS, y se envía sola al recuperar la señal (al abrir la app, al volver a ella y
 * cada 30 s) y en el mismo orden en que se marcó, sin botón. El servidor valida la hora (no del futuro, no de hace más de 20 h), el orden y el GPS; si rechaza
 * una, se descarta y se avisa. Una sola marcación por tipo: reenviar una ya registrada no duplica nada. Mientras haya pendientes, una marcación nueva también
 * se guarda (así el orden se conserva). Sobrevive al cierre de sesión (solo se envía con el token del mismo técnico).
 */

const CLAVE = 'tw.cola.jornada';

export interface MarcacionGuardada extends PendienteDeJornada {
  idUsuario: number;
  intentos: number;
}

let memoria: MarcacionGuardada[] | null = null;
const escuchas = new Set<() => void>();

function avisarCambio() {
  escuchas.forEach((f) => f());
}

/** Se llama cuando cambia la cola de marcaciones. Devuelve la función para dejar de escuchar. */
export function suscribirColaJornada(f: () => void): () => void {
  escuchas.add(f);
  return () => {
    escuchas.delete(f);
  };
}

async function cargar(): Promise<MarcacionGuardada[]> {
  if (memoria) return memoria;
  let lista: MarcacionGuardada[] = [];
  try {
    const crudo = await leer(CLAVE);
    const v = crudo ? (JSON.parse(crudo) as unknown) : [];
    if (Array.isArray(v)) {
      lista = v.filter(
        (x): x is MarcacionGuardada =>
          !!x && typeof x === 'object' && typeof (x as MarcacionGuardada).idUsuario === 'number' && typeof (x as MarcacionGuardada).tipo === 'string' &&
          typeof (x as MarcacionGuardada).capturadoEn === 'string',
      );
    }
  } catch {
    // sin datos legibles: cola vacía
  }
  memoria = lista;
  return lista;
}

async function persistir(lista: MarcacionGuardada[]) {
  memoria = lista;
  if (lista.length === 0) await borrar(CLAVE);
  else await guardar(CLAVE, JSON.stringify(lista));
}

/** Marcaciones pendientes del técnico, de la más antigua a la más reciente. */
export async function pendientesJornada(idUsuario: number): Promise<MarcacionGuardada[]> {
  return (await cargar()).filter((p) => p.idUsuario === idUsuario).sort((a, b) => a.capturadoEn.localeCompare(b.capturadoEn));
}

async function encolar(idUsuario: number, tipo: TipoMarcacion, u: Ubicacion, capturadoEn: string): Promise<MarcacionGuardada> {
  const lista = (await cargar()).filter((p) => !(p.idUsuario === idUsuario && p.tipo === tipo));
  const nueva: MarcacionGuardada = { idUsuario, tipo, capturadoEn, latitud: u.latitud, longitud: u.longitud, precisionMetros: u.precisionMetros, intentos: 0 };
  await persistir([...lista, nueva]);
  avisarCambio();
  return nueva;
}

async function quitar(p: MarcacionGuardada) {
  await persistir((await cargar()).filter((x) => !(x.idUsuario === p.idUsuario && x.tipo === p.tipo)));
}

async function hayConexion(token: string): Promise<boolean> {
  try {
    await validarSesion(token);
    return true;
  } catch (e) {
    return !(e instanceof ErrorApi && e.estadoHttp === 0);
  }
}

export interface ResumenJornadaEnviada {
  enviadas: number;
  /** Mensajes para el técnico: marcaciones que el servidor rechazó. */
  avisos: string[];
  pendientes: number;
  sinConexion: boolean;
}

let enCurso: Promise<ResumenJornadaEnviada> | null = null;

/** Envía las marcaciones pendientes del técnico, en orden. No se pisa a sí misma. */
export function sincronizarJornada(token: string, idUsuario: number): Promise<ResumenJornadaEnviada> {
  if (!enCurso) {
    enCurso = ejecutar(token, idUsuario).finally(() => {
      enCurso = null;
    });
  }
  return enCurso;
}

async function ejecutar(token: string, idUsuario: number): Promise<ResumenJornadaEnviada> {
  const resumen: ResumenJornadaEnviada = { enviadas: 0, avisos: [], pendientes: 0, sinConexion: false };
  const lista = await pendientesJornada(idUsuario);
  if (entorno.usarMock) return { ...resumen, pendientes: lista.length };

  for (const p of lista) {
    try {
      await marcarJornada(token, {
        tipo: p.tipo,
        ubicacion: { latitud: p.latitud, longitud: p.longitud, precisionMetros: p.precisionMetros },
        marcadoEn: p.capturadoEn,
        sinConexion: true,
      });
      await quitar(p);
      resumen.enviadas++;
    } catch (e) {
      const destino = e instanceof ErrorApi ? clasificarFallo(e.estadoHttp, e.idTipoMensaje) : 'reintentar';
      if (destino === 'sesion') break;
      if (destino === 'rechazada') {
        await quitar(p);
        resumen.avisos.push(`La marcación «${tituloPaso(p.tipo)}» no se registró: ${e instanceof Error ? e.message : 'el servidor la rechazó.'}`);
        continue;
      }
      if (destino === 'sin_conexion' && !(await hayConexion(token))) {
        resumen.sinConexion = true;
        break;
      }
      const intentos = p.intentos + 1;
      if (intentos >= INTENTOS_MAXIMOS) {
        await quitar(p);
        resumen.avisos.push(`La marcación «${tituloPaso(p.tipo)}» no se pudo registrar tras varios intentos. Márcala de nuevo.`);
      } else {
        await persistir((await cargar()).map((x) => (x.idUsuario === p.idUsuario && x.tipo === p.tipo ? { ...x, intentos } : x)));
      }
    }
  }

  resumen.pendientes = (await pendientesJornada(idUsuario)).length;
  avisarCambio();
  return resumen;
}

export type ResultadoMarcar =
  | { estado: 'enviada'; mensaje: string; datos: MarcacionRegistrada | null }
  /** Guardada en el teléfono: se envía sola al volver la señal. */
  | { estado: 'en_cola'; pendiente: MarcacionGuardada };

/**
 * Marca un paso. Con conexión va directo al servidor. Sin conexión (o con marcaciones ya guardadas, para no romper el orden) se guarda en el teléfono con
 * la hora y el GPS de ahora. Cualquier otro error (fuera de orden, jornada ya finalizada, GPS inválido…) se propaga: el técnico lo ve.
 */
export async function marcarOEncolar(token: string, idUsuario: number, tipo: TipoMarcacion, u: Ubicacion): Promise<ResultadoMarcar> {
  const capturadoEn = new Date().toISOString();
  const habiaPendientes = (await pendientesJornada(idUsuario)).length > 0;
  if (!habiaPendientes) {
    try {
      const r = await marcarJornada(token, { tipo, ubicacion: u });
      return { estado: 'enviada', mensaje: r.mensaje, datos: r.datos };
    } catch (e) {
      if (!(e instanceof ErrorApi) || e.estadoHttp !== 0) throw e;
    }
  }
  const pendiente = await encolar(idUsuario, tipo, u, capturadoEn);
  if (habiaPendientes) void sincronizarJornada(token, idUsuario).catch(() => undefined);
  return { estado: 'en_cola', pendiente };
}
