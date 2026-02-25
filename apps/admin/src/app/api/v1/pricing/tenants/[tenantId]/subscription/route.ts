import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { db, sql, tenants, tenantSubscriptions, subscriptionChangeLog, pricingPlans } from '@oppsera/db';
import { eq } from 'drizzle-orm';
import { generateUlid, computeMonthlyTotal, classifyTierChange } from '@oppsera/shared';
import type { BusinessTier } from '@oppsera/shared';
import { withAdminAuth } from '@/lib/with-admin-auth';

// GET /api/v1/pricing/tenants/[tenantId]/subscription
export const GET = withAdminAuth(async (_req: NextRequest, _session, params) => {
  const tenantId = params?.tenantId;
  if (!tenantId) {
    return NextResponse.json({ error: { message: 'Missing tenant ID' } }, { status: 400 });
  }

  // Fetch subscription joined with plan + tenant name
  const subRows = await db.execute(sql`
    SELECT
      s.*,
      p.tier, p.display_name AS plan_display_name, p.price_per_seat_cents,
      p.max_seats, p.base_fee_cents, p.is_active AS plan_is_active,
      p.features, p.sort_order,
      t.name AS tenant_name
    FROM tenant_subscriptions s
    JOIN pricing_plans p ON p.id = s.pricing_plan_id
    JOIN tenants t ON t.id = s.tenant_id
    WHERE s.tenant_id = ${tenantId}
    LIMIT 1
  `);

  const subItems = Array.from(subRows as Iterable<Record<string, unknown>>);

  // Count active seats (users with active memberships)
  const seatRows = await db.execute(sql`
    SELECT COUNT(*)::int AS cnt
    FROM memberships
    WHERE tenant_id = ${tenantId} AND status = 'active'
  `);
  const seatItems = Array.from(seatRows as Iterable<Record<string, unknown>>);
  const activeSeats = (seatItems[0]?.cnt as number) ?? 0;

  // Fetch change log
  const logRows = await db.execute(sql`
    SELECT * FROM subscription_change_log
    WHERE tenant_id = ${tenantId}
    ORDER BY created_at DESC
    LIMIT 20
  `);
  const logItems = Array.from(logRows as Iterable<Record<string, unknown>>).map((r) => ({
    id: r.id as string,
    tenantId: r.tenant_id as string,
    changedBy: r.changed_by as string,
    changeType: r.change_type as string,
    previousState: r.previous_state as Record<string, unknown> | null,
    newState: r.new_state as Record<string, unknown> | null,
    reason: r.reason as string | null,
    createdAt: (r.created_at as Date).toISOString(),
  }));

  if (subItems.length === 0) {
    return NextResponse.json({
      data: { subscription: null, changeLog: logItems },
    });
  }

  const r = subItems[0]!;
  const subscription = {
    id: r.id as string,
    tenantId: r.tenant_id as string,
    tenantName: r.tenant_name as string,
    plan: {
      id: r.pricing_plan_id as string,
      tier: r.tier as string,
      displayName: r.plan_display_name as string,
      pricePerSeatCents: r.price_per_seat_cents as number,
      maxSeats: r.max_seats as number | null,
      baseFeeCents: r.base_fee_cents as number,
      isActive: r.plan_is_active as boolean,
      features: r.features as string[],
      sortOrder: r.sort_order as number,
      tenantCount: 0,
    },
    seatCount: r.seat_count as number,
    activeSeatCount: activeSeats,
    monthlyTotalCents: r.monthly_total_cents as number,
    status: r.status as string,
    trialEndsAt: r.trial_ends_at ? (r.trial_ends_at as Date).toISOString() : null,
    currentPeriodStart: (r.current_period_start as Date).toISOString(),
    currentPeriodEnd: r.current_period_end ? (r.current_period_end as Date).toISOString() : null,
    addonModuleKeys: (r.addon_module_keys as string[]) ?? [],
    addonCostCents: 0,
    notes: r.notes as string | null,
    createdAt: (r.created_at as Date).toISOString(),
    updatedAt: (r.updated_at as Date).toISOString(),
  };

  return NextResponse.json({
    data: { subscription, changeLog: logItems },
  });
}, 'viewer');

// POST /api/v1/pricing/tenants/[tenantId]/subscription — create initial subscription
export const POST = withAdminAuth(async (req: NextRequest, session, params) => {
  const tenantId = params?.tenantId;
  if (!tenantId) {
    return NextResponse.json({ error: { message: 'Missing tenant ID' } }, { status: 400 });
  }

  const body = await req.json();
  const { pricingPlanId, seatCount = 1, reason = 'Initial subscription' } = body;

  if (!pricingPlanId) {
    return NextResponse.json({ error: { message: 'pricingPlanId is required' } }, { status: 400 });
  }

  // Check for existing
  const existing = await db
    .select({ id: tenantSubscriptions.id })
    .from(tenantSubscriptions)
    .where(eq(tenantSubscriptions.tenantId, tenantId))
    .limit(1);

  if (existing.length > 0) {
    return NextResponse.json(
      { error: { message: 'Subscription already exists. Use PATCH to change it.' } },
      { status: 409 },
    );
  }

  // Fetch plan
  const [plan] = await db
    .select()
    .from(pricingPlans)
    .where(eq(pricingPlans.id, pricingPlanId))
    .limit(1);

  if (!plan) {
    return NextResponse.json({ error: { message: 'Plan not found' } }, { status: 404 });
  }

  // Validate seat count against plan max
  if (plan.maxSeats && seatCount > plan.maxSeats) {
    return NextResponse.json(
      { error: { message: `Seat count ${seatCount} exceeds plan max of ${plan.maxSeats}` } },
      { status: 400 },
    );
  }

  const monthlyTotal = computeMonthlyTotal(seatCount, plan.pricePerSeatCents, plan.baseFeeCents, 0);
  const now = new Date();
  const subId = generateUlid();

  // Insert subscription
  await db.insert(tenantSubscriptions).values({
    id: subId,
    tenantId,
    pricingPlanId,
    seatCount,
    monthlyTotalCents: monthlyTotal,
    status: 'active',
    currentPeriodStart: now,
  });

  // Update tenant business_tier to match plan tier
  await db
    .update(tenants)
    .set({
      businessTier: plan.tier,
      tierOverride: true,
      tierOverrideReason: `Subscription assigned by admin: ${reason}`,
      updatedAt: now,
    })
    .where(eq(tenants.id, tenantId));

  // Update entitlements.limits.max_seats for platform_core
  const maxSeats = plan.maxSeats;
  if (maxSeats) {
    await db.execute(sql`
      UPDATE entitlements
      SET limits = jsonb_set(COALESCE(limits, '{}'::jsonb), '{max_seats}', ${String(maxSeats)}::jsonb),
          updated_at = now()
      WHERE tenant_id = ${tenantId} AND module_key = 'platform_core'
    `);
  } else {
    // Unlimited — remove max_seats limit
    await db.execute(sql`
      UPDATE entitlements
      SET limits = COALESCE(limits, '{}'::jsonb) - 'max_seats',
          updated_at = now()
      WHERE tenant_id = ${tenantId} AND module_key = 'platform_core'
    `);
  }

  // Log change
  await db.insert(subscriptionChangeLog).values({
    id: generateUlid(),
    tenantId,
    changedBy: `admin:${session.adminId}`,
    changeType: 'subscription_created',
    previousState: null,
    newState: { planId: pricingPlanId, tier: plan.tier, seatCount, monthlyTotalCents: monthlyTotal } as Record<string, unknown>,
    reason,
  });

  return NextResponse.json(
    {
      data: {
        id: subId,
        tenantId,
        tenantName: '',
        plan: {
          id: plan.id,
          tier: plan.tier,
          displayName: plan.displayName,
          pricePerSeatCents: plan.pricePerSeatCents,
          maxSeats: plan.maxSeats,
          baseFeeCents: plan.baseFeeCents,
          isActive: plan.isActive,
          features: plan.features as string[],
          sortOrder: plan.sortOrder,
          tenantCount: 0,
        },
        seatCount,
        activeSeatCount: 0,
        monthlyTotalCents: monthlyTotal,
        status: 'active',
        trialEndsAt: null,
        currentPeriodStart: now.toISOString(),
        currentPeriodEnd: null,
        addonModuleKeys: [],
        addonCostCents: 0,
        notes: null,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      },
    },
    { status: 201 },
  );
}, 'admin');

// PATCH /api/v1/pricing/tenants/[tenantId]/subscription — change plan, seats, or addons
export const PATCH = withAdminAuth(async (req: NextRequest, session, params) => {
  const tenantId = params?.tenantId;
  if (!tenantId) {
    return NextResponse.json({ error: { message: 'Missing tenant ID' } }, { status: 400 });
  }

  const body = await req.json();
  const { reason } = body;
  if (!reason) {
    return NextResponse.json({ error: { message: 'reason is required' } }, { status: 400 });
  }

  // Load current subscription
  const [current] = await db
    .select()
    .from(tenantSubscriptions)
    .where(eq(tenantSubscriptions.tenantId, tenantId))
    .limit(1);

  if (!current) {
    return NextResponse.json(
      { error: { message: 'No subscription found. Use POST to create one.' } },
      { status: 404 },
    );
  }

  // Determine what's changing
  const newPlanId = body.pricingPlanId ?? current.pricingPlanId;
  const newSeatCount = body.seatCount ?? current.seatCount;
  const newAddons = body.addonModuleKeys ?? current.addonModuleKeys;
  const newStatus = body.status ?? current.status;
  const newNotes = body.notes !== undefined ? body.notes : current.notes;

  // Fetch new plan
  const [newPlan] = await db
    .select()
    .from(pricingPlans)
    .where(eq(pricingPlans.id, newPlanId))
    .limit(1);

  if (!newPlan) {
    return NextResponse.json({ error: { message: 'Plan not found' } }, { status: 404 });
  }

  // Validate seat count against plan max
  if (newPlan.maxSeats && newSeatCount > newPlan.maxSeats) {
    return NextResponse.json(
      { error: { message: `Seat count ${newSeatCount} exceeds plan max of ${newPlan.maxSeats}` } },
      { status: 400 },
    );
  }

  // Compute new monthly total
  const monthlyTotal = computeMonthlyTotal(
    newSeatCount,
    newPlan.pricePerSeatCents,
    newPlan.baseFeeCents,
    0, // TODO: compute addon costs when module pricing is wired
  );

  // Determine change type
  let changeType = 'seat_change';
  if (newPlanId !== current.pricingPlanId) {
    // Fetch old plan to compare tiers
    const [oldPlan] = await db
      .select()
      .from(pricingPlans)
      .where(eq(pricingPlans.id, current.pricingPlanId))
      .limit(1);

    if (oldPlan) {
      const direction = classifyTierChange(
        oldPlan.tier as BusinessTier,
        newPlan.tier as BusinessTier,
      );
      changeType = direction === 'upgrade' ? 'tier_upgrade' : direction === 'downgrade' ? 'tier_downgrade' : 'seat_change';
    }
  }
  if (JSON.stringify(newAddons) !== JSON.stringify(current.addonModuleKeys)) {
    changeType = 'addon_change';
  }

  const previousState = {
    planId: current.pricingPlanId,
    seatCount: current.seatCount,
    monthlyTotalCents: current.monthlyTotalCents,
    addons: current.addonModuleKeys,
    status: current.status,
  };

  const now = new Date();

  // Update subscription
  await db
    .update(tenantSubscriptions)
    .set({
      pricingPlanId: newPlanId,
      seatCount: newSeatCount,
      monthlyTotalCents: monthlyTotal,
      addonModuleKeys: newAddons,
      status: newStatus,
      notes: newNotes,
      updatedAt: now,
    })
    .where(eq(tenantSubscriptions.tenantId, tenantId));

  // Update tenant tier if plan changed
  if (newPlanId !== current.pricingPlanId) {
    await db
      .update(tenants)
      .set({
        businessTier: newPlan.tier,
        tierOverride: true,
        tierOverrideReason: `Plan changed by admin: ${reason}`,
        updatedAt: now,
      })
      .where(eq(tenants.id, tenantId));
  }

  // Update seat limit in entitlements
  if (newPlan.maxSeats) {
    await db.execute(sql`
      UPDATE entitlements
      SET limits = jsonb_set(COALESCE(limits, '{}'::jsonb), '{max_seats}', ${String(newPlan.maxSeats)}::jsonb),
          updated_at = now()
      WHERE tenant_id = ${tenantId} AND module_key = 'platform_core'
    `);
  } else {
    await db.execute(sql`
      UPDATE entitlements
      SET limits = COALESCE(limits, '{}'::jsonb) - 'max_seats',
          updated_at = now()
      WHERE tenant_id = ${tenantId} AND module_key = 'platform_core'
    `);
  }

  const newState = {
    planId: newPlanId,
    tier: newPlan.tier,
    seatCount: newSeatCount,
    monthlyTotalCents: monthlyTotal,
    addons: newAddons,
    status: newStatus,
  };

  // Log change
  await db.insert(subscriptionChangeLog).values({
    id: generateUlid(),
    tenantId,
    changedBy: `admin:${session.adminId}`,
    changeType,
    previousState: previousState as Record<string, unknown>,
    newState: newState as Record<string, unknown>,
    reason,
  });

  return NextResponse.json({
    data: {
      id: current.id,
      tenantId,
      tenantName: '',
      plan: {
        id: newPlan.id,
        tier: newPlan.tier,
        displayName: newPlan.displayName,
        pricePerSeatCents: newPlan.pricePerSeatCents,
        maxSeats: newPlan.maxSeats,
        baseFeeCents: newPlan.baseFeeCents,
        isActive: newPlan.isActive,
        features: newPlan.features as string[],
        sortOrder: newPlan.sortOrder,
        tenantCount: 0,
      },
      seatCount: newSeatCount,
      activeSeatCount: 0,
      monthlyTotalCents: monthlyTotal,
      status: newStatus,
      trialEndsAt: null,
      currentPeriodStart: current.currentPeriodStart?.toISOString() ?? now.toISOString(),
      currentPeriodEnd: null,
      addonModuleKeys: newAddons ?? [],
      addonCostCents: 0,
      notes: newNotes,
      createdAt: current.createdAt?.toISOString() ?? now.toISOString(),
      updatedAt: now.toISOString(),
    },
  });
}, 'admin');
