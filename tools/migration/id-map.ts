/**
 * Legacy ID -> New ULID Mapping
 *
 * Every legacy row gets a deterministic ULID. The mapping is stored in
 * a database table so we can:
 * 1. Resolve foreign key references across domains
 * 2. Support incremental/resumable migrations
 * 3. Provide rollback capability
 */
import { drizzle } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import postgres from 'postgres';
import { ulid } from 'ulid';

export class IdMap {
  private db: ReturnType<typeof drizzle>;
  private cache: Map<string, string> = new Map();
  private pendingWrites: Array<{
    legacy_table: string;
    legacy_id: string;
    new_table: string;
    new_id: string;
    tenant_id: string;
  }> = [];
  private flushThreshold = 1000;

  constructor(connectionString: string) {
    const client = postgres(connectionString, { max: 3 });
    this.db = drizzle(client);
  }

  /** Generate a cache key */
  private key(table: string, legacyId: string | number): string {
    return `${table}:${legacyId}`;
  }

  /** Get or create a ULID for a legacy ID */
  async getOrCreate(
    legacyTable: string,
    legacyId: string | number,
    newTable: string,
    tenantId: string,
  ): Promise<string> {
    const k = this.key(legacyTable, legacyId);

    // Check in-memory cache first
    const cached = this.cache.get(k);
    if (cached) return cached;

    // Check database
    const rows = await this.db.execute(sql`
      SELECT new_id FROM legacy_id_map
      WHERE legacy_table = ${legacyTable}
        AND legacy_id = ${String(legacyId)}
      LIMIT 1
    `);

    const existing = Array.from(rows as Iterable<{ new_id: string }>);
    if (existing.length > 0) {
      this.cache.set(k, existing[0]!.new_id);
      return existing[0]!.new_id;
    }

    // Generate new ULID
    const newId = ulid();
    this.cache.set(k, newId);

    // Queue for batch write
    this.pendingWrites.push({
      legacy_table: legacyTable,
      legacy_id: String(legacyId),
      new_table: newTable,
      new_id: newId,
      tenant_id: tenantId,
    });

    if (this.pendingWrites.length >= this.flushThreshold) {
      await this.flush();
    }

    return newId;
  }

  /** Resolve an existing mapping (returns null if not found) */
  async resolve(legacyTable: string, legacyId: string | number | null | undefined): Promise<string | null> {
    if (legacyId == null) return null;

    const k = this.key(legacyTable, legacyId);
    const cached = this.cache.get(k);
    if (cached) return cached;

    const rows = await this.db.execute(sql`
      SELECT new_id FROM legacy_id_map
      WHERE legacy_table = ${legacyTable}
        AND legacy_id = ${String(legacyId)}
      LIMIT 1
    `);

    const existing = Array.from(rows as Iterable<{ new_id: string }>);
    if (existing.length > 0) {
      this.cache.set(k, existing[0]!.new_id);
      return existing[0]!.new_id;
    }

    return null;
  }

  /** Resolve or throw */
  async resolveRequired(legacyTable: string, legacyId: string | number, context: string): Promise<string> {
    const result = await this.resolve(legacyTable, legacyId);
    if (!result) {
      throw new Error(
        `Missing ID mapping: ${legacyTable}:${legacyId} (context: ${context})`
      );
    }
    return result;
  }

  /** Flush pending writes to database */
  async flush(): Promise<void> {
    if (this.pendingWrites.length === 0) return;

    const batch = this.pendingWrites.splice(0);

    // Use unnest for bulk insert
    const legacyTables = batch.map(r => r.legacy_table);
    const legacyIds = batch.map(r => r.legacy_id);
    const newTables = batch.map(r => r.new_table);
    const newIds = batch.map(r => r.new_id);
    const tenantIds = batch.map(r => r.tenant_id);

    await this.db.execute(sql`
      INSERT INTO legacy_id_map (legacy_table, legacy_id, new_table, new_id, tenant_id)
      SELECT * FROM unnest(
        ${legacyTables}::text[],
        ${legacyIds}::text[],
        ${newTables}::text[],
        ${newIds}::text[],
        ${tenantIds}::text[]
      )
      ON CONFLICT (legacy_table, legacy_id) DO NOTHING
    `);
  }

  /** Preload all mappings for a legacy table into cache */
  async preload(legacyTable: string): Promise<void> {
    const rows = await this.db.execute(sql`
      SELECT legacy_id, new_id FROM legacy_id_map
      WHERE legacy_table = ${legacyTable}
    `);

    for (const row of Array.from(rows as Iterable<{ legacy_id: string; new_id: string }>)) {
      this.cache.set(this.key(legacyTable, row.legacy_id), row.new_id);
    }
  }

  /** Clear the in-memory cache */
  clearCache(): void {
    this.cache.clear();
  }

  /** Get statistics */
  async stats(): Promise<{ totalMappings: number; byTable: Record<string, number> }> {
    const rows = await this.db.execute(sql`
      SELECT legacy_table, COUNT(*)::int AS count
      FROM legacy_id_map
      GROUP BY legacy_table
      ORDER BY legacy_table
    `);

    const byTable: Record<string, number> = {};
    let total = 0;
    for (const row of Array.from(rows as Iterable<{ legacy_table: string; count: number }>)) {
      byTable[row.legacy_table] = row.count;
      total += row.count;
    }

    return { totalMappings: total, byTable };
  }
}
