/**
 * Variables de entorno de la app (se leen en tiempo de compilación).
 * Expo solo expone a la app las variables que empiezan con EXPO_PUBLIC_.
 */
const urlCruda = process.env.EXPO_PUBLIC_API_URL ?? '';

export const entorno = {
  /** URL base del backend .NET, sin "/" final. */
  apiUrl: urlCruda.trim().replace(/\/+$/, ''),
  /** true = la app no llama al backend; usa datos de prueba (ver src/api/mock.ts). */
  usarMock: (process.env.EXPO_PUBLIC_USE_MOCK ?? 'false').toLowerCase() === 'true',
  /** Tiempo máximo de espera de cada request (ms). */
  timeoutMs: 20000,
} as const;
