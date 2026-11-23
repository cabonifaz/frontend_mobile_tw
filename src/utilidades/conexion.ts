/**
 * HU-18 — Textos del aviso de conexión y de la descarga del día. Sin acceso al teléfono: solo arman frases.
 */
export const TEXTO_SIN_CONEXION = 'Sin conexión · lo que registres se guarda en el teléfono';

/** Cuánto se queda visible el aviso «Conexión recuperada». */
export const DURACION_AVISO_RECUPERADA_MS = 6_000;

/** "Sin conexión · lo que registres se guarda en el teléfono · 3 por enviar". */
export function textoBannerSinConexion(pendientes: number): string {
  return pendientes > 0 ? `${TEXTO_SIN_CONEXION} · ${pendientes} por enviar` : TEXTO_SIN_CONEXION;
}

/** "Se enviaron 14 registros automáticamente" / "Se envió 1 registro automáticamente"; null si no se envió nada. */
export function textoRegistrosEnviados(n: number): string | null {
  if (n <= 0) return null;
  return n === 1 ? 'Se envió 1 registro automáticamente' : `Se enviaron ${n} registros automáticamente`;
}

/** "datos del día descargados 07:40" (hora local del teléfono); vacío si hoy aún no se descargó. */
export function textoDescargaDelDia(hora: string | null | undefined): string {
  return hora ? `datos del día descargados ${hora}` : '';
}
