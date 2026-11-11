import { useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { nombreDeCodigo, obtenerCatalogo } from '@/api/catalogos';
import { constanciaFormatoFisico, firmarResponsableFisico } from '@/api/firmas';
import { Aviso } from '@/componentes/Aviso';
import { CamaraApp } from '@/componentes/CamaraApp';
import { EncabezadoApp } from '@/componentes/EncabezadoApp';
import { useConsulta } from '@/hooks/useConsulta';
import { useDiseno } from '@/hooks/useDiseno';
import { useSesion } from '@/sesion/SesionContext';
import { colores, radios } from '@/tema/colores';
import { nombreFirmanteValido } from '@/utilidades/firmas';

/**
 * HU-17 — "Formato físico": el cliente (o el responsable de unos informes) firmó en papel. Se toma la foto con la cámara de la app (la galería no se usa) y se indica el
 * nombre de quien firmó. Sin `clave` es la constancia de servicio; con `clave` es la firma de ese responsable en la lista de informes. La foto se guarda tal cual: no
 * pasa por la IA (la validación de legibilidad de la HU-11 es solo para las evidencias del equipo), así que conviene tomarla completa y nítida.
 */
export default function PantallaConstanciaFormatoFisico() {
  const { sesion } = useSesion();
  const usuario = sesion?.usuario;
  const token = sesion?.token ?? '';
  const d = useDiseno();
  const params = useLocalSearchParams<{ id?: string; clave?: string }>();
  const idOs = Number(params.id);
  const clave = /^[0-9a-f]{32}$/.test(params.clave ?? '') ? params.clave! : null;
  const valido = Number.isInteger(idOs) && idOs > 0;
  const [camara, setCamara] = useState(false);
  const [foto, setFoto] = useState<string | null>(null);
  const [nombre, setNombre] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { datos } = useConsulta(async (tk) => ({ cargos: await obtenerCatalogo(tk, 'CARGO_USUARIO').catch(() => undefined) }), String(idOs));
  const cargo = nombreDeCodigo(datos?.cargos, usuario?.cargo) ?? usuario?.cargo ?? 'Técnico de Campo';
  const puede = !!foto && nombreFirmanteValido(nombre) && !ocupado;

  async function guardar() {
    if (!foto || !puede) return;
    setOcupado(true);
    setError(null);
    try {
      if (clave) await firmarResponsableFisico(token, idOs, clave, { fotoUri: foto, nombre });
      else await constanciaFormatoFisico(token, idOs, { fotoUri: foto, nombre });
      router.replace(clave ? { pathname: '/firma-informes', params: { id: String(idOs) } } : { pathname: '/constancia', params: { id: String(idOs) } });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar el formato físico.');
    } finally {
      setOcupado(false);
    }
  }

  return (
    <SafeAreaView style={estilos.area} edges={['top']}>
      <EncabezadoApp nombre={usuario?.nombre ?? ''} apellido={usuario?.apellido} subtitulo={`${usuario?.nombre ?? ''} · ${cargo}`} />
      <ScrollView contentContainerStyle={[estilos.contenido, { paddingHorizontal: d.margen, maxWidth: d.anchoMaximo }]} keyboardShouldPersistTaps="handled">
        <View style={estilos.tituloFila}>
          <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Volver">
            <Ionicons name="arrow-back" size={24} color={colores.titulo} />
          </Pressable>
          <Text style={[estilos.titulo, { fontSize: d.tituloPantalla }]} accessibilityRole="header">
            Formato físico
          </Text>
        </View>
        <Text style={estilos.subtitulo}>{clave ? 'Firma del responsable en papel' : 'Constancia de servicio en papel'}</Text>

        {!valido ? (
          <Aviso tipo="error" mensaje="Servicio no válido." />
        ) : (
          <>
            <View style={estilos.info}>
              <Ionicons name="information-circle-outline" size={20} color={colores.primario} />
              <Text style={estilos.infoTexto}>{clave ? 'Usa esta opción si el responsable firmó el formato en papel.' : 'Usa esta opción si el cliente firmó la constancia en papel.'}</Text>
            </View>

            {foto ? (
              <>
                <Image source={{ uri: foto }} style={estilos.foto} resizeMode="contain" accessibilityLabel="Foto del formato físico" />
                <View style={estilos.ok}>
                  <Ionicons name="checkmark-circle" size={20} color={colores.verde} />
                  <Text style={estilos.okTexto}>Foto tomada con la cámara de la app. Revisa que se lea completa y que la firma se vea.</Text>
                </View>
              </>
            ) : (
              <Pressable onPress={() => setCamara(true)} style={estilos.tomar} accessibilityRole="button" testID="tomar-foto">
                <Ionicons name="camera-outline" size={40} color={colores.primario} />
                <Text style={estilos.tomarTexto}>Tomar foto del formato</Text>
                <Text style={estilos.linea}>Solo cámara de la app: la galería está deshabilitada.</Text>
              </Pressable>
            )}

            <Text style={estilos.etiqueta}>Nombre de quien firmó *</Text>
            <TextInput value={nombre} onChangeText={(t) => setNombre(t.slice(0, 150))} placeholder="Nombre y apellido" placeholderTextColor={colores.placeholder} style={estilos.campo} testID="nombre-firmante-fisico" />

            {!!error && (
              <View style={{ marginTop: 10 }}>
                <Aviso tipo="error" mensaje={error} />
              </View>
            )}

            <View style={estilos.fila}>
              <Pressable onPress={() => setCamara(true)} style={[estilos.boton, estilos.botonBorde]} accessibilityRole="button" testID="repetir-foto">
                <Text style={estilos.botonBordeTexto}>{foto ? 'Repetir foto' : 'Abrir cámara'}</Text>
              </Pressable>
              <Pressable
                onPress={() => void guardar()}
                disabled={!puede}
                style={[estilos.boton, estilos.botonPrimario, !puede && { opacity: 0.45 }]}
                accessibilityRole="button"
                accessibilityState={{ disabled: !puede }}
                testID="guardar-formato-fisico"
              >
                {ocupado ? <ActivityIndicator color={colores.blanco} /> : <Text style={estilos.botonPrimarioTexto}>{clave ? 'Guardar firma' : 'Guardar constancia'}</Text>}
              </Pressable>
            </View>
          </>
        )}
      </ScrollView>
      <CamaraApp
        visible={camara}
        modo="foto"
        onCerrar={() => setCamara(false)}
        onFoto={(uri) => {
          setFoto(uri);
          setCamara(false);
        }}
      />
    </SafeAreaView>
  );
}

const estilos = StyleSheet.create({
  area: { flex: 1, backgroundColor: colores.fondo },
  contenido: { paddingTop: 18, paddingBottom: 28, width: '100%', alignSelf: 'center' },
  tituloFila: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4 },
  titulo: { fontWeight: '700', color: colores.titulo, flexShrink: 1 },
  subtitulo: { color: colores.textoSecundario, fontSize: 14, marginBottom: 12 },
  info: { flexDirection: 'row', gap: 8, alignItems: 'center', backgroundColor: colores.primarioSuave, borderRadius: radios.tarjeta, padding: 12, marginBottom: 12 },
  infoTexto: { flex: 1, color: colores.titulo, fontSize: 14.5, lineHeight: 20 },
  foto: { width: '100%', height: 280, borderRadius: radios.tarjeta, backgroundColor: '#CBD5E1' },
  ok: { flexDirection: 'row', gap: 8, alignItems: 'center', backgroundColor: colores.verdeFondo, borderWidth: 1, borderColor: colores.verdeBorde, borderRadius: radios.tarjeta, padding: 10, marginTop: 8 },
  okTexto: { flex: 1, color: colores.titulo, fontSize: 14, lineHeight: 19 },
  tomar: { alignItems: 'center', gap: 6, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colores.borde, borderRadius: radios.tarjeta, backgroundColor: colores.blanco, paddingVertical: 36 },
  tomarTexto: { fontSize: 17, fontWeight: '800', color: colores.primario },
  linea: { fontSize: 13.5, color: colores.textoSecundario },
  etiqueta: { fontSize: 16.5, fontWeight: '700', color: colores.titulo, marginTop: 16, marginBottom: 6 },
  campo: { borderWidth: 1, borderColor: colores.borde, borderRadius: radios.campo, padding: 12, fontSize: 16, color: colores.texto, backgroundColor: colores.blanco },
  fila: { flexDirection: 'row', gap: 10, marginTop: 16 },
  boton: { flex: 1, minHeight: 52, borderRadius: radios.boton, alignItems: 'center', justifyContent: 'center' },
  botonBorde: { borderWidth: 1.5, borderColor: colores.primario, backgroundColor: colores.blanco },
  botonBordeTexto: { color: colores.primario, fontSize: 16, fontWeight: '700' },
  botonPrimario: { backgroundColor: colores.primario, flex: 1.5 },
  botonPrimarioTexto: { color: colores.blanco, fontSize: 16.5, fontWeight: '700' },
});
