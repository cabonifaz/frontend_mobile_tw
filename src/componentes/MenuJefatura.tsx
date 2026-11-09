import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { nombreDeCodigo, obtenerCatalogo } from '@/api/catalogos';
import { obtenerMenuJefatura } from '@/api/jefatura';
import { Aviso } from '@/componentes/Aviso';
import { EncabezadoApp } from '@/componentes/EncabezadoApp';
import { TarjetaModulo } from '@/componentes/TarjetaModulo';
import { useConsulta } from '@/hooks/useConsulta';
import { useDiseno } from '@/hooks/useDiseno';
import { avisoBloqueo, estaBloqueado, modulosJefatura, type ModuloJefatura } from '@/menu/modulosJefatura';
import { useSesion } from '@/sesion/SesionContext';
import { colores, radios } from '@/tema/colores';
import { areaDeJefatura } from '@/utilidades/perfil';

/**
 * HU-28 — Menú de Jefatura ÚNICO: lo usan todos los jefes de área (Servicio Técnico, Metrología, Operaciones…); el técnico ve el menú
 * de campo (HU-02). El cargo, el rol y el área del usuario definen el menú.
 *  - Resumen del día del área (programados, en ruta, en ejecución y con demora), filtrado por el área según la RQ de cada servicio.
 *  - Tarjetas: las mismas para todos los jefes. Las exclusivas de otra área (Correlativos y Recepción en Taller son de Metrología)
 *    salen en gris con candado y "SOLO METROLOGÍA"; al tocarlas aparece un aviso. Aprobaciones muestra cuántas solicitudes esperan
 *    su decisión; las pantallas que aún no existen abren "Próximamente".
 *  - Barra inferior: Menú · Aprobaciones · Notificaciones · Perfil (la arma el layout de las pestañas).
 * Los números se actualizan al abrir el menú y al deslizar hacia abajo.
 */
export function MenuJefatura() {
  const { sesion } = useSesion();
  const usuario = sesion?.usuario;
  const d = useDiseno();
  const areaCargo = areaDeJefatura(usuario);

  const { datos, cargando, recargando, error, recargar } = useConsulta(async (token) => {
    const [menu, cargos] = await Promise.all([obtenerMenuJefatura(token), obtenerCatalogo(token, 'CARGO_USUARIO').catch(() => null)]);
    return { menu, cargos };
  });

  const cargo = nombreDeCodigo(datos?.cargos, usuario?.cargo) ?? usuario?.cargo ?? 'Jefe de Área';
  const menu = datos?.menu ?? null;
  // El área sale del back (rol + área + RQ); mientras carga, de lo que ya conoce la sesión.
  const area = menu?.areaCodigo ?? areaCargo ?? '';
  const nombreArea = menu?.areaNombre ?? 'tu área';
  const modulos = useMemo(() => modulosJefatura(), []);

  // Aviso al tocar un módulo que no es de tu área (se oculta solo).
  const [aviso, setAviso] = useState<string | null>(null);
  useEffect(() => {
    if (!aviso) return;
    const id = setTimeout(() => setAviso(null), 3500);
    return () => clearTimeout(id);
  }, [aviso]);

  function abrir(m: ModuloJefatura) {
    if (estaBloqueado(m, area)) return setAviso(avisoBloqueo(m));
    if (m.ruta) router.push(m.ruta as never);
    else router.push({ pathname: '/modulo/[id]', params: { id: m.id } });
  }

  const columnas = d.columnasMenu;
  const filas: ModuloJefatura[][] = [];
  for (let i = 0; i < modulos.length; i += columnas) filas.push(modulos.slice(i, i + columnas));

  const cifras = menu
    ? [
        { n: menu.programados, texto: 'Programados' },
        { n: menu.enRuta, texto: 'En ruta' },
        { n: menu.enEjecucion, texto: 'En ejecución' },
        { n: menu.conDemora, texto: 'Con demora' },
      ]
    : [];

  return (
    <SafeAreaView style={estilos.area} edges={['top']}>
      <EncabezadoApp nombre={usuario?.nombre ?? ''} apellido={usuario?.apellido} subtitulo={`${usuario?.nombre ?? ''} · ${cargo}`} />
      <ScrollView
        contentContainerStyle={[estilos.contenido, { paddingHorizontal: d.margen, maxWidth: d.anchoMaximo }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={recargando} onRefresh={recargar} colors={[colores.primario]} />}
      >
        <Text style={[estilos.titulo, { fontSize: d.tituloPantalla + 2 }]} accessibilityRole="header">
          Menú de Jefatura
        </Text>
        <Text style={estilos.subtitulo}>{['Área: ' + nombreArea, menu?.sede].filter(Boolean).join(' · ')}</Text>

        {!!error && (
          <View style={{ marginBottom: 16 }}>
            <Aviso tipo="error" mensaje={`No se pudo cargar el resumen de tu área. ${error}`} />
          </View>
        )}

        <View style={estilos.resumen} testID="jefatura-resumen">
          <Text style={estilos.resumenTitulo}>HOY · {nombreArea.toUpperCase()}</Text>
          {cargando ? (
            <ActivityIndicator color={colores.blanco} style={{ marginVertical: 14 }} />
          ) : (
            <View style={estilos.cifras}>
              {cifras.map((c) => (
                <View key={c.texto} style={estilos.cifra}>
                  <Text style={estilos.cifraNumero}>{c.n}</Text>
                  <Text style={estilos.cifraTexto} numberOfLines={1} adjustsFontSizeToFit>
                    {c.texto}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>

        <View style={estilos.cuadricula}>
          {filas.map((fila) => (
            <View key={fila[0].id} style={estilos.fila}>
              {fila.map((m) => (
                <TarjetaModulo
                  key={m.id}
                  modulo={m}
                  alerta={m.alerta}
                  bloqueadoPara={estaBloqueado(m, area) ? m.soloArea?.nombre : undefined}
                  indicadores={m.indicadores && menu ? m.indicadores(menu) : []}
                  onPress={() => abrir(m)}
                />
              ))}
              {Array.from({ length: columnas - fila.length }, (_, k) => (
                <View key={`hueco-${k}`} style={{ flex: 1 }} />
              ))}
            </View>
          ))}
        </View>
      </ScrollView>
      {!!aviso && (
        <View style={estilos.aviso} accessibilityLiveRegion="polite" testID="jefatura-aviso-bloqueo">
          <Ionicons name="lock-closed" size={16} color="#FBBF24" />
          <Text style={estilos.avisoTexto}>{aviso}</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const estilos = StyleSheet.create({
  area: { flex: 1, backgroundColor: colores.fondo },
  contenido: { padding: 20, paddingBottom: 28, maxWidth: 520, width: '100%', alignSelf: 'center' },
  titulo: { fontSize: 24, fontWeight: '700', color: colores.titulo, marginTop: 4 },
  subtitulo: { fontSize: 15, color: colores.textoSecundario, marginTop: 4, marginBottom: 16 },
  resumen: { backgroundColor: colores.primarioOscuro, borderRadius: radios.tarjeta, paddingVertical: 16, paddingHorizontal: 18, marginBottom: 16 },
  resumenTitulo: { fontSize: 11.5, fontWeight: '700', letterSpacing: 1, color: 'rgba(255,255,255,0.85)', marginBottom: 12 },
  cifras: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  cifra: { flex: 1, alignItems: 'center', gap: 2 },
  cifraNumero: { fontSize: 26, fontWeight: '800', color: colores.blanco },
  cifraTexto: { fontSize: 11.5, color: 'rgba(255,255,255,0.85)', textAlign: 'center' },
  cuadricula: { gap: 14, marginBottom: 18 },
  fila: { flexDirection: 'row', gap: 14 },
  aviso: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#1F2937',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  avisoTexto: { flex: 1, color: colores.blanco, fontSize: 13.5, lineHeight: 19 },
});
