import { entorno } from '@/config/entorno';
import { solicitar } from './cliente';
import type { Ubicacion } from './ruta';

/** Datos opcionales que da el GPS del teléfono para el panel "Estado de la señal GPS" de la intranet. */
export interface ExtrasUbicacion {
  velocidadKmh?: number | null;
  altitudM?: number | null;
}

/**
 * Posición GPS del técnico mientras su servicio está en curso (HU-51, alimenta el Seguimiento Operativo de la intranet).
 *   POST api/movil/servicios/{idOs}/ubicacion → SP_RegistrarUbicacionMovil
 * El back valida que la OS sea del técnico del token y que esté en ruta, en ejecución o en pausa; guarda como máximo una posición
 * cada 10 s por técnico. Con otro estado de la OS responde una regla de negocio (la app no insiste).
 */
export async function enviarUbicacion(token: string, idOs: number, u: Ubicacion, extras: ExtrasUbicacion = {}): Promise<void> {
  if (entorno.usarMock) return;
  await solicitar(`/api/movil/servicios/${encodeURIComponent(String(idOs))}/ubicacion`, {
    token,
    metodo: 'POST',
    cuerpo: {
      latitud: u.latitud,
      longitud: u.longitud,
      precisionMetros: u.precisionMetros,
      ...(extras.velocidadKmh != null ? { velocidadKmh: extras.velocidadKmh } : {}),
      ...(extras.altitudM != null ? { altitudM: extras.altitudM } : {}),
    },
  });
}
