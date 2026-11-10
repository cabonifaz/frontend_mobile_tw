import { entorno } from '@/config/entorno';
import { borrar, guardar, leer } from '@/sesion/almacenamiento';
import { INTENTOS_MAXIMOS, clasificarFallo } from '@/utilidades/demoras';
import { sistemaArchivos } from './archivosLocales';
import { validarSesion } from './autenticacion';
import { ErrorApi } from './cliente';
import { capturarEvidencia, type CodigoEvidencia } from './evidencias';
import type { Ubicacion } from './ruta';

/**
 * HU-11 / HU-12 / HU-13 — Capturas guardadas en el teléfono cuando no hay señal.
 *
 * La regla de la HU no cambia: una evidencia SOLO cuenta cuando la IA la valida en el servidor. Sin señal el técnico puede tomar la foto (o el
 * microvideo) para no frenar el trabajo; la app la guarda con su hora y su GPS y la envía sola al recuperar la señal (al abrir la app, al volver a ella
 * y cada 30 s). Mientras esté en cola la evidencia aparece "EN COLA" y NO cuenta como completa, así que "Guardar y volver" sigue bloqueado.
 *
 *  - Al enviarla el servidor hace lo de siempre: valida con IA, aprueba o rechaza. Si la rechaza se avisa al técnico, que la repite o la acepta con
 *    un motivo escrito (HU-12). El servidor conserva la hora original de la toma si es de las últimas 24 h.
 *  - Los archivos se copian a la carpeta de documentos de la app (la caché la puede borrar el sistema); los datos van al almacenamiento seguro
 *    (una clave por captura más un índice, porque cada valor tiene un tamaño máximo).
 *  - Una sola captura por evidencia y hoja: volver a tomarla reemplaza a la que estaba en cola.
 *  - Sin el módulo de archivos (la app instalada es anterior) no se guarda nada y se mantiene el aviso de "exige conexión".
 */

const CLAVE_INDICE = 'tw.cola.evidencias';
const claveDe = (id: string) => `tw.cola.evidencia.${id}`;
const CARPETA = 'evidencias-pendientes';

export interface CapturaPendiente {
  idLocal: string;
  idUsuario: number;
  idOs: number;
  idOsEquipo: number;
  numeroOs: string;
  /** "Báscula Camionera #01", para los avisos. */
  equipo: string;
  codigo: CodigoEvidencia;
  /** "Placa de identificación", para los avisos. */
  nombreEvidencia: string;
  pagina: number;
  /** Rutas locales ya copiadas a la carpeta de documentos. */
  archivo: string | null;
  cuadro: string | null;
  ubicacion: Ubicacion | null;
  /** Hora real de la toma (ISO 8601, UTC). */
  capturadoEn: string;
  duracionSeg: number | null;
  intentos: number;
}

/** ¿Se puede guardar una captura en el teléfono? */
export function puedeGuardarSinConexion(): boolean {
  return !entorno.usarMock && sistemaArchivos() !== null;
}

let memoria: Map<string, CapturaPendiente> | null = null;
let contador = 0;
const escuchas = new Set<() => void>();

function avisarCambio() {
  escuchas.forEach((f) => f());
}

/** Se llama cuando cambia la cola de capturas. Devuelve la función para dejar de escuchar. */
export function suscribirColaEvidencias(f: () => void): () => void {
  escuchas.add(f);
  return () => {
    escuchas.delete(f);
  };
}

async function cargar(): Promise<Map<string, CapturaPendiente>> {
  if (memoria) return memoria;
  const mapa = new Map<string, CapturaPendiente>();
  try {
    const crudo = await leer(CLAVE_INDICE);
    const ids = crudo ? (JSON.parse(crudo) as unknown) : [];
    for (const id of Array.isArray(ids) ? ids.filter((x): x is string => typeof x === 'string' && /^[A-Za-z0-9]+$/.test(x)) : []) {
      try {
        const item = await leer(claveDe(id));
        if (item) mapa.set(id, JSON.parse(item) as CapturaPendiente);
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

async function persistirIndice(m: Map<string, CapturaPendiente>) {
  await guardar(CLAVE_INDICE, JSON.stringify([...m.keys()]));
}

function nuevoId(): string {
  contador += 1;
  return `${Date.now().toString(36)}${contador.toString(36)}`;
}

function borrarArchivo(uri: string | null) {
  if (!uri) return;
  try {
    const f = sistemaArchivos();
    if (!f) return;
    const archivo = new f.File(uri);
    if (archivo.exists) archivo.delete();
  } catch {
    // ya no estaba
  }
}

/** Copia una toma de la caché de la cámara a la carpeta de documentos de la app. */
async function copiarAlTelefono(origen: string, nombre: string): Promise<string> {
  const f = sistemaArchivos();
  if (!f) throw new Error('sin módulo de archivos');
  const carpeta = new f.Directory(f.Paths.document, CARPETA);
  carpeta.create({ idempotent: true, intermediates: true });
  const destino = new f.File(carpeta, nombre);
  if (destino.exists) destino.delete();
  await new f.File(origen).copy(destino);
  return destino.uri;
}

export interface EntradaCaptura {
  idUsuario: number;
  idOs: number;
  idOsEquipo: number;
  numeroOs: string;
  equipo: string;
  codigo: CodigoEvidencia;
  nombreEvidencia: string;
  pagina: number;
  archivoUri?: string;
  cuadroUri?: string;
  ubicacion?: Ubicacion | null;
  capturadoEn: string;
  duracionSeg?: number;
}

/** Guarda la toma en el teléfono para enviarla después. Reemplaza a la que hubiera en cola para la misma evidencia y hoja. */
export async function guardarCapturaPendiente(e: EntradaCaptura): Promise<CapturaPendiente> {
  const m = await cargar();
  const id = nuevoId();
  const video = e.codigo === 'encendido';
  let archivo: string | null = null;
  let cuadro: string | null = null;
  try {
    if (e.archivoUri) archivo = await copiarAlTelefono(e.archivoUri, `${id}-archivo.${video ? 'mp4' : 'jpg'}`);
    if (e.cuadroUri) cuadro = await copiarAlTelefono(e.cuadroUri, `${id}-cuadro.jpg`);
  } catch (error) {
    borrarArchivo(archivo);
    borrarArchivo(cuadro);
    throw error;
  }

  for (const anterior of [...m.values()]) {
    if (anterior.idUsuario === e.idUsuario && anterior.idOsEquipo === e.idOsEquipo && anterior.codigo === e.codigo && anterior.pagina === e.pagina) {
      await quitar(anterior.idLocal);
    }
  }

  const pendiente: CapturaPendiente = {
    idLocal: id,
    idUsuario: e.idUsuario,
    idOs: e.idOs,
    idOsEquipo: e.idOsEquipo,
    numeroOs: e.numeroOs,
    equipo: e.equipo,
    codigo: e.codigo,
    nombreEvidencia: e.nombreEvidencia,
    pagina: e.pagina,
    archivo,
    cuadro,
    ubicacion: e.ubicacion ?? null,
    capturadoEn: e.capturadoEn,
    duracionSeg: e.duracionSeg ?? null,
    intentos: 0,
  };
  m.set(id, pendiente);
  await guardar(claveDe(id), JSON.stringify(pendiente));
  await persistirIndice(m);
  avisarCambio();
  return pendiente;
}

/** Capturas en cola del técnico (de un servicio y de un equipo, o de todos), de la más antigua a la más reciente. */
export async function capturasPendientes(idUsuario: number, idOs?: number, idOsEquipo?: number): Promise<CapturaPendiente[]> {
  return [...(await cargar()).values()]
    .filter((p) => p.idUsuario === idUsuario && (idOs === undefined || p.idOs === idOs) && (idOsEquipo === undefined || p.idOsEquipo === idOsEquipo))
    .sort((a, b) => a.capturadoEn.localeCompare(b.capturadoEn));
}

async function quitar(idLocal: string) {
  const m = await cargar();
  const p = m.get(idLocal);
  m.delete(idLocal);
  if (p) {
    borrarArchivo(p.archivo);
    borrarArchivo(p.cuadro);
  }
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

export interface ResumenEvidencias {
  enviadas: number;
  /** Mensajes para el técnico: tomas que la IA rechazó o que el servidor no aceptó. */
  avisos: string[];
  pendientes: number;
  sinConexion: boolean;
}

let enCurso: Promise<ResumenEvidencias> | null = null;

/** Envía las capturas en cola del técnico en el orden en que las tomó. No se pisa a sí misma. */
export function sincronizarEvidencias(token: string, idUsuario: number): Promise<ResumenEvidencias> {
  if (!enCurso) {
    enCurso = ejecutar(token, idUsuario).finally(() => {
      enCurso = null;
    });
  }
  return enCurso;
}

function archivoExiste(uri: string | null): boolean {
  if (!uri) return true;
  try {
    const f = sistemaArchivos();
    return !!f && new f.File(uri).exists;
  } catch {
    return false;
  }
}

async function ejecutar(token: string, idUsuario: number): Promise<ResumenEvidencias> {
  const resumen: ResumenEvidencias = { enviadas: 0, avisos: [], pendientes: 0, sinConexion: false };
  const lista = await capturasPendientes(idUsuario);
  if (entorno.usarMock) return { ...resumen, pendientes: lista.length };

  for (const p of lista) {
    const que = `"${p.nombreEvidencia}" de ${p.equipo} (${p.numeroOs})`;
    if (!archivoExiste(p.archivo) || !archivoExiste(p.cuadro)) {
      await quitar(p.idLocal);
      resumen.avisos.push(`No se encontró en el teléfono la toma de ${que}. Vuelve a tomarla.`);
      continue;
    }
    try {
      const r = await capturarEvidencia(token, p.idOs, p.idOsEquipo, {
        codigo: p.codigo,
        pagina: p.pagina,
        archivoUri: p.archivo ?? undefined,
        cuadroUri: p.cuadro ?? undefined,
        ubicacion: p.ubicacion,
        capturadoEn: p.capturadoEn,
        duracionSeg: p.duracionSeg ?? undefined,
      });
      await quitar(p.idLocal);
      resumen.enviadas++;
      if (r.estado === 'rechazada') {
        resumen.avisos.push(`La IA rechazó la toma de ${que}: ${r.motivoRechazo ?? 'no se pudo validar'}. Repítela o acéptala con un motivo desde el Registro fotográfico.`);
      }
    } catch (e) {
      const destino = e instanceof ErrorApi ? clasificarFallo(e.estadoHttp, e.idTipoMensaje) : 'reintentar';
      if (destino === 'sesion') break;
      if (destino === 'rechazada') {
        await quitar(p.idLocal);
        resumen.avisos.push(`No se pudo registrar la toma de ${que}: ${e instanceof Error ? e.message : 'el servidor la rechazó.'}`);
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
        resumen.avisos.push(`No se pudo enviar la toma de ${que} tras varios intentos. Vuelve a tomarla.`);
      } else {
        m.set(p.idLocal, actualizada);
        await guardar(claveDe(p.idLocal), JSON.stringify(actualizada));
      }
    }
  }

  resumen.pendientes = (await capturasPendientes(idUsuario)).length;
  avisarCambio();
  return resumen;
}
