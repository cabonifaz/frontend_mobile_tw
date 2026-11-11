import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colores } from '@/tema/colores';
import { guiones, proyectar, segmentos, type PuntoGeo } from '@/utilidades/panelCampo';

export interface PinMapa extends PuntoGeo {
  clave: string;
  /** Iniciales o abreviatura dentro del pin ("JP", "TW"). */
  texto: string;
  color: string;
  tamano?: number;
  onPress?: () => void;
  etiqueta?: string;
}

interface Props {
  pines: PinMapa[];
  /** Recorrido GPS: se dibuja como una línea que une los puntos en orden. */
  ruta?: PuntoGeo[];
  /** Ruta prevista (salida → planta): línea de guiones. Los extremos entran en el encuadre aunque estén lejos. */
  trayecto?: PuntoGeo[];
  alto?: number;
  /** Texto cuando no hay nada que dibujar. */
  vacio?: string;
}

/**
 * Mapa ESQUEMÁTICO (HU-29 / HU-30): la app no trae una librería de mapas (necesitaría claves y una app nueva), así que los pines y la ruta se colocan en
 * proporción a su latitud y longitud sobre un fondo de calles decorativas. Sirve para ver quién está dónde respecto a los demás, no para navegar:
 * para el mapa real de la ruta hay un botón que abre la app de mapas del teléfono.
 */
export function MapaEsquematico({ pines, ruta = [], trayecto = [], alto = 260, vacio = 'Aún no hay posiciones GPS de hoy.' }: Props) {
  const [ancho, setAncho] = useState(0);
  const posiciones = ancho > 0 ? proyectar([...pines, ...ruta, ...trayecto], ancho, alto, 30) : [];
  const dePines = posiciones.slice(0, pines.length);
  const deRuta = posiciones.slice(pines.length, pines.length + ruta.length);
  const deTrayecto = posiciones.slice(pines.length + ruta.length);

  return (
    <View style={[estilos.mapa, { height: alto }]} onLayout={(e) => setAncho(e.nativeEvent.layout.width)} accessibilityLabel="Mapa esquemático">
      {/* Calles, parque y agua decorativos */}
      <View style={[estilos.agua, { height: alto * 0.2 }]} />
      <View style={[estilos.parque, { left: '72%', top: '18%', width: '18%', height: alto * 0.22 }]} />
      <View style={[estilos.calleH, { top: '14%' }]} />
      <View style={[estilos.calleH, { top: '46%' }]} />
      <View style={[estilos.calleH, { top: '86%' }]} />
      <View style={[estilos.calleV, { left: '16%' }]} />
      <View style={[estilos.calleV, { left: '56%' }]} />
      <View style={[estilos.calleV, { left: '84%' }]} />

      {guiones(deTrayecto).map((s, i) => (
        <View
          key={`g${i}`}
          pointerEvents="none"
          style={{ position: 'absolute', left: s.izquierda, top: s.arriba, width: s.largo, height: 3, borderRadius: 1.5, backgroundColor: '#64748B', transform: [{ rotate: `${s.angulo}deg` }] }}
        />
      ))}

      {segmentos(deRuta).map((s, i) => (
        <View
          key={`s${i}`}
          pointerEvents="none"
          style={{ position: 'absolute', left: s.izquierda, top: s.arriba, width: s.largo, height: 4, borderRadius: 2, backgroundColor: colores.primario, transform: [{ rotate: `${s.angulo}deg` }] }}
        />
      ))}

      {pines.map((p, i) => {
        const pos = dePines[i];
        if (!pos) return null;
        const t = p.tamano ?? 40;
        return (
          <Pressable
            key={p.clave}
            onPress={p.onPress}
            disabled={!p.onPress}
            style={[estilos.pin, { left: pos.x - t / 2, top: pos.y - t / 2, width: t, height: t, borderRadius: t / 2, backgroundColor: p.color }]}
            accessibilityRole={p.onPress ? 'button' : 'image'}
            accessibilityLabel={p.etiqueta ?? p.texto}
          >
            <Text style={[estilos.pinTexto, { fontSize: t < 36 ? 11 : 13 }]}>{p.texto}</Text>
          </Pressable>
        );
      })}

      {pines.length === 0 && ruta.length === 0 && trayecto.length === 0 && (
        <View style={estilos.vacio}>
          <Text style={estilos.vacioTexto}>{vacio}</Text>
        </View>
      )}
    </View>
  );
}

const estilos = StyleSheet.create({
  mapa: { backgroundColor: '#E8ECE6', borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: colores.bordeSuave },
  agua: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: '#D3E4F3' },
  parque: { position: 'absolute', backgroundColor: '#D6E6CE', borderRadius: 6 },
  calleH: { position: 'absolute', left: 0, right: 0, height: 14, backgroundColor: '#FFFFFF' },
  calleV: { position: 'absolute', top: 0, bottom: 0, width: 12, backgroundColor: '#FFFFFF' },
  pin: { position: 'absolute', alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: colores.blanco, elevation: 3 },
  pinTexto: { color: colores.blanco, fontWeight: '800' },
  vacio: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', padding: 20 },
  vacioTexto: { color: colores.textoSecundario, fontSize: 14.5, textAlign: 'center' },
});
