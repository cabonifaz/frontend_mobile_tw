/**
 * Lectura del QR del equipo SIN conexión (registro fotográfico, evidencia «QR»).
 * Misma regla que SP_RegistrarEvidenciaMovil: el código leído (sin distinguir mayúsculas) debe ser el N/S, el código del cliente o el COD TW del equipo;
 * o, si trae un texto más largo (una URL con el código al final), contener el COD TW o el código del cliente (de 5 o más caracteres).
 * Una etiqueta QR de TW (enlace q.me-qr.com/… o tw.com.pe/e/…) no trae el código: el servidor la reconoce por un vínculo que la app no tiene,
 * así que sin señal se guarda y el servidor la confirma al volver la conexión.
 */
export interface DatosEquipoQr {
  codigoTw: string | null;
  codigoCliente: string | null;
  numeroSerie: string | null;
}

export type ResultadoQrLocal = 'coincide' | 'etiqueta_tw' | 'no_coincide' | 'invalido';

const ETIQUETA_TW = /^https?:\/\/(q\.me-qr\.com\/[A-Za-z0-9_-]{4,40}|(www\.)?tw\.com\.pe\/e\/[A-Za-z0-9_-]{3,40})\/?([?#].*)?$/;

export function evaluarQrLocal(contenido: string, equipo: DatosEquipoQr): ResultadoQrLocal {
  const leido = contenido.trim();
  const codigo = leido.toUpperCase();
  if (!codigo || codigo.length > 300) return 'invalido';
  const mayus = (v: string | null) => v?.trim().toUpperCase() ?? '';
  if ([equipo.numeroSerie, equipo.codigoCliente, equipo.codigoTw].some((v) => mayus(v) !== '' && mayus(v) === codigo)) return 'coincide';
  if ([equipo.codigoTw, equipo.codigoCliente].some((v) => mayus(v).length >= 5 && codigo.includes(mayus(v)))) return 'coincide';
  return ETIQUETA_TW.test(leido) ? 'etiqueta_tw' : 'no_coincide';
}
