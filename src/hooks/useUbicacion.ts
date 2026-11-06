import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import * as Location from 'expo-location';
import type { Ubicacion } from '@/api/ruta';
import { conTope, posicionReciente } from '@/utilidades/posicionActual';

export type EstadoGps = 'buscando' | 'activo' | 'sin_permiso' | 'error';

/**
 * Ubicación GPS del celular (HU-05 y HU-06).
 *  - Pide el permiso de ubicación "mientras se usa la app" (nunca en segundo plano).
 *  - Alta precisión y la precisión (± m) que informa el sistema. Si el GPS no da posición en 10 s (interiores, señal débil) prueba con
 *    precisión equilibrada y, si tampoco, usa la posición que ya seguía la app (máx. 60 s); si no hay ninguna, avisa en vez de quedarse en "Buscando…".
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
      const p = Platform.OS === 'web' ? await posicionWeb() : await posicionNativa();
      if (!p) {
        if (vigente.current) {
          setEstado('error');
          setMensaje('Aún no hay señal de GPS. Sal a un lugar abierto, revisa que el GPS esté encendido y toca "Volver a capturar ubicación".');
        }
        return null;
      }
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

type PosicionGps = { coords: { latitude: number; longitude: number; accuracy: number | null }; mocked?: boolean };

/**
 * GPS de alta precisión (10 s) → precisión equilibrada (8 s) → posición que ya seguía la app (≤ 60 s) → última conocida del sistema (≤ 60 s).
 * Sin ninguna, null. Así la pantalla nunca se queda esperando: o hay posición (con su precisión real, que el back valida) o hay un aviso.
 */
async function posicionNativa(): Promise<PosicionGps | null> {
  const alta = await conTope(Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }), 10_000);
  if (alta) return alta;
  const media = await conTope(Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }), 8_000);
  if (media) return media;
  const seguida = posicionReciente(60_000);
  if (seguida) return { coords: { latitude: seguida.latitud, longitude: seguida.longitud, accuracy: seguida.precisionMetros } };
  return conTope(Location.getLastKnownPositionAsync({ maxAge: 60_000 }), 3_000);
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
