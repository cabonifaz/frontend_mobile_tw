import { useState } from 'react';
import { ActivityIndicator, Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ErrorApi } from '@/api/cliente';
import { nombreDeCodigo, obtenerCatalogo } from '@/api/catalogos';
import { obtenerDemoras, registrarDemora, type ResultadoDemora, type TipoDemora, type Ubicacion } from '@/api/ruta';
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
import {
  MAX_DESCRIPCION_DEMORA,
  MAX_DEMORA,
  MIN_DEMORA,
  coordenadasTexto,
  demoraAcumulada,
  impactoDemora,
  minutosValidos,
  motivosDelTipo,
  nombreTipoDemora,
  tipoInicial,
  tiposDisponibles,
} from '@/utilidades/demoras';
import { horaDe, horaLimaAhora } from '@/utilidades/formato';

const MINUTOS_RAPIDOS = [10, 15, 30, 60];

/** Lo que se muestra al terminar de registrar (la pantalla de confirmación). */
interface Registrada {
  tipo: TipoDemora;
  motivo: string;
  minutos: number;
  mensaje: string;
  resultado: ResultadoDemora | null;
  ubicacion: Ubicacion;
  hora: string;
}

/**
 * HU-05 — Registro de demoras en ruta.
 *  - Dos tipos, excluyentes según el avance del servicio: "Llegar a planta" (durante el traslado, recalcula la ETA)
 *    e "Ingreso a planta" (ya en la planta sin iniciar el trabajo, recalcula el inicio previsto).
 *  - GPS y hora se capturan solos; motivo (según el tipo) y duración (1–480 min) son obligatorios; la descripción y la foto no.
 *  - Foto opcional SOLO con la cámara de la app (sin galería).
 *  - Al registrar, el back avisa a Operaciones y la app muestra la ETA anterior y la nueva. Sin botón de refresh (se desliza hacia abajo).
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

  const [tipoElegido, setTipoElegido] = useState<TipoDemora | null>(null);
  const [idMotivo, setIdMotivo] = useState<number | null>(null);
  const [listaAbierta, setListaAbierta] = useState(false);
  const [minutos, setMinutos] = useState('15');
  const [descripcion, setDescripcion] = useState('');
  const [foto, setFoto] = useState<string | null>(null);
  const [camara, setCamara] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: 'error' | 'info'; texto: string } | null>(null);
  const [registrada, setRegistrada] = useState<Registrada | null>(null);

  const c = datos?.contexto ?? null;
  const cargo = nombreDeCodigo(datos?.cargos, usuario?.cargo) ?? usuario?.cargo ?? 'Técnico de Campo';
  const disponibles = c ? tiposDisponibles(c) : { llegada: false, ingreso: false };
  // El tipo elegido solo vale mientras se pueda registrar; si el servicio avanzó (llegó a planta), se pasa al que corresponde.
  const tipo: TipoDemora | null = tipoElegido && disponibles[tipoElegido] ? tipoElegido : tipoInicial(disponibles);
  const motivos = c && tipo ? motivosDelTipo(c.motivos, tipo) : [];
  const motivo = motivos.find((m) => m.idMotivo === idMotivo);
  const min = minutosValidos(minutos);
  const impacto = c && tipo ? impactoDemora(c, tipo, min) : [];

  function elegirTipo(t: TipoDemora) {
    if (!disponibles[t] || t === tipo) return;
    setTipoElegido(t);
    setIdMotivo(null); // el motivo depende del tipo
    setListaAbierta(false);
    setMensaje(null);
  }

  async function enviar() {
    if (!sesion || !c || !tipo || enviando) return;
    setMensaje(null);
    if (!idMotivo || !motivo) return setMensaje({ tipo: 'error', texto: 'Selecciona el motivo de la demora.' });
    if (min === null) return setMensaje({ tipo: 'error', texto: `La duración estimada debe estar entre ${MIN_DEMORA} y ${MAX_DEMORA} minutos.` });
    setEnviando(true);
    try {
      const ubicacion = gps.ubicacion ?? (await gps.capturar());
      if (!ubicacion) {
        setMensaje({ tipo: 'error', texto: gps.mensaje ?? 'No se pudo obtener tu ubicación GPS.' });
        return;
      }
      const r = await registrarDemora(sesion.token, idOs, {
        tipo,
        idMotivo,
        duracionMinutos: min,
        descripcion: descripcion.slice(0, MAX_DESCRIPCION_DEMORA),
        ubicacion,
        fotoUri: foto,
      });
      setRegistrada({ tipo, motivo: motivo.nombre, minutos: min, mensaje: r.mensaje, resultado: r.datos, ubicacion, hora: horaLimaAhora() });
      setIdMotivo(null);
      setDescripcion('');
      setFoto(null);
      setMinutos('15');
      await recargar();
    } catch (e) {
      setMensaje({ tipo: 'error', texto: e instanceof ErrorApi ? e.message : e instanceof Error ? e.message : 'No se pudo registrar la demora.' });
    } finally {
      setEnviando(false);
    }
  }

  function volverAlServicio() {
    router.replace({ pathname: '/detalle-servicio', params: { id: String(idOs), v: String(Date.now()) } });
  }

  const textoGps = gps.estado === 'activo' ? 'Activo' : gps.estado === 'buscando' ? 'Buscando' : 'Sin GPS';
  const colorGps = gps.estado === 'activo' ? colores.verde : gps.estado === 'buscando' ? colores.textoSecundario : colores.rojo;
  const tiempos = c?.llegadaEn
    ? [
        { etiqueta: 'LLEGADA', valor: horaDe(c.llegadaEn) },
        { etiqueta: 'EN PLANTA', valor: duracion(c.enPlantaMinutos) },
        { etiqueta: 'GPS', valor: textoGps, color: colorGps },
        { etiqueta: 'HORA', valor: horaLimaAhora() },
      ]
    : [
        { etiqueta: 'SALIDA', valor: horaDe(c?.salidaEn) },
        { etiqueta: 'EN RUTA', valor: duracion(c?.enRutaMinutos) },
        { etiqueta: 'GPS', valor: textoGps, color: colorGps },
        { etiqueta: 'HORA', valor: horaLimaAhora() },
      ];

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
            <FilaTiempos testID="tiempos-demora" tiempos={tiempos} />
            {!!gps.mensaje && (
              <Pressable onPress={() => void gps.capturar()} style={{ marginTop: 10 }} accessibilityRole="button">
                <Aviso tipo="error" mensaje={`${gps.mensaje} Toca aquí para reintentar.`} />
              </Pressable>
            )}

            {registrada ? (
              <Confirmacion
                r={registrada}
                acumulada={demoraAcumulada(c.demoras, registrada.tipo)}
                puedeOtra={disponibles.llegada || disponibles.ingreso}
                onVolver={volverAlServicio}
                onOtra={() => {
                  setRegistrada(null);
                  setMensaje(null);
                }}
              />
            ) : !tipo ? (
              <View style={{ marginTop: 16 }}>
                <Aviso
                  tipo="info"
                  mensaje={c.motivoNoRegistra || 'Las demoras se registran durante el traslado o al ingresar a la planta, antes de iniciar el trabajo.'}
                />
              </View>
            ) : (
              <>
                <Text style={estilos.etiqueta}>TIPO DE DEMORA</Text>
                <View style={estilos.tipos}>
                  <TarjetaTipo
                    icono="car-outline"
                    titulo="Llegar a planta"
                    detalle={disponibles.llegada ? 'Demora durante el traslado' : 'Solo antes de llegar'}
                    activo={tipo === 'llegada'}
                    habilitado={disponibles.llegada}
                    onPress={() => elegirTipo('llegada')}
                    testID="tipo-llegada"
                  />
                  <TarjetaTipo
                    icono="enter-outline"
                    titulo="Ingreso a planta"
                    detalle={disponibles.ingreso ? 'Ya llegaste y esperas ingresar' : 'Disponible al llegar a planta'}
                    activo={tipo === 'ingreso'}
                    habilitado={disponibles.ingreso}
                    onPress={() => elegirTipo('ingreso')}
                    testID="tipo-ingreso"
                  />
                </View>

                <Text style={estilos.etiqueta}>MOTIVO DE LA DEMORA</Text>
                <Pressable
                  onPress={() => setListaAbierta((v) => !v)}
                  style={estilos.campo}
                  accessibilityRole="button"
                  accessibilityLabel="Motivo de la demora"
                  testID="tipo-demora"
                >
                  <Text style={[estilos.campoTexto, !motivo && { color: colores.placeholder }]}>{motivo?.nombre ?? 'Selecciona el motivo'}</Text>
                  <Ionicons name={listaAbierta ? 'chevron-up' : 'chevron-down'} size={20} color={colores.textoSecundario} />
                </Pressable>
                {listaAbierta && (
                  <View style={estilos.lista}>
                    {motivos.map((m) => (
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
                <View style={estilos.rapidos}>
                  {MINUTOS_RAPIDOS.map((m) => (
                    <Pressable
                      key={m}
                      onPress={() => setMinutos(String(m))}
                      accessibilityRole="button"
                      accessibilityLabel={`${m} minutos`}
                      style={[estilos.rapido, min === m && estilos.rapidoActivo]}
                    >
                      <Text style={[estilos.rapidoTexto, min === m && { color: colores.blanco }]}>{m} min</Text>
                    </Pressable>
                  ))}
                </View>

                <Text style={estilos.etiqueta}>DESCRIPCIÓN DEL INCIDENTE (OPCIONAL)</Text>
                <TextInput
                  value={descripcion}
                  onChangeText={setDescripcion}
                  placeholder="Detalle el motivo de la demora…"
                  placeholderTextColor={colores.placeholder}
                  maxLength={MAX_DESCRIPCION_DEMORA}
                  multiline
                  style={[estilos.campo, estilos.descripcion]}
                  testID="descripcion-demora"
                />

                <View style={estilos.impacto} testID="impacto-estimado">
                  <Text style={estilos.impactoTitulo}>
                    <Ionicons name="trending-up-outline" size={15} /> IMPACTO ESTIMADO
                  </Text>
                  {impacto.map((f) => (
                    <View key={f.etiqueta} style={estilos.impactoFila}>
                      <Text style={f.tono === 'tenue' ? estilos.nota : estilos.campoTexto}>{f.etiqueta}</Text>
                      {f.tono === 'tenue' ? (
                        <Text style={estilos.nota}>{f.valor}</Text>
                      ) : (
                        <Text style={[estilos.impactoValor, f.tono === 'alerta' && { color: colores.rojo }]}>{f.valor}</Text>
                      )}
                    </View>
                  ))}
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
                  <Aviso mensaje="La carga desde la galería está deshabilitada: la foto se toma con la cámara de la app. Se avisará a Operaciones al registrar." />
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
              <View style={{ marginTop: 22 }} testID="demoras-del-servicio">
                <Text style={estilos.etiqueta}>DEMORAS DEL SERVICIO</Text>
                <View style={estilos.tarjeta}>
                  {c.demoras.map((x, i) => (
                    <View key={x.idDemora} style={[estilos.demora, i > 0 && estilos.separador]}>
                      <View style={{ flex: 1 }}>
                        <Text style={estilos.campoTexto}>
                          {x.motivo ?? 'Demora'} · {x.duracionMinutos} min
                        </Text>
                        <Text style={estilos.nota}>
                          {nombreTipoDemora(x.tipo)} · {horaDe(x.fechaRegistro)}
                          {x.etaRecalculada ? ` · ${x.tipo === 'ingreso' ? 'Inicio' : 'ETA'} ${horaDe(x.etaRecalculada)}` : ''}
                        </Text>
                        {!!x.descripcion && (
                          <Text style={estilos.nota} numberOfLines={2}>
                            {x.descripcion}
                          </Text>
                        )}
                      </View>
                      {x.tieneFoto && (
                        <View style={estilos.conFoto}>
                          <Ionicons name="camera-outline" size={12} color={colores.verdeEtiquetaTexto} />
                          <Text style={estilos.conFotoTexto}>CON FOTO</Text>
                        </View>
                      )}
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

function TarjetaTipo({
  icono,
  titulo,
  detalle,
  activo,
  habilitado,
  onPress,
  testID,
}: {
  icono: 'car-outline' | 'enter-outline';
  titulo: string;
  detalle: string;
  activo: boolean;
  habilitado: boolean;
  onPress: () => void;
  testID: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!habilitado}
      accessibilityRole="radio"
      accessibilityState={{ selected: activo, disabled: !habilitado }}
      accessibilityLabel={`${titulo}. ${detalle}`}
      testID={testID}
      style={[estilos.tipo, activo && estilos.tipoActivo, !habilitado && { opacity: 0.5 }]}
    >
      <Ionicons name={icono} size={26} color={activo ? colores.primario : colores.textoSecundario} />
      <Text style={[estilos.tipoTitulo, activo && { color: colores.primario }]}>{titulo}</Text>
      <Text style={estilos.tipoDetalle}>{detalle}</Text>
    </Pressable>
  );
}

/** Pantalla de éxito: la ETA (o el inicio previsto) antes y después, lo acumulado, el GPS y a cuántos se avisó. */
function Confirmacion({
  r,
  acumulada,
  puedeOtra,
  onVolver,
  onOtra,
}: {
  r: Registrada;
  acumulada: number;
  puedeOtra: boolean;
  onVolver: () => void;
  onOtra: () => void;
}) {
  const ingreso = r.tipo === 'ingreso';
  const res = r.resultado;
  const coordenadas = coordenadasTexto(r.ubicacion.latitud, r.ubicacion.longitud);
  return (
    <View style={{ marginTop: 18 }} testID="demora-registrada">
      <View style={estilos.exito}>
        <Ionicons name="checkmark-circle" size={44} color={colores.verde} />
        <Text style={estilos.exitoTitulo}>Demora registrada</Text>
        <Text style={estilos.exitoTexto}>
          {nombreTipoDemora(r.tipo)} · {r.motivo} · {r.minutos} min
        </Text>
      </View>

      <View style={estilos.impacto}>
        {res?.etaRecalculada ? (
          <>
            <View style={estilos.impactoFila}>
              <Text style={estilos.campoTexto}>{ingreso ? 'Inicio previsto anterior' : 'ETA original'}</Text>
              <Text style={estilos.impactoValor}>{horaDe(ingreso ? res.etaAnterior : res.etaOriginal)}</Text>
            </View>
            <View style={estilos.impactoFila}>
              <Text style={estilos.campoTexto}>{ingreso ? 'Inicio recalculado' : 'ETA recalculada'}</Text>
              <Text style={[estilos.impactoValor, { color: colores.rojo }]}>{horaDe(res.etaRecalculada)}</Text>
            </View>
          </>
        ) : null}
        <View style={estilos.impactoFila}>
          <Text style={estilos.campoTexto}>Demora acumulada</Text>
          <Text style={estilos.impactoValor}>+{acumulada} min</Text>
        </View>
        {!!coordenadas && (
          <View style={estilos.impactoFila}>
            <Text style={estilos.campoTexto}>GPS</Text>
            <Text style={estilos.nota}>{coordenadas}</Text>
          </View>
        )}
        <View style={estilos.impactoFila}>
          <Text style={estilos.campoTexto}>Hora</Text>
          <Text style={estilos.nota}>{r.hora}</Text>
        </View>
      </View>

      <View style={{ marginTop: 12 }}>
        <Aviso
          mensaje={
            res && res.notificados > 0
              ? `Se avisó a Operaciones (${res.notificados} ${res.notificados === 1 ? 'persona' : 'personas'}).`
              : r.mensaje
          }
        />
      </View>

      <View style={{ gap: 12, marginTop: 16 }}>
        <Boton titulo="Volver al servicio" onPress={onVolver} />
        {puedeOtra && <Boton titulo="Registrar otra demora" variante="secundario" onPress={onOtra} />}
      </View>
    </View>
  );
}

const estilos = StyleSheet.create({
  area: { flex: 1, backgroundColor: colores.fondo },
  contenido: { paddingTop: 18, paddingBottom: 28, width: '100%', alignSelf: 'center' },
  tituloFila: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 6 },
  titulo: { fontWeight: '700', color: colores.titulo, flexShrink: 1 },
  subtitulo: { color: colores.textoSecundario, fontSize: 14, marginBottom: 12 },
  etiqueta: { fontSize: 12.5, fontWeight: '700', letterSpacing: 1, color: colores.primario, marginTop: 18, marginBottom: 8 },
  tipos: { flexDirection: 'row', gap: 10 },
  tipo: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: colores.borde,
    borderRadius: radios.tarjeta,
    backgroundColor: colores.blanco,
    padding: 12,
    gap: 4,
  },
  tipoActivo: { borderColor: colores.primario, backgroundColor: colores.primarioSuave },
  tipoTitulo: { fontSize: 15, fontWeight: '700', color: colores.titulo },
  tipoDetalle: { fontSize: 12.5, color: colores.textoSecundario, lineHeight: 17 },
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
  rapidos: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  rapido: { borderWidth: 1, borderColor: colores.borde, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 7, backgroundColor: colores.blanco },
  rapidoActivo: { backgroundColor: colores.primario, borderColor: colores.primario },
  rapidoTexto: { fontSize: 14, color: colores.texto },
  descripcion: { minHeight: 84, textAlignVertical: 'top' },
  impacto: { marginTop: 18, backgroundColor: colores.blanco, borderWidth: 1, borderColor: colores.bordeSuave, borderRadius: radios.tarjeta, padding: 16, gap: 8 },
  impactoTitulo: { fontSize: 13, fontWeight: '700', color: colores.primarioOscuro, letterSpacing: 0.5 },
  impactoFila: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
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
  demora: { flexDirection: 'row', paddingVertical: 11, gap: 10, alignItems: 'flex-start' },
  separador: { borderTopWidth: 1, borderTopColor: colores.bordeSuave },
  nota: { fontSize: 12.5, color: colores.textoSecundario, marginTop: 2 },
  conFoto: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colores.verdeEtiquetaFondo,
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
    marginTop: 2,
  },
  conFotoTexto: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.4, color: colores.verdeEtiquetaTexto },
  exito: {
    alignItems: 'center',
    gap: 4,
    backgroundColor: colores.verdeFondo,
    borderWidth: 1,
    borderColor: colores.verdeBorde,
    borderRadius: radios.tarjeta,
    paddingVertical: 20,
    paddingHorizontal: 16,
  },
  exitoTitulo: { fontSize: 20, fontWeight: '800', color: colores.titulo },
  exitoTexto: { fontSize: 14, color: colores.textoSecundario, textAlign: 'center' },
});
