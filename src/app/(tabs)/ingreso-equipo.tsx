import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect, useLocalSearchParams, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { obtenerIngresos, type IngresoEquipo } from '@/api/ingresoEquipos';
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
import { contarIngresados, horaIngreso, textoEstadoIngreso } from '@/utilidades/ingresoEquipos';
import { filtrarEquipos } from '@/utilidades/objetivos';

/**
 * HU-22 — Ingreso de equipos (OS) (Menú → Ingreso de Equipos OS).
 *  - Se elige la OS del día; el avance muestra cuántos equipos de la OS ya se ingresaron.
 *  - Se busca el equipo a mano (N/S, código, COD TW, marca, modelo, ubicación) o se escanea su QR / código de barras.
 *  - Cada equipo muestra REGISTRADO (con su estado y hora) o POR REGISTRAR; los equipos nuevos (NEW) quedan como BORRADOR hasta validarse en la intranet.
 *  - Tocar un equipo por registrar abre su ficha (Información del activo + Estado de ingreso). Uno ya ingresado se bloquea.
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
  const [mensaje, setMensaje] = useState<{ tipo: 'error' | 'info'; texto: string } | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setBuscar(texto.trim()), 250);
    return () => clearTimeout(t);
  }, [texto]);

  // OS del día
  const { datos: servicios, cargando: cargandoOs } = useConsulta((t) => obtenerServiciosProgramados(t, 'hoy', ''), 'ingreso-os');
  const lista: ServicioProgramado[] = useMemo(() => servicios ?? [], [servicios]);
  // Sin elegir otra, la OS en ejecución (o la primera del día)
  const idOsActiva = idOsElegida ?? (lista.length > 0 ? String((lista.find((s) => s.estadoOs === 'en_ejecucion') ?? lista[0]).idOs) : null);
  const idOs = Number(idOsActiva);
  const idValido = Number.isInteger(idOs) && idOs > 0;

  // Equipos de la OS (HU-07) e ingresos (HU-22)
  const { datos, cargando, error, recargar } = useConsulta(async (token) => {
    if (!idValido) throw new ErrorApi('Elige la OS del día.', 400, 1);
    const [objetivos, ingresos] = await Promise.all([obtenerObjetivos(token, idOs), obtenerIngresos(token, idOs)]);
    return { objetivos, ingresos } as { objetivos: Objetivos; ingresos: IngresoEquipo[] };
  }, `${idOsActiva ?? ''}|${params.v ?? ''}`);

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
  const osActual = lista.find((s) => s.idOs === idOs) ?? null;

  function abrir(e: ObjetivoEquipo) {
    const ya = ingresos.get(e.idOsEquipo);
    if (ya) return avisarYaIngresado(e, ya);
    router.push({ pathname: '/ingreso-equipo-activo', params: { id: String(idOs), eq: String(e.idOsEquipo) } } as unknown as Href);
  }

  function avisarYaIngresado(e: ObjetivoEquipo, ya: IngresoEquipo) {
    avisar(
      'Equipo ya ingresado',
      `${e.codigoCliente ?? e.codigoTw ?? e.numeroSerie ?? e.nombre} se registró hoy a las ${horaIngreso(ya.ingresadoEn)} como ${textoEstadoIngreso(ya.estadoIngreso)}. No se puede ingresar dos veces en la misma OS.`,
    );
  }

  async function alLeerQr(contenido: string) {
    setEscaner(false);
    if (!sesion || !idValido) return;
    setMensaje(null);
    try {
      const e = await buscarEquipoPorQr(sesion.token, idOs, contenido.trim().slice(0, 300));
      const ya = ingresos.get(e.idOsEquipo);
      if (ya) return avisarYaIngresado(e, ya);
      setMensaje({ tipo: 'info', texto: `Código escaneado: ${e.codigoTw ?? e.codigoCliente ?? e.numeroSerie ?? e.nombre}` });
      router.push({ pathname: '/ingreso-equipo-activo', params: { id: String(idOs), eq: String(e.idOsEquipo), qr: '1' } } as unknown as Href);
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err instanceof Error ? err.message : 'No se pudo leer el código.' });
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
        <Text style={estilos.subtitulo}>Equipos de tus OS del día</Text>

        {cargandoOs ? (
          <ActivityIndicator color={colores.primario} style={{ marginTop: 24 }} />
        ) : lista.length === 0 ? (
          <Aviso tipo="info" mensaje="No tienes servicios programados para hoy: no hay equipos que ingresar." />
        ) : (
          <>
            <Selector
              etiqueta="Orden de servicio"
              placeholder="Elige la OS"
              opciones={lista.map((s) => ({ valor: String(s.idOs), texto: `${s.numeroOs} · ${s.cliente ?? 'Sin cliente'}${s.sede ? ` · ${s.sede}` : ''}` }))}
              valor={idOsActiva}
              onCambio={(v) => {
                setIdOsElegida(v);
                setMensaje(null);
              }}
              testID="ingreso-os"
            />
            {!!osActual && <Text style={estilos.sede}>{[osActual.cliente, osActual.sede].filter(Boolean).join(' · ')}</Text>}

            <View style={estilos.herramientas}>
              <View style={estilos.buscador}>
                <Ionicons name="search" size={18} color={colores.textoSecundario} />
                <TextInput
                  value={texto}
                  onChangeText={(t) => setTexto(t.slice(0, 100))}
                  placeholder="Buscar N/S, código, Cod TW, marca, modelo o ubicación"
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
            </View>

            <View style={estilos.botones}>
              <Pressable onPress={() => setEscaner(true)} disabled={!idValido} accessibilityRole="button" style={[estilos.boton, estilos.botonPrimario]} testID="ingreso-escanear">
                <Ionicons name="qr-code-outline" size={20} color={colores.blanco} />
                <Text style={estilos.botonPrimarioTexto}>Escanear QR / barras</Text>
              </Pressable>
              <Pressable
                onPress={() => router.push({ pathname: '/equipo-nuevo', params: { id: String(idOs), desde: 'ingreso' } })}
                disabled={!idValido}
                accessibilityRole="button"
                style={[estilos.boton, estilos.botonSecundario]}
                testID="ingreso-nuevo"
              >
                <Ionicons name="add-circle-outline" size={20} color={colores.primario} />
                <Text style={estilos.botonSecundarioTexto}>Equipo nuevo</Text>
              </Pressable>
            </View>

            {!!mensaje && <Aviso tipo={mensaje.tipo} mensaje={mensaje.texto} />}

            {cargando ? (
              <ActivityIndicator color={colores.primario} style={{ marginTop: 24 }} />
            ) : error || !datos ? (
              <Aviso tipo="error" mensaje={error ?? 'No se pudieron cargar los equipos de la OS.'} />
            ) : (
              <>
                <View style={estilos.avanceFila}>
                  <Text style={estilos.seccion}>EQUIPOS DE LA OS</Text>
                  <Text style={estilos.avanceTexto}>
                    {hechos} de {total} ingresados
                  </Text>
                </View>
                <View style={estilos.barra}>
                  <View style={[estilos.barraRelleno, { width: `${total > 0 ? Math.round((hechos / total) * 100) : 0}%` }]} />
                </View>

                {equipos.length === 0 && (
                  <Text style={estilos.vacio}>{buscar ? 'Ningún equipo de la OS coincide con tu búsqueda.' : 'Esta OS no tiene equipos. Registra uno con «Equipo nuevo».'}</Text>
                )}

                {equipos.map((e) => {
                  const ya = ingresos.get(e.idOsEquipo);
                  return (
                    <Pressable key={e.idOsEquipo} onPress={() => abrir(e)} accessibilityRole="button" style={estilos.tarjeta} testID={`ingreso-equipo-${e.idOsEquipo}`}>
                      <View style={estilos.cabecera}>
                        <Text style={estilos.nombre}>
                          {[e.codigoCliente ?? e.codigoTw, e.nombre].filter(Boolean).join(' · ')}
                        </Text>
                        <Etiqueta
                          texto={ya ? 'REGISTRADO' : e.enCampo ? 'BORRADOR' : 'POR REGISTRAR'}
                          fondo={ya ? colores.verdeEtiquetaFondo : e.enCampo ? colores.grisFondo : colores.amarilloFondo}
                          color={ya ? colores.verdeEtiquetaTexto : e.enCampo ? colores.grisTexto : colores.amarilloTexto}
                        />
                      </View>
                      <Text style={estilos.linea}>{[e.numeroSerie ? `N/S ${e.numeroSerie}` : null, e.codigoTw ? `COD TW ${e.codigoTw}` : null].filter(Boolean).join(' · ') || 'Sin N/S'}</Text>
                      <Text style={estilos.linea}>{[[e.marca, e.modelo].filter(Boolean).join(' '), e.ubicacion].filter(Boolean).join(' · ')}</Text>
                      {e.enCampo && (
                        <View style={estilos.fila}>
                          <Ionicons name="time-outline" size={13} color={colores.textoSecundario} />
                          <Text style={estilos.lineaTenue}>Equipo nuevo · pendiente de validar en la intranet</Text>
                        </View>
                      )}
                      {!!ya && (
                        <View style={estilos.fila}>
                          <Ionicons name="ellipse" size={9} color={ya.estadoIngreso === 'operativo' ? colores.verde : ya.estadoIngreso === 'inoperativo' ? colores.rojo : colores.naranja} />
                          <Text style={estilos.lineaTenue}>
                            {textoEstadoIngreso(ya.estadoIngreso)} · {horaIngreso(ya.ingresadoEn)}
                          </Text>
                        </View>
                      )}
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

function Etiqueta({ texto, fondo, color }: { texto: string; fondo: string; color: string }) {
  return (
    <View style={[estilos.etiqueta, { backgroundColor: fondo }]}>
      <Text style={[estilos.etiquetaTexto, { color }]}>{texto}</Text>
    </View>
  );
}

const estilos = StyleSheet.create({
  area: { flex: 1, backgroundColor: colores.fondo },
  contenido: { padding: 16, paddingBottom: 28, maxWidth: 560, width: '100%', alignSelf: 'center', gap: 12 },
  tituloFila: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  titulo: { fontSize: 24, fontWeight: '700', color: colores.titulo, flexShrink: 1 },
  subtitulo: { fontSize: 14, color: colores.textoSecundario, marginLeft: 34, marginTop: -6 },
  sede: { fontSize: 12.5, color: colores.textoSecundario, marginTop: -6 },
  herramientas: { flexDirection: 'row', gap: 10 },
  buscador: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colores.tarjeta, borderWidth: 1, borderColor: colores.borde, borderRadius: radios.campo, paddingHorizontal: 14, minHeight: 48 },
  buscadorTexto: { flex: 1, minWidth: 0, fontSize: 14.5, color: colores.texto, paddingVertical: 10 },
  botones: { flexDirection: 'row', gap: 10 },
  boton: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 48, borderRadius: radios.boton, paddingHorizontal: 10 },
  botonPrimario: { backgroundColor: colores.primario },
  botonPrimarioTexto: { color: colores.blanco, fontWeight: '700', fontSize: 14 },
  botonSecundario: { backgroundColor: colores.tarjeta, borderWidth: 1, borderColor: colores.primario },
  botonSecundarioTexto: { color: colores.primario, fontWeight: '700', fontSize: 14 },
  avanceFila: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  seccion: { fontSize: 11.5, fontWeight: '800', letterSpacing: 1, color: colores.primario },
  avanceTexto: { fontSize: 12.5, fontWeight: '700', color: colores.primario },
  barra: { height: 5, borderRadius: 3, backgroundColor: colores.bordeSuave, overflow: 'hidden', marginTop: -6 },
  barraRelleno: { height: 5, backgroundColor: colores.primario },
  vacio: { fontSize: 14, color: colores.textoSecundario, textAlign: 'center', paddingVertical: 24 },
  tarjeta: { backgroundColor: colores.tarjeta, borderRadius: radios.tarjeta, borderWidth: 1, borderColor: colores.bordeSuave, padding: 14, gap: 4 },
  cabecera: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  nombre: { flex: 1, fontSize: 15.5, fontWeight: '800', color: colores.titulo },
  linea: { fontSize: 12.5, color: colores.textoSecundario },
  lineaTenue: { fontSize: 12.5, color: colores.textoSecundario },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  etiqueta: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  etiquetaTexto: { fontSize: 10, fontWeight: '800', letterSpacing: 0.4 },
});
