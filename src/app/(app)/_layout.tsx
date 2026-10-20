import { Stack } from 'expo-router';
import { colores } from '@/tema/colores';

/** Zona privada de la app (solo con sesión). Aquí irán agenda, servicios, etc. */
export default function LayoutApp() {
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colores.fondo } }} />;
}
