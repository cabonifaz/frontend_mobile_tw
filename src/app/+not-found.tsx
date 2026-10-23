import { Redirect } from 'expo-router';
import { useSesion } from '@/sesion/SesionContext';

/**
 * Ruta inexistente o protegida sin sesión (enlace viejo, sesión vencida, etc.):
 * en vez de la pantalla "Unmatched Route", se lleva al menú o al login.
 */
export default function RutaNoEncontrada() {
  const { sesion, cargando } = useSesion();
  if (cargando) return null;
  return <Redirect href={sesion ? '/' : '/login'} />;
}
