import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';

export interface AuditCoverageItem {
  category: string;
  label: string;
  transactionCount: number;
  auditEntryCount: number;
  gapCount: number;
  coveragePercent: number;
}

export interface AuditCoverageReport {
  items: AuditCoverageItem[];
  totalTransactions: number;
  totalAuditEntries: number;
  totalGaps: number;
  overallCoveragePercent: number;
}

export async function getAuditCoverage(
  tenantId: string,
  dateRange: { from: string; to: string },
): Promise<AuditCoverageReport> {
  return withTenant(tenantId, async (tx) => {
    // Count GL journal entries posted in date range
    const [glResult] = await tx.execute(sql`
      SELECT COUNT(*)::int AS count
      FROM gl_journal_entries
      WHERE tenant_id = ${tenantId}
        AND status = 'posted'
        AND created_at >= ${dateRange.from}::timestamptz
        AND created_at < (${dateRange.to}::date + interval '1 day')::timestamptz
    `) as any[];
    const glCount = glResult?.count ?? 0;

    // Count audit entries for accounting actions
    const [glAuditResult] = await tx.execute(sql`
      SELECT COUNT(*)::int AS count
      FROM audit_log
      WHERE tenant_id = ${tenantId}
        AND action LIKE 'accounting.%'
        AND created_at >= ${dateRange.from}::timestamptz
        AND created_at < (${dateRange.to}::date + interval '1 day')::timestamptz
    `) as any[];
    const glAuditCount = glAuditResult?.count ?? 0;

    // Count tenders in date range
    const [tenderResult] = await tx.execute(sql`
      SELECT COUNT(*)::int AS count
      FROM tenders
      WHERE tenant_id = ${tenantId}
        AND created_at >= ${dateRange.from}::timestamptz
        AND created_at < (${dateRange.to}::date + interval '1 day')::timestamptz
    `) as any[];
    const tenderCount = tenderResult?.count ?? 0;

    // Count audit entries for payment actions
    const [tenderAuditResult] = await tx.execute(sql`
      SELECT COUNT(*)::int AS count
      FROM audit_log
      WHERE tenant_id = ${tenantId}
        AND action LIKE 'payment.%'
        AND created_at >= ${dateRange.from}::timestamptz
        AND created_at < (${dateRange.to}::date + interval '1 day')::timestamptz
    `) as any[];
    const tenderAuditCount = tenderAuditResult?.count ?? 0;

    // Count AP bills posted
    const [apResult] = await tx.execute(sql`
      SELECT COUNT(*)::int AS count
      FROM ap_bills
      WHERE tenant_id = ${tenantId}
        AND status IN ('posted', 'partial', 'paid')
        AND posted_at >= ${dateRange.from}::timestamptz
        AND posted_at < (${dateRange.to}::date + interval '1 day')::timestamptz
    `) as any[];
    const apCount = apResult?.count ?? 0;

    // Count audit entries for AP actions
    const [apAuditResult] = await tx.execute(sql`
      SELECT COUNT(*)::int AS count
      FROM audit_log
      WHERE tenant_id = ${tenantId}
        AND action LIKE 'ap.%'
        AND created_at >= ${dateRange.from}::timestamptz
        AND created_at < (${dateRange.to}::date + interval '1 day')::timestamptz
    `) as any[];
    const apAuditCount = apAuditResult?.count ?? 0;

    // Count AR invoices posted
    const [arResult] = await tx.execute(sql`
      SELECT COUNT(*)::int AS count
      FROM ar_invoices
      WHERE tenant_id = ${tenantId}
        AND status IN ('posted', 'partial', 'paid')
        AND posted_at >= ${dateRange.from}::timestamptz
        AND posted_at < (${dateRange.to}::date + interval '1 day')::timestamptz
    `) as any[];
    const arCount = arResult?.count ?? 0;

    // Count audit entries for AR actions
    const [arAuditResult] = await tx.execute(sql`
      SELECT COUNT(*)::int AS count
      FROM audit_log
      WHERE tenant_id = ${tenantId}
        AND action LIKE 'ar.%'
        AND created_at >= ${dateRange.from}::timestamptz
        AND created_at < (${dateRange.to}::date + interval '1 day')::timestamptz
    `) as any[];
    const arAuditCount = arAuditResult?.count ?? 0;

    // Count orders (placed + voided)
    const [orderResult] = await tx.execute(sql`
      SELECT COUNT(*)::int AS count
      FROM orders
      WHERE tenant_id = ${tenantId}
        AND status IN ('placed', 'paid', 'voided')
        AND created_at >= ${dateRange.from}::timestamptz
        AND created_at < (${dateRange.to}::date + interval '1 day')::timestamptz
    `) as any[];
    const orderCount = orderResult?.count ?? 0;

    // Count audit entries for order actions
    const [orderAuditResult] = await tx.execute(sql`
      SELECT COUNT(*)::int AS count
      FROM audit_log
      WHERE tenant_id = ${tenantId}
        AND action LIKE 'order.%'
        AND created_at >= ${dateRange.from}::timestamptz
        AND created_at < (${dateRange.to}::date + interval '1 day')::timestamptz
    `) as any[];
    const orderAuditCount = orderAuditResult?.count ?? 0;

    function buildItem(
      category: string,
      label: string,
      txnCount: number,
      auditCount: number,
    ): AuditCoverageItem {
      const gapCount = Math.max(0, txnCount - auditCount);
      const coveragePercent = txnCount > 0 ? Math.round((Math.min(auditCount, txnCount) / txnCount) * 100) : 100;
      return { category, label, transactionCount: txnCount, auditEntryCount: auditCount, gapCount, coveragePercent };
    }

    const items: AuditCoverageItem[] = [
      buildItem('gl', 'GL Journal Entries', glCount, glAuditCount),
      buildItem('payments', 'Tenders / Payments', tenderCount, tenderAuditCount),
      buildItem('ap', 'AP Bills & Payments', apCount, apAuditCount),
      buildItem('ar', 'AR Invoices & Receipts', arCount, arAuditCount),
      buildItem('orders', 'Orders & Voids', orderCount, orderAuditCount),
    ];

    const totalTransactions = items.reduce((s, i) => s + i.transactionCount, 0);
    const totalAuditEntries = items.reduce((s, i) => s + i.auditEntryCount, 0);
    const totalGaps = items.reduce((s, i) => s + i.gapCount, 0);
    const overallCoveragePercent = totalTransactions > 0
      ? Math.round((Math.min(totalAuditEntries, totalTransactions) / totalTransactions) * 100)
      : 100;

    return { items, totalTransactions, totalAuditEntries, totalGaps, overallCoveragePercent };
  });
}
