import { StyleSheet, Text, View } from 'react-native';
import type { Icono } from '@/menu/modulos';
import { colores } from '@/tema/colores';
import { IconoModulo } from './IconoModulo';

/** Contenido de una sección que todavía no se desarrolla. */
export function Proximamente({ titulo, icono }: { titulo: string; icono: Icono }) {
  return (
    <View style={estilos.contenedor}>
      <View style={estilos.circulo}>
        <IconoModulo icono={icono} size={34} color={colores.primario} />
      </View>
      <Text style={estilos.titulo}>{titulo}</Text>
      <Text style={estilos.texto}>Esta sección se habilita en una próxima historia.</Text>
    </View>
  );
}

const estilos = StyleSheet.create({
  contenedor: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  circulo: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: colores.primarioSuave,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  titulo: { fontSize: 20, fontWeight: '700', color: colores.titulo, textAlign: 'center' },
  texto: { fontSize: 15, color: colores.textoSecundario, textAlign: 'center', marginTop: 8, lineHeight: 22 },
});
