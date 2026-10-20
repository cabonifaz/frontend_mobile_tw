import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import { colores, radios } from '@/tema/colores';

interface Props {
  titulo: string;
  onPress: () => void;
  variante?: 'primario' | 'secundario';
  cargando?: boolean;
  deshabilitado?: boolean;
}

export function Boton({ titulo, onPress, variante = 'primario', cargando = false, deshabilitado = false }: Props) {
  const inactivo = deshabilitado || cargando;
  const esPrimario = variante === 'primario';

  return (
    <Pressable
      onPress={onPress}
      disabled={inactivo}
      accessibilityRole="button"
      accessibilityState={{ disabled: inactivo, busy: cargando }}
      style={({ pressed }) => [
        estilos.base,
        esPrimario ? estilos.primario : estilos.secundario,
        pressed && (esPrimario ? estilos.primarioPresionado : estilos.secundarioPresionado),
        inactivo && estilos.inactivo,
      ]}
    >
      {cargando ? (
        <ActivityIndicator color={esPrimario ? colores.blanco : colores.primario} />
      ) : (
        <Text style={[estilos.texto, esPrimario ? estilos.textoPrimario : estilos.textoSecundario]}>{titulo}</Text>
      )}
    </Pressable>
  );
}

const estilos = StyleSheet.create({
  base: {
    minHeight: 50,
    borderRadius: radios.boton,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  primario: { backgroundColor: colores.primario },
  primarioPresionado: { backgroundColor: colores.primarioPresionado },
  secundario: { backgroundColor: colores.blanco, borderWidth: 1, borderColor: colores.borde },
  secundarioPresionado: { backgroundColor: colores.primarioSuave },
  inactivo: { opacity: 0.6 },
  texto: { fontSize: 16, fontWeight: '600' },
  textoPrimario: { color: colores.blanco },
  textoSecundario: { color: colores.titulo },
});
