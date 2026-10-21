import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Proximamente } from '@/componentes/Proximamente';
import { moduloPorId } from '@/menu/modulos';
import { colores } from '@/tema/colores';

/** Pantalla temporal de los módulos del menú que aún no se desarrollan. */
export default function PantallaModulo() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const modulo = moduloPorId(id);

  return (
    <SafeAreaView style={estilos.area} edges={['top', 'bottom']}>
      <View style={estilos.barra}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Volver">
          <Ionicons name="arrow-back" size={24} color={colores.titulo} />
        </Pressable>
        <Text style={estilos.titulo} numberOfLines={1}>
          {modulo?.titulo ?? 'Módulo'}
        </Text>
      </View>
      <Proximamente titulo={modulo?.titulo ?? 'Módulo'} icono={modulo?.icono ?? { familia: 'ion', nombre: 'apps-outline' }} />
    </SafeAreaView>
  );
}

const estilos = StyleSheet.create({
  area: { flex: 1, backgroundColor: colores.fondo },
  barra: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: colores.tarjeta,
    borderBottomWidth: 1,
    borderBottomColor: colores.bordeSuave,
  },
  titulo: { flex: 1, fontSize: 18, fontWeight: '700', color: colores.titulo },
});
