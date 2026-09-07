# Despliegue de Vitral

La aplicación se publica como un único servicio: la interfaz y la API comparten dominio HTTPS.

1. En Render, crea un servicio desde el repositorio `Pier-96/Vitral`. Render detectará `render.yaml`.
2. Completa los valores marcados como secretos con sus equivalentes de Supabase. No copies el archivo `.env` ni subas claves a GitHub.
3. Cuando Render termine, copia la URL `https://...onrender.com`.
4. En Supabase, abre **Authentication > URL Configuration** y añade esa URL como **Site URL** y como **Redirect URL**. En Google Cloud OAuth añade la misma URL en los orígenes autorizados y `https://TU-URL/auth/v1/callback` como URI de redirección.
5. Comprueba el inicio de sesión con Google y crea un check-in de prueba.

## Migración de invitaciones por enlace

Antes de crear una invitación sin correo, abre **Supabase > SQL Editor** y ejecuta el contenido de
[`supabase/coach-link-migration.sql`](./supabase/coach-link-migration.sql). La migración permite que
`coach_invitations.invited_email` sea nulo, ya que una invitación por enlace no conoce el correo de
la persona que la abrirá.

El webhook para Apple Health quedará disponible en `https://TU-URL/api/health/webhook`. Usa el valor generado para `HEALTH_WEBHOOK_TOKEN` como cabecera `X-Health-Token`.

## Desplegar la corrección de roles y carga inicial

1. Ejecuta `supabase/coach-permissions-migration.sql` en Supabase SQL Editor **antes de publicar el código**. Esta versión necesita las funciones `activate_coach` y `accept_coach_invitation`. La migración no borra ni reasigna datos.
2. Ejecuta `npm test` y `npm run build`.
3. Publica el commit en la rama que sigue el servicio de Render. Si el despliegue automático está desactivado, selecciona **Manual Deploy → Deploy latest commit** en ese servicio.
4. Comprueba que Render publica ese commit y que la web permite entrar con Google. Con una cuenta sin rol, activa coach, genera una invitación y ábrela con la cuenta del asesorado. Ambas deben consultar los mismos registros; solo el coach debe poder escribir.

Si PostgreSQL devuelve `28P01`, corrige `POSTGRES_DATABASE_URL` en `.env` o ejecuta el SQL desde el panel de Supabase. Las claves HTTP de Supabase no sustituyen la contraseña de PostgreSQL. No publiques esta versión antes de que la migración esté aplicada.

## Publicar rutinas de entrenamiento

Antes de publicar esta versión, ejecuta [`supabase/routine-migration.sql`](./supabase/routine-migration.sql) en el SQL Editor de Supabase. Crea las tablas para rutinas, días, ejercicios planificados y completados semanales. No modifica los registros históricos de entrenamiento.

## Varios asesorados por coach

Despliega primero una API compatible con listas y, en una ventana controlada, ejecuta
[`supabase/multi-client-migration.sql`](./supabase/multi-client-migration.sql). El orden completo para
una instalación nueva es: `schema.sql`, `coach-link-migration.sql`,
`coach-permissions-migration.sql`, `routine-migration.sql` y finalmente la migración multi-asesorado.
No ejecutes después los scripts antiguos: restaurarían la función de invitación anterior. La migración
no borra ni reasigna historial; desvincular elimina exclusivamente la relación. Las URLs de fotos ya
firmadas pueden seguir funcionando hasta su vencimiento (actualmente una hora).
