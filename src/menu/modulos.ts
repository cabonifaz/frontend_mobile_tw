import type { ComponentProps } from 'react';
import type { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import type { ResumenMenu } from '@/api/menu';

/**
 * Módulos del menú principal (HU-02), en el orden del mockup.
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
    ruta: null,
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
  { id: 'ingreso-equipos-os', titulo: 'Ingreso Equipos OS', icono: { familia: 'ion', nombre: 'cube-outline' }, ruta: null },
  { id: 'viaticos', titulo: 'Viáticos', icono: { familia: 'ion', nombre: 'wallet-outline' }, ruta: null },
  { id: 'solicitud-gastos', titulo: 'Solicitud de Gastos', icono: { familia: 'ion', nombre: 'receipt-outline' }, ruta: null },
  { id: 'configuracion', titulo: 'Configuración', icono: { familia: 'ion', nombre: 'settings-outline' }, ruta: null },
  {
    id: 'ruta-del-dia',
    titulo: 'Ruta del Día',
    icono: { familia: 'mci', nombre: 'map-marker-path' },
    ruta: null,
    indicador: (r) => ({
      texto: r.serviciosHoy > 0 ? plural(r.serviciosHoy, 'servicio', 'servicios') : 'Sin servicios hoy',
      tono: r.serviciosHoy > 0 ? 'azul' : 'gris',
    }),
  },
  {
    id: 'asistente-ia',
    titulo: 'Asistente IA',
    icono: { familia: 'mci', nombre: 'robot-outline' },
    ruta: null,
    destacado: true,
  },
];

export function moduloPorId(id: string | undefined): ModuloMenu | undefined {
  return modulosMenu.find((m) => m.id === id);
}
