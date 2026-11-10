import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { obtenerEquipos, type EquipoAsistente } from '@/api/asistente';
import { Aviso } from '@/componentes/Aviso';
import { useConsulta } from '@/hooks/useConsulta';
import { colores, radios } from '@/tema/colores';
import { numeroOsCorto } from '@/utilidades/asistente';

interface Props {
  visible: boolean;
  /** Equipo que está de contexto ahora (se marca en la lista). */
  idOsEquipoActual: number | null;
  onElegir: (e: EquipoAsistente) => void;
  onCerrar: () => void;
}

/**
 * HU-19 — "Cambiar": los equipos de las órdenes del técnico para elegir el contexto del asistente (el equipo en trabajo va primero). Mostrar la
 * lista no exige que el equipo esté iniciado: solo se consultan manuales, no se registra trabajo.
 */
export function ElegirEquipoAsistente(props: Props) {
  if (!props.visible) return null;
  return (
    <Modal visible animationType="slide" onRequestClose={props.onCerrar}>
      <Lista {...props} />
    </Modal>
  );
}

function Lista({ idOsEquipoActual, onElegir, onCerrar }: Props) {
  const { datos, cargando, error } = useConsulta((token) => obtenerEquipos(token));
  return (
    <SafeAreaView style={estilos.area}>
      <View style={estilos.cabecera}>
        <Pressable onPress={onCerrar} hitSlop={12} accessibilityRole="button" accessibilityLabel="Cerrar" testID="cerrar-elegir-equipo">
          <Ionicons name="close" size={26} color={colores.titulo} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={estilos.titulo}>Elegir equipo</Text>
          <Text style={estilos.subtitulo}>El asistente responderá con los manuales de ese equipo.</Text>
        </View>
      </View>

      {cargando ? (
        <ActivityIndicator color={colores.primario} style={{ marginTop: 40 }} />
      ) : error || !datos ? (
        <View style={estilos.cuerpo}>
          <Aviso tipo="error" mensaje={error ?? 'No se pudieron cargar los equipos.'} />
        </View>
      ) : datos.length === 0 ? (
        <View style={estilos.cuerpo}>
          <Aviso mensaje="No tienes equipos en órdenes de servicio asignadas por ahora." />
        </View>
      ) : (
        <FlatList
          data={datos}
          keyExtractor={(e) => `${e.idOs}-${e.idOsEquipo}`}
          contentContainerStyle={[estilos.cuerpo, { gap: 10 }]}
          renderItem={({ item: e }) => {
            const actual = e.idOsEquipo === idOsEquipoActual;
            const equipo = [e.marca, e.modelo].filter((x): x is string => !!x).join(' ') || e.nombre;
            return (
              <Pressable
                onPress={() => onElegir(e)}
                style={[estilos.fila, actual && estilos.filaActual]}
                accessibilityRole="button"
                accessibilityState={{ selected: actual }}
                accessibilityLabel={`${equipo}, ${e.nombre} ${e.numero}`}
                testID={`equipo-${e.idOsEquipo}`}
              >
                <View style={estilos.icono}>
                  <Ionicons name="hardware-chip-outline" size={24} color={colores.primario} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={estilos.equipo}>{equipo}</Text>
                  <Text style={estilos.detalle}>
                    {[`${e.nombre} #${String(e.numero).padStart(2, '0')}`, e.codigoCliente, numeroOsCorto(e.numeroOs)].filter(Boolean).join(' · ')}
                  </Text>
                  <Text style={[estilos.docs, e.fuentesDisponibles === 0 && { color: colores.naranja }]}>
                    {e.fuentesDisponibles === 0 ? 'Sin manuales ni procedimientos cargados' : `${e.fuentesDisponibles} ${e.fuentesDisponibles === 1 ? 'documento oficial' : 'documentos oficiales'}`}
                  </Text>
                </View>
                {e.enTrabajo && (
                  <View style={estilos.pill}>
                    <Text style={estilos.pillTexto}>EN TRABAJO</Text>
                  </View>
                )}
                {actual && <Ionicons name="checkmark-circle" size={22} color={colores.verde} />}
              </Pressable>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const estilos = StyleSheet.create({
  area: { flex: 1, backgroundColor: colores.fondo },
  cabecera: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14, backgroundColor: colores.blanco, borderBottomWidth: 1, borderBottomColor: colores.bordeSuave },
  titulo: { fontSize: 20, fontWeight: '800', color: colores.titulo },
  subtitulo: { fontSize: 14, color: colores.textoSecundario, marginTop: 1 },
  cuerpo: { padding: 16 },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colores.blanco, borderWidth: 1, borderColor: colores.bordeSuave, borderRadius: radios.tarjeta, padding: 14 },
  filaActual: { borderColor: colores.primario, backgroundColor: colores.primarioSuave },
  icono: { width: 44, height: 44, borderRadius: 10, backgroundColor: colores.primarioSuave, alignItems: 'center', justifyContent: 'center' },
  equipo: { fontSize: 17, fontWeight: '800', color: colores.titulo },
  detalle: { fontSize: 14, color: colores.textoSecundario, marginTop: 2, lineHeight: 20 },
  docs: { fontSize: 13.5, color: colores.primario, fontWeight: '700', marginTop: 3 },
  pill: { backgroundColor: colores.azulFondo, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  pillTexto: { fontSize: 11, fontWeight: '800', color: colores.azulTexto, letterSpacing: 0.3 },
});
