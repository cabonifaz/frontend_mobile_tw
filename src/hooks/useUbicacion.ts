import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import * as Location from 'expo-location';
import type { Ubicacion } from '@/api/ruta';

export type EstadoGps = 'buscando' | 'activo' | 'sin_permiso' | 'error';

/**
 * Ubicación GPS del celular (HU-05 y HU-06).
 *  - Pide el permiso de ubicación "mientras se usa la app" (nunca en segundo plano).
 *  - Alta precisión y la precisión (± m) que informa el sistema.
 *  - Rechaza ubicaciones simuladas (apps de "GPS falso" en Android).
 *  - `capturar()` vuelve a tomar la ubicación (p. ej. al acercarse a la planta).
 */
export function useUbicacion(automatico = true, alObtener?: (u: Ubicacion) => void) {
  const [ubicacion, setUbicacion] = useState<Ubicacion | null>(null);
  const [estado, setEstado] = useState<EstadoGps>('buscando');
  const [mensaje, setMensaje] = useState<string | null>(null);
  const vigente = useRef(true);
  const alObtenerRef = useRef(alObtener);
  useEffect(() => {
    alObtenerRef.current = alObtener;
  });

  /** Lee la ubicación (los estados se actualizan después del await). */
  const leer = useCallback(async (): Promise<Ubicacion | null> => {
    try {
      const permiso = await Location.requestForegroundPermissionsAsync();
      if (permiso.status !== 'granted') {
        if (vigente.current) {
          setEstado('sin_permiso');
          setMensaje('Activa el permiso de ubicación de la app para registrar tu posición.');
        }
        return null;
      }
      const p = Platform.OS === 'web' ? await posicionWeb() : await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      if (p.mocked) {
        if (vigente.current) {
          setEstado('error');
          setMensaje('Se detectó una ubicación simulada. Desactiva las apps de GPS falso e inténtalo de nuevo.');
        }
        return null;
      }
      const u: Ubicacion = {
        latitud: p.coords.latitude,
        longitud: p.coords.longitude,
        precisionMetros: Math.max(0, Math.round((p.coords.accuracy ?? 999) * 10) / 10),
      };
      if (vigente.current) {
        setUbicacion(u);
        setEstado('activo');
        setMensaje(null);
        alObtenerRef.current?.(u);
      }
      return u;
    } catch {
      if (vigente.current) {
        setEstado('error');
        setMensaje('No se pudo obtener tu ubicación. Revisa que el GPS esté encendido.');
      }
      return null;
    }
  }, []);

  /** Vuelve a tomar la ubicación (botón "Volver a capturar"). */
  const capturar = useCallback(async (): Promise<Ubicacion | null> => {
    setEstado('buscando');
    setMensaje(null);
    return leer();
  }, [leer]);

  useEffect(() => {
    vigente.current = true;
    // Primera lectura al abrir la pantalla (fuera del render: los estados cambian en el callback)
    if (automatico) void Promise.resolve().then(leer);
    return () => {
      vigente.current = false;
    };
  }, [automatico, leer]);

  return { ubicacion, estado, mensaje, capturar };
}

/** En web expo-location reutiliza la última posición (maximumAge infinito); aquí se pide una lectura nueva. */
function posicionWeb(): Promise<{ coords: { latitude: number; longitude: number; accuracy: number | null }; mocked?: boolean }> {
  return new Promise((resolve, reject) =>
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ coords: { latitude: p.coords.latitude, longitude: p.coords.longitude, accuracy: p.coords.accuracy } }),
      reject,
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 },
    ),
  );
}
