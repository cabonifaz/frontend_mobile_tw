import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Boton } from '@/componentes/Boton';
import { Pantalla } from '@/componentes/Pantalla';
import { colores, radios } from '@/tema/colores';

/**
 * Recuperar contraseña (HU-01).
 * En la app no se ingresa con correo: el usuario y la contraseña los crea el jefe.
 * Para recuperarla, el jefe genera una contraseña temporal desde la intranet
 * (Maestros › Usuarios › ficha del usuario › "Reenviar credenciales"); al ingresar
 * con ella, la app obliga a crear una nueva.
 */
const pasos = [
  'Comunícate con tu jefe directo y pídele que restablezca tu contraseña.',
  'Tu jefe generará una contraseña temporal desde la Intranet de Total Weight.',
  'Ingresa a la app con tu usuario y esa contraseña temporal.',
  'La app te pedirá crear una contraseña nueva antes de continuar.',
];

export default function PantallaRecuperarContrasena() {
  return (
    <Pantalla>
      <View style={estilos.icono}>
        <Ionicons name="key-outline" size={30} color={colores.primario} />
      </View>
      <Text style={estilos.titulo} accessibilityRole="header">
        Recuperar contraseña
      </Text>
      <Text style={estilos.subtitulo}>
        Tu usuario de la app lo asigna tu jefe, por eso la contraseña también se restablece con él.
      </Text>

      <View style={estilos.tarjeta}>
        {pasos.map((paso, i) => (
          <View key={paso} style={[estilos.paso, i === pasos.length - 1 && { marginBottom: 0 }]}>
            <View style={estilos.numero}>
              <Text style={estilos.numeroTexto}>{i + 1}</Text>
            </View>
            <Text style={estilos.pasoTexto}>{paso}</Text>
          </View>
        ))}
      </View>

      <Boton titulo="Volver al inicio de sesión" variante="secundario" onPress={() => router.back()} />
    </Pantalla>
  );
}

const estilos = StyleSheet.create({
  icono: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colores.primarioSuave,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginTop: 24,
    marginBottom: 16,
  },
  titulo: { fontSize: 24, fontWeight: '700', color: colores.titulo, textAlign: 'center' },
  subtitulo: { fontSize: 15, lineHeight: 22, color: colores.textoSecundario, textAlign: 'center', marginTop: 8, marginBottom: 24 },
  tarjeta: {
    backgroundColor: colores.tarjeta,
    borderRadius: radios.tarjeta,
    borderWidth: 1,
    borderColor: '#E3E9F1',
    padding: 20,
    marginBottom: 24,
  },
  paso: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 16 },
  numero: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colores.primario,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  numeroTexto: { color: colores.blanco, fontWeight: '700', fontSize: 13 },
  pasoTexto: { flex: 1, fontSize: 15, lineHeight: 22, color: colores.texto },
});
