import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { nombreDeCodigo, obtenerCatalogo } from '@/api/catalogos';
import { ErrorApi } from '@/api/cliente';
import { obtenerHorasTecnico } from '@/api/equipoJefatura';
import { Aviso } from '@/componentes/Aviso';
import { EncabezadoApp } from '@/componentes/EncabezadoApp';
import { useConsulta } from '@/hooks/useConsulta';
import { useDiseno } from '@/hooks/useDiseno';
import { useSesion } from '@/sesion/SesionContext';
import { colores, radios } from '@/tema/colores';
import {
  DIAS_SEMANA,
  construirCalendario,
  diaMesCorto,
  mesActualLima,
  moverMes,
  nombreMes,
  puedeIrAdelante,
  puedeIrAtras,
  textoDiaLargo,
  textoHoras,
  textoHorasCorto,
} from '@/utilidades/equipoJefatura';

/**
 * HU-36 — Horas contabilizadas de un técnico (Jefe de Área): calendario del mes con las horas realmente trabajadas cada día (desde que inicia hasta que finaliza cada servicio),
 * el acumulado de cada semana, el acumulado del mes y el historial guardado de cada mes (los meses cerrados quedan como foto). Toca un día para ver sus servicios.
 * Se abre desde la ficha del técnico (?id=). Las horas las calcula y guarda el back; aquí solo se muestran.
 */
export default function PantallaEquipoHoras() {
  const { sesion } = useSesion();
  const usuario = sesion?.usuario;
  const d = useDiseno();
  const params = useLocalSearchParams<{ id?: string }>();
  const id = Number(params.id);
  const valido = Number.isInteger(id) && id > 0;
  const [mes, setMes] = useState(mesActualLima());
  const [dia, setDia] = useState<string | null>(null);

  const { datos, cargando, recargando, error, recargar } = useConsulta(async (token) => {
    if (!valido) throw new ErrorApi('El técnico indicado no es válido.', 400, 1);
    const [horas, cargos] = await Promise.all([obtenerHorasTecnico(token, id, mes), obtenerCatalogo(token, 'CARGO_USUARIO').catch(() => undefined)]);
    return { horas, cargos };
  }, `${params.id ?? ''}|${mes}`);

  const cargo = nombreDeCodigo(datos?.cargos, usuario?.cargo) ?? usuario?.cargo ?? 'Jefe de Área';
  const h = datos?.horas ?? null;
  const filas = useMemo(() => (h ? construirCalendario(h.mes, h.dias, h.semanas) : []), [h]);
  const maxMinutos = useMemo(() => Math.max(60, ...(h?.dias.map((x) => x.minutos) ?? [0])), [h]);
  const seleccionado = h?.dias.find((x) => x.fecha === dia) ?? null;

  function cambiarMes(delta: number) {
    setDia(null);
    setMes((m) => moverMes(m, delta));
  }

  return (
    <SafeAreaView style={estilos.area} edges={['top']}>
      <EncabezadoApp nombre={usuario?.nombre ?? ''} apellido={usuario?.apellido} subtitulo={`${usuario?.nombre ?? ''} · ${cargo}`} />
      <ScrollView
        contentContainerStyle={[estilos.contenido, { paddingHorizontal: d.margen, maxWidth: d.anchoMaximo }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={recargando} onRefresh={() => void recargar()} colors={[colores.primario]} />}
      >
        <View style={estilos.tituloFila}>
          <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Volver">
            <Ionicons name="arrow-back" size={24} color={colores.titulo} />
          </Pressable>
          <Text style={[estilos.titulo, { fontSize: d.tituloPantalla }]} accessibilityRole="header">
            Horas contabilizadas
          </Text>
        </View>
        <Text style={estilos.subtitulo}>{h ? `${h.tecnico.nombre} · desde que inicia hasta que finaliza cada servicio` : 'Calendario de horas trabajadas'}</Text>

        {/* Mes */}
        <View style={estilos.navegacion}>
          <Pressable onPress={() => cambiarMes(-1)} disabled={!puedeIrAtras(mes)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Mes anterior">
            <Ionicons name="chevron-back-circle" size={34} color={puedeIrAtras(mes) ? colores.primario : '#CBD5E1'} />
          </Pressable>
          <Text style={estilos.mes} testID="horas-mes">
            {nombreMes(mes)}
          </Text>
          <Pressable onPress={() => cambiarMes(1)} disabled={!puedeIrAdelante(mes)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Mes siguiente">
            <Ionicons name="chevron-forward-circle" size={34} color={puedeIrAdelante(mes) ? colores.primario : '#CBD5E1'} />
          </Pressable>
        </View>

        {cargando ? (
          <ActivityIndicator color={colores.primario} style={{ marginTop: 40 }} />
        ) : error || !h ? (
          <Aviso tipo="error" mensaje={error ?? 'No se pudieron cargar las horas.'} />
        ) : (
          <>
            {/* Acumulado del mes */}
            <View style={estilos.resumen} testID="horas-resumen">
              <View style={[estilos.resumenItem, estilos.resumenPrincipal]}>
                <Text style={estilos.resumenTitulo}>ACUMULADO DEL MES</Text>
                <Text style={estilos.resumenValor}>{textoHoras(h.totalMinutos)}</Text>
                {h.cerrado && <Text style={estilos.resumenNota}>Mes cerrado</Text>}
              </View>
              <View style={estilos.resumenItem}>
                <Text style={estilos.resumenTitulo}>DÍAS</Text>
                <Text style={estilos.resumenValor}>{h.diasTrabajados}</Text>
              </View>
              <View style={estilos.resumenItem}>
                <Text style={estilos.resumenTitulo}>SERVICIOS</Text>
                <Text style={estilos.resumenValor}>{h.servicios}</Text>
              </View>
            </View>

            {/* Calendario */}
            <View style={estilos.calendario} testID="horas-calendario">
              <View style={estilos.filaCal}>
                {DIAS_SEMANA.map((n) => (
                  <Text key={n} style={estilos.cabCal}>
                    {n}
                  </Text>
                ))}
                <Text style={[estilos.cabCal, estilos.colSemana]}>Sem.</Text>
              </View>
              {filas.map((f) => (
                <View key={f.desde} style={estilos.filaCal}>
                  {f.celdas.map((c, i) => {
                    if (!c.fecha) return <View key={i} style={estilos.celda} />;
                    const activa = dia === c.fecha;
                    const intensidad = c.minutos > 0 ? 0.18 + 0.62 * Math.min(1, c.minutos / maxMinutos) : 0;
                    return (
                      <Pressable
                        key={c.fecha}
                        onPress={() => setDia(activa ? null : c.fecha)}
                        style={[
                          estilos.celda,
                          estilos.celdaDia,
                          { backgroundColor: c.trabajo ? `rgba(37,99,235,${intensidad || 0.12})` : colores.blanco },
                          c.esHoy && estilos.celdaHoy,
                          activa && estilos.celdaActiva,
                        ]}
                        accessibilityRole="button"
                        accessibilityLabel={`${textoDiaLargo(c.fecha)}: ${c.trabajo ? textoHoras(c.minutos) : 'sin horas'}`}
                        testID={`horas-dia-${c.fecha}`}
                      >
                        <Text style={[estilos.celdaDiaNumero, c.minutos / maxMinutos > 0.6 && { color: colores.blanco }]}>{c.dia}</Text>
                        {c.trabajo && <Text style={[estilos.celdaHoras, c.minutos / maxMinutos > 0.6 && { color: colores.blanco }]}>{c.sinCierre && c.minutos === 0 ? '…' : textoHorasCorto(c.minutos)}</Text>}
                      </Pressable>
                    );
                  })}
                  <View style={[estilos.celda, estilos.colSemana, estilos.celdaSemana]} testID={`horas-semana-${f.desde}`}>
                    <Text style={estilos.semanaHoras}>{f.minutos > 0 ? textoHorasCorto(f.minutos) : '—'}</Text>
                    <Text style={estilos.semanaDias}>{f.diasTrabajados > 0 ? `${f.diasTrabajados} d` : ''}</Text>
                  </View>
                </View>
              ))}
              <Text style={estilos.leyenda}>Horas por día (h:mm) · la última columna es el acumulado de la semana, solo con los días de este mes.</Text>
            </View>

            {/* Detalle del día */}
            {!!seleccionado && (
              <View style={estilos.detalle} testID="horas-detalle-dia">
                <Text style={estilos.detalleTitulo}>{textoDiaLargo(seleccionado.fecha)}</Text>
                <Text style={estilos.detalleTotal}>
                  {textoHoras(seleccionado.minutos)}
                  {seleccionado.inicio ? ` · ${seleccionado.inicio}${seleccionado.fin ? ` a ${seleccionado.fin}` : ''}` : ''}
                </Text>
                {seleccionado.sinCierre && <Text style={estilos.sinCierre}>Hay un servicio iniciado sin cierre registrado: esas horas no se cuentan.</Text>}
                {seleccionado.detalle.map((s, i) => (
                  <View key={`${s.idOs}-${i}`} style={[estilos.servicio, i > 0 && estilos.servicioBorde]}>
                    <Text style={estilos.servicioNumero}>{s.numero}</Text>
                    <Text style={estilos.servicioHoras}>
                      {s.inicio} – {s.fin ?? 'sin cierre'}
                    </Text>
                    <Text style={estilos.servicioMin}>{textoHoras(s.minutos)}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Historial por mes */}
            <Text style={estilos.seccion}>HISTORIAL POR MES</Text>
            <View style={estilos.lista} testID="horas-historial">
              {h.historial.length === 0 ? (
                <Text style={estilos.vacio}>Aún no hay horas registradas.</Text>
              ) : (
                h.historial.map((m, i) => (
                  <Pressable
                    key={m.mes}
                    onPress={() => {
                      setDia(null);
                      setMes(m.mes);
                    }}
                    style={[estilos.histFila, i > 0 && estilos.servicioBorde, m.mes === mes && estilos.histActivo]}
                    accessibilityRole="button"
                    accessibilityLabel={`Ver ${nombreMes(m.mes)}`}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={estilos.histMes}>{nombreMes(m.mes)}</Text>
                      <Text style={estilos.histMeta}>
                        {m.diasTrabajados} {m.diasTrabajados === 1 ? 'día' : 'días'} · {m.servicios} {m.servicios === 1 ? 'servicio' : 'servicios'}
                        {m.cerrado ? ' · cerrado' : ' · en curso'}
                      </Text>
                    </View>
                    <Text style={estilos.histHoras}>{textoHoras(m.minutos)}</Text>
                    <Ionicons name="chevron-forward" size={16} color={colores.textoSecundario} />
                  </Pressable>
                ))
              )}
            </View>
            {h.dias.length > 0 && <Text style={estilos.nota}>Último día con horas: {diaMesCorto(h.dias[h.dias.length - 1].fecha)}.</Text>}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const estilos = StyleSheet.create({
  area: { flex: 1, backgroundColor: colores.fondo },
  contenido: { paddingTop: 18, paddingBottom: 28, width: '100%', alignSelf: 'center' },
  tituloFila: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 2 },
  titulo: { fontWeight: '800', color: colores.titulo, flexShrink: 1 },
  subtitulo: { color: colores.textoSecundario, fontSize: 14, marginBottom: 12 },
  navegacion: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  mes: { fontSize: 19, fontWeight: '800', color: colores.titulo, textTransform: 'capitalize' },
  resumen: { flexDirection: 'row', gap: 8 },
  resumenItem: { flex: 1, backgroundColor: colores.blanco, borderWidth: 1, borderColor: colores.bordeSuave, borderRadius: 14, paddingVertical: 11, paddingHorizontal: 10 },
  resumenPrincipal: { flex: 2, backgroundColor: colores.primarioSuave, borderColor: '#BFD7F5' },
  resumenTitulo: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.6, color: colores.textoSecundario },
  resumenValor: { fontSize: 21, fontWeight: '800', color: colores.titulo, marginTop: 4 },
  resumenNota: { fontSize: 11.5, color: colores.textoSecundario, marginTop: 1 },
  calendario: { backgroundColor: colores.blanco, borderWidth: 1, borderColor: colores.bordeSuave, borderRadius: radios.tarjeta, padding: 8, marginTop: 12, gap: 4 },
  filaCal: { flexDirection: 'row', gap: 4 },
  cabCal: { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '800', color: colores.textoSecundario, paddingVertical: 4 },
  colSemana: { flex: 1.25 },
  celda: { flex: 1, minHeight: 50 },
  celdaDia: { borderRadius: 8, borderWidth: 1, borderColor: colores.bordeSuave, alignItems: 'center', justifyContent: 'center', paddingVertical: 4 },
  celdaHoy: { borderColor: colores.primario, borderWidth: 2 },
  celdaActiva: { borderColor: colores.titulo, borderWidth: 2 },
  celdaDiaNumero: { fontSize: 11.5, color: colores.textoSecundario, fontWeight: '700' },
  celdaHoras: { fontSize: 12.5, color: colores.titulo, fontWeight: '800', marginTop: 1 },
  celdaSemana: { borderRadius: 8, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' },
  semanaHoras: { fontSize: 13, fontWeight: '800', color: colores.titulo },
  semanaDias: { fontSize: 10.5, color: colores.textoSecundario },
  leyenda: { fontSize: 11.5, color: colores.textoTenue, marginTop: 4, lineHeight: 16 },
  detalle: { backgroundColor: colores.blanco, borderWidth: 1, borderColor: colores.bordeSuave, borderRadius: radios.tarjeta, padding: 14, marginTop: 12, gap: 4 },
  detalleTitulo: { fontSize: 14, fontWeight: '800', color: colores.titulo, textTransform: 'capitalize' },
  detalleTotal: { fontSize: 18, fontWeight: '800', color: colores.primario },
  sinCierre: { fontSize: 13, color: '#B45309', fontWeight: '600' },
  servicio: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  servicioBorde: { borderTopWidth: 1, borderTopColor: colores.bordeSuave },
  servicioNumero: { flex: 1, fontSize: 14, fontWeight: '700', color: colores.titulo },
  servicioHoras: { fontSize: 13, color: colores.textoSecundario },
  servicioMin: { fontSize: 13.5, fontWeight: '800', color: colores.titulo, minWidth: 64, textAlign: 'right' },
  seccion: { fontSize: 13, fontWeight: '800', letterSpacing: 1.2, color: colores.textoSecundario, marginTop: 20, marginBottom: 10 },
  lista: { backgroundColor: colores.blanco, borderWidth: 1, borderColor: colores.bordeSuave, borderRadius: radios.tarjeta, paddingHorizontal: 14 },
  vacio: { color: colores.textoSecundario, fontSize: 14.5, textAlign: 'center', paddingVertical: 14 },
  histFila: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12 },
  histActivo: { backgroundColor: '#F8FAFC' },
  histMes: { fontSize: 15, fontWeight: '700', color: colores.titulo, textTransform: 'capitalize' },
  histMeta: { fontSize: 12.5, color: colores.textoSecundario, marginTop: 1 },
  histHoras: { fontSize: 15, fontWeight: '800', color: colores.titulo },
  nota: { fontSize: 12.5, color: colores.textoTenue, marginTop: 8 },
});
