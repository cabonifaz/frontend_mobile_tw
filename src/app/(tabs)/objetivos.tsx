import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ErrorApi } from '@/api/cliente';
import { nombreDeCodigo, obtenerCatalogo } from '@/api/catalogos';
import { cambiarEstadoEquipo, obtenerObjetivos, type AccionEquipo, type ObjetivoEquipo, type Objetivos } from '@/api/ruta';
import { Aviso } from '@/componentes/Aviso';
import { Boton } from '@/componentes/Boton';
import { CambiosEquipo, EtiquetaAvance } from '@/componentes/CambiosEquipo';
import { EncabezadoApp } from '@/componentes/EncabezadoApp';
import { FilaTiempos, duracion } from '@/componentes/FilaTiempos';
import { useConsulta } from '@/hooks/useConsulta';
import { useDiseno } from '@/hooks/useDiseno';
import { useSesion } from '@/sesion/SesionContext';
import { colores, radios } from '@/tema/colores';
import { horaDe } from '@/utilidades/formato';

/**
 * HU-07 — Objetivos de hoy.
 *  - Contadores Completados / Pendientes / Observados y tiempos del técnico (llegada, traslado, en planta, estimado).
 *  - Equipos de la OS con su estado (EN EJECUCIÓN, POR INICIAR, PAUSADO…), T. estimado vs T. real.
 *  - "Ver detalles": la modificación anterior y la actual de cada equipo.
 *  - Pausa por supervisión: "Esperando aprobación de supervisor · Motivo: …" (no se puede reanudar).
 *  - HU-06 Hard Stop: sin llegada registrada, un candado rojo bloquea los objetivos (también en el back).
 */
export default function PantallaObjetivos() {
  const { sesion } = useSesion();
  const usuario = sesion?.usuario;
  const d = useDiseno();
  const params = useLocalSearchParams<{ id?: string; v?: string }>();
  const idOs = Number(params.id);
  const idValido = Number.isInteger(idOs) && idOs > 0;

  const { datos, cargando, recargando, error, recargar } = useConsulta(async (token) => {
    if (!idValido) throw new ErrorApi('Servicio no válido.', 400, 1);
    const [objetivos, cargos] = await Promise.all([obtenerObjetivos(token, idOs), obtenerCatalogo(token, 'CARGO_USUARIO')]);
    return { objetivos, cargos };
  }, `${params.id ?? ''}|${params.v ?? ''}`);

  // Al volver de "Seleccionar equipo" se relee. El Hard Stop solo se muestra con la pantalla enfocada
  // (las pestañas quedan montadas: sin esto el candado seguiría encima de otras pantallas).
  const primeraVez = useRef(true);
  const [enfocada, setEnfocada] = useState(true);
  useFocusEffect(
    useCallback(() => {
      setEnfocada(true);
      if (primeraVez.current) primeraVez.current = false;
      else void recargar();
      return () => setEnfocada(false);
    }, [recargar]),
  );

  const [actualizados, setActualizados] = useState<Objetivos | null>(null);
  const [abierto, setAbierto] = useState<number | null>(null);
  const [pausando, setPausando] = useState<number | null>(null);
  const [motivo, setMotivo] = useState('');
  const [ocupado, setOcupado] = useState<number | null>(null);
  const [mensaje, setMensaje] = useState<{ tipo: 'error' | 'info'; texto: string } | null>(null);

  const o = actualizados && datos && actualizados.resumen.idOs === datos.objetivos.resumen.idOs && !recargando ? actualizados : datos?.objetivos ?? null;
  const cargo = nombreDeCodigo(datos?.cargos, usuario?.cargo) ?? usuario?.cargo ?? 'Técnico de Campo';
  const hardStop = !!o && !o.resumen.llegadaRegistrada;

  async function accion(e: ObjetivoEquipo, a: AccionEquipo, motivoPausa?: string) {
    if (!sesion || ocupado) return;
    setOcupado(e.idOsEquipo);
    setMensaje(null);
    try {
      const r = await cambiarEstadoEquipo(sesion.token, idOs, e.idOsEquipo, a, motivoPausa);
      if (r.objetivos) setActualizados(r.objetivos);
      else await recargar();
      setMensaje({ tipo: 'info', texto: r.mensaje });
      setPausando(null);
      setMotivo('');
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err instanceof Error ? err.message : 'No se pudo actualizar el equipo.' });
    } finally {
      setOcupado(null);
    }
  }

  return (
    <SafeAreaView style={estilos.area} edges={['top']}>
      <EncabezadoApp nombre={usuario?.nombre ?? ''} apellido={usuario?.apellido} subtitulo={`${usuario?.nombre ?? ''} · ${cargo}`} />
      <ScrollView
        contentContainerStyle={[estilos.contenido, { paddingHorizontal: d.margen, maxWidth: d.anchoMaximo }]}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={recargando}
            onRefresh={() => {
              setActualizados(null);
              void recargar();
            }}
            colors={[colores.primario]}
          />
        }
      >
        <View style={estilos.tituloFila}>
          <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Volver">
            <Ionicons name="arrow-back" size={24} color={colores.titulo} />
          </Pressable>
          <Text style={[estilos.titulo, { fontSize: d.tituloPantalla }]} accessibilityRole="header">
            Objetivos de Hoy
          </Text>
        </View>

        {cargando ? (
          <ActivityIndicator color={colores.primario} style={{ marginTop: 40 }} />
        ) : error || !o ? (
          <Aviso tipo="error" mensaje={error ?? 'No se encontró el servicio.'} />
        ) : (
          <>
            <Text style={estilos.subtitulo}>
              <Ionicons name="business-outline" size={14} /> {[o.resumen.cliente, o.resumen.sede].filter(Boolean).join(' – ')} · {o.resumen.numeroOs}
            </Text>

            <View style={estilos.contadores} testID="contadores">
              <Contador valor={o.contadores.completados} texto="Completados" color={colores.verde} />
              <Contador valor={o.contadores.pendientes} texto="Pendientes" color={colores.primario} />
              <Contador valor={o.contadores.observados} texto={o.contadores.observados === 1 ? 'Observado' : 'Observados'} color={colores.rojo} />
            </View>

            <View style={{ marginTop: 12 }}>
              <FilaTiempos
                testID="tiempos-planta"
                tiempos={[
                  { etiqueta: 'LLEGADA', valor: horaDe(o.resumen.llegadaEn) },
                  { etiqueta: 'TRASLADO', valor: duracion(o.resumen.trasladoMin) },
                  { etiqueta: 'EN PLANTA', valor: duracion(o.resumen.enPlantaMin) },
                  { etiqueta: 'ESTIMADO', valor: duracion(o.resumen.estimadoMin) },
                ]}
              />
            </View>

            <View style={{ marginTop: 14 }}>
              <Boton
                titulo="Seleccionar equipo (buscar o escanear QR)"
                variante="secundario"
                onPress={() => router.push({ pathname: '/seleccionar-equipo', params: { id: String(idOs) } })}
                deshabilitado={hardStop}
              />
            </View>

            {mensaje && (
              <View style={{ marginTop: 12 }} testID="mensaje-objetivos">
                <Aviso tipo={mensaje.tipo} mensaje={mensaje.texto} />
              </View>
            )}

            {o.equipos.length === 0 ? (
              <View style={{ marginTop: 16 }}>
                <Aviso mensaje="La orden de servicio no tiene equipos asignados." />
              </View>
            ) : (
              o.equipos.map((e, i) => (
                <TarjetaObjetivo
                  key={e.idOsEquipo}
                  e={e}
                  indice={i + 1}
                  abierto={abierto === e.idOsEquipo}
                  onDetalles={() => setAbierto((v) => (v === e.idOsEquipo ? null : e.idOsEquipo))}
                  ocupado={ocupado === e.idOsEquipo}
                  pausando={pausando === e.idOsEquipo}
                  motivo={motivo}
                  onMotivo={setMotivo}
                  onIniciar={() => void accion(e, e.estado === 'pausado' ? 'reanudar' : 'iniciar')}
                  onPausar={() => setPausando(e.idOsEquipo)}
                  onConfirmarPausa={() => void accion(e, 'pausar', motivo)}
                  onCancelarPausa={() => {
                    setPausando(null);
                    setMotivo('');
                  }}
                />
              ))
            )}
          </>
        )}
      </ScrollView>

      <HardStop
        visible={hardStop && !cargando && enfocada}
        enRuta={o?.resumen.estadoOs === 'en_ruta'}
        onVolver={() => router.back()}
        onRegistrar={() => router.replace({ pathname: '/llegada', params: { id: String(idOs) } })}
      />
    </SafeAreaView>
  );
}

function Contador({ valor, texto, color }: { valor: number; texto: string; color: string }) {
  return (
    <View style={estilos.contador}>
      <Text style={[estilos.contadorValor, { color }]}>{valor}</Text>
      <Text style={estilos.contadorTexto} numberOfLines={1}>
        {texto}
      </Text>
    </View>
  );
}

function TarjetaObjetivo(props: {
  e: ObjetivoEquipo;
  indice: number;
  abierto: boolean;
  onDetalles: () => void;
  ocupado: boolean;
  pausando: boolean;
  motivo: string;
  onMotivo: (t: string) => void;
  onIniciar: () => void;
  onPausar: () => void;
  onConfirmarPausa: () => void;
  onCancelarPausa: () => void;
}) {
  const { e } = props;
  const supervision = e.estado === 'pausado' && e.requiereAprobacion;
  const excedido = e.tiempoEstimadoMin !== null && e.tiempoRealMin > e.tiempoEstimadoMin;
  const avance = e.tiempoEstimadoMin ? Math.min(1, e.tiempoRealMin / e.tiempoEstimadoMin) : 0;
  return (
    <View
      style={[estilos.tarjeta, e.estado === 'en_ejecucion' && estilos.tarjetaActiva, (supervision || e.estado === 'observado') && estilos.tarjetaObservada]}
      testID={`objetivo-${e.idOsEquipo}`}
    >
      <View style={estilos.cabeceraTarjeta}>
        <View style={{ flex: 1 }}>
          <Text style={estilos.nombre}>
            {e.nombre} #{String(props.indice).padStart(2, '0')}
          </Text>
          <Text style={estilos.nota}>
            Serie: {e.numeroSerie ?? '—'} | Ubicación: {e.ubicacion ?? '—'}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 4 }}>
          <EtiquetaAvance estado={e.estado} />
          {supervision && <Text style={estilos.observadoTexto}>OBSERVADO</Text>}
        </View>
      </View>

      <View style={estilos.tiempos}>
        <View style={{ flex: 1 }}>
          <Text style={estilos.nota}>T. Estimado</Text>
          <Text style={estilos.tiempoValor}>{e.tiempoEstimadoMin !== null ? `${e.tiempoEstimadoMin} min` : '—'}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={estilos.nota}>T. Real</Text>
          <Text style={[estilos.tiempoValor, excedido && { color: colores.rojo }]}>{e.tiempoRealMin} min</Text>
        </View>
      </View>
      {e.tiempoEstimadoMin !== null && e.estado !== 'por_iniciar' && (
        <View style={estilos.barra}>
          <View style={[estilos.barraRelleno, { width: `${Math.round(avance * 100)}%` }, excedido && { backgroundColor: colores.rojo }]} />
        </View>
      )}

      {e.bloqueado && (
        <View style={{ marginTop: 10 }}>
          <Aviso tipo="error" mensaje="Equipo bloqueado para servicios o fuera de servicio. Comunícate con Operaciones." />
        </View>
      )}

      {e.estado === 'pausado' && !!e.motivoPausa && (
        <View style={[estilos.aviso, supervision ? estilos.avisoAmbar : estilos.avisoGris]}>
          <Text style={[estilos.avisoTitulo, { color: supervision ? '#92400E' : colores.titulo }]}>
            {supervision ? 'Esperando aprobación de supervisor' : 'Pausado'}
          </Text>
          <Text style={{ color: supervision ? '#B45309' : colores.textoSecundario }}>Motivo: {e.motivoPausa}</Text>
        </View>
      )}

      <Pressable
        onPress={props.onDetalles}
        style={estilos.detalles}
        accessibilityRole="button"
        accessibilityState={{ expanded: props.abierto }}
        testID={`detalles-${e.idOsEquipo}`}
      >
        <Text style={estilos.detallesTexto}>{props.abierto ? 'Ocultar detalles' : 'Ver detalles'}</Text>
        <Ionicons name={props.abierto ? 'chevron-up' : 'chevron-down'} size={18} color={colores.primario} />
      </Pressable>
      {props.abierto && (
        <View style={{ marginTop: 10 }}>
          <CambiosEquipo cambios={e.cambios} />
        </View>
      )}

      {props.pausando ? (
        <View style={estilos.pausa}>
          <TextInput
            value={props.motivo}
            onChangeText={props.onMotivo}
            placeholder="Motivo de la pausa"
            placeholderTextColor={colores.placeholder}
            maxLength={300}
            style={estilos.campo}
            testID={`motivo-pausa-${e.idOsEquipo}`}
          />
          <View style={estilos.botonesFila}>
            <View style={{ flex: 1 }}>
              <Boton titulo="Cancelar" variante="secundario" onPress={props.onCancelarPausa} />
            </View>
            <View style={{ flex: 1 }}>
              <Boton titulo="Pausar" onPress={props.onConfirmarPausa} cargando={props.ocupado} deshabilitado={!props.motivo.trim() || props.ocupado} />
            </View>
          </View>
        </View>
      ) : (
        <View style={{ marginTop: 12, gap: 10 }}>
          {e.puedeIniciar && <Boton titulo="Iniciar tarea" onPress={props.onIniciar} cargando={props.ocupado} />}
          {e.puedePausar && <Boton titulo="Pausar" variante="secundario" onPress={props.onPausar} />}
          {e.estado === 'pausado' && (
            <Pressable
              onPress={props.onIniciar}
              disabled={!e.puedeReanudar || props.ocupado}
              style={[estilos.reanudar, !e.puedeReanudar && { opacity: 0.45 }]}
              accessibilityRole="button"
              accessibilityState={{ disabled: !e.puedeReanudar }}
              testID={`reanudar-${e.idOsEquipo}`}
            >
              <Text style={estilos.reanudarTexto}>Reanudar</Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

/** HU-06 Hard Stop: candado rojo que bloquea los objetivos hasta registrar la llegada. */
function HardStop({ visible, enRuta, onVolver, onRegistrar }: { visible: boolean; enRuta: boolean; onVolver: () => void; onRegistrar: () => void }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onVolver}>
      <View style={estilos.velo}>
        <View style={estilos.modal} testID="hard-stop">
          <Ionicons name="lock-closed-outline" size={44} color={colores.rojo} />
          <Text style={estilos.modalTitulo}>No puedes continuar</Text>
          <Text style={estilos.modalTexto}>Primero debes registrar tu llegada a planta antes de acceder a los objetivos.</Text>
          <View style={{ alignSelf: 'stretch', gap: 10, marginTop: 16 }}>
            <Boton titulo="Volver al servicio" onPress={onVolver} />
            {enRuta && <Boton titulo="Registrar llegada" variante="secundario" onPress={onRegistrar} />}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const estilos = StyleSheet.create({
  area: { flex: 1, backgroundColor: colores.fondo },
  contenido: { paddingTop: 18, paddingBottom: 28, width: '100%', alignSelf: 'center' },
  tituloFila: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4 },
  titulo: { fontWeight: '700', color: colores.titulo, flexShrink: 1 },
  subtitulo: { color: colores.textoSecundario, fontSize: 14, marginBottom: 12 },
  contadores: { flexDirection: 'row', gap: 8 },
  contador: { flex: 1, backgroundColor: colores.blanco, borderWidth: 1, borderColor: colores.bordeSuave, borderRadius: 12, paddingVertical: 10, alignItems: 'center' },
  contadorValor: { fontSize: 22, fontWeight: '700' },
  contadorTexto: { fontSize: 12.5, color: colores.textoSecundario },
  tarjeta: { marginTop: 14, backgroundColor: colores.blanco, borderWidth: 1, borderColor: colores.bordeSuave, borderRadius: radios.tarjeta, padding: 16 },
  tarjetaActiva: { borderColor: '#BFDBFE' },
  tarjetaObservada: { borderLeftWidth: 5, borderLeftColor: colores.rojo },
  cabeceraTarjeta: { flexDirection: 'row', gap: 10 },
  nombre: { fontSize: 16, fontWeight: '700', color: colores.titulo },
  nota: { fontSize: 12.5, color: colores.textoSecundario, marginTop: 2 },
  observadoTexto: { color: colores.rojo, fontSize: 11, fontWeight: '800' },
  tiempos: { flexDirection: 'row', marginTop: 10 },
  tiempoValor: { fontSize: 14, fontWeight: '700', color: colores.titulo },
  barra: { height: 6, backgroundColor: colores.grisFondo, borderRadius: 3, overflow: 'hidden', marginTop: 10 },
  barraRelleno: { height: '100%', backgroundColor: colores.primario },
  aviso: { borderRadius: 10, padding: 12, marginTop: 12, borderWidth: 1, gap: 2 },
  avisoAmbar: { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' },
  avisoGris: { backgroundColor: colores.grisFondo, borderColor: colores.bordeSuave },
  avisoTitulo: { fontWeight: '700', fontSize: 14.5 },
  detalles: {
    marginTop: 12,
    minHeight: 42,
    borderRadius: radios.boton,
    borderWidth: 1.5,
    borderColor: colores.primario,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  detallesTexto: { color: colores.primario, fontWeight: '600', fontSize: 14 },
  pausa: { marginTop: 12, gap: 10 },
  campo: { borderWidth: 1, borderColor: colores.borde, borderRadius: radios.campo, backgroundColor: colores.blanco, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colores.texto },
  botonesFila: { flexDirection: 'row', gap: 10 },
  reanudar: { minHeight: 46, borderRadius: radios.boton, borderWidth: 1.5, borderColor: colores.rojo, alignItems: 'center', justifyContent: 'center' },
  reanudarTexto: { color: colores.rojo, fontWeight: '600', fontSize: 16 },
  velo: { flex: 1, backgroundColor: 'rgba(15,23,42,0.55)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  modal: { backgroundColor: colores.blanco, borderRadius: 16, padding: 22, alignItems: 'center', width: '100%', maxWidth: 380 },
  modalTitulo: { fontSize: 19, fontWeight: '700', color: colores.titulo, marginTop: 8 },
  modalTexto: { fontSize: 14.5, color: colores.textoSecundario, textAlign: 'center', marginTop: 6, lineHeight: 20 },
});
