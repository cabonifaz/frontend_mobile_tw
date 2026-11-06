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

/** Título de la tarjeta de validación según el resultado. */
export function tituloValidacion(resultado: ValidacionLlegada['resultado']): string {
  switch (resultado) {
    case 'valida':
      return 'Ubicación válida';
    case 'sin_referencia':
      return 'Sin coordenada de la planta';
    case 'precision_baja':
      return 'Señal GPS débil';
    default:
      return 'Fuera del rango permitido';
  }
}
