import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colores } from '@/tema/colores';

interface Props {
  nombre: string;
  apellido?: string;
  /** Texto bajo el título (sin el indicador "Online · Sincronizado", que se quitó en la HU-01). */
  subtitulo?: string;
  onActualizar?: () => void;
  actualizando?: boolean;
}

/** Barra superior de la zona privada: iniciales del técnico, título y botón actualizar. */
export function EncabezadoApp({ nombre, apellido, subtitulo, onActualizar, actualizando = false }: Props) {
  const iniciales = `${nombre.charAt(0)}${(apellido ?? '').charAt(0)}`.toUpperCase() || 'TW';
  return (
    <View style={estilos.barra}>
      <View style={estilos.avatar} accessibilityElementsHidden>
        <Text style={estilos.iniciales}>{iniciales}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={estilos.titulo}>Servicio de Campo</Text>
        {!!subtitulo && (
          <Text style={estilos.subtitulo} numberOfLines={1}>
            {subtitulo}
          </Text>
        )}
      </View>
      {onActualizar && (
        <Pressable
          onPress={onActualizar}
          disabled={actualizando}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Actualizar"
          testID="boton-actualizar"
        >
          {actualizando ? (
            <ActivityIndicator color={colores.primario} />
          ) : (
            <Ionicons name="refresh-outline" size={24} color={colores.primario} />
          )}
        </Pressable>
      )}
    </View>
  );
}

const estilos = StyleSheet.create({
  barra: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
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
