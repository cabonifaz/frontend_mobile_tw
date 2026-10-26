import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ErrorApi } from '@/api/cliente';
import { nombreDeCodigo, obtenerCatalogo } from '@/api/catalogos';
import { buscarEquipoPorQr, cambiarEstadoEquipo, obtenerObjetivos, type ObjetivoEquipo } from '@/api/ruta';
import { Aviso } from '@/componentes/Aviso';
import { Boton } from '@/componentes/Boton';
import { CamaraApp } from '@/componentes/CamaraApp';
import { CambiosEquipo, EtiquetaAvance } from '@/componentes/CambiosEquipo';
import { EncabezadoApp } from '@/componentes/EncabezadoApp';
import { useConsulta } from '@/hooks/useConsulta';
import { useDiseno } from '@/hooks/useDiseno';
import { useSesion } from '@/sesion/SesionContext';
import { colores, radios } from '@/tema/colores';
import { fechaCorta } from '@/utilidades/formato';

/**
 * HU-07 — Seleccionar equipo.
 *  - Busca entre los equipos de la OS por serie, código, marca, modelo o ubicación.
 *  - "Escanear QR" lee el QR del activo con la cámara y abre ese equipo (solo si es de la OS).
 *  - "Seleccionar" inicia el trabajo en el equipo y vuelve a los objetivos.
 *  - Los equipos bloqueados para servicios se ven en gris y no se pueden seleccionar.
 */
export default function PantallaSeleccionarEquipo() {
  const { sesion } = useSesion();
  const usuario = sesion?.usuario;
  const d = useDiseno();
  const params = useLocalSearchParams<{ id?: string }>();
  const idOs = Number(params.id);
  const idValido = Number.isInteger(idOs) && idOs > 0;

  const [texto, setTexto] = useState('');
  const [buscar, setBuscar] = useState('');
  const [escaner, setEscaner] = useState(false);
  const [historial, setHistorial] = useState<number | null>(null);
  const [ocupado, setOcupado] = useState<number | null>(null);
  const [mensaje, setMensaje] = useState<{ tipo: 'error' | 'info'; texto: string } | null>(null);
  const [encontrado, setEncontrado] = useState<ObjetivoEquipo | null>(null);

  // Busca al dejar de escribir (no en cada tecla)
  useEffect(() => {
    const t = setTimeout(() => setBuscar(texto.trim()), 350);
    return () => clearTimeout(t);
  }, [texto]);

  const { datos, cargando, error } = useConsulta(async (token) => {
    if (!idValido) throw new ErrorApi('Servicio no válido.', 400, 1);
    const [objetivos, cargos] = await Promise.all([obtenerObjetivos(token, idOs, buscar), obtenerCatalogo(token, 'CARGO_USUARIO')]);
    return { objetivos, cargos };
  }, `${params.id ?? ''}|${buscar}`);

  const cargo = nombreDeCodigo(datos?.cargos, usuario?.cargo) ?? usuario?.cargo ?? 'Técnico de Campo';
  const equipos = encontrado ? [encontrado] : (datos?.objetivos.equipos ?? []);

  async function alLeerQr(contenido: string) {
    setEscaner(false);
    if (!sesion) return;
    setMensaje(null);
    try {
      const e = await buscarEquipoPorQr(sesion.token, idOs, contenido);
      setEncontrado(e);
      setMensaje({ tipo: 'info', texto: `Equipo encontrado: ${e.codigoTw ?? e.numeroSerie ?? e.nombre}.` });
    } catch (e) {
      setEncontrado(null);
      setMensaje({ tipo: 'error', texto: e instanceof Error ? e.message : 'No se pudo leer el QR.' });
    }
  }

  async function seleccionar(e: ObjetivoEquipo) {
    if (!sesion || ocupado) return;
    setOcupado(e.idOsEquipo);
    setMensaje(null);
    try {
      await cambiarEstadoEquipo(sesion.token, idOs, e.idOsEquipo, e.estado === 'pausado' ? 'reanudar' : 'iniciar');
      router.back();
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err instanceof Error ? err.message : 'No se pudo seleccionar el equipo.' });
    } finally {
      setOcupado(null);
    }
  }

  return (
    <SafeAreaView style={estilos.area} edges={['top']}>
      <EncabezadoApp nombre={usuario?.nombre ?? ''} apellido={usuario?.apellido} subtitulo={`${usuario?.nombre ?? ''} · ${cargo}`} />
      <ScrollView contentContainerStyle={[estilos.contenido, { paddingHorizontal: d.margen, maxWidth: d.anchoMaximo }]} keyboardShouldPersistTaps="handled">
        <View style={estilos.tituloFila}>
          <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Volver">
            <Ionicons name="arrow-back" size={24} color={colores.titulo} />
          </Pressable>
          <Text style={[estilos.titulo, { fontSize: d.tituloPantalla }]} accessibilityRole="header">
            Seleccionar Equipo
          </Text>
        </View>

        <Pressable onPress={() => setEscaner(true)} style={estilos.qr} accessibilityRole="button" testID="escanear-qr">
          <Ionicons name="qr-code-outline" size={20} color={colores.blanco} />
          <Text style={estilos.qrTexto}>Escanear QR</Text>
        </Pressable>

        <View style={estilos.buscador}>
          <Ionicons name="search" size={20} color={colores.textoSecundario} />
          <TextInput
            value={texto}
            onChangeText={(t) => {
              setTexto(t.slice(0, 100));
              setEncontrado(null);
            }}
            placeholder="Buscar por serie, código, marca, modelo o ubicación"
            placeholderTextColor={colores.placeholder}
            style={estilos.buscadorCampo}
            autoCapitalize="characters"
            autoCorrect={false}
            testID="buscar-equipo"
          />
          {!!texto && (
            <Pressable onPress={() => setTexto('')} hitSlop={10} accessibilityLabel="Limpiar búsqueda">
              <Ionicons name="close-circle" size={20} color={colores.textoTenue} />
            </Pressable>
          )}
        </View>

        {mensaje && (
          <View style={{ marginTop: 12 }} testID="mensaje-seleccion">
            <Aviso tipo={mensaje.tipo} mensaje={mensaje.texto} />
          </View>
        )}

        {cargando ? (
          <ActivityIndicator color={colores.primario} style={{ marginTop: 30 }} />
        ) : error ? (
          <View style={{ marginTop: 12 }}>
            <Aviso tipo="error" mensaje={error} />
          </View>
        ) : datos && !datos.objetivos.resumen.llegadaRegistrada ? (
          <View style={{ marginTop: 12 }}>
            <Aviso tipo="error" mensaje="No puedes continuar: primero registra tu llegada a planta." />
          </View>
        ) : equipos.length === 0 ? (
          <View style={{ marginTop: 12 }}>
            <Aviso mensaje={buscar ? 'Ningún equipo de esta OS coincide con la búsqueda.' : 'La orden de servicio no tiene equipos asignados.'} />
          </View>
        ) : (
          equipos.map((e) => (
            <View key={e.idOsEquipo} style={[estilos.tarjeta, e.bloqueado && estilos.tarjetaBloqueada]} testID={`equipo-${e.idOsEquipo}`}>
              <View style={estilos.cabecera}>
                <View style={{ flex: 1 }}>
                  <Text style={[estilos.nombre, e.bloqueado && { color: colores.textoSecundario }]}>{e.nombre}</Text>
                  <Text style={estilos.marca}>{[e.marca, e.modelo].filter(Boolean).join(' - ').toUpperCase()}</Text>
                </View>
                <View style={{ gap: 4, alignItems: 'flex-end' }}>
                  {e.bloqueado ? (
                    <EtiquetaAvance texto="BLOQUEADO" fondo={colores.grisFondo} color={colores.grisTexto} />
                  ) : (
                    <EtiquetaAvance estado={e.estado} />
                  )}
                  {e.garantiaVigente !== null && (
                    <EtiquetaAvance
                      texto={e.garantiaVigente ? 'GARANTÍA: VIGENTE' : 'GARANTÍA: VENCIDA'}
                      fondo={e.garantiaVigente ? colores.verdeEtiquetaFondo : colores.rojoEtiquetaFondo}
                      color={e.garantiaVigente ? colores.verdeEtiquetaTexto : colores.rojoEtiquetaTexto}
                    />
                  )}
                </View>
              </View>
              <View style={estilos.separador} />
              <View style={estilos.cuadricula}>
                <Dato k="SERIE" v={e.numeroSerie} />
                <Dato k="CÓDIGO" v={e.codigoCliente} />
                <Dato k="CÓDIGO TW" v={e.codigoTw} />
                <Dato k="UBICACIÓN" v={e.ubicacion} />
              </View>
              {!!e.estadoEquipo && <Text style={estilos.nota}>Estado del equipo: {e.estadoEquipo}</Text>}
              <View style={estilos.ultima}>
                <View style={estilos.ultimaFila}>
                  <Text style={estilos.nota}>Última intervención</Text>
                  <Text style={estilos.ultimaValor}>{e.ultimaIntervencion ? fechaCorta(e.ultimaIntervencion) : '—'}</Text>
                </View>
                <View style={estilos.ultimaFila}>
                  <Text style={estilos.nota}>Última parte</Text>
                  <Text style={estilos.ultimaValor} numberOfLines={2}>
                    {e.ultimaParte ?? '—'}
                  </Text>
                </View>
              </View>
              {historial === e.idOsEquipo && (
                <View style={{ marginTop: 10 }}>
                  <CambiosEquipo cambios={e.cambios} />
                </View>
              )}
              <View style={estilos.botones}>
                <View style={{ flex: 1 }}>
                  <Boton
                    titulo={historial === e.idOsEquipo ? 'Ocultar historial' : 'Ver historial'}
                    variante="secundario"
                    onPress={() => setHistorial((v) => (v === e.idOsEquipo ? null : e.idOsEquipo))}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Boton
                    titulo={e.bloqueado ? 'Bloqueado' : e.estado === 'en_ejecucion' ? 'En ejecución' : 'Seleccionar'}
                    onPress={() => void seleccionar(e)}
                    cargando={ocupado === e.idOsEquipo}
                    deshabilitado={!(e.puedeIniciar || e.puedeReanudar) || ocupado !== null}
                  />
                </View>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      <CamaraApp visible={escaner} modo="qr" onCerrar={() => setEscaner(false)} onQr={(c) => void alLeerQr(c)} />
    </SafeAreaView>
  );
}

function Dato({ k, v }: { k: string; v: string | null }) {
  return (
    <View style={estilos.dato}>
      <Text style={estilos.datoK}>{k}</Text>
      <Text style={estilos.datoV} numberOfLines={1}>
        {v ?? '—'}
      </Text>
    </View>
  );
}

const estilos = StyleSheet.create({
  area: { flex: 1, backgroundColor: colores.fondo },
  contenido: { paddingTop: 18, paddingBottom: 28, width: '100%', alignSelf: 'center' },
  tituloFila: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  titulo: { fontWeight: '700', color: colores.titulo, flexShrink: 1 },
  qr: {
    minHeight: 48,
    borderRadius: radios.boton,
    backgroundColor: colores.primarioOscuro,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  qrTexto: { color: colores.blanco, fontWeight: '600', fontSize: 15.5 },
  buscador: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: colores.borde,
    borderRadius: radios.campo,
    backgroundColor: colores.blanco,
    paddingHorizontal: 12,
  },
  buscadorCampo: { flex: 1, paddingVertical: 12, fontSize: 15, color: colores.texto },
  tarjeta: { marginTop: 14, backgroundColor: colores.blanco, borderWidth: 1, borderColor: colores.bordeSuave, borderRadius: radios.tarjeta, padding: 16 },
  tarjetaBloqueada: { opacity: 0.7 },
  cabecera: { flexDirection: 'row', gap: 10 },
  nombre: { fontSize: 18, fontWeight: '700', color: colores.titulo },
  marca: { fontSize: 12, fontWeight: '600', letterSpacing: 0.5, color: colores.textoSecundario, marginTop: 4 },
  separador: { height: 1, backgroundColor: colores.bordeSuave, marginVertical: 12 },
  cuadricula: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 10 },
  dato: { width: '50%', paddingRight: 8 },
  datoK: { fontSize: 10.5, fontWeight: '700', letterSpacing: 0.5, color: colores.textoSecundario },
  datoV: { fontSize: 15, color: colores.texto, marginTop: 2 },
  nota: { fontSize: 12.5, color: colores.textoSecundario, marginTop: 8 },
  ultima: { backgroundColor: colores.grisFondo, borderRadius: 8, padding: 10, marginTop: 10, gap: 2 },
  ultimaFila: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, alignItems: 'baseline' },
  ultimaValor: { fontSize: 13, color: colores.texto, flexShrink: 1, textAlign: 'right' },
  botones: { flexDirection: 'row', gap: 10, marginTop: 14 },
});
