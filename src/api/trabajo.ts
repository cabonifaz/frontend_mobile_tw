import { solicitar } from './cliente';
import { entorno } from '@/config/entorno';
import { conRespaldo, type ConRespaldo } from './respaldo';

/**
 * HU-08 y HU-09 — Trabajo en el equipo y variables ambientales.
 *   GET api/movil/servicios/{idOs}/equipos/{idOsEquipo}/trabajo               → SP_ObtenerTrabajoEquipoMovil
 *   PUT api/movil/servicios/{idOs}/equipos/{idOsEquipo}/variables-ambientales → SP_GuardarVariablesAmbientalesMovil (devuelve el trabajo actualizado)
 * El back decide todo (Hard Stop, estado del equipo, tipo de orden OS/OM según la RQ, bloqueo de Ensayos): la app solo muestra.
 */

export type EstadoEtapa = 'conforme' | 'en_curso' | 'pendiente' | 'bloqueado';
export type CodigoEtapa = 'variables' | 'fotos' | 'ensayos' | 'cabecera' | 'correlativo';

export interface EtapaTrabajo {
  orden: number;
  codigo: CodigoEtapa | string;
  nombre: string;
  estado: EstadoEtapa | string;
  detalle: string | null;
  /** La etapa ya tiene pantalla en la app. */
  disponible: boolean;
}

export interface CabeceraTrabajo {
  idOs: number;
  numeroOs: string;
  cliente: string | null;
  /** OS (servicio técnico) u OM (metrología), según el área de la RQ. */
  tipoOrden: 'OS' | 'OM' | string;
  numeroRq: string | null;
  servicioSigla: string | null;
  servicio: string | null;
  idOsEquipo: number;
  nombre: string;
  numeroSerie: string | null;
  codigoCliente: string | null;
  codigoTw: string | null;
  marca: string | null;
  modelo: string | null;
  ubicacion: string | null;
  estado: string;
  tiempoEstimadoMin: number | null;
  tiempoRealMin: number;
  iniciadoEn: string | null;
  /** El equipo está en ejecución y el servicio en curso: solo así se guardan datos de las etapas. */
  puedeRegistrar: boolean;
  etapasConformes: number;
  etapasTotal: number;
  puedeFinalizar: boolean;
}

export interface VariablesAmbientales {
  temperatura: number;
  humedad: number;
  procedencia: string;
  /** Fecha y hora que puso el servidor (Lima). */
  registradoEn: string | null;
}

export interface TrabajoEquipo {
  cabecera: CabeceraTrabajo;
  variables: VariablesAmbientales | null;
  etapas: EtapaTrabajo[];
}

export interface NuevasVariables {
  temperatura: number;
  humedad: number;
  /** Vacía = "N.I" (no indicado). */
  procedencia: string;
}

const ruta = (idOs: number, idOsEquipo: number) =>
  `/api/movil/servicios/${encodeURIComponent(String(idOs))}/equipos/${encodeURIComponent(String(idOsEquipo))}`;

export async function obtenerTrabajoEquipo(token: string, idOs: number, idOsEquipo: number): Promise<TrabajoEquipo> {
  if (entorno.usarMock) return mockTrabajo.obtener(idOs, idOsEquipo);
  return (await solicitar<TrabajoEquipo>(`${ruta(idOs, idOsEquipo)}/trabajo`, { token })).datos!;
}

/** Igual que `obtenerTrabajoEquipo`, pero sin conexión muestra lo último guardado en el teléfono (guardar las variables sí exige conexión). */
export async function obtenerTrabajoEquipoConRespaldo(token: string, idUsuario: number, idOs: number, idOsEquipo: number): Promise<ConRespaldo<TrabajoEquipo>> {
  if (entorno.usarMock) return { datos: await mockTrabajo.obtener(idOs, idOsEquipo), sinConexion: false, guardadoEn: new Date() };
  return conRespaldo(idUsuario, `trabajo.${idOs}.${idOsEquipo}`, () => obtenerTrabajoEquipo(token, idOs, idOsEquipo));
}

export async function guardarVariablesAmbientales(
  token: string,
  idOs: number,
  idOsEquipo: number,
  v: NuevasVariables,
): Promise<{ mensaje: string; trabajo: TrabajoEquipo | null }> {
  if (entorno.usarMock) return mockTrabajo.guardar(idOs, idOsEquipo, v);
  const r = await solicitar<TrabajoEquipo>(`${ruta(idOs, idOsEquipo)}/variables-ambientales`, {
    token,
    metodo: 'PUT',
    cuerpo: {
      temperatura: v.temperatura,
      humedad: v.humedad,
      procedencia: v.procedencia.trim() || undefined,
      capturadoEn: new Date().toISOString(),
    },
  });
  return { mensaje: r.mensaje, trabajo: r.datos ?? null };
}

// ── Modo demo (EXPO_PUBLIC_USE_MOCK=true): los datos viven en memoria mientras la app está abierta ──
const demo = { variables: null as VariablesAmbientales | null };
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ahoraLima = () => new Date(Date.now() - 5 * 3_600_000).toISOString().slice(0, 19);
const nf = (n: number) => String(n).replace('.', ',');

function trabajoDemo(idOs: number, idOsEquipo: number): TrabajoEquipo {
  const v = demo.variables;
  return {
    cabecera: {
      idOs, numeroOs: 'OS-000845', cliente: 'Molinos del Sur S.A.C.', tipoOrden: 'OS', numeroRq: 'RQ-0312-2026', servicioSigla: 'MC', servicio: 'Mantenimiento y ajuste',
      idOsEquipo, nombre: 'Balanza de plataforma', numeroSerie: '3141592', codigoCliente: 'BAL-012', codigoTw: 'COD-0000845', marca: 'Mettler Toledo', modelo: 'PBA430',
      ubicacion: 'Almacén de despacho', estado: 'en_ejecucion', tiempoEstimadoMin: 90, tiempoRealMin: 45, iniciadoEn: ahoraLima(), puedeRegistrar: true,
      etapasConformes: v ? 1 : 0, etapasTotal: 5, puedeFinalizar: false,
    },
    variables: v,
    etapas: [
      { orden: 1, codigo: 'variables', nombre: 'Variables ambientales', estado: v ? 'conforme' : 'pendiente', disponible: true,
        detalle: v ? `T° ${nf(v.temperatura)} °C · h ${nf(v.humedad)} % · Procedencia ${v.procedencia}` : 'Temperatura, humedad y procedencia' },
      { orden: 2, codigo: 'fotos', nombre: 'Registro fotográfico', estado: 'pendiente', disponible: false, detalle: 'Fotos del equipo y del informe a mano' },
      { orden: 3, codigo: 'ensayos', nombre: 'Ensayos y Calibración', estado: v ? 'pendiente' : 'bloqueado', disponible: false,
        detalle: v ? 'Verificación de pesaje tras el ajuste' : 'Se habilita al guardar las variables ambientales' },
      { orden: 4, codigo: 'cabecera', nombre: 'Cabecera del informe', estado: 'pendiente', disponible: false, detalle: 'Datos · Detalle Serv. · Observación y pruebas' },
      { orden: 5, codigo: 'correlativo', nombre: 'Correlativo y certificado', estado: 'pendiente', disponible: false, detalle: 'Correlativo de Metrología → N° de certificado' },
    ],
  };
}

const mockTrabajo = {
  async obtener(idOs: number, idOsEquipo: number): Promise<TrabajoEquipo> {
    await esperar(250);
    return trabajoDemo(idOs, idOsEquipo);
  },
  async guardar(idOs: number, idOsEquipo: number, v: NuevasVariables) {
    await esperar(300);
    demo.variables = { temperatura: v.temperatura, humedad: v.humedad, procedencia: v.procedencia.trim() || 'N.I', registradoEn: ahoraLima() };
    return { mensaje: 'Variables ambientales guardadas. Ya puedes continuar con Ensayos y Calibración.', trabajo: trabajoDemo(idOs, idOsEquipo) };
  },
};
