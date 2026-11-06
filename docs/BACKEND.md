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
    menu.ts                 Indicadores del menú (HU-02)
    servicios.ts            Agenda de servicios programados (HU-03)
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
| Detalle del servicio (HU-04) | `GET api/movil/servicios/{idOs}` | `SP_ObtenerDetalleServicioMovil` | `orden_servicio`, `cliente`, `sede_cliente`, `contacto_cliente`, `contacto_sede`, `requerimiento`, `orden_metrologia`, `alerta_predictiva`, `os_riesgo`, `item_presalida`, `equipo_historial`, `auditoria_evento`, `documento_adjunto`, `programacion`, `programacion_tecnico`, `programacion_equipo`, `programacion_confirmacion`, `os_concepto`, `equipo_cliente` |
| Checklist de pre-salida (HU-04) | `GET api/movil/servicios/{idOs}/checklist` · `PUT …/checklist/{codigo}` | `SP_ObtenerChecklistSalidaMovil`, `SP_MarcarChecklistSalidaMovil` | `checklist_presalida_os`, `os_personal`, `expediente_digital`, `item_presalida`, `alerta_predictiva`, `autorizacion_salida_os` |
| Solicitar autorización (HU-04) | `POST api/movil/servicios/{idOs}/solicitar-autorizacion` | `SP_SolicitarAutorizacionSalidaMovil` | `autorizacion_salida_os`, `requerimiento`, `area_servicio_rq`, `notificacion`, `auditoria_evento` (notifica al Jefe de Servicio Técnico o al Jefe de Metrología según el área de la RQ) |
| Iniciar traslado (HU-04) | `POST api/movil/servicios/{idOs}/iniciar-traslado` | `SP_IniciarTrasladoMovil` | `orden_servicio`, `evento_campo`, `auditoria_evento` |
| Notificaciones (HU-02 / HU-04) | `GET api/movil/notificaciones` · `PUT api/movil/notificaciones/{id}/leida` · `PUT api/movil/notificaciones/leidas` | `SP_ObtenerNotificacionesMovil`, `SP_MarcarNotificacionMovil` | `notificacion`, `autorizacion_salida_os` (las 60 más recientes del token; solo se marcan las propias) |
| Registro de demoras (HU-05) | `GET api/movil/servicios/{idOs}/demoras` · `POST …/demoras` (multipart: `tipo`, `idMotivo`, `duracionMinutos`, `descripcion`, `latitud`, `longitud`, `precisionMetros`, `capturadoEn`, `foto`) | `SP_ObtenerDemorasMovil`, `SP_ObtenerEtaDemorasMovil`, `SP_RegistrarDemoraMovil` | `demora_registro`, `orden_servicio`, `evento_campo`, `tabla_maestra` (MOTIVO_DEMORA_RUTA), `usuario`, `notificacion`, `auditoria_evento` (avisa a Operaciones; la foto se guarda en `demoras/{idOs}/…`) |
| Seguimiento del técnico (HU-51) | `POST api/movil/servicios/{idOs}/ubicacion` | `SP_RegistrarUbicacionMovil` | `ubicacion_tecnico`, `orden_servicio`, `os_personal` (la app envía la posición cada ~45 s mientras hay un servicio en curso; el SP guarda como máximo una cada 10 s) |
| Viáticos y Gastos (HU-25 / HU-26) · lectura | `GET api/movil/viaticos` | `SP_ObtenerViaticosMovil` (reglas en `SP_ObtenerViaticosUsuarioMovil`) | `gasto_viatico`, `programacion`, `programacion_rendicion`, `orden_servicio`, `cliente`, `sede_cliente`, `tabla_maestra` (CONCEPTO_GASTO, MONEDA), `usuario` |
| Menú de Jefatura (HU-28) · Jefe de Metrología | `GET api/movil/jefatura/menu` | `SP_ObtenerMenuJefaturaMovil` | `usuario`, `tabla_maestra` (CARGO_USUARIO, AREA_USUARIO, SEDE_OPERATIVA_TW), `orden_servicio`, `expediente_digital`, `requerimiento`, `area_servicio_rq`, `demora_registro`, `autorizacion_salida_os` |
| Aprobaciones (HU-31) | `GET api/movil/aprobaciones` · `GET/PUT api/movil/aprobaciones/salidas/{idOs}` | `SP_ObtenerAutorizacionesSalida`, `SP_ObtenerChecklistSalidaMovil` (el checklist del técnico), `SP_ResolverAutorizacionSalida` | `autorizacion_salida_os`, `orden_servicio`, `usuario`, `checklist_presalida_os`, `notificacion`, `auditoria_evento` |

**Perfiles de la app (HU-28).** El **rol y el área** del usuario definen el menú: los usuarios con rol **Supervisor o Administrador de cualquier área excepto Servicio Técnico** (Metrología, Operaciones, TI, Gerencia, Comercial…) ven el **menú de Jefatura**; todos los demás (técnicos, metrólogos y usuarios comunes, y todo el personal de Servicio Técnico) ven el menú de campo. No se usa el cargo porque en la ficha de usuario es texto libre. Para entrar a la app, el usuario necesita un *Nombre de usuario (app)*: la ficha de usuario de la intranet muestra esa sección ("Acceso a la App Mobile") para **todas las áreas**. Servicio Técnico la autocompleta con `nombre.apellido`; en las demás áreas queda en blanco y es opcional. Al guardarla el back habilita el canal (`canal_acceso = 'todos'`); en blanco, al editar, quita el acceso y cierra la sesión de la app. El back valida el rol y el área en cada consulta de Jefatura (quien no corresponde recibe 400), así que la app no decide permisos. Para cambiar quién ve Jefatura: `SP_ObtenerMenuJefaturaMovil` y `utilidades/perfil.ts`; las tarjetas por área están en `menu/modulosJefatura.ts` (Metrología tiene las suyas; las demás áreas, las comunes).
- **Filtro por área:** Metrología se filtra por el área de la RQ (`orden_servicio → expediente_digital → requerimiento.id_area → area_servicio_rq.area_usuario`); las demás áreas no tienen área en la RQ y ven el resumen de todos los servicios. Las solicitudes de salida solo las ve y resuelve quien tiene esa facultad (el SP): el supervisor de Metrología (las de su área y las que la RQ no ubica en un área) y la supervisión general (Jefe/Coordinador de Operaciones, supervisor de Operaciones y administradores: todas). El resto entra a Aprobaciones y la ve vacía.
- **Contadores de hoy** (fecha de Lima): programados, en ruta, en ejecución (incluye pausados) y con demora (`demora_registro` de hoy).
- **Aprobaciones:** hoy solo solicitudes de salida (HU-04), con las urgentes primero (el servicio es de hoy). Autorizar exige una **condición** y rechazar un **motivo** (3 a 500 caracteres); el SP notifica al técnico y deja la decisión en `auditoria_evento`. Evidencias forzadas, ensayos con error y gastos entran a la bandeja cuando existan esos módulos.
- **Pendiente:** Panel de Campo, Mi Equipo, Agenda del Área, Certificados por Revisar (HU-33), Correlativos (HU-34), Recepción en Taller, Viáticos y Gastos del jefe y Procedimientos abren "Próximamente". Las notificaciones del jefe (nueva solicitud de salida) llegan a la pestaña Notificaciones y la tarjeta abre la aprobación.

**Viáticos y Gastos (HU-25 / HU-26).** Salen de lo que registra la intranet en *Gestionar Viáticos* (HU-45): al programar, el Jefe de Operaciones asigna un adelanto por técnico y concepto (`gasto_viatico.tipo = 'viatico_asignado'`); el técnico rinde sus gastos (`'gasto_solicitado'`) y el Jefe los aprueba, observa o rechaza. El técnico sale del token: solo ve lo suyo. Un solo endpoint alimenta el menú, la lista de viáticos, la lista de solicitudes y los dos detalles:
- **Depositado:** viático asignado en estado `aprobado` o `rendido` (lo marca Contabilidad); el resto es *pendiente de depósito*.
- **Rendido:** gastos que no fueron rechazados. **Por rendir** = asignado − rendido (nunca negativo).
- **Activo / finalizado:** finalizado = la rendición de esa programación ya se cerró (`programacion_rendicion`); con saldo final = aprobado − asignado → devolución (<0), reembolso adicional (>0) o cuadrado.
- **En revisión:** gastos `pendiente`; **observados:** gastos `observado` (el Jefe dejó un comentario que el técnico debe corregir).
- **Menú:** el módulo "Viáticos y Gastos" muestra el saldo por rendir (viáticos activos) y los gastos en revisión; vienen en el mismo resultado de `GET api/movil/menu/resumen` (`viaticosSaldoPorRendir`, `viaticosActivos`, `gastosEnRevision`, `gastosEnRevisionCantidad`). Si el cálculo falla, el menú se muestra igual con esos números en 0.
- **Pendiente (HU-27):** rendir un gasto, corregir y reenviar uno observado y "Solicitar reembolso" desde la app todavía no existen; requieren guardar la foto del comprobante tomada con la cámara. Los botones "Rendir gasto" y "+" no se muestran hasta entonces.
- Limitación: un viático de una programación **cancelada** no se muestra (la cancelación avisa a Contabilidad en la intranet).

**Checklist con visto bueno (HU-04).** Cuando el jefe autoriza la salida, los obligatorios que seguían pendientes o bloqueados llegan con `estado: "aprobado"` y el detalle "Autorizado por {cargo}"; el ítem de visto bueno trae "Jefe · HH:mm · Condición: …". La regla vive en `ReglasChecklistSalida.Evaluar` (back): `todoConforme` = se puede iniciar (todo cumplido o visto bueno vigente) y la app muestra "Todo conforme · Ya puedes iniciar el traslado a planta". `faltantes` sigue listando lo que estaba pendiente. Al pedir la autorización, el técnico recibe "Solicitud de autorización enviada"; al resolverla, "Autorización de salida aprobada/rechazada" con el jefe, su cargo y la condición o el motivo.

**Notificaciones.** Son las mismas de la campana de la intranet (`notificacion`, canal 5). El SP clasifica el `tipo` por el título (`autorizacion_aprobada`, `autorizacion_rechazada`, `autorizacion_solicitud` para el jefe, `solicitud_enviada`, `gasto_*`, `servicio`, `demora`, `general`); la app solo elige el ícono y el destino (`utilidades/notificaciones.ts`): servicio, aprobación de salida o gastos. En `autorizacion_aprobada` llegan los `pendientesAprobados` con los que el jefe autorizó. Marcar leída es inmediato en la app y se confirma en el servidor; si falla, la siguiente recarga muestra el estado real.

**Demoras en ruta (HU-05).** Dos tipos, excluyentes según el avance del servicio (las reglas viven en `SP_ObtenerDemorasMovil` / `SP_RegistrarDemoraMovil`; la app solo muestra lo que informa `puedeLlegada` / `puedeIngreso`):
- **llegada** (OS `en_ruta`, sin llegada registrada): recalcula la ETA = hora programada + suma de las demoras de llegada.
- **ingreso** (ya llegó a planta, sin iniciar el trabajo): recalcula el inicio previsto = el mayor entre el último inicio recalculado y la hora actual, más la duración. Necesita el evento LLEGADA de la HU-06.
- El motivo sale de `MOTIVO_DEMORA_RUTA` y su **ámbito** (`tabla_maestra.String3`: `traslado`, `ingreso` o `ambos`; vacío = ambos). La duración es de 1 a 480 minutos; la hora la pone el servidor; el GPS es obligatorio (no 0,0, precisión de 0 a 5000 m); la foto es opcional, JPEG de hasta 5 MB y solo de la cámara.
- Repetir el mismo registro en 20 segundos no duplica la demora. Cada registro avisa a Operaciones (supervisor/administrador del área o jefe/coordinador de operaciones; si no hay, a los administradores) y deja la auditoría.
- **Sin conexión.** La pantalla funciona igual: usa lo último guardado en el teléfono (motivos, ETA, demoras) y, si no se puede enviar, la demora queda en el teléfono con su hora (`capturadoEn`, UTC), GPS y foto, y se envía sola al abrir la app, al volver a ella y cada 30 s mientras haya pendientes (`api/colaDemoras.ts`, `MonitorCampo`). El SP respeta esa hora solo si no es futura (tolerancia 5 min) ni tiene más de 24 h; una demora que llega más de 2 min después de ocurrir se marca *diferida*, queda con la hora en que ocurrió y se avisa a Operaciones "sin conexión, reportada HH:mm". Si el envío se repite porque la respuesta no llegó al teléfono, el SP lo reconoce (`repetida`) y no duplica ni avisa de nuevo.
- Lo pendiente sobrevive al cierre de sesión y se envía cuando el mismo técnico vuelve a entrar. Si el servidor rechaza una (la OS ya cambió de estado), se descarta y se avisa con el motivo; si una foto no logra subir tras 3 intentos con conexión, la demora se registra sin ella y se avisa. Sin conexión el panel de impacto ya incluye lo pendiente y la lista lo marca "POR ENVIAR".
- La foto de la cámara se toma con un tamaño razonable (Android: el 4:3 más grande de hasta 1920 px, calidad 50 %): una foto de varios MB falla al subirse con señal débil o contra el límite del servidor (6 MB por petición).
- La app muestra el impacto estimado mientras se escribe la duración (`utilidades/demoras.ts`) y, al registrar, la ETA o el inicio anterior y el nuevo, lo acumulado, el GPS y a cuántas personas se avisó.

**GPS y seguimiento (HU-51).** Al entrar con su sesión, el técnico (no el perfil de Jefatura) pide el permiso de ubicación y, si el GPS del teléfono está apagado, el sistema pide encenderlo (`MonitorCampo`, montado en las pestañas). La posición se sigue solo con la app en primer plano (no hay seguimiento en segundo plano). Mientras algún servicio del técnico esté en ruta, en ejecución o en pausa, la app envía su posición al back (`POST …/ubicacion`) para el Seguimiento Operativo de la intranet; sin servicio en curso no se envía nada y sin conexión se omite.

**La salida se valida solo desde el día programado (HU-04).** Antes de esa fecha el técnico ve el detalle completo, pero:
- el checklist trae `salidaHabilitada: false` y `salidaMensaje` ("Aún no es el día del servicio. Podrás validar la salida el dd/mm/aaaa."),
- los ítems del checklist vienen no editables y `puedeIniciar` / `puedeSolicitarAutorizacion` en `false`,
- "Validar salida" queda deshabilitado con ese aviso, y marcar un ítem, solicitar autorización o iniciar el traslado responden `IdTipoMensaje 1` con el mismo mensaje.

La regla vive una sola vez, en `SP_ObtenerSalidaHabilitadaMovil` (usa la fecha de Lima = UTC-5); la app solo muestra lo que el back informa.
| Intranet · visto bueno de salida (HU-04) | `GET api/operaciones/autorizaciones-salida` · `PUT api/operaciones/ordenes-servicio/{idOs}/visto-bueno-salida` | `SP_ObtenerAutorizacionesSalida`, `SP_ResolverAutorizacionSalida` | `autorizacion_salida_os`, `area_servicio_rq`, `notificacion`, `auditoria_evento` (cada encargado ve y resuelve solo su área) |
| Servicios Programados (agenda) | `GET api/movil/servicios?filtro=&busqueda=` | `SP_ObtenerServiciosProgramadosMovil` | `orden_servicio`, `os_personal`, `os_equipo`, `programacion`, `programacion_equipo`, `informe_tecnico`, `alerta_predictiva`, `expediente_digital`, `expediente_bloqueador`, `requerimiento`, `orden_metrologia`, `cliente`, `sede_cliente`, `usuario` |
| Menú · cargo del encabezado | `GET api/maestros/catalogos/CARGO_USUARIO` | `SP_ObtenerCatalogo` | `tabla_maestra` |
| Perfil · Mis datos | `GET api/autenticacion/me` | `SP_ObtenerUsuarioPorId` | `usuario` |
| Perfil · Área / Cargo | `GET api/maestros/catalogos/{AREA_USUARIO \| CARGO_USUARIO}` | `SP_ObtenerCatalogo` | `tabla_maestra` |

> Cada HU nueva agrega sus filas a esta tabla.

### Tablas ya creadas en la BD para la app de campo

Están en `01_crear_tablas.sql` del back. Las de **Agenda / OS** ya se leen desde la HU-02 y la HU-03; el resto se irá habilitando con cada HU:

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
EXPO_PUBLIC_API_URL=https://backendintranettw-staging.up.railway.app
EXPO_PUBLIC_USE_MOCK=false
```

**Requisitos para entrar con un usuario real:**
- El back debe tener copiados los archivos del paquete del back (desplegado en el servidor si usas la opción 2).
- En la BD se debe haber ejecutado `1_BD_app_movil_HU01_a_HU03.sql`: la migración `75_acceso_app_movil.sql` y los SPs de la HU-01 a la HU-03.
- El técnico debe tener usuario de app asignado (`3_asignar_usuario_app.sql` o `PUT api/maestros/usuarios/{id}/acceso-movil`). `2_ver_cuentas_para_la_app.sql` lista las cuentas de campo con un usuario sugerido.
- Si aun así no entra, `5_diagnostico_acceso_app.sql` dice el motivo (sin usuario de app, inactivo, sesión abierta en otro equipo, bloqueo por intentos…).

**No se crean datos de prueba**: la BD es la misma de la intranet. `4_verificar_datos_reales.sql` (solo lectura) muestra, HU por HU, qué datos reales existen y qué falta coordinar.

### De dónde sale lo que muestra la agenda (y qué registra la intranet)

| Lo que muestra la app | Sale de | Situación hoy |
|---|---|---|
| Servicios del técnico (menú, Ruta del Día, Próximo Hit, agenda) | `orden_servicio` + `os_personal` | La OS se emite en el módulo OS/OM y se **programa en Programación Operativa** (HU-36, `SP_CrearProgramacion`): queda `programada` con técnico, fecha, hora y personal. Si se **reprograma** (HU-38) cambia la fecha/hora y vuelve a PENDIENTE; si se **cancela**, la OS vuelve a `emitida` sin técnico y **desaparece de la agenda**. |
| Usuario de la app | `usuario.nombre_usuario` | Ya se asigna desde la ficha de usuario de la intranet (HU-83). |
| Etiqueta LISTO / PENDIENTE / BLOQUEADO | `orden_servicio.fecha_ejecucion` (+ bloqueos) | **LISTO** = llegó el día programado (hoy o antes); **PENDIENTE** = programado para una fecha posterior; **BLOQUEADO** tiene prioridad (OS bloqueada, bloqueo del expediente o SSOMA bloqueado). "Hoy" es la fecha de Lima. Cliente confirmado y SSOMA se muestran como etiquetas aparte (`confirmacion_cliente` lo marca la intranet en HU-37; `estado_ssoma` lo deja la programación) y no cambian LISTO/PENDIENTE. |
| Objetivos | `os_equipo` + `programacion_equipo` + `informe_tecnico` | Son los equipos de la OS que se **confirmaron en la programación vigente** (lo que se elige en la ficha de Programar/Reprogramar). Si la programación no eligió equipos (o la OS es anterior a la programación operativa), cuenta todos los de la OS. Informes: HU siguientes de la app. |
| Horario, tipo de servicio, equipo de trabajo | `orden_servicio.hora_inicio/hora_fin_estimada`, `tabla_maestra`, `os_personal` | La OS refleja la programación (hora inicio y fin). La tarjeta muestra `26/10/2026 · 08:30 – 12:30`, el tipo de servicio y cuántos técnicos van. |
| Alerta predictiva / N° OM | `alerta_predictiva` / `orden_metrologia.id_os` | Sin proceso que las genere o vincule todavía. La tarjeta muestra el texto de la alerta de mayor prioridad (`alertaPredictiva`, máx. 120 caracteres) o, si no hay, la cantidad. |

### Detalle del servicio = modal "Detalle de la Programación" de la intranet

Al pulsar **Ver detalle**, la app muestra lo que el coordinador ve en Programación Operativa → Detalle de la Programación (HU-37), pensado para el técnico:

| Modal de la intranet | En la app (Servicio Programado) | Notas |
|---|---|---|
| Cliente, fecha, horario, técnico ppal., sede, ubicación, tipo de servicio, duración | Tarjeta de destino (fecha/hora con duración, dirección, lugar, tipo) | `horaFin` y `duracionHoras` salen de la OS. |
| Código y observaciones de la programación | Sección **Programación** (`PRG-…`, estado, observaciones) | `programacion` viene vacío en OS anteriores a la programación operativa. |
| Técnicos asignados (+ SSOMA) | Sección **Equipo de trabajo**: nombre, cargo, principal/apoyo, "(tú)" y etiqueta SSOMA de hoy | El **motivo** SSOMA solo se ve en el propio técnico; de los compañeros solo el estado. |
| Equipos | Sección **Equipos** (marca, modelo, N° de serie, código TW) | Los confirmados en la programación (mismos que cuenta *Objetivos*). |
| Conceptos | Sección **Conceptos del servicio** | `os_concepto`. |
| Respuestas del cliente | Sección **Respuestas del cliente** (resultado, canal, quién, cuándo, comentario) | Las registra la intranet (HU-37). |
| Timeline | **Historial reciente** (programación creada, respuesta del cliente, reprogramación, cancelación, con anterior → actual) | Mismos títulos que la intranet. |
| Alertas SSOMA sobrevenidas | Etiqueta SSOMA del técnico y su motivo en *Equipo de trabajo* | Misma regla que la intranet (`SP_EvaluarSsomaProgramacion`). |
| Checklist de validación, Viáticos, "Creada por", "Próximo paso" y los botones Reprogramar / Cancelar / Registrar respuesta | **No se muestran** | Son de gestión del coordinador (la app ya tiene su propio checklist de salida) o datos de otros técnicos (viáticos). |

**Servicio BLOQUEADO (HU-03):** la tarjeta muestra el motivo y el botón *Detalle bloqueado*. Además, el back no entrega el detalle (`SP_ObtenerDetalleServicioMovil` responde `IdTipoMensaje 1` con el motivo) hasta que se levante. La regla vive en `SP_ObtenerBloqueoServicioMovil`.

**Filtros de la agenda (HU-03):** la app pide la lista completa (`filtro=todos`) y calcula Todos / Hoy / Pendientes y sus contadores en `src/utilidades/agenda.ts`, con la fecha de Lima. El back sigue aceptando `filtro` y `busqueda`.

Cualquier cambio en la BD (una OS nueva para el técnico, su área o nombre) se ve en la app al **deslizar hacia abajo**. No hay botón de actualizar.
