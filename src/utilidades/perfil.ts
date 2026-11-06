/**
 * Perfil de la app según el cargo del usuario (HU-28): el cargo define el menú.
 *   - campo ....... técnicos de Servicio Técnico y Metrología, y el Jefe de Servicio Técnico (menú de campo, HU-02).
 *   - jefatura .... Jefe de Metrología (menú de Jefatura, HU-28). Otras áreas se suman agregando su cargo a AREA_POR_CARGO
 *                   (y su lista de tarjetas en modulosJefatura).
 * La app solo decide qué pantalla mostrar; el back vuelve a validar el cargo en cada consulta de Jefatura.
 */
export type PerfilApp = 'campo' | 'jefatura';
export type AreaJefatura = 'metrologia';

// Map y no un objeto: un cargo como "constructor" no debe resolver a una propiedad heredada.
const AREA_POR_CARGO = new Map<string, AreaJefatura>([['jefe_metrologia', 'metrologia']]);

/** Área que dirige el cargo, o null si no es un cargo de Jefatura. */
export function areaDeJefatura(cargo: string | null | undefined): AreaJefatura | null {
  return AREA_POR_CARGO.get((cargo ?? '').trim().toLowerCase()) ?? null;
}

export function perfilDe(cargo: string | null | undefined): PerfilApp {
  return areaDeJefatura(cargo) ? 'jefatura' : 'campo';
}
