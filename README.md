# App Mobile Total Weight — Servicio de Campo

App Android para los técnicos de campo de Total Weight. Usa el backend y la base de datos de la intranet: [backend_intranet_tw](https://github.com/cabonifaz/backend_intranet_tw), con la BD `total_weight_stg`.

- **Stack:** Expo SDK 58 · React Native 0.88 · TypeScript · Expo Router
- **Apps en el celular:** **TW Campo** (`com.totalweight.campo`) y **TW Campo (Dev)** (`com.totalweight.campo.dev`)

## Avance

| HU | Qué hace | Estado |
|----|----------|--------|
| HU-01 | Acceso seguro: login con usuario, recordar sesión, recuperar y cambiar contraseña, una sesión por equipo | ✅ |

### HU-01: cambios acordados sobre el mockup
1. **Solo usuario, nunca correo.** El jefe asigna el usuario desde la intranet. Si alguien escribe un correo, la app y el backend lo rechazan.
2. **Sin botón "Ingresar en modo offline".**
3. **Sin indicador "Online · Sincronizado".**
4. **Una sesión a la vez, en un solo equipo.** Si el usuario ya está abierto en otro celular, el ingreso se rechaza y el mensaje dice en qué equipo está. Se libera cuando:
   - el técnico toca **Cerrar sesión**,
   - la sesión vence (12 h), o
   - el jefe la libera desde la intranet.

   Es independiente de la sesión de la intranet.

## Estructura

```
src/
  app/                      Pantallas (Expo Router: cada archivo es una ruta)
    _layout.tsx             Rutas protegidas según la sesión
    login.tsx               HU-01
    recuperar-contrasena.tsx
    cambiar-contrasena.tsx  Obligatoria si la contraseña es temporal
    (app)/index.tsx         Inicio: "Mis datos" (de la BD) y, más adelante, la agenda
  api/                      Llamadas al backend, un archivo por módulo
    cliente.ts              URL, token, errores; un 401 cierra la sesión
    autenticacion.ts        Login, cierre y cambio de contraseña
    usuario.ts              Datos del usuario (tabla usuario)
    catalogos.ts            Catálogos de tabla_maestra
    mock.ts                 Las mismas funciones con datos de prueba (modo demo)
  hooks/useConsulta.ts      Carga datos en una pantalla (cargando, error, recargar)
  sesion/                   Sesión, almacenamiento seguro e id del equipo
  actualizaciones/          Descarga los avances publicados al abrir la app
  componentes/              Campo, botón, casilla, avisos, pantalla…
  config/entorno.ts         Variables EXPO_PUBLIC_*
  tema/colores.ts           Paleta del mockup
  utilidades/dialogos.ts    Alertas y confirmaciones
docs/BACKEND.md             Cómo se conecta con la BD y qué usa cada pantalla
```

## 1. Programar viendo los cambios en el celular (APK de desarrollo)

**Solo una vez**, y de nuevo cuando se agregue una librería nativa:
```powershell
npm install
npm run apk:dev
```
Instala el APK desde el link o el QR que aparece al terminar. En el celular se llama **TW Campo (Dev)**.

**Cada vez que programes:**
```powershell
npx expo start
```
1. En el celular abre **TW Campo (Dev)** → **Scan QR Code** y escanea el QR de la consola.
2. Cada vez que guardes un archivo, el celular se actualiza solo.

La PC y el celular deben estar en la misma WiFi; si no conecta, usa `npx expo start --tunnel`.

**El archivo `.env`** (cópialo desde `.env.example`) decide de dónde salen los datos:

| `.env` | Datos |
|---|---|
| `EXPO_PUBLIC_USE_MOCK=true` | Modo demo: `tecnico.demo` / `Demo1234`, o `tecnico.nuevo` / `Temporal1` para ver el cambio obligatorio de contraseña |
| `EXPO_PUBLIC_USE_MOCK=false` + `EXPO_PUBLIC_API_URL=http://<IP-de-tu-PC>:5277` | Tu BD real, a través del back levantado en tu PC |

Cada vez que cambies el `.env`, reinicia con `npx expo start --clear`.

## 2. APK para mostrar avances (un solo APK + actualizaciones)

**Solo una vez:**
1. `npx eas-cli@latest login`.
2. Revisa que `app.config.ts` tenga tu `EAS_PROJECT_ID` y tu `owner`.
3. `npm run modo:demo`. Mientras el back de staging no tenga la HU-01, usa `modo:demo`.
4. `npm run apk`: genera **TW Campo**. Instálalo en el celular.

**Cada avance, sin reinstalar:**
```powershell
npm run actualizar -- "HU-02 agenda de servicios"
```
En el celular, cierra la app por completo y vuelve a abrirla. Al pie del login verás `Versión 0.1.0 · act. <fecha>`.

**Pasar al backend real de staging:**
```powershell
npx eas-cli@latest env:set --environment preview --name EXPO_PUBLIC_API_URL --value https://<back-staging>.up.railway.app --visibility plaintext
npm run modo:real
npm run actualizar -- "Backend real"
```

**Cuándo sí hace falta un APK nuevo:** solo al agregar una librería nativa (cámara, GPS, notificaciones…). En ese caso sube `VERSION_NATIVA` en `app.config.ts` y vuelve a ejecutar `npm run apk` y `npm run apk:dev`.

## 3. Ver tus datos reales

Paso a paso en [docs/BACKEND.md](docs/BACKEND.md). En resumen:
1. Aplica en el back el parche de la HU-01 y ejecuta sus scripts en `total_weight_stg`.
2. Asígnale usuario de app a un técnico.
3. Levanta el back con `dotnet run --project src/TW.Intranet.API --urls http://0.0.0.0:5277`.
4. En el `.env` de la app usa la IP de tu PC.

## Comandos

| Comando | Para qué |
|---|---|
| `npx expo start` | Programar con el APK de desarrollo |
| `npm run apk:dev` | Generar **TW Campo (Dev)** |
| `npm run apk` | Generar **TW Campo** |
| `npm run actualizar -- "mensaje"` | Publicar un avance a **TW Campo** |
| `npm run modo:demo` / `npm run modo:real` | Elegir datos de prueba o el backend real para **TW Campo** |
| `npm run typecheck` / `npm run lint` | Revisar el código |
