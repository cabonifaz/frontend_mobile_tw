import type { CabeceraInforme, CuerpoFalla, EstadoEquipoFinal, Falla, GuardarCabecera, PruebasGenerales, Severidad, TipoPrueba } from '@/api/informe';
import { evaluar, formatoError, formatoMiles, leerLectura } from './ensayos';

/**
 * HU-15 — Reglas de pantalla de la Cabecera del informe. El servidor valida y calcula todo al guardar (mismos límites y mensajes en
 * SP_GuardarCabeceraInformeMovil); aquí se arma lo que se digita, se muestra el error E = I − L al momento y se calcula el progreso de cada pestaña.
 */

export const SEVERIDADES: { valor: Severidad; texto: string }[] = [
  { valor: 'baja', texto: 'Baja' },
  { valor: 'media', texto: 'Media' },
  { valor: 'alta', texto: 'Alta' },
  { valor: 'critica', texto: 'Crítica' },
];

export const ESTADOS_EQUIPO: { valor: EstadoEquipoFinal; texto: string }[] = [
  { valor: 'operativo', texto: 'Operativo' },
  { valor: 'con_observaciones', texto: 'Con observaciones' },
  { valor: 'inoperativo', texto: 'Inoperativo' },
];

export const TIPOS_PRUEBA: { valor: TipoPrueba; texto: string }[] = [
  { valor: 'repetibilidad', texto: 'Repetibilidad' },
  { valor: 'pesaje', texto: 'Pesaje' },
  { valor: 'excentricidad', texto: 'Excentricidad' },
];

export const MAX_RECOMENDACIONES = 20;
export const MAX_FALLAS = 15;
export const MAX_LECTURAS_PRUEBA = 12;
export const MAX_FOTOS_FALLA = 5;
export const MAX_CELDAS = 12;
export const MIN_DESCRIPCION_FALLA = 5;
export const MAX_DESCRIPCION_FALLA = 1000;
export const MAX_RECOMENDACION = 200;
export const MAX_COMENTARIO_PRUEBAS = 500;

export const textoSeveridad = (s: string | null | undefined) => SEVERIDADES.find((x) => x.valor === s)?.texto ?? '—';
export const textoEstadoEquipo = (s: string | null | undefined) => ESTADOS_EQUIPO.find((x) => x.valor === s)?.texto ?? '—';
export const textoTipoPrueba = (s: string | null | undefined) => TIPOS_PRUEBA.find((x) => x.valor === s)?.texto ?? '—';

// ── Falla que se está editando ──────────────────────────────────────────────────────────────────

export interface LecturaEditable {
  /** Posición del plato (solo excentricidad: 1 centro, 2 a 5 esquinas). */
  posicion: number | null;
  /** Lo que digita el técnico, tal cual. */
  carga: string;
  indicacion: string;
}

export interface FallaEditable {
  clasificacion: string | null;
  componente: string | null;
  severidad: Severidad | null;
  descripcion: string;
  fotos: number[];
  tipo: TipoPrueba;
  lecturas: LecturaEditable[];
}

/** Lecturas iniciales según el tipo de prueba: repetibilidad (3 con la misma carga), pesaje (1) o excentricidad (centro y una esquina). */
export function lecturasIniciales(tipo: TipoPrueba): LecturaEditable[] {
  if (tipo === 'repetibilidad') return [0, 1, 2].map(() => ({ posicion: null, carga: '', indicacion: '' }));
  if (tipo === 'excentricidad') return [1, 2].map((p) => ({ posicion: p, carga: '', indicacion: '' }));
  return [{ posicion: null, carga: '', indicacion: '' }];
}

export function fallaVacia(): FallaEditable {
  return { clasificacion: null, componente: null, severidad: null, descripcion: '', fotos: [], tipo: 'repetibilidad', lecturas: lecturasIniciales('repetibilidad') };
}

/** Una falla guardada → lo editable (la prueba de un solo tipo: el del primer registro). */
export function fallaDesde(f: Falla): FallaEditable {
  const tipo = (f.pruebas[0]?.tipo as TipoPrueba | undefined) ?? 'repetibilidad';
  const lecturas = f.pruebas.filter((p) => p.tipo === tipo).map((p) => ({ posicion: p.posicion, carga: String(p.carga), indicacion: String(p.indicacion) }));
  return {
    clasificacion: f.clasificacion,
    componente: f.componente,
    severidad: (f.severidad as Severidad) ?? null,
    descripcion: f.descripcion,
    fotos: [...f.fotos],
    tipo,
    lecturas: lecturas.length > 0 ? lecturas : lecturasIniciales(tipo),
  };
}

/** Cambia el tipo de prueba: las lecturas vuelven a empezar (cada tipo se digita distinto). */
export function conTipo(f: FallaEditable, tipo: TipoPrueba): FallaEditable {
  return tipo === f.tipo ? f : { ...f, tipo, lecturas: lecturasIniciales(tipo) };
}

/** En repetibilidad todas las lecturas comparten la misma carga: al digitar la de la primera se copia a las demás. */
export function conCarga(f: FallaEditable, indice: number, texto: string): FallaEditable {
  return { ...f, lecturas: f.lecturas.map((l, i) => (i === indice || (f.tipo === 'repetibilidad' && indice === 0) ? { ...l, carga: texto } : l)) };
}

export interface LecturaCalculada {
  carga: number | null;
  indicacion: number | null;
  error: number | null;
  emp: number | null;
  resultado: 'conforme' | 'no_conforme' | null;
}

/** E = I − L, EMP y conformidad de cada lectura digitada (la misma cuenta que hace el servidor al guardar). */
export function calcularLecturas(clase: string | null | undefined, e: number | null | undefined, lecturas: LecturaEditable[]): LecturaCalculada[] {
  return lecturas.map((l) => {
    const carga = leerLectura(l.carga);
    const indicacion = leerLectura(l.indicacion);
    const r = evaluar(clase, e, carga, indicacion);
    return { carga, indicacion, error: r.error, emp: r.emp, resultado: r.resultado };
  });
}

/** Lo que dice la cuenta bajo la tabla de la prueba, para que el técnico confirme que la prueba justifica la falla. */
export function notaPrueba(tipo: TipoPrueba, filas: LecturaCalculada[]): string {
  if (filas.every((f) => f.resultado === null)) return 'El sistema calcula E y marca las lecturas fuera de EMP como evidencia de la falla.';
  const fuera = filas.some((f) => f.resultado === 'no_conforme');
  if (!fuera) return 'Todas las lecturas están dentro del EMP: confirma que esta prueba justifica la falla.';
  if (tipo === 'repetibilidad') return 'Lecturas inestables con la misma carga: confirma la falla.';
  if (tipo === 'excentricidad') return 'Desviación en una posición del plato: confirma la falla.';
  return 'Lectura fuera de EMP en el pesaje: confirma la falla.';
}

/** Mensaje de lo que falta o está mal en la falla; null si se puede guardar. REGLA de la HU-15: cada falla exige una prueba que la justifique. */
export function errorFalla(f: FallaEditable): string | null {
  if (!f.clasificacion) return 'Elige la clasificación de la falla.';
  if (!f.componente) return 'Elige el componente de la falla.';
  if (!f.severidad) return 'Elige la severidad de la falla (Baja, Media, Alta o Crítica).';
  const d = f.descripcion.trim();
  if (d.length < MIN_DESCRIPCION_FALLA) return `Describe la falla (mínimo ${MIN_DESCRIPCION_FALLA} caracteres).`;
  if (d.length > MAX_DESCRIPCION_FALLA) return `La descripción puede tener hasta ${MAX_DESCRIPCION_FALLA} caracteres.`;
  if (f.lecturas.length === 0) return 'Agrega la prueba que justifica la falla.';
  if (f.lecturas.length > MAX_LECTURAS_PRUEBA) return `La prueba admite hasta ${MAX_LECTURAS_PRUEBA} lecturas.`;
  for (const l of f.lecturas) {
    const c = leerLectura(l.carga);
    const i = leerLectura(l.indicacion);
    if (c === null || c <= 0) return 'Digita la carga L de cada lectura (mayor que 0).';
    if (i === null) return 'Digita la indicación I de cada lectura.';
  }
  return null;
}

/** El cuerpo que recibe el servidor (la falla ya validada con `errorFalla`). */
export function fallaACuerpo(f: FallaEditable): CuerpoFalla {
  return {
    clasificacion: f.clasificacion ?? '',
    componente: f.componente ?? '',
    severidad: f.severidad ?? 'media',
    descripcion: f.descripcion.trim(),
    fotos: f.fotos,
    pruebas: f.lecturas.map((l) => ({ tipo: f.tipo, posicion: f.tipo === 'excentricidad' ? l.posicion : null, carga: leerLectura(l.carga) ?? 0, indicacion: leerLectura(l.indicacion) ?? 0 })),
  };
}

/** El cuerpo de las fallas ya guardadas (para reenviarlas con una nueva o sin la quitada). */
export function fallaGuardadaACuerpo(f: Falla): CuerpoFalla {
  return {
    clasificacion: f.clasificacion,
    componente: f.componente,
    severidad: (f.severidad as Severidad) ?? 'media',
    descripcion: f.descripcion,
    fotos: [...f.fotos],
    pruebas: f.pruebas.map((p) => ({ tipo: p.tipo as TipoPrueba, posicion: p.posicion, carga: p.carga, indicacion: p.indicacion })),
  };
}

// ── Textos de las tarjetas ──────────────────────────────────────────────────────────────────────

/** "2 CON PRUEBA" (singular: "1 CON PRUEBA"). */
export function textoConPrueba(fallas: { pruebas: readonly unknown[] }[]): string {
  const n = fallas.filter((f) => f.pruebas.length > 0).length;
  return `${n} CON PRUEBA`;
}

/** "2 fallas · cada una justificada con una prueba". */
export function textoFallas(n: number): string {
  return n === 0 ? 'Registra las fallas del equipo, cada una con su prueba' : `${n} ${n === 1 ? 'falla' : 'fallas'} · cada una justificada con una prueba`;
}

/** "N de 4" / "N de 6": progreso de la pestaña. */
export function textoProgreso(n: number, total: number): string {
  return `${n} de ${total}`;
}

// ── Progreso de las pestañas ────────────────────────────────────────────────────────────────────

export type EstadoBloque = 'completo' | 'pendiente' | 'conforme' | 'no_conforme';

export function estadoPruebasGenerales(p: PruebasGenerales): 'conforme' | 'no_conforme' | 'pendiente' {
  if (!p.finalizado) return 'pendiente';
  const todas = [...p.pesaje, ...p.excentricidad.flatMap((g) => g.lecturas)];
  return p.errorCritico || todas.some((l) => l.resultado === 'no_conforme') ? 'no_conforme' : 'conforme';
}

/** Una lectura fuera de EMP de Ensayos y Calibración, lista para mostrarla ("2,000 → +48 · EMP ±5"). */
export interface LecturaFueraEmp {
  tipo: 'pesaje' | 'excentricidad';
  carga: number | null;
  error: number | null;
  emp: number | null;
  /** Solo en excentricidad: 1 centro, 2 a 5 esquinas. */
  posicion: number | null;
}

export interface ResumenPruebasGenerales {
  lecturas: number;
  dentro: number;
  fuera: number;
  pesaje: { total: number; dentro: number };
  excentricidad: { total: number; dentro: number };
  lecturasFuera: LecturaFueraEmp[];
}

/** Resumen de "Pruebas generales": cuántas lecturas hay, cuántas están dentro del EMP y cuáles se salieron (lo que ya guardó Ensayos y Calibración, HU-10). */
export function resumenPruebasGenerales(p: PruebasGenerales): ResumenPruebasGenerales {
  const fuera = (l: { resultado: string | null }) => l.resultado === 'no_conforme';
  const ecc = p.excentricidad.flatMap((g) => g.lecturas.map((l) => ({ g, l })));
  const lecturasFuera: LecturaFueraEmp[] = [
    ...p.pesaje.filter(fuera).map((l) => ({ tipo: 'pesaje' as const, carga: l.carga, error: l.error, emp: l.emp, posicion: null })),
    ...ecc.filter((x) => fuera(x.l)).map((x) => ({ tipo: 'excentricidad' as const, carga: x.g.carga, error: x.l.error, emp: x.l.emp, posicion: x.l.orden })),
  ];
  const pes = { total: p.pesaje.length, dentro: p.pesaje.filter((l) => !fuera(l)).length };
  const exc = { total: ecc.length, dentro: ecc.filter((x) => !fuera(x.l)).length };
  return { lecturas: pes.total + exc.total, dentro: pes.dentro + exc.dentro, fuera: lecturasFuera.length, pesaje: pes, excentricidad: exc, lecturasFuera };
}

/** "8 de 9 lecturas dentro de EMP". */
export function textoLecturasDentro(r: Pick<ResumenPruebasGenerales, 'lecturas' | 'dentro'>): string {
  return `${r.dentro} de ${r.lecturas} ${r.lecturas === 1 ? 'lectura dentro' : 'lecturas dentro'} de EMP`;
}

/** Diferencia entre la indicación más alta y la más baja de las posiciones de una carga (el "desvío" de la excentricidad); null con menos de 2 lecturas. */
export function diferenciaExcentricidad(lecturas: { indicacion: number | null }[]): number | null {
  const v = lecturas.map((l) => l.indicacion).filter((x): x is number => typeof x === 'number');
  return v.length < 2 ? null : Math.round((Math.max(...v) - Math.min(...v)) * 10000) / 10000;
}

export function diagnosticoCompleto(d: { severidadGeneral: string | null; estadoEquipo: string | null }): boolean {
  return !!d.severidadGeneral && !!d.estadoEquipo;
}

export interface BloquesObservacion {
  recomendaciones: boolean;
  fallas: boolean;
  pruebas: boolean;
  diagnostico: boolean;
}

/** Los 4 bloques de "Observación y pruebas": recomendaciones y fallas (o "sin…"), pruebas generales (Ensayos finalizados) y Diagnóstico final. */
export function bloquesObservacion(c: Pick<CabeceraInforme, 'recomendaciones' | 'sinRecomendaciones' | 'fallas' | 'sinFallas' | 'pruebasGenerales' | 'diagnostico'>): BloquesObservacion {
  return {
    recomendaciones: c.recomendaciones.length > 0 || c.sinRecomendaciones,
    fallas: (c.fallas.length > 0 && c.fallas.every((f) => f.pruebas.length > 0)) || (c.fallas.length === 0 && c.sinFallas),
    pruebas: c.pruebasGenerales.finalizado,
    diagnostico: diagnosticoCompleto(c.diagnostico),
  };
}

export function progresoObservacion(c: Parameters<typeof bloquesObservacion>[0]): { n: number; total: number; texto: string; fraccion: number } {
  const b = bloquesObservacion(c);
  const n = [b.recomendaciones, b.fallas, b.pruebas, b.diagnostico].filter(Boolean).length;
  return { n, total: 4, texto: textoProgreso(n, 4), fraccion: n / 4 };
}

/** Progreso del informe en % (Detalle Serv.): "Quién atiende", Detalle Serv. guardado y los 4 bloques de Observación y pruebas. */
export function progresoInforme(c: CabeceraInforme): number {
  const b = bloquesObservacion(c);
  const pasos = [!!c.datos.responsableNombre?.trim(), c.detalle.guardado, b.recomendaciones, b.fallas, b.pruebas, b.diagnostico];
  return Math.round((100 * pasos.filter(Boolean).length) / pasos.length);
}

/** "Marcar TODOS los checks": todos marcados → los desmarca; si falta alguno → los marca todos. */
export function alternarChecks(codigos: string[], marcados: Set<string>): Set<string> {
  return codigos.every((c) => marcados.has(c)) ? new Set() : new Set(codigos);
}

/** Cuerpo de "guardar" de las pestañas Datos y Detalle Serv. */
export function cuerpoDatos(nombre: string, cargo: string, telefono: string): NonNullable<GuardarCabecera['datos']> {
  return { responsableNombre: nombre.trim() || null, responsableCargo: cargo.trim() || null, responsableTelefono: telefono.trim() || null };
}

// ── Textos de lecturas ──────────────────────────────────────────────────────────────────────────

/** "+4" / "−3" / "0" y "±1" de la tabla de una prueba. */
export function textoErrorEmp(error: number | null, emp: number | null): { error: string; emp: string } {
  return { error: formatoError(error), emp: emp == null ? '—' : `±${formatoMiles(emp)}` };
}

/** "Posición" de una lectura de excentricidad: 1 centro, 2 a 5 esquinas. */
export function textoPosicion(p: number | null): string {
  return p === 1 ? 'Centro' : p ? `Esquina ${p}` : '';
}
