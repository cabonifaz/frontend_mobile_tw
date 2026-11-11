import type { EstadoJornada, Jornada, Marcacion, Puntualidad, TipoMarcacion } from '@/api/jornada';

/**
 * HU-20 — Reglas de pantalla del Reloj marcador. Quién decide el orden, la hora válida y la puntualidad es el servidor (SP_RegistrarMarcacionJornadaMovil);
 * aquí se arman los textos, los cronómetros y, sin conexión, el estado con las marcaciones guardadas en el teléfono.
 * Todas las horas son de Lima (UTC-5, sin horario de verano).
 */

export const ORDEN_PASOS: readonly TipoMarcacion[] = ['inicio_labores', 'inicio_refrigerio', 'fin_refrigerio', 'salida_planta', 'fin_labores'];

export interface PasoJornada {
  tipo: TipoMarcacion;
  titulo: string;
  /** Color del botón habilitado y del punto en «Actividad del día». */
  color: string;
  /** Color del botón ya marcado o bloqueado. */
  suave: string;
  icono: 'play' | 'cafe' | 'restaurant' | 'exit' | 'stop';
}

export const PASOS: readonly PasoJornada[] = [
  { tipo: 'inicio_labores', titulo: 'Inicio de labores', color: '#16A34A', suave: '#86D3A0', icono: 'play' },
  { tipo: 'inicio_refrigerio', titulo: 'Inicio de refrigerio', color: '#EA580C', suave: '#F2A97F', icono: 'cafe' },
  { tipo: 'fin_refrigerio', titulo: 'Fin de refrigerio', color: '#2563EB', suave: '#8DAAF0', icono: 'restaurant' },
  { tipo: 'salida_planta', titulo: 'Salida de planta', color: '#DB2777', suave: '#EDA3C6', icono: 'exit' },
  { tipo: 'fin_labores', titulo: 'Fin de labores', color: '#DC2626', suave: '#EBA0A0', icono: 'stop' },
];

export function pasoDe(tipo: string): PasoJornada | undefined {
  return PASOS.find((p) => p.tipo === tipo);
}

export function tituloPaso(tipo: string): string {
  return pasoDe(tipo)?.titulo ?? tipo;
}

// ── Hora de Lima ─────────────────────────────────────────────────────────────────────────────────────────────────

const OFFSET_LIMA_MS = -5 * 3_600_000;
const dos = (n: number) => String(n).padStart(2, '0');
const lima = (ms: number) => new Date(ms + OFFSET_LIMA_MS);

/** "HH:mm:ss" (o "HH:mm") de Lima. */
export function horaLima(ms: number, conSegundos = true): string {
  const d = lima(ms);
  return `${dos(d.getUTCHours())}:${dos(d.getUTCMinutes())}${conSegundos ? `:${dos(d.getUTCSeconds())}` : ''}`;
}

/** Minutos desde las 00:00 de Lima. */
export function minutosDelDia(ms: number): number {
  const d = lima(ms);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** "Lunes, 26 de octubre de 2026". */
export function fechaLargaLima(ms: number): string {
  const d = lima(ms);
  return `${DIAS[d.getUTCDay()]}, ${d.getUTCDate()} de ${MESES[d.getUTCMonth()]} de ${d.getUTCFullYear()}`;
}

/** "26/10/2026". */
export function fechaCortaLima(ms: number): string {
  const d = lima(ms);
  return `${dos(d.getUTCDate())}/${dos(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
}

/** "HH:mm" → minutos desde las 00:00 (null si no es una hora válida). */
export function minutosDeHora(hora: string): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(hora);
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  return h > 23 || mi > 59 ? null : h * 60 + mi;
}

// ── Puntualidad del ingreso ──────────────────────────────────────────────────────────────────────────────────────

export interface PuntualidadLocal {
  puntualidad: Puntualidad;
  /** Minutos de tardanza (0 si llegó a tiempo). */
  minutos: number;
}

/** Igual que el servidor: a tiempo hasta `toleranciaMin` minutos después del inicio programado; después, tardanza. */
export function puntualidadIngreso(ms: number, inicioProgramado: string, toleranciaMin: number): PuntualidadLocal {
  const prog = minutosDeHora(inicioProgramado) ?? 465;
  const dif = minutosDelDia(ms) - prog;
  return { puntualidad: dif <= toleranciaMin ? 'a_tiempo' : 'tardanza', minutos: Math.max(0, dif) };
}

export function textoPuntualidad(p: Puntualidad | null | undefined, minutos?: number | null): string {
  if (p === 'a_tiempo') return 'A tiempo';
  if (p === 'tardanza') return minutos && minutos > 0 ? `Tardanza (${minutos} min)` : 'Tardanza';
  return '';
}

// ── Estado de la jornada ─────────────────────────────────────────────────────────────────────────────────────────

/** El estado según cuántas marcaciones hay: la misma tabla que SP_EstadoJornadaMovil. */
export function estadoDeCantidad(n: number): EstadoJornada {
  return n <= 0 ? 'sin_iniciar' : n === 1 ? 'en_labores' : n === 2 ? 'en_refrigerio' : n === 3 ? 'en_labores' : n === 4 ? 'salio_planta' : 'finalizada';
}

export function siguienteDeCantidad(n: number): TipoMarcacion | null {
  return n >= 0 && n < ORDEN_PASOS.length ? ORDEN_PASOS[n] : null;
}

export function textoEstado(e: EstadoJornada, minutosLabores?: number | null): string {
  switch (e) {
    case 'sin_iniciar':
      return 'Jornada sin iniciar';
    case 'en_labores':
      return minutosLabores != null ? `En labores · ${textoDuracion(minutosLabores)}` : 'En labores';
    case 'en_refrigerio':
      return 'En refrigerio';
    case 'salio_planta':
      return 'Salió de planta';
    default:
      return 'Jornada finalizada';
  }
}

/** Color del estado: [fondo, texto, punto]. */
export function coloresEstado(e: EstadoJornada): { fondo: string; texto: string; punto: string } {
  switch (e) {
    case 'en_labores':
      return { fondo: '#DCFCE7', texto: '#166534', punto: '#16A34A' };
    case 'en_refrigerio':
      return { fondo: '#FFEDD5', texto: '#9A3412', punto: '#EA580C' };
    case 'salio_planta':
      return { fondo: '#FCE7F3', texto: '#9D174D', punto: '#DB2777' };
    default:
      return { fondo: '#EEF2F7', texto: '#5F6B7A', punto: '#8A94A3' };
  }
}

// ── Marcaciones guardadas en el teléfono (sin conexión) ───────────────────────────────────────────────────────────

export interface PendienteDeJornada {
  tipo: TipoMarcacion;
  /** ISO 8601 UTC. */
  capturadoEn: string;
  latitud: number;
  longitud: number;
  precisionMetros: number;
}

/**
 * La jornada que ve el técnico: lo del servidor más lo guardado en el teléfono que aún no llegó (en orden). Las marcaciones del teléfono van marcadas como
 * pendientes; el estado y el paso habilitado se recalculan. El servidor sigue siendo quien decide cuando se envían.
 */
export function conPendientes(j: Jornada, pendientes: readonly PendienteDeJornada[]): Jornada {
  const marcaciones: Marcacion[] = [...j.marcaciones];
  for (const p of [...pendientes].sort((a, b) => a.capturadoEn.localeCompare(b.capturadoEn))) {
    if (marcaciones.some((m) => m.tipo === p.tipo)) continue;
    // Solo se suma el paso que sigue: un pendiente fuera de orden no cuenta (el servidor lo rechazaría)
    if (p.tipo !== siguienteDeCantidad(marcaciones.length)) continue;
    const ms = Date.parse(p.capturadoEn);
    const pt = p.tipo === 'inicio_labores' ? puntualidadIngreso(ms, j.inicioProgramado, j.toleranciaMin) : null;
    marcaciones.push({
      tipo: p.tipo,
      hora: horaLima(ms, false),
      marcadoUtc: p.capturadoEn,
      lugar: null,
      latitud: p.latitud,
      longitud: p.longitud,
      precisionM: Math.round(p.precisionMetros),
      puntualidad: pt?.puntualidad ?? null,
      minutosDiferencia: pt ? pt.minutos : null,
      sinConexion: true,
      pendiente: true,
    });
  }
  const n = marcaciones.length;
  return { ...j, marcaciones, estado: estadoDeCantidad(n), siguiente: siguienteDeCantidad(n) };
}

// ── Cronómetros ──────────────────────────────────────────────────────────────────────────────────────────────────

const marca = (j: Jornada, tipo: TipoMarcacion) => j.marcaciones.find((m) => m.tipo === tipo);

/** Segundos que lleva el refrigerio (0 si no está en refrigerio). */
export function refrigerioTranscurridoSeg(j: Jornada, ahoraMs: number): number {
  if (j.estado !== 'en_refrigerio') return 0;
  const ini = marca(j, 'inicio_refrigerio');
  return ini ? Math.max(0, Math.floor((ahoraMs - Date.parse(ini.marcadoUtc)) / 1000)) : 0;
}

/** Minutos de refrigerio ya cumplidos (terminado o en curso). */
export function refrigerioMin(j: Jornada, ahoraMs: number): number {
  const ini = marca(j, 'inicio_refrigerio');
  if (!ini) return 0;
  const fin = marca(j, 'fin_refrigerio');
  const hasta = fin ? Date.parse(fin.marcadoUtc) : ahoraMs;
  return Math.max(0, Math.floor((hasta - Date.parse(ini.marcadoUtc)) / 60_000));
}

/** Minutos trabajados hasta ahora (o hasta el fin de labores): desde el inicio, sin el refrigerio. null si aún no inicia. */
export function trabajadoMin(j: Jornada, ahoraMs: number): number | null {
  const ini = marca(j, 'inicio_labores');
  if (!ini) return null;
  const fin = marca(j, 'fin_labores');
  const hasta = fin ? Date.parse(fin.marcadoUtc) : ahoraMs;
  return Math.max(0, Math.floor((hasta - Date.parse(ini.marcadoUtc)) / 60_000) - refrigerioMin(j, hasta));
}

/** "00:18:40". */
export function cronometro(seg: number): string {
  const s = Math.max(0, Math.floor(seg));
  return `${dos(Math.floor(s / 3600))}:${dos(Math.floor((s % 3600) / 60))}:${dos(s % 60)}`;
}

/** "3 h 01 min" · "45 min" · "8 h 25 min". */
export function textoDuracion(min: number): string {
  const m = Math.max(0, Math.round(min));
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${dos(m % 60)} min`;
}

/** Porcentaje (0 a 100) del tiempo de refrigerio usado. */
export function porcentajeRefrigerio(seg: number, maxMin: number): number {
  return maxMin <= 0 ? 0 : Math.min(100, Math.round((seg / (maxMin * 60)) * 100));
}

// ── Actividad del día ────────────────────────────────────────────────────────────────────────────────────────────

/** Segunda línea de cada marcación: puntualidad del ingreso y lugar (o el GPS). */
export function detalleMarcacion(m: Marcacion, inicioProgramado: string): string {
  const partes: string[] = [];
  if (m.tipo === 'inicio_labores' && m.puntualidad) {
    partes.push(m.puntualidad === 'a_tiempo' ? `A tiempo (programado ${inicioProgramado})` : `${textoPuntualidad('tardanza', m.minutosDiferencia)} · programado ${inicioProgramado}`);
  }
  if (m.lugar) partes.push(m.lugar);
  else if (m.latitud != null && m.longitud != null) partes.push(`GPS${m.precisionM != null ? ` ± ${m.precisionM} m` : ''}`);
  return partes.join(' · ');
}

/** Las marcaciones de la más reciente a la más antigua. */
export function actividadDelDia(j: Jornada): Marcacion[] {
  return [...j.marcaciones].sort((a, b) => b.marcadoUtc.localeCompare(a.marcadoUtc));
}

/** ¿La jornada está en curso (se envía la posición al servidor)? */
export function jornadaEnCurso(e: EstadoJornada): boolean {
  return e === 'en_labores' || e === 'en_refrigerio' || e === 'salio_planta';
}

/** Una jornada sin marcaciones, con el horario por defecto: se usa si no hay conexión ni una lectura guardada (para poder marcar y que se envíe sola después). */
export function jornadaVacia(ahoraMs: number): Jornada {
  return {
    fecha: '',
    ahoraUtc: new Date(ahoraMs).toISOString(),
    estado: 'sin_iniciar',
    siguiente: 'inicio_labores',
    inicioProgramado: '07:45',
    finProgramado: '17:00',
    toleranciaMin: 5,
    refrigerioMaxMin: 60,
    marcaciones: [],
    resumen: null,
  };
}
