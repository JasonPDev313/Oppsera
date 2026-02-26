import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { hostAddToWaitlistSchema } from '@oppsera/module-fnb';
import { withTenant } from '@oppsera/db';
import { sql } from 'drizzle-orm';

// Simple in-memory rate limiter for guest endpoints
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const MAX_REQUESTS = 10;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_TRACKED_IPS = 2000;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  // Evict expired entries periodically to prevent unbounded growth
  if (rateLimitMap.size > MAX_TRACKED_IPS) {
    for (const [key, entry] of rateLimitMap) {
      if (now > entry.resetAt) rateLimitMap.delete(key);
    }
  }
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (entry.count >= MAX_REQUESTS) return false;
  entry.count++;
  return true;
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? 'unknown';
  if (!checkRateLimit(ip)) {
    return NextResponse.json(
      { error: { code: 'RATE_LIMITED', message: 'Too many requests' } },
      { status: 429 },
    );
  }

  try {
    const body = await req.json();

    // locationId is required for guest self-service
    if (!body.locationId || !body.tenantId) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'locationId and tenantId are required' } },
        { status: 400 },
      );
    }

    const parsed = hostAddToWaitlistSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: parsed.error.issues } },
        { status: 400 },
      );
    }

    const { tenantId, locationId } = body;
    const businessDate = new Date().toISOString().slice(0, 10);

    // Generate guest token
    const crypto = await import('crypto');
    const guestToken = crypto.randomBytes(32).toString('base64url');

    const quotedWaitMinutes = 15;
    const now = new Date();
    const estimatedReadyAt = new Date(now.getTime() + quotedWaitMinutes * 60_000).toISOString();

    // Use withTenant to respect RLS, and compute position atomically in a single INSERT
    const created = await withTenant(tenantId, async (tx) => {
      const rows = await tx.execute(sql`
        INSERT INTO fnb_waitlist_entries (
          id, tenant_id, location_id, business_date,
          guest_name, guest_phone, party_size,
          quoted_wait_minutes, status, position,
          seating_preference, special_requests,
          source, guest_token, estimated_ready_at
        ) VALUES (
          gen_random_uuid()::text, ${tenantId}, ${locationId}, ${businessDate},
          ${parsed.data.guestName}, ${parsed.data.guestPhone}, ${parsed.data.partySize},
          ${quotedWaitMinutes}, 'waiting',
          (SELECT COALESCE(MAX(position), 0) + 1 FROM fnb_waitlist_entries
           WHERE tenant_id = ${tenantId} AND location_id = ${locationId}
             AND business_date = ${businessDate} AND status IN ('waiting', 'notified')),
          ${parsed.data.seatingPreference ?? null}, ${parsed.data.specialRequests ?? null},
          'qr_code', ${guestToken}, ${estimatedReadyAt}
        )
        RETURNING id, guest_name, party_size, position, quoted_wait_minutes, guest_token, estimated_ready_at
      `);

      return Array.from(rows as Iterable<Record<string, unknown>>)[0]!;
    });

    return NextResponse.json({
      data: {
        id: String(created.id),
        guestName: String(created.guest_name),
        partySize: Number(created.party_size),
        position: Number(created.position),
        quotedWaitMinutes: Number(created.quoted_wait_minutes),
        guestToken: String(created.guest_token),
        estimatedReadyAt: String(created.estimated_ready_at),
      },
    }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to join waitlist' } },
      { status: 500 },
    );
  }
}
