import { useCallback } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';

/**
 * "Tiempo real" del Panel de Campo: vuelve a leer los datos cada `segundos` (mínimo 10) mientras la pantalla está a la vista y la app en primer plano.
 * El intervalo lo manda el back (parámetro de la bandeja de seguimiento). Se detiene al salir de la pantalla.
 */
export function useRefrescoAutomatico(recargar: () => Promise<void> | void, segundos: number) {
  useFocusEffect(
    useCallback(() => {
      const t = setInterval(() => {
        if (AppState.currentState === 'active') void recargar();
      }, Math.max(10, segundos) * 1000);
      return () => clearInterval(t);
    }, [recargar, segundos]),
  );
}
