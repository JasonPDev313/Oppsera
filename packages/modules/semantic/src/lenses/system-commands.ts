// ── System Lens Commands ─────────────────────────────────────────
// CRUD for platform-wide system lenses (tenantId = NULL, isSystem = true).
// Managed by super admins via the admin portal.

import { db } from '@oppsera/db';
import { semanticLenses } from '@oppsera/db';
import { eq, and, isNull } from 'drizzle-orm';
import { generateUlid } from '@oppsera/shared';
import type { CreateSystemLensInput, UpdateSystemLensInput, SystemLensRow } from './types';
import { DuplicateLensSlugError, LensNotFoundError } from './types';
import { validateLensSlug, validateLensMetricsAndDimensions } from './validation';
import { invalidateRegistryCache } from '../registry/registry';

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
    targetBusinessTypes: row.targetBusinessTypes ?? null,
    isActive: row.isActive,
    isSystem: row.isSystem,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// ── createSystemLens ──────────────────────────────────────────────

export async function createSystemLens(input: CreateSystemLensInput): Promise<SystemLensRow> {
  const {
    slug,
    displayName,
    description,
    domain,
    allowedMetrics,
    allowedDimensions,
    defaultMetrics,
    defaultDimensions,
    defaultFilters,
    systemPromptFragment,
    exampleQuestions,
    targetBusinessTypes,
  } = input;

  validateLensSlug(slug);

  const validation = await validateLensMetricsAndDimensions(
    allowedMetrics,
    allowedDimensions,
    defaultMetrics,
    defaultDimensions,
  );
  if (!validation.valid) {
    throw new Error(`Lens validation failed: ${validation.errors.join('; ')}`);
  }

  // Check for duplicate slug among system lenses
  const existing = await db
    .select({ id: semanticLenses.id })
    .from(semanticLenses)
    .where(and(isNull(semanticLenses.tenantId), eq(semanticLenses.slug, slug)));

  if (existing.length > 0) {
    throw new DuplicateLensSlugError(slug, 'system');
  }

  const [created] = await db
    .insert(semanticLenses)
    .values({
      id: generateUlid(),
      tenantId: null,
      slug,
      displayName,
      description: description ?? null,
      domain,
      allowedMetrics: allowedMetrics ?? null,
      allowedDimensions: allowedDimensions ?? null,
      defaultMetrics: defaultMetrics ?? null,
      defaultDimensions: defaultDimensions ?? null,
      defaultFilters: defaultFilters ? (defaultFilters as never) : null,
      systemPromptFragment: systemPromptFragment ?? null,
      exampleQuestions: exampleQuestions ?? null,
      targetBusinessTypes: targetBusinessTypes ?? null,
      isActive: true,
      isSystem: true,
    })
    .returning();

  invalidateRegistryCache();
  return rowToSystemLens(created!);
}

// ── updateSystemLens ──────────────────────────────────────────────

export async function updateSystemLens(input: UpdateSystemLensInput): Promise<SystemLensRow> {
  const { slug } = input;

  const [existing] = await db
    .select()
    .from(semanticLenses)
    .where(and(isNull(semanticLenses.tenantId), eq(semanticLenses.slug, slug)));

  if (!existing) {
    throw new LensNotFoundError(slug);
  }

  // Merge and validate metrics/dimensions
  const nextAllowedMetrics = input.allowedMetrics ?? existing.allowedMetrics ?? undefined;
  const nextAllowedDimensions = input.allowedDimensions ?? existing.allowedDimensions ?? undefined;
  const nextDefaultMetrics = input.defaultMetrics ?? existing.defaultMetrics ?? undefined;
  const nextDefaultDimensions = input.defaultDimensions ?? existing.defaultDimensions ?? undefined;

  const validation = await validateLensMetricsAndDimensions(
    nextAllowedMetrics,
    nextAllowedDimensions,
    nextDefaultMetrics,
    nextDefaultDimensions,
  );
  if (!validation.valid) {
    throw new Error(`Lens validation failed: ${validation.errors.join('; ')}`);
  }

  const updateValues: Partial<typeof semanticLenses.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (input.displayName !== undefined) updateValues.displayName = input.displayName;
  if (input.description !== undefined) updateValues.description = input.description;
  if (input.domain !== undefined) updateValues.domain = input.domain;
  if (input.allowedMetrics !== undefined) updateValues.allowedMetrics = input.allowedMetrics;
  if (input.allowedDimensions !== undefined) updateValues.allowedDimensions = input.allowedDimensions;
  if (input.defaultMetrics !== undefined) updateValues.defaultMetrics = input.defaultMetrics;
  if (input.defaultDimensions !== undefined) updateValues.defaultDimensions = input.defaultDimensions;
  if (input.defaultFilters !== undefined) updateValues.defaultFilters = input.defaultFilters as never;
  if (input.systemPromptFragment !== undefined) updateValues.systemPromptFragment = input.systemPromptFragment;
  if (input.exampleQuestions !== undefined) updateValues.exampleQuestions = input.exampleQuestions;
  if (input.targetBusinessTypes !== undefined) updateValues.targetBusinessTypes = input.targetBusinessTypes;

  const [updated] = await db
    .update(semanticLenses)
    .set(updateValues)
    .where(and(isNull(semanticLenses.tenantId), eq(semanticLenses.slug, slug)))
    .returning();

  invalidateRegistryCache();
  return rowToSystemLens(updated!);
}

// ── deactivateSystemLens ──────────────────────────────────────────

export async function deactivateSystemLens(slug: string): Promise<SystemLensRow> {
  const [existing] = await db
    .select()
    .from(semanticLenses)
    .where(and(isNull(semanticLenses.tenantId), eq(semanticLenses.slug, slug)));

  if (!existing) {
    throw new LensNotFoundError(slug);
  }

  const [updated] = await db
    .update(semanticLenses)
    .set({ isActive: false, updatedAt: new Date() })
    .where(and(isNull(semanticLenses.tenantId), eq(semanticLenses.slug, slug)))
    .returning();

  invalidateRegistryCache();
  return rowToSystemLens(updated!);
}

// ── reactivateSystemLens ──────────────────────────────────────────

export async function reactivateSystemLens(slug: string): Promise<SystemLensRow> {
  const [existing] = await db
    .select()
    .from(semanticLenses)
    .where(and(isNull(semanticLenses.tenantId), eq(semanticLenses.slug, slug)));

  if (!existing) {
    throw new LensNotFoundError(slug);
  }

  const [updated] = await db
    .update(semanticLenses)
    .set({ isActive: true, updatedAt: new Date() })
    .where(and(isNull(semanticLenses.tenantId), eq(semanticLenses.slug, slug)))
    .returning();

  invalidateRegistryCache();
  return rowToSystemLens(updated!);
}
