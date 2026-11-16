import { agregarEquipoExistente, verificarEquipoExistente, type EquipoAgregado } from '@/api/ingresoEquipos';
import { confirmar } from '@/utilidades/dialogos';

/**
 * Agregar a la OS un equipo escaneado que no está en su lista (HU-22 y selección de equipo, HU-07):
 *   1. el servidor valida el código SIN agregarlo (mismo cliente, activo, validado…) y devuelve los datos del equipo y el objetivo que ocuparía;
 *   2. la app los muestra y pregunta si está seguro de registrarlo en esa orden;
 *   3. solo con el «Sí» el equipo se registra: ocupa el lugar del equipo de un objetivo sin iniciar (no se crea un objetivo nuevo) o, si todos
 *      los objetivos ya se iniciaron, se agrega como objetivo nuevo.
 * `objetivo` es el objetivo de la pantalla (Selección de equipo); sin él el servidor usa el primero sin iniciar.
 * Devuelve el equipo agregado, o null si el técnico no confirmó. Los errores del servidor se propagan con su mensaje.
 */
export async function agregarEquipoPorQrConfirmando(
  token: string,
  idOs: number,
  numeroOs: string,
  codigo: string,
  objetivo?: { idOsEquipo: number; numero: number },
): Promise<EquipoAgregado | null> {
  const previo = await verificarEquipoExistente(token, idOs, codigo, objetivo?.idOsEquipo);
  const marcaModelo = [previo.marca, previo.modelo].map((v) => v?.trim()).filter(Boolean).join(' ');
  const datos = [
    previo.codigoTw,
    marcaModelo || null,
    previo.numSerie?.trim() ? `N/S: ${previo.numSerie.trim()}` : null,
    previo.codigoCliente?.trim() ? `Código del cliente: ${previo.codigoCliente.trim()}` : null,
    previo.ubicacion?.trim() ? `Ubicación: ${previo.ubicacion.trim()}` : null,
  ]
    .filter(Boolean)
    .join('\n');
  const reemplaza = previo.reemplazaCodigoTw?.trim();
  const efecto = reemplaza
    ? `Ocupará el lugar de ${reemplaza}${previo.reemplazaNombre?.trim() ? ` (${previo.reemplazaNombre.trim()})` : ''} en ${objetivo ? `el Objetivo ${objetivo.numero}` : 'su objetivo'}: el servicio seguirá teniendo los mismos objetivos.`
    : `Se agregará como un objetivo nuevo de ${numeroOs || 'la orden'} (todos los objetivos ya se iniciaron).`;
  const acepta = await confirmar('¿Usar este equipo en la OS?', `${datos}\n\n${efecto}\n\n¿Estás seguro de registrarlo en esta orden?`, 'Sí, registrarlo', false);
  if (!acepta) return null;
  return agregarEquipoExistente(token, idOs, codigo, objetivo?.idOsEquipo);
}
