import { Platform } from 'react-native';
import { solicitar } from './cliente';
import { entorno } from '@/config/entorno';
import { mockRuta } from './mockRuta';

/**
 * HU-05, HU-06 y HU-07 — Ruta y planta.
 *   GET  api/movil/servicios/{idOs}/demoras                 → SP_ObtenerDemorasMovil
 *   POST api/movil/servicios/{idOs}/demoras  (multipart)    → SP_RegistrarDemoraMovil
 *   GET  api/movil/servicios/{idOs}/llegada                 → SP_ObtenerLlegadaMovil
 *   POST api/movil/servicios/{idOs}/llegada/validar         → solo compara (no registra)
 *   POST api/movil/servicios/{idOs}/llegada                 → SP_RegistrarLlegadaMovil
 *   GET  api/movil/servicios/{idOs}/objetivos?buscar=       → SP_ObtenerObjetivosMovil
 *   GET  api/movil/servicios/{idOs}/equipos/qr?codigo=      → equipo de la OS por su QR
 *   POST api/movil/servicios/{idOs}/equipos/{id}/iniciar | pausar | reanudar
 * El back valida todo (OS del técnico, estado, distancia, Hard Stop): la app solo muestra.
 */

// ── HU-05 · Demoras ──────────────────────────────────────────────────────────

export interface MotivoDemora {
  idMotivo: number;
  nombre: string;
  codigo: string | null;
}

export interface DemoraRegistrada {
  idDemora: number;
  motivo: string | null;
  duracionMinutos: number;
  descripcion: string | null;
  fechaRegistro: string | null;
  etaRecalculada: string | null;
  tieneFoto: boolean;
}

export interface ContextoDemoras {
  idOs: number;
  numeroOs: string;
  estadoOs: string;
  cliente: string | null;
  sede: string | null;
  salidaEn: string | null;
  enRutaMinutos: number | null;
  etaOriginal: string | null;
  minutosDemora: number;
  etaVigente: string | null;
  ahora: string;
  puedeRegistrar: boolean;
  motivos: MotivoDemora[];
  demoras: DemoraRegistrada[];
}

export interface Ubicacion {
  latitud: number;
  longitud: number;
  precisionMetros: number;
}

export interface NuevaDemora {
  idMotivo: number;
  duracionMinutos: number;
  descripcion: string;
  ubicacion: Ubicacion;
  /** URI de la foto tomada con la cámara de la app (nunca de la galería). */
  fotoUri: string | null;
}

export interface ResultadoDemora {
  idDemora: number;
  etaOriginal: string | null;
  etaAnterior: string | null;
  etaRecalculada: string | null;
  notificados: number;
}

const ruta = (idOs: number) => `/api/movil/servicios/${encodeURIComponent(String(idOs))}`;

export async function obtenerDemoras(token: string, idOs: number): Promise<ContextoDemoras> {
  if (entorno.usarMock) return mockRuta.demoras(idOs);
  return (await solicitar<ContextoDemoras>(`${ruta(idOs)}/demoras`, { token })).datos!;
}

export async function registrarDemora(token: string, idOs: number, d: NuevaDemora): Promise<{ mensaje: string; datos: ResultadoDemora | null }> {
  if (entorno.usarMock) return mockRuta.registrarDemora(idOs, d);
  const form = new FormData();
  form.append('idMotivo', String(d.idMotivo));
  form.append('duracionMinutos', String(d.duracionMinutos));
  if (d.descripcion.trim()) form.append('descripcion', d.descripcion.trim());
  form.append('latitud', d.ubicacion.latitud.toFixed(7));
  form.append('longitud', d.ubicacion.longitud.toFixed(7));
  form.append('precisionMetros', d.ubicacion.precisionMetros.toFixed(1));
  if (d.fotoUri) {
    if (Platform.OS === 'web') {
      // En web la cámara devuelve un data URI: se convierte a archivo
      const blob = await (await fetch(d.fotoUri)).blob();
      form.append('foto', blob, 'evidencia.jpg');
    } else {
      form.append('foto', { uri: d.fotoUri, name: 'evidencia.jpg', type: 'image/jpeg' } as unknown as Blob);
    }
  }
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

export async function registrarLlegada(token: string, idOs: number, u: Ubicacion): Promise<string> {
  if (entorno.usarMock) return mockRuta.registrarLlegada(idOs);
  return (await solicitar<ValidacionLlegada>(`${ruta(idOs)}/llegada`, { token, metodo: 'POST', cuerpo: u })).mensaje;
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
  codigoTw: string | null;
  codigoCliente: string | null;
  nombre: string;
  marca: string | null;
  modelo: string | null;
  numeroSerie: string | null;
  ubicacion: string | null;
  tipoIntervencion: string | null;
  estadoEquipo: string | null;
  bloqueado: boolean;
  garantiaVigente: boolean | null;
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

export async function buscarEquipoPorQr(token: string, idOs: number, contenido: string): Promise<ObjetivoEquipo> {
  if (entorno.usarMock) return mockRuta.qr(idOs, contenido);
  return (await solicitar<ObjetivoEquipo>(`${ruta(idOs)}/equipos/qr?codigo=${encodeURIComponent(contenido.slice(0, 300))}`, { token })).datos!;
}

export type AccionEquipo = 'iniciar' | 'pausar' | 'reanudar';

export async function cambiarEstadoEquipo(
  token: string,
  idOs: number,
  idOsEquipo: number,
  accion: AccionEquipo,
  motivo?: string,
): Promise<{ mensaje: string; objetivos: Objetivos | null }> {
  if (entorno.usarMock) return mockRuta.cambiar(idOs, idOsEquipo, accion, motivo);
  const r = await solicitar<Objetivos>(`${ruta(idOs)}/equipos/${encodeURIComponent(String(idOsEquipo))}/${accion}`, {
    token,
    metodo: 'POST',
    cuerpo: accion === 'pausar' ? { motivo: motivo?.trim() ?? '' } : undefined,
  });
  return { mensaje: r.mensaje, objetivos: r.datos ?? null };
}
