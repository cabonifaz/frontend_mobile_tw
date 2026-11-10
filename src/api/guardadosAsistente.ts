import { sistemaArchivos } from './archivosLocales';
import { eliminarGuardado as eliminarEnServidor, guardarEnServidor, listarGuardados, obtenerGuardado, type FuenteConsultada, type GuardadoCompleto, type RespuestaAsistente, type TipoGuardado } from './asistente';
import { ErrorApi } from './cliente';
import { bytesUtf8 } from '@/utilidades/demoras';
import { ahoraLima, filtrarGuardados, subtituloGuardado, tituloGuardado } from '@/utilidades/asistente';

/**
 * HU-19 — Guardados del Asistente IA en el teléfono ("Guardar offline", "Fragmento", "Descargar sección").
 *
 * Lo que el técnico guarda queda en el teléfono para leerlo SIN conexión (un archivo JSON por técnico en la carpeta de documentos de la app; el
 * almacenamiento seguro no sirve: limita el tamaño de cada valor) y se copia al servidor cuando hay señal.
 *
 *  - Guardar es local primero: si el servidor no responde por la señal, la copia queda "pendiente" y se envía sola (al abrir Guardados y desde
 *    `MonitorCampo`). Guardar dos veces lo mismo no duplica (clave tipo + consulta + fuente).
 *  - Eliminar quita la copia del teléfono y, con señal, la del servidor; sin señal queda marcada y se avisa al servidor después.
 *  - Lo guardado en el servidor desde otro equipo se trae al teléfono al sincronizar (hasta 20 por vez).
 *  - Sin el módulo de archivos (app instalada anterior) se guarda solo en memoria: se pierde al cerrar la app (`guardadoPersistente()` lo dice).
 *  - Cada técnico ve solo lo suyo (el nombre del archivo lleva su id).
 */

export interface GuardadoLocal extends GuardadoCompleto {
  /** Identificador estable en el teléfono: tipo|consulta|fuente. */
  clave: string;
  /** La copia aún no está en el servidor (se guardó sin señal). `idGuardado` es negativo hasta entonces. */
  pendiente: boolean;
  /** El técnico lo eliminó y falta avisarle al servidor. */
  borrado: boolean;
}

export interface EntradaGuardado {
  tipo: TipoGuardado;
  respuesta: RespuestaAsistente | null;
  fuente: FuenteConsultada | null;
}

export interface ResultadoGuardar {
  guardado: GuardadoLocal;
  yaExistia: boolean;
  /** Ya está también en el servidor. */
  enServidor: boolean;
  /** El servidor no la aceptó (no es un problema de señal); la copia local sigue disponible. */
  aviso?: string;
}

export interface ResumenGuardados {
  enviados: number;
  descargados: number;
  eliminados: number;
  avisos: string[];
  pendientes: number;
  sinConexion: boolean;
}

const MAX_DESCARGAS = 20;
const memoria = new Map<number, GuardadoLocal[]>();
const escuchas = new Set<() => void>();
let colaEscritura: Promise<void> = Promise.resolve();

function avisarCambio() {
  escuchas.forEach((f) => f());
}

/** Se llama cuando cambian los guardados del teléfono. Devuelve la función para dejar de escuchar. */
export function suscribirGuardados(f: () => void): () => void {
  escuchas.add(f);
  return () => {
    escuchas.delete(f);
  };
}

/** ¿Los guardados sobreviven al cierre de la app? (false = solo memoria: la app instalada no trae el módulo de archivos). */
export function guardadoPersistente(): boolean {
  return sistemaArchivos() !== null;
}

function archivoDe(idUsuario: number) {
  const fs = sistemaArchivos();
  return fs ? new fs.File(fs.Paths.document, `asistente-guardados-${idUsuario}.json`) : null;
}

async function cargar(idUsuario: number): Promise<GuardadoLocal[]> {
  const enMemoria = memoria.get(idUsuario);
  if (enMemoria) return enMemoria;
  let lista: GuardadoLocal[] = [];
  try {
    const a = archivoDe(idUsuario);
    if (a?.exists) {
      const crudo: unknown = JSON.parse(await a.text());
      if (Array.isArray(crudo)) lista = crudo.filter((x): x is GuardadoLocal => !!x && typeof x === 'object' && typeof (x as GuardadoLocal).clave === 'string');
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

/** Clave de un guardado: `respuesta|13|0` o `fragmento|13|1`. */
export function claveGuardado(tipo: TipoGuardado, idConsulta: number, n?: number): string {
  return `${tipo}|${idConsulta}|${tipo === 'fragmento' ? (n ?? 1) : 0}`;
}

function siguienteIdLocal(lista: GuardadoLocal[]): number {
  return Math.min(-1, ...lista.map((g) => g.idGuardado)) - 1;
}

/** Guardados del teléfono (sin los eliminados), los más recientes primero; `busqueda` filtra por título o subtítulo. */
export async function listarLocales(idUsuario: number, busqueda = ''): Promise<GuardadoLocal[]> {
  const lista = (await cargar(idUsuario))
    .filter((g) => !g.borrado)
    .sort((a, b) => b.creadoEn.localeCompare(a.creadoEn) || b.idGuardado - a.idGuardado);
  return filtrarGuardados(lista, busqueda);
}

export async function leerLocal(idUsuario: number, clave: string): Promise<GuardadoLocal | null> {
  return (await cargar(idUsuario)).find((g) => g.clave === clave && !g.borrado) ?? null;
}

/** ¿Ya está guardado en el teléfono? (para marcar el botón "Guardado"). */
export async function estaGuardado(idUsuario: number, tipo: TipoGuardado, idConsulta: number, n?: number): Promise<boolean> {
  return (await leerLocal(idUsuario, claveGuardado(tipo, idConsulta, n))) !== null;
}

/** Guardados sin enviar al servidor + eliminados sin avisarle. */
export async function pendientesDeEnviar(idUsuario: number): Promise<number> {
  return (await cargar(idUsuario)).filter((g) => (g.pendiente && !g.borrado) || (g.borrado && g.idGuardado > 0)).length;
}

function armar(e: EntradaGuardado, id: number): GuardadoLocal {
  const fuentePrincipal = e.tipo === 'respuesta' ? (e.respuesta?.fuentes[0] ?? null) : e.fuente;
  const idConsulta = e.tipo === 'respuesta' ? (e.respuesta?.idConsulta ?? 0) : (e.fuente?.idConsulta ?? 0);
  const n = e.tipo === 'fragmento' ? (e.fuente?.n ?? 1) : undefined;
  const contenido = JSON.stringify({ respuesta: e.respuesta, fuente: e.fuente });
  return {
    idGuardado: id,
    tipo: e.tipo,
    titulo: tituloGuardado(e.tipo, e.respuesta, e.fuente ?? fuentePrincipal),
    subtitulo: subtituloGuardado(e.tipo, fuentePrincipal),
    creadoEn: ahoraLima(),
    tamanoBytes: bytesUtf8(contenido),
    respuesta: e.tipo === 'respuesta' ? e.respuesta : null,
    fuente: e.tipo === 'fragmento' ? e.fuente : null,
    clave: claveGuardado(e.tipo, idConsulta, n),
    pendiente: true,
    borrado: false,
  };
}

/** Pasa a la copia local lo que devolvió el servidor (su id y su título definitivos). */
function adoptar(g: GuardadoLocal, s: GuardadoCompleto) {
  g.idGuardado = s.idGuardado;
  g.titulo = s.titulo || g.titulo;
  g.subtitulo = s.subtitulo || g.subtitulo;
  g.creadoEn = s.creadoEn || g.creadoEn;
  g.tamanoBytes = s.tamanoBytes || g.tamanoBytes;
  g.pendiente = false;
}

const sinSenal = (e: unknown) => e instanceof ErrorApi && e.estadoHttp === 0;
const sesionVencida = (e: unknown) => e instanceof ErrorApi && e.estadoHttp === 401;

/** Envía al servidor un guardado pendiente. Devuelve 'enviado', 'sin_senal' o el mensaje con que el servidor lo rechazó. */
async function enviar(token: string, g: GuardadoLocal): Promise<'enviado' | 'sin_senal' | 'sesion' | { rechazo: string }> {
  const [, idConsulta, n] = g.clave.split('|');
  try {
    const s = await guardarEnServidor(token, { idConsulta: Number(idConsulta), tipo: g.tipo as TipoGuardado, n: Number(n) || undefined });
    adoptar(g, s);
    return 'enviado';
  } catch (e) {
    if (sinSenal(e)) return 'sin_senal';
    if (sesionVencida(e)) return 'sesion';
    g.pendiente = false; // el servidor no la acepta: se deja de reintentar, la copia local sirve
    return { rechazo: e instanceof Error ? e.message : 'El servidor no aceptó el guardado.' };
  }
}

/** Guarda en el teléfono y, si hay señal, también en el servidor. Guardar lo mismo otra vez devuelve el que ya estaba. */
export async function guardarOffline(token: string, idUsuario: number, e: EntradaGuardado): Promise<ResultadoGuardar> {
  const lista = await cargar(idUsuario);
  const nuevo = armar(e, siguienteIdLocal(lista));
  const existente = lista.find((g) => g.clave === nuevo.clave);
  if (existente && !existente.borrado) {
    return { guardado: existente, yaExistia: true, enServidor: !existente.pendiente };
  }
  let g: GuardadoLocal;
  if (existente) {
    // Estaba eliminado y falta avisar al servidor: se revive tal cual (el servidor aún lo tiene)
    existente.borrado = false;
    g = existente;
  } else {
    g = nuevo;
    lista.push(g);
  }
  await persistir(idUsuario);
  avisarCambio();

  let aviso: string | undefined;
  if (g.pendiente) {
    const r = await enviar(token, g);
    if (typeof r === 'object') aviso = r.rechazo;
    await persistir(idUsuario);
    avisarCambio();
  }
  return { guardado: g, yaExistia: false, enServidor: !g.pendiente && !aviso, aviso };
}

/** Elimina del teléfono y, con señal, del servidor. Sin señal queda marcado y se avisa al servidor al sincronizar. */
export async function eliminarOffline(token: string, idUsuario: number, clave: string): Promise<{ enServidor: boolean }> {
  const lista = await cargar(idUsuario);
  const i = lista.findIndex((g) => g.clave === clave);
  if (i < 0) return { enServidor: true };
  const g = lista[i];
  if (g.idGuardado < 0) {
    // Nunca llegó al servidor: no hay nada que avisarle
    lista.splice(i, 1);
    await persistir(idUsuario);
    avisarCambio();
    return { enServidor: true };
  }
  g.borrado = true;
  await persistir(idUsuario);
  avisarCambio();
  try {
    await eliminarEnServidor(token, g.idGuardado);
  } catch (e) {
    if (sinSenal(e) || sesionVencida(e)) return { enServidor: false };
    // otro error del servidor (p. ej. ya no existe): no hay nada más que avisarle
  }
  const j = lista.indexOf(g);
  if (j >= 0) lista.splice(j, 1);
  await persistir(idUsuario);
  avisarCambio();
  return { enServidor: true };
}

let enCurso: Promise<ResumenGuardados> | null = null;

/** Envía lo pendiente, avisa las eliminaciones y trae lo guardado desde otro equipo. No se pisa a sí misma. */
export function sincronizarGuardados(token: string, idUsuario: number): Promise<ResumenGuardados> {
  if (!enCurso) {
    enCurso = ejecutar(token, idUsuario).finally(() => {
      enCurso = null;
    });
  }
  return enCurso;
}

async function ejecutar(token: string, idUsuario: number): Promise<ResumenGuardados> {
  const resumen: ResumenGuardados = { enviados: 0, descargados: 0, eliminados: 0, avisos: [], pendientes: 0, sinConexion: false };
  const lista = await cargar(idUsuario);

  for (const g of [...lista]) {
    if (g.borrado) {
      if (g.idGuardado < 0) {
        lista.splice(lista.indexOf(g), 1);
        continue;
      }
      try {
        await eliminarEnServidor(token, g.idGuardado);
      } catch (e) {
        if (sinSenal(e)) {
          resumen.sinConexion = true;
          break;
        }
        if (sesionVencida(e)) break;
      }
      lista.splice(lista.indexOf(g), 1);
      resumen.eliminados++;
    } else if (g.pendiente) {
      const r = await enviar(token, g);
      if (r === 'enviado') resumen.enviados++;
      else if (r === 'sin_senal') {
        resumen.sinConexion = true;
        break;
      } else if (r === 'sesion') break;
      else resumen.avisos.push(`No se pudo guardar "${g.titulo}" en el servidor: ${r.rechazo}`);
    }
  }

  if (!resumen.sinConexion) {
    try {
      const remotos = await listarGuardados(token);
      const conocidos = new Set(lista.map((g) => g.idGuardado));
      for (const r of remotos.filter((x) => !conocidos.has(x.idGuardado)).slice(0, MAX_DESCARGAS)) {
        const completo = await obtenerGuardado(token, r.idGuardado);
        const idConsulta = completo.respuesta?.idConsulta ?? completo.fuente?.idConsulta ?? 0;
        const clave = claveGuardado(completo.tipo as TipoGuardado, idConsulta, completo.fuente?.n);
        if (lista.some((g) => g.clave === clave)) continue;
        lista.push({ ...completo, clave, pendiente: false, borrado: false });
        resumen.descargados++;
      }
    } catch (e) {
      if (sinSenal(e)) resumen.sinConexion = true;
      // cualquier otro fallo: se reintenta en la próxima sincronización
    }
  }

  await persistir(idUsuario);
  resumen.pendientes = await pendientesDeEnviar(idUsuario);
  avisarCambio();
  return resumen;
}
