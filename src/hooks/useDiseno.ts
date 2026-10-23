import { useWindowDimensions } from 'react-native';

/**
 * Medidas para que las pantallas se vean bien en cualquier celular (y en tablet):
 *  - compacto ... celulares angostos (menos de 360 dp, p. ej. 320 de ancho)
 *  - tablet ..... 600 dp o más
 * Las pantallas usan estos valores en vez de anchos fijos.
 */
export function useDiseno() {
  const { width, fontScale } = useWindowDimensions();
  const compacto = width < 360;
  const tablet = width >= 600;

  return {
    ancho: width,
    compacto,
    tablet,
    /** Letra grande del sistema (accesibilidad): conviene apilar en vez de poner lado a lado. */
    letraGrande: fontScale > 1.25,
    /** Margen lateral de las pantallas. */
    margen: compacto ? 14 : tablet ? 28 : 20,
    /** Ancho máximo del contenido (en tablet no se estira de lado a lado). */
    anchoMaximo: tablet ? 720 : 560,
    /** Columnas de la cuadrícula del menú. */
    columnasMenu: tablet ? 3 : 2,
    /** Columnas de las tarjetas pequeñas (riesgos, accesos rápidos). */
    columnasChicas: compacto ? 2 : tablet ? 4 : 4,
    /** Tamaño base del título de pantalla. */
    tituloPantalla: compacto ? 22 : tablet ? 30 : 26,
  };
}
