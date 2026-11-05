import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import type { ServicioProgramado } from '@/api/servicios';
import { colores, radios } from '@/tema/colores';
import { fechaHoraAgenda } from '@/utilidades/formato';

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
  const alerta = s.alertaPredictiva?.trim();
  if (alerta) {
    lista.push({ icono: 'warning-outline', texto: `Alerta predictiva: ${alerta}`, tono: 'naranja' });
  } else if (s.alertasPredictivas > 0) {
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

/**
 * Tarjeta de un servicio en la agenda (HU-03).
 * Un servicio BLOQUEADO muestra los mismos datos, el motivo del bloqueo en un recuadro rojo y el detalle deshabilitado
 * hasta que se levante el motivo (el estado lo calcula el back: OS bloqueada, expediente con bloqueo o SSOMA bloqueado).
 */
export function TarjetaServicio({ servicio: s, onVerDetalle }: Props) {
  const bloqueado = s.estadoGeneral === 'BLOQUEADO';
  const listo = s.estadoGeneral === 'LISTO';
  const etiqueta = etiquetasEstado[s.estadoGeneral] ?? etiquetasEstado.PENDIENTE;
  const documentos = [s.numeroRq, s.numeroOs, s.numeroOm].filter(Boolean).join(' · ');
  const objetivos = s.objetivosTotal > 0 ? `${s.objetivosCompletados} de ${s.objetivosTotal}` : 'Sin equipos asignados';
  const responsableLugar = [s.responsable, s.sede].filter(Boolean).join(' · ') || '—';
  const tecnicos = s.numeroTecnicos ?? 0;
  const equipoTrabajo = tecnicos > 0 ? `${tecnicos} ${tecnicos === 1 ? 'técnico' : 'técnicos'}` : null;

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
        <Text style={estilos.fechaTexto}>{fechaHoraAgenda(s.fechaEjecucion, s.horaInicio, s.horaFin)}</Text>
      </View>

      <View style={estilos.separador} />

      <View style={estilos.fila}>
        <View style={estilos.columna}>
          <Text style={estilos.rotulo}>DOCUMENTOS</Text>
          <Text style={estilos.valor}>{documentos || '—'}</Text>
        </View>
        <View style={estilos.columna}>
          <Text style={estilos.rotulo}>OBJETIVOS</Text>
          <Text style={estilos.valor}>{objetivos}</Text>
        </View>
      </View>
      <Text style={[estilos.rotulo, { marginTop: 12 }]}>RESPONSABLE / LUGAR</Text>
      <Text style={estilos.valor}>{responsableLugar}</Text>
      {(!!s.tipoServicio || !!equipoTrabajo) && (
        <View style={[estilos.fila, { marginTop: 12 }]}>
          {!!s.tipoServicio && (
            <View style={estilos.columna}>
              <Text style={estilos.rotulo}>TIPO DE SERVICIO</Text>
              <Text style={estilos.valor}>{s.tipoServicio}</Text>
            </View>
          )}
          {!!equipoTrabajo && (
            <View style={estilos.columna}>
              <Text style={estilos.rotulo}>EQUIPO DE TRABAJO</Text>
              <Text style={estilos.valor}>{equipoTrabajo}</Text>
            </View>
          )}
        </View>
      )}

      {bloqueado && (
        <View style={estilos.recuadroBloqueo} accessibilityRole="alert">
          <Ionicons name="lock-closed" size={18} color={colores.rojo} />
          <Text style={estilos.motivo}>
            <Text style={estilos.motivoRotulo}>Motivo del bloqueo:</Text> {s.motivoBloqueo ?? 'Servicio bloqueado.'}
          </Text>
        </View>
      )}

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

      <View style={{ height: 16 }} />
      <Pressable
        onPress={onVerDetalle}
        disabled={bloqueado}
        accessibilityRole="button"
        accessibilityLabel={bloqueado ? 'Detalle bloqueado' : 'Ver detalle'}
        accessibilityHint={bloqueado ? 'Se habilita cuando se levante el motivo del bloqueo' : undefined}
        accessibilityState={{ disabled: bloqueado }}
        style={({ pressed }) => [
          estilos.boton,
          bloqueado ? estilos.botonBloqueado : listo ? estilos.botonLleno : estilos.botonContorno,
          pressed && !bloqueado && { opacity: 0.8 },
        ]}
      >
        {bloqueado && <Ionicons name="lock-closed-outline" size={17} color={colores.textoTenue} />}
        <Text
          style={[
            estilos.botonTexto,
            bloqueado ? { color: colores.textoTenue } : listo ? { color: colores.blanco } : { color: colores.primarioOscuro },
          ]}
        >
          {bloqueado ? 'Detalle bloqueado' : 'Ver detalle'}
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
  recuadroBloqueo: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginTop: 14,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FECACA',
    backgroundColor: '#FEF2F2',
  },
  motivo: { flex: 1, fontSize: 14, lineHeight: 20, color: colores.rojoEtiquetaTexto },
  motivoRotulo: { fontWeight: '700' },
  indicadores: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  indicador: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 5,
    maxWidth: '100%',
  },
  indicadorTexto: { fontSize: 12, fontWeight: '500', flexShrink: 1 },
  boton: { minHeight: 48, borderRadius: radios.boton, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  botonLleno: { backgroundColor: colores.primarioOscuro },
  botonContorno: { borderWidth: 1.5, borderColor: colores.primarioOscuro, backgroundColor: colores.blanco },
  botonBloqueado: { backgroundColor: '#EEF0F3' },
  botonTexto: { fontSize: 15, fontWeight: '600' },
});
