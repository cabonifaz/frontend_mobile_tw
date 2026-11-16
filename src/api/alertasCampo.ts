import { agregarArchivo } from './archivosLocales';
import { solicitar } from './cliente';

/**
 * HU-32 — Alertas y apoyo en campo (Jefe de Área).
 * Backend: GET api/movil/alertas/{idNotificacion} · POST …/{idNotificacion}/acciones · GET api/movil/alertas/servicios/{idOs}/tecnicos ·
 *          POST …/servicios/{idOs}/reasignar · POST …/servicios/{idOs}/incidencias (multipart).
 * Se entra desde la notificación «Ensayo con error crítico» (la genera el «Llamar» de HU-10).
 */
export interface LecturaAlerta {
  /** Solo excentricidad: número de la carga de prueba. */
  grupo: number | null;
  orden: number;
  /** L: carga. */
  carga: number | null;
  /** I: indicación. */
  indicacion: number | null;
  /** E: error (I − L). */
  error: number | null;
  /** EMP: error máximo permitido. */
  emp: number | null;
  resultado: string | null;
  critico: boolean;
}

export interface AlertaCampo {
  idNotificacion: number;
  titulo: string;
  cuerpo: string;
  creadaEn: string | null;
  haceMin: number;
  idOs: number;
  numeroOs: string;
  cliente: string | null;
  sede: string | null;
  idTecnico: number | null;
  tecnico: string | null;
  telefono: string | null;
  idOsEquipo: number | null;
  equipoCodigo: string | null;
  equipoDescripcion: string | null;
  equipoUbicacion: string | null;
  pesaje: LecturaAlerta[];
  excentricidad: LecturaAlerta[];
}

export type AccionAlerta = 'llamar' | 'repetir' | 'ajuste';

export interface ContactoAlerta {
  nombre: string;
  telefono: string | null;
}

export interface TecnicoReasignacion {
  idUsuario: number;
  nombre: string;
  iniciales: string;
  distanciaKm: number | null;
  llegaMin: number | null;
  serviciosHoy: number;
  cargaPct: number;
  /** conforme | por_vencer | incompleto | pendiente | bloqueado */
  ssoma: string;
  disponible: boolean;
  motivoNo: string | null;
}

export interface ReasignacionOs {
  idOs: number;
  numeroOs: string;
  cliente: string | null;
  idTecnicoActual: number | null;
  tecnicoActual: string | null;
  plantaLatitud: number | null;
  plantaLongitud: number | null;
  tecnicos: TecnicoReasignacion[];
}

export type Severidad = 'baja' | 'media' | 'alta';
export type ImpactoIncidencia = 'detiene' | 'retrasa';

export interface NuevaIncidencia {
  idTipo: number;
  severidad: Severidad;
  impacto: ImpactoIncidencia;
  descripcion: string;
  escalar: boolean;
  /** Foto de la cámara de la app (opcional; nunca de la galería). */
  fotoUri: string | null;
}

/** TIPO_INCIDENCIA_OPERATIVA (catálogo de la intranet, ids fijos). */
export const TIPOS_INCIDENCIA: { id: number; texto: string }[] = [
  { id: 1, texto: 'Accidente de trabajo' },
  { id: 2, texto: 'Falla en equipo de TW' },
  { id: 3, texto: 'Acceso denegado en planta' },
  { id: 4, texto: 'Emergencia en planta del cliente' },
  { id: 5, texto: 'Conflicto con personal del cliente' },
  { id: 6, texto: 'Otro tipo' },
];

const base = '/api/movil/alertas';

export async function obtenerAlerta(token: string, idNotificacion: number): Promise<AlertaCampo> {
  return (await solicitar<AlertaCampo>(`${base}/${encodeURIComponent(String(idNotificacion))}`, { token })).datos!;
}

export async function ejecutarAccionAlerta(
  token: string,
  idNotificacion: number,
  accion: AccionAlerta,
  mensaje = '',
): Promise<{ mensaje: string; contacto: ContactoAlerta | null }> {
  const r = await solicitar<ContactoAlerta>(`${base}/${encodeURIComponent(String(idNotificacion))}/acciones`, {
    token,
    metodo: 'POST',
    cuerpo: { accion, mensaje: mensaje.trim() || null },
  });
  return { mensaje: r.mensaje, contacto: r.datos ?? null };
}

export async function obtenerTecnicosReasignacion(token: string, idOs: number): Promise<ReasignacionOs> {
  return (await solicitar<ReasignacionOs>(`${base}/servicios/${encodeURIComponent(String(idOs))}/tecnicos`, { token })).datos!;
}

export async function reasignarTecnico(token: string, idOs: number, idTecnico: number): Promise<string> {
  const r = await solicitar<unknown>(`${base}/servicios/${encodeURIComponent(String(idOs))}/reasignar`, { token, metodo: 'POST', cuerpo: { idTecnico } });
  return r.mensaje;
}

export async function registrarIncidencia(token: string, idOs: number, d: NuevaIncidencia): Promise<string> {
  const form = new FormData();
  form.append('idTipo', String(d.idTipo));
  form.append('severidad', d.severidad);
  form.append('impacto', d.impacto);
  form.append('descripcion', d.descripcion.trim());
  form.append('escalar', d.escalar ? 'true' : 'false');
  if (d.fotoUri) await agregarArchivo(form, 'foto', d.fotoUri, 'incidencia.jpg', 'image/jpeg');
  const r = await solicitar<unknown>(`${base}/servicios/${encodeURIComponent(String(idOs))}/incidencias`, { token, metodo: 'POST', cuerpo: form });
  return r.mensaje;
}
