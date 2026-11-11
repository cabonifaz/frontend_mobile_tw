import type { Constancia, EnvioEstado, FirmaJson, InformeFirma, ResponsableFirma, Trazos } from '@/api/firmas';
import { colores } from '@/tema/colores';
import { fechaCorta, horaDe } from '@/utilidades/formato';

/**
 * HU-17 — Reglas de pantalla de la firma de informes y la constancia. Quién decide todo (informe completo, responsable, firmas repetidas, plazo, cierre) es el back;
 * aquí solo se arman los textos y se maneja el dibujo de la firma (trazos normalizados a 0–1 del lienzo).
 */

/** Relación ancho / alto del lienzo de firma (el PDF del back dibuja con la misma). */
export const ASPECTO_FIRMA = 2.5;
export const MIN_PUNTOS = 12;
export const MIN_EXTENSION = 0.08;
export const MAX_PUNTOS = 2000;
export const MAX_TRAZOS = 40;
/** Distancia mínima entre dos puntos (en fracción del lienzo) para guardar uno nuevo: evita miles de puntos. */
const DISTANCIA_MINIMA = 0.004;

// ── Dibujo ───────────────────────────────────────────────────────────────────────────────────────────────────────

const limitar = (v: number) => Math.min(1, Math.max(0, v));
const redondear = (v: number) => Math.round(v * 10000) / 10000;

/** Punto táctil (px del lienzo) → punto normalizado de 0 a 1. */
export function normalizarPunto(x: number, y: number, ancho: number, alto: number): [number, number] {
  if (ancho <= 0 || alto <= 0) return [0, 0];
  return [redondear(limitar(x / ancho)), redondear(limitar(y / alto))];
}

export function totalPuntos(t: Trazos): number {
  return t.reduce((s, x) => s + x.length, 0);
}

/** Empieza un trazo nuevo (el dedo toca la pantalla). Respeta el máximo de trazos y de puntos. */
export function iniciarTrazo(t: Trazos, p: [number, number]): Trazos {
  if (t.length >= MAX_TRAZOS || totalPuntos(t) >= MAX_PUNTOS) return t;
  return [...t, [p]];
}

/** Agrega un punto al último trazo (el dedo se mueve); ignora los que casi no se movieron. */
export function agregarPunto(t: Trazos, p: [number, number]): Trazos {
  if (t.length === 0 || totalPuntos(t) >= MAX_PUNTOS) return t;
  const ultimo = t[t.length - 1];
  const previo = ultimo[ultimo.length - 1];
  if (previo && Math.hypot(p[0] - previo[0], p[1] - previo[1]) < DISTANCIA_MINIMA) return t;
  return [...t.slice(0, -1), [...ultimo, p]];
}

/** ¿La firma dibujada alcanza para confirmarla? (el back vuelve a validar: puntos suficientes y que no sea una rayita). */
export function firmaSuficiente(t: Trazos): boolean {
  if (totalPuntos(t) < MIN_PUNTOS) return false;
  const todos = t.flat();
  const xs = todos.map((p) => p[0]);
  const ys = todos.map((p) => p[1]);
  return Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) >= MIN_EXTENSION;
}

/** Lo que guarda el back: {"trazos":[[[x,y],…],…]}. */
export function firmaATexto(t: Trazos): string {
  return JSON.stringify({ trazos: t } satisfies FirmaJson);
}

/** Lee los trazos que vienen del back (objeto o texto); cualquier otra cosa → null. */
export function trazosDesde(valor: unknown): Trazos | null {
  let v: unknown = valor;
  if (typeof v === 'string') {
    try {
      v = JSON.parse(v);
    } catch {
      return null;
    }
  }
  const lista = v && typeof v === 'object' ? (v as { trazos?: unknown }).trazos : null;
  if (!Array.isArray(lista)) return null;
  const res: Trazos = [];
  for (const t of lista) {
    if (!Array.isArray(t)) return null;
    const puntos: [number, number][] = [];
    for (const p of t) {
      if (!Array.isArray(p) || p.length !== 2 || typeof p[0] !== 'number' || typeof p[1] !== 'number') return null;
      puntos.push([p[0], p[1]]);
    }
    if (puntos.length > 0) res.push(puntos);
  }
  return res.length > 0 ? res : null;
}

export interface Segmento {
  /** Posición (esquina superior izquierda) ya centrada para girar sobre su propio centro. */
  izquierda: number;
  arriba: number;
  largo: number;
  /** Radianes. */
  angulo: number;
}

/** Los segmentos de línea para dibujar la firma con vistas (sin librería de gráficos): uno por cada par de puntos; un punto solo es un punto. */
export function segmentos(t: Trazos, ancho: number, alto: number, grosor: number): Segmento[] {
  const res: Segmento[] = [];
  for (const trazo of t) {
    if (trazo.length === 1) {
      const [x, y] = [trazo[0][0] * ancho, trazo[0][1] * alto];
      res.push({ izquierda: x - grosor / 2, arriba: y - grosor / 2, largo: grosor, angulo: 0 });
      continue;
    }
    for (let i = 1; i < trazo.length; i++) {
      const x1 = trazo[i - 1][0] * ancho;
      const y1 = trazo[i - 1][1] * alto;
      const x2 = trazo[i][0] * ancho;
      const y2 = trazo[i][1] * alto;
      const largo = Math.hypot(x2 - x1, y2 - y1) + grosor * 0.6;
      res.push({ izquierda: (x1 + x2) / 2 - largo / 2, arriba: (y1 + y2) / 2 - grosor / 2, largo, angulo: Math.atan2(y2 - y1, x2 - x1) });
    }
  }
  return res;
}

export interface SegmentoTinta extends Segmento {
  /** Grosor propio del tramo (px): la tinta es más fina al rápido y en las puntas, más gruesa al lento. */
  grosor: number;
}

/**
 * Tinta realista de un trazo: curva suave (Catmull-Rom) por los puntos tocados y grosor variable según la velocidad
 * (puntos más separados = pluma más rápida = línea más fina), con punta fina al inicio y al final.
 * Solo se calcula al dibujar: lo guardado sigue siendo los puntos normalizados.
 */
export function segmentosTinta(trazo: [number, number][], ancho: number, alto: number, grosor: number): SegmentoTinta[] {
  if (trazo.length === 0) return [];
  const crudo = trazo.map((p) => ({ x: p[0] * ancho, y: p[1] * alto }));
  // Quita el temblor del dedo: cada punto interior se promedia con sus vecinos (las puntas se respetan).
  const P = crudo.map((p, i) => (i === 0 || i === crudo.length - 1 ? p : { x: (crudo[i - 1].x + 2 * p.x + crudo[i + 1].x) / 4, y: (crudo[i - 1].y + 2 * p.y + crudo[i + 1].y) / 4 }));
  if (P.length === 1) return [{ izquierda: P[0].x - grosor / 2, arriba: P[0].y - grosor / 2, largo: grosor, angulo: 0, grosor }];
  // Grosor por punto: velocidad ≈ distancia al anterior (los eventos llegan a ritmo fijo), suavizada.
  const ref = Math.max(6, ancho * 0.03);
  const w: number[] = [];
  let previo = grosor;
  for (let i = 0; i < P.length; i++) {
    const d = i === 0 ? 0 : Math.hypot(P[i].x - P[i - 1].x, P[i].y - P[i - 1].y);
    const objetivo = grosor * Math.min(1.2, Math.max(0.8, 1.2 - (d / ref) * 0.4));
    previo = i === 0 ? objetivo : previo * 0.88 + objetivo * 0.12;
    w.push(previo);
  }
  const n = P.length;
  const afinado = (i: number) => {
    const borde = Math.min(i, n - 1 - i);
    return borde >= 3 ? 1 : 0.6 + 0.4 * (borde / 3);
  };
  const pts: { x: number; y: number; w: number }[] = [];
  for (let i = 0; i < n - 1; i++) {
    const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(n - 1, i + 2)];
    const pasos = Math.min(16, Math.max(1, Math.ceil(Math.hypot(p2.x - p1.x, p2.y - p1.y) / 1.5)));
    for (let k = 0; k < pasos; k++) {
      const t = k / pasos, t2 = t * t, t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      const ww = (w[i] + (w[i + 1] - w[i]) * t) * (afinado(i) + (afinado(i + 1) - afinado(i)) * t);
      pts.push({ x: f(p0.x, p1.x, p2.x, p3.x), y: f(p0.y, p1.y, p2.y, p3.y), w: ww });
    }
  }
  pts.push({ x: P[n - 1].x, y: P[n - 1].y, w: w[n - 1] * afinado(n - 1) });
  const res: SegmentoTinta[] = [];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const g = (a.w + b.w) / 2;
    const largo = Math.hypot(b.x - a.x, b.y - a.y) + g * 1.2;
    res.push({ izquierda: (a.x + b.x) / 2 - largo / 2, arriba: (a.y + b.y) / 2 - g / 2, largo, angulo: Math.atan2(b.y - a.y, b.x - a.x), grosor: g });
  }
  return res;
}

// ── Lista de informes ────────────────────────────────────────────────────────────────────────────────────────────

/** "47:12:05": lo que queda de la aceptación tácita. */
export function tiempoRestante(segundos: number | null | undefined): string {
  const s = Math.max(0, Math.floor(segundos ?? 0));
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`;
}

export function textoPlazo(segundos: number | null | undefined): string {
  return segundos === 0 ? 'Aceptación tácita vencida' : `Aceptación tácita activa · plazo restante ${tiempoRestante(segundos)}`;
}

/** Se puede marcar para firmar: el informe está completo y su responsable aún no firmó. */
export function seleccionable(i: Pick<InformeFirma, 'completo' | 'firma'>): boolean {
  return i.completo && i.firma !== 'firmado';
}

/** "4 informes · 3 listos para firmar" (o "2 firmados · 1 pendiente" cuando ya hay firmas). */
export function textoConteo(informes: InformeFirma[]): string {
  const firmados = informes.filter((i) => i.firma === 'firmado').length;
  const pendientes = informes.filter(seleccionable).length;
  if (firmados === 0) return `${informes.length} ${informes.length === 1 ? 'informe' : 'informes'} · ${pendientes} ${pendientes === 1 ? 'listo' : 'listos'} para firmar`;
  return `${firmados} ${firmados === 1 ? 'firmado' : 'firmados'} · ${pendientes} ${pendientes === 1 ? 'pendiente' : 'pendientes'}`;
}

export interface Etiqueta {
  texto: string;
  fondo: string;
  color: string;
}

export function etiquetaInforme(i: Pick<InformeFirma, 'completo' | 'firma'>): Etiqueta {
  if (i.firma === 'firmado') return { texto: 'FIRMADO', fondo: colores.verdeEtiquetaFondo, color: colores.verdeEtiquetaTexto };
  if (!i.completo) return { texto: 'INCOMPLETO', fondo: colores.grisFondo, color: colores.grisTexto };
  return { texto: 'COMPLETO', fondo: colores.verdeEtiquetaFondo, color: colores.verdeEtiquetaTexto };
}

/** "Firma: PENDIENTE" / "Firmado 12:05" / "Cliente ausente: pendiente". */
export function textoFirma(i: Pick<InformeFirma, 'firma' | 'firmadoEn'>): { texto: string; pendiente: boolean } {
  if (i.firma === 'firmado') return { texto: `Firmado${i.firmadoEn ? ` ${horaDe(i.firmadoEn)}` : ''}`, pendiente: false };
  if (i.firma === 'ausente') return { texto: 'Cliente ausente · PENDIENTE', pendiente: true };
  return { texto: 'PENDIENTE', pendiente: true };
}

/** Las claves de los responsables de los informes marcados, sin repetir y en el orden de la lista. */
export function clavesDeSeleccion(informes: InformeFirma[], marcados: ReadonlySet<number>): string[] {
  const claves: string[] = [];
  for (const i of informes) if (marcados.has(i.idOsEquipo) && i.clave && seleccionable(i) && !claves.includes(i.clave)) claves.push(i.clave);
  return claves;
}

/** "Seleccionar todos": marca todos los que se pueden firmar; si ya estaban todos, los desmarca. */
export function alternarTodos(informes: InformeFirma[], marcados: ReadonlySet<number>): Set<number> {
  const todos = informes.filter(seleccionable).map((i) => i.idOsEquipo);
  return todos.length > 0 && todos.every((id) => marcados.has(id)) ? new Set() : new Set(todos);
}

export const textoBotonFirmar = (n: number) => `Firmar (${n})`;

/** Lo que sigue al firmar a un responsable: el siguiente de la cola, o null si era el último. */
export function siguienteResponsable(claves: string[], actual: string): string | null {
  const i = claves.indexOf(actual);
  return i >= 0 && i < claves.length - 1 ? claves[i + 1] : null;
}

export const textoPaso = (n: number, total: number) => `${n} de ${total}`;

/** "Una sola firma para sus 2 informes." */
export function textoUnaFirma(r: Pick<ResponsableFirma, 'nInformes'>): string {
  return `Una sola firma para ${r.nInformes === 1 ? 'su informe' : `sus ${r.nInformes} informes`}.`;
}

/** Fecha y hora cortas: "26/10/2026 12:05". */
export function fechaHoraCorta(iso: string | null | undefined): string {
  return iso ? `${fechaCorta(iso)} ${horaDe(iso)}` : '—';
}

// ── Constancia ───────────────────────────────────────────────────────────────────────────────────────────────────

export function etiquetaEnvio(estado: EnvioEstado | string): Etiqueta {
  switch (estado) {
    case 'enviado':
      return { texto: 'CORREO ENVIADO', fondo: colores.verdeEtiquetaFondo, color: colores.verdeEtiquetaTexto };
    case 'error':
      return { texto: 'ERROR AL ENVIAR', fondo: colores.rojoEtiquetaFondo, color: colores.rojoEtiquetaTexto };
    case 'desactivado':
      return { texto: 'SIN ENVÍO', fondo: colores.grisFondo, color: colores.grisTexto };
    case 'sin_correo':
      return { texto: 'SIN CORREO', fondo: colores.grisFondo, color: colores.grisTexto };
    default:
      return { texto: 'EN ESPERA', fondo: colores.amarilloFondo, color: colores.amarilloTexto };
  }
}

/** Texto bajo "Envío al cliente". */
export function textoEnvio(c: Pick<Constancia['cabecera'], 'envioEstado' | 'envioDestino' | 'envioDetalle' | 'cerradaEn'>): string {
  switch (c.envioEstado) {
    case 'enviado':
      return c.envioDestino ?? 'Constancia enviada al cliente.';
    case 'error':
      return c.envioDetalle ?? 'No se pudo enviar el correo.';
    case 'desactivado':
      return 'El envío por correo está desactivado: entrega la constancia al cliente por otro medio.';
    case 'sin_correo':
      return 'El contacto del cliente no tiene correo registrado.';
    default:
      return 'Se envía cuando estén todas las firmas';
  }
}

export type ResultadoConstancia = 'cerrado' | 'falta' | 'lista' | 'sin_firma';

/** En qué punto está la constancia: cerrada, generada con firmas pendientes, lista para generar o sin la firma del cliente. */
export function resultadoConstancia(c: Constancia['cabecera']): ResultadoConstancia {
  if (c.cerradaEn) return 'cerrado';
  if (c.generadaEn) return 'falta';
  return c.firmada ? 'lista' : 'sin_firma';
}

export function textoInformesFirmados(c: Pick<Constancia['cabecera'], 'firmados' | 'informes'>): string {
  return `${c.firmados} de ${c.informes} firmados`;
}

export function textoFirmaCliente(c: Pick<Constancia['cabecera'], 'modo' | 'firmante' | 'firmadoEn'>): string {
  if (!c.firmadoEn) return 'Pendiente';
  return c.modo === 'fisico' ? 'Firmada en formato físico' : 'Firmada por el cliente';
}

/** El mensaje bajo el botón "Generar constancia". */
export function ayudaGenerar(firmada: boolean): string {
  return firmada ? 'Al generarla, si todos firmaron, el servicio se cierra.' : '«Generar constancia» se habilita con la firma del cliente.';
}

/** Un responsable que aún no firma, para "Falta firmar: Luis Torres · Supervisor de calidad · IT 0924-2026". */
export function textoFalta(f: { nombre: string; cargo: string | null; informes: string | null }): { titulo: string; detalle: string } {
  return { titulo: f.nombre, detalle: [f.cargo, f.informes ? `IT ${f.informes.replace(/ · /g, ' · IT ')}` : null].filter(Boolean).join(' · ') };
}

export const MOTIVO_AUSENTE_MIN = 5;
export const MOTIVO_AUSENTE_MAX = 300;
export const motivoAusenteValido = (t: string) => t.trim().length >= MOTIVO_AUSENTE_MIN && t.trim().length <= MOTIVO_AUSENTE_MAX;
export const nombreFirmanteValido = (t: string) => t.trim().length >= 3 && t.trim().length <= 150;
export const MENSAJE_PROXIMAMENTE = 'Próximamente: necesita la página pública de firma, que aún no está disponible.';
