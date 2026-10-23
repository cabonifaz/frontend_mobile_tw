import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { colores } from '@/tema/colores';

interface Props {
  nombre: string;
  apellido?: string;
  /** Texto bajo el título (sin el indicador "Online · Sincronizado", que se quitó en la HU-01). */
  subtitulo?: string;
}

/**
 * Barra superior de la zona privada: iniciales del técnico y título (sin botón de refresh).
 * Tocar el círculo con las iniciales abre "Mi cuenta" (pestaña Perfil), con los datos de la cuenta
 * y el botón "Salir de la app".
 */
export function EncabezadoApp({ nombre, apellido, subtitulo }: Props) {
  const iniciales = `${nombre.charAt(0)}${(apellido ?? '').charAt(0)}`.toUpperCase() || 'TW';
  return (
    <View style={estilos.barra}>
      <Pressable
        onPress={() => router.navigate('/perfil')}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Mi cuenta"
        testID="boton-mi-cuenta"
        style={({ pressed }) => [estilos.avatar, pressed && { opacity: 0.8 }]}
      >
        <Text style={estilos.iniciales}>{iniciales}</Text>
      </Pressable>
      <View style={{ flex: 1 }}>
        <Text style={estilos.titulo} numberOfLines={1}>
          Servicio de Campo
        </Text>
        {!!subtitulo && (
          <Text style={estilos.subtitulo} numberOfLines={1}>
            {subtitulo}
          </Text>
        )}
      </View>
    </View>
  );
}

const estilos = StyleSheet.create({
  barra: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: colores.tarjeta,
    borderBottomWidth: 1,
    borderBottomColor: colores.bordeSuave,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colores.primario,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iniciales: { color: colores.blanco, fontWeight: '700', fontSize: 15 },
  titulo: { fontSize: 17, fontWeight: '600', color: colores.primario },
  subtitulo: { fontSize: 13, color: colores.textoSecundario, marginTop: 1 },
});
