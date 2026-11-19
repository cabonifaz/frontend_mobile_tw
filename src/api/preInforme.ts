import { entorno } from '@/config/entorno';
import { sistemaArchivos } from './archivosLocales';

/**
 * Pre-informe — PDF de la cabecera del informe del equipo, para imprimirlo y que lo firme el encargado de planta.
 *   GET api/movil/servicios/{idOs}/equipos/{idOsEquipo}/cabecera-informe/pdf
 * El PDF lo GENERA el servidor con lo ya guardado de la cabecera y solo si está completa (si falta algo responde 400). La app lo descarga a la carpeta
 * `pre-informes` del teléfono (se sobrescribe en cada descarga) y lo abre con el lector de PDF del teléfono, desde donde se imprime o se comparte (`abrirPdf`).
 * No es el informe oficial: no asigna N° de informe ni cambia nada. Exige conexión.
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
