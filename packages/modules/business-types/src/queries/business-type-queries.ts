import { eq, and, sql, desc, asc, inArray } from 'drizzle-orm';
import { createAdminClient } from '@oppsera/db';
import {
  businessTypes,
  businessTypeVersions,
  businessCategories,
  businessTypeModuleDefaults,
  businessTypeAccountingTemplates,
  businessTypeRoleTemplates,
} from '../schema';

export type ListBusinessTypesFilters = {
  search?: string;
  categoryId?: string;
  isActive?: boolean;
  isSystem?: boolean;
  showAtSignup?: boolean;
  cursor?: string;
  limit?: number;
};

export async function listBusinessTypes(filters: ListBusinessTypesFilters) {
  const db = createAdminClient();
  const limit = Math.min(filters.limit ?? 50, 100);

  const conditions = [];
  if (filters.search) {
    // Escape LIKE wildcards to prevent pattern injection
    const escaped = filters.search.replace(/[%_\\]/g, '\\$&');
    conditions.push(sql`${businessTypes.name} ILIKE ${'%' + escaped + '%'}`);
  }
  if (filters.categoryId) {
    conditions.push(eq(businessTypes.categoryId, filters.categoryId));
  }
  if (filters.isActive !== undefined) {
    conditions.push(eq(businessTypes.isActive, filters.isActive));
  }
  if (filters.isSystem !== undefined) {
    conditions.push(eq(businessTypes.isSystem, filters.isSystem));
  }
  if (filters.showAtSignup !== undefined) {
    conditions.push(eq(businessTypes.showAtSignup, filters.showAtSignup));
  }
  if (filters.cursor) {
    // Base64-encoded JSON cursor: { s: sortOrder, n: name, id: id }
    try {
      const decoded = JSON.parse(Buffer.from(filters.cursor, 'base64').toString('utf-8'));
      if (decoded.s != null && decoded.n && decoded.id) {
        conditions.push(
          sql`(${businessTypes.sortOrder}, ${businessTypes.name}, ${businessTypes.id}) > (${Number(decoded.s)}, ${decoded.n}, ${decoded.id})`,
        );
      }
    } catch {
      // Ignore malformed cursor — return from beginning
    }
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = await db
    .select()
    .from(businessTypes)
    .leftJoin(businessCategories, eq(businessTypes.categoryId, businessCategories.id))
    .where(where)
    .orderBy(asc(businessTypes.sortOrder), asc(businessTypes.name), asc(businessTypes.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const data = rows.slice(0, limit);

  // Batch-load version summaries instead of N+1
  const btIds = data.map((r) => r.business_types.id);

  // Load all versions for these business types in one query
  const allVersions = btIds.length > 0
    ? await db
        .select()
        .from(businessTypeVersions)
        .where(inArray(businessTypeVersions.businessTypeId, btIds))
    : [];

  // Index by businessTypeId
  const publishedByBt = new Map<string, typeof allVersions[0]>();
  const hasDraftByBt = new Set<string>();
  for (const v of allVersions) {
    if (v.status === 'published') publishedByBt.set(v.businessTypeId, v);
    if (v.status === 'draft') hasDraftByBt.add(v.businessTypeId);
  }

  // Batch-load module counts, role counts, and accounting status for published versions
  const publishedVersionIds = Array.from(publishedByBt.values()).map((v) => v.id);

  const [allModules, allRoles, allAccts] = await Promise.all([
    publishedVersionIds.length > 0
      ? db.select({ versionId: businessTypeModuleDefaults.businessTypeVersionId, id: businessTypeModuleDefaults.id })
          .from(businessTypeModuleDefaults)
          .where(and(inArray(businessTypeModuleDefaults.businessTypeVersionId, publishedVersionIds), eq(businessTypeModuleDefaults.isEnabled, true)))
      : Promise.resolve([]),
    publishedVersionIds.length > 0
      ? db.select({ versionId: businessTypeRoleTemplates.businessTypeVersionId, id: businessTypeRoleTemplates.id })
          .from(businessTypeRoleTemplates)
          .where(inArray(businessTypeRoleTemplates.businessTypeVersionId, publishedVersionIds))
      : Promise.resolve([]),
    publishedVersionIds.length > 0
      ? db.select({ versionId: businessTypeAccountingTemplates.businessTypeVersionId, validationStatus: businessTypeAccountingTemplates.validationStatus })
          .from(businessTypeAccountingTemplates)
          .where(inArray(businessTypeAccountingTemplates.businessTypeVersionId, publishedVersionIds))
      : Promise.resolve([]),
  ]);

  const moduleCountByVersion = new Map<string, number>();
  for (const m of allModules) {
    moduleCountByVersion.set(m.versionId, (moduleCountByVersion.get(m.versionId) ?? 0) + 1);
  }
  const roleCountByVersion = new Map<string, number>();
  for (const r of allRoles) {
    roleCountByVersion.set(r.versionId, (roleCountByVersion.get(r.versionId) ?? 0) + 1);
  }
  const acctStatusByVersion = new Map<string, string>();
  for (const a of allAccts) {
    acctStatusByVersion.set(a.versionId, a.validationStatus);
  }

  const enriched = data.map((row) => {
    const bt = row.business_types;
    const publishedVersion = publishedByBt.get(bt.id);

    return {
      ...bt,
      categoryName: row.business_categories?.name ?? null,
      categorySlug: row.business_categories?.slug ?? null,
      publishedVersionId: publishedVersion?.id ?? null,
      publishedVersionNumber: publishedVersion?.versionNumber ?? null,
      hasDraft: hasDraftByBt.has(bt.id),
      moduleCount: publishedVersion ? (moduleCountByVersion.get(publishedVersion.id) ?? 0) : 0,
      roleCount: publishedVersion ? (roleCountByVersion.get(publishedVersion.id) ?? 0) : 0,
      accountingConfigured: publishedVersion ? acctStatusByVersion.get(publishedVersion.id) === 'valid' : false,
    };
  });

  return {
    data: enriched,
    meta: {
      cursor: enriched.length > 0
        ? Buffer.from(JSON.stringify({ s: enriched[enriched.length - 1]!.sortOrder, n: enriched[enriched.length - 1]!.name, id: enriched[enriched.length - 1]!.id })).toString('base64')
        : null,
      hasMore,
    },
  };
}

export async function getBusinessType(id: string) {
  const db = createAdminClient();
  const [row] = await db
    .select()
    .from(businessTypes)
    .leftJoin(businessCategories, eq(businessTypes.categoryId, businessCategories.id))
    .where(eq(businessTypes.id, id))
    .limit(1);

  if (!row) return null;

  return {
    ...row.business_types,
    categoryName: row.business_categories?.name ?? null,
    categorySlug: row.business_categories?.slug ?? null,
  };
}

export async function getBusinessTypeBySlug(slug: string) {
  const db = createAdminClient();
  const [row] = await db
    .select()
    .from(businessTypes)
    .where(eq(businessTypes.slug, slug))
    .limit(1);

  return row ?? null;
}

export async function getPublishedVersion(businessTypeId: string) {
  const db = createAdminClient();
  const [row] = await db
    .select()
    .from(businessTypeVersions)
    .where(
      and(
        eq(businessTypeVersions.businessTypeId, businessTypeId),
        eq(businessTypeVersions.status, 'published'),
      ),
    )
    .limit(1);

  return row ?? null;
}

export async function getDraftVersion(businessTypeId: string) {
  const db = createAdminClient();
  const [row] = await db
    .select()
    .from(businessTypeVersions)
    .where(
      and(
        eq(businessTypeVersions.businessTypeId, businessTypeId),
        eq(businessTypeVersions.status, 'draft'),
      ),
    )
    .limit(1);

  return row ?? null;
}

export async function getVersionById(versionId: string) {
  const db = createAdminClient();
  const [row] = await db
    .select()
    .from(businessTypeVersions)
    .where(eq(businessTypeVersions.id, versionId))
    .limit(1);

  return row ?? null;
}

export async function listVersionHistory(businessTypeId: string) {
  const db = createAdminClient();
  const rows = await db
    .select()
    .from(businessTypeVersions)
    .where(eq(businessTypeVersions.businessTypeId, businessTypeId))
    .orderBy(desc(businessTypeVersions.versionNumber));

  return rows;
}

export async function listBusinessCategories() {
  const db = createAdminClient();
  const rows = await db
    .select()
    .from(businessCategories)
    .orderBy(asc(businessCategories.sortOrder), asc(businessCategories.name));

  return rows;
}
