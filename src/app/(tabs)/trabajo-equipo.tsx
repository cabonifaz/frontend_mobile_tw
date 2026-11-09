import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ErrorApi } from '@/api/cliente';
import { nombreDeCodigo, obtenerCatalogo } from '@/api/catalogos';
import { horaRespaldo } from '@/api/respaldo';
import { obtenerTrabajoEquipoConRespaldo, type EtapaTrabajo } from '@/api/trabajo';
import { Aviso } from '@/componentes/Aviso';
import { EncabezadoApp } from '@/componentes/EncabezadoApp';
import { useConsulta } from '@/hooks/useConsulta';
import { useDiseno } from '@/hooks/useDiseno';
import { useSesion } from '@/sesion/SesionContext';
import { colores, radios } from '@/tema/colores';
import { avanceEtapas } from '@/utilidades/trabajo';

/**
 * HU-08 — Trabajo en el equipo.
 *  - Cabecera: servicio (sigla y tipo), equipo, tipo de orden definido por la RQ (OS = Servicio técnico · OM = Metrología), tiempos y avance.
 *  - Las 5 etapas con su estado: Variables ambientales (HU-09), Registro fotográfico, Ensayos y Calibración (bloqueada hasta guardar las variables),
 *    Cabecera del informe y Correlativo y certificado. Las que aún no tienen pantalla avisan que se habilitan más adelante.
 *  - "Finalizar trabajo en equipo" se habilita cuando las 5 etapas están conformes (la decide el back).
 */
export default function PantallaTrabajoEquipo() {
  const { sesion } = useSesion();
  const usuario = sesion?.usuario;
  const d = useDiseno();
  const params = useLocalSearchParams<{ id?: string; equipo?: string }>();
  const idOs = Number(params.id);
  const idOsEquipo = Number(params.equipo);
  const valido = Number.isInteger(idOs) && idOs > 0 && Number.isInteger(idOsEquipo) && idOsEquipo > 0;
  const [mensaje, setMensaje] = useState<{ tipo: 'error' | 'info'; texto: string } | null>(null);

  const { datos, cargando, recargando, error, recargar } = useConsulta(async (token) => {
    if (!valido) throw new ErrorApi('Servicio o equipo no válido.', 400, 1);
    const [r, cargos] = await Promise.all([
      obtenerTrabajoEquipoConRespaldo(token, usuario?.idUsuario ?? 0, idOs, idOsEquipo),
      obtenerCatalogo(token, 'CARGO_USUARIO').catch(() => undefined),
    ]);
    return { trabajo: r.datos, sinConexion: r.sinConexion, guardadoEn: r.guardadoEn, cargos };
  }, `${params.id ?? ''}|${params.equipo ?? ''}`);

  // Al volver de una etapa (p. ej. de guardar las variables) se relee
  const primeraVez = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (primeraVez.current) primeraVez.current = false;
      else void recargar();
    }, [recargar]),
  );

  const cargo = nombreDeCodigo(datos?.cargos, usuario?.cargo) ?? usuario?.cargo ?? 'Técnico de Campo';
  const t = datos?.trabajo;
  const c = t?.cabecera;

  function abrirEtapa(e: EtapaTrabajo) {
    setMensaje(null);
    if (e.estado === 'bloqueado') return setMensaje({ tipo: 'info', texto: `${e.nombre}: ${e.detalle ?? 'etapa bloqueada.'}` });
    if (!e.disponible) return setMensaje({ tipo: 'info', texto: `${e.nombre} se habilita en la siguiente etapa de la app.` });
    if (e.codigo === 'variables') router.push({ pathname: '/variables-ambientales', params: { id: String(idOs), equipo: String(idOsEquipo) } });
  }

  const avance = avanceEtapas(c?.etapasConformes ?? 0, c?.etapasTotal ?? 5);

  return (
    <SafeAreaView style={estilos.area} edges={['top']}>
      <EncabezadoApp nombre={usuario?.nombre ?? ''} apellido={usuario?.apellido} subtitulo={`${usuario?.nombre ?? ''} · ${cargo}`} />
      <ScrollView
        contentContainerStyle={[estilos.contenido, { paddingHorizontal: d.margen, maxWidth: d.anchoMaximo }]}
        refreshControl={<RefreshControl refreshing={recargando} onRefresh={() => void recargar()} colors={[colores.primario]} />}
      >
        <View style={estilos.tituloFila}>
          <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Volver">
            <Ionicons name="arrow-back" size={24} color={colores.titulo} />
          </Pressable>
          <Text style={[estilos.titulo, { fontSize: d.tituloPantalla }]} accessibilityRole="header">
            Trabajo en el equipo
          </Text>
        </View>

        {cargando ? (
          <ActivityIndicator color={colores.primario} style={{ marginTop: 40 }} />
        ) : error || !t || !c ? (
          <Aviso tipo="error" mensaje={error ?? 'No se encontró el equipo.'} />
        ) : (
          <>
            <Text style={estilos.subtitulo}>
              {c.tipoOrden} {c.numeroOs.replace(/^(OS|OM)-?/i, '')}
              {c.cliente ? ` · ${c.cliente}` : ''}
            </Text>
            {datos?.sinConexion && (
              <View style={{ marginBottom: 10 }}>
                <Aviso mensaje={`Sin conexión: se muestra lo último guardado (${horaRespaldo(datos.guardadoEn)}).`} />
              </View>
            )}

            <View style={estilos.tarjeta} testID="cabecera-trabajo">
              <View style={estilos.filaCabecera}>
                <Text style={[estilos.servicio, { flex: 1 }]}>
                  SERVICIO: {[c.servicioSigla, c.servicio && c.servicio !== c.servicioSigla ? c.servicio : null].filter(Boolean).join(' · ') || c.nombre}
                </Text>
                <Etiqueta texto={c.estado === 'pausado' ? 'PAUSADO' : c.estado === 'completado' ? 'COMPLETADO' : 'EN EJECUCIÓN'}
                  fondo={c.estado === 'pausado' ? colores.amarilloFondo : c.estado === 'completado' ? colores.verdeEtiquetaFondo : colores.azulFondo}
                  color={c.estado === 'pausado' ? colores.amarilloTexto : c.estado === 'completado' ? colores.verdeEtiquetaTexto : colores.azulTexto} />
              </View>
              <Text style={estilos.equipo}>
                {c.nombre} · NS: {c.numeroSerie ?? '—'} · COD: {c.codigoCliente ?? '—'}
              </Text>
              <Text style={estilos.equipo}>
                Marca: {c.marca ?? '—'} · Modelo: {c.modelo ?? '—'}
                {c.ubicacion ? ` · ${c.ubicacion}` : ''}
              </Text>
              <View style={estilos.tipoOrden} testID="tipo-orden">
                <Ionicons name="git-branch-outline" size={18} color={colores.primario} />
                <Text style={estilos.tipoOrdenTexto}>
                  Tipo de orden definido por la RQ{c.numeroRq ? ` ${c.numeroRq.replace(/^RQ-?/i, '')}` : ''}:{' '}
                  <Text style={{ fontWeight: '800' }}>{c.tipoOrden === 'OM' ? 'OM · Metrología' : 'OS · Servicio técnico'}</Text>
                </Text>
              </View>
              <View style={estilos.tiempos}>
                <View style={{ flex: 1 }}>
                  <Text style={estilos.tiempoK}>T. ESTIMADO</Text>
                  <Text style={estilos.tiempoV}>{c.tiempoEstimadoMin !== null ? `${c.tiempoEstimadoMin} min` : '—'}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={estilos.tiempoK}>T. REAL</Text>
                  <Text style={estilos.tiempoV}>{c.tiempoRealMin} min</Text>
                </View>
              </View>
              <View style={estilos.avanceFila}>
                <Text style={estilos.avanceK}>AVANCE DEL EQUIPO</Text>
                <Text style={estilos.avanceK}>{avance.texto}</Text>
              </View>
              <View style={estilos.barra}>
                <View style={[estilos.barraRelleno, { width: `${Math.round(avance.fraccion * 100)}%` }]} />
              </View>
            </View>

            <Text style={estilos.seccion}>ETAPAS</Text>
            {t.etapas.map((e) => (
              <Pressable
                key={e.codigo}
                onPress={() => abrirEtapa(e)}
                style={[estilos.etapa, e.estado === 'bloqueado' && { opacity: 0.7 }]}
                accessibilityRole="button"
                testID={`etapa-${e.codigo}`}
              >
                <Ionicons name={iconoDe(e.codigo)} size={28} color={colores.primario} />
                <View style={{ flex: 1 }}>
                  <Text style={estilos.etapaNombre}>{e.nombre}</Text>
                  {!!e.detalle && <Text style={estilos.etapaDetalle}>{e.detalle}</Text>}
                </View>
                <View style={{ alignItems: 'flex-end', gap: 6 }}>
                  <EtiquetaEtapa estado={e.estado} />
                  <Ionicons name={e.estado === 'bloqueado' ? 'lock-closed-outline' : 'chevron-forward'} size={20} color={colores.textoSecundario} />
                </View>
              </Pressable>
            ))}

            {mensaje && (
              <View style={{ marginTop: 12 }} testID="mensaje-trabajo">
                <Aviso tipo={mensaje.tipo} mensaje={mensaje.texto} />
              </View>
            )}

            <View style={estilos.info}>
              <Ionicons name="information-circle-outline" size={20} color={colores.primario} />
              <Text style={estilos.infoTexto}>
                Al finalizar, con toda la información recopilada se genera el <Text style={{ fontWeight: '800' }}>Informe técnico</Text>.
              </Text>
            </View>

            <View style={{ marginTop: 14 }}>
              <Pressable
                onPress={() => setMensaje({ tipo: 'info', texto: 'La generación del informe técnico se habilita en la siguiente etapa de la app.' })}
                disabled={!c.puedeFinalizar}
                style={[estilos.finalizar, c.puedeFinalizar ? estilos.finalizarActivo : estilos.finalizarBloqueado]}
                accessibilityRole="button"
                accessibilityState={{ disabled: !c.puedeFinalizar }}
                testID="finalizar-trabajo"
              >
                <Ionicons name={c.puedeFinalizar ? 'checkmark-done' : 'lock-closed-outline'} size={22} color={colores.blanco} />
                <Text style={estilos.finalizarTexto}>Finalizar trabajo en equipo</Text>
              </Pressable>
              <Text style={estilos.ayuda}>Se habilita cuando todas las etapas estén conformes.</Text>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function iconoDe(codigo: string): keyof typeof Ionicons.glyphMap {
  switch (codigo) {
    case 'variables':
      return 'thermometer-outline';
    case 'fotos':
      return 'camera-outline';
    case 'ensayos':
      return 'speedometer-outline';
    case 'cabecera':
      return 'document-text-outline';
    default:
      return 'ribbon-outline';
  }
}

function Etiqueta({ texto, fondo, color }: { texto: string; fondo: string; color: string }) {
  return (
    <View style={[estilos.etiqueta, { backgroundColor: fondo }]}>
      <Text style={[estilos.etiquetaTexto, { color }]}>{texto}</Text>
    </View>
  );
}

const etapaEstilos: Record<string, { texto: string; fondo: string; color: string }> = {
  conforme: { texto: 'CONFORME', fondo: colores.verdeEtiquetaFondo, color: colores.verdeEtiquetaTexto },
  en_curso: { texto: 'EN CURSO', fondo: colores.azulFondo, color: colores.azulTexto },
  pendiente: { texto: 'PENDIENTE', fondo: colores.amarilloFondo, color: colores.amarilloTexto },
  bloqueado: { texto: 'BLOQUEADO', fondo: colores.grisFondo, color: colores.grisTexto },
};

function EtiquetaEtapa({ estado }: { estado: string }) {
  const s = etapaEstilos[estado] ?? etapaEstilos.pendiente;
  return <Etiqueta texto={s.texto} fondo={s.fondo} color={s.color} />;
}

const estilos = StyleSheet.create({
  area: { flex: 1, backgroundColor: colores.fondo },
  contenido: { paddingTop: 18, paddingBottom: 28, width: '100%', alignSelf: 'center' },
  tituloFila: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4 },
  titulo: { fontWeight: '700', color: colores.titulo, flexShrink: 1 },
  subtitulo: { color: colores.textoSecundario, fontSize: 14, marginBottom: 12 },
  tarjeta: { backgroundColor: colores.blanco, borderWidth: 1, borderColor: colores.bordeSuave, borderRadius: radios.tarjeta, padding: 16 },
  filaCabecera: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  servicio: { fontSize: 19, fontWeight: '800', color: colores.titulo, lineHeight: 25 },
  equipo: { fontSize: 15.5, color: colores.textoSecundario, marginTop: 6, lineHeight: 22 },
  etiqueta: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  etiquetaTexto: { fontSize: 11, fontWeight: '800', letterSpacing: 0.4 },
  tipoOrden: { flexDirection: 'row', gap: 8, alignItems: 'center', backgroundColor: colores.primarioSuave, borderRadius: 10, padding: 10, marginTop: 12 },
  tipoOrdenTexto: { flex: 1, color: colores.titulo, fontSize: 15.5, lineHeight: 21 },
  tiempos: { flexDirection: 'row', marginTop: 14 },
  tiempoK: { fontSize: 12, fontWeight: '700', letterSpacing: 0.5, color: colores.textoSecundario },
  tiempoV: { fontSize: 19, color: colores.titulo, marginTop: 2 },
  avanceFila: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 14 },
  avanceK: { fontSize: 12.5, fontWeight: '800', color: colores.primario, letterSpacing: 0.4 },
  barra: { height: 6, backgroundColor: colores.grisFondo, borderRadius: 3, overflow: 'hidden', marginTop: 8 },
  barraRelleno: { height: '100%', backgroundColor: colores.primario },
  seccion: { marginTop: 22, marginBottom: 2, fontSize: 12.5, fontWeight: '700', letterSpacing: 1.4, color: colores.textoSecundario },
  etapa: {
    marginTop: 12,
    backgroundColor: colores.blanco,
    borderWidth: 1,
    borderColor: colores.bordeSuave,
    borderRadius: radios.tarjeta,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  etapaNombre: { fontSize: 18, fontWeight: '700', color: colores.titulo },
  etapaDetalle: { fontSize: 15, color: colores.textoSecundario, marginTop: 3, lineHeight: 20 },
  info: { flexDirection: 'row', gap: 10, alignItems: 'center', backgroundColor: colores.primarioSuave, borderRadius: radios.tarjeta, padding: 14, marginTop: 16 },
  infoTexto: { flex: 1, color: colores.titulo, fontSize: 16, lineHeight: 22 },
  finalizar: { minHeight: 56, borderRadius: radios.boton, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  finalizarActivo: { backgroundColor: colores.primario },
  finalizarBloqueado: { backgroundColor: '#CBD3DF' },
  finalizarTexto: { color: colores.blanco, fontSize: 18, fontWeight: '700' },
  ayuda: { textAlign: 'center', color: colores.textoSecundario, fontSize: 15, marginTop: 8 },
});
