import { useRef, useState, type RefObject } from 'react';
import { ActivityIndicator, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type TextInputInstance } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ErrorApi } from '@/api/cliente';
import { nombreDeCodigo, obtenerCatalogo } from '@/api/catalogos';
import { guardarEnsayos, obtenerEnsayosConRespaldo, registrarLlamadaEnsayo, type Ensayos } from '@/api/ensayos';
import { horaRespaldo } from '@/api/respaldo';
import { Aviso } from '@/componentes/Aviso';
import { Boton } from '@/componentes/Boton';
import { EncabezadoApp } from '@/componentes/EncabezadoApp';
import { useConsulta } from '@/hooks/useConsulta';
import { useDiseno } from '@/hooks/useDiseno';
import { useSesion } from '@/sesion/SesionContext';
import { colores, radios } from '@/tema/colores';
import {
  FORMAS,
  calcularGrupo,
  claveError,
  calcularPesaje,
  cargaExcentricidadSugerida,
  cargasPesajeSugeridas,
  diferenciaMaxima,
  erroresCriticos,
  estadoGrupo,
  estadoValidacionPesaje,
  formatoEmp,
  formatoError,
  formatoMiles,
  iniciales,
  leerLectura,
  motivoNoFinaliza,
  posicionesDe,
  resumenExcentricidad,
  resumenPesaje,
  telefonoMarcable,
  textoErrorCritico,
  textoPosiciones,
  type FilaCalculada,
  type FilaPesaje,
  type FormaPlato,
  type GrupoExcentricidad,
} from '@/utilidades/ensayos';
import { fechaCorta, horaDe } from '@/utilidades/formato';

const AMARILLO = '#FEFBEA';

/**
 * HU-10 — Ensayos y Calibración.
 *  - Pesaje: el técnico digita solo la carga (L) y la indicación (I); el error (E = I − L), el EMP y la conformidad se calculan solos (y el servidor
 *    los vuelve a calcular al guardar). Excentricidad: cargas desplegables, con las posiciones del plato (1 centro y 2 a 5 esquinas); se pueden agregar y quitar.
 *  - Error crítico (lectura fuera del EMP): Corregir lectura · Repetir ensayo · Llamar al encargado del área (queda registrado) · Guardar de todas formas
 *    (con motivo; avisa al encargado y deja el ensayo marcado con error). "Finalizar ensayo" queda bloqueado mientras haya un error crítico sin aceptar.
 *  - Al finalizar: resumen "Ensayo conforme" y los valores pasan a la Cabecera del informe (no se vuelven a digitar). Guardar exige conexión.
 */
export default function PantallaEnsayos() {
  const { sesion } = useSesion();
  const usuario = sesion?.usuario;
  const d = useDiseno();
  const params = useLocalSearchParams<{ id?: string; equipo?: string }>();
  const idOs = Number(params.id);
  const idOsEquipo = Number(params.equipo);
  const valido = Number.isInteger(idOs) && idOs > 0 && Number.isInteger(idOsEquipo) && idOsEquipo > 0;
  const [reemplazo, setReemplazo] = useState<{ ensayos: Ensayos; version: number } | null>(null);

  const { datos, cargando, error } = useConsulta(async (token) => {
    if (!valido) throw new ErrorApi('Servicio o equipo no válido.', 400, 1);
    const [r, cargos] = await Promise.all([
      obtenerEnsayosConRespaldo(token, usuario?.idUsuario ?? 0, idOs, idOsEquipo),
      obtenerCatalogo(token, 'CARGO_USUARIO').catch(() => undefined),
    ]);
    return { ensayos: r.datos, sinConexion: r.sinConexion, guardadoEn: r.guardadoEn, cargos };
  }, `${params.id ?? ''}|${params.equipo ?? ''}`);

  const cargo = nombreDeCodigo(datos?.cargos, usuario?.cargo) ?? usuario?.cargo ?? 'Técnico de Campo';
  const ensayos = reemplazo?.ensayos ?? datos?.ensayos ?? null;
  const c = ensayos?.cabecera;

  return (
    <SafeAreaView style={estilos.area} edges={['top']}>
      <EncabezadoApp nombre={usuario?.nombre ?? ''} apellido={usuario?.apellido} subtitulo={`${usuario?.nombre ?? ''} · ${cargo}`} />
      <View style={[estilos.cabecera, { paddingHorizontal: d.margen, maxWidth: d.anchoMaximo }]}>
        <View style={estilos.tituloFila}>
          <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Volver">
            <Ionicons name="arrow-back" size={24} color={colores.titulo} />
          </Pressable>
          <Text style={[estilos.titulo, { fontSize: d.tituloPantalla }]} accessibilityRole="header">
            Ensayos y Calibración
          </Text>
        </View>
        {!!c && (
          <Text style={estilos.subtitulo}>
            {c.nombre} #{String(c.numero).padStart(2, '0')} · {c.numeroOs}
          </Text>
        )}
      </View>

      {cargando ? (
        <ActivityIndicator color={colores.primario} style={{ marginTop: 40 }} />
      ) : error || !ensayos || !c ? (
        <View style={{ paddingHorizontal: d.margen }}>
          <Aviso tipo="error" mensaje={error ?? 'No se encontró el equipo.'} />
        </View>
      ) : (
        <>
          {datos?.sinConexion && (
            <View style={{ paddingHorizontal: d.margen, marginBottom: 8 }}>
              <Aviso mensaje={`Sin conexión: se muestra lo último guardado (${horaRespaldo(datos.guardadoEn)}). Guardar exige conexión.`} />
            </View>
          )}
          <Contenido
            key={`${reemplazo?.version ?? 0}`}
            ensayos={ensayos}
            token={sesion?.token ?? ''}
            idOs={idOs}
            idOsEquipo={idOsEquipo}
            margen={d.margen}
            anchoMaximo={d.anchoMaximo}
            onActualizado={(e, reiniciar) => {
              if (reiniciar) setReemplazo((r) => ({ ensayos: e, version: (r?.version ?? 0) + 1 }));
            }}
          />
        </>
      )}
    </SafeAreaView>
  );
}

// ── Contenido (se vuelve a armar desde el servidor al finalizar o al aceptar un error crítico) ──────

type Mensaje = { tipo: 'error' | 'info'; texto: string } | null;

function agrupar(ensayos: Ensayos, forma: FormaPlato): GrupoExcentricidad[] {
  const n = posicionesDe(forma);
  const porGrupo = new Map<number, GrupoExcentricidad>();
  for (const l of ensayos.excentricidad) {
    const g = porGrupo.get(l.grupo) ?? { carga: formatoMiles(l.carga).replace(/,/g, ''), lecturas: Array<string>(n).fill('') };
    if (l.posicion >= 1 && l.posicion <= n && l.indicacion != null) g.lecturas[l.posicion - 1] = String(l.indicacion);
    porGrupo.set(l.grupo, g);
  }
  return [...porGrupo.entries()].sort((a, b) => a[0] - b[0]).map(([, g]) => g);
}

function Contenido(props: {
  ensayos: Ensayos;
  token: string;
  idOs: number;
  idOsEquipo: number;
  margen: number;
  anchoMaximo: number;
  onActualizado: (e: Ensayos, reiniciar: boolean) => void;
}) {
  const { ensayos } = props;
  const c = ensayos.cabecera;
  const unidad = c.unidad || 'kg';
  const clase = c.clase;
  const e = c.e;
  const formaInicial: FormaPlato = FORMAS.some((f) => f.valor === c.formaPlato) ? (c.formaPlato as FormaPlato) : 'rectangular';

  const [forma, setForma] = useState<FormaPlato>(formaInicial);
  const [pesaje, setPesaje] = useState<FilaPesaje[]>(() =>
    ensayos.pesaje.length > 0
      ? ensayos.pesaje.map((p) => ({ carga: String(p.carga), indicacion: p.indicacion == null ? '' : String(p.indicacion) }))
      : (cargasPesajeSugeridas(c.capMaxima).length > 0 ? cargasPesajeSugeridas(c.capMaxima) : [0]).map((x) => ({ carga: x ? String(x) : '', indicacion: '' })),
  );
  const [grupos, setGrupos] = useState<GrupoExcentricidad[]>(() => {
    const g = agrupar(ensayos, formaInicial);
    if (g.length > 0) return g;
    const sugerida = cargaExcentricidadSugerida(c.capMaxima, 1);
    return [{ carga: sugerida ? String(sugerida) : '', lecturas: Array<string>(posicionesDe(formaInicial)).fill('') }];
  });
  const [tab, setTab] = useState<'pesaje' | 'excentricidad'>('pesaje');
  const [abierto, setAbierto] = useState<number | null>(0);
  const [vista, setVista] = useState<'ensayo' | 'resumen'>(c.finalizado ? 'resumen' : 'ensayo');
  // Errores críticos que el técnico ya aceptó con "Guardar de todas formas" (y de los que ya se avisó): no se vuelven a mostrar
  const [aceptados, setAceptados] = useState<string[]>(() =>
    c.aceptaError
      ? [
          ...ensayos.pesaje.filter((x) => x.critico && x.indicacion != null).map((x) => claveError({ tipo: 'pesaje', indice: x.orden - 1, indicacion: x.indicacion as number })),
          ...ensayos.excentricidad
            .filter((x) => x.critico && x.indicacion != null)
            .map((x) => claveError({ tipo: 'excentricidad', indice: x.grupo - 1, posicion: x.posicion, indicacion: x.indicacion as number })),
        ]
      : [],
  );
  const [motivoAceptado, setMotivoAceptado] = useState<string | null>(c.motivoErrorCritico);
  const [mensaje, setMensaje] = useState<Mensaje>(null);
  const [ocupado, setOcupado] = useState(false);
  const [llamar, setLlamar] = useState(false);
  const [conError, setConError] = useState(false);
  const [motivo, setMotivo] = useState('');
  const refs = useRef<Record<string, TextInputInstance | null>>({});

  const criticos = erroresCriticos(clase, e, pesaje, grupos);
  const pendientes = criticos.filter((k) => !aceptados.includes(claveError(k)));
  const sinAceptar = pendientes.length > 0;
  const estaAceptado = criticos.length > 0 && !sinAceptar;
  const bloqueo = motivoNoFinaliza(clase, e, pesaje, grupos, forma, !sinAceptar);
  // Corregir / repetir / llamar actúan sobre el error que sigue sin aceptar (si ya están todos aceptados, sobre cualquiera)
  const enfoque = sinAceptar ? pendientes : criticos;
  const puede = c.puedeRegistrar && c.evaluable;
  const pCalc = calcularPesaje(clase, e, pesaje);
  const pesajeListo = pCalc.length > 0 && pCalc.every((f) => f.completa && f.resultado === 'conforme');

  function enfocar(clave: string) {
    setTimeout(() => refs.current[clave]?.focus(), 80);
  }

  function cambiarForma(f: FormaPlato) {
    setForma(f);
    const n = posicionesDe(f);
    setGrupos((gs) => gs.map((g) => ({ ...g, lecturas: Array.from({ length: n }, (_, i) => g.lecturas[i] ?? '') })));
  }

  function construir(finalizar: boolean, motivoError?: string) {
    const pes = pesaje.map((p) => ({ carga: leerLectura(p.carga), indicacion: leerLectura(p.indicacion) }));
    const ecc = grupos.map((g) => ({ carga: leerLectura(g.carga), lecturas: g.lecturas.map((l) => leerLectura(l)) }));
    if (pes.some((p) => p.carga === null) || ecc.some((g) => g.carga === null)) return null;
    return {
      formaPlato: forma,
      pesaje: pes.map((p) => ({ carga: p.carga as number, indicacion: p.indicacion })),
      excentricidad: ecc.map((g) => ({ carga: g.carga as number, lecturas: g.lecturas })),
      motivoErrorCritico: motivoError,
      finalizar,
    };
  }

  async function guardar(finalizar: boolean, motivoError?: string) {
    setMensaje(null);
    const cuerpo = construir(finalizar, motivoError);
    if (!cuerpo) return setMensaje({ tipo: 'error', texto: 'Indica la carga de cada fila de pesaje y de excentricidad.' });
    setOcupado(true);
    try {
      const r = await guardarEnsayos(props.token, props.idOs, props.idOsEquipo, cuerpo);
      if (motivoError) {
        setAceptados(criticos.map(claveError));
        setMotivoAceptado(motivoError);
      }
      setMensaje({ tipo: 'info', texto: r.mensaje });
      setConError(false);
      setMotivo('');
      if (r.ensayos) props.onActualizado(r.ensayos, finalizar || !!motivoError);
      if (finalizar) setVista('resumen');
    } catch (err) {
      setMensaje({
        tipo: 'error',
        texto:
          err instanceof ErrorApi && err.estadoHttp === 0
            ? 'Sin conexión: los ensayos se guardan con señal. Tus lecturas siguen en pantalla; inténtalo cuando vuelva.'
            : err instanceof Error
              ? err.message
              : 'No se pudo guardar el ensayo.',
      });
    } finally {
      setOcupado(false);
    }
  }

  async function llamarAhora() {
    const primero = enfoque[0];
    const detalle = primero ? textoErrorCritico(primero, unidad).replace(' Revisa la digitación o repite el ensayo.', '') : 'Error en la calibración';
    try {
      const r = await registrarLlamadaEnsayo(props.token, props.idOs, props.idOsEquipo, detalle);
      const tel = telefonoMarcable(r.datos?.telefono ?? ensayos.encargado?.telefono);
      setLlamar(false);
      if (tel) await Linking.openURL(`tel:${tel}`);
    } catch (err) {
      setLlamar(false);
      setMensaje({ tipo: 'error', texto: err instanceof Error ? err.message : 'No se pudo registrar la llamada.' });
    }
  }

  function corregir() {
    const k = enfoque[0];
    if (!k) return;
    if (k.tipo === 'pesaje') {
      setTab('pesaje');
      enfocar(`p-${k.indice}-i`);
    } else {
      setTab('excentricidad');
      setAbierto(k.indice);
      enfocar(`e-${k.indice}-${k.posicion}`);
    }
  }

  function repetir() {
    setPesaje((ps) => ps.map((p, i) => (enfoque.some((k) => k.tipo === 'pesaje' && k.indice === i) ? { ...p, indicacion: '' } : p)));
    setGrupos((gs) =>
      gs.map((g, gi) => ({ ...g, lecturas: g.lecturas.map((l, pi) => (enfoque.some((k) => k.tipo === 'excentricidad' && k.indice === gi && k.posicion === pi + 1) ? '' : l)) })),
    );
    corregir();
  }

  // ── Resumen "Ensayo conforme" ───────────────────────────────────────────────────────────
  if (vista === 'resumen') {
    const conErrorCritico = c.aceptaError || criticos.length > 0;
    return (
      <ScrollView contentContainerStyle={[estilos.contenido, { paddingHorizontal: props.margen, maxWidth: props.anchoMaximo }]}>
        <View style={{ alignItems: 'center', marginTop: 8 }}>
          <View style={[estilos.sello, { backgroundColor: conErrorCritico ? colores.naranja : colores.verde }]}>
            <Ionicons name={conErrorCritico ? 'alert' : 'checkmark'} size={44} color={colores.blanco} />
          </View>
          <Text style={estilos.resumenTitulo}>{conErrorCritico ? 'Ensayo con error crítico' : 'Ensayo conforme'}</Text>
          <Text style={estilos.resumenSub}>
            {c.nombre} #{String(c.numero).padStart(2, '0')} · clase {clase ?? '—'}
            {c.finalizadoEn ? ` · ${fechaCorta(c.finalizadoEn)} ${horaDe(c.finalizadoEn)}` : ''}
          </Text>
        </View>
        <View style={estilos.tarjeta}>
          <FilaResumen titulo="Pesaje" detalle={resumenPesaje(clase, e, pesaje, unidad)} conforme={!criticos.some((k) => k.tipo === 'pesaje')} />
          <View style={estilos.separador} />
          <FilaResumen titulo="Excentricidad" detalle={resumenExcentricidad(grupos, unidad)} conforme={!criticos.some((k) => k.tipo === 'excentricidad')} />
        </View>
        {conErrorCritico && !!c.motivoErrorCritico && (
          <View style={[estilos.info, { backgroundColor: '#FEF2F2' }]}>
            <Ionicons name="alert-circle-outline" size={20} color={colores.rojoEtiquetaTexto} />
            <Text style={[estilos.infoTexto, { color: colores.rojoEtiquetaTexto }]}>Motivo: {c.motivoErrorCritico}</Text>
          </View>
        )}
        <View style={estilos.info}>
          <Ionicons name="information-circle-outline" size={20} color={colores.primario} />
          <Text style={estilos.infoTexto}>
            Estos valores alimentan el <Text style={{ fontWeight: '800' }}>Formato de pruebas</Text> y el informe técnico; no se vuelven a digitar.
          </Text>
        </View>
        <View style={{ gap: 12, marginTop: 8 }}>
          <Boton titulo="Volver a trabajo en el equipo" onPress={() => router.back()} />
          <Pressable onPress={() => setVista('ensayo')} style={estilos.editar} accessibilityRole="button" testID="editar-lecturas">
            <Ionicons name="create-outline" size={20} color={colores.primario} />
            <Text style={estilos.editarTexto}>Editar lecturas</Text>
          </Pressable>
        </View>
      </ScrollView>
    );
  }

  const nFormas = FORMAS;
  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={[estilos.contenido, { paddingHorizontal: props.margen, maxWidth: props.anchoMaximo }]} keyboardShouldPersistTaps="handled">
        <View style={estilos.chips}>
          <Chip k="UNIDAD" v={unidad} />
          <Chip k="CLASE" v={clase ?? '—'} />
          <Chip k="CAP. MÁXIMA" v={c.capMaxima != null ? `${formatoMiles(c.capMaxima)} ${unidad}` : '—'} />
        </View>
        <View style={estilos.chips}>
          <Chip k="d" v={c.d != null ? `${formatoMiles(c.d)} ${unidad}` : '—'} />
          <Chip k="e" v={e != null ? `${formatoMiles(e)} ${unidad}` : '—'} />
        </View>

        {!c.evaluable && (
          <View style={{ marginTop: 12 }}>
            <Aviso tipo="error" mensaje="El equipo no tiene clase de exactitud o división e registradas: complétalas en la ficha del equipo para evaluar el ensayo." />
          </View>
        )}
        {c.evaluable && !c.puedeRegistrar && (
          <View style={{ marginTop: 12 }}>
            <Aviso mensaje="Para registrar lecturas el equipo debe estar en ejecución. Reanúdalo desde los objetivos." />
          </View>
        )}

        <Text style={estilos.etiquetaSeccion}>FORMA DE PLATO</Text>
        <View style={estilos.formas}>
          {nFormas.map((f) => (
            <Pressable
              key={f.valor}
              onPress={() => cambiarForma(f.valor)}
              disabled={!puede}
              style={[estilos.forma, forma === f.valor && estilos.formaActiva]}
              accessibilityRole="button"
              accessibilityState={{ selected: forma === f.valor }}
              testID={`forma-${f.valor}`}
            >
              <Text style={[estilos.formaTexto, forma === f.valor && { color: colores.primario }]}>{f.texto}</Text>
            </Pressable>
          ))}
        </View>

        <View style={estilos.tabs}>
          <Pressable onPress={() => setTab('pesaje')} style={[estilos.tab, tab === 'pesaje' && estilos.tabActiva]} accessibilityRole="tab" testID="tab-pesaje">
            <Text style={[estilos.tabTexto, tab === 'pesaje' && estilos.tabTextoActivo]}>Pesaje</Text>
            {pesajeListo && <Ionicons name="checkmark-circle" size={18} color={colores.verde} />}
          </Pressable>
          <Pressable onPress={() => setTab('excentricidad')} style={[estilos.tab, tab === 'excentricidad' && estilos.tabActiva]} accessibilityRole="tab" testID="tab-excentricidad">
            <Text style={[estilos.tabTexto, tab === 'excentricidad' && estilos.tabTextoActivo]}>Excentricidad</Text>
          </Pressable>
        </View>

        <View style={estilos.leyenda}>
          <View style={estilos.leyendaItem}>
            <View style={[estilos.leyendaCaja, { backgroundColor: AMARILLO }]} />
            <Text style={estilos.leyendaTexto}>Lo digita el técnico</Text>
          </View>
          <View style={estilos.leyendaItem}>
            <View style={[estilos.leyendaCaja, { backgroundColor: colores.blanco }]} />
            <Text style={estilos.leyendaTexto}>Lo calcula el sistema</Text>
          </View>
        </View>

        {tab === 'pesaje' ? (
          <>
            <TablaEncabezado columnas={['Carga L (' + unidad + ')', 'Indicación I', 'Error E', 'EMP']} />
            {pesaje.map((p, i) => (
              <FilaTabla
                key={i}
                carga={{ valor: p.carga, onCambio: (t) => setPesaje((ps) => ps.map((x, j) => (j === i ? { ...x, carga: t } : x))), clave: `p-${i}-l` }}
                indicacion={{ valor: p.indicacion, onCambio: (t) => setPesaje((ps) => ps.map((x, j) => (j === i ? { ...x, indicacion: t } : x))), clave: `p-${i}-i` }}
                calc={pCalc[i]}
                editable={puede}
                refs={refs}
              />
            ))}
            <View style={estilos.acciones}>
              {puede && pesaje.length < 12 && (
                <Pressable onPress={() => setPesaje((ps) => [...ps, { carga: '', indicacion: '' }])} style={estilos.enlace} accessibilityRole="button" testID="agregar-carga-pesaje">
                  <Ionicons name="add-circle-outline" size={20} color={colores.primario} />
                  <Text style={estilos.enlaceTexto}>Agregar carga</Text>
                </Pressable>
              )}
              {puede && pesaje.length > 1 && (
                <Pressable onPress={() => setPesaje((ps) => ps.slice(0, -1))} style={estilos.enlace} accessibilityRole="button">
                  <Ionicons name="trash-outline" size={18} color={colores.rojo} />
                  <Text style={[estilos.enlaceTexto, { color: colores.rojo }]}>Quitar última</Text>
                </Pressable>
              )}
            </View>
            <Text style={estilos.formula}>
              E = I − L · EMP según clase {clase ?? '—'} y e = {e != null ? `${formatoMiles(e)} ${unidad}` : '—'}.
            </Text>
            <EstadoValidacion {...estadoValidacionPesaje(clase, e, pesaje)} />
            <View style={{ marginTop: 14 }}>
              <Boton titulo="Continuar con excentricidad  →" onPress={() => setTab('excentricidad')} />
            </View>
          </>
        ) : (
          <>
            <Text style={estilos.sugerida}>
              {grupos.length === 1 && !grupos[0].lecturas.some(Boolean) ? 'Sugerida: 1/3 de la capacidad máxima' : `${grupos.length} ${grupos.length === 1 ? 'carga' : 'cargas'} · toca una carga para desplegarla`}
            </Text>
            {grupos.map((g, gi) => {
              const filas = calcularGrupo(clase, e, g);
              const estado = estadoGrupo(filas);
              const abiertaG = abierto === gi;
              const dif = diferenciaMaxima(g);
              return (
                <View key={gi} style={[estilos.grupo, abiertaG && estilos.grupoAbierto]} testID={`grupo-${gi + 1}`}>
                  <Pressable onPress={() => setAbierto(abiertaG ? null : gi)} style={estilos.grupoCabecera} accessibilityRole="button" accessibilityState={{ expanded: abiertaG }}>
                    <View style={[estilos.numeroGrupo, { backgroundColor: estado === 'conforme' ? colores.verde : estado === 'error' ? colores.rojo : colores.primario }]}>
                      <Text style={estilos.numeroGrupoTexto}>{gi + 1}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={estilos.grupoTitulo}>
                        Carga {gi + 1} · {formatoMiles(leerLectura(g.carga))} {unidad}
                      </Text>
                      <Text style={estilos.grupoSub}>
                        {estado === 'conforme' ? `${g.lecturas.length} posiciones · diferencia máx. ${formatoMiles(dif)} ${unidad}` : estado === 'error' ? 'Lectura fuera del EMP' : 'Registrando lecturas'}
                      </Text>
                    </View>
                    <EtiquetaGrupo estado={estado} />
                    <Ionicons name={abiertaG ? 'chevron-up' : 'chevron-down'} size={22} color={colores.textoSecundario} />
                  </Pressable>
                  {abiertaG && (
                    <View>
                      <View style={estilos.separador} />
                      <View style={estilos.cargaPrueba}>
                        <Text style={estilos.cargaPruebaK}>Carga de prueba</Text>
                        <TextInput
                          ref={(r) => {
                            refs.current[`e-${gi}-l`] = r;
                          }}
                          value={g.carga}
                          onChangeText={(t) => setGrupos((gs) => gs.map((x, j) => (j === gi ? { ...x, carga: t } : x)))}
                          editable={puede}
                          keyboardType="decimal-pad"
                          style={[estilos.celdaEntrada, { minWidth: 110, textAlign: 'center' }]}
                          testID={`carga-prueba-${gi + 1}`}
                        />
                        <Text style={estilos.cargaPruebaK}>{unidad}</Text>
                      </View>
                      <Plato forma={forma} />
                      <Text style={estilos.platoTexto}>{textoPosiciones(forma)}</Text>
                      <TablaEncabezado columnas={['Pos.', 'Indicación I', 'Error E', 'EMP']} posicion />
                      {g.lecturas.map((l, pi) => (
                        <FilaTabla
                          key={pi}
                          posicion={pi + 1}
                          indicacion={{
                            valor: l,
                            onCambio: (t) => setGrupos((gs) => gs.map((x, j) => (j === gi ? { ...x, lecturas: x.lecturas.map((y, k) => (k === pi ? t : y)) } : x))),
                            clave: `e-${gi}-${pi + 1}`,
                          }}
                          calc={filas[pi]}
                          editable={puede}
                          refs={refs}
                        />
                      ))}
                      {puede && grupos.length > 1 && (
                        <Pressable
                          onPress={() => {
                            setGrupos((gs) => gs.filter((_, j) => j !== gi));
                            setAbierto(null);
                          }}
                          style={[estilos.enlace, { alignSelf: 'center', marginTop: 10 }]}
                          accessibilityRole="button"
                          testID={`quitar-carga-${gi + 1}`}
                        >
                          <Ionicons name="trash-outline" size={18} color={colores.rojo} />
                          <Text style={[estilos.enlaceTexto, { color: colores.rojo }]}>Quitar esta carga</Text>
                        </Pressable>
                      )}
                    </View>
                  )}
                </View>
              );
            })}
            {puede && grupos.length < 10 && (
              <Pressable
                onPress={() => {
                  const sugerida = cargaExcentricidadSugerida(c.capMaxima, grupos.length + 1);
                  setGrupos((gs) => [...gs, { carga: sugerida ? String(sugerida) : '', lecturas: Array<string>(posicionesDe(forma)).fill('') }]);
                  setAbierto(grupos.length);
                }}
                style={estilos.agregarGrupo}
                accessibilityRole="button"
                testID="agregar-carga-excentricidad"
              >
                <Ionicons name="add-circle-outline" size={22} color={colores.primario} />
                <Text style={estilos.agregarGrupoTexto}>Agregar otra carga</Text>
              </Pressable>
            )}
          </>
        )}

        {sinAceptar && pendientes[0] && (
          <View style={estilos.critico} testID="error-critico">
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="alert-circle-outline" size={20} color={colores.rojoEtiquetaTexto} />
              <Text style={estilos.criticoTitulo}>ERROR CRÍTICO</Text>
            </View>
            <Text style={estilos.criticoTexto}>{textoErrorCritico(pendientes[0], unidad)}</Text>
            <View style={estilos.criticoFila}>
              <BotonCritico icono="create-outline" texto="Corregir lectura" onPress={corregir} variante="azul" testID="corregir-lectura" />
              <BotonCritico icono="refresh-outline" texto="Repetir ensayo" onPress={repetir} variante="rojo" testID="repetir-ensayo" />
            </View>
            <View style={estilos.criticoFila}>
              <BotonCritico icono="call" texto="Llamar" onPress={() => setLlamar(true)} variante="verde" testID="llamar-encargado" />
              <BotonCritico icono="save-outline" texto="Guardar de todas formas" onPress={() => setConError(true)} variante="rojoLleno" grande testID="guardar-todas-formas" />
            </View>
            <Text style={estilos.criticoAyuda}>
              Llamar: comunica al {ensayos.encargado?.cargo ?? 'Jefe del área'} el error en la calibración. Guardar de todas formas: registra el ensayo con el error y notifica al encargado.
            </Text>
          </View>
        )}
        {criticos.length > 0 && estaAceptado && (
          <View style={[estilos.info, { backgroundColor: '#FEF2F2' }]}>
            <Ionicons name="alert-circle-outline" size={20} color={colores.rojoEtiquetaTexto} />
            <Text style={[estilos.infoTexto, { color: colores.rojoEtiquetaTexto }]}>Ensayo guardado con error crítico: se avisó al encargado del área.</Text>
          </View>
        )}

        {mensaje && (
          <View style={{ marginTop: 12 }} testID="mensaje-ensayos">
            <Aviso tipo={mensaje.tipo} mensaje={mensaje.texto} />
          </View>
        )}

        <Pressable
          onPress={() => void guardar(true, estaAceptado && criticos.length > 0 ? (motivoAceptado ?? undefined) : undefined)}
          disabled={bloqueo !== null || ocupado || !puede}
          style={[estilos.finalizar, bloqueo === null && puede ? estilos.finalizarActivo : estilos.finalizarBloqueado]}
          accessibilityRole="button"
          accessibilityState={{ disabled: bloqueo !== null || !puede }}
          testID="finalizar-ensayo"
        >
          {ocupado ? <ActivityIndicator color={colores.blanco} /> : <Ionicons name={bloqueo === null ? 'checkmark-done' : 'lock-closed-outline'} size={22} color={colores.blanco} />}
          <Text style={estilos.finalizarTexto}>Finalizar ensayo</Text>
        </Pressable>
        {bloqueo !== null && <Text style={estilos.ayuda}>{bloqueo}</Text>}
        <View style={{ height: 80 }} />
      </ScrollView>

      {puede && (
        <Pressable onPress={() => void guardar(false, estaAceptado && criticos.length > 0 ? (motivoAceptado ?? undefined) : undefined)} disabled={ocupado} style={estilos.fab} accessibilityRole="button" accessibilityLabel="Guardar ensayo" testID="guardar-borrador">
          <Ionicons name="save-outline" size={26} color={colores.primario} />
        </Pressable>
      )}

      {/* Llamar al encargado */}
      <Modal visible={llamar} transparent animationType="slide" onRequestClose={() => setLlamar(false)}>
        <View style={estilos.velo}>
          <View style={estilos.hoja} testID="hoja-llamar">
            <View style={estilos.asa} />
            <Text style={estilos.hojaTitulo}>Llamar al encargado del área</Text>
            <Text style={estilos.hojaSub}>
              Según la RQ, el área responsable es {ensayos.encargado?.area === 'servicio_tecnico' || c.areaEncargado === 'servicio_tecnico' ? 'Servicio Técnico' : 'Metrología'}.
            </Text>
            {ensayos.encargado ? (
              <View style={estilos.contacto}>
                <View style={estilos.avatar}>
                  <Text style={estilos.avatarTexto}>{iniciales(ensayos.encargado.nombre)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={estilos.contactoNombre}>{ensayos.encargado.nombre}</Text>
                  <Text style={estilos.contactoSub}>{[ensayos.encargado.cargo, ensayos.encargado.telefono].filter(Boolean).join(' · ')}</Text>
                </View>
                <Ionicons name="call" size={26} color={colores.verde} />
              </View>
            ) : (
              <Aviso mensaje="No hay un encargado del área registrado. Comunícate con Operaciones." />
            )}
            <View style={estilos.info}>
              <Ionicons name="information-circle-outline" size={20} color={colores.primario} />
              <Text style={estilos.infoTexto}>Se registra la llamada en el ensayo (hora y error reportado).</Text>
            </View>
            <Pressable
              onPress={() => void llamarAhora()}
              disabled={!ensayos.encargado || !telefonoMarcable(ensayos.encargado.telefono)}
              style={[estilos.llamarAhora, (!ensayos.encargado || !telefonoMarcable(ensayos.encargado.telefono)) && { opacity: 0.45 }]}
              accessibilityRole="button"
              testID="llamar-ahora"
            >
              <Ionicons name="call" size={22} color={colores.blanco} />
              <Text style={estilos.llamarAhoraTexto}>Llamar ahora</Text>
            </Pressable>
            <Pressable onPress={() => setLlamar(false)} style={estilos.cancelar} accessibilityRole="button">
              <Text style={estilos.cancelarTexto}>Cancelar</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Guardar con error crítico */}
      <Modal visible={conError} transparent animationType="fade" onRequestClose={() => setConError(false)}>
        <View style={[estilos.velo, { justifyContent: 'center', padding: 22 }]}>
          <View style={estilos.modal} testID="modal-error-critico">
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Ionicons name="warning" size={34} color={colores.rojo} />
              <Text style={estilos.modalTitulo}>Guardar con error crítico</Text>
            </View>
            <Text style={estilos.hojaSub}>
              {pendientes[0]
                ? `El ensayo se guardará con la lectura de ${formatoMiles(pendientes[0].carga)} ${unidad} fuera de EMP (${formatoError(pendientes[0].error)} ${unidad} frente a ${formatoEmp(pendientes[0].emp)} ${unidad}).`
                : 'El ensayo se guardará con lecturas fuera de EMP.'}
            </Text>
            <View style={estilos.avisoRojo}>
              <Text style={estilos.avisoRojoTexto}>
                Se notifica al <Text style={{ fontWeight: '800' }}>{ensayos.encargado?.cargo ?? 'encargado del área'}</Text> con el detalle de la falla.
              </Text>
              <Text style={estilos.avisoRojoTexto}>
                Queda marcado como <Text style={{ fontWeight: '800' }}>ensayo con error</Text> en el informe técnico.
              </Text>
            </View>
            <Text style={estilos.etiquetaMotivo}>Motivo *</Text>
            <TextInput
              value={motivo}
              onChangeText={(t) => setMotivo(t.slice(0, 300))}
              placeholder="Describe por qué se guarda con error"
              placeholderTextColor={colores.placeholder}
              multiline
              style={estilos.motivo}
              testID="motivo-error-critico"
            />
            <Pressable
              onPress={() => void guardar(false, motivo.trim())}
              disabled={motivo.trim().length < 3 || ocupado}
              style={[estilos.guardarNotificar, (motivo.trim().length < 3 || ocupado) && { opacity: 0.5 }]}
              accessibilityRole="button"
              testID="guardar-y-notificar"
            >
              {ocupado ? <ActivityIndicator color={colores.blanco} /> : <Text style={estilos.guardarNotificarTexto}>Guardar y notificar</Text>}
            </Pressable>
            <Pressable onPress={() => setConError(false)} style={estilos.cancelar} accessibilityRole="button">
              <Text style={estilos.cancelarTexto}>Cancelar</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ── Piezas ─────────────────────────────────────────────────────────────────────────────

function Chip({ k, v }: { k: string; v: string }) {
  return (
    <View style={estilos.chip}>
      <Text style={estilos.chipK}>{k}</Text>
      <Text style={estilos.chipV}>{v}</Text>
    </View>
  );
}

function TablaEncabezado({ columnas, posicion = false }: { columnas: string[]; posicion?: boolean }) {
  return (
    <View style={estilos.tablaCabecera}>
      <Text style={[estilos.th, { flex: posicion ? 0.7 : 1.15 }]}>{columnas[0]}</Text>
      <Text style={[estilos.th, { flex: 1.25 }]}>{columnas[1]}</Text>
      <Text style={[estilos.th, { flex: 0.85 }]}>{columnas[2]}</Text>
      <Text style={[estilos.th, { flex: 0.85 }]}>{columnas[3]}</Text>
      <View style={{ width: 34 }} />
    </View>
  );
}

interface CampoFila {
  valor: string;
  onCambio: (t: string) => void;
  clave: string;
}

function FilaTabla(props: {
  carga?: CampoFila;
  posicion?: number;
  indicacion: CampoFila;
  calc: FilaCalculada;
  editable: boolean;
  refs: RefObject<Record<string, TextInputInstance | null>>;
}) {
  const { calc } = props;
  const fuera = calc.resultado === 'no_conforme';
  const entrada = (campo: CampoFila, flex: number) => (
    <View style={[estilos.celda, { flex, backgroundColor: AMARILLO }]}>
      <TextInput
        ref={(r) => {
          props.refs.current[campo.clave] = r;
        }}
        value={campo.valor}
        onChangeText={campo.onCambio}
        editable={props.editable}
        keyboardType="decimal-pad"
        style={[estilos.celdaEntrada, fuera && campo.clave.endsWith('-i') && estilos.celdaEntradaError]}
        placeholder="—"
        placeholderTextColor={colores.textoTenue}
        selectTextOnFocus
        testID={`celda-${campo.clave}`}
      />
    </View>
  );
  return (
    <View style={[estilos.fila, fuera && { backgroundColor: '#FEF2F2' }]}>
      {props.carga ? entrada(props.carga, 1.15) : <Text style={[estilos.celdaTexto, { flex: 0.7, paddingLeft: 10 }]}>{props.posicion}</Text>}
      {entrada(props.indicacion, 1.25)}
      <Text style={[estilos.celdaTexto, { flex: 0.85 }, fuera && { color: colores.rojo, fontWeight: '800' }]}>{formatoError(calc.error)}</Text>
      <Text style={[estilos.celdaTexto, { flex: 0.85 }]}>{formatoEmp(calc.emp)}</Text>
      <View style={{ width: 34, alignItems: 'center' }}>
        {calc.resultado === 'conforme' ? (
          <Ionicons name="checkmark-circle" size={24} color={colores.verde} />
        ) : calc.resultado === 'no_conforme' ? (
          <Ionicons name="close-circle" size={24} color={colores.rojo} />
        ) : (
          <Ionicons name="ellipse-outline" size={24} color={colores.textoTenue} />
        )}
      </View>
    </View>
  );
}

function EstadoValidacion({ ok, texto }: { ok: boolean; texto: string }) {
  return (
    <View style={[estilos.info, !ok && { backgroundColor: '#FEF2F2' }]}>
      <Ionicons name={ok ? 'checkmark-circle-outline' : 'alert-circle-outline'} size={20} color={ok ? colores.primario : colores.rojoEtiquetaTexto} />
      <View style={{ flex: 1 }}>
        <Text style={[estilos.estadoTitulo, !ok && { color: colores.rojoEtiquetaTexto }]}>ESTADO DE VALIDACIÓN</Text>
        <Text style={[estilos.infoTexto, !ok && { color: colores.rojoEtiquetaTexto }]}>{texto}</Text>
      </View>
    </View>
  );
}

function EtiquetaGrupo({ estado }: { estado: 'conforme' | 'error' | 'en_curso' }) {
  const s =
    estado === 'conforme'
      ? { t: 'CONFORME', f: colores.verdeEtiquetaFondo, c: colores.verdeEtiquetaTexto }
      : estado === 'error'
        ? { t: 'ERROR', f: colores.rojoEtiquetaFondo, c: colores.rojoEtiquetaTexto }
        : { t: 'EN CURSO', f: colores.azulFondo, c: colores.azulTexto };
  return (
    <View style={[estilos.etiqueta, { backgroundColor: s.f }]}>
      <Text style={[estilos.etiquetaTexto, { color: s.c }]}>{s.t}</Text>
    </View>
  );
}

/** Posiciones sobre el plato (porcentaje del recuadro): 1 al centro; las demás en las esquinas, en puntos o en los vértices. */
const PUNTOS: Record<FormaPlato, { x: number; y: number }[]> = {
  rectangular: [{ x: 50, y: 50 }, { x: 14, y: 22 }, { x: 14, y: 78 }, { x: 86, y: 78 }, { x: 86, y: 22 }],
  circular: [{ x: 50, y: 50 }, { x: 50, y: 14 }, { x: 14, y: 50 }, { x: 50, y: 86 }, { x: 86, y: 50 }],
  triangular: [{ x: 50, y: 58 }, { x: 50, y: 14 }, { x: 14, y: 86 }, { x: 86, y: 86 }],
};

function Plato({ forma }: { forma: FormaPlato }) {
  return (
    <View style={estilos.plato}>
      <View style={[estilos.platoFondo, forma === 'circular' && { borderRadius: 999, width: 150, alignSelf: 'center' }, forma === 'triangular' && { width: 190, alignSelf: 'center' }]}>
        {PUNTOS[forma].map((p, i) => (
          <View key={i} style={[estilos.punto, { left: `${p.x}%`, top: `${p.y}%`, backgroundColor: i === 0 ? colores.primarioOscuro : colores.primario }]}>
            <Text style={estilos.puntoTexto}>{i + 1}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function BotonCritico(props: { icono: keyof typeof Ionicons.glyphMap; texto: string; onPress: () => void; variante: 'azul' | 'rojo' | 'verde' | 'rojoLleno'; grande?: boolean; testID: string }) {
  const v = {
    azul: { borde: colores.primario, fondo: colores.blanco, texto: colores.primario },
    rojo: { borde: colores.rojo, fondo: colores.blanco, texto: colores.rojo },
    verde: { borde: colores.verde, fondo: colores.verde, texto: colores.blanco },
    rojoLleno: { borde: colores.rojo, fondo: colores.rojo, texto: colores.blanco },
  }[props.variante];
  return (
    <Pressable onPress={props.onPress} style={[estilos.botonCritico, { borderColor: v.borde, backgroundColor: v.fondo, flex: props.grande ? 1.6 : 1 }]} accessibilityRole="button" testID={props.testID}>
      <Ionicons name={props.icono} size={18} color={v.texto} />
      <Text style={[estilos.botonCriticoTexto, { color: v.texto }]} numberOfLines={1}>
        {props.texto}
      </Text>
    </Pressable>
  );
}

function FilaResumen({ titulo, detalle, conforme }: { titulo: string; detalle: string; conforme: boolean }) {
  return (
    <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
      <View style={{ flex: 1 }}>
        <Text style={estilos.resumenFilaTitulo}>{titulo}</Text>
        <Text style={estilos.resumenFilaDetalle}>{detalle}</Text>
      </View>
      <View style={[estilos.etiqueta, { backgroundColor: conforme ? colores.verdeEtiquetaFondo : colores.rojoEtiquetaFondo }]}>
        <Text style={[estilos.etiquetaTexto, { color: conforme ? colores.verdeEtiquetaTexto : colores.rojoEtiquetaTexto }]}>{conforme ? 'CONFORME' : 'CON ERROR'}</Text>
      </View>
    </View>
  );
}

const estilos = StyleSheet.create({
  area: { flex: 1, backgroundColor: colores.fondo },
  cabecera: { paddingTop: 14, width: '100%', alignSelf: 'center' },
  tituloFila: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4 },
  titulo: { fontWeight: '700', color: colores.titulo, flexShrink: 1 },
  subtitulo: { color: colores.textoSecundario, fontSize: 14, marginBottom: 8 },
  contenido: { paddingTop: 6, paddingBottom: 28, width: '100%', alignSelf: 'center' },
  chips: { flexDirection: 'row', gap: 10, marginTop: 10 },
  chip: { flex: 1, backgroundColor: colores.blanco, borderWidth: 1, borderColor: colores.bordeSuave, borderRadius: 16, paddingVertical: 12, alignItems: 'center' },
  chipK: { fontSize: 12, fontWeight: '700', letterSpacing: 1, color: colores.textoSecundario },
  chipV: { fontSize: 19, fontWeight: '800', color: colores.titulo, marginTop: 2 },
  etiquetaSeccion: { marginTop: 18, fontSize: 12.5, fontWeight: '700', letterSpacing: 1.2, color: colores.textoSecundario },
  formas: { flexDirection: 'row', gap: 10, marginTop: 8 },
  forma: { flex: 1, minHeight: 48, borderRadius: radios.boton, borderWidth: 1, borderColor: colores.borde, backgroundColor: colores.blanco, alignItems: 'center', justifyContent: 'center' },
  formaActiva: { borderColor: colores.primario, borderWidth: 2, backgroundColor: colores.primarioSuave },
  formaTexto: { fontSize: 15.5, fontWeight: '600', color: colores.texto },
  tabs: { flexDirection: 'row', gap: 22, marginTop: 20, borderBottomWidth: 1, borderBottomColor: colores.bordeSuave },
  tab: { paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 6, borderBottomWidth: 3, borderBottomColor: 'transparent' },
  tabActiva: { borderBottomColor: colores.primario },
  tabTexto: { fontSize: 18, color: colores.textoSecundario },
  tabTextoActivo: { color: colores.primario, fontWeight: '700' },
  leyenda: { flexDirection: 'row', gap: 18, marginTop: 12 },
  leyendaItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  leyendaCaja: { width: 16, height: 16, borderRadius: 3, borderWidth: 1, borderColor: colores.borde },
  leyendaTexto: { fontSize: 14, color: colores.textoSecundario },
  tablaCabecera: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#EEF2F7', borderWidth: 1, borderColor: colores.bordeSuave, marginTop: 10, paddingVertical: 10, paddingHorizontal: 6 },
  th: { fontSize: 14, fontWeight: '700', color: colores.textoSecundario, paddingHorizontal: 4 },
  fila: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderTopWidth: 0, borderColor: colores.bordeSuave, backgroundColor: colores.blanco, paddingHorizontal: 6, minHeight: 56 },
  celda: { height: 56, justifyContent: 'center' },
  celdaEntrada: { fontSize: 17.5, fontWeight: '700', color: colores.titulo, paddingHorizontal: 8, paddingVertical: 8, height: '100%' },
  celdaEntradaError: { borderWidth: 2, borderColor: colores.primario },
  celdaTexto: { fontSize: 17.5, color: colores.titulo, paddingHorizontal: 4 },
  acciones: { flexDirection: 'row', justifyContent: 'center', gap: 22, marginTop: 12 },
  enlace: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6 },
  enlaceTexto: { color: colores.primario, fontWeight: '600', fontSize: 16 },
  formula: { textAlign: 'center', color: colores.textoSecundario, fontSize: 14, marginTop: 6 },
  info: { flexDirection: 'row', gap: 10, alignItems: 'center', backgroundColor: colores.primarioSuave, borderRadius: radios.tarjeta, padding: 14, marginTop: 14 },
  infoTexto: { flex: 1, color: colores.titulo, fontSize: 15.5, lineHeight: 21 },
  estadoTitulo: { fontSize: 12.5, fontWeight: '800', letterSpacing: 0.8, color: colores.primario, marginBottom: 2 },
  sugerida: { color: colores.textoSecundario, fontSize: 15, marginTop: 12 },
  grupo: { marginTop: 12, backgroundColor: colores.blanco, borderWidth: 1, borderColor: colores.bordeSuave, borderRadius: radios.tarjeta, padding: 14 },
  grupoAbierto: { borderColor: colores.primario, borderWidth: 1.5 },
  grupoCabecera: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  numeroGrupo: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  numeroGrupoTexto: { color: colores.blanco, fontWeight: '800', fontSize: 17 },
  grupoTitulo: { fontSize: 17.5, fontWeight: '700', color: colores.titulo },
  grupoSub: { fontSize: 14, color: colores.textoSecundario, marginTop: 2 },
  separador: { height: 1, backgroundColor: colores.bordeSuave, marginVertical: 12 },
  cargaPrueba: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  cargaPruebaK: { fontSize: 17, color: colores.titulo },
  plato: { marginTop: 14, alignItems: 'center' },
  platoFondo: { width: '84%', height: 150, backgroundColor: '#EEF2F7', borderWidth: 2, borderColor: colores.borde, borderRadius: 14 },
  punto: { position: 'absolute', width: 36, height: 36, marginLeft: -18, marginTop: -18, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  puntoTexto: { color: colores.blanco, fontWeight: '800', fontSize: 17 },
  platoTexto: { textAlign: 'center', color: colores.textoSecundario, fontSize: 14, marginTop: 6, marginBottom: 2 },
  etiqueta: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  etiquetaTexto: { fontSize: 11.5, fontWeight: '800', letterSpacing: 0.4 },
  agregarGrupo: { marginTop: 12, minHeight: 52, borderRadius: radios.boton, borderWidth: 1.5, borderColor: colores.primario, backgroundColor: colores.blanco, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  agregarGrupoTexto: { color: colores.primario, fontWeight: '700', fontSize: 17 },
  critico: { marginTop: 16, backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FCA5A5', borderRadius: radios.tarjeta, padding: 14, gap: 10 },
  criticoTitulo: { color: colores.rojoEtiquetaTexto, fontWeight: '800', fontSize: 16 },
  criticoTexto: { color: colores.titulo, fontSize: 17, lineHeight: 24 },
  criticoFila: { flexDirection: 'row', gap: 10 },
  criticoAyuda: { color: colores.rojoEtiquetaTexto, fontSize: 14.5, lineHeight: 20 },
  botonCritico: { minHeight: 48, borderRadius: radios.boton, borderWidth: 1.5, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 8 },
  botonCriticoTexto: { fontSize: 15.5, fontWeight: '700' },
  finalizar: { marginTop: 16, minHeight: 56, borderRadius: radios.boton, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  finalizarActivo: { backgroundColor: colores.primario },
  finalizarBloqueado: { backgroundColor: '#CBD3DF' },
  finalizarTexto: { color: colores.blanco, fontSize: 18, fontWeight: '700' },
  ayuda: { textAlign: 'center', color: colores.textoSecundario, fontSize: 15, marginTop: 8 },
  fab: { position: 'absolute', right: 20, bottom: 18, width: 64, height: 64, borderRadius: 20, backgroundColor: colores.blanco, alignItems: 'center', justifyContent: 'center', elevation: 6, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
  velo: { flex: 1, backgroundColor: 'rgba(15,23,42,0.55)', justifyContent: 'flex-end' },
  hoja: { backgroundColor: colores.blanco, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 28 },
  asa: { alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: colores.bordeSuave, marginBottom: 14 },
  hojaTitulo: { fontSize: 22, fontWeight: '800', color: colores.titulo },
  hojaSub: { fontSize: 15.5, color: colores.textoSecundario, marginTop: 4, marginBottom: 12, lineHeight: 22 },
  contacto: { flexDirection: 'row', alignItems: 'center', gap: 14, borderWidth: 1, borderColor: colores.bordeSuave, borderRadius: radios.tarjeta, padding: 14 },
  avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: colores.verde, alignItems: 'center', justifyContent: 'center' },
  avatarTexto: { color: colores.blanco, fontWeight: '800', fontSize: 20 },
  contactoNombre: { fontSize: 20, fontWeight: '800', color: colores.titulo },
  contactoSub: { fontSize: 15, color: colores.textoSecundario, marginTop: 2 },
  llamarAhora: { marginTop: 14, minHeight: 56, borderRadius: radios.boton, backgroundColor: colores.verde, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  llamarAhoraTexto: { color: colores.blanco, fontSize: 18, fontWeight: '700' },
  cancelar: { alignItems: 'center', paddingVertical: 14 },
  cancelarTexto: { fontSize: 18, fontWeight: '600', color: colores.textoSecundario },
  modal: { backgroundColor: colores.blanco, borderRadius: 20, padding: 20 },
  modalTitulo: { fontSize: 22, fontWeight: '800', color: colores.rojoEtiquetaTexto, flexShrink: 1 },
  avisoRojo: { backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FCA5A5', borderRadius: 12, padding: 12, gap: 6 },
  avisoRojoTexto: { fontSize: 15.5, color: colores.titulo, lineHeight: 22 },
  etiquetaMotivo: { fontSize: 17, fontWeight: '700', color: colores.titulo, marginTop: 14, marginBottom: 6 },
  motivo: { borderWidth: 1, borderColor: colores.borde, borderRadius: radios.campo, padding: 12, fontSize: 16, minHeight: 80, textAlignVertical: 'top', color: colores.texto },
  guardarNotificar: { marginTop: 14, minHeight: 54, borderRadius: radios.boton, backgroundColor: colores.rojo, alignItems: 'center', justifyContent: 'center' },
  guardarNotificarTexto: { color: colores.blanco, fontSize: 18, fontWeight: '700' },
  sello: { width: 84, height: 84, borderRadius: 42, alignItems: 'center', justifyContent: 'center' },
  resumenTitulo: { fontSize: 30, fontWeight: '800', color: colores.titulo, marginTop: 14 },
  resumenSub: { fontSize: 15.5, color: colores.textoSecundario, marginTop: 6, textAlign: 'center' },
  tarjeta: { marginTop: 18, backgroundColor: colores.blanco, borderWidth: 1, borderColor: colores.bordeSuave, borderRadius: radios.tarjeta, padding: 16 },
  resumenFilaTitulo: { fontSize: 18, color: colores.titulo, fontWeight: '600' },
  resumenFilaDetalle: { fontSize: 15, color: colores.textoSecundario, marginTop: 3, lineHeight: 21 },
  editar: { minHeight: 52, borderRadius: radios.boton, borderWidth: 1.5, borderColor: colores.primario, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  editarTexto: { color: colores.primario, fontWeight: '700', fontSize: 17 },
});
