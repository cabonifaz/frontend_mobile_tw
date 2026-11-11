import type { ReferenciaGps, Ubicacion, ValidacionLlegada } from '@/api/ruta';

/** Distancia en metros entre dos coordenadas (Haversine), redondeada. La misma fórmula que usa el back (SP_EvaluarLlegadaMovil). */
export function distanciaMetros(a: { latitud: number; longitud: number }, b: { latitud: number; longitud: number }): number {
  const rad = (g: number) => (g * Math.PI) / 180;
  const h = Math.sin(rad(a.latitud - b.latitud) / 2) ** 2 + Math.cos(rad(b.latitud)) * Math.cos(rad(a.latitud)) * Math.sin(rad(a.longitud - b.longitud) / 2) ** 2;
  return Math.round(6_371_000 * 2 * Math.asin(Math.sqrt(h)));
}

/** 2212 → "2,212" (miles con coma, como el mensaje que arma el back). */
export function textoMetros(metros: number): string {
  return Math.round(metros)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * Validación de la llegada EN EL TELÉFONO, solo para cuando no hay conexión: con la planta que la app guardó la última vez
 * (referencia, radio y precisión máxima). Mismas reglas y textos que SP_EvaluarLlegadaMovil. Al enviarse la llegada, el back vuelve a evaluar
 * con el mismo GPS: si el teléfono se equivocó, el back la rechaza y la app avisa.
 */
export function evaluarLlegadaLocal(referencia: ReferenciaGps | null, u: Ubicacion, precisionMaximaMetros: number): ValidacionLlegada {
  const base = { precisionMetros: u.precisionMetros, radioMetros: referencia?.radioMetros ?? null };
  if (u.precisionMetros > precisionMaximaMetros) {
    return {
      ...base,
      resultado: 'precision_baja',
      registrable: false,
      distanciaMetros: null,
      mensaje: `La señal GPS es débil (± ${Math.round(u.precisionMetros)} m; máximo ${precisionMaximaMetros} m). Sal a un lugar abierto y vuelve a capturar tu ubicación.`,
    };
  }
  if (!referencia) {
    return {
      ...base,
      resultado: 'sin_referencia',
      registrable: true,
      distanciaMetros: null,
      mensaje: 'La planta no tiene coordenadas registradas: tu llegada se registrará sin validar la distancia y quedará marcada para Operaciones.',
    };
  }
  const distancia = distanciaMetros(referencia, u);
  return distancia <= referencia.radioMetros
    ? { ...base, resultado: 'valida', registrable: true, distanciaMetros: distancia, mensaje: `Te encuentras dentro del rango permitido (a ${textoMetros(distancia)} m de la planta).` }
    : {
        ...base,
        resultado: 'fuera_rango',
        registrable: false,
        distanciaMetros: distancia,
        mensaje: `Estás a ${textoMetros(distancia)} m de la planta (máximo ${referencia.radioMetros} m). Acércate para registrar tu llegada.`,
      };
}

/** 850 → "850 m"; 2340 → "2,3 km" (la distancia a la planta que ve el técnico). */
export function textoDistancia(metros: number): string {
  if (!Number.isFinite(metros) || metros < 0) return '—';
  if (metros < 1000) return `${Math.round(metros)} m`;
  return `${(metros / 1000).toFixed(1).replace('.', ',')} km`;
}

/** Distancia (m) del técnico a la planta, o null si falta la coordenada de la planta o el GPS. Funciona sin conexión (solo usa lo ya cargado). */
export function distanciaAPlanta(referencia: ReferenciaGps | null, u: Ubicacion | null): number | null {
  return referencia && u ? distanciaMetros(referencia, u) : null;
}

/** Coordenada con 5 decimales ("-12.04532, -77.11371"); vacío si falta alguno de los dos valores. */
export function textoCoordenada(latitud: number | null | undefined, longitud: number | null | undefined): string {
  if (latitud == null || longitud == null || !Number.isFinite(latitud) || !Number.isFinite(longitud)) return '';
  return `${latitud.toFixed(5)}, ${longitud.toFixed(5)}`;
}

/**
 * Enlace para abrir la planta en la app de mapas del teléfono (sin librerías nativas: `Linking.openURL`).
 * Android: geo: (abre el selector de mapas). iOS: Apple Maps. Otro (web): Google Maps. Null si no hay coordenada.
 */
export function enlaceMapaPlanta(
  referencia: { latitud: number; longitud: number } | null,
  etiqueta: string | null,
  plataforma: string,
): string | null {
  if (!referencia || !Number.isFinite(referencia.latitud) || !Number.isFinite(referencia.longitud)) return null;
  const punto = `${referencia.latitud},${referencia.longitud}`;
  const nombre = (etiqueta ?? '').trim() || 'Planta';
  if (plataforma === 'android') return `geo:${punto}?q=${punto}(${encodeURIComponent(nombre)})`;
  if (plataforma === 'ios') return `https://maps.apple.com/?ll=${punto}&q=${encodeURIComponent(nombre)}`;
  return `https://www.google.com/maps/search/?api=1&query=${punto}`;
}

/** HU-06: capturas de ubicación fuera del rango que hacen falta para poder pedir la llegada forzada. */
export const INTENTOS_LLEGADA_FORZADA = 5;

/** Título de la tarjeta de validación según el resultado. */
export function tituloValidacion(resultado: ValidacionLlegada['resultado']): string {
  switch (resultado) {
    case 'valida':
      return 'Ubicación válida';
    case 'autorizada':
      return 'Llegada autorizada por Jefatura';
    case 'sin_referencia':
      return 'Sin coordenada de la planta';
    case 'precision_baja':
      return 'Señal GPS débil';
    default:
      return 'Fuera del rango permitido';
  }
}

/**
 * Minutos estimados para llegar a la planta (HU-20): distancia en línea recta × 1,3 (por las calles) a una velocidad promedio (30 km/h por defecto,
 * la misma que usa el servidor en SEG_VELOCIDAD_PROMEDIO_KMH). Es referencial; mínimo 1 minuto.
 */
export function etaMinutosDesde(distanciaMetros: number, velocidadKmh = 30): number {
  const v = Math.max(5, velocidadKmh);
  return Math.max(1, Math.ceil(((distanciaMetros * 1.3) / 1000 / v) * 60));
}
