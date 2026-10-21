import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Tabs } from 'expo-router/js-tabs';
import { colores } from '@/tema/colores';

/** Pestañas inferiores (HU-02): Ruta (menú principal), Notificaciones, Asistente y Perfil. */
export default function LayoutPestanas() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colores.blanco,
        tabBarInactiveTintColor: colores.textoSecundario,
        tabBarActiveBackgroundColor: colores.primario,
        tabBarItemStyle: { borderRadius: 12, overflow: 'hidden', marginHorizontal: 3, marginVertical: 6 },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        tabBarStyle: { height: 72, paddingHorizontal: 4, borderTopColor: colores.bordeSuave },
        sceneStyle: { backgroundColor: colores.fondo },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Ruta',
          tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="map-marker-path" color={color as string} size={size} />,
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
    </Tabs>
  );
}
