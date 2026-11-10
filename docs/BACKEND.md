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
| Vigilar sesión única (cada 30 s y al volver a primer plano) | `GET api/autenticacion/me` (el token se valida con `SP_VerificarSesionMovil`) | `SP_VerificarSesionMovil` | `sesion_usuario`, `usuario` |

**Sesión única por usuario:** al ingresar desde otro equipo, `SP_IniciarSesionMovil` cierra la sesión anterior (`motivo_revocacion = 'REEMPLAZADA_POR_OTRO_EQUIPO'`; configurable con `AppMovil__ReemplazarSesionAnterior`, por defecto `true`; con `false` el segundo ingreso se rechaza). El primer equipo recibe 401 con el sobre `{ idTipoMensaje: 1, mensaje }` y el motivo (reemplazada, liberada por el jefe, vencida o acceso desactivado), vuelve al login y lo muestra. Las demoras y llegadas guardadas sin conexión no se borran. SQL: `_aplicar_jefatura_y_sesion_movil.sql`.
| Cambiar contraseña | `POST api/autenticacion/cambiar-contrasena` | `SP_CambiarContrasenaUsuario` | `usuario` |
| Menú (Ruta) · indicadores y Próximo Hit | `GET api/movil/menu/resumen` | `SP_ObtenerResumenMenuMovil` | `orden_servicio`, `os_personal`, `cliente`, `sede_cliente`, `tabla_maestra` |
| Detalle del servicio (HU-04) | `GET api/movil/servicios/{idOs}` | `SP_ObtenerDetalleServicioMovil` | `orden_servicio`, `cliente`, `sede_cliente`, `contacto_cliente`, `contacto_sede`, `requerimiento`, `orden_metrologia`, `alerta_predictiva`, `os_riesgo`, `item_presalida`, `equipo_historial`, `auditoria_evento`, `documento_adjunto`, `programacion`, `programacion_tecnico`, `programacion_equipo`, `programacion_confirmacion`, `os_concepto`, `equipo_cliente` |
| Checklist de pre-salida (HU-04) | `GET api/movil/servicios/{idOs}/checklist` · `PUT …/checklist/{codigo}` | `SP_ObtenerChecklistSalidaMovil`, `SP_MarcarChecklistSalidaMovil` | `checklist_presalida_os`, `os_personal`, `expediente_digital`, `item_presalida`, `alerta_predictiva`, `autorizacion_salida_os` |
| Solicitar autorización (HU-04) | `POST api/movil/servicios/{idOs}/solicitar-autorizacion` | `SP_SolicitarAutorizacionSalidaMovil` | `autorizacion_salida_os`, `requerimiento`, `area_servicio_rq`, `notificacion`, `auditoria_evento` (notifica al Jefe de Servicio Técnico o al Jefe de Metrología según el área de la RQ) |
| Iniciar traslado (HU-04) | `POST api/movil/servicios/{idOs}/iniciar-traslado` | `SP_IniciarTrasladoMovil` | `orden_servicio`, `evento_campo`, `auditoria_evento` |
| Notificaciones (HU-02 / HU-04) | `GET api/movil/notificaciones` · `PUT api/movil/notificaciones/{id}/leida` · `PUT api/movil/notificaciones/leidas` | `SP_ObtenerNotificacionesMovil`, `SP_MarcarNotificacionMovil` | `notificacion`, `autorizacion_salida_os` (las 60 más recientes del token; solo se marcan las propias) |
| Registro de demoras (HU-05) | `GET api/movil/servicios/{idOs}/demoras` · `POST …/demoras` (multipart: `tipo`, `idMotivo`, `duracionMinutos`, `descripcion`, `latitud`, `longitud`, `precisionMetros`, `capturadoEn`, `foto`) | `SP_ObtenerDemorasMovil`, `SP_ObtenerEtaDemorasMovil`, `SP_RegistrarDemoraMovil` | `demora_registro`, `orden_servicio`, `evento_campo`, `tabla_maestra` (MOTIVO_DEMORA_RUTA), `usuario`, `notificacion`, `auditoria_evento` (avisa a Operaciones; la foto se guarda en `demoras/{idOs}/…`) |
| Objetivos y selección de equipos (HU-07) | `GET api/movil/servicios/{idOs}/objetivos?buscar=` · `GET …/equipos/qr?codigo=` · `POST …/equipos/{idOsEquipo}/iniciar\|pausar\|reanudar` (JSON: `motivo` al pausar, `capturadoEn`) · `GET …/equipos/nuevo/opciones` · `POST …/equipos/nuevo` (multipart: `numeroSerie`, `codigo`, `marca`, `modelo`, `idSuministro`, `ubicacion`, `foto`) | `SP_ObtenerObjetivosMovil`, `SP_BuscarEquipoQrMovil`, `SP_CambiarEstadoEquipoMovil`, `SP_ObtenerOpcionesEquipoNuevoMovil`, `SP_RegistrarEquipoNuevoMovil` (reglas en `SP_ArmarObjetivosMovil` y `SP_EvaluarCampoMovil`) | `os_equipo`, `equipo_cliente`, `suministros`, `programacion_equipo`, `equipo_historial`, `evento_campo` (INICIO_TRABAJO, PAUSA, REANUDA), `alerta_predictiva`, `tabla_maestra` (TIPO_INTERVENCION_EQUIPO, MARCA_SUMINISTRO, PARAMETRO_PROGRAMACION), `auditoria_evento`, `notificacion` |
| Registro de llegada y Hard Stop (HU-06) | `GET api/movil/servicios/{idOs}/llegada` · `POST …/llegada/validar` · `POST …/llegada` (JSON: `latitud`, `longitud`, `precisionMetros`, `capturadoEn`) | `SP_ObtenerLlegadaMovil`, `SP_ValidarLlegadaMovil`, `SP_RegistrarLlegadaMovil` (reglas en `SP_EvaluarLlegadaMovil`) | `evento_campo` (LLEGADA con GPS, precisión y distancia), `orden_servicio`, `sede`, `sede_cliente`, `cliente`, `tabla_maestra` (PARAMETRO_PROGRAMACION, TIPO_EVENTO_CAMPO), `auditoria_evento` |
| Seguimiento del técnico (HU-51) | `POST api/movil/servicios/{idOs}/ubicacion` | `SP_RegistrarUbicacionMovil` | `ubicacion_tecnico`, `orden_servicio`, `os_personal` (la app envía la posición cada ~45 s mientras hay un servicio en curso; el SP guarda como máximo una cada 10 s) |
| Viáticos y Gastos (HU-25 / HU-26) · lectura | `GET api/movil/viaticos` | `SP_ObtenerViaticosMovil` (reglas en `SP_ObtenerViaticosUsuarioMovil`) | `gasto_viatico`, `programacion`, `programacion_rendicion`, `orden_servicio`, `cliente`, `sede_cliente`, `tabla_maestra` (CONCEPTO_GASTO, MONEDA), `usuario` |
| Menú de Jefatura único (HU-28) · todos los jefes de área (Servicio Técnico, Metrología, Operaciones…; cargo `jefe_*` o rol supervisor/administrador con área). Correlativos y Recepción en Taller salen bloqueados ("SOLO METROLOGÍA") para los demás | `GET api/movil/jefatura/menu` | `SP_ObtenerMenuJefaturaMovil` | `usuario`, `tabla_maestra` (CARGO_USUARIO, AREA_USUARIO, SEDE_OPERATIVA_TW), `orden_servicio`, `expediente_digital`, `requerimiento`, `area_servicio_rq`, `demora_registro`, `autorizacion_salida_os` |
| Aprobaciones (HU-31) | `GET api/movil/aprobaciones` · `GET/PUT api/movil/aprobaciones/salidas/{idOs}` | `SP_ObtenerAutorizacionesSalida`, `SP_ObtenerChecklistSalidaMovil` (el checklist del técnico), `SP_ResolverAutorizacionSalida` | `autorizacion_salida_os`, `orden_servicio`, `usuario`, `checklist_presalida_os`, `notificacion`, `auditoria_evento` |

**Menú de Jefatura — contadores de las tarjetas y notificaciones del jefe (HU-28, actualización).** `SP_ObtenerMenuJefaturaMovil` suma campos opcionales a la misma respuesta (`null` = sin dato para ese usuario: la app no muestra contador, y cada contador se calcula en su propio bloque, así que si una fuente falla solo ese queda vacío). Se aplica con `_aplicar_jefatura_menu_movil.sql` (sin migración propia; reiniciar la API):

| Tarjeta | Campo | De dónde sale |
|---|---|---|
| Alertas de Campo | `alertasCriticas` | `notificacion` del usuario con `prioridad = 'critica'`, sin leer ni archivar (clasificación del Centro de Notificaciones, migración `102_centro_notificaciones`): error crítico de ensayo (HU-10), servicio detenido y alertas críticas de Control de Campo. Es lo mismo que filtra "Críticas" |
| Informes y Certificados | `informesPorRevisar` | `SP_ArmarBaseInformes` (el mismo cálculo de la bandeja de Revisión Técnica), grupos pendiente de revisión y de precotización; solo con permiso `rt_bandeja` |
| Informes y Certificados | `certificadosPendientes` | `orden_metrologia.estado = 'pendiente_certificado'`; solo Metrología |
| Correlativos | `ticketsCorrelativo` | `ticket_metrologia.estado = 'solicitado'`; solo Metrología (hoy ningún módulo crea tickets: saldrá sin contador hasta entonces) |
| Mi Equipo | `miEquipoTotal`, `miEquipoEnLabores` | técnicos activos del área (misma regla de la Programación: sin jefaturas ni asistentes) y los que hoy tienen una OS en ruta, en ejecución o pausada (`orden_servicio.id_tecnico_principal` u `os_personal`); solo Servicio Técnico y Metrología |
| Agenda del Área | `agendaConflictos` | `SP_ArmarConflictosProgramacion` (HU-39); solo con permiso `prog_bandeja`; en Servicio Técnico y Metrología, los conflictos de técnicos de su área |
| Viáticos y Gastos | `viaticosPorRevisar` | `gasto_viatico` tipo `gasto_solicitado` en estado `pendiente`; solo con `prog_aprobar_reprogramacion` (el Jefe de Operaciones, el único que revisa los gastos) |
| Recepción en Taller · Procedimientos | — | sin fuente de datos todavía: sin contador |

`GET api/movil/notificaciones` trae además `prioridad` y `critica` y tipos nuevos (`ensayo_critico`, `evidencia_forzada`, `equipo_nuevo`, `servicio_detenido`, `alerta_campo`); no muestra las notificaciones archivadas en la intranet. La pestaña Notificaciones del jefe agrega el filtro **Críticas**; al jefe no se le ofrece "Ir al servicio" en los avisos de servicio y demora (ese detalle es del técnico asignado). "Gasto por revisar" de la maqueta no existe aún como notificación: ningún proceso la genera.

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

**Llegada a planta y Hard Stop (HU-06).** El técnico confirma su llegada con el GPS de su teléfono; el back decide, la app solo muestra:
- **Qué se captura:** solo el GPS, la precisión (± m) y la hora. La hora la pone el servidor, salvo una llegada guardada sin conexión (el teléfono manda `capturadoEn`; solo se respeta si no es futura ni tiene más de 24 h).
- **Regla (`SP_EvaluarLlegadaMovil`, una sola vez):** la referencia es la coordenada de la sede del cliente (`sede.latitud/longitud`; si no tiene, la llegada ya registrada de la OS, igual que la bandeja de Seguimiento). Radio permitido `LLEGADA_RADIO_METROS` (200 m) y precisión máxima `LLEGADA_PRECISION_MAX_METROS` (100 m), configurables en `PARAMETRO_PROGRAMACION`. Resultados: `valida` (dentro del radio), `fuera_rango` (no deja confirmar), `precision_baja` (GPS muy débil: no deja confirmar), `sin_referencia` (la planta no tiene coordenada: se registra sin validar la distancia y el evento lo deja anotado).
- **Registrar (`SP_RegistrarLlegadaMovil`):** vuelve a evaluar el mismo GPS (nunca confía en la validación de la app), exige la OS **en ruta** (traslado iniciado) y es idempotente por viaje (repetir el envío responde éxito con la ya registrada). Escribe lo mismo que el cambio manual "llegada" del Asistente: evento `LLEGADA` (GPS, precisión, distancia), `orden_servicio.hora_llegada_real` y `latitud/longitud_llegada`; la OS sigue "en ruta" (la bandeja la muestra "en planta") y pasa a "en ejecución" al iniciar el trabajo.
- **Ubicación de la planta en pantalla (sin cambios de contrato):** junto al GPS del técnico, "Registrar llegada" muestra la sede, su dirección, la coordenada de la planta (`referencia` de `GET …/llegada`), el radio permitido, la **distancia en vivo** a la planta (calculada en el teléfono con lo ya cargado, también sin conexión) y un enlace "Abrir en el mapa" (`geo:` en Android, Apple Maps en iOS; `Linking`, sin librerías nativas). Sin coordenada: "La sede no tiene coordenadas registradas". Lógica en `utilidades/llegada.ts`.
- **Hard Stop:** sin llegada registrada (en el servidor o confirmada sin conexión y aún sin enviar) los objetivos quedan bloqueados con un candado rojo "Sin marca de llegada". La app lo decide con la llegada de HU-06 antes de pedir los objetivos, y el back de HU-07 lo vuelve a exigir (`SP_EvaluarCampoMovil`): sin llegada no entrega objetivos, no deja iniciar / pausar / reanudar y no deja registrar un equipo nuevo.
- **Sin conexión:** se valida en el teléfono con la última planta guardada y la llegada se guarda y se envía sola (`api/colaLlegadas.ts`), **antes** que las demoras (una demora de ingreso a planta necesita la llegada registrada). El back rechaza (y la app avisa) si, con el mismo GPS, no habría sido válida.

**Objetivos y selección de equipos (HU-07).** Un **objetivo = un equipo de la OS** (`os_equipo`): los confirmados en la programación vigente (si no hay selección, todos los de la OS) más los que el técnico registró en campo. El back decide todo, la app solo muestra:
- **Estados** (`SP_ArmarObjetivosMovil`, una sola vez): `por_iniciar`, `en_ejecucion` (EJECUTANDO), `pausado` (PAUSADO), `completado` y `observado`. El contador **Observados** suma los observados y las pausas que esperan a un supervisor (`pausa_requiere_aprobacion`: esas NO se reanudan, el botón sale bloqueado con "Esperando aprobación de supervisor"). Las columnas nuevas de `os_equipo` (migración 98) guardan el inicio, el tiempo acumulado, la pausa y quién lo trabaja; `estado_ejecucion` (la que lee el Seguimiento Operativo) se mantiene sincronizada.
- **Tarjeta:** "N. MC · 60 min" = sigla y minutos estimados del tipo de intervención (`TIPO_INTERVENCION_EQUIPO`: `String3` = sigla, `Num2` = minutos; sin dato vale el parámetro `OBJETIVO_MINUTOS_POR_DEFECTO`, 60), nombre del equipo (descripción de su suministro), "SN … · COD …" (N/S y código del cliente), "— FALTA EQUIPO/INSTRUMENTO —" si no tiene N/S, "Iniciado …", barra de avance y "Ver detalles" (modificación anterior y actual: `equipo_historial` + cambios de estado de la app).
- **Bloqueado** (no se puede seleccionar): equipo inactivo o "En Evaluación". **Tiempo real** = lo trabajado sin contar las pausas.
- **Acciones** (`SP_CambiarEstadoEquipoMovil`): "Seleccionar equipo e iniciar" / "Trabajar en el equipo" = iniciar; Pausar exige motivo (3 a 300 caracteres); Reanudar. Un técnico trabaja en **un solo equipo a la vez** (en toda la app, no solo en esta OS). El primer equipo iniciado pasa la OS a "en ejecución" y registra el evento `INICIO_TRABAJO`; pausar y reanudar registran `PAUSA` y `REANUDA` (el Seguimiento Operativo los lee). Repetir una acción ya aplicada responde éxito sin duplicar nada. Cada cambio queda en `auditoria_evento` (entidad `os_equipo`).
- **Buscar y escanear:** la lista se filtra en el teléfono por N/S, código, COD TW, marca, modelo, ubicación o tipo (sin comodines; también sin conexión). El QR o código de barras se compara con el N/S, el código del cliente o el COD TW (exacto, o un texto más largo —una URL— que contenga el COD TW o el código del cliente de 5 o más caracteres): solo se acepta un equipo de la lista de la OS; si no, la app ofrece registrarlo como equipo nuevo.
- **Equipo nuevo (NEW)** (`SP_RegistrarEquipoNuevoMovil`): N/S, código, marca (catálogo `MARCA_SUMINISTRO`), modelo, tipo de equipo (suministro activo de clase equipo / instrumento / pesa), ubicación y **foto de la placa** (solo cámara, JPEG, hasta 5 MB), todo obligatorio. Crea el equipo en `equipo_cliente` en estado **borrador** (pendiente de aprobación) con un **COD TW provisional `NEW-000123`** (la intranet asigna el definitivo `EQ-TW-AAAA-NNNN` al aprobar), marcado `registrado_en_campo` con la OS y la foto. Si el equipo ya existe en el maestro del cliente (mismo N/S + marca + modelo) NO se duplica: se agrega a la OS. Avisa por notificación a los supervisores/administradores del área del técnico y a su jefe (si no hay, a los administradores). Exige conexión (sube la foto); "Registrar y seleccionar" lo registra y empieza a trabajar en él.
- **Sin conexión:** la lista se guarda con cada lectura y se muestra la última (con su hora); iniciar, pausar y reanudar se guardan en el teléfono con la hora en que se tocó el botón y se envían solos, **en orden**, al volver la señal (`api/colaEquipos.ts`, `MonitorCampo`: después de las llegadas y las demoras). El back usa esa hora para el tiempo trabajado y reconoce una acción repetida. La app no guarda lo que sabe que el back rechazará (otro equipo en ejecución, motivo faltante…); si el servidor rechaza una acción guardada se descarta, se avisa y se descartan las siguientes del mismo equipo. Una acción espera a que se envíe la llegada del mismo servicio. Los objetivos solo se pueden cargar por primera vez con conexión y con la llegada ya registrada (el Hard Stop impide pedirlos antes).
- **Pendiente de otras HU:** "Trabajar en el equipo" abre el registro del trabajo (mediciones y evidencias) y aún no existe: la app avisa que se habilita en la siguiente etapa. La pausa por supervisión (`pausa_requiere_aprobacion`) y la aprobación del equipo nuevo las resuelve la intranet.

**Trabajo en el equipo y variables ambientales (HU-08 / HU-09).** `GET api/movil/servicios/{idOs}/equipos/{idOsEquipo}/trabajo` (`SP_ObtenerTrabajoEquipoMovil`) y `PUT …/variables-ambientales` (`SP_GuardarVariablesAmbientalesMovil`, migración 99):
- **Cabecera:** servicio (sigla y tipo de intervención del equipo; si no tiene, el tipo de servicio de la OS), equipo, T. estimado / T. real y **tipo de orden según la RQ**: el área de la RQ (`area_servicio_rq`) da OS (servicio técnico) u OM (metrología). Exige la llegada registrada (Hard Stop) y el equipo iniciado.
- **Las 5 etapas** (reglas solo en el SP): variables ambientales, registro fotográfico, ensayos y calibración, cabecera del informe, correlativo y certificado; estado `conforme | en_curso | pendiente | bloqueado`. **Ensayos y Calibración queda bloqueada hasta guardar las variables.** "Finalizar trabajo en equipo" se habilita con las 5 conformes. Hoy solo la etapa de variables tiene pantalla (`disponible`); las demás avisan que se habilitan más adelante.
- **Variables (HU-09):** temperatura (−20 a 60 °C) y humedad (0 a 100 %) obligatorias; procedencia opcional ("N.I" por defecto). **Fecha y hora las pone el servidor** (UTC en `variable_ambiental.registrado_en`, se entrega en hora de Lima). Una fila vigente por OS + equipo (`id_os`, `id_equipo`, `procedencia` nuevas; `id_om` ahora opcional): guardar otra vez la actualiza y deja lo anterior en `auditoria_evento`. Solo con el equipo EN EJECUCIÓN. Guardar exige conexión; la pantalla del trabajo sí se ve sin conexión con lo último guardado.

**Ensayos y Calibración (HU-10).** `GET|PUT api/movil/servicios/{idOs}/equipos/{idOsEquipo}/ensayos` y `POST …/ensayos/llamada` (`SP_ObtenerEnsayosMovil`, `SP_GuardarEnsayosMovil`, `SP_RegistrarLlamadaEnsayoMovil`; reglas en `SP_ContextoEnsayoMovil`, `SP_EmpEnsayoMovil` y `SP_ContactoEncargadoEnsayoMovil`; migración 100):
- **Acceso:** llegada registrada (Hard Stop), equipo en ejecución (para guardar) y las variables ambientales guardadas (HU-09). Las especificaciones salen de `equipo_cliente`: clase de exactitud, alcance máximo, d y e (texto → número: "80,000" son miles, "0,5" es decimal; e = división de verificación, si no tiene, d). Sin clase o sin e no se puede evaluar.
- **Qué digita el técnico:** solo la carga (L) y la indicación (I). **El servidor calcula** el error E = I − L, el EMP y la conformidad (|E| ≤ EMP); la app repite el cálculo solo para responder al instante.
- **EMP** (verificación inicial, OIML R76): ±0,5 e, ±1 e o ±1,5 e según las divisiones de la carga (m = L / e): clase I hasta 50 000 e y 200 000 e; II hasta 5 000 e y 20 000 e; III hasta 500 e y 2 000 e; IIII (IV) hasta 50 e y 200 e. Coincide con la maqueta (clase III, e = 20 kg: 10 000 → ±10, 20 000 → ±20, 40 000 → ±20, 80 000 → ±30).
- **Pesaje y excentricidad:** pesaje con cargas sugeridas (12,5 %, 25 %, 50 % y 100 % de la capacidad); excentricidad con cargas desplegables (1/3 y 2/3 de la capacidad), se agregan y se quitan. Posiciones según la **forma del plato**: rectangular y circular 5, triangular 4 (la 1 es el centro). Se guarda en `informe_ensayo` (`grupo` = carga de prueba, `critico`) y en un `informe_tecnico` en **borrador** (número provisional `BRR-…`; el definitivo lo asigna la generación del informe), que luego lee la Cabecera del informe.
- **Error crítico** = lectura fuera del EMP. Acciones: corregir la lectura, repetir el ensayo, **llamar** al encargado del área según la RQ (jefe del área con teléfono; queda registrada en `auditoria_evento`) o **guardar de todas formas** con un motivo (3 a 300 caracteres): se guarda, el ensayo queda marcado con error (`error_critico_motivo`) y se notifica al encargado (si no hay, a los administradores). "Finalizar ensayo" exige todo completo y, con error crítico, ese motivo; guardar de nuevo la reabre ("Editar lecturas").
- **Guardar exige conexión** (es un dato metrológico): las lecturas se ven sin conexión con lo último guardado.

**Registro fotográfico, validación IA, evidencia forzada y microvideo (HU-11 / HU-12 / HU-13).** `GET|POST api/movil/servicios/{idOs}/equipos/{idOsEquipo}/evidencias`, `POST …/{id}/forzar` y `GET …/{id}/archivo` (`SP_ObtenerEvidenciasMovil`, `SP_RegistrarEvidenciaMovil`, `SP_ForzarEvidenciaMovil`, `SP_ObtenerArchivoEvidenciaMovil`; reglas en `SP_ContextoEquipoMovil`, `SP_CatalogoEvidenciasMovil` y `SP_ResumenEvidenciasMovil`; migración 101):
- **9 evidencias** por equipo: Placa de identificación (*), Inicial (*), Encendido (video), Desmontaje, Abierto, Prueba, Final, Informe (foto del informe a mano, varias hojas) y QR. "Guardar y volver" exige las 9 completas; la etapa "Registro fotográfico" del trabajo en el equipo sale de `SP_ResumenEvidenciasMovil` (N de 9, forzadas).
- **Solo cámara:** la app no usa galería. El back exige JPEG (fotos, hasta 6 MB) o MP4 (video, hasta 15 MB, con su cuadro JPEG); guarda cada **intento** en `evidencia_fotografica` (`codigo`, `pagina`, `intento`, `vigente`, GPS y hora) y el último reemplaza al anterior.
- **IA (HU-11):** Gemini (`Gemini__ApiKey`, el mismo de los asistentes de la intranet) valida cada foto: aprobada o rechazada con su motivo y sugerencia, y lee lo que corresponda (datos de la placa, legibilidad y firma del informe, display del encendido). **Sin API key o si la IA falla la evidencia queda "omitida" (SIN VALIDAR): se guarda y cuenta como completa; no bloquea al técnico.** Placa: si la serie leída no coincide con la del equipo, la toma se rechaza (regla en `SP_RegistrarEvidenciaMovil`). QR: debe ser el del equipo (N/S, código del cliente o COD TW).
- **Forzar (HU-12):** una toma rechazada se acepta con un motivo escrito (3 a 300 caracteres). Queda FORZADA (conserva el rechazo de la IA), suma a `tecnico_scorecard.foto_override_count` del mes, deja el registro en `auditoria_evento` y avisa a Jefatura (encargado del área según la RQ; si no hay, administradores). "Ver detalles": motivo, rechazo de la IA, quién, cuándo e intentos previos.
- **Microvideo de encendido (HU-13):** de 3 a 5 s, sin audio; al terminar la app toma un cuadro del display y la IA decide "Display detectado" o "No se detectó el display" (grabar de nuevo o forzar). **El GPS y la hora (UTC y local) se guardan con el video y se muestran sobre la imagen al grabar, pero no se queman dentro del archivo.**
- **Capturar con señal** sube el archivo y espera a la IA. **Sin señal** la toma (foto o microvideo, con su hora y GPS) se guarda en el teléfono (`api/colaEvidencias.ts`; archivos en la carpeta de documentos de la app) y se envía sola, en orden, al volver la conexión (`MonitorCampo` cada 30 s, al abrir la app y con "Enviar ahora"). La regla de la HU no cambia: la IA valida en el servidor; mientras esté en cola la evidencia se ve "EN COLA" y **no cuenta como completa** ("Guardar y volver" sigue bloqueado). Si la IA la rechaza al enviarla, se avisa y el técnico la repite o la acepta con motivo (HU-12). El servidor conserva la hora original de la toma si es de las últimas 24 h. El panel se ve sin conexión con lo último guardado.

**Panel de Campo en tiempo real y Seguimiento del servicio (HU-29 / HU-30, Jefe de Área).** Todo bajo `api/movil/jefatura/…` (mismo controlador del menú). Quién lo ve y qué servicios: **la misma regla del menú de Jefatura** (`SP_ResolverJefaturaMovil` = área del jefe; `SP_ArmarAlcanceJefaturaMovil` = área de la RQ para Servicio Técnico y Metrología, las demás áreas ven todo; el menú y estas pantallas comparten ambos SP). Los servicios, su estado, el GPS y las alertas salen del motor de la bandeja de Seguimiento Operativo de la intranet (HU-51/52, `SP_ArmarSeguimientoOperativo`): la app no calcula nada, solo muestra.
- `GET panel-campo` → `SP_ObtenerPanelCampoMovil`: KPIs de hoy (en ruta · ejecución · demora · incidencia · finalizados), un pin por técnico (último GPS de `ubicacion_tecnico`, color por estado) y las alertas críticas primero (error crítico de ensayo de HU-10 = `informe_tecnico.error_critico_motivo`; demoras e incidencias del día; alertas automáticas de la bandeja). Se recarga solo cada ~30 s (`SEG_REFRESCO_SEGUNDOS`) y al deslizar; sin conexión muestra lo último guardado.
- `GET servicios?filtro=activos|demora|incidencias|finalizados&busqueda=` → `SP_ObtenerServiciosJefaturaMovil`: "Servicios activos" (búsqueda por OS, cliente, RUC o técnico, máx. 100 caracteres; chips con contadores sobre todo el alcance; máx. 100 servicios). **Avance %** = estimación por hitos (0 · 15 en ruta · 30 en planta · 30+60×equipos ejecutados/equipos · 100), no un dato medido.
- `GET servicios/{idOs}` → `SP_ObtenerServicioJefaturaMovil`: técnico (con el teléfono de su ficha para llamarlo), estado, hora programada, llegada, **SLA = puntualidad de llegada** (estimación: 100 % si llegó a tiempo; baja con el atraso sobre la duración estimada, mínimo 60 min; sin llegada = vacío), hitos (asignado y autorizado, en ruta, demoras, llegada con "GPS válido a N m" de HU-06, trabajo en el equipo = equipos ejecutados, informe) y las opciones del cambio de estado. 
- `GET servicios/{idOs}/ruta` → `SP_ObtenerRutaServicioJefaturaMovil`: última posición, recorrido GPS (máx. 120 puntos), **velocidad** entre las dos últimas posiciones (vacía si no hay datos suficientes), **ETA** (la recalculada por la última demora, `demora_registro.eta_recalculada`, o la esperada de la bandeja), **distancia en línea recta** a la planta, la última demora registrada y los eventos en ruta.
- `POST servicios/{idOs}/estado` y `POST servicios/{idOs}/aviso-cliente` → `SP_RegistrarSeguimientoJefaturaMovil`, que valida el alcance y **delega en `SP_RegistrarAsistenteServicioRuta` (HU-53)**: solo avanzar de estado, motivo del catálogo `MOTIVO_CAMBIO_MANUAL`, comentario de 10 a 1000 caracteres, hito del técnico, historial con usuario y hora (`registro_asistente`, `auditoria_evento`), aviso a Jefatura. Exige los permisos del seguimiento operativo (`seg_registrar` y `seg_bandeja`; si no los tiene, la app lo dice). El aviso al cliente **no envía nada**: deja constancia (nota del seguimiento) y la app ofrece compartir el mensaje o llamar al contacto en planta.
- **Mapa esquemático:** sin librería de mapas (requeriría claves y una app nueva): pines y ruta en proporción a latitud/longitud; "Abrir en Maps" abre la ruta en la app de mapas del teléfono. Script de aplicación: `_aplicar_panel_campo_movil.sql` (aplicar después de `_aplicar_jefatura_menu_movil.sql`).


**Asistente IA y Procedimientos (HU-19).** `api/movil/asistente/…` (`inicio`, `equipos`, `consultas`, `consultas/{id}`, `consultas/{id}/valoracion`, `consultas/{id}/fuentes/{n}`, `voz`, `guardados`); la app usa `src/api/asistente.ts` y, para lo guardado en el teléfono, `src/api/guardadosAsistente.ts`. Pantallas: `asistente.tsx` (inicio y chat), `asistente-fuente.tsx` ("Fuente consultada") y `asistente-guardados.tsx` ("Guardados"); la pestaña Asistente queda marcada en las tres.
- **Contexto:** el equipo en trabajo del técnico (uno a la vez); "Cambiar" abre la lista de equipos de sus órdenes (`GET …/equipos`). Sin equipo en trabajo la app pide elegir uno. Consultar un manual no registra trabajo: no exige el Hard Stop de llegada.
- **Respuestas con fuente:** el back responde SOLO con los documentos oficiales del equipo (manual del suministro y PDF aprobado de los procedimientos del servicio). Cada respuesta trae advertencia de seguridad, pasos y la fuente (documento, sección, página, fragmento citado). Si el tema no está, `encontrada = false` y se dice (no se inventa). `verificada` indica si el back encontró el fragmento en el PDF: la app muestra "Verificada en el PDF" o "No verificada: confírmalo en el manual" (sin etiqueta si el PDF no tiene texto).
- **Consulta por texto, sugerencias o voz.** Las sugerencias salen de `inicio` (catálogo + procedimientos del equipo) y se envían como "Ajuste de excentricidad PBA430". La voz graba hasta 30 s con `expo-audio`, sube el audio a `POST …/voz` (la IA del servidor lo transcribe y no lo guarda) y muestra el texto entre «» para "Enviar consulta" o "Cancelar". Diferencia con la maqueta: la transcripción aparece al terminar de grabar, no en vivo (no hay reconocimiento de voz nativo). El módulo se carga con `require` en try/catch: si la app instalada no lo trae, el micrófono avisa "La voz estará disponible con la próxima versión instalada de la app" y nada se rompe.
- **Guardados (sin conexión):** "Guardar offline", "Fragmento" y "Descargar sección" guardan la respuesta o el **fragmento citado como texto** (no se recorta un PDF) en un archivo JSON por técnico en la carpeta de documentos de la app y, con señal, en el servidor (`POST …/guardados`). Guardar es local primero: sin señal queda "pendiente" y se envía sola (al abrir Guardados y desde `MonitorCampo`). No duplica (clave tipo + consulta + fuente). Eliminar quita la copia del teléfono y, con señal, la del servidor. Lo guardado desde otro equipo se trae al sincronizar. Sin el módulo de archivos solo se guarda en memoria y Guardados lo avisa.
- **Offline:** consultar, transcribir y valorar exigen conexión (usan la IA); Guardados, abrir un guardado y su fuente se leen sin conexión. `inicio` se ve sin conexión con lo último guardado. Un fallo de red al consultar muestra el "Detalle técnico" real (`ErrorApi.detalleTecnico`).

**Qué ve el Seguimiento Operativo de la intranet (HU-51 a 54).** Todo sale de lo que envía la app, sin tablas nuevas para la bandeja:
- **Ruta y señal GPS:** las posiciones de `ubicacion_tecnico` (la app las envía cada ~45 s con velocidad y altitud cuando el teléfono las da, solo con la app en primer plano) dibujan la ruta del día, la última ubicación, "pérdida de contacto" y "GPS parado".
- **Llegada:** el evento LLEGADA es el hito "Llegada confirmada" del mapa y pasa el servicio a "en planta".
- **Demoras:** cada demora de la app trae su **momento** (`Momento`: "En ruta (llegar a planta)" o "Ingreso a planta"), su GPS (pin en el mapa: 5.º resultado de `…/mapa`) y su impacto. En el timeline aparece como "Demora en ruta: …" / "Demora en ingreso a planta: …". El servicio pasa a "con demora" y el próximo hito esperado se corre con la ETA recalculada (las demoras de ruta mueven la llegada esperada; las de ingreso, el inicio).
- **Nota:** la pantalla de Seguimiento Operativo de la intranet (Angular) todavía trabaja con datos de ejemplo (`USAR_MOCK`); los endpoints reales ya existen (`api/operaciones/seguimiento/...`).

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


## HU-14 / HU-34 — Correlativos de Metrología

Todo bajo `api/movil/correlativos` (`src/api/correlativos.ts`, con modo demo). El back decide las reglas; la app solo muestra.

**Técnico (HU-14)** — etapa 5 "Correlativo y certificado" del trabajo en el equipo (`SP_ObtenerTrabajoEquipoMovil`: conforme con el certificado guardado, en curso con un ticket abierto, bloqueada hasta finalizar los ensayos):
- `GET …/servicios/{idOs}/equipos/{idOsEquipo}/solicitud` (`SP_ObtenerSolicitudCorrelativoMovil`): datos del equipo, OS u OM según la RQ, tipos de certificado (catálogo `TIPO_CERTIFICADO_MET`), si se puede solicitar y por qué no, el correlativo asignado sin usar y la reserva libre.
- `POST …/tickets` (`SP_SolicitarCorrelativoMovil`): crea el ticket `TK-MET-#####` (`ticket_metrologia`). Exige Hard Stop, equipo en ejecución, ensayos finalizados, sin certificado y un solo ticket abierto por equipo; avisa a los jefes de Metrología y al técnico.
- `GET tickets?filtro=todos|pendientes|asignados&idOs=` (`SP_ObtenerTicketsCorrelativoMovil`): "Mis tickets", con recarga cada ~30 s.
- `PUT …/certificado` (`SP_GuardarCertificadoMovil`): el correlativo asignado (o uno de la reserva del técnico) pasa a ser `informe_tecnico.numero_certificado` y queda usado.
- `POST reserva` (`SP_GenerarReservaCorrelativosMovil`, modo propia): la reserva diaria del técnico de Metrología, al abrir la solicitud.

**Jefe de Metrología (HU-34)** — tarjeta Correlativos del menú de Jefatura (solo Metrología; los demás ven el candado):
- `GET jefatura` (`SP_ObtenerCorrelativosJefaturaMovil`): KPIs Pendientes / Asignados hoy / Reservados, tickets pendientes y asignados hoy (con patrón y resultado de los ensayos), el siguiente correlativo sugerido y la reserva por técnico.
- `POST jefatura/tickets/{idTicket}/asignar` (`SP_AsignarCorrelativoMovil`): sugerido o editable (CC-0000-AAAA del año actual, no emitido); avisa al técnico ("Correlativo asignado · Ver ticket").
- `POST jefatura/reserva`: la reserva de todos los técnicos de Metrología (idempotente por día; parámetro `CORRELATIVO_RESERVA_DIARIA`, 2 por defecto).

**Offline:** las pantallas muestran lo último guardado sin conexión; solicitar, asignar, guardar el certificado y generar la reserva exigen conexión. **Pendiente:** usar un correlativo de la reserva SIN conexión desde el teléfono (necesita cola local y conciliación) y la confirmación de Metrología de los correlativos "usados · por confirmar".

**Notificaciones nuevas** (`SP_ObtenerNotificacionesMovil`): `correlativo_solicitado` y `correlativo_asignado` (técnico → Mis tickets) y `correlativo_solicitud` (jefe → Correlativos).
