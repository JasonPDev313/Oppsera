-- Migration: 0072_semantic_registry
-- Semantic registry: metrics, dimensions, relationships, lenses.
-- These are global (not tenant-scoped) — they define the language the AI speaks.
-- Tenant customization happens via lenses.

-- ── Metric definitions ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS semantic_metrics (
  id                  TEXT PRIMARY KEY,
  slug                TEXT NOT NULL UNIQUE,
  display_name        TEXT NOT NULL,
  description         TEXT,
  domain              TEXT NOT NULL,
  category            TEXT,
  tags                TEXT[],
  sql_expression      TEXT NOT NULL,
  sql_table           TEXT NOT NULL,
  sql_aggregation     TEXT NOT NULL DEFAULT 'sum',
  sql_filter          TEXT,
  data_type           TEXT NOT NULL DEFAULT 'number',
  format_pattern      TEXT,
  unit                TEXT,
  higher_is_better    BOOLEAN DEFAULT TRUE,
  aliases             TEXT[],
  example_phrases     TEXT[],
  related_metrics     TEXT[],
  requires_dimensions TEXT[],
  incompatible_with   TEXT[],
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  is_experimental     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_semantic_metrics_domain   ON semantic_metrics (domain);
CREATE INDEX idx_semantic_metrics_slug     ON semantic_metrics (slug) WHERE is_active = TRUE;

-- ── Dimension definitions ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS semantic_dimensions (
  id                  TEXT PRIMARY KEY,
  slug                TEXT NOT NULL UNIQUE,
  display_name        TEXT NOT NULL,
  description         TEXT,
  domain              TEXT NOT NULL,
  category            TEXT,
  tags                TEXT[],
  sql_expression      TEXT NOT NULL,
  sql_table           TEXT NOT NULL,
  sql_data_type       TEXT NOT NULL DEFAULT 'text',
  sql_cast            TEXT,
  hierarchy_parent    TEXT,
  hierarchy_level     INTEGER DEFAULT 0,
  is_time_dimension   BOOLEAN NOT NULL DEFAULT FALSE,
  time_granularities  TEXT[],
  lookup_table        TEXT,
  lookup_key_column   TEXT,
  lookup_label_column TEXT,
  aliases             TEXT[],
  example_values      TEXT[],
  example_phrases     TEXT[],
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_semantic_dimensions_domain ON semantic_dimensions (domain);
CREATE INDEX idx_semantic_dimensions_slug   ON semantic_dimensions (slug) WHERE is_active = TRUE;

-- ── Metric–Dimension relationships ──────────────────────────────

CREATE TABLE IF NOT EXISTS semantic_metric_dimensions (
  id              TEXT PRIMARY KEY,
  metric_slug     TEXT NOT NULL REFERENCES semantic_metrics (slug) ON DELETE CASCADE,
  dimension_slug  TEXT NOT NULL REFERENCES semantic_dimensions (slug) ON DELETE CASCADE,
  is_required     BOOLEAN NOT NULL DEFAULT FALSE,
  is_default      BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (metric_slug, dimension_slug)
);

CREATE INDEX idx_semantic_md_metric ON semantic_metric_dimensions (metric_slug);
CREATE INDEX idx_semantic_md_dimension ON semantic_metric_dimensions (dimension_slug);

-- ── Table sources ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS semantic_table_sources (
  id              TEXT PRIMARY KEY,
  slug            TEXT NOT NULL UNIQUE,
  physical_table  TEXT NOT NULL,
  tenant_scoped   BOOLEAN NOT NULL DEFAULT TRUE,
  tenant_column   TEXT DEFAULT 'tenant_id',
  description     TEXT,
  joins           JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Lenses ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS semantic_lenses (
  id                      TEXT PRIMARY KEY,
  slug                    TEXT NOT NULL UNIQUE,
  display_name            TEXT NOT NULL,
  description             TEXT,
  domain                  TEXT NOT NULL,
  allowed_metrics         TEXT[],
  allowed_dimensions      TEXT[],
  default_metrics         TEXT[],
  default_dimensions      TEXT[],
  default_filters         JSONB,
  system_prompt_fragment  TEXT,
  example_questions       TEXT[],
  is_active               BOOLEAN NOT NULL DEFAULT TRUE,
  is_system               BOOLEAN NOT NULL DEFAULT FALSE,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_semantic_lenses_domain ON semantic_lenses (domain);
CREATE INDEX idx_semantic_lenses_slug   ON semantic_lenses (slug) WHERE is_active = TRUE;
