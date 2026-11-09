import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ErrorApi } from '@/api/cliente';
import { nombreDeCodigo, obtenerCatalogo } from '@/api/catalogos';
import { guardarVariablesAmbientales, obtenerTrabajoEquipoConRespaldo } from '@/api/trabajo';
import { Aviso } from '@/componentes/Aviso';
import { Boton } from '@/componentes/Boton';
import { EncabezadoApp } from '@/componentes/EncabezadoApp';
import { useConsulta } from '@/hooks/useConsulta';
import { useDiseno } from '@/hooks/useDiseno';
import { useSesion } from '@/sesion/SesionContext';
import { colores, radios } from '@/tema/colores';
import { fechaCorta, horaDe } from '@/utilidades/formato';
import { MAX_PROCEDENCIA, PROCEDENCIA_POR_DEFECTO, leerNumero, textoNumero, validarVariables } from '@/utilidades/trabajo';

/**
 * HU-09 — Registro de variables ambientales.
 *  - Temperatura (°C) y humedad relativa (%) obligatorias; procedencia con "N.I" (no indicado) por defecto.
 *  - Fecha y hora las toma la app (el servidor pone las definitivas) y no se pueden editar.
 *  - Al guardar se habilita "Ensayos y Calibración". Guardar exige conexión: es un dato metrológico que no se pierde ni se duplica.
 */
export default function PantallaVariablesAmbientales() {
  const { sesion } = useSesion();
  const usuario = sesion?.usuario;
  const d = useDiseno();
  const params = useLocalSearchParams<{ id?: string; equipo?: string }>();
  const idOs = Number(params.id);
  const idOsEquipo = Number(params.equipo);
  const valido = Number.isInteger(idOs) && idOs > 0 && Number.isInteger(idOsEquipo) && idOsEquipo > 0;

  // null = el técnico aún no tocó el campo: se muestra lo ya registrado (o vacío / "N.I")
  const [editTemperatura, setTemperatura] = useState<string | null>(null);
  const [editHumedad, setHumedad] = useState<string | null>(null);
  const [editProcedencia, setProcedencia] = useState<string | null>(null);
  const [intento, setIntento] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: 'error' | 'info'; texto: string } | null>(null);
  const [ahora, setAhora] = useState(() => new Date());

  const { datos, cargando, error } = useConsulta(async (token) => {
    if (!valido) throw new ErrorApi('Servicio o equipo no válido.', 400, 1);
    const [r, cargos] = await Promise.all([
      obtenerTrabajoEquipoConRespaldo(token, usuario?.idUsuario ?? 0, idOs, idOsEquipo),
      obtenerCatalogo(token, 'CARGO_USUARIO').catch(() => undefined),
    ]);
    return { trabajo: r.datos, cargos };
  }, `${params.id ?? ''}|${params.equipo ?? ''}`);

  // Si ya se registraron, se muestran para corregirlas
  const registradas = datos?.trabajo.variables ?? null;
  const temperatura = editTemperatura ?? (registradas ? textoNumero(registradas.temperatura) : '');
  const humedad = editHumedad ?? (registradas ? textoNumero(registradas.humedad) : '');
  const procedencia = editProcedencia ?? registradas?.procedencia ?? PROCEDENCIA_POR_DEFECTO;

  // Fecha y hora que muestra la tarjeta: se refrescan mientras la pantalla está abierta
  useEffect(() => {
    const t = setInterval(() => setAhora(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  const errores = useMemo(() => validarVariables(temperatura, humedad, procedencia), [temperatura, humedad, procedencia]);
  const cargo = nombreDeCodigo(datos?.cargos, usuario?.cargo) ?? usuario?.cargo ?? 'Técnico de Campo';
  const c = datos?.trabajo.cabecera;
  const puedeRegistrar = c?.puedeRegistrar === true;
  const limaIso = new Date(ahora.getTime() - 5 * 3_600_000).toISOString().slice(0, 19);

  async function guardar() {
    setIntento(true);
    setMensaje(null);
    if (!sesion || !puedeRegistrar) return;
    const t = leerNumero(temperatura);
    const h = leerNumero(humedad);
    if (Object.keys(errores).length > 0 || t === null || h === null) return;
    setGuardando(true);
    try {
      await guardarVariablesAmbientales(sesion.token, idOs, idOsEquipo, { temperatura: t, humedad: h, procedencia });
      router.back();
    } catch (e) {
      setMensaje({
        tipo: 'error',
        texto:
          e instanceof ErrorApi && e.estadoHttp === 0
            ? 'Sin conexión: las variables ambientales se guardan con señal. Inténtalo cuando vuelva.'
            : e instanceof Error
              ? e.message
              : 'No se pudieron guardar las variables ambientales.',
      });
    } finally {
      setGuardando(false);
    }
  }

  const err = (k: keyof typeof errores) => (intento ? errores[k] : undefined);

  return (
    <SafeAreaView style={estilos.area} edges={['top']}>
      <EncabezadoApp nombre={usuario?.nombre ?? ''} apellido={usuario?.apellido} subtitulo={`${usuario?.nombre ?? ''} · ${cargo}`} />
      <ScrollView contentContainerStyle={[estilos.contenido, { paddingHorizontal: d.margen, maxWidth: d.anchoMaximo }]} keyboardShouldPersistTaps="handled">
        <View style={estilos.tituloFila}>
          <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Volver">
            <Ionicons name="arrow-back" size={24} color={colores.titulo} />
          </Pressable>
          <Text style={[estilos.titulo, { fontSize: d.tituloPantalla }]} accessibilityRole="header">
            Variables Ambientales
          </Text>
        </View>

        {cargando ? (
          <ActivityIndicator color={colores.primario} style={{ marginTop: 40 }} />
        ) : error || !c ? (
          <Aviso tipo="error" mensaje={error ?? 'No se encontró el equipo.'} />
        ) : (
          <>
            <Text style={estilos.subtitulo}>
              {c.nombre} · {c.numeroOs}
            </Text>
            <View style={estilos.info}>
              <Ionicons name="information-circle-outline" size={20} color={colores.primario} />
              <Text style={estilos.infoTexto}>Los campos marcados con (*) son obligatorios para completar la etapa de pesaje.</Text>
            </View>

            {!puedeRegistrar && (
              <View style={{ marginTop: 12 }}>
                <Aviso mensaje="Para registrar las variables el equipo debe estar en ejecución. Reanúdalo o inícialo desde los objetivos." />
              </View>
            )}

            <Text style={estilos.etiqueta}>Temperatura *</Text>
            <Campo valor={temperatura} onCambio={setTemperatura} unidad="°C" teclado="numbers-and-punctuation" error={err('temperatura')} testID="variable-temperatura" editable={puedeRegistrar} />

            <Text style={estilos.etiqueta}>Humedad relativa *</Text>
            <Campo valor={humedad} onCambio={setHumedad} unidad="%" teclado="decimal-pad" error={err('humedad')} testID="variable-humedad" editable={puedeRegistrar} />

            <Text style={estilos.etiqueta}>Procedencia</Text>
            <Campo valor={procedencia} onCambio={(t) => setProcedencia(t.slice(0, MAX_PROCEDENCIA))} error={err('procedencia')} testID="variable-procedencia" editable={puedeRegistrar} />
            <Text style={estilos.ayuda}>Origen o procedencia del equipo a calibrar. Por defecto «{PROCEDENCIA_POR_DEFECTO}» (no indicado).</Text>

            <Text style={estilos.seccion}>METADATOS AUTOMÁTICOS</Text>
            <View style={estilos.meta}>
              <View style={estilos.metaCaja}>
                <Text style={estilos.metaK}>Fecha</Text>
                <Text style={estilos.metaV}>{fechaCorta(limaIso)}</Text>
              </View>
              <View style={estilos.metaCaja}>
                <Text style={estilos.metaK}>Hora</Text>
                <Text style={estilos.metaV}>{horaDe(limaIso)}</Text>
              </View>
            </View>
            <Text style={estilos.ayuda}>
              <Ionicons name="lock-closed-outline" size={13} /> Fecha y hora las toma la app y no se pueden editar.
            </Text>

            {mensaje && (
              <View style={{ marginTop: 12 }} testID="mensaje-variables">
                <Aviso tipo={mensaje.tipo} mensaje={mensaje.texto} />
              </View>
            )}

            <View style={{ marginTop: 18, gap: 12 }}>
              <Boton titulo="Guardar" onPress={() => void guardar()} cargando={guardando} deshabilitado={!puedeRegistrar} />
              <Boton titulo="Cancelar" variante="secundario" onPress={() => router.back()} />
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Campo(props: {
  valor: string;
  onCambio: (t: string) => void;
  unidad?: string;
  teclado?: 'numbers-and-punctuation' | 'decimal-pad';
  error?: string;
  testID: string;
  editable: boolean;
}) {
  return (
    <View>
      <View style={[estilos.caja, !!props.error && { borderColor: colores.error }, !props.editable && { backgroundColor: '#F1F4F8' }]}>
        <TextInput
          value={props.valor}
          onChangeText={props.onCambio}
          keyboardType={props.teclado}
          editable={props.editable}
          style={estilos.input}
          autoCorrect={false}
          testID={props.testID}
        />
        {!!props.unidad && <Text style={estilos.unidad}>{props.unidad}</Text>}
      </View>
      {!!props.error && <Text style={estilos.error}>{props.error}</Text>}
    </View>
  );
}

const estilos = StyleSheet.create({
  area: { flex: 1, backgroundColor: colores.fondo },
  contenido: { paddingTop: 18, paddingBottom: 28, width: '100%', alignSelf: 'center' },
  tituloFila: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4 },
  titulo: { fontWeight: '700', color: colores.titulo, flexShrink: 1 },
  subtitulo: { color: colores.textoSecundario, fontSize: 14, marginBottom: 12 },
  info: { flexDirection: 'row', gap: 10, alignItems: 'center', backgroundColor: colores.primarioSuave, borderRadius: radios.tarjeta, padding: 14 },
  infoTexto: { flex: 1, color: colores.titulo, fontSize: 14.5 },
  etiqueta: { fontSize: 18, fontWeight: '700', color: colores.titulo, marginTop: 20, marginBottom: 8 },
  caja: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colores.borde, borderRadius: radios.campo, backgroundColor: colores.blanco, minHeight: 54 },
  input: { flex: 1, minWidth: 0, paddingHorizontal: 16, paddingVertical: 12, fontSize: 18, color: colores.texto },
  unidad: { paddingRight: 16, fontSize: 17, color: colores.textoTenue },
  error: { color: colores.error, fontSize: 13, marginTop: 6 },
  ayuda: { color: colores.textoSecundario, fontSize: 13.5, marginTop: 8 },
  seccion: { marginTop: 22, fontSize: 12.5, fontWeight: '700', letterSpacing: 1.4, color: colores.textoSecundario },
  meta: { flexDirection: 'row', gap: 10, marginTop: 10 },
  metaCaja: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: colores.bordeSuave,
    borderRadius: radios.tarjeta,
    backgroundColor: colores.blanco,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  metaK: { color: colores.textoSecundario, fontSize: 14 },
  metaV: { color: colores.titulo, fontSize: 18, fontWeight: '800' },
});
