// ── System Lens Queries ──────────────────────────────────────────
// Direct DB queries for platform-wide system lenses (tenantId = NULL).
// Bypasses registry cache so the admin portal always sees live data.

import { db } from '@oppsera/db';
import { semanticLenses } from '@oppsera/db';
import { eq, and, isNull } from 'drizzle-orm';
import type { SystemLensRow, ListSystemLensesInput } from './types';
import { LensNotFoundError } from './types';

// ── Row mapper ────────────────────────────────────────────────────

function rowToSystemLens(row: typeof semanticLenses.$inferSelect): SystemLensRow {
  return {
    id: row.id,
    tenantId: null,
    slug: row.slug,
    displayName: row.displayName,
    description: row.description ?? null,
    domain: row.domain,
    allowedMetrics: row.allowedMetrics ?? null,
    allowedDimensions: row.allowedDimensions ?? null,
    defaultMetrics: row.defaultMetrics ?? null,
    defaultDimensions: row.defaultDimensions ?? null,
    defaultFilters: (row.defaultFilters as SystemLensRow['defaultFilters']) ?? null,
    systemPromptFragment: row.systemPromptFragment ?? null,
    exampleQuestions: row.exampleQuestions ?? null,
    isActive: row.isActive,
    isSystem: row.isSystem,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// ── getSystemLens ─────────────────────────────────────────────────

export async function getSystemLens(slug: string): Promise<SystemLensRow> {
  const [row] = await db
    .select()
    .from(semanticLenses)
    .where(and(isNull(semanticLenses.tenantId), eq(semanticLenses.slug, slug)));

  if (!row) {
    throw new LensNotFoundError(slug);
  }

  return rowToSystemLens(row);
}

// ── listSystemLenses ──────────────────────────────────────────────

export async function listSystemLenses(input: ListSystemLensesInput = {}): Promise<SystemLensRow[]> {
  const { domain, includeInactive = false } = input;

  const conditions = [isNull(semanticLenses.tenantId)];
  if (!includeInactive) {
    conditions.push(eq(semanticLenses.isActive, true));
  }

  const rows = await db
    .select()
    .from(semanticLenses)
    .where(and(...conditions));

  let results = rows.map(rowToSystemLens);
  if (domain) {
    results = results.filter((l) => l.domain === domain);
  }

  return results;
}
