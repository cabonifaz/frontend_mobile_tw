import type { ContextoAsistente, FuenteConsultada, FuenteRespuesta, RespuestaAsistente, TipoGuardado } from '@/api/asistente';

/**
 * HU-19 — Asistente IA y Procedimientos. Textos y reglas de pantalla; quien decide si hay respuesta, qué documento la respalda y si la cita es
 * verídica es el back: aquí solo se arman los textos de la maqueta (contexto, recientes, chips de la fuente, guardados) y se validan los datos
 * que el técnico escribe.
 */

export const PREGUNTA_MIN = 3;
export const PREGUNTA_MAX = 500;
/** Tope de la grabación de voz (la consulta por voz es corta). */
export const DURACION_MAX_VOZ_SEG = 30;
export const MENSAJE_VOZ_NO_DISPONIBLE = 'La voz estará disponible con la próxima versión instalada de la app.';
export const MENSAJE_SIN_MOTIVO = 'No encontré este tema en los manuales oficiales de este equipo.';

/** Pregunta sin espacios sobrantes (varios espacios o saltos seguidos quedan en uno). */
export function limpiarPregunta(texto: string): string {
  return texto.replace(/\s+/g, ' ').trim();
}

/** La pregunta se envía con 3 a 500 caracteres. */
export function preguntaValida(texto: string): boolean {
  const n = limpiarPregunta(texto).length;
  return n >= PREGUNTA_MIN && n <= PREGUNTA_MAX;
}

/** Mensaje bajo el campo cuando la pregunta no es válida; null si lo es (o si aún está vacía). */
export function errorPregunta(texto: string): string | null {
  const n = limpiarPregunta(texto).length;
  if (n === 0) return null;
  if (n < PREGUNTA_MIN) return `Escribe al menos ${PREGUNTA_MIN} caracteres.`;
  if (n > PREGUNTA_MAX) return `La consulta admite hasta ${PREGUNTA_MAX} caracteres.`;
  return null;
}

/** "OS-000845" → "OS 000845" (como se lee en la maqueta: "OS 0845-2026"). */
export function numeroOsCorto(numeroOs: string): string {
  return numeroOs.replace(/^OS[-\s]*/i, 'OS ').trim();
}

/** Primera línea de la tarjeta de contexto: "Contexto: Mettler Toledo PBA430". */
export function textoContexto(c: Pick<ContextoAsistente, 'marca' | 'modelo' | 'nombre'>): string {
  const equipo = [c.marca, c.modelo].filter((x): x is string => !!x && x.trim().length > 0).join(' ');
  return `Contexto: ${equipo || c.nombre}`;
}

/** Segunda línea: "Balanza de plataforma · BAL-012 · OS 000845". */
export function detalleContexto(c: Pick<ContextoAsistente, 'nombre' | 'codigoCliente' | 'numeroOs'>): string {
  return [c.nombre, c.codigoCliente, numeroOsCorto(c.numeroOs)].filter((x): x is string => !!x && x.trim().length > 0).join(' · ');
}

/** La consulta que se envía al tocar una sugerencia: "Ajuste de excentricidad PBA430". */
export function preguntaDeSugerencia(sugerencia: string, c: Pick<ContextoAsistente, 'modelo'> | null): string {
  const modelo = c?.modelo?.trim();
  return limpiarPregunta(modelo ? `${sugerencia} ${modelo}` : sugerencia);
}

const MESES = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];

function partes(iso: string): { anio: number; mes: number; dia: number; hora: string } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(iso);
  if (!m) return null;
  return { anio: Number(m[1]), mes: Number(m[2]), dia: Number(m[3]), hora: m[4] ? `${m[4]}:${m[5]}` : '' };
}

/** Hora de Lima ahora, sin zona ("2026-11-10T08:15:00"), el formato en que llegan las fechas del back. */
export function ahoraLima(ahora: Date = new Date()): string {
  return new Date(ahora.getTime() - 5 * 3_600_000).toISOString().slice(0, 19);
}

/** "Hoy 10:20", "Ayer" o "09/11" para las consultas recientes (las fechas del back son hora de Lima sin zona). */
export function cuandoReciente(creadoEn: string, ahora: string = ahoraLima()): string {
  const f = partes(creadoEn);
  const h = partes(ahora);
  if (!f || !h) return '';
  const dias = Math.round((Date.UTC(h.anio, h.mes - 1, h.dia) - Date.UTC(f.anio, f.mes - 1, f.dia)) / 86_400_000);
  if (dias === 0) return f.hora ? `Hoy ${f.hora}` : 'Hoy';
  if (dias === 1) return 'Ayer';
  return `${String(f.dia).padStart(2, '0')}/${MESES[f.mes - 1] ?? String(f.mes).padStart(2, '0')}`;
}

/** Línea de "Consultas recientes": "Hoy 10:20 · Manual PBA430 §6.4". */
export function textoReciente(r: { creadoEn: string; fuente: string | null }, ahora?: string): string {
  const cuando = cuandoReciente(r.creadoEn, ahora);
  return [cuando, r.fuente].filter((x): x is string => !!x && x.length > 0).join(' · ');
}

/** "6.4 Ajuste de excentricidad" → "6.4"; sin numeración devuelve el texto completo. */
export function numeroDeSeccion(seccion: string | null | undefined): string | null {
  const s = seccion?.trim();
  if (!s) return null;
  const m = /^(?:secci[oó]n\s+)?(\d+(?:\.\d+)*)/i.exec(s);
  return m ? m[1] : s;
}

/** Chip de la fuente: "Manual PBA430 v2.0 · Sección 6.4". */
export function chipFuente(f: Pick<FuenteRespuesta, 'documento' | 'seccion'>): string {
  const sec = numeroDeSeccion(f.seccion);
  return sec ? `${f.documento} · Sección ${sec}` : f.documento;
}

/** Chip de la página: "Pág. 42" (null si no se conoce). */
export function chipPagina(f: Pick<FuenteRespuesta, 'pagina'>): string | null {
  return f.pagina && f.pagina > 0 ? `Pág. ${f.pagina}` : null;
}

/** "03/2026" a partir de "2026-03-01" (fecha de actualización del documento). */
export function mesAnio(fecha: string | null | undefined): string | null {
  const f = fecha ? partes(fecha) : null;
  return f ? `${String(f.mes).padStart(2, '0')}/${f.anio}` : null;
}

/** Segunda línea de la tarjeta del documento: "Mettler Toledo · actualizado 03/2026 · pág. 42". */
export function detalleDocumento(f: Pick<FuenteConsultada, 'entidad' | 'actualizado' | 'pagina'>): string {
  const act = mesAnio(f.actualizado);
  return [f.entidad, act ? `actualizado ${act}` : null, f.pagina && f.pagina > 0 ? `pág. ${f.pagina}` : null].filter((x): x is string => !!x && x.length > 0).join(' · ');
}

export interface EtiquetaVerificacion {
  texto: string;
  /** ok = verde; aviso = amarillo (la cita no se encontró en el PDF). */
  tono: 'ok' | 'aviso';
}

/** true → "Verificada en el PDF"; false → "No verificada: confírmalo en el manual"; null (PDF sin texto) → sin etiqueta. */
export function etiquetaVerificacion(verificada: boolean | null | undefined): EtiquetaVerificacion | null {
  if (verificada === true) return { texto: 'Verificada en el PDF', tono: 'ok' };
  if (verificada === false) return { texto: 'No verificada: confírmalo en el manual', tono: 'aviso' };
  return null;
}

/** Qué decir cuando la IA no encontró el tema en los documentos. */
export function mensajeSinRespuesta(r: Pick<RespuestaAsistente, 'motivoSinRespuesta'>): string {
  return r.motivoSinRespuesta?.trim() || MENSAJE_SIN_MOTIVO;
}

/** "1.2 MB", "840 KB", "180 B". */
export function tamanoTexto(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '';
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Texto de la transcripción de voz, entre comillas angulares como en la maqueta. */
export function textoTranscripcion(texto: string): string {
  return `«${limpiarPregunta(texto)}»`;
}

/** Segundos de la grabación: "0:07". */
export function textoSegundos(seg: number): string {
  const s = Math.max(0, Math.floor(seg));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Quita acentos y mayúsculas para buscar sin distinguirlos. */
export function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/** Filtra la lista de guardados por el texto buscado (título o subtítulo, sin acentos ni mayúsculas). Vacío = todos. */
export function filtrarGuardados<T extends { titulo: string; subtitulo: string }>(lista: T[], busqueda: string): T[] {
  const q = normalizar(busqueda);
  if (!q) return lista;
  return lista.filter((g) => normalizar(`${g.titulo} ${g.subtitulo}`).includes(q));
}

/** Texto corto de la pregunta para usarla de título (máx. 80 caracteres). */
export function tituloDePregunta(pregunta: string): string {
  const p = limpiarPregunta(pregunta).replace(/^[¿?]+|[?]+$/g, '');
  const t = p.length > 80 ? `${p.slice(0, 79).trimEnd()}…` : p;
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : 'Consulta';
}

/** Título de un guardado: la pregunta (respuesta) o "Sección 6.4 completa" / el texto de la sección (fragmento). */
export function tituloGuardado(tipo: TipoGuardado, r: Pick<RespuestaAsistente, 'pregunta'> | null, f: Pick<FuenteConsultada, 'seccion' | 'documento'> | null): string {
  if (tipo === 'respuesta') return tituloDePregunta(r?.pregunta ?? '');
  const sec = numeroDeSeccion(f?.seccion);
  if (sec && /^\d/.test(sec)) return `Sección ${sec} completa`;
  return f?.seccion?.trim() || f?.documento || 'Fragmento';
}

/** Subtítulo de un guardado: "Manual PBA430 v2.0 · §6.4 · respuesta" (como lo arma el back). */
export function subtituloGuardado(tipo: TipoGuardado, f: Pick<FuenteConsultada, 'documento' | 'seccion'> | null): string {
  const sec = numeroDeSeccion(f?.seccion);
  return [f?.documento, sec ? `§${sec}` : null, tipo === 'respuesta' ? 'respuesta' : 'fragmento'].filter((x): x is string => !!x && x.length > 0).join(' · ');
}

/** Una fuente de la respuesta convertida en la vista de "Fuente consultada" sin ir al servidor (para guardar el fragmento ya mismo). */
export function fuenteDesdeRespuesta(r: RespuestaAsistente, f: FuenteRespuesta): FuenteConsultada {
  return {
    idConsulta: r.idConsulta,
    n: f.n,
    idDocumento: f.idDocumento,
    documento: f.documento,
    tipo: f.tipo,
    oficial: true,
    entidad: f.entidad,
    version: f.version,
    actualizado: f.actualizado,
    pagina: f.pagina,
    seccion: f.seccion,
    advertencia: r.advertencia,
    fragmento: f.fragmento ?? '',
    contextoPosterior: null,
    verificada: f.verificada,
  };
}

/** La vista de "Fuente consultada" de un guardado: el fragmento guardado, o la fuente `n` (o la primera con fragmento) de la respuesta guardada. */
export function fuenteDeGuardado(g: { fuente: FuenteConsultada | null; respuesta: RespuestaAsistente | null }, n: number): FuenteConsultada | null {
  if (g.fuente) return g.fuente;
  const r = g.respuesta;
  if (!r) return null;
  const f = r.fuentes.find((x) => x.n === n && !!x.fragmento) ?? r.fuentes.find((x) => !!x.fragmento);
  return f ? fuenteDesdeRespuesta(r, f) : null;
}

/** Las fuentes de una respuesta que traen fragmento citado (las que se pueden abrir y guardar). */
export function fuentesConFragmento(r: Pick<RespuestaAsistente, 'fuentes'>): FuenteRespuesta[] {
  return r.fuentes.filter((f) => !!f.fragmento && f.fragmento.trim().length > 0);
}
