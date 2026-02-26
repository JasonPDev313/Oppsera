import { db } from '@oppsera/db';
import { sql } from 'drizzle-orm';
import type { TableInfo } from './types';

// Tables to exclude from backups (system tables + backup tables themselves)
const EXCLUDED_TABLES = new Set([
  'drizzle_migrations',
  '__drizzle_migrations',
  'spatial_ref_sys',
  'platform_backups',
  'platform_restore_operations',
  'platform_backup_settings',
]);

/**
 * Discover all user tables in the public schema.
 * Returns table names with estimated row counts and sizes.
 * Uses a safe size estimation that catches per-table errors.
 */
export async function discoverTables(): Promise<TableInfo[]> {
  // Step 1: Get table names + estimated row counts (never fails)
  const result = await db.execute(sql`
    SELECT
      t.table_name,
      COALESCE(c.reltuples::bigint, 0) AS estimated_row_count
    FROM information_schema.tables t
    LEFT JOIN pg_class c
      ON c.relname = t.table_name AND c.relkind = 'r'
    WHERE t.table_schema = 'public'
      AND t.table_type = 'BASE TABLE'
    ORDER BY t.table_name
  `);

  const rows = Array.from(result as Iterable<{
    table_name: string;
    estimated_row_count: string;
  }>);

  // Step 2: Get sizes separately (may fail on some Supabase roles)
  let sizeMap = new Map<string, number>();
  try {
    const sizeResult = await db.execute(sql`
      SELECT
        c.relname AS table_name,
        pg_total_relation_size(c.oid)::bigint AS size_bytes
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'
    `);
    const sizeRows = Array.from(sizeResult as Iterable<{
      table_name: string;
      size_bytes: string;
    }>);
    for (const r of sizeRows) {
      sizeMap.set(r.table_name, Number(r.size_bytes));
    }
  } catch {
    // pg_total_relation_size may fail on restricted roles — sizes will be 0
    console.warn('[backup] Could not fetch table sizes — using 0 estimates');
  }

  return rows
    .filter((r) => !EXCLUDED_TABLES.has(r.table_name))
    .map((r) => ({
      name: r.table_name,
      estimatedRowCount: Number(r.estimated_row_count),
      estimatedSizeBytes: sizeMap.get(r.table_name) ?? 0,
    }));
}

/**
 * Build a foreign key dependency graph and return tables in topological order
 * (parents first). This ensures safe INSERT during restore (parents before children)
 * and safe TRUNCATE in reverse (children before parents).
 */
export async function getTableDependencyOrder(tableNames: string[]): Promise<string[]> {
  // Query FK relationships
  const result = await db.execute(sql`
    SELECT
      tc.table_name AS child_table,
      ccu.table_name AS parent_table
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_name = tc.constraint_name
      AND ccu.table_schema = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema = 'public'
      AND tc.table_name != ccu.table_name
  `);

  const edges = Array.from(result as Iterable<{
    child_table: string;
    parent_table: string;
  }>);

  // Build adjacency list (parent → children)
  const tableSet = new Set(tableNames);
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, Set<string>>();

  for (const name of tableNames) {
    inDegree.set(name, 0);
    adjacency.set(name, new Set());
  }

  for (const { child_table, parent_table } of edges) {
    if (!tableSet.has(child_table) || !tableSet.has(parent_table)) continue;
    // parent_table → child_table (parent must come first)
    adjacency.get(parent_table)!.add(child_table);
    inDegree.set(child_table, (inDegree.get(child_table) ?? 0) + 1);
  }

  // Kahn's algorithm (topological sort)
  const queue: string[] = [];
  for (const [name, degree] of inDegree) {
    if (degree === 0) queue.push(name);
  }

  const sorted: string[] = [];
  while (queue.length > 0) {
    const current = queue.shift()!;
    sorted.push(current);
    for (const child of adjacency.get(current) ?? []) {
      const newDegree = (inDegree.get(child) ?? 1) - 1;
      inDegree.set(child, newDegree);
      if (newDegree === 0) queue.push(child);
    }
  }

  // Tables not in sorted output have circular deps — append them at the end
  // (the DEFERRED CONSTRAINTS in restore handles these)
  for (const name of tableNames) {
    if (!sorted.includes(name)) {
      sorted.push(name);
    }
  }

  return sorted;
}

/**
 * Get column names for a given table.
 */
export async function getTableColumns(tableName: string): Promise<string[]> {
  const result = await db.execute(sql`
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
 * Get the current Postgres version string.
 */
export async function getPgVersion(): Promise<string> {
  const result = await db.execute(sql`SELECT version() AS v`);
  const rows = Array.from(result as Iterable<{ v: string }>);
  return rows[0]?.v ?? 'unknown';
}

/**
 * Get the highest migration index (used as schemaVersion in manifests).
 */
export async function getSchemaVersion(): Promise<string> {
  try {
    const result = await db.execute(sql`
      SELECT MAX(idx) AS max_idx FROM drizzle_migrations
    `);
    const rows = Array.from(result as Iterable<{ max_idx: string | null }>);
    return String(rows[0]?.max_idx ?? '0');
  } catch {
    return 'unknown';
  }
}
