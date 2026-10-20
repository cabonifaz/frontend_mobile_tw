import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colores } from '@/tema/colores';

interface Props {
  etiqueta: string;
  marcada: boolean;
  onCambiar: (valor: boolean) => void;
}

export function Casilla({ etiqueta, marcada, onCambiar }: Props) {
  return (
    <Pressable
      onPress={() => onCambiar(!marcada)}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: marcada }}
      hitSlop={8}
      style={estilos.fila}
    >
      <View style={[estilos.caja, marcada && estilos.cajaMarcada]}>
        {marcada && <Ionicons name="checkmark" size={16} color={colores.blanco} />}
      </View>
      <Text style={estilos.texto}>{etiqueta}</Text>
    </Pressable>
  );
}

const estilos = StyleSheet.create({
  fila: { flexDirection: 'row', alignItems: 'center' },
  caja: {
    width: 22,
    height: 22,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: colores.borde,
    backgroundColor: colores.blanco,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  cajaMarcada: { backgroundColor: colores.primario, borderColor: colores.primario },
  texto: { fontSize: 14, color: colores.textoSecundario },
});
