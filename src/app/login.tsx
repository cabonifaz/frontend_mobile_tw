import { useRef, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View, type TextInputInstance } from 'react-native';
import { Link } from 'expo-router';
import { ErrorApi } from '@/api/cliente';
import { entorno } from '@/config/entorno';
import { Aviso } from '@/componentes/Aviso';
import { Boton } from '@/componentes/Boton';
import { CampoTexto } from '@/componentes/CampoTexto';
import { Casilla } from '@/componentes/Casilla';
import { Pantalla } from '@/componentes/Pantalla';
import { PieLogin } from '@/componentes/PieLogin';
import { useSesion } from '@/sesion/SesionContext';
import { colores, radios } from '@/tema/colores';

/**
 * App Mobile HU-01 — Acceso Seguro.
 * Cambios pedidos sobre el mockup:
 *  1. Solo usuario (asignado por el jefe), no correo.
 *  2. Sin botón "Ingresar en modo offline".
 *  3. Sin indicador "Online · Sincronizado".
 *  4. 1 sesión a la vez: si el usuario ya está en otro equipo, el backend lo rechaza
 *     y aquí se muestra el mensaje con el equipo donde está abierta.
 */
export default function PantallaLogin() {
  const { iniciarSesion, aviso, limpiarAviso, ultimoUsuario } = useSesion();
  // Si la persona marcó "Recordar sesión" antes, se precarga su usuario.
  const [usuario, setUsuario] = useState(ultimoUsuario ?? '');
  const [contrasena, setContrasena] = useState('');
  const [recordar, setRecordar] = useState(!!ultimoUsuario);
  const [enviando, setEnviando] = useState(false);
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const [errores, setErrores] = useState<{ usuario?: string; contrasena?: string }>({});
  const refContrasena = useRef<TextInputInstance>(null);

  function validar(): boolean {
    const u = usuario.trim();
    const nuevos: typeof errores = {};
    if (!u) nuevos.usuario = 'Ingresa tu usuario.';
    else if (u.includes('@')) nuevos.usuario = 'Ingresa tu usuario, no tu correo.';
    if (!contrasena) nuevos.contrasena = 'Ingresa tu contraseña.';
    setErrores(nuevos);
    return Object.keys(nuevos).length === 0;
  }

  async function ingresar() {
    limpiarAviso();
    setErrorGeneral(null);
    if (!validar()) return;

    setEnviando(true);
    try {
      await iniciarSesion(usuario, contrasena, recordar);
      // La navegación cambia sola al existir sesión (rutas protegidas en _layout).
    } catch (e) {
      setErrorGeneral(e instanceof ErrorApi ? e.message : 'No se pudo iniciar sesión. Inténtalo de nuevo.');
      setContrasena('');
    } finally {
      setEnviando(false);
    }
  }

  const mensaje = errorGeneral ?? aviso;

  return (
    <Pantalla>
      <View style={estilos.cabecera}>
        <Image
          source={require('../../assets/images/totalweight-logo.png')}
          style={estilos.logo}
          resizeMode="contain"
          accessibilityLabel="Total Weight"
        />
        <Text style={estilos.titulo} accessibilityRole="header">
          Servicio de Campo
        </Text>
        <Text style={estilos.subtitulo}>Gestión técnica y operativa</Text>
      </View>

      <View style={estilos.tarjeta}>
        <CampoTexto
          etiqueta="Usuario"
          placeholder="Ingresa tu usuario"
          value={usuario}
          onChangeText={(t) => {
            setUsuario(t.replace(/\s/g, '').toLowerCase());
            if (errores.usuario) setErrores((p) => ({ ...p, usuario: undefined }));
          }}
          error={errores.usuario}
          autoComplete="username"
          maxLength={50}
          textContentType="username"
          returnKeyType="next"
          onSubmitEditing={() => refContrasena.current?.focus()}
          submitBehavior="submit"
          editable={!enviando}
          testID="campo-usuario"
        />

        <CampoTexto
          ref={refContrasena}
          etiqueta="Contraseña"
          placeholder="Ingresa tu contraseña"
          esContrasena
          value={contrasena}
          onChangeText={(t) => {
            setContrasena(t);
            if (errores.contrasena) setErrores((p) => ({ ...p, contrasena: undefined }));
          }}
          error={errores.contrasena}
          autoComplete="current-password"
          maxLength={128}
          textContentType="password"
          returnKeyType="go"
          onSubmitEditing={ingresar}
          editable={!enviando}
          testID="campo-contrasena"
        />

        <View style={estilos.filaOpciones}>
          <Casilla etiqueta="Recordar sesión" marcada={recordar} onCambiar={setRecordar} />
          <Link href="/recuperar-contrasena" asChild>
            <Pressable hitSlop={8} accessibilityRole="link">
              <Text style={estilos.enlace}>Recuperar contraseña</Text>
            </Pressable>
          </Link>
        </View>

        {!!mensaje && (
          <View style={estilos.mensaje}>
            <Aviso tipo="error" mensaje={mensaje} />
          </View>
        )}

        <Boton titulo="Iniciar sesión" onPress={ingresar} cargando={enviando} />

        {entorno.usarMock && (
          <View style={estilos.demo}>
            <Aviso mensaje="Modo demo (sin backend). Ingresa con tecnico.demo / Demo1234." />
          </View>
        )}
      </View>

      <PieLogin />
    </Pantalla>
  );
}

const estilos = StyleSheet.create({
  cabecera: { alignItems: 'center', marginTop: 8, marginBottom: 24 },
  logo: { width: 210, height: 64, marginBottom: 20 },
  titulo: { fontSize: 28, fontWeight: '700', color: colores.titulo, textAlign: 'center' },
  subtitulo: { fontSize: 16, color: colores.textoSecundario, marginTop: 8, textAlign: 'center' },
  tarjeta: {
    backgroundColor: colores.tarjeta,
    borderRadius: radios.tarjeta,
    borderWidth: 1,
    borderColor: '#E3E9F1',
    padding: 22,
    shadowColor: '#0B1F3A',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  filaOpciones: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
    marginBottom: 22,
    flexWrap: 'wrap',
    rowGap: 12,
  },
  enlace: { fontSize: 14, color: colores.primario, fontWeight: '500' },
  mensaje: { marginBottom: 16 },
  demo: { marginTop: 16 },
});
