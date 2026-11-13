import { useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { nombreDeCodigo, obtenerCatalogo } from '@/api/catalogos';
import { obtenerViaticos, type Gasto, type Viatico } from '@/api/viaticos';
import { Aviso } from '@/componentes/Aviso';
import { EncabezadoApp } from '@/componentes/EncabezadoApp';
import { CabeceraSaldos, Chips, FilaGasto, Pestanas, TarjetaViatico } from '@/componentes/ViaticosUI';
import { useConsulta } from '@/hooks/useConsulta';
import { useGastosPendientes } from '@/hooks/useGastosPendientes';
import { useDiseno } from '@/hooks/useDiseno';
import { useSesion } from '@/sesion/SesionContext';
import { colores, radios } from '@/tema/colores';
import { fechaLimaHoy } from '@/utilidades/agenda';
import { soles } from '@/utilidades/dinero';
import {
  agruparPorFecha,
  aprobadoDelMes,
  contarGastos,
  filtrarGastos,
  filtrarViaticos,
  type FiltroGastos,
  type FiltroViaticos,
} from '@/utilidades/viaticos';

/**
 * HU-25 Rendición de viáticos + HU-26 Solicitudes de gastos (lectura).
 *  - Encabezado con el saldo por rendir y los gastos en revisión.
 *  - Pestaña Viáticos: los adelantos que el Jefe de Operaciones asignó al programar cada servicio (Activos · Finalizados),
 *    con lo asignado, lo rendido y lo que falta por rendir; "Ver detalle" abre el viático.
 *  - Pestaña Solicitudes: los gastos rendidos, del más reciente al más antiguo, filtrables por estado (Pendientes, Aprobados,
 *    Observados, Rechazados). Los revisa el Jefe de Operaciones en la intranet (Gestionar Viáticos › Rendición de Gastos).
 * Todo sale de lo que registra la intranet al programar. Rendir un gasto desde la app (HU-27) aún no está disponible.
 * Se abre desde el menú ("Viáticos y Gastos"); ?tab=solicitudes abre la segunda pestaña.
 */
const filtrosViaticos: { id: FiltroViaticos; texto: string }[] = [
  { id: 'todos', texto: 'Todos' },
  { id: 'activos', texto: 'Activos' },
  { id: 'finalizados', texto: 'Finalizados' },
];

const filtrosGastos: { id: FiltroGastos; texto: string }[] = [
  { id: 'todas', texto: 'Todas' },
  { id: 'pendiente', texto: 'Pendientes' },
  { id: 'aprobado', texto: 'Aprobados' },
  { id: 'observado', texto: 'Observados' },
  { id: 'rechazado', texto: 'Rechazados' },
];

export default function PantallaViaticosGastos() {
  const { sesion } = useSesion();
  const usuario = sesion?.usuario;
  const d = useDiseno();

  const params = useLocalSearchParams<{ tab?: string }>();
  const tabDelMenu = params.tab === 'solicitudes' ? 'solicitudes' : 'viaticos';
  const [eleccion, setEleccion] = useState<{ desde: string; tab: 'viaticos' | 'solicitudes' } | null>(null);
  const tab = eleccion && eleccion.desde === tabDelMenu ? eleccion.tab : tabDelMenu;

  const [filtroViaticos, setFiltroViaticos] = useState<FiltroViaticos>('todos');
  const [filtroGastos, setFiltroGastos] = useState<FiltroGastos>('todas');
  const [hoja, setHoja] = useState(false);
  const porEnviar = useGastosPendientes(usuario?.idUsuario);

  const { datos, cargando, recargando, error, recargar } = useConsulta(async (token) => {
    const [viaticos, cargos] = await Promise.all([obtenerViaticos(token), obtenerCatalogo(token, 'CARGO_USUARIO').catch(() => null)]);
    return { viaticos, cargos };
  });

  const cargo = nombreDeCodigo(datos?.cargos, usuario?.cargo) ?? usuario?.cargo ?? 'Técnico de Campo';
  const todo = datos?.viaticos ?? null;
  const hoy = fechaLimaHoy();

  const viaticos: Viatico[] = useMemo(() => filtrarViaticos(todo?.viaticos ?? [], filtroViaticos), [todo, filtroViaticos]);
  const gastosTodos: Gasto[] = useMemo(() => todo?.gastos ?? [], [todo]);
  const conteo = useMemo(() => contarGastos(gastosTodos), [gastosTodos]);
  const grupos = useMemo(() => agruparPorFecha(filtrarGastos(gastosTodos, filtroGastos), hoy), [gastosTodos, filtroGastos, hoy]);
  const aprobado = useMemo(() => aprobadoDelMes(gastosTodos, hoy), [gastosTodos, hoy]);

  const nActivos = todo?.resumen.viaticosActivos ?? 0;
  const nFinalizados = todo?.resumen.viaticosFinalizados ?? 0;
  const cantidadViaticos: Record<FiltroViaticos, number> = { todos: nActivos + nFinalizados, activos: nActivos, finalizados: nFinalizados };

  return (
    <SafeAreaView style={estilos.area} edges={['top']}>
      <EncabezadoApp nombre={usuario?.nombre ?? ''} apellido={usuario?.apellido} subtitulo={`${usuario?.nombre ?? ''} · ${cargo}`} />

      <ScrollView
        contentContainerStyle={[estilos.contenido, { paddingHorizontal: d.margen, maxWidth: d.anchoMaximo }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={recargando} onRefresh={recargar} colors={[colores.primario]} />}
      >
        <View style={estilos.tituloFila}>
          <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Volver al menú">
            <Ionicons name="arrow-back" size={24} color={colores.titulo} />
          </Pressable>
          <Text style={estilos.titulo} accessibilityRole="header">
            Viáticos y Gastos
          </Text>
        </View>
        <Text style={estilos.subtitulo}>Adelantos de tus programaciones y gastos rendidos</Text>

        {cargando ? (
          <ActivityIndicator color={colores.primario} style={{ marginTop: 32 }} />
        ) : error || !todo ? (
          <Aviso tipo="error" mensaje={error ?? 'No se pudieron cargar tus viáticos.'} />
        ) : (
          <>
            <CabeceraSaldos resumen={todo.resumen} />
            <Pestanas
              activa={tab}
              onCambiar={(t) => setEleccion({ desde: tabDelMenu, tab: t })}
              solicitudes={todo.resumen.gastosEnRevisionCantidad}
            />

            {tab === 'viaticos' ? (
              <>
                <Chips
                  opciones={filtrosViaticos.map((f) => ({ ...f, cantidad: cantidadViaticos[f.id] }))}
                  activo={filtroViaticos}
                  onCambiar={setFiltroViaticos}
                />
                {viaticos.length === 0 ? (
                  <Vacio
                    icono="wallet-outline"
                    titulo={todo.viaticos.length === 0 ? 'Aún no tienes viáticos asignados' : 'No hay viáticos en este filtro'}
                    texto={
                      todo.viaticos.length === 0
                        ? 'Cuando el Jefe de Operaciones te asigne un viático al programar un servicio, aparecerá aquí.'
                        : 'Cambia el filtro para ver los otros viáticos.'
                    }
                  />
                ) : (
                  <View style={{ gap: 14 }}>
                    {viaticos.map((v) => (
                      <TarjetaViatico
                        key={v.idProgramacion}
                        viatico={v}
                        onVerDetalle={() => router.push({ pathname: '/viatico', params: { id: String(v.idProgramacion) } })}
                        onRendir={() => router.push({ pathname: '/rendir-gasto', params: { modo: 'viatico', idProgramacion: String(v.idProgramacion) } })}
                      />
                    ))}
                  </View>
                )}
              </>
            ) : (
              <>
                <Chips
                  opciones={filtrosGastos.map((f) => ({ ...f, cantidad: f.id === 'todas' ? undefined : conteo[f.id] }))}
                  activo={filtroGastos}
                  onCambiar={setFiltroGastos}
                />
                {aprobado.total > 0 && (
                  <View style={estilos.resumenMes}>
                    <Ionicons name="checkmark-circle" size={16} color={colores.verde} />
                    <Text style={estilos.resumenMesTexto}>
                      Aprobado en {aprobado.mes}: <Text style={{ fontWeight: '800' }}>{soles(aprobado.total)}</Text> · revisa el Jefe de Operaciones
                    </Text>
                  </View>
                )}
                {porEnviar.length > 0 && (
                  <View style={{ gap: 10, marginBottom: 14 }} testID="gastos-por-enviar">
                    <Text style={estilos.grupoTitulo}>POR ENVIAR · {porEnviar.length}</Text>
                    {porEnviar.map((p) => (
                      <View key={p.entrada.idCliente} style={estilos.porEnviar}>
                        <Ionicons name="phone-portrait-outline" size={22} color={colores.naranja} />
                        <View style={{ flex: 1 }}>
                          <Text style={estilos.porEnviarTitulo}>
                            {p.resumen.concepto} · {soles(p.entrada.monto)}
                          </Text>
                          <Text style={estilos.porEnviarSub}>{[p.resumen.numeroOs, 'se envía sola al volver la señal'].filter(Boolean).join(' · ')}</Text>
                        </View>
                        <Text style={estilos.porEnviarEtiqueta}>POR ENVIAR</Text>
                      </View>
                    ))}
                  </View>
                )}
                {grupos.length === 0 ? (
                  <Vacio
                    icono="receipt-outline"
                    titulo={gastosTodos.length === 0 ? 'Aún no hay gastos rendidos' : 'No hay gastos en este filtro'}
                    texto={
                      gastosTodos.length === 0
                        ? 'Los gastos que rindas aparecerán aquí con su estado de aprobación.'
                        : 'Cambia el filtro para ver los otros gastos.'
                    }
                  />
                ) : (
                  <View style={{ gap: 18 }}>
                    {grupos.map((g) => (
                      <View key={g.fecha} style={{ gap: 10 }}>
                        <Text style={estilos.grupoTitulo}>{g.titulo}</Text>
                        {g.gastos.map((x) => (
                          <FilaGasto
                            key={x.idGasto}
                            gasto={x}
                            onPress={() => router.push({ pathname: '/solicitud-gasto', params: { id: String(x.idGasto) } })}
                          />
                        ))}
                      </View>
                    ))}
                  </View>
                )}
              </>
            )}
          </>
        )}
      </ScrollView>

      {!!todo && (
        <Pressable onPress={() => setHoja(true)} accessibilityRole="button" accessibilityLabel="Registrar un gasto" style={estilos.fab} testID="nuevo-gasto">
          <Ionicons name="add" size={30} color={colores.blanco} />
        </Pressable>
      )}

      <Modal visible={hoja} transparent animationType="slide" onRequestClose={() => setHoja(false)}>
        <Pressable style={estilos.velo} onPress={() => setHoja(false)} accessibilityLabel="Cerrar">
          <View style={estilos.hoja} testID="hoja-nuevo-gasto">
            <Text style={estilos.hojaTitulo}>¿Qué quieres registrar?</Text>
            <OpcionHoja
              icono="wallet-outline"
              titulo="Rendir gasto de un viático"
              texto="Se descuenta del adelanto de tu programación."
              etiqueta={todo ? `SALDO ${soles(todo.resumen.saldoPorRendir)}` : undefined}
              onPress={() => {
                setHoja(false);
                router.push({ pathname: '/rendir-gasto', params: { modo: 'viatico' } });
              }}
            />
            <OpcionHoja
              icono="receipt-outline"
              titulo="Solicitar reembolso"
              texto="Gasto que pagaste tú en un servicio programado."
              etiqueta="FOTO O MOTIVO OBLIGATORIO"
              onPress={() => {
                setHoja(false);
                router.push({ pathname: '/rendir-gasto', params: { modo: 'reembolso' } });
              }}
            />
            <Text style={estilos.hojaNota}>Si un gasto supera el adelanto, rinde el viático completo: lo aprobado de más se reembolsa al cerrar la rendición.</Text>
            <Pressable onPress={() => setHoja(false)} accessibilityRole="button" style={{ alignItems: 'center', padding: 12 }}>
              <Text style={estilos.hojaCancelar}>Cancelar</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

function OpcionHoja({ icono, titulo, texto, etiqueta, onPress }: { icono: keyof typeof Ionicons.glyphMap; titulo: string; texto: string; etiqueta?: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={estilos.opcion}>
      <Ionicons name={icono} size={26} color={colores.primario} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={estilos.opcionTitulo}>{titulo}</Text>
        <Text style={estilos.opcionTexto}>{texto}</Text>
        {!!etiqueta && <Text style={estilos.opcionEtiqueta}>{etiqueta}</Text>}
      </View>
      <Ionicons name="chevron-forward" size={18} color={colores.textoTenue} />
    </Pressable>
  );
}

function Vacio({ icono, titulo, texto }: { icono: keyof typeof Ionicons.glyphMap; titulo: string; texto: string }) {
  return (
    <View style={estilos.vacio}>
      <Ionicons name={icono} size={40} color={colores.textoTenue} />
      <Text style={estilos.vacioTitulo}>{titulo}</Text>
      <Text style={estilos.vacioTexto}>{texto}</Text>
    </View>
  );
}

const estilos = StyleSheet.create({
  area: { flex: 1, backgroundColor: colores.fondo },
  contenido: { padding: 16, paddingBottom: 28, maxWidth: 560, width: '100%', alignSelf: 'center' },
  tituloFila: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  titulo: { fontSize: 24, fontWeight: '700', color: colores.titulo, flexShrink: 1 },
  subtitulo: { fontSize: 14, color: colores.textoSecundario, marginTop: 4, marginBottom: 16, marginLeft: 34 },
  porEnviar: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colores.amarilloFondo, borderRadius: radios.campo, padding: 12 },
  porEnviarTitulo: { fontSize: 14.5, fontWeight: '700', color: colores.titulo },
  porEnviarSub: { fontSize: 12.5, color: colores.amarilloTexto },
  porEnviarEtiqueta: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.6, color: colores.amarilloTexto },
  fab: { position: 'absolute', right: 18, bottom: 18, width: 56, height: 56, borderRadius: 28, backgroundColor: colores.primario, alignItems: 'center', justifyContent: 'center', elevation: 6, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 6, shadowOffset: { width: 0, height: 3 } },
  velo: { flex: 1, backgroundColor: 'rgba(11,31,58,0.5)', justifyContent: 'flex-end' },
  hoja: { backgroundColor: colores.blanco, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 18, gap: 10 },
  hojaTitulo: { fontSize: 18, fontWeight: '800', color: colores.titulo, marginBottom: 4 },
  hojaNota: { fontSize: 12, color: colores.textoTenue, lineHeight: 17 },
  hojaCancelar: { fontSize: 15, fontWeight: '700', color: colores.textoSecundario },
  opcion: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: colores.bordeSuave, borderRadius: radios.tarjeta, padding: 14 },
  opcionTitulo: { fontSize: 15.5, fontWeight: '700', color: colores.titulo },
  opcionTexto: { fontSize: 12.5, color: colores.textoSecundario },
  opcionEtiqueta: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.6, color: colores.primario, marginTop: 2 },
  resumenMes: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colores.verdeFondo,
    borderRadius: radios.campo,
    borderWidth: 1,
    borderColor: colores.verdeBorde,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginBottom: 12,
  },
  resumenMesTexto: { flex: 1, fontSize: 13, lineHeight: 18, color: colores.texto },
  grupoTitulo: { fontSize: 12.5, fontWeight: '700', letterSpacing: 1.2, color: colores.textoSecundario },
  vacio: { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 20 },
  vacioTitulo: { fontSize: 17, fontWeight: '700', color: colores.titulo, marginTop: 12, textAlign: 'center' },
  vacioTexto: { fontSize: 14, color: colores.textoSecundario, textAlign: 'center', marginTop: 6, lineHeight: 20 },
});
