import { db } from '@oppsera/db';
import { platformRestoreOperations } from '@oppsera/db/schema';
import { sql, eq } from 'drizzle-orm';
import { createBackup } from './backup-service';
import { StreamingBackupReader } from './streaming-loader';
import { getTableDependencyOrder, getSchemaVersion } from './table-discovery';
import type { BackupManifest, BackupPayload, RestoreValidation, TenantRestoreValidation, RestoreProgress } from './types';

/**
 * Input accepted by validateBackup(). Either:
 * - A full BackupPayload (for callers like validateTenantRestore that already have it)
 * - A lightweight { manifest, tableNames } pair (from StreamingBackupReader, avoids full JSON.parse)
 */
type ValidateInput =
  | BackupPayload
  | { manifest: BackupManifest; tableNames: string[] };

const INSERT_BATCH_SIZE = 1000;

/**
 * Tables excluded from both backup and restore operations.
 * Shared list to keep backup-side and restore-side in sync.
 */
const EXCLUDED_SYSTEM_TABLES = new Set([
  'drizzle_migrations',
  '__drizzle_migrations',
  'spatial_ref_sys',
  'platform_backups',
  'platform_restore_operations',
  'platform_backup_settings',
  'distributed_locks',
]);

/**
 * Validate a backup against the current database schema.
 * Returns warnings (non-blocking) and errors (blocking).
 *
 * Accepts either a full BackupPayload or a lightweight { manifest, tableNames }
 * pair from StreamingBackupReader (avoids parsing all table data just for validation).
 */
export async function validateBackup(input: ValidateInput): Promise<RestoreValidation> {
  const warnings: string[] = [];
  const errors: string[] = [];

  // Extract manifest and table names from either input shape
  const manifest = input.manifest;
  const backupTableNames = 'data' in input
    ? Object.keys(input.data)
    : input.tableNames;

  // Get current tables
  const result = await db.execute(sql`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
  `);
  const currentTables = new Set(
    Array.from(result as Iterable<{ table_name: string }>).map((r) => r.table_name),
  );

  const backupTables = new Set(backupTableNames);

  // Tables in backup but not in DB (will be skipped)
  for (const t of backupTables) {
    if (!currentTables.has(t)) {
      warnings.push(`Table "${t}" exists in backup but not in current DB — will be skipped`);
    }
  }

  // Tables in DB but not in backup (will be truncated to empty)
  for (const t of currentTables) {
    if (!backupTables.has(t) && !EXCLUDED_SYSTEM_TABLES.has(t)) {
      warnings.push(`Table "${t}" exists in DB but not in backup — will be truncated to empty`);
    }
  }

  // Check manifest version
  if (manifest.version !== 1) {
    errors.push(`Unsupported backup version: ${manifest.version}`);
  }

  // Hard-block on schema version mismatch — restoring into a different schema
  // can silently corrupt data (missing columns, type mismatches, FK violations)
  const currentSchemaVersion = await getSchemaVersion();
  if (
    currentSchemaVersion !== 'unknown' &&
    manifest.schemaVersion !== 'unknown' &&
    currentSchemaVersion !== manifest.schemaVersion
  ) {
    errors.push(
      `Schema version mismatch: backup was created at migration idx ${manifest.schemaVersion}, ` +
      `but the current database is at idx ${currentSchemaVersion}. ` +
      `Run migrations to align before restoring.`,
    );
  }

  return {
    compatible: errors.length === 0,
    warnings,
    errors,
  };
}

/**
 * Execute a database restore from a backup.
 * Creates a safety backup first, then atomically restores all data.
 *
 * IMPORTANT: This function performs long-running DB work. On Vercel,
 * callers MUST await this function before returning the HTTP response.
 * Fire-and-forget will cause zombie DB connections (see gotcha #466).
 */
export async function executeRestore(restoreOpId: string): Promise<void> {
  // Get restore operation
  const opResult = await db.execute(
    sql`SELECT backup_id, status FROM platform_restore_operations WHERE id = ${restoreOpId}`,
  );
  const ops = Array.from(opResult as Iterable<{ backup_id: string; status: string }>);
  if (ops.length === 0) throw new Error(`Restore operation not found: ${restoreOpId}`);
  const op = ops[0]!;

  // Only allow approved status — pending_approval requires explicit approval first
  if (op.status !== 'approved') {
    throw new Error(`Restore operation is in status "${op.status}", expected "approved"`);
  }

  // Mark as in_progress
  await db
    .update(platformRestoreOperations)
    .set({ status: 'in_progress', startedAt: new Date(), updatedAt: new Date() })
    .where(eq(platformRestoreOperations.id, restoreOpId));

  try {
    // 1. Create safety backup before restore
    await updateRestoreProgress(restoreOpId, { phase: 'safety_backup', updatedAt: new Date().toISOString() });

    const safetyResult = await createBackup({
      type: 'pre_restore',
      label: `Safety backup before restore ${restoreOpId}`,
    });

    await db
      .update(platformRestoreOperations)
      .set({ safetyBackupId: safetyResult.backupId, updatedAt: new Date() })
      .where(eq(platformRestoreOperations.id, restoreOpId));

    // 2. Load backup via streaming reader (memory-efficient — parses one table at a time)
    await updateRestoreProgress(restoreOpId, { phase: 'loading', updatedAt: new Date().toISOString() });
    const reader = await StreamingBackupReader.fromBackupId(op.backup_id);

    // 3. Validate backup using lightweight manifest + table name extraction (no full data parse)
    await updateRestoreProgress(restoreOpId, { phase: 'validating', updatedAt: new Date().toISOString() });
    const manifest = reader.getManifest();
    const allTableNames = reader.getTableNames();

    const validation = await validateBackup({ manifest, tableNames: allTableNames });

    if (!validation.compatible) {
      reader.release();
      throw new Error(`Backup incompatible: ${validation.errors.join('; ')}`);
    }

    // 4. Determine which tables to restore (only those in both backup AND current DB)
    const currentTablesResult = await db.execute(sql`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    `);
    const currentTables = new Set(
      Array.from(currentTablesResult as Iterable<{ table_name: string }>).map((r) => r.table_name),
    );

    const backupTableNames = allTableNames.filter(
      (t) => currentTables.has(t) && !EXCLUDED_SYSTEM_TABLES.has(t),
    );

    // 5. Get dependency order
    const orderedNames = await getTableDependencyOrder(backupTableNames);

    // 6. Atomic restore in a single transaction with RLS bypass
    let tablesRestored = 0;
    let rowsRestored = 0;

    try {
      await db.transaction(async (tx) => {
        // Set generous timeouts for restore (large tables take time)
        await tx.execute(sql`SET LOCAL statement_timeout = '300s'`);
        await tx.execute(sql`SET LOCAL idle_in_transaction_session_timeout = '600s'`);

        // Bypass RLS for this transaction — cascade through multiple methods
        // (same cascade as createBackup in backup-service.ts)
        let rlsBypassed = false;
        try {
          await tx.execute(sql`SET LOCAL role = 'postgres'`);
          rlsBypassed = true;
        } catch {
          try {
            await tx.execute(sql`SET LOCAL role = 'supabase_admin'`);
            rlsBypassed = true;
          } catch {
            try {
              await tx.execute(sql`SET LOCAL row_security = 'off'`);
              rlsBypassed = true;
            } catch {
              console.error(
                '[restore] CRITICAL: Could not bypass RLS via any method. ' +
                'Restore will fail on RLS-protected tables.',
              );
            }
          }
        }

        if (!rlsBypassed) {
          throw new Error('Cannot bypass RLS — restore would produce incomplete data. Aborting.');
        }

        // Defer all FK constraints
        await tx.execute(sql`SET CONSTRAINTS ALL DEFERRED`);

        // Truncate in reverse dependency order (children first)
        await updateRestoreProgress(restoreOpId, {
          phase: 'truncating', totalTables: orderedNames.length,
          tableIndex: 0, updatedAt: new Date().toISOString(),
        });
        const reverseOrder = [...orderedNames].reverse();
        for (let i = 0; i < reverseOrder.length; i++) {
          await tx.execute(sql.raw(`TRUNCATE "${reverseOrder[i]!}" CASCADE`));
          if (i % 10 === 0) {
            await updateRestoreProgress(restoreOpId, {
              phase: 'truncating', currentTable: reverseOrder[i],
              tableIndex: i + 1, totalTables: reverseOrder.length,
              updatedAt: new Date().toISOString(),
            });
          }
        }

        // Insert in dependency order (parents first)
        // StreamingBackupReader parses each table's JSON array on demand,
        // so only one table's row array is in memory at a time.
        for (let i = 0; i < orderedNames.length; i++) {
          const tableName = orderedNames[i]!;
          const rows = reader.getTableRows(tableName);
          if (!rows || rows.length === 0) {
            tablesRestored++;
            continue;
          }

          await updateRestoreProgress(restoreOpId, {
            phase: 'inserting', currentTable: tableName,
            tableIndex: i + 1, totalTables: orderedNames.length,
            rowsInserted: rowsRestored, updatedAt: new Date().toISOString(),
          });

          // Get columns from the first row
          const firstRow = rows[0] as Record<string, unknown>;
          const columns = Object.keys(firstRow);

          // Batch insert
          for (let j = 0; j < rows.length; j += INSERT_BATCH_SIZE) {
            const batch = rows.slice(j, j + INSERT_BATCH_SIZE);
            await insertBatch(tx, tableName, columns, batch as Record<string, unknown>[]);
          }

          tablesRestored++;
          rowsRestored += rows.length;
        }

        // Reset sequences to match restored data
        await updateRestoreProgress(restoreOpId, {
          phase: 'sequences', rowsInserted: rowsRestored,
          updatedAt: new Date().toISOString(),
        });
        await resetSequences(tx);
      });
    } finally {
      // Release the decompressed JSON string to free memory,
      // regardless of whether the transaction succeeded or failed
      reader.release();
    }

    // 6. Update restore operation as completed
    await updateRestoreProgress(restoreOpId, {
      phase: 'complete', rowsInserted: rowsRestored,
      updatedAt: new Date().toISOString(),
    });

    await db
      .update(platformRestoreOperations)
      .set({
        status: 'completed',
        tablesRestored,
        rowsRestored,
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(platformRestoreOperations.id, restoreOpId));
  } catch (err) {
    await db
      .update(platformRestoreOperations)
      .set({
        status: 'failed',
        errorMessage: err instanceof Error ? err.message : 'Unknown error',
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(platformRestoreOperations.id, restoreOpId));

    throw err;
  }
}

/**
 * Get the set of tables in the current DB that have a `tenant_id` column.
 * Used to determine which tables are tenant-scoped for partial restore.
 */
async function getTenantScopedTables(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
): Promise<Set<string>> {
  const result = await tx.execute(sql`
    SELECT DISTINCT table_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND column_name = 'tenant_id'
  `);
  return new Set(
    Array.from(result as Iterable<{ table_name: string }>).map((r) => r.table_name),
  );
}

/**
 * Validate a backup for tenant-scoped restore.
 * Checks which tables have tenant_id and how many rows belong to the target tenant.
 */
export async function validateTenantRestore(
  payload: BackupPayload,
  tenantId: string,
): Promise<TenantRestoreValidation> {
  const base = await validateBackup(payload);

  const tenantTables: string[] = [];
  let tenantRowCount = 0;

  // Check which backup tables have rows with the target tenant_id
  for (const [tableName, rows] of Object.entries(payload.data)) {
    if (EXCLUDED_SYSTEM_TABLES.has(tableName) || !rows || rows.length === 0) continue;

    const firstRow = rows[0] as Record<string, unknown>;
    if (!('tenant_id' in firstRow)) continue;

    const matchingRows = rows.filter(
      (r) => (r as Record<string, unknown>).tenant_id === tenantId,
    );
    if (matchingRows.length > 0) {
      tenantTables.push(tableName);
      tenantRowCount += matchingRows.length;
    }
  }

  if (tenantTables.length === 0) {
    base.warnings.push(`No data found for tenant "${tenantId}" in this backup`);
  }

  return {
    ...base,
    tenantTables,
    tenantRowCount,
  };
}

/**
 * Execute a tenant-scoped restore from a full-database backup.
 * Only restores rows belonging to the specified tenant_id.
 * Non-tenant tables (platform tables) are left untouched.
 *
 * Strategy:
 * - For tenant-scoped tables: DELETE WHERE tenant_id = $tenantId, then INSERT matching rows
 * - For non-tenant tables: skip entirely (platform data unchanged)
 * - Uses same RLS bypass, FK deferral, and dependency ordering as full restore
 *
 * IMPORTANT: This function performs long-running DB work. On Vercel,
 * callers MUST await this function before returning the HTTP response.
 * Fire-and-forget will cause zombie DB connections (see gotcha #466).
 */
export async function executeTenantRestore(restoreOpId: string): Promise<void> {
  // Get restore operation with scope_tenant_id
  const opResult = await db.execute(
    sql`SELECT backup_id, status, scope_tenant_id
        FROM platform_restore_operations WHERE id = ${restoreOpId}`,
  );
  const ops = Array.from(opResult as Iterable<{
    backup_id: string;
    status: string;
    scope_tenant_id: string | null;
  }>);
  if (ops.length === 0) throw new Error(`Restore operation not found: ${restoreOpId}`);
  const op = ops[0]!;

  if (op.status !== 'approved') {
    throw new Error(`Restore operation is in status "${op.status}", expected "approved"`);
  }
  if (!op.scope_tenant_id) {
    throw new Error('Restore operation has no scope_tenant_id — use executeRestore() for full restore');
  }

  const tenantId = op.scope_tenant_id;

  // Mark as in_progress
  await db
    .update(platformRestoreOperations)
    .set({ status: 'in_progress', startedAt: new Date(), updatedAt: new Date() })
    .where(eq(platformRestoreOperations.id, restoreOpId));

  try {
    // 1. Create safety backup (full database — captures pre-restore state)
    await updateRestoreProgress(restoreOpId, { phase: 'safety_backup', updatedAt: new Date().toISOString() });

    const safetyResult = await createBackup({
      type: 'pre_restore',
      label: `Safety backup before tenant restore ${restoreOpId} (tenant: ${tenantId})`,
    });

    await db
      .update(platformRestoreOperations)
      .set({ safetyBackupId: safetyResult.backupId, updatedAt: new Date() })
      .where(eq(platformRestoreOperations.id, restoreOpId));

    // 2. Load backup via streaming reader (memory-efficient)
    await updateRestoreProgress(restoreOpId, { phase: 'loading', updatedAt: new Date().toISOString() });
    const reader = await StreamingBackupReader.fromBackupId(op.backup_id);

    // 3. Validate backup using lightweight manifest + table names (no full data parse)
    await updateRestoreProgress(restoreOpId, { phase: 'validating', updatedAt: new Date().toISOString() });
    const manifest = reader.getManifest();
    const allTableNames = reader.getTableNames();

    const validation = await validateBackup({ manifest, tableNames: allTableNames });

    if (!validation.compatible) {
      reader.release();
      throw new Error(`Backup incompatible: ${validation.errors.join('; ')}`);
    }

    // 4. Determine which tables to restore
    const currentTablesResult = await db.execute(sql`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    `);
    const currentTables = new Set(
      Array.from(currentTablesResult as Iterable<{ table_name: string }>).map((r) => r.table_name),
    );

    const backupTableNames = allTableNames.filter(
      (t) => currentTables.has(t) && !EXCLUDED_SYSTEM_TABLES.has(t),
    );

    // 5. Get dependency order
    const orderedNames = await getTableDependencyOrder(backupTableNames);

    // 6. Atomic tenant-scoped restore in a single transaction
    let tablesRestored = 0;
    let rowsRestored = 0;

    try {
      await db.transaction(async (tx) => {
        await tx.execute(sql`SET LOCAL statement_timeout = '300s'`);
        await tx.execute(sql`SET LOCAL idle_in_transaction_session_timeout = '600s'`);

        // Bypass RLS
        let rlsBypassed = false;
        try {
          await tx.execute(sql`SET LOCAL role = 'postgres'`);
          rlsBypassed = true;
        } catch {
          try {
            await tx.execute(sql`SET LOCAL role = 'supabase_admin'`);
            rlsBypassed = true;
          } catch {
            try {
              await tx.execute(sql`SET LOCAL row_security = 'off'`);
              rlsBypassed = true;
            } catch {
              console.error(
                '[restore] CRITICAL: Could not bypass RLS via any method.',
              );
            }
          }
        }

        if (!rlsBypassed) {
          throw new Error('Cannot bypass RLS — restore would produce incomplete data. Aborting.');
        }

        // Defer all FK constraints
        await tx.execute(sql`SET CONSTRAINTS ALL DEFERRED`);

        // Determine which tables have tenant_id in the CURRENT database
        const tenantScopedTables = await getTenantScopedTables(tx);

        // Delete tenant data in reverse dependency order (children first)
        await updateRestoreProgress(restoreOpId, {
          phase: 'truncating', totalTables: orderedNames.length,
          tableIndex: 0, updatedAt: new Date().toISOString(),
        });
        const reverseOrder = [...orderedNames].reverse();
        for (let i = 0; i < reverseOrder.length; i++) {
          const tableName = reverseOrder[i]!;
          if (!tenantScopedTables.has(tableName)) continue;
          // Targeted delete — only removes this tenant's rows
          await tx.execute(
            sql`DELETE FROM ${sql.raw(`"${tableName}"`)} WHERE tenant_id = ${tenantId}`,
          );
        }

        // Insert tenant rows in dependency order (parents first)
        // StreamingBackupReader parses each table's JSON array on demand,
        // then we filter in-memory for this tenant's rows.
        for (let i = 0; i < orderedNames.length; i++) {
          const tableName = orderedNames[i]!;
          const rows = reader.getTableRows(tableName);
          if (!rows || rows.length === 0) continue;

          const firstRow = rows[0] as Record<string, unknown>;

          // Only process tenant-scoped tables — skip platform tables entirely
          if (!('tenant_id' in firstRow)) continue;

          // Filter to only this tenant's rows
          const tenantRows = rows.filter(
            (r) => (r as Record<string, unknown>).tenant_id === tenantId,
          );
          if (tenantRows.length === 0) continue;

          await updateRestoreProgress(restoreOpId, {
            phase: 'inserting', currentTable: tableName,
            tableIndex: i + 1, totalTables: orderedNames.length,
            rowsInserted: rowsRestored, updatedAt: new Date().toISOString(),
          });

          const columns = Object.keys(firstRow);

          // Batch insert
          for (let j = 0; j < tenantRows.length; j += INSERT_BATCH_SIZE) {
            const batch = tenantRows.slice(j, j + INSERT_BATCH_SIZE);
            await insertBatch(tx, tableName, columns, batch as Record<string, unknown>[]);
          }

          tablesRestored++;
          rowsRestored += tenantRows.length;
        }

        // Note: sequence reset is NOT needed for tenant-scoped restore — sequences are
        // shared across tenants and the max values from other tenants' data still hold.
      });
    } finally {
      // Release the decompressed JSON string to free memory
      reader.release();
    }

    // 6. Update restore operation as completed
    await updateRestoreProgress(restoreOpId, {
      phase: 'complete', rowsInserted: rowsRestored,
      updatedAt: new Date().toISOString(),
    });

    await db
      .update(platformRestoreOperations)
      .set({
        status: 'completed',
        tablesRestored,
        rowsRestored,
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(platformRestoreOperations.id, restoreOpId));
  } catch (err) {
    await db
      .update(platformRestoreOperations)
      .set({
        status: 'failed',
        errorMessage: err instanceof Error ? err.message : 'Unknown error',
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(platformRestoreOperations.id, restoreOpId));

    throw err;
  }
}

/**
 * Reset all sequences to match the maximum value of their associated columns.
 * After a restore, auto-increment sequences may be behind the restored data,
 * causing duplicate key violations on the next INSERT.
 */
async function resetSequences(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
): Promise<void> {
  // Find all sequences and their owning column
  const result = await tx.execute(sql`
    SELECT
      seq.relname AS sequence_name,
      tab.relname AS table_name,
      attr.attname AS column_name
    FROM pg_class seq
    JOIN pg_depend dep ON dep.objid = seq.oid
    JOIN pg_class tab ON dep.refobjid = tab.oid
    JOIN pg_attribute attr ON attr.attrelid = tab.oid AND attr.attnum = dep.refobjsubid
    WHERE seq.relkind = 'S'
      AND dep.deptype = 'a'
      AND tab.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  `);

  const sequences = Array.from(
    result as Iterable<{ sequence_name: string; table_name: string; column_name: string }>,
  );

  for (const seq of sequences) {
    // setval to MAX(column) or 1 if table is empty
    await tx.execute(sql.raw(
      `SELECT setval('"${seq.sequence_name}"', COALESCE((SELECT MAX("${seq.column_name}") FROM "${seq.table_name}"), 1))`,
    ));
  }
}

/**
 * Write restore progress to the restore operation's metadata column.
 * Non-blocking — errors are logged and swallowed (progress is informational).
 */
async function updateRestoreProgress(
  restoreOpId: string,
  progress: RestoreProgress,
): Promise<void> {
  try {
    await db
      .update(platformRestoreOperations)
      .set({
        metadata: progress as unknown as Record<string, unknown>,
        updatedAt: new Date(),
      })
      .where(eq(platformRestoreOperations.id, restoreOpId));
  } catch (err) {
    console.error('[restore] Failed to update progress:', err);
  }
}

/**
 * Insert a batch of rows into a table using properly parameterized SQL.
 * Handles JSON objects, arrays, Buffers, dates, and primitive types correctly.
 */
async function insertBatch(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  tableName: string,
  columns: string[],
  rows: Record<string, unknown>[],
): Promise<void> {
  if (rows.length === 0) return;

  const colList = columns.map((c) => `"${c}"`).join(', ');

  // Build parameterized values using Drizzle sql template
  const valueRows = rows.map((row) => {
    const vals = columns.map((col) => {
      const val = row[col];
      if (val === null || val === undefined) return sql`NULL`;

      // Arrays: use Postgres array literal syntax (text[], integer[], etc.)
      // JSON.stringify produces valid JSON which Postgres can cast to the target array type
      if (Array.isArray(val)) {
        // Check if array contains objects (JSONB array column) vs primitives (text[]/int[])
        if (val.length > 0 && typeof val[0] === 'object' && val[0] !== null) {
          // Array of objects → jsonb column
          return sql`${JSON.stringify(val)}::jsonb`;
        }
        // Primitive array → use Postgres array literal
        // Postgres can parse '{val1,val2}' into native array types
        const pgArray = `{${val.map((v) => {
          if (v === null) return 'NULL';
          if (typeof v === 'string') return `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
          return String(v);
        }).join(',')}}`;
        return sql`${pgArray}`;
      }

      // Plain objects (not arrays): JSON/JSONB columns
      if (typeof val === 'object') {
        // Buffer-like objects from JSON.parse (serialized as {type:"Buffer",data:[...]})
        if ((val as Record<string, unknown>).type === 'Buffer' && Array.isArray((val as Record<string, unknown>).data)) {
          const buf = Buffer.from((val as Record<string, unknown>).data as number[]);
          return sql`${buf}`;
        }
        return sql`${JSON.stringify(val)}::jsonb`;
      }

      return sql`${val}`;
    });
    return sql`(${sql.join(vals, sql`, `)})`;
  });

  const query = sql`INSERT INTO ${sql.raw(`"${tableName}"`)} (${sql.raw(colList)}) VALUES ${sql.join(valueRows, sql`, `)}`;
  await tx.execute(query);
}
