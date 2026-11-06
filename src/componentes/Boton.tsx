import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import { colores, radios } from '@/tema/colores';

interface Props {
  titulo: string;
  onPress: () => void;
  /** `alerta` = contorno rojo (acciones de incidencia, como registrar una demora). */
  variante?: 'primario' | 'secundario' | 'alerta';
  cargando?: boolean;
  deshabilitado?: boolean;
}

export function Boton({ titulo, onPress, variante = 'primario', cargando = false, deshabilitado = false }: Props) {
  const inactivo = deshabilitado || cargando;
  const esPrimario = variante === 'primario';
  const esAlerta = variante === 'alerta';

  return (
    <Pressable
      onPress={onPress}
      disabled={inactivo}
      accessibilityRole="button"
      accessibilityState={{ disabled: inactivo, busy: cargando }}
      style={({ pressed }) => [
        estilos.base,
        esPrimario ? estilos.primario : esAlerta ? estilos.alerta : estilos.secundario,
        pressed && (esPrimario ? estilos.primarioPresionado : esAlerta ? estilos.alertaPresionado : estilos.secundarioPresionado),
        inactivo && estilos.inactivo,
      ]}
    >
      {cargando ? (
        <ActivityIndicator color={esPrimario ? colores.blanco : colores.primario} />
      ) : (
        <Text style={[estilos.texto, esPrimario ? estilos.textoPrimario : esAlerta ? estilos.textoAlerta : estilos.textoSecundario]}>{titulo}</Text>
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
  alerta: { backgroundColor: colores.blanco, borderWidth: 1.5, borderColor: colores.rojo },
  alertaPresionado: { backgroundColor: colores.errorFondo },
  inactivo: { opacity: 0.6 },
  texto: { fontSize: 16, fontWeight: '600' },
  textoPrimario: { color: colores.blanco },
  textoSecundario: { color: colores.titulo },
  textoAlerta: { color: colores.rojo },
});
