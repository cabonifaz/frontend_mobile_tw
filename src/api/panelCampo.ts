import { entorno } from '@/config/entorno';
import { ErrorApi, solicitar } from './cliente';
import { conRespaldo, type ConRespaldo } from './respaldo';

/**
 * HU-29 y HU-30 — Panel de campo en tiempo real y Seguimiento del servicio (Jefe de Área).
 *   GET  api/movil/jefatura/panel-campo                        → SP_ObtenerPanelCampoMovil
 *   GET  api/movil/jefatura/servicios?filtro=&busqueda=        → SP_ObtenerServiciosJefaturaMovil
 *   GET  api/movil/jefatura/servicios/{idOs}                   → SP_ObtenerServicioJefaturaMovil
 *   GET  api/movil/jefatura/servicios/{idOs}/ruta              → SP_ObtenerRutaServicioJefaturaMovil
 *   POST api/movil/jefatura/servicios/{idOs}/estado            → SP_RegistrarSeguimientoJefaturaMovil (cambio manual de estado)
 *   POST api/movil/jefatura/servicios/{idOs}/aviso-cliente     → SP_RegistrarSeguimientoJefaturaMovil (constancia del aviso al cliente)
 * El back decide el alcance (área de la RQ para Servicio Técnico y Metrología), el estado de cada servicio y las reglas del cambio de estado: la app solo muestra.
 */

export type EstadoServicio = 'sin_salir' | 'en_ruta' | 'en_planta' | 'en_ejecucion' | 'con_demora' | 'con_incidente' | 'finalizado';
export type FiltroServicios = 'activos' | 'demora' | 'incidencias' | 'finalizados';
export type TonoHito = 'verde' | 'azul' | 'naranja' | 'rojo' | 'gris' | 'amarillo';

export interface KpisPanel {
  programados: number;
  enRuta: number;
  ejecucion: number;
  demora: number;
  incidencia: number;
  finalizados: number;
  /** HH:MM */
  actualizado: string | null;
  refrescoSegundos: number;
}

export interface PinTecnico {
  idUsuario: number;
  tecnico: string;
  iniciales: string;
  estado: EstadoServicio | string;
  /** Sin posición hoy = null: el mapa no lo dibuja. */
  latitud: number | null;
  longitud: number | null;
  minutosUbicacion: number | null;
  idOs: number | null;
  numeroOs: string | null;
  cliente: string | null;
}

export type TipoAlertaPanel = 'error_critico' | 'incidente' | 'demora' | 'perdida_contacto' | 'gps_parado' | 'sin_ingreso_post_llegada' | 'sin_iniciar_servicio';

export interface AlertaPanel {
  clave: string;
  tipo: TipoAlertaPanel | string;
  severidad: 'critica' | 'advertencia' | string;
  titulo: string;
  detalle: string | null;
  idOs: number;
  numeroOs: string;
  cliente: string | null;
  tecnico: string | null;
  equipo: string | null;
  minutos: number;
}

export interface PanelCampo {
  kpis: KpisPanel;
  pines: PinTecnico[];
  alertas: AlertaPanel[];
}

export interface ChipsServicios {
  activos: number;
  conDemora: number;
  incidencias: number;
  finalizados: number;
  actualizado: string | null;
  refrescoSegundos: number;
}

export interface ServicioActivo {
  idOs: number;
  numero: string;
  cliente: string | null;
  estado: EstadoServicio | string;
  idTecnico: number | null;
  tecnico: string | null;
  iniciales: string;
  lugar: string | null;
  horaProgramada: string | null;
  llegada: string | null;
  /** Solo en ruta. */
  eta: string | null;
  /** Estimación por hitos (no es un dato medido). */
  avancePct: number;
  minutosUbicacion: number | null;
}

export interface ServiciosJefatura {
  chips: ChipsServicios;
  servicios: ServicioActivo[];
}

export interface CabeceraServicio {
  idOs: number;
  numero: string;
  tipo: string | null;
  cliente: string | null;
  lugar: string | null;
  estado: EstadoServicio | string;
  estadoOs: string;
  idTecnico: number | null;
  tecnico: string | null;
  cargoTecnico: string | null;
  telefonoTecnico: string | null;
  horaProgramada: string | null;
  llegada: string | null;
  /** Puntualidad de llegada (estimación): null mientras no haya llegada. */
  slaPct: number | null;
  avancePct: number;
  equipos: number;
  ejecutados: number;
  contactoNombre: string | null;
  contactoTelefono: string | null;
  /** El usuario tiene los permisos del seguimiento operativo y el servicio no está finalizado. */
  puedeCambiarEstado: boolean;
  actualizado: string | null;
}

export interface HitoServicio {
  codigo: string;
  titulo: string;
  detalle: string | null;
  hora: string | null;
  estado: 'hecho' | 'actual' | 'pendiente' | string;
  tono: TonoHito | string;
}

export interface EstadoPermitido {
  codigo: string;
  nombre: string;
}

export interface MotivoCambio {
  idMotivo: number;
  nombre: string;
}

export interface ServicioJefatura {
  cabecera: CabeceraServicio;
  hitos: HitoServicio[];
  estadosPermitidos: EstadoPermitido[];
  motivos: MotivoCambio[];
}

export interface ResumenRuta {
  idOs: number;
  numero: string;
  cliente: string | null;
  estado: EstadoServicio | string;
  idTecnico: number | null;
  tecnico: string | null;
  telefonoTecnico: string | null;
  latitud: number | null;
  longitud: number | null;
  minutosUbicacion: number | null;
  velocidadKmh: number | null;
  /** En línea recta a la planta. */
  distanciaM: number | null;
  destinoLatitud: number | null;
  destinoLongitud: number | null;
  destinoNombre: string | null;
  origenLatitud: number | null;
  origenLongitud: number | null;
  eta: string | null;
  etaProgramada: string | null;
  /** HU-20: llegada estimada desde la posición actual (en ruta; referencial: línea recta × 1,3 a la velocidad promedio) y dirección de la planta. Opcionales: un back anterior no los envía. */
  etaMinutos?: number | null;
  etaEstimada?: string | null;
  destinoDireccion?: string | null;
  demoraTexto: string | null;
  demoraOrigen: 'tecnico' | 'asistente' | string | null;
  contactoNombre: string | null;
  contactoTelefono: string | null;
  actualizado: string | null;
}

export interface PuntoGps {
  latitud: number;
  longitud: number;
  hora: string | null;
}

export interface EventoRuta {
  hora: string | null;
  titulo: string;
  detalle: string | null;
  badge: string;
  tono: TonoHito | string;
}

export interface RutaServicio {
  resumen: ResumenRuta;
  recorrido: PuntoGps[];
  eventos: EventoRuta[];
}

export interface ResultadoRegistro {
  idRegistro: number;
  modo: string;
  notificados: number;
  estadoNuevo: string | null;
}

const base = '/api/movil/jefatura';

export async function obtenerPanelCampo(token: string): Promise<PanelCampo> {
  if (entorno.usarMock) return mockPanel.panel();
  return (await solicitar<PanelCampo>(`${base}/panel-campo`, { token })).datos!;
}

export async function obtenerServiciosJefatura(token: string, filtro: FiltroServicios, busqueda: string): Promise<ServiciosJefatura> {
  if (entorno.usarMock) return mockPanel.servicios(filtro, busqueda);
  const q = new URLSearchParams({ filtro });
  if (busqueda.trim()) q.set('busqueda', busqueda.trim());
  return (await solicitar<ServiciosJefatura>(`${base}/servicios?${q.toString()}`, { token })).datos!;
}

export async function obtenerServicioJefatura(token: string, idOs: number): Promise<ServicioJefatura> {
  if (entorno.usarMock) return mockPanel.servicio(idOs);
  return (await solicitar<ServicioJefatura>(`${base}/servicios/${encodeURIComponent(String(idOs))}`, { token })).datos!;
}

export async function obtenerRutaServicio(token: string, idOs: number): Promise<RutaServicio> {
  if (entorno.usarMock) return mockPanel.ruta(idOs);
  return (await solicitar<RutaServicio>(`${base}/servicios/${encodeURIComponent(String(idOs))}/ruta`, { token })).datos!;
}

// Con respaldo: sin conexión se ve lo último guardado (cambiar el estado y avisar sí exigen conexión).
const respaldo = <T>(demo: () => Promise<T>, nombre: string, consulta: () => Promise<T>, idUsuario: number): Promise<ConRespaldo<T>> =>
  entorno.usarMock ? demo().then((datos) => ({ datos, sinConexion: false, guardadoEn: new Date() })) : conRespaldo(idUsuario, nombre, consulta);

export const obtenerPanelCampoConRespaldo = (token: string, idUsuario: number) =>
  respaldo(() => mockPanel.panel(), 'jefatura.panel', () => obtenerPanelCampo(token), idUsuario);

/** La lista con búsqueda no se guarda (cada texto sería otra consulta): solo la vista por filtro sin búsqueda. */
export function obtenerServiciosJefaturaConRespaldo(token: string, idUsuario: number, filtro: FiltroServicios, busqueda: string): Promise<ConRespaldo<ServiciosJefatura>> {
  if (busqueda.trim()) return obtenerServiciosJefatura(token, filtro, busqueda).then((datos) => ({ datos, sinConexion: false, guardadoEn: new Date() }));
  return respaldo(() => mockPanel.servicios(filtro, ''), `jefatura.servicios.${filtro}`, () => obtenerServiciosJefatura(token, filtro, ''), idUsuario);
}

export const obtenerServicioJefaturaConRespaldo = (token: string, idUsuario: number, idOs: number) =>
  respaldo(() => mockPanel.servicio(idOs), `jefatura.servicio.${idOs}`, () => obtenerServicioJefatura(token, idOs), idUsuario);

export const obtenerRutaServicioConRespaldo = (token: string, idUsuario: number, idOs: number) =>
  respaldo(() => mockPanel.ruta(idOs), `jefatura.ruta.${idOs}`, () => obtenerRutaServicio(token, idOs), idUsuario);

/** Cambio manual de estado: solo avanzar, con motivo y comentario. Queda en el historial del servicio con el usuario y la hora. */
export async function cambiarEstadoServicio(
  token: string,
  idOs: number,
  c: { nuevoEstado: string; idMotivo: number; comentario: string },
): Promise<{ mensaje: string; datos: ResultadoRegistro | null }> {
  if (entorno.usarMock) return mockPanel.cambiarEstado(idOs, c.nuevoEstado);
  const r = await solicitar<ResultadoRegistro>(`${base}/servicios/${encodeURIComponent(String(idOs))}/estado`, {
    token,
    metodo: 'POST',
    cuerpo: { nuevoEstado: c.nuevoEstado, idMotivo: c.idMotivo, comentario: c.comentario.trim() },
  });
  return { mensaje: r.mensaje, datos: r.datos ?? null };
}

/** Deja constancia del aviso dado al cliente (queda como nota del seguimiento). No envía nada al cliente. */
export async function registrarAvisoCliente(token: string, idOs: number, mensaje: string): Promise<{ mensaje: string; datos: ResultadoRegistro | null }> {
  if (entorno.usarMock) return mockPanel.aviso();
  const r = await solicitar<ResultadoRegistro>(`${base}/servicios/${encodeURIComponent(String(idOs))}/aviso-cliente`, {
    token,
    metodo: 'POST',
    cuerpo: { mensaje: mensaje.trim() },
  });
  return { mensaje: r.mensaje, datos: r.datos ?? null };
}

// ── Modo demo (EXPO_PUBLIC_USE_MOCK=true): los datos de las maquetas (Carlos · Jefe de Servicio Técnico) ──
const esperar = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const SERVICIOS_DEMO: ServicioActivo[] = [
  { idOs: 845, numero: 'OS 0845-2026', cliente: 'Molinos del Sur', estado: 'en_ejecucion', idTecnico: 1, tecnico: 'Juan Pérez', iniciales: 'JP', lugar: 'Planta Ate', horaProgramada: '08:30', llegada: '08:27', eta: null, avancePct: 60, minutosUbicacion: 1 },
  { idOs: 849, numero: 'OS 0849-2026', cliente: 'Aceros del Pacífico', estado: 'con_demora', idTecnico: 2, tecnico: 'Joao Gutiérrez', iniciales: 'JG', lugar: 'Av. Néstor Gambetta', horaProgramada: '09:00', llegada: null, eta: '09:45', avancePct: 35, minutosUbicacion: 1 },
  { idOs: 851, numero: 'OS 0851-2026', cliente: 'Lácteos Andinos', estado: 'en_ruta', idTecnico: 3, tecnico: 'Luis Medina', iniciales: 'LM', lugar: 'Panamericana Sur km 18', horaProgramada: '10:30', llegada: null, eta: '11:20', avancePct: 20, minutosUbicacion: 2 },
  { idOs: 853, numero: 'OS 0853-2026', cliente: 'Agroindustrias Norte', estado: 'en_ruta', idTecnico: 4, tecnico: 'Miguel Torres', iniciales: 'MT', lugar: 'Vía Expresa', horaProgramada: '10:30', llegada: null, eta: '11:05', avancePct: 15, minutosUbicacion: 1 },
];

const demoPanel: PanelCampo = {
  kpis: { programados: 9, enRuta: 5, ejecucion: 3, demora: 1, incidencia: 1, finalizados: 2, actualizado: '10:46', refrescoSegundos: 30 },
  pines: [
    { idUsuario: 1, tecnico: 'Juan Pérez', iniciales: 'JP', estado: 'en_ruta', latitud: -12.03, longitud: -77.075, minutosUbicacion: 1, idOs: 845, numeroOs: 'OS 0845-2026', cliente: 'Molinos del Sur' },
    { idUsuario: 2, tecnico: 'Joao Gutiérrez', iniciales: 'JG', estado: 'con_demora', latitud: -12.05, longitud: -77.045, minutosUbicacion: 1, idOs: 849, numeroOs: 'OS 0849-2026', cliente: 'Aceros del Pacífico' },
    { idUsuario: 5, tecnico: 'Luis Medina', iniciales: 'LM', estado: 'en_ejecucion', latitud: -12.062, longitud: -77.062, minutosUbicacion: 3, idOs: 851, numeroOs: 'OS 0851-2026', cliente: 'Lácteos Andinos' },
    { idUsuario: 6, tecnico: 'Karen Flores', iniciales: 'KF', estado: 'en_ejecucion', latitud: -12.04, longitud: -77.02, minutosUbicacion: 2, idOs: 852, numeroOs: 'OS 0852-2026', cliente: 'Cementos Lima' },
    { idUsuario: 4, tecnico: 'Miguel Torres', iniciales: 'MT', estado: 'en_ruta', latitud: -12.07, longitud: -77.03, minutosUbicacion: 1, idOs: 853, numeroOs: 'OS 0853-2026', cliente: 'Agroindustrias Norte' },
    { idUsuario: 7, tecnico: 'Diego Huamán', iniciales: 'DH', estado: 'con_incidente', latitud: -12.083, longitud: -77.068, minutosUbicacion: 4, idOs: 854, numeroOs: 'OS 0854-2026', cliente: 'Textiles Rímac' },
  ],
  alertas: [
    { clave: 'ensayo:1', tipo: 'error_critico', severidad: 'critica', titulo: 'Error crítico', detalle: 'Pesaje fuera de EMP · pide apoyo', idOs: 845, numeroOs: 'OS 0845-2026', cliente: 'Molinos del Sur', tecnico: 'Juan Pérez', equipo: 'BAL-012', minutos: 2 },
    { clave: 'd2', tipo: 'demora', severidad: 'advertencia', titulo: 'Demora', detalle: 'Ingreso a planta +35 min · nueva hora 09:45', idOs: 849, numeroOs: 'OS 0849-2026', cliente: 'Aceros del Pacífico', tecnico: 'Joao Gutiérrez', equipo: null, minutos: 20 },
  ],
};

let estadoDemo: Record<number, string> = {};

const mockPanel = {
  async panel(): Promise<PanelCampo> {
    await esperar(350);
    return demoPanel;
  },
  async servicios(filtro: FiltroServicios, busqueda: string): Promise<ServiciosJefatura> {
    await esperar(300);
    const q = busqueda.trim().toLowerCase();
    const pasa = (s: ServicioActivo) =>
      (filtro === 'demora' ? s.estado === 'con_demora' : filtro === 'incidencias' ? s.estado === 'con_incidente' : filtro === 'finalizados' ? s.estado === 'finalizado' : s.estado !== 'finalizado') &&
      (!q || s.numero.toLowerCase().includes(q) || (s.cliente ?? '').toLowerCase().includes(q) || (s.tecnico ?? '').toLowerCase().includes(q));
    return { chips: { activos: 8, conDemora: 1, incidencias: 1, finalizados: 2, actualizado: '10:46', refrescoSegundos: 30 }, servicios: filtro === 'finalizados' ? [] : SERVICIOS_DEMO.filter(pasa) };
  },
  async servicio(idOs: number): Promise<ServicioJefatura> {
    await esperar(300);
    const s = SERVICIOS_DEMO.find((x) => x.idOs === idOs) ?? SERVICIOS_DEMO[0];
    const en845 = s.idOs === 845;
    const estadoOs = estadoDemo[s.idOs];
    return {
      cabecera: {
        idOs: s.idOs, numero: s.numero, tipo: 'OS', cliente: `${s.cliente} S.A.C.`, lugar: s.lugar, estado: s.estado, estadoOs: en845 ? 'en_ejecucion' : 'en_ruta',
        idTecnico: s.idTecnico, tecnico: s.tecnico, cargoTecnico: 'Técnico de Campo', telefonoTecnico: '987654321', horaProgramada: s.horaProgramada, llegada: s.llegada,
        slaPct: en845 ? 96 : null, avancePct: s.avancePct, equipos: 5, ejecutados: en845 ? 2 : 0, contactoNombre: 'Rosa Quispe', contactoTelefono: '987111222',
        puedeCambiarEstado: true, actualizado: '10:46',
      },
      hitos: [
        { codigo: 'asignado', titulo: 'Asignado y autorizado', detalle: 'visto bueno de Carlos Rojas', hora: '07:32', estado: 'hecho', tono: 'verde' },
        { codigo: 'en_ruta', titulo: 'En ruta', detalle: 'salida de la sede', hora: '07:40', estado: 'hecho', tono: 'verde' },
        { codigo: 'demora', titulo: 'Demora · Ingreso a planta', detalle: '+15 min · registrada por el técnico', hora: '08:05', estado: 'hecho', tono: 'naranja' },
        { codigo: 'llegada', titulo: 'Llegada a planta', detalle: en845 ? 'GPS válido a 12 m' : 'Aún no llega', hora: en845 ? '08:27' : null, estado: en845 ? 'hecho' : 'actual', tono: en845 ? 'verde' : 'azul' },
        { codigo: 'trabajo', titulo: 'Trabajo en el equipo', detalle: '2 de 5 equipos ejecutados', hora: en845 ? '08:40' : null, estado: en845 ? 'actual' : 'pendiente', tono: en845 ? 'azul' : 'gris' },
        { codigo: 'informe', titulo: 'Informe y firmas', detalle: 'Pendiente', hora: null, estado: 'pendiente', tono: 'gris' },
      ],
      estadosPermitidos: estadoOs ? [] : en845 ? [{ codigo: 'finalizado', nombre: 'Finalizado' }] : [{ codigo: 'llegada', nombre: 'Llegada a planta' }, { codigo: 'ingreso', nombre: 'Ingreso a planta' }, { codigo: 'inicio', nombre: 'Inicio de servicio' }, { codigo: 'finalizado', nombre: 'Finalizado' }],
      motivos: [{ idMotivo: 1, nombre: 'Celular robado / perdido' }, { idMotivo: 2, nombre: 'Batería agotada sin posibilidad de carga' }, { idMotivo: 3, nombre: 'Equipo dañado (celular roto)' }, { idMotivo: 4, nombre: 'App móvil con error técnico' }, { idMotivo: 5, nombre: 'Otro (especificar en comentario)' }],
    };
  },
  async ruta(idOs: number): Promise<RutaServicio> {
    await esperar(300);
    const s = SERVICIOS_DEMO.find((x) => x.idOs === idOs) ?? SERVICIOS_DEMO[1];
    return {
      resumen: {
        idOs: s.idOs, numero: s.numero, cliente: s.cliente, estado: s.estado, idTecnico: s.idTecnico, tecnico: s.tecnico, telefonoTecnico: '987654321',
        latitud: -12.07, longitud: -77.035, minutosUbicacion: 1, velocidadKmh: 18, distanciaM: 6200, destinoLatitud: -12.09, destinoLongitud: -77.0, destinoNombre: s.lugar,
        origenLatitud: -12.04, origenLongitud: -77.08, eta: '09:45', etaProgramada: s.horaProgramada, demoraTexto: 'Ingreso a planta · +35 min · "Cola de camiones en garita" · Impacto: retrasa el servicio',
        demoraOrigen: 'tecnico', contactoNombre: 'Rosa Quispe', contactoTelefono: '987111222', actualizado: '10:46',
      },
      recorrido: [
        { latitud: -12.04, longitud: -77.08, hora: '07:55' }, { latitud: -12.047, longitud: -77.068, hora: '08:10' }, { latitud: -12.056, longitud: -77.058, hora: '08:25' },
        { latitud: -12.06, longitud: -77.05, hora: '08:40' }, { latitud: -12.066, longitud: -77.043, hora: '09:00' }, { latitud: -12.07, longitud: -77.035, hora: '09:12' },
      ],
      eventos: [
        { hora: '07:55', titulo: 'Salida de sede', detalle: 'GPS -12.04, -77.08', badge: 'OK', tono: 'verde' },
        { hora: '08:40', titulo: 'Demora registrada', detalle: 'ETA recalculada 09:10 → 09:45', badge: '+35 MIN', tono: 'naranja' },
        { hora: '09:12', titulo: 'GPS parado', detalle: 'Av. Néstor Gambetta', badge: 'ALERTA', tono: 'amarillo' },
      ],
    };
  },
  async cambiarEstado(idOs: number, nuevoEstado: string) {
    await esperar(400);
    estadoDemo = { ...estadoDemo, [idOs]: nuevoEstado };
    return { mensaje: 'Estado actualizado. Quedó registrado en el historial del servicio.', datos: { idRegistro: 1, modo: 'cambio_estado', notificados: 1, estadoNuevo: nuevoEstado } };
  },
  async aviso() {
    await esperar(300);
    return { mensaje: 'Aviso registrado en el seguimiento del servicio.', datos: { idRegistro: 2, modo: 'observacion', notificados: 0, estadoNuevo: null } };
  },
};

/** Para las pantallas: un servicio que no es de hoy o del área del jefe responde 400 con el mensaje del back. */
export const esErrorDeAlcance = (e: unknown): boolean => e instanceof ErrorApi && e.estadoHttp === 400;
