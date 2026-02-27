import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withAdminPermission } from '@/lib/with-admin-permission';
import { sql } from '@oppsera/db';
import { logAdminAudit, getClientIp } from '@/lib/admin-audit';
import { withAdminDb } from '@/lib/admin-db';

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
  let step: Record<string, unknown> | null = null;
  try {
    const rows = await withAdminDb(async (tx) => {
      return tx.execute(sql`
        SELECT id, status FROM tenant_onboarding_checklists
        WHERE tenant_id = ${tenantId} AND step_key = ${stepKey}
        LIMIT 1
      `);
    });
    const arr = Array.from(rows as Iterable<Record<string, unknown>>);
    if (arr.length === 0) {
      return NextResponse.json({ error: { message: 'Onboarding step not found' } }, { status: 404 });
    }
    step = arr[0]!;
  } catch {
    return NextResponse.json({
      error: { message: 'Onboarding tables not available. Run migration 0195 first.' },
    }, { status: 503 });
  }

  const beforeStatus = step.status as string;

  // Build update
  const setClauses = [
    sql`status = ${newStatus}`,
    sql`updated_at = NOW()`,
  ];

  if (newStatus === 'completed') {
    setClauses.push(sql`completed_at = NOW()`);
    setClauses.push(sql`completed_by = ${session.adminId}`);
  } else if (newStatus !== 'blocked') {
    setClauses.push(sql`completed_at = NULL`);
    setClauses.push(sql`completed_by = NULL`);
  }

  if (blockerNotes !== undefined) {
    setClauses.push(sql`blocker_notes = ${newStatus === 'blocked' ? blockerNotes.trim() : null}`);
  }

  await withAdminDb(async (tx) => {
    await tx.execute(sql`
      UPDATE tenant_onboarding_checklists
      SET ${sql.join(setClauses, sql`, `)}
      WHERE id = ${step!.id as string}
    `);
  });

  // Recompute tenant onboarding status
  let derivedStatus = 'in_progress';
  try {
    const allStepRows = await withAdminDb(async (tx) => {
      return tx.execute(sql`
        SELECT status FROM tenant_onboarding_checklists WHERE tenant_id = ${tenantId}
      `);
    });
    const allSteps = Array.from(allStepRows as Iterable<Record<string, unknown>>);
    const total = allSteps.length;
    const completed = allSteps.filter((s) => s.status === 'completed' || s.status === 'skipped').length;
    const blocked = allSteps.filter((s) => s.status === 'blocked').length;

    if (total > 0 && completed === total) derivedStatus = 'completed';
    else if (blocked > 0) derivedStatus = 'stalled';

    // Update tenant onboarding status (best-effort)
    try {
      await withAdminDb(async (tx) => {
        await tx.execute(sql`
          UPDATE tenants SET onboarding_status = ${derivedStatus}, updated_at = NOW()
          WHERE id = ${tenantId}
        `);
      });
    } catch {
      // Phase 1A columns don't exist — skip
    }
  } catch {
    // checklist table issue — skip status derivation
  }

  void logAdminAudit({
    session,
    action: 'tenant.onboarding.step_updated',
    entityType: 'onboarding_step',
    entityId: step.id as string,
    tenantId,
    beforeSnapshot: { stepKey, status: beforeStatus },
    afterSnapshot: { stepKey, status: newStatus, blockerNotes: blockerNotes ?? null },
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
