# Migración a Supabase

1. En Supabase, abre **SQL Editor** y ejecuta `schema.sql` completo.
2. En **Storage**, confirma que existe el bucket privado `progress-photos` (el script SQL también lo crea si no existe).
3. En local, añade a `.env` `POSTGRES_DATABASE_URL`, `SUPABASE_SECRET_KEY` y `MIGRATION_USER_ID`. No compartas esos valores ni los subas a Git.
4. Ejecuta la migración desde una copia de seguridad comprobada de SQLite. El script de importación se añadirá al cambiar el servidor a Postgres; hasta entonces SQLite sigue siendo la fuente de verdad.

`MIGRATION_USER_ID` es el UUID de tu cuenta en **Authentication → Users**. Las políticas RLS usan ese UUID para que ningún usuario pueda leer datos ajenos.

## Roles coach / asesorado

Antes de desplegar esta versión del servidor, ejecuta `coach-permissions-migration.sql`
en SQL Editor. También es necesario para instalaciones nuevas después de `schema.sql`.
La API utiliza sus funciones transaccionales `activate_coach` y
`accept_coach_invitation`. La migración se puede repetir y no reasigna datos existentes.

- Cuenta sin invitación y sin rol: puede activar el panel de coach.
- Invitación + Google: el enlace se conserva durante OAuth y se acepta antes de mostrar el panel.
- Coach vinculado: crea, edita y elimina el progreso de su asesorado.
- Asesorado: consulta su progreso y entrenamiento; no puede modificar datos ni activar el rol coach.
- Los dos participantes consultan registros cuyo `user_id` es el del asesorado.
- Un coach puede tener varios asesorados; cada asesorado mantiene un único coach activo.
- Las cuentas del navegador no pueden escribir tablas de progreso ni cambiar roles directamente.

Si hay relaciones cruzadas previas, la API devuelve un error de vinculación. Antes de
repararlas hay que identificar el coach definitivo y el titular de cada check-in;
no se deduce el titular de los datos a partir del orden de registro. No borres ni
reasignes registros sin resolver esa correspondencia.

Validación local: `npm test` prueba autorización, persistencia de la invitación en
OAuth y la migración real sobre PostgreSQL embebido, sin conectar a producción.
`npm run build` comprueba TypeScript y genera la web.

## Actualización multi-asesorado

Ejecuta `multi-client-migration.sql` después de las migraciones de permisos y rutinas. Elimina solo el
índice que limitaba un asesorado por coach, conserva el índice único de cada asesorado y sustituye las
RPC de invitación/activación. También deja las tablas de rutinas sin escrituras directas desde el
navegador. No vuelvas a ejecutar las migraciones antiguas tras ella.
