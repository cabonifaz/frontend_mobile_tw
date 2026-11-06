/**
 * Perfil de la app según el ROL y el ÁREA del usuario (HU-28): define el menú.
 *   - campo ....... técnicos de Servicio Técnico y Metrología, el Jefe de Servicio Técnico y cualquier otro usuario (menú de campo, HU-02).
 *   - jefatura .... el supervisor del área Metrología = Jefe de Metrología (menú de Jefatura, HU-28).
 * No se usa el cargo porque en la ficha de usuario es texto libre ("Jefe de Metrología", "Metrólogo"…): el rol (Supervisor) y el
 * área sí son catálogos. Otras áreas se suman agregándolas a AREA_CON_JEFATURA (y su lista de tarjetas en modulosJefatura).
 * La app solo decide qué pantalla mostrar; el back vuelve a validar el rol y el área en cada consulta de Jefatura.
 */
export type PerfilApp = 'campo' | 'jefatura';
export type AreaJefatura = 'metrologia';

/** Datos de la sesión que definen el perfil (los envía el login). */
export interface DatosPerfil {
  area?: string | null;
  rolSistema?: string | null;
}

/** Áreas cuyo supervisor tiene menú de Jefatura. Map y no un objeto: "constructor" no debe resolver a una propiedad heredada. */
const AREA_CON_JEFATURA = new Map<string, AreaJefatura>([['metrologia', 'metrologia']]);

/** Área que dirige el usuario (si es el supervisor de un área con Jefatura), o null. */
export function areaDeJefatura(usuario: DatosPerfil | null | undefined): AreaJefatura | null {
  if ((usuario?.rolSistema ?? '').trim().toLowerCase() !== 'supervisor') return null;
  return AREA_CON_JEFATURA.get((usuario?.area ?? '').trim().toLowerCase()) ?? null;
}

export function perfilDe(usuario: DatosPerfil | null | undefined): PerfilApp {
  return areaDeJefatura(usuario) ? 'jefatura' : 'campo';
}
