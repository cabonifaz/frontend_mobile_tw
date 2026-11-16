import { useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ejecutarAccionAlerta, obtenerAlerta, type AccionAlerta, type LecturaAlerta } from '@/api/alertasCampo';
import { ErrorApi } from '@/api/cliente';
import { Aviso } from '@/componentes/Aviso';
import { Boton } from '@/componentes/Boton';
import { EncabezadoApp } from '@/componentes/EncabezadoApp';
import { useConsulta } from '@/hooks/useConsulta';
import { useDiseno } from '@/hooks/useDiseno';
import { useSesion } from '@/sesion/SesionContext';
import { colores, radios } from '@/tema/colores';
import { empTexto, errorConSigno, haceTexto, numero } from '@/utilidades/alertasCampo';

/**
 * HU-32 — Alerta de campo (Jefe de Área): pedido de apoyo del técnico ante un error crítico en un ensayo (aviso «Ensayo con error crítico»).
 *  - Muestra quién pidió apoyo y hace cuánto, la OS, el equipo y la tabla del ensayo (L, I, E, EMP) con las lecturas críticas marcadas.
 *  - Decisiones: Llamar al técnico (queda registrado) · Pedir repetir el ensayo · Indicar ajuste y nueva calibración (avisan al técnico, con una indicación
 *    opcional) · Registrar incidencia (con opción de escalarla y de reasignar el servicio).
 */
export default function PantallaAlerta() {
  const { sesion } = useSesion();
  const usuario = sesion?.usuario;
  const token = sesion?.token ?? '';
  const d = useDiseno();
  const params = useLocalSearchParams<{ id?: string }>();
  const idNotificacion = Number(params.id);
  const [accion, setAccion] = useState<'repetir' | 'ajuste' | null>(null);
  const [indicacion, setIndicacion] = useState('');
  const [enviando, setEnviando] = useState<AccionAlerta | null>(null);
  const [mensaje, setMensaje] = useState<{ tipo: 'error' | 'info'; texto: string } | null>(null);

  const { datos: a, cargando, error } = useConsulta(async (t) => {
    if (!Number.isInteger(idNotificacion) || idNotificacion <= 0) throw new ErrorApi('Alerta no válida.', 400, 1);
    return obtenerAlerta(t, idNotificacion);
  }, params.id ?? '');

  async function ejecutar(tipo: AccionAlerta, texto = '') {
    setMensaje(null);
    setEnviando(tipo);
    try {
      const r = await ejecutarAccionAlerta(token, idNotificacion, tipo, texto);
      if (tipo === 'llamar') {
        const tel = r.contacto?.telefono?.replace(/[^\d+]/g, '');
        if (!tel) throw new Error('El técnico no tiene un teléfono registrado.');
        await Linking.openURL(`tel:${tel}`);
      } else {
        setAccion(null);
        setIndicacion('');
        setMensaje({ tipo: 'info', texto: r.mensaje });
      }
    } catch (e) {
      setMensaje({ tipo: 'error', texto: e instanceof Error ? e.message : 'No se pudo completar la acción.' });
    } finally {
      setEnviando(null);
    }
  }

  return (
    <SafeAreaView style={estilos.area} edges={['top']}>
      <EncabezadoApp nombre={usuario?.nombre ?? ''} apellido={usuario?.apellido} subtitulo={`${usuario?.nombre ?? ''} · ${usuario?.cargo ?? 'Jefe de Área'}`} />
      <ScrollView contentContainerStyle={[estilos.contenido, { paddingHorizontal: d.margen, maxWidth: d.anchoMaximo }]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={estilos.tituloFila}>
          <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Volver">
            <Ionicons name="arrow-back" size={24} color={colores.titulo} />
          </Pressable>
          <Text style={estilos.titulo} accessibilityRole="header">
            Alerta de campo
          </Text>
        </View>
        <Text style={estilos.subtitulo}>Pedido de apoyo del técnico</Text>

        {cargando ? (
          <ActivityIndicator color={colores.primario} style={{ marginTop: 32 }} />
        ) : error || !a ? (
          <Aviso tipo="error" mensaje={error ?? 'No se pudo cargar la alerta.'} />
        ) : (
          <>
            <View style={estilos.banner} testID="alerta-banner">
              <Ionicons name="alert-circle" size={26} color={colores.rojo} />
              <View style={{ flex: 1 }}>
                <Text style={estilos.bannerTitulo}>Error crítico en ensayo</Text>
                <Text style={estilos.bannerSub}>
                  {a.tecnico ?? 'El técnico'} pidió apoyo · {haceTexto(a.haceMin)}
                </Text>
              </View>
            </View>

            <View style={estilos.tarjeta} testID="alerta-equipo">
              <Text style={estilos.osTitulo}>
                {a.numeroOs}
                {a.equipoCodigo ? ` · ${a.equipoCodigo}` : ''}
              </Text>
              <Text style={estilos.sub}>{[a.equipoDescripcion, a.equipoUbicacion, a.cliente].filter(Boolean).join(' · ')}</Text>
              {!!a.sede && <Text style={estilos.sub}>{a.sede}</Text>}

              {a.pesaje.length > 0 && <Tabla titulo="ENSAYO DE PESAJE" filas={a.pesaje} />}
              {a.excentricidad.length > 0 && <Tabla titulo="ENSAYO DE EXCENTRICIDAD" filas={a.excentricidad} conPosicion />}
              {a.pesaje.length === 0 && a.excentricidad.length === 0 && <Text style={estilos.sub}>{a.cuerpo}</Text>}
            </View>

            <Text style={estilos.seccion}>¿QUÉ HACES?</Text>
            {!!mensaje && <Aviso tipo={mensaje.tipo} mensaje={mensaje.texto} />}

            <Boton titulo={`Llamar a ${a.tecnico ?? 'técnico'}`} onPress={() => void ejecutar('llamar')} cargando={enviando === 'llamar'} deshabilitado={!!enviando || !a.telefono} />
            {!a.telefono && <Text style={estilos.nota}>El técnico no tiene un teléfono registrado.</Text>}

            {accion ? (
              <View style={estilos.panel} testID="alerta-panel-accion">
                <Text style={estilos.panelTitulo}>{accion === 'repetir' ? 'Pedir repetir el ensayo' : 'Indicar ajuste y nueva calibración'}</Text>
                <Text style={estilos.nota}>Se avisa a {a.tecnico ?? 'el técnico'} en su teléfono. Puedes agregar una indicación.</Text>
                <TextInput
                  value={indicacion}
                  onChangeText={(t) => setIndicacion(t.slice(0, 300))}
                  placeholder={accion === 'repetir' ? 'Ej.: Repite el pesaje de 1500 kg con la plataforma limpia.' : 'Ej.: Ajusta la esquina 4 y vuelve a calibrar.'}
                  placeholderTextColor={colores.placeholder}
                  multiline
                  style={estilos.entrada}
                  editable={!enviando}
                  testID="alerta-indicacion"
                />
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Boton titulo="Cancelar" variante="secundario" onPress={() => setAccion(null)} deshabilitado={!!enviando} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Boton titulo="Enviar aviso" onPress={() => void ejecutar(accion, indicacion)} cargando={enviando === accion} deshabilitado={!!enviando} />
                  </View>
                </View>
              </View>
            ) : (
              <>
                <Boton titulo="Pedir repetir ensayo" variante="secundario" onPress={() => setAccion('repetir')} deshabilitado={!!enviando} />
                <Boton titulo="Indicar ajuste y nueva calibración" variante="secundario" onPress={() => setAccion('ajuste')} deshabilitado={!!enviando} />
              </>
            )}
            <Boton
              titulo="Registrar incidencia"
              variante="alerta"
              onPress={() => router.push({ pathname: '/alertas-incidencia', params: { id: String(a.idOs), n: String(a.idNotificacion) } } as unknown as Href)}
              deshabilitado={!!enviando}
            />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Tabla({ titulo, filas, conPosicion = false }: { titulo: string; filas: LecturaAlerta[]; conPosicion?: boolean }) {
  return (
    <View style={{ marginTop: 10 }}>
      <Text style={estilos.tablaTitulo}>{titulo}</Text>
      <View style={estilos.tabla}>
        <View style={[estilos.fila, estilos.filaCabecera]}>
          {conPosicion && <Text style={[estilos.celda, estilos.celdaCab, { flex: 0.6 }]}>Pos.</Text>}
          <Text style={[estilos.celda, estilos.celdaCab]}>Carga L</Text>
          <Text style={[estilos.celda, estilos.celdaCab]}>Indic. I</Text>
          <Text style={[estilos.celda, estilos.celdaCab, { flex: 0.7 }]}>E</Text>
          <Text style={[estilos.celda, estilos.celdaCab, { flex: 0.8 }]}>EMP</Text>
          <View style={{ width: 24 }} />
        </View>
        {filas.map((f, i) => (
          <View key={`${f.grupo ?? 0}-${f.orden}-${i}`} style={[estilos.fila, f.critico && { backgroundColor: colores.rojoEtiquetaFondo }]}>
            {conPosicion && <Text style={[estilos.celda, { flex: 0.6 }]}>{f.grupo ? `${f.grupo}.${f.orden}` : f.orden}</Text>}
            <Text style={estilos.celda}>{numero(f.carga)}</Text>
            <Text style={estilos.celda}>{numero(f.indicacion)}</Text>
            <Text style={[estilos.celda, { flex: 0.7, fontWeight: '800' }, f.critico && { color: colores.rojo }]}>{errorConSigno(f.error)}</Text>
            <Text style={[estilos.celda, { flex: 0.8 }]}>{empTexto(f.emp)}</Text>
            <Ionicons name={f.critico ? 'close-circle' : 'checkmark-circle'} size={18} color={f.critico ? colores.rojo : colores.verde} style={{ width: 24 }} />
          </View>
        ))}
      </View>
    </View>
  );
}

const estilos = StyleSheet.create({
  area: { flex: 1, backgroundColor: colores.fondo },
  contenido: { padding: 16, paddingBottom: 28, maxWidth: 560, width: '100%', alignSelf: 'center', gap: 12 },
  tituloFila: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  titulo: { fontSize: 24, fontWeight: '700', color: colores.titulo, flexShrink: 1 },
  subtitulo: { fontSize: 14, color: colores.textoSecundario, marginLeft: 34, marginTop: -6 },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colores.rojoEtiquetaFondo, borderRadius: radios.tarjeta, borderWidth: 1, borderColor: colores.errorBorde, padding: 14 },
  bannerTitulo: { fontSize: 16, fontWeight: '800', color: colores.rojoEtiquetaTexto },
  bannerSub: { fontSize: 13, color: colores.rojoEtiquetaTexto, marginTop: 1 },
  tarjeta: { backgroundColor: colores.tarjeta, borderRadius: radios.tarjeta, borderWidth: 1, borderColor: colores.bordeSuave, padding: 14, gap: 3 },
  osTitulo: { fontSize: 17, fontWeight: '800', color: colores.titulo },
  sub: { fontSize: 12.5, color: colores.textoSecundario, lineHeight: 18 },
  tablaTitulo: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.8, color: colores.textoSecundario, marginBottom: 4 },
  tabla: { borderWidth: 1, borderColor: colores.bordeSuave, borderRadius: 10, overflow: 'hidden' },
  fila: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colores.bordeSuave },
  filaCabecera: { backgroundColor: colores.grisFondo, borderTopWidth: 0 },
  celda: { flex: 1, fontSize: 13, color: colores.titulo, textAlign: 'center' },
  celdaCab: { fontSize: 11, fontWeight: '800', color: colores.textoSecundario },
  seccion: { fontSize: 11.5, fontWeight: '800', letterSpacing: 1, color: colores.textoSecundario, marginTop: 6 },
  nota: { fontSize: 12.5, color: colores.textoSecundario, lineHeight: 18 },
  panel: { backgroundColor: colores.tarjeta, borderRadius: radios.tarjeta, borderWidth: 1, borderColor: colores.bordeSuave, padding: 14, gap: 10 },
  panelTitulo: { fontSize: 15.5, fontWeight: '800', color: colores.titulo },
  entrada: { minHeight: 80, textAlignVertical: 'top', backgroundColor: colores.fondo, borderWidth: 1, borderColor: colores.borde, borderRadius: radios.campo, padding: 12, fontSize: 14.5, color: colores.texto },
});
