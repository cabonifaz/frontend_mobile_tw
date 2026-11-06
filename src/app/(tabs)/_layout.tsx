import { Ionicons } from '@expo/vector-icons';
import { useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePathname } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import { useAprobacionesPendientes } from '@/hooks/useAprobacionesPendientes';
import { useSesion } from '@/sesion/SesionContext';
import { colores } from '@/tema/colores';
import { perfilDe } from '@/utilidades/perfil';

/**
 * Pestañas inferiores (HU-02): Menú, Notificaciones, Asistente y Perfil.
 * Las pantallas de la ruta del técnico (HU-03 en adelante) viven aquí sin botón propio, para que la
 * barra inferior se siga viendo; mientras están abiertas, la pestaña "Menú" queda marcada.
 * "Mi cuenta" también vive aquí sin botón y marca la pestaña "Perfil".
 * El rol y el área definen la barra (HU-28): el técnico ve Menú · Notificaciones · Asistente · Perfil; el Jefe de Metrología
 * (supervisor del área) ve Menú · Aprobaciones (con globo) · Notificaciones · Perfil.
 */
export default function LayoutPestanas() {
  const pathname = usePathname();
  const { sesion } = useSesion();
  const esJefatura = perfilDe(sesion?.usuario) === 'jefatura';
  const aprobacionesPendientes = useAprobacionesPendientes(esJefatura, pathname);
  // Pestaña que no corresponde al perfil: existe pero sin botón (no se usa href: null, ver nota de HU-03).
  const sinBoton = { tabBarButton: () => null, tabBarItemStyle: { display: 'none' as const } };
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
    // Viáticos y Gastos (HU-25 / HU-26)
    '/viaticos-gastos',
    '/viatico',
    '/solicitud-gasto',
  ].includes(pathname);
  const enCuenta = pathname === '/mi-cuenta';
  // En el detalle de una solicitud la pestaña Aprobaciones se pinta como activa (como Menú y Perfil en sus pantallas internas).
  const enDetalleAprobacion = pathname === '/aprobacion-salida';
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
      {/* HU-31: centro de aprobaciones (solo Jefatura). Va aquí para quedar entre Menú y Notificaciones. */}
      <Tabs.Screen
        name="aprobaciones"
        options={
          esJefatura
            ? {
                title: 'Aprobaciones',
                tabBarBadge: aprobacionesPendientes > 0 ? aprobacionesPendientes : undefined,
                tabBarBadgeStyle: { backgroundColor: colores.error, color: colores.blanco, fontSize: 10 },
                ...(enDetalleAprobacion
                  ? {
                      tabBarItemStyle: itemActivo,
                      tabBarLabelStyle: { fontSize: tamanoEtiqueta, fontWeight: '600', color: colores.blanco },
                    }
                  : {}),
                tabBarIcon: ({ color, size }) => (
                  <Ionicons name="checkmark-done-outline" color={enDetalleAprobacion ? colores.blanco : (color as string)} size={size} />
                ),
              }
            : { title: 'Aprobaciones', ...sinBoton }
        }
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
        options={
          esJefatura
            ? { title: 'Asistente', ...sinBoton }
            : {
                title: 'Asistente',
                tabBarIcon: ({ color, size }) => <Ionicons name="headset-outline" color={color as string} size={size} />,
              }
        }
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
      {/* HU-31: detalle de una solicitud de salida (se entra desde Aprobaciones). */}
      <Tabs.Screen
        name="aprobacion-salida"
        options={{ title: 'Autorización de salida', tabBarButton: () => null, tabBarItemStyle: { display: 'none' } }}
      />
      {/* HU-25 / HU-26: viáticos asignados al programar y gastos rendidos (se entra desde el menú). */}
      <Tabs.Screen
        name="viaticos-gastos"
        options={{ title: 'Viáticos y Gastos', tabBarButton: () => null, tabBarItemStyle: { display: 'none' } }}
      />
      <Tabs.Screen
        name="viatico"
        options={{ title: 'Viático', tabBarButton: () => null, tabBarItemStyle: { display: 'none' } }}
      />
      <Tabs.Screen
        name="solicitud-gasto"
        options={{ title: 'Gasto', tabBarButton: () => null, tabBarItemStyle: { display: 'none' } }}
      />
    </Tabs>
  );
}

