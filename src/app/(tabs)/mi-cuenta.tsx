import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { nombreDeCodigo, obtenerCatalogo } from '@/api/catalogos';
import { obtenerMisDatos } from '@/api/usuario';
import { Aviso } from '@/componentes/Aviso';
import { Boton } from '@/componentes/Boton';
import { Pantalla } from '@/componentes/Pantalla';
import { useConsulta } from '@/hooks/useConsulta';
import { useSesion } from '@/sesion/SesionContext';
import { colores, radios } from '@/tema/colores';

/**
 * Mi cuenta (HU-02). Se abre desde Perfil › Mi cuenta.
 * Datos del técnico tal como están en la BD (total_weight_stg):
 *   - usuario ........ GET api/autenticacion/me
 *   - área y cargo ... catálogos AREA_USUARIO y CARGO_USUARIO de tabla_maestra
 * "Salir de la app" está en Perfil.
 */
export default function PantallaMiCuenta() {
  const { sesion } = useSesion();

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

  const iniciales = `${(u?.nombre ?? sesion?.usuario.nombre ?? '').charAt(0)}${(u?.apellido ?? sesion?.usuario.apellido ?? '').charAt(0)}`.toUpperCase() || 'TW';

  return (
    <Pantalla onRecargar={recargar} recargando={recargando} conPestanas>
      <View style={estilos.barraTitulo}>
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.navigate('/perfil'))}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Volver"
        >
          <Ionicons name="arrow-back" size={24} color={colores.titulo} />
        </Pressable>
        <Text style={estilos.tituloPantalla} accessibilityRole="header">
          Mi cuenta
        </Text>
      </View>
      <View style={estilos.cabecera}>
        <View style={estilos.avatar} accessibilityElementsHidden>
          <Text style={estilos.iniciales}>{iniciales}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={estilos.saludo} numberOfLines={2}>
            {`${u?.nombre ?? nombre} ${u?.apellido ?? sesion?.usuario.apellido ?? ''}`.trim()}
          </Text>
          <Text style={estilos.detalle}>
            {cargo} · @{sesion?.usuario.usuario}
          </Text>
        </View>
      </View>

      <View style={estilos.datos}>
        <Text style={estilos.tituloSeccion}>Mis datos</Text>
        {cargando ? (
          <ActivityIndicator color={colores.primario} style={{ marginVertical: 16 }} />
        ) : error ? (
          <Aviso tipo="error" mensaje={error} />
        ) : (
          <>
            <Fila etiqueta="Usuario de la app" valor={sesion?.usuario.usuario ?? '—'} />
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

      <Boton titulo="Cambiar contraseña" variante="secundario" onPress={() => router.push('/cambiar-contrasena')} />
    </Pantalla>
  );
}

function Fila({ etiqueta, valor, ultima = false }: { etiqueta: string; valor: string; ultima?: boolean }) {
  return (
    <View style={[estilos.fila, ultima && { borderBottomWidth: 0 }]}>
      <Text style={estilos.filaEtiqueta}>{etiqueta}</Text>
      <Text style={estilos.filaValor} numberOfLines={2}>
        {valor || '—'}
      </Text>
    </View>
  );
}

const estilos = StyleSheet.create({
  barraTitulo: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  tituloPantalla: { fontSize: 26, fontWeight: '700', color: colores.titulo },
  cabecera: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 20 },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colores.primario,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iniciales: { color: colores.blanco, fontWeight: '700', fontSize: 22 },
  saludo: { fontSize: 20, fontWeight: '700', color: colores.titulo },
  detalle: { fontSize: 14, color: colores.textoSecundario, marginTop: 4 },
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
