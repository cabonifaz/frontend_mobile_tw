import type { MenuJefatura } from '@/api/jefatura';
import type { AreaJefatura } from '@/utilidades/perfil';
import type { Indicador, ModuloMenu } from './modulos';

/**
 * Módulos del menú de Jefatura (HU-28), en el orden del mockup. Hoy solo el Jefe de Metrología tiene menú de Jefatura:
 *   Metrología: Panel de Campo, Aprobaciones, Correlativos, Mi Equipo, Certificados por Revisar, Recepción en Taller,
 *               Agenda del Área, Viáticos y Gastos y Procedimientos. (Correlativos y Recepción en Taller son solo de Metrología.)
 * El Jefe de Servicio Técnico usa el menú de campo. Para sumar otra área: agregar su cargo en utilidades/perfil.ts y su lista aquí.
 * Las pantallas que todavía no existen abren "Próximamente" y no muestran contador (ruta null). Se van habilitando de a una
 * cambiando `ruta`. Las que existen: Aprobaciones (HU-31).
 */
export interface ModuloJefatura extends Pick<ModuloMenu, 'id' | 'titulo' | 'icono' | 'ruta' | 'destacado'> {
  indicadores?: (m: MenuJefatura) => Indicador[];
}

const ion = (nombre: Extract<ModuloMenu['icono'], { familia: 'ion' }>['nombre']) => ({ familia: 'ion' as const, nombre });

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

const panelCampo: ModuloJefatura = { id: 'jefe-panel-campo', titulo: 'Panel de Campo', icono: ion('map-outline'), ruta: null };
const aprobaciones: ModuloJefatura = {
  id: 'jefe-aprobaciones',
  titulo: 'Aprobaciones',
  icono: ion('checkmark-done-outline'),
  ruta: '/aprobaciones', // HU-31
  indicadores: (m) => (m.aprobacionesPendientes > 0 ? [{ texto: plural(m.aprobacionesPendientes, 'pendiente', 'pendientes'), tono: 'amarillo' }] : []),
};
const miEquipo: ModuloJefatura = { id: 'jefe-mi-equipo', titulo: 'Mi Equipo', icono: ion('people-outline'), ruta: null };
const agendaArea: ModuloJefatura = { id: 'jefe-agenda-area', titulo: 'Agenda del Área', icono: ion('calendar-outline'), ruta: null };
const viaticos: ModuloJefatura = { id: 'jefe-viaticos', titulo: 'Viáticos y Gastos', icono: ion('wallet-outline'), ruta: null };
const procedimientos: ModuloJefatura = { id: 'jefe-procedimientos', titulo: 'Procedimientos', icono: ion('book-outline'), ruta: null };

const metrologia: ModuloJefatura[] = [
  panelCampo,
  aprobaciones,
  { id: 'jefe-correlativos', titulo: 'Correlativos', icono: ion('ribbon-outline'), ruta: null },
  miEquipo,
  { id: 'jefe-certificados-revisar', titulo: 'Certificados por Revisar', icono: ion('document-text-outline'), ruta: null },
  { id: 'jefe-recepcion-taller', titulo: 'Recepción en Taller', icono: ion('file-tray-outline'), ruta: null },
  agendaArea,
  viaticos,
  procedimientos,
];

const porArea: Record<AreaJefatura, ModuloJefatura[]> = { metrologia };

export function modulosJefatura(area: AreaJefatura): ModuloJefatura[] {
  return porArea[area] ?? [];
}

/** Busca un módulo de Jefatura por id (para la pantalla "Próximamente"). */
export function moduloJefaturaPorId(id: string | undefined): ModuloJefatura | undefined {
  return metrologia.find((m) => m.id === id);
}
