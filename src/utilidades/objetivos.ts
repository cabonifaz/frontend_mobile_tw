import type { AccionEquipo, ObjetivoEquipo, Objetivos } from '@/api/ruta';

/**
 * HU-07 — Lógica de los objetivos que se calcula en el teléfono.
 * Las reglas de negocio (Hard Stop, qué botón corresponde, un solo equipo a la vez) las decide el back; aquí solo se arma el texto de las
 * tarjetas y se aplican a la lista las acciones guardadas sin conexión (para que el técnico las vea reflejadas mientras no hay señal).
 */

/** Una acción del técnico guardada sin conexión que aún no se envió. */
export interface AccionPendiente {
  idOsEquipo: number;
  accion: AccionEquipo;
  motivo: string | null;
  /** ISO 8601, UTC: la hora en que el técnico tocó el botón. */
  capturadoEn: string;
}

/** "1. MC · 60 min", "3. Calibración · 30 min" (sin sigla se usa el nombre del tipo de intervención). */
export function tituloObjetivo(e: Pick<ObjetivoEquipo, 'numero' | 'tipoCorto' | 'tipoIntervencion' | 'tiempoEstimadoMin' | 'nombre'>): string {
  const tipo = e.tipoCorto?.trim() || e.tipoIntervencion?.trim() || '';
  const minutos = e.tiempoEstimadoMin != null && e.tiempoEstimadoMin > 0 ? `${e.tiempoEstimadoMin} min` : '';
  const detalle = [tipo, minutos].filter(Boolean).join(' · ');
  return `${e.numero}. ${detalle || e.nombre}`;
}

/** "Balanza industrial de plataforma · Precia Weight 2456" cuando el equipo ya se está trabajando; si no, solo el nombre. */
export function descripcionObjetivo(e: Pick<ObjetivoEquipo, 'nombre' | 'marca' | 'modelo' | 'estado'>): string {
  if (e.estado !== 'en_ejecucion' && e.estado !== 'pausado') return e.nombre;
  const marcaModelo = [e.marca, e.modelo].filter((x): x is string => !!x?.trim()).join(' ');
  return marcaModelo ? `${e.nombre} · ${marcaModelo}` : e.nombre;
}

/** "SN V000079-HD · COD BAL-149" ("—" cuando falta el dato). */
export function lineaIdentificacion(e: Pick<ObjetivoEquipo, 'numeroSerie' | 'codigoCliente'>): string {
  return `SN ${e.numeroSerie?.trim() || '—'} · COD ${e.codigoCliente?.trim() || '—'}`;
}

/** Contadores de la cabecera, calculados igual que el back (observado = observado o pausa que espera al supervisor). */
export function contarObjetivos(equipos: ObjetivoEquipo[]): Objetivos['contadores'] {
  const completados = equipos.filter((e) => e.estado === 'completado').length;
  const abiertos = equipos.filter((e) => e.estado !== 'completado');
  const observados = abiertos.filter((e) => e.estado === 'observado' || (e.estado === 'pausado' && e.requiereAprobacion)).length;
  return { completados, pendientes: abiertos.length - observados, observados, total: equipos.length };
}

/** Hora de Lima (UTC-5, sin horario de verano) como la entrega el back: "2026-11-09T08:44:00". */
export function isoLimaDe(utcIso: string): string {
  const t = Date.parse(utcIso);
  return new Date((Number.isNaN(t) ? Date.now() : t) - 5 * 3_600_000).toISOString().slice(0, 19);
}

/**
 * ¿Se puede guardar esta acción sin conexión? Aplica las reglas que el back volverá a validar al enviarla, para no guardar algo que se sabe
 * que será rechazado. Devuelve el mensaje para el técnico, o null si está bien.
 */
export function validarAccionLocal(o: Objetivos, idOsEquipo: number, accion: AccionEquipo, motivo?: string | null): string | null {
  const e = o.equipos.find((x) => x.idOsEquipo === idOsEquipo);
  if (!e) return 'El equipo no forma parte de los objetivos de este servicio.';
  if (accion === 'iniciar') {
    if (e.estado === 'en_ejecucion') return null;
    if (e.estado === 'pausado') return 'El equipo está pausado: usa "Reanudar".';
    if (e.estado === 'completado') return 'Este equipo ya está completado.';
    if (e.bloqueado) return 'Este equipo está bloqueado y no se puede intervenir.';
    if (!e.puedeIniciar) return 'No se puede iniciar el trabajo en este equipo.';
  } else if (accion === 'pausar') {
    if (e.estado === 'pausado') return null;
    if (!e.puedePausar) return 'Solo se puede pausar un equipo que está en ejecución.';
    if ((motivo ?? '').trim().length < 3) return 'Indica el motivo de la pausa (mínimo 3 caracteres).';
  } else {
    if (e.estado === 'en_ejecucion') return null;
    if (e.estado === 'pausado' && e.requiereAprobacion) return 'Esperando aprobación de supervisor: este equipo no se puede reanudar todavía.';
    if (!e.puedeReanudar) return 'Solo se puede reanudar un equipo pausado.';
  }
  if (accion !== 'pausar') {
    const otro = o.equipos.find((x) => x.idOsEquipo !== idOsEquipo && x.estado === 'en_ejecucion');
    if (otro) {
      const nombre = otro.codigoCliente?.trim() || otro.numeroSerie?.trim() || otro.nombre;
      return `Ya estás trabajando en el equipo ${nombre}: pausa ese equipo antes de continuar con otro.`;
    }
  }
  return null;
}

/** Refleja una acción en la lista (para mostrar lo guardado sin conexión). Una acción que no corresponde no cambia nada. */
export function aplicarAccionLocal(o: Objetivos, a: AccionPendiente): Objetivos {
  if (validarAccionLocal(o, a.idOsEquipo, a.accion, a.motivo) !== null) return o;
  const equipos = o.equipos.map((e): ObjetivoEquipo => {
    if (e.idOsEquipo !== a.idOsEquipo) return e;
    if (a.accion === 'pausar') {
      return {
        ...e,
        estado: 'pausado',
        motivoPausa: a.motivo?.trim() || null,
        requiereAprobacion: false,
        puedeIniciar: false,
        puedePausar: false,
        puedeReanudar: !e.bloqueado,
      };
    }
    return {
      ...e,
      estado: 'en_ejecucion',
      iniciadoEn: e.iniciadoEn ?? isoLimaDe(a.capturadoEn),
      motivoPausa: null,
      requiereAprobacion: false,
      puedeIniciar: false,
      puedePausar: true,
      puedeReanudar: false,
    };
  });
  return { ...o, equipos, contadores: contarObjetivos(equipos) };
}

/** La lista del servidor (o la última guardada) con las acciones pendientes encima, en el orden en que se hicieron. */
export function aplicarPendientes(o: Objetivos, pendientes: AccionPendiente[]): Objetivos {
  return [...pendientes].sort((x, y) => x.capturadoEn.localeCompare(y.capturadoEn)).reduce(aplicarAccionLocal, o);
}

/** Filtro de la lista por N/S, código, COD TW, marca, modelo, ubicación o tipo de equipo (sin distinguir mayúsculas; el texto va tal cual, sin comodines). */
export function filtrarEquipos(equipos: ObjetivoEquipo[], texto: string): ObjetivoEquipo[] {
  const q = texto.trim().toLowerCase();
  if (!q) return equipos;
  return equipos.filter((e) =>
    [e.numeroSerie, e.codigoCliente, e.codigoTw, e.marca, e.modelo, e.ubicacion, e.nombre].some((v) => !!v && v.toLowerCase().includes(q)),
  );
}

/**
 * El equipo de la lista que corresponde a lo escaneado: coincidencia exacta (sin distinguir mayúsculas) con el N/S, el código del cliente o el COD TW; o,
 * si el QR trae un texto más largo (una URL con el código al final), que contenga el COD TW o el código del cliente (de 5 o más caracteres).
 * Es la misma regla de SP_BuscarEquipoQrMovil: se usa cuando no hay conexión.
 */
export function buscarPorCodigo(equipos: ObjetivoEquipo[], contenido: string): ObjetivoEquipo | null {
  const codigo = contenido.trim().toUpperCase();
  if (!codigo) return null;
  const mayus = (v: string | null) => v?.trim().toUpperCase() ?? '';
  const exacto = equipos.find((e) => [e.numeroSerie, e.codigoCliente, e.codigoTw].some((v) => mayus(v) === codigo));
  if (exacto) return exacto;
  return equipos.find((e) => [e.codigoTw, e.codigoCliente].some((v) => mayus(v).length >= 5 && codigo.includes(mayus(v)))) ?? null;
}

/** Equipos ordenados con el objetivo indicado primero (el que el técnico tocó); el resto sigue el orden de la lista. */
export function conObjetivoPrimero(equipos: ObjetivoEquipo[], numero: number | null): ObjetivoEquipo[] {
  if (numero === null) return equipos;
  return [...equipos].sort((a, b) => Number(b.numero === numero) - Number(a.numero === numero) || a.numero - b.numero);
}

/** Datos del formulario "Equipo nuevo" tal como los tiene la pantalla. */
export interface DatosEquipoNuevo {
  numeroSerie: string;
  codigo: string;
  marca: string | null;
  modelo: string;
  idSuministro: number | null;
  ubicacion: string;
  foto: string | null;
}

export const MAX_CORTO_EQUIPO_NUEVO = 80;
export const MAX_UBICACION_EQUIPO_NUEVO = 200;

/** Campos obligatorios del equipo nuevo (los mismos mensajes que da el back). Vacío = todo bien. */
export function validarEquipoNuevo(d: DatosEquipoNuevo): Partial<Record<keyof DatosEquipoNuevo, string>> {
  const e: Partial<Record<keyof DatosEquipoNuevo, string>> = {};
  if (!d.numeroSerie.trim()) e.numeroSerie = 'Ingresa el N/S del equipo.';
  else if (d.numeroSerie.trim().length > MAX_CORTO_EQUIPO_NUEVO) e.numeroSerie = `Máximo ${MAX_CORTO_EQUIPO_NUEVO} caracteres.`;
  if (!d.codigo.trim()) e.codigo = 'Ingresa el código del equipo.';
  else if (d.codigo.trim().length > MAX_CORTO_EQUIPO_NUEVO) e.codigo = `Máximo ${MAX_CORTO_EQUIPO_NUEVO} caracteres.`;
  if (!d.marca) e.marca = 'Selecciona la marca.';
  if (!d.modelo.trim()) e.modelo = 'Ingresa el modelo.';
  else if (d.modelo.trim().length > MAX_CORTO_EQUIPO_NUEVO) e.modelo = `Máximo ${MAX_CORTO_EQUIPO_NUEVO} caracteres.`;
  if (!d.idSuministro || d.idSuministro <= 0) e.idSuministro = 'Selecciona el tipo de equipo.';
  if (!d.ubicacion.trim()) e.ubicacion = 'Ingresa la ubicación del equipo.';
  else if (d.ubicacion.trim().length > MAX_UBICACION_EQUIPO_NUEVO) e.ubicacion = `Máximo ${MAX_UBICACION_EQUIPO_NUEVO} caracteres.`;
  if (!d.foto) e.foto = 'Toma la foto de la placa del equipo (solo cámara).';
  return e;
}
