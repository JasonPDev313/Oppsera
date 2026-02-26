import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { db } from '@oppsera/db';
import { sql } from 'drizzle-orm';

/**
 * GET /api/v1/guest/waitlist/[token]
 * Public guest-facing status endpoint — no auth required.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  try {
    const rows = await db.execute(sql`
      SELECT
        w.id,
        w.guest_name,
        w.party_size,
        w.position,
        w.status,
        w.quoted_wait_minutes,
        w.estimated_ready_at,
        w.seating_preference,
        w.created_at,
        w.notified_at,
        w.location_id,
        l.name AS venue_name
      FROM fnb_waitlist_entries w
      LEFT JOIN locations l ON l.id = w.location_id
      WHERE w.guest_token = ${token}
      LIMIT 1
    `);

    const entry = Array.from(rows as Iterable<Record<string, unknown>>)[0];
    if (!entry) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Waitlist entry not found' } },
        { status: 404 },
      );
    }

    // Compute estimated minutes remaining from estimated_ready_at
    let estimatedMinutes: number | null = null;
    if (entry.estimated_ready_at) {
      const readyAt = new Date(String(entry.estimated_ready_at)).getTime();
      const remaining = Math.max(0, Math.round((readyAt - Date.now()) / 60_000));
      estimatedMinutes = remaining;
    }

    return NextResponse.json({
      data: {
        id: String(entry.id),
        guestName: String(entry.guest_name),
        partySize: Number(entry.party_size),
        position: Number(entry.position),
        status: String(entry.status),
        estimatedMinutes,
        quotedWaitMinutes: entry.quoted_wait_minutes != null ? Number(entry.quoted_wait_minutes) : null,
        joinedAt: String(entry.created_at),
        notifiedAt: entry.notified_at ? String(entry.notified_at) : null,
        notificationExpiryMinutes: 10,
        venueName: entry.venue_name ? String(entry.venue_name) : '',
        menuUrl: null,
      },
    });
  } catch {
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch waitlist status' } },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/v1/guest/waitlist/[token]
 * Guest leaves the waitlist.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  try {
    const entryRows = await db.execute(sql`
      SELECT id, status FROM fnb_waitlist_entries
      WHERE guest_token = ${token} AND status IN ('waiting', 'notified')
      LIMIT 1
    `);
    const entry = Array.from(entryRows as Iterable<Record<string, unknown>>)[0];
    if (!entry) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Waitlist entry not found or already removed' } },
        { status: 404 },
      );
    }

    await db.execute(sql`
      UPDATE fnb_waitlist_entries
      SET status = 'left', updated_at = now()
      WHERE id = ${String(entry.id)}
    `);

    return NextResponse.json({ data: { id: String(entry.id), status: 'left' } });
  } catch {
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to leave waitlist' } },
      { status: 500 },
    );
  }
}
