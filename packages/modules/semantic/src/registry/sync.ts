// ── Semantic Registry Sync ────────────────────────────────────────
// Uses a standalone postgres.js connection (not the shared Drizzle db client)
// because postgres.js natively handles text[] array parameters in template literals,
// whereas Drizzle's insert builder + postgres.js cannot serialize JS arrays
// to the Postgres wire protocol when prepare:false is set (Supavisor mode).

import postgres from 'postgres';
import { generateUlid } from '@oppsera/shared';
import {
  CORE_METRICS,
  CORE_DIMENSIONS,
  GOLF_METRICS,
  GOLF_DIMENSIONS,
  PMS_METRICS,
  PMS_DIMENSIONS,
  CORE_METRIC_DIMENSIONS,
  GOLF_METRIC_DIMENSIONS,
  PMS_METRIC_DIMENSIONS,
  SYSTEM_LENSES,
  PMS_SYSTEM_LENSES,
} from './seed-data';
import { GOLF_EXAMPLES, toEvalExampleInserts } from './golf-examples';
import { invalidateRegistryCache } from './registry';
import type { MetricDef, DimensionDef, LensDef } from './types';

// ── Upsert helpers ────────────────────────────────────────────────

async function upsertMetrics(
  pg: postgres.Sql,
  metrics: Omit<MetricDef, 'isActive' | 'isExperimental'>[],
) {
  for (const m of metrics) {
    await pg`
      INSERT INTO semantic_metrics (
        id, slug, display_name, description, domain, category, tags,
        sql_expression, sql_table, sql_aggregation, sql_filter,
        data_type, format_pattern, unit, higher_is_better,
        aliases, example_phrases, related_metrics,
        requires_dimensions, incompatible_with,
        is_active, is_experimental, created_at, updated_at
      ) VALUES (
        ${generateUlid()}, ${m.slug}, ${m.displayName}, ${m.description ?? null},
        ${m.domain}, ${m.category ?? null}, ${m.tags ?? null},
        ${m.sqlExpression}, ${m.sqlTable}, ${m.sqlAggregation}, ${m.sqlFilter ?? null},
        ${m.dataType}, ${m.formatPattern ?? null}, ${m.unit ?? null}, ${m.higherIsBetter ?? true},
        ${m.aliases ?? null}, ${m.examplePhrases ?? null}, ${m.relatedMetrics ?? null},
        ${m.requiresDimensions ?? null}, ${m.incompatibleWith ?? null},
        TRUE, FALSE, NOW(), NOW()
      )
      ON CONFLICT (slug) DO UPDATE SET
        display_name        = EXCLUDED.display_name,
        description         = EXCLUDED.description,
        domain              = EXCLUDED.domain,
        category            = EXCLUDED.category,
        tags                = EXCLUDED.tags,
        sql_expression      = EXCLUDED.sql_expression,
        sql_table           = EXCLUDED.sql_table,
        sql_aggregation     = EXCLUDED.sql_aggregation,
        sql_filter          = EXCLUDED.sql_filter,
        data_type           = EXCLUDED.data_type,
        format_pattern      = EXCLUDED.format_pattern,
        unit                = EXCLUDED.unit,
        higher_is_better    = EXCLUDED.higher_is_better,
        aliases             = EXCLUDED.aliases,
        example_phrases     = EXCLUDED.example_phrases,
        related_metrics     = EXCLUDED.related_metrics,
        requires_dimensions = EXCLUDED.requires_dimensions,
        incompatible_with   = EXCLUDED.incompatible_with,
        updated_at          = NOW()
    `;
  }
}

async function upsertDimensions(
  pg: postgres.Sql,
  dimensions: Omit<DimensionDef, 'isActive'>[],
) {
  for (const d of dimensions) {
    await pg`
      INSERT INTO semantic_dimensions (
        id, slug, display_name, description, domain, category, tags,
        sql_expression, sql_table, sql_data_type, sql_cast,
        hierarchy_parent, hierarchy_level,
        is_time_dimension, time_granularities,
        lookup_table, lookup_key_column, lookup_label_column,
        aliases, example_values, example_phrases,
        is_active, created_at, updated_at
      ) VALUES (
        ${generateUlid()}, ${d.slug}, ${d.displayName}, ${d.description ?? null},
        ${d.domain}, ${d.category ?? null}, ${d.tags ?? null},
        ${d.sqlExpression}, ${d.sqlTable}, ${d.sqlDataType}, ${d.sqlCast ?? null},
        ${d.hierarchyParent ?? null}, ${d.hierarchyLevel ?? 0},
        ${d.isTimeDimension ?? false}, ${d.timeGranularities ?? null},
        ${d.lookupTable ?? null}, ${d.lookupKeyColumn ?? null}, ${d.lookupLabelColumn ?? null},
        ${d.aliases ?? null}, ${d.exampleValues ?? null}, ${d.examplePhrases ?? null},
        TRUE, NOW(), NOW()
      )
      ON CONFLICT (slug) DO UPDATE SET
        display_name        = EXCLUDED.display_name,
        description         = EXCLUDED.description,
        domain              = EXCLUDED.domain,
        category            = EXCLUDED.category,
        tags                = EXCLUDED.tags,
        sql_expression      = EXCLUDED.sql_expression,
        sql_table           = EXCLUDED.sql_table,
        sql_data_type       = EXCLUDED.sql_data_type,
        sql_cast            = EXCLUDED.sql_cast,
        hierarchy_parent    = EXCLUDED.hierarchy_parent,
        hierarchy_level     = EXCLUDED.hierarchy_level,
        is_time_dimension   = EXCLUDED.is_time_dimension,
        time_granularities  = EXCLUDED.time_granularities,
        lookup_table        = EXCLUDED.lookup_table,
        lookup_key_column   = EXCLUDED.lookup_key_column,
        lookup_label_column = EXCLUDED.lookup_label_column,
        aliases             = EXCLUDED.aliases,
        example_values      = EXCLUDED.example_values,
        example_phrases     = EXCLUDED.example_phrases,
        updated_at          = NOW()
    `;
  }
}

async function upsertRelations(
  pg: postgres.Sql,
  relations: { metricSlug: string; dimensionSlug: string; isRequired: boolean; isDefault: boolean; sortOrder: number }[],
) {
  for (const r of relations) {
    await pg`
      INSERT INTO semantic_metric_dimensions (
        id, metric_slug, dimension_slug, is_required, is_default, sort_order, created_at
      ) VALUES (
        ${generateUlid()}, ${r.metricSlug}, ${r.dimensionSlug},
        ${r.isRequired}, ${r.isDefault}, ${r.sortOrder}, NOW()
      )
      ON CONFLICT (metric_slug, dimension_slug) DO UPDATE SET
        is_required = EXCLUDED.is_required,
        is_default  = EXCLUDED.is_default,
        sort_order  = EXCLUDED.sort_order
    `;
  }
}

async function upsertLenses(
  pg: postgres.Sql,
  lenses: Omit<LensDef, 'isActive'>[],
) {
  // ON CONFLICT DO NOTHING — seed-only. Once a system lens exists in the DB
  // it is managed exclusively via the admin portal. Re-running sync will
  // create any NEW lenses but never overwrite admin edits to existing ones.
  for (const l of lenses) {
    await pg`
      INSERT INTO semantic_lenses (
        id, slug, display_name, description, domain,
        allowed_metrics, allowed_dimensions, default_metrics, default_dimensions,
        default_filters, system_prompt_fragment, example_questions,
        is_active, is_system, created_at, updated_at
      ) VALUES (
        ${generateUlid()}, ${l.slug}, ${l.displayName}, ${l.description ?? null}, ${l.domain},
        ${l.allowedMetrics ?? null}, ${l.allowedDimensions ?? null},
        ${l.defaultMetrics ?? null}, ${l.defaultDimensions ?? null},
        ${l.defaultFilters ? pg.json(l.defaultFilters as unknown as postgres.JSONValue) : null},
        ${l.systemPromptFragment ?? null}, ${l.exampleQuestions ?? null},
        TRUE, ${l.isSystem}, NOW(), NOW()
      )
      ON CONFLICT (slug) WHERE tenant_id IS NULL DO NOTHING
    `;
  }
}

async function upsertExamples(
  pg: postgres.Sql,
  inserts: ReturnType<typeof toEvalExampleInserts>,
) {
  if (inserts.length === 0) return;
  // No unique index on (question) WHERE tenant_id IS NULL exists in the migration,
  // so use delete-then-insert for idempotency on system examples.
  await pg`DELETE FROM semantic_eval_examples WHERE tenant_id IS NULL`;
  for (const ex of inserts) {
    await pg`
      INSERT INTO semantic_eval_examples (
        id, tenant_id, source_eval_turn_id,
        question, plan, rationale,
        category, difficulty,
        quality_score, is_active, added_by,
        created_at, updated_at
      ) VALUES (
        ${generateUlid()}, ${ex.tenantId}, ${ex.sourceEvalTurnId},
        ${ex.question}, ${pg.json(ex.plan as unknown as postgres.JSONValue)}, ${ex.rationale ? pg.json(ex.rationale as unknown as postgres.JSONValue) : null},
        ${ex.category}, ${ex.difficulty},
        ${ex.qualityScore}, ${ex.isActive}, ${ex.addedBy},
        NOW(), NOW()
      )
    `;
  }
}

// ── Main sync function ────────────────────────────────────────────

export async function syncRegistryToDb(): Promise<{
  metrics: number;
  dimensions: number;
  relations: number;
  lenses: number;
  examples: number;
}> {
  const url = process.env.DATABASE_URL_ADMIN || process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL or DATABASE_URL_ADMIN is required');

  // Create a dedicated connection for the sync.
  // postgres.js natively serializes JS arrays as text[] in template literals.
  const pg = postgres(url, { max: 1, prepare: false });

  try {
    const allMetrics = [...CORE_METRICS, ...GOLF_METRICS, ...PMS_METRICS];
    const allDimensions = [...CORE_DIMENSIONS, ...GOLF_DIMENSIONS, ...PMS_DIMENSIONS];
    const allRelations = [...CORE_METRIC_DIMENSIONS, ...GOLF_METRIC_DIMENSIONS, ...PMS_METRIC_DIMENSIONS];
    const allLenses = [...SYSTEM_LENSES, ...PMS_SYSTEM_LENSES];
    const allExamples = toEvalExampleInserts(GOLF_EXAMPLES);

    await upsertDimensions(pg, allDimensions);
    await upsertMetrics(pg, allMetrics);
    await upsertRelations(pg, allRelations);
    await upsertLenses(pg, allLenses);
    await upsertExamples(pg, allExamples);

    // Invalidate in-memory cache so next request picks up fresh data
    invalidateRegistryCache();

    return {
      metrics: allMetrics.length,
      dimensions: allDimensions.length,
      relations: allRelations.length,
      lenses: allLenses.length,
      examples: allExamples.length,
    };
  } finally {
    await pg.end();
  }
}
