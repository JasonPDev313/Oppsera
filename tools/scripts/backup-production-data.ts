/**
 * backup-production-data.ts
 *
 * Dumps all public-schema table data to a gzip-compressed JSON file.
 * Tables are discovered dynamically and ordered by FK dependencies.
 *
 * Usage:
 *   pnpm tsx tools/scripts/backup-production-data.ts            # local DB
 *   pnpm tsx tools/scripts/backup-production-data.ts --remote    # production DB
 */

import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { createGzip } from 'zlib';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
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
const BATCH_SIZE = 5000;
const EXCLUDED_TABLES = new Set([
  '__drizzle_migrations',
  'schema_migrations',
  'drizzle_migrations',
]);

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
  data: Record<string, unknown[]>;
}

// ── helpers ─────────────────────────────────────────────────────
function extractHost(url: string): string {
  return url.match(/@([^:/]+)/)?.[1] ?? 'unknown';
}

/**
 * Topological sort of tables respecting FK dependencies.
 * Returns tables in insertion order (parents first).
 */
async function getTableOrder(sql: postgres.Sql): Promise<string[]> {
  // Get all public tables
  const tables = await sql`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `;

  const allTables = new Set(
    tables
      .map((r: { table_name: string }) => r.table_name)
      .filter((t: string) => !EXCLUDED_TABLES.has(t)),
  );

  // Get FK constraints
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

  for (const t of allTables) {
    inDegree.set(t, 0);
    adj.set(t, new Set());
  }

  for (const { child, parent } of fks) {
    if (!allTables.has(child) || !allTables.has(parent)) continue;
    if (adj.get(parent)!.has(child)) continue; // deduplicate
    adj.get(parent)!.add(child);
    inDegree.set(child, (inDegree.get(child) ?? 0) + 1);
  }

  // Kahn's algorithm
  const queue: string[] = [];
  for (const [t, deg] of inDegree) {
    if (deg === 0) queue.push(t);
  }

  const sorted: string[] = [];
  while (queue.length > 0) {
    queue.sort(); // deterministic within same in-degree
    const node = queue.shift()!;
    sorted.push(node);
    for (const child of adj.get(node) ?? []) {
      const newDeg = (inDegree.get(child) ?? 1) - 1;
      inDegree.set(child, newDeg);
      if (newDeg === 0) queue.push(child);
    }
  }

  // Add any remaining tables (circular FKs) at the end
  for (const t of allTables) {
    if (!sorted.includes(t)) sorted.push(t);
  }

  return sorted;
}

// ── main ────────────────────────────────────────────────────────
async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL not set');
    process.exit(1);
  }

  const host = extractHost(connectionString);

  // Safety guard for remote
  if (isRemote) {
    console.log('\n' + '='.repeat(60));
    console.log('  BACKUP — PRODUCTION DATABASE');
    console.log('  Host: ' + host);
    console.log('  This will READ all data (no writes).');
    console.log('='.repeat(60));

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await new Promise<string>((resolve) => {
      rl.question('  Type "yes" to continue: ', resolve);
    });
    rl.close();
    if (answer.trim() !== 'yes') {
      console.error('\n  Aborted.\n');
      process.exit(1);
    }
  }

  const sql = postgres(connectionString, {
    max: 1,
    prepare: false,
    idle_timeout: 30,
    connect_timeout: 15,
  });

  try {
    // Bypass RLS
    try {
      await sql`SET LOCAL role = 'postgres'`;
    } catch {
      try {
        await sql`SET LOCAL role = 'supabase_admin'`;
      } catch {
        console.warn('  Could not bypass RLS — some tables may return partial data');
      }
    }

    console.log('\n  Discovering tables...');
    const tableOrder = await getTableOrder(sql);
    console.log(`  Found ${tableOrder.length} tables\n`);

    const backup: BackupPayload = {
      manifest: {
        createdAt: new Date().toISOString(),
        dbHost: host,
        tableCount: 0,
        totalRows: 0,
        tables: [],
      },
      data: {},
    };

    let tablesProcessed = 0;

    for (const table of tableOrder) {
      // Count rows first
      const [{ count }] = await sql`
        SELECT count(*)::int AS count FROM ${sql(table)}
      `;

      if (count === 0) {
        tablesProcessed++;
        continue;
      }

      // Read in batches
      const rows: unknown[] = [];
      let offset = 0;

      while (offset < count) {
        const batch = await sql`
          SELECT * FROM ${sql(table)}
          LIMIT ${BATCH_SIZE} OFFSET ${offset}
        `;
        for (const row of batch) {
          rows.push(row);
        }
        offset += BATCH_SIZE;
      }

      backup.data[table] = rows;
      backup.manifest.tables.push({ name: table, rowCount: rows.length });
      backup.manifest.totalRows += rows.length;

      tablesProcessed++;
      const pct = Math.round((tablesProcessed / tableOrder.length) * 100);
      process.stdout.write(
        `\r  [${pct}%] ${table} — ${rows.length.toLocaleString()} rows`,
      );
    }

    backup.manifest.tableCount = backup.manifest.tables.length;
    console.log('\n');

    // Write to disk
    const backupsDir = path.resolve(process.cwd(), 'backups');
    if (!fs.existsSync(backupsDir)) {
      fs.mkdirSync(backupsDir, { recursive: true });
    }

    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, '-')
      .replace('T', 'T')
      .slice(0, 19);
    const filename = `backup-${timestamp}.json.gz`;
    const filepath = path.join(backupsDir, filename);

    const jsonStr = JSON.stringify(backup);
    const readable = Readable.from([jsonStr]);
    const gzip = createGzip({ level: 6 });
    const writable = fs.createWriteStream(filepath);

    await pipeline(readable, gzip, writable);

    const stats = fs.statSync(filepath);
    const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
    const rawMB = (Buffer.byteLength(jsonStr) / 1024 / 1024).toFixed(2);

    console.log('  Backup complete!');
    console.log(`  File: ${filepath}`);
    console.log(`  Size: ${sizeMB} MB (compressed from ${rawMB} MB)`);
    console.log(`  Tables: ${backup.manifest.tableCount}`);
    console.log(`  Total rows: ${backup.manifest.totalRows.toLocaleString()}`);
    console.log();

    // Print table summary
    console.log('  Table summary:');
    for (const t of backup.manifest.tables) {
      console.log(`    ${t.name}: ${t.rowCount.toLocaleString()} rows`);
    }
    console.log();
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error('Backup failed:', err);
  process.exit(1);
});
