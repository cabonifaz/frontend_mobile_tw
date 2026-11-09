import type {
  AccionEquipo,
  ContextoDemoras,
  Llegada,
  NuevaDemora,
  NuevoEquipo,
  ObjetivoEquipo,
  Objetivos,
  OpcionesEquipoNuevo,
  ResultadoDemora,
  ResultadoEquipoNuevo,
  ResultadoLlegada,
  Ubicacion,
  ValidacionLlegada,
} from './ruta';
import { evaluarLlegadaLocal } from '@/utilidades/llegada';

/**
 * Modo demo (EXPO_PUBLIC_USE_MOCK=true) de las HU-05, HU-06 y HU-07: la app funciona sin backend
 * para revisar las pantallas. Los datos viven en memoria mientras la app está abierta.
 */
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));
const hoy = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const ahoraIso = () => {
  const d = new Date();
  return `${hoy()}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:00`;
};
const sumar = (iso: string, min: number) => {
  const d = new Date(`${iso}-05:00`);
  d.setMinutes(d.getMinutes() + min);
  const l = new Date(d.getTime() - 5 * 3600_000);
  return l.toISOString().slice(0, 19);
};

const REFERENCIA = { latitud: -12.0453, longitud: -77.1137, radioMetros: 200 };
const estado = {
  demoras: [] as ContextoDemoras['demoras'],
  llegada: false,
  equipos: new Map<number, Partial<ObjetivoEquipo>>(),
  nuevos: [] as ObjetivoEquipo[],
};

function equiposBase(): ObjetivoEquipo[] {
  const comun = {
    garantia: undefined,
    estadoEquipo: 'Operativo en Planta', bloqueado: false, enCampo: false, faltaEquipo: false, alertasPendientes: 0, tiempoRealMin: 0,
    iniciadoEn: null, motivoPausa: null, requiereAprobacion: false, ultimaIntervencion: null, ultimaParte: null, cambios: [],
    puedeIniciar: false, puedePausar: false, puedeReanudar: false, estado: 'por_iniciar' as const,
  };
  const base: ObjetivoEquipo[] = [
    {
      ...comun, idOsEquipo: 1, idEquipo: 501, numero: 1, codigoTw: 'EQ-TW-2026-0501', codigoCliente: 'BAL-149', nombre: 'Balanza industrial unicelda de piso',
      marca: 'Precia Weight', modelo: '2456', numeroSerie: 'V000079-HD', ubicacion: 'Salida importación', tipoIntervencion: 'Mantenimiento correctivo',
      tipoCorto: 'MC', tiempoEstimadoMin: 60, ultimaIntervencion: '2025-10-15', ultimaParte: 'Celda de carga: PDX 30t (serie B7)',
      cambios: [{ fecha: '2026-03-03T15:30:00', campo: 'Celda de carga', valorAnterior: 'PDX 30t (serie A1)', valorNuevo: 'PDX 30t (serie B7)', detalle: 'Cambio de celda', usuario: 'Admin TW' }],
    },
    {
      ...comun, idOsEquipo: 2, idEquipo: 502, numero: 2, codigoTw: 'EQ-TW-2026-0502', codigoCliente: 'BAL-085', nombre: 'Balanza industrial unicelda de piso',
      marca: 'Precia Weight', modelo: '2456SS', numeroSerie: 'D0137898CH', ubicacion: 'Cámara de recepción', tipoIntervencion: 'Mantenimiento correctivo',
      tipoCorto: 'MC', tiempoEstimadoMin: 60,
    },
    {
      ...comun, idOsEquipo: 3, idEquipo: 503, numero: 3, codigoTw: 'EQ-TW-2026-0503', codigoCliente: null, nombre: 'Balanza suspendida',
      marca: null, modelo: null, numeroSerie: null, ubicacion: null, tipoIntervencion: 'Calibración', tipoCorto: null, tiempoEstimadoMin: 30, faltaEquipo: true,
    },
    {
      ...comun, idOsEquipo: 4, idEquipo: 504, numero: 4, codigoTw: 'EQ-TW-2026-0504', codigoCliente: 'BAL-006', nombre: 'Balanza industrial de plataforma',
      marca: 'Precia Weight', modelo: '2456', numeroSerie: '154318-0219', ubicacion: 'Aforo importación', tipoIntervencion: 'Calibración', tipoCorto: null,
      tiempoEstimadoMin: 30, estadoEquipo: 'En Evaluación', bloqueado: true,
    },
    {
      ...comun, idOsEquipo: 5, idEquipo: 505, numero: 5, codigoTw: 'EQ-TW-2026-0505', codigoCliente: 'BAL-007', nombre: 'Balanza industrial de plataforma',
      marca: 'Precia Weight', modelo: '2456', numeroSerie: '154319-0219', ubicacion: 'Salida importación', tipoIntervencion: 'Calibración', tipoCorto: null,
      tiempoEstimadoMin: 30,
    },
  ].map(({ garantia: _g, ...e }) => e as ObjetivoEquipo);
  return [...base, ...estado.nuevos].map((e) => {
    const c = { ...e, ...estado.equipos.get(e.idOsEquipo) } as ObjetivoEquipo;
    const enPlanta = estado.llegada;
    return {
      ...c,
      puedeIniciar: enPlanta && !c.bloqueado && (c.estado === 'por_iniciar' || c.estado === 'observado'),
      puedePausar: enPlanta && !c.bloqueado && c.estado === 'en_ejecucion',
      puedeReanudar: enPlanta && !c.bloqueado && c.estado === 'pausado' && !c.requiereAprobacion,
    };
  });
}

export const mockRuta = {
  async demoras(idOs: number): Promise<ContextoDemoras> {
    await esperar(300);
    const eta = `${hoy()}T08:30:00`;
    const min = estado.demoras.filter((x) => x.tipo === 'llegada').reduce((a, d) => a + d.duracionMinutos, 0);
    const ultimoIngreso = estado.demoras.find((x) => x.tipo === 'ingreso')?.etaRecalculada ?? null;
    const ahora = ahoraIso();
    // Igual que el back: las demoras son excluyentes. Antes de llegar solo "llegada"; ya en planta, y sin trabajo iniciado, solo "ingreso".
    const trabajoIniciado = [...estado.equipos.values()].some((e) => e.estado === 'en_ejecucion' || e.estado === 'completado');
    const puedeLlegada = !estado.llegada;
    const puedeIngreso = estado.llegada && !trabajoIniciado;
    return {
      idOs, numeroOs: 'OS-000791', estadoOs: estado.llegada ? 'en_ejecucion' : 'en_ruta', cliente: 'Alicorp S.A.A.', sede: 'Planta Callao',
      salidaEn: `${hoy()}T07:45:00`, enRutaMinutos: 67, llegadaEn: estado.llegada ? `${hoy()}T08:42:00` : null,
      enPlantaMinutos: estado.llegada ? 18 : null, etaOriginal: eta, minutosDemora: min, etaVigente: sumar(eta, min),
      inicioPrevisto: ultimoIngreso && ultimoIngreso > ahora ? ultimoIngreso : ahora, ahora,
      puedeRegistrar: puedeLlegada || puedeIngreso, puedeLlegada, puedeIngreso,
      motivoNoRegistra: puedeLlegada || puedeIngreso ? null : 'Las demoras se registran durante el traslado o al ingresar a la planta, antes de iniciar el trabajo.',
      motivos: [
        { idMotivo: 1, nombre: 'Tráfico', codigo: 'TRAFICO', ambito: 'traslado' },
        { idMotivo: 2, nombre: 'Accidente en ruta', codigo: 'ACCIDENTE_RUTA', ambito: 'traslado' },
        { idMotivo: 3, nombre: 'Problema mecánico del vehículo', codigo: 'PROBLEMA_VEHICULO', ambito: 'traslado' },
        { idMotivo: 4, nombre: 'Acceso denegado en planta', codigo: 'ACCESO_DENEGADO', ambito: 'ingreso' },
        { idMotivo: 5, nombre: 'Esperando coordinación del cliente', codigo: 'ESPERA_CLIENTE', ambito: 'ingreso' },
        { idMotivo: 6, nombre: 'Condición climática', codigo: 'CLIMA', ambito: 'traslado' },
        { idMotivo: 7, nombre: 'Otro motivo', codigo: 'OTRO', ambito: 'ambos' },
      ],
      demoras: estado.demoras,
    };
  },
  async registrarDemora(idOs: number, d: NuevaDemora): Promise<{ mensaje: string; datos: ResultadoDemora }> {
    await esperar(400);
    const ctx = await mockRuta.demoras(idOs);
    const anterior = d.tipo === 'ingreso' ? ctx.inicioPrevisto! : ctx.etaVigente!;
    const nueva = sumar(anterior, d.duracionMinutos);
    estado.demoras.unshift({
      idDemora: estado.demoras.length + 1, tipo: d.tipo, motivo: ctx.motivos.find((m) => m.idMotivo === d.idMotivo)?.nombre ?? null,
      duracionMinutos: d.duracionMinutos, descripcion: d.descripcion || null, fechaRegistro: ahoraIso(), etaAnterior: anterior,
      etaRecalculada: nueva, tieneFoto: !!d.fotoUri, latitud: d.ubicacion.latitud, longitud: d.ubicacion.longitud,
    });
    return {
      mensaje: d.tipo === 'ingreso'
        ? `Demora registrada. Inicio del trabajo previsto: ${nueva.slice(11, 16)}. Se avisó a Operaciones.`
        : `Demora registrada. ETA recalculada: ${nueva.slice(11, 16)}. Se avisó a Operaciones.`,
      datos: { idDemora: estado.demoras.length, tipo: d.tipo, etaOriginal: ctx.etaOriginal, etaAnterior: anterior, etaRecalculada: nueva, notificados: 1 },
    };
  },
  async llegada(idOs: number): Promise<Llegada> {
    await esperar(300);
    return {
      idOs, numeroOs: 'OS-000791', estadoOs: estado.llegada ? 'en_ejecucion' : 'en_ruta', cliente: 'Alicorp S.A.A.', sede: 'Planta Callao',
      direccion: 'Av. Argentina 4793, Callao', horaProgramada: '08:30', referencia: REFERENCIA, salidaEn: `${hoy()}T07:45:00`,
      llegada: estado.llegada ? { en: ahoraIso(), latitud: REFERENCIA.latitud, longitud: REFERENCIA.longitud, precisionMetros: 7, distanciaMetros: 12, resultado: 'valida' } : null,
      puedeRegistrar: !estado.llegada, precisionMaximaMetros: 100,
    };
  },
  async validar(u: Ubicacion): Promise<ValidacionLlegada> {
    await esperar(300);
    // Modo demo: las mismas reglas del back sobre la planta de prueba (Planta Callao, radio de 200 m, precisión máxima de 100 m)
    return evaluarLlegadaLocal(REFERENCIA, u, 100);
  },
  async registrarLlegada(_idOs: number): Promise<{ mensaje: string; datos: ResultadoLlegada | null }> {
    await esperar(300);
    estado.llegada = true;
    return {
      mensaje: 'Llegada registrada. Ya puedes ver tus objetivos.',
      datos: { idEvento: 1, llegadaEn: ahoraIso(), distanciaMetros: 12, precisionMetros: 7, resultado: 'valida', yaRegistrada: false, diferida: false },
    };
  },
  async objetivos(idOs: number, buscar = ''): Promise<Objetivos> {
    await esperar(300);
    const q = buscar.trim().toLowerCase();
    const todos = equiposBase();
    const equipos = q
      ? todos.filter((e) => [e.codigoTw, e.codigoCliente, e.marca, e.modelo, e.numeroSerie, e.ubicacion, e.nombre].some((v) => v?.toLowerCase().includes(q)))
      : todos;
    const completados = todos.filter((e) => e.estado === 'completado').length;
    const observados = todos.filter((e) => e.estado === 'observado' || (e.estado === 'pausado' && e.requiereAprobacion)).length;
    return {
      resumen: {
        idOs, numeroOs: 'OS-000791', estadoOs: estado.llegada ? 'en_ejecucion' : 'en_ruta', cliente: 'Alicorp S.A.A.', sede: 'Planta Callao',
        llegadaRegistrada: estado.llegada, salidaEn: `${hoy()}T07:45:00`, llegadaEn: estado.llegada ? `${hoy()}T08:27:00` : null,
        trasladoMin: estado.llegada ? 42 : null, enPlantaMin: estado.llegada ? 15 : null,
        estimadoMin: todos.reduce((a, e) => a + (e.tiempoEstimadoMin ?? 0), 0),
      },
      contadores: { completados, pendientes: todos.length - completados - observados, observados, total: todos.length },
      equipos,
    };
  },
  async qr(idOs: number, contenido: string): Promise<ObjetivoEquipo> {
    const codigo = (contenido.split('/').pop() ?? contenido).trim().toUpperCase();
    const e = (await mockRuta.objetivos(idOs)).equipos.find((x) => [x.codigoTw, x.numeroSerie, x.codigoCliente].some((v) => v?.toUpperCase() === codigo));
    if (!e) throw new Error('El código escaneado no corresponde a ningún equipo de esta O/S. Búscalo en la lista o regístralo como equipo nuevo (NEW).');
    return e;
  },
  async opcionesEquipoNuevo(): Promise<OpcionesEquipoNuevo> {
    await esperar(200);
    return {
      marcas: ['Precia Weight', 'Mettler Toledo', 'Ohaus', 'Sartorius', 'Avery Weigh-Tronix', 'Fairbanks', 'Toledo', 'Flintec'],
      tipos: [
        { idSuministro: 11, descripcion: 'Balanza industrial de plataforma', clase: 'equipo', marca: null, modelo: null },
        { idSuministro: 12, descripcion: 'Balanza industrial unicelda de piso', clase: 'equipo', marca: null, modelo: null },
        { idSuministro: 13, descripcion: 'Báscula camionera', clase: 'equipo', marca: null, modelo: null },
        { idSuministro: 14, descripcion: 'Indicador de pesaje', clase: 'instrumento', marca: null, modelo: null },
      ],
    };
  },
  async registrarEquipoNuevo(e: NuevoEquipo): Promise<{ mensaje: string; datos: ResultadoEquipoNuevo }> {
    await esperar(400);
    const opciones = await mockRuta.opcionesEquipoNuevo();
    const id = 900 + estado.nuevos.length + 1;
    const existente = equiposBase().find((x) => x.numeroSerie?.toUpperCase() === e.numeroSerie.trim().toUpperCase());
    if (existente) throw new Error(`Este equipo ya está en la lista de la O/S (${existente.codigoTw}): búscalo y selecciónalo.`);
    estado.nuevos.push({
      idOsEquipo: id, idEquipo: id, numero: 5 + estado.nuevos.length + 1, codigoTw: `NEW-${String(id).padStart(6, '0')}`, codigoCliente: e.codigo.trim(),
      nombre: opciones.tipos.find((t) => t.idSuministro === e.idSuministro)?.descripcion ?? 'Equipo', marca: e.marca, modelo: e.modelo.trim(),
      numeroSerie: e.numeroSerie.trim(), ubicacion: e.ubicacion.trim(), tipoIntervencion: 'Mantenimiento correctivo', tipoCorto: 'MC', estadoEquipo: null,
      bloqueado: false, enCampo: true, faltaEquipo: false, alertasPendientes: 0, estado: 'por_iniciar', tiempoEstimadoMin: 60, tiempoRealMin: 0, iniciadoEn: null,
      motivoPausa: null, requiereAprobacion: false, ultimaIntervencion: null, ultimaParte: null, puedeIniciar: false, puedePausar: false, puedeReanudar: false,
      cambios: [],
    });
    return {
      mensaje: 'Equipo registrado. El COD TW lo asigna la intranet al aprobar el registro.',
      datos: { idOsEquipo: id, idEquipo: id, codigoTw: `NEW-${String(id).padStart(6, '0')}`, yaExistia: false, yaRegistrado: false, notificados: 1 },
    };
  },
  async cambiar(idOs: number, idOsEquipo: number, accion: AccionEquipo, motivo?: string) {
    await esperar(300);
    const anterior = equiposBase().find((e) => e.idOsEquipo === idOsEquipo);
    const otro = accion !== 'pausar' ? equiposBase().find((e) => e.idOsEquipo !== idOsEquipo && e.estado === 'en_ejecucion') : undefined;
    if (otro) throw new Error(`Ya estás trabajando en el equipo ${otro.codigoCliente ?? otro.nombre}: pausa ese equipo antes de continuar con otro.`);
    const nuevo = accion === 'pausar' ? 'pausado' : 'en_ejecucion';
    estado.equipos.set(idOsEquipo, {
      ...estado.equipos.get(idOsEquipo),
      estado: nuevo,
      iniciadoEn: anterior?.iniciadoEn ?? ahoraIso(),
      motivoPausa: accion === 'pausar' ? (motivo ?? null) : null,
      cambios: [
        { fecha: ahoraIso(), campo: 'Estado', valorAnterior: anterior?.estado.replace('en_ejecucion', 'en ejecución').replace('_', ' ') ?? null, valorNuevo: nuevo.replace('en_ejecucion', 'en ejecución').replace('_', ' '), detalle: null, usuario: 'Juan Pérez' },
        ...(anterior?.cambios ?? []),
      ],
    });
    return { mensaje: accion === 'pausar' ? 'Equipo pausado.' : 'Trabajo iniciado en el equipo.', objetivos: await mockRuta.objetivos(idOs) };
  },
};
