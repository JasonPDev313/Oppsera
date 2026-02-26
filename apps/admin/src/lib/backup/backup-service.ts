import { gzip } from 'zlib';
import { promisify } from 'util';
import { createHash } from 'node:crypto';
import { db } from '@oppsera/db';
import { platformBackups } from '@oppsera/db/schema';
import { generateUlid } from '@oppsera/shared';
import { sql, eq } from 'drizzle-orm';
import {
  discoverTables,
  getTableDependencyOrder,
  getPgVersion,
  getSchemaVersion,
} from './table-discovery';
import { getBackupStorage, buildStoragePath, detectStorageDriver } from './storage';
import type {
  CreateBackupInput,
  CreateBackupResult,
  BackupManifest,
  BackupPayload,
  TableManifestEntry,
} from './types';

const gzipAsync = promisify(gzip);

const BATCH_SIZE = 5000;

/**
 * Create a full database backup.
 * Exports all public schema tables as compressed JSON.
 * Uses a transaction with RLS bypass to read all tenant data.
 */
export async function createBackup(input: CreateBackupInput): Promise<CreateBackupResult> {
  const backupId = generateUlid();
  const now = new Date();

  const storageDriver = detectStorageDriver();

  // Insert pending record
  await db.insert(platformBackups).values({
    id: backupId,
    type: input.type,
    status: 'in_progress',
    label: input.label ?? `${input.type} backup`,
    storageDriver,
    retentionTag: input.retentionTag ?? null,
    expiresAt: input.expiresAt ?? null,
    initiatedByAdminId: input.adminId ?? null,
    startedAt: now,
  });

  try {
    // 1. Discover tables
    const tables = await discoverTables();
    const tableNames = tables.map((t) => t.name);

    // 2. Get dependency order
    const orderedNames = await getTableDependencyOrder(tableNames);

    // 3. Export data inside a transaction with RLS bypassed
    //    Tables with FORCE ROW LEVEL SECURITY filter on app.current_tenant_id,
    //    which is empty outside withTenant(). We bypass by temporarily becoming
    //    the postgres superuser role which is exempt from RLS.
    const data: Record<string, unknown[]> = {};
    const manifestTables: TableManifestEntry[] = [];
    let totalRows = 0;

    await db.transaction(async (tx) => {
      // Extend statement timeout — backup may take minutes for large DBs
      await tx.execute(sql`SET LOCAL statement_timeout = '600s'`);
      await tx.execute(sql`SET LOCAL idle_in_transaction_session_timeout = '660s'`);

      // Bypass RLS for this transaction.
      // Try multiple approaches since Supavisor may restrict SET ROLE.
      let _rlsBypassed = false;
      try {
        await tx.execute(sql`SET LOCAL role = 'postgres'`);
        _rlsBypassed = true;
      } catch {
        // SET ROLE to postgres failed — try supabase_admin (Supabase-specific)
        try {
          await tx.execute(sql`SET LOCAL role = 'supabase_admin'`);
          _rlsBypassed = true;
        } catch {
          // Neither role works. Try disabling RLS directly (requires superuser).
          try {
            await tx.execute(sql`SET LOCAL row_security = 'off'`);
            _rlsBypassed = true;
          } catch {
            console.warn(
              '[backup] Could not bypass RLS — backup may have incomplete data. ' +
              'Tables with FORCE ROW LEVEL SECURITY will return 0 rows.',
            );
          }
        }
      }

      for (const tableName of orderedNames) {
        const rows = await exportTableInTx(tx, tableName);
        const columns = await getTableColumnsInTx(tx, tableName);
        data[tableName] = rows;
        manifestTables.push({
          name: tableName,
          rowCount: rows.length,
          columns,
        });
        totalRows += rows.length;
      }
    });

    // 4. Build manifest
    const pgVersion = await getPgVersion();
    const schemaVersion = await getSchemaVersion();

    const manifest: BackupManifest = {
      version: 1,
      createdAt: now.toISOString(),
      pgVersion,
      schemaVersion,
      tableCount: orderedNames.length,
      rowCount: totalRows,
      tables: manifestTables,
    };

    const payload: BackupPayload = { manifest, data };

    // 5. Serialize + compress
    const jsonStr = JSON.stringify(payload);
    const compressed = await gzipAsync(Buffer.from(jsonStr, 'utf-8'), { level: 6 });

    // 6. Checksum
    const checksum = createHash('sha256').update(compressed).digest('hex');

    // 7. Write to storage (uses driver detected at start of function)
    const storagePath = buildStoragePath(backupId, now);
    const storage = getBackupStorage(storageDriver);
    await storage.write(storagePath, compressed);

    // 8. Update record
    await db
      .update(platformBackups)
      .set({
        status: 'completed',
        tableCount: orderedNames.length,
        rowCount: totalRows,
        sizeBytes: compressed.length,
        checksum,
        storagePath,
        completedAt: new Date(),
        metadata: {
          tableManifest: manifestTables.map((t) => ({ name: t.name, rowCount: t.rowCount })),
          schemaVersion,
          pgVersion,
        },
        updatedAt: new Date(),
      })
      .where(eq(platformBackups.id, backupId));

    return {
      backupId,
      tableCount: orderedNames.length,
      rowCount: totalRows,
      sizeBytes: compressed.length,
    };
  } catch (err) {
    // Mark as failed
    await db
      .update(platformBackups)
      .set({
        status: 'failed',
        errorMessage: err instanceof Error ? err.message : 'Unknown error',
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(platformBackups.id, backupId));

    throw err;
  }
}

/**
 * Export all rows from a single table using batched SELECT (inside a transaction).
 */
async function exportTableInTx(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], tableName: string): Promise<unknown[]> {
  const allRows: unknown[] = [];
  let offset = 0;

  while (true) {
    // Table name is from information_schema (safe), not user input
    const result = await tx.execute(
      sql.raw(`SELECT * FROM "${tableName}" ORDER BY ctid LIMIT ${BATCH_SIZE} OFFSET ${offset}`),
    );

    const rows = Array.from(result as Iterable<unknown>);
    if (rows.length === 0) break;

    allRows.push(...rows);
    offset += rows.length;

    if (rows.length < BATCH_SIZE) break;
  }

  return allRows;
}

/**
 * Get column names for a table (inside a transaction).
 */
async function getTableColumnsInTx(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], tableName: string): Promise<string[]> {
  const result = await tx.execute(sql`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = ${tableName}
    ORDER BY ordinal_position
  `);
  return Array.from(result as Iterable<{ column_name: string }>)
    .map((r) => r.column_name);
}

/**
 * Load a backup payload from storage (decompress + parse).
 */
export async function loadBackupPayload(backupId: string): Promise<BackupPayload> {
  const { gunzip } = await import('zlib');
  const { promisify: promisifyGunzip } = await import('util');
  const gunzipAsync = promisifyGunzip(gunzip);

  // Get backup record
  const result = await db.execute(
    sql`SELECT storage_driver, storage_path, checksum FROM platform_backups WHERE id = ${backupId}`,
  );
  const rows = Array.from(result as Iterable<{
    storage_driver: string;
    storage_path: string;
    checksum: string;
  }>);

  if (rows.length === 0) throw new Error(`Backup not found: ${backupId}`);
  const record = rows[0]!;

  // Read from storage
  const storage = getBackupStorage(record.storage_driver);
  const compressed = await storage.read(record.storage_path);

  // Verify checksum
  const actualChecksum = createHash('sha256').update(compressed).digest('hex');
  if (actualChecksum !== record.checksum) {
    throw new Error(`Checksum mismatch. Expected: ${record.checksum}, Got: ${actualChecksum}. Backup may be corrupted.`);
  }

  // Decompress + parse
  const decompressed = await gunzipAsync(compressed);
  return JSON.parse(decompressed.toString('utf-8')) as BackupPayload;
}
