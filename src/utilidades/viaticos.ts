import type { EstadoGasto, Gasto, Viatico } from '@/api/viaticos';
import { soles } from './dinero';

/** Filtros de la pestaña Viáticos (HU-25). */
export type FiltroViaticos = 'todos' | 'activos' | 'finalizados';

export function filtrarViaticos(viaticos: readonly Viatico[], filtro: FiltroViaticos): Viatico[] {
  switch (filtro) {
    case 'activos':
      return viaticos.filter((v) => !v.cerrado);
    case 'finalizados':
      return viaticos.filter((v) => v.cerrado);
    default:
      return [...viaticos];
  }
}

/** Filtros de la pestaña Solicitudes (HU-26). */
export type FiltroGastos = 'todas' | EstadoGasto;

export function filtrarGastos(gastos: readonly Gasto[], filtro: FiltroGastos): Gasto[] {
  return filtro === 'todas' ? [...gastos] : gastos.filter((g) => g.estado === filtro);
}

export function contarGastos(gastos: readonly Gasto[]): Record<FiltroGastos, number> {
  const n: Record<FiltroGastos, number> = { todas: gastos.length, pendiente: 0, aprobado: 0, observado: 0, rechazado: 0 };
  for (const g of gastos) if (g.estado in n) n[g.estado] += 1;
  return n;
}

export interface GrupoGastos {
  /** "2026-10-26" */
  fecha: string;
  /** "HOY · 26/10/2026" o "25/10/2026" */
  titulo: string;
  gastos: Gasto[];
}

/** Agrupa por fecha del gasto, de la más reciente a la más antigua (HU-26: orden cronológico por fecha del gasto). */
export function agruparPorFecha(gastos: readonly Gasto[], hoy: string): GrupoGastos[] {
  const ordenados = [...gastos].sort((a, b) => (b.fecha ?? '').localeCompare(a.fecha ?? '') || b.idGasto - a.idGasto);
  const grupos: GrupoGastos[] = [];
  for (const g of ordenados) {
    const dia = (g.fecha ?? '').slice(0, 10);
    let grupo = grupos[grupos.length - 1];
    if (!grupo || grupo.fecha !== dia) {
      const [a, m, d] = dia.split('-');
      const texto = d && m && a ? `${d}/${m}/${a}` : 'Sin fecha';
      grupo = { fecha: dia, titulo: dia === hoy ? `HOY · ${texto}` : texto, gastos: [] };
      grupos.push(grupo);
    }
    grupo.gastos.push(g);
  }
  return grupos;
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** Total aprobado en el mes de "hoy" ("2026-10-26" → octubre). */
export function aprobadoDelMes(gastos: readonly Gasto[], hoy: string): { mes: string; total: number } {
  const prefijo = hoy.slice(0, 7);
  const mes = MESES[Number(hoy.slice(5, 7)) - 1] ?? '';
  const total = gastos
    .filter((g) => g.estado === 'aprobado' && (g.fecha ?? '').startsWith(prefijo))
    .reduce((suma, g) => suma + g.monto, 0);
  return { mes, total };
}

/** Saldo final de una rendición cerrada, para mostrarlo en la tarjeta y en el detalle. */
export function textoSaldoFinal(v: Pick<Viatico, 'cerrado' | 'saldoFinal' | 'tipoSaldo'>): { titulo: string; valor: string; detalle: string } | null {
  if (!v.cerrado || v.tipoSaldo == null) return null;
  const importe = soles(Math.abs(v.saldoFinal ?? 0));
  switch (v.tipoSaldo) {
    case 'devolucion':
      return {
        titulo: 'Devolución',
        valor: importe,
        detalle: 'Gastaste menos de lo asignado. Contabilidad te indicará cómo devolverlo.',
      };
    case 'reembolso':
      return {
        titulo: 'Reembolso adicional',
        valor: importe,
        detalle: 'Gastaste más de lo asignado. Contabilidad te depositará la diferencia.',
      };
    default:
      return { titulo: 'Cuadrado', valor: soles(0), detalle: 'Lo asignado coincide con lo aprobado: no hay saldo por devolver ni por reembolsar.' };
  }
}

/** Porcentaje rendido acotado a 0–100 (por si el back envía un valor fuera de rango). */
export function porcentajeAcotado(valor: number | null | undefined): number {
  if (typeof valor !== 'number' || !Number.isFinite(valor)) return 0;
  return Math.max(0, Math.min(100, Math.round(valor)));
}

/** "2026-10-27" → "27/10" */
export function diaMes(fecha: string | null | undefined): string {
  if (!fecha) return '';
  const [, m, d] = fecha.slice(0, 10).split('-');
  return d && m ? `${d}/${m}` : '';
}

/** "2026-10-26T12:40:00" → "26/10 12:40" (hora de Lima que envía el back). */
export function diaMesHora(valor: string | null | undefined): string {
  if (!valor) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(valor);
  return m ? `${m[3]}/${m[2]} ${m[4]}:${m[5]}` : diaMes(valor);
}

/** Un paso del "Seguimiento" de un gasto (HU-26): hecho, requiere atención (alerta), error o por venir. */
export interface PasoSeguimiento {
  titulo: string;
  detalle: string | null;
  tono: 'hecho' | 'alerta' | 'error' | 'pendiente';
}

/**
 * Recorrido de un gasto: rendido → en revisión → aprobado / observado / rechazado → cierre de la rendición.
 * Todo sale de los datos del gasto: no se inventa ningún paso (el cierre solo figura como hecho si la rendición ya se cerró).
 */
export function seguimientoGasto(g: Gasto, rendicionCerrada: boolean): PasoSeguimiento[] {
  const jefe = 'Jefe de Operaciones';
  const revision = [g.revisadoPor, diaMesHora(g.revisadoEn)].filter(Boolean).join(' · ');
  const pasos: PasoSeguimiento[] = [{ titulo: 'Gasto rendido', detalle: diaMesHora(g.creadoEn) || null, tono: 'hecho' }];

  switch (g.estado) {
    case 'aprobado':
      pasos.push({ titulo: `Aprobado · ${jefe}`, detalle: [revision, 'decisión definitiva'].filter(Boolean).join(' · '), tono: 'hecho' });
      break;
    case 'observado':
      pasos.push({ titulo: `Observado · ${jefe}`, detalle: [revision, g.comentarioRevision].filter(Boolean).join(' · ') || null, tono: 'alerta' });
      pasos.push({ titulo: 'Corregir y reenviar', detalle: 'Vuelve a pendiente de revisión', tono: 'pendiente' });
      return pasos;
    case 'rechazado':
      pasos.push({ titulo: `Rechazado · ${jefe}`, detalle: [revision, g.comentarioRevision].filter(Boolean).join(' · ') || null, tono: 'error' });
      break;
    default:
      pasos.push({ titulo: `En revisión · ${jefe}`, detalle: 'Intranet · Gestionar Viáticos › Rendición de Gastos', tono: 'alerta' });
      pasos.push({ titulo: 'Aprobado', detalle: 'Pendiente', tono: 'pendiente' });
  }

  pasos.push(
    rendicionCerrada
      ? { titulo: 'Cierre de la rendición', detalle: 'Rendición cerrada', tono: 'hecho' }
      : { titulo: 'Cierre de la rendición', detalle: 'Si hay saldo a tu favor, Contabilidad lo deposita', tono: 'pendiente' },
  );
  return pasos;
}
