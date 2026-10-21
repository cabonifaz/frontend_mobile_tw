import { useEffect, useState } from 'react';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';

/**
 * Actualizaciones por internet (EAS Update).
 * Se instala UN solo APK; cada avance publicado con `npm run actualizar` se descarga
 * al abrir la app (mientras se ve el splash) y la app se reinicia ya actualizada.
 * Si no hay internet o tarda demasiado, la app abre con la versión que ya tiene.
 */
const ESPERA_MAXIMA_MS = 8000;

export function useBuscarActualizacion(): boolean {
  const habilitado = !__DEV__ && Updates.isEnabled;
  const [listo, setListo] = useState(!habilitado);

  useEffect(() => {
    if (!habilitado) return;
    let vigente = true;

    const buscar = async () => {
      const resultado = await Updates.checkForUpdateAsync();
      if (!resultado.isAvailable) return;
      const descarga = await Updates.fetchUpdateAsync();
      if (descarga.isNew) await Updates.reloadAsync();
    };

    const limite = new Promise<void>((resolver) => setTimeout(resolver, ESPERA_MAXIMA_MS));

    Promise.race([buscar(), limite])
      .catch(() => {
        // sin internet o error del servidor: se continúa con la versión instalada
      })
      .finally(() => {
        if (vigente) setListo(true);
      });

    return () => {
      vigente = false;
    };
  }, [habilitado]);

  return listo;
}

/** Texto de versión para el pie: "Versión 0.1.0 · act. 20/10 15:40". */
export function textoVersion(): string {
  const version = Constants.expoConfig?.version ?? '0.1.0';
  const fecha = !Updates.isEmbeddedLaunch ? Updates.createdAt : null;
  if (!fecha) return `Versión ${version}`;

  const dosDigitos = (n: number) => String(n).padStart(2, '0');
  const act = `${dosDigitos(fecha.getDate())}/${dosDigitos(fecha.getMonth() + 1)} ${dosDigitos(fecha.getHours())}:${dosDigitos(fecha.getMinutes())}`;
  return `Versión ${version} · act. ${act}`;
}
