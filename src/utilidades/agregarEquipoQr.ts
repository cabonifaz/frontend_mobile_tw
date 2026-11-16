import { agregarEquipoExistente, verificarEquipoExistente, type EquipoAgregado } from '@/api/ingresoEquipos';
import { confirmar } from '@/utilidades/dialogos';

/**
 * Agregar a la OS un equipo escaneado que no está en su lista (HU-22 y selección de equipo, HU-07):
 *   1. el servidor valida el código SIN agregarlo (mismo cliente, activo, validado…) y devuelve los datos del equipo;
 *   2. la app los muestra y pregunta si está seguro de registrarlo en esa orden;
 *   3. solo con el «Sí» el equipo se registra en la OS.
 * Devuelve el equipo agregado, o null si el técnico no confirmó. Los errores del servidor se propagan con su mensaje.
 */
export async function agregarEquipoPorQrConfirmando(token: string, idOs: number, numeroOs: string, codigo: string): Promise<EquipoAgregado | null> {
  const previo = await verificarEquipoExistente(token, idOs, codigo);
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
  const acepta = await confirmar(
    '¿Agregar este equipo a la OS?',
    `${datos}\n\nEste equipo no está en la lista de ${numeroOs || 'esta orden'}. ¿Estás seguro de registrarlo en esta orden?`,
    'Sí, registrarlo',
    false,
  );
  if (!acepta) return null;
  return agregarEquipoExistente(token, idOs, codigo);
}
