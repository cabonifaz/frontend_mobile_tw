import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { obtenerAprobacionLlegada, resolverAprobacionLlegada } from '@/api/aprobaciones';
import { nombreDeCodigo, obtenerCatalogo } from '@/api/catalogos';
import { ErrorApi } from '@/api/cliente';
import { Aviso } from '@/componentes/Aviso';
import { Boton } from '@/componentes/Boton';
import { EncabezadoApp } from '@/componentes/EncabezadoApp';
import { EtiquetaEstado } from '@/componentes/EtiquetaEstado';
import { MapaEsquematico } from '@/componentes/MapaEsquematico';
import { useConsulta } from '@/hooks/useConsulta';
import { useDiseno } from '@/hooks/useDiseno';
import { useSesion } from '@/sesion/SesionContext';
import { colores, radios } from '@/tema/colores';
import { inicialesDe } from '@/utilidades/aprobaciones';
import { textoDistancia } from '@/utilidades/llegada';
import { diaMesHora } from '@/utilidades/viaticos';

/**
 * HU-06 / HU-31 — Llegada forzada: el técnico quedó fuera del radio permitido tras volver a capturar su ubicación y pide registrar su llegada.
 *  - El jefe ve quién es, a cuántos metros de la planta está, cuántas veces capturó su ubicación y el mapa (planta y técnico).
 *  - "Autorizar llegada" pide una condición y "Rechazar" el motivo (obligatorios). Solo tras autorizarla el técnico puede registrar la llegada, una vez.
 *  - El técnico recibe la notificación al instante y la decisión queda en la auditoría (lo hace el back).
 * Se abre desde Aprobaciones o desde la notificación (?id = id de la OS).
 */
type Decision = 'aprobar' | 'rechazar' | null;
const MAX_TEXTO = 500;

export default function PantallaAprobacionLlegada() {
  const { sesion } = useSesion();
  const usuario = sesion?.usuario;
  const d = useDiseno();
  const params = useLocalSearchParams<{ id?: string }>();
  const idOs = Number(params.id);
  const idValido = Number.isInteger(idOs) && idOs > 0;

  const { datos, cargando, recargando, error, recargar } = useConsulta(async (token) => {
    if (!idValido) throw new ErrorApi('Solicitud no válida.', 400, 1);
    const [solicitud, cargos] = await Promise.all([obtenerAprobacionLlegada(token, idOs), obtenerCatalogo(token, 'CARGO_USUARIO').catch(() => null)]);
    return { solicitud, cargos };
  }, params.id ?? '');

  const [decision, setDecision] = useState<Decision>(null);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [fallo, setFallo] = useState<string | null>(null);
  const [resultado, setResultado] = useState<string | null>(null);

  const cargo = nombreDeCodigo(datos?.cargos, usuario?.cargo) ?? usuario?.cargo ?? 'Jefe de Área';
  const s = datos?.solicitud ?? null;
  const pendiente = s?.estado === 'pendiente';

  function abrirDecision(tipo: Exclude<Decision, null>) {
    setTexto('');
    setFallo(null);
    setDecision(tipo);
  }

  async function confirmar() {
    if (!sesion || !decision || enviando) return;
    const limpio = texto.trim();
    if (limpio.length < 3) {
      setFallo(decision === 'aprobar' ? 'Indica la condición con la que autorizas la llegada.' : 'Indica el motivo por el que no autorizas la llegada.');
      return;
    }
    setEnviando(true);
    setFallo(null);
    try {
      const mensaje = await resolverAprobacionLlegada(sesion.token, idOs, decision === 'aprobar', limpio);
      setDecision(null);
      setResultado(mensaje);
      setTimeout(() => router.back(), 1200);
    } catch (e) {
      setFallo(e instanceof ErrorApi ? e.message : 'No se pudo registrar tu decisión. Inténtalo de nuevo.');
    } finally {
      setEnviando(false);
    }
  }

  const planta = s && s.latPlanta !== null && s.lonPlanta !== null ? { latitud: s.latPlanta, longitud: s.lonPlanta } : null;
  const tecnico = s && s.latitud !== null && s.longitud !== null ? { latitud: s.latitud, longitud: s.longitud } : null;

  return (
    <SafeAreaView style={estilos.area} edges={['top']}>
      <EncabezadoApp nombre={usuario?.nombre ?? ''} apellido={usuario?.apellido} subtitulo={`${usuario?.nombre ?? ''} · ${cargo}`} />

      <ScrollView
        contentContainerStyle={[estilos.contenido, { paddingHorizontal: d.margen, maxWidth: d.anchoMaximo }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={recargando} onRefresh={recargar} colors={[colores.primario]} />}
      >
        <View style={estilos.tituloFila}>
          <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Volver">
            <Ionicons name="arrow-back" size={24} color={colores.titulo} />
          </Pressable>
          <Text style={estilos.titulo} accessibilityRole="header">
            Llegada forzada
          </Text>
        </View>
        {!!s && <Text style={estilos.subtitulo}>{s.area ? `${s.area} · según la RQ` : 'Según la RQ del servicio'}</Text>}

        {cargando ? (
          <ActivityIndicator color={colores.primario} style={{ marginTop: 32 }} />
        ) : error ? (
          <Aviso tipo="error" mensaje={error} />
        ) : !s ? (
          <Aviso tipo="error" mensaje="No se encontró la solicitud de llegada." />
        ) : (
          <>
            <View style={estilos.tarjeta} testID="llegada-solicitud">
              <View style={estilos.quienFila}>
                <View style={estilos.avatar}>
                  <Text style={estilos.avatarTexto}>{inicialesDe(s.tecnico)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={estilos.tecnico} numberOfLines={2}>
                    {s.tecnico ?? 'Técnico'}
                  </Text>
                  <Text style={estilos.solicito}>Pide registrar su llegada{s.solicitadaEn ? ` · ${diaMesHora(s.solicitadaEn)}` : ''}</Text>
                </View>
                {s.estado === 'pendiente' ? (
                  <EtiquetaEstado estado="pendiente" texto="PENDIENTE" />
                ) : s.estado === 'aprobada' ? (
                  <EtiquetaEstado estado="conforme" texto="AUTORIZADA" />
                ) : (
                  <EtiquetaEstado estado="bloqueado" texto="RECHAZADA" />
                )}
              </View>
              <View style={estilos.datos}>
                <Dato titulo="OS" valor={s.numeroOs} />
                <Dato titulo="CLIENTE" valor={s.cliente ?? '—'} />
                <Dato titulo="PLANTA" valor={s.sede ?? '—'} />
                <Dato
                  titulo="DISTANCIA A LA PLANTA"
                  valor={s.distanciaMetros !== null ? `${textoDistancia(s.distanciaMetros)} (permitido ${s.radioMetros} m)` : '—'}
                />
                <Dato titulo="INTENTOS DE CAPTURA" valor={String(s.intentos)} />
                <Dato titulo="PRECISIÓN GPS" valor={s.precisionMetros !== null ? `± ${Math.round(s.precisionMetros)} m` : '—'} />
              </View>
            </View>

            {!!planta && !!tecnico && (
              <View style={{ marginTop: 14 }} testID="llegada-mapa">
                <MapaEsquematico
                  alto={220}
                  vacio=""
                  pines={[
                    { clave: 'planta', ...planta, texto: 'CL', color: '#0F172A', tamano: 34, etiqueta: 'Planta del cliente' },
                    { clave: 'tecnico', ...tecnico, texto: 'TC', color: colores.naranja, tamano: 36, etiqueta: 'Técnico' },
                  ]}
                  trayecto={[tecnico, planta]}
                />
                <Text style={estilos.leyenda}>CL planta · TC dónde está el técnico · ┅ distancia en línea recta</Text>
              </View>
            )}

            {!!s.motivo && (
              <View style={estilos.motivo} testID="llegada-motivo">
                <Ionicons name="chatbubble-ellipses-outline" size={18} color={colores.primario} />
                <Text style={estilos.motivoTexto}>
                  <Text style={{ fontWeight: '800' }}>Motivo del técnico: </Text>“{s.motivo}”
                </Text>
              </View>
            )}

            {!pendiente && (
              <View style={{ marginTop: 14 }}>
                <Aviso
                  tipo="info"
                  mensaje={`${s.estado === 'aprobada' ? 'Autorizada' : 'Rechazada'}${s.jefe ? ` por ${s.jefe}` : ''}${s.resueltaEn ? ` · ${diaMesHora(s.resueltaEn)}` : ''}${s.comentario ? `: “${s.comentario}”` : '.'}`}
                />
              </View>
            )}
            {!!resultado && (
              <View style={{ marginTop: 14 }} testID="llegada-resultado">
                <Aviso tipo="info" mensaje={resultado} />
              </View>
            )}

            {pendiente && !resultado && (
              <View style={estilos.botones}>
                <View style={{ flex: 1 }}>
                  <Boton titulo="Rechazar" variante="secundario" onPress={() => abrirDecision('rechazar')} />
                </View>
                <View style={{ flex: 1 }}>
                  <Boton titulo="Autorizar llegada" onPress={() => abrirDecision('aprobar')} />
                </View>
              </View>
            )}
          </>
        )}
      </ScrollView>

      <Modal
        visible={decision !== null}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!enviando) setDecision(null);
        }}
      >
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={estilos.fondoModal}>
          <View style={estilos.modal} testID="llegada-dialogo">
            <Ionicons
              name={decision === 'aprobar' ? 'checkmark-circle' : 'close-circle'}
              size={44}
              color={decision === 'aprobar' ? colores.verde : colores.rojo}
              style={{ alignSelf: 'center' }}
            />
            <Text style={estilos.modalTitulo}>{decision === 'aprobar' ? 'Autorizar llegada' : 'Rechazar llegada'}</Text>
            <Text style={estilos.modalSub}>
              {decision === 'aprobar'
                ? `${s?.tecnico ?? 'El técnico'} podrá registrar su llegada aunque esté a ${s?.distanciaMetros !== null && s ? textoDistancia(s.distanciaMetros ?? 0) : 'más de lo permitido'} de la planta (una sola vez).`
                : `${s?.tecnico ?? 'El técnico'} no podrá registrar su llegada hasta acercarse a la planta y verá tu motivo.`}
            </Text>
            <Text style={estilos.modalCampo}>{decision === 'aprobar' ? 'Condición o comentario *' : 'Motivo del rechazo *'}</Text>
            <TextInput
              value={texto}
              onChangeText={setTexto}
              placeholder={decision === 'aprobar' ? 'Ej.: Confirmado con el cliente, el acceso está en la otra calle.' : 'Ej.: Acércate a la puerta principal de la planta.'}
              placeholderTextColor={colores.placeholder}
              maxLength={MAX_TEXTO}
              multiline
              editable={!enviando}
              style={estilos.entrada}
              testID="llegada-texto"
            />
            <Text style={estilos.contador}>
              {texto.length}/{MAX_TEXTO}
            </Text>
            {!!fallo && <Aviso tipo="error" mensaje={fallo} />}
            <View style={estilos.botones}>
              <View style={{ flex: 1 }}>
                <Boton titulo="Cancelar" variante="secundario" onPress={() => setDecision(null)} deshabilitado={enviando} />
              </View>
              <View style={{ flex: 1 }}>
                <Boton titulo={decision === 'aprobar' ? 'Autorizar' : 'Rechazar'} onPress={confirmar} cargando={enviando} deshabilitado={texto.trim().length < 3} />
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

function Dato({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <View style={estilos.dato}>
      <Text style={estilos.datoTitulo}>{titulo}</Text>
      <Text style={estilos.datoValor}>{valor}</Text>
    </View>
  );
}

const estilos = StyleSheet.create({
  area: { flex: 1, backgroundColor: colores.fondo },
  contenido: { padding: 16, paddingBottom: 28, maxWidth: 560, width: '100%', alignSelf: 'center' },
  tituloFila: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  titulo: { fontSize: 24, fontWeight: '700', color: colores.titulo, flexShrink: 1 },
  subtitulo: { fontSize: 14, color: colores.textoSecundario, marginTop: 4, marginBottom: 14, marginLeft: 34 },
  tarjeta: { backgroundColor: colores.tarjeta, borderRadius: radios.tarjeta, borderWidth: 1, borderColor: colores.bordeSuave, padding: 16, gap: 14 },
  quienFila: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#EA580C', alignItems: 'center', justifyContent: 'center' },
  avatarTexto: { color: colores.blanco, fontWeight: '800', fontSize: 15 },
  tecnico: { fontSize: 17, fontWeight: '800', color: colores.titulo },
  solicito: { fontSize: 12.5, color: colores.textoSecundario, marginTop: 1 },
  datos: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  dato: { width: '47%', flexGrow: 1, gap: 2 },
  datoTitulo: { fontSize: 10.5, fontWeight: '700', letterSpacing: 0.8, color: colores.textoSecundario },
  datoValor: { fontSize: 14.5, color: colores.titulo, lineHeight: 20 },
  leyenda: { fontSize: 12, color: colores.textoSecundario, marginTop: 6 },
  motivo: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: colores.tarjeta,
    borderRadius: radios.campo,
    borderWidth: 1,
    borderColor: colores.bordeSuave,
    padding: 12,
    marginTop: 14,
  },
  motivoTexto: { flex: 1, fontSize: 13.5, lineHeight: 19, color: colores.texto },
  botones: { flexDirection: 'row', gap: 12, marginTop: 16 },
  fondoModal: { flex: 1, backgroundColor: 'rgba(11,31,58,0.55)', justifyContent: 'center', padding: 20 },
  modal: { backgroundColor: colores.tarjeta, borderRadius: 18, padding: 20, gap: 10, maxWidth: 520, width: '100%', alignSelf: 'center' },
  modalTitulo: { fontSize: 19, fontWeight: '800', color: colores.titulo, textAlign: 'center' },
  modalSub: { fontSize: 13.5, lineHeight: 19, color: colores.textoSecundario, textAlign: 'center' },
  modalCampo: { fontSize: 13.5, fontWeight: '700', color: colores.titulo, marginTop: 4 },
  entrada: {
    borderWidth: 1,
    borderColor: colores.borde,
    borderRadius: radios.campo,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 84,
    fontSize: 14.5,
    color: colores.texto,
    textAlignVertical: 'top',
  },
  contador: { alignSelf: 'flex-end', fontSize: 11.5, color: colores.textoTenue, marginTop: -4 },
});
