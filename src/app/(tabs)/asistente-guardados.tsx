import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { eliminarOffline, guardadoPersistente, sincronizarGuardados, type GuardadoLocal } from '@/api/guardadosAsistente';
import { Aviso } from '@/componentes/Aviso';
import { CuerpoFuenteAsistente } from '@/componentes/CuerpoFuenteAsistente';
import { EncabezadoApp } from '@/componentes/EncabezadoApp';
import { TarjetaRespuestaAsistente } from '@/componentes/TarjetaRespuestaAsistente';
import { useDiseno } from '@/hooks/useDiseno';
import { useGuardadosAsistente } from '@/hooks/useGuardadosAsistente';
import { useSesion } from '@/sesion/SesionContext';
import { colores, radios } from '@/tema/colores';
import { fuenteDeGuardado, tamanoTexto } from '@/utilidades/asistente';

/**
 * HU-19 — Guardados del Asistente IA: lo que el técnico guardó con "Guardar offline", "Fragmento" o "Descargar sección". Vive en el teléfono (se
 * lee SIN conexión) y se sincroniza con el servidor al abrir esta pantalla y cada 30 s desde el monitor de campo.
 */
export default function PantallaGuardadosAsistente() {
  const { sesion } = useSesion();
  const usuario = sesion?.usuario;
  const idUsuario = usuario?.idUsuario ?? 0;
  const d = useDiseno();
  const [busqueda, setBusqueda] = useState('');
  const [abierto, setAbierto] = useState<GuardadoLocal | null>(null);
  const [aviso, setAviso] = useState<{ tipo: 'error' | 'info'; texto: string } | null>(null);
  const lista = useGuardadosAsistente(idUsuario, busqueda);

  // Al abrir: se envía lo pendiente y se trae lo guardado desde otro equipo (sin señal no pasa nada: se ve lo del teléfono)
  useFocusEffect(
    useCallback(() => {
      if (!sesion) return;
      let vigente = true;
      void sincronizarGuardados(sesion.token, idUsuario)
        .then((r) => {
          if (!vigente) return;
          if (r.avisos.length > 0) setAviso({ tipo: 'error', texto: r.avisos.join('\n') });
          else if (r.sinConexion) setAviso({ tipo: 'info', texto: 'Sin conexión: se muestran tus guardados del teléfono.' });
          else setAviso(null);
        })
        .catch(() => undefined);
      return () => {
        vigente = false;
      };
    }, [sesion, idUsuario]),
  );

  function confirmarEliminar(g: GuardadoLocal) {
    Alert.alert('Eliminar guardado', `¿Quitar "${g.titulo}" de tus guardados?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: () => {
          if (!sesion) return;
          if (abierto?.clave === g.clave) setAbierto(null);
          void eliminarOffline(sesion.token, idUsuario, g.clave).then((r) => {
            if (!r.enServidor) setAviso({ tipo: 'info', texto: 'Eliminado del teléfono. Se avisará al servidor cuando haya señal.' });
          });
        },
      },
    ]);
  }

  const fuenteAbierta = abierto ? fuenteDeGuardado(abierto, abierto.fuente?.n ?? 1) : null;

  return (
    <SafeAreaView style={estilos.area} edges={['top']}>
      <EncabezadoApp nombre={usuario?.nombre ?? ''} apellido={usuario?.apellido} subtitulo={`${usuario?.nombre ?? ''} · ${usuario?.cargo ?? 'Técnico de Campo'}`} />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[estilos.contenido, { paddingHorizontal: d.margen, maxWidth: d.anchoMaximo }]}>
        <View style={estilos.tituloFila}>
          <Pressable onPress={() => (abierto ? setAbierto(null) : router.back())} hitSlop={12} accessibilityRole="button" accessibilityLabel="Volver" testID="volver">
            <Ionicons name="arrow-back" size={26} color={colores.titulo} />
          </Pressable>
          <Text style={[estilos.titulo, { fontSize: d.tituloPantalla }]} accessibilityRole="header">
            {abierto ? 'Guardado' : 'Guardados'}
          </Text>
        </View>
        <Text style={estilos.subtitulo}>Asistente IA</Text>

        {!guardadoPersistente() && (
          <View style={{ marginTop: 12 }}>
            <Aviso mensaje="Esta versión de la app guarda solo en memoria: se pierde al cerrarla. Con la próxima versión instalada quedan en el teléfono." />
          </View>
        )}
        {aviso && (
          <View style={{ marginTop: 12 }} testID="aviso-guardados">
            <Aviso tipo={aviso.tipo} mensaje={aviso.texto} />
          </View>
        )}

        {abierto ? (
          <View style={{ marginTop: 14 }} testID="guardado-abierto">
            {abierto.tipo === 'respuesta' && abierto.respuesta ? (
              <>
                <View style={estilos.burbuja}>
                  <Text style={estilos.burbujaTexto}>{abierto.respuesta.pregunta}</Text>
                </View>
                <View style={{ marginTop: 10 }}>
                  <TarjetaRespuestaAsistente
                    respuesta={abierto.respuesta}
                    onVerFuente={(n) => router.push({ pathname: '/asistente-fuente', params: { clave: abierto.clave, n: String(n) } })}
                  />
                </View>
              </>
            ) : fuenteAbierta ? (
              <CuerpoFuenteAsistente fuente={fuenteAbierta} />
            ) : (
              <Aviso tipo="error" mensaje="Este guardado no tiene contenido para mostrar." />
            )}
            <Pressable onPress={() => confirmarEliminar(abierto)} style={estilos.eliminar} accessibilityRole="button" testID="eliminar-abierto">
              <Ionicons name="trash-outline" size={18} color={colores.rojo} />
              <Text style={estilos.eliminarTexto}>Eliminar de mis guardados</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <View style={estilos.buscador}>
              <Ionicons name="search-outline" size={22} color={colores.textoTenue} />
              <TextInput
                value={busqueda}
                onChangeText={setBusqueda}
                placeholder="Buscar en guardados"
                placeholderTextColor={colores.placeholder}
                style={estilos.buscadorCampo}
                autoCorrect={false}
                accessibilityLabel="Buscar en guardados"
                testID="buscar-guardados"
              />
              {busqueda.length > 0 && (
                <Pressable onPress={() => setBusqueda('')} hitSlop={10} accessibilityRole="button" accessibilityLabel="Borrar búsqueda">
                  <Ionicons name="close-circle" size={20} color={colores.textoTenue} />
                </Pressable>
              )}
            </View>

            {lista.length === 0 ? (
              <View style={{ marginTop: 14 }}>
                <Aviso mensaje={busqueda.trim() ? 'No hay guardados que coincidan con tu búsqueda.' : 'Aún no tienes guardados. Guarda una respuesta o un fragmento desde el asistente.'} />
              </View>
            ) : (
              <View style={estilos.lista} testID="lista-guardados">
                {lista.map((g, i) => (
                  <View key={g.clave} style={[estilos.fila, i > 0 && estilos.filaBorde]}>
                    <Pressable onPress={() => setAbierto(g)} style={{ flex: 1 }} accessibilityRole="button" accessibilityLabel={`${g.titulo}. ${g.subtitulo}`} testID={`guardado-${i}`}>
                      <Text style={estilos.filaTitulo}>{g.titulo}</Text>
                      <Text style={estilos.filaSubtitulo}>
                        {g.subtitulo}
                        {g.tipo === 'fragmento' && g.tamanoBytes > 0 ? ` · ${tamanoTexto(g.tamanoBytes)}` : ''}
                      </Text>
                      {g.pendiente && <Text style={estilos.pendiente}>Sin copiar al servidor todavía</Text>}
                    </Pressable>
                    <View style={estilos.pill}>
                      <Text style={estilos.pillTexto}>OFFLINE</Text>
                    </View>
                    <Pressable onPress={() => confirmarEliminar(g)} hitSlop={10} accessibilityRole="button" accessibilityLabel={`Eliminar ${g.titulo}`} testID={`eliminar-${i}`}>
                      <Ionicons name="trash-outline" size={20} color={colores.textoTenue} />
                    </Pressable>
                  </View>
                ))}
              </View>
            )}

            <View style={estilos.nota}>
              <Ionicons name="phone-portrait-outline" size={16} color={colores.textoSecundario} />
              <Text style={estilos.notaTexto}>Guardado en el teléfono · disponible sin conexión.</Text>
            </View>
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
  buscador: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colores.blanco, borderWidth: 1, borderColor: colores.borde, borderRadius: radios.campo + 4, paddingHorizontal: 16, minHeight: 54, marginTop: 14 },
  buscadorCampo: { flex: 1, fontSize: 17, color: colores.texto, paddingVertical: 10 },
  lista: { backgroundColor: colores.blanco, borderWidth: 1, borderColor: colores.bordeSuave, borderRadius: radios.tarjeta, paddingHorizontal: 14, marginTop: 14 },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 14 },
  filaBorde: { borderTopWidth: 1, borderTopColor: colores.bordeSuave },
  filaTitulo: { fontSize: 17.5, fontWeight: '500', color: colores.titulo },
  filaSubtitulo: { fontSize: 14, color: colores.textoSecundario, marginTop: 3, lineHeight: 20 },
  pendiente: { fontSize: 12.5, color: colores.naranja, fontWeight: '700', marginTop: 3 },
  pill: { backgroundColor: colores.verdeEtiquetaFondo, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  pillTexto: { fontSize: 12, fontWeight: '800', letterSpacing: 0.4, color: colores.verdeEtiquetaTexto },
  nota: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14 },
  notaTexto: { fontSize: 14.5, color: colores.textoSecundario, flexShrink: 1 },
  burbuja: { alignSelf: 'flex-end', maxWidth: '86%', backgroundColor: colores.primario, borderRadius: 16, borderBottomRightRadius: 4, paddingHorizontal: 16, paddingVertical: 14 },
  burbujaTexto: { fontSize: 17, color: colores.blanco, lineHeight: 24 },
  eliminar: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginTop: 18 },
  eliminarTexto: { fontSize: 15.5, fontWeight: '700', color: colores.rojo },
});
