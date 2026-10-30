import { Ionicons } from '@expo/vector-icons';
import { useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePathname } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import { colores } from '@/tema/colores';

/**
 * Pestañas inferiores (HU-02): Menú, Notificaciones, Asistente y Perfil.
 * Las pantallas de la ruta del técnico (HU-03 en adelante) viven aquí sin botón propio, para que la
 * barra inferior se siga viendo; mientras están abiertas, la pestaña "Menú" queda marcada.
 * "Mi cuenta" también vive aquí sin botón y marca la pestaña "Perfil".
 */
export default function LayoutPestanas() {
  const pathname = usePathname();
  // Android (edge-to-edge) dibuja la app detrás de la barra de navegación del sistema
  // (botones ◁ ○ ▢ o gestos): la barra de pestañas suma ese espacio para no quedar tapada.
  const { bottom: margenInferior } = useSafeAreaInsets();
  // En celulares angostos (320 dp) la etiqueta "Notificaciones" no entra a 11 pt.
  const tamanoEtiqueta = useWindowDimensions().width < 360 ? 8.5 : 11;
  // Pantallas de la ruta del técnico que no tienen botón propio: marcan la pestaña "Menú".
  const enServicios = [
    '/servicios-programados',
    '/detalle-servicio',
    '/checklist-salida',
    '/demoras',
    '/llegada',
    '/objetivos',
    '/seleccionar-equipo',
  ].includes(pathname);
  const enCuenta = pathname === '/mi-cuenta';
  const itemActivo = {
    borderRadius: 12,
    overflow: 'hidden' as const,
    marginHorizontal: 3,
    marginVertical: 6,
    backgroundColor: colores.primario,
  };

  return (
    <Tabs
      // "Volver" regresa a la pantalla anterior (agenda → detalle → checklist), no siempre al menú.
      backBehavior="history"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colores.blanco,
        tabBarInactiveTintColor: colores.textoSecundario,
        tabBarActiveBackgroundColor: colores.primario,
        tabBarItemStyle: { borderRadius: 12, overflow: 'hidden', marginHorizontal: 3, marginVertical: 6 },
        tabBarLabelStyle: { fontSize: tamanoEtiqueta, fontWeight: '600' },
        tabBarAllowFontScaling: false,
        tabBarStyle: {
          height: 72 + margenInferior,
          paddingBottom: margenInferior,
          paddingHorizontal: 4,
          borderTopColor: colores.bordeSuave,
        },
        sceneStyle: { backgroundColor: colores.fondo },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Menú',
          // En las pantallas de la ruta del técnico la pestaña Menú se pinta como activa
          ...(enServicios
            ? {
                tabBarItemStyle: itemActivo,
                tabBarLabelStyle: { fontSize: tamanoEtiqueta, fontWeight: '600', color: colores.blanco },
              }
            : {}),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="grid-outline" color={enServicios ? colores.blanco : (color as string)} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="notificaciones"
        options={{
          title: 'Notificaciones',
          tabBarIcon: ({ color, size }) => <Ionicons name="notifications-outline" color={color as string} size={size} />,
        }}
      />
      <Tabs.Screen
        name="asistente"
        options={{
          title: 'Asistente',
          tabBarIcon: ({ color, size }) => <Ionicons name="headset-outline" color={color as string} size={size} />,
        }}
      />
      <Tabs.Screen
        name="perfil"
        options={{
          title: 'Perfil',
          // En "Mi cuenta" la pestaña Perfil se pinta como activa
          ...(enCuenta
            ? {
                tabBarItemStyle: itemActivo,
                tabBarLabelStyle: { fontSize: tamanoEtiqueta, fontWeight: '600', color: colores.blanco },
              }
            : {}),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-outline" color={enCuenta ? colores.blanco : (color as string)} size={size} />
          ),
        }}
      />
      {/* HU-02: Mi cuenta (datos del técnico y cambio de contraseña), se entra desde Perfil. */}
      <Tabs.Screen
        name="mi-cuenta"
        options={{ title: 'Mi cuenta', tabBarButton: () => null, tabBarItemStyle: { display: 'none' } }}
      />
      {/* HU-03: sin botón propio en la barra (se entra desde el menú).
          No se usa href: null porque en SDK 58 eso deja la pantalla inaccesible. */}
      <Tabs.Screen
        name="servicios-programados"
        options={{ title: 'Servicios Programados', tabBarButton: () => null, tabBarItemStyle: { display: 'none' } }}
      />
      {/* HU-04: detalle del servicio y checklist de pre-salida (se entra desde la agenda). */}
      <Tabs.Screen
        name="detalle-servicio"
        options={{ title: 'Servicio Programado', tabBarButton: () => null, tabBarItemStyle: { display: 'none' } }}
      />
      <Tabs.Screen
        name="checklist-salida"
        options={{ title: 'Validación antes de salir', tabBarButton: () => null, tabBarItemStyle: { display: 'none' } }}
      />
      <Tabs.Screen
        name="demoras"
        options={{ title: 'Registro de Demoras', tabBarButton: () => null, tabBarItemStyle: { display: 'none' } }}
      />
      <Tabs.Screen
        name="llegada"
        options={{ title: 'Registrar llegada', tabBarButton: () => null, tabBarItemStyle: { display: 'none' } }}
      />
      <Tabs.Screen
        name="objetivos"
        options={{ title: 'Objetivos de Hoy', tabBarButton: () => null, tabBarItemStyle: { display: 'none' } }}
      />
      <Tabs.Screen
        name="seleccionar-equipo"
        options={{ title: 'Seleccionar Equipo', tabBarButton: () => null, tabBarItemStyle: { display: 'none' } }}
      />
    </Tabs>
  );
}

