import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withAdminPermission } from '@/lib/with-admin-permission';
import { sql } from '@oppsera/db';
import { withAdminDb } from '@/lib/admin-db';

export const GET = withAdminPermission(async (req: NextRequest, _session, params) => {
  const id = params?.id;
  if (!id) return NextResponse.json({ error: { message: 'Missing tenant ID' } }, { status: 400 });

  try {
    const ts = (v: unknown) => v instanceof Date ? v.toISOString() : v ? String(v) : null;

    // Try fetching tenant with Phase 1A columns
    let onboardingStatus = 'pending';
    let industry: string | null = null;
    try {
      const tenantRows = await withAdminDb(async (tx) => {
        return tx.execute(sql`
          SELECT onboarding_status, industry FROM tenants WHERE id = ${id} LIMIT 1
        `);
      });
      const tenantArr = Array.from(tenantRows as Iterable<Record<string, unknown>>);
      if (tenantArr.length === 0) {
        return NextResponse.json({ error: { message: 'Tenant not found' } }, { status: 404 });
      }
      onboardingStatus = (tenantArr[0]!.onboarding_status as string) ?? 'pending';
      industry = (tenantArr[0]!.industry as string) ?? null;
    } catch {
      // Phase 1A columns don't exist — verify tenant exists with base query
      const baseRows = await withAdminDb(async (tx) => {
        return tx.execute(sql`SELECT id FROM tenants WHERE id = ${id} LIMIT 1`);
      });
      if (Array.from(baseRows as Iterable<unknown>).length === 0) {
        return NextResponse.json({ error: { message: 'Tenant not found' } }, { status: 404 });
      }
    }

    // Try fetching checklist steps
    let steps: Array<Record<string, unknown>> = [];
    try {
      const rows = await withAdminDb(async (tx) => {
        return tx.execute(sql`
          SELECT id, tenant_id, step_key, step_label, step_group, status,
                 sort_order, completed_at, completed_by, blocker_notes, metadata,
                 created_at, updated_at
          FROM tenant_onboarding_checklists
          WHERE tenant_id = ${id}
          ORDER BY sort_order
        `);
      });
      steps = Array.from(rows as Iterable<Record<string, unknown>>);
    } catch {
      // Table doesn't exist yet — return empty
    }

    const mappedSteps = steps.map((r) => ({
      id: r.id as string,
      tenantId: r.tenant_id as string,
      stepKey: r.step_key as string,
      stepLabel: r.step_label as string,
      stepGroup: r.step_group as string,
      status: r.status as string,
      sortOrder: Number(r.sort_order),
      completedAt: ts(r.completed_at),
      completedBy: (r.completed_by as string) ?? null,
      blockerNotes: (r.blocker_notes as string) ?? null,
      metadata: (r.metadata as Record<string, unknown>) ?? {},
      createdAt: ts(r.created_at) ?? '',
      updatedAt: ts(r.updated_at) ?? '',
    }));

    const total = mappedSteps.length;
    const completed = mappedSteps.filter((s) => s.status === 'completed').length;
    const blocked = mappedSteps.filter((s) => s.status === 'blocked').length;
    const skipped = mappedSteps.filter((s) => s.status === 'skipped').length;

    return NextResponse.json({
      data: {
        tenantId: id,
        onboardingStatus,
        industry,
        summary: { total, completed, blocked, skipped, progress: total > 0 ? Math.round((completed / total) * 100) : 0 },
        steps: mappedSteps,
      },
    });
  } catch (err) {
    console.error('[onboarding/GET] Error:', (err as Error).message);
    return NextResponse.json({ error: { message: 'Failed to load onboarding data' } }, { status: 500 });
  }
}, { permission: 'tenants.read' });
