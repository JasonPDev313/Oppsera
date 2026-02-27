import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withAdminPermission } from '@/lib/with-admin-permission';
import { sql } from '@oppsera/db';
import { logAdminAudit, getClientIp } from '@/lib/admin-audit';
import { withAdminDb } from '@/lib/admin-db';

export const POST = withAdminPermission(async (req: NextRequest, session, params) => {
  const tenantId = params?.id;
  if (!tenantId) return NextResponse.json({ error: { message: 'Missing tenant ID' } }, { status: 400 });

  const body = await req.json().catch(() => ({}));

  // Verify tenant exists
  let tenantIndustry: string | null = null;
  try {
    const rows = await withAdminDb(async (tx) => {
      return tx.execute(sql`SELECT id, industry FROM tenants WHERE id = ${tenantId} LIMIT 1`);
    });
    const arr = Array.from(rows as Iterable<Record<string, unknown>>);
    if (arr.length === 0) {
      return NextResponse.json({ error: { message: 'Tenant not found' } }, { status: 404 });
    }
    tenantIndustry = (arr[0]!.industry as string) ?? null;
  } catch {
    // industry column doesn't exist — check with base query
    const rows = await withAdminDb(async (tx) => {
      return tx.execute(sql`SELECT id FROM tenants WHERE id = ${tenantId} LIMIT 1`);
    });
    if (Array.from(rows as Iterable<unknown>).length === 0) {
      return NextResponse.json({ error: { message: 'Tenant not found' } }, { status: 404 });
    }
  }

  const industry = (body.industry ?? tenantIndustry ?? 'general').trim();

  // Check if onboarding already initialized
  try {
    const existingRows = await withAdminDb(async (tx) => {
      return tx.execute(sql`
        SELECT id FROM tenant_onboarding_checklists WHERE tenant_id = ${tenantId} LIMIT 1
      `);
    });
    if (Array.from(existingRows as Iterable<unknown>).length > 0) {
      return NextResponse.json({
        error: { message: 'Onboarding already initialized. Delete existing steps first.' },
      }, { status: 409 });
    }
  } catch {
    return NextResponse.json({
      error: { message: 'Onboarding tables not available. Run migration 0195 first.' },
    }, { status: 503 });
  }

  // Load templates
  let templates: Array<Record<string, unknown>> = [];
  try {
    const rows = await withAdminDb(async (tx) => {
      return tx.execute(sql`
        SELECT step_key, step_label, step_group, sort_order
        FROM onboarding_step_templates
        WHERE industry = ${industry}
        ORDER BY sort_order
      `);
    });
    templates = Array.from(rows as Iterable<Record<string, unknown>>);

    if (templates.length === 0) {
      const generalRows = await withAdminDb(async (tx) => {
        return tx.execute(sql`
          SELECT step_key, step_label, step_group, sort_order
          FROM onboarding_step_templates
          WHERE industry = 'general'
          ORDER BY sort_order
        `);
      });
      templates = Array.from(generalRows as Iterable<Record<string, unknown>>);
    }
  } catch {
    return NextResponse.json({
      error: { message: 'Onboarding template tables not available. Run migration 0195 first.' },
    }, { status: 503 });
  }

  if (templates.length === 0) {
    return NextResponse.json({
      error: { message: `No onboarding templates found for industry "${industry}" or "general"` },
    }, { status: 404 });
  }

  // Create checklist items
  const created: Array<{ stepKey: string; stepLabel: string; stepGroup: string }> = [];

  await withAdminDb(async (tx) => {
    for (const tmpl of templates) {
      await tx.execute(sql`
        INSERT INTO tenant_onboarding_checklists (tenant_id, step_key, step_label, step_group, sort_order, status)
        VALUES (${tenantId}, ${tmpl.step_key as string}, ${tmpl.step_label as string}, ${tmpl.step_group as string}, ${tmpl.sort_order as number}, 'pending')
      `);
      created.push({
        stepKey: tmpl.step_key as string,
        stepLabel: tmpl.step_label as string,
        stepGroup: tmpl.step_group as string,
      });
    }

    // Update tenant industry and onboarding status (best-effort)
    try {
      await tx.execute(sql`
        UPDATE tenants SET industry = ${industry}, onboarding_status = 'in_progress', updated_at = NOW()
        WHERE id = ${tenantId}
      `);
    } catch {
      // Phase 1A columns don't exist — skip
    }
  });

  void logAdminAudit({
    session,
    action: 'tenant.onboarding.initialized',
    entityType: 'tenant',
    entityId: tenantId,
    tenantId,
    afterSnapshot: { industry, stepCount: created.length },
    ipAddress: getClientIp(req),
  });

  return NextResponse.json(
    { data: { tenantId, industry, stepsCreated: created.length, steps: created } },
    { status: 201 },
  );
}, { permission: 'tenants.write' });
