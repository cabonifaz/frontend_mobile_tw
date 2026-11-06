import { useEffect, useRef } from 'react';
import { Alert, AppState, Linking, Platform } from 'react-native';
import * as Location from 'expo-location';
import { pendientesDe, sincronizarPendientes } from '@/api/colaDemoras';
import type { Ubicacion } from '@/api/ruta';
import { obtenerServiciosProgramados } from '@/api/servicios';
import { enviarUbicacion } from '@/api/ubicacion';
import { entorno } from '@/config/entorno';
import { useSesion } from '@/sesion/SesionContext';
import { perfilDe } from '@/utilidades/perfil';

/** Estados de la OS en los que el back acepta la posición del técnico (SP_RegistrarUbicacionMovil). */
const ESTADOS_EN_CURSO = ['en_ruta', 'en_ejecucion', 'pausada'];
const CADA_LATIDO_MS = 45_000;
const CADA_COLA_MS = 30_000;
const LISTA_VIGENTE_MS = 120_000;
const POSICION_VIGENTE_MS = 3 * 60_000;

/**
 * Trabajo de fondo de la app mientras el técnico la tiene abierta (no pinta nada). Se monta en las pestañas, o sea, apenas
 * entra con su sesión:
 *  1. GPS: pide el permiso de ubicación y, si el GPS del teléfono está apagado, pide encenderlo; sigue la posición mientras la app
 *     está en primer plano (se pausa al salir, para cuidar la batería, y se retoma al volver).
 *  2. Seguimiento (HU-51): mientras el técnico tiene un servicio en curso (en ruta, en ejecución o en pausa) envía su posición al
 *     back cada ~45 s para el Seguimiento Operativo de la intranet. Sin servicio en curso no se envía nada; sin conexión se omite.
 *  3. Demoras guardadas sin conexión (HU-05): las envía al abrir la app, al volver a ella y cada 30 s mientras haya pendientes.
 * El perfil de Jefatura no sale a ruta: no se le pide ubicación.
 */
export function MonitorCampo() {
  const { sesion } = useSesion();
  const token = sesion?.token ?? null;
  const idUsuario = sesion?.usuario.idUsuario ?? 0;
  const esTecnico = !!sesion && perfilDe(sesion.usuario) !== 'jefatura';
  const activo = !!token && esTecnico && !entorno.usarMock && Platform.OS !== 'web';

  const posicion = useRef<{ u: Ubicacion; en: number } | null>(null);
  const servicios = useRef<{ ids: number[]; en: number }>({ ids: [], en: 0 });
  const ultimoLatido = useRef(0);
  const avisoGps = useRef(false);

  // 1 y 2 · GPS y seguimiento
  useEffect(() => {
    if (!activo || !token) return;
    let vigente = true;
    let suscripcion: Location.LocationSubscription | null = null;
    let latiendo = false;

    function avisarGps(motivo: 'permiso' | 'apagado') {
      if (avisoGps.current) return; // una sola vez por apertura de la app
      avisoGps.current = true;
      Alert.alert(
        'Activa tu ubicación',
        motivo === 'permiso'
          ? 'Permite el acceso a la ubicación para que Operaciones vea tu posición mientras tienes un servicio en curso y puedas registrar demoras y tu llegada.'
          : 'Enciende el GPS del teléfono para que Operaciones vea tu posición mientras tienes un servicio en curso y puedas registrar demoras y tu llegada.',
        [{ text: 'Ahora no', style: 'cancel' }, { text: 'Abrir ajustes', onPress: () => void Linking.openSettings() }],
      );
    }

    async function latir() {
      const pos = posicion.current;
      if (latiendo || !token || !pos || Date.now() - pos.en > POSICION_VIGENTE_MS) return;
      if (Date.now() - ultimoLatido.current < CADA_LATIDO_MS - 5_000) return;
      latiendo = true;
      try {
        if (Date.now() - servicios.current.en > LISTA_VIGENTE_MS) {
          const lista = await obtenerServiciosProgramados(token, 'todos', '');
          servicios.current = { ids: lista.filter((s) => ESTADOS_EN_CURSO.includes(s.estadoOs)).map((s) => s.idOs), en: Date.now() };
        }
        ultimoLatido.current = Date.now();
        for (const idOs of servicios.current.ids) await enviarUbicacion(token, idOs, pos.u).catch(() => undefined);
      } catch {
        // sin conexión: se intenta en el siguiente latido
      } finally {
        latiendo = false;
      }
    }

    async function iniciarGps() {
      if (suscripcion) return;
      try {
        const permiso = await Location.requestForegroundPermissionsAsync();
        if (permiso.status !== 'granted') return avisarGps('permiso');
        if (Platform.OS === 'android' && !(await Location.hasServicesEnabledAsync())) {
          try {
            await Location.enableNetworkProviderAsync(); // diálogo del sistema: "Activar ubicación"
          } catch {
            return avisarGps('apagado');
          }
        }
        const nueva = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.Balanced, timeInterval: 30_000, distanceInterval: 15 },
          (p) => {
            if (p.mocked) return; // GPS falso: se ignora (igual que al registrar demoras y llegada)
            posicion.current = {
              u: {
                latitud: p.coords.latitude,
                longitud: p.coords.longitude,
                precisionMetros: Math.max(0, Math.round((p.coords.accuracy ?? 999) * 10) / 10),
              },
              en: Date.now(),
            };
            void latir();
          },
        );
        if (vigente && !suscripcion) suscripcion = nueva;
        else nueva.remove();
      } catch {
        // sin GPS por ahora: se vuelve a intentar cuando la app regrese a primer plano
      }
    }

    function pausarGps() {
      suscripcion?.remove();
      suscripcion = null;
    }

    void iniciarGps();
    const reloj = setInterval(() => void latir(), CADA_LATIDO_MS);
    const estadoApp = AppState.addEventListener('change', (e) => (e === 'active' ? void iniciarGps() : pausarGps()));
    return () => {
      vigente = false;
      clearInterval(reloj);
      estadoApp.remove();
      pausarGps();
    };
  }, [activo, token]);

  // 3 · Demoras guardadas sin conexión
  useEffect(() => {
    if (!activo || !token || !idUsuario) return;
    const mostrados = new Set<string>();
    let vigente = true;

    async function enviar() {
      if (!token || AppState.currentState !== 'active') return;
      try {
        if ((await pendientesDe(idUsuario)).length === 0) return;
        const r = await sincronizarPendientes(token, idUsuario);
        const nuevos = r.avisos.filter((a) => !mostrados.has(a));
        nuevos.forEach((a) => mostrados.add(a));
        if (vigente && nuevos.length > 0) Alert.alert('Demoras guardadas', nuevos.join('\n\n'));
      } catch {
        // se reintenta en el siguiente ciclo
      }
    }

    void enviar();
    const reloj = setInterval(() => void enviar(), CADA_COLA_MS);
    const estadoApp = AppState.addEventListener('change', (e) => {
      if (e === 'active') void enviar();
    });
    return () => {
      vigente = false;
      clearInterval(reloj);
      estadoApp.remove();
    };
  }, [activo, token, idUsuario]);

  return null;
}
