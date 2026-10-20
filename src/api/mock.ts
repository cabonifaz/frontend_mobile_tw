import { ErrorApi } from './cliente';
import type { DatosIngreso, SesionIniciada } from './autenticacion';

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
        cargo: 'Técnico de Campo',
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
