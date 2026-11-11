import { useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ErrorApi } from '@/api/cliente';
import { nombreDeCodigo, obtenerCatalogo } from '@/api/catalogos';
import { guardarCabeceraInforme, obtenerCabeceraInformeConRespaldo, type CabeceraInforme, type CuerpoFalla, type GuardarCabecera, type Severidad } from '@/api/informe';
import { horaRespaldo } from '@/api/respaldo';
import { Aviso } from '@/componentes/Aviso';
import { EncabezadoApp } from '@/componentes/EncabezadoApp';
import { NuevaFallaModal } from '@/componentes/NuevaFallaModal';
import { Selector } from '@/componentes/Selector';
import { useConsulta } from '@/hooks/useConsulta';
import { useDiseno } from '@/hooks/useDiseno';
import { useSesion } from '@/sesion/SesionContext';
import { colores, radios } from '@/tema/colores';
import { formatoError, formatoMiles, leerLectura } from '@/utilidades/ensayos';
import {
  ESTADOS_EQUIPO,
  MAX_CELDAS,
  MAX_COMENTARIO_PRUEBAS,
  MAX_FALLAS,
  MAX_RECOMENDACION,
  MAX_RECOMENDACIONES,
  SEVERIDADES,
  alternarChecks,
  bloquesObservacion,
  calcularLecturas,
  cuerpoDatos,
  estadoPruebasGenerales,
  fallaACuerpo,
  fallaDesde,
  fallaGuardadaACuerpo,
  fallaVacia,
  progresoInforme,
  diferenciaExcentricidad,
  progresoObservacion,
  resumenPruebasGenerales,
  textoLecturasDentro,
  textoPosicion,
  textoConPrueba,
  textoEstadoEquipo,
  textoFallas,
  textoProgreso,
  textoSeveridad,
  type FallaEditable,
} from '@/utilidades/informe';
import { leerNumero, textoNumero } from '@/utilidades/trabajo';

type Pestana = 'datos' | 'detalle' | 'observacion';
const PESTANAS: { id: Pestana; texto: string }[] = [
  { id: 'datos', texto: 'Datos' },
  { id: 'detalle', texto: 'Detalle Serv.' },
  { id: 'observacion', texto: 'Observación y pruebas' },
];
const BLOQUES = ['rec', 'fal', 'pru', 'dia'] as const;
type Bloque = (typeof BLOQUES)[number];

/** Lo que el técnico cambió y aún no guardó. Un campo sin tocar (undefined) muestra lo del servidor. */
interface Edicion {
  respNombre?: string;
  respCargo?: string;
  respTelefono?: string;
  tipoEquipo?: string | null;
  celdas?: string[];
  suma?: string;
  comp?: string;
  anillos?: boolean | null;
  checks?: Set<string>;
  recs?: string[];
  sinRecs?: boolean;
  fallas?: CuerpoFalla[];
  sinFallas?: boolean;
  comentario?: string;
  diag?: NonNullable<GuardarCabecera['diagnostico']>;
}

/**
 * HU-15 — Cabecera del informe del equipo (OS u OM): Datos · Detalle Serv. · Observación y pruebas.
 *  - Datos: N° de informe, RQ, orden, cliente, equipo, datos del informe y "Quién atiende en planta" (editable).
 *  - Detalle Serv.: tipo de equipo, celdas (mV), checklist del tipo de orden (con "Marcar TODOS"), pruebas por sumatoria y por comparación, anillos de fijación.
 *  - Observación y pruebas: 4 bloques desplegables — Recomendaciones inmediatas, Fallas y su prueba (cada falla exige una prueba con L e I y el sistema calcula E),
 *    Pruebas generales (lo de Ensayos y Calibración) y Diagnóstico final.
 *  Guardar exige conexión; sin conexión se muestra lo último guardado. Con el equipo pausado o el informe ya generado, solo lectura.
 */
export default function PantallaCabeceraInforme() {
  const { sesion } = useSesion();
  const usuario = sesion?.usuario;
  const token = sesion?.token ?? '';
  const d = useDiseno();
  const params = useLocalSearchParams<{ id?: string; eq?: string; equipo?: string; tab?: string }>();
  const idOs = Number(params.id);
  const idOsEquipo = Number(params.eq ?? params.equipo);
  const valido = Number.isInteger(idOs) && idOs > 0 && Number.isInteger(idOsEquipo) && idOsEquipo > 0;

  const [tab, setTab] = useState<Pestana>(PESTANAS.some((p) => p.id === params.tab) ? (params.tab as Pestana) : 'datos');
  const [ed, setEd] = useState<Edicion>({});
  const [abiertos, setAbiertos] = useState<Set<Bloque>>(new Set());
  const [guardada, setGuardada] = useState<CabeceraInforme | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: 'error' | 'info'; texto: string; detalle?: string } | null>(null);
  const [modal, setModal] = useState<{ indice: number | null; inicial: FallaEditable } | null>(null);

  const { datos, cargando, recargando, error, recargar } = useConsulta(async (tk) => {
    if (!valido) throw new ErrorApi('Servicio o equipo no válido.', 400, 1);
    const [r, cargos] = await Promise.all([
      obtenerCabeceraInformeConRespaldo(tk, usuario?.idUsuario ?? 0, idOs, idOsEquipo),
      obtenerCatalogo(tk, 'CARGO_USUARIO').catch(() => undefined),
    ]);
    return { cabecera: r.datos, sinConexion: r.sinConexion, guardadoEn: r.guardadoEn, cargos };
  }, `${params.id ?? ''}|${params.eq ?? params.equipo ?? ''}`);

  const cargo = nombreDeCodigo(datos?.cargos, usuario?.cargo) ?? usuario?.cargo ?? 'Técnico de Campo';
  const cab = guardada ?? datos?.cabecera ?? null;
  const editable = !!cab?.datos.puedeEditar && !datos?.sinConexion;
  const sucio = Object.keys(ed).length > 0;
  const cambiar = (c: Partial<Edicion>) => setEd((x) => ({ ...x, ...c }));

  // ── Valores en pantalla = lo editado o, si no se tocó, lo del servidor ──
  const clase = cab?.datos.clase ?? null;
  const eDiv = leerNumero((cab?.datos.e ?? cab?.datos.d ?? '').replace(/[^\d.,]/g, '').replace(',', '.'));
  const unidad = (cab?.datos.capacidadMax ?? cab?.datos.d ?? '').match(/[A-Za-z]+/)?.[0]?.toLowerCase() ?? 'kg';
  const resp = {
    nombre: ed.respNombre ?? cab?.datos.responsableNombre ?? '',
    cargo: ed.respCargo ?? cab?.datos.responsableCargo ?? '',
    telefono: ed.respTelefono ?? cab?.datos.responsableTelefono ?? '',
  };
  const det = cab?.detalle;
  const celdas = ed.celdas ?? (det && det.celdas.length > 0 ? det.celdas.map(textoNumero) : ['', '', '', '']);
  const suma = ed.suma ?? (det?.sumatoriaHasta != null ? String(det.sumatoriaHasta) : '');
  const comp = ed.comp ?? (det?.comparacionHasta != null ? String(det.comparacionHasta) : '');
  const anillos = ed.anillos !== undefined ? ed.anillos : (det?.anillosFijacion ?? null);
  const tipoEquipo = ed.tipoEquipo !== undefined ? ed.tipoEquipo : (det?.tipoEquipo ?? null);
  const marcados = ed.checks ?? new Set((det?.checklist ?? []).filter((p) => p.marcado).map((p) => p.codigo));
  const recs = ed.recs ?? (cab?.recomendaciones.map((r) => r.titulo) ?? []);
  const sinRecs = ed.sinRecs ?? cab?.sinRecomendaciones ?? false;
  const fallas: CuerpoFalla[] = ed.fallas ?? (cab?.fallas.map(fallaGuardadaACuerpo) ?? []);
  const sinFallas = ed.sinFallas ?? cab?.sinFallas ?? false;
  const comentario = ed.comentario ?? cab?.comentarioPruebas ?? '';
  const diag = ed.diag ?? (cab ? { ...cab.diagnostico } : null);

  // Lo que ve el progreso: el estado ya editado (no solo lo guardado)
  const vista = cab && diag
    ? {
        ...cab,
        datos: { ...cab.datos, responsableNombre: resp.nombre || null },
        detalle: { ...cab.detalle, guardado: cab.detalle.guardado || ed.checks !== undefined || ed.celdas !== undefined || ed.tipoEquipo !== undefined || ed.suma !== undefined || ed.comp !== undefined || ed.anillos !== undefined },
        recomendaciones: recs.filter((t) => t.trim()).map((titulo, i) => ({ idRecomendacion: i, codigo: '', titulo, descripcion: null, prioridad: 'alta', plazo: null })),
        sinRecomendaciones: sinRecs,
        fallas: fallas.map((f, i) => ({ ...f, idObservacion: i, codigo: '', clasificacionNombre: null, componenteNombre: null, pruebas: f.pruebas.map((p, j) => ({ ...p, orden: j, error: 0, emp: null, resultado: null })) })),
        sinFallas,
        diagnostico: diag,
      }
    : null;

  function alternar(b: Bloque) {
    setAbiertos((x) => {
      const n = new Set(x);
      if (n.has(b)) n.delete(b);
      else n.add(b);
      return n;
    });
  }

  function armarCuerpo(): GuardarCabecera | string {
    const c: GuardarCabecera = {};
    if (ed.respNombre !== undefined || ed.respCargo !== undefined || ed.respTelefono !== undefined) c.datos = cuerpoDatos(resp.nombre, resp.cargo, resp.telefono);
    if (ed.tipoEquipo !== undefined || ed.celdas !== undefined || ed.suma !== undefined || ed.comp !== undefined || ed.anillos !== undefined || ed.checks !== undefined) {
      const nums: number[] = [];
      for (const t of celdas.filter((x) => x.trim())) {
        const n = leerNumero(t);
        if (n === null) return 'Las celdas (mV) deben ser números.';
        nums.push(n);
      }
      const s = suma.trim() ? leerLectura(suma) : null;
      const k = comp.trim() ? leerLectura(comp) : null;
      if ((suma.trim() && s === null) || (comp.trim() && k === null)) return 'Las pruebas por sumatoria y por comparación deben ser números.';
      c.detalle = { tipoEquipo, celdas: nums, sumatoriaHasta: s, comparacionHasta: k, anillosFijacion: anillos, checks: [...marcados] };
    }
    if (ed.recs !== undefined) c.recomendaciones = recs.map((t) => t.trim()).filter(Boolean).map((titulo) => ({ titulo, prioridad: 'alta' }));
    if (ed.sinRecs !== undefined) c.sinRecomendaciones = sinRecs;
    if (ed.fallas !== undefined) c.fallas = fallas;
    if (ed.sinFallas !== undefined) c.sinFallas = sinFallas;
    if (ed.comentario !== undefined) c.comentarioPruebas = comentario.trim() || null;
    if (ed.diag !== undefined) c.diagnostico = ed.diag;
    return c;
  }

  async function guardar() {
    if (!sucio || guardando) return;
    const cuerpo = armarCuerpo();
    if (typeof cuerpo === 'string') return setMensaje({ tipo: 'error', texto: cuerpo });
    setGuardando(true);
    setMensaje(null);
    try {
      const r = await guardarCabeceraInforme(token, idOs, idOsEquipo, cuerpo);
      setGuardada(r.cabecera);
      setEd({});
      setMensaje({ tipo: 'info', texto: r.mensaje });
      await recargar();
      setGuardada(null);
    } catch (e) {
      setMensaje({ tipo: 'error', texto: e instanceof Error ? e.message : 'No se pudo guardar la cabecera.', detalle: e instanceof ErrorApi && e.estadoHttp === 0 ? e.detalleTecnico : undefined });
    } finally {
      setGuardando(false);
    }
  }

  function guardarFalla(f: FallaEditable) {
    const cuerpo = fallaACuerpo(f);
    const lista = modal?.indice === null || modal?.indice === undefined ? [...fallas, cuerpo] : fallas.map((x, i) => (i === modal.indice ? cuerpo : x));
    cambiar({ fallas: lista, sinFallas: false });
    setModal(null);
  }

  const progreso = vista ? progresoObservacion(vista) : null;
  const porcentaje = vista ? progresoInforme(vista) : 0;

  return (
    <SafeAreaView style={estilos.area} edges={['top']}>
      <EncabezadoApp nombre={usuario?.nombre ?? ''} apellido={usuario?.apellido} subtitulo={`${usuario?.nombre ?? ''} · ${cargo}`} />
      <View style={{ flex: 1 }}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[estilos.contenido, { paddingHorizontal: d.margen, maxWidth: d.anchoMaximo }]}
          refreshControl={<RefreshControl refreshing={recargando} onRefresh={() => void recargar()} colors={[colores.primario]} />}
        >
          <View style={estilos.tituloFila}>
            <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Volver">
              <Ionicons name="arrow-back" size={24} color={colores.titulo} />
            </Pressable>
            <Text style={[estilos.titulo, { fontSize: d.tituloPantalla }]} accessibilityRole="header">
              Cabecera del informe
            </Text>
          </View>

          {cargando ? (
            <ActivityIndicator color={colores.primario} style={{ marginTop: 40 }} />
          ) : error || !cab || !diag || !vista || !progreso ? (
            <Aviso tipo="error" mensaje={error ?? 'No se encontró el informe del equipo.'} />
          ) : (
            <>
              <Text style={estilos.subtitulo}>
                {cab.datos.tipoOrden} {cab.datos.numeroOs.replace(/^(OS|OM)-?/i, '')}
                {cab.datos.empresa ? ` · ${cab.datos.empresa}` : ''}
              </Text>
              {datos?.sinConexion && (
                <View style={{ marginBottom: 10 }}>
                  <Aviso mensaje={`Sin conexión: se muestra lo último guardado (${horaRespaldo(datos.guardadoEn)}). Guardar exige conexión.`} />
                </View>
              )}
              {!cab.datos.puedeEditar && !datos?.sinConexion && (
                <View style={{ marginBottom: 10 }}>
                  <Aviso mensaje={cab.datos.generado ? 'El informe técnico ya fue generado: la cabecera es de solo lectura.' : 'Solo se edita con el equipo en ejecución: reanúdalo o inícialo desde los objetivos.'} />
                </View>
              )}

              <View style={estilos.pestanas} accessibilityRole="tablist">
                {PESTANAS.map((p) => (
                  <Pressable key={p.id} onPress={() => setTab(p.id)} style={[estilos.pestana, tab === p.id && estilos.pestanaActiva]} accessibilityRole="tab" accessibilityState={{ selected: tab === p.id }} testID={`pestana-${p.id}`}>
                    <Text style={[estilos.pestanaTexto, tab === p.id && { color: colores.primario, fontWeight: '800' }]} numberOfLines={1}>
                      {p.texto}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {mensaje && (
                <View style={{ marginTop: 12 }} testID="mensaje-cabecera">
                  <Aviso tipo={mensaje.tipo} mensaje={mensaje.texto} />
                  {!!mensaje.detalle && <Text style={estilos.detalleTecnico} selectable>Detalle técnico: {mensaje.detalle}</Text>}
                </View>
              )}

              {tab === 'datos' && (
                <View style={{ marginTop: 14, gap: 12 }} testID="tab-datos">
                  <View style={estilos.tarjeta}>
                    <Text style={estilos.numeroInforme}>NRO. DE INFORME: {cab.datos.numeroInforme ?? 'se asigna al generar'}</Text>
                    <Text style={estilos.centrado}>
                      RQ: {cab.datos.numeroRq?.replace(/^RQ-?/i, '') ?? '—'} · {cab.datos.tipoOrden}: {cab.datos.numeroOs.replace(/^(OS|OM)-?/i, '')}
                    </Text>
                    <View style={estilos.insignia}>
                      <Text style={estilos.insigniaTexto}>{cab.datos.tipoOrden === 'OM' ? 'OM · METROLOGÍA (SEGÚN RQ)' : 'OS · SERVICIO TÉCNICO (SEGÚN RQ)'}</Text>
                    </View>
                    <View style={estilos.cliente}>
                      <Text style={estilos.clienteTexto}>
                        <Text style={estilos.negrita}>Empresa: </Text>
                        {[cab.datos.ruc, cab.datos.empresa].filter(Boolean).join(' - ') || '—'}
                      </Text>
                      <Text style={estilos.clienteTexto}>
                        <Text style={estilos.negrita}>Dirección: </Text>
                        {cab.datos.direccion ?? '—'}
                      </Text>
                      <Text style={estilos.clienteTexto}>
                        <Text style={estilos.negrita}>Contacto: </Text>
                        {[cab.datos.contacto, cab.datos.contactoTelefono, cab.datos.contactoCorreo].filter(Boolean).join(' / ') || '—'}
                      </Text>
                    </View>
                  </View>

                  <Text style={estilos.seccion}>ESPECIFICACIONES DEL EQUIPO</Text>
                  <Cuadricula
                    filas={[
                      ['Marca', cab.datos.marca],
                      ['Modelo', cab.datos.modelo],
                      ['Serie', cab.datos.numSerie],
                      ['Código', cab.datos.codigoCliente],
                      ['Capacidad Máx.', cab.datos.capacidadMax],
                      ['Código TW', cab.datos.codigoTw],
                      ['d', cab.datos.d],
                      ['e', cab.datos.e],
                    ]}
                  />
                  <Cuadricula filas={[['Ubicación', cab.datos.ubicacion]]} ancho />

                  <Text style={estilos.seccion}>DATOS DEL INFORME</Text>
                  <Cuadricula
                    filas={[
                      ['Propuesta', cab.datos.propuesta],
                      ['Comercial', cab.datos.comercial],
                      ['Técnico', cab.datos.tecnico],
                      ['Fecha', cab.datos.fecha ? cab.datos.fecha.split('-').reverse().join('/') : null],
                      ['Hora inicio', cab.datos.horaInicio],
                      ['Hora fin', cab.datos.horaFin],
                      ['Tipo de servicio', cab.datos.tipoServicio],
                      ['Clase', cab.datos.clase],
                    ]}
                  />

                  <Text style={estilos.seccion}>QUIEN ATIENDE EN PLANTA</Text>
                  <View style={estilos.tarjeta}>
                    <Campo etiqueta="Nombre" valor={resp.nombre} onCambio={(t) => cambiar({ respNombre: t.slice(0, 150) })} editable={editable} testID="resp-nombre" />
                    <Campo etiqueta="Cargo del cliente" valor={resp.cargo} onCambio={(t) => cambiar({ respCargo: t.slice(0, 100) })} editable={editable} testID="resp-cargo" />
                    <Campo etiqueta="Teléfono" valor={resp.telefono} onCambio={(t) => cambiar({ respTelefono: t.slice(0, 30) })} editable={editable} teclado="phone-pad" testID="resp-telefono" />
                    <Text style={estilos.ayuda}>Por defecto es el contacto de la orden; cambia si atendió otra persona. Se usa en la Firma de informes.</Text>
                  </View>
                </View>
              )}

              {tab === 'detalle' && (
                <View style={{ marginTop: 14, gap: 12 }} testID="tab-detalle">
                  <View style={estilos.info}>
                    <Ionicons name="git-branch-outline" size={18} color={colores.primario} />
                    <Text style={estilos.infoTexto}>
                      El checklist se carga según el tipo de trabajo de la RQ ({cab.datos.tipoOrden === 'OM' ? 'calibración en OM' : 'mantenimiento en OS'}).
                    </Text>
                  </View>
                  <Selector
                    etiqueta="Tipo de equipo"
                    placeholder="Elige el tipo de equipo"
                    opciones={cab.opciones.tiposEquipo.map((t) => ({ valor: t.codigo, texto: t.nombre }))}
                    valor={tipoEquipo}
                    onCambio={(v) => editable && cambiar({ tipoEquipo: v })}
                    testID="tipo-equipo"
                  />
                  <Text style={estilos.ayuda}>Lista desplegable con los tipos tal cual · precargado desde la RQ {cab.datos.numeroRq?.replace(/^RQ-?/i, '') ?? ''}.</Text>

                  <View style={estilos.tarjeta}>
                    <Text style={estilos.etiqueta}>Celdas (mV)</Text>
                    <View style={estilos.celdas}>
                      {celdas.map((c, i) => (
                        <View key={i} style={{ width: '48%' }}>
                          <Text style={estilos.ayuda}>Celda {i + 1} (mv)</Text>
                          <TextInput
                            value={c}
                            onChangeText={(t) => editable && cambiar({ celdas: celdas.map((x, j) => (j === i ? t : x)) })}
                            editable={editable}
                            keyboardType="decimal-pad"
                            placeholder="0.0"
                            placeholderTextColor={colores.placeholder}
                            style={estilos.entrada}
                            testID={`celda-${i + 1}`}
                          />
                        </View>
                      ))}
                    </View>
                    {editable && celdas.length < MAX_CELDAS && (
                      <Pressable onPress={() => cambiar({ celdas: [...celdas, ''] })} style={estilos.enlace} accessibilityRole="button" testID="agregar-celda">
                        <Ionicons name="add-circle-outline" size={20} color={colores.primario} />
                        <Text style={estilos.enlaceTexto}>Agregar celda</Text>
                      </Pressable>
                    )}
                  </View>

                  {editable && (
                    <Pressable onPress={() => cambiar({ checks: alternarChecks((det?.checklist ?? []).map((p) => p.codigo), marcados) })} style={estilos.botonSecundario} accessibilityRole="button" testID="marcar-todos">
                      <Text style={estilos.botonSecundarioTexto}>{(det?.checklist ?? []).every((p) => marcados.has(p.codigo)) ? 'Desmarcar todos los checks' : 'Marcar TODOS los checks'}</Text>
                    </Pressable>
                  )}
                  <View style={estilos.tarjeta}>
                    {(det?.checklist ?? []).map((p) => (
                      <Pressable
                        key={p.codigo}
                        onPress={() => {
                          if (!editable) return;
                          const n = new Set(marcados);
                          if (n.has(p.codigo)) n.delete(p.codigo);
                          else n.add(p.codigo);
                          cambiar({ checks: n });
                        }}
                        style={estilos.check}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: marcados.has(p.codigo) }}
                        testID={`check-${p.codigo}`}
                      >
                        <Ionicons name={marcados.has(p.codigo) ? 'checkbox' : 'square-outline'} size={26} color={marcados.has(p.codigo) ? colores.primario : colores.textoSecundario} />
                        <Text style={estilos.checkTexto}>{p.titulo}</Text>
                      </Pressable>
                    ))}
                  </View>

                  <View style={estilos.tarjeta}>
                    <View style={{ flexDirection: 'row', gap: 10 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={estilos.ayuda}>Pruebas de sumatoria hasta ({unidad})</Text>
                        <TextInput value={suma} onChangeText={(t) => editable && cambiar({ suma: t })} editable={editable} keyboardType="decimal-pad" style={estilos.entrada} testID="suma-hasta" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={estilos.ayuda}>Pruebas por comparación de pesos hasta ({unidad})</Text>
                        <TextInput value={comp} onChangeText={(t) => editable && cambiar({ comp: t })} editable={editable} keyboardType="decimal-pad" style={estilos.entrada} testID="comparacion-hasta" />
                      </View>
                    </View>
                    <View style={estilos.filaSiNo}>
                      <Text style={estilos.checkTexto}>Tiene anillos de fijación</Text>
                      <View style={estilos.siNo}>
                        {([true, false] as const).map((v) => (
                          <Pressable key={String(v)} onPress={() => editable && cambiar({ anillos: v })} style={[estilos.siNoBoton, anillos === v && estilos.siNoActivo]} accessibilityRole="button" accessibilityState={{ selected: anillos === v }} testID={v ? 'anillos-si' : 'anillos-no'}>
                            <Text style={[estilos.siNoTexto, anillos === v && { color: colores.blanco }]}>{v ? 'Sí' : 'No'}</Text>
                          </Pressable>
                        ))}
                      </View>
                    </View>
                  </View>

                  <View style={estilos.info}>
                    <Ionicons name="information-circle-outline" size={18} color={colores.primario} />
                    <Text style={estilos.infoTexto}>Fallas, severidad y switches (Jefatura, precotización, segunda visita) se registran en la pestaña Observación y pruebas.</Text>
                  </View>
                  <Progreso etiqueta="Progreso del informe" valor={`${porcentaje} %`} fraccion={porcentaje / 100} />
                </View>
              )}

              {tab === 'observacion' && (
                <View style={{ marginTop: 14, gap: 12 }} testID="tab-observacion">
                  <View style={estilos.filaCabeceraBloques}>
                    <Text style={estilos.ayuda}>Toca una sección para desplegarla</Text>
                    <Pressable onPress={() => setAbiertos(abiertos.size === BLOQUES.length ? new Set() : new Set(BLOQUES))} accessibilityRole="button" testID="expandir-todo">
                      <Text style={estilos.enlaceTexto}>{abiertos.size === BLOQUES.length ? 'Contraer todo' : 'Expandir todo'}</Text>
                    </Pressable>
                  </View>
                  {(() => {
                    const b = bloquesObservacion(vista);
                    const pruebas = estadoPruebasGenerales(cab.pruebasGenerales);
                    return (
                      <>
                        <BloqueObs
                          abierto={abiertos.has('rec')}
                          onToggle={() => alternar('rec')}
                          completo={b.recomendaciones}
                          numero={1}
                          icono="chatbox-ellipses-outline"
                          titulo="Recomendaciones inmediatas"
                          etiqueta={b.recomendaciones ? { texto: 'COMPLETO', verde: true } : { texto: 'PENDIENTE' }}
                          resumen={recs.find((t) => t.trim()) ?? (sinRecs ? 'Sin recomendaciones' : 'Sin registrar')}
                          testID="bloque-recomendaciones"
                        >
                          {recs.map((t, i) => (
                            <View key={i} style={estilos.filaRec}>
                              <TextInput
                                value={t}
                                onChangeText={(x) => editable && cambiar({ recs: recs.map((r, j) => (j === i ? x.slice(0, MAX_RECOMENDACION) : r)), sinRecs: false })}
                                editable={editable}
                                multiline
                                placeholder="Recomendación para el cliente"
                                placeholderTextColor={colores.placeholder}
                                style={[estilos.entrada, { flex: 1, minHeight: 48, textAlign: 'left', paddingHorizontal: 10 }]}
                                testID={`recomendacion-${i + 1}`}
                              />
                              {editable && (
                                <Pressable onPress={() => cambiar({ recs: recs.filter((_, j) => j !== i) })} hitSlop={8} accessibilityRole="button" accessibilityLabel="Quitar recomendación">
                                  <Ionicons name="trash-outline" size={22} color={colores.rojo} />
                                </Pressable>
                              )}
                            </View>
                          ))}
                          {editable && recs.length < MAX_RECOMENDACIONES && (
                            <Pressable onPress={() => cambiar({ recs: [...recs, ''], sinRecs: false })} style={estilos.enlace} accessibilityRole="button" testID="agregar-recomendacion">
                              <Ionicons name="add-circle-outline" size={20} color={colores.primario} />
                              <Text style={estilos.enlaceTexto}>Agregar recomendación</Text>
                            </Pressable>
                          )}
                          {recs.length === 0 && <Interruptor titulo="Sin recomendaciones" detalle="No hay nada que recomendar al cliente" valor={sinRecs} onCambio={(v) => cambiar({ sinRecs: v })} editable={editable} testID="sin-recomendaciones" />}
                        </BloqueObs>

                        <BloqueObs
                          abierto={abiertos.has('fal')}
                          onToggle={() => alternar('fal')}
                          completo={b.fallas}
                          numero={2}
                          icono="warning-outline"
                          titulo="Fallas y su prueba"
                          etiqueta={fallas.length > 0 ? { texto: textoConPrueba(fallas), verde: b.fallas } : b.fallas ? { texto: 'SIN FALLAS', verde: true } : { texto: 'PENDIENTE' }}
                          resumen={fallas.length > 0 ? textoFallas(fallas.length) : sinFallas ? 'Sin fallas' : textoFallas(0)}
                          testID="bloque-fallas"
                        >
                          {fallas.map((f, i) => (
                            <TarjetaFalla key={i} falla={f} clase={clase} e={eDiv} unidad={unidad} cab={cab} editable={editable} onEditar={() => setModal({ indice: i, inicial: fallaDesdeCuerpo(f) })} onQuitar={() => cambiar({ fallas: fallas.filter((_, j) => j !== i) })} />
                          ))}
                          {editable && fallas.length < MAX_FALLAS && (
                            <Pressable onPress={() => setModal({ indice: null, inicial: fallaVacia() })} style={estilos.botonSecundario} accessibilityRole="button" testID="agregar-falla">
                              <Ionicons name="add-circle-outline" size={20} color={colores.primario} />
                              <Text style={estilos.botonSecundarioTexto}>Agregar falla con prueba</Text>
                            </Pressable>
                          )}
                          {fallas.length === 0 && <Interruptor titulo="Sin fallas" detalle="El equipo no presentó fallas" valor={sinFallas} onCambio={(v) => cambiar({ sinFallas: v })} editable={editable} testID="sin-fallas" />}
                        </BloqueObs>

                        <BloqueObs
                          abierto={abiertos.has('pru')}
                          onToggle={() => alternar('pru')}
                          completo={b.pruebas}
                          numero={3}
                          icono="grid-outline"
                          titulo="Pruebas generales (formato resumido)"
                          etiqueta={pruebas === 'conforme' ? { texto: 'CONFORME', verde: true } : pruebas === 'no_conforme' ? { texto: 'NO CONFORME', rojo: true } : { texto: 'PENDIENTE' }}
                          resumen={pruebas === 'pendiente' ? 'Finaliza Ensayos y Calibración para ver el resumen' : pruebas === 'no_conforme' ? 'Hay lecturas fuera de EMP' : 'Pesaje y excentricidad conformes'}
                          testID="bloque-pruebas"
                        >
                          <PruebasGeneralesVista
                            p={cab.pruebasGenerales}
                            unidad={unidad}
                            onIrAEnsayos={editable ? () => router.push({ pathname: '/ensayos', params: { id: String(idOs), equipo: String(idOsEquipo) } }) : undefined}
                          />
                          <Text style={estilos.ayuda}>Comentario de las pruebas (opcional)</Text>
                          <TextInput
                            value={comentario}
                            onChangeText={(t) => editable && cambiar({ comentario: t.slice(0, MAX_COMENTARIO_PRUEBAS) })}
                            editable={editable}
                            multiline
                            placeholder="Observaciones sobre las pruebas"
                            placeholderTextColor={colores.placeholder}
                            style={[estilos.entrada, { minHeight: 64, textAlign: 'left', paddingHorizontal: 10, textAlignVertical: 'top' }]}
                            testID="comentario-pruebas"
                          />
                        </BloqueObs>

                        <BloqueObs
                          abierto={abiertos.has('dia')}
                          onToggle={() => alternar('dia')}
                          completo={b.diagnostico}
                          numero={4}
                          icono="medkit-outline"
                          titulo="Diagnóstico final"
                          etiqueta={b.diagnostico ? { texto: 'COMPLETO', verde: true } : { texto: 'PENDIENTE' }}
                          resumen={b.diagnostico ? `${textoSeveridad(diag.severidadGeneral)} · ${textoEstadoEquipo(diag.estadoEquipo)}` : 'Falta la severidad general y el estado del equipo'}
                          testID="bloque-diagnostico"
                        >
                          <Text style={estilos.etiqueta}>Severidad general *</Text>
                          <View style={estilos.segmentos}>
                            {SEVERIDADES.map((s) => (
                              <Pressable key={s.valor} onPress={() => editable && cambiar({ diag: { ...diag, severidadGeneral: s.valor } })} style={[estilos.segmento, diag.severidadGeneral === s.valor && (s.valor === 'alta' ? estilos.segmentoNaranja : s.valor === 'critica' ? estilos.segmentoRojo : estilos.segmentoActivo)]} accessibilityRole="button" accessibilityState={{ selected: diag.severidadGeneral === s.valor }} testID={`diag-severidad-${s.valor}`}>
                                <Text style={[estilos.segmentoTexto, diag.severidadGeneral === s.valor && { color: colores.blanco }]}>{s.texto}</Text>
                              </Pressable>
                            ))}
                          </View>
                          <Text style={[estilos.etiqueta, { marginTop: 10 }]}>Estado del equipo *</Text>
                          <View style={estilos.segmentos}>
                            {ESTADOS_EQUIPO.map((s) => (
                              <Pressable key={s.valor} onPress={() => editable && cambiar({ diag: { ...diag, estadoEquipo: s.valor } })} style={[estilos.segmento, diag.estadoEquipo === s.valor && estilos.segmentoActivo]} accessibilityRole="button" accessibilityState={{ selected: diag.estadoEquipo === s.valor }} testID={`diag-estado-${s.valor}`}>
                                <Text style={[estilos.segmentoTexto, diag.estadoEquipo === s.valor && { color: colores.blanco }]} numberOfLines={2}>{s.texto}</Text>
                              </Pressable>
                            ))}
                          </View>
                          <Interruptor titulo="Revisión de Jefatura" detalle="Notifica al Jefe de Servicio Técnico" valor={diag.revisionJefatura} onCambio={(v) => cambiar({ diag: { ...diag, revisionJefatura: v } })} editable={editable} testID="sw-jefatura" />
                          <Interruptor titulo="Precotización" detalle="Repuestos o servicio adicional" valor={diag.precotizacion} onCambio={(v) => cambiar({ diag: { ...diag, precotizacion: v } })} editable={editable} testID="sw-precotizacion" />
                          <Interruptor titulo="Segunda visita" detalle="Se programa nueva atención" valor={diag.segundaVisita} onCambio={(v) => cambiar({ diag: { ...diag, segundaVisita: v } })} editable={editable} testID="sw-segunda-visita" />
                          <Interruptor titulo="Aplica garantía" detalle="Dentro del período de garantía" valor={diag.aplicaGarantia} onCambio={(v) => cambiar({ diag: { ...diag, aplicaGarantia: v } })} editable={editable} testID="sw-garantia" />
                        </BloqueObs>
                      </>
                    );
                  })()}
                  <Progreso etiqueta="Progreso de la pestaña" valor={textoProgreso(progreso.n, progreso.total)} fraccion={progreso.fraccion} />
                </View>
              )}
              <View style={{ height: 90 }} />
            </>
          )}
        </ScrollView>

        {!!cab && (
          <Pressable
            onPress={() => void guardar()}
            disabled={!editable || !sucio || guardando}
            style={[estilos.flotante, (!editable || !sucio) && { opacity: 0.45 }]}
            accessibilityRole="button"
            accessibilityLabel="Guardar"
            accessibilityState={{ disabled: !editable || !sucio || guardando }}
            testID="guardar-cabecera"
          >
            {guardando ? <ActivityIndicator color={colores.primario} /> : <Ionicons name="save-outline" size={26} color={colores.primario} />}
          </Pressable>
        )}
      </View>

      {!!cab && !!modal && (
        <NuevaFallaModal
          visible
          token={token}
          idOs={idOs}
          idOsEquipo={idOsEquipo}
          clase={clase}
          e={eDiv}
          unidad={unidad}
          clasificaciones={cab.opciones.clasificaciones}
          componentes={cab.opciones.componentes}
          inicial={modal.inicial}
          esNueva={modal.indice === null}
          onGuardar={guardarFalla}
          onCerrar={() => setModal(null)}
        />
      )}
    </SafeAreaView>
  );
}

/** Una falla guardada → lo editable en el modal. */
function fallaDesdeCuerpo(c: CuerpoFalla): FallaEditable {
  return fallaDesde({
    idObservacion: 0, codigo: '', clasificacion: c.clasificacion, componente: c.componente, clasificacionNombre: null, componenteNombre: null, descripcion: c.descripcion,
    severidad: c.severidad, fotos: c.fotos,
    pruebas: c.pruebas.map((p, i) => ({ tipo: p.tipo, orden: i + 1, posicion: p.posicion, carga: p.carga, indicacion: p.indicacion, error: 0, emp: null, resultado: null })),
  });
}

// ── Piezas de la pantalla ───────────────────────────────────────────────────────────────────────

function Cuadricula({ filas, ancho = false }: { filas: [string, string | null | undefined][]; ancho?: boolean }) {
  return (
    <View style={estilos.cuadricula}>
      {filas.map(([k, v]) => (
        <View key={k} style={{ width: ancho ? '100%' : '48%' }}>
          <Text style={estilos.celdaK}>{k}</Text>
          <Text style={estilos.celdaV}>{v?.toString().trim() || '—'}</Text>
        </View>
      ))}
    </View>
  );
}

function Campo(props: { etiqueta: string; valor: string; onCambio: (t: string) => void; editable: boolean; teclado?: 'default' | 'phone-pad'; testID: string }) {
  return (
    <View style={{ marginBottom: 10 }}>
      <Text style={estilos.etiqueta}>{props.etiqueta}</Text>
      <TextInput
        value={props.valor}
        onChangeText={(t) => props.editable && props.onCambio(t)}
        editable={props.editable}
        keyboardType={props.teclado ?? 'default'}
        placeholderTextColor={colores.placeholder}
        style={[estilos.entrada, { textAlign: 'left', paddingHorizontal: 12 }, !props.editable && { backgroundColor: colores.grisFondo }]}
        testID={props.testID}
      />
    </View>
  );
}

function Progreso({ etiqueta, valor, fraccion }: { etiqueta: string; valor: string; fraccion: number }) {
  return (
    <View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={estilos.progresoK}>{etiqueta}</Text>
        <Text style={estilos.progresoV}>{valor}</Text>
      </View>
      <View style={estilos.barra}>
        <View style={[estilos.barraRelleno, { width: `${Math.round(Math.max(0, Math.min(1, fraccion)) * 100)}%` }]} />
      </View>
    </View>
  );
}

function Interruptor(props: { titulo: string; detalle: string; valor: boolean; onCambio: (v: boolean) => void; editable: boolean; testID: string }) {
  return (
    <View style={estilos.interruptor}>
      <View style={{ flex: 1 }}>
        <Text style={estilos.checkTexto}>{props.titulo}</Text>
        <Text style={estilos.ayuda}>{props.detalle}</Text>
      </View>
      <Switch value={props.valor} onValueChange={(v) => { if (props.editable) props.onCambio(v); }} disabled={!props.editable} trackColor={{ true: colores.primario, false: colores.borde }} thumbColor={colores.blanco} testID={props.testID} />
    </View>
  );
}

function BloqueObs(props: {
  abierto: boolean;
  onToggle: () => void;
  completo: boolean;
  numero: number;
  icono: keyof typeof Ionicons.glyphMap;
  titulo: string;
  etiqueta: { texto: string; verde?: boolean; rojo?: boolean };
  resumen: string;
  testID: string;
  children: React.ReactNode;
}) {
  const e = props.etiqueta;
  return (
    <View style={[estilos.bloque, props.abierto && { borderColor: colores.primario }]} testID={props.testID}>
      <Pressable onPress={props.onToggle} style={estilos.bloqueCabecera} accessibilityRole="button" accessibilityState={{ expanded: props.abierto }}>
        {props.completo ? (
          <Ionicons name="checkmark-circle" size={28} color={colores.verde} />
        ) : (
          <View style={estilos.numero}>
            <Text style={estilos.numeroTexto}>{props.numero}</Text>
          </View>
        )}
        <Ionicons name={props.icono} size={22} color={colores.primario} />
        <View style={{ flex: 1 }}>
          <Text style={estilos.bloqueTitulo}>{props.titulo}</Text>
          <Text style={estilos.bloqueResumen} numberOfLines={3}>
            {props.resumen}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 6 }}>
          <View style={[estilos.pill, { backgroundColor: e.verde ? colores.verdeEtiquetaFondo : e.rojo ? colores.rojoEtiquetaFondo : colores.amarilloFondo }]}>
            <Text style={[estilos.pillTexto, { color: e.verde ? colores.verdeEtiquetaTexto : e.rojo ? colores.rojoEtiquetaTexto : colores.amarilloTexto }]}>{e.texto}</Text>
          </View>
          <Ionicons name={props.abierto ? 'chevron-up' : 'chevron-down'} size={20} color={colores.textoSecundario} />
        </View>
      </Pressable>
      {props.abierto && <View style={estilos.bloqueCuerpo}>{props.children}</View>}
    </View>
  );
}

function TarjetaFalla(props: { falla: CuerpoFalla; clase: string | null; e: number | null; unidad: string; cab: CabeceraInforme; editable: boolean; onEditar: () => void; onQuitar: () => void }) {
  const { falla, cab } = props;
  const sev = falla.severidad as Severidad;
  const claNombre = cab.opciones.clasificaciones.find((c) => c.codigo === falla.clasificacion)?.nombre ?? falla.clasificacion;
  const comNombre = cab.opciones.componentes.find((c) => c.codigo === falla.componente)?.nombre ?? falla.componente;
  const filas = calcularLecturas(props.clase, props.e, falla.pruebas.map((p) => ({ posicion: p.posicion, carga: String(p.carga), indicacion: String(p.indicacion) })));
  const tipo = falla.pruebas[0]?.tipo ?? 'repetibilidad';
  return (
    <View style={estilos.falla} testID="tarjeta-falla">
      <Pressable onPress={props.editable ? props.onEditar : undefined} accessibilityRole="button">
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
          <Text style={[estilos.fallaTitulo, { flex: 1 }]}>{comNombre}</Text>
          <View style={[estilos.pill, { backgroundColor: sev === 'critica' ? colores.rojoEtiquetaFondo : sev === 'alta' ? '#FFEDD5' : colores.amarilloFondo }]}>
            <Text style={[estilos.pillTexto, { color: sev === 'critica' ? colores.rojoEtiquetaTexto : sev === 'alta' ? '#9A3412' : colores.amarilloTexto }]}>{textoSeveridad(sev).toUpperCase()}</Text>
          </View>
        </View>
        <Text style={estilos.fallaDescripcion}>{falla.descripcion}</Text>
        <View style={estilos.chips}>
          {falla.fotos.length > 0 && (
            <View style={estilos.chip}>
              <Ionicons name="images-outline" size={13} color={colores.azulTexto} />
              <Text style={estilos.chipTexto}>{falla.fotos.length} {falla.fotos.length === 1 ? 'foto' : 'fotos'}</Text>
            </View>
          )}
          <View style={estilos.chip}>
            <Text style={estilos.chipTexto}>{claNombre} · {comNombre}</Text>
          </View>
          <View style={[estilos.chip, { backgroundColor: colores.verdeEtiquetaFondo }]}>
            <Ionicons name="flask-outline" size={13} color={colores.verdeEtiquetaTexto} />
            <Text style={[estilos.chipTexto, { color: colores.verdeEtiquetaTexto }]}>CON PRUEBA</Text>
          </View>
        </View>
        <Text style={estilos.fallaSub}>Prueba que la justifica · {tipo === 'excentricidad' ? 'Excentricidad' : tipo === 'pesaje' ? 'Pesaje' : 'Repetibilidad'}</Text>
        <View style={estilos.minitabla}>
          {filas.map((r, i) => (
            <View key={i} style={estilos.minifila}>
              <Text style={estilos.minicelda}>{formatoMiles(r.carga)}</Text>
              <Text style={estilos.minicelda}>{formatoMiles(r.indicacion)}</Text>
              <Text style={[estilos.minicelda, { fontWeight: '800' }, r.resultado === 'no_conforme' && { color: colores.rojo }]}>{formatoError(r.error)}</Text>
              <Text style={estilos.minicelda}>{r.emp == null ? '—' : `±${formatoMiles(r.emp)}`}</Text>
              <Ionicons name={r.resultado === 'no_conforme' ? 'close-circle' : r.resultado === 'conforme' ? 'checkmark-circle' : 'ellipse-outline'} size={18} color={r.resultado === 'no_conforme' ? colores.rojo : r.resultado === 'conforme' ? colores.verde : colores.textoSecundario} />
            </View>
          ))}
          <Text style={estilos.minicabecera}>L ({props.unidad}) · I ({props.unidad}) · E · EMP</Text>
        </View>
      </Pressable>
      {props.editable && (
        <Pressable onPress={props.onQuitar} style={estilos.enlace} accessibilityRole="button" testID="quitar-falla">
          <Ionicons name="trash-outline" size={18} color={colores.rojo} />
          <Text style={[estilos.enlaceTexto, { color: colores.rojo }]}>Quitar esta falla</Text>
        </Pressable>
      )}
    </View>
  );
}

/** Posición de cada lectura sobre el plato (HU-10): 1 centro, 2 arriba-izquierda, 3 abajo-izquierda, 4 abajo-derecha, 5 arriba-derecha. */
const LUGAR_POSICION: Record<number, { left?: `${number}%`; right?: `${number}%`; top?: number; bottom?: number }> = {
  1: { left: '35%', top: 52 },
  2: { left: '3%', top: 8 },
  3: { left: '3%', bottom: 8 },
  4: { right: '3%', bottom: 8 },
  5: { right: '3%', top: 8 },
};

/**
 * "Pruebas generales (formato resumido)": solo lectura de lo que guardó Ensayos y Calibración (HU-10). Muestra el resumen (cuántas lecturas están dentro del EMP),
 * la tabla de pesaje con su error E = I − L, el plato de la excentricidad con cada posición y, si hay un error crítico, qué lecturas se salieron y cómo corregirlo.
 */
function PruebasGeneralesVista({ p, unidad, onIrAEnsayos }: { p: CabeceraInforme['pruebasGenerales']; unidad: string; onIrAEnsayos?: () => void }) {
  if (!p.finalizado) {
    return (
      <View style={estilos.pgVacio}>
        <Ionicons name="time-outline" size={22} color={colores.textoSecundario} />
        <Text style={[estilos.ayuda, { flex: 1 }]}>Todavía no se finalizaron los ensayos: se muestran aquí al finalizar Ensayos y Calibración.</Text>
        {onIrAEnsayos && (
          <Pressable onPress={onIrAEnsayos} accessibilityRole="button" testID="ir-a-ensayos">
            <Text style={estilos.enlaceTexto}>Ir a Ensayos</Text>
          </Pressable>
        )}
      </View>
    );
  }
  const r = resumenPruebasGenerales(p);
  const mal = r.fuera > 0 || !!p.errorCritico;
  return (
    <View style={{ gap: 12 }} testID="pruebas-generales">
      <View style={[estilos.pgResumen, mal ? estilos.pgResumenMal : estilos.pgResumenBien]} testID="pruebas-resumen">
        <Ionicons name={mal ? 'alert-circle' : 'checkmark-circle'} size={28} color={mal ? colores.rojo : colores.verde} />
        <View style={{ flex: 1 }}>
          <Text style={[estilos.pgResumenTitulo, { color: mal ? colores.rojoEtiquetaTexto : colores.verdeEtiquetaTexto }]}>{mal ? 'Hay lecturas fuera de EMP' : 'Todas las lecturas están dentro de EMP'}</Text>
          <Text style={estilos.pgResumenDetalle}>{textoLecturasDentro(r)}</Text>
        </View>
      </View>

      <View style={estilos.pgChips}>
        <View style={[estilos.pgChip, r.pesaje.dentro < r.pesaje.total && estilos.pgChipMal]}>
          <Text style={[estilos.pgChipTexto, r.pesaje.dentro < r.pesaje.total && { color: colores.rojoEtiquetaTexto }]}>Pesaje {r.pesaje.dentro}/{r.pesaje.total}</Text>
        </View>
        <View style={[estilos.pgChip, r.excentricidad.dentro < r.excentricidad.total && estilos.pgChipMal]}>
          <Text style={[estilos.pgChipTexto, r.excentricidad.dentro < r.excentricidad.total && { color: colores.rojoEtiquetaTexto }]}>
            Excentricidad {r.excentricidad.dentro}/{r.excentricidad.total}
          </Text>
        </View>
      </View>
      <Text style={estilos.ayuda}>Tomado de Ensayos y Calibración (solo lectura). E = I − L; EMP = error máximo permitido para esa carga.</Text>

      {/* Pesaje */}
      <View style={estilos.pgCaja}>
        <View style={estilos.pgCajaTitulo}>
          <Ionicons name="scale-outline" size={18} color={colores.titulo} />
          <Text style={estilos.pgTitulo}>Pesaje</Text>
          <Text style={estilos.pgUnidad}>({unidad})</Text>
        </View>
        <View style={estilos.pgFila}>
          {['Carga L', 'Indicación I', 'Error E', 'EMP'].map((t, i) => (
            <Text key={t} style={[estilos.pgCabecera, { flex: i === 3 ? 0.8 : 1 }]}>
              {t}
            </Text>
          ))}
          <View style={{ width: 24 }} />
        </View>
        {p.pesaje.map((l, i) => {
          const fuera = l.resultado === 'no_conforme';
          return (
            <View key={l.orden} style={[estilos.pgFila, i % 2 === 1 && estilos.pgFilaAlterna, fuera && estilos.pgFilaFuera]} testID={`pesaje-${l.orden}`}>
              <Text style={[estilos.pgCelda, { flex: 1 }]}>{formatoMiles(l.carga)}</Text>
              <Text style={[estilos.pgCelda, { flex: 1 }]}>{formatoMiles(l.indicacion)}</Text>
              <Text style={[estilos.pgCelda, { flex: 1, fontWeight: '800' }, fuera && { color: colores.rojo }]}>{formatoError(l.error)}</Text>
              <Text style={[estilos.pgCelda, { flex: 0.8 }]}>{l.emp == null ? '—' : `±${formatoMiles(l.emp)}`}</Text>
              <Ionicons name={fuera ? 'close-circle' : 'checkmark-circle'} size={22} color={fuera ? colores.rojo : colores.verde} />
            </View>
          );
        })}
      </View>

      {/* Excentricidad: una tarjeta por carga, con las posiciones sobre el plato */}
      {p.excentricidad.map((g) => {
        const fuera = g.lecturas.some((l) => l.resultado === 'no_conforme');
        const dif = diferenciaExcentricidad(g.lecturas);
        const emp = g.lecturas.find((l) => l.emp != null)?.emp ?? null;
        const plato = g.lecturas.length === 5 && g.lecturas.every((l) => LUGAR_POSICION[l.orden]);
        return (
          <View key={g.grupo} style={estilos.pgCaja} testID={`excentricidad-${g.grupo}`}>
            <View style={estilos.pgCajaTitulo}>
              <Ionicons name="apps-outline" size={18} color={colores.titulo} />
              <Text style={estilos.pgTitulo}>Excentricidad · carga {formatoMiles(g.carga)} {unidad}</Text>
              <View style={[estilos.pgEtiqueta, fuera ? estilos.pgChipMal : estilos.pgEtiquetaOk]}>
                <Text style={[estilos.pgChipTexto, { color: fuera ? colores.rojoEtiquetaTexto : colores.verdeEtiquetaTexto }]}>{fuera ? 'NO CONFORME' : 'CONFORME'}</Text>
              </View>
            </View>
            {plato ? (
              <View style={estilos.pgPlato}>
                {g.lecturas.map((l) => {
                  const mala = l.resultado === 'no_conforme';
                  return (
                    <View key={l.orden} style={[estilos.pgPosicion, LUGAR_POSICION[l.orden], mala && estilos.pgPosicionMala]} testID={`posicion-${l.orden}`}>
                      <Text style={estilos.pgPosicionNumero}>{l.orden === 1 ? '1 · centro' : l.orden}</Text>
                      <Text style={[estilos.pgPosicionValor, mala && { color: colores.rojo }]}>{formatoMiles(l.indicacion)}</Text>
                      <Text style={[estilos.pgPosicionError, mala && { color: colores.rojo }]}>E {formatoError(l.error)}</Text>
                    </View>
                  );
                })}
              </View>
            ) : (
              g.lecturas.map((l) => (
                <View key={l.orden} style={[estilos.pgFila, l.resultado === 'no_conforme' && estilos.pgFilaFuera]}>
                  <Text style={[estilos.pgCelda, { flex: 1.4, textAlign: 'left' }]}>{textoPosicion(l.orden) || `Pos. ${l.orden}`}</Text>
                  <Text style={[estilos.pgCelda, { flex: 1 }]}>{formatoMiles(l.indicacion)}</Text>
                  <Text style={[estilos.pgCelda, { flex: 1, fontWeight: '800' }]}>{formatoError(l.error)}</Text>
                </View>
              ))
            )}
            <Text style={estilos.pgPie}>
              {dif == null ? 'Sin diferencia que calcular' : `Diferencia entre posiciones: ${formatoMiles(dif)} ${unidad}`}
              {emp == null ? '' : ` · EMP ±${formatoMiles(emp)} ${unidad}`}
            </Text>
          </View>
        );
      })}

      {/* Error crítico: qué lecturas se salieron y qué hacer */}
      {mal && (
        <View style={estilos.pgCritico} testID="error-critico">
          <View style={estilos.pgCajaTitulo}>
            <Ionicons name="warning" size={20} color={colores.rojo} />
            <Text style={[estilos.pgTitulo, { color: colores.rojoEtiquetaTexto }]}>Error crítico en los ensayos</Text>
          </View>
          {!!p.errorCritico && <Text style={estilos.pgCriticoTexto}>Motivo guardado: {p.errorCritico}</Text>}
          {r.lecturasFuera.map((l, i) => (
            <Text key={i} style={estilos.pgCriticoLinea}>
              • {l.tipo === 'pesaje' ? 'Pesaje' : `Excentricidad · ${textoPosicion(l.posicion) || 'posición'}`} · carga {formatoMiles(l.carga)} {unidad} → E {formatoError(l.error)} {unidad}
              {l.emp == null ? '' : ` (EMP ±${formatoMiles(l.emp)})`}
            </Text>
          ))}
          <Text style={estilos.pgCriticoTexto}>Mientras haya una lectura fuera de EMP no se puede finalizar el trabajo en el equipo: corrige la lectura o repite el ensayo.</Text>
          {onIrAEnsayos && (
            <Pressable onPress={onIrAEnsayos} style={estilos.pgBotonEnsayos} accessibilityRole="button" testID="corregir-en-ensayos">
              <Ionicons name="create-outline" size={18} color={colores.blanco} />
              <Text style={estilos.pgBotonEnsayosTexto}>Corregir en Ensayos y Calibración</Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

const estilos = StyleSheet.create({
  // Pruebas generales (resumen, tabla de pesaje, plato de excentricidad y error crítico)
  pgVacio: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colores.grisFondo, borderRadius: 12, padding: 12 },
  pgResumen: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, padding: 14, borderWidth: 1 },
  pgResumenBien: { backgroundColor: colores.verdeFondo, borderColor: colores.verdeBorde },
  pgResumenMal: { backgroundColor: '#FEF2F2', borderColor: '#FCA5A5' },
  pgResumenTitulo: { fontSize: 16.5, fontWeight: '800' },
  pgResumenDetalle: { fontSize: 14.5, color: colores.textoSecundario, marginTop: 2 },
  pgChips: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  pgChip: { backgroundColor: colores.verdeEtiquetaFondo, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5 },
  pgChipMal: { backgroundColor: colores.rojoEtiquetaFondo },
  pgChipTexto: { fontSize: 13, fontWeight: '800', color: colores.verdeEtiquetaTexto },
  pgCaja: { borderWidth: 1, borderColor: colores.bordeSuave, borderRadius: 14, padding: 12, gap: 4, backgroundColor: colores.blanco },
  pgCajaTitulo: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' },
  pgTitulo: { fontSize: 16, fontWeight: '800', color: colores.titulo, flexShrink: 1 },
  pgUnidad: { fontSize: 14, color: colores.textoSecundario },
  pgEtiqueta: { marginLeft: 'auto', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  pgEtiquetaOk: { backgroundColor: colores.verdeEtiquetaFondo },
  pgFila: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 9, paddingHorizontal: 6, borderRadius: 8 },
  pgFilaAlterna: { backgroundColor: '#F8FAFC' },
  pgFilaFuera: { backgroundColor: '#FEF2F2' },
  pgCabecera: { fontSize: 12.5, fontWeight: '800', color: colores.textoSecundario, textAlign: 'center', letterSpacing: 0.2 },
  pgCelda: { fontSize: 16, color: colores.titulo, textAlign: 'center' },
  pgPlato: { height: 168, borderRadius: 14, backgroundColor: '#EEF2F7', borderWidth: 1, borderColor: colores.bordeSuave, position: 'relative' },
  pgPosicion: { position: 'absolute', width: '30%', alignItems: 'center', backgroundColor: colores.blanco, borderRadius: 10, borderWidth: 1, borderColor: '#BBF7D0', paddingVertical: 6 },
  pgPosicionMala: { borderColor: '#FCA5A5', backgroundColor: '#FEF2F2' },
  pgPosicionNumero: { fontSize: 12, fontWeight: '800', color: colores.textoSecundario },
  pgPosicionValor: { fontSize: 16.5, fontWeight: '800', color: colores.titulo },
  pgPosicionError: { fontSize: 13, fontWeight: '700', color: colores.verdeEtiquetaTexto },
  pgPie: { fontSize: 13.5, color: colores.textoSecundario, marginTop: 6 },
  pgCritico: { borderWidth: 1, borderColor: '#FCA5A5', backgroundColor: '#FEF2F2', borderRadius: 14, padding: 14, gap: 6 },
  pgCriticoTexto: { fontSize: 14.5, color: colores.rojoEtiquetaTexto, lineHeight: 20 },
  pgCriticoLinea: { fontSize: 15, color: colores.titulo, fontWeight: '700', lineHeight: 21 },
  pgBotonEnsayos: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colores.rojo, borderRadius: 12, minHeight: 46, marginTop: 6 },
  pgBotonEnsayosTexto: { color: colores.blanco, fontWeight: '800', fontSize: 15.5 },
  area: { flex: 1, backgroundColor: colores.fondo },
  contenido: { paddingTop: 18, paddingBottom: 28, width: '100%', alignSelf: 'center' },
  tituloFila: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4 },
  titulo: { fontWeight: '700', color: colores.titulo, flexShrink: 1 },
  subtitulo: { color: colores.textoSecundario, fontSize: 14, marginBottom: 10 },
  pestanas: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colores.bordeSuave },
  pestana: { flex: 1, paddingVertical: 12, alignItems: 'center', borderBottomWidth: 3, borderBottomColor: 'transparent' },
  pestanaActiva: { borderBottomColor: colores.primario },
  pestanaTexto: { fontSize: 14.5, fontWeight: '600', color: colores.textoSecundario },
  tarjeta: { backgroundColor: colores.blanco, borderWidth: 1, borderColor: colores.bordeSuave, borderRadius: radios.tarjeta, padding: 16 },
  numeroInforme: { fontSize: 17, fontWeight: '800', color: colores.titulo, textAlign: 'center' },
  centrado: { textAlign: 'center', color: colores.textoSecundario, fontSize: 14, marginTop: 2 },
  insignia: { alignSelf: 'center', backgroundColor: colores.primarioSuave, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 4, marginTop: 8 },
  insigniaTexto: { color: colores.azulTexto, fontWeight: '800', fontSize: 12, letterSpacing: 0.3 },
  cliente: { backgroundColor: colores.grisFondo, borderRadius: 12, padding: 12, marginTop: 12, gap: 4 },
  clienteTexto: { fontSize: 14.5, color: colores.titulo, lineHeight: 20 },
  negrita: { fontWeight: '800' },
  seccion: { marginTop: 6, fontSize: 12.5, fontWeight: '700', letterSpacing: 1.3, color: colores.textoSecundario },
  cuadricula: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 12, backgroundColor: colores.blanco, borderWidth: 1, borderColor: colores.bordeSuave, borderRadius: radios.tarjeta, padding: 14 },
  celdaK: { fontSize: 12.5, color: colores.textoSecundario },
  celdaV: { fontSize: 16, fontWeight: '700', color: colores.titulo, marginTop: 1 },
  etiqueta: { fontSize: 15.5, fontWeight: '700', color: colores.titulo, marginBottom: 6 },
  entrada: { minHeight: 46, borderWidth: 1, borderColor: colores.borde, borderRadius: radios.campo, textAlign: 'center', fontSize: 16, color: colores.texto, backgroundColor: colores.blanco },
  ayuda: { fontSize: 13.5, color: colores.textoSecundario, lineHeight: 19 },
  info: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', backgroundColor: colores.primarioSuave, borderRadius: 10, padding: 12 },
  infoTexto: { flex: 1, color: colores.titulo, fontSize: 14.5, lineHeight: 20 },
  celdas: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 10 },
  enlace: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 10 },
  enlaceTexto: { color: colores.primario, fontWeight: '700', fontSize: 15.5 },
  botonSecundario: { minHeight: 48, borderRadius: radios.boton, borderWidth: 1.5, borderColor: colores.primario, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 14 },
  botonSecundarioTexto: { color: colores.primario, fontSize: 16, fontWeight: '700' },
  check: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  checkTexto: { flex: 1, fontSize: 16, color: colores.titulo },
  filaSiNo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 },
  siNo: { flexDirection: 'row', gap: 0, borderRadius: 10, overflow: 'hidden', borderWidth: 1, borderColor: colores.borde },
  siNoBoton: { paddingHorizontal: 18, paddingVertical: 9, backgroundColor: colores.blanco },
  siNoActivo: { backgroundColor: colores.primario },
  siNoTexto: { fontSize: 15, fontWeight: '700', color: colores.titulo },
  progresoK: { fontSize: 14, color: colores.titulo },
  progresoV: { fontSize: 14.5, fontWeight: '800', color: colores.primario },
  barra: { height: 7, backgroundColor: colores.grisFondo, borderRadius: 4, overflow: 'hidden', marginTop: 6 },
  barraRelleno: { height: '100%', backgroundColor: colores.primario },
  filaCabeceraBloques: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  bloque: { backgroundColor: colores.blanco, borderWidth: 1, borderColor: colores.bordeSuave, borderRadius: radios.tarjeta, overflow: 'hidden' },
  bloqueCabecera: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14 },
  numero: { width: 28, height: 28, borderRadius: 14, backgroundColor: colores.grisFondo, alignItems: 'center', justifyContent: 'center' },
  numeroTexto: { fontSize: 14, fontWeight: '800', color: colores.textoSecundario },
  bloqueTitulo: { fontSize: 16.5, fontWeight: '800', color: colores.titulo },
  bloqueResumen: { fontSize: 13.5, color: colores.textoSecundario, marginTop: 2, lineHeight: 18 },
  bloqueCuerpo: { paddingHorizontal: 14, paddingBottom: 14, gap: 10 },
  pill: { borderRadius: 8, paddingHorizontal: 9, paddingVertical: 3 },
  pillTexto: { fontSize: 11, fontWeight: '800', letterSpacing: 0.3 },
  filaRec: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  interruptor: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: colores.bordeSuave, marginTop: 2 },
  segmentos: { flexDirection: 'row', gap: 8 },
  segmento: { flex: 1, minHeight: 46, borderRadius: 10, borderWidth: 1, borderColor: colores.borde, alignItems: 'center', justifyContent: 'center', backgroundColor: colores.blanco, paddingHorizontal: 4 },
  segmentoActivo: { backgroundColor: colores.primario, borderColor: colores.primario },
  segmentoNaranja: { backgroundColor: '#EA580C', borderColor: '#EA580C' },
  segmentoRojo: { backgroundColor: colores.rojo, borderColor: colores.rojo },
  segmentoTexto: { fontSize: 14.5, fontWeight: '700', color: colores.titulo, textAlign: 'center' },
  falla: { backgroundColor: '#FFFDF5', borderWidth: 1, borderColor: '#FDE68A', borderRadius: 14, padding: 12 },
  fallaTitulo: { fontSize: 16.5, fontWeight: '800', color: colores.titulo },
  fallaDescripcion: { fontSize: 14.5, color: colores.textoSecundario, marginTop: 4, lineHeight: 20 },
  fallaSub: { fontSize: 13.5, fontWeight: '700', color: colores.titulo, marginTop: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colores.azulFondo, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  chipTexto: { fontSize: 12, fontWeight: '700', color: colores.azulTexto },
  minitabla: { marginTop: 8, backgroundColor: colores.blanco, borderWidth: 1, borderColor: colores.bordeSuave, borderRadius: 10, padding: 8, gap: 4 },
  minifila: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  minicelda: { flex: 1, textAlign: 'center', fontSize: 14.5, color: colores.titulo },
  minicabecera: { fontSize: 12, color: colores.textoSecundario, textAlign: 'center' },
  excentricidad: { fontSize: 14, color: colores.titulo, lineHeight: 20 },
  detalleTecnico: { marginTop: 6, color: colores.textoSecundario, fontSize: 11.5, fontFamily: 'monospace' },
  flotante: {
    position: 'absolute',
    right: 18,
    bottom: 16,
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: colores.blanco,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colores.bordeSuave,
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
});
