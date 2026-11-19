import { useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { nombreDeCodigo, obtenerCatalogo } from '@/api/catalogos';
import { obtenerInformesRevision, type GrupoInformes } from '@/api/informesRevision';
import { Aviso } from '@/componentes/Aviso';
import { EncabezadoApp } from '@/componentes/EncabezadoApp';
import { useConsulta } from '@/hooks/useConsulta';
import { useDiseno } from '@/hooks/useDiseno';
import { useRefrescoAutomatico } from '@/hooks/useRefrescoAutomatico';
import { useSesion } from '@/sesion/SesionContext';
import { colores, radios } from '@/tema/colores';
import { MAX_BUSQUEDA, PESTANAS, etiquetaInforme, resumenInforme, textoEspera } from '@/utilidades/informesRevision';

/**
 * HU-33 — Informes por revisar (Jefe de Área): los informes técnicos que generan los técnicos, con los indicadores de la bandeja de Revisión Técnica de la intranet
 * (pendientes, observados, sin evidencias, SLA vencido) y tres pestañas: Por revisar · En corrección · Aprobados. Toca un informe para revisarlo.
 * Quién ve qué lo decide el back: las áreas que ven todo y los Administradores, todos los informes; el Supervisor de Servicio Técnico / Metrología, los de su área.
 */
export default function PantallaInformesRevision() {
  const { sesion } = useSesion();
  const usuario = sesion?.usuario;
  const d = useDiseno();
  const [grupo, setGrupo] = useState<GrupoInformes>('por_revisar');
  const [texto, setTexto] = useState('');
  const [busqueda, setBusqueda] = useState('');

  const { datos, cargando, recargando, error, recargar } = useConsulta(async (token) => {
    const [r, cargos] = await Promise.all([obtenerInformesRevision(token, grupo, busqueda), obtenerCatalogo(token, 'CARGO_USUARIO').catch(() => undefined)]);
    return { ...r, cargos };
  }, `${grupo}|${busqueda}`);
  useRefrescoAutomatico(recargar, datos?.kpis.refrescoSegundos ?? 30);

  const cargo = nombreDeCodigo(datos?.cargos, usuario?.cargo) ?? usuario?.cargo ?? 'Jefe de Área';
  const k = datos?.kpis;

  return (
    <SafeAreaView style={estilos.area} edges={['top']}>
      <EncabezadoApp nombre={usuario?.nombre ?? ''} apellido={usuario?.apellido} subtitulo={`${usuario?.nombre ?? ''} · ${cargo}`} />
      <ScrollView
        contentContainerStyle={[estilos.contenido, { paddingHorizontal: d.margen, maxWidth: d.anchoMaximo }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={recargando} onRefresh={() => void recargar()} colors={[colores.primario]} />}
      >
        <View style={estilos.tituloFila}>
          <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Volver">
            <Ionicons name="arrow-back" size={24} color={colores.titulo} />
          </Pressable>
          <Text style={[estilos.titulo, { fontSize: d.tituloPantalla }]} accessibilityRole="header">
            Informes por revisar
          </Text>
        </View>
        <Text style={estilos.subtitulo}>Revisión técnica del área{k?.actualizado ? ` · actualizado ${k.actualizado}` : ''}</Text>

        <View style={estilos.kpis} testID="informes-kpis">
          <Kpi valor={k?.pendientes} texto="Pendientes" color={colores.naranja} />
          <Kpi valor={k?.observados} texto="Observados" color={colores.rojo} />
          <Kpi valor={k?.sinEvidencias} texto="Sin evid." color={colores.titulo} />
          <Kpi valor={k?.slaVencido} texto="SLA venc." color={colores.rojo} />
        </View>

        <View style={estilos.pestanas}>
          {PESTANAS.map((p) => {
            const activa = p.id === grupo;
            return (
              <Pressable
                key={p.id}
                onPress={() => setGrupo(p.id)}
                style={[estilos.pestana, activa && estilos.pestanaActiva]}
                accessibilityRole="button"
                accessibilityState={{ selected: activa }}
                testID={`informes-pestana-${p.id}`}
              >
                <Text style={[estilos.pestanaTexto, activa && { color: colores.blanco }]}>{p.texto}</Text>
              </Pressable>
            );
          })}
        </View>

        <View style={estilos.buscador}>
          <Ionicons name="search-outline" size={18} color={colores.textoSecundario} />
          <TextInput
            value={texto}
            onChangeText={(t) => {
              setTexto(t);
              if (t.trim() === '' && busqueda !== '') setBusqueda('');
            }}
            onSubmitEditing={() => setBusqueda(texto.trim())}
            returnKeyType="search"
            placeholder="Buscar por informe, OS, cliente, técnico o equipo"
            placeholderTextColor={colores.placeholder}
            maxLength={MAX_BUSQUEDA}
            style={estilos.buscadorTexto}
            testID="informes-buscar"
          />
        </View>

        {cargando ? (
          <ActivityIndicator color={colores.primario} style={{ marginTop: 36 }} />
        ) : error ? (
          <View style={{ marginTop: 14 }}>
            <Aviso tipo="error" mensaje={error} />
          </View>
        ) : datos && datos.informes.length === 0 ? (
          <Text style={estilos.vacio} testID="informes-vacio">
            {busqueda ? 'Ningún informe coincide con la búsqueda.' : grupo === 'por_revisar' ? 'No hay informes por revisar.' : grupo === 'en_correccion' ? 'No hay informes en corrección.' : 'Aún no hay informes aprobados.'}
          </Text>
        ) : (
          <View style={estilos.lista}>
            {datos?.informes.map((i) => {
              const et = etiquetaInforme(i);
              return (
                <Pressable
                  key={i.idInforme}
                  onPress={() => router.push({ pathname: '/informe-revision', params: { id: String(i.idInforme) } })}
                  style={estilos.tarjeta}
                  accessibilityRole="button"
                  accessibilityLabel={`Informe ${i.numeroInforme}`}
                  testID={`informe-${i.idInforme}`}
                >
                  <View style={estilos.tarjetaCabecera}>
                    <Text style={estilos.tarjetaTitulo} numberOfLines={2}>
                      {i.numeroInforme}
                      {i.cliente ? ` · ${i.cliente}` : ''}
                    </Text>
                    <View style={[estilos.badge, { backgroundColor: et.fondo }]}>
                      <Text style={[estilos.badgeTexto, { color: et.color }]}>{et.texto}</Text>
                    </View>
                  </View>
                  <View style={estilos.linea}>
                    <Ionicons name="person-outline" size={14} color={colores.textoSecundario} />
                    <Text style={estilos.lineaTexto} numberOfLines={1}>
                      {[i.tecnico, i.codigoTw ?? i.equipo].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                  <View style={estilos.linea}>
                    <Ionicons name={i.forzadas > 0 ? 'camera' : 'camera-outline'} size={14} color={i.forzadas > 0 ? colores.naranja : colores.textoSecundario} />
                    <Text style={[estilos.lineaTexto, i.forzadas > 0 && { color: colores.naranja }]} numberOfLines={2}>
                      {i.resumen ?? resumenInforme(i)}
                    </Text>
                  </View>
                  {i.estado === 'por_revisar' && <Text style={estilos.espera}>Generado {textoEspera(i.horasEspera)}</Text>}
                </Pressable>
              );
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Kpi({ valor, texto, color }: { valor: number | undefined; texto: string; color: string }) {
  return (
    <View style={estilos.kpi}>
      <Text style={[estilos.kpiValor, { color: valor ? color : colores.titulo }]}>{valor ?? '—'}</Text>
      <Text style={estilos.kpiTexto} numberOfLines={1}>
        {texto}
      </Text>
    </View>
  );
}

const estilos = StyleSheet.create({
  area: { flex: 1, backgroundColor: colores.fondo },
  contenido: { paddingTop: 18, paddingBottom: 28, width: '100%', alignSelf: 'center' },
  tituloFila: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 2 },
  titulo: { fontWeight: '800', color: colores.titulo, flexShrink: 1 },
  subtitulo: { color: colores.textoSecundario, fontSize: 14.5, marginBottom: 14 },
  kpis: { flexDirection: 'row', gap: 8 },
  kpi: { flex: 1, backgroundColor: colores.blanco, borderWidth: 1, borderColor: colores.bordeSuave, borderRadius: 14, paddingVertical: 11, alignItems: 'center' },
  kpiValor: { fontSize: 24, fontWeight: '800' },
  kpiTexto: { fontSize: 11.5, color: colores.textoSecundario, marginTop: 1 },
  pestanas: { flexDirection: 'row', gap: 8, marginTop: 14, flexWrap: 'wrap' },
  pestana: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: colores.borde, backgroundColor: colores.blanco },
  pestanaActiva: { backgroundColor: colores.primario, borderColor: colores.primario },
  pestanaTexto: { fontSize: 14, fontWeight: '700', color: colores.titulo },
  buscador: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colores.blanco,
    borderWidth: 1,
    borderColor: colores.borde,
    borderRadius: radios.campo,
    paddingHorizontal: 12,
    marginTop: 12,
  },
  buscadorTexto: { flex: 1, paddingVertical: 10, fontSize: 14.5, color: colores.texto },
  vacio: { textAlign: 'center', color: colores.textoSecundario, fontSize: 15, marginTop: 36 },
  lista: { gap: 10, marginTop: 14 },
  tarjeta: { backgroundColor: colores.blanco, borderWidth: 1, borderColor: colores.bordeSuave, borderRadius: radios.tarjeta, padding: 14, gap: 6 },
  tarjetaCabecera: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  tarjetaTitulo: { flex: 1, fontSize: 16, fontWeight: '800', color: colores.titulo },
  badge: { borderRadius: 8, paddingHorizontal: 9, paddingVertical: 4 },
  badgeTexto: { fontSize: 11, fontWeight: '800', letterSpacing: 0.3 },
  linea: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  lineaTexto: { flex: 1, fontSize: 13.5, color: colores.textoSecundario },
  espera: { fontSize: 12.5, color: colores.textoTenue },
});
