import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { db } from '@oppsera/db';
import { sql } from 'drizzle-orm';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  try {
    const body = await req.json();

    // Validate the token exists and entry is still active
    const entryRows = await db.execute(sql`
      SELECT id, status FROM fnb_waitlist_entries
      WHERE guest_token = ${token} AND status IN ('waiting', 'notified')
      LIMIT 1
    `);
    const entry = Array.from(entryRows as Iterable<Record<string, unknown>>)[0];
    if (!entry) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Waitlist entry not found or no longer active' } },
        { status: 404 },
      );
    }

    const entryId = String(entry.id);
    const hasPartySize = body.partySize != null && typeof body.partySize === 'number' && body.partySize >= 1;
    const hasPref = body.seatingPreference !== undefined;

    if (!hasPartySize && !hasPref) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'No valid fields to update' } },
        { status: 400 },
      );
    }

    // Single update with conditional columns
    if (hasPartySize && hasPref) {
      await db.execute(sql`
        UPDATE fnb_waitlist_entries
        SET party_size = ${body.partySize}, seating_preference = ${body.seatingPreference}, updated_at = now()
        WHERE id = ${entryId}
      `);
    } else if (hasPartySize) {
      await db.execute(sql`
        UPDATE fnb_waitlist_entries
        SET party_size = ${body.partySize}, updated_at = now()
        WHERE id = ${entryId}
      `);
    } else {
      await db.execute(sql`
        UPDATE fnb_waitlist_entries
        SET seating_preference = ${body.seatingPreference}, updated_at = now()
        WHERE id = ${entryId}
      `);
    }

    return NextResponse.json({ data: { id: entryId, updated: true } });
  } catch {
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to update waitlist entry' } },
      { status: 500 },
    );
  }
}
