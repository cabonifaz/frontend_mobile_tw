import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { listarProgreso, quitarProgreso, suscribirProgreso, type Progreso } from '@/api/progreso';
import { Aviso } from '@/componentes/Aviso';
import { Boton } from '@/componentes/Boton';
import { EncabezadoApp } from '@/componentes/EncabezadoApp';
import { useDiseno } from '@/hooks/useDiseno';
import { useSesion } from '@/sesion/SesionContext';
import { colores, radios } from '@/tema/colores';
import { confirmar } from '@/utilidades/dialogos';
import { ETIQUETA_TIPO, FILTROS_PROGRESO, filtrarProgreso, textoGuardado, type FiltroProgreso } from '@/utilidades/progreso';

/**
 * HU-21 — Progreso Guardado (Menú → Progreso Guardado).
 * Trabajos sin terminar guardados SOLO en el teléfono: servicios programados (trabajo en el equipo), solicitudes de gastos e ingreso de equipos.
 * Cada tarjeta indica el tipo de trabajo, el paso donde se quedó, el porcentaje de avance y la hora del último guardado.
 * «Continuar» abre la misma pantalla y paso; «Descartar» solo existe en borradores de gastos e ingresos (el servicio programado no se descarta).
 */
export default function PantallaProgreso() {
  const { sesion } = useSesion();
  const usuario = sesion?.usuario;
  const idUsuario = usuario?.idUsuario ?? 0;
  const d = useDiseno();
  const [lista, setLista] = useState<Progreso[] | null>(null);
  const [filtro, setFiltro] = useState<FiltroProgreso>('todo');

  const cargar = useCallback(async () => setLista(await listarProgreso(idUsuario)), [idUsuario]);
  useFocusEffect(
    useCallback(() => {
      void cargar();
    }, [cargar]),
  );
  useEffect(() => suscribirProgreso(() => void cargar()), [cargar]);

  const visibles = filtrarProgreso(lista ?? [], filtro);

  async function descartar(p: Progreso) {
    const si = await confirmar('¿Descartar este avance?', `Se borrará el borrador de ${p.titulo}. No se puede deshacer.`, 'Descartar');
    if (si) await quitarProgreso(idUsuario, p.id);
  }

  return (
    <SafeAreaView style={estilos.area} edges={['top']}>
      <EncabezadoApp nombre={usuario?.nombre ?? ''} apellido={usuario?.apellido} subtitulo={`${usuario?.nombre ?? ''} · ${usuario?.cargo ?? 'Técnico de Campo'}`} />
      <ScrollView contentContainerStyle={[estilos.contenido, { paddingHorizontal: d.margen, maxWidth: d.anchoMaximo }]} showsVerticalScrollIndicator={false}>
        <View style={estilos.tituloFila}>
          <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Volver">
            <Ionicons name="arrow-back" size={24} color={colores.titulo} />
          </Pressable>
          <Text style={estilos.titulo} accessibilityRole="header">
            Progreso Guardado
          </Text>
        </View>
        <Text style={estilos.subtitulo}>Trabajos sin terminar</Text>

        <Aviso tipo="info" mensaje="Tu avance se guarda solo en el teléfono mientras trabajas, aunque se apague o se cierre la app." />

        <View style={estilos.filtros}>
          {FILTROS_PROGRESO.map((f) => {
            const n = filtrarProgreso(lista ?? [], f.valor).length;
            const activo = filtro === f.valor;
            return (
              <Pressable
                key={f.valor}
                onPress={() => setFiltro(f.valor)}
                accessibilityRole="button"
                accessibilityState={{ selected: activo }}
                style={[estilos.chip, activo && estilos.chipActivo]}
                testID={`filtro-${f.valor}`}
              >
                <Text style={[estilos.chipTexto, activo && { color: colores.blanco }]}>{f.valor === 'todo' ? `${f.texto} (${n})` : f.texto}</Text>
              </Pressable>
            );
          })}
        </View>

        {lista !== null && visibles.length === 0 && (
          <View style={estilos.vacio} testID="progreso-vacio">
            <Ionicons name="checkmark-done-outline" size={34} color={colores.textoTenue} />
            <Text style={estilos.vacioTexto}>No tienes trabajos sin terminar.</Text>
          </View>
        )}

        {visibles.map((p) => (
          <View key={p.id} style={estilos.tarjeta} testID={`progreso-${p.id}`}>
            <Text style={estilos.tipo}>{ETIQUETA_TIPO[p.tipo]}</Text>
            <Text style={estilos.nombre}>{p.titulo}</Text>
            {!!p.subtitulo && <Text style={estilos.sub}>{p.subtitulo}</Text>}
            <View style={estilos.avanceFila}>
              <Text style={estilos.paso} numberOfLines={1}>
                {p.paso}
              </Text>
              <Text style={estilos.porcentaje}>{p.porcentaje} %</Text>
            </View>
            <View style={estilos.barra}>
              <View style={[estilos.barraRelleno, { width: `${p.porcentaje}%` }]} />
            </View>
            <Text style={estilos.guardado}>Guardado automáticamente {textoGuardado(p.guardadoEn)}</Text>
            <View style={estilos.acciones}>
              {p.descartable && (
                <View style={{ flex: 1 }}>
                  <Boton titulo="Descartar" variante="secundario" onPress={() => void descartar(p)} />
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Boton titulo="Continuar" onPress={() => router.push({ pathname: p.ruta, params: p.params } as Href)} />
              </View>
            </View>
          </View>
        ))}

        {visibles.length > 0 && <Text style={estilos.pie}>Al terminar y enviar, el trabajo sale de esta lista.</Text>}
      </ScrollView>
    </SafeAreaView>
  );
}

const estilos = StyleSheet.create({
  area: { flex: 1, backgroundColor: colores.fondo },
  contenido: { padding: 16, paddingBottom: 28, maxWidth: 560, width: '100%', alignSelf: 'center', gap: 12 },
  tituloFila: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  titulo: { fontSize: 24, fontWeight: '700', color: colores.titulo, flexShrink: 1 },
  subtitulo: { fontSize: 14, color: colores.textoSecundario, marginLeft: 34, marginTop: -6 },
  filtros: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: colores.borde, backgroundColor: colores.tarjeta },
  chipActivo: { backgroundColor: colores.primario, borderColor: colores.primario },
  chipTexto: { fontSize: 13.5, fontWeight: '700', color: colores.titulo },
  vacio: { alignItems: 'center', gap: 8, paddingVertical: 36 },
  vacioTexto: { fontSize: 14.5, color: colores.textoSecundario },
  tarjeta: { backgroundColor: colores.tarjeta, borderRadius: radios.tarjeta, borderWidth: 1, borderColor: colores.bordeSuave, padding: 14, gap: 4 },
  tipo: { fontSize: 10.5, fontWeight: '700', letterSpacing: 0.6, color: colores.textoSecundario },
  nombre: { fontSize: 16.5, fontWeight: '800', color: colores.titulo },
  sub: { fontSize: 13, color: colores.textoSecundario },
  avanceFila: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, marginTop: 8 },
  paso: { flex: 1, fontSize: 13, color: colores.texto },
  porcentaje: { fontSize: 13, fontWeight: '800', color: colores.primario },
  barra: { height: 5, borderRadius: 3, backgroundColor: colores.bordeSuave, overflow: 'hidden' },
  barraRelleno: { height: 5, backgroundColor: colores.primario },
  guardado: { fontSize: 12, color: colores.textoTenue, marginTop: 4 },
  acciones: { flexDirection: 'row', gap: 10, marginTop: 8 },
  pie: { fontSize: 12.5, color: colores.textoTenue, textAlign: 'center', marginTop: 4 },
});
