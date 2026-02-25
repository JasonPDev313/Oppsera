import type { RequestContext } from '@oppsera/core/auth/context';
import { withTenant } from '@oppsera/db';
import { sql } from 'drizzle-orm';
import { AppError } from '@oppsera/shared';
import type { UpdateWaitlistEntryInput } from '../validation';

export async function updateWaitlistEntry(
  ctx: RequestContext,
  entryId: string,
  input: UpdateWaitlistEntryInput,
) {
  return withTenant(ctx.tenantId, async (tx) => {
    // Verify entry exists and is still waiting
    const existing = await tx.execute(sql`
      SELECT id, status FROM fnb_waitlist_entries
      WHERE id = ${entryId} AND tenant_id = ${ctx.tenantId}
    `);
    const entry = Array.from(existing as Iterable<Record<string, unknown>>)[0];
    if (!entry) throw new AppError('NOT_FOUND', 'Waitlist entry not found', 404);
    if (entry.status !== 'waiting' && entry.status !== 'notified') {
      throw new AppError('INVALID_STATUS', 'Can only update waiting or notified entries', 409);
    }

    const setClauses: string[] = ['updated_at = now()'];
    const values: unknown[] = [];

    if (input.guestName !== undefined) { setClauses.push(`guest_name = $${values.push(input.guestName)}`); }
    if (input.guestPhone !== undefined) { setClauses.push(`guest_phone = $${values.push(input.guestPhone)}`); }
    if (input.guestEmail !== undefined) { setClauses.push(`guest_email = $${values.push(input.guestEmail)}`); }
    if (input.partySize !== undefined) { setClauses.push(`party_size = $${values.push(input.partySize)}`); }
    if (input.seatingPreference !== undefined) { setClauses.push(`seating_preference = $${values.push(input.seatingPreference)}`); }
    if (input.specialRequests !== undefined) { setClauses.push(`special_requests = $${values.push(input.specialRequests)}`); }
    if (input.isVip !== undefined) { setClauses.push(`is_vip = $${values.push(input.isVip)}`); }
    if (input.vipNote !== undefined) { setClauses.push(`vip_note = $${values.push(input.vipNote)}`); }
    if (input.notes !== undefined) { setClauses.push(`notes = $${values.push(input.notes)}`); }
    if (input.priority !== undefined) { setClauses.push(`priority = $${values.push(input.priority)}`); }

    // Use Drizzle sql tagged template for safety
    const rows = await tx.execute(sql`
      UPDATE fnb_waitlist_entries
      SET
        guest_name = COALESCE(${input.guestName ?? null}, guest_name),
        guest_phone = CASE WHEN ${input.guestPhone !== undefined} THEN ${input.guestPhone ?? null} ELSE guest_phone END,
        guest_email = CASE WHEN ${input.guestEmail !== undefined} THEN ${input.guestEmail ?? null} ELSE guest_email END,
        party_size = COALESCE(${input.partySize ?? null}, party_size),
        seating_preference = CASE WHEN ${input.seatingPreference !== undefined} THEN ${input.seatingPreference ?? null} ELSE seating_preference END,
        special_requests = CASE WHEN ${input.specialRequests !== undefined} THEN ${input.specialRequests ?? null} ELSE special_requests END,
        is_vip = COALESCE(${input.isVip ?? null}, is_vip),
        vip_note = CASE WHEN ${input.vipNote !== undefined} THEN ${input.vipNote ?? null} ELSE vip_note END,
        notes = CASE WHEN ${input.notes !== undefined} THEN ${input.notes ?? null} ELSE notes END,
        priority = COALESCE(${input.priority ?? null}, priority),
        updated_at = now()
      WHERE id = ${entryId} AND tenant_id = ${ctx.tenantId}
      RETURNING *
    `);

    const updated = Array.from(rows as Iterable<Record<string, unknown>>)[0];
    if (!updated) throw new AppError('NOT_FOUND', 'Waitlist entry not found', 404);
    return updated;
  });
}
