import { entorno } from '@/config/entorno';
import { solicitar } from './cliente';
import { mockCatalogos } from './mock';

/**
 * Catálogos de tabla_maestra (áreas, cargos, tipos de servicio, motivos, etc.).
 * Backend: GET api/maestros/catalogos/{nombre} → SP_ObtenerCatalogo (CatalogoItemDto).
 * Nombres disponibles: columna Descripcion de tabla_maestra (AREA_USUARIO, CARGO_USUARIO,
 * TIPO_SERVICIO, TIPO_EVENTO_CAMPO, TIPO_EVIDENCIA, MOTIVO_DEMORA_RUTA, ...).
 */
export interface ItemCatalogo {
  id: number;
  nombre: string;
  codigo: string | null;
  num2?: number | null;
  string3?: string | null;
}

/** Los catálogos cambian poco: se guardan en memoria mientras la app está abierta. */
const cache = new Map<string, ItemCatalogo[]>();

export async function obtenerCatalogo(token: string, nombre: string, forzar = false): Promise<ItemCatalogo[]> {
  const clave = nombre.toUpperCase();
  if (!forzar && cache.has(clave)) return cache.get(clave)!;

  const items = entorno.usarMock
    ? await mockCatalogos.obtener(clave)
    : (await solicitar<ItemCatalogo[]>(`/api/maestros/catalogos/${encodeURIComponent(clave)}`, { token })).datos ?? [];

  cache.set(clave, items);
  return items;
}

/** Traduce un código (p. ej. "servicio_tecnico") al nombre del catálogo ("Servicio Técnico"). */
export function nombreDeCodigo(items: ItemCatalogo[] | null | undefined, codigo: string | null | undefined): string | null {
  if (!codigo) return null;
  const item = items?.find((i) => (i.codigo ?? '').toLowerCase() === codigo.toLowerCase());
  return item?.nombre ?? null;
}

export function limpiarCacheCatalogos() {
  cache.clear();
}
