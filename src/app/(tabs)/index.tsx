import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { nombreDeCodigo, obtenerCatalogo } from '@/api/catalogos';
import { obtenerResumenMenu } from '@/api/menu';
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
 */
export default function PantallaMenu() {
  const { sesion } = useSesion();
  const usuario = sesion?.usuario;
  const d = useDiseno();

  const { datos, cargando, recargando, error, recargar } = useConsulta(async (token) => {
    const [resumen, cargos] = await Promise.all([obtenerResumenMenu(token), obtenerCatalogo(token, 'CARGO_USUARIO')]);
    return { resumen, cargos };
  });

  const cargo = nombreDeCodigo(datos?.cargos, usuario?.cargo) ?? usuario?.cargo ?? 'Técnico de Campo';
  const resumen = datos?.resumen ?? null;

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
