import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withAdminPermission } from '@/lib/with-admin-permission';
import { db, sql } from '@oppsera/db';
import { tenants, tenantOnboardingChecklists } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';
import { logAdminAudit, getClientIp } from '@/lib/admin-audit';

const VALID_STATUSES = ['pending', 'in_progress', 'completed', 'skipped', 'blocked'] as const;

export const PATCH = withAdminPermission(async (req: NextRequest, session, params) => {
  const tenantId = params?.id;
  const stepKey = params?.stepKey;
  if (!tenantId || !stepKey) {
    return NextResponse.json({ error: { message: 'Missing tenant ID or step key' } }, { status: 400 });
  }

  const body = await req.json();
  const newStatus = body.status as string | undefined;
  const blockerNotes = body.blockerNotes as string | undefined;

  if (!newStatus || !VALID_STATUSES.includes(newStatus as typeof VALID_STATUSES[number])) {
    return NextResponse.json({
      error: { message: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` },
    }, { status: 400 });
  }

  if (newStatus === 'blocked' && !blockerNotes?.trim()) {
    return NextResponse.json({
      error: { message: 'Blocker notes are required when setting status to blocked' },
    }, { status: 400 });
  }

  // Find the onboarding step
  const rows = await db
    .select()
    .from(tenantOnboardingChecklists)
    .where(
      and(
        eq(tenantOnboardingChecklists.tenantId, tenantId),
        eq(tenantOnboardingChecklists.stepKey, stepKey),
      ),
    );

  if (rows.length === 0) {
    return NextResponse.json({ error: { message: 'Onboarding step not found' } }, { status: 404 });
  }

  const step = rows[0]!;
  const beforeStatus = step.status;

  const updates: Record<string, unknown> = {
    status: newStatus,
    updatedAt: new Date(),
  };

  if (newStatus === 'completed') {
    updates.completedAt = new Date();
    updates.completedBy = session.adminId;
  } else if (newStatus !== 'blocked') {
    updates.completedAt = null;
    updates.completedBy = null;
  }

  if (blockerNotes !== undefined) {
    updates.blockerNotes = newStatus === 'blocked' ? blockerNotes.trim() : null;
  }

  await db
    .update(tenantOnboardingChecklists)
    .set(updates)
    .where(eq(tenantOnboardingChecklists.id, step.id));

  // Recompute tenant onboarding status
  const allSteps = await db
    .select({ status: tenantOnboardingChecklists.status })
    .from(tenantOnboardingChecklists)
    .where(eq(tenantOnboardingChecklists.tenantId, tenantId));

  const total = allSteps.length;
  const completed = allSteps.filter((s) => s.status === 'completed' || s.status === 'skipped').length;
  const blocked = allSteps.filter((s) => s.status === 'blocked').length;

  let derivedStatus = 'in_progress';
  if (total > 0 && completed === total) derivedStatus = 'completed';
  else if (blocked > 0) derivedStatus = 'stalled';

  await db.update(tenants).set({ onboardingStatus: derivedStatus, updatedAt: new Date() }).where(eq(tenants.id, tenantId));

  void logAdminAudit({
    session,
    action: 'tenant.onboarding.step_updated',
    entityType: 'onboarding_step',
    entityId: step.id,
    tenantId,
    beforeSnapshot: { stepKey, status: beforeStatus },
    afterSnapshot: { stepKey, status: newStatus, blockerNotes: updates.blockerNotes ?? null },
    ipAddress: getClientIp(req),
  });

  return NextResponse.json({
    data: {
      stepKey,
      status: newStatus,
      onboardingStatus: derivedStatus,
    },
  });
}, { permission: 'tenants.write' });
