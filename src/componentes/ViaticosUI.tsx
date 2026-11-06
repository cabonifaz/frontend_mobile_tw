import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { EstadoGasto, Gasto, ResumenViaticos, Viatico } from '@/api/viaticos';
import { colores, radios } from '@/tema/colores';
import { soles } from '@/utilidades/dinero';
import { fechaHoraAgenda } from '@/utilidades/formato';
import { diaMes, porcentajeAcotado, textoSaldoFinal } from '@/utilidades/viaticos';
import { Boton } from './Boton';
import { EtiquetaEstado, type EstadoEtiqueta } from './EtiquetaEstado';

/** Piezas compartidas de "Viáticos y Gastos" (HU-25 / HU-26): encabezado de saldos, pestañas, filtros, tarjetas y filas. */

// ── Gastos: etiqueta e ícono por estado ─────────────────────────────────────────────────

const gastoPorEstado: Record<EstadoGasto, { etiqueta: EstadoEtiqueta; texto: string; icono: keyof typeof Ionicons.glyphMap; color: string }> = {
  pendiente: { etiqueta: 'pendiente', texto: 'PENDIENTE', icono: 'ellipsis-horizontal-circle', color: colores.naranja },
  aprobado: { etiqueta: 'conforme', texto: 'APROBADO', icono: 'checkmark-circle', color: colores.verde },
  observado: { etiqueta: 'observado', texto: 'OBSERVADO', icono: 'alert-circle', color: '#EA580C' },
  rechazado: { etiqueta: 'bloqueado', texto: 'RECHAZADO', icono: 'close-circle', color: colores.rojo },
};

export function estiloGasto(estado: EstadoGasto) {
  return gastoPorEstado[estado] ?? gastoPorEstado.pendiente;
}

export function EtiquetaGasto({ estado }: { estado: EstadoGasto }) {
  const e = estiloGasto(estado);
  return <EtiquetaEstado estado={e.etiqueta} texto={e.texto} />;
}

// ── Encabezado azul con los saldos ──────────────────────────────────────────────────────

export function CabeceraSaldos({ resumen }: { resumen: ResumenViaticos }) {
  const activos = resumen.viaticosActivos;
  const revision = resumen.gastosEnRevisionCantidad;
  return (
    <View style={estilos.cabecera} testID="viaticos-cabecera">
      <View style={estilos.cabeceraCol}>
        <Text style={estilos.cabeceraEtiqueta}>SALDO POR RENDIR</Text>
        <Text style={estilos.cabeceraMonto}>{soles(resumen.saldoPorRendir)}</Text>
        <Text style={estilos.cabeceraNota}>{activos === 1 ? '1 viático activo' : `${activos} viáticos activos`}</Text>
      </View>
      <View style={estilos.cabeceraDivisor} />
      <View style={estilos.cabeceraCol}>
        <Text style={estilos.cabeceraEtiqueta}>GASTOS EN REVISIÓN</Text>
        <Text style={estilos.cabeceraMonto}>{soles(resumen.gastosEnRevision)}</Text>
        <Text style={estilos.cabeceraNota}>{revision === 1 ? '1 por revisar' : `${revision} por revisar`}</Text>
      </View>
    </View>
  );
}

// ── Pestañas y filtros ──────────────────────────────────────────────────────────────────

export function Pestanas({
  activa,
  onCambiar,
  solicitudes,
}: {
  activa: 'viaticos' | 'solicitudes';
  onCambiar: (tab: 'viaticos' | 'solicitudes') => void;
  solicitudes: number;
}) {
  const items = [
    { id: 'viaticos' as const, texto: 'Viáticos', icono: 'wallet-outline' as const },
    { id: 'solicitudes' as const, texto: solicitudes > 0 ? `Solicitudes (${solicitudes})` : 'Solicitudes', icono: 'receipt-outline' as const },
  ];
  return (
    <View style={estilos.pestanas} accessibilityRole="tablist">
      {items.map((p) => {
        const activo = p.id === activa;
        return (
          <Pressable
            key={p.id}
            onPress={() => onCambiar(p.id)}
            accessibilityRole="tab"
            accessibilityState={{ selected: activo }}
            style={[estilos.pestana, activo && estilos.pestanaActiva]}
            testID={`pestana-${p.id}`}
          >
            <Ionicons name={p.icono} size={17} color={activo ? colores.blanco : colores.titulo} />
            <Text style={[estilos.pestanaTexto, activo && { color: colores.blanco }]} numberOfLines={1}>
              {p.texto}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Chips<T extends string>({
  opciones,
  activo,
  onCambiar,
}: {
  opciones: { id: T; texto: string; cantidad?: number }[];
  activo: T;
  onCambiar: (id: T) => void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={estilos.chips}>
      {opciones.map((o) => {
        const sel = o.id === activo;
        return (
          <Pressable
            key={o.id}
            onPress={() => onCambiar(o.id)}
            accessibilityRole="tab"
            accessibilityState={{ selected: sel }}
            style={[estilos.chip, sel && estilos.chipActivo]}
            testID={`filtro-${o.id}`}
          >
            <Text style={[estilos.chipTexto, sel && estilos.chipTextoActivo]}>
              {o.texto}
              {!!o.cantidad && <Text style={estilos.chipCantidad}> ({o.cantidad})</Text>}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

// ── Barra de avance y bloques de importes ───────────────────────────────────────────────

export function BarraAvance({ porcentaje }: { porcentaje: number }) {
  return (
    <View style={estilos.barra} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: porcentajeAcotado(porcentaje) }}>
      <View style={[estilos.barraRelleno, { width: `${porcentajeAcotado(porcentaje)}%` }]} />
    </View>
  );
}

export function Importe({ titulo, valor, color, alinear = 'left' }: { titulo: string; valor: string; color?: string; alinear?: 'left' | 'right' }) {
  return (
    <View style={{ flex: 1, alignItems: alinear === 'right' ? 'flex-end' : 'flex-start' }}>
      <Text style={estilos.importeEtiqueta}>{titulo}</Text>
      <Text style={[estilos.importeValor, color ? { color } : null]} numberOfLines={1} adjustsFontSizeToFit>
        {valor}
      </Text>
    </View>
  );
}

// ── Tarjeta de un viático (HU-25) ───────────────────────────────────────────────────────

export function TarjetaViatico({ viatico: v, onVerDetalle }: { viatico: Viatico; onVerDetalle: () => void }) {
  const saldo = textoSaldoFinal(v);
  const lugar = [v.cliente, v.sede].filter(Boolean).join(' · ');
  return (
    <View style={estilos.tarjeta} testID={`viatico-${v.idProgramacion}`}>
      <View style={estilos.tarjetaFila}>
        <Text style={estilos.codigo}>{v.codigo}</Text>
        {v.cerrado ? <EtiquetaEstado estado="no_aplica" texto="RENDICIÓN CERRADA" /> : <EtiquetaEstado estado="info" texto={v.estadoProgramacionLabel.toUpperCase()} />}
      </View>
      <Text style={estilos.tarjetaTitulo}>{v.numeroOs}</Text>
      {!!lugar && <Text style={estilos.tarjetaSub}>{lugar}</Text>}
      {!!v.fechaEjecucion && (
        <View style={estilos.fechaFila}>
          <Ionicons name="calendar-outline" size={15} color={colores.textoSecundario} />
          <Text style={estilos.fechaTexto}>
            {fechaHoraAgenda(v.fechaEjecucion, v.horaInicio, v.horaFin)}
            {!v.cerrado ? ' · asignó el Jefe de Operaciones' : ''}
          </Text>
        </View>
      )}

      {v.cerrado && saldo ? (
        <>
          <View style={estilos.importes}>
            <Importe titulo="ASIGNADO" valor={soles(v.asignado)} />
            <Importe titulo="SALDO FINAL" valor={`${saldo.titulo} ${saldo.valor}`} alinear="right" />
          </View>
          <Pressable onPress={onVerDetalle} accessibilityRole="link" hitSlop={8} testID={`ver-rendicion-${v.idProgramacion}`}>
            <Text style={estilos.enlace}>Ver detalle rendición ›</Text>
          </Pressable>
        </>
      ) : (
        <>
          <View style={estilos.importes}>
            <Importe titulo="ASIGNADO" valor={soles(v.asignado)} />
            <Importe titulo="POR RENDIR" valor={soles(v.porRendir)} color={colores.primario} alinear="right" />
          </View>
          <BarraAvance porcentaje={v.porcentajeRendido} />
          <Text style={estilos.progresoTexto}>
            Rendido {soles(v.rendido)} ({porcentajeAcotado(v.porcentajeRendido)} %)
            {v.pendienteDeposito > 0 ? ` · ${soles(v.pendienteDeposito)} pendiente de depósito` : ''}
          </Text>
          <Boton titulo="Ver detalle" variante="secundario" onPress={onVerDetalle} />
        </>
      )}
    </View>
  );
}

// ── Fila de un gasto (HU-26) ────────────────────────────────────────────────────────────

export function FilaGasto({ gasto: g, onPress }: { gasto: Gasto; onPress: () => void }) {
  const e = estiloGasto(g.estado);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${g.concepto}, ${g.moneda} ${g.monto.toFixed(2)}, ${e.texto.toLowerCase()}`}
      style={({ pressed }) => [estilos.filaGasto, pressed && { opacity: 0.75 }]}
      testID={`gasto-${g.idGasto}`}
    >
      <Ionicons name={e.icono} size={26} color={e.color} />
      <View style={{ flex: 1, gap: 3 }}>
        <View style={estilos.filaGastoArriba}>
          <Text style={estilos.gastoConcepto} numberOfLines={1}>
            {g.concepto}
          </Text>
          <Text style={estilos.gastoMonto}>{`${g.moneda} ${g.monto.toFixed(2)}`}</Text>
        </View>
        <Text style={estilos.gastoSub} numberOfLines={2}>
          {[g.codigo, `Gasto del ${diaMes(g.fecha)}`, g.numeroOs].filter(Boolean).join(' · ')}
        </Text>
        {!!g.codigoProgramacion && <Text style={estilos.gastoSub}>Viático {g.codigoProgramacion}</Text>}
        <View style={estilos.filaGastoAbajo}>
          <EtiquetaGasto estado={g.estado} />
          <Text style={estilos.gastoNota}>{g.estado === 'observado' ? 'Ver observación' : g.tieneComprobante ? 'Con foto' : 'Sin foto'}</Text>
        </View>
      </View>
    </Pressable>
  );
}

const estilos = StyleSheet.create({
  cabecera: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colores.primario,
    borderRadius: radios.tarjeta,
    paddingVertical: 16,
    paddingHorizontal: 18,
    gap: 14,
  },
  cabeceraCol: { flex: 1, gap: 3 },
  cabeceraDivisor: { width: 1, alignSelf: 'stretch', backgroundColor: 'rgba(255,255,255,0.3)' },
  cabeceraEtiqueta: { fontSize: 10.5, fontWeight: '700', letterSpacing: 0.8, color: 'rgba(255,255,255,0.85)' },
  cabeceraMonto: { fontSize: 22, fontWeight: '800', color: colores.blanco },
  cabeceraNota: { fontSize: 12.5, color: 'rgba(255,255,255,0.85)' },
  pestanas: { flexDirection: 'row', gap: 10, marginTop: 14 },
  pestana: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: colores.borde,
    backgroundColor: colores.tarjeta,
    borderRadius: radios.campo,
    paddingVertical: 11,
    paddingHorizontal: 8,
  },
  pestanaActiva: { backgroundColor: colores.primario, borderColor: colores.primario },
  pestanaTexto: { fontSize: 14.5, fontWeight: '700', color: colores.titulo, flexShrink: 1 },
  chips: { gap: 8, paddingVertical: 12 },
  chip: { borderWidth: 1, borderColor: colores.borde, backgroundColor: colores.tarjeta, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 7 },
  chipActivo: { backgroundColor: colores.primarioSuave, borderColor: colores.primario },
  chipTexto: { fontSize: 13.5, fontWeight: '600', color: colores.titulo },
  chipTextoActivo: { color: colores.primarioOscuro },
  chipCantidad: { fontWeight: '700' },
  barra: { height: 6, borderRadius: 3, backgroundColor: colores.grisFondo, overflow: 'hidden', marginTop: 10 },
  barraRelleno: { height: 6, borderRadius: 3, backgroundColor: colores.primario },
  importeEtiqueta: { fontSize: 10.5, fontWeight: '700', letterSpacing: 0.8, color: colores.textoSecundario },
  importeValor: { fontSize: 20, fontWeight: '800', color: colores.titulo, marginTop: 2 },
  importes: { flexDirection: 'row', gap: 12, marginTop: 14 },
  tarjeta: { backgroundColor: colores.tarjeta, borderRadius: radios.tarjeta, borderWidth: 1, borderColor: colores.bordeSuave, padding: 16, gap: 4 },
  tarjetaFila: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  codigo: { fontSize: 12, fontWeight: '700', color: colores.textoSecundario, flexShrink: 1 },
  tarjetaTitulo: { fontSize: 18, fontWeight: '800', color: colores.titulo, marginTop: 2 },
  tarjetaSub: { fontSize: 13.5, color: colores.textoSecundario },
  fechaFila: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 4 },
  fechaTexto: { flex: 1, fontSize: 13, lineHeight: 18, color: colores.textoSecundario },
  progresoTexto: { fontSize: 12.5, color: colores.textoSecundario, marginTop: 6, marginBottom: 10, lineHeight: 18 },
  enlace: { fontSize: 14, fontWeight: '700', color: colores.primario, marginTop: 12 },
  filaGasto: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: colores.tarjeta,
    borderRadius: radios.tarjeta,
    borderWidth: 1,
    borderColor: colores.bordeSuave,
    padding: 14,
  },
  filaGastoArriba: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  filaGastoAbajo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  gastoConcepto: { flex: 1, fontSize: 15.5, fontWeight: '700', color: colores.titulo },
  gastoMonto: { fontSize: 15.5, fontWeight: '800', color: colores.titulo },
  gastoSub: { fontSize: 12.5, lineHeight: 17, color: colores.textoSecundario },
  gastoNota: { fontSize: 12.5, color: colores.textoSecundario },
});
