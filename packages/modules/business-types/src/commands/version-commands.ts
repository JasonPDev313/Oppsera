import { eq, and, desc } from 'drizzle-orm';
import { createAdminClient } from '@oppsera/db';
import { generateUlid } from '@oppsera/shared';
import {
  businessTypes,
  businessTypeVersions,
  businessTypeModuleDefaults,
  businessTypeAccountingTemplates,
  businessTypeRoleTemplates,
  businessTypeRolePermissions,
} from '../schema';

export async function createDraftVersion(
  businessTypeId: string,
  _adminUserId: string,
) {
  const db = createAdminClient();
  const newVersionId = generateUlid();
  const now = new Date();

  // Verify business type exists before entering transaction
  const [bt] = await db
    .select({ id: businessTypes.id })
    .from(businessTypes)
    .where(eq(businessTypes.id, businessTypeId))
    .limit(1);

  if (!bt) {
    throw new Error('BUSINESS_TYPE_NOT_FOUND');
  }

  try {
    await db.transaction(async (tx) => {
      // All reads inside the transaction to avoid TOCTOU races.
      // The unique partial index uq_btv_active_draft enforces at most one draft.

      // Get latest published version to fork
      const [latestPublished] = await tx
        .select()
        .from(businessTypeVersions)
        .where(
          and(
            eq(businessTypeVersions.businessTypeId, businessTypeId),
            eq(businessTypeVersions.status, 'published'),
          ),
        )
        .orderBy(desc(businessTypeVersions.versionNumber))
        .limit(1);

      // Get highest version number (inside tx to prevent duplicates)
      const [latest] = await tx
        .select()
        .from(businessTypeVersions)
        .where(eq(businessTypeVersions.businessTypeId, businessTypeId))
        .orderBy(desc(businessTypeVersions.versionNumber))
        .limit(1);

      const nextVersionNumber = (latest?.versionNumber ?? 0) + 1;

      // Create new draft version (uq_btv_active_draft prevents duplicates)
      await tx.insert(businessTypeVersions).values({
        id: newVersionId,
        businessTypeId,
        versionNumber: nextVersionNumber,
        status: 'draft',
        createdAt: now,
        updatedAt: now,
      });

      if (latestPublished) {
        // Copy module defaults from published version
        const modules = await tx
          .select()
          .from(businessTypeModuleDefaults)
          .where(eq(businessTypeModuleDefaults.businessTypeVersionId, latestPublished.id));

        for (const mod of modules) {
          await tx.insert(businessTypeModuleDefaults).values({
            id: generateUlid(),
            businessTypeVersionId: newVersionId,
            moduleKey: mod.moduleKey,
            isEnabled: mod.isEnabled,
            accessMode: mod.accessMode,
            sortOrder: mod.sortOrder,
            createdAt: now,
            updatedAt: now,
          });
        }

        // Copy accounting template
        const [acct] = await tx
          .select()
          .from(businessTypeAccountingTemplates)
          .where(eq(businessTypeAccountingTemplates.businessTypeVersionId, latestPublished.id))
          .limit(1);

        if (acct) {
          await tx.insert(businessTypeAccountingTemplates).values({
            id: generateUlid(),
            businessTypeVersionId: newVersionId,
            coaTemplateRef: acct.coaTemplateRef,
            revenueCategories: acct.revenueCategories,
            paymentGlMappings: acct.paymentGlMappings,
            taxBehavior: acct.taxBehavior,
            deferredRevenue: acct.deferredRevenue,
            cogsBehavior: acct.cogsBehavior,
            fiscalSettings: acct.fiscalSettings,
            validationStatus: acct.validationStatus,
            validationErrors: acct.validationErrors,
            createdAt: now,
            updatedAt: now,
          });
        }

        // Copy role templates with permissions
        const roles = await tx
          .select()
          .from(businessTypeRoleTemplates)
          .where(eq(businessTypeRoleTemplates.businessTypeVersionId, latestPublished.id));

        for (const role of roles) {
          const newRoleId = generateUlid();
          await tx.insert(businessTypeRoleTemplates).values({
            id: newRoleId,
            businessTypeVersionId: newVersionId,
            roleName: role.roleName,
            roleKey: role.roleKey,
            description: role.description,
            sortOrder: role.sortOrder,
            isActive: role.isActive,
            createdAt: now,
            updatedAt: now,
          });

          const perms = await tx
            .select()
            .from(businessTypeRolePermissions)
            .where(eq(businessTypeRolePermissions.roleTemplateId, role.id));

          for (const perm of perms) {
            await tx.insert(businessTypeRolePermissions).values({
              id: generateUlid(),
              roleTemplateId: newRoleId,
              permissionKey: perm.permissionKey,
              createdAt: now,
            });
          }
        }
      } else {
        // No published version — create empty accounting template
        await tx.insert(businessTypeAccountingTemplates).values({
          id: generateUlid(),
          businessTypeVersionId: newVersionId,
          createdAt: now,
          updatedAt: now,
        });
      }
    });
  } catch (err) {
    // Translate unique constraint violation (uq_btv_active_draft) to domain error
    const msg = (err as Error).message ?? '';
    if (msg.includes('uq_btv_active_draft') || msg.includes('unique constraint')) {
      throw new Error('DRAFT_EXISTS');
    }
    throw err;
  }

  const [draft] = await db
    .select()
    .from(businessTypeVersions)
    .where(eq(businessTypeVersions.id, newVersionId))
    .limit(1);

  return draft;
}

export async function archiveVersion(versionId: string, _adminUserId: string) {
  const db = createAdminClient();

  const [version] = await db
    .select()
    .from(businessTypeVersions)
    .where(eq(businessTypeVersions.id, versionId))
    .limit(1);

  if (!version) {
    throw new Error('NOT_FOUND');
  }

  if (version.status === 'archived') {
    throw new Error('ALREADY_ARCHIVED');
  }

  if (version.status === 'published') {
    throw new Error('CANNOT_ARCHIVE_PUBLISHED');
  }

  await db
    .update(businessTypeVersions)
    .set({
      status: 'archived',
      updatedAt: new Date(),
    })
    .where(eq(businessTypeVersions.id, versionId));

  const [updated] = await db
    .select()
    .from(businessTypeVersions)
    .where(eq(businessTypeVersions.id, versionId))
    .limit(1);

  return updated;
}
