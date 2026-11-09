import { useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ErrorApi } from '@/api/cliente';
import { nombreDeCodigo, obtenerCatalogo } from '@/api/catalogos';
import { cambiarEstadoEquipo, obtenerOpcionesEquipoNuevoConRespaldo, registrarEquipoNuevo } from '@/api/ruta';
import { Aviso } from '@/componentes/Aviso';
import { Boton } from '@/componentes/Boton';
import { CamaraApp } from '@/componentes/CamaraApp';
import { CampoTexto } from '@/componentes/CampoTexto';
import { EncabezadoApp } from '@/componentes/EncabezadoApp';
import { Selector } from '@/componentes/Selector';
import { useConsulta } from '@/hooks/useConsulta';
import { useDiseno } from '@/hooks/useDiseno';
import { useSesion } from '@/sesion/SesionContext';
import { colores, radios } from '@/tema/colores';
import { validarEquipoNuevo } from '@/utilidades/objetivos';

/**
 * HU-07 — Equipo nuevo (NEW).
 * Para un equipo que no está en la lista de la O/S: N/S, código, marca, modelo, tipo de equipo, ubicación y la foto de la placa (solo cámara),
 * todo obligatorio. "Registrar y seleccionar" lo registra y empieza a trabajar en él. Queda pendiente de aprobación en la intranet, que asigna el COD TW
 * definitivo. Registrar exige conexión (sube la foto y avisa al área); las listas de marca y tipo se guardan para abrir el formulario sin señal.
 */
export default function PantallaEquipoNuevo() {
  const { sesion } = useSesion();
  const usuario = sesion?.usuario;
  const d = useDiseno();
  const params = useLocalSearchParams<{ id?: string; objetivo?: string }>();
  const idOs = Number(params.id);
  const idValido = Number.isInteger(idOs) && idOs > 0;

  const [serie, setSerie] = useState('');
  const [codigo, setCodigo] = useState('');
  const [marca, setMarca] = useState<string | null>(null);
  const [modelo, setModelo] = useState('');
  const [idTipo, setIdTipo] = useState<string | null>(null);
  const [ubicacion, setUbicacion] = useState('');
  const [foto, setFoto] = useState<string | null>(null);
  const [camara, setCamara] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [intento, setIntento] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: 'error' | 'info'; texto: string } | null>(null);

  const { datos, cargando, error } = useConsulta(async (token) => {
    if (!idValido) throw new ErrorApi('Servicio no válido.', 400, 1);
    const [opciones, cargos] = await Promise.all([
      obtenerOpcionesEquipoNuevoConRespaldo(token, usuario?.idUsuario ?? 0, idOs),
      obtenerCatalogo(token, 'CARGO_USUARIO').catch(() => undefined),
    ]);
    return { opciones: opciones.datos, cargos };
  }, `${params.id ?? ''}`);

  const cargo = nombreDeCodigo(datos?.cargos, usuario?.cargo) ?? usuario?.cargo ?? 'Técnico de Campo';
  const marcas = useMemo(() => (datos?.opciones.marcas ?? []).map((m) => ({ valor: m, texto: m })), [datos]);
  const tipos = useMemo(() => (datos?.opciones.tipos ?? []).map((t) => ({ valor: String(t.idSuministro), texto: t.descripcion })), [datos]);

  const errores = validarEquipoNuevo({ numeroSerie: serie, codigo, marca, modelo, idSuministro: idTipo ? Number(idTipo) : null, ubicacion, foto });

  async function registrar() {
    setIntento(true);
    setMensaje(null);
    if (Object.keys(errores).length > 0 || !sesion || !marca || !idTipo || !foto) {
      return setMensaje({ tipo: 'error', texto: 'Completa todos los campos y toma la foto de la placa.' });
    }
    setEnviando(true);
    try {
      const r = await registrarEquipoNuevo(sesion.token, idOs, {
        numeroSerie: serie,
        codigo,
        marca,
        modelo,
        idSuministro: Number(idTipo),
        ubicacion,
        fotoUri: foto,
      });
      // "Registrar y seleccionar": se empieza a trabajar en el equipo (si falla, queda en la lista para seleccionarlo)
      let aviso = r.mensaje;
      if (r.datos) {
        try {
          await cambiarEstadoEquipo(sesion.token, idOs, r.datos.idOsEquipo, 'iniciar', { capturadoEn: new Date().toISOString() });
        } catch (e) {
          aviso = `${r.mensaje} No se pudo iniciar el trabajo: ${e instanceof Error ? e.message : 'selecciónalo desde la lista.'}`;
        }
      }
      setMensaje({ tipo: 'info', texto: aviso });
      router.replace({ pathname: '/objetivos', params: { id: String(idOs), v: String(Date.now()) } });
    } catch (e) {
      setMensaje({
        tipo: 'error',
        texto:
          e instanceof ErrorApi && e.estadoHttp === 0
            ? 'Sin conexión: el equipo nuevo se registra con señal (se sube la foto de la placa y se avisa al área). Inténtalo cuando vuelva la señal.'
            : e instanceof Error
              ? e.message
              : 'No se pudo registrar el equipo.',
      });
    } finally {
      setEnviando(false);
    }
  }

  const mostrar = (campo: keyof typeof errores) => (intento ? errores[campo] ?? null : null);

  return (
    <SafeAreaView style={estilos.area} edges={['top']}>
      <EncabezadoApp nombre={usuario?.nombre ?? ''} apellido={usuario?.apellido} subtitulo={`${usuario?.nombre ?? ''} · ${cargo}`} />
      <ScrollView contentContainerStyle={[estilos.contenido, { paddingHorizontal: d.margen, maxWidth: d.anchoMaximo }]} keyboardShouldPersistTaps="handled">
        <View style={estilos.tituloFila}>
          <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Volver">
            <Ionicons name="arrow-back" size={24} color={colores.titulo} />
          </Pressable>
          <Text style={[estilos.titulo, { fontSize: d.tituloPantalla }]} accessibilityRole="header">
            Equipo nuevo
          </Text>
        </View>
        <Text style={estilos.subtitulo}>
          O/S {String(idOs)}
          {params.objetivo ? ` · Objetivo ${params.objetivo}` : ''}
        </Text>

        <View style={estilos.info}>
          <Ionicons name="information-circle-outline" size={20} color={colores.primario} />
          <Text style={estilos.infoTexto}>Usa esta opción solo si el equipo no está en la lista de la O/S.</Text>
        </View>

        {cargando ? (
          <ActivityIndicator color={colores.primario} style={{ marginTop: 30 }} />
        ) : error || !datos ? (
          <View style={{ marginTop: 12 }}>
            <Aviso tipo="error" mensaje={error ?? 'No se pudo cargar el formulario.'} />
          </View>
        ) : (
          <View style={{ marginTop: 16 }}>
            <View style={estilos.fila}>
              <View style={{ flex: 1 }}>
                <CampoTexto etiqueta="N/S *" value={serie} onChangeText={(t) => setSerie(t.slice(0, 80))} autoCapitalize="characters" error={mostrar('numeroSerie')} testID="nuevo-serie" />
              </View>
              <View style={{ flex: 1 }}>
                <CampoTexto etiqueta="Código *" value={codigo} onChangeText={(t) => setCodigo(t.slice(0, 80))} autoCapitalize="characters" error={mostrar('codigo')} testID="nuevo-codigo" />
              </View>
            </View>

            <View style={estilos.fila}>
              <View style={{ flex: 1 }}>
                <Selector etiqueta="Marca *" placeholder="Selecciona" opciones={marcas} valor={marca} onCambio={setMarca} conBusqueda testID="nuevo-marca" />
                {!!mostrar('marca') && <Text style={estilos.error}>{mostrar('marca')}</Text>}
              </View>
              <View style={{ flex: 1 }}>
                <CampoTexto etiqueta="Modelo *" value={modelo} onChangeText={(t) => setModelo(t.slice(0, 80))} error={mostrar('modelo')} testID="nuevo-modelo" />
              </View>
            </View>

            <View style={{ marginBottom: 18 }}>
              <Selector etiqueta="Tipo de equipo *" placeholder="Selecciona" opciones={tipos} valor={idTipo} onCambio={setIdTipo} conBusqueda testID="nuevo-tipo" />
              {!!mostrar('idSuministro') && <Text style={estilos.error}>{mostrar('idSuministro')}</Text>}
            </View>

            <CampoTexto etiqueta="Ubicación *" value={ubicacion} onChangeText={(t) => setUbicacion(t.slice(0, 200))} error={mostrar('ubicacion')} autoCapitalize="sentences" testID="nuevo-ubicacion" />

            <Text style={estilos.etiqueta}>Foto de la placa *</Text>
            {foto ? (
              <View style={{ gap: 10 }}>
                <Image source={{ uri: foto }} style={estilos.foto} resizeMode="cover" accessibilityLabel="Foto de la placa" />
                <Boton titulo="Volver a tomar" variante="secundario" onPress={() => setCamara(true)} />
              </View>
            ) : (
              <Pressable onPress={() => setCamara(true)} style={estilos.tomarFoto} accessibilityRole="button" testID="nuevo-foto">
                <Ionicons name="camera-outline" size={22} color={colores.primario} />
                <Text style={estilos.tomarFotoTexto}>Tomar foto (solo cámara)</Text>
              </Pressable>
            )}
            {!!mostrar('foto') && <Text style={estilos.error}>{mostrar('foto')}</Text>}

            <Text style={estilos.nota}>
              <Ionicons name="information-circle-outline" size={13} /> El COD TW lo asigna la intranet al aprobar el registro.
            </Text>

            {mensaje && (
              <View style={{ marginTop: 12 }} testID="mensaje-nuevo">
                <Aviso tipo={mensaje.tipo} mensaje={mensaje.texto} />
              </View>
            )}

            <View style={{ marginTop: 16 }}>
              <Boton titulo="Registrar y seleccionar" onPress={() => void registrar()} cargando={enviando} />
            </View>
          </View>
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
  tituloFila: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4 },
  titulo: { fontWeight: '700', color: colores.titulo, flexShrink: 1 },
  subtitulo: { color: colores.textoSecundario, fontSize: 14, marginBottom: 12 },
  info: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colores.primarioSuave, borderRadius: radios.tarjeta, padding: 14 },
  infoTexto: { flex: 1, color: colores.titulo, fontSize: 14.5 },
  fila: { flexDirection: 'row', gap: 12, marginBottom: 18 },
  etiqueta: { fontSize: 15, fontWeight: '600', color: colores.titulo, marginBottom: 8 },
  error: { color: colores.error, fontSize: 13, marginTop: 6 },
  tomarFoto: {
    minHeight: 52,
    borderRadius: radios.campo,
    borderWidth: 1.5,
    borderColor: colores.primario,
    backgroundColor: colores.blanco,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  tomarFotoTexto: { color: colores.primario, fontWeight: '600', fontSize: 15.5 },
  foto: { width: '100%', height: 200, borderRadius: radios.campo, backgroundColor: colores.grisFondo },
  nota: { marginTop: 10, fontSize: 13, color: colores.textoSecundario },
});
