// ── Custom Lens Validation ────────────────────────────────────────
// Validates that slugs in allowedMetrics / allowedDimensions
// reference real registry entries, and that the lens slug format is valid.

import { listMetrics, listDimensions } from '../registry/registry';
import { InvalidLensSlugError } from './types';

// Slug format: lowercase letters, digits, underscores, min 2 chars
const SLUG_REGEX = /^[a-z][a-z0-9_]{1,63}$/;

export function validateLensSlug(slug: string): void {
  if (!SLUG_REGEX.test(slug)) {
    throw new InvalidLensSlugError(slug);
  }
}

export interface LensValidationResult {
  valid: boolean;
  errors: string[];
}

export async function validateLensMetricsAndDimensions(
  allowedMetrics: string[] | undefined,
  allowedDimensions: string[] | undefined,
  defaultMetrics: string[] | undefined,
  defaultDimensions: string[] | undefined,
): Promise<LensValidationResult> {
  const errors: string[] = [];

  // Load all known slugs from registry
  const [allMetrics, allDimensions] = await Promise.all([
    listMetrics(),
    listDimensions(),
  ]);
  const metricSlugs = new Set(allMetrics.map((m) => m.slug));
  const dimSlugs = new Set(allDimensions.map((d) => d.slug));

  // Validate allowedMetrics
  for (const slug of allowedMetrics ?? []) {
    if (!metricSlugs.has(slug)) {
      errors.push(`Unknown metric slug in allowedMetrics: "${slug}"`);
    }
  }

  // Validate allowedDimensions
  for (const slug of allowedDimensions ?? []) {
    if (!dimSlugs.has(slug)) {
      errors.push(`Unknown dimension slug in allowedDimensions: "${slug}"`);
    }
  }

  // Validate defaultMetrics subset of allowedMetrics (if both specified)
  if (defaultMetrics && allowedMetrics) {
    const allowedSet = new Set(allowedMetrics);
    for (const slug of defaultMetrics) {
      if (!allowedSet.has(slug)) {
        errors.push(`Default metric "${slug}" must be in allowedMetrics`);
      }
    }
  }

  // Validate defaultDimensions subset of allowedDimensions (if both specified)
  if (defaultDimensions && allowedDimensions) {
    const allowedSet = new Set(allowedDimensions);
    for (const slug of defaultDimensions) {
      if (!allowedSet.has(slug)) {
        errors.push(`Default dimension "${slug}" must be in allowedDimensions`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}
