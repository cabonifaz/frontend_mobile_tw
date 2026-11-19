import { entorno } from '@/config/entorno';
import { solicitar } from './cliente';

/**
 * HU-35 — Viáticos y gastos del equipo (Jefe de Área).
 * Backend: GET api/movil/jefatura/viaticos · GET …/viaticos/{idOs} · PUT …/viaticos/{idOs}/asignacion
 *   → SP_ObtenerViaticosEquipoMovil, SP_ObtenerViaticoServicioEquipoMovil y SP_AsignarViaticoEquipoMovil (que delega en SP_GuardarViaticosProgramacion de la intranet, HU-45).
 * Los gastos se revisan con el mismo endpoint de Aprobaciones (HU-31): PUT api/movil/aprobaciones/gastos/{id} (aprobar · observar con comentario · rechazar con motivo).
 * Asignar y revisar exige el permiso de la intranet prog_aprobar_reprogramacion; el alcance sale de la regla Área + Rol. Todo exige conexión.
 * Depósito: el jefe puede marcar el viático «Ya depositado» desde la app (decisión del dueño); Contabilidad también puede hacerlo en la intranet.
 */
export type EstadoServicioViatico = 'por_revisar' | 'por_depositar' | 'al_dia' | 'cerrado';
export type ClaveConcepto = 'movilidad' | 'alimentacion' | 'alojamiento' | 'otros';
export type EstadoGastoEquipo = 'pendiente' | 'observado' | 'aprobado' | 'rechazado';

export interface KpisViaticosEquipo {
  asignado: number;
  rendido: number;
  porRevisar: number;
  actualizado: string | null;
  refrescoSegundos: number;
}

export interface ServicioViaticoEquipo {
  idOs: number;
  numeroOs: string;
  cliente: string | null;
  idProgramacion: number;
  /** Nombres de los técnicos separados por ", ". */
  tecnicos: string;
  nTecnicos: number;
  asignado: number;
  depositado: number;
  rendido: number;
  porRevisar: number;
  gastosPorRevisar: number;
  /** % rendido sobre lo asignado (0 a 100). */
  avance: number;
  estado: EstadoServicioViatico | string;
  puedeAsignar: boolean;
}

export interface ViaticosEquipo {
  kpis: KpisViaticosEquipo;
  servicios: ServicioViaticoEquipo[];
}

export interface LineaViatico {
  idGasto: number;
  concepto: string;
  clave: ClaveConcepto | string | null;
  monto: number;
  depositado: boolean;
}

export interface TecnicoViatico {
  idTecnico: number;
  nombre: string;
  principal: boolean;
  asignado: number;
  depositado: number;
  rendido: number;
  porRevisar: number;
  lineas: LineaViatico[];
}

export interface GastoViaticoEquipo {
  idGasto: number;
  idTecnico: number;
  tecnico: string;
  concepto: string;
  monto: number;
  estado: EstadoGastoEquipo | string;
  fecha: string | null;
  tieneComprobante: boolean;
  montoIa: number | null;
  coincideIa: boolean | null;
}

export interface CabeceraViaticoServicio {
  idOs: number;
  numeroOs: string;
  cliente: string | null;
  idProgramacion: number;
  cerrada: boolean;
  puedeAsignar: boolean;
  motivoNoAsignar: string | null;
  version: string;
  asignado: number;
  depositado: number;
  rendido: number;
  porRevisar: number;
}

export interface ViaticoServicio {
  cabecera: CabeceraViaticoServicio;
  tecnicos: TecnicoViatico[];
  gastos: GastoViaticoEquipo[];
}

export interface AsignarViatico {
  idTecnico: number;
  movilidad: number;
  alimentacion: number;
  alojamiento: number;
  otros: number;
  depositado: boolean;
  version: string | null;
}

export interface ResultadoAsignacion {
  total: number;
  depositado: boolean;
  notificados: number;
  version: string;
}

const base = '/api/movil/jefatura/viaticos';

export async function obtenerViaticosEquipo(token: string): Promise<ViaticosEquipo> {
  if (entorno.usarMock) return mockViaticos.lista();
  return (await solicitar<ViaticosEquipo>(base, { token })).datos!;
}

export async function obtenerViaticoServicio(token: string, idOs: number): Promise<ViaticoServicio> {
  if (entorno.usarMock) return mockViaticos.servicio(idOs);
  return (await solicitar<ViaticoServicio>(`${base}/${encodeURIComponent(String(idOs))}`, { token })).datos!;
}

/** PUT …/asignacion: asigna (o corrige) el viático de un técnico por concepto; un monto en 0 quita esa línea si no está depositada. El técnico lo ve al instante en su app. */
export async function asignarViaticoEquipo(token: string, idOs: number, d: AsignarViatico): Promise<{ mensaje: string; datos: ResultadoAsignacion | null }> {
  if (entorno.usarMock) return mockViaticos.asignar(idOs, d);
  const r = await solicitar<ResultadoAsignacion>(`${base}/${encodeURIComponent(String(idOs))}/asignacion`, {
    token,
    metodo: 'PUT',
    cuerpo: {
      idTecnico: d.idTecnico,
      movilidad: d.movilidad,
      alimentacion: d.alimentacion,
      alojamiento: d.alojamiento,
      otros: d.otros,
      depositado: d.depositado,
      version: d.version,
    },
  });
  return { mensaje: r.mensaje, datos: r.datos ?? null };
}

// ── Modo demostración (EXPO_PUBLIC_USE_MOCK=true) ──────────────────────────────────────────────────────────────────────

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

const CLAVES: { clave: ClaveConcepto; concepto: string }[] = [
  { clave: 'movilidad', concepto: 'Movilidad' },
  { clave: 'alimentacion', concepto: 'Alimentación' },
  { clave: 'alojamiento', concepto: 'Alojamiento' },
  { clave: 'otros', concepto: 'Otros' },
];

interface TecnicoDemo {
  idTecnico: number;
  nombre: string;
  principal: boolean;
  montos: Record<ClaveConcepto, number>;
  depositado: boolean;
  rendido: number;
}
interface ServicioDemo {
  idOs: number;
  numeroOs: string;
  cliente: string;
  idProgramacion: number;
  tecnicos: TecnicoDemo[];
  gastos: GastoViaticoEquipo[];
}

const montos0 = { movilidad: 0, alimentacion: 0, alojamiento: 0, otros: 0 };
let serviciosDemo: ServicioDemo[] = [
  {
    idOs: 845, numeroOs: 'OS 0845-2026', cliente: 'Molinos del Sur', idProgramacion: 1,
    tecnicos: [{ idTecnico: 1, nombre: 'Juan Pérez', principal: true, montos: { movilidad: 150, alimentacion: 150, alojamiento: 100, otros: 50 }, depositado: true, rendido: 267.5 }],
    gastos: [
      { idGasto: 11, idTecnico: 1, tecnico: 'Juan Pérez', concepto: 'Peaje', monto: 22.5, estado: 'pendiente', fecha: '2026-11-17', tieneComprobante: true, montoIa: 12.5, coincideIa: false },
      { idGasto: 12, idTecnico: 1, tecnico: 'Juan Pérez', concepto: 'Almuerzo', monto: 35, estado: 'pendiente', fecha: '2026-11-17', tieneComprobante: true, montoIa: 35, coincideIa: true },
      { idGasto: 13, idTecnico: 1, tecnico: 'Juan Pérez', concepto: 'Taxi', monto: 210, estado: 'aprobado', fecha: '2026-11-16', tieneComprobante: true, montoIa: 210, coincideIa: true },
    ],
  },
  {
    idOs: 849, numeroOs: 'OS 0849-2026', cliente: 'Aceros del Pacífico', idProgramacion: 2,
    tecnicos: [{ idTecnico: 2, nombre: 'Joao Gutiérrez', principal: true, montos: { movilidad: 150, alimentacion: 100, alojamiento: 50, otros: 0 }, depositado: true, rendido: 180 }],
    gastos: [{ idGasto: 21, idTecnico: 2, tecnico: 'Joao Gutiérrez', concepto: 'Peaje', monto: 22.5, estado: 'pendiente', fecha: '2026-11-17', tieneComprobante: true, montoIa: 12.5, coincideIa: false }],
  },
  {
    idOs: 853, numeroOs: 'OS 0853-2026', cliente: 'Agroindustrias Norte', idProgramacion: 3,
    tecnicos: [{ idTecnico: 3, nombre: 'Miguel Torres', principal: true, montos: { movilidad: 150, alimentacion: 120, alojamiento: 80, otros: 0 }, depositado: false, rendido: 0 }],
    gastos: [],
  },
];

const sumar = (m: Record<ClaveConcepto, number>) => m.movilidad + m.alimentacion + m.alojamiento + m.otros;
const redondear = (n: number) => Math.round(n * 100) / 100;

function resumenServicio(s: ServicioDemo): ServicioViaticoEquipo {
  const asignado = s.tecnicos.reduce((a, t) => a + sumar(t.montos), 0);
  const depositado = s.tecnicos.reduce((a, t) => a + (t.depositado ? sumar(t.montos) : 0), 0);
  const rendido = s.tecnicos.reduce((a, t) => a + t.rendido, 0);
  const pendientes = s.gastos.filter((g) => g.estado === 'pendiente');
  const porRevisar = pendientes.reduce((a, g) => a + g.monto, 0);
  return {
    idOs: s.idOs, numeroOs: s.numeroOs, cliente: s.cliente, idProgramacion: s.idProgramacion, tecnicos: s.tecnicos.map((t) => t.nombre).join(', '), nTecnicos: s.tecnicos.length,
    asignado, depositado, rendido, porRevisar, gastosPorRevisar: pendientes.length,
    avance: asignado > 0 ? Math.min(100, Math.round((rendido / asignado) * 100)) : 0,
    estado: pendientes.length > 0 ? 'por_revisar' : depositado < asignado ? 'por_depositar' : 'al_dia',
    puedeAsignar: true,
  };
}

const mockViaticos = {
  async lista(): Promise<ViaticosEquipo> {
    await esperar(300);
    const servicios = serviciosDemo.map(resumenServicio);
    return {
      kpis: {
        asignado: servicios.reduce((a, s) => a + s.asignado, 0),
        rendido: servicios.reduce((a, s) => a + s.rendido, 0),
        porRevisar: servicios.reduce((a, s) => a + s.porRevisar, 0),
        actualizado: '10:46',
        refrescoSegundos: 30,
      },
      servicios,
    };
  },
  async servicio(idOs: number): Promise<ViaticoServicio> {
    await esperar(300);
    const s = serviciosDemo.find((x) => x.idOs === idOs) ?? serviciosDemo[0];
    const r = resumenServicio(s);
    return {
      cabecera: {
        idOs: s.idOs, numeroOs: s.numeroOs, cliente: s.cliente, idProgramacion: s.idProgramacion, cerrada: false, puedeAsignar: true, motivoNoAsignar: null, version: 'demo',
        asignado: r.asignado, depositado: r.depositado, rendido: r.rendido, porRevisar: r.porRevisar,
      },
      tecnicos: s.tecnicos.map((t) => ({
        idTecnico: t.idTecnico, nombre: t.nombre, principal: t.principal, asignado: sumar(t.montos), depositado: t.depositado ? sumar(t.montos) : 0, rendido: t.rendido,
        porRevisar: s.gastos.filter((g) => g.idTecnico === t.idTecnico && g.estado === 'pendiente').reduce((a, g) => a + g.monto, 0),
        lineas: CLAVES.filter((c) => t.montos[c.clave] > 0).map((c, i) => ({ idGasto: t.idTecnico * 100 + i, concepto: c.concepto, clave: c.clave, monto: t.montos[c.clave], depositado: t.depositado })),
      })),
      gastos: s.gastos,
    };
  },
  async asignar(idOs: number, d: AsignarViatico) {
    await esperar(400);
    serviciosDemo = serviciosDemo.map((s) =>
      s.idOs !== idOs
        ? s
        : {
            ...s,
            tecnicos: s.tecnicos.map((t) =>
              t.idTecnico !== d.idTecnico
                ? t
                : { ...t, montos: { ...montos0, movilidad: d.movilidad, alimentacion: d.alimentacion, alojamiento: d.alojamiento, otros: d.otros }, depositado: d.depositado },
            ),
          },
    );
    const total = redondear(d.movilidad + d.alimentacion + d.alojamiento + d.otros);
    return { mensaje: 'Viático asignado. El técnico lo ve al instante en su app.', datos: { total, depositado: d.depositado, notificados: 1, version: 'demo' } };
  },
};
