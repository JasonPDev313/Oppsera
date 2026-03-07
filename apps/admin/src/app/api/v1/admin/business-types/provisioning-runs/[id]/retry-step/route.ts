import { NextResponse } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { createAdminClient } from '@oppsera/db';
import { generateUlid } from '@oppsera/shared';
import { withAdminPermission } from '@/lib/with-admin-permission';
import {
  getProvisioningRun,
  listProvisioningRunSteps,
  getDomain,
  getRegisteredDomains,
  tenantProvisioningRuns,
  tenantProvisioningRunSteps,
} from '@oppsera/module-business-types';
import { logAdminAudit, getClientIp } from '@/lib/admin-audit';

// Import to ensure domain executors are registered
import '@oppsera/module-business-types/provisioning';

const retrySchema = z.object({
  domainKey: z.string().min(1),
});

export const POST = withAdminPermission(
  async (req, session, params) => {
    const id = params?.id;
    if (!id) return NextResponse.json({ error: { code: 'BAD_REQUEST', message: 'Missing id' } }, { status: 400 });

    const body = await req.json();
    const parsed = retrySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: parsed.error.issues } },
        { status: 400 },
      );
    }

    const run = await getProvisioningRun(id);
    if (!run) {
      return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Provisioning run not found' } }, { status: 404 });
    }

    if (run.status !== 'failed' && run.status !== 'partial') {
      return NextResponse.json(
        { error: { code: 'CONFLICT', message: 'Can only retry failed or partial runs' } },
        { status: 409 },
      );
    }

    const executor = getDomain(parsed.data.domainKey);
    if (!executor) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: `No executor for domain: ${parsed.data.domainKey}` } },
        { status: 404 },
      );
    }

    const steps = await listProvisioningRunSteps(id);
    const existingStep = steps.find((s) => s.domainKey === parsed.data.domainKey);

    const db = createAdminClient();

    // Determine if this is a retry of a failed step or a resume of a skipped domain
    let stepId: string;

    if (existingStep) {
      // Retry path: step exists, must be in failed state
      if (existingStep.status !== 'failed') {
        return NextResponse.json(
          { error: { code: 'CONFLICT', message: 'Can only retry failed steps' } },
          { status: 409 },
        );
      }
      stepId = existingStep.id;

      await db
        .update(tenantProvisioningRunSteps)
        .set({ status: 'running', errorMessage: null, startedAt: new Date() })
        .where(eq(tenantProvisioningRunSteps.id, stepId));
    } else {
      // Resume path: domain was skipped during original run (no step record exists)
      stepId = generateUlid();
      const now = new Date();

      await db.insert(tenantProvisioningRunSteps).values({
        id: stepId,
        provisioningRunId: id,
        domainKey: parsed.data.domainKey,
        status: 'running',
        startedAt: now,
        createdAt: now,
      });
    }

    try {
      // Validate before provisioning
      const validation = await executor.validate(run.businessTypeVersionId);
      if (!validation.isValid) {
        await db
          .update(tenantProvisioningRunSteps)
          .set({
            status: 'failed',
            detailsJson: { validationErrors: validation.errors },
            errorMessage: `Validation failed: ${validation.errors.join('; ')}`,
            completedAt: new Date(),
          })
          .where(eq(tenantProvisioningRunSteps.id, stepId));

        return NextResponse.json({
          data: { success: false, details: { validationErrors: validation.errors } },
        });
      }

      const result = await executor.provision({
        tenantId: run.tenantId,
        businessTypeId: run.businessTypeId,
        versionId: run.businessTypeVersionId,
        runId: run.id,
        adminUserId: session.adminId,
      });

      await db
        .update(tenantProvisioningRunSteps)
        .set({
          status: result.success ? 'success' : 'failed',
          detailsJson: result.details,
          errorMessage: result.error ?? null,
          completedAt: new Date(),
        })
        .where(eq(tenantProvisioningRunSteps.id, stepId));

      // Recalculate run status from all steps, accounting for still-skipped domains
      const allSteps = await listProvisioningRunSteps(id);
      const registeredDomains = getRegisteredDomains();
      const executedDomainKeys = new Set(allSteps.map((s) => s.domainKey));
      const hasSkippedDomains = registeredDomains.some((d) => !executedDomainKeys.has(d.domainKey));
      const allSuccess = !hasSkippedDomains && allSteps.every((s) => s.status === 'success');
      const anyFailed = allSteps.some((s) => s.status === 'failed');

      const newStatus = allSuccess ? 'success' : anyFailed ? 'failed' : hasSkippedDomains ? 'partial' : 'success';

      await db
        .update(tenantProvisioningRuns)
        .set({
          status: newStatus,
          errorSummary: anyFailed
            ? 'Some domains failed'
            : hasSkippedDomains
              ? 'Some domains not yet executed'
              : null,
          updatedAt: new Date(),
        })
        .where(eq(tenantProvisioningRuns.id, id));

      await logAdminAudit({
        session,
        action: existingStep ? 'provisioning.step_retried' : 'provisioning.skipped_step_run',
        entityType: 'provisioning_run',
        entityId: id,
        afterSnapshot: { domainKey: parsed.data.domainKey, result: result.success ? 'success' : 'failed' },
        ipAddress: getClientIp(req) ?? undefined,
      });

      return NextResponse.json({ data: { success: result.success, details: result.details } });
    } catch (err) {
      await db
        .update(tenantProvisioningRunSteps)
        .set({
          status: 'failed',
          errorMessage: (err as Error).message,
          completedAt: new Date(),
        })
        .where(eq(tenantProvisioningRunSteps.id, stepId));

      throw err;
    }
  },
  { permission: 'system.business_types.edit' },
);
