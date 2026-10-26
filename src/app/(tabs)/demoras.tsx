import { useState } from 'react';
import { ActivityIndicator, Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ErrorApi } from '@/api/cliente';
import { nombreDeCodigo, obtenerCatalogo } from '@/api/catalogos';
import { obtenerDemoras, registrarDemora } from '@/api/ruta';
import { Aviso } from '@/componentes/Aviso';
import { Boton } from '@/componentes/Boton';
import { CamaraApp } from '@/componentes/CamaraApp';
import { EncabezadoApp } from '@/componentes/EncabezadoApp';
import { FilaTiempos, duracion } from '@/componentes/FilaTiempos';
import { useConsulta } from '@/hooks/useConsulta';
import { useDiseno } from '@/hooks/useDiseno';
import { useUbicacion } from '@/hooks/useUbicacion';
import { useSesion } from '@/sesion/SesionContext';
import { colores, radios } from '@/tema/colores';
import { horaDe, horaLimaAhora, sumarMinutos } from '@/utilidades/formato';

const MAX_DESCRIPCION = 500;

/**
 * HU-05 — Registro de demoras en ruta.
 *  - GPS y hora se capturan solos; tipo de demora y duración (minutos) son obligatorios.
 *  - Panel "Impacto estimado": ETA original vs ETA recalculada (se actualiza al escribir los minutos).
 *  - Foto opcional SOLO con la cámara de la app (sin galería).
 *  - Al registrar, el back avisa a Operaciones. Sin botón de refresh (se desliza hacia abajo).
 */
export default function PantallaDemoras() {
  const { sesion } = useSesion();
  const usuario = sesion?.usuario;
  const d = useDiseno();
  const params = useLocalSearchParams<{ id?: string }>();
  const idOs = Number(params.id);
  const idValido = Number.isInteger(idOs) && idOs > 0;
  const gps = useUbicacion();

  const { datos, cargando, recargando, error, recargar } = useConsulta(async (token) => {
    if (!idValido) throw new ErrorApi('Servicio no válido.', 400, 1);
    const [contexto, cargos] = await Promise.all([obtenerDemoras(token, idOs), obtenerCatalogo(token, 'CARGO_USUARIO')]);
    return { contexto, cargos };
  }, params.id ?? '');

  const [idMotivo, setIdMotivo] = useState<number | null>(null);
  const [listaAbierta, setListaAbierta] = useState(false);
  const [minutos, setMinutos] = useState('15');
  const [descripcion, setDescripcion] = useState('');
  const [foto, setFoto] = useState<string | null>(null);
  const [camara, setCamara] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: 'error' | 'info'; texto: string } | null>(null);

  const c = datos?.contexto ?? null;
  const cargo = nombreDeCodigo(datos?.cargos, usuario?.cargo) ?? usuario?.cargo ?? 'Técnico de Campo';
  const min = Number.parseInt(minutos, 10);
  const minValido = Number.isInteger(min) && min >= 1 && min <= 480;
  const etaNueva = minValido ? sumarMinutos(c?.etaVigente, min) : null;
  const motivo = c?.motivos.find((m) => m.idMotivo === idMotivo);

  async function enviar() {
    if (!sesion || !c || enviando) return;
    setMensaje(null);
    if (!idMotivo) return setMensaje({ tipo: 'error', texto: 'Selecciona el tipo de demora.' });
    if (!minValido) return setMensaje({ tipo: 'error', texto: 'La duración estimada debe estar entre 1 y 480 minutos.' });
    setEnviando(true);
    try {
      const ubicacion = gps.ubicacion ?? (await gps.capturar());
      if (!ubicacion) {
        setMensaje({ tipo: 'error', texto: gps.mensaje ?? 'No se pudo obtener tu ubicación GPS.' });
        return;
      }
      const r = await registrarDemora(sesion.token, idOs, {
        idMotivo,
        duracionMinutos: min,
        descripcion: descripcion.slice(0, MAX_DESCRIPCION),
        ubicacion,
        fotoUri: foto,
      });
      setMensaje({ tipo: 'info', texto: r.mensaje });
      setIdMotivo(null);
      setDescripcion('');
      setFoto(null);
      await recargar();
    } catch (e) {
      setMensaje({ tipo: 'error', texto: e instanceof ErrorApi ? e.message : e instanceof Error ? e.message : 'No se pudo registrar la demora.' });
    } finally {
      setEnviando(false);
    }
  }

  const textoGps = gps.estado === 'activo' ? 'Activo' : gps.estado === 'buscando' ? 'Buscando' : 'Sin GPS';
  const colorGps = gps.estado === 'activo' ? colores.verde : gps.estado === 'buscando' ? colores.textoSecundario : colores.rojo;

  return (
    <SafeAreaView style={estilos.area} edges={['top']}>
      <EncabezadoApp nombre={usuario?.nombre ?? ''} apellido={usuario?.apellido} subtitulo={`${usuario?.nombre ?? ''} · ${cargo}`} />
      <ScrollView
        contentContainerStyle={[estilos.contenido, { paddingHorizontal: d.margen, maxWidth: d.anchoMaximo }]}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={recargando} onRefresh={recargar} colors={[colores.primario]} />}
      >
        <View style={estilos.tituloFila}>
          <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Volver">
            <Ionicons name="arrow-back" size={24} color={colores.titulo} />
          </Pressable>
          <Text style={[estilos.titulo, { fontSize: d.tituloPantalla }]} accessibilityRole="header">
            Registro de Demoras
          </Text>
        </View>

        {cargando ? (
          <ActivityIndicator color={colores.primario} style={{ marginTop: 40 }} />
        ) : error || !c ? (
          <Aviso tipo="error" mensaje={error ?? 'No se encontró el servicio.'} />
        ) : (
          <>
            <Text style={estilos.subtitulo}>
              {c.numeroOs} · {c.cliente ?? ''}
            </Text>
            <FilaTiempos
              testID="tiempos-demora"
              tiempos={[
                { etiqueta: 'SALIDA', valor: horaDe(c.salidaEn) },
                { etiqueta: 'EN RUTA', valor: duracion(c.enRutaMinutos) },
                { etiqueta: 'GPS', valor: textoGps, color: colorGps },
                { etiqueta: 'HORA', valor: horaLimaAhora() },
              ]}
            />
            {!!gps.mensaje && (
              <Pressable onPress={() => void gps.capturar()} style={{ marginTop: 10 }} accessibilityRole="button">
                <Aviso tipo="error" mensaje={`${gps.mensaje} Toca aquí para reintentar.`} />
              </Pressable>
            )}

            {!c.puedeRegistrar ? (
              <View style={{ marginTop: 16 }}>
                <Aviso tipo="info" mensaje="Las demoras se registran durante el traslado (servicio en ruta)." />
              </View>
            ) : (
              <>
                <Text style={estilos.etiqueta}>TIPO DE DEMORA</Text>
                <Pressable
                  onPress={() => setListaAbierta((v) => !v)}
                  style={estilos.campo}
                  accessibilityRole="button"
                  accessibilityLabel="Tipo de demora"
                  testID="tipo-demora"
                >
                  <Text style={[estilos.campoTexto, !motivo && { color: colores.placeholder }]}>{motivo?.nombre ?? 'Selecciona el tipo de demora'}</Text>
                  <Ionicons name={listaAbierta ? 'chevron-up' : 'chevron-down'} size={20} color={colores.textoSecundario} />
                </Pressable>
                {listaAbierta && (
                  <View style={estilos.lista}>
                    {c.motivos.map((m) => (
                      <Pressable
                        key={m.idMotivo}
                        onPress={() => {
                          setIdMotivo(m.idMotivo);
                          setListaAbierta(false);
                        }}
                        style={[estilos.opcion, m.idMotivo === idMotivo && { backgroundColor: colores.primarioSuave }]}
                        accessibilityRole="button"
                        testID={`motivo-${m.idMotivo}`}
                      >
                        <Text style={estilos.campoTexto}>{m.nombre}</Text>
                      </Pressable>
                    ))}
                  </View>
                )}

                <Text style={estilos.etiqueta}>DURACIÓN ESTIMADA</Text>
                <View style={estilos.filaMinutos}>
                  <TextInput
                    value={minutos}
                    onChangeText={(t) => setMinutos(t.replace(/\D/g, '').slice(0, 3))}
                    keyboardType="number-pad"
                    style={[estilos.campo, estilos.campoMinutos]}
                    accessibilityLabel="Duración estimada en minutos"
                    testID="minutos-demora"
                  />
                  <Text style={estilos.campoTexto}>minutos</Text>
                </View>

                <Text style={estilos.etiqueta}>DESCRIPCIÓN DEL INCIDENTE</Text>
                <TextInput
                  value={descripcion}
                  onChangeText={setDescripcion}
                  placeholder="Detalle el motivo de la demora…"
                  placeholderTextColor={colores.placeholder}
                  maxLength={MAX_DESCRIPCION}
                  multiline
                  style={[estilos.campo, estilos.descripcion]}
                  testID="descripcion-demora"
                />

                <View style={estilos.impacto} testID="impacto-estimado">
                  <Text style={estilos.impactoTitulo}>
                    <Ionicons name="trending-up-outline" size={15} /> IMPACTO ESTIMADO
                  </Text>
                  <View style={estilos.impactoFila}>
                    <Text style={estilos.campoTexto}>ETA original</Text>
                    <Text style={estilos.impactoValor}>{horaDe(c.etaOriginal)}</Text>
                  </View>
                  {c.minutosDemora > 0 && (
                    <View style={estilos.impactoFila}>
                      <Text style={estilos.nota}>Demoras anteriores</Text>
                      <Text style={estilos.nota}>+{c.minutosDemora} min</Text>
                    </View>
                  )}
                  <View style={estilos.impactoFila}>
                    <Text style={estilos.campoTexto}>ETA recalculada</Text>
                    <Text style={[estilos.impactoValor, { color: colores.rojo }]}>{etaNueva ? horaDe(etaNueva) : '—'}</Text>
                  </View>
                </View>

                <Text style={estilos.etiqueta}>FOTO EVIDENCIA (OPCIONAL)</Text>
                {foto ? (
                  <View style={estilos.fotoCaja}>
                    <Image source={{ uri: foto }} style={estilos.foto} resizeMode="cover" accessibilityLabel="Foto de evidencia" />
                    <View style={estilos.fotoAcciones}>
                      <Boton titulo="Repetir foto" variante="secundario" onPress={() => setCamara(true)} />
                      <Boton titulo="Quitar" variante="secundario" onPress={() => setFoto(null)} />
                    </View>
                  </View>
                ) : (
                  <Pressable onPress={() => setCamara(true)} style={estilos.tomarFoto} accessibilityRole="button" testID="tomar-foto">
                    <Ionicons name="camera-outline" size={30} color={colores.primario} />
                    <Text style={estilos.tomarFotoTexto}>Tomar foto</Text>
                  </Pressable>
                )}
                <View style={{ marginTop: 8 }}>
                  <Aviso mensaje="La carga desde la galería está deshabilitada: la foto se toma con la cámara de la app (con fecha, hora y GPS)." />
                </View>

                {mensaje && (
                  <View style={{ marginTop: 14 }} testID="mensaje-demora">
                    <Aviso tipo={mensaje.tipo} mensaje={mensaje.texto} />
                  </View>
                )}

                <View style={{ marginTop: 16 }}>
                  <Boton titulo="Registrar demora" onPress={() => void enviar()} cargando={enviando} deshabilitado={enviando} />
                </View>
              </>
            )}

            {c.demoras.length > 0 && (
              <View style={{ marginTop: 22 }}>
                <Text style={estilos.etiqueta}>DEMORAS REGISTRADAS</Text>
                <View style={estilos.tarjeta}>
                  {c.demoras.map((x, i) => (
                    <View key={x.idDemora} style={[estilos.demora, i > 0 && estilos.separador]}>
                      <View style={{ flex: 1 }}>
                        <Text style={estilos.campoTexto}>
                          {x.motivo ?? 'Demora'} · {x.duracionMinutos} min
                        </Text>
                        <Text style={estilos.nota}>
                          {horaDe(x.fechaRegistro)}
                          {x.etaRecalculada ? ` · ETA ${horaDe(x.etaRecalculada)}` : ''}
                          {x.tieneFoto ? ' · con foto' : ''}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            )}
          </>
        )}
      </ScrollView>

      <CamaraApp
        visible={camara}
        modo="foto"
        onCerrar={() => setCamara(false)}
        onFoto={(uri) => {
          setFoto(uri);
          setCamara(false);
        }}
      />
    </SafeAreaView>
  );
}

const estilos = StyleSheet.create({
  area: { flex: 1, backgroundColor: colores.fondo },
  contenido: { paddingTop: 18, paddingBottom: 28, width: '100%', alignSelf: 'center' },
  tituloFila: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 6 },
  titulo: { fontWeight: '700', color: colores.titulo, flexShrink: 1 },
  subtitulo: { color: colores.textoSecundario, fontSize: 14, marginBottom: 12 },
  etiqueta: { fontSize: 12.5, fontWeight: '700', letterSpacing: 1, color: colores.primario, marginTop: 18, marginBottom: 8 },
  campo: {
    borderWidth: 1,
    borderColor: colores.borde,
    borderRadius: radios.campo,
    backgroundColor: colores.blanco,
    paddingHorizontal: 14,
    paddingVertical: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    fontSize: 15,
    color: colores.texto,
  },
  campoTexto: { fontSize: 15, color: colores.texto, flexShrink: 1 },
  lista: { borderWidth: 1, borderColor: colores.bordeSuave, borderRadius: radios.campo, backgroundColor: colores.blanco, marginTop: 6, overflow: 'hidden' },
  opcion: { paddingHorizontal: 14, paddingVertical: 12, borderTopWidth: 1, borderTopColor: colores.bordeSuave },
  filaMinutos: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  campoMinutos: { width: 96 },
  descripcion: { minHeight: 84, textAlignVertical: 'top' },
  impacto: { marginTop: 18, backgroundColor: colores.blanco, borderWidth: 1, borderColor: colores.bordeSuave, borderRadius: radios.tarjeta, padding: 16, gap: 8 },
  impactoTitulo: { fontSize: 13, fontWeight: '700', color: colores.primarioOscuro, letterSpacing: 0.5 },
  impactoFila: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  impactoValor: { fontSize: 16, fontWeight: '700', color: colores.titulo },
  tomarFoto: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colores.borde,
    borderRadius: 12,
    padding: 18,
    alignItems: 'center',
    backgroundColor: colores.blanco,
  },
  tomarFotoTexto: { color: colores.primario, fontWeight: '600', marginTop: 4, fontSize: 15 },
  fotoCaja: { gap: 10 },
  foto: { width: '100%', aspectRatio: 4 / 3, borderRadius: 12, backgroundColor: colores.grisFondo },
  fotoAcciones: { flexDirection: 'row', gap: 10 },
  tarjeta: { backgroundColor: colores.blanco, borderWidth: 1, borderColor: colores.bordeSuave, borderRadius: radios.tarjeta, paddingHorizontal: 14 },
  demora: { flexDirection: 'row', paddingVertical: 11 },
  separador: { borderTopWidth: 1, borderTopColor: colores.bordeSuave },
  nota: { fontSize: 12.5, color: colores.textoSecundario, marginTop: 2 },
});
