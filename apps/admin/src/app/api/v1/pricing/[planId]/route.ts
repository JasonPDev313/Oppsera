import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { db, pricingPlans } from '@oppsera/db';
import { eq } from 'drizzle-orm';
import { withAdminAuth } from '@/lib/with-admin-auth';

// PATCH /api/v1/pricing/[planId] — update a pricing plan
export const PATCH = withAdminAuth(async (req: NextRequest, _session, params) => {
  const planId = params?.planId;
  if (!planId) {
    return NextResponse.json({ error: { message: 'Missing plan ID' } }, { status: 400 });
  }

  const body = await req.json();
  const updates: Record<string, unknown> = { updatedAt: new Date() };

  if (body.pricePerSeatCents !== undefined) updates.pricePerSeatCents = body.pricePerSeatCents;
  if (body.maxSeats !== undefined) updates.maxSeats = body.maxSeats;
  if (body.baseFeeCents !== undefined) updates.baseFeeCents = body.baseFeeCents;
  if (body.features !== undefined) updates.features = body.features;
  if (body.isActive !== undefined) updates.isActive = body.isActive;

  const [updated] = await db
    .update(pricingPlans)
    .set(updates)
    .where(eq(pricingPlans.id, planId))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: { message: 'Plan not found' } }, { status: 404 });
  }

  return NextResponse.json({
    data: {
      id: updated.id,
      tier: updated.tier,
      displayName: updated.displayName,
      pricePerSeatCents: updated.pricePerSeatCents,
      maxSeats: updated.maxSeats,
      baseFeeCents: updated.baseFeeCents,
      isActive: updated.isActive,
      features: updated.features as string[],
      sortOrder: updated.sortOrder,
      tenantCount: 0,
    },
  });
}, 'super_admin');
