import { entorno } from '@/config/entorno';
import { evaluar } from '@/utilidades/ensayos';
import { agregarArchivo } from './archivosLocales';
import { solicitar } from './cliente';
import { conRespaldo, type ConRespaldo } from './respaldo';
import type { Ubicacion } from './ruta';

/**
 * HU-15 y HU-16 — Cabecera del informe del equipo (Datos · Detalle Serv. · Observación y pruebas) y Hard Stop de cierre.
 *   GET  api/movil/servicios/{idOs}/equipos/{idOsEquipo}/cabecera-informe        → SP_ObtenerCabeceraInformeMovil
 *   PUT  api/movil/servicios/{idOs}/equipos/{idOsEquipo}/cabecera-informe        → SP_GuardarCabeceraInformeMovil (devuelve la cabecera actualizada)
 *   POST api/movil/servicios/{idOs}/equipos/{idOsEquipo}/cabecera-informe/fotos  → SP_RegistrarFotoFallaMovil (multipart; la foto se ve con /evidencias/{id}/archivo)
 *   GET  api/movil/servicios/{idOs}/equipos/{idOsEquipo}/cierre                  → SP_ValidarCierreEquipoMovil (Hard Stop: las 5 etapas)
 *   POST api/movil/servicios/{idOs}/equipos/{idOsEquipo}/informe                 → SP_GenerarInformeEquipoMovil (genera el informe técnico y completa el equipo)
 * El back decide todo (estado de las etapas, E = I − L, EMP, conformidad, N° de informe): la app muestra y arma el cuerpo.
 */

export type Severidad = 'baja' | 'media' | 'alta' | 'critica';
export type EstadoEquipoFinal = 'operativo' | 'con_observaciones' | 'inoperativo';
export type TipoPrueba = 'repetibilidad' | 'pesaje' | 'excentricidad';
export type Prioridad = 'alta' | 'media' | 'baja';
export type ResultadoPrueba = 'conforme' | 'no_conforme' | null;

export interface DatosInforme {
  idOs: number;
  numeroOs: string;
  /** OS (servicio técnico) u OM (metrología), según el área de la RQ. */
  tipoOrden: 'OS' | 'OM' | string;
  numeroRq: string | null;
  idInforme: number | null;
  /** NNNN-AAAA; null hasta generar el informe. */
  numeroInforme: string | null;
  generado: boolean;
  /** El equipo está en ejecución y el informe aún no se generó. */
  puedeEditar: boolean;
  empresa: string | null;
  ruc: string | null;
  direccion: string | null;
  contacto: string | null;
  contactoCargo: string | null;
  contactoTelefono: string | null;
  contactoCorreo: string | null;
  marca: string | null;
  modelo: string | null;
  numSerie: string | null;
  codigoCliente: string | null;
  codigoTw: string | null;
  capacidadMax: string | null;
  d: string | null;
  e: string | null;
  ubicacion: string | null;
  clase: string | null;
  propuesta: string | null;
  comercial: string | null;
  tecnico: string | null;
  fecha: string | null;
  horaInicio: string | null;
  horaFin: string | null;
  tipoServicio: string | null;
  /** "Quién atiende en planta": lo guardado o, si no hay, el contacto de la OS. */
  responsableNombre: string | null;
  responsableCargo: string | null;
  responsableTelefono: string | null;
  guardadaEn: string | null;
}

export interface PasoChecklist {
  codigo: string;
  titulo: string;
  orden: number;
  marcado: boolean;
}

export interface DetalleServicio {
  tipoEquipo: string | null;
  celdas: number[];
  sumatoriaHasta: number | null;
  comparacionHasta: number | null;
  anillosFijacion: boolean | null;
  /** Ya se guardó alguna vez (Detalle Serv. cuenta como completo). */
  guardado: boolean;
  checklist: PasoChecklist[];
}

export interface Recomendacion {
  idRecomendacion: number;
  codigo: string;
  titulo: string;
  descripcion: string | null;
  prioridad: Prioridad | string;
  plazo: string | null;
}

export interface LecturaPrueba {
  tipo: TipoPrueba | string;
  orden: number;
  posicion: number | null;
  carga: number;
  indicacion: number;
  error: number;
  emp: number | null;
  resultado: ResultadoPrueba | string;
}

export interface Falla {
  idObservacion: number;
  codigo: string;
  clasificacion: string;
  componente: string;
  clasificacionNombre: string | null;
  componenteNombre: string | null;
  descripcion: string;
  severidad: Severidad | string;
  /** Ids de evidencia de sus fotos (se ven con urlArchivoEvidencia). */
  fotos: number[];
  pruebas: LecturaPrueba[];
}

export interface LecturaGeneral {
  orden: number;
  carga: number | null;
  indicacion: number | null;
  error: number | null;
  emp: number | null;
  resultado: ResultadoPrueba | string;
  critico: boolean;
}

export interface CargaExcentricidadGeneral {
  grupo: number;
  carga: number | null;
  lecturas: LecturaGeneral[];
}

export interface PruebasGenerales {
  /** Ensayos y Calibración ya finalizó. */
  finalizado: boolean;
  errorCritico: string | null;
  pesaje: LecturaGeneral[];
  excentricidad: CargaExcentricidadGeneral[];
}

export interface Diagnostico {
  severidadGeneral: Severidad | null;
  estadoEquipo: EstadoEquipoFinal | null;
  revisionJefatura: boolean;
  precotizacion: boolean;
  segundaVisita: boolean;
  aplicaGarantia: boolean;
}

export interface OpcionInforme {
  codigo: string;
  nombre: string;
  /** Solo en los componentes: la clasificación a la que pertenecen. */
  clasificacion: string | null;
}

export interface CabeceraInforme {
  datos: DatosInforme;
  detalle: DetalleServicio;
  recomendaciones: Recomendacion[];
  sinRecomendaciones: boolean;
  fallas: Falla[];
  sinFallas: boolean;
  pruebasGenerales: PruebasGenerales;
  comentarioPruebas: string | null;
  diagnostico: Diagnostico;
  opciones: { tiposEquipo: OpcionInforme[]; clasificaciones: OpcionInforme[]; componentes: OpcionInforme[] };
}

// ── Lo que se envía al guardar: una sección que no va, no se toca ───────────────────────────────

export interface CuerpoFalla {
  clasificacion: string;
  componente: string;
  severidad: Severidad;
  descripcion: string;
  fotos: number[];
  pruebas: { tipo: TipoPrueba; posicion: number | null; carga: number; indicacion: number }[];
}

export interface GuardarCabecera {
  datos?: { responsableNombre: string | null; responsableCargo: string | null; responsableTelefono: string | null };
  detalle?: { tipoEquipo: string | null; celdas: number[]; sumatoriaHasta: number | null; comparacionHasta: number | null; anillosFijacion: boolean | null; checks: string[] };
  recomendaciones?: { titulo: string; descripcion?: string | null; prioridad?: Prioridad }[];
  sinRecomendaciones?: boolean;
  fallas?: CuerpoFalla[];
  sinFallas?: boolean;
  comentarioPruebas?: string | null;
  diagnostico?: {
    severidadGeneral: Severidad | null;
    estadoEquipo: EstadoEquipoFinal | null;
    revisionJefatura: boolean;
    precotizacion: boolean;
    segundaVisita: boolean;
    aplicaGarantia: boolean;
  };
}

// ── HU-16 · Hard Stop ───────────────────────────────────────────────────────────────────────────

export interface EtapaCierre {
  orden: number;
  codigo: string;
  nombre: string;
  /** conforme · en_curso · pendiente · bloqueado · no_conforme */
  estado: string;
  detalle: string | null;
  /** Textos de lo que falta ("Falta la foto Final", "Error crítico en 20,000 kg (+34 kg · EMP ±20 kg)"…). */
  pendientes: string[];
}

export interface CierreEquipo {
  /** Las 5 etapas conformes, equipo en ejecución e informe aún sin generar. */
  puedeGenerar: boolean;
  yaGenerado: boolean;
  numeroInforme: string | null;
  conformes: number;
  total: number;
  pendientes: number;
  estadoEquipo: string;
  equipo: string;
  numeroOs: string;
  etapas: EtapaCierre[];
}

export interface InformeGenerado {
  idInforme: number;
  numeroInforme: string;
  estadoEquipo: string;
  repetida: boolean;
}

const base = (idOs: number, idOsEquipo: number) =>
  `/api/movil/servicios/${encodeURIComponent(String(idOs))}/equipos/${encodeURIComponent(String(idOsEquipo))}`;

export async function obtenerCabeceraInforme(token: string, idOs: number, idOsEquipo: number): Promise<CabeceraInforme> {
  if (entorno.usarMock) return mockInforme.obtener();
  return (await solicitar<CabeceraInforme>(`${base(idOs, idOsEquipo)}/cabecera-informe`, { token })).datos!;
}

/** Igual que `obtenerCabeceraInforme`, pero sin conexión muestra lo último guardado en el teléfono (guardar exige conexión). */
export async function obtenerCabeceraInformeConRespaldo(token: string, idUsuario: number, idOs: number, idOsEquipo: number): Promise<ConRespaldo<CabeceraInforme>> {
  if (entorno.usarMock) return { datos: await mockInforme.obtener(), sinConexion: false, guardadoEn: new Date() };
  return conRespaldo(idUsuario, `informe.${idOs}.${idOsEquipo}`, () => obtenerCabeceraInforme(token, idOs, idOsEquipo));
}

export async function guardarCabeceraInforme(
  token: string,
  idOs: number,
  idOsEquipo: number,
  cuerpo: GuardarCabecera,
): Promise<{ mensaje: string; cabecera: CabeceraInforme | null }> {
  if (entorno.usarMock) return mockInforme.guardar(cuerpo);
  const r = await solicitar<CabeceraInforme>(`${base(idOs, idOsEquipo)}/cabecera-informe`, { token, metodo: 'PUT', cuerpo });
  return { mensaje: r.mensaje, cabecera: r.datos ?? null };
}

/** Sube la foto de una falla; devuelve su id de evidencia (se envía en `fotos` de la falla al guardar). */
export async function subirFotoFalla(token: string, idOs: number, idOsEquipo: number, uri: string, ubicacion?: Ubicacion | null): Promise<number> {
  if (entorno.usarMock) return mockInforme.foto();
  const form = new FormData();
  form.append('capturadoEn', new Date().toISOString());
  if (ubicacion) {
    form.append('latitud', ubicacion.latitud.toFixed(7));
    form.append('longitud', ubicacion.longitud.toFixed(7));
    form.append('precisionMetros', ubicacion.precisionMetros.toFixed(1));
  }
  await agregarArchivo(form, 'archivo', uri, 'falla.jpg', 'image/jpeg');
  const r = await solicitar<{ idEvidencia: number }>(`${base(idOs, idOsEquipo)}/cabecera-informe/fotos`, { token, metodo: 'POST', cuerpo: form, timeoutMs: 60_000 });
  return r.datos!.idEvidencia;
}

export async function validarCierre(token: string, idOs: number, idOsEquipo: number): Promise<CierreEquipo> {
  if (entorno.usarMock) return mockInforme.cierre();
  return (await solicitar<CierreEquipo>(`${base(idOs, idOsEquipo)}/cierre`, { token })).datos!;
}

export async function generarInforme(token: string, idOs: number, idOsEquipo: number): Promise<InformeGenerado> {
  if (entorno.usarMock) return mockInforme.generar();
  return (await solicitar<InformeGenerado>(`${base(idOs, idOsEquipo)}/informe`, { token, metodo: 'POST' })).datos!;
}

// ── Modo demo (EXPO_PUBLIC_USE_MOCK=true): los datos de las maquetas viven en memoria mientras la app está abierta ──
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

const CLAS = [
  { codigo: 'electrica', nombre: 'Eléctrica', clasificacion: null },
  { codigo: 'electronica', nombre: 'Electrónica', clasificacion: null },
  { codigo: 'mecanica', nombre: 'Mecánica', clasificacion: null },
  { codigo: 'estructural', nombre: 'Estructural', clasificacion: null },
];
const COMP = [
  { codigo: 'caja_conexiones', nombre: 'Caja de conexiones', clasificacion: 'electrica' },
  { codigo: 'celda_carga', nombre: 'Celda de carga', clasificacion: 'electrica' },
  { codigo: 'indicador', nombre: 'Indicador', clasificacion: 'electronica' },
  { codigo: 'plataforma', nombre: 'Plataforma', clasificacion: 'mecanica' },
  { codigo: 'estructura', nombre: 'Estructura', clasificacion: 'estructural' },
];
const CHECKS = ['Desmontaje de balanza', 'Revisión de celda(s)', 'Revisión de tarjetas electrónicas', 'Limpieza de carcasa', 'Revisión y/o limpieza de estructura', 'Pintado de estructura',
  'Revisión de piezas mecánicas', 'Ajuste con pesas patrones', 'Revisión de caja sumatoria', 'Pruebas de correcto funcionamiento', 'Balanza queda operativa'];

const demo = {
  guardada: false,
  generado: false,
  resp: { nombre: 'Rosa Quispe', cargo: 'Jefa de almacén', telefono: '987 111 222' },
  detalle: { tipoEquipo: 'balanza_plataforma_industrial', celdas: [0.3, 0.2, 0.2, 0.3], sumatoria: 1500 as number | null, comparacion: 3000 as number | null, anillos: true as boolean | null, checks: new Set<string>() },
  detalleGuardado: false,
  recs: [] as { titulo: string; descripcion: string | null; prioridad: Prioridad }[],
  sinRecs: false,
  fallas: [] as CuerpoFalla[],
  sinFallas: false,
  comentario: null as string | null,
  diag: { severidadGeneral: null, estadoEquipo: null, revisionJefatura: false, precotizacion: false, segundaVisita: false, aplicaGarantia: false } as Diagnostico,
  fotos: 100,
};

function cabeceraDemo(): CabeceraInforme {
  const fallas: Falla[] = demo.fallas.map((f, i) => ({
    idObservacion: i + 1,
    codigo: `OBS-${String(i + 1).padStart(2, '0')}`,
    clasificacion: f.clasificacion,
    componente: f.componente,
    clasificacionNombre: CLAS.find((c) => c.codigo === f.clasificacion)?.nombre ?? null,
    componenteNombre: COMP.find((c) => c.codigo === f.componente)?.nombre ?? null,
    descripcion: f.descripcion,
    severidad: f.severidad,
    fotos: f.fotos,
    pruebas: f.pruebas.map((p, j) => {
      const ev = evaluar('III', 1, p.carga, p.indicacion);
      return { tipo: p.tipo, orden: j + 1, posicion: p.posicion, carga: p.carga, indicacion: p.indicacion, error: ev.error ?? 0, emp: ev.emp, resultado: ev.resultado };
    }),
  }));
  return {
    datos: {
      idOs: 845,
      numeroOs: 'OS-000845',
      tipoOrden: 'OS',
      numeroRq: 'RQ-0312-2026',
      idInforme: 1,
      numeroInforme: demo.generado ? '0921-2026' : null,
      generado: demo.generado,
      puedeEditar: !demo.generado,
      empresa: 'Molinos del Sur S.A.C.',
      ruc: '20601234567',
      direccion: 'Av. Industrial 1250, Ate, Lima',
      contacto: 'Rosa Quispe',
      contactoCargo: 'Jefa de almacén',
      contactoTelefono: '987 111 222',
      contactoCorreo: 'rquispe@molinosdelsur.pe',
      marca: 'Mettler Toledo',
      modelo: 'PBA430',
      numSerie: '3141592',
      codigoCliente: 'BAL-012',
      codigoTw: 'COD-0000845',
      capacidadMax: '3,000 kg',
      d: '1 kg',
      e: '1 kg',
      ubicacion: 'ALMACÉN DE DESPACHO',
      clase: 'III',
      propuesta: '0288-1-2026',
      comercial: 'MTORRES',
      tecnico: 'Juan Pérez',
      fecha: '2026-10-26',
      horaInicio: '09:10',
      horaFin: '10:40',
      tipoServicio: 'MC · Mantenimiento y ajuste',
      responsableNombre: demo.resp.nombre,
      responsableCargo: demo.resp.cargo,
      responsableTelefono: demo.resp.telefono,
      guardadaEn: demo.guardada ? new Date().toISOString() : null,
    },
    detalle: {
      tipoEquipo: demo.detalle.tipoEquipo,
      celdas: demo.detalle.celdas,
      sumatoriaHasta: demo.detalle.sumatoria,
      comparacionHasta: demo.detalle.comparacion,
      anillosFijacion: demo.detalle.anillos,
      guardado: demo.detalleGuardado,
      checklist: CHECKS.map((titulo, i) => ({ codigo: `paso_${i + 1}`, titulo, orden: i + 1, marcado: demo.detalle.checks.has(`paso_${i + 1}`) })),
    },
    recomendaciones: demo.recs.map((r, i) => ({ idRecomendacion: i + 1, codigo: `REC-${String(i + 1).padStart(2, '0')}`, titulo: r.titulo, descripcion: r.descripcion, prioridad: r.prioridad, plazo: 'Inmediato' })),
    sinRecomendaciones: demo.sinRecs,
    fallas,
    sinFallas: demo.sinFallas,
    pruebasGenerales: {
      finalizado: true,
      errorCritico: null,
      pesaje: [500, 1000, 3000].map((c, i) => ({ orden: i + 1, carga: c, indicacion: c + (i === 0 ? 0 : 1), error: i === 0 ? 0 : 1, emp: i === 0 ? 0.5 : i === 1 ? 1 : 1.5, resultado: 'conforme', critico: false })),
      excentricidad: [{ grupo: 1, carga: 1000, lecturas: [1000, 1001, 999, 1000, 1001].map((v, i) => ({ orden: i + 1, carga: 1000, indicacion: v, error: v - 1000, emp: 1, resultado: 'conforme', critico: false })) }],
    },
    comentarioPruebas: demo.comentario,
    diagnostico: demo.diag,
    opciones: { tiposEquipo: [{ codigo: 'balanza_plataforma_industrial', nombre: 'Plataforma', clasificacion: null }], clasificaciones: CLAS, componentes: COMP },
  };
}

const mockInforme = {
  async obtener(): Promise<CabeceraInforme> {
    await esperar(250);
    return cabeceraDemo();
  },
  async guardar(c: GuardarCabecera) {
    await esperar(350);
    if (c.datos) demo.resp = { nombre: c.datos.responsableNombre ?? '', cargo: c.datos.responsableCargo ?? '', telefono: c.datos.responsableTelefono ?? '' };
    if (c.detalle) {
      demo.detalle = { tipoEquipo: c.detalle.tipoEquipo ?? demo.detalle.tipoEquipo, celdas: c.detalle.celdas, sumatoria: c.detalle.sumatoriaHasta, comparacion: c.detalle.comparacionHasta, anillos: c.detalle.anillosFijacion, checks: new Set(c.detalle.checks) };
      demo.detalleGuardado = true;
    }
    if (c.recomendaciones) demo.recs = c.recomendaciones.map((r) => ({ titulo: r.titulo, descripcion: r.descripcion ?? null, prioridad: r.prioridad ?? 'alta' }));
    if (c.sinRecomendaciones !== undefined) demo.sinRecs = c.sinRecomendaciones;
    if (c.fallas) demo.fallas = c.fallas;
    if (c.sinFallas !== undefined) demo.sinFallas = c.sinFallas;
    if (c.comentarioPruebas !== undefined) demo.comentario = c.comentarioPruebas;
    if (c.diagnostico) demo.diag = c.diagnostico;
    demo.guardada = true;
    return { mensaje: 'Cabecera del informe guardada.', cabecera: cabeceraDemo() };
  },
  async foto() {
    await esperar(300);
    demo.fotos += 1;
    return demo.fotos;
  },
  async cierre(): Promise<CierreEquipo> {
    await esperar(300);
    const completo = demo.guardada && demo.detalleGuardado && demo.diag.severidadGeneral !== null && demo.diag.estadoEquipo !== null;
    const cab = completo ? [] : ['Falta completar el Diagnóstico final'];
    const etapas: EtapaCierre[] = [
      { orden: 1, codigo: 'variables', nombre: 'Variables ambientales', estado: 'conforme', detalle: 'T° 24,8 °C · h 60 %', pendientes: [] },
      { orden: 2, codigo: 'fotos', nombre: 'Registro fotográfico', estado: 'pendiente', detalle: '9 de 11', pendientes: ['Falta la foto Final', 'Falta la foto del QR'] },
      { orden: 3, codigo: 'ensayos', nombre: 'Ensayos y Calibración', estado: 'no_conforme', detalle: 'Pesaje guardado con error crítico', pendientes: ['Error crítico en 20,000 kg (+34 kg · EMP ±20 kg)'] },
      { orden: 4, codigo: 'cabecera', nombre: 'Cabecera del informe', estado: completo ? 'conforme' : 'en_curso', detalle: completo ? 'Cabecera completa' : cab[0], pendientes: cab },
      { orden: 5, codigo: 'correlativo', nombre: 'Correlativo y certificado', estado: 'pendiente', detalle: 'Ticket TK-MET-00241 pendiente', pendientes: ['Esperando el correlativo de Metrología (TK-MET-00241)'] },
    ];
    const pend = etapas.reduce((n, e) => n + e.pendientes.length, 0);
    return { puedeGenerar: false, yaGenerado: demo.generado, numeroInforme: demo.generado ? '0921-2026' : null, conformes: etapas.filter((e) => e.estado === 'conforme').length, total: 5, pendientes: pend, estadoEquipo: 'en_ejecucion', equipo: 'Balanza de plataforma #01', numeroOs: 'OS-000845', etapas };
  },
  async generar(): Promise<InformeGenerado> {
    await esperar(400);
    demo.generado = true;
    return { idInforme: 1, numeroInforme: '0921-2026', estadoEquipo: 'completado', repetida: false };
  },
};
