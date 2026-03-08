import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createAdminClient, pmsWaitlist, pmsRoomTypes, pmsProperties, pmsWaitlistConfig } from '@oppsera/db';
import { eq, and, sql } from 'drizzle-orm';
import { resolvePmsTenantBySlug } from '../../../../resolve-tenant';

/**
 * GET /api/v1/pms/public/[tenantSlug]/waitlist/status/[token]
 *
 * Public endpoint — guest checks their waitlist position.
 * No authentication required, identified by guest token.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ tenantSlug: string; token: string }> },
) {
  const { tenantSlug, token } = await params;
  const tenant = await resolvePmsTenantBySlug(tenantSlug);
  if (!tenant) {
    return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Not found' } }, { status: 404 });
  }

  const adminDb = createAdminClient();

  const [entry] = await adminDb
    .select({
      id: pmsWaitlist.id,
      guestName: pmsWaitlist.guestName,
      roomTypeId: pmsWaitlist.roomTypeId,
      roomTypeName: pmsRoomTypes.name,
      adults: pmsWaitlist.adults,
      children: pmsWaitlist.children,
      checkInDate: pmsWaitlist.checkInDate,
      checkOutDate: pmsWaitlist.checkOutDate,
      flexibility: pmsWaitlist.flexibility,
      status: pmsWaitlist.status,
      offeredRateCents: pmsWaitlist.offeredRateCents,
      offerExpiresAt: pmsWaitlist.offerExpiresAt,
      priority: pmsWaitlist.priority,
      propertyId: pmsWaitlist.propertyId,
      propertyName: pmsProperties.name,
      createdAt: pmsWaitlist.createdAt,
    })
    .from(pmsWaitlist)
    .leftJoin(pmsRoomTypes, eq(pmsWaitlist.roomTypeId, pmsRoomTypes.id))
    .leftJoin(pmsProperties, eq(pmsWaitlist.propertyId, pmsProperties.id))
    .where(
      and(
        eq(pmsWaitlist.tenantId, tenant.tenantId),
        eq(pmsWaitlist.guestToken, token),
      ),
    )
    .limit(1);

  if (!entry) {
    return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Entry not found' } }, { status: 404 });
  }

  // Get branding config
  const [config] = await adminDb
    .select({
      primaryColor: pmsWaitlistConfig.primaryColor,
      secondaryColor: pmsWaitlistConfig.secondaryColor,
      accentColor: pmsWaitlistConfig.accentColor,
      logoUrl: pmsWaitlistConfig.logoUrl,
      fontFamily: pmsWaitlistConfig.fontFamily,
    })
    .from(pmsWaitlistConfig)
    .where(and(eq(pmsWaitlistConfig.tenantId, tenant.tenantId), eq(pmsWaitlistConfig.propertyId, entry.propertyId)))
    .limit(1);

  // Calculate approximate position range (avoids leaking exact queue size)
  let positionRange: string | null = null;
  if (entry.status === 'waiting') {
    const [posResult] = await adminDb
      .select({
        cnt: sql<number>`count(*)::int`,
      })
      .from(pmsWaitlist)
      .where(
        and(
          eq(pmsWaitlist.tenantId, tenant.tenantId),
          eq(pmsWaitlist.propertyId, entry.propertyId),
          eq(pmsWaitlist.status, 'waiting'),
          sql`(${pmsWaitlist.priority} > ${entry.priority}
            OR (${pmsWaitlist.priority} = ${entry.priority} AND ${pmsWaitlist.createdAt} < ${entry.createdAt})
            OR (${pmsWaitlist.priority} = ${entry.priority} AND ${pmsWaitlist.createdAt} = ${entry.createdAt} AND ${pmsWaitlist.id} < ${entry.id}))`,
        ),
      );
    const exact = (posResult?.cnt ?? 0) + 1;
    // Bucket into ranges to avoid exposing exact queue size
    if (exact <= 3) positionRange = '1-3';
    else if (exact <= 5) positionRange = '4-5';
    else if (exact <= 10) positionRange = '6-10';
    else if (exact <= 20) positionRange = '11-20';
    else positionRange = '20+';
  }

  return NextResponse.json({
    data: {
      id: entry.id,
      guestName: entry.guestName,
      roomTypeName: entry.roomTypeName,
      adults: entry.adults,
      children: entry.children,
      checkInDate: entry.checkInDate,
      checkOutDate: entry.checkOutDate,
      flexibility: entry.flexibility,
      status: entry.status,
      offeredRateCents: entry.offeredRateCents,
      offerExpiresAt: entry.offerExpiresAt?.toISOString() ?? null,
      positionRange,
      propertyName: entry.propertyName ?? 'Property',
      createdAt: entry.createdAt.toISOString(),
      branding: {
        primaryColor: config?.primaryColor ?? '#6366f1',
        secondaryColor: config?.secondaryColor ?? '#3b82f6',
        accentColor: config?.accentColor ?? '#10b981',
        logoUrl: config?.logoUrl ?? null,
        fontFamily: config?.fontFamily ?? 'system-ui, sans-serif',
      },
    },
  });
}

/**
 * DELETE /api/v1/pms/public/[tenantSlug]/waitlist/status/[token]
 *
 * Guest cancels their waitlist entry.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ tenantSlug: string; token: string }> },
) {
  const { tenantSlug, token } = await params;
  const tenant = await resolvePmsTenantBySlug(tenantSlug);
  if (!tenant) {
    return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Not found' } }, { status: 404 });
  }

  const adminDb = createAdminClient();

  const [entry] = await adminDb
    .select({ id: pmsWaitlist.id, status: pmsWaitlist.status })
    .from(pmsWaitlist)
    .where(and(eq(pmsWaitlist.tenantId, tenant.tenantId), eq(pmsWaitlist.guestToken, token)))
    .limit(1);

  if (!entry) {
    return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Entry not found' } }, { status: 404 });
  }

  if (entry.status !== 'waiting' && entry.status !== 'offered') {
    return NextResponse.json({ error: { code: 'INVALID_STATE', message: 'Cannot cancel in current state' } }, { status: 400 });
  }

  await adminDb
    .update(pmsWaitlist)
    .set({ status: 'canceled', updatedAt: new Date() })
    .where(and(eq(pmsWaitlist.tenantId, tenant.tenantId), eq(pmsWaitlist.id, entry.id)));

  return NextResponse.json({ data: { status: 'canceled' } });
}

/**
 * POST /api/v1/pms/public/[tenantSlug]/waitlist/status/[token]
 *
 * Guest accepts or declines an offer.
 * Body: { action: 'accept' | 'decline' }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenantSlug: string; token: string }> },
) {
  const { tenantSlug, token } = await params;
  const tenant = await resolvePmsTenantBySlug(tenantSlug);
  if (!tenant) {
    return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Not found' } }, { status: 404 });
  }

  const body = await request.json();
  const action = body.action;

  const adminDb = createAdminClient();

  const [entry] = await adminDb
    .select({ id: pmsWaitlist.id, status: pmsWaitlist.status, offerExpiresAt: pmsWaitlist.offerExpiresAt })
    .from(pmsWaitlist)
    .where(and(eq(pmsWaitlist.tenantId, tenant.tenantId), eq(pmsWaitlist.guestToken, token)))
    .limit(1);

  if (!entry) {
    return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Entry not found' } }, { status: 404 });
  }

  if (entry.status !== 'offered') {
    return NextResponse.json({ error: { code: 'INVALID_STATE', message: 'No pending offer' } }, { status: 400 });
  }

  if (action === 'accept') {
    if (entry.offerExpiresAt && entry.offerExpiresAt < new Date()) {
      return NextResponse.json({ error: { code: 'EXPIRED', message: 'Offer has expired' } }, { status: 400 });
    }

    await adminDb
      .update(pmsWaitlist)
      .set({ status: 'booked', bookedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(pmsWaitlist.tenantId, tenant.tenantId), eq(pmsWaitlist.id, entry.id)));

    return NextResponse.json({ data: { status: 'booked' } });
  }

  if (action === 'decline') {
    await adminDb
      .update(pmsWaitlist)
      .set({
        status: 'waiting',
        offeredReservationId: null,
        offeredRateCents: null,
        offerExpiresAt: null,
        updatedAt: new Date(),
      })
      .where(and(eq(pmsWaitlist.tenantId, tenant.tenantId), eq(pmsWaitlist.id, entry.id)));

    return NextResponse.json({ data: { status: 'waiting' } });
  }

  return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: 'action must be accept or decline' } }, { status: 400 });
}
