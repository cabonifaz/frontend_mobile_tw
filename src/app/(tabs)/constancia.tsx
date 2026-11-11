import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { nombreDeCodigo, obtenerCatalogo } from '@/api/catalogos';
import { ErrorApi } from '@/api/cliente';
import { firmarConstancia, generarConstancia, obtenerConstanciaConRespaldo, type Constancia, type Trazos } from '@/api/firmas';
import { horaRespaldo } from '@/api/respaldo';
import { Aviso } from '@/componentes/Aviso';
import { EncabezadoApp } from '@/componentes/EncabezadoApp';
import { FirmaVista, LienzoFirma } from '@/componentes/LienzoFirma';
import { useConsulta } from '@/hooks/useConsulta';
import { useDiseno } from '@/hooks/useDiseno';
import { useSesion } from '@/sesion/SesionContext';
import { colores, radios } from '@/tema/colores';
import { fechaCorta } from '@/utilidades/formato';
import {
  ayudaGenerar,
  etiquetaEnvio,
  fechaHoraCorta,
  firmaSuficiente,
  nombreFirmanteValido,
  resultadoConstancia,
  textoEnvio,
  textoFalta,
  textoFirmaCliente,
  textoInformesFirmados,
  trazosDesde,
} from '@/utilidades/firmas';

/**
 * HU-17 — "Constancia de servicio". Datos del cliente y de los equipos intervenidos; "Firma cliente" (lienzo + nombre), "Formato físico" (opcional, foto del papel),
 * "Generar constancia" (se habilita con la firma del cliente) y "Listado de informes". Si al generarla todo está firmado, el servicio queda CERRADO (el back arma el PDF y,
 * si está activado, lo envía al correo del contacto); si falta un responsable se muestra "Falta una firma" con "Seguir en lista de informes". El envío por correo y el PDF los
 * decide el servidor: aquí solo se muestra su estado. Generar exige conexión (guardar la constancia sin señal queda pendiente).
 */
export default function PantallaConstancia() {
  const { sesion } = useSesion();
  const usuario = sesion?.usuario;
  const token = sesion?.token ?? '';
  const d = useDiseno();
  const params = useLocalSearchParams<{ id?: string }>();
  const idOs = Number(params.id);
  const valido = Number.isInteger(idOs) && idOs > 0;
  const [firmando, setFirmando] = useState(false);
  const [modal, setModal] = useState(false);
  const [trazos, setTrazos] = useState<Trazos>([]);
  const [nombre, setNombre] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: 'error' | 'info'; texto: string } | null>(null);
  const [actualizada, setActualizada] = useState<Constancia | null>(null);

  const { datos, cargando, recargando, error, recargar } = useConsulta(async (tk) => {
    if (!valido) throw new ErrorApi('Servicio no válido.', 400, 1);
    const [r, cargos] = await Promise.all([obtenerConstanciaConRespaldo(tk, usuario?.idUsuario ?? 0, idOs), obtenerCatalogo(tk, 'CARGO_USUARIO').catch(() => undefined)]);
    return { constancia: r.datos, sinConexion: r.sinConexion, guardadoEn: r.guardadoEn, cargos };
  }, String(idOs));

  const primeraVez = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (primeraVez.current) primeraVez.current = false;
      else {
        setActualizada(null);
        void recargar();
      }
    }, [recargar]),
  );

  const cargo = nombreDeCodigo(datos?.cargos, usuario?.cargo) ?? usuario?.cargo ?? 'Técnico de Campo';
  const k = actualizada ?? datos?.constancia ?? null;
  const c = k?.cabecera;
  const estado = c ? resultadoConstancia(c) : 'sin_firma';

  function abrirFirma() {
    setTrazos([]);
    setNombre(c?.firmante ?? c?.contactoNombre ?? '');
    setMensaje(null);
    setModal(true);
  }

  async function guardarFirma() {
    if (!firmaSuficiente(trazos) || !nombreFirmanteValido(nombre) || ocupado) return;
    setOcupado(true);
    try {
      const r = await firmarConstancia(token, idOs, { trazos, nombre });
      setActualizada(r.constancia);
      setModal(false);
      setMensaje({ tipo: 'info', texto: r.mensaje });
    } catch (e) {
      setMensaje({ tipo: 'error', texto: e instanceof Error ? e.message : 'No se pudo guardar la firma.' });
      setModal(false);
    } finally {
      setOcupado(false);
    }
  }

  async function generar() {
    if (!c?.puedeGenerar || ocupado) return;
    setOcupado(true);
    setMensaje(null);
    try {
      const r = await generarConstancia(token, idOs);
      setActualizada(r.constancia);
    } catch (e) {
      setMensaje({ tipo: 'error', texto: e instanceof Error ? e.message : 'No se pudo generar la constancia.' });
    } finally {
      setOcupado(false);
    }
  }

  return (
    <SafeAreaView style={estilos.area} edges={['top']}>
      <EncabezadoApp nombre={usuario?.nombre ?? ''} apellido={usuario?.apellido} subtitulo={`${usuario?.nombre ?? ''} · ${cargo}`} />
      <ScrollView
        scrollEnabled={!firmando}
        contentContainerStyle={[estilos.contenido, { paddingHorizontal: d.margen, maxWidth: d.anchoMaximo }]}
        refreshControl={<RefreshControl refreshing={recargando} onRefresh={() => { setActualizada(null); void recargar(); }} colors={[colores.primario]} />}
        keyboardShouldPersistTaps="handled"
      >
        <View style={estilos.tituloFila}>
          <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Volver">
            <Ionicons name="arrow-back" size={24} color={colores.titulo} />
          </Pressable>
          <Text style={[estilos.titulo, { fontSize: d.tituloPantalla }]} accessibilityRole="header">
            Constancia de servicio
          </Text>
        </View>

        {cargando ? (
          <ActivityIndicator color={colores.primario} style={{ marginTop: 40 }} />
        ) : error || !k || !c ? (
          <Aviso tipo="error" mensaje={error ?? 'No se encontró el servicio.'} />
        ) : estado === 'falta' || estado === 'cerrado' ? (
          <Resultado k={k} cerrado={estado === 'cerrado'} idOs={idOs} />
        ) : (
          <>
            <Text style={estilos.subtitulo}>
              {c.numeroOs}
              {c.cliente ? ` · ${c.cliente}` : ''}
            </Text>
            {datos?.sinConexion && !actualizada && (
              <View style={{ marginBottom: 10 }}>
                <Aviso mensaje={`Sin conexión: se muestra lo último guardado (${horaRespaldo(datos.guardadoEn)}). Firmar y generar exigen conexión.`} />
              </View>
            )}
            {mensaje && (
              <View style={{ marginBottom: 10 }} testID="mensaje-constancia">
                <Aviso tipo={mensaje.tipo} mensaje={mensaje.texto} />
              </View>
            )}

            <View style={estilos.tarjeta} testID="datos-constancia">
              <Text style={estilos.cliente}>{c.cliente ?? '—'}</Text>
              {!!c.direccion && <Text style={estilos.linea}>{c.direccion}</Text>}
              {!!c.contactoNombre && (
                <Text style={estilos.linea}>
                  Contacto: {c.contactoNombre}
                  {c.contactoTelefono ? ` / ${c.contactoTelefono}` : ''}
                </Text>
              )}
              {!!c.contactoCorreo && <Text style={[estilos.linea, { color: colores.primario }]}>{c.contactoCorreo}</Text>}
              <View style={estilos.rejilla}>
                <Dato k="RQ" v={c.numeroRq ?? '—'} />
                <Dato k="OS" v={c.numeroOs} />
                <Dato k="FECHA" v={c.fecha ? fechaCorta(c.fecha) : '—'} />
                <Dato k="INFORMES" v={`${c.firmados} firmados`} />
              </View>
            </View>

            <Text style={estilos.seccion}>EQUIPOS INTERVENIDOS</Text>
            <View style={estilos.tarjeta}>
              {k.equipos.length === 0 && <Text style={estilos.linea}>Aún no hay informes generados.</Text>}
              {k.equipos.map((e, i) => (
                <View key={`${e.codigo}-${i}`} style={[estilos.equipo, i > 0 && estilos.equipoSep]}>
                  <Text style={estilos.equipoNombre}>
                    {i + 1}. {e.equipo ?? [e.marca, e.modelo].filter(Boolean).join(' · ')}
                  </Text>
                  <Text style={estilos.linea}>
                    Serie: {e.serie ?? '—'} · Código: {e.codigo ?? '—'}
                  </Text>
                  <Text style={estilos.linea}>
                    Capacidad: {e.capacidad ?? '—'} · d: {e.d ?? '—'} · e: {e.e ?? '—'}
                  </Text>
                  <Text style={estilos.linea}>
                    Ubicación: {e.ubicacion ?? '—'} · Procedencia: {e.procedencia ?? '—'}
                  </Text>
                  {!!e.certificado && (
                    <View style={estilos.certificado}>
                      <Text style={estilos.certificadoTexto}>CERTIFICADO {e.certificado}</Text>
                    </View>
                  )}
                </View>
              ))}
            </View>

            {c.firmada && (
              <View style={estilos.firmaCliente} testID="firma-cliente-hecha">
                <Ionicons name="checkmark-circle" size={22} color={colores.verde} />
                <View style={{ flex: 1 }}>
                  <Text style={estilos.firmaClienteTitulo}>{textoFirmaCliente(c)}</Text>
                  <Text style={estilos.linea}>
                    {c.firmante ?? '—'} · {fechaHoraCorta(c.firmadoEn)}
                  </Text>
                </View>
                {trazosDesde(c.trazos) && <FirmaVista trazos={trazosDesde(c.trazos)!} ancho={96} />}
              </View>
            )}

            <Pressable onPress={abrirFirma} style={[estilos.boton, estilos.botonPrimario]} accessibilityRole="button" testID="firma-cliente">
              <Ionicons name="create-outline" size={20} color={colores.blanco} />
              <Text style={estilos.botonPrimarioTexto}>{c.firmada ? 'Cambiar firma del cliente' : 'Firma cliente'}</Text>
            </Pressable>
            <Pressable
              onPress={() => router.push({ pathname: '/constancia-formato-fisico', params: { id: String(idOs) } })}
              style={[estilos.boton, estilos.botonVerde]}
              accessibilityRole="button"
              testID="formato-fisico"
            >
              <Ionicons name="camera-outline" size={20} color={colores.verde} />
              <Text style={estilos.botonVerdeTexto}>
                Formato físico <Text style={{ fontWeight: '500' }}>(opcional)</Text>
              </Text>
            </Pressable>
            <View style={estilos.fila}>
              <Pressable
                onPress={() => void generar()}
                disabled={!c.puedeGenerar || ocupado}
                style={[estilos.boton, estilos.botonOscuro, { flex: 1 }, (!c.puedeGenerar || ocupado) && { opacity: 0.45 }]}
                accessibilityRole="button"
                accessibilityState={{ disabled: !c.puedeGenerar || ocupado }}
                testID="generar-constancia"
              >
                {ocupado ? <ActivityIndicator color={colores.blanco} /> : <Text style={estilos.botonPrimarioTexto}>Generar constancia</Text>}
              </Pressable>
              <Pressable onPress={() => router.push({ pathname: '/firma-informes', params: { id: String(idOs) } })} style={[estilos.boton, estilos.botonBorde, { flex: 1 }]} accessibilityRole="button" testID="listado-informes">
                <Text style={estilos.botonBordeTexto}>Listado de informes</Text>
              </Pressable>
            </View>
            <Text style={estilos.ayuda}>{ayudaGenerar(c.firmada)}</Text>
          </>
        )}
      </ScrollView>

      <Modal visible={modal} animationType="slide" onRequestClose={() => setModal(false)}>
        <SafeAreaView style={estilos.area}>
          <ScrollView scrollEnabled={!firmando} contentContainerStyle={{ padding: 16, gap: 12 }} keyboardShouldPersistTaps="handled">
            <View style={estilos.tituloFila}>
              <Pressable onPress={() => setModal(false)} hitSlop={12} accessibilityRole="button" accessibilityLabel="Cerrar">
                <Ionicons name="close" size={26} color={colores.titulo} />
              </Pressable>
              <Text style={estilos.titulo}>Firma del cliente</Text>
            </View>
            <Text style={estilos.linea}>El cliente firma con el dedo en el recuadro. Queda como trazos digitales dentro de la constancia.</Text>
            <LienzoFirma trazos={trazos} onCambio={setTrazos} onTocando={setFirmando} etiqueta="Firma del cliente" deshabilitado={ocupado} />
            <Text style={estilos.etiqueta}>Nombre de quien firma *</Text>
            <TextInput value={nombre} onChangeText={(t) => setNombre(t.slice(0, 150))} placeholder="Nombre y apellido" placeholderTextColor={colores.placeholder} style={estilos.campo} testID="nombre-firmante" />
            <View style={estilos.fila}>
              <Pressable onPress={() => setTrazos([])} style={[estilos.boton, estilos.botonBorde, { flex: 1 }]} accessibilityRole="button" testID="limpiar-firma-cliente">
                <Text style={estilos.botonBordeTexto}>Limpiar</Text>
              </Pressable>
              <Pressable
                onPress={() => void guardarFirma()}
                disabled={!firmaSuficiente(trazos) || !nombreFirmanteValido(nombre) || ocupado}
                style={[estilos.boton, estilos.botonPrimario, { flex: 1.6 }, (!firmaSuficiente(trazos) || !nombreFirmanteValido(nombre) || ocupado) && { opacity: 0.45 }]}
                accessibilityRole="button"
                testID="guardar-firma-cliente"
              >
                {ocupado ? <ActivityIndicator color={colores.blanco} /> : <Text style={estilos.botonPrimarioTexto}>Guardar firma</Text>}
              </Pressable>
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

/** "Falta una firma" (generada con responsables pendientes) o "Servicio cerrado". */
function Resultado({ k, cerrado, idOs }: { k: Constancia; cerrado: boolean; idOs: number }) {
  const c = k.cabecera;
  const envio = etiquetaEnvio(c.envioEstado);
  const trazos = trazosDesde(c.trazos);
  return (
    <View testID={cerrado ? 'servicio-cerrado' : 'falta-una-firma'}>
      <View style={estilos.resultadoIcono}>
        <View style={[estilos.resultadoCirculo, { backgroundColor: cerrado ? colores.verde : colores.naranja }]}>
          <Ionicons name={cerrado ? 'checkmark' : 'alert'} size={36} color={colores.blanco} />
        </View>
        <Text style={estilos.resultadoTitulo}>{cerrado ? 'Servicio cerrado' : 'Falta una firma'}</Text>
        <Text style={estilos.linea}>
          {c.numeroOs}
          {c.cliente ? ` · ${c.cliente}` : ''}
        </Text>
      </View>

      <View style={estilos.tarjeta}>
        <Fila k="Informes técnicos" v={cerrado ? `${c.firmados} firmados` : textoInformesFirmados(c)} />
        <Fila k="Constancia" v={textoFirmaCliente(c)} />
        <View style={estilos.filaFirma}>
          <Text style={estilos.filaK}>Firma</Text>
          <View style={{ alignItems: 'flex-end', flexShrink: 1 }}>
            {trazos && <FirmaVista trazos={trazos} ancho={110} />}
            <Text style={estilos.linea}>
              {c.firmante ?? '—'} · {fechaHoraCorta(c.firmadoEn)}
            </Text>
          </View>
        </View>
        <View style={estilos.filaFirma}>
          <Text style={estilos.filaK}>Envío al cliente</Text>
          <View style={[estilos.pill, { backgroundColor: envio.fondo }]}>
            <Text style={[estilos.pillTexto, { color: envio.color }]}>{envio.texto}</Text>
          </View>
        </View>
        <Text style={estilos.linea}>{cerrado ? textoEnvio(c) : 'Se envía cuando estén todas las firmas'}</Text>
      </View>

      {!cerrado && k.faltan.length > 0 && (
        <View style={estilos.falta} testID="faltan-firmas">
          {k.faltan.map((f) => {
            const t = textoFalta(f);
            return (
              <View key={f.nombre}>
                <Text style={estilos.faltaTitulo}>
                  <Ionicons name="person-outline" size={14} color={colores.amarilloTexto} /> Falta firmar: {t.titulo}
                </Text>
                <Text style={estilos.linea}>{t.detalle}</Text>
              </View>
            );
          })}
        </View>
      )}

      {!cerrado && (
        <Pressable onPress={() => router.replace({ pathname: '/firma-informes', params: { id: String(idOs) } })} style={[estilos.boton, estilos.botonPrimario]} accessibilityRole="button" testID="seguir-en-lista">
          <Ionicons name="list-outline" size={20} color={colores.blanco} />
          <Text style={estilos.botonPrimarioTexto}>Seguir en lista de informes</Text>
        </Pressable>
      )}
      <Pressable onPress={() => router.replace('/servicios-programados')} style={[estilos.boton, cerrado ? estilos.botonPrimario : estilos.botonBorde]} accessibilityRole="button" testID="volver-servicios">
        <Text style={cerrado ? estilos.botonPrimarioTexto : estilos.botonBordeTexto}>Volver a servicios programados</Text>
      </Pressable>
    </View>
  );
}

function Dato({ k, v }: { k: string; v: string }) {
  return (
    <View style={{ width: '47%' }}>
      <Text style={estilos.datoK}>{k}</Text>
      <Text style={estilos.datoV}>{v}</Text>
    </View>
  );
}

function Fila({ k, v }: { k: string; v: string }) {
  return (
    <View style={estilos.filaFirma}>
      <Text style={estilos.filaK}>{k}</Text>
      <Text style={estilos.filaV}>{v}</Text>
    </View>
  );
}

const estilos = StyleSheet.create({
  area: { flex: 1, backgroundColor: colores.fondo },
  contenido: { paddingTop: 18, paddingBottom: 28, width: '100%', alignSelf: 'center' },
  tituloFila: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4 },
  titulo: { fontWeight: '700', color: colores.titulo, flexShrink: 1, fontSize: 22 },
  subtitulo: { color: colores.textoSecundario, fontSize: 14, marginBottom: 10 },
  tarjeta: { backgroundColor: colores.blanco, borderWidth: 1, borderColor: colores.bordeSuave, borderRadius: radios.tarjeta, padding: 16, marginBottom: 12 },
  cliente: { fontSize: 18, fontWeight: '800', color: colores.titulo },
  linea: { fontSize: 14.5, color: colores.textoSecundario, marginTop: 3, lineHeight: 20 },
  rejilla: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 12 },
  datoK: { fontSize: 12.5, color: colores.textoTenue, letterSpacing: 0.5 },
  datoV: { fontSize: 16, fontWeight: '800', color: colores.titulo },
  seccion: { fontSize: 13, fontWeight: '800', color: colores.textoSecundario, letterSpacing: 1.2, marginTop: 4, marginBottom: 8 },
  equipo: { paddingVertical: 4 },
  equipoSep: { borderTopWidth: 1, borderTopColor: colores.bordeSuave, marginTop: 8, paddingTop: 10 },
  equipoNombre: { fontSize: 16, fontWeight: '800', color: colores.titulo },
  certificado: { alignSelf: 'flex-start', backgroundColor: colores.azulFondo, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 3, marginTop: 6 },
  certificadoTexto: { fontSize: 12, fontWeight: '800', color: colores.azulTexto },
  firmaCliente: { flexDirection: 'row', gap: 10, alignItems: 'center', backgroundColor: colores.verdeFondo, borderWidth: 1, borderColor: colores.verdeBorde, borderRadius: radios.tarjeta, padding: 12, marginBottom: 10 },
  firmaClienteTitulo: { fontSize: 15.5, fontWeight: '800', color: colores.titulo },
  boton: { minHeight: 52, borderRadius: radios.boton, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 10, paddingHorizontal: 10 },
  botonPrimario: { backgroundColor: colores.primario },
  botonPrimarioTexto: { color: colores.blanco, fontSize: 16.5, fontWeight: '700' },
  botonVerde: { borderWidth: 1.5, borderColor: colores.verdeBorde, backgroundColor: colores.blanco },
  botonVerdeTexto: { color: colores.verde, fontSize: 16.5, fontWeight: '700' },
  botonOscuro: { backgroundColor: colores.primarioOscuro },
  botonBorde: { borderWidth: 1.5, borderColor: colores.primario, backgroundColor: colores.blanco },
  botonBordeTexto: { color: colores.primario, fontSize: 16, fontWeight: '700' },
  fila: { flexDirection: 'row', gap: 10 },
  ayuda: { textAlign: 'center', color: colores.textoSecundario, fontSize: 13.5, marginTop: 10, lineHeight: 19 },
  etiqueta: { fontSize: 16.5, fontWeight: '700', color: colores.titulo },
  campo: { borderWidth: 1, borderColor: colores.borde, borderRadius: radios.campo, padding: 12, fontSize: 16, color: colores.texto, backgroundColor: colores.blanco },
  resultadoIcono: { alignItems: 'center', marginVertical: 14, gap: 4 },
  resultadoCirculo: { width: 74, height: 74, borderRadius: 37, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  resultadoTitulo: { fontSize: 24, fontWeight: '800', color: colores.titulo },
  filaFirma: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colores.bordeSuave },
  filaK: { fontSize: 15.5, color: colores.titulo },
  filaV: { fontSize: 15.5, fontWeight: '800', color: colores.titulo, flexShrink: 1, textAlign: 'right' },
  pill: { borderRadius: 8, paddingHorizontal: 9, paddingVertical: 3 },
  pillTexto: { fontSize: 11.5, fontWeight: '800', letterSpacing: 0.3 },
  falta: { backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FDE68A', borderRadius: radios.tarjeta, padding: 12, gap: 8, marginBottom: 4 },
  faltaTitulo: { fontSize: 15.5, fontWeight: '800', color: colores.amarilloTexto },
});
