This is an Expo/React Native mobile application. Prioritize mobile-first patterns, performance, and cross-platform compatibility.

## Proyecto: App Mobile Total Weight (Servicio de Campo)

- Nombres de variables, funciones, componentes y archivos en **español** (igual que el backend `backend_intranet_tw`).
- Backend: API .NET de la intranet. Respuestas con sobre `{ idTipoMensaje (1 regla | 2 éxito | 3 error), mensaje, datos }`; usar `src/api/cliente.ts` (`solicitar`), nunca `fetch` directo.
- Fechas del backend: hora de Lima sin zona → convertir con `fechaDesdeApi`.
- Acceso (HU-01): solo usuario (no correo), sin modo offline, 1 sesión por equipo (`api/movil/autenticacion/*`).
- Sin modo offline ni sincronización en ninguna pantalla: no mostrar "Online · Sincronizado", "Disponible offline", "Pendiente sincronizar" ni botones de refresh. Los datos se recargan al **deslizar hacia abajo** (`Pantalla` con `onRecargar`).
- Nombres de módulos iguales a los de la app actual de TW (Reloj Marcador, Servicios Programados, Procedimientos, Recepción Instrumentos OM, Ingreso de Equipos OS, Viáticos, Solicitud de Gastos, Configuraciones). Se definen en `src/menu/modulos.ts`; un módulo sin `ruta` abre "Próximamente".
- Estructura de rutas (opción B, sin carpeta `(app)`): pantallas con barra inferior en `src/app/(tabs)/`, pantallas sin barra en `src/app/<nombre>.tsx` o `src/app/modulo/`. Las rutas privadas se protegen en `src/app/_layout.tsx` con `Stack.Protected`. Una pantalla en `(tabs)` que no es pestaña se oculta con `tabBarButton: () => null` y `tabBarItemStyle: { display: 'none' }` (no usar `href: null`).
- Avance: HU-01 acceso, HU-02 menú principal, HU-03 agenda de servicios programados (`api/movil/servicios`).
- Cambios en la BD: migraciones y SPs idempotentes en el back, sin romper la intranet; entregar siempre los `.sql` para ejecutarlos en `total_weight_stg`.
- No hacer commit, push, ramas ni PR: el dueño del repo sube los cambios.
- Datos: la BD es una sola para la intranet y la app. No crear datos de prueba en la BD; usar los datos reales y avisar qué falta coordinar (`4_verificar_datos_reales.sql` en el paquete del back).
- Desarrollo seguro: token solo en SecureStore; el id del técnico siempre sale del token (nunca de parámetros: evita IDOR); todo endpoint nuevo de la app va en `api/movil/*` y hereda alcance del token, cabeceras y errores genéricos (`ControladorAppMovil` en el back); validar largo de entradas en la app y en el back; producción solo con `https://`.
- Al terminar cada HU: typecheck, lint, pruebas E2E con Playwright (web) contra el back y `pruebas_seguridad.mjs` contra la API.
- Todo endpoint nuevo debe tener su versión en `src/api/mock.ts` para el modo demo (`EXPO_PUBLIC_USE_MOCK=true`).
- La app lee la BD (`total_weight_stg`) solo a través del backend. Un archivo por módulo en `src/api/`, pantallas con `useConsulta`, catálogos con `obtenerCatalogo` + `nombreDeCodigo`.
- Cada pantalla nueva se documenta en la tabla de `docs/BACKEND.md` (endpoint → SP → tablas).

## Expo has changed — do not trust your training data

Expo ships breaking changes every SDK release. APIs you remember are likely renamed, moved, or removed. Before writing any code that touches an Expo, EAS, or React Native API:

1. Read the major version of the `expo` package in `package.json`.
2. Fetch the matching versioned docs: `https://docs.expo.dev/versions/v<major>.0.0/`
3. For anything else, fetch https://docs.expo.dev/llms.txt — an index of all Expo docs with corrections to common LLM misconceptions. Follow its links to the specific page you need; never answer from memory.

## Commands

Use `bunx` instead of `npx` if the project uses bun (`bun.lock` present).

```bash
npx expo install <package>  # ALWAYS use instead of npm/yarn/pnpm/bun add — resolves SDK-compatible versions
npx expo start              # start the dev server
npx expo lint               # lint
npx tsc --noEmit            # typecheck
npx expo-doctor             # diagnose dependency and config issues
npx expo install --fix      # fix incompatible package versions
```

Run lint and typecheck before declaring any task done.

## Navigation & Routing

- Use **Expo Router** for all navigation. Routes live in `src/app/` — every file there is a screen, `_layout.tsx` files define navigators. Keep non-route code (components, hooks, utils) outside `src/app/`.
- Import `Link`, `router`, and `useLocalSearchParams` from `expo-router`.
- Docs: https://docs.expo.dev/router/introduction.md

## Building with EAS

Use EAS to build, sign, and submit the app in the cloud (`eas build`, `eas submit`) and to ship over-the-air updates (`eas update`) — no local Xcode or Android Studio required. Run EAS CLI as `bunx eas-cli <command>` in Bun projects, or `npx eas-cli@latest <command>` otherwise; substitute that for bare `eas` in docs examples.
Docs: https://docs.expo.dev/eas/index.md

## Rules

- If `ios/` and `android/` directories do not exist, they are generated (Continuous Native Generation). Never create or edit them by hand — configure native behavior in `app.json` and config plugins.
- Expo Go only includes its bundled native modules. After adding a library with native code, the app needs a development build: `npx expo run:ios|android` locally, or `eas build --profile development`.
- Prefer recommended Expo modules over third-party libraries, and check your available skills before adding dependencies. Docs: https://docs.expo.dev/versions/latest/index.md
