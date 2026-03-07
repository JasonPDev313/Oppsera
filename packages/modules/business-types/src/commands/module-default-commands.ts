import { eq } from 'drizzle-orm';
import { createAdminClient } from '@oppsera/db';
import { generateUlid } from '@oppsera/shared';
import { businessTypeModuleDefaults, businessTypeVersions } from '../schema';
import { VALID_MODULE_KEYS, getModuleEntry } from '../registries/module-registry';
import type { ModuleDefaultInput } from '../types/schemas';

export async function saveModuleDefaults(
  versionId: string,
  modules: ModuleDefaultInput[],
  _adminUserId: string,
) {
  const db = createAdminClient();

  // Check version is editable
  const [version] = await db
    .select()
    .from(businessTypeVersions)
    .where(eq(businessTypeVersions.id, versionId))
    .limit(1);

  if (!version) throw new Error('NOT_FOUND');
  if (version.status !== 'draft') throw new Error('VERSION_NOT_EDITABLE');

  // Validate all module keys
  for (const mod of modules) {
    if (!VALID_MODULE_KEYS.has(mod.moduleKey)) {
      throw new Error(`INVALID_MODULE_KEY:${mod.moduleKey}`);
    }
  }

  // Validate dependencies
  const enabledKeys = new Set(modules.filter((m) => m.isEnabled).map((m) => m.moduleKey));
  const depErrors: string[] = [];

  for (const mod of modules.filter((m) => m.isEnabled)) {
    const entry = getModuleEntry(mod.moduleKey);
    if (!entry) continue;
    for (const dep of entry.dependencies) {
      if (!enabledKeys.has(dep)) {
        depErrors.push(`Module '${mod.moduleKey}' requires '${dep}' to be enabled`);
      }
    }
  }

  if (depErrors.length > 0) {
    throw new Error(`DEPENDENCY_ERRORS:${depErrors.join('; ')}`);
  }

  const now = new Date();

  await db.transaction(async (tx) => {
    // Delete existing module defaults for this version
    await tx
      .delete(businessTypeModuleDefaults)
      .where(eq(businessTypeModuleDefaults.businessTypeVersionId, versionId));

    // Insert new module defaults
    for (const mod of modules) {
      await tx.insert(businessTypeModuleDefaults).values({
        id: generateUlid(),
        businessTypeVersionId: versionId,
        moduleKey: mod.moduleKey,
        isEnabled: mod.isEnabled,
        accessMode: mod.accessMode,
        sortOrder: mod.sortOrder,
        createdAt: now,
        updatedAt: now,
      });
    }
  });

  const result = await db
    .select()
    .from(businessTypeModuleDefaults)
    .where(eq(businessTypeModuleDefaults.businessTypeVersionId, versionId))
    .orderBy(businessTypeModuleDefaults.sortOrder);

  return result;
}
