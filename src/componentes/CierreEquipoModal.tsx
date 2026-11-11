import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { CierreEquipo } from '@/api/informe';
import { Aviso } from '@/componentes/Aviso';
import { colores, radios } from '@/tema/colores';
import { etapasPorResolver, textoNoSePuedeFinalizar } from '@/utilidades/trabajo';

interface Props {
  visible: boolean;
  cierre: CierreEquipo | null;
  /** Error al validar o al generar (mensaje del servidor). */
  error: string | null;
  generando: boolean;
  /** "Revisar pendientes": cierra el modal y marca en rojo las etapas que faltan. */
  onRevisar: () => void;
  /** Toca una etapa de la lista: abre su pantalla. */
  onIrEtapa: (codigo: string) => void;
  onGenerar: () => void;
  /** El informe ya estaba generado: sigue a Firma de informes. */
  onIrFirma: () => void;
  onCerrar: () => void;
}

/**
 * HU-16 — Hard Stop de "Finalizar trabajo en equipo". El servidor valida las 5 etapas con una sola regla y la app muestra una de tres cosas:
 *  - "No es posible finalizar el trabajo en el equipo" (candado rojo): las etapas incompletas o no conformes con sus pendientes; tocar una abre su pantalla.
 *  - "Validación completa" (escudo verde): las 5 etapas conformes y "Generar informe técnico".
 *  - "Informe técnico generado": el equipo ya estaba cerrado; sigue Firma de informes.
 */
export function CierreEquipoModal({ visible, cierre, error, generando, onRevisar, onIrEtapa, onGenerar, onIrFirma, onCerrar }: Props) {
  const porResolver = cierre ? etapasPorResolver(cierre.etapas) : [];
  const completo = !!cierre && porResolver.length === 0;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCerrar}>
      <View style={estilos.velo}>
        <View style={estilos.tarjeta} testID="modal-cierre">
          {!cierre ? (
            error ? (
              <>
                <Aviso tipo="error" mensaje={error} />
                <Pressable onPress={onCerrar} style={estilos.enlace} accessibilityRole="button">
                  <Text style={estilos.enlaceTexto}>Cerrar</Text>
                </Pressable>
              </>
            ) : (
              <ActivityIndicator color={colores.primario} style={{ marginVertical: 30 }} />
            )
          ) : cierre.yaGenerado ? (
            <>
              <View style={[estilos.icono, { backgroundColor: colores.verdeFondo }]}>
                <Ionicons name="document-text" size={34} color={colores.verde} />
              </View>
              <Text style={[estilos.titulo, { color: colores.verde }]}>Informe técnico generado</Text>
              <Text style={estilos.subtitulo}>
                {cierre.equipo} · informe {cierre.numeroInforme ?? '—'}. El equipo ya está completado.
              </Text>
              <Pressable onPress={onIrFirma} style={estilos.primario} accessibilityRole="button" testID="ir-a-firma">
                <Ionicons name="create-outline" size={20} color={colores.blanco} />
                <Text style={estilos.primarioTexto}>Ir a firma de informes</Text>
              </Pressable>
              <Pressable onPress={onCerrar} style={estilos.enlace} accessibilityRole="button">
                <Text style={estilos.enlaceTexto}>Cerrar</Text>
              </Pressable>
            </>
          ) : completo ? (
            <>
              <View style={[estilos.icono, { backgroundColor: colores.verdeFondo }]}>
                <Ionicons name="shield-checkmark" size={36} color={colores.verde} />
              </View>
              <Text style={[estilos.titulo, { color: colores.titulo }]}>Validación completa</Text>
              <Text style={estilos.subtitulo}>
                {cierre.etapas.some((e) => e.estado === 'notificado') ? `Las ${cierre.total} etapas están resueltas.` : `Las ${cierre.total} etapas están conformes.`}
              </Text>
              <View style={estilos.lista}>
                {cierre.etapas.map((e) => (
                  <View key={e.codigo} style={{ paddingVertical: 2 }}>
                    <View style={estilos.filaEtapa}>
                      <Text style={estilos.nombreEtapa}>{e.nombre}</Text>
                      <Ionicons name={e.estado === 'notificado' ? 'alert-circle' : 'checkmark-circle'} size={22} color={e.estado === 'notificado' ? colores.amarilloTexto : colores.verde} />
                    </View>
                    {e.estado === 'notificado' && !!e.detalle && <Text style={{ color: colores.amarilloTexto, fontSize: 13.5, marginTop: 2 }}>{e.detalle}</Text>}
                  </View>
                ))}
              </View>
              {!!error && <Aviso tipo="error" mensaje={error} />}
              <Pressable onPress={onGenerar} disabled={generando} style={[estilos.primario, generando && { opacity: 0.6 }]} accessibilityRole="button" testID="generar-informe">
                {generando ? <ActivityIndicator color={colores.blanco} /> : <Ionicons name="document-text-outline" size={20} color={colores.blanco} />}
                <Text style={estilos.primarioTexto}>Generar informe técnico</Text>
              </Pressable>
              {!generando && (
                <Pressable onPress={onCerrar} style={estilos.enlace} accessibilityRole="button">
                  <Text style={estilos.enlaceTexto}>Cerrar</Text>
                </Pressable>
              )}
            </>
          ) : (
            <>
              <View style={[estilos.icono, { backgroundColor: '#FEE2E2' }]}>
                <Ionicons name="lock-closed" size={32} color={colores.rojo} />
              </View>
              <Text style={[estilos.titulo, { color: colores.rojoEtiquetaTexto }]}>No es posible finalizar el trabajo en el equipo</Text>
              <Text style={estilos.subtitulo}>{textoNoSePuedeFinalizar(porResolver.length)}</Text>
              <ScrollView style={estilos.lista} contentContainerStyle={{ paddingBottom: 4 }}>
                {porResolver.map((e) => (
                  <Pressable key={e.codigo} onPress={() => onIrEtapa(e.codigo)} style={estilos.bloqueEtapa} accessibilityRole="button" testID={`pendiente-${e.codigo}`}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text style={[estilos.nombreEtapa, { flex: 1 }]}>{e.nombre}</Text>
                      <Ionicons name="chevron-forward" size={18} color={colores.textoSecundario} />
                    </View>
                    {(e.pendientes.length > 0 ? e.pendientes : [e.detalle ?? 'Etapa incompleta']).map((p, i) => (
                      <View key={i} style={estilos.pendiente}>
                        <View style={estilos.punto} />
                        <Text style={estilos.pendienteTexto}>{p}</Text>
                      </View>
                    ))}
                  </Pressable>
                ))}
              </ScrollView>
              <Pressable onPress={onRevisar} style={estilos.primario} accessibilityRole="button" testID="revisar-pendientes">
                <Text style={estilos.primarioTexto}>Revisar pendientes</Text>
              </Pressable>
              <Pressable onPress={onCerrar} style={estilos.enlace} accessibilityRole="button" testID="cerrar-cierre">
                <Text style={estilos.enlaceTexto}>Cerrar</Text>
              </Pressable>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const estilos = StyleSheet.create({
  velo: { flex: 1, backgroundColor: 'rgba(2,6,23,0.65)', justifyContent: 'center', padding: 20 },
  tarjeta: { backgroundColor: colores.blanco, borderRadius: 22, padding: 20, gap: 8, maxHeight: '88%' },
  icono: { width: 70, height: 70, borderRadius: 35, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  titulo: { fontSize: 22, fontWeight: '800', textAlign: 'center', lineHeight: 28 },
  subtitulo: { textAlign: 'center', color: colores.textoSecundario, fontSize: 15.5, lineHeight: 21, marginBottom: 4 },
  lista: { maxHeight: 340 },
  filaEtapa: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colores.bordeSuave },
  bloqueEtapa: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colores.bordeSuave, gap: 6 },
  nombreEtapa: { fontSize: 17, fontWeight: '700', color: colores.titulo },
  pendiente: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  punto: { width: 9, height: 9, borderRadius: 5, backgroundColor: colores.rojo, marginTop: 6 },
  pendienteTexto: { flex: 1, fontSize: 15, color: colores.titulo, lineHeight: 21 },
  primario: { minHeight: 54, borderRadius: radios.boton, backgroundColor: colores.primario, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 8 },
  primarioTexto: { color: colores.blanco, fontSize: 17.5, fontWeight: '700' },
  enlace: { alignItems: 'center', paddingVertical: 10 },
  enlaceTexto: { color: colores.textoSecundario, fontSize: 17, fontWeight: '600' },
});
