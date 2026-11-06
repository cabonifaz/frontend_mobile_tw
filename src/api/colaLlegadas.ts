import { entorno } from '@/config/entorno';
import { borrar, guardar, leer } from '@/sesion/almacenamiento';
import { INTENTOS_MAXIMOS, clasificarFallo } from '@/utilidades/demoras';
import { validarSesion } from './autenticacion';
import { ErrorApi } from './cliente';
import { registrarLlegada, type ResultadoLlegada, type Ubicacion } from './ruta';

/**
 * Llegadas a planta guardadas en el teléfono para enviarlas cuando vuelva la señal (HU-06 · trabajo sin conexión).
 *
 * Si al confirmar la llegada no hay conexión, la app la valida con la última planta guardada (ver `evaluarLlegadaLocal`), la guarda con el GPS,
 * la precisión y la hora en que se confirmó, y la envía sola al recuperar la señal (al abrir la app, al volver a ella y cada 30 s). Mientras tanto
 * los objetivos quedan habilitados. El back vuelve a evaluar el mismo GPS: si la rechaza (la OS cambió de estado, no estaba en rango), se descarta
 * y se avisa. Una sola llegada por servicio; reintentar un envío ya registrado no duplica nada.
 * Se envía ANTES que las demoras (una demora de ingreso a planta necesita la llegada registrada). Sobrevive al cierre de sesión (solo se envía con
 * el token del mismo técnico).
 */

const CLAVE_INDICE = 'tw.cola.llegadas';
const claveDe = (idOs: number) => `tw.cola.llegada.${idOs}`;

export interface LlegadaPendiente {
  idUsuario: number;
  idOs: number;
  numeroOs: string;
  latitud: number;
  longitud: number;
  precisionMetros: number;
  /** ISO 8601, UTC: la hora en que el técnico confirmó la llegada. */
  capturadoEn: string;
  intentos: number;
}

let memoria: Map<number, LlegadaPendiente> | null = null;
const escuchas = new Set<() => void>();

function avisarCambio() {
  escuchas.forEach((f) => f());
}

/** Se llama cuando cambia la cola de llegadas. Devuelve la función para dejar de escuchar. */
export function suscribirColaLlegadas(f: () => void): () => void {
  escuchas.add(f);
  return () => {
    escuchas.delete(f);
  };
}

async function cargar(): Promise<Map<number, LlegadaPendiente>> {
  if (memoria) return memoria;
  const mapa = new Map<number, LlegadaPendiente>();
  try {
    const crudo = await leer(CLAVE_INDICE);
    const ids = crudo ? (JSON.parse(crudo) as unknown) : [];
    for (const idOs of Array.isArray(ids) ? ids.filter((x): x is number => Number.isInteger(x)) : []) {
      try {
        const item = await leer(claveDe(idOs));
        if (item) mapa.set(idOs, JSON.parse(item) as LlegadaPendiente);
      } catch {
        // un valor dañado no debe impedir el resto
      }
    }
  } catch {
    // sin índice legible: cola vacía
  }
  memoria = mapa;
  return mapa;
}

async function persistirIndice(m: Map<number, LlegadaPendiente>) {
  await guardar(CLAVE_INDICE, JSON.stringify([...m.keys()]));
}

/** Guarda la llegada de un servicio para enviarla después (una por servicio: una nueva reemplaza a la anterior). */
export async function encolarLlegada(entrada: Omit<LlegadaPendiente, 'intentos'>): Promise<LlegadaPendiente> {
  const m = await cargar();
  const p: LlegadaPendiente = { ...entrada, intentos: 0 };
  m.set(p.idOs, p);
  await guardar(claveDe(p.idOs), JSON.stringify(p));
  await persistirIndice(m);
  avisarCambio();
  return p;
}

/** La llegada guardada de ese servicio y técnico, si aún no se envió. */
export async function llegadaPendiente(idUsuario: number, idOs: number): Promise<LlegadaPendiente | null> {
  const p = (await cargar()).get(idOs);
  return p && p.idUsuario === idUsuario ? p : null;
}

/** Llegadas pendientes del técnico, de la más antigua a la más reciente. */
export async function pendientesLlegadas(idUsuario: number): Promise<LlegadaPendiente[]> {
  return [...(await cargar()).values()].filter((p) => p.idUsuario === idUsuario).sort((a, b) => a.capturadoEn.localeCompare(b.capturadoEn));
}

async function quitar(idOs: number) {
  const m = await cargar();
  m.delete(idOs);
  await borrar(claveDe(idOs));
  await persistirIndice(m);
}

async function hayConexion(token: string): Promise<boolean> {
  try {
    await validarSesion(token);
    return true;
  } catch (e) {
    return !(e instanceof ErrorApi && e.estadoHttp === 0);
  }
}

export interface ResumenLlegadas {
  enviadas: number;
  /** Mensajes para el técnico: llegadas que el servidor rechazó. */
  avisos: string[];
  pendientes: number;
  sinConexion: boolean;
}

let enCurso: Promise<ResumenLlegadas> | null = null;

/** Envía las llegadas pendientes del técnico (una por servicio). No se pisa a sí misma. */
export function sincronizarLlegadas(token: string, idUsuario: number): Promise<ResumenLlegadas> {
  if (!enCurso) {
    enCurso = ejecutar(token, idUsuario).finally(() => {
      enCurso = null;
    });
  }
  return enCurso;
}

async function ejecutar(token: string, idUsuario: number): Promise<ResumenLlegadas> {
  const resumen: ResumenLlegadas = { enviadas: 0, avisos: [], pendientes: 0, sinConexion: false };
  const lista = await pendientesLlegadas(idUsuario);
  if (entorno.usarMock) return { ...resumen, pendientes: lista.length };

  for (const p of lista) {
    try {
      await registrarLlegada(token, p.idOs, { latitud: p.latitud, longitud: p.longitud, precisionMetros: p.precisionMetros }, p.capturadoEn);
      await quitar(p.idOs);
      resumen.enviadas++;
    } catch (e) {
      const destino = e instanceof ErrorApi ? clasificarFallo(e.estadoHttp, e.idTipoMensaje) : 'reintentar';
      if (destino === 'sesion') break;
      if (destino === 'rechazada') {
        await quitar(p.idOs);
        resumen.avisos.push(`La llegada de ${p.numeroOs} no se registró: ${e instanceof Error ? e.message : 'el servidor la rechazó.'}`);
        continue;
      }
      if (destino === 'sin_conexion' && !(await hayConexion(token))) {
        resumen.sinConexion = true;
        break;
      }
      const m = await cargar();
      const actualizada = { ...p, intentos: p.intentos + 1 };
      if (actualizada.intentos >= INTENTOS_MAXIMOS) {
        await quitar(p.idOs);
        resumen.avisos.push(`La llegada de ${p.numeroOs} no se pudo registrar tras varios intentos. Regístrala de nuevo.`);
      } else {
        m.set(p.idOs, actualizada);
        await guardar(claveDe(p.idOs), JSON.stringify(actualizada));
      }
    }
  }

  resumen.pendientes = (await pendientesLlegadas(idUsuario)).length;
  avisarCambio();
  return resumen;
}

export type ResultadoRegistroLlegada =
  | { estado: 'enviada'; mensaje: string; datos: ResultadoLlegada | null }
  /** Guardada en el teléfono. `conConexion` = hay señal pero el envío falló: se reintenta sola. */
  | { estado: 'en_cola'; pendiente: LlegadaPendiente; conConexion: boolean };

/**
 * Confirma la llegada. Si no hay conexión (o se agota el tiempo) la guarda en el teléfono con la misma hora de captura:
 * si el servidor sí la había recibido, el reintento se reconoce y no se duplica. Cualquier otro error (fuera de rango, OS que ya
 * no está en ruta…) se propaga: el técnico lo ve y puede volver a capturar.
 */
export async function registrarLlegadaOEncolar(
  token: string,
  idOs: number,
  datos: { idUsuario: number; numeroOs: string },
  u: Ubicacion,
  capturadoEn: string,
): Promise<ResultadoRegistroLlegada> {
  try {
    const r = await registrarLlegada(token, idOs, u, capturadoEn);
    return { estado: 'enviada', mensaje: r.mensaje, datos: r.datos };
  } catch (e) {
    if (!(e instanceof ErrorApi) || e.estadoHttp !== 0) throw e;
    const pendiente = await encolarLlegada({
      idUsuario: datos.idUsuario,
      idOs,
      numeroOs: datos.numeroOs,
      latitud: u.latitud,
      longitud: u.longitud,
      precisionMetros: u.precisionMetros,
      capturadoEn,
    });
    return { estado: 'en_cola', pendiente, conConexion: await hayConexion(token) };
  }
}
