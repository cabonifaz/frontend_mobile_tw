import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ErrorApi } from '@/api/cliente';
import { nombreDeCodigo, obtenerCatalogo } from '@/api/catalogos';
import { accionEquipoOEncolar } from '@/api/colaEquipos';
import { buscarEquipoPorQr, obtenerObjetivosConRespaldo, type ObjetivoEquipo } from '@/api/ruta';
import { Aviso } from '@/componentes/Aviso';
import { Boton } from '@/componentes/Boton';
import { CamaraApp } from '@/componentes/CamaraApp';
import { EncabezadoApp } from '@/componentes/EncabezadoApp';
import { useAccionesEquipos } from '@/hooks/useAccionesEquipos';
import { useConsulta } from '@/hooks/useConsulta';
import { useDiseno } from '@/hooks/useDiseno';
import { useSesion } from '@/sesion/SesionContext';
import { colores, radios } from '@/tema/colores';
import { aplicarPendientes, buscarPorCodigo, conObjetivoPrimero, filtrarEquipos } from '@/utilidades/objetivos';

/**
 * HU-07 — Selección de equipo.
 *  - Busca entre los equipos de la OS por N/S, código, COD TW, marca, modelo o ubicación (en el teléfono, sobre la lista ya cargada: también sin conexión).
 *  - El botón de escanear lee el código de barras o QR del equipo y lo muestra para confirmarlo (solo si es de la lista de la OS).
 *  - "NEW" registra un equipo que no está en la lista (pantalla "Equipo nuevo").
 *  - "Seleccionar" inicia el trabajo en el equipo y vuelve a los objetivos. Sin conexión la acción se guarda y se envía sola al volver la señal.
 *  - Los equipos bloqueados (inactivos o en evaluación) se ven en gris con "Bloqueado" y no se pueden seleccionar.
 */
export default function PantallaSeleccionarEquipo() {
  const { sesion } = useSesion();
  const usuario = sesion?.usuario;
  const idUsuario = usuario?.idUsuario ?? 0;
  const d = useDiseno();
  const params = useLocalSearchParams<{ id?: string; objetivo?: string }>();
  const idOs = Number(params.id);
  const idValido = Number.isInteger(idOs) && idOs > 0;
  const numeroObjetivo = Number.isInteger(Number(params.objetivo)) && Number(params.objetivo) > 0 ? Number(params.objetivo) : null;

  const [texto, setTexto] = useState('');
  const [buscar, setBuscar] = useState('');
  const [escaner, setEscaner] = useState(false);
  const [ocupado, setOcupado] = useState<number | null>(null);
  const [mensaje, setMensaje] = useState<{ tipo: 'error' | 'info'; texto: string } | null>(null);
  const [leido, setLeido] = useState<{ codigo: string; equipo: ObjetivoEquipo } | null>(null);
  const [noEncontrado, setNoEncontrado] = useState(false);

  // Filtra al dejar de escribir (no en cada tecla)
  useEffect(() => {
    const t = setTimeout(() => setBuscar(texto.trim()), 250);
    return () => clearTimeout(t);
  }, [texto]);

  const { datos, cargando, error } = useConsulta(async (token) => {
    if (!idValido) throw new ErrorApi('Servicio no válido.', 400, 1);
    const [r, cargos] = await Promise.all([obtenerObjetivosConRespaldo(token, idUsuario, idOs), obtenerCatalogo(token, 'CARGO_USUARIO').catch(() => undefined)]);
    return { objetivos: r.datos, cargos };
  }, `${params.id ?? ''}`);

  const pendientes = useAccionesEquipos(idUsuario, idOs);
  const vista = useMemo(() => (datos ? aplicarPendientes(datos.objetivos, pendientes) : null), [datos, pendientes]);
  const cargo = nombreDeCodigo(datos?.cargos, usuario?.cargo) ?? usuario?.cargo ?? 'Técnico de Campo';
  const equipos = useMemo(() => (vista ? conObjetivoPrimero(filtrarEquipos(vista.equipos, buscar), numeroObjetivo) : []), [vista, buscar, numeroObjetivo]);
  const numeroOs = vista?.resumen.numeroOs.replace(/^OS-?/i, '') ?? '';

  async function alLeerQr(contenido: string) {
    setEscaner(false);
    if (!sesion || !vista) return;
    setMensaje(null);
    setNoEncontrado(false);
    const codigo = contenido.trim().slice(0, 300);
    try {
      const e = await buscarEquipoPorQr(sesion.token, idOs, codigo);
      // Se muestra con el estado de la lista (incluye lo guardado sin conexión)
      setLeido({ codigo, equipo: vista.equipos.find((x) => x.idOsEquipo === e.idOsEquipo) ?? e });
    } catch (err) {
      if (err instanceof ErrorApi && err.estadoHttp === 0) {
        // Sin conexión: la misma regla del servidor sobre la lista guardada
        const local = buscarPorCodigo(vista.equipos, codigo);
        if (local) return setLeido({ codigo, equipo: local });
      }
      setLeido(null);
      setNoEncontrado(true);
      setMensaje({ tipo: 'error', texto: err instanceof Error ? err.message : 'No se pudo leer el código.' });
    }
  }

  async function seleccionar(e: ObjetivoEquipo) {
    if (!sesion || !vista || ocupado) return;
    setOcupado(e.idOsEquipo);
    setMensaje(null);
    try {
      await accionEquipoOEncolar(
        sesion.token,
        { idUsuario, idOs, numeroOs: vista.resumen.numeroOs, equipo: e.codigoCliente?.trim() || e.numeroSerie?.trim() || e.nombre },
        vista,
        e.idOsEquipo,
        e.estado === 'pausado' ? 'reanudar' : 'iniciar',
      );
      router.back();
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err instanceof Error ? err.message : 'No se pudo seleccionar el equipo.' });
    } finally {
      setOcupado(null);
    }
  }

  const irANuevo = () => router.push({ pathname: '/equipo-nuevo', params: { id: String(idOs), objetivo: numeroObjetivo ? String(numeroObjetivo) : undefined } });

  return (
    <SafeAreaView style={estilos.area} edges={['top']}>
      <EncabezadoApp nombre={usuario?.nombre ?? ''} apellido={usuario?.apellido} subtitulo={`${usuario?.nombre ?? ''} · ${cargo}`} />
      <ScrollView contentContainerStyle={[estilos.contenido, { paddingHorizontal: d.margen, maxWidth: d.anchoMaximo }]} keyboardShouldPersistTaps="handled">
        <View style={estilos.tituloFila}>
          <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Volver">
            <Ionicons name="arrow-back" size={24} color={colores.titulo} />
          </Pressable>
          <Text style={[estilos.titulo, { fontSize: d.tituloPantalla }]} accessibilityRole="header">
            Selección de equipo
          </Text>
        </View>
        {!!numeroOs && (
          <Text style={estilos.subtitulo}>
            O/S {numeroOs}
            {numeroObjetivo ? ` · Objetivo ${numeroObjetivo}` : ''}
          </Text>
        )}

        <View style={estilos.indicacion}>
          <Text style={estilos.indicacionTexto}>Seleccione el equipo/instrumento a intervenir</Text>
        </View>

        <View style={estilos.herramientas}>
          <View style={estilos.buscador}>
            <Ionicons name="search" size={18} color={colores.textoSecundario} />
            <TextInput
              value={texto}
              onChangeText={(t) => {
                setTexto(t.slice(0, 100));
                setLeido(null);
              }}
              placeholder="Buscar N/S, Cod, CodTW, Marca…"
              placeholderTextColor={colores.placeholder}
              style={estilos.buscadorCampo}
              autoCapitalize="characters"
              autoCorrect={false}
              testID="buscar-equipo"
            />
            {!!texto && (
              <Pressable onPress={() => setTexto('')} hitSlop={10} accessibilityLabel="Limpiar búsqueda">
                <Ionicons name="close-circle" size={18} color={colores.textoTenue} />
              </Pressable>
            )}
          </View>
          <Pressable onPress={() => setEscaner(true)} style={estilos.botonQr} accessibilityRole="button" accessibilityLabel="Escanear código de barras o QR" testID="escanear-qr">
            <Ionicons name="scan-outline" size={24} color={colores.blanco} />
          </Pressable>
          <Pressable onPress={irANuevo} style={estilos.botonNuevo} accessibilityRole="button" accessibilityLabel="Registrar un equipo nuevo" testID="equipo-new">
            <Text style={estilos.botonNuevoTexto}>NEW</Text>
          </Pressable>
        </View>

        {mensaje && (
          <View style={{ marginTop: 12 }} testID="mensaje-seleccion">
            <Aviso tipo={mensaje.tipo} mensaje={mensaje.texto} />
            {noEncontrado && (
              <View style={{ marginTop: 8 }}>
                <Boton titulo="Registrar como equipo nuevo (NEW)" variante="secundario" onPress={irANuevo} />
              </View>
            )}
          </View>
        )}

        {leido && (
          <View style={estilos.leido} testID="equipo-leido">
            <View style={estilos.leidoCodigo}>
              <Ionicons name="checkmark-circle" size={16} color={colores.blanco} />
              <Text style={estilos.leidoCodigoTexto}>Código leído · {leido.codigo}</Text>
            </View>
            <Text style={estilos.leidoTitulo}>{`N/S: ${leido.equipo.numeroSerie ?? '—'} | COD: ${leido.equipo.codigoCliente ?? '—'}`}</Text>
            <Text style={estilos.nota}>{[[leido.equipo.marca, leido.equipo.modelo].filter(Boolean).join(' '), leido.equipo.ubicacion].filter(Boolean).join(' · ')}</Text>
            <View style={estilos.encontrado}>
              <Ionicons name="checkmark-circle" size={20} color={colores.exito} />
              <Text style={estilos.encontradoTexto}>Equipo encontrado en la lista de la O/S.</Text>
            </View>
            <View style={estilos.botones}>
              <View style={{ flex: 1 }}>
                <Boton titulo="Escanear otro" variante="secundario" onPress={() => setEscaner(true)} />
              </View>
              <View style={{ flex: 1 }}>
                <Boton
                  titulo="Seleccionar"
                  onPress={() => void seleccionar(leido.equipo)}
                  cargando={ocupado === leido.equipo.idOsEquipo}
                  deshabilitado={!(leido.equipo.puedeIniciar || leido.equipo.puedeReanudar) || ocupado !== null}
                />
              </View>
            </View>
          </View>
        )}

        {cargando ? (
          <ActivityIndicator color={colores.primario} style={{ marginTop: 30 }} />
        ) : error || !vista ? (
          <View style={{ marginTop: 12 }}>
            <Aviso tipo="error" mensaje={error ?? 'No se encontró el servicio.'} />
          </View>
        ) : !vista.resumen.llegadaRegistrada ? (
          <View style={{ marginTop: 12 }}>
            <Aviso tipo="error" mensaje="No puedes continuar: primero registra tu llegada a planta." />
          </View>
        ) : equipos.length === 0 ? (
          <View style={{ marginTop: 12 }}>
            <Aviso mensaje={buscar ? 'Ningún equipo de esta OS coincide con la búsqueda. Si no está en la lista, regístralo con NEW.' : 'La orden de servicio no tiene equipos asignados.'} />
          </View>
        ) : (
          equipos.map((e, i) => (
            <TarjetaEquipo key={e.idOsEquipo} e={e} posicion={i + 1} ocupado={ocupado === e.idOsEquipo} bloqueaOtros={ocupado !== null} onSeleccionar={() => void seleccionar(e)} />
          ))
        )}
      </ScrollView>

      <CamaraApp visible={escaner} modo="qr" onCerrar={() => setEscaner(false)} onQr={(c) => void alLeerQr(c)} />
    </SafeAreaView>
  );
}

/** Lo que dice el botón de la tarjeta según el estado del equipo. */
function textoBoton(e: ObjetivoEquipo): string {
  if (e.bloqueado) return 'Bloqueado';
  if (e.estado === 'en_ejecucion') return 'En ejecución';
  if (e.estado === 'completado') return 'Completado';
  if (e.estado === 'pausado') return e.puedeReanudar ? 'Reanudar' : 'Pausado';
  return 'Seleccionar';
}

function TarjetaEquipo({ e, posicion, ocupado, bloqueaOtros, onSeleccionar }: { e: ObjetivoEquipo; posicion: number; ocupado: boolean; bloqueaOtros: boolean; onSeleccionar: () => void }) {
  const habilitado = !e.bloqueado && (e.puedeIniciar || e.puedeReanudar);
  const gris = e.bloqueado;
  return (
    <View style={[estilos.tarjeta, gris && estilos.tarjetaBloqueada]} testID={`equipo-${e.idOsEquipo}`}>
      <Text style={[estilos.tarjetaTitulo, gris && { color: colores.textoSecundario }]}>{`${posicion}. N/S: ${e.numeroSerie ?? '—'} | COD: ${e.codigoCliente ?? '—'}`}</Text>
      <Text style={estilos.lineaTexto}>COD TW: {e.codigoTw ?? '—'}</Text>
      <Text style={estilos.nota}>
        Marca: {e.marca ?? '—'} | Modelo: {e.modelo ?? '—'}
      </Text>
      <Text style={estilos.nota}>Ubicación: {e.ubicacion ?? '—'}</Text>
      {e.enCampo && <Text style={estilos.nota}>Equipo nuevo · pendiente de aprobación en la intranet</Text>}
      <View style={{ marginTop: 12 }}>
        {gris ? (
          <View style={estilos.bloqueado} accessibilityState={{ disabled: true }}>
            <Ionicons name="lock-closed-outline" size={18} color={colores.textoTenue} />
            <Text style={estilos.bloqueadoTexto}>Bloqueado</Text>
          </View>
        ) : (
          <Boton titulo={textoBoton(e)} onPress={onSeleccionar} cargando={ocupado} deshabilitado={!habilitado || bloqueaOtros} />
        )}
      </View>
    </View>
  );
}

const estilos = StyleSheet.create({
  area: { flex: 1, backgroundColor: colores.fondo },
  contenido: { paddingTop: 18, paddingBottom: 28, width: '100%', alignSelf: 'center' },
  tituloFila: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4 },
  titulo: { fontWeight: '700', color: colores.titulo, flexShrink: 1 },
  subtitulo: { color: colores.textoSecundario, fontSize: 14, marginBottom: 12 },
  indicacion: { backgroundColor: colores.blanco, borderWidth: 1, borderColor: colores.bordeSuave, borderRadius: radios.tarjeta, padding: 16, alignItems: 'center' },
  indicacionTexto: { fontSize: 15, fontWeight: '600', color: colores.titulo, textAlign: 'center' },
  herramientas: { flexDirection: 'row', gap: 8, marginTop: 12, alignItems: 'stretch' },
  buscador: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: colores.borde,
    borderRadius: radios.campo,
    backgroundColor: colores.blanco,
    paddingHorizontal: 12,
  },
  buscadorCampo: { flex: 1, paddingVertical: 12, fontSize: 14.5, color: colores.texto },
  botonQr: { width: 52, borderRadius: radios.boton, backgroundColor: colores.primario, alignItems: 'center', justifyContent: 'center' },
  botonNuevo: { minWidth: 58, borderRadius: radios.boton, borderWidth: 1.5, borderColor: colores.primario, backgroundColor: colores.blanco, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  botonNuevoTexto: { color: colores.primario, fontWeight: '800', fontSize: 14 },
  tarjeta: { marginTop: 12, backgroundColor: colores.blanco, borderWidth: 1, borderColor: colores.bordeSuave, borderRadius: radios.tarjeta, padding: 16 },
  tarjetaBloqueada: { backgroundColor: '#FAFBFD' },
  tarjetaTitulo: { fontSize: 16.5, fontWeight: '700', color: colores.titulo },
  lineaTexto: { fontSize: 14.5, color: colores.texto, marginTop: 3 },
  nota: { fontSize: 13.5, color: colores.textoSecundario, marginTop: 3 },
  bloqueado: { minHeight: 50, borderRadius: radios.boton, backgroundColor: '#E5E9F0', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  bloqueadoTexto: { color: colores.textoTenue, fontWeight: '600', fontSize: 16 },
  leido: { marginTop: 12, backgroundColor: colores.blanco, borderWidth: 1, borderColor: colores.verdeBorde, borderRadius: radios.tarjeta, padding: 16 },
  leidoCodigo: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colores.verde, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5, marginBottom: 10 },
  leidoCodigoTexto: { color: colores.blanco, fontWeight: '700', fontSize: 13 },
  leidoTitulo: { fontSize: 17, fontWeight: '700', color: colores.titulo },
  encontrado: { marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colores.verdeFondo, borderWidth: 1, borderColor: colores.verdeBorde, borderRadius: 10, padding: 10 },
  encontradoTexto: { color: colores.titulo, fontSize: 14, flexShrink: 1 },
  botones: { flexDirection: 'row', gap: 10, marginTop: 12 },
});
