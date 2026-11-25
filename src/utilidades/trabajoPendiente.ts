import type { TrabajoPendiente } from '@/api/colaTrabajo';
import type { Ensayos, GuardarEnsayos, LecturaExcentricidad, LecturaPesaje } from '@/api/ensayos';
import type { CabeceraInforme, Falla, GuardarCabecera, LecturaGeneral, LecturaPrueba, PruebasGenerales } from '@/api/informe';
import type { EtapaTrabajo, NuevasVariables, TrabajoEquipo } from '@/api/trabajo';
import { evaluar } from '@/utilidades/ensayos';
import { pendientesPreInforme } from '@/utilidades/informe';
import { etapaResuelta, textoNumero } from '@/utilidades/trabajo';

/**
 * HU-18 — Trabajo sin conexión: lo que el técnico guardó en el teléfono (variables ambientales, ensayos, cabecera del informe) y todavía no se envió se
 * SUPERPONE al último dato descargado para que las pantallas lo muestren igual que si ya estuviera en el servidor. Son solo funciones puras: el servidor vuelve a
 * calcular y a decidir todo (E, EMP, conformidad, estado de las etapas, Hard Stop) cuando el trabajo se envía.
 */

const iso = (ms: number = Date.now()) => new Date(ms - 5 * 3_600_000).toISOString().slice(0, 19);
/** "yyyy-MM-ddTHH:mm:ss" en hora de Lima a partir de la hora UTC de la captura. */
export const limaDe = (capturadoEn: string): string => {
  const t = Date.parse(capturadoEn);
  return Number.isNaN(t) ? iso() : iso(t);
};

/** "Guardado en el teléfono · por enviar" para el aviso de las pantallas. */
export const TEXTO_EN_TELEFONO = 'Guardado en el teléfono · por enviar. Se envía solo cuando vuelva la señal.';

/** Cuántos registros hay por enviar: "1 registro" / "3 registros". */
export const textoRegistros = (n: number): string => `${n} ${n === 1 ? 'registro' : 'registros'}`;

/** Lo pendiente de un tipo (solo el último: guardar de nuevo reemplaza al anterior). */
export function pendienteDe(lista: readonly TrabajoPendiente[], tipo: TrabajoPendiente['tipo']): TrabajoPendiente | null {
  return lista.find((p) => p.tipo === tipo) ?? null;
}

// ── Variables ambientales y etapas del trabajo en el equipo ──────────────────────────────────────────

/** El trabajo del equipo con lo guardado en el teléfono: etapas «en el teléfono», variables a la vista y Ensayos sin bloqueo. */
export function trabajoConPendientes(t: TrabajoEquipo, pendientes: readonly TrabajoPendiente[], cabeceraInforme?: CabeceraInforme | null): TrabajoEquipo {
  if (pendientes.length === 0) return t;
  const pv = pendienteDe(pendientes, 'variables');
  const pe = pendienteDe(pendientes, 'ensayos');
  const pc = pendienteDe(pendientes, 'cabecera');
  const v = pv ? (pv.cuerpo as NuevasVariables) : null;
  const g = pe ? (pe.cuerpo as GuardarEnsayos) : null;

  const etapas: EtapaTrabajo[] = t.etapas.map((e) => {
    if (e.codigo === 'variables' && v) {
      return { ...e, estado: 'conforme', enTelefono: true, detalle: `T° ${textoNumero(v.temperatura)} °C · h ${textoNumero(v.humedad)} % · Procedencia ${v.procedencia.trim() || 'N.I'}` };
    }
    if (e.codigo === 'ensayos') {
      if (g) {
        return {
          ...e,
          enTelefono: true,
          estado: g.finalizar && !g.motivoErrorCritico ? 'conforme' : 'en_curso',
          detalle: g.finalizar ? (g.motivoErrorCritico ? 'Finalizado con error crítico · se avisa al encargado al enviar' : 'Ensayo finalizado') : 'Ensayo guardado',
        };
      }
      if (v && e.estado === 'bloqueado') return { ...e, estado: 'pendiente', detalle: 'Pesaje y excentricidad' };
    }
    if (e.codigo === 'cabecera' && pc) {
      // Con la cabecera completa (las 6 partes; el pre-informe en PDF es opcional y no cuenta) la etapa queda conforme igual que en el servidor
      const completa = !!cabeceraInforme && pendientesPreInforme(cabeceraConPendientes(cabeceraInforme, pendientes)).length === 0;
      if (completa) return { ...e, enTelefono: true, estado: 'conforme', detalle: 'Cabecera completa' };
      return { ...e, enTelefono: true, estado: e.estado === 'conforme' ? 'conforme' : 'en_curso', detalle: e.estado === 'conforme' ? e.detalle : 'Cabecera guardada' };
    }
    return e;
  });

  return {
    ...t,
    variables: v ? { temperatura: v.temperatura, humedad: v.humedad, procedencia: v.procedencia.trim() || 'N.I', registradoEn: limaDe(pv!.capturadoEn) } : t.variables,
    etapas,
    // El Hard Stop solo lo valida el servidor: con trabajo sin enviar no se puede finalizar el equipo
    cabecera: { ...t.cabecera, etapasConformes: etapas.filter((e) => etapaResuelta(e.estado)).length, puedeFinalizar: false },
  };
}

// ── Ensayos y Calibración ────────────────────────────────────────────────────────────────────────────

/** Los ensayos guardados en el teléfono como los devolvería el servidor (E, EMP y conformidad con la clase y e del equipo). */
export function ensayosConGuardado(base: Ensayos, g: GuardarEnsayos, capturadoEn: string): Ensayos {
  const { clase, e } = base.cabecera;
  const pesaje: LecturaPesaje[] = g.pesaje.map((p, i) => {
    const ev = evaluar(clase, e, p.carga, p.indicacion);
    return { orden: i + 1, carga: p.carga, indicacion: p.indicacion, error: ev.error, emp: ev.emp, resultado: ev.resultado, critico: ev.resultado === 'no_conforme' };
  });
  const excentricidad: LecturaExcentricidad[] = g.excentricidad.flatMap((c, gi) =>
    c.lecturas.map((l, pi) => {
      const ev = evaluar(clase, e, c.carga, l);
      return { grupo: gi + 1, posicion: pi + 1, carga: c.carga, indicacion: l, error: ev.error, emp: ev.emp, resultado: ev.resultado, critico: ev.resultado === 'no_conforme' };
    }),
  );
  const critico = pesaje.some((p) => p.critico) || excentricidad.some((x) => x.critico);
  const motivo = critico ? (g.motivoErrorCritico ?? null) : null;
  return {
    ...base,
    cabecera: {
      ...base.cabecera,
      formaPlato: g.formaPlato,
      motivoErrorCritico: motivo,
      aceptaError: motivo !== null,
      finalizado: g.finalizar,
      finalizadoEn: g.finalizar ? limaDe(capturadoEn) : null,
    },
    pesaje,
    excentricidad,
  };
}

/** Los ensayos descargados con lo que quedó guardado en el teléfono (si hay algo pendiente). */
export function ensayosConPendientes(base: Ensayos, pendientes: readonly TrabajoPendiente[]): Ensayos {
  const pe = pendienteDe(pendientes, 'ensayos');
  return pe ? ensayosConGuardado(base, pe.cuerpo as GuardarEnsayos, pe.capturadoEn) : base;
}

// ── Cabecera del informe ─────────────────────────────────────────────────────────────────────────────

/** "10 kg" / "0,5 g" → 10 / 0.5 (la división e del equipo viene como texto en la cabecera). */
export function numeroDeTexto(texto: string | null | undefined): number | null {
  const n = Number((texto ?? '').replace(/[^\d.,]/g, '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function lecturasGenerales(lista: { carga: number | null; indicacion: number | null }[], clase: string | null, e: number | null): LecturaGeneral[] {
  return lista.map((p, i) => {
    const ev = evaluar(clase, e, p.carga, p.indicacion);
    return { orden: i + 1, carga: p.carga, indicacion: p.indicacion, error: ev.error, emp: ev.emp, resultado: ev.resultado, critico: ev.resultado === 'no_conforme' };
  });
}

function pruebasGeneralesDe(g: GuardarEnsayos, clase: string | null, e: number | null): PruebasGenerales {
  const pesaje = lecturasGenerales(g.pesaje, clase, e);
  const excentricidad = g.excentricidad.map((c, gi) => ({
    grupo: gi + 1,
    carga: c.carga,
    lecturas: lecturasGenerales(c.lecturas.map((l) => ({ carga: c.carga, indicacion: l })), clase, e).map((l, pi) => ({ ...l, orden: pi + 1 })),
  }));
  const hayCritico = pesaje.some((l) => l.critico) || excentricidad.some((c) => c.lecturas.some((l) => l.critico));
  return { finalizado: g.finalizar, errorCritico: hayCritico ? (g.motivoErrorCritico ?? 'Error crítico en las lecturas') : null, pesaje, excentricidad };
}

/** La cabecera del informe con las secciones guardadas en el teléfono (y los ensayos finalizados sin enviar). */
export function cabeceraConPendientes(base: CabeceraInforme, pendientes: readonly TrabajoPendiente[]): CabeceraInforme {
  const pc = pendienteDe(pendientes, 'cabecera');
  const pe = pendienteDe(pendientes, 'ensayos');
  if (!pc && !pe) return base;
  let c = base;
  const clase = c.datos.clase;
  const e = numeroDeTexto(c.datos.e ?? c.datos.d);

  if (pe) c = { ...c, pruebasGenerales: pruebasGeneralesDe(pe.cuerpo as GuardarEnsayos, clase, e) };
  if (!pc) return c;

  const p = pc.cuerpo as GuardarCabecera;
  if (p.datos) c = { ...c, datos: { ...c.datos, responsableNombre: p.datos.responsableNombre, responsableCargo: p.datos.responsableCargo, responsableTelefono: p.datos.responsableTelefono } };
  if (p.detalle) {
    const marcados = new Set(p.detalle.checks);
    c = {
      ...c,
      detalle: {
        ...c.detalle,
        tipoEquipo: p.detalle.tipoEquipo,
        celdas: p.detalle.celdas,
        sumatoriaHasta: p.detalle.sumatoriaHasta,
        comparacionHasta: p.detalle.comparacionHasta,
        anillosFijacion: p.detalle.anillosFijacion,
        guardado: true,
        checklist: c.detalle.checklist.map((x) => ({ ...x, marcado: marcados.has(x.codigo) })),
      },
    };
  }
  if (p.recomendaciones) {
    c = {
      ...c,
      recomendaciones: p.recomendaciones.map((r, i) => ({ idRecomendacion: i, codigo: '', titulo: r.titulo, descripcion: r.descripcion ?? null, prioridad: r.prioridad ?? 'alta', plazo: null })),
      sinRecomendaciones: p.sinRecomendaciones ?? (p.recomendaciones.length > 0 ? false : c.sinRecomendaciones),
    };
  } else if (p.sinRecomendaciones !== undefined) c = { ...c, sinRecomendaciones: p.sinRecomendaciones };
  if (p.fallas) {
    const nombre = (lista: { codigo: string; nombre: string }[], codigo: string) => lista.find((x) => x.codigo === codigo)?.nombre ?? null;
    const fallas: Falla[] = p.fallas.map((f, i) => {
      const pruebas: LecturaPrueba[] = f.pruebas.map((x, j) => {
        const ev = evaluar(clase, e, x.carga, x.indicacion);
        return { tipo: x.tipo, orden: j + 1, posicion: x.posicion, carga: x.carga, indicacion: x.indicacion, error: ev.error ?? 0, emp: ev.emp, resultado: ev.resultado };
      });
      return {
        idObservacion: i, codigo: '', clasificacion: f.clasificacion, componente: f.componente,
        clasificacionNombre: nombre(c.opciones.clasificaciones, f.clasificacion), componenteNombre: nombre(c.opciones.componentes, f.componente),
        descripcion: f.descripcion, severidad: f.severidad, fotos: f.fotos, pruebas,
      };
    });
    c = { ...c, fallas, sinFallas: p.sinFallas ?? (fallas.length > 0 ? false : c.sinFallas) };
  } else if (p.sinFallas !== undefined) c = { ...c, sinFallas: p.sinFallas };
  if (p.comentarioPruebas !== undefined) c = { ...c, comentarioPruebas: p.comentarioPruebas };
  if (p.diagnostico) c = { ...c, diagnostico: { ...p.diagnostico } };
  return c;
}

/** Une dos envíos parciales de la cabecera: la última versión de cada sección gana. */
export function fusionarCabecera(previo: GuardarCabecera | null | undefined, nuevo: GuardarCabecera): GuardarCabecera {
  return { ...(previo ?? {}), ...nuevo };
}
