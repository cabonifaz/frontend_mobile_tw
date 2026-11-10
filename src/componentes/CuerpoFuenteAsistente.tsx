import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { FuenteConsultada } from '@/api/asistente';
import { colores, radios } from '@/tema/colores';
import { detalleDocumento, etiquetaVerificacion } from '@/utilidades/asistente';

/**
 * HU-19 — "Fuente consultada": el documento oficial (OFICIAL), la sección, la advertencia, el fragmento que usó el asistente resaltado y, si el
 * back lo trajo, el texto que sigue atenuado. El fragmento es lo que citó la IA; la etiqueta dice si el back lo encontró en el PDF.
 */
export function CuerpoFuenteAsistente({ fuente }: { fuente: FuenteConsultada }) {
  const verificacion = etiquetaVerificacion(fuente.verificada);
  return (
    <View testID="cuerpo-fuente">
      <View style={[estilos.tarjeta, estilos.documento]}>
        <View style={estilos.iconoPdf}>
          <Ionicons name="document-text" size={22} color={colores.blanco} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={estilos.documentoTitulo}>{fuente.documento}</Text>
          <Text style={estilos.documentoDetalle}>{detalleDocumento(fuente)}</Text>
        </View>
        {fuente.oficial && (
          <View style={estilos.oficial} testID="etiqueta-oficial">
            <Text style={estilos.oficialTexto}>OFICIAL</Text>
          </View>
        )}
      </View>

      <View style={[estilos.tarjeta, { marginTop: 12 }]}>
        {!!fuente.seccion && <Text style={estilos.seccion}>{fuente.seccion}</Text>}
        {!!fuente.advertencia && (
          <View style={estilos.advertencia}>
            <Ionicons name="warning" size={16} color="#92400E" style={{ marginTop: 3 }} />
            <Text style={estilos.advertenciaTexto}>{fuente.advertencia}</Text>
          </View>
        )}
        <View style={estilos.fragmento} testID="fragmento-citado">
          <Text style={estilos.fragmentoTexto}>{fuente.fragmento}</Text>
        </View>
        {!!fuente.contextoPosterior && <Text style={estilos.posterior}>{fuente.contextoPosterior}</Text>}
      </View>

      <View style={estilos.nota}>
        <Ionicons name="information-circle-outline" size={16} color={colores.textoSecundario} />
        <Text style={estilos.notaTexto}>Resaltado: el fragmento que usó el asistente.</Text>
      </View>
      {verificacion && (
        <View style={estilos.nota} testID="etiqueta-verificacion">
          <Ionicons name={verificacion.tono === 'ok' ? 'checkmark-circle' : 'alert-circle'} size={16} color={verificacion.tono === 'ok' ? colores.verde : colores.naranja} />
          <Text style={[estilos.notaTexto, { fontWeight: '700', color: verificacion.tono === 'ok' ? colores.verdeEtiquetaTexto : colores.amarilloTexto }]}>{verificacion.texto}</Text>
        </View>
      )}
    </View>
  );
}

const estilos = StyleSheet.create({
  tarjeta: { backgroundColor: colores.blanco, borderWidth: 1, borderColor: colores.bordeSuave, borderRadius: radios.tarjeta, padding: 14 },
  documento: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconoPdf: { width: 38, height: 44, borderRadius: 8, backgroundColor: '#DC2626', alignItems: 'center', justifyContent: 'center' },
  documentoTitulo: { fontSize: 18, fontWeight: '800', color: colores.titulo },
  documentoDetalle: { fontSize: 14, color: colores.textoSecundario, marginTop: 2, lineHeight: 20 },
  oficial: { backgroundColor: colores.verdeEtiquetaFondo, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start' },
  oficialTexto: { fontSize: 12.5, fontWeight: '800', letterSpacing: 0.5, color: colores.verdeEtiquetaTexto },
  seccion: { fontSize: 17.5, fontWeight: '800', color: colores.titulo, marginBottom: 10 },
  advertencia: { flexDirection: 'row', gap: 8, backgroundColor: '#FEF3C7', borderLeftWidth: 4, borderLeftColor: '#F59E0B', padding: 10, marginBottom: 10 },
  advertenciaTexto: { flex: 1, fontSize: 15.5, color: colores.titulo, lineHeight: 22 },
  fragmento: { backgroundColor: colores.azulFondo, borderRadius: 8, padding: 12 },
  fragmentoTexto: { fontSize: 16, color: colores.titulo, lineHeight: 24 },
  posterior: { fontSize: 15.5, color: '#A5B0C0', lineHeight: 23, marginTop: 10 },
  nota: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  notaTexto: { fontSize: 14, color: colores.textoSecundario, flexShrink: 1 },
});
