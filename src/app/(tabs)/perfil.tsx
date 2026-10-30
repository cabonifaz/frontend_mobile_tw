import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { nombreDeCodigo, obtenerCatalogo } from '@/api/catalogos';
import { EncabezadoApp } from '@/componentes/EncabezadoApp';
import { useConsulta } from '@/hooks/useConsulta';
import { useDiseno } from '@/hooks/useDiseno';
import { useSesion } from '@/sesion/SesionContext';
import { colores, radios } from '@/tema/colores';

/**
 * Pestaña Perfil (HU-02). Solo tres opciones:
 *   - Mi cuenta ........ datos del técnico y cambio de contraseña (/mi-cuenta).
 *   - Configuraciones .. módulo de configuraciones (próxima historia).
 *   - Salir de la app .. cierra la sesión en el servidor y en el equipo; la navegación pasa sola al login.
 * Progreso Guardado y Sincronización NO van aquí (Progreso Guardado se abre desde el Menú).
 */
export default function PantallaPerfil() {
  const { sesion, cerrarSesion } = useSesion();
  const usuario = sesion?.usuario;
  const d = useDiseno();
  const [saliendo, setSaliendo] = useState(false);

  // El cargo viene como código (CARGO_USUARIO); se muestra su nombre.
  const { datos: cargos } = useConsulta((token) => obtenerCatalogo(token, 'CARGO_USUARIO'));
  const cargo = nombreDeCodigo(cargos, usuario?.cargo) ?? usuario?.cargo ?? 'Técnico de Campo';
  const nombreCompleto = `${usuario?.nombre ?? ''} ${usuario?.apellido ?? ''}`.trim();
  const iniciales = `${(usuario?.nombre ?? '').charAt(0)}${(usuario?.apellido ?? '').charAt(0)}`.toUpperCase() || 'TW';

  async function salir() {
    if (saliendo) return;
    setSaliendo(true);
    await cerrarSesion();
  }

  return (
    <SafeAreaView style={estilos.area} edges={['top']}>
      <EncabezadoApp nombre={usuario?.nombre ?? ''} apellido={usuario?.apellido} subtitulo={`${usuario?.nombre ?? ''} · ${cargo}`} />
      <View style={[estilos.contenido, { paddingHorizontal: d.margen, maxWidth: d.tablet ? 560 : 480 }]}>
        <Text style={estilos.titulo} accessibilityRole="header">
          Perfil
        </Text>

        <View style={estilos.tarjeta}>
          <View style={estilos.avatar} accessibilityElementsHidden>
            <Text style={estilos.iniciales}>{iniciales}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={estilos.nombre} numberOfLines={2}>
              {nombreCompleto || usuario?.usuario}
            </Text>
            <Text style={estilos.detalle} numberOfLines={2}>
              {cargo} · usuario {usuario?.usuario}
            </Text>
          </View>
        </View>

        <View style={estilos.lista}>
          <Opcion icono="person-circle-outline" titulo="Mi cuenta" onPress={() => router.push('/mi-cuenta')} testID="perfil-mi-cuenta" />
          <View style={estilos.separador} />
          <Opcion
            icono="settings-outline"
            titulo="Configuraciones"
            onPress={() => router.push({ pathname: '/modulo/[id]', params: { id: 'configuracion' } })}
            testID="perfil-configuraciones"
          />
        </View>

        <Pressable
          onPress={salir}
          disabled={saliendo}
          accessibilityRole="button"
          accessibilityState={{ busy: saliendo }}
          testID="perfil-salir"
          style={({ pressed }) => [estilos.salir, pressed && { opacity: 0.75 }]}
        >
          {saliendo ? (
            <ActivityIndicator color={colores.rojo} />
          ) : (
            <>
              <Ionicons name="log-out-outline" size={20} color={colores.rojo} />
              <Text style={estilos.salirTexto}>Salir de la app</Text>
            </>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function Opcion({
  icono,
  titulo,
  onPress,
  testID,
}: {
  icono: 'person-circle-outline' | 'settings-outline';
  titulo: string;
  onPress: () => void;
  testID: string;
}) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" testID={testID} style={({ pressed }) => [estilos.opcion, pressed && { opacity: 0.7 }]}>
      <Ionicons name={icono} size={24} color={colores.primario} />
      <Text style={estilos.opcionTexto}>{titulo}</Text>
      <Ionicons name="chevron-forward" size={20} color={colores.textoTenue} />
    </Pressable>
  );
}

const estilos = StyleSheet.create({
  area: { flex: 1, backgroundColor: colores.fondo },
  contenido: { padding: 20, width: '100%', alignSelf: 'center' },
  titulo: { fontSize: 26, fontWeight: '700', color: colores.titulo, marginBottom: 16 },
  tarjeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: colores.tarjeta,
    borderRadius: radios.tarjeta,
    borderWidth: 1,
    borderColor: colores.bordeSuave,
    padding: 16,
    marginBottom: 14,
  },
  avatar: { width: 58, height: 58, borderRadius: 29, backgroundColor: colores.primario, alignItems: 'center', justifyContent: 'center' },
  iniciales: { color: colores.blanco, fontWeight: '700', fontSize: 20 },
  nombre: { fontSize: 18, fontWeight: '700', color: colores.titulo },
  detalle: { fontSize: 13.5, color: colores.textoSecundario, marginTop: 3 },
  lista: {
    backgroundColor: colores.tarjeta,
    borderRadius: radios.tarjeta,
    borderWidth: 1,
    borderColor: colores.bordeSuave,
    paddingHorizontal: 14,
    marginBottom: 16,
  },
  opcion: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 56 },
  opcionTexto: { flex: 1, fontSize: 15.5, color: colores.texto },
  separador: { height: 1, backgroundColor: '#EEF2F7' },
  salir: {
    minHeight: 50,
    borderRadius: radios.boton,
    borderWidth: 1.5,
    borderColor: colores.rojo,
    backgroundColor: colores.tarjeta,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  salirTexto: { color: colores.rojo, fontSize: 16, fontWeight: '700' },
});
