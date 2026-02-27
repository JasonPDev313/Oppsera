import { pgTable, text, boolean, timestamp, integer, jsonb, unique } from 'drizzle-orm/pg-core';
import { generateUlid } from '@oppsera/shared';

// ── Semantic Registry Schema ─────────────────────────────────────
// The registry stores metrics, dimensions, and their relationships.
// These drive the query compiler (Plan → SQL) and LLM context injection.
// NOT tenant-scoped (global registry) — tenants customize via lenses (see lenses.ts).

// ── Metric Definitions ───────────────────────────────────────────

export const semanticMetrics = pgTable('semantic_metrics', {
  id: text('id').primaryKey().$defaultFn(generateUlid),

  // Tenant scoping: NULL = system metric, set = custom tenant metric
  tenantId: text('tenant_id'),

  // Identity
  slug: text('slug').notNull(), // e.g. "net_sales", "rounds_played"
  displayName: text('display_name').notNull(),
  description: text('description'),

  // Grouping
  domain: text('domain').notNull(), // "core", "golf", "inventory", "customer"
  category: text('category'), // "revenue", "volume", "efficiency", etc.
  tags: text('tags').array(), // free-form tags for search

  // SQL compilation
  sqlExpression: text('sql_expression').notNull(), // e.g. "SUM(net_sales_cents) / 100.0"
  sqlTable: text('sql_table').notNull(),           // primary table for this metric
  sqlAggregation: text('sql_aggregation').notNull().default('sum'), // sum|count|avg|max|min|custom
  sqlFilter: text('sql_filter'),                   // optional WHERE clause fragment

  // Formatting
  dataType: text('data_type').notNull().default('number'), // number|currency|percent|integer|duration
  formatPattern: text('format_pattern'),            // e.g. "$0,0.00", "0.0%"
  unit: text('unit'),                               // "USD", "rounds", "ms"
  higherIsBetter: boolean('higher_is_better').default(true),

  // LLM context
  aliases: text('aliases').array(),                 // alternative names users say
  examplePhrases: text('example_phrases').array(),  // training examples for intent matching
  relatedMetrics: text('related_metrics').array(),  // slugs of related metrics

  // Constraints
  requiresDimensions: text('requires_dimensions').array(), // must be grouped by these dims
  incompatibleWith: text('incompatible_with').array(),     // slug conflicts

  // Lifecycle
  isActive: boolean('is_active').notNull().default(true),
  isExperimental: boolean('is_experimental').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── Dimension Definitions ────────────────────────────────────────

export const semanticDimensions = pgTable('semantic_dimensions', {
  id: text('id').primaryKey().$defaultFn(generateUlid),

  // Tenant scoping: NULL = system dimension, set = custom tenant dimension
  tenantId: text('tenant_id'),

  // Identity
  slug: text('slug').notNull(), // e.g. "date", "location", "item_category"
  displayName: text('display_name').notNull(),
  description: text('description'),

  // Grouping
  domain: text('domain').notNull(),
  category: text('category'), // "time", "geography", "product", "customer", "operation"
  tags: text('tags').array(),

  // SQL compilation
  sqlExpression: text('sql_expression').notNull(), // e.g. "business_date", "location_id"
  sqlTable: text('sql_table').notNull(),
  sqlDataType: text('sql_data_type').notNull().default('text'), // text|date|timestamptz|integer|uuid
  sqlCast: text('sql_cast'),                        // optional CAST expression

  // Hierarchy support
  hierarchyParent: text('hierarchy_parent'),        // parent dimension slug (e.g. "month" → "date")
  hierarchyLevel: integer('hierarchy_level').default(0), // 0=leaf, 1=rollup, 2=super-rollup

  // Time dimension config (for "date" category)
  isTimeDimension: boolean('is_time_dimension').notNull().default(false),
  timeGranularities: text('time_granularities').array(), // ["day","week","month","quarter","year"]

  // Lookup config (for FK dimensions)
  lookupTable: text('lookup_table'),                // e.g. "catalog_items"
  lookupKeyColumn: text('lookup_key_column'),       // e.g. "id"
  lookupLabelColumn: text('lookup_label_column'),   // e.g. "name"

  // LLM context
  aliases: text('aliases').array(),
  exampleValues: text('example_values').array(),    // sample values for LLM context
  examplePhrases: text('example_phrases').array(),

  // Lifecycle
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── Metric–Dimension Relationships ───────────────────────────────
// Declares which dimensions are valid for each metric.
// The query compiler enforces this when building GROUP BY clauses.

export const semanticMetricDimensions = pgTable(
  'semantic_metric_dimensions',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    metricSlug: text('metric_slug').notNull(),
    dimensionSlug: text('dimension_slug').notNull(),

    // Cardinality constraint
    isRequired: boolean('is_required').notNull().default(false),
    isDefault: boolean('is_default').notNull().default(false), // auto-include when metric selected
    sortOrder: integer('sort_order').notNull().default(0),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('uq_metric_dim').on(t.metricSlug, t.dimensionSlug)],
);

// ── Table Source Definitions ──────────────────────────────────────
// Maps logical table names to their physical SQL and join paths.
// Lets the compiler resolve cross-table joins automatically.

export const semanticTableSources = pgTable('semantic_table_sources', {
  id: text('id').primaryKey().$defaultFn(generateUlid),
  slug: text('slug').notNull().unique(),   // e.g. "rm_daily_sales", "catalog_items"
  physicalTable: text('physical_table').notNull(),
  tenantScoped: boolean('tenant_scoped').notNull().default(true),
  tenantColumn: text('tenant_column').default('tenant_id'),
  description: text('description'),
  // JSON array of join descriptors: [{ fromTable, fromCol, toTable, toCol, joinType }]
  joins: jsonb('joins').$type<JoinDescriptor[]>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── Lenses (Named Query Contexts) ────────────────────────────────
// A lens is a named, pre-configured query context for a specific use case.
// e.g. "Golf Revenue by Channel", "Daily Sales Summary", "Inventory Health"
// Lenses constrain the metrics/dimensions available to LLM, reducing hallucination.

export const semanticLenses = pgTable('semantic_lenses', {
  id: text('id').primaryKey().$defaultFn(generateUlid),
  // null = system lens (global); set = custom tenant lens
  tenantId: text('tenant_id'),
  slug: text('slug').notNull(),
  displayName: text('display_name').notNull(),
  description: text('description'),
  domain: text('domain').notNull(),

  // Allowed metrics/dimensions (null = all)
  allowedMetrics: text('allowed_metrics').array(),    // metric slugs
  allowedDimensions: text('allowed_dimensions').array(), // dimension slugs

  // Default context
  defaultMetrics: text('default_metrics').array(),
  defaultDimensions: text('default_dimensions').array(),
  defaultFilters: jsonb('default_filters').$type<LensFilter[]>(),

  // System prompt fragment injected when this lens is active
  systemPromptFragment: text('system_prompt_fragment'),

  // Example questions for this lens
  exampleQuestions: text('example_questions').array(),

  isActive: boolean('is_active').notNull().default(true),
  isSystem: boolean('is_system').notNull().default(false), // shipped with product, not user-created
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── Narrative Config ──────────────────────────────────────────────
// Platform-wide config for THE OPPS ERA LENS system prompt template.
// Single-row table — when a row exists, it overrides the hardcoded default.

export const semanticNarrativeConfig = pgTable('semantic_narrative_config', {
  id: text('id').primaryKey().default('global'),
  promptTemplate: text('prompt_template').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  updatedBy: text('updated_by'),
});

// ── Type helpers ─────────────────────────────────────────────────

export interface JoinDescriptor {
  fromTable: string;
  fromColumn: string;
  toTable: string;
  toColumn: string;
  joinType: 'INNER' | 'LEFT';
  alias?: string;
}

export interface LensFilter {
  dimensionSlug: string;
  operator: 'eq' | 'in' | 'gte' | 'lte' | 'between';
  value: unknown;
}
