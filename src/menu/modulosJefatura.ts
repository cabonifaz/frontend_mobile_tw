import type { MenuJefatura } from '@/api/jefatura';
import type { Indicador, ModuloMenu } from './modulos';

/**
 * Módulos del menú de Jefatura (HU-28): UN SOLO menú para todos los jefes de área (Servicio Técnico, Metrología, Operaciones…).
 * Todos ven los mismos accesos, en el orden del mockup; los que no son de su área salen en gris con candado y "SOLO <ÁREA>"
 * (al tocarlos, la app avisa que se habilita solo para esa área). Hoy son exclusivos de Metrología: Correlativos y Recepción en Taller.
 *
 * Indicadores: solo se muestran los que ya tienen datos reales en el back (Panel de Campo → en ruta; Aprobaciones → pendientes).
 * El resto de los módulos (Alertas, Informes y Certificados, Correlativos, Recepción en Taller, Mi Equipo, Agenda del Área, Viáticos
 * y Procedimientos) abre "Próximamente" y no muestra contador hasta que exista su módulo (ruta null); se habilitan de a uno cambiando
 * `ruta` y sumando su contador. Las que existen: Aprobaciones (HU-31) y Asistente IA.
 */
export interface AreaExclusiva {
  /** Código AREA_USUARIO ('metrologia'). */
  codigo: string;
  /** Nombre para mostrar ("Metrología"). */
  nombre: string;
}

export interface ModuloJefatura extends Pick<ModuloMenu, 'id' | 'titulo' | 'icono' | 'ruta' | 'destacado'> {
  indicadores?: (m: MenuJefatura) => Indicador[];
  /** Si solo lo usa un área: para los demás jefes sale bloqueado. */
  soloArea?: AreaExclusiva;
  /** Tarjeta de alerta (fondo rojizo), como "Alertas de Campo". */
  alerta?: boolean;
}

const ion = (nombre: Extract<ModuloMenu['icono'], { familia: 'ion' }>['nombre']) => ({ familia: 'ion' as const, nombre });

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

const METROLOGIA: AreaExclusiva = { codigo: 'metrologia', nombre: 'Metrología' };

export const modulosJefaturaTodos: ModuloJefatura[] = [
  {
    id: 'jefe-panel-campo',
    titulo: 'Panel de Campo',
    icono: ion('map-outline'),
    ruta: null,
    indicadores: (m) => (m.enRuta > 0 ? [{ texto: `${m.enRuta} en ruta`, tono: 'azul' }] : []),
  },
  {
    id: 'jefe-aprobaciones',
    titulo: 'Aprobaciones',
    icono: ion('checkmark-done-outline'),
    ruta: '/aprobaciones', // HU-31
    indicadores: (m) => (m.aprobacionesPendientes > 0 ? [{ texto: plural(m.aprobacionesPendientes, 'pendiente', 'pendientes'), tono: 'amarillo' }] : []),
  },
  { id: 'jefe-alertas-campo', titulo: 'Alertas de Campo', icono: ion('alert-circle-outline'), ruta: null, alerta: true },
  { id: 'jefe-informes-certificados', titulo: 'Informes y Certificados', icono: ion('document-text-outline'), ruta: null },
  { id: 'jefe-correlativos', titulo: 'Correlativos', icono: ion('ribbon-outline'), ruta: null, soloArea: METROLOGIA },
  { id: 'jefe-recepcion-taller', titulo: 'Recepción en Taller', icono: ion('file-tray-outline'), ruta: null, soloArea: METROLOGIA },
  { id: 'jefe-mi-equipo', titulo: 'Mi Equipo', icono: ion('people-outline'), ruta: null },
  { id: 'jefe-agenda-area', titulo: 'Agenda del Área', icono: ion('calendar-outline'), ruta: null },
  { id: 'jefe-viaticos', titulo: 'Viáticos y Gastos', icono: ion('wallet-outline'), ruta: null },
  { id: 'jefe-procedimientos', titulo: 'Procedimientos', icono: ion('book-outline'), ruta: null },
  {
    id: 'jefe-asistente-ia',
    titulo: 'Asistente IA',
    icono: { familia: 'mci', nombre: 'robot-outline' },
    ruta: '/asistente',
    destacado: true,
  },
];

/** Tarjetas del menú de Jefatura: las mismas para todos los jefes (el bloqueo por área lo resuelve `estaBloqueado`). */
export function modulosJefatura(): ModuloJefatura[] {
  return modulosJefaturaTodos;
}

/** ¿El módulo está bloqueado para el área del jefe? (Correlativos y Recepción en Taller son solo de Metrología). */
export function estaBloqueado(modulo: ModuloJefatura, areaDelJefe: string): boolean {
  return !!modulo.soloArea && modulo.soloArea.codigo !== areaDelJefe;
}

/** Texto del aviso al tocar un módulo bloqueado. */
export function avisoBloqueo(modulo: ModuloJefatura): string {
  return `${modulo.titulo} se habilita solo para el área de ${modulo.soloArea?.nombre ?? 'otra área'}.`;
}

/** Busca un módulo de Jefatura por id (para la pantalla "Próximamente"). */
export function moduloJefaturaPorId(id: string | undefined): ModuloJefatura | undefined {
  return modulosJefaturaTodos.find((m) => m.id === id);
}
