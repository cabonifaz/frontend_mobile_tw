import { ImageBackground, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ProximoServicio } from '@/api/menu';
import { colores, radios } from '@/tema/colores';

interface Props {
  servicio: ProximoServicio | null;
  onPress: () => void;
}

const enCurso: Record<string, string> = {
  en_ruta: 'EN RUTA',
  en_ejecucion: 'EN EJECUCIÓN',
  pausada: 'PAUSADO',
};

/** Fecha "yyyy-MM-dd" → "Hoy", "Mañana" o "dd/MM". */
function textoDia(fecha: string | null): string {
  if (!fecha) return '';
  const [a, m, d] = fecha.split('-').map(Number);
  const objetivo = new Date(a, m - 1, d).setHours(0, 0, 0, 0);
  const hoy = new Date().setHours(0, 0, 0, 0);
  const dias = Math.round((objetivo - hoy) / 86400000);
  if (dias === 0) return 'Hoy';
  if (dias === 1) return 'Mañana';
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
}

/** Banner inferior "Próximo Hit": el servicio en curso o el más cercano (HU-02). */
export function BannerProximoServicio({ servicio, onPress }: Props) {
  const etiqueta = servicio && enCurso[servicio.estado] ? enCurso[servicio.estado] : 'PRÓXIMO HIT';
  const titulo = servicio
    ? [servicio.tipoServicio, servicio.sede].filter(Boolean).join(' ') || servicio.numero
    : 'Sin servicios pendientes';
  const detalle = servicio
    ? [servicio.cliente, [textoDia(servicio.fechaEjecucion), servicio.horaInicio].filter(Boolean).join(' · ')]
        .filter(Boolean)
        .join(' — ')
    : 'Cuando te asignen un servicio aparecerá aquí.';

  return (
    <Pressable
      onPress={onPress}
      disabled={!servicio}
      accessibilityRole="button"
      accessibilityLabel={`${etiqueta}: ${titulo}. ${detalle}`}
      style={({ pressed }) => [estilos.contenedor, pressed && { opacity: 0.85 }]}
      testID="banner-proximo-servicio"
    >
      <ImageBackground
        source={require('../../assets/images/fondo-industrial.jpg')}
        style={estilos.imagen}
        imageStyle={estilos.imagenEstilo}
        resizeMode="cover"
      >
        <View style={estilos.capa}>
          <View style={{ flex: 1 }}>
            <Text style={estilos.etiqueta}>{etiqueta}</Text>
            <Text style={estilos.titulo} numberOfLines={1}>
              {titulo}
            </Text>
            <Text style={estilos.detalle} numberOfLines={1}>
              {detalle}
            </Text>
          </View>
          {servicio && <Ionicons name="chevron-forward" size={22} color={colores.blanco} />}
        </View>
      </ImageBackground>
    </Pressable>
  );
}

const estilos = StyleSheet.create({
  contenedor: { borderRadius: radios.tarjeta, overflow: 'hidden', borderWidth: 1, borderColor: colores.bordeSuave },
  imagen: { width: '100%', minHeight: 100 },
  imagenEstilo: { borderRadius: radios.tarjeta },
  capa: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 22,
    paddingVertical: 18,
    backgroundColor: 'rgba(0, 61, 140, 0.82)',
    gap: 12,
  },
  etiqueta: { color: '#C9DBF5', fontSize: 11, fontWeight: '700', letterSpacing: 1.2, marginBottom: 6 },
  titulo: { color: colores.blanco, fontSize: 18, fontWeight: '700' },
  detalle: { color: '#DCE8F8', fontSize: 13, marginTop: 4 },
});
