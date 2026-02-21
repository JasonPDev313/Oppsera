import { db } from '@oppsera/db';
import {
  semanticMetrics,
  semanticDimensions,
  semanticMetricDimensions,
  semanticLenses,
} from '@oppsera/db';
import { eq, and, isNull, inArray } from 'drizzle-orm';
import type {
  MetricDef,
  DimensionDef,
  MetricDimensionRelation,
  LensDef,
  RegistryCatalog,
} from './types';
import {
  UnknownMetricError,
  UnknownDimensionError,
  IncompatibleMetricError,
  InvalidDimensionForMetricError,
} from './types';

// ── In-memory cache (stale-while-revalidate) ──────────────────────
// The registry rarely changes — DB reads are batched on first access and cached.
// SWR pattern: serve stale data while refreshing in background.
// CACHE_TTL_MS:  serve from cache without refresh (fresh window)
// SWR_WINDOW_MS: serve stale data, kick off background refresh
// After SWR_WINDOW_MS: block the request and refresh synchronously

interface RegistryCache {
  metrics: Map<string, MetricDef>;
  dimensions: Map<string, DimensionDef>;
  relations: MetricDimensionRelation[];
  lenses: Map<string, LensDef>;
  loadedAt: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000;    // 5 min: serve from cache
const SWR_WINDOW_MS = 10 * 60 * 1000;  // 10 min: serve stale, refresh in background
let _cache: RegistryCache | null = null;
let _refreshInFlight = false;

// ── Row → domain type mappers ─────────────────────────────────────

function rowToMetric(row: typeof semanticMetrics.$inferSelect): MetricDef {
  return {
    slug: row.slug,
    displayName: row.displayName,
    description: row.description ?? null,
    domain: row.domain,
    category: row.category ?? null,
    tags: row.tags ?? null,
    sqlExpression: row.sqlExpression,
    sqlTable: row.sqlTable,
    sqlAggregation: row.sqlAggregation as MetricDef['sqlAggregation'],
    sqlFilter: row.sqlFilter ?? null,
    dataType: row.dataType as MetricDef['dataType'],
    formatPattern: row.formatPattern ?? null,
    unit: row.unit ?? null,
    higherIsBetter: row.higherIsBetter ?? null,
    aliases: row.aliases ?? null,
    examplePhrases: row.examplePhrases ?? null,
    relatedMetrics: row.relatedMetrics ?? null,
    requiresDimensions: row.requiresDimensions ?? null,
    incompatibleWith: row.incompatibleWith ?? null,
    isActive: row.isActive,
    isExperimental: row.isExperimental,
  };
}

function rowToDimension(row: typeof semanticDimensions.$inferSelect): DimensionDef {
  return {
    slug: row.slug,
    displayName: row.displayName,
    description: row.description ?? null,
    domain: row.domain,
    category: (row.category as DimensionDef['category']) ?? null,
    tags: row.tags ?? null,
    sqlExpression: row.sqlExpression,
    sqlTable: row.sqlTable,
    sqlDataType: row.sqlDataType as DimensionDef['sqlDataType'],
    sqlCast: row.sqlCast ?? null,
    hierarchyParent: row.hierarchyParent ?? null,
    hierarchyLevel: row.hierarchyLevel ?? null,
    isTimeDimension: row.isTimeDimension,
    timeGranularities: row.timeGranularities ?? null,
    lookupTable: row.lookupTable ?? null,
    lookupKeyColumn: row.lookupKeyColumn ?? null,
    lookupLabelColumn: row.lookupLabelColumn ?? null,
    aliases: row.aliases ?? null,
    exampleValues: row.exampleValues ?? null,
    examplePhrases: row.examplePhrases ?? null,
    isActive: row.isActive,
  };
}

function rowToLens(row: typeof semanticLenses.$inferSelect): LensDef {
  return {
    slug: row.slug,
    tenantId: row.tenantId ?? null,
    displayName: row.displayName,
    description: row.description ?? null,
    domain: row.domain,
    allowedMetrics: row.allowedMetrics ?? null,
    allowedDimensions: row.allowedDimensions ?? null,
    defaultMetrics: row.defaultMetrics ?? null,
    defaultDimensions: row.defaultDimensions ?? null,
    defaultFilters: (row.defaultFilters as unknown[] | null) ?? null,
    systemPromptFragment: row.systemPromptFragment ?? null,
    exampleQuestions: row.exampleQuestions ?? null,
    isActive: row.isActive,
    isSystem: row.isSystem,
  };
}

// ── Cache loader ─────────────────────────────────────────────────

async function loadCache(): Promise<RegistryCache> {
  // Sequential queries — avoids grabbing 4 pool connections simultaneously,
  // which causes contention with middleware queries under concurrent load.
  const metricRows = await db.select().from(semanticMetrics).where(eq(semanticMetrics.isActive, true));
  const dimRows = await db.select().from(semanticDimensions).where(eq(semanticDimensions.isActive, true));
  const relRows = await db.select().from(semanticMetricDimensions);
  // Only cache system lenses (tenant_id IS NULL). Tenant-specific lenses are
  // fetched on demand in getLens() to avoid nondeterministic slug collisions.
  const lensRows = await db.select().from(semanticLenses).where(
    and(eq(semanticLenses.isActive, true), isNull(semanticLenses.tenantId)),
  );

  const metrics = new Map<string, MetricDef>();
  for (const row of metricRows) {
    metrics.set(row.slug, rowToMetric(row));
  }

  const dimensions = new Map<string, DimensionDef>();
  for (const row of dimRows) {
    dimensions.set(row.slug, rowToDimension(row));
  }

  const relations: MetricDimensionRelation[] = relRows.map((r) => ({
    metricSlug: r.metricSlug,
    dimensionSlug: r.dimensionSlug,
    isRequired: r.isRequired,
    isDefault: r.isDefault,
    sortOrder: r.sortOrder,
  }));

  const lenses = new Map<string, LensDef>();
  for (const row of lensRows) {
    lenses.set(row.slug, rowToLens(row));
  }

  return { metrics, dimensions, relations, lenses, loadedAt: Date.now() };
}

async function getCache(): Promise<RegistryCache> {
  const now = Date.now();
  const age = _cache ? now - _cache.loadedAt : Infinity;

  if (age < CACHE_TTL_MS) {
    // Fresh — return immediately
    return _cache!;
  }

  if (_cache && age < SWR_WINDOW_MS) {
    // Stale but within SWR window — background refresh, return stale immediately
    if (!_refreshInFlight) {
      _refreshInFlight = true;
      loadCache()
        .then((fresh) => { _cache = fresh; })
        .catch(() => { /* will retry on next request */ })
        .finally(() => { _refreshInFlight = false; });
    }
    return _cache;
  }

  // No cache or too stale — must block and refresh synchronously
  _cache = await loadCache();
  return _cache;
}

// ── Public registry functions ─────────────────────────────────────

export async function getMetric(slug: string): Promise<MetricDef> {
  const cache = await getCache();
  const metric = cache.metrics.get(slug);
  if (!metric) throw new UnknownMetricError(slug);
  return metric;
}

export async function getDimension(slug: string): Promise<DimensionDef> {
  const cache = await getCache();
  const dim = cache.dimensions.get(slug);
  if (!dim) throw new UnknownDimensionError(slug);
  return dim;
}

export async function listMetrics(domain?: string): Promise<MetricDef[]> {
  const cache = await getCache();
  const all = Array.from(cache.metrics.values());
  return domain ? all.filter((m) => m.domain === domain) : all;
}

export async function listDimensions(domain?: string): Promise<DimensionDef[]> {
  const cache = await getCache();
  const all = Array.from(cache.dimensions.values());
  return domain ? all.filter((d) => d.domain === domain) : all;
}

export async function listLenses(domain?: string): Promise<LensDef[]> {
  const cache = await getCache();
  const all = Array.from(cache.lenses.values());
  return domain ? all.filter((l) => l.domain === domain) : all;
}

export async function getLens(slug: string, tenantId?: string): Promise<LensDef | null> {
  // Tenant-specific lens takes precedence over system lens (gotcha #130).
  if (tenantId) {
    const [tenantLens] = await db.select().from(semanticLenses).where(
      and(
        eq(semanticLenses.slug, slug),
        eq(semanticLenses.tenantId, tenantId),
        eq(semanticLenses.isActive, true),
      ),
    );
    if (tenantLens) return rowToLens(tenantLens);
  }

  // Fall back to cached system lens
  const cache = await getCache();
  return cache.lenses.get(slug) ?? null;
}

// ── Dimension compatibility ───────────────────────────────────────

export async function getValidDimensionsForMetric(metricSlug: string): Promise<DimensionDef[]> {
  const cache = await getCache();
  const rels = cache.relations.filter((r) => r.metricSlug === metricSlug);
  const dimSlugs = rels.map((r) => r.dimensionSlug);
  return dimSlugs
    .map((slug) => cache.dimensions.get(slug))
    .filter((d): d is DimensionDef => d !== undefined);
}

export async function getDefaultDimensionsForMetric(metricSlug: string): Promise<DimensionDef[]> {
  const cache = await getCache();
  const rels = cache.relations.filter((r) => r.metricSlug === metricSlug && r.isDefault);
  const dimSlugs = rels.sort((a, b) => a.sortOrder - b.sortOrder).map((r) => r.dimensionSlug);
  return dimSlugs
    .map((slug) => cache.dimensions.get(slug))
    .filter((d): d is DimensionDef => d !== undefined);
}

// ── Validation ────────────────────────────────────────────────────

export interface ValidationOptions {
  lensSlug?: string;
  skipDimensionCheck?: boolean;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  metrics: MetricDef[];
  dimensions: DimensionDef[];
}

export async function validatePlan(
  metricSlugs: string[],
  dimensionSlugs: string[],
  options: ValidationOptions = {},
): Promise<ValidationResult> {
  const cache = await getCache();
  const errors: string[] = [];
  const metrics: MetricDef[] = [];
  const dimensions: DimensionDef[] = [];

  // Get lens if specified
  let lens: LensDef | null = null;
  if (options.lensSlug) {
    lens = cache.lenses.get(options.lensSlug) ?? null;
  }

  // Validate metrics
  for (const slug of metricSlugs) {
    const metric = cache.metrics.get(slug);
    if (!metric) {
      errors.push(`Unknown metric: ${slug}`);
      continue;
    }
    if (lens?.allowedMetrics && !lens.allowedMetrics.includes(slug)) {
      errors.push(`Metric "${slug}" is not allowed in lens "${options.lensSlug}"`);
      continue;
    }
    metrics.push(metric);
  }

  // Validate dimensions
  for (const slug of dimensionSlugs) {
    const dim = cache.dimensions.get(slug);
    if (!dim) {
      errors.push(`Unknown dimension: ${slug}`);
      continue;
    }
    if (lens?.allowedDimensions && !lens.allowedDimensions.includes(slug)) {
      errors.push(`Dimension "${slug}" is not allowed in lens "${options.lensSlug}"`);
      continue;
    }
    dimensions.push(dim);
  }

  if (errors.length > 0) return { valid: false, errors, metrics, dimensions };

  // Check metric incompatibilities
  for (let i = 0; i < metrics.length; i++) {
    const m = metrics[i]!;
    if (!m.incompatibleWith) continue;
    for (const otherSlug of m.incompatibleWith) {
      if (metricSlugs.includes(otherSlug)) {
        errors.push(`Metrics "${m.slug}" and "${otherSlug}" cannot be combined`);
      }
    }
  }

  // Check required dimensions per metric
  if (!options.skipDimensionCheck) {
    for (const metric of metrics) {
      const rels = cache.relations.filter((r) => r.metricSlug === metric.slug && r.isRequired);
      for (const rel of rels) {
        if (!dimensionSlugs.includes(rel.dimensionSlug)) {
          errors.push(
            `Metric "${metric.slug}" requires dimension "${rel.dimensionSlug}"`,
          );
        }
      }
    }
  }

  return { valid: errors.length === 0, errors, metrics, dimensions };
}

// ── Catalog export (for LLM prompt) ──────────────────────────────

export async function buildRegistryCatalog(domain?: string): Promise<RegistryCatalog> {
  const [metrics, dimensions, lenses] = await Promise.all([
    listMetrics(domain),
    listDimensions(domain),
    listLenses(domain),
  ]);

  return {
    metrics,
    dimensions,
    lenses,
    generatedAt: new Date().toISOString(),
  };
}

// ── Cache management ─────────────────────────────────────────────

export function invalidateRegistryCache(): void {
  _cache = null;
}

export function setRegistryCache(cache: RegistryCache): void {
  _cache = cache;
}

// For testing: expose cache shape
export type { RegistryCache };
export { UnknownMetricError, UnknownDimensionError };
