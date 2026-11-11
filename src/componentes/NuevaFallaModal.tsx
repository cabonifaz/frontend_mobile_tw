import { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { urlArchivoEvidencia } from '@/api/evidencias';
import { subirFotoFalla, type OpcionInforme } from '@/api/informe';
import { Aviso } from '@/componentes/Aviso';
import { CamaraApp } from '@/componentes/CamaraApp';
import { Selector } from '@/componentes/Selector';
import { colores, radios } from '@/tema/colores';
import { formatoMiles } from '@/utilidades/ensayos';
import {
  MAX_DESCRIPCION_FALLA,
  MAX_FOTOS_FALLA,
  MAX_LECTURAS_PRUEBA,
  SEVERIDADES,
  TIPOS_PRUEBA,
  calcularLecturas,
  conCarga,
  conTipo,
  errorFalla,
  lecturasIniciales,
  notaPrueba,
  textoErrorEmp,
  textoPosicion,
  type FallaEditable,
} from '@/utilidades/informe';

interface Props {
  visible: boolean;
  token: string;
  idOs: number;
  idOsEquipo: number;
  /** Clase de exactitud y e del equipo: con ellos el EMP se calcula como en Ensayos y Calibración. */
  clase: string | null;
  e: number | null;
  unidad: string;
  clasificaciones: OpcionInforme[];
  componentes: OpcionInforme[];
  /** La falla que se edita (vacía para una nueva). */
  inicial: FallaEditable;
  esNueva: boolean;
  onGuardar: (f: FallaEditable) => void;
  onCerrar: () => void;
}

/**
 * HU-15 — "Nueva falla": clasificación*, componente*, severidad*, descripción*, fotos y la prueba que la justifica* (Repetibilidad / Pesaje / Excentricidad):
 * el técnico digita L e I y el sistema calcula E = I − L y marca en rojo las lecturas fuera de EMP. REGLA: no se guarda una falla sin su prueba.
 * Las fotos se toman con la cámara de la app y se suben al momento (exigen conexión); al guardar la cabecera quedan vinculadas a la falla.
 */
export function NuevaFallaModal(props: Props) {
  if (!props.visible) return null;
  return (
    <Modal visible animationType="slide" transparent onRequestClose={props.onCerrar}>
      <View style={estilos.velo}>
        <Contenido {...props} />
      </View>
    </Modal>
  );
}

function Contenido({ token, idOs, idOsEquipo, clase, e, unidad, clasificaciones, componentes, inicial, esNueva, onGuardar, onCerrar }: Props) {
  const [f, setF] = useState<FallaEditable>(inicial);
  const [error, setError] = useState<string | null>(null);
  const [camara, setCamara] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const cerrada = useRef(false);

  const filas = useMemo(() => calcularLecturas(clase, e, f.lecturas), [clase, e, f.lecturas]);
  const opcionesComponente = useMemo(
    () => componentes.filter((c) => !f.clasificacion || c.clasificacion === f.clasificacion).map((c) => ({ valor: c.codigo, texto: c.nombre })),
    [componentes, f.clasificacion],
  );

  function guardar() {
    const mensaje = errorFalla(f);
    if (mensaje) return setError(mensaje);
    cerrada.current = true;
    onGuardar(f);
  }

  async function alFoto(uri: string) {
    setCamara(false);
    if (f.fotos.length >= MAX_FOTOS_FALLA) return setError(`Una falla admite hasta ${MAX_FOTOS_FALLA} fotos.`);
    setSubiendo(true);
    setError(null);
    try {
      const id = await subirFotoFalla(token, idOs, idOsEquipo, uri);
      if (!cerrada.current) setF((x) => ({ ...x, fotos: [...x.fotos, id] }));
    } catch (err) {
      setError(err instanceof Error ? `${err.message} Las fotos de las fallas exigen conexión.` : 'No se pudo subir la foto.');
    } finally {
      setSubiendo(false);
    }
  }

  const actualizarLectura = (i: number, campo: 'carga' | 'indicacion', texto: string) =>
    campo === 'carga' ? setF((x) => conCarga(x, i, texto)) : setF((x) => ({ ...x, lecturas: x.lecturas.map((l, j) => (j === i ? { ...l, indicacion: texto } : l)) }));

  return (
    <SafeAreaView style={estilos.hoja} edges={['bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flexShrink: 1 }}>
        <View style={estilos.asa} />
        <View style={estilos.cabecera}>
          <Text style={estilos.titulo}>{esNueva ? 'Nueva falla' : 'Editar falla'}</Text>
          <Pressable onPress={onCerrar} hitSlop={12} accessibilityRole="button" accessibilityLabel="Cerrar" testID="cerrar-falla">
            <Ionicons name="close" size={26} color={colores.titulo} />
          </Pressable>
        </View>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 18, paddingTop: 4, gap: 14 }}>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Selector
                etiqueta="Clasificación *"
                placeholder="Elige"
                opciones={clasificaciones.map((c) => ({ valor: c.codigo, texto: c.nombre }))}
                valor={f.clasificacion}
                onCambio={(v) => setF((x) => ({ ...x, clasificacion: v, componente: x.clasificacion === v ? x.componente : null }))}
                testID="falla-clasificacion"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Selector etiqueta="Componente *" placeholder="Elige" opciones={opcionesComponente} valor={f.componente} onCambio={(v) => setF((x) => ({ ...x, componente: v }))} testID="falla-componente" />
            </View>
          </View>

          <View>
            <Text style={estilos.etiqueta}>Severidad *</Text>
            <View style={estilos.segmentos}>
              {SEVERIDADES.map((s) => (
                <Pressable
                  key={s.valor}
                  onPress={() => setF((x) => ({ ...x, severidad: s.valor }))}
                  style={[estilos.segmento, f.severidad === s.valor && (s.valor === 'alta' ? estilos.segmentoNaranja : s.valor === 'critica' ? estilos.segmentoRojo : estilos.segmentoActivo)]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: f.severidad === s.valor }}
                  testID={`severidad-${s.valor}`}
                >
                  <Text style={[estilos.segmentoTexto, f.severidad === s.valor && { color: colores.blanco }]}>{s.texto}</Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View>
            <Text style={estilos.etiqueta}>Descripción *</Text>
            <TextInput
              value={f.descripcion}
              onChangeText={(t) => setF((x) => ({ ...x, descripcion: t.slice(0, MAX_DESCRIPCION_FALLA) }))}
              placeholder="Qué se encontró y dónde"
              placeholderTextColor={colores.placeholder}
              multiline
              style={estilos.descripcion}
              testID="falla-descripcion"
            />
          </View>

          <View>
            <Text style={estilos.etiqueta}>Prueba que la justifica *</Text>
            <View style={estilos.segmentos}>
              {TIPOS_PRUEBA.map((t) => (
                <Pressable
                  key={t.valor}
                  onPress={() => setF((x) => conTipo(x, t.valor))}
                  style={[estilos.segmento, f.tipo === t.valor && estilos.segmentoActivo]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: f.tipo === t.valor }}
                  testID={`prueba-${t.valor}`}
                >
                  <Text style={[estilos.segmentoTexto, f.tipo === t.valor && { color: colores.blanco }]}>{t.texto}</Text>
                </Pressable>
              ))}
            </View>

            <View style={estilos.tabla}>
              <View style={estilos.filaTabla}>
                <Text style={[estilos.celdaK, { flex: 1.1 }]}>{f.tipo === 'excentricidad' ? 'Pos.' : `L (${unidad})`}</Text>
                {f.tipo === 'excentricidad' && <Text style={[estilos.celdaK, { flex: 1.1 }]}>{`L (${unidad})`}</Text>}
                <Text style={[estilos.celdaK, { flex: 1.1 }]}>{`I (${unidad})`}</Text>
                <Text style={[estilos.celdaK, { flex: 0.8 }]}>E</Text>
                <Text style={[estilos.celdaK, { flex: 0.9 }]}>EMP</Text>
                <View style={{ width: 24 }} />
              </View>
              {f.lecturas.map((l, i) => {
                const c = filas[i];
                const fuera = c.resultado === 'no_conforme';
                const { error: txtE, emp: txtEmp } = textoErrorEmp(c.error, c.emp);
                return (
                  <View key={i} style={[estilos.filaTabla, fuera && { backgroundColor: '#FEF2F2' }]} testID={`lectura-${i + 1}`}>
                    {f.tipo === 'excentricidad' && <Text style={[estilos.celdaTexto, { flex: 1.1 }]}>{textoPosicion(l.posicion)}</Text>}
                    <TextInput
                      value={l.carga}
                      onChangeText={(t) => actualizarLectura(i, 'carga', t)}
                      keyboardType="decimal-pad"
                      placeholder="0"
                      placeholderTextColor={colores.placeholder}
                      style={[estilos.entrada, { flex: 1.1 }]}
                      testID={`lectura-${i + 1}-l`}
                    />
                    <TextInput
                      value={l.indicacion}
                      onChangeText={(t) => actualizarLectura(i, 'indicacion', t)}
                      keyboardType="decimal-pad"
                      placeholder="0"
                      placeholderTextColor={colores.placeholder}
                      style={[estilos.entrada, { flex: 1.1 }]}
                      testID={`lectura-${i + 1}-i`}
                    />
                    <Text style={[estilos.celdaTexto, { flex: 0.8, fontWeight: '800' }, fuera && { color: colores.rojo }]}>{c.error === null ? '—' : txtE}</Text>
                    <Text style={[estilos.celdaTexto, { flex: 0.9 }]}>{txtEmp}</Text>
                    {f.lecturas.length > 1 ? (
                      <Pressable onPress={() => setF((x) => ({ ...x, lecturas: x.lecturas.filter((_, j) => j !== i) }))} hitSlop={8} accessibilityRole="button" accessibilityLabel="Quitar lectura">
                        <Ionicons name="close-circle" size={22} color={colores.rojo} />
                      </Pressable>
                    ) : (
                      <View style={{ width: 22 }} />
                    )}
                  </View>
                );
              })}
            </View>
            {f.lecturas.length < MAX_LECTURAS_PRUEBA && f.tipo !== 'pesaje' && (
              <Pressable
                onPress={() =>
                  setF((x) => ({
                    ...x,
                    lecturas: [
                      ...x.lecturas,
                      { posicion: x.tipo === 'excentricidad' ? Math.min(9, Math.max(...x.lecturas.map((l) => l.posicion ?? 1)) + 1) : null, carga: x.tipo === 'repetibilidad' ? (x.lecturas[0]?.carga ?? '') : '', indicacion: '' },
                    ],
                  }))
                }
                style={estilos.enlace}
                accessibilityRole="button"
                testID="agregar-lectura"
              >
                <Ionicons name="add-circle-outline" size={20} color={colores.primario} />
                <Text style={estilos.enlaceTexto}>Agregar lectura</Text>
              </Pressable>
            )}
            <View style={estilos.nota}>
              <Ionicons name="calculator-outline" size={16} color={colores.textoSecundario} />
              <Text style={estilos.notaTexto}>{notaPrueba(f.tipo, filas)}</Text>
            </View>
            {f.tipo === 'pesaje' && f.lecturas.length < MAX_LECTURAS_PRUEBA && (
              <Pressable onPress={() => setF((x) => ({ ...x, lecturas: [...x.lecturas, ...lecturasIniciales('pesaje')] }))} style={estilos.enlace} accessibilityRole="button" testID="agregar-lectura-pesaje">
                <Ionicons name="add-circle-outline" size={20} color={colores.primario} />
                <Text style={estilos.enlaceTexto}>Agregar carga de pesaje</Text>
              </Pressable>
            )}
          </View>

          {f.fotos.length > 0 && (
            <View style={estilos.fotos} testID="fotos-falla">
              {f.fotos.map((id) => (
                <View key={id} style={estilos.foto}>
                  <Image source={{ uri: urlArchivoEvidencia(idOs, idOsEquipo, id), headers: { Authorization: `Bearer ${token}` } }} style={StyleSheet.absoluteFill} resizeMode="cover" accessibilityLabel="Foto de la falla" />
                  <Pressable onPress={() => setF((x) => ({ ...x, fotos: x.fotos.filter((y) => y !== id) }))} style={estilos.quitarFoto} accessibilityRole="button" accessibilityLabel="Quitar foto">
                    <Ionicons name="close" size={14} color={colores.blanco} />
                  </Pressable>
                </View>
              ))}
            </View>
          )}

          {!!error && <Aviso tipo="error" mensaje={error} />}

          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Pressable
              onPress={() => setCamara(true)}
              disabled={subiendo || f.fotos.length >= MAX_FOTOS_FALLA}
              style={[estilos.botonFoto, (subiendo || f.fotos.length >= MAX_FOTOS_FALLA) && { opacity: 0.5 }]}
              accessibilityRole="button"
              testID="foto-falla"
            >
              {subiendo ? <ActivityIndicator color={colores.primario} /> : <Ionicons name="camera-outline" size={22} color={colores.primario} />}
              <Text style={estilos.botonFotoTexto}>{f.fotos.length > 0 ? `Foto (${f.fotos.length})` : 'Foto'}</Text>
            </Pressable>
            <Pressable onPress={guardar} style={estilos.botonGuardar} accessibilityRole="button" testID="guardar-falla">
              <Text style={estilos.botonGuardarTexto}>Guardar falla</Text>
            </Pressable>
          </View>
          <Text style={estilos.pie}>
            {clase ? `EMP según la clase ${clase}${e ? ` y e = ${formatoMiles(e)} ${unidad}` : ''}.` : 'El equipo no tiene clase de exactitud: el EMP no se puede evaluar.'}
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
      <CamaraApp visible={camara} modo="foto" onCerrar={() => setCamara(false)} onFoto={(uri) => void alFoto(uri)} />
    </SafeAreaView>
  );
}

const estilos = StyleSheet.create({
  velo: { flex: 1, backgroundColor: 'rgba(2,6,23,0.55)', justifyContent: 'flex-end' },
  hoja: { backgroundColor: colores.blanco, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '92%' },
  asa: { alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: colores.borde, marginTop: 10 },
  cabecera: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingVertical: 12 },
  titulo: { fontSize: 22, fontWeight: '800', color: colores.titulo },
  etiqueta: { fontSize: 15.5, fontWeight: '700', color: colores.titulo, marginBottom: 6 },
  segmentos: { flexDirection: 'row', gap: 8 },
  segmento: { flex: 1, minHeight: 46, borderRadius: 10, borderWidth: 1, borderColor: colores.borde, alignItems: 'center', justifyContent: 'center', backgroundColor: colores.blanco },
  segmentoActivo: { backgroundColor: colores.primario, borderColor: colores.primario },
  segmentoNaranja: { backgroundColor: '#EA580C', borderColor: '#EA580C' },
  segmentoRojo: { backgroundColor: colores.rojo, borderColor: colores.rojo },
  segmentoTexto: { fontSize: 15, fontWeight: '700', color: colores.titulo },
  descripcion: { borderWidth: 1, borderColor: colores.borde, borderRadius: radios.campo, padding: 12, fontSize: 16, minHeight: 84, textAlignVertical: 'top', color: colores.texto },
  tabla: { marginTop: 10, borderWidth: 1, borderColor: colores.bordeSuave, borderRadius: 12, overflow: 'hidden' },
  filaTabla: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colores.bordeSuave },
  celdaK: { fontSize: 12.5, fontWeight: '800', color: colores.textoSecundario, textAlign: 'center' },
  celdaTexto: { fontSize: 15, color: colores.titulo, textAlign: 'center' },
  entrada: { minHeight: 42, borderWidth: 1, borderColor: colores.borde, borderRadius: 8, textAlign: 'center', fontSize: 16, color: colores.texto, paddingHorizontal: 4 },
  enlace: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 10 },
  enlaceTexto: { color: colores.primario, fontWeight: '700', fontSize: 16 },
  nota: { flexDirection: 'row', gap: 6, alignItems: 'center', marginTop: 4 },
  notaTexto: { flex: 1, fontSize: 13.5, color: colores.textoSecundario, lineHeight: 18 },
  fotos: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  foto: { width: 72, height: 72, borderRadius: 10, overflow: 'hidden', backgroundColor: colores.grisFondo },
  quitarFoto: { position: 'absolute', top: 3, right: 3, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(0,0,0,0.65)', alignItems: 'center', justifyContent: 'center' },
  botonFoto: { flex: 1, minHeight: 54, borderRadius: radios.boton, borderWidth: 1.5, borderColor: colores.primario, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  botonFotoTexto: { color: colores.primario, fontSize: 17, fontWeight: '700' },
  botonGuardar: { flex: 1.6, minHeight: 54, borderRadius: radios.boton, backgroundColor: colores.primario, alignItems: 'center', justifyContent: 'center' },
  botonGuardarTexto: { color: colores.blanco, fontSize: 17.5, fontWeight: '700' },
  pie: { textAlign: 'center', color: colores.textoSecundario, fontSize: 13.5 },
});
