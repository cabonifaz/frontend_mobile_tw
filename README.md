# App Mobile Total Weight — Servicio de Campo

App para los técnicos de campo de Total Weight. Usa el mismo backend de la intranet
(`backend_intranet_tw`, .NET 10 + MySQL).

- **Stack:** Expo SDK 58 · React Native 0.88 · TypeScript · Expo Router
- **Paquete Android:** `com.totalweight.campo` · nombre visible: **TW Campo**

## Avance

| HU | Pantalla | Estado |
|----|----------|--------|
| HU-01 | Acceso seguro (login, recordar sesión, recuperar y cambiar contraseña) | ✅ |

### HU-01: cambios acordados sobre el mockup

1. **Solo usuario, nunca correo.** El jefe asigna el usuario desde la intranet. Si alguien escribe un correo, la app y el backend lo rechazan.
2. **Se quitó el botón "Ingresar en modo offline".**
3. **Se quitó el indicador "Online · Sincronizado".**
4. **Una sesión a la vez, en un solo equipo.** Si el usuario ya tiene la sesión abierta en otro celular, el nuevo ingreso se rechaza y el mensaje dice en qué equipo está abierta. La sesión se libera cuando:
   - el técnico toca **Cerrar sesión**,
   - la sesión vence (12 h por defecto), o
   - el jefe la libera desde la intranet (`DELETE api/maestros/usuarios/{id}/sesion-movil`).

   La sesión de la app es **independiente de la intranet**: entrar al celular no cierra la intranet, y entrar a la intranet no cierra el celular.

**Otros comportamientos:**
- **Recordar sesión** guarda el token en el almacenamiento seguro del celular (Keystore). Al abrir la app se entra directo, siempre que la sesión siga vigente en el servidor.
- **Recuperar contraseña** explica los pasos: el jefe usa "Reenviar credenciales" en la intranet y el técnico entra con la contraseña temporal. Ahí la app obliga a crear una nueva, con las mismas reglas que la intranet.
- **Sesión cerrada desde afuera:** si el servidor responde 401 (sesión vencida, liberada o usuario desactivado), la app vuelve al login con un aviso.

## Estructura

```
src/
  app/                      Pantallas (Expo Router: cada archivo es una ruta)
    _layout.tsx             Rutas protegidas según la sesión
    login.tsx               HU-01
    recuperar-contrasena.tsx
    cambiar-contrasena.tsx  Obligatoria si la contraseña es temporal
    (app)/index.tsx         Inicio (aquí irá "Mi agenda")
  api/                      Llamadas al backend (cliente.ts maneja errores y el 401)
    mock.ts                 Datos de prueba para el modo demo
  sesion/                   Sesión, almacenamiento seguro e id del equipo
  componentes/              Campo, botón, casilla, avisos…
  tema/colores.ts           Paleta del mockup
```

## 1. Probar en tu PC con tu celular (Expo Go)

Requisitos: Node 20 o superior, y la app **Expo Go** instalada en tu Android (desde Play Store).

```powershell
cd app_mobile_tw
npm install
copy .env.example .env      # luego edita .env (ver abajo)
npx expo start
```

Escanea el QR con Expo Go. El celular y la PC tienen que estar en la **misma red WiFi**.
Si no conecta, usa `npx expo start --tunnel`.

### Opción A: sin backend (modo demo)

En `.env` pon `EXPO_PUBLIC_USE_MOCK=true`. Usuarios de prueba:

| Usuario | Contraseña | Qué muestra |
|---------|-----------|-------------|
| `tecnico.demo` | `Demo1234` | Login normal → inicio |
| `tecnico.nuevo` | `Temporal1` | Cambio de contraseña obligatorio |

### Opción B: con el backend real

1. **Base de datos:** ejecuta `HU01_app_movil_BD.sql` en DBeaver y después `HU01_datos_prueba.sql`, que asigna un usuario de app a un técnico.
2. **Backend:** aplica el parche y levántalo escuchando en la red, no solo en localhost:
   ```powershell
   dotnet run --project src/TW.Intranet.API --urls http://0.0.0.0:5277
   ```
   La primera vez, Windows puede pedir permiso en el firewall: acepta para redes privadas.
3. **IP de tu PC:** ejecuta `ipconfig` y toma la "Dirección IPv4" del adaptador WiFi (p. ej. `192.168.1.50`).
4. **`.env` de la app:**
   ```
   EXPO_PUBLIC_API_URL=http://192.168.1.50:5277
   EXPO_PUBLIC_USE_MOCK=false
   ```
5. **Levanta la app** con `npx expo start --clear`. El `--clear` es necesario cada vez que cambias el `.env`.

> No uses `localhost` en la URL: para el celular, "localhost" es el propio celular.

**Para probar la regla de un solo equipo**, entra con el mismo usuario en dos celulares, o en un celular y en el navegador (`npx expo start --web`). El segundo ingreso se rechaza hasta que el primero cierre sesión.

## 2. Generar el APK para ver el avance

El APK se compila en la nube con **EAS Build** (no necesitas Android Studio). Necesitas una cuenta gratuita en https://expo.dev.

**Solo la primera vez:**
```powershell
npx eas-cli@latest login
npx eas-cli@latest init
```
`init` crea el proyecto en expo.dev y te muestra un `projectId`. Como la configuración está en `app.config.ts`, agrega ese id dentro de `config`:

```ts
extra: { eas: { projectId: 'EL-ID-QUE-TE-DIO' } },
```

**Cada vez que quieras un APK nuevo:**

| Comando | Para qué |
|---------|----------|
| `npm run apk:demo` | APK en modo demo: no necesita backend, sirve para revisar pantallas |
| `npm run apk:preview` | APK contra el backend de staging (Railway) |

Antes de usar `apk:preview`, reemplaza `https://REEMPLAZAR-URL-STAGING.up.railway.app` en `eas.json` por la URL real de staging. Ese backend ya debe tener desplegados el parche y los scripts de BD.

Cuando termina el build (unos 10–20 min), la consola muestra un **link y un QR**. Ábrelo desde el celular, descarga el `.apk` e instálalo. Android te pedirá permitir "instalar apps desconocidas". Todos tus builds quedan listados en expo.dev → tu proyecto → Builds, para descargarlos cuando quieras o compartirlos con el cliente.

**Versiones:** antes de cada APK que entregues, sube `version` (p. ej. `0.2.0`) y `android.versionCode` (2, 3, …) en `app.config.ts`. La versión aparece al pie del login.

## Comandos útiles

```powershell
npm run typecheck   # revisa tipos de TypeScript
npm run lint        # revisa el código
npx expo start --web   # vista previa rápida en el navegador
```
