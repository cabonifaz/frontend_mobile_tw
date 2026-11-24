import { Platform } from 'react-native';
import { entorno } from '@/config/entorno';
import { leerEstadoConexion } from '@/conexion/estadoConexion';
import { obtenerCatalogo } from './catalogos';
import { ErrorApi } from './cliente';
import { obtenerSolicitudConRespaldo, obtenerTicketsConRespaldo } from './correlativos';
import { obtenerEnsayosConRespaldo } from './ensayos';
import { obtenerEvidenciasConRespaldo } from './evidencias';
import { obtenerCabeceraInformeConRespaldo } from './informe';
import { obtenerJornadaConRespaldo } from './jornada';
import { obtenerResumenMenu } from './menu';
import { obtenerBiblioteca, sincronizarProcedimientos } from './procedimientos';
import { conRespaldo, leerRespaldo } from './respaldo';
import { obtenerDemorasConRespaldo, obtenerLlegadaConRespaldo, obtenerObjetivosConRespaldo, obtenerOpcionesEquipoNuevoConRespaldo, type Objetivos } from './ruta';
import { obtenerChecklistSalidaConRespaldo, obtenerDetalleServicioConRespaldo, obtenerServiciosProgramadosConRespaldo, type ServicioProgramado } from './servicios';
import { obtenerTrabajoEquipoConRespaldo } from './trabajo';
import { fechaLimaHoy } from '@/utilidades/agenda';

/**
 * HU-18 — Descarga del día: al iniciar la jornada (primera vez que se abre la app con señal cada día, por usuario) la app baja y guarda en el teléfono lo que el técnico
 * necesita para trabajar sin señal: la agenda, el detalle y el checklist (formatos) de cada OS de hoy o en curso, la llegada, las demoras, los objetivos con sus equipos y, por cada
 * equipo, el trabajo, los ensayos, la cabecera del informe, las evidencias y el correlativo/certificado reservado; además los catálogos, la jornada, el resumen del menú y los
 * procedimientos. NO crea endpoints: solo vuelve a pedir lo que las pantallas ya piden y lo deja en el respaldo local (`conRespaldo`, claves por usuario, se borra al cerrar sesión).
 *  - Nunca lanza error. Sin conexión no hace nada (se vuelve a intentar al volver la señal o al abrir la app). Un dato que el servidor niega (p. ej. el equipo aún no iniciado) se omite.
 *  - Se descarga POR ADELANTADO (`previo`): la lista de equipos, el trabajo, la cabecera del informe y las evidencias se piden aunque el técnico aún no haya llegado ni iniciado el equipo
 *    (el servidor las entrega con los botones bloqueados y la app los habilita con lo que el técnico guarde sin señal: `api/estadoLocal.ts`). Así, al llegar a una planta sin señal ya está todo.
 *  - Entran las órdenes de hoy, las que ya están en curso y las de los próximos 7 días. Si la agenda cambia (se asigna, reprograma o cambia de estado una orden) se vuelve a descargar:
 *    se revisa al abrir la app, al volver la señal y cada 15 min con la app abierta (`firma` del marcador).
 *  - Topes: hasta 12 OS y 24 equipos, de 3 en 3 peticiones, para no gastar datos ni batería.
 *  - Guarda un marcador (`descargaDelDia`) con la fecha y la hora; el Menú muestra «datos del día descargados HH:mm». Si quedaron datos sin bajar se reintenta pasados 15 min.
 */
export interface MarcadorDescarga {
  /** "yyyy-MM-dd" (Lima) del día descargado. */
  fecha: string;
  /** "HH:mm" (hora del teléfono) en que terminó. */
  hora: string;
  ordenes: number;
  equipos: number;
  /** Peticiones que el servidor negó o fallaron (0 = todo bajó). */
  omitidos: number;
  /** Cuándo terminó (ms), para decidir el reintento. */
  terminoEn: number;
  /** Resumen de la agenda descargada (órdenes, fechas, horas y estados): si cambia, se vuelve a descargar. */
  firma?: string;
}

const CLAVE_MARCADOR = 'descargaDelDia';
export const TOPE_ORDENES = 12;
export const TOPE_EQUIPOS = 24;
const PARALELO = 3;
const REINTENTO_OMITIDOS_MS = 15 * 60_000;
/** La OS se descarga si es de hoy, de los próximos días o ya está en curso. */
const ESTADOS_EN_CURSO = ['en_ruta', 'en_ejecucion', 'pausada'];
/** Cuántos días hacia adelante se descargan las órdenes programadas. */
export const DIAS_ADELANTE = 7;

/** "yyyy-MM-dd" sumando días a una fecha "yyyy-MM-dd" (calendario, sin zona). */
export function sumarDias(fecha: string, dias: number): string {
  const t = Date.parse(`${fecha}T00:00:00Z`);
  return Number.isNaN(t) ? fecha : new Date(t + dias * 86_400_000).toISOString().slice(0, 10);
}

/** Resumen de las órdenes que se descargan: si cambia (nueva orden, otra fecha u hora, otro estado, otros objetivos) hay que volver a descargar. */
export function firmaDeAgenda(ordenes: readonly ServicioProgramado[]): string {
  return ordenes.map((o) => `${o.idOs}:${o.fechaEjecucion ?? ''}:${o.horaInicio ?? ''}:${o.estadoOs}:${o.objetivosTotal}`).join('|');
}

const escuchas = new Set<() => void>();
let enCurso: Promise<MarcadorDescarga | null> | null = null;

/** Se llama al terminar una descarga (el Menú vuelve a leer la hora). Devuelve la función para dejar de escuchar. */
export function suscribirDescarga(f: () => void): () => void {
  escuchas.add(f);
  return () => {
    escuchas.delete(f);
  };
}

/** Lo último que se descargó para este técnico (null si nunca). */
export function leerMarcadorDescarga(idUsuario: number): Promise<MarcadorDescarga | null> {
  return leerRespaldo<MarcadorDescarga>(idUsuario, CLAVE_MARCADOR);
}

/**
 * Órdenes que se bajan: las que ya están en curso (en ruta, en ejecución o pausadas), las de hoy y las de los próximos 7 días, por fecha y hora de inicio, hasta el tope.
 * Las anuladas, bloqueadas o ya terminadas no se bajan.
 */
export function ordenesDelDia(servicios: readonly ServicioProgramado[], hoy: string, tope: number = TOPE_ORDENES): ServicioProgramado[] {
  const limite = sumarDias(hoy, DIAS_ADELANTE);
  const trabajable = (s: ServicioProgramado) => ESTADOS_EN_CURSO.includes(s.estadoOs) || ['programada', 'reprogramada'].includes(s.estadoOs);
  return servicios
    .filter((s) => ESTADOS_EN_CURSO.includes(s.estadoOs) || (trabajable(s) && !!s.fechaEjecucion && s.fechaEjecucion >= hoy && s.fechaEjecucion <= limite))
    .sort((a, b) => Number(ESTADOS_EN_CURSO.includes(b.estadoOs)) - Number(ESTADOS_EN_CURSO.includes(a.estadoOs))
      || (a.fechaEjecucion ?? '9999-99-99').localeCompare(b.fechaEjecucion ?? '9999-99-99')
      || (a.horaInicio ?? '99:99').localeCompare(b.horaInicio ?? '99:99'))
    .slice(0, tope);
}

/**
 * ¿Toca revisar la descarga? Sí si nunca se hizo hoy o si ya pasó el tiempo de espera (15 min) desde la última revisión: entonces se baja la agenda y, si cambió o quedaron datos sin
 * bajar, se descarga de nuevo (ver `firma`). Dentro de la espera no se pide nada.
 */
export function debeDescargar(marcador: MarcadorDescarga | null, hoy: string, ahora: number = Date.now()): boolean {
  if (!marcador || marcador.fecha !== hoy) return true;
  return ahora - marcador.terminoEn >= REINTENTO_OMITIDOS_MS;
}

/**
 * Baja y guarda en el teléfono lo que el técnico necesitará de UN equipo para seguir sin señal: cabecera del informe, evidencias, ensayos y correlativo.
 * Se llama cuando el equipo se abre con señal (el servidor solo entrega esto con el equipo ya iniciado, por eso la descarga del día no siempre alcanza).
 * Nunca lanza error; un «no» del servidor (p. ej. ensayos sin variables guardadas) se ignora.
 */
export async function precargarEquipo(token: string, idUsuario: number, idOs: number, idOsEquipo: number): Promise<void> {
  if (entorno.usarMock || Platform.OS === 'web' || !token || !idUsuario || !leerEstadoConexion().enLinea) return;
  const pedidos = [
    () => obtenerCabeceraInformeConRespaldo(token, idUsuario, idOs, idOsEquipo, true),
    () => obtenerEvidenciasConRespaldo(token, idUsuario, idOs, idOsEquipo, true),
    () => obtenerEnsayosConRespaldo(token, idUsuario, idOs, idOsEquipo),
    () => obtenerSolicitudConRespaldo(token, idUsuario, idOs, idOsEquipo),
  ];
  await Promise.all(pedidos.map((p) => p().catch(() => undefined)));
}

async function enLotes<T>(items: readonly T[], tamano: number, trabajo: (item: T) => Promise<void>): Promise<void> {
  for (let i = 0; i < items.length; i += tamano) await Promise.all(items.slice(i, i + tamano).map(trabajo));
}

/**
 * Descarga lo del día si hace falta. Devuelve el marcador nuevo, o null si no hizo nada (ya estaba al día, sin conexión, demo o web).
 * Solo corre una a la vez.
 */
export function descargarDelDia(token: string, idUsuario: number, forzar = false): Promise<MarcadorDescarga | null> {
  if (entorno.usarMock || Platform.OS === 'web' || !token || !idUsuario) return Promise.resolve(null);
  if (!enCurso) {
    enCurso = ejecutar(token, idUsuario, forzar).finally(() => {
      enCurso = null;
    });
  }
  return enCurso;
}

async function ejecutar(token: string, idUsuario: number, forzar: boolean): Promise<MarcadorDescarga | null> {
  const hoy = fechaLimaHoy();
  try {
    if (!leerEstadoConexion().enLinea) return null; // sin señal no hay nada que bajar: se reintenta al volver
    const anterior = await leerMarcadorDescarga(idUsuario);
    if (!forzar && !debeDescargar(anterior, hoy)) return null;

    let sinSenal = false;
    let omitidos = 0;
    /** Pide un dato y lo deja guardado; un «no» del servidor se cuenta como omitido, y una caída de la red corta la descarga. */
    const intentar = async <T>(pedir: () => Promise<T>, contarOmitido = true): Promise<T | null> => {
      if (sinSenal) return null;
      try {
        return await pedir();
      } catch (e) {
        if (e instanceof ErrorApi && e.estadoHttp === 0) sinSenal = true;
        else if (contarOmitido) omitidos += 1;
        return null;
      }
    };

    // 1 · La agenda: si ni ella baja, no hay nada que hacer (sin conexión o sin sesión)
    const agenda = await intentar(() => obtenerServiciosProgramadosConRespaldo(token, idUsuario, ''));
    if (!agenda || sinSenal || !leerEstadoConexion().enLinea) return null;

    // La agenda no cambió desde la última descarga completa de hoy: no se vuelve a bajar nada (solo se anota la revisión para esperar otros 15 min)
    const ordenes = ordenesDelDia(agenda, hoy);
    const firma = firmaDeAgenda(ordenes);
    if (!forzar && anterior && anterior.fecha === hoy && anterior.omitidos === 0 && anterior.firma === firma) {
      await conRespaldo(idUsuario, CLAVE_MARCADOR, async () => ({ ...anterior, terminoEn: Date.now() }));
      return null;
    }

    // 2 · Datos generales del técnico
    await intentar(() => obtenerCatalogo(token, 'CARGO_USUARIO'));
    await intentar(() => obtenerCatalogo(token, 'AREA_USUARIO'));
    await intentar(() => obtenerJornadaConRespaldo(token, idUsuario));
    await intentar(() => conRespaldo(idUsuario, 'menu.resumen', () => obtenerResumenMenu(token)));
    await intentar(() => obtenerTicketsConRespaldo(token, idUsuario, 'todos'));
    await intentar(async () => {
      const b = await obtenerBiblioteca(token, idUsuario);
      if (!b.sinConexion) await sincronizarProcedimientos(token, b.datos);
    });

    // 3 · Cada orden de hoy o en curso: detalle y checklist (formatos, contactos), llegada, demoras y objetivos
    const objetivosPorOrden = new Map<number, Objetivos>();
    await enLotes(ordenes, PARALELO, async (o) => {
      await intentar(() => obtenerDetalleServicioConRespaldo(token, idUsuario, o.idOs));
      await intentar(() => obtenerChecklistSalidaConRespaldo(token, idUsuario, o.idOs));
      await intentar(() => obtenerLlegadaConRespaldo(token, idUsuario, o.idOs));
      await intentar(() => obtenerDemorasConRespaldo(token, idUsuario, o.idOs));
      await intentar(() => obtenerOpcionesEquipoNuevoConRespaldo(token, idUsuario, o.idOs));
      const obj = await intentar(async () => (await obtenerObjetivosConRespaldo(token, idUsuario, o.idOs, true)).datos);
      if (obj) objetivosPorOrden.set(o.idOs, obj);
    });

    // 4 · Cada equipo de esas órdenes (hasta el tope): trabajo, ensayos, cabecera del informe, evidencias y correlativo reservado
    const equipos: { idOs: number; idOsEquipo: number }[] = [];
    for (const o of ordenes) {
      for (const eq of objetivosPorOrden.get(o.idOs)?.equipos ?? []) {
        if (equipos.length < TOPE_EQUIPOS && !eq.bloqueado) equipos.push({ idOs: o.idOs, idOsEquipo: eq.idOsEquipo });
      }
    }
    await enLotes(equipos, PARALELO, async (e) => {
      await intentar(() => obtenerTrabajoEquipoConRespaldo(token, idUsuario, e.idOs, e.idOsEquipo, true));
      await intentar(() => obtenerCabeceraInformeConRespaldo(token, idUsuario, e.idOs, e.idOsEquipo, true));
      await intentar(() => obtenerEvidenciasConRespaldo(token, idUsuario, e.idOs, e.idOsEquipo, true));
      await intentar(() => obtenerSolicitudConRespaldo(token, idUsuario, e.idOs, e.idOsEquipo));
      // Los ensayos solo los entrega el servidor con las variables ambientales guardadas: si no están, la app arma la hoja con la cabecera (no cuenta como dato omitido)
      await intentar(() => obtenerEnsayosConRespaldo(token, idUsuario, e.idOs, e.idOsEquipo), false);
    });

    // Se perdió la señal a la mitad: no se marca el día como descargado, se vuelve a intentar
    // (con lo guardado de antes, una consulta sin señal no lanza error: por eso también se mira el estado global de la conexión)
    if (sinSenal || !leerEstadoConexion().enLinea) return null;

    const ahora = new Date();
    const marcador: MarcadorDescarga = {
      fecha: hoy,
      hora: ahora.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: false }),
      ordenes: ordenes.length,
      equipos: equipos.length,
      omitidos,
      terminoEn: ahora.getTime(),
      firma,
    };
    await conRespaldo(idUsuario, CLAVE_MARCADOR, async () => marcador);
    escuchas.forEach((f) => f());
    return marcador;
  } catch {
    return null; // nunca lanza: es un trabajo de fondo
  }
}
