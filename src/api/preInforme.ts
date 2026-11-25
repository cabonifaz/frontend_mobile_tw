import { requireOptionalNativeModule } from 'expo';
import { entorno } from '@/config/entorno';
import { htmlPreInforme } from '@/utilidades/preInformeHtml';
import { sistemaArchivos } from './archivosLocales';
import type { CabeceraInforme } from './informe';

/**
 * Pre-informe — PDF de la cabecera del informe del equipo, para imprimirlo y que lo firme el encargado de planta. Es OPCIONAL: no cuenta para que la etapa quede conforme.
 *   GET api/movil/servicios/{idOs}/equipos/{idOsEquipo}/cabecera-informe/pdf
 * Con señal el PDF lo GENERA el servidor con lo ya guardado de la cabecera y solo si está completa (si falta algo responde 400). Sin señal la app lo arma en el teléfono
 * con lo guardado en él (`generarPreInformeLocal`, expo-print): es un BORRADOR marcado como tal. La app lo deja en la carpeta `pre-informes` (se sobrescribe en cada
 * descarga) y lo abre con el lector de PDF del teléfono, desde donde se imprime o se comparte (`abrirPdf`).
 * No es el informe oficial: no asigna N° de informe ni cambia nada.
 */
const CARPETA = 'pre-informes';

export async function descargarPreInforme(token: string, idOs: number, idOsEquipo: number): Promise<string> {
  if (entorno.usarMock) throw new Error('El pre-informe se genera en el servidor: no está disponible en el modo demo.');
  const f = sistemaArchivos();
  if (!f) throw new Error('Esta versión de la app no puede guardar archivos. Instala la última.');
  const dir = new f.Directory(f.Paths.document, CARPETA);
  dir.create({ idempotent: true, intermediates: true });
  const destino = new f.File(dir, `pre-informe-${idOs}-${idOsEquipo}.pdf`);
  try {
    await f.File.downloadFileAsync(`${entorno.apiUrl}/api/movil/servicios/${encodeURIComponent(String(idOs))}/equipos/${encodeURIComponent(String(idOsEquipo))}/cabecera-informe/pdf`, destino, {
      headers: { Authorization: `Bearer ${token}` },
      idempotent: true,
    });
  } catch {
    throw new Error('No se pudo generar el pre-informe. Verifica que la cabecera esté completa y guardada, y que tengas conexión.');
  }
  if (!destino.exists || destino.size === 0) {
    try {
      destino.delete();
    } catch {
      // nada que borrar
    }
    throw new Error('No se pudo descargar el pre-informe. Inténtalo de nuevo.');
  }
  return destino.uri;
}

/** ¿Esta app trae el módulo para armar PDF en el teléfono? (las instaladas antes de agregarlo no.) */
export const puedeGenerarPreInformeLocal = (): boolean => !entorno.usarMock && sistemaArchivos() !== null && requireOptionalNativeModule('ExpoPrint') !== null;

/** Arma el pre-informe (borrador) en el teléfono con la cabecera guardada, incluida la que espera señal para enviarse. Devuelve la ruta del PDF. */
export async function generarPreInformeLocal(cabecera: CabeceraInforme, idOs: number, idOsEquipo: number): Promise<string> {
  const f = sistemaArchivos();
  if (!f || !requireOptionalNativeModule('ExpoPrint')) throw new Error('Esta versión de la app no puede armar el PDF sin conexión. Instala la última o descárgalo con señal.');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Print = require('expo-print') as typeof import('expo-print');
  try {
    const { uri } = await Print.printToFileAsync({ html: htmlPreInforme(cabecera), base64: false });
    const dir = new f.Directory(f.Paths.document, CARPETA);
    dir.create({ idempotent: true, intermediates: true });
    const destino = new f.File(dir, `pre-informe-borrador-${idOs}-${idOsEquipo}.pdf`);
    if (destino.exists) destino.delete();
    await new f.File(uri).copy(destino);
    return destino.uri;
  } catch {
    throw new Error('No se pudo armar el PDF en el teléfono. Inténtalo de nuevo.');
  }
}
