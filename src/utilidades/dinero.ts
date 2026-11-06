/** 182.5 → "182.50"; 1234.5 → "1,234.50" (miles con coma y dos decimales, como en la intranet). */
export function numeroConMiles(valor: number | null | undefined): string {
  const n = typeof valor === 'number' && Number.isFinite(valor) ? valor : 0;
  const [entero, decimales] = Math.abs(n).toFixed(2).split('.');
  return `${n < 0 && Number(entero + decimales) !== 0 ? '-' : ''}${entero.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${decimales}`;
}

/** 182.5 → "S/ 182.50". Otra moneda: monto(12, '$') → "$ 12.00". */
export function monto(valor: number | null | undefined, moneda: string = 'S/'): string {
  return `${moneda} ${numeroConMiles(valor)}`;
}

/** 182.5 → "S/ 182.50". */
export const soles = (valor: number | null | undefined): string => monto(valor, 'S/');
