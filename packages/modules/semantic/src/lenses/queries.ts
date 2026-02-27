// ── Custom Lens Queries ───────────────────────────────────────────
// Direct DB queries for tenant-specific lenses.
// System lenses are resolved via the registry cache (registry.ts).

import { db } from '@oppsera/db';
import { semanticLenses, tenantLensPreferences } from '@oppsera/db';
import { eq, and, or, isNull } from 'drizzle-orm';
import type { CustomLensRow, ListCustomLensesInput } from './types';
import { LensNotFoundError } from './types';

// ── Row mapper (mirrors commands.ts) ─────────────────────────────

function rowToCustomLens(row: typeof semanticLenses.$inferSelect): CustomLensRow {
  return {
    id: row.id,
    tenantId: row.tenantId!,
    slug: row.slug,
    displayName: row.displayName,
    description: row.description ?? null,
    domain: row.domain,
    allowedMetrics: row.allowedMetrics ?? null,
    allowedDimensions: row.allowedDimensions ?? null,
    defaultMetrics: row.defaultMetrics ?? null,
    defaultDimensions: row.defaultDimensions ?? null,
    defaultFilters: (row.defaultFilters as CustomLensRow['defaultFilters']) ?? null,
    systemPromptFragment: row.systemPromptFragment ?? null,
    exampleQuestions: row.exampleQuestions ?? null,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// ── getCustomLens ─────────────────────────────────────────────────
// Fetch a single custom lens by slug (must belong to this tenant).

export async function getCustomLens(
  tenantId: string,
  slug: string,
): Promise<CustomLensRow> {
  const [row] = await db
    .select()
    .from(semanticLenses)
    .where(and(eq(semanticLenses.tenantId, tenantId), eq(semanticLenses.slug, slug)));

  if (!row) {
    throw new LensNotFoundError(slug);
  }

  return rowToCustomLens(row);
}

// ── listCustomLenses ──────────────────────────────────────────────
// List tenant-specific custom lenses (not system lenses).
// System lenses are fetched via the registry (listLenses()).

export async function listCustomLenses(input: ListCustomLensesInput): Promise<CustomLensRow[]> {
  const { tenantId, domain, includeInactive = false } = input;

  const conditions = [eq(semanticLenses.tenantId, tenantId)];
  if (!includeInactive) {
    conditions.push(eq(semanticLenses.isActive, true));
  }

  const rows = await db
    .select()
    .from(semanticLenses)
    .where(and(...conditions));

  let results = rows.map(rowToCustomLens);
  if (domain) {
    results = results.filter((l) => l.domain === domain);
  }

  return results;
}

// ── listAllLensesForTenant ────────────────────────────────────────
// Returns BOTH system lenses (tenant_id IS NULL) AND the tenant's custom lenses.
// Used by the LLM pipeline to show all available lenses.

export async function listAllLensesForTenant(
  tenantId: string,
  domain?: string,
): Promise<Array<CustomLensRow & { isSystem: boolean }>> {
  const conditions = [
    or(isNull(semanticLenses.tenantId), eq(semanticLenses.tenantId, tenantId))!,
    eq(semanticLenses.isActive, true),
  ];

  const rows = await db
    .select()
    .from(semanticLenses)
    .where(and(...conditions));

  let results = rows.map((row) => ({
    ...rowToCustomLens({ ...row, tenantId: row.tenantId ?? tenantId }),
    isSystem: row.isSystem,
  }));

  if (domain) {
    results = results.filter((l) => l.domain === domain);
  }

  return results;
}

// ── getTenantLensPreferences ──────────────────────────────────────
// Returns a Map of lensSlug → enabled for the given tenant.
// If no preference exists for a lens, it is enabled by default.

export async function getTenantLensPreferences(
  tenantId: string,
): Promise<Map<string, boolean>> {
  const rows = await db
    .select({
      lensSlug: tenantLensPreferences.lensSlug,
      enabled: tenantLensPreferences.enabled,
    })
    .from(tenantLensPreferences)
    .where(eq(tenantLensPreferences.tenantId, tenantId));

  const prefs = new Map<string, boolean>();
  for (const row of rows) {
    prefs.set(row.lensSlug, row.enabled);
  }
  return prefs;
}
