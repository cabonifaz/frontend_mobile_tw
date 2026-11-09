import { ErrorApi } from './cliente';
import type { Aprobacion, AprobacionSalida, BandejaAprobaciones } from './aprobaciones';
import type { MenuJefatura } from './jefatura';
import type { ItemChecklist } from './servicios';

/**
 * Modo demo de HU-28 / HU-31 (mismos campos que GET api/movil/jefatura/menu y api/movil/aprobaciones),
 * con los datos de los mockups. Una decisión saca la solicitud de la bandeja (en memoria).
 */
const esperar = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function fechaRelativa(dias: number): string {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const resueltas = new Set<number>();

const pendientes = (): Aprobacion[] =>
  [
    {
      tipo: 'salida' as const, id: 851, titulo: 'Autorización de salida', numeroOs: 'OS-000851', tecnico: 'Luis Medina', cliente: 'Lácteos Andinos',
      detalle: 'falta: EPP revisado', fechaEjecucion: fechaRelativa(0), horaInicio: '09:00', urgente: true, solicitadaEn: `${fechaRelativa(0)}T07:32:00`,
    },
    {
      tipo: 'salida' as const, id: 853, titulo: 'Autorización de salida', numeroOs: 'OS-000853', tecnico: 'Miguel Torres', cliente: 'Agroindustrias Norte',
      detalle: 'falta: Repuestos asignados', fechaEjecucion: fechaRelativa(1), horaInicio: '08:00', urgente: false, solicitadaEn: `${fechaRelativa(0)}T09:58:00`,
    },
  ].filter((a) => !resueltas.has(a.id));

export const mockJefatura = {
  /** `token` solo sirve en el modo demo: el usuario jefe.ops entra como Operaciones; los demás, como Metrología. */
  async menu(token: string = ''): Promise<MenuJefatura> {
    await esperar(400);
    if (token.includes('jefe.st'))
      return {
        areaCodigo: 'servicio_tecnico', areaNombre: 'Servicio Técnico', sede: 'Lima',
        programados: 9, enRuta: 5, enEjecucion: 3, conDemora: 1, aprobacionesPendientes: pendientes().length,
      };
    if (token.includes('jefe.ops'))
      return {
        areaCodigo: 'operaciones', areaNombre: 'Operaciones', sede: 'Lima Central',
        programados: 15, enRuta: 7, enEjecucion: 5, conDemora: 1, aprobacionesPendientes: pendientes().length,
      };
    return {
      areaCodigo: 'metrologia', areaNombre: 'Metrología', sede: 'Laboratorio Lima',
      programados: 6, enRuta: 2, enEjecucion: 2, conDemora: 0, aprobacionesPendientes: pendientes().length,
    };
  },

  async aprobaciones(): Promise<BandejaAprobaciones> {
    await esperar(350);
    const items = pendientes();
    return { total: items.length, urgentes: items.filter((i) => i.urgente).length, tipos: [{ tipo: 'salida', cantidad: items.length }], items };
  },

  async salida(idOs: number): Promise<AprobacionSalida> {
    await esperar(350);
    const a = pendientes().find((x) => x.id === idOs);
    if (!a) throw new ErrorApi('No se encontró la solicitud de salida o no corresponde a tu área.', 400, 1);
    const item = (codigo: string, nombre: string, estado: ItemChecklist['estado'], detalle: string | null): ItemChecklist => ({
      codigo, nombre, tipo: 'manual', obligatorio: true, estado, detalle, editable: false,
    });
    const items: ItemChecklist[] = [
      item('ssoma', 'SSOMA completo', 'conforme', 'SCTR vigente · inducción OK'),
      item('epp', 'EPP revisado', 'pendiente', 'Arnés de seguridad no registrado'),
      item('materiales', 'Materiales e insumos', 'conforme', '5 de 5'),
      { ...item('oc', 'OC cargada', 'conforme', 'Opcional · registrada'), obligatorio: false },
    ];
    return {
      solicitud: {
        idAutorizacion: idOs, idOs, numeroOs: a.numeroOs, cliente: a.cliente, fechaEjecucion: a.fechaEjecucion, horaInicio: a.horaInicio,
        estadoOs: 'programada', tecnico: a.tecnico, motivo: 'El arnés lo entrega el almacén del cliente en garita.', pendientes: 'EPP revisado',
        estado: 'pendiente', areaCodigo: 'metrologia', area: 'Metrología', solicitadaEn: a.solicitadaEn, jefe: null, resueltaEn: null, comentario: null,
      },
      items, faltantes: ['EPP revisado'], areaAutoriza: 'Metrología',
    };
  },

  async resolver(idOs: number, aprobar: boolean): Promise<string> {
    await esperar(450);
    resueltas.add(idOs);
    return aprobar ? 'Salida autorizada. El técnico ya fue notificado.' : 'Salida rechazada. El técnico ya fue notificado.';
  },
};
