# CLAUDE PROMPT — PROFIT CENTERS & TERMINALS (SCHEMA-AWARE IMPLEMENTATION)

## Context

We are building Oppsera, a global multi-tenant ERP platform spanning POS, PMS, F&B, Golf, Accounting, Inventory, CRM, Reservations, Payments, and Reporting. We use Turborepo + pnpm 9, Next.js 15 App Router, React 19, Drizzle ORM with postgres.js, Supabase Auth, Zod validation, and Vitest. See `CLAUDE.md` and `CONVENTIONS.md` for full architecture rules.

We need to implement a foundational system: **Profit Centers and Terminals**. These are global core entities used across every module. This system must live under: **Settings > Profit Centers & Terminals**.

---

## CRITICAL — SCHEMA ANALYSIS (ALREADY COMPLETED)

The existing schema has been analyzed. The following tables already exist in `packages/db/src/schema/terminals.ts` (Drizzle ORM) and **MUST be reused**.

### Existing Table: `terminalLocations` → THIS IS THE PROFIT CENTER

```typescript
// packages/db/src/schema/terminals.ts (current state)
export const terminalLocations = pgTable(
  'terminal_locations',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id').notNull().references(() => tenants.id),
    title: text('title').notNull(),
    defaultMerchantReceiptPrint: text('default_merchant_receipt_print').default('auto'),
    defaultCustomerReceiptPrint: text('default_customer_receipt_print').default('auto'),
    defaultMerchantReceiptType: text('default_merchant_receipt_type').default('full'),
    defaultCustomerReceiptType: text('default_customer_receipt_type').default('full'),
    tipsApplicable: boolean('tips_applicable').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_terminal_locations_tenant').on(table.tenantId)],
);
```

**Assessment:** `terminal_locations` is conceptually the "Profit Center" — the grouping entity above terminals. It is missing `location_id`, `code`, `description`, `is_active`, `icon`, `sort_order`.

### Existing Table: `terminals`

```typescript
// packages/db/src/schema/terminals.ts (current state)
export const terminals = pgTable(
  'terminals',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id').notNull().references(() => tenants.id),
    terminalLocationId: text('terminal_location_id').notNull().references(() => terminalLocations.id),
    title: text('title').notNull(),
    showsDesktopNotification: boolean('shows_desktop_notification').notNull().default(false),
    requiresPinOnQuickTab: boolean('requires_pin_on_quick_tab').notNull().default(false),
    lockScreen: boolean('lock_screen').notNull().default(false),
    autoPinLockIdleSeconds: integer('auto_pin_lock_idle_seconds'),
    autoLogoutIdleSeconds: integer('auto_logout_idle_seconds'),
    autoPinLockRegisterIdleSeconds: integer('auto_pin_lock_register_idle_seconds'),
    autoSaveRegisterTabs: boolean('auto_save_register_tabs').notNull().default(false),
    enableSignatureTipAfterPayment: boolean('enable_signature_tip_after_payment').notNull().default(false),
    reopenTabsBehaviour: text('reopen_tabs_behaviour').default('ask'),
    requiresCustomerForTable: boolean('requires_customer_for_table').notNull().default(false),
    requireSeatCountForTable: boolean('require_seat_count_for_table').notNull().default(false),
    receiptPrinterId: text('receipt_printer_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_terminals_tenant_location').on(table.tenantId, table.terminalLocationId),
  ],
);
```

**Assessment:** `terminals` already exists with rich POS behavior fields. It references `terminal_locations` via `terminalLocationId`. It is missing `location_id`, `terminal_number`, `device_identifier`, `ip_address`, and `is_active`.

### Existing Table: `locations` (in `packages/db/src/schema/core.ts`)

```typescript
export const locations = pgTable(
  'locations',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id').notNull().references(() => tenants.id),
    name: text('name').notNull(),
    timezone: text('timezone').notNull().default('America/New_York'),
    addressLine1: text('address_line1'),
    addressLine2: text('address_line2'),
    city: text('city'),
    state: text('state'),
    postalCode: text('postal_code'),
    country: text('country').notNull().default('US'),
    latitude: numeric('latitude', { precision: 10, scale: 7 }),
    longitude: numeric('longitude', { precision: 10, scale: 7 }),
    isActive: boolean('is_active').notNull().default(true),
    phone: text('phone'),
    email: text('email'),
    websiteUrl: text('website_url'),
    logoUrl: text('logo_url'),
    description: text('description'),
    socialLinks: jsonb('social_links'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_locations_tenant').on(table.tenantId)],
);
```

**Assessment:** Fully functional. No changes needed. This is the top-level location entity.

### Tables Already Referencing `terminals` and `terminal_locations`

The following tables already use `terminal_id` or `terminal_location_id` — confirming these are deeply integrated:

| Table | Column | FK Target |
|---|---|---|
| `orders` | `terminal_id` | (no FK constraint, references terminals) |
| `tenders` | `terminal_id` | (no FK constraint, references terminals) |
| `day_end_closings` | `terminal_id` | `terminals(id)` |
| `drawer_events` | `terminal_id` | `terminals(id)` |
| `register_tabs` | `terminal_id` | (references terminals) |
| `order_tips` | `terminal_id` | (references terminals) |
| `fnb_cash_drops` | `terminal_id` | (references terminals) |
| `fnb_soft_locks` | `terminal_id` | (references terminals) |
| `inventory_movements` | `terminal_id` | (references terminals) |
| `cash_payouts` | `terminal_id` | (references terminals) |
| `tee_bookings` | `terminal_id` | (references terminals) |
| `terminal_card_reader_settings` | `terminal_id` | `terminals(id)` |
| `terminal_location_floor_plans` | `terminal_location_id` | `terminal_locations(id)` |
| `terminal_location_tip_suggestions` | `terminal_location_id` | `terminal_locations(id)` |
| `location_payment_types` | `terminal_location_id`, `terminal_id` | (references both) |
| `journal_entry_configurations` | `terminal_location_id` | (references terminal_locations) |
| `floor_plans` | `terminal_location_id` | (references terminal_locations) |
| `fnb_kitchen_stations` | `terminal_location_id` | (references terminal_locations) |

### Related Peripheral Tables (DO NOT MODIFY)

| Table | Purpose |
|---|---|
| `terminal_card_readers` | Card reader hardware definitions |
| `terminal_card_reader_settings` | Maps readers to terminals |
| `terminal_location_floor_plans` | Floor plan associations |
| `terminal_location_tip_suggestions` | Tip presets per profit center |

---

## MIGRATION PLAN — EXTEND, NEVER REPLACE

**Rule: ADDITIVE ONLY.**

- DO NOT create new `profit_centers` or `pos_terminals` tables
- DO NOT rename existing tables or columns
- DO NOT drop any columns
- DO add missing columns to existing tables via `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`
- Both the **SQL migration file** AND the **Drizzle schema in `terminals.ts`** must be updated in sync

### Migration File: `packages/db/migrations/0092_profit_center_extensions.sql`

```sql
-- Extend terminal_locations with Profit Center fields
ALTER TABLE terminal_locations ADD COLUMN IF NOT EXISTS location_id text REFERENCES locations(id);
ALTER TABLE terminal_locations ADD COLUMN IF NOT EXISTS code text;
ALTER TABLE terminal_locations ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE terminal_locations ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE terminal_locations ADD COLUMN IF NOT EXISTS icon text;
ALTER TABLE terminal_locations ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_terminal_locations_location
  ON terminal_locations(tenant_id, location_id) WHERE is_active = true;

-- Extend terminals with additional fields
ALTER TABLE terminals ADD COLUMN IF NOT EXISTS location_id text REFERENCES locations(id);
ALTER TABLE terminals ADD COLUMN IF NOT EXISTS terminal_number integer;
ALTER TABLE terminals ADD COLUMN IF NOT EXISTS device_identifier text;
ALTER TABLE terminals ADD COLUMN IF NOT EXISTS ip_address text;
ALTER TABLE terminals ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_terminals_location
  ON terminals(tenant_id, location_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_terminals_profit_center
  ON terminals(tenant_id, terminal_location_id) WHERE is_active = true;
```

**Notes:**
- No RLS policy changes needed — existing 4-policy RLS on both tables already covers all columns.
- All new columns are nullable or have defaults — no migration failures on existing data.
- `location_id` on `terminal_locations` is nullable for backfill. Existing rows where `location_id IS NULL` will need admin action to assign a location via the UI.

### Drizzle Schema Update: `packages/db/src/schema/terminals.ts`

Add the new columns to the existing `terminalLocations` and `terminals` table definitions. The `locations` table is imported from `./core`.

**Add import at top of file:**
```typescript
import { tenants, locations } from './core';
```
(Replace the existing `import { tenants } from './core';`)

**Add to `terminalLocations` column definition, after `tipsApplicable`:**
```typescript
locationId: text('location_id').references(() => locations.id),
code: text('code'),
description: text('description'),
isActive: boolean('is_active').notNull().default(true),
icon: text('icon'),
sortOrder: integer('sort_order').notNull().default(0),
```

**Update `terminalLocations` indexes** (replace existing index array):
```typescript
(table) => [
  index('idx_terminal_locations_tenant').on(table.tenantId),
  index('idx_terminal_locations_location').on(table.tenantId, table.locationId),
],
```

**Add to `terminals` column definition, after `receiptPrinterId`:**
```typescript
locationId: text('location_id').references(() => locations.id),
terminalNumber: integer('terminal_number'),
deviceIdentifier: text('device_identifier'),
ipAddress: text('ip_address'),
isActive: boolean('is_active').notNull().default(true),
```

**Update `terminals` indexes** (replace existing index array):
```typescript
(table) => [
  index('idx_terminals_tenant_location').on(table.tenantId, table.terminalLocationId),
  index('idx_terminals_location').on(table.tenantId, table.locationId),
  index('idx_terminals_profit_center').on(table.tenantId, table.terminalLocationId),
],
```

### Migration Journal Update

Add entry to `packages/db/migrations/meta/_journal.json`:
```json
{
  "idx": 92,
  "version": "7",
  "when": 1740200000000,
  "tag": "0092_profit_center_extensions",
  "breakpoints": true
}
```

---

## NAMING CONVENTION — API vs DATABASE

| Concept | Database Table | Database Column (FK) | API/UI Name |
|---|---|---|---|
| Location | `locations` | `location_id` | `location` |
| Profit Center | `terminal_locations` | `terminal_location_id` | `profitCenter` |
| Terminal | `terminals` | `terminal_id` | `terminal` |

In the API layer and frontend, we use business-friendly names:
- `profitCenterId` (maps to `terminal_location_id` / `terminalLocations.id` in DB)
- `terminalId` (maps to `terminal_id` / `terminals.id` in DB)
- `locationId` (maps to `location_id` / `locations.id` in DB)

In the database, we keep the existing column names (`terminal_location_id`, etc.) for backward compatibility. The mapping happens in query result mapping (DB `title` → API `name`, DB `terminal_location_id` → API `profitCenterId`).

---

## BUSINESS CONCEPTS

### Profit Center (stored in `terminal_locations`)

A Profit Center is a physical or operational revenue area within a tenant location.

| Hotel | Golf / Club | Retail |
|---|---|---|
| Front Desk | Pro Shop | Main Counter |
| Restaurant | Restaurant | Warehouse Counter |
| Bar | Beverage Cart | Gift Shop |
| Spa | Halfway House | |
| Pool / Bar | | |

**Important:** Profit Centers exist inside a tenant location but are NOT tenant locations themselves.

### Terminal (stored in `terminals`)

A Terminal is a specific POS workstation/device inside a profit center.

Examples:
- Bar → Bar Terminal 1, Bar Terminal 2
- Front Desk → FD Terminal 1, FD Terminal 2

Terminals are critical for: Revenue attribution, Reporting, Hardware binding, Audit trail, User login context.

### Core Data Chain

Every transactional record should store (or be able to derive):
```
locationId          → locations.id
profitCenterId      → terminal_locations.id  (via terminal_location_id)
terminalId          → terminals.id
```

This applies to: Orders, Payments/Tenders, Reservations, PMS folios, Accounting postings, Inventory movements, F&B tabs, Day-end closings.

---

## DELIVERABLE 1 — BACKEND: COMMANDS, QUERIES, VALIDATION

All backend code lives in `packages/core/src/profit-centers/` since these are core platform entities (not a business module). Follow the functional command/query pattern used by all other modules — see `CONVENTIONS.md` and `CLAUDE.md` for the canonical patterns.

### File Structure

```
packages/core/src/profit-centers/
├── commands/
│   ├── create-profit-center.ts
│   ├── update-profit-center.ts
│   ├── deactivate-profit-center.ts
│   ├── create-terminal.ts
│   ├── update-terminal.ts
│   └── deactivate-terminal.ts
├── queries/
│   ├── list-profit-centers.ts
│   ├── get-profit-center.ts
│   ├── list-terminals.ts
│   ├── get-terminal.ts
│   └── get-terminal-selection-data.ts
├── validation.ts
├── types.ts
└── index.ts
```

### Validation Schemas (`validation.ts`)

Use `z.input<>` for function params (when schema has `.default()`), not `z.infer<>`. See CLAUDE.md gotcha #1.

```typescript
import { z } from 'zod';

// ── Profit Center (terminal_locations) ──────────────────────────

export const createProfitCenterSchema = z.object({
  locationId: z.string().min(1, 'Location is required'),
  name: z.string().min(1, 'Name is required').max(100),
  code: z.string().max(20).optional(),
  description: z.string().max(500).optional(),
  icon: z.string().max(50).optional(),
  tipsApplicable: z.boolean().default(true),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().min(0).default(0),
});

export type CreateProfitCenterInput = z.input<typeof createProfitCenterSchema>;

export const updateProfitCenterSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  code: z.string().max(20).nullish(),
  description: z.string().max(500).nullish(),
  icon: z.string().max(50).nullish(),
  tipsApplicable: z.boolean().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).optional(),
});

export type UpdateProfitCenterInput = z.input<typeof updateProfitCenterSchema>;

// ── Terminal ────────────────────────────────────────────────────

export const createTerminalSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  terminalNumber: z.number().int().positive().optional(),
  deviceIdentifier: z.string().max(100).optional(),
  ipAddress: z.string().max(45).optional(),  // IPv4 or IPv6
  isActive: z.boolean().default(true),
});

export type CreateTerminalInput = z.input<typeof createTerminalSchema>;

export const updateTerminalSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  terminalNumber: z.number().int().positive().nullish(),
  deviceIdentifier: z.string().max(100).nullish(),
  ipAddress: z.string().max(45).nullish(),
  isActive: z.boolean().optional(),
});

export type UpdateTerminalInput = z.input<typeof updateTerminalSchema>;
```

### Types (`types.ts`)

```typescript
export interface ProfitCenter {
  id: string;
  tenantId: string;
  locationId: string | null;
  locationName: string | null;
  name: string;           // maps from DB `title`
  code: string | null;
  description: string | null;
  icon: string | null;
  isActive: boolean;
  tipsApplicable: boolean;
  sortOrder: number;
  terminalCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface Terminal {
  id: string;
  tenantId: string;
  profitCenterId: string;     // maps from DB `terminal_location_id`
  profitCenterName: string;   // maps from DB terminal_locations.title
  locationId: string | null;
  name: string;               // maps from DB `title`
  terminalNumber: number | null;
  deviceIdentifier: string | null;
  ipAddress: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TerminalSession {
  locationId: string;
  locationName: string;
  profitCenterId: string;       // terminal_locations.id
  profitCenterName: string;     // terminal_locations.title
  terminalId: string;           // terminals.id
  terminalName: string;         // terminals.title
  terminalNumber: number | null;
}
```

### Command: `create-profit-center.ts`

Follow the project's command pattern — `publishWithOutbox`, validate references inside transaction, audit log outside. See the canonical pattern in CLAUDE.md "Command Pattern (Write Operations)".

```typescript
import type { RequestContext } from '@oppsera/core/auth';
import { publishWithOutbox, buildEventFromContext } from '@oppsera/core/events';
import { auditLog } from '@oppsera/core/audit';
import { generateUlid, NotFoundError } from '@oppsera/shared';
import { terminalLocations, locations } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';
import type { CreateProfitCenterInput } from '../validation';

export async function createProfitCenter(
  ctx: RequestContext,
  input: CreateProfitCenterInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Validate location belongs to tenant
    const [location] = await tx
      .select({ id: locations.id })
      .from(locations)
      .where(and(
        eq(locations.tenantId, ctx.tenantId),
        eq(locations.id, input.locationId),
        eq(locations.isActive, true),
      ))
      .limit(1);

    if (!location) {
      throw new NotFoundError('Location', input.locationId);
    }

    // Insert — API `name` maps to DB `title`
    const [created] = await tx
      .insert(terminalLocations)
      .values({
        id: generateUlid(),
        tenantId: ctx.tenantId,
        locationId: input.locationId,
        title: input.name,
        code: input.code ?? null,
        description: input.description ?? null,
        icon: input.icon ?? null,
        tipsApplicable: input.tipsApplicable ?? true,
        isActive: input.isActive ?? true,
        sortOrder: input.sortOrder ?? 0,
      })
      .returning();

    const event = buildEventFromContext(ctx, 'platform.profit_center.created.v1', {
      profitCenterId: created!.id,
      locationId: input.locationId,
      name: input.name,
    });

    return { result: created!, events: [event] };
  });

  await auditLog(ctx, 'platform.profit_center.created', 'terminal_location', result.id);
  return result;
}
```

### Command: `update-profit-center.ts`

```typescript
import type { RequestContext } from '@oppsera/core/auth';
import { publishWithOutbox, buildEventFromContext } from '@oppsera/core/events';
import { auditLog } from '@oppsera/core/audit';
import { NotFoundError } from '@oppsera/shared';
import { terminalLocations } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';
import type { UpdateProfitCenterInput } from '../validation';

export async function updateProfitCenter(
  ctx: RequestContext,
  profitCenterId: string,
  input: UpdateProfitCenterInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Verify exists and belongs to tenant
    const [existing] = await tx
      .select({ id: terminalLocations.id })
      .from(terminalLocations)
      .where(and(
        eq(terminalLocations.tenantId, ctx.tenantId),
        eq(terminalLocations.id, profitCenterId),
      ))
      .limit(1);

    if (!existing) {
      throw new NotFoundError('Profit Center', profitCenterId);
    }

    // Build update object — only include provided fields
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (input.name !== undefined) updates.title = input.name;
    if (input.code !== undefined) updates.code = input.code;
    if (input.description !== undefined) updates.description = input.description;
    if (input.icon !== undefined) updates.icon = input.icon;
    if (input.tipsApplicable !== undefined) updates.tipsApplicable = input.tipsApplicable;
    if (input.isActive !== undefined) updates.isActive = input.isActive;
    if (input.sortOrder !== undefined) updates.sortOrder = input.sortOrder;

    const [updated] = await tx
      .update(terminalLocations)
      .set(updates)
      .where(eq(terminalLocations.id, profitCenterId))
      .returning();

    const event = buildEventFromContext(ctx, 'platform.profit_center.updated.v1', {
      profitCenterId,
      changes: Object.keys(updates).filter(k => k !== 'updatedAt'),
    });

    return { result: updated!, events: [event] };
  });

  await auditLog(ctx, 'platform.profit_center.updated', 'terminal_location', result.id);
  return result;
}
```

### Command: `deactivate-profit-center.ts`

Soft-delete via `is_active = false`. Follow archive semantics — never hard delete. Also deactivate all child terminals in the same transaction.

```typescript
import type { RequestContext } from '@oppsera/core/auth';
import { publishWithOutbox, buildEventFromContext } from '@oppsera/core/events';
import { auditLog } from '@oppsera/core/audit';
import { NotFoundError } from '@oppsera/shared';
import { terminalLocations, terminals } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';

export async function deactivateProfitCenter(
  ctx: RequestContext,
  profitCenterId: string,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const [existing] = await tx
      .select({ id: terminalLocations.id, isActive: terminalLocations.isActive })
      .from(terminalLocations)
      .where(and(
        eq(terminalLocations.tenantId, ctx.tenantId),
        eq(terminalLocations.id, profitCenterId),
      ))
      .limit(1);

    if (!existing) {
      throw new NotFoundError('Profit Center', profitCenterId);
    }

    // Deactivate the profit center
    const [updated] = await tx
      .update(terminalLocations)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(terminalLocations.id, profitCenterId))
      .returning();

    // Also deactivate all child terminals
    await tx
      .update(terminals)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(
        eq(terminals.tenantId, ctx.tenantId),
        eq(terminals.terminalLocationId, profitCenterId),
        eq(terminals.isActive, true),
      ));

    const event = buildEventFromContext(ctx, 'platform.profit_center.deactivated.v1', {
      profitCenterId,
    });

    return { result: updated!, events: [event] };
  });

  await auditLog(ctx, 'platform.profit_center.deactivated', 'terminal_location', result.id);
  return result;
}
```

### Command: `create-terminal.ts`

```typescript
import type { RequestContext } from '@oppsera/core/auth';
import { publishWithOutbox, buildEventFromContext } from '@oppsera/core/events';
import { auditLog } from '@oppsera/core/audit';
import { generateUlid, NotFoundError } from '@oppsera/shared';
import { terminalLocations, terminals } from '@oppsera/db';
import { sql } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';
import type { CreateTerminalInput } from '../validation';

export async function createTerminal(
  ctx: RequestContext,
  profitCenterId: string,
  input: CreateTerminalInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Get parent profit center to inherit location_id
    const [profitCenter] = await tx
      .select({
        id: terminalLocations.id,
        locationId: terminalLocations.locationId,
      })
      .from(terminalLocations)
      .where(and(
        eq(terminalLocations.tenantId, ctx.tenantId),
        eq(terminalLocations.id, profitCenterId),
        eq(terminalLocations.isActive, true),
      ))
      .limit(1);

    if (!profitCenter) {
      throw new NotFoundError('Profit Center', profitCenterId);
    }

    // Auto-increment terminal number if not provided
    let terminalNumber = input.terminalNumber;
    if (!terminalNumber) {
      const [maxRow] = await tx.execute(
        sql`SELECT COALESCE(MAX(terminal_number), 0) AS max_num
            FROM terminals
            WHERE tenant_id = ${ctx.tenantId}
              AND terminal_location_id = ${profitCenterId}`,
      );
      terminalNumber = (Number((maxRow as Record<string, unknown>)?.max_num) || 0) + 1;
    }

    const [created] = await tx
      .insert(terminals)
      .values({
        id: generateUlid(),
        tenantId: ctx.tenantId,
        terminalLocationId: profitCenterId,    // FK to profit center
        locationId: profitCenter.locationId,   // Inherited from profit center
        title: input.name,                     // API `name` → DB `title`
        terminalNumber,
        deviceIdentifier: input.deviceIdentifier ?? null,
        ipAddress: input.ipAddress ?? null,
        isActive: input.isActive ?? true,
      })
      .returning();

    const event = buildEventFromContext(ctx, 'platform.terminal.created.v1', {
      terminalId: created!.id,
      profitCenterId,
      locationId: profitCenter.locationId,
      name: input.name,
      terminalNumber,
    });

    return { result: created!, events: [event] };
  });

  await auditLog(ctx, 'platform.terminal.created', 'terminal', result.id);
  return result;
}
```

### Commands: `update-terminal.ts` and `deactivate-terminal.ts`

Follow the same patterns as profit center update/deactivate. `updateTerminal` takes `(ctx, terminalId, input)`. `deactivateTerminal` sets `isActive = false`.

### Query: `list-profit-centers.ts`

Follow the project's query pattern — `withTenant`, parameterized `sql` template literals (never string interpolation), `Array.from(rows as Iterable<Record<string, unknown>>)` for postgres.js RowList, explicit type conversions.

```typescript
import { withTenant, sql } from '@oppsera/db';
import type { ProfitCenter } from '../types';

interface ListProfitCentersInput {
  tenantId: string;
  locationId?: string;
  includeInactive?: boolean;
}

export async function listProfitCenters(
  input: ListProfitCentersInput,
): Promise<{ items: ProfitCenter[] }> {
  return withTenant(input.tenantId, async (tx) => {
    const locationFilter = input.locationId
      ? sql`AND tl.location_id = ${input.locationId}`
      : sql``;

    const activeFilter = input.includeInactive
      ? sql``
      : sql`AND tl.is_active = true`;

    const rows = await tx.execute(sql`
      SELECT
        tl.id,
        tl.tenant_id,
        tl.location_id,
        l.name AS location_name,
        tl.title AS name,
        tl.code,
        tl.description,
        tl.icon,
        tl.is_active,
        tl.tips_applicable,
        tl.sort_order,
        COUNT(t.id) FILTER (WHERE t.is_active = true) AS terminal_count,
        tl.created_at,
        tl.updated_at
      FROM terminal_locations tl
      LEFT JOIN locations l ON l.id = tl.location_id
      LEFT JOIN terminals t ON t.terminal_location_id = tl.id
      WHERE tl.tenant_id = ${input.tenantId}
        ${locationFilter}
        ${activeFilter}
      GROUP BY tl.id, l.name
      ORDER BY tl.sort_order, tl.title
    `);

    const items = Array.from(rows as Iterable<Record<string, unknown>>).map((row) => ({
      id: String(row.id),
      tenantId: String(row.tenant_id),
      locationId: row.location_id ? String(row.location_id) : null,
      locationName: row.location_name ? String(row.location_name) : null,
      name: String(row.name),
      code: row.code ? String(row.code) : null,
      description: row.description ? String(row.description) : null,
      icon: row.icon ? String(row.icon) : null,
      isActive: Boolean(row.is_active),
      tipsApplicable: Boolean(row.tips_applicable),
      sortOrder: Number(row.sort_order),
      terminalCount: Number(row.terminal_count),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    }));

    return { items };
  });
}
```

### Query: `list-terminals.ts`

```typescript
import { withTenant, sql } from '@oppsera/db';
import type { Terminal } from '../types';

interface ListTerminalsInput {
  tenantId: string;
  profitCenterId: string;
  includeInactive?: boolean;
}

export async function listTerminals(
  input: ListTerminalsInput,
): Promise<{ items: Terminal[] }> {
  return withTenant(input.tenantId, async (tx) => {
    const activeFilter = input.includeInactive
      ? sql``
      : sql`AND t.is_active = true`;

    const rows = await tx.execute(sql`
      SELECT
        t.id,
        t.tenant_id,
        t.terminal_location_id AS profit_center_id,
        tl.title AS profit_center_name,
        t.location_id,
        t.title AS name,
        t.terminal_number,
        t.device_identifier,
        t.ip_address,
        t.is_active,
        t.created_at,
        t.updated_at
      FROM terminals t
      JOIN terminal_locations tl ON tl.id = t.terminal_location_id
      WHERE t.tenant_id = ${input.tenantId}
        AND t.terminal_location_id = ${input.profitCenterId}
        ${activeFilter}
      ORDER BY t.terminal_number NULLS LAST, t.title
    `);

    const items = Array.from(rows as Iterable<Record<string, unknown>>).map((row) => ({
      id: String(row.id),
      tenantId: String(row.tenant_id),
      profitCenterId: String(row.profit_center_id),
      profitCenterName: String(row.profit_center_name),
      locationId: row.location_id ? String(row.location_id) : null,
      name: String(row.name),
      terminalNumber: row.terminal_number != null ? Number(row.terminal_number) : null,
      deviceIdentifier: row.device_identifier ? String(row.device_identifier) : null,
      ipAddress: row.ip_address ? String(row.ip_address) : null,
      isActive: Boolean(row.is_active),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    }));

    return { items };
  });
}
```

### Query: `get-terminal-selection-data.ts`

Cascading data for the terminal selection screen. Three separate functions, one per dropdown level.

```typescript
import { withTenant, sql } from '@oppsera/db';

export async function getLocationsForSelection(tenantId: string) {
  return withTenant(tenantId, async (tx) => {
    const rows = await tx.execute(sql`
      SELECT id, name FROM locations
      WHERE tenant_id = ${tenantId} AND is_active = true
      ORDER BY name
    `);
    return Array.from(rows as Iterable<Record<string, unknown>>).map((r) => ({
      id: String(r.id),
      name: String(r.name),
    }));
  });
}

export async function getProfitCentersForSelection(tenantId: string, locationId: string) {
  return withTenant(tenantId, async (tx) => {
    const rows = await tx.execute(sql`
      SELECT id, title AS name, code, icon FROM terminal_locations
      WHERE tenant_id = ${tenantId}
        AND location_id = ${locationId}
        AND is_active = true
      ORDER BY sort_order, title
    `);
    return Array.from(rows as Iterable<Record<string, unknown>>).map((r) => ({
      id: String(r.id),
      name: String(r.name),
      code: r.code ? String(r.code) : null,
      icon: r.icon ? String(r.icon) : null,
    }));
  });
}

export async function getTerminalsForSelection(tenantId: string, profitCenterId: string) {
  return withTenant(tenantId, async (tx) => {
    const rows = await tx.execute(sql`
      SELECT id, title AS name, terminal_number, device_identifier FROM terminals
      WHERE tenant_id = ${tenantId}
        AND terminal_location_id = ${profitCenterId}
        AND is_active = true
      ORDER BY terminal_number NULLS LAST, title
    `);
    return Array.from(rows as Iterable<Record<string, unknown>>).map((r) => ({
      id: String(r.id),
      name: String(r.name),
      terminalNumber: r.terminal_number != null ? Number(r.terminal_number) : null,
      deviceIdentifier: r.device_identifier ? String(r.device_identifier) : null,
    }));
  });
}
```

### Module Exports (`index.ts`)

```typescript
// Commands
export { createProfitCenter } from './commands/create-profit-center';
export { updateProfitCenter } from './commands/update-profit-center';
export { deactivateProfitCenter } from './commands/deactivate-profit-center';
export { createTerminal } from './commands/create-terminal';
export { updateTerminal } from './commands/update-terminal';
export { deactivateTerminal } from './commands/deactivate-terminal';

// Queries
export { listProfitCenters } from './queries/list-profit-centers';
export { getProfitCenter } from './queries/get-profit-center';
export { listTerminals } from './queries/list-terminals';
export { getTerminal } from './queries/get-terminal';
export {
  getLocationsForSelection,
  getProfitCentersForSelection,
  getTerminalsForSelection,
} from './queries/get-terminal-selection-data';

// Validation
export * from './validation';

// Types
export type * from './types';
```

Also re-export from `packages/core/src/index.ts`:
```typescript
export * from './profit-centers';
```

---

## DELIVERABLE 2 — API ROUTES

All API routes use `withMiddleware(handler, options)`. Routes live under `apps/web/src/app/api/v1/`. Response shapes follow project convention: `{ data: ... }` for success, `{ error: { code, message, details } }` for errors.

Profit centers are part of `platform_core` entitlement. Permissions: `settings.view` for reads, `settings.update` for writes.

### Route: `apps/web/src/app/api/v1/profit-centers/route.ts`

```typescript
import { NextResponse, type NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  listProfitCenters,
  createProfitCenter,
  createProfitCenterSchema,
} from '@oppsera/core/profit-centers';

// GET /api/v1/profit-centers?locationId=xxx
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const locationId = request.nextUrl.searchParams.get('locationId') ?? undefined;

    const result = await listProfitCenters({
      tenantId: ctx.tenantId,
      locationId,
    });

    return NextResponse.json({ data: result.items });
  },
  { entitlement: 'platform_core', permission: 'settings.view' },
);

// POST /api/v1/profit-centers
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parsed = createProfitCenterSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await createProfitCenter(ctx, parsed.data);
    return NextResponse.json({ data: result }, { status: 201 });
  },
  { entitlement: 'platform_core', permission: 'settings.update' },
);
```

### Route: `apps/web/src/app/api/v1/profit-centers/[id]/route.ts`

```typescript
import { NextResponse, type NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  getProfitCenter,
  updateProfitCenter,
  deactivateProfitCenter,
  updateProfitCenterSchema,
} from '@oppsera/core/profit-centers';

function extractId(request: NextRequest): string {
  const url = new URL(request.url);
  const parts = url.pathname.split('/');
  return parts[parts.length - 1]!;
}

// GET /api/v1/profit-centers/:id
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const id = extractId(request);
    const result = await getProfitCenter({ tenantId: ctx.tenantId, id });

    if (!result) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: `Profit center '${id}' not found` } },
        { status: 404 },
      );
    }

    return NextResponse.json({ data: result });
  },
  { entitlement: 'platform_core', permission: 'settings.view' },
);

// PATCH /api/v1/profit-centers/:id
export const PATCH = withMiddleware(
  async (request: NextRequest, ctx) => {
    const id = extractId(request);
    const body = await request.json();
    const parsed = updateProfitCenterSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await updateProfitCenter(ctx, id, parsed.data);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'platform_core', permission: 'settings.update' },
);

// DELETE /api/v1/profit-centers/:id (soft-delete)
export const DELETE = withMiddleware(
  async (request: NextRequest, ctx) => {
    const id = extractId(request);
    await deactivateProfitCenter(ctx, id);
    return NextResponse.json({ data: { id } });
  },
  { entitlement: 'platform_core', permission: 'settings.update' },
);
```

### Route: `apps/web/src/app/api/v1/profit-centers/[id]/terminals/route.ts`

```typescript
import { NextResponse, type NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  listTerminals,
  createTerminal,
  createTerminalSchema,
} from '@oppsera/core/profit-centers';

function extractProfitCenterId(request: NextRequest): string {
  // URL: /api/v1/profit-centers/{id}/terminals
  const url = new URL(request.url);
  const parts = url.pathname.split('/');
  const terminalsIdx = parts.indexOf('terminals');
  return parts[terminalsIdx - 1]!;
}

// GET /api/v1/profit-centers/:id/terminals
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const profitCenterId = extractProfitCenterId(request);

    const result = await listTerminals({
      tenantId: ctx.tenantId,
      profitCenterId,
    });

    return NextResponse.json({ data: result.items });
  },
  { entitlement: 'platform_core', permission: 'settings.view' },
);

// POST /api/v1/profit-centers/:id/terminals
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const profitCenterId = extractProfitCenterId(request);
    const body = await request.json();
    const parsed = createTerminalSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await createTerminal(ctx, profitCenterId, parsed.data);
    return NextResponse.json({ data: result }, { status: 201 });
  },
  { entitlement: 'platform_core', permission: 'settings.update' },
);
```

### Route: `apps/web/src/app/api/v1/terminals/[id]/route.ts`

```typescript
// GET /api/v1/terminals/:id — Get single terminal
// PATCH /api/v1/terminals/:id — Update terminal
// DELETE /api/v1/terminals/:id — Soft delete terminal
// Same pattern as profit-centers/[id] but calling terminal commands/queries
```

### Terminal Selection Routes: `apps/web/src/app/api/v1/terminal-session/`

These routes power the cascading dropdown on the terminal selection screen. They require authentication but no specific permission — any authenticated user can select a terminal.

```
apps/web/src/app/api/v1/terminal-session/
├── locations/route.ts          → GET active locations for tenant
├── profit-centers/route.ts     → GET active profit centers for location (?locationId=xxx)
└── terminals/route.ts          → GET active terminals for profit center (?profitCenterId=xxx)
```

```typescript
// Example: apps/web/src/app/api/v1/terminal-session/locations/route.ts
import { NextResponse, type NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getLocationsForSelection } from '@oppsera/core/profit-centers';

export const GET = withMiddleware(
  async (_request: NextRequest, ctx) => {
    const locations = await getLocationsForSelection(ctx.tenantId);
    return NextResponse.json({ data: locations });
  },
  { entitlement: 'platform_core' },  // No specific permission — any authenticated user
);
```

```typescript
// Example: apps/web/src/app/api/v1/terminal-session/profit-centers/route.ts
import { NextResponse, type NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getProfitCentersForSelection } from '@oppsera/core/profit-centers';

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const locationId = request.nextUrl.searchParams.get('locationId');
    if (!locationId) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'locationId is required' } },
        { status: 400 },
      );
    }

    const profitCenters = await getProfitCentersForSelection(ctx.tenantId, locationId);
    return NextResponse.json({ data: profitCenters });
  },
  { entitlement: 'platform_core' },
);
```

---

## DELIVERABLE 3 — SETTINGS UI (FRONTEND)

### File Structure

```
apps/web/src/app/(dashboard)/settings/profit-centers/
├── page.tsx                                    → Thin code-split wrapper
├── profit-centers-content.tsx                  → Profit center list (card grid)
├── [id]/
│   ├── page.tsx                                → Thin code-split wrapper
│   └── terminals-content.tsx                   → Terminal list for profit center

apps/web/src/components/settings/
├── ProfitCenterCard.tsx
├── ProfitCenterFormModal.tsx
├── TerminalCard.tsx
└── TerminalFormModal.tsx

apps/web/src/hooks/
├── use-profit-centers.ts                       → CRUD hooks for profit centers
└── use-terminals.ts                            → CRUD hooks for terminals
```

### Page: `settings/profit-centers/page.tsx`

Follow the code-split pattern used by ALL dashboard pages (CLAUDE.md gotcha #107):

```typescript
'use client';
import dynamic from 'next/dynamic';
import { PageSkeleton } from '@/components/ui/page-skeleton';

const ProfitCentersContent = dynamic(
  () => import('./profit-centers-content'),
  { loading: () => <PageSkeleton title="Profit Centers" />, ssr: false },
);

export default function ProfitCentersPage() {
  return <ProfitCentersContent />;
}
```

### Content: `profit-centers-content.tsx`

```typescript
'use client';
import { useState } from 'react';
import { Building2, Plus, MapPin } from 'lucide-react';
import { useProfitCenters } from '@/hooks/use-profit-centers';
import { useAuthContext } from '@/components/auth-provider';
import { ProfitCenterCard } from '@/components/settings/ProfitCenterCard';
import { ProfitCenterFormModal } from '@/components/settings/ProfitCenterFormModal';

export default function ProfitCentersContent() {
  const { locations } = useAuthContext();
  const [selectedLocationId, setSelectedLocationId] = useState<string | undefined>();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const { data: profitCenters, isLoading, refetch } = useProfitCenters({
    locationId: selectedLocationId,
  });

  return (
    <div>
      {/* Header with title + Add button */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Profit Centers</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage revenue areas across your locations
          </p>
        </div>
        <button
          onClick={() => { setEditingId(null); setIsModalOpen(true); }}
          className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          <Plus className="h-4 w-4" />
          Add Profit Center
        </button>
      </div>

      {/* Location filter dropdown */}
      <div className="mt-4 flex items-center gap-2">
        <MapPin className="h-4 w-4 text-gray-400" />
        <select
          value={selectedLocationId ?? ''}
          onChange={(e) => setSelectedLocationId(e.target.value || undefined)}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
        >
          <option value="">All Locations</option>
          {locations?.map((loc) => (
            <option key={loc.id} value={loc.id}>{loc.name}</option>
          ))}
        </select>
      </div>

      {/* Card grid — NOT a table */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {isLoading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-40 animate-pulse rounded-lg bg-gray-100" />
          ))
        ) : profitCenters?.length === 0 ? (
          <div className="col-span-full py-12 text-center text-gray-500">
            No profit centers found. Create one to get started.
          </div>
        ) : (
          profitCenters?.map((pc) => (
            <ProfitCenterCard
              key={pc.id}
              profitCenter={pc}
              onEdit={() => { setEditingId(pc.id); setIsModalOpen(true); }}
            />
          ))
        )}
      </div>

      {/* Add/Edit modal — portal-based */}
      {isModalOpen && (
        <ProfitCenterFormModal
          profitCenterId={editingId}
          locations={locations ?? []}
          onClose={() => setIsModalOpen(false)}
          onSaved={() => { setIsModalOpen(false); refetch(); }}
        />
      )}
    </div>
  );
}
```

### Component: `ProfitCenterCard.tsx`

Card design:
```
┌──────────────────────────────────┐
│  🍸  Bar                    ● 🟢 │
│  Code: BAR-01                    │
│                                  │
│  3 Terminals                     │
│  Main Building                   │
│                                  │
│  [Edit]  [Terminals →]           │
└──────────────────────────────────┘
```

- Uses `lucide-react` icons
- `router.push(`/settings/profit-centers/${pc.id}`)` to navigate to terminals sub-page
- Status dot: `bg-green-500` for active, `bg-gray-300` for inactive
- Uses `bg-surface` for theme-aware backgrounds (CLAUDE.md gotcha #39)

### Component: `TerminalCard.tsx`

Card design:
```
┌──────────────────────────────────┐
│  Bar Terminal 1              ● 🟢│
│  #1                              │
│                                  │
│  IP: 192.168.1.101               │
│  Device: iPad-BAR-01             │
│                                  │
│  [Edit]                          │
└──────────────────────────────────┘
```

### Modals: `ProfitCenterFormModal.tsx`, `TerminalFormModal.tsx`

Portal-based modals using `createPortal(... , document.body)` with z-50 (matching POS dialog pattern, CLAUDE.md gotcha #145). Zod client-side validation mirroring server schemas.

**Profit Center form fields:**

| Field | Type | Required | Maps To |
|---|---|---|---|
| Location | Dropdown (from `useAuthContext().locations`) | Yes | `locationId` |
| Name | Text input | Yes | `title` (DB) / `name` (API) |
| Code | Text input (auto-suggest from name) | No | `code` |
| Description | Textarea | No | `description` |
| Icon | Icon picker (lucide-react icons) | No | `icon` |
| Active | Toggle (default true) | No | `isActive` |
| Tips Applicable | Toggle (default true) | No | `tipsApplicable` |

**Terminal form fields:**

| Field | Type | Required | Maps To |
|---|---|---|---|
| Name | Text input | Yes | `title` (DB) / `name` (API) |
| Terminal Number | Numeric (auto-increment suggestion) | No | `terminalNumber` |
| Device Identifier | Text input | No | `deviceIdentifier` |
| IP Address | Text input (with validation) | No | `ipAddress` |
| Active | Toggle (default true) | No | `isActive` |

Profit center assignment (`terminal_location_id`) is set automatically from context (the parent profit center being viewed). `location_id` on the terminal is inherited from the profit center's `location_id`.

### Hook: `use-profit-centers.ts`

Follow the project's data hook pattern: `{ data, isLoading, error, refetch }` using `apiFetch()`.

```typescript
'use client';
import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/api-client';
import type { ProfitCenter } from '@oppsera/core/profit-centers';

interface UseProfitCentersOptions {
  locationId?: string;
}

export function useProfitCenters(options?: UseProfitCentersOptions) {
  const [data, setData] = useState<ProfitCenter[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetch = useCallback(async () => {
    try {
      setIsLoading(true);
      const params = options?.locationId
        ? `?locationId=${options.locationId}`
        : '';
      const res = await apiFetch<{ data: ProfitCenter[] }>(
        `/api/v1/profit-centers${params}`,
      );
      setData(res.data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch'));
    } finally {
      setIsLoading(false);
    }
  }, [options?.locationId]);

  useEffect(() => { fetch(); }, [fetch]);

  return { data, isLoading, error, refetch: fetch };
}

// Mutation helpers
export function useProfitCenterMutations() {
  const create = async (input: Record<string, unknown>) => {
    return apiFetch<{ data: ProfitCenter }>('/api/v1/profit-centers', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  };

  const update = async (id: string, input: Record<string, unknown>) => {
    return apiFetch<{ data: ProfitCenter }>(`/api/v1/profit-centers/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
  };

  const deactivate = async (id: string) => {
    return apiFetch(`/api/v1/profit-centers/${id}`, { method: 'DELETE' });
  };

  return { create, update, deactivate };
}
```

### Hook: `use-terminals.ts`

Same pattern, takes `profitCenterId` as required param:

```typescript
export function useTerminals(profitCenterId: string) {
  // Fetches GET /api/v1/profit-centers/{profitCenterId}/terminals
  // Returns { data, isLoading, error, refetch }
}

export function useTerminalMutations(profitCenterId: string) {
  // create → POST /api/v1/profit-centers/{profitCenterId}/terminals
  // update → PATCH /api/v1/terminals/{id}
  // deactivate → DELETE /api/v1/terminals/{id}
}
```

### Sidebar Navigation — EXACT CHANGE REQUIRED

In `apps/web/src/app/(dashboard)/layout.tsx`, the `navigation` array (line ~85) defines the entire sidebar. The Settings section is currently at lines 187-195:

```typescript
// CURRENT STATE (layout.tsx lines 187-195):
{
  name: 'Settings',
  href: '/settings',
  icon: Settings,
  children: [
    { name: 'General', href: '/settings', icon: Settings },
    { name: 'Room Layouts', href: '/settings/room-layouts', icon: LayoutDashboard, moduleKey: 'room_layouts' },
  ],
},
```

**Change it to:**

```typescript
// UPDATED — add Profit Centers child:
{
  name: 'Settings',
  href: '/settings',
  icon: Settings,
  children: [
    { name: 'General', href: '/settings', icon: Settings },
    { name: 'Profit Centers', href: '/settings/profit-centers', icon: Building2 },
    { name: 'Room Layouts', href: '/settings/room-layouts', icon: LayoutDashboard, moduleKey: 'room_layouts' },
  ],
},
```

Also verify `Building2` is in the lucide-react import at the top of the file (it may already be imported for accounting bank accounts).

**No `moduleKey` gate** — Profit Centers are part of `platform_core` which every tenant has. Unlike Room Layouts (`moduleKey: 'room_layouts'`), this entry should always be visible.

This makes "Profit Centers" appear in the sidebar under Settings, between "General" and "Room Layouts". When the user clicks it, it navigates to `/settings/profit-centers` which renders the code-split page defined in Deliverable 3.

---

## DELIVERABLE 4 — POST-LOGIN TERMINAL SELECTION SCREEN

After authentication, before entering the main application, the user must select their working context.

### Architecture: `TerminalSessionProvider` (React Context)

Follow the same pattern as `AuthProvider` and `EntitlementsProvider` — React Context wrapping the dashboard layout. Store in localStorage for V1 (same approach as `usePOSConfig`).

**File: `apps/web/src/components/terminal-session-provider.tsx`**

```typescript
'use client';
import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react';
import type { TerminalSession } from '@oppsera/core/profit-centers';

interface TerminalSessionContextValue {
  session: TerminalSession | null;
  isLoading: boolean;
  setSession: (session: TerminalSession) => void;
  clearSession: () => void;
}

const TerminalSessionContext = createContext<TerminalSessionContextValue | null>(null);

const STORAGE_KEY = 'oppsera:terminal-session';

export function TerminalSessionProvider({ children }: { children: ReactNode }) {
  const [session, setSessionState] = useState<TerminalSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load from localStorage on mount (safe for SSR)
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setSessionState(JSON.parse(stored));
      }
    } catch { /* ignore parse errors */ }
    setIsLoading(false);
  }, []);

  const setSession = useCallback((s: TerminalSession) => {
    setSessionState(s);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  }, []);

  const clearSession = useCallback(() => {
    setSessionState(null);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  return (
    <TerminalSessionContext.Provider value={{ session, isLoading, setSession, clearSession }}>
      {children}
    </TerminalSessionContext.Provider>
  );
}

export function useTerminalSession() {
  const ctx = useContext(TerminalSessionContext);
  if (!ctx) throw new Error('useTerminalSession must be used within TerminalSessionProvider');
  return ctx;
}
```

### Integration in Dashboard Layout — EXACT CHANGE REQUIRED

The dashboard layout is in `apps/web/src/app/(dashboard)/layout.tsx`. The current provider stack (lines 692-701) is:

```typescript
// CURRENT STATE (layout.tsx lines 692-701):
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <QueryProvider>
      <EntitlementsProvider>
        <NavigationGuardProvider>
          <DashboardLayoutInner>{children}</DashboardLayoutInner>
        </NavigationGuardProvider>
      </EntitlementsProvider>
    </QueryProvider>
  );
}
```

**Change it to:**

```typescript
// UPDATED — add TerminalSessionProvider + gate:
import { TerminalSessionProvider, useTerminalSession } from '@/components/terminal-session-provider';
import { TerminalSelectionScreen } from '@/components/terminal-selection-screen';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <QueryProvider>
      <EntitlementsProvider>
        <NavigationGuardProvider>
          <TerminalSessionProvider>
            <TerminalSessionGate>
              <DashboardLayoutInner>{children}</DashboardLayoutInner>
            </TerminalSessionGate>
          </TerminalSessionProvider>
        </NavigationGuardProvider>
      </EntitlementsProvider>
    </QueryProvider>
  );
}
```

**Add the gate component** (in the same file or extracted):

```typescript
function TerminalSessionGate({ children }: { children: React.ReactNode }) {
  const { session, isLoading } = useTerminalSession();

  // Still loading from localStorage
  if (isLoading) return null;

  // No terminal selected → show full-screen selection instead of dashboard
  if (!session) return <TerminalSelectionScreen />;

  return <>{children}</>;
}
```

**What this does:** When a user logs in and no terminal session exists in localStorage, they see the `TerminalSelectionScreen` (cascading dropdowns) instead of the dashboard. Once they select Location → Profit Center → Terminal and click "Continue", the session is stored in localStorage and the gate renders the normal dashboard layout. A "Switch Terminal" button in the sidebar calls `clearSession()` to re-show the selection screen.

### Terminal Selection Screen

**File: `apps/web/src/components/terminal-selection-screen.tsx`**

Single screen with cascading dropdowns. NOT a multi-step wizard. Centered card on a clean background.

```
┌─────────────────────────────────────────────┐
│                                             │
│          Select Your Terminal               │
│                                             │
│   📍 Location                               │
│   ┌─────────────────────────────────┐       │
│   │ [Select Location]           ▼   │       │
│   └─────────────────────────────────┘       │
│                                             │
│   🏢 Profit Center                          │
│   ┌─────────────────────────────────┐       │
│   │ [Select Profit Center]      ▼   │       │
│   └─────────────────────────────────┘       │
│                                             │
│   🖥️ Terminal                               │
│   ┌─────────────────────────────────┐       │
│   │ [Select Terminal]           ▼   │       │
│   └─────────────────────────────────┘       │
│                                             │
│           ┌──────────────┐                  │
│           │   Continue   │                  │
│           └──────────────┘                  │
│                                             │
└─────────────────────────────────────────────┘
```

**UX Behavior:**
1. Page loads → Fetch locations for tenant via `GET /api/v1/terminal-session/locations`
2. User selects Location → Fetch profit centers via `GET /api/v1/terminal-session/profit-centers?locationId=xxx`
3. User selects Profit Center → Fetch terminals via `GET /api/v1/terminal-session/terminals?profitCenterId=xxx`
4. User selects Terminal → "Continue" button enables
5. On Continue → Call `useTerminalSession().setSession(session)` which stores in localStorage and renders the dashboard

**Auto-select behavior:** If tenant has only 1 location, auto-select it and immediately fetch profit centers. If profit center has only 1 terminal, auto-select it.

### Hook: `apps/web/src/hooks/use-terminal-selection.ts`

```typescript
'use client';
import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/api-client';
import type { TerminalSession } from '@oppsera/core/profit-centers';

interface SelectionItem {
  id: string;
  name: string;
  code?: string | null;
  icon?: string | null;
  terminalNumber?: number | null;
  deviceIdentifier?: string | null;
}

export function useTerminalSelection() {
  const [locations, setLocations] = useState<SelectionItem[]>([]);
  const [profitCenters, setProfitCenters] = useState<SelectionItem[]>([]);
  const [terminals, setTerminals] = useState<SelectionItem[]>([]);

  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);
  const [selectedProfitCenterId, setSelectedProfitCenterId] = useState<string | null>(null);
  const [selectedTerminalId, setSelectedTerminalId] = useState<string | null>(null);

  const [isLoading, setIsLoading] = useState(true);

  // Load locations on mount
  useEffect(() => {
    (async () => {
      try {
        const res = await apiFetch<{ data: SelectionItem[] }>(
          '/api/v1/terminal-session/locations',
        );
        setLocations(res.data);
        // Auto-select if only 1 location
        if (res.data.length === 1) {
          setSelectedLocationId(res.data[0]!.id);
        }
      } catch { /* handle error */ }
      setIsLoading(false);
    })();
  }, []);

  // Load profit centers when location changes
  useEffect(() => {
    if (!selectedLocationId) {
      setProfitCenters([]);
      setSelectedProfitCenterId(null);
      setTerminals([]);
      setSelectedTerminalId(null);
      return;
    }
    (async () => {
      const res = await apiFetch<{ data: SelectionItem[] }>(
        `/api/v1/terminal-session/profit-centers?locationId=${selectedLocationId}`,
      );
      setProfitCenters(res.data);
      setSelectedProfitCenterId(null);
      setTerminals([]);
      setSelectedTerminalId(null);
      // Auto-select if only 1
      if (res.data.length === 1) {
        setSelectedProfitCenterId(res.data[0]!.id);
      }
    })();
  }, [selectedLocationId]);

  // Load terminals when profit center changes
  useEffect(() => {
    if (!selectedProfitCenterId) {
      setTerminals([]);
      setSelectedTerminalId(null);
      return;
    }
    (async () => {
      const res = await apiFetch<{ data: SelectionItem[] }>(
        `/api/v1/terminal-session/terminals?profitCenterId=${selectedProfitCenterId}`,
      );
      setTerminals(res.data);
      setSelectedTerminalId(null);
      // Auto-select if only 1
      if (res.data.length === 1) {
        setSelectedTerminalId(res.data[0]!.id);
      }
    })();
  }, [selectedProfitCenterId]);

  const canContinue = !!(selectedLocationId && selectedProfitCenterId && selectedTerminalId);

  const buildSession = useCallback((): TerminalSession | null => {
    if (!canContinue) return null;
    const loc = locations.find((l) => l.id === selectedLocationId)!;
    const pc = profitCenters.find((p) => p.id === selectedProfitCenterId)!;
    const term = terminals.find((t) => t.id === selectedTerminalId)!;
    return {
      locationId: loc.id,
      locationName: loc.name,
      profitCenterId: pc.id,
      profitCenterName: pc.name,
      terminalId: term.id,
      terminalName: term.name,
      terminalNumber: term.terminalNumber ?? null,
    };
  }, [canContinue, locations, profitCenters, terminals,
      selectedLocationId, selectedProfitCenterId, selectedTerminalId]);

  return {
    locations, profitCenters, terminals,
    selectedLocationId, selectedProfitCenterId, selectedTerminalId,
    setSelectedLocationId, setSelectedProfitCenterId, setSelectedTerminalId,
    canContinue, buildSession, isLoading,
  };
}
```

---

## DELIVERABLE 5 — SESSION INTEGRATION & MODULE ACCESS

### Usage in Modules

Every module that creates transactional records pulls from the terminal session context:

```typescript
// In any component that needs terminal context
import { useTerminalSession } from '@/components/terminal-session-provider';

function SomeTransactionalComponent() {
  const { session } = useTerminalSession();

  const handleCreateOrder = async () => {
    await apiFetch('/api/v1/orders', {
      method: 'POST',
      body: JSON.stringify({
        ...orderData,
        terminalId: session!.terminalId,
        // locationId is already provided by middleware from X-Location-Id header
      }),
    });
  };
}
```

### Backward Compatibility with Existing POS

The existing POS has two terminal ID mechanisms that must be migrated:

1. **`useTerminalId()` in `pos/layout.tsx`** (line 29) — currently defaults to `'POS-01'` and reads from localStorage key `pos_terminal_id`. Replace with:
```typescript
function useTerminalId(): string {
  const { session } = useTerminalSession();
  return session?.terminalId ?? 'POS-01'; // fallback for safety
}
```

2. **`usePOSConfig()` in `hooks/use-pos-config.ts`** — currently generates synthetic terminal IDs like `terminal_{locationId}_retail`. The `config.terminalId` field should read from `useTerminalSession().session.terminalId` instead:
```typescript
// In usePOSConfig, override the synthetic terminalId with the real one:
const { session } = useTerminalSession();
const config = {
  ...loadedConfig,
  terminalId: session?.terminalId ?? loadedConfig.terminalId,
  locationId: session?.locationId ?? loadedConfig.locationId,
};
```

### Display in Dashboard Layout

Show the current terminal context in the sidebar footer or top bar:

```typescript
const { session, clearSession } = useTerminalSession();

// Display example: "Main Building > Bar > Terminal 1"
// With a "Switch" button that calls clearSession() to re-show selection screen
```

---

## FUTURE PROVISIONING (DESIGN ONLY — DO NOT IMPLEMENT)

The architecture must be compatible with these future features. DO NOT build them — just ensure the schema and architecture don't block them:

| Feature | Design Consideration |
|---|---|
| Terminal hardware mapping | `device_identifier` + `ip_address` fields added now |
| Printer routing | Already exists: `receipt_printer_id` on terminals, `fnb_print_routing_rules` |
| Cash drawers | `drawer_events` table already references `terminal_id` |
| Default terminal per user | Future `user_terminal_preferences` table (FK → terminals) |
| Shift management | Orders already have `shift_id`; connect to terminal context |
| Terminal restrictions by role | Future `role_terminal_access` table |
| User-terminal permissions | Future `user_terminal_permissions` table |

---

## ARCHITECTURE RULES

### Placement

Profit Centers and Terminals are **Global Core Entities**:

```
packages/core/src/profit-centers/     ← Commands, queries, types, validation
apps/web/src/app/api/v1/             ← API routes (profit-centers/, terminals/, terminal-session/)
apps/web/src/app/(dashboard)/settings/profit-centers/  ← Settings UI pages
apps/web/src/components/settings/     ← Reusable card + modal components
apps/web/src/components/terminal-session-provider.tsx   ← React Context provider
apps/web/src/components/terminal-selection-screen.tsx    ← Post-login selection screen
apps/web/src/hooks/                   ← Data hooks (use-profit-centers, use-terminals, use-terminal-selection)
```

They do **NOT** belong inside the POS module, F&B module, or any other business module.

### Backward Compatibility

- The DB columns `terminal_location_id` and `terminal_id` remain unchanged everywhere
- API responses use friendlier names (`profitCenterId`, `terminalId`, `name`) with mapping in the query layer (DB `title` → API `name`, DB `terminal_location_id` → API `profitCenterId`)
- All existing queries that reference `terminal_locations` and `terminals` continue to work
- New fields are nullable or have defaults — no migration failures on existing data
- The existing `useTerminalId()` and `usePOSConfig()` hooks must be updated to read from the new `TerminalSessionProvider`

### Patterns to Follow (Reference)

| Pattern | Implementation |
|---|---|
| ORM | Drizzle ORM — `sql` template literals for complex queries, fluent API for simple inserts/updates |
| Commands | `publishWithOutbox(ctx, async (tx) => { validate → insert → build event → return { result, events } })` |
| Queries | `withTenant(tenantId, async (tx) => { execute sql → map rows → return typed result })` |
| Row mapping | `Array.from(rows as Iterable<Record<string, unknown>>)` + explicit `String()` / `Number()` / `Boolean()` |
| API routes | `withMiddleware(handler, { entitlement: '...', permission: '...' })` |
| Validation | Zod `.safeParse()` in route handler, throw `ValidationError` on failure |
| Response shapes | `{ data: ... }` for single, `{ data: [...] }` for lists, `{ error: { code, message } }` for errors |
| Frontend pages | Code-split: thin `page.tsx` with `next/dynamic` + `ssr: false`, content in `*-content.tsx` |
| Dialogs/Modals | `createPortal(... , document.body)` with z-50 |
| Data hooks | `{ data, isLoading, error, refetch }` using `apiFetch()` |
| Global state | React Context + Provider (like `AuthProvider`, `EntitlementsProvider`) |
| Icons | `lucide-react` only |
| Dark mode | Use `bg-surface` for backgrounds, opacity-based hover states. No `bg-gray-900 text-white` |

---

## SUCCESS CRITERIA

The implementation is complete when:

- [ ] Migration `0092_profit_center_extensions.sql` adds columns to both tables
- [ ] Drizzle schema in `packages/db/src/schema/terminals.ts` updated with new columns + indexes
- [ ] Migration journal entry added to `_journal.json`
- [ ] Zod validation schemas for create/update profit center and terminal
- [ ] Types: `ProfitCenter`, `Terminal`, `TerminalSession`
- [ ] Commands: `createProfitCenter`, `updateProfitCenter`, `deactivateProfitCenter`, `createTerminal`, `updateTerminal`, `deactivateTerminal`
- [ ] Queries: `listProfitCenters` (with terminal counts + location join), `getProfitCenter`, `listTerminals`, `getTerminal`, `getLocationsForSelection`, `getProfitCentersForSelection`, `getTerminalsForSelection`
- [ ] All commands/queries exported from `packages/core/src/profit-centers/index.ts` and re-exported from `packages/core/src/index.ts`
- [ ] API routes under `/api/v1/profit-centers/` with `withMiddleware`, Zod validation, proper response envelopes
- [ ] API routes under `/api/v1/terminals/[id]/` for individual terminal CRUD
- [ ] API routes under `/api/v1/terminal-session/` for cascading selection data
- [ ] Settings UI: code-split profit center list page with card grid layout
- [ ] Settings UI: code-split terminal list page within a profit center (with breadcrumb)
- [ ] Add/Edit modals (portal-based, z-50) with Zod client-side validation
- [ ] `TerminalSessionProvider` (React Context) wrapping dashboard layout
- [ ] Terminal selection screen rendered when no session exists
- [ ] `useTerminalSelection` hook with cascading fetch + auto-select
- [ ] Data hooks: `useProfitCenters`, `useTerminals` with `{ data, isLoading, error, refetch }`
- [ ] Existing POS hooks (`usePOSConfig`, `useTerminalId`) updated to read from `TerminalSessionProvider`
- [ ] Sidebar shows "Profit Centers" under Settings section (with `Building2` icon)
- [ ] All existing references to `terminal_id` and `terminal_location_id` remain functional
- [ ] No existing data is lost or broken

---

## FULL DELIVERABLE CHECKLIST

| # | Deliverable | Description |
|---|---|---|
| 1 | Migration file | `packages/db/migrations/0092_profit_center_extensions.sql` — additive ALTER TABLE for both tables + indexes |
| 2 | Drizzle schema update | Update `packages/db/src/schema/terminals.ts` — add columns, update imports, update indexes |
| 3 | Validation schemas | `packages/core/src/profit-centers/validation.ts` — Zod schemas for all inputs |
| 4 | Types | `packages/core/src/profit-centers/types.ts` — `ProfitCenter`, `Terminal`, `TerminalSession` |
| 5 | Commands (6) | Create/Update/Deactivate for both profit centers and terminals |
| 6 | Queries (7) | List/Get for both + 3 terminal selection queries |
| 7 | Core exports | `packages/core/src/profit-centers/index.ts` + re-export from `packages/core/src/index.ts` |
| 8 | API routes — CRUD | `apps/web/src/app/api/v1/profit-centers/` (list, create, get, update, delete, terminals) |
| 9 | API routes — Terminals | `apps/web/src/app/api/v1/terminals/[id]/` (get, update, delete) |
| 10 | API routes — Session | `apps/web/src/app/api/v1/terminal-session/` (locations, profit-centers, terminals) |
| 11 | Data hooks | `apps/web/src/hooks/use-profit-centers.ts` + `use-terminals.ts` |
| 12 | Settings UI — Profit Centers | `apps/web/src/app/(dashboard)/settings/profit-centers/` (page + content, card grid) |
| 13 | Settings UI — Terminals | `apps/web/src/app/(dashboard)/settings/profit-centers/[id]/` (page + content) |
| 14 | Settings UI — Components | `apps/web/src/components/settings/` (ProfitCenterCard, ProfitCenterFormModal, TerminalCard, TerminalFormModal) |
| 15 | Terminal session provider | `apps/web/src/components/terminal-session-provider.tsx` — React Context + localStorage |
| 16 | Terminal selection screen | `apps/web/src/components/terminal-selection-screen.tsx` — cascading dropdowns |
| 17 | Selection hook | `apps/web/src/hooks/use-terminal-selection.ts` — cascading fetch + auto-select |
| 18 | Layout integration | Add `TerminalSessionProvider` + `TerminalSessionGate` to dashboard layout |
| 19 | POS integration | Update `useTerminalId()` and `usePOSConfig()` to use `TerminalSessionProvider` |
| 20 | Sidebar nav | Add "Profit Centers" link under Settings in sidebar |
