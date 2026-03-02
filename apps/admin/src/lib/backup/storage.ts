import { mkdir, readFile, writeFile, unlink, stat } from 'fs/promises';
import { dirname, join } from 'path';
import { db } from '@oppsera/db';
import { sql } from 'drizzle-orm';
import type { BackupStorage, S3StorageConfig } from './types';

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
 * S3-compatible object storage (works with AWS S3, Cloudflare R2, MinIO).
 * Uses optional dynamic import for @aws-sdk/client-s3 — install only when needed.
 * Zero egress fees with Cloudflare R2 makes this ideal for backup storage.
 *
 * Required env vars:
 *   BACKUP_S3_BUCKET, BACKUP_S3_REGION, BACKUP_S3_ACCESS_KEY_ID, BACKUP_S3_SECRET_ACCESS_KEY
 * Optional env vars:
 *   BACKUP_S3_ENDPOINT (required for R2/MinIO), BACKUP_S3_FORCE_PATH_STYLE (default: true)
 */
class S3BackupStorage implements BackupStorage {
  private config: S3StorageConfig;
  private _client: unknown | null = null;

  constructor(config: S3StorageConfig) {
    this.config = config;
  }

  private async getClient(): Promise<any> {
    if (this._client) return this._client;
    try {
      // Dynamic import to avoid build failure when SDK isn't installed (gotcha #55)
      const modName = '@aws-sdk/' + 'client-s3';
      const { S3Client } = await import(/* webpackIgnore: true */ modName);
      this._client = new S3Client({
        region: this.config.region,
        endpoint: this.config.endpoint,
        credentials: {
          accessKeyId: this.config.accessKeyId,
          secretAccessKey: this.config.secretAccessKey,
        },
        forcePathStyle: this.config.forcePathStyle ?? true,
      });
      return this._client;
    } catch {
      throw new Error(
        'S3 storage driver requires @aws-sdk/client-s3. Install it: pnpm -F admin add @aws-sdk/client-s3',
      );
    }
  }

  async write(path: string, data: Buffer): Promise<void> {
    const client = await this.getClient();
    const modName = '@aws-sdk/' + 'client-s3';
    const { PutObjectCommand } = await import(/* webpackIgnore: true */ modName);
    await client.send(
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: path,
        Body: data,
        ContentType: 'application/gzip',
      }),
    );
  }

  async read(path: string): Promise<Buffer> {
    const client = await this.getClient();
    const modName = '@aws-sdk/' + 'client-s3';
    const { GetObjectCommand } = await import(/* webpackIgnore: true */ modName);
    const response = await client.send(
      new GetObjectCommand({
        Bucket: this.config.bucket,
        Key: path,
      }),
    );
    // response.Body is a Readable stream — collect into Buffer
    const chunks: Uint8Array[] = [];
    for await (const chunk of response.Body) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }

  async delete(path: string): Promise<void> {
    const client = await this.getClient();
    const modName = '@aws-sdk/' + 'client-s3';
    const { DeleteObjectCommand } = await import(/* webpackIgnore: true */ modName);
    await client.send(
      new DeleteObjectCommand({
        Bucket: this.config.bucket,
        Key: path,
      }),
    );
  }

  async exists(path: string): Promise<boolean> {
    const client = await this.getClient();
    const modName = '@aws-sdk/' + 'client-s3';
    const { HeadObjectCommand } = await import(/* webpackIgnore: true */ modName);
    try {
      await client.send(
        new HeadObjectCommand({
          Bucket: this.config.bucket,
          Key: path,
        }),
      );
      return true;
    } catch (err: unknown) {
      if ((err as { name?: string }).name === 'NotFound') return false;
      if ((err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404) return false;
      throw err;
    }
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
 * Build S3StorageConfig from environment variables.
 * Returns null if required env vars are not set.
 */
function getS3ConfigFromEnv(): S3StorageConfig | null {
  const bucket = process.env.BACKUP_S3_BUCKET;
  const region = process.env.BACKUP_S3_REGION;
  const accessKeyId = process.env.BACKUP_S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.BACKUP_S3_SECRET_ACCESS_KEY;

  if (!bucket || !region || !accessKeyId || !secretAccessKey) return null;

  return {
    bucket,
    region,
    accessKeyId,
    secretAccessKey,
    endpoint: process.env.BACKUP_S3_ENDPOINT,
    forcePathStyle: process.env.BACKUP_S3_FORCE_PATH_STYLE !== 'false',
  };
}

/**
 * Auto-detect the best storage driver for the current environment.
 * Priority: S3 (if configured) → database (Vercel) → local (dev/Docker)
 */
export function detectStorageDriver(): string {
  // S3 takes priority when configured — works everywhere
  if (getS3ConfigFromEnv()) return 's3';
  // Vercel sets VERCEL=1 in all environments
  if (process.env.VERCEL) return 'database';
  // Also check for common serverless indicators
  if (process.env.AWS_LAMBDA_FUNCTION_NAME) return 'database';
  // Fallback: detect Vercel runtime path even if env var is missing
  if (process.cwd().startsWith('/var/task')) return 'database';
  return 'local';
}

/**
 * Get the backup storage instance based on driver type.
 * - 'local': filesystem (local dev / Docker)
 * - 'database': stores in platform_backups.compressed_data column
 * - 's3': S3-compatible object storage (AWS S3, Cloudflare R2, MinIO)
 */
export function getBackupStorage(driver?: string): BackupStorage {
  const resolved = driver ?? detectStorageDriver();

  if (resolved === 'database') {
    return new DatabaseBackupStorage();
  }

  if (resolved === 's3') {
    const config = getS3ConfigFromEnv();
    if (!config) {
      throw new Error(
        'S3 storage driver requires env vars: BACKUP_S3_BUCKET, BACKUP_S3_REGION, ' +
        'BACKUP_S3_ACCESS_KEY_ID, BACKUP_S3_SECRET_ACCESS_KEY. ' +
        'Optional: BACKUP_S3_ENDPOINT (required for R2/MinIO).',
      );
    }
    return new S3BackupStorage(config);
  }

  if (resolved === 'local') {
    const rootDir = join(process.cwd(), 'data', 'backups');
    return new LocalBackupStorage(rootDir);
  }

  throw new Error(`Unsupported storage driver: ${resolved}. Supported: 'local', 'database', 's3'.`);
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
