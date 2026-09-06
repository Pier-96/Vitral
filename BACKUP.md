# Copias de seguridad

La aplicación crea una copia después de cada check-in y también permite solicitarla mediante `POST /api/backup`.

1. Conecta un disco externo, monta tu NAS o elige una carpeta de tu nube personal sincronizada localmente.
2. Copia `.env.example` como `.env` si aún no existe y establece `BACKUP_DIR` con la ruta de esa ubicación. Por ejemplo: `BACKUP_DIR="/Volumes/MiDiscoExterno/GymProgress-backups"`.
3. Reinicia `npm run dev:api`.

Cada copia genera una carpeta con fecha, `gym-progress.db`, `photos/` y `manifest.json`. La base se crea mediante un snapshot consistente de SQLite.

Para restaurar, cierra la aplicación, guarda una copia preventiva de los datos actuales y sustituye `prisma/gym-progress.db` y `storage/photos/` por los elementos equivalentes dentro de una carpeta de backup.
