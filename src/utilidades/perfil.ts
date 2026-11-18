/**
 * Perfil de la app según el ÁREA, el ROL y el CARGO del usuario (HU-28): define el menú.
 *   - jefatura .... un solo Menú de Jefatura; lo que no es de su área sale bloqueado (candado + "SOLO <ÁREA>"). Entran:
 *       · ÁREA Servicio Técnico o Metrología: lo decide el ROL PRINCIPAL de la plataforma →
 *           Administrador o Supervisor = Jefatura de esa área;  Usuario o Visor = menú de campo (técnico que hace las OS, o las OM en Metrología).
 *         El cargo NO cambia esto (aunque diga "Jefe de …"): la regla es del rol.
 *       · TODAS LAS DEMÁS ÁREAS (Gerencia, Operaciones, Administración, TI, SSOMA, Calidad, Comercial…): cualquier rol (Administrador, Supervisor,
 *         Usuario o Visor) va a Jefatura, y ve los servicios (OS / OM) y técnicos de todas las áreas para darles seguimiento.
 *   - campo ....... los demás: técnicos y metrólogos (Usuario / Visor de Servicio Técnico o Metrología) y quien no tiene área (menú de campo, HU-02).
 * El cargo es un código del catálogo CARGO_USUARIO ('jefe_servicio_tecnico', 'jefe_metrologia'…), igual que el rol y el área; sirve para deducir el
 * área cuando la ficha del usuario no la trae.
 * El Jefe de Servicio Técnico es quien da el visto bueno de salida de los técnicos: por eso entra por Jefatura (Aprobaciones).
 * La app solo decide qué pantalla mostrar; el back vuelve a validar en cada consulta de Jefatura (misma regla en SP_ResolverJefaturaMovil).
 */
export type PerfilApp = 'campo' | 'jefatura';

/** Datos de la sesión que definen el perfil (los envía el login). */
export interface DatosPerfil {
  area?: string | null;
  rolSistema?: string | null;
  cargo?: string | null;
}

const ROLES_CON_JEFATURA = new Set(['supervisor', 'administrador']);
const PREFIJO_CARGO_JEFE = 'jefe_';
/** Áreas donde el ROL decide si es Jefatura (Administrador / Supervisor) o campo (Usuario / Visor). */
const AREAS_QUE_DECIDE_EL_ROL = new Set(['servicio_tecnico', 'metrologia']);
/** Áreas que se deducen del cargo cuando la ficha del usuario no trae el área. */
const AREA_DE_CARGO: Record<string, string> = {
  jefe_servicio_tecnico: 'servicio_tecnico',
  jefe_metrologia: 'metrologia',
  jefe_operaciones: 'operaciones',
};

/** Código del área del usuario si tiene menú de Jefatura (Servicio Técnico, Metrología, Operaciones, TI, Gerencia…), o null. */
export function areaDeJefatura(usuario: DatosPerfil | null | undefined): string | null {
  const rol = (usuario?.rolSistema ?? '').trim().toLowerCase();
  const area = (usuario?.area ?? '').trim().toLowerCase();
  const cargo = (usuario?.cargo ?? '').trim().toLowerCase();

  const esJefe = cargo.startsWith(PREFIJO_CARGO_JEFE);
  const areaDelUsuario = esJefe ? area || AREA_DE_CARGO[cargo] || cargo.slice(PREFIJO_CARGO_JEFE.length) : area;
  if (!areaDelUsuario) return null;

  // Servicio Técnico y Metrología: manda el rol principal (Administrador / Supervisor = Jefatura; Usuario / Visor = campo)
  if (AREAS_QUE_DECIDE_EL_ROL.has(areaDelUsuario)) return ROLES_CON_JEFATURA.has(rol) ? areaDelUsuario : null;

  // Las demás áreas: cualquier rol va a Jefatura
  return areaDelUsuario;
}

export function perfilDe(usuario: DatosPerfil | null | undefined): PerfilApp {
  return areaDeJefatura(usuario) ? 'jefatura' : 'campo';
}
