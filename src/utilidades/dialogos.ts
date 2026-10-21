import { Alert } from 'react-native';

/** Mensaje simple con botón Aceptar. */
export function avisar(titulo: string, mensaje: string): void {
  Alert.alert(titulo, mensaje);
}

/** Pregunta Sí/No. Devuelve true si la persona acepta. */
export function confirmar(titulo: string, mensaje: string, textoAceptar = 'Aceptar'): Promise<boolean> {
  return new Promise((resolver) => {
    Alert.alert(
      titulo,
      mensaje,
      [
        { text: 'Cancelar', style: 'cancel', onPress: () => resolver(false) },
        { text: textoAceptar, style: 'destructive', onPress: () => resolver(true) },
      ],
      { cancelable: true, onDismiss: () => resolver(false) },
    );
  });
}
