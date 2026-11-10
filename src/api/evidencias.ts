import { Platform } from 'react-native';
import { solicitar } from './cliente';
import { entorno } from '@/config/entorno';
import { conRespaldo, type ConRespaldo } from './respaldo';
import type { Ubicacion } from './ruta';

/**
 * HU-11 / HU-12 / HU-13 — Registro fotográfico, evidencia forzada y microvideo de encendido.
 *   GET  api/movil/servicios/{idOs}/equipos/{idOsEquipo}/evidencias                       → SP_ObtenerEvidenciasMovil
 *   POST api/movil/servicios/{idOs}/equipos/{idOsEquipo}/evidencias (multipart)           → SP_RegistrarEvidenciaMovil (foto, video o QR; valida con IA)
 *   POST api/movil/servicios/{idOs}/equipos/{idOsEquipo}/evidencias/{id}/forzar           → SP_ForzarEvidenciaMovil (HU-12)
 *   GET  api/movil/servicios/{idOs}/equipos/{idOsEquipo}/evidencias/{id}/archivo[?cuadro=true]
 * El back valida el archivo, la IA y las reglas (serie de la placa, QR del equipo, 3 a 5 s): la app solo captura y muestra.
 */

export type CodigoEvidencia = 'placa' | 'inicial' | 'encendido' | 'desmontaje' | 'abierto' | 'prueba' | 'final' | 'informe' | 'qr';
export type EstadoEvidencia = 'pendiente' | 'aprobada' | 'rechazada' | 'forzada' | 'omitida';

/** Lo que leyó la IA (según la evidencia): datos de la placa, legibilidad del informe, display del encendido… */
export interface DatosIa {
  sugerencia?: string | null;
  marca?: string | null;
  modelo?: string | null;
  serie?: string | null;
  capacidad?: string | null;
  legibilidad?: string | null;
  hojaCompleta?: boolean | null;
  firmaVisible?: boolean | null;
  displayDetectado?: boolean | null;
  lectura?: string | null;
  qr?: string | null;
}

export interface Evidencia {
  orden: number;
  codigo: CodigoEvidencia | string;
  nombre: string;
  descripcion: string;
  /** Marcada con (*): placa e inicial. */
  obligatoria: boolean;
  medio: 'foto' | 'video' | 'qr' | string;
  estado: EstadoEvidencia | string;
  idEvidencia: number | null;
  intento: number | null;
  esVideo: boolean;
  duracionSeg: number | null;
  /** Hojas válidas del informe a mano. */
  paginas: number;
  motivoRechazoIa: string | null;
  motivoForzado: string | null;
  forzadaPor: string | null;
  forzadaEn: string | null;
  intentosPrevios: number;
  capturadaEn: string | null;
  resultadoIa: DatosIa | null;
  /** Hay un cuadro del video (sirve de miniatura). */
  tieneCuadro: boolean;
}

export interface CabeceraEvidencias {
  idOs: number;
  idOsEquipo: number;
  numeroOs: string;
  nombre: string;
  numero: number;
  servicioSigla: string | null;
  numeroSerie: string | null;
  codigoCliente: string | null;
  codigoTw: string | null;
  marca: string | null;
  modelo: string | null;
  estado: string;
  /** El equipo está en ejecución y el servicio en curso: solo así se capturan evidencias. */
  puedeRegistrar: boolean;
  numeroRq: string | null;
  total: number;
  completas: number;
  forzadas: number;
  rechazadas: number;
  obligatoriasFaltan: number;
  /** Las 9 completas: "Guardar y volver". */
  puedeGuardar: boolean;
}

export interface Evidencias {
  cabecera: CabeceraEvidencias;
  evidencias: Evidencia[];
}

export interface CapturaEvidencia {
  codigo: CodigoEvidencia;
  /** Hoja del informe (1 para las demás). */
  pagina?: number;
  /** Foto JPEG de la cámara de la app, o el video MP4 del encendido. Sin archivo solo en el QR. */
  archivoUri?: string;
  /** Cuadro JPEG del video: lo analiza la IA y sirve de miniatura. */
  cuadroUri?: string;
  ubicacion?: Ubicacion | null;
  /** Hora (ISO 8601, UTC) en que el teléfono tomó la captura. */
  capturadoEn: string;
  duracionSeg?: number;
  /** Contenido leído del QR del equipo. */
  qrTexto?: string;
}

export interface ResultadoEvidencia {
  idEvidencia: number;
  estado: 'aprobada' | 'rechazada' | 'omitida' | string;
  motivoRechazo: string | null;
  intento: number;
  /** La placa o el QR corresponden al equipo (null = no se pudo comparar). */
  coincide: boolean | null;
  numeroRq: string | null;
  datosIa: DatosIa | null;
  mensaje: string;
}

const ruta = (idOs: number, idOsEquipo: number) =>
  `/api/movil/servicios/${encodeURIComponent(String(idOs))}/equipos/${encodeURIComponent(String(idOsEquipo))}/evidencias`;

export async function obtenerEvidencias(token: string, idOs: number, idOsEquipo: number): Promise<Evidencias> {
  if (entorno.usarMock) return mockEvidencias.obtener(idOs, idOsEquipo);
  return (await solicitar<Evidencias>(ruta(idOs, idOsEquipo), { token })).datos!;
}

/** Sin conexión muestra lo último guardado (las capturas y la IA exigen conexión). */
export async function obtenerEvidenciasConRespaldo(token: string, idUsuario: number, idOs: number, idOsEquipo: number): Promise<ConRespaldo<Evidencias>> {
  if (entorno.usarMock) return { datos: await mockEvidencias.obtener(idOs, idOsEquipo), sinConexion: false, guardadoEn: new Date() };
  return conRespaldo(idUsuario, `evidencias.${idOs}.${idOsEquipo}`, () => obtenerEvidencias(token, idOs, idOsEquipo));
}

async function agregarArchivo(form: FormData, campo: string, uri: string, nombre: string, tipo: string) {
  if (Platform.OS === 'web') {
    form.append(campo, await (await fetch(uri)).blob(), nombre);
  } else {
    form.append(campo, { uri, name: nombre, type: tipo } as unknown as Blob);
  }
}

/** Sube la captura (el back la valida con IA y la registra). Con la IA de por medio puede tardar: espera hasta 90 s. */
export async function capturarEvidencia(token: string, idOs: number, idOsEquipo: number, c: CapturaEvidencia): Promise<ResultadoEvidencia> {
  if (entorno.usarMock) return mockEvidencias.capturar(idOs, idOsEquipo, c);
  const form = new FormData();
  form.append('codigo', c.codigo);
  form.append('pagina', String(c.pagina ?? 1));
  form.append('capturadoEn', c.capturadoEn);
  if (c.ubicacion) {
    form.append('latitud', c.ubicacion.latitud.toFixed(7));
    form.append('longitud', c.ubicacion.longitud.toFixed(7));
    form.append('precisionMetros', c.ubicacion.precisionMetros.toFixed(1));
  }
  if (c.duracionSeg !== undefined) form.append('duracionSeg', c.duracionSeg.toFixed(1));
  if (c.qrTexto) form.append('qrTexto', c.qrTexto);
  if (c.archivoUri) {
    const video = c.codigo === 'encendido';
    await agregarArchivo(form, 'archivo', c.archivoUri, video ? 'encendido.mp4' : `${c.codigo}.jpg`, video ? 'video/mp4' : 'image/jpeg');
  }
  if (c.cuadroUri) await agregarArchivo(form, 'cuadro', c.cuadroUri, 'cuadro.jpg', 'image/jpeg');
  const r = await solicitar<ResultadoEvidencia>(ruta(idOs, idOsEquipo), { token, metodo: 'POST', cuerpo: form, timeoutMs: 90_000 });
  return { ...r.datos!, mensaje: r.datos?.mensaje ?? r.mensaje };
}

/** HU-12: acepta a la fuerza una toma rechazada por la IA, solo con un motivo escrito. Devuelve el panel actualizado. */
export async function forzarEvidencia(
  token: string,
  idOs: number,
  idOsEquipo: number,
  idEvidencia: number,
  motivo: string,
): Promise<{ mensaje: string; evidencias: Evidencias | null }> {
  if (entorno.usarMock) return mockEvidencias.forzar(idOs, idOsEquipo, idEvidencia, motivo);
  const r = await solicitar<Evidencias>(`${ruta(idOs, idOsEquipo)}/${encodeURIComponent(String(idEvidencia))}/forzar`, {
    token,
    metodo: 'POST',
    cuerpo: { motivo: motivo.trim() },
  });
  return { mensaje: r.mensaje, evidencias: r.datos ?? null };
}

/** Dirección del archivo de una evidencia (hay que pedirla con el token de la sesión en la cabecera Authorization). */
export function urlArchivoEvidencia(idOs: number, idOsEquipo: number, idEvidencia: number, cuadro = false): string {
  return `${entorno.apiUrl}${ruta(idOs, idOsEquipo)}/${encodeURIComponent(String(idEvidencia))}/archivo${cuadro ? '?cuadro=true' : ''}`;
}

// ── Modo demo (EXPO_PUBLIC_USE_MOCK=true): la IA rechaza la primera foto de la placa y luego aprueba; todo en memoria ──
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));
const CATALOGO: Omit<Evidencia, 'estado' | 'idEvidencia' | 'intento' | 'esVideo' | 'duracionSeg' | 'paginas' | 'motivoRechazoIa' | 'motivoForzado' | 'forzadaPor' | 'forzadaEn' | 'intentosPrevios' | 'capturadaEn' | 'resultadoIa' | 'tieneCuadro'>[] = [
  { orden: 1, codigo: 'placa', nombre: 'Placa de identificación', descripcion: 'Especificaciones del equipo', obligatoria: true, medio: 'foto' },
  { orden: 2, codigo: 'inicial', nombre: 'Inicial', descripcion: 'Estado inicial del equipo', obligatoria: true, medio: 'foto' },
  { orden: 3, codigo: 'encendido', nombre: 'Encendido', descripcion: 'Video del display (HU-13)', obligatoria: false, medio: 'video' },
  { orden: 4, codigo: 'desmontaje', nombre: 'Desmontaje', descripcion: 'Partes desmontadas', obligatoria: false, medio: 'foto' },
  { orden: 5, codigo: 'abierto', nombre: 'Abierto', descripcion: 'Interior del equipo', obligatoria: false, medio: 'foto' },
  { orden: 6, codigo: 'prueba', nombre: 'Prueba', descripcion: 'Equipo con pesas patrón', obligatoria: false, medio: 'foto' },
  { orden: 7, codigo: 'final', nombre: 'Final', descripcion: 'Equipo terminado y limpio', obligatoria: false, medio: 'foto' },
  { orden: 8, codigo: 'informe', nombre: 'Informe', descripcion: 'Foto del informe a mano', obligatoria: false, medio: 'foto' },
  { orden: 9, codigo: 'qr', nombre: 'QR', descripcion: 'Etiqueta QR del equipo', obligatoria: false, medio: 'qr' },
];
const demo = new Map<string, Evidencia>();
const intentos = new Map<string, number>();
let siguienteId = 1;

function panelDemo(idOs: number, idOsEquipo: number): Evidencias {
  const evidencias: Evidencia[] = CATALOGO.map(
    (c) =>
      demo.get(c.codigo) ?? {
        ...c, estado: 'pendiente', idEvidencia: null, intento: null, esVideo: c.medio === 'video', duracionSeg: null, paginas: 0, motivoRechazoIa: null,
        motivoForzado: null, forzadaPor: null, forzadaEn: null, intentosPrevios: 0, capturadaEn: null, resultadoIa: null, tieneCuadro: false,
      },
  );
  const completas = evidencias.filter((e) => e.estado === 'aprobada' || e.estado === 'forzada' || e.estado === 'omitida').length;
  return {
    cabecera: {
      idOs, idOsEquipo, numeroOs: 'OS-000791', nombre: 'Báscula Camionera', numero: 1, servicioSigla: 'MC', numeroSerie: 'MT-552', codigoCliente: 'BAL-001',
      codigoTw: 'EQ-TW-2026-0501', marca: 'Mettler Toledo', modelo: 'VTC-221', estado: 'en_ejecucion', puedeRegistrar: true, numeroRq: 'RQ-000245',
      total: 9, completas, forzadas: evidencias.filter((e) => e.estado === 'forzada').length, rechazadas: evidencias.filter((e) => e.estado === 'rechazada').length,
      obligatoriasFaltan: evidencias.filter((e) => e.obligatoria && !(e.estado === 'aprobada' || e.estado === 'forzada' || e.estado === 'omitida')).length,
      puedeGuardar: completas === 9,
    },
    evidencias,
  };
}

const mockEvidencias = {
  async obtener(idOs: number, idOsEquipo: number): Promise<Evidencias> {
    await esperar(250);
    return panelDemo(idOs, idOsEquipo);
  },
  async capturar(_idOs: number, _idOsEquipo: number, c: CapturaEvidencia): Promise<ResultadoEvidencia> {
    await esperar(900);
    const n = (intentos.get(c.codigo) ?? 0) + 1;
    intentos.set(c.codigo, n);
    const base = CATALOGO.find((x) => x.codigo === c.codigo)!;
    const rechaza = (c.codigo === 'placa' && n === 1) || (c.codigo === 'encendido' && n === 1);
    const motivo = c.codigo === 'encendido' ? 'No se detectó el display. Acércate y enfoca la pantalla del equipo.' : 'Placa ilegible por reflejo y falta de nitidez. No se pudo leer la serie.';
    const datos: DatosIa | null = rechaza
      ? { sugerencia: 'Evita la luz directa y acércate a unos 30 cm.' }
      : c.codigo === 'placa'
        ? { marca: 'Mettler Toledo', modelo: 'VTC-221', serie: 'MT-552', capacidad: '80,000 kg' }
        : c.codigo === 'informe'
          ? { legibilidad: 'BUENA', hojaCompleta: true, firmaVisible: true }
          : c.codigo === 'encendido'
            ? { displayDetectado: true, lectura: '0 kg' }
            : null;
    const id = siguienteId++;
    const previo = demo.get(c.codigo);
    demo.set(c.codigo, {
      ...base, estado: rechaza ? 'rechazada' : 'aprobada', idEvidencia: id, intento: n, esVideo: c.codigo === 'encendido', duracionSeg: c.duracionSeg ?? null,
      paginas: c.codigo === 'informe' ? Math.max(previo?.paginas ?? 0, c.pagina ?? 1) : rechaza ? 0 : 1, motivoRechazoIa: rechaza ? motivo : null, motivoForzado: null,
      forzadaPor: null, forzadaEn: null, intentosPrevios: n - 1, capturadaEn: c.capturadoEn, resultadoIa: datos, tieneCuadro: c.codigo === 'encendido',
    });
    return { idEvidencia: id, estado: rechaza ? 'rechazada' : 'aprobada', motivoRechazo: rechaza ? motivo : null, intento: n, coincide: c.codigo === 'placa' && !rechaza ? true : null,
      numeroRq: 'RQ-000245', datosIa: datos, mensaje: rechaza ? 'La IA rechazó la toma.' : 'Evidencia guardada y validada por la IA.' };
  },
  async forzar(idOs: number, idOsEquipo: number, idEvidencia: number, motivo: string) {
    await esperar(300);
    for (const [k, e] of demo) {
      if (e.idEvidencia === idEvidencia) {
        demo.set(k, { ...e, estado: 'forzada', motivoForzado: motivo.trim(), forzadaPor: 'Juan Pérez', forzadaEn: new Date(Date.now() - 5 * 3_600_000).toISOString().slice(0, 19) });
      }
    }
    return { mensaje: 'Foto aceptada como evidencia forzada: quedó registrada y visible para Jefatura.', evidencias: panelDemo(idOs, idOsEquipo) };
  },
};
