import { StyleSheet, Text, View } from 'react-native';
import type { CambioEquipo } from '@/api/ruta';
import { colores } from '@/tema/colores';
import { fechaCorta, horaDe } from '@/utilidades/formato';

/** Etiqueta del avance de un equipo (EN EJECUCIÓN, POR INICIAR, PAUSADO…). */
const etiquetasEstado: Record<string, { texto: string; fondo: string; color: string }> = {
  en_ejecucion: { texto: 'EN EJECUCIÓN', fondo: colores.azulFondo, color: colores.azulTexto },
  por_iniciar: { texto: 'POR INICIAR', fondo: colores.grisFondo, color: colores.grisTexto },
  pausado: { texto: 'PAUSADO', fondo: colores.rojo, color: colores.blanco },
  completado: { texto: 'COMPLETADO', fondo: colores.verdeEtiquetaFondo, color: colores.verdeEtiquetaTexto },
  observado: { texto: 'OBSERVADO', fondo: colores.rojoEtiquetaFondo, color: colores.rojoEtiquetaTexto },
};

export function EtiquetaAvance({ estado, texto, fondo, color }: { estado?: string; texto?: string; fondo?: string; color?: string }) {
  const t = etiquetasEstado[estado ?? ''] ?? etiquetasEstado.por_iniciar;
  return (
    <View style={[estilos.etiqueta, { backgroundColor: fondo ?? t.fondo }]}>
      <Text style={[estilos.etiquetaTexto, { color: color ?? t.color }]}>{texto ?? t.texto}</Text>
    </View>
  );
}

/** Cambios del equipo: valor anterior (tachado) → actual (verde). */
export function CambiosEquipo({ cambios }: { cambios: CambioEquipo[] }) {
  if (cambios.length === 0) return <Text style={estilos.nota}>Sin modificaciones registradas.</Text>;
  return (
    <View style={{ gap: 10 }}>
      {cambios.map((c, i) => (
        <View key={`${c.fecha}-${i}`} style={estilos.cambio}>
          <Text style={estilos.cambioTitulo}>
            {i === 0 ? 'Última modificación' : 'Modificación'} · {fechaCorta(c.fecha)} {horaDe(c.fecha)}
          </Text>
          <Fila k="Campo" v={c.campo} />
          <Fila k="Anterior" v={c.valorAnterior ?? '—'} estilo={estilos.anterior} />
          <Fila k="Actual" v={c.valorNuevo ?? '—'} estilo={estilos.actual} />
          {!!(c.detalle || c.usuario) && (
            <Text style={estilos.nota}>{[c.detalle, c.usuario && `Por ${c.usuario}`].filter(Boolean).join(' · ')}</Text>
          )}
        </View>
      ))}
    </View>
  );
}

function Fila({ k, v, estilo }: { k: string; v: string; estilo?: object }) {
  return (
    <View style={estilos.fila}>
      <Text style={estilos.k}>{k}</Text>
      <Text style={[estilos.v, estilo]}>{v}</Text>
    </View>
  );
}

const estilos = StyleSheet.create({
  etiqueta: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-end' },
  etiquetaTexto: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.4 },
  nota: { fontSize: 12.5, color: colores.textoSecundario, marginTop: 2 },
  cambio: { backgroundColor: colores.grisFondo, borderRadius: 8, padding: 10 },
  cambioTitulo: { fontWeight: '600', fontSize: 13, color: colores.titulo, marginBottom: 4 },
  fila: { flexDirection: 'row', gap: 10, marginTop: 2 },
  k: { width: 66, fontSize: 12, fontWeight: '700', color: colores.textoSecundario, paddingTop: 1 },
  v: { flex: 1, fontSize: 13.5, color: colores.texto },
  anterior: { color: colores.textoSecundario, textDecorationLine: 'line-through' },
  actual: { color: colores.verdeEtiquetaTexto, fontWeight: '600' },
});
