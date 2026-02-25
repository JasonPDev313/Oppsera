import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withAdminPermission } from '@/lib/with-admin-permission';
import { db } from '@oppsera/db';
import { tenants, tenantOnboardingChecklists, onboardingStepTemplates } from '@oppsera/db';
import { eq } from 'drizzle-orm';
import { logAdminAudit, getClientIp } from '@/lib/admin-audit';

export const POST = withAdminPermission(async (req: NextRequest, session, params) => {
  const tenantId = params?.id;
  if (!tenantId) return NextResponse.json({ error: { message: 'Missing tenant ID' } }, { status: 400 });

  const body = await req.json().catch(() => ({}));

  // Get tenant (need industry)
  const [tenant] = await db
    .select({ id: tenants.id, industry: tenants.industry, onboardingStatus: tenants.onboardingStatus })
    .from(tenants)
    .where(eq(tenants.id, tenantId));

  if (!tenant) {
    return NextResponse.json({ error: { message: 'Tenant not found' } }, { status: 404 });
  }

  const industry = (body.industry ?? tenant.industry ?? 'general').trim();

  // Check if onboarding already initialized
  const existingSteps = await db
    .select({ id: tenantOnboardingChecklists.id })
    .from(tenantOnboardingChecklists)
    .where(eq(tenantOnboardingChecklists.tenantId, tenantId))
    .limit(1);

  if (existingSteps.length > 0) {
    return NextResponse.json({
      error: { message: 'Onboarding already initialized. Delete existing steps first.' },
    }, { status: 409 });
  }

  // Load templates for the industry
  const templates = await db
    .select()
    .from(onboardingStepTemplates)
    .where(eq(onboardingStepTemplates.industry, industry))
    .orderBy(onboardingStepTemplates.sortOrder);

  if (templates.length === 0) {
    // Fall back to 'general' templates
    const generalTemplates = await db
      .select()
      .from(onboardingStepTemplates)
      .where(eq(onboardingStepTemplates.industry, 'general'))
      .orderBy(onboardingStepTemplates.sortOrder);

    if (generalTemplates.length === 0) {
      return NextResponse.json({
        error: { message: `No onboarding templates found for industry "${industry}" or "general"` },
      }, { status: 404 });
    }

    templates.push(...generalTemplates);
  }

  // Create checklist items
  const created: Array<{ stepKey: string; stepLabel: string; stepGroup: string }> = [];

  await db.transaction(async (tx) => {
    for (const tmpl of templates) {
      await tx.insert(tenantOnboardingChecklists).values({
        tenantId,
        stepKey: tmpl.stepKey,
        stepLabel: tmpl.stepLabel,
        stepGroup: tmpl.stepGroup,
        sortOrder: tmpl.sortOrder,
        status: 'pending',
      });
      created.push({ stepKey: tmpl.stepKey, stepLabel: tmpl.stepLabel, stepGroup: tmpl.stepGroup });
    }

    // Update tenant industry and onboarding status
    await tx.update(tenants).set({
      industry,
      onboardingStatus: 'in_progress',
      updatedAt: new Date(),
    }).where(eq(tenants.id, tenantId));
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
