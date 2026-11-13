import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { nombreDeCodigo, obtenerCatalogo } from '@/api/catalogos';
import { ErrorApi } from '@/api/cliente';
import { obtenerViaticos } from '@/api/viaticos';
import { Aviso } from '@/componentes/Aviso';
import { Boton } from '@/componentes/Boton';
import { EncabezadoApp } from '@/componentes/EncabezadoApp';
import { EtiquetaEstado, TituloSeccion } from '@/componentes/EtiquetaEstado';
import { BarraAvance, FilaGasto, Importe } from '@/componentes/ViaticosUI';
import { useConsulta } from '@/hooks/useConsulta';
import { useDiseno } from '@/hooks/useDiseno';
import { useSesion } from '@/sesion/SesionContext';
import { colores, radios } from '@/tema/colores';
import { soles } from '@/utilidades/dinero';
import { fechaHoraAgenda } from '@/utilidades/formato';
import { diaMes, porcentajeAcotado, textoSaldoFinal } from '@/utilidades/viaticos';

/**
 * HU-25 — Detalle de un viático: el adelanto que el Jefe de Operaciones asignó para esa programación.
 *  - Asignado, rendido y por rendir; el adelanto por concepto con su estado de depósito (lo confirma Contabilidad).
 *  - Los gastos que rendiste con ese viático, con su estado, y el aviso si el Jefe observó alguno.
 *  - Con la rendición cerrada: el saldo final (devolución, reembolso adicional o cuadrado).
 * Se abre desde la tarjeta del viático (?id = id de la programación).
 */
export default function PantallaViatico() {
  const { sesion } = useSesion();
  const usuario = sesion?.usuario;
  const d = useDiseno();

  const params = useLocalSearchParams<{ id?: string }>();
  const idProgramacion = Number(params.id);
  const idValido = Number.isInteger(idProgramacion) && idProgramacion > 0;

  const { datos, cargando, recargando, error, recargar } = useConsulta(async (token) => {
    if (!idValido) throw new ErrorApi('Viático no válido.', 400, 1);
    const [todo, cargos] = await Promise.all([obtenerViaticos(token), obtenerCatalogo(token, 'CARGO_USUARIO').catch(() => null)]);
    return { todo, cargos };
  }, params.id ?? '');

  const cargo = nombreDeCodigo(datos?.cargos, usuario?.cargo) ?? usuario?.cargo ?? 'Técnico de Campo';
  const v = datos?.todo.viaticos.find((x) => x.idProgramacion === idProgramacion) ?? null;
  const lineas = (datos?.todo.lineas ?? []).filter((l) => l.idProgramacion === idProgramacion);
  const gastos = (datos?.todo.gastos ?? []).filter((g) => g.idProgramacion === idProgramacion);
  const observados = gastos.filter((g) => g.estado === 'observado');
  const saldo = v ? textoSaldoFinal(v) : null;

  return (
    <SafeAreaView style={estilos.area} edges={['top']}>
      <EncabezadoApp nombre={usuario?.nombre ?? ''} apellido={usuario?.apellido} subtitulo={`${usuario?.nombre ?? ''} · ${cargo}`} />

      <ScrollView
        contentContainerStyle={[estilos.contenido, { paddingHorizontal: d.margen, maxWidth: d.anchoMaximo }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={recargando} onRefresh={recargar} colors={[colores.primario]} />}
      >
        <View style={estilos.tituloFila}>
          <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Volver">
            <Ionicons name="arrow-back" size={24} color={colores.titulo} />
          </Pressable>
          <Text style={estilos.titulo} accessibilityRole="header" numberOfLines={2}>
            {v ? `Viático · ${v.numeroOs}` : 'Viático'}
          </Text>
        </View>
        {!!v && <Text style={estilos.subtitulo}>{[v.codigo, v.cliente].filter(Boolean).join(' · ')}</Text>}

        {cargando ? (
          <ActivityIndicator color={colores.primario} style={{ marginTop: 32 }} />
        ) : error ? (
          <Aviso tipo="error" mensaje={error} />
        ) : !v ? (
          <Aviso tipo="error" mensaje="No se encontró el viático." />
        ) : (
          <>
            <View style={estilos.tarjeta} testID="viatico-resumen">
              <View style={estilos.importes}>
                <Importe titulo="ASIGNADO" valor={soles(v.asignado)} />
                <Importe titulo="RENDIDO" valor={soles(v.rendido)} color={colores.verde} />
                <Importe titulo="POR RENDIR" valor={soles(v.porRendir)} color={colores.primario} alinear="right" />
              </View>
              {!v.cerrado && <BarraAvance porcentaje={v.porcentajeRendido} />}
              <Text style={estilos.programacion}>
                {[v.codigo, fechaHoraAgenda(v.fechaEjecucion, v.horaInicio, v.horaFin)].filter(Boolean).join(' · ')}
                {!v.cerrado && v.pendienteDeposito > 0 ? ` · ${porcentajeAcotado(v.porcentajeRendido)} % rendido` : ''}
              </Text>
            </View>

            {v.cerrado && saldo && (
              <View style={estilos.cierre} testID="viatico-cierre">
                <View style={estilos.cierreFila}>
                  <Text style={estilos.cierreTitulo}>Rendición cerrada</Text>
                  <EtiquetaEstado estado="no_aplica" texto="CERRADA" />
                </View>
                <Text style={estilos.cierreSub}>
                  Cerrada por el Jefe de Operaciones{v.cerradoEn ? ` · ${diaMes(v.cerradoEn)}` : ''}
                </Text>
                <View style={estilos.importes}>
                  <Importe titulo="ASIGNADO" valor={soles(v.asignado)} />
                  <Importe titulo="SALDO FINAL" valor={saldo.valor} alinear="right" />
                </View>
                <View style={estilos.saldoCaja}>
                  <Ionicons name="swap-horizontal" size={20} color={colores.azulTexto} />
                  <View style={{ flex: 1 }}>
                    <Text style={estilos.saldoTitulo}>
                      {saldo.titulo}: {saldo.valor}
                    </Text>
                    <Text style={estilos.saldoTexto}>{saldo.detalle}</Text>
                  </View>
                </View>
              </View>
            )}

            {observados.map((g) => (
              <Pressable
                key={g.idGasto}
                onPress={() => router.push({ pathname: '/solicitud-gasto', params: { id: String(g.idGasto) } })}
                accessibilityRole="button"
                style={estilos.observado}
                testID={`observado-${g.idGasto}`}
              >
                <Ionicons name="alert-circle-outline" size={20} color="#9A3412" />
                <Text style={estilos.observadoTexto}>
                  {g.concepto} observado por el Jefe de Operaciones{g.comentarioRevision ? `: ${g.comentarioRevision}` : '.'}
                </Text>
              </Pressable>
            ))}

            <TituloSeccion texto="ADELANTO ASIGNADO" />
            <View style={estilos.lista}>
              {lineas.length === 0 ? (
                <Text style={estilos.vacio}>Este viático no tiene conceptos asignados.</Text>
              ) : (
                lineas.map((l, i) => (
                  <View key={l.idConcepto} style={[estilos.linea, i > 0 && estilos.lineaBorde]} testID={`linea-${l.idConcepto}`}>
                    <View style={estilos.lineaArriba}>
                      <Text style={estilos.lineaConcepto} numberOfLines={2}>
                        {l.concepto} · <Text style={{ fontWeight: '800' }}>{soles(l.asignado)}</Text>
                      </Text>
                      {l.estadoDeposito === 'depositado' ? (
                        <EtiquetaEstado estado="conforme" texto={`DEPOSITADO${l.fechaDeposito ? ` · ${diaMes(l.fechaDeposito)}` : ''}`} />
                      ) : (
                        <EtiquetaEstado estado="no_aplica" texto="PENDIENTE DE DEPÓSITO" />
                      )}
                    </View>
                    <Text style={estilos.lineaSub}>
                      {l.porRendir <= 0 && l.rendido > 0 ? 'Rendido completo' : `Rendido ${soles(l.rendido)} · por rendir ${soles(l.porRendir)}`}
                    </Text>
                  </View>
                ))
              )}
            </View>
            <View style={estilos.nota}>
              <Ionicons name="information-circle-outline" size={16} color={colores.textoSecundario} />
              <Text style={estilos.notaTexto}>El depósito lo confirma Contabilidad.</Text>
            </View>

            <TituloSeccion texto="GASTOS RENDIDOS" />
            {gastos.length === 0 ? (
              <Text style={estilos.vacio}>Todavía no hay gastos rendidos con este viático.</Text>
            ) : (
              <View style={{ gap: 10 }}>
                {gastos.map((g) => (
                  <FilaGasto key={g.idGasto} gasto={g} onPress={() => router.push({ pathname: '/solicitud-gasto', params: { id: String(g.idGasto) } })} />
                ))}
              </View>
            )}
            {!v.cerrado && (
              <Boton
                titulo="Rendir gasto"
                onPress={() => router.push({ pathname: '/rendir-gasto', params: { modo: 'viatico', idProgramacion: String(v.idProgramacion) } })}
              />
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const estilos = StyleSheet.create({
  area: { flex: 1, backgroundColor: colores.fondo },
  contenido: { padding: 16, paddingBottom: 28, maxWidth: 560, width: '100%', alignSelf: 'center' },
  tituloFila: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  titulo: { fontSize: 24, fontWeight: '700', color: colores.titulo, flexShrink: 1 },
  subtitulo: { fontSize: 14, color: colores.textoSecundario, marginTop: 4, marginBottom: 14, marginLeft: 34 },
  tarjeta: { backgroundColor: colores.tarjeta, borderRadius: radios.tarjeta, borderWidth: 1, borderColor: colores.bordeSuave, padding: 16 },
  importes: { flexDirection: 'row', gap: 10 },
  programacion: { fontSize: 12.5, color: colores.textoSecundario, textAlign: 'center', marginTop: 12, lineHeight: 18 },
  cierre: {
    backgroundColor: colores.tarjeta,
    borderRadius: radios.tarjeta,
    borderWidth: 1,
    borderColor: colores.bordeSuave,
    padding: 16,
    marginTop: 14,
    gap: 10,
  },
  cierreFila: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  cierreTitulo: { fontSize: 16, fontWeight: '800', color: colores.titulo },
  cierreSub: { fontSize: 12.5, color: colores.textoSecundario },
  saldoCaja: { flexDirection: 'row', gap: 10, backgroundColor: colores.azulFondo, borderRadius: radios.campo, padding: 12 },
  saldoTitulo: { fontSize: 14, fontWeight: '800', color: colores.titulo },
  saldoTexto: { fontSize: 13, lineHeight: 18, color: colores.azulTexto, marginTop: 2 },
  observado: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: '#FED7AA',
    borderRadius: radios.campo,
    padding: 12,
    marginTop: 12,
  },
  observadoTexto: { flex: 1, fontSize: 13.5, lineHeight: 19, color: '#9A3412' },
  lista: { backgroundColor: colores.tarjeta, borderRadius: radios.tarjeta, borderWidth: 1, borderColor: colores.bordeSuave, paddingHorizontal: 14 },
  linea: { paddingVertical: 12, gap: 4 },
  lineaBorde: { borderTopWidth: 1, borderTopColor: colores.bordeSuave },
  lineaArriba: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  lineaConcepto: { flex: 1, fontSize: 14.5, color: colores.titulo, lineHeight: 20 },
  lineaSub: { fontSize: 12.5, color: colores.textoSecundario },
  nota: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  notaTexto: { fontSize: 12.5, color: colores.textoSecundario },
  vacio: { fontSize: 14, color: colores.textoSecundario, paddingVertical: 12 },
  pie: { fontSize: 12.5, color: colores.textoTenue, textAlign: 'center', marginTop: 16 },
});
