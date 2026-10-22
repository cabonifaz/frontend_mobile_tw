import { StyleSheet, Text, View } from 'react-native';
import { colores } from '@/tema/colores';

interface Props {
  nombre: string;
  apellido?: string;
  /** Texto bajo el título (sin el indicador "Online · Sincronizado", que se quitó en la HU-01). */
  subtitulo?: string;
}

/** Barra superior de la zona privada: iniciales del técnico y título (sin botón de refresh). */
export function EncabezadoApp({ nombre, apellido, subtitulo }: Props) {
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
