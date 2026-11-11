import { entorno } from '@/config/entorno';
import { agregarArchivo } from './archivosLocales';
import { ErrorApi, solicitar } from './cliente';
import { conRespaldo, type ConRespaldo } from './respaldo';

/**
 * HU-17 — Firma de informes y constancia de servicio (Técnico de Campo).
 *   GET  api/movil/servicios/{idOs}/firma-informes                       → SP_ObtenerFirmasMovil (lista de informes, responsables y plazo de aceptación tácita)
 *   GET  api/movil/servicios/{idOs}/firma-informes/resumen               → SP_ResumenFirmasOsMovil (acceso en el menú de la orden)
 *   POST api/movil/servicios/{idOs}/firma-informes/{clave}/firma         → SP_GuardarFirmaResponsableMovil (por dispositivo o "cliente ausente"; devuelve la lista)
 *   POST api/movil/servicios/{idOs}/firma-informes/{clave}/fisico        → multipart: foto del formato físico y nombre de quien firmó
 *   GET  api/movil/servicios/{idOs}/constancia                           → SP_ObtenerConstanciaMovil
 *   POST api/movil/servicios/{idOs}/constancia/firma | fisico | generar  → SP_GuardarConstanciaMovil (devuelven la constancia; "generar" cierra el servicio si todo está firmado)
 * El back decide todo (informes completos, responsables, plazo de 48 h, firmas iguales entre responsables, cierre y envío): la app solo dibuja y muestra.
 * La firma por dispositivo viaja como TRAZOS normalizados (cada punto entre 0 y 1 del lienzo): no hay imagen. Firmar y generar exigen conexión.
 * Pendiente (necesita una página pública de firma que aún no existe): "Enviar link" y "Generar QR". Pendiente: guardar la constancia sin conexión y enviarla al volver la señal.
 */

/** Cada trazo es una lista de puntos [x, y] entre 0 y 1; hay un trazo por cada vez que el dedo toca la pantalla. */
export type Trazos = [number, number][][];
/** Como viaja y se guarda: {"trazos": [...]}. */
export interface FirmaJson {
  trazos: Trazos;
}

export type FirmaInforme = 'incompleto' | 'pendiente' | 'ausente' | 'firmado';
export type ModoFirma = 'dispositivo' | 'fisico' | 'ausente';

export interface CabeceraFirmas {
  idOs: number;
  numeroOs: string;
  cliente: string | null;
  plazoHoras: number;
  /** Lo que queda de la aceptación tácita (desde el primer informe generado); null = aún no hay informes. */
  segundosRestantes: number | null;
  tacitaActiva: boolean;
  informes: number;
  completos: number;
  firmados: number;
  responsables: number;
  resueltos: number;
  /** Todo completo y todos los responsables resueltos. */
  listo: boolean;
  constanciaFirmada: boolean;
  constanciaGenerada: boolean;
  cerrado: boolean;
}

export interface InformeFirma {
  idOsEquipo: number;
  idInforme: number | null;
  numeroInforme: string | null;
  equipo: string | null;
  codigoEquipo: string | null;
  completo: boolean;
  /** Por qué está INCOMPLETO. */
  motivo: string | null;
  responsable: string | null;
  cargo: string | null;
  telefono: string | null;
  clave: string | null;
  firma: FirmaInforme | string;
  /** Hora de Lima, ISO. */
  firmadoEn: string | null;
}

export interface ResponsableFirma {
  clave: string;
  nombre: string;
  cargo: string | null;
  telefono: string | null;
  nInformes: number;
  /** "0921-2026 · 0923-2026". */
  informes: string | null;
  firma: FirmaInforme | string;
  modo: ModoFirma | string | null;
  resuelto: boolean;
  firmadoEn: string | null;
  firmante: string | null;
  motivo: string | null;
  trazos: FirmaJson | null;
}

export interface Firmas {
  cabecera: CabeceraFirmas;
  informes: InformeFirma[];
  responsables: ResponsableFirma[];
}

export interface ResumenFirmas {
  informes: number;
  completos: number;
  firmados: number;
  resueltos: number;
  responsables: number;
  cerrado: boolean;
}

export type EnvioEstado = 'en_espera' | 'enviado' | 'error' | 'desactivado' | 'sin_correo';

export interface CabeceraConstancia {
  idOs: number;
  numeroOs: string;
  cliente: string | null;
  direccion: string | null;
  contactoNombre: string | null;
  contactoCargo: string | null;
  contactoTelefono: string | null;
  contactoCorreo: string | null;
  numeroRq: string | null;
  /** AAAA-MM-DD (Lima). */
  fecha: string | null;
  informes: number;
  completos: number;
  firmados: number;
  responsables: number;
  resueltos: number;
  modo: string | null;
  firmante: string | null;
  firmadoEn: string | null;
  trazos: FirmaJson | null;
  tieneFoto: boolean;
  firmada: boolean;
  generadaEn: string | null;
  cerradaEn: string | null;
  envioEstado: EnvioEstado | string;
  envioDestino: string | null;
  envioEn: string | null;
  envioDetalle: string | null;
  puedeGenerar: boolean;
  envioActivo: boolean;
}

export interface EquipoConstancia {
  equipo: string | null;
  marca: string | null;
  modelo: string | null;
  serie: string | null;
  capacidad: string | null;
  d: string | null;
  e: string | null;
  ubicacion: string | null;
  codigo: string | null;
  procedencia: string | null;
  certificado: string | null;
}

export interface FaltaFirma {
  nombre: string;
  cargo: string | null;
  informes: string | null;
}

export interface Constancia {
  cabecera: CabeceraConstancia;
  equipos: EquipoConstancia[];
  faltan: FaltaFirma[];
}

export interface NuevaFirmaResponsable {
  modo: 'dispositivo' | 'ausente';
  trazos?: Trazos;
  motivo?: string;
}

const ruta = (idOs: number) => `/api/movil/servicios/${encodeURIComponent(String(idOs))}`;

export async function obtenerFirmas(token: string, idOs: number): Promise<Firmas> {
  if (entorno.usarMock) return mockFirmas.firmas();
  return (await solicitar<Firmas>(`${ruta(idOs)}/firma-informes`, { token })).datos!;
}

/** Sin conexión muestra lo último guardado; firmar exige conexión. */
export async function obtenerFirmasConRespaldo(token: string, idUsuario: number, idOs: number): Promise<ConRespaldo<Firmas>> {
  if (entorno.usarMock) return { datos: await mockFirmas.firmas(), sinConexion: false, guardadoEn: new Date() };
  return conRespaldo(idUsuario, `firmas.${idOs}`, () => obtenerFirmas(token, idOs));
}

/** Resumen ligero; null si no se puede leer (el menú de la orden simplemente no muestra el acceso). */
export async function obtenerResumenFirmas(token: string, idOs: number): Promise<ResumenFirmas | null> {
  if (entorno.usarMock) return mockFirmas.resumen();
  try {
    return (await solicitar<ResumenFirmas>(`${ruta(idOs)}/firma-informes/resumen`, { token })).datos ?? null;
  } catch (e) {
    if (e instanceof ErrorApi && e.estadoHttp === 401) throw e;
    return null;
  }
}

export async function firmarResponsable(token: string, idOs: number, clave: string, f: NuevaFirmaResponsable): Promise<{ mensaje: string; firmas: Firmas }> {
  if (entorno.usarMock) return mockFirmas.firmar(clave, f);
  const r = await solicitar<Firmas>(`${ruta(idOs)}/firma-informes/${encodeURIComponent(clave)}/firma`, {
    token,
    metodo: 'POST',
    cuerpo: { modo: f.modo, trazos: f.trazos ? ({ trazos: f.trazos } satisfies FirmaJson) : undefined, motivo: f.motivo },
    timeoutMs: 60_000,
  });
  return { mensaje: r.mensaje, firmas: r.datos! };
}

export async function firmarResponsableFisico(token: string, idOs: number, clave: string, d: { fotoUri: string; nombre: string }): Promise<{ mensaje: string; firmas: Firmas }> {
  if (entorno.usarMock) return mockFirmas.firmar(clave, { modo: 'dispositivo', trazos: [[[0.1, 0.5], [0.9, 0.5]]] });
  const form = new FormData();
  form.append('nombre', d.nombre.trim());
  await agregarArchivo(form, 'foto', d.fotoUri, 'formato-fisico.jpg', 'image/jpeg');
  const r = await solicitar<Firmas>(`${ruta(idOs)}/firma-informes/${encodeURIComponent(clave)}/fisico`, { token, metodo: 'POST', cuerpo: form, timeoutMs: 90_000 });
  return { mensaje: r.mensaje, firmas: r.datos! };
}

export async function obtenerConstancia(token: string, idOs: number): Promise<Constancia> {
  if (entorno.usarMock) return mockFirmas.constancia();
  return (await solicitar<Constancia>(`${ruta(idOs)}/constancia`, { token })).datos!;
}

export async function obtenerConstanciaConRespaldo(token: string, idUsuario: number, idOs: number): Promise<ConRespaldo<Constancia>> {
  if (entorno.usarMock) return { datos: await mockFirmas.constancia(), sinConexion: false, guardadoEn: new Date() };
  return conRespaldo(idUsuario, `constancia.${idOs}`, () => obtenerConstancia(token, idOs));
}

export async function firmarConstancia(token: string, idOs: number, d: { trazos: Trazos; nombre: string }): Promise<{ mensaje: string; constancia: Constancia }> {
  if (entorno.usarMock) return mockFirmas.firmarCliente(d.nombre);
  const r = await solicitar<Constancia>(`${ruta(idOs)}/constancia/firma`, {
    token,
    metodo: 'POST',
    cuerpo: { trazos: { trazos: d.trazos } satisfies FirmaJson, nombre: d.nombre.trim() },
    timeoutMs: 60_000,
  });
  return { mensaje: r.mensaje, constancia: r.datos! };
}

export async function constanciaFormatoFisico(token: string, idOs: number, d: { fotoUri: string; nombre: string }): Promise<{ mensaje: string; constancia: Constancia }> {
  if (entorno.usarMock) return mockFirmas.firmarCliente(d.nombre);
  const form = new FormData();
  form.append('nombre', d.nombre.trim());
  await agregarArchivo(form, 'foto', d.fotoUri, 'formato-fisico.jpg', 'image/jpeg');
  const r = await solicitar<Constancia>(`${ruta(idOs)}/constancia/fisico`, { token, metodo: 'POST', cuerpo: form, timeoutMs: 90_000 });
  return { mensaje: r.mensaje, constancia: r.datos! };
}

/** "Generar constancia": con todo firmado el back cierra el servicio (PDF y, si está activado, correo al cliente). Puede tardar. */
export async function generarConstancia(token: string, idOs: number): Promise<{ mensaje: string; constancia: Constancia }> {
  if (entorno.usarMock) return mockFirmas.generar();
  const r = await solicitar<Constancia>(`${ruta(idOs)}/constancia/generar`, { token, metodo: 'POST', timeoutMs: 90_000 });
  return { mensaje: r.mensaje, constancia: r.datos! };
}

// ── Modo demo (EXPO_PUBLIC_USE_MOCK=true): los datos de las maquetas, en memoria mientras la app está abierta ──
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));
const CLAVE_ROSA = 'a'.repeat(32);
const CLAVE_LUIS = 'b'.repeat(32);
const trazoDemo = (k: number): Trazos => [Array.from({ length: 24 }, (_, i) => [0.08 + (0.84 * i) / 23, 0.5 + 0.32 * Math.sin((i + k) * 0.9)] as [number, number])];

const demo = {
  inicio: Date.now(),
  firmas: { [CLAVE_ROSA]: null as null | { trazos: Trazos; en: string; modo: ModoFirma }, [CLAVE_LUIS]: null as null | { trazos: Trazos; en: string; modo: ModoFirma } },
  cliente: null as null | { trazos: Trazos; nombre: string; en: string },
  generada: false,
  cerrada: false,
};
const ahoraLima = () => new Date(Date.now() - 5 * 3_600_000).toISOString().slice(0, 19);

function firmasDemo(): Firmas {
  const f = demo.firmas;
  const rosa = f[CLAVE_ROSA];
  const luis = f[CLAVE_LUIS];
  const fila = (clave: string, n: string, id: number, eq: string, cod: string, nombre: string, cargo: string, tel: string): InformeFirma => {
    const x = clave === CLAVE_ROSA ? rosa : luis;
    return { idOsEquipo: id, idInforme: id, numeroInforme: `${n}-2026`, equipo: eq, codigoEquipo: cod, completo: true, motivo: null, responsable: nombre, cargo, telefono: tel, clave, firma: x ? 'firmado' : 'pendiente', firmadoEn: x?.en ?? null };
  };
  const informes: InformeFirma[] = [
    fila(CLAVE_ROSA, '0921', 1, 'Balanza de plataforma', 'BAL-012', 'Rosa Quispe', 'Jefa de almacén', '987 111 222'),
    fila(CLAVE_ROSA, '0923', 2, 'Balanza de piso', 'BAL-015', 'Rosa Quispe', 'Jefa de almacén', '987 111 222'),
    fila(CLAVE_LUIS, '0924', 3, 'Balanza de mostrador', 'BAL-020', 'Luis Torres', 'Supervisor de calidad', '945 186 094'),
    { idOsEquipo: 4, idInforme: null, numeroInforme: '0925-2026', equipo: 'Báscula colgante', codigoEquipo: 'BAL-031', completo: false, motivo: 'Falta finalizar el trabajo en el equipo (HU-16)', responsable: null, cargo: null, telefono: null, clave: null, firma: 'incompleto', firmadoEn: null },
  ];
  const responsables: ResponsableFirma[] = [
    { clave: CLAVE_ROSA, nombre: 'Rosa Quispe', cargo: 'Jefa de almacén', telefono: '987 111 222', nInformes: 2, informes: '0921-2026 · 0923-2026', firma: rosa ? 'firmado' : 'pendiente', modo: rosa?.modo ?? null, resuelto: !!rosa, firmadoEn: rosa?.en ?? null, firmante: null, motivo: null, trazos: rosa ? { trazos: rosa.trazos } : null },
    { clave: CLAVE_LUIS, nombre: 'Luis Torres', cargo: 'Supervisor de calidad', telefono: '945 186 094', nInformes: 1, informes: '0924-2026', firma: luis ? 'firmado' : 'pendiente', modo: luis?.modo ?? null, resuelto: !!luis, firmadoEn: luis?.en ?? null, firmante: null, motivo: null, trazos: luis ? { trazos: luis.trazos } : null },
  ];
  const firmados = informes.filter((i) => i.firma === 'firmado').length;
  const resueltos = responsables.filter((r) => r.resuelto).length;
  const restante = Math.max(0, 48 * 3600 - Math.round((Date.now() - demo.inicio) / 1000) - 758);
  return {
    cabecera: {
      idOs: 845, numeroOs: 'OS-000845', cliente: 'Molinos del Sur S.A.C.', plazoHoras: 48, segundosRestantes: restante, tacitaActiva: resueltos < 2 && restante > 0,
      informes: 4, completos: 3, firmados, responsables: 2, resueltos, listo: false, constanciaFirmada: !!demo.cliente, constanciaGenerada: demo.generada, cerrado: demo.cerrada,
    },
    informes,
    responsables,
  };
}

function constanciaDemo(): Constancia {
  const fr = firmasDemo();
  const c = demo.cliente;
  const faltan = fr.responsables.filter((r) => !r.resuelto).map((r) => ({ nombre: r.nombre, cargo: r.cargo, informes: r.informes }));
  return {
    cabecera: {
      idOs: 845, numeroOs: 'OS-000845', cliente: 'Molinos del Sur S.A.C.', direccion: 'Av. Industrial 1250, Ate, Lima', contactoNombre: 'Rosa Quispe', contactoCargo: 'Jefa de almacén', contactoTelefono: '987 111 222',
      contactoCorreo: 'rquispe@molinosdelsur.pe', numeroRq: '0312-2026', fecha: ahoraLima().slice(0, 10), informes: 3, completos: 3, firmados: fr.cabecera.firmados, responsables: 2, resueltos: fr.cabecera.resueltos,
      modo: c ? 'dispositivo' : null, firmante: c?.nombre ?? null, firmadoEn: c?.en ?? null, trazos: c ? { trazos: c.trazos } : null, tieneFoto: false, firmada: !!c, generadaEn: demo.generada ? ahoraLima() : null,
      cerradaEn: demo.cerrada ? ahoraLima() : null, envioEstado: demo.cerrada ? 'enviado' : 'en_espera', envioDestino: demo.cerrada ? 'rquispe@molinosdelsur.pe' : null, envioEn: demo.cerrada ? ahoraLima() : null,
      envioDetalle: null, puedeGenerar: !!c && !demo.cerrada, envioActivo: true,
    },
    equipos: [
      { equipo: 'Mettler Toledo · PBA430', marca: 'Mettler Toledo', modelo: 'PBA430', serie: '3141592', capacidad: '3,000 kg', d: '1 kg', e: '1 kg', ubicacion: 'Almacén de despacho', codigo: 'BAL-012', procedencia: 'N.I', certificado: 'CC-1712-2026' },
      { equipo: 'Ohaus · Defender 5000', marca: 'Ohaus', modelo: 'Defender 5000', serie: 'B829113', capacidad: '600 kg', d: '0.1 kg', e: '0.1 kg', ubicacion: 'Recepción', codigo: 'BAL-015', procedencia: 'China', certificado: 'CC-1714-2026' },
      { equipo: 'Precia Molen · X201', marca: 'Precia Molen', modelo: 'X201', serie: 'PM-77120', capacidad: '30 kg', d: '5 g', e: '5 g', ubicacion: 'Laboratorio', codigo: 'BAL-020', procedencia: 'Francia', certificado: 'CC-1715-2026' },
    ],
    faltan,
  };
}

const mockFirmas = {
  async firmas() {
    await esperar(200);
    return firmasDemo();
  },
  async resumen(): Promise<ResumenFirmas> {
    await esperar(100);
    const c = firmasDemo().cabecera;
    return { informes: c.informes, completos: c.completos, firmados: c.firmados, resueltos: c.resueltos, responsables: c.responsables, cerrado: c.cerrado };
  },
  async firmar(clave: string, f: NuevaFirmaResponsable) {
    await esperar(300);
    if (f.modo === 'dispositivo' && f.trazos) {
      const otra = Object.entries(demo.firmas).find(([k, v]) => k !== clave && v && JSON.stringify(v.trazos) === JSON.stringify(f.trazos));
      if (otra) throw new ErrorApi('La firma no corresponde a este responsable: coincide en un 96 % con la firma de Rosa Quispe. Cada responsable debe firmar con su propia firma.', 400, 1);
      (demo.firmas as Record<string, unknown>)[clave] = { trazos: f.trazos, en: ahoraLima(), modo: 'dispositivo' };
    }
    return { mensaje: 'Firma registrada.', firmas: firmasDemo() };
  },
  async constancia() {
    await esperar(200);
    return constanciaDemo();
  },
  async firmarCliente(nombre: string) {
    await esperar(300);
    demo.cliente = { trazos: trazoDemo(2), nombre, en: ahoraLima() };
    return { mensaje: 'Firma del cliente registrada.', constancia: constanciaDemo() };
  },
  async generar() {
    await esperar(500);
    demo.generada = true;
    demo.cerrada = Object.values(demo.firmas).every(Boolean);
    return { mensaje: demo.cerrada ? 'Servicio cerrado.' : 'Constancia generada.', constancia: constanciaDemo() };
  },
};
