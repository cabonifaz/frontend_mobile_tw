import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { nombreDeCodigo, obtenerCatalogo } from '@/api/catalogos';
import { ErrorApi } from '@/api/cliente';
import { firmarResponsable, obtenerFirmas, type ResponsableFirma, type Trazos } from '@/api/firmas';
import { Aviso } from '@/componentes/Aviso';
import { EncabezadoApp } from '@/componentes/EncabezadoApp';
import { FirmaVista, LienzoFirma } from '@/componentes/LienzoFirma';
import { useConsulta } from '@/hooks/useConsulta';
import { useDiseno } from '@/hooks/useDiseno';
import { useSesion } from '@/sesion/SesionContext';
import { colores, radios } from '@/tema/colores';
import { MENSAJE_PROXIMAMENTE, MOTIVO_AUSENTE_MAX, firmaSuficiente, motivoAusenteValido, siguienteResponsable, textoPaso, textoUnaFirma } from '@/utilidades/firmas';

/**
 * HU-17 — "Firma del responsable". Se llega desde la lista de informes con los responsables de los informes marcados (uno detrás de otro: "1 Rosa Quispe — 2 Luis Torres")
 * y también con "Editar firma". Una sola firma vale para todos los informes del responsable. Por dispositivo se dibuja en el lienzo; "Cliente ausente" deja constancia de la
 * aceptación tácita (la firma sigue pendiente); "Formato físico" lleva a tomar la foto del papel. "Enviar link" y "Generar QR" necesitan una página pública de firma que aún
 * no existe: salen deshabilitados. El servidor rechaza una firma igual a la de OTRO responsable de la misma orden ("Firma repetida"): se muestra con su motivo.
 */
export default function PantallaFirma() {
  const { sesion } = useSesion();
  const usuario = sesion?.usuario;
  const token = sesion?.token ?? '';
  const d = useDiseno();
  const params = useLocalSearchParams<{ id?: string; claves?: string; editar?: string }>();
  const idOs = Number(params.id);
  const claves = (params.claves ?? '').split(',').filter((c) => /^[0-9a-f]{32}$/.test(c));
  const editar = params.editar === '1';
  const valido = Number.isInteger(idOs) && idOs > 0 && claves.length > 0;

  const [actual, setActual] = useState(0);
  const [trazos, setTrazos] = useState<Trazos>([]);
  const [firmando, setFirmando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [rechazo, setRechazo] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [firmados, setFirmados] = useState<string[]>([]);
  const [ausente, setAusente] = useState(false);
  const [motivo, setMotivo] = useState('');

  const { datos, cargando, error } = useConsulta(async (tk) => {
    if (!valido) throw new ErrorApi('No hay responsables para firmar.', 400, 1);
    const [firmas, cargos] = await Promise.all([obtenerFirmas(tk, idOs), obtenerCatalogo(tk, 'CARGO_USUARIO').catch(() => undefined)]);
    return { firmas, cargos };
  }, `${idOs}|${params.claves ?? ''}`);

  const cargo = nombreDeCodigo(datos?.cargos, usuario?.cargo) ?? usuario?.cargo ?? 'Técnico de Campo';
  const responsables = claves.map((c) => datos?.firmas.responsables.find((r) => r.clave === c)).filter((r): r is ResponsableFirma => !!r);
  const claveActual = claves[actual] ?? '';
  const r = responsables.find((x) => x.clave === claveActual);
  const cliente = datos?.firmas.cabecera.cliente;
  const previa = r && editar && r.firma === 'firmado' ? r.trazos : null;

  function avanzar(textoOk: string) {
    const siguiente = siguienteResponsable(claves, claveActual);
    setFirmados((f) => [...f, claveActual]);
    setTrazos([]);
    setRechazo(null);
    if (siguiente) {
      setActual(claves.indexOf(siguiente));
      setMensaje(textoOk);
    } else {
      router.replace({ pathname: '/firma-informes', params: { id: String(idOs) } });
    }
  }

  async function confirmar() {
    if (!r || !firmaSuficiente(trazos) || ocupado) return;
    setOcupado(true);
    setRechazo(null);
    setMensaje(null);
    try {
      const res = await firmarResponsable(token, idOs, r.clave, { modo: 'dispositivo', trazos });
      avanzar(res.mensaje);
    } catch (e) {
      const texto = e instanceof Error ? e.message : 'No se pudo registrar la firma.';
      if (e instanceof ErrorApi && e.idTipoMensaje === 1 && /propia firma/.test(texto)) setRechazo(texto);
      else setMensaje(texto);
    } finally {
      setOcupado(false);
    }
  }

  async function registrarAusente() {
    if (!r || !motivoAusenteValido(motivo) || ocupado) return;
    setOcupado(true);
    try {
      const res = await firmarResponsable(token, idOs, r.clave, { modo: 'ausente', motivo: motivo.trim() });
      setAusente(false);
      setMotivo('');
      avanzar(res.mensaje);
    } catch (e) {
      setAusente(false);
      setMensaje(e instanceof Error ? e.message : 'No se pudo registrar.');
    } finally {
      setOcupado(false);
    }
  }

  const informes = (r?.informes ?? '').split(' · ').filter(Boolean);
  const confirmable = firmaSuficiente(trazos) && !rechazo;

  return (
    <SafeAreaView style={estilos.area} edges={['top']}>
      <EncabezadoApp nombre={usuario?.nombre ?? ''} apellido={usuario?.apellido} subtitulo={`${usuario?.nombre ?? ''} · ${cargo}`} />
      <ScrollView scrollEnabled={!firmando} contentContainerStyle={[estilos.contenido, { paddingHorizontal: d.margen, maxWidth: d.anchoMaximo }]} keyboardShouldPersistTaps="handled">
        <View style={estilos.tituloFila}>
          <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Volver">
            <Ionicons name="arrow-back" size={24} color={colores.titulo} />
          </Pressable>
          <Text style={[estilos.titulo, { fontSize: d.tituloPantalla }]} accessibilityRole="header">
            {editar ? 'Editar firma' : 'Firma del responsable'}
          </Text>
        </View>

        {cargando ? (
          <ActivityIndicator color={colores.primario} style={{ marginTop: 40 }} />
        ) : error || !r ? (
          <Aviso tipo="error" mensaje={error ?? 'Ese responsable ya no tiene informes para firmar.'} />
        ) : (
          <>
            <Text style={estilos.subtitulo}>
              {editar ? 'Editar firma' : 'Informes seleccionados'} · {datos?.firmas.cabecera.numeroOs}
              {cliente ? ` · ${cliente}` : ''}
            </Text>

            {claves.length > 1 && (
              <View style={estilos.pasos} testID="pasos-firma">
                {responsables.map((x, i) => {
                  const hecho = firmados.includes(x.clave);
                  const esActual = x.clave === claveActual;
                  return (
                    <View key={x.clave} style={estilos.paso}>
                      <View style={[estilos.circulo, hecho ? estilos.circuloHecho : esActual ? estilos.circuloActual : null]}>
                        {hecho ? <Ionicons name="checkmark" size={16} color={colores.blanco} /> : <Text style={[estilos.circuloTexto, esActual && { color: colores.blanco }]}>{i + 1}</Text>}
                      </View>
                      <Text style={[estilos.pasoNombre, esActual && { color: colores.titulo, fontWeight: '800' }]} numberOfLines={1}>
                        {x.nombre}
                      </Text>
                    </View>
                  );
                })}
                <Text style={estilos.pasoConteo}>{textoPaso(Math.min(firmados.length + 1, claves.length), claves.length)}</Text>
              </View>
            )}

            <View style={estilos.tarjeta} testID="responsable-firma">
              <Text style={estilos.nombre}>{r.nombre}</Text>
              <Text style={estilos.cargo}>
                {[r.cargo, cliente].filter(Boolean).join(' · ')}
              </Text>
              <View style={estilos.chips}>
                {informes.map((n) => (
                  <View key={n} style={estilos.chip}>
                    <Text style={estilos.chipTexto}>IT {n}</Text>
                  </View>
                ))}
              </View>
              <Text style={estilos.cargo}>{textoUnaFirma(r)}</Text>
            </View>

            <View style={estilos.opciones}>
              <Opcion texto="Firmar en dispositivo" activa />
              <Opcion texto="Enviar link" deshabilitada />
              <Opcion texto="Generar QR" deshabilitada />
              <Opcion texto="Cliente ausente" onPress={() => setAusente(true)} testID="cliente-ausente" />
              <Opcion texto="Formato físico" onPress={() => router.push({ pathname: '/constancia-formato-fisico', params: { id: String(idOs), clave: r.clave } })} testID="formato-fisico" />
            </View>
            <Text style={estilos.proximamente}>Enviar link y Generar QR: {MENSAJE_PROXIMAMENTE}</Text>

            {rechazo ? (
              <View style={estilos.rechazo} testID="firma-repetida">
                <View style={estilos.rechazoTag}>
                  <Ionicons name="alert-circle" size={14} color={colores.rojo} />
                  <Text style={estilos.rechazoTagTexto}>FIRMA REPETIDA</Text>
                </View>
                <View style={{ alignItems: 'center', marginVertical: 8 }}>
                  <FirmaVista trazos={trazos} ancho={250} color={colores.rojo} />
                </View>
                <Text style={estilos.rechazoTitulo}>La firma no corresponde a este responsable</Text>
                <Text style={estilos.rechazoTexto}>{rechazo.replace(/^La firma no corresponde a este responsable:?\s*/, '')}</Text>
              </View>
            ) : (
              <>
                {previa && (
                  <View style={estilos.previa}>
                    <Text style={estilos.previaTexto}>Firma actual (se reemplazará)</Text>
                    <FirmaVista trazos={previa.trazos} ancho={150} />
                  </View>
                )}
                <LienzoFirma trazos={trazos} onCambio={setTrazos} onTocando={setFirmando} etiqueta="Firma del responsable" deshabilitado={ocupado} />
              </>
            )}

            {!!mensaje && (
              <View style={{ marginTop: 10 }}>
                <Aviso tipo={/registrada|ausente/i.test(mensaje) ? 'info' : 'error'} mensaje={mensaje} />
              </View>
            )}

            <View style={estilos.botones}>
              <Pressable onPress={() => { setTrazos([]); setRechazo(null); }} style={[estilos.boton, estilos.botonBorde]} accessibilityRole="button" testID="limpiar-firma">
                <Text style={estilos.botonBordeTexto}>Limpiar</Text>
              </Pressable>
              <Pressable
                onPress={() => void confirmar()}
                disabled={!confirmable || ocupado}
                style={[estilos.boton, estilos.botonPrimario, (!confirmable || ocupado) && { opacity: 0.45 }]}
                accessibilityRole="button"
                accessibilityState={{ disabled: !confirmable || ocupado }}
                testID="confirmar-firma"
              >
                {ocupado ? <ActivityIndicator color={colores.blanco} /> : <Text style={estilos.botonPrimarioTexto}>Confirmar firma</Text>}
              </Pressable>
            </View>
            <Text style={estilos.ayuda}>
              {rechazo
                ? `Pide a ${r.nombre} que firme con su propia firma. Si no está presente, usa «Cliente ausente» o el formato físico.`
                : editar
                  ? '«Editar firma» reemplaza la firma del responsable en todos sus informes y queda registrada.'
                  : 'La firma se guarda como trazos digitales y vale para todos los informes de este responsable.'}
            </Text>
          </>
        )}
      </ScrollView>

      <Modal visible={ausente} transparent animationType="fade" onRequestClose={() => setAusente(false)}>
        <View style={estilos.velo}>
          <View style={estilos.modal}>
            <Text style={estilos.modalTitulo}>Cliente ausente</Text>
            <Text style={estilos.cargo}>
              {r?.nombre} no está en planta. Queda constancia de la aceptación tácita (quién, cuándo y el motivo); la firma sigue pendiente y el plazo corre.
            </Text>
            <TextInput
              value={motivo}
              onChangeText={(t) => setMotivo(t.slice(0, MOTIVO_AUSENTE_MAX))}
              placeholder="Motivo (mínimo 5 caracteres)"
              placeholderTextColor={colores.placeholder}
              multiline
              style={estilos.motivo}
              testID="motivo-ausente"
            />
            <View style={estilos.botones}>
              <Pressable onPress={() => setAusente(false)} style={[estilos.boton, estilos.botonBorde]} accessibilityRole="button">
                <Text style={estilos.botonBordeTexto}>Cancelar</Text>
              </Pressable>
              <Pressable
                onPress={() => void registrarAusente()}
                disabled={!motivoAusenteValido(motivo) || ocupado}
                style={[estilos.boton, estilos.botonPrimario, (!motivoAusenteValido(motivo) || ocupado) && { opacity: 0.45 }]}
                accessibilityRole="button"
                testID="registrar-ausente"
              >
                {ocupado ? <ActivityIndicator color={colores.blanco} /> : <Text style={estilos.botonPrimarioTexto}>Registrar</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function Opcion(props: { texto: string; activa?: boolean; deshabilitada?: boolean; onPress?: () => void; testID?: string }) {
  return (
    <Pressable
      onPress={props.onPress}
      disabled={props.deshabilitada || props.activa}
      style={[estilos.opcion, props.activa && estilos.opcionActiva, props.deshabilitada && { opacity: 0.45 }]}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!props.deshabilitada, selected: !!props.activa }}
      testID={props.testID}
    >
      <Text style={[estilos.opcionTexto, props.activa && { color: colores.blanco }]}>{props.texto}</Text>
    </Pressable>
  );
}

const estilos = StyleSheet.create({
  area: { flex: 1, backgroundColor: colores.fondo },
  contenido: { paddingTop: 18, paddingBottom: 28, width: '100%', alignSelf: 'center' },
  tituloFila: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4 },
  titulo: { fontWeight: '700', color: colores.titulo, flexShrink: 1 },
  subtitulo: { color: colores.textoSecundario, fontSize: 14, marginBottom: 10 },
  pasos: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' },
  paso: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  circulo: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: colores.grisFondo },
  circuloActual: { backgroundColor: colores.primario },
  circuloHecho: { backgroundColor: colores.verde },
  circuloTexto: { fontSize: 13, fontWeight: '800', color: colores.textoSecundario },
  pasoNombre: { fontSize: 13.5, color: colores.textoSecundario, flexShrink: 1 },
  pasoConteo: { marginLeft: 'auto', fontSize: 13, color: colores.textoTenue },
  tarjeta: { backgroundColor: colores.blanco, borderWidth: 1, borderColor: colores.bordeSuave, borderRadius: radios.tarjeta, padding: 16, marginBottom: 12 },
  nombre: { fontSize: 20, fontWeight: '800', color: colores.titulo },
  cargo: { fontSize: 14.5, color: colores.textoSecundario, marginTop: 3, lineHeight: 20 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10, marginBottom: 6 },
  chip: { backgroundColor: colores.azulFondo, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 3 },
  chipTexto: { fontSize: 12.5, fontWeight: '800', color: colores.azulTexto },
  opciones: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 6 },
  opcion: { borderWidth: 1.5, borderColor: colores.borde, borderRadius: radios.boton, paddingHorizontal: 12, paddingVertical: 11, backgroundColor: colores.blanco, flexGrow: 1, alignItems: 'center' },
  opcionActiva: { backgroundColor: colores.primario, borderColor: colores.primario },
  opcionTexto: { fontSize: 14, fontWeight: '700', color: colores.primario },
  proximamente: { fontSize: 12, color: colores.textoTenue, marginBottom: 10 },
  previa: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  previaTexto: { fontSize: 13, color: colores.textoSecundario },
  rechazo: { borderWidth: 1.5, borderColor: '#FCA5A5', backgroundColor: '#FEF2F2', borderRadius: radios.tarjeta, padding: 12 },
  rechazoTag: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-end', backgroundColor: colores.rojoEtiquetaFondo, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  rechazoTagTexto: { fontSize: 11.5, fontWeight: '800', color: colores.rojoEtiquetaTexto },
  rechazoTitulo: { fontSize: 15.5, fontWeight: '800', color: colores.rojoEtiquetaTexto },
  rechazoTexto: { fontSize: 14, color: colores.titulo, marginTop: 4, lineHeight: 20 },
  botones: { flexDirection: 'row', gap: 10, marginTop: 12 },
  boton: { flex: 1, minHeight: 52, borderRadius: radios.boton, alignItems: 'center', justifyContent: 'center' },
  botonBorde: { borderWidth: 1.5, borderColor: colores.primario, backgroundColor: colores.blanco },
  botonBordeTexto: { color: colores.primario, fontSize: 16.5, fontWeight: '700' },
  botonPrimario: { backgroundColor: colores.primario, flex: 1.6 },
  botonPrimarioTexto: { color: colores.blanco, fontSize: 16.5, fontWeight: '700' },
  ayuda: { textAlign: 'center', color: colores.textoSecundario, fontSize: 13.5, marginTop: 10, lineHeight: 19 },
  velo: { flex: 1, backgroundColor: 'rgba(2,6,23,0.55)', justifyContent: 'center', padding: 22 },
  modal: { backgroundColor: colores.blanco, borderRadius: 22, padding: 20, gap: 8 },
  modalTitulo: { fontSize: 22, fontWeight: '800', color: colores.titulo },
  motivo: { borderWidth: 1, borderColor: colores.borde, borderRadius: radios.campo, padding: 12, fontSize: 16, minHeight: 84, textAlignVertical: 'top', color: colores.texto },
});
