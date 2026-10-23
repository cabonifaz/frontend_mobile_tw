/** "2026-05-24" + "08:30" → "24/05/2026 - 08:30 AM" (fechas del back en hora de Lima). */
export function fechaHora(fecha: string | null, hora: string | null): string {
  if (!fecha) return '';
  const [a, m, d] = fecha.slice(0, 10).split('-');
  let texto = `${d}/${m}/${a}`;
  if (hora) texto += ` - ${hora12(hora)}`;
  return texto;
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
