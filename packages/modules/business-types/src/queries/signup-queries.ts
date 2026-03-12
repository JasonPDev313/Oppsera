import { eq, and, asc, inArray } from 'drizzle-orm';
import { createAdminClient } from '@oppsera/db';
import {
  businessTypes,
  businessTypeVersions,
  businessCategories,
  businessTypeModuleDefaults,
} from '../schema';

export async function listSignupBusinessTypes() {
  const db = createAdminClient();
  const rows = await db
    .select()
    .from(businessTypes)
    .leftJoin(businessCategories, eq(businessTypes.categoryId, businessCategories.id))
    .where(
      and(
        eq(businessTypes.isActive, true),
        eq(businessTypes.showAtSignup, true),
      ),
    )
    .orderBy(asc(businessTypes.sortOrder), asc(businessTypes.name));

  if (rows.length === 0) return [];

  // Batch-load published versions for all signup types
  const btIds = rows.map((r) => r.business_types.id);
  const publishedVersions = await db
    .select()
    .from(businessTypeVersions)
    .where(and(inArray(businessTypeVersions.businessTypeId, btIds), eq(businessTypeVersions.status, 'published')));

  const publishedByBt = new Map<string, typeof publishedVersions[0]>();
  for (const v of publishedVersions) {
    publishedByBt.set(v.businessTypeId, v);
  }

  // Only keep rows that have a published version
  const rowsWithPublished = rows.filter((r) => publishedByBt.has(r.business_types.id));
  if (rowsWithPublished.length === 0) return [];

  // Batch-load enabled module counts
  const versionIds = rowsWithPublished.map((r) => publishedByBt.get(r.business_types.id)!.id);
  const allModules = await db
    .select({ versionId: businessTypeModuleDefaults.businessTypeVersionId, id: businessTypeModuleDefaults.id, moduleKey: businessTypeModuleDefaults.moduleKey })
    .from(businessTypeModuleDefaults)
    .where(and(inArray(businessTypeModuleDefaults.businessTypeVersionId, versionIds), eq(businessTypeModuleDefaults.isEnabled, true)));

  const moduleCountByVersion = new Map<string, number>();
  const moduleKeysByVersion = new Map<string, string[]>();
  for (const m of allModules) {
    moduleCountByVersion.set(m.versionId, (moduleCountByVersion.get(m.versionId) ?? 0) + 1);
    const keys = moduleKeysByVersion.get(m.versionId) ?? [];
    keys.push(m.moduleKey);
    moduleKeysByVersion.set(m.versionId, keys);
  }

  return rowsWithPublished.map((row) => {
    const published = publishedByBt.get(row.business_types.id)!;
    return {
      id: row.business_types.id,
      name: row.business_types.name,
      slug: row.business_types.slug,
      description: row.business_types.description,
      iconKey: row.business_types.iconKey,
      categoryName: row.business_categories?.name ?? null,
      moduleCount: moduleCountByVersion.get(published.id) ?? 0,
      enabledModuleKeys: moduleKeysByVersion.get(published.id) ?? [],
    };
  });
}
