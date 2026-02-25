import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withAdminPermission } from '@/lib/with-admin-permission';
import { db, sql } from '@oppsera/db';
import { tenants, tenantOnboardingChecklists } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';

export const GET = withAdminPermission(async (req: NextRequest, _session, params) => {
  const id = params?.id;
  if (!id) return NextResponse.json({ error: { message: 'Missing tenant ID' } }, { status: 400 });

  // Verify tenant exists
  const [tenant] = await db
    .select({ id: tenants.id, onboardingStatus: tenants.onboardingStatus, industry: tenants.industry })
    .from(tenants)
    .where(eq(tenants.id, id));

  if (!tenant) {
    return NextResponse.json({ error: { message: 'Tenant not found' } }, { status: 404 });
  }

  const rows = await db
    .select()
    .from(tenantOnboardingChecklists)
    .where(eq(tenantOnboardingChecklists.tenantId, id))
    .orderBy(tenantOnboardingChecklists.sortOrder);

  const ts = (v: unknown) => v instanceof Date ? v.toISOString() : v ? String(v) : null;

  const steps = rows.map((r) => ({
    id: r.id,
    tenantId: r.tenantId,
    stepKey: r.stepKey,
    stepLabel: r.stepLabel,
    stepGroup: r.stepGroup,
    status: r.status,
    sortOrder: r.sortOrder,
    completedAt: ts(r.completedAt),
    completedBy: r.completedBy ?? null,
    blockerNotes: r.blockerNotes ?? null,
    metadata: (r.metadata as Record<string, unknown>) ?? {},
    createdAt: ts(r.createdAt) ?? '',
    updatedAt: ts(r.updatedAt) ?? '',
  }));

  // Compute summary
  const total = steps.length;
  const completed = steps.filter((s) => s.status === 'completed').length;
  const blocked = steps.filter((s) => s.status === 'blocked').length;
  const skipped = steps.filter((s) => s.status === 'skipped').length;

  return NextResponse.json({
    data: {
      tenantId: id,
      onboardingStatus: tenant.onboardingStatus,
      industry: tenant.industry ?? null,
      summary: { total, completed, blocked, skipped, progress: total > 0 ? Math.round((completed / total) * 100) : 0 },
      steps,
    },
  });
}, { permission: 'tenants.read' });
