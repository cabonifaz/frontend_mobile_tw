import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import type { Icono } from '@/menu/modulos';

/** Dibuja el ícono de un módulo (Ionicons o MaterialCommunityIcons). */
export function IconoModulo({ icono, size = 28, color }: { icono: Icono; size?: number; color: string }) {
  return icono.familia === 'ion' ? (
    <Ionicons name={icono.nombre} size={size} color={color} />
  ) : (
    <MaterialCommunityIcons name={icono.nombre} size={size} color={color} />
  );
}
