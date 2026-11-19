# Notificaciones push (bandeja de notificaciones del teléfono)

Cada notificación nueva (aprobaciones, alertas críticas, servicios, gastos, correlativos…) llega a la bandeja de notificaciones del teléfono, aunque la app esté cerrada.

## Cómo funciona

```
SP de cualquier módulo  →  INSERT en `notificacion`
        ↓ (cada 4 s)
PushNotificacionesWorker (API)  →  SP_ObtenerNotificacionesNuevas  →  filas nuevas con su destinatario
        ↓
SP_ObtenerDispositivosPushMovil  →  tokens de los teléfonos de ese usuario (solo con sesión de la app vigente)
        ↓
Expo Push (https://exp.host/--/api/v2/push/send)  →  Firebase (FCM)  →  bandeja del teléfono
```

- No se tocó ninguno de los ~40 SP que insertan notificaciones: el worker las detecta solo.
- La app (`src/notificaciones/RegistroPush.tsx`) pide el permiso, toma el token y lo registra en `POST api/movil/push/dispositivo` al iniciar sesión. Al cerrar sesión lo da de baja.
- Un usuario = un teléfono (igual que la sesión única) y un token pertenece a un solo usuario.
- Prioridad `critica` → canal Android **Alertas críticas** (máxima importancia). El resto → canal **Avisos**.
- Al tocar el aviso se abre la pestaña Notificaciones.

## Lo que hay que configurar UNA vez (no está en el código)

1. **Firebase** (https://console.firebase.google.com): crear un proyecto → agregar app Android con el paquete `com.totalweight.campo` → descargar `google-services.json` y guardarlo en la raíz de `frontend_mobile_tw/` (junto a `app.config.ts`). Sin ese archivo el APK compila, pero no recibe avisos en la bandeja.
   **El archivo NO se sube a git** (`.gitignore`). Para los builds en EAS se sube como variable de tipo archivo, una por entorno: `npx eas-cli@latest env:create --environment preview --name GOOGLE_SERVICES_JSON --type file --value ./google-services.json --visibility secret` (y lo mismo con `--environment development`). `app.config.ts` la lee de `process.env.GOOGLE_SERVICES_JSON` y, si no existe, usa el archivo local.
2. **Clave de FCM V1 en EAS**: en Firebase → Configuración del proyecto → Cuentas de servicio → "Generar nueva clave privada" (un `.json`). Subirla con `npx eas-cli@latest credentials` → Android → `preview` → Google Service Account → "Manage your Google Service Account Key for Push Notifications (FCM V1)" → subir el `.json`. **No guardar este archivo en el repositorio.**
3. **Base de datos**: ejecutar `backend_intranet_tw/database/_aplicar_push_movil.sql` en cada ambiente (staging, preprod…).
4. **APK nuevo** (`npm run apk`): `expo-notifications` es nativo (versión nativa 6). Con un APK anterior la app funciona igual, sin avisos en la bandeja.

Variables opcionales de la API (Railway): `PushMovil__Habilitado` (true), `PushMovil__IntervaloSegundos` (4), `PushMovil__AccessToken` (solo si en expo.dev se activa la "seguridad mejorada" de push).

## Cómo probar

1. Iniciar sesión en el APK nuevo y aceptar el permiso de notificaciones.
2. `SELECT * FROM dispositivo_push_movil WHERE eliminado_en IS NULL;` → debe aparecer el teléfono con un `ExponentPushToken[...]`.
3. Provocar una notificación (p. ej. una autorización de salida al jefe) con la app cerrada → debe aparecer en la bandeja.
4. En el log de la API: `Notificaciones push de la app: N enviadas`. Si dice un error, ahí está el motivo.
