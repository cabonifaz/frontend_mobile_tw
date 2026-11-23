import { pendientesDe, sincronizarPendientes, suscribirCola } from './colaDemoras';
import { accionesPendientes, sincronizarAccionesEquipos, suscribirColaEquipos } from './colaEquipos';
import { capturasPendientes, sincronizarEvidencias, suscribirColaEvidencias } from './colaEvidencias';
import { gastosPendientes, sincronizarGastos, suscribirColaGastos } from './colaGastos';
import { pendientesJornada, sincronizarJornada, suscribirColaJornada } from './colaJornada';
import { pendientesLlegadas, sincronizarLlegadas, suscribirColaLlegadas } from './colaLlegadas';
import { pendientesTrabajo, sincronizarTrabajo, suscribirColaTrabajo } from './colaTrabajo';
import { pendientesDeEnviar, sincronizarGuardados, suscribirGuardados } from './guardadosAsistente';

/**
 * HU-18 — Envío automático de TODO lo que el técnico registró sin señal, en el orden en que el servidor lo necesita. No hay botón de sincronizar: lo dispara
 * `MonitorCampo` al abrir la app, al volver a ella, cada 30 s y en cuanto vuelve la señal.
 *
 * Orden (cada paso depende de los anteriores):
 *   1. Jornada (marcaciones del Reloj Marcador)
 *   2. Llegadas a planta (una demora de ingreso a planta y las acciones de los equipos necesitan la llegada registrada)
 *   3. Acciones de los equipos (iniciar · pausar · reanudar: el trabajo del equipo solo se acepta con el equipo en ejecución)
 *   4. Demoras
 *   5. Trabajo del equipo (variables ambientales → ensayos → cabecera del informe)
 *   6. Fotos y videos (la IA los valida al llegar al servidor; solo se aceptan con el equipo en ejecución)
 *   7. Gastos de viáticos
 *   8. Guardados del asistente
 * Si un paso se queda sin señal, no se intentan los siguientes (también fallarían); un paso que falla por otra causa no frena a los demás.
 * Solo corre una ejecución a la vez: quien llame mientras hay una en curso recibe su mismo resultado.
 */
export interface ResumenEnvioTotal {
  /** Registros enviados al servidor en esta ejecución. */
  enviadas: number;
  /** Mensajes para el técnico: registros que el servidor rechazó o se descartaron. */
  avisos: string[];
  /** Registros que siguen guardados en el teléfono. */
  pendientes: number;
  sinConexion: boolean;
}

interface ResumenParcial {
  enviadas: number;
  avisos: string[];
  sinConexion: boolean;
}

interface Paso {
  nombre: string;
  /** Cuántos registros hay por enviar (0 = se omite el paso). */
  cuantos: (idUsuario: number) => Promise<number>;
  enviar: (token: string, idUsuario: number) => Promise<ResumenParcial>;
}

const PASOS: Paso[] = [
  { nombre: 'jornada', cuantos: async (u) => (await pendientesJornada(u)).length, enviar: sincronizarJornada },
  { nombre: 'llegadas', cuantos: async (u) => (await pendientesLlegadas(u)).length, enviar: sincronizarLlegadas },
  { nombre: 'equipos', cuantos: async (u) => (await accionesPendientes(u)).length, enviar: sincronizarAccionesEquipos },
  { nombre: 'demoras', cuantos: async (u) => (await pendientesDe(u)).length, enviar: sincronizarPendientes },
  { nombre: 'trabajo', cuantos: pendientesTrabajo, enviar: sincronizarTrabajo },
  { nombre: 'evidencias', cuantos: async (u) => (await capturasPendientes(u)).length, enviar: sincronizarEvidencias },
  { nombre: 'gastos', cuantos: async (u) => (await gastosPendientes(u)).length, enviar: sincronizarGastos },
  {
    nombre: 'guardados',
    cuantos: pendientesDeEnviar,
    enviar: async (token, u) => {
      const r = await sincronizarGuardados(token, u);
      return { enviadas: r.enviados + r.eliminados, avisos: r.avisos, sinConexion: r.sinConexion };
    },
  },
];

/** Cuántos registros hay guardados en el teléfono por enviar (todas las colas). */
export async function contarPendientes(idUsuario: number): Promise<number> {
  let total = 0;
  for (const p of PASOS) {
    try {
      total += await p.cuantos(idUsuario);
    } catch {
      // una cola ilegible no impide contar las demás
    }
  }
  return total;
}

/** Se llama cuando cambia cualquier cola (se guarda algo, se envía o se descarta). Devuelve la función para dejar de escuchar. */
export function suscribirPendientes(f: () => void): () => void {
  const bajas = [suscribirColaJornada, suscribirColaLlegadas, suscribirColaEquipos, suscribirCola, suscribirColaTrabajo, suscribirColaEvidencias, suscribirColaGastos, suscribirGuardados].map((s) => s(f));
  return () => bajas.forEach((baja) => baja());
}

let enCurso: Promise<ResumenEnvioTotal> | null = null;

/** Envía todo lo guardado en el teléfono, en orden. No lanza error: el resultado dice qué pasó. */
export function sincronizarTodo(token: string, idUsuario: number): Promise<ResumenEnvioTotal> {
  if (!enCurso) {
    enCurso = ejecutar(token, idUsuario).finally(() => {
      enCurso = null;
    });
  }
  return enCurso;
}

async function ejecutar(token: string, idUsuario: number): Promise<ResumenEnvioTotal> {
  let enviadas = 0;
  let sinConexion = false;
  const avisos: string[] = [];
  for (const paso of PASOS) {
    try {
      if ((await paso.cuantos(idUsuario)) === 0) continue;
      const r = await paso.enviar(token, idUsuario);
      enviadas += r.enviadas;
      avisos.push(...r.avisos);
      if (r.sinConexion) {
        sinConexion = true;
        break;
      }
    } catch {
      // este paso falló por otra causa: se reintenta en el siguiente ciclo y no frena a los demás
    }
  }
  return { enviadas, avisos, pendientes: await contarPendientes(idUsuario), sinConexion };
}
