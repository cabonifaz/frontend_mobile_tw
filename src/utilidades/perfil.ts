/**
 * Perfil de la app según el CARGO, el ROL y el ÁREA del usuario (HU-28): define el menú.
 *   - jefatura .... los jefes de área (cargo "Jefe de …": Servicio Técnico, Metrología, Operaciones…) y los usuarios con rol
 *                   Supervisor o Administrador de cualquier área. Todos ven UN SOLO Menú de Jefatura; lo que no es de su área sale
 *                   bloqueado (candado + "SOLO <ÁREA>").
 *   - campo ....... todos los demás: técnicos, metrólogos y usuarios comunes (menú de campo, HU-02).
 * El cargo es un código del catálogo CARGO_USUARIO ('jefe_servicio_tecnico', 'jefe_metrologia'…), igual que el rol y el área.
 * El Jefe de Servicio Técnico es quien da el visto bueno de salida de los técnicos: por eso entra por Jefatura (Aprobaciones).
 * La app solo decide qué pantalla mostrar; el back vuelve a validar el cargo, el rol y el área en cada consulta de Jefatura
 * (misma regla en SP_ObtenerMenuJefaturaMovil).
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
  if (esJefe) return area || AREA_DE_CARGO[cargo] || cargo.slice(PREFIJO_CARGO_JEFE.length);
  return ROLES_CON_JEFATURA.has(rol) && area ? area : null;
}

export function perfilDe(usuario: DatosPerfil | null | undefined): PerfilApp {
  return areaDeJefatura(usuario) ? 'jefatura' : 'campo';
}
