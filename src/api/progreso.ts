import { borrar, guardar, leer } from '@/sesion/almacenamiento';
import { sistemaArchivos } from './archivosLocales';

/**
 * HU-21 — Progreso guardado: el avance de lo que el técnico está haciendo se guarda SOLO en el teléfono (no usa el servidor).
 *
 * Cada trabajo sin terminar es un registro (`tw.progreso.<idUsuario>.<id>`) más un índice por técnico:
 *  - servicio: «Trabajo en el equipo» de un servicio programado (se guarda dónde se quedó y el avance; el trabajo en sí ya está en el servidor,
 *    y un servicio NO se descarta desde aquí);
 *  - gasto:    borrador de «Rendir gasto / Nueva solicitud de gasto» (se descarta);
 *  - ingreso:  borrador del «Equipo nuevo» (se descarta).
 * Al enviar o terminar, el registro se borra y sale de la lista. Es por técnico: otro usuario del mismo teléfono no ve el avance ajeno.
 */
export type TipoProgreso = 'servicio' | 'gasto' | 'ingreso';

export interface Progreso {
  id: string;
  tipo: TipoProgreso;
  /** Línea principal de la tarjeta (equipo, concepto y monto…). */
  titulo: string;
  /** Línea secundaria (OS · cliente). */
  subtitulo: string;
  /** Paso donde se quedó (p. ej. «Ensayos y Calibración», «4 de 6 campos completos»). */
  paso: string;
  /** 0–100. */
  porcentaje: number;
  /** ISO (UTC) del último guardado. */
  guardadoEn: string;
  /** Pantalla a la que lleva «Continuar». */
  ruta: string;
  params: Record<string, string>;
  /** Solo los borradores se pueden descartar. */
  descartable: boolean;
  /** Datos del borrador para rellenar el formulario al continuar. */
  borrador?: unknown;
}

const indiceDe = (u: number) => `tw.progreso.${u}`;
const claveDe = (u: number, id: string) => `tw.progreso.${u}.${id.replace(/[^A-Za-z0-9._-]/g, '_')}`;
const escuchas = new Set<() => void>();
const avisar = () => escuchas.forEach((f) => f());

/** Se llama cuando cambia el progreso guardado (para refrescar el contador del menú y la lista). */
export function suscribirProgreso(f: () => void): () => void {
  escuchas.add(f);
  return () => {
    escuchas.delete(f);
  };
}

async function leerIndice(u: number): Promise<string[]> {
  try {
    const crudo = await leer(indiceDe(u));
    const ids = crudo ? (JSON.parse(crudo) as unknown) : [];
    return Array.isArray(ids) ? ids.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

/** Guarda (o actualiza) el progreso. Si no cambió nada relevante no se reescribe la hora. */
export async function guardarProgreso(idUsuario: number, p: Omit<Progreso, 'guardadoEn'>): Promise<void> {
  if (!idUsuario) return;
  const ahora = new Date().toISOString();
  await guardar(claveDe(idUsuario, p.id), JSON.stringify({ ...p, guardadoEn: ahora } satisfies Progreso));
  const ids = await leerIndice(idUsuario);
  if (!ids.includes(p.id)) await guardar(indiceDe(idUsuario), JSON.stringify([...ids, p.id]));
  avisar();
}

export async function quitarProgreso(idUsuario: number, id: string): Promise<void> {
  if (!idUsuario) return;
  await borrar(claveDe(idUsuario, id));
  const ids = await leerIndice(idUsuario);
  if (ids.includes(id)) await guardar(indiceDe(idUsuario), JSON.stringify(ids.filter((x) => x !== id)));
  avisar();
}

export async function obtenerProgreso(idUsuario: number, id: string): Promise<Progreso | null> {
  try {
    const crudo = await leer(claveDe(idUsuario, id));
    return crudo ? (JSON.parse(crudo) as Progreso) : null;
  } catch {
    return null;
  }
}

/** De las fotos del borrador, las que todavía existen en el teléfono (la caché de la cámara se puede limpiar). */
export async function fotosVigentes(uris: string[]): Promise<string[]> {
  const fs = sistemaArchivos();
  if (!fs) return uris;
  return uris.filter((u) => {
    try {
      return u.startsWith('data:') || new fs.File(u).exists;
    } catch {
      return false;
    }
  });
}

/** Todo el progreso del técnico, lo último guardado primero. */
export async function listarProgreso(idUsuario: number): Promise<Progreso[]> {
  const lista: Progreso[] = [];
  for (const id of await leerIndice(idUsuario)) {
    const p = await obtenerProgreso(idUsuario, id);
    if (p) lista.push(p);
  }
  return lista.sort((a, b) => b.guardadoEn.localeCompare(a.guardadoEn));
}
