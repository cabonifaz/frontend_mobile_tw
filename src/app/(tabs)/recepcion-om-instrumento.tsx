import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ErrorApi } from '@/api/cliente';
import { obtenerDetalleRecepcion, obtenerFotosPendientes, quitarFotoRecepcion, subirFotoRecepcion, urlFotoRecepcion } from '@/api/recepcionOm';
import { actualizarInstrumento, useBorradorRecepcion } from '@/almacen/borradorRecepcionOm';
import { Aviso } from '@/componentes/Aviso';
import { Boton } from '@/componentes/Boton';
import { CamaraApp } from '@/componentes/CamaraApp';
import { CampoTexto } from '@/componentes/CampoTexto';
import { Casilla } from '@/componentes/Casilla';
import { EncabezadoApp } from '@/componentes/EncabezadoApp';
import { useConsulta } from '@/hooks/useConsulta';
import { useDiseno } from '@/hooks/useDiseno';
import { useSesion } from '@/sesion/SesionContext';
import { colores, radios } from '@/tema/colores';
import {
  ACCESORIOS,
  ESTADOS_FISICOS,
  MAX_FOTOS_RECEPCION,
  MAX_OBSERVACIONES,
  MIN_FOTOS_RECEPCION,
  faltaInstrumento,
  instrumentoVacio,
  textoFotos,
} from '@/utilidades/recepcionOm';

/**
 * HU-23 — Estado de un instrumento que se recibe: estado físico (obligatorio), observaciones (obligatorias, también si está conforme), accesorios recibidos y fotos de recepción
 * (mínimo 3, solo con la cámara de la app y sin IA). Cada foto se sube al servidor al tomarla (así no se pierde); lo demás queda en el borrador de la recepción.
 */
export default function PantallaRecepcionOmInstrumento() {
  const { sesion } = useSesion();
  const usuario = sesion?.usuario;
  const d = useDiseno();
  const params = useLocalSearchParams<{ om?: string; eq?: string }>();
  const idOs = Number(params.om);
  const idOsEquipo = Number(params.eq);
  const valido = Number.isInteger(idOs) && idOs > 0 && Number.isInteger(idOsEquipo) && idOsEquipo > 0;
  const borrador = useBorradorRecepcion(idOs);
  const i = borrador.instrumentos[idOsEquipo] ?? instrumentoVacio();

  const [camara, setCamara] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: 'error' | 'info'; texto: string } | null>(null);
  const token = sesion?.token ?? '';

  const { datos, cargando, error } = useConsulta(async (t) => {
    if (!valido) throw new ErrorApi('Instrumento no válido.', 400, 1);
    return obtenerDetalleRecepcion(t, idOs);
  }, `${params.om ?? ''}|${params.eq ?? ''}`);
  const inst = datos?.instrumentos.find((x) => x.idOsEquipo === idOsEquipo) ?? null;

  // Si se cerró la app a medias, las fotos ya subidas se recuperan del servidor
  const recuperadas = useRef(false);
  useEffect(() => {
    if (!valido || !token || recuperadas.current) return;
    recuperadas.current = true;
    void obtenerFotosPendientes(token, idOs, idOsEquipo).then(
      (lista) => {
        if (lista.length === 0) return;
        actualizarInstrumento(idOs, idOsEquipo, (x) => {
          const nuevas = lista.filter((f) => !x.fotos.some((y) => y.idFoto === f.idFoto)).map((f) => ({ idFoto: f.idFoto, uri: null }));
          return nuevas.length === 0 ? x : { ...x, fotos: [...x.fotos, ...nuevas].slice(0, MAX_FOTOS_RECEPCION) };
        });
      },
      () => undefined,
    );
  }, [valido, token, idOs, idOsEquipo]);

  async function alTomar(uri: string) {
    setCamara(false);
    if (!sesion || i.fotos.length >= MAX_FOTOS_RECEPCION) return;
    setMensaje(null);
    setSubiendo(true);
    try {
      const f = await subirFotoRecepcion(sesion.token, idOs, idOsEquipo, uri);
      actualizarInstrumento(idOs, idOsEquipo, (x) => ({ ...x, fotos: [...x.fotos, { idFoto: f.idFoto, uri }] }));
    } catch (e) {
      setMensaje({
        tipo: 'error',
        texto: e instanceof ErrorApi && e.estadoHttp === 0 ? 'Sin conexión: las fotos de recepción se suben con señal. Inténtalo de nuevo cuando vuelva.' : e instanceof Error ? e.message : 'No se pudo subir la foto.',
      });
    } finally {
      setSubiendo(false);
    }
  }

  async function quitarFoto(idFoto: number) {
    if (!sesion) return;
    setMensaje(null);
    try {
      await quitarFotoRecepcion(sesion.token, idOs, idOsEquipo, idFoto);
      actualizarInstrumento(idOs, idOsEquipo, (x) => ({ ...x, fotos: x.fotos.filter((f) => f.idFoto !== idFoto) }));
    } catch (e) {
      setMensaje({ tipo: 'error', texto: e instanceof Error ? e.message : 'No se pudo quitar la foto.' });
    }
  }

  function alternarAccesorio(codigo: string, marcado: boolean) {
    actualizarInstrumento(idOs, idOsEquipo, (x) => ({ ...x, accesorios: marcado ? [...x.accesorios.filter((c) => c !== codigo), codigo] : x.accesorios.filter((c) => c !== codigo) }));
  }

  const falta = faltaInstrumento(i);

  return (
    <SafeAreaView style={estilos.area} edges={['top']}>
      <EncabezadoApp nombre={usuario?.nombre ?? ''} apellido={usuario?.apellido} subtitulo={`${usuario?.nombre ?? ''} · ${usuario?.cargo ?? 'Técnico de Metrología'}`} />
      <ScrollView contentContainerStyle={[estilos.contenido, { paddingHorizontal: d.margen, maxWidth: d.anchoMaximo }]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={estilos.tituloFila}>
          <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Volver">
            <Ionicons name="arrow-back" size={24} color={colores.titulo} />
          </Pressable>
          <Text style={[estilos.titulo, { fontSize: d.tituloPantalla }]} accessibilityRole="header">
            Estado del instrumento
          </Text>
        </View>

        {cargando ? (
          <ActivityIndicator color={colores.primario} style={{ marginTop: 32 }} />
        ) : error ? (
          <Aviso tipo="error" mensaje={error} />
        ) : !inst || inst.recibido ? (
          <Aviso tipo="error" mensaje={inst?.recibido ? 'Este instrumento ya se recibió en la OM.' : 'Este instrumento no forma parte de la OM.'} />
        ) : (
          <>
            <Text style={estilos.subtitulo}>
              {datos?.cabecera.numero}
              {datos?.cabecera.cliente ? ` · ${datos.cabecera.cliente}` : ''}
            </Text>
            <View style={estilos.resumen} testID="instrumento-resumen">
              <Text style={estilos.seccion}>
                INSTRUMENTO {inst.numero} DE {datos?.cabecera.totalInstrumentos}
              </Text>
              <Text style={estilos.nombre}>{inst.nombre}</Text>
              <Text style={estilos.nota}>{[[inst.marca, inst.modelo].filter(Boolean).join(' '), inst.serie ? `N/S ${inst.serie}` : null, inst.capacidad].filter(Boolean).join(' · ')}</Text>
            </View>

            <Text style={estilos.seccion}>ESTADO FÍSICO *</Text>
            <View style={estilos.fisicos}>
              {ESTADOS_FISICOS.map((o) => {
                const activo = i.estadoFisico === o.valor;
                return (
                  <Pressable
                    key={o.valor}
                    onPress={() => actualizarInstrumento(idOs, idOsEquipo, (x) => ({ ...x, estadoFisico: o.valor }))}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: activo }}
                    style={[estilos.fisico, activo && (o.valor === 'conforme' ? estilos.fisicoConforme : estilos.fisicoObservado)]}
                    testID={`fisico-${o.valor}`}
                  >
                    <Text style={[estilos.fisicoTexto, activo && { color: colores.blanco }]}>{o.texto}</Text>
                  </Pressable>
                );
              })}
            </View>

            <CampoTexto
              etiqueta="Observaciones *"
              value={i.observaciones}
              onChangeText={(t) => actualizarInstrumento(idOs, idOsEquipo, (x) => ({ ...x, observaciones: t.slice(0, MAX_OBSERVACIONES) }))}
              placeholder="Ej.: Burbuja de nivel desplazada; protector de plato ausente. Enciende correctamente."
              multiline
              testID="instrumento-observaciones"
            />
            <Text style={estilos.contador}>
              {i.observaciones.trim().length} / {MAX_OBSERVACIONES}
            </Text>

            <Text style={estilos.seccion}>ACCESORIOS RECIBIDOS</Text>
            <View style={estilos.accesorios}>
              {ACCESORIOS.map((a) => (
                <Casilla key={a.codigo} etiqueta={a.texto} marcada={i.accesorios.includes(a.codigo)} onCambiar={(v) => alternarAccesorio(a.codigo, v)} />
              ))}
            </View>

            <View style={estilos.fotosCabecera}>
              <Text style={estilos.seccion}>FOTOS DE RECEPCIÓN * (solo cámara)</Text>
              <Text style={[estilos.contadorFotos, i.fotos.length >= MIN_FOTOS_RECEPCION && { color: colores.verde }]}>{textoFotos(i.fotos.length)}</Text>
            </View>
            <Text style={estilos.nota}>Toma una foto general, la placa y el detalle de lo observado. Mínimo {MIN_FOTOS_RECEPCION}, máximo {MAX_FOTOS_RECEPCION}.</Text>
            <View style={estilos.fotos}>
              {i.fotos.map((f, n) => (
                <View key={f.idFoto} style={estilos.foto}>
                  <Image
                    source={f.uri ? { uri: f.uri } : { uri: urlFotoRecepcion(f.idFoto), headers: { Authorization: `Bearer ${token}` } }}
                    style={StyleSheet.absoluteFill}
                    resizeMode="cover"
                    accessibilityLabel={`Foto ${n + 1} de recepción`}
                  />
                  <Pressable onPress={() => void quitarFoto(f.idFoto)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Quitar la foto ${n + 1}`} style={estilos.quitar} testID={`quitar-foto-${n + 1}`}>
                    <Ionicons name="close" size={14} color={colores.blanco} />
                  </Pressable>
                </View>
              ))}
              {subiendo && (
                <View style={[estilos.foto, estilos.fotoSubiendo]}>
                  <ActivityIndicator color={colores.primario} />
                </View>
              )}
              {i.fotos.length < MAX_FOTOS_RECEPCION && !subiendo && (
                <Pressable onPress={() => setCamara(true)} accessibilityRole="button" accessibilityLabel="Tomar foto de recepción" style={estilos.tomar} testID="tomar-foto-recepcion">
                  <Ionicons name="camera-outline" size={26} color={colores.primario} />
                </Pressable>
              )}
            </View>

            {!!mensaje && <Aviso tipo={mensaje.tipo} mensaje={mensaje.texto} />}
            <Boton titulo="Guardar instrumento" onPress={() => router.back()} deshabilitado={!!falta || subiendo} />
            {!!falta && <Text style={estilos.faltan}>{falta}</Text>}
          </>
        )}
      </ScrollView>
      <CamaraApp visible={camara} modo="foto" onCerrar={() => setCamara(false)} onFoto={(uri) => void alTomar(uri)} />
    </SafeAreaView>
  );
}

const estilos = StyleSheet.create({
  area: { flex: 1, backgroundColor: colores.fondo },
  contenido: { paddingTop: 18, paddingBottom: 28, width: '100%', alignSelf: 'center', gap: 10 },
  tituloFila: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  titulo: { fontWeight: '700', color: colores.titulo, flexShrink: 1 },
  subtitulo: { color: colores.textoSecundario, fontSize: 14, marginTop: -4, marginLeft: 36 },
  resumen: { backgroundColor: colores.tarjeta, borderRadius: radios.tarjeta, borderWidth: 1, borderColor: colores.bordeSuave, padding: 14, gap: 3 },
  nombre: { fontSize: 18, fontWeight: '800', color: colores.titulo },
  nota: { fontSize: 12.5, color: colores.textoSecundario, lineHeight: 18 },
  seccion: { fontSize: 11.5, fontWeight: '800', letterSpacing: 1, color: colores.textoSecundario, marginTop: 4 },
  fisicos: { flexDirection: 'row', gap: 10 },
  fisico: { flex: 1, minHeight: 50, borderRadius: radios.campo, borderWidth: 1, borderColor: colores.borde, backgroundColor: colores.tarjeta, alignItems: 'center', justifyContent: 'center' },
  fisicoConforme: { backgroundColor: colores.verde, borderColor: colores.verde },
  fisicoObservado: { backgroundColor: colores.rojo, borderColor: colores.rojo },
  fisicoTexto: { fontSize: 16, fontWeight: '700', color: colores.titulo },
  contador: { fontSize: 12, color: colores.textoSecundario, textAlign: 'right', marginTop: -6 },
  accesorios: { backgroundColor: colores.tarjeta, borderRadius: radios.tarjeta, borderWidth: 1, borderColor: colores.bordeSuave, padding: 14, gap: 14 },
  fotosCabecera: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  contadorFotos: { fontSize: 13.5, fontWeight: '800', color: colores.naranja },
  fotos: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  foto: { width: 84, height: 84, borderRadius: 10, overflow: 'hidden', backgroundColor: colores.grisFondo },
  fotoSubiendo: { alignItems: 'center', justifyContent: 'center' },
  quitar: { position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(15,23,42,0.75)', alignItems: 'center', justifyContent: 'center' },
  tomar: { width: 84, height: 84, borderRadius: 10, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colores.primario, alignItems: 'center', justifyContent: 'center' },
  faltan: { fontSize: 12.5, color: colores.textoSecundario, textAlign: 'center' },
});
