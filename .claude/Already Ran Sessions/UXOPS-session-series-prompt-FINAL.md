# OPPSERA — PHASE 2+3: WORLD-CLASS POS + ACCOUNTING OPS (NEW SESSION SERIES)

You are a Staff Product Architect + Senior Full-Stack Engineer designing production-grade POS + accounting operations for a multi-tenant SaaS ERP.

We already have an approved backend remediation plan for accounting integrity (sessions 37–48).  
**DO NOT rewrite or renumber sessions 37–48.** Assume that backend work exists or will exist.

Now we need a **NEW series of sessions** (UXOPS-01 through UXOPS-16) focused on:

1. Missing UX/UI + admin settings + operational tooling needed to run the system in production  
2. Missing operational accounting models needed to match market best practices (Toast, Square, Lightspeed, Aloha-class systems)

---

## CRITICAL: READ BEFORE DESIGNING — WHAT ALREADY EXISTS

You must design around and extend these existing systems. Do not duplicate or contradict them.

### Retail POS (exists)

- `usePOS(config)` — order lifecycle state machine (add/remove items, place, void, hold/recall)
- `useShift(locationId, terminalId)` — shift open/close, paid-in/paid-out, **drawer stored in localStorage (V1 only — no server persistence yet)**
- `useCatalogForPOS` — full catalog + 4-layer hierarchy + search + barcode + favorites
- TenderDialog — payment flow with preemptive `placeOrder()`, split tender, `tender.recorded.v1` event
- Dual-mode POS (Retail + F&B mounted simultaneously, toggled via CSS)
- `order_lines` already have `sub_department_id` and `tax_group_id` (migration 0084)
- `tender.recorded.v1` event includes enriched `lines[]` with `subDepartmentId`, `taxGroupId`, `taxAmountCents`, `costCents`, `packageComponents`

### F&B POS (exists — 103 commands, 63 queries, 1,011 tests)

- **Close Batch already built**: `fnb_close_batches`, `fnb_server_checkouts`, `fnb_cash_counts` tables
- `buildBatchJournalLines` helper constructs double-entry GL lines from Z-report data
- Close batch flow: `startCloseBatch → lockBatch → serverCheckout (per server) → reconcileBatch → postBatch (GL)`
- Z-report, deposit slip, server checkout components already exist in `components/fnb/close/`
- F&B tip pools, auto-gratuity rules, tip distribution already exist (`fnb_tips`, `fnb_tip_pools`, `fnb_auto_gratuity_rules`)
- F&B standalone pages: `/kds`, `/expo`, `/host`, `/fnb-manager`, `/close-batch`
- F&B permissions: 28 permissions across 10 categories, role defaults for 6 system roles
- F&B uses Zustand internal screen routing (floor|tab|payment|split), NOT URL routes
- All F&B UI uses `var(--fnb-*)` CSS custom property design tokens

### Accounting Module (exists)

- Full GL engine: `postJournalEntry`, `voidJournalEntry`, `AccountingPostingApi.postEntry()`
- COA with 4 business-type templates, `bootstrapTenantAccounting`
- Financial statements: P&L, Balance Sheet, Sales Tax Liability, Cash Flow, Period Comparison
- GL mapping: `sub_department_gl_defaults` table, `resolveSubDepartmentAccounts()`, `getMappingCoverage()`
- `gl_unmapped_events` table for skipped postings (POS adapter never blocks tenders)
- Close checklist (computed live): open drafts, unmapped events, trial balance, AP/AR subledger reconciliation
- Accounting settings: `accounting_settings` table with default account IDs
- `gl_journal_lines` dimensions (from Session 40): `profitCenterId`, `subDepartmentId`, `terminalId`, `channel`
- Idempotency: unique partial index on `(tenantId, sourceModule, sourceReferenceId)`
- Rounding: auto-appended rounding line within tolerance, error beyond tolerance
- `sourceModule` enum: `manual`, `pos`, `pos_legacy`, `ap`, `ar`, `membership`, `payroll`

### AP/AR (exists)

- AP: bills, payments, vendor credits, aging, GL posting (Dr Expense, Cr AP Control)
- AR: invoices, receipts, aging, GL posting (Dr AR Control, Cr Revenue)
- Both use subledger reconciliation against GL control accounts
- `bank_accounts` table with `glAccountId` — already used by AP payments and AR receipts
- AR `sourceType` includes `pos_house_account` (bridged from POS house account charges)

### Session 44 (planned — F&B GL Wiring)

- `fnb_gl_account_mappings` table with `(tenant_id, location_id, entity_type, entity_id)` unique key
- Entity types: `revenue`, `tax`, `tips`, `discount`, `comp`, `cash_over_short`
- `fnb-posting-adapter.ts` consumes `fnb.gl.posting_created.v1` with `channel = 'fnb'`

### Session 43 (planned — Line-Item Refunds)

- `createReturn` command → return order with negative-qty lines linked via `returnOrderId`
- `return-posting-adapter.ts` uses `returnsAccountId` by sub-department
- `recordRefund` command for refund tenders

### Platform Patterns You Must Follow

| Pattern | Requirement |
|---------|-------------|
| Multi-tenancy | Every table: `tenant_id` + RLS policies. Use `withTenant(tenantId, tx)` |
| IDs | ULID via `generateUlid()` |
| Validation | Zod schemas for all inputs |
| Events | `publishWithOutbox(ctx, async (tx) => { ... })` pattern |
| Event wiring | Consumer subscriptions in `apps/web/src/instrumentation.ts` |
| Frontend hooks | Custom `useFetch<T>` / `useMutation<TInput, TResult>` pattern with `apiFetch` |
| Query strings | `buildQueryString(filters)` from `@/lib/query-string` |
| Modals/dialogs | Portal-based, z-50, fixed positioning |
| Manager PIN | F&B already has `ManagerPinModal` + `use-fnb-manager.ts` — reuse or generalize |
| Money | Orders/Payments = INTEGER cents; GL/AP/AR = NUMERIC(12,2) dollars |
| Migrations | `packages/db/migrations/NNNN_description.sql` (next available: 0108+) |
| Tests | Vitest, in `__tests__/` dirs, both unit and integration |
| Permissions | Core RBAC via `requirePermission` middleware + F&B-specific `pos_fnb.*` |
| Audit | `auditLog(ctx, action, entityType, entityId)` after mutations |

---

## NON-NEGOTIABLE: UI/UX SHIPS WITH EACH SESSION

For every new session you propose, you must deliver BOTH:  
A) Any needed schema/events/backend glue (only where required for ops)  
B) UX/UI + settings surfaces required to operate it

Every session MUST include:

- **Screens to add/modify** (with file paths under `apps/web/src/`)
- **Component architecture** (React component tree + props + state ownership + which hooks power it)
- **Admin settings/forms** (for all new config, wired to `accounting_settings` or new settings tables)
- **Validation UX** (warnings, missing mapping banners, empty states, inline error handling)
- **Permissions + manager override** (which permissions gate each action, PIN challenge flows where needed)
- **Acceptance checklist** (manual QA steps an engineer follows)
- **Tests** (unit + integration + key UI interaction tests)

**Definition of Done requires UX/UI. Do not defer UI to a later session.**

---

## REQUIRED OPERATIONAL BEST PRACTICES TO INCORPORATE

### 1) End-of-Day Close Model (Retail POS)

The F&B close batch flow already exists (`fnb_close_batches`, Z-report, server checkouts, cash counts). Now we need the **Retail POS equivalent**.

`useShift` currently persists drawer data in localStorage only. This must be promoted to server-side.

Define and implement:
- **Cash drawer sessions** (open/close per terminal or drawer — server-persisted)
- **Paid-in / paid-out** (server-persisted, not just localStorage)
- **Cash drops** (mid-shift safe drops)
- **Expected vs declared cash** (system-computed expected, operator-declared actual)
- **Cash over/short** (variance tracking + GL posting to Cash Over/Short account)
- **Business date concept** — explicit `businessDate` on close batches (may differ from calendar date for late-night shifts)
- **Deposits** (aggregated per business date / location)
- **Z-report style close report** (summary + drilldown by tender type, tax, department)
- **Posting timing strategy**: real-time per tender (current POS adapter behavior) vs at-close batch posting. Recommend which is primary and whether both are supported.

Required data objects:

| Object | Purpose |
|--------|---------|
| `pos_drawer_sessions` | Open/close per terminal, declared counts, expected amounts, variance |
| `pos_close_batches` | Per business date / location close record, status lifecycle |
| `pos_close_batch_tenders` | Aggregated totals by tender type within a close batch |
| `pos_close_batch_gl_journal_entry_id` | Link to GL journal entry posted at close |
| `pos_paid_in_out` | Cash movements during shift (reason codes, amounts, GL posting) |
| `pos_cash_drops` | Mid-shift safe drops (reduce drawer, increase safe) |

**Relationship to F&B close batch**: Define how these two close processes coexist at a hybrid location (retail + F&B operating on the same business date). Can they share a close batch? Must they be separate?

### 2) Card Settlement + Clearing Accounts

Current reality: POS posts `Dr Undeposited Funds, Cr Revenue/Tax` at tender time. But card settlements arrive 1–3 days later with processor fees deducted.

Separate these three realities:
- **Authorization/capture** (POS moment — already happening via `tender.recorded.v1`)
- **Settlement/payout** (bank reality — processor deposits net amount)
- **Processor fees** (expense reality — deducted from settlement)

Introduce:
- `payment_settlements` or `payment_payouts` table (Stripe payout-style: settlement ID, gross, fees, net, deposit date, bank account)
- Settlement events: `payment.settlement.received.v1`

Posting rules:

| Event | Debit | Credit |
|-------|-------|--------|
| Tender captured | Undeposited Funds (Card Clearing) | Revenue + Tax + Tips Payable |
| Settlement received | Bank + Processing Fees (expense) | Undeposited Funds |

Must support: partial payouts, chargeback netting, multi-day settlement timing, fee reconciliation.

**Reference**: `bank_accounts` table already exists (used by AP/AR). Card clearing accounts should use the same pattern.

### 3) Partial Voids / Comps / Partial Refunds

Cover real restaurant/retail realities:
- **Void a line after send** (kitchen already got it — waste tracking needed)
- **Comp a line or comp a check** (separate from discount — different GL treatment: comps = expense, discounts = contra-revenue)
- **Refund partial payment** (one of two split tenders)

Session 43 already defines `createReturn` + `return-posting-adapter.ts`. Build the UX on top of it.

**Codify one coherent strategy** (and document it in the session):
- All refunds are return orders (even $0 balance adjustments) — this is the Session 43 approach. Confirm and extend.
- Comps vs discounts: separate GL paths. Comps → Comp Expense account. Discounts → Contra-Revenue (discount) account.
- Void vs comp: void = never happened (reversal). Comp = it happened but we're eating the cost (expense).

### 4) Tip Payout Workflow

F&B already has: `fnb_tips`, `fnb_tip_pools`, `fnb_auto_gratuity_rules`, tip distribution.  
Tips go to Tips Payable (Session 38 adds `defaultTipsPayableAccountId`).

Now define how tips are **cleared** from Tips Payable:

| Payout method | Posting | When |
|---------------|---------|------|
| Cash paid out end of shift | Dr Tips Payable, Cr Cash | At server checkout / EOD |
| Added to paycheck | Dr Tips Payable, Cr Payroll Clearing | At payroll run |
| Tip pool distribution | Dr Tips Payable (pooled), Cr Tips Payable (per employee) then payout | At EOD |

Required:
- `tip_payouts` (or `employee_payouts`) table — tracks individual payout records with GL posting link
- Payout approval workflow (manager override for cash tip-outs)
- Tip report: tips earned vs tips paid vs tips still payable, by employee, by date

**Do not duplicate F&B tip infrastructure.** Generalize it if needed, or build a shared tip payout layer that both POS modes use.

### 5) Tax Breakdown + Jurisdiction/Rate Dimensions

Current state: orders store `taxAmountCents` per line, and `taxGroupId`. GL posting aggregates tax to Sales Tax Payable.

What's missing for reporting/remittance readiness:
- Tax by jurisdiction (state, county, city, district)
- Tax by rate (8.25%, 6%, etc.)
- Tax by authority (who you remit to)
- Exempt handling (tax-exempt customers, exempt items)
- Rounding policy (line-level vs order-level rounding)

At minimum:
- Tax lines on `tender.recorded.v1` must carry `taxRateId` and/or `taxAuthorityId` dimensions
- OR: a `tax_breakdown` table exists per order for reporting

**Also needed**: Tax reporting view that supports filing (total collected by jurisdiction/rate/authority for a date range, grouped for remittance).

### 6) Idempotency + Ordering Guarantees for Event Consumers

Current state: `sourceReferenceId` unique index prevents double-posting. Good start.

What's missing for production safety:
- **Composite idempotency key**: `sourceModule + sourceReferenceId + sequence/version` (handle void-before-posting: what if the void event arrives before the original tender posting?)
- **Exactly-once effect in DB** even with at-least-once delivery (the posting engine returns existing entry on duplicate — confirm this handles all edge cases)
- **Consumer ordering**: if `tender.recorded.v1` and `order.voided.v1` arrive out of order, what happens?
- **Dead letter / retry strategy**: failed postings go to `gl_unmapped_events` — but what about transient failures (DB timeout)?

Specify: constraints, handling strategy, retry behavior, and admin visibility (a "failed events" view in the accounting dashboard).

### 7) Returns Account Strategy (Contra-Revenue)

Session 43 uses `returnsAccountId` by sub-department. Codify:
- `returnsAccountId` MUST be a contra-revenue account (account type validation)
- Mapping UI must enforce: only accounts with `classification = 'revenue'` and `isContraAccount = true` (or equivalent)
- If `isContraAccount` doesn't exist on `gl_accounts`, add it
- Default returns account in `accounting_settings`

### 8) Inventory + COGS Coupling Policy (Retail vs F&B)

Current state: POS adapter supports `enableCogsPosting` (Dr COGS, Cr Inventory Asset).

But F&B typically does NOT post per-sale COGS (they use periodic inventory counts / recipe-based depletion).

Add:
- `cogsPostingMode` setting per tenant or per module: `perpetual` (retail default) | `periodic` (F&B default) | `disabled`
- When `periodic`: no COGS journal at tender time, but support end-of-period COGS calculation (beginning inventory + purchases − ending inventory = COGS)
- Ensure P&L and COGS reports remain trustworthy under each mode
- Admin UI toggle + explanation of each mode

### 9) F&B Batch Category Keys: Canonical Enum + Versioning

`buildBatchJournalLines` currently uses category strings. Session 44 defines `entity_type` values (`revenue`, `tax`, `tips`, `discount`, `comp`, `cash_over_short`).

Formalize:
- **Canonical enum** for all F&B GL category keys (exhaustive, versioned)
- **Versioned event payload**: `fnb.gl.posting_created.v2` with explicit schema
- **Mapping UI**: shows all incoming category keys, which have GL account mappings, and which are unmapped (coverage dashboard similar to POS `getMappingCoverage()`)
- **Forward compatibility**: new category keys added in future versions should surface as "unmapped" in the UI without breaking existing mappings

---

## OUTPUT FORMAT (STRICT)

Propose a NEW session series with **10–16 sessions** total.

Use this exact format for each:

```
### Session UXOPS-NN: <Title>

**Priority**: P0/P1/P2...  
**Goal**: <one sentence>  
**Depends on**: <other UXOPS sessions or Sessions 37-48>  

**Scope**:

- **Backend/data objects** (only if needed):
  - Tables (with column sketches)
  - Events emitted/consumed
  - Commands/queries added

- **Screens to add/modify**:
  - File paths under `apps/web/src/`
  - Which existing pages/components are modified vs new

- **Component architecture**:
  - Component tree (parent → children)
  - Key props and state ownership
  - Which hooks power each component
  - Zustand store additions (if any)

- **Settings/forms**:
  - New settings fields (on `accounting_settings` or new table)
  - Admin forms to configure them
  - Default values for new tenants

- **Validation UX**:
  - Warning banners (e.g., "3 sub-departments have no returns account mapped")
  - Empty states (e.g., "No drawer sessions found for today")
  - Inline errors (e.g., "Declared cash cannot be negative")
  - Fix-links (e.g., "Configure default returns account →")

- **Permissions + manager override**:
  - Which permissions gate each action (use existing RBAC keys or define new ones)
  - PIN challenge flows (reference existing ManagerPinModal pattern)

- **Reports/drilldowns**:
  - What data is surfaced
  - Filters available
  - Export format (CSV at minimum)

- **Acceptance checklist** (manual QA):
  - Step-by-step verification an engineer performs
  - Include happy path + edge cases

- **Tests**:
  - Unit tests (count estimate)
  - Integration tests (count estimate)
  - Key UI interaction tests
```

---

## REQUIRED SCREEN MAP

Your session series must produce or modify these screen areas at minimum:

### 1) POS Screens

| Screen | Notes |
|--------|-------|
| Payment / split tender UI | Extend existing TenderDialog — add comp, void-line, refund flows |
| Comp / void / refund UI | Inline in order view + confirmation modals |
| Manager override / PIN modal | Generalize from F&B `ManagerPinModal` for shared use |
| Tender audit drawer | Manager-only side panel showing all tenders for current order |
| End-of-day close workflow | Open drawer → count cash → review expected vs actual → close → Z-report |
| Drawer session management | List of open/closed drawer sessions per terminal |

### 2) Accounting Screens

| Screen | Notes |
|--------|-------|
| Settings (toggles + default accounts) | Extend existing accounting settings page |
| Mapping editors (dept/subdept + F&B) | Extend existing mapping editor — add returns, comp, discount account columns |
| Journal entry viewer | Add drilldown to source document + reversal lineage chain |
| Close checklist dashboard | Extend existing close checklist — add POS close batch status, settlement status |
| Settlement / payouts view | New: clearing account → bank reconciliation |
| Failed events / dead letter view | New: show `gl_unmapped_events` + transient failures with retry actions |

### 3) Operations Screens

| Screen | Notes |
|--------|-------|
| Drawer sessions list | Per location, per date, open/closed status, variance summary |
| Close batch list | Per location, per business date, with status badges |
| Z-report (retail) | Mirror F&B Z-report pattern for retail POS |
| Tip payouts | Pending tips, payout history, per-employee breakdown |
| Tax breakdown report | By jurisdiction, rate, authority — for remittance filing |
| Cash management dashboard | Cash in drawers, drops, deposits, over/short trending |

---

## MARKET BEST PRACTICE BAR

Your recommendations must reflect modern POS/accounting operational standards comparable to:
- **Toast** (F&B close + tip management + reporting)
- **Square** (settlement tracking + reconciliation)
- **Lightspeed** (multi-location retail + inventory COGS)
- **Aloha/NCR** (enterprise manager controls + audit trails)

Specific UX standards:
- **Minimal taps** (touch-first, large targets for POS screens)
- **High visibility + auditability** (every action logged, every override tracked)
- **Fail-safe behavior** under retries (idempotent everything)
- **Reconciliation friendliness** (every clearing account has a "what's still in it?" view)
- **Scalable multi-location support** (location picker, cross-location reports, per-location settings)
- **Clear user roles** (cashier vs manager vs owner see different things)
- **Offline resilience** (what happens if the network drops during close? queue and retry)

---

## DEPENDENCY AWARENESS

When defining dependencies between UXOPS sessions, also note dependencies on Sessions 37–48:

| Session 37–48 | What it provides |
|---------------|-----------------|
| 37 | Proper POS GL posting (stops dual posting, proportional allocation) |
| 38 | Discount, tip, service charge, fee GL categories |
| 39 | Void GL reversal |
| 40 | GL line dimensions (profitCenterId, subDepartmentId, terminalId, channel) |
| 41 | Close checklist + legacy deprecation |
| 42 | COA template updates (Tips Payable, Service Charge Revenue accounts) |
| 43 | Line-item refunds + return posting adapter |
| 44 | F&B GL wiring + `fnb_gl_account_mappings` |
| 45 | Voucher deferred revenue |
| 46 | Memberships GL + AR unification |
| 47 | Chargeback support |
| 48 | Integration tests + posting matrix |

UXOPS sessions may run in parallel with Sessions 37–48 where dependencies allow.

---

## ADDITIONAL CONSIDERATIONS

### Business Date

Define a `businessDate` concept explicitly:
- A business date may span midnight (e.g., restaurant open until 2am → still "yesterday's" business date)
- Business date drives: close batches, Z-reports, tax reporting, deposit records
- Must be configurable per location (business day start time setting)

### Multi-Location

- Every operational screen must have a location picker (or respect the global location context from the dashboard layout)
- Cross-location summary views for owners/operators (e.g., "all locations close status for today")
- Settings can be per-location or per-tenant (define which)

### Hybrid Locations (Retail + F&B)

- A single location may run both retail POS and F&B POS
- Their close batches, drawer sessions, and deposits must be coherent
- Define: are these separate close batches that contribute to one deposit? Or one unified close?

---

## START NOW

Produce the complete UXOPS session plan (10–16 sessions) with:
1. Recommended execution order
2. Dependency graph (both internal UXOPS deps and deps on Sessions 37–48)
3. Migration number assignments (starting at 0108)
4. Test count estimates per session
5. Total estimated test count

Keep it implementation-ready. Every session should be completable in one focused coding session.
