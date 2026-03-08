import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createAdminClient, pmsWaitlist, pmsWaitlistConfig } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';
import { generateUlid } from '@oppsera/shared';
import { publicJoinWaitlistSchema } from '@oppsera/module-pms';
import { RATE_LIMITS, checkRateLimit, getRateLimitKey, rateLimitHeaders } from '@oppsera/core';
import { resolvePmsTenantBySlug } from '../../../resolve-tenant';

/**
 * POST /api/v1/pms/public/[tenantSlug]/waitlist/join?propertyId=...
 *
 * Public endpoint — guest joins the waitlist without authentication.
 * Returns a guest token for status tracking.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenantSlug: string }> },
) {
  // Rate limit: 5 requests per minute per IP
  const rlKey = getRateLimitKey(request, 'pms.waitlist.join');
  const rl = checkRateLimit(rlKey, RATE_LIMITS.publicWrite);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: { code: 'RATE_LIMITED', message: 'Too many requests. Please try again later.' } },
      { status: 429, headers: rateLimitHeaders(rl) },
    );
  }

  const { tenantSlug } = await params;
  const tenant = await resolvePmsTenantBySlug(tenantSlug);
  if (!tenant) {
    return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Property not found' } }, { status: 404 });
  }

  const url = new URL(request.url);
  const propertyId = url.searchParams.get('propertyId');
  if (!propertyId) {
    return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: 'propertyId is required' } }, { status: 400 });
  }

  const body = await request.json();
  const parsed = publicJoinWaitlistSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      },
    }, { status: 400 });
  }

  const adminDb = createAdminClient();

  // Check if waitlist is enabled
  const [config] = await adminDb
    .select({ isEnabled: pmsWaitlistConfig.isEnabled })
    .from(pmsWaitlistConfig)
    .where(and(eq(pmsWaitlistConfig.tenantId, tenant.tenantId), eq(pmsWaitlistConfig.propertyId, propertyId)))
    .limit(1);

  if (config && !config.isEnabled) {
    return NextResponse.json({ error: { code: 'DISABLED', message: 'Waitlist is not enabled' } }, { status: 403 });
  }

  // Check for duplicate (same email or phone, still waiting)
  if (parsed.data.guestEmail) {
    const [dup] = await adminDb
      .select({ id: pmsWaitlist.id })
      .from(pmsWaitlist)
      .where(
        and(
          eq(pmsWaitlist.tenantId, tenant.tenantId),
          eq(pmsWaitlist.propertyId, propertyId),
          eq(pmsWaitlist.guestEmail, parsed.data.guestEmail),
          eq(pmsWaitlist.status, 'waiting'),
        ),
      )
      .limit(1);

    if (dup) {
      return NextResponse.json({
        error: { code: 'DUPLICATE', message: 'You already have an active waitlist entry. Check your email for your status link.' },
      }, { status: 409 });
    }
  }

  const guestToken = generateUlid();

  const [created] = await adminDb
    .insert(pmsWaitlist)
    .values({
      tenantId: tenant.tenantId,
      propertyId,
      guestName: parsed.data.guestName,
      guestEmail: parsed.data.guestEmail ?? null,
      guestPhone: parsed.data.guestPhone ?? null,
      roomTypeId: parsed.data.roomTypeId ?? null,
      adults: parsed.data.adults,
      children: parsed.data.children,
      checkInDate: parsed.data.checkInDate ?? null,
      checkOutDate: parsed.data.checkOutDate ?? null,
      flexibility: parsed.data.flexibility,
      notes: parsed.data.notes ?? null,
      source: 'webapp',
      guestToken,
      priority: 0,
    })
    .returning({ id: pmsWaitlist.id });

  return NextResponse.json({
    data: {
      id: created!.id,
      guestToken,
      guestName: parsed.data.guestName,
    },
  }, { status: 201 });
}
