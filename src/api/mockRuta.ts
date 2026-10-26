import type {
  AccionEquipo,
  ContextoDemoras,
  Llegada,
  NuevaDemora,
  ObjetivoEquipo,
  Objetivos,
  ResultadoDemora,
  Ubicacion,
  ValidacionLlegada,
} from './ruta';

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
const estado = { demoras: [] as ContextoDemoras['demoras'], llegada: false, equipos: new Map<number, Partial<ObjetivoEquipo>>() };

function equiposBase(): ObjetivoEquipo[] {
  const base: ObjetivoEquipo[] = [
    {
      idOsEquipo: 1, idEquipo: 501, codigoTw: 'EQ-TW-2026-0501', codigoCliente: 'BAL-001', nombre: 'Báscula Camionera',
      marca: 'Mettler Toledo', modelo: 'VTC-221', numeroSerie: 'MT-552', ubicacion: 'Balanza 1', tipoIntervencion: 'Mantenimiento preventivo',
      estadoEquipo: 'Operativo en Planta', bloqueado: false, garantiaVigente: true, alertasPendientes: 1, estado: 'por_iniciar',
      tiempoEstimadoMin: 90, tiempoRealMin: 0, iniciadoEn: null, motivoPausa: null, requiereAprobacion: false,
      ultimaIntervencion: '2025-10-15', ultimaParte: 'Celda de carga: PDX 30t (serie B7)', puedeIniciar: true, puedePausar: false,
      puedeReanudar: false,
      cambios: [{ fecha: '2026-03-03T15:30:00', campo: 'Celda de carga', valorAnterior: 'PDX 30t (serie A1)', valorNuevo: 'PDX 30t (serie B7)', detalle: 'Cambio de celda', usuario: 'Jhonny Iparraguirre' }],
    },
    {
      idOsEquipo: 2, idEquipo: 502, codigoTw: 'EQ-TW-2026-0502', codigoCliente: 'IND-12', nombre: 'Indicador IND780',
      marca: 'Mettler Toledo', modelo: 'IND780', numeroSerie: 'IND-12', ubicacion: 'Cabina', tipoIntervencion: 'Mantenimiento preventivo',
      estadoEquipo: 'Operativo en Planta', bloqueado: false, garantiaVigente: null, alertasPendientes: 0, estado: 'pausado',
      tiempoEstimadoMin: 60, tiempoRealMin: 120, iniciadoEn: null, motivoPausa: 'Fallo de evidencia fotográfica', requiereAprobacion: true,
      ultimaIntervencion: null, ultimaParte: null, puedeIniciar: false, puedePausar: false, puedeReanudar: false, cambios: [],
    },
    {
      idOsEquipo: 3, idEquipo: 503, codigoTw: 'EQ-TW-2026-0503', codigoCliente: 'BAL-002', nombre: 'Balanza de Plataforma Industrial',
      marca: 'Mettler Toledo', modelo: 'PBA430', numeroSerie: 'MT-600', ubicacion: 'Almacén B', tipoIntervencion: 'Mantenimiento preventivo',
      estadoEquipo: 'En Evaluación', bloqueado: true, garantiaVigente: null, alertasPendientes: 0, estado: 'por_iniciar',
      tiempoEstimadoMin: 60, tiempoRealMin: 0, iniciadoEn: null, motivoPausa: null, requiereAprobacion: false,
      ultimaIntervencion: null, ultimaParte: null, puedeIniciar: false, puedePausar: false, puedeReanudar: false, cambios: [],
    },
  ];
  return base.map((e) => {
    const c = { ...e, ...estado.equipos.get(e.idOsEquipo) } as ObjetivoEquipo;
    const enPlanta = estado.llegada;
    return {
      ...c,
      puedeIniciar: enPlanta && !c.bloqueado && c.estado === 'por_iniciar',
      puedePausar: enPlanta && !c.bloqueado && c.estado === 'en_ejecucion',
      puedeReanudar: enPlanta && !c.bloqueado && c.estado === 'pausado' && !c.requiereAprobacion,
    };
  });
}

export const mockRuta = {
  async demoras(idOs: number): Promise<ContextoDemoras> {
    await esperar(300);
    const eta = `${hoy()}T08:30:00`;
    const min = estado.demoras.reduce((a, d) => a + d.duracionMinutos, 0);
    return {
      idOs, numeroOs: 'OS-000791', estadoOs: estado.llegada ? 'en_ejecucion' : 'en_ruta', cliente: 'Alicorp S.A.A.', sede: 'Planta Callao',
      salidaEn: `${hoy()}T07:45:00`, enRutaMinutos: 67, etaOriginal: eta, minutosDemora: min, etaVigente: sumar(eta, min), ahora: ahoraIso(),
      puedeRegistrar: !estado.llegada,
      motivos: [
        { idMotivo: 1, nombre: 'Tráfico', codigo: 'TRAFICO' },
        { idMotivo: 2, nombre: 'Accidente en ruta', codigo: 'ACCIDENTE_RUTA' },
        { idMotivo: 3, nombre: 'Problema mecánico del vehículo', codigo: 'PROBLEMA_VEHICULO' },
        { idMotivo: 4, nombre: 'Acceso denegado en planta', codigo: 'ACCESO_DENEGADO' },
        { idMotivo: 5, nombre: 'Esperando coordinación del cliente', codigo: 'ESPERA_CLIENTE' },
        { idMotivo: 6, nombre: 'Condición climática', codigo: 'CLIMA' },
        { idMotivo: 7, nombre: 'Otro motivo', codigo: 'OTRO' },
      ],
      demoras: estado.demoras,
    };
  },
  async registrarDemora(idOs: number, d: NuevaDemora): Promise<{ mensaje: string; datos: ResultadoDemora }> {
    await esperar(400);
    const ctx = await mockRuta.demoras(idOs);
    const nueva = sumar(ctx.etaVigente!, d.duracionMinutos);
    estado.demoras.unshift({
      idDemora: estado.demoras.length + 1, motivo: ctx.motivos.find((m) => m.idMotivo === d.idMotivo)?.nombre ?? null,
      duracionMinutos: d.duracionMinutos, descripcion: d.descripcion || null, fechaRegistro: ahoraIso(), etaRecalculada: nueva, tieneFoto: !!d.fotoUri,
    });
    return {
      mensaje: `Demora registrada. ETA recalculada: ${nueva.slice(11, 16)}. Se avisó a Operaciones.`,
      datos: { idDemora: estado.demoras.length, etaOriginal: ctx.etaOriginal, etaAnterior: ctx.etaVigente, etaRecalculada: nueva, notificados: 1 },
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
    // Modo demo: siempre dentro del rango
    return { resultado: 'valida', registrable: true, distanciaMetros: 12, radioMetros: 200, precisionMetros: u.precisionMetros, mensaje: 'Te encuentras dentro del rango permitido (a 12 m de la planta).' };
  },
  async registrarLlegada(_idOs: number): Promise<string> {
    await esperar(300);
    estado.llegada = true;
    return 'Llegada registrada. Ya puedes ver tus objetivos.';
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
        trasladoMin: estado.llegada ? 42 : null, enPlantaMin: estado.llegada ? 15 : null, estimadoMin: 210,
      },
      contadores: { completados, pendientes: todos.length - completados - observados, observados, total: todos.length },
      equipos,
    };
  },
  async qr(idOs: number, contenido: string): Promise<ObjetivoEquipo> {
    const codigo = contenido.split('/').pop() ?? contenido;
    const e = (await mockRuta.objetivos(idOs)).equipos.find((x) => [x.codigoTw, x.numeroSerie, x.codigoCliente].includes(codigo));
    if (!e) throw new Error(`El equipo «${codigo}» no está en esta orden de servicio.`);
    return e;
  },
  async cambiar(idOs: number, idOsEquipo: number, accion: AccionEquipo, motivo?: string) {
    await esperar(300);
    const anterior = equiposBase().find((e) => e.idOsEquipo === idOsEquipo);
    const nuevo = accion === 'pausar' ? 'pausado' : 'en_ejecucion';
    estado.equipos.set(idOsEquipo, {
      ...estado.equipos.get(idOsEquipo),
      estado: nuevo,
      motivoPausa: accion === 'pausar' ? (motivo ?? null) : null,
      cambios: [
        { fecha: ahoraIso(), campo: 'Estado', valorAnterior: anterior?.estado.replace('en_ejecucion', 'en ejecución').replace('_', ' ') ?? null, valorNuevo: nuevo.replace('en_ejecucion', 'en ejecución').replace('_', ' '), detalle: null, usuario: 'Juan Pérez' },
        ...(anterior?.cambios ?? []),
      ],
    });
    return { mensaje: accion === 'pausar' ? 'Equipo pausado.' : 'Trabajo iniciado en el equipo.', objetivos: await mockRuta.objetivos(idOs) };
  },
};
