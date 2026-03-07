import { eq } from 'drizzle-orm';
import { createAdminClient } from '@oppsera/db';
import { businessTypeAccountingTemplates } from '../../schema';
import type { BlueprintDomainExecutor, ProvisioningContext, DomainProvisionResult, DomainValidationResult } from '../domain-registry';

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
    // Wrap entire provisioning in try/catch, return partial on failure
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

      // V1 stub: no actual COA provisioning — tenant configures chart of accounts during onboarding.
      // We snapshot the template data but provision nothing, so itemsProvisioned = 0.
      return {
        success: true,
        itemsProvisioned: 0,
        details: {
          cogsBehavior: template.cogsBehavior,
          validationStatus: template.validationStatus,
          note: 'V1 stub — accounting template recorded in snapshot. Tenant must configure chart of accounts during onboarding.',
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
