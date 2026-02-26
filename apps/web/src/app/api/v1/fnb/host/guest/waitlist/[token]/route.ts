import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { db } from '@oppsera/db';
import { sql } from 'drizzle-orm';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  try {
    const rows = await db.execute(sql`
      SELECT
        id, guest_name, party_size, position, status,
        quoted_wait_minutes, estimated_ready_at,
        seating_preference, created_at
      FROM fnb_waitlist_entries
      WHERE guest_token = ${token}
      LIMIT 1
    `);

    const entry = Array.from(rows as Iterable<Record<string, unknown>>)[0];
    if (!entry) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Waitlist entry not found' } },
        { status: 404 },
      );
    }

    return NextResponse.json({
      data: {
        id: String(entry.id),
        guestName: String(entry.guest_name),
        partySize: Number(entry.party_size),
        position: Number(entry.position),
        status: String(entry.status),
        quotedWaitMinutes: entry.quoted_wait_minutes ? Number(entry.quoted_wait_minutes) : null,
        estimatedReadyAt: entry.estimated_ready_at ? String(entry.estimated_ready_at) : null,
        seatingPreference: entry.seating_preference ? String(entry.seating_preference) : null,
        createdAt: String(entry.created_at),
      },
    });
  } catch {
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch waitlist status' } },
      { status: 500 },
    );
  }
}
