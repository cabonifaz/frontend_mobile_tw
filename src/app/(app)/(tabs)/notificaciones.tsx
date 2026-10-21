import { SafeAreaView } from 'react-native-safe-area-context';
import { Proximamente } from '@/componentes/Proximamente';
import { colores } from '@/tema/colores';

export default function PantallaNotificaciones() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colores.fondo }} edges={['top']}>
      <Proximamente titulo="Notificaciones" icono={{ familia: 'ion', nombre: 'notifications-outline' }} />
    </SafeAreaView>
  );
}
