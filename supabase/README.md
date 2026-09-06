# Migración a Supabase

1. En Supabase, abre **SQL Editor** y ejecuta `schema.sql` completo.
2. En **Storage**, confirma que existe el bucket privado `progress-photos` (el script SQL también lo crea si no existe).
3. En local, añade a `.env` `POSTGRES_DATABASE_URL`, `SUPABASE_SECRET_KEY` y `MIGRATION_USER_ID`. No compartas esos valores ni los subas a Git.
4. Ejecuta la migración desde una copia de seguridad comprobada de SQLite. El script de importación se añadirá al cambiar el servidor a Postgres; hasta entonces SQLite sigue siendo la fuente de verdad.

`MIGRATION_USER_ID` es el UUID de tu cuenta en **Authentication → Users**. Las políticas RLS usan ese UUID para que ningún usuario pueda leer datos ajenos.
