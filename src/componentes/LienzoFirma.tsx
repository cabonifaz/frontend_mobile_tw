import { memo, type ComponentRef, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native';
import type { Trazos } from '@/api/firmas';
import { colores, radios } from '@/tema/colores';
import { agregarPuntoTactil, ASPECTO_FIRMA, iniciarTrazo, CURVAS_POR_TANDA, esAgudo, normalizarPunto, segmentosTinta } from '@/utilidades/firmas';

/**
 * HU-17 — Lienzo para dibujar la firma con el dedo, SIN dependencias nativas: cada tramo del trazo es una vista fina girada. Lo que se guarda son TRAZOS normalizados
 * (cada punto entre 0 y 1 del lienzo, que siempre tiene la misma proporción), así la misma firma se vuelve a dibujar en cualquier tamaño y en el PDF de la constancia.
 */

const GROSOR = 2.6;
/** Tinta azul oscura, como la de un bolígrafo. */
const TINTA = colores.titulo;

interface PropsTanda { puntos: [number, number][]; ancho: number; alto: number; color: string; grosor: number; continua: boolean; final: boolean; inicioAgudo: boolean }

/** Una tanda del trazo (memorizada: las completas no se vuelven a calcular; al dibujar solo cambia la última). */
const Tanda = memo(
  function Tanda({ puntos, ancho, alto, color, grosor, continua, final, inicioAgudo }: PropsTanda) {
    const segs = useMemo(() => segmentosTinta(puntos, ancho, alto, grosor, { continua, final, inicioAgudo }), [puntos, ancho, alto, grosor, continua, final, inicioAgudo]);
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
  },
  (a, b) => {
    const ua = a.puntos[a.puntos.length - 1], ub = b.puntos[b.puntos.length - 1];
    return a.puntos.length === b.puntos.length && ua[0] === ub[0] && ua[1] === ub[1] && a.puntos[0][0] === b.puntos[0][0] && a.puntos[0][1] === b.puntos[0][1] &&
      a.ancho === b.ancho && a.alto === b.alto && a.color === b.color && a.grosor === b.grosor && a.continua === b.continua && a.final === b.final && a.inicioAgudo === b.inicioAgudo;
  },
);

/** Un trazo dibujado, partido en tandas. */
function TrazoDibujado({ puntos, ancho, alto, color, grosor }: { puntos: [number, number][]; ancho: number; alto: number; color: string; grosor: number }) {
  const n = puntos.length;
  const tandas: { desde: number; hasta: number; final: boolean }[] = [];
  let a = 1;
  while (a + CURVAS_POR_TANDA <= n - 2) {
    tandas.push({ desde: a - 1, hasta: a + CURVAS_POR_TANDA + 1, final: false });
    a += CURVAS_POR_TANDA;
  }
  tandas.push({ desde: Math.max(0, a - 1), hasta: n, final: true });
  return (
    <>
      {tandas.map((t, i) => (
        <Tanda key={i} puntos={puntos.slice(t.desde, t.hasta)} ancho={ancho} alto={alto} color={color} grosor={grosor} continua={t.desde > 0} final={t.final} inicioAgudo={t.desde > 1 && esAgudo(puntos[t.desde - 1], puntos[t.desde], puntos[t.desde + 1], ancho, alto)} />
      ))}
    </>
  );
}

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
  // Mientras el dedo dibuja, los trazos viven aquí dentro (solo se vuelve a pintar el lienzo, no toda la pantalla: así la pantalla no junta los toques y no se pierden puntos
  // al firmar rápido). La pantalla recibe los trazos al levantar el dedo.
  const [vivos, setVivos] = useState<Trazos>(trazos);
  const trazosRef = useRef(trazos);
  const dibujando = useRef(false);
  const lienzoRef = useRef<ComponentRef<typeof View>>(null);
  /** Esquina del lienzo en la pantalla: los toques se leen con pageX/pageY, que no dependen de qué vista toca el dedo (locationX/Y dan valores falsos al ir muy rápido). */
  const origen = useRef<{ x: number; y: number } | null>(null);
  const medirOrigen = () => lienzoRef.current?.measure((_x, _y, _w, _h, px, py) => { origen.current = { x: px, y: py }; });
  const posicion = (e: GestureResponderEvent): [number, number] => {
    const { ancho, alto } = medidaRef.current;
    const o = origen.current;
    const n = e.nativeEvent;
    return o ? normalizarPunto(n.pageX - o.x, n.pageY - o.y, ancho, alto) : normalizarPunto(n.locationX, n.locationY, ancho, alto);
  };
  const medidaRef = useRef(medida);
  useEffect(() => {
    medidaRef.current = medida;
  });
  useEffect(() => {
    if (!dibujando.current) {
      trazosRef.current = trazos;
      setVivos(trazos);
    }
  }, [trazos]);

  // Sistema de respuesta táctil de la vista (sin PanResponder): el lienzo toma el gesto y no lo suelta, así el desplazamiento de la pantalla no lo interrumpe.
  function alTocar(e: GestureResponderEvent) {
    dibujando.current = true;
    onTocando?.(true);
    medirOrigen();
    const siguiente = iniciarTrazo(trazosRef.current, normalizarPunto(e.nativeEvent.locationX, e.nativeEvent.locationY, medidaRef.current.ancho, medidaRef.current.alto));
    trazosRef.current = siguiente;
    setVivos(siguiente);
  }

  function alSoltar() {
    dibujando.current = false;
    onCambio(trazosRef.current);
    onTocando?.(false);
  }

  function alMover(e: GestureResponderEvent) {
    const siguiente = agregarPuntoTactil(trazosRef.current, posicion(e));
    if (siguiente !== trazosRef.current) {
      trazosRef.current = siguiente;
      setVivos(siguiente);
    }
  }

  function alMedir(e: LayoutChangeEvent) {
    const { width, height } = e.nativeEvent.layout;
    setMedida({ ancho: width, alto: height });
    setTimeout(medirOrigen, 0);
  }

  return (
    <View ref={lienzoRef} collapsable={false} style={[estilos.lienzo, error && estilos.lienzoError]} onLayout={alMedir}
      onStartShouldSetResponder={() => !deshabilitado}
      onMoveShouldSetResponder={() => !deshabilitado}
      onResponderTerminationRequest={() => false}
      onResponderGrant={alTocar}
      onResponderMove={alMover}
      onResponderRelease={alSoltar}
      onResponderTerminate={alSoltar}
      testID="lienzo-firma" accessibilityLabel="Lienzo para firmar">
      <Capa trazos={vivos} ancho={medida.ancho} alto={medida.alto} color={TINTA} grosor={GROSOR} />
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
