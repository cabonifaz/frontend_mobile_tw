import { entorno } from '@/config/entorno';
import { borrar, guardar, leer } from '@/sesion/almacenamiento';
import {
  INTENTOS_ANTES_DE_SOLTAR_FOTO,
  INTENTOS_MAXIMOS,
  clasificarFallo,
  descripcionQueEntra,
} from '@/utilidades/demoras';
import { validarSesion } from './autenticacion';
import { ErrorApi } from './cliente';
import { registrarDemora, type NuevaDemora, type ResultadoDemora, type TipoDemora } from './ruta';

/**
 * Demoras guardadas en el teléfono para enviarlas cuando vuelva la señal (HU-05 · trabajo sin conexión).
 *
 * Si al registrar una demora no hay conexión, la app NO la pierde ni obliga a repetirla: la guarda en el almacenamiento seguro
 * del teléfono junto con la hora en que se registró (`capturadoEn`) y la envía sola al recuperar la señal (al abrir la app, al volver
 * a ella y cada 30 s mientras haya pendientes). El back usa esa hora y reconoce un envío repetido, así que no se duplica.
 *
 *  - Cada demora es una clave (`tw.cola.demora.<id>`) más un índice: el almacenamiento seguro limita el tamaño de cada valor.
 *  - Sobreviven al cierre de sesión: se envían cuando el MISMO técnico vuelve a entrar (con el token de otro nunca se envían).
 *  - Una demora que el servidor rechaza (la OS ya cambió de estado, etc.) se descarta y se avisa; las que fallan por la señal se conservan.
 *  - Una foto que no logra subirse (muy pesada o servidor) tras 3 intentos con conexión se suelta: la demora se registra sin ella.
 */

const CLAVE_INDICE = 'tw.cola.demoras';
const claveDe = (id: string) => `tw.cola.demora.${id}`;
/** Margen bajo el límite de valor del almacenamiento seguro. */
const MAXIMO_BYTES_VALOR = 1900;

export interface DemoraPendiente {
  idLocal: string;
  idUsuario: number;
  idOs: number;
  numeroOs: string;
  /** Nombre del motivo, para mostrarlo en la lista. */
  motivo: string;
  tipo: TipoDemora;
  idMotivo: number;
  duracionMinutos: number;
  descripcion: string;
  latitud: number;
  longitud: number;
  precisionMetros: number;
  fotoUri: string | null;
  /** ISO 8601, UTC: la hora en que el técnico registró la demora. */
  capturadoEn: string;
  intentos: number;
}

export interface ResumenSincronizacion {
  enviadas: number;
  /** Mensajes para el técnico: demoras descartadas por el servidor o registradas sin foto. */
  avisos: string[];
  pendientes: number;
  sinConexion: boolean;
}

let memoria: Map<string, DemoraPendiente> | null = null;
let totalEnviadas = 0;
const escuchas = new Set<() => void>();

function avisarCambio() {
  escuchas.forEach((f) => f());
}

/** Se llama cuando cambia la cola (se guarda una demora, se envía o se descarta). Devuelve la función para dejar de escuchar. */
export function suscribirCola(f: () => void): () => void {
  escuchas.add(f);
  return () => {
    escuchas.delete(f);
  };
}

/** Cuántas demoras guardadas se enviaron desde que abrió la app (las pantallas la usan para volver a leer sus datos). */
export function enviadasDesdeApertura(): number {
  return totalEnviadas;
}

async function leerIndice(): Promise<string[]> {
  try {
    const crudo = await leer(CLAVE_INDICE);
    const lista = crudo ? (JSON.parse(crudo) as unknown) : [];
    return Array.isArray(lista) ? lista.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

async function cargar(): Promise<Map<string, DemoraPendiente>> {
  if (memoria) return memoria;
  const mapa = new Map<string, DemoraPendiente>();
  for (const id of await leerIndice()) {
    try {
      const crudo = await leer(claveDe(id));
      if (crudo) mapa.set(id, JSON.parse(crudo) as DemoraPendiente);
    } catch {
      // un valor dañado no debe impedir el resto
    }
  }
  memoria = mapa;
  return mapa;
}

async function persistirIndice(m: Map<string, DemoraPendiente>) {
  await guardar(CLAVE_INDICE, JSON.stringify([...m.keys()]));
}

function nuevoId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/** Guarda una demora para enviarla después. La descripción se recorta solo si no entra en el almacenamiento (la demora no se pierde). */
export async function encolarDemora(entrada: Omit<DemoraPendiente, 'idLocal' | 'intentos'>): Promise<DemoraPendiente> {
  const m = await cargar();
  const base: DemoraPendiente = { ...entrada, idLocal: nuevoId(), intentos: 0 };
  const descripcion = descripcionQueEntra(base.descripcion, MAXIMO_BYTES_VALOR, (d) => JSON.stringify({ ...base, descripcion: d }));
  const p = { ...base, descripcion };
  m.set(p.idLocal, p);
  await guardar(claveDe(p.idLocal), JSON.stringify(p));
  await persistirIndice(m);
  avisarCambio();
  return p;
}

/** Demoras pendientes del técnico, de la más antigua a la más reciente. */
export async function pendientesDe(idUsuario: number): Promise<DemoraPendiente[]> {
  const m = await cargar();
  return [...m.values()].filter((p) => p.idUsuario === idUsuario).sort((a, b) => a.capturadoEn.localeCompare(b.capturadoEn));
}

async function quitar(idLocal: string) {
  const m = await cargar();
  m.delete(idLocal);
  await borrar(claveDe(idLocal));
  await persistirIndice(m);
}

async function guardarIntento(p: DemoraPendiente): Promise<DemoraPendiente> {
  const m = await cargar();
  const actualizada = { ...p, intentos: p.intentos + 1 };
  m.set(p.idLocal, actualizada);
  await guardar(claveDe(p.idLocal), JSON.stringify(actualizada));
  return actualizada;
}

/** ¿Hay conexión con el servidor? Cualquier respuesta HTTP (aunque sea 401) significa que sí. */
async function hayConexion(token: string): Promise<boolean> {
  try {
    await validarSesion(token);
    return true;
  } catch (e) {
    return !(e instanceof ErrorApi && e.estadoHttp === 0);
  }
}

/** La foto se guardó en la caché de la cámara: si el sistema la limpió, se envía la demora sin ella en vez de fallar para siempre. */
async function existeArchivo(uri: string): Promise<boolean> {
  try {
    const r = await fetch(uri);
    await r.blob();
    return true;
  } catch {
    return false;
  }
}

function aNuevaDemora(p: DemoraPendiente, fotoUri: string | null): NuevaDemora {
  return {
    tipo: p.tipo,
    idMotivo: p.idMotivo,
    duracionMinutos: p.duracionMinutos,
    descripcion: p.descripcion,
    ubicacion: { latitud: p.latitud, longitud: p.longitud, precisionMetros: p.precisionMetros },
    fotoUri,
    capturadoEn: p.capturadoEn,
  };
}

let enCurso: Promise<ResumenSincronizacion> | null = null;

/** Envía las demoras pendientes del técnico, una tras otra y de la más antigua a la más reciente. No se pisa a sí misma. */
export function sincronizarPendientes(token: string, idUsuario: number): Promise<ResumenSincronizacion> {
  if (!enCurso) {
    enCurso = ejecutar(token, idUsuario).finally(() => {
      enCurso = null;
    });
  }
  return enCurso;
}

async function ejecutar(token: string, idUsuario: number): Promise<ResumenSincronizacion> {
  const resumen: ResumenSincronizacion = { enviadas: 0, avisos: [], pendientes: 0, sinConexion: false };
  const lista = await pendientesDe(idUsuario);
  if (entorno.usarMock) return { ...resumen, pendientes: lista.length };

  for (const original of lista) {
    let p = original;
    let foto = p.fotoUri;
    const sueltaFoto = !!foto && p.intentos >= INTENTOS_ANTES_DE_SOLTAR_FOTO;
    if (foto && (sueltaFoto || !(await existeArchivo(foto)))) foto = null;

    try {
      await registrarDemora(token, p.idOs, aNuevaDemora(p, foto));
      await quitar(p.idLocal);
      resumen.enviadas++;
      totalEnviadas++;
      if (p.fotoUri && !foto) resumen.avisos.push(`La demora de ${p.numeroOs} se registró sin la foto: no se pudo subir.`);
      continue;
    } catch (e) {
      const destino = e instanceof ErrorApi ? clasificarFallo(e.estadoHttp, e.idTipoMensaje) : 'reintentar';

      if (destino === 'sesion') break; // se conservan hasta que el técnico vuelva a entrar
      if (destino === 'rechazada') {
        await quitar(p.idLocal);
        resumen.avisos.push(`La demora de ${p.numeroOs} (${p.motivo}) no se registró: ${e instanceof Error ? e.message : 'el servidor la rechazó.'}`);
        continue;
      }
      if (destino === 'sin_conexion' && !(await hayConexion(token))) {
        resumen.sinConexion = true;
        break; // sin señal: se reintenta más tarde, sin gastar intentos
      }

      // Hay conexión pero este envío falla (foto pesada, error del servidor): cuenta un intento
      p = await guardarIntento(p);
      if (p.intentos >= INTENTOS_MAXIMOS) {
        await quitar(p.idLocal);
        resumen.avisos.push(`La demora de ${p.numeroOs} (${p.motivo}) no se pudo registrar tras varios intentos. Regístrala de nuevo.`);
      }
    }
  }

  resumen.pendientes = (await pendientesDe(idUsuario)).length;
  avisarCambio();
  return resumen;
}

export type ResultadoRegistro =
  | { estado: 'enviada'; mensaje: string; datos: ResultadoDemora | null }
  /** Guardada en el teléfono. `conConexion` = hay señal pero el envío falló (p. ej. la foto): se reintenta sola. */
  | { estado: 'en_cola'; pendiente: DemoraPendiente; conConexion: boolean };

/**
 * Registra la demora. Si no hay conexión (o se agota el tiempo), la guarda en el teléfono para enviarla después, con la misma hora
 * de captura: si el servidor sí la había recibido, el reintento se reconoce y no se duplica. Cualquier otro error se propaga.
 */
export async function registrarDemoraOEncolar(
  token: string,
  idOs: number,
  datos: { idUsuario: number; numeroOs: string; motivo: string },
  demora: NuevaDemora,
): Promise<ResultadoRegistro> {
  try {
    const r = await registrarDemora(token, idOs, demora);
    return { estado: 'enviada', mensaje: r.mensaje, datos: r.datos };
  } catch (e) {
    if (!(e instanceof ErrorApi) || e.estadoHttp !== 0) throw e;
    const pendiente = await encolarDemora({
      idUsuario: datos.idUsuario,
      idOs,
      numeroOs: datos.numeroOs,
      motivo: datos.motivo,
      tipo: demora.tipo,
      idMotivo: demora.idMotivo,
      duracionMinutos: demora.duracionMinutos,
      descripcion: demora.descripcion,
      latitud: demora.ubicacion.latitud,
      longitud: demora.ubicacion.longitud,
      precisionMetros: demora.ubicacion.precisionMetros,
      fotoUri: demora.fotoUri,
      capturadoEn: demora.capturadoEn,
    });
    return { estado: 'en_cola', pendiente, conConexion: await hayConexion(token) };
  }
}
