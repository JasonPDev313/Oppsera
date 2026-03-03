# OppsEra Accounting UX/UI Buildout — Session Prompts

## Overview

This document breaks the comprehensive Accounting UX/UI design into **9 focused sessions** (Sessions 35–43), each scoped to produce working frontend code in a single Claude session. These sessions build on the backend completed in Sessions 28–34.

### Session Architecture (9 Sessions)

| Session | Scope | Pages | Components | Hooks |
|---------|-------|-------|------------|-------|
| 35 | Accounting Foundation — Navigation, Layout, Shared Components | 1 landing | ~8 shared | ~3 |
| 36 | Chart of Accounts + Classifications + Settings + Bootstrap | 3 pages | ~10 | ~4 |
| 37 | General Ledger — Journal Browser + Manual Entry + GL Reports | 3 pages | ~12 | ~4 |
| 38 | GL Mappings + Unmapped Events + Bank Registry | 2 pages | ~10 | ~4 |
| 39 | AP Bills + Vendor Accounting + Payment Terms | 3 pages | ~12 | ~5 |
| 40 | AP Payments + Credits + AP Reports | 3 pages | ~10 | ~4 |
| 41 | AR Invoices + Receipts + AR Reports | 3 pages | ~10 | ~4 |
| 42 | Financial Statements + Period Close + Accounting Dashboard | 4 pages | ~14 | ~5 |
| 43 | Cross-Module Integration + Reconciliation + Setup Wizard + Polish | 2 pages | ~8 | ~3 |

**Total: ~24 pages, ~94 components, ~36 hooks, ~45 tests**

### Prerequisites

Each session prompt assumes:
- Backend Sessions 28–34 are complete (accounting module, AP module, AR module exist with working API routes)
- CONVENTIONS.md and CLAUDE.md have been read
- The existing frontend patterns (code-split pages, data hooks, portal dialogs, responsive design) are followed

### Key UX Principles (Apply to ALL Sessions)

1. **Code-split every page** — thin `page.tsx` with `next/dynamic`, heavy content in `*-content.tsx`
2. **Mobile-responsive** — all pages work on 320px+ (dashboard pages), POS-related pages target 768px+
3. **Dark mode compatible** — use `bg-surface`, opacity-based colors, never `bg-gray-900 text-white`
4. **Permission-gated** — hide/disable actions based on `accounting.view`, `accounting.manage`, `accounting.control_account.post`
5. **Portal-based dialogs** — use `createPortal` to `document.body` with z-50, same pattern as POS dialogs
6. **Data hooks pattern** — `useFetch<T>(url)` returns `{ data, isLoading, error, mutate }`, mutations via `useMutation`
7. **Consistent money formatting** — GL amounts are dollars (NUMERIC), use `formatMoney()` helper, 2 decimal places
8. **Sidebar navigation** — Accounting section expands with sub-items matching the module structure

---

## Session 35 — Accounting Foundation: Navigation, Layout, Shared Components

### Preamble

You are building the Accounting UX foundation for OppsEra. Read CONVENTIONS.md and CLAUDE.md first — they define all frontend patterns you must follow (code-split pages, data hooks, portal dialogs, responsive design, dark mode, etc.).

This session creates the navigation structure, shared layout components, and reusable UI primitives that all subsequent accounting sessions depend on. No business logic pages yet — just the skeleton and shared toolkit.

**CRITICAL CONTEXT:**
- The accounting module backend exists at `packages/modules/accounting/` with API routes under `/api/v1/accounting/`
- The AP module backend exists at `packages/modules/ap/` with API routes under `/api/v1/ap/`
- The AR module backend exists at `packages/modules/ar/` with API routes under `/api/v1/ar/`
- All monetary amounts from these APIs are in dollars (NUMERIC(12,2)), NOT cents
- Frontend patterns: code-split pages via `next/dynamic`, `useFetch`/`useMutation` hooks, portal-based dialogs, Tailwind v4, dark mode support

### 1. Sidebar Navigation Updates

**File: `apps/web/src/components/layout/sidebar.tsx`**

Add an "Accounting" section to the sidebar navigation, expandable with sub-items:

```
Accounting (icon: Calculator or Landmark from lucide-react)
├── Dashboard          → /accounting
├── Chart of Accounts  → /accounting/accounts
├── Journal Entries    → /accounting/journals
├── GL Mappings        → /accounting/mappings
├── Bank Accounts      → /accounting/banks
├── Reports ▸
│   ├── Trial Balance  → /accounting/reports/trial-balance
│   ├── GL Detail      → /accounting/reports/detail
│   ├── GL Summary     → /accounting/reports/summary
│   └── Sales Tax      → /accounting/reports/sales-tax
├── Statements ▸
│   ├── Profit & Loss  → /accounting/statements/profit-loss
│   ├── Balance Sheet  → /accounting/statements/balance-sheet
│   └── Cash Flow      → /accounting/statements/cash-flow
├── AP ▸
│   ├── Bills          → /ap/bills
│   ├── Payments       → /ap/payments
│   ├── Aging          → /ap/reports/aging
│   └── Vendor Ledger  → /ap/reports/vendor-ledger
├── AR ▸
│   ├── Invoices       → /ar/invoices
│   ├── Receipts       → /ar/receipts
│   ├── Aging          → /ar/reports/aging
│   └── Customer Ledger→ /ar/reports/customer-ledger
├── Period Close       → /accounting/close
└── Settings           → /accounting/settings
```

Permission gating:
- Entire Accounting section requires `accounting.view` permission
- Write actions (create/edit/delete buttons) require `accounting.manage`
- The sidebar should follow the exact same expandable pattern used by the existing "Reports" section

### 2. Shared Layout Component

**File: `apps/web/src/components/accounting/accounting-page-shell.tsx`**

A wrapper component for all accounting pages providing consistent layout:

```typescript
interface AccountingPageShellProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;       // top-right action buttons
  breadcrumbs?: { label: string; href?: string }[];
  children: React.ReactNode;
}
```

Features:
- Page title with optional subtitle
- Breadcrumb trail (Accounting → Sub-section → Page)
- Action bar (top-right, for "New Entry", "Export", etc.)
- Responsive: title + actions stack vertically on mobile
- Uses existing page header patterns from catalog/orders pages

### 3. Shared Components

Create these reusable components under `apps/web/src/components/accounting/`:

#### a. `period-selector.tsx`
- Dropdown to select a posting period (`YYYY-MM` format)
- Shows last 24 months by default
- "Custom" option for arbitrary date range
- Derives fiscal year periods from `accounting_settings.fiscalYearStartMonth`
- Used by: trial balance, GL reports, P&L, close workflow

#### b. `date-range-picker.tsx`
- Reuse or extend the existing `DateRangePicker` from reporting module
- Quick selects: Today, This Week, This Month, This Quarter, This Year, Last Month, Last Quarter, Last Year, Custom
- Returns `{ from: string; to: string }` in ISO date format
- Used by: journal list, GL detail, AP/AR reports

#### c. `account-picker.tsx`
- Searchable dropdown for selecting GL accounts
- Groups by accountType (Asset, Liability, Equity, Revenue, Expense)
- Shows accountNumber + name (e.g., "1010 — Cash on Hand")
- Optional filter: `accountTypes`, `isActive`, `isControlAccount`
- Fetches from `GET /api/v1/accounting/accounts`
- Used by: journal entry form, mapping pages, bill lines, invoice lines

#### d. `location-selector.tsx`
- Reuse existing location selector pattern from POS/reporting
- Wraps the tenant's locations for filtering reports and entries
- "All Locations" option for aggregate views

#### e. `money-input.tsx`
- Numeric input formatted as dollars (not cents)
- Accepts decimal input, displays with $ prefix
- Validates non-negative (or allows negative for credits)
- Supports debit/credit mode toggle
- Returns string value (matching NUMERIC(12,2) backend)

#### f. `status-badge.tsx`
- Colored pill badge for statuses used across accounting:
  - `draft` → gray
  - `posted` → green
  - `partial` → yellow/amber
  - `paid` → blue
  - `voided` → red
  - `open` → blue, `in_review` → yellow, `closed` → green (for periods)
- Reusable across journals, bills, invoices, payments, periods

#### g. `journal-lines-table.tsx`
- Reusable table for displaying journal entry lines
- Columns: Account (number + name), Memo, Location, Debit, Credit
- Footer row with totals
- Highlights imbalance (debits ≠ credits) in red
- Read-only mode (for viewing) and edit mode (for entry form)
- Used by: journal detail, manual entry, bill posting preview, invoice posting preview

#### h. `empty-state.tsx`
- Consistent empty state component for accounting pages
- Icon, title, description, optional CTA button
- Examples: "No journal entries yet", "No bills found", "GL mappings not configured"

### 4. Data Hooks

**File: `apps/web/src/hooks/use-accounting.ts`**

```typescript
// Base accounting hooks
export function useAccountingSettings(tenantId?: string)
  // GET /api/v1/accounting/settings
  // Returns: settings object or null if not bootstrapped

export function useGLAccounts(filters?: { accountType?: string; isActive?: boolean; isControlAccount?: boolean })
  // GET /api/v1/accounting/accounts
  // Returns: { data: GLAccount[], isLoading, error, mutate }

export function useAccountingBootstrapStatus()
  // Checks if accounting is set up for the current tenant
  // Returns: { isBootstrapped: boolean, isLoading: boolean }
  // Derives from: settings !== null && accounts.length > 0
```

### 5. Accounting Landing Page (Dashboard Shell)

**Files:**
- `apps/web/src/app/(dashboard)/accounting/page.tsx` — thin code-split wrapper
- `apps/web/src/app/(dashboard)/accounting/accounting-content.tsx` — heavy content

The landing page is a dashboard with KPI cards and quick links. This session creates the **shell only** — the actual KPI data comes from Session 42 when the health summary API is wired.

Layout:
- 4 KPI metric cards (placeholder): Net Income, Cash Balance, AP Balance, AR Balance
- Quick links grid: "Record Journal Entry", "Enter AP Bill", "Create Invoice", "View Trial Balance", "Close Period"
- Recent activity feed (placeholder): last 5 journal entries
- Mapping coverage indicator (placeholder): "85% of departments mapped"
- Unmapped events alert banner (if count > 0)

### 6. Types

**File: `apps/web/src/types/accounting.ts`**

Define all frontend types matching the API response shapes:

```typescript
// GL Account
interface GLAccount {
  id: string;
  accountNumber: string;
  name: string;
  accountType: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
  normalBalance: 'debit' | 'credit';
  classificationId: string | null;
  classificationName?: string;
  parentAccountId: string | null;
  isActive: boolean;
  isControlAccount: boolean;
  controlAccountType: string | null;
  allowManualPosting: boolean;
  description: string | null;
  balance?: number; // optional, when requested with balance
}

// Journal Entry
interface JournalEntry {
  id: string;
  journalNumber: number;
  sourceModule: string;
  sourceReferenceId: string | null;
  businessDate: string;
  postingPeriod: string;
  currency: string;
  status: 'draft' | 'posted' | 'voided';
  memo: string | null;
  postedAt: string | null;
  voidedAt: string | null;
  voidReason: string | null;
  reversalOfId: string | null;
  createdBy: string;
  createdAt: string;
  lines: JournalLine[];
}

interface JournalLine {
  id: string;
  accountId: string;
  accountNumber?: string;
  accountName?: string;
  debitAmount: number;
  creditAmount: number;
  locationId: string | null;
  departmentId: string | null;
  customerId: string | null;
  vendorId: string | null;
  memo: string | null;
  sortOrder: number;
}

// Classification
interface GLClassification {
  id: string;
  name: string;
  accountType: string;
  sortOrder: number;
}

// Accounting Settings
interface AccountingSettings {
  tenantId: string;
  baseCurrency: string;
  fiscalYearStartMonth: number;
  autoPostMode: 'auto_post' | 'draft_only';
  lockPeriodThrough: string | null;
  defaultAPControlAccountId: string | null;
  defaultARControlAccountId: string | null;
  defaultSalesTaxPayableAccountId: string | null;
  defaultUndepositedFundsAccountId: string | null;
  defaultRetainedEarningsAccountId: string | null;
  defaultRoundingAccountId: string | null;
  roundingToleranceCents: number;
  enableCogsPosting: boolean;
  enableInventoryPosting: boolean;
  postByLocation: boolean;
  enableUndepositedFundsWorkflow: boolean;
}

// Unmapped Event
interface UnmappedEvent {
  id: string;
  eventType: string;
  sourceModule: string;
  entityType: string;
  entityId: string;
  reason: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
  createdAt: string;
}

// Bank Account
interface BankAccount {
  id: string;
  name: string;
  glAccountId: string;
  glAccountNumber?: string;
  glAccountName?: string;
  accountNumberLast4: string | null;
  bankName: string | null;
  isActive: boolean;
  isDefault: boolean;
}

// Period Close
interface ClosePeriod {
  id: string;
  postingPeriod: string;
  status: 'open' | 'in_review' | 'closed';
  checklist: CloseChecklistItem[];
  closedAt: string | null;
  closedBy: string | null;
  notes: string | null;
}

interface CloseChecklistItem {
  label: string;
  status: 'pass' | 'fail' | 'warning';
  detail?: string;
}
```

Also define AP types (`APBill`, `APBillLine`, `APPayment`, `APPaymentAllocation`, `PaymentTerms`, `VendorAccounting`) and AR types (`ARInvoice`, `ARInvoiceLine`, `ARReceipt`, `ARReceiptAllocation`) following the same pattern.

### 7. Tests (~5)

- AccountingPageShell renders title, subtitle, actions, breadcrumbs
- StatusBadge renders correct color for each status
- AccountPicker fetches and displays accounts grouped by type
- MoneyInput formats and validates dollar amounts
- PeriodSelector generates correct month options from fiscal year start

### Module Structure After This Session

```
apps/web/src/
├── app/(dashboard)/accounting/
│   ├── page.tsx                          # code-split wrapper
│   └── accounting-content.tsx            # dashboard shell
├── components/accounting/
│   ├── accounting-page-shell.tsx
│   ├── period-selector.tsx
│   ├── account-picker.tsx
│   ├── money-input.tsx
│   ├── status-badge.tsx
│   ├── journal-lines-table.tsx
│   ├── empty-state.tsx
│   └── __tests__/
├── hooks/
│   └── use-accounting.ts
└── types/
    └── accounting.ts
```

---

## Session 36 — Chart of Accounts + Classifications + Settings + Bootstrap UI

### Preamble

You are building the Chart of Accounts management UI for OppsEra (Session 36). Read CONVENTIONS.md and CLAUDE.md first.

Session 35 created the accounting navigation, shared components, and types. This session builds the COA management pages, classification management, accounting settings page, and the bootstrap/setup wizard.

**Backend APIs available:**
- `GET/POST /api/v1/accounting/accounts` — list/create accounts
- `GET/PATCH /api/v1/accounting/accounts/[id]` — get/update account
- `GET/POST /api/v1/accounting/classifications` — list/create
- `PATCH /api/v1/accounting/classifications/[id]` — update
- `GET/PATCH /api/v1/accounting/settings` — get/update settings
- `POST /api/v1/accounting/bootstrap` — initialize COA from template

**KEY DECISIONS:**
- COA uses a tree view (sub-accounts nest under parents via `parentAccountId`)
- Control accounts are visually distinct (badge + restricted editing)
- Settings page is a single form with sections, NOT multiple pages
- Bootstrap wizard is shown when `useAccountingBootstrapStatus()` returns `isBootstrapped: false`

### 1. Chart of Accounts Page

**Files:**
- `apps/web/src/app/(dashboard)/accounting/accounts/page.tsx` — code-split wrapper
- `apps/web/src/app/(dashboard)/accounting/accounts/accounts-content.tsx`

**Layout:**
- `AccountingPageShell` with title "Chart of Accounts", breadcrumb: Accounting → Chart of Accounts
- Action bar: "New Account" button (requires `accounting.manage`), filter toggles, search
- Main content: account tree/list

**Account List/Tree:**
- Default view: flat list grouped by accountType sections (Assets, Liabilities, Equity, Revenue, Expenses)
- Each section is collapsible with a header showing the account type and count
- Within each section, accounts sorted by accountNumber
- Sub-accounts indented under their parent (tree lines)
- Toggle: "Tree View" / "Flat List" (saved to localStorage)

**Each row shows:**
- Account number (bold, monospace)
- Account name
- Classification badge (if assigned)
- Control account badge (if `isControlAccount` — "AP Control", "AR Control", "Tax Payable", etc.)
- Balance (if loaded — right-aligned, debit-normal shows positive for debits, credit-normal shows positive for credits)
- Status indicator (active/inactive — inactive rows are dimmed)
- Actions: Edit, Deactivate/Reactivate (gear icon dropdown)

**Filters:**
- Search: by name or account number (client-side filtering since COA is typically <200 accounts)
- Account type: checkbox filter (Asset, Liability, Equity, Revenue, Expense)
- Status: Active / Inactive / All
- "Show balances as of [date]" toggle — when enabled, fetches balances via `?includeBalance=true&asOfDate=YYYY-MM-DD`

**Empty state:** "No chart of accounts configured. Set up your accounts to start tracking finances." with "Bootstrap from Template" CTA.

### 2. Account Create/Edit Dialog

**File: `apps/web/src/components/accounting/account-dialog.tsx`**

Portal-based dialog (z-50, `createPortal` to `document.body`):

**Fields:**
- Account Number (text, required, unique per tenant)
- Account Name (text, required)
- Account Type (select: Asset, Liability, Equity, Revenue, Expense — locked after creation if has posted entries)
- Normal Balance (auto-derived from type, shown read-only: Assets/Expenses = Debit, Liabilities/Equity/Revenue = Credit)
- Classification (select from tenant's classifications, optional)
- Parent Account (account picker, optional, filtered to same accountType)
- Description (textarea, optional)
- Is Control Account (checkbox — when checked, shows `controlAccountType` select)
- Control Account Type (select: AP, AR, Sales Tax, Undeposited Funds, Bank — only when `isControlAccount`)
- Allow Manual Posting (checkbox, default true — uncheck to prevent manual journal entries to this account)

**Validation:**
- Account number must be unique (check on blur, show inline error)
- Account type cannot change after posted entries exist (show warning)
- Parent account must be same type
- Control accounts: warn user about posting restrictions

**Edit mode differences:**
- Account type field is disabled if account has posted entries (show tooltip: "Cannot change type after entries exist")
- Show current balance at top

### 3. Classifications Management

**File: `apps/web/src/components/accounting/classifications-panel.tsx`**

A slide-out panel (not a full page) accessible from the COA page via "Manage Classifications" button:

- List of classifications grouped by accountType
- Drag-to-reorder within each type (or sort order input)
- Inline edit for name
- "Add Classification" button per type section
- Delete only if no accounts reference it (show count)

### 4. Accounting Settings Page

**Files:**
- `apps/web/src/app/(dashboard)/accounting/settings/page.tsx` — code-split wrapper
- `apps/web/src/app/(dashboard)/accounting/settings/settings-content.tsx`

**Layout:** `AccountingPageShell` with title "Accounting Settings"

**Sections (vertical form layout):**

**General:**
- Base Currency: read-only "USD" with note "Multi-currency coming soon"
- Fiscal Year Start Month: select (January–December)
- Auto-Post Mode: radio — "Auto-post entries" / "Create as draft (manual posting)"

**Default Accounts:**
- AP Control Account (account picker, filtered to `isControlAccount: true`)
- AR Control Account (same)
- Sales Tax Payable Account (same)
- Undeposited Funds Account (same)
- Retained Earnings Account (same)
- Rounding Account (account picker)

Each shows a warning icon if not set, with helper text explaining the impact.

**Posting Options:**
- Rounding Tolerance (number input, in cents, default 5)
- Enable COGS Posting (toggle + explanation)
- Enable Inventory Posting (toggle + explanation)
- Post by Location (toggle — when on, journal lines include locationId dimension)
- Enable Undeposited Funds Workflow (toggle + explanation of POS → Undeposited → Bank flow)

**Period Lock:**
- Current lock: shows `lockPeriodThrough` or "None"
- "Lock through period" button → opens period selector dialog → calls `POST /settings/lock-period`
- Warning: "Entries cannot be posted to locked periods"

**Save:** Single "Save Settings" button at bottom. Shows success toast on save.

### 5. Bootstrap Wizard

**File: `apps/web/src/components/accounting/bootstrap-wizard.tsx`**

Shown as a full-page overlay when accounting is not yet set up (detected by `useAccountingBootstrapStatus`).

**Steps:**

1. **Welcome** — "Set up accounting for [business name]". Explains what will be created.
2. **Choose Template** — Radio cards for: Golf Course, Retail, Restaurant, Hybrid. Each shows a preview of key accounts. Template selection drives which COA is created.
3. **Review Accounts** — Shows the accounts that will be created in a read-only tree view. "These accounts can be customized after setup."
4. **Configure Defaults** — Pre-selects the control accounts from the template. User can change if needed.
5. **Complete** — "Accounting is ready!" with links to: Chart of Accounts, GL Mappings, Settings.

**API call:** `POST /api/v1/accounting/bootstrap` with `{ templateKey }` on step 5 confirmation.

### 6. Hooks

**File: `apps/web/src/hooks/use-accounting.ts` (extend from Session 35)**

```typescript
export function useGLClassifications()
export function useAccountMutations()
  // createAccount, updateAccount, deactivateAccount
export function useClassificationMutations()
  // createClassification, updateClassification
export function useSettingsMutation()
  // updateSettings
export function useBootstrap()
  // bootstrap(templateKey) → triggers COA creation
```

### 7. Tests (~5)

- Account tree view renders with correct indentation for sub-accounts
- Account dialog validates unique account number
- Settings form saves and shows toast
- Bootstrap wizard completes all steps and calls API
- Classifications panel reorders correctly

---

## Session 37 — General Ledger: Journal Browser + Manual Entry + GL Reports

### Preamble

You are building the General Ledger UI for OppsEra (Session 37). Read CONVENTIONS.md and CLAUDE.md first.

Sessions 35–36 created the navigation, shared components, and COA pages. This session builds the journal entry browser, manual journal entry form, and GL reporting pages.

**Backend APIs available:**
- `GET /api/v1/accounting/journals` — list journal entries (paginated, filterable)
- `POST /api/v1/accounting/journals` — create manual entry
- `GET /api/v1/accounting/journals/[id]` — get entry with lines
- `POST /api/v1/accounting/journals/[id]/post` — post draft
- `POST /api/v1/accounting/journals/[id]/void` — void entry
- `GET /api/v1/accounting/reports/trial-balance`
- `GET /api/v1/accounting/reports/detail`
- `GET /api/v1/accounting/reports/summary`

### 1. Journal Entries List Page

**Files:**
- `apps/web/src/app/(dashboard)/accounting/journals/page.tsx`
- `apps/web/src/app/(dashboard)/accounting/journals/journals-content.tsx`

**Layout:** `AccountingPageShell` — "Journal Entries", actions: "New Entry" button

**Filters bar (horizontal, collapsible on mobile):**
- Date range picker (default: current month)
- Source module filter: All, Manual, POS, AP, AR, Inventory (multi-select chips)
- Status filter: All, Draft, Posted, Voided
- Account filter (account picker — shows entries containing lines for that account)
- Search by journal number or memo

**Table columns:**
- Journal # (link to detail)
- Date (businessDate)
- Source (badge: Manual=blue, POS=green, AP=purple, AR=orange, Inventory=teal)
- Memo (truncated with tooltip)
- Debit Total
- Credit Total
- Status (StatusBadge)
- Posted date

**Pagination:** cursor-based with "Load more" or infinite scroll (following existing order list pattern)

**Row actions (hover/dropdown):**
- View → navigates to detail
- Post (if draft) → confirmation dialog → calls POST /journals/[id]/post
- Void (if posted) → requires reason → calls POST /journals/[id]/void

### 2. Journal Entry Detail Page

**Files:**
- `apps/web/src/app/(dashboard)/accounting/journals/[id]/page.tsx`
- `apps/web/src/app/(dashboard)/accounting/journals/[id]/journal-detail-content.tsx`

**Layout:** `AccountingPageShell` — "Journal #[number]", breadcrumb: Accounting → Journals → #12345

**Header section:**
- Status badge (large)
- Journal number, business date, posting period
- Source module + source reference (linked if applicable — e.g., "AP Bill #INV-2024-0032" links to bill detail)
- Memo
- Created by, created at, posted at
- If voided: void reason, voided at, reversal entry link

**Lines section:**
- `JournalLinesTable` component (from Session 35) in read-only mode
- Columns: Line #, Account (number + name), Location, Department, Vendor/Customer, Memo, Debit, Credit
- Footer: Total Debits, Total Credits, Difference (highlighted red if ≠ 0)

**Actions:**
- "Post" button (if draft, requires `accounting.manage`)
- "Void" button (if posted, requires `accounting.manage`) → opens void dialog with reason textarea
- "Print" / "Export" button → generates print-friendly view

### 3. Manual Journal Entry Form

**File: `apps/web/src/components/accounting/journal-entry-form.tsx`**

This is a **full-page form**, not a dialog. Accessed via "New Entry" button or `/accounting/journals/new`.

**Files:**
- `apps/web/src/app/(dashboard)/accounting/journals/new/page.tsx`
- `apps/web/src/app/(dashboard)/accounting/journals/new/journal-entry-form-content.tsx`

**Header fields:**
- Business Date (date picker, default today)
- Memo (text input)
- Source Module: always "manual" (read-only display)

**Lines grid (editable table):**
- Each row: Account (picker), Location (optional), Department (optional), Debit (money input), Credit (money input), Memo (text), Remove button
- "Add Line" button below the grid
- Auto-focus: when a new line is added, focus the account picker
- Keyboard navigation: Tab through fields, Enter to add new line
- Real-time totals at bottom: Total Debits, Total Credits, Difference
- Difference highlighted red when ≠ 0, green check when balanced

**Validation:**
- At least 2 lines required
- Each line must have an account
- Each line must have either debit or credit (not both, not neither)
- Total debits must equal total credits (with rounding tolerance from settings)
- Control account warning: if any line targets a control account, show warning banner — "This entry includes control accounts. Posting requires the 'Control Account Post' permission."

**Submit:**
- "Save as Draft" button → creates draft entry
- "Post Entry" button → creates and immediately posts (if auto-post mode or explicit)
- On success → navigate to journal detail page
- On error → show inline errors (period locked, unbalanced, etc.)

### 4. Trial Balance Report Page

**Files:**
- `apps/web/src/app/(dashboard)/accounting/reports/trial-balance/page.tsx`
- `apps/web/src/app/(dashboard)/accounting/reports/trial-balance/trial-balance-content.tsx`

**Layout:** `AccountingPageShell` — "Trial Balance"

**Controls:**
- Period selector OR date range picker (toggle between "As of Date" and "For Period")
- Location filter (optional)
- "Show zero-balance accounts" toggle (default off)

**Table:**
- Grouped by accountType sections (Assets, Liabilities, Equity, Revenue, Expenses)
- Columns: Account Number, Account Name, Classification, Debit Balance, Credit Balance
- Section subtotals
- Grand total row (bold): Total Debits, Total Credits
- Variance row: Difference (should be $0.00 — highlighted red if not)
- If unbalanced: red alert banner at top — "Trial balance is out of balance by $X.XX"

**Export:** "Export CSV" button (calls CSV endpoint with same filters)

### 5. GL Detail Report Page

**Files:**
- `apps/web/src/app/(dashboard)/accounting/reports/detail/page.tsx`
- `apps/web/src/app/(dashboard)/accounting/reports/detail/gl-detail-content.tsx`

**Layout:** `AccountingPageShell` — "General Ledger Detail"

**Controls:**
- Account picker (required — select which account to view)
- Date range (required)
- Location filter (optional)

**Table:**
- Columns: Date, Journal #, Source, Memo, Debit, Credit, Running Balance
- Running balance computed via window function on backend, displayed per row
- Opening balance row at top
- Closing balance row at bottom
- Paginated (cursor-based)

**Features:**
- Click journal # to navigate to journal detail
- Print-friendly layout

### 6. GL Summary Report Page

**Files:**
- `apps/web/src/app/(dashboard)/accounting/reports/summary/page.tsx`
- `apps/web/src/app/(dashboard)/accounting/reports/summary/gl-summary-content.tsx`

**Layout:** `AccountingPageShell` — "General Ledger Summary"

**Controls:**
- Date range (required)
- Location filter (optional)
- Group by: Classification (default) or Account Type

**Table:**
- Grouped by classification or type
- Columns: Classification/Type, Total Debits, Total Credits, Net Balance
- Grand totals row

### 7. Hooks

**File: `apps/web/src/hooks/use-journals.ts`**

```typescript
export function useJournalEntries(filters: JournalFilters)
export function useJournalEntry(id: string)
export function useJournalMutations()
  // createJournal, postJournal, voidJournal
export function useTrialBalance(params: TrialBalanceParams)
export function useGLDetail(params: GLDetailParams)
export function useGLSummary(params: GLSummaryParams)
```

### 8. Tests (~5)

- Journal entry form validates balanced debits/credits
- Journal entry form shows control account warning
- Trial balance highlights out-of-balance condition
- GL detail shows correct running balance
- Void dialog requires reason text

---

## Session 38 — GL Mappings + Unmapped Events + Bank Registry UI

### Preamble

You are building the GL Mapping and Bank Registry UI for OppsEra (Session 38). Read CONVENTIONS.md and CLAUDE.md first.

This session creates the mapping configuration pages that connect business entities (departments, payment types, tax groups) to GL accounts, the unmapped events resolution workflow, and the bank account registry.

**Backend APIs available:**
- `GET/PUT /api/v1/accounting/mappings/sub-departments/[id]` — department GL defaults
- `GET/PUT /api/v1/accounting/mappings/payment-types/[id]` — payment type GL defaults
- `GET/PUT /api/v1/accounting/mappings/tax-groups/[id]` — tax group GL defaults
- `GET /api/v1/accounting/mappings/coverage` — mapping coverage diagnostic
- `GET /api/v1/accounting/unmapped-events` — unmapped events list
- `PATCH /api/v1/accounting/unmapped-events/[id]/resolve` — resolve event
- `GET/POST /api/v1/accounting/bank-accounts` — bank registry

**CRITICAL CONTEXT:**
- Sub-departments come from the catalog module (existing `categories` table with `parentId`)
- Payment types come from the payments/tenders system
- Tax groups come from the catalog tax configuration
- These entities exist in OTHER modules — the mapping tables just link them to GL accounts
- The POS posting adapter uses these mappings to create GL entries from sales

### 1. GL Mappings Page

**Files:**
- `apps/web/src/app/(dashboard)/accounting/mappings/page.tsx`
- `apps/web/src/app/(dashboard)/accounting/mappings/mappings-content.tsx`

**Layout:** `AccountingPageShell` — "GL Account Mappings"

**Top: Coverage Summary Card**
- Three progress bars: Departments (X/Y mapped), Payment Types (X/Y mapped), Tax Groups (X/Y mapped)
- Overall coverage percentage
- If any unmapped: yellow alert — "X items need GL mappings before POS sales will post to the GL"
- Data from `GET /api/v1/accounting/mappings/coverage`

**Three-tab layout:**

#### Tab 1: Department Mappings
- Table with one row per sub-department (from catalog)
- Columns: Department → Sub-Department, Revenue Account, COGS Account, Inventory Asset Account, Discount Account, Returns Account, Status
- Status: ✓ (all mapped) / ⚠ (partially mapped) / ✗ (unmapped)
- Click a row → inline edit OR opens mapping dialog
- Each cell is an account picker (filtered to appropriate account type: Revenue accounts for revenue, Expense accounts for COGS, Asset accounts for inventory)
- "Save All" button saves all changes in batch

**Mapping dialog alternative (for mobile/compact view):**
- Portal dialog with all 5 account pickers for one sub-department
- Shows the department → sub-department hierarchy for context

#### Tab 2: Payment Type Mappings
- Table with one row per payment type (cash, credit card, gift card, house account, etc.)
- Columns: Payment Type, Cash/Bank Account, Clearing Account, Fee Expense Account, Status
- Same inline edit or dialog pattern

#### Tab 3: Tax Group Mappings
- Table with one row per tax group
- Columns: Tax Group Name, Rate, Tax Payable Account, Status
- Single account picker per row

**Empty state per tab:** "No [departments/payment types/tax groups] configured yet. Configure them in [Catalog/Settings] first."

### 2. Unmapped Events Page

**File: `apps/web/src/components/accounting/unmapped-events-list.tsx`**

Accessible from: mappings page alert banner, sidebar, and accounting dashboard.

If implemented as a separate page:
- `apps/web/src/app/(dashboard)/accounting/unmapped-events/page.tsx`

Or as a slide-out panel from the mappings page.

**Filters:**
- Event type: multi-select (missing_revenue_account, missing_payment_account, etc.)
- Status: Unresolved / Resolved / All
- Date range

**Table:**
- Columns: Date, Event Type (human-readable), Entity (department/payment type/tax group name), Reason, Source Module, Status, Actions
- Event type rendered as human-readable: "Missing Revenue Account" instead of "missing_revenue_account"
- Entity name resolved (not just ID)

**Resolution workflow:**
- Click "Resolve" → opens dialog showing:
  - What mapping is missing
  - Direct link to configure the mapping (e.g., "Set up GL mapping for department X")
  - Once mapping exists → "Mark Resolved" button
  - Option to manually resolve with note (e.g., "Not applicable — test transaction")

### 3. Bank Accounts Registry Page

**Files:**
- `apps/web/src/app/(dashboard)/accounting/banks/page.tsx`
- `apps/web/src/app/(dashboard)/accounting/banks/banks-content.tsx`

**Layout:** `AccountingPageShell` — "Bank Accounts"

**List:**
- Card layout (not table — bank accounts are few, cards are friendlier)
- Each card shows: Bank name, Account name, Last 4 digits, Linked GL account (number + name), Default badge (if default)
- Active/inactive toggle
- Edit button

**Create/Edit Dialog:**
- Portal dialog with fields:
  - Account Name (text, required — e.g., "Operating Checking")
  - GL Account (account picker, filtered to Asset accounts, required)
  - Bank Name (text, optional — e.g., "Chase", "Wells Fargo")
  - Account Last 4 Digits (text, optional, max 4 chars)
  - Set as Default (checkbox — only one default allowed, toggling clears others)
- Save calls `POST /api/v1/accounting/bank-accounts`

### 4. Hooks

**File: `apps/web/src/hooks/use-mappings.ts`**

```typescript
export function useMappingCoverage()
export function useSubDepartmentMappings()
export function usePaymentTypeMappings()
export function useTaxGroupMappings()
export function useMappingMutations()
  // saveSubDepartmentDefaults, savePaymentTypeDefaults, saveTaxGroupDefaults
export function useUnmappedEvents(filters?)
export function useUnmappedEventMutations()
  // resolveEvent
export function useBankAccounts()
export function useBankAccountMutations()
  // saveBankAccount
```

### 5. Tests (~5)

- Mapping coverage renders correct percentages
- Department mapping saves all 5 account selections
- Unmapped event resolution marks event as resolved
- Bank account form validates required fields
- Default bank account toggle clears other defaults

---

## Session 39 — AP Bills + Vendor Accounting + Payment Terms UI

### Preamble

You are building the Accounts Payable bill management UI for OppsEra (Session 39). Read CONVENTIONS.md and CLAUDE.md first.

Sessions 35–38 created the accounting foundation. This session builds the AP bill lifecycle UI, vendor accounting configuration, and payment terms management.

**Backend APIs available:**
- `GET/POST /api/v1/ap/bills` — list/create bills
- `GET/PATCH /api/v1/ap/bills/[id]` — get/update draft bill
- `POST /api/v1/ap/bills/[id]/post` — post bill
- `POST /api/v1/ap/bills/[id]/void` — void bill
- `GET/POST /api/v1/ap/payment-terms` — list/create payment terms
- `GET/PATCH /api/v1/ap/vendors/[id]/accounting` — vendor accounting fields
- `GET /api/v1/ap/reports/aging` — AP aging

**CRITICAL CONTEXT:**
- Vendors already exist in the inventory module with management UI. AP adds accounting fields (defaultExpenseAccountId, defaultAPAccountId, paymentTermsId, is1099Eligible, vendorNumber) via ALTER TABLE extensions
- AP amounts are NUMERIC(12,2) dollars, not cents
- Bills follow lifecycle: DRAFT → POSTED → PARTIAL → PAID → VOIDED
- Bill from receipt creates a bill pre-populated from receiving receipt data

### 1. AP Bills List Page

**Files:**
- `apps/web/src/app/(dashboard)/ap/bills/page.tsx`
- `apps/web/src/app/(dashboard)/ap/bills/bills-content.tsx`

**Layout:** `AccountingPageShell` — "AP Bills", actions: "New Bill" + "Bill from Receipt"

**Filters:**
- Vendor (searchable dropdown from existing vendor list)
- Status: All, Draft, Posted, Partial, Paid, Voided
- Date range (bill date)
- Location
- "Overdue only" toggle (dueDate < today AND status in posted/partial)

**Table:**
- Columns: Bill #, Vendor Name, Bill Date, Due Date, Total, Balance Due, Status, Location
- Due date highlighted red if overdue
- Balance due highlighted when > 0
- Sort by: date (default), vendor, amount, due date

**Row actions:**
- View → bill detail
- Edit (if draft)
- Post (if draft) → confirmation with GL preview
- Void (if posted, no payments) → reason dialog

**Summary cards above table:**
- Total Outstanding (sum of balanceDue for posted/partial)
- Overdue Amount
- Draft Count
- Bills Due This Week

### 2. Bill Create/Edit Form

**Files:**
- `apps/web/src/app/(dashboard)/ap/bills/new/page.tsx`
- `apps/web/src/app/(dashboard)/ap/bills/new/bill-form-content.tsx`
- `apps/web/src/app/(dashboard)/ap/bills/[id]/edit/page.tsx` (reuses form)

Full-page form (not dialog — bills have too many fields).

**Header section:**
- Vendor (searchable dropdown, required) — on selection, auto-fills: default expense account, AP account, payment terms
- Bill Number (text, required — unique per vendor)
- Bill Date (date picker, required)
- Due Date (date picker, auto-calculated from payment terms, editable)
- Payment Terms (dropdown, from `GET /api/v1/ap/payment-terms` — changing this recalculates due date)
- Location (optional)
- Memo (text)
- If from receipt: "Linked Receipt: RCV-20240315-ABCDEF" (read-only, links to receipt)

**Lines grid:**
- Columns: Line Type (dropdown: Expense/Inventory/Asset/Freight), GL Account (picker), Description, Qty, Unit Cost, Amount (auto-calc: qty × unitCost), Location, Department
- "Add Line" button
- Line type drives account picker filtering:
  - Expense → shows expense accounts
  - Inventory → shows asset accounts (inventory)
  - Asset → shows asset accounts (fixed assets)
  - Freight → shows expense accounts
- Auto-calculated fields: amount = qty × unitCost

**Totals section (sticky bottom bar):**
- Subtotal (sum of line amounts)
- Tax (editable — or sum of line tax amounts if per-line)
- Total (subtotal + tax)
- Validation: if manually entered total doesn't match line total → show warning

**GL Preview panel (collapsible, right side or bottom):**
- Shows what the GL entry will look like when posted
- Debit: each line's account with amount
- Credit: AP control account with total
- Updates live as lines are edited
- Same `JournalLinesTable` component from Session 35

**Submit:**
- "Save Draft" → saves as draft, navigate to detail
- "Save & Post" → saves and posts in one step, with GL preview confirmation
- Validation: all lines must have account, amounts must balance, vendor required

### 3. Bill Detail Page

**Files:**
- `apps/web/src/app/(dashboard)/ap/bills/[id]/page.tsx`
- `apps/web/src/app/(dashboard)/ap/bills/[id]/bill-detail-content.tsx`

**Layout:** Similar to journal detail page.

**Header:** Status badge, bill number, vendor name (link to vendor), dates, amounts.

**Tabs or sections:**
1. **Lines** — table of bill lines with totals
2. **GL Entry** — linked journal entry (if posted), shown via `JournalLinesTable`
3. **Payments** — table of payments allocated to this bill (from Session 40)
4. **Activity** — timeline: created, posted, payments applied, voided

**Actions:** Edit (if draft), Post, Void, "Create Payment" (navigates to payment form pre-filled)

### 4. Vendor Accounting Tab

**File: `apps/web/src/components/ap/vendor-accounting-tab.tsx`**

This component is embedded in the existing vendor detail page (from inventory module) as a new tab or section.

**Fields:**
- Vendor Number (text, unique per tenant)
- Default Expense Account (account picker)
- Default AP Account (account picker, for AP control override)
- Payment Terms (dropdown)
- 1099 Eligible (toggle)

**Summary cards (read-only):**
- Open Bill Count
- Total Balance
- Overdue Balance
- Last Payment Date

### 5. Payment Terms Management

**File: `apps/web/src/components/ap/payment-terms-dialog.tsx`**

Accessible from AP Settings or from the bill form's payment terms dropdown ("+ Add New").

**Table in dialog:**
- Columns: Name, Days, Discount %, Discount Days, Active
- Inline edit or row-click edit
- "Add Term" button

**Common presets:** Net 10, Net 15, Net 30, Net 45, Net 60, 2/10 Net 30 (2% discount if paid within 10 days)

### 6. Hooks

**File: `apps/web/src/hooks/use-ap.ts`**

```typescript
export function useAPBills(filters: APBillFilters)
export function useAPBill(id: string)
export function useAPBillMutations()
  // createBill, updateBill, postBill, voidBill
export function usePaymentTerms()
export function useVendorAccounting(vendorId: string)
export function useVendorAccountingMutation()
export function useAPSummary()
  // Returns: totalOutstanding, overdueAmount, draftCount, dueThisWeek
```

### 7. Tests (~5)

- Bill form auto-fills vendor defaults on vendor selection
- Bill line amount auto-calculates from qty × unitCost
- GL preview updates live as lines change
- Due date recalculates on payment terms change
- Void dialog blocks when payments exist

---

## Session 40 — AP Payments + Credits + AP Reports UI

### Preamble

You are building the AP Payments and Reporting UI for OppsEra (Session 40). Read CONVENTIONS.md and CLAUDE.md first.

Session 39 built the bill management UI. This session adds payment processing, vendor credits, and all AP reporting pages.

**Backend APIs available:**
- `GET/POST /api/v1/ap/payments` — list/create payments
- `GET /api/v1/ap/payments/[id]` — get with allocations
- `POST /api/v1/ap/payments/[id]/post` — post payment
- `POST /api/v1/ap/payments/[id]/void` — void payment
- `POST /api/v1/ap/credits` — create vendor credit
- `POST /api/v1/ap/credits/apply` — apply credit to bill
- `GET /api/v1/ap/reports/aging` — AP aging report
- `GET /api/v1/ap/reports/vendor-ledger/[vendorId]` — vendor ledger
- `GET /api/v1/ap/reports/open-bills` — open bills
- `GET /api/v1/ap/reports/cash-requirements` — cash forecast
- `GET /api/v1/ap/reports/1099` — 1099 report
- `GET /api/v1/ap/reports/expense-by-vendor` — vendor expense analysis
- `GET /api/v1/ap/reports/asset-purchases` — capital purchases

### 1. AP Payments List Page

**Files:**
- `apps/web/src/app/(dashboard)/ap/payments/page.tsx`
- `apps/web/src/app/(dashboard)/ap/payments/payments-content.tsx`

**Layout:** `AccountingPageShell` — "AP Payments", actions: "New Payment"

**Table:**
- Columns: Payment Date, Vendor, Payment Method, Reference #, Amount, Status, Bank Account
- Filters: Vendor, date range, payment method, status

### 2. Payment Create Form

**Files:**
- `apps/web/src/app/(dashboard)/ap/payments/new/page.tsx`
- `apps/web/src/app/(dashboard)/ap/payments/new/payment-form-content.tsx`

Full-page form.

**Header:**
- Vendor (required — on selection, loads open bills for allocation)
- Payment Date (date picker)
- Payment Method (select: Check, ACH, Wire, Card, Cash)
- Bank Account (select from bank registry — defaults to tenant's default bank)
- Reference Number (text — check number, ACH ref, etc.)
- Amount (money input)
- Memo

**Bill Allocation Grid:**
- Loads all open bills (status: posted/partial) for selected vendor
- Columns: Bill #, Bill Date, Due Date, Bill Total, Balance Due, Payment Amount (editable)
- "Pay All" button — fills each bill's payment amount with its balance due
- "Pay Selected" — fills only checked bills
- Running totals: Total Allocated, Unapplied Amount (payment amount - sum allocated)
- Unapplied amount > 0 is allowed (shows as vendor credit)

**GL Preview:**
- Debit: AP Control Account — payment amount
- Credit: Bank/Cash Account — payment amount

**Submit:** "Save Draft" / "Save & Post"

### 3. Vendor Credit Dialog

**File: `apps/web/src/components/ap/vendor-credit-dialog.tsx`**

Portal dialog for creating a vendor credit (negative bill):

- Vendor (required)
- Credit Date
- Amount (positive number, stored as negative bill)
- Reason/Memo
- Account (expense/inventory account to credit-back)

After creation, the credit appears in the vendor's open items and can be applied.

**Apply Credit Dialog:**
- Shows vendor's credits and open bills
- Select credit, select bills to apply against
- Allocation grid similar to payment form

### 4. AP Aging Report Page

**Files:**
- `apps/web/src/app/(dashboard)/ap/reports/aging/page.tsx`
- `apps/web/src/app/(dashboard)/ap/reports/aging/ap-aging-content.tsx`

**Layout:** `AccountingPageShell` — "AP Aging Report"

**Controls:** As-of date (default today), location filter

**Table:**
- Rows: one per vendor (with open balance)
- Columns: Vendor Name, Current (not yet due), 1-30 Days, 31-60 Days, 61-90 Days, 90+ Days, Total
- Footer: totals row
- Click vendor → expands to show individual bills
- Color coding: current=green, 1-30=yellow, 31-60=orange, 61-90=red, 90+=dark red

**Summary cards:**
- Total AP Outstanding
- Current vs Overdue split
- Average Days Payable

**Export:** CSV button

### 5. Vendor Ledger Page

**Files:**
- `apps/web/src/app/(dashboard)/ap/reports/vendor-ledger/page.tsx`
- `apps/web/src/app/(dashboard)/ap/reports/vendor-ledger/vendor-ledger-content.tsx`

**Controls:** Vendor picker (required), date range

**Table:** Chronological listing of all activity for a vendor:
- Columns: Date, Type (Bill/Payment/Credit), Reference #, Debit (charges), Credit (payments), Running Balance
- Opening balance at top, closing balance at bottom

### 6. Cash Requirements Report

**File: `apps/web/src/components/ap/cash-requirements-report.tsx`**

- Groups open bills by due week/month
- Shows running total of cash needed
- "You need $X by Friday" summary

### 7. Additional AP Report Pages

Each follows the same pattern: `AccountingPageShell`, controls bar, data table, export button.

- **1099 Report** — vendor totals for calendar year, filtered to 1099-eligible vendors
- **Expense by Vendor** — total expenses by vendor for date range, broken by GL account
- **Asset Purchases** — bill lines where lineType='asset', grouped by account/period

### 8. Hooks

**File: `apps/web/src/hooks/use-ap.ts` (extend from Session 39)**

```typescript
export function useAPPayments(filters)
export function useAPPayment(id: string)
export function useAPPaymentMutations()
  // createPayment, postPayment, voidPayment
export function useVendorCredits(vendorId: string)
export function useVendorCreditMutations()
export function useAPAging(params)
export function useVendorLedger(vendorId: string, params)
export function useCashRequirements(params)
export function use1099Report(year: number)
export function useExpenseByVendor(params)
export function useAssetPurchases(params)
```

### 9. Tests (~5)

- Payment allocation grid auto-fills on "Pay All"
- Unapplied amount displays correctly
- AP aging color-codes overdue buckets
- Vendor ledger running balance is correct
- 1099 report filters to eligible vendors only

---

## Session 41 — AR Invoices + Receipts + AR Reports UI

### Preamble

You are building the Accounts Receivable UI for OppsEra (Session 41). Read CONVENTIONS.md and CLAUDE.md first.

This session builds the AR invoice lifecycle, receipt processing, and AR reporting pages.

**CRITICAL CONTEXT:**
- AR v0 bridges the existing operational AR (house accounts from Session 16) into GL
- `ar_invoices` are formal invoices for membership billing, event deposits, manual charges
- `ar_receipts` are customer payments against invoices
- The existing customer profile drawer has AR/billing tabs — AR pages complement, not replace, those views
- AR amounts are NUMERIC(12,2) dollars

**Backend APIs available:**
- `GET/POST /api/v1/ar/invoices` — list/create invoices
- `GET/PATCH /api/v1/ar/invoices/[id]`
- `POST /api/v1/ar/invoices/[id]/post` — post invoice
- `POST /api/v1/ar/invoices/[id]/void` — void invoice
- `GET/POST /api/v1/ar/receipts` — list/create receipts
- `POST /api/v1/ar/receipts/[id]/post` — post receipt
- `POST /api/v1/ar/receipts/[id]/void` — void receipt
- `GET /api/v1/ar/reports/aging` — AR aging
- `GET /api/v1/ar/reports/customer-ledger/[customerId]` — customer ledger
- `GET /api/v1/ar/reports/open-invoices` — open invoices

### 1. AR Invoices List Page

**Files:**
- `apps/web/src/app/(dashboard)/ar/invoices/page.tsx`
- `apps/web/src/app/(dashboard)/ar/invoices/invoices-content.tsx`

**Layout:** `AccountingPageShell` — "AR Invoices", actions: "New Invoice"

**Filters:** Customer, status, date range, location, source type, "overdue only" toggle

**Table:**
- Columns: Invoice #, Customer Name, Invoice Date, Due Date, Total, Balance Due, Source Type (badge), Status
- Due date red if overdue
- Source type badges: Manual=blue, Membership=purple, Event=green, POS House Account=teal

**Summary cards:**
- Total Outstanding
- Overdue Amount
- Invoices Due This Week

### 2. Invoice Create/Edit Form

**Files:**
- `apps/web/src/app/(dashboard)/ar/invoices/new/page.tsx`
- `apps/web/src/app/(dashboard)/ar/invoices/new/invoice-form-content.tsx`

**Header:**
- Customer (searchable — on selection, auto-fills billing account if exists)
- Billing Account (optional, auto-filled from customer)
- Invoice Date (date picker)
- Due Date (date picker)
- Source Type (select: Manual, Membership, Event)
- Location (optional)
- Memo

**Lines grid:**
- Columns: Revenue Account (picker, filtered to revenue accounts), Description, Qty, Unit Price, Amount, Tax Group, Tax Amount
- "Add Line" button
- Amount = qty × unitPrice (auto-calc)

**Totals:**
- Subtotal, Tax Total, Grand Total

**GL Preview:** Debit AR Control, Credit Revenue accounts + Tax Payable

**Submit:** "Save Draft" / "Save & Post"

### 3. Invoice Detail Page

Similar structure to AP bill detail:
- Header with status, amounts, customer info
- Lines tab, GL Entry tab, Receipts tab, Activity timeline
- Actions: Edit (draft), Post, Void, "Record Receipt"

### 4. AR Receipts List Page

**Files:**
- `apps/web/src/app/(dashboard)/ar/receipts/page.tsx`
- `apps/web/src/app/(dashboard)/ar/receipts/receipts-content.tsx`

**Table:** Date, Customer, Payment Method, Reference, Amount, Status, Source Type

### 5. Receipt Create Form

**Similar to AP payment form:**
- Customer (required — loads open invoices)
- Receipt Date, Payment Method, Reference #
- Amount
- Invoice allocation grid (same pattern as AP bill allocation)
- GL Preview: Debit Cash/Bank, Credit AR Control

### 6. AR Aging Report

Same pattern as AP aging but by customer:
- Rows per customer, columns: Current, 1-30, 31-60, 61-90, 90+, Total
- Expand to see individual invoices
- Summary cards, export

### 7. Customer Ledger

Same pattern as vendor ledger:
- Select customer, date range
- Chronological: invoices (charges), receipts (payments), credits
- Running balance

### 8. Integration with Customer Profile Drawer

Add a link or button in the existing customer profile drawer's billing/AR tab that navigates to the full AR pages. The drawer shows operational AR (house account activity); the AR pages show the full accounting view.

### 9. Hooks

**File: `apps/web/src/hooks/use-ar.ts`**

```typescript
export function useARInvoices(filters)
export function useARInvoice(id: string)
export function useARInvoiceMutations()
export function useARReceipts(filters)
export function useARReceiptMutations()
export function useARAging(params)
export function useCustomerLedger(customerId, params)
export function useOpenInvoices(params)
```

### 10. Tests (~5)

- Invoice form auto-fills billing account from customer
- Invoice line amount auto-calculates
- Receipt allocation respects invoice balance due
- AR aging groups by customer correctly
- Customer ledger running balance is accurate

---

## Session 42 — Financial Statements + Period Close + Accounting Dashboard UI

### Preamble

You are building the Financial Statements, Period Close, and Accounting Dashboard for OppsEra (Session 42). Read CONVENTIONS.md and CLAUDE.md first.

This session builds the P&L, Balance Sheet, Cash Flow viewers, the period close workflow UI, and completes the accounting dashboard with real data.

**Backend APIs available:**
- `GET /api/v1/accounting/statements/profit-loss`
- `GET /api/v1/accounting/statements/balance-sheet`
- `GET /api/v1/accounting/statements/cash-flow`
- `GET /api/v1/accounting/statements/comparison`
- `GET /api/v1/accounting/statements/health-summary`
- `GET /api/v1/accounting/reports/sales-tax-liability`
- `GET/POST /api/v1/accounting/statement-layouts`
- `GET /api/v1/accounting/close-periods`
- `GET /api/v1/accounting/close-periods/[period]` (with checklist)
- `PATCH /api/v1/accounting/close-periods/[period]`
- `POST /api/v1/accounting/close-periods/[period]/close`

### 1. Profit & Loss Statement Page

**Files:**
- `apps/web/src/app/(dashboard)/accounting/statements/profit-loss/page.tsx`
- `apps/web/src/app/(dashboard)/accounting/statements/profit-loss/pnl-content.tsx`

**Layout:** `AccountingPageShell` — "Profit & Loss Statement"

**Controls bar:**
- Date range (required — default: current month)
- Location filter (optional — "All Locations" default)
- Comparative toggle: "Show prior period" (adds prior period column)
- Layout selector (if custom layouts exist)

**Statement display:**
- Professional financial statement format (NOT a data table — use proper statement indentation and formatting)
- Sections follow layout or default classification grouping:

```
Revenue
  4010  Green Fees Revenue           $45,200.00
  4020  Cart Rental Revenue          $12,800.00
  4030  Pro Shop Sales               $28,400.00
  ...
  Total Revenue                      $148,600.00

Cost of Goods Sold
  5010  Pro Shop COGS                $14,200.00
  5020  F&B COGS                     $8,100.00
  Total COGS                         $22,300.00

Gross Profit                         $126,300.00

Operating Expenses
  6010  Payroll - Golf Operations    $32,000.00
  ...
  Total Operating Expenses           $89,500.00

Net Income                           $36,800.00
```

- If comparative enabled: two columns (Current Period, Prior Period, $ Change, % Change)
- Negative amounts in parentheses: $(1,200.00)
- Subtotal rows bold, grand total double-underlined
- Section headers are styled differently from account rows

**Export:** "Export CSV", "Print" buttons

### 2. Balance Sheet Page

**Files:**
- `apps/web/src/app/(dashboard)/accounting/statements/balance-sheet/page.tsx`
- `apps/web/src/app/(dashboard)/accounting/statements/balance-sheet/balance-sheet-content.tsx`

**Controls:** As-of date (default: today), location filter

**Statement display:**

```
ASSETS
  Current Assets
    1010  Cash on Hand               $8,200.00
    1020  Operating Checking         $42,500.00
    1100  Accounts Receivable        $15,800.00
    ...
    Total Current Assets             $78,500.00
  Fixed Assets
    ...
    Total Fixed Assets               $125,000.00
  Total Assets                       $203,500.00

LIABILITIES
  Current Liabilities
    2000  Accounts Payable           $12,400.00
    ...
    Total Current Liabilities        $28,600.00
  Total Liabilities                  $28,600.00

EQUITY
  3000  Retained Earnings            $138,100.00
  Current Year Net Income            $36,800.00
  Total Equity                       $174,900.00

Total Liabilities & Equity           $203,500.00
```

- Balance check at bottom: "Assets = Liabilities + Equity ✓" (green) or "OUT OF BALANCE" (red alert)
- Retained earnings includes current year P&L if year not yet closed

### 3. Cash Flow Statement Page

**Files:**
- `apps/web/src/app/(dashboard)/accounting/statements/cash-flow/page.tsx`
- `apps/web/src/app/(dashboard)/accounting/statements/cash-flow/cash-flow-content.tsx`

Simplified cash flow (v1):

```
Operating Activities
  Net Income                         $36,800.00
  Change in Accounts Payable         $3,200.00
  Change in Accounts Receivable      $(2,100.00)
  Net Cash from Operations           $37,900.00

Investing Activities
  (No data — future module)          $0.00

Financing Activities
  (No data — future module)          $0.00

Net Change in Cash                   $37,900.00
Beginning Cash Balance               $12,800.00
Ending Cash Balance                  $50,700.00
```

Note at bottom: "This is a simplified cash flow statement. Full indirect method available in a future update."

### 4. Sales Tax Liability Report Page

**Files:**
- `apps/web/src/app/(dashboard)/accounting/reports/sales-tax/page.tsx`
- `apps/web/src/app/(dashboard)/accounting/reports/sales-tax/sales-tax-content.tsx`

**Controls:** Date range (required — default: current quarter)

**Table:**
- Columns: Tax Group, Jurisdiction, Rate, Tax Collected, Tax Remitted, Net Liability
- Footer: totals
- Color coding: positive liability = red (you owe), zero = green

**Purpose:** "What do I owe to each tax authority for this period?"

### 5. Period Close Workflow Page

**Files:**
- `apps/web/src/app/(dashboard)/accounting/close/page.tsx`
- `apps/web/src/app/(dashboard)/accounting/close/close-content.tsx`

**Layout:** `AccountingPageShell` — "Period Close"

**Period timeline (horizontal):**
- Shows last 12 months as circles/nodes
- Color: green (closed), yellow (in review), blue (open/current), gray (future)
- Click a period to select it

**Selected period detail:**

**Checklist cards (stacked vertically):**
Each card shows a close step with pass/fail/warning status:

1. ✓/✗ Open Draft Entries — "X draft journal entries need to be posted or deleted" (link to filtered journal list)
2. ✓/✗ Unmapped Events — "X unmapped events need resolution" (link to unmapped events page)
3. ✓/✗ AP Reconciliation — "AP subledger matches GL control: $X vs $X" (link to reconciliation detail)
4. ✓/✗ AR Reconciliation — "AR subledger matches GL control"
5. ✓/✗ Trial Balance — "Trial balance is balanced / out of balance by $X"
6. ✓/⚠ Negative Inventory — "X items have negative stock" (warning, not blocking)

Each card:
- Status icon (✓ green, ✗ red, ⚠ yellow)
- Description
- Detail text
- Action link to fix the issue

**Actions:**
- "Move to Review" button (status → in_review)
- "Close Period" button (requires all checklist items to pass, sets status → closed, locks period)
- Notes textarea for close notes
- If fiscal year end: "Generate Retained Earnings" button → confirmation dialog explaining the P&L → retained earnings transfer

### 6. Accounting Dashboard (Complete)

**Update `apps/web/src/app/(dashboard)/accounting/accounting-content.tsx` from Session 35:**

Now wired to real data via `GET /api/v1/accounting/statements/health-summary`.

**KPI Cards (top row, 4 cards):**
1. Net Income — current month + sparkline trend (last 6 months)
2. Cash Balance — current cash on hand
3. AP Balance — total outstanding
4. AR Balance — total outstanding

**Second row (2 wider cards):**
5. Working Capital — Current Assets - Current Liabilities (with trend)
6. Mapping Coverage — X% with progress bar and "Configure" link

**Third row:**
7. Recent Journal Entries — last 5, with links
8. Unmapped Events alert (if count > 0) — banner with count and link
9. Period Close Status — current period with mini checklist

**Auto-refresh:** 60-second interval (following existing reporting dashboard pattern)

### 7. Statement Layout Editor

**File: `apps/web/src/components/accounting/statement-layout-editor.tsx`**

Accessible from P&L and Balance Sheet pages via "Customize Layout" button.

Portal dialog or slide-out panel:
- Drag-and-drop sections
- Each section: label, list of classification IDs or account IDs to include
- Preview pane showing how the statement will look
- Save as new layout or update existing

### 8. Hooks

**File: `apps/web/src/hooks/use-statements.ts`**

```typescript
export function useProfitAndLoss(params)
export function useBalanceSheet(params)
export function useCashFlow(params)
export function usePeriodComparison(params)
export function useSalesTaxLiability(params)
export function useHealthSummary()
export function useClosePeriods()
export function useClosePeriod(period: string)
export function useCloseMutations()
  // updateCloseStatus, closePeriod, generateRetainedEarnings
export function useStatementLayouts(statementType)
export function useStatementLayoutMutations()
```

### 9. Tests (~5)

- P&L renders correct net income (revenue - expenses)
- Balance sheet flags out-of-balance condition
- Period close checklist renders with correct pass/fail states
- Dashboard KPI cards display formatted amounts
- Sales tax shows net liability per group

---

## Session 43 — Cross-Module Integration + Reconciliation + Setup Wizard + Polish

### Preamble

You are completing the Accounting UX for OppsEra (Session 43). Read CONVENTIONS.md and CLAUDE.md first.

This final session ties everything together: the POS-to-accounting bridge status, legacy migration status, full reconciliation dashboard, the complete onboarding/setup flow, mobile responsiveness pass, and component polish.

**CRITICAL CONTEXT:**
- The POS posting adapter (backend Session 32) creates GL entries from tenders
- The legacy bridge adapter migrates existing payment_journal_entries to GL
- Reconciliation compares AP/AR subledger totals to GL control account balances
- Setup wizard should guide a new tenant through the complete accounting configuration

### 1. Reconciliation Dashboard

**Files:**
- `apps/web/src/app/(dashboard)/accounting/reconciliation/page.tsx`
- `apps/web/src/app/(dashboard)/accounting/reconciliation/reconciliation-content.tsx`

**Layout:** `AccountingPageShell` — "Reconciliation Dashboard"

**Two main cards:**

**AP Reconciliation:**
- GL AP Control Balance: $X
- AP Subledger Balance: $X (sum of open bills - payments)
- Difference: $X (green if 0, red if ≠ 0)
- "View Details" → expandable section showing unmatched items
- As-of date selector

**AR Reconciliation:**
- Same structure for AR
- GL AR Control Balance vs AR subledger balance

**Reconciliation History:**
- Table of past reconciliation checks with date, module, result (matched/unmatched), difference
- Helps track when reconciliation broke

### 2. POS Integration Status Page

**File: `apps/web/src/components/accounting/pos-integration-status.tsx`**

Accessible from accounting dashboard or settings.

**Shows:**
- POS Posting Status: Enabled/Disabled (from accounting settings)
- Auto-post mode: Auto-post / Draft only
- Mapping coverage (departments, payment types, tax groups)
- Recent POS GL entries (last 10 tenders that posted to GL)
- Failed/Skipped postings (from unmapped events)
- "Last successful posting: [timestamp]"

### 3. Setup Wizard (Enhanced)

**File: `apps/web/src/components/accounting/setup-wizard.tsx`**

Enhances the bootstrap wizard from Session 36 to be a complete setup guide:

**Steps:**
1. **Bootstrap COA** — if not done, run bootstrap from template
2. **Configure Control Accounts** — ensure AP, AR, Tax, Retained Earnings are set
3. **Set Up GL Mappings** — walk through each sub-department, payment type, tax group
   - Shows count: "12 of 15 departments mapped"
   - Quick-map: "Apply default revenue account to all unmapped departments"
4. **Register Bank Accounts** — add at least one bank, set default
5. **Enable POS Posting** — toggle + confirm understanding
6. **Review** — summary of configuration with any warnings

**Progress saved:** wizard state persisted to localStorage so user can resume

### 4. Mobile Responsiveness Pass

Review all accounting pages for mobile (320px+):

**General rules:**
- Tables become card lists on mobile (<640px)
- Filter bars collapse to a "Filters" button opening a sheet/drawer
- Action bars stack vertically
- Statement pages use single-column layout on mobile
- Dialog max-width: 90vw on mobile, 640px on desktop
- Money inputs full-width on mobile
- Account pickers use bottom-sheet on mobile instead of dropdown

**Specific adjustments:**
- Journal lines table: horizontal scroll on mobile with sticky first column (Account)
- Bill/Invoice form: full-width lines, stacked instead of grid
- Trial balance: horizontal scroll with sticky account name column
- Financial statements: indent reduced, smaller font, still readable
- Period close timeline: vertical on mobile instead of horizontal

### 5. Error States & Loading Patterns

Ensure all accounting pages have:
- **Loading skeletons** — per-page custom skeletons (not just spinner)
- **Error states** — retry button, error message, link to support
- **Empty states** — contextual CTAs (not just "No data")
- **Permission denied** — "You don't have permission to view this page. Contact your administrator."
- **Not bootstrapped** — redirect to setup wizard if accounting not configured

### 6. Keyboard Shortcuts

Add keyboard shortcuts for power users (accounting staff use these pages all day):

- `N` — New entry/bill/invoice (context-dependent)
- `S` — Save draft
- `P` — Post (with confirmation)
- `/` — Focus search/filter
- `Esc` — Close dialog/panel
- `Ctrl+Enter` — Submit form

### 7. Print Styles

Add print CSS for financial statements:
- Clean headers with company name and report title
- No navigation, no sidebar
- Proper page breaks between sections
- Footer with "Generated by OppsEra on [date]"
- Monochrome-friendly (no color dependency)

### 8. Final Hook Cleanup

**File: `apps/web/src/hooks/use-accounting-nav.ts`**

```typescript
export function useAccountingNav()
  // Returns navigation items with permission gating and active state
  // Used by sidebar to render accounting section

export function useAccountingSetupStatus()
  // Comprehensive check: bootstrapped + settings configured + mappings coverage
  // Returns: { isComplete: boolean, steps: StepStatus[] }
```

### 9. Tests (~5)

- Reconciliation correctly flags mismatched balances
- Setup wizard completes all steps
- Mobile layout switches from table to cards at breakpoint
- Print styles hide navigation elements
- Permission-gated actions are hidden when user lacks permission

---

## Implementation Notes

### Session Dependencies

```
Session 35 (Foundation) ─┬─→ Session 36 (COA + Settings)
                         ├─→ Session 37 (Journals + GL Reports) ──→ depends on 36 (accounts exist)
                         ├─→ Session 38 (Mappings + Banks) ──→ depends on 36 (accounts exist)
                         ├─→ Session 39 (AP Bills) ──→ depends on 36, 38 (accounts + mappings)
                         ├─→ Session 40 (AP Payments + Reports) ──→ depends on 39
                         ├─→ Session 41 (AR Invoices + Reports) ──→ depends on 36
                         ├─→ Session 42 (Statements + Close + Dashboard) ──→ depends on 37, 39, 41
                         └─→ Session 43 (Integration + Polish) ──→ depends on all above
```

Sessions 36–38 can run in parallel. Sessions 39 and 41 can run in parallel. Session 42 requires 37, 39, 41. Session 43 is always last.

### Recommended Session Order

1. **Session 35** — Foundation (must be first)
2. **Session 36** — COA + Settings (must be second — everything needs accounts)
3. **Session 37** — Journals + GL Reports
4. **Session 38** — Mappings + Banks (can swap with 37)
5. **Session 39** — AP Bills
6. **Session 40** — AP Payments + Reports
7. **Session 41** — AR (can swap with 39-40 block)
8. **Session 42** — Statements + Close + Dashboard
9. **Session 43** — Integration + Polish (always last)

### Estimated Test Count

| Session | Tests |
|---------|-------|
| 35 | ~5 |
| 36 | ~5 |
| 37 | ~5 |
| 38 | ~5 |
| 39 | ~5 |
| 40 | ~5 |
| 41 | ~5 |
| 42 | ~5 |
| 43 | ~5 |
| **Total** | **~45** |

### File Count Estimate

- ~24 page files (thin code-split wrappers)
- ~24 content files (heavy page content)
- ~30 component files (shared + module-specific)
- ~10 hook files
- ~3 type files
- ~9 test files
- **Total: ~100 new files**
