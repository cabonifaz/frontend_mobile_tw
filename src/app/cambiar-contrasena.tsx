import { useRef, useState } from 'react';
import { StyleSheet, Text, View, type TextInputInstance } from 'react-native';
import { router } from 'expo-router';
import { ErrorApi } from '@/api/cliente';
import { Aviso } from '@/componentes/Aviso';
import { Boton } from '@/componentes/Boton';
import { CampoTexto } from '@/componentes/CampoTexto';
import { Pantalla } from '@/componentes/Pantalla';
import { useSesion } from '@/sesion/SesionContext';
import { colores, radios } from '@/tema/colores';
import { avisar } from '@/utilidades/dialogos';

/**
 * Cambio de contraseña. Es obligatorio cuando el jefe asignó una contraseña temporal
 * (forzar_cambio_contrasena). Usa el endpoint existente api/autenticacion/cambiar-contrasena,
 * con las mismas reglas de la intranet.
 */
const reglas: { texto: string; cumple: (c: string) => boolean }[] = [
  { texto: 'Al menos 8 caracteres', cumple: (c) => c.length >= 8 },
  { texto: 'Una letra mayúscula', cumple: (c) => /[A-ZÁÉÍÓÚÑ]/.test(c) },
  { texto: 'Una letra minúscula', cumple: (c) => /[a-záéíóúñ]/.test(c) },
  { texto: 'Un número', cumple: (c) => /\d/.test(c) },
];

export default function PantallaCambiarContrasena() {
  const { sesion, cambiarContrasena, cerrarSesion } = useSesion();
  const obligatorio = !!sesion?.usuario.forzarCambioContrasena;

  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [confirmacion, setConfirmacion] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refNueva = useRef<TextInputInstance>(null);
  const refConfirmacion = useRef<TextInputInstance>(null);

  async function guardar() {
    setError(null);
    if (!actual || !nueva || !confirmacion) return setError('Completa los tres campos.');
    if (!reglas.every((r) => r.cumple(nueva))) return setError('La nueva contraseña no cumple los requisitos.');
    if (nueva !== confirmacion) return setError('La confirmación no coincide con la nueva contraseña.');
    if (nueva === actual) return setError('La nueva contraseña debe ser distinta de la actual.');

    setEnviando(true);
    try {
      const mensaje = await cambiarContrasena(actual, nueva);
      avisar('Contraseña actualizada', mensaje || 'Tu contraseña se cambió correctamente.');
      if (!obligatorio && router.canGoBack()) router.back();
      // Si era obligatorio, la navegación pasa sola a la app al quitarse el flag.
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : 'No se pudo cambiar la contraseña.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Pantalla>
      <Text style={estilos.titulo} accessibilityRole="header">
        {obligatorio ? 'Crea tu nueva contraseña' : 'Cambiar contraseña'}
      </Text>
      <Text style={estilos.subtitulo}>
        {obligatorio
          ? `Hola ${sesion?.usuario.nombre ?? ''}, ingresaste con una contraseña temporal. Crea una nueva para continuar.`
          : 'Ingresa tu contraseña actual y la nueva.'}
      </Text>

      <View style={estilos.tarjeta}>
        <CampoTexto
          etiqueta={obligatorio ? 'Contraseña temporal' : 'Contraseña actual'}
          esContrasena
          value={actual}
          onChangeText={setActual}
          returnKeyType="next"
          onSubmitEditing={() => refNueva.current?.focus()}
          submitBehavior="submit"
          editable={!enviando}
        />
        <CampoTexto
          ref={refNueva}
          etiqueta="Nueva contraseña"
          esContrasena
          value={nueva}
          onChangeText={setNueva}
          returnKeyType="next"
          onSubmitEditing={() => refConfirmacion.current?.focus()}
          submitBehavior="submit"
          editable={!enviando}
        />

        <View style={estilos.reglas}>
          {reglas.map((r) => {
            const ok = r.cumple(nueva);
            return (
              <Text key={r.texto} style={[estilos.regla, ok && estilos.reglaOk]}>
                {ok ? '✓' : '•'} {r.texto}
              </Text>
            );
          })}
        </View>

        <CampoTexto
          ref={refConfirmacion}
          etiqueta="Confirmar nueva contraseña"
          esContrasena
          value={confirmacion}
          onChangeText={setConfirmacion}
          returnKeyType="go"
          onSubmitEditing={guardar}
          editable={!enviando}
        />

        {!!error && (
          <View style={{ marginBottom: 16 }}>
            <Aviso tipo="error" mensaje={error} />
          </View>
        )}

        <Boton titulo="Guardar contraseña" onPress={guardar} cargando={enviando} />
      </View>

      <View style={{ marginTop: 16 }}>
        {obligatorio ? (
          <Boton titulo="Cerrar sesión" variante="secundario" onPress={() => void cerrarSesion()} deshabilitado={enviando} />
        ) : (
          <Boton titulo="Cancelar" variante="secundario" onPress={() => router.back()} deshabilitado={enviando} />
        )}
      </View>
    </Pantalla>
  );
}

const estilos = StyleSheet.create({
  titulo: { fontSize: 24, fontWeight: '700', color: colores.titulo, marginTop: 16 },
  subtitulo: { fontSize: 15, lineHeight: 22, color: colores.textoSecundario, marginTop: 8, marginBottom: 20 },
  tarjeta: {
    backgroundColor: colores.tarjeta,
    borderRadius: radios.tarjeta,
    borderWidth: 1,
    borderColor: '#E3E9F1',
    padding: 20,
  },
  reglas: { marginTop: -8, marginBottom: 18 },
  regla: { fontSize: 13, color: colores.textoTenue, marginBottom: 3 },
  reglaOk: { color: colores.exito },
});
