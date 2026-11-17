import { entorno } from '@/config/entorno';
import type { EstadoIngreso } from '@/utilidades/ingresoEquipos';
import { agregarArchivo } from './archivosLocales';
import { solicitar } from './cliente';

/**
 * HU-22 — Ingreso de equipos (OS).
 * Backend: GET api/movil/servicios/{idOs}/ingresos · POST api/movil/servicios/{idOs}/ingresos/equipos/{idOsEquipo} (multipart: estado, observacion, fotos).
 * Tablas: os_equipo_ingreso y os_equipo_ingreso_foto. La lista de equipos, la búsqueda, el QR y el equipo nuevo son los de HU-07 (api/ruta.ts).
 */
export interface IngresoEquipo {
  idOsEquipo: number;
  estadoIngreso: EstadoIngreso;
  observacion: string | null;
  /** "yyyy-MM-ddTHH:mm:ss" (hora de Lima). */
  ingresadoEn: string | null;
  fotos: number;
}

export interface NuevoIngreso {
  estado: EstadoIngreso;
  observacion: string;
  /** Archivos de la cámara de la app (nunca de la galería). Solo con observaciones o inoperativo. */
  fotos: string[];
}

const ruta = (idOs: number) => `/api/movil/servicios/${encodeURIComponent(String(idOs))}/ingresos`;

/** Memoria del modo demo (EXPO_PUBLIC_USE_MOCK): se pierde al cerrar la app. */
const demo = new Map<string, IngresoEquipo>();

export async function obtenerIngresos(token: string, idOs: number): Promise<IngresoEquipo[]> {
  if (entorno.usarMock) return [...demo.entries()].filter(([k]) => k.startsWith(`${idOs}:`)).map(([, v]) => v);
  const r = await solicitar<{ ingresos: IngresoEquipo[] }>(ruta(idOs), { token });
  return r.datos?.ingresos ?? [];
}

export interface EquipoAgregado {
  idOsEquipo: number;
  idEquipo: number;
  codigoTw: string;
  marca?: string | null;
  modelo?: string | null;
  numSerie?: string | null;
  codigoCliente?: string | null;
  ubicacion?: string | null;
  /** Objetivo cuyo equipo ocupa el escaneado (no se crea un objetivo nuevo); null si se agregó como objetivo nuevo. */
  reemplazaIdOsEquipo?: number | null;
  reemplazaCodigoTw?: string | null;
  reemplazaNombre?: string | null;
}

/**
 * Escanear el QR de un equipo que no está en la lista de la OS pero sí registrado para el mismo cliente: se agrega a la OS.
 * Si no existe para el cliente el servidor responde que se registre como equipo nuevo (NEW).
 */
export async function agregarEquipoExistente(token: string, idOs: number, codigo: string, idOsEquipoObjetivo?: number): Promise<EquipoAgregado> {
  if (entorno.usarMock) throw new Error('El código no corresponde a ningún equipo registrado de este cliente. Regístralo como equipo nuevo (NEW).');
  const r = await solicitar<EquipoAgregado>(`${ruta(idOs)}/agregar?codigo=${encodeURIComponent(codigo.slice(0, 300))}${idOsEquipoObjetivo ? `&objetivo=${idOsEquipoObjetivo}` : ''}`, { token, metodo: 'POST' });
  return r.datos!;
}

/**
 * Verifica el código escaneado SIN agregar el equipo a la OS: devuelve sus datos para que el técnico confirme.
 * Falla con el mismo mensaje del servidor si no se puede agregar (otro cliente, inactivo, pendiente de validar, no registrado…).
 */
export async function verificarEquipoExistente(token: string, idOs: number, codigo: string, idOsEquipoObjetivo?: number): Promise<EquipoAgregado> {
  if (entorno.usarMock) throw new Error('El código no corresponde a ningún equipo registrado de este cliente. Regístralo como equipo nuevo (NEW).');
  const r = await solicitar<EquipoAgregado>(`${ruta(idOs)}/agregar?codigo=${encodeURIComponent(codigo.slice(0, 300))}&verificar=true${idOsEquipoObjetivo ? `&objetivo=${idOsEquipoObjetivo}` : ''}`, { token, metodo: 'POST' });
  return r.datos!;
}

export async function registrarIngreso(
  token: string,
  idOs: number,
  idOsEquipo: number,
  d: NuevoIngreso,
): Promise<{ mensaje: string; datos: IngresoEquipo | null }> {
  if (entorno.usarMock) {
    const i: IngresoEquipo = { idOsEquipo, estadoIngreso: d.estado, observacion: d.observacion || null, ingresadoEn: new Date().toISOString().slice(0, 19), fotos: d.fotos.length };
    demo.set(`${idOs}:${idOsEquipo}`, i);
    return { mensaje: 'Equipo registrado.', datos: i };
  }
  const form = new FormData();
  form.append('estado', d.estado);
  form.append('observacion', d.observacion.trim());
  for (let n = 0; n < d.fotos.length; n++) await agregarArchivo(form, 'fotos', d.fotos[n], `evidencia-${n + 1}.jpg`, 'image/jpeg');
  const r = await solicitar<{ idIngreso: number; idOsEquipo: number; estadoIngreso: EstadoIngreso; ingresadoEn: string | null; fotos: number }>(
    `${ruta(idOs)}/equipos/${encodeURIComponent(String(idOsEquipo))}`,
    { token, metodo: 'POST', cuerpo: form },
  );
  const x = r.datos;
  return {
    mensaje: r.mensaje,
    datos: x ? { idOsEquipo: x.idOsEquipo, estadoIngreso: x.estadoIngreso, observacion: d.observacion.trim() || null, ingresadoEn: x.ingresadoEn, fotos: x.fotos } : null,
  };
}
