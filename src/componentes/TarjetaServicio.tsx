import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import type { ServicioProgramado } from '@/api/servicios';
import { colores, radios } from '@/tema/colores';
import { fechaHora } from '@/utilidades/formato';

interface Props {
  servicio: ServicioProgramado;
  onVerDetalle: () => void;
}

const etiquetasEstado = {
  LISTO: { fondo: colores.verdeEtiquetaFondo, texto: colores.verdeEtiquetaTexto },
  PENDIENTE: { fondo: colores.amarilloFondo, texto: colores.amarilloTexto },
  BLOQUEADO: { fondo: colores.rojoEtiquetaFondo, texto: colores.rojoEtiquetaTexto },
} as const;

type NombreIcono = ComponentProps<typeof Ionicons>['name'];
interface Indicador {
  icono: NombreIcono;
  texto: string;
  tono: 'verde' | 'naranja' | 'rojo';
}

function indicadores(s: ServicioProgramado): Indicador[] {
  const lista: Indicador[] = [
    s.clienteConfirmado
      ? { icono: 'checkmark-circle-outline', texto: 'Cliente confirmado', tono: 'verde' }
      : { icono: 'warning-outline', texto: 'Cliente no confirmado', tono: 'naranja' },
    s.estadoSsoma === 'habilitado'
      ? { icono: 'shield-checkmark-outline', texto: 'SSOMA aprobado', tono: 'verde' }
      : s.estadoSsoma === 'bloqueado'
        ? { icono: 'shield-outline', texto: 'SSOMA bloqueado', tono: 'rojo' }
        : { icono: 'alert-circle-outline', texto: 'SSOMA pendiente', tono: 'naranja' },
  ];
  if (s.alertasPredictivas > 0) {
    lista.push({
      icono: 'warning-outline',
      texto: s.alertasPredictivas === 1 ? 'Alerta predictiva' : `${s.alertasPredictivas} alertas predictivas`,
      tono: 'naranja',
    });
  }
  return lista;
}

const tonosIndicador = {
  verde: { fondo: '#F0FDF4', borde: '#BBF7D0', texto: '#166534', icono: colores.verde },
  naranja: { fondo: '#FFFBEB', borde: '#FDE68A', texto: '#92400E', icono: colores.naranja },
  rojo: { fondo: '#FEF2F2', borde: '#FECACA', texto: '#991B1B', icono: colores.rojo },
} as const;

/** Tarjeta de un servicio en la agenda (HU-03). */
export function TarjetaServicio({ servicio: s, onVerDetalle }: Props) {
  const bloqueado = s.estadoGeneral === 'BLOQUEADO';
  const listo = s.estadoGeneral === 'LISTO';
  const etiqueta = etiquetasEstado[s.estadoGeneral] ?? etiquetasEstado.PENDIENTE;
  const documentos = [s.numeroRq, s.numeroOs, s.numeroOm].filter(Boolean).join(' | ');
  const objetivos =
    s.objetivosTotal > 0 ? `${s.objetivosCompletados} de ${s.objetivosTotal} completados` : 'Sin equipos asignados';
  const responsableLugar = [s.responsable, s.sede].filter(Boolean).join(' | ') || '—';

  return (
    <View style={estilos.tarjeta} testID={`servicio-${s.numeroOs}`}>
      <View style={estilos.cabecera}>
        <Text style={estilos.cliente} numberOfLines={2}>
          {s.cliente ?? 'Cliente sin nombre'}
        </Text>
        <View style={[estilos.etiqueta, { backgroundColor: etiqueta.fondo }]}>
          <Text style={[estilos.etiquetaTexto, { color: etiqueta.texto }]}>{s.estadoGeneral}</Text>
        </View>
      </View>
      <View style={estilos.fecha}>
        <Ionicons name="calendar-outline" size={15} color={colores.textoSecundario} />
        <Text style={estilos.fechaTexto}>{fechaHora(s.fechaEjecucion, s.horaInicio)}</Text>
      </View>

      <View style={estilos.separador} />

      {bloqueado ? (
        <View style={estilos.fila}>
          <View style={estilos.columna}>
            <Text style={estilos.rotulo}>ORDEN DE SERVICIO</Text>
            <Text style={estilos.valor}>{s.numeroOs}</Text>
          </View>
          <View style={[estilos.columna, { alignItems: 'flex-end' }]}>
            <Text style={[estilos.rotulo, { color: colores.rojo }]}>MOTIVO DEL BLOQUEO</Text>
            <Text style={estilos.motivo}>&quot;{s.motivoBloqueo ?? 'Servicio bloqueado'}&quot;</Text>
          </View>
        </View>
      ) : (
        <>
          <View style={estilos.fila}>
            <View style={estilos.columna}>
              <Text style={estilos.rotulo}>DOCUMENTOS</Text>
              <Text style={estilos.valor}>{documentos}</Text>
            </View>
            <View style={estilos.columna}>
              <Text style={estilos.rotulo}>OBJETIVOS</Text>
              <Text style={estilos.valor}>{objetivos}</Text>
            </View>
          </View>
          <Text style={[estilos.rotulo, { marginTop: 12 }]}>RESPONSABLE / LUGAR</Text>
          <Text style={estilos.valor}>{responsableLugar}</Text>

          <View style={estilos.separador} />

          <View style={estilos.indicadores}>
            {indicadores(s).map((i) => {
              const t = tonosIndicador[i.tono];
              return (
                <View key={i.texto} style={[estilos.indicador, { backgroundColor: t.fondo, borderColor: t.borde }]}>
                  <Ionicons name={i.icono} size={14} color={t.icono} />
                  <Text style={[estilos.indicadorTexto, { color: t.texto }]}>{i.texto}</Text>
                </View>
              );
            })}
          </View>
        </>
      )}

      <View style={{ height: 16 }} />
      <Pressable
        onPress={onVerDetalle}
        disabled={bloqueado}
        accessibilityRole="button"
        accessibilityState={{ disabled: bloqueado }}
        style={({ pressed }) => [
          estilos.boton,
          bloqueado ? estilos.botonBloqueado : listo ? estilos.botonLleno : estilos.botonContorno,
          pressed && !bloqueado && { opacity: 0.8 },
        ]}
      >
        <Text
          style={[
            estilos.botonTexto,
            bloqueado ? { color: colores.textoTenue } : listo ? { color: colores.blanco } : { color: colores.primarioOscuro },
          ]}
        >
          {bloqueado ? 'Detalles Bloqueados' : 'Ver detalle'}
        </Text>
      </Pressable>
    </View>
  );
}

const estilos = StyleSheet.create({
  tarjeta: {
    backgroundColor: colores.tarjeta,
    borderRadius: radios.tarjeta,
    borderWidth: 1,
    borderColor: colores.bordeSuave,
    padding: 18,
  },
  cabecera: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  cliente: { flex: 1, fontSize: 18, fontWeight: '700', color: colores.primarioOscuro },
  etiqueta: { borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  etiquetaTexto: { fontSize: 11, fontWeight: '800', letterSpacing: 0.4 },
  fecha: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  fechaTexto: { fontSize: 14, color: colores.texto },
  separador: { height: 1, backgroundColor: '#EEF2F7', marginVertical: 14 },
  fila: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 16, rowGap: 10 },
  columna: { flexGrow: 1, flexBasis: 130 },
  rotulo: { fontSize: 11, fontWeight: '700', color: colores.textoSecundario, letterSpacing: 0.3, marginBottom: 3 },
  valor: { fontSize: 14, color: colores.texto, lineHeight: 20 },
  motivo: { fontSize: 15, fontWeight: '700', color: colores.rojo, textAlign: 'right' },
  indicadores: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  indicador: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  indicadorTexto: { fontSize: 12, fontWeight: '500' },
  boton: { minHeight: 48, borderRadius: radios.boton, alignItems: 'center', justifyContent: 'center' },
  botonLleno: { backgroundColor: colores.primarioOscuro },
  botonContorno: { borderWidth: 1.5, borderColor: colores.primarioOscuro, backgroundColor: colores.blanco },
  botonBloqueado: { backgroundColor: '#EEF0F3' },
  botonTexto: { fontSize: 15, fontWeight: '600' },
});
