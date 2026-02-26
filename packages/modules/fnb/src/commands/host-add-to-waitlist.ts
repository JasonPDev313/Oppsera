import type { RequestContext } from '@oppsera/core/auth/context';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit';
import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import type { HostAddToWaitlistInput } from '../validation-host';
import { generateGuestToken, mapHostWaitlistRow } from './host-helpers';
import { estimateWaitTime } from '../queries/estimate-wait-time';

/** Compute business date in the tenant's configured timezone (falls back to UTC) */
async function resolveBusinessDate(tenantId: string): Promise<string> {
  try {
    const tz = await withTenant(tenantId, async (tx) => {
      const rows = await tx.execute(sql`
        SELECT timezone FROM tenant_business_info WHERE tenant_id = ${tenantId} LIMIT 1
      `);
      const row = Array.from(rows as Iterable<Record<string, unknown>>)[0];
      return row?.timezone ? String(row.timezone) : null;
    });
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: tz || 'UTC',
      year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

/**
 * HOST V2: Add a party to the waitlist.
 * Calculates next position from active entries (waiting/notified).
 * Generates a guest token for self-service status checking.
 * Uses smart wait-time estimation (falls back to 15 min on failure).
 */
export async function hostAddToWaitlist(
  ctx: RequestContext,
  input: HostAddToWaitlistInput,
) {
  // Smart wait-time estimation — best-effort, fallback to 15 min
  let quotedWaitMinutes = 15;
  try {
    // Determine current meal period from hour of day
    const hour = new Date().getHours();
    const mealPeriod = hour < 11 ? 'breakfast' : hour < 15 ? 'lunch' : 'dinner';

    const estimate = await estimateWaitTime({
      tenantId: ctx.tenantId,
      locationId: ctx.locationId!,
      partySize: input.partySize,
      mealPeriod,
    });
    quotedWaitMinutes = estimate.estimatedMinutes > 0 ? estimate.estimatedMinutes : 15;
  } catch {
    // Estimation failed — use default
  }

  // Resolve business date BEFORE the transaction (read-only, avoids holding locks)
  const businessDate = await resolveBusinessDate(ctx.tenantId);

  const result = await publishWithOutbox(ctx, async (tx) => {

    // Calculate next position: MAX(position) + 1 for active entries
    const posRows = await tx.execute(sql`
      SELECT COALESCE(MAX(position), 0) + 1 AS next_pos
      FROM fnb_waitlist_entries
      WHERE tenant_id = ${ctx.tenantId}
        AND location_id = ${ctx.locationId}
        AND business_date = ${businessDate}
        AND status IN ('waiting', 'notified')
    `);
    const nextPos = Number(
      (Array.from(posRows as Iterable<Record<string, unknown>>)[0] as Record<string, unknown>)?.next_pos ?? 1,
    );

    // Generate guest token for self-service status
    const guestToken = generateGuestToken();

    // Calculate estimated ready time
    const now = new Date();
    const estimatedReadyAt = new Date(now.getTime() + quotedWaitMinutes * 60_000).toISOString();

    const rows = await tx.execute(sql`
      INSERT INTO fnb_waitlist_entries (
        id, tenant_id, location_id, business_date,
        guest_name, guest_phone, party_size,
        quoted_wait_minutes, status, position,
        seating_preference, special_requests,
        customer_id, source, notes,
        guest_token, estimated_ready_at
      ) VALUES (
        gen_random_uuid()::text, ${ctx.tenantId}, ${ctx.locationId}, ${businessDate},
        ${input.guestName}, ${input.guestPhone}, ${input.partySize},
        ${quotedWaitMinutes}, 'waiting', ${nextPos},
        ${input.seatingPreference ?? null}, ${input.specialRequests ?? null},
        ${input.customerId ?? null}, ${input.source ?? 'host'}, ${null},
        ${guestToken}, ${estimatedReadyAt}
      )
      RETURNING *
    `);

    const created = Array.from(rows as Iterable<Record<string, unknown>>)[0]!;

    const event = buildEventFromContext(ctx, 'fnb.waitlist.added.v1', {
      waitlistEntryId: created.id,
      guestName: input.guestName,
      partySize: input.partySize,
      position: nextPos,
      quotedWaitMinutes,
      guestToken,
    });

    return { result: mapHostWaitlistRow(created), events: [event] };
  });

  await auditLog(ctx, 'fnb.waitlist.added', 'waitlist_entry', result.id);
  return result;
}
