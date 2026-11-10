import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useDiseno } from '@/hooks/useDiseno';
import type { Indicador, ModuloMenu } from '@/menu/modulos';
import { colores, radios } from '@/tema/colores';
import { IconoModulo } from './IconoModulo';

interface Props {
  modulo: Pick<ModuloMenu, 'id' | 'titulo' | 'icono' | 'destacado'>;
  indicadores?: Indicador[];
  onPress: () => void;
  /** Tarjeta de alerta (fondo rojizo y ícono rojo), p. ej. "Alertas de Campo". */
  alerta?: boolean;
  /** Módulo que no es de tu área: gris, con candado y "SOLO <ÁREA>". Al tocarlo se llama a `onPress` (que muestra el aviso). */
  bloqueadoPara?: string;
}

const tonos = {
  amarillo: { fondo: colores.amarilloFondo, texto: colores.amarilloTexto },
  azul: { fondo: colores.azulFondo, texto: colores.azulTexto },
  gris: { fondo: colores.grisFondo, texto: colores.grisTexto },
  rojo: { fondo: colores.rojoEtiquetaFondo, texto: colores.rojoEtiquetaTexto },
  verde: { fondo: colores.verdeEtiquetaFondo, texto: colores.verdeEtiquetaTexto },
} as const;

/** Tarjeta de la cuadrícula del menú principal (HU-02). */
export function TarjetaModulo({ modulo, indicadores = [], onPress, alerta = false, bloqueadoPara }: Props) {
  const destacado = !!modulo.destacado;
  const bloqueado = !!bloqueadoPara;
  // En celulares angostos se achica la letra para que "Procedimientos" no se corte a la mitad.
  const { compacto } = useDiseno();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ disabled: bloqueado }}
      accessibilityLabel={
        bloqueado
          ? `${modulo.titulo}, bloqueado: solo ${bloqueadoPara}`
          : indicadores.length > 0
            ? `${modulo.titulo}, ${indicadores.map((i) => i.texto).join(', ')}`
            : modulo.titulo
      }
      style={({ pressed }) => [
        estilos.tarjeta,
        compacto && estilos.tarjetaCompacta,
        destacado && estilos.destacada,
        alerta && !bloqueado && estilos.alerta,
        bloqueado && estilos.bloqueada,
        pressed && estilos.presionada,
      ]}
      testID={`modulo-${modulo.id}`}
    >
      <IconoModulo icono={modulo.icono} color={bloqueado ? colores.textoTenue : alerta ? colores.rojo : destacado ? colores.verde : colores.primario} />
      {bloqueado && (
        <View style={estilos.candado}>
          <Ionicons name="lock-closed" size={14} color={colores.textoTenue} />
        </View>
      )}
      <Text style={[estilos.titulo, compacto && estilos.tituloCompacto, bloqueado && { color: colores.textoTenue }]}>{modulo.titulo}</Text>
      {bloqueado ? (
        <View style={[estilos.indicador, { backgroundColor: tonos.gris.fondo }]}>
          <Text style={[estilos.indicadorTexto, { color: tonos.gris.texto }]}>{`SOLO ${bloqueadoPara}`.toUpperCase()}</Text>
        </View>
      ) : (
        indicadores.map((indicador) => (
          <View key={indicador.texto} style={[estilos.indicador, { backgroundColor: tonos[indicador.tono].fondo }]}>
            <Text style={[estilos.indicadorTexto, { color: tonos[indicador.tono].texto }]}>{indicador.texto.toUpperCase()}</Text>
          </View>
        ))
      )}
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
  alerta: { backgroundColor: colores.errorFondo, borderColor: colores.errorBorde },
  bloqueada: { backgroundColor: colores.grisFondo, borderColor: colores.bordeSuave },
  candado: { position: 'absolute', top: 14, right: 14 },
  presionada: { opacity: 0.75 },
  titulo: { fontSize: 15, fontWeight: '700', color: colores.titulo, lineHeight: 20 },
  indicador: { alignSelf: 'flex-start', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, marginTop: -4 },
  indicadorTexto: { fontSize: 11, fontWeight: '800', letterSpacing: 0.3 },
});
