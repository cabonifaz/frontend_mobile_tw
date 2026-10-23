import { useCallback, useRef, useState, type ComponentProps } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ErrorApi } from '@/api/cliente';
import { nombreDeCodigo, obtenerCatalogo } from '@/api/catalogos';
import {
  iniciarTraslado,
  marcarItemChecklist,
  obtenerChecklistSalida,
  solicitarAutorizacionSalida,
  type ChecklistSalida,
  type CodigoManual,
  type ItemChecklist,
} from '@/api/servicios';
import { Aviso } from '@/componentes/Aviso';
import { Boton } from '@/componentes/Boton';
import { EncabezadoApp } from '@/componentes/EncabezadoApp';
import { EtiquetaEstado } from '@/componentes/EtiquetaEstado';
import { useConsulta } from '@/hooks/useConsulta';
import { useDiseno } from '@/hooks/useDiseno';
import { useSesion } from '@/sesion/SesionContext';
import { colores, radios } from '@/tema/colores';
import { hora12 } from '@/utilidades/formato';

/**
 * HU-04 — Validación antes de salir (checklist de pre-salida).
 *  - Ítems manuales (los marca el técnico): expediente, EPP, materiales e insumos, herramientas, pesas patrón.
 *  - Ítems automáticos (salen de la BD): cliente confirmó, SSOMA, OC (no obligatoria), repuestos, alertas.
 *  - Visto bueno del encargado del área según la RQ (Jefe de Servicio Técnico o Jefe de Metrología):
 *    se marca desde la intranet; con él se puede salir con pendientes.
 *  - "Solicitar autorización" solo si hay pendientes. "Iniciar traslado" bloqueado hasta cumplir o tener el visto bueno.
 *  El back vuelve a validar todo al iniciar el traslado: la app no decide sola.
 */
type NombreIcono = ComponentProps<typeof Ionicons>['name'];

const iconos: Record<string, NombreIcono> = {
  expediente: 'document-text-outline',
  cliente_confirmo: 'person-add-outline',
  ssoma: 'shield-checkmark-outline',
  oc: 'document-outline',
  epp: 'body-outline',
  materiales: 'cube-outline',
  herramientas: 'construct-outline',
  pesas_patron: 'barbell-outline',
  repuestos: 'file-tray-stacked-outline',
  alerta: 'warning-outline',
  visto_bueno: 'ribbon-outline',
};

const MAX_MOTIVO = 300;

export default function PantallaChecklistSalida() {
  const { sesion } = useSesion();
  const usuario = sesion?.usuario;
  const d = useDiseno();
  const params = useLocalSearchParams<{ id?: string }>();
  const idOs = Number(params.id);

  const { datos, cargando, recargando, error, recargar } = useConsulta(
    async (token) => {
      if (!Number.isInteger(idOs) || idOs <= 0) throw new ErrorApi('Servicio no válido.', 400, 1);
      const [checklist, cargos] = await Promise.all([obtenerChecklistSalida(token, idOs), obtenerCatalogo(token, 'CARGO_USUARIO')]);
      return { checklist, cargos };
    },
    params.id ?? '',
  );

  // Lo que devuelven las acciones (checklist ya actualizado por el back) reemplaza a lo leído.
  const [actualizado, setActualizado] = useState<ChecklistSalida | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<{ tipo: 'error' | 'info' | 'exito'; texto: string } | null>(null);
  const [pidiendo, setPidiendo] = useState(false);
  const [motivo, setMotivo] = useState('');

  // Esta pantalla queda montada al volver al detalle: al entrar de nuevo se relee
  // (p. ej. para ver el visto bueno que el jefe dio desde la intranet).
  const primeraVez = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (primeraVez.current) {
        primeraVez.current = false;
        return;
      }
      setActualizado(null);
      setMensaje(null);
      void recargar();
    }, [recargar]),
  );

  const cargo = nombreDeCodigo(datos?.cargos, usuario?.cargo) ?? usuario?.cargo ?? 'Técnico de Campo';
  const c: ChecklistSalida | null =
    actualizado && datos?.checklist && actualizado.idOs === datos.checklist.idOs ? actualizado : (datos?.checklist ?? null);

  async function ejecutar(clave: string, accion: () => Promise<{ mensaje: string; checklist: ChecklistSalida | null }>, exito?: boolean) {
    if (ocupado) return;
    setOcupado(clave);
    setMensaje(null);
    try {
      const r = await accion();
      if (r.checklist) setActualizado(r.checklist);
      if (exito) setMensaje({ tipo: 'exito', texto: r.mensaje });
      return true;
    } catch (e) {
      setMensaje({ tipo: 'error', texto: e instanceof ErrorApi ? e.message : 'No se pudo completar la acción.' });
      return false;
    } finally {
      setOcupado(null);
    }
  }

  function alternar(i: ItemChecklist) {
    if (!sesion || !i.editable) return;
    void ejecutar(i.codigo, () => marcarItemChecklist(sesion.token, idOs, i.codigo as CodigoManual, i.estado !== 'conforme'));
  }

  async function enviarSolicitud() {
    if (!sesion) return;
    const ok = await ejecutar('solicitud', () => solicitarAutorizacionSalida(sesion.token, idOs, motivo.slice(0, MAX_MOTIVO)), true);
    if (ok) {
      setPidiendo(false);
      setMotivo('');
    }
  }

  function iniciar() {
    if (!sesion) return;
    void ejecutar('traslado', () => iniciarTraslado(sesion.token, idOs), true);
  }

  async function releer() {
    setActualizado(null);
    await recargar();
  }

  return (
    <SafeAreaView style={estilos.area} edges={['top']}>
      <EncabezadoApp nombre={usuario?.nombre ?? ''} apellido={usuario?.apellido} subtitulo={`${usuario?.nombre ?? ''} · ${cargo}`} />

      <ScrollView
        contentContainerStyle={[estilos.contenido, { paddingHorizontal: d.margen, maxWidth: d.anchoMaximo }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={recargando} onRefresh={releer} colors={[colores.primario]} />}
      >
        <View style={estilos.tituloFila}>
          <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Volver">
            <Ionicons name="arrow-back" size={24} color={colores.titulo} />
          </Pressable>
          <Text style={[estilos.titulo, { fontSize: d.tituloPantalla - 2 }]} accessibilityRole="header">
            Validación antes de salir
          </Text>
        </View>
        <Text style={estilos.subtitulo}>Verifica los requisitos obligatorios para iniciar el traslado.</Text>

        {cargando ? (
          <ActivityIndicator color={colores.primario} style={{ marginTop: 40 }} />
        ) : error || !c ? (
          <Aviso tipo="error" mensaje={error ?? 'No se encontró el servicio.'} />
        ) : (
          <>
            <View style={estilos.tarjeta}>
              <View style={[estilos.par, d.compacto && { flexDirection: 'column', gap: 12 }]}>
                <Campo etiqueta="CLIENTE" valor={c.cliente ?? '—'} />
                <Campo etiqueta="ORDEN" valor={c.numeroOs} destacado alinear={d.compacto ? 'left' : 'right'} />
              </View>
              <View style={[estilos.par, d.compacto && { flexDirection: 'column', gap: 12 }]}>
                <Campo etiqueta="HORA PROGRAMADA" valor={hora12(c.horaInicio) || '—'} icono="time-outline" />
                <Campo etiqueta="TÉCNICO" valor={c.tecnico ?? '—'} alinear={d.compacto ? 'left' : 'right'} />
              </View>
            </View>

            <Text style={estilos.seccion}>CHECKLIST OBLIGATORIO</Text>
            <View style={{ gap: 10 }}>
              {c.items.map((i) => (
                <FilaChecklist
                  key={i.codigo}
                  item={i}
                  ocupado={ocupado === i.codigo}
                  compacto={d.compacto}
                  onAlternar={() => alternar(i)}
                  onRevisar={() => router.back()}
                />
              ))}
            </View>

            {!!mensaje && (
              <View style={{ marginTop: 16 }}>
                <Aviso tipo={mensaje.tipo === 'exito' ? 'info' : mensaje.tipo} mensaje={mensaje.texto} />
              </View>
            )}

            {c.trasladoIniciado ? (
              <View style={[estilos.recuadro, estilos.recuadroOk]} testID="traslado-iniciado">
                <Ionicons name="navigate-circle-outline" size={22} color={colores.verdeEtiquetaTexto} />
                <View style={{ flex: 1 }}>
                  <Text style={[estilos.recuadroTitulo, { color: colores.verdeEtiquetaTexto }]}>TRASLADO INICIADO</Text>
                  <Text style={estilos.recuadroTexto}>El servicio está en ruta. Marca la llegada al llegar a la planta.</Text>
                </View>
              </View>
            ) : c.faltantes.length > 0 && !c.puedeIniciar ? (
              <View style={[estilos.recuadro, estilos.recuadroError]} testID="aviso-bloqueo">
                <Ionicons name="alert-circle" size={22} color={colores.rojo} />
                <View style={{ flex: 1 }}>
                  <Text style={[estilos.recuadroTitulo, { color: colores.rojo }]}>NO PUEDES INICIAR TRASLADO</Text>
                  <Text style={estilos.recuadroTexto}>Faltan: {c.faltantes.join(', ')}.</Text>
                </View>
              </View>
            ) : c.saleConVistoBueno ? (
              <View style={[estilos.recuadro, estilos.recuadroOk]}>
                <Ionicons name="ribbon-outline" size={22} color={colores.verdeEtiquetaTexto} />
                <View style={{ flex: 1 }}>
                  <Text style={[estilos.recuadroTitulo, { color: colores.verdeEtiquetaTexto }]}>SALIDA AUTORIZADA</Text>
                  <Text style={estilos.recuadroTexto}>
                    El {c.areaAutoriza?.cargo ?? 'encargado del área'} dio el visto bueno: puedes salir aunque queden pendientes ({c.faltantes.join(', ')}).
                  </Text>
                </View>
              </View>
            ) : null}

            {c.autorizacion?.estado === 'pendiente' && !c.trasladoIniciado && (
              <View style={{ marginTop: 12 }}>
                <Aviso tipo="info" mensaje={`Esperando respuesta ${deQuien(c)}. Desliza hacia abajo para ver si ya respondió.`} />
              </View>
            )}

            <View style={{ gap: 12, marginTop: 18 }}>
              {c.puedeSolicitarAutorizacion &&
                (pidiendo ? (
                  <View style={estilos.solicitud}>
                    <Text style={estilos.solicitudTitulo}>Solicitar autorización</Text>
                    <Text style={estilos.recuadroTexto}>
                      Se avisará {aQuien(c)}
                      {c.areaAutoriza?.area ? `, encargado del área del servicio según la RQ (${c.areaAutoriza.area})` : ''}, con los
                      pendientes: {c.faltantes.join(', ')}.
                    </Text>
                    <TextInput
                      value={motivo}
                      onChangeText={setMotivo}
                      placeholder="Motivo (opcional)"
                      placeholderTextColor={colores.placeholder}
                      maxLength={MAX_MOTIVO}
                      multiline
                      style={estilos.motivo}
                      testID="motivo-autorizacion"
                    />
                    <Text style={estilos.contador}>
                      {motivo.length}/{MAX_MOTIVO}
                    </Text>
                    <Boton titulo="Enviar solicitud" onPress={enviarSolicitud} cargando={ocupado === 'solicitud'} />
                    <Boton titulo="Cancelar" variante="secundario" onPress={() => setPidiendo(false)} deshabilitado={ocupado === 'solicitud'} />
                  </View>
                ) : (
                  <Boton titulo="Solicitar autorización" variante="secundario" onPress={() => setPidiendo(true)} />
                ))}

              {!c.trasladoIniciado && (
                <Boton titulo="Iniciar traslado →" onPress={iniciar} deshabilitado={!c.puedeIniciar} cargando={ocupado === 'traslado'} />
              )}
              {c.trasladoIniciado && (
                <Boton
                  titulo="Volver al servicio"
                  variante="secundario"
                  onPress={() => router.replace({ pathname: '/detalle-servicio', params: { id: String(idOs), v: String(Date.now()) } })}
                />
              )}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Campo({
  etiqueta,
  valor,
  destacado = false,
  alinear = 'left',
  icono,
}: {
  etiqueta: string;
  valor: string;
  destacado?: boolean;
  alinear?: 'left' | 'right';
  icono?: NombreIcono;
}) {
  return (
    <View style={{ flex: 1, alignItems: alinear === 'right' ? 'flex-end' : 'flex-start' }}>
      <Text style={estilos.campoEtiqueta}>{etiqueta}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        {!!icono && <Ionicons name={icono} size={16} color={colores.texto} />}
        <Text style={[estilos.campoValor, destacado && { color: colores.primario }]} numberOfLines={2}>
          {valor}
        </Text>
      </View>
    </View>
  );
}

function FilaChecklist({
  item: i,
  ocupado,
  compacto,
  onAlternar,
  onRevisar,
}: {
  item: ItemChecklist;
  ocupado: boolean;
  compacto: boolean;
  onAlternar: () => void;
  onRevisar: () => void;
}) {
  const pendienteRevisable = i.tipo === 'automatico' && (i.codigo === 'repuestos' || i.codigo === 'alerta') && i.estado !== 'conforme' && i.estado !== 'no_aplica';
  const borde =
    i.estado === 'bloqueado' ? '#FCA5A5' : i.estado === 'pendiente' && i.obligatorio ? '#FCD34D' : colores.bordeSuave;
  const esCasilla = (i.tipo === 'manual' || i.tipo === 'autorizacion') && i.estado !== 'no_aplica';

  return (
    <Pressable
      onPress={i.editable ? onAlternar : undefined}
      disabled={!i.editable || ocupado}
      accessibilityRole={esCasilla ? 'checkbox' : 'text'}
      accessibilityState={{ checked: i.estado === 'conforme', disabled: !i.editable }}
      accessibilityLabel={`${i.nombre}: ${i.estado.replace('_', ' ')}`}
      testID={`item-${i.codigo}`}
      style={[estilos.fila, { borderColor: borde }]}
    >
      <View style={estilos.filaPrincipal}>
        <Ionicons
          name={iconos[i.codigo] ?? 'ellipse-outline'}
          size={22}
          color={i.estado === 'conforme' ? colores.verde : i.estado === 'bloqueado' ? colores.rojo : i.estado === 'pendiente' ? colores.naranja : colores.textoTenue}
        />
        <View style={{ flex: 1 }}>
          <Text style={estilos.filaNombre}>{i.nombre}</Text>
          {!!i.detalle && i.estado !== 'conforme' && <Text style={estilos.filaDetalle}>{i.detalle}</Text>}
          {i.codigo === 'visto_bueno' && i.estado === 'conforme' && !!i.detalle && <Text style={estilos.filaDetalle}>{i.detalle}</Text>}
        </View>
        {!compacto && <EtiquetaEstado estado={i.estado} />}
        {ocupado ? (
          <ActivityIndicator color={colores.primario} />
        ) : esCasilla ? (
          <Ionicons
            name={i.estado === 'conforme' ? 'checkbox' : 'square-outline'}
            size={26}
            color={i.estado === 'conforme' ? colores.verde : i.editable ? colores.primario : colores.textoTenue}
          />
        ) : null}
      </View>
      {(compacto || pendienteRevisable) && (
        <View style={estilos.filaPie}>
          {compacto && <EtiquetaEstado estado={i.estado} />}
          {pendienteRevisable && (
            <Pressable onPress={onRevisar} style={estilos.revisar} accessibilityRole="button" hitSlop={6}>
              <Text style={estilos.revisarTexto}>{i.codigo === 'alerta' ? 'Ver alerta' : 'Revisar'}</Text>
            </Pressable>
          )}
        </View>
      )}
    </Pressable>
  );
}

const estilos = StyleSheet.create({
  area: { flex: 1, backgroundColor: colores.fondo },
  contenido: { paddingTop: 18, paddingBottom: 32, width: '100%', alignSelf: 'center' },
  tituloFila: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  titulo: { fontWeight: '700', color: colores.titulo, flexShrink: 1 },
  subtitulo: { fontSize: 15, color: colores.textoSecundario, marginTop: 4, marginBottom: 18 },
  tarjeta: {
    backgroundColor: colores.tarjeta,
    borderRadius: radios.tarjeta,
    borderWidth: 1,
    borderColor: colores.borde,
    padding: 18,
    gap: 16,
  },
  par: { flexDirection: 'row', gap: 12 },
  campoEtiqueta: { fontSize: 11.5, fontWeight: '600', color: colores.textoSecundario, letterSpacing: 0.8, marginBottom: 4 },
  campoValor: { fontSize: 16, color: colores.texto, flexShrink: 1 },
  seccion: { fontSize: 12.5, fontWeight: '600', letterSpacing: 1.2, color: colores.titulo, marginTop: 22, marginBottom: 10 },
  fila: {
    backgroundColor: colores.tarjeta,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 8,
  },
  filaPrincipal: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  filaNombre: { fontSize: 15.5, color: colores.texto },
  filaDetalle: { fontSize: 12.5, color: colores.textoSecundario, marginTop: 2 },
  filaPie: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 34, gap: 8 },
  revisar: { borderWidth: 1, borderColor: colores.primario, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 5, marginLeft: 'auto' },
  revisarTexto: { color: colores.primario, fontSize: 13, fontWeight: '600' },
  recuadro: { flexDirection: 'row', gap: 10, borderRadius: 10, borderWidth: 1, padding: 14, marginTop: 18 },
  recuadroError: { backgroundColor: '#FEF2F2', borderColor: '#FCA5A5' },
  recuadroOk: { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' },
  recuadroTitulo: { fontSize: 14, fontWeight: '800' },
  recuadroTexto: { fontSize: 13.5, color: colores.texto, marginTop: 2, lineHeight: 19 },
  solicitud: {
    backgroundColor: colores.tarjeta,
    borderRadius: radios.tarjeta,
    borderWidth: 1,
    borderColor: colores.borde,
    padding: 16,
    gap: 10,
  },
  solicitudTitulo: { fontSize: 16, fontWeight: '700', color: colores.titulo },
  motivo: {
    minHeight: 80,
    borderWidth: 1,
    borderColor: colores.borde,
    borderRadius: radios.campo,
    padding: 12,
    fontSize: 15,
    color: colores.texto,
    textAlignVertical: 'top',
  },
  contador: { fontSize: 12, color: colores.textoTenue, textAlign: 'right', marginTop: -6 },
});

/** A quién va la solicitud: el encargado del área de la RQ o, si la RQ no indica área, ambos encargados. */
function aQuien(c: ChecklistSalida): string {
  const a = c.areaAutoriza;
  if (!a?.cargo) return 'a los encargados de Servicio Técnico y Metrología';
  return `al ${a.cargo}${a.encargado ? ` (${a.encargado})` : ''}`;
}

function deQuien(c: ChecklistSalida): string {
  const a = c.areaAutoriza;
  if (!a?.cargo) return 'de los encargados de Servicio Técnico y Metrología';
  return `del ${a.cargo}`;
}
