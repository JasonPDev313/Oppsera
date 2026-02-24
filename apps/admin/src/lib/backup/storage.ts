import { mkdir, readFile, writeFile, unlink, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { BackupStorage } from './types';

/**
 * Local filesystem backup storage.
 * Writes to {rootDir}/YYYY/MM/DD/{id}.json.gz
 */
class LocalBackupStorage implements BackupStorage {
  private rootDir: string;

  constructor(rootDir: string) {
    this.rootDir = rootDir;
  }

  async write(path: string, data: Buffer): Promise<void> {
    const fullPath = join(this.rootDir, path);
    await mkdir(dirname(fullPath), { recursive: true });
    await writeFile(fullPath, data);
  }

  async read(path: string): Promise<Buffer> {
    const fullPath = join(this.rootDir, path);
    return readFile(fullPath);
  }

  async delete(path: string): Promise<void> {
    const fullPath = join(this.rootDir, path);
    try {
      await unlink(fullPath);
    } catch (err: unknown) {
      // Ignore if file doesn't exist
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
  }

  async exists(path: string): Promise<boolean> {
    const fullPath = join(this.rootDir, path);
    try {
      await stat(fullPath);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Get the backup storage instance based on driver type.
 * Stage 1: local filesystem only.
 */
export function getBackupStorage(driver: string = 'local'): BackupStorage {
  if (driver === 'local') {
    // Store backups in {project-root}/data/backups/
    const rootDir = join(process.cwd(), 'data', 'backups');
    return new LocalBackupStorage(rootDir);
  }

  throw new Error(`Unsupported storage driver: ${driver}. Only 'local' is supported in Stage 1.`);
}

/**
 * Generate the storage path for a backup file.
 * Format: YYYY/MM/DD/{backupId}.json.gz
 */
export function buildStoragePath(backupId: string, date: Date = new Date()): string {
  const yyyy = date.getFullYear().toString();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}/${mm}/${dd}/${backupId}.json.gz`;
}
