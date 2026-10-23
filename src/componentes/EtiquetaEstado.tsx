import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colores } from '@/tema/colores';

export type EstadoEtiqueta = 'conforme' | 'pendiente' | 'bloqueado' | 'no_aplica' | 'opcional' | 'asignado';

const estilosPorEstado: Record<EstadoEtiqueta, { texto: string; fondo: string; color: string }> = {
  conforme: { texto: 'CONFORME', fondo: colores.verdeEtiquetaFondo, color: colores.verdeEtiquetaTexto },
  asignado: { texto: 'ASIGNADO', fondo: colores.verdeEtiquetaFondo, color: colores.verdeEtiquetaTexto },
  pendiente: { texto: 'PENDIENTE', fondo: colores.amarilloFondo, color: colores.amarilloTexto },
  bloqueado: { texto: 'BLOQUEADO', fondo: colores.rojoEtiquetaFondo, color: colores.rojoEtiquetaTexto },
  no_aplica: { texto: 'NO APLICA', fondo: colores.grisFondo, color: colores.grisTexto },
  opcional: { texto: 'OPCIONAL', fondo: colores.grisFondo, color: colores.grisTexto },
};

/** Etiqueta de estado del checklist (CONFORME, PENDIENTE, BLOQUEADO…). */
export function EtiquetaEstado({ estado, texto }: { estado: EstadoEtiqueta; texto?: string }) {
  const e = estilosPorEstado[estado] ?? estilosPorEstado.pendiente;
  return (
    <View style={[estilos.etiqueta, { backgroundColor: e.fondo }]}>
      <Text style={[estilos.texto, { color: e.color }]} numberOfLines={1}>
        {texto ?? e.texto}
      </Text>
    </View>
  );
}

/** Título de sección en mayúsculas (REQUISITOS, RIESGOS IDENTIFICADOS…). */
export function TituloSeccion({ texto, accion }: { texto: string; accion?: ReactNode }) {
  return (
    <View style={estilos.seccion}>
      <Text style={estilos.seccionTexto} accessibilityRole="header">
        {texto}
      </Text>
      {accion}
    </View>
  );
}

const estilos = StyleSheet.create({
  etiqueta: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'center' },
  texto: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.4 },
  seccion: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 22,
    marginBottom: 10,
    gap: 8,
  },
  seccionTexto: { fontSize: 13, fontWeight: '600', letterSpacing: 1.6, color: colores.textoSecundario, flexShrink: 1 },
});
