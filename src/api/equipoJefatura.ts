import { entorno } from '@/config/entorno';
import { solicitar } from './cliente';

/**
 * HU-36 — Mi equipo: asistencia y ubicación (Jefe de Área).
 * Backend: GET api/movil/jefatura/equipo · GET …/equipo/tecnicos/{id} · GET …/equipo/tecnicos/{id}/horas?mes=yyyy-MM
 *   → SP_ObtenerEquipoJefaturaMovil, SP_ObtenerFichaEquipoTecnicoMovil y SP_ObtenerHorasTecnicoMovil (el historial se guarda en tecnico_horas_dia y tecnico_horas_mes).
 * El estado de cada técnico sale del Reloj Marcador (HU-20). Alcance por Área + Rol: las áreas que ven todo y los Administradores, todos los técnicos; el Supervisor de
 * Servicio Técnico / Metrología, los de su área. Las horas contabilizadas son el tiempo real en servicio (desde que inicia hasta que finaliza cada OS u OM).
 * Todo exige conexión.
 */
export type EstadoEquipo = 'en_labores' | 'refrigerio' | 'tardanza' | 'sin_marcar' | 'finalizada';

export interface KpisEquipo {
  enLabores: number;
  refrigerio: number;
  tardanza: number;
  sinMarcar: number;
  finalizaron: number;
  total: number;
  /** En labores + tardanza + refrigerio: el «N de M en labores» del menú. Opcional: un back anterior no lo envía. */
  enJornada?: number;
  actualizado: string | null;
  refrescoSegundos: number;
}

export interface TecnicoEquipo {
  idUsuario: number;
  nombre: string;
  iniciales: string;
  cargo: string | null;
  estado: EstadoEquipo | string;
  /** "En labores · 07:41", "En refrigerio desde 10:30 · vuelve 11:15", "Sin marcar inicio de labores". */
  detalle: string;
  horaInicio: string | null;
  minutosTardanza: number | null;
  idOs: number | null;
  numeroOs: string | null;
  tipoOs: 'OS' | 'OM' | string | null;
  estadoServicio: string | null;
  lugar: string | null;
  motivoSinServicio: string | null;
  latitud: number | null;
  longitud: number | null;
  minutosUbicacion: number | null;
}

export interface EquipoJefatura {
  kpis: KpisEquipo;
  tecnicos: TecnicoEquipo[];
}

export interface SsomaTecnico {
  /** conforme | por_vencer | incompleto | pendiente | bloqueado */
  estado: string | null;
  detalle: string | null;
}

export interface MarcacionEquipo {
  tipo: string;
  titulo: string;
  hora: string | null;
  detalle: string | null;
  estado: 'hecho' | 'pendiente' | string;
  tono: 'verde' | 'naranja' | 'rojo' | 'gris' | string;
}

export interface CargaDia {
  fecha: string;
  etiqueta: string;
  horas: number;
  porcentaje: number;
}

export interface CargaSemana {
  desde: string;
  hasta: string;
  dias: CargaDia[];
  utilizacionPct: number;
  nivel: 'baja' | 'normal' | 'alta' | string;
  horasPlanificadas: number;
  horasCapacidad: number;
}

export interface FichaEquipoTecnico {
  tecnico: TecnicoEquipo;
  telefono: string | null;
  area: string | null;
  ssoma: SsomaTecnico;
  marcaciones: MarcacionEquipo[];
  carga: CargaSemana;
}

export interface HoraServicio {
  idOs: number;
  numero: string;
  inicio: string;
  fin: string | null;
  minutos: number;
}

export interface HoraDia {
  fecha: string;
  minutos: number;
  servicios: number;
  inicio: string | null;
  fin: string | null;
  /** El servicio se inició y no se registró su fin: ese día no se inventa el cierre. */
  sinCierre: boolean;
  detalle: HoraServicio[];
}

export interface HoraSemana {
  desde: string;
  hasta: string;
  minutos: number;
  diasTrabajados: number;
}

export interface HoraMes {
  mes: string;
  minutos: number;
  diasTrabajados: number;
  servicios: number;
  cerrado: boolean;
}

export interface HorasTecnico {
  tecnico: TecnicoEquipo;
  mes: string;
  dias: HoraDia[];
  semanas: HoraSemana[];
  totalMinutos: number;
  diasTrabajados: number;
  servicios: number;
  cerrado: boolean;
  historial: HoraMes[];
}

const base = '/api/movil/jefatura/equipo';

export async function obtenerEquipo(token: string): Promise<EquipoJefatura> {
  if (entorno.usarMock) return mockEquipo.lista();
  return (await solicitar<EquipoJefatura>(base, { token })).datos!;
}

export async function obtenerFichaTecnico(token: string, idTecnico: number): Promise<FichaEquipoTecnico> {
  if (entorno.usarMock) return mockEquipo.ficha(idTecnico);
  return (await solicitar<FichaEquipoTecnico>(`${base}/tecnicos/${encodeURIComponent(String(idTecnico))}`, { token })).datos!;
}

export async function obtenerHorasTecnico(token: string, idTecnico: number, mes: string): Promise<HorasTecnico> {
  if (entorno.usarMock) return mockEquipo.horas(idTecnico, mes);
  return (await solicitar<HorasTecnico>(`${base}/tecnicos/${encodeURIComponent(String(idTecnico))}/horas?mes=${encodeURIComponent(mes)}`, { token })).datos!;
}

// ── Modo demostración (EXPO_PUBLIC_USE_MOCK=true) ──────────────────────────────────────────────────────────────────────

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

const sinPos = { latitud: null, longitud: null, minutosUbicacion: null };
const TECNICOS_DEMO: TecnicoEquipo[] = [
  { idUsuario: 1, nombre: 'Juan Pérez', iniciales: 'JP', cargo: 'Técnico de Campo', estado: 'en_labores', detalle: 'En labores · 07:41', horaInicio: '07:41', minutosTardanza: null, idOs: 845, numeroOs: 'OS 0845-2026', tipoOs: 'OS', estadoServicio: 'en_ejecucion', lugar: 'Planta Ate', motivoSinServicio: null, latitud: -12.03, longitud: -76.95, minutosUbicacion: 2 },
  { idUsuario: 2, nombre: 'Joao Gutiérrez', iniciales: 'JG', cargo: 'Técnico de Campo', estado: 'tardanza', detalle: 'En labores · 07:58 (tardanza 13 min)', horaInicio: '07:58', minutosTardanza: 13, idOs: 849, numeroOs: 'OS 0849-2026', tipoOs: 'OS', estadoServicio: 'en_ruta', lugar: 'Aceros del Pacífico', motivoSinServicio: null, ...sinPos },
  { idUsuario: 3, nombre: 'Luis Medina', iniciales: 'LM', cargo: 'Técnico de Campo', estado: 'refrigerio', detalle: 'En refrigerio desde 10:30 · vuelve 11:15', horaInicio: '07:44', minutosTardanza: null, idOs: 851, numeroOs: 'OS 0851-2026', tipoOs: 'OS', estadoServicio: 'en_ejecucion', lugar: 'Lurín', motivoSinServicio: null, ...sinPos },
  { idUsuario: 4, nombre: 'Miguel Torres', iniciales: 'MT', cargo: 'Técnico de Campo', estado: 'en_labores', detalle: 'En labores · 07:35', horaInicio: '07:35', minutosTardanza: null, idOs: 853, numeroOs: 'OS 0853-2026', tipoOs: 'OS', estadoServicio: 'en_ruta', lugar: 'Agroindustrias Norte', motivoSinServicio: null, ...sinPos },
  { idUsuario: 5, nombre: 'Diego Huamán', iniciales: 'DH', cargo: 'Técnico de Campo', estado: 'sin_marcar', detalle: 'Sin marcar inicio de labores', horaInicio: null, minutosTardanza: null, idOs: null, numeroOs: null, tipoOs: null, estadoServicio: null, lugar: null, motivoSinServicio: 'SCTR vencido', ...sinPos },
];

function minutosDe(hora: string): number {
  const [h, m] = hora.split(':').map(Number);
  return h * 60 + m;
}

/** Horas de ejemplo: días de semana del mes pedido hasta hoy, con un patrón estable (sin azar). */
function horasDemo(mes: string): HoraDia[] {
  const [a, m] = mes.split('-').map(Number);
  const hoy = new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 10);
  const dias: HoraDia[] = [];
  for (let d = 1; d <= 31; d++) {
    const f = new Date(Date.UTC(a, m - 1, d));
    if (f.getUTCMonth() !== m - 1) break;
    const fecha = f.toISOString().slice(0, 10);
    if (fecha > hoy || [0, 6].includes(f.getUTCDay())) continue;
    const base = 6 + ((d * 7) % 5); // 6 a 10 h
    const inicio = '08:00';
    const finMin = minutosDe(inicio) + base * 60 + ((d * 11) % 4) * 15;
    const fin = `${String(Math.floor(finMin / 60)).padStart(2, '0')}:${String(finMin % 60).padStart(2, '0')}`;
    dias.push({
      fecha, minutos: finMin - minutosDe(inicio), servicios: 1 + (d % 2), inicio, fin, sinCierre: false,
      detalle: [{ idOs: 800 + d, numero: `OS 08${String(d).padStart(2, '0')}-2026`, inicio, fin, minutos: finMin - minutosDe(inicio) }],
    });
  }
  return dias;
}

const mockEquipo = {
  async lista(): Promise<EquipoJefatura> {
    await esperar(300);
    const c = (e: string) => TECNICOS_DEMO.filter((t) => t.estado === e).length;
    return {
      kpis: { enLabores: c('en_labores'), refrigerio: c('refrigerio'), tardanza: c('tardanza'), sinMarcar: c('sin_marcar'), finalizaron: 0, total: TECNICOS_DEMO.length, actualizado: '10:46', refrescoSegundos: 30 },
      tecnicos: TECNICOS_DEMO,
    };
  },
  async ficha(idTecnico: number): Promise<FichaEquipoTecnico> {
    await esperar(300);
    const t = TECNICOS_DEMO.find((x) => x.idUsuario === idTecnico) ?? TECNICOS_DEMO[1];
    return {
      tecnico: t,
      telefono: '987654321',
      area: 'Servicio Técnico',
      ssoma: { estado: t.motivoSinServicio ? 'bloqueado' : 'conforme', detalle: t.motivoSinServicio },
      marcaciones: [
        { tipo: 'inicio_labores', titulo: 'Inicio de labores', hora: t.horaInicio, detalle: t.minutosTardanza ? `Tardanza ${t.minutosTardanza} min (programado 07:45) · Sede TW` : 'A tiempo · Sede TW', estado: t.horaInicio ? 'hecho' : 'pendiente', tono: t.minutosTardanza ? 'naranja' : t.horaInicio ? 'verde' : 'gris' },
        { tipo: 'demora', titulo: 'Demora registrada', hora: '08:40', detalle: 'Ingreso a planta +35 min', estado: 'hecho', tono: 'naranja' },
        { tipo: 'refrigerio', titulo: 'Refrigerio', hora: null, detalle: null, estado: 'pendiente', tono: 'gris' },
      ],
      carga: {
        desde: '2026-11-16', hasta: '2026-11-20', utilizacionPct: 92, nivel: 'alta', horasPlanificadas: 36, horasCapacidad: 40,
        dias: [
          { fecha: '2026-11-16', etiqueta: 'Lun', horas: 8, porcentaje: 80 }, { fecha: '2026-11-17', etiqueta: 'Mar', horas: 9, porcentaje: 90 },
          { fecha: '2026-11-18', etiqueta: 'Mié', horas: 10, porcentaje: 100 }, { fecha: '2026-11-19', etiqueta: 'Jue', horas: 5, porcentaje: 50 }, { fecha: '2026-11-20', etiqueta: 'Vie', horas: 4, porcentaje: 40 },
        ],
      },
    };
  },
  async horas(idTecnico: number, mes: string): Promise<HorasTecnico> {
    await esperar(300);
    const t = TECNICOS_DEMO.find((x) => x.idUsuario === idTecnico) ?? TECNICOS_DEMO[1];
    const dias = horasDemo(mes);
    const lunesDe = (f: string) => {
      const d = new Date(`${f}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
      return d.toISOString().slice(0, 10);
    };
    const grupos = new Map<string, HoraDia[]>();
    for (const x of dias) grupos.set(lunesDe(x.fecha), [...(grupos.get(lunesDe(x.fecha)) ?? []), x]);
    const semanas: HoraSemana[] = [...grupos.entries()].map(([desde, ds]) => {
      const h = new Date(`${desde}T00:00:00Z`);
      h.setUTCDate(h.getUTCDate() + 6);
      return { desde, hasta: h.toISOString().slice(0, 10), minutos: ds.reduce((a, x) => a + x.minutos, 0), diasTrabajados: ds.length };
    });
    const total = dias.reduce((a, x) => a + x.minutos, 0);
    return {
      tecnico: t, mes, dias, semanas, totalMinutos: total, diasTrabajados: dias.length, servicios: dias.reduce((a, x) => a + x.servicios, 0), cerrado: false,
      historial: [
        { mes, minutos: total, diasTrabajados: dias.length, servicios: dias.reduce((a, x) => a + x.servicios, 0), cerrado: false },
        { mes: '2026-10', minutos: 9840, diasTrabajados: 22, servicios: 31, cerrado: true },
        { mes: '2026-09', minutos: 9420, diasTrabajados: 21, servicios: 28, cerrado: true },
      ],
    };
  },
};
