import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Boton } from '@/componentes/Boton';
import { Pantalla } from '@/componentes/Pantalla';
import { useSesion } from '@/sesion/SesionContext';
import { confirmar } from '@/utilidades/dialogos';
import { colores, radios } from '@/tema/colores';

/**
 * Inicio después del login. La agenda de servicios llegará en las siguientes HU
 * (depende de las órdenes de servicio, aún sin backend). Por ahora confirma la
 * sesión y permite cerrarla, liberando el equipo.
 */
export default function PantallaInicio() {
  const { sesion, cerrarSesion } = useSesion();
  const u = sesion?.usuario;

  const vence = sesion?.expiraEn.toLocaleString('es-PE', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  async function confirmarCierre() {
    if (await confirmar('Cerrar sesión', 'Se cerrará tu sesión en este equipo. ¿Continuar?', 'Cerrar sesión')) {
      await cerrarSesion();
    }
  }

  return (
    <Pantalla>
      <View style={estilos.cabecera}>
        <View>
          <Text style={estilos.saludo}>Hola, {u?.nombre}</Text>
          <Text style={estilos.detalle}>
            {u?.cargo ?? 'Técnico de Campo'} · @{u?.usuario}
          </Text>
        </View>
        <Pressable onPress={confirmarCierre} hitSlop={10} accessibilityRole="button" accessibilityLabel="Cerrar sesión">
          <Ionicons name="log-out-outline" size={26} color={colores.textoSecundario} />
        </Pressable>
      </View>

      <View style={estilos.tarjeta}>
        <Ionicons name="calendar-outline" size={34} color={colores.primario} />
        <Text style={estilos.tituloTarjeta}>Mi agenda de servicios</Text>
        <Text style={estilos.textoTarjeta}>
          Aquí verás los servicios que te asignen. Esta sección se habilita en las próximas historias.
        </Text>
      </View>

      <View style={estilos.info}>
        <Text style={estilos.infoTexto}>
          {vence ? `Sesión activa en este equipo hasta el ${vence} h` : 'Sesión activa en este equipo'}
        </Text>
      </View>

      <View style={{ gap: 12 }}>
        <Boton titulo="Cambiar contraseña" variante="secundario" onPress={() => router.push('/cambiar-contrasena')} />
        <Boton titulo="Cerrar sesión" variante="secundario" onPress={confirmarCierre} />
      </View>
    </Pantalla>
  );
}

const estilos = StyleSheet.create({
  cabecera: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  saludo: { fontSize: 24, fontWeight: '700', color: colores.titulo },
  detalle: { fontSize: 14, color: colores.textoSecundario, marginTop: 4 },
  tarjeta: {
    backgroundColor: colores.tarjeta,
    borderRadius: radios.tarjeta,
    borderWidth: 1,
    borderColor: '#E3E9F1',
    padding: 24,
    alignItems: 'center',
    marginBottom: 16,
  },
  tituloTarjeta: { fontSize: 18, fontWeight: '700', color: colores.titulo, marginTop: 12 },
  textoTarjeta: { fontSize: 14, lineHeight: 20, color: colores.textoSecundario, textAlign: 'center', marginTop: 6 },
  info: { backgroundColor: colores.primarioSuave, borderRadius: 10, padding: 12, marginBottom: 24 },
  infoTexto: { fontSize: 13, color: colores.texto, textAlign: 'center' },
});
