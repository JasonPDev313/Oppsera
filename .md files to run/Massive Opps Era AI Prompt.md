OppsEra — Semantic Layer + LLM Query Foundation
Build Sessions (Copy/Paste into Claude Sequentially)
Each session below is self-contained. Paste the full prompt into a new Claude session. After each session, save the generated code to your repo before starting the next one. Sessions build on each other — complete them in order.
Pre-requisite for every session: Paste your CLAUDE.md and CONVENTIONS.md into context before each prompt (or attach them as files).

BUILD ORDER
Phase 0 — Super Admin Panel + Feedback Infrastructure (build FIRST)

Session 0: Evaluation DB schema + feedback capture service (shared backend)
Session 0.5: Super Admin Panel scaffold (apps/admin/) + Eval Review UI as first feature

Phase 1 — Core Semantic Layer (build and integrate incrementally)

Sessions 1-4: Schema → Engine → LLM → API (stop and test after each)

Phase 2 — Datasets + Lenses

Sessions 5-6: Golf analytics + Custom Lenses

Phase 3 — Customer App Frontend + Polish

Sessions 7-10: Chat UI (in apps/web/, includes user feedback widget) → Performance → E2E tests → Final wiring

Architecture Note: The super admin panel (apps/admin/) is a SEPARATE Next.js app hosted on its own subdomain (e.g., admin.oppsera.com). It is NOT linked to the customer-facing app (apps/web/). The customer app only has the lightweight FeedbackWidget (thumbs up/down + stars + tags). All review, analytics, pattern analysis, and golden example management lives exclusively in the super admin panel.

Session 0 of 12 — Evaluation DB + Capture Service (Shared Backend — BUILD THIS FIRST)
CONTEXT: I'm about to build a semantic layer + LLM query module for OppsEra (multi-tenant SaaS ERP). Before I build ANY of the semantic layer code, I need evaluation infrastructure so I can see what the LLM is doing, collect user feedback, and iterate on quality.

You have my CLAUDE.md and CONVENTIONS.md for full project context.

This module will capture EVERY interaction with the future semantic/LLM layer: the user's question, the LLM's plan, the compiled SQL, the query results, the narrative response, user ratings, and admin reviews. It must work from day 1 of development — not bolted on later.

IMPORTANT: This session builds ONLY the shared backend (DB schema, capture service, user-facing feedback submission). The admin review interface, quality dashboard, golden example management, and all admin API routes are built separately in Session 0.5 as part of the Super Admin Panel (apps/admin/) — a SEPARATE Next.js app on its own subdomain. The customer-facing app (apps/web/) will only have the lightweight FeedbackWidget (built in Session 7).

TASK: Build the evaluation database schema and shared capture service.

BUILD THESE FILES:

### Database Schema

1) **packages/db/src/schema/evaluation.ts** — Drizzle schema for these tables:

   `semantic_eval_sessions` — conversation-level tracking:
   - id (ULID), tenantId, userId, sessionId (FK to ai_conversations if exists, otherwise standalone)
   - startedAt, endedAt (nullable — set when session ends)
   - messageCount (integer, default 0)
   - avgUserRating (numeric(3,2), nullable — computed rolling average)
   - avgAdminScore (numeric(3,2), nullable — computed from admin reviews)
   - status (text: 'active' | 'completed' | 'flagged' | 'reviewed')
   - lensId (text, nullable — which lens was active)
   - metadata (jsonb — tenant businessType, user role, any context)
   - createdAt, updatedAt

   `semantic_eval_turns` — the core evaluation table (one row per question→response cycle):
   - id (ULID), tenantId, sessionId (FK to eval_sessions)
   - userId, userRole (text — cached at write time so we can analyze by role)
   - turnNumber (integer — position in conversation)

   - **Input capture:**
     - userMessage (text — the raw question)
     - contextSnapshot (jsonb — locationId, dateRange, any session context passed in)

   - **LLM plan capture:**
     - llmProvider (text — 'openai' | 'anthropic')
     - llmModel (text — specific model string)
     - llmPlan (jsonb — the full QueryPlan JSON the LLM produced)
     - llmRationale (jsonb — the full PlanRationale JSON)
     - llmConfidence (numeric(3,2) — 0.00 to 1.00)
     - llmTokensInput (integer), llmTokensOutput (integer)
     - llmLatencyMs (integer)
     - planHash (text — stable hash for dedup/grouping)
     - wasClarification (boolean — did we ask for clarification instead of answering?)
     - clarificationMessage (text, nullable)

   - **Compilation capture:**
     - compiledSql (text — the actual SQL that was generated)
     - sqlHash (text)
     - compilationErrors (jsonb, nullable — any validation failures)
     - safetyFlags (jsonb — array of strings from compiler)
     - tablesAccessed (jsonb — array of table names used)

   - **Execution capture:**
     - executionTimeMs (integer)
     - rowCount (integer)
     - resultSample (jsonb — first 5 rows, for admin review without re-running)
     - resultFingerprint (jsonb — { rowCount, minDate, maxDate, nullRate, columnCount })
     - executionError (text, nullable — if query failed)
     - cacheStatus (text: 'HIT' | 'MISS' | 'SKIP')

   - **Response capture:**
     - narrative (text — the full LLM-generated narrative)
     - narrativeLensId (text, nullable — which lens shaped the narrative)
     - responseSections (jsonb — which sections were included: key_takeaways, risks, etc.)
     - playbooksFired (jsonb — which playbook patterns triggered)

   - **User feedback:**
     - userRating (integer, nullable — 1-5 stars, null until rated)
     - userThumbsUp (boolean, nullable — quick thumbs up/down, null until rated)
     - userFeedbackText (text, nullable — free-text feedback)
     - userFeedbackTags (jsonb, nullable — array of tags: 'wrong_data', 'slow', 'confusing', 'great_insight', 'wrong_metric', 'missing_context', 'hallucination')
     - userFeedbackAt (timestamptz, nullable)

   - **Admin review:**
     - adminReviewerId (text, nullable — FK to users)
     - adminScore (integer, nullable — 1-5, null until reviewed)
     - adminVerdict (text, nullable — 'correct', 'partially_correct', 'incorrect', 'hallucination', 'needs_improvement')
     - adminNotes (text, nullable — free-text review notes)
     - adminCorrectedPlan (jsonb, nullable — what the plan SHOULD have been)
     - adminCorrectedNarrative (text, nullable — what the response SHOULD have said)
     - adminReviewedAt (timestamptz, nullable)
     - adminActionTaken (text, nullable — 'none', 'added_to_examples', 'adjusted_metric', 'filed_bug', 'updated_lens')

   - **Quality signals (computed/derived):**
     - qualityScore (numeric(3,2), nullable — weighted composite: 40% admin score + 30% user rating + 30% heuristics)
     - qualityFlags (jsonb, nullable — auto-detected issues: 'empty_result', 'timeout', 'low_confidence', 'hallucinated_slug', 'high_null_rate')

   - createdAt, updatedAt

   `semantic_eval_examples` — "golden" examples curated from good interactions:
   - id (ULID), tenantId (nullable — null = system-wide example)
   - sourceEvalTurnId (FK to eval_turns — where this came from)
   - question (text)
   - plan (jsonb — the validated correct plan)
   - rationale (jsonb — the correct rationale)
   - category (text: 'sales', 'golf', 'inventory', 'customer', 'comparison', 'trend', 'anomaly')
   - difficulty (text: 'simple', 'medium', 'complex')
   - isActive (boolean, default true)
   - addedBy (text — admin user ID)
   - createdAt, updatedAt

   `semantic_eval_quality_daily` — daily aggregated quality metrics (read model pattern):
   - id (ULID), tenantId
   - businessDate (date)
   - totalTurns (integer)
   - avgUserRating (numeric(3,2))
   - avgAdminScore (numeric(3,2))
   - avgConfidence (numeric(3,2))
   - avgExecutionTimeMs (integer)
   - clarificationRate (numeric(5,2) — % of turns that were clarifications)
   - errorRate (numeric(5,2) — % of turns with execution errors)
   - halluccinationRate (numeric(5,2) — % flagged as hallucination)
   - cacheHitRate (numeric(5,2))
   - topFailureReasons (jsonb — { reason: string, count: number }[])
   - ratingDistribution (jsonb — { "1": count, "2": count, ... "5": count })
   - createdAt

   Follow ALL OppsEra conventions: ULID ids, tenant_id, snake_case Postgres columns, camelCase Drizzle, RLS-ready.

2) **packages/db/migrations/NNNN_evaluation_layer.sql** — Migration with:
   - CREATE TABLE statements for all 4 tables
   - RLS ENABLE + FORCE on all tables
   - RLS policies scoped to tenant_id
   - Indexes:
     - (tenant_id, session_id) on eval_turns
     - (tenant_id, created_at DESC) on eval_turns — for recent queries feed
     - (tenant_id, user_rating) WHERE user_rating IS NOT NULL — for filtering rated items
     - (tenant_id, admin_verdict) WHERE admin_verdict IS NOT NULL — for filtering reviewed items
     - (tenant_id, quality_score DESC) WHERE quality_score IS NOT NULL — for quality ranking
     - (plan_hash) on eval_turns — for grouping similar queries
     - (sql_hash) on eval_turns — for grouping identical compiled queries
     - (tenant_id, business_date) on eval_quality_daily
     - (tenant_id, category, is_active) on eval_examples

### Backend Module (Shared — used by both apps/web and apps/admin)

3) **packages/modules/semantic/src/evaluation/types.ts** — Types:
   - EvalSession, EvalTurn, EvalExample, QualityDaily
   - UserFeedbackInput, AdminReviewInput
   - QualityScoreWeights (configurable: { adminWeight: 0.4, userWeight: 0.3, heuristicWeight: 0.3 })
   - FeedbackTag enum: 'wrong_data' | 'slow' | 'confusing' | 'great_insight' | 'wrong_metric' | 'missing_context' | 'hallucination' | 'irrelevant' | 'too_verbose' | 'perfect'

4) **packages/modules/semantic/src/evaluation/capture.ts** — Automatic capture service:
```typescript
   export interface EvalCaptureService {
     // Called automatically by ConversationManager on every turn
     recordTurn(input: {
       tenantId: string;
       userId: string;
       userRole: string;
       sessionId: string;
       turnNumber: number;
       userMessage: string;
       context: Record<string, unknown>;
       llmResponse: LLMPlanResponse;
       llmProvider: string;
       llmModel: string;
       llmTokens: { input: number; output: number };
       llmLatencyMs: number;
       compiledSql?: string;
       compilationErrors?: string[];
       safetyFlags?: string[];
       tablesAccessed?: string[];
       executionTimeMs?: number;
       rowCount?: number;
       resultSample?: Record<string, unknown>[]; // first 5 rows
       resultFingerprint?: ResultFingerprint;
       executionError?: string;
       cacheStatus?: string;
       narrative?: string;
       lensId?: string;
       responseSections?: string[];
       playbooksFired?: string[];
     }): Promise<string>; // returns evalTurnId

     // Auto-detect quality flags from the turn data
     computeQualityFlags(turn: EvalTurn): string[];

     // Compute composite quality score
     computeQualityScore(turn: EvalTurn): number | null;
   }
```

   Quality flag auto-detection rules:
   - 'empty_result': rowCount === 0
   - 'timeout': executionError contains 'timeout'
   - 'low_confidence': llmConfidence < 0.6
   - 'hallucinated_slug': compilationErrors contains 'unknown metric' or 'unknown dimension'
   - 'high_null_rate': resultFingerprint.nullRate > 0.5
   - 'excessive_rows': rowCount > 5000
   - 'very_slow': executionTimeMs > 5000

5) **packages/modules/semantic/src/evaluation/feedback.ts** — Feedback commands (shared module, called by both apps):

   a) `submitUserRating(evalTurnId, { rating: 1-5, thumbsUp?: boolean, text?: string, tags?: string[] })` — Upserts user feedback on an eval turn. Recomputes qualityScore. Updates session avgUserRating. Called from apps/web via user feedback API.

   b) `submitAdminReview(evalTurnId, { score: 1-5, verdict, notes, correctedPlan?, correctedNarrative?, actionTaken })` — Admin review. Recomputes qualityScore. Updates session avgAdminScore. Called from apps/admin only.

   c) `promoteToExample(evalTurnId, { category, difficulty })` — Takes a good eval turn and creates a golden example from it. Sets adminActionTaken = 'added_to_examples'. Called from apps/admin only.

6) **packages/modules/semantic/src/evaluation/queries.ts** — Read queries (shared module, used by both apps):

   a) `getEvalFeed(tenantId, filters)` — Paginated feed of recent eval turns. Filters:
      - dateRange (start, end)
      - status: 'unreviewed' | 'reviewed' | 'flagged' | 'all'
      - minUserRating / maxUserRating
      - adminVerdict
      - qualityFlags (filter by specific flags)
      - userRole
      - lensId
      - search (text search in userMessage)
      - sortBy: 'newest' | 'lowest_rated' | 'lowest_confidence' | 'slowest' | 'most_flagged'

   b) `getEvalTurnDetail(evalTurnId)` — Full detail of a single turn including all captures

   c) `getEvalSession(sessionId)` — Full session with all turns

   d) `getQualityDashboard(tenantId, dateRange)` — Aggregated quality metrics:
      - Overall avg rating (user + admin)
      - Rating distribution chart data
      - Confidence distribution
      - Top failure reasons
      - Hallucination rate trend
      - Clarification rate trend
      - Avg execution time trend
      - Cache hit rate
      - Quality score distribution
      - Breakdown by lens (which lens gets best/worst ratings?)
      - Breakdown by intent (which question types fail most?)
      - Breakdown by dataset (core vs golf vs inventory)

   e) `getGoldenExamples(tenantId?, category?, difficulty?)` — List curated examples for few-shot prompting

   f) `getProblematicPatterns(tenantId, dateRange)` — Group eval turns by planHash, find patterns where:
      - Same planHash consistently gets low ratings → metric/dimension mapping issue
      - Same sqlHash returns different row counts for same tenant → data freshness issue
      - Same question wordings trigger clarification → prompt/few-shot gap

   g) `getComparativeAnalysis(tenantId, dateRange)` — Compare:
      - Lens A vs Lens B ratings for same question types
      - Provider A vs Provider B accuracy
      - Model A vs Model B speed/cost/accuracy

7) **packages/modules/semantic/src/evaluation/aggregation.ts** — Daily quality aggregation:
   - Event consumer or scheduled job that computes `semantic_eval_quality_daily` from eval_turns
   - Runs nightly (or on-demand via admin API in apps/admin)
   - Uses the same upsert-by-natural-key pattern as existing rm_ tables

8) **packages/modules/semantic/src/evaluation/example-manager.ts** — Golden example lifecycle:
   - Load active examples for LLM prompt building (called by prompt-builder.ts in Session 3)
   - Merge system examples (hardcoded) with tenant-specific golden examples
   - Rank by quality score → only feed top N examples to the LLM
   - Rotate examples to avoid stale few-shot patterns

### API Route (apps/web only — user feedback submission)

9) **apps/web/src/app/api/v1/semantic/eval/turns/[id]/feedback/route.ts** — POST: submit user feedback
   - Permission: semantic.query — any authenticated user can rate their OWN turns
   - Validates the eval turn belongs to the requesting user's tenant
   - Validates the eval turn belongs to the requesting user (users can only rate their own interactions)
   - Uses submitUserRating from the shared feedback module
   - This is the ONLY eval API route in apps/web. All admin routes (feed, review, promote, dashboard, examples, patterns, compare) live in apps/admin (Session 0.5).

### Validation Schemas

10) **packages/modules/semantic/src/evaluation/validation.ts**:
    - userFeedbackSchema: rating (1-5), thumbsUp (bool), text (string max 2000), tags (array of FeedbackTag)
    - adminReviewSchema: score (1-5), verdict (enum), notes (string max 5000), correctedPlan (QueryPlan optional), correctedNarrative (string optional), actionTaken (enum)
    - promoteExampleSchema: category (enum), difficulty (enum)
    - feedFilterSchema: all the filter params for the eval feed

### Barrel Export

11) **packages/modules/semantic/src/evaluation/index.ts** — Barrel exports + singleton:
```typescript
    let _captureService: EvalCaptureService | null = null;
    export function getEvalCaptureService(): EvalCaptureService { ... }
    export function setEvalCaptureService(s: EvalCaptureService): void { ... }
```

### Permissions

12) New permissions to register:
    - semantic.eval.view — View evaluation dashboard and feed (used by apps/admin)
    - semantic.eval.review — Submit admin reviews (used by apps/admin)
    - semantic.eval.manage — Manage golden examples, run analysis (used by apps/admin)
    Default mappings: Platform admin (super admin panel users) gets all. These permissions are NOT assigned to tenant roles — they're for the super admin panel only.

### Integration Points (document these, don't build yet)

The eval capture service will be called by ConversationManager (Session 3) after every turn:
```typescript
// In conversation.ts processMessage(), after generating response:
const evalTurnId = await getEvalCaptureService().recordTurn({
  tenantId, userId, userRole: ctx.userRole, sessionId, turnNumber,
  userMessage: input.message,
  context: input.context,
  llmResponse, llmProvider, llmModel, llmTokens, llmLatencyMs,
  compiledSql, compilationErrors, safetyFlags, tablesAccessed,
  executionTimeMs, rowCount, resultSample, resultFingerprint,
  executionError, cacheStatus, narrative, lensId, responseSections, playbooksFired,
});
// Attach evalTurnId to response so frontend can submit feedback
```

The example manager will be called by prompt-builder.ts (Session 3):
```typescript
// In prompt-builder.ts, when building few-shot examples:
const goldenExamples = await getExampleManager().getExamplesForPrompt(tenantId, {
  dataset: tenantBusinessType === 'golf' ? 'golf' : 'core',
  maxExamples: 8,
  includeSystemExamples: true,
});
```

### Tests

13) **packages/modules/semantic/src/evaluation/__tests__/capture.test.ts** — Tests:
    - Records a turn with all fields populated
    - Auto-detects 'empty_result' quality flag when rowCount=0
    - Auto-detects 'low_confidence' when confidence < 0.6
    - Computes composite quality score correctly (40/30/30 weighting)
    - Updates session averages after rating

14) **packages/modules/semantic/src/evaluation/__tests__/feedback.test.ts** — Tests:
    - User submits rating (1-5)
    - User submits tags
    - Admin submits review with corrected plan
    - Promote to example creates eval_examples row
    - Quality score recomputed after feedback

15) **packages/modules/semantic/src/evaluation/__tests__/queries.test.ts** — Tests:
    - Feed returns turns sorted by newest
    - Feed filters by unreviewed only
    - Feed filters by quality flags
    - Dashboard aggregation correct
    - Problematic patterns groups by planHash

CONVENTIONS TO FOLLOW:
- Every table: ULID id, tenant_id, created_at, updated_at
- Schema in packages/db/src/schema/evaluation.ts
- Module code in packages/modules/semantic/src/evaluation/
- Commands follow publishWithOutbox pattern for state changes
- Queries use withTenant + cursor pagination
- API routes use withMiddleware
- Tests use vi.hoisted + mock chains

OUTPUT: Complete, production-ready file contents for every file listed. No stubs, no TODOs, no placeholders.

Session 0.5 of 12 — Super Admin Panel Scaffold + Eval Review UI (First Feature)
CONTEXT: I just built the evaluation backend (Session 0) for OppsEra's semantic layer. The shared module lives in packages/modules/semantic/src/evaluation/ with capture service, feedback commands, queries, and aggregation.

Now I need to build the Super Admin Panel — a SEPARATE Next.js app at its own subdomain (e.g., admin.oppsera.com). This panel is NOT linked to the customer-facing app (apps/web/) in any way. It is a standalone admin tool for OppsEra platform operators.

The eval review interface is the FIRST FEATURE of this panel. Future features (tenant management, billing admin, system config, etc.) will be added later.

You have my CLAUDE.md and CONVENTIONS.md for full project context.

EXISTING (from Session 0):
- packages/db/src/schema/evaluation.ts — eval_sessions, eval_turns, eval_examples, eval_quality_daily
- packages/modules/semantic/src/evaluation/ — capture service, feedback commands, queries, aggregation, example manager
- packages/modules/semantic/src/evaluation/validation.ts — all Zod schemas
- apps/web/src/app/api/v1/semantic/eval/turns/[id]/feedback/route.ts — user feedback submission only

IMPORTANT ARCHITECTURE:
- apps/admin/ is a SEPARATE Next.js 15 app — its own package.json, its own layout, its own auth
- It shares packages/db/ and packages/modules/ via the monorepo workspace (same as apps/web/)
- It does NOT share components, hooks, or pages with apps/web/
- It has its own auth system: platform admin auth (email + password or SSO), NOT tenant-scoped Supabase Auth
- It has CROSS-TENANT visibility — admin can see eval data across ALL tenants
- It is hosted on its own subdomain (admin.oppsera.com) with its own deployment

TASK: Build the Super Admin Panel scaffold and the Eval Review UI as its first feature.

BUILD THESE FILES:

### 1. App Scaffold

1) **apps/admin/package.json** — Dependencies:
   - next@15, react@19, react-dom@19, typescript
   - @oppsera/db (workspace:*), @oppsera/modules (workspace:*)
   - tailwindcss@4, recharts (for dashboard charts)
   - zod, drizzle-orm, postgres (shared DB access)
   - next-auth or a lightweight session lib for platform admin auth
   - No Supabase Auth dependency — this app has its own auth

2) **apps/admin/tsconfig.json** — TypeScript config extending monorepo base tsconfig

3) **apps/admin/next.config.ts** — Next.js config:
   - App Router enabled
   - Transpile packages from workspace (packages/db, packages/modules)
   - Environment variables: ADMIN_DATABASE_URL, ADMIN_AUTH_SECRET, NEXT_PUBLIC_ADMIN_URL
   - No reference to apps/web/ config

4) **apps/admin/tailwind.config.ts** — Tailwind v4 config:
   - Can use the same design tokens as apps/web/ for brand consistency
   - Content paths scoped to apps/admin/src/

5) **apps/admin/src/app/layout.tsx** — Root layout:
   - Admin-specific metadata (title: "OppsEra Admin")
   - Admin-specific font/styling
   - Session provider for admin auth
   - No tenant context provider — admin operates cross-tenant

6) **apps/admin/src/app/page.tsx** — Admin dashboard home:
   - Quick stats: total tenants, total eval turns today, avg quality score
   - Links to features: Evaluation Review, (future: Tenant Management, System Config)
   - Simple, clean design — this is an internal tool, not customer-facing

### 2. Platform Admin Auth

7) **apps/admin/src/lib/auth.ts** — Admin authentication:
   - Platform admin users are stored in a new table: `platform_admins` (id, email, name, passwordHash, role: 'super_admin' | 'admin' | 'viewer', isActive, lastLoginAt, createdAt, updatedAt)
   - Add this table to packages/db/src/schema/platform.ts (new schema file)
   - Add migration: packages/db/migrations/NNNN_platform_admins.sql
   - NO RLS on this table — it's not tenant-scoped
   - Auth uses simple session-based auth (HttpOnly cookie with signed JWT)
   - Login endpoint: apps/admin/src/app/api/auth/login/route.ts (POST: email + password → JWT cookie)
   - Logout endpoint: apps/admin/src/app/api/auth/logout/route.ts (POST: clear cookie)
   - Session check: apps/admin/src/app/api/auth/session/route.ts (GET: return current admin user)
   - Middleware: apps/admin/src/middleware.ts — check JWT cookie on every request, redirect to /login if missing

8) **apps/admin/src/app/login/page.tsx** — Login page:
   - Simple email + password form
   - "OppsEra Admin" branding
   - Error handling for invalid credentials
   - Redirect to / on success

### 3. Admin Layout + Navigation

9) **apps/admin/src/app/(admin)/layout.tsx** — Authenticated admin layout:
   - Sidebar navigation:
     - Dashboard (home)
     - Evaluation (expand):
       - Feed (review interactions)
       - Dashboard (quality analytics)
       - Golden Examples
     - (Future sections grayed out: Tenants, Billing, System)
   - Top bar with admin user name + logout button
   - Tenant selector dropdown (for filtering eval data by tenant, or "All Tenants")

### 4. Eval Review API Routes (admin-only)

10) **apps/admin/src/app/api/v1/eval/** — Admin evaluation API routes:

    All routes are protected by admin auth middleware (not tenant RLS — admin has cross-tenant access).
    All routes call the shared query/command functions from packages/modules/semantic/src/evaluation/.
    The key difference from apps/web: these routes do NOT use tenant RLS. Instead, they accept tenantId as a query/body parameter and the shared module functions handle filtering.

    a) `feed/route.ts` — GET: paginated eval feed across all tenants (or filtered by tenant)
       - Calls getEvalFeed() with optional tenantId filter
       - Admin auth required (role: admin or super_admin)

    b) `turns/[id]/route.ts` — GET: eval turn detail (any tenant)
       - Calls getEvalTurnDetail()
       - Admin auth required

    c) `turns/[id]/review/route.ts` — POST: submit admin review
       - Calls submitAdminReview() from shared feedback module
       - Sets adminReviewerId to the platform admin's ID
       - Admin auth required (role: admin or super_admin)

    d) `turns/[id]/promote/route.ts` — POST: promote to golden example
       - Calls promoteToExample() from shared feedback module
       - Admin auth required (role: super_admin)

    e) `sessions/[id]/route.ts` — GET: session detail with all turns
       - Calls getEvalSession()
       - Admin auth required

    f) `dashboard/route.ts` — GET: quality dashboard metrics
       - Calls getQualityDashboard() with optional tenantId filter
       - Admin auth required

    g) `examples/route.ts` — GET: list golden examples. POST: create manually.
       - Calls getGoldenExamples() / creates via shared module
       - Admin auth required

    h) `examples/[id]/route.ts` — PATCH: update. DELETE: deactivate (soft delete).
       - Admin auth required (role: super_admin for delete)

    i) `patterns/route.ts` — GET: problematic patterns analysis
       - Calls getProblematicPatterns()
       - Admin auth required

    j) `compare/route.ts` — GET: comparative analysis (lenses, providers, models)
       - Calls getComparativeAnalysis()
       - Admin auth required

    k) `aggregation/trigger/route.ts` — POST: manually trigger daily quality aggregation
       - Calls the aggregation job from shared module
       - Admin auth required (role: super_admin)

### 5. Eval Review Pages

11) **apps/admin/src/app/(admin)/eval/feed/page.tsx** — Evaluation feed page:
    - Paginated list of recent eval turns (most recent first)
    - **Tenant column** — shows which tenant each turn belongs to (this is the key difference from a tenant-scoped view)
    - Each row shows: tenant name, timestamp, user message (truncated), confidence badge, user rating (stars or —), admin verdict badge, quality flags as colored pills
    - Filter bar at top:
      - Tenant selector (dropdown with search, or "All Tenants")
      - Status: All | Unreviewed | Flagged | Reviewed (tabs)
      - Date range picker
      - Min/max user rating slider
      - Quality flags multi-select (empty_result, low_confidence, hallucination, etc.)
      - Search box (searches userMessage text)
      - Sort: Newest | Lowest Rated | Lowest Confidence | Slowest
    - Click a row to open the detail view
    - Bulk actions: "Flag selected", "Mark reviewed"
    - Color coding: red border for hallucination/incorrect verdicts, amber for needs_improvement, green for correct, gray for unreviewed

12) **apps/admin/src/app/(admin)/eval/turns/[turnId]/page.tsx** — Single turn review page:
    - **Left column (60%): The interaction**
      - Tenant name + ID badge at top
      - User's question (formatted)
      - Session context (location, date range, lens)
      - LLM Plan (collapsible JSON viewer, syntax highlighted)
      - LLM Rationale (structured display — intent reason, metric choices with "why", assumptions)
      - Compiled SQL (syntax highlighted, collapsible)
      - Safety flags (colored pills)
      - Query result table (first 20 rows, sortable)
      - Result fingerprint (row count, date range, null rate)
      - Generated narrative (rendered markdown)
      - Execution metadata: provider, model, tokens, latency, cache status

    - **Right column (40%): Review panel**
      - User feedback section (read-only display of what the user submitted):
        - Star rating display
        - Thumbs up/down
        - Feedback text
        - Tags as colored pills
      - Admin review form:
        - Score (1-5 stars, clickable)
        - Verdict dropdown: correct, partially_correct, incorrect, hallucination, needs_improvement
        - Notes textarea (plain text)
        - "What should the plan have been?" — JSON editor for corrected plan (optional, collapsible)
        - "What should the response have said?" — textarea for corrected narrative (optional, collapsible)
        - Action taken dropdown: none, added_to_examples, adjusted_metric, filed_bug, updated_lens
        - Submit review button
      - "Promote to Golden Example" button (only if verdict = correct and score >= 4):
        - Category selector (sales, golf, inventory, etc.)
        - Difficulty selector (simple, medium, complex)
        - Confirm button

    - **Navigation:** Previous/Next turn arrows, "Back to feed" link

13) **apps/admin/src/app/(admin)/eval/dashboard/page.tsx** — Quality analytics dashboard:
    - **Tenant filter** at top (or "All Tenants" for cross-tenant view)
    - Date range selector (default: last 30 days)

    - **Row 1: KPI cards (4 across)**
      - Avg User Rating (with sparkline trend)
      - Avg Admin Score (with sparkline trend)
      - Hallucination Rate % (red if > 5%)
      - Avg Response Time ms

    - **Row 2: Charts (2 across)**
      - Rating distribution bar chart (1-5 stars, user vs admin side by side)
      - Quality score trend line chart (daily avg over date range)

    - **Row 3: Breakdown tables**
      - "By Tenant" table: tenant name, total turns, avg rating, error rate, hallucination rate
      - "By Intent Type" table: intent, count, avg rating, avg confidence, error rate
      - "By Lens" table: lens name, count, avg rating, most common verdict
      - "By Dataset" table: core/golf/inventory, count, avg rating, hallucination rate

    - **Row 4: Problem patterns**
      - "Repeated Failures" table: planHash patterns with consistently low ratings
      - "Clarification Hotspots" table: question patterns that always trigger clarification
      - Each row links to the eval feed filtered by that pattern

    - **Row 5: Comparative analysis**
      - Provider comparison (if multiple): accuracy, speed, cost per query
      - Model comparison: same metrics

14) **apps/admin/src/app/(admin)/eval/examples/page.tsx** — Golden examples manager:
    - List of curated examples with: question, category, difficulty, quality score, tenant (or "System"), source turn link
    - Toggle active/inactive
    - Edit example (adjust plan/rationale)
    - "Add manual example" button (for hand-crafted examples)
    - Category filter tabs
    - Tenant filter (system-wide examples vs tenant-specific)

### 6. Admin Components

15) **apps/admin/src/components/eval/EvalTurnCard.tsx** — Feed list item (same as described above)

16) **apps/admin/src/components/eval/PlanViewer.tsx** — JSON plan display with syntax highlighting, collapsible sections, side-by-side comparison mode

17) **apps/admin/src/components/eval/SqlViewer.tsx** — SQL display with syntax highlighting, parameter values, copy button

18) **apps/admin/src/components/eval/QualityKpiCard.tsx** — Dashboard KPI card with sparkline (Recharts)

19) **apps/admin/src/components/eval/RatingStars.tsx** — Reusable star rating (display + input modes)

20) **apps/admin/src/components/eval/VerdictBadge.tsx** — Admin verdict colored badge

21) **apps/admin/src/components/eval/QualityFlagPills.tsx** — Quality flag colored pills with tooltips

22) **apps/admin/src/components/shared/TenantSelector.tsx** — Dropdown with search to filter by tenant:
    - Fetches tenant list from admin API
    - "All Tenants" option
    - Persists selection in URL params

23) **apps/admin/src/components/shared/AdminSidebar.tsx** — Sidebar navigation component

### 7. Admin Hooks

24) **apps/admin/src/hooks/use-admin-auth.ts** — Auth hook:
    - Returns current admin user, isLoading, login(), logout()
    - Redirects to /login if not authenticated

25) **apps/admin/src/hooks/use-eval.ts** — Evaluation hooks (similar to apps/web version but cross-tenant):
```typescript
    export function useEvalFeed(filters: EvalFeedFilters & { tenantId?: string }) { ... }
    export function useEvalTurn(turnId: string) { ... }
    export function useEvalDashboard(dateRange: DateRange, tenantId?: string) { ... }
    export function useSubmitReview() { ... }
    export function usePromoteExample() { ... }
    export function useGoldenExamples(filters?: { category?: string; tenantId?: string }) { ... }
    export function useEvalPatterns(dateRange: DateRange, tenantId?: string) { ... }
```

26) **apps/admin/src/hooks/use-tenants.ts** — Tenant list hook for the tenant selector

### 8. Monorepo Configuration

27) **Update pnpm-workspace.yaml** — Add apps/admin to workspace packages:
```yaml
    packages:
      - 'apps/*'
      - 'packages/*'
```
    (If apps/* is already there, apps/admin is automatically included. If not, add it.)

28) **Update turbo.json** — Add apps/admin to the pipeline:
    - apps/admin#build depends on packages/db#build, packages/modules#build
    - apps/admin#dev runs independently
    - apps/admin#lint extends base lint config

29) **apps/admin/src/types/eval.ts** — Frontend types matching API response shapes (can import shared types from packages/modules)

### 9. Deployment Notes (document, don't implement)

30) Document these deployment requirements at the bottom of the output:
    - apps/admin deploys to its own subdomain (admin.oppsera.com)
    - Separate Vercel project (or separate Docker container) from apps/web
    - Uses the SAME database as apps/web (shared Postgres) — no separate DB
    - Requires its own environment variables: ADMIN_DATABASE_URL (same connection string, but could use a separate connection pool), ADMIN_AUTH_SECRET
    - Platform admin users are seeded manually or via a setup script (not self-registration)
    - CORS config on API routes: only allow requests from admin.oppsera.com origin

### Tests

31) **apps/admin/src/__tests__/auth.test.ts** — Admin auth tests:
    - Login with valid credentials returns JWT cookie
    - Login with invalid credentials returns 401
    - Protected routes redirect to /login without cookie
    - Session endpoint returns current admin user

32) **apps/admin/src/__tests__/eval-api.test.ts** — Admin eval API tests:
    - Feed returns turns across tenants
    - Feed filters by tenant when tenantId provided
    - Review submission updates eval turn
    - Promote to example creates eval_examples row
    - Dashboard returns aggregated metrics
    - Non-admin requests are rejected

CONVENTIONS TO FOLLOW:
- Next.js 15 App Router, React 19, TypeScript strict
- Tailwind v4 for styling
- apiFetch pattern for API calls (admin version, not sharing apps/web's apiFetch)
- Zod validation on all API inputs
- Tests use vi.hoisted + mock chains
- This is apps/admin/ — completely separate from apps/web/

OUTPUT: Complete, production-ready file contents for every file listed. No stubs, no TODOs, no placeholders. Include the full directory structure at the top of the output.

Session 1 of 12 — Semantic Module Scaffold + DB Schema + TypeScript Registry
CONTEXT: I'm building an enterprise semantic layer module for OppsEra (multi-tenant SaaS ERP). You have my CLAUDE.md and CONVENTIONS.md for full project context.

TASK: Create the foundational `packages/modules/semantic/` module with DB schema and TypeScript registry.

BUILD THESE FILES:

1) **packages/db/src/schema/semantic.ts** — Drizzle schema for these tables:
   - `semantic_metrics` — id, tenantId (nullable for system-level), name, slug, description, formula, aggregationType (sum/avg/count/min/max/countDistinct/weightedAvg/latest), defaultTimeGrain (day/week/month/quarter/year), currencyHandling (cents/dollars/none), sourceTable, sourceColumn, formatType (currency/percentage/number/integer), dataset (core/golf/inventory/customer), isSystem (bool), isActive, createdAt, updatedAt
     - FOR "latest" aggregation metrics, add these columns:
       - asOfField (text, nullable) — the timestamp/date column used to determine recency (e.g. 'snapshot_at', 'business_date')
       - partitionBy (jsonb, nullable) — array of column names that define uniqueness (e.g. ['location_id','inventory_item_id'])
       - latestStrategy (text, nullable) — 'distinct_on' | 'max_subquery' — how to resolve "latest" in SQL
   - `semantic_dimensions` — id, tenantId (nullable), name, slug, description, sourceTable, sourceColumn, dimensionType (categorical/temporal/hierarchical/geographic), hierarchyPath (jsonb, e.g. ["department","category","item"]), allowedValues (jsonb, nullable), dataset, isSystem, isActive, createdAt, updatedAt
   - `semantic_entities` — id, tenantId (nullable), name, slug, description, primaryTable, primaryKey, isSystem, isActive, createdAt, updatedAt
   - `semantic_join_paths` — id, tenantId (nullable), fromEntity, toEntity, joinType (inner/left), joinCondition (jsonb — array of {leftColumn, rightColumn}), cardinality (one_to_one/one_to_many/many_to_one), grainImpact (safe/may_duplicate/requires_distinct), notes (text, nullable), isSystem, isActive, createdAt, updatedAt
   - `semantic_filters` — id, tenantId (nullable), name, slug, description, dimensionId (FK), operators (jsonb array of allowed ops: eq/neq/in/notIn/gt/gte/lt/lte/between/like), valueType (text: 'string'|'number'|'date'|'boolean'|'enum'), defaultValue (jsonb nullable), isRequired (bool), isSystem, isActive, createdAt, updatedAt
   - `semantic_metric_permissions` — id, tenantId, metricId (FK), roleId (FK to roles), canView (bool), canExport (bool), createdAt
   - `semantic_dimension_permissions` — id, tenantId, dimensionId (FK), roleId (FK), canView, canFilter, createdAt
   - `semantic_pii_fields` — id, tenantId (nullable), entityId (FK), fieldName, piiCategory (email/phone/address/name/ssn/financial), maskingStrategy (redact/hash/truncate/none), isSystem, createdAt
   All tables follow OppsEra conventions: ULID ids, tenant_id, snake_case Postgres columns, camelCase Drizzle, RLS-ready. System-level rows have tenant_id = NULL.

2) **packages/db/migrations/NNNN_semantic_layer.sql** — Migration with:
   - CREATE TABLE statements
   - RLS ENABLE + FORCE on all tables
   - RLS policies (SELECT/INSERT/UPDATE/DELETE scoped to tenant_id, with system rows visible to all: `tenant_id = current_setting('app.current_tenant_id') OR tenant_id IS NULL`)
   - Composite indexes on (tenant_id, slug) for metrics/dimensions/entities
   - FK constraints
   - ALSO create a read-only Postgres role for semantic queries:
```sql
     DO $$ BEGIN
       IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'semantic_readonly') THEN
         CREATE ROLE semantic_readonly NOLOGIN;
       END IF;
     END $$;
     -- Grant SELECT-only on rm_ tables + dimension lookup tables
     GRANT SELECT ON rm_daily_sales, rm_item_sales, rm_inventory_on_hand, rm_customer_activity,
       rm_golf_tee_time_demand, rm_golf_tee_time_fact, rm_golf_revenue_daily, rm_golf_pace_daily,
       rm_golf_ops_daily, rm_golf_channel_daily, rm_golf_customer_play, rm_golf_hourly_distribution,
       rm_golf_booking_lead_time, rm_golf_pace_checkpoints,
       locations, catalog_categories, courses
     TO semantic_readonly;
     -- Create a login user that inherits this role (for semantic query execution)
     -- Tenant connection still uses main pool; this is defense-in-depth
```

3) **packages/modules/semantic/src/registry/metrics.ts** — TypeScript registry with these initial metrics (system-level definitions):
   - gross_sales: SUM of rm_daily_sales.gross_sales
   - net_sales: SUM of rm_daily_sales.net_sales
   - discount_total: SUM of rm_daily_sales.discount_total
   - order_count: SUM of rm_daily_sales.order_count
   - avg_order_value: net_sales / order_count (computed)
   - void_count: SUM of rm_daily_sales.void_count
   - item_qty_sold: SUM of rm_item_sales.quantity_sold
   - item_revenue: SUM of rm_item_sales.net_sales
   - inventory_on_hand: LATEST rm_inventory_on_hand.on_hand_qty
     - asOfField: 'snapshot_at'
     - partitionBy: ['location_id', 'inventory_item_id']
     - latestStrategy: 'distinct_on'
   - inventory_value: LATEST rm_inventory_on_hand.on_hand_value
     - asOfField: 'snapshot_at'
     - partitionBy: ['location_id', 'inventory_item_id']
     - latestStrategy: 'distinct_on'
   Each metric definition must include: slug, name, description, formula (human-readable), sourceTable, sourceColumn, aggregationType, defaultTimeGrain, formatType, currencyHandling, dataset. For "latest" metrics, also include asOfField, partitionBy, latestStrategy.

4) **packages/modules/semantic/src/registry/dimensions.ts** — Initial dimensions:
   - business_date (temporal, rm_daily_sales.business_date)
   - location (categorical, rm_daily_sales.location_id → locations.name)
   - department (hierarchical, path: [department, sub_department, category])
   - category (categorical, rm_item_sales.category_name)
   - item_name (categorical, rm_item_sales.item_name)
   - item_type (categorical, rm_item_sales.item_type)
   - tender_type (categorical — needs new field or join)
   - day_of_week (temporal, derived from business_date)
   - hour_block (temporal, derived — for future use)

5) **packages/modules/semantic/src/registry/entities.ts** — Entity definitions mapping to primary tables:
   - DailySales → rm_daily_sales
   - ItemSales → rm_item_sales
   - InventoryOnHand → rm_inventory_on_hand
   - CustomerActivity → rm_customer_activity
   - Order → orders
   - Customer → customers
   - CatalogItem → catalog_items
   - Location → locations

6) **packages/modules/semantic/src/registry/join-graph.ts** — Allowed join paths WITH CARDINALITY + GRAIN IMPACT:
   - rm_daily_sales → locations (location_id): many_to_one, safe
   - rm_item_sales → locations (location_id): many_to_one, safe
   - rm_item_sales → catalog_items (item_id): many_to_one, safe
   - rm_item_sales → catalog_categories (category_id): many_to_one, safe
   - rm_customer_activity → customers (customer_id): many_to_one, safe
   - rm_inventory_on_hand → locations (location_id): many_to_one, safe
   - rm_inventory_on_hand → inventory_items (inventory_item_id): many_to_one, safe
   Include a `notes` field on each explaining the cardinality reasoning.

7) **packages/modules/semantic/src/registry/index.ts** — Barrel export of SemanticRegistry singleton:
```typescript
   export interface SemanticRegistry {
     metrics: MetricDefinition[];
     dimensions: DimensionDefinition[];
     entities: EntityDefinition[];
     joinPaths: JoinPathDefinition[];
     getMetric(slug: string): MetricDefinition | undefined;
     getDimension(slug: string): DimensionDefinition | undefined;
     getJoinPath(from: string, to: string): JoinPathDefinition | undefined;
     getMetricsByDataset(dataset: string): MetricDefinition[];
     getDimensionsByDataset(dataset: string): DimensionDefinition[];
     // Build a compact dictionary for LLM context (minimal payload)
     toCompactDictionary(options?: { dataset?: string; metricSlugs?: string[] }): SemanticDictionary;
   }

   // Compact format optimized for LLM token efficiency
   export interface SemanticDictionary {
     metrics: { slug: string; label: string; sourceTable: string; agg: string; format: string; desc: string }[];
     dimensions: { slug: string; label: string; sourceTable: string; type: string; desc: string }[];
     filters: { field: string; ops: string[]; valueType: string; examples?: string[] }[];
     joinPaths: { from: string; to: string; keys: string[]; cardinality: string; grainImpact: string }[];
   }
```

8) **packages/modules/semantic/src/sync/sync-registry.ts** — Idempotent script that loads TS registry → DB tables using ON CONFLICT (tenant_id IS NULL, slug) DO UPDATE. Run via `pnpm semantic:sync`.

9) **packages/modules/semantic/package.json** — Standard module package.json following the workspace pattern. Dependencies: @oppsera/shared, @oppsera/db, @oppsera/core.

10) **packages/modules/semantic/src/index.ts** — Module barrel export.

11) **packages/modules/semantic/src/types.ts** — All TypeScript interfaces:
    - MetricDefinition (including asOfField, partitionBy, latestStrategy for latest agg)
    - DimensionDefinition
    - EntityDefinition
    - JoinPathDefinition (including cardinality, grainImpact, notes)
    - FilterDefinition (including valueType)
    - PiiFieldDefinition
    - SemanticDictionary (compact LLM format)

CONVENTIONS TO FOLLOW:
- Every table: ULID id, tenant_id, created_at, updated_at
- Schema in packages/db/src/schema/semantic.ts
- Module code in packages/modules/semantic/src/
- Use singleton getter/setter pattern for SemanticRegistry
- Zod validation for all input shapes
- No cross-module imports (only @oppsera/shared, @oppsera/db, @oppsera/core)

OUTPUT: Complete, production-ready file contents for every file listed. No stubs, no TODOs, no placeholders.

Session 2 of 12 — Query Engine (Plan → SQL Compiler)
CONTEXT: I'm building the query engine for OppsEra's semantic layer module. Session 1 created the semantic module scaffold with DB schema, TypeScript registry (metrics, dimensions, entities, join graph), and types. You have my CLAUDE.md and CONVENTIONS.md for full project context.

EXISTING (from Session 1):
- packages/modules/semantic/src/types.ts — MetricDefinition (w/ asOfField, partitionBy, latestStrategy for "latest" agg), DimensionDefinition, EntityDefinition, JoinPathDefinition (w/ cardinality, grainImpact), FilterDefinition (w/ valueType), SemanticDictionary
- packages/modules/semantic/src/registry/ — metrics.ts, dimensions.ts, entities.ts, join-graph.ts (with cardinality + grainImpact), index.ts (with toCompactDictionary)
- packages/db/src/schema/semantic.ts — All semantic_* tables
- Migration includes a `semantic_readonly` DB role with SELECT-only on rm_* + dimension tables

TASK: Build the Query Engine that accepts a structured query plan and compiles it to parameterized SQL targeting read model tables.

BUILD THESE FILES:

1) **packages/modules/semantic/src/validation/query-plan.ts** — Zod schemas:
```typescript
   // The structured plan (what the LLM outputs or UI builds)
   export const queryPlanSchema = z.object({
     question: z.string().optional(),
     intent: z.enum(['report', 'trend', 'compare', 'anomaly', 'definition', 'drilldown']),
     metrics: z.array(z.string()).min(1).max(20), // metric slugs
     dimensions: z.array(z.string()).max(10), // dimension slugs
     filters: z.array(z.object({
       field: z.string(),
       op: z.enum(['eq', 'neq', 'in', 'notIn', 'gt', 'gte', 'lt', 'lte', 'between', 'like']),
       value: z.union([z.string(), z.number(), z.boolean(), z.array(z.union([z.string(), z.number()]))]),
     })).default([]),
     grain: z.enum(['hour', 'day', 'week', 'month', 'quarter', 'year']).default('day'),
     limit: z.number().int().min(1).max(10000).default(1000),
     orderBy: z.array(z.object({
       field: z.string(),
       dir: z.enum(['asc', 'desc']),
     })).default([]),
     comparisons: z.array(z.enum(['wow', 'mom', 'yoy', 'prior_period'])).default([]),
     dateRange: z.object({
       start: z.string(), // ISO date
       end: z.string(),   // ISO date
     }).optional(),
     // NEW FIELDS (tightened plan schema to prevent drift):
     dataset: z.enum(['core', 'golf', 'inventory', 'customer', 'mixed']).default('core'),
     timezone: z.string().default('America/New_York'), // IANA timezone, defaults to tenant TZ
     currency: z.string().default('USD'), // ISO 4217
     resultShape: z.enum(['timeseries', 'table', 'kpi', 'pivot']).default('table'),
     explain: z.boolean().default(false), // whether to include rationale in response
   });
   export type QueryPlan = z.infer<typeof queryPlanSchema>;
   export type QueryPlanInput = z.input<typeof queryPlanSchema>;

   // Filter value type enforcement (post-parse validation)
   // Ensures 'between' has [start, end], date filters have ISO strings, etc.
   export function validateFilterTypes(
     filters: QueryPlan['filters'],
     registry: SemanticRegistry
   ): { valid: boolean; errors: string[] }
```

2) **packages/modules/semantic/src/engine/query-compiler.ts** — The core compiler:

   Function: `compileQuery(plan: QueryPlan, tenantId: string, registry: SemanticRegistry): CompiledQuery`

   Logic:
   a) Validate all metric slugs exist in registry. Reject unknown metrics.
   b) Validate all dimension slugs exist. Reject unknown.
   c) Determine the primary source table from the metrics (all metrics in one query must share a source table or be joinable via the join graph).
   d) If metrics span multiple tables, use the join graph to find the join path. If no path exists, return error.
   e) **CRITICAL: Check join cardinality + grainImpact from the join graph:**
      - If grainImpact === 'may_duplicate': wrap the aggregation in a subquery or use DISTINCT, and add a safetyFlag
      - If grainImpact === 'requires_distinct': force DISTINCT ON in the query
      - If cardinality is 'one_to_many' and we're aggregating on the "one" side, warn about potential duplication
      - Log a safetyFlag 'join_may_duplicate' in metadata if any risky join is used
   f) Build SELECT clause: dimensions as GROUP BY columns, metrics as aggregation expressions.
   g) **For "latest" aggregation metrics** (e.g., inventory_on_hand): Generate SQL using the metric's latestStrategy:
      - 'distinct_on': `SELECT DISTINCT ON ({partitionBy}) ... ORDER BY {partitionBy}, {asOfField} DESC`
      - 'max_subquery': subquery `WHERE {asOfField} = (SELECT MAX({asOfField}) FROM ... WHERE {dateRange filter})`
      - Always scope to the dateRange end date (as-of date semantics)
   h) Build WHERE clause: always include `tenant_id = $tenantId`. Add filter conditions. Date range filter is REQUIRED for temporal queries (error if missing).
   i) **Validate filter value types** against the filter's valueType from registry:
      - 'between' operator requires value to be [start, end] of matching type
      - 'date' type requires ISO date strings
      - 'enum' type requires value in allowedValues list
   j) Build GROUP BY from dimensions.
   k) Build ORDER BY (default: first temporal dimension ASC).
   l) Apply LIMIT (max 10000).
   m) If `comparisons` requested, use these **standardized comparison semantics**:
      - **wow (week-over-week):** Same weekday range in prior week. If dateRange is Mon-Sun, compare to prior Mon-Sun. Aligned to calendar weeks.
      - **mom (month-over-month):** Same day-of-month range in prior month. If dateRange is Feb 1-15, compare to Jan 1-15. Clamp to month end (Feb 28/29 → Jan 28).
      - **yoy (year-over-year):** Same date range in prior year. Handle leap year: Feb 29 → Feb 28.
      - **prior_period:** Immediately preceding window of identical length. If dateRange is 7 days, compare to the 7 days before.
      Generate CTEs for comparison period and compute: `current_value`, `prior_value`, `change_absolute`, `change_pct`.
   n) Return `CompiledQuery { sql: string, params: unknown[], metadata: QueryMetadata }`.

   GUARDRAILS (enforce in compiler):
   - tenant_id is ALWAYS injected, never from user input
   - Date range required for time-series metrics (max 365 days)
   - Max 20 metrics, 10 dimensions, 15 filters per query
   - Max 10,000 rows
   - statement_timeout: SET LOCAL statement_timeout = '10s' prepended
   - ONLY read model tables (rm_*) and whitelisted views. **Whitelist is built dynamically from registry entities + join graph, NOT a hardcoded list** (prevents drift when new tables are added).
   - All values are parameterized ($1, $2...), NEVER string-interpolated

3) **packages/modules/semantic/src/engine/query-executor.ts** — Executes compiled queries:

   Function: `executeQuery(compiled: CompiledQuery, tenantId: string): Promise<QueryResult>`

   - Uses `withTenant(tenantId, async (tx) => { ... })`
   - **Defense-in-depth: Execute via SET LOCAL ROLE semantic_readonly before running query, then RESET ROLE after.** Even if something slips through the regex guard, the DB role physically prevents writes.
   - Runs the compiled SQL with params
   - Returns `{ rows: Record<string, unknown>[], columns: ColumnMeta[], rowCount: number, executionTimeMs: number, truncated: boolean }`
   - Catches timeout errors and returns friendly message
   - Logs execution to audit

4) **packages/modules/semantic/src/engine/permission-filter.ts** — Filters metrics/dimensions by user role:

   Function: `filterByPermissions(plan: QueryPlan, tenantId: string, userId: string, roleIds: string[]): QueryPlan`

   - Queries semantic_metric_permissions and semantic_dimension_permissions
   - Removes metrics/dimensions the user can't see
   - If ALL requested metrics are removed, throw AuthorizationError
   - If some are removed, continue with allowed subset + add note to metadata

5) **packages/modules/semantic/src/engine/pii-guard.ts** — PII protection:

   Function: `applyPiiMasking(rows: Record<string, unknown>[], piiFields: PiiFieldDefinition[], userCanViewPii: boolean): Record<string, unknown>[]`

   - If user doesn't have PII permission, mask fields per maskingStrategy:
     - redact: replace with "***REDACTED***"
     - hash: SHA-256 first 8 chars
     - truncate: first 2 chars + "***"
   - Return masked rows

6) **packages/modules/semantic/src/engine/index.ts** — Barrel export of the QueryEngine singleton:
```typescript
   export interface QueryEngine {
     execute(plan: QueryPlanInput, ctx: { tenantId: string; userId: string; roleIds: string[] }): Promise<QueryResult>;
   }
```

   The `execute` method orchestrates: validate plan → validate filter types → filter permissions → check join safety → compile → execute (with read-only role) → mask PII → return results.

7) **packages/modules/semantic/src/engine/types.ts** — Engine-specific types:
   - CompiledQuery, QueryResult, QueryMetadata, ColumnMeta
   - QueryMetadata must include: `safetyFlags: string[]` (e.g., 'join_may_duplicate', 'assumption_defaulted', 'date_range_clamped')

8) **packages/modules/semantic/src/engine/comparison-semantics.ts** — Standardized comparison logic:
   - Exported functions: `computeWowRange(dateRange)`, `computeMomRange(dateRange)`, `computeYoyRange(dateRange)`, `computePriorPeriodRange(dateRange)`
   - Each returns `{ start: string, end: string }` for the comparison period
   - Handles edge cases: leap years, month-end clamping, partial weeks
   - These rules are also exposed to the LLM via the prompt builder (Session 3) so it doesn't improvise comparison logic

9) **packages/modules/semantic/src/engine/__tests__/query-compiler.test.ts** — Tests:
   - Compiles a simple single-metric query (gross_sales by business_date)
   - Compiles a multi-metric query (gross_sales + net_sales by location)
   - Rejects unknown metric slug
   - Rejects missing date range for temporal query
   - Enforces max limits (metrics, dimensions, rows)
   - Injects tenant_id correctly
   - Handles comparison period (wow) with correct date arithmetic
   - **Handles "latest" aggregation for inventory_on_hand (DISTINCT ON + partitionBy)**
   - **Detects join grainImpact and adds safetyFlag when may_duplicate**
   - **Validates filter value types (between requires array of 2, date requires ISO string)**
   - **Builds whitelist dynamically from registry (not hardcoded)**

10) **packages/modules/semantic/src/engine/__tests__/comparison-semantics.test.ts** — Tests:
    - WoW: aligned weekday comparison
    - MoM: month-end clamping (Jan 31 → Feb 28)
    - YoY: leap year handling (Feb 29 → Feb 28)
    - Prior period: same-length window

Use parameterized SQL via Drizzle `sql` template literals. Follow OppsEra testing conventions (vi.hoisted, mock chains, etc.).

OUTPUT: Complete, production-ready file contents. No stubs. Every function fully implemented with error handling.

Session 3 of 12 — LLM Integration Layer (Provider-Agnostic)
CONTEXT: I'm building the LLM integration for OppsEra's semantic layer. Sessions 1-2 created the semantic registry (with compact dictionary format, join cardinality, "latest" agg) and query engine (with comparison semantics, filter type validation, read-only DB role). You have my CLAUDE.md and CONVENTIONS.md.

EXISTING:
- packages/modules/semantic/src/registry/ — SemanticRegistry with metrics, dimensions, entities, join graph, toCompactDictionary()
- packages/modules/semantic/src/engine/ — QueryEngine with compileQuery (join safety, latest agg, comparison semantics), executeQuery (read-only role), permissionFilter, piiGuard
- packages/modules/semantic/src/engine/comparison-semantics.ts — Standardized comparison rules
- packages/modules/semantic/src/validation/query-plan.ts — QueryPlan Zod schema (with dataset, timezone, currency, resultShape, explain)
- packages/modules/semantic/src/types.ts — All type definitions including SemanticDictionary

TASK: Build the provider-agnostic LLM integration layer. The LLM outputs TWO objects: a structured JSON plan AND a structured rationale. Our system compiles the plan → SQL. The LLM NEVER sees or writes SQL.

BUILD THESE FILES:

1) **packages/modules/semantic/src/llm/types.ts** — LLM layer types:
```typescript
   export interface LLMProvider {
     id: string; // 'openai' | 'anthropic' | 'gemini' | 'local'
     generatePlan(prompt: string, context: LLMSemanticContext): Promise<LLMPlanResponse>;
     generateNarrative(input: NarrativeInput): Promise<string>;
   }

   export interface LLMSemanticContext {
     // COMPACT dictionary format — not verbose prose (reduces tokens, improves accuracy)
     dictionary: SemanticDictionary;
     comparisonRules: ComparisonRulesSummary; // short description of wow/mom/yoy/prior_period semantics
     examples: { question: string; plan: QueryPlan; rationale: PlanRationale }[];
     tenantContext: { businessType: string; locationNames: string[]; timezone: string; currency: string };
   }

   // LLM outputs TWO separate objects: plan + rationale
   export interface LLMPlanResponse {
     plan: QueryPlan | null;
     rationale: PlanRationale;
     clarificationNeeded: boolean;
     clarificationMessage?: string;
     clarificationSuggestions?: string[]; // clickable options for the user
     confidence: number; // 0-1
   }

   // Structured rationale — safe to show users, prevents LLM freestyle
   export interface PlanRationale {
     intentReason: string; // why this intent was chosen
     metricChoices: { slug: string; why: string }[];
     dimensionChoices: { slug: string; why: string }[];
     filterChoices: { field: string; why: string }[];
     assumptions: string[]; // explicit, short — e.g., "Assumed 'last weekend' = Sat-Sun of prior week"
     neededClarifications: string[]; // things the model wasn't sure about but proceeded anyway
   }

   export interface NarrativeInput {
     question: string;
     queryResult: QueryResult;
     metricDefinitions: MetricDefinition[];
     lensConfig?: LensConfig; // from Session 6
     filters: { field: string; value: unknown }[];
     rationale: PlanRationale;
   }

   export interface ComparisonRulesSummary {
     wow: string; // "Same weekday range in prior week, aligned to calendar weeks"
     mom: string; // "Same day-of-month range in prior month, clamped to month-end"
     yoy: string; // "Same date range in prior year, Feb 29 → Feb 28"
     prior_period: string; // "Immediately preceding window of identical length"
   }
```

2) **packages/modules/semantic/src/llm/contract-of-truth.ts** — The non-negotiable block injected into EVERY LLM prompt:
```typescript
   export const CONTRACT_OF_TRUTH = `
   ## NON-NEGOTIABLE RULES (Contract of Truth)

   ALLOWED in your reasoning:
   - Reasoning about plan structure, metric/dimension selection, filter choices
   - Reasoning about date ranges, comparisons, time grains, assumptions
   - Referencing metric slugs and dimension slugs from the dictionary provided
   - Suggesting clarifications when the question is ambiguous

   FORBIDDEN — you must NEVER:
   - Invent numbers, statistics, or data you did not receive from a query result
   - Invent metric slugs, dimension slugs, or filter fields not in the provided dictionary
   - Invent join paths or entity relationships not in the provided dictionary
   - Reference OLTP tables (orders, customers, tenders, etc.) — ONLY rm_* tables
   - Output SQL in any form — you produce JSON plans only
   - Claim data you haven't queried or make up trends

   WHEN UNCERTAIN:
   - Set clarificationNeeded=true and provide 3-6 specific suggestions
   - Do NOT guess — it's better to ask than to hallucinate

   OUTPUT FORMAT:
   - Return ONLY valid JSON matching the schema provided
   - The "plan" object is executable — no narrative, no prose
   - The "rationale" object explains your choices — structured, not freestyle
   `;
```

3) **packages/modules/semantic/src/llm/prompt-builder.ts** — Builds the system prompt with STRICT ordering:

   The system prompt MUST follow this exact order (proven higher accuracy):
   a) **Role**: "You produce JSON query plans for the OppsEra semantic analytics layer."
   b) **Contract of Truth**: inject the full CONTRACT_OF_TRUTH block
   c) **Output Schema**: exact JSON schema for { plan, rationale, clarificationNeeded, confidence } — "your output MUST validate against this schema"
   d) **Dictionary**: inject the compact SemanticDictionary (from registry.toCompactDictionary(), scoped by tenant businessType and user permissions — top 50-150 relevant items, not everything)
   e) **Comparison Rules**: short summary of wow/mom/yoy/prior_period semantics from comparison-semantics.ts
   f) **Few-shot Examples**: 5-8 examples (below)
   g) **Output Instruction**: "Return ONLY JSON. No markdown fences. No explanation outside the JSON."

   Few-shot examples (use actual OppsEra slugs):
   1) Simple report: "What were sales yesterday?" → metrics: [net_sales], dims: [business_date], intent: report
   2) Trend: "Show me daily sales for the last 2 weeks" → metrics: [net_sales], dims: [business_date], grain: day, intent: trend
   3) Comparison: "How do this week's sales compare to last week?" → metrics: [net_sales], dims: [business_date], comparisons: [wow], intent: compare
   4) Multi-metric: "What are our top 10 items by revenue?" → metrics: [item_revenue, item_qty_sold], dims: [item_name], orderBy: [{field: item_revenue, dir: desc}], limit: 10, intent: report
   5) Definition: "What is RevPATT?" → intent: definition, metrics: [rev_per_available_tee_time]
   6) Ambiguous (triggers clarification): "How are we doing?" → clarificationNeeded: true, suggestions: ["Sales this week?", "Tee sheet utilization today?", "Inventory alerts?"]
   7) Golf-specific: "What's our tee sheet utilization this month?" → metrics: [tee_sheet_utilization_pct, rounds_played, available_tee_times], dims: [business_date], grain: day, dataset: golf
   8) Inventory: "Which items are below reorder point?" → metrics: [inventory_on_hand], dims: [item_name, location], dataset: inventory, intent: report

   Each example MUST include the full { plan, rationale } output shape.

4) **packages/modules/semantic/src/llm/providers/openai.ts** — OpenAI provider:
   - Uses OpenAI chat completions API with structured output / JSON mode
   - System prompt from prompt-builder.ts
   - Parses response through Zod validation (both plan and rationale)
   - Handles rate limits, retries (3x exponential backoff)
   - Falls back to clarification request if parsing fails

5) **packages/modules/semantic/src/llm/providers/anthropic.ts** — Anthropic provider:
   - Uses Claude messages API with tool_use for structured output
   - Define a tool whose input_schema matches the plan+rationale shape
   - Same system prompt strategy, adapted for Claude's tool_use format
   - Validates output through Zod

6) **packages/modules/semantic/src/llm/providers/index.ts** — Provider factory:
```typescript
   export function getLLMProvider(providerId?: string): LLMProvider {
     const id = providerId || process.env.LLM_PROVIDER || 'anthropic';
     switch (id) {
       case 'openai': return new OpenAIProvider();
       case 'anthropic': return new AnthropicProvider();
       default: throw new Error(`Unknown LLM provider: ${id}`);
     }
   }
```

7) **packages/modules/semantic/src/llm/plan-validator.ts** — Post-LLM validation:
   - Validates LLM output against Zod schemas (both plan and rationale)
   - Cross-references metric/dimension slugs against registry — if LLM hallucinated a slug, strip it and add to rationale.neededClarifications
   - If no valid metrics remain, return clarification needed
   - **Validate filter value types against registry's valueType for each filter field**
   - Check date range: if missing and required, auto-suggest "last 7 days" with assumption noted in rationale
   - Check location filter: if tenant has multiple locations and none specified, request clarification

8) **packages/modules/semantic/src/llm/clarification-rules.ts** — Deterministic clarification logic:
```typescript
   // "Two Strikes" rule for handling ambiguity
   export interface ClarificationResult {
     needsClarification: boolean;
     reason?: string;
     suggestions?: string[];
     // If this is strike 2, provide safe defaults instead of asking again
     safeDefaults?: Partial<QueryPlan>;
     assumptionNotes?: string[];
   }

   export function checkClarificationNeeded(
     plan: QueryPlan,
     tenantContext: { locationCount: number; locationNames: string[] },
     conversationHistory: { clarificationCount: number }
   ): ClarificationResult
```

   Rules — clarify when ANY of these is true:
   - Multiple locations and no location filter implied → suggest location list
   - Date range missing for temporal metric → suggest "today", "this week", "last 7 days"
   - User asks "best/worst" without specifying dimension context → suggest dimensions
   - User asks "why" without selecting a KPI first → suggest KPI + drilldown

   Two strikes rule:
   - Strike 1: ask a single clarifying question with 3-6 clickable suggestions
   - Strike 2 (user already got one clarification this session): default to safe assumptions (last 7 days, primary location) and label as assumptions + show "Change" chips in UI

9) **packages/modules/semantic/src/llm/conversation.ts** — Conversation manager:
```typescript
   export interface ConversationManager {
     processMessage(input: {
       tenantId: string;
       userId: string;
       sessionId: string;
       message: string;
       lensId?: string;
       context?: { locationId?: string; dateRange?: { start: string; end: string } };
     }): Promise<ConversationResponse>;
   }

   export interface ConversationResponse {
     type: 'result' | 'clarification' | 'error' | 'definition';
     plan?: QueryPlan;
     rationale?: PlanRationale; // always returned when plan exists
     result?: QueryResult;
     narrative?: string;
     clarification?: { message: string; suggestions: string[] };
     metadata: {
       executionTimeMs: number;
       rowCount: number;
       confidence: number;
       safetyFlags: string[]; // from compiler
       assumptions: string[]; // from rationale + clarification defaults
     };
   }
```

   Orchestration flow:
   a) Load user permissions, build compact semantic dictionary (scoped by role + tenant businessType)
   b) Call LLM provider to generate plan + rationale
   c) Validate plan (Zod + registry cross-reference)
   d) Run deterministic clarification check (two-strikes rule)
   e) If clarification needed, return clarification response with suggestions
   f) Execute plan via QueryEngine
   g) If lens specified, pass to LensEngine (stubbed for now, built in Session 6)
   h) Generate narrative via second LLM call (with results + definitions + lens + rationale)
   i) Audit log the interaction
   j) Save to ai_conversations / ai_messages tables

10) **packages/modules/semantic/src/llm/audit.ts** — LLM query audit logging:
    - Logs to ai_messages table: sessionId, role, content, metadata including:
      - planHash (stable hash of normalized plan — for dedup + debugging)
      - rationale (structured)
      - compiledSqlHash (for correlating plan → SQL)
      - execution time, row count, provider, model, token usage
    - Uses existing audit_log for security events (unauthorized metric access attempts)

11) **packages/modules/semantic/src/llm/__tests__/prompt-builder.test.ts** — Tests:
    - Prompt follows correct ordering (role → contract → schema → dictionary → examples → output)
    - Dictionary is compact format (not full MetricDefinition objects)
    - Dictionary scoped by dataset when tenant is golf-type
    - Comparison rules are included

12) **packages/modules/semantic/src/llm/__tests__/plan-validator.test.ts** — Tests:
    - Valid plan passes
    - Unknown metric slug is stripped + warning added
    - Missing date range triggers auto-suggest with assumption
    - Filter value type mismatch rejected (between without array)
    - All metrics stripped → clarification needed

13) **packages/modules/semantic/src/llm/__tests__/clarification-rules.test.ts** — Tests:
    - Multi-location + no filter → clarification
    - Missing date range → clarification
    - Second clarification in same session → safe defaults (two-strikes)
    - "why" without KPI → suggest KPI selection

ENV VARS (document in output):
- LLM_PROVIDER: 'openai' | 'anthropic' (default: 'anthropic')
- OPENAI_API_KEY: for OpenAI provider
- ANTHROPIC_API_KEY: for Anthropic provider
- LLM_MODEL_PLAN: model for plan generation (default: gpt-4o / claude-sonnet-4-20250514)
- LLM_MODEL_NARRATIVE: model for narrative (can be smaller/cheaper)

OUTPUT: Complete, production-ready code. Implement the FULL system prompt text (not a summary). Include the full CONTRACT_OF_TRUTH. Include all 8 few-shot examples with complete plan+rationale JSON. No stubs.

Session 4 of 12 — API Routes + Security + Audit
CONTEXT: I'm building the API layer for OppsEra's semantic module. Sessions 1-3 created the registry, query engine (with read-only DB role, join safety, comparison semantics), and LLM integration (with contract of truth, plan+rationale split, clarification rules). You have my CLAUDE.md and CONVENTIONS.md.

EXISTING:
- packages/modules/semantic/src/registry/ — SemanticRegistry with toCompactDictionary()
- packages/modules/semantic/src/engine/ — QueryEngine (compile with join safety, execute with read-only role, permissions, PII)
- packages/modules/semantic/src/llm/ — LLM providers, conversation manager (with two-strikes clarification), prompt builder (with contract of truth)
- packages/modules/semantic/src/validation/query-plan.ts — Zod schemas (with dataset, timezone, currency, resultShape)
- packages/db/src/schema/semantic.ts — All semantic_* tables
- Migration includes semantic_readonly DB role

TASK: Build all API routes, security layer, and audit integration.

BUILD THESE FILES:

1) **API Routes** (all under apps/web/src/app/api/v1/semantic/):

   a) `metrics/route.ts` — GET: list metrics (filtered by user permissions). Query params: ?dataset=core|golf|inventory|customer, ?search=term
   b) `dimensions/route.ts` — GET: list dimensions (filtered by permissions). Query params: ?dataset=, ?entitySlug=daily_sales
   c) `filters/route.ts` — GET: list available filters with their operators, valueType, and allowed values
   d) `entities/route.ts` — GET: list entities + their relationships (join graph with cardinality)
   e) `query/route.ts` — POST: execute structured query plan. Body: QueryPlanInput. Returns QueryResult + metadata (including safetyFlags, assumptions).
   f) `chat/route.ts` — POST: natural language query. Body: { message, sessionId?, lensId?, context? }. Returns ConversationResponse (including rationale when plan exists).
   g) `chat/[sessionId]/route.ts` — GET: retrieve conversation history. DELETE: clear session.
   h) `chat/[sessionId]/feedback/route.ts` — POST: user feedback on a response (thumbs up/down, correction text)
   i) `definitions/[slug]/route.ts` — GET: get full definition for a metric or dimension (for tooltips/help)
   j) `suggest/route.ts` — GET: fast metric/dimension/filter suggestions for autocomplete. Query param: ?q=search_term. Returns matching items via trigram-like prefix search on slugs + names. NO LLM call — pure DB/registry lookup. This powers instant "what can I ask?" experience.

   All routes use withMiddleware with:
   - entitlement: 'semantic' (new entitlement key)
   - Permissions: 'semantic.query' for read, 'semantic.chat' for LLM, 'semantic.admin' for management

2) **Admin API Routes** (apps/web/src/app/api/v1/semantic/admin/):

   a) `metrics/route.ts` — POST: create tenant-custom metric. PATCH: update. Body validated with Zod.
   b) `metrics/[id]/route.ts` — GET, PATCH, DELETE (soft)
   c) `dimensions/route.ts` — POST: create tenant-custom dimension
   d) `permissions/route.ts` — POST: set metric/dimension permissions for a role. Body: { roleId, metricSlugs[], dimensionSlugs[], canView, canExport }
   e) `pii/route.ts` — GET: list PII field configs. POST: add PII marking. PATCH: update masking strategy.
   f) `audit/route.ts` — GET: query audit log for semantic queries. Params: ?userId, ?dateRange, ?status
   g) `performance/route.ts` — GET: query performance metrics (top 20 slowest, cache hit rate, avg execution time)

   Admin routes require: permission 'semantic.admin'

3) **packages/modules/semantic/src/commands/** — Write operations:
   a) `create-metric.ts` — Create tenant-custom metric (validated, unique slug per tenant)
   b) `update-metric.ts` — Update metric (optimistic locking via version)
   c) `deactivate-metric.ts` — Soft-delete
   d) `set-permissions.ts` — Upsert metric/dimension permissions for a role
   e) `mark-pii-field.ts` — Add PII marking to a field
   f) `save-feedback.ts` — Store user feedback on LLM response

4) **packages/modules/semantic/src/queries/** — Read operations:
   a) `list-metrics.ts` — List metrics with permission filtering + search + dataset filter
   b) `list-dimensions.ts` — List dimensions with permission filtering + dataset filter
   c) `list-filters.ts` — List filters with allowed operators + valueType
   d) `get-definition.ts` — Get full metric/dimension definition by slug
   e) `get-conversation.ts` — Get conversation history by sessionId
   f) `get-audit-log.ts` — Query semantic audit entries
   g) `suggest-items.ts` — Fast prefix search on metrics/dimensions/filters for autocomplete (no LLM, pure registry lookup)

5) **packages/modules/semantic/src/security/query-budget.ts** — Query budget enforcement:
   - Per-tenant limits: maxQueriesPerHour (default 100), maxRowsPerQuery (10000), statementTimeoutSeconds (10)
   - Per-user limits: maxConcurrentQueries (3)
   - Track via in-memory sliding window (Stage 1) or Redis (Stage 2+)
   - Return 429 with retry-after when exceeded

6) **packages/modules/semantic/src/security/read-only-guard.ts** — Multi-layer defense:
   Layer 1 (primary): Execute queries via `SET LOCAL ROLE semantic_readonly` (DB-enforced, cannot write)
   Layer 2 (regex defense-in-depth): Scan compiled SQL for INSERT/UPDATE/DELETE/DROP/ALTER/TRUNCATE
   Layer 3 (dynamic whitelist): **Build whitelist from registry entities + join graph** — not a hardcoded list. `getAllowedTables(registry)` returns the set of tables the compiler is permitted to reference. Any table not in the registry is rejected.

7) **Validation schemas** (packages/modules/semantic/src/validation/):
   a) `api-schemas.ts` — Zod schemas for all API request bodies
   b) `metric-schemas.ts` — Create/update metric schemas
   c) `permission-schemas.ts` — Permission assignment schemas
   d) `chat-schemas.ts` — Chat request/feedback schemas

8) **Entitlement registration** — Add 'semantic' to the entitlements seed data and document permissions:
   - semantic.query — Execute structured queries
   - semantic.chat — Use LLM chat
   - semantic.export — Export query results
   - semantic.admin — Manage definitions, permissions, PII
   - semantic.lenses.view — View/use lenses
   - semantic.lenses.manage — Create/edit lenses

OUTPUT: Complete route handlers, commands, queries, security modules. Follow withMiddleware pattern exactly. Use auditLog after every write operation.

Session 5 of 12 — Golf-Specific Analytics Dataset
CONTEXT: I'm building golf-specific analytics for OppsEra's semantic layer. Sessions 1-4 created the registry, engine, LLM, and APIs. You have my CLAUDE.md and CONVENTIONS.md. My database has extensive golf tables including: courses, course_holes, tee_bookings, tee_booking_players, tee_sheets, tee_seasons, tee_types, tee_pricing_plans, rack_rates, tee_categories, shotgun_starts, golf_league_profiles, golf_outing_profiles, and golf-specific read models: rm_golf_tee_time_demand, rm_golf_tee_time_fact, rm_golf_revenue_daily, rm_golf_pace_daily, rm_golf_ops_daily, rm_golf_channel_daily, rm_golf_customer_play, rm_golf_hourly_distribution, rm_golf_booking_lead_time, rm_golf_pace_checkpoints.

IMPORTANT CONTEXT FROM PRIOR SESSIONS:
- Join paths now include cardinality (one_to_one/one_to_many/many_to_one) and grainImpact (safe/may_duplicate/requires_distinct)
- "latest" aggregation metrics require: asOfField, partitionBy, latestStrategy
- Filters have a valueType field (string/number/date/boolean/enum) for type enforcement
- All metrics have a dataset field ('core'|'golf'|'inventory'|'customer')
- Registry has toCompactDictionary() that can scope by dataset

TASK: Design and implement golf-specific metrics, dimensions, and any new read models needed for the semantic layer.

BUILD THESE FILES:

1) **packages/modules/semantic/src/registry/golf-metrics.ts** — Golf-specific metrics (all with dataset: 'golf'):

   Revenue metrics:
   - green_fee_revenue: SUM from rm_golf_revenue_daily.green_fee_revenue
   - cart_fee_revenue: SUM from rm_golf_revenue_daily.cart_fee_revenue
   - range_revenue: SUM from rm_golf_revenue_daily.range_revenue
   - golf_retail_revenue: SUM from rm_golf_revenue_daily.retail_revenue
   - golf_fnb_revenue: SUM from rm_golf_revenue_daily.fnb_revenue
   - total_golf_revenue: SUM of all golf revenue streams
   - rev_per_round: total_golf_revenue / rounds_played (computed)
   - rev_per_available_tee_time (RevPATT): total_golf_revenue / available_tee_times (computed)

   Utilization metrics:
   - rounds_played: COUNT/SUM from rm_golf_ops_daily.rounds_played
   - available_tee_times: SUM from rm_golf_ops_daily.available_tee_times
   - tee_sheet_utilization_pct: rounds_played / available_tee_times * 100
   - no_show_count: SUM from rm_golf_ops_daily.no_show_count
   - no_show_rate_pct: no_show_count / booked_tee_times * 100
   - cancellation_count: SUM from rm_golf_ops_daily
   - avg_group_size: SUM(players) / SUM(groups)

   Pace metrics:
   - avg_pace_of_play_minutes: AVG from rm_golf_pace_daily.avg_pace_minutes
   - pace_deviation_minutes: AVG deviation from target pace
   - rounds_under_pace_pct: percentage of rounds within target pace

   Booking metrics:
   - avg_booking_lead_time_days: AVG from rm_golf_booking_lead_time
   - online_booking_pct: online bookings / total bookings * 100
   - member_round_pct: member rounds / total rounds * 100

   Channel metrics:
   - channel_revenue: SUM by booking channel from rm_golf_channel_daily
   - channel_round_count: COUNT by channel

   Customer metrics:
   - unique_golfers: COUNT DISTINCT from rm_golf_customer_play
   - avg_rounds_per_golfer: rounds / unique_golfers
   - golfer_spend_per_visit: total revenue / total visits
   - new_golfer_count: COUNT where first_play_date in period

2) **packages/modules/semantic/src/registry/golf-dimensions.ts** — Golf dimensions:
   - course (categorical, courses.name)
   - tee_type (categorical, e.g. Championship, Forward, Senior)
   - booking_channel (categorical: online, pro_shop, phone, member_portal, third_party)
   - player_type (categorical: member, public, guest, reciprocal, junior, senior)
   - event_type (categorical: regular, league, outing, tournament, shotgun)
   - day_part (temporal: early_bird, morning, midday, afternoon, twilight)
   - season (temporal: from tee_seasons — peak, shoulder, off_peak, winter)
   - hole_count (categorical: 9, 18, 27, 36)
   - cart_type (categorical: walking, riding, push_cart)
   - weather_condition (categorical: clear, overcast, rain, wind — future integration)
   - rate_type (categorical: rack, dynamic, promotional, member, league, outing)

3) **packages/modules/semantic/src/registry/golf-entities.ts** — Golf entities:
   - GolfRevenue → rm_golf_revenue_daily
   - GolfOps → rm_golf_ops_daily
   - GolfPace → rm_golf_pace_daily
   - GolfChannel → rm_golf_channel_daily
   - GolfCustomerPlay → rm_golf_customer_play
   - GolfHourlyDist → rm_golf_hourly_distribution
   - GolfBookingLeadTime → rm_golf_booking_lead_time
   - TeeBooking → tee_bookings (whitelisted OLTP read)

4) **packages/modules/semantic/src/registry/golf-join-graph.ts** — Golf join paths WITH cardinality + grainImpact:
   - rm_golf_revenue_daily → locations: many_to_one, safe
   - rm_golf_revenue_daily → courses: many_to_one, safe
   - rm_golf_ops_daily → locations: many_to_one, safe
   - rm_golf_ops_daily → courses: many_to_one, safe
   - rm_golf_pace_daily → courses: many_to_one, safe
   - rm_golf_channel_daily → locations: many_to_one, safe
   - rm_golf_customer_play → customers: many_to_one, safe
   - rm_golf_customer_play → courses: many_to_one, safe
   - rm_golf_hourly_distribution → courses: many_to_one, safe
   Include notes on each explaining the join semantics.

5) **packages/modules/semantic/src/registry/golf-filters.ts** — Golf-specific canonical filters WITH valueType:
   - course_id: valueType='string', ops: [eq, in]
   - tee_type: valueType='enum', ops: [eq, in, neq], allowedValues from tee_types
   - booking_channel: valueType='enum', ops: [eq, in]
   - player_type: valueType='enum', ops: [eq, in]
   - event_type: valueType='enum', ops: [eq, in, neq]
   - day_part: valueType='enum', ops: [eq, in]
   - season: valueType='enum', ops: [eq, in]
   - rate_type: valueType='enum', ops: [eq, in]
   - hole_count: valueType='number', ops: [eq, in]

6) **packages/modules/semantic/src/datasets/golf-dashboard.ts** — Pre-built golf dashboard definitions:
   - "Golf Revenue Overview": green_fee + cart + retail + F&B by day, with WoW comparison
   - "Tee Sheet Utilization": utilization %, rounds played, no-shows by day_part
   - "Pace of Play Monitor": avg pace, deviation, % under target by course
   - "Channel Performance": revenue + rounds by booking_channel
   - "Golfer Insights": unique golfers, avg spend, member vs public mix

7) **Update packages/modules/semantic/src/registry/index.ts** — Merge golf metrics/dimensions into the main registry. toCompactDictionary({ dataset: 'golf' }) should return only golf items.

8) **packages/modules/semantic/src/sync/golf-seed.ts** — Seed script for golf-specific system-level definitions.

9) **Update the semantic_readonly role grant** — Add any new golf rm_ tables that aren't already in the GRANT. Provide the ALTER SQL.

MAPPING NOTES: For each metric/dimension, include a comment explaining which existing rm_ table column it maps to, and flag any metrics that would need a new read model or column. If a new rm_ table or column is needed, spec it out with the migration SQL.

OUTPUT: Complete file contents with all golf metrics, dimensions, filters, join paths, and dashboard specs fully defined.

Session 6 of 12 — Custom Lenses System
CONTEXT: I'm building the Custom Lenses system for OppsEra's semantic layer. Sessions 1-5 built the registry, engine, LLM, APIs, and golf datasets. You have my CLAUDE.md and CONVENTIONS.md.

EXISTING:
- Full semantic module with registry, query engine, LLM integration, API routes
- LLM conversation manager that currently stubs the lens step
- NarrativeInput type already has optional lensConfig field
- LLM outputs plan + structured rationale (PlanRationale)
- Contract of Truth enforced in all LLM prompts
- Comparison semantics standardized (wow/mom/yoy/prior_period)

TASK: Build the complete Custom Lenses system — the interpretation/response layer that NEVER changes underlying numbers, only affects narrative framing, tone, priorities, and recommended actions.

BUILD THESE FILES:

1) **packages/db/src/schema/semantic-lenses.ts** — Drizzle schema:

   `semantic_lenses` table:
   - id (ULID), tenantId (nullable for system lenses), name, slug, description
   - audience (text — who this lens is written for)
   - tone (enum: direct, formal, friendly, terse, analytical, executive)
   - outputFormat (enum: bullets, narrative, executive_summary, json, markdown_table, mixed)
   - focusAreas (jsonb — string array: profitability, labor, shrink, pace_of_play, member_satisfaction, cash_flow, growth, efficiency, risk, compliance)
   - constraints (jsonb — string array: avoid_speculation, show_assumptions, include_date_ranges, cite_definitions, include_comparisons)
   - requiredSections (jsonb — string array: key_takeaways, risks, next_actions, data_notes, assumptions, trends, anomalies)
   - kpiPriority (jsonb — ordered string array of metric slugs to emphasize)
   - playbooks (jsonb — array of { pattern: string, condition: string, suggestedActions: string[] })
   - glossaryOverrides (jsonb — Record<string, string> — tenant-specific metric definitions)
   - isSystem (bool), isActive (bool), isDefault (bool)
   - createdBy, createdAt, updatedAt, version (optimistic locking)

   `semantic_lens_packs` table:
   - id, name, slug, description, businessType (retail, restaurant, golf, hybrid)
   - lensIds (jsonb — array of lens IDs included in this pack)
   - isSystem, isActive, createdAt

   `semantic_lens_assignments` table:
   - id, tenantId, userId (nullable — null means tenant default), lensId (FK)
   - isDefault (bool), createdAt

   RLS on all tables. System lenses visible to all (tenant_id IS NULL).

2) **packages/db/migrations/NNNN_semantic_lenses.sql** — Migration with tables, RLS, indexes.

3) **packages/modules/semantic/src/lenses/types.ts** — Lens types:
```typescript
   export interface LensConfig {
     id: string;
     name: string;
     audience: string;
     tone: LensTone;
     outputFormat: LensOutputFormat;
     focusAreas: string[];
     constraints: string[];
     requiredSections: string[];
     kpiPriority: string[];
     playbooks: LensPlaybook[];
     glossaryOverrides: Record<string, string>;
   }

   export interface LensPlaybook {
     pattern: string; // e.g., "sales_decline_wow"
     condition: string; // e.g., "net_sales wow_change < -10%"
     suggestedActions: string[];
   }

   export interface ResponseSpec {
     sections: ResponseSection[];
     highlightedKpis: { slug: string; value: number; format: string; comparison?: ComparisonValue }[];
     charts: ChartSpec[]; // suggested visualizations
     dataNotes: DataNote[];
     assumptions: string[];
   }

   export interface ResponseSection {
     type: 'key_takeaways' | 'risks' | 'next_actions' | 'data_notes' | 'assumptions' | 'trends' | 'anomalies' | 'custom';
     title: string;
     content: string; // markdown
     priority: number;
   }
```

4) **packages/modules/semantic/src/lenses/lens-engine.ts** — The Lens Engine (post-query):

   Function: `buildResponseSpec(input: { queryResult: QueryResult, plan: QueryPlan, lensConfig: LensConfig, metricDefinitions: MetricDefinition[], rationale: PlanRationale }): ResponseSpec`

   Logic:
   a) Determine which KPIs from the result to highlight based on lensConfig.kpiPriority
   b) Check playbook conditions against the data (e.g., if net_sales WoW change < -10%, fire the sales_decline_wow playbook)
   c) Build required sections based on lensConfig.requiredSections
   d) Compute comparison values (WoW, MoM, YoY) if data includes temporal dimension — using the standardized comparison semantics from engine/comparison-semantics.ts
   e) Suggest chart types based on plan.resultShape (timeseries → line, table → bar/table, kpi → big number)
   f) Build data notes: time range, filters applied, grain, row count, data freshness
   g) Apply glossary overrides to metric names in the response
   h) Include rationale.assumptions in the assumptions section

5) **packages/modules/semantic/src/lenses/narrative-builder.ts** — Final LLM narrative pass:

   Function: `buildNarrative(input: { question: string, responseSpec: ResponseSpec, queryResult: QueryResult, lensConfig: LensConfig, metricDefinitions: MetricDefinition[], rationale: PlanRationale }): Promise<string>`

   - Constructs a prompt for the LLM that includes:
     a) Role: "You are generating an analytics narrative for the OppsEra platform."
     b) Contract of Truth (same block as plan generation — NEVER invent numbers)
     c) Lens instructions: "Use tone: {tone}. Write for audience: {audience}. Include these sections: {sections}. Emphasize these KPIs: {kpis}. Apply constraints: {constraints}."
     d) Structured data: the actual query results as JSON
     e) Metric definitions: from semantic layer (so the LLM cites them correctly)
     f) Response spec: which sections, which KPIs highlighted, which playbooks fired
     g) Rationale: the plan rationale including assumptions
     h) Output instruction: "Return markdown. Include required section headers. NEVER change the numbers in the data."
   - Parses the LLM response and validates it includes required sections
   - Appends "Data Notes" section PROGRAMMATICALLY (never from LLM — ensures accuracy)
   - Appends "Assumptions" section PROGRAMMATICALLY from rationale.assumptions + any safe defaults applied

6) **packages/modules/semantic/src/lenses/builtin-lenses.ts** — Pre-built system lenses:

   a) **CFO Lens**: tone=executive, focusAreas=[profitability, cash_flow, risk, growth], requiredSections=[key_takeaways, risks, trends], kpiPriority=[net_sales, gross_margin, avg_order_value, void_count], playbooks for revenue decline, margin compression, high void rate

   b) **Golf GM Lens**: tone=direct, focusAreas=[pace_of_play, utilization, member_satisfaction, efficiency], requiredSections=[key_takeaways, next_actions, anomalies], kpiPriority=[tee_sheet_utilization_pct, avg_pace_of_play_minutes, rev_per_round, no_show_rate_pct], playbooks for low utilization, pace issues, high no-shows

   c) **VP Revenue Lens**: tone=analytical, focusAreas=[growth, profitability, channel_performance], requiredSections=[key_takeaways, trends, next_actions], kpiPriority=[total_golf_revenue, RevPATT, online_booking_pct, member_round_pct]

   d) **Inventory Controller Lens**: tone=terse, focusAreas=[shrink, efficiency, compliance], requiredSections=[key_takeaways, risks, data_notes], kpiPriority=[inventory_on_hand, inventory_value, item_qty_sold]

   e) **Board Deck Lens**: tone=formal, outputFormat=executive_summary, focusAreas=[growth, profitability, risk], requiredSections=[key_takeaways, trends, risks], constraints=[avoid_speculation, include_comparisons]

7) **packages/modules/semantic/src/lenses/commands/** — Lens CRUD:
   a) `create-lens.ts`
   b) `update-lens.ts` (optimistic locking)
   c) `deactivate-lens.ts`
   d) `assign-lens.ts` (set default lens for user or tenant)
   e) `import-lens-pack.ts` (copy system lenses into tenant with customization)

8) **packages/modules/semantic/src/lenses/queries/** — Lens reads:
   a) `list-lenses.ts` — System + tenant lenses, with user's default marked
   b) `get-lens.ts` — Full lens config by ID or slug
   c) `get-user-default-lens.ts` — Resolve: user assignment → tenant default → system default

9) **packages/modules/semantic/src/lenses/validation.ts** — Zod schemas for lens CRUD:
   - createLensSchema, updateLensSchema, assignLensSchema
   - Validate focusAreas against allowed list, requiredSections against allowed list
   - Validate kpiPriority slugs exist in semantic registry
   - Validate playbook conditions are parseable
   - Sanitize all text fields (strip HTML/scripts — no executable code in playbook suggestedActions)

10) **packages/modules/semantic/src/lenses/safety.ts** — Lens safety:
    - Lenses CANNOT grant access to metrics/dimensions hidden by RBAC
    - Lenses CANNOT override PII masking
    - Lens playbook suggestedActions are text-only (no executable code)
    - glossaryOverrides only affect display text, not computations
    - Validate lens configs with sanitization (strip any HTML/scripts from text fields)

11) **API Routes** (apps/web/src/app/api/v1/semantic/lenses/):
    a) `route.ts` — GET: list lenses, POST: create lens
    b) `[id]/route.ts` — GET, PATCH, DELETE (soft)
    c) `assign/route.ts` — POST: assign lens as default
    d) `packs/route.ts` — GET: list lens packs, POST: import pack

12) **Update packages/modules/semantic/src/llm/conversation.ts** — Wire in the lens engine:
    - After query execution, resolve lens (from request lensId, or user default, or tenant default)
    - Call lensEngine.buildResponseSpec() — pass rationale through
    - Call narrativeBuilder.buildNarrative() with the response spec
    - Include lens metadata + rationale in the response

OUTPUT: Complete implementation. Include the full text of every built-in lens definition. Include the full narrative prompt template (with Contract of Truth). No stubs.

Session 7 of 12 — Chat UI + Data Explorer Frontend
CONTEXT: I'm building the customer-facing frontend for OppsEra's semantic layer in apps/web/. Sessions 1-6 built the complete backend (registry, engine, LLM, APIs, golf datasets, lenses). Session 0 built the eval DB + capture service. Session 0.5 built the super admin panel (apps/admin/) with eval review UI. You have my CLAUDE.md and CONVENTIONS.md.

IMPORTANT: This session builds ONLY the customer-facing UI in apps/web/. The admin review, quality dashboard, and golden example management are in apps/admin/ (Session 0.5). The only eval-related pieces in apps/web/ are:
- The FeedbackWidget (thumbs up/down + stars + tags) embedded below assistant messages
- The user feedback submission API route (POST /api/v1/semantic/eval/turns/[id]/feedback/ — built in Session 0)

FRONTEND CONVENTIONS (from CONVENTIONS.md):
- Next.js 15 App Router, React 19, 'use client' on interactive components
- Tailwind v4 with inverted dark mode (gray-900 = near-white in dark)
- Data hooks: useFetch<T>(url), useMutation<TInput, TResult>(fn)
- apiFetch for API calls with token refresh
- Components in apps/web/src/components/, hooks in apps/web/src/hooks/
- Pages in apps/web/src/app/(dashboard)/

IMPORTANT BACKEND CONTEXT:
- Chat API returns ConversationResponse with plan, rationale (PlanRationale), result, narrative, and metadata (including safetyFlags, assumptions, evalTurnId)
- evalTurnId is included in every response so the FeedbackWidget can link ratings to the correct eval turn
- Clarification responses include clickable suggestions (from two-strikes rule)
- Results include comparison values (WoW, MoM, YoY) when requested
- Lens config affects narrative but NOT data
- Suggest endpoint (/semantic/suggest?q=...) provides instant autocomplete without LLM

TASK: Build the complete chat + data explorer UI with lens selection, interactive results, and user feedback widget.

BUILD THESE FILES:

### Pages

1) **apps/web/src/app/(dashboard)/insights/page.tsx** — Main insights hub:
   - Split layout: left panel (60%) = chat interface, right panel (40%) = results/data explorer
   - On mobile (<768px): full-width tabbed layout (Chat | Results)
   - Header with lens selector dropdown and session management

2) **apps/web/src/app/(dashboard)/insights/explore/page.tsx** — Visual query builder:
   - Drag-and-drop or click-to-add interface for metrics and dimensions
   - Filter builder with typed operators (reuse patterns from custom report builder)
   - Live preview of result as table/chart
   - "Ask AI about this" button that sends the current query config as context to chat

3) **apps/web/src/app/(dashboard)/insights/lenses/page.tsx** — Lens management:
   - List of system + custom lenses with preview cards
   - Create/edit lens form
   - Lens pack browser (import pre-built packs)
   - "Try this lens" instant preview with a sample question

4) **apps/web/src/app/(dashboard)/insights/history/page.tsx** — Conversation history:
   - List of past sessions with search
   - Click to review full conversation
   - Export conversation to PDF/markdown

### Components

5) **apps/web/src/components/insights/ChatPanel.tsx** — The main chat interface:
   - Message input with autocomplete powered by /semantic/suggest endpoint (instant, no LLM)
   - Send button (Enter to send, Shift+Enter for newline)
   - Message history (scrollable, auto-scroll to bottom on new message)
   - User messages: right-aligned, indigo bubble
   - Assistant messages: left-aligned, surface-colored, rendered as markdown
   - Loading state: typing indicator with animated dots
   - Suggestion chips below the input for common questions:
     - "How were sales yesterday?"
     - "Compare this week vs last week"
     - "Show me top 10 items by revenue"
     - "What's our tee sheet utilization?"
   - **Clarification responses**: show assistant's clarification question with CLICKABLE option buttons (from clarificationSuggestions array). Clicking a suggestion sends it as the next message.
   - **Assumption chips**: when response includes assumptions (from two-strikes defaults), show them as amber "Change" chips that let the user override (e.g., "Assumed: last 7 days [Change]")
   - Error state: red-bordered message with retry button
   - Session management: "New conversation" button, session list in a dropdown

6) **apps/web/src/components/insights/ResultPanel.tsx** — Interactive results display:
   - Tabs: Narrative | Table | Chart | Rationale | SQL (debug)
   - **Narrative tab**: rendered markdown with highlighted KPIs, section headers, playbook suggestions in callout boxes
   - **Table tab**: DataTable with sortable columns, formatted values (currency, %, integers), export CSV button
   - **Chart tab**: Recharts visualization based on plan.resultShape:
     - timeseries → LineChart
     - table (categorical) → BarChart
     - kpi → big number KPI card with comparison arrow
     - pivot → grouped bar chart
   - **Rationale tab**: structured display of PlanRationale — intent reason, metric/dimension choices with explanations, assumptions, needed clarifications. Collapsible sections.
   - **SQL tab** (collapsed by default): shows the compiled SQL for transparency, syntax-highlighted
   - Metadata footer: execution time, row count, data freshness, grain, filters applied, safetyFlags (if any)

7) **apps/web/src/components/insights/LensSelector.tsx** — Lens picker:
   - Dropdown with search
   - Shows lens name + audience tag + tone badge
   - Current lens highlighted
   - "Customize" link opens lens editor
   - "Default" badge on the user's default lens
   - System lenses grouped separately from custom

8) **apps/web/src/components/insights/MetricPicker.tsx** — For the explore page:
   - Grouped by dataset (Core, Golf, Inventory, Customer)
   - Search/filter
   - Click to add to query
   - Tooltip with description + formula on hover
   - Drag-and-drop reorder of selected metrics

9) **apps/web/src/components/insights/DimensionPicker.tsx** — Similar to MetricPicker for dimensions

10) **apps/web/src/components/insights/FilterBuilder.tsx** — Filter construction:
    - Add filter → select field → select operator → enter value
    - **Typed inputs based on filter's valueType**: date picker for 'date', multi-select for 'enum' (with allowedValues), number input for 'number', text input for 'string'
    - **'between' operator shows two inputs** (start + end)
    - Remove filter with X button
    - Reuse filter builder patterns from existing custom report builder

11) **apps/web/src/components/insights/KpiHighlight.tsx** — Big number display:
    - Metric name, current value (large font), comparison value (WoW/MoM with arrow + color)
    - Green for positive change, red for negative (respecting metric polarity — lower void_count is good)
    - Sparkline mini-chart if time-series data available

12) **apps/web/src/components/insights/PlaybookCard.tsx** — Playbook suggestion display:
    - Amber/yellow callout box
    - Pattern name as header
    - Condition that triggered it
    - Suggested actions as numbered list
    - "Dismiss" and "Explore further" buttons

13) **apps/web/src/components/insights/NarrativeRenderer.tsx** — Renders the LLM narrative:
    - Markdown rendering with section headers
    - Inline metric references as hoverable chips (show definition on hover via /definitions/[slug] endpoint)
    - Data notes in a muted callout at the bottom (programmatically generated, always accurate)
    - Assumptions in an amber callout (if present)
    - FeedbackWidget rendered below (see item 20)

14) **apps/web/src/components/insights/ConversationMessage.tsx** — Individual chat message:
    - Avatar (user or AI icon)
    - Timestamp
    - Message content (markdown for assistant, plain for user)
    - For result messages: embedded mini-ResultPanel (narrative + chart)
    - Copy button
    - For assistant messages: render FeedbackWidget below the message, passing the evalTurnId from response metadata
    - For clarification messages: clickable suggestion buttons

### Hooks

15) **apps/web/src/hooks/use-semantic.ts** — Core semantic hooks:
```typescript
    export function useMetrics(dataset?: string) { ... }
    export function useDimensions(dataset?: string) { ... }
    export function useFilters() { ... }
    export function useSuggest(query: string) { ... } // instant autocomplete via /semantic/suggest
    export function useSemanticQuery() {
      // Returns { execute, data, isLoading, error }
      // execute(plan: QueryPlanInput) → fires POST /semantic/query
    }
```

16) **apps/web/src/hooks/use-chat.ts** — Chat session management:
```typescript
    export function useChat() {
      // Returns:
      // messages: ChatMessage[] (includes rationale when available)
      // sendMessage(text: string, lensId?: string): Promise<void>
      // isStreaming: boolean (for future streaming support)
      // sessionId: string
      // newSession(): void
      // sessions: { id, title, lastMessage, createdAt }[]
      // clarificationCount: number (for two-strikes tracking)
    }
```

17) **apps/web/src/hooks/use-lenses.ts** — Lens management:
```typescript
    export function useLenses() { ... } // list
    export function useLens(id: string) { ... } // single
    export function useLensMutation() { ... } // CRUD
    export function useDefaultLens() { ... } // get/set user default
```

18) **apps/web/src/types/insights.ts** — Frontend types matching API response shapes (including PlanRationale, ComparisonValue, SafetyFlags)

### User Feedback Widget (lives in apps/web — NOT in the super admin panel)

20) **apps/web/src/components/insights/FeedbackWidget.tsx** — Embedded in chat responses:
    - Compact inline widget below each assistant message in the chat
    - Two modes:
      a) **Quick mode (default):** Thumbs up / Thumbs down buttons. Clicking opens expanded mode.
      b) **Expanded mode:**
         - 5-star rating (clickable stars)
         - Tag selector: pills the user can click to tag the response (wrong_data, confusing, great_insight, wrong_metric, missing_context, too_verbose, perfect). Multiple select allowed.
         - Optional text feedback (textarea, placeholder: "Tell us more about what went wrong or right...")
         - Submit button
    - After submission: shows "Thanks for your feedback!" and collapses back to a checkmark
    - Props: `evalTurnId: string` (from the response metadata so ratings are linked to the right eval turn)
    - Submits to: POST /api/v1/semantic/eval/turns/[id]/feedback/ (the ONLY eval API route in apps/web, built in Session 0)
    - Optimistic UI: update stars immediately, submit in background

21) **apps/web/src/components/insights/RatingStars.tsx** — Reusable star rating:
    - Display mode: shows filled/empty stars (read-only)
    - Input mode: clickable stars with hover preview
    - Sizes: sm (16px), md (20px), lg (24px)
    - Half-star support for averages in display mode

22) **apps/web/src/hooks/use-feedback.ts** — Feedback hook:
```typescript
    export function useSubmitFeedback() {
      // Returns mutation for submitting user feedback via POST /api/v1/semantic/eval/turns/[id]/feedback/
      // useMutation pattern with optimistic update
    }
```

### Navigation

23) **Update sidebar** — Add "Insights" section to dashboard sidebar:
    - Insights (main chat)
      - Chat (default)
      - Explore (visual builder)
      - Lenses (management)
      - History (past conversations)
    Use Sparkles icon from lucide-react.
    NOTE: There is NO "Evaluation" section in the customer-facing sidebar. All evaluation/review UI lives in the super admin panel (apps/admin/).

OUTPUT: Complete file contents for all components, pages, hooks. Use Tailwind v4 with the inverted dark mode conventions. All components must be mobile-responsive (320px+). Use Recharts for charts. Follow existing component patterns from the codebase.

Session 8 of 12 — Performance, Caching, Observability, and Indexing
CONTEXT: I'm optimizing performance and adding observability for OppsEra's semantic layer. Sessions 1-7 built the full stack. You have my CLAUDE.md and CONVENTIONS.md.

TASK: Implement caching, indexing, observability fingerprinting, and performance optimizations for sub-second query responses.

BUILD THESE FILES:

1) **packages/modules/semantic/src/cache/registry-cache.ts** — Semantic registry cache:
   - In-memory LRU cache (Stage 1) for semantic definitions
   - Cache key: `semantic:registry:{tenantId}` (tenant-specific, includes system + tenant definitions)
   - TTL: 5 minutes (definitions change rarely)
   - Invalidate on: create/update/deactivate metric/dimension
   - Cache the full resolved registry per tenant to avoid per-request DB lookups

2) **packages/modules/semantic/src/cache/query-cache.ts** — Query result cache:
   - In-memory cache with configurable TTL per query type
   - Cache key: SHA-256 hash of `{tenantId}:{compiledSQL}:{params}`
   - TTL strategy:
     - Dashboard queries (today's data): 60 seconds
     - Historical queries (completed periods): 5 minutes
     - Definition lookups: 10 minutes
   - Max cache entries per tenant: 100 (LRU eviction)
   - Cache-Control headers: return `X-Cache: HIT/MISS` + `X-Cache-TTL` headers
   - Skip cache when: user forces refresh, query includes current date in range

3) **packages/modules/semantic/src/cache/llm-context-cache.ts** — LLM context cache:
   - Cache the built LLMSemanticContext (compact dictionary) per (tenantId, roleId) combination
   - TTL: 5 minutes (same as registry)
   - Avoids rebuilding the prompt context on every chat message
   - Invalidate when permissions change

4) **packages/db/migrations/NNNN_semantic_performance_indexes.sql** — Indexes:

   For rm_ tables (if not already indexed):
```sql
   -- Core read model indexes for semantic queries
   CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_rm_daily_sales_tenant_date
     ON rm_daily_sales (tenant_id, business_date DESC);
   CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_rm_daily_sales_tenant_location_date
     ON rm_daily_sales (tenant_id, location_id, business_date DESC);
   CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_rm_item_sales_tenant_date
     ON rm_item_sales (tenant_id, business_date DESC);
   CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_rm_item_sales_tenant_location_date
     ON rm_item_sales (tenant_id, location_id, business_date DESC);
   CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_rm_item_sales_tenant_category
     ON rm_item_sales (tenant_id, category_name);

   -- Golf read model indexes
   CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_rm_golf_revenue_tenant_date
     ON rm_golf_revenue_daily (tenant_id, business_date DESC);
   CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_rm_golf_ops_tenant_date
     ON rm_golf_ops_daily (tenant_id, business_date DESC);
   CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_rm_golf_pace_tenant_date
     ON rm_golf_pace_daily (tenant_id, business_date DESC);
   CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_rm_golf_channel_tenant_date
     ON rm_golf_channel_daily (tenant_id, business_date DESC);

   -- Semantic table indexes
   CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_semantic_metrics_tenant_slug
     ON semantic_metrics (tenant_id, slug);
   CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_semantic_lenses_tenant_active
     ON semantic_lenses (tenant_id, is_active) WHERE is_active = true;

   -- AI conversation indexes
   CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ai_messages_session
     ON ai_messages (session_id, created_at);
   CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ai_conversations_tenant_user
     ON ai_conversations (tenant_id, user_id, created_at DESC);

   -- Suggest endpoint: trigram index for fast prefix search on metric/dimension names
   CREATE EXTENSION IF NOT EXISTS pg_trgm;
   CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_semantic_metrics_name_trgm
     ON semantic_metrics USING gin (name gin_trgm_ops);
   CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_semantic_dimensions_name_trgm
     ON semantic_dimensions USING gin (name gin_trgm_ops);
```

5) **packages/modules/semantic/src/engine/query-optimizer.ts** — Pre-execution optimizations:
   - Detect if query can be served entirely from a single rm_ table (skip joins)
   - For aggregation-only queries (no row-level data), use covering indexes
   - For "today" queries on rm_daily_sales, add hint to use the date index
   - For comparison queries (WoW), use CTE with date arithmetic instead of subquery
   - Limit pushed down: if ORDER BY + LIMIT, wrap in subquery to avoid full table scan

6) **packages/modules/semantic/src/cache/warming.ts** — Cache warming strategy:
   - On tenant login, pre-warm: registry cache, default dashboard queries
   - Background job: refresh popular queries every 5 minutes during business hours
   - Track query frequency per tenant to determine what to warm

7) **packages/modules/semantic/src/monitoring/query-metrics.ts** — Observability with "plan → compiled → result fingerprint":

   Record these fields for every semantic query execution:
```typescript
   export interface QueryExecutionRecord {
     // Identity
     tenantId: string;
     userId: string;
     sessionId?: string;

     // Plan fingerprint
     planHash: string; // stable SHA-256 of normalized plan (sorted keys, stripped whitespace)
     sqlHash: string;  // SHA-256 of compiled SQL

     // Result fingerprint
     resultFingerprint: {
       rowCount: number;
       minDate?: string; // earliest date in result (if temporal)
       maxDate?: string; // latest date in result
       nullRate: number; // % of null values across all columns
       columnCount: number;
     };

     // Performance
     executionTimeMs: number;
     cacheStatus: 'HIT' | 'MISS' | 'SKIP';
     cacheTtlMs?: number;

     // Safety
     safetyFlags: string[]; // from compiler: join_may_duplicate, assumption_defaulted, etc.

     // LLM (if chat-originated)
     llmProvider?: string;
     llmModel?: string;
     llmTokensUsed?: number;
     llmLatencyMs?: number;
     confidence?: number;

     // Timestamp
     executedAt: string; // ISO 8601
   }
```

   - Log to `request_log` or a new `semantic_query_log` table
   - Expose via admin API: GET /semantic/admin/performance:
     - Top 20 slowest queries (by sqlHash, with avg execution time)
     - Cache hit rate (24h rolling)
     - Avg execution time by intent type
     - Safety flag frequency (how often do joins cause duplication warnings?)
     - LLM token cost by provider
   - This fingerprint enables debugging "LLM was right but data looked wrong" — compare planHash + sqlHash + resultFingerprint across executions

8) **packages/modules/semantic/src/engine/__tests__/query-cache.test.ts** — Cache tests:
   - Cache hit returns same result
   - Cache miss executes query
   - TTL expiry works
   - Forced refresh bypasses cache
   - Different tenants have isolated caches
   - LRU eviction works

9) **packages/modules/semantic/src/monitoring/__tests__/query-metrics.test.ts** — Observability tests:
   - planHash is stable for equivalent plans (different key ordering → same hash)
   - resultFingerprint captures null rate correctly
   - safetyFlags propagated from compiler

OUTPUT: Complete implementations. Use the in-memory cache pattern consistent with OppsEra's existing tile cache (if any). Include all SQL. Follow the existing patterns.

Session 9 of 12 — End-to-End Examples + Integration Tests
CONTEXT: I'm writing the end-to-end integration for OppsEra's semantic layer. Sessions 1-8 built everything. You have my CLAUDE.md and CONVENTIONS.md.

IMPORTANT: All examples must reflect the FULL architecture including:
- Plan + structured rationale (PlanRationale) from LLM
- Contract of Truth enforced
- Join cardinality checks with safetyFlags
- "latest" aggregation for inventory metrics (DISTINCT ON + partitionBy)
- Standardized comparison semantics (wow/mom/yoy)
- Read-only DB role execution
- Dynamic table whitelist from registry
- Two-strikes clarification rule
- Observability fingerprint (planHash, sqlHash, resultFingerprint)
- Compact dictionary format for LLM context

TASK: Build complete end-to-end examples showing the full flow, plus integration tests.

BUILD THESE FILES:

1) **packages/modules/semantic/src/examples/e2e-fnb-sales.ts** — Full walkthrough:

   Scenario: User asks "How much did we do in F&B sales last weekend at Warren Valley?"

   Document each step with code + data:
   a) User sends message via POST /semantic/chat
   b) ConversationManager loads user permissions, builds compact semantic dictionary
   c) LLM generates plan + rationale:
```json
      {
        "plan": {
          "question": "How much did we do in F&B sales last weekend at Warren Valley?",
          "intent": "report",
          "metrics": ["net_sales"],
          "dimensions": ["business_date"],
          "filters": [
            {"field": "location_id", "op": "eq", "value": "LOCATION_WARREN_VALLEY"},
            {"field": "department", "op": "eq", "value": "Food & Beverage"},
            {"field": "business_date", "op": "between", "value": ["2026-02-14", "2026-02-15"]}
          ],
          "grain": "day",
          "dataset": "core",
          "timezone": "America/Detroit",
          "currency": "USD",
          "resultShape": "timeseries",
          "limit": 100,
          "orderBy": [{"field": "business_date", "dir": "asc"}]
        },
        "rationale": {
          "intentReason": "User is asking for a specific revenue figure over a date range",
          "metricChoices": [{"slug": "net_sales", "why": "F&B sales = net sales filtered by F&B department"}],
          "dimensionChoices": [{"slug": "business_date", "why": "User specified 'last weekend' — daily breakdown shows Sat vs Sun"}],
          "filterChoices": [
            {"field": "location_id", "why": "Warren Valley is a known location name"},
            {"field": "department", "why": "F&B maps to the Food & Beverage department filter"}
          ],
          "assumptions": ["'Last weekend' interpreted as Saturday Feb 14 - Sunday Feb 15, 2026"],
          "neededClarifications": []
        },
        "clarificationNeeded": false,
        "confidence": 0.95
      }
```
   d) Plan validation passes, filter types validated
   e) Compiler checks: rm_daily_sales is in dynamic whitelist, no risky joins needed (single table)
   f) Query compiler generates SQL (executed via SET LOCAL ROLE semantic_readonly):
```sql
      SET LOCAL statement_timeout = '10s';
      SELECT business_date, SUM(net_sales) as net_sales
      FROM rm_daily_sales
      WHERE tenant_id = $1
        AND location_id = $2
        AND department = $3
        AND business_date BETWEEN $4 AND $5
      GROUP BY business_date
      ORDER BY business_date ASC
      LIMIT 100
```
   g) Observability: planHash=abc123, sqlHash=def456, resultFingerprint={rowCount:2, minDate:'2026-02-14', maxDate:'2026-02-15', nullRate:0}
   h) Query executes, returns result
   i) Lens engine builds response spec (CFO lens vs Golf GM lens)
   j) Show both narratives with Data Notes + Assumptions appended programmatically

2) **packages/modules/semantic/src/examples/e2e-golf-utilization.ts** — Golf scenario with YoY comparison:
   - Shows plan with comparisons: ['yoy'], dataset: 'golf'
   - Shows comparison-semantics computing the prior year date range
   - Shows CTE-based SQL
   - Shows Golf GM lens narrative

3) **packages/modules/semantic/src/examples/e2e-inventory-latest.ts** — Inventory "latest" aggregation:
   - Shows plan targeting rm_inventory_on_hand with "latest" agg
   - Shows DISTINCT ON SQL generated from asOfField + partitionBy
   - Shows Inventory Controller lens with action items

4) **packages/modules/semantic/src/examples/e2e-clarification-flow.ts** — Two-strikes clarification:
   - User asks "How are we doing?" (ambiguous)
   - Strike 1: clarification with 4 suggestions
   - User clicks a suggestion
   - Shows the resulting plan + execution

5) **Integration test files:**

   a) **packages/modules/semantic/src/__tests__/registry.test.ts** — Tests:
      - Registry loads all metrics/dimensions
      - getMetric returns correct definition (including asOfField for latest metrics)
      - getDimension handles hierarchical dimensions
      - Registry merges system + golf definitions
      - toCompactDictionary scopes by dataset correctly

   b) **packages/modules/semantic/src/__tests__/query-engine.test.ts** — Tests:
      - Compiles simple single-table query correctly
      - Compiles join query when metrics span tables
      - **Detects grainImpact and adds safetyFlag for may_duplicate joins**
      - **Generates DISTINCT ON for "latest" aggregation metrics**
      - Rejects OLTP table access
      - **Builds dynamic whitelist from registry (not hardcoded)**
      - Injects tenant_id in WHERE
      - Enforces date range requirement
      - Handles comparison period (WoW) with correct date arithmetic
      - **Validates filter value types (between requires array)**
      - Permission filtering removes unauthorized metrics
      - PII masking works

   c) **packages/modules/semantic/src/__tests__/conversation.test.ts** — Tests:
      - Full chat flow: message → plan + rationale → query → narrative
      - **Rationale is always returned alongside plan**
      - Clarification flow: ambiguous question → clarification → refined answer
      - **Two-strikes: second ambiguity uses safe defaults with assumptions**
      - Lens application changes narrative but not data
      - Session persistence (messages saved to DB)
      - Audit logging occurs with planHash + sqlHash

   d) **packages/modules/semantic/src/__tests__/lenses.test.ts** — Tests:
      - Lens CRUD operations
      - Lens cannot override RBAC
      - Lens cannot unmask PII
      - Playbook conditions fire correctly
      - Built-in lenses are valid (pass Zod validation)
      - Default lens resolution (user → tenant → system)
      - **Glossary overrides affect display text only, not computation**

   e) **packages/modules/semantic/src/__tests__/security.test.ts** — Tests:
      - Read-only guard: SET LOCAL ROLE semantic_readonly is set before query
      - Read-only guard: regex blocks INSERT/UPDATE/DELETE SQL
      - **Dynamic whitelist built from registry, rejects unknown table**
      - Query budget enforcement (rate limiting)
      - Tenant isolation in queries
      - PII fields are masked for non-privileged users
      - **Contract of Truth: LLM hallucinated slug is stripped and warning added**

Follow OppsEra testing conventions: vi.hoisted mocks, chainable select chains, mock @oppsera/db and @oppsera/core.

OUTPUT: Complete test files + example walkthroughs with realistic data. Every test should be runnable with `pnpm test`.

Session 10 of 12 — Documentation + Sync Script + Final Wiring
CONTEXT: I'm completing the semantic layer module for OppsEra. Sessions 1-9 built everything. You have my CLAUDE.md and CONVENTIONS.md.

TASK: Final wiring, documentation, and operational readiness.

BUILD THESE FILES:

1) **packages/modules/semantic/src/sync/sync-registry.ts** (FINAL VERSION) — Complete sync script:
   - Reads all TypeScript registry definitions (core + golf)
   - Upserts into semantic_metrics (including asOfField, partitionBy, latestStrategy for "latest" metrics), semantic_dimensions, semantic_entities, semantic_join_paths (including cardinality, grainImpact), semantic_filters (including valueType)
   - Uses ON CONFLICT (tenant_id IS NULL, slug) DO UPDATE for system definitions
   - Seeds built-in lenses and lens packs
   - Updates semantic_readonly role grants if new tables were added
   - Idempotent — safe to run multiple times
   - Reports: X metrics synced, Y dimensions synced, Z lenses synced
   - Add to package.json scripts: "semantic:sync": "tsx src/sync/sync-registry.ts"

2) **packages/modules/semantic/src/setup/register-entitlements.ts** — Register semantic entitlements:
   - 'semantic' module key
   - Permissions: semantic.query, semantic.chat, semantic.export, semantic.admin, semantic.lenses.view, semantic.lenses.manage
   - Default role mappings:
     - Owner: all semantic.*
     - Manager: semantic.query, semantic.chat, semantic.export, semantic.lenses.view
     - Supervisor: semantic.query, semantic.chat, semantic.lenses.view
     - Cashier/Server/Staff: semantic.query (basic only)

3) **packages/modules/semantic/src/setup/register-events.ts** — Event type registrations:
   - semantic.query.executed.v1
   - semantic.chat.message.v1
   - semantic.lens.created.v1
   - semantic.lens.updated.v1
   - semantic.definition.synced.v1

4) **Update CLAUDE.md additions** — Generate text to append to CLAUDE.md:
   - Module entry: Semantic Layer | semantic | V1 | Done
   - File tree addition for packages/modules/semantic/
   - File tree addition for apps/admin/ (Super Admin Panel)
   - Architecture note: apps/admin/ is a SEPARATE Next.js app on its own subdomain (admin.oppsera.com). Not linked to apps/web/. Has its own platform admin auth. First feature: eval review.
   - Key patterns: semantic registry (compact dictionary), query plan → SQL compilation, lens engine, LLM provider interface, contract of truth
   - New gotchas (append to existing numbered list):
     - "Semantic queries ONLY target rm_* tables — never OLTP. Whitelist is built dynamically from registry, not hardcoded."
     - "LLM outputs plan + structured rationale (PlanRationale), NEVER raw SQL. Contract of Truth enforced in every prompt."
     - "Lenses NEVER change data — only narrative framing, tone, and priorities"
     - "Query budget: 100/hr/tenant, 10s timeout, 10K row max"
     - "Always include tenant_id — it's injected by compiler, never from user input"
     - "Queries execute via SET LOCAL ROLE semantic_readonly as defense-in-depth"
     - "Join paths have cardinality + grainImpact — compiler checks for double-counting risk and adds safetyFlags"
     - "'latest' aggregation (inventory_on_hand) requires asOfField + partitionBy + latestStrategy on the metric definition"
     - "Comparison semantics (wow/mom/yoy/prior_period) are standardized — see comparison-semantics.ts. LLM receives these rules in prompt."
     - "Two-strikes clarification: first ambiguity asks, second defaults with assumptions labeled"
     - "Observability: every query logs planHash + sqlHash + resultFingerprint for debugging"
     - "Every LLM interaction is captured in semantic_eval_turns — full plan, SQL, results, timing, user feedback, admin review"
     - "Quality score = 40% admin + 30% user rating + 30% auto-heuristics. Auto-flags: empty_result, timeout, low_confidence, hallucinated_slug"
     - "Golden examples are curated from high-quality interactions via Promote to Example flow. They feed into the LLM prompt builder."
   - New permissions list (include semantic.eval.view, semantic.eval.review, semantic.eval.manage)
   - Test count addition

5) **Update CONVENTIONS.md additions** — Generate text to append:
   - §51: Semantic Layer Conventions
     - Registry is code-first TypeScript, synced to DB via `pnpm semantic:sync`
     - Metrics define aggregationType, sourceTable, sourceColumn, dataset
     - "latest" metrics require asOfField, partitionBy, latestStrategy
     - Join paths require cardinality + grainImpact (safe/may_duplicate/requires_distinct)
     - Filters have valueType for type enforcement
     - Query plans are Zod-validated JSON, never raw SQL
     - LLM providers are swappable via LLM_PROVIDER env var
     - Lenses are post-query interpretation only
     - Compact semantic dictionary format (SemanticDictionary) used for LLM context
   - §52: LLM Integration Conventions
     - Contract of Truth block injected in every LLM prompt
     - LLM outputs { plan, rationale } — two separate objects
     - System compiles plan → SQL (LLM never sees or writes SQL)
     - Structured rationale (PlanRationale): intentReason, metricChoices, assumptions
     - Few-shot examples required in every prompt (5-8 minimum)
     - Clarification rules: multi-location + no filter, missing date range, ambiguous intent
     - Two-strikes rule: strike 1 = ask, strike 2 = default + label assumptions
     - Prompt order: role → contract → schema → dictionary → comparison rules → examples → output
   - §53: Security Conventions (Semantic)
     - Queries execute via SET LOCAL ROLE semantic_readonly (DB-enforced)
     - Dynamic whitelist built from registry (not hardcoded)
     - Regex defense-in-depth blocks DML statements
     - Query budget per-tenant and per-user
     - PII masking enforced regardless of lens config
   - §54: Chat UI Conventions
     - Split panel layout (chat left, results right)
     - Lens selector in header
     - Narrative rendered as markdown with metric chips
     - Playbook suggestions in amber callout boxes
     - Clarification suggestions as clickable buttons
     - Assumption chips as amber "Change" buttons
     - Rationale tab shows structured PlanRationale
   - §55: Observability (Semantic)
     - Every query logs: planHash, sqlHash, resultFingerprint, cacheStatus, safetyFlags
     - Admin endpoint: /semantic/admin/performance for top-20 slowest, cache hit rate
     - planHash is stable (normalized plan with sorted keys)
   - §56: Evaluation + Feedback Conventions
     - Every LLM turn is recorded in semantic_eval_turns with full capture (plan, SQL, results, timing)
     - User feedback: 1-5 stars + thumbs up/down + free text + tags (wrong_data, hallucination, etc.)
     - Admin review: 1-5 score + verdict (correct/partially_correct/incorrect/hallucination/needs_improvement) + corrected plan + action taken
     - Quality score: weighted composite (40% admin, 30% user, 30% auto-heuristics)
     - Auto-detected quality flags: empty_result, timeout, low_confidence, hallucinated_slug, high_null_rate
     - Golden examples: promoted from high-quality turns, used by prompt builder for few-shot learning
     - Problematic patterns: group by planHash to find recurring failures
     - FeedbackWidget embedded below every assistant message in chat UI (in apps/web/)
     - Admin review, quality dashboard, golden examples management are in apps/admin/ (super admin panel)
   - §57: Super Admin Panel Conventions
     - apps/admin/ is a SEPARATE Next.js app — its own package.json, layout, auth, deployment
     - Hosted at admin.oppsera.com (or NEXT_PUBLIC_ADMIN_URL env var)
     - Platform admin auth: separate from tenant Supabase Auth, uses platform_admins table + JWT session cookies
     - Cross-tenant visibility: admin can view eval data across ALL tenants via tenant selector
     - Shares packages/db/ and packages/modules/ via monorepo workspace
     - Does NOT share components, hooks, or pages with apps/web/
     - No customer-facing features in apps/admin/; no admin review features in apps/web/
     - Future features (tenant management, billing, system config) go in apps/admin/

6) **packages/modules/semantic/package.json** (FINAL) — Complete package.json with all scripts:
   - build, test, lint, type-check, semantic:sync, semantic:seed-lenses

7) **packages/modules/semantic/tsconfig.json** — TypeScript config extending base

8) **Final index.ts barrel exports** — Ensure all public APIs are exported:
   - SemanticRegistry, QueryEngine, LensEngine, ConversationManager
   - Types: MetricDefinition, DimensionDefinition, QueryPlan, LensConfig, PlanRationale, SemanticDictionary, etc.
   - Commands: createMetric, updateMetric, createLens, etc.
   - Queries: listMetrics, listDimensions, listLenses, suggestItems, etc.

9) **apps/web/src/app/(dashboard)/insights/layout.tsx** — Insights layout:
   - Page title
   - Breadcrumb
   - Entitlement guard (require 'semantic' entitlement)

10) **Update apps/web/src/app/(dashboard)/layout.tsx** — Add Insights to sidebar navigation:
    - Icon: Sparkles
    - Position: after Reports
    - Sub-items: Chat, Explore, Lenses, History
    - Entitlement-gated: only show if tenant has 'semantic' entitlement

OUTPUT: Complete files. The CLAUDE.md and CONVENTIONS.md additions should be formatted exactly like the existing content so they can be appended directly. Include every file path.

Summary: Session Dependency Chain
Phase 0 — Shared Backend + Super Admin Panel (build FIRST)
Session 0:   Eval DB + capture service (shared backend)    (no dependencies — build before anything else)
Session 0.5: Super Admin Panel scaffold + Eval Review UI   (depends on 0 — first feature of apps/admin/)

Phase 1 — Core Semantic Layer (integrate after each session)
Session 1:   Scaffold + Schema + Registry              (depends on 0 — capture service ready to receive data)
Session 2:   Query Engine                              (depends on 1)
  *** STOP: build, test, run a real query against your rm_ tables ***
Session 3:   LLM Integration                          (depends on 1-2)
  *** STOP: get one real LLM call working end-to-end, check eval in admin panel ***
Session 4:   API Routes + Security                    (depends on 1-3)

Phase 2 — Datasets + Lenses
Session 5:   Golf Analytics Dataset                   (depends on 1)
Session 6:   Custom Lenses                            (depends on 1-4)

Phase 3 — Customer Frontend + Polish
Session 7:   Chat UI + Frontend + FeedbackWidget       (depends on 0, 1-6 — FeedbackWidget built here, submits to Session 0 API)
Session 8:   Performance + Observability              (depends on 1-4)
Session 9:   E2E Examples + Tests                     (depends on all)
Session 10:  Final Wiring + Docs                      (depends on all)
Parallel-safe pairs: Sessions 5+8 can run concurrently. Session 0.5 can run in parallel with Sessions 1-6 (admin panel is independent of semantic layer backend).
Estimated output per session: ~800-2000 lines of production code. Session 0.5 (admin panel scaffold) may be larger (~2500 lines) since it creates a new app from scratch.
After all 12 sessions: Run pnpm semantic:sync, pnpm test, pnpm build to verify everything compiles and passes. Also verify apps/admin builds independently.
The feedback loop: From Session 1 onward, every LLM interaction is captured in eval_turns. After Session 0.5, you can review them in the super admin panel at admin.oppsera.com. After a few days of testing, you'll have real data on what works and what doesn't — use the "Promote to Example" flow in the admin panel to feed good interactions back into the prompt builder (Session 3). Meanwhile, users give feedback via the FeedbackWidget in the customer app (Session 7), which flows into the same eval_turns table and shows up in the admin panel.

Appendix: Architectural Decisions (from review feedback)
These decisions are baked into the sessions above. Documenting them here for reference:
1. Contract of Truth
Every LLM prompt includes a non-negotiable rules block: what the model is allowed to reason about, what is forbidden (inventing data, writing SQL, hallucinating slugs), and what to do when uncertain (clarify, don't guess).
2. Plan + Rationale Split
LLM outputs two objects: plan (executable, no prose) and rationale (structured explanation with intentReason, metricChoices, assumptions). This prevents the model from freestyling while still providing transparency.
3. Compact Semantic Dictionary
LLM receives a compact dictionary (slug, label, sourceTable, agg, format, desc) rather than full MetricDefinition objects. Scoped by tenant businessType and user permissions. Keeps token count low, accuracy high.
4. Join Cardinality + Grain Impact
Every join path declares cardinality (one_to_one/one_to_many/many_to_one) and grainImpact (safe/may_duplicate/requires_distinct). The compiler uses these to prevent double-counting and adds safetyFlags when risky joins are used.
5. "Latest" Aggregation Definition
Metrics like inventory_on_hand define asOfField (timestamp column), partitionBy (uniqueness columns), and latestStrategy (distinct_on or max_subquery). The compiler generates correct SQL for point-in-time queries.
6. Standardized Comparison Semantics
WoW/MoM/YoY/prior_period have exact rules documented in comparison-semantics.ts and shared with the LLM. No improvisation.
7. Two-Strikes Clarification Rule
Strike 1: ask with 3-6 clickable suggestions. Strike 2 (same session): default to safe assumptions (last 7 days, primary location) and label them as assumptions with "Change" chips in UI.
8. Read-Only DB Role (Defense-in-Depth)
Queries execute via SET LOCAL ROLE semantic_readonly which physically has only SELECT on rm_* + dimension tables. Even if SQL injection slips past the regex guard, the DB prevents writes.
9. Dynamic Table Whitelist
The allowed table list is built from registry entities + join graph at runtime, not hardcoded. Adding a new rm_ table to the registry automatically makes it available to the compiler.
10. Filter Value Type Enforcement
Filters declare a valueType (string/number/date/boolean/enum). The compiler validates that 'between' has a 2-element array, date filters have ISO strings, enum filters have values in the allowed set.
11. Observability Fingerprint
Every query logs planHash (normalized plan), sqlHash (compiled SQL), and resultFingerprint (rowCount, date range, null rate). Enables debugging "plan was correct but data looked wrong."
12. Prompt Structure Ordering
System prompt follows a strict ordering proven for higher accuracy: role → contract of truth → output schema → compact dictionary → comparison rules → few-shot examples → output instruction.
13. Evaluation-First Development
The feedback infrastructure (Session 0) is built BEFORE the semantic layer. Every LLM interaction is captured in semantic_eval_turns with full plan, SQL, results, and timing. User ratings (1-5 stars + tags) and admin reviews (verdict + corrected plan) feed into a quality score. Good interactions are promoted to "golden examples" that improve the LLM's few-shot prompts over time. This creates a flywheel: more usage → more feedback → better examples → better answers.
14. Quality Score Composite
Quality is a weighted composite: 40% admin score + 30% user rating + 30% auto-detected heuristics (empty results, timeouts, low confidence, hallucinated slugs). This means even before any human reviews, the system flags problematic interactions via heuristics. Admin reviews are the highest-signal input and get the most weight.
15. Super Admin Panel Separation
The admin review UI, quality dashboard, and golden example management live in a SEPARATE Next.js app (apps/admin/) on its own subdomain (admin.oppsera.com). This is NOT linked to the customer-facing app (apps/web/). Reasons for this separation:

Security: Admin has cross-tenant visibility — completely different authorization model from tenant-scoped RLS.
Auth independence: Platform admins use their own auth system (platform_admins table + JWT), not Supabase tenant auth.
Deployment isolation: Admin panel can be deployed, scaled, and access-controlled independently.
Clean boundaries: Customer app users never see admin functionality. No risk of leaking eval review routes.
Future-proof: The super admin panel will grow to include tenant management, billing admin, system config — none of which belong in the customer app.

The customer app (apps/web/) only contains the lightweight FeedbackWidget (thumbs up/down + stars + tags) for user feedback, which submits to a single API route (POST /api/v1/semantic/eval/turns/[id]/feedback/). Both apps share the same database and the same packages/modules/semantic/src/evaluation/ module code.