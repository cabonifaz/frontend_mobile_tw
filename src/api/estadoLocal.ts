import { accionesPendientes } from './colaEquipos';
import { llegadaPendiente } from './colaLlegadas';
import type { Objetivos, ObjetivoEquipo } from './ruta';

/**
 * HU-18 — Lo que el técnico ya hizo en el teléfono (la llegada y el inicio del equipo guardados sin señal) cambia lo que las pantallas pueden hacer, aunque lo descargado por adelantado
 * (`previo`) diga que todavía no se puede: la descarga previa se hace ANTES de la llegada y del inicio, así que trae los botones y las etapas bloqueados. Estas funciones solo se aplican
 * cuando no hay conexión y se muestra lo guardado: el servidor vuelve a validar todo (llegada, un equipo en ejecución, Hard Stop) cuando se envía.
 */

/** ¿Lo guardado en el teléfono deja este equipo en ejecución? (la última acción sin enviar es iniciar o reanudar) */
export async function equipoEnEjecucionLocal(idUsuario: number, idOs: number, idOsEquipo: number): Promise<boolean> {
  const acciones = (await accionesPendientes(idUsuario, idOs)).filter((a) => a.idOsEquipo === idOsEquipo);
  const ultima = acciones[acciones.length - 1];
  return !!ultima && ultima.accion !== 'pausar';
}

const botones = (e: ObjetivoEquipo): ObjetivoEquipo => ({
  ...e,
  puedeIniciar: !e.bloqueado && (e.estado === 'por_iniciar' || e.estado === 'observado'),
  puedePausar: e.estado === 'en_ejecucion',
  puedeReanudar: e.estado === 'pausado' && !e.requiereAprobacion && !e.bloqueado,
});

/** La lista de objetivos descargada antes de la llegada, con la llegada guardada en el teléfono: los botones de iniciar, pausar y reanudar quedan habilitados. */
export async function objetivosConLlegadaLocal(idUsuario: number, o: Objetivos): Promise<Objetivos> {
  if (o.resumen.llegadaRegistrada) return o;
  const llegada = await llegadaPendiente(idUsuario, o.resumen.idOs);
  if (!llegada) return o;
  return {
    ...o,
    resumen: { ...o.resumen, llegadaRegistrada: true, llegadaEn: o.resumen.llegadaEn ?? new Date(Date.parse(llegada.capturadoEn) - 5 * 3_600_000).toISOString().slice(0, 19) },
    equipos: o.equipos.map(botones),
  };
}
