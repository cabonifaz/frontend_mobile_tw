import { entorno } from '@/config/entorno';
import { borrar, guardar, leer } from '@/sesion/almacenamiento';
import { INTENTOS_MAXIMOS, clasificarFallo } from '@/utilidades/demoras';
import { validarSesion } from './autenticacion';
import { sistemaArchivos } from './archivosLocales';
import { ErrorApi } from './cliente';
import { enviarGasto, type EntradaGasto } from './viaticos';

/**
 * Gastos nuevos guardados en el teléfono para enviarlos cuando vuelva la señal (HU-27 · «POR ENVIAR»).
 *
 * Sin conexión, la solicitud se guarda con sus fotos (copiadas a la carpeta de la app, porque la caché de la cámara se puede limpiar) y se envía sola al
 * recuperar la señal (al abrir la app, al volver a ella y cada 30 s). El `idCliente` (GUID) hace que un reintento no duplique el gasto. Si el servidor
 * la rechaza (por ejemplo, la rendición ya se cerró) se descarta y se avisa. Corregir un gasto observado necesita conexión (no se encola).
 */

const CLAVE_INDICE = 'tw.cola.gastos';
const claveDe = (idCliente: string) => `tw.cola.gasto.${idCliente}`;
const CARPETA = 'gastos-pendientes';

export interface GastoPendiente {
  idUsuario: number;
  entrada: EntradaGasto;
  /** Fotos del comprobante guardadas en el teléfono. */
  fotos: string[];
  /** Para mostrarlo en la lista mientras espera. */
  resumen: { concepto: string; numeroOs: string; creadoEn: string };
  intentos: number;
}

let memoria: Map<string, GastoPendiente> | null = null;
const escuchas = new Set<() => void>();
const avisarCambio = () => escuchas.forEach((f) => f());

/** Se llama cuando cambia la cola de gastos. Devuelve la función para dejar de escuchar. */
export function suscribirColaGastos(f: () => void): () => void {
  escuchas.add(f);
  return () => {
    escuchas.delete(f);
  };
}

async function cargar(): Promise<Map<string, GastoPendiente>> {
  if (memoria) return memoria;
  const mapa = new Map<string, GastoPendiente>();
  try {
    const crudo = await leer(CLAVE_INDICE);
    const ids = crudo ? (JSON.parse(crudo) as unknown) : [];
    for (const id of Array.isArray(ids) ? ids.filter((x): x is string => typeof x === 'string') : []) {
      try {
        const item = await leer(claveDe(id));
        if (item) mapa.set(id, JSON.parse(item) as GastoPendiente);
      } catch {
        // un valor dañado no debe impedir el resto
      }
    }
  } catch {
    // sin índice legible: cola vacía
  }
  memoria = mapa;
  return mapa;
}

const persistirIndice = (m: Map<string, GastoPendiente>) => guardar(CLAVE_INDICE, JSON.stringify([...m.keys()]));

async function copiarAlTelefono(origen: string, nombre: string): Promise<string> {
  const f = sistemaArchivos();
  if (!f) return origen;
  const carpeta = new f.Directory(f.Paths.document, CARPETA);
  carpeta.create({ idempotent: true, intermediates: true });
  const destino = new f.File(carpeta, nombre);
  if (destino.exists) destino.delete();
  await new f.File(origen).copy(destino);
  return destino.uri;
}

function borrarArchivo(uri: string) {
  try {
    const f = sistemaArchivos();
    if (!f) return;
    const a = new f.File(uri);
    if (a.exists) a.delete();
  } catch {
    // ya no estaba
  }
}

function existe(uri: string): boolean {
  try {
    const f = sistemaArchivos();
    return !f || new f.File(uri).exists;
  } catch {
    return false;
  }
}

/** Guarda un gasto nuevo para enviarlo después. */
export async function encolarGasto(idUsuario: number, entrada: EntradaGasto, fotos: string[], resumen: GastoPendiente['resumen']): Promise<GastoPendiente> {
  const m = await cargar();
  const guardadas: string[] = [];
  for (let i = 0; i < fotos.length; i++) guardadas.push(await copiarAlTelefono(fotos[i], `${entrada.idCliente}-${i + 1}.jpg`));
  const p: GastoPendiente = { idUsuario, entrada, fotos: guardadas, resumen, intentos: 0 };
  m.set(entrada.idCliente, p);
  await guardar(claveDe(entrada.idCliente), JSON.stringify(p));
  await persistirIndice(m);
  avisarCambio();
  return p;
}

/** Los gastos de ese técnico que aún no se enviaron, del más antiguo al más reciente. */
export async function gastosPendientes(idUsuario: number): Promise<GastoPendiente[]> {
  return [...(await cargar()).values()].filter((p) => p.idUsuario === idUsuario).sort((a, b) => a.resumen.creadoEn.localeCompare(b.resumen.creadoEn));
}

async function quitar(p: GastoPendiente) {
  const m = await cargar();
  m.delete(p.entrada.idCliente);
  await borrar(claveDe(p.entrada.idCliente));
  await persistirIndice(m);
  p.fotos.forEach(borrarArchivo);
  avisarCambio();
}

async function hayConexion(token: string): Promise<boolean> {
  try {
    await validarSesion(token);
    return true;
  } catch (e) {
    return !(e instanceof ErrorApi && e.estadoHttp === 0);
  }
}

export interface ResumenGastos {
  enviadas: number;
  /** Mensajes para el técnico: gastos que el servidor no aceptó, o advertencias del reparto. */
  avisos: string[];
  pendientes: number;
  sinConexion: boolean;
}

let enCurso: Promise<ResumenGastos> | null = null;

/** Envía los gastos en cola del técnico, del más antiguo al más reciente. No se pisa a sí misma. */
export function sincronizarGastos(token: string, idUsuario: number): Promise<ResumenGastos> {
  if (!enCurso) {
    enCurso = ejecutar(token, idUsuario).finally(() => {
      enCurso = null;
    });
  }
  return enCurso;
}

async function ejecutar(token: string, idUsuario: number): Promise<ResumenGastos> {
  const resumen: ResumenGastos = { enviadas: 0, avisos: [], pendientes: 0, sinConexion: false };
  const lista = await gastosPendientes(idUsuario);
  if (entorno.usarMock) return { ...resumen, pendientes: lista.length };

  for (const p of lista) {
    const que = `"${p.resumen.concepto}" de ${p.entrada.monto.toFixed(2)} (${p.resumen.numeroOs})`;
    // Las fotos se copiaron al teléfono: si faltan, se envía con el motivo en vez de fallar para siempre
    const fotos = p.fotos.filter(existe);
    const entrada: EntradaGasto =
      fotos.length === 0 && !p.entrada.motivoSinFoto ? { ...p.entrada, motivoSinFoto: 'La foto no se pudo conservar en el teléfono.' } : p.entrada;
    try {
      const r = await enviarGasto(token, 0, entrada, fotos);
      await quitar(p);
      resumen.enviadas++;
      for (const a of r.resultado.advertencias ?? []) resumen.avisos.push(`Gasto ${r.resultado.codigo}: ${a}`);
    } catch (e) {
      const destino = e instanceof ErrorApi ? clasificarFallo(e.estadoHttp, e.idTipoMensaje) : 'reintentar';
      if (destino === 'sesion') break;
      if (destino === 'rechazada') {
        await quitar(p);
        resumen.avisos.push(`No se pudo enviar el gasto ${que}: ${e instanceof Error ? e.message : 'el servidor lo rechazó.'}`);
        continue;
      }
      if (destino === 'sin_conexion' && !(await hayConexion(token))) {
        resumen.sinConexion = true;
        break;
      }
      const m = await cargar();
      const actualizado = { ...p, intentos: p.intentos + 1 };
      if (actualizado.intentos >= INTENTOS_MAXIMOS) {
        await quitar(p);
        resumen.avisos.push(`No se pudo enviar el gasto ${que} tras varios intentos. Regístralo de nuevo.`);
      } else {
        m.set(p.entrada.idCliente, actualizado);
        await guardar(claveDe(p.entrada.idCliente), JSON.stringify(actualizado));
      }
    }
  }

  resumen.pendientes = (await gastosPendientes(idUsuario)).length;
  avisarCambio();
  return resumen;
}
