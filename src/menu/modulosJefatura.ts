import type { MenuJefatura } from '@/api/jefatura';
import type { Indicador, ModuloMenu } from './modulos';

/**
 * Módulos del menú de Jefatura (HU-28): UN SOLO menú para todos los jefes de área (Servicio Técnico, Metrología, Operaciones…).
 * Todos ven los mismos accesos, en el orden del mockup; los que no son de su área salen en gris con candado y "SOLO <ÁREA>"
 * (al tocarlos, la app avisa que se habilita solo para esa área). Hoy son exclusivos de Metrología: Correlativos y Recepción en Taller.
 *
 * Indicadores: solo se muestran los que tienen datos reales en el back (SP_ObtenerMenuJefaturaMovil) y nunca con 0 ni sin dato (null):
 *   Panel de Campo → en ruta · Aprobaciones → pendientes · Alertas de Campo → críticas sin leer · Informes y Certificados → informes por revisar y
 *   certificados pendientes · Correlativos → tickets · Mi Equipo → "N de M en labores" · Agenda del Área → conflictos · Viáticos y Gastos → por revisar.
 *   Recepción en Taller y Procedimientos no tienen contador: no existe una fuente de datos para ellos todavía.
 * Destinos: solo se habilita una tarjeta cuando su pantalla ya existe en la app (Aprobaciones, Alertas de Campo → Notificaciones con el filtro
 * Críticas, y Asistente IA); el resto abre "Próximamente" (ruta null) y se habilita de a uno cambiando `ruta`.
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

/** Un contador solo se muestra si hay dato (no null ni ausente) y es mayor que 0. */
const hay = (n: number | null | undefined): n is number => typeof n === 'number' && n > 0;

/** "8 de 10 en labores": verde si alguien está en labores, gris si nadie. Sin técnicos en el área o sin dato → nada. */
export function indicadorMiEquipo(total: number | null | undefined, enLabores: number | null | undefined): Indicador[] {
  if (!hay(total) || typeof enLabores !== 'number') return [];
  return [{ texto: `${enLabores} de ${total} en labores`, tono: enLabores > 0 ? 'verde' : 'gris' }];
}

const METROLOGIA: AreaExclusiva = { codigo: 'metrologia', nombre: 'Metrología' };

export const modulosJefaturaTodos: ModuloJefatura[] = [
  {
    id: 'jefe-panel-campo',
    titulo: 'Panel de Campo',
    icono: ion('map-outline'),
    ruta: '/panel-campo', // HU-29 (y HU-30: seguimiento del servicio desde ahí)
    indicadores: (m) => (m.enRuta > 0 ? [{ texto: `${m.enRuta} en ruta`, tono: 'azul' }] : []),
  },
  {
    id: 'jefe-aprobaciones',
    titulo: 'Aprobaciones',
    icono: ion('checkmark-done-outline'),
    ruta: '/aprobaciones', // HU-31
    indicadores: (m) => (m.aprobacionesPendientes > 0 ? [{ texto: plural(m.aprobacionesPendientes, 'pendiente', 'pendientes'), tono: 'amarillo' }] : []),
  },
  {
    id: 'jefe-alertas-campo',
    titulo: 'Alertas de Campo',
    icono: ion('alert-circle-outline'),
    // Lleva a Notificaciones con el filtro "Críticas": de ahí salen estos mismos números
    ruta: '/notificaciones?filtro=criticas',
    alerta: true,
    indicadores: (m) => (hay(m.alertasCriticas) ? [{ texto: plural(m.alertasCriticas, 'crítica', 'críticas'), tono: 'rojo' }] : []),
  },
  {
    id: 'jefe-informes-certificados',
    titulo: 'Informes y Certificados',
    icono: ion('document-text-outline'),
    ruta: null,
    indicadores: (m) => [
      ...(hay(m.informesPorRevisar) ? [{ texto: plural(m.informesPorRevisar, 'informe', 'informes'), tono: 'amarillo' as const }] : []),
      ...(hay(m.certificadosPendientes) ? [{ texto: plural(m.certificadosPendientes, 'certificado', 'certificados'), tono: 'amarillo' as const }] : []),
    ],
  },
  {
    id: 'jefe-correlativos',
    titulo: 'Correlativos',
    icono: ion('ribbon-outline'),
    ruta: null,
    soloArea: METROLOGIA,
    indicadores: (m) => (hay(m.ticketsCorrelativo) ? [{ texto: plural(m.ticketsCorrelativo, 'ticket', 'tickets'), tono: 'amarillo' }] : []),
  },
  { id: 'jefe-recepcion-taller', titulo: 'Recepción en Taller', icono: ion('file-tray-outline'), ruta: null, soloArea: METROLOGIA },
  {
    id: 'jefe-mi-equipo',
    titulo: 'Mi Equipo',
    icono: ion('people-outline'),
    ruta: null,
    indicadores: (m) => indicadorMiEquipo(m.miEquipoTotal, m.miEquipoEnLabores),
  },
  {
    id: 'jefe-agenda-area',
    titulo: 'Agenda del Área',
    icono: ion('calendar-outline'),
    ruta: null,
    indicadores: (m) => (hay(m.agendaConflictos) ? [{ texto: plural(m.agendaConflictos, 'conflicto', 'conflictos'), tono: 'rojo' }] : []),
  },
  {
    id: 'jefe-viaticos',
    titulo: 'Viáticos y Gastos',
    icono: ion('wallet-outline'),
    ruta: null,
    indicadores: (m) => (hay(m.viaticosPorRevisar) ? [{ texto: `${m.viaticosPorRevisar} por revisar`, tono: 'amarillo' }] : []),
  },
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
