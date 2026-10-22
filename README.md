# App Mobile Total Weight — Servicio de Campo

App Android para los técnicos de campo de Total Weight. Usa el backend y la base de datos de la intranet: [backend_intranet_tw](https://github.com/cabonifaz/backend_intranet_tw), con la BD `total_weight_stg`.

- **Stack:** Expo SDK 58 · React Native 0.88 · TypeScript · Expo Router
- **Apps en el celular:** **TW Campo** (`com.totalweight.campo`) y **TW Campo (Dev)** (`com.totalweight.campo.dev`)

## Avance

| HU | Qué hace | Estado |
|----|----------|--------|
| HU-01 | Acceso seguro: login con usuario, recordar sesión, recuperar y cambiar contraseña, una sesión por equipo | ✅ |
| HU-02 | Menú principal: cuadrícula de módulos, indicadores desde la BD, banner "Próximo Hit", pestañas Ruta / Notificaciones / Asistente / Perfil | ✅ |
| HU-03 | Agenda de Servicios Programados: buscador, filtros Todos / Hoy / Pendientes / En ejecución, tarjetas LISTO / PENDIENTE / BLOQUEADO | ✅ |

### HU-03: decisiones sobre el mockup
- **Sin "Disponible offline" ni "Pendiente sincronizar"**, porque el modo offline se quitó en la HU-01. Tampoco hay botón de refresh: se desliza hacia abajo.
- **Estado de la tarjeta** (calculado en la BD):
  - **BLOQUEADO:** OS bloqueada, expediente con bloqueo sin resolver o SSOMA del técnico bloqueado. Muestra el motivo y deshabilita el detalle.
  - **LISTO:** cliente confirmado y SSOMA habilitado.
  - **PENDIENTE:** cualquier otro caso.
- **Objetivos:** equipos de la OS (`os_equipo`) con informe técnico enviado o aprobado.
- **Se abre desde:** "Servicios Programados", "Ruta del Día" (ya filtrada en **Hoy**) o el banner "Próximo Hit". La barra inferior se mantiene, con **Ruta** marcada.
- **"Ver detalle":** abre el detalle del servicio, que llega en la siguiente HU (por ahora muestra "Próximamente").

### HU-02: decisiones sobre el mockup
- **Sin "Online · Sincronizado", sin tarjeta "Sincronización · 12 pendientes" y sin botón de refresh.** El modo offline se quitó en la HU-01. Los indicadores se leen al abrir el menú y al **deslizar hacia abajo**.
- **Nombres de los módulos iguales a los de la app actual de TW** (menú lateral): "Ingreso de Equipos OS", "Configuraciones", etc. Son nuevos "Ruta del Día" y "Asistente IA". El "Cerrar App" de la app actual está en **Perfil → Cerrar sesión**.
- **Indicadores reales:** "Servicios Programados" cuenta las OS vigentes del técnico (principal o en `os_personal`); "Ruta del Día" cuenta las de hoy; el banner muestra la OS en curso o la siguiente.
- **Avatar:** se usan las iniciales del técnico, porque la BD no guarda foto.
- **Módulos aún no desarrollados:** abren una pantalla "Próximamente". Para habilitar uno, se cambia su `ruta` en `src/menu/modulos.ts`.

### HU-01: cambios acordados sobre el mockup
1. **Solo usuario, nunca correo.** El jefe asigna el usuario desde la intranet. Si alguien escribe un correo, la app y el backend lo rechazan.
2. **Sin botón "Ingresar en modo offline".**
3. **Sin indicador "Online · Sincronizado".**
4. **Una sesión a la vez, en un solo equipo.** Si el usuario ya está abierto en otro celular, el ingreso se rechaza y el mensaje dice en qué equipo está. Se libera cuando:
   - el técnico toca **Cerrar sesión**,
   - la sesión vence (12 h), o
   - el jefe la libera desde la intranet.

   Es independiente de la sesión de la intranet.

## Seguridad (desarrollo seguro)

| Dónde | Qué se hace |
|---|---|
| App | El token se guarda en el almacenamiento seguro del celular (Keystore), nunca en texto plano. Un 401 cierra la sesión local. |
| App | Límites de largo en usuario (50), contraseña (128) y búsqueda (100). El build de **producción** se niega a compilar si la URL del back no es `https://`. |
| Back | Mismo mensaje y mismo tiempo de respuesta para "usuario no existe" y "contraseña errada" (no se puede adivinar qué usuarios existen). |
| Back | Bloqueo de 15 min tras 5 intentos fallidos del mismo usuario y máximo 10 ingresos por minuto por IP (respuesta 429). Configurable con `AppMovil__*`. |
| Back | El token de la app solo sirve en las rutas de la app (`api/movil/*`, `me`, cambiar contraseña y catálogos); el token de la intranet no sirve en `api/movil/*`. |
| Back | Cada técnico solo ve **sus** servicios: el id sale del token, no de parámetros. Los SP usan parámetros (sin SQL armado con texto). |
| Back | Respuestas de `api/movil/*` con cabeceras `nosniff`, `no-store`, `DENY` y errores sin detalles internos (el detalle queda en el log). |

**Pruebas de Ethical Hacking:** `tests/seguridad-app-movil/pruebas_seguridad.mjs` (en el repo del back) ataca la API con 23 pruebas basadas en OWASP Top 10: JWT sin firma o con claves débiles, token alterado, inyección SQL, IDOR, fuerza bruta, sesión duplicada, reutilización de token, cabeceras, fugas de errores. Se ejecuta con Node, sin instalar nada.

## Estructura

```
src/
  app/                      Pantallas (Expo Router: cada archivo es una ruta)
    _layout.tsx             Rutas protegidas según la sesión
    login.tsx               HU-01
    recuperar-contrasena.tsx
    cambiar-contrasena.tsx  Obligatoria si la contraseña es temporal
    (tabs)/                 Pantallas con la barra inferior. Los paréntesis no van en la URL
      _layout.tsx           Dibuja la barra: Ruta · Notificaciones · Asistente · Perfil
      index.tsx             Ruta: menú principal con indicadores y banner "Próximo Hit"
      notificaciones.tsx    (próximamente)
      asistente.tsx         (próximamente)
      perfil.tsx            Mis datos (de la BD), cambiar contraseña, cerrar sesión
      servicios-programados.tsx  HU-03 Agenda (sin botón propio en la barra; se entra desde el menú)
    modulo/[id].tsx         Módulos del menú aún no desarrollados ("Próximamente"), sin barra inferior
  api/                      Llamadas al backend, un archivo por módulo
    cliente.ts              URL, token, errores; un 401 cierra la sesión
    autenticacion.ts        Login, cierre y cambio de contraseña
    usuario.ts              Datos del usuario (tabla usuario)
    catalogos.ts            Catálogos de tabla_maestra
    menu.ts                 Indicadores del menú (orden_servicio)
    servicios.ts            Agenda de servicios programados (HU-03)
    mock.ts                 Las mismas funciones con datos de prueba (modo demo)
  hooks/useConsulta.ts      Carga datos en una pantalla (cargando, error, recargar)
  menu/modulos.ts           Módulos del menú: título, ícono, indicador y ruta
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

**El archivo `.env`** (créalo en la raíz del proyecto; no se sube a GitHub) decide de dónde salen los datos:

| `.env` | Datos |
|---|---|
| `EXPO_PUBLIC_USE_MOCK=true` | Modo demo: `tecnico.demo` / `Demo1234`, o `tecnico.nuevo` / `Temporal1` para ver el cambio obligatorio de contraseña |
| `EXPO_PUBLIC_USE_MOCK=false` + `EXPO_PUBLIC_API_URL=https://backendintranettw-staging.up.railway.app` | BD real `total_weight_stg`, a través del back de staging |
| `EXPO_PUBLIC_USE_MOCK=false` + `EXPO_PUBLIC_API_URL=http://<IP-de-tu-PC>:5277` | BD real, a través del back levantado en tu PC |

Cada vez que cambies el `.env`, reinicia con `npx expo start --clear`.

## 2. APK para mostrar avances (un solo APK + actualizaciones)

**Solo una vez:**
1. `npx eas-cli@latest login`.
2. Revisa que `app.config.ts` tenga tu `EAS_PROJECT_ID` y tu `owner`.
3. `npm run modo:demo`. Usa `modo:demo` mientras el back de staging no tenga desplegado el paquete `backend_app_movil_HU01_a_HU03`.
4. `npm run apk`: genera **TW Campo**. Instálalo en el celular.

**Cada avance, sin reinstalar:**
```powershell
npm run actualizar -- "HU-03 agenda de servicios"
```
En el celular, cierra la app por completo y vuelve a abrirla. Al pie del login verás `Versión 0.1.0 · act. <fecha>`.

**Pasar al backend real de staging:**
```powershell
npx eas-cli@latest env:set --environment preview --name EXPO_PUBLIC_API_URL --value https://backendintranettw-staging.up.railway.app --visibility plaintext
npm run modo:real
npm run actualizar -- "Backend real"
```

**Cuándo sí hace falta un APK nuevo:** solo al agregar una librería nativa (cámara, GPS, notificaciones…). En ese caso sube `VERSION_NATIVA` en `app.config.ts` y vuelve a ejecutar `npm run apk` y `npm run apk:dev`.

## 3. Ver tus datos reales

Paso a paso en [docs/BACKEND.md](docs/BACKEND.md). En resumen:
La app usa **los mismos datos de la intranet** (una sola BD). No hay datos de prueba en la BD.
1. Copia en el back la carpeta `backend_intranet_tw` del paquete del back (rutas exactas del repo).
2. Ejecuta en `total_weight_stg` el script `1_BD_app_movil_HU01_a_HU03.sql` (se puede repetir sin problema).
3. Con `2_ver_cuentas_para_la_app.sql` ves los técnicos de la intranet; con `3_asignar_usuario_app.sql` le das usuario de app a uno. Entra con ese usuario y **su misma contraseña de la intranet**.
4. `4_verificar_datos_reales.sql` dice, HU por HU, si los datos de la intranet alcanzan y qué hay que coordinar con el equipo.
5. Apunta el `.env` al back de staging o a la IP de tu PC.

Si una cuenta no puede entrar, `5_diagnostico_acceso_app.sql` dice por qué.

## Comandos

| Comando | Para qué |
|---|---|
| `npx expo start` | Programar con el APK de desarrollo |
| `npm run apk:dev` | Generar **TW Campo (Dev)** |
| `npm run apk` | Generar **TW Campo** |
| `npm run actualizar -- "mensaje"` | Publicar un avance a **TW Campo** |
| `npm run modo:demo` / `npm run modo:real` | Elegir datos de prueba o el backend real para **TW Campo** |
| `npm run typecheck` / `npm run lint` | Revisar el código |
