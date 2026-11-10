import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { registrarAvisoCliente } from '@/api/panelCampo';
import { colores, radios } from '@/tema/colores';
import { MAX_AVISO, errorAviso } from '@/utilidades/panelCampo';

interface Props {
  visible: boolean;
  token: string;
  idOs: number;
  /** Mensaje sugerido (el jefe lo edita). */
  sugerido: string;
  /** Teléfono del contacto en planta, si lo hay: se muestra "Llamar al cliente". */
  onLlamarCliente?: () => void;
  onCerrar: () => void;
  onRegistrado: (mensaje: string) => void;
}

/**
 * HU-30 — "Avisar al cliente": el jefe escribe (o edita) el aviso, lo COMPARTE por el canal que prefiera (WhatsApp, correo, SMS…) o llama al contacto, y deja
 * CONSTANCIA en el seguimiento del servicio (quién, cuándo y qué avisó). La app NO envía nada al cliente por su cuenta.
 */
export function AvisarClienteModal(props: Props) {
  if (!props.visible) return null;
  return (
    <Modal visible transparent animationType="slide" onRequestClose={props.onCerrar}>
      <Formulario {...props} />
    </Modal>
  );
}

function Formulario({ token, idOs, sugerido, onLlamarCliente, onCerrar, onRegistrado }: Props) {
  const [mensaje, setMensaje] = useState(sugerido.slice(0, MAX_AVISO));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function compartir() {
    try {
      await Share.share({ message: mensaje.trim() });
    } catch {
      // se cerró el menú de compartir sin elegir nada
    }
  }

  async function registrar() {
    const falla = errorAviso(mensaje);
    if (falla) return setError(falla);
    setGuardando(true);
    setError(null);
    try {
      const r = await registrarAvisoCliente(token, idOs, mensaje);
      onRegistrado(r.mensaje);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo registrar el aviso.');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <KeyboardAvoidingView style={estilos.velo} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={estilos.hoja} testID="modal-avisar-cliente">
        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Text style={estilos.titulo}>Avisar al cliente</Text>
          <Text style={estilos.ayuda}>Comparte el aviso por el canal que prefieras y deja constancia en el seguimiento. La app no envía nada por su cuenta.</Text>

          <TextInput
            value={mensaje}
            onChangeText={(t) => setMensaje(t.slice(0, MAX_AVISO))}
            multiline
            style={estilos.texto}
            placeholder="Escribe el aviso para el cliente"
            placeholderTextColor={colores.placeholder}
            testID="mensaje-cliente"
          />
          <Text style={estilos.contador}>
            {mensaje.trim().length} / {MAX_AVISO}
          </Text>

          <View style={estilos.fila}>
            <Pressable onPress={() => void compartir()} style={[estilos.boton, estilos.botonBorde]} accessibilityRole="button" testID="compartir-aviso">
              <Ionicons name="share-social-outline" size={20} color={colores.primario} />
              <Text style={[estilos.botonTexto, { color: colores.primario }]}>Compartir</Text>
            </Pressable>
            {onLlamarCliente && (
              <Pressable onPress={onLlamarCliente} style={[estilos.boton, estilos.botonBorde]} accessibilityRole="button" testID="llamar-cliente">
                <Ionicons name="call-outline" size={20} color={colores.primario} />
                <Text style={[estilos.botonTexto, { color: colores.primario }]}>Llamar</Text>
              </Pressable>
            )}
          </View>

          {!!error && <Text style={estilos.error}>{error}</Text>}

          <View style={[estilos.fila, { marginTop: 12 }]}>
            <Pressable onPress={onCerrar} disabled={guardando} style={[estilos.boton, estilos.botonBorde]} accessibilityRole="button" testID="cancelar-aviso">
              <Text style={[estilos.botonTexto, { color: colores.primario }]}>Cerrar</Text>
            </Pressable>
            <Pressable onPress={() => void registrar()} disabled={guardando} style={[estilos.boton, estilos.botonPrimario, guardando && { opacity: 0.6 }]} accessibilityRole="button" testID="registrar-aviso">
              {guardando ? <ActivityIndicator color={colores.blanco} /> : <Text style={estilos.botonTexto}>Registrar aviso</Text>}
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
  ayuda: { fontSize: 14.5, color: colores.textoSecundario, marginTop: 2, marginBottom: 12, lineHeight: 20 },
  texto: { borderWidth: 1, borderColor: colores.borde, borderRadius: radios.campo, padding: 12, fontSize: 16, minHeight: 130, textAlignVertical: 'top', color: colores.texto },
  contador: { textAlign: 'right', color: colores.textoSecundario, fontSize: 13, marginTop: 4 },
  fila: { flexDirection: 'row', gap: 10, marginTop: 8 },
  error: { color: colores.error, fontSize: 15, marginTop: 10 },
  boton: { flex: 1, minHeight: 50, borderRadius: radios.boton, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 },
  botonBorde: { borderWidth: 1.5, borderColor: colores.primario },
  botonPrimario: { backgroundColor: colores.primario },
  botonTexto: { color: colores.blanco, fontSize: 16.5, fontWeight: '700' },
});
