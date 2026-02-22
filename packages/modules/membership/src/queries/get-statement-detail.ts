import { eq, and, asc } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { statements, statementLines } from '@oppsera/db';

export interface GetStatementDetailInput {
  tenantId: string;
  statementId: string;
}

export interface StatementLineEntry {
  id: string;
  lineType: string;
  description: string;
  amountCents: number;
  sourceTransactionId: string | null;
  departmentId: string | null;
  metaJson: unknown | null;
  sortOrder: number;
}

export interface StatementDetail {
  id: string;
  membershipAccountId: string | null;
  periodStart: string;
  periodEnd: string;
  openingBalanceCents: number;
  chargesCents: number;
  paymentsCents: number;
  lateFeesCents: number;
  closingBalanceCents: number;
  dueDate: string;
  status: string;
  statementNumber: string | null;
  deliveryStatus: string;
  pdfStorageKey: string | null;
  metaJson: unknown | null;
  lines: StatementLineEntry[];
}

export async function getStatementDetail(
  input: GetStatementDetailInput,
): Promise<StatementDetail | null> {
  return withTenant(input.tenantId, async (tx) => {
    // Fetch the statement
    const stmtRows = await (tx as any)
      .select({
        id: statements.id,
        membershipAccountId: statements.membershipAccountId,
        periodStart: statements.periodStart,
        periodEnd: statements.periodEnd,
        openingBalanceCents: statements.openingBalanceCents,
        chargesCents: statements.chargesCents,
        paymentsCents: statements.paymentsCents,
        lateFeesCents: statements.lateFeesCents,
        closingBalanceCents: statements.closingBalanceCents,
        dueDate: statements.dueDate,
        status: statements.status,
        statementNumber: statements.statementNumber,
        deliveryStatus: statements.deliveryStatus,
        pdfStorageKey: statements.pdfStorageKey,
        metaJson: statements.metaJson,
      })
      .from(statements)
      .where(
        and(
          eq(statements.tenantId, input.tenantId),
          eq(statements.id, input.statementId),
        ),
      )
      .limit(1);

    const stmt = stmtRows[0];
    if (!stmt) return null;

    // Fetch statement lines
    const lineRows = await (tx as any)
      .select({
        id: statementLines.id,
        lineType: statementLines.lineType,
        description: statementLines.description,
        amountCents: statementLines.amountCents,
        sourceTransactionId: statementLines.sourceTransactionId,
        departmentId: statementLines.departmentId,
        metaJson: statementLines.metaJson,
        sortOrder: statementLines.sortOrder,
      })
      .from(statementLines)
      .where(
        and(
          eq(statementLines.tenantId, input.tenantId),
          eq(statementLines.statementId, input.statementId),
        ),
      )
      .orderBy(asc(statementLines.sortOrder), asc(statementLines.id));

    const lines: StatementLineEntry[] = lineRows.map((row: any) => ({
      id: String(row.id),
      lineType: String(row.lineType),
      description: String(row.description),
      amountCents: Number(row.amountCents ?? 0),
      sourceTransactionId: row.sourceTransactionId ? String(row.sourceTransactionId) : null,
      departmentId: row.departmentId ? String(row.departmentId) : null,
      metaJson: row.metaJson ?? null,
      sortOrder: Number(row.sortOrder ?? 0),
    }));

    return {
      id: String(stmt.id),
      membershipAccountId: stmt.membershipAccountId ? String(stmt.membershipAccountId) : null,
      periodStart: stmt.periodStart instanceof Date
        ? stmt.periodStart.toISOString()
        : String(stmt.periodStart ?? ''),
      periodEnd: stmt.periodEnd instanceof Date
        ? stmt.periodEnd.toISOString()
        : String(stmt.periodEnd ?? ''),
      openingBalanceCents: Number(stmt.openingBalanceCents ?? 0),
      chargesCents: Number(stmt.chargesCents ?? 0),
      paymentsCents: Number(stmt.paymentsCents ?? 0),
      lateFeesCents: Number(stmt.lateFeesCents ?? 0),
      closingBalanceCents: Number(stmt.closingBalanceCents ?? 0),
      dueDate: stmt.dueDate instanceof Date
        ? stmt.dueDate.toISOString()
        : String(stmt.dueDate ?? ''),
      status: String(stmt.status),
      statementNumber: stmt.statementNumber ? String(stmt.statementNumber) : null,
      deliveryStatus: String(stmt.deliveryStatus ?? 'pending'),
      pdfStorageKey: stmt.pdfStorageKey ? String(stmt.pdfStorageKey) : null,
      metaJson: stmt.metaJson ?? null,
      lines,
    };
  });
}
