// ── Custom Lens Commands ──────────────────────────────────────────
// CRUD for tenant-specific (non-system) lenses.
// System lenses are read-only — they live in seed-data.ts and are
// upserted by the sync script.

import { withTenant, semanticLenses, tenantLensPreferences } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';
import { generateUlid } from '@oppsera/shared';
import type { CreateLensInput, UpdateLensInput, CustomLensRow } from './types';
import {
  DuplicateLensSlugError,
  SystemLensModificationError,
  LensNotFoundError,
} from './types';
import { validateLensSlug, validateLensMetricsAndDimensions } from './validation';

// ── Row mapper ────────────────────────────────────────────────────

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

// ── createCustomLens ──────────────────────────────────────────────

export async function createCustomLens(input: CreateLensInput): Promise<CustomLensRow> {
  const {
    tenantId,
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
  } = input;

  // Validate slug format
  validateLensSlug(slug);

  // Validate metric/dimension slugs exist in registry
  const validation = await validateLensMetricsAndDimensions(
    allowedMetrics,
    allowedDimensions,
    defaultMetrics,
    defaultDimensions,
  );
  if (!validation.valid) {
    throw new Error(`Lens validation failed: ${validation.errors.join('; ')}`);
  }

  // Check for duplicate slug + insert inside withTenant for RLS
  return withTenant(tenantId, async (tx) => {
    const existing = await tx
      .select({ id: semanticLenses.id })
      .from(semanticLenses)
      .where(and(eq(semanticLenses.tenantId, tenantId), eq(semanticLenses.slug, slug)));

    if (existing.length > 0) {
      throw new DuplicateLensSlugError(slug, tenantId);
    }

    const [created] = await tx
      .insert(semanticLenses)
      .values({
        id: generateUlid(),
        tenantId,
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
        isActive: true,
        isSystem: false,
      })
      .returning();

    return rowToCustomLens(created!);
  });
}

// ── updateCustomLens ──────────────────────────────────────────────

export async function updateCustomLens(input: UpdateLensInput): Promise<CustomLensRow> {
  const { tenantId, slug } = input;

  // Validate metric/dimension changes before entering transaction
  // Find the existing lens — must belong to this tenant and not be a system lens
  return withTenant(tenantId, async (tx) => {
    const [existing] = await tx
      .select()
      .from(semanticLenses)
      .where(and(eq(semanticLenses.tenantId, tenantId), eq(semanticLenses.slug, slug)));

    if (!existing) {
      throw new LensNotFoundError(slug);
    }
    if (existing.isSystem) {
      throw new SystemLensModificationError(slug);
    }

    // Merge updates and validate
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
    if (input.allowedMetrics !== undefined) updateValues.allowedMetrics = input.allowedMetrics;
    if (input.allowedDimensions !== undefined) updateValues.allowedDimensions = input.allowedDimensions;
    if (input.defaultMetrics !== undefined) updateValues.defaultMetrics = input.defaultMetrics;
    if (input.defaultDimensions !== undefined) updateValues.defaultDimensions = input.defaultDimensions;
    if (input.defaultFilters !== undefined) updateValues.defaultFilters = input.defaultFilters as never;
    if (input.systemPromptFragment !== undefined) updateValues.systemPromptFragment = input.systemPromptFragment;
    if (input.exampleQuestions !== undefined) updateValues.exampleQuestions = input.exampleQuestions;

    const [updated] = await tx
      .update(semanticLenses)
      .set(updateValues)
      .where(and(eq(semanticLenses.tenantId, tenantId), eq(semanticLenses.slug, slug)))
      .returning();

    return rowToCustomLens(updated!);
  });
}

// ── deactivateCustomLens ──────────────────────────────────────────
// Soft-delete: sets isActive = false.

export async function deactivateCustomLens(
  tenantId: string,
  slug: string,
): Promise<CustomLensRow> {
  return withTenant(tenantId, async (tx) => {
    const [existing] = await tx
      .select()
      .from(semanticLenses)
      .where(and(eq(semanticLenses.tenantId, tenantId), eq(semanticLenses.slug, slug)));

    if (!existing) {
      throw new LensNotFoundError(slug);
    }
    if (existing.isSystem) {
      throw new SystemLensModificationError(slug);
    }

    const [updated] = await tx
      .update(semanticLenses)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(eq(semanticLenses.tenantId, tenantId), eq(semanticLenses.slug, slug)))
      .returning();

    return rowToCustomLens(updated!);
  });
}

// ── reactivateCustomLens ──────────────────────────────────────────

export async function reactivateCustomLens(
  tenantId: string,
  slug: string,
): Promise<CustomLensRow> {
  return withTenant(tenantId, async (tx) => {
    const [existing] = await tx
      .select()
      .from(semanticLenses)
      .where(and(eq(semanticLenses.tenantId, tenantId), eq(semanticLenses.slug, slug)));

    if (!existing) {
      throw new LensNotFoundError(slug);
    }
    if (existing.isSystem) {
      throw new SystemLensModificationError(slug);
    }

    const [updated] = await tx
      .update(semanticLenses)
      .set({ isActive: true, updatedAt: new Date() })
      .where(and(eq(semanticLenses.tenantId, tenantId), eq(semanticLenses.slug, slug)))
      .returning();

    return rowToCustomLens(updated!);
  });
}

// ── setTenantLensPreference ──────────────────────────────────────
// Upsert a tenant's preference for a specific lens.
// Default is enabled = true; calling with enabled = false disables it.

export async function setTenantLensPreference(
  tenantId: string,
  lensSlug: string,
  enabled: boolean,
): Promise<void> {
  await withTenant(tenantId, async (tx) => {
    await tx
      .insert(tenantLensPreferences)
      .values({
        id: generateUlid(),
        tenantId,
        lensSlug,
        enabled,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [tenantLensPreferences.tenantId, tenantLensPreferences.lensSlug],
        set: {
          enabled,
          updatedAt: new Date(),
        },
      });
  });
}
