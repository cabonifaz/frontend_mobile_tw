import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { RespuestaAsistente } from '@/api/asistente';
import { colores, radios } from '@/tema/colores';
import { chipFuente, chipPagina, etiquetaVerificacion, fuentesConFragmento, mensajeSinRespuesta } from '@/utilidades/asistente';

interface Props {
  respuesta: RespuestaAsistente;
  /** La respuesta ya está guardada en el teléfono (el botón pasa a "Guardado"). */
  guardadaRespuesta?: boolean;
  /** Fuentes (n) cuyo fragmento ya está guardado. */
  fragmentosGuardados?: number[];
  onVerFuente: (n: number) => void;
  onGuardarRespuesta?: () => void;
  onGuardarFragmento?: (n: number) => void;
  /** "¿Te sirvió la respuesta?" (solo en la consulta en vivo, no en los guardados). */
  onValorar?: (util: boolean) => void;
}

/** "1. Coloca…" sin duplicar la numeración si el back ya la trajo. */
const sinNumero = (paso: string) => paso.replace(/^\s*\d+\s*[.)-]\s*/, '').trim();

/**
 * HU-19 — La respuesta del asistente como la maqueta: advertencia de seguridad (caja roja), pasos numerados y la fuente con su sección y página;
 * debajo "Ver fuente", "Guardar offline" y "Fragmento". Si el tema no está en los manuales oficiales lo dice (no se inventa una respuesta).
 */
export function TarjetaRespuestaAsistente({ respuesta, guardadaRespuesta = false, fragmentosGuardados = [], onVerFuente, onGuardarRespuesta, onGuardarFragmento, onValorar }: Props) {
  const conFragmento = fuentesConFragmento(respuesta);
  const primera = conFragmento[0] ?? null;
  const verificaciones = conFragmento.map((f) => f.verificada);
  const etiqueta = verificaciones.some((v) => v === false)
    ? etiquetaVerificacion(false)
    : conFragmento.length > 0 && verificaciones.every((v) => v === true)
      ? etiquetaVerificacion(true)
      : null;

  if (!respuesta.encontrada) {
    return (
      <View style={estilos.tarjeta} testID="respuesta-sin-resultado">
        <View style={estilos.sinRespuestaFila}>
          <Ionicons name="search-outline" size={22} color={colores.textoSecundario} />
          <Text style={estilos.sinRespuestaTitulo}>No encontré esto en los manuales</Text>
        </View>
        <Text style={estilos.texto}>{mensajeSinRespuesta(respuesta)}</Text>
        {respuesta.fuentes.length > 0 && (
          <>
            <Text style={estilos.consultados}>Documentos consultados</Text>
            <View style={estilos.chips}>
              {respuesta.fuentes.map((f) => (
                <View key={`${f.n}-${f.idDocumento}`} style={estilos.chip}>
                  <Ionicons name="book-outline" size={14} color={colores.azulTexto} />
                  <Text style={estilos.chipTexto}>{f.documento}</Text>
                </View>
              ))}
            </View>
          </>
        )}
      </View>
    );
  }

  return (
    <View>
      <View style={estilos.tarjeta} testID="respuesta-asistente">
        {!!respuesta.advertencia && (
          <View style={estilos.advertencia} testID="advertencia-seguridad">
            <Ionicons name="warning" size={20} color="#B91C1C" style={{ marginTop: 1 }} />
            <View style={{ flex: 1 }}>
              <Text style={estilos.advertenciaTitulo}>Advertencia de seguridad</Text>
              <Text style={estilos.advertenciaTexto}>{respuesta.advertencia}</Text>
            </View>
          </View>
        )}

        {respuesta.pasos.length > 0 && (
          <>
            <Text style={estilos.pasosTitulo}>Pasos</Text>
            {respuesta.pasos.map((p, i) => (
              <Text key={i} style={estilos.paso}>
                {i + 1}. {sinNumero(p)}
              </Text>
            ))}
          </>
        )}

        <View style={estilos.chips}>
          {respuesta.fuentes.map((f) => (
            <View key={f.n} style={estilos.chips}>
              <Pressable onPress={() => onVerFuente(f.n)} style={estilos.chip} accessibilityRole="button" accessibilityLabel={`Fuente: ${chipFuente(f)}`} testID={`fuente-${f.n}`}>
                <Ionicons name="book-outline" size={14} color={colores.azulTexto} />
                <Text style={estilos.chipTexto}>{chipFuente(f)}</Text>
              </Pressable>
              {chipPagina(f) && (
                <View style={estilos.chip}>
                  <Text style={estilos.chipTexto}>{chipPagina(f)}</Text>
                </View>
              )}
            </View>
          ))}
        </View>

        {etiqueta && (
          <View style={estilos.verificacion} testID="etiqueta-verificacion">
            <Ionicons name={etiqueta.tono === 'ok' ? 'checkmark-circle' : 'alert-circle'} size={16} color={etiqueta.tono === 'ok' ? colores.verde : colores.naranja} />
            <Text style={[estilos.verificacionTexto, { color: etiqueta.tono === 'ok' ? colores.verdeEtiquetaTexto : colores.amarilloTexto }]}>{etiqueta.texto}</Text>
          </View>
        )}

        <View style={estilos.acciones}>
          {primera && (
            <Pressable onPress={() => onVerFuente(primera.n)} style={estilos.accion} accessibilityRole="button" testID="ver-fuente" hitSlop={6}>
              <Ionicons name="eye-outline" size={18} color={colores.primario} />
              <Text style={estilos.accionTexto}>Ver fuente</Text>
            </Pressable>
          )}
          {onGuardarRespuesta && (
            <Pressable onPress={onGuardarRespuesta} disabled={guardadaRespuesta} style={estilos.accion} accessibilityRole="button" accessibilityState={{ disabled: guardadaRespuesta }} testID="guardar-offline" hitSlop={6}>
              <Ionicons name={guardadaRespuesta ? 'bookmark' : 'bookmark-outline'} size={18} color={guardadaRespuesta ? colores.verde : colores.primario} />
              <Text style={[estilos.accionTexto, guardadaRespuesta && { color: colores.verde }]}>{guardadaRespuesta ? 'Guardado' : 'Guardar offline'}</Text>
            </Pressable>
          )}
          {primera && onGuardarFragmento && (
            <Pressable
              onPress={() => onGuardarFragmento(primera.n)}
              disabled={fragmentosGuardados.includes(primera.n)}
              style={estilos.accion}
              accessibilityRole="button"
              accessibilityState={{ disabled: fragmentosGuardados.includes(primera.n) }}
              testID="guardar-fragmento"
              hitSlop={6}
            >
              <Ionicons name={fragmentosGuardados.includes(primera.n) ? 'checkmark-circle' : 'download-outline'} size={18} color={fragmentosGuardados.includes(primera.n) ? colores.verde : colores.primario} />
              <Text style={[estilos.accionTexto, fragmentosGuardados.includes(primera.n) && { color: colores.verde }]}>Fragmento</Text>
            </Pressable>
          )}
        </View>
      </View>

      {onValorar && (
        <View style={estilos.valoracion} testID="valoracion">
          <Pressable onPress={() => onValorar(true)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Me sirvió" accessibilityState={{ selected: respuesta.util === true }} testID="util-si">
            <Ionicons name={respuesta.util === true ? 'thumbs-up' : 'thumbs-up-outline'} size={20} color={respuesta.util === true ? colores.verde : colores.textoSecundario} />
          </Pressable>
          <Pressable onPress={() => onValorar(false)} hitSlop={8} accessibilityRole="button" accessibilityLabel="No me sirvió" accessibilityState={{ selected: respuesta.util === false }} testID="util-no">
            <Ionicons name={respuesta.util === false ? 'thumbs-down' : 'thumbs-down-outline'} size={20} color={respuesta.util === false ? colores.rojo : colores.textoSecundario} />
          </Pressable>
          <Text style={estilos.valoracionTexto}>{respuesta.util === null ? '¿Te sirvió la respuesta?' : 'Gracias por tu opinión.'}</Text>
        </View>
      )}
    </View>
  );
}

const estilos = StyleSheet.create({
  tarjeta: { backgroundColor: colores.blanco, borderWidth: 1, borderColor: colores.bordeSuave, borderRadius: radios.tarjeta, padding: 14, gap: 10 },
  advertencia: { flexDirection: 'row', gap: 10, backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FCA5A5', borderRadius: 12, padding: 12 },
  advertenciaTitulo: { fontSize: 16, fontWeight: '800', color: '#991B1B' },
  advertenciaTexto: { fontSize: 15.5, color: '#B91C1C', lineHeight: 22, marginTop: 2 },
  pasosTitulo: { fontSize: 18, fontWeight: '800', color: colores.titulo },
  paso: { fontSize: 16.5, color: colores.titulo, lineHeight: 25 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colores.azulFondo, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  chipTexto: { fontSize: 13.5, fontWeight: '800', color: colores.azulTexto },
  verificacion: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  verificacionTexto: { fontSize: 13.5, fontWeight: '700', flexShrink: 1 },
  acciones: { flexDirection: 'row', flexWrap: 'wrap', gap: 18, marginTop: 2 },
  accion: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 },
  accionTexto: { fontSize: 16, fontWeight: '700', color: colores.primario },
  valoracion: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10, paddingLeft: 2 },
  valoracionTexto: { fontSize: 14.5, color: colores.textoSecundario },
  sinRespuestaFila: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sinRespuestaTitulo: { fontSize: 17, fontWeight: '800', color: colores.titulo, flexShrink: 1 },
  texto: { fontSize: 16, color: colores.texto, lineHeight: 23 },
  consultados: { fontSize: 13, fontWeight: '800', letterSpacing: 0.8, color: colores.textoSecundario, marginTop: 4 },
});
