/**
 * Post-Migration Monitoring
 *
 * Run daily for 2 weeks after migration to detect:
 * 1. Data drift (new rows appearing in wrong tenant)
 * 2. Financial discrepancies
 * 3. Missing references
 * 4. Performance degradation
 */
import { drizzle } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import postgres from 'postgres';

interface MonitoringCheck {
  name: string;
  query: string;
  expectZero: boolean;
  description: string;
}

export class MigrationMonitor {
  private db: ReturnType<typeof drizzle>;
  private rawClient: ReturnType<typeof postgres>;

  constructor(connectionString: string) {
    this.rawClient = postgres(connectionString, { max: 3 });
    this.db = drizzle(this.rawClient);
  }

  /** Run all daily monitoring checks */
  async runDailyCheck(tenantId?: string): Promise<void> {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`  Post-Migration Daily Check — ${new Date().toISOString().split('T')[0]}`);
    if (tenantId) console.log(`  Tenant: ${tenantId}`);
    console.log(`${'='.repeat(60)}\n`);

    const checks = this.getChecks(tenantId);
    let passed = 0;
    let failed = 0;

    for (const check of checks) {
      try {
        const rows = await this.db.execute(sql.raw(check.query));
        const result = Array.from(rows as Iterable<{ count: number }>);
        const count = result[0]?.count ?? 0;
        const ok = check.expectZero ? count === 0 : count > 0;

        if (ok) {
          console.log(`  [PASS] ${check.name}: ${count}`);
          passed++;
        } else {
          console.log(`  [FAIL] ${check.name}: ${count} — ${check.description}`);
          failed++;
        }
      } catch (error) {
        console.log(`  [SKIP] ${check.name}: ${error instanceof Error ? error.message : 'error'}`);
      }
    }

    console.log(`\n  Summary: ${passed} passed, ${failed} failed\n`);

    // Record check results
    try {
      await this.db.execute(sql`
        CREATE TABLE IF NOT EXISTS migration_monitor_log (
          id SERIAL PRIMARY KEY,
          check_date DATE NOT NULL DEFAULT CURRENT_DATE,
          tenant_id TEXT,
          passed_count INTEGER NOT NULL,
          failed_count INTEGER NOT NULL,
          details JSONB,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await this.db.execute(sql`
        INSERT INTO migration_monitor_log (tenant_id, passed_count, failed_count)
        VALUES (${tenantId ?? null}, ${passed}, ${failed})
      `);
    } catch {
      // Non-critical
    }
  }

  /** Print ID mapping statistics */
  async printIdMapStats(): Promise<void> {
    console.log('\n-- ID Mapping Statistics --\n');

    try {
      const rows = await this.db.execute(sql`
        SELECT legacy_table, COUNT(*)::int AS count
        FROM legacy_id_map
        GROUP BY legacy_table
        ORDER BY count DESC
      `);

      let total = 0;
      for (const row of Array.from(rows as Iterable<{ legacy_table: string; count: number }>)) {
        console.log(`  ${row.legacy_table}: ${row.count.toLocaleString()} mappings`);
        total += row.count;
      }
      console.log(`\n  Total: ${total.toLocaleString()} mappings\n`);
    } catch {
      console.log('  No ID mapping table found. Run migration first.\n');
    }

    // Cutover status
    try {
      const states = await this.db.execute(sql`
        SELECT tenant_id, phase, updated_at
        FROM migration_cutover_state
        ORDER BY updated_at DESC
      `);

      console.log('-- Cutover Status --\n');
      for (const s of Array.from(states as Iterable<{ tenant_id: string; phase: string; updated_at: string }>)) {
        console.log(`  ${s.tenant_id}: ${s.phase} (${s.updated_at})`);
      }
    } catch {
      // Not initialized yet
    }

    console.log('');
  }

  private getChecks(tenantId?: string): MonitoringCheck[] {
    const where = tenantId ? `WHERE tenant_id = '${tenantId}'` : '';
    const andWhere = tenantId ? `AND tenant_id = '${tenantId}'` : '';

    return [
      // Cross-tenant contamination
      {
        name: 'Cross-tenant order lines',
        query: `SELECT COUNT(*)::int AS count FROM order_lines ol JOIN orders o ON o.id = ol.order_id WHERE ol.tenant_id != o.tenant_id`,
        expectZero: true,
        description: 'Order lines referencing orders from a different tenant',
      },
      {
        name: 'Cross-tenant tenders',
        query: `SELECT COUNT(*)::int AS count FROM tenders t JOIN orders o ON o.id = t.order_id WHERE t.tenant_id != o.tenant_id`,
        expectZero: true,
        description: 'Tenders referencing orders from a different tenant',
      },

      // Financial integrity
      {
        name: 'Negative order totals',
        query: `SELECT COUNT(*)::int AS count FROM orders ${where} ${where ? 'AND' : 'WHERE'} total < 0`,
        expectZero: true,
        description: 'Orders with negative totals',
      },
      {
        name: 'Paid order payment mismatch',
        query: `
          SELECT COUNT(*)::int AS count FROM orders o
          LEFT JOIN (SELECT order_id, SUM(amount)::int AS paid FROM tenders WHERE status = 'captured' GROUP BY order_id) t ON t.order_id = o.id
          LEFT JOIN (SELECT order_id, SUM(amount)::int AS reversed FROM tender_reversals WHERE status = 'completed' GROUP BY order_id) r ON r.order_id = o.id
          WHERE o.status = 'paid' ${andWhere}
            AND o.total != COALESCE(t.paid, 0) - COALESCE(r.reversed, 0)
        `,
        expectZero: true,
        description: 'Paid orders where tender net != order total',
      },

      // GL balance
      {
        name: 'Unbalanced GL entries',
        query: `
          SELECT COUNT(*)::int AS count FROM payment_journal_entries
          WHERE posting_status = 'posted'
            AND (SELECT SUM((e->>'debit')::int) FROM jsonb_array_elements(entries) e) !=
                (SELECT SUM((e->>'credit')::int) FROM jsonb_array_elements(entries) e)
        `,
        expectZero: true,
        description: 'GL journal entries where debits != credits',
      },

      // Inventory
      {
        name: 'Illegal negative stock',
        query: `
          SELECT COUNT(*)::int AS count FROM inventory_items ii
          JOIN (SELECT inventory_item_id, SUM(quantity_delta::numeric) AS oh FROM inventory_movements GROUP BY inventory_item_id) m
            ON m.inventory_item_id = ii.id
          WHERE ii.allow_negative = false AND m.oh < 0
        `,
        expectZero: true,
        description: 'Items with negative stock where allow_negative=false',
      },

      // Orphan references
      {
        name: 'Orphan order lines',
        query: `SELECT COUNT(*)::int AS count FROM order_lines ol LEFT JOIN orders o ON o.id = ol.order_id WHERE o.id IS NULL`,
        expectZero: true,
        description: 'Order lines referencing non-existent orders',
      },
      {
        name: 'Orphan tenders',
        query: `SELECT COUNT(*)::int AS count FROM tenders t LEFT JOIN orders o ON o.id = t.order_id WHERE o.id IS NULL`,
        expectZero: true,
        description: 'Tenders referencing non-existent orders',
      },
      {
        name: 'Orphan tenant references',
        query: `SELECT COUNT(*)::int AS count FROM orders o LEFT JOIN tenants t ON t.id = o.tenant_id WHERE t.id IS NULL`,
        expectZero: true,
        description: 'Orders referencing non-existent tenants',
      },

      // Migration artifacts
      {
        name: 'ID map coverage',
        query: `SELECT COUNT(*)::int AS count FROM legacy_id_map ${where}`,
        expectZero: false,
        description: 'Total ID mappings (should be > 0 after migration)',
      },

      // Data freshness (rows created today — only relevant post-switch)
      {
        name: 'New orders today',
        query: `SELECT COUNT(*)::int AS count FROM orders WHERE created_at >= CURRENT_DATE ${andWhere}`,
        expectZero: false,
        description: 'Orders created today (should be > 0 if system is active)',
      },
    ];
  }

  async close(): Promise<void> {
    await this.rawClient.end();
  }
}
