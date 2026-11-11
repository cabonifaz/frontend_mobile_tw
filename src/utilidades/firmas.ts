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
const DISTANCIA_MINIMA = 0.0035;

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

/** Distancia en "píxeles equivalentes" (el alto del lienzo es ASPECTO_FIRMA veces menor que el ancho). */
const distanciaLienzo = (a: [number, number], b: [number, number]) => Math.hypot(a[0] - b[0], (a[1] - b[1]) / ASPECTO_FIRMA);
/** Separación mínima entre puntos guardados (≈ 0,5 px): solo evita duplicados; los puntos son los reales del dedo, como en Paint. */
const SEPARACION_CAPTURA = 0.002;

/** Captura de un punto táctil tal cual lo entrega la pantalla (sin filtros ni suavizado); se ignora solo si no se movió. */
export function agregarPuntoTactil(t: Trazos, crudo: [number, number]): Trazos {
  if (t.length === 0 || totalPuntos(t) >= MAX_PUNTOS) return t;
  const ultimo = t[t.length - 1];
  const previo = ultimo[ultimo.length - 1];
  if (previo && distanciaLienzo(crudo, previo) < SEPARACION_CAPTURA) return t;
  return [...t.slice(0, -1), [...ultimo, crudo]];
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
  /** Grosor del tramo (px), parejo en todo el trazo. */
  grosor: number;
}

/**
 * Trazo suave: curvas suaves por los puntos tocados para que no se formen esquinas, sin retrasarse del dedo.
 * Grosor parejo. Solo se calcula al dibujar: lo guardado sigue siendo los puntos normalizados.
 */
/** Curvas por tanda: cada tanda se memoriza y al dibujar solo se recalcula la última. */
export const CURVAS_POR_TANDA = 20;

/**
 * Puntos reales del dedo unidos con curvas suaves (cuadráticas por los puntos medios; los puntos tocados son los controles). Si el dedo va rápido y la pantalla
 * entrega pocos puntos, las esquinas se redondean; con puntos juntos queda igual que líneas rectas. Lo ya dibujado no cambia al llegar un punto nuevo y el último
 * tramo llega recto hasta el dedo. "continua" = la tanda empieza en el punto medio de la anterior; "final" = incluye el tramo hasta el último punto.
 */
/** ¿El trazo gira bruscamente en `p` (más de ~70°)? Ahí se conserva la esquina real (una "v", una "n"…) en vez de redondearla. */
export function esAgudo(a: [number, number], p: [number, number], c: [number, number], ancho = 1, alto = 1): boolean {
  const ux = (p[0] - a[0]) * ancho, uy = (p[1] - a[1]) * alto, vx = (c[0] - p[0]) * ancho, vy = (c[1] - p[1]) * alto;
  const m = Math.hypot(ux, uy) * Math.hypot(vx, vy);
  return m > 0 && (ux * vx + uy * vy) / m < 0.3;
}

export function segmentosTinta(trazo: [number, number][], ancho: number, alto: number, grosor: number, opciones: { continua?: boolean; final?: boolean; inicioAgudo?: boolean } = {}): SegmentoTinta[] {
  const { continua = false, final = true, inicioAgudo = false } = opciones;
  if (trazo.length === 0) return [];
  const P = trazo.map((p) => ({ x: p[0] * ancho, y: p[1] * alto }));
  if (P.length === 1) return [{ izquierda: P[0].x - grosor / 2, arriba: P[0].y - grosor / 2, largo: grosor, angulo: 0, grosor }];
  const n = P.length;
  const mitad = (u: { x: number; y: number }, v: { x: number; y: number }) => ({ x: (u.x + v.x) / 2, y: (u.y + v.y) / 2 });
  let ini = continua && !inicioAgudo ? mitad(P[0], P[1]) : P[0];
  const pts: { x: number; y: number }[] = [ini];
  for (let i = 1; i < n - 1; i++) {
    const fin = esAgudo(trazo[i - 1], trazo[i], trazo[i + 1], ancho, alto) ? P[i] : mitad(P[i], P[i + 1]);
    const pasos = Math.min(14, Math.max(1, Math.ceil((Math.hypot(P[i].x - ini.x, P[i].y - ini.y) + Math.hypot(fin.x - P[i].x, fin.y - P[i].y)) / 3)));
    for (let k = 1; k <= pasos; k++) {
      const t = k / pasos, u = 1 - t;
      pts.push({ x: u * u * ini.x + 2 * u * t * P[i].x + t * t * fin.x, y: u * u * ini.y + 2 * u * t * P[i].y + t * t * fin.y });
    }
    ini = fin;
  }
  if (final) pts.push(P[n - 1]);
  const res: SegmentoTinta[] = [];
  for (let i = 1; i < pts.length; i++) {
    const u = pts[i - 1], v = pts[i];
    const largo = Math.hypot(v.x - u.x, v.y - u.y) + grosor;
    res.push({ izquierda: (u.x + v.x) / 2 - largo / 2, arriba: (u.y + v.y) / 2 - grosor / 2, largo, angulo: Math.atan2(v.y - u.y, v.x - u.x), grosor });
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
