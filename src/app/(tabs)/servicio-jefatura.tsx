import { useState } from 'react';
import { ActivityIndicator, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { nombreDeCodigo, obtenerCatalogo } from '@/api/catalogos';
import { obtenerServicioJefaturaConRespaldo } from '@/api/panelCampo';
import { horaRespaldo } from '@/api/respaldo';
import { Aviso } from '@/componentes/Aviso';
import { CambiarEstadoModal } from '@/componentes/CambiarEstadoModal';
import { EncabezadoApp } from '@/componentes/EncabezadoApp';
import { useConsulta } from '@/hooks/useConsulta';
import { useDiseno } from '@/hooks/useDiseno';
import { useRefrescoAutomatico } from '@/hooks/useRefrescoAutomatico';
import { useSesion } from '@/sesion/SesionContext';
import { colores, radios } from '@/tema/colores';
import { colorEstado, colorTono, enlaceLlamada, inicialesDe, nombreCortoEstado } from '@/utilidades/panelCampo';

/**
 * HU-30 — Seguimiento del servicio (Jefe de Área): el técnico (con botón para llamarlo), el estado, la hora programada, la llegada y el SLA (puntualidad de
 * llegada, estimación), y los hitos que marca la app del técnico: asignado y autorizado, en ruta, demoras, llegada por GPS, trabajo en el equipo e informe.
 * "Ver ruta" abre Ubicación y ruta; "Cambiar estado" corrige a mano el estado cuando la app del técnico no pudo registrarlo (solo avanzar, con motivo y comentario).
 */
export default function PantallaServicioJefatura() {
  const { sesion } = useSesion();
  const usuario = sesion?.usuario;
  const d = useDiseno();
  const params = useLocalSearchParams<{ id?: string }>();
  const idOs = Number(params.id);
  const valido = Number.isInteger(idOs) && idOs > 0;
  const [modal, setModal] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: 'error' | 'info'; texto: string } | null>(null);

  const { datos, cargando, recargando, error, recargar } = useConsulta(async (token) => {
    if (!valido) throw new Error('El servicio indicado no es válido.');
    const [r, cargos] = await Promise.all([
      obtenerServicioJefaturaConRespaldo(token, usuario?.idUsuario ?? 0, idOs),
      obtenerCatalogo(token, 'CARGO_USUARIO').catch(() => undefined),
    ]);
    return { servicio: r.datos, sinConexion: r.sinConexion, guardadoEn: r.guardadoEn, cargos };
  }, params.id ?? '');
  useRefrescoAutomatico(recargar, 30);

  const cargo = nombreDeCodigo(datos?.cargos, usuario?.cargo) ?? usuario?.cargo ?? 'Jefe de Área';
  const s = datos?.servicio ?? null;
  const c = s?.cabecera;

  async function abrir(url: string | null, vacio: string) {
    setMensaje(null);
    if (!url) return setMensaje({ tipo: 'info', texto: vacio });
    try {
      await Linking.openURL(url);
    } catch {
      setMensaje({ tipo: 'error', texto: 'No se pudo abrir la aplicación del teléfono.' });
    }
  }

  function cambiarEstado() {
    setMensaje(null);
    if (!s || !c) return;
    if (c.estadoOs === 'finalizada') return setMensaje({ tipo: 'info', texto: 'El servicio ya finalizó: no se puede cambiar su estado.' });
    if (!c.puedeCambiarEstado) return setMensaje({ tipo: 'info', texto: 'No tienes los permisos del seguimiento operativo para cambiar el estado de un servicio.' });
    if (s.estadosPermitidos.length === 0) return setMensaje({ tipo: 'info', texto: 'No hay un estado al que avanzar: el servicio ya está en el último.' });
    setModal(true);
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
            {c?.numero ?? 'Servicio'}
          </Text>
        </View>
        {!!c && <Text style={estilos.subtitulo}>{[c.cliente, c.lugar].filter(Boolean).join(' · ')}</Text>}

        {datos?.sinConexion && (
          <View style={{ marginBottom: 10 }}>
            <Aviso mensaje={`Sin conexión: se muestra lo último guardado (${horaRespaldo(datos.guardadoEn)}). Cambiar el estado exige conexión.`} />
          </View>
        )}

        {cargando ? (
          <ActivityIndicator color={colores.primario} style={{ marginTop: 40 }} />
        ) : error || !s || !c ? (
          <Aviso tipo="error" mensaje={error ?? 'No se encontró el servicio.'} />
        ) : (
          <>
            <View style={estilos.tecnico} testID="tarjeta-tecnico">
              <View style={estilos.avatar}>
                <Text style={estilos.avatarTexto}>{inicialesDe(c.tecnico)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={estilos.tecnicoNombre}>{c.tecnico ?? 'Sin técnico asignado'}</Text>
                <Text style={estilos.tecnicoLinea}>{[c.cargoTecnico, c.telefonoTecnico].filter(Boolean).join(' · ')}</Text>
              </View>
              <Pressable
                onPress={() => void abrir(enlaceLlamada(c.telefonoTecnico), 'El técnico no tiene un teléfono registrado en su ficha.')}
                style={estilos.llamar}
                accessibilityRole="button"
                accessibilityLabel="Llamar al técnico"
                testID="llamar-tecnico"
              >
                <Ionicons name="call" size={24} color={colores.primario} />
              </Pressable>
            </View>

            <View style={estilos.chips}>
              <Chip valor={nombreCortoEstado(c.estado)} texto="Estado" color={colorEstado(c.estado)} />
              <Chip valor={c.horaProgramada ?? '—'} texto="Programado" />
              <Chip valor={c.llegada ?? '—'} texto="Llegada" color={c.llegada ? colores.verde : undefined} />
              <Chip valor={c.slaPct === null ? '—' : `${c.slaPct} %`} texto="SLA" color={c.slaPct === null ? undefined : c.slaPct >= 90 ? colores.verde : colores.naranja} />
            </View>

            <Text style={estilos.seccion}>HITOS DEL SERVICIO</Text>
            <View style={estilos.hitos} testID="hitos-servicio">
              {s.hitos.map((h, i) => {
                const pendiente = h.estado === 'pendiente';
                return (
                  <View key={`${h.codigo}-${i}`} style={estilos.hito}>
                    <View style={estilos.hitoRiel}>
                      <View style={[estilos.hitoPunto, { backgroundColor: colorTono(h.tono) }]} />
                      {i < s.hitos.length - 1 && <View style={estilos.hitoLinea} />}
                    </View>
                    <View style={{ flex: 1, paddingBottom: i < s.hitos.length - 1 ? 18 : 0 }}>
                      <Text style={[estilos.hitoTitulo, pendiente && { color: colores.textoTenue }]}>{h.titulo}</Text>
                      <Text style={[estilos.hitoDetalle, pendiente && { color: colores.textoTenue }]}>{[h.hora, h.detalle].filter(Boolean).join(' · ')}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
            <Text style={estilos.nota}>SLA = puntualidad de llegada (estimación). El avance y los hitos salen de lo que registra la app del técnico.</Text>

            {!!mensaje && (
              <View style={{ marginTop: 12 }} testID="mensaje-servicio">
                <Aviso tipo={mensaje.tipo} mensaje={mensaje.texto} />
              </View>
            )}

            <View style={estilos.botones}>
              <Pressable
                onPress={() => router.push({ pathname: '/ruta-servicio', params: { id: String(idOs) } })}
                style={[estilos.boton, estilos.botonBorde]}
                accessibilityRole="button"
                testID="ver-ruta"
              >
                <Ionicons name="navigate-outline" size={20} color={colores.primario} />
                <Text style={[estilos.botonTexto, { color: colores.primario }]}>Ver ruta</Text>
              </Pressable>
              <Pressable onPress={cambiarEstado} style={[estilos.boton, estilos.botonPrimario]} accessibilityRole="button" testID="cambiar-estado">
                <Ionicons name="swap-horizontal" size={20} color={colores.blanco} />
                <Text style={estilos.botonTexto}>Cambiar estado</Text>
              </Pressable>
            </View>
          </>
        )}
      </ScrollView>

      {s && c && (
        <CambiarEstadoModal
          visible={modal}
          token={sesion?.token ?? ''}
          idOs={idOs}
          estadoActual={c.estadoOs}
          estados={s.estadosPermitidos}
          motivos={s.motivos}
          onCerrar={() => setModal(false)}
          onGuardado={(m) => {
            setModal(false);
            setMensaje({ tipo: 'info', texto: m });
            void recargar();
          }}
        />
      )}
    </SafeAreaView>
  );
}

function Chip({ valor, texto, color }: { valor: string; texto: string; color?: string }) {
  return (
    <View style={estilos.chip}>
      <Text style={[estilos.chipValor, color ? { color } : null]}>{valor}</Text>
      <Text style={estilos.chipTexto}>{texto}</Text>
    </View>
  );
}

const estilos = StyleSheet.create({
  area: { flex: 1, backgroundColor: colores.fondo },
  contenido: { paddingTop: 18, paddingBottom: 28, width: '100%', alignSelf: 'center' },
  tituloFila: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 2 },
  titulo: { fontWeight: '800', color: colores.titulo, flexShrink: 1 },
  subtitulo: { color: colores.textoSecundario, fontSize: 15, marginBottom: 12 },
  tecnico: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colores.blanco, borderWidth: 1, borderColor: colores.bordeSuave, borderRadius: radios.tarjeta, padding: 14 },
  avatar: { width: 54, height: 54, borderRadius: 27, backgroundColor: colores.primario, alignItems: 'center', justifyContent: 'center' },
  avatarTexto: { color: colores.blanco, fontSize: 18, fontWeight: '800' },
  tecnicoNombre: { fontSize: 19, fontWeight: '800', color: colores.titulo },
  tecnicoLinea: { fontSize: 14.5, color: colores.textoSecundario, marginTop: 2 },
  llamar: { width: 54, height: 54, borderRadius: 14, borderWidth: 1.5, borderColor: colores.primario, alignItems: 'center', justifyContent: 'center' },
  chips: { flexDirection: 'row', gap: 8, marginTop: 12 },
  chip: { flex: 1, backgroundColor: colores.blanco, borderWidth: 1, borderColor: colores.bordeSuave, borderRadius: 14, paddingVertical: 10, alignItems: 'center' },
  chipValor: { fontSize: 18, fontWeight: '800', color: colores.titulo },
  chipTexto: { fontSize: 12.5, color: colores.textoSecundario, marginTop: 1 },
  seccion: { fontSize: 14, fontWeight: '800', letterSpacing: 1.2, color: colores.textoSecundario, marginTop: 20, marginBottom: 10 },
  hitos: { backgroundColor: colores.blanco, borderWidth: 1, borderColor: colores.bordeSuave, borderRadius: radios.tarjeta, padding: 16 },
  hito: { flexDirection: 'row', gap: 14 },
  hitoRiel: { alignItems: 'center', width: 16 },
  hitoPunto: { width: 16, height: 16, borderRadius: 8, marginTop: 3 },
  hitoLinea: { flex: 1, width: 2, backgroundColor: colores.bordeSuave, marginTop: 4 },
  hitoTitulo: { fontSize: 17.5, fontWeight: '800', color: colores.titulo },
  hitoDetalle: { fontSize: 15, color: colores.textoSecundario, marginTop: 2, lineHeight: 21 },
  nota: { fontSize: 12.5, color: colores.textoTenue, marginTop: 8, lineHeight: 18 },
  botones: { flexDirection: 'row', gap: 10, marginTop: 16 },
  boton: { flex: 1, minHeight: 54, borderRadius: radios.boton, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' },
  botonBorde: { borderWidth: 1.5, borderColor: colores.primario, backgroundColor: colores.blanco },
  botonPrimario: { backgroundColor: colores.primario },
  botonTexto: { color: colores.blanco, fontSize: 17, fontWeight: '700' },
});
