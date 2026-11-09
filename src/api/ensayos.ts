import { solicitar } from './cliente';
import { entorno } from '@/config/entorno';
import { conRespaldo, type ConRespaldo } from './respaldo';
import { calcularPesaje, empDe, evaluar, type FormaPlato } from '@/utilidades/ensayos';

/**
 * HU-10 — Ensayos y Calibración.
 *   GET  api/movil/servicios/{idOs}/equipos/{idOsEquipo}/ensayos          → SP_ObtenerEnsayosMovil
 *   PUT  api/movil/servicios/{idOs}/equipos/{idOsEquipo}/ensayos          → SP_GuardarEnsayosMovil (devuelve los ensayos actualizados)
 *   POST api/movil/servicios/{idOs}/equipos/{idOsEquipo}/ensayos/llamada  → SP_RegistrarLlamadaEnsayoMovil
 * La app envía solo la carga (L) y la indicación (I); el back calcula el error, el EMP y la conformidad y vuelve a evaluar al guardar.
 */

export interface CabeceraEnsayos {
  idOs: number;
  idOsEquipo: number;
  numeroOs: string;
  nombre: string;
  numero: number;
  unidad: string;
  clase: string | null;
  capMaxima: number | null;
  d: number | null;
  e: number | null;
  /** El equipo tiene clase de exactitud y e: sin eso no hay EMP. */
  evaluable: boolean;
  formaPlato: FormaPlato | string;
  motivoErrorCritico: string | null;
  /** El técnico guardó "de todas formas" con un motivo. */
  aceptaError: boolean;
  finalizado: boolean;
  finalizadoEn: string | null;
  puedeRegistrar: boolean;
  areaEncargado: string | null;
}

interface LecturaGuardada {
  carga: number;
  indicacion: number | null;
  error: number | null;
  emp: number | null;
  resultado: 'conforme' | 'no_conforme' | null;
  critico: boolean;
}

export interface LecturaPesaje extends LecturaGuardada {
  orden: number;
}

export interface LecturaExcentricidad extends LecturaGuardada {
  grupo: number;
  /** 1 = centro. */
  posicion: number;
}

export interface EncargadoEnsayo {
  idUsuario: number;
  nombre: string;
  cargo: string | null;
  telefono: string | null;
  area: string | null;
}

export interface Ensayos {
  cabecera: CabeceraEnsayos;
  pesaje: LecturaPesaje[];
  excentricidad: LecturaExcentricidad[];
  encargado: EncargadoEnsayo | null;
}

export interface GuardarEnsayos {
  formaPlato: FormaPlato;
  pesaje: { carga: number; indicacion: number | null }[];
  excentricidad: { carga: number; lecturas: (number | null)[] }[];
  /** "Guardar de todas formas": el motivo del error crítico. */
  motivoErrorCritico?: string;
  /** Cierra la etapa (exige todo completo y, con error crítico, el motivo). */
  finalizar: boolean;
}

const ruta = (idOs: number, idOsEquipo: number) =>
  `/api/movil/servicios/${encodeURIComponent(String(idOs))}/equipos/${encodeURIComponent(String(idOsEquipo))}/ensayos`;

export async function obtenerEnsayos(token: string, idOs: number, idOsEquipo: number): Promise<Ensayos> {
  if (entorno.usarMock) return mockEnsayos.obtener(idOs, idOsEquipo);
  return (await solicitar<Ensayos>(ruta(idOs, idOsEquipo), { token })).datos!;
}

/** Sin conexión muestra lo último guardado (para ver las lecturas); guardar sí exige conexión. */
export async function obtenerEnsayosConRespaldo(token: string, idUsuario: number, idOs: number, idOsEquipo: number): Promise<ConRespaldo<Ensayos>> {
  if (entorno.usarMock) return { datos: await mockEnsayos.obtener(idOs, idOsEquipo), sinConexion: false, guardadoEn: new Date() };
  return conRespaldo(idUsuario, `ensayos.${idOs}.${idOsEquipo}`, () => obtenerEnsayos(token, idOs, idOsEquipo));
}

export async function guardarEnsayos(token: string, idOs: number, idOsEquipo: number, g: GuardarEnsayos): Promise<{ mensaje: string; ensayos: Ensayos | null }> {
  if (entorno.usarMock) return mockEnsayos.guardar(idOs, idOsEquipo, g);
  const r = await solicitar<Ensayos>(ruta(idOs, idOsEquipo), { token, metodo: 'PUT', cuerpo: g });
  return { mensaje: r.mensaje, ensayos: r.datos ?? null };
}

export interface ResultadoLlamada {
  nombre: string;
  cargo: string | null;
  telefono: string;
  area: string | null;
}

/** Deja constancia de la llamada en el ensayo (hora y error reportado) y devuelve a quién llamar. */
export async function registrarLlamadaEnsayo(token: string, idOs: number, idOsEquipo: number, detalle: string): Promise<{ mensaje: string; datos: ResultadoLlamada | null }> {
  if (entorno.usarMock) return mockEnsayos.llamar();
  const r = await solicitar<ResultadoLlamada>(`${ruta(idOs, idOsEquipo)}/llamada`, { token, metodo: 'POST', cuerpo: { detalle } });
  return { mensaje: r.mensaje, datos: r.datos ?? null };
}

// ── Modo demo (EXPO_PUBLIC_USE_MOCK=true): mismo cálculo que el back, en memoria ──
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));
const demo = {
  g: null as GuardarEnsayos | null,
  finalizado: false,
  motivo: null as string | null,
};
const CLASE = 'III';
const E = 20;
const CAP = 80_000;

function ensayosDemo(idOs: number, idOsEquipo: number): Ensayos {
  const g = demo.g;
  const pesaje: LecturaPesaje[] = (g?.pesaje ?? []).map((p, i) => {
    const ev = evaluar(CLASE, E, p.carga, p.indicacion);
    return { orden: i + 1, carga: p.carga, indicacion: p.indicacion, error: ev.error, emp: ev.emp, resultado: ev.resultado, critico: ev.resultado === 'no_conforme' };
  });
  const excentricidad: LecturaExcentricidad[] = (g?.excentricidad ?? []).flatMap((c, gi) =>
    c.lecturas.map((l, pi) => {
      const ev = evaluar(CLASE, E, c.carga, l);
      return { grupo: gi + 1, posicion: pi + 1, carga: c.carga, indicacion: l, error: ev.error, emp: ev.emp, resultado: ev.resultado, critico: ev.resultado === 'no_conforme' };
    }),
  );
  return {
    cabecera: {
      idOs, idOsEquipo, numeroOs: 'OS-000791', nombre: 'Báscula camionera', numero: 1, unidad: 'kg', clase: CLASE, capMaxima: CAP, d: 10, e: E, evaluable: true,
      formaPlato: g?.formaPlato ?? 'rectangular', motivoErrorCritico: demo.motivo, aceptaError: demo.motivo !== null, finalizado: demo.finalizado,
      finalizadoEn: demo.finalizado ? new Date(Date.now() - 5 * 3_600_000).toISOString().slice(0, 19) : null, puedeRegistrar: true, areaEncargado: 'metrologia',
    },
    pesaje,
    excentricidad,
    encargado: { idUsuario: 9, nombre: 'Carlos Ramos', cargo: 'Jefe de Metrología', telefono: '987 456 123', area: 'metrologia' },
  };
}

const mockEnsayos = {
  async obtener(idOs: number, idOsEquipo: number): Promise<Ensayos> {
    await esperar(250);
    return ensayosDemo(idOs, idOsEquipo);
  },
  async guardar(idOs: number, idOsEquipo: number, g: GuardarEnsayos) {
    await esperar(300);
    const criticos = calcularPesaje(CLASE, E, g.pesaje.map((p) => ({ carga: String(p.carga), indicacion: p.indicacion == null ? '' : String(p.indicacion) }))).some((f) => f.resultado === 'no_conforme')
      || g.excentricidad.some((c) => c.lecturas.some((l) => empDe(CLASE, E, c.carga) !== null && l !== null && evaluar(CLASE, E, c.carga, l).resultado === 'no_conforme'));
    if (g.finalizar && criticos && !g.motivoErrorCritico) throw new Error('Hay un error crítico: corrige la lectura, repite el ensayo o usa "Guardar de todas formas" con un motivo.');
    demo.g = g;
    demo.motivo = criticos ? (g.motivoErrorCritico ?? null) : null;
    demo.finalizado = g.finalizar;
    return { mensaje: g.finalizar ? 'Ensayo finalizado.' : 'Ensayo guardado.', ensayos: ensayosDemo(idOs, idOsEquipo) };
  },
  async llamar() {
    await esperar(200);
    return { mensaje: 'Llamada registrada en el ensayo.', datos: { nombre: 'Carlos Ramos', cargo: 'Jefe de Metrología', telefono: '987 456 123', area: 'metrologia' } };
  },
};
