import type { Gasto, LineaViatico, Viatico, ViaticosYGastos } from './viaticos';

/**
 * Modo demo de HU-25 / HU-26 (mismos campos que GET api/movil/viaticos), con los datos de los mockups:
 * un viático activo (PRG-2026-0012) con adelantos depositados y pendientes de depósito, gastos pendientes, observados,
 * aprobados y rechazados, y un viático finalizado con devolución.
 */
const esperar = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function fechaRelativa(dias: number): string {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const hora = (dias: number, hhmm: string) => `${fechaRelativa(dias)}T${hhmm}:00`;

function datos(): ViaticosYGastos {
  const viaticos: Viatico[] = [
    {
      idProgramacion: 12, codigo: 'PRG-2026-0012', estadoProgramacion: 'confirmada', estadoProgramacionLabel: 'Programado', cerrado: false,
      idOs: 845, numeroOs: 'OS-000845', cliente: 'Molinos del Sur S.A.C.', sede: 'Planta Ate',
      fechaEjecucion: fechaRelativa(1), horaInicio: '08:30', horaFin: '12:30',
      asignado: 450, depositado: 270, pendienteDeposito: 180, rendido: 267.5, porRendir: 182.5, porcentajeRendido: 59,
      cerradoEn: null, saldoFinal: null, tipoSaldo: null,
    },
    {
      idProgramacion: 7, codigo: 'PRG-2026-0007', estadoProgramacion: 'confirmada', estadoProgramacionLabel: 'Programado', cerrado: true,
      idOs: 790, numeroOs: 'OS-000790', cliente: 'Lácteos Andinos', sede: 'Huachipa',
      fechaEjecucion: fechaRelativa(-8), horaInicio: '08:00', horaFin: '13:00',
      asignado: 300, depositado: 300, pendienteDeposito: 0, rendido: 293, porRendir: 7, porcentajeRendido: 98,
      cerradoEn: hora(-5, '17:30'), saldoFinal: -7, tipoSaldo: 'devolucion',
    },
  ];

  const lineas: LineaViatico[] = [
    { idProgramacion: 12, idConcepto: 1, concepto: 'Movilidad / Transporte', asignado: 110, depositado: 110, fechaDeposito: fechaRelativa(-2), rendido: 40, porRendir: 70, estadoDeposito: 'depositado' },
    { idProgramacion: 12, idConcepto: 4, concepto: 'Peaje', asignado: 40, depositado: 40, fechaDeposito: fechaRelativa(-2), rendido: 22.5, porRendir: 17.5, estadoDeposito: 'depositado' },
    { idProgramacion: 12, idConcepto: 2, concepto: 'Alimentación', asignado: 120, depositado: 120, fechaDeposito: fechaRelativa(-2), rendido: 25, porRendir: 95, estadoDeposito: 'depositado' },
    { idProgramacion: 12, idConcepto: 3, concepto: 'Alojamiento', asignado: 180, depositado: 0, fechaDeposito: null, rendido: 180, porRendir: 0, estadoDeposito: 'pendiente' },
    { idProgramacion: 7, idConcepto: 3, concepto: 'Alojamiento', asignado: 160, depositado: 160, fechaDeposito: fechaRelativa(-9), rendido: 160, porRendir: 0, estadoDeposito: 'depositado' },
    { idProgramacion: 7, idConcepto: 2, concepto: 'Alimentación', asignado: 75, depositado: 75, fechaDeposito: fechaRelativa(-9), rendido: 75, porRendir: 0, estadoDeposito: 'depositado' },
    { idProgramacion: 7, idConcepto: 1, concepto: 'Movilidad / Transporte', asignado: 65, depositado: 65, fechaDeposito: fechaRelativa(-9), rendido: 58, porRendir: 7, estadoDeposito: 'depositado' },
  ];

  const base = { moneda: 'S/', idProgramacion: 12, codigoProgramacion: 'PRG-2026-0012', idOs: 845, numeroOs: 'OS-000845' } as const;
  const gastos: Gasto[] = [
    {
      ...base, idGasto: 318, codigo: 'GS-000318', fecha: fechaRelativa(0), idConcepto: 2, concepto: 'Alimentación', monto: 25,
      descripcion: 'Almuerzo en planta, jornada extendida.', estado: 'pendiente', comentarioRevision: null, revisadoPor: null, revisadoEn: null,
      creadoEn: hora(0, '12:40'), tieneComprobante: true,
    },
    {
      ...base, idGasto: 315, codigo: 'GS-000315', fecha: fechaRelativa(-1), idConcepto: 4, concepto: 'Peaje', monto: 22.5,
      descripcion: 'Peaje Evitamiento ida y vuelta.', estado: 'observado', comentarioRevision: 'La boleta indica S/ 12.50. Corrige el monto.',
      revisadoPor: 'Jorge Salas', revisadoEn: hora(-1, '18:05'), creadoEn: hora(-1, '08:10'), tieneComprobante: true,
    },
    {
      ...base, idGasto: 312, codigo: 'GS-000312', fecha: fechaRelativa(-1), idConcepto: 3, concepto: 'Alojamiento', monto: 180,
      descripcion: 'Hotel Ate, 1 noche.', estado: 'aprobado', comentarioRevision: null, revisadoPor: 'Jorge Salas', revisadoEn: hora(-1, '16:20'),
      creadoEn: hora(-1, '09:30'), tieneComprobante: true,
    },
    {
      ...base, idGasto: 305, codigo: 'GS-000305', fecha: fechaRelativa(-4), idProgramacion: 5, codigoProgramacion: 'PRG-2026-0005', idOs: 831, numeroOs: 'OS-000831',
      idConcepto: 7, concepto: 'Insumo / Repuesto menor', monto: 18, descripcion: 'Fusible para indicador.', estado: 'rechazado',
      comentarioRevision: 'El repuesto debe pedirse por almacén con orden de compra, no por reembolso.', revisadoPor: 'Jorge Salas',
      revisadoEn: hora(-3, '09:12'), creadoEn: hora(-4, '15:00'), tieneComprobante: true,
    },
  ];

  return {
    resumen: {
      saldoPorRendir: 182.5, viaticosActivos: 1, viaticosFinalizados: 1,
      gastosEnRevision: 25, gastosEnRevisionCantidad: 1, gastosObservadosCantidad: 1,
    },
    viaticos, lineas, gastos,
  };
}

export const mockViaticos = {
  async obtener(): Promise<ViaticosYGastos> {
    await esperar(400);
    return datos();
  },
};
