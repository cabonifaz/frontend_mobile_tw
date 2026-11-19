import { useState } from 'react';
import { ActivityIndicator, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { nombreDeCodigo, obtenerCatalogo } from '@/api/catalogos';
import { ErrorApi } from '@/api/cliente';
import { obtenerFichaTecnico } from '@/api/equipoJefatura';
import { Aviso } from '@/componentes/Aviso';
import { Boton } from '@/componentes/Boton';
import { EncabezadoApp } from '@/componentes/EncabezadoApp';
import { useConsulta } from '@/hooks/useConsulta';
import { useDiseno } from '@/hooks/useDiseno';
import { useRefrescoAutomatico } from '@/hooks/useRefrescoAutomatico';
import { useSesion } from '@/sesion/SesionContext';
import { colores, radios } from '@/tema/colores';
import { colorCarga, etiquetaEquipo, etiquetaSsoma, textoNivelCarga, tonoMarcacion } from '@/utilidades/equipoJefatura';
import { enlaceLlamada } from '@/utilidades/panelCampo';

/**
 * HU-36 — Ficha del técnico (Jefe de Área): su estado según el Reloj Marcador, SSOMA, las marcaciones de hoy, la carga de la semana (horas programadas por día) y el botón
 * «Ver las horas contabilizadas» (calendario con las horas realmente trabajadas, acumulado semanal y mensual e historial por mes). «Llamar» marca su teléfono.
 * Se abre desde Mi equipo (?id=).
 */
export default function PantallaEquipoTecnico() {
  const { sesion } = useSesion();
  const usuario = sesion?.usuario;
  const d = useDiseno();
  const params = useLocalSearchParams<{ id?: string }>();
  const id = Number(params.id);
  const valido = Number.isInteger(id) && id > 0;
  const [mensaje, setMensaje] = useState<string | null>(null);

  const { datos, cargando, recargando, error, recargar } = useConsulta(async (token) => {
    if (!valido) throw new ErrorApi('El técnico indicado no es válido.', 400, 1);
    const [ficha, cargos] = await Promise.all([obtenerFichaTecnico(token, id), obtenerCatalogo(token, 'CARGO_USUARIO').catch(() => undefined)]);
    return { ficha, cargos };
  }, params.id ?? '');
  useRefrescoAutomatico(recargar, 30);

  const cargo = nombreDeCodigo(datos?.cargos, usuario?.cargo) ?? usuario?.cargo ?? 'Jefe de Área';
  const f = datos?.ficha ?? null;
  const t = f?.tecnico ?? null;
  const et = t ? etiquetaEquipo(t.estado) : null;
  const ssoma = etiquetaSsoma(f?.ssoma.estado);
  const nivel = f ? textoNivelCarga(f.carga.nivel) : null;
  const tel = enlaceLlamada(f?.telefono);

  async function llamar() {
    setMensaje(null);
    if (!tel) return setMensaje('El técnico no tiene un teléfono registrado en su ficha.');
    try {
      await Linking.openURL(tel);
    } catch {
      setMensaje('No se pudo abrir la aplicación del teléfono.');
    }
  }

  return (
    <SafeAreaView style={estilos.area} edges={['top']}>
      <EncabezadoApp nombre={usuario?.nombre ?? ''} apellido={usuario?.apellido} subtitulo={`${usuario?.nombre ?? ''} · ${cargo}`} />
      <ScrollView
        contentContainerStyle={[estilos.contenido, { paddingHorizontal: d.margen, maxWidth: d.anchoMaximo }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={recargando} onRefresh={() => void recargar()} colors={[colores.primario]} />}
      >
        <View style={estilos.tituloFila}>
          <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Volver">
            <Ionicons name="arrow-back" size={24} color={colores.titulo} />
          </Pressable>
          <Text style={[estilos.titulo, { fontSize: d.tituloPantalla }]} accessibilityRole="header">
            Ficha del técnico
          </Text>
        </View>
        <Text style={estilos.subtitulo}>Mi equipo</Text>

        {cargando ? (
          <ActivityIndicator color={colores.primario} style={{ marginTop: 40 }} />
        ) : error || !f || !t || !et ? (
          <Aviso tipo="error" mensaje={error ?? 'No se pudo cargar la ficha del técnico.'} />
        ) : (
          <>
            <View style={estilos.tarjeta} testID="equipo-ficha">
              <View style={[estilos.avatar, { backgroundColor: et.avatar }]}>
                <Text style={estilos.avatarTexto}>{t.iniciales}</Text>
              </View>
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={estilos.nombre}>{t.nombre}</Text>
                <Text style={estilos.meta}>{[t.cargo, f.area].filter(Boolean).join(' · ')}</Text>
                <View style={estilos.chips}>
                  <View style={[estilos.badge, { backgroundColor: et.fondo }]}>
                    <Text style={[estilos.badgeTexto, { color: et.color }]}>{et.texto}</Text>
                  </View>
                  {!!ssoma && (
                    <View style={[estilos.badge, { backgroundColor: ssoma.fondo }]}>
                      <Text style={[estilos.badgeTexto, { color: ssoma.color }]}>{ssoma.texto}</Text>
                    </View>
                  )}
                </View>
              </View>
              <Pressable onPress={() => void llamar()} style={estilos.llamar} accessibilityRole="button" accessibilityLabel={`Llamar a ${t.nombre}`} testID="equipo-llamar">
                <Ionicons name="call" size={20} color={colores.primario} />
              </Pressable>
            </View>
            {!!mensaje && (
              <View style={{ marginTop: 10 }}>
                <Aviso tipo="info" mensaje={mensaje} />
              </View>
            )}
            {!!f.ssoma.detalle && f.ssoma.estado !== 'conforme' && (
              <View style={{ marginTop: 10 }}>
                <Aviso tipo="info" mensaje={`SSOMA: ${f.ssoma.detalle}`} />
              </View>
            )}

            {/* Servicio actual */}
            <View style={[estilos.bloque, { marginTop: 10 }]}>
              <Ionicons name="location-outline" size={18} color={colores.primario} />
              <Text style={estilos.bloqueTexto}>
                {t.numeroOs
                  ? `${t.numeroOs}${t.lugar ? ` · ${t.lugar}` : ''}`
                  : `Sin servicio${t.motivoSinServicio ? ` · ${t.motivoSinServicio}` : ''}`}
              </Text>
            </View>

            {/* Marcaciones de hoy */}
            <Text style={estilos.seccion}>MARCACIONES DE HOY</Text>
            <View style={estilos.lista} testID="equipo-marcaciones">
              {f.marcaciones.length === 0 ? (
                <Text style={estilos.vacio}>Aún no hay marcaciones hoy.</Text>
              ) : (
                f.marcaciones.map((m, i) => {
                  const pendiente = m.estado !== 'hecho';
                  return (
                    <View key={`${m.tipo}-${i}`} style={estilos.marcacion}>
                      <View style={estilos.linea}>
                        <View style={[estilos.punto, { backgroundColor: tonoMarcacion(m.tono) }]} />
                        {i < f.marcaciones.length - 1 && <View style={estilos.conector} />}
                      </View>
                      <View style={{ flex: 1, paddingBottom: 14 }}>
                        <Text style={[estilos.marcacionTitulo, pendiente && { color: colores.textoSecundario }]}>
                          {m.hora ? `${m.hora} · ` : ''}
                          {m.titulo}
                        </Text>
                        <Text style={estilos.marcacionDetalle}>{pendiente && !m.detalle ? 'Pendiente' : m.detalle}</Text>
                      </View>
                    </View>
                  );
                })
              )}
            </View>

            {/* Carga de la semana */}
            <Text style={estilos.seccion}>CARGA DE LA SEMANA</Text>
            <View style={estilos.lista} testID="equipo-carga">
              {f.carga.dias.map((dia) => (
                <View key={dia.fecha} style={estilos.diaFila}>
                  <Text style={estilos.diaEtiqueta}>{dia.etiqueta}</Text>
                  <View style={estilos.barra}>
                    <View style={[estilos.barraRelleno, { width: `${Math.min(100, Math.max(0, dia.porcentaje))}%`, backgroundColor: colorCarga(dia.porcentaje) }]} />
                  </View>
                  <Text style={estilos.diaHoras}>{Number.isInteger(dia.horas) ? dia.horas : dia.horas.toFixed(1)} h</Text>
                </View>
              ))}
              <Text style={estilos.utilizacion}>
                Utilización {f.carga.utilizacionPct} % ·{' '}
                <Text style={{ color: nivel?.color, fontWeight: '800' }}>{nivel?.texto}</Text>
              </Text>
            </View>

            <View style={{ marginTop: 14 }}>
              <Boton titulo="Ver las horas contabilizadas" onPress={() => router.push({ pathname: '/equipo-horas', params: { id: String(t.idUsuario) } })} />
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const estilos = StyleSheet.create({
  area: { flex: 1, backgroundColor: colores.fondo },
  contenido: { paddingTop: 18, paddingBottom: 28, width: '100%', alignSelf: 'center' },
  tituloFila: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 2 },
  titulo: { fontWeight: '800', color: colores.titulo, flexShrink: 1 },
  subtitulo: { color: colores.textoSecundario, fontSize: 14.5, marginBottom: 14 },
  tarjeta: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colores.blanco, borderWidth: 1, borderColor: colores.bordeSuave, borderRadius: radios.tarjeta, padding: 14 },
  avatar: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  avatarTexto: { color: colores.blanco, fontWeight: '800', fontSize: 18 },
  nombre: { fontSize: 17, fontWeight: '800', color: colores.titulo },
  meta: { fontSize: 13, color: colores.textoSecundario },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 },
  badge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  badgeTexto: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.3 },
  llamar: { width: 44, height: 44, borderRadius: 12, borderWidth: 1.5, borderColor: colores.primario, alignItems: 'center', justifyContent: 'center' },
  bloque: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: colores.primarioSuave, borderWidth: 1, borderColor: '#BFD7F5', borderRadius: radios.tarjeta, padding: 12 },
  bloqueTexto: { flex: 1, fontSize: 14.5, color: colores.titulo, fontWeight: '600', lineHeight: 20 },
  seccion: { fontSize: 13, fontWeight: '800', letterSpacing: 1.2, color: colores.textoSecundario, marginTop: 20, marginBottom: 10 },
  lista: { backgroundColor: colores.blanco, borderWidth: 1, borderColor: colores.bordeSuave, borderRadius: radios.tarjeta, padding: 14 },
  vacio: { color: colores.textoSecundario, fontSize: 14.5, textAlign: 'center' },
  marcacion: { flexDirection: 'row', gap: 12 },
  linea: { alignItems: 'center', width: 12 },
  punto: { width: 11, height: 11, borderRadius: 6, marginTop: 4 },
  conector: { flex: 1, width: 2, backgroundColor: '#E2E8F0', marginTop: 2 },
  marcacionTitulo: { fontSize: 15, fontWeight: '700', color: colores.titulo },
  marcacionDetalle: { fontSize: 13, color: colores.textoSecundario, marginTop: 1 },
  diaFila: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 5 },
  diaEtiqueta: { width: 34, fontSize: 13.5, color: colores.titulo, fontWeight: '600' },
  barra: { flex: 1, height: 8, borderRadius: 4, backgroundColor: '#E2E8F0', overflow: 'hidden' },
  barraRelleno: { height: 8, borderRadius: 4 },
  diaHoras: { width: 46, textAlign: 'right', fontSize: 13.5, color: colores.titulo, fontWeight: '700' },
  utilizacion: { fontSize: 13.5, color: colores.textoSecundario, marginTop: 8 },
});
