/**
 * HU-10 — Ensayos y Calibración: cálculos y textos que se muestran en el teléfono mientras el técnico digita.
 * La regla (error E = I − L, EMP según clase y e, conformidad) vive en el back (`SP_EmpEnsayoMovil` y `SP_GuardarEnsayosMovil`) y se vuelve a calcular
 * al guardar: aquí se repite solo para dar respuesta inmediata en pantalla (también sin conexión). Mismas fórmulas, probadas contra los ejemplos de la maqueta.
 */

export type FormaPlato = 'rectangular' | 'circular' | 'triangular';
export type Resultado = 'conforme' | 'no_conforme' | null;

export const FORMAS: { valor: FormaPlato; texto: string }[] = [
  { valor: 'rectangular', texto: 'Rectangular' },
  { valor: 'circular', texto: 'Circular' },
  { valor: 'triangular', texto: 'Triangular' },
];

/** Posiciones de excentricidad según la forma del plato (la 1 es el centro). */
export function posicionesDe(forma: FormaPlato): number {
  return forma === 'triangular' ? 4 : 5;
}

/** "1 centro · 2 a 5 esquinas". */
export function textoPosiciones(forma: FormaPlato): string {
  const n = posicionesDe(forma);
  return `1 centro · 2 a ${n} ${forma === 'rectangular' ? 'esquinas' : forma === 'circular' ? 'puntos' : 'vértices'}`;
}

/** Límites (en divisiones e) de cada clase: hasta el primero ±0,5 e, hasta el segundo ±1 e, más ±1,5 e (OIML R76, verificación inicial). */
const LIMITES: Record<string, [number, number]> = {
  I: [50_000, 200_000],
  II: [5_000, 20_000],
  III: [500, 2_000],
  IIII: [50, 200],
  IV: [50, 200],
};

/** Error máximo permitido de una carga; null si no hay clase conocida o e. */
export function empDe(clase: string | null | undefined, e: number | null | undefined, carga: number | null | undefined): number | null {
  if (!e || e <= 0 || carga == null) return null;
  const l = LIMITES[(clase ?? '').trim().toUpperCase()];
  if (!l) return null;
  const m = carga / e;
  return e * (m <= l[0] ? 0.5 : m <= l[1] ? 1 : 1.5);
}

export interface Evaluacion {
  error: number | null;
  emp: number | null;
  resultado: Resultado;
}

/** Error E = I − L, EMP y conformidad (|E| ≤ EMP). Sin indicación o sin EMP no hay resultado. */
export function evaluar(clase: string | null | undefined, e: number | null | undefined, carga: number | null, indicacion: number | null): Evaluacion {
  const emp = empDe(clase, e, carga);
  if (carga == null || indicacion == null) return { error: null, emp, resultado: null };
  const error = redondear(indicacion - carga);
  return { error, emp, resultado: emp == null ? null : Math.abs(error) <= emp + 1e-9 ? 'conforme' : 'no_conforme' };
}

function redondear(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}

/** "10,005" (miles con coma, como en la maqueta); con decimales hasta 4 sin ceros sobrantes. */
export function formatoMiles(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  const r = redondear(n);
  const [entero, dec] = String(Math.abs(r)).split('.');
  const miles = entero.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${r < 0 ? '-' : ''}${miles}${dec ? `.${dec}` : ''}`;
}

/** "+5", "−2", "0". */
export function formatoError(n: number | null | undefined): string {
  if (n == null) return '—';
  if (n === 0) return '0';
  return `${n > 0 ? '+' : '−'}${formatoMiles(Math.abs(n))}`;
}

/** "±10". */
export function formatoEmp(n: number | null | undefined): string {
  return n == null ? '—' : `±${formatoMiles(n)}`;
}

/**
 * Lee lo que digita el técnico: "10005", "10,005" y "10 005" son miles; "0,5" es decimal (coma seguida de 1 o 2 cifras al final); con punto
 * decimal también. Vacío o no numérico → null. Misma regla que SP_ContextoEnsayoMovil.
 */
export function leerLectura(texto: string): number | null {
  let t = texto.trim().replace(/\s+/g, '');
  if (!t) return null;
  t = /^\d+,\d{1,2}$/.test(t) ? t.replace(',', '.') : t.replace(/,/g, '');
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Redondea hacia abajo a 2 cifras significativas: 26 666 → 26 000; 10 000 → 10 000. */
export function redondear2Cifras(x: number): number {
  if (!(x > 0)) return 0;
  const p = Math.pow(10, Math.max(0, Math.floor(Math.log10(x)) - 1));
  return Math.floor(x / p) * p;
}

/** Cargas sugeridas de pesaje: 12,5 %, 25 %, 50 % y 100 % de la capacidad máxima (10 000, 20 000, 40 000 y 80 000 con 80 000). */
export function cargasPesajeSugeridas(cap: number | null | undefined): number[] {
  if (!cap || cap <= 0) return [];
  return [0.125, 0.25, 0.5, 1].map((f) => redondear2Cifras(cap * f)).filter((v, i, a) => v > 0 && a.indexOf(v) === i);
}

/** Cargas sugeridas de excentricidad: 1/3 de la capacidad máxima la primera y 2/3 la segunda (26 000 y 53 000 con 80 000). */
export function cargaExcentricidadSugerida(cap: number | null | undefined, numero: number): number | null {
  if (!cap || cap <= 0) return null;
  const v = redondear2Cifras((cap * Math.min(numero, 2)) / 3);
  return v > 0 ? v : null;
}

// ── Lo que el técnico tiene en pantalla ────────────────────────────────────────

export interface FilaPesaje {
  carga: string;
  indicacion: string;
}

export interface GrupoExcentricidad {
  carga: string;
  /** Una indicación por posición (la primera es el centro). */
  lecturas: string[];
}

export interface FilaCalculada extends Evaluacion {
  completa: boolean;
}

export function calcularPesaje(clase: string | null, e: number | null, filas: FilaPesaje[]): FilaCalculada[] {
  return filas.map((f) => {
    const carga = leerLectura(f.carga);
    const ind = leerLectura(f.indicacion);
    return { ...evaluar(clase, e, carga, ind), completa: carga !== null && ind !== null };
  });
}

export function calcularGrupo(clase: string | null, e: number | null, g: GrupoExcentricidad): FilaCalculada[] {
  const carga = leerLectura(g.carga);
  return g.lecturas.map((l) => {
    const ind = leerLectura(l);
    return { ...evaluar(clase, e, carga, ind), completa: carga !== null && ind !== null };
  });
}

export type EstadoGrupo = 'conforme' | 'error' | 'en_curso';

/** CONFORME (todas las posiciones leídas y dentro del EMP), con ERROR (alguna fuera) o EN CURSO (faltan lecturas). */
export function estadoGrupo(filas: FilaCalculada[]): EstadoGrupo {
  if (filas.some((f) => f.resultado === 'no_conforme')) return 'error';
  return filas.length > 0 && filas.every((f) => f.completa && f.resultado === 'conforme') ? 'conforme' : 'en_curso';
}

/** Diferencia máxima entre posiciones de una carga (la mayor indicación menos la menor). */
export function diferenciaMaxima(g: GrupoExcentricidad): number | null {
  const v = g.lecturas.map(leerLectura).filter((x): x is number => x !== null);
  return v.length < 2 ? null : redondear(Math.max(...v) - Math.min(...v));
}

export interface ErrorCritico {
  /** "pesaje" o "excentricidad" y dónde está. */
  tipo: 'pesaje' | 'excentricidad';
  indice: number;
  posicion?: number;
  carga: number;
  /** Lo que se leyó en el equipo (I). */
  indicacion: number;
  error: number;
  emp: number;
}

/** Identifica un error crítico concreto (dónde está y con qué lectura): sirve para no avisar dos veces del mismo error ya aceptado. */
export function claveError(k: Pick<ErrorCritico, 'tipo' | 'indice' | 'posicion' | 'indicacion'>): string {
  return `${k.tipo}|${k.indice}|${k.posicion ?? 0}|${k.indicacion}`;
}

/** Lecturas fuera del EMP (error crítico), la más grave primero. */
export function erroresCriticos(clase: string | null, e: number | null, pesaje: FilaPesaje[], grupos: GrupoExcentricidad[]): ErrorCritico[] {
  const lista: ErrorCritico[] = [];
  calcularPesaje(clase, e, pesaje).forEach((f, i) => {
    if (f.resultado === 'no_conforme' && f.error != null && f.emp != null) lista.push({ tipo: 'pesaje', indice: i, carga: leerLectura(pesaje[i].carga) ?? 0, indicacion: leerLectura(pesaje[i].indicacion) ?? 0, error: f.error, emp: f.emp });
  });
  grupos.forEach((g, gi) =>
    calcularGrupo(clase, e, g).forEach((f, pi) => {
      if (f.resultado === 'no_conforme' && f.error != null && f.emp != null) {
        lista.push({ tipo: 'excentricidad', indice: gi, posicion: pi + 1, carga: leerLectura(g.carga) ?? 0, indicacion: leerLectura(g.lecturas[pi]) ?? 0, error: f.error, emp: f.emp });
      }
    }),
  );
  return lista.sort((a, b) => Math.abs(b.error) / b.emp - Math.abs(a.error) / a.emp);
}

/** "La carga de 20,000 kg supera el error máximo permitido (+34 kg frente a ±20 kg). Revisa la digitación o repite el ensayo." */
export function textoErrorCritico(c: ErrorCritico, unidad: string): string {
  const donde = c.tipo === 'pesaje' ? `La carga de ${formatoMiles(c.carga)} ${unidad}` : `La posición ${c.posicion} de la carga de ${formatoMiles(c.carga)} ${unidad}`;
  return `${donde} supera el error máximo permitido (${formatoError(c.error)} ${unidad} frente a ${formatoEmp(c.emp)} ${unidad}). Revisa la digitación o repite el ensayo.`;
}

/** Mensaje bajo "Finalizar ensayo" cuando está bloqueado; null si se puede finalizar. */
export function motivoNoFinaliza(clase: string | null, e: number | null, pesaje: FilaPesaje[], grupos: GrupoExcentricidad[], forma: FormaPlato, aceptado: boolean): string | null {
  if (!clase || !e) return 'El equipo no tiene clase de exactitud o división e registradas.';
  const p = calcularPesaje(clase, e, pesaje);
  if (p.length === 0 || p.some((f) => !f.completa)) return 'Completa las lecturas de pesaje.';
  if (grupos.length === 0) return 'Agrega al menos una carga de excentricidad.';
  const n = posicionesDe(forma);
  for (let i = 0; i < grupos.length; i++) {
    const filas = calcularGrupo(clase, e, grupos[i]);
    if (filas.length < n || filas.some((f) => !f.completa)) return `Completa las ${n} posiciones de la carga ${i + 1}.`;
  }
  if (!aceptado && erroresCriticos(clase, e, pesaje, grupos).length > 0) return 'Bloqueado mientras haya un error crítico.';
  return null;
}

/** Resumen del pesaje: "4 cargas · error máx. +15 kg (EMP ±30 kg)". */
export function resumenPesaje(clase: string | null, e: number | null, pesaje: FilaPesaje[], unidad: string): string {
  const f = calcularPesaje(clase, e, pesaje).filter((x) => x.error != null);
  if (f.length === 0) return 'Sin lecturas';
  const peor = f.reduce((a, b) => (Math.abs(b.error ?? 0) > Math.abs(a.error ?? 0) ? b : a));
  return `${pesaje.length} ${pesaje.length === 1 ? 'carga' : 'cargas'} · error máx. ${formatoError(peor.error)} ${unidad} (EMP ${formatoEmp(peor.emp)} ${unidad})`;
}

/** Resumen de la excentricidad: "Carga 26,000 kg · diferencia máx. 8 kg" (con varias cargas, "2 cargas · diferencia máx. …"). */
export function resumenExcentricidad(grupos: GrupoExcentricidad[], unidad: string): string {
  if (grupos.length === 0) return 'Sin lecturas';
  const dif = grupos.map(diferenciaMaxima).filter((x): x is number => x !== null);
  const max = dif.length ? Math.max(...dif) : null;
  const inicio = grupos.length === 1 ? `Carga ${formatoMiles(leerLectura(grupos[0].carga))} ${unidad}` : `${grupos.length} cargas`;
  return `${inicio} · diferencia máx. ${max === null ? '—' : `${formatoMiles(max)} ${unidad}`}`;
}

/** Texto del estado de validación del pesaje: "Todas las lecturas dentro de tolerancia para clase III." */
export function estadoValidacionPesaje(clase: string | null, e: number | null, pesaje: FilaPesaje[]): { ok: boolean; texto: string } {
  const f = calcularPesaje(clase, e, pesaje);
  if (f.some((x) => x.resultado === 'no_conforme')) return { ok: false, texto: 'Hay lecturas fuera de tolerancia: revisa la digitación o repite el ensayo.' };
  if (f.length === 0 || f.some((x) => x.resultado === null)) return { ok: true, texto: 'Completa las lecturas para validar la tolerancia.' };
  return { ok: true, texto: `Todas las lecturas dentro de tolerancia para clase ${clase}.` };
}

/** Iniciales del encargado para el avatar: "Carlos Ramos" → "CR". */
export function iniciales(nombre: string): string {
  return nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

/** Teléfono marcable: deja dígitos y el + inicial. */
export function telefonoMarcable(t: string | null | undefined): string | null {
  const s = (t ?? '').replace(/[^\d+]/g, '');
  return s.replace(/\D/g, '').length >= 6 ? s : null;
}
