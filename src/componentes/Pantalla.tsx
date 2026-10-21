import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, RefreshControl, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colores } from '@/tema/colores';

interface Props {
  children: ReactNode;
  /** Si se pasa, la pantalla permite "deslizar hacia abajo para actualizar". */
  onRecargar?: () => void;
  recargando?: boolean;
  /** true en pantallas con pestañas inferiores: la barra de pestañas ya cubre el borde inferior. */
  conPestanas?: boolean;
}

/** Contenedor de pantalla con scroll, teclado y (opcional) deslizar para actualizar. */
export function Pantalla({ children, onRecargar, recargando = false, conPestanas = false }: Props) {
  return (
    <SafeAreaView style={estilos.area} edges={conPestanas ? ['top'] : ['top', 'bottom']}>
      <KeyboardAvoidingView style={estilos.area} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={estilos.contenido}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          refreshControl={
            onRecargar ? (
              <RefreshControl refreshing={recargando} onRefresh={onRecargar} colors={[colores.primario]} tintColor={colores.primario} />
            ) : undefined
          }
        >
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const estilos = StyleSheet.create({
  area: { flex: 1, backgroundColor: colores.fondo },
  contenido: { flexGrow: 1, paddingHorizontal: 20, paddingVertical: 24, maxWidth: 480, width: '100%', alignSelf: 'center' },
});
