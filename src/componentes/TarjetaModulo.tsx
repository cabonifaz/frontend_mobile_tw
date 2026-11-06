import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useDiseno } from '@/hooks/useDiseno';
import type { Indicador, ModuloMenu } from '@/menu/modulos';
import { colores, radios } from '@/tema/colores';
import { IconoModulo } from './IconoModulo';

interface Props {
  modulo: Pick<ModuloMenu, 'id' | 'titulo' | 'icono' | 'destacado'>;
  indicadores?: Indicador[];
  onPress: () => void;
}

const tonos = {
  amarillo: { fondo: colores.amarilloFondo, texto: colores.amarilloTexto },
  azul: { fondo: colores.azulFondo, texto: colores.azulTexto },
  gris: { fondo: colores.grisFondo, texto: colores.grisTexto },
} as const;

/** Tarjeta de la cuadrícula del menú principal (HU-02). */
export function TarjetaModulo({ modulo, indicadores = [], onPress }: Props) {
  const destacado = !!modulo.destacado;
  // En celulares angostos se achica la letra para que "Procedimientos" no se corte a la mitad.
  const { compacto } = useDiseno();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={indicadores.length > 0 ? `${modulo.titulo}, ${indicadores.map((i) => i.texto).join(', ')}` : modulo.titulo}
      style={({ pressed }) => [estilos.tarjeta, compacto && estilos.tarjetaCompacta, destacado && estilos.destacada, pressed && estilos.presionada]}
      testID={`modulo-${modulo.id}`}
    >
      <IconoModulo icono={modulo.icono} color={destacado ? colores.verde : colores.primario} />
      <Text style={[estilos.titulo, compacto && estilos.tituloCompacto]}>{modulo.titulo}</Text>
      {indicadores.map((indicador) => (
        <View key={indicador.texto} style={[estilos.indicador, { backgroundColor: tonos[indicador.tono].fondo }]}>
          <Text style={[estilos.indicadorTexto, { color: tonos[indicador.tono].texto }]}>{indicador.texto.toUpperCase()}</Text>
        </View>
      ))}
    </Pressable>
  );
}

const estilos = StyleSheet.create({
  tarjeta: {
    flex: 1,
    minHeight: 112,
    backgroundColor: colores.tarjeta,
    borderRadius: radios.tarjeta,
    borderWidth: 1,
    borderColor: colores.bordeSuave,
    padding: 16,
    gap: 12,
  },
  tarjetaCompacta: { padding: 12, gap: 10, minHeight: 104 },
  tituloCompacto: { fontSize: 13, lineHeight: 17 },
  destacada: { backgroundColor: colores.verdeFondo, borderColor: colores.verdeBorde },
  presionada: { opacity: 0.75 },
  titulo: { fontSize: 15, fontWeight: '700', color: colores.titulo, lineHeight: 20 },
  indicador: { alignSelf: 'flex-start', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, marginTop: -4 },
  indicadorTexto: { fontSize: 11, fontWeight: '800', letterSpacing: 0.3 },
});
