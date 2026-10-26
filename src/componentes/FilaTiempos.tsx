import { StyleSheet, Text, View } from 'react-native';
import { colores } from '@/tema/colores';

export interface Tiempo {
  etiqueta: string;
  valor: string;
  color?: string;
}

/** Fila de tiempos del técnico (salida, en ruta, llegada, en planta...). Se acomoda en 2 filas en celulares angostos. */
export function FilaTiempos({ tiempos, testID }: { tiempos: Tiempo[]; testID?: string }) {
  return (
    <View style={estilos.fila} testID={testID}>
      {tiempos.map((t) => (
        <View key={t.etiqueta} style={estilos.celda}>
          <Text style={estilos.etiqueta} numberOfLines={1}>
            {t.etiqueta}
          </Text>
          <Text style={[estilos.valor, t.color ? { color: t.color } : null]} numberOfLines={1} adjustsFontSizeToFit>
            {t.valor}
          </Text>
        </View>
      ))}
    </View>
  );
}

/** "1 h 07", "42 min" o "—". */
export function duracion(min: number | null | undefined): string {
  if (min === null || min === undefined || Number.isNaN(min)) return '—';
  const m = Math.max(0, Math.round(min));
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`;
}

const estilos = StyleSheet.create({
  fila: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  celda: {
    flexGrow: 1,
    flexBasis: '22%',
    minWidth: 70,
    backgroundColor: colores.blanco,
    borderWidth: 1,
    borderColor: colores.bordeSuave,
    borderRadius: 12,
    paddingVertical: 9,
    paddingHorizontal: 4,
    alignItems: 'center',
  },
  etiqueta: { fontSize: 10.5, fontWeight: '600', color: colores.textoSecundario, letterSpacing: 0.3 },
  valor: { fontSize: 16, fontWeight: '700', color: colores.titulo, marginTop: 2 },
});
