/**
 * Perfil de la app según el ROL y el ÁREA del usuario (HU-28): define el menú.
 *   - jefatura .... usuarios con rol Supervisor o Administrador de CUALQUIER área excepto Servicio Técnico (menú de Jefatura, HU-28).
 *   - campo ....... todos los demás: técnicos, metrólogos y usuarios comunes, y el personal de Servicio Técnico (menú de campo, HU-02).
 * No se usa el cargo porque en la ficha de usuario es texto libre ("Jefe de Operaciones", "Metrólogo"…): el rol y el área sí son
 * catálogos. Servicio Técnico queda fuera de Jefatura por decisión del negocio; para cambiarlo, quitar 'servicio_tecnico' de
 * AREAS_SIN_JEFATURA (y el mismo cambio en SP_ObtenerMenuJefaturaMovil).
 * La app solo decide qué pantalla mostrar; el back vuelve a validar el rol y el área en cada consulta de Jefatura.
 */
export type PerfilApp = 'campo' | 'jefatura';

/** Datos de la sesión que definen el perfil (los envía el login). */
export interface DatosPerfil {
  area?: string | null;
  rolSistema?: string | null;
}

const ROLES_CON_JEFATURA = new Set(['supervisor', 'administrador']);
const AREAS_SIN_JEFATURA = new Set(['', 'servicio_tecnico']);

/** Código del área del usuario si tiene menú de Jefatura (Metrología, Operaciones, TI, Gerencia…), o null. */
export function areaDeJefatura(usuario: DatosPerfil | null | undefined): string | null {
  const rol = (usuario?.rolSistema ?? '').trim().toLowerCase();
  const area = (usuario?.area ?? '').trim().toLowerCase();
  return ROLES_CON_JEFATURA.has(rol) && !AREAS_SIN_JEFATURA.has(area) ? area : null;
}

export function perfilDe(usuario: DatosPerfil | null | undefined): PerfilApp {
  return areaDeJefatura(usuario) ? 'jefatura' : 'campo';
}
