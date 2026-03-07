import { eq, and } from 'drizzle-orm';
import { createAdminClient } from '@oppsera/db';
import { generateUlid } from '@oppsera/shared';
import { businessTypeModuleDefaults } from '../../schema';
import { VALID_MODULE_KEYS } from '../../registries/module-registry';
import type { BlueprintDomainExecutor, ProvisioningContext, DomainProvisionResult, DomainValidationResult } from '../domain-registry';

// We need direct access to the entitlements table for provisioning
// Import from @oppsera/db since it has the schema
import { entitlements } from '@oppsera/db';

export const modulesExecutor: BlueprintDomainExecutor = {
  domainKey: 'modules',
  isCritical: true,

  async validate(versionId: string): Promise<DomainValidationResult> {
    const db = createAdminClient();
    const modules = await db
      .select()
      .from(businessTypeModuleDefaults)
      .where(
        and(
          eq(businessTypeModuleDefaults.businessTypeVersionId, versionId),
          eq(businessTypeModuleDefaults.isEnabled, true),
        ),
      );

    const errors: string[] = [];
    if (modules.length === 0) {
      errors.push('No modules enabled');
    }
    for (const mod of modules) {
      if (!VALID_MODULE_KEYS.has(mod.moduleKey)) {
        errors.push(`Invalid module key: ${mod.moduleKey}`);
      }
    }

    return { isValid: errors.length === 0, errors };
  },

  async provision(context: ProvisioningContext): Promise<DomainProvisionResult> {
    const adminDb = createAdminClient();
    let itemsProvisioned = 0;
    const provisionedModules: string[] = [];

    try {
      const modules = await adminDb
        .select()
        .from(businessTypeModuleDefaults)
        .where(
          and(
            eq(businessTypeModuleDefaults.businessTypeVersionId, context.versionId),
            eq(businessTypeModuleDefaults.isEnabled, true),
          ),
        );

      for (const mod of modules) {
        // Idempotent: check if entitlement already exists
        const [existing] = await adminDb
          .select({ id: entitlements.id })
          .from(entitlements)
          .where(
            and(
              eq(entitlements.tenantId, context.tenantId),
              eq(entitlements.moduleKey, mod.moduleKey),
            ),
          )
          .limit(1);

        if (existing) {
          provisionedModules.push(`${mod.moduleKey} (skipped — already exists)`);
          continue;
        }

        await adminDb.insert(entitlements).values({
          id: generateUlid(),
          tenantId: context.tenantId,
          moduleKey: mod.moduleKey,
          isEnabled: true,
          accessMode: mod.accessMode,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        provisionedModules.push(mod.moduleKey);
        itemsProvisioned++;
      }

      return {
        success: true,
        itemsProvisioned,
        details: { modules: provisionedModules },
      };
    } catch (err) {
      return {
        success: false,
        itemsProvisioned,
        details: { modules: provisionedModules },
        error: (err as Error).message,
      };
    }
  },

  async snapshot(versionId: string): Promise<Record<string, unknown>> {
    const db = createAdminClient();
    const modules = await db
      .select()
      .from(businessTypeModuleDefaults)
      .where(eq(businessTypeModuleDefaults.businessTypeVersionId, versionId));

    return { modules };
  },
};
