import type { AlertaPanel, FiltroServicios, ServicioActivo, TonoHito } from '@/api/panelCampo';
import { colores } from '@/tema/colores';

/**
 * HU-29 / HU-30 — Reglas de pantalla del Panel de Campo y del Seguimiento del servicio: etiquetas y colores de estado, mapa esquemático, textos de las
 * tarjetas, enlaces de llamada y de mapas, y validación del cambio de estado y del aviso al cliente (los mismos límites que el servidor). Quién ve qué, el estado
 * de cada servicio y las reglas del cambio de estado las decide el back.
 */

export const MIN_COMENTARIO = 10;
export const MAX_COMENTARIO = 1000;
export const MIN_AVISO = 5;
export const MAX_AVISO = 450;

export interface EtiquetaEstado {
  texto: string;
  fondo: string;
  color: string;
}

/** Etiqueta de la tarjeta del servicio según el estado de la bandeja de seguimiento. */
export function etiquetaEstado(estado: string): EtiquetaEstado {
  switch (estado) {
    case 'en_ejecucion':
      return { texto: 'EN EJECUCIÓN', fondo: colores.verdeEtiquetaFondo, color: colores.verdeEtiquetaTexto };
    case 'con_demora':
      return { texto: 'DEMORA', fondo: colores.amarilloFondo, color: colores.amarilloTexto };
    case 'con_incidente':
      return { texto: 'INCIDENCIA', fondo: colores.rojoEtiquetaFondo, color: colores.rojoEtiquetaTexto };
    case 'en_ruta':
      return { texto: 'EN RUTA', fondo: colores.azulFondo, color: colores.azulTexto };
    case 'en_planta':
      return { texto: 'EN PLANTA', fondo: colores.azulFondo, color: colores.azulTexto };
    case 'finalizado':
      return { texto: 'FINALIZADO', fondo: colores.grisFondo, color: colores.grisTexto };
    default:
      return { texto: 'SIN SALIR', fondo: colores.grisFondo, color: colores.grisTexto };
  }
}

/** Nombre corto del estado para los chips del detalle ("Ejecución", "Demora"…). */
export function nombreCortoEstado(estado: string): string {
  return (
    { en_ejecucion: 'Ejecución', con_demora: 'Demora', con_incidente: 'Incidencia', en_ruta: 'En ruta', en_planta: 'En planta', finalizado: 'Finalizado' } as Record<string, string>
  )[estado] ?? 'Sin salir';
}

export function colorEstado(estado: string): string {
  switch (estado) {
    case 'en_ejecucion':
      return colores.verde;
    case 'con_demora':
      return colores.naranja;
    case 'con_incidente':
      return colores.rojo;
    case 'en_ruta':
    case 'en_planta':
      return colores.primario;
    default:
      return colores.textoTenue;
  }
}

/** Color del pin del mapa según el estado del servicio (se usa cuando el servidor no manda el color de la actividad). */
export const colorPin = colorEstado;

/**
 * Color del pin / avatar de un técnico: el que calcula el servidor según lo que hace (el mismo del Mapa Operativo de la intranet: al marcar «Inicio de labores»
 * sale verde, en refrigerio naranja…); si no llega, el del estado de su servicio.
 */
export function colorTecnico(p: { actividadColor?: string | null; estado: string }): string {
  return /^#[0-9A-Fa-f]{6}$/.test(p.actividadColor ?? '') ? (p.actividadColor as string) : colorEstado(p.estado);
}

/** Leyenda del mapa: los mismos colores y nombres del Mapa Operativo de la intranet (los colores los manda el servidor en cada pin). */
export const LEYENDA_MAPA: { texto: string; color: string }[] = [
  { texto: 'Técnico activo', color: '#16A34A' },
  { texto: 'En ruta', color: '#2563EB' },
  { texto: 'En planta', color: '#14B8A6' },
  { texto: 'Ejecutando trabajo', color: '#EAB308' },
  { texto: 'En refrigerio', color: '#F97316' },
  { texto: 'Con demora', color: '#EA580C' },
  { texto: 'Con incidente crítico', color: '#DC2626' },
  { texto: 'Finalizado', color: '#64748B' },
  { texto: 'Sin salir aún', color: '#94A3B8' },
];

/** "hace 5 min", "hace 2 h": hace cuánto llegó la última ubicación GPS de un técnico (null = aún no envía ninguna hoy). */
export function textoHaceMinutos(minutos: number | null): string {
  if (minutos === null) return 'Sin ubicación hoy';
  if (minutos < 1) return 'ahora mismo';
  if (minutos < 60) return `hace ${Math.round(minutos)} min`;
  return `hace ${Math.floor(minutos / 60)} h`;
}

/** Color de un hito, un evento o un punto de la línea de tiempo según el tono que manda el back. */
export function colorTono(tono: TonoHito | string): string {
  switch (tono) {
    case 'verde':
      return colores.verde;
    case 'azul':
      return colores.primario;
    case 'naranja':
      return colores.naranja;
    case 'rojo':
      return colores.rojo;
    case 'amarillo':
      return '#F59E0B';
    default:
      return '#C7CFDB';
  }
}

/** Chip del evento en ruta ("OK", "+35 MIN", "ALERTA"): fondo y texto. */
export function colorBadge(tono: TonoHito | string): { fondo: string; color: string } {
  switch (tono) {
    case 'verde':
      return { fondo: colores.verdeEtiquetaFondo, color: colores.verdeEtiquetaTexto };
    case 'rojo':
      return { fondo: colores.rojoEtiquetaFondo, color: colores.rojoEtiquetaTexto };
    default:
      return { fondo: colores.amarilloFondo, color: colores.amarilloTexto };
  }
}

/** "hace 2 min", "hace 1 h 5 min", "ahora". */
export function haceMinutos(min: number | null | undefined): string {
  if (min === null || min === undefined) return '';
  if (min < 1) return 'ahora';
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `hace ${h} h` : `hace ${h} h ${m} min`;
}

/** Tarjeta de alerta: la insignia de la derecha y su color. */
export function insigniaAlerta(a: Pick<AlertaPanel, 'tipo' | 'severidad'>): { texto: string; fondo: string; color: string } {
  const critica = a.severidad === 'critica';
  const texto =
    ({
      error_critico: 'ERROR CRÍTICO',
      incidente: 'INCIDENCIA',
      demora: 'DEMORA',
      perdida_contacto: 'SIN SEÑAL',
      gps_parado: 'GPS PARADO',
      sin_ingreso_post_llegada: 'SIN INGRESO',
      sin_iniciar_servicio: 'SIN INICIAR',
    } as Record<string, string>)[a.tipo] ?? 'ALERTA';
  return critica
    ? { texto, fondo: colores.rojoEtiquetaFondo, color: colores.rojoEtiquetaTexto }
    : { texto, fondo: colores.amarilloFondo, color: colores.amarilloTexto };
}

/** Línea de la persona en la alerta: "Juan Pérez · BAL-012". */
export function lineaTecnicoAlerta(a: Pick<AlertaPanel, 'tecnico' | 'equipo'>): string {
  return [a.tecnico, a.equipo].filter((x): x is string => !!x && x.trim() !== '').join(' · ');
}

/** Última línea de la alerta: "Pesaje fuera de EMP · pide apoyo · hace 2 min". */
export function lineaDetalleAlerta(a: Pick<AlertaPanel, 'detalle' | 'minutos'>): string {
  return [a.detalle, haceMinutos(a.minutos)].filter((x): x is string => !!x && x.trim() !== '').join(' · ');
}

/** "Servicio Técnico · actualizado 10:46". */
export function textoActualizado(area: string | null | undefined, hora: string | null | undefined): string {
  return [area, hora ? `actualizado ${hora}` : null].filter((x): x is string => !!x).join(' · ');
}

export const FILTROS: { id: FiltroServicios; texto: string }[] = [
  { id: 'activos', texto: 'Activos' },
  { id: 'demora', texto: 'Con demora' },
  { id: 'incidencias', texto: 'Incidencias' },
  { id: 'finalizados', texto: 'Finalizados' },
];

/** Texto del chip: solo "Activos" lleva su contador, como en la maqueta ("Activos (8)"). */
export function textoFiltro(id: FiltroServicios, activos: number): string {
  const base = FILTROS.find((f) => f.id === id)?.texto ?? id;
  return id === 'activos' ? `${base} (${activos})` : base;
}

/** "Planta Ate · llegada 08:27" / "Av. Néstor Gambetta · ETA 09:45". */
export function lugarLlegada(s: Pick<ServicioActivo, 'lugar' | 'llegada' | 'eta'>): string {
  const cola = s.llegada ? `llegada ${s.llegada}` : s.eta ? `ETA ${s.eta}` : null;
  return [s.lugar, cola].filter((x): x is string => !!x && x.trim() !== '').join(' · ');
}

/** Iniciales para el avatar del técnico. */
export function inicialesDe(nombre: string | null | undefined): string {
  const partes = (nombre ?? '').trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return '?';
  return (partes[0][0] + (partes.length > 1 ? partes[partes.length - 1][0] : '')).toUpperCase();
}

// ── Mapa esquemático (sin librería de mapas: los pines se colocan en proporción a la latitud y la longitud) ──────────────────────────

export interface PuntoGeo {
  latitud: number;
  longitud: number;
}

export interface PuntoPantalla {
  x: number;
  y: number;
}

/** Posición en pantalla de cada punto dentro de un recuadro, dejando un margen. Un solo punto queda al centro; el recuadro nunca se acerca más de ~200 m. */
export function proyectar(puntos: PuntoGeo[], ancho: number, alto: number, margen: number): PuntoPantalla[] {
  if (puntos.length === 0) return [];
  const lats = puntos.map((p) => p.latitud);
  const lons = puntos.map((p) => p.longitud);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const MIN_SPAN = 0.004; // ≈ 400 m: evita que dos pines casi iguales ocupen todo el mapa
  const spanLat = Math.max(maxLat - minLat, MIN_SPAN);
  const spanLon = Math.max(maxLon - minLon, MIN_SPAN);
  const cLat = (maxLat + minLat) / 2;
  const cLon = (maxLon + minLon) / 2;
  const w = Math.max(ancho - 2 * margen, 1);
  const h = Math.max(alto - 2 * margen, 1);
  return puntos.map((p) => ({
    x: margen + ((p.longitud - (cLon - spanLon / 2)) / spanLon) * w,
    y: margen + (((cLat + spanLat / 2) - p.latitud) / spanLat) * h,
  }));
}

export interface Segmento {
  /** Esquina superior izquierda del rectángulo ANTES de girar (el centro es el del segmento). */
  izquierda: number;
  arriba: number;
  largo: number;
  /** Grados. */
  angulo: number;
}

/** Segmentos que unen los puntos en orden (la ruta GPS se dibuja como líneas finas giradas). */
export function segmentos(puntos: PuntoPantalla[], grosor = 4): Segmento[] {
  const salida: Segmento[] = [];
  for (let i = 1; i < puntos.length; i++) {
    const a = puntos[i - 1];
    const b = puntos[i];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const largo = Math.hypot(dx, dy);
    if (largo < 0.5) continue;
    const cx = (a.x + b.x) / 2;
    const cy = (a.y + b.y) / 2;
    salida.push({ izquierda: cx - largo / 2, arriba: cy - grosor / 2, largo, angulo: (Math.atan2(dy, dx) * 180) / Math.PI });
  }
  return salida;
}

/** Línea de guiones entre los puntos en orden (la ruta prevista, a diferencia del recorrido real que va continuo). */
export function guiones(puntos: PuntoPantalla[], largoGuion = 9, hueco = 6, grosor = 3): Segmento[] {
  const salida: Segmento[] = [];
  for (let i = 1; i < puntos.length; i++) {
    const a = puntos[i - 1];
    const b = puntos[i];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const total = Math.hypot(dx, dy);
    if (total < 1) continue;
    const angulo = (Math.atan2(dy, dx) * 180) / Math.PI;
    for (let d = 0; d < total; d += largoGuion + hueco) {
      const largo = Math.min(largoGuion, total - d);
      const centro = d + largo / 2;
      const cx = a.x + (dx * centro) / total;
      const cy = a.y + (dy * centro) / total;
      salida.push({ izquierda: cx - largo / 2, arriba: cy - grosor / 2, largo, angulo });
    }
  }
  return salida;
}

// ── Enlaces ────────────────────────────────────────────────────────────────────────────────────────────

/** `tel:` con el teléfono de la ficha, solo dígitos (y el + inicial). null si no hay un número usable. */
export function enlaceLlamada(telefono: string | null | undefined): string | null {
  const t = (telefono ?? '').trim();
  const digitos = t.replace(/\D/g, '');
  if (digitos.length < 6 || digitos.length > 15) return null;
  return `tel:${t.startsWith('+') ? '+' : ''}${digitos}`;
}

const coord = (n: number) => n.toFixed(6);

/** Abre la app de mapas del teléfono con la ruta hasta la planta del cliente (desde la posición del técnico si se conoce). */
export function enlaceRutaMapas(destino: PuntoGeo | null, origen?: PuntoGeo | null): string | null {
  if (!destino) return null;
  const o = origen ? `&origin=${coord(origen.latitud)},${coord(origen.longitud)}` : '';
  return `https://www.google.com/maps/dir/?api=1${o}&destination=${coord(destino.latitud)},${coord(destino.longitud)}&travelmode=driving`;
}

/** Abre la app de mapas en un punto (la posición del técnico). */
export function enlacePuntoMapas(p: PuntoGeo | null): string | null {
  return p ? `https://www.google.com/maps/search/?api=1&query=${coord(p.latitud)},${coord(p.longitud)}` : null;
}

// ── Textos y validaciones ─────────────────────────────────────────────────────────────────────────────

/** "6.2 km" (a partir de 1 km) o "850 m". La distancia es en línea recta. */
export function textoDistancia(m: number | null | undefined): string {
  if (m === null || m === undefined) return '—';
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`;
}

/** Velocidad media supuesta (km/h) para estimar el tiempo cuando el técnico está detenido o el servidor no da la ETA. */
export const VELOCIDAD_MEDIA_KMH = 30;
/** La distancia es en línea recta: las calles son más largas. */
export const FACTOR_CALLES = 1.3;

/** Minutos que tardaría en llegar a la planta según la distancia en línea recta (referencial). null si no hay distancia. */
export function minutosHastaPlanta(distanciaM: number | null | undefined): number | null {
  if (distanciaM === null || distanciaM === undefined || !Number.isFinite(distanciaM)) return null;
  if (distanciaM <= 150) return 0;
  return Math.max(1, Math.round(((distanciaM * FACTOR_CALLES) / 1000 / VELOCIDAD_MEDIA_KMH) * 60));
}

/** "8 min" o "1 h 05 min". */
export function textoMinutos(min: number): string {
  const m = Math.max(0, Math.round(min));
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`;
}

/** Hora de Lima (HH:MM) dentro de "min" minutos. */
export function horaLlegada(min: number, ahora: number = Date.now()): string {
  const d = new Date(ahora + min * 60_000 - 5 * 3_600_000);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

export function textoVelocidad(kmh: number | null | undefined): string {
  return kmh === null || kmh === undefined ? '—' : `${Math.round(kmh)} km/h`;
}

/** "Servicio programado", "En ruta"… el estado de la OS para el modal. */
export function nombreEstadoOs(estadoOs: string): string {
  return (
    { programada: 'Programada', reprogramada: 'Reprogramada', en_ruta: 'En ruta', en_ejecucion: 'En ejecución', pausada: 'Pausada', finalizada: 'Finalizada' } as Record<string, string>
  )[estadoOs] ?? estadoOs;
}

/** Mensaje sugerido para avisar al cliente del retraso (el jefe lo edita antes de registrarlo o compartirlo). */
export function mensajeRetrasoCliente(d: { cliente: string | null; numero: string; tecnico: string | null; eta: string | null }): string {
  const quien = d.tecnico ? `nuestro técnico ${d.tecnico}` : 'nuestro técnico';
  const cuando = d.eta ? ` Nueva hora estimada de llegada: ${d.eta}.` : '';
  return `Estimado cliente${d.cliente ? ` de ${d.cliente}` : ''}: le informamos que ${quien} llegará con retraso para el servicio ${d.numero}.${cuando} Disculpe las molestias. — Total Weight`;
}

export function errorCambioEstado(d: { nuevoEstado: string | null; idMotivo: number | null; comentario: string }): string | null {
  if (!d.nuevoEstado) return 'Elige el nuevo estado.';
  if (!d.idMotivo) return 'Elige el motivo del cambio.';
  const n = d.comentario.trim().length;
  if (n < MIN_COMENTARIO) return `El comentario es obligatorio (mínimo ${MIN_COMENTARIO} caracteres).`;
  if (n > MAX_COMENTARIO) return `El comentario no puede superar los ${MAX_COMENTARIO} caracteres.`;
  return null;
}

export function errorAviso(mensaje: string): string | null {
  const n = mensaje.trim().length;
  if (n < MIN_AVISO) return `Escribe el aviso al cliente (mínimo ${MIN_AVISO} caracteres).`;
  if (n > MAX_AVISO) return `El aviso no puede superar los ${MAX_AVISO} caracteres.`;
  return null;
}

/** Distancia en línea recta entre dos puntos (haversine, metros). */
export function distanciaMetros(a: PuntoGeo, b: PuntoGeo): number {
  const R = 6371000;
  const rad = (g: number) => (g * Math.PI) / 180;
  const dLat = rad(b.latitud - a.latitud);
  const dLon = rad(b.longitud - a.longitud);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitud)) * Math.cos(rad(b.latitud)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function minutosDeHora(hora: string | null | undefined): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(hora ?? '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/**
 * Minutos que el técnico lleva en el mismo punto (como "Tiempo en punto" de la intranet): desde la primera de las últimas posiciones que están a menos de
 * "radioM" metros de la actual hasta la hora actual del servidor ("actualizado", HH:MM de Lima). 0 si se está moviendo o no hay datos.
 */
export function minutosEnPunto(recorrido: { latitud: number; longitud: number; hora: string | null }[], actualizado: string | null | undefined, radioM = 60): number {
  if (recorrido.length === 0) return 0;
  const ultima = recorrido[recorrido.length - 1];
  let inicio = minutosDeHora(ultima.hora);
  for (let i = recorrido.length - 2; i >= 0; i--) {
    if (distanciaMetros(recorrido[i], ultima) > radioM) break;
    const m = minutosDeHora(recorrido[i].hora);
    if (m !== null) inicio = m;
  }
  const ahora = minutosDeHora(actualizado);
  if (inicio === null || ahora === null) return 0;
  const d = ahora - inicio < 0 ? ahora - inicio + 1440 : ahora - inicio;
  return d >= 1440 ? 0 : d;
}

/** Hora (HH:MM) de la primera posición del recorrido a menos de "radioM" metros de la planta (la "pre-llegada" del cronograma GPS); null si aún no se acercó. */
export function horaPreLlegada(recorrido: { latitud: number; longitud: number; hora: string | null }[], planta: PuntoGeo | null, radioM = 300): string | null {
  if (!planta) return null;
  const p = recorrido.find((x) => distanciaMetros(x, planta) <= radioM);
  return p?.hora ?? null;
}
