/**
 * restore-production-data.ts
 *
 * Restores data from a gzip-compressed JSON backup file created by
 * backup-production-data.ts.
 *
 * Usage:
 *   pnpm tsx tools/scripts/restore-production-data.ts backups/backup-2026-03-01T12-00-00.json.gz
 *   pnpm tsx tools/scripts/restore-production-data.ts --remote backups/backup-2026-03-01T12-00-00.json.gz
 */

import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { createGunzip } from 'zlib';
import { pipeline } from 'stream/promises';
import { Writable } from 'stream';
import postgres from 'postgres';
import readline from 'readline';

// ── dotenv cascade ──────────────────────────────────────────────
const isRemote = process.argv.includes('--remote');
if (isRemote) {
  dotenv.config({ path: path.resolve(process.cwd(), '.env.remote') });
}
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config();

// ── constants ───────────────────────────────────────────────────
const INSERT_BATCH_SIZE = 500;

// ── types ───────────────────────────────────────────────────────
interface TableManifest {
  name: string;
  rowCount: number;
}

interface BackupPayload {
  manifest: {
    createdAt: string;
    dbHost: string;
    tableCount: number;
    totalRows: number;
    tables: TableManifest[];
  };
  data: Record<string, Record<string, unknown>[]>;
}

// ── helpers ─────────────────────────────────────────────────────
function extractHost(url: string): string {
  return url.match(/@([^:/]+)/)?.[1] ?? 'unknown';
}

async function readBackupFile(filepath: string): Promise<BackupPayload> {
  const chunks: Buffer[] = [];
  const gunzip = createGunzip();
  const collector = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(chunk);
      callback();
    },
  });

  const readStream = fs.createReadStream(filepath);
  await pipeline(readStream, gunzip, collector);

  const json = Buffer.concat(chunks).toString('utf-8');
  return JSON.parse(json) as BackupPayload;
}

/**
 * Get FK-ordered table list from the database (for truncation ordering).
 */
async function getTableDependencyOrder(
  sql: postgres.Sql,
  tableNames: string[],
): Promise<string[]> {
  const tableSet = new Set(tableNames);

  const fks = await sql`
    SELECT
      tc.table_name      AS child,
      ccu.table_name     AS parent
    FROM information_schema.table_constraints tc
    JOIN information_schema.constraint_column_usage ccu
      ON tc.constraint_name = ccu.constraint_name
      AND tc.table_schema = ccu.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema = 'public'
      AND tc.table_name <> ccu.table_name
  `;

  // Build adjacency: parent → children
  const inDegree = new Map<string, number>();
  const adj = new Map<string, Set<string>>();

  for (const t of tableSet) {
    inDegree.set(t, 0);
    adj.set(t, new Set());
  }

  for (const { child, parent } of fks) {
    if (!tableSet.has(child) || !tableSet.has(parent)) continue;
    if (adj.get(parent)!.has(child)) continue;
    adj.get(parent)!.add(child);
    inDegree.set(child, (inDegree.get(child) ?? 0) + 1);
  }

  // Kahn's algorithm — parents first
  const queue: string[] = [];
  for (const [t, deg] of inDegree) {
    if (deg === 0) queue.push(t);
  }

  const sorted: string[] = [];
  while (queue.length > 0) {
    queue.sort();
    const node = queue.shift()!;
    sorted.push(node);
    for (const child of adj.get(node) ?? []) {
      const newDeg = (inDegree.get(child) ?? 1) - 1;
      inDegree.set(child, newDeg);
      if (newDeg === 0) queue.push(child);
    }
  }

  // Add any circular-FK tables at the end
  for (const t of tableSet) {
    if (!sorted.includes(t)) sorted.push(t);
  }

  return sorted;
}

// ── main ────────────────────────────────────────────────────────
async function main() {
  // Find backup file path (skip --remote flag)
  const backupPath = process.argv.filter((a) => a !== '--remote').find((a, i) => i >= 2);
  if (!backupPath) {
    console.error('Usage: pnpm tsx tools/scripts/restore-production-data.ts [--remote] <backup-file>');
    process.exit(1);
  }

  const resolvedPath = path.resolve(process.cwd(), backupPath);
  if (!fs.existsSync(resolvedPath)) {
    console.error(`Backup file not found: ${resolvedPath}`);
    process.exit(1);
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL not set');
    process.exit(1);
  }

  const host = extractHost(connectionString);

  console.log('\n  Reading backup file...');
  const backup = await readBackupFile(resolvedPath);

  // Show manifest
  console.log('\n' + '='.repeat(60));
  console.log('  RESTORE — DATABASE');
  console.log('  Target host: ' + host);
  console.log('  Backup from: ' + backup.manifest.createdAt);
  console.log('  Backup host: ' + backup.manifest.dbHost);
  console.log(`  Tables: ${backup.manifest.tableCount}`);
  console.log(`  Total rows: ${backup.manifest.totalRows.toLocaleString()}`);
  console.log('='.repeat(60));
  console.log('\n  This will TRUNCATE all tables in the backup and replace');
  console.log('  them with the backup data. This is DESTRUCTIVE.\n');

  // Safety guard
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise<string>((resolve) => {
    rl.question(`  Type "${host}" to confirm restore: `, resolve);
  });
  rl.close();
  if (answer.trim() !== host) {
    console.error('\n  Aborted. No changes made.\n');
    process.exit(1);
  }

  const sql = postgres(connectionString, {
    max: 1,
    prepare: false,
    idle_timeout: 30,
    connect_timeout: 15,
  });

  try {
    const tableNames = Object.keys(backup.data);
    const insertOrder = await getTableDependencyOrder(sql, tableNames);
    // Truncate in reverse (children first), insert in forward (parents first)
    const truncateOrder = [...insertOrder].reverse();

    console.log('\n  Starting restore in a single transaction...\n');

    await sql.begin(async (tx) => {
      // Bypass RLS
      try {
        await tx`SET LOCAL role = 'postgres'`;
      } catch {
        try {
          await tx`SET LOCAL role = 'supabase_admin'`;
        } catch {
          console.warn('  Could not bypass RLS — restore may fail on RLS-protected tables');
        }
      }

      // Defer FK constraints so we can truncate/insert freely
      await tx`SET CONSTRAINTS ALL DEFERRED`;

      // Phase 1: Truncate tables (children first)
      console.log('  Phase 1: Truncating tables...');
      for (const table of truncateOrder) {
        if (!backup.data[table] || backup.data[table].length === 0) continue;
        await tx`TRUNCATE ${tx(table)} CASCADE`;
        process.stdout.write(`\r  Truncated: ${table}                    `);
      }
      console.log('\r  Truncation complete.                              ');

      // Phase 2: Insert data (parents first)
      console.log('  Phase 2: Inserting data...');
      let tablesInserted = 0;

      for (const table of insertOrder) {
        const rows = backup.data[table];
        if (!rows || rows.length === 0) continue;

        let inserted = 0;
        for (let offset = 0; offset < rows.length; offset += INSERT_BATCH_SIZE) {
          const batch = rows.slice(offset, offset + INSERT_BATCH_SIZE);
          const columns = Object.keys(batch[0]!);

          // Build a dynamic insert using postgres.js tagged template
          await tx`
            INSERT INTO ${tx(table)} ${tx(batch as Record<string, unknown>[], ...columns)}
          `;

          inserted += batch.length;
        }

        tablesInserted++;
        const pct = Math.round((tablesInserted / tableNames.length) * 100);
        process.stdout.write(
          `\r  [${pct}%] ${table} — ${inserted.toLocaleString()} rows`,
        );
      }

      console.log('\n');
    });

    // Verify
    console.log('  Verifying row counts...');
    let mismatches = 0;
    for (const entry of backup.manifest.tables) {
      const [{ count }] = await sql`
        SELECT count(*)::int AS count FROM ${sql(entry.name)}
      `;
      if (count !== entry.rowCount) {
        console.warn(
          `  MISMATCH: ${entry.name} — expected ${entry.rowCount}, got ${count}`,
        );
        mismatches++;
      }
    }

    if (mismatches === 0) {
      console.log('  All row counts match!');
    } else {
      console.warn(`  ${mismatches} table(s) have mismatched row counts.`);
    }

    console.log('\n  Restore complete!\n');
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error('Restore failed:', err);
  process.exit(1);
});
