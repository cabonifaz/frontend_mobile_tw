import { useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { registrarIncidencia, TIPOS_INCIDENCIA, type ImpactoIncidencia, type Severidad } from '@/api/alertasCampo';
import { Aviso } from '@/componentes/Aviso';
import { Boton } from '@/componentes/Boton';
import { CamaraApp } from '@/componentes/CamaraApp';
import { CampoTexto } from '@/componentes/CampoTexto';
import { EncabezadoApp } from '@/componentes/EncabezadoApp';
import { Selector } from '@/componentes/Selector';
import { useDiseno } from '@/hooks/useDiseno';
import { useSesion } from '@/sesion/SesionContext';
import { colores, radios } from '@/tema/colores';
import { avisar } from '@/utilidades/dialogos';
import { faltaIncidencia } from '@/utilidades/alertasCampo';

/**
 * HU-32 — Registrar incidencia (Jefe de Área): tipo, severidad, impacto, descripción y foto (solo cámara, opcional).
 * «Registrar incidencia» la deja abierta (la ve el Seguimiento Operativo); «Escalar» la registra y avisa a Operaciones; «Reasignar técnico» abre la lista de
 * técnicos cercanos. Una incidencia que detiene el servicio deja la OS «con incidente» en el Seguimiento.
 */
const SEVERIDADES: { valor: Severidad; texto: string }[] = [
  { valor: 'baja', texto: 'Baja' },
  { valor: 'media', texto: 'Media' },
  { valor: 'alta', texto: 'Alta' },
];
const IMPACTOS: { valor: ImpactoIncidencia; texto: string }[] = [
  { valor: 'detiene', texto: 'Detiene servicio' },
  { valor: 'retrasa', texto: 'Retrasa servicio' },
];

export default function PantallaAlertaIncidencia() {
  const { sesion } = useSesion();
  const usuario = sesion?.usuario;
  const d = useDiseno();
  const params = useLocalSearchParams<{ id?: string; n?: string }>();
  const idOs = Number(params.id);
  const [idTipo, setIdTipo] = useState<string | null>(null);
  const [severidad, setSeveridad] = useState<Severidad | null>(null);
  const [impacto, setImpacto] = useState<ImpactoIncidencia | null>(null);
  const [descripcion, setDescripcion] = useState('');
  const [foto, setFoto] = useState<string | null>(null);
  const [camara, setCamara] = useState(false);
  const [enviando, setEnviando] = useState<'registrar' | 'escalar' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const falta = faltaIncidencia({ idTipo: idTipo ? Number(idTipo) : null, severidad, impacto, descripcion });
  const valido = Number.isInteger(idOs) && idOs > 0;

  async function enviar(escalar: boolean) {
    if (!sesion || !idTipo || !severidad || !impacto || falta || !valido) return;
    setError(null);
    setEnviando(escalar ? 'escalar' : 'registrar');
    try {
      const m = await registrarIncidencia(sesion.token, idOs, { idTipo: Number(idTipo), severidad, impacto, descripcion, escalar, fotoUri: foto });
      avisar(escalar ? 'Incidencia escalada' : 'Incidencia registrada', m);
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo registrar la incidencia.');
    } finally {
      setEnviando(null);
    }
  }

  return (
    <SafeAreaView style={estilos.area} edges={['top']}>
      <EncabezadoApp nombre={usuario?.nombre ?? ''} apellido={usuario?.apellido} subtitulo={`${usuario?.nombre ?? ''} · ${usuario?.cargo ?? 'Jefe de Área'}`} />
      <ScrollView contentContainerStyle={[estilos.contenido, { paddingHorizontal: d.margen, maxWidth: d.anchoMaximo }]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={estilos.tituloFila}>
          <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Volver">
            <Ionicons name="arrow-back" size={24} color={colores.titulo} />
          </Pressable>
          <Text style={estilos.titulo} accessibilityRole="header">
            Registrar incidencia
          </Text>
        </View>

        {!valido && <Aviso tipo="error" mensaje="Servicio no válido." />}

        <Selector
          etiqueta="Tipo *"
          placeholder="Selecciona el tipo"
          opciones={TIPOS_INCIDENCIA.map((t) => ({ valor: String(t.id), texto: t.texto }))}
          valor={idTipo}
          onCambio={setIdTipo}
          testID="incidencia-tipo"
        />

        <Text style={estilos.etiqueta}>Severidad *</Text>
        <View style={estilos.fila}>
          {SEVERIDADES.map((s) => {
            const activo = severidad === s.valor;
            return (
              <Pressable
                key={s.valor}
                onPress={() => setSeveridad(s.valor)}
                accessibilityRole="radio"
                accessibilityState={{ checked: activo }}
                style={[estilos.chip, activo && (s.valor === 'alta' ? estilos.chipAlta : estilos.chipActivo)]}
                testID={`severidad-${s.valor}`}
              >
                <Text style={[estilos.chipTexto, activo && { color: colores.blanco }]}>{s.texto}</Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={estilos.etiqueta}>Impacto *</Text>
        <View style={estilos.fila}>
          {IMPACTOS.map((i) => {
            const activo = impacto === i.valor;
            return (
              <Pressable
                key={i.valor}
                onPress={() => setImpacto(i.valor)}
                accessibilityRole="radio"
                accessibilityState={{ checked: activo }}
                style={[estilos.chip, activo && estilos.chipActivo]}
                testID={`impacto-${i.valor}`}
              >
                <Text style={[estilos.chipTexto, activo && { color: colores.blanco }]}>{i.texto}</Text>
              </Pressable>
            );
          })}
        </View>

        <CampoTexto
          etiqueta="Descripción *"
          value={descripcion}
          onChangeText={(t) => setDescripcion(t.slice(0, 1000))}
          placeholder="Ej.: Llanta reventada en Av. Néstor Gambetta; no llega a la hora programada."
          multiline
          testID="incidencia-descripcion"
        />

        <Text style={estilos.etiqueta}>Evidencia (solo cámara)</Text>
        <View style={estilos.fila}>
          {foto && (
            <View style={estilos.foto}>
              <Image source={{ uri: foto }} style={StyleSheet.absoluteFill} resizeMode="cover" accessibilityLabel="Foto de la incidencia" />
              <Pressable onPress={() => setFoto(null)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Quitar foto" style={estilos.quitar}>
                <Ionicons name="close" size={14} color={colores.blanco} />
              </Pressable>
            </View>
          )}
          {!foto && (
            <Pressable onPress={() => setCamara(true)} accessibilityRole="button" style={estilos.tomar} testID="incidencia-foto">
              <Ionicons name="camera-outline" size={26} color={colores.primario} />
            </Pressable>
          )}
        </View>

        {!!error && <Aviso tipo="error" mensaje={error} />}
        <Boton titulo="Registrar incidencia" variante="alerta" onPress={() => void enviar(false)} cargando={enviando === 'registrar'} deshabilitado={!!falta || !!enviando || !valido} />
        <View style={estilos.fila}>
          <View style={{ flex: 1 }}>
            <Boton titulo="Escalar" variante="secundario" onPress={() => void enviar(true)} cargando={enviando === 'escalar'} deshabilitado={!!falta || !!enviando || !valido} />
          </View>
          <View style={{ flex: 1 }}>
            <Boton
              titulo="Reasignar técnico"
              onPress={() => router.push({ pathname: '/alertas-reasignar', params: { id: String(idOs) } } as unknown as Href)}
              deshabilitado={!!enviando || !valido}
            />
          </View>
        </View>
        {!!falta && <Text style={estilos.nota}>{falta}</Text>}
        <Text style={estilos.nota}>Escalar avisa a Operaciones. Una incidencia que detiene el servicio lo deja «con incidente» en el Seguimiento.</Text>
      </ScrollView>
      <CamaraApp
        visible={camara}
        modo="foto"
        onCerrar={() => setCamara(false)}
        onFoto={(uri) => {
          setCamara(false);
          setFoto(uri);
        }}
      />
    </SafeAreaView>
  );
}

const estilos = StyleSheet.create({
  area: { flex: 1, backgroundColor: colores.fondo },
  contenido: { padding: 16, paddingBottom: 28, maxWidth: 560, width: '100%', alignSelf: 'center', gap: 12 },
  tituloFila: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  titulo: { fontSize: 24, fontWeight: '700', color: colores.titulo, flexShrink: 1 },
  etiqueta: { fontSize: 14, fontWeight: '700', color: colores.titulo, marginBottom: -4 },
  fila: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  chip: { flex: 1, minWidth: 90, alignItems: 'center', justifyContent: 'center', minHeight: 46, paddingHorizontal: 10, borderRadius: radios.campo, borderWidth: 1, borderColor: colores.borde, backgroundColor: colores.tarjeta },
  chipActivo: { backgroundColor: colores.primario, borderColor: colores.primario },
  chipAlta: { backgroundColor: colores.rojo, borderColor: colores.rojo },
  chipTexto: { fontSize: 14, fontWeight: '700', color: colores.titulo },
  foto: { width: 84, height: 84, borderRadius: 10, overflow: 'hidden', backgroundColor: colores.grisFondo },
  quitar: { position: 'absolute', top: 4, right: 4, width: 20, height: 20, borderRadius: 10, backgroundColor: 'rgba(15,23,42,0.75)', alignItems: 'center', justifyContent: 'center' },
  tomar: { width: 84, height: 84, borderRadius: 10, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colores.primario, alignItems: 'center', justifyContent: 'center' },
  nota: { fontSize: 12.5, color: colores.textoSecundario, lineHeight: 18, textAlign: 'center' },
});
