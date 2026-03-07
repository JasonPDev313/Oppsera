import { eq, and } from 'drizzle-orm';
import { createAdminClient, erpWorkflowConfigs, erpWorkflowConfigChangeLog } from '@oppsera/db';
import { generateUlid } from '@oppsera/shared';
import { businessTypeAccountingTemplates } from '../../schema';
import type { BlueprintDomainExecutor, ProvisioningContext, DomainProvisionResult, DomainValidationResult } from '../domain-registry';

interface WorkflowConfig {
  autoMode: boolean;
  approvalRequired: boolean;
  userVisible: boolean;
}

export const accountingExecutor: BlueprintDomainExecutor = {
  domainKey: 'accounting',
  isCritical: true,

  async validate(versionId: string): Promise<DomainValidationResult> {
    const db = createAdminClient();
    const [acct] = await db
      .select()
      .from(businessTypeAccountingTemplates)
      .where(eq(businessTypeAccountingTemplates.businessTypeVersionId, versionId))
      .limit(1);

    const errors: string[] = [];
    if (!acct) {
      errors.push('No accounting template configured');
    } else if (acct.validationStatus === 'invalid') {
      errors.push('Accounting template has validation errors');
    }

    return { isValid: errors.length === 0, errors };
  },

  async provision(context: ProvisioningContext): Promise<DomainProvisionResult> {
    // GL adapters must NEVER throw (gotcha #249)
    try {
      const adminDb = createAdminClient();

      const [template] = await adminDb
        .select()
        .from(businessTypeAccountingTemplates)
        .where(eq(businessTypeAccountingTemplates.businessTypeVersionId, context.versionId))
        .limit(1);

      if (!template) {
        return {
          success: true,
          itemsProvisioned: 0,
          details: { note: 'No accounting template to provision' },
        };
      }

      // ── Seed workflow defaults into erp_workflow_configs ──────────
      const workflowDefaults = (template.workflowDefaults ?? {}) as Record<string, WorkflowConfig>;
      const entries = Object.entries(workflowDefaults);
      let workflowsProvisioned = 0;

      for (const [compositeKey, config] of entries) {
        const dotIdx = compositeKey.indexOf('.');
        if (dotIdx < 0) continue;
        const moduleKey = compositeKey.slice(0, dotIdx);
        const workflowKey = compositeKey.slice(dotIdx + 1);

        // Skip if the tenant already has an explicit override
        const [existing] = await adminDb
          .select({ id: erpWorkflowConfigs.id })
          .from(erpWorkflowConfigs)
          .where(
            and(
              eq(erpWorkflowConfigs.tenantId, context.tenantId),
              eq(erpWorkflowConfigs.moduleKey, moduleKey),
              eq(erpWorkflowConfigs.workflowKey, workflowKey),
            ),
          )
          .limit(1);

        if (existing) continue;

        await adminDb.insert(erpWorkflowConfigs).values({
          id: generateUlid(),
          tenantId: context.tenantId,
          moduleKey,
          workflowKey,
          autoMode: config.autoMode,
          approvalRequired: config.approvalRequired,
          userVisible: config.userVisible,
        });

        workflowsProvisioned++;
      }

      // Log the provisioning action
      if (workflowsProvisioned > 0) {
        await adminDb.insert(erpWorkflowConfigChangeLog).values({
          id: generateUlid(),
          tenantId: context.tenantId,
          moduleKey: '_provisioning',
          workflowKey: '_business_type',
          changedBy: context.adminUserId ?? 'system',
          changeType: 'auto_classification',
          oldConfig: null,
          newConfig: { workflowsProvisioned, source: 'business_type_template', runId: context.runId } as Record<string, unknown>,
          reason: `Business type provisioning seeded ${workflowsProvisioned} workflow defaults`,
        });
      }

      return {
        success: true,
        itemsProvisioned: workflowsProvisioned,
        details: {
          cogsBehavior: template.cogsBehavior,
          validationStatus: template.validationStatus,
          workflowsProvisioned,
          note: workflowsProvisioned > 0
            ? `Seeded ${workflowsProvisioned} workflow config defaults from business type template.`
            : 'No workflow defaults configured in business type template.',
        },
      };
    } catch (err) {
      // GL adapters must never throw — return partial
      console.error('[accounting-executor] Provisioning error (non-fatal):', (err as Error).message);
      return {
        success: false,
        itemsProvisioned: 0,
        details: {},
        error: (err as Error).message,
      };
    }
  },

  async snapshot(versionId: string): Promise<Record<string, unknown>> {
    const db = createAdminClient();
    const [template] = await db
      .select()
      .from(businessTypeAccountingTemplates)
      .where(eq(businessTypeAccountingTemplates.businessTypeVersionId, versionId))
      .limit(1);

    return { accountingTemplate: template ?? null };
  },
};
