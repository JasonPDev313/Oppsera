import { eq, and, lte } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { membershipAccounts, statements, statementLines, membershipBillingItems } from '@oppsera/db';
import { generateUlid, NotFoundError } from '@oppsera/shared';
import type { GenerateStatementInput } from '../validation';

function generateStatementNumber(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const suffix = generateUlid().slice(-6).toUpperCase();
  return `STMT-${y}${m}${d}-${suffix}`;
}

export async function generateStatement(
  ctx: RequestContext,
  input: GenerateStatementInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Validate account exists for tenant
    const [account] = await (tx as any)
      .select({
        id: membershipAccounts.id,
        billingAccountId: membershipAccounts.billingAccountId,
      })
      .from(membershipAccounts)
      .where(
        and(
          eq(membershipAccounts.tenantId, ctx.tenantId),
          eq(membershipAccounts.id, input.membershipAccountId),
        ),
      )
      .limit(1);

    if (!account) {
      throw new NotFoundError('MembershipAccount', input.membershipAccountId);
    }

    // Get active billing items for this account to build statement lines
    const billingItems = await (tx as any)
      .select({
        id: membershipBillingItems.id,
        description: membershipBillingItems.description,
        amountCents: membershipBillingItems.amountCents,
        discountCents: membershipBillingItems.discountCents,
        frequency: membershipBillingItems.frequency,
        classId: membershipBillingItems.classId,
      })
      .from(membershipBillingItems)
      .where(
        and(
          eq(membershipBillingItems.tenantId, ctx.tenantId),
          eq(membershipBillingItems.membershipAccountId, input.membershipAccountId),
          eq(membershipBillingItems.isActive, true),
        ),
      );

    // Look up the most recent prior statement for opening balance
    const priorStatements = await (tx as any)
      .select({
        closingBalanceCents: statements.closingBalanceCents,
      })
      .from(statements)
      .where(
        and(
          eq(statements.tenantId, ctx.tenantId),
          eq(statements.membershipAccountId, input.membershipAccountId),
          lte(statements.periodEnd, input.periodStart),
        ),
      )
      .orderBy(statements.periodEnd)
      .limit(1);

    const openingBalanceCents = priorStatements.length > 0
      ? priorStatements[0].closingBalanceCents
      : 0;

    // Compute charges from billing items
    let chargesCents = 0;
    const lineEntries: Array<{
      lineType: string;
      description: string;
      amountCents: number;
      sourceTransactionId: string | null;
      departmentId: string | null;
      metaJson: Record<string, unknown> | null;
      sortOrder: number;
    }> = [];

    let sortOrder = 0;
    for (const item of billingItems) {
      const netAmount = item.amountCents - (item.discountCents ?? 0);
      chargesCents += netAmount;
      sortOrder += 1;
      lineEntries.push({
        lineType: 'dues',
        description: item.description,
        amountCents: netAmount,
        sourceTransactionId: null,
        departmentId: null,
        metaJson: {
          billingItemId: item.id,
          grossAmountCents: item.amountCents,
          discountCents: item.discountCents ?? 0,
          frequency: item.frequency,
        },
        sortOrder,
      });
    }

    // For now, payments and late fees are zero since this is a generation step;
    // they will be populated as payments come in
    const paymentsCents = 0;
    const lateFeesCents = 0;
    const closingBalanceCents = openingBalanceCents + chargesCents - paymentsCents + lateFeesCents;

    const statementId = generateUlid();
    const statementNumber = generateStatementNumber();
    const now = new Date();

    // Use billingAccountId from the account, or fall back to accountId as a string reference
    const billingAccountId = account.billingAccountId ?? input.membershipAccountId;

    const [stmt] = await (tx as any)
      .insert(statements)
      .values({
        id: statementId,
        tenantId: ctx.tenantId,
        billingAccountId,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        openingBalanceCents,
        chargesCents,
        paymentsCents,
        lateFeesCents,
        closingBalanceCents,
        dueDate: input.dueDate,
        status: 'open',
        statementNumber,
        membershipAccountId: input.membershipAccountId,
        deliveryStatus: 'pending',
        pdfStorageKey: null,
        metaJson: null,
        createdAt: now,
      })
      .returning();

    // Insert statement lines
    for (const line of lineEntries) {
      const lineId = generateUlid();
      await (tx as any)
        .insert(statementLines)
        .values({
          id: lineId,
          tenantId: ctx.tenantId,
          statementId,
          lineType: line.lineType,
          description: line.description,
          amountCents: line.amountCents,
          sourceTransactionId: line.sourceTransactionId,
          departmentId: line.departmentId,
          metaJson: line.metaJson,
          sortOrder: line.sortOrder,
          createdAt: now,
        });
    }

    const event = buildEventFromContext(ctx, 'membership.statement.generated.v1', {
      statementId,
      statementNumber,
      membershipAccountId: input.membershipAccountId,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      openingBalanceCents,
      chargesCents,
      closingBalanceCents,
      dueDate: input.dueDate,
      lineCount: lineEntries.length,
    });

    return { result: stmt!, events: [event] };
  });

  await auditLog(ctx, 'membership.statement.generated', 'statement', result.id);
  return result;
}
