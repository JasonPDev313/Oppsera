import type { RequestContext } from '@oppsera/core/auth/context';
import { publishWithOutbox } from '@oppsera/core/events/outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit';
import { sql } from 'drizzle-orm';
import type { AddToWaitlistInput } from '../validation';

export async function addToWaitlist(
  ctx: RequestContext,
  input: AddToWaitlistInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Get next position in queue
    const posRows = await tx.execute(sql`
      SELECT COALESCE(MAX(position), 0) + 1 AS next_pos
      FROM fnb_waitlist_entries
      WHERE tenant_id = ${ctx.tenantId}
        AND location_id = ${ctx.locationId}
        AND business_date = ${new Date().toISOString().slice(0, 10)}
        AND status = 'waiting'
    `);
    const nextPos = Number(
      (Array.from(posRows as Iterable<Record<string, unknown>>)[0] as Record<string, unknown>)?.next_pos ?? 1,
    );

    const businessDate = new Date().toISOString().slice(0, 10);

    const rows = await tx.execute(sql`
      INSERT INTO fnb_waitlist_entries (
        id, tenant_id, location_id, business_date,
        guest_name, guest_phone, guest_email, party_size,
        quoted_wait_minutes, status, priority, position,
        seating_preference, special_requests, is_vip, vip_note,
        customer_id, source, notes, estimated_arrival_at
      ) VALUES (
        gen_random_uuid()::text, ${ctx.tenantId}, ${ctx.locationId}, ${businessDate},
        ${input.guestName}, ${input.guestPhone ?? null}, ${input.guestEmail ?? null}, ${input.partySize},
        ${input.quotedWaitMinutes ?? null}, 'waiting', ${input.isVip ? 1 : 0}, ${nextPos},
        ${input.seatingPreference ?? null}, ${input.specialRequests ?? null},
        ${input.isVip ?? false}, ${input.vipNote ?? null},
        ${input.customerId ?? null}, ${input.source ?? 'host_stand'},
        ${input.notes ?? null}, ${input.estimatedArrivalAt ?? null}
      )
      RETURNING *
    `);

    const created = Array.from(rows as Iterable<Record<string, unknown>>)[0]!;
    const event = buildEventFromContext(ctx, 'fnb.waitlist.added.v1', {
      waitlistEntryId: created.id,
      guestName: input.guestName,
      partySize: input.partySize,
      position: nextPos,
      quotedWaitMinutes: input.quotedWaitMinutes,
    });

    return { result: mapWaitlistRow(created), events: [event] };
  });

  await auditLog(ctx, 'fnb.waitlist.added', 'waitlist_entry', result.id);
  return result;
}

function mapWaitlistRow(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    guestName: String(row.guest_name),
    guestPhone: row.guest_phone ? String(row.guest_phone) : null,
    guestEmail: row.guest_email ? String(row.guest_email) : null,
    partySize: Number(row.party_size),
    quotedWaitMinutes: row.quoted_wait_minutes != null ? Number(row.quoted_wait_minutes) : null,
    status: String(row.status) as 'waiting',
    priority: Number(row.priority),
    position: Number(row.position),
    seatingPreference: row.seating_preference ? String(row.seating_preference) : null,
    specialRequests: row.special_requests ? String(row.special_requests) : null,
    isVip: Boolean(row.is_vip),
    vipNote: row.vip_note ? String(row.vip_note) : null,
    customerId: row.customer_id ? String(row.customer_id) : null,
    source: String(row.source),
    notes: row.notes ? String(row.notes) : null,
    addedAt: String(row.added_at),
    notifiedAt: null,
    seatedAt: null,
    actualWaitMinutes: null,
  };
}
