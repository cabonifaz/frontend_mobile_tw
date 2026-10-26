import { useCallback, useRef, useState, type ComponentProps } from 'react';
import { ActivityIndicator, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { ErrorApi } from '@/api/cliente';
import { nombreDeCodigo, obtenerCatalogo } from '@/api/catalogos';
import {
  marcarItemChecklist,
  obtenerChecklistSalida,
  obtenerDetalleServicio,
  type CodigoManual,
  type HistorialServicio,
  type ItemChecklist,
} from '@/api/servicios';
import { Aviso } from '@/componentes/Aviso';
import { Boton } from '@/componentes/Boton';
import { EncabezadoApp } from '@/componentes/EncabezadoApp';
import { EtiquetaEstado, TituloSeccion } from '@/componentes/EtiquetaEstado';
import { useConsulta } from '@/hooks/useConsulta';
import { useDiseno } from '@/hooks/useDiseno';
import { useSesion } from '@/sesion/SesionContext';
import { colores, radios } from '@/tema/colores';
import { fechaCorta, fechaHora, telefonoMarcable } from '@/utilidades/formato';

/**
 * HU-04 — Detalle del servicio.
 *  - Destino, contacto y documentos (RQ, OS, OM) de la OS.
 *  - Alertas predictivas, requisitos (SSOMA, EPP, Materiales e insumos; OC opcional),
 *    riesgos identificados, repuestos, historial (anterior → actual) y documentación.
 *  - "Validar salida" abre el checklist de pre-salida.
 *  - En ruta: "Registrar llegada" (HU-06) y "Registrar demora" (HU-05). En planta: "Ver objetivos" (HU-07).
 *  Sin botón de refresh (se desliza hacia abajo), sin "Online · Sincronizado" y sin "Zero-Device".
 */
type NombreIcono = ComponentProps<typeof Ionicons>['name'];

const iconoRiesgo: Record<string, ComponentProps<typeof MaterialCommunityIcons>['name']> = {
  alerta: 'alert-outline',
  fuego: 'fire',
  altura: 'ladder',
  electrico: 'flash-outline',
  confinado: 'cube-scan',
  vehiculo: 'forklift',
  ruido: 'volume-high',
  quimico: 'flask-outline',
};

const requisitosDetalle: { codigo: string; nombre: string }[] = [
  { codigo: 'ssoma', nombre: 'SSOMA' },
  { codigo: 'epp', nombre: 'EPP completo' },
  { codigo: 'materiales', nombre: 'Materiales e insumos' },
  { codigo: 'oc', nombre: 'OC cargada' },
];

export default function PantallaDetalleServicio() {
  const { sesion } = useSesion();
  const usuario = sesion?.usuario;
  const d = useDiseno();
  const params = useLocalSearchParams<{ id?: string; v?: string }>();
  const idOs = Number(params.id);
  const idValido = Number.isInteger(idOs) && idOs > 0;

  const { datos, cargando, recargando, error, recargar } = useConsulta(
    async (token) => {
      if (!idValido) throw new ErrorApi('Servicio no válido.', 400, 1);
      const [detalle, checklist, cargos] = await Promise.all([
        obtenerDetalleServicio(token, idOs),
        obtenerChecklistSalida(token, idOs),
        obtenerCatalogo(token, 'CARGO_USUARIO'),
      ]);
      return { detalle, checklist, cargos };
    },
    `${params.id ?? ''}|${params.v ?? ''}`,
  );

  // Al volver del checklist se relee (para ver lo que se confirmó allá).
  const primeraVez = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (primeraVez.current) {
        primeraVez.current = false;
        return;
      }
      void recargar();
    }, [recargar]),
  );

  const [alertaAbierta, setAlertaAbierta] = useState<number | null>(null);
  const [historialAbierto, setHistorialAbierto] = useState<number | null>(null);
  const [guardando, setGuardando] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<{ tipo: 'error' | 'info'; texto: string } | null>(null);

  const cargo = nombreDeCodigo(datos?.cargos, usuario?.cargo) ?? usuario?.cargo ?? 'Técnico de Campo';
  const detalle = datos?.detalle ?? null;
  const s = detalle?.servicio ?? null;
  const items = datos?.checklist.items ?? [];
  const item = (codigo: string) => items.find((i) => i.codigo === codigo);
  const programada = s ? ['programada', 'reprogramada'].includes(s.estadoOs) : false;
  const enRuta = s?.estadoOs === 'en_ruta';
  const enPlanta = s ? ['en_ejecucion', 'pausada'].includes(s.estadoOs) : false;

  async function alternar(i: ItemChecklist) {
    if (!sesion || !i.editable || guardando) return;
    setGuardando(i.codigo);
    setMensaje(null);
    try {
      await marcarItemChecklist(sesion.token, idOs, i.codigo as CodigoManual, i.estado !== 'conforme');
      await recargar();
    } catch (e) {
      setMensaje({ tipo: 'error', texto: e instanceof ErrorApi ? e.message : 'No se pudo guardar.' });
    } finally {
      setGuardando(null);
    }
  }

  function llamar() {
    const tel = telefonoMarcable(s?.contactoTelefono ?? null);
    if (tel) void Linking.openURL(`tel:${tel}`);
  }

  function abrirMapa() {
    const lugar = [s?.direccion, s?.sede, s?.cliente].filter(Boolean).join(', ');
    if (lugar) void Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(lugar)}`);
  }

  function ir(pathname: '/demoras' | '/objetivos' | '/llegada') {
    router.push({ pathname, params: { id: String(idOs) } });
  }

  const accesos: { id: string; icono: NombreIcono; texto: string; onPress: () => void; activo: boolean }[] = [
    { id: 'demora', icono: 'time-outline', texto: 'Demora', onPress: () => ir('/demoras'), activo: enRuta },
    { id: 'objetivos', icono: 'clipboard-outline', texto: 'Objetivos', onPress: () => ir('/objetivos'), activo: true },
    { id: 'llamar', icono: 'call-outline', texto: 'Llamar', onPress: llamar, activo: !!telefonoMarcable(s?.contactoTelefono ?? null) },
    { id: 'mapa', icono: 'map-outline', texto: 'Mapa', onPress: abrirMapa, activo: !!(s?.direccion || s?.sede) },
  ];

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
          <Text style={[estilos.titulo, { fontSize: d.tituloPantalla }]} accessibilityRole="header">
            Servicio Programado
          </Text>
        </View>

        {cargando ? (
          <ActivityIndicator color={colores.primario} style={{ marginTop: 40 }} />
        ) : error || !s || !detalle ? (
          <Aviso tipo="error" mensaje={error ?? 'No se encontró el servicio.'} />
        ) : (
          <>
            {/* Destino */}
            <View style={estilos.tarjeta} testID="detalle-destino">
              <View style={[estilos.clienteFila, d.compacto && { flexDirection: 'column', alignItems: 'flex-start' }]}>
                <View style={{ flex: d.compacto ? undefined : 1 }}>
                  <Text style={estilos.etiqueta}>CLIENTE</Text>
                  <Text style={estilos.cliente}>{s.cliente ?? '—'}</Text>
                </View>
                {!!s.tipoServicio && (
                  <View style={estilos.pildora}>
                    <Text style={estilos.pildoraTexto}>{s.tipoServicio}</Text>
                  </View>
                )}
              </View>
              <View style={estilos.separador} />
              <Dato icono="location-outline" titulo="Dirección" valor={s.direccion ?? s.sede ?? 'Sin dirección registrada'} />
              <Dato
                icono="person-circle-outline"
                titulo="Contacto"
                valor={
                  s.contactoNombre
                    ? `${s.contactoNombre}${s.contactoTelefono ? ` (${s.contactoTelefono})` : ''}`
                    : 'Sin contacto registrado'
                }
                nota={s.contactoCargo}
              />
              <View style={[estilos.dosColumnas, (d.compacto || d.letraGrande) && { flexDirection: 'column', gap: 0 }]}>
                <View style={{ flex: 1 }}>
                  <Dato icono="calendar-outline" titulo="Fecha/Hora" valor={fechaHora(s.fechaEjecucion, s.horaInicio) || '—'} />
                </View>
                <View style={{ flex: 1 }}>
                  <Dato icono="business-outline" titulo="Lugar" valor={s.sede ?? '—'} />
                </View>
              </View>
              <View style={estilos.documentos}>
                <Ionicons name="document-text-outline" size={20} color={colores.textoSecundario} />
                <View style={estilos.documentosLista}>
                  <Documento etiqueta="RQ" valor={s.numeroRq} />
                  <Documento etiqueta="OS" valor={s.numeroOs} />
                  {!!s.numeroOm && <Documento etiqueta="OM" valor={s.numeroOm} />}
                </View>
              </View>
            </View>

            {/* Indicadores */}
            <View style={estilos.chips}>
              <Chip
                tono={s.clienteConfirmado ? 'verde' : 'naranja'}
                icono={s.clienteConfirmado ? 'checkmark-circle-outline' : 'warning-outline'}
                texto={s.clienteConfirmado ? 'Cliente confirmado' : 'Cliente no confirmado'}
              />
              <Chip
                tono={s.estadoSsoma === 'habilitado' ? 'verde' : s.estadoSsoma === 'bloqueado' ? 'rojo' : 'naranja'}
                icono="shield-checkmark-outline"
                texto={s.estadoSsoma === 'habilitado' ? 'SSOMA aprobado' : s.estadoSsoma === 'bloqueado' ? 'SSOMA bloqueado' : 'SSOMA pendiente'}
              />
            </View>

            {enRuta && (
              <View style={{ marginTop: 14 }}>
                <Aviso tipo="info" mensaje="Traslado en curso: el servicio está en ruta hacia el cliente." />
              </View>
            )}

            {/* Alertas predictivas */}
            {detalle.alertas.map((a) => {
              const abierta = alertaAbierta === a.idAlerta;
              return (
                <View key={a.idAlerta} style={estilos.alerta} testID={`alerta-${a.idAlerta}`}>
                  <View style={estilos.alertaCabecera}>
                    <Ionicons name="warning-outline" size={22} color={colores.naranja} />
                    <Text style={estilos.alertaTitulo}>Alerta de Mantenimiento</Text>
                  </View>
                  <Text style={estilos.alertaTexto} numberOfLines={abierta ? undefined : 3}>
                    {a.descripcion}
                  </Text>
                  {abierta && (
                    <View style={{ marginTop: 8, gap: 2 }}>
                      {!!a.tipo && <Text style={estilos.alertaDetalle}>Tipo: {a.tipo}</Text>}
                      {!!a.prioridad && <Text style={estilos.alertaDetalle}>Prioridad: {a.prioridad}</Text>}
                      {!!a.equipo && <Text style={estilos.alertaDetalle}>Equipo: {a.equipo}</Text>}
                      {!!a.fechaGeneracion && <Text style={estilos.alertaDetalle}>Generada: {fechaCorta(a.fechaGeneracion)}</Text>}
                      <Text style={estilos.alertaDetalle}>Bloquea la salida hasta que se resuelva o el jefe dé el visto bueno.</Text>
                    </View>
                  )}
                  <Pressable onPress={() => setAlertaAbierta(abierta ? null : a.idAlerta)} accessibilityRole="button" hitSlop={8}>
                    <Text style={estilos.alertaEnlace}>{abierta ? 'Ocultar' : 'Ver alerta'}</Text>
                  </Pressable>
                </View>
              );
            })}

            {!!mensaje && (
              <View style={{ marginTop: 14 }}>
                <Aviso tipo={mensaje.tipo} mensaje={mensaje.texto} />
              </View>
            )}

            {/* Requisitos */}
            <TituloSeccion texto="REQUISITOS" />
            <View style={estilos.lista}>
              {requisitosDetalle.map((r, idx) => {
                const i = item(r.codigo);
                if (!i) return null;
                const ok = i.estado === 'conforme';
                const opcional = !i.obligatorio;
                return (
                  <Pressable
                    key={r.codigo}
                    onPress={() => alternar(i)}
                    disabled={!i.editable || !!guardando}
                    accessibilityRole={i.editable ? 'checkbox' : 'text'}
                    accessibilityState={{ checked: ok, disabled: !i.editable }}
                    accessibilityLabel={r.nombre}
                    testID={`requisito-${r.codigo}`}
                    style={[estilos.filaLista, idx > 0 && estilos.filaBorde]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={estilos.filaTexto}>
                        {r.nombre}
                        {opcional ? <Text style={estilos.opcional}>  (no obligatoria)</Text> : null}
                      </Text>
                      {!ok && !!i.detalle && <Text style={estilos.filaNota}>{i.detalle}</Text>}
                    </View>
                    {guardando === r.codigo ? (
                      <ActivityIndicator color={colores.primario} />
                    ) : (
                      <Ionicons
                        name={ok ? 'checkbox' : i.estado === 'bloqueado' ? 'close-circle' : 'square-outline'}
                        size={26}
                        color={ok ? colores.verde : i.estado === 'bloqueado' ? colores.rojo : opcional ? colores.textoTenue : colores.naranja}
                      />
                    )}
                  </Pressable>
                );
              })}
            </View>

            {/* Riesgos */}
            <TituloSeccion texto="RIESGOS IDENTIFICADOS" />
            {detalle.riesgos.length === 0 ? (
              <Text style={estilos.vacio}>Sin riesgos registrados para este servicio.</Text>
            ) : (
              <View style={estilos.riesgos}>
                {detalle.riesgos.map((r) => (
                  <View key={r.idRiesgo} style={[estilos.riesgo, { width: d.compacto ? '100%' : '48.5%' }]}>
                    <MaterialCommunityIcons name={iconoRiesgo[r.icono ?? ''] ?? 'alert-outline'} size={22} color={colores.rojo} />
                    <Text style={estilos.riesgoTexto}>{r.nombre ?? 'Riesgo'}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Repuestos */}
            <TituloSeccion texto="REPUESTOS SUGERIDOS" />
            {detalle.repuestos.length === 0 ? (
              <Text style={estilos.vacio}>El servicio no tiene repuestos asignados.</Text>
            ) : (
              <View style={estilos.lista}>
                {detalle.repuestos.map((r, idx) => (
                  <View key={r.idItem} style={[estilos.filaLista, idx > 0 && estilos.filaBorde]}>
                    <MaterialCommunityIcons name="cog-outline" size={22} color={colores.textoSecundario} />
                    <Text style={[estilos.filaTexto, { flex: 1 }]}>{r.descripcion}</Text>
                    <EtiquetaEstado estado={r.asignado ? 'asignado' : 'pendiente'} />
                  </View>
                ))}
              </View>
            )}

            {/* Historial */}
            <TituloSeccion texto="HISTORIAL RECIENTE" />
            {detalle.historial.length === 0 ? (
              <Text style={estilos.vacio}>Todavía no hay modificaciones registradas.</Text>
            ) : (
              <View style={[estilos.lista, { paddingVertical: 6 }]}>
                {detalle.historial.map((h, idx) => (
                  <ItemHistorial
                    key={`${h.fecha}-${idx}`}
                    h={h}
                    abierto={historialAbierto === idx}
                    ultimo={idx === detalle.historial.length - 1}
                    onPress={() => setHistorialAbierto(historialAbierto === idx ? null : idx)}
                    testID={`historial-${idx}`}
                  />
                ))}
              </View>
            )}

            {/* Documentación */}
            <TituloSeccion texto="DOCUMENTACIÓN TÉCNICA" />
            {detalle.documentos.length === 0 ? (
              <Text style={estilos.vacio}>Sin documentos adjuntos.</Text>
            ) : (
              <View style={estilos.lista}>
                {detalle.documentos.map((doc, idx) => (
                  <View key={doc.idDocumento} style={[estilos.filaLista, idx > 0 && estilos.filaBorde]}>
                    <MaterialCommunityIcons name="file-pdf-box" size={28} color={colores.primario} />
                    <View style={{ flex: 1 }}>
                      <Text style={estilos.filaTexto}>{doc.nombreArchivo}</Text>
                      {!!doc.tipo && <Text style={estilos.filaNota}>{doc.tipo}</Text>}
                    </View>
                  </View>
                ))}
              </View>
            )}

            {/* Accesos rápidos */}
            <View style={[estilos.accesos, { flexWrap: d.compacto ? 'wrap' : 'nowrap' }]}>
              {accesos.map((a) => (
                <Pressable
                  key={a.id}
                  onPress={a.onPress}
                  disabled={!a.activo}
                  accessibilityRole="button"
                  accessibilityLabel={a.texto}
                  testID={`acceso-${a.id}`}
                  style={({ pressed }) => [
                    estilos.acceso,
                    { width: d.compacto ? '48%' : undefined, flex: d.compacto ? undefined : 1 },
                    pressed && { backgroundColor: colores.primarioSuave },
                    !a.activo && { opacity: 0.45 },
                  ]}
                >
                  <Ionicons name={a.icono} size={22} color={colores.primarioOscuro} />
                  <Text style={estilos.accesoTexto} numberOfLines={1}>
                    {a.texto}
                  </Text>
                </Pressable>
              ))}
            </View>

            <View style={{ gap: 12, marginTop: 18 }}>
              {programada ? (
                <Boton
                  titulo="Validar salida"
                  onPress={() => router.push({ pathname: '/checklist-salida', params: { id: String(idOs) } })}
                />
              ) : enRuta ? (
                <>
                  <Boton titulo="Registrar llegada" onPress={() => ir('/llegada')} />
                  <Boton titulo="Registrar demora" variante="secundario" onPress={() => ir('/demoras')} />
                </>
              ) : enPlanta ? (
                <Boton titulo="Ver objetivos" onPress={() => ir('/objetivos')} />
              ) : null}
              <Boton titulo="Consultar IA" variante="secundario" onPress={() => router.push('/asistente')} />
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Dato({ icono, titulo, valor, nota }: { icono: NombreIcono; titulo: string; valor: string; nota?: string | null }) {
  return (
    <View style={estilos.dato}>
      <Ionicons name={icono} size={20} color={colores.textoSecundario} style={{ marginTop: 2 }} />
      <View style={{ flex: 1 }}>
        <Text style={estilos.datoTitulo}>{titulo}</Text>
        <Text style={estilos.datoValor}>{valor}</Text>
        {!!nota && <Text style={estilos.filaNota}>{nota}</Text>}
      </View>
    </View>
  );
}

function Documento({ etiqueta, valor }: { etiqueta: string; valor: string | null }) {
  return (
    <View style={estilos.documento}>
      <Text style={estilos.documentoEtiqueta}>{etiqueta}</Text>
      <Text style={estilos.documentoValor}>{valor ?? '—'}</Text>
    </View>
  );
}

const tonosChip = {
  verde: { fondo: '#F0FDF4', borde: '#BBF7D0', texto: '#166534', icono: colores.verde },
  naranja: { fondo: '#FFFBEB', borde: '#FDE68A', texto: '#92400E', icono: colores.naranja },
  rojo: { fondo: '#FEF2F2', borde: '#FECACA', texto: '#991B1B', icono: colores.rojo },
} as const;

function Chip({ tono, icono, texto }: { tono: keyof typeof tonosChip; icono: NombreIcono; texto: string }) {
  const t = tonosChip[tono];
  return (
    <View style={[estilos.chip, { backgroundColor: t.fondo, borderColor: t.borde }]}>
      <Ionicons name={icono} size={15} color={t.icono} />
      <Text style={[estilos.chipTexto, { color: t.texto }]}>{texto}</Text>
    </View>
  );
}

/** Una modificación del historial. Al tocarla muestra el valor anterior y el actual. */
function ItemHistorial({
  h,
  abierto,
  ultimo,
  onPress,
  testID,
}: {
  h: HistorialServicio;
  abierto: boolean;
  ultimo: boolean;
  onPress: () => void;
  testID: string;
}) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ expanded: abierto }} testID={testID} style={estilos.historial}>
      <View style={estilos.linea}>
        <View style={estilos.punto} />
        {!ultimo && <View style={estilos.trazo} />}
      </View>
      <View style={{ flex: 1, paddingBottom: ultimo ? 4 : 14 }}>
        <View style={estilos.historialCabecera}>
          <Text style={estilos.historialFecha}>{fechaCorta(h.fecha)}</Text>
          <Ionicons name={abierto ? 'chevron-up' : 'chevron-down'} size={16} color={colores.textoTenue} />
        </View>
        <Text style={estilos.historialTitulo}>{h.titulo ?? 'Modificación'}</Text>
        {!!h.referencia && <Text style={estilos.filaNota}>{h.referencia}</Text>}
        {abierto && (
          <View style={estilos.comparacion}>
            <View style={estilos.comparacionFila}>
              <Text style={estilos.comparacionEtiqueta}>Anterior</Text>
              <Text style={[estilos.comparacionValor, estilos.anterior]}>{h.valorAnterior || '—'}</Text>
            </View>
            <View style={estilos.comparacionFila}>
              <Text style={estilos.comparacionEtiqueta}>Actual</Text>
              <Text style={[estilos.comparacionValor, estilos.actual]}>{h.valorNuevo || '—'}</Text>
            </View>
            {!!h.detalle && <Text style={estilos.filaNota}>{h.detalle}</Text>}
            {!!h.usuario && <Text style={estilos.filaNota}>Por {h.usuario}</Text>}
          </View>
        )}
      </View>
    </Pressable>
  );
}

const estilos = StyleSheet.create({
  area: { flex: 1, backgroundColor: colores.fondo },
  contenido: { paddingTop: 18, paddingBottom: 32, width: '100%', alignSelf: 'center' },
  tituloFila: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  titulo: { fontWeight: '600', color: colores.titulo, flexShrink: 1 },
  tarjeta: {
    backgroundColor: colores.tarjeta,
    borderRadius: radios.tarjeta,
    borderWidth: 1,
    borderColor: colores.bordeSuave,
    padding: 18,
    gap: 12,
  },
  clienteFila: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  etiqueta: { fontSize: 12, fontWeight: '600', color: colores.textoSecundario, letterSpacing: 0.8 },
  cliente: { fontSize: 19, color: colores.primario, fontWeight: '600', marginTop: 2 },
  pildora: { backgroundColor: colores.azulFondo, borderRadius: 18, paddingHorizontal: 12, paddingVertical: 6, maxWidth: '100%' },
  pildoraTexto: { color: colores.azulTexto, fontSize: 13, fontWeight: '600' },
  separador: { height: 1, backgroundColor: colores.bordeSuave },
  dato: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  datoTitulo: { fontSize: 12.5, color: colores.textoSecundario },
  datoValor: { fontSize: 15, color: colores.texto, marginTop: 1 },
  dosColumnas: { flexDirection: 'row', gap: 12 },
  documentos: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colores.grisFondo,
    borderRadius: 10,
    padding: 12,
  },
  documentosLista: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', columnGap: 18, rowGap: 6 },
  documento: { minWidth: 90 },
  documentoEtiqueta: { fontSize: 11, fontWeight: '700', color: colores.textoSecundario, letterSpacing: 0.5 },
  documentoValor: { fontSize: 15, color: colores.texto, marginTop: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  chipTexto: { fontSize: 12.5, fontWeight: '500' },
  alerta: {
    marginTop: 16,
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
    borderWidth: 1,
    borderRadius: radios.tarjeta,
    padding: 16,
    gap: 6,
  },
  alertaCabecera: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  alertaTitulo: { fontSize: 16, fontWeight: '600', color: '#9A3412', flexShrink: 1 },
  alertaTexto: { fontSize: 13.5, color: '#B45309', lineHeight: 19 },
  alertaDetalle: { fontSize: 12.5, color: '#92400E' },
  alertaEnlace: { fontSize: 13.5, color: '#B45309', textDecorationLine: 'underline', marginTop: 4, fontWeight: '600' },
  lista: {
    backgroundColor: colores.tarjeta,
    borderRadius: radios.tarjeta,
    borderWidth: 1,
    borderColor: colores.bordeSuave,
    paddingHorizontal: 16,
  },
  filaLista: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, minHeight: 52 },
  filaBorde: { borderTopWidth: 1, borderTopColor: colores.bordeSuave },
  filaTexto: { fontSize: 15, color: colores.texto },
  filaNota: { fontSize: 12.5, color: colores.textoSecundario, marginTop: 2 },
  opcional: { fontSize: 12.5, color: colores.textoTenue },
  vacio: { fontSize: 14, color: colores.textoSecundario },
  riesgos: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 10 },
  riesgo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colores.grisFondo,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colores.borde,
    padding: 14,
    minHeight: 64,
  },
  riesgoTexto: { fontSize: 14.5, color: colores.texto, flexShrink: 1 },
  historial: { flexDirection: 'row', gap: 12, paddingTop: 10 },
  linea: { width: 12, alignItems: 'center' },
  punto: { width: 10, height: 10, borderRadius: 5, backgroundColor: colores.primario, marginTop: 4 },
  trazo: { flex: 1, width: 2, backgroundColor: colores.borde, marginTop: 2 },
  historialCabecera: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  historialFecha: { fontSize: 12.5, color: colores.textoSecundario },
  historialTitulo: { fontSize: 15.5, color: colores.texto, marginTop: 1 },
  comparacion: { marginTop: 8, backgroundColor: colores.grisFondo, borderRadius: 8, padding: 10, gap: 6 },
  comparacionFila: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  comparacionEtiqueta: { width: 64, fontSize: 12, fontWeight: '700', color: colores.textoSecundario, paddingTop: 2 },
  comparacionValor: { flex: 1, fontSize: 14 },
  anterior: { color: colores.textoSecundario, textDecorationLine: 'line-through' },
  actual: { color: colores.verdeEtiquetaTexto, fontWeight: '600' },
  accesos: { flexDirection: 'row', gap: 10, marginTop: 22, justifyContent: 'space-between', rowGap: 10 },
  acceso: {
    backgroundColor: colores.tarjeta,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colores.borde,
    paddingVertical: 12,
    alignItems: 'center',
    gap: 4,
    minHeight: 64,
  },
  accesoTexto: { fontSize: 12.5, fontWeight: '600', color: colores.titulo },
});
