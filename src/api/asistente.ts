import { agregarArchivo } from './archivosLocales';
import { solicitar } from './cliente';
import { entorno } from '@/config/entorno';
import { conRespaldo, type ConRespaldo } from './respaldo';

/**
 * HU-19 — Asistente IA y Procedimientos.
 *   GET    api/movil/asistente/inicio?idOs&idOsEquipo               → contexto (equipo en trabajo), documentos, sugerencias y consultas recientes
 *   GET    api/movil/asistente/equipos                              → equipos para "Cambiar" el contexto
 *   POST   api/movil/asistente/consultas                            → pregunta; el back responde SOLO con los documentos oficiales del equipo (IA)
 *   GET    api/movil/asistente/consultas/{id}                       → una consulta anterior
 *   POST   api/movil/asistente/consultas/{id}/valoracion            → "¿Te sirvió la respuesta?"
 *   GET    api/movil/asistente/consultas/{id}/fuentes/{n}           → "Fuente consultada"
 *   POST   api/movil/asistente/voz (multipart `audio`)              → transcripción de la consulta por voz
 *   GET/POST/DELETE api/movil/asistente/guardados[/{id}]            → guardados (copia en el servidor; el teléfono guarda la suya: guardadosAsistente.ts)
 * El back decide todo (asignación, documentos oficiales, cita verificada, límites de uso): la app solo muestra.
 */

export type OrigenConsulta = 'texto' | 'voz' | 'sugerencia';
export type TipoGuardado = 'respuesta' | 'fragmento';

export interface ContextoAsistente {
  idOs: number;
  numeroOs: string;
  idOsEquipo: number;
  nombre: string;
  numero: number;
  marca: string | null;
  modelo: string | null;
  codigoCliente: string | null;
  numeroSerie: string | null;
  servicioSigla: string | null;
  estado: string;
}

/** Documento oficial del equipo con el que puede responder el asistente. */
export interface FuenteDisponible {
  idDocumento: string;
  tipo: 'manual' | 'procedimiento' | string;
  titulo: string;
  version: string | null;
  entidad: string | null;
  actualizado: string | null;
  disponible: boolean;
}

export interface ConsultaReciente {
  idConsulta: number;
  pregunta: string;
  fuente: string | null;
  creadoEn: string;
}

export interface InicioAsistente {
  contexto: ContextoAsistente | null;
  fuentes: FuenteDisponible[];
  sugerencias: string[];
  recientes: ConsultaReciente[];
}

export interface EquipoAsistente {
  idOs: number;
  numeroOs: string;
  idOsEquipo: number;
  nombre: string;
  numero: number;
  marca: string | null;
  modelo: string | null;
  codigoCliente: string | null;
  estado: string;
  enTrabajo: boolean;
  fuentesDisponibles: number;
}

export interface FuenteRespuesta {
  n: number;
  idDocumento: string;
  documento: string;
  tipo: 'manual' | 'procedimiento' | string;
  entidad: string | null;
  version: string | null;
  actualizado: string | null;
  seccion: string | null;
  pagina: number | null;
  /** Texto citado del documento; null si no se encontró el tema (solo se lista el documento consultado). */
  fragmento: string | null;
  /** La cita existe en el PDF (true), no se encontró (false) o el PDF no tiene texto para comprobarlo (null). */
  verificada: boolean | null;
}

export interface RespuestaAsistente {
  idConsulta: number;
  idOs: number;
  idOsEquipo: number;
  pregunta: string;
  origen: OrigenConsulta | string;
  creadoEn: string;
  encontrada: boolean;
  advertencia: string | null;
  pasos: string[];
  fuentes: FuenteRespuesta[];
  motivoSinRespuesta: string | null;
  /** "¿Te sirvió la respuesta?": true, false o sin contestar. */
  util: boolean | null;
}

export interface FuenteConsultada {
  idConsulta: number;
  n: number;
  idDocumento: string;
  documento: string;
  tipo: 'manual' | 'procedimiento' | string;
  oficial: boolean;
  entidad: string | null;
  version: string | null;
  actualizado: string | null;
  pagina: number | null;
  seccion: string | null;
  advertencia: string | null;
  fragmento: string;
  contextoPosterior: string | null;
  verificada: boolean | null;
}

export interface GuardadoResumen {
  idGuardado: number;
  tipo: TipoGuardado | string;
  titulo: string;
  subtitulo: string;
  creadoEn: string;
  tamanoBytes: number;
}

export interface GuardadoCompleto extends GuardadoResumen {
  respuesta: RespuestaAsistente | null;
  fuente: FuenteConsultada | null;
}

export interface NuevaConsulta {
  idOs: number;
  idOsEquipo: number;
  pregunta: string;
  origen: OrigenConsulta;
}

const BASE = '/api/movil/asistente';
/** La IA puede tardar hasta 60 s leyendo los manuales. */
const TIEMPO_CONSULTA_MS = 80_000;
/** Transcribir un audio corto con la IA. */
const TIEMPO_VOZ_MS = 60_000;

const parametros = (idOs?: number, idOsEquipo?: number) => {
  const q: string[] = [];
  if (idOs && idOs > 0) q.push(`idOs=${encodeURIComponent(String(idOs))}`);
  if (idOsEquipo && idOsEquipo > 0) q.push(`idOsEquipo=${encodeURIComponent(String(idOsEquipo))}`);
  return q.length > 0 ? `?${q.join('&')}` : '';
};

export async function obtenerInicio(token: string, idOs?: number, idOsEquipo?: number): Promise<InicioAsistente> {
  if (entorno.usarMock) return mockAsistente.inicio(idOs, idOsEquipo);
  return (await solicitar<InicioAsistente>(`${BASE}/inicio${parametros(idOs, idOsEquipo)}`, { token })).datos!;
}

/** Igual que `obtenerInicio`, pero sin conexión muestra lo último guardado (consultar sí exige conexión). */
export async function obtenerInicioConRespaldo(token: string, idUsuario: number, idOs?: number, idOsEquipo?: number): Promise<ConRespaldo<InicioAsistente>> {
  if (entorno.usarMock) return { datos: await mockAsistente.inicio(idOs, idOsEquipo), sinConexion: false, guardadoEn: new Date() };
  return conRespaldo(idUsuario, `asistente.inicio.${idOs ?? 0}.${idOsEquipo ?? 0}`, () => obtenerInicio(token, idOs, idOsEquipo));
}

export async function obtenerEquipos(token: string): Promise<EquipoAsistente[]> {
  if (entorno.usarMock) return mockAsistente.equipos();
  return (await solicitar<EquipoAsistente[]>(`${BASE}/equipos`, { token })).datos ?? [];
}

export async function consultar(token: string, c: NuevaConsulta): Promise<RespuestaAsistente> {
  if (entorno.usarMock) return mockAsistente.consultar(c);
  const r = await solicitar<RespuestaAsistente>(`${BASE}/consultas`, {
    token,
    metodo: 'POST',
    cuerpo: { idOs: c.idOs, idOsEquipo: c.idOsEquipo, pregunta: c.pregunta, origen: c.origen },
    timeoutMs: TIEMPO_CONSULTA_MS,
  });
  return r.datos!;
}

export async function obtenerConsulta(token: string, idConsulta: number): Promise<RespuestaAsistente> {
  if (entorno.usarMock) return mockAsistente.consulta(idConsulta);
  return (await solicitar<RespuestaAsistente>(`${BASE}/consultas/${encodeURIComponent(String(idConsulta))}`, { token })).datos!;
}

export async function valorar(token: string, idConsulta: number, util: boolean): Promise<void> {
  if (entorno.usarMock) return mockAsistente.valorar(idConsulta, util);
  await solicitar<null>(`${BASE}/consultas/${encodeURIComponent(String(idConsulta))}/valoracion`, { token, metodo: 'POST', cuerpo: { util } });
}

export async function obtenerFuente(token: string, idConsulta: number, n: number): Promise<FuenteConsultada> {
  if (entorno.usarMock) return mockAsistente.fuente(idConsulta, n);
  return (await solicitar<FuenteConsultada>(`${BASE}/consultas/${encodeURIComponent(String(idConsulta))}/fuentes/${encodeURIComponent(String(n))}`, { token })).datos!;
}

/**
 * Consulta por voz: sube el audio grabado y devuelve el texto. El back no guarda el audio.
 * Se envía con `agregarArchivo` (un File de expo-file-system): el formato `{ uri, name, type }` no lo acepta el fetch de Expo.
 */
export async function transcribirVoz(token: string, audioUri: string, tipo = 'audio/mp4'): Promise<string> {
  if (entorno.usarMock) return mockAsistente.transcribir();
  const form = new FormData();
  await agregarArchivo(form, 'audio', audioUri, 'consulta.m4a', tipo);
  const r = await solicitar<{ texto: string }>(`${BASE}/voz`, { token, metodo: 'POST', cuerpo: form, timeoutMs: TIEMPO_VOZ_MS });
  return r.datos?.texto?.trim() ?? '';
}

export async function listarGuardados(token: string, busqueda?: string): Promise<GuardadoResumen[]> {
  if (entorno.usarMock) return mockAsistente.listarGuardados(busqueda);
  const q = busqueda?.trim() ? `?busqueda=${encodeURIComponent(busqueda.trim())}` : '';
  return (await solicitar<GuardadoResumen[]>(`${BASE}/guardados${q}`, { token })).datos ?? [];
}

/** Guarda en el servidor una copia de la respuesta o del fragmento (idempotente: guardar dos veces lo mismo devuelve el existente). */
export async function guardarEnServidor(token: string, g: { idConsulta: number; tipo: TipoGuardado; n?: number }): Promise<GuardadoCompleto> {
  if (entorno.usarMock) return mockAsistente.guardar(g);
  const r = await solicitar<GuardadoCompleto>(`${BASE}/guardados`, {
    token,
    metodo: 'POST',
    cuerpo: { idConsulta: g.idConsulta, tipo: g.tipo, ...(g.tipo === 'fragmento' ? { n: g.n } : {}) },
  });
  return r.datos!;
}

export async function obtenerGuardado(token: string, idGuardado: number): Promise<GuardadoCompleto> {
  if (entorno.usarMock) return mockAsistente.obtenerGuardado(idGuardado);
  return (await solicitar<GuardadoCompleto>(`${BASE}/guardados/${encodeURIComponent(String(idGuardado))}`, { token })).datos!;
}

export async function eliminarGuardado(token: string, idGuardado: number): Promise<void> {
  if (entorno.usarMock) return mockAsistente.eliminarGuardado(idGuardado);
  await solicitar<null>(`${BASE}/guardados/${encodeURIComponent(String(idGuardado))}`, { token, metodo: 'DELETE' });
}

// ── Modo demo (EXPO_PUBLIC_USE_MOCK=true): los datos viven en memoria mientras la app está abierta ──
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ahoraLima = () => new Date(Date.now() - 5 * 3_600_000).toISOString().slice(0, 19);

const demoContexto: ContextoAsistente = {
  idOs: 845, numeroOs: 'OS-000845', idOsEquipo: 24, nombre: 'Balanza de plataforma', numero: 1, marca: 'Mettler Toledo', modelo: 'PBA430',
  codigoCliente: 'BAL-012', numeroSerie: '3141592', servicioSigla: 'MC', estado: 'en_ejecucion',
};

const demoFuente: FuenteRespuesta = {
  n: 1, idDocumento: 'M-33', documento: 'Manual PBA430 v2.0', tipo: 'manual', entidad: 'Mettler Toledo', version: 'v2.0', actualizado: '2026-03-01',
  seccion: '6.4 Ajuste de excentricidad', pagina: 42,
  fragmento: 'Coloque una carga equivalente a 1/3 de la capacidad máxima en el centro de la plataforma y registre la indicación. Repita el procedimiento en cada esquina…',
  verificada: true,
};

const demo = {
  siguiente: 20,
  consultas: new Map<number, RespuestaAsistente>(),
  guardados: new Map<number, GuardadoCompleto>(),
  recientes: [
    { idConsulta: 12, pregunta: 'Ajuste de excentricidad PBA430', fuente: 'Manual PBA430 §6.4', creadoEn: ahoraLima() },
    { idConsulta: 11, pregunta: 'Humedad en caja de conexiones', fuente: 'Guía de mantenimiento §3.1', creadoEn: new Date(Date.now() - 29 * 3_600_000).toISOString().slice(0, 19) },
  ] as ConsultaReciente[],
};

function respuestaDemo(c: NuevaConsulta): RespuestaAsistente {
  const id = demo.siguiente++;
  const sinTema = /^\s*(xx|zzz)/i.test(c.pregunta);
  return {
    idConsulta: id, idOs: c.idOs, idOsEquipo: c.idOsEquipo, pregunta: c.pregunta, origen: c.origen, creadoEn: ahoraLima(),
    encontrada: !sinTema,
    advertencia: sinTema ? null : 'Desenergiza el indicador y retira la carga antes de manipular las celdas.',
    pasos: sinTema ? [] : [
      'Coloca la carga de prueba (1/3 de la capacidad) en el centro y anota la indicación.',
      'Repite en las 4 esquinas.',
      'Ajusta el potenciómetro de la celda con mayor desviación y vuelve a medir.',
    ],
    fuentes: [sinTema ? { ...demoFuente, seccion: null, pagina: null, fragmento: null, verificada: null } : demoFuente],
    motivoSinRespuesta: sinTema ? 'No encontré este tema en los manuales oficiales de este equipo.' : null,
    util: null,
  };
}

const mockAsistente = {
  async inicio(idOs?: number, idOsEquipo?: number): Promise<InicioAsistente> {
    await esperar(250);
    return {
      contexto: { ...demoContexto, ...(idOs ? { idOs } : {}), ...(idOsEquipo ? { idOsEquipo } : {}) },
      fuentes: [
        { idDocumento: 'M-33', tipo: 'manual', titulo: 'Manual PBA430 v2.0', version: 'v2.0', entidad: 'Mettler Toledo', actualizado: '2026-03-01', disponible: true },
        { idDocumento: 'P-84', tipo: 'procedimiento', titulo: 'PC-001 · Calibración de instrumentos de pesaje', version: 'v2', entidad: 'INACAL-DM', actualizado: '2025-01-15', disponible: true },
      ],
      sugerencias: ['Ajuste de excentricidad', 'Calibración con pesas', 'Error E-23 del indicador', 'Reemplazo de celda'],
      recientes: demo.recientes,
    };
  },
  async equipos(): Promise<EquipoAsistente[]> {
    await esperar(200);
    return [
      { idOs: 845, numeroOs: 'OS-000845', idOsEquipo: 24, nombre: 'Balanza de plataforma', numero: 1, marca: 'Mettler Toledo', modelo: 'PBA430', codigoCliente: 'BAL-012', estado: 'en_ejecucion', enTrabajo: true, fuentesDisponibles: 2 },
      { idOs: 845, numeroOs: 'OS-000845', idOsEquipo: 25, nombre: 'Indicador de peso', numero: 2, marca: 'Mettler Toledo', modelo: 'IND780', codigoCliente: 'IND-004', estado: 'por_iniciar', enTrabajo: false, fuentesDisponibles: 1 },
    ];
  },
  async consultar(c: NuevaConsulta): Promise<RespuestaAsistente> {
    await esperar(900);
    const r = respuestaDemo(c);
    demo.consultas.set(r.idConsulta, r);
    demo.recientes = [{ idConsulta: r.idConsulta, pregunta: c.pregunta, fuente: r.encontrada ? 'Manual PBA430 §6.4' : null, creadoEn: r.creadoEn }, ...demo.recientes].slice(0, 5);
    return r;
  },
  async consulta(idConsulta: number): Promise<RespuestaAsistente> {
    await esperar(150);
    const r = demo.consultas.get(idConsulta) ?? respuestaDemo({ idOs: 845, idOsEquipo: 24, pregunta: demo.recientes.find((x) => x.idConsulta === idConsulta)?.pregunta ?? '¿Cómo ajusto la excentricidad de esta balanza?', origen: 'texto' });
    return { ...r, idConsulta };
  },
  async valorar(idConsulta: number, util: boolean): Promise<void> {
    await esperar(120);
    const r = demo.consultas.get(idConsulta);
    if (r) demo.consultas.set(idConsulta, { ...r, util });
  },
  async fuente(idConsulta: number, n: number): Promise<FuenteConsultada> {
    await esperar(200);
    return {
      idConsulta, n, idDocumento: 'M-33', documento: 'Manual PBA430 v2.0', tipo: 'manual', oficial: true, entidad: 'Mettler Toledo', version: 'v2.0', actualizado: '2026-03-01',
      pagina: 42, seccion: '6.4 Ajuste de excentricidad', advertencia: 'Desenergice el terminal y retire toda carga antes de abrir la caja de conexiones.',
      fragmento: demoFuente.fragmento!, contextoPosterior: 'Ajuste el potenciómetro de la celda correspondiente hasta que la diferencia entre posiciones sea menor al EMP de la clase…', verificada: true,
    };
  },
  async transcribir(): Promise<string> {
    await esperar(700);
    return 'qué significa el error E veintitrés en el indicador';
  },
  async listarGuardados(busqueda?: string): Promise<GuardadoResumen[]> {
    await esperar(150);
    const q = (busqueda ?? '').trim().toLowerCase();
    return [...demo.guardados.values()].filter((g) => !q || `${g.titulo} ${g.subtitulo}`.toLowerCase().includes(q)).map((g) => ({ idGuardado: g.idGuardado, tipo: g.tipo, titulo: g.titulo, subtitulo: g.subtitulo, creadoEn: g.creadoEn, tamanoBytes: g.tamanoBytes }));
  },
  async guardar(g: { idConsulta: number; tipo: TipoGuardado; n?: number }): Promise<GuardadoCompleto> {
    await esperar(200);
    const existente = [...demo.guardados.values()].find((x) => x.tipo === g.tipo && (x.respuesta?.idConsulta ?? x.fuente?.idConsulta) === g.idConsulta && (g.tipo === 'respuesta' || x.fuente?.n === g.n));
    if (existente) return existente;
    const respuesta = demo.consultas.get(g.idConsulta) ?? null;
    const fuente = g.tipo === 'fragmento' ? await mockAsistente.fuente(g.idConsulta, g.n ?? 1) : null;
    const id = demo.siguiente++;
    const item: GuardadoCompleto = {
      idGuardado: id, tipo: g.tipo,
      titulo: g.tipo === 'respuesta' ? (respuesta?.pregunta ?? 'Consulta') : 'Sección 6.4 completa',
      subtitulo: g.tipo === 'respuesta' ? 'Manual PBA430 v2.0 · §6.4 · respuesta' : 'Manual PBA430 v2.0 · §6.4 · fragmento',
      creadoEn: ahoraLima(), tamanoBytes: 1840, respuesta: g.tipo === 'respuesta' ? respuesta : null, fuente,
    };
    demo.guardados.set(id, item);
    return item;
  },
  async obtenerGuardado(idGuardado: number): Promise<GuardadoCompleto> {
    await esperar(120);
    const g = demo.guardados.get(idGuardado);
    if (!g) throw new Error('Guardado no encontrado.');
    return g;
  },
  async eliminarGuardado(idGuardado: number): Promise<void> {
    await esperar(120);
    demo.guardados.delete(idGuardado);
  },
};
