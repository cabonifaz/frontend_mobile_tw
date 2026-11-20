import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ErrorApi } from '@/api/cliente';
import { abrirPdf } from '@/api/procedimientos';
import { descargarConstanciaRecepcion, obtenerDetalleRecepcion, registrarRecepcion, type ResultadoRecepcion } from '@/api/recepcionOm';
import { limpiarBorrador, useBorradorRecepcion } from '@/almacen/borradorRecepcionOm';
import { Aviso } from '@/componentes/Aviso';
import { Boton } from '@/componentes/Boton';
import { EncabezadoApp } from '@/componentes/EncabezadoApp';
import { LienzoFirma } from '@/componentes/LienzoFirma';
import { useConsulta } from '@/hooks/useConsulta';
import { useDiseno } from '@/hooks/useDiseno';
import { useSesion } from '@/sesion/SesionContext';
import { colores, radios } from '@/tema/colores';
import type { Trazos } from '@/api/firmas';
import { firmaSuficiente } from '@/utilidades/firmas';
import { etiquetaFisico, etiquetaOm, faltaParaRegistrar, estadoPrevisto, pendientesSinMarcar, textoAccesorio, textoMedio } from '@/utilidades/recepcionOm';

/**
 * HU-23 — Constancia de recepción: resumen de lo recibido (instrumentos con su estado físico y fotos, y lo que no llegó con su motivo), firma de quien entrega y «Registrar recepción».
 * Al registrar, el servidor genera la constancia en PDF (y la envía al cliente si está configurado el envío por correo). Aquí se puede abrir para imprimirla.
 */
export default function PantallaRecepcionOmConstancia() {
  const { sesion } = useSesion();
  const usuario = sesion?.usuario;
  const d = useDiseno();
  const params = useLocalSearchParams<{ om?: string }>();
  const idOs = Number(params.om);
  const valido = Number.isInteger(idOs) && idOs > 0;
  const borrador = useBorradorRecepcion(idOs);

  const [trazos, setTrazos] = useState<Trazos>([]);
  const [firmando, setFirmando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoRecepcion | null>(null);
  const [descargando, setDescargando] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: 'error' | 'info'; texto: string } | null>(null);

  const { datos, cargando, error } = useConsulta(async (token) => {
    if (!valido) throw new ErrorApi('Orden no válida.', 400, 1);
    return obtenerDetalleRecepcion(token, idOs);
  }, params.om ?? '');

  const instrumentos = useMemo(() => datos?.instrumentos ?? [], [datos]);
  const pendientes = useMemo(() => instrumentos.filter((i) => !i.recibido).map((i) => i.idOsEquipo), [instrumentos]);
  const marcados = useMemo(() => borrador.marcados.filter((id) => pendientes.includes(id)), [borrador.marcados, pendientes]);
  const sinMarcar = pendientesSinMarcar(pendientes, marcados);
  const firmada = firmaSuficiente(trazos);
  const falta = faltaParaRegistrar({ ...borrador, marcados }, pendientes, firmada);
  const previsto = estadoPrevisto({ ...borrador, marcados }, pendientes);
  const et = etiquetaOm(previsto);

  async function registrar() {
    if (!sesion || !borrador.medio || falta || enviando) return;
    setMensaje(null);
    setEnviando(true);
    try {
      const r = await registrarRecepcion(sesion.token, idOs, {
        numeroGuia: borrador.guia,
        medioEntrega: borrador.medio,
        entregoNombre: borrador.entrego,
        entregoCargo: borrador.entregoCargo,
        motivoParcial: sinMarcar.length > 0 ? borrador.motivoParcial : undefined,
        instrumentos: marcados.map((id) => {
          const i = borrador.instrumentos[id];
          return { idOsEquipo: id, estadoFisico: i.estadoFisico!, observaciones: i.observaciones, accesorios: i.accesorios, fotos: i.fotos.map((f) => f.idFoto) };
        }),
        firma: trazos,
      });
      limpiarBorrador(idOs);
      setResultado(r);
    } catch (e) {
      setMensaje({
        tipo: 'error',
        texto: e instanceof ErrorApi && e.estadoHttp === 0 ? 'Sin conexión: la recepción se registra con señal. Inténtalo cuando vuelva.' : e instanceof Error ? e.message : 'No se pudo registrar la recepción.',
      });
    } finally {
      setEnviando(false);
    }
  }

  async function verConstancia() {
    if (!sesion || !resultado || descargando) return;
    setDescargando(true);
    setMensaje(null);
    try {
      await abrirPdf(await descargarConstanciaRecepcion(sesion.token, resultado.idRecepcion));
    } catch (e) {
      setMensaje({ tipo: 'error', texto: e instanceof Error ? e.message : 'No se pudo abrir la constancia.' });
    } finally {
      setDescargando(false);
    }
  }

  const irALista = () => router.replace('/recepcion-om' as unknown as Href);

  return (
    <SafeAreaView style={estilos.area} edges={['top']}>
      <EncabezadoApp nombre={usuario?.nombre ?? ''} apellido={usuario?.apellido} subtitulo={`${usuario?.nombre ?? ''} · ${usuario?.cargo ?? 'Técnico de Metrología'}`} />
      <ScrollView
        contentContainerStyle={[estilos.contenido, { paddingHorizontal: d.margen, maxWidth: d.anchoMaximo }]}
        keyboardShouldPersistTaps="handled"
        scrollEnabled={!firmando}
        showsVerticalScrollIndicator={false}
      >
        <View style={estilos.tituloFila}>
          {!resultado && (
            <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Volver">
              <Ionicons name="arrow-back" size={24} color={colores.titulo} />
            </Pressable>
          )}
          <Text style={[estilos.titulo, { fontSize: d.tituloPantalla }]} accessibilityRole="header">
            {resultado ? 'Recepción registrada' : 'Registrar recepción'}
          </Text>
        </View>

        {cargando ? (
          <ActivityIndicator color={colores.primario} style={{ marginTop: 32 }} />
        ) : error || !datos ? (
          <Aviso tipo="error" mensaje={error ?? 'No se encontró la orden.'} />
        ) : resultado ? (
          <>
            <View style={[estilos.tarjeta, { borderColor: resultado.parcial ? colores.naranja : colores.verde }]} testID="recepcion-registrada">
              <Ionicons name={resultado.parcial ? 'alert-circle' : 'checkmark-circle'} size={44} color={resultado.parcial ? colores.naranja : colores.verde} style={{ alignSelf: 'center' }} />
              <Text style={estilos.tarjetaTitulo}>{resultado.parcial ? 'Recepción parcial' : 'Recepción registrada'}</Text>
              <Text style={estilos.nota}>{resultado.mensaje}</Text>
              <Text style={estilos.nota}>
                Recibidos: {resultado.instrumentosRecibidos} · Pendientes: {resultado.instrumentosPendientes}
              </Text>
              <Text style={estilos.nota}>{resultado.correoEnviado ? 'La constancia se envió al correo del cliente.' : 'La constancia no se envió por correo: imprímela o compártela desde el PDF.'}</Text>
            </View>
            {!!mensaje && <Aviso tipo={mensaje.tipo} mensaje={mensaje.texto} />}
            <Boton titulo="Ver constancia (PDF)" onPress={() => void verConstancia()} cargando={descargando} />
            <Boton titulo="Volver a la lista" variante="secundario" onPress={irALista} />
          </>
        ) : (
          <>
            <View style={estilos.tarjeta} testID="constancia-resumen">
              <View style={estilos.cabecera}>
                <Text style={estilos.tarjetaTitulo}>Constancia de recepción</Text>
                <View style={[estilos.pill, { backgroundColor: et.fondo }]}>
                  <Text style={[estilos.pillTexto, { color: et.color }]}>{et.texto}</Text>
                </View>
              </View>
              <Text style={estilos.nota}>
                {datos.cabecera.numero} · Guía {borrador.guia.trim() || '—'} · {textoMedio(borrador.medio)}
              </Text>
              <Text style={estilos.nota}>
                Entregó: {borrador.entrego.trim() || '—'}
                {borrador.entregoCargo.trim() ? ` (${borrador.entregoCargo.trim()})` : ''} · Recibió: {`${usuario?.nombre ?? ''} ${usuario?.apellido ?? ''}`.trim()}
              </Text>

              <View style={estilos.lista}>
                {marcados.map((id) => {
                  const i = instrumentos.find((x) => x.idOsEquipo === id);
                  const b = borrador.instrumentos[id];
                  const fis = etiquetaFisico(b?.estadoFisico);
                  if (!i || !b) return null;
                  return (
                    <View key={id} style={estilos.fila}>
                      <View style={{ flex: 1 }}>
                        <Text style={estilos.filaNombre}>{i.nombre}</Text>
                        <Text style={estilos.nota}>
                          {b.fotos.length} {b.fotos.length === 1 ? 'foto' : 'fotos'}
                          {b.accesorios.length > 0 ? ` · ${b.accesorios.map(textoAccesorio).join(', ')}` : ''}
                        </Text>
                      </View>
                      {fis && (
                        <View style={[estilos.pill, { backgroundColor: fis.fondo }]}>
                          <Text style={[estilos.pillTexto, { color: fis.color }]}>{fis.texto}</Text>
                        </View>
                      )}
                    </View>
                  );
                })}
                {sinMarcar.map((id) => {
                  const i = instrumentos.find((x) => x.idOsEquipo === id);
                  if (!i) return null;
                  return (
                    <View key={id} style={estilos.fila}>
                      <View style={{ flex: 1 }}>
                        <Text style={estilos.filaNombre}>{i.nombre}</Text>
                        <Text style={estilos.nota}>{borrador.motivoParcial.trim() || 'Sin motivo'}</Text>
                      </View>
                      <View style={[estilos.pill, { backgroundColor: colores.grisFondo }]}>
                        <Text style={[estilos.pillTexto, { color: colores.grisTexto }]}>NO LLEGÓ</Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>

            <Text style={estilos.seccion}>FIRMA DE QUIEN ENTREGA *</Text>
            <LienzoFirma trazos={trazos} onCambio={setTrazos} onTocando={setFirmando} etiqueta={borrador.entrego.trim() || 'Quien entrega'} />
            <View style={estilos.firmaPie}>
              <Text style={estilos.nota}>{[borrador.entrego.trim(), borrador.entregoCargo.trim()].filter(Boolean).join(' · ')}</Text>
              {trazos.length > 0 && (
                <Pressable onPress={() => setTrazos([])} hitSlop={8} accessibilityRole="button" testID="limpiar-firma">
                  <Text style={estilos.enlaceTexto}>Limpiar</Text>
                </Pressable>
              )}
            </View>

            {!!mensaje && <Aviso tipo={mensaje.tipo} mensaje={mensaje.texto} />}
            <Boton titulo="Registrar recepción" onPress={() => void registrar()} deshabilitado={!!falta} cargando={enviando} />
            {!!falta ? <Text style={estilos.faltan}>{falta}</Text> : <Text style={estilos.faltan}>Se genera la constancia en PDF y se envía al cliente.</Text>}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const estilos = StyleSheet.create({
  area: { flex: 1, backgroundColor: colores.fondo },
  contenido: { paddingTop: 18, paddingBottom: 28, width: '100%', alignSelf: 'center', gap: 10 },
  tituloFila: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  titulo: { fontWeight: '700', color: colores.titulo, flexShrink: 1 },
  tarjeta: { backgroundColor: colores.tarjeta, borderRadius: radios.tarjeta, borderWidth: 1, borderColor: colores.bordeSuave, padding: 14, gap: 8 },
  cabecera: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  tarjetaTitulo: { flex: 1, fontSize: 16, fontWeight: '800', color: colores.titulo, textAlign: 'left' },
  nota: { fontSize: 12.5, color: colores.textoSecundario, lineHeight: 18, flexShrink: 1 },
  lista: { gap: 0, marginTop: 4 },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colores.bordeSuave },
  filaNombre: { fontSize: 15, fontWeight: '800', color: colores.titulo },
  pill: { borderRadius: 8, paddingHorizontal: 9, paddingVertical: 3 },
  pillTexto: { fontSize: 11, fontWeight: '800', letterSpacing: 0.3 },
  seccion: { fontSize: 11.5, fontWeight: '800', letterSpacing: 1, color: colores.textoSecundario, marginTop: 6 },
  firmaPie: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  enlaceTexto: { color: colores.primario, fontSize: 15, fontWeight: '700' },
  faltan: { fontSize: 12.5, color: colores.textoSecundario, textAlign: 'center' },
});
