# Accounting Structural Fixes — Implementation Plan

> Generated 2026-03-03 after two-pass financial audit.
> All code-level bugs (P0–P2) have been fixed. This document covers **structural gaps** requiring design work.

---

## Priority Legend

| Tag | Meaning | Timeline |
|-----|---------|----------|
| **S0** | Balance sheet is wrong today | Next sprint |
| **S1** | Workflow breaks under normal conditions | Next 2 sprints |
| **S2** | Feature gap, operators can workaround | Next quarter |

---

## 1. Membership Deferred Revenue — No Recognition Pass [S0]

### Problem
`membership-posting-adapter.ts` posts `Dr AR / Cr Deferred Revenue` at billing time. No subsequent command amortizes deferred revenue to earned revenue. The balance sheet permanently overstates deferred revenue and understates earned revenue.

### Impact
Any tenant with recurring membership billing has incorrect revenue recognition. Financial statements are materially misstated from Day 1 of membership charges.

### Proposed Fix

**New command:** `packages/modules/accounting/src/commands/recognize-deferred-revenue.ts`

```
recognize-deferred-revenue(ctx, { throughDate })
  1. Query all gl_journal_lines hitting deferred revenue accounts
     WHERE source_module = 'membership' AND business_date <= throughDate
  2. For each membership billing entry, compute the earned portion:
     earnedPct = min(1, daysSinceBillingStart / billingPeriodDays)
     earnedAmount = totalAmount * earnedPct - alreadyRecognized
  3. Post: Dr Deferred Revenue / Cr Membership Revenue (earned)
  4. Record recognition in new table `membership_revenue_recognition`
```

**New cron:** `/api/v1/accounting/cron/recognize-revenue` — runs daily, calls `recognizeDeferredRevenue(ctx, { throughDate: today })`.

**Schema change:**
```sql
CREATE TABLE membership_revenue_recognition (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  source_journal_entry_id TEXT NOT NULL,
  recognized_amount NUMERIC NOT NULL,
  recognized_through DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

**Files to modify/create:**
- `packages/modules/accounting/src/commands/recognize-deferred-revenue.ts` (new)
- `packages/db/src/schema/accounting.ts` — add `membershipRevenueRecognition` table
- `packages/db/migrations/XXXX_membership_revenue_recognition.sql` (new)
- `apps/web/src/app/api/v1/accounting/cron/recognize-revenue/route.ts` (new)
- `packages/modules/accounting/src/index.ts` — export new command

**Dependencies:** None — standalone new feature.

**Complexity:** Medium. Core is a single command + cron. The tricky part is computing "already recognized" to avoid double-counting.

---

## 2. Stored Value Liability — Wrong Fallback + Wrong Void Account [S0]

### Problem
1. Liability account fallback chain ends at `defaultUncategorizedRevenueAccountId` — a **revenue** account. If a tenant has no stored value liability account configured, gift card issuance books a `Dr Cash / Cr Revenue` entry instead of `Dr Cash / Cr Liability`.
2. Void always credits Undeposited Funds regardless of whether cash is actually returned. Cancelled/expired gift cards should credit Breakage Income (other income).

### Impact
Tenants without explicit stored-value account configuration have gift card liability classified as revenue. Balance sheet understates liabilities; income statement overstates revenue.

### Proposed Fix

**A. Fix fallback chain** in `stored-value-posting-adapter.ts`:
```ts
// Before (wrong):
const liabilityAccountId = data.liabilityGlAccountId
  ?? settingsAny.defaultStoredValueLiabilityAccountId
  ?? settings.defaultUncategorizedRevenueAccountId;

// After (correct):
const liabilityAccountId = data.liabilityGlAccountId
  ?? settingsAny.defaultStoredValueLiabilityAccountId;
if (!liabilityAccountId) {
  logger.error('No stored value liability account configured');
  return; // GL adapter never throws — log and skip
}
```

**B. Add `breakageIncomeAccountId` to accounting settings** and use it for void:
```sql
ALTER TABLE accounting_settings
  ADD COLUMN default_breakage_income_account_id TEXT REFERENCES gl_accounts(id);
```

**C. Differentiate void types** — accept `voidType: 'refund' | 'breakage'` in the event payload:
- `refund` → Cr Undeposited Funds (cash returned)
- `breakage` → Cr Breakage Income (no cash movement)

**D. Remove wash entry for transfers** — skip GL posting entirely when Dr and Cr accounts are identical.

**Files to modify/create:**
- `packages/modules/accounting/src/adapters/stored-value-posting-adapter.ts` — fix fallback, void logic, transfer skip
- `packages/db/src/schema/accounting.ts` — add `defaultBreakageIncomeAccountId` column
- `packages/db/migrations/XXXX_breakage_income_account.sql` (new)
- `packages/modules/stored-value/src/events/types.ts` — add `voidType` to void event payload

**Dependencies:** Stored-value module must emit `voidType` in the event.

**Complexity:** Low-Medium.

---

## 3. Deposit Authorization — Overstates Cash [S1]

### Problem
`deposit-posting-adapter.ts` posts `Dr Undeposited Funds / Cr Guest Deposits Liability` on card **authorization**. An authorization is not a cash receipt — no money has moved. This overstates the cash position on the balance sheet. Additionally, there is no handler for auth release/void.

### Impact
Hotels with significant pre-authorization volume (security deposits, incidentals holds) show inflated cash balances. If auths expire without capture, the inflated balance persists permanently.

### Proposed Fix

**Option A — Off-balance-sheet (recommended for V1):**
- Remove GL posting from authorization entirely. Track auths in a subledger table only.
- Post GL only on capture: `Dr Undeposited Funds / Cr Guest Deposits Liability`.

**Option B — Clearing account:**
- Authorization: `Dr Pending Card Auth (asset, non-cash) / Cr Guest Deposits Liability`
- Capture: `Dr Undeposited Funds / Cr Pending Card Auth` (clears the auth, recognizes cash)
- Release/Void: `Dr Guest Deposits Liability / Cr Pending Card Auth` (reverses the auth)

Recommend **Option A** for simplicity. Option B is more precise but requires a new GL account type and additional event handling.

**New event handler** (either option): `handleDepositReleasedForAccounting` consuming `pms.payment.released.v1`.

**Files to modify/create:**
- `packages/modules/accounting/src/adapters/deposit-posting-adapter.ts` — remove/change auth GL, add release handler
- `packages/modules/pms/src/events/types.ts` — add `PAYMENT_RELEASED` event type
- `packages/modules/pms/src/commands/release-deposit.ts` — emit release event (new or modify existing)
- `packages/modules/accounting/src/index.ts` — register new consumer

**Dependencies:** PMS module must emit a release/void event for expired authorizations.

**Complexity:** Medium. Requires coordination with PMS event lifecycle.

---

## 4. Year-End Close — Feedback Loop [S1]

### Problem
`generate-retained-earnings.ts` queries all revenue/expense journal lines within the fiscal year date range. After the first close, the closing entry's lines (which hit revenue/expense accounts to zero them) exist within the same date range. If the command is re-run for any reason (correcting entries, extending period), the closing entry lines are included in the income computation, producing a doubled or incorrect retained earnings entry.

Additionally, the command throws `NO_NET_INCOME` (HTTP 400) when net income is zero, which should be a no-op.

### Impact
Re-running year-end close after corrections can produce a materially wrong retained earnings balance. The zero-income error blocks period close for tenants with truly zero income.

### Proposed Fix

**A. Tag closing entries** — add a `source_module = 'year_end_close'` or `entry_type = 'closing'` to the closing journal entry. Filter it out in subsequent queries:
```sql
WHERE je.source_module != 'year_end_close'
```

**B. Void-and-regenerate pattern** — if a retained earnings entry already exists for the FY range, void it first, then regenerate. This is cleaner than trying to compute deltas.

**C. Handle zero income gracefully** — if net income rounds to zero, either skip with a success response or post a $0.00 closing entry (some auditors want to see the explicit close).

**Files to modify:**
- `packages/modules/accounting/src/commands/generate-retained-earnings.ts` — tag entries, filter previous, handle zero
- `packages/modules/accounting/src/commands/void-journal-entry.ts` — may need to allow voiding closing entries

**Dependencies:** None.

**Complexity:** Low. Primarily query filter changes and a void-before-regenerate guard.

---

## 5. Void Bypasses Period Lock [S1]

### Problem
`voidBill`, `voidInvoice`, and `voidReceipt` call `accountingApi.postEntry` with the **original document date** as `businessDate`. If that date falls in a locked period, `validateJournal` throws `PeriodLockedError`. The void status update (in the same `publishWithOutbox` transaction) succeeds, but the GL reversal fails — creating a split state where the subledger shows "voided" but the GL still has the original entry.

### Impact
Any attempt to void a document dated in a locked period will silently leave the GL unbalanced. Operators may not notice the GL discrepancy until period-end close.

### Proposed Fix

**A. Use current date for reversal GL entries:**
```ts
// In void commands:
const glResult = await accountingApi.postEntry(ctx, {
  businessDate: new Date().toISOString().slice(0, 10), // today, not original date
  sourceModule: 'ap',
  sourceReferenceId: `void-${bill.id}`,
  memo: `Void AP Bill ${bill.billNumber} (originally dated ${bill.billDate}): ${input.reason}`,
  // ...
});
```
This is standard accounting practice — reversals are dated when the reversal occurs, with a reference to the original date.

**B. Alternatively, add `forcePost` to `validateJournal`** to skip the period lock check. But this is less clean — current-date reversal is the proper approach.

**C. Wrap GL + status in the same error path** — if GL reversal fails for any reason, the void should also fail (roll back the status change). Currently the GL call is inside `publishWithOutbox` so this may already be handled, but needs verification for each void command.

**Files to modify:**
- `packages/modules/ap/src/commands/void-bill.ts` — change `businessDate`
- `packages/modules/ap/src/commands/void-payment.ts` — change `businessDate`
- `packages/modules/ar/src/commands/void-invoice.ts` — change `businessDate`
- `packages/modules/ar/src/commands/void-receipt.ts` — change `businessDate`
- `packages/modules/accounting/src/commands/void-journal-entry.ts` — add period lock check or use current date

**Dependencies:** Requires policy decision — reversal date = today vs. original date with lock bypass.

**Complexity:** Low. Mechanical change across 5 files.

---

## 6. Bank Reconciliation — Stubbed Auto-Posting [S2]

### Problem
Bank-only adjustment items (fees, interest) added during reconciliation are tracked in `bank_reconciliation_items` but **never auto-posted to the GL**. The code to build GL lines exists but is commented out / stubbed. Additionally, the reconciliation difference formula doesn't follow standard bank rec math (Statement Balance + Outstanding Deposits − Outstanding Withdrawals = Adjusted Book Balance).

### Impact
Operators must manually create journal entries for every bank fee and interest item discovered during reconciliation. The difference calculation may show "balanced" when it's not, or vice versa.

### Proposed Fix

**A. Add configurable accounts to accounting settings:**
```sql
ALTER TABLE accounting_settings ADD COLUMN default_bank_fee_expense_account_id TEXT;
ALTER TABLE accounting_settings ADD COLUMN default_bank_interest_income_account_id TEXT;
```

**B. Complete the auto-posting stub** in `completeBankReconciliation`:
```
For each bank-only item:
  if type = 'fee':   Dr Bank Fee Expense / Cr Bank Account
  if type = 'interest': Dr Bank Account / Cr Interest Income
Post via accountingApi.postEntry
```

**C. Fix reconciliation math:**
```
adjustedBankBalance = statementEndingBalance
  + depositsInTransit    -- items in book but not on statement (deposits)
  - outstandingChecks    -- items in book but not on statement (withdrawals)
adjustedBookBalance = bookBalance
  - bankFees             -- items on statement but not in book (fees)
  + bankInterest         -- items on statement but not in book (interest)
difference = adjustedBankBalance - adjustedBookBalance
```

**Files to modify:**
- `packages/modules/accounting/src/commands/manage-bank-reconciliation.ts` — complete posting, fix math
- `packages/db/src/schema/accounting.ts` — add fee/interest account columns
- `packages/db/migrations/XXXX_bank_rec_accounts.sql` (new)

**Dependencies:** Accounting settings UI must expose the new account fields.

**Complexity:** Medium. Reconciliation math is well-defined but needs careful testing.

---

## 7. Depreciation/Disposal GL Outside Transaction [S1]

### Problem
Both `recordDepreciation` and `disposeFixedAsset` call `accountingApi.postEntry` **before** inserting the subledger record (`fixed_asset_depreciation` insert or asset status update). If the subledger write fails after GL posts, you get a GL entry with no corresponding subledger record.

### Impact
A transient DB error during the subledger insert leaves orphaned GL entries. The fixed asset register and GL become out of sync.

### Proposed Fix

**Move GL posting inside `publishWithOutbox`** so both GL and subledger are in the same transaction:

```ts
const result = await publishWithOutbox(ctx, async (tx) => {
  // 1. Compute depreciation
  // 2. Insert fixed_asset_depreciation record
  // 3. Post GL entry (using tx, not a separate connection)
  // 4. Update asset NBV
});
```

This requires `accountingApi.postEntry` to accept an optional transaction parameter, or the GL insert logic needs to be inlined within the `publishWithOutbox` callback.

**Files to modify:**
- `packages/modules/accounting/src/commands/record-depreciation.ts` — move GL inside tx
- `packages/modules/accounting/src/commands/dispose-fixed-asset.ts` — move GL inside tx
- `packages/modules/accounting/src/commands/run-monthly-depreciation.ts` — verify error handling
- `packages/core/src/helpers/accounting-posting-api.ts` — add optional `tx` parameter to `postEntry`

**Dependencies:** `postEntry` API change affects all callers — must be backward-compatible (optional param).

**Complexity:** Medium. The `postEntry` API change needs careful review across all 23+ adapters.

---

## 8. FX Revaluation — Report Only, No GL Posting [S2]

### Problem
`get-unrealized-gain-loss.ts` computes unrealized FX gains/losses but never posts them. The balance sheet shows foreign-currency accounts at their historical booked rates, not current rates. The close checklist surfaces this as a warning but doesn't enforce it.

### Impact
Multi-currency tenants have materially misstated balance sheets. The longer between revaluation postings, the larger the misstatement.

### Proposed Fix

**New command:** `packages/modules/accounting/src/commands/post-fx-revaluation.ts`

```
postFxRevaluation(ctx, { asOfDate })
  1. Call getUnrealizedGainLoss({ tenantId, asOfDate })
  2. For each account with gain/loss:
     - Gain: Dr Foreign Currency Account / Cr Unrealized FX Gain
     - Loss: Dr Unrealized FX Loss / Cr Foreign Currency Account
  3. Tag entries with source_module = 'fx_revaluation'
  4. Store the entries with auto_reverse_date = first day of next period
```

**New accounting settings fields:**
```sql
ALTER TABLE accounting_settings
  ADD COLUMN default_unrealized_fx_gain_account_id TEXT,
  ADD COLUMN default_unrealized_fx_loss_account_id TEXT;
```

**Integration with auto-reversal** (see #9) — revaluation entries should auto-reverse at period start.

**Files to create/modify:**
- `packages/modules/accounting/src/commands/post-fx-revaluation.ts` (new)
- `packages/db/src/schema/accounting.ts` — add gain/loss account columns
- `packages/db/migrations/XXXX_fx_reval_accounts.sql` (new)
- `packages/modules/accounting/src/queries/get-close-checklist.ts` — upgrade from warning to blocker if unrealized G/L > threshold
- `packages/modules/accounting/src/index.ts` — export

**Dependencies:** Depends on auto-reversal mechanism (#9) for proper period-start reversal.

**Complexity:** Medium. The query logic already exists; this wraps it in a posting command.

---

## 9. Auto-Reversal Mechanism — Missing Entirely [S2]

### Problem
No mechanism exists to automatically reverse accrual entries at the start of the next period. This is fundamental to accrual accounting (month-end accruals, FX revaluations, prepaid amortizations).

### Impact
Operators must manually void/recreate reversal entries every period. This is error-prone and labor-intensive, especially for FX revaluations that should reverse daily.

### Proposed Fix

**A. Add schema support for auto-reversal:**
```sql
ALTER TABLE gl_journal_entries
  ADD COLUMN auto_reverse_date DATE,
  ADD COLUMN auto_reversed_by TEXT REFERENCES gl_journal_entries(id);
```

**B. New command:** `packages/modules/accounting/src/commands/process-auto-reversals.ts`
```
processAutoReversals(ctx, { asOfDate })
  1. Query gl_journal_entries WHERE auto_reverse_date <= asOfDate
     AND auto_reversed_by IS NULL AND status = 'posted'
  2. For each entry, create a reversal (swap debits/credits)
     with business_date = auto_reverse_date
  3. Link: original.auto_reversed_by = reversal.id
```

**C. New cron:** `/api/v1/accounting/cron/auto-reversals` — runs daily at period start.

**D. UI support:** When creating a journal entry, allow setting `autoReverseDate`. Pre-fill for accrual templates.

**Files to create/modify:**
- `packages/db/src/schema/accounting.ts` — add columns to `glJournalEntries`
- `packages/db/migrations/XXXX_auto_reversal.sql` (new)
- `packages/modules/accounting/src/commands/process-auto-reversals.ts` (new)
- `packages/modules/accounting/src/commands/post-journal-entry.ts` — accept `autoReverseDate` input
- `apps/web/src/app/api/v1/accounting/cron/auto-reversals/route.ts` (new)
- `packages/modules/accounting/src/index.ts` — export

**Dependencies:** None, but enables #8 (FX revaluation) to work properly.

**Complexity:** Medium. Straightforward command + cron, but needs careful idempotency handling for re-runs.

---

## 10. Folio Adapter — Missing Entry Types + Tax Splitting [S2]

### Problem
`folio-posting-adapter.ts` only handles 5 entry types (`ROOM_CHARGE`, `TAX`, `FEE`, `PAYMENT`, `REFUND`). Missing: `DEPOSIT`, `CHECKOUT_BALANCE`, `TRANSFER`. Tax lines post to a single account regardless of tax type. Guest Ledger account is resolved via raw SQL instead of the settings helper.

### Impact
PMS operations involving deposits, checkout balances, and folio transfers produce no GL entries. Tax reporting by type is impossible since all taxes are lumped together.

### Proposed Fix

**A. Add missing entry types:**
```ts
case 'DEPOSIT':
  // Skip — handled by deposit-posting-adapter.ts
  // Add explicit no-op to avoid "unmapped event" log noise
  return;

case 'CHECKOUT_BALANCE':
  // Dr Guest Ledger / Cr City Ledger (transfer balance to receivable)
  // Requires new setting: default_city_ledger_account_id

case 'TRANSFER':
  // Inter-folio transfer — net zero on Guest Ledger
  // Dr Guest Ledger (source folio) / Cr Guest Ledger (target folio)
  // If same GL account, skip posting (wash entry)
```

**B. Tax type splitting** — extend `pms_folio_entry_type_gl_defaults` to support sub-types:
```sql
-- Current: entry_type = 'TAX' → one account
-- Proposed: entry_type = 'TAX:SALES', 'TAX:LODGING', 'TAX:RESORT' → different accounts
-- Fallback to generic 'TAX' mapping if specific not found
```

**C. Replace raw SQL** with `getAccountingSettings` helper for Guest Ledger resolution.

**D. Add `default_city_ledger_account_id`** to accounting settings for checkout balance handling.

**Files to modify/create:**
- `packages/modules/accounting/src/adapters/folio-posting-adapter.ts` — add entry types, fix SQL
- `packages/db/src/schema/pms.ts` — extend `pmsFolioEntryTypeGlDefaults` for sub-types
- `packages/db/src/schema/accounting.ts` — add city ledger account setting
- `packages/db/migrations/XXXX_folio_gl_enhancements.sql` (new)

**Dependencies:** PMS module must emit the correct entry types in folio charge events.

**Complexity:** Medium. Multiple small changes but all localized to the adapter + schema.

---

## Implementation Order

The recommended order balances severity, dependencies, and implementation risk:

```
Phase 1 — Next Sprint (S0 + blocking S1)
├─ #2  Stored Value Liability Fallback     [S0, Low complexity, no deps]
├─ #5  Void Period Lock Fix                [S1, Low complexity, no deps]
├─ #7  Depreciation TX Safety              [S1, Medium complexity, API change]
└─ #4  Year-End Close Feedback Loop        [S1, Low complexity, no deps]

Phase 2 — Sprint +1 (S1 remaining)
├─ #1  Membership Revenue Recognition      [S0, Medium complexity, new table]
├─ #3  Deposit Authorization Fix           [S1, Medium complexity, PMS dep]
└─ #9  Auto-Reversal Mechanism             [S2, Medium complexity, enables #8]

Phase 3 — Next Quarter (S2)
├─ #8  FX Revaluation Posting              [S2, Medium, depends on #9]
├─ #6  Bank Reconciliation Completion      [S2, Medium, needs UI work]
└─ #10 Folio Adapter Enhancements          [S2, Medium, needs PMS coordination]
```

### Migration Count Estimate
- New tables: 2 (membership_revenue_recognition, auto-reversal columns)
- ALTER TABLE additions: ~6 columns across accounting_settings + gl_journal_entries
- Total new migration files: 4–5

### New Files Estimate
- New commands: 3 (recognize-deferred-revenue, post-fx-revaluation, process-auto-reversals)
- New cron routes: 2 (recognize-revenue, auto-reversals)
- New migration files: 4–5

### Test Coverage
Each fix should include unit tests covering:
- Happy path posting
- Edge cases (zero amounts, missing accounts, locked periods)
- Idempotency (re-running the same command)
- Transaction safety (GL + subledger atomicity)
