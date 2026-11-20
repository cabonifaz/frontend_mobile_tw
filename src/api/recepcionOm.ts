import { entorno } from '@/config/entorno';
import { agregarArchivo, sistemaArchivos } from './archivosLocales';
import { ErrorApi, solicitar } from './cliente';
import type { Trazos } from './firmas';

/**
 * HU-23 — Recepción de instrumentos (OM) en el taller (Técnico de Metrología).
 *   GET    api/movil/recepcion-om?busqueda=                                          → SP lista: OM por recibir y recibidas hoy
 *   GET    api/movil/recepcion-om/{idOs}                                             → resumen, instrumentos y recepciones de la OM
 *   POST   api/movil/recepcion-om/{idOs}/instrumentos/{idOsEquipo}/fotos (multipart) → sube una foto de recepción (solo cámara, sin IA)
 *   DELETE api/movil/recepcion-om/{idOs}/instrumentos/{idOsEquipo}/fotos/{idFoto}    → quita una foto aún no registrada
 *   GET    api/movil/recepcion-om/{idOs}/instrumentos/{idOsEquipo}/fotos             → fotos pendientes (para reanudar)
 *   GET    api/movil/recepcion-om/fotos/{idFoto}/archivo                             → la foto
 *   GET    api/movil/recepcion-om/{idOs}/buscar-qr?texto=                            → instrumento de la OM al que corresponde un QR / serie / código
 *   POST   api/movil/recepcion-om/{idOs}                                             → registra la recepción (guía, medio, quién entrega, instrumentos, firma)
 *   GET    api/movil/recepcion-om/recepciones/{idRecepcion}/constancia               → constancia de recepción en PDF
 * El servidor decide qué OM ve cada técnico, valida todo y calcula el estado de la recepción (conforme · observado · parcial); la app solo captura. Todo exige conexión.
 */
export type EstadoOm = 'por_recibir' | 'parcial' | 'conforme' | 'observado';
export type MedioEntrega = 'cliente_taller' | 'courier' | 'traslado_tw';

export interface ItemOm {
  idOs: number;
  numero: string;
  cliente: string | null;
  numeroRq: string | null;
  servicio: string | null;
  totalInstrumentos: number;
  recibidos: number;
  estado: EstadoOm | string;
  /** "HH:mm" (Lima) de la última recepción. */
  hora: string | null;
  guia: string | null;
  /** Nombres de los instrumentos que faltan (máx. 5). */
  pendientes: string[];
}

export interface ListaRecepcion {
  porRecibir: ItemOm[];
  recibidosHoy: ItemOm[];
}

export interface InstrumentoRecepcion {
  idOsEquipo: number;
  numero: number;
  nombre: string;
  marca: string | null;
  modelo: string | null;
  serie: string | null;
  capacidad: string | null;
  codigoCliente: string | null;
  codigoTw: string | null;
  recibido: boolean;
  estadoFisico: string | null;
  observaciones: string | null;
  fotos: number;
  /** "yyyy-MM-dd HH:mm" (Lima). */
  recibidoEn: string | null;
}

export interface RecepcionRegistrada {
  idRecepcion: number;
  guia: string;
  medio: string;
  entrego: string;
  entregoCargo: string | null;
  recibio: string;
  /** "yyyy-MM-dd HH:mm" (Lima). */
  fecha: string;
  estado: string;
  motivoParcial: string | null;
  instrumentos: number;
  tieneConstancia: boolean;
}

export interface CabeceraRecepcion {
  idOs: number;
  numero: string;
  cliente: string | null;
  numeroRq: string | null;
  servicio: string | null;
  totalInstrumentos: number;
  recibidos: number;
  /** Quedan instrumentos por recibir. */
  puedeRecibir: boolean;
  estado: string;
}

export interface DetalleRecepcion {
  cabecera: CabeceraRecepcion;
  instrumentos: InstrumentoRecepcion[];
  recepciones: RecepcionRegistrada[];
}

export interface FotoPendiente {
  idFoto: number;
  orden: number;
}

export interface InstrumentoNuevo {
  idOsEquipo: number;
  estadoFisico: 'conforme' | 'observado';
  observaciones: string;
  accesorios: string[];
  /** Ids de fotos ya subidas (mínimo 3, máximo 8). */
  fotos: number[];
}

export interface NuevaRecepcion {
  numeroGuia: string;
  medioEntrega: MedioEntrega;
  entregoNombre: string;
  entregoCargo?: string;
  motivoParcial?: string;
  instrumentos: InstrumentoNuevo[];
  firma: Trazos;
}

export interface ResultadoRecepcion {
  idRecepcion: number;
  estado: string;
  parcial: boolean;
  instrumentosRecibidos: number;
  instrumentosPendientes: number;
  correoEnviado: boolean;
  mensaje: string;
}

const base = '/api/movil/recepcion-om';
const e = (n: number) => encodeURIComponent(String(n));

export async function obtenerListaRecepcion(token: string, busqueda: string): Promise<ListaRecepcion> {
  if (entorno.usarMock) return mockRecepcion.lista(busqueda);
  const q = busqueda.trim().slice(0, 80);
  const r = await solicitar<ListaRecepcion>(`${base}${q ? `?busqueda=${encodeURIComponent(q)}` : ''}`, { token });
  return { porRecibir: r.datos?.porRecibir ?? [], recibidosHoy: r.datos?.recibidosHoy ?? [] };
}

export async function obtenerDetalleRecepcion(token: string, idOs: number): Promise<DetalleRecepcion> {
  if (entorno.usarMock) return mockRecepcion.detalle(idOs);
  return (await solicitar<DetalleRecepcion>(`${base}/${e(idOs)}`, { token })).datos!;
}

/** Sube una foto de recepción (JPEG de la cámara de la app). Devuelve su id: se envía en `fotos` del instrumento al registrar. */
export async function subirFotoRecepcion(token: string, idOs: number, idOsEquipo: number, uri: string): Promise<FotoPendiente> {
  if (entorno.usarMock) return mockRecepcion.subirFoto(idOsEquipo);
  const form = new FormData();
  form.append('capturadoEn', new Date().toISOString());
  await agregarArchivo(form, 'archivo', uri, 'recepcion.jpg', 'image/jpeg');
  const r = await solicitar<FotoPendiente>(`${base}/${e(idOs)}/instrumentos/${e(idOsEquipo)}/fotos`, { token, metodo: 'POST', cuerpo: form, timeoutMs: 60_000 });
  return r.datos!;
}

export async function quitarFotoRecepcion(token: string, idOs: number, idOsEquipo: number, idFoto: number): Promise<void> {
  if (entorno.usarMock) return;
  await solicitar<unknown>(`${base}/${e(idOs)}/instrumentos/${e(idOsEquipo)}/fotos/${e(idFoto)}`, { token, metodo: 'DELETE' });
}

export async function obtenerFotosPendientes(token: string, idOs: number, idOsEquipo: number): Promise<FotoPendiente[]> {
  if (entorno.usarMock) return [];
  const r = await solicitar<FotoPendiente[]>(`${base}/${e(idOs)}/instrumentos/${e(idOsEquipo)}/fotos`, { token });
  return r.datos ?? [];
}

/** Dirección de una foto (hay que pedirla con el token de la sesión en la cabecera Authorization). */
export const urlFotoRecepcion = (idFoto: number): string => `${entorno.apiUrl}${base}/fotos/${e(idFoto)}/archivo`;

/** A qué instrumento de la OM corresponde el texto leído de una etiqueta QR / serie / código; falla con el mensaje del servidor si no es de esta OM. */
export async function buscarInstrumentoPorQr(token: string, idOs: number, texto: string): Promise<{ idOsEquipo: number; nombre: string }> {
  if (entorno.usarMock) return mockRecepcion.buscarQr(idOs, texto);
  const r = await solicitar<{ idOsEquipo: number; nombre: string }>(`${base}/${e(idOs)}/buscar-qr?texto=${encodeURIComponent(texto.slice(0, 300))}`, { token });
  return r.datos!;
}

export async function registrarRecepcion(token: string, idOs: number, d: NuevaRecepcion): Promise<ResultadoRecepcion> {
  if (entorno.usarMock) return mockRecepcion.registrar(idOs, d);
  const r = await solicitar<ResultadoRecepcion>(`${base}/${e(idOs)}`, {
    token,
    metodo: 'POST',
    cuerpo: {
      numeroGuia: d.numeroGuia.trim(),
      medioEntrega: d.medioEntrega,
      entregoNombre: d.entregoNombre.trim(),
      entregoCargo: d.entregoCargo?.trim() || undefined,
      motivoParcial: d.motivoParcial?.trim() || undefined,
      instrumentos: d.instrumentos.map((i) => ({ ...i, observaciones: i.observaciones.trim() })),
      firma: { trazos: d.firma },
    },
  });
  return { ...r.datos!, mensaje: r.datos?.mensaje ?? r.mensaje };
}

/** Descarga la constancia de recepción (PDF) a la carpeta `constancias-recepcion` del teléfono y devuelve su ruta (se abre con `abrirPdf`). */
export async function descargarConstanciaRecepcion(token: string, idRecepcion: number): Promise<string> {
  if (entorno.usarMock) throw new Error('La constancia se genera en el servidor: no está disponible en el modo demo.');
  const f = sistemaArchivos();
  if (!f) throw new Error('Esta versión de la app no puede guardar archivos. Instala la última.');
  const dir = new f.Directory(f.Paths.document, 'constancias-recepcion');
  dir.create({ idempotent: true, intermediates: true });
  const destino = new f.File(dir, `constancia-recepcion-${idRecepcion}.pdf`);
  try {
    await f.File.downloadFileAsync(`${entorno.apiUrl}${base}/recepciones/${e(idRecepcion)}/constancia`, destino, { headers: { Authorization: `Bearer ${token}` }, idempotent: true });
  } catch {
    throw new Error('No se pudo descargar la constancia de recepción. Verifica tu conexión e inténtalo de nuevo.');
  }
  if (!destino.exists || destino.size === 0) {
    try {
      destino.delete();
    } catch {
      // nada que borrar
    }
    throw new Error('No se pudo descargar la constancia de recepción. Inténtalo de nuevo.');
  }
  return destino.uri;
}

// ── Modo demo (EXPO_PUBLIC_USE_MOCK=true): todo en memoria ──────────────────────────────────────────────────
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface OmDemo {
  cabecera: Omit<CabeceraRecepcion, 'recibidos' | 'puedeRecibir' | 'estado'>;
  instrumentos: InstrumentoRecepcion[];
  recepciones: RecepcionRegistrada[];
}

const ins = (idOsEquipo: number, numero: number, nombre: string, marca: string, modelo: string, serie: string, capacidad: string | null): InstrumentoRecepcion => ({
  idOsEquipo, numero, nombre, marca, modelo, serie, capacidad, codigoCliente: null, codigoTw: `EQ-TW-2026-${String(idOsEquipo).padStart(4, '0')}`,
  recibido: false, estadoFisico: null, observaciones: null, fotos: 0, recibidoEn: null,
});

const oms: OmDemo[] = [
  {
    cabecera: { idOs: 612, numero: 'OM-000612', cliente: 'Molinos del Sur S.A.C.', numeroRq: 'RQ-000312', servicio: 'Calibración en laboratorio', totalInstrumentos: 3 },
    instrumentos: [
      ins(9101, 1, 'Balanza analítica', 'Ohaus', 'PX224', 'B-77120', '220 g'),
      ins(9102, 2, 'Juego de pesas M1', 'Zwiebel', '1 g a 500 g', 'ZW-1180', '500 g'),
      ins(9103, 3, 'Termohigrómetro', 'Testo', '608-H1', '40221873', null),
    ],
    recepciones: [],
  },
  {
    cabecera: { idOs: 618, numero: 'OM-000618', cliente: 'Agroindustrias Norte', numeroRq: 'RQ-000320', servicio: 'Calibración en laboratorio', totalInstrumentos: 1 },
    instrumentos: [ins(9201, 1, 'Pesas patrón', 'Zwiebel', 'M1 6 pzas', 'T002-001190', null)],
    recepciones: [],
  },
];
let siguienteFoto = 1;
let siguienteRecepcion = 1;

const estadoDe = (o: OmDemo): EstadoOm => {
  const recibidos = o.instrumentos.filter((i) => i.recibido).length;
  if (recibidos === 0) return 'por_recibir';
  if (recibidos < o.instrumentos.length) return 'parcial';
  return o.instrumentos.some((i) => i.estadoFisico === 'observado') ? 'observado' : 'conforme';
};

const item = (o: OmDemo): ItemOm => {
  const ultima = o.recepciones.at(-1);
  return {
    idOs: o.cabecera.idOs, numero: o.cabecera.numero, cliente: o.cabecera.cliente, numeroRq: o.cabecera.numeroRq, servicio: o.cabecera.servicio,
    totalInstrumentos: o.instrumentos.length, recibidos: o.instrumentos.filter((i) => i.recibido).length, estado: estadoDe(o),
    hora: ultima ? ultima.fecha.slice(11, 16) : null, guia: ultima?.guia ?? null, pendientes: o.instrumentos.filter((i) => !i.recibido).map((i) => i.nombre).slice(0, 5),
  };
};

const mockRecepcion = {
  async lista(busqueda: string): Promise<ListaRecepcion> {
    await esperar(250);
    const q = busqueda.trim().toLowerCase();
    const todas = oms.map(item).filter((x) => !q || `${x.numero} ${x.cliente ?? ''} ${x.guia ?? ''}`.toLowerCase().includes(q));
    return { porRecibir: todas.filter((x) => x.recibidos < x.totalInstrumentos), recibidosHoy: todas.filter((x) => x.hora !== null) };
  },
  async detalle(idOs: number): Promise<DetalleRecepcion> {
    await esperar(250);
    const o = oms.find((x) => x.cabecera.idOs === idOs);
    if (!o) throw new ErrorApi('Orden de metrología no encontrada.', 200, 1);
    const i = item(o);
    return { cabecera: { ...o.cabecera, recibidos: i.recibidos, puedeRecibir: i.recibidos < i.totalInstrumentos, estado: String(i.estado) }, instrumentos: o.instrumentos.map((x) => ({ ...x })), recepciones: [...o.recepciones] };
  },
  async subirFoto(idOsEquipo: number): Promise<FotoPendiente> {
    await esperar(300);
    return { idFoto: siguienteFoto++, orden: idOsEquipo };
  },
  async buscarQr(idOs: number, texto: string): Promise<{ idOsEquipo: number; nombre: string }> {
    await esperar(200);
    const o = oms.find((x) => x.cabecera.idOs === idOs);
    const t = texto.trim().toLowerCase();
    const x = o?.instrumentos.find((y) => [y.serie, y.codigoTw, y.codigoCliente].some((c) => c && c.toLowerCase() === t));
    if (!x) throw new ErrorApi('El código no corresponde a ningún instrumento de esta OM.', 200, 1);
    return { idOsEquipo: x.idOsEquipo, nombre: x.nombre };
  },
  async registrar(idOs: number, d: NuevaRecepcion): Promise<ResultadoRecepcion> {
    await esperar(700);
    const o = oms.find((x) => x.cabecera.idOs === idOs);
    if (!o) throw new ErrorApi('Orden de metrología no encontrada.', 200, 1);
    const ahora = new Date(Date.now() - 5 * 3_600_000).toISOString();
    for (const n of d.instrumentos) {
      const x = o.instrumentos.find((y) => y.idOsEquipo === n.idOsEquipo);
      if (x) Object.assign(x, { recibido: true, estadoFisico: n.estadoFisico, observaciones: n.observaciones, fotos: n.fotos.length, recibidoEn: `${ahora.slice(0, 10)} ${ahora.slice(11, 16)}` });
    }
    const pendientes = o.instrumentos.filter((x) => !x.recibido).length;
    const estado = pendientes > 0 ? 'parcial' : o.instrumentos.some((x) => x.estadoFisico === 'observado') ? 'observado' : 'conforme';
    const id = siguienteRecepcion++;
    o.recepciones.push({
      idRecepcion: id, guia: d.numeroGuia, medio: d.medioEntrega, entrego: d.entregoNombre, entregoCargo: d.entregoCargo ?? null, recibio: 'Demo', fecha: `${ahora.slice(0, 10)} ${ahora.slice(11, 16)}`,
      estado, motivoParcial: d.motivoParcial ?? null, instrumentos: d.instrumentos.length, tieneConstancia: false,
    });
    return {
      idRecepcion: id, estado, parcial: pendientes > 0, instrumentosRecibidos: d.instrumentos.length, instrumentosPendientes: pendientes, correoEnviado: false,
      mensaje: pendientes > 0 ? 'Recepción parcial registrada: la OM queda abierta hasta recibir lo que falta.' : 'Recepción registrada.',
    };
  },
};
