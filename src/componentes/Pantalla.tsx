import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colores } from '@/tema/colores';

/** Contenedor de pantalla con scroll y teclado (formularios). */
export function Pantalla({ children }: { children: ReactNode }) {
  return (
    <SafeAreaView style={estilos.area} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={estilos.area} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={estilos.contenido}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
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
