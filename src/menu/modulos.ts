import type { ComponentProps } from 'react';
import type { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import type { ResumenMenu } from '@/api/menu';

/**
 * Módulos del menú principal (HU-02), en el orden del mockup y con los nombres
 * que ya usan los técnicos en la app actual de TW (menú lateral): Reloj Marcador,
 * Servicios Programados, Procedimientos, Recepción Instrumentos OM, Ingreso de
 * Equipos OS, Viáticos, Solicitud de Gastos y Configuraciones.
 * Nuevos respecto a la app actual: Progreso Guardado y Asistente IA.
 * "Cerrar App" de la app actual está en la pestaña Perfil como "Salir de la app".
 * Los indicadores salen de GET api/movil/menu/resumen; los módulos que aún no tienen
 * datos en el backend se muestran sin indicador.
 * Para habilitar un módulo: crea su pantalla y cambia `ruta` (mientras no tenga,
 * abre la pantalla "Próximamente").
 */
export type Icono =
  | { familia: 'ion'; nombre: ComponentProps<typeof Ionicons>['name'] }
  | { familia: 'mci'; nombre: ComponentProps<typeof MaterialCommunityIcons>['name'] };

export interface Indicador {
  texto: string;
  tono: 'amarillo' | 'azul' | 'gris';
}

export interface ModuloMenu {
  id: string;
  titulo: string;
  icono: Icono;
  /** Ruta de la pantalla; null = todavía no desarrollada. */
  ruta: string | null;
  destacado?: boolean;
  indicador?: (r: ResumenMenu) => Indicador;
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

export const modulosMenu: ModuloMenu[] = [
  { id: 'reloj-marcador', titulo: 'Reloj Marcador', icono: { familia: 'ion', nombre: 'time-outline' }, ruta: null },
  {
    id: 'servicios-programados',
    titulo: 'Servicios Programados',
    icono: { familia: 'ion', nombre: 'clipboard-outline' },
    ruta: '/servicios-programados', // HU-03
    indicador: (r) => ({
      texto: r.serviciosAsignados > 0 ? plural(r.serviciosAsignados, 'asignado', 'asignados') : 'Sin asignar',
      tono: r.serviciosAsignados > 0 ? 'amarillo' : 'gris',
    }),
  },
  { id: 'procedimientos', titulo: 'Procedimientos', icono: { familia: 'ion', nombre: 'book-outline' }, ruta: null },
  {
    id: 'recepcion-instrumentos-om',
    titulo: 'Recepción Instrumentos OM',
    icono: { familia: 'ion', nombre: 'file-tray-outline' },
    ruta: null,
  },
  { id: 'ingreso-equipos-os', titulo: 'Ingreso de Equipos OS', icono: { familia: 'ion', nombre: 'cube-outline' }, ruta: null },
  { id: 'viaticos', titulo: 'Viáticos', icono: { familia: 'ion', nombre: 'wallet-outline' }, ruta: null },
  { id: 'solicitud-gastos', titulo: 'Solicitud de Gastos', icono: { familia: 'ion', nombre: 'receipt-outline' }, ruta: null },
  { id: 'progreso-guardado', titulo: 'Progreso Guardado', icono: { familia: 'ion', nombre: 'save-outline' }, ruta: null },
  { id: 'configuracion', titulo: 'Configuraciones', icono: { familia: 'ion', nombre: 'settings-outline' }, ruta: null },
  {
    id: 'asistente-ia',
    titulo: 'Asistente IA',
    icono: { familia: 'mci', nombre: 'robot-outline' },
    ruta: '/asistente', // misma pantalla que la pestaña Asistente
    destacado: true,
  },
];

export function moduloPorId(id: string | undefined): ModuloMenu | undefined {
  return modulosMenu.find((m) => m.id === id);
}
