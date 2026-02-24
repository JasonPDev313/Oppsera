import { db } from '@oppsera/db';
import { platformRestoreOperations } from '@oppsera/db/schema';
import { sql, eq } from 'drizzle-orm';
import { createBackup, loadBackupPayload } from './backup-service';
import { getTableDependencyOrder } from './table-discovery';
import type { BackupPayload, RestoreValidation } from './types';

const INSERT_BATCH_SIZE = 1000;

/**
 * Validate a backup against the current database schema.
 * Returns warnings (non-blocking) and errors (blocking).
 */
export async function validateBackup(payload: BackupPayload): Promise<RestoreValidation> {
  const warnings: string[] = [];
  const errors: string[] = [];

  // Get current tables
  const result = await db.execute(sql`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
  `);
  const currentTables = new Set(
    Array.from(result as Iterable<{ table_name: string }>).map((r) => r.table_name),
  );

  const backupTables = new Set(Object.keys(payload.data));

  // Tables in backup but not in DB (will be skipped)
  for (const t of backupTables) {
    if (!currentTables.has(t)) {
      warnings.push(`Table "${t}" exists in backup but not in current DB — will be skipped`);
    }
  }

  // Tables in DB but not in backup (will be truncated to empty)
  const excludedFromBackup = new Set([
    'drizzle_migrations', '__drizzle_migrations', 'spatial_ref_sys',
    'platform_backups', 'platform_restore_operations', 'platform_backup_settings',
  ]);
  for (const t of currentTables) {
    if (!backupTables.has(t) && !excludedFromBackup.has(t)) {
      warnings.push(`Table "${t}" exists in DB but not in backup — will be truncated to empty`);
    }
  }

  // Check manifest version
  if (payload.manifest.version !== 1) {
    errors.push(`Unsupported backup version: ${payload.manifest.version}`);
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
 */
export async function executeRestore(restoreOpId: string): Promise<void> {
  // Get restore operation
  const opResult = await db.execute(
    sql`SELECT backup_id, status FROM platform_restore_operations WHERE id = ${restoreOpId}`,
  );
  const ops = Array.from(opResult as Iterable<{ backup_id: string; status: string }>);
  if (ops.length === 0) throw new Error(`Restore operation not found: ${restoreOpId}`);
  const op = ops[0]!;

  if (op.status !== 'approved' && op.status !== 'pending_approval') {
    throw new Error(`Restore operation is in status "${op.status}", expected "approved"`);
  }

  // Mark as in_progress
  await db
    .update(platformRestoreOperations)
    .set({ status: 'in_progress', startedAt: new Date(), updatedAt: new Date() })
    .where(eq(platformRestoreOperations.id, restoreOpId));

  try {
    // 1. Create safety backup before restore
    const safetyResult = await createBackup({
      type: 'pre_restore',
      label: `Safety backup before restore ${restoreOpId}`,
    });

    await db
      .update(platformRestoreOperations)
      .set({ safetyBackupId: safetyResult.backupId, updatedAt: new Date() })
      .where(eq(platformRestoreOperations.id, restoreOpId));

    // 2. Load and validate backup
    const payload = await loadBackupPayload(op.backup_id);
    const validation = await validateBackup(payload);

    if (!validation.compatible) {
      throw new Error(`Backup incompatible: ${validation.errors.join('; ')}`);
    }

    // 3. Determine which tables to restore (only those in both backup AND current DB)
    const currentTablesResult = await db.execute(sql`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    `);
    const currentTables = new Set(
      Array.from(currentTablesResult as Iterable<{ table_name: string }>).map((r) => r.table_name),
    );

    const excludedFromRestore = new Set([
      'drizzle_migrations', '__drizzle_migrations', 'spatial_ref_sys',
      'platform_backups', 'platform_restore_operations', 'platform_backup_settings',
    ]);

    const backupTableNames = Object.keys(payload.data).filter(
      (t) => currentTables.has(t) && !excludedFromRestore.has(t),
    );

    // 4. Get dependency order
    const orderedNames = await getTableDependencyOrder(backupTableNames);

    // 5. Atomic restore in a single transaction
    let tablesRestored = 0;
    let rowsRestored = 0;

    // Use raw SQL transaction for full control
    await db.execute(sql`BEGIN`);

    try {
      // Defer all FK constraints
      await db.execute(sql`SET CONSTRAINTS ALL DEFERRED`);

      // Truncate in reverse dependency order (children first)
      const reverseOrder = [...orderedNames].reverse();
      for (const tableName of reverseOrder) {
        await db.execute(sql.raw(`TRUNCATE "${tableName}" CASCADE`));
      }

      // Insert in dependency order (parents first)
      for (const tableName of orderedNames) {
        const rows = payload.data[tableName];
        if (!rows || rows.length === 0) {
          tablesRestored++;
          continue;
        }

        // Get columns from the first row
        const firstRow = rows[0] as Record<string, unknown>;
        const columns = Object.keys(firstRow);

        // Batch insert
        for (let i = 0; i < rows.length; i += INSERT_BATCH_SIZE) {
          const batch = rows.slice(i, i + INSERT_BATCH_SIZE);
          await insertBatch(tableName, columns, batch as Record<string, unknown>[]);
        }

        tablesRestored++;
        rowsRestored += rows.length;
      }

      await db.execute(sql`COMMIT`);
    } catch (err) {
      await db.execute(sql`ROLLBACK`);
      throw err;
    }

    // 6. Update restore operation as completed
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
 * Insert a batch of rows into a table using parameterized SQL.
 */
async function insertBatch(
  tableName: string,
  columns: string[],
  rows: Record<string, unknown>[],
): Promise<void> {
  if (rows.length === 0) return;

  const colList = columns.map((c) => `"${c}"`).join(', ');

  // Build parameterized values
  const valuePlaceholders: string[] = [];
  const params: unknown[] = [];
  let paramIdx = 1;

  for (const row of rows) {
    const rowPlaceholders: string[] = [];
    for (const col of columns) {
      const val = row[col];
      if (val === null || val === undefined) {
        rowPlaceholders.push('NULL');
      } else if (typeof val === 'object') {
        // JSONB values
        rowPlaceholders.push(`$${paramIdx}::jsonb`);
        params.push(JSON.stringify(val));
        paramIdx++;
      } else {
        rowPlaceholders.push(`$${paramIdx}`);
        params.push(val);
        paramIdx++;
      }
    }
    valuePlaceholders.push(`(${rowPlaceholders.join(', ')})`);
  }

  const query = `INSERT INTO "${tableName}" (${colList}) VALUES ${valuePlaceholders.join(', ')}`;

  // Use sql.raw with params — build a tagged template dynamically
  // Since we've built the query string with numbered $N placeholders, execute with params
  await (db.execute as any)(sql.raw(query), params);
}
