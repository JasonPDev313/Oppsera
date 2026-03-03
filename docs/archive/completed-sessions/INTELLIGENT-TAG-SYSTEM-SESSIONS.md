# Intelligent Tag Management System — Session Build Plan

> **Purpose**: This document is a Claude prompt. Feed it (along with `CONVENTIONS.md`) at the start of each session to build the world's most intelligent ERP customer tagging system across a series of focused sessions.

---

## System Vision

Tags today are passive labels. This plan transforms them into an **active intelligence layer** — a system that observes every business event, learns customer patterns, predicts behavior, triggers real workflows, and surfaces insights everywhere a human makes a decision (POS, profile, reports, AI chat).

**Design North Stars** (inspired by Salesforce Einstein, Klaviyo, Shopify Segments, Intercom, and Toast):

1. **Zero-config intelligence**: The system should auto-suggest tag templates, pre-fill conditions, and recommend actions the moment a user types a tag name like "VIP" or "At Risk". No blank-canvas problem.
2. **Predictive, not just reactive**: Tags should leverage computed scores (RFM, CLV, churn risk, visit frequency trends) — not just static thresholds on raw fields.
3. **Event-driven & real-time**: Tags re-evaluate the instant business events occur (order placed, payment received, visit recorded), not just on cron schedules.
4. **Tags that DO things**: When a tag is applied, it can set customer fields, log activity, add to segments, set service flags, fire notifications — configurable per-tag actions, not hardcoded behavior.
5. **Visible everywhere**: POS cart shows colored tag chips. Profile drawer shows tag evidence. AI chat can query by tags. Reports can filter/group by tags.
6. **Self-managing lifecycle**: Tags expire, conflict with each other, have priorities and cooldowns. The system cleans up after itself.
7. **Natural language creation**: Describe the customers you want to tag in plain English → conditions auto-generated via the semantic layer.

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                        SMART TAG SYSTEM                             │
├──────────────┬───────────────┬──────────────┬───────────────────────┤
│  A. Suggest  │  B. Actions   │  C. Events   │  D. Lifecycle        │
│  Engine      │  System       │  Consumer    │  Management          │
│  (frontend)  │  (backend)    │  (backend)   │  (backend)           │
├──────────────┴───────────────┴──────────────┴───────────────────────┤
│                     E. Cross-System Consumption                     │
│  POS chips · Profile drawer · Semantic/AI · Reporting · Dashboards │
├─────────────────────────────────────────────────────────────────────┤
│                     F. Predictive Intelligence                      │
│  RFM scores · CLV prediction · Churn risk · Visit trends · AOV     │
├─────────────────────────────────────────────────────────────────────┤
│                     G. Tag Analytics & Health                       │
│  Population trends · Overlap matrix · Effectiveness scoring         │
└─────────────────────────────────────────────────────────────────────┘
```

---

## What Makes This Best-in-Class

### vs. HubSpot
HubSpot doesn't even have native tags — they hack custom properties. We have first-class tags with computed conditions, event-driven evaluation, action triggers, conflict resolution, and expiry lifecycle.

### vs. Klaviyo
Klaviyo's predictive segments (CLV, churn risk, next order date) are powerful but email/SMS-only. We bring the same predictive intelligence into POS interactions, service flags, staff notifications, and AI-queryable reporting — the full ERP loop.

### vs. Shopify Ecosystem
Shopify merchants need 3-4 separate apps (SC Customer Tagging + Loyal RFM + Segments Analytics + Klaviyo) to approximate what we build as one integrated system. Our tags live inside the ERP, not bolted on.

### vs. Salesforce Einstein
Einstein's "Next Best Action" is powerful but requires enterprise licensing and data science expertise. We deliver tag-driven actions with zero-code configuration — every tag can trigger workflows out of the box.

### vs. Intercom
Intercom's conversation tagging is limited to keyword matching and manual rules. Our suggestion engine uses multi-signal fuzzy matching, and our event-driven consumer evaluates conditions against real transaction data, not just text content.

---

## Sub-System Specifications

### A. Smart Suggestion Engine (Frontend-Only)

**Inspiration**: Klaviyo's "Segments AI" where you describe who you want → conditions auto-generated. Shopify Segments' 50+ pre-built AI segments.

When a user types a tag name, fuzzy-match against a rich template library and suggest pre-built condition workflows. The user picks one or starts from scratch.

**Matching Algorithm (multi-signal scoring)**:
- Direct slug match (weight 1.0) — "vip" matches "vip-spender" template
- Token overlap (0.7-0.9) — "high value" matches "high-value-customer"
- Category keyword mapping (0.5-0.7) — "birthday" triggers celebration templates
- Metric heuristic detection (0.3-0.5) — "spend" in name → suggest monetary conditions
- Behavioral pattern matching (0.3-0.5) — "churn" → suggest recency/frequency conditions

**Template Library** (~40+ templates across categories):

| Category | Templates |
|----------|-----------|
| Value Tiers | VIP Spender, High-Value Customer, Whale, Rising Star, Budget-Conscious |
| Engagement | Loyal Regular, At-Risk Churn, Churned/Lapsed, Win-Back Candidate, New Customer |
| Frequency | High-Frequency, Weekly Regular, Monthly Visitor, One-Time Buyer |
| Lifecycle | Birthday This Month, Anniversary, New (30 days), Dormant (90+ days) |
| Spending | Big Tipper, Discount-Heavy, Full-Price Buyer, AOV Above Average |
| Behavioral | Night Owl, Weekend Warrior, Lunch Regular, Happy Hour Fan |
| Membership | Active Member, Expiring Member, Lapsed Member, Trial Period |
| Predictive | High Predicted CLV, Churn Risk High, Likely To Return Soon |

Each template includes:
- `conditions`: Pre-built rule conditions (metric thresholds, date ranges, patterns)
- `keywords`: For fuzzy matching
- `triggerEvents`: Which events should re-evaluate this tag
- `suggestedActions`: Recommended tag actions to pre-fill
- `category` + `icon` + `color`: For visual consistency
- `description`: Human-readable explanation of what this tag captures
- `evidence_template`: How to display "why this customer was tagged" in the profile

**New Files**:
- `apps/web/src/components/customers/tags/tag-suggestion-engine.ts` (~200 lines) — Pure function, no React. Multi-signal matching with weighted scoring.
- `apps/web/src/components/customers/tags/TagSuggestionCards.tsx` (~150 lines) — Renders up to 3 best-match suggestion cards with template name, condition summary, match reason badge, and "Use this" button. Always includes "Custom / Start from scratch" at bottom.

**Modified Files**:
- `CreateTagDialog.tsx` — When `tagType === 'smart'`, debounce name input 300ms, show `TagSuggestionCards` below name field. Selecting a suggestion pre-fills conditions + color + icon + description + actions.
- `SmartTagRuleBuilder.tsx` — On step 1 name change, show suggestion cards. Selecting pre-fills steps 2 (conditions) and 3 (schedule/options/actions).

**Template Data**: Extend existing seed templates in `packages/modules/customers/src/seeds/smart-tag-seeds.ts` with `keywords`, `triggerEvents`, `suggestedActions`, `evidenceTemplate` fields.

---

### B. Tag Actions System

**Inspiration**: Salesforce's "Next Best Action" + HubSpot's workflow triggers on tag application. When a tag is applied/removed/expired, execute configurable actions.

**Action Types**:

| Action Type | Config Shape | What It Does |
|-------------|-------------|--------------|
| `log_activity` | `{ activityType, message, metadata }` | Insert into `customer_activity_log` |
| `set_customer_field` | `{ field, value }` | Update whitelisted customer columns |
| `add_to_segment` | `{ segmentId }` | Insert into `customer_segment_memberships` |
| `remove_from_segment` | `{ segmentId }` | Remove from segment |
| `set_service_flag` | `{ flagType, severity, value, note }` | Insert/update `customer_service_flags` |
| `remove_service_flag` | `{ flagType }` | Deactivate service flag |
| `send_notification` | `{ channel, template, recipientRole }` | Fire-and-forget notification to staff |
| `adjust_wallet` | `{ walletType, amountCents, reason }` | Credit/debit loyalty or credit wallet |
| `set_preference` | `{ category, key, value }` | Set customer preference |
| `create_alert` | `{ alertType, severity, message }` | Create customer alert visible in profile |

**Migration**: `NNNN_tag_actions_lifecycle.sql`

```sql
-- 1. tag_actions table
CREATE TABLE IF NOT EXISTS tag_actions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  trigger TEXT NOT NULL,           -- 'on_apply' | 'on_remove' | 'on_expire'
  action_type TEXT NOT NULL,       -- see action types above
  config JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  execution_order INTEGER NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- + RLS, tenant index, tag_id index

-- 2. tag_action_executions (append-only audit log)
CREATE TABLE IF NOT EXISTS tag_action_executions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  tag_action_id TEXT NOT NULL REFERENCES tag_actions(id),
  customer_id TEXT NOT NULL,
  trigger TEXT NOT NULL,
  status TEXT NOT NULL,             -- 'success' | 'failed' | 'skipped'
  result_summary JSONB,             -- what was actually changed
  error_message TEXT,
  duration_ms INTEGER,
  executed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- + RLS, indexes on (tenant_id, customer_id), (tenant_id, tag_action_id)

-- 3. Lifecycle columns on existing tables
ALTER TABLE tags ADD COLUMN IF NOT EXISTS default_expiry_days INTEGER;
ALTER TABLE tags ADD COLUMN IF NOT EXISTS conflicts_with TEXT[] DEFAULT '{}';
ALTER TABLE tags ADD COLUMN IF NOT EXISTS priority INTEGER NOT NULL DEFAULT 100;
ALTER TABLE tags ADD COLUMN IF NOT EXISTS re_evaluation_interval_hours INTEGER;
ALTER TABLE tags ADD COLUMN IF NOT EXISTS tag_group TEXT;           -- for organizing: 'value_tier', 'engagement', 'lifecycle'
ALTER TABLE tags ADD COLUMN IF NOT EXISTS evidence_template TEXT;   -- how to explain "why tagged"

ALTER TABLE smart_tag_rules ADD COLUMN IF NOT EXISTS trigger_events TEXT[] DEFAULT '{}';
ALTER TABLE smart_tag_rules ADD COLUMN IF NOT EXISTS next_scheduled_run_at TIMESTAMPTZ;
ALTER TABLE smart_tag_rules ADD COLUMN IF NOT EXISTS cooldown_hours INTEGER DEFAULT 0;
ALTER TABLE smart_tag_rules ADD COLUMN IF NOT EXISTS last_evaluated_at TIMESTAMPTZ;

ALTER TABLE customer_tags ADD COLUMN IF NOT EXISTS evidence JSONB;  -- snapshot of why the tag was applied
ALTER TABLE customer_tags ADD COLUMN IF NOT EXISTS applied_by TEXT;  -- 'smart_rule:{ruleId}' | 'manual:{userId}' | 'bulk' | 'api'
ALTER TABLE customer_tags ADD COLUMN IF NOT EXISTS confidence REAL;  -- 0.0-1.0 for predictive tags
```

**New Backend Files**:

- `packages/modules/customers/src/services/tag-action-executor.ts` (~250 lines) — Core action execution engine. `executeTagActions(tx, tenantId, customerId, tagId, trigger)` queries active actions, executes in order, records audit trail. Never throws — catches errors per-action and continues.
- `packages/modules/customers/src/commands/manage-tag-actions.ts` (~150 lines) — `createTagAction`, `updateTagAction`, `deleteTagAction`, `reorderTagActions`
- `packages/modules/customers/src/queries/list-tag-actions.ts` (~60 lines)
- `packages/modules/customers/src/queries/get-tag-action-executions.ts` (~80 lines) — With filtering by customer, tag, status, date range

**API Routes**:
- `apps/web/src/app/api/v1/customers/tags/[tagId]/actions/route.ts` — GET + POST
- `apps/web/src/app/api/v1/customers/tags/[tagId]/actions/[actionId]/route.ts` — PATCH + DELETE
- `apps/web/src/app/api/v1/customers/tags/[tagId]/actions/reorder/route.ts` — POST

**Wiring** — Modify existing commands:
- `evaluate-smart-tags.ts`: In `applySmartTag()` add `await executeTagActions(tx, ..., 'on_apply')` after tag insert, passing evidence snapshot. In `removeSmartTag()` add `await executeTagActions(tx, ..., 'on_remove')`.
- `apply-tag-to-customer.ts`: Add `executeTagActions(tx, ..., 'on_apply')` inside `publishWithOutbox`
- `remove-tag-from-customer.ts`: Add `executeTagActions(tx, ..., 'on_remove')` inside `publishWithOutbox`

---

### C. Event-Driven Tag Evaluation

**Inspiration**: Klaviyo's real-time segment updates + Salesforce Einstein's event-triggered scoring.

Auto-evaluate smart tag rules when business events occur — not just on a cron schedule.

**New Files**:

- `packages/modules/customers/src/events/tag-evaluation-consumer.ts` (~180 lines)
  - `evaluateCustomerTagsOnEvent(tenantId, customerId, triggerEvent)`:
    1. Query active rules where `evaluationMode IN ('event_driven', 'hybrid') AND (trigger_events @> ARRAY[event] OR trigger_events = '{}')`
    2. Check cooldown: skip if `last_evaluated_at + cooldown_hours > now()`
    3. For each rule, call existing `evaluateCustomerForRule()` from smart-tag-evaluator
    4. Apply/remove tags + execute tag actions + save evidence
    5. Update `last_evaluated_at`, `next_scheduled_run_at`
    6. Record in `smart_tag_evaluations`
  - Wrapper consumers: `handleTagEvaluationOnOrderPlaced`, `handleTagEvaluationOnTenderRecorded`, `handleTagEvaluationOnOrderVoided`, `handleTagEvaluationOnVisitRecorded`, `handleTagEvaluationOnMembershipChanged`
  - All fire-and-forget: errors logged, never thrown

- `apps/web/src/app/api/v1/customers/smart-tag-rules/cron/route.ts` (~100 lines)
  - Called by Vercel Cron (every 15 min recommended)
  - Process scheduled rules where `next_scheduled_run_at <= now()`
  - Process expired tags (existing `expiresAt` column, never enforced until now)
  - Process tag actions with `on_expire` trigger
  - Batch processing with cursor-based pagination to avoid timeout

**Modified Files**:
- `apps/web/src/instrumentation.ts` — Add consumer subscriptions:
  ```
  bus.subscribe('order.placed.v1', customers.handleTagEvaluationOnOrderPlaced);
  bus.subscribe('tender.recorded.v1', customers.handleTagEvaluationOnTenderRecorded);
  bus.subscribe('order.voided.v1', customers.handleTagEvaluationOnOrderVoided);
  bus.subscribe('customer.visit.recorded.v1', customers.handleTagEvaluationOnVisitRecorded);
  bus.subscribe('customer.membership.created.v1', customers.handleTagEvaluationOnMembershipChanged);
  ```
- `packages/modules/customers/src/index.ts` — Export new consumers

---

### D. Tag Lifecycle Management

**Inspiration**: Shopify's dynamic tags that auto-update + Klaviyo's real-time segment membership. Tags aren't permanent — they have lifespans, conflicts, and priorities.

**New Files**:

- `packages/modules/customers/src/services/tag-expiration-service.ts` (~100 lines)
  - `processExpiredTags(tenantId)` — Finds `customer_tags` where `expires_at <= now() AND removed_at IS NULL`, soft-removes them, executes `on_expire` actions, records evidence of expiration.
  - Called from cron route (Section C)

- `packages/modules/customers/src/services/tag-conflict-resolver.ts` (~120 lines)
  - `resolveTagConflicts(tx, tenantId, customerId, tagId)`:
    1. Read `tags.conflicts_with[]` for the incoming tag
    2. Check if customer has any conflicting active tags
    3. Use `tags.priority` to determine winner (lower number = higher priority)
    4. If incoming tag wins: auto-remove conflicting tags (with `on_remove` actions)
    5. If existing tag wins: skip incoming tag, log as skipped
    6. Return resolution result with explanation
  - Handles mutual exclusion groups: e.g., "VIP" and "Churned" can't coexist; "Gold Tier", "Silver Tier", "Bronze Tier" are mutually exclusive within a group

- `packages/modules/customers/src/services/tag-evidence-builder.ts` (~80 lines)
  - `buildTagEvidence(rule, customerData)` — Snapshots the data points that caused a tag to be applied. Stored as JSONB on `customer_tags.evidence`.
  - Evidence format: `{ conditions: [{ metric: 'total_spend', operator: '>=', threshold: 1000, actual: 1247.50 }], evaluatedAt: ISO, ruleId: '...' }`
  - Powers the "Why was this customer tagged?" display in the profile drawer.

**Modified Files**:
- `apply-tag-to-customer.ts` — Call `resolveTagConflicts()` before inserting. For manual apply, throw `ConflictError` with conflicting tag names if conflicts found and incoming tag loses.
- `evaluate-smart-tags.ts` — Call `resolveTagConflicts()` in `applySmartTag()`. Log warning and skip if incoming tag loses (smart tags don't throw).

---

### E. Cross-System Consumption

**Inspiration**: Toast POS customer profiles visible at checkout + Klaviyo's cross-channel segment usage + Salesforce Einstein's embedded AI recommendations.

#### E1. POS — Show tags when customer attached to cart

- **New**: `apps/web/src/components/pos/CustomerTagChips.tsx` (~80 lines) — Colored chips with tag name, max 3 visible with "+N more" overflow pill. Click to expand full list. Service flag severity colors (green/yellow/red border).
- **New**: `apps/web/src/app/api/v1/customers/[id]/tags/active/route.ts` (~40 lines) — Lightweight endpoint returning only active tags with color, icon, priority, tagGroup.
- **Modify**: `apps/web/src/components/pos/Cart.tsx` — Render `CustomerTagChips` below customer name when customer is attached.
- **Modify**: `apps/web/src/lib/customer-cache.ts` — Include `activeTags` in cached customer shape for instant display.

POS display priority: Service flags (critical first) → Value tier tags → Engagement tags → Other. Show max 3, sorted by priority.

#### E2. Customer Profile Drawer — Rich tag display

- **Modify**: `ProfileTagsTab.tsx` — Enhance with:
  - Colored chips with source badge (manual/smart/predictive/api)
  - Expiry countdown for tags with `expires_at`
  - Click-to-expand **evidence panel** for smart tags showing which conditions matched and the actual values
  - Tag action history (last 5 executions) expandable per tag
  - Quick-add from template suggestions
  - Tag group headers for organization

#### E3. Semantic Layer — Tag-aware AI queries

- **Modify**: `packages/modules/semantic/src/schema/schema-catalog.ts` — Add `customer_tags` and `tags` tables to schema catalog with rich column hints:
  - `customer_tags.tag_id` → "The tag applied to the customer"
  - `tags.name` → "Human-readable tag name like 'VIP', 'At Risk', 'Birthday This Month'"
  - `tags.tag_group` → "Category: value_tier, engagement, lifecycle, behavioral, membership"
- Enables AI queries like:
  - "How much do VIP customers spend on average?"
  - "What % of customers are tagged At Risk?"
  - "Compare spending between VIP and Regular customers"
  - "Show me churned customers who spent over $500 last year"

#### E4. Reporting — Tag fields in custom report builder

- **Seed**: `reporting_field_catalog` with tag-related fields via migration:
  - `tag_names` (dimension) — comma-separated active tags
  - `tag_count` (measure) — number of active tags
  - `has_tag_{group}` (filter) — boolean per tag group
  - `tag_applied_date` (dimension) — when the tag was applied
- Enables report builder to filter/group by tags without custom SQL

#### E5. Tag Dashboard Widget

- **New**: `apps/web/src/components/customers/tags/TagDashboard.tsx` (~200 lines)
  - Tag population summary: how many customers have each tag
  - Trend sparklines: tag population over last 30 days
  - Recent activity feed: last 20 tag applications/removals with evidence
  - Tag health indicators: stale tags (no evaluation in 7+ days), empty tags (0 customers), overlapping tags (>80% overlap suggests redundancy)
  - Quick links to edit tag rules

---

### F. Predictive Intelligence Layer

**Inspiration**: Klaviyo's predictive analytics (CLV, churn risk, next order date, predicted gender, AOV prediction) + Shopify Segments' 50+ AI-generated segments + Salesforce Einstein's scoring models.

This layer computes customer scores that smart tag conditions can reference. It doesn't require ML infrastructure — it uses deterministic formulas on existing data that produce surprisingly powerful segmentation.

#### F1. RFM Scoring Engine

- **New**: `packages/modules/customers/src/services/rfm-scoring-engine.ts` (~180 lines)
  - `computeRfmScores(tenantId)` — Batch compute for all customers:
    - **Recency**: Days since last order → 1-5 score (quintile bucketing relative to tenant's customer base)
    - **Frequency**: Order count in trailing 12 months → 1-5 score
    - **Monetary**: Total spend in trailing 12 months → 1-5 score
    - **Composite**: Weighted combination → 1-125 score mapped to segments
  - `getRfmSegment(score)` → Maps to human-readable segments:
    - Champions (555, 554, 544) — Best customers
    - Loyal Customers (543, 534, 533, 443) — Frequent buyers
    - Potential Loyalists (553, 551, 552, 541) — Recent with good frequency
    - Recent Customers (512, 511, 521) — New but promising
    - Promising (525, 524, 523) — Mid-frequency, recent
    - Needs Attention (442, 441, 432, 421) — Above average but slipping
    - About To Sleep (331, 321, 312) — Below average, losing them
    - At Risk (255, 254, 245, 244) — Used to be good, now dropping
    - Can't Lose Them (155, 154, 144) — Were champions, haven't bought recently
    - Hibernating (222, 221, 211) — Low everything
    - Lost (111, 112, 121) — Lowest scores across the board
  - Stores results in `customer_scores` table (scoreType = 'rfm')
  - Run via cron (daily) or on-demand for a single customer after events

#### F2. Simple Predictive Metrics

- **New**: `packages/modules/customers/src/services/predictive-metrics.ts` (~150 lines)
  - `computePredictiveMetrics(tenantId, customerId)`:
    - **Predicted CLV**: `(AOV × predicted_orders_next_12mo) + historical_spend` — Uses exponential decay on order frequency to predict future orders.
    - **Churn Risk**: 0.0-1.0 score based on: days since last visit vs. customer's historical average interval, trend in visit frequency (accelerating/decelerating), trend in spend (growing/shrinking).
    - **Predicted Next Visit**: Based on customer's average inter-visit interval + day-of-week pattern. If customer visits every Tuesday, predict next Tuesday.
    - **Spend Velocity**: Trailing 3-month spend growth rate vs. trailing 12-month baseline. Positive = growing customer, negative = declining.
  - All formulas are deterministic (no ML models needed) and computed from existing `customer_metrics_daily` / `customer_metrics_lifetime` tables.
  - Results stored in `customer_scores` table.

#### F3. Predictive Conditions in Smart Tag Rules

- **Modify**: Smart tag rule condition types to include:
  - `rfm_segment IN ('Champions', 'Loyal Customers')` → VIP tag
  - `rfm_composite_score >= 100` → High-value tag
  - `churn_risk >= 0.7` → At-risk tag
  - `predicted_clv >= 5000` → Whale tag
  - `spend_velocity < -0.3` → Declining tag
  - `days_until_predicted_visit <= 3` → Likely visiting soon tag

These conditions reference the computed scores, making tag rules dramatically more powerful than raw field comparisons.

---

### G. Tag Analytics & Health Monitoring

**Inspiration**: Intercom's conversation tag analytics + Klaviyo's segment performance dashboards.

- **New**: `packages/modules/customers/src/queries/tag-analytics.ts` (~150 lines)
  - `getTagPopulationTrends(tenantId, tagIds, days)` — Daily population counts per tag
  - `getTagOverlapMatrix(tenantId)` — Which tags overlap (customers with both). Flags >80% overlap as potential redundancy
  - `getTagEffectiveness(tenantId, tagId)` — Correlates tag membership with business outcomes: average spend of tagged vs. untagged customers, visit frequency comparison, retention rate comparison
  - `getTagHealth(tenantId)` — Returns stale rules (no evaluation in N days), empty tags, rules with high skip rates, action failure rates

- **New**: `apps/web/src/app/api/v1/customers/tags/analytics/route.ts` — GET with query params for specific analytics
- **Integrate**: Into `TagDashboard.tsx` (Section E5)

---

## Implementation Sessions (Build Order)

### Session 1: Foundation — Migration + Schema + Lifecycle Services
**Depends on**: Nothing
**Deliverables**:
- Migration `NNNN_tag_actions_lifecycle.sql` with all new tables and columns
- Drizzle schema updates in `packages/db/src/schema/tags.ts` — `tagActions`, `tagActionExecutions` table defs + new columns on `tags`, `smartTagRules`, `customerTags`
- Tag conflict resolver service
- Tag expiration service
- Tag evidence builder service
- Unit tests for all three services (~25 tests)

### Session 2: Tag Action Executor + CRUD
**Depends on**: Session 1
**Deliverables**:
- Tag action executor service (core engine with all 10 action type handlers)
- CRUD commands: `createTagAction`, `updateTagAction`, `deleteTagAction`, `reorderTagActions`
- Query: `listTagActions`, `getTagActionExecutions`
- API routes: tag action CRUD (3 route files)
- Wire executor into existing `evaluate-smart-tags.ts`, `apply-tag-to-customer.ts`, `remove-tag-from-customer.ts`
- Unit tests (~35 tests): Each action type, execution order, error isolation, audit trail, whitelist enforcement

### Session 3: Event-Driven Consumer + Cron
**Depends on**: Sessions 1, 2
**Deliverables**:
- Tag evaluation consumer with all event handlers
- Cron route for scheduled evaluation + expiration processing
- Cooldown enforcement
- Wire consumers into `instrumentation.ts`
- Export from module index
- Unit tests (~30 tests): Event routing, cooldown, fire-and-forget safety, batch processing, cron pagination

### Session 4: Predictive Intelligence — RFM + Metrics
**Depends on**: Session 1
**Deliverables**:
- RFM scoring engine with quintile bucketing and segment mapping
- Predictive metrics service (CLV, churn risk, next visit, spend velocity)
- Cron route or integration into existing daily metrics job
- New score types seeded into scoring system
- Unit tests (~25 tests): Score computation edge cases, quintile distribution, segment mapping, metric formulas

### Session 5: Smart Tag Conditions for Predictive Data
**Depends on**: Sessions 2, 4
**Deliverables**:
- Extend smart tag rule condition evaluator to support `rfm_segment`, `rfm_score`, `churn_risk`, `predicted_clv`, `spend_velocity`, `days_until_predicted_visit`
- Predefined smart tag templates that use predictive conditions (VIP, At Risk, Champions, Declining, etc.)
- Seed templates with predictive conditions, keywords, trigger events, suggested actions
- Unit tests (~20 tests): Predictive condition evaluation, template matching

### Session 6: Suggestion Engine (Frontend)
**Depends on**: Session 5 (for template data)
**Deliverables**:
- `tag-suggestion-engine.ts` — Multi-signal fuzzy matching, weighted scoring
- `TagSuggestionCards.tsx` — Card UI with match score, reason badge, condition preview
- Integrate into `CreateTagDialog.tsx` and `SmartTagRuleBuilder.tsx`
- Pre-fill conditions + color + icon + description + actions from templates
- Unit tests (~30 tests): Fuzzy matching, keyword mapping, score ranking, edge cases, partial matches

### Session 7: Tag Action Editor UI
**Depends on**: Session 2 (API), Session 6 (suggestion engine for pre-filling)
**Deliverables**:
- `TagActionEditor.tsx` (~250 lines) — Panel in SmartTagRuleBuilder step 3 and tag detail view. Lists actions, add/edit/delete with drag-to-reorder.
- `ActionConfigForm.tsx` (~200 lines) — Dynamic config form per action type: field picker, segment picker, flag key+value, notification channel+template, wallet type+amount, alert severity+message
- `use-tag-actions.ts` hook — `useTagActions(tagId)` with CRUD mutations
- Execution history viewer per tag

### Session 8: Cross-System Consumption — POS + Profile + Semantic + Reporting
**Depends on**: Session 1 (schema)
**Deliverables**:
- `CustomerTagChips.tsx` for POS cart
- POS active tags endpoint
- Profile drawer tag enhancements (evidence panel, expiry countdown, action history)
- Semantic layer schema catalog updates for tag-aware AI queries
- Reporting field catalog seed for tag dimensions/filters
- Customer cache updates for instant POS tag display

### Session 9: Tag Analytics Dashboard
**Depends on**: Sessions 1-3 (enough data to analyze)
**Deliverables**:
- Tag analytics query service (population trends, overlap matrix, effectiveness, health)
- Analytics API route
- `TagDashboard.tsx` widget with sparklines, health indicators, activity feed
- Integration into customers module dashboard or dedicated tags management page

### Session 10: Tests + Polish + Documentation
**Depends on**: All sessions
**Deliverables**:
- End-to-end integration tests
- API contract tests for all new routes
- Build check: `pnpm type-check && pnpm lint && pnpm test`
- Update `CONVENTIONS.md` with tag system section
- Update `CLAUDE.md` with completed status

---

## Verification Checklist

### Automated Tests (~200+ tests)
- Suggestion engine: fuzzy matching, keyword mapping, score ranking, edge cases (~30)
- Tag action executor: each action type, execution order, error isolation, audit trail (~35)
- Tag lifecycle: expiration, conflict resolution, priority logic, evidence building (~25)
- Event-driven consumer: event routing, cooldown, fire-and-forget safety, batch processing (~30)
- Predictive intelligence: RFM scoring, quintile bucketing, CLV computation, churn risk (~25)
- Predictive conditions: smart tag rules with score-based conditions (~20)
- API routes: tag action CRUD contract tests (~15)
- Analytics: population queries, overlap detection, effectiveness scoring (~20)

### Manual Testing Scenarios
1. Create a tag named "VIP" → verify 3+ suggestions appear → select one → verify conditions, color, icon, description, AND suggested actions all pre-filled
2. Add a `log_activity` + `set_service_flag` action to a tag → manually apply tag → verify activity log entry created AND service flag set
3. Create event-driven rule with `trigger_events: ['order.placed.v1']` → place an order for a tagged customer → verify tag auto-applied within seconds
4. Set `conflicts_with: ['churned']` and `priority: 10` on "VIP" tag → apply both to a customer → verify VIP wins and Churned is removed (with `on_remove` actions fired)
5. Set `default_expiry_days: 30` on a tag → apply to customer → verify `expires_at` is set → advance time → run cron → verify tag removed and `on_expire` actions fired
6. Attach customer with tags to POS order → verify colored chips show in cart with correct priority ordering
7. Click a smart tag in profile drawer → verify evidence panel shows conditions with actual vs. threshold values
8. Ask AI "How much do VIP customers spend?" → verify SQL generated against `customer_tags` join
9. Run RFM scoring → verify customers are scored and segmented → create "Champions" smart tag with `rfm_segment = 'Champions'` condition → verify correct customers tagged
10. Open Tag Dashboard → verify population sparklines, overlap warnings, health indicators all render

### Build Verification
```bash
pnpm type-check && pnpm lint && pnpm test
```

---

## File Summary

| Category | New Files | Modified Files |
|----------|-----------|----------------|
| Migration + Schema | 1 | 1 (tags.ts) |
| Lifecycle Services | 3 | 2 |
| Tag Actions Backend | 5 | 3 |
| Event-Driven Consumer | 2 | 2 |
| Predictive Intelligence | 2 | 1 |
| Suggestion Engine (Frontend) | 2 | 2 |
| Tag Action Editor UI | 3 | 1 |
| Cross-System Consumption | 3 | 5 |
| Tag Analytics | 2 | 1 |
| **Total** | **~23 new** | **~18 modified** |

---

## Session Instructions for Claude

At the start of each session:

1. Feed `CONVENTIONS.md` for codebase patterns
2. Feed this document for the full plan
3. State which session number you're building
4. Claude should:
   - Review the session's deliverables
   - Check dependencies are met (ask if unsure)
   - Build files in the order listed
   - Follow all conventions (Drizzle ORM, Zod validation, `withMiddleware`, `publishWithOutbox`, event naming, error classes, etc.)
   - Write tests alongside implementation
   - After each file, verify it type-checks against the patterns
   - At session end, update the todo list in `CLAUDE.md`

### Key Convention Reminders for This Feature
- IDs: ULID via `$defaultFn(generateUlid)`
- Multi-tenancy: Every query filters by `tenant_id`, RLS on all tables
- Commands: `publishWithOutbox(ctx, async (tx) => { ... })` pattern
- Events: `{domain}.{entity}.{action}.v{N}` naming
- Consumers: Fire-and-forget, idempotent via `processed_events`, never throw
- API routes: `withMiddleware` + Zod validation + `{ permission, entitlement }` options
- Schema: snake_case in SQL, camelCase in Drizzle/TypeScript
- Tests: Vitest, singleton mock pattern with `setXxx(mockInstance)`
