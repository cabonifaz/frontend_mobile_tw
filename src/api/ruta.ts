import { agregarArchivo } from './archivosLocales';
import { solicitar } from './cliente';
import { entorno } from '@/config/entorno';
import { mockRuta } from './mockRuta';
import { conRespaldo, type ConRespaldo } from './respaldo';

/**
 * HU-05, HU-06 y HU-07 — Ruta y planta.
 *   GET  api/movil/servicios/{idOs}/demoras                 → SP_ObtenerDemorasMovil
 *   POST api/movil/servicios/{idOs}/demoras  (multipart)    → SP_RegistrarDemoraMovil
 *   GET  api/movil/servicios/{idOs}/llegada                 → SP_ObtenerLlegadaMovil
 *   POST api/movil/servicios/{idOs}/llegada/validar         → solo compara (no registra)
 *   POST api/movil/servicios/{idOs}/llegada                 → SP_RegistrarLlegadaMovil
 *   GET  api/movil/servicios/{idOs}/objetivos?buscar=       → SP_ObtenerObjetivosMovil
 *   GET  api/movil/servicios/{idOs}/equipos/qr?codigo=      → SP_BuscarEquipoQrMovil (equipo de la OS por su código o QR)
 *   POST api/movil/servicios/{idOs}/equipos/{id}/iniciar | pausar | reanudar → SP_CambiarEstadoEquipoMovil (devuelve los objetivos actualizados)
 *   GET  api/movil/servicios/{idOs}/equipos/nuevo/opciones  → SP_ObtenerOpcionesEquipoNuevoMovil (marcas y tipos de equipo)
 *   POST api/movil/servicios/{idOs}/equipos/nuevo (multipart) → SP_RegistrarEquipoNuevoMovil (equipo NEW, con la foto de la placa)
 * El back valida todo (OS del técnico, estado, distancia, Hard Stop): la app solo muestra.
 */

// ── HU-05 · Demoras ──────────────────────────────────────────────────────────

/**
 * Tipos de demora:
 *  - llegada: durante el traslado (OS en ruta, aún sin llegada). Recalcula la ETA de llegada a planta.
 *  - ingreso: ya llegó a planta y espera ingresar (llegada registrada, trabajo sin iniciar). Recalcula el inicio del trabajo.
 */
export type TipoDemora = 'llegada' | 'ingreso';

/** Ámbito del motivo en el catálogo: solo traslado, solo ingreso a planta o ambos. */
export type AmbitoMotivo = 'traslado' | 'ingreso' | 'ambos';

export interface MotivoDemora {
  idMotivo: number;
  nombre: string;
  codigo: string | null;
  /** Opcional: un back anterior no lo envía y el motivo vale para ambos tipos. */
  ambito?: AmbitoMotivo | string | null;
}

export interface DemoraRegistrada {
  idDemora: number;
  /** Opcional: un back anterior solo registraba demoras de llegada. */
  tipo?: TipoDemora | string;
  motivo: string | null;
  duracionMinutos: number;
  descripcion: string | null;
  fechaRegistro: string | null;
  etaAnterior?: string | null;
  etaRecalculada: string | null;
  tieneFoto: boolean;
  latitud?: number | null;
  longitud?: number | null;
}

export interface ContextoDemoras {
  idOs: number;
  numeroOs: string;
  estadoOs: string;
  cliente: string | null;
  sede: string | null;
  salidaEn: string | null;
  enRutaMinutos: number | null;
  /** Llegada a planta (HU-06), si ya se registró. */
  llegadaEn?: string | null;
  enPlantaMinutos?: number | null;
  /** Hora programada del servicio. */
  etaOriginal: string | null;
  /** Minutos acumulados de las demoras de llegada. */
  minutosDemora: number;
  /** ETA original + demoras de llegada. */
  etaVigente: string | null;
  /** Inicio del trabajo previsto para las demoras de ingreso (nunca antes de "ahora"). */
  inicioPrevisto?: string | null;
  ahora: string;
  puedeRegistrar: boolean;
  /** Qué tipos se pueden registrar ahora (son excluyentes: antes de llegar solo "llegada"; ya en planta, solo "ingreso"). */
  puedeLlegada?: boolean;
  puedeIngreso?: boolean;
  /** Por qué no se puede registrar ninguna (cuando `puedeRegistrar` es falso). */
  motivoNoRegistra?: string | null;
  motivos: MotivoDemora[];
  demoras: DemoraRegistrada[];
}

export interface Ubicacion {
  latitud: number;
  longitud: number;
  precisionMetros: number;
}

export interface NuevaDemora {
  tipo: TipoDemora;
  idMotivo: number;
  duracionMinutos: number;
  descripcion: string;
  ubicacion: Ubicacion;
  /** URI de la foto tomada con la cámara de la app (nunca de la galería). */
  fotoUri: string | null;
  /**
   * Hora en que el técnico registró la demora, la marca el teléfono (ISO 8601, UTC). Sin conexión la demora se guarda y se envía después:
   * el back respeta esta hora (no futura, máx. 24 h) y la usa para no duplicar un envío repetido.
   */
  capturadoEn: string;
}

export interface ResultadoDemora {
  idDemora: number;
  tipo?: TipoDemora | string;
  /** Hora programada del servicio. */
  etaOriginal: string | null;
  /** Llegada: ETA antes de esta demora. Ingreso: inicio previsto antes de esta demora. */
  etaAnterior: string | null;
  /** Llegada: nueva ETA. Ingreso: nuevo inicio previsto del trabajo. */
  etaRecalculada: string | null;
  notificados: number;
  /** El envío ya estaba registrado (reintento): no se duplicó. */
  repetida?: boolean;
  /** Se guardó sin conexión y llegó después. */
  diferida?: boolean;
}

const ruta = (idOs: number) => `/api/movil/servicios/${encodeURIComponent(String(idOs))}`;

export async function obtenerDemoras(token: string, idOs: number): Promise<ContextoDemoras> {
  if (entorno.usarMock) return mockRuta.demoras(idOs);
  return (await solicitar<ContextoDemoras>(`${ruta(idOs)}/demoras`, { token })).datos!;
}

/**
 * Igual que `obtenerDemoras`, pero sin conexión devuelve lo último guardado en el teléfono (motivos, ETA, demoras) para poder
 * registrar la demora igual: se envía sola cuando vuelva la señal.
 */
export async function obtenerDemorasConRespaldo(token: string, idUsuario: number, idOs: number): Promise<ConRespaldo<ContextoDemoras>> {
  if (entorno.usarMock) return { datos: await mockRuta.demoras(idOs), sinConexion: false, guardadoEn: new Date() };
  return conRespaldo(idUsuario, `demoras.${idOs}`, () => obtenerDemoras(token, idOs));
}

export async function registrarDemora(token: string, idOs: number, d: NuevaDemora): Promise<{ mensaje: string; datos: ResultadoDemora | null }> {
  if (entorno.usarMock) return mockRuta.registrarDemora(idOs, d);
  const form = new FormData();
  form.append('tipo', d.tipo);
  form.append('idMotivo', String(d.idMotivo));
  form.append('duracionMinutos', String(d.duracionMinutos));
  if (d.descripcion.trim()) form.append('descripcion', d.descripcion.trim());
  form.append('latitud', d.ubicacion.latitud.toFixed(7));
  form.append('longitud', d.ubicacion.longitud.toFixed(7));
  form.append('precisionMetros', d.ubicacion.precisionMetros.toFixed(1));
  form.append('capturadoEn', d.capturadoEn);
  if (d.fotoUri) await agregarArchivo(form, 'foto', d.fotoUri, 'evidencia.jpg', 'image/jpeg');
  const r = await solicitar<ResultadoDemora>(`${ruta(idOs)}/demoras`, { token, metodo: 'POST', cuerpo: form });
  return { mensaje: r.mensaje, datos: r.datos ?? null };
}

// ── HU-06 · Llegada ──────────────────────────────────────────────────────────

export interface ReferenciaGps {
  latitud: number;
  longitud: number;
  radioMetros: number;
}

export interface LlegadaRegistrada {
  en: string | null;
  latitud: number | null;
  longitud: number | null;
  precisionMetros: number | null;
  distanciaMetros: number | null;
  resultado: string | null;
}

export interface Llegada {
  idOs: number;
  numeroOs: string;
  estadoOs: string;
  cliente: string | null;
  sede: string | null;
  direccion: string | null;
  horaProgramada: string | null;
  referencia: ReferenciaGps | null;
  salidaEn: string | null;
  llegada: LlegadaRegistrada | null;
  puedeRegistrar: boolean;
  precisionMaximaMetros: number;
  /** Por qué no se puede registrar (cuando `puedeRegistrar` es falso). */
  motivoNoRegistra?: string | null;
  /** HU-20: punto de salida del viaje (para dibujar la ruta prevista hasta la planta). Opcional: un back anterior no lo envía. */
  origen?: { latitud: number; longitud: number } | null;
}

/** La llegada ya quedó registrada (o ya lo estaba: reintento, `yaRegistrada`). `diferida` = se guardó sin conexión y llegó después. */
export interface ResultadoLlegada {
  idEvento: number;
  llegadaEn: string | null;
  distanciaMetros: number | null;
  precisionMetros: number | null;
  resultado: string;
  yaRegistrada: boolean;
  diferida: boolean;
}

export type ResultadoValidacion = 'valida' | 'fuera_rango' | 'sin_referencia' | 'precision_baja';

export interface ValidacionLlegada {
  resultado: ResultadoValidacion;
  registrable: boolean;
  distanciaMetros: number | null;
  radioMetros: number | null;
  precisionMetros: number;
  mensaje: string;
}

export async function obtenerLlegada(token: string, idOs: number): Promise<Llegada> {
  if (entorno.usarMock) return mockRuta.llegada(idOs);
  return (await solicitar<Llegada>(`${ruta(idOs)}/llegada`, { token })).datos!;
}

export async function validarLlegada(token: string, idOs: number, u: Ubicacion): Promise<ValidacionLlegada> {
  if (entorno.usarMock) return mockRuta.validar(u);
  return (await solicitar<ValidacionLlegada>(`${ruta(idOs)}/llegada/validar`, { token, metodo: 'POST', cuerpo: u })).datos!;
}

/**
 * Igual que `obtenerLlegada`, pero sin conexión devuelve lo último guardado en el teléfono (la planta esperada, el radio y la precisión máxima)
 * para poder validar y confirmar la llegada igual: se envía sola cuando vuelva la señal.
 */
export async function obtenerLlegadaConRespaldo(token: string, idUsuario: number, idOs: number): Promise<ConRespaldo<Llegada>> {
  if (entorno.usarMock) return { datos: await mockRuta.llegada(idOs), sinConexion: false, guardadoEn: new Date() };
  return conRespaldo(idUsuario, `llegada.${idOs}`, () => obtenerLlegada(token, idOs));
}

/**
 * Confirma la llegada. `capturadoEn` = hora (ISO 8601, UTC) en que el técnico tocó "Confirmar llegada": el back la usa si la llegada se guardó
 * sin conexión y llega después, y reconoce un envío repetido (no duplica).
 */
export async function registrarLlegada(
  token: string,
  idOs: number,
  u: Ubicacion,
  capturadoEn: string,
): Promise<{ mensaje: string; datos: ResultadoLlegada | null }> {
  if (entorno.usarMock) return mockRuta.registrarLlegada(idOs);
  const r = await solicitar<ResultadoLlegada>(`${ruta(idOs)}/llegada`, { token, metodo: 'POST', cuerpo: { ...u, capturadoEn } });
  return { mensaje: r.mensaje, datos: r.datos ?? null };
}

// ── HU-07 · Objetivos y equipos ─────────────────────────────────────────────

export type EstadoObjetivo = 'por_iniciar' | 'en_ejecucion' | 'pausado' | 'completado' | 'observado';

export interface CambioEquipo {
  fecha: string | null;
  campo: string;
  valorAnterior: string | null;
  valorNuevo: string | null;
  detalle: string | null;
  usuario: string | null;
}

export interface ObjetivoEquipo {
  idOsEquipo: number;
  idEquipo: number;
  /** Número del objetivo en la lista de la OS (1, 2, 3…). */
  numero: number;
  codigoTw: string | null;
  codigoCliente: string | null;
  nombre: string;
  marca: string | null;
  modelo: string | null;
  numeroSerie: string | null;
  ubicacion: string | null;
  tipoIntervencion: string | null;
  /** Sigla del tipo de intervención ("MC"); sin sigla se muestra el nombre completo. */
  tipoCorto: string | null;
  estadoEquipo: string | null;
  /** No se puede seleccionar (equipo inactivo o en evaluación). */
  bloqueado: boolean;
  /** Lo registró el técnico en campo como equipo nuevo (NEW): pendiente de aprobación en la intranet. */
  enCampo: boolean;
  /** El objetivo no tiene N/S: "FALTA EQUIPO/INSTRUMENTO". */
  faltaEquipo: boolean;
  alertasPendientes: number;
  estado: EstadoObjetivo;
  tiempoEstimadoMin: number | null;
  tiempoRealMin: number;
  iniciadoEn: string | null;
  motivoPausa: string | null;
  requiereAprobacion: boolean;
  ultimaIntervencion: string | null;
  ultimaParte: string | null;
  puedeIniciar: boolean;
  puedePausar: boolean;
  puedeReanudar: boolean;
  cambios: CambioEquipo[];
}

export interface Objetivos {
  resumen: {
    idOs: number;
    numeroOs: string;
    estadoOs: string;
    cliente: string | null;
    sede: string | null;
    llegadaRegistrada: boolean;
    salidaEn: string | null;
    llegadaEn: string | null;
    trasladoMin: number | null;
    enPlantaMin: number | null;
    estimadoMin: number | null;
  };
  contadores: { completados: number; pendientes: number; observados: number; total: number };
  equipos: ObjetivoEquipo[];
}

export async function obtenerObjetivos(token: string, idOs: number, buscar = ''): Promise<Objetivos> {
  if (entorno.usarMock) return mockRuta.objetivos(idOs, buscar);
  const q = buscar.trim() ? `?buscar=${encodeURIComponent(buscar.trim().slice(0, 100))}` : '';
  return (await solicitar<Objetivos>(`${ruta(idOs)}/objetivos${q}`, { token })).datos!;
}

/**
 * Igual que `obtenerObjetivos` (sin búsqueda), pero sin conexión devuelve la última lista guardada en el teléfono para poder seguir
 * iniciando, pausando y reanudando equipos: las acciones se guardan y se envían solas al volver la señal (`api/colaEquipos.ts`).
 */
export async function obtenerObjetivosConRespaldo(token: string, idUsuario: number, idOs: number): Promise<ConRespaldo<Objetivos>> {
  if (entorno.usarMock) return { datos: await mockRuta.objetivos(idOs, ''), sinConexion: false, guardadoEn: new Date() };
  return conRespaldo(idUsuario, `objetivos.${idOs}`, () => obtenerObjetivos(token, idOs));
}

export async function buscarEquipoPorQr(token: string, idOs: number, contenido: string): Promise<ObjetivoEquipo> {
  if (entorno.usarMock) return mockRuta.qr(idOs, contenido);
  return (await solicitar<ObjetivoEquipo>(`${ruta(idOs)}/equipos/qr?codigo=${encodeURIComponent(contenido.slice(0, 300))}`, { token })).datos!;
}

export type AccionEquipo = 'iniciar' | 'pausar' | 'reanudar';

/**
 * Inicia, pausa (con motivo) o reanuda el trabajo en un equipo. `capturadoEn` = hora (ISO 8601, UTC) en que el técnico tocó el botón: si la acción
 * se guardó sin conexión y llega después, el back la usa para el tiempo trabajado y reconoce un envío repetido (no duplica).
 * Devuelve los objetivos ya actualizados.
 */
export async function cambiarEstadoEquipo(
  token: string,
  idOs: number,
  idOsEquipo: number,
  accion: AccionEquipo,
  opciones: { motivo?: string; capturadoEn?: string } = {},
): Promise<{ mensaje: string; objetivos: Objetivos | null }> {
  if (entorno.usarMock) return mockRuta.cambiar(idOs, idOsEquipo, accion, opciones.motivo);
  const r = await solicitar<Objetivos>(`${ruta(idOs)}/equipos/${encodeURIComponent(String(idOsEquipo))}/${accion}`, {
    token,
    metodo: 'POST',
    cuerpo: { motivo: accion === 'pausar' ? (opciones.motivo?.trim() ?? '') : undefined, capturadoEn: opciones.capturadoEn },
  });
  return { mensaje: r.mensaje, objetivos: r.datos ?? null };
}

// ── HU-07 · Equipo nuevo (NEW) ───────────────────────────────────────────────

export interface TipoEquipoNuevo {
  idSuministro: number;
  descripcion: string;
  clase: string;
  marca: string | null;
  modelo: string | null;
}

export interface OpcionesEquipoNuevo {
  marcas: string[];
  tipos: TipoEquipoNuevo[];
}

export interface NuevoEquipo {
  numeroSerie: string;
  codigo: string;
  marca: string;
  modelo: string;
  idSuministro: number;
  ubicacion: string;
  /** URI de la foto de la placa tomada con la cámara de la app (nunca de la galería). */
  fotoUri: string;
}

export interface ResultadoEquipoNuevo {
  idOsEquipo: number;
  idEquipo: number;
  /** Provisional (NEW-…): la intranet asigna el COD TW definitivo al aprobar el registro. */
  codigoTw: string;
  /** Ya estaba en el maestro del cliente: se agregó a la OS sin duplicarlo. */
  yaExistia: boolean;
  /** Reintento: ya lo había registrado este técnico. */
  yaRegistrado: boolean;
  notificados: number;
}

export async function obtenerOpcionesEquipoNuevo(token: string, idOs: number): Promise<OpcionesEquipoNuevo> {
  if (entorno.usarMock) return mockRuta.opcionesEquipoNuevo();
  return (await solicitar<OpcionesEquipoNuevo>(`${ruta(idOs)}/equipos/nuevo/opciones`, { token })).datos!;
}

/** Las listas del formulario, con respaldo local para abrirlo sin conexión (registrar sí exige conexión: sube la foto y avisa al área). */
export async function obtenerOpcionesEquipoNuevoConRespaldo(token: string, idUsuario: number, idOs: number): Promise<ConRespaldo<OpcionesEquipoNuevo>> {
  if (entorno.usarMock) return { datos: await mockRuta.opcionesEquipoNuevo(), sinConexion: false, guardadoEn: new Date() };
  return conRespaldo(idUsuario, `equipo-nuevo.opciones.${idOs}`, () => obtenerOpcionesEquipoNuevo(token, idOs));
}

export async function registrarEquipoNuevo(token: string, idOs: number, e: NuevoEquipo): Promise<{ mensaje: string; datos: ResultadoEquipoNuevo | null }> {
  if (entorno.usarMock) return mockRuta.registrarEquipoNuevo(e);
  const form = new FormData();
  form.append('numeroSerie', e.numeroSerie.trim());
  form.append('codigo', e.codigo.trim());
  form.append('marca', e.marca);
  form.append('modelo', e.modelo.trim());
  form.append('idSuministro', String(e.idSuministro));
  form.append('ubicacion', e.ubicacion.trim());
  await agregarArchivo(form, 'foto', e.fotoUri, 'placa.jpg', 'image/jpeg');
  const r = await solicitar<ResultadoEquipoNuevo>(`${ruta(idOs)}/equipos/nuevo`, { token, metodo: 'POST', cuerpo: form });
  return { mensaje: r.mensaje, datos: r.datos ?? null };
}
