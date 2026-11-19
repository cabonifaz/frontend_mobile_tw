import { entorno } from '@/config/entorno';
import { solicitar } from './cliente';

/**
 * HU-33 — Revisión de informes técnicos (Jefe de Área).
 * Backend: GET api/movil/jefatura/informes?grupo=&busqueda= · GET …/informes/{id} · GET …/informes/{id}/evidencias/{idEvidencia}/archivo
 *          · PUT …/informes/{id}/observar · PUT …/informes/{id}/aprobar
 *   → SP_ObtenerInformesRevisionMovil, SP_ObtenerInformeRevisionMovil, SP_ObtenerArchivoEvidenciaInformeMovil, SP_ObservarInformeMovil, SP_AprobarInformeMovil.
 * Mismas reglas que la intranet (Revisión Técnica HU-56 a HU-59: SP_ArmarBaseInformes y SP_RegistrarRevisionInforme) con el alcance de la app: las áreas que ven todo
 * (Gerencia, Operaciones, Administración, TI, SSOMA, Calidad, Comercial y los Administradores) y el Supervisor de Servicio Técnico / Metrología solo los informes de su área.
 * Todo exige conexión.
 */
export type GrupoInformes = 'por_revisar' | 'en_correccion' | 'aprobados';
export type EstadoInforme = 'por_revisar' | 'en_correccion' | 'aprobado';
export type EstadoValidacion = 'ok' | 'atencion' | 'error';

export interface KpisInformes {
  pendientes: number;
  observados: number;
  sinEvidencias: number;
  slaVencido: number;
  actualizado: string | null;
  refrescoSegundos: number;
}

export interface InformeRevisionItem {
  idInforme: number;
  numeroInforme: string;
  numeroOs: string | null;
  cliente: string | null;
  equipo: string | null;
  codigoTw: string | null;
  tecnico: string | null;
  estado: EstadoInforme | string;
  evidencias: number;
  forzadas: number;
  firmadoPorCliente: boolean;
  horasEspera: number;
  slaVencido: boolean;
  /** "yyyy-MM-dd HH:mm" (hora de Lima): hasta cuándo debe corregir el técnico (solo en corrección). */
  plazoEn: string | null;
  resumen: string | null;
}

export interface InformesRevision {
  kpis: KpisInformes;
  informes: InformeRevisionItem[];
}

export interface CabeceraInformeRevision {
  idInforme: number;
  numeroInforme: string;
  tipoServicio: string | null;
  numeroOs: string | null;
  cliente: string | null;
  sede: string | null;
  equipo: string | null;
  codigoTw: string | null;
  numeroSerie: string | null;
  tecnico: string | null;
  fechaEjecucion: string | null;
  diagnostico: string | null;
  estado: EstadoInforme | string;
  slaVencido: boolean;
  horasEspera: number;
  puedeAprobar: boolean;
  puedeObservar: boolean;
  motivoBloqueo: string | null;
  revisor: string | null;
  fechaRevision: string | null;
  nota: string | null;
}

export interface ValidacionInforme {
  codigo: string;
  titulo: string;
  detalle: string | null;
  estado: EstadoValidacion | string;
  obligatoria: boolean;
}

export interface EvidenciaInforme {
  idEvidencia: number;
  etiqueta: string;
  forzada: boolean;
  motivoForzada: string | null;
  esVideo: boolean;
  validacionIa: string | null;
  /** Opcionales: un back anterior no los envía. */
  descripcion?: string | null;
  /** "yyyy-MM-ddTHH:mm:ss" (hora de Lima). */
  tomadaEn?: string | null;
  etapa?: string | null;
}

/** Datos generales del informe (como el "Detalle del Servicio Técnico" de la intranet). Todo opcional: un back anterior no lo envía. */
export interface DatosInformeRevision {
  version: number;
  tipoEquipo: string | null;
  marca: string | null;
  modelo: string | null;
  horaInicio: string | null;
  horaFin: string | null;
  duracionMin: number | null;
  contacto: string | null;
  numeroPropuesta: string | null;
  enviadoEn: string | null;
  resultadoGlobal: 'dentro' | 'fuera' | string | null;
  toleranciaPesaje: number | null;
  toleranciaExcentricidad: number | null;
  descripcionComplementaria: string | null;
  estadoEquipoFinal: 'operativo' | 'con_observaciones' | 'inoperativo' | string | null;
}

export interface EnsayoRevision {
  tipo: 'pesaje' | 'excentricidad' | string;
  orden: number;
  punto: string;
  notaPunto: string | null;
  carga: number | null;
  lectura: number | null;
  error: number | null;
  tolerancia: number | null;
  resultado: 'conforme' | 'no_conforme' | string | null;
}

export interface PasoRevision {
  orden: number;
  descripcion: string;
  realizado: boolean;
}

export interface TextoRevision {
  texto: string;
  detalle: string | null;
}

export interface CorreccionInforme {
  idCorreccion: number;
  motivo: string;
  motivoNombre: string | null;
  secciones: string[];
  instruccion: string;
  plazoEn: string | null;
  estado: 'pendiente' | 'atendida' | 'cancelada' | string;
  por: string | null;
  creadaEn: string | null;
}

export interface OpcionInforme {
  codigo: string;
  nombre: string;
}

export interface PlazoInforme {
  horas: number;
  texto: string;
}

export interface DetalleInformeRevision {
  cabecera: CabeceraInformeRevision;
  validaciones: ValidacionInforme[];
  evidencias: EvidenciaInforme[];
  correccion: CorreccionInforme | null;
  motivos: OpcionInforme[];
  secciones: OpcionInforme[];
  plazos: PlazoInforme[];
  /** Detalle del informe: opcionales, un back anterior no los envía. */
  datos?: DatosInformeRevision | null;
  ensayos?: EnsayoRevision[];
  procedimiento?: PasoRevision[];
  observaciones?: TextoRevision[];
  recomendaciones?: TextoRevision[];
}

export interface ObservarInforme {
  motivo: string;
  secciones: string[];
  instruccion: string;
  plazoHoras: number;
}

export interface ResultadoObservacion {
  idCorreccion: number;
  plazoEn: string | null;
  notificados: number;
}

export interface ResultadoAprobacion {
  idInforme: number;
  estado: string;
}

const base = '/api/movil/jefatura/informes';

export async function obtenerInformesRevision(token: string, grupo: GrupoInformes, busqueda: string): Promise<InformesRevision> {
  if (entorno.usarMock) return mockInformes.lista(grupo, busqueda);
  const q = new URLSearchParams({ grupo });
  if (busqueda.trim()) q.set('busqueda', busqueda.trim());
  return (await solicitar<InformesRevision>(`${base}?${q.toString()}`, { token })).datos!;
}

export async function obtenerInformeRevision(token: string, idInforme: number): Promise<DetalleInformeRevision> {
  if (entorno.usarMock) return mockInformes.detalle(idInforme);
  return (await solicitar<DetalleInformeRevision>(`${base}/${encodeURIComponent(String(idInforme))}`, { token })).datos!;
}

/** Foto o video de una evidencia del informe (con `cuadro`, la miniatura del video), para <Image source={{ uri, headers }} />. */
export function urlEvidenciaInforme(idInforme: number, idEvidencia: number, cuadro = false): string {
  return `${entorno.apiUrl}${base}/${idInforme}/evidencias/${idEvidencia}/archivo${cuadro ? '?cuadro=true' : ''}`;
}

/** PUT …/observar: el informe pasa a "en corrección" y el técnico recibe la solicitud (notificación y aviso en el celular). */
export async function observarInforme(token: string, idInforme: number, d: ObservarInforme): Promise<{ mensaje: string; datos: ResultadoObservacion | null }> {
  if (entorno.usarMock) return mockInformes.observar(idInforme, d);
  const r = await solicitar<ResultadoObservacion>(`${base}/${encodeURIComponent(String(idInforme))}/observar`, {
    token,
    metodo: 'PUT',
    cuerpo: { motivo: d.motivo, secciones: d.secciones, instruccion: d.instruccion.trim(), plazoHoras: d.plazoHoras },
  });
  return { mensaje: r.mensaje, datos: r.datos ?? null };
}

/** PUT …/aprobar: el informe queda REVISADO (cerrado e inmutable) y sigue a conformidad. Solo con las validaciones obligatorias cumplidas. */
export async function aprobarInforme(token: string, idInforme: number, nota: string): Promise<{ mensaje: string; datos: ResultadoAprobacion | null }> {
  if (entorno.usarMock) return mockInformes.aprobar(idInforme);
  const r = await solicitar<ResultadoAprobacion>(`${base}/${encodeURIComponent(String(idInforme))}/aprobar`, {
    token,
    metodo: 'PUT',
    cuerpo: { nota: nota.trim() || null },
  });
  return { mensaje: r.mensaje, datos: r.datos ?? null };
}

// ── Modo demostración (EXPO_PUBLIC_USE_MOCK=true) ──────────────────────────────────────────────────────────────────────

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

const MOTIVOS: OpcionInforme[] = [
  { codigo: 'evidencia_insuficiente', nombre: 'Evidencia insuficiente' },
  { codigo: 'datos_incorrectos', nombre: 'Datos incorrectos' },
  { codigo: 'ensayos_inconsistentes', nombre: 'Ensayos inconsistentes' },
  { codigo: 'firma_faltante', nombre: 'Firma faltante' },
  { codigo: 'otro', nombre: 'Otro (explicar abajo)' },
];
const SECCIONES: OpcionInforme[] = [
  { codigo: 'registro_fotografico', nombre: 'Registro fotográfico' },
  { codigo: 'cabecera', nombre: 'Cabecera' },
  { codigo: 'ensayos', nombre: 'Ensayos' },
  { codigo: 'firmas', nombre: 'Firmas' },
];
const PLAZOS: PlazoInforme[] = [
  { horas: 4, texto: '4 horas' },
  { horas: 24, texto: '24 horas' },
  { horas: 48, texto: '48 horas (2 días)' },
  { horas: 72, texto: '72 horas (3 días)' },
];

let informesDemo: (InformeRevisionItem & { diagnostico: string; forzadaMotivo: string | null })[] = [
  {
    idInforme: 845, numeroInforme: 'IT-0845-01', numeroOs: 'OS-0845-2026', cliente: 'Molinos del Sur', equipo: 'Balanza BAL-012', codigoTw: 'BAL-012', tecnico: 'Juan Pérez',
    estado: 'por_revisar', evidencias: 9, forzadas: 1, firmadoPorCliente: true, horasEspera: 20, slaVencido: false, plazoEn: null, resumen: null,
    diagnostico: 'Celda C2 con deriva; se ajustó y el ensayo final quedó conforme.', forzadaMotivo: 'Placa ilegible (motivo registrado)',
  },
  {
    idInforme: 842, numeroInforme: 'IT-0842-02', numeroOs: 'OS-0842-2026', cliente: 'Lácteos Andinos', equipo: 'Indicador IND-07', codigoTw: 'IND-07', tecnico: 'Luis Medina',
    estado: 'por_revisar', evidencias: 9, forzadas: 0, firmadoPorCliente: false, horasEspera: 72, slaVencido: true, plazoEn: null, resumen: null,
    diagnostico: 'Indicador con error de cero; se recalibró.', forzadaMotivo: null,
  },
  {
    idInforme: 839, numeroInforme: 'IT-0839-01', numeroOs: 'OS-0839-2026', cliente: 'Agroindustrias Norte', equipo: 'Balanza BAL-031', codigoTw: 'BAL-031', tecnico: 'Miguel Torres',
    estado: 'por_revisar', evidencias: 9, forzadas: 0, firmadoPorCliente: true, horasEspera: 8, slaVencido: false, plazoEn: null, resumen: null,
    diagnostico: 'Mantenimiento preventivo sin novedades.', forzadaMotivo: null,
  },
  {
    idInforme: 830, numeroInforme: 'IT-0830-01', numeroOs: 'OS-0830-2026', cliente: 'Minera Andes', equipo: 'Balanza BAL-020', codigoTw: 'BAL-020', tecnico: 'Pedro Salazar',
    estado: 'en_correccion', evidencias: 6, forzadas: 0, firmadoPorCliente: false, horasEspera: 30, slaVencido: false, plazoEn: '2026-11-20 12:00', resumen: null,
    diagnostico: 'Fallas de repetibilidad.', forzadaMotivo: null,
  },
  {
    idInforme: 820, numeroInforme: 'IT-0820-01', numeroOs: 'OS-0820-2026', cliente: 'Cemento Lima', equipo: 'Balanza BAL-004', codigoTw: 'BAL-004', tecnico: 'Juan Pérez',
    estado: 'aprobado', evidencias: 8, forzadas: 0, firmadoPorCliente: true, horasEspera: 12, slaVencido: false, plazoEn: null, resumen: null,
    diagnostico: 'Servicio conforme.', forzadaMotivo: null,
  },
];

const mockInformes = {
  async lista(grupo: GrupoInformes, busqueda: string): Promise<InformesRevision> {
    await esperar(300);
    const q = busqueda.trim().toLowerCase();
    const porRevisar = informesDemo.filter((i) => i.estado === 'por_revisar');
    const kpis: KpisInformes = {
      pendientes: porRevisar.length,
      observados: informesDemo.filter((i) => i.estado === 'en_correccion').length,
      sinEvidencias: porRevisar.filter((i) => i.evidencias === 0).length,
      slaVencido: porRevisar.filter((i) => i.slaVencido).length,
      actualizado: '10:46',
      refrescoSegundos: 30,
    };
    const estado = grupo === 'por_revisar' ? 'por_revisar' : grupo === 'en_correccion' ? 'en_correccion' : 'aprobado';
    const informes = informesDemo
      .filter((i) => i.estado === estado)
      .filter((i) => !q || [i.numeroInforme, i.numeroOs, i.cliente, i.tecnico, i.equipo, i.codigoTw].some((t) => (t ?? '').toLowerCase().includes(q)))
      .map(({ diagnostico: _d, forzadaMotivo: _f, ...item }) => item);
    return { kpis, informes };
  },
  async detalle(idInforme: number): Promise<DetalleInformeRevision> {
    await esperar(300);
    const i = informesDemo.find((x) => x.idInforme === idInforme) ?? informesDemo[0];
    const forzadaPendiente = false;
    const validaciones: ValidacionInforme[] = [
      { codigo: 'datos', titulo: 'Datos del informe', detalle: 'Completo', estado: 'ok', obligatoria: true },
      { codigo: 'ensayos', titulo: 'Ensayos', detalle: 'Conformes tras ajuste', estado: 'ok', obligatoria: true },
      {
        codigo: 'evidencias',
        titulo: 'Evidencias',
        detalle: i.forzadas > 0 ? `${i.forzadas} forzada: ${i.forzadaMotivo ?? 'con motivo registrado'}` : `${i.evidencias} evidencias`,
        estado: forzadaPendiente ? 'error' : i.forzadas > 0 ? 'atencion' : 'ok',
        obligatoria: true,
      },
      { codigo: 'procedimiento', titulo: 'Procedimiento ejecutado', detalle: 'Todos los pasos realizados', estado: 'ok', obligatoria: true },
      { codigo: 'firmas', titulo: 'Firmas', detalle: i.firmadoPorCliente ? 'Técnico y cliente' : 'Falta la firma del cliente', estado: i.firmadoPorCliente ? 'ok' : 'atencion', obligatoria: false },
    ];
    const abierto = i.estado !== 'aprobado';
    return {
      cabecera: {
        idInforme: i.idInforme, numeroInforme: i.numeroInforme, tipoServicio: 'Mantenimiento y ajuste', numeroOs: i.numeroOs, cliente: i.cliente, sede: 'Planta principal',
        equipo: i.equipo, codigoTw: i.codigoTw, numeroSerie: 'SN-20418', tecnico: i.tecnico, fechaEjecucion: '2026-11-17', diagnostico: i.diagnostico, estado: i.estado,
        slaVencido: i.slaVencido, horasEspera: i.horasEspera, puedeAprobar: abierto && i.estado !== 'en_correccion', puedeObservar: abierto && i.estado !== 'en_correccion',
        motivoBloqueo: i.estado === 'en_correccion' ? 'El informe tiene una corrección pendiente del técnico.' : null,
        revisor: i.estado === 'aprobado' ? 'Cristopher Villanueva' : null, fechaRevision: i.estado === 'aprobado' ? '2026-11-18 09:30' : null, nota: null,
      },
      validaciones,
      evidencias: [
        { idEvidencia: 1, etiqueta: 'Placa', forzada: i.forzadas > 0, motivoForzada: i.forzadaMotivo, esVideo: false, validacionIa: i.forzadas > 0 ? 'rechazada' : 'aprobada' },
        { idEvidencia: 2, etiqueta: 'Inicial', forzada: false, motivoForzada: null, esVideo: false, validacionIa: 'aprobada' },
        { idEvidencia: 3, etiqueta: 'Desmontaje', forzada: false, motivoForzada: null, esVideo: false, validacionIa: 'aprobada' },
        { idEvidencia: 4, etiqueta: 'Prueba', forzada: false, motivoForzada: null, esVideo: false, validacionIa: 'aprobada' },
        { idEvidencia: 5, etiqueta: 'Final', forzada: false, motivoForzada: null, esVideo: false, validacionIa: 'aprobada' },
        { idEvidencia: 6, etiqueta: 'Informe', forzada: false, motivoForzada: null, esVideo: false, validacionIa: 'aprobada' },
      ],
      correccion:
        i.estado === 'en_correccion'
          ? {
              idCorreccion: 1, motivo: 'evidencia_insuficiente', motivoNombre: 'Evidencia insuficiente', secciones: ['registro_fotografico'],
              instruccion: 'Tomar foto de la placa del indicador o del certificado anterior con el N/S.', plazoEn: i.plazoEn, estado: 'pendiente', por: 'Cristopher Villanueva',
              creadaEn: '2026-11-18 10:30',
            }
          : null,
      motivos: MOTIVOS,
      secciones: SECCIONES,
      plazos: PLAZOS,
      datos: {
        version: 1, tipoEquipo: 'Balanza de plataforma', marca: 'Ohaus', modelo: 'Defender 5000', horaInicio: '08:10', horaFin: '11:40', duracionMin: 210, contacto: 'Rosa Quispe',
        numeroPropuesta: 'PRO-2026-0412', enviadoEn: '2026-11-17T18:20:00', resultadoGlobal: 'dentro', toleranciaPesaje: 0.5, toleranciaExcentricidad: 0.3,
        descripcionComplementaria: 'Se ajustó la celda C2 y se verificó la linealidad.', estadoEquipoFinal: 'operativo',
      },
      ensayos: [
        { tipo: 'pesaje', orden: 1, punto: 'Carga 1', notaPunto: null, carga: 50, lectura: 50.1, error: 0.1, tolerancia: 0.5, resultado: 'conforme' },
        { tipo: 'pesaje', orden: 2, punto: 'Carga 2', notaPunto: null, carga: 100, lectura: 100.3, error: 0.3, tolerancia: 0.5, resultado: 'conforme' },
        { tipo: 'pesaje', orden: 3, punto: 'Carga 3', notaPunto: 'tras ajuste', carga: 200, lectura: 200.7, error: 0.7, tolerancia: 0.5, resultado: 'no_conforme' },
        { tipo: 'excentricidad', orden: 1, punto: 'Centro', notaPunto: null, carga: 100, lectura: 100.0, error: 0, tolerancia: 0.3, resultado: 'conforme' },
        { tipo: 'excentricidad', orden: 2, punto: 'Esquina C2', notaPunto: null, carga: 100, lectura: 100.2, error: 0.2, tolerancia: 0.3, resultado: 'conforme' },
      ],
      procedimiento: [
        { orden: 1, descripcion: 'Inspección visual y limpieza del equipo', realizado: true },
        { orden: 2, descripcion: 'Verificación de nivelación', realizado: true },
        { orden: 3, descripcion: 'Ajuste de la celda C2', realizado: true },
        { orden: 4, descripcion: 'Pruebas de pesaje y excentricidad', realizado: true },
      ],
      observaciones: [{ texto: 'Celda C2 con deriva', detalle: 'Se recomienda cambio en el próximo mantenimiento.' }],
      recomendaciones: [{ texto: 'Calibrar en 6 meses', detalle: null }],
    };
  },
  async observar(idInforme: number, d: ObservarInforme) {
    await esperar(400);
    informesDemo = informesDemo.map((i) => (i.idInforme === idInforme ? { ...i, estado: 'en_correccion', plazoEn: '2026-11-20 12:00' } : i));
    return {
      mensaje: 'Informe observado. El técnico recibió la solicitud de corrección.',
      datos: { idCorreccion: 1, plazoEn: `2026-11-20 12:00 (${d.plazoHoras} h)`, notificados: 1 },
    };
  },
  async aprobar(idInforme: number) {
    await esperar(400);
    informesDemo = informesDemo.map((i) => (i.idInforme === idInforme ? { ...i, estado: 'aprobado' } : i));
    return { mensaje: 'Informe aprobado y liberado.', datos: { idInforme, estado: 'revisado' } };
  },
};
