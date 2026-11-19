import { entorno } from '@/config/entorno';
import { solicitar } from './cliente';

/**
 * HU-37 — Agenda y carga del área (Jefe de Área): la agenda semanal de su equipo (vistas Semana, Día y Carga), los conflictos de horario y su resolución rápida.
 * Backend: GET api/movil/jefatura/agenda?desde= · GET …/agenda/conflictos/detalle · PUT …/agenda/conflictos/resolver
 *   → envuelven las reglas de la Programación de la intranet (SP_ArmarBaseProgramacion, SP_ObtenerConflictosProgramacion, SP_ResolverConflictoProgramacion → SP_ReprogramarProgramacion).
 * Alcance por Área + Rol (solo los técnicos de su equipo). Resolver exige el permiso de la intranet prog_gestionar; si además tiene prog_aprobar_reprogramacion el cambio se aplica
 * al instante («directa»); si no, queda como solicitud pendiente para el Jefe de Operaciones («solicitud»). La programación completa sigue en la intranet. Todo exige conexión.
 */
export type NivelCarga = 'libre' | 'baja' | 'optima' | 'alta' | 'sobrecarga';
export type EstadoAgenda = 'confirmado' | 'en_curso' | 'demora' | 'conflicto' | 'pendiente' | 'finalizado';
export type ModoResolucion = 'directa' | 'solicitud';

export interface KpisAgenda {
  conflictos: number;
  servicios: number;
  sobrecargados: number;
  actualizado: string | null;
  refrescoSegundos: number;
}

export interface ServicioAgenda {
  idOs: number;
  idProgramacion: number | null;
  numeroOs: string;
  tipo: 'OS' | 'OM' | string;
  /** Número corto de la orden ("0845"). */
  codigo: string;
  cliente: string | null;
  horaInicio: string | null;
  horaFin: string | null;
  tipoServicio: string | null;
  estado: EstadoAgenda | string;
  conflicto: boolean;
}

export interface DiaAgenda {
  fecha: string;
  horas: number;
  nivel: NivelCarga | string;
  conflicto: boolean;
  servicios: ServicioAgenda[];
}

export interface TecnicoAgenda {
  idUsuario: number;
  nombre: string;
  nombreCorto: string;
  iniciales: string;
  dias: DiaAgenda[];
  horasSemana: number;
  utilizacionPct: number;
  nivel: NivelCarga | string;
}

export interface ConflictoAgenda {
  clave: string;
  tipo: string;
  titulo: string;
  detalle: string | null;
  fecha: string | null;
  idTecnico: number;
  tecnico: string;
  idOsA: number | null;
  numeroOsA: string | null;
  idOsB: number | null;
  numeroOsB: string | null;
  puedeResolver: boolean;
  modo: ModoResolucion | string;
}

export interface AgendaArea {
  desde: string;
  hasta: string;
  kpis: KpisAgenda;
  tecnicos: TecnicoAgenda[];
  conflictos: ConflictoAgenda[];
}

export interface ServicioConflicto {
  idOs: number;
  idProgramacion: number | null;
  numeroOs: string;
  tipo: string;
  cliente: string | null;
  fecha: string | null;
  horaInicio: string | null;
  horaFin: string | null;
  tipoServicio: string | null;
  /** La orden que conviene mover (la que se cambia al elegir una opción). */
  objetivo: boolean;
}

export interface TecnicoSugerido {
  idUsuario: number;
  nombre: string;
  detalle: string | null;
}

export interface OpcionAgenda {
  id: number;
  nombre: string;
}

export interface DetalleConflictoAgenda {
  conflicto: ConflictoAgenda;
  servicios: ServicioConflicto[];
  sugerido: TecnicoSugerido | null;
  motivos: OpcionAgenda[];
  modo: ModoResolucion | string;
  motivoSugerido: string | null;
}

export interface ResolverConflicto {
  tipo: string;
  idTecnico: number;
  idOsA: number;
  idOsB: number | null;
  opcion: 'reasignar' | 'reprogramar';
  idOsObjetivo: number | null;
  idNuevoTecnico: number | null;
  fecha: string | null;
  horaInicio: string | null;
  horaFin: string | null;
  idMotivo: number | null;
  comentario: string | null;
}

export interface ResolucionConflicto {
  modo: ModoResolucion | string;
  mensaje: string;
}

const base = '/api/movil/jefatura/agenda';

export async function obtenerAgendaArea(token: string, desde: string | null): Promise<AgendaArea> {
  if (entorno.usarMock) return mockAgenda.agenda(desde);
  const q = desde ? `?desde=${encodeURIComponent(desde)}` : '';
  return (await solicitar<AgendaArea>(`${base}${q}`, { token })).datos!;
}

export async function obtenerDetalleConflicto(token: string, c: Pick<ConflictoAgenda, 'tipo' | 'idTecnico' | 'idOsA' | 'idOsB'>): Promise<DetalleConflictoAgenda> {
  if (entorno.usarMock) return mockAgenda.detalle(c);
  const q = new URLSearchParams({ tipo: c.tipo, idTecnico: String(c.idTecnico) });
  if (c.idOsA) q.set('idOsA', String(c.idOsA));
  if (c.idOsB) q.set('idOsB', String(c.idOsB));
  return (await solicitar<DetalleConflictoAgenda>(`${base}/conflictos/detalle?${q.toString()}`, { token })).datos!;
}

/** PUT …/conflictos/resolver: cambia el técnico, el horario o reprograma con motivo. El back decide si se aplica al instante o queda como solicitud. */
export async function resolverConflicto(token: string, d: ResolverConflicto): Promise<{ mensaje: string; datos: ResolucionConflicto | null }> {
  if (entorno.usarMock) return mockAgenda.resolver(d);
  const r = await solicitar<ResolucionConflicto>(`${base}/conflictos/resolver`, { token, metodo: 'PUT', cuerpo: d });
  return { mensaje: r.mensaje, datos: r.datos ?? null };
}

// ── Modo demostración (EXPO_PUBLIC_USE_MOCK=true) ──────────────────────────────────────────────────────────────────────

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

function lunesDe(fecha: string): string {
  const d = new Date(`${fecha}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}
const sumarDias = (fecha: string, n: number): string => {
  const d = new Date(`${fecha}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

let conflictoResuelto = false;

const mockAgenda = {
  async agenda(desde: string | null): Promise<AgendaArea> {
    await esperar(300);
    const hoy = new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 10);
    const lunes = lunesDe(desde ?? hoy);
    const f = (n: number) => sumarDias(lunes, n);
    const s = (idOs: number, codigo: string, cliente: string, ini: string, fin: string, estado: string, conflicto = false): ServicioAgenda => ({
      idOs, idProgramacion: idOs, numeroOs: `OS ${codigo}-2026`, tipo: 'OS', codigo, cliente, horaInicio: ini, horaFin: fin, tipoServicio: 'Mantenimiento', estado, conflicto,
    });
    const dia = (n: number, servicios: ServicioAgenda[], horas: number, nivel: string): DiaAgenda => ({ fecha: f(n), horas, nivel, conflicto: servicios.some((x) => x.conflicto), servicios });
    const hayConflicto = !conflictoResuelto;
    const tecnicos: TecnicoAgenda[] = [
      {
        idUsuario: 1, nombre: 'Juan Pérez', nombreCorto: 'Juan P.', iniciales: 'JP', horasSemana: 30, utilizacionPct: 75, nivel: 'alta',
        dias: [
          dia(0, [s(845, '0845', 'Molinos', '08:00', '16:00', 'en_curso')], 8, 'optima'),
          dia(1, [s(856, '0856', 'Gloria', '08:00', '14:00', 'confirmado')], 6, 'optima'),
          dia(2, hayConflicto ? [s(860, '0860', 'Alicorp', '09:00', '12:00', 'confirmado', true), s(861, '0861', 'Backus', '10:00', '12:30', 'conflicto', true)] : [s(860, '0860', 'Alicorp', '09:00', '12:00', 'confirmado')], hayConflicto ? 5.5 : 3, hayConflicto ? 'sobrecarga' : 'baja'),
          dia(3, [], 0, 'libre'),
          dia(4, [s(870, '0870', 'Sider', '08:00', '13:00', 'confirmado')], 5, 'baja'),
        ],
      },
      {
        idUsuario: 2, nombre: 'Joao Gutiérrez', nombreCorto: 'Joao G.', iniciales: 'JG', horasSemana: 16, utilizacionPct: 40, nivel: 'normal',
        dias: [
          dia(0, [s(849, '0849', 'Aceros', '08:00', '15:00', 'demora')], 7, 'optima'),
          dia(1, [], 0, 'libre'),
          dia(2, [s(857, '0857', 'Lácteos', '09:00', '12:00', 'confirmado')], 3, 'baja'),
          dia(3, [s(863, '0863', 'Pesquera', '08:00', '14:00', 'confirmado')], 6, 'optima'),
          dia(4, [], 0, 'libre'),
        ],
      },
      {
        idUsuario: 4, nombre: 'Miguel Torres', nombreCorto: 'Miguel T.', iniciales: 'MT', horasSemana: 7, utilizacionPct: 18, nivel: 'baja',
        dias: [dia(0, [s(853, '0853', 'Agro', '08:00', '15:00', 'confirmado')], 7, 'optima'), dia(1, [], 0, 'libre'), dia(2, [], 0, 'libre'), dia(3, [], 0, 'libre'), dia(4, [], 0, 'libre')],
      },
    ];
    const conflictos: ConflictoAgenda[] = hayConflicto
      ? [{ clave: 'sol-1-860-861', tipo: 'solapamiento', titulo: 'Servicios cruzados', detalle: 'Juan Pérez tiene OS 0860 y OS 0861 el miércoles: se cruzan de 10:00 a 12:00.', fecha: f(2), idTecnico: 1, tecnico: 'Juan Pérez', idOsA: 860, numeroOsA: 'OS 0860-2026', idOsB: 861, numeroOsB: 'OS 0861-2026', puedeResolver: true, modo: 'directa' }]
      : [];
    return {
      desde: lunes, hasta: f(4),
      kpis: { conflictos: conflictos.length, servicios: tecnicos.reduce((a, t) => a + t.dias.reduce((b, x) => b + x.servicios.length, 0), 0), sobrecargados: hayConflicto ? 1 : 0, actualizado: '10:46', refrescoSegundos: 30 },
      tecnicos, conflictos,
    };
  },
  async detalle(c: Pick<ConflictoAgenda, 'tipo' | 'idTecnico' | 'idOsA' | 'idOsB'>): Promise<DetalleConflictoAgenda> {
    await esperar(300);
    const ag = await mockAgenda.agenda(null);
    const conflicto = ag.conflictos[0] ?? { clave: 'x', tipo: c.tipo, titulo: 'Servicios cruzados', detalle: null, fecha: null, idTecnico: c.idTecnico, tecnico: 'Juan Pérez', idOsA: c.idOsA, numeroOsA: null, idOsB: c.idOsB, numeroOsB: null, puedeResolver: true, modo: 'directa' };
    return {
      conflicto,
      servicios: [
        { idOs: 860, idProgramacion: 860, numeroOs: 'OS 0860-2026', tipo: 'OS', cliente: 'Alicorp', fecha: conflicto.fecha, horaInicio: '09:00', horaFin: '12:00', tipoServicio: 'Calibración', objetivo: false },
        { idOs: 861, idProgramacion: 861, numeroOs: 'OS 0861-2026', tipo: 'OS', cliente: 'Backus', fecha: conflicto.fecha, horaInicio: '10:00', horaFin: '12:30', tipoServicio: 'Mantenimiento', objetivo: true },
      ],
      sugerido: { idUsuario: 4, nombre: 'Miguel Torres', detalle: 'carga 18 % · SSOMA conforme' },
      motivos: [{ id: 1, nombre: 'Cruce de horario' }, { id: 2, nombre: 'Solicitud del cliente' }, { id: 3, nombre: 'Falta de personal' }, { id: 4, nombre: 'Otro' }],
      modo: 'directa',
      motivoSugerido: 'Cruce de horario del técnico Juan Pérez',
    };
  },
  async resolver(d: ResolverConflicto) {
    await esperar(400);
    conflictoResuelto = true;
    return { mensaje: d.opcion === 'reasignar' ? 'Técnico cambiado. Se avisó a los técnicos.' : 'Servicio reprogramado.', datos: { modo: 'directa', mensaje: 'Aplicado al instante.' } };
  },
};
