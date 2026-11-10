import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { obtenerFuente, type FuenteConsultada } from '@/api/asistente';
import { ErrorApi } from '@/api/cliente';
import { claveGuardado, guardarOffline, leerLocal } from '@/api/guardadosAsistente';
import { Aviso } from '@/componentes/Aviso';
import { CuerpoFuenteAsistente } from '@/componentes/CuerpoFuenteAsistente';
import { EncabezadoApp } from '@/componentes/EncabezadoApp';
import { useConsulta } from '@/hooks/useConsulta';
import { useDiseno } from '@/hooks/useDiseno';
import { useGuardadosAsistente } from '@/hooks/useGuardadosAsistente';
import { useSesion } from '@/sesion/SesionContext';
import { colores, radios } from '@/tema/colores';
import { fuenteDeGuardado } from '@/utilidades/asistente';

/**
 * HU-19 — "Fuente consultada": el fragmento del documento oficial que usó el asistente, con su sección y página.
 * "Guardar offline" y "Descargar sección" dejan ese fragmento en el teléfono como TEXTO CITADO de la sección (no se recorta un PDF): se lee sin
 * conexión desde Guardados. Se abre desde la respuesta (consulta el servidor) o desde un guardado (lee la copia del teléfono, sin conexión).
 */
export default function PantallaFuenteAsistente() {
  const { sesion } = useSesion();
  const usuario = sesion?.usuario;
  const idUsuario = usuario?.idUsuario ?? 0;
  const d = useDiseno();
  const params = useLocalSearchParams<{ idConsulta?: string; n?: string; clave?: string }>();
  const idConsulta = Number(params.idConsulta);
  const n = Number(params.n) > 0 ? Number(params.n) : 1;
  const deGuardado = !!params.clave;
  const [mensaje, setMensaje] = useState<{ tipo: 'error' | 'info'; texto: string } | null>(null);
  const guardados = useGuardadosAsistente(idUsuario);

  const { datos, cargando, error } = useConsulta(async (token): Promise<FuenteConsultada> => {
    if (params.clave) {
      const g = await leerLocal(idUsuario, params.clave);
      const f = g ? fuenteDeGuardado(g, n) : null;
      if (!f) throw new ErrorApi('No se encontró este guardado en el teléfono.', 404, 1);
      return f;
    }
    if (!Number.isInteger(idConsulta) || idConsulta <= 0) throw new ErrorApi('Consulta no válida.', 400, 1);
    try {
      return await obtenerFuente(token, idConsulta, n);
    } catch (e) {
      // Sin señal: si el fragmento ya está guardado en el teléfono se lee de ahí
      if (e instanceof ErrorApi && e.estadoHttp === 0) {
        const g = await leerLocal(idUsuario, claveGuardado('fragmento', idConsulta, n));
        if (g?.fuente) return g.fuente;
      }
      throw e;
    }
  }, `${params.idConsulta ?? ''}|${params.n ?? ''}|${params.clave ?? ''}`);

  const guardado = !!datos && guardados.some((g) => g.clave === claveGuardado('fragmento', datos.idConsulta, datos.n));

  async function guardarFragmento() {
    if (!datos || !sesion) return;
    setMensaje(null);
    try {
      const r = await guardarOffline(sesion.token, idUsuario, { tipo: 'fragmento', respuesta: null, fuente: datos });
      setMensaje({
        tipo: r.aviso ? 'error' : 'info',
        texto: r.aviso
          ? `Guardado en el teléfono. No se pudo copiar al servidor: ${r.aviso}`
          : r.enServidor
            ? 'Fragmento guardado en el teléfono: disponible sin conexión.'
            : 'Fragmento guardado en el teléfono. Se copiará al servidor cuando haya señal.',
      });
    } catch {
      setMensaje({ tipo: 'error', texto: 'No se pudo guardar en el teléfono. Inténtalo de nuevo.' });
    }
  }

  return (
    <SafeAreaView style={estilos.area} edges={['top']}>
      <EncabezadoApp nombre={usuario?.nombre ?? ''} apellido={usuario?.apellido} subtitulo={`${usuario?.nombre ?? ''} · ${usuario?.cargo ?? 'Técnico de Campo'}`} />
      <ScrollView contentContainerStyle={[estilos.contenido, { paddingHorizontal: d.margen, maxWidth: d.anchoMaximo }]}>
        <View style={estilos.tituloFila}>
          <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Volver" testID="volver">
            <Ionicons name="arrow-back" size={26} color={colores.titulo} />
          </Pressable>
          <Text style={[estilos.titulo, { fontSize: d.tituloPantalla }]} accessibilityRole="header">
            Fuente consultada
          </Text>
        </View>
        <Text style={estilos.subtitulo}>Asistente IA</Text>

        {cargando ? (
          <ActivityIndicator color={colores.primario} style={{ marginTop: 40 }} />
        ) : error || !datos ? (
          <View style={{ marginTop: 14 }}>
            <Aviso tipo="error" mensaje={error ?? 'No se encontró la fuente.'} />
          </View>
        ) : (
          <>
            <View style={{ marginTop: 12 }}>
              <CuerpoFuenteAsistente fuente={datos} />
            </View>

            {mensaje && (
              <View style={{ marginTop: 12 }} testID="mensaje-fuente">
                <Aviso tipo={mensaje.tipo} mensaje={mensaje.texto} />
              </View>
            )}

            {deGuardado ? (
              <View style={estilos.nota}>
                <Ionicons name="phone-portrait-outline" size={16} color={colores.textoSecundario} />
                <Text style={estilos.notaTexto}>Guardado en el teléfono · disponible sin conexión.</Text>
              </View>
            ) : (
              <>
                <View style={estilos.botones}>
                  <Pressable onPress={() => void guardarFragmento()} disabled={guardado} style={[estilos.boton, estilos.botonBorde, guardado && { opacity: 0.6 }]} accessibilityRole="button" accessibilityState={{ disabled: guardado }} testID="guardar-offline">
                    <Ionicons name={guardado ? 'bookmark' : 'bookmark-outline'} size={20} color={colores.primario} />
                    <Text style={[estilos.botonTexto, { color: colores.primario }]}>{guardado ? 'Guardado' : 'Guardar offline'}</Text>
                  </Pressable>
                  <Pressable onPress={() => void guardarFragmento()} disabled={guardado} style={[estilos.boton, { backgroundColor: colores.primario }, guardado && { opacity: 0.6 }]} accessibilityRole="button" accessibilityState={{ disabled: guardado }} testID="descargar-seccion">
                    <Ionicons name={guardado ? 'checkmark' : 'download-outline'} size={20} color={colores.blanco} />
                    <Text style={estilos.botonTexto}>{guardado ? 'Descargada' : 'Descargar sección'}</Text>
                  </Pressable>
                </View>
                <View style={estilos.nota}>
                  <Ionicons name="information-circle-outline" size={16} color={colores.textoSecundario} />
                  <Text style={estilos.notaTexto}>Se guarda como texto citado de la sección, no como un PDF recortado.</Text>
                </View>
              </>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const estilos = StyleSheet.create({
  area: { flex: 1, backgroundColor: colores.fondo },
  contenido: { paddingTop: 18, paddingBottom: 28, width: '100%', alignSelf: 'center' },
  tituloFila: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  titulo: { fontWeight: '800', color: colores.titulo, flexShrink: 1 },
  subtitulo: { color: colores.textoSecundario, fontSize: 15, marginTop: 4 },
  botones: { flexDirection: 'row', gap: 10, marginTop: 16 },
  boton: { flex: 1, minHeight: 54, borderRadius: radios.boton, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 8 },
  botonBorde: { borderWidth: 1.5, borderColor: colores.primario, backgroundColor: colores.blanco },
  botonTexto: { color: colores.blanco, fontWeight: '800', fontSize: 16.5 },
  nota: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 },
  notaTexto: { fontSize: 14, color: colores.textoSecundario, flexShrink: 1 },
});
