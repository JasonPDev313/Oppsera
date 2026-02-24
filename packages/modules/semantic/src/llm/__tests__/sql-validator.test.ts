import { describe, it, expect } from 'vitest';
import { validateGeneratedSql, _extractTableReferences } from '../sql-validator';

const allowedTables = new Set(['orders', 'tenders', 'customers', 'users', 'rm_daily_sales', 'catalog_items', 'order_lines']);

describe('validateGeneratedSql', () => {
  it('accepts a valid SELECT with tenant_id and LIMIT', () => {
    const sql = "SELECT count(*) as total FROM orders WHERE tenant_id = $1 LIMIT 100";
    const result = validateGeneratedSql(sql, allowedTables);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects DDL keywords', () => {
    const sql = "DROP TABLE orders; SELECT 1 FROM orders WHERE tenant_id = $1 LIMIT 1";
    const result = validateGeneratedSql(sql, allowedTables);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('DDL'))).toBe(true);
  });

  it('rejects DML keywords', () => {
    const sql = "INSERT INTO orders VALUES (1); SELECT 1 FROM orders WHERE tenant_id = $1 LIMIT 1";
    const result = validateGeneratedSql(sql, allowedTables);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('DML'))).toBe(true);
  });

  it('rejects dangerous functions', () => {
    const sql = "SELECT pg_sleep(10) FROM orders WHERE tenant_id = $1 LIMIT 1";
    const result = validateGeneratedSql(sql, allowedTables);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('dangerous'))).toBe(true);
  });

  it('rejects queries without tenant_id = $1', () => {
    const sql = "SELECT count(*) FROM orders LIMIT 100";
    const result = validateGeneratedSql(sql, allowedTables);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('tenant_id'))).toBe(true);
  });

  it('exempts aggregate queries from LIMIT requirement', () => {
    const sql = "SELECT count(*) as total FROM orders WHERE tenant_id = $1";
    const result = validateGeneratedSql(sql, allowedTables);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('exempts CTE + UNION ALL aggregate patterns from LIMIT requirement', () => {
    const sql = `WITH last_week AS (
      SELECT count(*) as order_count, SUM(subtotal_cents) / 100.0 as revenue
      FROM orders WHERE tenant_id = $1 AND status IN ('placed','paid')
      AND business_date >= '2026-02-16' AND business_date <= '2026-02-22'
    ), prev_week AS (
      SELECT count(*) as order_count, SUM(subtotal_cents) / 100.0 as revenue
      FROM orders WHERE tenant_id = $1 AND status IN ('placed','paid')
      AND business_date >= '2026-02-09' AND business_date <= '2026-02-15'
    )
    SELECT 'Last Week' as period, order_count, revenue FROM last_week
    UNION ALL
    SELECT 'Previous Week' as period, order_count, revenue FROM prev_week`;
    const result = validateGeneratedSql(sql, allowedTables);
    // The LIMIT exemption should work for CTE+UNION ALL+aggregate patterns
    const limitErrors = result.errors.filter(e => e.includes('LIMIT'));
    expect(limitErrors).toHaveLength(0);
  });

  it('still requires LIMIT for non-aggregate non-CTE queries', () => {
    const sql = "SELECT id, status FROM orders WHERE tenant_id = $1";
    const result = validateGeneratedSql(sql, allowedTables);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('LIMIT'))).toBe(true);
  });

  it('rejects LIMIT exceeding MAX_ROW_LIMIT', () => {
    const sql = "SELECT id FROM orders WHERE tenant_id = $1 LIMIT 1000";
    const result = validateGeneratedSql(sql, allowedTables);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('exceeds maximum'))).toBe(true);
  });

  it('strips trailing semicolons', () => {
    const sql = "SELECT count(*) FROM orders WHERE tenant_id = $1;";
    const result = validateGeneratedSql(sql, allowedTables);
    expect(result.valid).toBe(true);
    expect(result.sanitizedSql).not.toContain(';');
  });

  it('rejects tables not in allowed set', () => {
    const sql = "SELECT * FROM secret_table WHERE tenant_id = $1 LIMIT 10";
    const result = validateGeneratedSql(sql, allowedTables);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('secret_table'))).toBe(true);
  });

  it('rejects SQL comments', () => {
    const sql = "SELECT count(*) FROM orders WHERE tenant_id = $1 -- this is a comment";
    const result = validateGeneratedSql(sql, allowedTables);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('comments'))).toBe(true);
  });
});

describe('extractTableReferences', () => {
  it('extracts tables from FROM clause', () => {
    const tables = _extractTableReferences("SELECT * FROM orders WHERE 1=1");
    expect(tables).toContain('orders');
  });

  it('extracts tables from JOIN clauses', () => {
    const tables = _extractTableReferences(
      "SELECT a.id FROM orders a JOIN tenders t ON a.id = t.order_id"
    );
    expect(tables).toContain('orders');
    expect(tables).toContain('tenders');
  });

  it('handles CTEs correctly', () => {
    const tables = _extractTableReferences(
      "WITH cte AS (SELECT id FROM orders) SELECT * FROM cte JOIN customers c ON 1=1"
    );
    expect(tables).toContain('orders');
    expect(tables).toContain('cte');
    expect(tables).toContain('customers');
  });

  it('does not extract FROM inside EXTRACT/POSITION/SUBSTRING functions', () => {
    const tables = _extractTableReferences(
      "SELECT EXTRACT(month FROM created_at) FROM orders"
    );
    // Should find 'orders' but NOT treat 'created_at' as a table
    expect(tables).toContain('orders');
    expect(tables).not.toContain('created_at');
  });
});
