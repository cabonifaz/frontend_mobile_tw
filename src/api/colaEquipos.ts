import { entorno } from '@/config/entorno';
import { borrar, guardar, leer } from '@/sesion/almacenamiento';
import { INTENTOS_MAXIMOS, clasificarFallo } from '@/utilidades/demoras';
import { validarAccionLocal, type AccionPendiente } from '@/utilidades/objetivos';
import { validarSesion } from './autenticacion';
import { ErrorApi } from './cliente';
import { llegadaPendiente } from './colaLlegadas';
import { cambiarEstadoEquipo, type AccionEquipo, type Objetivos } from './ruta';

/**
 * Acciones sobre los equipos guardadas en el teléfono para enviarlas cuando vuelva la señal (HU-07 · trabajo sin conexión).
 *
 * "Trabajar en el equipo" (iniciar), "Pausar" y "Reanudar" no se pierden sin señal: si no hay conexión la app las guarda con la hora en que
 * el técnico tocó el botón (`capturadoEn`) y las envía solas, EN ORDEN, al recuperar la señal (al abrir la app, al volver a ella y cada 30 s).
 * El back usa esa hora para el tiempo trabajado y reconoce una acción repetida, así que no se duplica. Mientras tanto la lista de objetivos
 * muestra el equipo ya en ese estado (`aplicarPendientes`).
 *
 *  - Cada acción es una clave (`tw.cola.equipo.<id>`) más un índice: el almacenamiento seguro limita el tamaño de cada valor.
 *  - Sobreviven al cierre de sesión y solo se envían con el token del mismo técnico.
 *  - Se envían DESPUÉS de la llegada del mismo servicio (sin llegada el back las rechazaría por el Hard Stop).
 *  - Una acción que el servidor rechaza (la OS cambió de estado, otro equipo en ejecución…) se descarta y se avisa; si se rechaza una, también se
 *    descartan las siguientes del mismo equipo (dependían de ella). Las que fallan por la señal se conservan.
 *  - Registrar un equipo nuevo (NEW) NO se guarda sin conexión: sube la foto de la placa y avisa al área, así que exige conexión.
 */

const CLAVE_INDICE = 'tw.cola.equipos';
const claveDe = (id: string) => `tw.cola.equipo.${id}`;

export interface AccionEquipoPendiente extends AccionPendiente {
  idLocal: string;
  idUsuario: number;
  idOs: number;
  numeroOs: string;
  /** Código o serie del equipo, para los avisos. */
  equipo: string;
  intentos: number;
}

let memoria: Map<string, AccionEquipoPendiente> | null = null;
let contador = 0;
const escuchas = new Set<() => void>();

function avisarCambio() {
  escuchas.forEach((f) => f());
}

/** Se llama cuando cambia la cola de acciones de equipos. Devuelve la función para dejar de escuchar. */
export function suscribirColaEquipos(f: () => void): () => void {
  escuchas.add(f);
  return () => {
    escuchas.delete(f);
  };
}

async function cargar(): Promise<Map<string, AccionEquipoPendiente>> {
  if (memoria) return memoria;
  const mapa = new Map<string, AccionEquipoPendiente>();
  try {
    const crudo = await leer(CLAVE_INDICE);
    const ids = crudo ? (JSON.parse(crudo) as unknown) : [];
    for (const id of Array.isArray(ids) ? ids.filter((x): x is string => typeof x === 'string' && /^[A-Za-z0-9]+$/.test(x)) : []) {
      try {
        const item = await leer(claveDe(id));
        if (item) mapa.set(id, JSON.parse(item) as AccionEquipoPendiente);
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

async function persistirIndice(m: Map<string, AccionEquipoPendiente>) {
  await guardar(CLAVE_INDICE, JSON.stringify([...m.keys()]));
}

function nuevoId(): string {
  contador += 1;
  return `${Date.now().toString(36)}${contador.toString(36)}`;
}

/** Guarda una acción para enviarla después. */
export async function encolarAccionEquipo(entrada: Omit<AccionEquipoPendiente, 'idLocal' | 'intentos'>): Promise<AccionEquipoPendiente> {
  const m = await cargar();
  const p: AccionEquipoPendiente = { ...entrada, idLocal: nuevoId(), intentos: 0 };
  m.set(p.idLocal, p);
  await guardar(claveDe(p.idLocal), JSON.stringify(p));
  await persistirIndice(m);
  avisarCambio();
  return p;
}

/** Acciones pendientes del técnico (de un servicio, o de todos), de la más antigua a la más reciente. */
export async function accionesPendientes(idUsuario: number, idOs?: number): Promise<AccionEquipoPendiente[]> {
  return [...(await cargar()).values()]
    .filter((p) => p.idUsuario === idUsuario && (idOs === undefined || p.idOs === idOs))
    .sort((a, b) => a.capturadoEn.localeCompare(b.capturadoEn));
}

async function quitar(idLocal: string) {
  const m = await cargar();
  m.delete(idLocal);
  await borrar(claveDe(idLocal));
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

export interface ResumenAccionesEquipos {
  enviadas: number;
  /** Mensajes para el técnico: acciones que el servidor rechazó. */
  avisos: string[];
  pendientes: number;
  sinConexion: boolean;
}

const verbo: Record<AccionEquipo, string> = { iniciar: 'iniciar el trabajo en', pausar: 'pausar', reanudar: 'reanudar' };

let enCurso: Promise<ResumenAccionesEquipos> | null = null;

/** Envía las acciones pendientes del técnico en el orden en que las hizo. No se pisa a sí misma. */
export function sincronizarAccionesEquipos(token: string, idUsuario: number): Promise<ResumenAccionesEquipos> {
  if (!enCurso) {
    enCurso = ejecutar(token, idUsuario).finally(() => {
      enCurso = null;
    });
  }
  return enCurso;
}

async function ejecutar(token: string, idUsuario: number): Promise<ResumenAccionesEquipos> {
  const resumen: ResumenAccionesEquipos = { enviadas: 0, avisos: [], pendientes: 0, sinConexion: false };
  const lista = await accionesPendientes(idUsuario);
  if (entorno.usarMock) return { ...resumen, pendientes: lista.length };

  const descartados = new Set<number>(); // equipos con una acción rechazada en esta pasada
  const esperandoLlegada = new Map<number, boolean>();

  for (const p of lista) {
    if (descartados.has(p.idOsEquipo)) {
      await quitar(p.idLocal);
      continue;
    }
    // Sin la llegada registrada en el servidor el back la rechazaría (Hard Stop): se espera a que se envíe la llegada
    if (!esperandoLlegada.has(p.idOs)) esperandoLlegada.set(p.idOs, !!(await llegadaPendiente(idUsuario, p.idOs)));
    if (esperandoLlegada.get(p.idOs)) continue;

    try {
      await cambiarEstadoEquipo(token, p.idOs, p.idOsEquipo, p.accion, { motivo: p.motivo ?? undefined, capturadoEn: p.capturadoEn });
      await quitar(p.idLocal);
      resumen.enviadas++;
    } catch (e) {
      const destino = e instanceof ErrorApi ? clasificarFallo(e.estadoHttp, e.idTipoMensaje) : 'reintentar';
      if (destino === 'sesion') break;
      if (destino === 'rechazada') {
        await quitar(p.idLocal);
        descartados.add(p.idOsEquipo);
        resumen.avisos.push(`No se pudo ${verbo[p.accion]} ${p.equipo} (${p.numeroOs}): ${e instanceof Error ? e.message : 'el servidor lo rechazó.'}`);
        continue;
      }
      if (destino === 'sin_conexion' && !(await hayConexion(token))) {
        resumen.sinConexion = true;
        break;
      }
      const m = await cargar();
      const actualizada = { ...p, intentos: p.intentos + 1 };
      if (actualizada.intentos >= INTENTOS_MAXIMOS) {
        await quitar(p.idLocal);
        descartados.add(p.idOsEquipo);
        resumen.avisos.push(`No se pudo ${verbo[p.accion]} ${p.equipo} (${p.numeroOs}) tras varios intentos. Vuelve a hacerlo desde los objetivos.`);
      } else {
        m.set(p.idLocal, actualizada);
        await guardar(claveDe(p.idLocal), JSON.stringify(actualizada));
      }
    }
  }

  resumen.pendientes = (await accionesPendientes(idUsuario)).length;
  avisarCambio();
  return resumen;
}

export type ResultadoAccionEquipo =
  | { estado: 'enviada'; mensaje: string; objetivos: Objetivos | null }
  /** Guardada en el teléfono. `conConexion` = hay señal pero el envío falló: se reintenta sola. */
  | { estado: 'en_cola'; pendiente: AccionEquipoPendiente; conConexion: boolean };

/**
 * Inicia, pausa o reanuda un equipo. Si no hay conexión (o se agota el tiempo) guarda la acción en el teléfono con la hora en que se tocó el
 * botón: si el servidor sí la había recibido, el reintento se reconoce y no se duplica. Cualquier otro error (regla de negocio, sesión…) se
 * propaga: el técnico lo ve. `vista` = los objetivos que el técnico tiene en pantalla (con las acciones pendientes ya aplicadas): sirve para no
 * guardar sin conexión una acción que se sabe que el back rechazará.
 */
export async function accionEquipoOEncolar(
  token: string,
  datos: { idUsuario: number; idOs: number; numeroOs: string; equipo: string },
  vista: Objetivos,
  idOsEquipo: number,
  accion: AccionEquipo,
  motivo?: string,
): Promise<ResultadoAccionEquipo> {
  // El orden importa: si hay acciones anteriores sin enviar de este servicio, primero se intenta enviarlas
  if ((await accionesPendientes(datos.idUsuario, datos.idOs)).length > 0) {
    await sincronizarAccionesEquipos(token, datos.idUsuario).catch(() => undefined);
  }
  const hayAnteriores = (await accionesPendientes(datos.idUsuario, datos.idOs)).length > 0;
  const capturadoEn = new Date().toISOString();
  const guardarEnCola = async (): Promise<ResultadoAccionEquipo> => {
    const error = validarAccionLocal(vista, idOsEquipo, accion, motivo);
    if (error) throw new ErrorApi(error, 400, 1);
    const pendiente = await encolarAccionEquipo({ ...datos, idOsEquipo, accion, motivo: motivo?.trim() || null, capturadoEn });
    return { estado: 'en_cola', pendiente, conConexion: await hayConexion(token) };
  };

  if (hayAnteriores) return guardarEnCola(); // no se adelanta a las anteriores

  try {
    const r = await cambiarEstadoEquipo(token, datos.idOs, idOsEquipo, accion, { motivo, capturadoEn });
    return { estado: 'enviada', mensaje: r.mensaje, objetivos: r.objetivos };
  } catch (e) {
    if (!(e instanceof ErrorApi) || e.estadoHttp !== 0) throw e;
    return guardarEnCola();
  }
}
