import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colores } from '@/tema/colores';
import { avisar } from '@/utilidades/dialogos';
import { textoVersion } from '@/actualizaciones/actualizaciones';

const enlaces: { titulo: string; mensaje: string }[] = [
  { titulo: 'Soporte Técnico', mensaje: 'Si tienes problemas para ingresar, comunícate con tu jefe o con el área de TI de Total Weight.' },
  { titulo: 'Privacidad', mensaje: 'La política de privacidad de la app estará disponible próximamente.' },
  { titulo: 'Términos', mensaje: 'Los términos de uso de la app estarán disponibles próximamente.' },
];

/** Pie del login: versión y enlaces (sin el indicador "Online · Sincronizado"). */
export function PieLogin() {
  return (
    <View style={estilos.pie}>
      <Text style={estilos.version}>{textoVersion()}</Text>
      <View style={estilos.enlaces}>
        {enlaces.map((e, i) => (
          <View key={e.titulo} style={estilos.enlaceFila}>
            {i > 0 && <View style={estilos.punto} />}
            <Pressable onPress={() => avisar(e.titulo, e.mensaje)} hitSlop={8} accessibilityRole="link">
              <Text style={estilos.enlace}>{e.titulo}</Text>
            </Pressable>
          </View>
        ))}
      </View>
    </View>
  );
}

const estilos = StyleSheet.create({
  pie: { alignItems: 'center', marginTop: 32 },
  version: { fontSize: 13, color: colores.textoTenue, marginBottom: 10 },
  enlaces: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' },
  enlaceFila: { flexDirection: 'row', alignItems: 'center' },
  punto: { width: 4, height: 4, borderRadius: 2, backgroundColor: colores.borde, marginHorizontal: 14 },
  enlace: { fontSize: 13, color: colores.textoSecundario },
});
