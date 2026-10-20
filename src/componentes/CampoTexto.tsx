import { forwardRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, type TextInputInstance, type TextInputProps } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colores, radios } from '@/tema/colores';

interface Props extends Omit<TextInputProps, 'style'> {
  etiqueta: string;
  error?: string | null;
  /** Campo de contraseña con el ícono de ojo para mostrar/ocultar. */
  esContrasena?: boolean;
}

export const CampoTexto = forwardRef<TextInputInstance, Props>(function CampoTexto(
  { etiqueta, error, esContrasena = false, onFocus, onBlur, editable = true, ...resto },
  ref,
) {
  const [enfocado, setEnfocado] = useState(false);
  const [visible, setVisible] = useState(false);

  return (
    <View style={estilos.contenedor}>
      <Text style={estilos.etiqueta}>{etiqueta}</Text>
      <View
        style={[
          estilos.caja,
          enfocado && estilos.cajaFoco,
          !!error && estilos.cajaError,
          !editable && estilos.cajaDeshabilitada,
        ]}
      >
        <TextInput
          ref={ref}
          style={estilos.input}
          placeholderTextColor={colores.placeholder}
          secureTextEntry={esContrasena && !visible}
          autoCapitalize="none"
          autoCorrect={false}
          editable={editable}
          onFocus={(e) => {
            setEnfocado(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setEnfocado(false);
            onBlur?.(e);
          }}
          {...resto}
        />
        {esContrasena && (
          <Pressable
            onPress={() => setVisible((v) => !v)}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            style={estilos.ojo}
          >
            <Ionicons name={visible ? 'eye-off-outline' : 'eye-outline'} size={22} color={colores.textoSecundario} />
          </Pressable>
        )}
      </View>
      {!!error && <Text style={estilos.error}>{error}</Text>}
    </View>
  );
});

const estilos = StyleSheet.create({
  contenedor: { marginBottom: 18 },
  etiqueta: { fontSize: 15, fontWeight: '600', color: colores.titulo, marginBottom: 8 },
  caja: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colores.borde,
    borderRadius: radios.campo,
    backgroundColor: colores.blanco,
    minHeight: 50,
  },
  cajaFoco: { borderColor: colores.bordeFoco, borderWidth: 1.5 },
  cajaError: { borderColor: colores.error },
  cajaDeshabilitada: { backgroundColor: '#F1F4F8' },
  input: { flex: 1, minWidth: 0, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: colores.texto },
  ojo: { paddingHorizontal: 14, paddingVertical: 10 },
  error: { color: colores.error, fontSize: 13, marginTop: 6 },
});
