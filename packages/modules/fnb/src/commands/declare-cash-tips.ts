import { sql } from 'drizzle-orm';
import type { RequestContext } from '@oppsera/core/auth/context';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import { FNB_EVENTS } from '../events/types';
import type { TipDeclaredPayload } from '../events/types';
import { TipDeclarationExistsError } from '../errors';

const MINIMUM_DECLARATION_PERCENTAGE = 8; // IRS minimum 8% of cash sales

interface DeclareCashTipsInput {
  clientRequestId?: string;
  serverUserId: string;
  businessDate: string;
  cashTipsDeclaredCents: number;
  cashSalesCents: number;
}

export async function declareCashTips(
  ctx: RequestContext,
  locationId: string,
  input: DeclareCashTipsInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    if (input.clientRequestId) {
      const check = await checkIdempotency(tx, ctx.tenantId, input.clientRequestId, 'declareCashTips');
      if (check.isDuplicate) return { result: check.originalResult as any, events: [] };
    }

    // Check for existing declaration
    const existing = await tx.execute(
      sql`SELECT id FROM fnb_tip_declarations
          WHERE tenant_id = ${ctx.tenantId}
            AND server_user_id = ${input.serverUserId}
            AND business_date = ${input.businessDate}`,
    );
    const existingRows = Array.from(existing as Iterable<Record<string, unknown>>);
    if (existingRows.length > 0) {
      throw new TipDeclarationExistsError(input.serverUserId, input.businessDate);
    }

    // Calculate declaration percentage
    let declarationPercentage: string | null = null;
    let meetsMinimum = true;
    if (input.cashSalesCents > 0) {
      const pct = (input.cashTipsDeclaredCents / input.cashSalesCents) * 100;
      declarationPercentage = pct.toFixed(2);
      meetsMinimum = pct >= MINIMUM_DECLARATION_PERCENTAGE;
    }

    const rows = await tx.execute(
      sql`INSERT INTO fnb_tip_declarations (tenant_id, server_user_id, business_date,
            cash_tips_declared_cents, cash_sales_cents, declaration_percentage,
            meets_minimum_threshold)
          VALUES (${ctx.tenantId}, ${input.serverUserId}, ${input.businessDate},
            ${input.cashTipsDeclaredCents}, ${input.cashSalesCents},
            ${declarationPercentage}, ${meetsMinimum})
          RETURNING id`,
    );
    const created = Array.from(rows as Iterable<Record<string, unknown>>)[0]!;

    const payload: TipDeclaredPayload = {
      declarationId: created.id as string,
      serverUserId: input.serverUserId,
      locationId,
      businessDate: input.businessDate,
      cashTipsDeclaredCents: input.cashTipsDeclaredCents,
      meetsMinimumThreshold: meetsMinimum,
    };

    const event = buildEventFromContext(ctx, FNB_EVENTS.TIP_DECLARED, payload as unknown as Record<string, unknown>);

    const declResult = {
      id: created.id as string,
      serverUserId: input.serverUserId,
      businessDate: input.businessDate,
      cashTipsDeclaredCents: input.cashTipsDeclaredCents,
      declarationPercentage,
      meetsMinimumThreshold: meetsMinimum,
    };

    if (input.clientRequestId) {
      await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'declareCashTips', declResult);
    }

    return { result: declResult, events: [event] };
  });

  await auditLog(ctx, 'fnb.tip.declared', 'fnb_tip_declarations', result.id);
  return result;
}
