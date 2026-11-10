import { entorno } from '@/config/entorno';
import { ErrorApi, solicitar } from './cliente';
import { conRespaldo, type ConRespaldo } from './respaldo';

/**
 * HU-14 (Técnico) y HU-34 (Jefe de Metrología) — Correlativos de certificación.
 *   GET  api/movil/correlativos/servicios/{idOs}/equipos/{idOsEquipo}/solicitud   → SP_ObtenerSolicitudCorrelativoMovil
 *   POST api/movil/correlativos/servicios/{idOs}/equipos/{idOsEquipo}/tickets     → SP_SolicitarCorrelativoMovil (crea el ticket TK-MET-#####)
 *   PUT  api/movil/correlativos/servicios/{idOs}/equipos/{idOsEquipo}/certificado → SP_GuardarCertificadoMovil (el correlativo pasa a ser el N° de certificado del informe)
 *   GET  api/movil/correlativos/tickets?filtro=&idOs=                             → SP_ObtenerTicketsCorrelativoMovil ("Mis tickets")
 *   POST api/movil/correlativos/reserva                                           → SP_GenerarReservaCorrelativosMovil (la reserva diaria del propio técnico de Metrología)
 *   GET  api/movil/correlativos/jefatura                                          → SP_ObtenerCorrelativosJefaturaMovil
 *   POST api/movil/correlativos/jefatura/reserva                                  → SP_GenerarReservaCorrelativosMovil (todos los técnicos de Metrología)
 *   POST api/movil/correlativos/jefatura/tickets/{idTicket}/asignar               → SP_AsignarCorrelativoMovil
 * El back decide todo (Hard Stop, ensayos finalizados, un ticket abierto por equipo, la secuencia única CC-####-AAAA, permisos de Metrología, avisos): la app solo muestra.
 * Solicitar, asignar, guardar el certificado y generar la reserva exigen conexión. El uso de la reserva SIN conexión queda pendiente (necesita cola local y conciliación).
 */

export type EstadoTicket = 'solicitado' | 'asignado' | 'despachado';
export type FiltroTickets = 'todos' | 'pendientes' | 'asignados';

export interface TipoCertificado {
  idTipo: number;
  nombre: string;
}

/** El correlativo que Metrología asignó al equipo y que el técnico aún no usó. */
export interface CorrelativoAsignado {
  idTicket: number;
  ticket: string;
  correlativo: string;
  /** ISO 8601 (hora de Lima). */
  asignadoEn: string | null;
  asignadoPor: string | null;
}

export interface CabeceraSolicitud {
  idOs: number;
  numeroOs: string;
  idOsEquipo: number;
  equipo: string;
  numero: number;
  numeroSerie: string | null;
  codigoCliente: string | null;
  codigoTw: string | null;
  clase: string | null;
  capacidad: string | null;
  /** OS (servicio técnico) u OM (metrología) según la RQ. */
  tipoOrden: 'OS' | 'OM' | string;
  numeroRq: string | null;
  resultado: string | null;
  puedeSolicitar: boolean;
  motivoBloqueo: string | null;
  ticketAbiertoId: number | null;
  ticketAbiertoNumero: string | null;
  ticketAbiertoEstado: EstadoTicket | string | null;
  /** El certificado que ya forma parte del informe del equipo. */
  numeroCertificado: string | null;
  /** El técnico es de Metrología: recibe la reserva diaria. */
  tecnicoMetrologia: boolean;
}

export interface SolicitudCorrelativo {
  cabecera: CabeceraSolicitud;
  tipos: TipoCertificado[];
  asignado: CorrelativoAsignado | null;
  reservaLibre: string[];
}

export interface TicketCorrelativo {
  idTicket: number;
  numero: string;
  estado: EstadoTicket | string;
  usado: boolean;
  idOs: number;
  numeroOs: string;
  idOsEquipo: number | null;
  equipo: string | null;
  codigoEquipo: string | null;
  numeroSerie: string | null;
  idTipo: number | null;
  tipoCertificado: string | null;
  observacion: string | null;
  solicitadoEn: string | null;
  solicitante: string | null;
  correlativo: string | null;
  asignadoEn: string | null;
  asignadoPor: string | null;
  puedeUsar: boolean;
}

export interface TicketCreado {
  idTicket: number;
  numero: string;
  estado: string;
  solicitadoEn: string | null;
  notificados: number;
}

export interface CertificadoGuardado {
  numeroCertificado: string;
  /** ticket (el asignado por Metrología) o reserva (uno de los reservados al técnico). */
  origen: string | null;
  ticket: string | null;
}

export interface ReservaGenerada {
  generados: number;
  tecnicos: number;
}

export interface KpisCorrelativos {
  pendientes: number;
  asignadosHoy: number;
  reservados: number;
  siguienteSugerido: string | null;
  reservaDiaria: number;
}

export interface TicketJefatura {
  idTicket: number;
  numero: string;
  estado: EstadoTicket | string;
  tecnico: string | null;
  numeroOs: string;
  equipo: string | null;
  codigoEquipo: string | null;
  capacidad: string | null;
  tipoCertificado: string | null;
  observacion: string | null;
  /** El patrón del ensayo (informe técnico): vacío mientras la HU-10 no lo llene. */
  patron: string | null;
  resultado: string | null;
  solicitadoEn: string | null;
  minutos: number;
  correlativo: string | null;
  asignadoEn: string | null;
  asignadoPor: string | null;
}

export interface ReservaTecnico {
  idUsuario: number;
  tecnico: string;
  libres: number;
  codigosLibres: string;
  usados: number;
  usadosTexto: string;
}

export interface CorrelativosJefatura {
  kpis: KpisCorrelativos;
  tickets: TicketJefatura[];
  reserva: ReservaTecnico[];
}

export interface Asignacion {
  idTicket: number;
  numero: string;
  estado: string;
  correlativo: string;
  asignadoEn: string | null;
  asignadoPor: string | null;
  tecnico: string | null;
  siguienteSugerido: string | null;
}

const base = '/api/movil/correlativos';
const enc = (n: number) => encodeURIComponent(String(n));
const rutaEquipo = (idOs: number, idOsEquipo: number) => `${base}/servicios/${enc(idOs)}/equipos/${enc(idOsEquipo)}`;

// ── Técnico ───────────────────────────────────────────────────────────────────────────────

export async function obtenerSolicitud(token: string, idOs: number, idOsEquipo: number): Promise<SolicitudCorrelativo> {
  if (entorno.usarMock) return mock.solicitud(idOs, idOsEquipo);
  return (await solicitar<SolicitudCorrelativo>(`${rutaEquipo(idOs, idOsEquipo)}/solicitud`, { token })).datos!;
}

export async function solicitarCorrelativo(
  token: string,
  idOs: number,
  idOsEquipo: number,
  idTipoCertificado: number,
  observacion: string,
): Promise<{ mensaje: string; datos: TicketCreado | null }> {
  if (entorno.usarMock) return mock.solicitar(idTipoCertificado, observacion);
  const r = await solicitar<TicketCreado>(`${rutaEquipo(idOs, idOsEquipo)}/tickets`, {
    token,
    metodo: 'POST',
    cuerpo: { idTipoCertificado, observacion: observacion.trim() || undefined },
  });
  return { mensaje: r.mensaje, datos: r.datos ?? null };
}

export async function guardarCertificado(
  token: string,
  idOs: number,
  idOsEquipo: number,
  numeroCertificado: string,
): Promise<{ mensaje: string; datos: CertificadoGuardado | null }> {
  if (entorno.usarMock) return mock.guardarCertificado(numeroCertificado);
  const r = await solicitar<CertificadoGuardado>(`${rutaEquipo(idOs, idOsEquipo)}/certificado`, { token, metodo: 'PUT', cuerpo: { numeroCertificado } });
  return { mensaje: r.mensaje, datos: r.datos ?? null };
}

export async function obtenerTickets(token: string, filtro: FiltroTickets, idOs?: number): Promise<TicketCorrelativo[]> {
  if (entorno.usarMock) return mock.tickets(filtro);
  const q = new URLSearchParams({ filtro });
  if (idOs && idOs > 0) q.set('idOs', String(idOs));
  return (await solicitar<TicketCorrelativo[]>(`${base}/tickets?${q.toString()}`, { token })).datos ?? [];
}

/** La reserva diaria del propio técnico de Metrología (idempotente por día; a quien no lo es no le genera nada). */
export async function generarMiReserva(token: string): Promise<ReservaGenerada> {
  if (entorno.usarMock) return { generados: 0, tecnicos: 0 };
  return (await solicitar<ReservaGenerada>(`${base}/reserva`, { token, metodo: 'POST' })).datos ?? { generados: 0, tecnicos: 0 };
}

// ── Jefe de Metrología ────────────────────────────────────────────────────────────────────

export async function obtenerCorrelativosJefatura(token: string): Promise<CorrelativosJefatura> {
  if (entorno.usarMock) return mock.panel();
  return (await solicitar<CorrelativosJefatura>(`${base}/jefatura`, { token })).datos!;
}

/** La reserva de TODOS los técnicos de Metrología (la app la pide al abrir la pantalla; idempotente por día). */
export async function generarReservaJefatura(token: string): Promise<ReservaGenerada> {
  if (entorno.usarMock) return { generados: 0, tecnicos: 0 };
  return (await solicitar<ReservaGenerada>(`${base}/jefatura/reserva`, { token, metodo: 'POST' })).datos ?? { generados: 0, tecnicos: 0 };
}

/** Asigna el correlativo al ticket: vacío = el siguiente sugerido; si no, el escrito (CC-0000-AAAA). */
export async function asignarCorrelativo(token: string, idTicket: number, correlativo: string): Promise<{ mensaje: string; datos: Asignacion | null }> {
  if (entorno.usarMock) return mock.asignar(idTicket, correlativo);
  const r = await solicitar<Asignacion>(`${base}/jefatura/tickets/${enc(idTicket)}/asignar`, {
    token,
    metodo: 'POST',
    cuerpo: { correlativo: correlativo.trim() || undefined },
  });
  return { mensaje: r.mensaje, datos: r.datos ?? null };
}

// ── Con respaldo: sin conexión se ve lo último guardado ───────────────────────────────────

const respaldo = <T>(demo: () => Promise<T>, nombre: string, consulta: () => Promise<T>, idUsuario: number): Promise<ConRespaldo<T>> =>
  entorno.usarMock ? demo().then((datos) => ({ datos, sinConexion: false, guardadoEn: new Date() })) : conRespaldo(idUsuario, nombre, consulta);

export const obtenerSolicitudConRespaldo = (token: string, idUsuario: number, idOs: number, idOsEquipo: number) =>
  respaldo(() => mock.solicitud(idOs, idOsEquipo), `correlativo.solicitud.${idOs}.${idOsEquipo}`, () => obtenerSolicitud(token, idOs, idOsEquipo), idUsuario);

export const obtenerTicketsConRespaldo = (token: string, idUsuario: number, filtro: FiltroTickets, idOs?: number) =>
  respaldo(() => mock.tickets(filtro), `correlativo.tickets.${filtro}.${idOs ?? 0}`, () => obtenerTickets(token, filtro, idOs), idUsuario);

export const obtenerCorrelativosJefaturaConRespaldo = (token: string, idUsuario: number) =>
  respaldo(() => mock.panel(), 'correlativo.jefatura', () => obtenerCorrelativosJefatura(token), idUsuario);

// ── Modo demo (EXPO_PUBLIC_USE_MOCK=true): los datos viven en memoria mientras la app está abierta ──────────────────
const esperar = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const ahoraLima = (restarMin = 0) => {
  const d = new Date(Date.now() - 5 * 3_600_000 - restarMin * 60_000);
  return d.toISOString().slice(0, 19);
};

interface TicketDemo {
  id: number;
  numero: string;
  estado: EstadoTicket;
  tecnico: string;
  numeroOs: string;
  equipo: string;
  codigo: string;
  capacidad: string;
  tipo: string;
  patron: string | null;
  resultado: string;
  observacion: string;
  solicitadoEn: string;
  minutos: number;
  correlativo: string | null;
  asignadoEn: string | null;
  asignadoPor: string | null;
}

const demo = {
  siguiente: 1720,
  asignadosHoy: 6,
  tickets: [
    { id: 243, numero: 'TK-MET-00243', estado: 'solicitado', tecnico: 'Juan Pérez', numeroOs: 'OS 0845-2026', equipo: 'Balanza de plataforma', codigo: 'BAL-012', capacidad: '3,000 kg',
      tipo: 'Certificado de calibración', patron: 'Juego M1 · PA-A v3', resultado: 'Conforme', observacion: 'Ensayos conformes; excentricidad dentro de EMP.',
      solicitadoEn: ahoraLima(4), minutos: 4, correlativo: null, asignadoEn: null, asignadoPor: null },
    { id: 242, numero: 'TK-MET-00242', estado: 'solicitado', tecnico: 'Karina Flores', numeroOs: 'OM 0612-2026', equipo: 'Balanza analítica', codigo: 'BAL-031', capacidad: '220 g',
      tipo: 'Calibración con pesas', patron: 'Juego E2', resultado: 'Conforme', observacion: '', solicitadoEn: ahoraLima(90), minutos: 90, correlativo: null, asignadoEn: null, asignadoPor: null },
    { id: 240, numero: 'TK-MET-00240', estado: 'solicitado', tecnico: 'Luis Medina', numeroOs: 'OS 0851-2026', equipo: 'Báscula camionera', codigo: 'BC-004', capacidad: '60,000 kg',
      tipo: 'Certificado de calibración', patron: null, resultado: 'Conforme', observacion: '', solicitadoEn: ahoraLima(130), minutos: 130, correlativo: null, asignadoEn: null, asignadoPor: null },
    { id: 238, numero: 'TK-MET-00238', estado: 'asignado', tecnico: 'Juan Pérez', numeroOs: 'OS 0845-2026', equipo: 'Balanza de plataforma', codigo: 'BAL-015', capacidad: '3,000 kg',
      tipo: 'Calibración con pesas', patron: 'Juego M1 · PA-A v3', resultado: 'Conforme', observacion: '', solicitadoEn: ahoraLima(200), minutos: 200,
      correlativo: 'CC-1709-2026', asignadoEn: ahoraLima(180), asignadoPor: 'Ana Torres' },
  ] as TicketDemo[],
  creados: 0,
  certificado: null as string | null,
};
const SOY_JUAN = 'Juan Pérez';

const aTecnico = (t: TicketDemo): TicketCorrelativo => ({
  idTicket: t.id, numero: t.numero, estado: t.estado, usado: false, idOs: 845, numeroOs: t.numeroOs, idOsEquipo: 24, equipo: t.equipo, codigoEquipo: t.codigo, numeroSerie: '3141592',
  idTipo: 1, tipoCertificado: t.tipo, observacion: t.observacion || null, solicitadoEn: t.solicitadoEn, solicitante: t.tecnico,
  correlativo: t.correlativo, asignadoEn: t.asignadoEn, asignadoPor: t.asignadoPor, puedeUsar: t.estado === 'asignado' && demo.certificado === null && t.codigo === 'BAL-012' && t.correlativo !== null,
});

const aJefatura = (t: TicketDemo): TicketJefatura => ({
  idTicket: t.id, numero: t.numero, estado: t.estado, tecnico: t.tecnico, numeroOs: t.numeroOs, equipo: t.equipo, codigoEquipo: t.codigo, capacidad: t.capacidad,
  tipoCertificado: t.tipo, observacion: t.observacion || null, patron: t.patron, resultado: t.resultado, solicitadoEn: t.solicitadoEn, minutos: t.minutos,
  correlativo: t.correlativo, asignadoEn: t.asignadoEn, asignadoPor: t.asignadoPor,
});

const codigo = (n: number) => `CC-${String(n).padStart(4, '0')}-2026`;

const mock = {
  async solicitud(idOs: number, idOsEquipo: number): Promise<SolicitudCorrelativo> {
    await esperar(250);
    const asignado = demo.tickets.find((t) => t.tecnico === SOY_JUAN && t.estado === 'asignado' && t.codigo === 'BAL-012' && demo.certificado === null);
    const abierto = demo.tickets.find((t) => t.tecnico === SOY_JUAN && t.codigo === 'BAL-012' && (t.estado === 'solicitado' || t.estado === 'asignado'));
    return {
      cabecera: {
        idOs, numeroOs: 'OS-000845', idOsEquipo, equipo: 'Balanza de plataforma', numero: 1, numeroSerie: '3141592', codigoCliente: 'BAL-012', codigoTw: 'COD-0000845', clase: 'III',
        capacidad: '3,000 kg', tipoOrden: 'OS', numeroRq: 'RQ-0312-2026', resultado: 'Conforme',
        puedeSolicitar: !abierto && demo.certificado === null,
        motivoBloqueo: demo.certificado ? `Este equipo ya tiene el certificado ${demo.certificado}.` : abierto ? `Ya hay un ticket abierto para este equipo (${abierto.numero}).` : null,
        ticketAbiertoId: abierto?.id ?? null, ticketAbiertoNumero: abierto?.numero ?? null, ticketAbiertoEstado: abierto?.estado ?? null,
        numeroCertificado: demo.certificado, tecnicoMetrologia: false,
      },
      tipos: [
        { idTipo: 1, nombre: 'Calibración con pesas' },
        { idTipo: 2, nombre: 'Certificado de calibración' },
        { idTipo: 3, nombre: 'Constancia de verificación' },
      ],
      asignado: asignado ? { idTicket: asignado.id, ticket: asignado.numero, correlativo: asignado.correlativo ?? '', asignadoEn: asignado.asignadoEn, asignadoPor: asignado.asignadoPor } : null,
      reservaLibre: [],
    };
  },

  async solicitar(idTipo: number, observacion: string) {
    await esperar(300);
    demo.creados += 1;
    const numero = `TK-MET-${String(241 + demo.creados - 1).padStart(5, '0')}`;
    demo.tickets.unshift({
      id: 900 + demo.creados, numero, estado: 'solicitado', tecnico: SOY_JUAN, numeroOs: 'OS 0845-2026', equipo: 'Balanza de plataforma', codigo: 'BAL-012', capacidad: '3,000 kg',
      tipo: ['', 'Calibración con pesas', 'Certificado de calibración', 'Constancia de verificación'][idTipo] ?? 'Certificado', patron: 'Juego M1 · PA-A v3', resultado: 'Conforme',
      observacion, solicitadoEn: ahoraLima(), minutos: 0, correlativo: null, asignadoEn: null, asignadoPor: null,
    });
    return { mensaje: `Solicitud enviada · ticket ${numero} creado.`, datos: { idTicket: 241, numero, estado: 'solicitado', solicitadoEn: ahoraLima(), notificados: 1 } };
  },

  async guardarCertificado(numero: string) {
    await esperar(250);
    demo.certificado = numero;
    return { mensaje: 'Certificado guardado: forma parte del informe técnico.', datos: { numeroCertificado: numero, origen: 'ticket', ticket: 'TK-MET-00241' } };
  },

  async tickets(filtro: FiltroTickets): Promise<TicketCorrelativo[]> {
    await esperar(250);
    return demo.tickets
      .filter((t) => t.tecnico === SOY_JUAN)
      .filter((t) => filtro === 'todos' || (filtro === 'pendientes' ? t.estado === 'solicitado' : t.estado !== 'solicitado'))
      .map(aTecnico);
  },

  async panel(): Promise<CorrelativosJefatura> {
    await esperar(300);
    const pendientes = demo.tickets.filter((t) => t.estado === 'solicitado');
    return {
      kpis: { pendientes: pendientes.length, asignadosHoy: demo.asignadosHoy, reservados: 10, siguienteSugerido: codigo(demo.siguiente), reservaDiaria: 2 },
      tickets: [...pendientes, ...demo.tickets.filter((t) => t.estado !== 'solicitado' && t.asignadoPor === 'Ana Torres' && t.id !== 238)].map(aJefatura),
      reserva: [
        { idUsuario: 11, tecnico: 'Juan Pérez', libres: 2, codigosLibres: 'CC-1721-2026 · CC-1722-2026', usados: 0, usadosTexto: '' },
        { idUsuario: 12, tecnico: 'Karina Flores', libres: 2, codigosLibres: 'CC-1723-2026 · CC-1724-2026', usados: 0, usadosTexto: '' },
        { idUsuario: 13, tecnico: 'Luis Medina', libres: 0, codigosLibres: '', usados: 1, usadosTexto: 'CC-1718-2026 usado · por confirmar' },
      ],
    };
  },

  async asignar(idTicket: number, correlativo: string): Promise<{ mensaje: string; datos: Asignacion | null }> {
    await esperar(300);
    const t = demo.tickets.find((x) => x.id === idTicket);
    if (!t) throw new ErrorApi('Ticket no encontrado.', 400, 1);
    if (t.estado !== 'solicitado') throw new ErrorApi(`${t.numero} ya tiene el correlativo ${t.correlativo ?? ''}.`, 400, 1);
    const cod = correlativo.trim() ? correlativo.trim().toUpperCase() : codigo(demo.siguiente);
    if (!/^CC-\d{4}-\d{4}$/.test(cod)) throw new ErrorApi('El correlativo debe tener el formato CC-0000-2026.', 400, 1);
    t.estado = 'asignado';
    t.correlativo = cod;
    t.asignadoEn = ahoraLima();
    t.asignadoPor = 'Ana Torres';
    demo.asignadosHoy += 1;
    if (cod === codigo(demo.siguiente)) demo.siguiente += 1;
    return {
      mensaje: `Correlativo asignado · ${t.tecnico} ya puede usarlo en su certificado`,
      datos: { idTicket: t.id, numero: t.numero, estado: 'asignado', correlativo: cod, asignadoEn: t.asignadoEn, asignadoPor: 'Ana Torres', tecnico: t.tecnico, siguienteSugerido: codigo(demo.siguiente) },
    };
  },
};
