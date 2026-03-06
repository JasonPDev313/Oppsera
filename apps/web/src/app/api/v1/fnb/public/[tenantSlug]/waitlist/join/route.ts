import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createAdminClient } from '@oppsera/db';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { checkRateLimit, getRateLimitKey, RATE_LIMITS, rateLimitHeaders } from '@oppsera/core/security';
import { resolveWaitlistTenant } from '../../resolve-waitlist-tenant';

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$/;

/**
 * POST /api/v1/fnb/public/[tenantSlug]/waitlist/join
 *
 * Public guest self-service join — no auth required, rate-limited.
 * Config-driven: validates party size, required fields, capacity, pacing from operator config.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ tenantSlug: string }> },
) {
  const { tenantSlug } = await params;

  // Validate slug format before hitting DB
  if (!SLUG_RE.test(tenantSlug)) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Waitlist not found or not enabled' } },
      { status: 404 },
    );
  }

  // Rate limit
  const rlKey = getRateLimitKey(req, 'wl-join');
  const rl = checkRateLimit(rlKey, RATE_LIMITS.publicWrite);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: { code: 'RATE_LIMITED', message: 'Too many requests. Please wait a moment and try again.' } },
      { status: 429, headers: rateLimitHeaders(rl) },
    );
  }

  try {
    // Resolve tenant + config
    const resolved = await resolveWaitlistTenant(tenantSlug);
    if (!resolved) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Waitlist not found or not enabled' } },
        { status: 404 },
      );
    }

    const { tenantId, locationId, config } = resolved;
    const fc = config.formConfig;
    const qc = config.queueConfig;

    // Build dynamic Zod schema from config
    const joinSchema = z.object({
      guestName: z.string().min(1, 'Name is required').max(200).transform((s) => s.trim().replace(/[<>]/g, '')),
      guestPhone: fc.requirePhone
        ? z.string().min(1, 'Phone number is required').max(30).transform((s) => s.trim())
        : z.string().max(30).optional().transform((s) => s?.trim() || null),
      partySize: z.coerce.number().int()
        .min(fc.minPartySize, `Party size must be at least ${fc.minPartySize}`)
        .max(fc.maxPartySize, `Party size must be at most ${fc.maxPartySize}`),
      seatingPreference: fc.enableSeatingPreference
        ? z.string().max(100).optional().transform((s) => s || null)
        : z.undefined().transform(() => null),
      occasion: fc.enableOccasion
        ? z.string().max(100).optional().transform((s) => s || null)
        : z.undefined().transform(() => null),
      notes: fc.enableNotes
        ? z.string().max(fc.notesMaxLength).optional().transform((s) => s || null)
        : z.undefined().transform(() => null),
      customFieldValues: z.record(z.string().max(100), z.string().max(500))
        .optional()
        .default({})
        .refine((vals) => Object.keys(vals).length <= 20, 'Too many custom fields'),
      source: z.enum(['qr_code', 'online', 'widget']).default('online'),
    });

    const body = await req.json();
    const parsed = joinSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message ?? 'Invalid input', details: parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })) } },
        { status: 400 },
      );
    }
    const input = parsed.data;

    const adminDb = createAdminClient();
    const businessDate = new Date().toISOString().slice(0, 10);

    // Check capacity
    const [capacityRow] = Array.from(
      await adminDb.execute(sql`
        SELECT COUNT(*) AS current_count
        FROM fnb_waitlist_entries
        WHERE tenant_id = ${tenantId}
          AND location_id = ${locationId}
          AND business_date = ${businessDate}
          AND status IN ('waiting', 'notified')
      `) as Iterable<Record<string, unknown>>,
    );
    const currentCount = Number(capacityRow?.current_count ?? 0);
    if (currentCount >= qc.maxCapacity) {
      return NextResponse.json(
        { error: { code: 'WAITLIST_FULL', message: 'The waitlist is currently full. Please try again later.' } },
        { status: 422 },
      );
    }

    // Check pacing
    if (qc.pacingEnabled) {
      const intervalStart = new Date(Date.now() - qc.pacingIntervalMinutes * 60_000).toISOString();
      const [pacingRow] = Array.from(
        await adminDb.execute(sql`
          SELECT COUNT(*) AS recent_count
          FROM fnb_waitlist_entries
          WHERE tenant_id = ${tenantId}
            AND location_id = ${locationId}
            AND created_at >= ${intervalStart}::timestamptz
        `) as Iterable<Record<string, unknown>>,
      );
      const recentCount = Number(pacingRow?.recent_count ?? 0);
      if (recentCount >= qc.pacingMaxPerInterval) {
        return NextResponse.json(
          { error: { code: 'PACING_LIMIT', message: "We're at capacity right now. Please try again in a few minutes." } },
          { status: 422 },
        );
      }
    }

    // Check for duplicate phone (idempotency — same phone on same date still active)
    if (input.guestPhone) {
      const [dupRow] = Array.from(
        await adminDb.execute(sql`
          SELECT id, guest_token FROM fnb_waitlist_entries
          WHERE tenant_id = ${tenantId}
            AND location_id = ${locationId}
            AND business_date = ${businessDate}
            AND guest_phone = ${input.guestPhone}
            AND status IN ('waiting', 'notified')
          LIMIT 1
        `) as Iterable<Record<string, unknown>>,
      );
      if (dupRow) {
        // Don't return the token — prevents phone enumeration and token theft.
        // The guest already has the token from their original join SMS/redirect.
        return NextResponse.json({
          data: {
            duplicate: true,
            message: 'You are already on the waitlist. Check your text message for your status link.',
          },
        }, { status: 200 });
      }
    }

    // VIP auto-priority: look up customer by phone to set priority + linkage
    let customerId: string | null = null;
    let isVip = false;
    let customerVisitCount = 0;
    let priority = 0;
    if (input.guestPhone) {
      try {
        const [customerRow] = Array.from(
          await adminDb.execute(sql`
            SELECT c.id, c.is_vip, c.visit_count, c.tags
            FROM customers c
            WHERE c.tenant_id = ${tenantId}
              AND c.phone = ${input.guestPhone}
              AND c.status = 'active'
            LIMIT 1
          `) as Iterable<Record<string, unknown>>,
        );
        if (customerRow) {
          customerId = String(customerRow.id);
          isVip = customerRow.is_vip === true;
          customerVisitCount = Number(customerRow.visit_count ?? 0);
          // Auto-priority: VIP=3, frequent visitor (10+ visits)=2, known customer=1
          if (isVip) priority = 3;
          else if (customerVisitCount >= 10) priority = 2;
          else priority = 1;
        }
      } catch {
        // Customer lookup failure is non-critical — continue without VIP priority
      }
    }

    // Generate guest token
    const crypto = await import('crypto');
    const guestToken = crypto.randomBytes(32).toString('base64url');

    // Atomic position calculation + insert
    const rows = await adminDb.transaction(async (tx) => {
      // Advisory lock prevents concurrent position collision (FOR UPDATE is invalid with aggregates)
      await tx.execute(sql`
        SELECT pg_advisory_xact_lock(hashtext(${tenantId} || ':waitlist:' || ${locationId} || ':' || ${businessDate}))
      `);

      const posRows = await tx.execute(sql`
        SELECT COALESCE(MAX(position), 0) + 1 AS next_pos
        FROM fnb_waitlist_entries
        WHERE tenant_id = ${tenantId}
          AND location_id = ${locationId}
          AND business_date = ${businessDate}
          AND status IN ('waiting', 'notified')
      `);
      const nextPos = Number(
        (Array.from(posRows as Iterable<Record<string, unknown>>)[0] as Record<string, unknown>)?.next_pos ?? 1,
      );

      const quotedWaitMinutes = Math.max(5, nextPos * 5);
      const now = new Date();
      const estimatedReadyAt = new Date(now.getTime() + quotedWaitMinutes * 60_000).toISOString();

      // Store custom fields + occasion in notes (JSON) if present
      let notes = input.notes || '';
      if (input.occasion) {
        notes = notes ? `${notes}\nOccasion: ${input.occasion}` : `Occasion: ${input.occasion}`;
      }
      // Only keep custom fields that match configured labels
      const allowedKeys = new Set(fc.customFields.map((f: { label: string }) => f.label));
      const customVals = Object.fromEntries(
        Object.entries(input.customFieldValues).filter(([k]) => allowedKeys.has(k)),
      );
      if (Object.keys(customVals).length > 0) {
        const customStr = Object.entries(customVals).map(([k, v]) => `${k}: ${v}`).join('\n');
        notes = notes ? `${notes}\n${customStr}` : customStr;
      }

      return tx.execute(sql`
        INSERT INTO fnb_waitlist_entries (
          id, tenant_id, location_id, business_date,
          guest_name, guest_phone, party_size,
          quoted_wait_minutes, status, position,
          seating_preference, source, guest_token, estimated_ready_at,
          notes, customer_id, is_vip, customer_visit_count, priority
        ) VALUES (
          gen_random_uuid()::text, ${tenantId}, ${locationId}, ${businessDate},
          ${input.guestName}, ${input.guestPhone}, ${input.partySize},
          ${quotedWaitMinutes}, 'waiting', ${nextPos},
          ${input.seatingPreference}, ${input.source}, ${guestToken}, ${estimatedReadyAt},
          ${notes || null}, ${customerId}, ${isVip}, ${customerVisitCount}, ${priority}
        )
        RETURNING id, guest_token, position, quoted_wait_minutes
      `);
    });

    const created = Array.from(rows as Iterable<Record<string, unknown>>)[0]!;

    return NextResponse.json({
      data: {
        id: String(created.id),
        token: String(created.guest_token),
        position: Number(created.position),
        estimatedMinutes: Number(created.quoted_wait_minutes),
      },
    }, { status: 201, headers: rateLimitHeaders(rl) });
  } catch (err) {
    console.error('[waitlist-join] Failed to join waitlist:', err instanceof Error ? err.message : err);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to join waitlist' } },
      { status: 500 },
    );
  }
}
