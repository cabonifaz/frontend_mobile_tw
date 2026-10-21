import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { nombreDeCodigo, obtenerCatalogo } from '@/api/catalogos';
import { obtenerMisDatos } from '@/api/usuario';
import { Aviso } from '@/componentes/Aviso';
import { Boton } from '@/componentes/Boton';
import { Pantalla } from '@/componentes/Pantalla';
import { useConsulta } from '@/hooks/useConsulta';
import { useSesion } from '@/sesion/SesionContext';
import { colores, radios } from '@/tema/colores';
import { confirmar } from '@/utilidades/dialogos';

/**
 * Inicio. Muestra los datos del técnico tal como están en la BD (total_weight_stg):
 *   - usuario ........ GET api/autenticacion/me
 *   - área y cargo ... catálogos AREA_USUARIO y CARGO_USUARIO de tabla_maestra
 * Deslizar hacia abajo vuelve a leerlos. La agenda llega en las siguientes HU.
 */
export default function PantallaInicio() {
  const { sesion, cerrarSesion } = useSesion();

  const { datos, cargando, recargando, error, recargar } = useConsulta(async (token) => {
    const [usuario, areas, cargos] = await Promise.all([
      obtenerMisDatos(token),
      obtenerCatalogo(token, 'AREA_USUARIO'),
      obtenerCatalogo(token, 'CARGO_USUARIO'),
    ]);
    return { usuario, areas, cargos };
  });

  const u = datos?.usuario;
  const nombre = u?.nombre ?? sesion?.usuario.nombre ?? '';
  const codigoCargo = sesion?.usuario.cargo ?? null;
  const cargo = nombreDeCodigo(datos?.cargos, codigoCargo) ?? codigoCargo ?? 'Técnico de Campo';
  const area = nombreDeCodigo(datos?.areas, u?.area) ?? u?.area ?? '—';

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
    <Pantalla onRecargar={recargar} recargando={recargando}>
      <View style={estilos.cabecera}>
        <View style={{ flex: 1 }}>
          <Text style={estilos.saludo}>Hola, {nombre}</Text>
          <Text style={estilos.detalle}>
            {cargo} · @{sesion?.usuario.usuario}
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

      <View style={estilos.datos}>
        <Text style={estilos.tituloSeccion}>Mis datos</Text>
        {cargando ? (
          <ActivityIndicator color={colores.primario} style={{ marginVertical: 16 }} />
        ) : error ? (
          <Aviso tipo="error" mensaje={error} />
        ) : (
          <>
            <Fila etiqueta="Nombre" valor={`${u?.nombre ?? ''} ${u?.apellido ?? ''}`.trim()} />
            <Fila etiqueta="Cargo" valor={cargo} />
            <Fila etiqueta="Área" valor={area} />
            <Fila etiqueta="Rol" valor={u?.rolSistemaLabel ?? '—'} />
            <Fila etiqueta="Correo" valor={u?.correo ?? '—'} ultima />
          </>
        )}
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

function Fila({ etiqueta, valor, ultima = false }: { etiqueta: string; valor: string; ultima?: boolean }) {
  return (
    <View style={[estilos.fila, ultima && { borderBottomWidth: 0 }]}>
      <Text style={estilos.filaEtiqueta}>{etiqueta}</Text>
      <Text style={estilos.filaValor} numberOfLines={1}>
        {valor || '—'}
      </Text>
    </View>
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
  datos: {
    backgroundColor: colores.tarjeta,
    borderRadius: radios.tarjeta,
    borderWidth: 1,
    borderColor: '#E3E9F1',
    paddingHorizontal: 18,
    paddingVertical: 14,
    marginBottom: 16,
  },
  tituloSeccion: { fontSize: 16, fontWeight: '700', color: colores.titulo, marginBottom: 6 },
  fila: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#EEF2F7',
    gap: 12,
  },
  filaEtiqueta: { fontSize: 14, color: colores.textoSecundario },
  filaValor: { fontSize: 14, color: colores.texto, fontWeight: '500', flexShrink: 1, textAlign: 'right' },
  info: { backgroundColor: colores.primarioSuave, borderRadius: 10, padding: 12, marginBottom: 24 },
  infoTexto: { fontSize: 13, color: colores.texto, textAlign: 'center' },
});
