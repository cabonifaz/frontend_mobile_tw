import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useWindowDimensions } from 'react-native';
import { usePathname } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import { colores } from '@/tema/colores';

/**
 * Pestañas inferiores (HU-02): Ruta (menú principal), Notificaciones, Asistente y Perfil.
 * "Servicios Programados" (HU-03) vive aquí como pantalla sin botón propio, para que la
 * barra inferior se siga viendo; mientras está abierta, la pestaña "Ruta" queda marcada.
 */
export default function LayoutPestanas() {
  const pathname = usePathname();
  // En celulares angostos (320 dp) la etiqueta "Notificaciones" no entra a 11 pt.
  const tamanoEtiqueta = useWindowDimensions().width < 360 ? 8.5 : 11;
  // Pantallas de la ruta del técnico que no tienen botón propio: marcan la pestaña "Ruta".
  const enServicios = ['/servicios-programados', '/detalle-servicio', '/checklist-salida'].includes(pathname);

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
        tabBarStyle: { height: 72, paddingHorizontal: 4, borderTopColor: colores.bordeSuave },
        sceneStyle: { backgroundColor: colores.fondo },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Ruta',
          // En "Servicios Programados" la pestaña Ruta se pinta como activa
          ...(enServicios
            ? {
                tabBarItemStyle: {
                  borderRadius: 12,
                  overflow: 'hidden',
                  marginHorizontal: 3,
                  marginVertical: 6,
                  backgroundColor: colores.primario,
                },
                tabBarLabelStyle: { fontSize: tamanoEtiqueta, fontWeight: '600', color: colores.blanco },
              }
            : {}),
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="map-marker-path" color={enServicios ? colores.blanco : (color as string)} size={size} />
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
          tabBarIcon: ({ color, size }) => <Ionicons name="person-outline" color={color as string} size={size} />,
        }}
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
    </Tabs>
  );
}

