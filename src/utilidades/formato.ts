/** "2026-05-24" + "08:30" → "24/05/2026 - 08:30 AM" (fechas del back en hora de Lima). */
export function fechaHora(fecha: string | null, hora: string | null): string {
  if (!fecha) return '';
  const [a, m, d] = fecha.slice(0, 10).split('-');
  let texto = `${d}/${m}/${a}`;
  if (hora) texto += ` - ${hora12(hora)}`;
  return texto;
}

/** "08:30" + "12:30" → "08:30 – 12:30" (sin hora de fin, solo el inicio; sin inicio, vacío). */
export function horario(inicio: string | null | undefined, fin?: string | null): string {
  if (!inicio) return '';
  const desde = inicio.slice(0, 5);
  const hasta = fin ? fin.slice(0, 5) : '';
  return hasta && hasta !== desde ? `${desde} – ${hasta}` : desde;
}

/** "2026-10-26" + "08:30" (+ "12:30") → "26/10/2026 · 08:30 – 12:30" (formato de la tarjeta de la agenda, HU-03). */
export function fechaHoraAgenda(fecha: string | null, hora: string | null, horaFin?: string | null): string {
  if (!fecha) return '';
  const [a, m, d] = fecha.slice(0, 10).split('-');
  const h = horario(hora, horaFin);
  return h ? `${d}/${m}/${a} · ${h}` : `${d}/${m}/${a}`;
}

/** 4 → "4 h"; 1.5 → "1,5 h"; nulo o no positivo → "". */
export function textoDuracion(horas: number | null | undefined): string {
  if (horas == null || !Number.isFinite(horas) || horas <= 0) return '';
  const redondeado = Math.round(horas * 100) / 100;
  return `${String(redondeado).replace('.', ',')} h`;
}

/** "08:30" → "08:30 AM" */
export function hora12(hora: string | null): string {
  if (!hora) return '';
  const [h, min] = hora.split(':').map(Number);
  const sufijo = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${String(h12).padStart(2, '0')}:${String(min).padStart(2, '0')} ${sufijo}`;
}

/** "2026-03-03T15:30:00" → "03/03/2026" */
export function fechaCorta(valor: string | null): string {
  if (!valor) return '';
  const [a, m, d] = valor.slice(0, 10).split('-');
  return d && m && a ? `${d}/${m}/${a}` : valor;
}

/** Solo dígitos y "+" (para el enlace tel:, evita inyectar otros esquemas o parámetros). */
export function telefonoMarcable(telefono: string | null): string | null {
  const limpio = (telefono ?? '').replace(/[^\d+]/g, '');
  return limpio.length >= 6 ? limpio : null;
}

/** "2026-10-26T08:45:00" → "08:45" (hora de Lima que envía el back). */
export function horaDe(valor: string | null | undefined): string {
  if (!valor) return '—';
  const m = /T(\d{2}):(\d{2})/.exec(valor);
  return m ? `${m[1]}:${m[2]}` : valor;
}

/** Suma minutos a una fecha del back ("yyyy-MM-ddTHH:mm:ss", hora de Lima) sin pasar por la zona del celular. */
export function sumarMinutos(valor: string | null | undefined, minutos: number): string | null {
  if (!valor) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(valor);
  if (!m) return null;
  const base = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) + Math.round(minutos) * 60_000;
  return new Date(base).toISOString().slice(0, 19);
}

/** Hora actual de Lima "HH:mm" (sin depender de la zona horaria configurada en el celular). */
export function horaLimaAhora(): string {
  const lima = new Date(Date.now() - 5 * 3600_000);
  return lima.toISOString().slice(11, 16);
}
