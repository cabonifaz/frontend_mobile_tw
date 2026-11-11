import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ErrorApi } from '@/api/cliente';
import { nombreDeCodigo, obtenerCatalogo } from '@/api/catalogos';
import { accionEquipoOEncolar } from '@/api/colaEquipos';
import { llegadaPendiente, sincronizarLlegadas } from '@/api/colaLlegadas';
import { obtenerResumenFirmas } from '@/api/firmas';
import { horaRespaldo } from '@/api/respaldo';
import { obtenerLlegadaConRespaldo, obtenerObjetivosConRespaldo, type AccionEquipo, type ObjetivoEquipo, type Objetivos } from '@/api/ruta';
import { Aviso } from '@/componentes/Aviso';
import { Boton } from '@/componentes/Boton';
import { CambiosEquipo, EtiquetaAvance } from '@/componentes/CambiosEquipo';
import { EncabezadoApp } from '@/componentes/EncabezadoApp';
import { FilaTiempos, duracion } from '@/componentes/FilaTiempos';
import { useAccionesEquipos } from '@/hooks/useAccionesEquipos';
import { useConsulta } from '@/hooks/useConsulta';
import { useDiseno } from '@/hooks/useDiseno';
import { useSesion } from '@/sesion/SesionContext';
import { colores, radios } from '@/tema/colores';
import { fechaCorta, horaDe } from '@/utilidades/formato';
import { aplicarPendientes, descripcionObjetivo, lineaIdentificacion, tituloObjetivo } from '@/utilidades/objetivos';

/**
 * HU-07 — Objetivos de hoy.
 *  - Contadores Completados / Pendientes / Observados y tiempos del técnico (llegada, traslado, en planta, estimado).
 *  - Los equipos de la OS numerados ("1. MC · 60 min") con su estado: POR INICIAR, EJECUTANDO o PAUSADO.
 *  - POR INICIAR → "Seleccionar equipo e iniciar" (buscar, escanear su código o registrar uno nuevo). EJECUTANDO → "Pausar" (con motivo) y
 *    "Trabajar en el equipo" (HU-08: las 5 etapas del equipo). PAUSADO → "Reanudar", bloqueado cuando espera la aprobación de un supervisor ("Esperando aprobación de supervisor").
 *  - "Ver detalles": la modificación anterior y la actual del equipo.
 *  - HU-06 Hard Stop: sin llegada registrada, un candado rojo bloquea los objetivos. Se decide con la llegada de HU-06 (la registrada en el servidor
 *    o la confirmada sin conexión que aún no se envió), antes de pedir los objetivos.
 *  - Sin conexión: se muestra la última lista guardada y lo que el técnico inicia, pausa o reanuda queda guardado en el teléfono (`colaEquipos`).
 */
export default function PantallaObjetivos() {
  const { sesion } = useSesion();
  const usuario = sesion?.usuario;
  const idUsuario = usuario?.idUsuario ?? 0;
  const d = useDiseno();
  const params = useLocalSearchParams<{ id?: string; v?: string }>();
  const idOs = Number(params.id);
  const idValido = Number.isInteger(idOs) && idOs > 0;

  const { datos, cargando, recargando, error, recargar } = useConsulta(async (token) => {
    if (!idValido) throw new ErrorApi('Servicio no válido.', 400, 1);
    // Hard Stop: sin llegada (ni registrada ni guardada en el teléfono) no se piden los objetivos
    const llegada = await obtenerLlegadaConRespaldo(token, idUsuario, idOs);
    const guardada = await llegadaPendiente(idUsuario, idOs);
    if (!llegada.datos.llegada && !guardada) return { base: null, cargos: undefined, sinLlegada: true, esperandoLlegada: false, sinConexion: false, guardadoEn: null as Date | null, estadoOs: llegada.datos.estadoOs };
    // Llegada confirmada sin conexión y aún sin enviar: se intenta enviar ya (el back no entrega objetivos sin la llegada registrada)
    if (!llegada.datos.llegada && guardada) await sincronizarLlegadas(token, idUsuario).catch(() => undefined);
    try {
      const [r, cargos] = await Promise.all([obtenerObjetivosConRespaldo(token, idUsuario, idOs), obtenerCatalogo(token, 'CARGO_USUARIO').catch(() => undefined)]);
      return { base: r.datos, cargos, sinLlegada: false, esperandoLlegada: false, sinConexion: r.sinConexion, guardadoEn: r.guardadoEn as Date | null, estadoOs: llegada.datos.estadoOs };
    } catch (e) {
      // La llegada sigue guardada en el teléfono (sin señal): los objetivos se cargan en cuanto se registre
      if (!llegada.datos.llegada && guardada && e instanceof ErrorApi) {
        return { base: null, cargos: undefined, sinLlegada: false, esperandoLlegada: true, sinConexion: false, guardadoEn: null as Date | null, estadoOs: llegada.datos.estadoOs };
      }
      throw e;
    }
  }, `${params.id ?? ''}|${params.v ?? ''}`);

  // HU-17: acceso a la firma de informes cuando la OS ya tiene informes generados (consulta ligera: si falla, simplemente no se muestra)
  const { datos: firmas, recargar: recargarFirmas } = useConsulta(async (token) => (idValido ? obtenerResumenFirmas(token, idOs) : null), `firmas|${params.id ?? ''}`);

  // Al volver de "Seleccionar equipo" se relee. El Hard Stop solo se muestra con la pantalla enfocada
  // (las pestañas quedan montadas: sin esto el candado seguiría encima de otras pantallas).
  const primeraVez = useRef(true);
  const [enfocada, setEnfocada] = useState(true);
  useFocusEffect(
    useCallback(() => {
      setEnfocada(true);
      if (primeraVez.current) primeraVez.current = false;
      else {
        void recargar();
        void recargarFirmas();
      }
      return () => setEnfocada(false);
    }, [recargar, recargarFirmas]),
  );

  const pendientes = useAccionesEquipos(idUsuario, idOs);
  const [actualizados, setActualizados] = useState<Objetivos | null>(null);
  const [abierto, setAbierto] = useState<number | null>(null);
  const [pausando, setPausando] = useState<number | null>(null);
  const [motivo, setMotivo] = useState('');
  const [ocupado, setOcupado] = useState<number | null>(null);
  const [mensaje, setMensaje] = useState<{ tipo: 'error' | 'info'; texto: string } | null>(null);

  const sinLlegada = datos?.sinLlegada === true;
  const base = actualizados && datos?.base && actualizados.resumen.idOs === datos.base.resumen.idOs && !recargando ? actualizados : (datos?.base ?? null);
  // Lo guardado sin conexión se ve ya aplicado
  const o = useMemo(() => (base ? aplicarPendientes(base, pendientes) : null), [base, pendientes]);
  const cargo = nombreDeCodigo(datos?.cargos, usuario?.cargo) ?? usuario?.cargo ?? 'Técnico de Campo';
  const hardStop = !!o && !o.resumen.llegadaRegistrada;

  async function accion(e: ObjetivoEquipo, a: AccionEquipo, motivoPausa?: string) {
    if (!sesion || !o || ocupado) return;
    setOcupado(e.idOsEquipo);
    setMensaje(null);
    try {
      const r = await accionEquipoOEncolar(
        sesion.token,
        { idUsuario, idOs, numeroOs: o.resumen.numeroOs, equipo: e.codigoCliente?.trim() || e.numeroSerie?.trim() || e.nombre },
        o,
        e.idOsEquipo,
        a,
        motivoPausa,
      );
      if (r.estado === 'enviada') {
        if (r.objetivos) setActualizados(r.objetivos);
        else await recargar();
        setMensaje({ tipo: 'info', texto: r.mensaje });
      } else {
        setMensaje({
          tipo: 'info',
          texto: r.conConexion
            ? 'Guardado en el teléfono: se enviará en unos segundos.'
            : 'Sin conexión: guardado en el teléfono. Se enviará solo cuando vuelva la señal.',
        });
      }
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
            Objetivos de hoy
          </Text>
        </View>

        {cargando ? (
          <ActivityIndicator color={colores.primario} style={{ marginTop: 40 }} />
        ) : sinLlegada ? (
          <Text style={estilos.subtitulo}>Registra tu llegada a la planta para ver los objetivos del servicio.</Text>
        ) : datos?.esperandoLlegada ? (
          <Aviso mensaje="Tu llegada está guardada en el teléfono y se enviará al volver la señal. Los objetivos se cargan en cuanto se registre: desliza hacia abajo para actualizar." />
        ) : error || !o ? (
          <Aviso tipo="error" mensaje={error ?? 'No se encontró el servicio.'} />
        ) : (
          <>
            <Text style={estilos.subtitulo}>
              {[o.resumen.cliente, o.resumen.sede].filter(Boolean).join(' – ')} · O/S {o.resumen.numeroOs.replace(/^OS-?/i, '')}
            </Text>

            {datos?.sinConexion && datos.guardadoEn && (
              <View style={{ marginBottom: 10 }} testID="aviso-sin-conexion">
                <Aviso mensaje={`Sin conexión: se muestra lo último guardado (${horaRespaldo(datos.guardadoEn)}).`} />
              </View>
            )}
            {pendientes.length > 0 && (
              <View style={{ marginBottom: 10 }} testID="aviso-pendientes">
                <Aviso
                  mensaje={`${pendientes.length === 1 ? '1 acción guardada' : `${pendientes.length} acciones guardadas`} en el teléfono: se ${pendientes.length === 1 ? 'enviará' : 'enviarán'} al volver la señal.`}
                />
              </View>
            )}

            <View style={estilos.contadores} testID="contadores">
              <Contador valor={o.contadores.completados} texto="Completados" color={colores.verde} />
              <Contador valor={o.contadores.pendientes} texto="Pendientes" color={colores.primario} />
              <Contador valor={o.contadores.observados} texto={o.contadores.observados === 1 ? 'Observado' : 'Observados'} color={colores.rojo} />
            </View>

            {!!firmas && firmas.completos > 0 && (
              <Pressable
                onPress={() => router.push({ pathname: '/firma-informes', params: { id: String(idOs) } })}
                style={estilos.accesoFirma}
                accessibilityRole="button"
                testID="acceso-firma-informes"
              >
                <Ionicons name="create-outline" size={24} color={colores.primario} />
                <View style={{ flex: 1 }}>
                  <Text style={estilos.accesoFirmaTitulo}>Firma de informes</Text>
                  <Text style={estilos.accesoFirmaTexto}>{firmas.cerrado ? 'Servicio cerrado' : `${firmas.firmados} de ${firmas.informes} informes firmados · Constancia de servicio`}</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colores.textoSecundario} />
              </Pressable>
            )}

            <View style={{ marginTop: 10 }}>
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

            {mensaje && (
              <View style={{ marginTop: 12 }} testID="mensaje-objetivos">
                <Aviso tipo={mensaje.tipo} mensaje={mensaje.texto} />
              </View>
            )}

            <Text style={estilos.seccion}>OBJETIVOS · O/S {o.resumen.numeroOs.replace(/^OS-?/i, '')}</Text>

            {o.equipos.length === 0 ? (
              <Aviso mensaje="La orden de servicio no tiene equipos asignados." />
            ) : (
              o.equipos.map((e) => (
                <TarjetaObjetivo
                  key={e.idOsEquipo}
                  e={e}
                  abierto={abierto === e.idOsEquipo}
                  onDetalles={() => setAbierto((v) => (v === e.idOsEquipo ? null : e.idOsEquipo))}
                  ocupado={ocupado === e.idOsEquipo}
                  pausando={pausando === e.idOsEquipo}
                  motivo={motivo}
                  onMotivo={setMotivo}
                  onSeleccionar={() => router.push({ pathname: '/seleccionar-equipo', params: { id: String(idOs), objetivo: String(e.numero) } })}
                  onReanudar={() => void accion(e, 'reanudar')}
                  onTrabajar={() => router.push({ pathname: '/trabajo-equipo', params: { id: String(idOs), equipo: String(e.idOsEquipo) } })}
                  onPausar={() => {
                    setMensaje(null);
                    setPausando(e.idOsEquipo);
                  }}
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
        visible={(hardStop || sinLlegada) && !cargando && enfocada}
        enRuta={(o?.resumen.estadoOs ?? datos?.estadoOs) === 'en_ruta'}
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
  abierto: boolean;
  onDetalles: () => void;
  ocupado: boolean;
  pausando: boolean;
  motivo: string;
  onMotivo: (t: string) => void;
  onSeleccionar: () => void;
  onReanudar: () => void;
  onTrabajar: () => void;
  onPausar: () => void;
  onConfirmarPausa: () => void;
  onCancelarPausa: () => void;
}) {
  const { e } = props;
  const supervision = e.estado === 'pausado' && e.requiereAprobacion;
  const enEjecucion = e.estado === 'en_ejecucion';
  const pausado = e.estado === 'pausado';
  const excedido = e.tiempoEstimadoMin !== null && e.tiempoRealMin > e.tiempoEstimadoMin;
  const avance = e.tiempoEstimadoMin ? Math.min(1, e.tiempoRealMin / e.tiempoEstimadoMin) : 0;
  const iniciado = e.iniciadoEn ? `Iniciado ${fechaCorta(e.iniciadoEn)} ${horaDe(e.iniciadoEn)}` : null;
  return (
    <View
      style={[
        estilos.tarjeta,
        enEjecucion && estilos.tarjetaActiva,
        pausado && estilos.tarjetaPausada,
        e.estado === 'observado' && estilos.tarjetaObservada,
      ]}
      testID={`objetivo-${e.idOsEquipo}`}
    >
      <View style={estilos.cabeceraTarjeta}>
        <Text style={[estilos.nombre, { flex: 1 }]}>{tituloObjetivo(e)}</Text>
        <EtiquetaAvance estado={e.estado} />
      </View>
      <Text style={estilos.descripcion}>{descripcionObjetivo(e)}</Text>
      {e.faltaEquipo ? (
        <Text style={estilos.falta}>— FALTA EQUIPO/INSTRUMENTO —</Text>
      ) : (
        <Text style={estilos.nota}>{lineaIdentificacion(e)}</Text>
      )}
      {e.enCampo && <Text style={estilos.nota}>Equipo nuevo · pendiente de aprobación en la intranet</Text>}
      {!!iniciado && <Text style={estilos.nota}>{iniciado}</Text>}

      {(enEjecucion || (pausado && e.tiempoRealMin > 0)) && e.tiempoEstimadoMin !== null && (
        <View style={estilos.barra}>
          <View style={[estilos.barraRelleno, { width: `${Math.round(avance * 100)}%` }, excedido && { backgroundColor: colores.rojo }]} />
        </View>
      )}

      {e.bloqueado && (
        <View style={{ marginTop: 10 }}>
          <Aviso tipo="error" mensaje="Equipo bloqueado o en evaluación. Comunícate con Operaciones." />
        </View>
      )}

      {pausado && !!e.motivoPausa && (
        <View style={[estilos.aviso, supervision ? estilos.avisoAmbar : estilos.avisoGris]}>
          <Text style={[estilos.avisoTitulo, { color: supervision ? '#92400E' : colores.titulo }]}>
            {supervision ? 'Esperando aprobación de supervisor' : 'Pausado'}
          </Text>
          <Text style={{ color: supervision ? '#B45309' : colores.textoSecundario }}>Motivo: {e.motivoPausa}</Text>
        </View>
      )}

      {e.cambios.length > 0 && (
        <>
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
        </>
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
              <Boton titulo="Pausar" onPress={props.onConfirmarPausa} cargando={props.ocupado} deshabilitado={props.motivo.trim().length < 3 || props.ocupado} />
            </View>
          </View>
        </View>
      ) : (
        <View style={{ marginTop: 12, gap: 10 }}>
          {(e.estado === 'por_iniciar' || e.estado === 'observado') && !e.faltaEquipo && (
            <Boton titulo="Seleccionar equipo e iniciar" onPress={props.onSeleccionar} deshabilitado={!e.puedeIniciar} />
          )}
          {enEjecucion && (
            <View style={estilos.botonesFila}>
              <Pressable
                onPress={props.onPausar}
                disabled={!e.puedePausar || props.ocupado}
                style={[estilos.pausar, (!e.puedePausar || props.ocupado) && { opacity: 0.45 }]}
                accessibilityRole="button"
                testID={`pausar-${e.idOsEquipo}`}
              >
                <Ionicons name="pause" size={18} color={colores.primario} />
                <Text style={estilos.pausarTexto}>Pausar</Text>
              </Pressable>
              <View style={{ flex: 1 }}>
                <Boton titulo="Trabajar en el equipo" onPress={props.onTrabajar} />
              </View>
            </View>
          )}
          {pausado && (
            <Pressable
              onPress={props.onReanudar}
              disabled={!e.puedeReanudar || props.ocupado}
              style={[estilos.reanudar, e.puedeReanudar ? estilos.reanudarActivo : estilos.reanudarBloqueado]}
              accessibilityRole="button"
              accessibilityState={{ disabled: !e.puedeReanudar }}
              testID={`reanudar-${e.idOsEquipo}`}
            >
              {!e.puedeReanudar && <Ionicons name="lock-closed-outline" size={18} color={colores.textoTenue} />}
              {props.ocupado ? (
                <ActivityIndicator color={colores.blanco} />
              ) : (
                <Text style={[estilos.reanudarTexto, !e.puedeReanudar && { color: colores.textoTenue }]}>Reanudar</Text>
              )}
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
          <View style={estilos.candado}>
            <Ionicons name="lock-closed" size={30} color={colores.rojo} />
          </View>
          <Text style={[estilos.modalTitulo, { color: colores.rojoEtiquetaTexto }]}>Sin marca de llegada</Text>
          <Text style={estilos.modalTexto}>Primero registra tu llegada a planta antes de acceder a los objetivos.</Text>
          <View style={{ alignSelf: 'stretch', gap: 10, marginTop: 16 }}>
            {enRuta && <Boton titulo="Registrar llegada" onPress={onRegistrar} />}
            <Boton titulo="Volver al servicio" variante="secundario" onPress={onVolver} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const estilos = StyleSheet.create({
  area: { flex: 1, backgroundColor: colores.fondo },
  candado: { width: 64, height: 64, borderRadius: 32, backgroundColor: colores.rojoEtiquetaFondo, alignItems: 'center', justifyContent: 'center' },
  contenido: { paddingTop: 18, paddingBottom: 28, width: '100%', alignSelf: 'center' },
  tituloFila: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4 },
  titulo: { fontWeight: '700', color: colores.titulo, flexShrink: 1 },
  subtitulo: { color: colores.textoSecundario, fontSize: 14, marginBottom: 12 },
  seccion: { marginTop: 18, fontSize: 12.5, fontWeight: '700', letterSpacing: 1.4, color: colores.textoSecundario },
  contadores: { flexDirection: 'row', gap: 8 },
  accesoFirma: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colores.primarioSuave, borderWidth: 1, borderColor: '#BFDBFE', borderRadius: radios.tarjeta, padding: 14, marginTop: 10 },
  accesoFirmaTitulo: { fontSize: 16.5, fontWeight: '800', color: colores.titulo },
  accesoFirmaTexto: { fontSize: 13.5, color: colores.textoSecundario, marginTop: 2 },
  contador: { flex: 1, backgroundColor: colores.blanco, borderWidth: 1, borderColor: colores.bordeSuave, borderRadius: 12, paddingVertical: 10, alignItems: 'center' },
  contadorValor: { fontSize: 22, fontWeight: '700' },
  contadorTexto: { fontSize: 12.5, color: colores.textoSecundario },
  tarjeta: { marginTop: 12, backgroundColor: colores.blanco, borderWidth: 1, borderColor: colores.bordeSuave, borderRadius: radios.tarjeta, padding: 16 },
  tarjetaActiva: { borderColor: '#BFDBFE' },
  tarjetaPausada: { borderLeftWidth: 5, borderLeftColor: '#F59E0B' },
  tarjetaObservada: { borderLeftWidth: 5, borderLeftColor: colores.rojo },
  cabeceraTarjeta: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  nombre: { fontSize: 17, fontWeight: '700', color: colores.titulo },
  descripcion: { fontSize: 15, color: colores.texto, marginTop: 4 },
  nota: { fontSize: 13, color: colores.textoSecundario, marginTop: 3 },
  falta: { fontSize: 14, fontWeight: '800', color: colores.rojo, marginTop: 6 },
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
  pausar: {
    minHeight: 50,
    paddingHorizontal: 18,
    borderRadius: radios.boton,
    borderWidth: 1.5,
    borderColor: colores.primario,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  pausarTexto: { color: colores.primario, fontWeight: '600', fontSize: 15.5 },
  reanudar: { minHeight: 50, borderRadius: radios.boton, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  reanudarActivo: { backgroundColor: colores.primario },
  reanudarBloqueado: { backgroundColor: '#DDE3EC' },
  reanudarTexto: { color: colores.blanco, fontWeight: '600', fontSize: 16 },
  velo: { flex: 1, backgroundColor: 'rgba(15,23,42,0.55)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  modal: { backgroundColor: colores.blanco, borderRadius: 16, padding: 22, alignItems: 'center', width: '100%', maxWidth: 380 },
  modalTitulo: { fontSize: 19, fontWeight: '700', color: colores.titulo, marginTop: 8 },
  modalTexto: { fontSize: 14.5, color: colores.textoSecundario, textAlign: 'center', marginTop: 6, lineHeight: 20 },
});
