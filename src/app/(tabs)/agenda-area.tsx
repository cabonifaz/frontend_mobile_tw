import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import {
  obtenerAgendaArea,
  obtenerDetalleConflicto,
  resolverConflicto,
  type ConflictoAgenda,
  type DetalleConflictoAgenda,
  type ServicioAgenda,
} from '@/api/agendaArea';
import { nombreDeCodigo, obtenerCatalogo } from '@/api/catalogos';
import { Aviso } from '@/componentes/Aviso';
import { Boton } from '@/componentes/Boton';
import { EncabezadoApp } from '@/componentes/EncabezadoApp';
import { useConsulta } from '@/hooks/useConsulta';
import { useDiseno } from '@/hooks/useDiseno';
import { useRefrescoAutomatico } from '@/hooks/useRefrescoAutomatico';
import { useSesion } from '@/sesion/SesionContext';
import { colores, radios } from '@/tema/colores';
import { fechaLimaHoy } from '@/utilidades/agenda';
import {
  ESTADOS_AGENDA,
  MAX_COMENTARIO_AGENDA,
  cabeceraDia,
  errorMover,
  estiloEstadoAgenda,
  estiloNivelCarga,
  moverSemana,
  textoDiaConflicto,
  textoSemana,
} from '@/utilidades/agendaArea';

/**
 * HU-37 — Agenda y carga del área (Jefe de Área): la agenda semanal de su equipo en tres vistas — Semana (técnico × día, con color por estado), Día y Carga (horas y nivel por día) —,
 * el aviso de conflictos (un técnico con dos servicios en el mismo horario) y su resolución rápida: cambiar de técnico (con una sugerencia), cambiar el horario o reprogramar con motivo.
 * La programación completa sigue en la intranet. El alcance (qué técnicos ve) y el circuito de la resolución (al instante o como solicitud) los decide el back.
 */
type Vista = 'semana' | 'dia' | 'carga';
type Accion = 'tecnico' | 'horario' | 'reprogramar' | null;
const VISTAS: { id: Vista; texto: string }[] = [
  { id: 'semana', texto: 'Semana' },
  { id: 'dia', texto: 'Día' },
  { id: 'carga', texto: 'Carga' },
];

export default function PantallaAgendaArea() {
  const { sesion } = useSesion();
  const usuario = sesion?.usuario;
  const token = sesion?.token ?? '';
  const d = useDiseno();
  const hoy = fechaLimaHoy();

  const [desde, setDesde] = useState<string | null>(null);
  const [vista, setVista] = useState<Vista>('semana');
  const [diaSel, setDiaSel] = useState<string | null>(null);
  const [resultado, setResultado] = useState<string | null>(null);

  const { datos, cargando, recargando, error, recargar } = useConsulta(async (tk) => {
    const [r, cargos] = await Promise.all([obtenerAgendaArea(tk, desde), obtenerCatalogo(tk, 'CARGO_USUARIO').catch(() => undefined)]);
    return { ...r, cargos };
  }, desde ?? 'actual');
  useRefrescoAutomatico(recargar, datos?.kpis.refrescoSegundos ?? 30);

  // Resolver conflicto
  const [conflicto, setConflicto] = useState<ConflictoAgenda | null>(null);
  const [detalle, setDetalle] = useState<DetalleConflictoAgenda | null>(null);
  const [cargandoDet, setCargandoDet] = useState(false);
  const [accion, setAccion] = useState<Accion>(null);
  const [fecha, setFecha] = useState('');
  const [horaInicio, setHoraInicio] = useState('');
  const [horaFin, setHoraFin] = useState('');
  const [idMotivo, setIdMotivo] = useState<number | null>(null);
  const [comentario, setComentario] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [fallo, setFallo] = useState<string | null>(null);

  const cargo = nombreDeCodigo(datos?.cargos, usuario?.cargo) ?? usuario?.cargo ?? 'Jefe de Área';
  const tecnicos = datos?.tecnicos ?? [];
  const fechas = tecnicos[0]?.dias.map((x) => x.fecha) ?? [];
  const dia = diaSel && fechas.includes(diaSel) ? diaSel : (fechas.includes(hoy) ? hoy : (fechas[0] ?? null));
  const objetivo = detalle?.servicios.find((s) => s.objetivo) ?? detalle?.servicios[detalle.servicios.length - 1] ?? null;

  async function abrirConflicto(c: ConflictoAgenda) {
    setConflicto(c);
    setDetalle(null);
    setAccion(null);
    setFallo(null);
    setComentario('');
    setIdMotivo(null);
    setCargandoDet(true);
    try {
      const det = await obtenerDetalleConflicto(token, c);
      setDetalle(det);
      const o = det.servicios.find((s) => s.objetivo) ?? det.servicios[det.servicios.length - 1];
      setFecha(o?.fecha ?? c.fecha ?? hoy);
      setHoraInicio(o?.horaInicio ?? '');
      setHoraFin(o?.horaFin ?? '');
    } catch (e) {
      setFallo(e instanceof Error ? e.message : 'No se pudo cargar el conflicto.');
    } finally {
      setCargandoDet(false);
    }
  }

  const formMover = { fecha, horaInicio, horaFin, idMotivo, comentario, conMotivo: accion === 'reprogramar', fechaConflicto: objetivo?.fecha ?? conflicto?.fecha ?? null, hoy };
  const errorForm = accion === 'horario' || accion === 'reprogramar' ? errorMover(formMover) : null;

  async function confirmar() {
    if (!conflicto || !accion || enviando) return;
    if (accion === 'tecnico' && !detalle?.sugerido) return setFallo('No hay un técnico sugerido disponible. Cambia el horario o reprograma.');
    if (errorForm) return setFallo(errorForm);
    setEnviando(true);
    setFallo(null);
    try {
      const base = {
        tipo: conflicto.tipo,
        idTecnico: conflicto.idTecnico,
        idOsA: conflicto.idOsA ?? 0,
        idOsB: conflicto.idOsB,
        idOsObjetivo: objetivo?.idOs ?? null,
        idMotivo,
        comentario: comentario.trim() || null,
      };
      const r = await resolverConflicto(
        token,
        accion === 'tecnico'
          ? { ...base, opcion: 'reasignar', idNuevoTecnico: detalle!.sugerido!.idUsuario, fecha: null, horaInicio: null, horaFin: null, idMotivo: null }
          : {
              ...base,
              opcion: 'reprogramar',
              idNuevoTecnico: null,
              fecha: accion === 'reprogramar' ? fecha.trim() : (objetivo?.fecha ?? conflicto.fecha ?? fecha).trim(),
              horaInicio: horaInicio.trim(),
              horaFin: horaFin.trim(),
              idMotivo: accion === 'reprogramar' ? idMotivo : null,
            },
      );
      setConflicto(null);
      setResultado(r.datos?.modo === 'solicitud' ? `${r.mensaje} Quedó como solicitud pendiente de aprobación.` : r.mensaje);
      await recargar();
    } catch (e) {
      setFallo(e instanceof Error ? e.message : 'No se pudo resolver el conflicto.');
    } finally {
      setEnviando(false);
    }
  }

  function Tarjeta({ s }: { s: ServicioAgenda }) {
    const e = estiloEstadoAgenda(s.conflicto ? 'conflicto' : s.estado);
    const c = datos?.conflictos.find((x) => x.idOsA === s.idOs || x.idOsB === s.idOs);
    return (
      <Pressable
        onPress={() => (s.conflicto && c ? void abrirConflicto(c) : undefined)}
        disabled={!s.conflicto || !c}
        style={[estilos.servicio, { backgroundColor: e.fondo, borderLeftColor: e.color }]}
        accessibilityRole={s.conflicto ? 'button' : 'text'}
        accessibilityLabel={`${s.numeroOs} ${s.cliente ?? ''}`}
      >
        <Text style={[estilos.servicioCodigo, { color: e.color }]} numberOfLines={1}>
          {s.codigo}
        </Text>
        <Text style={estilos.servicioCliente} numberOfLines={1}>
          {s.cliente ?? ''}
        </Text>
      </Pressable>
    );
  }

  return (
    <SafeAreaView style={estilos.area} edges={['top']}>
      <EncabezadoApp nombre={usuario?.nombre ?? ''} apellido={usuario?.apellido} subtitulo={`${usuario?.nombre ?? ''} · ${cargo}`} />
      <ScrollView
        contentContainerStyle={[estilos.contenido, { paddingHorizontal: d.margen, maxWidth: d.anchoMaximo }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={recargando} onRefresh={() => void recargar()} colors={[colores.primario]} />}
      >
        <View style={estilos.tituloFila}>
          <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Volver">
            <Ionicons name="arrow-back" size={24} color={colores.titulo} />
          </Pressable>
          <Text style={[estilos.titulo, { fontSize: d.tituloPantalla }]} accessibilityRole="header">
            Agenda del área
          </Text>
        </View>
        <Text style={estilos.subtitulo}>Solo lectura y ajustes rápidos · la programación completa sigue en la intranet</Text>

        <View style={estilos.navegacion}>
          <Pressable onPress={() => setDesde(moverSemana(datos?.desde ?? hoy, -1))} hitSlop={10} accessibilityRole="button" accessibilityLabel="Semana anterior">
            <Ionicons name="chevron-back" size={26} color={colores.titulo} />
          </Pressable>
          <Text style={estilos.semana} testID="agenda-semana">
            {datos ? textoSemana(datos.desde, datos.hasta) : '—'}
          </Text>
          <Pressable onPress={() => setDesde(moverSemana(datos?.desde ?? hoy, 1))} hitSlop={10} accessibilityRole="button" accessibilityLabel="Semana siguiente">
            <Ionicons name="chevron-forward" size={26} color={colores.titulo} />
          </Pressable>
        </View>

        <View style={estilos.vistas}>
          {VISTAS.map((v) => (
            <Pressable key={v.id} onPress={() => setVista(v.id)} style={[estilos.vista, vista === v.id && estilos.vistaActiva]} accessibilityRole="button" accessibilityState={{ selected: vista === v.id }} testID={`agenda-vista-${v.id}`}>
              <Text style={[estilos.vistaTexto, vista === v.id && { color: colores.blanco }]}>{v.texto}</Text>
            </Pressable>
          ))}
        </View>

        {!!resultado && (
          <View style={{ marginTop: 12 }} testID="agenda-resultado">
            <Aviso tipo="info" mensaje={resultado} />
          </View>
        )}

        {cargando ? (
          <ActivityIndicator color={colores.primario} style={{ marginTop: 36 }} />
        ) : error ? (
          <View style={{ marginTop: 14 }}>
            <Aviso tipo="error" mensaje={error} />
          </View>
        ) : tecnicos.length === 0 ? (
          <Text style={estilos.vacio}>No hay técnicos en tu equipo.</Text>
        ) : (
          <>
            {vista === 'semana' && (
              <View style={estilos.matriz} testID="agenda-matriz">
                <View style={estilos.filaMatriz}>
                  <View style={estilos.colNombre} />
                  {fechas.map((f) => (
                    <Text key={f} style={[estilos.cabDia, f === hoy && { color: colores.primario }]}>
                      {cabeceraDia(f)}
                    </Text>
                  ))}
                </View>
                {tecnicos.map((t) => (
                  <View key={t.idUsuario} style={[estilos.filaMatriz, estilos.filaTecnico]}>
                    <View style={estilos.colNombre}>
                      <Text style={estilos.nombreTecnico} numberOfLines={2}>
                        {t.nombreCorto}
                      </Text>
                    </View>
                    {t.dias.map((x) => (
                      <View key={x.fecha} style={[estilos.celda, x.conflicto && estilos.celdaConflicto]}>
                        {x.servicios.map((s) => (
                          <Tarjeta key={`${s.idOs}-${s.horaInicio}`} s={s} />
                        ))}
                      </View>
                    ))}
                  </View>
                ))}
                <View style={estilos.leyenda}>
                  {ESTADOS_AGENDA.map((e) => (
                    <View key={e.estado} style={estilos.leyendaItem}>
                      <View style={[estilos.leyendaPunto, { backgroundColor: e.color }]} />
                      <Text style={estilos.leyendaTexto}>{e.texto}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {vista === 'dia' && (
              <View style={{ marginTop: 12, gap: 10 }} testID="agenda-dia">
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={estilos.diasChips}>
                  {fechas.map((f) => (
                    <Pressable key={f} onPress={() => setDiaSel(f)} style={[estilos.chipDia, dia === f && estilos.chipDiaActivo]} accessibilityRole="button" accessibilityState={{ selected: dia === f }}>
                      <Text style={[estilos.chipDiaTexto, dia === f && { color: colores.blanco }]}>{cabeceraDia(f)}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
                {tecnicos.map((t) => {
                  const x = t.dias.find((y) => y.fecha === dia);
                  return (
                    <View key={t.idUsuario} style={estilos.tarjetaTecnico}>
                      <View style={estilos.cabeceraTecnico}>
                        <Text style={estilos.nombreLargo}>{t.nombre}</Text>
                        {!!x && <Text style={estilos.horas}>{x.horas > 0 ? `${x.horas} h` : 'Libre'}</Text>}
                      </View>
                      {!x || x.servicios.length === 0 ? (
                        <Text style={estilos.sinServicio}>Sin servicios este día.</Text>
                      ) : (
                        x.servicios.map((s) => {
                          const e = estiloEstadoAgenda(s.conflicto ? 'conflicto' : s.estado);
                          const c = datos?.conflictos.find((z) => z.idOsA === s.idOs || z.idOsB === s.idOs);
                          return (
                            <Pressable
                              key={`${s.idOs}-${s.horaInicio}`}
                              onPress={() => (s.conflicto && c ? void abrirConflicto(c) : undefined)}
                              disabled={!s.conflicto || !c}
                              style={[estilos.filaServicio, { borderLeftColor: e.color }]}
                              accessibilityRole={s.conflicto ? 'button' : 'text'}
                            >
                              <View style={{ flex: 1 }}>
                                <Text style={estilos.filaServicioTitulo} numberOfLines={1}>
                                  {s.numeroOs}
                                  {s.cliente ? ` · ${s.cliente}` : ''}
                                </Text>
                                <Text style={estilos.filaServicioMeta}>
                                  {[s.horaInicio && s.horaFin ? `${s.horaInicio} – ${s.horaFin}` : null, s.tipoServicio].filter(Boolean).join(' · ')}
                                </Text>
                              </View>
                              <View style={[estilos.badge, { backgroundColor: e.fondo }]}>
                                <Text style={[estilos.badgeTexto, { color: e.color }]}>{e.texto.toUpperCase()}</Text>
                              </View>
                            </Pressable>
                          );
                        })
                      )}
                    </View>
                  );
                })}
              </View>
            )}

            {vista === 'carga' && (
              <View style={{ marginTop: 12, gap: 10 }} testID="agenda-carga">
                {tecnicos.map((t) => {
                  const nivel = estiloNivelCarga(t.nivel);
                  return (
                    <View key={t.idUsuario} style={estilos.tarjetaTecnico}>
                      <View style={estilos.cabeceraTecnico}>
                        <Text style={estilos.nombreLargo}>{t.nombre}</Text>
                        <Text style={estilos.horas}>{t.horasSemana} h</Text>
                      </View>
                      <View style={estilos.barras}>
                        {t.dias.map((x) => {
                          const n = estiloNivelCarga(x.nivel);
                          return (
                            <View key={x.fecha} style={estilos.barraDia}>
                              <View style={estilos.barraFondo}>
                                <View style={[estilos.barraRelleno, { height: `${Math.min(100, (x.horas / 10) * 100)}%`, backgroundColor: n.color }]} />
                              </View>
                              <Text style={estilos.barraHoras}>{x.horas > 0 ? x.horas : '–'}</Text>
                              <Text style={estilos.barraEtiqueta}>{cabeceraDia(x.fecha).split(' ')[0]}</Text>
                            </View>
                          );
                        })}
                      </View>
                      <Text style={estilos.utilizacion}>
                        Utilización {t.utilizacionPct} % · <Text style={{ color: nivel.color, fontWeight: '800' }}>{nivel.texto}</Text>
                      </Text>
                    </View>
                  );
                })}
              </View>
            )}

            {/* Conflictos */}
            {datos!.conflictos.map((c) => (
              <View key={c.clave} style={estilos.banner} testID={`agenda-conflicto-${c.clave}`}>
                <Ionicons name="swap-vertical" size={22} color="#B91C1C" />
                <View style={{ flex: 1 }}>
                  <Text style={estilos.bannerTexto}>
                    <Text style={{ fontWeight: '800' }}>1 conflicto: </Text>
                    {c.detalle ?? `${c.titulo} · ${c.tecnico}${c.fecha ? ` · ${textoDiaConflicto(c.fecha)}` : ''}`}
                  </Text>
                  {c.puedeResolver ? (
                    <Pressable onPress={() => void abrirConflicto(c)} accessibilityRole="button" hitSlop={8} testID={`agenda-resolver-${c.clave}`}>
                      <Text style={estilos.bannerEnlace}>Resolver</Text>
                    </Pressable>
                  ) : (
                    <Text style={estilos.bannerNota}>Lo resuelve quien programa, en la intranet.</Text>
                  )}
                </View>
              </View>
            ))}
          </>
        )}
      </ScrollView>

      {/* Conflicto de programación */}
      <Modal visible={conflicto !== null} transparent animationType="fade" onRequestClose={() => { if (!enviando) setConflicto(null); }}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={estilos.fondoModal}>
          <View style={estilos.modal} testID="agenda-dialogo">
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
              <Ionicons name="swap-vertical" size={34} color={colores.rojo} style={{ alignSelf: 'center' }} />
              <Text style={estilos.modalTitulo}>Conflicto de programación</Text>
              {!!conflicto && (
                <Text style={estilos.modalSub}>
                  {conflicto.tecnico}
                  {conflicto.fecha ? ` · ${textoDiaConflicto(conflicto.fecha)}` : ''}
                </Text>
              )}
              {cargandoDet ? (
                <ActivityIndicator color={colores.primario} />
              ) : !detalle ? (
                !!fallo && <Aviso tipo="error" mensaje={fallo} />
              ) : (
                <>
                  {detalle.servicios.map((s) => (
                    <View key={s.idOs} style={[estilos.servicioConf, s.objetivo && { borderLeftColor: colores.rojo }]}>
                      <Text style={estilos.servicioConfTitulo}>
                        {s.numeroOs}
                        {s.cliente ? ` · ${s.cliente}` : ''}
                      </Text>
                      <Text style={estilos.servicioConfMeta}>{[s.horaInicio && s.horaFin ? `${s.horaInicio} – ${s.horaFin}` : null, s.tipoServicio].filter(Boolean).join(' · ')}</Text>
                    </View>
                  ))}
                  {detalle.modo === 'solicitud' && <Aviso tipo="info" mensaje="Tu cambio se enviará como solicitud: el Jefe de Operaciones debe aprobarlo." />}

                  <Text style={estilos.campo}>RESOLVER</Text>
                  <Opcion icono="swap-horizontal" texto={detalle.sugerido ? `Cambiar técnico · sugerido ${detalle.sugerido.nombre}` : 'Cambiar técnico (sin sugerencia disponible)'} activa={accion === 'tecnico'} primaria onPress={() => { setAccion('tecnico'); setFallo(null); }} deshabilitada={!detalle.sugerido} testID="agenda-op-tecnico" />
                  <Opcion icono="time-outline" texto={`Cambiar horario de ${objetivo?.numeroOs ?? 'la orden'}`} activa={accion === 'horario'} onPress={() => { setAccion('horario'); setFallo(null); }} testID="agenda-op-horario" />
                  <Opcion icono="calendar-outline" texto={`Reprogramar ${objetivo?.numeroOs ?? 'la orden'} (con motivo)`} activa={accion === 'reprogramar'} onPress={() => { setAccion('reprogramar'); setFallo(null); }} testID="agenda-op-reprogramar" />

                  {accion === 'tecnico' && !!detalle.sugerido && (
                    <Text style={estilos.nota}>
                      {objetivo?.numeroOs} pasará a {detalle.sugerido.nombre}
                      {detalle.sugerido.detalle ? ` (${detalle.sugerido.detalle})` : ''}. Se avisa a los técnicos.
                    </Text>
                  )}

                  {(accion === 'horario' || accion === 'reprogramar') && (
                    <>
                      {accion === 'reprogramar' && (
                        <>
                          <Text style={estilos.campo}>Nueva fecha (AAAA-MM-DD) *</Text>
                          <TextInput value={fecha} onChangeText={setFecha} placeholder="2026-11-20" placeholderTextColor={colores.placeholder} maxLength={10} autoCapitalize="none" style={estilos.entrada} testID="agenda-fecha" />
                        </>
                      )}
                      <View style={estilos.dosCampos}>
                        <View style={{ flex: 1 }}>
                          <Text style={estilos.campo}>Inicio (HH:MM) *</Text>
                          <TextInput value={horaInicio} onChangeText={setHoraInicio} placeholder="09:00" placeholderTextColor={colores.placeholder} maxLength={5} style={estilos.entrada} testID="agenda-inicio" />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={estilos.campo}>Fin (HH:MM) *</Text>
                          <TextInput value={horaFin} onChangeText={setHoraFin} placeholder="12:00" placeholderTextColor={colores.placeholder} maxLength={5} style={estilos.entrada} testID="agenda-fin" />
                        </View>
                      </View>
                      {accion === 'reprogramar' && (
                        <>
                          <Text style={estilos.campo}>Motivo *</Text>
                          <View style={estilos.chips}>
                            {detalle.motivos.map((m) => (
                              <Pressable key={m.id} onPress={() => setIdMotivo(m.id)} style={[estilos.chip, idMotivo === m.id && estilos.chipActivo]} accessibilityRole="button" accessibilityState={{ selected: idMotivo === m.id }}>
                                <Text style={[estilos.chipTexto, idMotivo === m.id && { color: colores.blanco }]}>{m.nombre}</Text>
                              </Pressable>
                            ))}
                          </View>
                        </>
                      )}
                    </>
                  )}

                  {!!accion && (
                    <>
                      <Text style={estilos.campo}>Comentario (opcional)</Text>
                      <TextInput
                        value={comentario}
                        onChangeText={setComentario}
                        placeholder={detalle.motivoSugerido ?? 'Ej.: Se cruza con otro servicio del técnico.'}
                        placeholderTextColor={colores.placeholder}
                        maxLength={MAX_COMENTARIO_AGENDA}
                        multiline
                        style={[estilos.entrada, { minHeight: 64, textAlignVertical: 'top' }]}
                        testID="agenda-comentario"
                      />
                    </>
                  )}
                  {!!fallo && <Aviso tipo="error" mensaje={fallo} />}
                </>
              )}
              <View style={estilos.botones}>
                <View style={{ flex: 1 }}>
                  <Boton titulo="Cancelar" variante="secundario" onPress={() => setConflicto(null)} deshabilitado={enviando} />
                </View>
                {!!detalle && (
                  <View style={{ flex: 1 }}>
                    <Boton titulo="Aplicar" onPress={() => void confirmar()} cargando={enviando} deshabilitado={!accion || !!errorForm || (accion === 'tecnico' && !detalle.sugerido)} />
                  </View>
                )}
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

function Opcion({ icono, texto, activa, primaria, onPress, deshabilitada, testID }: { icono: 'swap-horizontal' | 'time-outline' | 'calendar-outline'; texto: string; activa: boolean; primaria?: boolean; onPress: () => void; deshabilitada?: boolean; testID?: string }) {
  const relleno = primaria && activa;
  return (
    <Pressable
      onPress={onPress}
      disabled={deshabilitada}
      style={[estilos.opcion, activa && estilos.opcionActiva, relleno && { backgroundColor: colores.primario }, deshabilitada && { opacity: 0.45 }]}
      accessibilityRole="button"
      accessibilityState={{ selected: activa, disabled: !!deshabilitada }}
      testID={testID}
    >
      <Ionicons name={icono} size={18} color={relleno ? colores.blanco : colores.primario} />
      <Text style={[estilos.opcionTexto, relleno && { color: colores.blanco }]}>{texto}</Text>
    </Pressable>
  );
}

const estilos = StyleSheet.create({
  area: { flex: 1, backgroundColor: colores.fondo },
  contenido: { paddingTop: 18, paddingBottom: 28, width: '100%', alignSelf: 'center' },
  tituloFila: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 2 },
  titulo: { fontWeight: '800', color: colores.titulo, flexShrink: 1 },
  subtitulo: { color: colores.textoSecundario, fontSize: 13.5, marginBottom: 12 },
  navegacion: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  semana: { fontSize: 17, fontWeight: '800', color: colores.titulo },
  vistas: { flexDirection: 'row', gap: 8, marginTop: 10 },
  vista: { flex: 1, paddingVertical: 10, borderRadius: radios.campo, borderWidth: 1, borderColor: colores.borde, alignItems: 'center', backgroundColor: colores.blanco },
  vistaActiva: { backgroundColor: colores.primario, borderColor: colores.primario },
  vistaTexto: { fontSize: 14.5, fontWeight: '700', color: colores.titulo },
  vacio: { textAlign: 'center', color: colores.textoSecundario, fontSize: 15, marginTop: 30 },
  matriz: { marginTop: 14, gap: 4 },
  filaMatriz: { flexDirection: 'row', gap: 3 },
  filaTecnico: { alignItems: 'stretch' },
  colNombre: { width: 56, justifyContent: 'flex-start', paddingTop: 4 },
  nombreTecnico: { fontSize: 11.5, fontWeight: '700', color: colores.titulo },
  cabDia: { flex: 1, textAlign: 'center', fontSize: 10.5, fontWeight: '700', color: colores.textoSecundario, paddingBottom: 3 },
  celda: { flex: 1, minHeight: 56, borderRadius: 8, backgroundColor: colores.blanco, borderWidth: 1, borderColor: colores.bordeSuave, padding: 2, gap: 2 },
  celdaConflicto: { borderColor: '#FCA5A5' },
  servicio: { borderRadius: 5, borderLeftWidth: 3, paddingHorizontal: 3, paddingVertical: 2 },
  servicioCodigo: { fontSize: 10.5, fontWeight: '800' },
  servicioCliente: { fontSize: 9.5, color: colores.titulo },
  leyenda: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 8 },
  leyendaItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  leyendaPunto: { width: 9, height: 9, borderRadius: 5 },
  leyendaTexto: { fontSize: 12, color: colores.textoSecundario },
  diasChips: { gap: 8 },
  chipDia: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18, borderWidth: 1, borderColor: colores.borde, backgroundColor: colores.blanco },
  chipDiaActivo: { backgroundColor: colores.primario, borderColor: colores.primario },
  chipDiaTexto: { fontSize: 13.5, fontWeight: '700', color: colores.titulo },
  tarjetaTecnico: { backgroundColor: colores.blanco, borderWidth: 1, borderColor: colores.bordeSuave, borderRadius: radios.tarjeta, padding: 12, gap: 8 },
  cabeceraTecnico: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  nombreLargo: { fontSize: 15.5, fontWeight: '800', color: colores.titulo },
  horas: { fontSize: 14, fontWeight: '800', color: colores.titulo },
  sinServicio: { fontSize: 13.5, color: colores.textoSecundario },
  filaServicio: { flexDirection: 'row', alignItems: 'center', gap: 8, borderLeftWidth: 4, paddingLeft: 10, paddingVertical: 4 },
  filaServicioTitulo: { fontSize: 14, fontWeight: '700', color: colores.titulo },
  filaServicioMeta: { fontSize: 12.5, color: colores.textoSecundario, marginTop: 1 },
  badge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  badgeTexto: { fontSize: 10, fontWeight: '800', letterSpacing: 0.3 },
  barras: { flexDirection: 'row', gap: 8, height: 96, alignItems: 'flex-end' },
  barraDia: { flex: 1, alignItems: 'center', gap: 2, height: '100%', justifyContent: 'flex-end' },
  barraFondo: { width: '70%', flex: 1, borderRadius: 6, backgroundColor: '#E2E8F0', justifyContent: 'flex-end', overflow: 'hidden' },
  barraRelleno: { width: '100%', borderRadius: 6 },
  barraHoras: { fontSize: 12, fontWeight: '800', color: colores.titulo },
  barraEtiqueta: { fontSize: 10.5, color: colores.textoSecundario },
  utilizacion: { fontSize: 13.5, color: colores.textoSecundario },
  banner: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA', borderRadius: radios.tarjeta, padding: 12, marginTop: 12 },
  bannerTexto: { fontSize: 14, lineHeight: 20, color: colores.titulo },
  bannerEnlace: { fontSize: 14.5, fontWeight: '800', color: colores.primario, marginTop: 2 },
  bannerNota: { fontSize: 12.5, color: colores.textoSecundario, marginTop: 2 },
  fondoModal: { flex: 1, backgroundColor: 'rgba(11,31,58,0.55)', justifyContent: 'center', padding: 20 },
  modal: { backgroundColor: colores.tarjeta, borderRadius: 18, padding: 20, maxWidth: 520, width: '100%', alignSelf: 'center', maxHeight: '92%' },
  modalTitulo: { fontSize: 19, fontWeight: '800', color: colores.titulo, textAlign: 'center' },
  modalSub: { fontSize: 13.5, color: colores.textoSecundario, textAlign: 'center' },
  servicioConf: { borderLeftWidth: 4, borderLeftColor: colores.primario, backgroundColor: colores.blanco, borderWidth: 1, borderColor: colores.bordeSuave, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9 },
  servicioConfTitulo: { fontSize: 14.5, fontWeight: '800', color: colores.titulo },
  servicioConfMeta: { fontSize: 12.5, color: colores.textoSecundario, marginTop: 1 },
  campo: { fontSize: 12.5, fontWeight: '800', letterSpacing: 0.6, color: colores.textoSecundario, marginTop: 4 },
  opcion: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1.5, borderColor: colores.primario, borderRadius: radios.campo, paddingHorizontal: 12, paddingVertical: 11, backgroundColor: colores.blanco },
  opcionActiva: { backgroundColor: colores.primarioSuave },
  opcionTexto: { flex: 1, fontSize: 14.5, fontWeight: '700', color: colores.primario },
  nota: { fontSize: 13, lineHeight: 18, color: colores.textoSecundario },
  dosCampos: { flexDirection: 'row', gap: 10 },
  entrada: { borderWidth: 1, borderColor: colores.borde, borderRadius: radios.campo, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14.5, color: colores.texto, marginTop: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 18, borderWidth: 1, borderColor: colores.borde, backgroundColor: colores.blanco },
  chipActivo: { backgroundColor: colores.primario, borderColor: colores.primario },
  chipTexto: { fontSize: 13.5, fontWeight: '600', color: colores.titulo },
  botones: { flexDirection: 'row', gap: 12, marginTop: 8 },
});
