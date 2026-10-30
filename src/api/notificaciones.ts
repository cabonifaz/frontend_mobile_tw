import { entorno } from '@/config/entorno';

/**
 * Notificaciones del técnico (pestaña Notificaciones, HU-02).
 * El backend de staging todavía no expone notificaciones para el token de la app
 * (api/notificaciones es de la intranet y el token móvil no puede usarla). Mientras no exista
 * GET api/movil/notificaciones, la app muestra la bandeja vacía; en modo demo usa datos de prueba.
 */
export type TipoNotificacion = 'autorizacion' | 'correlativo' | 'gasto_aprobado' | 'gasto_observado' | 'servicio' | 'general';

export interface Notificacion {
  id: number;
  tipo: TipoNotificacion;
  titulo: string;
  cuerpo: string;
  /** ISO 8601 (hora de Lima). */
  fecha: string;
  leida: boolean;
}

function haceDias(dias: number, hora: string): string {
  const d = new Date();
  d.setDate(d.getDate() - dias);
  const f = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return `${f}T${hora}:00`;
}

const demo = (): Notificacion[] => [
  { id: 5, tipo: 'autorizacion', titulo: 'Visto bueno aprobado', cuerpo: 'OS-000791 · Jefe de Servicio Técnico autorizó tu salida', fecha: haceDias(0, '07:40'), leida: false },
  { id: 4, tipo: 'correlativo', titulo: 'Correlativo despachado', cuerpo: 'TK-MET-00241 → CC-2026-01458', fecha: haceDias(0, '11:10'), leida: false },
  { id: 3, tipo: 'gasto_aprobado', titulo: 'Gasto aprobado', cuerpo: 'Movilidad · S/ 40.00', fecha: haceDias(0, '09:15'), leida: true },
  { id: 2, tipo: 'servicio', titulo: 'Nuevo servicio asignado', cuerpo: 'OS-000795 · Gloria S.A. · 27/10 08:00', fecha: haceDias(1, '18:20'), leida: true },
  { id: 1, tipo: 'gasto_observado', titulo: 'Gasto observado', cuerpo: 'Peaje · el monto no coincide con el comprobante', fecha: haceDias(1, '16:05'), leida: true },
];

export async function obtenerNotificaciones(_token: string): Promise<Notificacion[]> {
  if (entorno.usarMock) return demo();
  return [];
}
