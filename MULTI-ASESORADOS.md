# Tarea: un coach con varios asesorados

Estado: análisis local del 7 de septiembre de 2026, actualizado con todas las decisiones de producto confirmadas. Listo para entregar a otro agente. No se han cambiado aplicación ni base de datos, ni comprobado el esquema desplegado.

## Objetivo y alcance confirmado

Permitir que un coach invite a varias personas y seleccione en un desplegable de quién consulta o modifica el progreso. Mantener un coach por asesorado y los permisos actuales: el coach edita progreso y rutinas; el asesorado consulta lo suyo y puede marcar ejercicios completados. Actualmente el coach también puede marcar completados; conservarlo salvo decisión expresa.

Decisiones confirmadas:
- Un solo coach por asesorado; varios asesorados por coach. Mantener permisos actuales.
- Desplegable con nombre/correo y recuerdo de última selección por cuenta.
- Incluir desvinculación conservando el historial.
- Sincronización automática de salud fuera de esta entrega; dejarla para otra fase.

- El asesorado conserva consulta de todo su historial mientras no tenga coach. Al aceptar una nueva invitación del mismo coach o de otro, el coach vinculado puede consultar todo el historial previo, sin limitarlo a la fecha de la nueva relación. El antiguo coach pierde acceso mientras no esté vinculado; si vuelve a vincularse, lo recupera. Los datos mantienen siempre como titular al asesorado.

## Hallazgos del repositorio

- La aplicación activa usa React/Vite, Express y Supabase. Prisma/SQLite permanece para usos históricos; no es el modelo que consulta la API actual.
- `supabase/schema.sql` y `supabase/coach-migration.sql` crean `coach_clients_one_client_per_coach`, que impide una segunda relación. Ya existe `unique(coach_id,client_id)` y un índice único por `client_id`.
- `supabase/coach-permissions-migration.sql`: `accept_coach_invitation` rechaza relaciones existentes tanto por asesorado como por coach. Incluye bloqueos, caducidad, comprobación de correo, roles y reintentos idempotentes que deben conservarse.
- `server/index.ts`: `membership()` usa `maybeSingle()` para obtener el asesorado; `/api/access` devuelve `client` singular; `/api/invitations` rechaza coaches ya vinculados.
- `server/access.ts`: `Membership.clientId` y `progressOwner()` presuponen un solo sujeto. Las rutas de progreso ya reciben `clientId` y filtran por propietario.
- `src/main.tsx`: `Access.client` determina el sujeto; carga de permisos y check-ins comparten efecto. Los retornos de onboarding, carga, error y ausencia de registros pueden ocultar la cabecera. Invitar desde la cabecera exige no tener asesorado, una condición inalcanzable tras el retorno previo.
- Check-ins, salud, ejercicios y rutinas pertenecen al asesorado mediante `user_id`; métricas, fotos y días dependen de esos registros. No hace falta reasignarlos ni añadirles `coach_id`.
- `/api/health/webhook` usa `HEALTH_WEBHOOK_USER_ID` y un token global. No ofrece sincronización automática individual para múltiples asesorados.
- Las tablas de `routine-migration.sql` tienen políticas `for all` y no están en la revocación de escrituras de `coach-permissions-migration.sql`. Verificar grants reales y restringir escritura directa para cumplir los permisos declarados.

## Implementación

### Base de datos

1. Añadir migración transaccional e idempotente `supabase/multi-client-migration.sql` que elimine solo `coach_clients_one_client_per_coach` con `drop index if exists`.
2. Mantener unicidad de `client_id`, unicidad de la pareja, claves foráneas y prohibición de autoasignación. El índice compuesto ya sirve para buscar por coach; no añadir índices redundantes.
3. Reemplazar `accept_coach_invitation`: quitar el rechazo por otros clientes del coach, manteniendo el rechazo por asesorado ya vinculado. Preservar bloqueos y validaciones, consumo único del token y reintento del mismo usuario con el mismo token.
4. Mantener RPC privilegiadas accesibles solo al servidor. No ampliar acceso directo del navegador a datos de otros usuarios: el coach sigue accediendo por la API autorizada.
5. Incorporar restricciones de escritura de tablas de rutinas; dejar completados a través de la API existente, que valida su propietario.
6. Documentar el orden para instalaciones nuevas y actualizaciones: esquema base, migraciones anteriores pertinentes, rutinas y finalmente multi-client. Evitar que ejecutar scripts antiguos después restaure el límite o la función anterior. Probar ambos caminos.
7. La migración no borra ni reasigna perfiles, relaciones, fotos ni históricos. La acción explícita de desvinculación elimina únicamente la relación autorizada. No modificar Prisma para simular soporte que la API no utiliza.

### API y autorización

1. Cambiar `Membership` a `clientIds: string[]`, manteniendo `coachId` singular. Adaptar la detección de roles incompatibles; obtener todas las relaciones del coach sin `maybeSingle()`.
2. Devolver `/api/access` como `{isCoach,isClient,clients:[{id,name,email}]}`. Obtener perfiles en una consulta para los IDs autorizados, con orden estable. No listar perfiles ajenos. Evitar consulta `.in()` con lista vacía.
3. Para el coach, exigir `clientId` explícito en lecturas y escrituras de progreso; validar formato y pertenencia. No elegir silenciosamente el primer asesorado. Para el asesorado, resolver su propia cuenta y rechazar otro ID. Parámetros malformados o ausentes requeridos: 400; sujeto no autorizado: 403; rol incompatible: 409.
4. Eliminar el límite de `/api/invitations`. Conservar un enlace de un solo uso por nueva persona, caducidad de siete días y flujo Google/OAuth. Varias invitaciones pendientes no deben invalidarse entre sí.
5. Revisar todas las rutas: check-ins GET/POST/PUT/DELETE, ejercicios, entrenamiento semanal GET/POST, rutina activa, publicar rutina y completados. Además del vínculo, validar que cualquier ID de recurso pertenece al asesorado seleccionado, incluso cuando ambos asesorados pertenecen al mismo coach.
6. Las fotos y sus URLs firmadas deben seguir derivándose únicamente de check-ins autorizados. El servidor usa credenciales privilegiadas: RLS no sustituye sus comprobaciones.

### Interfaz

1. Separar carga de sesión/permisos/lista y carga de datos del asesorado. Mantener `selectedClientId` explícito y validarlo contra `clients`.
2. Desplegable accesible con etiqueta «Asesorado», nombre y correo como desambiguación, apto para móvil. Acción «Invitar asesorado» disponible con cero, uno o varios clientes.
3. Recordar selección por ID del coach en almacenamiento local (pasar el ID desde `AuthGate`/componente de sesión). Al iniciar, restaurar solo si sigue autorizado; si no, usar el primer cliente del orden estable. Con cero clientes, mostrar onboarding.
4. Mantener cabecera/selector al cargar datos, ante error de datos o sin check-ins. Los errores de autenticación/permisos globales se tratan aparte. Permitir crear rutina antes del primer check-in.
5. Al cambiar de asesorado, limpiar inmediatamente check-ins, comparador, fotos y errores del sujeto anterior. Cancelar lecturas con `AbortController` e ignorar respuestas tardías por identidad/generación. No mostrar datos de A bajo el nombre de B.
6. Cerrar y reiniciar modales al cambiar; si hay cambios sin guardar, pedir confirmación antes de descartarlos. Bloquear el cambio durante una escritura en curso. Capturar el sujeto al iniciar cada operación y evitar que su respuesta cierre o actualice una vista de otro sujeto.
7. Aislar el estado de rutinas por asesorado (por ejemplo, desmontando con una `key` por sujeto), limpiar el plan si la API devuelve null y proteger también sus cargas tardías. Comprobar `response.ok` al marcar completados antes de actualizar la UI.
8. Mantener la selección al guardar, refrescar por foco o renovar token. Actualizar lista al recuperar foco para descubrir invitaciones aceptadas sin saltar de persona.
9. Mostrar la identidad del asesorado en formularios y confirmaciones relevantes. El asesorado no ve selector ni acciones de invitación.

### Desvinculación

1. Añadir acción «Desvincular asesorado» y confirmación con nombre/correo: conserva sus registros y retira el acceso del coach. Bloquearla durante guardados y resolver antes cualquier borrador.
2. Proponer `DELETE /api/coach/clients/:clientId`, autenticado y exclusivo del coach propietario de la relación. Nunca aceptar el ID del coach desde el navegador como autoridad. No permitir desvincular relaciones ajenas.
3. Ejecutar mediante RPC transaccional reservada a `service_role`, con bloqueos de perfiles en el mismo orden que la aceptación de invitaciones. Eliminar únicamente la pareja solicitada. Conservar perfil, rol, check-ins, fotos, ejercicios, rutinas y completados; no ejecutar borrados en cascada sobre el perfil.
4. Mantener consumidas las invitaciones aceptadas: un enlace usado no puede recrear la relación tras desvincular. Para volver a vincularse, usar una invitación nueva. No invalidar invitaciones genéricas pendientes de otros futuros asesorados.
5. Tras éxito, invalidar solicitudes pendientes, limpiar datos y selección almacenada del desvinculado, recargar lista y elegir el siguiente del orden estable. Con cero clientes, mostrar invitación inicial. Si falla, conservar el contexto y mostrar el error.
6. El antiguo coach pierde autorización para nuevas peticiones. Serializar desvinculación y escrituras sobre el mismo vínculo en la base de datos para que una escritura que validó permisos antes no los eluda después del corte. Una comprobación en Express seguida de varias escrituras separadas no ofrece esa garantía; definir el punto de corte y probarlo con concurrencia real.
7. No prometer revocación de fotos ya descargadas ni de URLs firmadas previamente emitidas: revisar su caducidad y documentar la ventana residual. Las nuevas firmas requieren una relación válida.
8. Resolver expresamente el estado «asesorado sin coach»: actualmente `isClient` depende del vínculo y la UI ofrecería activar coach. La eliminación del vínculo no debe convertir de manera implícita el rol ni mostrar onboarding de coach a un antiguo asesorado. Persistir su condición de asesorado (campo de perfil o historial de relaciones) y adaptar `activate_coach`, `Membership` y `/api/access`; migrar solo los asesorados identificables por relaciones/invitaciones aceptadas, sin inferir roles a partir de registros de progreso.
9. Permitir que acepte una nueva invitación si no tiene coach, tanto del mismo coach anterior como de otro. El asesorado sin vínculo puede consultar todo su historial; adaptar `progressOwner()` para resolver su propia cuenta a partir de la condición persistente de asesorado, sin exigir `coachId` para lectura. Mostrar «Sin coach vinculado» y no habilitar edición de progreso por quedar desvinculado. Mantener la excepción existente de marcar ejercicios propios completados.
10. Al aceptar la nueva invitación, el coach vinculado obtiene acceso al historial completo del asesorado, incluidas fotos y rutinas previas. No filtrar por fecha de vinculación ni duplicar o transferir datos. Se mantienen los permisos de coach acordados. El mismo coach que perdió acceso al desvincular recupera ese acceso únicamente tras una nueva aceptación válida.

## Validación y criterios de aceptación

- Migrar una base con un coach, un cliente y registros: se conservan IDs, propietarios y datos; el coach acepta un segundo y tercer cliente. Repetir migración sin errores.
- Impedir dos coaches para el mismo cliente, autoasignación, roles incompatibles, token caducado/reutilizado por otra persona y correo incorrecto. Mantener reintento válido y probar carreras en PostgreSQL con conexiones independientes cuando corresponda.
- Coach con 0/1/3 clientes; asesorado sin registros; dos asesorados con check-ins en la misma fecha; rutinas diferentes por asesorado.
- Coach A no lee ni modifica clientes de coach B. Asesorado A no accede a B. Recurso de B con `clientId=A` debe fallar aunque el coach gestione ambos.
- Todas las rutas de progreso del coach rechazan `clientId` ausente, inválido o no vinculado. El asesorado mantiene consulta propia y completados autorizados.
- Cambios rápidos A→B→A con respuestas fuera de orden, error de carga de B, cambio con borrador y guardado pendiente: nunca se mezclan datos o destinos de escritura.
- Recarga, foco, renovación de token y cambio de cuenta conservan/restablecen únicamente una selección autorizada.
- Desvincular uno de varios y el último: desaparece del selector, se conserva todo su historial y el antiguo coach no puede realizar nuevas lecturas/escrituras. Rechazar desvinculación por otro coach o por el asesorado.
- Probar desvinculación concurrente con guardados y nueva aceptación de invitación; sin doble coach ni escrituras que eludan el corte. El enlace antiguo consumido no revincula y un enlace nuevo sí permite una relación válida.
- El asesorado desvinculado conserva su condición y consulta todo su historial, sin obtener edición de progreso ni rol coach accidentalmente. Verificar también su acceso propio a rutinas y completados.
- Probar por separado revinculación con el mismo coach y vinculación con otro: ambos recuperan/obtienen acceso a todos los registros previos, fotos y rutinas tras la nueva aceptación. El coach sin relación activa no conserva acceso por haber participado antes; no se duplican registros ni cambian sus propietarios.
- Probar permisos directos/RPC e incluir tablas de rutinas en `tests/database.test.mjs`; actualizar `tests/access.test.ts`, añadir cobertura de rutas y de interacción real de la interfaz. La suite actual solo cubre helpers, invitaciones y parte de SQL, no estos flujos completos.
- Ejecutar `npm test` y `npm run build`; verificar interfaz en móvil y escritorio. Informar resultados y límites de validación.

## Despliegue y entrega del agente

La API anterior falla con varias relaciones por su `maybeSingle()`. Coordinar migración y despliegue de API/interfaz, sin admitir segundas vinculaciones mientras siga activo el servidor anterior. Si no puede hacerse en una ventana controlada, preparar primero una versión compatible que entienda listas y mantener deshabilitada la ampliación hasta completar el despliegue.

No restaurar el índice único como rollback una vez haya varios asesorados, ni volver a la API singular sin una estrategia compatible. Preferir corrección hacia delante. Actualizar `supabase/README.md` y `DEPLOY.md` con orden y verificación.

Entregar cambios revisables, migración, pruebas y documentación; indicar si la migración solo está preparada o realmente aplicada. El encargo actual es análisis: no publicar ni ejecutar SQL en producción como parte de este documento.

## Validación realizada durante el análisis

`npm test`: 13 pruebas correctas. No se ejecutó build ni se consultó producción. Existía una modificación previa de `tsconfig.tsbuildinfo`; conservarla.
