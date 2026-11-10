import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { guardarCertificado, obtenerSolicitud } from '@/api/correlativos';
import { Aviso } from '@/componentes/Aviso';
import { Boton } from '@/componentes/Boton';
import { useConsulta } from '@/hooks/useConsulta';
import { useSesion } from '@/sesion/SesionContext';
import { colores, radios } from '@/tema/colores';
import { codigosCortos, fechaHoraDe } from '@/utilidades/correlativos';

interface Props {
  visible: boolean;
  idOs: number;
  idOsEquipo: number;
  /** Cierra el modal. `guardado` = el certificado quedó en el informe: el trabajo en el equipo se vuelve a leer. */
  onCerrar: (guardado: boolean) => void;
}

/**
 * HU-14 — Modal "Correlativo y certificado" (etapa 5 del trabajo en el equipo): el correlativo que Metrología asignó al equipo (con su ticket, área y fecha) se coloca como
 * "Certificado / constancia*" y al guardar forma parte del informe técnico, vinculado al número de serie. Sin correlativo asignado, un técnico de Metrología puede
 * elegir uno de su reserva diaria (queda "usado · por confirmar"). Guardar exige conexión.
 */
export function CertificadoModal(props: Props) {
  if (!props.visible) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => props.onCerrar(false)}>
      <View style={estilos.velo}>
        <Contenido {...props} />
      </View>
    </Modal>
  );
}

function Contenido({ idOs, idOsEquipo, onCerrar }: Props) {
  const { sesion } = useSesion();
  const [elegido, setElegido] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { datos, cargando, error: errorCarga } = useConsulta((token) => obtenerSolicitud(token, idOs, idOsEquipo), `modal-cert|${idOs}|${idOsEquipo}`);
  const c = datos?.cabecera;
  const asignado = datos?.asignado ?? null;
  const reserva = datos?.reservaLibre ?? [];
  // Lo elegido a mano (reserva) o, si no, el correlativo asignado por Metrología
  const seleccionado = elegido ?? asignado?.correlativo ?? null;

  async function guardar() {
    if (!sesion || !seleccionado) return;
    setGuardando(true);
    setError(null);
    try {
      await guardarCertificado(sesion.token, idOs, idOsEquipo, seleccionado);
      onCerrar(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar el certificado.');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <View style={estilos.modal} testID="modal-certificado">
      <Pressable onPress={() => onCerrar(false)} style={estilos.cerrar} hitSlop={12} accessibilityRole="button" accessibilityLabel="Cerrar">
        <Ionicons name="close" size={26} color={colores.titulo} />
      </Pressable>
      <Text style={estilos.titulo}>Correlativo y certificado</Text>

      {cargando ? (
        <ActivityIndicator color={colores.primario} style={{ marginVertical: 30 }} />
      ) : errorCarga || !c ? (
        <Aviso tipo="error" mensaje={errorCarga ?? 'No se pudo leer el equipo.'} />
      ) : (
        <>
          <Text style={estilos.subtitulo}>
            Número de serie: <Text style={{ fontWeight: '800', color: colores.titulo }}>{c.numeroSerie ?? '—'}</Text>
            {c.codigoCliente ? ` · ${c.codigoCliente}` : ''}
          </Text>

          {c.numeroCertificado ? (
            <View style={estilos.guardado} testID="certificado-vigente">
              <Ionicons name="checkmark-circle" size={22} color={colores.verde} />
              <Text style={estilos.guardadoTexto}>
                Certificado <Text style={{ fontWeight: '800' }}>{c.numeroCertificado}</Text> guardado: forma parte del informe técnico.
              </Text>
            </View>
          ) : (
            <>
              {asignado && (
                <View style={estilos.asignado}>
                  <View style={estilos.asignadoCab}>
                    <Text style={estilos.asignadoEtiqueta}>CORRELATIVO ASIGNADO</Text>
                    <View style={estilos.pill}>
                      <Text style={estilos.pillTexto}>ASIGNADO</Text>
                    </View>
                  </View>
                  <Text style={estilos.correlativo}>{asignado.correlativo}</Text>
                  <Text style={estilos.asignadoPie}>
                    {asignado.ticket} · Área de Metrología{asignado.asignadoEn ? ` · ${fechaHoraDe(asignado.asignadoEn)}` : ''}
                  </Text>
                </View>
              )}

              {!asignado && reserva.length > 0 && (
                <View style={{ marginTop: 14 }}>
                  <Text style={estilos.etiqueta}>Tu reserva del día</Text>
                  <View style={estilos.chips}>
                    {reserva.map((r) => (
                      <Pressable
                        key={r}
                        onPress={() => setElegido(r)}
                        style={[estilos.chip, seleccionado === r && estilos.chipActivo]}
                        accessibilityRole="button"
                        accessibilityState={{ selected: seleccionado === r }}
                        testID={`reserva-${r}`}
                      >
                        <Text style={[estilos.chipTexto, seleccionado === r && { color: colores.blanco }]}>{codigosCortos(r)}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              )}

              {!asignado && reserva.length === 0 && (
                <View style={{ marginTop: 14 }}>
                  <Aviso mensaje="Aún no tienes un correlativo asignado. Solicítalo a Metrología y se habilitará aquí." />
                  <View style={{ marginTop: 10 }}>
                    <Boton
                      titulo="Solicitar correlativo"
                      variante="secundario"
                      onPress={() => {
                        onCerrar(false);
                        router.push({ pathname: '/solicitud-correlativo', params: { id: String(idOs), equipo: String(idOsEquipo) } });
                      }}
                    />
                  </View>
                </View>
              )}

              <Text style={estilos.etiqueta}>Certificado / constancia *</Text>
              <View style={[estilos.campo, !!seleccionado && estilos.campoListo]} testID="campo-certificado">
                <Text style={[estilos.campoTexto, !seleccionado && { color: colores.placeholder }]}>{seleccionado ?? 'Elige un correlativo'}</Text>
                {!!seleccionado && <Ionicons name="checkmark-circle" size={22} color={colores.primario} />}
              </View>
              <Text style={estilos.ayuda}>
                Tomado del correlativo al tocar «Usar correlativo». Se vincula al número de serie y forma parte del informe técnico.
              </Text>

              {!!error && (
                <View style={{ marginTop: 10 }}>
                  <Aviso tipo="error" mensaje={error} />
                </View>
              )}
              <View style={{ marginTop: 14 }}>
                <Boton titulo="Guardar" onPress={() => void guardar()} cargando={guardando} deshabilitado={!seleccionado} />
              </View>
            </>
          )}
        </>
      )}
    </View>
  );
}

const estilos = StyleSheet.create({
  velo: { flex: 1, backgroundColor: 'rgba(2,6,23,0.55)', justifyContent: 'center', padding: 20 },
  modal: { backgroundColor: colores.blanco, borderRadius: 22, padding: 20 },
  cerrar: { position: 'absolute', top: 14, right: 14, zIndex: 2 },
  titulo: { fontSize: 24, fontWeight: '800', color: colores.titulo, textAlign: 'center', marginTop: 2 },
  subtitulo: { fontSize: 15.5, color: colores.textoSecundario, textAlign: 'center', marginTop: 4 },
  guardado: { flexDirection: 'row', gap: 10, alignItems: 'center', backgroundColor: colores.verdeFondo, borderColor: colores.verdeBorde, borderWidth: 1, borderRadius: radios.tarjeta, padding: 14, marginTop: 16 },
  guardadoTexto: { flex: 1, color: colores.titulo, fontSize: 16, lineHeight: 22 },
  asignado: { borderWidth: 1.5, borderColor: colores.primario, borderRadius: radios.tarjeta, padding: 14, marginTop: 16, backgroundColor: colores.primarioSuave },
  asignadoCab: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  asignadoEtiqueta: { fontSize: 12.5, fontWeight: '800', color: colores.textoSecundario, letterSpacing: 0.8 },
  pill: { backgroundColor: colores.azulFondo, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 3 },
  pillTexto: { color: colores.azulTexto, fontSize: 11.5, fontWeight: '800' },
  correlativo: { fontSize: 30, fontWeight: '800', color: colores.primario, marginTop: 4 },
  asignadoPie: { fontSize: 14, color: colores.textoSecundario, marginTop: 2 },
  etiqueta: { fontSize: 17, fontWeight: '700', color: colores.titulo, marginTop: 16, marginBottom: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderColor: colores.borde, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: colores.blanco },
  chipActivo: { backgroundColor: colores.primario, borderColor: colores.primario },
  chipTexto: { fontSize: 16, fontWeight: '700', color: colores.titulo },
  campo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1.5, borderColor: colores.borde, borderRadius: radios.campo, paddingHorizontal: 14, minHeight: 52 },
  campoListo: { borderColor: colores.primario, backgroundColor: colores.primarioSuave },
  campoTexto: { fontSize: 18, fontWeight: '700', color: colores.titulo },
  ayuda: { fontSize: 13.5, color: colores.textoSecundario, marginTop: 6, lineHeight: 19 },
});
