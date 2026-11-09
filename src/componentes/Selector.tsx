import { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colores, radios } from '@/tema/colores';

export interface OpcionSelector {
  valor: string;
  texto: string;
}

interface Props {
  etiqueta: string;
  placeholder: string;
  opciones: OpcionSelector[];
  valor: string | null;
  onCambio: (valor: string) => void;
  /** Muestra un buscador dentro de la lista (útil con muchas opciones). */
  conBusqueda?: boolean;
  testID?: string;
}

/** Lista desplegable a pantalla completa: se elige una opción de una lista cerrada (marca, tipo de equipo…). */
export function Selector({ etiqueta, placeholder, opciones, valor, onCambio, conBusqueda = false, testID }: Props) {
  const [abierto, setAbierto] = useState(false);
  const [buscar, setBuscar] = useState('');
  const elegida = opciones.find((o) => o.valor === valor);
  const visibles = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    return q ? opciones.filter((o) => o.texto.toLowerCase().includes(q)) : opciones;
  }, [opciones, buscar]);

  function cerrar() {
    setAbierto(false);
    setBuscar('');
  }

  return (
    <View>
      <Text style={estilos.etiqueta}>{etiqueta}</Text>
      <Pressable
        onPress={() => setAbierto(true)}
        style={estilos.campo}
        accessibilityRole="button"
        accessibilityLabel={etiqueta}
        testID={testID}
      >
        <Text style={[estilos.campoTexto, !elegida && { color: colores.placeholder }]} numberOfLines={1}>
          {elegida?.texto ?? placeholder}
        </Text>
        <Ionicons name="chevron-down" size={20} color={colores.textoSecundario} />
      </Pressable>

      <Modal visible={abierto} animationType="slide" onRequestClose={cerrar}>
        <SafeAreaView style={estilos.modal}>
          <View style={estilos.cabecera}>
            <Text style={estilos.titulo}>{etiqueta}</Text>
            <Pressable onPress={cerrar} hitSlop={12} accessibilityRole="button" accessibilityLabel="Cerrar">
              <Ionicons name="close" size={26} color={colores.titulo} />
            </Pressable>
          </View>
          {conBusqueda && (
            <View style={estilos.buscador}>
              <Ionicons name="search" size={18} color={colores.textoSecundario} />
              <TextInput
                value={buscar}
                onChangeText={(t) => setBuscar(t.slice(0, 80))}
                placeholder="Buscar"
                placeholderTextColor={colores.placeholder}
                style={estilos.buscadorCampo}
                autoCorrect={false}
              />
            </View>
          )}
          <FlatList
            data={visibles}
            keyExtractor={(o) => o.valor}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={<Text style={estilos.vacio}>Sin resultados.</Text>}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => {
                  onCambio(item.valor);
                  cerrar();
                }}
                style={[estilos.opcion, item.valor === valor && { backgroundColor: colores.primarioSuave }]}
                accessibilityRole="button"
              >
                <Text style={estilos.opcionTexto}>{item.texto}</Text>
                {item.valor === valor && <Ionicons name="checkmark" size={20} color={colores.primario} />}
              </Pressable>
            )}
          />
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const estilos = StyleSheet.create({
  etiqueta: { fontSize: 15, fontWeight: '600', color: colores.titulo, marginBottom: 8 },
  campo: {
    minHeight: 50,
    borderWidth: 1,
    borderColor: colores.borde,
    borderRadius: radios.campo,
    backgroundColor: colores.blanco,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  campoTexto: { flex: 1, fontSize: 16, color: colores.texto },
  modal: { flex: 1, backgroundColor: colores.fondo },
  cabecera: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 },
  titulo: { fontSize: 18, fontWeight: '700', color: colores.titulo },
  buscador: {
    marginHorizontal: 16,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: colores.borde,
    borderRadius: radios.campo,
    backgroundColor: colores.blanco,
    paddingHorizontal: 12,
  },
  buscadorCampo: { flex: 1, paddingVertical: 10, fontSize: 15, color: colores.texto },
  opcion: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colores.bordeSuave,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  opcionTexto: { flex: 1, fontSize: 16, color: colores.texto },
  vacio: { padding: 24, textAlign: 'center', color: colores.textoSecundario },
});
