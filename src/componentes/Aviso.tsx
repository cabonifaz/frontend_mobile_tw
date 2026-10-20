import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colores } from '@/tema/colores';

interface Props {
  tipo?: 'error' | 'info';
  mensaje: string;
}

/** Caja de mensaje (errores del login, información). */
export function Aviso({ tipo = 'info', mensaje }: Props) {
  const esError = tipo === 'error';
  return (
    <View
      style={[estilos.caja, esError ? estilos.cajaError : estilos.cajaInfo]}
      accessibilityRole={esError ? 'alert' : 'text'}
      accessibilityLiveRegion="polite"
    >
      <Ionicons
        name={esError ? 'alert-circle-outline' : 'information-circle-outline'}
        size={22}
        color={esError ? colores.error : colores.primario}
        style={estilos.icono}
      />
      <Text style={[estilos.texto, esError && { color: colores.error }]}>{mensaje}</Text>
    </View>
  );
}

const estilos = StyleSheet.create({
  caja: { flexDirection: 'row', alignItems: 'flex-start', borderRadius: 10, padding: 14 },
  cajaInfo: { backgroundColor: colores.primarioSuave },
  cajaError: { backgroundColor: colores.errorFondo, borderWidth: 1, borderColor: colores.errorBorde },
  icono: { marginRight: 10, marginTop: 1 },
  texto: { flex: 1, fontSize: 14, lineHeight: 20, color: colores.texto },
});
