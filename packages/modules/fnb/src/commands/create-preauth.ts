import { sql } from 'drizzle-orm';
import type { RequestContext } from '@oppsera/core/auth/context';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import { FNB_EVENTS } from '../events/types';
import type { PreauthCreatedPayload } from '../events/types';
import { TabNotFoundError } from '../errors';

interface CreatePreauthInput {
  clientRequestId?: string;
  tabId: string;
  authAmountCents: number;
  cardToken: string;
  cardLast4: string;
  cardBrand?: string;
  providerRef?: string;
  expiresInHours: number;
}

export async function createPreauth(
  ctx: RequestContext,
  locationId: string,
  input: CreatePreauthInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    if (input.clientRequestId) {
      const check = await checkIdempotency(tx, ctx.tenantId, input.clientRequestId, 'createPreauth');
      if (check.isDuplicate) return { result: check.originalResult as any, events: [] };
    }

    // Validate tab exists
    const tabs = await tx.execute(
      sql`SELECT id, location_id FROM fnb_tabs
          WHERE id = ${input.tabId} AND tenant_id = ${ctx.tenantId}`,
    );
    const tabRows = Array.from(tabs as Iterable<Record<string, unknown>>);
    if (tabRows.length === 0) throw new TabNotFoundError(input.tabId);

    const expiresAt = new Date(Date.now() + input.expiresInHours * 60 * 60 * 1000);

    // Insert pre-auth
    const rows = await tx.execute(
      sql`INSERT INTO fnb_tab_preauths (tenant_id, tab_id, status, auth_amount_cents,
            card_token, card_last4, card_brand, provider_ref, expires_at)
          VALUES (${ctx.tenantId}, ${input.tabId}, 'authorized', ${input.authAmountCents},
            ${input.cardToken}, ${input.cardLast4}, ${input.cardBrand ?? null},
            ${input.providerRef ?? null}, ${expiresAt.toISOString()})
          RETURNING id`,
    );
    const created = Array.from(rows as Iterable<Record<string, unknown>>)[0]!;

    // Update tab to mark card on file
    await tx.execute(
      sql`UPDATE fnb_tabs SET has_card_on_file = true, updated_at = NOW()
          WHERE id = ${input.tabId} AND tenant_id = ${ctx.tenantId}`,
    );

    const payload: PreauthCreatedPayload = {
      preauthId: created.id as string,
      tabId: input.tabId,
      locationId,
      authAmountCents: input.authAmountCents,
      cardLast4: input.cardLast4,
      cardBrand: input.cardBrand ?? null,
      expiresAt: expiresAt.toISOString(),
    };

    const event = buildEventFromContext(ctx, FNB_EVENTS.PREAUTH_CREATED, payload as unknown as Record<string, unknown>);

    const preauthResult = {
      id: created.id as string,
      tabId: input.tabId,
      status: 'authorized',
      authAmountCents: input.authAmountCents,
      cardLast4: input.cardLast4,
      cardBrand: input.cardBrand ?? null,
      expiresAt: expiresAt.toISOString(),
    };

    if (input.clientRequestId) {
      await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'createPreauth', preauthResult);
    }

    return { result: preauthResult, events: [event] };
  });

  await auditLog(ctx, 'fnb.preauth.created', 'fnb_tab_preauths', result.id);
  return result;
}
