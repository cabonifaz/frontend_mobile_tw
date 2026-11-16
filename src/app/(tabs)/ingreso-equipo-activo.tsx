import { useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { obtenerIngresos, registrarIngreso } from '@/api/ingresoEquipos';
import { ErrorApi } from '@/api/cliente';
import { obtenerObjetivos } from '@/api/ruta';
import { Aviso } from '@/componentes/Aviso';
import { Boton } from '@/componentes/Boton';
import { CamaraApp } from '@/componentes/CamaraApp';
import { CampoTexto } from '@/componentes/CampoTexto';
import { EncabezadoApp } from '@/componentes/EncabezadoApp';
import { useConsulta } from '@/hooks/useConsulta';
import { useDiseno } from '@/hooks/useDiseno';
import { useSesion } from '@/sesion/SesionContext';
import { colores, radios } from '@/tema/colores';
import { avisar } from '@/utilidades/dialogos';
import {
  ESTADOS_INGRESO,
  faltaParaRegistrar,
  horaIngreso,
  MAX_FOTOS_INGRESO,
  MAX_OBSERVACION_INGRESO,
  requiereEvidencia,
  textoEstadoIngreso,
  type EstadoIngreso,
} from '@/utilidades/ingresoEquipos';

/**
 * HU-22 — Ficha de ingreso de un equipo de la OS.
 *  - «Información del activo» autocompletada (cliente, equipo, N/S, código, COD TW, marca, modelo, ubicación): sale del maestro, no se escribe.
 *  - «Estado de ingreso» obligatorio antes de «Registrar equipo». Con observaciones o inoperativo: observación y fotos de evidencia (solo cámara) obligatorias.
 *  - Un equipo ya ingresado en la misma OS no se puede volver a ingresar: se muestra su registro.
 */
export default function PantallaIngresoEquipoActivo() {
  const { sesion } = useSesion();
  const usuario = sesion?.usuario;
  const d = useDiseno();
  const params = useLocalSearchParams<{ id?: string; eq?: string; qr?: string }>();
  const idOs = Number(params.id);
  const idOsEquipo = Number(params.eq);
  const valido = Number.isInteger(idOs) && idOs > 0 && Number.isInteger(idOsEquipo) && idOsEquipo > 0;

  const [estado, setEstado] = useState<EstadoIngreso | null>(null);
  const [observacion, setObservacion] = useState('');
  const [fotos, setFotos] = useState<string[]>([]);
  const [camara, setCamara] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: 'error' | 'info'; texto: string } | null>(null);

  const { datos, cargando, error } = useConsulta(async (token) => {
    if (!valido) throw new ErrorApi('Equipo no válido.', 400, 1);
    const [objetivos, ingresos] = await Promise.all([obtenerObjetivos(token, idOs), obtenerIngresos(token, idOs)]);
    return { objetivos, ingresos };
  }, `${params.id ?? ''}|${params.eq ?? ''}`);

  const e = datos?.objetivos.equipos.find((x) => x.idOsEquipo === idOsEquipo) ?? null;
  const previo = datos?.ingresos.find((i) => i.idOsEquipo === idOsEquipo) ?? null;
  const evidencia = requiereEvidencia(estado);
  const falta = faltaParaRegistrar(estado, observacion, fotos.length);
  const resumen = datos?.objetivos.resumen;

  async function registrar() {
    if (!sesion || !estado || falta) return;
    setMensaje(null);
    setEnviando(true);
    try {
      const r = await registrarIngreso(sesion.token, idOs, idOsEquipo, { estado, observacion, fotos: evidencia ? fotos : [] });
      avisar('Equipo registrado', `${e?.codigoCliente ?? e?.nombre ?? 'Equipo'} · ${textoEstadoIngreso(estado)}${r.datos?.ingresadoEn ? ` · ${horaIngreso(r.datos.ingresadoEn)}` : ''}`);
      router.replace({ pathname: '/ingreso-equipo', params: { id: String(idOs), v: String(Date.now()) } } as unknown as Href);
    } catch (err) {
      setMensaje({
        tipo: 'error',
        texto:
          err instanceof ErrorApi && err.estadoHttp === 0
            ? 'Sin conexión: el ingreso se registra con señal (se suben las fotos de evidencia). Inténtalo cuando vuelva la señal.'
            : err instanceof Error
              ? err.message
              : 'No se pudo registrar el equipo.',
      });
    } finally {
      setEnviando(false);
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
        {!!resumen && (
          <Text style={estilos.subtitulo}>
            {resumen.numeroOs}
            {resumen.cliente ? ` · ${resumen.cliente}` : ''}
          </Text>
        )}

        {cargando ? (
          <ActivityIndicator color={colores.primario} style={{ marginTop: 32 }} />
        ) : error ? (
          <Aviso tipo="error" mensaje={error} />
        ) : !e ? (
          <Aviso tipo="error" mensaje="Este equipo no forma parte de la OS." />
        ) : (
          <>
            {params.qr === '1' && (
              <View style={estilos.leido}>
                <Ionicons name="checkmark-circle" size={20} color={colores.verde} />
                <Text style={estilos.leidoTexto}>Código escaneado: {e.codigoTw ?? e.codigoCliente ?? e.numeroSerie}</Text>
              </View>
            )}

            <View style={estilos.tarjeta} testID="ingreso-info-activo">
              <View style={estilos.cabecera}>
                <Text style={estilos.tarjetaTitulo}>Información del activo</Text>
                <View style={estilos.auto}>
                  <Ionicons name="lock-closed-outline" size={11} color={colores.textoSecundario} />
                  <Text style={estilos.autoTexto}>autocompletado</Text>
                </View>
              </View>
              <View style={estilos.datos}>
                <Dato k="CLIENTE" v={resumen?.cliente ?? null} />
                <Dato k="EQUIPO" v={e.nombre} />
                <Dato k="N/S" v={e.numeroSerie} />
                <Dato k="CÓDIGO" v={e.codigoCliente} />
                <Dato k="COD TW" v={e.codigoTw} />
                <Dato k="MARCA" v={e.marca} />
                <Dato k="MODELO" v={e.modelo} />
                <Dato k="UBICACIÓN" v={e.ubicacion} />
              </View>
              {e.enCampo && (
                <View style={estilos.fila}>
                  <Ionicons name="time-outline" size={14} color={colores.textoSecundario} />
                  <Text style={estilos.nota}>Equipo nuevo · queda en borrador hasta que se valide en la intranet.</Text>
                </View>
              )}
            </View>

            {previo ? (
              <View style={[estilos.tarjeta, { borderColor: colores.verde }]} testID="ingreso-ya-registrado">
                <Text style={estilos.tarjetaTitulo}>Equipo ya ingresado</Text>
                <Text style={estilos.nota}>
                  Se registró hoy a las {horaIngreso(previo.ingresadoEn)} como {textoEstadoIngreso(previo.estadoIngreso)}. No se puede ingresar dos veces en la misma OS.
                </Text>
                {!!previo.observacion && <Text style={estilos.observacion}>“{previo.observacion}”</Text>}
                {previo.fotos > 0 && (
                  <Text style={estilos.nota}>
                    {previo.fotos} {previo.fotos === 1 ? 'foto de evidencia' : 'fotos de evidencia'}
                  </Text>
                )}
                <Boton titulo="Volver a la lista" variante="secundario" onPress={() => router.replace({ pathname: '/ingreso-equipo', params: { id: String(idOs) } } as unknown as Href)} />
              </View>
            ) : (
              <>
                <Text style={estilos.seccion}>ESTADO DE INGRESO *</Text>
                <View style={{ gap: 8 }}>
                  {ESTADOS_INGRESO.map((o) => {
                    const activo = estado === o.valor;
                    return (
                      <Pressable
                        key={o.valor}
                        onPress={() => setEstado(o.valor)}
                        accessibilityRole="radio"
                        accessibilityState={{ checked: activo }}
                        style={[estilos.opcion, activo && (o.valor === 'operativo' ? estilos.opcionActiva : o.valor === 'inoperativo' ? estilos.opcionInoperativo : estilos.opcionObservaciones)]}
                        testID={`estado-${o.valor}`}
                      >
                        <Ionicons name={activo ? 'radio-button-on' : 'radio-button-off'} size={20} color={activo ? colores.primario : colores.textoTenue} />
                        <Text style={[estilos.opcionTexto, activo && { fontWeight: '800' }]}>{o.texto}</Text>
                      </Pressable>
                    );
                  })}
                </View>

                {evidencia && (
                  <>
                    <CampoTexto
                      etiqueta="Observación *"
                      value={observacion}
                      onChangeText={(t) => setObservacion(t.slice(0, MAX_OBSERVACION_INGRESO))}
                      placeholder="Ej.: Plataforma con golpe en esquina derecha; indicador enciende y pesa."
                      multiline
                      testID="ingreso-observacion"
                    />
                    <Text style={estilos.seccion}>FOTOS DE EVIDENCIA * (solo cámara)</Text>
                    <View style={estilos.fotos}>
                      {fotos.map((uri, i) => (
                        <View key={`${uri}-${i}`} style={estilos.foto}>
                          <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" accessibilityLabel={`Foto ${i + 1} de evidencia`} />
                          <Pressable onPress={() => setFotos((fs) => fs.filter((_, k) => k !== i))} hitSlop={8} accessibilityRole="button" accessibilityLabel="Quitar foto" style={estilos.quitar}>
                            <Ionicons name="close" size={14} color={colores.blanco} />
                          </Pressable>
                        </View>
                      ))}
                      {fotos.length < MAX_FOTOS_INGRESO && (
                        <Pressable onPress={() => setCamara(true)} accessibilityRole="button" style={estilos.tomar} testID="ingreso-tomar-foto">
                          <Ionicons name="camera-outline" size={26} color={colores.primario} />
                        </Pressable>
                      )}
                    </View>
                    <Text style={estilos.nota}>
                      {fotos.length} de {MAX_FOTOS_INGRESO} fotos · toca la X para quitar una
                    </Text>
                  </>
                )}

                {!!mensaje && <Aviso tipo={mensaje.tipo} mensaje={mensaje.texto} />}
                <Boton titulo="Registrar equipo" onPress={() => void registrar()} deshabilitado={!!falta || enviando} cargando={enviando} />
                {!!falta && <Text style={estilos.faltan}>{falta}</Text>}
              </>
            )}
          </>
        )}
      </ScrollView>
      <CamaraApp
        visible={camara}
        modo="foto"
        onCerrar={() => setCamara(false)}
        onFoto={(uri) => {
          setCamara(false);
          setFotos((fs) => (fs.length >= MAX_FOTOS_INGRESO ? fs : [...fs, uri]));
        }}
      />
    </SafeAreaView>
  );
}

function Dato({ k, v }: { k: string; v: string | null }) {
  if (!v) return null;
  return (
    <View style={estilos.dato}>
      <Text style={estilos.datoK}>{k}</Text>
      <Text style={estilos.datoV}>{v}</Text>
    </View>
  );
}

const estilos = StyleSheet.create({
  area: { flex: 1, backgroundColor: colores.fondo },
  contenido: { padding: 16, paddingBottom: 28, maxWidth: 560, width: '100%', alignSelf: 'center', gap: 12 },
  tituloFila: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  titulo: { fontSize: 24, fontWeight: '700', color: colores.titulo, flexShrink: 1 },
  subtitulo: { fontSize: 14, color: colores.textoSecundario, marginLeft: 34, marginTop: -6 },
  leido: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colores.verdeEtiquetaFondo, borderRadius: radios.campo, padding: 12 },
  leidoTexto: { fontSize: 13.5, color: colores.verdeEtiquetaTexto, fontWeight: '600', flexShrink: 1 },
  tarjeta: { backgroundColor: colores.tarjeta, borderRadius: radios.tarjeta, borderWidth: 1, borderColor: colores.bordeSuave, padding: 14, gap: 10 },
  cabecera: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  tarjetaTitulo: { fontSize: 15.5, fontWeight: '800', color: colores.titulo },
  auto: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  autoTexto: { fontSize: 11.5, color: colores.textoSecundario },
  datos: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  dato: { width: '47%', flexGrow: 1, gap: 2 },
  datoK: { fontSize: 10.5, fontWeight: '700', letterSpacing: 0.8, color: colores.textoSecundario },
  datoV: { fontSize: 14.5, color: colores.titulo, lineHeight: 20 },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  nota: { fontSize: 12.5, color: colores.textoSecundario, lineHeight: 18, flexShrink: 1 },
  observacion: { fontSize: 13.5, color: colores.texto, lineHeight: 19 },
  seccion: { fontSize: 11.5, fontWeight: '800', letterSpacing: 1, color: colores.textoSecundario, marginTop: 4 },
  opcion: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colores.tarjeta, borderRadius: radios.campo, borderWidth: 1, borderColor: colores.borde, padding: 14 },
  opcionActiva: { borderColor: colores.verde, backgroundColor: colores.verdeEtiquetaFondo },
  opcionObservaciones: { borderColor: colores.naranja, backgroundColor: colores.amarilloFondo },
  opcionInoperativo: { borderColor: colores.rojo, backgroundColor: colores.rojoEtiquetaFondo },
  opcionTexto: { fontSize: 15, color: colores.titulo },
  fotos: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  foto: { width: 84, height: 84, borderRadius: 10, overflow: 'hidden', backgroundColor: colores.grisFondo },
  quitar: { position: 'absolute', top: 4, right: 4, width: 20, height: 20, borderRadius: 10, backgroundColor: 'rgba(15,23,42,0.75)', alignItems: 'center', justifyContent: 'center' },
  tomar: { width: 84, height: 84, borderRadius: 10, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colores.primario, alignItems: 'center', justifyContent: 'center' },
  faltan: { fontSize: 12.5, color: colores.textoSecundario, textAlign: 'center' },
});
