# OPPSERA — ACCOUNTING MODULE COMPLETION (ACCT-CLOSE SESSION SERIES)

You are a Staff Product Architect + Senior Full-Stack Engineer completing the accounting module for a multi-tenant SaaS ERP before moving on to Membership.

We already have approved backend sessions 37–48 (accounting remediation) and UXOPS-01 through UXOPS-16 (POS + accounting ops UX).  
**DO NOT rewrite or renumber sessions 37–48 or UXOPS-01–16.** Assume that work exists or will exist.

Now we need a **NEW series of sessions** (ACCT-CLOSE-01 through ACCT-CLOSE-08) focused on:

1. Closing remaining gaps in the accounting module identified during review  
2. Schema provisioning and documentation that prevents backtracking once Membership begins  
3. Operational tooling that completes the "money trail" from POS register to bank statement

---

## CRITICAL: READ BEFORE DESIGNING — WHAT ALREADY EXISTS

You must design around and extend these existing systems. Do not duplicate or contradict them.

### Accounting Core (exists — GL, COA, AP, AR)

- Full GL engine: `postJournalEntry`, `voidJournalEntry`, `AccountingPostingApi.postEntry()`
- COA with 4 business-type templates, `bootstrapTenantAccounting`
- Financial statements: P&L, Balance Sheet, Sales Tax Liability, Cash Flow, Period Comparison
- GL mapping: `sub_department_gl_defaults`, `payment_type_gl_defaults`, `tax_group_gl_defaults`
- `gl_unmapped_events` table for skipped postings
- Close checklist (computed live): open drafts, unmapped events, trial balance, AP/AR subledger reconciliation
- `accounting_settings` table: currency, fiscal year, control account defaults, feature toggles
- `gl_journal_lines` dimensions: `profitCenterId`, `subDepartmentId`, `terminalId`, `channel`
- Idempotency: unique partial index on `(tenantId, sourceModule, sourceReferenceId)`
- Rounding: auto-appended rounding line within tolerance
- `sourceModule` enum: `manual`, `pos`, `pos_legacy`, `ap`, `ar`, `membership`, `payroll`
- `bank_accounts` table with `glAccountId` — used by AP payments and AR receipts
- Currency locked to USD via `CurrencyMismatchError`

### AP (exists)

- Bills, payments, vendor credits, aging, GL posting (Dr Expense, Cr AP Control)
- Subledger reconciliation against GL control account
- Vendor management with payment terms

### AR (exists)

- Invoices, receipts, aging, GL posting (Dr AR Control, Cr Revenue)
- Subledger reconciliation against GL control account
- `sourceType`: `manual`, `membership`, `event`, `pos_house_account`
- Bridge adapter for existing `ar_transactions`

### Retail POS (exists)

- `useShift(locationId, terminalId)` — shift open/close, paid-in/paid-out (localStorage V1)
- `tender.recorded.v1` event with enriched `lines[]`
- POS adapter: `handleTenderForAccounting()` — real-time GL posting per tender
- Dual-mode POS (Retail + F&B mounted simultaneously)

### F&B POS (exists — 103 commands, 63 queries)

- Close Batch: `fnb_close_batches`, `fnb_server_checkouts`, `fnb_cash_counts`
- `buildBatchJournalLines` for GL posting from Z-report data
- 28 permissions across 10 categories with role defaults for 6 system roles
- Standalone pages: `/kds`, `/expo`, `/host`, `/fnb-manager`, `/close-batch`

### Customer Module (exists)

- `customer_wallet_accounts` with `accountType: credit | loyalty | gift_card`
- Universal Customer Profile with lazy-loaded tabs

### Inventory Module (exists)

- Movement types include `shrink` and `waste`
- Receiving + vendor management + landed cost

### Platform Patterns (must follow)

| Pattern | Requirement |
|---------|-------------|
| Multi-tenancy | Every table: `tenant_id` + RLS policies. `withTenant(tenantId, tx)` |
| IDs | ULID via `generateUlid()` |
| Validation | Zod schemas for all inputs |
| Events | `publishWithOutbox(ctx, async (tx) => { ... })` pattern |
| Event wiring | Consumer subscriptions in `apps/web/src/instrumentation.ts` |
| Frontend hooks | Custom `useFetch<T>` / `useMutation<TInput, TResult>` with `apiFetch` |
| Query strings | `buildQueryString(filters)` from `@/lib/query-string` |
| Money | Orders/Payments = INTEGER cents; GL/AP/AR = NUMERIC(12,2) dollars |
| Migrations | `packages/db/migrations/NNNN_description.sql` (next available: see last migration) |
| Tests | Vitest, in `__tests__/` dirs, unit + integration |
| Permissions | Core RBAC via `requirePermission` middleware |
| Audit | `auditLog(ctx, action, entityType, entityId)` after mutations |
| Command pattern | `publishWithOutbox` + idempotency check inside tx + `saveIdempotencyKey` |

---

## NON-NEGOTIABLE: UI/UX SHIPS WITH EACH SESSION

For every new session you propose, you must deliver BOTH:  
A) Any needed schema/events/backend glue  
B) UX/UI + settings surfaces required to operate it

Every session MUST include:

- **Screens to add/modify** (with file paths under `apps/web/src/`)
- **Component architecture** (React component tree + props + state + hooks)
- **Admin settings/forms** (for all new config)
- **Validation UX** (warnings, banners, empty states, inline errors)
- **Permissions + manager override** (which permissions gate each action)
- **Acceptance checklist** (manual QA steps)
- **Tests** (unit + integration count estimates)

**Definition of Done requires UX/UI. Do not defer UI to a later session.**

---

## SESSION REQUIREMENTS

### ACCT-CLOSE-01: Cash Drawer Hardening — Change Fund, Multi-Drop, Deposit Prep

**Goal**: Complete the cash-handling data model so retail POS matches F&B operational rigor.

UXOPS-01/11 introduced `pos_drawer_sessions`, `pos_cash_drops`, `pos_paid_in_out`. This session hardens the model with real-world operational details that were identified as gaps.

#### Required additions to `pos_cash_drops`:

| Column | Type | Purpose |
|--------|------|---------|
| `bag_id` | `TEXT` | Physical bag or lockbox ID for the drop |
| `seal_number` | `TEXT` | Tamper-evident seal number |
| `verified_by` | `TEXT` (FK users) | User who verified the sealed drop |
| `verified_at` | `TIMESTAMPTZ` | When verification occurred |
| `deposit_slip_id` | `TEXT` (FK) | Links drop to a deposit slip (nullable until deposit prep) |

#### New table: `pos_deposit_slips`

| Column | Type | Purpose |
|--------|------|---------|
| `id` | `TEXT` PK | ULID |
| `tenant_id` | `TEXT` NOT NULL | |
| `location_id` | `TEXT` NOT NULL | |
| `business_date` | `DATE` NOT NULL | |
| `bank_account_id` | `TEXT` (FK `bank_accounts`) | Destination bank account |
| `total_amount` | `NUMERIC(12,2)` | Sum of all linked drops + drawer cash |
| `denomination_breakdown` | `JSONB` | `{ hundreds: 0, fifties: 0, twenties: 0, tens: 0, fives: 0, ones: 0, quarters: 0, dimes: 0, nickels: 0, pennies: 0, rolls: {} }` |
| `slip_number` | `TEXT` | Physical bank deposit slip number |
| `status` | `TEXT` | `draft`, `prepared`, `deposited`, `reconciled` |
| `prepared_by` | `TEXT` (FK users) | |
| `deposited_at` | `TIMESTAMPTZ` | When physically taken to bank |
| `created_at` / `updated_at` | `TIMESTAMPTZ` | |

#### Change Fund concept:

Add to `pos_drawer_sessions`:

| Column | Type | Purpose |
|--------|------|---------|
| `change_fund_amount` | `NUMERIC(12,2)` | Starting cash that is NOT revenue (carried forward or assigned) |

The change fund is the opening float. It must be excluded from revenue calculations. Expected cash at close = `change_fund_amount + cash_sales - cash_refunds + paid_in - paid_out - drops`.

#### UX requirements:

- **Deposit prep screen**: operator counts denominations, links bags/drops, enters slip number, prints deposit slip
- **Drop verification flow**: second user confirms sealed bag with bag ID + seal number
- **Deposit status badges**: draft → prepared → deposited → reconciled
- **Deposit history list**: filterable by date range, location, status

#### GL Posting:

When deposit status moves to `deposited`:
```
Debit:  Bank Account (from bank_accounts.glAccountId)
Credit: Undeposited Funds / Cash on Hand
```

---

### ACCT-CLOSE-02: Breakage Income Configurability + Voucher Policy Controls

**Goal**: Make breakage income recognition configurable to prevent legal exposure in restricted jurisdictions.

Session 45 (planned) posts voucher expiration to breakage income. This session adds the policy controls.

#### Schema additions to `accounting_settings`:

| Column | Type | Default | Purpose |
|--------|------|---------|---------|
| `recognize_breakage_automatically` | `BOOLEAN` | `true` | When `false`, expired vouchers stay as liabilities |
| `breakage_recognition_method` | `TEXT` | `'on_expiry'` | `'on_expiry'` / `'proportional'` / `'manual_only'` |
| `breakage_income_account_id` | `TEXT` (FK `gl_accounts`) | NULL | Explicit breakage income GL account |
| `voucher_expiry_enabled` | `BOOLEAN` | `true` | Whether vouchers can expire at all (California = `false`) |

#### Recognition methods:

- **`on_expiry`**: full remaining balance recognized as income when voucher expires (simplest, common)
- **`proportional`**: breakage estimated and recognized proportionally over voucher life (GAAP preferred for large programs)
- **`manual_only`**: never auto-recognize; operator creates manual journal entry for breakage

#### UX requirements:

- **Settings panel**: under Accounting Settings → Vouchers/Gift Cards section
  - Toggle: "Automatically recognize breakage income"
  - Dropdown: Recognition method (with explanation tooltip for each)
  - Account picker: Breakage income GL account
  - Toggle: "Allow voucher expiration" (with warning: "Disabling this means vouchers never expire")
- **Jurisdiction warning banner**: if `voucher_expiry_enabled = false`, show info banner on voucher management screens: "Voucher expiration is disabled for this location per local regulations"

#### Behavioral rules:

- When `recognize_breakage_automatically = false`: the voucher expiration job still marks vouchers as expired but does NOT create GL entries. Instead, it creates rows in a new `pending_breakage_review` queue.
- Operator reviews pending breakage and either approves (posts to breakage income) or declines (keeps as liability).
- `pending_breakage_review` table: `voucher_id`, `amount`, `expired_at`, `status` (pending/approved/declined), `reviewed_by`, `reviewed_at`.

---

### ACCT-CLOSE-03: Reconciliation Summary — Chain of Custody Dashboard

**Goal**: Single "where's the money?" view that traces every dollar from order to bank.

UXOPS-13 has reconciliation. This session adds the missing waterfall/chain-of-custody view.

#### The Reconciliation Waterfall

A single read-only dashboard with one row per stage in the money flow:

| Stage | Source | Amount |
|-------|--------|--------|
| **Orders Total** | `SUM(order_lines.extended_price_cents)` for business date | $X |
| **Discounts** | `SUM(discount_amount_cents)` | -$Y |
| **Net Sales** | Orders - Discounts | $Z |
| **Tax Collected** | `SUM(tax_amount_cents)` | +$T |
| **Tips** | `SUM(tip_amount_cents)` | +$P |
| **Gross Tenders** | `SUM(tender.amount_cents)` | $G |
| ↳ Cash tenders | filtered by type | $C |
| ↳ Card tenders | filtered by type | $D |
| ↳ Other tenders | house account, gift card, etc. | $O |
| **Card Settlements** | `SUM(payment_settlements.gross_amount)` | $S |
| **Processing Fees** | `SUM(payment_settlements.fee_amount)` | -$F |
| **Net Deposits** | settlements - fees | $N |
| **Cash Deposits** | `SUM(pos_deposit_slips.total_amount)` | $CD |
| **Bank Confirmed** | from bank reconciliation (when available) | $B |
| **Over/Short** | computed variance at each stage | ±$V |

#### Key design rules:

- **One query per stage** — each row is independently computed. No cascading calculations that hide errors.
- **Variance highlighting**: any stage where `actual != expected` gets a red/amber badge with the delta.
- **Drill-down**: each row is clickable → opens the detail list (e.g., click "Card tenders" → list of card tenders for that date).
- **Date + location filter**: business date picker + location picker at top.
- **Channel breakdown toggle**: show split by `retail` vs `fnb` channel.
- **Export**: CSV export of the waterfall for accountants.

#### Screen location:

`/accounting/reconciliation/summary` — new page, linked from the existing close checklist and from the accounting dashboard.

#### Component architecture:

```
ReconciliationSummaryPage
├── DateLocationFilter (date picker + location picker)
├── ReconciliationWaterfall
│   ├── WaterfallRow (per stage — amount, expected, variance, drill link)
│   └── WaterfallVarianceBadge (green/amber/red)
├── ChannelBreakdownToggle
└── ExportButton (CSV)
```

---

### ACCT-CLOSE-04: Audit Log Consistency Pass + Global Audit Policy

**Goal**: Guarantee every money-moving command writes to the core `audit_log`, establish an enforced policy, and surface gaps.

#### The problem:

The command pattern calls `auditLog()` after `publishWithOutbox`, but F&B commands have their own event tables (`fnb_tips`, `fnb_payment_sessions`, etc.) and may not all double-write to the core audit log. Any command that moves money but skips the audit log is a compliance gap.

#### Required work:

**1) Audit grep + fix pass:**

Systematically verify that every command in these modules calls `auditLog()`:

| Module | Money-moving commands to verify |
|--------|-------------------------------|
| `payments` | `recordTender`, `recordRefund`, `voidTender` |
| `fnb` | `createPaymentSession`, `capturePreAuth`, `voidPreAuth`, `adjustTip`, `finalizeTips`, `serverCheckout`, `reconcileBatch`, `postBatch`, every comp/void/transfer command |
| `accounting` | `postJournalEntry`, `voidJournalEntry`, `generateRetainedEarnings` |
| `ap` | `postBill`, `postPayment`, `voidBill`, `createVendorCredit` |
| `ar` | `postInvoice`, `postReceipt`, `voidInvoice` |
| `orders` | `voidOrder`, `createReturn` |

For any command missing `auditLog()`: add it.

**2) Audit event schema enrichment:**

Every money-moving audit entry must include in its metadata:

```typescript
{
  amountCents?: number;       // or amountDollars for GL/AP/AR
  tenderType?: string;
  terminalId?: string;
  deviceFingerprint?: string; // IP or device ID (from request context)
  managerApprover?: string;   // user ID if manager PIN was required
  reason?: string;            // for voids, comps, adjustments
}
```

Extend the `auditLog()` helper signature to accept optional `metadata: Record<string, unknown>` if it doesn't already.

**3) CONVENTIONS.md addition:**

Add a new convention section:

```markdown
## XX. Audit Log Policy

Every command that creates, modifies, or reverses a financial transaction MUST call
`auditLog(ctx, action, entityType, entityId, metadata?)` after the transaction commits.

"Financial transaction" includes: tenders, refunds, voids, comps, tip adjustments,
journal entries, bill payments, receipt postings, drawer operations, cash drops,
deposit preparations, and settlement recordings.

The metadata object MUST include `amountCents` (or `amountDollars`), and SHOULD include
`terminalId`, `managerApprover` (if PIN was required), and `reason` (if applicable).

Audit entries are append-only. Never update or delete audit_log rows.
```

**4) Audit coverage diagnostic query:**

New query `getAuditCoverage(tenantId, dateRange)`:

Returns counts of:
- GL journal entries posted vs audit entries with `action LIKE 'accounting.%'`
- Tenders recorded vs audit entries with `action LIKE 'payment.%'`
- etc.

Any mismatch = gap. Surface this on the accounting dashboard as a "data integrity" card.

#### UX:

- **Audit trail viewer**: `/accounting/audit` — searchable, filterable log of all financial audit entries
  - Filters: date range, user, action type, entity type, amount range
  - Columns: timestamp, user, action, entity, amount, terminal, manager approver
- **Data integrity card** on accounting dashboard: "X audit entries / Y financial transactions — Z gaps detected"

---

### ACCT-CLOSE-05: Permissions Matrix — Single Authoritative Map

**Goal**: Create a single consolidated permissions matrix across all modules and embed it as both documentation and a runtime-queryable artifact.

#### The deliverable is two things:

**1) Documentation artifact** — a single markdown table in `PERMISSIONS.md` (root of repo):

| Permission Key | Module | Description | Default Roles | Manager PIN Required | Audit Required | UI Surface |
|---------------|--------|-------------|---------------|---------------------|----------------|------------|
| `pos.drawer.open` | POS | Open a cash drawer session | owner, manager, cashier | No | Yes | POS shift bar |
| `pos.drawer.close` | POS | Close a cash drawer session | owner, manager, cashier | No | Yes | POS shift bar |
| `pos.void.order` | POS | Void an entire order | owner, manager | Yes | Yes | Order detail |
| `pos.comp.apply` | POS | Apply a comp to a line or check | owner, manager | Yes | Yes | Order detail |
| `pos.refund.create` | POS | Process a refund | owner, manager | Yes | Yes | Order detail |
| `pos.cash_drop.create` | POS | Record a cash drop | owner, manager, cashier | No | Yes | Drawer panel |
| `pos.deposit.prepare` | POS | Prepare bank deposit | owner, manager | No | Yes | Deposit prep screen |
| `accounting.journal.post` | Accounting | Post a manual journal entry | owner, manager | No | Yes | Journal entry form |
| `accounting.journal.void` | Accounting | Void a journal entry | owner, manager | Yes | Yes | Journal detail |
| `accounting.period.close` | Accounting | Close an accounting period | owner | Yes | Yes | Close checklist |
| `accounting.control_account.post` | Accounting | Post to control accounts | owner | Yes | Yes | Journal entry form |
| `accounting.settings.manage` | Accounting | Modify accounting settings | owner | No | Yes | Settings page |
| `accounting.reconciliation.view` | Accounting | View reconciliation dashboard | owner, manager | No | No | Reconciliation page |
| `ap.*` | AP | (enumerate all AP permissions) | ... | ... | ... | ... |
| `ar.*` | AR | (enumerate all AR permissions) | ... | ... | ... | ... |
| `pos_fnb.*` | F&B | (enumerate all 28 F&B permissions) | ... | ... | ... | ... |

Complete this matrix for EVERY permission in the system. Include core platform permissions (RBAC management, tenant settings, user management) not just financial ones.

**2) Runtime validation** — a TypeScript constant:

```typescript
// packages/shared/src/permissions/permission-matrix.ts
export const PERMISSION_MATRIX: PermissionDefinition[] = [
  {
    key: 'pos.void.order',
    module: 'pos',
    description: 'Void an entire order',
    defaultRoles: ['owner', 'manager'],
    requiresManagerPin: true,
    requiresAudit: true,
  },
  // ... all permissions
];
```

This constant is the source of truth. The seed script uses it to create default role-permission mappings. The `PERMISSIONS.md` file is generated from it (or kept in sync manually with a lint check).

#### UX:

- **Admin permissions viewer**: `/settings/permissions` — read-only table showing the full matrix, filterable by module
- If custom role editing exists: the permission picker references `PERMISSION_MATRIX` for descriptions and PIN/audit flags

---

### ACCT-CLOSE-06: Multi-Currency Schema Provisioning + Recurring Journal Entries

**Goal**: Add the schema columns needed for future multi-currency support (no conversion logic yet), and build recurring journal entry templates.

#### Part A: Multi-Currency Column Provisioning

Currently the GL is locked to USD. Before Membership (which may involve international clubs), add these columns so the schema is ready:

**`gl_journal_entries`** — add:

| Column | Type | Default | Purpose |
|--------|------|---------|---------|
| `transaction_currency` | `TEXT` | `'USD'` | Currency of the original transaction |
| `exchange_rate` | `NUMERIC(12,6)` | `1.000000` | Rate used for conversion to base currency |

**`accounting_settings`** — add:

| Column | Type | Default | Purpose |
|--------|------|---------|---------|
| `supported_currencies` | `TEXT[]` | `{'USD'}` | Currencies this tenant can transact in |

**Behavioral rules for V1:**
- `CurrencyMismatchError` still fires if `transaction_currency != baseCurrency` AND `exchange_rate = 1.0` (i.e., no explicit conversion was provided)
- All existing posting paths continue to pass `transaction_currency: 'USD'`, `exchange_rate: 1.0`
- The columns exist but are inert until a future multi-currency session activates conversion logic
- **Do not build currency conversion UI or exchange rate management.** This is schema prep only.

#### Part B: Recurring Journal Entry Templates

Standard accounting workflow: monthly accruals, depreciation, prepaid amortization, etc.

**New table: `gl_recurring_templates`**

| Column | Type | Purpose |
|--------|------|---------|
| `id` | `TEXT` PK | ULID |
| `tenant_id` | `TEXT` NOT NULL | |
| `name` | `TEXT` NOT NULL | "Monthly Rent Accrual", "Equipment Depreciation" |
| `description` | `TEXT` | |
| `frequency` | `TEXT` NOT NULL | `monthly`, `quarterly`, `annually` |
| `day_of_period` | `INTEGER` | Day of month to post (1-28, or `last`) |
| `start_date` | `DATE` NOT NULL | First occurrence |
| `end_date` | `DATE` | NULL = indefinite |
| `is_active` | `BOOLEAN` | `true` |
| `last_posted_period` | `TEXT` | `YYYY-MM` of last successful posting |
| `next_due_date` | `DATE` | Computed/cached next occurrence |
| `template_lines` | `JSONB` NOT NULL | Array of `{ accountId, debitAmount, creditAmount, description }` |
| `source_module` | `TEXT` | `'recurring'` |
| `created_by` | `TEXT` | |
| `created_at` / `updated_at` | `TIMESTAMPTZ` | |

**Commands:**

| Command | Purpose |
|---------|---------|
| `createRecurringTemplate` | Create a new template (validates lines balance) |
| `updateRecurringTemplate` | Modify template (only future occurrences affected) |
| `deactivateRecurringTemplate` | Stop future postings |
| `executeRecurringTemplate` | Post a single occurrence (idempotent via `sourceReferenceId = template.id + period`) |
| `executeDueRecurringEntries` | Batch: find all templates where `next_due_date <= today` and execute them |

**Execution model:**

- `executeDueRecurringEntries` runs as a scheduled job (Postgres-backed job system)
- Each execution creates a GL journal entry via `AccountingPostingApi.postEntry()` with `sourceModule: 'recurring'`, `sourceReferenceId: '{templateId}-{YYYY-MM}'`
- Idempotent: the unique partial index prevents double-posting for the same template+period
- If posting fails (e.g., account deactivated), log to `gl_unmapped_events` and skip (do not block other templates)

**UX:**

- **Recurring entries list**: `/accounting/recurring` — table of all templates with status, frequency, next due date, last posted
- **Create/edit form**: standard journal entry line editor but with frequency + date fields
- **Run now button**: manually trigger a template for the current period (manager permission)
- **History tab**: list of all journal entries created from this template
- **Close checklist integration**: add "Recurring entries current?" check — warns if any template has `next_due_date` before the period being closed

---

### ACCT-CLOSE-07: Bank Reconciliation

**Goal**: Enable operators to reconcile bank statements against GL records without exporting to QuickBooks.

This is the most complex session. It connects `bank_accounts` → GL journal lines → deposits → settlements into a single reconciliation workflow.

#### New table: `bank_reconciliations`

| Column | Type | Purpose |
|--------|------|---------|
| `id` | `TEXT` PK | ULID |
| `tenant_id` | `TEXT` NOT NULL | |
| `bank_account_id` | `TEXT` NOT NULL (FK `bank_accounts`) | |
| `statement_date` | `DATE` NOT NULL | Bank statement ending date |
| `statement_ending_balance` | `NUMERIC(12,2)` NOT NULL | Per bank statement |
| `beginning_balance` | `NUMERIC(12,2)` NOT NULL | Prior reconciliation's ending balance (or opening balance) |
| `status` | `TEXT` | `in_progress`, `completed` |
| `reconciled_by` | `TEXT` | |
| `completed_at` | `TIMESTAMPTZ` | |
| `notes` | `TEXT` | |
| `created_at` / `updated_at` | `TIMESTAMPTZ` | |

#### New table: `bank_reconciliation_items`

| Column | Type | Purpose |
|--------|------|---------|
| `id` | `TEXT` PK | ULID |
| `reconciliation_id` | `TEXT` NOT NULL (FK) | |
| `tenant_id` | `TEXT` NOT NULL | |
| `gl_journal_line_id` | `TEXT` (FK) | The GL line being reconciled (nullable for bank-only items) |
| `item_type` | `TEXT` | `deposit`, `withdrawal`, `fee`, `interest`, `adjustment` |
| `amount` | `NUMERIC(12,2)` | |
| `date` | `DATE` | Transaction date on bank statement |
| `description` | `TEXT` | |
| `is_cleared` | `BOOLEAN` | Whether this item has cleared the bank |
| `cleared_date` | `DATE` | When cleared |

#### Reconciliation math:

```
GL Book Balance (for bank account) = SUM(debits - credits) for the bank GL account
Statement Balance = operator-entered from bank statement

Adjusted Book Balance = GL Balance
  + deposits in transit (GL posted, not yet on bank statement)
  - outstanding checks/withdrawals (GL posted, not yet on bank statement)
  
Adjusted Bank Balance = Statement Balance
  + bank errors/adjustments

Difference = Adjusted Book Balance - Adjusted Bank Balance
  → Must be $0.00 to complete reconciliation
```

#### Workflow:

1. **Start reconciliation**: select bank account + statement date + statement ending balance
2. **Auto-populate**: query all GL journal lines hitting the bank account GL since last reconciliation, show as "book items"
3. **Match/clear**: operator checks off items that appear on the bank statement
4. **Uncleared items**: anything not checked = "outstanding" (deposits in transit, outstanding checks)
5. **Bank-only items**: operator can add items that appear on the bank statement but not in GL (bank fees, interest — these generate adjusting journal entries)
6. **Balance check**: system computes adjusted balances and shows difference
7. **Complete**: when difference = $0.00, operator completes the reconciliation

#### UX:

- **Bank rec list**: `/accounting/bank-reconciliation` — list of bank accounts with last reconciled date, next due
- **Reconciliation workspace**: two-column layout
  - Left: Book items (GL journal lines for this bank account, unreconciled)
  - Right: Statement summary (beginning balance, cleared items, ending balance, difference)
  - Bottom: Outstanding items list + bank adjustment entry form
- **Difference indicator**: large, prominent display showing current difference (green when $0.00, red otherwise)
- **Auto-match**: optional helper that matches by amount + date proximity (suggest matches, operator confirms)
- **History**: completed reconciliations with drill-down to see what was cleared

#### Permissions:

- `accounting.bank_rec.create` — start a reconciliation (owner, manager)
- `accounting.bank_rec.complete` — complete/finalize (owner, manager)
- `accounting.bank_rec.adjust` — create adjusting entries from bank items (owner)

#### Close checklist integration:

Add "Bank accounts reconciled?" check — warns if any bank account hasn't been reconciled for the period being closed.

---

### ACCT-CLOSE-08: Documentation + Provisioning for Deferred Features

**Goal**: Write explicit conventions, placeholder specs, and schema stubs for features that are intentionally deferred to post-Membership, so future sessions don't have to rediscover these requirements.

This session produces NO runtime code. It produces documentation artifacts only.

#### 1) Till Sharing — Strict V1 Convention

Add to CONVENTIONS.md:

```markdown
## XX. Cash Drawer Ownership (V1 — Strict Mode)

V1 enforces strict drawer-to-terminal binding:
- One drawer session per terminal per business date
- A cashier CANNOT move their drawer to a different terminal
- To switch terminals: close drawer on Terminal A (with count), open new drawer on Terminal B
- Counts carry forward: the closing count from Terminal A becomes the basis for opening Terminal B
- Flexible drawer mode (drawer follows cashier across terminals) is a V2 enhancement

UX implication: if a cashier tries to open a drawer on Terminal B while they have one open on
Terminal A, show: "You have an open drawer on Terminal A. Close it first to open here."
```

#### 2) Offline Behavior — Explicit V1 Disable

Add to CONVENTIONS.md:

```markdown
## XX. Offline Behavior Policy (V1)

V1 does NOT support offline payment processing. The policy is explicit:

- If network connectivity is lost, POS enters read-only mode
- Read-only mode allows: viewing open orders, browsing catalog, viewing shift info
- Read-only mode BLOCKS: placing orders, recording tenders, opening/closing drawers,
  cash drops, voids, comps, refunds, any GL-posting operation
- A persistent banner displays: "Offline — payments disabled until connection restored"
- When connectivity returns, banner clears automatically (polling-based detection)

The typed offline queue (`packages/modules/fnb/src/helpers/offline-queue-types.ts`) exists
as a V2 spec. Do not implement the queue or replay logic in V1.

Future V2 option: "cash-only offline" mode where cash tenders can be queued locally with
temporary IDs and reconciled on reconnect. This requires: temp ID generation, dedup on
reconnect, conflict resolution, and explicit UX for "pending sync" state.
```

Add a runtime guard to the POS payment flow:

```typescript
// In TenderDialog or payment hook:
if (!navigator.onLine) {
  showOfflineBanner();
  return; // Block tender
}
```

#### 3) Gift Card / Store Credit / Stored Value — Placeholder Spec

Create `docs/specs/STORED-VALUE-UX.md`:

```markdown
# Stored Value UX Spec (Deferred — Post-Membership)

## Why deferred
The customer wallet model (`customer_wallet_accounts` with accountType: credit | loyalty | gift_card)
exists but Membership will extend the wallet with billing accounts, statement charges, and
balance topups. Building stored-value POS UX now would require refactoring after Membership.

## Planned screens (build after Membership wallet model is final)

### POS: Issue Gift Card
- Scan/enter card number → set value → select payment method → issue
- GL: Dr Cash/Card, Cr Gift Card Liability

### POS: Redeem Gift Card
- Scan/enter card number → check balance → apply to tender
- GL: Dr Gift Card Liability, Cr Revenue

### POS: Check Balance
- Scan/enter → display balance + transaction history

### POS: Store Credit
- Issue: manager PIN required → set amount → link to customer
- Redeem: same as gift card but sourced from store credit wallet

### Admin: Stored Value Management
- View all active gift cards / store credits
- Void/adjust (manager PIN + audit)
- Fraud controls: velocity limits, duplicate detection

### Data model extensions needed
- `stored_value_cards` table (card number, type, balance, status, customer link)
- `stored_value_transactions` table (issue, redeem, void, adjustment, expiry)
- Integration with `customer_wallet_accounts` (wallet is the balance, card is the physical/virtual token)
```

#### 4) Kitchen Waste Tracking — Convention + TODO

Add to CONVENTIONS.md:

```markdown
## XX. Kitchen Waste Tracking (V1 — Boolean Only)

V1 captures `wasteTracking: boolean` on void-line-after-send events. This indicates that
a kitchen item was wasted (prepared but voided).

Full waste tracking is deferred to V2 when F&B item voids are connected to inventory movements:

Future additions:
- `waste_reason` enum: overcooked, dropped, wrong_order, expired, quality, other
- `waste_quantity` (may differ from order quantity)
- `waste_cost_estimate_cents` (from item cost or recipe cost if inventory costing exists)
- Waste reporting: by item, category, server, daypart, reason
- Integration with inventory `shrink` movement type

The inventory module already supports `shrink` and `waste` movement types.
When this integration is built, F&B void-with-waste should create an inventory
shrink movement automatically.
```

#### 5) Multi-Currency Activation Roadmap

Add to CONVENTIONS.md:

```markdown
## XX. Multi-Currency Roadmap

V1 is USD-only. Schema columns (`transaction_currency`, `exchange_rate` on `gl_journal_entries`,
`supported_currencies` on `accounting_settings`) exist but are inert.

Activation checklist (future session):
- [ ] Exchange rate source (manual entry or API like Open Exchange Rates)
- [ ] `exchange_rates` table (date, from, to, rate)
- [ ] Currency conversion at posting time (multiply by rate, store both original + base)
- [ ] Multi-currency P&L and Balance Sheet (unrealized gain/loss calculation)
- [ ] Foreign currency revaluation workflow
- [ ] Currency selector in invoice/bill creation
- [ ] Remove `CurrencyMismatchError` guard (replace with conversion logic)
```

---

## OUTPUT FORMAT (STRICT)

Use this exact format for each session:

```
### Session ACCT-CLOSE-NN: <Title>

**Priority**: P0/P1/P2  
**Goal**: <one sentence>  
**Depends on**: <other sessions or "none">

**Scope**:

- **Backend/data objects**:
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

- **Settings/forms**:
  - New settings fields
  - Admin forms to configure them

- **Validation UX**:
  - Warning banners, empty states, inline errors

- **Permissions + manager override**:
  - Which permissions gate each action

- **Reports/drilldowns**:
  - Data surfaced, filters, export format

- **Acceptance checklist** (manual QA):
  - Step-by-step verification

- **Tests**:
  - Unit tests (count estimate)
  - Integration tests (count estimate)
```

---

## DEPENDENCY GRAPH

```
ACCT-CLOSE-01 (Cash Drawer)     → depends on UXOPS-01/11
ACCT-CLOSE-02 (Breakage)        → depends on Session 45 (voucher expiry)
ACCT-CLOSE-03 (Reconciliation)  → depends on UXOPS-13, ACCT-CLOSE-01
ACCT-CLOSE-04 (Audit)           → no deps (can run anytime)
ACCT-CLOSE-05 (Permissions)     → no deps (can run anytime)
ACCT-CLOSE-06 (Multi-Currency + Recurring) → no deps
ACCT-CLOSE-07 (Bank Rec)        → depends on ACCT-CLOSE-01, ACCT-CLOSE-06
ACCT-CLOSE-08 (Documentation)   → no deps (can run anytime, should run LAST)
```

**Recommended execution order:**

1. ACCT-CLOSE-04 (Audit — quick wins, no schema deps)
2. ACCT-CLOSE-05 (Permissions — documentation + constants, no schema deps)
3. ACCT-CLOSE-01 (Cash Drawer — extends UXOPS schema)
4. ACCT-CLOSE-02 (Breakage — small, targeted)
5. ACCT-CLOSE-06 (Multi-Currency + Recurring — schema prep + new feature)
6. ACCT-CLOSE-03 (Reconciliation — needs cash drawer data to be complete)
7. ACCT-CLOSE-07 (Bank Rec — needs everything above)
8. ACCT-CLOSE-08 (Documentation — captures all decisions made above)

---

## COMPLETION CRITERIA

After all 8 sessions, the accounting module is considered **complete for V1** when:

1. Every dollar from POS register to bank statement has a traceable path
2. Every money-moving command writes to the core audit log with enriched metadata
3. A single permissions matrix covers all modules
4. Bank reconciliation can be performed without exporting to QuickBooks
5. Recurring journal entries automate standard month-end accruals
6. Breakage income is legally configurable
7. Multi-currency schema is provisioned (but inert)
8. Deferred features (gift cards, offline, waste tracking, flexible drawers) have explicit specs and conventions documenting their intentional deferral

**After this series completes, proceed to Membership.**

---

## START NOW

Produce the complete ACCT-CLOSE session plan (8 sessions) following the output format above, with:
1. Full scope for each session
2. Migration number assignments (starting at next available)
3. Test count estimates per session
4. Total estimated test count
5. Any refinements to the dependency graph based on your analysis

Keep it implementation-ready. Every session should be completable in one focused coding session.
