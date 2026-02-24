# OppsEra Accounting Core + GL + AP + AR v0 — Session Plan (v2)

## Pre-Session Notes: Codebase Conflicts + Convention Corrections

### 1. Vendors Table Already Exists
The vendors table exists from Milestone 11 (Receiving + Vendor Management, Session 24). Columns: name, account_number, contact_*, address_*, tax_id, is_active, name_normalized, etc. AP must extend via ALTER TABLE (add defaultExpenseAccountId, defaultAPAccountId, paymentTermsId, is1099Eligible, vendorNumber), not recreate.

### 2. Existing COA Tables — Deprecate + Build Clean
Three accounting-adjacent tables exist: accounting_sources, chart_of_account_associations, chart_of_account_classifications. They lack fundamental accounting properties (account types, normal balance, control flags). Plan builds clean gl_* tables. Old tables get _deprecated suffix in a later cleanup migration — no data loss, but all new accounting code uses gl_* exclusively.

### 3. Existing payment_journal_entries — Bridge, Don't Replace
The Payments module writes simplified GL entries to payment_journal_entries (JSONB). The new GL uses a bridge adapter (Session 32) so existing POS/Payments flow isn't disrupted. New tenants post through the real GL from day one.

### 4. Existing AR Tables — Bridge Into GL
Session 16 built ar_transactions, ar_allocations, billing_accounts. These are operational AR (house accounts). Session 33 creates a proper AR subledger that bridges from these tables into GL control accounts, not a parallel system.

### 5. Convention Alignment
Original prompt uses "services" throughout. OppsEra uses commands/queries pattern:

- Writes → commands/ using `publishWithOutbox(ctx, async (tx) => { ... })`
- Reads → queries/ using `withTenant(tenantId, async (tx) => { ... })`
- Zod validation in API route handlers, not commands
- Audit logging after the transaction: `await auditLog(ctx, ...)`
- Cross-module communication via events or internal read APIs (singleton getter/setter in @oppsera/core)

### 6. Money Representation
GL amounts: NUMERIC(12,2) in dollars (not cents). Aligns with receiving module (NUMERIC(12,4) for costs). Different from orders/payments layer (INTEGER cents). Convert at boundaries.

### 7. Multi-Currency — Explicitly Deferred + Locked
All tables include `currency TEXT NOT NULL DEFAULT 'USD'`. accounting_settings gets `baseCurrency TEXT NOT NULL DEFAULT 'USD'`. Posting engine validates currency === baseCurrency and rejects mismatches with a clear error: "Multi-currency is not yet supported." This prevents silent corruption without blocking future implementation.

---

## Session Architecture (7 Sessions)

| Session | Scope | New Tables | Cmds | Queries | Routes | Tests |
|---------|-------|------------|------|---------|--------|-------|
| 28 | GL Core Schema + Posting Engine + Validation | 9 tables, 1 migration | 5 | 3 | 0 | ~30 |
| 29 | Mapping + Reports + Bank Registry + Reconciliation + API Routes | 4 tables, 1 migration | 8 | 8 | ~22 | ~30 |
| 30 | AP Schema + Bill Lifecycle | 5 tables + vendor ext, 1 migration | 8 | 5 | ~12 | ~25 |
| 31 | AP Payments + Credits + AP Reports + Landed Cost | 1 table | 7 | 7 | ~12 | ~25 |
| 32 | Integration: Bridge Adapters + POS Posting + Tenant Bootstrap + Tests | 1 table | 3 | 3 | ~6 | ~25 |
| 33 | AR v0: Invoice/Receipt Lifecycle + AR Reports + AR-GL Reconciliation | 4 tables, 1 migration | 7 | 5 | ~12 | ~20 |
| 34 | Financial Statements + Close Workflow + Sales Tax Report | 2 tables, 1 migration | 3 | 6 | ~8 | ~20 |

**Total: ~26 new tables, ~41 commands, ~37 queries, ~72 API routes, ~175 tests**

---

## Session 28 — GL Core: Schema + Posting Engine + Validation

### Preamble
You are building the Accounting Core module for OppsEra. Read CONVENTIONS.md and CLAUDE.md first — they define all patterns you must follow (commands/queries, publishWithOutbox, withMiddleware, Drizzle schema conventions, etc.).

This session creates the GL foundation: schema, posting engine, and validation. No API routes — those come in Session 29.

Module location: `packages/modules/accounting/`
Package name: `@oppsera/module-accounting`
Dependencies: `@oppsera/shared`, `@oppsera/db`, `@oppsera/core` (NEVER another module)

**KEY DECISIONS ALREADY MADE:**
- GL amounts are NUMERIC(12,2) in dollars (not cents). Different from orders layer.
- All tables include currency column defaulting to 'USD'. Posting engine rejects non-USD until multi-currency is built.
- journalNumber generation uses atomic UPSERT counter (same pattern as order_counters).
- Posted entries are immutable. Corrections via void + reversal only.
- gl_journal_entries has a UNIQUE partial index on (tenantId, sourceModule, sourceReferenceId) WHERE sourceReferenceId IS NOT NULL to enforce idempotent adapter/bridge postings.

### Schema (packages/db/src/schema/accounting.ts)

#### 1. gl_accounts (Chart of Accounts)

- `id` text PK $defaultFn(generateUlid)
- `tenantId` text NOT NULL → tenants.id
- `accountNumber` text NOT NULL
- `name` text NOT NULL
- `accountType` text NOT NULL — enum: 'asset', 'liability', 'equity', 'revenue', 'expense'
- `normalBalance` text NOT NULL — 'debit' or 'credit' (derived from accountType but stored for query convenience)
- `classificationId` text nullable → gl_classifications.id
- `parentAccountId` text nullable → self-reference (for sub-accounts)
- `isActive` boolean default true
- `isControlAccount` boolean default false — true for AP control, AR control, Sales Tax Payable, etc.
- `controlAccountType` text nullable — 'ap', 'ar', 'sales_tax', 'undeposited_funds', 'bank', null. Only set when isControlAccount=true. Restricts which sourceModules can post to it (e.g., only 'ap' and 'manual' can post to AP control). Manual entries into control accounts require `accounting.control_account.post` permission.
- `allowManualPosting` boolean default true
- `description` text nullable
- `createdAt` timestamptz NOT NULL defaultNow()
- `updatedAt` timestamptz NOT NULL defaultNow()

Indexes: unique(tenantId, accountNumber), index(tenantId, accountType), index(tenantId, isActive)

#### 2. gl_classifications

- id, tenantId, name, accountType (same enum as gl_accounts), sortOrder int default 0, createdAt, updatedAt
- Unique: (tenantId, name)

#### 3. gl_journal_entries

- `id` text PK
- `tenantId` text NOT NULL
- `journalNumber` bigint NOT NULL — sequential per tenant
- `sourceModule` text NOT NULL — 'manual', 'pos', 'inventory', 'ap', 'ar', 'membership', 'payroll'
- `sourceReferenceId` text nullable
- `businessDate` date NOT NULL
- `postingPeriod` text NOT NULL — 'YYYY-MM' derived from businessDate
- `currency` text NOT NULL default 'USD'
- `status` text NOT NULL — 'draft', 'posted', 'voided'
- `memo` text nullable
- `postedAt` timestamptz nullable
- `voidedAt` timestamptz nullable
- `voidReason` text nullable
- `reversalOfId` text nullable → self-reference
- `createdBy` text NOT NULL
- `createdAt` timestamptz NOT NULL defaultNow()

Indexes:
- (tenantId, businessDate)
- (tenantId, status)
- (tenantId, postingPeriod)
- unique(tenantId, journalNumber)
- unique(tenantId, sourceModule, sourceReferenceId) WHERE sourceReferenceId IS NOT NULL — idempotency for adapter/bridge posts. Posting command checks this: if duplicate, return existing entry instead of double-posting.

#### 4. gl_journal_lines

- `id` text PK
- `journalEntryId` text NOT NULL → gl_journal_entries.id
- `accountId` text NOT NULL → gl_accounts.id
- `debitAmount` numeric(12,2) NOT NULL default '0'
- `creditAmount` numeric(12,2) NOT NULL default '0'
- `locationId` text nullable
- `departmentId` text nullable — maps to catalog subdepartment
- `customerId` text nullable — AR dimension
- `vendorId` text nullable — AP dimension
- `memo` text nullable
- `sortOrder` int NOT NULL default 0

Constraints: CHECK debitAmount >= 0, CHECK creditAmount >= 0, CHECK NOT (debitAmount > 0 AND creditAmount > 0)
Indexes: (journalEntryId), (accountId), (locationId), (accountId, journalEntryId) for balance queries

#### 5. gl_journal_number_counters

- `tenantId` text PK
- `lastNumber` bigint NOT NULL default 0

#### 6. accounting_settings (1 row per tenant)

- `tenantId` text PK → tenants.id
- `baseCurrency` text NOT NULL default 'USD'
- `fiscalYearStartMonth` int NOT NULL default 1
- `autoPostMode` text NOT NULL default 'auto_post' — 'auto_post' or 'draft_only'
- `lockPeriodThrough` text nullable — 'YYYY-MM', prevents posting into this or earlier
- `defaultAPControlAccountId` text nullable → gl_accounts.id
- `defaultARControlAccountId` text nullable → gl_accounts.id
- `defaultSalesTaxPayableAccountId` text nullable → gl_accounts.id
- `defaultUndepositedFundsAccountId` text nullable → gl_accounts.id
- `defaultRetainedEarningsAccountId` text nullable → gl_accounts.id
- `defaultRoundingAccountId` text nullable → gl_accounts.id
- `roundingToleranceCents` int NOT NULL default 5
- `enableCogsPosting` boolean NOT NULL default false
- `enableInventoryPosting` boolean NOT NULL default false
- `postByLocation` boolean NOT NULL default true
- `enableUndepositedFundsWorkflow` boolean NOT NULL default false — if true, POS cash/CC posts to Undeposited Funds instead of bank; bank deposit is a separate journal
- createdAt, updatedAt

#### 7. gl_unmapped_events

- `id` text PK
- `tenantId` text NOT NULL
- `eventType` text NOT NULL — 'missing_revenue_account', 'missing_payment_account', 'missing_cogs_account', 'missing_tax_account', 'missing_ap_control', 'missing_ar_control', 'missing_tax_group_account'
- `sourceModule` text NOT NULL
- `sourceReferenceId` text nullable
- `entityType` text NOT NULL — 'sub_department', 'payment_type', 'vendor', 'tax_group'
- `entityId` text NOT NULL
- `reason` text NOT NULL
- `resolvedAt` timestamptz nullable
- `resolvedBy` text nullable
- `createdAt` timestamptz NOT NULL defaultNow()

Indexes: (tenantId, resolvedAt) WHERE resolvedAt IS NULL, (tenantId, eventType)

#### 8. gl_account_templates — seed data for tenant bootstrap

- `id` text PK
- `templateKey` text NOT NULL — 'golf_default', 'retail_default', 'restaurant_default', 'hybrid_default'
- `accountNumber` text NOT NULL
- `name` text NOT NULL
- `accountType` text NOT NULL
- `normalBalance` text NOT NULL
- `classificationName` text NOT NULL
- `isControlAccount` boolean default false
- `controlAccountType` text nullable
- `sortOrder` int default 0

No tenantId — this is system-level seed data. Indexed by templateKey.

#### 9. gl_classification_templates — seed data for tenant bootstrap

- `id` text PK
- `templateKey` text NOT NULL
- `name` text NOT NULL
- `accountType` text NOT NULL
- `sortOrder` int default 0

### Migration
`packages/db/migrations/0066_accounting_core.sql`:

- All 9 tables + RLS policies + indexes + CHECK constraints
- Seed gl_account_templates and gl_classification_templates with default COA for golf, retail, restaurant, hybrid
- Default COA includes: Cash on Hand (1010), Undeposited Funds (1050), Accounts Receivable (1200), Inventory Asset (1300), Accounts Payable (2000), Sales Tax Payable (2100), Gift Card Liability (2200), Deferred Revenue (2300), Retained Earnings (3000), Revenue (4000-4999 range by department), COGS (5000), Operating Expenses (6000-6999), Rounding (9999)

### Commands (packages/modules/accounting/src/commands/)

#### 1. post-journal-entry.ts — the core posting engine

```typescript
postJournalEntry(ctx: RequestContext, input: PostJournalEntryInput): Promise<JournalEntry>
```

Input: tenantId, businessDate, sourceModule, sourceReferenceId, memo, currency, lines[], forcePost (boolean)

Logic:

Inside publishWithOutbox transaction:
1. Currency check: if currency !== settings.baseCurrency → throw CurrencyMismatchError
2. Idempotency check: if sourceReferenceId, check unique index. If exists, return existing entry (no error).
3. Validate all accounts exist, are active, belong to tenant
4. Control account enforcement: if sourceModule === 'manual' and any line targets a control account, require `accounting.control_account.post` permission on ctx. If a control account has controlAccountType set, validate sourceModule is allowed (e.g., AP control only from 'ap' or 'manual').
5. Validate sum(debits) === sum(credits). If off by <= roundingToleranceCents, auto-add rounding line to defaultRoundingAccountId. If no rounding account configured or beyond tolerance → UnbalancedJournalError.
6. Validate period not locked: derive postingPeriod from businessDate ('YYYY-MM'), compare to lockPeriodThrough
7. Generate journalNumber atomically: `INSERT INTO gl_journal_number_counters ... ON CONFLICT DO UPDATE SET lastNumber = lastNumber + 1 RETURNING lastNumber`
8. Insert gl_journal_entries + gl_journal_lines
9. If autoPostMode === 'auto_post' OR forcePost: set status='posted', postedAt=now()
   Else: status='draft'
10. Emit event: `accounting.journal.posted.v1` or `accounting.journal.drafted.v1`
11. Return journal entry with lines

#### 2. post-draft-entry.ts — transition draft → posted
Re-validates balance, period lock, then sets status='posted', postedAt=now().

#### 3. void-journal-entry.ts — void a posted entry
Creates reversal entry (debit↔credit swapped) linked via reversalOfId. Original gets status='voided', voidedAt, voidReason. Reversal is auto-posted.

#### 4. update-accounting-settings.ts — UPSERT, validates referenced accounts exist

#### 5. lock-accounting-period.ts — sets lockPeriodThrough. Validates format, prevents locking future periods.

### Queries

- **get-account-balances.ts** — balance(s) as of date. SUM(debit) - SUM(credit) for debit-normal; inverse for credit-normal. Posted entries only.
- **get-journal-entry.ts** — single entry with lines
- **list-journal-entries.ts** — cursor-paginated, filterable by dateRange, sourceModule, status, accountId

### Helpers

- **validate-journal.ts** — balance check, period lock, account validation, control account enforcement
- **generate-journal-number.ts** — atomic UPSERT counter
- **resolve-normal-balance.ts** — accountType → 'debit'/'credit'
- **bootstrap-tenant-coa.ts** — given a templateKey, copies gl_account_templates + gl_classification_templates into gl_accounts + gl_classifications for a new tenant. Creates empty accounting_settings row. Called during tenant onboarding or manually.

### Error Classes

- `UnbalancedJournalError` (code: 'UNBALANCED_JOURNAL', 400)
- `PeriodLockedError` (code: 'PERIOD_LOCKED', 409)
- `ImmutableEntryError` (code: 'IMMUTABLE_ENTRY', 409)
- `ControlAccountError` (code: 'CONTROL_ACCOUNT_RESTRICTED', 403)
- `MissingMappingError` (code: 'MISSING_GL_MAPPING', 400)
- `CurrencyMismatchError` (code: 'CURRENCY_MISMATCH', 400)
- `DuplicatePostingError` (code: 'DUPLICATE_POSTING', 409) — not thrown, returns existing entry

### Event Types

- `accounting.journal.posted.v1` — { journalEntryId, journalNumber, sourceModule, sourceReferenceId, businessDate, totalAmount, lineCount }
- `accounting.journal.voided.v1` — { journalEntryId, reversalEntryId, reason }
- `accounting.period.locked.v1` — { period }

### Tests (~30)

- Balanced entry posts successfully
- Unbalanced entry throws UnbalancedJournalError
- Rounding within tolerance auto-corrects with rounding line
- Rounding beyond tolerance throws
- No rounding account configured + off by 1 cent → throws (not silent loss)
- Period-locked posting rejected
- Future period lock rejected
- Posted entry cannot be edited
- Void creates reversal with swapped debits/credits
- Reversal is auto-posted
- journalNumber increments atomically (no gaps)
- Control account blocks manual posting without permission
- Control account allows posting from correct sourceModule
- Draft → posted transition works
- Settings UPSERT creates row if not exists
- Settings validates account references
- Account balance correct for debit-normal (asset/expense)
- Account balance correct for credit-normal (liability/equity/revenue)
- Idempotent: same sourceModule+sourceReferenceId returns existing, no double-post
- Currency mismatch rejected
- Bootstrap tenant COA from template

### Module Structure

```
packages/modules/accounting/
├── src/
│   ├── commands/
│   │   ├── post-journal-entry.ts       # Core posting engine
│   │   ├── post-draft-entry.ts
│   │   ├── void-journal-entry.ts
│   │   ├── update-accounting-settings.ts
│   │   └── lock-accounting-period.ts
│   ├── queries/
│   │   ├── get-account-balances.ts
│   │   ├── get-journal-entry.ts
│   │   └── list-journal-entries.ts
│   ├── helpers/
│   │   ├── validate-journal.ts
│   │   ├── generate-journal-number.ts
│   │   ├── resolve-normal-balance.ts
│   │   └── bootstrap-tenant-coa.ts
│   ├── errors.ts
│   ├── events/types.ts
│   ├── validation.ts
│   ├── __tests__/
│   │   ├── posting.test.ts
│   │   ├── validation.test.ts
│   │   ├── void-entry.test.ts
│   │   └── bootstrap.test.ts
│   └── index.ts
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

---

## Session 29 — Mapping Engine + GL Reports + Bank Registry + Reconciliation + API Routes

### Preamble
You are continuing the Accounting Core module for OppsEra (Session 29). Session 28 built the schema, posting engine, and validation. This session adds:
1. GL account and classification CRUD commands
2. Mapping engine (sub-department → GL, payment type → GL, tax group → GL)
3. Bank account registry
4. GL reports (detail, trial balance, summary)
5. Reconciliation framework (AP/AR to GL — stubs that Session 33 will implement)
6. All API routes for the accounting module

Session 28 deliverables already exist — build on top of them.

### Schema Additions (0067_accounting_mappings.sql)

#### 10. sub_department_gl_defaults

- Composite PK: (tenantId, subDepartmentId)
- `revenueAccountId` → gl_accounts.id nullable
- `cogsAccountId` → gl_accounts.id nullable
- `inventoryAssetAccountId` → gl_accounts.id nullable
- `discountAccountId` → gl_accounts.id nullable
- `returnsAccountId` → gl_accounts.id nullable
- createdAt, updatedAt

#### 11. payment_type_gl_defaults

- Composite PK: (tenantId, paymentTypeId)
- `cashAccountId` → gl_accounts.id nullable — where money lands (Cash on Hand, Undeposited Funds, bank)
- `clearingAccountId` → gl_accounts.id nullable — card settlement clearing
- `feeExpenseAccountId` → gl_accounts.id nullable — processing fees
- createdAt, updatedAt

#### 12. tax_group_gl_defaults

- Composite PK: (tenantId, taxGroupId)
- `taxPayableAccountId` → gl_accounts.id nullable — where collected sales tax goes
- createdAt, updatedAt

This is critical: POS posting splits tax by tax group, each mapping to its own payable account (or a shared one). Without this, multi-jurisdiction tax reporting is impossible.

#### 13. bank_accounts — registry, not a new GL concept

- `id` text PK
- `tenantId` text NOT NULL
- `name` text NOT NULL — "Operating Checking", "Payroll Account"
- `glAccountId` text NOT NULL → gl_accounts.id — the actual GL account
- `accountNumberLast4` text nullable — for display only, not the full number
- `bankName` text nullable
- `isActive` boolean default true
- `isDefault` boolean default false — default bank for AP payments
- createdAt, updatedAt

Unique: (tenantId, glAccountId). Only one default per tenant.

Bank accounts are just a metadata layer on top of GL accounts — they don't create new accounting rules. They drive:
- AP payment: "pay from which bank?" → selects the credit-side GL account
- Deposit workflow (v1 manual): journal to move from Undeposited Funds to bank
- Future bank reconciliation

### Commands

- **create-gl-account.ts**
- **update-gl-account.ts** — blocks accountType change if referenced by posted entries
- **create-gl-classification.ts**
- **update-gl-classification.ts**
- **save-sub-department-defaults.ts** — UPSERT
- **save-payment-type-defaults.ts** — UPSERT
- **save-tax-group-defaults.ts** — UPSERT
- **save-bank-account.ts** — create/update bank account registry entry

### Queries

- **list-gl-accounts.ts** — filterable by accountType, classification, isActive, isControlAccount. Optionally include balance as of date.
- **get-trial-balance.ts** — for period or date range. Returns: account, debit total, credit total, net balance. Computes total debits vs total credits and flags if not equal. Includes "unclassified" bucket for accounts without classification.
- **get-gl-detail-report.ts** — journal lines by account, date range, location. Running balance per account via window functions. Paginated.
- **get-gl-summary.ts** — aggregated by classification/accountType for date range. This is the data backbone for P&L and Balance Sheet (Session 34 adds the presentation layer).
- **list-unmapped-events.ts** — paginated, filterable by eventType, resolved, dateRange
- **reconcile-subledger.ts** — interface-first design:

```typescript
interface ReconciliationResult {
  subledgerType: 'ap' | 'ar';
  controlAccountId: string;
  controlAccountName: string;
  glBalance: number;
  subledgerBalance: number;
  difference: number;
  isReconciled: boolean;
  asOfDate: string;
  details?: ReconciliationDetail[];
}
```

AP implementation: queries ap_bills and ap_payments (available after Session 30). AR implementation: queries ar_transactions (available after Session 33). Both compare to GL control account balance. For this session, implement the GL side; subledger side returns placeholder with `{ subledgerBalance: 0, isReconciled: false, details: [{ message: 'AP module not yet available' }] }` until Sessions 30/33 wire them.

- **list-bank-accounts.ts** — for bank registry management + AP payment dropdowns
- **get-mapping-coverage.ts** — diagnostic query: for each sub-department, payment type, and tax group, show whether GL mappings exist. Returns `{ mapped: number, unmapped: number, details: [...] }`. Powers the "mapping coverage" dashboard card.

### Helpers

**resolve-mapping.ts:**

```typescript
export async function resolveSubDepartmentAccounts(tx, tenantId, subDepartmentId): Promise<SubDeptGL | null>
export async function resolvePaymentTypeAccounts(tx, tenantId, paymentTypeId): Promise<PaymentTypeGL | null>
export async function resolveTaxGroupAccount(tx, tenantId, taxGroupId): Promise<string | null>  // returns accountId
export async function logUnmappedEvent(tx, tenantId, params: UnmappedEventParams): Promise<void>
```

### API Routes (~22)

Under `apps/web/src/app/api/v1/accounting/`:

**Chart of Accounts:**
- `GET /accounts` — list (with optional balance)
- `POST /accounts` — create
- `GET /accounts/[id]` — get single
- `PATCH /accounts/[id]` — update

**Classifications:**
- `GET /classifications` — list
- `POST /classifications` — create
- `PATCH /classifications/[id]` — update

**Journal Entries:**
- `GET /journals` — list (paginated, filterable)
- `POST /journals` — create entry (manual posting)
- `GET /journals/[id]` — get with lines
- `POST /journals/[id]/post` — post draft
- `POST /journals/[id]/void` — void posted

**Mappings:**
- `GET /mappings/sub-departments` — list all
- `PUT /mappings/sub-departments/[subDepartmentId]` — save
- `GET /mappings/payment-types` — list all
- `PUT /mappings/payment-types/[paymentTypeId]` — save
- `GET /mappings/tax-groups` — list all
- `PUT /mappings/tax-groups/[taxGroupId]` — save
- `GET /mappings/coverage` — mapping coverage diagnostic

**Bank Accounts:**
- `GET /bank-accounts` — list
- `POST /bank-accounts` — create/update

**Reports:**
- `GET /reports/trial-balance`
- `GET /reports/detail`
- `GET /reports/summary`

**Settings & Diagnostics:**
- `GET /settings`
- `PATCH /settings`
- `POST /settings/lock-period`
- `GET /unmapped-events`
- `PATCH /unmapped-events/[id]/resolve`

**Reconciliation:**
- `GET /reconciliation/ap`
- `GET /reconciliation/ar`

**Bootstrap:**
- `POST /bootstrap` — initialize COA from template for tenant. Permission: `accounting.manage`.

Permissions: `accounting.view` for reads, `accounting.manage` for writes, `accounting.control_account.post` for manual control account entries.

### Tests (~30)

- Account CRUD with validation (unique accountNumber per tenant)
- Classification CRUD
- Mapping UPSERT and resolve (sub-dept, payment type, tax group)
- Mapping resolve returns null when missing
- logUnmappedEvent creates record
- Trial balance balances in controlled dataset
- Trial balance flags when out of balance
- GL detail running balance computation (window functions)
- GL summary groups by classification correctly
- Mapping coverage query counts correctly
- Unmapped events resolve workflow
- Bank account CRUD (only one default enforced)
- API route authorization (view vs manage permissions)

---

## Session 30 — AP Subledger: Schema + Bill Lifecycle

### Preamble
You are building the Accounts Payable module for OppsEra (Session 30). Read CONVENTIONS.md and CLAUDE.md first.

**CRITICAL: The `vendors` table ALREADY EXISTS (Milestone 11, Session 24). Do NOT recreate it. Add columns via ALTER TABLE. Existing vendor management commands/queries in inventory module remain untouched — AP references the same vendors.**

Module location: `packages/modules/ap/`
Package name: `@oppsera/module-ap`
Dependencies: `@oppsera/shared`, `@oppsera/db`, `@oppsera/core` (NEVER another module)

For GL posting: use AccountingPostingApi (internal read API from accounting module, singleton getter/setter in @oppsera/core/helpers/). This is how AP posts to GL without importing @oppsera/module-accounting directly.

Session 29 defined the AccountingPostingApi interface. This session uses it.

### Schema (packages/db/src/schema/ap.ts)

**Vendor table extensions** (ALTER TABLE in migration, Drizzle column additions):

- `vendorNumber` text nullable — unique per tenant where not null
- `defaultExpenseAccountId` text nullable → gl_accounts.id
- `defaultAPAccountId` text nullable → gl_accounts.id
- `paymentTermsId` text nullable → payment_terms.id
- `is1099Eligible` boolean NOT NULL default false

#### 14. payment_terms

- id, tenantId, name (e.g., "Net 30"), days int, discountPercent numeric(5,2) default '0', discountDays int default 0, isActive boolean default true, createdAt, updatedAt
- Unique: (tenantId, name)

#### 15. ap_bills

- `id`, `tenantId`, `vendorId` → vendors.id NOT NULL
- `billNumber` text NOT NULL
- `billDate` date NOT NULL, `dueDate` date NOT NULL
- `status` text NOT NULL — 'draft', 'posted', 'partial', 'paid', 'voided'
- `memo` text nullable
- `locationId` text nullable
- `currency` text NOT NULL default 'USD'
- `totalAmount` numeric(12,2) NOT NULL
- `amountPaid` numeric(12,2) NOT NULL default '0' — denormalized
- `balanceDue` numeric(12,2) NOT NULL — computed: totalAmount - amountPaid. Denormalized for aging queries.
- `glJournalEntryId` text nullable — link to GL entry on post
- `receivingReceiptId` text nullable — link to receipt if inventory bill
- `createdBy` text NOT NULL
- createdAt, updatedAt

Constraints: unique(tenantId, vendorId, billNumber) WHERE status != 'voided'
Indexes: (tenantId, status), (tenantId, vendorId), (tenantId, dueDate), (tenantId, status, dueDate) for aging

#### 16. ap_bill_lines

- `id`, `billId` → ap_bills.id NOT NULL
- `lineType` text NOT NULL default 'expense' — 'expense', 'inventory', 'asset', 'freight'
- `accountId` → gl_accounts.id NOT NULL — debit target
- `description` text nullable
- `quantity` numeric(12,4) default '1'
- `unitCost` numeric(12,4) default '0'
- `amount` numeric(12,2) NOT NULL
- `locationId` text nullable
- `departmentId` text nullable
- `inventoryItemId` text nullable — if lineType='inventory'
- `taxAmount` numeric(12,2) default '0'
- `sortOrder` int default 0

The lineType field drives posting behavior and reporting:
- `expense` → debits expense account
- `inventory` → debits inventory asset account, updates inventory costing
- `asset` → debits fixed asset account (capital purchase tracking)
- `freight` → posts as freight expense OR allocates to inventory lines (landed cost)

#### 17. ap_payments

- `id`, `tenantId`, `vendorId` → vendors.id NOT NULL
- `paymentDate` date NOT NULL
- `paymentMethod` text nullable — 'check', 'ach', 'wire', 'card', 'cash'
- `bankAccountId` text nullable → bank_accounts.id — which bank pays
- `referenceNumber` text nullable — check number, ACH ref
- `amount` numeric(12,2) NOT NULL
- `currency` text NOT NULL default 'USD'
- `status` text NOT NULL — 'draft', 'posted', 'voided'
- `glJournalEntryId` text nullable
- `memo` text nullable
- `createdBy` text NOT NULL
- createdAt, updatedAt

#### 18. ap_payment_allocations

- Composite PK: (paymentId, billId)
- `paymentId` → ap_payments.id NOT NULL
- `billId` → ap_bills.id NOT NULL
- `amountApplied` numeric(12,2) NOT NULL
- `createdAt` defaultNow()

### AccountingPostingApi — Define in @oppsera/core

```typescript
// packages/core/src/helpers/accounting-posting-api.ts
export interface PostJournalEntryInput {
  tenantId: string;
  businessDate: string;
  sourceModule: string;
  sourceReferenceId: string;
  memo: string;
  currency?: string;
  lines: Array<{
    accountId: string;
    debitAmount?: string;  // numeric string
    creditAmount?: string;
    locationId?: string;
    departmentId?: string;
    customerId?: string;
    vendorId?: string;
    memo?: string;
  }>;
  forcePost?: boolean;
}

export interface AccountingPostingApi {
  postEntry(ctx: RequestContext, input: PostJournalEntryInput): Promise<{ id: string; journalNumber: number; status: string }>;
  getAccountBalance(tenantId: string, accountId: string, asOfDate?: string): Promise<number>;
  getSettings(tenantId: string): Promise<{ defaultAPControlAccountId: string | null; defaultARControlAccountId: string | null; baseCurrency: string }>;
}

let _api: AccountingPostingApi | null = null;
export function getAccountingPostingApi(): AccountingPostingApi { if (!_api) throw new Error('AccountingPostingApi not initialized'); return _api; }
export function setAccountingPostingApi(api: AccountingPostingApi): void { _api = api; }
```

### Commands

- **create-bill.ts** — create bill in DRAFT with lines. Validates: sum(lines.amount + lines.taxAmount) === totalAmount. Vendor must exist and be active. billNumber unique per vendor (partial index).
- **update-bill.ts** — update draft only. Posted → ImmutableEntryError.
- **post-bill.ts** — the money command:

```
GL Entry:
  For each bill line:
    Debit: line.accountId (expense/inventory/asset account) — line.amount
  For tax amounts:
    Debit: tax expense or include in line amount (depending on tax setup)
  Credit: AP control account — bill.totalAmount
    (uses vendor.defaultAPAccountId ?? settings.defaultAPControlAccountId)

sourceModule: 'ap'
sourceReferenceId: bill.id
```

Validates: AP control account must exist, all line accounts must exist and be active. Sets status='posted', links glJournalEntryId. Idempotent via sourceReferenceId unique index.

- **void-bill.ts** — voids GL entry via AccountingPostingApi.postEntry (reversal), sets bill status='voided'. Only if no payments allocated.
- **create-payment-terms.ts**
- **update-payment-terms.ts**
- **update-vendor-accounting.ts** — updates the new accounting columns on vendors table (defaultExpenseAccountId, defaultAPAccountId, paymentTermsId, is1099Eligible, vendorNumber). Validates account references exist.
- **create-bill-from-receipt.ts** — creates a bill pre-populated from a receiving receipt. Links receivingReceiptId. Maps receipt lines to bill lines: inventory items → lineType='inventory', shipping → lineType='freight'. Vendor and amounts come from receipt.

### Queries

- **list-bills.ts** — cursor-paginated, filter by vendor, status, dateRange, location, overdue (dueDate < today and status in posted/partial)
- **get-bill.ts** — single bill with lines, payment allocations, vendor name, GL entry link
- **list-payment-terms.ts**
- **get-vendor-accounting.ts** — vendor with accounting fields + computed: openBillCount, totalBalance, overdueBalance
- **get-ap-aging.ts** — aging buckets by vendor: Current (not yet due), 1-30, 31-60, 61-90, 90+ days past due. Uses dueDate not billDate. Totals row.

### Migration
`0068_accounts_payable.sql`:

- All 5 new tables + RLS
- ALTER TABLE vendors ADD COLUMN for each new column
- Partial unique index on ap_bills(tenantId, vendorId, billNumber) WHERE status != 'voided'

### Events

- `ap.bill.posted.v1` — { billId, vendorId, vendorName, totalAmount, billNumber, businessDate, glJournalEntryId, lineCount }
- `ap.bill.voided.v1` — { billId, vendorId, totalAmount, reason }

### Tests (~25)

- Bill CRUD lifecycle (draft → post → void)
- Post bill creates correct GL entry (debit expense, credit AP control)
- Post bill with inventory lines uses correct debit account per lineType
- Post bill with mixed line types (expense + inventory + freight)
- Void bill creates GL reversal
- Void bill with allocated payments → rejected
- Posted bill cannot be edited (ImmutableEntryError)
- Duplicate bill detection (same vendor + billNumber)
- Bill total must equal sum of lines
- Missing AP control account → MissingMappingError + gl_unmapped_events
- Vendor accounting fields CRUD
- AP aging buckets computed correctly (current vs overdue)
- Create bill from receipt maps correctly
- Idempotent: posting same bill twice returns existing GL entry

---

## Session 31 — AP Payments + Credits + AP Reports + Landed Cost

### Preamble
You are continuing the AP module (Session 31). Session 30 built the schema and bill lifecycle. This session adds:
1. Payment commands (create, allocate, post, void)
2. Vendor credits (negative bills, applied against open bills)
3. All AP reporting queries
4. Landed cost allocation for inventory bills
5. All AP API routes

### Schema Addition

#### 19. ap_bill_landed_cost_allocations — for freight distribution to inventory lines

- `id` text PK
- `billId` → ap_bills.id NOT NULL
- `freightLineId` → ap_bill_lines.id NOT NULL — the freight line being allocated
- `inventoryLineId` → ap_bill_lines.id NOT NULL — the inventory line receiving cost
- `allocatedAmount` numeric(12,2) NOT NULL
- `createdAt` defaultNow()

Index: (billId). Used when posting inventory bills to increase the debit to inventory asset by the allocated freight amount.

### Commands

- **create-payment.ts** — create payment in DRAFT with allocations

  Input: vendorId, paymentDate, paymentMethod, bankAccountId, amount, allocations: [{billId, amountApplied}], memo
  Validates: sum(allocations.amountApplied) <= payment.amount. Each bill must belong to same vendor. Each allocation <= bill.balanceDue. Overpayment (payment.amount > sum(allocations)) is allowed — unapplied amount tracked.

- **post-payment.ts** — post to GL:

```
GL Entry:
  Debit: AP control account — payment.amount
  Credit: Bank/Cash account — payment.amount
    (from bankAccountId → bank_accounts.glAccountId, or settings.defaultUndepositedFundsAccountId, or vendor payment defaults)

sourceModule: 'ap'
sourceReferenceId: payment.id
```

After GL post: update each allocated bill's amountPaid and balanceDue. Set bill status to 'partial' (if balanceDue > 0) or 'paid' (if balanceDue === 0). Payment status → 'posted'.

- **void-payment.ts** — reverse GL entry, reverse bill allocations (restore balanceDue), set bill statuses back. Payment status → 'voided'.
- **allocate-payment.ts** — re-allocate draft payment across different bills
- **create-vendor-credit.ts** — creates an ap_bills row with negative totalAmount and status='posted'. GL: Debit AP control, Credit expense/inventory account (returning the original charge). The credit shows up in the vendor ledger and can be applied against future bills.
- **apply-vendor-credit.ts** — applies a credit (negative bill) against an open bill. Creates allocation entries. Reduces bill.balanceDue.
- **allocate-landed-cost.ts** — for a posted inventory bill, allocate freight line amounts across inventory lines. Creates ap_bill_landed_cost_allocations. Optionally posts an adjusting GL entry (Debit Inventory Asset, Credit Freight Expense) to move freight from expense into inventory value. Uses the same allocation algorithm as receiving shipping allocation (by cost, proportional with remainder distribution).

### Queries (AP Reports)

- **get-vendor-ledger.ts** — unified timeline for a vendor: bills, payments, credits in date order. Shows running balance.
- **get-open-bills.ts** — open bills (status in posted/partial) with aging, sortable by dueDate. For payment batch planning.
- **get-payment-history.ts** — payments with allocations, filterable by vendor/dateRange/paymentMethod
- **get-expense-by-vendor.ts** — total expenses by vendor for date range, broken down by GL account (from posted bill lines). Useful for spend analysis.
- **get-cash-requirements.ts** — forecast: open bills grouped by due week/month, with running total. "You need $X by next Friday."
- **get-1099-report.ts** — vendors where is1099Eligible=true, total posted payments for calendar year. Grouped by vendor with TIN. Export-ready.
- **get-asset-purchases.ts** — bill lines where lineType='asset', grouped by account/period. "What capital purchases did we make this quarter?"

### API Routes (~12)

Under `apps/web/src/app/api/v1/ap/`:

**Bills:**
- `GET /bills` — list
- `POST /bills` — create
- `GET /bills/[id]` — get with lines + allocations
- `PATCH /bills/[id]` — update draft
- `POST /bills/[id]/post` — post
- `POST /bills/[id]/void` — void

**Payments:**
- `GET /payments` — list
- `POST /payments` — create with allocations
- `GET /payments/[id]` — get with allocations
- `POST /payments/[id]/post` — post
- `POST /payments/[id]/void` — void

**Vendor Credits:**
- `POST /credits` — create vendor credit
- `POST /credits/apply` — apply credit to bill

**Reports:**
- `GET /reports/aging`
- `GET /reports/vendor-ledger/[vendorId]`
- `GET /reports/open-bills`
- `GET /reports/cash-requirements`
- `GET /reports/1099`
- `GET /reports/expense-by-vendor`
- `GET /reports/asset-purchases`

**Payment Terms:**
- `GET /payment-terms`
- `POST /payment-terms`

**Vendor Accounting:**
- `GET /vendors/[id]/accounting` — vendor with accounting fields
- `PATCH /vendors/[id]/accounting` — update accounting fields

### Tests (~25)

- Payment posts correct GL (debit AP control, credit bank)
- Partial payment: bill status → 'partial', balanceDue updated
- Full payment: bill status → 'paid', balanceDue = 0
- Multi-bill payment allocates correctly across bills
- Overpayment: unapplied amount tracked
- Void payment: GL reversed, bill amounts restored, bill status reverted
- Vendor credit: creates negative bill, correct GL entry
- Apply credit: reduces bill balanceDue
- AP aging buckets correct (current + 4 aging buckets)
- 1099 report: only eligible vendors, correct annual totals
- Cash requirements: only open unpaid bills, grouped by period
- Asset purchases: only lineType='asset' lines
- Landed cost allocation: freight distributed proportionally to inventory lines
- Landed cost: adjusting GL entry moves freight from expense to inventory

---

## Session 32 — Integration: Bridge Adapters + POS Posting + Bootstrap + E2E Tests

### Preamble
You are completing the Accounting + AP integration for OppsEra (Session 32). This session:
1. Creates bridge adapter to read existing payment_journal_entries into GL
2. Creates POS posting adapter (event consumer for tender.recorded.v1)
3. Wires AccountingPostingApi singleton in web app bootstrap
4. Implements bootstrap-tenant-coa for onboarding
5. Wires reconciliation queries to real AP data
6. Creates accounting docs
7. Runs comprehensive end-to-end integration tests

This session does NOT change existing POS/Payments flow. Adapters are enabled per-tenant via accounting_settings.

### Posting Adapters (packages/modules/accounting/src/adapters/)

#### 1. pos-posting-adapter.ts — event consumer for tender.recorded.v1

When a tender is recorded and accounting is enabled for the tenant:

- Resolves payment type → GL accounts via payment_type_gl_defaults
- Resolves each line item's subdepartment → GL accounts via sub_department_gl_defaults
- Resolves tax groups → GL accounts via tax_group_gl_defaults

```
GL Entry (Retail Sale):
  Debit: Cash/Card/Undeposited Funds (from payment type) — tender amount
  Credit: Revenue accounts (from subdepartment, one line per department) — line amounts
  Credit: Sales Tax Payable (from tax group) — tax amounts
  If enableCogsPosting:
    Debit: COGS account (from subdepartment) — cost amounts
    Credit: Inventory Asset (from subdepartment) — cost amounts

sourceModule: 'pos'
sourceReferenceId: tender.id
```

- Posts via `getAccountingPostingApi().postEntry()`
- Idempotent via unique index on (tenantId, sourceModule, sourceReferenceId)
- Logs unmapped events for any missing mappings, does NOT block the tender (POS must always succeed)
- If any required mapping is missing: skip GL posting, log unmapped event, emit `accounting.posting.skipped.v1` event

#### 2. legacy-bridge-adapter.ts — one-time migration script

Reads existing payment_journal_entries and creates proper gl_journal_entries:

- Maps JSONB entries column to gl_journal_lines (each entry becomes debit or credit line)
- sourceModule: 'pos_legacy', sourceReferenceId: payment_journal_entry.id
- Processes in batches (100 at a time) to avoid long transactions
- Idempotent via unique index
- Reports: total processed, skipped (already migrated), failed (missing accounts)
- Run via CLI script: `pnpm run accounting:migrate-legacy`

### Schema Addition

#### 20. accounting_close_periods — lightweight month-end close tracking

- `id` text PK
- `tenantId` text NOT NULL
- `postingPeriod` text NOT NULL — 'YYYY-MM'
- `status` text NOT NULL — 'open', 'in_review', 'closed'
- `checklist` jsonb NOT NULL default '{}' — tracks which close steps are complete
- `closedAt` timestamptz nullable
- `closedBy` text nullable
- `notes` text nullable
- createdAt, updatedAt

Unique: (tenantId, postingPeriod)

### Commands

- **bootstrap-tenant-accounting.ts** — called during onboarding or manually
  - Copies gl_account_templates + gl_classification_templates for the tenant's business type (golf, retail, restaurant, hybrid)
  - Creates accounting_settings row with sensible defaults
  - Creates empty mapping rows that surface as "needs configuration" in the UI

- **update-close-period.ts** — update close status + checklist
- **close-accounting-period.ts** — sets period to 'closed', locks it via lockPeriodThrough

### Queries

- **get-close-checklist.ts** — for a period, returns:

```typescript
interface CloseChecklist {
  period: string;
  status: 'open' | 'in_review' | 'closed';
  items: {
    label: string;
    status: 'pass' | 'fail' | 'warning';
    detail?: string;
  }[];
}
```

Checks:
- Open draft journal entries (should be 0)
- Unresolved unmapped events (should be 0)
- AP subledger reconciled to GL (difference should be 0)
- AR subledger reconciled to GL (difference should be 0)
- Trial balance in balance
- Negative inventory items (if inventory posting enabled)

- **list-close-periods.ts** — status of all periods
- **get-reconciliation-ap.ts** — now wired to real AP data:
  - AP subledger = SUM(ap_bills.totalAmount WHERE status IN ('posted','partial')) - SUM(ap_payments.amount WHERE status='posted')
  - GL AP = account balance of AP control account

### Wiring (apps/web/src/lib/accounting-bootstrap.ts)

```typescript
import { setAccountingPostingApi } from '@oppsera/core/helpers/accounting-posting-api';
import { postJournalEntry, getAccountBalances, getAccountingSettings } from '@oppsera/module-accounting';

setAccountingPostingApi({
  postEntry: postJournalEntry,
  getAccountBalance: async (tenantId, accountId, asOfDate) => {
    const balances = await getAccountBalances({ tenantId, accountIds: [accountId], asOfDate });
    return balances[0]?.balance ?? 0;
  },
  getSettings: async (tenantId) => {
    const settings = await getAccountingSettings({ tenantId });
    return {
      defaultAPControlAccountId: settings?.defaultAPControlAccountId ?? null,
      defaultARControlAccountId: settings?.defaultARControlAccountId ?? null,
      baseCurrency: settings?.baseCurrency ?? 'USD',
    };
  },
});
```

Called in `apps/web/src/instrumentation.ts` alongside existing bootstrap code.

### Documentation — docs/accounting.md

- **Double-Entry GL** — how journals work, debit/credit rules, normal balances
- **Chart of Accounts** — structure, classifications, templates, control accounts
- **How AP Posts to GL** — bill (Dr Expense, Cr AP), payment (Dr AP, Cr Bank), credit (Dr AP, Cr Expense)
- **How AR Posts to GL** — invoice (Dr AR, Cr Revenue+Tax), receipt (Dr Cash, Cr AR)
- **How POS Posts to GL** — adapter flow, mapping resolution, unmapped event handling
- **Reconciliation** — AP/AR subledger must equal GL control account balance
- **Period Locking + Close Workflow** — lock prevents posting, close checklist, close status
- **Missing Mapping Diagnostics** — unmapped events table, coverage report, resolution workflow
- **Undeposited Funds Workflow** — optional: POS → Undeposited Funds → Bank Deposit journal
- **Multi-Currency** — not yet supported, locked to USD, currency column present for future
- **Future Modules** — AR subledger (Session 33), financial statements (Session 34), payroll, fixed assets, bank reconciliation

### API Routes (~6)

- `POST /accounting/bootstrap` — initialize tenant COA
- `GET /accounting/close-periods` — list
- `GET /accounting/close-periods/[period]` — get with checklist
- `PATCH /accounting/close-periods/[period]` — update status
- `POST /accounting/close-periods/[period]/close` — close + lock
- `GET /accounting/reconciliation/ap` — now wired to real data

### Tests (~25)

- E2E: Full AP cycle — create vendor → create bill → post bill → verify GL → pay bill → verify GL → AP aging shows $0 → reconciliation balanced
- E2E: Vendor credit cycle — create credit → apply to bill → verify GL → balanceDue reduced
- Reconciliation: after bill + payment, AP subledger balance === GL AP control balance
- POS adapter: mock tender.recorded.v1 → correct GL entries created (revenue + tax + optional COGS)
- POS adapter with undeposited funds: enableUndepositedFundsWorkflow=true → posts to Undeposited Funds, not bank
- Missing mapping: POS adapter with unmapped subdepartment → gl_unmapped_events created, posting skipped
- Missing mapping: POS adapter with unmapped tax group → gl_unmapped_events for tax
- Legacy bridge: payment_journal_entry → gl_journal_entry created correctly
- Legacy bridge: idempotent — running twice doesn't double-post
- Trial balance: after mixed postings (AP bills + POS tenders + manual), total debits === total credits
- GL detail report: running balance correct across multi-account, multi-date entries
- Close checklist: open drafts → fail, no drafts → pass
- Close checklist: unreconciled AP → fail
- Close checklist: unmapped events → fail
- Period lock via close: closing locks the period, future posting rejected
- Bootstrap: creates COA from template with correct control accounts
- Bootstrap: creates empty mappings surfaceable in UI
- Currency mismatch: AP bill with non-USD currency → rejected

---

## Session 33 — AR v0: Invoices + Receipts + Reconciliation

### Preamble
You are building the Accounts Receivable v0 module for OppsEra (Session 33). Read CONVENTIONS.md and CLAUDE.md first.

**CRITICAL CONTEXT:** Session 16 already built operational AR for house accounts / membership billing:
- `ar_transactions` — charges, payments, credit_memos, writeoffs (append-only)
- `ar_allocations` — FIFO payment allocation
- `billing_accounts` — customer billing with credit limits

This session creates a proper AR subledger that BRIDGES from the existing ar_transactions into GL control accounts. NOT a parallel system — an accounting layer ON TOP of the existing operational data.

**The bridge approach:**
- Existing ar_transactions continue to work (POS charges, payments via tender.recorded.v1)
- New AR posting adapter reads ar_transactions and posts journal entries to GL
- AR reconciliation compares ar_transactions totals to GL AR control account
- New AR-native invoices (for non-POS scenarios like membership billing, event deposits) post through both ar_transactions AND GL

Module location: `packages/modules/ar/`
Package name: `@oppsera/module-ar`
Dependencies: `@oppsera/shared`, `@oppsera/db`, `@oppsera/core`
Uses: AccountingPostingApi from `@oppsera/core/helpers/`

### Schema (packages/db/src/schema/ar.ts)

#### 21. ar_invoices — formal invoices (membership billing, event deposits, manual charges)

- `id` text PK
- `tenantId` text NOT NULL
- `customerId` text NOT NULL → customers.id
- `billingAccountId` text nullable → billing_accounts.id
- `invoiceNumber` text NOT NULL — sequential per tenant
- `invoiceDate` date NOT NULL
- `dueDate` date NOT NULL
- `status` text NOT NULL — 'draft', 'posted', 'partial', 'paid', 'voided'
- `memo` text nullable
- `locationId` text nullable
- `currency` text NOT NULL default 'USD'
- `totalAmount` numeric(12,2) NOT NULL
- `amountPaid` numeric(12,2) NOT NULL default '0'
- `balanceDue` numeric(12,2) NOT NULL
- `glJournalEntryId` text nullable
- `sourceType` text NOT NULL — 'manual', 'membership', 'event', 'pos_house_account'
- `sourceReferenceId` text nullable — membership ID, event ID, etc.
- `createdBy` text NOT NULL
- createdAt, updatedAt

Unique: (tenantId, invoiceNumber)
Indexes: (tenantId, customerId), (tenantId, status), (tenantId, dueDate)

#### 22. ar_invoice_lines

- `id`, `invoiceId` → ar_invoices.id NOT NULL
- `accountId` → gl_accounts.id NOT NULL — revenue/deferred revenue account to credit
- `description` text NOT NULL
- `quantity` numeric(12,4) default '1'
- `unitPrice` numeric(12,4) default '0'
- `amount` numeric(12,2) NOT NULL
- `taxGroupId` text nullable
- `taxAmount` numeric(12,2) default '0'
- `sortOrder` int default 0

#### 23. ar_receipts — customer payments against invoices

- `id` text PK
- `tenantId` text NOT NULL
- `customerId` text NOT NULL
- `receiptDate` date NOT NULL
- `paymentMethod` text nullable
- `referenceNumber` text nullable
- `amount` numeric(12,2) NOT NULL
- `currency` text NOT NULL default 'USD'
- `status` text NOT NULL — 'draft', 'posted', 'voided'
- `glJournalEntryId` text nullable
- `sourceType` text NOT NULL — 'manual', 'pos_tender', 'online_payment'
- `sourceReferenceId` text nullable — tender ID, payment gateway ref
- `createdBy` text NOT NULL
- createdAt, updatedAt

#### 24. ar_receipt_allocations

- Composite PK: (receiptId, invoiceId)
- `receiptId` → ar_receipts.id NOT NULL
- `invoiceId` → ar_invoices.id NOT NULL
- `amountApplied` numeric(12,2) NOT NULL
- `createdAt` defaultNow()

### Migration
`0069_accounts_receivable.sql` — 4 new tables + RLS + indexes + ar_invoice_number_counters

### Commands

- **create-invoice.ts** — create AR invoice in DRAFT
- **post-invoice.ts** — post to GL:

```
GL Entry:
  Debit: AR control account — invoice.totalAmount
  Credit: Revenue accounts (from invoice lines) — line amounts
  Credit: Sales Tax Payable (from tax group mapping) — tax amounts

sourceModule: 'ar'
sourceReferenceId: invoice.id
```

- **void-invoice.ts** — reverse GL, void invoice
- **create-receipt.ts** — create receipt with allocations
- **post-receipt.ts** — post to GL:

```
GL Entry:
  Debit: Cash/Bank account — receipt.amount
  Credit: AR control account — receipt.amount

sourceModule: 'ar'
sourceReferenceId: receipt.id
```

Updates allocated invoice amountPaid/balanceDue/status.

- **void-receipt.ts** — reverse GL, reverse invoice allocations
- **bridge-ar-transaction.ts** — takes an existing ar_transactions row and creates the corresponding ar_invoices/ar_receipts + GL entries. For bridging existing house account activity into GL. Idempotent via sourceReferenceId.

### Queries

- **get-ar-aging.ts** — aging buckets by customer: Current, 1-30, 31-60, 61-90, 90+. Based on invoice dueDate.
- **get-customer-ledger.ts** — invoices, receipts, credits for a customer in date order with running balance.
- **get-open-invoices.ts** — open invoices filterable by customer, date, location, overdue
- **list-invoices.ts** — cursor-paginated with filters
- **get-reconciliation-ar.ts** — AR subledger balance vs GL AR control account:
  - AR subledger = SUM(ar_invoices.totalAmount WHERE status IN ('posted','partial')) - SUM(ar_receipts.amount WHERE status='posted')
  - GL AR = balance of AR control account from gl_journal_lines

### AR Posting Adapter (Event Consumer)

**ar-posting-adapter.ts** — listens for:

- `order.placed.v1` (where customer has billing account → house account charge): creates ar_invoices entry + GL
- `tender.recorded.v1` (where tender is for a house account): creates ar_receipts entry + GL

This bridges the existing operational AR into the accounting GL without changing the POS flow.

### API Routes (~12)

Under `apps/web/src/app/api/v1/ar/`:

- `GET /invoices`, `POST /invoices`, `GET /invoices/[id]`, `PATCH /invoices/[id]`
- `POST /invoices/[id]/post`, `POST /invoices/[id]/void`
- `GET /receipts`, `POST /receipts`, `POST /receipts/[id]/post`, `POST /receipts/[id]/void`
- `GET /reports/aging`, `GET /reports/customer-ledger/[customerId]`, `GET /reports/open-invoices`
- `GET /accounting/reconciliation/ar` (update existing stub to real implementation)

### Tests (~20)

- Invoice post creates correct GL (Dr AR, Cr Revenue + Tax)
- Receipt post creates correct GL (Dr Cash, Cr AR)
- Partial payment: invoice status → 'partial'
- Full payment: invoice status → 'paid'
- Void invoice reverses GL
- Void receipt reverses GL + restores invoice balance
- AR aging buckets correct
- AR reconciliation: subledger === GL control
- Bridge adapter: existing ar_transaction → creates invoice + GL
- Bridge adapter: idempotent
- Customer ledger: correct running balance

---

## Session 34 — Financial Statements + Close Workflow + Sales Tax Report

### Preamble
You are building financial statement generation for OppsEra (Session 34). This session adds:
1. Profit & Loss statement (date range)
2. Balance Sheet (as-of date with retained earnings)
3. Sales Tax Liability report (by tax group/period)
4. Close workflow finalization
5. Financial statement export

All data comes from the GL (trial balance + classifications). No new modules — this builds on accounting module queries.

### Schema Addition

#### 25. financial_statement_layouts — configurable statement structure

- `id` text PK
- `tenantId` text NOT NULL
- `statementType` text NOT NULL — 'profit_loss', 'balance_sheet'
- `name` text NOT NULL
- `sections` jsonb NOT NULL — ordered array of { label, classificationIds[], accountIds[], subtotalLabel?, isTotal? }
- `isDefault` boolean default false
- createdAt, updatedAt

Unique: (tenantId, statementType, name). Allows tenants to customize how classifications roll up into statement sections. Default layouts created during bootstrap.

#### 26. financial_statement_layout_templates — system seed data (no tenantId)

- id, templateKey, statementType, name, sections jsonb, sortOrder

### Migration
`0070_financial_statements.sql` — 2 tables + seed default layouts for P&L and Balance Sheet

### Commands

- **save-statement-layout.ts** — create/update statement layout
- **generate-retained-earnings.ts** — for year-end close: Computes: Revenue - Expenses for the fiscal year, creates a journal entry to move the net into Retained Earnings account. This is run as part of year-end close.
- **complete-period-close.ts** — enhanced from Session 32:
  - Validates all checklist items pass
  - Sets period status to 'closed'
  - Updates lockPeriodThrough
  - If fiscal year-end: prompts for retained earnings roll-forward

### Queries

#### 1. get-profit-and-loss.ts

```typescript
interface ProfitAndLoss {
  period: { from: string; to: string };
  locationId?: string;
  sections: Array<{
    label: string;
    accounts: Array<{ accountNumber: string; name: string; amount: number }>;
    subtotal: number;
  }>;
  totalRevenue: number;
  totalExpenses: number;
  netIncome: number;  // totalRevenue - totalExpenses
}
```

- Pulls from GL: revenue and expense account balances for date range
- Groups by statement layout sections (or default classification grouping)
- Location-filterable
- Comparative: optionally includes prior period for side-by-side

#### 2. get-balance-sheet.ts

```typescript
interface BalanceSheet {
  asOfDate: string;
  locationId?: string;
  assets: Section[];
  liabilities: Section[];
  equity: Section[];  // includes retained earnings
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
  isBalanced: boolean;  // totalAssets === totalLiabilities + totalEquity
}
```

- Asset/Liability/Equity account balances as of date
- Retained earnings = defaultRetainedEarningsAccountId balance + (current fiscal year revenue - expenses if year not yet closed)
- MUST balance (A = L + E). If not, flag error.

#### 3. get-sales-tax-liability.ts

```typescript
interface SalesTaxLiability {
  period: { from: string; to: string };
  taxGroups: Array<{
    taxGroupId: string;
    taxGroupName: string;
    jurisdiction?: string;
    rate?: number;
    taxCollected: number;     // credits to tax payable accounts
    taxRemitted: number;      // debits to tax payable accounts (payments to tax authority)
    netLiability: number;     // collected - remitted
  }>;
  totalCollected: number;
  totalRemitted: number;
  totalNetLiability: number;
}
```

- Pulls from GL: tax payable account balances broken down by tax group (via tax_group_gl_defaults mapping)
- Period-filterable
- Shows what you owe to each tax authority

#### 4. get-cash-flow-simplified.ts — v1 simplified cash flow

```
Operating Activities:
  Net Income (from P&L)
  + Change in AP (AP balance end - AP balance start)
  - Change in AR (AR balance end - AR balance start)
  + Change in Inventory (if inventory posting enabled)
  = Net Operating Cash Flow

Investing Activities: (stub — asset purchases from AP)
Financing Activities: (stub)
```

Not a full cash flow statement, but enough to answer "where did the cash go?"

#### 5. get-period-comparison.ts — compare two periods (P&L month-over-month, year-over-year)

Returns each account with current period amount, prior period amount, and variance ($ and %).

#### 6. get-financial-health-summary.ts — dashboard-level KPIs

- Net Income (current month + YTD)
- Working Capital (Current Assets - Current Liabilities)
- AP Balance (open)
- AR Balance (open)
- Cash Balance
- Undeposited Funds (if workflow enabled)
- Trial Balance status (balanced/unbalanced)
- Unmapped events count

### API Routes (~8)

Under `apps/web/src/app/api/v1/accounting/`:

- `GET /statements/profit-loss`
- `GET /statements/balance-sheet`
- `GET /statements/cash-flow`
- `GET /statements/comparison`
- `GET /reports/sales-tax-liability`
- `GET /statements/health-summary`
- `GET /statement-layouts` — list layouts
- `POST /statement-layouts` — save layout

### Tests (~20)

- P&L: revenue - expenses = net income
- P&L: location filter scopes correctly
- P&L: comparative shows two periods
- Balance Sheet: A = L + E
- Balance Sheet: retained earnings includes current year net income
- Balance Sheet: flags when unbalanced
- Sales Tax: collected - remitted = net liability
- Sales Tax: groups by tax group correctly
- Cash flow: change in AP/AR computed correctly
- Period comparison: variance computed correctly
- Health summary: all KPIs present and accurate
- Retained earnings generation: creates correct journal entry
- Statement layout: custom sections group accounts correctly

---

## Post-Build: CONVENTIONS.md + CLAUDE.md Updates

### New Gotchas to Add

- **GL amounts are NUMERIC(12,2) in dollars** — NOT cents. Different from orders layer (INTEGER cents). Convert at boundaries: `Number(amount)` for GL, `Math.round(parseFloat(price) * 100)` for orders.
- **Never write GL tables directly** — always use `postJournalEntry()`. The unique index on (tenantId, sourceModule, sourceReferenceId) enforces idempotent posting from adapters.
- **Posted journal entries are immutable** — void + create reversal. Never UPDATE a posted entry's amounts or accounts.
- **AP/AR post to GL via AccountingPostingApi** — singleton in @oppsera/core/helpers/. Never import @oppsera/module-accounting from another module.
- **Currency is locked to USD** — all tables have currency column defaulting to 'USD'. Posting engine rejects non-USD. Multi-currency is a future feature.
- **Control accounts restrict posting by sourceModule** — controlAccountType on gl_accounts limits which modules can post. Manual entries to control accounts require `accounting.control_account.post` permission.
- **POS adapter never blocks tenders** — if GL mapping is missing, skip the GL post and log to gl_unmapped_events. POS must always succeed.
- **AP denormalizes balanceDue** — ap_bills.balanceDue is kept in sync by payment posting. Never compute it from allocations in hot paths — use the denormalized column.
- **AR bridges existing ar_transactions** — the AR module reads from existing operational AR tables and posts to GL. It does NOT replace the existing POS house account flow.
- **Retained earnings is semi-automatic** — current-year P&L is added to the stored retained earnings balance for the balance sheet. Year-end close creates the formal journal entry.
- **Close checklist is query-based** — checklist items are computed live (open drafts, unreconciled subledgers, unmapped events), not stored. Only the period status and notes are persisted.

### Module Table Update

| Module | Package | Version | Status |
|--------|---------|---------|--------|
| Accounting Core (GL, COA, posting, reports, statements) | accounting | V1 | Done |
| Accounts Payable (bills, payments, vendors, aging) | ap | V1 | Done |
| Accounts Receivable v0 (invoices, receipts, aging) | ar | V1 | Done |

### What's Next After These Sessions

- Accounting frontend (COA management, journal browser, mapping UI, report viewers, statement viewers)
- AP frontend (bill entry, payment batch, aging dashboard, vendor ledger)
- AR frontend (invoice entry, receipt entry, aging dashboard, customer ledger)
- AP approval workflow (Session 35 — Draft → Pending Approval → Approved → Posted)
- Bank reconciliation module (match bank feeds to GL entries)
- Fixed assets module (depreciation schedules, asset register)
- Payroll posting adapter
- Multi-currency support
- Budget vs actuals reporting

---

## Seed Data: Default COA Templates

### Golf Course Default (templateKey: 'golf_default')

**Assets (1000-1999):** 1010 Cash on Hand, 1020 Operating Checking, 1030 Payroll Checking, 1050 Undeposited Funds, 1100 Accounts Receivable (control), 1150 Member Receivables, 1200 Inventory - Pro Shop, 1210 Inventory - F&B, 1220 Inventory - Course Maintenance, 1300 Prepaid Expenses, 1500 Golf Carts, 1510 Course Equipment, 1520 Clubhouse & Improvements, 1530 Accumulated Depreciation

**Liabilities (2000-2999):** 2000 Accounts Payable (control), 2100 Sales Tax Payable (control), 2150 Payroll Taxes Payable, 2200 Gift Card Liability, 2300 Deferred Revenue - Memberships, 2310 Deferred Revenue - Event Deposits, 2400 Accrued Expenses

**Equity (3000-3999):** 3000 Retained Earnings, 3100 Owner's Equity/Capital

**Revenue (4000-4999):** 4010 Green Fees Revenue, 4020 Cart Rental Revenue, 4030 Pro Shop Sales, 4040 F&B Sales, 4050 Membership Dues, 4060 Event Revenue, 4070 Driving Range Revenue, 4080 Lesson Revenue, 4090 Other Revenue, 4100 Discounts Given (contra)

**COGS (5000-5499):** 5010 Pro Shop COGS, 5020 F&B COGS, 5030 Course Maintenance Supplies

**Expenses (6000-6999):** 6010 Payroll - Golf Operations, 6020 Payroll - Pro Shop, 6030 Payroll - F&B, 6040 Payroll - Maintenance, 6050 Course Maintenance, 6060 Equipment Repair, 6070 Utilities, 6080 Insurance, 6090 Marketing, 6100 Credit Card Processing Fees, 6110 Office & Admin, 6120 Professional Services, 6130 Rent/Lease, 6140 Depreciation

**System:** 9999 Rounding/Reconciliation

Similar templates for retail_default, restaurant_default, hybrid_default with industry-appropriate accounts.
