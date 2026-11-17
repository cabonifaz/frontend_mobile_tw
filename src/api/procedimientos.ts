import { requireOptionalNativeModule } from 'expo';
import { Linking, Platform } from 'react-native';
import { entorno } from '@/config/entorno';
import { sistemaArchivos } from './archivosLocales';
import { solicitar } from './cliente';
import { conRespaldo, type ConRespaldo } from './respaldo';

/**
 * HU-24 — Biblioteca de procedimientos (manuales y guías de calibración aprobados en la intranet).
 * Backend: GET api/movil/procedimientos → SP_ObtenerProcedimientosMovil · GET api/movil/procedimientos/{id}/pdf
 *
 *  - El PDF NO es un archivo cargado en la intranet: el backend lo GENERA con la información registrada del procedimiento (código, versión, norma, autor,
 *    descripción, historial). La lista se guarda para verla sin conexión; el PDF se descarga al teléfono (carpeta `procedimientos` de la app) y se lee sin señal.
 *  - Los procedimientos de los servicios de HOY del técnico se descargan solos (`descargarDelDia`).
 *  - Cuando Calidad aprueba una versión nueva (cambia la versión o el hash del PDF), la app reemplaza sola el archivo anterior de lo que ya estaba descargado.
 *  - El PDF se abre con el lector de PDF del teléfono (la app no trae un visor propio: ver nota en `abrirPdf`).
 */
export interface VersionAnterior {
  version: number;
  /** "yyyy-MM-dd". */
  reemplazadaEl: string | null;
}

export interface Procedimiento {
  idProcedimiento: number;
  codigo: string;
  anio: number;
  version: number;
  normaBase: string | null;
  autorNorma: string | null;
  /** calibracion | verificacion | mantenimiento | instalacion */
  tipo: string | null;
  descripcion: string;
  alcance: string | null;
  aprobadoPor: string | null;
  /** "yyyy-MM-dd". */
  actualizado: string | null;
  pdfNombre: string | null;
  pdfTamanoBytes: number | null;
  pdfHash: string | null;
  formatoDigitalIso: boolean;
  /** Número de la OS de hoy que lo usa (null = no es de tus servicios de hoy). */
  paraServicioHoy: string | null;
  historial: VersionAnterior[];
}

interface Biblioteca {
  procedimientos: Procedimiento[];
}

const CARPETA = 'procedimientos';

// ── Lista ───────────────────────────────────────────────────────────────────────────────────────────────────

const mockLista: Procedimiento[] = [
  { idProcedimiento: 141, codigo: 'VJMDR', anio: 2009, version: 2, normaBase: 'OIML R76-1 · NMP 002:2009', autorNorma: 'INDECOPI', tipo: 'calibracion', descripcion: 'Procedimiento General para la Calibración de Balanzas de Funcionamiento No Automático.', alcance: '0 a 300 kg · Clase III y IIII', aprobadoPor: 'Dr. Luis Vargas · Director Técnico', actualizado: '2026-10-12', pdfNombre: 'VJMDR_v2.pdf', pdfTamanoBytes: 2_400_000, pdfHash: 'a1', formatoDigitalIso: true, paraServicioHoy: 'OS-0845-2026', historial: [{ version: 1, reemplazadaEl: '2009-11-30' }] },
  { idProcedimiento: 89, codigo: 'EDW-B-2', anio: 2016, version: 1, normaBase: 'ASTM E4 · ISO 7500', autorNorma: 'ASTM International', tipo: 'verificacion', descripcion: 'Standard Practice for Force Verification of Testing Machines.', alcance: 'Hasta 1000 kN', aprobadoPor: null, actualizado: '2026-09-05', pdfNombre: 'EDW-B-2_v1.pdf', pdfTamanoBytes: 3_100_000, pdfHash: 'b1', formatoDigitalIso: true, paraServicioHoy: null, historial: [] },
];

/** Procedimientos aprobados. Sin conexión devuelve los últimos guardados (`sinConexion`). */
export async function obtenerBiblioteca(token: string, idUsuario: number): Promise<ConRespaldo<Procedimiento[]>> {
  if (entorno.usarMock) return { datos: mockLista, sinConexion: false, guardadoEn: new Date() };
  return conRespaldo(idUsuario, 'procedimientos.biblioteca', async () => {
    const r = await solicitar<Biblioteca>('/api/movil/procedimientos', { token });
    return r.datos?.procedimientos ?? [];
  });
}

// ── Archivos en el teléfono ─────────────────────────────────────────────────────────────────────────────────

/** Nombre del archivo local: cambia si cambia la versión o el contenido aprobado, así se sabe si el teléfono tiene la vigente. */
export function nombreLocal(p: Procedimiento): string {
  return `${p.idProcedimiento}_v${p.version}_${(p.pdfHash ?? 'x').slice(0, 8)}.pdf`;
}

function carpeta(f: NonNullable<ReturnType<typeof sistemaArchivos>>) {
  const d = new f.Directory(f.Paths.document, CARPETA);
  d.create({ idempotent: true, intermediates: true });
  return d;
}

/** Archivos de este procedimiento que hay en el teléfono (de cualquier versión). */
function archivosDe(id: number): string[] {
  const f = sistemaArchivos();
  if (!f) return [];
  try {
    return carpeta(f)
      .list()
      .filter((x) => x instanceof f.File && x.name.startsWith(`${id}_`))
      .map((x) => x.name);
  } catch {
    return [];
  }
}

/** true = la versión vigente ya está en el teléfono. */
export function estaDescargado(p: Procedimiento): boolean {
  return archivosDe(p.idProcedimiento).includes(nombreLocal(p));
}

/** true = hay un archivo guardado pero es de una versión anterior (se reemplaza sola al haber conexión). */
export function tieneVersionAnterior(p: Procedimiento): boolean {
  const nombres = archivosDe(p.idProcedimiento);
  return nombres.length > 0 && !nombres.includes(nombreLocal(p));
}

/** Descarga la versión vigente y borra las anteriores. Devuelve la ruta del archivo. */
export async function descargarProcedimiento(token: string, p: Procedimiento): Promise<string> {
  const f = sistemaArchivos();
  if (!f) throw new Error('Esta versión de la app no puede guardar archivos. Instala la última.');
  const dir = carpeta(f);
  const destino = new f.File(dir, nombreLocal(p));
  await f.File.downloadFileAsync(`${entorno.apiUrl}/api/movil/procedimientos/${p.idProcedimiento}/pdf`, destino, {
    headers: { Authorization: `Bearer ${token}` },
    idempotent: true,
  });
  if (!destino.exists || destino.size === 0) {
    try {
      destino.delete();
    } catch {
      // nada que borrar
    }
    throw new Error('No se pudo descargar el PDF. Inténtalo de nuevo.');
  }
  for (const n of archivosDe(p.idProcedimiento)) {
    if (n !== nombreLocal(p)) {
      try {
        new f.File(dir, n).delete();
      } catch {
        // si no se puede borrar, no estorba
      }
    }
  }
  return destino.uri;
}

/** Quita el PDF del teléfono (sigue en la lista; se puede volver a descargar). */
export function quitarDescarga(p: Procedimiento): void {
  const f = sistemaArchivos();
  if (!f) return;
  const dir = carpeta(f);
  for (const n of archivosDe(p.idProcedimiento)) {
    try {
      new f.File(dir, n).delete();
    } catch {
      // ya no estaba
    }
  }
}

/** Ruta del PDF vigente en el teléfono, o null si no está. */
export function rutaLocal(p: Procedimiento): string | null {
  const f = sistemaArchivos();
  if (!f || !estaDescargado(p)) return null;
  return new f.File(carpeta(f), nombreLocal(p)).uri;
}

/**
 * Deja el teléfono al día con lo aprobado: descarga los procedimientos de los servicios de hoy, reemplaza sola la versión anterior de lo que ya estaba
 * descargado y borra los archivos de procedimientos que ya no están aprobados. Nunca lanza error: es un trabajo de fondo.
 * Devuelve cuántos archivos se descargaron.
 */
export async function sincronizarProcedimientos(token: string, lista: Procedimiento[]): Promise<number> {
  const f = sistemaArchivos();
  if (!f || entorno.usarMock) return 0;
  let n = 0;
  try {
    const vigentes = new Set(lista.map((p) => p.idProcedimiento));
    const dir = carpeta(f);
    for (const x of dir.list()) {
      const id = Number.parseInt(x.name, 10);
      if (x instanceof f.File && Number.isInteger(id) && !vigentes.has(id)) x.delete();
    }
  } catch {
    // limpiar es opcional
  }
  for (const p of lista) {
    if (estaDescargado(p)) continue;
    if (p.paraServicioHoy || tieneVersionAnterior(p)) {
      try {
        await descargarProcedimiento(token, p);
        n += 1;
      } catch {
        // sin señal o PDF no disponible: se reintenta la próxima vez
      }
    }
  }
  return n;
}

// ── Abrir ───────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Abre el PDF con el lector de PDF del teléfono. La app no trae un visor propio (índice y búsqueda dentro de la app necesitarían una librería
 * nativa de PDF): el lector del teléfono ya trae búsqueda, zoom e índice y funciona sin conexión porque el archivo está guardado.
 */
export async function abrirPdf(uri: string): Promise<void> {
  const f = sistemaArchivos();
  if (Platform.OS === 'android' && f && requireOptionalNativeModule('ExpoIntentLauncher')) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const IL = require('expo-intent-launcher') as typeof import('expo-intent-launcher');
    try {
      await IL.startActivityAsync('android.intent.action.VIEW', { data: new f.File(uri).contentUri, type: 'application/pdf', flags: 1 });
      return;
    } catch {
      throw new Error('No hay una aplicación para leer PDF en este teléfono. Instala un lector de PDF (por ejemplo, Google Drive o Adobe Acrobat).');
    }
  }
  try {
    await Linking.openURL(uri);
  } catch {
    throw new Error('Para abrir el PDF necesitas instalar la última versión de la app.');
  }
}

// ── Textos y filtros (sin acceso al teléfono: se prueban solos) ──────────────────────────────────────────

export type FiltroProcedimiento = 'todos' | 'descargados' | 'calibracion' | 'verificacion';

export function etiquetaTipo(tipo: string | null): string {
  switch (tipo) {
    case 'calibracion':
      return 'Calibración';
    case 'verificacion':
      return 'Verificación';
    case 'mantenimiento':
      return 'Mantenimiento';
    case 'instalacion':
      return 'Instalación';
    default:
      return '';
  }
}

/** Quita tildes y pasa a minúsculas para buscar sin importar cómo se escriba. */
const plano = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Busca por código, norma o descripción y aplica el filtro (Descargados · Calibración · Verificación). */
export function filtrarProcedimientos(
  lista: Procedimiento[],
  busqueda: string,
  filtro: FiltroProcedimiento,
  descargado: (p: Procedimiento) => boolean,
): Procedimiento[] {
  const q = plano(busqueda.trim());
  return lista.filter((p) => {
    if (filtro === 'descargados' && !descargado(p)) return false;
    if (filtro === 'calibracion' && p.tipo !== 'calibracion') return false;
    if (filtro === 'verificacion' && p.tipo !== 'verificacion') return false;
    if (!q) return true;
    return [p.codigo, p.normaBase, p.autorNorma, p.descripcion].some((c) => !!c && plano(c).includes(q));
  });
}

/** 2_400_000 → "2.3 MB"; 3_400 → "3 KB". */
export function textoTamano(bytes: number | null): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** "2026-10-12" → "12/10/2026". */
export function fechaDMA(iso: string | null): string {
  const m = iso ? /^(\d{4})-(\d{2})-(\d{2})/.exec(iso) : null;
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '—';
}

/** Sin conexión y el PDF no está en el teléfono. */
export class ProcedimientoNoDescargado extends Error {
  constructor(readonly codigo: string) {
    super(`${codigo} es solo online. Podrás verlo o descargarlo cuando vuelvas a tener señal.`);
    this.name = 'ProcedimientoNoDescargado';
  }
}

/** Abre el procedimiento: si no está en el teléfono lo descarga primero (con conexión). */
export async function verProcedimiento(token: string, p: Procedimiento, sinConexion: boolean): Promise<void> {
  let ruta = rutaLocal(p);
  if (!ruta) {
    if (sinConexion) throw new ProcedimientoNoDescargado(p.codigo);
    ruta = await descargarProcedimiento(token, p);
  }
  await abrirPdf(ruta);
}
