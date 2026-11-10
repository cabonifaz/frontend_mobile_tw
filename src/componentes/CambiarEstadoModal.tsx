import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { cambiarEstadoServicio, type EstadoPermitido, type MotivoCambio } from '@/api/panelCampo';
import { Selector } from '@/componentes/Selector';
import { colores, radios } from '@/tema/colores';
import { MAX_COMENTARIO, errorCambioEstado, nombreEstadoOs } from '@/utilidades/panelCampo';

interface Props {
  visible: boolean;
  token: string;
  idOs: number;
  /** Estado de la OS ("en_ejecucion"…). */
  estadoActual: string;
  estados: EstadoPermitido[];
  motivos: MotivoCambio[];
  onCerrar: () => void;
  /** Se guardó el cambio: la pantalla vuelve a leer el servicio. */
  onGuardado: (mensaje: string) => void;
}

/**
 * HU-30 — "Cambiar estado operativo": para cuando la app del técnico no pudo registrarlo. Solo se puede AVANZAR (las opciones salen del back), con motivo y
 * comentario obligatorios. Queda en el historial del servicio con el usuario y la hora, y se avisa a Jefatura.
 */
export function CambiarEstadoModal(props: Props) {
  if (!props.visible) return null;
  return (
    <Modal visible transparent animationType="slide" onRequestClose={props.onCerrar}>
      <Formulario {...props} />
    </Modal>
  );
}

function Formulario({ token, idOs, estadoActual, estados, motivos, onCerrar, onGuardado }: Props) {
  const [nuevo, setNuevo] = useState<string | null>(null);
  const [motivo, setMotivo] = useState<string | null>(null);
  const [comentario, setComentario] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar() {
    const falla = errorCambioEstado({ nuevoEstado: nuevo, idMotivo: motivo ? Number(motivo) : null, comentario });
    if (falla) return setError(falla);
    setGuardando(true);
    setError(null);
    try {
      const r = await cambiarEstadoServicio(token, idOs, { nuevoEstado: nuevo!, idMotivo: Number(motivo), comentario });
      onGuardado(r.mensaje);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cambiar el estado.');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <KeyboardAvoidingView style={estilos.velo} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={estilos.hoja} testID="modal-cambiar-estado">
        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Text style={estilos.titulo}>Cambiar estado operativo</Text>
          <Text style={estilos.ayuda}>Úsalo solo si la app del técnico no pudo registrarlo.</Text>

          <Text style={estilos.etiqueta}>Estado actual</Text>
          <View style={estilos.fijo}>
            <Text style={estilos.fijoTexto}>{nombreEstadoOs(estadoActual)}</Text>
          </View>

          <View style={{ marginTop: 10 }}>
            <Selector
              etiqueta="Nuevo estado *"
              placeholder="Elige el nuevo estado"
              opciones={estados.map((e) => ({ valor: e.codigo, texto: e.nombre }))}
              valor={nuevo}
              onCambio={setNuevo}
              testID="nuevo-estado"
            />
          </View>
          <View style={{ marginTop: 10 }}>
            <Selector
              etiqueta="Motivo *"
              placeholder="Elige el motivo"
              opciones={motivos.map((m) => ({ valor: String(m.idMotivo), texto: m.nombre }))}
              valor={motivo}
              onCambio={setMotivo}
              testID="motivo-cambio"
            />
          </View>

          <Text style={[estilos.etiqueta, { marginTop: 10 }]}>Comentario *</Text>
          <TextInput
            value={comentario}
            onChangeText={(t) => setComentario(t.slice(0, MAX_COMENTARIO))}
            placeholder="Cuenta qué pasó y cómo te enteraste"
            placeholderTextColor={colores.placeholder}
            multiline
            style={estilos.comentario}
            testID="comentario-cambio"
          />
          <Text style={estilos.contador}>
            {comentario.trim().length} / {MAX_COMENTARIO}
          </Text>

          <View style={estilos.info}>
            <Ionicons name="information-circle-outline" size={20} color={colores.azulTexto} />
            <Text style={estilos.infoTexto}>Queda en el historial de estados del expediente con tu usuario y hora.</Text>
          </View>

          {!!error && <Text style={estilos.error}>{error}</Text>}

          <View style={estilos.botones}>
            <Pressable onPress={onCerrar} disabled={guardando} style={[estilos.boton, estilos.botonBorde]} accessibilityRole="button" testID="cancelar-cambio">
              <Text style={[estilos.botonTexto, { color: colores.primario }]}>Cancelar</Text>
            </Pressable>
            <Pressable onPress={() => void guardar()} disabled={guardando} style={[estilos.boton, estilos.botonPrimario, guardando && { opacity: 0.6 }]} accessibilityRole="button" testID="guardar-cambio">
              {guardando ? <ActivityIndicator color={colores.blanco} /> : <Text style={estilos.botonTexto}>Guardar cambio</Text>}
            </Pressable>
          </View>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

const estilos = StyleSheet.create({
  velo: { flex: 1, backgroundColor: 'rgba(2,6,23,0.55)', justifyContent: 'flex-end' },
  hoja: { backgroundColor: colores.blanco, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: '92%' },
  titulo: { fontSize: 24, fontWeight: '800', color: colores.titulo },
  ayuda: { fontSize: 15, color: colores.textoSecundario, marginTop: 2, marginBottom: 14 },
  etiqueta: { fontSize: 16, fontWeight: '700', color: colores.titulo, marginBottom: 6 },
  fijo: { borderWidth: 1, borderColor: colores.borde, borderRadius: radios.campo, padding: 14, backgroundColor: colores.fondo },
  fijoTexto: { fontSize: 17, color: colores.texto },
  comentario: { borderWidth: 1, borderColor: colores.borde, borderRadius: radios.campo, padding: 12, fontSize: 16, minHeight: 92, textAlignVertical: 'top', color: colores.texto },
  contador: { textAlign: 'right', color: colores.textoSecundario, fontSize: 13, marginTop: 4 },
  info: { flexDirection: 'row', gap: 8, alignItems: 'center', backgroundColor: colores.azulFondo, borderRadius: 12, padding: 12, marginTop: 8 },
  infoTexto: { flex: 1, color: colores.azulTexto, fontSize: 14.5, lineHeight: 20 },
  error: { color: colores.error, fontSize: 15, marginTop: 10 },
  botones: { flexDirection: 'row', gap: 10, marginTop: 14 },
  boton: { flex: 1, minHeight: 52, borderRadius: radios.boton, alignItems: 'center', justifyContent: 'center' },
  botonBorde: { borderWidth: 1.5, borderColor: colores.primario },
  botonPrimario: { backgroundColor: colores.primario },
  botonTexto: { color: colores.blanco, fontSize: 17, fontWeight: '700' },
});
