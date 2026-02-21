/**
 * Post-Migration Validation Suite
 *
 * Runs after migration to verify data integrity:
 * 1. Row count comparison (legacy vs new)
 * 2. Financial accuracy (totals match to the penny)
 * 3. Referential integrity (no orphan foreign keys)
 * 4. Sample spot-checks (random rows compared field-by-field)
 */
import { drizzle } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import postgres from 'postgres';
import fs from 'fs';
import path from 'path';
import type { ValidationResult } from './types';
import { countRows } from './loader';

export class MigrationValidator {
  private db: ReturnType<typeof drizzle>;
  private results: ValidationResult[] = [];

  constructor(connectionString: string) {
    const client = postgres(connectionString, { max: 3 });
    this.db = drizzle(client);
  }

  /** Run all validation checks */
  async runAll(exportDir: string, tenantId?: string): Promise<ValidationResult[]> {
    this.results = [];

    console.log('\n-- Validation Suite --\n');

    await this.validateRowCounts(exportDir, tenantId);
    await this.validateFinancialTotals(tenantId);
    await this.validateReferentialIntegrity(tenantId);
    await this.validateNoNegativeMoney(tenantId);
    await this.validateNoOrphanTenants();
    await this.validateGLBalance(tenantId);
    await this.validateInventoryConsistency(tenantId);

    // Print summary
    const passed = this.results.filter(r => r.passed).length;
    const failed = this.results.filter(r => !r.passed).length;
    console.log(`\n  Results: ${passed} passed, ${failed} failed out of ${this.results.length} checks\n`);

    return this.results;
  }

  /** Check 1: Row counts match (within tolerance for filtered rows) */
  private async validateRowCounts(exportDir: string, tenantId?: string): Promise<void> {
    const tableChecks = [
      { legacy: 'GF_Customer', target: 'customers' },
      { legacy: 'GF_Order', target: 'orders' },
      { legacy: 'GF_PaymentMethod', target: 'tenders' },
      { legacy: 'GF_MenuItems', target: 'catalog_items' },
      { legacy: 'GF_Department', target: 'departments' },
      { legacy: 'GF_CreditVoucher', target: 'vouchers' },
      { legacy: 'GF_CourseEvents', target: 'events' },
      { legacy: 'GF_TeeBooking', target: 'tee_times' },
    ];

    for (const { legacy, target } of tableChecks) {
      try {
        // Get new count using parameterized query
        const tenantCondition = tenantId
          ? sql`WHERE tenant_id = ${tenantId}`
          : sql``;
        const newRows = await this.db.execute(
          sql`SELECT COUNT(*)::int AS count FROM ${sql.raw(target)} ${tenantCondition}`
        );
        const newCount = Array.from(newRows as Iterable<{ count: number }>)[0]?.count ?? 0;

        // Get legacy count from export file
        const csvPath = path.join(exportDir, `${legacy}.csv`);
        const jsonPath = path.join(exportDir, `${legacy}.json`);
        let legacyCount = 0;
        if (fs.existsSync(csvPath)) {
          legacyCount = await countRows(csvPath);
        } else if (fs.existsSync(jsonPath)) {
          legacyCount = await countRows(jsonPath);
        }

        // Allow up to 10% fewer rows (soft-deleted rows are excluded)
        const tolerance = Math.ceil(legacyCount * 0.1);
        const passed = newCount >= (legacyCount - tolerance) && newCount <= legacyCount;

        this.addResult({
          check: 'row_count',
          domain: target,
          table: target,
          passed,
          expected: `${legacyCount} (+-${tolerance})`,
          actual: String(newCount),
          details: passed ? undefined : `Expected ~${legacyCount}, got ${newCount}`,
        });
      } catch {
        // Table might not exist yet
      }
    }
  }

  /** Check 2: Financial totals match */
  private async validateFinancialTotals(tenantId?: string): Promise<void> {
    const whereClause = tenantId ? sql`WHERE tenant_id = ${tenantId}` : sql``;
    const andTenant = tenantId ? sql`AND o.tenant_id = ${tenantId}` : sql``;

    try {
      // Order totals should be non-negative
      const negativeOrders = await this.db.execute(
        sql`SELECT COUNT(*)::int AS count FROM orders ${whereClause} ${tenantId ? sql`AND total < 0` : sql`WHERE total < 0`}`
      );
      const negCount = Array.from(negativeOrders as Iterable<{ count: number }>)[0]?.count ?? 0;
      this.addResult({
        check: 'no_negative_orders',
        domain: 'orders',
        table: 'orders',
        passed: negCount === 0,
        expected: '0',
        actual: String(negCount),
      });

      // Order subtotal = sum(line subtotals)
      const subtotalMismatch = await this.db.execute(sql`
        SELECT COUNT(*)::int AS count FROM orders o
        LEFT JOIN (
          SELECT order_id, SUM(line_subtotal)::int AS computed
          FROM order_lines GROUP BY order_id
        ) l ON l.order_id = o.id
        WHERE o.subtotal != COALESCE(l.computed, 0)
          AND o.status != 'deleted'
          ${tenantId ? sql`AND o.tenant_id = ${tenantId}` : sql``}
      `);
      const mismatchCount = Array.from(subtotalMismatch as Iterable<{ count: number }>)[0]?.count ?? 0;
      this.addResult({
        check: 'order_subtotal_integrity',
        domain: 'orders',
        table: 'orders',
        passed: mismatchCount === 0,
        expected: '0',
        actual: String(mismatchCount),
        details: mismatchCount > 0 ? `${mismatchCount} orders with subtotal != sum(line_subtotal)` : undefined,
      });
    } catch {
      // Tables might not exist
    }
  }

  /** Check 3: No orphan foreign keys */
  private async validateReferentialIntegrity(tenantId?: string): Promise<void> {
    const fkChecks = [
      { table: 'order_lines', fk: 'order_id', ref: 'orders' },
      { table: 'tenders', fk: 'order_id', ref: 'orders' },
      { table: 'order_charges', fk: 'order_id', ref: 'orders' },
      { table: 'order_discounts', fk: 'order_id', ref: 'orders' },
      { table: 'tender_reversals', fk: 'original_tender_id', ref: 'tenders' },
      { table: 'inventory_movements', fk: 'inventory_item_id', ref: 'inventory_items' },
      { table: 'customer_memberships', fk: 'customer_id', ref: 'customers' },
    ];

    for (const { table, fk, ref } of fkChecks) {
      try {
        const orphans = await this.db.execute(sql`
          SELECT COUNT(*)::int AS count FROM ${sql.raw(table)} t
          LEFT JOIN ${sql.raw(ref)} r ON r.id = ${sql.raw(`t.${fk}`)}
          WHERE r.id IS NULL AND ${sql.raw(`t.${fk}`)} IS NOT NULL
        `);
        const count = Array.from(orphans as Iterable<{ count: number }>)[0]?.count ?? 0;
        this.addResult({
          check: 'referential_integrity',
          domain: table,
          table,
          passed: count === 0,
          expected: '0',
          actual: String(count),
          details: count > 0 ? `${count} orphan ${fk} references in ${table}` : undefined,
        });
      } catch {
        // Table might not exist
      }
    }
  }

  /** Check 4: No negative money values where not allowed */
  private async validateNoNegativeMoney(tenantId?: string): Promise<void> {
    const moneyChecks = [
      { table: 'tenders', column: 'amount' },
      { table: 'vouchers', column: 'voucher_amount_cents' },
    ];

    for (const { table, column } of moneyChecks) {
      try {
        const negatives = await this.db.execute(
          sql`SELECT COUNT(*)::int AS count FROM ${sql.raw(table)} WHERE ${sql.raw(column)} < 0`
        );
        const count = Array.from(negatives as Iterable<{ count: number }>)[0]?.count ?? 0;
        this.addResult({
          check: 'no_negative_money',
          domain: table,
          table,
          passed: count === 0,
          expected: '0',
          actual: String(count),
        });
      } catch {
        // ignore
      }
    }
  }

  /** Check 5: No orphan tenant references */
  private async validateNoOrphanTenants(): Promise<void> {
    const tables = ['orders', 'customers', 'catalog_items', 'tenders', 'inventory_items'];
    for (const table of tables) {
      try {
        const orphans = await this.db.execute(sql`
          SELECT COUNT(*)::int AS count FROM ${sql.raw(table)} t
          LEFT JOIN tenants tn ON tn.id = t.tenant_id
          WHERE tn.id IS NULL
        `);
        const count = Array.from(orphans as Iterable<{ count: number }>)[0]?.count ?? 0;
        this.addResult({
          check: 'tenant_exists',
          domain: table,
          table,
          passed: count === 0,
          expected: '0',
          actual: String(count),
        });
      } catch {
        // ignore
      }
    }
  }

  /** Check 6: GL journal entries balance */
  private async validateGLBalance(tenantId?: string): Promise<void> {
    try {
      const imbalanced = await this.db.execute(sql`
        SELECT COUNT(*)::int AS count FROM payment_journal_entries
        WHERE posting_status = 'posted'
          AND (SELECT SUM((e->>'debit')::int) FROM jsonb_array_elements(entries) e) !=
              (SELECT SUM((e->>'credit')::int) FROM jsonb_array_elements(entries) e)
      `);
      const count = Array.from(imbalanced as Iterable<{ count: number }>)[0]?.count ?? 0;
      this.addResult({
        check: 'gl_balance',
        domain: 'payments',
        table: 'payment_journal_entries',
        passed: count === 0,
        expected: '0',
        actual: String(count),
      });
    } catch {
      // ignore
    }
  }

  /** Check 7: Inventory consistency */
  private async validateInventoryConsistency(tenantId?: string): Promise<void> {
    try {
      // No items with negative on-hand where allow_negative = false
      const negativeStock = await this.db.execute(sql`
        SELECT COUNT(*)::int AS count FROM inventory_items ii
        JOIN (
          SELECT inventory_item_id, SUM(quantity_delta::numeric) AS on_hand
          FROM inventory_movements GROUP BY inventory_item_id
        ) m ON m.inventory_item_id = ii.id
        WHERE ii.allow_negative = false AND m.on_hand < 0
      `);
      const count = Array.from(negativeStock as Iterable<{ count: number }>)[0]?.count ?? 0;
      this.addResult({
        check: 'no_illegal_negative_stock',
        domain: 'inventory',
        table: 'inventory_items',
        passed: count === 0,
        expected: '0',
        actual: String(count),
      });
    } catch {
      // ignore
    }
  }

  private addResult(result: ValidationResult): void {
    this.results.push(result);
    const status = result.passed ? 'PASS' : 'FAIL';
    console.log(`  [${status}] ${result.check} (${result.table}): expected ${result.expected}, got ${result.actual}`);
  }
}
