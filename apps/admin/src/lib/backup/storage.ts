import { mkdir, readFile, writeFile, unlink, stat } from 'fs/promises';
import { dirname, join } from 'path';
import { db } from '@oppsera/db';
import { sql } from 'drizzle-orm';
import type { BackupStorage } from './types';

/**
 * Local filesystem backup storage.
 * Writes to {rootDir}/YYYY/MM/DD/{id}.json.gz
 * Only works in environments with a writable filesystem (NOT Vercel).
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
 * Database-backed backup storage.
 * Stores compressed backup data directly in the platform_backups.compressed_data
 * BYTEA column. Works everywhere (Vercel, Docker, local) with zero filesystem deps.
 * The "path" parameter is used as the backup ID (the row already exists).
 */
class DatabaseBackupStorage implements BackupStorage {
  async write(path: string, data: Buffer): Promise<void> {
    // Path format: YYYY/MM/DD/{backupId}.json.gz — extract the backup ID
    const backupId = extractBackupIdFromPath(path);
    await db.execute(sql`
      UPDATE platform_backups
      SET compressed_data = ${data},
          updated_at = NOW()
      WHERE id = ${backupId}
    `);
  }

  async read(path: string): Promise<Buffer> {
    const backupId = extractBackupIdFromPath(path);
    const result = await db.execute(sql`
      SELECT compressed_data FROM platform_backups WHERE id = ${backupId}
    `);
    const rows = Array.from(result as Iterable<{ compressed_data: Buffer | null }>);

    if (rows.length === 0 || !rows[0]!.compressed_data) {
      throw new Error(`Backup data not found for: ${backupId}`);
    }

    // postgres.js returns Buffer for BYTEA columns
    const data = rows[0]!.compressed_data;
    return Buffer.isBuffer(data) ? data : Buffer.from(data);
  }

  async delete(path: string): Promise<void> {
    const backupId = extractBackupIdFromPath(path);
    await db.execute(sql`
      UPDATE platform_backups
      SET compressed_data = NULL,
          updated_at = NOW()
      WHERE id = ${backupId}
    `);
  }

  async exists(path: string): Promise<boolean> {
    const backupId = extractBackupIdFromPath(path);
    const result = await db.execute(sql`
      SELECT 1 FROM platform_backups
      WHERE id = ${backupId} AND compressed_data IS NOT NULL
    `);
    return Array.from(result as Iterable<unknown>).length > 0;
  }
}

/**
 * Extract backup ID from a storage path.
 * Path format: YYYY/MM/DD/{backupId}.json.gz
 */
function extractBackupIdFromPath(path: string): string {
  const filename = path.split('/').pop() ?? path;
  return filename.replace('.json.gz', '');
}

/**
 * Auto-detect the best storage driver for the current environment.
 * - Vercel/serverless: 'database' (no writable filesystem)
 * - Local/Docker: 'local' (faster filesystem access)
 */
export function detectStorageDriver(): string {
  // Vercel sets VERCEL=1 in all environments
  if (process.env.VERCEL) return 'database';
  // Also check for common serverless indicators
  if (process.env.AWS_LAMBDA_FUNCTION_NAME) return 'database';
  return 'local';
}

/**
 * Get the backup storage instance based on driver type.
 * - 'local': filesystem (local dev / Docker)
 * - 'database': stores in platform_backups.compressed_data column
 */
export function getBackupStorage(driver?: string): BackupStorage {
  const resolved = driver ?? detectStorageDriver();

  if (resolved === 'database') {
    return new DatabaseBackupStorage();
  }

  if (resolved === 'local') {
    const rootDir = join(process.cwd(), 'data', 'backups');
    return new LocalBackupStorage(rootDir);
  }

  throw new Error(`Unsupported storage driver: ${resolved}. Supported: 'local', 'database'.`);
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
