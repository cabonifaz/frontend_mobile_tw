import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { obtenerListaRecepcion, type ItemOm } from '@/api/recepcionOm';
import { Aviso } from '@/componentes/Aviso';
import { EncabezadoApp } from '@/componentes/EncabezadoApp';
import { useConsulta } from '@/hooks/useConsulta';
import { useDiseno } from '@/hooks/useDiseno';
import { useSesion } from '@/sesion/SesionContext';
import { colores, radios } from '@/tema/colores';
import { MAX_BUSQUEDA, etiquetaOm, textoAvance, textoInstrumentos } from '@/utilidades/recepcionOm';

type Pestana = 'por_recibir' | 'recibidos';

/**
 * HU-23 — Recepción de instrumentos (OM) (Menú → Recepción Instrumentos OM).
 *  - «Por recibir»: las OM con instrumentos que aún no llegan al taller (las parciales primero). «Recibidos hoy»: las OM con una recepción de hoy (Conforme / Observado / Parcial).
 *  - Se busca por N° de OM, cliente o N° de guía. Al tocar una OM se abre su recepción (instrumentos, trazabilidad de la entrega, fotos y firma).
 * Qué OM ve el técnico y el estado de cada recepción lo decide el servidor. Exige conexión.
 */
export default function PantallaRecepcionOm() {
  const { sesion } = useSesion();
  const usuario = sesion?.usuario;
  const d = useDiseno();
  const [pestana, setPestana] = useState<Pestana>('por_recibir');
  const [texto, setTexto] = useState('');
  const [buscar, setBuscar] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setBuscar(texto.trim()), 300);
    return () => clearTimeout(t);
  }, [texto]);

  const { datos, cargando, recargando, error, recargar } = useConsulta((token) => obtenerListaRecepcion(token, buscar), buscar);

  // Al volver de registrar una recepción se actualiza la lista
  const primeraVez = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (primeraVez.current) primeraVez.current = false;
      else void recargar();
    }, [recargar]),
  );

  const lista = (pestana === 'por_recibir' ? datos?.porRecibir : datos?.recibidosHoy) ?? [];
  const abrir = (o: ItemOm) => router.push({ pathname: '/recepcion-om-detalle', params: { om: String(o.idOs) } } as unknown as Href);

  return (
    <SafeAreaView style={estilos.area} edges={['top']}>
      <EncabezadoApp nombre={usuario?.nombre ?? ''} apellido={usuario?.apellido} subtitulo={`${usuario?.nombre ?? ''} · ${usuario?.cargo ?? 'Técnico de Metrología'}`} />
      <ScrollView
        contentContainerStyle={[estilos.contenido, { paddingHorizontal: d.margen, maxWidth: d.anchoMaximo }]}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={recargando} onRefresh={() => void recargar()} colors={[colores.primario]} />}
      >
        <View style={estilos.tituloFila}>
          <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Volver">
            <Ionicons name="arrow-back" size={24} color={colores.titulo} />
          </Pressable>
          <Text style={[estilos.titulo, { fontSize: d.tituloPantalla }]} accessibilityRole="header">
            Recepción en taller
          </Text>
        </View>
        <Text style={estilos.subtitulo}>Instrumentos OM · Metrología</Text>

        <View style={estilos.buscador}>
          <Ionicons name="search-outline" size={18} color={colores.textoSecundario} />
          <TextInput
            value={texto}
            onChangeText={(t) => setTexto(t.slice(0, MAX_BUSQUEDA))}
            placeholder="Buscar OM, cliente o N° de guía"
            placeholderTextColor={colores.placeholder}
            style={estilos.buscadorTexto}
            autoCorrect={false}
            returnKeyType="search"
            testID="recepcion-buscar"
          />
          {texto.length > 0 && (
            <Pressable onPress={() => setTexto('')} hitSlop={10} accessibilityRole="button" accessibilityLabel="Borrar búsqueda">
              <Ionicons name="close-circle" size={18} color={colores.textoSecundario} />
            </Pressable>
          )}
        </View>

        <View style={estilos.pestanas} accessibilityRole="tablist">
          <Chip texto={`Por recibir (${datos?.porRecibir.length ?? 0})`} activo={pestana === 'por_recibir'} onPress={() => setPestana('por_recibir')} testID="tab-por-recibir" />
          <Chip texto={`Recibidos hoy (${datos?.recibidosHoy.length ?? 0})`} activo={pestana === 'recibidos'} onPress={() => setPestana('recibidos')} testID="tab-recibidos" />
        </View>

        {cargando ? (
          <ActivityIndicator color={colores.primario} style={{ marginTop: 32 }} />
        ) : error ? (
          <Aviso tipo="error" mensaje={error} />
        ) : lista.length === 0 ? (
          <View style={estilos.vacio} testID="recepcion-vacio">
            <Ionicons name="file-tray-outline" size={34} color={colores.textoTenue} />
            <Text style={estilos.vacioTexto}>
              {buscar ? 'No hay OM que coincidan con la búsqueda.' : pestana === 'por_recibir' ? 'No tienes instrumentos por recibir.' : 'Aún no se registró ninguna recepción hoy.'}
            </Text>
          </View>
        ) : (
          <>
            <Text style={estilos.seccion}>{pestana === 'por_recibir' ? 'POR RECIBIR' : 'RECIBIDOS HOY'}</Text>
            {lista.map((o) => (
              <TarjetaOm key={o.idOs} o={o} recibidoHoy={pestana === 'recibidos'} onPress={() => abrir(o)} />
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Chip({ texto, activo, onPress, testID }: { texto: string; activo: boolean; onPress: () => void; testID?: string }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="tab" accessibilityState={{ selected: activo }} style={[estilos.chip, activo && estilos.chipActivo]} testID={testID}>
      <Text style={[estilos.chipTexto, activo && { color: colores.blanco }]}>{texto}</Text>
    </Pressable>
  );
}

function TarjetaOm({ o, recibidoHoy, onPress }: { o: ItemOm; recibidoHoy: boolean; onPress: () => void }) {
  const et = etiquetaOm(o.estado);
  const detalle = recibidoHoy
    ? [o.estado === 'parcial' ? textoAvance(o.recibidos, o.totalInstrumentos) : textoInstrumentos(o.recibidos), o.guia ? `Guía ${o.guia}` : null, o.hora].filter(Boolean).join(' · ')
    : [o.estado === 'parcial' ? textoAvance(o.recibidos, o.totalInstrumentos) : textoInstrumentos(o.totalInstrumentos), o.guia ? `Guía ${o.guia}` : null].filter(Boolean).join(' · ');
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${o.numero} ${o.cliente ?? ''}: ${et.texto}`} style={estilos.tarjeta} testID={`om-${o.idOs}`}>
      <View style={estilos.tarjetaCabecera}>
        <Text style={estilos.tarjetaTitulo}>
          {o.numero}
          {o.cliente ? ` · ${o.cliente}` : ''}
        </Text>
        <View style={[estilos.pill, { backgroundColor: et.fondo }]}>
          <Text style={[estilos.pillTexto, { color: et.color }]}>{et.texto}</Text>
        </View>
      </View>
      <Text style={estilos.linea}>{detalle}</Text>
      {!recibidoHoy && o.pendientes.length > 0 && o.estado === 'parcial' && <Text style={estilos.linea}>Falta: {o.pendientes.join(', ')}</Text>}
      {!!o.servicio && !recibidoHoy && <Text style={estilos.linea}>{o.servicio}</Text>}
    </Pressable>
  );
}

const estilos = StyleSheet.create({
  area: { flex: 1, backgroundColor: colores.fondo },
  contenido: { paddingTop: 18, paddingBottom: 28, width: '100%', alignSelf: 'center', gap: 10 },
  tituloFila: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  titulo: { fontWeight: '700', color: colores.titulo, flexShrink: 1 },
  subtitulo: { color: colores.textoSecundario, fontSize: 14, marginTop: -4, marginLeft: 36 },
  buscador: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colores.tarjeta, borderWidth: 1, borderColor: colores.borde, borderRadius: radios.campo, paddingHorizontal: 12, minHeight: 46 },
  buscadorTexto: { flex: 1, fontSize: 15.5, color: colores.texto, paddingVertical: 8 },
  pestanas: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: { borderWidth: 1, borderColor: colores.borde, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7, backgroundColor: colores.tarjeta },
  chipActivo: { backgroundColor: colores.primario, borderColor: colores.primario },
  chipTexto: { fontSize: 14, fontWeight: '700', color: colores.titulo },
  seccion: { fontSize: 11.5, fontWeight: '800', letterSpacing: 1, color: colores.textoSecundario, marginTop: 6 },
  tarjeta: { backgroundColor: colores.tarjeta, borderRadius: radios.tarjeta, borderWidth: 1, borderColor: colores.bordeSuave, padding: 14, gap: 4 },
  tarjetaCabecera: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  tarjetaTitulo: { flex: 1, fontSize: 16, fontWeight: '800', color: colores.titulo, lineHeight: 22 },
  pill: { borderRadius: 8, paddingHorizontal: 9, paddingVertical: 3 },
  pillTexto: { fontSize: 11, fontWeight: '800', letterSpacing: 0.3 },
  linea: { fontSize: 13.5, color: colores.textoSecundario, lineHeight: 19 },
  vacio: { alignItems: 'center', gap: 10, paddingVertical: 36 },
  vacioTexto: { fontSize: 14.5, color: colores.textoSecundario, textAlign: 'center' },
});
