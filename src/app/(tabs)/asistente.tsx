import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View, type ScrollViewInstance } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { consultar, obtenerConsulta, obtenerInicioConRespaldo, valorar, type EquipoAsistente, type OrigenConsulta, type RespuestaAsistente } from '@/api/asistente';
import { nombreDeCodigo, obtenerCatalogo } from '@/api/catalogos';
import { ErrorApi } from '@/api/cliente';
import { claveGuardado, guardarOffline } from '@/api/guardadosAsistente';
import { horaRespaldo } from '@/api/respaldo';
import { Aviso } from '@/componentes/Aviso';
import { ElegirEquipoAsistente } from '@/componentes/ElegirEquipoAsistente';
import { EncabezadoApp } from '@/componentes/EncabezadoApp';
import { TarjetaRespuestaAsistente } from '@/componentes/TarjetaRespuestaAsistente';
import { VozAsistente, vozDisponible } from '@/componentes/VozAsistente';
import { useConsulta } from '@/hooks/useConsulta';
import { useDiseno } from '@/hooks/useDiseno';
import { useGuardadosAsistente } from '@/hooks/useGuardadosAsistente';
import { useSesion } from '@/sesion/SesionContext';
import { colores, radios } from '@/tema/colores';
import {
  MENSAJE_VOZ_NO_DISPONIBLE,
  PREGUNTA_MAX,
  detalleContexto,
  fuenteDesdeRespuesta,
  fuentesConFragmento,
  limpiarPregunta,
  preguntaDeSugerencia,
  preguntaValida,
  textoContexto,
  textoReciente,
} from '@/utilidades/asistente';

interface Turno {
  clave: string;
  pregunta: string;
  origen: OrigenConsulta;
  estado: 'cargando' | 'listo' | 'error';
  respuesta: RespuestaAsistente | null;
  error?: string;
  detalle?: string;
}



/**
 * HU-19 — Asistente IA y Procedimientos.
 *  - Contexto: el equipo en trabajo ("Cambiar" elige otro). Consultas por texto, por voz o con las sugerencias del equipo.
 *  - Cada respuesta trae la advertencia de seguridad, los pasos y la fuente (documento, sección y página del manual oficial); "Ver fuente" abre el
 *    fragmento citado; "Guardar offline" y "Fragmento" lo dejan en el teléfono para leerlo sin conexión.
 *  - El back responde SOLO con los documentos oficiales del equipo: si el tema no está, lo dice. Consultar exige conexión; los guardados no.
 */
export default function PantallaAsistente() {
  const { sesion } = useSesion();
  const usuario = sesion?.usuario;
  const idUsuario = usuario?.idUsuario ?? 0;
  const token = sesion?.token ?? '';
  const d = useDiseno();
  const desplazamiento = useRef<ScrollViewInstance>(null);
  const contadorTurnos = useRef(0);
  const nuevaClave = () => `t${(contadorTurnos.current += 1)}`;

  const [eleccion, setEleccion] = useState<{ idOs: number; idOsEquipo: number } | null>(null);
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [texto, setTexto] = useState('');
  const [elegirEquipo, setElegirEquipo] = useState(false);
  const [voz, setVoz] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: 'error' | 'info'; texto: string } | null>(null);
  const guardados = useGuardadosAsistente(idUsuario);
  const claves = new Set(guardados.map((g) => g.clave));

  const { datos, cargando, recargando, error, recargar } = useConsulta(
    async (t) => {
      const [r, cargos] = await Promise.all([
        obtenerInicioConRespaldo(t, idUsuario, eleccion?.idOs, eleccion?.idOsEquipo),
        obtenerCatalogo(t, 'CARGO_USUARIO').catch(() => undefined),
      ]);
      return { inicio: r.datos, sinConexion: r.sinConexion, guardadoEn: r.guardadoEn, cargos };
    },
    `${eleccion?.idOs ?? 0}|${eleccion?.idOsEquipo ?? 0}`,
  );

  // Al volver a la pestaña se actualiza el contexto (el equipo en trabajo puede haber cambiado) y las consultas recientes
  const primeraVez = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (primeraVez.current) primeraVez.current = false;
      else void recargar();
    }, [recargar]),
  );

  const cargo = nombreDeCodigo(datos?.cargos, usuario?.cargo) ?? usuario?.cargo ?? 'Técnico de Campo';
  const inicio = datos?.inicio ?? null;
  const contexto = inicio?.contexto ?? null;
  const enConversacion = turnos.length > 0;
  const ocupado = turnos.some((t) => t.estado === 'cargando');
  const puedeEnviar = !!contexto && !ocupado && preguntaValida(texto);

  function irAlFinal() {
    setTimeout(() => desplazamiento.current?.scrollToEnd({ animated: true }), 80);
  }

  function actualizarTurno(clave: string, cambios: Partial<Turno>) {
    setTurnos((lista) => lista.map((t) => (t.clave === clave ? { ...t, ...cambios } : t)));
  }

  async function enviar(preguntaCruda: string, origen: OrigenConsulta) {
    const pregunta = limpiarPregunta(preguntaCruda);
    if (!contexto || ocupado || !preguntaValida(pregunta)) return;
    setMensaje(null);
    setTexto('');
    const clave = nuevaClave();
    setTurnos((lista) => [...lista, { clave, pregunta, origen, estado: 'cargando', respuesta: null }]);
    irAlFinal();
    try {
      const r = await consultar(token, { idOs: contexto.idOs, idOsEquipo: contexto.idOsEquipo, pregunta, origen });
      actualizarTurno(clave, { estado: 'listo', respuesta: r });
      void recargar();
    } catch (e) {
      actualizarTurno(clave, {
        estado: 'error',
        error: e instanceof Error ? e.message : 'No se pudo consultar al asistente.',
        // Causa técnica real del fallo de red, para soporte (el mensaje de arriba no la dice)
        detalle: e instanceof ErrorApi ? e.detalleTecnico : undefined,
      });
    }
    irAlFinal();
  }

  async function reabrir(idConsulta: number, pregunta: string) {
    if (ocupado) return;
    setMensaje(null);
    const clave = nuevaClave();
    setTurnos((lista) => [...lista, { clave, pregunta, origen: 'texto', estado: 'cargando', respuesta: null }]);
    irAlFinal();
    try {
      const r = await obtenerConsulta(token, idConsulta);
      actualizarTurno(clave, { estado: 'listo', respuesta: r, pregunta: r.pregunta || pregunta });
    } catch (e) {
      actualizarTurno(clave, { estado: 'error', error: e instanceof Error ? e.message : 'No se pudo abrir la consulta.', detalle: e instanceof ErrorApi ? e.detalleTecnico : undefined });
    }
  }

  function elegir(e: EquipoAsistente) {
    setElegirEquipo(false);
    setEleccion({ idOs: e.idOs, idOsEquipo: e.idOsEquipo });
    setTurnos([]);
    setMensaje(null);
  }

  async function guardar(tipo: 'respuesta' | 'fragmento', r: RespuestaAsistente, n?: number) {
    setMensaje(null);
    try {
      const fuente = tipo === 'fragmento' ? r.fuentes.find((f) => f.n === n) : undefined;
      const res = await guardarOffline(token, idUsuario, {
        tipo,
        respuesta: tipo === 'respuesta' ? r : null,
        fuente: fuente ? fuenteDesdeRespuesta(r, fuente) : null,
      });
      setMensaje({
        tipo: res.aviso ? 'error' : 'info',
        texto: res.aviso
          ? `Guardado en el teléfono. No se pudo copiar al servidor: ${res.aviso}`
          : res.enServidor
            ? 'Guardado en el teléfono: disponible sin conexión.'
            : 'Guardado en el teléfono. Se copiará al servidor cuando haya señal.',
      });
    } catch {
      setMensaje({ tipo: 'error', texto: 'No se pudo guardar en el teléfono. Inténtalo de nuevo.' });
    }
  }

  async function calificar(turno: Turno, util: boolean) {
    const r = turno.respuesta;
    if (!r) return;
    actualizarTurno(turno.clave, { respuesta: { ...r, util } });
    try {
      await valorar(token, r.idConsulta, util);
    } catch (e) {
      actualizarTurno(turno.clave, { respuesta: r });
      setMensaje({ tipo: 'error', texto: e instanceof Error ? e.message : 'No se pudo enviar tu opinión.' });
    }
  }

  function tocarVoz() {
    if (!contexto) return setMensaje({ tipo: 'info', texto: 'Elige primero un equipo para consultar.' });
    if (!vozDisponible()) return Alert.alert('Consulta por voz', MENSAJE_VOZ_NO_DISPONIBLE);
    setVoz(true);
  }

  return (
    <SafeAreaView style={estilos.area} edges={['top']}>
      <EncabezadoApp nombre={usuario?.nombre ?? ''} apellido={usuario?.apellido} subtitulo={`${usuario?.nombre ?? ''} · ${cargo}`} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          ref={desplazamiento}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[estilos.contenido, { paddingHorizontal: d.margen, maxWidth: d.anchoMaximo }]}
          refreshControl={<RefreshControl refreshing={recargando} onRefresh={() => void recargar()} colors={[colores.primario]} />}
        >
          <View style={estilos.tituloFila}>
            <View style={{ flex: 1 }}>
              <Text style={[estilos.titulo, { fontSize: d.tituloPantalla }]} accessibilityRole="header">
                Asistente IA
              </Text>
              <Text style={estilos.subtitulo}>Manuales y procedimientos</Text>
            </View>
            <Pressable onPress={() => router.push('/asistente-guardados')} style={estilos.botonGuardados} accessibilityRole="button" accessibilityLabel="Guardados" testID="ir-guardados" hitSlop={8}>
              <Ionicons name="bookmark-outline" size={22} color={colores.primario} />
              {guardados.length > 0 && <Text style={estilos.botonGuardadosTexto}>{guardados.length}</Text>}
            </Pressable>
          </View>

          {cargando ? (
            <ActivityIndicator color={colores.primario} style={{ marginTop: 40 }} />
          ) : error || !inicio ? (
            <View style={{ marginTop: 14 }}>
              <Aviso tipo="error" mensaje={error ?? 'No se pudo cargar el asistente.'} />
            </View>
          ) : (
            <>
              {datos?.sinConexion && (
                <View style={{ marginTop: 12 }}>
                  <Aviso mensaje={`Sin conexión: se muestra lo último guardado (${horaRespaldo(datos.guardadoEn)}). Consultar exige conexión; tus guardados siguen disponibles.`} />
                </View>
              )}

              {contexto ? (
                <View style={estilos.contexto} testID="contexto-asistente">
                  <View style={estilos.contextoIcono}>
                    <Ionicons name="hardware-chip-outline" size={26} color={colores.primario} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={estilos.contextoTitulo}>{textoContexto(contexto)}</Text>
                    <Text style={estilos.contextoDetalle}>{detalleContexto(contexto)}</Text>
                  </View>
                  <Pressable onPress={() => setElegirEquipo(true)} hitSlop={10} accessibilityRole="button" testID="cambiar-equipo">
                    <Text style={estilos.cambiar}>Cambiar</Text>
                  </Pressable>
                </View>
              ) : (
                <View style={estilos.contexto} testID="sin-contexto">
                  <View style={estilos.contextoIcono}>
                    <Ionicons name="hardware-chip-outline" size={26} color={colores.textoSecundario} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={estilos.contextoTitulo}>Elige un equipo</Text>
                    <Text style={estilos.contextoDetalle}>No tienes un equipo en trabajo. Elige uno para consultar sus manuales.</Text>
                  </View>
                  <Pressable onPress={() => setElegirEquipo(true)} hitSlop={10} accessibilityRole="button" testID="elegir-equipo">
                    <Text style={estilos.cambiar}>Elegir</Text>
                  </Pressable>
                </View>
              )}

              {mensaje && (
                <View style={{ marginTop: 12 }} testID="mensaje-asistente">
                  <Aviso tipo={mensaje.tipo} mensaje={mensaje.texto} />
                </View>
              )}

              {!enConversacion ? (
                <>
                  <View style={estilos.bienvenida}>
                    <Ionicons name="sparkles" size={44} color={colores.primario} />
                    <Text style={estilos.bienvenidaTitulo}>¿En qué te ayudo?</Text>
                    <Text style={estilos.bienvenidaTexto}>Respondo con los manuales oficiales del equipo y cito la fuente.</Text>
                  </View>

                  {contexto && inicio.fuentes.length === 0 && (
                    <View style={{ marginBottom: 14 }}>
                      <Aviso mensaje="Este equipo aún no tiene manuales ni procedimientos oficiales cargados: el asistente no podrá responder sobre él." />
                    </View>
                  )}

                  {inicio.sugerencias.length > 0 && contexto && (
                    <>
                      <Text style={estilos.seccion}>SUGERENCIAS PARA ESTE EQUIPO</Text>
                      <View style={estilos.sugerencias}>
                        {inicio.sugerencias.map((s) => (
                          <Pressable key={s} onPress={() => void enviar(preguntaDeSugerencia(s, contexto), 'sugerencia')} style={estilos.sugerencia} accessibilityRole="button" testID={`sugerencia-${s}`}>
                            <Text style={estilos.sugerenciaTexto}>{s}</Text>
                          </Pressable>
                        ))}
                      </View>
                    </>
                  )}

                  {inicio.recientes.length > 0 && (
                    <>
                      <Text style={[estilos.seccion, { marginTop: 22 }]}>CONSULTAS RECIENTES</Text>
                      <View style={estilos.recientes}>
                        {inicio.recientes.map((r, i) => (
                          <Pressable
                            key={r.idConsulta}
                            onPress={() => void reabrir(r.idConsulta, r.pregunta)}
                            style={[estilos.reciente, i > 0 && estilos.recienteBorde]}
                            accessibilityRole="button"
                            testID={`reciente-${r.idConsulta}`}
                          >
                            <Ionicons name="chatbubbles-outline" size={24} color={colores.primario} />
                            <View style={{ flex: 1 }}>
                              <Text style={estilos.recientePregunta}>{r.pregunta}</Text>
                              <Text style={estilos.recienteDetalle}>{textoReciente(r)}</Text>
                            </View>
                          </Pressable>
                        ))}
                      </View>
                    </>
                  )}
                </>
              ) : (
                <View style={{ marginTop: 14 }}>
                  <Pressable onPress={() => setTurnos([])} hitSlop={8} style={estilos.nueva} accessibilityRole="button" testID="nueva-consulta">
                    <Ionicons name="add-circle-outline" size={18} color={colores.primario} />
                    <Text style={estilos.nuevaTexto}>Nueva consulta</Text>
                  </Pressable>
                  {turnos.map((t) => (
                    <View key={t.clave} style={{ marginTop: 14 }}>
                      <View style={estilos.burbuja}>
                        <Text style={estilos.burbujaTexto}>{t.pregunta}</Text>
                      </View>
                      <View style={{ marginTop: 10 }}>
                        {t.estado === 'cargando' && (
                          <View style={estilos.pensando} testID="consultando">
                            <ActivityIndicator color={colores.primario} />
                            <Text style={estilos.pensandoTexto}>Buscando en los manuales oficiales…</Text>
                          </View>
                        )}
                        {t.estado === 'error' && (
                          <View testID="error-consulta">
                            <Aviso tipo="error" mensaje={t.error ?? 'No se pudo consultar al asistente.'} />
                            {!!t.detalle && (
                              <Text style={estilos.detalleTecnico} selectable>
                                Detalle técnico: {t.detalle}
                              </Text>
                            )}
                            <Pressable
                              onPress={() => {
                                setTurnos((lista) => lista.filter((x) => x.clave !== t.clave));
                                void enviar(t.pregunta, t.origen);
                              }}
                              style={estilos.reintentar}
                              accessibilityRole="button"
                              testID="reintentar-consulta"
                            >
                              <Ionicons name="refresh" size={18} color={colores.primario} />
                              <Text style={estilos.nuevaTexto}>Reintentar</Text>
                            </Pressable>
                          </View>
                        )}
                        {t.estado === 'listo' && t.respuesta && (
                          <TarjetaRespuestaAsistente
                            respuesta={t.respuesta}
                            guardadaRespuesta={claves.has(claveGuardado('respuesta', t.respuesta.idConsulta))}
                            fragmentosGuardados={fuentesConFragmento(t.respuesta)
                              .filter((f) => claves.has(claveGuardado('fragmento', t.respuesta!.idConsulta, f.n)))
                              .map((f) => f.n)}
                            onVerFuente={(n) => router.push({ pathname: '/asistente-fuente', params: { idConsulta: String(t.respuesta!.idConsulta), n: String(n) } })}
                            onGuardarRespuesta={() => void guardar('respuesta', t.respuesta!)}
                            onGuardarFragmento={(n) => void guardar('fragmento', t.respuesta!, n)}
                            onValorar={(util) => void calificar(t, util)}
                          />
                        )}
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </>
          )}
        </ScrollView>

        <View style={estilos.entrada}>
          <TextInput
            value={texto}
            onChangeText={setTexto}
            placeholder={contexto ? 'Escribe tu consulta...' : 'Elige un equipo para consultar'}
            placeholderTextColor={colores.placeholder}
            style={estilos.campo}
            multiline
            maxLength={PREGUNTA_MAX}
            editable={!!contexto}
            returnKeyType="send"
            blurOnSubmit
            onSubmitEditing={() => puedeEnviar && void enviar(texto, 'texto')}
            accessibilityLabel="Escribe tu consulta"
            testID="campo-consulta"
          />
          {texto.trim().length > 0 ? (
            <Pressable
              onPress={() => void enviar(texto, 'texto')}
              disabled={!puedeEnviar}
              style={[estilos.boton, !puedeEnviar && { opacity: 0.5 }]}
              accessibilityRole="button"
              accessibilityLabel="Enviar consulta"
              accessibilityState={{ disabled: !puedeEnviar }}
              testID="enviar-consulta"
            >
              <Ionicons name="send" size={22} color={colores.blanco} />
            </Pressable>
          ) : (
            <Pressable onPress={tocarVoz} disabled={ocupado} style={[estilos.boton, ocupado && { opacity: 0.5 }]} accessibilityRole="button" accessibilityLabel="Consultar por voz" testID="consultar-voz">
              <Ionicons name="mic" size={24} color={colores.blanco} />
            </Pressable>
          )}
        </View>
      </KeyboardAvoidingView>

      <ElegirEquipoAsistente visible={elegirEquipo} idOsEquipoActual={contexto?.idOsEquipo ?? null} onElegir={elegir} onCerrar={() => setElegirEquipo(false)} />
      <VozAsistente
        visible={voz}
        token={token}
        onCerrar={() => setVoz(false)}
        onEnviar={(t) => {
          setVoz(false);
          void enviar(t, 'voz');
        }}
      />
    </SafeAreaView>
  );
}

const estilos = StyleSheet.create({
  area: { flex: 1, backgroundColor: colores.fondo },
  contenido: { paddingTop: 18, paddingBottom: 18, width: '100%', alignSelf: 'center' },
  tituloFila: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  titulo: { fontWeight: '800', color: colores.titulo },
  subtitulo: { color: colores.textoSecundario, fontSize: 15, marginTop: 4 },
  botonGuardados: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colores.blanco, borderWidth: 1, borderColor: colores.bordeSuave, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8 },
  botonGuardadosTexto: { fontSize: 14, fontWeight: '800', color: colores.primario },
  contexto: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#E8F0FE', borderWidth: 1, borderColor: '#BFD4F5', borderRadius: radios.tarjeta, padding: 14, marginTop: 14 },
  contextoIcono: { width: 30, alignItems: 'center' },
  contextoTitulo: { fontSize: 17.5, fontWeight: '800', color: colores.titulo },
  contextoDetalle: { fontSize: 14.5, color: colores.textoSecundario, marginTop: 2, lineHeight: 20 },
  cambiar: { fontSize: 17, fontWeight: '800', color: colores.primario },
  bienvenida: { alignItems: 'center', gap: 6, marginTop: 22, marginBottom: 22 },
  bienvenidaTitulo: { fontSize: 26, fontWeight: '800', color: colores.titulo, marginTop: 2 },
  bienvenidaTexto: { fontSize: 16.5, color: colores.textoSecundario, textAlign: 'center', lineHeight: 23, paddingHorizontal: 8 },
  seccion: { fontSize: 14, fontWeight: '800', letterSpacing: 1.6, color: colores.textoSecundario, marginBottom: 10 },
  sugerencias: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  sugerencia: { backgroundColor: colores.blanco, borderWidth: 1, borderColor: '#BFD4F5', borderRadius: 999, paddingHorizontal: 16, paddingVertical: 11 },
  sugerenciaTexto: { fontSize: 16, color: colores.primario, fontWeight: '500' },
  recientes: { backgroundColor: colores.blanco, borderWidth: 1, borderColor: colores.bordeSuave, borderRadius: radios.tarjeta, paddingHorizontal: 14 },
  reciente: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
  recienteBorde: { borderTopWidth: 1, borderTopColor: colores.bordeSuave },
  recientePregunta: { fontSize: 17, color: colores.titulo, fontWeight: '500' },
  recienteDetalle: { fontSize: 14, color: colores.textoSecundario, marginTop: 2 },
  nueva: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' },
  nuevaTexto: { fontSize: 15.5, fontWeight: '700', color: colores.primario },
  burbuja: { alignSelf: 'flex-end', maxWidth: '86%', backgroundColor: colores.primario, borderRadius: 16, borderBottomRightRadius: 4, paddingHorizontal: 16, paddingVertical: 14 },
  burbujaTexto: { fontSize: 17, color: colores.blanco, lineHeight: 24 },
  pensando: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colores.blanco, borderWidth: 1, borderColor: colores.bordeSuave, borderRadius: radios.tarjeta, padding: 14 },
  pensandoTexto: { fontSize: 15.5, color: colores.textoSecundario, flexShrink: 1 },
  detalleTecnico: { fontSize: 11.5, color: colores.textoSecundario, fontFamily: 'monospace', marginTop: 6 },
  reintentar: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginTop: 10 },
  entrada: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 12, backgroundColor: colores.fondo, borderTopWidth: 1, borderTopColor: colores.bordeSuave },
  campo: { flex: 1, minHeight: 52, maxHeight: 120, backgroundColor: colores.blanco, borderWidth: 1, borderColor: colores.borde, borderRadius: radios.campo + 4, paddingHorizontal: 16, paddingVertical: 12, fontSize: 17, color: colores.texto, textAlignVertical: 'center' },
  boton: { width: 64, height: 52, borderRadius: radios.campo + 4, backgroundColor: colores.primario, alignItems: 'center', justifyContent: 'center' },
});
