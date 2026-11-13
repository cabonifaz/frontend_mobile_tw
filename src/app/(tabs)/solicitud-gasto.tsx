import { ActivityIndicator, Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { nombreDeCodigo, obtenerCatalogo } from '@/api/catalogos';
import { ErrorApi } from '@/api/cliente';
import { obtenerViaticos, urlFotoGasto } from '@/api/viaticos';
import { Aviso } from '@/componentes/Aviso';
import { Boton } from '@/componentes/Boton';
import { EncabezadoApp } from '@/componentes/EncabezadoApp';
import { TituloSeccion } from '@/componentes/EtiquetaEstado';
import { EtiquetaGasto } from '@/componentes/ViaticosUI';
import { useConsulta } from '@/hooks/useConsulta';
import { useDiseno } from '@/hooks/useDiseno';
import { useSesion } from '@/sesion/SesionContext';
import { colores, radios } from '@/tema/colores';
import { monto } from '@/utilidades/dinero';
import { fechaCorta } from '@/utilidades/formato';
import { diaMesHora, seguimientoGasto, type PasoSeguimiento } from '@/utilidades/viaticos';

/**
 * HU-26 — Detalle de un gasto rendido (GS-000318).
 *  - Monto, estado y, según el caso, la observación o el motivo de rechazo que dejó el Jefe de Operaciones.
 *  - Concepto, fecha del gasto, servicio, programación (viático), comprobante, quién revisa y descripción.
 *  - Seguimiento: rendido → en revisión → aprobado / observado / rechazado → cierre de la rendición.
 * Se abre desde la lista de Solicitudes o desde el detalle de un viático (?id = id del gasto).
 * Un gasto observado se corrige y reenvía desde aquí (HU-27): foto del comprobante, motivo y la lectura de la IA también se muestran.
 */
const colorPaso: Record<PasoSeguimiento['tono'], string> = {
  hecho: colores.verde,
  alerta: colores.naranja,
  error: colores.rojo,
  pendiente: colores.borde,
};

export default function PantallaSolicitudGasto() {
  const { sesion } = useSesion();
  const usuario = sesion?.usuario;
  const d = useDiseno();

  const params = useLocalSearchParams<{ id?: string }>();
  const idGasto = Number(params.id);
  const idValido = Number.isInteger(idGasto) && idGasto > 0;

  const { datos, cargando, recargando, error, recargar } = useConsulta(async (token) => {
    if (!idValido) throw new ErrorApi('Gasto no válido.', 400, 1);
    const [todo, cargos] = await Promise.all([obtenerViaticos(token), obtenerCatalogo(token, 'CARGO_USUARIO').catch(() => null)]);
    return { todo, cargos };
  }, params.id ?? '');

  const cargo = nombreDeCodigo(datos?.cargos, usuario?.cargo) ?? usuario?.cargo ?? 'Técnico de Campo';
  const g = datos?.todo.gastos.find((x) => x.idGasto === idGasto) ?? null;
  const viatico = g ? datos?.todo.viaticos.find((v) => v.idProgramacion === g.idProgramacion) ?? null : null;
  const pasos = g ? seguimientoGasto(g, !!viatico?.cerrado) : [];
  const fotos = (datos?.todo.fotos ?? []).filter((f) => f.idGasto === idGasto);
  const token = sesion?.token ?? '';

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
          <Text style={estilos.titulo} accessibilityRole="header">
            {g?.codigo ?? 'Gasto'}
          </Text>
        </View>
        <Text style={estilos.subtitulo}>Gasto rendido</Text>

        {cargando ? (
          <ActivityIndicator color={colores.primario} style={{ marginTop: 32 }} />
        ) : error ? (
          <Aviso tipo="error" mensaje={error} />
        ) : !g ? (
          <Aviso tipo="error" mensaje="No se encontró el gasto." />
        ) : (
          <>
            <View style={estilos.monto} testID="gasto-monto">
              <Text style={estilos.montoEtiqueta}>MONTO RENDIDO</Text>
              <Text style={estilos.montoValor}>{monto(g.monto, g.moneda)}</Text>
              <EtiquetaGasto estado={g.estado} />
              {g.estado === 'aprobado' && !!viatico && (
                <Text style={estilos.montoNota}>Cubierto por el adelanto · se liquida al cerrar la rendición</Text>
              )}
            </View>

            {g.estado === 'observado' && (
              <View style={[estilos.aviso, estilos.avisoObservado]} testID="gasto-observacion">
                <Ionicons name="chatbubble-ellipses-outline" size={20} color="#9A3412" />
                <View style={{ flex: 1 }}>
                  <Text style={[estilos.avisoTitulo, { color: '#9A3412' }]}>
                    Jefe de Operaciones{g.revisadoEn ? ` · ${diaMesHora(g.revisadoEn)}` : ''}
                  </Text>
                  {!!g.comentarioRevision && <Text style={estilos.avisoTexto}>“{g.comentarioRevision}”</Text>}
                </View>
              </View>
            )}
            {g.estado === 'rechazado' && (
              <View style={[estilos.aviso, estilos.avisoRechazado]} testID="gasto-rechazo">
                <Ionicons name="close-circle-outline" size={20} color={colores.rojoEtiquetaTexto} />
                <View style={{ flex: 1 }}>
                  <Text style={[estilos.avisoTitulo, { color: colores.rojoEtiquetaTexto }]}>Motivo del rechazo</Text>
                  {!!g.comentarioRevision && <Text style={estilos.avisoTexto}>“{g.comentarioRevision}”</Text>}
                </View>
              </View>
            )}

            <View style={estilos.datos}>
              <Dato titulo="CONCEPTO" valor={g.concepto} />
              <Dato titulo="FECHA DEL GASTO" valor={fechaCorta(g.fecha) || '—'} />
              <Dato titulo="SERVICIO" valor={g.numeroOs} />
              <Dato titulo="PROGRAMACIÓN" valor={g.codigoProgramacion ?? '—'} />
              <Dato titulo="COMPROBANTE" valor={g.tieneComprobante ? 'Con foto' : 'Sin foto'} />
              <Dato titulo="REVISA" valor="Jefe de Operaciones" />
              {!!g.descripcion && (
                <View style={{ width: '100%' }}>
                  <Dato titulo="DESCRIPCIÓN" valor={g.descripcion} />
                </View>
              )}
            </View>

            {fotos.length > 0 && (
              <>
                <TituloSeccion texto="FOTOS DEL COMPROBANTE" />
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }} testID="gasto-fotos">
                  {fotos.map((f) => (
                    <Image
                      key={f.orden}
                      source={{ uri: urlFotoGasto(g.idGasto, f.orden), headers: { Authorization: `Bearer ${token}` } }}
                      style={{ width: 96, height: 96, borderRadius: 10, backgroundColor: colores.grisFondo }}
                      accessibilityLabel={`Foto ${f.orden} del comprobante`}
                    />
                  ))}
                </View>
              </>
            )}
            {!!g.motivoSinFoto && fotos.length === 0 && <Dato titulo="MOTIVO SIN FOTO" valor={g.motivoSinFoto} />}
            {g.montoIa != null && g.coincideIa === false && (
              <Aviso tipo="info" mensaje={`La IA leyó ${monto(g.montoIa, g.moneda)} en el comprobante y no coincide con el monto declarado.`} />
            )}

            <TituloSeccion texto="SEGUIMIENTO" />
            <View style={estilos.timeline} testID="gasto-seguimiento">
              {pasos.map((p, i) => (
                <View key={`${p.titulo}-${i}`} style={estilos.paso}>
                  <View style={estilos.pasoRiel}>
                    <View style={[estilos.punto, { backgroundColor: colorPaso[p.tono] }]} />
                    {i < pasos.length - 1 && <View style={estilos.linea} />}
                  </View>
                  <View style={{ flex: 1, paddingBottom: 14 }}>
                    <Text style={[estilos.pasoTitulo, p.tono === 'pendiente' && { color: colores.textoTenue }]}>{p.titulo}</Text>
                    {!!p.detalle && <Text style={estilos.pasoDetalle}>{p.detalle}</Text>}
                  </View>
                </View>
              ))}
            </View>
            {g.estado === 'observado' && !!g.origen && (
              <Boton titulo="Corregir y reenviar" onPress={() => router.push({ pathname: '/rendir-gasto', params: { modo: 'corregir', idGasto: String(g.idGasto) } })} />
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Dato({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <View style={estilos.dato}>
      <Text style={estilos.datoTitulo}>{titulo}</Text>
      <Text style={estilos.datoValor}>{valor}</Text>
    </View>
  );
}

const estilos = StyleSheet.create({
  area: { flex: 1, backgroundColor: colores.fondo },
  contenido: { padding: 16, paddingBottom: 28, maxWidth: 560, width: '100%', alignSelf: 'center' },
  tituloFila: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  titulo: { fontSize: 24, fontWeight: '700', color: colores.titulo, flexShrink: 1 },
  subtitulo: { fontSize: 14, color: colores.textoSecundario, marginTop: 4, marginBottom: 14, marginLeft: 34 },
  monto: {
    alignItems: 'center',
    gap: 6,
    backgroundColor: colores.tarjeta,
    borderRadius: radios.tarjeta,
    borderWidth: 1,
    borderColor: colores.bordeSuave,
    paddingVertical: 18,
    paddingHorizontal: 16,
  },
  montoEtiqueta: { fontSize: 11, fontWeight: '700', letterSpacing: 1, color: colores.textoSecundario },
  montoValor: { fontSize: 30, fontWeight: '800', color: colores.titulo },
  montoNota: { fontSize: 12.5, color: colores.verdeEtiquetaTexto, textAlign: 'center' },
  aviso: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderRadius: radios.campo, padding: 12, marginTop: 12, borderWidth: 1 },
  avisoObservado: { backgroundColor: '#FFF7ED', borderColor: '#FED7AA' },
  avisoRechazado: { backgroundColor: colores.rojoEtiquetaFondo, borderColor: colores.errorBorde },
  avisoTitulo: { fontSize: 13.5, fontWeight: '800' },
  avisoTexto: { fontSize: 13.5, lineHeight: 19, color: colores.texto, marginTop: 2 },
  datos: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
    backgroundColor: colores.tarjeta,
    borderRadius: radios.tarjeta,
    borderWidth: 1,
    borderColor: colores.bordeSuave,
    padding: 16,
    marginTop: 14,
  },
  dato: { width: '47%', flexGrow: 1, gap: 2 },
  datoTitulo: { fontSize: 10.5, fontWeight: '700', letterSpacing: 0.8, color: colores.textoSecundario },
  datoValor: { fontSize: 14.5, color: colores.titulo, lineHeight: 20 },
  timeline: { backgroundColor: colores.tarjeta, borderRadius: radios.tarjeta, borderWidth: 1, borderColor: colores.bordeSuave, padding: 16, paddingBottom: 4 },
  paso: { flexDirection: 'row', gap: 12 },
  pasoRiel: { alignItems: 'center', width: 12 },
  punto: { width: 12, height: 12, borderRadius: 6, marginTop: 4 },
  linea: { flex: 1, width: 2, backgroundColor: colores.bordeSuave, marginTop: 2 },
  pasoTitulo: { fontSize: 14.5, fontWeight: '700', color: colores.titulo },
  pasoDetalle: { fontSize: 12.5, lineHeight: 18, color: colores.textoSecundario, marginTop: 2 },
  pie: { fontSize: 12.5, color: colores.textoTenue, textAlign: 'center', marginTop: 14 },
});
