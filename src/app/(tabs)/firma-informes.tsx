import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { nombreDeCodigo, obtenerCatalogo } from '@/api/catalogos';
import { ErrorApi } from '@/api/cliente';
import { obtenerFirmasConRespaldo, type InformeFirma } from '@/api/firmas';
import { horaRespaldo } from '@/api/respaldo';
import { Aviso } from '@/componentes/Aviso';
import { EncabezadoApp } from '@/componentes/EncabezadoApp';
import { FirmaVista } from '@/componentes/LienzoFirma';
import { useConsulta } from '@/hooks/useConsulta';
import { useDiseno } from '@/hooks/useDiseno';
import { useRefrescoAutomatico } from '@/hooks/useRefrescoAutomatico';
import { useSesion } from '@/sesion/SesionContext';
import { colores, radios } from '@/tema/colores';
import { alternarTodos, clavesDeSeleccion, etiquetaInforme, seleccionable, textoBotonFirmar, textoConteo, textoFirma, textoPlazo, trazosDesde } from '@/utilidades/firmas';

/**
 * HU-17 — "Lista de informes" (firma múltiple). Los informes técnicos de la OS (uno por equipo): COMPLETO (generado, con su responsable) o INCOMPLETO con el motivo.
 * Se marcan los que se van a firmar ("Seleccionar todos"); un responsable firma una sola vez todos sus informes. Los firmados muestran la firma, la hora y "Editar firma".
 * Arriba, la aceptación tácita con su cronómetro (lo calcula el servidor y aquí solo se descuenta). Responsable, cargo y teléfono vienen de «Quien atiende en planta».
 */
export default function PantallaFirmaInformes() {
  const { sesion } = useSesion();
  const usuario = sesion?.usuario;
  const d = useDiseno();
  const params = useLocalSearchParams<{ id?: string }>();
  const idOs = Number(params.id);
  const valido = Number.isInteger(idOs) && idOs > 0;
  const [marcados, setMarcados] = useState<Set<number>>(new Set());
  const [ahora, setAhora] = useState(() => Date.now());

  const { datos, cargando, recargando, error, recargar } = useConsulta(async (token) => {
    if (!valido) throw new ErrorApi('Servicio no válido.', 400, 1);
    const [r, cargos] = await Promise.all([
      obtenerFirmasConRespaldo(token, usuario?.idUsuario ?? 0, idOs),
      obtenerCatalogo(token, 'CARGO_USUARIO').catch(() => undefined),
    ]);
    return { firmas: r.datos, sinConexion: r.sinConexion, guardadoEn: r.guardadoEn, cargos, leidoEn: Date.now() };
  }, String(idOs));
  useRefrescoAutomatico(recargar, 30);

  // Al volver de firmar se vuelve a leer la lista (la primera lectura ya la hizo la consulta)
  const primeraVez = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (primeraVez.current) primeraVez.current = false;
      else void recargar();
    }, [recargar]),
  );

  // Cronómetro de la aceptación tácita: descuenta cada segundo desde la hora en que el servidor respondió
  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const f = datos?.firmas;
  const c = f?.cabecera;
  const cargo = nombreDeCodigo(datos?.cargos, usuario?.cargo) ?? usuario?.cargo ?? 'Técnico de Campo';
  const restante = c?.segundosRestantes == null || !datos ? null : Math.max(0, c.segundosRestantes - Math.floor((ahora - datos.leidoEn) / 1000));
  const claves = f ? clavesDeSeleccion(f.informes, marcados) : [];
  const nMarcados = f ? f.informes.filter((i) => marcados.has(i.idOsEquipo) && seleccionable(i)).length : 0;

  function alternar(i: InformeFirma) {
    if (!seleccionable(i)) return;
    setMarcados((m) => {
      const n = new Set(m);
      if (n.has(i.idOsEquipo)) n.delete(i.idOsEquipo);
      else n.add(i.idOsEquipo);
      return n;
    });
  }

  function firmar() {
    if (claves.length === 0) return;
    router.push({ pathname: '/firma', params: { id: String(idOs), claves: claves.join(',') } });
  }

  function editar(i: InformeFirma) {
    if (!i.clave) return;
    router.push({ pathname: '/firma', params: { id: String(idOs), claves: i.clave, editar: '1' } });
  }

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
            Lista de informes
          </Text>
        </View>

        {cargando ? (
          <ActivityIndicator color={colores.primario} style={{ marginTop: 40 }} />
        ) : error || !f || !c ? (
          <Aviso tipo="error" mensaje={error ?? 'No se encontró el servicio.'} />
        ) : (
          <>
            <Text style={estilos.subtitulo}>
              Firma múltiple · {c.numeroOs}
              {c.cliente ? ` · ${c.cliente}` : ''}
            </Text>
            {datos?.sinConexion && (
              <View style={{ marginBottom: 10 }}>
                <Aviso mensaje={`Sin conexión: se muestra lo último guardado (${horaRespaldo(datos.guardadoEn)}). Firmar exige conexión.`} />
              </View>
            )}

            {c.cerrado ? (
              <View style={[estilos.banner, estilos.bannerVerde]} testID="banner-cerrado">
                <Ionicons name="checkmark-circle" size={22} color={colores.verde} />
                <Text style={estilos.bannerTexto}>
                  <Text style={{ fontWeight: '800' }}>Servicio cerrado.</Text> Todos los informes y la constancia están firmados.
                </Text>
              </View>
            ) : restante !== null ? (
              <View style={[estilos.banner, estilos.bannerAmarillo]} testID="banner-tacita">
                <Ionicons name="time-outline" size={22} color={colores.amarilloTexto} />
                <Text style={estilos.bannerTexto}>{textoPlazo(restante)}</Text>
              </View>
            ) : null}

            <View style={estilos.conteoFila}>
              <Text style={estilos.conteo}>{textoConteo(f.informes)}</Text>
              <Pressable onPress={() => setMarcados(alternarTodos(f.informes, marcados))} hitSlop={8} accessibilityRole="button" testID="seleccionar-todos">
                <Text style={estilos.enlace}>Seleccionar todos</Text>
              </Pressable>
            </View>

            {f.informes.map((i) => (
              <TarjetaInforme key={i.idOsEquipo} i={i} marcado={marcados.has(i.idOsEquipo)} trazosResponsable={f.responsables.find((r) => r.clave === i.clave)?.trazos ?? null} onAlternar={() => alternar(i)} onEditar={() => editar(i)} />
            ))}

            <View style={estilos.nota}>
              <Ionicons name="information-circle-outline" size={20} color={colores.textoSecundario} />
              <Text style={estilos.notaTexto}>Responsable, cargo y teléfono vienen de «Quien atiende en planta» (Cabecera del informe).</Text>
            </View>

            {c.completos > 0 && (
              <Pressable onPress={() => router.push({ pathname: '/constancia', params: { id: String(idOs) } })} style={estilos.botonConstancia} accessibilityRole="button" testID="ir-constancia">
                <Ionicons name="document-text-outline" size={20} color={colores.primario} />
                <Text style={estilos.botonConstanciaTexto}>Constancia de servicio</Text>
              </Pressable>
            )}
          </>
        )}
      </ScrollView>

      {nMarcados > 0 && (
        <Pressable onPress={firmar} style={estilos.flotante} accessibilityRole="button" testID="firmar-seleccionados">
          <Ionicons name="create-outline" size={20} color={colores.blanco} />
          <Text style={estilos.flotanteTexto}>{textoBotonFirmar(nMarcados)}</Text>
        </Pressable>
      )}
    </SafeAreaView>
  );
}

function TarjetaInforme(props: { i: InformeFirma; marcado: boolean; trazosResponsable: unknown; onAlternar: () => void; onEditar: () => void }) {
  const { i } = props;
  const et = etiquetaInforme(i);
  const firma = textoFirma(i);
  const firmado = i.firma === 'firmado';
  const trazos = firmado ? trazosDesde(props.trazosResponsable) : null;
  const puede = seleccionable(i);
  return (
    <Pressable
      onPress={props.onAlternar}
      disabled={!puede}
      style={[estilos.informe, props.marcado && estilos.informeMarcado, firmado && estilos.informeFirmado, !i.completo && estilos.informeIncompleto]}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: props.marcado, disabled: !puede }}
      testID={`informe-${i.idOsEquipo}`}
    >
      <View style={estilos.informeCabecera}>
        {firmado ? (
          <Ionicons name="checkmark-circle" size={24} color={colores.verde} />
        ) : (
          <Ionicons name={props.marcado ? 'checkbox' : 'square-outline'} size={24} color={puede ? colores.primario : colores.borde} />
        )}
        <Text style={estilos.informeTitulo}>INFORME: {i.numeroInforme ?? '—'}</Text>
        <View style={[estilos.pill, { backgroundColor: et.fondo }]}>
          <Text style={[estilos.pillTexto, { color: et.color }]}>{et.texto}</Text>
        </View>
      </View>
      <Text style={estilos.informeEquipo}>
        {i.equipo ?? '—'}
        {i.codigoEquipo ? ` · ${i.codigoEquipo}` : ''}
      </Text>
      {i.completo ? (
        <>
          <View style={estilos.responsableFila}>
            <View style={{ flex: 1 }}>
              <Text style={estilos.k}>Responsable</Text>
              <Text style={estilos.v}>{i.responsable}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={estilos.k}>Cargo</Text>
              <Text style={estilos.v}>{i.cargo ?? '—'}</Text>
            </View>
          </View>
          {firmado && trazos ? (
            <View style={estilos.firmaFila}>
              <FirmaVista trazos={trazos} ancho={96} />
              <Text style={[estilos.firmaTexto, { flex: 1 }]}>{firma.texto}</Text>
              <Pressable onPress={props.onEditar} hitSlop={8} accessibilityRole="button" testID={`editar-firma-${i.idOsEquipo}`}>
                <Text style={estilos.enlace}>
                  <Ionicons name="create-outline" size={14} color={colores.primario} /> Editar firma
                </Text>
              </Pressable>
            </View>
          ) : (
            <Text style={estilos.telefono}>
              {i.telefono ? `☎ ${i.telefono} · ` : ''}Firma: <Text style={{ color: firma.pendiente ? colores.rojo : colores.verde, fontWeight: '800' }}>{firma.texto}</Text>
            </Text>
          )}
        </>
      ) : (
        <Text style={estilos.motivo}>
          <Ionicons name="warning-outline" size={14} color={colores.naranja} /> {i.motivo}
        </Text>
      )}
    </Pressable>
  );
}

const estilos = StyleSheet.create({
  area: { flex: 1, backgroundColor: colores.fondo },
  contenido: { paddingTop: 18, paddingBottom: 110, width: '100%', alignSelf: 'center' },
  tituloFila: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4 },
  titulo: { fontWeight: '700', color: colores.titulo, flexShrink: 1 },
  subtitulo: { color: colores.textoSecundario, fontSize: 14, marginBottom: 10 },
  banner: { flexDirection: 'row', gap: 10, alignItems: 'center', borderRadius: radios.tarjeta, padding: 14, borderWidth: 1, marginBottom: 12 },
  bannerAmarillo: { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' },
  bannerVerde: { backgroundColor: colores.verdeFondo, borderColor: colores.verdeBorde },
  bannerTexto: { flex: 1, color: colores.titulo, fontSize: 15.5, lineHeight: 22 },
  conteoFila: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  conteo: { color: colores.textoSecundario, fontSize: 14.5 },
  enlace: { color: colores.primario, fontWeight: '700', fontSize: 14.5 },
  informe: { backgroundColor: colores.blanco, borderWidth: 1.5, borderColor: colores.bordeSuave, borderRadius: radios.tarjeta, padding: 14, marginBottom: 10 },
  informeMarcado: { borderColor: colores.primario, backgroundColor: colores.primarioSuave },
  informeFirmado: { borderColor: colores.verdeBorde, backgroundColor: colores.verdeFondo },
  informeIncompleto: { opacity: 0.75, backgroundColor: colores.grisFondo },
  informeCabecera: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  informeTitulo: { flex: 1, fontSize: 16, fontWeight: '800', color: colores.titulo },
  informeEquipo: { color: colores.textoSecundario, fontSize: 14, marginTop: 4, marginLeft: 32 },
  responsableFila: { flexDirection: 'row', gap: 12, marginTop: 8, marginLeft: 32 },
  k: { fontSize: 12.5, color: colores.textoTenue },
  v: { fontSize: 15, fontWeight: '700', color: colores.titulo },
  telefono: { marginTop: 6, marginLeft: 32, fontSize: 13.5, color: colores.textoSecundario },
  firmaFila: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8, marginLeft: 32 },
  firmaTexto: { fontSize: 13, color: colores.textoSecundario },
  motivo: { marginTop: 6, marginLeft: 32, fontSize: 13.5, color: colores.naranja, lineHeight: 19 },
  pill: { borderRadius: 8, paddingHorizontal: 9, paddingVertical: 3 },
  pillTexto: { fontSize: 11.5, fontWeight: '800', letterSpacing: 0.3 },
  nota: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', backgroundColor: colores.primarioSuave, borderRadius: radios.tarjeta, padding: 12, marginTop: 4 },
  notaTexto: { flex: 1, color: colores.textoSecundario, fontSize: 13.5, lineHeight: 19 },
  botonConstancia: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', minHeight: 52, borderRadius: radios.boton, borderWidth: 1.5, borderColor: colores.primario, marginTop: 14, backgroundColor: colores.blanco },
  botonConstanciaTexto: { color: colores.primario, fontSize: 16.5, fontWeight: '700' },
  flotante: { position: 'absolute', right: 16, bottom: 18, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colores.primario, borderRadius: 999, paddingHorizontal: 20, paddingVertical: 14, elevation: 4 },
  flotanteTexto: { color: colores.blanco, fontSize: 16.5, fontWeight: '800' },
});
