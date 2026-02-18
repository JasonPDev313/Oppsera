import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError } from '@oppsera/shared';
import { billingAccounts, arTransactions, statements } from '@oppsera/db';
import { eq, and, sql } from 'drizzle-orm';
import type { GenerateStatementInput } from '../validation';

export async function generateStatement(ctx: RequestContext, input: GenerateStatementInput) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const [account] = await (tx as any).select().from(billingAccounts)
      .where(and(eq(billingAccounts.id, input.billingAccountId), eq(billingAccounts.tenantId, ctx.tenantId)))
      .limit(1);
    if (!account) throw new NotFoundError('Billing account', input.billingAccountId);

    // Get previous statement closing balance (or 0)
    const prevStatements = await (tx as any).select({
      closingBalanceCents: statements.closingBalanceCents,
    }).from(statements)
      .where(and(
        eq(statements.tenantId, ctx.tenantId),
        eq(statements.billingAccountId, input.billingAccountId),
      ))
      .orderBy(sql`${statements.periodEnd} DESC`)
      .limit(1);
    const openingBalance = prevStatements.length > 0 ? Number(prevStatements[0].closingBalanceCents) : 0;

    // Sum charges, payments, and late fees in a single query using conditional aggregates
    const [periodTotals] = await (tx as any).select({
      charges: sql`COALESCE(SUM(CASE WHEN ${arTransactions.type} = 'charge' THEN ${arTransactions.amountCents} ELSE 0 END), 0)`,
      payments: sql`COALESCE(SUM(CASE WHEN ${arTransactions.type} = 'payment' THEN ${arTransactions.amountCents} ELSE 0 END), 0)`,
      lateFees: sql`COALESCE(SUM(CASE WHEN ${arTransactions.type} = 'late_fee' THEN ${arTransactions.amountCents} ELSE 0 END), 0)`,
    }).from(arTransactions)
      .where(and(
        eq(arTransactions.tenantId, ctx.tenantId),
        eq(arTransactions.billingAccountId, input.billingAccountId),
        sql`${arTransactions.createdAt} >= ${input.periodStart}::date`,
        sql`${arTransactions.createdAt} < (${input.periodEnd}::date + interval '1 day')`,
      ));
    const chargesCents = Number(periodTotals?.charges ?? 0);
    const paymentsCents = Math.abs(Number(periodTotals?.payments ?? 0));
    const lateFeesCents = Number(periodTotals?.lateFees ?? 0);

    const closingBalance = openingBalance + chargesCents - paymentsCents + lateFeesCents;

    // Compute due date
    const dueD = new Date(input.periodEnd);
    dueD.setDate(dueD.getDate() + account.dueDays);
    const dueDate = dueD.toISOString().split('T')[0]!;

    const [stmt] = await (tx as any).insert(statements).values({
      tenantId: ctx.tenantId,
      billingAccountId: input.billingAccountId,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      openingBalanceCents: openingBalance,
      chargesCents,
      paymentsCents,
      lateFeesCents,
      closingBalanceCents: closingBalance,
      dueDate,
    }).returning();

    const event = buildEventFromContext(ctx, 'statement.generated.v1', {
      statementId: stmt!.id,
      billingAccountId: input.billingAccountId,
      closingBalance,
      dueDate,
    });

    return { result: stmt!, events: [event] };
  });

  await auditLog(ctx, 'statement.generated', 'statement', result.id);
  return result;
}
