import { SafeAreaView } from 'react-native-safe-area-context';
import { Proximamente } from '@/componentes/Proximamente';
import { colores } from '@/tema/colores';

export default function PantallaAsistente() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colores.fondo }} edges={['top']}>
      <Proximamente titulo="Asistente" icono={{ familia: 'ion', nombre: 'headset-outline' }} />
    </SafeAreaView>
  );
}
