# AI Insights / Semantic Layer — Comprehensive Specification

> **Purpose**: This document describes the complete architecture, components, and data flow of the OppsEra AI Insights system. Use it to understand what exists, what's reusable, and where to integrate a new LLM-based tool.

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Repository Layout](#2-repository-layout)
3. [Database Schema](#3-database-schema)
4. [Backend Pipeline Architecture](#4-backend-pipeline-architecture)
5. [LLM Integration Layer](#5-llm-integration-layer)
6. [Registry & Compiler](#6-registry--compiler)
7. [Intelligence Services](#7-intelligence-services)
8. [Caching & Rate Limiting](#8-caching--rate-limiting)
9. [Evaluation & Training Platform](#9-evaluation--training-platform)
10. [API Routes](#10-api-routes)
11. [Frontend Components](#11-frontend-components)
12. [Hooks & State Management](#12-hooks--state-management)
13. [RBAC & Middleware](#13-rbac--middleware)
14. [Reusable Components Inventory](#14-reusable-components-inventory)
15. [Integration Guide for New LLM Tools](#15-integration-guide-for-new-llm-tools)

---

## 1. System Overview

The AI Insights system is a **dual-mode semantic query engine** embedded in a multi-tenant SaaS ERP. Users ask natural language questions about their business data and receive formatted answers with charts, tables, and actionable recommendations.

### Two Execution Modes

| Mode | Name | How It Works | When Used |
|------|------|-------------|-----------|
| **A** | Metrics (Registry) | Compiles a query plan against a curated metric/dimension registry → parameterized SQL → execute | High-confidence matches to known metrics |
| **B** | SQL (LLM-generated) | LLM generates raw SQL from full DB schema catalog → validate → execute → auto-retry on failure | Complex/ad-hoc queries, snapshot tables, low-confidence intent |

### Key Design Principles

- **Never refuses a question** — biased toward attempting queries; falls back to ADVISOR MODE with industry best practices when data is unavailable
- **GL adapters never throw** — business operations always succeed regardless of analytics state
- **Fire-and-forget eval capture** — quality tracking never blocks user responses
- **Defense-in-depth SQL validation** — RLS is primary security; SQL validation is additional guard
- **Tenant isolation everywhere** — `tenant_id = $1` required in all generated SQL

### Tech Stack

| Layer | Technology |
|-------|-----------|
| LLM Provider | Anthropic Claude (with prompt caching) |
| LLM Adapter | Pluggable `LLMAdapter` interface (Anthropic implemented) |
| Streaming | Server-Sent Events (SSE) via `ReadableStream` |
| Database | Postgres 16 with RLS, queried via Drizzle ORM + `postgres.js` |
| Frontend | React 19 + Next.js 15 App Router |
| Charts | Recharts (line, bar, sparkline, metric card, comparison, table) |
| State | React hooks (no external state library for insights) |
| Caching | In-memory LRU (query cache + LLM response cache + registry SWR) |

---

## 2. Repository Layout

### Top-Level Structure

```
oppsera/
├── apps/
│   ├── web/                          # Main Next.js app (tenant-facing)
│   │   ├── src/app/api/v1/semantic/  # 51 API route files
│   │   ├── src/app/(dashboard)/insights/  # Insights pages
│   │   ├── src/components/semantic/  # Chat message, chat input
│   │   ├── src/components/insights/  # Sidebar, feedback, charts, badges
│   │   └── src/hooks/               # use-semantic-chat, use-feedback, use-session-history
│   └── admin/                        # Platform admin app (eval/training)
│       ├── src/app/api/v1/eval/      # 37 eval API route files
│       └── src/app/(admin)/train-ai/ # Training UI pages
├── packages/
│   ├── modules/
│   │   └── semantic/                 # @oppsera/module-semantic (core module)
│   │       └── src/
│   │           ├── llm/              # Pipeline, intent resolver, SQL generator, narrative, fast path, adapters
│   │           ├── registry/         # Metric/dimension registry, seed data, types
│   │           ├── compiler/         # Query plan → SQL compilation
│   │           ├── lenses/           # Custom lens CRUD, system lens queries
│   │           ├── cache/            # Query cache, LLM response cache
│   │           ├── evaluation/       # Eval capture, feedback, examples, quality scoring
│   │           ├── intelligence/     # Follow-ups, chart inference, data quality, plausibility
│   │           ├── rag/              # Few-shot retrieval, training store
│   │           ├── schema/           # Live DB schema catalog builder
│   │           ├── observability/    # Per-tenant metrics, latency tracking
│   │           ├── pii/             # PII masking (column heuristics + value regex)
│   │           ├── mcp/             # MCP resource exposure
│   │           └── config/          # Editable narrative template
│   ├── db/
│   │   ├── src/schema/semantic.ts    # 7 Drizzle schema tables
│   │   └── migrations/              # SQL migration files
│   └── shared/                       # Shared types, constants, utils
└── docs/specs/                       # This file
```

### Key File Paths (Exact)

| File | Lines | Purpose |
|------|-------|---------|
| `packages/modules/semantic/src/llm/pipeline.ts` | 1530 | Core pipeline orchestrator (both modes + streaming) |
| `packages/modules/semantic/src/llm/intent-resolver.ts` | ~400 | LLM intent resolution with Zod validation |
| `packages/modules/semantic/src/llm/sql-generator.ts` | ~500 | SQL generation with schema catalog + RAG |
| `packages/modules/semantic/src/llm/narrative.ts` | ~600 | THE OPPS ERA LENS narrative engine |
| `packages/modules/semantic/src/llm/fast-path.ts` | ~300 | Deterministic regex bypass (15+ patterns) |
| `packages/modules/semantic/src/llm/executor.ts` | ~200 | SQL execution with tenant isolation |
| `packages/modules/semantic/src/llm/adapters/anthropic.ts` | ~250 | Anthropic Claude adapter (streaming + caching) |
| `packages/modules/semantic/src/llm/types.ts` | 238 | All TypeScript type definitions |
| `packages/modules/semantic/src/registry/registry.ts` | ~400 | In-memory registry with SWR caching |
| `packages/modules/semantic/src/registry/types.ts` | 127 | MetricDef, DimensionDef, LensDef types |
| `packages/modules/semantic/src/compiler/` | ~300 | Plan → parameterized SQL compiler |
| `packages/modules/semantic/src/schema/schema-catalog.ts` | ~200 | Live DB introspection for SQL gen context |
| `packages/modules/semantic/src/intelligence/chart-inferrer.ts` | ~150 | Auto-detect optimal chart type |
| `packages/modules/semantic/src/intelligence/plausibility-checker.ts` | ~200 | Post-query result grading A–F |
| `packages/modules/semantic/src/pii/pii-masker.ts` | ~300 | Two-layer PII detection + masking |
| `packages/modules/semantic/src/cache/llm-cache.ts` | ~100 | LLM response cache (LRU + TTL) |
| `packages/modules/semantic/src/rag/few-shot-retriever.ts` | ~200 | RAG diversity + dedup |
| `packages/db/src/schema/semantic.ts` | 217 | All 7 DB table definitions |
| `apps/web/src/hooks/use-semantic-chat.ts` | 575 | Main chat hook (SSE streaming + fallback + thinking status) |
| `apps/web/src/hooks/use-feedback.ts` | 40 | Feedback submission hook |
| `apps/web/src/hooks/use-session-history.ts` | 119 | Session list with cursor pagination |
| `apps/web/src/components/semantic/chat-message.tsx` | 730 | Message bubble + ThinkingIndicator with tables, charts, debug |
| `apps/web/src/components/semantic/chat-input.tsx` | 78 | Auto-resize textarea input |
| `apps/web/src/components/insights/InlineChart.tsx` | 580 | Recharts wrapper (6 chart types) |
| `apps/web/src/components/insights/FeedbackWidget.tsx` | 214 | Thumbs + stars + tags + text |
| `apps/web/src/components/insights/ChatHistorySidebar.tsx` | 176 | Session history panel |
| `apps/web/src/components/insights/DataQualityBadge.tsx` | 162 | Grade badge (A–F) with factor breakdown |
| `apps/web/src/components/insights/FollowUpChips.tsx` | 63 | Suggested question chips |
| `apps/web/src/components/insights/RatingStars.tsx` | 74 | 5-star rating component |
| `apps/web/src/app/(dashboard)/insights/insights-content.tsx` | 538 | Main insights page (with ThinkingIndicator wiring) |
| `apps/web/src/app/(dashboard)/insights/lenses/lenses-content.tsx` | 191 | Lens management page |
| `apps/web/src/app/(dashboard)/insights/tools/tools-content.tsx` | 510 | Analysis tools page (4 tabs) |

---

## 3. Database Schema

### 7 Tables in `packages/db/src/schema/semantic.ts`

#### `semantic_metrics` — Metric Definitions
```
id              TEXT PK (ULID)
tenant_id       TEXT (NULL = system, set = custom tenant)
slug            TEXT NOT NULL (e.g. "net_sales", "rounds_played")
display_name    TEXT NOT NULL
description     TEXT
domain          TEXT NOT NULL ("core", "golf", "inventory", "customer")
category        TEXT ("revenue", "volume", "efficiency")
tags            TEXT[]
sql_expression  TEXT NOT NULL (e.g. "SUM(net_sales_cents) / 100.0")
sql_table       TEXT NOT NULL (primary table for this metric)
sql_aggregation TEXT NOT NULL DEFAULT 'sum' (sum|count|avg|max|min|custom)
sql_filter      TEXT (optional WHERE clause fragment)
data_type       TEXT NOT NULL DEFAULT 'number' (number|currency|percent|integer|duration)
format_pattern  TEXT (e.g. "$0,0.00")
unit            TEXT ("USD", "rounds", "ms")
higher_is_better BOOLEAN DEFAULT true
aliases         TEXT[] (alternative names users say)
example_phrases TEXT[] (training examples for intent matching)
related_metrics TEXT[] (slugs of related metrics)
requires_dimensions TEXT[] (must be grouped by these dims)
incompatible_with   TEXT[] (slug conflicts)
is_active       BOOLEAN NOT NULL DEFAULT true
is_experimental BOOLEAN NOT NULL DEFAULT false
created_at      TIMESTAMPTZ
updated_at      TIMESTAMPTZ
```

#### `semantic_dimensions` — Dimension Definitions
```
id              TEXT PK (ULID)
tenant_id       TEXT (NULL = system, set = custom)
slug            TEXT NOT NULL (e.g. "date", "location", "item_category")
display_name    TEXT NOT NULL
description     TEXT
domain          TEXT NOT NULL
category        TEXT ("time", "geography", "product", "customer", "operation")
tags            TEXT[]
sql_expression  TEXT NOT NULL
sql_table       TEXT NOT NULL
sql_data_type   TEXT NOT NULL DEFAULT 'text' (text|date|timestamptz|integer|uuid)
sql_cast        TEXT (optional CAST expression)
hierarchy_parent TEXT (parent dimension slug)
hierarchy_level  INTEGER DEFAULT 0
is_time_dimension BOOLEAN NOT NULL DEFAULT false
time_granularities TEXT[] (["day","week","month","quarter","year"])
lookup_table     TEXT (e.g. "catalog_items")
lookup_key_column TEXT
lookup_label_column TEXT
aliases          TEXT[]
example_values   TEXT[]
example_phrases  TEXT[]
is_active        BOOLEAN NOT NULL DEFAULT true
created_at       TIMESTAMPTZ
updated_at       TIMESTAMPTZ
```

#### `semantic_metric_dimensions` — M2M Relationships
```
id              TEXT PK (ULID)
metric_slug     TEXT NOT NULL
dimension_slug  TEXT NOT NULL
is_required     BOOLEAN NOT NULL DEFAULT false
is_default      BOOLEAN NOT NULL DEFAULT false
sort_order      INTEGER NOT NULL DEFAULT 0
UNIQUE(metric_slug, dimension_slug)
```

#### `semantic_table_sources` — Physical Table Mappings
```
id              TEXT PK (ULID)
slug            TEXT NOT NULL UNIQUE
physical_table  TEXT NOT NULL
tenant_scoped   BOOLEAN NOT NULL DEFAULT true
tenant_column   TEXT DEFAULT 'tenant_id'
description     TEXT
joins           JSONB (JoinDescriptor[])
```

**JoinDescriptor**: `{ fromTable, fromColumn, toTable, toColumn, joinType: 'INNER'|'LEFT', alias? }`

#### `semantic_lenses` — Named Query Contexts
```
id              TEXT PK (ULID)
tenant_id       TEXT (NULL = system, set = custom)
slug            TEXT NOT NULL
display_name    TEXT NOT NULL
description     TEXT
domain          TEXT NOT NULL
allowed_metrics     TEXT[] (NULL = all)
allowed_dimensions  TEXT[] (NULL = all)
default_metrics     TEXT[]
default_dimensions  TEXT[]
default_filters     JSONB (LensFilter[])
system_prompt_fragment TEXT (injected when lens active)
example_questions   TEXT[]
target_business_types TEXT[] (NULL = all business types)
is_active       BOOLEAN NOT NULL DEFAULT true
is_system       BOOLEAN NOT NULL DEFAULT false
```

**LensFilter**: `{ dimensionSlug, operator: 'eq'|'in'|'gte'|'lte'|'between', value }`

#### `semantic_narrative_config` — Editable OPPS ERA LENS Template
```
id              TEXT PK DEFAULT 'global'
prompt_template TEXT NOT NULL
updated_at      TIMESTAMPTZ
updated_by      TEXT
```

#### `tenant_lens_preferences` — Opt-Out Model
```
id              TEXT PK
tenant_id       TEXT NOT NULL
lens_slug       TEXT NOT NULL
enabled         BOOLEAN NOT NULL DEFAULT true
updated_at      TIMESTAMPTZ
```

### Evaluation Tables (in `packages/db/src/schema/evaluation.ts`)

| Table | Purpose |
|-------|---------|
| `semantic_eval_sessions` | Conversation tracking (session ID, tenant, user, timestamps) |
| `semantic_eval_turns` | Per-turn data: input, LLM plan, SQL, execution, feedback, admin review (57 columns) |
| `semantic_eval_examples` | Golden few-shot training data for RAG |
| `semantic_eval_quality_daily` | Pre-aggregated daily quality read model |

---

## 4. Backend Pipeline Architecture

### Entry Point: `runPipeline(input: PipelineInput): Promise<PipelineOutput>`

**File**: `packages/modules/semantic/src/llm/pipeline.ts` (1530 lines)

### Complete Flow Diagram

```
User Message
    │
    ▼
┌─────────────────────────────────┐
│  REQUEST COALESCING             │  Identical concurrent questions share
│  coalesceRequest()              │  one LLM call (Map<key, Promise>)
└──────────────┬──────────────────┘
               │
    ▼
┌─────────────────────────────────┐
│  CIRCUIT BREAKER                │  If Anthropic is down, return stale
│  checkCircuitBreaker()          │  cache instead of failing
└──────────────┬──────────────────┘
               │
    ▼
┌─────────────────────────────────┐
│  PARALLEL LOAD (Promise.all)    │
│  • Load active lens (if slug)   │
│  • Load registry catalog        │
│  • Build schema catalog (DB     │  Live DB introspection for SQL mode
│    introspection)               │
└──────────────┬──────────────────┘
               │
    ▼
┌─────────────────────────────────┐
│  FAST PATH CHECK                │  15+ regex patterns for common queries
│  tryFastPath(message, catalog)  │  ("sales today", "order count", etc.)
│  Returns ResolvedIntent | null  │  0ms latency, 0 tokens, confidence 0.95
└──────────────┬──────────────────┘
               │ (null = no match, fall through)
    ▼
┌─────────────────────────────────┐
│  INTENT RESOLUTION (LLM Call)   │
│  resolveIntent()                │
│  • Builds catalog snippet       │  Metrics + dimensions with metadata
│  • Retrieves RAG few-shot       │  Similar past queries (diversity 0.85)
│  • Calls LLM (4096 max tokens)  │
│  • Validates with Zod schema    │  IntentResponseSchema.safeParse()
│  Returns: mode, plan, confidence│
└──────────────┬──────────────────┘
               │
    ▼
┌─────────────────────────────────┐
│  MODE OVERRIDE CHECK            │
│  If plan references snapshot    │  rm_* tables → force SQL mode
│  tables → force SQL mode        │
└──────────────┬──────────────────┘
               │
    ┌──────────┴──────────┐
    │                     │
    ▼                     ▼
┌────────────┐    ┌────────────────┐
│  MODE A    │    │  MODE B        │
│  METRICS   │    │  SQL           │
│            │    │                │
│ compilePlan│    │ generateSql()  │  LLM generates raw SQL
│ → SQL      │    │ validateSql()  │  Defense-in-depth checks
│            │    │ executeSql()   │  With auto-retry on failure
│ executeQry │    │                │
└─────┬──────┘    └───────┬────────┘
      │                   │
      │    ┌──────────────┘
      │    │
      ▼    ▼
┌─────────────────────────────────┐
│  PII MASKING                    │
│  maskRowsForLLM(rows)           │  Column heuristics + value regex
└──────────────┬──────────────────┘
               │
    ▼
┌─────────────────────────────────┐
│  PLAUSIBILITY CHECK             │
│  checkPlausibility(rows, plan)  │  Grade A–F, warnings for anomalies
└──────────────┬──────────────────┘  (negative revenue, impossible counts)
               │
    ▼
┌─────────────────────────────────┐
│  NARRATIVE GENERATION (LLM)     │
│  generateNarrative()            │  THE OPPS ERA LENS framework
│  • Check LLM response cache     │
│  • Build system prompt          │  Industry hint + lens fragment + metrics
│  • Call LLM (2048 max tokens)   │
│  • Parse markdown → sections    │  HEADING_TO_SECTION mapping
│  • Cache response               │
└──────────────┬──────────────────┘
               │
    ▼
┌─────────────────────────────────┐
│  ENRICHMENTS (parallel)         │
│  • generateFollowUps()          │  3–4 contextual suggested questions
│  • inferChartConfig()           │  Auto-detect best chart type
│  • scoreDataQuality()           │  Confidence 0–100 with grade A–F
└──────────────┬──────────────────┘
               │
    ▼
┌─────────────────────────────────┐
│  EVAL CAPTURE (fire-and-forget) │
│  captureEvalTurn()              │  Records everything for training
└──────────────┬──────────────────┘
               │
    ▼
┌─────────────────────────────────┐
│  OBSERVABILITY                  │
│  recordSemanticRequest()        │  p50/p95 latency, cache hit rate,
│                                 │  token usage, error rate
└──────────────┬──────────────────┘
               │
    ▼
  PipelineOutput
```

### Fallback Chain

1. **Metrics mode returns 0 rows** → automatic retry in SQL mode (if time budget allows)
2. **SQL generation fails** → auto-retry with error context (1 retry max)
3. **All data retrieval fails** → ADVISOR MODE (LLM gives industry advice without data)
4. **LLM completely fails** → static `buildEmptyResultNarrative()` fallback

### Time Budget

- **Total pipeline budget**: 50,000ms (within 60s Vercel function limit)
- **Intent resolution**: ~2–5s
- **SQL generation**: ~3–8s
- **Query execution**: ~0.5–5s
- **Narrative generation**: ~3–8s
- **Enrichments**: ~1–3s (parallel)

### Streaming Variant: `runPipelineStreaming(input, callbacks)`

Emits progressive SSE events at each pipeline boundary:

| Event Type | Payload | When |
|-----------|---------|------|
| `status` | `{ stage: string, message: string }` | Each pipeline stage transition (5 stages: starting, loading, intent, executing, narrating). Frontend `ThinkingIndicator` displays `message` field. |
| `intent_resolved` | `{ plan, confidence, mode }` | After intent resolution |
| `data_ready` | `{ rows, rowCount }` | After query execution |
| `narrative_chunk` | `{ text: string }` | Progressive text deltas from LLM |
| `enrichments` | `{ followUps, chartConfig, dataQuality }` | After enrichment generation |
| `complete` | Full `PipelineOutput` | Pipeline finished |
| `error` | `{ message, code }` | On failure |

---

## 5. LLM Integration Layer

### Adapter Interface

```typescript
// packages/modules/semantic/src/llm/types.ts
interface LLMAdapter {
  complete(options: LLMCompletionOptions): Promise<LLMResponse>;
  completeStreaming?(options: LLMCompletionOptions & StreamCallbacks): Promise<LLMResponse>;
  provider: string;   // 'anthropic'
  model: string;      // 'claude-sonnet-4-5-20250929'
}

interface LLMCompletionOptions {
  systemPrompt?: string;
  systemPromptParts?: Array<{ text: string; cacheControl?: boolean }>;  // Anthropic prompt caching
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  maxTokens?: number;
  temperature?: number;
  stopSequences?: string[];
  model?: string;       // Override default model
  timeoutMs?: number;
}

interface LLMResponse {
  content: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  model: string;
  provider: string;
  cacheReadTokens?: number;   // Prompt cache hits
  cacheWriteTokens?: number;  // Prompt cache misses
}
```

### Anthropic Adapter Features

- **Prompt caching (SEM-02)**: `systemPromptParts` splits into stable (DB schema) and dynamic (context, RAG) blocks. Mark last stable block with `cacheControl: true` for ~90% input token cost reduction on cache hits.
- **SSE streaming**: Parses `content_block_delta` events, yields text chunks via `onChunk`, returns full `LLMResponse` for caching.
- **Beta header**: `anthropic-beta: prompt-caching-2024-07-31`

### Intent Resolver

**File**: `packages/modules/semantic/src/llm/intent-resolver.ts`

**Output type**:
```typescript
interface ResolvedIntent {
  mode: 'metrics' | 'sql';
  plan: QueryPlan;
  confidence: number;            // 0–1, clamped by Zod
  isClarification: boolean;
  clarificationText?: string;
  clarificationOptions?: string[];
  rawResponse: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  ragExamplesSnippet?: string;   // Passed downstream to SQL gen
}

interface QueryPlan {
  metrics: string[];        // Metric slugs
  dimensions: string[];     // Dimension slugs
  filters: PlanFilter[];
  orderBy?: string;
  limit?: number;
  dateRange?: { start: string; end: string };
}
```

**Key behaviors**:
- Biased toward attempting queries (Rule 3: only clarify when genuinely cannot map ANY part)
- Default to last 7 days when no date range (Rule 4)
- General business questions get confidence <0.6 with best-effort plan (Rule 8)
- Validates output with `IntentResponseSchema.safeParse()` — auto-defaults on failure

### SQL Generator

**File**: `packages/modules/semantic/src/llm/sql-generator.ts`

**System prompt sections**:
1. Output contract: `{ sql, explanation, confidence }`
2. Critical rules (SELECT only, tenant_id=$1, LIMIT required, no comments/semicolons)
3. Table distinctions (users vs customers)
4. Money conventions (8 subsections: cents vs dollars per table family)
5. Date conventions (business_date vs created_at)
6. Status conventions (order, tender, reservation, room enums)
7. Common SQL patterns (11+ templates)
8. Schema catalog (live DB introspection)
9. RAG few-shot examples (similar past queries)

**SQL Validation** (`validateGeneratedSql()`):
- SELECT/WITH only (no DDL/DML/TX/utility)
- No dangerous functions (`pg_sleep`, `set_config`, etc.)
- No comments or semicolons (multi-statement prevention)
- `tenant_id = $1` required
- LIMIT required (except aggregates)
- Table whitelist check against schema catalog

**Auto-retry**: On execution failure, sends failed SQL + error message back to LLM for one correction attempt.

### Deterministic Fast Path

**File**: `packages/modules/semantic/src/llm/fast-path.ts`

Matches unambiguous queries via 15+ regex patterns:

| Pattern | Example Query | Metric |
|---------|--------------|--------|
| `/sales?\s+(today\|for today)/i` | "sales today" | `net_sales` |
| `/sales?\s+yesterday/i` | "sales yesterday" | `net_sales` |
| `/sales?\s+(this week\|past week\|last 7)/i` | "sales this week" | `net_sales` |
| `/sales?\s+(this month\|current month)/i` | "sales this month" | `net_sales` |
| `/(how many\|total)\s+orders?\s+today/i` | "how many orders today" | `order_count` |
| `/average\s+order\s+(value\|size\|amount)/i` | "average order value" | `avg_order_value` |
| `/top\s+(\d+\s+)?items?\s+(sold\|selling)/i` | "top 10 items sold" | `item_qty_sold` |
| `/void\s+rate/i` | "void rate" | `void_rate` |
| `/(how many\|total)\s+customers?/i` | "how many customers" | `customer_count` |

**Guards**: Only triggers for single-turn queries <100 chars with no conversation history.
**Result**: `confidence: 0.95`, `0 tokens`, `0ms latency`, `provider: 'fast-path'`

### Narrative Engine — THE OPPS ERA LENS

**File**: `packages/modules/semantic/src/llm/narrative.ts`

**Framework**:
- **DATA-FIRST DECISION RULE**: Priority chain: REAL DATA → ASSUMPTIONS → BEST PRACTICE. Never refuses.
- **Adaptive depth**: DEFAULT (<400 words), DEEP (strategic), QUICK WINS (urgent help)
- **Industry translation**: `getIndustryHint(lensSlug)` auto-translates to user's industry

**Response sections** (all optional — skip what doesn't apply):

| Section Type | Content |
|-------------|---------|
| `answer` | 1–3 sentences, lead with number |
| `options` | 3 options with Effort/Impact rating |
| `recommendation` | Best option + confidence % |
| `quick_wins` | 3 immediate actions |
| `roi_snapshot` | Cost, impact, payback period |
| `what_to_track` | 2 metrics to monitor |
| `conversation_driver` | Follow-up questions |
| `data_sources` | Footer with metrics + period |

**Markdown parsing**: `parseMarkdownNarrative()` splits on `##`/`###` headings via `HEADING_TO_SECTION` lookup (20+ heading variants).

**Template placeholders**: `{{INDUSTRY_HINT}}`, `{{LENS_SECTION}}`, `{{METRIC_SECTION}}`

**Editable**: Stored in `semantic_narrative_config` table, admin-editable at `/train-ai/narrative`.

---

## 6. Registry & Compiler

### Registry

**File**: `packages/modules/semantic/src/registry/registry.ts`

- **In-memory cache** with stale-while-revalidate: 5min TTL + 10min SWR window
- **Content**: 16 core metrics, 8 core dimensions, 8 golf metrics, 6 golf dimensions, 60+ relations, 4 system lenses
- **Tenant scoping**: System metrics (`tenant_id IS NULL`) + custom tenant metrics coexist
- **Sync**: `syncRegistryToDb()` + `invalidateRegistryCache()`

### Compiler

**File**: `packages/modules/semantic/src/compiler/`

- `compilePlan(plan, catalog)` → validates metrics/dimensions against registry → builds parameterized SQL
- Enforces: tenant isolation, date range, max 10K rows, max 20 columns, max 15 filters
- Returns: `{ sql, params, metrics, dimensions }`

### Schema Catalog

**File**: `packages/modules/semantic/src/schema/schema-catalog.ts`

- `buildSchemaCatalog()` — introspects live DB to build table/column/type catalog
- Used by SQL generator for context injection
- Non-blocking — failure falls back to metrics-only mode

---

## 7. Intelligence Services

All in `packages/modules/semantic/src/intelligence/`:

| Service | File | Purpose |
|---------|------|---------|
| Follow-up Generator | `follow-up-generator.ts` | 3–4 contextual suggested questions from query results + plan |
| Chart Inferrer | `chart-inferrer.ts` | Auto-detect optimal chart type (line/bar/sparkline/table/metric_card/comparison) |
| Data Quality Scorer | `data-quality-scorer.ts` | Confidence 0–100 from row count, execution time, date range coverage, schema tables |
| Plausibility Checker | `plausibility-checker.ts` | Post-query grade A–F (negative revenue, impossible counts, unreasonable averages) |

### Tier 2 Intelligence (Insights Sub-Pages)

| Service | Purpose |
|---------|---------|
| Anomaly Detection | Z-score on `rm_daily_sales` read models |
| Root Cause Analyzer | Dimension decomposition |
| Correlation Engine | Pearson + p-value |
| Predictive Forecaster | Linear regression, SMA, exponential smoothing |
| What-If Simulator | Scenario modeling |
| Background Analyst | Proactive insight generation |

### Tier 3 (Agentic)

| Service | Purpose |
|---------|---------|
| Agentic Orchestrator | Multi-step Think/Act/Observe loop (5-step max, SELECT-only guardrails) |
| NL Report Builder | Natural language → report definition |

---

## 8. Caching & Rate Limiting

### Query Cache

**File**: `packages/modules/semantic/src/cache/query-cache.ts`

- **Key**: `djb2(tenantId + sql + params)`
- **Max entries**: 500
- **TTL**: 5 minutes
- **LRU eviction**
- **Invalidation**: `invalidateQueryCache(tenantId?)`

### LLM Response Cache

**File**: `packages/modules/semantic/src/cache/llm-cache.ts`

- **Key**: `djb2(tenantId + promptHash + userMessage + dataSummary + history)`
- **Prevents**: Redundant LLM calls for identical questions with same data
- **Separate from query cache** — stores narrative responses, not SQL results

### Registry Cache

- **Pattern**: Stale-while-revalidate (5min TTL + 10min SWR window)
- **Behavior**: Within TTL → instant return. Within SWR → stale data + background refresh. Beyond SWR → blocking refresh.
- **Invalidation**: `invalidateRegistryCache()`

### Rate Limiter

- **Per-tenant sliding window**: 30 requests/minute
- **Max tracked tenants**: 2K + LRU + 60s periodic cleanup
- **Response**: 429 with `Retry-After` and `X-RateLimit-Reset` headers

---

## 9. Evaluation & Training Platform

### Eval Capture Flow

```
Pipeline completes
    │
    ▼ (fire-and-forget)
captureEvalTurn({
  sessionId, turnNumber,
  userMessage, resolvedIntent,
  compiledSql, queryResult,
  narrative, enrichments,
  inputTokens, outputTokens,
  latencyMs, mode, provider
})
    │
    ▼
INSERT INTO semantic_eval_turns (57 columns)
```

### User Feedback

```
User clicks thumbs/stars/tags
    │
    ▼
POST /api/v1/semantic/eval/turns/{evalTurnId}/feedback
  { thumbsUp?, rating (1-5)?, tags[], text? }
    │
    ▼
UPDATE semantic_eval_turns SET user_rating, user_tags, user_feedback_text
```

### Admin Training Platform (Admin App)

| Page | Route | Purpose |
|------|-------|---------|
| Examples | `/train-ai/examples` | Golden few-shot examples CRUD + bulk import/export |
| Turn Detail | `/train-ai/turns/[id]` | Full turn inspection with plan/SQL/result viewers |
| Batch Review | `/train-ai/batch-review` | Bulk review workflows |
| Comparative | `/train-ai/comparative` | A/B comparison |
| Conversations | `/train-ai/conversations` | Conversation analysis |
| Cost Analytics | `/train-ai/cost` | Token/cost tracking |
| Experiments | `/train-ai/experiments` | A/B experiments |
| Playground | `/train-ai/playground` | Interactive testing |
| Regression | `/train-ai/regression` | Regression test suites |
| Safety | `/train-ai/safety` | Safety rule management |
| Narrative | `/train-ai/narrative` | Edit OPPS ERA LENS template |

### Quality Score Formula

`40% admin verdict + 30% user rating + 30% heuristics`

---

## 10. API Routes

### Web App — Semantic API (51 routes)

#### Core Query

| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/api/v1/semantic/ask` | Main conversational query (JSON response) |
| POST | `/api/v1/semantic/ask/stream` | SSE streaming variant |
| POST | `/api/v1/semantic/query` | Raw data mode (no narrative) |

#### Registry/Catalog

| Method | Route | Purpose |
|--------|-------|---------|
| GET/POST | `/api/v1/semantic/metrics` | List/create metrics |
| GET/PATCH/DELETE | `/api/v1/semantic/metrics/[slug]` | Individual metric |
| GET/POST | `/api/v1/semantic/dimensions` | List/create dimensions |
| GET/PATCH/DELETE | `/api/v1/semantic/dimensions/[slug]` | Individual dimension |
| GET | `/api/v1/semantic/lenses` | List lenses (system + custom + preferences) |
| GET/PATCH/DELETE | `/api/v1/semantic/lenses/[slug]` | Individual lens |
| GET/PATCH | `/api/v1/semantic/lenses/preferences` | Tenant enable/disable toggles |

#### Sessions

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/api/v1/semantic/sessions` | List sessions (cursor-paginated) |
| GET | `/api/v1/semantic/sessions/[sessionId]` | Session detail + all turns |

#### Feedback/Eval

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/api/v1/semantic/eval/feed` | Eval turn history feed |
| POST | `/api/v1/semantic/eval/turns/[id]/feedback` | Submit user feedback |

#### Admin

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/api/v1/semantic/admin/metrics` | Observability metrics |
| POST | `/api/v1/semantic/admin/invalidate` | Cache invalidation |

#### Intelligence (Tier 2 — 35+ routes)

| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/api/v1/semantic/root-cause` | Root cause analysis |
| POST | `/api/v1/semantic/correlations` | Correlation analysis |
| POST | `/api/v1/semantic/forecast` | Predictive forecasting |
| POST | `/api/v1/semantic/agentic` | Agentic orchestrator |
| POST | `/api/v1/semantic/nl-report` | NL report builder |
| GET/POST | `/api/v1/semantic/pinned-metrics` | Watchlist CRUD |
| GET/POST | `/api/v1/semantic/embed` | Embeddable widgets |
| GET/POST | `/api/v1/semantic/scheduled-reports` | Scheduled AI reports |
| GET/POST | `/api/v1/semantic/annotations` | Data annotations |
| GET/POST | `/api/v1/semantic/branches` | Analysis branches |
| GET/POST | `/api/v1/semantic/goals` | AI goals |
| GET/POST | `/api/v1/semantic/alerts/rules` | Alert rules |
| GET/POST | `/api/v1/semantic/findings` | AI findings |
| GET/POST | `/api/v1/semantic/simulations` | What-if simulations |
| GET/PATCH | `/api/v1/semantic/preferences` | User AI preferences |
| GET/POST | `/api/v1/semantic/shared` | Shared insight snapshots |
| GET | `/api/v1/semantic/data-quality` | Data quality dashboard |
| GET | `/api/v1/semantic/feed` | AI feed |

### Admin App — Eval API (37 routes)

| Category | Routes | Purpose |
|----------|--------|---------|
| Examples | 5 routes | CRUD + bulk import/export + effectiveness |
| Turns | 4 routes | Detail, promote, promote-correction, review |
| Batch Review | 2 routes | List + individual batch |
| Experiments | 5 routes | CRUD + start + complete |
| Safety | 5 routes | Rules CRUD + violations + resolve |
| Regression | 3 routes | Runs + individual + trend |
| Analytics | 7 routes | Conversations, cost, dashboard, feed, patterns, compare |
| Other | 6 routes | Playground, sessions, tenants, lenses CRUD, narrative, aggregation trigger |

### Middleware Pattern

Every route uses `withMiddleware(handler, options)`:

```typescript
export const POST = withMiddleware(handler, {
  entitlement: 'semantic',
  permission: 'semantic.query',
});
```

---

## 11. Frontend Components

### Component Hierarchy

```
InsightsContent (539 lines — main page)
├── Lens selector dropdown (localStorage: 'insights_selected_lens')
├── Debug toggle (localStorage: 'insights_debug_mode')
├── ChatHistorySidebar (176 lines)
│   └── SessionItem (session list with cursor pagination)
├── Message list (auto-scroll)
│   └── ChatMessageBubble (687 lines — per message)
│       ├── Simple markdown renderer (headers, bold, code, lists)
│       ├── QueryResultTable (data tables with alternating rows)
│       ├── QueryTransparencyPanel (compiled SQL with copy)
│       ├── PlanDebugPanel (mode, confidence, filters, metrics)
│       ├── InlineChart (580 lines — 6 chart types via Recharts)
│       ├── DataQualityBadge (162 lines — grade A–F)
│       ├── FollowUpChips (63 lines — suggested questions)
│       ├── AnalysisActionBar (root cause, correlation, forecast, what-if)
│       ├── PinMetricButton / PinMetricsBar (watchlist)
│       └── FeedbackWidget (214 lines)
│           └── RatingStars (74 lines — 5-star component)
└── ChatInput (78 lines — auto-resize textarea)
```

### Sub-Pages

| Page | Path | Lines | Key Feature |
|------|------|-------|-------------|
| Insights (Chat) | `/insights` | 539 | Main chat + history sidebar + suggested questions |
| Lenses | `/insights/lenses` | 191 | System/custom lens toggle management |
| Tools | `/insights/tools` | 510 | 4-tab analysis tools (Root Cause, Correlations, Forecast, What-If) |
| History | `/insights/history` | — | Full session list with Open/Export |
| AI Tools Hub | `/insights/ai-tools` | — | 7-tab hub lazy-loading sub-pages |
| Authoring | `/insights/authoring` | — | Custom metric/dimension editor |
| Embeds | `/insights/embeds` | — | Embeddable widget management |
| Reports | `/insights/reports` | — | NL report builder |
| Watchlist | `/insights/watchlist` | — | Pinned metric monitoring |

### Chart Types (InlineChart)

| Type | Rendering | When Used |
|------|-----------|-----------|
| `line` | Recharts LineChart with multi-series | Time-series data with date x-axis |
| `bar` | Recharts BarChart | Category comparisons |
| `sparkline` | Mini LineChart with trend arrow (up/down/flat %) | Single metric overview |
| `table` | HTML table with formatted cells | Raw data display |
| `metric_card` | Large number + label | Single KPI answer |
| `comparison` | Two bars (value vs comparison) with delta | Before/after or target comparison |

### Value Formatting

- **Currency**: `$1.2K`, `$15.3M` (abbreviated)
- **Number**: `1.2K`, `15.3M`
- **Percent**: `12.3%`
- **Colors**: Blue, emerald, amber, violet (up to 4 series)

---

## 12. Hooks & State Management

### `useSemanticChat(options?)` — Main Chat Hook

**File**: `apps/web/src/hooks/use-semantic-chat.ts` (575 lines)

```typescript
interface UseSemanticChatOptions {
  sessionId?: string;
  lensSlug?: string;
  timezone?: string;
}

// Returns:
{
  messages: ChatMessage[];
  isLoading: boolean;
  isStreaming: boolean;
  error: string | null;
  streamingStatus: string | null;   // Current pipeline stage message (e.g., "Running analysis…")
  completedStages: string[];        // Previously completed stage messages (e.g., ["Starting analysis…", "Understanding your question…"])
  sendMessage: (text: string) => Promise<void>;
  cancelRequest: () => void;
  clearMessages: () => void;
  initFromSession: (sessionId: string, turns: LoadedTurn[]) => void;
  sessionId: string;
}
```

**Key behaviors**:
- 10-message context window for conversation history
- SSE streaming with automatic fallback to JSON POST
- AbortController with 90s timeout
- Request cancellation via `cancelRequest()`
- Session persistence — `initFromSession()` maps DB turns to `ChatMessage[]`
- Dual-mode pipeline support (metrics vs SQL) — transparent to caller
- **Thinking status indicator**: SSE `status` events (previously ignored) are now captured. `streamingStatus` holds the current pipeline stage message, `completedStages` accumulates completed stage messages. Both are cleared when the first `narrative_chunk` arrives (thinking done, narrative streaming begins). Reset on `sendMessage`, `cancelRequest`, `clearMessages`, `complete`, and `error`.

### `useSubmitFeedback()` — Feedback Hook

**File**: `apps/web/src/hooks/use-feedback.ts` (40 lines)

```typescript
interface FeedbackPayload {
  thumbsUp?: boolean;
  rating?: number;    // 1–5
  tags?: string[];
  text?: string;
}

// Returns:
{
  submitFeedback: (evalTurnId: string, payload: FeedbackPayload) => Promise<void>;
  isSubmitting: boolean;
  error: string | null;
}
```

### `useSessionHistory(options?)` — Session List Hook

**File**: `apps/web/src/hooks/use-session-history.ts` (119 lines)

```typescript
interface SessionSummary {
  id: string;
  sessionId: string;
  startedAt: string;
  messageCount: number;
  avgUserRating: number | null;
  firstMessage: string;
}

// Returns:
{
  sessions: SessionSummary[];
  isLoading: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  loadMore: () => void;
  refresh: () => void;
}
```

### State Management Approach

- **No external state library** — pure React hooks (`useState`, `useRef`, `useCallback`, `useEffect`)
- **LocalStorage persistence**: `insights_history_open`, `insights_selected_lens`, `insights_debug_mode`
- **Refresh pattern**: Parent increments `refreshKey` counter after `sendMessage`, child detects via `useRefreshOnChange` and triggers 1s delayed refresh

---

## 13. RBAC & Middleware

### Middleware Chain

Every API route uses `withMiddleware(handler, options)`:

```
authenticate → resolveTenant → resolveLocation → requireEntitlement → requirePermission → handler
```

### Semantic Permissions

| Permission | Used For |
|-----------|----------|
| `semantic.query` | Ask questions (POST `/ask`, `/ask/stream`, `/query`) |
| `semantic.view` | View metrics, dimensions, lenses, sessions |
| `semantic.manage` | Create/edit custom metrics, dimensions, lenses |
| `semantic.admin` | Admin observability metrics, cache invalidation |

### Entitlement

- Module key: `semantic`
- Three modes: `off` | `view` | `full`
- `requireEntitlement('semantic')` — blocks `off` mode
- `requireEntitlementWrite('semantic')` — blocks `view` mode (for POST/PATCH/DELETE)

### Rate Limiting

- `checkSemanticRateLimit(tenantId)` — 30 req/min per tenant
- Returns 429 with `Retry-After` and `X-RateLimit-Reset` headers

### Tenant Isolation

- Every SQL query includes `tenant_id = $1`
- RLS policies enforce at DB level (defense-in-depth)
- `withTenant(tenantId, callback)` sets `SET LOCAL` config for RLS

---

## 14. Reusable Components Inventory

### Backend — Ready to Reuse

| Component | Import Path | What It Does |
|-----------|------------|--------------|
| `LLMAdapter` interface | `@oppsera/module-semantic/llm` | Pluggable LLM provider abstraction |
| Anthropic adapter | `semantic/src/llm/adapters/anthropic.ts` | Claude integration with prompt caching + streaming |
| `validateGeneratedSql()` | `semantic/src/llm/sql-generator.ts` | Defense-in-depth SQL validation |
| `buildSchemaCatalog()` | `semantic/src/schema/schema-catalog.ts` | Live DB introspection |
| `maskRowsForLLM()` | `@oppsera/module-semantic` | PII masking (column heuristics + value regex) |
| `maskFreeText()` | `@oppsera/module-semantic` | PII masking for free text |
| Query cache | `semantic/src/cache/query-cache.ts` | LRU + TTL cache for SQL results |
| LLM response cache | `semantic/src/cache/llm-cache.ts` | LRU + TTL cache for LLM responses |
| Rate limiter | `packages/core/src/security/rate-limiter.ts` | Sliding window per-tenant rate limiting |
| `withMiddleware()` | `@oppsera/core` | Full auth/RBAC/entitlement middleware chain |
| `publishWithOutbox()` | `@oppsera/core` | Transactional outbox pattern |
| `withTenant()` | `@oppsera/db` | RLS-scoped DB transactions |
| Eval capture service | `semantic/src/evaluation/` | Fire-and-forget turn recording |
| Registry (SWR cache) | `semantic/src/registry/registry.ts` | In-memory metric/dimension catalog |

### Frontend — Ready to Reuse

| Component | Path | What It Does |
|-----------|------|--------------|
| `ChatInput` | `components/semantic/chat-input.tsx` | Auto-resize textarea with send/cancel |
| `ChatMessageBubble` | `components/semantic/chat-message.tsx` | Full message renderer (markdown, tables, charts, debug) |
| `ThinkingIndicator` | `components/semantic/chat-message.tsx` | Pipeline stage progress (checkmarks + spinner) |
| `InlineChart` | `components/insights/InlineChart.tsx` | 6 chart types via Recharts |
| `FeedbackWidget` | `components/insights/FeedbackWidget.tsx` | Thumbs + stars + tags + text |
| `RatingStars` | `components/insights/RatingStars.tsx` | 5-star rating component |
| `DataQualityBadge` | `components/insights/DataQualityBadge.tsx` | Grade A–F with factor breakdown |
| `FollowUpChips` | `components/insights/FollowUpChips.tsx` | Suggested question chips |
| `ChatHistorySidebar` | `components/insights/ChatHistorySidebar.tsx` | Session history panel |
| `useSemanticChat` | `hooks/use-semantic-chat.ts` | SSE streaming chat with session management + thinking status |
| `useSubmitFeedback` | `hooks/use-feedback.ts` | Feedback submission |
| `useSessionHistory` | `hooks/use-session-history.ts` | Cursor-paginated session list |

### Shared Utilities

| Utility | Path | What It Does |
|---------|------|--------------|
| `apiFetch` | `apps/web/src/lib/api-client.ts` | JWT-authenticated fetch with circuit breaker + refresh |
| `buildQueryString` | `apps/web/src/lib/query-string.ts` | URL param builder (skips null/undefined) |
| `formatMoney` | `@oppsera/shared` | Currency formatting |
| `generateUlid` | `@oppsera/shared` | ULID ID generation |

---

## 15. Integration Guide for New LLM Tools

### Where to Put New Code

| What | Where | Pattern |
|------|-------|---------|
| New LLM adapter | `packages/modules/semantic/src/llm/adapters/` | Implement `LLMAdapter` interface |
| New pipeline variant | `packages/modules/semantic/src/llm/` | Follow `pipeline.ts` patterns |
| New intelligence service | `packages/modules/semantic/src/intelligence/` | Pure function, no side effects |
| New API route | `apps/web/src/app/api/v1/semantic/` | Use `withMiddleware()` |
| New frontend page | `apps/web/src/app/(dashboard)/insights/` | Code-split: thin `page.tsx` + `*-content.tsx` |
| New hook | `apps/web/src/hooks/` | Follow `use-semantic-chat.ts` patterns |
| New component | `apps/web/src/components/insights/` | Dark mode compliant (no `bg-white`, no `dark:`) |
| New DB table | `packages/db/src/schema/` | Add migration, update `_journal.json` |
| Background job | Wire in `apps/web/src/instrumentation.ts` | Fire-and-forget pattern |
| Shared constants | `packages/shared/src/constants/` | Export from `@oppsera/shared` |

### Connecting to the Existing Pipeline

To reuse the existing pipeline for a new tool:

```typescript
import { runPipeline, runPipelineStreaming } from '@oppsera/module-semantic';

// JSON mode
const result = await runPipeline({
  message: 'What were sales last week?',
  context: {
    tenantId: ctx.tenantId,
    locationId: ctx.locationId,
    userId: ctx.user.id,
    userRole: ctx.user.role,
    sessionId: 'new-session-id',
    lensSlug: 'retail-sales',      // Optional lens constraint
    history: [],                    // Previous messages for context
    currentDate: new Date().toISOString().split('T')[0],
    timezone: 'America/New_York',
  },
  skipNarrative: false,             // Set true for raw data only
  stream: false,
});

// Streaming mode
await runPipelineStreaming(
  { message, context, stream: true },
  {
    onEvent: (event) => {
      // Handle SSE events: status, intent_resolved, data_ready,
      // narrative_chunk, enrichments, complete, error
    },
  },
);
```

### Creating a New SSE Streaming Endpoint

```typescript
// apps/web/src/app/api/v1/your-tool/stream/route.ts
import { withMiddleware } from '@oppsera/core';
import { runPipelineStreaming } from '@oppsera/module-semantic';

async function handler(req, ctx) {
  const body = await req.json();

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const emit = (event) => {
        controller.enqueue(
          encoder.encode(`event: ${event.type}\ndata: ${JSON.stringify(event.payload)}\n\n`)
        );
      };

      try {
        await runPipelineStreaming(
          { message: body.message, context: { tenantId: ctx.tenantId, ... } },
          { onEvent: emit },
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}

export const POST = withMiddleware(handler, {
  entitlement: 'semantic',
  permission: 'semantic.query',
});
```

### Adding a New Frontend Chat-Like Component

```tsx
// Reuse the existing hooks and components
import { useSemanticChat } from '@/hooks/use-semantic-chat';
import { ChatInput } from '@/components/semantic/chat-input';
import { ChatMessageBubble, ThinkingIndicator } from '@/components/semantic/chat-message';
import { InlineChart } from '@/components/insights/InlineChart';
import { FeedbackWidget } from '@/components/insights/FeedbackWidget';

function MyNewTool() {
  const { messages, isLoading, isStreaming, streamingStatus, completedStages, sendMessage, cancelRequest } =
    useSemanticChat({ lensSlug: 'my-lens' });

  return (
    <div>
      {messages.map((msg) => (
        <ChatMessageBubble key={msg.id} message={msg} isStreaming={isStreaming} />
      ))}
      {/* Show pipeline thinking stages while streaming before narrative arrives */}
      {isStreaming && streamingStatus && (
        <ThinkingIndicator currentStatus={streamingStatus} completedStages={completedStages} />
      )}
      <ChatInput onSend={sendMessage} onCancel={cancelRequest} isLoading={isLoading} />
    </div>
  );
}
```

### Key Conventions to Follow

1. **Module isolation**: Never import from another module's internals. Use `@oppsera/module-semantic` public exports.
2. **Middleware**: Always use `withMiddleware()` with `entitlement` + `permission`.
3. **Dark mode**: Use `bg-surface`, `text-foreground`, `border-border`. No `bg-white`, no `dark:` prefixes.
4. **Code splitting**: Every page uses thin `page.tsx` wrapper with `next/dynamic({ ssr: false })`.
5. **Tenant isolation**: All SQL must include `tenant_id = $1`. Use `withTenant()` for RLS.
6. **Error handling**: LLM services never throw — catch and degrade gracefully.
7. **Fire-and-forget**: Eval capture and audit logs use `.catch(() => {})` — never block user response.
8. **Money convention**: Orders/tenders = cents (INTEGER). GL/catalog/reports = dollars (NUMERIC). Convert at boundaries.

---

## Appendix A: TypeScript Types Quick Reference

```typescript
// Pipeline I/O
interface PipelineInput {
  message: string;
  context: IntentContext;
  examples?: EvalExample[];
  skipNarrative?: boolean;
  stream?: boolean;
}

interface PipelineOutput {
  mode: 'metrics' | 'sql';
  narrative: string;
  sections: NarrativeSection[];
  data: { rows: Record<string, unknown>[]; rowCount: number; executionTimeMs: number };
  plan: QueryPlan;
  isClarification: boolean;
  clarificationText?: string;
  clarificationOptions?: string[];
  evalTurnId?: string;
  inputTokens: number;
  outputTokens: number;
  totalLatencyMs: number;
  suggestedFollowUps?: string[];
  chartConfig?: ChartConfig;
  dataQuality?: { grade: string; score: number; factors: Record<string, number> };
  plausibility?: { grade: string; warnings: string[] };
}

// Intent
interface IntentContext {
  tenantId: string;
  locationId?: string;
  userId: string;
  userRole?: string;
  sessionId: string;
  lensSlug?: string;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  currentDate: string;
  timezone?: string;
}

// Chat (Frontend)
interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  plan?: QueryPlan;
  data?: { rows: any[]; rowCount: number };
  evalTurnId?: string;
  isStreaming?: boolean;
  suggestedFollowUps?: string[];
  chartConfig?: ChartConfig;
  dataQuality?: { grade: string; score: number; factors?: Record<string, number> };
  mode?: 'metrics' | 'sql';
  compiledSql?: string;
}

// Chart
interface ChartConfig {
  type: 'line' | 'bar' | 'sparkline' | 'table' | 'metric_card' | 'comparison';
  xAxis?: string;
  yAxis: Array<{ key: string; label: string; format?: string }>;
  title?: string;
  xLabel?: string;
  yLabel?: string;
  yFormat?: string;
  comparisonLabel?: string;
}

// SSE Events
type SSEEventType =
  | 'status'
  | 'intent_resolved'
  | 'data_ready'
  | 'narrative_chunk'
  | 'enrichments'
  | 'complete'
  | 'error';
```

---

## Appendix B: Environment Variables

| Variable | Purpose |
|----------|---------|
| `ANTHROPIC_API_KEY` | LLM provider API key |
| `DATABASE_URL` | Postgres connection string |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key |

---

## Appendix C: Module Exports

```typescript
// packages/modules/semantic/src/index.ts
export const MODULE_KEY = 'semantic';
export const MODULE_NAME = 'AI Insights / Semantic Layer';
export const MODULE_VERSION = '0.1.0';

// Sub-module re-exports:
export * from './evaluation';       // Eval capture, feedback, examples
export * from './registry';         // Registry, seed data, types
export * from './compiler';         // Plan → SQL compiler
export * from './llm';              // Pipeline, intent, SQL gen, narrative, fast path, adapters, types
export * from './lenses';           // Custom lens CRUD
export * from './cache';            // Query cache, LLM cache
export * from './observability';    // Metrics tracking
export * from './intelligence';     // Follow-ups, chart inference, data quality, plausibility
export * from './rag';              // Few-shot retrieval, training store
export * from './config';           // Narrative template config
export { maskRowsForLLM, maskFreeText } from './pii/pii-masker';
export * from './mcp';              // MCP resource exposure
```
