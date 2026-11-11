import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native';
import type { Trazos } from '@/api/firmas';
import { colores, radios } from '@/tema/colores';
import { agregarPunto, ASPECTO_FIRMA, iniciarTrazo, normalizarPunto, segmentosTinta } from '@/utilidades/firmas';

/**
 * HU-17 — Lienzo para dibujar la firma con el dedo, SIN dependencias nativas: cada tramo del trazo es una vista fina girada. Lo que se guarda son TRAZOS normalizados
 * (cada punto entre 0 y 1 del lienzo, que siempre tiene la misma proporción), así la misma firma se vuelve a dibujar en cualquier tamaño y en el PDF de la constancia.
 */

const GROSOR = 3.2;
/** Tinta azul oscura, como la de un bolígrafo. */
const TINTA = '#16224A';

/** Un trazo dibujado (memorizado: al dibujar solo se vuelve a pintar el último). */
const TrazoDibujado = memo(function TrazoDibujado({ puntos, ancho, alto, color, grosor }: { puntos: [number, number][]; ancho: number; alto: number; color: string; grosor: number }) {
  const segs = useMemo(() => segmentosTinta(puntos, ancho, alto, grosor), [puntos, ancho, alto, grosor]);
  return (
    <>
      {segs.map((s, i) => (
        <View
          key={i}
          style={{ position: 'absolute', left: s.izquierda, top: s.arriba, width: s.largo, height: s.grosor, borderRadius: s.grosor / 2, backgroundColor: color, transform: [{ rotate: `${s.angulo}rad` }] }}
        />
      ))}
    </>
  );
});

function Capa({ trazos, ancho, alto, color, grosor }: { trazos: Trazos; ancho: number; alto: number; color: string; grosor: number }) {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {ancho > 0 && trazos.map((t, i) => <TrazoDibujado key={i} puntos={t} ancho={ancho} alto={alto} color={color} grosor={grosor} />)}
    </View>
  );
}

/** Una firma ya guardada (solo lectura), del ancho que se pida. */
export function FirmaVista({ trazos, ancho, color = TINTA }: { trazos: Trazos; ancho: number; color?: string }) {
  const alto = ancho / ASPECTO_FIRMA;
  return (
    <View style={{ width: ancho, height: alto }} accessibilityLabel="Firma">
      <Capa trazos={trazos} ancho={ancho} alto={alto} color={color} grosor={Math.max(1.4, (GROSOR * ancho) / 300)} />
    </View>
  );
}

interface Props {
  trazos: Trazos;
  onCambio: (t: Trazos) => void;
  /** Avisa si el dedo está dibujando: la pantalla bloquea el desplazamiento mientras tanto. */
  onTocando?: (tocando: boolean) => void;
  etiqueta?: string;
  /** Marco rojo (firma rechazada). */
  error?: boolean;
  deshabilitado?: boolean;
}

/** El lienzo para firmar: el dedo dibuja; `onCambio` entrega los trazos normalizados. */
export function LienzoFirma({ trazos, onCambio, onTocando, etiqueta = 'Firma', error = false, deshabilitado = false }: Props) {
  const [medida, setMedida] = useState({ ancho: 0, alto: 0 });
  const trazosRef = useRef(trazos);
  const medidaRef = useRef(medida);
  useEffect(() => {
    trazosRef.current = trazos;
    medidaRef.current = medida;
  });

  // Sistema de respuesta táctil de la vista (sin PanResponder): el lienzo toma el gesto y no lo suelta, así el desplazamiento de la pantalla no lo interrumpe.
  function alTocar(e: GestureResponderEvent) {
    onTocando?.(true);
    const { ancho, alto } = medidaRef.current;
    const siguiente = iniciarTrazo(trazosRef.current, normalizarPunto(e.nativeEvent.locationX, e.nativeEvent.locationY, ancho, alto));
    trazosRef.current = siguiente;
    onCambio(siguiente);
  }

  function alMover(e: GestureResponderEvent) {
    const { ancho, alto } = medidaRef.current;
    const siguiente = agregarPunto(trazosRef.current, normalizarPunto(e.nativeEvent.locationX, e.nativeEvent.locationY, ancho, alto));
    if (siguiente !== trazosRef.current) {
      trazosRef.current = siguiente;
      onCambio(siguiente);
    }
  }

  function alMedir(e: LayoutChangeEvent) {
    const { width, height } = e.nativeEvent.layout;
    setMedida({ ancho: width, alto: height });
  }

  return (
    <View style={[estilos.lienzo, error && estilos.lienzoError]} onLayout={alMedir}
      onStartShouldSetResponder={() => !deshabilitado}
      onMoveShouldSetResponder={() => !deshabilitado}
      onResponderTerminationRequest={() => false}
      onResponderGrant={alTocar}
      onResponderMove={alMover}
      onResponderRelease={() => onTocando?.(false)}
      onResponderTerminate={() => onTocando?.(false)}
      testID="lienzo-firma" accessibilityLabel="Lienzo para firmar">
      <Capa trazos={trazos} ancho={medida.ancho} alto={medida.alto} color={TINTA} grosor={GROSOR} />
      <View pointerEvents="none" style={estilos.pie}>
        <View style={estilos.linea} />
        <Text style={estilos.etiqueta}>{etiqueta}</Text>
      </View>
    </View>
  );
}

const estilos = StyleSheet.create({
  lienzo: { width: '100%', aspectRatio: ASPECTO_FIRMA, backgroundColor: colores.blanco, borderRadius: radios.tarjeta, borderWidth: 1.5, borderColor: colores.borde, borderStyle: 'dashed', overflow: 'hidden' },
  lienzoError: { borderColor: colores.rojo, backgroundColor: '#FFF7F7' },
  pie: { position: 'absolute', left: 14, right: 14, bottom: 6 },
  linea: { height: 1, backgroundColor: colores.borde },
  etiqueta: { fontSize: 12.5, color: colores.textoTenue, marginTop: 3 },
});
