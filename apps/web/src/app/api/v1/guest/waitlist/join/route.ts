import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { db } from '@oppsera/db';
import { sql } from 'drizzle-orm';

// Simple in-memory rate limiter for guest join endpoint
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const MAX_REQUESTS = 10;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (entry.count >= MAX_REQUESTS) return false;
  entry.count++;
  return true;
}

/**
 * POST /api/v1/guest/waitlist/join
 * Public guest self-service join — no auth required, rate limited.
 */
export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? 'unknown';
  if (!checkRateLimit(ip)) {
    return NextResponse.json(
      { error: { code: 'RATE_LIMITED', message: 'Too many requests. Please wait a moment and try again.' } },
      { status: 429 },
    );
  }

  try {
    const body = await req.json();

    if (!body.locationId) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'locationId is required' } },
        { status: 400 },
      );
    }
    if (!body.guestName || typeof body.guestName !== 'string' || !body.guestName.trim()) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'guestName is required' } },
        { status: 400 },
      );
    }
    const partySize = Number(body.partySize);
    if (!partySize || partySize < 1 || partySize > 99) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'partySize must be between 1 and 99' } },
        { status: 400 },
      );
    }

    // Resolve tenant from location
    const locRows = await db.execute(sql`
      SELECT tenant_id FROM locations WHERE id = ${body.locationId} AND is_active = true LIMIT 1
    `);
    const loc = Array.from(locRows as Iterable<Record<string, unknown>>)[0];
    if (!loc) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Location not found' } },
        { status: 404 },
      );
    }
    const tenantId = String(loc.tenant_id);

    const businessDate = new Date().toISOString().slice(0, 10);

    // Generate guest token
    const crypto = await import('crypto');
    const guestToken = crypto.randomBytes(32).toString('base64url');

    // Get next position
    const posRows = await db.execute(sql`
      SELECT COALESCE(MAX(position), 0) + 1 AS next_pos
      FROM fnb_waitlist_entries
      WHERE tenant_id = ${tenantId}
        AND location_id = ${body.locationId}
        AND business_date = ${businessDate}
        AND status IN ('waiting', 'notified')
    `);
    const nextPos = Number(
      (Array.from(posRows as Iterable<Record<string, unknown>>)[0] as Record<string, unknown>)?.next_pos ?? 1,
    );

    const quotedWaitMinutes = Math.max(5, nextPos * 5);
    const now = new Date();
    const estimatedReadyAt = new Date(now.getTime() + quotedWaitMinutes * 60_000).toISOString();

    const rows = await db.execute(sql`
      INSERT INTO fnb_waitlist_entries (
        id, tenant_id, location_id, business_date,
        guest_name, guest_phone, party_size,
        quoted_wait_minutes, status, position,
        seating_preference, source, guest_token, estimated_ready_at
      ) VALUES (
        gen_random_uuid()::text, ${tenantId}, ${body.locationId}, ${businessDate},
        ${body.guestName.trim()}, ${body.guestPhone?.trim() || null}, ${partySize},
        ${quotedWaitMinutes}, 'waiting', ${nextPos},
        ${body.seatingPreference || null}, 'qr_code', ${guestToken}, ${estimatedReadyAt}
      )
      RETURNING id, guest_token
    `);

    const created = Array.from(rows as Iterable<Record<string, unknown>>)[0]!;

    return NextResponse.json({
      data: {
        id: String(created.id),
        token: String(created.guest_token),
      },
    }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to join waitlist' } },
      { status: 500 },
    );
  }
}
