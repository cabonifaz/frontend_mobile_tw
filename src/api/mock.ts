import { ErrorApi } from './cliente';
import type { DatosIngreso, SesionIniciada } from './autenticacion';
import type { ItemCatalogo } from './catalogos';
import type { MisDatos } from './usuario';
import type { ResumenMenu } from './menu';

/**
 * Modo demo (EXPO_PUBLIC_USE_MOCK=true): la app funciona sin backend para revisar
 * pantallas en un APK. Reproduce las reglas reales del login:
 *   - usuario de prueba: tecnico.demo / Demo1234
 *   - usuario con cambio obligatorio: tecnico.nuevo / Temporal1
 *   - con correo: se rechaza (solo usuario)
 */
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

const usuarios: Record<string, { contrasena: string; nombre: string; apellido: string; forzar: boolean }> = {
  'tecnico.demo': { contrasena: 'Demo1234', nombre: 'Carlos', apellido: 'Quispe', forzar: false },
  'tecnico.nuevo': { contrasena: 'Temporal1', nombre: 'Lucía', apellido: 'Huamán', forzar: true },
};

export const mockAutenticacion = {
  async iniciarSesion(datos: DatosIngreso): Promise<SesionIniciada> {
    await esperar(700);
    const usuario = datos.usuario.trim().toLowerCase();
    if (usuario.includes('@')) {
      throw new ErrorApi('Ingresa con tu usuario, no con tu correo. Si no lo tienes, pídeselo a tu jefe.', 401, 1);
    }
    const u = usuarios[usuario];
    if (!u || u.contrasena !== datos.contrasena) {
      throw new ErrorApi('Usuario o contraseña incorrectos.', 401, 1);
    }
    return {
      token: `mock-${usuario}-${Date.now()}`,
      expiraEn: new Date(Date.now() + 12 * 3600 * 1000),
      usuario: {
        idUsuario: usuario === 'tecnico.demo' ? 101 : 102,
        usuario,
        nombre: u.nombre,
        apellido: u.apellido,
        cargo: 'tecnico_campo',
        area: 'servicio_tecnico',
        rolSistema: 'usuario',
        forzarCambioContrasena: u.forzar,
      },
    };
  },

  async cerrarSesion(): Promise<void> {
    await esperar(300);
  },

  async cambiarContrasena(actual: string, nueva: string): Promise<string> {
    await esperar(600);
    if (actual === nueva) throw new ErrorApi('La nueva contraseña debe ser distinta de la actual.', 400, 1);
    return 'Contraseña actualizada correctamente.';
  },
};

/** Usuario de la sesión demo (mismos campos que GET api/autenticacion/me). */
export const mockUsuario = {
  async misDatos(): Promise<MisDatos> {
    await esperar(400);
    return {
      idUsuario: 101,
      nombre: 'Carlos',
      apellido: 'Quispe',
      correo: 'cquispe@totalweight.com',
      rolSistema: 'usuario',
      rolSistemaLabel: 'Usuario',
      area: 'servicio_tecnico',
      forzarCambioContrasena: false,
    };
  },
};

/** Catálogos de ejemplo, copiados de tabla_maestra (total_weight_stg). */
const catalogos: Record<string, ItemCatalogo[]> = {
  AREA_USUARIO: [
    { id: 1, nombre: 'Gerencia', codigo: 'gerencia' },
    { id: 2, nombre: 'Comercial', codigo: 'comercial' },
    { id: 3, nombre: 'Metrología', codigo: 'metrologia' },
    { id: 4, nombre: 'Operaciones', codigo: 'operaciones' },
    { id: 5, nombre: 'Servicio Técnico', codigo: 'servicio_tecnico' },
    { id: 6, nombre: 'Administración', codigo: 'administracion' },
    { id: 7, nombre: 'SSOMA', codigo: 'ssoma' },
    { id: 8, nombre: 'TI', codigo: 'ti' },
  ],
  CARGO_USUARIO: [
    { id: 6, nombre: 'Metrólogo', codigo: 'metrologo' },
    { id: 7, nombre: 'Metrólogo Jr.', codigo: 'metrologo_jr' },
    { id: 10, nombre: 'Jefe de Servicio Técnico', codigo: 'jefe_servicio_tecnico' },
    { id: 11, nombre: 'Técnico de Campo', codigo: 'tecnico_campo' },
    { id: 12, nombre: 'Técnico de Campo Jr.', codigo: 'tecnico_campo_jr' },
  ],
};

export const mockCatalogos = {
  async obtener(nombre: string): Promise<ItemCatalogo[]> {
    await esperar(300);
    const items = catalogos[nombre];
    if (!items) throw new ErrorApi(`Catálogo no encontrado: ${nombre}`, 404, 1);
    return items;
  },
};

/** Menú principal (mismos campos que GET api/movil/menu/resumen). */
export const mockMenu = {
  async resumen(): Promise<ResumenMenu> {
    await esperar(500);
    const hoy = new Date();
    const fecha = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;
    return {
      serviciosAsignados: 8,
      serviciosHoy: 3,
      proximoServicio: {
        idOs: 1,
        numero: 'OS-2026-0001',
        cliente: 'Las Bambas',
        sede: 'Planta Norte',
        distrito: 'Challhuahuacho',
        tipoServicio: 'Calibración',
        fechaEjecucion: fecha,
        horaInicio: '09:00',
        estado: 'programada',
      },
    };
  },
};
