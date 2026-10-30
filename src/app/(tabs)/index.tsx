import { useEffect } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { nombreDeCodigo, obtenerCatalogo } from '@/api/catalogos';
import { obtenerResumenMenu } from '@/api/menu';
import { conRespaldo, horaRespaldo } from '@/api/respaldo';
import { Aviso } from '@/componentes/Aviso';
import { BannerProximoServicio } from '@/componentes/BannerProximoServicio';
import { EncabezadoApp } from '@/componentes/EncabezadoApp';
import { TarjetaModulo } from '@/componentes/TarjetaModulo';
import { useConsulta } from '@/hooks/useConsulta';
import { useDiseno } from '@/hooks/useDiseno';
import { modulosMenu, type ModuloMenu } from '@/menu/modulos';
import { useSesion } from '@/sesion/SesionContext';
import { colores } from '@/tema/colores';

/**
 * HU-02 — Menú principal y accesos operativos.
 *  - Cuadrícula de módulos con íconos.
 *  - Indicadores dinámicos desde la BD: servicios asignados y servicios de hoy.
 *  - Banner "Próximo Hit" con el servicio en curso o el más cercano.
 *  Sin "Online · Sincronizado", sin tarjeta de sincronización y sin botón de refresh.
 *  Los indicadores se actualizan al abrir el menú y al deslizar hacia abajo.
 *  Sin conexión (HU-01 · modo offline): se muestran los últimos indicadores guardados en el teléfono
 *  con un aviso "Sin conexión" y la app reintenta sola cada 30 s hasta que vuelve la señal.
 */
const REINTENTO_SIN_CONEXION_MS = 30000;

export default function PantallaMenu() {
  const { sesion } = useSesion();
  const usuario = sesion?.usuario;
  const d = useDiseno();

  const { datos, cargando, recargando, error, recargar } = useConsulta(async (token) => {
    const [r, cargos] = await Promise.all([
      conRespaldo(usuario?.idUsuario ?? 0, 'menu.resumen', () => obtenerResumenMenu(token)),
      obtenerCatalogo(token, 'CARGO_USUARIO').catch(() => null),
    ]);
    return { resumen: r.datos, sinConexion: r.sinConexion, guardadoEn: r.guardadoEn, cargos };
  });

  const cargo = nombreDeCodigo(datos?.cargos, usuario?.cargo) ?? usuario?.cargo ?? 'Técnico de Campo';
  const resumen = datos?.resumen ?? null;
  const sinConexion = !!datos?.sinConexion;

  // Sin señal: se vuelve a intentar solo, sin botones.
  useEffect(() => {
    if (!sinConexion) return;
    const id = setInterval(() => void recargar(), REINTENTO_SIN_CONEXION_MS);
    return () => clearInterval(id);
  }, [sinConexion, recargar]);

  function abrir(modulo: ModuloMenu) {
    if (modulo.ruta) router.push(modulo.ruta as never);
    else router.push({ pathname: '/modulo/[id]', params: { id: modulo.id } });
  }

  // Cuadrícula: 2 columnas en celular, 3 en tablet
  const columnas = d.columnasMenu;
  const filas: ModuloMenu[][] = [];
  for (let i = 0; i < modulosMenu.length; i += columnas) filas.push(modulosMenu.slice(i, i + columnas));

  return (
    <SafeAreaView style={estilos.area} edges={['top']}>
      <EncabezadoApp
        nombre={usuario?.nombre ?? ''}
        apellido={usuario?.apellido}
        subtitulo={`${usuario?.nombre ?? ''} · ${cargo}`}
      />
      <ScrollView
        contentContainerStyle={[estilos.contenido, { paddingHorizontal: d.margen, maxWidth: d.anchoMaximo }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={recargando} onRefresh={recargar} colors={[colores.primario]} />
        }
      >
        <Text style={[estilos.titulo, { fontSize: d.tituloPantalla + 2 }]} accessibilityRole="header">
          Menú Principal
        </Text>
        <Text style={estilos.subtitulo}>Accesos operativos</Text>

        {sinConexion && datos?.guardadoEn && (
          <View style={{ marginBottom: 16 }} testID="menu-sin-conexion">
            <Aviso
              tipo="info"
              mensaje={`Sin conexión · se muestra lo guardado a las ${horaRespaldo(datos.guardadoEn)}. Se actualiza solo al volver la señal.`}
            />
          </View>
        )}

        {!!error && (
          <View style={{ marginBottom: 16 }}>
            <Aviso tipo="error" mensaje={`No se pudieron cargar los indicadores. ${error}`} />
          </View>
        )}

        <View style={estilos.cuadricula}>
          {filas.map((fila) => (
            <View key={fila[0].id} style={estilos.fila}>
              {fila.map((m) => (
                <TarjetaModulo
                  key={m.id}
                  modulo={m}
                  indicador={m.indicador && resumen ? m.indicador(resumen) : null}
                  onPress={() => abrir(m)}
                />
              ))}
              {Array.from({ length: columnas - fila.length }, (_, k) => (
                <View key={`hueco-${k}`} style={{ flex: 1 }} />
              ))}
            </View>
          ))}
        </View>

        {!cargando && !error && (
          <BannerProximoServicio
            servicio={resumen?.proximoServicio ?? null}
            onPress={() =>
              resumen?.proximoServicio
                ? router.push({ pathname: '/detalle-servicio', params: { id: String(resumen.proximoServicio.idOs) } })
                : router.push('/servicios-programados')
            }
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const estilos = StyleSheet.create({
  area: { flex: 1, backgroundColor: colores.fondo },
  contenido: { padding: 20, paddingBottom: 28, maxWidth: 520, width: '100%', alignSelf: 'center' },
  titulo: { fontSize: 24, fontWeight: '700', color: colores.titulo, marginTop: 4 },
  subtitulo: { fontSize: 15, color: colores.textoSecundario, marginTop: 4, marginBottom: 20 },
  cuadricula: { gap: 14, marginBottom: 18 },
  fila: { flexDirection: 'row', gap: 14 },
});
