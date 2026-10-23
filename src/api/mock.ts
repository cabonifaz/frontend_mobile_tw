import { ErrorApi } from './cliente';
import type { DatosIngreso, SesionIniciada } from './autenticacion';
import type { ItemCatalogo } from './catalogos';
import type { MisDatos } from './usuario';
import type { ResumenMenu } from './menu';
import type {
  ChecklistSalida,
  CodigoManual,
  DetalleServicio,
  FiltroServicios,
  ItemChecklist,
  ResultadoChecklist,
  ServicioProgramado,
} from './servicios';

/**
 * Modo demo (EXPO_PUBLIC_USE_MOCK=true): la app funciona sin backend para revisar
 * pantallas en un APK. Reproduce las reglas reales del login:
 *   - usuario de prueba: tecnico.demo / Demo1234
 *   - usuario con cambio obligatorio: tecnico.nuevo / Temporal1
 *   - con correo: se rechaza (solo usuario)
 */
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

const usuarios: Record<string, { contrasena: string; nombre: string; apellido: string; forzar: boolean }> = {
  'tecnico.demo': { contrasena: 'Demo1234', nombre: 'Carlos', apellido: 'Quispe', forzar: false },
  'tecnico.nuevo': { contrasena: 'Temporal1', nombre: 'Lucía', apellido: 'Huamán', forzar: true },
};

export const mockAutenticacion = {
  async iniciarSesion(datos: DatosIngreso): Promise<SesionIniciada> {
    await esperar(700);
    const usuario = datos.usuario.trim().toLowerCase();
    if (usuario.includes('@')) {
      throw new ErrorApi('Ingresa con tu usuario, no con tu correo. Si no lo tienes, pídeselo a tu jefe.', 401, 1);
    }
    const u = usuarios[usuario];
    if (!u || u.contrasena !== datos.contrasena) {
      throw new ErrorApi('Usuario o contraseña incorrectos.', 401, 1);
    }
    return {
      token: `mock-${usuario}-${Date.now()}`,
      expiraEn: new Date(Date.now() + 12 * 3600 * 1000),
      usuario: {
        idUsuario: usuario === 'tecnico.demo' ? 101 : 102,
        usuario,
        nombre: u.nombre,
        apellido: u.apellido,
        cargo: 'tecnico_campo',
        area: 'servicio_tecnico',
        rolSistema: 'usuario',
        forzarCambioContrasena: u.forzar,
      },
    };
  },

  async cerrarSesion(): Promise<void> {
    await esperar(300);
  },

  async cambiarContrasena(actual: string, nueva: string): Promise<string> {
    await esperar(600);
    if (actual === nueva) throw new ErrorApi('La nueva contraseña debe ser distinta de la actual.', 400, 1);
    return 'Contraseña actualizada correctamente.';
  },
};

/** Usuario de la sesión demo (mismos campos que GET api/autenticacion/me). */
export const mockUsuario = {
  async misDatos(): Promise<MisDatos> {
    await esperar(400);
    return {
      idUsuario: 101,
      nombre: 'Carlos',
      apellido: 'Quispe',
      correo: 'cquispe@totalweight.com',
      rolSistema: 'usuario',
      rolSistemaLabel: 'Usuario',
      area: 'servicio_tecnico',
      forzarCambioContrasena: false,
    };
  },
};

/** Catálogos de ejemplo, copiados de tabla_maestra (total_weight_stg). */
const catalogos: Record<string, ItemCatalogo[]> = {
  AREA_USUARIO: [
    { id: 1, nombre: 'Gerencia', codigo: 'gerencia' },
    { id: 2, nombre: 'Comercial', codigo: 'comercial' },
    { id: 3, nombre: 'Metrología', codigo: 'metrologia' },
    { id: 4, nombre: 'Operaciones', codigo: 'operaciones' },
    { id: 5, nombre: 'Servicio Técnico', codigo: 'servicio_tecnico' },
    { id: 6, nombre: 'Administración', codigo: 'administracion' },
    { id: 7, nombre: 'SSOMA', codigo: 'ssoma' },
    { id: 8, nombre: 'TI', codigo: 'ti' },
  ],
  CARGO_USUARIO: [
    { id: 6, nombre: 'Metrólogo', codigo: 'metrologo' },
    { id: 7, nombre: 'Metrólogo Jr.', codigo: 'metrologo_jr' },
    { id: 10, nombre: 'Jefe de Servicio Técnico', codigo: 'jefe_servicio_tecnico' },
    { id: 11, nombre: 'Técnico de Campo', codigo: 'tecnico_campo' },
    { id: 12, nombre: 'Técnico de Campo Jr.', codigo: 'tecnico_campo_jr' },
  ],
};

export const mockCatalogos = {
  async obtener(nombre: string): Promise<ItemCatalogo[]> {
    await esperar(300);
    const items = catalogos[nombre];
    if (!items) throw new ErrorApi(`Catálogo no encontrado: ${nombre}`, 404, 1);
    return items;
  },
};

/** Menú principal (mismos campos que GET api/movil/menu/resumen). */
export const mockMenu = {
  async resumen(): Promise<ResumenMenu> {
    await esperar(500);
    const hoy = new Date();
    const fecha = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;
    return {
      serviciosAsignados: 4,
      serviciosHoy: 3,
      proximoServicio: {
        idOs: 1,
        numero: 'OS-000791',
        cliente: 'Alicorp S.A.A.',
        sede: 'Planta Cliente',
        distrito: 'Callao',
        tipoServicio: 'Calibración',
        fechaEjecucion: fecha,
        horaInicio: '08:30',
        estado: 'programada',
      },
    };
  },
};

/** Agenda demo (mismos campos que GET api/movil/servicios). */
function fechaRelativa(dias: number): string {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const serviciosDemo = (): ServicioProgramado[] => [
  {
    idOs: 791, numeroOs: 'OS-000791', numeroRq: 'RQ-000245', numeroOm: null, cliente: 'Alicorp S.A.A.',
    fechaEjecucion: fechaRelativa(0), horaInicio: '08:30', estadoOs: 'programada', sede: 'Planta Cliente',
    responsable: 'Jhonny Iparraguirre', objetivosTotal: 8, objetivosCompletados: 0, clienteConfirmado: true,
    estadoSsoma: 'habilitado', alertasPredictivas: 1, estadoGeneral: 'LISTO', motivoBloqueo: null,
  },
  {
    idOs: 799, numeroOs: 'OS-000799', numeroRq: 'RQ-000250', numeroOm: 'OM-000332', cliente: 'Aceros Arequipa',
    fechaEjecucion: fechaRelativa(0), horaInicio: '11:00', estadoOs: 'programada', sede: 'Planta Cliente',
    responsable: 'Carlos Medina', objetivosTotal: 5, objetivosCompletados: 0, clienteConfirmado: false,
    estadoSsoma: 'pendiente', alertasPredictivas: 0, estadoGeneral: 'PENDIENTE', motivoBloqueo: null,
  },
  {
    idOs: 812, numeroOs: 'OS-000812', numeroRq: 'RQ-000251', numeroOm: null, cliente: 'Machu Picchu Foods',
    fechaEjecucion: fechaRelativa(0), horaInicio: '15:00', estadoOs: 'programada', sede: 'Planta Principal',
    responsable: 'Carlos Quispe', objetivosTotal: 3, objetivosCompletados: 0, clienteConfirmado: true,
    estadoSsoma: 'pendiente', alertasPredictivas: 0, estadoGeneral: 'BLOQUEADO', motivoBloqueo: 'Expediente incompleto',
  },
  {
    idOs: 820, numeroOs: 'OS-000820', numeroRq: 'RQ-000260', numeroOm: null, cliente: 'Las Bambas',
    fechaEjecucion: fechaRelativa(1), horaInicio: '09:00', estadoOs: 'programada', sede: 'Planta Norte',
    responsable: 'Carlos Quispe', objetivosTotal: 4, objetivosCompletados: 0, clienteConfirmado: false,
    estadoSsoma: 'habilitado', alertasPredictivas: 0, estadoGeneral: 'PENDIENTE', motivoBloqueo: null,
  },
];

export const mockServicios = {
  async programados(filtro: FiltroServicios, busqueda: string): Promise<ServicioProgramado[]> {
    await esperar(500);
    const hoy = fechaRelativa(0);
    const texto = busqueda.trim().toLowerCase();
    return serviciosDemo().filter((s) => {
      const pasaFiltro =
        filtro === 'todos' ||
        (filtro === 'hoy' && s.fechaEjecucion === hoy) ||
        (filtro === 'pendientes' && s.estadoGeneral === 'PENDIENTE') ||
        (filtro === 'en_ejecucion' && ['en_ruta', 'en_ejecucion', 'pausada'].includes(s.estadoOs));
      const pasaBusqueda =
        !texto ||
        [s.numeroOs, s.numeroRq, s.numeroOm, s.cliente].some((v) => (v ?? '').toLowerCase().includes(texto));
      return pasaFiltro && pasaBusqueda;
    });
  },
};

/**
 * HU-04 (modo demo): detalle y checklist de pre-salida. Reproduce las reglas del back
 * (ReglasChecklistSalida) en memoria; el visto bueno del jefe se simula 2 s después de pedirlo.
 */
const presalidaDemo = new Map<
  number,
  { manuales: Record<CodigoManual, boolean>; autorizacion: 'pendiente' | 'aprobada' | null; estadoOs: string }
>();

function estadoDemo(idOs: number) {
  let e = presalidaDemo.get(idOs);
  if (!e) {
    e = {
      manuales: { expediente: false, epp: false, materiales: false, herramientas: false, pesas_patron: false },
      autorizacion: null,
      estadoOs: 'programada',
    };
    presalidaDemo.set(idOs, e);
  }
  return e;
}

/** Área que autoriza según la RQ (demo: las OS pares son de Metrología; el resto, de Servicio Técnico). */
function areaDemo(idOs: number) {
  return idOs % 2 === 0
    ? { codigo: 'metrologia' as const, area: 'Metrología', cargo: 'Jefe de Metrología', encargado: 'Mónica Paredes' }
    : { codigo: 'servicio_tecnico' as const, area: 'Servicio Técnico', cargo: 'Jefe de Servicio Técnico', encargado: 'Jorge Salas' };
}

function checklistDemo(idOs: number): ChecklistSalida {
  const s = serviciosDemo().find((x) => x.idOs === idOs) ?? serviciosDemo()[0];
  const e = estadoDemo(idOs);
  const area = areaDemo(idOs);
  const editable = e.estadoOs === 'programada';
  const manual = (codigo: CodigoManual, nombre: string): ItemChecklist => ({
    codigo, nombre, tipo: 'manual', obligatorio: true, estado: e.manuales[codigo] ? 'conforme' : 'pendiente', detalle: null, editable,
  });
  const items: ItemChecklist[] = [
    manual('expediente', 'Expediente revisado'),
    { codigo: 'cliente_confirmo', nombre: 'Cliente confirmó visita', tipo: 'automatico', obligatorio: true,
      estado: s.clienteConfirmado ? 'conforme' : 'pendiente', detalle: null, editable: false },
    { codigo: 'ssoma', nombre: 'SSOMA completo', tipo: 'automatico', obligatorio: true,
      estado: s.estadoSsoma === 'habilitado' ? 'conforme' : 'pendiente', detalle: null, editable: false },
    { codigo: 'oc', nombre: 'OC cargada', tipo: 'automatico', obligatorio: false, estado: 'conforme', detalle: null, editable: false },
    manual('epp', 'EPP revisado'),
    manual('materiales', 'Materiales e insumos'),
    manual('herramientas', 'Herramientas listas'),
    manual('pesas_patron', 'Pesas patrón asignadas'),
    { codigo: 'repuestos', nombre: 'Repuestos asignados', tipo: 'automatico', obligatorio: true,
      estado: 'pendiente', detalle: '1 de 2 repuestos sin asignar.', editable: false },
    { codigo: 'alerta', nombre: 'Alerta predictiva', tipo: 'automatico', obligatorio: true,
      estado: s.alertasPredictivas > 0 ? 'bloqueado' : 'conforme', detalle: null, editable: false },
    { codigo: 'visto_bueno', nombre: `Visto bueno ${area.cargo}`, tipo: 'autorizacion', obligatorio: false,
      estado: e.autorizacion === 'aprobada' ? 'conforme' : e.autorizacion === 'pendiente' ? 'pendiente' : 'opcional',
      detalle: e.autorizacion === 'aprobada' ? `Aprobado por ${area.encargado}.` : e.autorizacion === 'pendiente'
        ? `Solicitud enviada al ${area.cargo} (${area.encargado}): esperando respuesta.`
        : `Lo marca el ${area.cargo} desde la intranet. Solo hace falta si quedan pendientes.`,
      editable: false },
  ];
  const faltantes = items.filter((i) => i.obligatorio && (i.estado === 'pendiente' || i.estado === 'bloqueado')).map((i) => i.nombre);
  const puedeIniciar = editable && (faltantes.length === 0 || e.autorizacion === 'aprobada');
  return {
    idOs, numeroOs: s.numeroOs, cliente: s.cliente, fechaEjecucion: s.fechaEjecucion, horaInicio: s.horaInicio,
    tecnico: s.responsable, estadoOs: e.estadoOs, items, faltantes, puedeIniciar,
    saleConVistoBueno: puedeIniciar && faltantes.length > 0,
    puedeSolicitarAutorizacion: editable && faltantes.length > 0 && e.autorizacion === null,
    trasladoIniciado: e.estadoOs === 'en_ruta',
    autorizacion: e.autorizacion ? { estado: e.autorizacion, jefe: e.autorizacion === 'aprobada' ? area.encargado : null,
      comentario: null, solicitadaEn: new Date().toISOString(), resueltaEn: null } : null,
    areaAutoriza: area,
  };
}

export const mockPresalida = {
  async detalle(idOs: number): Promise<DetalleServicio> {
    await esperar(400);
    const s = serviciosDemo().find((x) => x.idOs === idOs) ?? serviciosDemo()[0];
    return {
      servicio: {
        idOs: s.idOs, numeroOs: s.numeroOs, numeroRq: s.numeroRq, numeroOm: s.numeroOm, cliente: s.cliente,
        idTipoServicio: 1, tipoServicio: 'Mantenimiento Preventivo', fechaEjecucion: s.fechaEjecucion,
        horaInicio: s.horaInicio, estadoOs: estadoDemo(idOs).estadoOs, sede: s.sede, direccion: 'Av. Argentina 4793, Callao',
        contactoNombre: 'Carlos Mendoza', contactoCargo: 'Jefe de Mantenimiento', contactoTelefono: '+51 987 654 321',
        responsable: s.responsable, clienteConfirmado: s.clienteConfirmado, estadoSsoma: s.estadoSsoma,
        objetivosTotal: s.objetivosTotal, notasOperativas: null,
      },
      alertas: s.alertasPredictivas > 0
        ? [{ idAlerta: 1, tipo: 'Desgaste proyectado por uso acumulado', prioridad: 'Alta', equipo: 'EQ-1001 · Mettler Toledo IND780',
             descripcion: 'Alta probabilidad de desgaste del rodamiento principal según histórico de fallas del modelo y condiciones de operación.',
             fechaGeneracion: new Date().toISOString() }]
        : [],
      riesgos: [
        { idRiesgo: 1, nombre: 'Carga suspendida', codigo: 'CARGA_SUSPENDIDA', icono: 'alerta', observacion: null },
        { idRiesgo: 2, nombre: 'Superficies calientes', codigo: 'SUPERFICIE_CALIENTE', icono: 'fuego', observacion: null },
      ],
      repuestos: [
        { idItem: 1, descripcion: 'Kit de sellos IND780 (REP-00882)', asignado: true },
        { idItem: 2, descripcion: 'Celda de carga PDX 30t', asignado: false },
      ],
      historial: [
        { fecha: '2026-03-03T15:30:00', origen: 'equipo', titulo: 'Celda de carga', referencia: 'EQ-1001 · Mettler Toledo IND780',
          valorAnterior: 'PDX 30t (serie A1)', valorNuevo: 'PDX 30t (serie B7)', detalle: 'Cambio de celda', usuario: 'Admin TW' },
        { fecha: '2025-10-15T10:00:00', origen: 'equipo', titulo: 'Calibración', referencia: 'EQ-1001 · Mettler Toledo IND780',
          valorAnterior: 'Vence 15/10/2025', valorNuevo: 'Vence 15/10/2026', detalle: 'Calibración anual', usuario: 'Admin TW' },
      ],
      documentos: [
        { idDocumento: 1, nombreArchivo: 'Mettler Toledo IND780 - Manual Técnico v2.4.pdf', tipo: 'Manual', version: 1, fechaCarga: null },
      ],
    };
  },
  async checklist(idOs: number): Promise<ChecklistSalida> {
    await esperar(300);
    return checklistDemo(idOs);
  },
  async marcar(idOs: number, codigo: CodigoManual, confirmado: boolean): Promise<ResultadoChecklist> {
    await esperar(250);
    estadoDemo(idOs).manuales[codigo] = confirmado;
    return { mensaje: confirmado ? 'Confirmado.' : 'Desmarcado.', checklist: checklistDemo(idOs) };
  },
  async solicitar(idOs: number): Promise<ResultadoChecklist> {
    await esperar(400);
    const e = estadoDemo(idOs);
    e.autorizacion = 'pendiente';
    setTimeout(() => { e.autorizacion = 'aprobada'; }, 2000);
    const c = checklistDemo(idOs);
    return { mensaje: `Solicitud enviada a ${c.areaAutoriza?.encargado} (${c.areaAutoriza?.cargo}).`, checklist: c };
  },
  async iniciar(idOs: number): Promise<ResultadoChecklist> {
    await esperar(400);
    const c = checklistDemo(idOs);
    if (!c.puedeIniciar) throw new ErrorApi(`No puedes iniciar el traslado. Faltan: ${c.faltantes.join(', ')}.`, 400, 1);
    estadoDemo(idOs).estadoOs = 'en_ruta';
    return { mensaje: 'Traslado iniciado. ¡Buen viaje!', checklist: checklistDemo(idOs) };
  },
};
