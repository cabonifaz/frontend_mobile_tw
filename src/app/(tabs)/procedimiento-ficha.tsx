import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  estaDescargado,
  etiquetaTipo,
  fechaDMA,
  obtenerBiblioteca,
  ProcedimientoNoDescargado,
  quitarDescarga,
  textoTamano,
  verProcedimiento,
} from '@/api/procedimientos';
import { Aviso } from '@/componentes/Aviso';
import { Boton } from '@/componentes/Boton';
import { EncabezadoApp } from '@/componentes/EncabezadoApp';
import { useConsulta } from '@/hooks/useConsulta';
import { useDiseno } from '@/hooks/useDiseno';
import { useSesion } from '@/sesion/SesionContext';
import { colores, radios } from '@/tema/colores';
import { avisar, confirmar } from '@/utilidades/dialogos';

/**
 * HU-24 — Ficha del procedimiento: versión vigente, norma, alcance, quién lo aprobó, historial de versiones (las anteriores ya no se pueden usar)
 * y el archivo. «Ver procedimiento» abre el PDF con el lector del teléfono; «Quitar del teléfono» borra solo la copia local.
 */
export default function PantallaProcedimientoFicha() {
  const { sesion } = useSesion();
  const usuario = sesion?.usuario;
  const token = sesion?.token ?? '';
  const d = useDiseno();
  const params = useLocalSearchParams<{ id?: string }>();
  const id = Number(params.id);
  const [abriendo, setAbriendo] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: 'error' | 'info'; texto: string } | null>(null);
  const [marca, setMarca] = useState(0);

  const { datos, cargando, error } = useConsulta((t) => obtenerBiblioteca(t, usuario?.idUsuario ?? 0), `${usuario?.idUsuario ?? 0}`);
  const p = datos?.datos.find((x) => x.idProcedimiento === id) ?? null;
  const sinConexion = !!datos?.sinConexion;
  const offline = useMemo(() => {
    void marca;
    return p ? estaDescargado(p) : false;
  }, [p, marca]);

  async function ver() {
    if (!p) return;
    setMensaje(null);
    setAbriendo(true);
    try {
      await verProcedimiento(token, p, sinConexion);
      setMarca((m) => m + 1);
    } catch (e) {
      if (e instanceof ProcedimientoNoDescargado) avisar('No está en tu teléfono', e.message);
      else setMensaje({ tipo: 'error', texto: e instanceof Error ? e.message : 'No se pudo abrir el procedimiento.' });
    } finally {
      setAbriendo(false);
    }
  }

  async function quitar() {
    if (!p) return;
    if (await confirmar('¿Quitar del teléfono?', 'Se borrará la copia guardada de este PDF. Podrás volver a descargarlo con conexión.', 'Quitar')) {
      quitarDescarga(p);
      setMarca((m) => m + 1);
    }
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
            Ficha del procedimiento
          </Text>
        </View>
        {!!p && (
          <Text style={estilos.subtitulo}>
            {p.codigo} · Versión {p.version}
          </Text>
        )}

        {cargando ? (
          <ActivityIndicator color={colores.primario} style={{ marginTop: 32 }} />
        ) : error ? (
          <Aviso tipo="error" mensaje={error} />
        ) : !p ? (
          <Aviso tipo="error" mensaje="No se encontró el procedimiento. Puede que ya no esté aprobado." />
        ) : (
          <>
            <View style={estilos.tarjeta} testID="ficha-cabecera">
              <View style={estilos.cabecera}>
                <Text style={estilos.tipo}>{etiquetaTipo(p.tipo) ? `PROCEDIMIENTO · ${etiquetaTipo(p.tipo).toUpperCase()}` : 'PROCEDIMIENTO'}</Text>
                <View style={[estilos.etiqueta, { backgroundColor: offline ? colores.verdeEtiquetaFondo : colores.grisFondo }]}>
                  <Text style={[estilos.etiquetaTexto, { color: offline ? colores.verdeEtiquetaTexto : colores.grisTexto }]}>
                    {offline ? 'DISPONIBLE OFFLINE' : 'SOLO ONLINE'}
                  </Text>
                </View>
              </View>
              <Text style={estilos.codigo}>{p.codigo}</Text>
              <Text style={estilos.descripcion}>{p.descripcion}</Text>
            </View>

            <View style={[estilos.tarjeta, estilos.datos]}>
              <Dato k="VERSIÓN" v={`${p.version} · vigente`} />
              <Dato k="AÑO" v={String(p.anio)} />
              <Dato k="AUTOR / NORMA" v={p.autorNorma} />
              <Dato k="NORMA BASE" v={p.normaBase} />
              <Dato k="FORMATO DIGITAL ISO" v={p.formatoDigitalIso ? 'Sí' : 'No'} />
              <Dato k="ALCANCE" v={p.alcance} />
              <Dato k="APROBADO POR" v={p.aprobadoPor} />
              <Dato k="ACTUALIZADO" v={fechaDMA(p.actualizado)} />
            </View>

            <Text style={estilos.seccion}>HISTORIAL DE VERSIONES</Text>
            <View style={estilos.tarjeta} testID="ficha-historial">
              <FilaVersion version={p.version} detalle={`Actualizado ${fechaDMA(p.actualizado)}${offline ? ' · se reemplazó solo en el teléfono' : ''}`} vigente />
              {p.historial.map((h) => (
                <FilaVersion key={h.version} version={h.version} detalle={`${h.reemplazadaEl ? `Reemplazada el ${fechaDMA(h.reemplazadaEl)} · ` : ''}ya no se puede usar`} />
              ))}
            </View>

            <View style={[estilos.tarjeta, estilos.archivo]}>
              <Ionicons name="document-text" size={30} color="#DC2626" />
              <View style={{ flex: 1 }}>
                <Text style={estilos.archivoNombre}>{p.pdfNombre ?? `${p.codigo}.pdf`}</Text>
                <Text style={estilos.archivoSub}>
                  {[textoTamano(p.pdfTamanoBytes), offline ? 'PDF guardado en el teléfono' : 'PDF por descargar'].filter(Boolean).join(' · ')}
                </Text>
              </View>
            </View>

            {!!mensaje && <Aviso tipo={mensaje.tipo} mensaje={mensaje.texto} />}
            <Boton titulo={offline ? 'Ver procedimiento' : 'Descargar y ver'} onPress={() => void ver()} cargando={abriendo} deshabilitado={abriendo} />
            {offline && (
              <Pressable onPress={() => void quitar()} accessibilityRole="button" style={estilos.quitar} testID="quitar-descarga">
                <Ionicons name="trash-outline" size={16} color={colores.textoSecundario} />
                <Text style={estilos.quitarTexto}>Quitar del teléfono</Text>
              </Pressable>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Dato({ k, v }: { k: string; v: string | null }) {
  if (!v) return null;
  return (
    <View style={estilos.dato}>
      <Text style={estilos.datoK}>{k}</Text>
      <Text style={estilos.datoV}>{v}</Text>
    </View>
  );
}

function FilaVersion({ version, detalle, vigente = false }: { version: number; detalle: string; vigente?: boolean }) {
  return (
    <View style={estilos.fila}>
      <View style={{ flex: 1 }}>
        <Text style={[estilos.filaTitulo, !vigente && { color: colores.textoTenue }]}>Versión {version}</Text>
        <Text style={estilos.filaDetalle}>{detalle}</Text>
      </View>
      <View style={[estilos.etiqueta, { backgroundColor: vigente ? colores.verdeEtiquetaFondo : colores.grisFondo }]}>
        <Text style={[estilos.etiquetaTexto, { color: vigente ? colores.verdeEtiquetaTexto : colores.grisTexto }]}>{vigente ? 'VIGENTE' : 'REEMPLAZADA'}</Text>
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
  tarjeta: { backgroundColor: colores.tarjeta, borderRadius: radios.tarjeta, borderWidth: 1, borderColor: colores.bordeSuave, padding: 14, gap: 4 },
  cabecera: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  tipo: { fontSize: 10.5, fontWeight: '700', letterSpacing: 0.6, color: colores.textoSecundario, flexShrink: 1 },
  codigo: { fontSize: 22, fontWeight: '800', color: colores.titulo },
  descripcion: { fontSize: 15, color: colores.texto, lineHeight: 21 },
  etiqueta: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  etiquetaTexto: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.4 },
  datos: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  dato: { width: '47%', flexGrow: 1, gap: 2 },
  datoK: { fontSize: 10.5, fontWeight: '700', letterSpacing: 0.8, color: colores.textoSecundario },
  datoV: { fontSize: 14.5, color: colores.titulo, lineHeight: 20 },
  seccion: { fontSize: 11.5, fontWeight: '800', letterSpacing: 1, color: colores.textoSecundario, marginTop: 6 },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  filaTitulo: { fontSize: 14.5, fontWeight: '700', color: colores.titulo },
  filaDetalle: { fontSize: 12.5, color: colores.textoSecundario, marginTop: 1 },
  archivo: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  archivoNombre: { fontSize: 14.5, fontWeight: '700', color: colores.titulo },
  archivoSub: { fontSize: 12.5, color: colores.textoSecundario },
  quitar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 10 },
  quitarTexto: { fontSize: 14, color: colores.textoSecundario },
});
