import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { obtenerTecnicosReasignacion, reasignarTecnico } from '@/api/alertasCampo';
import { ErrorApi } from '@/api/cliente';
import { Aviso } from '@/componentes/Aviso';
import { Boton } from '@/componentes/Boton';
import { EncabezadoApp } from '@/componentes/EncabezadoApp';
import { useConsulta } from '@/hooks/useConsulta';
import { useDiseno } from '@/hooks/useDiseno';
import { useSesion } from '@/sesion/SesionContext';
import { colores, radios } from '@/tema/colores';
import { textoSsoma } from '@/utilidades/alertasCampo';
import { avisar, confirmar } from '@/utilidades/dialogos';
import { textoMinutos } from '@/utilidades/panelCampo';

/**
 * HU-32 — Reasignar técnico en ruta (Jefe de Área): técnicos CERCANOS a la planta, de la MISMA especialidad, con SSOMA conforme y con cupo en el día.
 * Cada tarjeta muestra la distancia (línea recta desde su última posición GPS), cuándo llega (referencial), su carga del día y su estado SSOMA.
 * Los no habilitados se ven atenuados con el motivo. «Reasignar a …» cambia el técnico del servicio y avisa al anterior y al nuevo.
 */
export default function PantallaAlertaReasignar() {
  const { sesion } = useSesion();
  const usuario = sesion?.usuario;
  const token = sesion?.token ?? '';
  const d = useDiseno();
  const params = useLocalSearchParams<{ id?: string }>();
  const idOs = Number(params.id);
  const [elegido, setElegido] = useState<number | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { datos, cargando, error: errorCarga } = useConsulta(async (t) => {
    if (!Number.isInteger(idOs) || idOs <= 0) throw new ErrorApi('Servicio no válido.', 400, 1);
    return obtenerTecnicosReasignacion(t, idOs);
  }, params.id ?? '');

  const tecnicos = datos?.tecnicos ?? [];
  // El primero habilitado queda preseleccionado (el más cercano)
  const sugerido = tecnicos.find((t) => t.disponible)?.idUsuario ?? null;
  const idElegido = elegido ?? sugerido;
  const tecnico = tecnicos.find((t) => t.idUsuario === idElegido) ?? null;

  async function reasignar() {
    if (!tecnico) return;
    if (!(await confirmar('¿Reasignar el servicio?', `${datos?.numeroOs ?? 'El servicio'} pasará de ${datos?.tecnicoActual ?? 'su técnico'} a ${tecnico.nombre}. Se avisa a ambos técnicos.`, 'Reasignar'))) return;
    setError(null);
    setEnviando(true);
    try {
      const m = await reasignarTecnico(token, idOs, tecnico.idUsuario);
      avisar('Servicio reasignado', m);
      router.dismiss(2);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo reasignar el servicio.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <SafeAreaView style={estilos.area} edges={['top']}>
      <EncabezadoApp nombre={usuario?.nombre ?? ''} apellido={usuario?.apellido} subtitulo={`${usuario?.nombre ?? ''} · ${usuario?.cargo ?? 'Jefe de Área'}`} />
      <ScrollView contentContainerStyle={[estilos.contenido, { paddingHorizontal: d.margen, maxWidth: d.anchoMaximo }]} showsVerticalScrollIndicator={false}>
        <View style={estilos.tituloFila}>
          <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Volver">
            <Ionicons name="arrow-back" size={24} color={colores.titulo} />
          </Pressable>
          <Text style={estilos.titulo} accessibilityRole="header">
            Reasignar técnico
          </Text>
        </View>
        {!!datos && (
          <Text style={estilos.subtitulo}>
            {datos.numeroOs}
            {datos.cliente ? ` · ${datos.cliente}` : ''}
            {datos.tecnicoActual ? ` · hoy: ${datos.tecnicoActual}` : ''}
          </Text>
        )}

        {cargando ? (
          <ActivityIndicator color={colores.primario} style={{ marginTop: 32 }} />
        ) : errorCarga || !datos ? (
          <Aviso tipo="error" mensaje={errorCarga ?? 'No se pudieron cargar los técnicos.'} />
        ) : (
          <>
            <Text style={estilos.seccion}>TÉCNICOS CERCANOS · MISMA ESPECIALIDAD</Text>
            {tecnicos.length === 0 && <Aviso tipo="info" mensaje="No hay otros técnicos de la misma especialidad para este servicio." />}
            {tecnicos.map((t) => {
              const activo = t.idUsuario === idElegido;
              return (
                <Pressable
                  key={t.idUsuario}
                  onPress={() => t.disponible && setElegido(t.idUsuario)}
                  disabled={!t.disponible}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: activo, disabled: !t.disponible }}
                  style={[estilos.tarjeta, activo && estilos.tarjetaActiva, !t.disponible && { opacity: 0.55 }]}
                  testID={`tecnico-${t.idUsuario}`}
                >
                  <View style={[estilos.avatar, { backgroundColor: t.disponible ? colores.verde : colores.textoTenue }]}>
                    <Text style={estilos.avatarTexto}>{t.iniciales}</Text>
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <View style={estilos.cabecera}>
                      <Text style={estilos.nombre}>{t.nombre}</Text>
                      <View style={[estilos.etiqueta, { backgroundColor: t.disponible ? colores.verdeEtiquetaFondo : colores.grisFondo }]}>
                        <Text style={[estilos.etiquetaTexto, { color: t.disponible ? colores.verdeEtiquetaTexto : colores.grisTexto }]}>{t.disponible ? 'DISPONIBLE' : 'NO HABILITADO'}</Text>
                      </View>
                    </View>
                    <Text style={estilos.linea}>
                      {t.distanciaKm !== null ? `${t.distanciaKm} km` : 'Sin ubicación'}
                      {t.llegaMin !== null ? ` · llega en ${textoMinutos(t.llegaMin)}` : ''}
                    </Text>
                    <Text style={estilos.linea}>
                      Carga {t.cargaPct} % · {t.motivoNo ?? textoSsoma(t.ssoma)}
                    </Text>
                  </View>
                </Pressable>
              );
            })}

            {!!error && <Aviso tipo="error" mensaje={error} />}
            <Boton titulo={tecnico ? `Reasignar a ${tecnico.nombre}` : 'Reasignar'} onPress={() => void reasignar()} cargando={enviando} deshabilitado={!tecnico || enviando} />
            <Text style={estilos.nota}>Se notifica al técnico anterior y al nuevo. El nuevo técnico registra su propia salida y llegada.</Text>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const estilos = StyleSheet.create({
  area: { flex: 1, backgroundColor: colores.fondo },
  contenido: { padding: 16, paddingBottom: 28, maxWidth: 560, width: '100%', alignSelf: 'center', gap: 12 },
  tituloFila: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  titulo: { fontSize: 24, fontWeight: '700', color: colores.titulo, flexShrink: 1 },
  subtitulo: { fontSize: 13.5, color: colores.textoSecundario, marginLeft: 34, marginTop: -6 },
  seccion: { fontSize: 11.5, fontWeight: '800', letterSpacing: 1, color: colores.textoSecundario, marginTop: 4 },
  tarjeta: { flexDirection: 'row', gap: 12, alignItems: 'center', backgroundColor: colores.tarjeta, borderRadius: radios.tarjeta, borderWidth: 1, borderColor: colores.bordeSuave, padding: 12 },
  tarjetaActiva: { borderColor: colores.primario, borderWidth: 2 },
  avatar: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  avatarTexto: { color: colores.blanco, fontWeight: '800', fontSize: 14 },
  cabecera: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  nombre: { flex: 1, fontSize: 15, fontWeight: '800', color: colores.titulo },
  linea: { fontSize: 12.5, color: colores.textoSecundario },
  etiqueta: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  etiquetaTexto: { fontSize: 9.5, fontWeight: '800', letterSpacing: 0.4 },
  nota: { fontSize: 12.5, color: colores.textoSecundario, textAlign: 'center', lineHeight: 18 },
});
