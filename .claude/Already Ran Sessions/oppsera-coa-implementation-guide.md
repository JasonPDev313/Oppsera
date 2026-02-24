# Oppsera — Chart of Accounts System: Complete Implementation Guide

> **Role**: Staff ERP Architect + Accounting Systems Engineer
> **Module**: General Ledger → Chart of Accounts → Setup / Bootstrap
> **Runtime**: Node.js/TypeScript + PostgreSQL (Prisma ORM)
> **Sessions**: 10 sequential Claude Code sessions

---

## TABLE OF CONTENTS

1. [Session 1 — Database Schema & Migrations](#session-1)
2. [Session 2 — Enums, Types & Shared Constants](#session-2)
3. [Session 3 — Bootstrap Template Seed Data (All 4 Industries)](#session-3)
4. [Session 4 — State Placeholder Replacement Engine](#session-4)
5. [Session 5 — CSV Import Parser & Validator](#session-5)
6. [Session 6 — Validation Engine & Accounting Integrity](#session-6)
7. [Session 7 — Fallback Auto-Create Logic](#session-7)
8. [Session 8 — API Endpoints (CRUD + Bootstrap + Import)](#session-8)
9. [Session 9 — UX Flow Definitions & Frontend Components](#session-9)
10. [Session 10 — Tests, Error Handling & Integration Verification](#session-10)

---

<a id="session-1"></a>
## SESSION 1 — Database Schema & Migrations

### Goal
Create the full PostgreSQL schema for the Chart of Accounts system including all tables, indexes, constraints, and audit columns.

### Instructions

Create the following files. Use Prisma schema format. If the project already uses raw SQL migrations, create both.

### File: `prisma/schema/chart-of-accounts.prisma`

```prisma
// ============================================================
// CHART OF ACCOUNTS — DATABASE SCHEMA
// Module: General Ledger → Chart of Accounts
// ============================================================

// --- ENUMS ---

enum AccountType {
  ASSET
  CONTRA_ASSET
  LIABILITY
  EQUITY
  REVENUE
  COGS
  EXPENSE
}

enum AccountStatus {
  ACTIVE
  INACTIVE
  PENDING_MERGE
}

enum CoaSourceType {
  BOOTSTRAP_TEMPLATE
  CSV_IMPORT
  MANUAL
}

enum IndustryTemplate {
  RESTAURANT
  GOLF
  RETAIL
  HYBRID
}

// --- COA SETUP RECORD ---
// One per tenant. Tracks how COA was initialized.

model ChartOfAccountsSetup {
  id              String           @id @default(uuid()) @db.Uuid
  tenantId        String           @unique @map("tenant_id") @db.Uuid
  sourceType      CoaSourceType    @map("source_type")
  industryTemplate IndustryTemplate? @map("industry_template")
  csvFileName     String?          @map("csv_file_name")
  stateName       String?          @map("state_name")
  stateAbbrev     String?          @map("state_abbrev")
  bootstrappedAt  DateTime?        @map("bootstrapped_at")
  createdAt       DateTime         @default(now()) @map("created_at")
  updatedAt       DateTime         @updatedAt @map("updated_at")
  createdBy       String?          @map("created_by") @db.Uuid
  updatedBy       String?          @map("updated_by") @db.Uuid

  @@map("gl_coa_setup")
}

// --- ACCOUNT ---
// The core account record in the Chart of Accounts.

model Account {
  id                  String        @id @default(uuid()) @db.Uuid
  tenantId            String        @map("tenant_id") @db.Uuid
  accountNumber       String        @map("account_number")
  accountName         String        @map("account_name")
  accountType         AccountType   @map("account_type")
  accountSubType      String?       @map("account_sub_type")
  parentAccountId     String?       @map("parent_account_id") @db.Uuid
  parentAccountNumber String?       @map("parent_account_number")
  isActive            Boolean       @default(true) @map("is_active")
  isFallback          Boolean       @default(false) @map("is_fallback")
  isSystemAccount     Boolean       @default(false) @map("is_system_account")
  description         String?
  status              AccountStatus @default(ACTIVE)
  sortOrder           Int           @default(0) @map("sort_order")
  depth               Int           @default(0)
  path                String?       // Materialized path e.g. "13000.13010.13020"
  normalBalance       String?       @map("normal_balance") // DEBIT or CREDIT
  createdAt           DateTime      @default(now()) @map("created_at")
  updatedAt           DateTime      @updatedAt @map("updated_at")
  createdBy           String?       @map("created_by") @db.Uuid
  updatedBy           String?       @map("updated_by") @db.Uuid
  mergedIntoId        String?       @map("merged_into_id") @db.Uuid

  parent              Account?      @relation("AccountHierarchy", fields: [parentAccountId], references: [id])
  children            Account[]     @relation("AccountHierarchy")
  mergedInto          Account?      @relation("AccountMerge", fields: [mergedIntoId], references: [id])
  mergedFrom          Account[]     @relation("AccountMerge")
  auditLogs           AccountAuditLog[]

  @@unique([tenantId, accountNumber])
  @@index([tenantId, accountType])
  @@index([tenantId, isActive])
  @@index([tenantId, isFallback])
  @@index([tenantId, parentAccountId])
  @@map("gl_accounts")
}

// --- ACCOUNT AUDIT LOG ---

model AccountAuditLog {
  id            String   @id @default(uuid()) @db.Uuid
  tenantId      String   @map("tenant_id") @db.Uuid
  accountId     String   @map("account_id") @db.Uuid
  action        String   // CREATE, UPDATE, DEACTIVATE, MERGE, RENUMBER
  fieldChanged  String?  @map("field_changed")
  oldValue      String?  @map("old_value")
  newValue      String?  @map("new_value")
  changedBy     String?  @map("changed_by") @db.Uuid
  changedAt     DateTime @default(now()) @map("changed_at")
  metadata      Json?

  account       Account  @relation(fields: [accountId], references: [id])

  @@index([tenantId, accountId])
  @@index([tenantId, changedAt])
  @@map("gl_account_audit_log")
}

// --- BOOTSTRAP TEMPLATE ACCOUNT ---
// Master template data. Read-only reference.

model BootstrapTemplateAccount {
  id                  String           @id @default(uuid()) @db.Uuid
  industryTemplate    IndustryTemplate @map("industry_template")
  accountNumber       String           @map("account_number")
  accountName         String           @map("account_name")
  accountType         AccountType      @map("account_type")
  accountSubType      String?          @map("account_sub_type")
  parentAccountNumber String?          @map("parent_account_number")
  isActive            Boolean          @default(true) @map("is_active")
  description         String?
  isFallback          Boolean          @default(false) @map("is_fallback")
  isSystemAccount     Boolean          @default(false) @map("is_system_account")
  sortOrder           Int              @default(0) @map("sort_order")

  @@unique([industryTemplate, accountNumber])
  @@index([industryTemplate])
  @@map("gl_bootstrap_template_accounts")
}

// --- CSV IMPORT LOG ---

model CsvImportLog {
  id              String   @id @default(uuid()) @db.Uuid
  tenantId        String   @map("tenant_id") @db.Uuid
  fileName        String   @map("file_name")
  totalRows       Int      @map("total_rows")
  successRows     Int      @map("success_rows")
  errorRows       Int      @map("error_rows")
  errors          Json?
  status          String   // PENDING, VALIDATING, VALIDATED, IMPORTING, COMPLETE, FAILED
  importedBy      String?  @map("imported_by") @db.Uuid
  startedAt       DateTime @default(now()) @map("started_at")
  completedAt     DateTime? @map("completed_at")

  @@index([tenantId])
  @@map("gl_csv_import_log")
}

// --- GL MAPPING DEFAULTS ---

model GlMappingDefault {
  id              String   @id @default(uuid()) @db.Uuid
  tenantId        String   @map("tenant_id") @db.Uuid
  transactionType String   @map("transaction_type")
  accountId       String   @map("account_id") @db.Uuid
  createdAt       DateTime @default(now()) @map("created_at")
  updatedAt       DateTime @updatedAt @map("updated_at")

  @@unique([tenantId, transactionType])
  @@index([tenantId])
  @@map("gl_mapping_defaults")
}
```

### File: `prisma/migrations/XXXXXX_create_chart_of_accounts/migration.sql`

```sql
-- ============================================================
-- CHART OF ACCOUNTS — RAW SQL MIGRATION
-- ============================================================

CREATE TYPE "AccountType" AS ENUM (
  'ASSET', 'CONTRA_ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'COGS', 'EXPENSE'
);

CREATE TYPE "AccountStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'PENDING_MERGE');
CREATE TYPE "CoaSourceType" AS ENUM ('BOOTSTRAP_TEMPLATE', 'CSV_IMPORT', 'MANUAL');
CREATE TYPE "IndustryTemplate" AS ENUM ('RESTAURANT', 'GOLF', 'RETAIL', 'HYBRID');

CREATE TABLE "gl_coa_setup" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL UNIQUE,
  "source_type" "CoaSourceType" NOT NULL,
  "industry_template" "IndustryTemplate",
  "csv_file_name" TEXT,
  "state_name" TEXT,
  "state_abbrev" TEXT,
  "bootstrapped_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "created_by" UUID,
  "updated_by" UUID
);

CREATE TABLE "gl_accounts" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "account_number" TEXT NOT NULL,
  "account_name" TEXT NOT NULL,
  "account_type" "AccountType" NOT NULL,
  "account_sub_type" TEXT,
  "parent_account_id" UUID REFERENCES "gl_accounts"("id"),
  "parent_account_number" TEXT,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "is_fallback" BOOLEAN NOT NULL DEFAULT false,
  "is_system_account" BOOLEAN NOT NULL DEFAULT false,
  "description" TEXT,
  "status" "AccountStatus" NOT NULL DEFAULT 'ACTIVE',
  "sort_order" INT NOT NULL DEFAULT 0,
  "depth" INT NOT NULL DEFAULT 0,
  "path" TEXT,
  "normal_balance" TEXT CHECK ("normal_balance" IN ('DEBIT', 'CREDIT')),
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "created_by" UUID,
  "updated_by" UUID,
  "merged_into_id" UUID REFERENCES "gl_accounts"("id"),
  UNIQUE("tenant_id", "account_number")
);

CREATE INDEX "idx_gl_accounts_tenant_type" ON "gl_accounts"("tenant_id", "account_type");
CREATE INDEX "idx_gl_accounts_tenant_active" ON "gl_accounts"("tenant_id", "is_active");
CREATE INDEX "idx_gl_accounts_tenant_fallback" ON "gl_accounts"("tenant_id", "is_fallback");
CREATE INDEX "idx_gl_accounts_tenant_parent" ON "gl_accounts"("tenant_id", "parent_account_id");

CREATE TABLE "gl_account_audit_log" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "account_id" UUID NOT NULL REFERENCES "gl_accounts"("id"),
  "action" TEXT NOT NULL,
  "field_changed" TEXT,
  "old_value" TEXT,
  "new_value" TEXT,
  "changed_by" UUID,
  "changed_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "metadata" JSONB
);

CREATE INDEX "idx_gl_audit_tenant_account" ON "gl_account_audit_log"("tenant_id", "account_id");
CREATE INDEX "idx_gl_audit_tenant_date" ON "gl_account_audit_log"("tenant_id", "changed_at");

CREATE TABLE "gl_bootstrap_template_accounts" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "industry_template" "IndustryTemplate" NOT NULL,
  "account_number" TEXT NOT NULL,
  "account_name" TEXT NOT NULL,
  "account_type" "AccountType" NOT NULL,
  "account_sub_type" TEXT,
  "parent_account_number" TEXT,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "description" TEXT,
  "is_fallback" BOOLEAN NOT NULL DEFAULT false,
  "is_system_account" BOOLEAN NOT NULL DEFAULT false,
  "sort_order" INT NOT NULL DEFAULT 0,
  UNIQUE("industry_template", "account_number")
);

CREATE INDEX "idx_gl_bootstrap_template" ON "gl_bootstrap_template_accounts"("industry_template");

CREATE TABLE "gl_csv_import_log" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "file_name" TEXT NOT NULL,
  "total_rows" INT NOT NULL,
  "success_rows" INT NOT NULL,
  "error_rows" INT NOT NULL,
  "errors" JSONB,
  "status" TEXT NOT NULL,
  "imported_by" UUID,
  "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "completed_at" TIMESTAMPTZ
);

CREATE INDEX "idx_gl_csv_import_tenant" ON "gl_csv_import_log"("tenant_id");

CREATE TABLE "gl_mapping_defaults" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "transaction_type" TEXT NOT NULL,
  "account_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE("tenant_id", "transaction_type")
);

CREATE INDEX "idx_gl_mapping_tenant" ON "gl_mapping_defaults"("tenant_id");

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_gl_accounts_updated_at BEFORE UPDATE ON "gl_accounts" FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_gl_coa_setup_updated_at BEFORE UPDATE ON "gl_coa_setup" FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_gl_mapping_defaults_updated_at BEFORE UPDATE ON "gl_mapping_defaults" FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

### Verification Checklist (Session 1)
- [ ] All tables created without errors
- [ ] Unique constraints on `(tenant_id, account_number)` enforced
- [ ] Self-referential FK on `gl_accounts.parent_account_id` works
- [ ] Merge FK on `gl_accounts.merged_into_id` works
- [ ] All indexes created
- [ ] Triggers fire on UPDATE


---

<a id="session-2"></a>
## SESSION 2 — Enums, Types & Shared Constants

### Goal
Create all TypeScript types, enums, constants, and helper maps used across the COA system.

### File: `src/modules/general-ledger/chart-of-accounts/coa.types.ts`

```typescript
// ============================================================
// CHART OF ACCOUNTS — TYPES & ENUMS
// ============================================================

export enum AccountType {
  ASSET = 'ASSET',
  CONTRA_ASSET = 'CONTRA_ASSET',
  LIABILITY = 'LIABILITY',
  EQUITY = 'EQUITY',
  REVENUE = 'REVENUE',
  COGS = 'COGS',
  EXPENSE = 'EXPENSE',
}

export enum AccountStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  PENDING_MERGE = 'PENDING_MERGE',
}

export enum CoaSourceType {
  BOOTSTRAP_TEMPLATE = 'BOOTSTRAP_TEMPLATE',
  CSV_IMPORT = 'CSV_IMPORT',
  MANUAL = 'MANUAL',
}

export enum IndustryTemplate {
  RESTAURANT = 'RESTAURANT',
  GOLF = 'GOLF',
  RETAIL = 'RETAIL',
  HYBRID = 'HYBRID',
}

export enum NormalBalance {
  DEBIT = 'DEBIT',
  CREDIT = 'CREDIT',
}

export const NORMAL_BALANCE_MAP: Record<AccountType, NormalBalance> = {
  [AccountType.ASSET]: NormalBalance.DEBIT,
  [AccountType.CONTRA_ASSET]: NormalBalance.CREDIT,
  [AccountType.LIABILITY]: NormalBalance.CREDIT,
  [AccountType.EQUITY]: NormalBalance.CREDIT,
  [AccountType.REVENUE]: NormalBalance.CREDIT,
  [AccountType.COGS]: NormalBalance.DEBIT,
  [AccountType.EXPENSE]: NormalBalance.DEBIT,
};

export const FALLBACK_ACCOUNTS = {
  UNCATEGORIZED_INCOME: '99990',
  UNCATEGORIZED_EXPENSE: '99991',
  UNCATEGORIZED_ASSET: '99992',
  UNCATEGORIZED_LIABILITY: '99993',
  SUSPENSE_CLEARING: '99994',
} as const;

export const CSV_COLUMN_MAP = {
  accountNumber: ['AccountNumber', 'account_number', 'acct_no', 'number', 'acctnum'],
  accountName: ['AccountName', 'account_name', 'name', 'acct_name', 'description'],
  accountType: ['AccountType', 'account_type', 'type', 'acct_type'],
  accountSubType: ['AccountSubType', 'account_sub_type', 'sub_type', 'subtype'],
  parentAccountNumber: ['ParentAccountNumber', 'parent_account_number', 'parent', 'parent_acct'],
  isActive: ['IsActive', 'is_active', 'active', 'status'],
  description: ['Description', 'description', 'desc', 'notes', 'memo'],
} as const;

export const ACCOUNT_TYPE_ALIASES: Record<string, AccountType> = {
  'asset': AccountType.ASSET,
  'assets': AccountType.ASSET,
  'contra asset': AccountType.CONTRA_ASSET,
  'contra_asset': AccountType.CONTRA_ASSET,
  'contraasset': AccountType.CONTRA_ASSET,
  'liability': AccountType.LIABILITY,
  'liabilities': AccountType.LIABILITY,
  'equity': AccountType.EQUITY,
  'owners equity': AccountType.EQUITY,
  'revenue': AccountType.REVENUE,
  'income': AccountType.REVENUE,
  'sales': AccountType.REVENUE,
  'cogs': AccountType.COGS,
  'cost of goods sold': AccountType.COGS,
  'cost of sales': AccountType.COGS,
  'expense': AccountType.EXPENSE,
  'expenses': AccountType.EXPENSE,
};

export const STATE_PLACEHOLDER = '[STATE_NAME]';

// --- Interfaces ---

export interface AccountCreateInput {
  tenantId: string;
  accountNumber: string;
  accountName: string;
  accountType: AccountType;
  accountSubType?: string;
  parentAccountNumber?: string;
  isActive?: boolean;
  description?: string;
}

export interface AccountUpdateInput {
  accountName?: string;
  accountSubType?: string;
  parentAccountNumber?: string;
  isActive?: boolean;
  description?: string;
  sortOrder?: number;
}

export interface BootstrapRequest {
  tenantId: string;
  industryTemplate: IndustryTemplate;
  stateName: string;
  stateAbbrev: string;
  createdBy?: string;
}

export interface CsvImportRequest {
  tenantId: string;
  fileBuffer: Buffer;
  fileName: string;
  stateName?: string;
  stateAbbrev?: string;
  importedBy?: string;
}

export interface CsvRow {
  accountNumber: string;
  accountName: string;
  accountType: string;
  accountSubType?: string;
  parentAccountNumber?: string;
  isActive?: string;
  description?: string;
}

export interface ValidationError {
  row?: number;
  field: string;
  message: string;
  severity: 'ERROR' | 'WARNING';
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
  parsedAccounts: AccountCreateInput[];
}

export interface AccountMergeRequest {
  tenantId: string;
  sourceAccountId: string;
  targetAccountId: string;
  mergedBy?: string;
}

export interface CoaStatusSummary {
  totalAccounts: number;
  activeAccounts: number;
  inactiveAccounts: number;
  fallbackAccounts: number;
  hasFallbacksInUse: boolean;
  sourceType: CoaSourceType | null;
  industryTemplate: IndustryTemplate | null;
  lastModified: Date | null;
}
```

### File: `src/modules/general-ledger/chart-of-accounts/coa.constants.ts`

```typescript
// ============================================================
// CHART OF ACCOUNTS — CONSTANTS
// ============================================================

export const ACCOUNT_NUMBER_RANGES = {
  ASSET:        { min: 10000, max: 19999 },
  CONTRA_ASSET: { min: 10000, max: 19999 },
  LIABILITY:    { min: 20000, max: 29999 },
  EQUITY:       { min: 30000, max: 39999 },
  REVENUE:      { min: 40000, max: 49999 },
  COGS:         { min: 50000, max: 59999 },
  EXPENSE:      { min: 60000, max: 79999 },
  SYSTEM:       { min: 99990, max: 99999 },
} as const;

export const MAX_HIERARCHY_DEPTH = 5;

export const CSV_IMPORT_LIMITS = {
  MAX_FILE_SIZE_BYTES: 5 * 1024 * 1024, // 5MB
  MAX_ROWS: 2000,
  MIN_ROWS: 1,
  REQUIRED_COLUMNS: ['AccountNumber', 'AccountName', 'AccountType'],
} as const;

export const US_STATES: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas',
  CA: 'California', CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware',
  FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho',
  IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas',
  KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
  MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi',
  MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada',
  NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York',
  NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma',
  OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina',
  SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah',
  VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia',
  WI: 'Wisconsin', WY: 'Wyoming', DC: 'District of Columbia',
};
```

### Verification Checklist (Session 2)
- [ ] All types compile without errors
- [ ] `NORMAL_BALANCE_MAP` covers every `AccountType`
- [ ] `ACCOUNT_TYPE_ALIASES` handles common CSV variations
- [ ] `US_STATES` has all 50 states + DC
- [ ] No circular imports


---

<a id="session-3"></a>
## SESSION 3 — Bootstrap Template Seed Data (All 4 Industries)

### Goal
Create seed scripts that populate `gl_bootstrap_template_accounts` with all four industry templates. These are **master reference data** — never modified per tenant.

### CRITICAL DESIGN NOTES
- The `coreAccounts()` function generates the ~45 shared accounts (Assets 10000-14100, Liabilities 20000-26010, Equity 30000-33000, Fallbacks 99990-99994) that are IDENTICAL across all 4 templates.
- Each industry function (e.g., `restaurantAccounts()`) adds ONLY the industry-specific accounts (Inventory sub-accounts, Revenue, COGS, Labor, OpEx).
- All `[STATE_NAME]` placeholders MUST be preserved in seed data — replacement happens at bootstrap time, not seed time.
- All fallback accounts MUST have `isFallback: true` and `isSystemAccount: true`.

### File: `src/modules/general-ledger/chart-of-accounts/seeds/bootstrap-templates.seed.ts`

Create a TypeScript file that exports `getAllTemplateAccounts()` and `getTemplateAccountsByIndustry(template)`.

**Structure:**

```typescript
import { AccountType, IndustryTemplate } from '../coa.types';

interface TemplateSeedAccount {
  industryTemplate: IndustryTemplate;
  accountNumber: string;
  accountName: string;
  accountType: AccountType;
  accountSubType: string | null;
  parentAccountNumber: string | null;
  isActive: boolean;
  description: string | null;
  isFallback: boolean;
  isSystemAccount: boolean;
  sortOrder: number;
}
```

**Core Accounts (shared across ALL templates):**

| AcctNum | Name | Type | SubType | Parent |
|---------|------|------|---------|--------|
| 10000 | Cash - Operating | ASSET | Cash | — |
| 10005 | Cash - Petty Cash | ASSET | Cash | — |
| 10010 | Cash - Clearing / Undeposited Funds | ASSET | Cash | — |
| 10020 | Credit Cards / ACH Clearing | ASSET | Cash Equivalent | — |
| 10030 | Bank Deposits To Reconcile - Cash | ASSET | Cash Equivalent | — |
| 10031 | Bank Deposits To Reconcile - Cards/ACH | ASSET | Cash Equivalent | — |
| 11000 | Accounts Receivable | ASSET | Accounts Receivable | — |
| 11010 | Allowance for Doubtful Accounts | CONTRA_ASSET | Allowance | 11000 |
| 12000 | Inventory Asset | ASSET | Inventory | — |
| 12010 | Prepaid Expenses | ASSET | Prepaids | — |
| 13000 | Fixed Assets | ASSET | Fixed Assets | — |
| 13010 | Buildings | ASSET | Fixed Assets | 13000 |
| 13020 | Furniture & Fixtures | ASSET | Fixed Assets | 13000 |
| 13030 | Computers & Office Equipment | ASSET | Fixed Assets | 13000 |
| 13040 | Equipment | ASSET | Fixed Assets | 13000 |
| 13900 | Accumulated Depreciation | CONTRA_ASSET | Accumulated Depreciation | 13000 |
| 14000 | Intangible Assets | ASSET | Intangibles | — |
| 14010 | Goodwill | ASSET | Intangibles | 14000 |
| 14020 | Patents, Copyrights & Franchises | ASSET | Intangibles | 14000 |
| 14100 | Accumulated Amortization | CONTRA_ASSET | Accumulated Amortization | 14000 |
| 20000 | Accounts Payable | LIABILITY | Accounts Payable | — |
| 20010 | Credit Cards Payable | LIABILITY | Credit Cards Payable | — |
| 21000 | Accrued Expenses | LIABILITY | Accrued Expenses | — |
| 21010 | Accrued Payroll | LIABILITY | Accrued Payroll | 21000 |
| 21020 | Payroll Taxes Payable - Federal | LIABILITY | Payroll Liabilities | 21000 |
| 21021 | Payroll Taxes Payable - [STATE_NAME] | LIABILITY | Payroll Liabilities | 21000 |
| 21030 | FUTA Payable | LIABILITY | Payroll Liabilities | 21000 |
| 21031 | SUI Payable - [STATE_NAME] | LIABILITY | Payroll Liabilities | 21000 |
| 22000 | Sales Tax Payable - [STATE_NAME] | LIABILITY | Sales Tax Payable | — |
| 23000 | Gift Cards / Stored Value Liability | LIABILITY | Deferred Revenue | — |
| 24000 | Customer Deposits / Event Deposits | LIABILITY | Customer Deposits | — |
| 25000 | Deferred Revenue | LIABILITY | Deferred Revenue | — |
| 25010 | Deferred Revenue - Memberships / Subscriptions | LIABILITY | Deferred Revenue | 25000 |
| 26000 | Loans Payable - Long Term | LIABILITY | Long Term Debt | — |
| 26010 | Line of Credit | LIABILITY | Short Term Debt | — |
| 30000 | Owner's Equity / Capital | EQUITY | Capital | — |
| 31000 | Owner Distributions | EQUITY | Distributions | — |
| 32000 | Retained Earnings | EQUITY | Retained Earnings | — |
| 33000 | Current Year Earnings | EQUITY | Current Earnings | — |
| 99990 | Uncategorized Income | REVENUE | Uncategorized | — | *(fallback)* |
| 99991 | Uncategorized Expense | EXPENSE | Uncategorized | — | *(fallback)* |
| 99992 | Uncategorized Asset | ASSET | Uncategorized | — | *(fallback)* |
| 99993 | Uncategorized Liability | LIABILITY | Uncategorized | — | *(fallback)* |
| 99994 | Suspense Clearing | EQUITY | Suspense | — | *(fallback)* |

**Industry-specific accounts are defined in the CSV data in Appendix A.** Build the seed functions by parsing each industry's unique accounts from the provided CSVs (everything after the shared core accounts).

### File: `src/modules/general-ledger/chart-of-accounts/seeds/run-seed.ts`

```typescript
import { PrismaClient } from '@prisma/client';
import { getAllTemplateAccounts } from './bootstrap-templates.seed';

const prisma = new PrismaClient();

async function seed() {
  console.log('Seeding bootstrap template accounts...');
  const accounts = getAllTemplateAccounts();

  for (const acct of accounts) {
    await prisma.bootstrapTemplateAccount.upsert({
      where: {
        industryTemplate_accountNumber: {
          industryTemplate: acct.industryTemplate,
          accountNumber: acct.accountNumber,
        },
      },
      update: { ...acct },
      create: acct,
    });
  }

  console.log(`Seeded ${accounts.length} template accounts across 4 industries.`);
}

seed()
  .catch((e) => { console.error('Seed failed:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
```

### Verification Checklist (Session 3)
- [ ] Each industry template has core + industry-specific accounts
- [ ] All `[STATE_NAME]` placeholders present, no hardcoded state names
- [ ] All 5 fallback accounts (99990-99994) present in EACH template
- [ ] No duplicate account numbers within any single template
- [ ] All parent references are valid within each template
- [ ] Upsert is idempotent

---

<a id="session-4"></a>
## SESSION 4 — State Placeholder Replacement Engine

### Goal
Build the engine that replaces `[STATE_NAME]` placeholders with the tenant's actual state during bootstrap, and detects/converts hardcoded state names during CSV import.

### File: `src/modules/general-ledger/chart-of-accounts/services/state-placeholder.service.ts`

**Functions to implement:**

#### `replaceStatePlaceholder(accountName: string, stateName: string): string`
Replaces all `[STATE_NAME]` occurrences with the provided state name.
- Example: `"Sales Tax Payable - [STATE_NAME]"` + `"Michigan"` → `"Sales Tax Payable - Michigan"`
- Returns unchanged string if no placeholder found.
- Returns unchanged string if stateName is empty.

#### `convertHardcodedStateToPlaceholder(accountName: string): { converted: string; stateDetected: string | null }`
Scans account name for hardcoded state references and replaces them with `[STATE_NAME]`.
- Checks full state names first (sorted by length desc to avoid partial matches).
- Then checks abbreviation patterns ONLY in tax-related contexts (to avoid "IN" the preposition being treated as Indiana).
- Tax contexts: `XX Department of Revenue`, `XX Unemployment Tax`, `XX Payroll Tax`, `XX Sales Tax`, `XX SUI`, `XX SUTA`.
- Returns both the converted name and which state was detected.

#### `applyStatePlaceholders(accounts[], stateName): accounts[]`
Batch: applies `replaceStatePlaceholder` to an array of account objects.

#### `detectAndConvertStates(accounts[]): { accounts[], detections[] }`
Batch: scans array for hardcoded state names, returns converted accounts and a list of detections with `{ originalName, convertedName, state, index }`.

#### `isValidStateName(stateName: string): boolean`
Returns true if the input matches a US state name or abbreviation.

#### `resolveState(input: string): { name: string; abbrev: string } | null`
Resolves `"MI"` → `{ name: "Michigan", abbrev: "MI" }` or `"Michigan"` → same. Case-insensitive. Returns null if invalid.

### Verification Checklist (Session 4)
- [ ] `replaceStatePlaceholder` replaces all `[STATE_NAME]` occurrences
- [ ] `convertHardcodedStateToPlaceholder` catches "Michigan", "MI Unemployment Tax", etc.
- [ ] No false positives on "IN" preposition vs Indiana
- [ ] Multi-word states like "New York" handled correctly
- [ ] Batch operations work correctly
- [ ] `resolveState` handles both abbreviation and full name inputs
- [ ] All 50 states + DC recognized

---

<a id="session-5"></a>
## SESSION 5 — CSV Import Parser & Validator

### Goal
Build a robust CSV import pipeline that parses uploaded CSVs, maps columns flexibly, normalizes data, detects state references, validates structure, and produces either a validated account set or detailed error reports.

### File: `src/modules/general-ledger/chart-of-accounts/services/csv-import.service.ts`

**Main function: `parseCsvImport(fileBuffer: Buffer, stateName?: string): ValidationResult`**

**Pipeline Steps:**

1. **Parse CSV** using `csv-parse/sync` with options: `{ columns: true, skip_empty_lines: true, trim: true, bom: true, relaxColumnCount: true }`
2. **Validate row count** — must be between `MIN_ROWS` (1) and `MAX_ROWS` (2000)
3. **Map columns** — Use `CSV_COLUMN_MAP` to flexibly match headers. Match is case-insensitive. Required: AccountNumber, AccountName, AccountType.
4. **Normalize rows** — Trim all values, map to `CsvRow` interface
5. **Detect hardcoded states** — Run `detectAndConvertStates()` on all account names. Add WARNING if states detected.
6. **Validate each row:**
   - Account number: required, 3-10 digits only, no duplicates
   - Account name: required, max 200 chars
   - Account type: must match `ACCOUNT_TYPE_ALIASES` (case-insensitive)
   - Parent reference: flag as warning if parent not yet seen (may appear later), validate structurally after full parse
   - isActive: parse as boolean (false/0/no/inactive/n → false, else true)
7. **Structural validation** after all rows:
   - All parent references must exist in the final set
   - Circular reference detection (walk parent chain, detect cycles)
   - Check if fallback accounts exist → WARNING if missing (system will auto-create)
8. **Apply state name** — If `stateName` provided and account name contains `[STATE_NAME]`, replace it
9. **Return `ValidationResult`** with `isValid`, `errors[]`, `warnings[]`, `parsedAccounts[]`

**Error severity rules:**
- Missing/invalid required fields → ERROR (blocks import)
- Duplicate account numbers → ERROR
- Circular references → ERROR
- Missing parent references → ERROR
- Hardcoded state detection → WARNING (auto-converted)
- Missing fallback accounts → WARNING (auto-created)
- Account number outside typical range → WARNING

### Verification Checklist (Session 5)
- [ ] CSV parsing handles BOM, empty lines, quoted fields with commas
- [ ] Flexible column mapping works for all aliases in CSV_COLUMN_MAP
- [ ] Account type normalization handles "Contra Asset", "COGS", "Income", "expenses", etc.
- [ ] Duplicate account numbers detected
- [ ] Parent reference validation works (forward and backward references)
- [ ] Circular reference detection works for direct and indirect cycles
- [ ] State detection and conversion works during import
- [ ] Missing fallback accounts trigger warning not error
- [ ] Row numbers in errors are human-readable (1-based + header offset = row+2)

---

<a id="session-6"></a>
## SESSION 6 — Validation Engine & Accounting Integrity

### Goal
Build the validation engine that enforces accounting rules, hierarchy integrity, and provides real-time validation for the COA editor.

### File: `src/modules/general-ledger/chart-of-accounts/services/validation.service.ts`

**Functions:**

#### `validateFullCoa(accounts[]): { errors[], warnings[] }`
Full structural validation of entire COA:
1. All 5 fallback accounts must exist (ERROR if missing)
2. At least one active account per major type: ASSET, LIABILITY, EQUITY, REVENUE, EXPENSE (WARNING if missing)
3. No orphan parent references (ERROR)
4. No circular hierarchies (ERROR)
5. Hierarchy depth ≤ MAX_HIERARCHY_DEPTH (WARNING)
6. Account numbers within typical ranges for their type (WARNING)
7. No duplicate names under same parent (WARNING)
8. System/fallback accounts must be active (ERROR)

#### `validateSingleAccount(account, existingAccounts[]): ValidationError[]`
Single-account validation for create/edit:
- Account number: 3-10 digits, unique among existing
- Account name: required, ≤200 chars
- Parent exists and is active (if specified)
- Cannot deactivate system/fallback accounts
- Cannot use reserved range 99990-99999 for non-fallback accounts

#### `validateMerge(source, target): ValidationError[]`
- Cannot merge into self
- Must be same account type
- Source cannot be system/fallback
- Target must be active

#### `validateDeactivation(account, children[], hasTransactions): ValidationError[]`
- Block system/fallback accounts (ERROR)
- Block if active children exist (ERROR)
- Warn if account has transactions (WARNING — will be hidden from new entries but preserved in history)

### Verification Checklist (Session 6)
- [ ] Full COA validation catches missing fallbacks
- [ ] Circular hierarchy detection works for chains of any length
- [ ] Depth check warns at MAX_HIERARCHY_DEPTH
- [ ] Account number range warnings fire correctly
- [ ] Merge validation enforces same-type rule
- [ ] Deactivation blocked for system accounts
- [ ] Deactivation blocked when active children exist
- [ ] Single account validation works for both create and edit

---

<a id="session-7"></a>
## SESSION 7 — Fallback Auto-Create Logic

### Goal
Build the service that ensures every tenant always has fallback accounts, auto-creating them when missing, and the GL resolution logic that uses fallback accounts when mappings are incomplete.

### File: `src/modules/general-ledger/chart-of-accounts/services/fallback.service.ts`

**CORE PRINCIPLE: Transactions must NEVER be blocked by missing GL mappings.**

#### Fallback Account Definitions

| Number | Name | Type | Purpose |
|--------|------|------|---------|
| 99990 | Uncategorized Income | REVENUE | Fallback for unmapped income |
| 99991 | Uncategorized Expense | EXPENSE | Fallback for unmapped expenses |
| 99992 | Uncategorized Asset | ASSET | Fallback for unmapped assets |
| 99993 | Uncategorized Liability | LIABILITY | Fallback for unmapped liabilities |
| 99994 | Suspense Clearing | EQUITY | Absolute last resort balance keeper |

#### `ensureFallbackAccounts(prisma, tenantId, createdBy?): Promise<{ created[], existing[] }>`
- Idempotent — safe to call multiple times
- For each fallback: check if exists, create if missing, ensure active if exists
- Re-activates and re-marks as `isFallback=true, isSystemAccount=true` if someone previously modified them
- Called: after bootstrap, after CSV import, before journal entry if COA check fails, on tenant init

#### `resolveGlAccount(prisma, tenantId, transactionType, fallbackCategory): Promise<{ accountId, accountNumber, isFallback }>`
- Priority chain:
  1. Explicit GL mapping from `gl_mapping_defaults` → return mapped account
  2. Category-appropriate fallback (REVENUE→99990, EXPENSE→99991, ASSET→99992, LIABILITY→99993)
  3. Auto-create fallbacks if missing, then retry
  4. Absolute last resort: Suspense Clearing (99994)
- **NEVER returns null** — the system guarantee

#### `checkFallbackUsage(prisma, tenantId): Promise<{ hasFallbackActivity, fallbackSummary[] }>`
- Returns which fallback accounts have transactions posted to them
- Used to surface warnings in the dashboard ("You have 12 uncategorized transactions")

### Verification Checklist (Session 7)
- [ ] `ensureFallbackAccounts` is idempotent (running 10x produces same result as 1x)
- [ ] `resolveGlAccount` NEVER returns null under any condition
- [ ] Priority chain: mapping → fallback → ensure → suspense
- [ ] Fallback accounts always marked `isFallback: true, isSystemAccount: true`
- [ ] Re-activates fallbacks if someone previously deactivated them

---

<a id="session-8"></a>
## SESSION 8 — API Endpoints (CRUD + Bootstrap + Import)

### Goal
Build all API endpoints for the Chart of Accounts module.

### File: `src/modules/general-ledger/chart-of-accounts/coa.router.ts`

**Base path: `/api/v1/gl/chart-of-accounts`**

All routes require authentication. Permission levels: `gl:coa:read`, `gl:coa:write`, `gl:coa:admin`.

| Method | Path | Permission | Handler | Description |
|--------|------|------------|---------|-------------|
| GET | `/status` | read | getCoaStatus | COA config status + account counts |
| POST | `/bootstrap` | admin | bootstrapFromTemplate | Create COA from industry template |
| GET | `/templates` | read | listTemplates | List available templates with counts |
| GET | `/templates/:industry/preview` | read | previewTemplate | Preview template accounts |
| POST | `/import/validate` | admin | validateCsvImport | Validate CSV without importing |
| POST | `/import/execute` | admin | executeCsvImport | Validate + import CSV |
| GET | `/import/history` | read | getImportHistory | Past import logs |
| GET | `/accounts` | read | listAccounts | Paginated list with filters |
| GET | `/accounts/tree` | read | getAccountTree | Hierarchical tree view |
| GET | `/accounts/:id` | read | getAccount | Single account with children + audit |
| POST | `/accounts` | write | createAccount | Create new account |
| PUT | `/accounts/:id` | write | updateAccount | Update account fields |
| POST | `/accounts/:id/deactivate` | admin | deactivateAccount | Deactivate with validation |
| POST | `/accounts/:id/reactivate` | admin | reactivateAccount | Reactivate account |
| POST | `/accounts/merge` | admin | mergeAccounts | Merge source into target |
| POST | `/accounts/:id/renumber` | admin | renumberAccount | Change account number |
| POST | `/validate` | read | validateCoa | Run full COA health check |
| GET | `/mappings` | read | getMappings | Get GL mapping defaults |
| PUT | `/mappings` | write | updateMappings | Bulk update GL mappings |
| GET | `/audit-log` | read | getAuditLog | Paginated audit trail |

### File: `src/modules/general-ledger/chart-of-accounts/coa.controller.ts`

**Key implementation notes:**

1. **Bootstrap** (`POST /bootstrap`):
   - Validates industry template and state input
   - Rejects if COA already configured (409)
   - Runs in a transaction: create setup record → create all accounts with state replacement → resolve parent IDs → audit log each account
   - Returns count and confirmation

2. **CSV Import** (`POST /import/validate` and `/import/execute`):
   - Validate: parses + validates, returns preview without creating data
   - Execute: validates first, rejects if invalid (422), runs in transaction, ensures fallback accounts, logs import
   - Both accept optional `state` param

3. **CRUD**:
   - Create: validates via `validateSingleAccount`, resolves parent ID, creates audit log
   - Update: tracks changed fields, creates audit log per field change
   - Deactivate: runs `validateDeactivation`, rejects if blocking errors
   - Reactivate: simple status flip + audit

4. **Merge** (`POST /accounts/merge`):
   - Validates via `validateMerge`
   - Transaction: reparent children → mark source as PENDING_MERGE → set mergedIntoId → audit log
   - TODO: remap journal entries when that table exists

5. **Renumber** (`POST /accounts/:id/renumber`):
   - Checks uniqueness of new number
   - Transaction: update account number → update sortOrder → update children's parentAccountNumber → audit log

6. **Account Tree** (`GET /accounts/tree`):
   - Fetches all active accounts, builds tree structure in memory using parentAccountId
   - Returns nested JSON array

### Verification Checklist (Session 8)
- [ ] All endpoints follow RESTful conventions
- [ ] Bootstrap prevents duplicate setup (409)
- [ ] CSV validate returns preview without creating data
- [ ] CSV execute creates data transactionally
- [ ] All write operations include audit logging
- [ ] Merge reparents children and marks source as merged
- [ ] Renumber updates children's parent references
- [ ] Validation endpoint runs full COA health check
- [ ] Pagination works on list and audit-log endpoints
- [ ] Error responses use consistent format

---

<a id="session-9"></a>
## SESSION 9 — UX Flow Definitions & Frontend Components

### Goal
Define the complete UX flows for COA setup and management.

### File: `src/modules/general-ledger/chart-of-accounts/ux/UX_FLOWS.md`

#### FLOW 1: Initial Setup (First-Time Configuration)

**Entry Point:** `General Ledger → Chart of Accounts` (when no COA exists)

**Screen: Setup Wizard** — Three options:
1. **Start from Industry Template** — Pre-built, fully editable after creation
2. **Import from CSV** — Upload existing chart
3. **Start from Scratch** — Manual build, system auto-creates fallbacks

**Flow 1A: Bootstrap Template**
- Step 1: Select industry (Restaurant/Golf/Retail/Hybrid) with account count preview
- Step 2: Confirm state (dropdown, shows example: "Sales Tax Payable - Michigan")
- Step 3: Confirmation with "View Chart of Accounts" CTA

**Flow 1B: CSV Import**
- Step 1: Upload zone (drag & drop, max 5MB/2000 rows), state selector, download sample CSV link
- Step 2: Validation results — error count, warning count, preview table, import button only if valid

#### FLOW 2: Account Management (Post-Setup)

**Screen: Account List** — Paginated table with columns: #, Name (indented for hierarchy), Type, Status. Filters for type, active/inactive, search. System accounts shown with lock icon. Actions: Add Account, Validate, Tree View.

**Screen: Account Detail/Edit** — Form with: account number (+ renumber button), name, type, sub-type, parent (searchable dropdown), description, status toggle. Actions: Merge Into, Deactivate, View History.

**Screen: Merge Confirmation** — Shows source → target, lists what will happen (reclassify transactions, move children, deactivate source, preserve audit trail). Warning: cannot be undone.

#### FLOW 3: Health Check / Validation

**Screen: COA Health Dashboard** — Overall status (Healthy/Warning/Error), checklist of validation items, account distribution by type, fallback transaction count.

### File: `src/modules/general-ledger/chart-of-accounts/ux/components.spec.md`

**9 frontend components required:**

1. `CoaSetupWizard` — Multi-step wizard
2. `AccountList` — Paginated table with sort/filter/search
3. `AccountTreeView` — Hierarchical tree with expand/collapse and drag-to-reparent
4. `AccountForm` — Create/Edit with real-time validation
5. `AccountMergeDialog` — Source/target pickers with preview and confirmation
6. `CsvImportFlow` — Drag & drop, state selector, validation results, progress
7. `CoaHealthDashboard` — Summary cards, validation results, type distribution chart
8. `AuditLogViewer` — Timeline view with filters
9. `GlMappingEditor` — Transaction type → account mapping table with bulk save

### Verification Checklist (Session 9)
- [ ] All UX flows cover happy path and error states
- [ ] Wizard prevents forward navigation with validation errors
- [ ] CSV import shows validation BEFORE execution
- [ ] System accounts visually distinct and protected from destructive actions
- [ ] Merge flow has adequate confirmation/warning
- [ ] Health dashboard shows actionable information

---

<a id="session-10"></a>
## SESSION 10 — Tests, Error Handling & Integration Verification

### Goal
Create comprehensive test suites, error handling middleware, and integration verification scripts.

### Test Files to Create

#### `__tests__/state-placeholder.test.ts`
Test cases:
- `replaceStatePlaceholder`: replaces [STATE_NAME], handles multiple occurrences, returns unchanged if no placeholder, handles empty state
- `convertHardcodedStateToPlaceholder`: detects "Michigan", "MI Unemployment Tax", "New York Sales Tax"; no false positives on "Cash - Operating"
- `resolveState`: "MI" → Michigan, "michigan" → Michigan, "Narnia" → null
- `isValidStateName`: "California" → true, "CA" → true, "XY" → false
- `detectAndConvertStates`: batch detection works

#### `__tests__/validation.test.ts`
Test cases:
- `validateFullCoa`: passes with complete COA; errors on missing fallbacks; detects circular hierarchy
- `validateSingleAccount`: rejects invalid number format; rejects duplicates; rejects empty name; rejects reserved range for non-fallback
- `validateMerge`: rejects different types; rejects system accounts; rejects self-merge
- `validateDeactivation`: blocks system accounts; blocks with active children; warns on transactions

#### `__tests__/csv-import.test.ts`
Test cases:
- Parses valid CSV; rejects empty; rejects missing columns; detects duplicates
- Normalizes account types ("asset", "LIABILITIES", "Income", "Cost of Goods Sold", "expenses")
- Detects hardcoded state names; applies state to placeholders
- Warns about missing fallbacks; handles BOM and whitespace
- Rejects invalid account numbers; detects circular parent refs

#### `__tests__/bootstrap.test.ts`
For EACH of the 4 templates:
- Has accounts; no duplicate numbers; has all 5 fallbacks
- Uses [STATE_NAME] placeholder (never hardcoded); all parent refs valid
- Has at least one account per major type; fallbacks marked correctly
- Sort orders unique within template

### File: `middleware/coa-error-handler.ts`

Custom error classes:
- `CoaError` (base): statusCode, message, code, details
- `CoaValidationError` (422)
- `CoaConflictError` (409)
- `CoaNotFoundError` (404)
- `CoaForbiddenError` (403)

Error handler middleware catches:
- `CoaError` subclasses → structured JSON response
- Prisma P2002 (unique constraint) → 409 with field info
- Prisma P2003 (FK constraint) → 422
- Unhandled → 500 with generic message

### File: `scripts/verify-integration.ts`

Post-deployment verification script that checks:
1. Bootstrap template data exists in DB
2. Each industry has accounts
3. Each template has all 5 fallback accounts
4. No hardcoded state names in templates
5. All parent references valid within each template

Outputs pass/fail for each check, exits with code 1 if any failures.

### Verification Checklist (Session 10)
- [ ] All test files compile and pass
- [ ] State placeholder tests cover edge cases
- [ ] Validation tests cover all rules
- [ ] CSV import tests cover common real-world scenarios
- [ ] Bootstrap tests verify all 4 industries
- [ ] Error handler catches Prisma errors correctly
- [ ] Integration verification script runs clean
- [ ] No hardcoded state names anywhere in codebase

---

## APPENDIX A — Full CSV Datasets (Verbatim)

### Restaurant COA (`restaurant_coa.csv`)

```csv
AccountNumber,AccountName,AccountType,AccountSubType,ParentAccountNumber,IsActive,Description
10000,Cash - Operating,Asset,Cash,,True,Primary operating cash account.
10005,Cash - Petty Cash,Asset,Cash,,True,Petty cash on hand.
10010,Cash - Clearing / Undeposited Funds,Asset,Cash,,True,Undeposited cash/clearing.
10020,Credit Cards / ACH Clearing,Asset,Cash Equivalent,,True,Clearing for card/ACH batches prior to bank settlement.
10030,Bank Deposits To Reconcile - Cash,Asset,Cash Equivalent,,True,Cash deposits pending reconciliation.
10031,Bank Deposits To Reconcile - Cards/ACH,Asset,Cash Equivalent,,True,Card/ACH settlements pending reconciliation.
11000,Accounts Receivable,Asset,Accounts Receivable,,True,Trade receivables.
11010,Allowance for Doubtful Accounts,Contra Asset,Allowance,11000,True,Allowance for bad debts.
12000,Inventory Asset,Asset,Inventory,,True,Inventory asset control.
12010,Prepaid Expenses,Asset,Prepaids,,True,Prepaid expenses.
13000,Fixed Assets,Asset,Fixed Assets,,True,Fixed assets control.
13010,Buildings,Asset,Fixed Assets,13000,True,Buildings and improvements.
13020,Furniture & Fixtures,Asset,Fixed Assets,13000,True,Furniture and fixtures.
13030,Computers & Office Equipment,Asset,Fixed Assets,13000,True,IT and office equipment.
13040,Equipment,Asset,Fixed Assets,13000,True,Machinery and operational equipment.
13900,Accumulated Depreciation,Contra Asset,Accumulated Depreciation,13000,True,Accumulated depreciation.
14000,Intangible Assets,Asset,Intangibles,,True,Intangible assets.
14010,Goodwill,Asset,Intangibles,14000,True,Goodwill.
14020,"Patents, Copyrights & Franchises",Asset,Intangibles,14000,True,IP and franchise rights.
14100,Accumulated Amortization,Contra Asset,Accumulated Amortization,14000,True,Accumulated amortization.
20000,Accounts Payable,Liability,Accounts Payable,,True,Trade payables.
20010,Credit Cards Payable,Liability,Credit Cards Payable,,True,Corporate cards payable.
21000,Accrued Expenses,Liability,Accrued Expenses,,True,Accrued expenses control.
21010,Accrued Payroll,Liability,Accrued Payroll,21000,True,Accrued wages.
21020,Payroll Taxes Payable - Federal,Liability,Payroll Liabilities,21000,True,Federal payroll taxes payable.
21021,Payroll Taxes Payable - [STATE_NAME],Liability,Payroll Liabilities,21000,True,State payroll taxes payable.
21030,FUTA Payable,Liability,Payroll Liabilities,21000,True,Federal unemployment payable.
21031,SUI Payable - [STATE_NAME],Liability,Payroll Liabilities,21000,True,State unemployment payable.
22000,Sales Tax Payable - [STATE_NAME],Liability,Sales Tax Payable,,True,Sales tax collected and payable.
23000,Gift Cards / Stored Value Liability,Liability,Deferred Revenue,,True,Outstanding gift cards/stored value.
24000,Customer Deposits / Event Deposits,Liability,Customer Deposits,,True,Deposits held for events/reservations.
25000,Deferred Revenue,Liability,Deferred Revenue,,True,Deferred revenue control.
25010,Deferred Revenue - Memberships / Subscriptions,Liability,Deferred Revenue,25000,True,Membership/subscription revenue deferred.
26000,Loans Payable - Long Term,Liability,Long Term Debt,,True,Long-term debt.
26010,Line of Credit,Liability,Short Term Debt,,True,Revolving line of credit.
30000,Owner's Equity / Capital,Equity,Capital,,True,Owner contributions/capital.
31000,Owner Distributions,Equity,Distributions,,True,Owner draws/distributions.
32000,Retained Earnings,Equity,Retained Earnings,,True,Prior years retained earnings.
33000,Current Year Earnings,Equity,Current Earnings,,True,Current year earnings (system).
99990,Uncategorized Income,Revenue,Uncategorized,,True,Fallback income when GL mapping missing.
99991,Uncategorized Expense,Expense,Uncategorized,,True,Fallback expense when GL mapping missing.
99992,Uncategorized Asset,Asset,Uncategorized,,True,Fallback asset when GL mapping missing.
99993,Uncategorized Liability,Liability,Uncategorized,,True,Fallback liability when GL mapping missing.
99994,Suspense Clearing,Equity,Suspense,,True,Temporary clearing to keep journals balanced when configuration incomplete.
12030,Inventory - Food,Asset,Inventory,12000,True,
12031,Inventory - Beverage,Asset,Inventory,12000,True,
12032,Inventory - Alcohol,Asset,Inventory,12000,True,
12033,Inventory - Paper / Packaging,Asset,Inventory,12000,True,
40000,Restaurant Revenue,Revenue,Department Revenue,,True,
40100,Food Sales,Revenue,Restaurant Revenue,40000,True,
40200,Beverage Sales (Non-Alcohol),Revenue,Restaurant Revenue,40000,True,
40300,Alcohol Sales,Revenue,Restaurant Revenue,40000,True,
40400,Catering & Events Revenue,Revenue,Restaurant Revenue,40000,True,
40500,Delivery / Online Ordering Revenue,Revenue,Restaurant Revenue,40000,True,
40600,Service Charges,Revenue,Other Income,,True,
50000,Cost of Goods Sold,COGS,COGS Control,,True,
51100,COGS - Food,COGS,COGS - Food,50000,True,
51200,COGS - Beverage,COGS,COGS - Beverage,50000,True,
51300,COGS - Alcohol,COGS,COGS - Alcohol,50000,True,
51400,COGS - Paper / Packaging,COGS,COGS - Supplies,50000,True,
60000,Labor Expense,Expense,Labor Control,,True,
61000,Labor - Kitchen (BOH),Expense,Labor,60000,True,
61100,Labor - Front of House (FOH),Expense,Labor,60000,True,
61200,Labor - Management,Expense,Labor,60000,True,
62000,Payroll Taxes Expense,Expense,Payroll Taxes,60000,True,
63000,Employee Benefits,Expense,Benefits,60000,True,
70000,Operating Expenses,Expense,Opex Control,,True,
71000,Occupancy,Expense,Opex,70000,True,
71100,Utilities,Expense,Utilities,70000,True,
71200,Repairs & Maintenance,Expense,Opex,70000,True,
71300,Cleaning & Janitorial,Expense,Opex,70000,True,
71400,Smallwares / Supplies,Expense,Opex,70000,True,
71500,Waste Removal,Expense,Opex,70000,True,
71600,"Licenses, Taxes & Permits",Expense,Opex,70000,True,
71700,Insurance,Expense,Insurance,70000,True,
71800,Technology,Expense,Opex,70000,True,
71900,Merchant & Bank Fees,Expense,Opex,70000,True,
72000,Marketing Expenses,Expense,Marketing,,True,
73000,Administrative Expenses,Expense,Administrative,,True,
77000,Reconciliation Discrepancies,Expense,Other Expense,,True,
```

### Golf COA (`golf_coa.csv`)

```csv
AccountNumber,AccountName,AccountType,AccountSubType,ParentAccountNumber,IsActive,Description
10000,Cash - Operating,Asset,Cash,,True,Primary operating cash account.
10005,Cash - Petty Cash,Asset,Cash,,True,Petty cash on hand.
10010,Cash - Clearing / Undeposited Funds,Asset,Cash,,True,Undeposited cash/clearing.
10020,Credit Cards / ACH Clearing,Asset,Cash Equivalent,,True,Clearing for card/ACH batches prior to bank settlement.
10030,Bank Deposits To Reconcile - Cash,Asset,Cash Equivalent,,True,Cash deposits pending reconciliation.
10031,Bank Deposits To Reconcile - Cards/ACH,Asset,Cash Equivalent,,True,Card/ACH settlements pending reconciliation.
11000,Accounts Receivable,Asset,Accounts Receivable,,True,Trade receivables.
11010,Allowance for Doubtful Accounts,Contra Asset,Allowance,11000,True,Allowance for bad debts.
12000,Inventory Asset,Asset,Inventory,,True,Inventory asset control.
12010,Prepaid Expenses,Asset,Prepaids,,True,Prepaid expenses.
13000,Fixed Assets,Asset,Fixed Assets,,True,Fixed assets control.
13010,Buildings,Asset,Fixed Assets,13000,True,Buildings and improvements.
13020,Furniture & Fixtures,Asset,Fixed Assets,13000,True,Furniture and fixtures.
13030,Computers & Office Equipment,Asset,Fixed Assets,13000,True,IT and office equipment.
13040,Equipment,Asset,Fixed Assets,13000,True,Machinery and operational equipment.
13900,Accumulated Depreciation,Contra Asset,Accumulated Depreciation,13000,True,Accumulated depreciation.
14000,Intangible Assets,Asset,Intangibles,,True,Intangible assets.
14010,Goodwill,Asset,Intangibles,14000,True,Goodwill.
14020,"Patents, Copyrights & Franchises",Asset,Intangibles,14000,True,IP and franchise rights.
14100,Accumulated Amortization,Contra Asset,Accumulated Amortization,14000,True,Accumulated amortization.
20000,Accounts Payable,Liability,Accounts Payable,,True,Trade payables.
20010,Credit Cards Payable,Liability,Credit Cards Payable,,True,Corporate cards payable.
21000,Accrued Expenses,Liability,Accrued Expenses,,True,Accrued expenses control.
21010,Accrued Payroll,Liability,Accrued Payroll,21000,True,Accrued wages.
21020,Payroll Taxes Payable - Federal,Liability,Payroll Liabilities,21000,True,Federal payroll taxes payable.
21021,Payroll Taxes Payable - [STATE_NAME],Liability,Payroll Liabilities,21000,True,State payroll taxes payable.
21030,FUTA Payable,Liability,Payroll Liabilities,21000,True,Federal unemployment payable.
21031,SUI Payable - [STATE_NAME],Liability,Payroll Liabilities,21000,True,State unemployment payable.
22000,Sales Tax Payable - [STATE_NAME],Liability,Sales Tax Payable,,True,Sales tax collected and payable.
23000,Gift Cards / Stored Value Liability,Liability,Deferred Revenue,,True,Outstanding gift cards/stored value.
24000,Customer Deposits / Event Deposits,Liability,Customer Deposits,,True,Deposits held for events/reservations.
25000,Deferred Revenue,Liability,Deferred Revenue,,True,Deferred revenue control.
25010,Deferred Revenue - Memberships / Subscriptions,Liability,Deferred Revenue,25000,True,Membership/subscription revenue deferred.
26000,Loans Payable - Long Term,Liability,Long Term Debt,,True,Long-term debt.
26010,Line of Credit,Liability,Short Term Debt,,True,Revolving line of credit.
30000,Owner's Equity / Capital,Equity,Capital,,True,Owner contributions/capital.
31000,Owner Distributions,Equity,Distributions,,True,Owner draws/distributions.
32000,Retained Earnings,Equity,Retained Earnings,,True,Prior years retained earnings.
33000,Current Year Earnings,Equity,Current Earnings,,True,Current year earnings (system).
99990,Uncategorized Income,Revenue,Uncategorized,,True,Fallback income when GL mapping missing.
99991,Uncategorized Expense,Expense,Uncategorized,,True,Fallback expense when GL mapping missing.
99992,Uncategorized Asset,Asset,Uncategorized,,True,Fallback asset when GL mapping missing.
99993,Uncategorized Liability,Liability,Uncategorized,,True,Fallback liability when GL mapping missing.
99994,Suspense Clearing,Equity,Suspense,,True,Temporary clearing to keep journals balanced when configuration incomplete.
12020,Inventory - Pro Shop,Asset,Inventory,12000,True,Pro shop inventory.
12030,Inventory - Food,Asset,Inventory,12000,True,Food inventory.
12031,Inventory - Beverage (Non-Alcohol),Asset,Inventory,12000,True,Beverage inventory.
12032,Inventory - Alcohol,Asset,Inventory,12000,True,Alcohol inventory.
12040,Inventory - Course Supplies,Asset,Inventory,12000,True,Course maintenance inventory.
40000,Golf Revenue,Revenue,Department Revenue,,True,Golf department revenue control.
40100,Greens Fees,Revenue,Golf Revenue,40000,True,Greens fees.
40200,Cart Fees,Revenue,Golf Revenue,40000,True,Cart fees.
40300,Membership Dues,Revenue,Membership Revenue,,True,Membership dues.
40400,Driving Range,Revenue,Golf Revenue,40000,True,Range revenue.
40500,Lessons,Revenue,Golf Revenue,40000,True,Instruction.
40600,Tournament & Outing Revenue,Revenue,Events Revenue,,True,Events/outings.
41000,Retail Revenue,Revenue,Department Revenue,,True,Retail revenue control.
41100,Pro Shop Merchandise Sales,Revenue,Retail Revenue,41000,True,
42000,Food & Beverage Revenue,Revenue,Department Revenue,,True,F&B revenue control.
42100,Food Sales,Revenue,F&B Revenue,42000,True,
42200,Beverage Sales (Non-Alcohol),Revenue,F&B Revenue,42000,True,
42300,Alcohol Sales,Revenue,F&B Revenue,42000,True,
42400,Service Charges,Revenue,Other Income,,True,
50000,Cost of Goods Sold,COGS,COGS Control,,True,
51000,COGS - Pro Shop Merchandise,COGS,COGS - Retail,50000,True,
51100,COGS - Food,COGS,COGS - Food,50000,True,
51200,COGS - Beverage,COGS,COGS - Beverage,50000,True,
51300,COGS - Alcohol,COGS,COGS - Alcohol,50000,True,
51400,COGS - Freight In,COGS,COGS - Freight,50000,True,
51500,COGS - Inventory Adjustments,COGS,COGS - Adjustments,50000,True,
60000,Labor Expense,Expense,Labor Control,,True,
61000,Labor - Golf Operations,Expense,Labor,60000,True,
61100,Labor - Pro Shop,Expense,Labor,60000,True,
61200,Labor - Food & Beverage,Expense,Labor,60000,True,
61300,Labor - Course Maintenance,Expense,Labor,60000,True,
62000,Payroll Taxes Expense,Expense,Payroll Taxes,60000,True,
63000,Employee Benefits,Expense,Benefits,60000,True,
70000,Operating Expenses,Expense,Opex Control,,True,
71000,Course Maintenance Expenses,Expense,Department Expense,70000,True,
72000,Pro Shop Expenses,Expense,Department Expense,70000,True,
73000,Food & Beverage Expenses,Expense,Department Expense,70000,True,
74000,Facility & General Operating,Expense,Opex,70000,True,
74100,Technology & Office,Expense,Opex,70000,True,
74200,Merchant & Bank Fees,Expense,Opex,70000,True,
75000,Marketing Expenses,Expense,Marketing,,True,
76000,Administrative Expenses,Expense,Administrative,,True,
77000,Reconciliation Discrepancies,Expense,Other Expense,,True,
```

### Retail COA (`retail_coa.csv`)

```csv
AccountNumber,AccountName,AccountType,AccountSubType,ParentAccountNumber,IsActive,Description
10000,Cash - Operating,Asset,Cash,,True,Primary operating cash account.
10005,Cash - Petty Cash,Asset,Cash,,True,Petty cash on hand.
10010,Cash - Clearing / Undeposited Funds,Asset,Cash,,True,Undeposited cash/clearing.
10020,Credit Cards / ACH Clearing,Asset,Cash Equivalent,,True,Clearing for card/ACH batches prior to bank settlement.
10030,Bank Deposits To Reconcile - Cash,Asset,Cash Equivalent,,True,Cash deposits pending reconciliation.
10031,Bank Deposits To Reconcile - Cards/ACH,Asset,Cash Equivalent,,True,Card/ACH settlements pending reconciliation.
11000,Accounts Receivable,Asset,Accounts Receivable,,True,Trade receivables.
11010,Allowance for Doubtful Accounts,Contra Asset,Allowance,11000,True,Allowance for bad debts.
12000,Inventory Asset,Asset,Inventory,,True,Inventory asset control.
12010,Prepaid Expenses,Asset,Prepaids,,True,Prepaid expenses.
13000,Fixed Assets,Asset,Fixed Assets,,True,Fixed assets control.
13010,Buildings,Asset,Fixed Assets,13000,True,Buildings and improvements.
13020,Furniture & Fixtures,Asset,Fixed Assets,13000,True,Furniture and fixtures.
13030,Computers & Office Equipment,Asset,Fixed Assets,13000,True,IT and office equipment.
13040,Equipment,Asset,Fixed Assets,13000,True,Machinery and operational equipment.
13900,Accumulated Depreciation,Contra Asset,Accumulated Depreciation,13000,True,Accumulated depreciation.
14000,Intangible Assets,Asset,Intangibles,,True,Intangible assets.
14010,Goodwill,Asset,Intangibles,14000,True,Goodwill.
14020,"Patents, Copyrights & Franchises",Asset,Intangibles,14000,True,IP and franchise rights.
14100,Accumulated Amortization,Contra Asset,Accumulated Amortization,14000,True,Accumulated amortization.
20000,Accounts Payable,Liability,Accounts Payable,,True,Trade payables.
20010,Credit Cards Payable,Liability,Credit Cards Payable,,True,Corporate cards payable.
21000,Accrued Expenses,Liability,Accrued Expenses,,True,Accrued expenses control.
21010,Accrued Payroll,Liability,Accrued Payroll,21000,True,Accrued wages.
21020,Payroll Taxes Payable - Federal,Liability,Payroll Liabilities,21000,True,Federal payroll taxes payable.
21021,Payroll Taxes Payable - [STATE_NAME],Liability,Payroll Liabilities,21000,True,State payroll taxes payable.
21030,FUTA Payable,Liability,Payroll Liabilities,21000,True,Federal unemployment payable.
21031,SUI Payable - [STATE_NAME],Liability,Payroll Liabilities,21000,True,State unemployment payable.
22000,Sales Tax Payable - [STATE_NAME],Liability,Sales Tax Payable,,True,Sales tax collected and payable.
23000,Gift Cards / Stored Value Liability,Liability,Deferred Revenue,,True,Outstanding gift cards/stored value.
24000,Customer Deposits / Event Deposits,Liability,Customer Deposits,,True,Deposits held for events/reservations.
25000,Deferred Revenue,Liability,Deferred Revenue,,True,Deferred revenue control.
25010,Deferred Revenue - Memberships / Subscriptions,Liability,Deferred Revenue,25000,True,Membership/subscription revenue deferred.
26000,Loans Payable - Long Term,Liability,Long Term Debt,,True,Long-term debt.
26010,Line of Credit,Liability,Short Term Debt,,True,Revolving line of credit.
30000,Owner's Equity / Capital,Equity,Capital,,True,Owner contributions/capital.
31000,Owner Distributions,Equity,Distributions,,True,Owner draws/distributions.
32000,Retained Earnings,Equity,Retained Earnings,,True,Prior years retained earnings.
33000,Current Year Earnings,Equity,Current Earnings,,True,Current year earnings (system).
99990,Uncategorized Income,Revenue,Uncategorized,,True,Fallback income when GL mapping missing.
99991,Uncategorized Expense,Expense,Uncategorized,,True,Fallback expense when GL mapping missing.
99992,Uncategorized Asset,Asset,Uncategorized,,True,Fallback asset when GL mapping missing.
99993,Uncategorized Liability,Liability,Uncategorized,,True,Fallback liability when GL mapping missing.
99994,Suspense Clearing,Equity,Suspense,,True,Temporary clearing to keep journals balanced when configuration incomplete.
12020,Inventory - Retail Merchandise,Asset,Inventory,12000,True,
40000,Retail Revenue,Revenue,Department Revenue,,True,
40100,Merchandise Sales,Revenue,Retail Revenue,40000,True,
40200,Online Sales,Revenue,Retail Revenue,40000,True,
40300,Non-Inventory Sales / Fees,Revenue,Retail Revenue,40000,True,"Warranty, service fees, etc."
40400,Shipping Income,Revenue,Other Income,,True,
50000,Cost of Goods Sold,COGS,COGS Control,,True,
51000,COGS - Merchandise,COGS,COGS - Retail,50000,True,
51100,COGS - Freight In,COGS,COGS - Freight,50000,True,
51200,COGS - Shrink/Adjustments,COGS,COGS - Adjustments,50000,True,
60000,Labor Expense,Expense,Labor Control,,True,
61000,Labor - Store Staff,Expense,Labor,60000,True,
61100,Labor - Management,Expense,Labor,60000,True,
62000,Payroll Taxes Expense,Expense,Payroll Taxes,60000,True,
63000,Employee Benefits,Expense,Benefits,60000,True,
70000,Operating Expenses,Expense,Opex Control,,True,
71000,Occupancy,Expense,Opex,70000,True,
71100,Utilities,Expense,Utilities,70000,True,
71200,Repairs & Maintenance,Expense,Opex,70000,True,
71300,Store Supplies,Expense,Opex,70000,True,
71400,Technology,Expense,Opex,70000,True,
71500,Merchant & Bank Fees,Expense,Opex,70000,True,
71600,Insurance,Expense,Insurance,70000,True,
71700,"Licenses, Taxes & Permits",Expense,Opex,70000,True,
72000,Marketing Expenses,Expense,Marketing,,True,
73000,Administrative Expenses,Expense,Administrative,,True,
77000,Reconciliation Discrepancies,Expense,Other Expense,,True,
```

### Hybrid COA (`hybrid_coa.csv`)

```csv
AccountNumber,AccountName,AccountType,AccountSubType,ParentAccountNumber,IsActive,Description
10000,Cash - Operating,Asset,Cash,,True,Primary operating cash account.
10005,Cash - Petty Cash,Asset,Cash,,True,Petty cash on hand.
10010,Cash - Clearing / Undeposited Funds,Asset,Cash,,True,Undeposited cash/clearing.
10020,Credit Cards / ACH Clearing,Asset,Cash Equivalent,,True,Clearing for card/ACH batches prior to bank settlement.
10030,Bank Deposits To Reconcile - Cash,Asset,Cash Equivalent,,True,Cash deposits pending reconciliation.
10031,Bank Deposits To Reconcile - Cards/ACH,Asset,Cash Equivalent,,True,Card/ACH settlements pending reconciliation.
11000,Accounts Receivable,Asset,Accounts Receivable,,True,Trade receivables.
11010,Allowance for Doubtful Accounts,Contra Asset,Allowance,11000,True,Allowance for bad debts.
12000,Inventory Asset,Asset,Inventory,,True,Inventory asset control.
12010,Prepaid Expenses,Asset,Prepaids,,True,Prepaid expenses.
13000,Fixed Assets,Asset,Fixed Assets,,True,Fixed assets control.
13010,Buildings,Asset,Fixed Assets,13000,True,Buildings and improvements.
13020,Furniture & Fixtures,Asset,Fixed Assets,13000,True,Furniture and fixtures.
13030,Computers & Office Equipment,Asset,Fixed Assets,13000,True,IT and office equipment.
13040,Equipment,Asset,Fixed Assets,13000,True,Machinery and operational equipment.
13900,Accumulated Depreciation,Contra Asset,Accumulated Depreciation,13000,True,Accumulated depreciation.
14000,Intangible Assets,Asset,Intangibles,,True,Intangible assets.
14010,Goodwill,Asset,Intangibles,14000,True,Goodwill.
14020,"Patents, Copyrights & Franchises",Asset,Intangibles,14000,True,IP and franchise rights.
14100,Accumulated Amortization,Contra Asset,Accumulated Amortization,14000,True,Accumulated amortization.
20000,Accounts Payable,Liability,Accounts Payable,,True,Trade payables.
20010,Credit Cards Payable,Liability,Credit Cards Payable,,True,Corporate cards payable.
21000,Accrued Expenses,Liability,Accrued Expenses,,True,Accrued expenses control.
21010,Accrued Payroll,Liability,Accrued Payroll,21000,True,Accrued wages.
21020,Payroll Taxes Payable - Federal,Liability,Payroll Liabilities,21000,True,Federal payroll taxes payable.
21021,Payroll Taxes Payable - [STATE_NAME],Liability,Payroll Liabilities,21000,True,State payroll taxes payable.
21030,FUTA Payable,Liability,Payroll Liabilities,21000,True,Federal unemployment payable.
21031,SUI Payable - [STATE_NAME],Liability,Payroll Liabilities,21000,True,State unemployment payable.
22000,Sales Tax Payable - [STATE_NAME],Liability,Sales Tax Payable,,True,Sales tax collected and payable.
23000,Gift Cards / Stored Value Liability,Liability,Deferred Revenue,,True,Outstanding gift cards/stored value.
24000,Customer Deposits / Event Deposits,Liability,Customer Deposits,,True,Deposits held for events/reservations.
25000,Deferred Revenue,Liability,Deferred Revenue,,True,Deferred revenue control.
25010,Deferred Revenue - Memberships / Subscriptions,Liability,Deferred Revenue,25000,True,Membership/subscription revenue deferred.
26000,Loans Payable - Long Term,Liability,Long Term Debt,,True,Long-term debt.
26010,Line of Credit,Liability,Short Term Debt,,True,Revolving line of credit.
30000,Owner's Equity / Capital,Equity,Capital,,True,Owner contributions/capital.
31000,Owner Distributions,Equity,Distributions,,True,Owner draws/distributions.
32000,Retained Earnings,Equity,Retained Earnings,,True,Prior years retained earnings.
33000,Current Year Earnings,Equity,Current Earnings,,True,Current year earnings (system).
99990,Uncategorized Income,Revenue,Uncategorized,,True,Fallback income when GL mapping missing.
99991,Uncategorized Expense,Expense,Uncategorized,,True,Fallback expense when GL mapping missing.
99992,Uncategorized Asset,Asset,Uncategorized,,True,Fallback asset when GL mapping missing.
99993,Uncategorized Liability,Liability,Uncategorized,,True,Fallback liability when GL mapping missing.
99994,Suspense Clearing,Equity,Suspense,,True,Temporary clearing to keep journals balanced when configuration incomplete.
12020,Inventory - Retail Merchandise,Asset,Inventory,12000,True,If retail present.
12030,Inventory - Food,Asset,Inventory,12000,True,If F&B present.
12031,Inventory - Beverage,Asset,Inventory,12000,True,If F&B present.
12032,Inventory - Alcohol,Asset,Inventory,12000,True,If F&B present.
40000,Hybrid Revenue,Revenue,Department Revenue,,True,
40100,Service Revenue,Revenue,Hybrid Revenue,40000,True,Industry-agnostic service revenue.
40200,Retail Revenue,Revenue,Hybrid Revenue,40000,True,
40300,Food Revenue,Revenue,Hybrid Revenue,40000,True,
40400,Beverage Revenue (Non-Alcohol),Revenue,Hybrid Revenue,40000,True,
40500,Alcohol Revenue,Revenue,Hybrid Revenue,40000,True,
40600,Events Revenue,Revenue,Hybrid Revenue,40000,True,
40700,Membership / Subscription Revenue,Revenue,Hybrid Revenue,40000,True,
40800,Service Charges,Revenue,Other Income,,True,
50000,Cost of Goods Sold,COGS,COGS Control,,True,
51000,COGS - Retail Merchandise,COGS,COGS - Retail,50000,True,
51100,COGS - Food,COGS,COGS - Food,50000,True,
51200,COGS - Beverage,COGS,COGS - Beverage,50000,True,
51300,COGS - Alcohol,COGS,COGS - Alcohol,50000,True,
51400,COGS - Paper / Packaging,COGS,COGS - Supplies,50000,True,
60000,Labor Expense,Expense,Labor Control,,True,
61000,Labor - Service Operations,Expense,Labor,60000,True,
61100,Labor - Retail,Expense,Labor,60000,True,
61200,Labor - Food,Expense,Labor,60000,True,
61300,Labor - Administrative,Expense,Labor,60000,True,
62000,Payroll Taxes Expense,Expense,Payroll Taxes,60000,True,
63000,Employee Benefits,Expense,Benefits,60000,True,
70000,Operating Expenses,Expense,Opex Control,,True,
71000,Service Operations Expenses,Expense,Service Ops,70000,True,
72000,Retail Operating Expenses,Expense,Retail Expense,70000,True,
73000,Food & Beverage Operating Expenses,Expense,F&B Expense,70000,True,
74000,Facility & General Operating,Expense,Opex,70000,True,
74100,Technology,Expense,Opex,70000,True,
74200,Merchant & Bank Fees,Expense,Opex,70000,True,
75000,Marketing Expenses,Expense,Marketing,,True,
76000,Administrative Expenses,Expense,Administrative,,True,
77000,Reconciliation Discrepancies,Expense,Other Expense,,True,
```

---

## APPENDIX B — File Tree Summary

```
src/modules/general-ledger/chart-of-accounts/
├── coa.types.ts                           # Session 2
├── coa.constants.ts                       # Session 2
├── coa.router.ts                          # Session 8
├── coa.controller.ts                      # Session 8
├── middleware/
│   └── coa-error-handler.ts               # Session 10
├── services/
│   ├── state-placeholder.service.ts       # Session 4
│   ├── csv-import.service.ts              # Session 5
│   ├── validation.service.ts              # Session 6
│   └── fallback.service.ts                # Session 7
├── seeds/
│   ├── bootstrap-templates.seed.ts        # Session 3
│   └── run-seed.ts                        # Session 3
├── scripts/
│   └── verify-integration.ts              # Session 10
├── ux/
│   ├── UX_FLOWS.md                        # Session 9
│   └── components.spec.md                 # Session 9
├── __tests__/
│   ├── state-placeholder.test.ts          # Session 10
│   ├── validation.test.ts                 # Session 10
│   ├── csv-import.test.ts                 # Session 10
│   └── bootstrap.test.ts                  # Session 10
prisma/
├── schema/
│   └── chart-of-accounts.prisma           # Session 1
└── migrations/
    └── XXXXXX_create_chart_of_accounts/
        └── migration.sql                  # Session 1
```

---

## APPENDIX C — Session Execution Order

Run sessions sequentially. Each builds on the prior.

| Session | Focus | Depends On | Key Output |
|---------|-------|------------|------------|
| 1 | Database Schema | — | Tables, indexes, triggers |
| 2 | Types & Constants | — | TypeScript types, enums |
| 3 | Seed Data | 1, 2 | 4 industry templates |
| 4 | State Placeholders | 2 | Replacement engine |
| 5 | CSV Import | 2, 4 | Parser + validator |
| 6 | Validation Engine | 2 | Integrity checks |
| 7 | Fallback Logic | 1, 2 | Auto-create fallbacks |
| 8 | API Endpoints | All services | REST API complete |
| 9 | UX Flows | 8 | Component specs |
| 10 | Tests & Verification | All | Test suites, integration |

**END OF DOCUMENT**
