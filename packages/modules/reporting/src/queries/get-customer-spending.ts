import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';

export interface GetCustomerSpendingInput {
  tenantId: string;
  dateFrom: string;
  dateTo: string;
  locationId?: string;
  search?: string;
  sortBy?: 'totalSpend' | 'customerName';
  sortDir?: 'asc' | 'desc';
  limit?: number;
}

export interface DepartmentSpend {
  departmentId: string;
  departmentName: string;
  totalSpend: number;
}

export interface CustomerSpendingRow {
  customerId: string;
  customerName: string;
  customerEmail: string | null;
  customerPhone: string | null;
  departments: DepartmentSpend[];
  totalSpend: number;
}

export interface CustomerSpendingSummary {
  totalCustomers: number;
  totalSpend: number;
  avgSpendPerCustomer: number;
  topDepartment: { name: string; total: number } | null;
}

export interface GetCustomerSpendingResult {
  summary: CustomerSpendingSummary;
  customers: CustomerSpendingRow[];
}

/**
 * Retrieves customer spending broken down by department for a date range.
 *
 * Performance strategy:
 *   1. Filter orders via covering index (tenant_id, business_date, status, customer_id)
 *   2. Aggregate customer totals WITHOUT the catalog hierarchy JOINs (fast)
 *   3. Apply search, sort, LIMIT at the SQL level → only top N customers
 *   4. Compute summary KPIs from the full (pre-LIMIT) customer set in a CTE
 *   5. JOIN catalog hierarchy ONLY for the limited customer set's line items
 *
 * This avoids the original problem of JOINing 5 tables for every customer
 * then slicing in JS.
 */
export async function getCustomerSpending(
  input: GetCustomerSpendingInput,
): Promise<GetCustomerSpendingResult> {
  const limit = Math.min(input.limit ?? 50, 500);

  return withTenant(input.tenantId, async (tx) => {
    const locFilter = input.locationId
      ? sql` AND o.location_id = ${input.locationId}`
      : sql``;

    const searchFilter = input.search
      ? sql` AND c.display_name ILIKE ${'%' + input.search + '%'}`
      : sql``;

    const orderByCol =
      input.sortBy === 'customerName' ? sql`c.display_name` : sql`ct.total_spend_cents`;
    const orderByDir = input.sortDir === 'asc' ? sql`ASC` : sql`DESC`;

    // ─── Single optimized query with CTEs ───────────────────────
    const rows = await tx.execute(sql`
      WITH
      -- 1. Pre-filter orders using covering index (fast scan)
      filtered_orders AS (
        SELECT o.id, o.customer_id, o.location_id
        FROM orders o
        WHERE o.tenant_id = ${input.tenantId}
          AND o.customer_id IS NOT NULL
          AND o.status IN ('placed', 'paid')
          AND o.business_date >= ${input.dateFrom}
          AND o.business_date <= ${input.dateTo}
          ${locFilter}
      ),

      -- 2. Customer totals (NO catalog JOINs — just sum line_total)
      customer_totals AS (
        SELECT
          fo.customer_id,
          sum(ol.line_total)::bigint AS total_spend_cents
        FROM order_lines ol
        JOIN filtered_orders fo ON fo.id = ol.order_id AND ol.tenant_id = ${input.tenantId}
        GROUP BY fo.customer_id
      ),

      -- 3. Apply search + sort + LIMIT at the customer level
      page_customers AS (
        SELECT ct.customer_id, ct.total_spend_cents
        FROM customer_totals ct
        JOIN customers c ON c.id = ct.customer_id AND c.tenant_id = ${input.tenantId}
        WHERE 1=1 ${searchFilter}
        ORDER BY ${orderByCol} ${orderByDir}
        LIMIT ${limit}
      ),

      -- 4. Summary KPIs from ALL matching customers (pre-LIMIT)
      summary_stats AS (
        SELECT
          count(*)::int AS total_customers,
          coalesce(sum(ct.total_spend_cents), 0)::bigint AS total_spend_cents
        FROM customer_totals ct
        JOIN customers c ON c.id = ct.customer_id AND c.tenant_id = ${input.tenantId}
        WHERE 1=1 ${searchFilter}
      ),

      -- 5. Department breakdown ONLY for the page's customers
      dept_spend AS (
        SELECT
          fo.customer_id,
          COALESCE(dept.id, subdept.id, cat.id, 'uncategorized') AS department_id,
          COALESCE(dept.name, subdept.name, cat.name, 'Uncategorized') AS department_name,
          sum(ol.line_total)::bigint AS spend_cents
        FROM order_lines ol
        JOIN filtered_orders fo ON fo.id = ol.order_id AND ol.tenant_id = ${input.tenantId}
        JOIN page_customers pc ON pc.customer_id = fo.customer_id
        LEFT JOIN catalog_items ci ON ci.id = ol.catalog_item_id AND ci.tenant_id = ol.tenant_id
        LEFT JOIN catalog_categories cat ON cat.id = ci.category_id AND cat.tenant_id = ol.tenant_id
        LEFT JOIN catalog_categories subdept ON subdept.id = cat.parent_id AND subdept.tenant_id = ol.tenant_id
        LEFT JOIN catalog_categories dept ON dept.id = subdept.parent_id AND dept.tenant_id = ol.tenant_id
        GROUP BY fo.customer_id,
          COALESCE(dept.id, subdept.id, cat.id, 'uncategorized'),
          COALESCE(dept.name, subdept.name, cat.name, 'Uncategorized')
      )

      -- Return detail rows + one summary row via UNION ALL
      SELECT
        'detail'::text AS row_type,
        c.id AS customer_id,
        c.display_name AS customer_name,
        c.email AS customer_email,
        c.phone AS customer_phone,
        ds.department_id,
        ds.department_name,
        ds.spend_cents,
        pc.total_spend_cents,
        NULL::int AS summary_total_customers,
        NULL::bigint AS summary_total_spend_cents
      FROM page_customers pc
      JOIN customers c ON c.id = pc.customer_id AND c.tenant_id = ${input.tenantId}
      JOIN dept_spend ds ON ds.customer_id = pc.customer_id
      ORDER BY pc.total_spend_cents DESC, ds.spend_cents DESC

      UNION ALL

      SELECT
        'summary'::text AS row_type,
        NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
        s.total_customers,
        s.total_spend_cents
      FROM summary_stats s
    `);

    const flatRows = Array.from(rows as Iterable<Record<string, unknown>>);

    // ── Parse results ─────────────────────────────────────────────
    const customerMap = new Map<string, CustomerSpendingRow>();
    const deptTotals = new Map<string, { name: string; total: number }>();
    let summaryTotalCustomers = 0;
    let summaryTotalSpendCents = 0;

    for (const r of flatRows) {
      if (r.row_type === 'summary') {
        summaryTotalCustomers = Number(r.summary_total_customers) || 0;
        summaryTotalSpendCents = Number(r.summary_total_spend_cents) || 0;
        continue;
      }

      const custId = String(r.customer_id);
      const deptId = String(r.department_id);
      const deptName = String(r.department_name);
      const spendCents = Number(r.spend_cents) || 0;
      const totalCents = Number(r.total_spend_cents) || 0;

      if (!customerMap.has(custId)) {
        customerMap.set(custId, {
          customerId: custId,
          customerName: String(r.customer_name),
          customerEmail: r.customer_email ? String(r.customer_email) : null,
          customerPhone: r.customer_phone ? String(r.customer_phone) : null,
          departments: [],
          totalSpend: totalCents / 100,
        });
      }

      customerMap.get(custId)!.departments.push({
        departmentId: deptId,
        departmentName: deptName,
        totalSpend: spendCents / 100,
      });

      // Track department totals for top department
      const existing = deptTotals.get(deptId);
      if (existing) {
        existing.total += spendCents / 100;
      } else {
        deptTotals.set(deptId, { name: deptName, total: spendCents / 100 });
      }
    }

    const customers = Array.from(customerMap.values());

    // Top department from the page's customers
    let topDepartment: { name: string; total: number } | null = null;
    for (const [, dept] of deptTotals) {
      if (!topDepartment || dept.total > topDepartment.total) {
        topDepartment = { name: dept.name, total: dept.total };
      }
    }

    const totalSpend = summaryTotalSpendCents / 100;

    return {
      summary: {
        totalCustomers: summaryTotalCustomers,
        totalSpend,
        avgSpendPerCustomer:
          summaryTotalCustomers > 0 ? totalSpend / summaryTotalCustomers : 0,
        topDepartment,
      },
      customers,
    };
  });
}
