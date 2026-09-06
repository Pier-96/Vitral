import { cp, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { PrismaClient } from '@prisma/client';

export type BackupResult = { ok: true; location: string; createdAt: string } | { ok: false; reason: string };

/** Creates a self-contained restore point. BACKUP_DIR should point to another volume. */
export async function createBackup(prisma: PrismaClient, photosRoot: string): Promise<BackupResult> {
  const backupRoot = process.env.BACKUP_DIR;
  if (!backupRoot) return { ok: false, reason: 'BACKUP_DIR no está configurado.' };

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const destination = path.join(path.resolve(backupRoot), `gym-progress-${stamp}`);
  try {
    await mkdir(destination, { recursive: true });
    const databaseDestination = path.join(destination, 'gym-progress.db');
    // VACUUM INTO produces a coherent SQLite snapshot even while the API is running.
    const escapedDestination = databaseDestination.replaceAll("'", "''");
    await prisma.$executeRawUnsafe(`VACUUM INTO '${escapedDestination}'`);
    await mkdir(photosRoot, { recursive: true });
    await cp(photosRoot, path.join(destination, 'photos'), { recursive: true, force: false });
    const createdAt = new Date().toISOString();
    await writeFile(path.join(destination, 'manifest.json'), JSON.stringify({
      format: 1, createdAt, database: 'gym-progress.db', photos: 'photos', restore: 'Cierra la aplicación y sustituye prisma/gym-progress.db y storage/photos por este contenido.'
    }, null, 2));
    return { ok: true, location: destination, createdAt };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : 'No se pudo crear la copia.' };
  }
}

export function backupConfiguration() {
  return process.env.BACKUP_DIR ? { configured: true, destination: path.resolve(process.env.BACKUP_DIR) } : { configured: false, destination: null };
}
