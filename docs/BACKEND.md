# La app y la base de datos

La app **no se conecta directo a MySQL**. Lee y escribe en la base de datos a través del **backend de la intranet** ([backend_intranet_tw](https://github.com/cabonifaz/backend_intranet_tw)), que es el mismo que usa la intranet. Por eso, todo lo que exista en la BD (usuarios, catálogos, clientes, órdenes de servicio…) aparece en la app en cuanto tenga su endpoint.

```
 ┌──────────────┐  HTTPS + JWT  ┌────────────────────────┐   SPs   ┌──────────────────┐
 │  App mobile  │ ────────────► │ backend_intranet_tw    │ ──────► │ MySQL            │
 │ (este repo)  │ ◄──────────── │ .NET 10 · Railway      │ ◄────── │ total_weight_stg │
 └──────────────┘    JSON       └────────────────────────┘         └──────────────────┘
   src/api/*.ts                   Controllers → Casos de uso         database/procedures
```

## Estructura de la app

```
src/
  api/                      Una carpeta = un módulo del backend
    cliente.ts              solicitar(): URL base, token, errores, 401 → cierra sesión
    autenticacion.ts        Login, cierre, cambio de contraseña
    usuario.ts              Datos del usuario (tabla usuario)
    catalogos.ts            Catálogos de tabla_maestra (con cache en memoria)
    mock.ts                 Las mismas funciones con datos de prueba (modo demo)
  hooks/
    useConsulta.ts          Carga datos en una pantalla: datos, cargando, error, recargar
  app/                      Pantallas (cada archivo es una ruta)
docs/
  BACKEND.md                Este archivo: qué usa cada pantalla
```

## Qué datos usa cada pantalla

| Pantalla | Endpoint del back | SP | Tablas |
|---|---|---|---|
| Login | `POST api/movil/autenticacion/iniciar-sesion` | `SP_ObtenerUsuarioPorNombreUsuario`, `SP_IniciarSesionMovil` | `usuario`, `sesion_usuario` |
| Cerrar sesión | `POST api/movil/autenticacion/cerrar-sesion` | `SP_CerrarSesionMovil` | `sesion_usuario` |
| Cambiar contraseña | `POST api/autenticacion/cambiar-contrasena` | `SP_CambiarContrasenaUsuario` | `usuario` |
| Menú (Ruta) · indicadores y Próximo Hit | `GET api/movil/menu/resumen` | `SP_ObtenerResumenMenuMovil` | `orden_servicio`, `os_personal`, `cliente`, `sede_cliente`, `tabla_maestra` |
| Menú · cargo del encabezado | `GET api/maestros/catalogos/CARGO_USUARIO` | `SP_ObtenerCatalogo` | `tabla_maestra` |
| Perfil · Mis datos | `GET api/autenticacion/me` | `SP_ObtenerUsuarioPorId` | `usuario` |
| Perfil · Área / Cargo | `GET api/maestros/catalogos/{AREA_USUARIO \| CARGO_USUARIO}` | `SP_ObtenerCatalogo` | `tabla_maestra` |

> Cada HU nueva agrega sus filas a esta tabla.

### Tablas ya creadas en la BD para la app de campo

Están en `01_crear_tablas.sql` del back. Por ahora no tienen SPs ni endpoints; se irán habilitando con cada HU:

| Bloque | Tablas |
|---|---|
| Agenda / OS | `orden_servicio`, `os_personal`, `os_equipo`, `backlog_programacion` |
| Ejecución | `evento_campo`, `demora_registro`, `incidencia_operativa`, `jornada_laboral` |
| Evidencias y cierre | `evidencia_fotografica`, `conformidad_digital`, `informe_tecnico`, `repuesto_instalado`, `item_presalida` |
| Metrología | `orden_metrologia`, `om_equipo`, `medicion_metrologica`, `variable_ambiental`, `patron_medicion` |
| SSOMA / gastos | `ssoma_documento`, `gasto_viatico` |

Catálogos útiles en `tabla_maestra`: `TIPO_EVENTO_CAMPO`, `TIPO_EVIDENCIA`, `MOTIVO_DEMORA_RUTA`, `TIPO_INCIDENCIA_OPERATIVA`, `NIVEL_ALERTA`, `MOTIVO_BLOQUEO_SSOMA`, `TIPO_PRUEBA_METROLOGICA`, `RESULTADO_CALIBRACION`, `CONCEPTO_GASTO`, `TIPO_SERVICIO`. Se leen con `obtenerCatalogo(token, 'NOMBRE')`.

## Receta: mostrar datos nuevos de la BD en la app

1. **BD + back** (repo del back): crea la migración y el SP en `database/`, y luego el caso de uso y el endpoint. El endpoint de la app solo necesita `[Authorize]`; el token de la app ya funciona con los `[Authorize]` existentes.
2. **API de la app**: crea o edita `src/api/<modulo>.ts` con la interfaz del DTO (en camelCase) y la función que llama a `solicitar()`:
   ```ts
   export async function obtenerMiAgenda(token: string): Promise<ServicioAgenda[]> {
     if (entorno.usarMock) return mockAgenda.obtener();
     const r = await solicitar<ServicioAgenda[]>('/api/movil/agenda', { token });
     return r.datos ?? [];
   }
   ```
3. **Modo demo**: agrega la misma función en `src/api/mock.ts`, con datos de ejemplo parecidos a los de la BD.
4. **Pantalla**: carga los datos con `useConsulta`:
   ```tsx
   const { datos, cargando, error, recargar } = useConsulta((token) => obtenerMiAgenda(token));
   ```
5. **Documenta** la fila nueva en la tabla "Qué datos usa cada pantalla".

**Reglas del back que la app respeta:**
- Respuesta `{ idTipoMensaje, mensaje, datos }`: `2` es éxito, `1` es una regla de negocio (se muestra el `mensaje`) y `3` es un error.
- Las fechas llegan en hora de Lima sin zona: conviértelas con `fechaDesdeApi()`.
- Los códigos de catálogo (`tecnico_campo`, `servicio_tecnico`…) se traducen con `nombreDeCodigo(catalogo, codigo)`.

## Ver tus datos reales mientras desarrollas

**Opción 1: back en tu PC contra `total_weight_stg`** (ves los cambios del back al instante)
1. En el back, `appsettings.Development.json` ya apunta a la BD. Levántalo escuchando en la red:
   ```powershell
   dotnet run --project src/TW.Intranet.API --urls http://0.0.0.0:5277
   ```
2. En la app, en el `.env`:
   ```
   EXPO_PUBLIC_API_URL=http://<IP-de-tu-PC>:5277
   EXPO_PUBLIC_USE_MOCK=false
   ```
3. `npx expo start --clear` y abre **TW Campo (Dev)**.

**Opción 2: back de staging en Railway** (la misma BD, sin levantar nada en tu PC)
```
EXPO_PUBLIC_API_URL=https://<back-staging>.up.railway.app
EXPO_PUBLIC_USE_MOCK=false
```

**Requisitos para entrar con un usuario real:**
- El back debe tener aplicado el parche de la HU-01 y ejecutados sus scripts en la BD.
- El técnico debe tener usuario de app asignado (`HU01_datos_prueba.sql` o `PUT api/maestros/usuarios/{id}/acceso-movil`).

Cualquier cambio en la BD (una OS nueva para el técnico, su área o nombre) se ve en la app al **deslizar hacia abajo** o con el botón de actualizar del menú.
