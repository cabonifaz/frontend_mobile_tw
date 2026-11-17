import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect, useLocalSearchParams, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { obtenerIngresos, type IngresoEquipo } from '@/api/ingresoEquipos';
import { agregarEquipoPorQrConfirmando } from '@/utilidades/agregarEquipoQr';
import { ErrorApi } from '@/api/cliente';
import { buscarEquipoPorQr, obtenerObjetivos, type ObjetivoEquipo, type Objetivos } from '@/api/ruta';
import { obtenerServiciosProgramados, type ServicioProgramado } from '@/api/servicios';
import { Aviso } from '@/componentes/Aviso';
import { CamaraApp } from '@/componentes/CamaraApp';
import { EncabezadoApp } from '@/componentes/EncabezadoApp';
import { Selector } from '@/componentes/Selector';
import { useConsulta } from '@/hooks/useConsulta';
import { useDiseno } from '@/hooks/useDiseno';
import { useSesion } from '@/sesion/SesionContext';
import { colores, radios } from '@/tema/colores';
import { avisar } from '@/utilidades/dialogos';
import { contarIngresados, esBorrador, horaIngreso, textoEstadoIngreso } from '@/utilidades/ingresoEquipos';
import { filtrarEquipos } from '@/utilidades/objetivos';

/**
 * HU-22 — Ingreso de equipos (OS) (Menú → Ingreso de Equipos OS).
 *  - Se elige la OS (las programadas y la que está en curso); el resumen muestra cuántos equipos de la OS ya se ingresaron.
 *  - Se busca el equipo a mano (N/S, código, COD TW, marca, modelo, ubicación) o se escanea su QR / código de barras.
 *  - QR de un equipo que NO está en la lista pero sí registrado para el mismo cliente: se agrega a la OS y se abre su ficha.
 *    Si no existe para el cliente, se ofrece registrarlo como equipo nuevo (NEW).
 *  - «Equipo nuevo» (manual) abre el formulario de la HU-07: queda en BORRADOR hasta que se valide en la intranet.
 *  - Cada equipo muestra REGISTRADO (con su estado y hora), POR REGISTRAR o BORRADOR. Uno ya ingresado se bloquea.
 * La lista de equipos y el QR son los de HU-07; sin la llegada registrada (Hard Stop de HU-06) el servidor avisa y no entrega equipos.
 */
export default function PantallaIngresoEquipo() {
  const { sesion } = useSesion();
  const usuario = sesion?.usuario;
  const d = useDiseno();
  const params = useLocalSearchParams<{ id?: string; v?: string }>();
  const [idOsElegida, setIdOsElegida] = useState<string | null>(params.id ?? null);
  const [texto, setTexto] = useState('');
  const [buscar, setBuscar] = useState('');
  const [escaner, setEscaner] = useState(false);
  const [leyendo, setLeyendo] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: 'error' | 'info'; texto: string } | null>(null);
  /** Código escaneado que no es de ningún equipo del cliente: se ofrece registrarlo como equipo nuevo. */
  const [sinEquipo, setSinEquipo] = useState<string | null>(null);
  const [recarga, setRecarga] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setBuscar(texto.trim()), 250);
    return () => clearTimeout(t);
  }, [texto]);

  // OS programadas
  const { datos: servicios, cargando: cargandoOs } = useConsulta((t) => obtenerServiciosProgramados(t, 'todos', ''), 'ingreso-os');
  const lista: ServicioProgramado[] = useMemo(
    () => [...(servicios ?? [])].sort((a, b) => Number(b.estadoOs === 'en_ejecucion') - Number(a.estadoOs === 'en_ejecucion') || (a.fechaEjecucion ?? '').localeCompare(b.fechaEjecucion ?? '')),
    [servicios],
  );
  // Sin elegir otra, la OS en ejecución (o la primera)
  const idOsActiva = idOsElegida ?? (lista.length > 0 ? String(lista[0].idOs) : null);
  const idOs = Number(idOsActiva);
  const idValido = Number.isInteger(idOs) && idOs > 0;

  // Equipos de la OS (HU-07) e ingresos (HU-22)
  const { datos, cargando, error, recargar } = useConsulta(async (token) => {
    if (!idValido) throw new ErrorApi('Elige la OS.', 400, 1);
    const [objetivos, ingresos] = await Promise.all([obtenerObjetivos(token, idOs), obtenerIngresos(token, idOs)]);
    return { objetivos, ingresos } as { objetivos: Objetivos; ingresos: IngresoEquipo[] };
  }, `${idOsActiva ?? ''}|${params.v ?? ''}|${recarga}`);

  // Al volver de registrar un equipo se actualiza la lista
  useFocusEffect(
    useCallback(() => {
      if (datos) void recargar();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  const ingresos = useMemo(() => new Map((datos?.ingresos ?? []).map((i) => [i.idOsEquipo, i])), [datos]);
  const equipos = useMemo(() => filtrarEquipos(datos?.objetivos.equipos ?? [], buscar), [datos, buscar]);
  const total = datos?.objetivos.equipos.length ?? 0;
  const hechos = datos ? contarIngresados(datos.objetivos.equipos, new Set(ingresos.keys())) : 0;
  const porcentaje = total > 0 ? Math.round((hechos / total) * 100) : 0;
  const osActual = lista.find((s) => s.idOs === idOs) ?? null;

  const irAFicha = (idOsEquipo: number, qr = false) =>
    router.push({ pathname: '/ingreso-equipo-activo', params: { id: String(idOs), eq: String(idOsEquipo), ...(qr ? { qr: '1' } : {}) } } as unknown as Href);
  const irANuevo = () => router.push({ pathname: '/equipo-nuevo', params: { id: String(idOs), desde: 'ingreso' } } as unknown as Href);

  function avisarYaIngresado(e: ObjetivoEquipo, ya: IngresoEquipo) {
    avisar(
      'Equipo ya ingresado',
      `${e.codigoCliente ?? e.codigoTw ?? e.numeroSerie ?? e.nombre} se registró hoy a las ${horaIngreso(ya.ingresadoEn)} como ${textoEstadoIngreso(ya.estadoIngreso)}. No se puede ingresar dos veces en la misma OS.`,
    );
  }

  function abrir(e: ObjetivoEquipo) {
    const ya = ingresos.get(e.idOsEquipo);
    if (ya) return avisarYaIngresado(e, ya);
    irAFicha(e.idOsEquipo);
  }

  async function alLeerQr(contenido: string) {
    setEscaner(false);
    if (!sesion || !idValido) return;
    const codigo = contenido.trim().slice(0, 300);
    setMensaje(null);
    setSinEquipo(null);
    setLeyendo(true);
    try {
      let e: ObjetivoEquipo | null = null;
      try {
        e = await buscarEquipoPorQr(sesion.token, idOs, codigo);
      } catch (err) {
        // Solo si no está en la lista de la OS se intenta agregarlo (los demás errores, como la llegada sin registrar, se muestran tal cual)
        if (!(err instanceof Error) || !/ningún equipo de esta/i.test(err.message)) throw err;
      }
      if (e) {
        const ya = ingresos.get(e.idOsEquipo);
        if (ya) return avisarYaIngresado(e, ya);
        return irAFicha(e.idOsEquipo, true);
      }
      try {
        const nuevo = await agregarEquipoPorQrConfirmando(sesion.token, idOs, osActual?.numeroOs ?? '', codigo);
        if (!nuevo) {
          setMensaje({ tipo: 'info', texto: 'No se agregó el equipo a la OS.' });
          return;
        }
        setRecarga((n) => n + 1);
        setMensaje({ tipo: 'info', texto: nuevo.reemplazaCodigoTw ? `${nuevo.codigoTw} ocupó el lugar de ${nuevo.reemplazaCodigoTw} en el objetivo de esta OS.` : `${nuevo.codigoTw} no estaba en la lista: se agregó a esta OS.` });
        return irAFicha(nuevo.idOsEquipo, true);
      } catch (err) {
        if (err instanceof Error && /equipo nuevo/i.test(err.message)) {
          setSinEquipo(codigo);
          return;
        }
        throw err;
      }
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err instanceof Error ? err.message : 'No se pudo leer el código.' });
    } finally {
      setLeyendo(false);
    }
  }

  return (
    <SafeAreaView style={estilos.area} edges={['top']}>
      <EncabezadoApp nombre={usuario?.nombre ?? ''} apellido={usuario?.apellido} subtitulo={`${usuario?.nombre ?? ''} · ${usuario?.cargo ?? 'Técnico de Campo'}`} />
      <ScrollView contentContainerStyle={[estilos.contenido, { paddingHorizontal: d.margen, maxWidth: d.anchoMaximo }]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={estilos.tituloFila}>
          <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Volver">
            <Ionicons name="arrow-back" size={24} color={colores.titulo} />
          </Pressable>
          <Text style={estilos.titulo} accessibilityRole="header">
            Ingreso de equipos
          </Text>
        </View>
        <Text style={estilos.subtitulo}>Registra el ingreso de los equipos de tu OS</Text>

        {cargandoOs ? (
          <ActivityIndicator color={colores.primario} style={{ marginTop: 24 }} />
        ) : lista.length === 0 ? (
          <Aviso tipo="info" mensaje="No tienes servicios programados: no hay equipos que ingresar." />
        ) : (
          <>
            {lista.length > 1 && (
              <Selector
                etiqueta="Orden de servicio"
                placeholder="Elige la OS"
                opciones={lista.map((s) => ({ valor: String(s.idOs), texto: `${s.numeroOs} · ${s.cliente ?? 'Sin cliente'}${s.fechaEjecucion ? ` · ${s.fechaEjecucion.slice(8, 10)}/${s.fechaEjecucion.slice(5, 7)}` : ''}` }))}
                valor={idOsActiva}
                onCambio={(v) => {
                  setIdOsElegida(v);
                  setMensaje(null);
                  setSinEquipo(null);
                }}
                testID="ingreso-os"
              />
            )}

            {/* Resumen de la OS y avance */}
            <View style={estilos.resumen} testID="ingreso-resumen">
              <View style={estilos.resumenCabecera}>
                <View style={estilos.iconoOs}>
                  <Ionicons name="document-text" size={22} color={colores.primario} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={estilos.osNumero}>{osActual?.numeroOs ?? ''}</Text>
                  <Text style={estilos.osSede} numberOfLines={2}>
                    {[osActual?.cliente, osActual?.sede].filter(Boolean).join(' · ')}
                  </Text>
                </View>
              </View>
              <View style={estilos.avanceFila}>
                <Text style={estilos.avanceGrande}>
                  {hechos}
                  <Text style={estilos.avanceDe}> de {total}</Text>
                </Text>
                <Text style={estilos.avanceTexto}>equipos ingresados{total > 0 ? ` · ${porcentaje} %` : ''}</Text>
              </View>
              <View style={estilos.barra}>
                <View style={[estilos.barraRelleno, { width: `${porcentaje}%` }]} />
              </View>
            </View>

            {/* Acciones */}
            <View style={estilos.botones}>
              <Pressable
                onPress={() => setEscaner(true)}
                disabled={!idValido || leyendo}
                accessibilityRole="button"
                style={({ pressed }) => [estilos.accion, estilos.accionPrimaria, pressed && { opacity: 0.85 }, leyendo && { opacity: 0.6 }]}
                testID="ingreso-escanear"
              >
                {leyendo ? <ActivityIndicator color={colores.blanco} /> : <Ionicons name="qr-code-outline" size={26} color={colores.blanco} />}
                <Text style={estilos.accionPrimariaTexto}>Escanear QR{'\n'}o barras</Text>
              </Pressable>
              <Pressable
                onPress={irANuevo}
                disabled={!idValido}
                accessibilityRole="button"
                style={({ pressed }) => [estilos.accion, estilos.accionSecundaria, pressed && { opacity: 0.85 }]}
                testID="ingreso-nuevo"
              >
                <Ionicons name="add-circle-outline" size={26} color={colores.primario} />
                <Text style={estilos.accionSecundariaTexto}>Equipo nuevo{'\n'}(manual)</Text>
              </Pressable>
            </View>

            {!!sinEquipo && (
              <View style={estilos.sinEquipo} testID="ingreso-sin-equipo">
                <Ionicons name="help-circle" size={22} color={colores.naranja} />
                <View style={{ flex: 1, gap: 6 }}>
                  <Text style={estilos.sinEquipoTitulo}>Código no registrado para este cliente</Text>
                  <Text style={estilos.nota}>
                    «{sinEquipo.length > 40 ? `${sinEquipo.slice(0, 40)}…` : sinEquipo}» no corresponde a ningún equipo del cliente. Puedes registrarlo como equipo nuevo.
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 16 }}>
                    <Pressable onPress={irANuevo} accessibilityRole="button" hitSlop={8}>
                      <Text style={estilos.enlace}>Registrar equipo nuevo</Text>
                    </Pressable>
                    <Pressable onPress={() => setSinEquipo(null)} accessibilityRole="button" hitSlop={8}>
                      <Text style={[estilos.enlace, { color: colores.textoSecundario }]}>Cerrar</Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            )}
            {!!mensaje && <Aviso tipo={mensaje.tipo} mensaje={mensaje.texto} />}

            {/* Buscador */}
            <View style={estilos.buscador}>
              <Ionicons name="search" size={18} color={colores.textoSecundario} />
              <TextInput
                value={texto}
                onChangeText={(t) => setTexto(t.slice(0, 100))}
                placeholder="Buscar por N/S, código, marca o ubicación"
                placeholderTextColor={colores.placeholder}
                style={estilos.buscadorTexto}
                autoCorrect={false}
                testID="ingreso-buscar"
              />
              {!!texto && (
                <Pressable onPress={() => setTexto('')} hitSlop={10} accessibilityRole="button" accessibilityLabel="Limpiar búsqueda">
                  <Ionicons name="close-circle" size={18} color={colores.textoTenue} />
                </Pressable>
              )}
            </View>

            {cargando ? (
              <ActivityIndicator color={colores.primario} style={{ marginTop: 24 }} />
            ) : error || !datos ? (
              <Aviso tipo="error" mensaje={error ?? 'No se pudieron cargar los equipos de la OS.'} />
            ) : (
              <>
                <Text style={estilos.seccion}>EQUIPOS DE LA OS</Text>
                {equipos.length === 0 && (
                  <Text style={estilos.vacio}>{buscar ? 'Ningún equipo de la OS coincide con tu búsqueda.' : 'Esta OS no tiene equipos. Escanea un QR o registra uno nuevo.'}</Text>
                )}
                {equipos.map((e) => {
                  const ya = ingresos.get(e.idOsEquipo);
                  const borrador = esBorrador(e);
                  const tono = ya ? colores.verde : borrador ? colores.textoTenue : colores.naranja;
                  return (
                    <Pressable key={e.idOsEquipo} onPress={() => abrir(e)} accessibilityRole="button" style={estilos.tarjeta} testID={`ingreso-equipo-${e.idOsEquipo}`}>
                      <View style={[estilos.franja, { backgroundColor: tono }]} />
                      <View style={estilos.tarjetaCuerpo}>
                        <View style={estilos.cabecera}>
                          <Text style={estilos.nombre}>{[e.codigoCliente ?? e.codigoTw, e.nombre].filter(Boolean).join(' · ')}</Text>
                          {!ya && <Ionicons name="chevron-forward" size={18} color={colores.textoTenue} />}
                        </View>
                        <Text style={estilos.linea}>{[e.numeroSerie ? `N/S ${e.numeroSerie}` : null, e.codigoTw ? `COD TW ${e.codigoTw}` : null].filter(Boolean).join(' · ') || 'Sin N/S'}</Text>
                        <Text style={estilos.linea}>{[[e.marca, e.modelo].filter(Boolean).join(' '), e.ubicacion].filter(Boolean).join(' · ')}</Text>
                        <View style={estilos.pie}>
                          <View style={[estilos.etiqueta, { backgroundColor: ya ? colores.verdeEtiquetaFondo : borrador ? colores.grisFondo : colores.amarilloFondo }]}>
                            <Text style={[estilos.etiquetaTexto, { color: ya ? colores.verdeEtiquetaTexto : borrador ? colores.grisTexto : colores.amarilloTexto }]}>
                              {ya ? 'REGISTRADO' : borrador ? 'BORRADOR' : 'POR REGISTRAR'}
                            </Text>
                          </View>
                          {!!ya && (
                            <Text style={estilos.lineaTenue}>
                              {textoEstadoIngreso(ya.estadoIngreso)} · {horaIngreso(ya.ingresadoEn)}
                            </Text>
                          )}
                          {borrador && !ya && <Text style={estilos.lineaTenue}>Equipo nuevo · por validar en la intranet</Text>}
                        </View>
                      </View>
                    </Pressable>
                  );
                })}
              </>
            )}
          </>
        )}
      </ScrollView>
      <CamaraApp visible={escaner} modo="qr" onCerrar={() => setEscaner(false)} onQr={(c) => void alLeerQr(c)} />
    </SafeAreaView>
  );
}

const estilos = StyleSheet.create({
  area: { flex: 1, backgroundColor: colores.fondo },
  contenido: { padding: 16, paddingBottom: 28, maxWidth: 560, width: '100%', alignSelf: 'center', gap: 12 },
  tituloFila: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  titulo: { fontSize: 24, fontWeight: '700', color: colores.titulo, flexShrink: 1 },
  subtitulo: { fontSize: 14, color: colores.textoSecundario, marginLeft: 34, marginTop: -6 },
  resumen: { backgroundColor: colores.tarjeta, borderRadius: radios.tarjeta, borderWidth: 1, borderColor: colores.bordeSuave, padding: 14, gap: 10 },
  resumenCabecera: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconoOs: { width: 42, height: 42, borderRadius: 12, backgroundColor: colores.azulFondo, alignItems: 'center', justifyContent: 'center' },
  osNumero: { fontSize: 17, fontWeight: '800', color: colores.titulo },
  osSede: { fontSize: 12.5, color: colores.textoSecundario, marginTop: 1 },
  avanceFila: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  avanceGrande: { fontSize: 26, fontWeight: '800', color: colores.primario },
  avanceDe: { fontSize: 16, fontWeight: '700', color: colores.textoSecundario },
  avanceTexto: { fontSize: 13, color: colores.textoSecundario },
  barra: { height: 7, borderRadius: 4, backgroundColor: colores.bordeSuave, overflow: 'hidden' },
  barraRelleno: { height: 7, borderRadius: 4, backgroundColor: colores.primario },
  botones: { flexDirection: 'row', gap: 12 },
  accion: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, minHeight: 64, borderRadius: radios.tarjeta, paddingHorizontal: 12 },
  accionPrimaria: { backgroundColor: colores.primario },
  accionPrimariaTexto: { color: colores.blanco, fontWeight: '800', fontSize: 14, lineHeight: 18 },
  accionSecundaria: { backgroundColor: colores.tarjeta, borderWidth: 1.5, borderColor: colores.primario },
  accionSecundariaTexto: { color: colores.primario, fontWeight: '800', fontSize: 14, lineHeight: 18 },
  sinEquipo: { flexDirection: 'row', gap: 10, backgroundColor: colores.amarilloFondo, borderRadius: radios.campo, padding: 12 },
  sinEquipoTitulo: { fontSize: 14, fontWeight: '800', color: colores.titulo },
  enlace: { fontSize: 13.5, fontWeight: '800', color: colores.primario },
  nota: { fontSize: 12.5, color: colores.textoSecundario, lineHeight: 18 },
  buscador: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colores.tarjeta, borderWidth: 1, borderColor: colores.borde, borderRadius: radios.campo, paddingHorizontal: 14, minHeight: 48 },
  buscadorTexto: { flex: 1, minWidth: 0, fontSize: 14.5, color: colores.texto, paddingVertical: 10 },
  seccion: { fontSize: 11.5, fontWeight: '800', letterSpacing: 1, color: colores.textoSecundario, marginTop: 4 },
  vacio: { fontSize: 14, color: colores.textoSecundario, textAlign: 'center', paddingVertical: 24 },
  tarjeta: { flexDirection: 'row', backgroundColor: colores.tarjeta, borderRadius: radios.tarjeta, borderWidth: 1, borderColor: colores.bordeSuave, overflow: 'hidden' },
  franja: { width: 5 },
  tarjetaCuerpo: { flex: 1, padding: 14, gap: 3 },
  cabecera: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  nombre: { flex: 1, fontSize: 15.5, fontWeight: '800', color: colores.titulo },
  linea: { fontSize: 12.5, color: colores.textoSecundario },
  lineaTenue: { fontSize: 12.5, color: colores.textoSecundario, flexShrink: 1 },
  pie: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' },
  etiqueta: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  etiquetaTexto: { fontSize: 10, fontWeight: '800', letterSpacing: 0.4 },
});
