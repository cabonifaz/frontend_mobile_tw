import { entorno } from '@/config/entorno';
import { INTENTOS_MAXIMOS, clasificarFallo } from '@/utilidades/demoras';
import { posicionReciente } from '@/utilidades/posicionActual';
import { ensayosConGuardado, fusionarCabecera, cabeceraConPendientes } from '@/utilidades/trabajoPendiente';
import { sistemaArchivos } from './archivosLocales';
import { validarSesion } from './autenticacion';
import { ErrorApi } from './cliente';
import { guardarEnsayos, type Ensayos, type GuardarEnsayos } from './ensayos';
import { guardarCabeceraInforme, type CabeceraInforme, type GuardarCabecera } from './informe';
import type { Ubicacion } from './ruta';
import { guardarVariablesAmbientales, type NuevasVariables, type TrabajoEquipo } from './trabajo';

/**
 * HU-18 — Trabajo del equipo guardado en el teléfono cuando no hay señal: variables ambientales (HU-09), ensayos y calibración (HU-10) y cabecera del informe (HU-15).
 *
 * Sin señal el técnico sigue trabajando: lo que guarda queda en el teléfono con la hora en que lo guardó y se envía solo al volver la conexión (el monitor de campo
 * llama a `sincronizarTrabajo`: al abrir la app, al volver a ella, al recuperar la señal y cada 30 s mientras haya pendientes; no hay botón de sincronizar).
 *
 *  - Es UN pendiente por «documento»: tipo + técnico + OS + equipo. Guardar de nuevo REEMPLAZA al anterior (variables y ensayos son una foto completa); la cabecera
 *    del informe se FUSIONA sección por sección (el servidor solo toca las secciones que vienen: la última versión de cada una gana).
 *  - Los cálculos (E, EMP, conformidad, error crítico) se hacen en el teléfono para mostrar lo guardado; el servidor los vuelve a calcular al recibirlo.
 *  - Orden de envío por equipo: variables → ensayos → cabecera (Ensayos necesita las variables). Sin señal se corta y se conserva; si el servidor rechaza por una regla
 *    de negocio (el equipo ya no está en ejecución, el informe ya se generó…) se descarta y se avisa; los fallos del servidor (5xx) se reintentan hasta 10 veces.
 *  - Se guarda en UN archivo por técnico en la carpeta de documentos de la app (el almacenamiento seguro limita cada valor a ~2 KB). Sobrevive al cierre de sesión y
 *    solo se envía con el token del MISMO técnico. Si la app instalada no trae el módulo de archivos NO se guarda nada: se mantiene el aviso «exige conexión».
 *  - Fuera de alcance sin señal: finalizar el equipo (Hard Stop), subir fotos de una falla, llamar al encargado, el correlativo y la constancia.
 */

export type TipoTrabajo = 'variables' | 'ensayos' | 'cabecera';
const ORDEN_TIPO: Record<TipoTrabajo, number> = { variables: 0, ensayos: 1, cabecera: 2 };
const NOMBRE_TIPO: Record<TipoTrabajo, string> = { variables: 'las variables ambientales', ensayos: 'los ensayos', cabecera: 'la cabecera del informe' };
/** Tamaño máximo de un pendiente (el servidor limita la cabecera a 64 KB). */
const MAX_BYTES = 60 * 1024;

export interface TrabajoPendiente {
  idLocal: string;
  idUsuario: number;
  idOs: number;
  idOsEquipo: number;
  numeroOs: string;
  /** "Balanza de plataforma #01", para los avisos. */
  equipo: string;
  tipo: TipoTrabajo;
  /** Lo mismo que se enviaría con conexión: NuevasVariables · GuardarEnsayos · GuardarCabecera (parcial). */
  cuerpo: NuevasVariables | GuardarEnsayos | GuardarCabecera;
  /** ISO 8601, UTC: la hora en que el técnico guardó. */
  capturadoEn: string;
  /** Última posición conocida de la app (informativa: estos envíos no la guardan en el servidor). */
  ubicacion: Ubicacion | null;
  intentos: number;
}

export interface ResumenTrabajo {
  enviadas: number;
  /** Mensajes para el técnico: lo que el servidor rechazó o no se pudo enviar. */
  avisos: string[];
  pendientes: number;
  sinConexion: boolean;
}

// ── Almacén: un archivo JSON por técnico ────────────────────────────────────────────────────────────

const memoria = new Map<number, TrabajoPendiente[]>();
let colaEscritura: Promise<void> = Promise.resolve();
let totalEnviadas = 0;
const escuchas = new Set<() => void>();

/** ¿Se puede guardar trabajo en el teléfono? (no en el modo demo; exige el módulo de archivos) */
export function puedeGuardarTrabajoSinConexion(): boolean {
  return !entorno.usarMock && sistemaArchivos() !== null;
}

function avisarCambio() {
  escuchas.forEach((f) => f());
}

/** Se llama cuando cambia la cola de trabajo (se guarda, se envía o se descarta algo). Devuelve la función para dejar de escuchar. */
export function suscribirColaTrabajo(f: () => void): () => void {
  escuchas.add(f);
  return () => {
    escuchas.delete(f);
  };
}

/** Cuántos registros guardados se enviaron desde que abrió la app (las pantallas vuelven a leer del servidor cuando cambia). */
export function enviadasTrabajoDesdeApertura(): number {
  return totalEnviadas;
}

function archivoDe(idUsuario: number) {
  const fs = sistemaArchivos();
  return fs && Number.isInteger(idUsuario) && idUsuario > 0 ? new fs.File(fs.Paths.document, `cola-trabajo-${idUsuario}.json`) : null;
}

function valido(x: unknown): x is TrabajoPendiente {
  if (!x || typeof x !== 'object') return false;
  const p = x as TrabajoPendiente;
  return typeof p.idLocal === 'string' && /^[A-Za-z0-9]+$/.test(p.idLocal) && p.tipo in ORDEN_TIPO && Number.isInteger(p.idOs) && Number.isInteger(p.idOsEquipo)
    && typeof p.capturadoEn === 'string' && !!p.cuerpo && typeof p.cuerpo === 'object';
}

async function cargar(idUsuario: number): Promise<TrabajoPendiente[]> {
  const enMemoria = memoria.get(idUsuario);
  if (enMemoria) return enMemoria;
  let lista: TrabajoPendiente[] = [];
  try {
    const a = archivoDe(idUsuario);
    if (a?.exists) {
      const crudo: unknown = JSON.parse(await a.text());
      if (Array.isArray(crudo)) lista = crudo.filter(valido).filter((p) => p.idUsuario === idUsuario);
    }
  } catch {
    lista = []; // archivo dañado: se empieza de cero
  }
  memoria.set(idUsuario, lista);
  return lista;
}

function persistir(idUsuario: number): Promise<void> {
  const texto = JSON.stringify(memoria.get(idUsuario) ?? []);
  colaEscritura = colaEscritura.then(async () => {
    try {
      const a = archivoDe(idUsuario);
      if (!a) return;
      a.create({ overwrite: true, intermediates: true });
      await a.write(texto);
    } catch {
      // sin espacio o sin permiso: queda en memoria mientras la app esté abierta
    }
  });
  return colaEscritura;
}

let contador = 0;
const nuevoId = () => `${Date.now().toString(36)}${(contador++).toString(36)}`;

const mismo = (a: Pick<TrabajoPendiente, 'tipo' | 'idOs' | 'idOsEquipo'>, b: Pick<TrabajoPendiente, 'tipo' | 'idOs' | 'idOsEquipo'>) =>
  a.tipo === b.tipo && a.idOs === b.idOs && a.idOsEquipo === b.idOsEquipo;

// ── Consultas ───────────────────────────────────────────────────────────────────────────────────────

/** Cuántos documentos de trabajo tiene el técnico guardados sin enviar. */
export async function pendientesTrabajo(idUsuario: number): Promise<number> {
  return (await cargar(idUsuario)).length;
}

/** Lo guardado sin enviar de un equipo (para mostrarlo encima de lo descargado). */
export async function pendientesDeEquipoTrabajo(idUsuario: number, idOs: number, idOsEquipo: number): Promise<TrabajoPendiente[]> {
  return (await cargar(idUsuario)).filter((p) => p.idOs === idOs && p.idOsEquipo === idOsEquipo);
}

/** Todo lo guardado sin enviar del técnico, en el orden en que se enviará. */
export async function listarPendientesTrabajo(idUsuario: number): Promise<TrabajoPendiente[]> {
  return [...(await cargar(idUsuario))].sort((a, b) => ORDEN_TIPO[a.tipo] - ORDEN_TIPO[b.tipo] || a.capturadoEn.localeCompare(b.capturadoEn));
}

// ── Encolar ─────────────────────────────────────────────────────────────────────────────────────────

export interface DatosEquipoTrabajo {
  idUsuario: number;
  numeroOs: string;
  equipo: string;
}

async function encolar(d: DatosEquipoTrabajo & { idOs: number; idOsEquipo: number; tipo: TipoTrabajo; cuerpo: TrabajoPendiente['cuerpo']; capturadoEn: string }): Promise<TrabajoPendiente> {
  if (JSON.stringify(d.cuerpo).length > MAX_BYTES) throw new Error('Lo que intentas guardar es demasiado grande para el teléfono. Guárdalo con señal.');
  const lista = await cargar(d.idUsuario);
  const previo = lista.find((p) => mismo(p, d));
  const cuerpo = d.tipo === 'cabecera' ? fusionarCabecera(previo?.cuerpo as GuardarCabecera | undefined, d.cuerpo as GuardarCabecera) : d.cuerpo;
  const pendiente: TrabajoPendiente = {
    idLocal: previo?.idLocal ?? nuevoId(),
    idUsuario: d.idUsuario,
    idOs: d.idOs,
    idOsEquipo: d.idOsEquipo,
    numeroOs: d.numeroOs,
    equipo: d.equipo,
    tipo: d.tipo,
    cuerpo,
    capturadoEn: d.capturadoEn,
    ubicacion: posicionReciente(30 * 60_000),
    intentos: 0,
  };
  memoria.set(d.idUsuario, [...lista.filter((p) => !mismo(p, d)), pendiente]);
  await persistir(d.idUsuario);
  avisarCambio();
  return pendiente;
}

async function quitar(p: TrabajoPendiente) {
  const lista = await cargar(p.idUsuario);
  memoria.set(p.idUsuario, lista.filter((x) => x.idLocal !== p.idLocal));
  await persistir(p.idUsuario);
}

/** Solo un fallo de señal (o tiempo agotado) manda el trabajo al teléfono; cualquier otro error se muestra como siempre. */
const sinSenal = (e: unknown) => e instanceof ErrorApi && e.estadoHttp === 0 && puedeGuardarTrabajoSinConexion();

const MENSAJE_EN_TELEFONO = 'Guardado en el teléfono · por enviar. Se envía solo cuando vuelva la señal.';

export type ResultadoGuardado<T> =
  | { estado: 'enviado'; mensaje: string; datos: T | null }
  /** Guardado en el teléfono; `datos` es lo guardado como lo vería el técnico (con los cálculos hechos en el teléfono). */
  | { estado: 'en_telefono'; mensaje: string; datos: T };

/** Variables ambientales: se envían; sin señal quedan en el teléfono con la hora en que se tomaron. */
export async function guardarVariablesOEncolar(
  token: string,
  d: DatosEquipoTrabajo & { idOs: number; idOsEquipo: number },
  v: NuevasVariables,
): Promise<ResultadoGuardado<TrabajoEquipo | null>> {
  const capturadoEn = new Date().toISOString();
  try {
    const r = await guardarVariablesAmbientales(token, d.idOs, d.idOsEquipo, v, capturadoEn);
    return { estado: 'enviado', mensaje: r.mensaje, datos: r.trabajo };
  } catch (e) {
    if (!sinSenal(e)) throw e;
    await encolar({ ...d, tipo: 'variables', cuerpo: v, capturadoEn });
    return { estado: 'en_telefono', mensaje: MENSAJE_EN_TELEFONO, datos: null };
  }
}

/** Ensayos y Calibración: se envían; sin señal se guardan en el teléfono y la pantalla recibe los ensayos calculados en el teléfono. */
export async function guardarEnsayosOEncolar(
  token: string,
  d: DatosEquipoTrabajo & { idOs: number; idOsEquipo: number },
  g: GuardarEnsayos,
  base: Ensayos,
): Promise<ResultadoGuardado<Ensayos>> {
  const capturadoEn = new Date().toISOString();
  try {
    const r = await guardarEnsayos(token, d.idOs, d.idOsEquipo, g);
    return { estado: 'enviado', mensaje: r.mensaje, datos: r.ensayos };
  } catch (e) {
    if (!sinSenal(e)) throw e;
    const p = await encolar({ ...d, tipo: 'ensayos', cuerpo: g, capturadoEn });
    return { estado: 'en_telefono', mensaje: MENSAJE_EN_TELEFONO, datos: ensayosConGuardado(base, p.cuerpo as GuardarEnsayos, p.capturadoEn) };
  }
}

/** Cabecera del informe: se envía; sin señal las secciones guardadas se funden con lo que ya había en el teléfono y la pantalla recibe la cabecera con los cálculos hechos en el teléfono. */
export async function guardarCabeceraOEncolar(
  token: string,
  d: DatosEquipoTrabajo & { idOs: number; idOsEquipo: number },
  cuerpo: GuardarCabecera,
  base: CabeceraInforme,
): Promise<ResultadoGuardado<CabeceraInforme>> {
  const capturadoEn = new Date().toISOString();
  try {
    const r = await guardarCabeceraInforme(token, d.idOs, d.idOsEquipo, cuerpo);
    return { estado: 'enviado', mensaje: r.mensaje, datos: r.cabecera };
  } catch (e) {
    if (!sinSenal(e)) throw e;
    // Si ya había secciones guardadas en el teléfono se envían JUNTAS (las nuevas encima)
    await encolar({ ...d, tipo: 'cabecera', cuerpo, capturadoEn });
    const pendientes = await pendientesDeEquipoTrabajo(d.idUsuario, d.idOs, d.idOsEquipo);
    return { estado: 'en_telefono', mensaje: MENSAJE_EN_TELEFONO, datos: cabeceraConPendientes(base, pendientes) };
  }
}

// ── Envío ───────────────────────────────────────────────────────────────────────────────────────────

async function hayConexion(token: string): Promise<boolean> {
  try {
    await validarSesion(token);
    return true;
  } catch (e) {
    return !(e instanceof ErrorApi && e.estadoHttp === 0);
  }
}

let enCurso: Promise<ResumenTrabajo> | null = null;

/** Envía el trabajo guardado del técnico (variables → ensayos → cabecera). No se pisa a sí misma. */
export function sincronizarTrabajo(token: string, idUsuario: number): Promise<ResumenTrabajo> {
  if (!enCurso) {
    enCurso = ejecutar(token, idUsuario).finally(() => {
      enCurso = null;
    });
  }
  return enCurso;
}

async function enviar(token: string, p: TrabajoPendiente): Promise<void> {
  switch (p.tipo) {
    case 'variables':
      await guardarVariablesAmbientales(token, p.idOs, p.idOsEquipo, p.cuerpo as NuevasVariables, p.capturadoEn, { capturadoEn: p.capturadoEn, intentos: p.intentos });
      return;
    case 'ensayos':
      await guardarEnsayos(token, p.idOs, p.idOsEquipo, p.cuerpo as GuardarEnsayos, { capturadoEn: p.capturadoEn, intentos: p.intentos });
      return;
    case 'cabecera':
      await guardarCabeceraInforme(token, p.idOs, p.idOsEquipo, p.cuerpo as GuardarCabecera, { capturadoEn: p.capturadoEn, intentos: p.intentos });
      return;
  }
}

async function ejecutar(token: string, idUsuario: number): Promise<ResumenTrabajo> {
  const resumen: ResumenTrabajo = { enviadas: 0, avisos: [], pendientes: 0, sinConexion: false };
  const lista = await listarPendientesTrabajo(idUsuario);
  if (entorno.usarMock) return { ...resumen, pendientes: lista.length };
  // Si las variables de un equipo se descartan, lo que depende de ellas (ensayos) se intenta igual: el servidor dice si falta algo.
  for (const p of lista) {
    const que = `${NOMBRE_TIPO[p.tipo]} de ${p.equipo} (${p.numeroOs})`;
    try {
      await enviar(token, p);
      await quitar(p);
      totalEnviadas++;
      resumen.enviadas++;
    } catch (e) {
      const destino = e instanceof ErrorApi ? clasificarFallo(e.estadoHttp, e.idTipoMensaje) : 'reintentar';
      if (destino === 'sesion') break;
      if (destino === 'rechazada') {
        await quitar(p);
        resumen.avisos.push(`No se registró ${que}: ${e instanceof Error ? e.message : 'el servidor lo rechazó.'}`);
        continue;
      }
      if (destino === 'sin_conexion' && !(await hayConexion(token))) {
        resumen.sinConexion = true;
        break;
      }
      const actual = (await cargar(idUsuario)).find((x) => x.idLocal === p.idLocal);
      if (!actual) continue;
      if (actual.intentos + 1 >= INTENTOS_MAXIMOS) {
        await quitar(actual);
        resumen.avisos.push(`No se pudo enviar ${que} tras varios intentos. Vuelve a guardarlo.`);
      } else {
        memoria.set(idUsuario, (await cargar(idUsuario)).map((x) => (x.idLocal === actual.idLocal ? { ...x, intentos: x.intentos + 1 } : x)));
        await persistir(idUsuario);
      }
    }
  }
  resumen.pendientes = (await cargar(idUsuario)).length;
  avisarCambio();
  return resumen;
}
