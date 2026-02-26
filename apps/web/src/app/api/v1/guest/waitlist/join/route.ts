import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { db } from '@oppsera/db';
import { sql } from 'drizzle-orm';
import { z } from 'zod';

// ── Zod schema for public guest waitlist join ────────────────
const joinWaitlistSchema = z.object({
  locationId: z.string().min(1, 'locationId is required'),
  guestName: z.string().min(1, 'guestName is required').max(200).transform((s) => s.trim()),
  guestPhone: z.string().max(30).optional().transform((s) => s?.trim() || null),
  partySize: z.coerce.number().int().min(1, 'partySize must be at least 1').max(99, 'partySize must be at most 99'),
  seatingPreference: z.string().max(100).optional().transform((s) => s || null),
});

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

    // Validate input with Zod
    const parsed = joinWaitlistSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message ?? 'Invalid input', details: parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })) } },
        { status: 400 },
      );
    }
    const input = parsed.data;

    // Resolve tenant from location
    const locRows = await db.execute(sql`
      SELECT tenant_id FROM locations WHERE id = ${input.locationId} AND is_active = true LIMIT 1
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

    // Atomic position calculation + insert inside a transaction to prevent race conditions.
    // Without this, concurrent requests can read the same MAX(position) and get duplicate positions.
    const rows = await db.transaction(async (tx) => {
      const posRows = await tx.execute(sql`
        SELECT COALESCE(MAX(position), 0) + 1 AS next_pos
        FROM fnb_waitlist_entries
        WHERE tenant_id = ${tenantId}
          AND location_id = ${input.locationId}
          AND business_date = ${businessDate}
          AND status IN ('waiting', 'notified')
        FOR UPDATE
      `);
      const nextPos = Number(
        (Array.from(posRows as Iterable<Record<string, unknown>>)[0] as Record<string, unknown>)?.next_pos ?? 1,
      );

      const quotedWaitMinutes = Math.max(5, nextPos * 5);
      const now = new Date();
      const estimatedReadyAt = new Date(now.getTime() + quotedWaitMinutes * 60_000).toISOString();

      return tx.execute(sql`
        INSERT INTO fnb_waitlist_entries (
          id, tenant_id, location_id, business_date,
          guest_name, guest_phone, party_size,
          quoted_wait_minutes, status, position,
          seating_preference, source, guest_token, estimated_ready_at
        ) VALUES (
          gen_random_uuid()::text, ${tenantId}, ${input.locationId}, ${businessDate},
          ${input.guestName}, ${input.guestPhone}, ${input.partySize},
          ${quotedWaitMinutes}, 'waiting', ${nextPos},
          ${input.seatingPreference}, 'qr_code', ${guestToken}, ${estimatedReadyAt}
        )
        RETURNING id, guest_token
      `);
    });

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
