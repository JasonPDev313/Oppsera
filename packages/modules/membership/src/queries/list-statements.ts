import { eq, and, lt, desc } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { statements } from '@oppsera/db';

export interface ListStatementsInput {
  tenantId: string;
  membershipAccountId: string;
  status?: string;
  cursor?: string;
  limit?: number;
}

export interface StatementEntry {
  id: string;
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
  createdAt: string;
}

export interface ListStatementsResult {
  items: StatementEntry[];
  cursor: string | null;
  hasMore: boolean;
}

export async function listStatements(
  input: ListStatementsInput,
): Promise<ListStatementsResult> {
  const limit = Math.min(input.limit ?? 20, 100);

  return withTenant(input.tenantId, async (tx) => {
    const conditions = [
      eq(statements.tenantId, input.tenantId),
      eq(statements.membershipAccountId, input.membershipAccountId),
    ];

    if (input.status) {
      conditions.push(eq(statements.status, input.status));
    }

    if (input.cursor) {
      conditions.push(lt(statements.id, input.cursor));
    }

    const rows = await (tx as any)
      .select({
        id: statements.id,
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
        createdAt: statements.createdAt,
      })
      .from(statements)
      .where(and(...conditions))
      .orderBy(desc(statements.periodEnd), desc(statements.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;

    const mapped: StatementEntry[] = items.map((row: any) => ({
      id: String(row.id),
      periodStart: row.periodStart instanceof Date
        ? row.periodStart.toISOString()
        : String(row.periodStart ?? ''),
      periodEnd: row.periodEnd instanceof Date
        ? row.periodEnd.toISOString()
        : String(row.periodEnd ?? ''),
      openingBalanceCents: Number(row.openingBalanceCents ?? 0),
      chargesCents: Number(row.chargesCents ?? 0),
      paymentsCents: Number(row.paymentsCents ?? 0),
      lateFeesCents: Number(row.lateFeesCents ?? 0),
      closingBalanceCents: Number(row.closingBalanceCents ?? 0),
      dueDate: row.dueDate instanceof Date
        ? row.dueDate.toISOString()
        : String(row.dueDate ?? ''),
      status: String(row.status),
      statementNumber: row.statementNumber ? String(row.statementNumber) : null,
      deliveryStatus: String(row.deliveryStatus ?? 'pending'),
      createdAt: row.createdAt instanceof Date
        ? row.createdAt.toISOString()
        : String(row.createdAt),
    }));

    return {
      items: mapped,
      cursor: hasMore ? mapped[mapped.length - 1]!.id : null,
      hasMore,
    };
  });
}
