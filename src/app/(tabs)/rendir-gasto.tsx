import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { encolarGasto } from '@/api/colaGastos';
import { fotosVigentes, guardarProgreso, obtenerProgreso, quitarProgreso } from '@/api/progreso';
import { ErrorApi } from '@/api/cliente';
import { obtenerServiciosProgramados, type ServicioProgramado } from '@/api/servicios';
import {
  enviarGasto,
  obtenerConceptosGasto,
  obtenerViaticos,
  urlFotoGasto,
  type ConceptoGasto,
  type EntradaGasto,
  type Gasto,
  type LineaViatico,
  type RepartoGasto,
  type ResultadoGasto,
  type Viatico,
} from '@/api/viaticos';
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
import { estaEnCurso, fechaLimaHoy } from '@/utilidades/agenda';
import { soles } from '@/utilidades/dinero';
import { porcentaje } from '@/utilidades/progreso';
import { errorDeFecha, fechaDeCampo, fechaParaCampo, leerMontoGasto, MAX_FOTOS_GASTO, nuevoIdCliente, sumar } from '@/utilidades/gastos';

/**
 * HU-25 «Rendir gasto» · HU-27 «Nueva solicitud de gasto» y «Corregir gasto observado» — una sola pantalla con tres modos (?modo=):
 *  - viatico   (?idProgramacion): el gasto sale del adelanto. Se marcan uno o varios viáticos (conceptos) y se reparte el monto; el total es la suma. Si un monto
 *              supera lo que queda de ese viático, se avisa: se rinde completo y lo aprobado de más se reembolsa al cerrar la rendición.
 *  - reembolso : el técnico pagó con su dinero. Concepto del catálogo de la intranet (y texto si es «Otro»), monto, servicio (OS en curso o programada).
 *  - corregir  (?idGasto): un gasto OBSERVADO por el Jefe: se editan monto, descripción y fotos y vuelve a «pendiente de revisión».
 * Obligatorios: monto, fecha, descripción y al menos una foto (o el motivo de por qué no hay). La foto se toma SOLO con la cámara (sin galería).
 * Sin conexión, un gasto nuevo se guarda en el teléfono como POR ENVIAR y se envía solo (corregir necesita conexión).
 */
type Modo = 'viatico' | 'reembolso' | 'corregir';

interface FotoForm {
  clave: string;
  /** Foto nueva: archivo de la cámara. */
  uri?: string;
  /** Foto que ya está en el servidor (al corregir): su n. */
  orden?: number;
}

export default function PantallaRendirGasto() {
  const { sesion } = useSesion();
  const usuario = sesion?.usuario;
  const d = useDiseno();
  const params = useLocalSearchParams<{ modo?: string; idProgramacion?: string; idGasto?: string; borrador?: string }>();
  const modo: Modo = params.modo === 'reembolso' ? 'reembolso' : params.modo === 'corregir' ? 'corregir' : 'viatico';
  const [elegido, setElegido] = useState<number | null>(null);
  // HU-21: borrador guardado en el teléfono (undefined = leyéndolo; null = no hay)
  const [inicial, setInicial] = useState<BorradorGasto | null | undefined>(params.borrador ? undefined : null);
  useEffect(() => {
    if (!params.borrador || !usuario) return;
    void obtenerProgreso(usuario.idUsuario, params.borrador).then(async (p) => {
      const b = p?.borrador as BorradorGasto | undefined;
      setInicial(b ? { ...b, fotos: await fotosVigentes(b.fotos) } : null);
    });
  }, [params.borrador, usuario]);

  const { datos, cargando, error } = useConsulta(async (token) => {
    const [todo, conceptos, servicios] = await Promise.all([
      obtenerViaticos(token),
      modo === 'viatico' ? Promise.resolve([] as ConceptoGasto[]) : obtenerConceptosGasto(token).catch(() => [] as ConceptoGasto[]),
      modo === 'viatico' ? Promise.resolve([] as ServicioProgramado[]) : obtenerServiciosProgramados(token, 'todos', '').catch(() => [] as ServicioProgramado[]),
    ]);
    return { todo, conceptos, servicios };
  }, `${modo}|${params.idProgramacion ?? ''}|${params.idGasto ?? ''}`);

  const todo = datos?.todo ?? null;
  const gasto = modo === 'corregir' ? (todo?.gastos.find((g) => g.idGasto === Number(params.idGasto)) ?? null) : null;
  const origen: 'viatico' | 'reembolso' = modo === 'corregir' ? (gasto?.origen === 'viatico' ? 'viatico' : 'reembolso') : modo;
  const activos = (todo?.viaticos ?? []).filter((v) => !v.cerrado);
  const idProg = modo === 'corregir' ? (gasto?.idProgramacion ?? null) : params.idProgramacion ? Number(params.idProgramacion) : (elegido ?? (activos.length === 1 ? activos[0].idProgramacion : null));
  const viatico = todo?.viaticos.find((v) => v.idProgramacion === idProg) ?? null;

  const titulo = modo === 'corregir' ? 'Corregir gasto' : modo === 'reembolso' ? 'Nueva solicitud de gasto' : 'Rendir gasto';
  const gastoNoCorregible = modo === 'corregir' && (!gasto || gasto.estado !== 'observado' || !gasto.origen);

  return (
    <SafeAreaView style={estilos.area} edges={['top']}>
      <EncabezadoApp nombre={usuario?.nombre ?? ''} apellido={usuario?.apellido} subtitulo={`${usuario?.nombre ?? ''} · Técnico de Campo`} />
      <ScrollView
        contentContainerStyle={[estilos.contenido, { paddingHorizontal: d.margen, maxWidth: d.anchoMaximo }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={estilos.tituloFila}>
          <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Volver">
            <Ionicons name="arrow-back" size={24} color={colores.titulo} />
          </Pressable>
          <Text style={estilos.titulo} accessibilityRole="header">
            {titulo}
          </Text>
        </View>

        {cargando ? (
          <ActivityIndicator color={colores.primario} style={{ marginTop: 32 }} />
        ) : error || !todo ? (
          <Aviso tipo="error" mensaje={error ?? 'No se pudieron cargar tus viáticos.'} />
        ) : gastoNoCorregible ? (
          <Aviso tipo="error" mensaje="Este gasto ya no se puede corregir desde la app (solo los observados registrados desde la app)." />
        ) : origen === 'viatico' && !viatico ? (
          activos.length === 0 ? (
            <Aviso tipo="error" mensaje="No tienes viáticos activos para rendir un gasto. Si pagaste con tu dinero, solicita un reembolso." />
          ) : (
            <SelectorViatico viaticos={activos} onElegir={setElegido} />
          )
        ) : inicial === undefined ? (
          <ActivityIndicator color={colores.primario} style={{ marginTop: 32 }} />
        ) : (
          <Formulario
            key={`${modo}-${idProg ?? 0}-${gasto?.idGasto ?? 0}-${params.borrador ?? ''}`}
            inicial={inicial}
            modo={modo}
            origen={origen}
            viatico={viatico}
            lineas={(todo.lineas ?? []).filter((l) => l.idProgramacion === idProg)}
            gasto={gasto}
            repartos={(todo.repartos ?? []).filter((r) => r.idGasto === gasto?.idGasto)}
            nFotos={gasto?.nFotos ?? 0}
            fotosServidor={(todo.fotos ?? []).filter((f) => f.idGasto === gasto?.idGasto).map((f) => f.orden)}
            conceptos={datos?.conceptos ?? []}
            servicios={datos?.servicios ?? []}
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function SelectorViatico({ viaticos, onElegir }: { viaticos: Viatico[]; onElegir: (id: number) => void }) {
  return (
    <View style={{ gap: 10, marginTop: 8 }}>
      <Text style={estilos.etiqueta}>¿De qué viático sale el gasto?</Text>
      {viaticos.map((v) => (
        <Pressable key={v.idProgramacion} onPress={() => onElegir(v.idProgramacion)} accessibilityRole="button" style={estilos.tarjeta} testID={`elegir-viatico-${v.idProgramacion}`}>
          <Text style={estilos.lineaTitulo}>
            {v.numeroOs} · {v.codigo}
          </Text>
          <Text style={estilos.lineaSub}>{[v.cliente, v.sede].filter(Boolean).join(' · ')}</Text>
          <Text style={estilos.lineaSub}>Por rendir {soles(v.porRendir)}</Text>
        </Pressable>
      ))}
    </View>
  );
}

interface PropsFormulario {
  modo: Modo;
  origen: 'viatico' | 'reembolso';
  viatico: Viatico | null;
  lineas: LineaViatico[];
  gasto: Gasto | null;
  repartos: RepartoGasto[];
  nFotos: number;
  fotosServidor: number[];
  conceptos: ConceptoGasto[];
  servicios: ServicioProgramado[];
  inicial: BorradorGasto | null;
}

/** Lo que se guarda de un gasto a medio llenar (solo en el teléfono). */
interface BorradorGasto {
  idCliente: string;
  montos: Record<number, string | undefined>;
  monto: string;
  idConcepto: string | null;
  conceptoTexto: string;
  idOs: string | null;
  fecha: string;
  descripcion: string;
  /** Archivos de la cámara. */
  fotos: string[];
  motivo: string;
}

type Resultado = { tipo: 'enviado'; r: ResultadoGasto; corregido: boolean } | { tipo: 'guardado' };

function Formulario(p: PropsFormulario) {
  const { sesion } = useSesion();
  const token = sesion?.token ?? '';
  const hoy = fechaLimaHoy();
  const esViatico = p.origen === 'viatico';
  const corrige = p.modo === 'corregir';

  // Lo que ya tenía el gasto (al corregir)
  const previoPorLinea = useMemo(() => new Map(p.repartos.map((r) => [r.idViaticoLinea, r.monto])), [p.repartos]);
  const lineas = useMemo(
    () =>
      p.lineas.map((l) => {
        const id = l.idViaticoLinea ?? l.idConcepto;
        return { ...l, id, disponible: Math.max(0, l.porRendir) + (previoPorLinea.get(id) ?? 0) };
      }),
    [p.lineas, previoPorLinea],
  );

  const ini = p.inicial;
  const [montos, setMontos] = useState<Record<number, string | undefined>>(() =>
    ini ? ini.montos : Object.fromEntries(p.repartos.map((r) => [r.idViaticoLinea, String(r.monto)])),
  );
  const [monto, setMonto] = useState(() => ini?.monto ?? (p.gasto && !esViatico ? String(p.gasto.monto) : ''));
  const [idConcepto, setIdConcepto] = useState<string | null>(() => (ini ? ini.idConcepto : p.gasto?.idConcepto ? String(p.gasto.idConcepto) : null));
  const [conceptoTexto, setConceptoTexto] = useState(() => ini?.conceptoTexto ?? p.gasto?.conceptoTexto ?? '');
  const servicioInicial = p.gasto?.idOs ?? p.viatico?.idOs ?? p.servicios.find((s) => estaEnCurso(s))?.idOs ?? (p.servicios.length === 1 ? p.servicios[0].idOs : null);
  const [idOs, setIdOs] = useState<string | null>(() => (ini ? ini.idOs : servicioInicial ? String(servicioInicial) : null));
  const [fecha, setFecha] = useState(() => ini?.fecha ?? fechaParaCampo(p.gasto?.fecha ?? hoy));
  const [descripcion, setDescripcion] = useState(() => ini?.descripcion ?? p.gasto?.descripcion ?? '');
  const [fotos, setFotos] = useState<FotoForm[]>(() => (ini ? ini.fotos.map((uri, i) => ({ clave: `b${i}`, uri })) : p.fotosServidor.map((o) => ({ clave: `s${o}`, orden: o }))));
  const [motivo, setMotivo] = useState(() => ini?.motivo ?? p.gasto?.motivoSinFoto ?? '');
  const [camara, setCamara] = useState(false);
  const [exceso, setExceso] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [idCliente] = useState(() => ini?.idCliente ?? nuevoIdCliente());
  const usuario = sesion?.usuario;
  const terminado = useRef(false);

  const marcadas = lineas.filter((l) => montos[l.id] !== undefined);
  const montoTotal = esViatico ? sumar(marcadas.map((l) => leerMontoGasto(montos[l.id] ?? '') ?? 0)) : (leerMontoGasto(monto) ?? 0);
  const concepto = p.conceptos.find((c) => String(c.idConcepto) === idConcepto) ?? null;
  const fechaIso = fechaDeCampo(fecha);

  // Todo lo que falta para poder enviar (se muestra y bloquea «Enviar solicitud»)
  const faltantes: string[] = [];
  if (esViatico) {
    if (marcadas.length === 0) faltantes.push('Marca al menos un viático');
    else if (marcadas.some((l) => leerMontoGasto(montos[l.id] ?? '') === null)) faltantes.push('Escribe el monto de cada viático marcado');
  } else {
    if (!concepto) faltantes.push('Elige el concepto');
    else if (concepto.esOtro && conceptoTexto.trim().length < 2) faltantes.push('Escribe el concepto');
    if (leerMontoGasto(monto) === null) faltantes.push('Ingresa el monto (hasta 2 decimales)');
    if (!idOs) faltantes.push('Elige el servicio');
  }
  const errorFecha = errorDeFecha(fechaIso, hoy);
  if (errorFecha) faltantes.push(errorFecha);
  if (descripcion.trim().length < 3) faltantes.push('Escribe la descripción');
  if (fotos.length === 0 && motivo.trim().length < 3) faltantes.push('Toma la foto del comprobante o indica el motivo');
  const bloqueado = faltantes.length > 0 || enviando;

  // HU-21: cada cambio se guarda solo en el teléfono (un gasto nuevo; corregir uno observado no es un borrador)
  const conceptoNombre = esViatico ? marcadas.map((l) => l.concepto).join(' + ') : concepto?.esOtro ? conceptoTexto.trim() : (concepto?.concepto ?? '');
  const numeroOsBorrador = esViatico ? (p.viatico?.numeroOs ?? '') : (p.servicios.find((s) => String(s.idOs) === idOs)?.numeroOs ?? '');
  const camposTotal = 6;
  const camposHechos = [
    esViatico ? marcadas.length > 0 && marcadas.every((l) => leerMontoGasto(montos[l.id] ?? '') !== null) : !!concepto && (!concepto.esOtro || conceptoTexto.trim().length >= 2),
    esViatico ? marcadas.length > 0 : leerMontoGasto(monto) !== null,
    esViatico ? true : !!idOs,
    !errorFecha,
    descripcion.trim().length >= 3,
    fotos.length > 0 || motivo.trim().length >= 3,
  ].filter(Boolean).length;
  const hayContenido = montoTotal > 0 || !!conceptoNombre || descripcion.trim().length > 0 || fotos.length > 0 || motivo.trim().length > 0;
  useEffect(() => {
    if (corrige || resultado || terminado.current || !usuario || !hayContenido) return;
    const t = setTimeout(() => {
      if (terminado.current) return;
      void guardarProgreso(usuario.idUsuario, {
        id: `gasto-${idCliente}`,
        tipo: 'gasto',
        titulo: `${conceptoNombre || 'Gasto'}${montoTotal > 0 ? ` · ${soles(montoTotal)}` : ''}`,
        subtitulo: numeroOsBorrador ? `OS ${numeroOsBorrador.replace(/^OS-?/i, '')}` : '',
        paso: `${camposHechos} de ${camposTotal} campos completos`,
        porcentaje: porcentaje(camposHechos, camposTotal),
        ruta: '/rendir-gasto',
        params: { modo: p.modo, ...(esViatico && p.viatico ? { idProgramacion: String(p.viatico.idProgramacion) } : {}), borrador: `gasto-${idCliente}` },
        descartable: true,
        borrador: { idCliente, montos, monto, idConcepto, conceptoTexto, idOs, fecha, descripcion, fotos: fotos.flatMap((f) => (f.uri ? [f.uri] : [])), motivo } satisfies BorradorGasto,
      });
    }, 800);
    return () => clearTimeout(t);
  }, [corrige, resultado, usuario, hayContenido, idCliente, conceptoNombre, montoTotal, numeroOsBorrador, camposHechos, p.modo, p.viatico, esViatico, montos, monto, idConcepto, conceptoTexto, idOs, fecha, descripcion, fotos, motivo]);
  useEffect(() => {
    if (!resultado || !usuario) return;
    terminado.current = true;
    void quitarProgreso(usuario.idUsuario, `gasto-${idCliente}`);
  }, [resultado, usuario, idCliente]);

  const excedidas = esViatico ? marcadas.filter((l) => (leerMontoGasto(montos[l.id] ?? '') ?? 0) > l.disponible + 0.001) : [];

  function alternar(id: number) {
    setMontos((m) => {
      const { [id]: _quitado, ...resto } = m;
      return m[id] === undefined ? { ...m, [id]: '' } : resto;
    });
  }

  function alPulsarEnviar() {
    setError(null);
    if (excedidas.length > 0) setExceso(true);
    else void enviar();
  }

  async function enviar() {
    setExceso(false);
    if (!fechaIso) return;
    const idOsFinal = esViatico ? (p.gasto?.idOs ?? p.viatico?.idOs ?? 0) : Number(idOs);
    const entrada: EntradaGasto = {
      idCliente,
      origen: p.origen,
      idOs: idOsFinal,
      monto: montoTotal,
      fechaGasto: fechaIso,
      descripcion: descripcion.trim(),
      ...(esViatico
        ? { reparto: marcadas.map((l) => ({ idViaticoLinea: l.id, monto: leerMontoGasto(montos[l.id] ?? '') ?? 0 })) }
        : { idConcepto: Number(idConcepto), ...(concepto?.esOtro ? { conceptoTexto: conceptoTexto.trim() } : {}) }),
      ...(fotos.length === 0 ? { motivoSinFoto: motivo.trim() } : {}),
      ...(corrige ? { fotosConservar: fotos.filter((f) => f.orden !== undefined).map((f) => f.orden as number) } : {}),
    };
    const nuevas = fotos.filter((f) => f.uri).map((f) => f.uri as string);
    setEnviando(true);
    try {
      const r = await enviarGasto(token, corrige ? (p.gasto?.idGasto ?? 0) : 0, entrada, nuevas);
      setResultado({ tipo: 'enviado', r: r.resultado, corregido: corrige });
    } catch (e) {
      if (!corrige && e instanceof ErrorApi && e.estadoHttp === 0 && sesion) {
        const nombre = esViatico ? marcadas.map((l) => l.concepto).join(' + ') : concepto?.esOtro ? conceptoTexto.trim() : (concepto?.concepto ?? 'Gasto');
        const numeroOs = esViatico ? (p.viatico?.numeroOs ?? '') : (p.servicios.find((s) => s.idOs === idOsFinal)?.numeroOs ?? '');
        try {
          await encolarGasto(sesion.usuario.idUsuario, entrada, nuevas, { concepto: nombre, numeroOs, creadoEn: new Date().toISOString() });
          setResultado({ tipo: 'guardado' });
        } catch {
          setError('No hay conexión y no se pudo guardar la solicitud en el teléfono. Inténtalo de nuevo.');
        }
      } else {
        setError(e instanceof Error ? e.message : 'No se pudo enviar la solicitud.');
      }
    } finally {
      setEnviando(false);
    }
  }

  if (resultado) return <PantallaResultado resultado={resultado} monto={montoTotal} onOtro={() => router.replace({ pathname: '/rendir-gasto', params: { modo: p.modo === 'corregir' ? 'reembolso' : p.modo, idProgramacion: String(p.viatico?.idProgramacion ?? '') } })} />;

  return (
    <View style={{ gap: 14, marginTop: 6 }}>
      <Text style={estilos.subtitulo}>
        {esViatico ? `${p.viatico?.numeroOs ?? ''} · ${p.viatico?.codigo ?? ''}` : 'Reembolso · lo revisa el Jefe de Operaciones'}
      </Text>

      {corrige && !!p.gasto?.comentarioRevision && (
        <View style={estilos.observado}>
          <Text style={estilos.observadoTitulo}>{p.gasto.revisadoPor ?? 'Jefe de Operaciones'} observó este gasto</Text>
          <Text style={estilos.observadoTexto}>«{p.gasto.comentarioRevision}»</Text>
        </View>
      )}

      {esViatico ? (
        <View style={{ gap: 8 }}>
          <Text style={estilos.etiqueta}>¿Qué viáticos vas a usar? * (uno o varios)</Text>
          {lineas.length === 0 && <Aviso tipo="error" mensaje="Este viático no tiene adelantos por concepto para rendir." />}
          {lineas.map((l) => {
            const activa = montos[l.id] !== undefined;
            const agotado = l.disponible <= 0;
            return (
              <View key={l.id} style={[estilos.tarjeta, activa && estilos.tarjetaActiva, agotado && { opacity: 0.5 }]}>
                <Pressable
                  onPress={() => alternar(l.id)}
                  disabled={agotado}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: activa, disabled: agotado }}
                  style={estilos.filaLinea}
                  testID={`linea-${l.id}`}
                >
                  <Ionicons name={activa ? 'checkbox' : 'square-outline'} size={24} color={activa ? colores.primario : colores.textoTenue} />
                  <View style={{ flex: 1 }}>
                    <Text style={estilos.lineaTitulo}>{l.concepto}</Text>
                    <Text style={estilos.lineaSub}>
                      Asignado {soles(l.asignado)} · rendido {soles(l.rendido)}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={estilos.porRendirK}>{agotado ? 'AGOTADO' : 'POR RENDIR'}</Text>
                    {!agotado && <Text style={estilos.porRendirV}>{soles(l.disponible)}</Text>}
                  </View>
                </Pressable>
                {activa && (
                  <CampoTexto
                    etiqueta="Monto de este viático *"
                    value={montos[l.id] ?? ''}
                    onChangeText={(t) => setMontos((m) => ({ ...m, [l.id]: t }))}
                    keyboardType="decimal-pad"
                    placeholder="0.00"
                    testID={`monto-linea-${l.id}`}
                  />
                )}
              </View>
            );
          })}
          <View style={estilos.total}>
            <Text style={estilos.etiqueta}>Monto total (suma)</Text>
            <Text style={estilos.totalValor} testID="monto-total">
              {soles(montoTotal)}
            </Text>
          </View>
        </View>
      ) : (
        <>
          <Selector
            etiqueta="Concepto del gasto *"
            placeholder="Seleccionar"
            opciones={p.conceptos.map((c) => ({ valor: String(c.idConcepto), texto: c.concepto }))}
            valor={idConcepto}
            onCambio={setIdConcepto}
            testID="concepto"
          />
          {concepto?.esOtro && (
            <CampoTexto etiqueta="Escribe el concepto *" value={conceptoTexto} onChangeText={(t) => setConceptoTexto(t.slice(0, 100))} placeholder="Ej.: Lavandería" testID="concepto-texto" />
          )}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <CampoTexto etiqueta="Monto *" value={monto} onChangeText={setMonto} keyboardType="decimal-pad" placeholder="0.00" testID="monto" />
            </View>
            <View style={{ flex: 1 }}>
              <CampoTexto etiqueta="Moneda" value="S/ · Soles" editable={false} />
            </View>
          </View>
        </>
      )}

      <CampoTexto
        etiqueta="Fecha del gasto * (dd/mm/aaaa)"
        value={fecha}
        onChangeText={setFecha}
        keyboardType="numbers-and-punctuation"
        error={errorFecha && fecha.trim() ? errorFecha : null}
        testID="fecha"
      />

      {!esViatico && (
        <Selector
          etiqueta="Servicio * (tus OS programadas)"
          placeholder="Elegir servicio"
          opciones={p.servicios.map((s) => ({ valor: String(s.idOs), texto: `${s.numeroOs} · ${s.cliente ?? 'Sin cliente'}` }))}
          valor={idOs}
          onCambio={setIdOs}
          testID="servicio"
        />
      )}

      <CampoTexto
        etiqueta="Descripción *"
        value={descripcion}
        onChangeText={(t) => setDescripcion(t.slice(0, 300))}
        placeholder="Ej.: Almuerzo en planta, jornada extendida."
        multiline
        testID="descripcion"
      />

      <View style={{ gap: 8 }}>
        <Text style={estilos.etiqueta}>Fotos del comprobante (solo cámara · una o varias)</Text>
        <View style={estilos.fotos}>
          {fotos.map((f) => (
            <View key={f.clave} style={estilos.foto}>
              <Image
                source={f.uri ? { uri: f.uri } : { uri: urlFotoGasto(p.gasto?.idGasto ?? 0, f.orden ?? 1), headers: { Authorization: `Bearer ${token}` } }}
                style={StyleSheet.absoluteFill}
                resizeMode="cover"
                accessibilityLabel="Foto del comprobante"
              />
              <Pressable
                onPress={() => setFotos((fs) => fs.filter((x) => x.clave !== f.clave))}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Quitar foto"
                style={estilos.quitar}
              >
                <Ionicons name="close" size={14} color={colores.blanco} />
              </Pressable>
            </View>
          ))}
          {fotos.length < MAX_FOTOS_GASTO && (
            <Pressable onPress={() => setCamara(true)} accessibilityRole="button" style={estilos.tomar} testID="tomar-foto">
              <Ionicons name="camera-outline" size={26} color={colores.primario} />
              <Text style={estilos.tomarTexto}>{fotos.length === 0 ? 'Tomar foto · no galería' : 'Tomar otra'}</Text>
            </Pressable>
          )}
        </View>
        <Text style={estilos.nota}>
          {fotos.length} {fotos.length === 1 ? 'foto' : 'fotos'} · toca la X para quitar una · máx. {MAX_FOTOS_GASTO}
        </Text>
      </View>

      {fotos.length === 0 && (
        <CampoTexto
          etiqueta="Motivo por el que no se tomó la foto * (si no hay foto)"
          value={motivo}
          onChangeText={(t) => setMotivo(t.slice(0, 300))}
          placeholder="Ej.: el negocio no emite boleta; pagué en efectivo."
          multiline
          testID="motivo-sin-foto"
        />
      )}

      <View style={estilos.info}>
        <Ionicons name="information-circle-outline" size={18} color={colores.azulTexto} />
        <Text style={estilos.infoTexto}>
          Los datos deben coincidir con la foto del comprobante para evitar retrasos en la aprobación.
          {esViatico ? ' Si un monto supera lo que queda del viático, se rinde completo y lo aprobado de más se reembolsa al cerrar la rendición.' : ''}
        </Text>
      </View>

      {!!error && <Aviso tipo="error" mensaje={error} />}
      {faltantes.length > 0 && <Text style={estilos.faltan}>Falta: {faltantes.join(' · ')}</Text>}
      <Boton titulo={corrige ? 'Reenviar corrección' : 'Enviar solicitud'} onPress={alPulsarEnviar} deshabilitado={bloqueado} cargando={enviando} />

      <CamaraApp
        visible={camara}
        modo="foto"
        onCerrar={() => setCamara(false)}
        onFoto={(uri) => {
          setCamara(false);
          setFotos((fs) => (fs.length >= MAX_FOTOS_GASTO ? fs : [...fs, { clave: `n${Date.now()}`, uri }]));
        }}
      />

      <Modal visible={exceso} transparent animationType="fade" onRequestClose={() => setExceso(false)}>
        <View style={estilos.velo}>
          <View style={estilos.modal} testID="modal-exceso">
            <Ionicons name="wallet-outline" size={34} color={colores.naranja} style={{ alignSelf: 'center' }} />
            <Text style={estilos.modalTitulo}>Supera lo que queda en {excedidas.map((l) => l.concepto).join(' y ')}</Text>
            {excedidas.map((l) => {
              const m = leerMontoGasto(montos[l.id] ?? '') ?? 0;
              return (
                <View key={l.id} style={estilos.excesoCaja}>
                  <View style={estilos.excesoFila}>
                    <Text style={estilos.lineaSub}>Cubre el viático de {l.concepto}</Text>
                    <Text style={estilos.lineaTitulo}>{soles(l.disponible)}</Text>
                  </View>
                  <View style={estilos.excesoFila}>
                    <Text style={estilos.lineaSub}>Exceso: si el Jefe de Operaciones lo aprueba, se reembolsa al cerrar la rendición</Text>
                    <Text style={[estilos.lineaTitulo, { color: colores.naranja }]}>{soles(sumar([m]) - l.disponible)}</Text>
                  </View>
                </View>
              );
            })}
            <Boton titulo="Rendir el gasto completo" onPress={() => void enviar()} />
            <Pressable onPress={() => setExceso(false)} accessibilityRole="button" style={{ alignItems: 'center', padding: 10 }}>
              <Text style={estilos.corregirMonto}>Corregir monto</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function PantallaResultado({ resultado, monto, onOtro }: { resultado: Resultado; monto: number; onOtro: () => void }) {
  const guardado = resultado.tipo === 'guardado';
  const r = resultado.tipo === 'enviado' ? resultado.r : null;
  return (
    <View style={[estilos.tarjeta, { alignItems: 'center', gap: 10, paddingVertical: 24 }]} testID={guardado ? 'gasto-guardado' : 'gasto-enviado'}>
      <Ionicons name={guardado ? 'phone-portrait-outline' : 'checkmark-circle'} size={56} color={guardado ? colores.naranja : colores.verde} />
      <Text style={estilos.modalTitulo}>{guardado ? 'Guardada en el teléfono' : resultado.tipo === 'enviado' && resultado.corregido ? 'Corrección enviada' : 'Solicitud enviada'}</Text>
      <Text style={estilos.lineaSub}>
        {r ? `${r.codigo} · ${soles(monto)}` : soles(monto)}
      </Text>
      <Text style={[estilos.nota, { textAlign: 'center' }]}>
        {guardado
          ? 'No hay señal. La solicitud y su foto se enviarán solas al volver la conexión; queda como POR ENVIAR en Solicitudes.'
          : 'Se notificó al Jefe de Operaciones; lo revisa en la intranet. Lo aprobado se reembolsa o se descuenta al cerrar la rendición.'}
      </Text>
      {r?.coincideIa === false && r.montoIa != null && (
        <Aviso tipo="info" mensaje={`La IA leyó ${soles(r.montoIa)} en el comprobante y no coincide con el monto declarado: revisa que los datos coincidan con la foto.`} />
      )}
      {(r?.advertencias ?? []).map((a) => (
        <Aviso key={a} tipo="info" mensaje={a} />
      ))}
      <View style={{ alignSelf: 'stretch', gap: 8, marginTop: 6 }}>
        <Boton titulo="Ver mis gastos" onPress={() => router.replace({ pathname: '/viaticos-gastos', params: { tab: 'solicitudes' } })} />
        <Boton titulo="Registrar otro gasto" variante="secundario" onPress={onOtro} />
      </View>
    </View>
  );
}

const estilos = StyleSheet.create({
  area: { flex: 1, backgroundColor: colores.fondo },
  contenido: { padding: 16, paddingBottom: 40, maxWidth: 560, width: '100%', alignSelf: 'center' },
  tituloFila: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  titulo: { fontSize: 24, fontWeight: '700', color: colores.titulo, flexShrink: 1 },
  subtitulo: { fontSize: 13.5, color: colores.textoSecundario },
  etiqueta: { fontSize: 13.5, fontWeight: '700', color: colores.titulo },
  tarjeta: { backgroundColor: colores.tarjeta, borderRadius: radios.tarjeta, borderWidth: 1, borderColor: colores.bordeSuave, padding: 12, gap: 8 },
  tarjetaActiva: { borderColor: colores.primario, borderWidth: 1.5 },
  filaLinea: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  lineaTitulo: { fontSize: 14.5, fontWeight: '700', color: colores.titulo },
  lineaSub: { fontSize: 12.5, color: colores.textoSecundario, flexShrink: 1 },
  porRendirK: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.6, color: colores.textoTenue },
  porRendirV: { fontSize: 15, fontWeight: '800', color: colores.primario },
  total: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4 },
  totalValor: { fontSize: 20, fontWeight: '800', color: colores.titulo },
  fotos: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  foto: { width: 96, height: 96, borderRadius: 10, overflow: 'hidden', backgroundColor: colores.grisFondo },
  quitar: { position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: 11, backgroundColor: colores.rojo, alignItems: 'center', justifyContent: 'center' },
  tomar: { width: 96, height: 96, borderRadius: 10, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colores.primario, alignItems: 'center', justifyContent: 'center', gap: 4, padding: 6 },
  tomarTexto: { fontSize: 11.5, color: colores.primario, fontWeight: '700', textAlign: 'center' },
  nota: { fontSize: 12, color: colores.textoTenue },
  info: { flexDirection: 'row', gap: 8, backgroundColor: colores.azulFondo, borderRadius: radios.campo, padding: 10 },
  infoTexto: { flex: 1, fontSize: 12.5, lineHeight: 17, color: colores.azulTexto },
  faltan: { fontSize: 12.5, color: colores.textoSecundario, textAlign: 'center' },
  observado: { backgroundColor: colores.amarilloFondo, borderRadius: radios.campo, padding: 12, gap: 4 },
  observadoTitulo: { fontSize: 13, fontWeight: '800', color: colores.amarilloTexto },
  observadoTexto: { fontSize: 13.5, color: colores.amarilloTexto },
  velo: { flex: 1, backgroundColor: 'rgba(11,31,58,0.55)', justifyContent: 'center', padding: 22 },
  modal: { backgroundColor: colores.blanco, borderRadius: 18, padding: 18, gap: 12 },
  modalTitulo: { fontSize: 18, fontWeight: '800', color: colores.titulo, textAlign: 'center' },
  excesoCaja: { backgroundColor: colores.grisFondo, borderRadius: 12, padding: 12, gap: 8 },
  excesoFila: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  corregirMonto: { fontSize: 15, fontWeight: '700', color: colores.textoSecundario },
});
