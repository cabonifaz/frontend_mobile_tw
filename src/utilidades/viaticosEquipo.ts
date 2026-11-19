import type { ClaveConcepto, EstadoGastoEquipo, ServicioViaticoEquipo, TecnicoViatico } from '@/api/viaticosEquipo';
import { colores } from '@/tema/colores';

/**
 * HU-35 — Reglas de pantalla de Viáticos y gastos del equipo (Jefe de Área): etiquetas de estado, montos del formulario «Asignar viático» y su validación
 * (los mismos topes que el servidor). Quién ve qué, cuándo se puede asignar, el tope por línea y el depósito los decide el back (SP_GuardarViaticosProgramacion de la intranet).
 */
export const CONCEPTOS_ASIGNACION: { clave: ClaveConcepto; titulo: string }[] = [
  { clave: 'movilidad', titulo: 'Movilidad' },
  { clave: 'alimentacion', titulo: 'Alimentación' },
  { clave: 'alojamiento', titulo: 'Alojamiento' },
  { clave: 'otros', titulo: 'Otros' },
];

/** Tope por línea que valida el servidor (VIATICOS_MONTO_MAXIMO, 5 000 por defecto); aquí solo evita errores obvios antes de enviar. */
export const TOPE_LINEA = 5000;

export function etiquetaServicio(estado: ServicioViaticoEquipo['estado']): { texto: string; fondo: string; color: string } {
  switch (estado) {
    case 'por_revisar':
      return { texto: 'POR REVISAR', fondo: '#FEF3C7', color: '#92400E' };
    case 'por_depositar':
      return { texto: 'POR DEPOSITAR', fondo: '#DBEAFE', color: '#1E40AF' };
    case 'cerrado':
      return { texto: 'CERRADO', fondo: '#E2E8F0', color: '#475569' };
    default:
      return { texto: 'AL DÍA', fondo: '#DCFCE7', color: '#166534' };
  }
}

export function etiquetaGasto(estado: EstadoGastoEquipo | string): { texto: string; fondo: string; color: string } {
  switch (estado) {
    case 'aprobado':
      return { texto: 'APROBADO', fondo: '#DCFCE7', color: '#166534' };
    case 'observado':
      return { texto: 'OBSERVADO', fondo: '#FFEDD5', color: '#9A3412' };
    case 'rechazado':
      return { texto: 'RECHAZADO', fondo: '#FEE2E2', color: '#B91C1C' };
    default:
      return { texto: 'PENDIENTE', fondo: '#FEF3C7', color: '#92400E' };
  }
}

/** Color de la barra de avance: azul normal, naranja si ya rindió más de lo asignado. */
export const colorAvance = (avance: number): string => (avance >= 100 ? colores.naranja : colores.primario);

/** "150", "150.5", "150,50" → número con 2 decimales; vacío → 0; texto inválido o negativo → NaN. */
export function leerMonto(texto: string): number {
  const t = texto.trim().replace(',', '.');
  if (t === '') return 0;
  if (!/^\d+(\.\d{0,2})?$/.test(t)) return NaN;
  return Math.round(Number(t) * 100) / 100;
}

export interface FormularioAsignacion {
  idTecnico: number | null;
  /** Texto de cada campo (tal como lo escribe el jefe). */
  montos: Record<ClaveConcepto, string>;
  depositado: boolean;
}

export const montosVacios = (): Record<ClaveConcepto, string> => ({ movilidad: '', alimentacion: '', alojamiento: '', otros: '' });

/** Valores iniciales del formulario con lo que ya tiene asignado el técnico (por concepto). */
export function montosDeTecnico(t: Pick<TecnicoViatico, 'lineas'> | null | undefined): Record<ClaveConcepto, string> {
  const m = montosVacios();
  for (const l of t?.lineas ?? []) {
    const clave = (['movilidad', 'alimentacion', 'alojamiento', 'otros'] as const).find((c) => c === l.clave) ?? 'otros';
    const actual = leerMonto(m[clave]);
    m[clave] = String(Math.round(((Number.isNaN(actual) ? 0 : actual) + l.monto) * 100) / 100);
  }
  return m;
}

export function totalAsignacion(f: Pick<FormularioAsignacion, 'montos'>): number {
  const suma = CONCEPTOS_ASIGNACION.reduce((a, c) => {
    const v = leerMonto(f.montos[c.clave]);
    return a + (Number.isNaN(v) ? 0 : v);
  }, 0);
  return Math.round(suma * 100) / 100;
}

/** Lo que falta o está mal en el formulario «Asignar viático», o null si se puede enviar. */
export function errorAsignacion(f: FormularioAsignacion): string | null {
  if (!f.idTecnico) return 'Elige el técnico.';
  for (const c of CONCEPTOS_ASIGNACION) {
    const v = leerMonto(f.montos[c.clave]);
    if (Number.isNaN(v)) return `${c.titulo}: escribe un monto válido (hasta 2 decimales).`;
    if (v > TOPE_LINEA) return `${c.titulo}: el monto no puede superar S/ ${TOPE_LINEA}.`;
  }
  if (totalAsignacion(f) <= 0) return 'Escribe al menos un monto mayor a cero.';
  return null;
}
