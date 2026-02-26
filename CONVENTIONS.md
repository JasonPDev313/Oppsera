# OppsEra — Conventions

Feed this file to Claude at the start of every session to prevent drift.

---

## 1. Monorepo Structure

```
oppsera/
├── apps/web/                    # Next.js 15 App Router (frontend + API routes)
├── packages/
│   ├── core/                    # Platform services (auth, RBAC, entitlements, events, audit)
│   ├── db/                      # Drizzle client, schema, migrations, seeds, scripts
│   ├── shared/                  # Types, Zod schemas, utils (money, date, ULID), errors
│   └── modules/                 # Business modules (catalog, orders, etc.)
├── tools/scripts/               # Operational scripts
├── turbo.json                   # Turborepo config
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

- Package manager: **pnpm** (workspace protocol `workspace:*`)
- Build orchestrator: **Turborepo** (`turbo run build/test/lint`)
- TypeScript: **strict mode** everywhere

---

## 2. Database & Schema

### Driver & ORM

- ORM: **Drizzle** (NOT Prisma)
- Driver: **postgres.js** (`postgres` package, NOT `pg`)
- `db.execute()` returns a **RowList** (array-like iterable), NOT `{ rows: [...] }`. Always use `Array.from(result as Iterab  le<T>)` to convert.

### Table Conventions

Every tenant-scoped table includes:

| Column        | Type                   | Notes                                                             |
| ------------- | ---------------------- | ----------------------------------------------------------------- |
| `id`          | `TEXT`                 | ULID, 26-char, sortable. Generated via `$defaultFn(generateUlid)` |
| `tenant_id`   | `TEXT NOT NULL`        | FK to `tenants.id`                                                |
| `location_id` | `TEXT`                 | Nullable; only when location-specific                             |
| `created_at`  | `TIMESTAMPTZ NOT NULL` | `.defaultNow()`                                                   |
| `updated_at`  | `TIMESTAMPTZ NOT NULL` | `.defaultNow()`                                                   |
| `created_by`  | `TEXT`                 | Nullable for system records                                       |

Column naming in Postgres: **snake_case** (e.g., `tenant_id`, `created_at`).
Column naming in TypeScript (Drizzle): **camelCase** (e.g., `tenantId`, `createdAt`).

### Schema Definition Pattern

```typescript
import { pgTable, text, boolean, timestamp, jsonb, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { generateUlid } from '@oppsera/shared';

export const myTable = pgTable(
  'my_table',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    name: text('name').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_my_table_tenant').on(table.tenantId)],
);
```

### Composite Primary Keys (Partitioned Tables)

For partitioned tables (e.g., `audit_log`), use `primaryKey({ columns: [...] })` instead of `.primaryKey()` on a single column:

```typescript
(table) => [primaryKey({ columns: [table.id, table.createdAt] })];
```

### Multi-Tenancy Isolation

Three layers, all required:

1. **Application layer:** Every query filters by `tenant_id`
2. **ORM layer:** `withTenant(tenantId, callback)` — sets `SET LOCAL app.current_tenant_id` inside a transaction
3. **Database layer:** Postgres RLS policies on every tenant-scoped table

### DB Client Pattern

```typescript
// Lazy-init via Proxy (no connection until first use)
export const db: Database = new Proxy({} as DrizzleDB, { ... });

// Tenant-scoped transaction
await withTenant(tenantId, async (tx) => { ... });

// Admin client (bypasses RLS) — for system operations
const admin = createAdminClient();
```

### Connection Pool Configuration

```typescript
// postgres.js config — tuned for Vercel serverless + Supavisor
const pool = postgres(DATABASE_URL, {
  max: 2,              // Low per-instance (Vercel = many concurrent instances)
  prepare: false,       // REQUIRED for Supavisor transaction mode
  idle_timeout: 20,     // Close idle connections after 20s
  max_lifetime: 300,    // Recycle connections every 5 minutes
});
```

**Key rules:**
- `prepare: false` is **mandatory** for Supabase Supavisor (transaction-mode pooling). Prepared statements are connection-scoped and break when the pooler reassigns connections.
- `max: 2` keeps total connections manageable: total = Vercel instances × max. At 20 concurrent instances, that's ~40 connections.
- `withTenant()` uses `set_config('app.current_tenant_id', tenantId, true)` (SET LOCAL) — transaction-scoped, safe with connection poolers because it auto-clears on commit/rollback.

### Migrations

- Location: `packages/db/migrations/`
- Naming: `NNNN_description.sql` (e.g., `0003_audit_log_partitioning.sql`)
- Run via: `pnpm db:migrate`

---

## 3. Auth & Request Context

### AuthUser Interface

```typescript
interface AuthUser {
  id: string;
  email: string;
  name: string;
  tenantId: string;
  tenantStatus: string;
  membershipStatus: string;
}
```

Note: `isPlatformAdmin` lives on **RequestContext**, NOT AuthUser.

### RequestContext (AsyncLocalStorage)

```typescript
interface RequestContext {
  user: AuthUser;
  tenantId: string;
  locationId?: string;
  requestId: string;
  isPlatformAdmin: boolean;
}
```

- Stored in `AsyncLocalStorage` via `requestContext.run(ctx, fn)`
- Access anywhere: `getRequestContext()`
- Every request gets a unique `requestId` (ULID)

### withMiddleware Pattern

Every API route wraps its handler with `withMiddleware`:

```typescript
export const POST = withMiddleware(
  async (request, ctx) => {
    // ctx: RequestContext is available here
    return NextResponse.json({ data: result }, { status: 201 });
  },
  { permission: 'module.action', entitlement: 'module_key' },
);
```

Middleware chain: `authenticate → resolveTenant → resolveLocation → requireEntitlement → requirePermission → handler`

Options:

- `{ public: true }` — skip auth entirely
- `{ permission: 'perm.string' }` — check RBAC permission
- `{ entitlement: 'module_key' }` — check module is enabled for tenant

---

## 4. API Routes

### Location & Naming

- Path: `apps/web/src/app/api/v1/{resource}/route.ts`
- Admin routes: `apps/web/src/app/api/v1/admin/{resource}/route.ts`
- Export named handlers: `GET`, `POST`, `PATCH`, `DELETE`

### Request Handling Pattern

```typescript
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';

const bodySchema = z.object({ ... });

export const POST = withMiddleware(
  async (request, ctx) => {
    const body = await request.json();
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await doSomething({ tenantId: ctx.tenantId, ...parsed.data });
    await auditLog(ctx, 'entity.created', 'entity', result.id);

    return NextResponse.json({ data: result }, { status: 201 });
  },
  { permission: 'module.action' },
);
```

### Response Envelope

```json
// Success
{ "data": { ... } }

// Error (thrown as AppError subclass, caught by withMiddleware)
{ "error": { "code": "VALIDATION_ERROR", "message": "...", "details": [...] } }
```

### Pagination

Cursor-based, NOT offset-based:

```typescript
// Query params
?cursor=ULID&limit=50

// Response
{ "data": [...], "cursor": "next_cursor_value" }
```

Default limit: 50. Max limit: 100.

---

## 5. Error Handling

All errors extend `AppError` from `@oppsera/shared`:

| Error Class               | Code                      | HTTP Status |
| ------------------------- | ------------------------- | ----------- |
| `ValidationError`         | `VALIDATION_ERROR`        | 400         |
| `AuthenticationError`     | `AUTHENTICATION_REQUIRED` | 401         |
| `AuthorizationError`      | `AUTHORIZATION_DENIED`    | 403         |
| `NotFoundError`           | `NOT_FOUND`               | 404         |
| `ConflictError`           | `CONFLICT`                | 409         |
| `TenantSuspendedError`    | `TENANT_SUSPENDED`        | 403         |
| `MembershipInactiveError` | `MEMBERSHIP_INACTIVE`     | 403         |
| `ModuleNotEnabledError`   | `MODULE_NOT_ENABLED`      | 403         |

Pattern: throw an `AppError` subclass; `withMiddleware` catches it and returns the JSON error envelope.

---

## 6. Validation

- Always use **Zod** for runtime validation
- Define schemas colocated with the route or command that uses them
- Use `safeParse()`, NOT `parse()` — then throw `ValidationError` with field-level details
- Shared schemas (pagination, IDs) live in `packages/shared/src/validation/`

```typescript
const parsed = schema.safeParse(input);
if (!parsed.success) {
  throw new ValidationError(
    'Validation failed',
    parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
  );
}
```

---

## 7. Singleton / Service Registry Pattern

All engines and services use a getter/setter singleton pattern for testability:

```typescript
let _instance: MyService | null = null;

export function getMyService(): MyService {
  if (!_instance) {
    _instance = new DefaultMyService();
  }
  return _instance;
}

export function setMyService(service: MyService): void {
  _instance = service;
}
```

In production: call `getXxx()` which lazy-inits the default.
In tests: call `setXxx(mockInstance)` in `beforeEach`.

Used by: PermissionEngine, EntitlementEngine, EventBus, OutboxWriter, OutboxWorker, AuditLogger.

---

## 8. Commands (Write Operations)

Business write operations live in `packages/modules/{name}/src/commands/` (one file per command):

```typescript
// packages/modules/catalog/src/commands/create-item.ts
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import { checkIdempotency, saveIdempotencyKey } from '../helpers/idempotency';
import type { RequestContext } from '@oppsera/core/auth/context';

export async function createItem(ctx: RequestContext, input: CreateItemInput) {
  const item = await publishWithOutbox(ctx, async (tx) => {
    // 1. Idempotency check (inside transaction to prevent TOCTOU race)
    const idempotencyCheck = await checkIdempotency(tx, ctx.tenantId, input.clientRequestId, 'createItem');
    if (idempotencyCheck.isDuplicate) return { result: idempotencyCheck.originalResult as any, events: [] };
    // 2. Validate references (FK existence checks)
    // 3. Check uniqueness constraints
    // 4. Insert row
    const [created] = await tx.insert(table).values({ tenantId: ctx.tenantId, ...input }).returning();
    // 5. Build event
    const event = buildEventFromContext(ctx, 'catalog.item.created.v1', { itemId: created!.id, ... });
    // 6. Save idempotency key (inside same transaction)
    await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'createItem', created);
    return { result: created!, events: [event] };
  });
  // 7. Audit log (outside transaction, after success)
  await auditLog(ctx, 'catalog.item.created', 'catalog_item', item.id);
  return item;
}
```

Key points:

- Commands receive `RequestContext` as first arg (provides tenantId, user, locationId)
- Zod validation happens in the **route handler**, not the command
- `publishWithOutbox(ctx, fn)` wraps the DB write + event outbox in a single transaction
- The callback returns `{ result, events }` — outbox writer handles event persistence
- **Idempotency check AND save both happen inside the transaction** — prevents race conditions
- Audit logging happens **after** the transaction succeeds
- Use `tx` (transaction handle) inside `publishWithOutbox`, not bare `db`

### Module Command Organization

Each command gets its own file in `commands/`:

```
packages/modules/catalog/src/commands/
├── create-item.ts
├── update-item.ts
├── deactivate-item.ts
├── create-category.ts
├── set-location-price.ts
└── ... one file per command
```

All commands are re-exported via `commands/index.ts` and then through the module's `index.ts`.

---

## 9. Event System

### Event Naming

`{domain}.{entity}.{action}.v{N}` — e.g., `catalog.item.created.v1`

### Event Envelope

```typescript
interface EventEnvelope {
  eventId: string; // ULID
  eventType: string; // domain.entity.action.vN
  occurredAt: string; // ISO 8601
  tenantId: string;
  locationId?: string;
  actorUserId?: string;
  correlationId?: string; // requestId for traceability
  idempotencyKey: string; // tenant:type:id
  data: Record<string, unknown>;
}
```

### Publishing

Always use the **transactional outbox pattern**:

```typescript
await publishWithOutbox(tx, event);
// Writes business row + outbox row in same DB transaction
// OutboxWorker polls and dispatches to EventBus
```

### Consumer Idempotency

Consumers track `(event_id, consumer_name)` in `processed_events` table. Duplicate deliveries are silently skipped.

### Retry & Dead-Letter

Failed events retry 3x with exponential backoff, then route to dead-letter queue.

### Event Payload Enrichment

Event payloads must be **self-contained** — consumers should never need to query other modules' tables to process an event. If a consumer needs data not present in the event, the **publisher** must enrich the payload at emit time.

```typescript
// WRONG — consumer queries another module's table
async function handleOrderPlaced(event: EventEnvelope) {
  const order = await tx.select().from(orders).where(...); // cross-module violation!
}

// CORRECT — publisher includes all needed data in the event
const event = buildEventFromContext(ctx, 'order.placed.v1', {
  orderId, locationId, customerId, billingAccountId,
  businessDate, total, lineItems: lines.map(l => ({ ... })),
});
```

**Rule:** When adding a new event consumer that needs data from the publishing module, enrich the event payload — don't add a cross-module table query.

---

## 10. Audit Logging

### When to Audit

Audit every state-changing operation at the route handler level:

```typescript
const result = await createThing({ tenantId: ctx.tenantId, ...parsed.data });
await auditLog(ctx, 'thing.created', 'thing', result.id);
```

For updates, capture changes:

```typescript
const oldThing = await getThing(id);
const result = await updateThing({ ... });
const changes = computeChanges(oldThing, result);
await auditLog(ctx, 'thing.updated', 'thing', id, changes);
```

### Helper Functions

- `auditLog(ctx, action, entityType, entityId, changes?, metadata?)` — for user-initiated actions
- `auditLogSystem(tenantId, action, entityType, entityId, metadata?)` — for system/worker actions

### Dual-Mode Writes

- User actions → normal `db` (respects RLS)
- System/API key actions → `createAdminClient()` (bypasses RLS)

### Non-Throwing

Audit log writes **never throw** — failures are caught and logged to console. Audit should never break main operations.

---

## 11. Testing

### Framework

**Vitest** — all test files: `__tests__/*.test.ts`

Coverage: `@vitest/coverage-v8` configured in all 16 vitest configs. Run `pnpm test:coverage` for reports (text + json-summary + lcov). See §83 for CI integration.

### Mock Pattern (vi.hoisted)

```typescript
const { mockExecute, mockInsert } = vi.hoisted(() => ({
  mockExecute: vi.fn().mockResolvedValue([]),
  mockInsert: vi.fn(),
}));

// Set up default chains
mockInsert.mockReturnValue({
  values: vi.fn().mockReturnValue({
    returning: vi.fn().mockResolvedValue([]),
  }),
});

vi.mock('@oppsera/db', () => ({
  db: { execute: mockExecute, insert: mockInsert, query: {} },
  // ... table symbols and sql helper
}));
```

### Critical Testing Gotchas

1. **`vi.clearAllMocks()` does NOT clear `mockResolvedValueOnce` queues.** Always set up per-test mocks fresh after `clearAllMocks`.

2. **postgres.js `db.execute()` returns array-like RowList**, not `{ rows: [...] }`. Mock it as returning arrays directly:

   ```typescript
   mockExecute.mockResolvedValueOnce([{ id: '1', name: 'test' }]);
   ```

3. **`sql.raw()` from drizzle-orm returns a SQL object**, not a string. To inspect query content in tests, mock drizzle-orm:

   ```typescript
   vi.mock('drizzle-orm', () => ({
     sql: Object.assign(
       vi.fn((...args: unknown[]) => args),
       {
         raw: vi.fn((str: string) => str),
       },
     ),
     eq: vi.fn(),
     and: vi.fn(),
   }));
   ```

4. **Always mock `@oppsera/shared`** when using `generateUlid` to get deterministic IDs:

   ```typescript
   vi.mock('@oppsera/shared', () => ({
     generateUlid: vi.fn(() => 'ULID_TEST_001'),
   }));
   ```

5. **Always mock `../../auth/supabase-client`** to avoid Supabase initialization:

   ```typescript
   vi.mock('../../auth/supabase-client', () => ({
     createSupabaseAdmin: vi.fn(),
     createSupabaseClient: vi.fn(),
   }));
   ```

6. **Set DATABASE_URL** before imports if DB client is transitively imported:

   ```typescript
   process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
   ```

7. **Parameterized SQL produces objects, not strings.** When testing code that uses `sql` template literals, the mock call args are structured objects. Don't cast to `string` — use `JSON.stringify()`:

   ```typescript
   // WRONG — sql template literals are NOT strings
   const sqlArg = mockExecute.mock.calls[0]?.[0] as string;
   expect(sqlArg).toContain('entity_type'); // fails!

   // CORRECT — stringify to inspect contents
   const sqlArg = JSON.stringify(mockExecute.mock.calls[0]);
   expect(sqlArg).toContain('entity_type'); // works
   ```

8. **Idempotency mocks use in-transaction pattern.** Since `checkIdempotency` now runs inside `publishWithOutbox`, mock it via `mockSelectReturns` (the tx.select chain), not `db.query.idempotencyKeys.findFirst`:
   ```typescript
   // Mock a duplicate request inside transaction
   mockSelectReturns([
     {
       tenantId: TENANT_A,
       clientRequestId: 'req_dup',
       resultPayload: { id: 'cached_order' },
       expiresAt: new Date(Date.now() + 86400000),
     },
   ]);
   ```

### Module Test Mock Pattern (Commands + Queries)

For testing module commands/queries, mock the DB with chainable methods:

```typescript
const { mockInsert, mockSelect, mockUpdate, mockDelete, mockPublishWithOutbox } = vi.hoisted(() => {
  // Helper to create chainable select mock: .from().where().orderBy()...
  function makeSelectChain(result: unknown[] = []) {
    const chain: Record<string, ReturnType<typeof vi.fn>> = {};
    chain.from = vi.fn().mockReturnValue(chain);
    chain.where = vi.fn().mockReturnValue(chain);
    chain.orderBy = vi.fn().mockReturnValue(chain);
    chain.limit = vi.fn().mockReturnValue(chain);
    chain.leftJoin = vi.fn().mockReturnValue(chain);
    chain.then = vi.fn((resolve: (v: unknown) => void) => resolve(result));
    return chain;
  }

  return {
    mockInsert: vi.fn(),
    mockSelect: vi.fn(() => makeSelectChain()),
    mockUpdate: vi.fn(),
    mockDelete: vi.fn(),
    mockPublishWithOutbox: vi.fn(),
  };
});
```

Key: The `then` property on the chain makes it awaitable, so `await tx.select().from().where()` resolves to the mock data.

### Test Structure

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// 1. vi.hoisted() mocks at top
// 2. vi.mock() calls
// 3. process.env setup
// 4. Imports of code under test
// 5. Test data factories (makeCtx, etc.)

describe('Feature', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset singleton state
    // Re-setup default mock chains after clearAllMocks
  });

  it('does the thing', async () => { ... });
});
```

---

## 12. Exports & Imports

### Package Exports

Every package re-exports from a barrel `index.ts`:

- Types: `export type { MyInterface } from './module'`
- Values: `export { MyClass, myFunction } from './module'`

### Import Paths

Use **subpath imports** for granular access:

```typescript
// Preferred (specific subpath)
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { auditLog } from '@oppsera/core/audit';

// Also valid (barrel re-export)
import { createRole, assignRole } from '@oppsera/core/permissions';
```

### DB Package Exports

```typescript
import { db, withTenant, createAdminClient, sql, schema } from '@oppsera/db';
import { roles, rolePermissions, tenants } from '@oppsera/db'; // schema tables
```

---

## 13. Permissions (RBAC)

### Permission Strings

Format: `{resource}.{action}` — e.g., `users.view`, `users.manage`, `settings.view`

Wildcard: `*` grants all permissions.

### Checking Permissions

- In routes: use `withMiddleware` options: `{ permission: 'users.manage' }`
- Programmatically: `await requirePermission('perm.string')(ctx)`
- Engine: `getPermissionEngine().hasPermission(tenantId, userId, permission)`

### Location-Scoped Roles

Role assignments can be tenant-wide (`locationId = null`) or location-specific. Resolution unions all applicable roles.

### Adding New Permissions

When adding a new permission to the system, **update all three files**:

1. **`packages/shared/src/permissions/permission-matrix.ts`** — add to `PERMISSION_MATRIX` (authoritative source of truth)
2. **`apps/web/src/app/(dashboard)/settings/settings-content.tsx`** — add to `PERMISSION_GROUPS` so it appears in the role manager UI. Large modules use hierarchical `subGroups` (F&B POS, PMS, Accounting, POS/Orders, Platform). Add a new sub-group if adding a new sub-module.
3. **`packages/db/src/seed.ts`** — add default role assignments for the 6 system roles

Missing step (2) means the permission exists but is invisible in the role manager — users cannot grant or revoke it.

### Cache

Permission cache (60s TTL). Invalidate after role changes: `engine.invalidateCache(tenantId, userId)`.

---

## 14. Entitlements

### Module Keys

`platform_core`, `catalog`, `pos_retail`, `payments`, `inventory`, `customers`, etc.

### Checking Entitlements

- In routes: `{ entitlement: 'module_key' }` option on `withMiddleware`
- Programmatically: `await requireEntitlement('module_key')(ctx)`

### Limit Checks

```typescript
await checkSeatLimit(tenantId, 'module_key');
await checkLocationLimit(tenantId, 'module_key');
```

---

## 15. Frontend (Next.js App Router)

### Client Components

- `'use client'` directive at top of every interactive component/page
- State management via React hooks (`useState`, `useEffect`, `useCallback`, `useMemo`)
- Data fetching via custom hooks wrapping `apiFetch`
- **Code-split pattern**: every heavy page uses `next/dynamic` with `ssr: false` — `page.tsx` is a thin wrapper, heavy logic lives in `*-content.tsx`. See §57 for details.

### API Client

```typescript
import { apiFetch, ApiError } from '@/lib/api-client';

const data = await apiFetch('/api/v1/resource');
```

`apiFetch` auto-attaches Bearer token, attempts token refresh on 401 (deduplicated across concurrent requests), and throws `ApiError` on non-2xx responses. On final 401 failure, clears tokens and lets auth context redirect to `/login`.

### Styling

Tailwind CSS v4, utility classes directly in JSX. Design tokens:

- Primary: `indigo-600` / `indigo-700` (hover)
- Background: `gray-50` (page), `white` (cards)
- Borders: `gray-200` (cards), `gray-100` (dividers)
- Text: `gray-900` (primary), `gray-500` (secondary), `gray-400` (muted)
- Destructive: `red-600`

#### Tailwind v4 Monorepo Configuration

Tailwind v4 uses CSS-first configuration (no `tailwind.config.js`). Critical files:

- **`apps/web/src/app/globals.css`** — must start with `@import 'tailwindcss';` then `@source "../../";`
- **`apps/web/postcss.config.mjs`** — uses `@tailwindcss/postcss` plugin (not the legacy `tailwindcss` plugin)
- **Native binary**: `@tailwindcss/oxide` + `@tailwindcss/oxide-win32-x64-msvc` (Windows)

The `@source "../../"` directive tells the Tailwind v4 scanner to look for utility class usage starting from the monorepo root (`../../` relative to `apps/web/src/app/globals.css`). Without it, the PostCSS plugin finds zero source files and generates CSS with only the base reset layer (~12KB instead of ~185KB). **Never remove the `@source` directive.**

On Windows, Tailwind v4's native binary (`@tailwindcss/oxide`) can intermittently fail to load, falling back to WASM which returns 0 scan results. The PostCSS plugin uses explicit `@source` directives (not `detectSources`), which bypasses the broken WASM `detectSources` path. If the native binary loads correctly (`node -e "require('@tailwindcss/oxide')"` prints `{ Scanner }`), CSS generation should work. If it fails, run `pnpm install` to restore the binary.

**Symptom**: Page renders as unstyled raw text — sidebar items visible but no layout, spacing, or colors.
**Fix**: Kill all Node processes → delete `apps/web/.next` → restart `pnpm dev` → hard refresh browser (`Ctrl+Shift+R`). See CLAUDE.md "Troubleshooting: CSS Not Loading" for full procedure.

### Dark Mode (Inverted Gray Scale) — MANDATORY ENFORCEMENT

Dark mode is the **default** (`:root` has `color-scheme: dark`). Light mode is opt-in via `.light` class. The gray scale is **inverted** in `globals.css` — in dark mode, `gray-900` maps to near-white (`#f0f6fc`) and `gray-50` maps to dark (`#1c2128`). Other color palettes (red, indigo, amber, etc.) are NOT inverted.

**Consequence:** Standard Tailwind dark mode assumptions break. `bg-gray-900 text-white` becomes near-white background with white text (invisible). `bg-white` stays white in both modes. `bg-red-50` stays a pastel pink, looking jarring on dark backgrounds.

#### Banned Classes (NEVER use these)

| Banned Class | Replacement | Why |
|---|---|---|
| `bg-white` | `bg-surface` | White is always white — invisible text in dark mode |
| `bg-gray-50` | `bg-muted` or `bg-surface` | Gray-50 maps to near-black in dark mode |
| `bg-{color}-50` (e.g., `bg-red-50`, `bg-green-50`, `bg-blue-50`, `bg-amber-50`, `bg-indigo-50`) | `bg-{color}-500/10` | Non-gray pastels are NOT inverted — they stay light |
| `bg-{color}-100` | `bg-{color}-500/10` | Same issue |
| `text-gray-900` | `text-foreground` | Gray-900 is near-white in dark mode (double-bright text) |
| `text-gray-700` | `text-foreground` or `text-muted-foreground` | Same |
| `text-gray-500` | `text-muted-foreground` | Use semantic token |
| `text-gray-400` | `text-muted-foreground` | Use semantic token |
| `text-{color}-900` / `text-{color}-800` / `text-{color}-700` | `text-{color}-500` or `text-{color}-400` | Dark shades disappear on dark backgrounds |
| `border-gray-200` / `border-gray-300` | `border-border` | Use semantic border token |
| `border-{color}-200` / `border-{color}-300` | `border-{color}-500/30` | Opacity-based borders work in both modes |
| `hover:bg-gray-50` / `hover:bg-gray-100` | `hover:bg-accent` or `hover:bg-gray-200/50` | Gray-50 is near-black in dark mode |
| `hover:bg-{color}-50` / `hover:bg-{color}-100` | `hover:bg-{color}-500/10` | Pastels don't invert |
| `dark:` prefixed classes | Use opacity-based pattern | Our theme doesn't use Tailwind `dark:` — it uses inverted grays |
| `divide-gray-200` | `divide-border` | Same as border |
| `ring-gray-300` | `ring-border` | Same as border |
| `placeholder-gray-400` | `placeholder:text-muted-foreground` | Use semantic token |

#### Semantic Design Tokens (ALWAYS use these)

| Token | CSS Variable | Dark Value | Light Value | Use For |
|---|---|---|---|---|
| `bg-surface` | `--color-surface` | `#161b22` | `#ffffff` | Page/card/dialog backgrounds |
| `bg-surface-raised` | `--color-surface-raised` | `#1c2128` | `#f8f9fa` | Elevated surfaces |
| `bg-muted` | `--color-muted` | via gray scale | via gray scale | Subtle backgrounds |
| `bg-accent` | `--color-accent` | via gray scale | via gray scale | Hover backgrounds |
| `bg-background` | `--color-background` | `#0d1117` | `#f0f6fc` | Full-page background |
| `text-foreground` | `--color-foreground` | light | dark | Primary text |
| `text-muted-foreground` | `--color-muted-foreground` | dimmed | dimmed | Secondary text |
| `border-border` | `--color-border` | dark border | light border | All borders |
| `border-input` | `--color-input` | dark input border | light input border | Form input borders |
| `bg-card` | `--color-card` | dark card | light card | Card backgrounds |

#### Correct Patterns

**Buttons:**

| Button Type         | Classes                                                      |
| ------------------- | ------------------------------------------------------------ |
| Primary             | `bg-indigo-600 text-white hover:bg-indigo-700`               |
| Destructive outline | `border border-red-500/40 text-red-500 hover:bg-red-500/10`  |
| Secondary/ghost     | `text-muted-foreground hover:bg-accent`                      |

**Status badges / colored backgrounds:**
```tsx
// WRONG — breaks in dark mode:
<span className="bg-green-50 text-green-800 border-green-200">Active</span>

// CORRECT — opacity-based, works in both modes:
<span className="bg-green-500/10 text-green-500 border-green-500/30">Active</span>
```

**Cards/panels/dialogs:**
```tsx
// WRONG:
<div className="bg-white border border-gray-200 rounded-lg">

// CORRECT:
<div className="bg-surface border border-border rounded-lg">
```

**Form inputs:**
```tsx
// WRONG:
<input className="bg-white border-gray-300 text-gray-900 placeholder-gray-400" />

// CORRECT:
<input className="bg-surface border-input text-foreground placeholder:text-muted-foreground" />
```

**Hover states:**
```tsx
// WRONG:
<button className="hover:bg-gray-50">

// CORRECT:
<button className="hover:bg-accent">
// or for colored hover:
<button className="hover:bg-red-500/10">
```

#### Exceptions (these are OK)

- `text-white` on colored buttons (e.g., `bg-indigo-600 text-white`) — the colored background ensures contrast
- `bg-white` on toggle knob circles (switch UI) — the knob should always be white
- Colors inside SVG charts, Konva canvases, or print-oriented receipt previews
- Tailwind gray classes that ARE inverted (e.g., `text-gray-600`, `bg-gray-100`) are technically safe because the gray scale IS remapped — but semantic tokens (`text-muted-foreground`, `bg-muted`) are still preferred for clarity
- `bg-black` is safe — black stays black in both modes

#### Pre-Commit Check

Before committing any `.tsx` file, mentally verify:
1. No `bg-white` (use `bg-surface`)
2. No `bg-{color}-50` or `bg-{color}-100` outside of exceptions (use `bg-{color}-500/10`)
3. No `text-{color}-800/900` for colored text (use `text-{color}-500`)
4. No `border-gray-200/300` (use `border-border`)
5. No `hover:bg-gray-50` (use `hover:bg-accent`)
6. No `dark:` prefixed classes (not supported by our theme system)

### Data Fetching Hooks

Custom hooks live in `apps/web/src/hooks/` and follow this pattern:

```typescript
// Generic fetcher (returns { data, isLoading, error, mutate })
function useFetch<T>(url: string | null) { ... }

// Domain hooks compose the generic fetcher
export function useDepartments() {
  const { data: all, ...rest } = useFetch<CategoryRow[]>('/api/v1/catalog/categories');
  const departments = (all || []).filter((c) => c.parentId === null);
  return { data: departments, ...rest };
}
```

Key patterns:

- Pass `null` URL to skip fetch (conditional fetching)
- `mutate` function refetches data (for refresh after mutations)
- `useMutation<TInput, TResult>` wraps async functions with loading state and error toasts
- Cursor pagination: `useCatalogItems` returns `{ data, hasMore, loadMore }`

### Reusable UI Components

Components live in `apps/web/src/components/ui/` and are self-contained:

| Component            | Props                                                  | Notes                                                                             |
| -------------------- | ------------------------------------------------------ | --------------------------------------------------------------------------------- |
| `Badge`              | `variant`, `children`                                  | 8 color variants (success, warning, error, neutral, info, indigo, purple, orange) |
| `LoadingSpinner`     | `size`, `label`                                        | sm/md/lg sizes                                                                    |
| `EmptyState`         | `icon`, `title`, `description`, `action`               | Centered placeholder                                                              |
| `SearchInput`        | `value`, `onChange`, `placeholder`                     | 300ms debounced with clear button                                                 |
| `CurrencyInput`      | `value`, `onChange`, `error`                           | $ prefix, 2 decimal formatting                                                    |
| `ConfirmDialog`      | `open`, `onClose`, `onConfirm`, `title`, `destructive` | Portal-based modal                                                                |
| `Toast` / `useToast` | `toast.success()`, `toast.error()`, `toast.info()`     | Provider + context pattern                                                        |
| `FormField`          | `label`, `required`, `error`, `helpText`, `children`   | Slot-based form wrapper                                                           |
| `Select`             | `options`, `value`, `onChange`, `multiple`             | Single/multi with search for 6+ options                                           |
| `DataTable`          | `columns`, `data`, `isLoading`, `onRowClick`           | Desktop table + mobile cards, skeleton loading                                    |

### Page Structure

Catalog pages follow this pattern:

```
apps/web/src/app/(dashboard)/catalog/
├── page.tsx                    # Items list (default catalog route)
├── hierarchy/page.tsx          # Hierarchy manager
├── taxes/page.tsx              # Tax management
└── items/
    ├── new/page.tsx            # Create item (type-branching wizard)
    └── [id]/
        ├── page.tsx            # Item detail (read-only + tax group management)
        └── edit/page.tsx       # Edit item (type-specific fields, diff-only PATCH)
```

### Type Definitions

Frontend types live in `apps/web/src/types/catalog.ts`:

- `ItemTypeGroup`: `'fnb' | 'retail' | 'service' | 'package'`
- `ITEM_TYPE_MAP`: maps frontend groups to backend enum values
- `getItemTypeGroup()`: reverse maps backend type to frontend group
- Type-specific metadata interfaces: `FnbMetadata`, `RetailMetadata`, `ServiceMetadata`, `PackageMetadata`
- API response types: `CatalogItemRow`, `CategoryRow`, `TaxRateRow`, `TaxGroupRow`, etc.

### Auth Context

`useAuthContext()` provides: `user`, `tenant`, `locations`, `login`, `signup`, `logout`, `fetchMe`, `isAuthenticated`, `isLoading`, `needsOnboarding`

### Auth Flow

1. **Login**: POST /api/v1/auth/login → store tokens → fetch /api/v1/me
2. **Onboarding check**: If `/me` returns `tenant: null`, redirect to `/onboard`
3. **Dashboard guard**: `needsOnboarding` (user exists but no tenant) → redirect to `/onboard`
4. **Auth layout**: Allows `/onboard` route through with existing token (no redirect to dashboard)
5. **Token expiry**: 401 from `apiFetch` → clear tokens → redirect to `/login`

### Sidebar Navigation

Navigation items support expandable children:

```typescript
interface NavItem {
  name: string;
  href: string;
  icon: LucideIcon;
  moduleKey?: string; // For entitlement gating
  children?: SubNavItem[]; // Expandable sub-menu
}
```

Disabled modules show a lock icon. Active parent expands to show children with indented links.

---

## 16. Naming Conventions

| Context                 | Convention                    | Example                           |
| ----------------------- | ----------------------------- | --------------------------------- |
| Postgres columns        | snake_case                    | `tenant_id`, `created_at`         |
| TypeScript properties   | camelCase                     | `tenantId`, `createdAt`           |
| API response keys       | camelCase                     | `{ "entityType": "role" }`        |
| Table names             | snake_case, plural            | `roles`, `role_assignments`       |
| Drizzle table variables | camelCase, plural             | `roles`, `roleAssignments`        |
| Event types             | dot.separated.vN              | `order.placed.v1`                 |
| Audit actions           | dot.separated                 | `role.created`, `role.updated`    |
| Permission strings      | resource.action               | `users.manage`, `settings.view`   |
| Module keys             | snake_case                    | `platform_core`, `pos_retail`     |
| Migration files         | NNNN_description.sql          | `0003_audit_log_partitioning.sql` |
| Test files              | `__tests__/*.test.ts`         | `__tests__/audit.test.ts`         |
| ID prefixes (display)   | lowercase entity abbreviation | `tnt_`, `usr_`, `loc_`, `rol_`    |

---

## 17. Business Module Internal Structure

Every business module under `packages/modules/{name}/` follows this structure:

```
packages/modules/catalog/
├── src/
│   ├── schema.ts              # Drizzle table definitions (this module's tables ONLY)
│   ├── schema-taxes.ts        # Additional schema files for sub-domains
│   ├── commands/              # Write operations (one file per command)
│   │   ├── index.ts           # Re-exports all commands
│   │   ├── create-item.ts
│   │   ├── update-item.ts
│   │   └── ...
│   ├── queries/               # Read operations (one file per query)
│   │   ├── index.ts
│   │   ├── list-items.ts
│   │   └── ...
│   ├── events/
│   │   ├── types.ts           # Event type constants and contract interfaces
│   │   └── index.ts
│   ├── internal-api.ts        # Read-only interface for cross-module lookups
│   ├── validation.ts          # Zod schemas for commands (shared across routes)
│   ├── validation-taxes.ts    # Additional validation for sub-domains
│   ├── tax-calc.ts            # Domain-specific helpers (tax calculation, etc.)
│   ├── __tests__/             # Tests colocated in module
│   │   ├── catalog.test.ts
│   │   └── tax-system.test.ts
│   └── index.ts               # Module entry point (re-exports everything)
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

### Module Index Exports

The module `index.ts` is the single public API surface:

```typescript
// Commands
export { createItem } from './commands/create-item';
// Queries
export { listItems } from './queries/list-items';
// Validation schemas + inferred types
export { createItemSchema, type CreateItemInput } from './validation';
// Event types
export { CATALOG_EVENTS } from './events/types';
// Internal API (for cross-module use)
export { getCatalogReadApi, type CatalogReadApi } from './internal-api';
// Domain helpers
export { calculateTaxes } from './tax-calc';
```

### package.json Subpath Exports

Use wildcard exports for subpath access:

```json
{
  "exports": {
    ".": "./src/index.ts",
    "./*": "./src/*.ts"
  }
}
```

This allows imports like `@oppsera/module-catalog/validation-taxes` without explicit entries.

### Internal API Pattern

For **synchronous cross-module reads** (e.g., looking up item prices during order creation), expose a read-only internal API:

```typescript
// internal-api.ts
export interface CatalogReadApi {
  getItemPrice(tenantId: string, itemId: string, locationId?: string): Promise<PriceResult>;
  getItemTaxes(tenantId: string, itemId: string, locationId: string): Promise<TaxResult>;
}

let _api: CatalogReadApi | null = null;
export function getCatalogReadApi(): CatalogReadApi { ... }
export function setCatalogReadApi(api: CatalogReadApi): void { ... }
```

Internal APIs follow the singleton getter/setter pattern and are the **only exception** to the "events-only cross-module" rule.

---

## 18. Location-Scoped Data

Some entities are scoped to specific locations (e.g., tax groups, location prices). Patterns:

- Tables include `location_id TEXT NOT NULL REFERENCES locations(id)`
- API routes accept `?locationId=...` query parameter
- Frontend uses `useAuthContext().locations` to populate location selectors
- Tax groups, prices, and entitlements can vary per location within a tenant

### Tax System

Tax rates are tenant-global. Tax groups compose rates and are location-scoped. Item tax assignments link items to groups at specific locations.

V1 constraint: All tax groups assigned to the same item at the same location must share the same `calculationMode` (exclusive or inclusive). This is validated in `assignItemTaxGroups`.

---

## 19. Zod Schema Best Practices

### `z.input<>` vs `z.infer<>`

When a Zod schema uses `.default()`, the **output type** makes that field required (it always has a value after parsing), but the **input type** keeps it optional (callers don't need to provide it).

```typescript
const openOrderSchema = z.object({
  source: z.enum(['pos', 'online', 'phone']).default('pos'),
  isTaxable: z.boolean().default(false),
});

// WRONG — source and isTaxable are REQUIRED in this type
type OpenOrderInput = z.infer<typeof openOrderSchema>;

// CORRECT — source and isTaxable are OPTIONAL in this type
type OpenOrderInput = z.input<typeof openOrderSchema>;
```

**Rule:** Use `z.input<>` for function parameter types (what callers pass in). Use `z.infer<>` only when you need the fully-resolved output type (after defaults are applied).

This matters for every schema with `.default()`, `.optional()`, or `.transform()` — if the input shape differs from the output shape, pick the right one.

### Validation Schema Colocation

- **Command input schemas**: `packages/modules/{name}/src/validation.ts`
- **Idempotency mixin**: Reuse across modules
  ```typescript
  const idempotencyMixin = { clientRequestId: z.string().min(1).max(128).optional() };
  ```
- **Route-level parsing**: Always in the route handler, never in the command itself

---

## 20. Type Re-Export Scoping

`export type { X } from './module'` re-exports a type for consumers but does **NOT** create a local binding in the same file.

```typescript
// WRONG — ItemTypeGroup is NOT available locally
export type { ItemTypeGroup } from '@oppsera/shared';
const badges: Record<ItemTypeGroup, ...> = {};  // TS error!

// CORRECT — separate import for local use
import type { ItemTypeGroup } from '@oppsera/shared';
export type { ItemTypeGroup } from '@oppsera/shared';
const badges: Record<ItemTypeGroup, ...> = {};  // works
```

**Rule:** If you need a type both locally AND as a re-export, add an explicit `import type` at the top of the file.

---

## 21. Money Representation

### Two Conventions (by Layer)

| Layer                           | Format  | Type                     | Example   |
| ------------------------------- | ------- | ------------------------ | --------- |
| Catalog (prices, costs)         | Dollars | `NUMERIC(12,2)` / string | `"29.99"` |
| Orders (totals, line amounts)   | Cents   | `INTEGER`                | `2999`    |
| Tenders (amounts, change, tips) | Cents   | `INTEGER`                | `2999`    |
| GL Journal Entries              | Dollars | `NUMERIC(12,2)` / string | `"29.99"` |
| AP Bills / AR Invoices          | Dollars | `NUMERIC(12,2)` / string | `"29.99"` |
| Receiving / Landed Cost         | Dollars | `NUMERIC(12,4)` / string | `"29.9900"`|

### Conversion Pattern

When crossing the catalog→orders boundary, convert dollars to cents:

```typescript
const unitPriceCents = Math.round(parseFloat(catalogPrice) * 100);
```

**Rule:** Use `Math.round()` to prevent floating-point drift. Never store fractional cents. All arithmetic in the orders/payments layer is integer-only.

### Money Helpers (`@oppsera/shared`)

```typescript
import { toCents, toDollars, formatMoney } from '@oppsera/shared';
```

Use these helpers whenever converting between layers. Don't hand-roll `* 100` or `/ 100` conversions.

---

## 22. Idempotency Pattern (POS Commands)

POS terminals retry on network failure. All write commands that POS calls must support idempotency via `clientRequestId`.

### Implementation Pattern (Inside Transaction)

```typescript
import { checkIdempotency, saveIdempotencyKey } from '../helpers/idempotency';

export async function myCommand(ctx: RequestContext, input: MyInput) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // 1. Check idempotency INSIDE the transaction (prevents TOCTOU race)
    const idempotencyCheck = await checkIdempotency(tx, ctx.tenantId, input.clientRequestId, 'myCommand');
    if (idempotencyCheck.isDuplicate) return { result: idempotencyCheck.originalResult as any, events: [] };

    // 2. Do the actual work
    // ... insert rows, build events ...

    // 3. Save idempotency key INSIDE the same transaction
    await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'myCommand', created);

    return { result: created!, events };
  });

  await auditLog(ctx, ...);
  return result;
}
```

### `checkIdempotency` / `saveIdempotencyKey` Signature

```typescript
// Both take txOrDb as first arg — works with either tx (inside publishWithOutbox) or bare db
checkIdempotency(txOrDb: Database, tenantId: string, clientRequestId: string | undefined, commandName: string)
  → { isDuplicate: boolean; originalResult?: unknown }

saveIdempotencyKey(tx: Database, tenantId: string, clientRequestId: string | undefined, commandName: string, resultPayload: unknown)
  → void  (uses ON CONFLICT DO NOTHING for safety)
```

### Key Rules

- `idempotency_keys` table has a 24-hour TTL — old keys are ignored
- The cached result is returned as-is (same shape as the original response)
- `clientRequestId` is always optional — non-POS callers can skip it
- **Both check and save happen INSIDE the `publishWithOutbox` transaction** — this prevents a race condition where two concurrent requests both pass the check before either saves
- Idempotency functions accept `txOrDb: Database` as first parameter (transaction handle or bare db)

---

## 23. Optimistic Locking Pattern

Orders and other mutable aggregates use optimistic locking to prevent concurrent mutation conflicts.

### Schema

```typescript
// Every mutable aggregate needs a version column
version: integer('version').notNull().default(1),
```

### Fetch-for-Mutation Pattern

```typescript
import { fetchOrderForMutation, incrementVersion } from '../helpers/optimistic-lock';

export async function mutateOrder(ctx: RequestContext, input: MutateInput) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // 1. SELECT ... FOR UPDATE (row-level lock within transaction)
    const order = await fetchOrderForMutation(
      tx,
      ctx.tenantId,
      input.orderId,
      'open', // required status
      input.expectedVersion, // optional — 409 if mismatch
    );

    // 2. Do mutations...

    // 3. Increment version
    await incrementVersion(tx, order.id);

    return { result, events };
  });
}
```

### Key Rules

- `SELECT ... FOR UPDATE` prevents concurrent reads of the same row during a transaction
- `expectedVersion` is optional — when provided, throws `ConflictError` if stale
- `fetchOrderForMutation` returns snake_case DB row mapped to camelCase
- Version is incremented **inside** the transaction, after all mutations
- Raw SQL is used for `SELECT ... FOR UPDATE` because Drizzle doesn't natively support it

### Raw SQL for SELECT ... FOR UPDATE

```typescript
const rows = Array.from(
  (await tx.execute(
    sql`SELECT * FROM orders WHERE id = ${orderId} AND tenant_id = ${tenantId} FOR UPDATE`,
  )) as Iterable<SnakeCaseRow>,
);
```

Always use `Array.from(... as Iterable<T>)` to convert the postgres.js RowList result.

---

## 24. Receipt Snapshot Pattern

When an order is placed, the receipt is **frozen** — a JSON snapshot of all line items, taxes, charges, discounts, and totals at the time of placement. This snapshot is immutable and used for receipt printing/emailing.

### Why

- Tax rates or catalog prices may change after the order is placed
- The receipt must reflect what the customer was actually charged
- Fiscal compliance requires an unchangeable record

### Implementation

```typescript
// In placeOrder command:
const receiptSnapshot = {
  lines: orderLines.map((l) => ({
    name: l.catalogItemName,
    qty: l.qty,
    unitPrice: l.unitPrice,
    lineTotal: l.lineTotal,
    taxes: lineTaxes.filter((t) => t.orderLineId === l.id),
  })),
  charges: orderCharges,
  discounts: orderDiscounts,
  subtotal,
  taxTotal,
  chargeTotal,
  discountTotal,
  total,
};

await tx.update(orders).set({
  status: 'placed',
  receiptSnapshot,
  placedAt: new Date(),
});
```

### Key Rules

- Receipt snapshot is stored as JSONB on the `orders` table
- Never regenerate it from live data — always read from the frozen snapshot
- Includes all display-relevant data: item names, prices, quantities, tax breakdowns

---

## 25. Order Number Generation

Sequential, human-readable order numbers per location per business day.

### Implementation

Uses an UPSERT counter pattern on the `order_counters` table:

```typescript
// INSERT ... ON CONFLICT DO UPDATE (atomic increment)
const result = await tx.execute(sql`
  INSERT INTO order_counters (id, tenant_id, location_id, business_date, last_number)
  VALUES (${generateUlid()}, ${tenantId}, ${locationId}, ${businessDate}, 1)
  ON CONFLICT (tenant_id, location_id, business_date)
  DO UPDATE SET last_number = order_counters.last_number + 1
  RETURNING last_number
`);
const orderNumber = String(result[0].last_number).padStart(4, '0');
```

### Key Rules

- Order numbers reset daily per location (e.g., `0001`, `0002`, ...)
- The counter is incremented atomically via UPSERT — no race conditions
- Zero-padded to 4 digits for display
- `business_date` accounts for late-night orders (configurable day close time)

---

## 26. Cross-Module Communication

### Events (Async, Preferred)

Modules communicate primarily through events. The producing module emits; consuming modules subscribe.

```
catalog.item.created.v1  → inventory module auto-creates inventory item
order.placed.v1          → inventory module deducts stock
order.voided.v1          → inventory module reverses stock
tender.recorded.v1       → orders module marks order paid (when fully paid)
```

### Internal Read APIs (Sync, Exception)

For **synchronous lookups** during a transaction (e.g., fetching catalog item prices while creating an order line), use the internal API pattern:

```typescript
// Consumer (orders module):
const catalogApi = getCatalogReadApi();
const posItem = await catalogApi.getItemForPOS(tenantId, itemId, locationId);

// Provider (catalog module):
export interface CatalogReadApi {
  getItemForPOS(tenantId: string, itemId: string, locationId: string): Promise<PosItemData>;
}
```

### Key Rules

- Internal APIs are **read-only** — never mutate another module's data
- Use the getter/setter singleton pattern for testability
- Internal APIs should be minimal — only expose what consumers actually need
- Prefer events over internal APIs whenever possible (eventual consistency is usually fine)

---

## 27. Business Date & Time Dimensions

### Business Date

`businessDate` is the **trading day**, not the calendar date. Orders placed after midnight but before the location's `dayCloseTime` (default 03:00) belong to the **prior** business date.

```typescript
// business_date is a DATE column, not TIMESTAMPTZ
businessDate: date('business_date').notNull(),
```

### Time Dimension Fields on Orders

Every order carries context for reporting and reconciliation:

```typescript
businessDate: date; // trading day
terminalId: text; // which register
employeeId: text; // who created the order
shiftId: text; // which shift (V2)
```

These fields enable shift reports, Z-reports, and terminal reconciliation.

---

## 28. Fractional Quantities (F&B)

F&B items (food, beverage) support fractional quantities for split items (half sandwich, quarter portion).

### Schema

```typescript
qty: numeric('qty', { precision: 10, scale: 4 }).notNull(),
// Also used in inventory_movements.quantityDelta
```

### Allowed Fractions

Configurable per item via `FnbMetadata.allowedFractions`:

```typescript
allowedFractions: [0.25, 0.5, 0.75, 1]; // default: [1]
```

### Rules

- Retail items: always `qty = 1` (enforced in `addLineItem`)
- Service items: always `qty = 1`
- Package items: always `qty = 1`
- F&B items: fractional allowed per configuration
- Inventory movements: `numeric(10,4)` to match order line precision
- **CRITICAL:** Drizzle/postgres.js returns `numeric` columns as **strings** (e.g., `"1.0000"`). Always convert with `Number()` in query mappings before returning to the frontend. Failing to do so causes bugs like `"1.0000" !== 1` evaluating to `true`.

---

## 29. Catalog Schema Patterns

### Barcode Field

Items have both `sku` (internal) and `barcode` (UPC/EAN). Both are optional, both have per-tenant uniqueness constraints with `WHERE ... IS NOT NULL`:

```typescript
barcode: text('barcode'),
// Unique index:
uniqueIndex('uq_catalog_items_tenant_barcode')
  .on(table.tenantId, table.barcode)
  .where(sql`barcode IS NOT NULL`),
```

Validate uniqueness in create/update commands before insert (application-level check + DB constraint as safety net).

### JSONB Metadata Column

Type-specific configuration is stored as JSONB, typed via `@oppsera/shared` interfaces:

```typescript
metadata: jsonb('metadata').$type<Record<string, unknown>>(),
```

Shared metadata types: `FnbMetadata`, `RetailMetadata`, `ServiceMetadata`, `PackageMetadata`, `CatalogItemMetadata` (union). Defined in `packages/shared/src/types/catalog-metadata.ts`, re-exported by `@oppsera/shared`.

`PackageMetadata` key fields:
- `isPackage: true` — presence flag; detected by `addLineItem` and POS tap handler
- `pricingMode?: 'fixed' | 'sum_of_components'` — `fixed` = manual price; `sum_of_components` = computed from component sum
- `packageComponents[].componentUnitPrice?: number` — component price override in **dollars** stored in catalog; if absent, `addLineItem` fetches live price via `catalogApi.getEffectivePrice()` at order time

Revenue allocation helper: `computePackageAllocations(packageSalePriceCents, components)` in `@oppsera/shared`. Called by `addLineItem` to produce `allocatedRevenueCents` per component stored on `order_lines.packageComponents`.

### Junction Table `isDefault` Pattern

When a many-to-many junction needs to distinguish default vs optional associations, add a boolean flag on the junction table itself (not in metadata):

```typescript
export const catalogItemModifierGroups = pgTable(
  'catalog_item_modifier_groups',
  {
    catalogItemId: text('catalog_item_id')
      .notNull()
      .references(() => catalogItems.id, { onDelete: 'cascade' }),
    modifierGroupId: text('modifier_group_id')
      .notNull()
      .references(() => catalogModifierGroups.id, { onDelete: 'cascade' }),
    isDefault: boolean('is_default').notNull().default(false),
  },
  (table) => [primaryKey({ columns: [table.catalogItemId, table.modifierGroupId] })],
);
```

**Rule:** The junction table is the canonical source of truth. Metadata may reference the same IDs for backward compat, but reads should query the junction table.

### Archive Semantics (Replacing isActive)

Catalog items use **`archivedAt`** (timestamptz, nullable) instead of a boolean `isActive` column. Active items have `archivedAt IS NULL`.

```typescript
// Schema columns (added in migration 0060, isActive dropped in 0061):
archivedAt: timestamp('archived_at', { withTimezone: true }),
archivedBy: text('archived_by'),
archivedReason: text('archived_reason'),
```

**Why?** Timestamps provide audit context (when, by whom, why) that a boolean cannot. The `archivedReason` field is optional and populated via the archive confirmation dialog.

**Query filtering:**
```typescript
// Active items only (default)
conditions.push(isNull(catalogItems.archivedAt));
// Include archived items (when showAll is true)
// Simply omit the isNull condition
```

**Commands:**
- `archiveItem(ctx, itemId, { reason? })` — sets `archivedAt`, `archivedBy`, `archivedReason`
- `unarchiveItem(ctx, itemId)` — clears all three archived fields to null

**UI pattern:** The Items page has an "Include Inactive" checkbox. Archived rows display with `opacity-50` and show "Inactive" badge. Action menu shows "Reactivate" for archived items, "Deactivate" for active items.

### Category Nesting Depth Validation

Categories support a 3-level hierarchy: Department → SubDepartment → Category. Enforce via parent chain walking in the `createCategory` command:

```typescript
const MAX_NESTING_DEPTH = 3;
let depth = 2; // parent (1) + new child (2)
let currentParentId = parent[0]!.parentId;
while (currentParentId) {
  depth++;
  if (depth > MAX_NESTING_DEPTH) {
    throw new ValidationError(`Maximum category nesting depth is ${MAX_NESTING_DEPTH} levels`);
  }
  // fetch ancestor's parentId and continue walking
}
```

---

## 30. Future Schema Warnings

These issues were identified during cross-session review. The referenced schemas don't exist yet — address when building these modules.

| ID  | Module     | Issue                                                                          | Action When Building                                                       |
| --- | ---------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| M3  | Reporting  | `rm_daily_sales.netSales` formula should be `grossSales - discounts - refunds` | Use standard restaurant accounting formula, not `total - taxTotal`         |
| M4  | Reporting  | `rm_item_sales.quantitySold` should be `NUMERIC(10,4)` not `INTEGER`           | F&B supports fractional qty (0.5 portions) — match `order_lines.qty` type  |
| m1  | POS Config | Session 11 onboarding doesn't seed POS terminal config                         | Add terminal/drawer seeding when `POSConfig` schema is built (Session 13+) |

---

## 31. POS Frontend Architecture

### Dual-Mode Design

Two POS shells (`/pos/retail` and `/pos/fnb`) share one commerce engine (orders module). Either shell can sell any item type — a retail POS can sell F&B items (opens modifier dialog), and an F&B POS can sell retail items (direct add or option picker).

### Fullscreen Layout with Dual-Mount Switching

POS pages use a **fullscreen overlay** that covers the dashboard sidebar. Both Retail and F&B POS content components are mounted simultaneously in the layout and toggled via CSS for instant switching:

```typescript
// apps/web/src/app/(dashboard)/pos/layout.tsx
// Both POS modes mounted via next/dynamic, toggled by CSS
const RetailPOSContent = dynamic(() => import('./retail/retail-pos-content'), {
  loading: () => <RetailPOSLoading />,
  ssr: false,
});
const FnBPOSContent = dynamic(() => import('./fnb/fnb-pos-content'), {
  loading: () => <FnBPOSLoading />,
  ssr: false,
});

// Inside the component:
const isRetail = pathname.startsWith('/pos/retail');
const isFnB = pathname.startsWith('/pos/fnb');

// Lazily mount on first visit, keep mounted forever
const [visited, setVisited] = useState({ retail: isRetail, fnb: isFnB });

// Content area — CSS toggle, no route transition
<div className="relative flex-1 overflow-hidden">
  {visited.retail && (
    <div className={`absolute inset-0 ${isRetail ? '' : 'pointer-events-none invisible'}`}>
      <RetailPOSContent isActive={isRetail} />
    </div>
  )}
  {visited.fnb && (
    <div className={`absolute inset-0 ${isFnB ? '' : 'pointer-events-none invisible'}`}>
      <FnBPOSContent isActive={isFnB} />
    </div>
  )}
</div>
```

**Key rules:**
1. Page files (`retail/page.tsx`, `fnb/page.tsx`) return `null` — they exist only as Next.js route targets
2. Content lives in `retail-pos-content.tsx` / `fnb-pos-content.tsx` with `isActive` prop
3. `isActive` gates barcode listener (early return) and triggers dialog cleanup via `useEffect`
4. Portal-based dialogs (`createPortal` to `document.body`) must be closed when `isActive` becomes `false` — otherwise they remain visible on top of the other POS mode

The top bar displays: location name, terminal ID, employee name (abbreviated), and exit button.

### Universal Item Tap Handler

**Every POS shell must use the same routing logic** — switch on `typeGroup`, never on raw `item.type`:

```typescript
function handleItemTap(item: CatalogItemForPOS): string {
  switch (item.typeGroup) {
    case 'fnb':
      return 'openModifierDialog';
    case 'retail': {
      const meta = item.metadata as RetailMetadata | undefined;
      if (meta?.optionSets?.length) return 'openOptionPicker';
      return 'directAdd';
    }
    case 'service':
      return 'directAdd';
    case 'package':
      return 'openPackageConfirm';
  }
}
```

**Rule:** Always use `getItemTypeGroup()` from `@oppsera/shared` to derive the group. The mapping includes `green_fee` and `rental` as retail.

### Shell Differences (Retail vs F&B)

| Feature         | Retail               | F&B                                       |
| --------------- | -------------------- | ----------------------------------------- |
| Cart label      | "Cart"               | "Ticket"                                  |
| Primary action  | "Place & Pay"        | "Send & Pay"                              |
| Tile size       | `normal` (w-28 h-28) | `large` (w-36 h-36)                       |
| Tab size        | `normal`             | `large`                                   |
| Grid columns    | 2-5                  | 2-4                                       |
| Search position | Top of left panel    | Bottom of left panel                      |
| Repeat last     | No                   | Yes (duplicates last line with modifiers) |

### Barcode Scanner Integration

Keyboard wedge scanners emit fast keystrokes. Detection via `keydown` listener on `window`:

```typescript
const SCAN_THRESHOLD = 50; // ms between keystrokes
const MIN_LENGTH = 4; // minimum barcode length

// On Enter with buffer >= MIN_LENGTH and all gaps < SCAN_THRESHOLD:
window.dispatchEvent(new CustomEvent('barcode-scan', { detail: { barcode: buffer } }));
```

**Rule:** Ignore barcode detection when focus is in `INPUT`, `TEXTAREA`, or `contentEditable` elements.

---

## 32. POS Component Organization

### File Structure

```
apps/web/src/components/pos/
├── ItemButton.tsx           # Touchable tile with type-colored bar, price, badge
├── Cart.tsx                 # Type-aware order line list (4 internal renderers)
├── CartTotals.tsx           # Subtotal, charges, tax, discount, total
├── InventoryIndicator.tsx   # Color-coded stock level (green/amber/red)
├── CustomerAttachment.tsx   # Customer search/attach/detach
├── ModifierDialog.tsx       # F&B item configurator (fractions, modifiers, notes)
├── OptionPickerDialog.tsx   # Retail option set picker (required validation)
├── PackageConfirmDialog.tsx # Package component list; pricing table in sum_of_components mode
├── PriceOverrideDialog.tsx  # Price override with reason + manager PIN
├── ServiceChargeDialog.tsx  # Service charge (percentage/fixed, taxable)
├── DiscountDialog.tsx       # Discount (percentage/fixed with preview)
└── catalog-nav/
    ├── DepartmentTabs.tsx   # Horizontal scrollable department pills
    ├── SubDepartmentTabs.tsx # Conditional subdepartment pills
    ├── CategoryRail.tsx     # Vertical left rail (w-48, overflow-y-auto)
    ├── CatalogBreadcrumb.tsx # Clickable hierarchy breadcrumb
    ├── QuickMenuTab.tsx     # Favorites/Recent with segmented control
    └── index.ts             # Barrel re-exports
```

### Component Size Props

Components that differ between retail and F&B accept a `size` prop:

```typescript
// ItemButton, DepartmentTabs, SubDepartmentTabs
type TileSize = 'normal' | 'large';
```

Retail uses `normal`, F&B uses `large`. This keeps the component reusable while letting shells customize touch targets.

### Cart Type-Aware Rendering

`Cart.tsx` contains four internal line renderers, dispatched by `getItemTypeGroup()`:

| Renderer          | Shows                                            | Qty Controls                   |
| ----------------- | ------------------------------------------------ | ------------------------------ |
| `FnbLineItem`     | Modifiers, special instructions, fraction picker | +/- cycling `allowedFractions` |
| `RetailLineItem`  | Selected options (Size: M, Color: Blue)          | None (qty=1)                   |
| `ServiceLineItem` | Duration from metadata                           | None (qty=1)                   |
| `PackageLineItem` | "Includes: item1, item2, ..." from components. In `sum_of_components` mode shows per-component unit price and allocation %. | None (qty=1) |

All renderers show: price override indicator (strikethrough + new price + reason badge), notes, line total with tax.

### 4-Layer Catalog Navigation

The hierarchy UI is **first-class navigation**, not a search overlay:

```
┌─────────────────────────────────────────────┐
│ [ Department Tabs (horizontal scroll) ]      │ ← DepartmentTabs
├─────────────────────────────────────────────┤
│ [ SubDepartment Tabs (conditional) ]         │ ← SubDepartmentTabs
├─────────────────────────────────────────────┤
│ Breadcrumb: Food > Burgers > Beef            │ ← CatalogBreadcrumb
├───────────┬─────────────────────────────────┤
│ Category  │ ┌──────┐ ┌──────┐ ┌──────┐     │
│ Rail      │ │ Item │ │ Item │ │ Item │     │ ← ItemButton grid
│ (w-48)    │ └──────┘ └──────┘ └──────┘     │
│           │ ┌──────┐ ┌──────┐               │
│           │ │ Item │ │ Item │               │
│           │ └──────┘ └──────┘               │
└───────────┴─────────────────────────────────┘
```

**Rule:** Selecting a department resets subdepartment and category. Selecting a subdepartment resets category. Each level cascades item filtering.

---

## 33. POS Hooks Pattern

### usePOSConfig

```typescript
const { config, setConfig, isLoading } = usePOSConfig(locationId, 'retail');
```

V1 stores in localStorage keyed by `pos_config_{locationId}`. Provides sensible defaults per mode:

- Retail: barcode scanning on, kitchen printing off
- F&B: barcode scanning off, kitchen printing on, tips enabled

**Future:** Replace localStorage with server-side terminal configuration API.

### usePOS (Main State Machine)

```typescript
const catalog = useCatalogForPOS(locationId);
const pos = usePOS(config, { onItemNotFound: catalog.refresh });
// pos.currentOrder, pos.isLoading, pos.heldOrderCount
// pos.addItem(input), pos.removeItem(lineId)
// pos.placeOrder(), pos.voidOrder(reason), pos.holdOrder(), pos.recallOrder(orderId)
// pos.addServiceCharge(input), pos.removeServiceCharge(id), pos.applyDiscount(...)
// pos.attachCustomer(id), pos.detachCustomer()
```

Key behaviors:

- **Auto-open:** First `addItem()` call auto-creates an order via `POST /api/v1/orders`
- **Idempotency:** Every API call includes `crypto.randomUUID()` as `clientRequestId`
- **Conflict handling:** On 409 `ApiError`, auto-refetches the order and shows toast
- **Hold/Recall:** Hold clears local state (order stays `open` in DB), Recall fetches and loads
- **Item-not-found:** On 404 from `addItem`, calls `onItemNotFound` callback (triggers catalog refresh)

**Important:** `useCatalogForPOS` must be declared BEFORE `usePOS` so `catalog.refresh` is available as the callback.

### useCatalogForPOS

```typescript
const catalog = useCatalogForPOS(locationId);
// catalog.departments, catalog.nav, catalog.currentItems, catalog.breadcrumb
// catalog.searchQuery, catalog.setSearchQuery, catalog.lookupByBarcode(code)
// catalog.favorites, catalog.toggleFavorite(id), catalog.recentItems, catalog.addToRecent(id)
// catalog.refresh()  — manually trigger a background catalog refresh
```

Loads ALL categories + active items on mount. Builds hierarchy maps for O(1) navigation. Favorites in localStorage, recents in memory (capped at 20).

**Freshness:** Auto-refreshes every 5 minutes via `setInterval` to keep the catalog current during long POS shifts. Also exposes `refresh()` for on-demand use (wired to `usePOS.onItemNotFound` for immediate stale-item purge when archived items are tapped).

### useShift

```typescript
const shift = useShift(locationId, terminalId);
// shift.currentShift, shift.isOpen
// shift.openShift(balance), shift.closeShift(closingCount)
// shift.recordPaidIn(amount, reason), shift.recordPaidOut(amount, reason)
// shift.openDrawer()
```

V1: localStorage. Close calculates variance from opening balance + events. All operations validate shift is open first.

---

## 34. POS Frontend Types

POS types live in `apps/web/src/types/pos.ts`, separate from catalog types. Key types:

```typescript
// Terminal configuration
interface POSConfig {
  posMode: 'retail' | 'fnb';
  terminalId: string;
  locationId: string;
  // feature toggles: enableTips, enableReceipt, enableBarcodeScanner, enableKitchenPrinting
  // service charge defaults, etc.
}

// Flattened item for POS display (derived from catalog data)
interface CatalogItemForPOS {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  type: string; // raw backend type (food, retail, green_fee, etc.)
  typeGroup: ItemTypeGroup; // derived via getItemTypeGroup()
  price: number; // cents (converted from catalog dollars)
  isTrackInventory: boolean;
  onHand: number | null;
  metadata: Record<string, unknown>;
  categoryId: string;
  departmentId: string; // departmentId resolved by walking parent chain
  tax: { calculationMode: string; taxRates: unknown[] };
}

// Navigation state for catalog hierarchy
interface CatalogNavState {
  departmentId: string | null;
  subDepartmentId: string | null;
  categoryId: string | null;
}
```

**Rule:** `CatalogItemForPOS.price` is always in cents. The conversion from catalog dollars happens in `useCatalogForPOS` via `Math.round(parseFloat(price) * 100)`.

**Rule:** `departmentId` on `CatalogItemForPOS` is resolved by walking the category parent chain to the root — this avoids runtime parent lookups in the item grid.

---

## 35. Tenders / Payments Architecture

### Append-Only Financial Tables

```
tenders: NEVER UPDATE amount, amountGiven, changeGiven, tipAmount, status
tender_reversals: creates NEW ROW to reverse a tender
payment_journal_entries: NEVER UPDATE entries; void marks postingStatus='voided' + inserts reversal entry
```

### Tender Status Lifecycle

```
INSERT → status='captured' (always)
"Reversed" = derived via JOIN on tender_reversals (original tender row unchanged)
```

### GL Journal Entry Allocation

```
Partial tender (not final): proportional method
  ratio = tenderAmount / orderTotal
  revenue credit = Math.round(lineNet * ratio) per department
  tax credit = Math.round(lineTax * ratio)

Final tender (isFullyPaid): remainder method
  revenue credit = totalLineNet - previouslyPostedRevenue
  tax credit = totalLineTax - previouslyPostedTax
  → guarantees exact sum across all tenders

Both: sum(debits) === sum(credits) enforced with rounding fixup
```

### Account Mapping (V1 Hardcoded)

| Tender Type   | Debit Account          | Code |
| ------------- | ---------------------- | ---- |
| cash          | Cash on Hand           | 1010 |
| card          | Undeposited Funds      | 1020 |
| gift_card     | Gift Card Liability    | 2200 |
| store_credit  | Store Credit Liability | 2300 |
| house_account | Accounts Receivable    | 1200 |

Credit accounts: Revenue (4000), Sales Tax Payable (2100), Tips Payable (2150), Service Charge Revenue (4500)

### Cash Tender Flow

```
1. Validate: clientRequestId (REQUIRED), order status='placed', businessDate matches
2. Calculate: remaining = order.total - sum(active tenders), tenderAmount = min(amountGiven, remaining), change = max(0, amountGiven - remaining)
3. Insert tender row (append-only)
4. Generate GL journal entry (proportional or remainder)
5. Store allocationSnapshot on tender
6. If fully paid: update order.status → 'paid', set paidAt
7. Increment order version (optimistic lock)
8. Emit tender.recorded.v1 event
```

### TenderDialog (Shared POS Component)

- Used by both Retail and F&B POS shells
- z-index: 60 (above POS overlay at z-50)
- Quick denomination buttons: $5, $10, $20, $50, $100, Exact
- Tip section controlled by `POSConfig.tipEnabled`
- Split payment: stays open with updated remaining after partial payment
- Auto-closes 2s after full payment with change display

---

## 36. SQL Injection Prevention (Parameterized Queries)

### Rule: Always Use `sql` Template Literals

When building dynamic SQL with Drizzle, always use the `sql` tagged template literal. Values interpolated via `${}` become parameterized query bindings — never raw string concatenation.

```typescript
import { sql } from 'drizzle-orm';

// CORRECT — parameterized (safe)
const conditions = [sql`tenant_id = ${tenantId}`];
if (filters.entityType) {
  conditions.push(sql`entity_type = ${filters.entityType}`);
}
const whereClause = sql.join(conditions, sql` AND `);
const rows = await db.execute(sql`SELECT * FROM audit_log WHERE ${whereClause}`);

// WRONG — string interpolation (SQL injection risk!)
const rows = await db.execute(sql.raw(`SELECT * FROM audit_log WHERE tenant_id = '${tenantId}'`));
```

### When You Need Dynamic Table/Column Names

Use `sql.raw()` ONLY for trusted, hardcoded identifiers (never user input):

```typescript
// OK — hardcoded table name from code
const tableName = sql.raw(`audit_log_${partitionSuffix}`);

// NEVER — user-controlled value in sql.raw()
const tableName = sql.raw(userInput); // DANGER!
```

### Testing Parameterized SQL

When testing code that uses `sql` template literals, mock call args produce structured objects (not raw strings). Use `JSON.stringify()` to inspect:

```typescript
const sqlArg = JSON.stringify(mockExecute.mock.calls[0]);
expect(sqlArg).toContain('entity_type');
```

---

## 37. Token Refresh & API Client Pattern

### Deduplicated Token Refresh

`apiFetch` in `apps/web/src/lib/api-client.ts` handles expired JWTs automatically:

```typescript
// On 401 response (not on /auth/ routes):
// 1. Store a single refreshPromise (deduplicated across concurrent requests)
// 2. POST to /api/v1/auth/refresh with stored refresh token
// 3. On success: update tokens in localStorage, retry original request
// 4. On final 401: clear all tokens, throw ApiError (auth context handles redirect)
```

### Key Rules

- Refresh promise is deduplicated — multiple concurrent 401s share one refresh call
- Auth routes (`/auth/login`, `/auth/refresh`) are excluded from refresh logic to prevent loops
- `clearTokens()` on final failure — the `useAuthContext` effect detects missing token and redirects to `/login`
- 204 responses return `undefined` (not parsed as JSON)

---

## 38. Environment & Credential Hygiene

### dotenv Loading Order

For scripts that need `.env.local` credentials (migrations, DB tools), load `.env.local` first:

```typescript
import dotenv from 'dotenv';
dotenv.config({ path: '../../.env.local' }); // local overrides first
dotenv.config({ path: '../../.env' }); // fallback
```

The first `dotenv.config()` call wins for any duplicate keys. If you only use `dotenv.config()` (or `import 'dotenv/config'`), it reads `.env` only — your `.env.local` credentials won't be loaded.

### Files That Must Never Be Committed

```
.env.local                        # Contains DATABASE_URL, Supabase keys, secrets
.claude/settings.local.json       # May contain connection strings with passwords
```

Both are in `.gitignore`. Always verify with `git status` before committing.

---

## 39. Customers / Billing / AR Architecture

### Customer Identity

- **Two types**: `person` (first/last name) and `organization` (company name)
- **Display name**: computed by `computeDisplayName()` helper — person: "First Last", org: "Company Name"
- **Identifiers**: loyalty cards, barcodes, wristbands — polymorphic via `identifierType` field
- **Merge**: soft merge via `mergedIntoId`. Queries always filter `WHERE merged_into_id IS NULL`
- **Activity log**: CRM timeline of all interactions (orders, notes, membership changes)
- **Contacts**: multi-contact support (email, phone, address, social) with `isPrimary` and `isVerified` flags
- **Service flags**: VIP, Do Not Contact, special needs, etc. with severity levels (info, warning, critical)

### Membership System

- **Plans**: define privileges (jsonb), pricing, billing frequency, auto-renew behavior
- **Status lifecycle**: `pending → active → paused → canceled → expired`
- **Billing events**: track enrollment, renewal, cancellation, payment linked to membership
- **Privileges**: flat key-value grants (e.g., `discount_percentage: 10`, `free_range_balls: true`)

### Billing Accounts (Accounts Receivable)

- **AR transactions are append-only** — like inventory movements and GL entries
- **Transaction types**: `charge`, `payment`, `credit_memo`, `late_fee`, `writeoff`, `refund`
- **FIFO payment allocation**: payments allocated oldest-first via `ar_allocations` table
- **Aging buckets**: current / 30 / 60 / 90 / 120+ days past due
- **Credit limits**: checked via `checkCreditLimit(tx, accountId, amount)` inside transactions
- **Collection status lifecycle**: `current → past_due → collections → suspended → written_off`
- **Sub-accounts**: `billing_account_members` with per-member spending limits and authorization flags

### GL Integration for AR

```
AR charge:   debit Accounts Receivable (1200), credit Revenue (4000)
AR payment:  debit Cash/Card (1010/1020), credit Accounts Receivable (1200)
AR writeoff: debit Bad Debt Expense (6100), credit Accounts Receivable (1200)
AR late fee: debit Accounts Receivable (1200), credit Late Fee Revenue (4600)
```

### Universal Customer Profile (Session 16.5)

The profile system adds 21 sub-resource tables and a 360-degree view of each customer:

| Sub-Resource   | Table                                | Key Fields                                                          |
| -------------- | ------------------------------------ | ------------------------------------------------------------------- |
| Contacts       | `customer_contacts`                  | type (email/phone/address/social), isPrimary, isVerified            |
| Preferences    | `customer_preferences`               | category, key, value, source (manual/inferred/imported), confidence |
| Documents      | `customer_documents`                 | fileType, fileUrl, expiresAt                                        |
| Communications | `customer_communications`            | channel (email/sms/phone/push), direction, status                   |
| Service Flags  | `customer_service_flags`             | flagType, severity (info/warning/critical), isActive                |
| Consents       | `customer_consents`                  | consentType, status (granted/revoked), source                       |
| External IDs   | `customer_external_ids`              | provider, externalId                                                |
| Wallets        | `customer_wallet_accounts`           | accountType (credit/loyalty/gift_card), currency, balanceCents      |
| Alerts         | `customer_alerts`                    | alertType, severity, isDismissed                                    |
| Households     | `customer_households` + `_members`   | householdType, role (head/spouse/child/other), isPrimary            |
| Visits         | `customer_visits`                    | checkInAt, checkOutAt, checkInMethod, locationId                    |
| Incidents      | `customer_incidents`                 | incidentType, severity, resolution, compensationType                |
| Segments       | `customer_segments` + `_memberships` | segmentType (static/dynamic/smart/manual)                           |
| Scores         | `customer_scores`                    | scoreType (ltv/risk/churn/engagement), value, model                 |

**Profile360 query**: `/api/v1/customers/:id/profile` returns a `CustomerProfileOverview` aggregating: customer data, stats (visits, avg spend, LTV), active membership, contacts, service flags, alerts, household summary, recent activity, segments, and wallet balances.

**Profile Drawer**: 15 frontend components, portal-based slide-in panel (560px from right), 11 tabs (Overview, Identity, Activity, Financial, Membership, Preferences, Notes, Documents, Communications, Tags, Compliance). State managed via `ProfileDrawerContext` + `useProfileDrawer()` hook.

### Preference Categories

```
food_beverage, golf, retail, service, facility, general, dietary, communication, scheduling
```

Each preference has a `source` (manual / inferred / imported) and optional `confidence` percentage (0-100).

### Event Types (Session 16.5)

22 new event types emitted by profile commands:

```
customer.contact.added.v1, customer.preference.set.v1, customer.document.added.v1,
customer.communication.logged.v1, customer.service_flag.added/removed.v1,
customer.consent.recorded.v1, customer.external_id.added.v1,
customer.wallet.created/adjusted.v1, customer.alert.created/dismissed.v1,
customer.household.created.v1, customer.household.member.added/removed.v1,
customer.visit.recorded/checked_out.v1, customer.incident.created/updated.v1,
customer.segment.created.v1, customer.segment.member.added/removed.v1
```

---

## 40. Key Anti-Patterns to Avoid

1. **Never use `pg` driver** — always `postgres` (postgres.js)
2. **Never use `.rows`** on query results — use `Array.from(result as Iterable<T>)`
3. **Never use offset pagination** — always cursor-based
4. **Never import across module boundaries** — use events for cross-module communication (exception: internal read APIs)
5. **Never throw from audit logging** — always catch and log
6. **Never use `parse()` with Zod** — always `safeParse()` then throw `ValidationError`
7. **Never put audit logging inside the `publishWithOutbox` transaction** — call `auditLog(ctx, ...)` after the transaction succeeds, still within the command function
8. **Never access `process.env` at module level** in library code — use the lazy Proxy pattern (see db client)
9. **Never use `import()` type annotations in test mocks** — ESLint `consistent-type-imports` forbids them. Use `null as never` for mock typed parameters
10. **Never mix tax calculation modes on the same item+location** — V1 constraint enforced by `assignItemTaxGroups`
11. **Never create UI components without `'use client'`** — all interactive React components need the directive
12. **Never duplicate state that can be derived** — use `useMemo` to filter/transform data from hooks (e.g., departments derived from flat category list by filtering `parentId === null`)
13. **Never use `z.infer<>` for function inputs when schema has `.default()`** — use `z.input<>` instead (see §19)
14. **Never assume `export type { X }` creates a local binding** — it only re-exports; add a separate `import type` for local use (see §20)
15. **Never store money as floats** — use INTEGER cents in orders/payments, NUMERIC(12,2) dollars in catalog (see §21)
16. **Never UPDATE or DELETE from append-only tables** — `inventory_movements`, `audit_log`, `payment_journal_entries`, and `ar_transactions` are append-only; corrections are new rows
17. **Never regenerate a receipt from live data** — always use the frozen `receiptSnapshot` from the order (see §24)
18. **Never skip idempotency checks on POS-facing commands** — all write endpoints that POS calls must support `clientRequestId` (see §22)
19. **Never route item behavior by raw `item.type`** — always use `getItemTypeGroup()` from `@oppsera/shared` to get the canonical `typeGroup`, then switch on that (see §31)
20. **Never hard-code POS tile/tab sizes** — use the `size` prop (`normal`/`large`) so both shells can customize touch targets from one component
21. **Never replace catalog hierarchy with search-only** — the 4-layer Department → SubDepartment → Category → Items navigation is first-class UI; search/barcode are overlays on top, not replacements
22. **Never couple POS hooks to a storage backend** — V1 uses localStorage for config/shift/favorites; design the hook interface so swapping to a server API is a single internal change
23. **Never access array indexes without `!` assertion in strict TS** — `array[0].prop` fails strict null checks; use `array[0]!.prop` when the index is known-safe (tests, after length check)
24. **Never UPDATE financial fields on tenders** — amount, amountGiven, changeGiven, tipAmount, and status are immutable after INSERT. "Reversed" is derived from `tender_reversals` join.
25. **Never use optional `clientRequestId` on tenders** — unlike orders, tender schema mandates it (`z.string().min(1).max(128)`, not `.optional()`)
26. **Never compute GL without balancing check** — every journal entry must enforce `sum(debits) === sum(credits)` with rounding fixup on first revenue line if needed
27. **Never store on-hand as a mutable column** — inventory on-hand = SUM(quantity_delta) from `inventory_movements`. Always compute via `getOnHand()` helper.
28. **Never deduct package inventory from the package itself** — detect packages via `packageComponents?.length > 0` on order lines, then deduct from each component's inventory item
29. **Never allow negative stock at transfer source** — transfer always validates sourceOnHand >= quantity, regardless of `allowNegative` setting on the inventory item
30. **Never string-interpolate into SQL** — always use Drizzle `sql` template literals for parameterized queries. Never use `sql.raw()` with user-controlled values (see §36)
31. **Never check idempotency outside the transaction** — both `checkIdempotency()` and `saveIdempotencyKey()` must use the `tx` handle inside `publishWithOutbox` to prevent TOCTOU race conditions (see §22)
32. **Never use `import 'dotenv/config'` in scripts that need `.env.local`** — it only reads `.env`. Use explicit `dotenv.config({ path: '.env.local' })` first (see §38)
33. **Never UPDATE or DELETE from `ar_transactions`** — AR is append-only like inventory movements. Corrections use credit_memo or writeoff transaction types.
34. **Never query merged customers without filtering** — always exclude records where `displayName LIKE '[MERGED]%'` or `metadata->>'mergedInto' IS NOT NULL`
35. **Never skip credit limit check on AR charges** — always call `checkCreditLimit(tx, accountId, amount)` inside the transaction before inserting a charge
36. **Never render `Record<string, unknown>` values directly in React** — customer `metadata` fields are `unknown`; use `!!value` for conditionals and `String(value)` for value props to avoid strict TS errors
37. **Never use Radix/shadcn Dialog for profile drawer** — the CustomerProfileDrawer uses `createPortal` to `document.body` (same pattern as POS dialogs) with CSS transitions, not Radix Dialog
38. **Never fetch all profile data at once** — the profile drawer lazy-loads each tab's sub-resource via its own API endpoint; only the overview tab loads on open
39. **Never return raw Drizzle `numeric` values to frontend** — `numeric(p,s)` columns return strings (e.g., `"1.0000"`). Always convert with `Number()` in query mappings. String `"1.0000" !== 1` is `true`, causing display bugs like `(x1.0000)` in the cart.
40. **Never omit nullable columns from query mappings** — when a DB column exists but isn't included in the `getXxx()` query mapping, the field becomes `undefined` in the API response. `undefined !== null` (strict equality) is `true`, which can trigger rendering blocks that check `field !== null`. Always map nullable fields with `field ?? null`.
41. **Never use `bg-gray-900 text-white` in dark mode** — the app's dark mode inverts the gray scale (`gray-900` becomes near-white). Use `bg-indigo-600 text-white` for primary buttons and opacity-based colors (`border-red-500/40`, `hover:bg-red-500/10`) for destructive actions — these work in both light and dark mode.
42. **Never multiply percentage values by 100 before storing** — for both discounts and service charges, store the raw percentage (10 for 10%, not 1000 basis points). For fixed dollar amounts, store as cents. This keeps the convention consistent and avoids display conversion bugs.
43. **Never calculate service charges on raw subtotal** — service charges apply AFTER discounts. Use `(subtotal - discountTotal)` as the base for percentage service charges, not raw `subtotal`. Order of operations: discount → service charge → tax.
44. **Never cache inventory on-hand values** — on-hand = SUM(quantity_delta) from movements, always computed live. Caching introduces stale reads and double-deduction risks in concurrent POS environments.
45. **Never set postgres.js `max` > 3 on Vercel** — serverless = many concurrent instances, each with its own pool. Total connections = instances × max. Keep `max: 2` to stay within Supabase connection limits.
46. **Never use `prepare: true` with Supavisor** — Supabase's connection pooler in transaction mode breaks prepared statements (they're connection-scoped). Always set `prepare: false`.
47. **Never partition tables before 50M rows** — partitioning adds query complexity and migration overhead. Only partition when a single table exceeds 50M rows AND P95 index scans exceed 100ms. Use date-based monthly, not tenant-based.
48. **Never use session-mode pooling with RLS** — RLS relies on `SET LOCAL` (transaction-scoped). Session-mode poolers persist session state across transactions from different tenants, causing data leaks. Always use transaction-mode pooling.
49. **Never skip tenant fairness in job workers** — without `maxJobsPerTenantPerPoll` caps, a single noisy tenant can monopolize the job queue, starving all other tenants.
50. **Never adopt K8s before Docker Compose proves insufficient** — K8s adds massive operational overhead. Progress through: Vercel → VPS Docker Compose → Docker Swarm → K8s. Only K8s when >10 services, custom auto-scaling needed, and monthly spend >$2K.
51. **Never hard-delete vendors** — always use `deactivateVendor()` to set `isActive = false` (Rule VM-1). Vendors have FK references from receipts and item_vendors that would break on DELETE.
52. **Never skip name normalization on vendor create/update/reactivate** — always compute `nameNormalized = name.trim().toLowerCase()` and check UNIQUE constraint `(tenant_id, name_normalized)` against active vendors.
53. **Never allow multiple preferred vendors per item** — enforce single `isPreferred = true` per `inventoryItemId` inside the transaction. Clear all others before setting the new preferred.
54. **Never trust client-computed receipt values on post** — `postReceipt()` recomputes all line calculations (extendedCost, baseQty, shipping allocation, landedCost, landedUnitCost) from scratch before posting (Rule VM-5).
55. **Never update vendor costs outside the postReceipt transaction** — `updateVendorItemCostAfterReceipt()` must run inside the same `publishWithOutbox` transaction to maintain consistency between inventory movements and vendor pricing.
56. **Never create circular imports between schema files** — when schema A needs to reference schema B's table AND vice versa, use a plain text column in one direction and add the FK constraint via ALTER TABLE in the migration SQL only. Example: `receiving_receipts.purchase_order_id` is plain text in Drizzle, FK added in migration.
57. **Never load POS catalog with multiple API calls** — use the single-query `POST /api/v1/catalog/pos` endpoint that returns categories + items + modifiers + tax info in one round trip. Individual category/item APIs are for CRUD operations, not POS display.
58. **Never mix golf reporting with core reporting tables** — golf reporting lives in `packages/modules/golf-reporting/` with its own schema, consumers, and read models. Don't import golf-reporting from core reporting or vice versa.

---

## 41. Inventory Architecture

### Append-Only Movements Ledger

```
on-hand = SUM(quantity_delta) FROM inventory_movements WHERE inventory_item_id = ?
Never a mutable column. Never UPDATE or DELETE movements.
```

### Movement Types

```
receive        (+)  stock received from supplier/transfer
sale           (-)  POS/online sale (auto via order.placed event)
void_reversal  (+)  reversal of sale (auto via order.voided event)
adjustment     (±)  manual count correction
transfer_out   (-)  outgoing transfer to another location
transfer_in    (+)  incoming transfer from another location
shrink         (-)  loss/waste/theft/damage/expiry
waste          (-)  alias for shrink
return         (+)  customer return (V2)
initial        (+)  initial count (V2)
conversion     (±)  UOM conversion (V2)
```

### Idempotency Guard (Event Consumers)

```sql
UNIQUE INDEX uq_inventory_movements_idempotency
  ON (tenant_id, reference_type, reference_id, inventory_item_id, movement_type)
  WHERE reference_type IS NOT NULL
```

Insert uses `ON CONFLICT DO NOTHING` — duplicate event deliveries are silently skipped.

### Type-Aware Deduction (order.placed consumer)

```
Package item (packageComponents.length > 0):
  → Deduct from each component's inventory: componentQty × lineQty
  → NOT from the package item itself

Non-package item (food, beverage, retail, service):
  → Deduct lineQty from the item's inventory
  → Skip if no inventory_item found or trackInventory=false
```

### Transfer Pattern

```
1. Validate fromLocation ≠ toLocation
2. Find inventory_item at BOTH locations by catalogItemId
3. Always enforce sourceOnHand >= quantity (no exceptions)
4. Insert transfer_out at source (-qty) + transfer_in at dest (+qty)
5. Both movements share the same batchId for grouping
```

### Stock Alerts

```
inventory.negative.v1   → emitted when on-hand < 0
inventory.low_stock.v1  → emitted when 0 < on-hand ≤ reorderPoint
```

### Provisioned V2 Tables (8)

```
inventory_snapshots, inventory_counts, inventory_count_lines,
inventory_vendors, inventory_purchase_orders, inventory_po_lines,
inventory_recipes, inventory_recipe_components
```

Created as empty stubs with basic structure and RLS. Ready for V2 implementation.

### Frontend — Unified in Catalog

Stock data is displayed in the catalog item detail page (`/catalog/items/[id]`) via `StockSection`. No separate Stock Levels pages exist.

```
/catalog/items/[id]
  └── StockSection (location selector, stats, details, actions, movement history)
        ├── useInventoryForCatalogItem(catalogItemId, locationId)
        ├── useMovements(inventoryItemId)  // chained
        └── ReceiveDialog / AdjustDialog / ShrinkDialog (portal-based)
```

The Catalog Items list page (`/catalog`) enriches rows with On Hand + Reorder Point via a parallel inventory API call (not a DB JOIN — keeps modules independent).

---

## 42. Tenant Onboarding

### Business Types

4 types defined in `packages/shared/src/constants/business-types.ts`: restaurant, retail, golf, hybrid. Each has:

- `key`, `name`, `icon`, `description`
- `recommendedModules`: pre-selected modules for the type
- `starterHierarchy`: Department → SubDepartment → Category tree seeded on onboarding

### Onboarding API (POST /api/v1/onboard)

Uses `{ authenticated: true, requireTenant: false }` middleware. Atomic transaction creates:

1. Tenant (with unique slug)
2. Location
3. Membership
4. 6 system roles (Owner, Manager, Supervisor, Cashier, Server, Staff) with permissions
5. Role assignment (Owner → creating user)
6. Module entitlements (selected + platform_core)
7. 2 starter tax rates (Sales Tax 8%, No Tax 0%)
8. Default tax group
9. Full catalog hierarchy from business type config
10. Audit log entry

### Onboarding Wizard (5 steps)

Located at `apps/web/src/app/(auth)/onboard/page.tsx`:

1. Business Type selection
2. Company Name
3. Location Details (name, timezone, address)
4. Module Selection (pre-selected from business type)
5. Review & Launch

---

## 43. Current Project State

### Completed Milestones

**Milestones 0-2: Platform Core**

- Auth: Supabase JWT, authenticate/resolveTenant middleware
- RBAC: PermissionEngine, Redis cache, wildcard matching, location-scoped permissions
- Entitlements: EntitlementCheck engine, module registry, seat/location limits
- Events: InMemoryEventBus, transactional outbox, retry/dead-letter
- Audit: Partitioned audit_log, auditLog/auditLogSystem helpers, computeChanges
- withMiddleware: complete chain with all options
- Seed: "Sunset Golf & Grill" tenant, 2 locations, admin user, 6 roles, 7 entitlements

**Milestone 3: Catalog Module**

- Session 8: 7 Drizzle tables, 9 commands, Zod schemas, event contracts, internal read API
- Session 9: 5 queries, 14 API routes, seed data (20 items, 4 modifier groups)
- Session 9.5: Tax system (5 tables, 7 commands, 3 queries, 10 routes, tax calc engine)
- Session 10: Frontend (6 pages, 10 UI components, data hooks, sidebar)

**Milestone 4: Tenant Onboarding**

- Session 11: Business types, slug generation, onboarding API + wizard, auth flow guards

**Milestone 5: Orders Module (Backend)**

- Session 12: 6 tables (orders, order_lines, order_charges, order_discounts, order_counters, idempotency_keys) + existing order_line_taxes
- 8 commands: openOrder, addLineItem, removeLineItem, addServiceCharge, removeServiceCharge, applyDiscount, placeOrder, voidOrder
- 3 queries: listOrders, getOrder, getOrderByNumber
- 10 API routes, 9 event types, 8 Zod validation schemas
- Enterprise patterns: idempotency keys, optimistic locking (version), receipt snapshots
- Cross-module integration: catalog internal API (`getItemForPOS`) for price/tax lookup
- F&B: fractional qty, modifier support; Retail: qty=1; Service: qty=1; Package: component snapshot
- Service charges (auto-gratuity, venue/booking fees), discounts, price overrides with audit trail

**Post-Session 12: Cross-Session Consistency Fixes**

- C2: Added `barcode` column + unique index to `catalog_items`, updated `getItemForPOS` return type
- C3+m2: Updated Manager/Supervisor/Cashier permissions with POS ops, added Server role (now 6 roles)
- C4: Added 3-level nesting depth validation to `createCategory`
- C5: Added `isDefault` flag to `catalogItemModifierGroups` junction table (canonical source of truth)
- C7: Moved metadata types (`FnbMetadata`, `RetailMetadata`, etc.) to `@oppsera/shared`
- M1: Deprecated `tax_categories` table
- M2: Removed deprecated `getTaxRate` from `CatalogReadApi`
- Added `metadata` JSONB column to `catalog_items`

**Milestone 6: POS Frontend**

- Session 13: Dual-mode POS (Retail + F&B shells), 17 POS components, 6 catalog-nav components
- 6 hooks: usePOSConfig, usePOS, useCatalogForPOS, useShift, useOrders, useOrder
- Fullscreen POS layout with barcode scanner keyboard wedge listener
- Retail shell: 60/40 split, search, 4-layer hierarchy, barcode scan, hold/recall, all dialogs
- F&B shell: large touch targets, "Ticket" label, "Send & Pay", repeat last item
- Order history: list (filters, cursor pagination) + detail (line items, charges, receipt viewer)
- Navigation sidebar updated with POS section (Retail POS, F&B POS)
- Shared item-types updated: `green_fee`/`rental` → retail group

**Milestone 7: Payments / Tenders Module**

- Session 14: 3 tables (tenders, tender_reversals, payment_journal_entries) + migration + RLS
- 2 commands: recordTender (full cash V1), reverseTender (V2 stub)
- 3 queries: getTendersByOrder (with summary), listTenders (paginated), getPaymentJournalEntries
- 5 API routes: POST/GET orders/:id/tenders, GET tenders, POST tenders/:id/reverse, GET tenders/journal
- GL journal generation: proportional allocation (partial), remainder method (final), always balanced
- Event types: tender.recorded.v1, tender.reversed.v1; consumes order.voided.v1
- Order void consumer: auto-creates reversals for all active tenders, reverses GL entries
- Frontend: TenderDialog (shared, z-[60]), Order Detail tenders section, usePOS.recordTender
- V1 scope: cash only; V2 roadmap: card, gift card, store credit, house account

**Milestone 8: Inventory Module**

- Session 15: 2 core tables (inventory_items, inventory_movements) + 8 provisioned V2 tables + migration + RLS
- 4 commands: receiveInventory, adjustInventory, transferInventory, recordShrink
- 3 queries: listInventoryItems (with computed on-hand via SUM), getInventoryItem, getMovements
- 7 API routes under /api/v1/inventory
- 3 event consumers: handleOrderPlaced (type-aware deduction, package component support), handleOrderVoided (void_reversal), handleCatalogItemCreated (auto-create at all locations)
- 4 emitted events: inventory.received.v1, inventory.adjusted.v1, inventory.low_stock.v1, inventory.negative.v1
- 3 helpers: getOnHand (SUM query), checkStockAlerts (threshold events), findByCatalogItemId (cross-location lookup)
- Idempotency via UNIQUE index + ON CONFLICT DO NOTHING for event consumer movements
- Frontend: inventory list (search, filters, color-coded on-hand), item detail with movement history, receive/adjust/shrink dialogs
- Transfer: paired movements with shared batchId, always non-negative at source
- V2 provisioned: snapshots, counts, count_lines, vendors, purchase_orders, po_lines, recipes, recipe_components

**Milestone 9: Customer Management Module**

- Session 16: 15 tables (customers, identifiers, activity_log, membership_plans, memberships, billing_accounts, billing_account_members, ar_transactions, ar_allocations, statements, late_fee_policies, customer_privileges, pricing_tiers, customer_relationships, membership_billing_events)
- 16 commands: createCustomer, updateCustomer, addCustomerIdentifier, addCustomerNote, mergeCustomers, createMembershipPlan, updateMembershipPlan, enrollMember, updateMembershipStatus, assignCustomerPrivilege, createBillingAccount, updateBillingAccount, addBillingAccountMember, recordArTransaction, recordArPayment, generateStatement
- 12 queries: listCustomers, getCustomer, searchCustomers, listMembershipPlans, getMembershipPlan, listMemberships, listBillingAccounts, getBillingAccount, getArLedger, getAgingReport, getStatement, getCustomerPrivileges
- ~16 API routes for customers, memberships, billing/AR
- 3 event consumers: order.placed (AR charge + visit/spend stats), order.voided (AR reversal), tender.recorded (AR payment + FIFO allocation)
- GL integration: AR charge/payment/writeoff/late_fee journal entries
- Frontend: customer list, detail, billing list, billing detail, memberships pages
- 8 hooks: useCustomers, useCustomer, useMembershipPlans, useMembershipPlan, useBillingAccounts, useBillingAccount, useArLedger, useAgingReport
- Sidebar navigation: Customers section with All Customers, Memberships, Billing sub-items

**Milestone 9.5: Universal Customer Profile**

- Session 16.5: 21 new tables (contacts, preferences, documents, communications, service_flags, consents, external_ids, auth_accounts, wallet_accounts, alerts, scores, metrics_daily, metrics_lifetime, merge_history, households, household_members, visits, incidents, segments, segment_memberships, payment_methods) + 29 new columns on customers table
- 22 commands: addCustomerContact, updateCustomerContact, setCustomerPreference, deleteCustomerPreference, addCustomerDocument, logCustomerCommunication, addServiceFlag, removeServiceFlag, recordConsent, addExternalId, createWalletAccount, adjustWalletBalance, createAlert, dismissAlert, createHousehold, addHouseholdMember, removeHouseholdMember, recordVisit, checkOutVisit, createIncident, updateIncident, manageSegments (create/add/remove)
- 11 queries: getCustomerProfile (360-degree overview), getCustomerFinancial, getCustomerPreferences, getCustomerActivity, getCustomerNotes, getCustomerDocuments, getCustomerCommunications, getCustomerCompliance, getCustomerSegments, getCustomerIntegrations, getCustomerAnalytics, listHouseholds
- ~22 API routes under /api/v1/customers/[id]/profile/\* and sub-resources
- 22 event types emitted (customer.contact.added.v1, customer.wallet.adjusted.v1, etc.)
- 11 hooks: useCustomerProfile, useCustomerFinancial, useCustomerPreferences, useCustomerActivityTab, useCustomerNotes, useCustomerDocuments, useCustomerCommunications, useCustomerCompliance, useCustomerSegments, useCustomerIntegrations, useCustomerAnalytics
- Customer Profile Drawer: 15 components, portal-based 560px slide-in panel, 11 tabs (Overview, Identity, Activity, Financial, Membership, Preferences, Notes, Documents, Communications, Tags, Compliance)
- ProfileDrawerContext: React Context provider with `useProfileDrawer()` hook (`open(customerId, { tab, source })`, `close()`)
- HouseholdTreeView: hierarchical display with Unicode branch chars, primary member crown icon, clickable member navigation

**Milestone 10: Reporting Module (Schema + Consumers + Queries + Routes + Frontend)**

- Session 17: 4 read model tables (`rm_daily_sales`, `rm_item_sales`, `rm_inventory_on_hand`, `rm_customer_activity`) + migration + RLS
- Session 18: 4 event consumers (`handleOrderPlaced`, `handleOrderVoided`, `handleTenderRecorded`, `handleInventoryMovement`) + business date utility
- Session 19: 4 query services (`getDailySales`, `getItemSales`, `getInventorySummary`, `getDashboardMetrics`) + CSV export (`toCsv`) + 6 API routes
- Session 20: Reports frontend — `/reports` page with 3 tabs (Sales, Items, Inventory), 4 KPI metric cards (60s auto-refresh), Recharts charts, CSV export, DateRangePicker, location selector
- Session 21: Custom Report Builder Backend (Semantic Layer) — `reporting_field_catalog` (31 fields, 4 datasets), `report_definitions`, `dashboard_definitions`, query compiler (`compileReport` with guardrails), CRUD commands + run/export queries, 13 API routes
- Session 22: Custom Builder Frontend + Performance — Report builder UI (field picker, filter builder, chart preview, validation), saved reports list, dashboard builder (@dnd-kit drag-and-drop, 12-col grid, tile presets), dashboard viewer, saved dashboards list, tile cache (in-memory TTL Map), `report_snapshots` table (V2-ready), sidebar sub-nav for Reports
- CQRS pattern: read models are pre-aggregated projections, never written to by user commands
- Atomic idempotency: INSERT processed_events + upsert read model in same transaction
- Business date: `computeBusinessDate(occurredAt, timezone, dayCloseTime?)` with IANA timezone + day-close-time offset
- Query services support single-location (direct select) and multi-location (GROUP BY + recomputed avgOrderValue) modes
- CSV export: RFC 4180 escaping + UTF-8 BOM for Excel compatibility
- API routes: `reports.view` permission for data queries, `reports.export` for CSV downloads, `reports.custom.view` / `reports.custom.manage` for custom report builder
- Schema: `packages/db/src/schema/reporting.ts`, Migrations: `0049_reporting_read_models.sql`, `0050_custom_report_builder.sql`
- Consumers: `packages/modules/reporting/src/consumers/`
- Compiler: `packages/modules/reporting/src/compiler/report-compiler.ts` — validates fields against catalog, builds parameterized SQL
- Commands: `packages/modules/reporting/src/commands/` (saveReport, deleteReport, saveDashboard, deleteDashboard)
- Queries: `packages/modules/reporting/src/queries/`
- Routes: `apps/web/src/app/api/v1/reports/`, `apps/web/src/app/api/v1/dashboards/`
- Frontend page: `apps/web/src/app/(dashboard)/reports/page.tsx`
- Frontend components: `apps/web/src/components/reports/` (DateRangePicker, MetricCards, SalesTab, ItemsTab, InventoryTab)
- Frontend components (custom): `apps/web/src/components/reports/custom/` (ReportBuilder, FieldPicker, FilterBuilder, ReportPreview, SavedReportsList)
- Frontend components (dashboards): `apps/web/src/components/dashboards/` (DashboardBuilder, DashboardTile, AddTileModal, DashboardViewer, SavedDashboardsList)
- Frontend hooks: `apps/web/src/hooks/use-reports.ts`, `use-custom-reports.ts`, `use-field-catalog.ts`, `use-dashboards.ts`
- Frontend types: `apps/web/src/types/reports.ts`, `apps/web/src/types/custom-reports.ts`
- Frontend pages: `/reports/custom`, `/reports/custom/new`, `/reports/custom/[reportId]`, `/dashboards`, `/dashboards/new`, `/dashboards/[dashboardId]`, `/dashboards/[dashboardId]/edit`
- Tile cache: `packages/modules/reporting/src/cache.ts` (TileCache, buildTileCacheKey, getTileCache)
- Migration: `0051_report_snapshots.sql` (V2-ready snapshot table)
- Reporting values are in cents (consumers insert order event amounts directly) — format with `value / 100`

**Milestone 11: Receiving Module + Vendor Management + Purchase Orders Schema**

- Sessions 23-24: Full Receiving Workflow with multi-line receipts, vendor tracking, UOM conversions, shipping cost allocation, weighted average costing
- **7 new tables**: `vendors`, `uoms`, `itemUomConversions`, `itemVendors`, `itemIdentifiers`, `receivingReceipts`, `receivingReceiptLines`
- Added `currentCost` NUMERIC(12,4) column to `inventoryItems`
- 4 pure services: shipping allocation (by_cost/by_qty/by_weight/none), UOM conversion, costing (weighted avg + last cost), receipt calculator
- 8 receiving commands: createDraftReceipt, updateDraftReceipt, addReceiptLine, updateReceiptLine, removeReceiptLine, postReceipt (critical transaction), voidReceipt, createVendor, updateVendor
- 4 receiving queries: getReceipt (with cost preview), listReceipts, searchItemsForReceiving, getReorderSuggestions
- 11 API routes under `/api/v1/inventory/receiving/` + `/api/v1/inventory/vendors/`
- 9 validation schemas in `validation/receiving.ts` + `validation/vendor-management.ts`
- Receipt lifecycle: DRAFT → POSTED → VOIDED (status-based, no hard deletes)
- postReceipt: single transaction (recompute + inventory movements + cost updates + vendor cost upsert + event)
- Shipping allocation: precise remainder distribution ensures exact sum
- 49 tests (15 shipping-allocation + 10 costing + 5 uom-conversion + 10 receiving-ui + 9 vendor-management)
- **Vendor Management**: additive migration 0058, name normalization (`LOWER(TRIM(name))`) with UNIQUE constraint, 5 vendor management commands (deactivate/reactivate vendor, add/update/deactivate catalog items), 3 queries (getVendor with stats, enhanced listVendors, getVendorCatalog + getItemVendors), integration hooks (getVendorItemDefaults, updateVendorItemCostAfterReceipt), preferred vendor enforcement (single preferred per item)
- **Purchase Orders Schema** (Phase 1 only): 3 tables in `purchasing.ts` (purchaseOrders, purchaseOrderLines, purchaseOrderRevisions), migration 0057, optimistic locking, revision snapshots, added purchaseOrderId FK to receivingReceipts
- Schema: `packages/db/src/schema/receiving.ts` (receiving/vendor tables), `packages/db/src/schema/purchasing.ts` (PO tables)
- Migrations: `0056_receiving.sql`, `0057_purchase_orders.sql`, `0058_vendor_management.sql`
- Services: `packages/modules/inventory/src/services/` (6 files)
- Commands: `packages/modules/inventory/src/commands/receiving/` + `commands/vendor-management/`
- Queries: `packages/modules/inventory/src/queries/` (7 new files)
- Routes: `apps/web/src/app/api/v1/inventory/receiving/` + `vendors/`

**Milestone 12: Golf Reporting Module + Speed Improvements**

- Session 24: Full Golf Reporting module — separate from core reporting
- **New module**: `packages/modules/golf-reporting/` with own schema, consumers, queries, KPIs, seeds
- **Schema**: `packages/db/src/schema/golf-reporting.ts` (323 lines) — golf-specific read model + lifecycle tables
- **Migrations**: `0052_golf_reporting_read_models.sql`, `0053_golf_lifecycle_tables.sql`, `0054_golf_field_catalog.sql`
- **11 event consumers**: tee-time lifecycle (created/modified/canceled/checked-in/completed), channel daily aggregation, folio events (charge/payment), pace tracking
- **5 query services**: golf dashboard metrics, revenue analytics, utilization rates, daypart analysis, customer golf analytics
- **3 KPI modules**: channel performance, pace of play, tee-sheet utilization
- **Seeds**: default golf dashboards for common reporting views
- **Frontend**: 5 golf report components, 3 hooks (`useGolfReports`, `useReportFilters`, `useNavigationGuard`), types (`golf-reports.ts`)
- **API routes**: full golf reports suite under `/api/v1/reports/golf/`
- **4 test files** covering consumers and query services
- **Speed Improvements**:
  - POS catalog optimization: new `getCatalogForPOS` single-query loader (`POST /api/v1/catalog/pos`) — replaces multiple API calls
  - POS hooks refactored: `useCatalogForPOS` (+170 lines), `useRegisterTabs` (+191 lines) rewritten for performance
  - Customer search indexes: migration `0055_customer_search_indexes.sql`
  - Customer search query optimization, order fetch optimization
  - Middleware performance tweaks in `withMiddleware`
  - Dashboard layout slimmed (-32 lines), settings page simplified (-80 lines)

**Milestone 13: Catalog Refactor + Receiving Frontend + Item Change Log**

- Session 25: Archive semantics, receiving frontend, item change log
- **Catalog archive refactor**: `archivedAt`/`archivedBy`/`archivedReason` replace `isActive` boolean. Migrations 0060 (add columns) + 0061 (drop `is_active`). Commands: `archiveItem`, `unarchiveItem` (replaced `deactivateItem`). All queries filter `archivedAt IS NULL` for active items.
- **Items page enhancements**: Renamed header "Inventory Items". Added On Hand, Reorder Point, Status columns. Action menu: View/Edit, View History, Stock History, Deactivate/Reactivate.
- **Item Change Log**: Append-only `catalog_item_change_logs` table (migration 0063). Service: `computeItemDiff()` + `logItemChange()`. Hooked into create/update/archive/unarchive commands. Query: `getItemChangeLog` with cursor pagination, filters, user name + lookup resolution. API: `GET /api/v1/catalog/items/[id]/change-log`. Frontend: `ItemChangeLogModal` (portal-based, collapsible entries).
- **Receiving frontend**: Receipt list page, receipt detail/edit page, editable grid, receipt totals bar, item search input. Components: `ReceivingGrid`, `EditableCell`, `ReceiptHeader`, `ReceiptTotalsBar`. Hook: `use-receiving-editor`. Pure calc library: `receiving-calc.ts`.
- **Freight modes**: ALLOCATE vs EXPENSE shipping handling (migration 0064). ALLOCATE distributes shipping into landed cost; EXPENSE books as separate GL expense.
- **Search optimization**: Trigram GIN indexes on catalog items, identifiers, and vendors (migration 0062).
- **RLS fix**: Migration 0059 corrects role restriction on RLS policies.
- **Supabase local dev**: `supabase/` directory with `config.toml` for local Postgres v17 + pooler.
- **Context7 MCP integration**: `.claude/rules/context7.md` — mandatory doc lookup for Next.js 15, React 19, Drizzle, Tailwind v4, and other fast-changing libraries.
- New files: `archive-item.ts`, `unarchive-item.ts`, `item-change-log.ts` (service), `get-item-change-log.ts` (query), `ItemChangeLogModal.tsx`, `use-item-change-log.ts`, `editable-cell.tsx`, `receipt-header.tsx`, `receiving-grid.tsx`, `use-receiving-editor.ts`, `receiving-calc.ts`

**Milestone 14: Unified Stock UI + POS Catalog Freshness**

- Session 26: Stock Levels → Catalog merge, POS inactive items fix
- **Stock Levels deleted**: `/inventory` (list) and `/inventory/[id]` (detail) pages removed. All stock UI moved into catalog item detail page via `StockSection` component.
- **New components**: `StockSection` (location selector, stats cards, stock details, action buttons, movement history), extracted `ReceiveDialog`, `AdjustDialog`, `ShrinkDialog` as reusable portal-based components.
- **New backend**: `getInventoryItemByCatalogItem` query (resolves catalogItemId + locationId → inventory data). API: `GET /api/v1/inventory/by-catalog-item`.
- **New hook**: `useInventoryForCatalogItem(catalogItemId, locationId?)` — returns inventory item or null.
- **Catalog item detail enhanced**: Renders `StockSection` below existing content. Removed simple "Track Inventory: Yes/No" card.
- **Sidebar updated**: Removed "Stock Levels" link from Inventory section. Receiving routes untouched.
- **Dashboard links updated**: Low Stock links now navigate to `/catalog` instead of deleted `/inventory`.
- **POS catalog freshness**: `useCatalogForPOS` now auto-refreshes every 5 minutes via `setInterval`. Exposed `refresh()` method for on-demand use.
- **POS item-not-found handling**: `usePOS` now accepts `{ onItemNotFound }` callback. On 404 from `addItem`, calls the callback. POS pages wire it to `catalog.refresh()` to purge stale archived items from the grid.
- New files: `stock-section.tsx`, `receive-dialog.tsx`, `adjust-dialog.tsx`, `shrink-dialog.tsx`, `use-inventory-for-catalog-item.ts`, `get-inventory-item-by-catalog.ts`, `by-catalog-item/route.ts`

**Milestone 15: Frontend Performance Pass**

- Session 27: Code-split all pages, POS instant switching, dashboard optimization, covering indexes
- **Code-split all heavy pages**: 16 pages split with `next/dynamic` + `ssr: false`. Thin `page.tsx` wrappers, heavy logic in `*-content.tsx`. Custom loading skeletons per page + reusable `PageSkeleton` component. Route transitions now commit instantly with skeleton UI.
- **POS dual-mount instant switching**: `pos/layout.tsx` mounts both Retail and F&B POS content simultaneously via `next/dynamic` and toggles with CSS (`invisible pointer-events-none`). Eliminates 300-500ms Next.js route transition. Pages (`retail/page.tsx`, `fnb/page.tsx`) return `null` — exist only as route targets. `isActive` prop gates barcode listener and triggers portal dialog cleanup via `useEffect`.
- **Combined catalog+inventory API**: `listItems` accepts `includeInventory` flag — batch-fetches inventory data (on-hand, reorder point) in same transaction. Eliminates separate `/api/v1/inventory` call on catalog list page.
- **Category fetch deduplication**: module-level `_catCache` in `use-catalog.ts` with in-flight promise dedup + 30s TTL — 3 concurrent category API calls share 1 request.
- **Covering indexes**: migration `0065_list_page_indexes.sql` — `idx_tenders_tenant_status_order` for order list tender aggregation; `idx_inventory_movements_onhand` with `INCLUDE (quantity_delta)` for index-only on-hand SUM scans.
- **Dashboard stale-while-revalidate**: uses `/api/v1/reports/dashboard` (pre-aggregated CQRS read models) for KPIs instead of fetching 100 raw orders. SessionStorage cache with business-date invalidation. Cached data renders instantly, background refresh keeps it fresh. Data fetched reduced: orders `limit=100` → `limit=5`, inventory `limit=50` → `limit=5`.
- **Sidebar z-index architecture**: desktop sidebar `relative z-40` stays above POS overlay backdrops (z-30); main content `relative z-0` creates stacking context isolation so POS fixed/absolute overlays stay scoped and never paint above the sidebar.
- **Portal dialog cleanup on POS switch**: `useEffect` in each POS content component closes all portaled dialog states when `isActive` becomes false, preventing leaked dialogs across POS modes.
- New files: `page-skeleton.tsx`, `dashboard/loading.tsx`, `catalog/loading.tsx`, `orders/loading.tsx`, `settings/loading.tsx`, `catalog-content.tsx`, `orders-content.tsx`, `settings-content.tsx`, `item-detail-content.tsx`, `item-edit-content.tsx`, `customer-detail-content.tsx`, `billing-detail-content.tsx`, `order-detail-content.tsx`, `taxes-content.tsx`, `memberships-content.tsx`, `vendors-content.tsx`, `vendor-detail-content.tsx`, `reports-content.tsx`, `golf-reports-content.tsx`, `receipt-detail-content.tsx`, `0065_list_page_indexes.sql`

**Milestone 16: Semantic Layer (AI Insights) + Admin App**

- Sessions 0–10: Full AI Insights module — registry, compiler, LLM pipeline, lenses, cache, observability, evaluation
- **Semantic Module** (`packages/modules/semantic/`): 8 sub-path exports (registry, compiler, llm, lenses, cache, observability, evaluation, setup)
- **Schema**: `semantic.ts` (6 tables: metrics, dimensions, metric-dimensions, table-sources, lenses) + `evaluation.ts` (4 tables: eval-sessions, eval-turns, eval-examples, eval-quality-daily) + `platform.ts` (platform-admins). Migrations 0070–0073
- **Registry**: In-memory SWR cache. 8 core metrics + 8 golf metrics, 6 core dimensions + 6 golf dimensions, 60+ relations, 4 system lenses, 8 golf examples. `syncRegistryToDb()` + CLI `semantic:sync`
- **Query Compiler**: `compilePlan()` — registry validation → parameterized SQL with GROUP BY, WHERE, ORDER BY, LIMIT. Guardrails: 10K rows, 365d range, 20 cols, 15 filters, tenant isolation
- **LLM Pipeline**: `runPipeline()` — intent resolution (Claude Haiku) → compilation → SQL execution → narrative generation. Query cache (5min LRU, 200 entries). Clarification short-circuit. Best-effort eval capture
- **Evaluation Layer**: Quality scoring (40% admin + 30% user + 30% heuristics). Capture service (fire-and-forget). User feedback (1-5 stars + tags + text). Admin review (verdict + corrected plan). Example promotion for few-shot learning. Quality daily aggregation
- **Custom Lenses**: CRUD commands with slug validation. Partial unique indexes (system vs tenant). System + custom can share slug (custom takes priority)
- **Cache Layer**: LRU query cache (200 entries, 5min TTL, djb2 key hash). Per-tenant rate limiter (30 req/min sliding window). Admin invalidation API
- **Observability**: In-memory per-tenant + global metrics (p50/p95 latency, cache hit rate, token usage, error rate)
- **Chat UI**: 3 pages (`/insights`, `/insights/history`, `/insights/lenses`). `useSemanticChat` hook (multi-turn, 10-message context). `ChatMessageBubble` (markdown + table + debug panel). `FeedbackWidget` (thumbs + stars + tags). Sidebar "AI Insights" with Sparkles icon
- **API Routes**: 10 endpoints under `/api/v1/semantic/` — `/ask`, `/query`, `/metrics`, `/dimensions`, `/lenses`, `/lenses/[slug]`, `/eval/feed`, `/eval/turns/[id]/feedback`, `/admin/invalidate`, `/admin/metrics`
- **Admin App** (`apps/admin/`): Separate Next.js app on port 3001. JWT auth with bcrypt + `platformAdmins` table. 3 roles: viewer/admin/super_admin. 5 pages: eval feed, turn detail, quality dashboard, golden examples, patterns. 12 API routes. `withAdminAuth(handler, minRole)` middleware
- **Entitlement**: `semantic` module added to core entitlements registry. `tools/scripts/add-semantic-entitlement.ts` for existing tenants
- **Utility script**: `scripts/switch-env.sh` (toggle local/remote Supabase)
- New files: ~120 files across packages/modules/semantic/, apps/admin/, apps/web/src/app/(dashboard)/insights/, apps/web/src/app/api/v1/semantic/, apps/web/src/components/semantic/, apps/web/src/components/insights/

### Test Coverage

1304 tests: 134 core + 68 catalog + 52 orders + 37 shared (22 original + 15 package-allocation) + 100 customers + 424 web (80 POS + 66 tenders + 42 inventory + 15 reports + 19 reports-ui + 15 custom-reports-ui + 9 dashboards-ui + 178 semantic-routes) + 27 db + 99 reporting (27 consumers + 16 queries + 12 export + 20 compiler + 12 custom-reports + 12 cache) + 49 inventory-receiving (15 shipping-allocation + 10 costing + 5 uom-conversion + 10 receiving-ui + 9 vendor-management) + 269 semantic (62 golf-registry + 25 registry + 35 lenses + 22 pipeline + 23 eval-capture + 9 eval-feedback + 6 eval-queries + 52 compiler + 35 cache + 14 observability) + 45 admin (28 auth + 17 eval-api)

**Milestone 16: Room Layout Builder**

- Sessions 1-14 (room-builder branch): Full drag-and-drop floor plan editor with Konva.js
- See §65 for complete architecture docs

**Milestone 17: Accounting Core + GL + AP + AR (Sessions 28-34)**

- Session 28: GL core schema (9 tables), posting engine, validation, helpers, errors (migration 0071)
- Session 29: GL mappings (4 tables), bank registry, GL reports (trial balance, detail, summary), reconciliation framework, 22 API routes (migration 0072)
- Session 30: AP schema (5 tables + vendor extensions), bill lifecycle (create/post/void), payment terms (migration 0074)
- Session 31: AP payments (create/post/void), vendor credits (negative bills), AP reports (aging, vendor ledger, cash requirements, 1099, asset purchases), landed cost allocations, 12 API routes
- Session 32: POS posting adapter (`handleTenderForAccounting`), legacy bridge adapter, AccountingPostingApi wiring, tenant COA bootstrap, close period workflow (migration 0075)
- Session 33: AR schema (4 tables), invoice/receipt lifecycle, AR-GL reconciliation, bridge adapter (migration 0076)
- Session 34: Financial statements (P&L, balance sheet, sales tax, cash flow, period comparison, health summary), retained earnings, statement layouts (migration 0077)
- Session 36: GL Mapping Frontend — enriched sub-department query (joins catalog hierarchy + GL accounts), flexible 2/3-level hierarchy support, coverage API with totals, items drill-down, flat/grouped rendering modes, AccountPicker type filtering
- Architecture: See CONVENTIONS.md §66-70 for full details
- Total: ~26 tables, ~41 commands, ~39 queries, ~75 API routes, ~197 tests

### Test Coverage

1403 tests: 134 core + 68 catalog + 52 orders + 22 shared + 100 customers + 246 web (80 POS + 66 tenders + 42 inventory + 15 reports + 19 reports-ui + 15 custom-reports-ui + 9 dashboards-ui) + 27 db + 99 reporting + 49 inventory-receiving + 199 room-layouts + 202 business-logic + ~205 accounting/AP/AR

### What's Next

- Accounting frontend (COA management, journal browser, mapping UI, report viewers, statement viewers)
- AP frontend (bill entry, payment batch, aging dashboard, vendor ledger)
- AR frontend (invoice entry, receipt entry, aging dashboard, customer ledger)
- Vendor Management remaining API routes (search, deactivate/reactivate, catalog CRUD endpoints)
- Purchase Orders Phases 2-6 (commands, queries, API routes, frontend)
- Receiving frontend polish (barcode scan on receipt lines, cost preview panel, void receipt UI)
- Settings → Dashboard tab (widget toggles, notes editor)
- Run migrations 0060-0065, 0070-0073 on dev DB
- Run `pnpm --filter @oppsera/module-semantic semantic:sync` after migrations 0070-0073
- For existing tenants: run `tools/scripts/add-semantic-entitlement.ts`
- ~~Package "Price as sum of components"~~ ✓ DONE (Session 27)
- Run migrations 0066-0077 on dev DB

---

## 44. Customer Profile Drawer Architecture

### Component Structure

```
apps/web/src/components/customer-profile-drawer/
├── CustomerProfileDrawer.tsx      # Main drawer (createPortal, 560px, z-50, ESC close, body scroll lock)
├── ProfileDrawerContext.tsx        # Provider + useProfileDrawer() hook
├── HouseholdTreeView.tsx           # Tree with Unicode branches, crown icon for primary
├── ProfileOverviewTab.tsx          # Stats grid, service flags, alerts, quick actions, household, recent activity
├── ProfileIdentityTab.tsx          # Contacts, identifiers, metadata details (coerced with String())
├── ProfileActivityTab.tsx          # Visits + Timeline toggle, paginated
├── ProfileFinancialTab.tsx         # AR aging, billing accounts, invoices, payments, wallets, loyalty
├── ProfileMembershipTab.tsx        # Active membership, benefits, history
├── ProfilePreferencesTab.tsx       # Preferences grouped by category with source/confidence
├── ProfileNotesTab.tsx             # Notes + Incidents toggle, inline add-note form
├── ProfileDocumentsTab.tsx         # File list with type icons, expiration detection
├── ProfileCommunicationsTab.tsx    # Channel filter pills, direction arrows, paginated
├── ProfileTagsTab.tsx              # Tag management (add/remove), segment list
├── ProfileComplianceTab.tsx        # Consent records with grant/revoke toggle
└── index.ts                        # Barrel exports
```

### Context Pattern

```typescript
// Wrap dashboard layout with provider
<ProfileDrawerProvider>
  <CustomerProfileDrawer />
  {children}
</ProfileDrawerProvider>

// Open from anywhere in the dashboard
const { open } = useProfileDrawer();
open(customerId);                          // default tab
open(customerId, { tab: 'financial' });    // specific tab
open(customerId, { source: 'pos' });       // track where it was opened from
```

### Key Patterns

- **Portal-based**: `createPortal` to `document.body` (consistent with POS dialogs)
- **CSS transitions**: 300ms slide-in from right, semi-transparent backdrop (`bg-black/30`)
- **Lazy tab loading**: each tab fetches its own sub-resource API endpoint on mount
- **Body scroll lock**: prevents background scrolling when drawer is open
- **Escape key close**: `keydown` listener on `useEffect`
- **Tab bar**: horizontal scrollable with 11 tabs
- **Quick actions**: Overview tab has Add Note, Record Payment, Check In, Log Incident buttons (POST via `apiFetch`)

### Profile API Endpoints

All under `/api/v1/customers/[id]/`:

| Endpoint                 | Tab               | Method |
| ------------------------ | ----------------- | ------ |
| `profile`                | Overview          | GET    |
| `profile/financial`      | Financial         | GET    |
| `profile/activity`       | Activity          | GET    |
| `profile/notes`          | Notes             | GET    |
| `profile/documents`      | Documents         | GET    |
| `profile/preferences`    | Preferences       | GET    |
| `profile/communications` | Communications    | GET    |
| `profile/compliance`     | Compliance        | GET    |
| `profile/segments`       | Tags              | GET    |
| `profile/integrations`   | Identity          | GET    |
| `profile/analytics`      | Overview (scores) | GET    |

### Customer Frontend Types

Types live in `apps/web/src/types/customers.ts`. Key Session 16.5 types:

```typescript
(CustomerContact,
  CustomerPreference,
  CustomerDocument,
  CustomerCommunication,
  CustomerServiceFlag,
  CustomerConsent,
  CustomerExternalId,
  CustomerWalletAccount,
  CustomerAlert,
  CustomerScore,
  CustomerHousehold,
  CustomerHouseholdMember,
  CustomerVisit,
  CustomerIncident,
  CustomerSegmentMembership,
  CustomerProfileStats,
  CustomerProfileOverview,
  CustomerFinancial);
```

### Strict TS Patterns for `metadata`

Customer `metadata` is `Record<string, unknown> | null`. Strict TypeScript requires:

```typescript
// Conditional rendering — coerce to boolean
{!!customer.metadata?.dateOfBirth && (
  <DetailRow label="Date of Birth" value={String(customer.metadata.dateOfBirth)} />
)}

// Value props — coerce to string
<DetailRow value={String(customer.metadata?.gender ?? '')} />
```

---

## 45. Module Independence (Microservice Readiness)

The architecture is a **modular monolith** designed for future microservice extraction. Each module MUST be independently deployable.

### Hard Rules

1. **No cross-module package.json dependencies** — modules in `packages/modules/` must ONLY depend on `@oppsera/shared`, `@oppsera/db`, and `@oppsera/core`. Never add another module as a dependency.
2. **No importing another module's internal helpers** — shared functions like `fetchOrderForMutation`, `incrementVersion`, `checkIdempotency`, `saveIdempotencyKey` now live in `@oppsera/core/helpers/`. Never import from `@oppsera/module-X/helpers/*` in another module.
3. **No direct function calls across modules** — module A must never call module B's command or query functions directly (exception: internal read APIs via singleton pattern, §26).
4. **No querying another module's tables** — each module owns its schema. Event consumers must NOT reach into another module's tables. Use event data or internal read APIs instead.
5. **Events are the primary communication channel** — cross-module side-effects happen via event consumers, not synchronous calls.
6. **Internal read APIs are the ONLY sync exception** — and they must be read-only, minimal, and use the singleton getter/setter pattern.

### Known Violations (Status)

| Issue                                                                                                                  | Modules                      | Status                                                                                          |
| ---------------------------------------------------------------------------------------------------------------------- | ---------------------------- | ----------------------------------------------------------------------------------------------- |
| ~~`module-orders` depends on `module-catalog` in package.json~~                                                        | orders → catalog             | **FIXED** — orders imports `getCatalogReadApi` + `calculateTaxes` from `@oppsera/core/helpers/` |
| ~~`module-payments` depends on `module-orders` in package.json~~                                                       | payments → orders            | **FIXED** — shared helpers moved to `@oppsera/core/helpers/`                                    |
| ~~Payments imports `fetchOrderForMutation`, `incrementVersion`, `checkIdempotency`, `saveIdempotencyKey` from Orders~~ | payments → orders            | **FIXED** — all four helpers now in `@oppsera/core/helpers/` with thin re-exports in orders     |
| Customers event consumer queries `orders` and `tenders` tables directly                                                | customers → orders, payments | **TODO** — enrich event payloads instead of direct table access                                 |

### Shared Helpers in `@oppsera/core/helpers/`

After the architecture decoupling, these cross-module helpers live in core:

| Helper                                      | File                               | Used By                    |
| ------------------------------------------- | ---------------------------------- | -------------------------- |
| `checkIdempotency`, `saveIdempotencyKey`    | `core/helpers/idempotency.ts`      | orders, payments           |
| `fetchOrderForMutation`, `incrementVersion` | `core/helpers/optimistic-lock.ts`  | orders, payments           |
| `calculateTaxes`                            | `core/helpers/tax-calc.ts`         | orders (via add-line-item) |
| `getCatalogReadApi`, `setCatalogReadApi`    | `core/helpers/catalog-read-api.ts` | orders (via add-line-item) |

The orders and catalog modules provide thin re-exports from their original paths for backward compat.

### Dependency Rule (Package.json)

```
@oppsera/shared          ← no internal deps
@oppsera/db              ← shared
@oppsera/core            ← shared, db
@oppsera/module-*        ← shared, db, core (NEVER another module)
@oppsera/web             ← all packages (orchestration layer)
```

---

## 46. Mobile Responsiveness

Every page and component MUST be responsive and usable on mobile devices (320px+).

### Hard Rules

1. **Never use fixed percentage widths without responsive alternatives** — `w-[60%]` must have a `flex-col lg:flex-row` wrapper or similar breakpoint behavior.
2. **Always use responsive breakpoints for layouts** — desktop multi-column layouts must stack on mobile. Use `flex-col md:flex-row` or `grid grid-cols-1 md:grid-cols-2`.
3. **Dialogs must be mobile-friendly** — use `max-w-[calc(100vw-2rem)] sm:max-w-md` patterns; reduce padding on small screens with `p-4 sm:p-6`.
4. **Tables must have mobile alternatives** — use the `DataTable` component's built-in mobile card view, or add `overflow-x-auto` for horizontal scrolling.
5. **Touch targets must be at least 44px** — all buttons, links, and interactive elements need minimum 44x44px tap area on mobile.
6. **Context menus and popovers must check viewport bounds** — never position a menu off-screen; clamp to viewport edges on small screens.
7. **Text must scale down on mobile** — use responsive text classes: `text-lg sm:text-xl md:text-2xl`.
8. **Filters and toolbars must stack on mobile** — use `flex flex-col sm:flex-row` for filter groups.

### POS Exception

POS pages (retail + F&B) are designed for **tablet and desktop** (10"+ screens). They do NOT need to support phones. However, they MUST work on tablets (768px+).

### Testing Checklist

Before marking a page as done, verify at these breakpoints:

- 320px (small phone)
- 375px (standard phone)
- 768px (tablet portrait)
- 1024px (tablet landscape / small laptop)
- 1440px+ (desktop)

**Rule:** Never use `customer.metadata.X as string` (unsafe cast). Never render `unknown` directly as ReactNode.

---

## 47. Connection Pooling & Database Configuration

### Supavisor Transaction Mode

Supabase uses Supavisor as its connection pooler. In transaction mode (the default and recommended mode), each SQL transaction is assigned a backend connection for its duration, then returned to the pool.

**Implications for our stack:**

1. **`prepare: false`** is mandatory — prepared statements are connection-scoped; Supavisor reassigns connections between transactions, causing "prepared statement does not exist" errors.
2. **`SET LOCAL` is safe** — `withTenant()` uses `set_config(..., true)` which is equivalent to `SET LOCAL`. Transaction-scoped settings auto-clear on commit/rollback, so the next transaction on that connection starts clean.
3. **Advisory locks are NOT safe** — `pg_advisory_lock()` is session-scoped. With transaction-mode pooling, the "session" is just one transaction. Use `pg_advisory_xact_lock()` (transaction-scoped) instead.

### Connection Budget by Stage

```
Stage 1 (Vercel Pro + Supabase Pro):
  Supabase limit: 60 direct / 200 pooled connections
  Vercel instances: ~20 concurrent × max:2 = ~40 connections
  Outbox worker: 1 connection
  Cron jobs: 1-2 connections
  Budget: ~46 of 200 pooled (safe headroom)

Stage 2 (+ read replica):
  Primary: ~46 (writes + commands)
  Replica: ~46 (reads + queries)
  Redis: takes load off DB for caching
  Budget: ~110 total
```

### Postgres Tuning Parameters

Set these at the database level (Supabase dashboard or `postgresql.conf`):

```sql
-- Query safety
SET statement_timeout = '30s';                        -- Kill queries over 30s
SET idle_in_transaction_session_timeout = '60s';       -- Kill idle-in-txn after 60s
SET lock_timeout = '5s';                               -- Fail fast on lock waits

-- Write-heavy table autovacuum (apply per-table)
ALTER TABLE orders SET (autovacuum_vacuum_scale_factor = 0.05);
ALTER TABLE orders SET (autovacuum_analyze_scale_factor = 0.02);
ALTER TABLE inventory_movements SET (autovacuum_vacuum_scale_factor = 0.05);
ALTER TABLE event_outbox SET (autovacuum_vacuum_scale_factor = 0.02);
ALTER TABLE event_outbox SET (autovacuum_vacuum_threshold = 100);
```

### Read Replica Routing (Stage 2+)

```typescript
// withTenantReadonly() routes to read replica when available
async function listThings(input: ListInput): Promise<ListResult> {
  return withTenantReadonly(input.tenantId, async (tx) => {
    // ... read-only queries go to replica
  });
}

// withTenant() always uses primary (writes + reads needing consistency)
async function createThing(ctx: RequestContext, input: Input) {
  return publishWithOutbox(ctx, async (tx) => {
    // ... writes always go to primary
  });
}
```

**Rule:** Use `withTenantReadonly()` for queries (list, get, search). Use `withTenant()` for commands (create, update, delete). The implementation swaps between primary and replica internally — no caller changes needed when replica is added.

---

## 48. Background Jobs

### Architecture

Postgres-native job system using `FOR UPDATE SKIP LOCKED` — no external queue dependency (no pg-boss, BullMQ, or Redis required at Stage 1).

### Tables

```sql
-- Main job queue
background_jobs (
  id, tenant_id, job_type, payload jsonb, priority, status,
  max_attempts, attempt_count, locked_by, locked_at, lease_expires,
  scheduled_for, completed_at, failed_at, last_error,
  created_at, updated_at
)

-- Attempt history for debugging
background_job_attempts (
  id, job_id, attempt_number, worker_id, started_at, completed_at,
  status, error_message, error_stack, duration_ms
)

-- Cron-like scheduled jobs
scheduled_jobs (
  id, tenant_id, job_type, cron_expression, payload jsonb,
  is_active, last_run_at, next_run_at, created_at
)
```

### Emitting Jobs

Always emit jobs **inside** transactions alongside the business write:

```typescript
export async function createThing(ctx: RequestContext, input: Input) {
  return publishWithOutbox(ctx, async (tx) => {
    const [created] = await tx.insert(table).values({...}).returning();

    // Emit background job in the same transaction
    await emitJob(tx, {
      tenantId: ctx.tenantId,
      jobType: 'generate-report',
      payload: { thingId: created!.id },
      priority: 5,           // 1=highest, 10=lowest
      scheduledFor: null,     // null = run immediately
    });

    return { result: created!, events: [...] };
  });
}
```

**Rule:** `emitJob()` writes to the `background_jobs` table inside the transaction. If the transaction rolls back, the job is never created. This guarantees consistency between business state and job existence.

### Job Handler Interface

```typescript
interface JobHandler {
  jobType: string;
  handle(job: BackgroundJob): Promise<void>;
  // Optional: custom retry delay (default: exponential backoff)
  getRetryDelay?(attempt: number): number;
}
```

### Job Type Naming

Format: `{module}.{action}` — e.g., `inventory.sync-counts`, `customers.generate-statement`, `reporting.daily-sales`.

### Worker Design

```typescript
// JobWorker polls for jobs using SKIP LOCKED
SELECT * FROM background_jobs
WHERE status = 'pending'
  AND (scheduled_for IS NULL OR scheduled_for <= NOW())
  AND (lease_expires IS NULL OR lease_expires < NOW())
ORDER BY priority ASC, created_at ASC
LIMIT :batchSize
FOR UPDATE SKIP LOCKED
```

**Tenant fairness:** The worker enforces `maxJobsPerTenantPerPoll` (default: 5) to prevent a single tenant from monopolizing the queue.

**Lease mechanism:** When a worker claims a job, it sets `locked_by`, `locked_at`, and `lease_expires` (default: 5 minutes). If the worker crashes, the lease expires and another worker picks up the job.

### Vercel Deployment

On Vercel, background jobs run via:
1. **In-process worker** started in `instrumentation.ts` (runs while instance is alive)
2. **Vercel Cron** pings `/api/v1/internal/drain-jobs` every 1 minute as safety net for cold start gaps

### Retry & Failure

```
Attempt 1: immediate
Attempt 2: 30s delay
Attempt 3: 2min delay
Attempt 4: 10min delay
Attempt 5: 1hr delay (max_attempts default: 5)
→ After max_attempts: status = 'dead', moved to dead-letter inspection
```

---

## 49. Scaling Strategy

### Deployment Stages

| Stage | Tenants | Infrastructure | Monthly Cost |
|-------|---------|----------------|-------------|
| 1 | 0-200 | Vercel Pro + Supabase Pro | ~$50-70 |
| 2 | 200-1000 | + Redis + read replica | ~$150-500 |
| 3 | 1000-4000 | VPS Docker Compose | ~$500-2,000 |
| 4 | 4000+ | K8s (only if justified) | $2,000+ |

### Stage Transition Triggers

**Stage 1 → 2** (add Redis + replica):
- P95 query latency > 200ms consistently
- Connection pool utilization > 70%
- Permission cache hits < 80%

**Stage 2 → 3** (move to VPS):
- Vercel function timeouts on background jobs
- Need persistent workers (not cron-triggered)
- Monthly Vercel bill > VPS equivalent

**Stage 3 → 4** (K8s):
- Running >10 independently scalable services
- Need custom-metric auto-scaling
- Team has K8s operational experience
- Monthly spend already >$2K

### Tenant Tiering

```typescript
type TenantTier = 'small' | 'medium' | 'large' | 'enterprise';

const TIER_LIMITS = {
  small:      { maxLocations: 5,   rateLimit: 100,  maxConcurrentJobs: 10  },
  medium:     { maxLocations: 20,  rateLimit: 500,  maxConcurrentJobs: 25  },
  large:      { maxLocations: 100, rateLimit: 2000, maxConcurrentJobs: 50  },
  enterprise: { maxLocations: -1,  rateLimit: 5000, maxConcurrentJobs: 100 },
};
```

Rate limits are requests per minute. Enforce via middleware with sliding window counter (Redis at Stage 2, in-memory at Stage 1).

### Data Lifecycle

| Table | Retention | Action |
|-------|-----------|--------|
| `event_outbox` (published) | 7 days | DELETE |
| `processed_events` | 30 days | DELETE |
| `idempotency_keys` | 24 hours (TTL column) | DELETE |
| `background_jobs` (completed) | 30 days | DELETE/archive |
| `audit_log` | 2 years | Partition + detach old |
| `inventory_movements` | Indefinite | Partition at 50M rows |
| `orders` | Indefinite | Partition at 50M rows |

### Partitioning Decision

**When:** Only when a single table exceeds 50M rows AND index scans show P95 > 100ms.
**How:** Date-based monthly partitioning (by `created_at` or `business_date`).
**NOT:** Tenant-based partitioning (creates too many partitions — one per tenant is unmanageable at 4000 tenants).

---

## 50. Observability

### Structured Logging

Every API request should log:

```typescript
{
  level: 'info',
  requestId: ctx.requestId,
  tenantId: ctx.tenantId,
  method: 'POST',
  path: '/api/v1/orders',
  status: 201,
  durationMs: 45,
  userId: ctx.user.id,
}
```

**Rule:** Always include `tenantId` and `requestId` in logs. These are the primary correlation keys for debugging multi-tenant issues.

### pg_stat_statements

Enable from day 1 (Supabase has it enabled by default):

```sql
-- Weekly review: top 20 slowest queries
SELECT query, calls, mean_exec_time, total_exec_time
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 20;

-- High-frequency queries (potential for caching)
SELECT query, calls, mean_exec_time
FROM pg_stat_statements
ORDER BY calls DESC
LIMIT 20;
```

### Alert Thresholds

| Metric | Warning | Critical |
|--------|---------|----------|
| P95 API latency | > 500ms | > 2s |
| DB connection pool utilization | > 70% | > 90% |
| Dead-letter queue depth | > 10 | > 50 |
| Background job failure rate | > 5% | > 20% |
| Outbox lag (unpublished > 5min old) | > 10 events | > 100 events |

### Error Tracking (Sentry)

```typescript
// Initialize in instrumentation.ts
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 0.1,  // 10% of requests get performance traces
  environment: process.env.NODE_ENV,
});

// Errors automatically captured via withMiddleware error handler
// Add breadcrumbs for critical operations:
Sentry.addBreadcrumb({ category: 'job', message: `Processing ${job.jobType}`, data: { jobId: job.id } });
```

### Optional Dependency Pattern

For packages that may not be installed (e.g., `@sentry/nextjs`, `ioredis`), use runtime string concatenation to prevent webpack from statically resolving:

```typescript
// WRONG — webpack will fail if package not installed:
const Sentry = require('@sentry/nextjs');

// RIGHT — webpack cannot resolve dynamic string:
const pkg = '@sentry/' + 'nextjs';
const Sentry = require(pkg);  // wrapped in try/catch
```

### Vitest Mock Reset Pattern

When using `mockReturnValueOnce` chains, always call `mockReset()` in `beforeEach` — `clearAllMocks()` only clears call history, NOT the once-value queue:

```typescript
beforeEach(() => {
  vi.clearAllMocks();    // clears .mock.calls, .mock.results
  mockSelect.mockReset();  // ALSO clears mockReturnValueOnce queue
  mockInsert.mockReset();
  // Re-establish default return values after reset
  mockSelect.mockImplementation(() => makeSelectChain());
  mockInsert.mockReturnValue({ values: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([]) }) });
});
```

### Observability File Locations

```
packages/core/src/observability/
├── logger.ts              # Structured JSON logger (LOG_LEVEL env var)
├── request-metrics.ts     # Per-request metrics via AsyncLocalStorage
├── drizzle-logger.ts      # Drizzle Logger interface for query tracking
├── api-handler.ts         # withApi() — enhanced route handler wrapper
├── alerts.ts              # Slack webhook alerting (P0-P3 severity, dedup)
├── error-classification.ts # Error pattern → severity mapping
├── db-health.ts           # pg_stat_statements monitoring
├── job-health.ts          # Outbox + background job metrics
├── sentry-context.ts      # Sentry helpers (graceful no-op if not installed)
├── runbooks.ts            # On-call runbook definitions
├── migration-triggers.ts  # When-to-migrate threshold checks
└── index.ts               # Barrel exports
```

### Infrastructure File Locations

```
infra/
├── docker/
│   ├── Dockerfile.web     # Next.js standalone multi-stage build
│   └── Dockerfile.worker  # Background worker multi-stage build
├── docker-compose.yml     # Local dev: postgres + redis + web + worker
├── terraform/
│   ├── main.tf            # AWS: VPC, ECS Fargate, RDS, ElastiCache, ALB
│   ├── variables.tf       # Resource sizing defaults
│   └── outputs.tf         # DNS, endpoints
├── worker.ts              # Standalone worker entry point
├── migration/
│   └── db-migration-checklist.sql  # Post-migration validation queries
├── LIMITS_AND_MIGRATION.ts        # Vercel/Supabase limits + cost projections (run with npx tsx)
└── MIGRATION_PLAN.md              # Full 6-phase migration plan (human-readable reference)
```

### Migration Planning Pattern

Cost projections and migration triggers are code, not docs:

```typescript
// infra/LIMITS_AND_MIGRATION.ts — run to see current assessment:
npx tsx infra/LIMITS_AND_MIGRATION.ts

// packages/core/src/config/deployment.ts — auto-detects target:
const config = getDeploymentConfig();
// config.target: 'vercel' | 'container' | 'local'
// config.database.poolSize: auto-adjusted per target (2/10/5)

// packages/core/src/config/feature-flags.ts — gradual rollout:
if (isEnabled('USE_READ_REPLICA')) { /* route to replica */ }
```

---

## 51. Security

### Security Audit Reference

Full audit with 25 findings at `infra/SECURITY_AUDIT.md`. Key files:

```
packages/core/src/security/
├── rate-limiter.ts    # In-memory sliding window rate limiter (Stage 1)
└── index.ts           # Barrel exports

apps/web/next.config.ts       # Security headers (CSP, HSTS, etc.)
infra/SECURITY_AUDIT.md       # Full 8-phase audit with checklist
```

### Rate Limiting Pattern

All auth endpoints use rate limiting. Apply to new endpoints:

```typescript
import { RATE_LIMITS, checkRateLimit, getRateLimitKey, rateLimitHeaders } from '@oppsera/core/security';

// Inside route handler, BEFORE any business logic:
const rlKey = getRateLimitKey(request, 'auth:login');
const rl = checkRateLimit(rlKey, RATE_LIMITS.auth);
if (!rl.allowed) {
  return NextResponse.json(
    { error: { code: 'RATE_LIMITED', message: 'Too many requests. Please try again later.' } },
    { status: 429, headers: rateLimitHeaders(rl) },
  );
}
```

**Presets:** `auth` (20/15min), `authStrict` (5/15min), `api` (100/min), `apiWrite` (30/min).

### Auth Event Audit Logging

Auth events use `auditLogSystem()` (no user context available). Always best-effort:

```typescript
import { auditLogSystem } from '@oppsera/core/audit/helpers';

// After successful login:
try {
  await auditLogSystem('', 'auth.login.success', 'user', 'unknown', { email });
} catch { /* best-effort */ }
```

Events logged: `auth.login.success`, `auth.login.failed`, `auth.signup.success`, `auth.logout`.

### Security Headers

Configured in `next.config.ts` via `async headers()`. CSP dynamically adds `'unsafe-eval'` in dev only. Never weaken CSP without security review.

### DB Connection Security

Pool config is env-var-driven in `packages/db/src/client.ts`:

| Env Var | Default | Vercel | Container |
|---------|---------|--------|-----------|
| `DB_POOL_MAX` | 5 | 2 | 10 |
| `DB_ADMIN_POOL_MAX` | 3 | 2 | 5 |
| `DB_PREPARE_STATEMENTS` | false | false | true |

**Rule:** `prepare: false` is the default (safe for Supavisor). Only set `DB_PREPARE_STATEMENTS=true` on containers with direct Postgres connections.

### set_config Scope Rule

Always use `set_config(key, value, true)` — the third parameter `true` means transaction-scoped (`SET LOCAL`). Session-scoped (`false`) leaks between pooled connections. The only correct patterns:

```typescript
// CORRECT — transaction-scoped:
await tx.execute(sql`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`);

// WRONG — session-scoped, leaks in connection pools:
await db.execute(sql`SELECT set_config('app.current_tenant_id', ${tenantId}, false)`);
```

---

## 52. Reporting / Read Model Architecture

### CQRS Read Models

Reporting uses the CQRS (Command Query Responsibility Segregation) pattern. Read models are pre-aggregated projections maintained by event consumers — never written to by user-facing commands.

```
packages/db/src/schema/reporting.ts           # 4 rm_ table definitions
packages/db/migrations/0049_reporting_read_models.sql
packages/modules/reporting/src/
├── business-date.ts                          # computeBusinessDate utility
├── consumers/
│   ├── order-placed.ts                       # order.placed.v1 → daily_sales + item_sales + customer_activity
│   ├── order-voided.ts                       # order.voided.v1 → daily_sales + item_sales
│   ├── tender-recorded.ts                    # tender.recorded.v1 → daily_sales (tender breakdown)
│   ├── inventory-movement.ts                 # inventory.movement.created.v1 → inventory_on_hand
│   └── index.ts                              # Barrel exports
├── queries/
│   ├── get-daily-sales.ts                    # Single/multi-location daily sales with date range
│   ├── get-item-sales.ts                     # Top-N item sales with sort + aggregate
│   ├── get-inventory-summary.ts              # Current inventory snapshot with filters
│   ├── get-dashboard-metrics.ts              # Today's KPIs (sales, orders, low stock, active customers)
│   └── index.ts                              # Barrel exports
├── csv-export.ts                             # toCsv(columns, rows) — RFC 4180 + BOM
└── index.ts                                  # Module entry point

apps/web/src/app/api/v1/reports/
├── daily-sales/
│   ├── route.ts                              # GET — daily sales JSON
│   └── export/route.ts                       # GET — daily sales CSV
├── item-sales/
│   ├── route.ts                              # GET — item sales JSON
│   └── export/route.ts                       # GET — item sales CSV
├── inventory-summary/route.ts                # GET — inventory snapshot
└── dashboard/route.ts                        # GET — dashboard metrics
```

### Table Naming

All read model tables use the `rm_` prefix:

| Table | Natural Key | Updated By |
|-------|-------------|------------|
| `rm_daily_sales` | tenant + location + business_date | order.placed.v1, order.voided.v1 |
| `rm_item_sales` | tenant + location + date + catalog_item | order.placed.v1, order.voided.v1 |
| `rm_inventory_on_hand` | tenant + location + inventory_item | inventory events |
| `rm_customer_activity` | tenant + customer | order.placed.v1 |

### Upsert-by-Natural-Key Pattern

Each read model has a UNIQUE composite index on its natural key. Consumers use `ON CONFLICT ... DO UPDATE` with raw SQL (not Drizzle fluent API) because Drizzle doesn't support `EXCLUDED` references or arithmetic on existing column values:

```typescript
await (tx as any).execute(sql`
  INSERT INTO rm_daily_sales (id, tenant_id, location_id, business_date, order_count, gross_sales, ...)
  VALUES (${generateUlid()}, ${tenantId}, ${locationId}, ${date}, 1, ${amount}, ...)
  ON CONFLICT (tenant_id, location_id, business_date)
  DO UPDATE SET
    order_count = rm_daily_sales.order_count + 1,
    gross_sales = rm_daily_sales.gross_sales + ${amount},
    avg_order_value = CASE WHEN (rm_daily_sales.order_count + 1) > 0
      THEN (rm_daily_sales.net_sales + ${net}) / (rm_daily_sales.order_count + 1) ELSE 0 END,
    updated_at = NOW()
`);
```

### Money in Read Models

Unlike order-layer tables (cents as INTEGER), read models store aggregated dollar amounts as `NUMERIC(19,4)`. This avoids overflow on high-volume aggregates and keeps reporting queries simple (no cents-to-dollars conversion). Always convert to `Number()` in query mappings before returning to frontend.

### Consumer Idempotency

Each consumer atomically checks-and-inserts into `processed_events` as the FIRST statement inside `withTenant`. This is stronger than the bus-level `checkProcessed` because it's inside the same transaction as the read model upsert:

```typescript
// Atomic idempotency: INSERT ... ON CONFLICT DO NOTHING RETURNING id
const inserted = await (tx as any).execute(sql`
  INSERT INTO processed_events (id, tenant_id, event_id, consumer_name, processed_at)
  VALUES (${generateUlid()}, ${event.tenantId}, ${event.eventId}, ${CONSUMER_NAME}, NOW())
  ON CONFLICT (event_id, consumer_name) DO NOTHING
  RETURNING id
`);
const rows = Array.from(inserted as Iterable<{ id: string }>);
if (rows.length === 0) return; // Already processed — skip
```

### Business Date Calculation

```typescript
import { computeBusinessDate } from '@oppsera/module-reporting';

// Standard midnight cutover:
computeBusinessDate('2026-03-15T18:30:00Z', 'America/New_York'); // → '2026-03-15'

// With day-close offset (events between midnight and 2AM belong to previous day):
computeBusinessDate('2026-03-15T05:30:00Z', 'America/New_York', '02:00'); // → '2026-03-14'
```

Uses native `Intl.DateTimeFormat` with IANA timezones — handles DST transitions correctly, no external library needed.

### Void Semantics

Voids do NOT decrement `order_count`. They increment `void_count`/`void_total` and subtract from `net_sales`. `avg_order_value` is recomputed as `net_sales / order_count` using the original count.

### Query Services

Query services follow two modes depending on whether `locationId` is provided:

| Mode | Description | avgOrderValue |
|------|-------------|---------------|
| Single-location | Direct SELECT from `rm_` table with date range | Use stored value as-is |
| Multi-location | GROUP BY businessDate, SUM aggregates | Recompute: `SUM(netSales) / SUM(orderCount)` |

**Critical**: never sum `avgOrderValue` across locations — that's average-of-averages, which is mathematically wrong.

```typescript
// Multi-location aggregation (from getDailySales)
const rows = await tx
  .select({
    businessDate: rmDailySales.businessDate,
    orderCount: sql<number>`sum(${rmDailySales.orderCount})::int`,
    netSales: sql<string>`sum(${rmDailySales.netSales})::numeric(19,4)`,
    avgOrderValue: sql<string>`case when sum(${rmDailySales.orderCount}) > 0
      then (sum(${rmDailySales.netSales}) / sum(${rmDailySales.orderCount}))::numeric(19,4)
      else 0 end`,
  })
  .from(rmDailySales)
  .where(and(...conditions))
  .groupBy(rmDailySales.businessDate)
  .orderBy(asc(rmDailySales.businessDate));
```

### CSV Export

`toCsv(columns, rows)` generates RFC 4180 CSV with:
- UTF-8 BOM (`\uFEFF`) for Excel auto-detection
- Proper escaping: commas, double quotes (`""` doubling), embedded newlines
- CRLF line endings
- Returns a `Buffer` ready for HTTP response

### API Route Permissions

| Route | Permission | Description |
|-------|-----------|-------------|
| `/api/v1/reports/daily-sales` | `reports.view` | Daily sales JSON |
| `/api/v1/reports/item-sales` | `reports.view` | Item sales JSON |
| `/api/v1/reports/inventory-summary` | `reports.view` | Inventory snapshot JSON |
| `/api/v1/reports/dashboard` | `reports.view` | Dashboard KPIs JSON |
| `/api/v1/reports/daily-sales/export` | `reports.export` | Daily sales CSV download |
| `/api/v1/reports/item-sales/export` | `reports.export` | Item sales CSV download |

All routes require `entitlement: 'reporting'`. Export routes use the stricter `reports.export` permission to allow operators to grant dashboard access without export capability.

### Read Model Rules

1. **Never write to `rm_` tables from API routes** — only event consumers update read models
2. **Read models are eventually consistent** — they lag behind the source of truth by event processing delay
3. **Rebuild capability** — consumers must be re-runnable to rebuild read models from event history
4. **All `rm_` tables have RLS** — same 4-policy pattern (select/insert/update/delete) as domain tables
5. **No foreign keys to domain tables** — read models store denormalized copies (`catalog_item_name`, `customer_name`) to avoid cross-module joins
6. **Consumers use raw SQL for upserts** — Drizzle fluent API doesn't support `ON CONFLICT DO UPDATE SET col = col + value` arithmetic
7. **Atomic idempotency** — processed_events insert + read model upsert must be in the SAME transaction
8. **Numeric columns return strings** — Drizzle `numeric` columns return strings; always convert with `Number()` in query mappings

---

## 53. Receiving Module Architecture

### Receipt Lifecycle

```
DRAFT → POSTED → VOIDED
```

- **DRAFT**: editable — lines can be added/updated/removed, header fields can be changed
- **POSTED**: immutable — inventory movements created, costs updated, event emitted
- **VOIDED**: immutable — offsetting movements created, costs reversed

### Schema File

All receiving/vendor tables live in `packages/db/src/schema/receiving.ts`:

```
vendors, uoms, itemUomConversions, itemVendors, itemIdentifiers,
receivingReceipts, receivingReceiptLines
```

### Receipt Number Format

`RCV-YYYYMMDD-XXXXXX` — 6 chars from ULID for uniqueness. Generated server-side in `createDraftReceipt`.

### Money Convention

Receiving uses **NUMERIC(12,4) in dollars** (not cents). Same convention as reporting read models. Reason: receipts deal with vendor invoices denominated in dollars, and landed cost calculations require 4-decimal precision.

### Shipping Allocation

`allocateShipping(lines, shippingCost, method)` distributes shipping across receipt lines:

| Method | Formula |
|--------|---------|
| `by_cost` | `line.extendedCost / totalExtendedCost × shippingCost` |
| `by_qty` | `line.baseQty / totalBaseQty × shippingCost` |
| `by_weight` | `line.weight / totalWeight × shippingCost` (fallback to by_qty if all null) |
| `none` | All zeros |

**Remainder distribution**: Round each allocation to 4dp. Distribute remainder one unit at a time to lines ordered by `extendedCost` DESC, tie-break by `id` ASC. `SUM(allocated)` MUST exactly equal `shippingCost`.

### UOM Conversion

```typescript
toBaseQty(quantity, conversionFactor) → quantity × factor
// factor=1 if already base UOM (e.g., EA)
// factor=24 for 1 CS = 24 EA
```

Conversion factors stored in `itemUomConversions` table per item+UOM pair.

### Costing

```typescript
weightedAvgCost(currentOnHand, currentCost, incomingQty, incomingUnitCost) → newAvgCost
// Edge case: if currentOnHand=0, returns incomingUnitCost
```

`landedUnitCost = (extendedCost + allocatedShipping) / baseQty`

### postReceipt Transaction

The critical transaction inside `publishWithOutbox`:

```
1. Verify status='draft', get all lines (must have ≥1)
2. Recompute everything from scratch (Rule VM-5)
3. For each line:
   a. INSERT inventory_movement (type='receive', qty=+baseQty)
   b. Get new onHand via getOnHand()
   c. Recalculate inventoryItems.currentCost per costingMethod
   d. UPDATE inventoryItems.currentCost
   e. Check stock alerts
   f. Update vendor item costs (Rule VM-4)
4. UPDATE receipt: status='posted', postedAt, postedBy, final totals
5. Emit inventory.receipt.posted.v1
```

### voidReceipt Transaction

```
1. Verify status='posted'
2. For each line: INSERT offsetting movement (type='void_reversal', qty=-baseQty)
3. Reverse inventoryItems.currentCost (weighted avg reversal)
4. UPDATE receipt: status='voided', voidedAt, voidedBy
5. Emit inventory.receipt.voided.v1
```

### File Structure

```
packages/modules/inventory/src/
├── commands/receiving/
│   ├── create-receipt.ts
│   ├── update-receipt.ts
│   ├── add-receipt-line.ts
│   ├── update-receipt-line.ts
│   ├── remove-receipt-line.ts
│   ├── post-receipt.ts
│   ├── void-receipt.ts
│   ├── create-vendor.ts
│   ├── update-vendor.ts
│   └── index.ts
├── services/
│   ├── shipping-allocation.ts
│   ├── uom-conversion.ts
│   ├── costing.ts
│   ├── receipt-calculator.ts
│   ├── vendor-name.ts
│   └── vendor-integration.ts
├── queries/
│   ├── get-receipt.ts
│   ├── list-receipts.ts
│   ├── search-items.ts
│   ├── reorder-suggestions.ts
│   ├── get-vendor.ts
│   ├── list-vendors.ts
│   └── get-vendor-catalog.ts
└── validation/
    ├── receiving.ts
    └── vendor-management.ts
```

### API Routes

```
POST   /api/v1/inventory/receiving           → createDraftReceipt
GET    /api/v1/inventory/receiving           → listReceipts
GET    /api/v1/inventory/receiving/:id       → getReceipt
PATCH  /api/v1/inventory/receiving/:id       → updateDraftReceipt
POST   /api/v1/inventory/receiving/:id/lines → addReceiptLine
PATCH  /api/v1/inventory/receiving/:id/lines/:lineId → updateReceiptLine
DELETE /api/v1/inventory/receiving/:id/lines/:lineId → removeReceiptLine
POST   /api/v1/inventory/receiving/:id/post  → postReceipt
POST   /api/v1/inventory/receiving/:id/void  → voidReceipt
GET    /api/v1/inventory/receiving/search-items → searchItemsForReceiving
GET    /api/v1/inventory/receiving/reorder-suggestions → getReorderSuggestions
```

All routes use `{ entitlement: 'inventory', permission: 'inventory.view' | 'inventory.manage' }`.

### Key Rules

1. **Receipt posting recomputes from scratch** — server never trusts client-computed values
2. **Shipping allocation sum is exact** — remainder distribution guarantees no rounding drift
3. **UOM conversions are item-specific** — same UOM code can have different factors for different items
4. **Barcode search falls through** — `searchItemsForReceiving` checks `item_identifiers.value` first, then `inventoryItems.sku`, then `inventoryItems.name ILIKE`
5. **Receipt lines reference `itemVendors`** — optional FK enables auto-fill of vendor SKU/cost
6. **Lot/serial/expiration** — stored on receipt lines for traceability (V1 data capture only, no lot-level inventory tracking yet)

---

## 54. Vendor Management Architecture

### Vendor Lifecycle

Vendors are always soft-deleted (Rule VM-1). Never hard DELETE from the `vendors` table.

```
Active (isActive=true) → Deactivated (isActive=false) → Reactivated (isActive=true)
```

### Name Uniqueness (Rule VM-2)

```typescript
normalizeVendorName(name: string): string {
  return name.trim().toLowerCase();
}
```

Stored in `name_normalized` column. UNIQUE constraint: `(tenant_id, name_normalized)`.

**Checked on:**
- Create vendor — reject if duplicate active name
- Update vendor (name change) — recompute `name_normalized`, reject if duplicate (excluding self)
- Reactivate vendor — re-check against currently active vendors

### Vendor Catalog (Item-Vendor Mappings)

`item_vendors` table links inventory items to vendors with vendor-specific data:

| Field | Purpose |
|-------|---------|
| `vendorSku` | Vendor's SKU for this item |
| `vendorCost` | Vendor's list price |
| `lastCost` | Last actual cost from most recent receipt |
| `lastReceivedAt` | Date of last receipt containing this item |
| `leadTimeDays` | Vendor's typical lead time |
| `minOrderQty` | Minimum order quantity |
| `packSize` | Pack description (e.g., "Case of 24") |
| `isPreferred` | Only one preferred vendor per item |
| `isActive` | Soft-delete flag (Rule VM-3) |

### Preferred Vendor Enforcement

Only one vendor can be `isPreferred = true` per `inventoryItemId`. Enforced in transaction:

```
1. If setting isPreferred=true:
   a. UPDATE item_vendors SET isPreferred=false WHERE inventoryItemId=? AND isPreferred=true
   b. Then set the target row's isPreferred=true
```

### Integration with Receiving (Rule VM-4)

`updateVendorItemCostAfterReceipt(tx, tenantId, vendorId, inventoryItemId, landedUnitCost)`:
- Called inside `postReceipt()` transaction for each receipt line
- If `item_vendors` row exists → update `lastCost`, `vendorCost`, `lastReceivedAt`
- If row doesn't exist → auto-create with `isPreferred=false`, `isActive=true`

### Vendor Queries

| Query | Returns |
|-------|---------|
| `getVendor(tenantId, vendorId)` | Full vendor detail + aggregate stats (activeCatalogItemCount, totalReceiptCount, totalSpend, lastReceiptDate) |
| `listVendors(tenantId, filters)` | Paginated list with itemCount + lastReceiptDate enrichment per vendor |
| `searchVendors(tenantId, query)` | Lightweight search (max 20, active only) for vendor picker dropdowns |
| `getVendorCatalog(tenantId, vendorId, filters)` | Paginated vendor catalog with item details |
| `getItemVendors(tenantId, inventoryItemId)` | Reverse lookup — which vendors supply this item (preferred first) |
| `getVendorItemDefaults(tenantId, vendorId, inventoryItemId)` | Auto-fill data for receipt line (vendorSku, vendorCost, lastCost, leadTimeDays, isPreferred) |

### Validation Schemas

```
packages/modules/inventory/src/validation/vendor-management.ts
├── vendorSchema            — full vendor create (name required, email/URL validated)
├── updateVendorManagementSchema — partial update (name optional)
├── addVendorCatalogItemSchema   — link vendor to item
├── updateVendorCatalogItemSchema — update vendor catalog entry
└── vendorListFilterSchema  — list filters (search, isActive, pagination, sort)
```

### Key Anti-Patterns

1. **Never hard-delete vendors** — always use `deactivateVendor()` (Rule VM-1)
2. **Never skip name normalization on vendor mutations** — create, update, and reactivate all must check `name_normalized` uniqueness
3. **Never allow multiple preferred vendors per item** — enforce single preferred in transaction
4. **Never query vendor costs outside postReceipt transaction** — `updateVendorItemCostAfterReceipt()` must run inside the same `publishWithOutbox` transaction as movement inserts
5. **Never trust client-computed receipt values** — server recomputes all costs, allocations, and totals from scratch on post (Rule VM-5)

---

## 55. Purchase Orders Architecture (Schema Only — Phase 1)

### Tables

Three tables defined in `packages/db/src/schema/purchasing.ts`:

**`purchaseOrders`**
- Status lifecycle: `DRAFT → SUBMITTED → SENT → PARTIALLY_RECEIVED → CLOSED → CANCELED`
- Optimistic locking via `version` integer column (Rule PO-1)
- PO number format: tenant-unique, auto-generated
- Monetary: subtotal, shippingCost, taxAmount, total as NUMERIC(12,4)
- Lifecycle timestamps: submittedAt/By, sentAt/By, closedAt/By, canceledAt/By

**`purchaseOrderLines`**
- `qtyOrdered` (what was ordered), `qtyOrderedBase` (converted to base UOM), `qtyReceived` (running total from receipts)
- Monetary: unitCost, extendedCost as NUMERIC(12,4)
- Optional FK to `itemVendors` for vendor-specific pricing

**`purchaseOrderRevisions`**
- Created when a SUBMITTED or SENT PO is edited (Rule PO-3)
- Stores frozen JSONB `snapshot` of full PO state at revision time
- Sequential `revisionNumber` per PO, unique constraint `(tenantId, purchaseOrderId, revisionNumber)`
- `changedBy` tracks who made the revision

### Receiving Integration

`receivingReceipts.purchaseOrderId` links receipts to POs (nullable plain text column, FK via ALTER TABLE in migration). When a receipt is posted against a PO, `purchaseOrderLines.qtyReceived` is incremented.

### Circular Import Avoidance

`purchasing.ts` imports from `receiving.ts` (for `vendors`, `itemVendors` references). The reverse reference (`receivingReceipts.purchaseOrderId → purchaseOrders`) is handled as a plain text column in Drizzle with the FK constraint added only in the migration SQL — prevents circular schema imports.

### Migration

`0057_purchase_orders.sql`: CREATE TABLE for 3 PO tables + ALTER TABLE for receiving_receipts FK + RLS (12 policies) + indexes.

### Phases Remaining

- Phase 2: Commands (create/update/submit/send/close/cancel PO, add/update/remove lines)
- Phase 3: Queries (get/list POs, PO status tracking)
- Phase 4: Receiving integration (link receipts to PO lines, auto-fill from PO)
- Phase 5: API routes
- Phase 6: Frontend

---

## 56. Golf Reporting Module Architecture

### Separate Module

Golf reporting lives in `packages/modules/golf-reporting/` — separate from the core `reporting` module. It has its own schema, consumers, queries, and KPI modules.

### Schema

`packages/db/src/schema/golf-reporting.ts` — golf-specific read model tables and lifecycle tables. Migrations: `0052`, `0053`, `0054`.

### Event Consumers (11)

Consume golf-specific events (tee-time lifecycle, channel bookings, folio events, pace tracking):

```
packages/modules/golf-reporting/src/consumers/
├── tee-time lifecycle consumers (created, modified, canceled, checked-in, completed)
├── channel daily aggregation consumer
├── folio event consumers (charge, payment)
├── pace tracking consumers
└── index.ts
```

### Query Services (5)

| Service | Purpose |
|---------|---------|
| Golf dashboard metrics | Today's KPIs (rounds, revenue, utilization) |
| Revenue analytics | Revenue by source, category, period |
| Utilization rates | Tee-sheet utilization by time/day |
| Daypart analysis | Morning/afternoon/twilight performance |
| Customer golf analytics | Player frequency, spend, handicap distribution |

### KPI Modules (3)

- **Channel performance**: booking source analysis (online, phone, walk-in, third-party)
- **Pace of play**: round duration tracking, pace alerts, bottleneck identification
- **Tee-sheet utilization**: capacity vs actual fills, weather impact

### Frontend

```
apps/web/src/components/golf-reports/
├── ChannelsTab.tsx       — booking channel breakdown
├── CustomersTab.tsx      — player analytics
├── MetricCards.tsx        — golf-specific KPIs
├── PaceOpsTab.tsx         — pace of play operations
├── RevenueTab.tsx         — revenue analytics
└── UtilizationTab.tsx     — tee-sheet utilization
```

Hooks: `useGolfReports`, `useReportFilters`, `useNavigationGuard`

### Key Rules

1. **Golf reporting is independent** — never import from `@oppsera/module-reporting` in golf-reporting (use events)
2. **Golf read models use their own prefix convention** — separate from core `rm_` tables
3. **Default dashboards are seeded** — golf module includes seed data for common golf reporting views

---

## 57. Performance Optimization Patterns

### Code-Split Pattern (All Dashboard Pages)

Every page >100 lines under `(dashboard)/` uses a thin wrapper with `next/dynamic` so route transitions commit instantly:

```typescript
// page.tsx — thin wrapper, loads in <1ms
'use client';
import dynamic from 'next/dynamic';
import PageLoading from './loading'; // or PageSkeleton

const PageContent = dynamic(() => import('./page-content'), {
  loading: () => <PageLoading />,
  ssr: false,
});

export default function Page() {
  return <PageContent />;
}
```

**Rules:**
1. `ssr: false` — disables server rendering so the route transition commits immediately
2. Heavy logic lives in `*-content.tsx` — never put business logic directly in `page.tsx`
3. Each page has a `loading.tsx` skeleton (custom or reusable `PageSkeleton`)
4. Custom skeletons mirror the exact page layout; `PageSkeleton` (`apps/web/src/components/ui/page-skeleton.tsx`) is a generic fallback with configurable row count

**Pages using this pattern:** catalog, orders, settings, taxes, memberships, vendors, reports, golf-reports, customer-detail, item-detail, billing-detail, order-detail, item-edit, vendor-detail, receipt-detail, POS retail, POS F&B

### POS Instant Mode Switching (Dual-Mount)

Both POS content components mount in the shared `pos/layout.tsx` and toggle via CSS — no Next.js route transition. See §31 for full implementation.

**Key patterns:**
- Lazy mount on first visit via `visited` state, keep mounted forever
- CSS toggle: active mode is default, inactive gets `pointer-events-none invisible`
- `isActive` prop gates barcode listener and triggers `useEffect` dialog cleanup
- Page files return `null` — exist only as route targets

### Combined API Calls (Catalog + Inventory)

The catalog `listItems` query accepts `includeInventory: true` to batch-fetch inventory data in the same transaction:

```typescript
// packages/modules/catalog/src/queries/list-items.ts
// When includeInventory=true AND locationId is provided:
// 1. Fetch catalog items (standard query)
// 2. Batch-fetch matching inventory_items by catalogItemId
// 3. Batch-compute SUM(quantity_delta) for on-hand
// 4. Enrich each item with { inventoryItemId, onHand, reorderPoint }
```

**Rule:** On the catalog list page, always pass `includeInventory=true` to avoid a separate `/api/v1/inventory` waterfall call.

### Category Fetch Deduplication

Module-level cache in `apps/web/src/hooks/use-catalog.ts` ensures 3 category hooks share 1 API call:

```typescript
// Module-level (not per-component) — survives re-renders
let _catCache: {
  data: CategoryRow[] | null;
  promise: Promise<CategoryRow[]> | null;
  ts: number;
} = { data: null, promise: null, ts: 0 };

const CAT_CACHE_TTL = 30_000; // 30s

// useAllCategories() checks cache, deduplicates in-flight requests
// useDepartments(), useSubDepartments(), useCategories() filter in-memory
```

**Rules:**
1. Never fetch categories individually — always go through `useAllCategories()`
2. Cache is module-level (shared across all components), not React state
3. In-flight promise dedup prevents multiple concurrent API calls
4. TTL is 30s — stale data auto-refreshes on next access

### Dashboard Stale-While-Revalidate

Dashboard uses pre-aggregated CQRS read models via `/api/v1/reports/dashboard` instead of fetching raw orders/inventory:

```typescript
// Pattern: sessionStorage cache with business-date invalidation
const cached = loadCachedDashboard(); // from sessionStorage
if (cached) {
  setMetrics(cached.metrics);      // render instantly
  setRecentOrders(cached.recentOrders);
  fetchDashboard(false);           // background refresh, no spinner
} else {
  fetchDashboard(true);            // first load, show spinner
}

// fetchDashboard uses Promise.allSettled for 3 parallel calls:
// 1. /api/v1/reports/dashboard  (pre-aggregated KPIs)
// 2. /api/v1/orders?limit=5     (recent 5 orders only)
// 3. /api/v1/inventory?lowStockOnly=true&limit=5
```

**Rules:**
1. Never fetch >5 items for dashboard display — previous pattern fetched 100 orders for 2 KPI numbers
2. Use `Promise.allSettled` so individual API failures don't block others
3. Cache invalidates on new business day (date comparison)
4. Reporting endpoint uses `rm_daily_sales` read models — single-digit ms vs hundreds of ms for raw order aggregation

### Covering Indexes

Migration `0065_list_page_indexes.sql`:

```sql
-- Tender aggregation on order list page
CREATE INDEX idx_tenders_tenant_status_order
  ON tenders (tenant_id, status, order_id);

-- Index-only scan for inventory on-hand SUM
CREATE INDEX idx_inventory_movements_onhand
  ON inventory_movements (tenant_id, inventory_item_id)
  INCLUDE (quantity_delta);
```

**Rule:** When adding new list pages or aggregation queries, add covering indexes. Use `INCLUDE` for columns only needed in SELECT (not WHERE/ORDER BY) to enable index-only scans.

### Z-Index Architecture

The dashboard layout uses z-index layering to prevent POS overlays from blocking sidebar navigation:

```
z-0:  Main content area (relative z-0 — creates stacking context)
z-30: POS overlay backdrops (payment picker, etc.)
z-40: Desktop sidebar (relative z-40 — always clickable)
z-50: Portal dialogs (createPortal to document.body)
z-60: TenderDialog (highest priority portal)
```

**Rule:** Never add `fixed inset-0` overlays above z-30 in POS content. The sidebar must remain clickable at z-40. Dialogs that need to be above everything use portals to `document.body` (outside the z-0 stacking context).

### POS Catalog Single-Query Loader

The original POS catalog loading used multiple API calls (categories, items, modifiers). The optimized version uses a single query:

```typescript
// packages/modules/catalog/src/queries/get-catalog-for-pos.ts
// Single query that returns: categories + items + modifiers + tax info
// Called via POST /api/v1/catalog/pos

const catalog = await getCatalogForPOS(tenantId, locationId);
// Returns everything useCatalogForPOS needs in one round trip
```

**Rule:** Always use the POS-optimized endpoint for initial catalog load. Individual item/category APIs are for CRUD operations, not POS display.

### Customer Search Indexes

Migration `0055_customer_search_indexes.sql` adds targeted indexes for customer search performance.

**Rule:** When adding new search patterns, add corresponding indexes. Use `EXPLAIN ANALYZE` to verify index usage.

### Hook Performance Patterns

POS hooks were refactored for performance:

1. **`useCatalogForPOS`** — reduced re-renders by memoizing hierarchy maps, batching state updates
2. **`useRegisterTabs`** — optimized tab management with lazy initialization

**Key patterns:**
- Use `useMemo` for derived data (hierarchy maps, filtered lists)
- Use `useCallback` for event handlers passed to child components
- Avoid unnecessary state that can be derived from existing state
- Batch related state updates to prevent cascading re-renders

---

## 58. Catalog Item Change Log Architecture

### Purpose

Append-only, field-level audit trail for catalog items. Provides "what changed, when, by whom, why" context that the generic `audit_log` table doesn't capture (creation snapshots, source tracking, notes, field-level diffs with display names).

### Table

`catalog_item_change_logs` (migration 0063) — Drizzle schema in `packages/db/src/schema/catalog.ts`.

**RLS enforcement: SELECT + INSERT only (append-only).** No UPDATE or DELETE policies exist. This means no one can modify or remove change log entries.

### Service

`packages/modules/catalog/src/services/item-change-log.ts` provides:

```typescript
// Types
type ActionType = 'CREATED' | 'UPDATED' | 'ARCHIVED' | 'RESTORED' | 'COST_UPDATED' | 'INVENTORY_ADJUSTED' | 'IMPORTED';
type ChangeSource = 'UI' | 'API' | 'IMPORT' | 'SYSTEM';
interface FieldChange { old: unknown; new: unknown; }

// Diff utility — compares before/after states, returns null if no changes
computeItemDiff(before: Record<string, unknown> | null, after: Record<string, unknown>): Record<string, FieldChange> | null;

// Log utility — inserts inside the same transaction, skips if no diff
logItemChange(tx, { tenantId, itemId, before, after, userId, actionType, source, summary?, notes? }): Promise<void>;

// Display mapping — used by both server and client for formatting
FIELD_DISPLAY: Record<string, { label: string; format?: 'currency' | 'date' | 'boolean' | 'lookup' | 'text' }>;
```

### Integration Pattern

Every catalog command that mutates an item calls `logItemChange()` inside the `publishWithOutbox` callback:

```typescript
const result = await publishWithOutbox(ctx, async (tx) => {
  // ... mutation logic ...
  const [updated] = await tx.update(catalogItems).set(updates).where(...).returning();

  // Log field-level changes (skips if nothing changed)
  await logItemChange(tx, {
    tenantId: ctx.tenantId,
    itemId,
    before: existing,  // null for CREATED
    after: updated!,
    userId: ctx.user.id,
    actionType: 'UPDATED',
    source: 'UI',
  });

  return { result: updated!, events: [event] };
});
```

### Query

`getItemChangeLog(input)` — cursor-paginated, filters by date range/action type/user. Joins `users` table for display names. Batch-resolves `categoryId` and `taxCategoryId` lookup fields by injecting `oldDisplay`/`newDisplay` into the fieldChanges response.

### Frontend

`ItemChangeLogModal` — portal-based modal (z-50, fixed positioning) with:
- Filter row: action type dropdown + date pickers
- Collapsible entry cards: date/time, user name, action badge, summary
- Expanded view: field-level old→new display with formatting (currency, boolean, date, lookup, text)
- "Load More" pagination at bottom

### Key Rules

1. **Never UPDATE or DELETE change log entries** — append-only, enforced by RLS
2. **Always run logItemChange inside the transaction** — ensures log entries are committed atomically with the mutation
3. **Don't log if nothing changed** — `computeItemDiff` returns null for identical states; `logItemChange` skips the insert
4. **IGNORED_FIELDS are excluded from diffs** — `id`, `tenantId`, `createdAt`, `updatedAt`, `createdBy`, `updatedBy` are never logged as field changes

---

## 59. Receiving Frontend Architecture

### Pages

```
/inventory/receiving          → Receipt list (status/vendor/date filters, cursor pagination)
/inventory/receiving/[id]     → Receipt detail/edit (editable grid for draft, read-only for posted/voided)
```

### Key Components

| Component | Purpose |
|-----------|---------|
| `ReceiptHeader` | Vendor selector, receipt date, invoice number, shipping cost, freight mode |
| `ReceivingGrid` | Inline-editable data grid for receipt lines (qty, unitCost, UOM) |
| `EditableCell` | Click-to-edit cell — blur/Enter commits, Escape cancels |
| `ReceiptTotalsBar` | Sticky footer: subtotal, shipping, tax, grand total |
| `ItemSearchInput` | Barcode→SKU→name fallback search for adding lines |

### Pure Calculation Library

`apps/web/src/lib/receiving-calc.ts` contains pure functions with no side effects:

```typescript
// Line-level calculations
calcLineTotal(qty: number, unitCost: number): number;
calcLandedCost(extendedCost: number, allocatedShipping: number): number;
calcLandedUnitCost(landedCost: number, baseQty: number): number;

// Shipping allocation (client-side preview)
allocateShippingPreview(lines: ReceiptLine[], shippingCost: number, method: string): Map<string, number>;

// Receipt summary
calcReceiptSummary(lines: ReceiptLine[], shippingCost: number): { subtotal, shipping, total };
```

**Rule:** These are preview-only calculations. The server recomputes everything from scratch on post (Rule VM-5). Never trust client-computed values for business logic.

### Editor Hook

`use-receiving-editor` manages the full receipt editing state:
- Draft receipt CRUD (header + lines)
- Debounced auto-save (configurable delay)
- Optimistic line updates with rollback on error
- Tracks dirty state for unsaved changes warning

### Freight Modes

| Mode | Behavior |
|------|----------|
| `ALLOCATE` | Distributes `shippingCost` across lines proportionally (by extendedCost) — shipping is part of landed cost |
| `EXPENSE` | Books shipping as a separate GL expense — not included in item landed cost |

Added via migration 0064 (`freightMode` column on `receiving_receipts`, default `ALLOCATE`).

### Key Rules

1. **Client calculations are previews only** — server recomputes on post
2. **EditableCell commits on blur AND Enter** — never rely on only one trigger
3. **Freight mode affects landed cost** — ALLOCATE includes shipping in per-item cost; EXPENSE does not
4. **Debounced saves prevent excessive API calls** — but ensure the final save fires on unmount/navigate

---

## 60. Unified Stock UI in Catalog

### Architecture Decision

The app has two data domains that work together:
- `catalog_items` — central tenant-wide product catalog (one row per SKU, global template)
- `inventory_items` — per-location stock records (one per SKU per location, with location-specific config)

The Stock Levels page was deleted. All stock UI now lives in the catalog item detail page (`/catalog/items/[id]`), powered by the `StockSection` component. The data architecture is unchanged — only the UI was unified.

### Component: StockSection

Located at `apps/web/src/components/catalog/stock-section.tsx`.

Props: `{ catalogItemId: string; isTrackable: boolean }`

Contains:
- **Location selector** — for tenants with multiple locations
- **Stats cards** — On Hand (color-coded), Reorder Point, Par Level, Costing Method
- **Stock details grid** — Base Unit, Purchase Unit, Ratio, Reorder Qty, Allow Negative, Status
- **Action buttons** — Receive (blue), Adjust (gray), Record Shrink (red)
- **Movement history table** — Date, Type badge, Qty Delta (color-coded), Cost, Reference, Reason — with Load More pagination
- **Empty states** — "No inventory record at this location" when item exists in catalog but not at selected location; "Inventory tracking is disabled" when `isTrackable === false`

### Data Flow

```
StockSection
  → useInventoryForCatalogItem(catalogItemId, locationId)
    → GET /api/v1/inventory/by-catalog-item?catalogItemId=xxx&locationId=yyy
      → getInventoryItemByCatalogItem(tenantId, catalogItemId, locationId)
        → Returns InventoryItemDetail with computed on-hand, or null

  → useMovements(inventoryItemId)  // chained — only fetches once inventoryItemId is resolved
    → GET /api/v1/inventory/{inventoryItemId}/movements
```

### Extracted Dialogs

Three dialog components were extracted from the old stock detail page as reusable portal-based components:

| Component | File | Purpose |
|-----------|------|---------|
| `ReceiveDialog` | `apps/web/src/components/inventory/receive-dialog.tsx` | Record received inventory (qty, cost, business date) |
| `AdjustDialog` | `apps/web/src/components/inventory/adjust-dialog.tsx` | Adjust stock (delta qty, reason, business date) |
| `ShrinkDialog` | `apps/web/src/components/inventory/shrink-dialog.tsx` | Record shrink (qty, type, reason, business date) |

Each takes `{ open, onClose, inventoryItemId, onSuccess }`. Uses `createPortal` to `document.body`, z-50.

### Deleted Pages

| Page | Old Route | Replacement |
|------|-----------|-------------|
| Stock Levels list | `/inventory` | `/catalog` (Items list already shows On Hand + Reorder Pt columns) |
| Stock detail | `/inventory/[id]` | `/catalog/items/[id]` (StockSection at bottom of item detail) |

**Kept intact**: `/inventory/receiving/` routes, all inventory API routes.

### Key Rules

1. **Never create a separate Stock Levels page** — stock data belongs in the catalog item detail
2. **StockSection uses chained data fetching** — movements only load after inventoryItemId resolves
3. **Catalog Items list shows stock columns** — enriched via parallel inventory API call, not a database JOIN

---

## 61. POS Catalog Freshness

### Problem

POS terminals stay open for entire shifts (8+ hours). Without periodic refresh, items archived after the POS loaded remain visible. Tapping an archived item triggers a backend 404 ("Catalog item not found").

### Solution

The `useCatalogForPOS` hook has two freshness mechanisms:

1. **Periodic background refresh** — every 5 minutes (`REFRESH_INTERVAL_MS`), fetches fresh catalog from the API and updates state. No loading spinner shown.
2. **On-demand refresh via `onItemNotFound`** — `usePOS` detects 404 errors in `addItem` and calls the `onItemNotFound` callback. POS pages wire this to `catalog.refresh()` for immediate stale-item purge.

### Wiring

```typescript
// In retail-pos-content.tsx and fnb-pos-content.tsx:
const catalog = useCatalogForPOS(locationId);
const pos = usePOS(config, { onItemNotFound: catalog.refresh });
```

### Key Rules

1. **`useCatalogForPOS` must be declared BEFORE `usePOS`** — so `catalog.refresh` is available as the callback
2. **Background refresh is silent** — no toast or loading state on periodic refresh
3. **sessionStorage cache is 5 min TTL** — matches the refresh interval
4. **On initial load with cache**, items are displayed immediately from cache, then a background refresh replaces them with fresh data

---

## 62. Dashboard Data Fetching (React Query)

### Rule

The dashboard page uses **React Query** (`@tanstack/react-query`) for data fetching, not raw `useEffect` + `apiFetch`. This provides automatic AbortSignal cancellation on unmount, preventing slow dashboard API calls from blocking the browser connection pool during navigation.

### Pattern

```typescript
// In dashboard-content.tsx:
const { data, isLoading } = useQuery({
  queryKey: ['dashboard', 'metrics', locationId, today],
  queryFn: ({ signal }) =>
    apiFetch<{ data: T }>(url, { signal, headers }).then((r) => r.data),
  enabled: !!locationId,
  staleTime: 60_000,
});
```

### Key Rules

1. **Always use `({ signal })` pattern** — React Query passes an AbortSignal automatically; forward it to `apiFetch` for cancellation on unmount
2. **`QueryProvider` wraps the dashboard layout** — `apps/web/src/components/query-provider.tsx` with `staleTime: 30_000`, `gcTime: 5 * 60 * 1000`, `retry: 1`
3. **`apiFetch` handles AbortError gracefully** — `DOMException` with `name === 'AbortError'` is re-thrown without logging. All other network errors are logged.
4. **Never use raw `useEffect` + `apiFetch` for dashboard data** — the old pattern blocked navigation for up to 15 seconds because slow API calls held browser connections

---

## 63. Register Tab Customer Persistence

### Problem

When a user navigates away from POS and returns, the POS layout unmounts and remounts. During remount, tabs load from cache/server with `orderId` intact, but the order fetch is async — `pos.currentOrder` is temporarily `null`. A sync-back effect that watched `currentOrder` would detect `null` + truthy `orderId` and auto-clear the orderId, breaking the `tab → order → customer` chain.

### Rules

1. **orderId clearing is ONLY via `clearActiveTab()`** — never auto-clear in the sync-back effect. All order-clearing paths (payment complete, void, hold) already call `clearActiveTab()` explicitly.
2. **`clearActiveTab()` clears BOTH `orderId` and `label`** — the label contains the customer name and must be wiped when the order completes.
3. **Loading paths set `isSwitching = true`** — both cached-tabs and server-fetched-tabs loading paths block the sync-back effect during rehydration, releasing via `requestAnimationFrame`.
4. **Conditional `pos.setOrder(null)`** — during loading, only call `pos.setOrder(null)` if the active tab genuinely has no order. Otherwise leave it for the order fetch to populate.
5. **PATCH calls skip `pending-` tabs** — optimistic tabs haven't been persisted to the server yet, so PATCH/DELETE calls must check `!tab.id.startsWith('pending-')`.

### Customer Association Chain

```
RegisterTab.orderId → Order.customerId → Customer data
```

Breaking any link in this chain loses: loyalty tracking, receipts, CRM linkage, account billing.

---

## 64. POS Tender placeOrder Race Recovery

### Problem

TenderDialog fires a preemptive `placeOrder()` when it opens so the order is already placed by the time the user clicks Pay. However, a race condition exists: if the user clicks Pay before the preemptive promise updates `placedRef.current`, a second `placeOrder()` call is triggered, which gets a 409 "already placed" from the server.

### Solution (Defense in Depth)

1. **`placeOrder()` catches "already placed" 409** — in the `doPlace()` catch block, if the 409 is from placeOrder, fetch the order. If status is `'placed'`, return it as success instead of clearing POS state via `handleMutationError`.
2. **TenderDialog `handleSubmit` fallback** — wraps the `onPlaceOrder()` call in its own try-catch. On failure, re-fetches the order. If the order IS placed on the server, continues to the tender POST. Otherwise shows a retry error.
3. **`placeOrder()` deduplication** — `placingPromise.current` ensures concurrent calls share one API request. `order.status === 'placed'` check returns immediately for already-placed orders.

### Key Rules

1. **Never `setCurrentOrder(null)` on a placeOrder 409** — the order exists on the server; clearing it strands the user
2. **Always deduplicate placeOrder** — preemptive (dialog open) + handleSubmit (Pay click) must share the same promise
3. **TenderDialog manages its own version tracking** — `versionRef` and `currentVersion` state persist across dialog close/reopen for the same order via refs


---

## 65. Semantic Layer Architecture

### Module Location
`packages/modules/semantic/` — exported as `@oppsera/module-semantic`

### Sub-path exports (package.json `exports`)
| Import path | Contents |
|---|---|
| `@oppsera/module-semantic/llm` | `runPipeline`, LLM adapters, pipeline types |
| `@oppsera/module-semantic/compiler` | `compilePlan`, compiler types |
| `@oppsera/module-semantic/registry` | `buildRegistryCatalog`, `getLens`, registry cache |
| `@oppsera/module-semantic/evaluation` | Eval capture, feedback, queries, examples |
| `@oppsera/module-semantic/cache` | Query cache, rate limiter |
| `@oppsera/module-semantic/observability` | Per-tenant + global metrics |

### Pipeline Stages
```
message → intent resolver (LLM) → compiler → executor (SQL) → narrative (LLM) → eval capture
                                     ↓ error                       ↑
                                     └──── ADVISOR MODE ───────────┘  (narrative with null result)
```
Each stage is independently testable with mock adapters. The narrative stage always runs (even for 0-row results or compilation errors) — `buildEmptyResultNarrative()` is only a static fallback if the narrative LLM call itself fails.

### Cache Layers
1. **Registry cache** (in-memory): lenses + metric/dimension definitions. SWR: fresh <5min, stale-background-refresh 5-10min, sync refresh >10min.
2. **Query cache** (in-memory LRU): compiled SQL + params → result rows. 200-entry max, 5-min TTL, keyed by `djb2(tenantId|sql|params)`.

### Entitlement guard
All semantic routes use `{ entitlement: 'semantic', permission: 'semantic.query' }` in `withMiddleware`. The insights layout also checks `isModuleEnabled('semantic')` client-side for UI gating.

---

## 66. LLM Integration Conventions

### Adapter pattern
LLM calls go through `LLMAdapter` interface (`packages/modules/semantic/src/llm/adapters/`). The adapter is swappable via `setLLMAdapter()` — tests inject `MockLLMAdapter` without any real API calls.

### Never call LLM APIs directly
All LLM calls go through the adapter. Direct `fetch()` to Anthropic/OpenAI in module code is forbidden. Use `getLLMAdapter().complete(messages, options)`.

### Prompt engineering
- **Intent resolution** system prompt is built in `intent-resolver.ts` from field catalog + examples + lens fragment
- **Narrative** system prompt is built in `narrative.ts` via `buildNarrativeSystemPrompt()` — THE OPPS ERA LENS framework
- Few-shot examples come from `getExampleManager().getExamples()` (golden examples promoted by admin)
- Never hard-code tenant data or tenant IDs in prompts
- Narrative prompt includes metric definitions (`buildMetricContext()`), industry hints (`getIndustryHint()`), and active lens fragment

### API keys
- Stored in env var `ANTHROPIC_API_KEY` (or `OPENAI_API_KEY` for future providers)
- Never log API keys — adapters must strip them from error messages
- Rotate keys via env var change + redeploy; no DB storage

### Token budgets
- Intent resolution: 4,096 tokens output max
- Narrative generation: 2,048 tokens output max (THE OPPS ERA LENS produces structured responses)
- Total per request: ~8,000 tokens in + ~6,144 tokens out

### Intent resolver behavior
- Biased toward attempting queries: only clarifies when LLM genuinely cannot map ANY part to available metrics
- Ambiguous questions → best-effort plan with `confidence < 0.7`
- General business questions → plan with most relevant metrics, `confidence < 0.6`
- Default date range: last 7 days when none specified

---

## 67. Semantic Security Conventions

### SQL injection prevention
- The query compiler generates parameterized SQL only — values go into `params[]`, never string-concatenated
- Tenant isolation is enforced in the executor via `SET LOCAL app.current_tenant_id` + RLS
- The executor validates the compiled SQL is a SELECT (no DDL, DML)

### Rate limiting
- Per-tenant sliding window: 30 queries per 60 seconds (in-memory at Stage 1, Redis at Stage 2)
- Rate limit is checked in the `/ask` route handler before pipeline execution
- Returns 429 with `Retry-After` and `X-RateLimit-Reset` headers

### Admin routes
- `/api/v1/semantic/admin/*` requires `semantic.admin` permission
- Never expose raw SQL, tenant data, or LLM prompts in admin metrics

---

## 68. Chat UI Conventions (AI Insights)

### Component hierarchy
```
InsightsContent (insights-content.tsx)
  ├── flex h-[calc(100vh-64px)]        ← outer two-column layout
  │   ├── Chat column (flex-1 min-w-0)
  │   │   ├── Header (debug toggle, export, clear, sidebar toggles)
  │   │   ├── Loaded session banner (indigo, shows when viewing a recalled session)
  │   │   ├── Message area (overflow-y-auto, max-w-4xl mx-auto)
  │   │   │   ├── Empty state with suggested questions
  │   │   │   └── ChatMessageBubble (semantic/chat-message.tsx)
  │   │   │         ├── QueryResultTable
  │   │   │         ├── PlanDebugPanel (showDebug=true only)
  │   │   │         └── FeedbackWidget (insights/FeedbackWidget.tsx, evalTurnId required)
  │   │   │               └── RatingStars (insights/RatingStars.tsx)
  │   │   └── ChatInput (auto-resize, border-t)
  │   ├── Desktop sidebar (hidden lg:flex w-80, border-l)
  │   │   └── ChatHistorySidebar (insights/ChatHistorySidebar.tsx)
  │   └── Mobile overlay (fixed inset-0 z-30 lg:hidden)
  │       └── ChatHistorySidebar (with onClose prop)
```

### Chat history sidebar
The sidebar is an **inline flexbox peer** of the chat column, NOT a portal overlay. Both columns scroll independently.

**Responsive behavior:**
| Viewport | Behavior |
|---|---|
| Desktop (lg: 1024px+) | Persistent 320px inline panel, toggleable via `PanelRightOpen`/`PanelRightClose` icon |
| Mobile (< 1024px) | Hidden; `History` icon opens fixed overlay (z-30) with backdrop |

**State management:**
- `historyOpen` — desktop toggle, persisted in `localStorage('insights_history_open')`, default `true`
- `mobileHistoryOpen` — mobile overlay toggle, not persisted
- `activeDbSessionId` — highlights current session in sidebar
- `refreshKey` — counter incremented after `sendMessage`, triggers delayed sidebar refresh

**Session loading flow:**
1. User clicks session in sidebar → `handleSelectSession(dbSessionId)`
2. Fetch `GET /api/v1/semantic/sessions/:id` → receives session metadata + turns
3. Call `initFromSession(session.id, turns)` → resets chat to loaded conversation
4. Set `loadedSessionDate`, `loadedTurns`, `activeDbSessionId` for UI state
5. Close mobile overlay if open

**Sidebar refresh after send:**
After `sendMessage()` completes, increment `refreshKey`. `ChatHistorySidebar` detects the change via `useRefreshOnChange(key, refresh)` hook, which calls `refresh()` with a 1-second delay. The delay accounts for the async eval turn capture (fire-and-forget).

### `useSessionHistory` hook
Shared between `ChatHistorySidebar` and `/insights/history` page. Provides:
- `sessions: SessionSummary[]` — paginated session list
- `isLoading`, `isLoadingMore` — loading states
- `hasMore` — whether more pages exist
- `loadMore()` — fetch next page (cursor-based)
- `refresh()` — re-fetch page 1, reset cursor

Also exports `formatRelativeTime(isoDate)` — returns "Just now", "Xm ago", "Xh ago", "Yesterday", weekday, or "Mon DD".

### Session export
`exportSessionAsTxt(title, startedAt, turns)` in `lib/export-chat.ts` formats a conversation as plain text and triggers a browser download. Filename: `ai-insights-YYYY-MM-DD.txt`. Available from both the history page (per-session export button) and the insights header (for loaded sessions).

### FeedbackWidget states
- `idle` → thumbs up/down quick action
- `expanded` → 5-star + tag pills + textarea + submit
- `done` → "Thanks!" checkmark

### evalTurnId threading
The pipeline captures an eval turn and returns `evalTurnId` in `PipelineOutput`. The ask route exposes it in the response. `ChatMessage.evalTurnId` stores it. `FeedbackWidget` uses it to POST to `/api/v1/semantic/eval/turns/[id]/feedback`. If eval capture fails (DB unavailable), `evalTurnId` is null and the FeedbackWidget is hidden.

### Debug panel
Hidden by default, toggled by the debug button in the header. Shows intent plan JSON, compiled SQL, compilation errors, LLM latency, and cache status. Never shown in production to non-owners without explicit opt-in.

### `initFromSession()` and `LoadedTurn`
`useSemanticChat.initFromSession(dbSessionId, turns)` resets the session and maps each DB turn to a user+assistant message pair via `evalTurnToChatMessages()`. The `LoadedTurn` interface mirrors the API response from `GET /api/v1/semantic/sessions/[sessionId]` (subset of eval turn columns needed for chat reconstruction: userMessage, narrative, llmPlan, compiledSql, compilationErrors, resultSample, rowCount, cacheStatus, llmConfidence, llmLatencyMs, wasClarification, clarificationMessage, userRating, userThumbsUp, evalTurnId).

---

## 69. Observability Conventions (Semantic Module)

### Metrics tracking
`recordSemanticRequest()` is called at the end of every successful `runPipeline()`. It updates in-memory per-tenant metrics: request count, p50/p95 latency, cache hit rate, token usage, error rate.

### Percentile computation
Latency samples are stored in a rolling window (capped at 500 samples per tenant). Percentiles use sorted array + ceil index: `p95 = samples[ceil(0.95 * n) - 1]`.

### Admin metrics endpoint
`GET /api/v1/semantic/admin/metrics` returns global + per-tenant metrics. Requires `semantic.admin` permission. Returns `{ global: GlobalMetricsSummary, tenants: TenantMetricsSummary[] }`.

### Cache invalidation endpoint
`POST /api/v1/semantic/admin/invalidate` flushes registry cache, query cache, or both. Body: `{ scope: 'registry' | 'queries' | 'all', tenantId?: string }`. Use for deployments that change field definitions or lens configs.

---

## 70. Evaluation & Feedback Conventions

### Eval turn capture
Every pipeline run calls `captureEvalTurnBestEffort()` which is awaited but swallows errors (never blocks the response). Returns `string | null` — the new eval turn's ULID.

### User feedback
- Submitted via `POST /api/v1/semantic/eval/turns/[id]/feedback`
- Fields: `thumbsUp?: boolean`, `rating?: 1-5`, `tags?: FeedbackTag[]`, `text?: string`
- At least one field required (validated server-side)
- Users can only rate their own turns (enforced in `submitUserRating`)

### Quality score
Composite of 40% admin score + 30% user rating + 30% heuristics (flag deductions). Range: 0.00–1.00. Stored as `NUMERIC(3,2)` in `semantic_eval_turns.quality_score`. Recomputed on every feedback update.

### Eval feed
`GET /api/v1/semantic/eval/feed` returns paginated turn history for the current tenant. Used by the History page. Admin feed (cross-tenant) is only available via the admin app.

### Golden examples
Admins can promote high-quality turns to golden examples via `promoteToExample()`. Examples are loaded into the LLM prompt as few-shot demonstrations. The `ExampleManager` interface is swappable for testing.

---

## 71. Semantic Lens Conventions

### Lens types
- **System lenses**: `tenant_id IS NULL` — created via `sync-registry.ts` CLI or seed scripts. Not editable by tenants.
- **Tenant lenses**: `tenant_id = <id>` — created via the API. Override or extend system lenses for the tenant.

### Unique constraints (partial indexes)
```sql
-- One slug per system scope
UNIQUE (slug) WHERE tenant_id IS NULL
-- One slug per tenant scope
UNIQUE (tenant_id, slug) WHERE tenant_id IS NOT NULL
```

### Registry cache invalidation
After creating/updating/deleting a lens, call `POST /api/v1/semantic/admin/invalidate { scope: 'registry' }` to flush the cached field catalog. The cache auto-refreshes after 10 minutes (SWR window).

### Sync script
`packages/modules/semantic/src/sync/sync-registry.ts` — run via `pnpm --filter @oppsera/module-semantic semantic:sync` to upsert field definitions and system lenses into the DB. Use `SEMANTIC_DRY_RUN=true` for a preview.

---

## 72. Semantic Module Setup

### Provisioning
When creating a new tenant with the `semantic` entitlement, run the following:
1. Enable the `semantic` entitlement in `tenant_entitlements`
2. Grant default RBAC permissions from `SEMANTIC_ROLE_PERMISSIONS` in `setup/register-entitlements.ts`
3. Run `semantic:sync` to ensure system lenses are in the DB

### Event constants
Use `SEMANTIC_EVENT_TYPES` from `setup/register-events.ts` for all semantic event type strings. Never use raw string literals — typos are silent failures in event routing.

### Test mocking pattern
Pipeline tests must mock `../../cache/query-cache` and `../../observability/metrics` to prevent module-level state (Maps) from leaking between test runs:
```typescript
vi.mock('../../cache/query-cache', () => ({
  getFromQueryCache: vi.fn().mockReturnValue(null),
  setInQueryCache: vi.fn(),
}));
vi.mock('../../observability/metrics', () => ({
  recordSemanticRequest: vi.fn(),
}));
```
Eval capture must also be mocked to prevent real DB writes:
```typescript
vi.mock('../evaluation/capture', () => ({
  getEvalCaptureService: vi.fn().mockReturnValue({
    recordTurn: vi.fn().mockResolvedValue('mock-eval-turn-id'),
  }),
}));
```

---

## 73. Admin App Architecture

### Purpose
Platform operations panel for OppsEra internal admins. Used to review, audit, and improve the quality of AI-generated semantic layer responses. **NOT** tenant-scoped — uses `platformAdmins` table.

### Location
`apps/admin/` — separate Next.js app, port 3001.

### Auth Flow
```
POST /api/auth/login { email, password }
  → bcryptjs.compare(password, admin.passwordHash)
  → Create JWT (HS256, 8h TTL) via jose
  → Set HttpOnly cookie (oppsera_admin_session)
  → Middleware validates JWT on every request
```

### Role Hierarchy
```
viewer (1) → admin (2) → super_admin (3)
```
Checked via `requireRole(session, minRole)`. Viewers can browse, admins can review/promote, super_admins get full access.

### Route Protection Pattern
```typescript
export const POST = withAdminAuth(async (req, session, params) => {
  // session: { adminId, email, name, role }
  // handler logic
}, 'admin'); // minimum role required
```

### Pages
| Page | Path | Auth Level | Purpose |
|------|------|-----------|---------|
| Eval Feed | `/eval/feed` | viewer | Browse eval turns with filters |
| Turn Detail | `/eval/turns/[turnId]` | viewer | Full turn context + admin review form |
| Dashboard | `/eval/dashboard` | viewer | KPI cards + trend charts |
| Examples | `/eval/examples` | viewer/admin | Manage golden few-shot examples |
| Patterns | `/eval/patterns` | viewer | Identify recurring problem plan hashes |

### API Routes
12 endpoints under `/api/v1/eval/`: feed, turns/[id], turns/[id]/review (admin), turns/[id]/promote (admin), dashboard, examples, examples/[id] (admin delete), patterns, sessions/[id], tenants, compare, aggregation/trigger (admin).

### Components
`AdminSidebar`, `EvalTurnCard`, `QualityFlagPills`, `QualityKpiCard`, `VerdictBadge`, `RatingStars`, `PlanViewer` (JSON tree viewer), `SqlViewer` (SQL code viewer), `TenantSelector`.

### Key Integrations
- `@oppsera/module-semantic/evaluation` — all eval queries + commands
- `@oppsera/db` — `platformAdmins` table for login
- Charts: `recharts` (LineChart, BarChart for quality trends)

### Anti-Patterns
- Never share auth between admin app and tenant app — completely separate JWT + cookie systems
- Never expose admin endpoints via the tenant web app API routes
- Never store admin passwords in env vars — always use `platformAdmins` table with bcrypt hashes

---

## 74. THE OPPS ERA LENS — Narrative Framework

### Overview
THE OPPS ERA LENS is the universal SMB optimization framework that powers all AI narrative responses. It lives entirely in the system prompt built by `buildNarrativeSystemPrompt()` in `packages/modules/semantic/src/llm/narrative.ts`. The framework defines the AI's role, reasoning mode, response structure, and behavioral rules.

### Core Philosophy
The AI is a practical, data-driven SMB operator and advisor. It thinks in: revenue throughput, capacity utilization, labor efficiency, customer experience, ROI and payback. Every SMB operates with limited staff, imperfect data, time pressure, cash constraints, and operational variability. Tone: friendly, optimistic, practical, slightly quirky — uses first person plural ("we", "our").

### DATA-FIRST DECISION RULE
Priority chain for answering any question:
1. **REAL DATA** → query results are provided → analyze numbers, spot trends, flag anomalies
2. **ASSUMPTIONS** → partial data → combine with reasonable assumptions (always labeled)
3. **BEST PRACTICE** → no data → use industry benchmarks and operational heuristics

Never refuse a question. Never stall waiting for data. Every question gets a useful answer.

### Industry Translation
`getIndustryHint(lensSlug)` returns industry-specific translation hints injected into the system prompt:
- `golf*` → capacity = tee sheet utilization, revenue = yield per round, throughput = rounds played
- `core_items*` → capacity = shelf space, throughput = items sold, efficiency = sell-through rate
- `core_sales*` → capacity = covers or transactions, throughput = order count, efficiency = average ticket
- Default → general SMB operational language

### Adaptive Depth
| Mode | Trigger | Behavior |
|------|---------|----------|
| DEFAULT | Most responses | Concise, <400 words, skip sections that don't apply |
| DEEP | User requests detailed analysis, strategic decisions, multi-variable problems | Labeled `**Deep Analysis — THE OPPS ERA LENS**`, 3-5 options with comparison + risks + roadmap |
| QUICK WINS | User asks for fast improvements or urgent help | Labeled `**Quick Wins — THE OPPS ERA LENS**`, 5 immediate actions, minimal explanation |

### Response Structure (DEFAULT MODE)
```markdown
## Answer
[1-3 sentence direct answer. Lead with the number or insight.]

### Options
**Option 1: [Name]** — [What + why]. Effort: Low/Med/High. Impact: Low/Med/High.
**Option 2: [Name]** — [What + why]. Effort: Low/Med/High. Impact: Low/Med/High.
**Option 3: [Name]** — [What + why]. Effort: Low/Med/High. Impact: Low/Med/High.

### Recommendation
Best option: **[Name]** — [Why]. Confidence: XX%.

### Quick Wins
- [Action 1 — highest leverage first]
- [Action 2]
- [Action 3]

### ROI Snapshot
- Estimated cost: $X
- Potential monthly impact: $X
- Rough payback: X weeks/months

### What to Track
- [Metric 1]
- [Metric 2]

### Next Steps
[1-2 follow-up topics + smart questions. End with friendly close.]

---
*THE OPPS ERA LENS. [Metrics used]. [Period]. [Assumptions if any.]*
```

Sections are OPTIONAL — for simple data questions (e.g., "what were sales yesterday?"), skip Options/Recommendation and just answer + quick wins + what to track.

### NarrativeSection Types
The markdown parser (`parseMarkdownNarrative`) maps heading text to section types:

| Heading | Section Type |
|---------|-------------|
| `Answer` | `answer` |
| `Options` | `options` |
| `Recommendation` / `Recommendations` | `recommendation` |
| `Quick Wins` | `quick_wins` |
| `ROI Snapshot` | `roi_snapshot` |
| `What to Track` / `Metrics` | `what_to_track` |
| `Next Steps` / `Conversation Driver` | `conversation_driver` |
| `Assumptions` | `assumptions` |
| `Key Takeaways` / `Takeaways` | `takeaway` |
| `What I'd Do Next` | `action` |
| `Risks to Watch` / `Risks` | `risk` |
| `Caveats` | `caveat` |
| `Deep Analysis — THE OPPS ERA LENS` | `answer` |
| `Quick Wins — THE OPPS ERA LENS` | `quick_wins` |
| Unmapped headings | `detail` |
| `*THE OPPS ERA LENS. ...*` footer | `data_sources` |

### Metric Context Injection
`buildMetricContext(metricDefs)` injects metric definitions into the system prompt so the LLM understands each metric:
```
## Metrics in This Query
- **Net Sales** (`net_sales`): Total net sales. Higher is better. Format: $0,0.00
- **Order Count** (`order_count`): Number of orders. Higher is better. Format: integer
```

### Behavioral Rules
1. **Never refuse** — every question gets a useful answer
2. **Lead with the answer** — don't start with "Based on the data..."
3. **Be specific with numbers** — $X,XXX.XX for currency, X.X% for percentages
4. **Operator mindset** — connect data to decisions (staffing, pricing, scheduling)
5. **Token efficient** — under 400 words for DEFAULT mode
6. **Don't parrot raw data** — interpret it ("$12,400 — solid for a Tuesday, about 8% above average")
7. **Options are optional** — skip for simple data questions
8. **Industry translation** — translate recommendations into the user's industry language

### Modifying THE OPPS ERA LENS
When updating the lens framework:
1. Edit `buildNarrativeSystemPrompt()` in `narrative.ts`
2. If adding new section types: update `NarrativeSection.type` in `types.ts`
3. If adding new heading variants: update `HEADING_TO_SECTION` in `narrative.ts`
4. Add parser tests in `pipeline.test.ts` for any new section types
5. Run `pnpm --filter @oppsera/module-semantic test` to verify

## 75. Room Layout Builder Architecture

### Overview

Room Layout Builder is a standalone module (`packages/modules/room-layouts/`) providing a full drag-and-drop floor plan editor for restaurant/golf/hybrid venues. It uses a draft-publish version control model with Konva.js canvas rendering and Zustand state management.

### Database (3 tables)

| Table | Purpose |
|---|---|
| `floor_plan_rooms` | Room metadata, dimensions, active/archived, currentVersionId, draftVersionId |
| `floor_plan_versions` | Immutable version snapshots (draft/published/archived), JSONB snapshotJson |
| `floor_plan_templates_v2` | Reusable template snapshots with category (dining/banquet/bar/patio/custom) |

Schema: `packages/db/src/schema/room-layouts.ts`, Migration: `packages/db/migrations/0070_room_layouts.sql`

### Version Control Model

```
saveDraft() → creates/updates draft version → room.draftVersionId
publishVersion() → archives old published, promotes draft → room.currentVersionId, clears draftVersionId
revertToVersion() → loads old snapshot → saves as new draft
```

- Versions are immutable (append-only history)
- `getRoomForEditor` prefers draft over published for loading
- `handlePublish` in editor always saves draft first (even if `isDirty=false`)

### Backend Commands & Queries

**11 commands:** createRoom, updateRoom, archiveRoom, unarchiveRoom, saveDraft (no idempotency — autosave), publishVersion, revertToVersion, duplicateRoom (reassigns all object/layer ULIDs), createTemplate, updateTemplate, deleteTemplate, applyTemplate

**7 queries:** listRooms, getRoom, getRoomForEditor, getVersionHistory, getVersion, listTemplates, getTemplate

**8 events emitted** (no consumers): room created/updated/archived/restored, version saved/published/reverted, template created

### API Routes (17 total)

All under `/api/v1/room-layouts/`:
- Room CRUD: `GET /`, `POST /`, `GET /:roomId`, `PATCH /:roomId`, `DELETE /:roomId`
- Editor: `GET /:roomId/editor`, `PUT /:roomId/draft`, `POST /:roomId/publish`, `POST /:roomId/revert`, `POST /:roomId/duplicate`
- Versions: `GET /:roomId/versions`, `GET /:roomId/versions/:versionId`
- Templates: `GET /templates`, `POST /templates`, `PATCH /templates/:templateId`, `DELETE /templates/:templateId`, `POST /templates/:templateId/apply`

Permissions: `room_layouts.view` (read), `room_layouts.manage` (write)

### Frontend Architecture

**Zustand Store** (`apps/web/src/stores/room-layout-editor.ts`):
- Room metadata, canvas objects, layers, selection, tool state, undo/redo (50 entries), viewport (zoom/pan), persistence tracking (isDirty, lastSavedAt, isSaving)
- `loadFromSnapshot()` initializes from API, `getSnapshot()` serializes for save
- Stage ref stored module-level (not in Zustand) for Konva PNG export

**Hooks** (`apps/web/src/hooks/use-room-layouts.ts`):
- `useRoomLayouts(options)` — room list with cursor pagination
- `useRoomEditor(roomId)` — editor data loader (single instance per page)
- `useRoomTemplates(filters)` — template list
- `useRoomLayoutAutosave()` — 3s debounce autosave watching isDirty

**34 components** across:
- Editor: shell, toolbar, palette, inspector, layers, canvas, status bar, align tools, color picker, version history
- Canvas objects: table, wall, door, text, service zone, station, generic (+ grid, selection box, snap guides, transform handler, context menu)
- Dialogs: create room, edit room, duplicate room, publish, mode manager
- Templates: save-as-template, template gallery (with SVG thumbnails), apply template

### Key Rules

1. **Always one `useRoomEditor` call per page** — duplicate calls create independent hook instances; the second instance's data never reaches the first
2. **Publish always saves draft first** — even when `isDirty=false`, `draftVersionId` may be null after a prior publish
3. **`applyTemplateApi` sends roomId in body** — route is `/templates/:templateId/apply`, roomId is in the POST body
4. **`createRoomFromTemplateApi` is two-step** — create blank room with template dimensions, then apply template snapshot (backend `createRoom` has no template support)
5. **All backgrounds use `bg-surface`** — no `bg-white` or `dark:` prefixed classes; hover states use opacity-based colors (`hover:bg-gray-200/50`)
6. **Objects store position in feet, dimensions in pixels** — `x`/`y` are room coordinates (feet), `width`/`height` are pixels. Convert with `scalePxPerFt`.
7. **`reassignObjectIds()` on duplicate** — generates new ULIDs for all objects and layers, preserving layerId references
8. **Default layer ID is `'default'`** — always exists, cannot be deleted

---

## 76. Accounting Core / GL Architecture

### Overview

The Accounting Core module (`packages/modules/accounting/`) provides double-entry General Ledger, Chart of Accounts, GL account mappings, financial reporting, and period close workflows. All other financial modules (AP, AR, POS) post to the GL through a singleton API — they never import the accounting module directly.

### Money Representation

GL amounts are **NUMERIC(12,2) in dollars** (strings in TypeScript). This is different from the orders/payments layer (INTEGER cents). Convert at boundaries:

```typescript
// POS adapter: cents → dollars for GL posting
const dollarAmount = (amountCents / 100).toFixed(2);

// Query result: dollar string → number for frontend
const balance = Number(row.balance);
```

### Database (9 core + 4 mapping + 2 statement tables)

| Table | Purpose |
|---|---|
| `gl_accounts` | Chart of Accounts (account number, type, normal balance, control account flags) |
| `gl_classifications` | Account groupings (Current Assets, Long-term Liabilities, etc.) |
| `gl_journal_entries` | Journal headers (status, source module, posting period, business date) |
| `gl_journal_lines` | Debit/credit lines (account, amounts, dimension tags) |
| `gl_journal_number_counters` | Atomic sequential numbering per tenant |
| `accounting_settings` | One row per tenant (currency, fiscal year, control account defaults, feature toggles) |
| `gl_unmapped_events` | Tracks missing GL mappings encountered during posting |
| `gl_account_templates` | System-level seed data for tenant COA bootstrap |
| `gl_classification_templates` | System-level seed data for classification bootstrap |
| `sub_department_gl_defaults` | Maps catalog sub-departments → revenue/COGS/inventory GL accounts |
| `payment_type_gl_defaults` | Maps payment types → cash/clearing/fee GL accounts |
| `tax_group_gl_defaults` | Maps tax groups → tax payable GL accounts |
| `bank_accounts` | Registry linking physical banks to GL accounts |
| `accounting_close_periods` | Month-end close tracking (open/in_review/closed) |
| `financial_statement_layouts` | Tenant-configurable P&L and balance sheet structure |
| `financial_statement_layout_templates` | System-level statement layout seeds |

Schema: `packages/db/src/schema/accounting.ts`, `packages/db/src/schema/accounting-mappings.ts`
Migrations: `0071_accounting_core.sql` through `0077_financial_statements.sql`

### Double-Entry Posting Rules

Every journal entry must satisfy: **sum(debits) === sum(credits)**

```
Normal Balances:
  Assets    → Debit  (increases with debits)
  Expenses  → Debit  (increases with debits)
  Liabilities → Credit (increases with credits)
  Equity      → Credit (increases with credits)
  Revenue     → Credit (increases with credits)
```

The posting engine auto-corrects rounding within `roundingToleranceCents` (default 5) by appending a rounding line to `defaultRoundingAccountId`. Beyond tolerance → `UnbalancedJournalError`.

### AccountingPostingApi — Cross-Module GL Access

Defined in `@oppsera/core/helpers/accounting-posting-api.ts`. This is how AP, AR, and the POS adapter post to GL without importing `@oppsera/module-accounting`:

```typescript
interface AccountingPostingApi {
  postEntry(ctx: RequestContext, input: AccountingPostJournalInput):
    Promise<{ id: string; journalNumber: number; status: string }>;
  getAccountBalance(tenantId: string, accountId: string, asOfDate?: string):
    Promise<number>;
  getSettings(tenantId: string):
    Promise<{ defaultAPControlAccountId: string | null; defaultARControlAccountId: string | null; baseCurrency: string }>;
}
```

**Singleton pattern**: `setAccountingPostingApi(api)` called once in `apps/web/src/lib/accounting-bootstrap.ts`, wired in `instrumentation.ts`. Retrieved via `getAccountingPostingApi()`.

### Journal Entry Idempotency

The unique partial index `(tenantId, sourceModule, sourceReferenceId) WHERE sourceReferenceId IS NOT NULL` prevents duplicate GL postings from adapters/bridges. The posting engine checks this index and returns the existing entry instead of double-posting.

### Control Account Enforcement

GL accounts with `isControlAccount = true` and a `controlAccountType` (ap, ar, sales_tax, undeposited_funds, bank) restrict which `sourceModule` values can post to them. Manual entries to control accounts require the `accounting.control_account.post` permission.

### Posting Period Locking

`accounting_settings.lockPeriodThrough` (YYYY-MM) prevents posting into locked periods. The close workflow transitions periods through: open → in_review → closed.

### GL Mapping Resolution

The mapping engine resolves POS entities to GL accounts:

```typescript
resolveSubDepartmentAccounts(tx, tenantId, subDepartmentId): Promise<SubDeptGL | null>
resolvePaymentTypeAccounts(tx, tenantId, paymentTypeId): Promise<PaymentTypeGL | null>
resolveTaxGroupAccount(tx, tenantId, taxGroupId): Promise<string | null>
```

Returns `null` if mapping missing — callers log to `gl_unmapped_events` via `logUnmappedEvent()`.

### GL Mapping Frontend

The mapping UI at `/accounting/mappings` provides a 4-tab interface:
- **Sub-Departments**: enriched query joining `catalog_categories` + `sub_department_gl_defaults` + `gl_accounts`, with AccountPicker dropdowns per account type
- **Payment Types**: rows from `payment_type_gl_defaults` with cash/clearing/fee account pickers
- **Tax Groups**: rows from `tax_group_gl_defaults` with tax payable account picker
- **Unmapped Events**: list from `gl_unmapped_events` with resolve action

**Flexible hierarchy support**: `getSubDepartmentMappings` adapts to both 2-level (Department → Items) and 3-level (Department → SubDepartment → Category → Items) catalog hierarchies via `COALESCE(parent_id, id)`. In 2-level mode, departments themselves are the mappable entities. The frontend auto-detects flat vs grouped rendering.

Key queries:
- `getSubDepartmentMappings(tenantId)` — enriched list with dept names, item counts, GL account display strings
- `getItemsBySubDepartment(tenantId, subDepartmentId)` — drill-down with cursor pagination
- Coverage API computes totals from catalog hierarchy (not just mapping table rows)

### POS Posting Adapter

`handleTenderForAccounting(event: EventEnvelope)` consumes `tender.recorded.v1` events:

```
GL Entry (Retail Sale):
  Debit:  Cash/Card/Undeposited Funds (from payment type mapping) — tender amount
  Credit: Revenue accounts (from sub-department mapping, one per dept) — line amounts
  Credit: Sales Tax Payable (from tax group mapping) — tax amounts
  If enableCogsPosting:
    Debit:  COGS (from sub-department) — cost amounts
    Credit: Inventory Asset (from sub-department) — cost amounts
```

**Critical**: The POS adapter **never blocks tenders**. If any GL mapping is missing, it skips the GL post, logs to `gl_unmapped_events`, and emits `accounting.posting.skipped.v1`. POS must always succeed.

#### Catalog → GL Pipeline (Subdepartment Resolution)

The full pipeline from catalog item to GL posting:

1. **At `addLineItem` time**: `posItem.subDepartmentId` (resolved via `COALESCE(cat.parent_id, cat.id)`) is snapshotted on the `order_lines` row along with `taxGroupId`. For package items, each component's `subDepartmentId` is resolved in parallel via `catalogApi.getSubDepartmentForItem()` and stored in the `packageComponents` JSONB.

2. **At `recordTender` time**: the enriched `lines[]` array is built from `order_lines` and included in the `tender.recorded.v1` event payload. Each line includes `subDepartmentId`, `taxGroupId`, `taxAmountCents`, `costCents`, and `packageComponents`.

3. **In the POS adapter**: for regular items, revenue is grouped by `line.subDepartmentId`. For packages with enriched components (`allocatedRevenueCents != null`), revenue is split across component subdepartments using the pre-computed allocation. Legacy packages without allocations fall back to line-level subdepartment.

**Field name compatibility**: the event includes both `tenderType` and `paymentMethod` (alias). The adapter resolves via `data.tenderType ?? data.paymentMethod ?? 'unknown'`.

**Utility helpers** in `packages/modules/accounting/src/helpers/catalog-gl-resolution.ts`:
- `resolveRevenueAccountForSubDepartment(db, tenantId, subDeptId)` — wraps `resolveSubDepartmentAccounts`, returns revenue account ID
- `expandPackageForGL(line)` — splits a line into per-subdepartment `GLRevenueSplit[]` entries

### Financial Statements

| Query | Purpose |
|---|---|
| `getProfitAndLoss` | Revenue - Expenses by classification for date range, optional location filter, comparative period |
| `getBalanceSheet` | A/L/E cumulative balances as-of date, includes current-year net income in equity |
| `getSalesTaxLiability` | Tax collected vs remitted by tax group |
| `getCashFlowSimplified` | Net income + AP change - AR change |
| `getPeriodComparison` | Two periods side-by-side with variance $ and % |
| `getFinancialHealthSummary` | Dashboard KPIs: net income, AP/AR/cash balances, trial balance status |

### GL Balance Calculation Patterns

```sql
-- Revenue (credit-normal): credit_amount - debit_amount
-- Expense (debit-normal): debit_amount - credit_amount
-- Assets (debit-normal): debit_amount - credit_amount
-- Liabilities (credit-normal): credit_amount - debit_amount
CASE WHEN a.normal_balance = 'debit'
  THEN SUM(jl.debit_amount) - SUM(jl.credit_amount)
  ELSE SUM(jl.credit_amount) - SUM(jl.debit_amount)
END AS balance
```

### Retained Earnings

Year-end close creates a journal entry closing all revenue/expense accounts to the Retained Earnings account. The balance sheet includes current-year net income in equity (computed live, not stored) for periods before the formal close.

### Close Checklist

Computed live from queries (not stored):
1. Open draft journal entries (should be 0)
2. Unresolved unmapped events (should be 0)
3. Trial balance in balance
4. AP subledger reconciled to GL control
5. AR subledger reconciled to GL control

### Key Commands

| Command | GL Effect |
|---|---|
| `postJournalEntry` | Core engine — validates, numbers, posts/drafts |
| `postDraftEntry` | Transitions draft → posted |
| `voidJournalEntry` | Creates reversal entry (debits↔credits swapped), marks original voided |
| `saveStatementLayout` | Create/update configurable statement sections |
| `generateRetainedEarnings` | Year-end close: closes revenue/expense to RE account |
| `bootstrapTenantAccounting` | Copies COA template for business type, creates settings row |

### Key Rules

1. **Never write GL tables directly** — always use `postJournalEntry()` or `AccountingPostingApi.postEntry()`
2. **Posted journal entries are immutable** — corrections via void + reversal only
3. **Currency is locked to USD** — posting engine rejects non-USD with `CurrencyMismatchError`
4. **GL amounts are dollars (NUMERIC(12,2))**, not cents
5. **postgres.js returns strings for numeric columns** — always `Number()` in query mappings
6. **`forcePost: true`** bypasses draft mode — used by automated adapters (POS, AP, AR)
7. **`hasControlAccountPermission: true`** in bootstrap wiring bypasses control account checks for system posting

---

## 77. Accounts Payable (AP) Architecture

### Overview

The AP module (`packages/modules/ap/`) manages vendor bills, payments, vendor credits, and payable tracking. It posts to the GL via `AccountingPostingApi` — never imports `@oppsera/module-accounting` directly.

### Database (5 tables + vendor extensions)

| Table | Purpose |
|---|---|
| `ap_bills` | Vendor invoices (status lifecycle, denormalized balanceDue) |
| `ap_bill_lines` | Line items with lineType (expense/inventory/asset/freight) |
| `ap_payments` | Payments to vendors (bank account, payment method) |
| `ap_payment_allocations` | Junction: payments → bills (composite PK) |
| `ap_bill_landed_cost_allocations` | Freight distribution to inventory lines |
| `vendors` (extended) | Added: vendorNumber, defaultExpenseAccountId, defaultAPAccountId, paymentTermsId, is1099Eligible |

Schema: `packages/db/src/schema/ap.ts`
Migration: `0074_accounts_payable.sql`

### Bill Lifecycle

```
draft → posted → partial → paid
                ↘ voided (only if no allocations)
```

### GL Posting Patterns

**Post Bill** (Dr Expense, Cr AP Control):
```
For each bill line:
  Debit: line.accountId (expense/inventory/asset) — line.amount
Credit: AP control account — bill.totalAmount
  (vendor.defaultAPAccountId ?? settings.defaultAPControlAccountId)

sourceModule: 'ap', sourceReferenceId: bill.id
```

**Post Payment** (Dr AP Control, Cr Bank):
```
Debit: AP control account — payment.amount
Credit: Bank GL account (from bankAccountId → bank_accounts.glAccountId)

sourceModule: 'ap', sourceReferenceId: payment.id
```

**Vendor Credit** (negative bill):
```
Stored as bill with negative totalAmount/balanceDue.
GL: Debit AP control, Credit expense accounts (reverses normal bill posting)
Applied against future bills via allocation.
```

**Void Bill** (reversal entry — debits↔credits flipped):
```
For each original line:
  Credit: line.accountId — line.amount (reverses original debit)
Debit: AP control — bill.totalAmount (reverses original credit)

Pre-condition: No payment allocations exist. BillHasPaymentsError if any.
```

### Denormalized Balance Tracking

```typescript
// Updated inside transaction when payment posted:
bill.amountPaid += alloc.amountApplied
bill.balanceDue = bill.totalAmount - bill.amountPaid
bill.status = (balanceDue <= 0) ? 'paid' : 'partial'
```

**Never recompute from allocations in hot paths** — use the denormalized columns. All updates happen atomically in the same transaction as the GL posting.

### AP Control Account Resolution Order

1. `vendor.defaultAPAccountId` (vendor-specific)
2. `settings.defaultAPControlAccountId` (tenant default)
3. Error if neither configured

### Aging Buckets

Current (not yet due) | 1-30 days | 31-60 days | 61-90 days | 90+ days past due. Based on `dueDate`, not `billDate`. Uses denormalized `balanceDue` directly.

### Vendor Ledger

Union query: bills (debits increase payable) + payments (credits decrease payable), ordered by date with running balance. Cursor-paginated.

### Key Error Classes

| Error | Code | HTTP | When |
|---|---|---|---|
| `BillStatusError` | BILL_STATUS_ERROR | 409 | Wrong status for operation |
| `DuplicateBillNumberError` | DUPLICATE_BILL_NUMBER | 409 | Same vendor+billNumber |
| `BillTotalMismatchError` | BILL_TOTAL_MISMATCH | 400 | Lines don't sum to totalAmount |
| `PaymentExceedsBillError` | PAYMENT_EXCEEDS_BILL | 400 | Allocation > balanceDue |
| `BillHasPaymentsError` | BILL_HAS_PAYMENTS | 409 | Cannot void billed with allocations |

### Key Rules

1. **Vendors table is shared** — AP extends the existing vendors table from inventory/receiving via ALTER TABLE. Never recreate.
2. **Void requires zero allocations** — must void payments first, then void the bill
3. **Vendor credits are negative bills** — reuses bill table + allocation logic
4. **AP amounts are NUMERIC(12,2) in dollars** — same as GL, different from orders (cents)
5. **Bill line `lineType` drives posting behavior** — expense/inventory/asset/freight each debit different account categories
6. **`toFixed(2)` at UPDATE time** — prevents floating-point drift in denormalized fields

---

## 78. Accounts Receivable (AR) Architecture

### Overview

The AR module (`packages/modules/ar/`) manages customer invoices, receipt processing, and receivable tracking. It bridges from existing operational AR tables (`ar_transactions`, `billing_accounts` from Session 16) into GL control accounts — not a parallel system.

### Database (4 tables)

| Table | Purpose |
|---|---|
| `ar_invoices` | Formal invoices (membership, events, manual, POS house account) |
| `ar_invoice_lines` | Revenue lines with GL account + optional tax group |
| `ar_receipts` | Customer payments against invoices |
| `ar_receipt_allocations` | Junction: receipts → invoices (composite PK) |

Schema: `packages/db/src/schema/ar.ts`
Migration: `0076_accounts_receivable.sql`

### Invoice Lifecycle

```
draft → posted → partial → paid
                ↘ voided (only if no allocations)
```

### GL Posting Patterns

**Post Invoice** (Dr AR Control, Cr Revenue):
```
Debit: AR control account — invoice.totalAmount
  (settings.defaultARControlAccountId — no customer-specific override)
For each invoice line:
  Credit: line.accountId (revenue GL account) — line.amount

sourceModule: 'ar', sourceReferenceId: invoice.id
```

**Post Receipt** (Dr Cash/Bank, Cr AR Control):
```
Debit: Bank GL account (from bankAccountId → bank_accounts.glAccountId)
Credit: AR control account — receipt.amount

sourceModule: 'ar', sourceReferenceId: receipt.id
```

**Void Invoice** (reversal entry):
```
Credit: AR control — invoice.totalAmount (reverses original debit)
For each line:
  Debit: line.accountId — line.amount (reverses original credit)

Pre-condition: No receipt allocations exist.
```

### Denormalized Balance Tracking

Same pattern as AP:
```typescript
invoice.amountPaid += alloc.amountApplied
invoice.balanceDue = invoice.totalAmount - invoice.amountPaid
invoice.status = (balanceDue <= 0) ? 'paid' : 'partial'
```

### Source Types

Invoices track their origin via `sourceType`:
- `manual` — operator-created invoices
- `membership` — auto-generated from membership billing
- `event` — event deposit invoices
- `pos_house_account` — bridged from POS house account charges

Receipts track origin via `sourceType`:
- `manual` — operator-entered payments
- `pos_tender` — bridged from POS tender for house account
- `online_payment` — future online payment gateway

### AR Reconciliation

Compares AR subledger to GL control account:
```
AR Subledger = SUM(invoices.totalAmount WHERE status IN posted/partial/paid)
             - SUM(receipts.amount WHERE status = posted)
GL AR        = Balance of AR control account from gl_journal_lines
Difference   = GL - Subledger (should be ~0)
```

### Aging Buckets

Same as AP: Current | 1-30 | 31-60 | 61-90 | 90+ days past due. Based on invoice `dueDate`. Uses denormalized `balanceDue`.

### Customer Ledger

Union query: invoices (increase AR) + receipts (decrease AR, shown as negative), ordered by date with running balance + opening/closing balance.

### Bridge Adapter

`bridgeArTransaction()` takes existing `ar_transactions` rows and creates corresponding `ar_invoices`/`ar_receipts` + GL entries. Idempotent via `sourceReferenceId`. This bridges the operational AR (house accounts from Session 16) into the accounting GL.

### Key Rules

1. **AR bridges existing operational AR** — does not replace `ar_transactions`/`billing_accounts` from Session 16
2. **AR control account is tenant-level only** — no customer-specific control accounts (unlike AP which has vendor-level)
3. **Void requires zero allocations** — must void receipts first, then void the invoice
4. **Invoice numbers are unique per tenant** — not per customer
5. **AR amounts are NUMERIC(12,2) in dollars** — same as GL and AP

---

## 79. Subledger Reconciliation Pattern

### How It Works

Both AP and AR maintain a parallel balance to the GL control account. The reconciliation query compares them:

```
GL Control Balance = SUM(debit_amount - credit_amount) for control account lines
Subledger Balance  = SUM(bills/invoices) - SUM(payments/receipts)
Difference         = GL - Subledger
isReconciled       = Math.abs(difference) < 0.01
```

### When They Diverge

Common causes:
- Manual journal entry posted to control account (bypasses subledger)
- Bill/invoice voided but GL reversal failed
- Bridge adapter has unprocessed transactions
- Rounding differences from multi-allocation payments

### Close Checklist Integration

Period close checks reconciliation automatically. If `difference >= $0.01`, the checklist item fails and the period cannot be closed.

---

## 80. Cross-Module Financial Posting Patterns

### Module → GL Flow

```
POS Tender        → handleTenderForAccounting()               → AccountingPostingApi.postEntry()
POS Void          → handleOrderVoidForAccounting()             → voidJournalEntry() per tender
Line-Item Return  → handleOrderReturnForAccounting()           → AccountingPostingApi.postEntry()
F&B Batch Close   → handleFnbGlPostingForAccounting()          → AccountingPostingApi.postEntry()
Voucher Purchase  → handleVoucherPurchaseForAccounting()        → AccountingPostingApi.postEntry()
Voucher Redeem    → handleVoucherRedemptionForAccounting()      → AccountingPostingApi.postEntry()
Voucher Expire    → handleVoucherExpirationForAccounting()      → AccountingPostingApi.postEntry()
Membership Bill   → handleMembershipBillingForAccounting()      → AccountingPostingApi.postEntry()
Chargeback Recv   → handleChargebackReceivedForAccounting()     → AccountingPostingApi.postEntry()
Chargeback Resolve→ handleChargebackResolvedForAccounting()     → AccountingPostingApi.postEntry()
AP Bill           → postBill()                                  → AccountingPostingApi.postEntry()
AP Payment        → postPayment()                               → AccountingPostingApi.postEntry()
AR Invoice        → postInvoice()                               → AccountingPostingApi.postEntry()
AR Receipt        → postReceipt()                               → AccountingPostingApi.postEntry()
```

### Synthetic RequestContext for Automated Posting

Adapters that run outside user requests (event consumers) create a synthetic context:

```typescript
const syntheticCtx: RequestContext = {
  tenantId: event.tenantId,
  user: { id: 'system', email: 'system@oppsera.com', role: 'system' },
  requestId: `pos-gl-${tenderId}`,
};
```

### GL Entry `sourceModule` Values

| Value | Origin |
|---|---|
| `manual` | User-created journal entries |
| `pos` | POS posting adapter (tender → GL) |
| `pos_legacy` | Legacy bridge adapter (payment_journal_entries migration) |
| `pos_void` | Void posting adapter (order void → reversal GL) |
| `pos_return` | Return posting adapter (line-item return → GL) |
| `fnb` | F&B posting adapter (batch close → GL) |
| `voucher` | Voucher posting adapter (purchase/redeem/expire → GL) |
| `membership` | Membership billing posting adapter |
| `chargeback` | Chargeback posting adapter (received/won/lost → GL) |
| `ap` | AP bills and payments |
| `ar` | AR invoices and receipts |
| `payroll` | Future: payroll posting |

### Idempotency

All automated postings use `sourceReferenceId` (bill.id, invoice.id, tender.id). The unique partial index on `(tenantId, sourceModule, sourceReferenceId) WHERE sourceReferenceId IS NOT NULL` prevents double-posting. The posting engine returns the existing entry if a duplicate is detected.

---

## 81. Auth Troubleshooting (Vercel / Supabase)

Three issues that can stack to create a login redirect loop on Vercel:

### Issue 1: Seeded users don't exist in Supabase Auth
The seed script creates users in the app's `users` table but NOT in Supabase Auth (`auth.users`). Locally with `DEV_AUTH_BYPASS=true`, the `DevAuthAdapter` bypasses Supabase entirely so it works fine. On Vercel (production), `SupabaseAuthAdapter` calls `supabase.auth.signInWithPassword()` which checks Supabase Auth — users won't exist there. Use the `/api/v1/auth/link-account` endpoint (or `supabase.auth.admin.createUser()`) to create the Supabase Auth account and update `authProviderId` in the `users` table.

### Issue 2: `validateToken()` swallowing DB errors as 401s
On Vercel cold starts, DB connection timeouts can occur. If `validateToken()` catches ALL errors and returns `null`, DB timeouts become false 401s, which clear tokens and bounce users to login. The catch block must ONLY return `null` for `jwt.JsonWebTokenError` and `jwt.TokenExpiredError`. All other errors must be re-thrown so middleware returns 500, not 401.

### Issue 3: `login()` not waiting for `/api/v1/me`
The login function must await the `/api/v1/me` call (with retries) BEFORE returning. If it fires `fetchMe()` as fire-and-forget, `router.push('/dashboard')` executes with `user=null` and the dashboard redirects back to `/login`. Use an inline await-based retry (not `setTimeout`).

### Prevention
- **Local dev**: Use `npx supabase start` for a fully local Postgres + Auth stack, or keep `DEV_AUTH_BYPASS=true` and avoid re-seeding the remote DB
- **`authProviderId`**: Must match the Supabase Auth user's UUID (`sub` claim in JWT). Seeded users have null `authProviderId` — they must be linked before Vercel login works
- **Diagnostic endpoint**: `/api/v1/auth/debug` has been disabled (returns 410 Gone). Use Supabase admin CLI or dashboard for auth troubleshooting.

---

## 82. Frontend Query String Helper

All frontend data hooks use `buildQueryString()` from `apps/web/src/lib/query-string.ts` instead of inline `URLSearchParams`:

```typescript
import { buildQueryString } from '@/lib/query-string';

// Returns '?vendorId=abc&status=posted' or '' if all values are empty/null/undefined
const qs = buildQueryString({ vendorId, status, startDate, endDate });
return apiFetch<{ data: T[] }>(`/api/v1/ap/bills${qs}`);
```

Rules:
- Skips `undefined`, `null`, and `''` values
- Booleans: only appends if `true` (as string `'true'`), skips `false`
- Returns `?key=val&...` with leading `?` if non-empty, or `''` if empty
- Used by: `use-ap.ts`, `use-ar.ts`, `use-journals.ts`, `use-mappings.ts`

---

## 83. CI/CD Workflow

### GitHub Actions

`.github/workflows/lint-typecheck.yml` runs on push/PR to `main` and `workflow_dispatch`:

```
Lint → Type Check → Test → Build
```

- Node 20, pnpm 9, pnpm store caching
- Build uses placeholder Supabase env vars (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`)
- Timeout: 10 minutes

### Test Coverage

All packages support `pnpm test:coverage` via `@vitest/coverage-v8`:

- **Provider**: v8 (fast, native)
- **Reporters**: `text` (console), `json-summary` (CI parsing), `lcov` (IDE/Codecov integration)
- **Output**: `./coverage/` in each package (gitignored)
- **Turbo task**: `test:coverage` with `outputs: ["coverage/**"]` for caching
- **Workspace**: `vitest.workspace.ts` at root defines all packages for parallel execution

Run: `pnpm test:coverage` (all packages) or `pnpm --filter @oppsera/module-X test:coverage` (single package).

---

## 84. Accounting Frontend Component Architecture

### Chart of Accounts Page

`accounts-content.tsx` is the orchestrator, delegating rendering to extracted sub-components:

| Component | File | Purpose |
|---|---|---|
| `AccountFilterBar` | `components/accounting/account-filter-bar.tsx` | Search input, status filter tabs (active/inactive/all), view mode toggle (flat/tree) |
| `AccountTreeView` | `components/accounting/account-tree-view.tsx` | Renders accounts grouped by type (asset/liability/equity/revenue/expense), collapsible sections, tree nesting via `buildTree()`, handles row click for editing |
| `AccountDialog` | `components/accounting/account-dialog.tsx` | Create/edit GL account form (portal-based). Form state resets on close via `useEffect` watching `open` prop — explicitly resets to `defaultForm` when `open=false` |

Pattern: State lives in the parent (`accounts-content.tsx`), sub-components receive props. This keeps the main file ~155 lines instead of ~320.

---

## 85. F&B POS Backend Module

### Module Location & Structure

`packages/modules/fnb/` — `@oppsera/module-fnb`

```
packages/modules/fnb/src/
├── commands/          # 103 command handlers
├── queries/           # 63 query handlers
├── consumers/         # 3 CQRS read model consumers
├── events/
│   └── types.ts       # ~200 F&B domain event types (fnb.*.v1)
├── helpers/
│   ├── extract-tables-from-snapshot.ts   # Room layout → table sync
│   ├── build-batch-journal-lines.ts      # GL journal line builder for close batch
│   ├── channel-topology.ts              # WebSocket pub/sub channel definitions
│   ├── chit-layout.ts                   # Kitchen ticket/receipt formatting
│   ├── fnb-permissions.ts               # 28 permissions, 6 role defaults
│   ├── fnb-reporting-utils.ts           # Daypart, turn time, tip % helpers
│   ├── fnb-settings-defaults.ts         # Default config factory
│   ├── offline-queue-types.ts           # Offline operation queue types
│   ├── printer-routing.ts              # Printer device routing rules
│   └── ux-screen-map.ts                # Screen defs, flows, wireframes, nav
├── __tests__/         # 56 test files (1,011 tests)
├── validation.ts      # ~2,000 lines of Zod schemas
├── errors.ts          # Domain-specific error classes
└── index.ts           # Module entry point (all exports)
```

### Build Sessions (16 total)

| Session | Domain | Commands | Queries | Key Concepts |
|---------|--------|----------|---------|--------------|
| 1 | Table Management | 7 | 4 | syncTablesFromFloorPlan, table status tracking |
| 2 | Server Sections & Shifts | 8 | 3 | Section assignments, cut/pickup, shift extensions |
| 3 | Tabs, Checks & Seats | 9 | 2 | Tab lifecycle (open→close→void), seat management |
| 4 | Course Pacing & Kitchen | 7 | 3 | Hold/fire, delta chits, routing rules |
| 5 | KDS Stations & Expo | 6 | 5 | Bump/recall, station readiness, expo view |
| 6 | Modifiers & 86 Board | 8 | 6 | 86 items, allergens, availability windows |
| 7 | Split Checks & Payments | 10 | 6 | Split by seat/item/amount/even, payment sessions |
| 8 | Pre-Auth Bar Tabs | 5 | 3 | Pre-auth lifecycle, card-on-file |
| 9 | Tips & Gratuity | 7 | 5 | Auto-gratuity rules, tip pools, distribution |
| 10 | Close Batch & Cash | 8 | 6 | Z-report, deposit slip, server checkout |
| 11 | GL Posting | 6 | 3 | Journal line builder, posting reconciliation |
| 12 | Settings Module | 10 | 4 | 46 Zod schemas, defaults factory |
| 13 | Real-Time Sync | 6 | 5 | Channel topology, offline queue, soft locks |
| 14 | Receipts & Printing | 7 | 5 | Chit layout engine, printer routing |
| 15 | Reporting Read Models | 0 (consumers) | 8 | 7 rm_fnb_* tables, CQRS projections |
| 16 | UX Screen Map | 0 (spec) | 0 | Screen defs, flows, permissions, wireframes |

### Schema

All F&B tables live in `packages/db/src/schema/fnb.ts`. Key table groups:

- **Core**: `fnb_tables`, `fnb_sections`, `fnb_server_assignments`, `fnb_table_status_history`
- **Tabs & Ordering**: `fnb_tabs`, `fnb_tab_items`, `fnb_tab_seats`, `fnb_tab_courses`, `fnb_checks`
- **Kitchen**: `fnb_kitchen_tickets`, `fnb_kitchen_ticket_items`, `fnb_kitchen_stations`, `fnb_routing_rules`, `fnb_delta_chits`
- **Payments**: `fnb_payment_sessions`, `fnb_preauthorizations`, `fnb_tips`, `fnb_auto_gratuity_rules`, `fnb_tip_pools`
- **Close Batch**: `fnb_close_batches`, `fnb_server_checkouts`, `fnb_cash_counts`
- **Settings**: `fnb_settings`, `fnb_gl_mappings`, `fnb_allergens`, `fnb_availability_windows`, `fnb_menu_periods`
- **Printing**: `fnb_print_jobs`, `fnb_printer_routes`
- **Read Models**: 7 `rm_fnb_*` tables (server perf, table turns, kitchen perf, daypart sales, menu mix, discount/comp, hourly sales)

### Key Domain Patterns

**Table Sync from Floor Plans:**
```typescript
// Extract table objects from a published room layout snapshot
const tables = extractTablesFromSnapshot(canvasSnapshot);
// Sync creates/updates/deactivates fnb_tables to match
await syncTablesFromFloorPlan(ctx, { roomId, tables });
```

**Tab Lifecycle:**
```
openTab → addItems → sendCourse → [kitchen ticket created] → bumpItem → presentCheck → payment → closeTab
                                                                                              ↗
                                                              voidTab (requires permission) ──┘
                                                              transferTab (server-to-server)
```

**Close Batch Flow:**
```
startCloseBatch → lockBatch → serverCheckout (per server) → reconcileBatch → postBatch (GL)
                                                                              ↓
                                                              buildBatchJournalLines → GL journal entry
```

**F&B Read Model Consumers:**
- `handleFnbTabClosed` → upserts server perf, table turns, daypart sales, hourly sales, menu mix
- `handleFnbDiscountComp` → upserts discount/comp analysis
- `handleFnbTicketBumped/ItemBumped/ItemVoided` → upserts kitchen performance

### F&B Permissions (28 total, 10 categories)

```
floor_plan: view, manage
tabs:       view, create, update, void, transfer
kds:        view, bump, manage
payments:   create, void, refund
tips:       view, manage, pool
menu:       view, manage
close_batch: manage
reports:    view, export
settings:   manage
gl:         post, reverse, mappings
```

Role defaults: owner=all 28, manager=25, supervisor=18, cashier=7, server=9, staff=3 (kds only).

### Reporting Utilities

```typescript
// Pure helpers — no DB, no side effects
computeDaypart(hour: number): 'breakfast' | 'lunch' | 'dinner' | 'late_night'
computeTurnTimeMinutes(openedAt: string | null, closedAt: string | null): number | null
incrementalAvg(oldAvg: number, oldCount: number, newValue: number): number
computeTipPercentage(tipTotal: number, salesTotal: number): number | null
```

### Important Notes

1. **Full API routes + frontend built** — ~100 API routes under `/api/v1/fnb/`, 12 React hooks, 60+ components, Zustand store for POS screen routing. Built in Sessions 17-28 (12 phases).
2. **Entitlement key is `pos_fnb`** — all API routes use `{ entitlement: 'pos_fnb', permission: 'pos_fnb.*' }`. Do not use `pos_restaurant`.
3. **Consumer inputs are enriched types** — consumers receive typed `FnbTabClosedConsumerData` etc., not raw event payloads. The wiring layer enriches events before calling consumers.
4. **Session 16 is spec-only** — `ux-screen-map.ts` and `fnb-permissions.ts` encode UX specs as typed constants (screen defs, interaction flows, wireframes, permissions). These are contracts for frontend implementation.
5. **GL integration via `buildBatchJournalLines`** — close batch posts to GL using the same mapping resolution pattern as the POS adapter. Revenue split by sub-department, tax collected, tender by type, tips payable.
6. **F&B POS uses internal screen routing** — `fnb-pos-content.tsx` checks `useFnbPosStore().currentScreen` (floor|tab|payment|split) for instant switching. KDS, Expo, Host, Manager, Close Batch are separate pages.
7. **Migration 0082 required** — `fnb_tables` and related tables must exist in the database. After migration, sync tables from published room layout via "Sync Tables" button or `POST /api/v1/fnb/tables/sync`.
8. **CSS design tokens** — all F&B UI uses `var(--fnb-*)` custom properties from `fnb-design-tokens.css`. Status colors: available=#22c55e, reserved=#8b5cf6, seated=#3b82f6, ordered=#06b6d4, entrees_fired=#f97316, dessert=#a855f7, check_presented=#eab308, paid=#6b7280, dirty=#ef4444.

## 86. F&B POS Frontend Architecture

### Structure

```
apps/web/src/
├── app/(dashboard)/
│   ├── pos/fnb/fnb-pos-content.tsx        # Main F&B POS (Zustand screen router)
│   ├── kds/                               # Kitchen Display Station (standalone)
│   ├── expo/                              # Expo View (standalone)
│   ├── host/                              # Host Stand (standalone)
│   ├── fnb-manager/                       # Manager Dashboard (standalone)
│   └── close-batch/                       # Close Batch Workflow (standalone)
├── app/api/v1/fnb/                        # ~100 API routes
│   ├── tables/                            # Table CRUD, seat, clear, combine, sync, floor-plan
│   ├── tabs/                              # Tab CRUD, close, void, transfer, courses, check, split
│   ├── kitchen/                           # Tickets, routing rules
│   ├── stations/                          # KDS stations, bump, recall, expo
│   ├── menu/                              # 86, restore, periods, allergens, prep-notes
│   ├── payments/                          # Sessions, tender, gratuity rules
│   ├── preauth/                           # Pre-auth create, capture, void
│   ├── tips/                              # Adjust, finalize, declare, tip-out, pools
│   ├── sections/                          # CRUD, assignments, host-stand, cut, pickup, rotation
│   ├── close-batch/                       # Lifecycle, z-report, server-checkouts, cash
│   ├── gl/                                # Mappings, config, post, reverse, retry, reconciliation
│   ├── print/                             # Jobs, routing rules
│   ├── reports/                           # Dashboard, server-perf, table-turns, kitchen, daypart, etc.
│   ├── settings/                          # Module settings CRUD, defaults, validate, seed
│   └── locks/                             # Soft locks CRUD, clean
├── components/fnb/
│   ├── floor/                             # FloorCanvas, FnbTableNode, RoomTabs, BottomDock, ContextSidebar, SeatGuestsModal, TableActionMenu
│   ├── tab/                               # TabHeader, SeatRail, OrderTicket, CourseSection, FnbOrderLine, CourseSelector, TabActionBar
│   ├── menu/                              # FnbMenuPanel, FnbModifierDrawer, FnbItemTile, QuickItemsRow
│   ├── kitchen/                           # TicketCard, TicketItemRow, BumpButton, TimerBar, DeltaBadge, AllDaySummary, StationHeader, ExpoTicketCard
│   ├── split/                             # SplitCheckPage, SplitModeSelector, CheckPanel, DragItem, EqualSplitSelector, CustomAmountPanel
│   ├── payment/                           # PaymentScreen, TenderGrid, CashKeypad, TipPrompt, ReceiptOptions, PreAuthCapture
│   ├── manager/                           # ManagerPinModal, TransferModal, CompVoidModal, EightySixBoard, AlertFeed
│   ├── host/                              # RotationQueue, CoverBalance
│   ├── close/                             # CashCountForm, OverShortDisplay, ServerCheckoutList, ZReportView, DepositSlip
│   └── shared/                            # ConnectionBanner, ConflictModal, LockBanner
├── hooks/
│   ├── use-fnb-floor.ts                   # useFnbFloor, useFnbRooms, useTableActions
│   ├── use-fnb-tab.ts                     # useFnbTab (tab detail, courses, lines, seats, draft management)
│   ├── use-fnb-kitchen.ts                 # useFnbKitchen (tickets, bump, recall)
│   ├── use-fnb-menu.ts                    # useFnbMenu (departments, items, 86 status, allergens)
│   ├── use-fnb-payments.ts                # Payment sessions, pre-auth, tips
│   ├── use-fnb-manager.ts                 # PIN challenge, permission checks
│   ├── use-fnb-close-batch.ts             # Batch lifecycle, Z-report, checkouts
│   ├── use-fnb-sections.ts                # Sections, assignments
│   ├── use-fnb-settings.ts                # F&B settings
│   ├── use-fnb-reports.ts                 # F&B reports
│   ├── use-fnb-realtime.ts                # Polling transport (V1), connection status
│   └── use-fnb-locks.ts                   # Soft lock acquire/renew/release
├── stores/
│   └── fnb-pos-store.ts                   # Zustand: currentScreen, activeTabId, activeRoomId, draftLines, etc.
├── styles/
│   └── fnb-design-tokens.css              # CSS custom properties for F&B theming
└── types/
    └── fnb.ts                             # Frontend F&B types
```

### Key Patterns

- **Internal screen routing**: `fnb-pos-content.tsx` uses Zustand `currentScreen` (floor|tab|payment|split), NOT URL routes. Preserves dual-mount instant switching.
- **Polling V1**: `useFnbFloor` polls every 5s, `useFnbKitchen` every 10s. Transport abstraction ready for WebSocket V2.
- **Draft lines in Zustand**: unsent items stored locally in store, committed on "Send" via API.
- **CSS design tokens**: all colors via `var(--fnb-*)`, responsive overrides via `@media` in `fnb-design-tokens.css`.

## 87. Profit Centers & Terminal Architecture

### Overview

Profit centers are business-operational units (Bar, Restaurant, Pro Shop) that group terminals under a location. The 5-level hierarchy: **Tenant → Site → Venue → Profit Center → Terminal**.

### Database Tables

The DB table is `terminal_locations` (historical name), but the domain concept is **Profit Center**. The `title` column maps to `name` in TypeScript.

```
terminal_locations (profit centers)
├── id, tenant_id, location_id (FK → locations)
├── title (→ "name" in API), code, description, icon
├── tips_applicable, sort_order, is_active
├── receipt config: default_merchant/customer_receipt_print/type
└── Indexes: (tenant_id, location_id) WHERE is_active

terminals
├── id, tenant_id, terminal_location_id (FK → terminal_locations)
├── title (→ "name"), terminal_number, device_identifier, ip_address
├── location_id (FK → locations), is_active
├── settings: pin lock, auto-logout, signature tip, seat count, etc.
└── Indexes: (tenant_id, location_id), (tenant_id, terminal_location_id)
```

Additional tables: `terminalCardReaders`, `terminalCardReaderSettings`, `dayEndClosings`, `dayEndClosingPaymentTypes`, `dayEndClosingCashCounts`, `terminalLocationTipSuggestions`, `terminalLocationFloorPlans`, `drawerEvents`, `registerNotes`, `printers`, `printJobs`.

### Location Hierarchy

```sql
-- locations table additions (migration 0095)
parent_location_id TEXT REFERENCES locations(id)
location_type TEXT DEFAULT 'site'  -- 'site' or 'venue'

-- Constraints:
-- chk_location_type: location_type IN ('site', 'venue')
-- chk_location_parent_consistency:
--   site → parent_location_id IS NULL
--   venue → parent_location_id IS NOT NULL
```

### Module Location

```
packages/core/src/profit-centers/
├── commands/
│   ├── create-profit-center.ts      # With site-level guardrail
│   ├── update-profit-center.ts
│   ├── deactivate-profit-center.ts
│   ├── ensure-default-profit-center.ts  # Idempotent find-or-create (code='DEFAULT')
│   ├── create-terminal.ts
│   ├── update-terminal.ts
│   └── deactivate-terminal.ts
├── queries/
│   ├── list-profit-centers.ts       # With locationId filter + terminalCount
│   ├── get-profit-center.ts
│   ├── list-terminals.ts
│   ├── get-terminal.ts
│   ├── list-terminals-by-location.ts  # Joins through terminal_locations
│   └── get-terminal-selection-data.ts # Hierarchical selection data
├── types.ts                         # ProfitCenter, Terminal, TerminalSession
├── validation.ts                    # Zod schemas (allowSiteLevel flag)
└── index.ts                         # Re-exports
```

### Key Patterns

**Site-level guardrail**: `createProfitCenter` checks if the location is a site with child venues. Rejects with 422 unless `allowSiteLevel: true`. Frontend shows warning banner + confirmation checkbox.

**Default profit center**: `ensureDefaultProfitCenter(ctx, locationId)` is idempotent — matches on `code = 'DEFAULT'` (not title, which users can rename). Returns `{ id, created }`. Used by Simple mode in the settings UI.

**`effectiveLocationId` resolution**: In the settings UI orchestrator:
```typescript
const effectiveLocationId = selectedVenueId
  ?? (selectedSiteId && !selectedSiteHasVenues ? selectedSiteId : null);
```

### API Routes

```
GET/POST /api/v1/profit-centers              # List (with ?locationId filter) / Create
GET/PATCH/DELETE /api/v1/profit-centers/:id   # Detail / Update / Deactivate
POST /api/v1/profit-centers/ensure-default    # Idempotent find-or-create Default PC
GET/POST /api/v1/profit-centers/:id/terminals # List / Create terminals
GET/PATCH/DELETE /api/v1/terminals/:id        # Terminal detail / Update / Deactivate
GET /api/v1/terminals/by-location             # Terminals across all PCs at a location
GET /api/v1/terminal-session/locations        # Selection screen: sites + venues
GET /api/v1/terminal-session/profit-centers   # Selection screen: PCs for location
GET /api/v1/terminal-session/terminals        # Selection screen: terminals for PC
```

### Frontend Components

**Settings 3-panel layout** (`/settings/profit-centers`):
- `LocationsPane` — read-only site/venue tree, expand/collapse, auto-expand single site
- `ProfitCenterPane` — CRUD list, selection highlight, MoreVertical menu, code badge, terminal count pill
- `TerminalPane` — CRUD list, terminal number badge, device identifier
- `profit-centers-content.tsx` — orchestrator with Simple/Advanced mode toggle (localStorage), selection cascade, site-level warning banner

**Terminal session flow** (on POS entry):
- `TerminalSelectionScreen` — full-screen 4-level cascading selection, auto-selects single options
- `TerminalSessionProvider` — React Context + `localStorage('oppsera:terminal-session')`
- `useTerminalSelection` — hook managing all 4 selection levels with derived state

### Key Rules

1. **Never expose `title`** — always map to `name` in queries and API responses
2. **Profit centers use `isActive` soft-delete** — never hard-delete from `terminal_locations`
3. **Terminal session is required for POS** — all POS operations read from `TerminalSessionProvider` context
4. **`ensureDefaultProfitCenter` matches on `code`, not `title`** — users can rename the Default PC
5. **Selection cascade resets downstream** — selecting a site clears venue, profit center, and terminal selections

## 88. Admin Tenant Management

### Overview

Platform admin feature for managing tenants, their organizational hierarchy, and module entitlements. Accessible at `/tenants` in the admin app. Uses `withAdminAuth` middleware (NOT tenant-scoped `withMiddleware`).

### Admin Context

Admin routes that call core commands need a `RequestContext`:

```typescript
// apps/admin/src/lib/admin-context.ts
export function buildAdminCtx(session: AdminSession, tenantId: string): RequestContext {
  return {
    tenantId,
    user: { id: `admin:${session.adminId}`, email: session.email, ... },
    requestId: `admin-${generateUlid()}`,
    isPlatformAdmin: true,
  };
}
```

### API Routes (12 endpoints)

```
GET/POST /api/v1/tenants                          # List (cursor pagination) / Create
GET/PATCH /api/v1/tenants/:id                      # Detail (with counts) / Update
GET/POST /api/v1/tenants/:id/locations             # Location CRUD
PATCH/DELETE /api/v1/tenants/:id/locations/:locId  # Update / Delete location
GET/POST /api/v1/tenants/:id/profit-centers        # PC CRUD (calls core commands)
PATCH/DELETE /api/v1/tenants/:id/profit-centers/:pcId
GET/POST /api/v1/tenants/:id/terminals             # Terminal CRUD (calls core commands)
PATCH/DELETE /api/v1/tenants/:id/terminals/:tId
GET/PATCH /api/v1/tenants/:id/entitlements         # Module access management
```

### Frontend Components

- **OrgHierarchyBuilder**: 4-column grid managing Sites → Venues → Profit Centers → Terminals with cascading selection and modal forms
- **HierarchyPanel**: Generic reusable panel (title, item list, selected highlight, create button)
- **EntitlementToggleList**: Toggle switches per module with plan tier dropdown
- **CreateTenantModal**: Name, slug (uniqueness-checked), status, timezone, first site name

### Key Rules

1. **Always use `buildAdminCtx`** when admin routes call core commands
2. **Slug uniqueness** is enforced at the API level with 409 Conflict response
3. **Tenant creation** atomically creates the tenant + initial site in one transaction
4. **All admin modals use `createPortal`** to `document.body` with z-50

## 89. Cross-Module Write APIs

### Pattern

For modules that need to write to another module's domain (e.g., PMS creating orders), use a cross-module write API singleton:

```typescript
// packages/core/src/helpers/{module}-write-api.ts
interface OrdersWriteApi {
  openOrder(ctx: RequestContext, input: OpenOrderInput): Promise<{ id: string }>;
  addLineItem(ctx: RequestContext, orderId: string, input: AddLineInput): Promise<void>;
}
let _instance: OrdersWriteApi | null = null;
export function setOrdersWriteApi(api: OrdersWriteApi) { _instance = api; }
export function getOrdersWriteApi(): OrdersWriteApi { return _instance!; }

// apps/web/src/lib/orders-bootstrap.ts — wired in instrumentation.ts
setOrdersWriteApi({ openOrder: ..., addLineItem: ... });
```

### Existing Cross-Module APIs

| API | Location | Purpose |
|-----|----------|---------|
| `CatalogReadApi` | `@oppsera/core/helpers/catalog-read-api` | Read catalog items from orders/POS |
| `AccountingPostingApi` | `@oppsera/core/helpers/accounting-posting-api` | Post GL entries from AP/AR/POS |
| `OrdersWriteApi` | `@oppsera/core/helpers/orders-write-api` | Create/modify orders from PMS |
| `ReconciliationReadApi` | `@oppsera/core/helpers/reconciliation-read-api` | Read operational data for accounting queries (orders, tenders, settlements, tips, inventory, F&B) |

### Key Rules

1. **Interface lives in `@oppsera/core/helpers/`** — never in a module package
2. **Implementation lives in `apps/web/src/lib/`** — wired via instrumentation.ts
3. **Getter throws if not initialized** — ensures bootstrap ran before use
4. **Read APIs are singleton getter/setter** — same pattern as write APIs

## 90. Entitlement Access Modes

### Three-Mode Access Control

Entitlements evolved from binary (on/off) to three-mode:

| Mode | Meaning |
|------|---------|
| `off` | Module fully disabled — middleware blocks all requests |
| `view` | Read-only access — GETs allowed, mutations blocked |
| `full` | Full access — all operations allowed |

### Types

```typescript
// packages/core/src/entitlements/registry.ts
export type AccessMode = 'off' | 'view' | 'full';
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';
export type ModuleCategory = 'core' | 'commerce' | 'operations' | 'finance' | 'analytics' | 'integrations';
```

### Module Definitions

Each module in `MODULE_REGISTRY` now includes:

```typescript
interface ModuleDefinition {
  key: string;
  name: string;
  phase: 'v1' | 'v2' | 'v3';
  description: string;
  dependencies: string[];      // Must be view or full before this module can activate
  riskLevel: RiskLevel;         // high/critical require a reason to change
  supportsViewMode: boolean;    // Some modules are all-or-nothing (payments, platform_core)
  category: ModuleCategory;     // Grouping for admin UI
}
```

### Middleware: `writeAccess` Option

```typescript
// Read endpoint — allows VIEW mode through
withMiddleware(handler, { entitlement: 'catalog' });

// Write endpoint — blocks VIEW mode with 403
withMiddleware(handler, { entitlement: 'catalog', writeAccess: true });
```

`requireEntitlementWrite(moduleKey)` throws `ModuleViewOnlyError` (403) when mode is `view`.

### Dependency Validation

```typescript
// packages/core/src/entitlements/dependencies.ts
validateModeChange(moduleKey, targetMode, currentEntitlements) → DependencyCheckResult
computeDependencyChain(moduleKey) → ModuleDefinition[]
```

- **Enabling a module**: all `dependencies` must be `view` or `full` (not `off`)
- **Disabling a module**: all dependents must already be `off` — NO auto-cascade
- **Reason required**: `riskLevel === 'high' || 'critical'` when setting mode to `off`
- Both functions are **pure** — no DB access, no side effects

### Entitlement Change Log

Append-only `entitlement_change_log` table tracks all mode changes with:
- `previousMode` / `newMode`
- `changedBy` (admin user ID)
- `changeReason` (required for high/critical risk)
- `changeSource` ('manual' | 'bulk' | 'system')

### Key Rules

1. **`platform_core` cannot be disabled** — `validateModeChange` hard-blocks `off` for it
2. **Binary compat preserved** — `isModuleEnabled()` returns `mode !== 'off'`, so existing `requireEntitlement` middleware still works unchanged
3. **Engine loads `accessMode` from DB** — falls back to `isEnabled ? 'full' : 'off'` for rows missing the column (pre-migration)
4. **`ModuleViewOnlyError` is 403** — same HTTP status as `ModuleNotEnabledError`, but distinct error code `MODULE_VIEW_ONLY`
5. **Module templates** — `module_templates` table stores preset module configurations (by business type) that admins can apply to tenants

## 91. Admin Portal RBAC (Platform Admin Roles)

### Overview

The admin portal now has granular RBAC beyond the legacy `role` column on `platform_admins`.

### Schema (migration 0097)

- **`platform_admin_roles`** — named roles (Super Admin, Admin, Support, Analyst, Read-Only). `isSystem = true` for built-in roles.
- **`platform_admin_role_permissions`** — granular permission grants per role:
  - `module`: 'tenants' | 'users' | 'billing' | 'ai_train' | 'evaluations' | 'system'
  - `submodule`: 'staff' | 'customers' | 'examples' | 'eval_history' | null
  - `action`: 'view' | 'create' | 'edit' | 'invite' | 'reset_password' | 'suspend' | 'export' | 'delete'
  - `scope`: 'global' | 'tenant' | 'self'
- **`platform_admin_role_assignments`** — many-to-many: admins can have multiple roles
- **`platform_admin_audit_log`** — captures all admin portal actions with before/after snapshots

### Extended `platform_admins`

New columns: `phone`, `status` ('active' | 'invited' | 'suspended' | 'deleted'), `invitedByAdminId`, `inviteTokenHash`, `inviteExpiresAt`, `passwordResetRequired`.

### Permission Checking

```typescript
// apps/admin/src/lib/with-admin-permission.ts
withAdminPermission(handler, { module: 'tenants', action: 'edit' })
```

### Admin Audit Logging

```typescript
// apps/admin/src/lib/admin-audit.ts
await auditAdminAction(adminId, 'staff.created', 'staff', entityId, { before, after, reason, tenantId });
```

### Key Rules

1. **Legacy `role` column preserved** — login route and `withAdminAuth` still check it for backward compat
2. **`isActive` kept in sync with `status`** — `status = 'suspended'` → `isActive = false`
3. **No RLS on platform tables** — these are NOT tenant-scoped
4. **System roles cannot be deleted** — `isSystem = true` flag prevents deletion
5. **Invite flow** — create admin with `status = 'invited'`, set `inviteTokenHash` + `inviteExpiresAt`, send invite email with token

## 92. Admin User Management

### Overview

Admin pages for managing platform staff and tenant customers, accessible at `/users` in the admin app.

### Staff Management (`/users` → Staff tab)

- **API Routes**: `GET/POST /api/v1/admin/staff` (list/invite), `PATCH /api/v1/admin/staff/[id]` (update/suspend/reactivate)
- **Commands**: `inviteStaff`, `updateStaff`, `suspendStaff`, `reactivateStaff`, `resetStaffPassword`
- **Queries**: `listStaff`, `getStaffById`
- **Hooks**: `useStaff` (list, pagination, search, role filter)

### Customer Management (`/users` → Customers tab)

- **API Routes**: `GET /api/v1/admin/customers` (list, cross-tenant search)
- **Queries**: `searchCustomersAdmin` (cross-tenant, name/email/phone/identifier search)
- **Hooks**: `useCustomersAdmin` (search, tenant filter, pagination)

### Key Rules

1. **Staff commands enforce uniqueness** — email must be unique across all platform admins
2. **Suspend = soft-delete** — sets `status = 'suspended'`, `isActive = false`. Never hard-delete.
3. **Admin actions are audit-logged** — every staff CRUD operation logs to `platform_admin_audit_log`
4. **Customer queries are cross-tenant** — platform admins can search customers across all tenants (admin context, not tenant-scoped)

## 93. F&B POS Improvements

### Floor/Tab CSS Toggle Architecture

F&B POS now uses CSS-based mount/toggle for Floor and Tab views (same pattern as the Retail/F&B dual-mount):

```tsx
// fnb-pos-content.tsx — Floor + Tab stay mounted, toggle via CSS
<div className={currentScreen === 'floor' ? 'h-full' : 'hidden'}>
  <FnbFloorView userId={userId} />
</div>
<div className={currentScreen === 'tab' ? 'h-full' : 'hidden'}>
  <FnbTabView userId={userId} />
</div>
// Payment + Split still mount on-demand
{currentScreen === 'payment' && <FnbPaymentView />}
{currentScreen === 'split' && <FnbSplitView />}
```

### Table Grid View

New `TableGridView` component provides an alternative grid-based table layout (alongside the canvas-based `FnbFloorCanvas`). Toggle between Canvas and Grid views via `LayoutGrid` / `Map` icons in the floor toolbar.

### Auto-Fit Floor Canvas

`FnbFloorView` now computes bounding box of all tables and auto-calculates `viewScale` to fit all tables into the viewport. No more manual zoom to find tables.

### Zustand Store Updates

- `fnb-pos-store.ts`: added `selectedMenuCategory` state for persistent menu category selection across screen transitions

### Key Rules

1. **Floor + Tab stay mounted** — prevents data loss and expensive re-fetches on screen switch
2. **Payment + Split mount on-demand** — less frequent, acceptable to remount
3. **`useFnbTab` hook enhanced** — now accepts `tabId` for targeted operations, improved status tracking
4. **`useFnbMenu` hook enhanced** — persistent search term and category selection

## 94. Terminal Session Integration

### POS Terminal Resolution

POS layout now uses the `TerminalSessionProvider` for terminal identification instead of URL params / localStorage:

```typescript
// apps/web/src/app/(dashboard)/pos/layout.tsx
function useTerminalId(): string {
  const { session } = useTerminalSession();
  return session?.terminalId ?? 'POS-01';
}
```

### Dashboard Layout Gate

The dashboard layout wraps children in `TerminalSessionProvider` + `TerminalSessionGate`:

```typescript
// If no terminal session selected and not skipped, shows TerminalSelectionScreen
<TerminalSessionProvider>
  <TerminalSessionGate>
    <DashboardLayoutInner>{children}</DashboardLayoutInner>
  </TerminalSessionGate>
</TerminalSessionProvider>
```

Users can skip terminal selection (for non-POS workflows) via the skip button.

### Key Rules

1. **Terminal session is required for POS** — `useTerminalId()` reads from session context, falls back to `'POS-01'`
2. **Non-POS workflows can skip** — the `TerminalSessionGate` has a `skipped` state
3. **Session persists in localStorage** — `oppsera:terminal-session` key, survives page refresh

## 95. User Management Tab (Settings)

### Overview

`/settings` user management tab completely rewritten to support role assignment, permission display, and multi-location memberships.

### Features

- Role selector dropdown (Owner, Manager, Supervisor, Cashier, Server, Staff)
- Location-specific membership display with status badges
- Invite user flow with role + location selection
- Permission summary view per role
- User search and filter

### Key Rules

1. **Settings page reorganized** — heavy content moved out of `settings-content.tsx` into dedicated tab files
2. **User management is tenant-scoped** — uses normal `withMiddleware` (not admin routes)
3. **Role changes emit events** — for audit trail

## 96. Order Metadata Support

### Overview

Orders now support arbitrary `metadata` (JSONB) for cross-module context:

```typescript
// Open an order with metadata
openOrder(ctx, { ...input, metadata: { source: 'pms', reservationId: 'abc' } });

// Update metadata on existing order
updateOrder(ctx, orderId, { metadata: { guestName: 'John Doe' } });
```

### Key Rules

1. **Schema**: `metadata: z.record(z.string(), z.unknown()).optional()` — Zod validates as `Record<string, unknown>`
2. **Used by PMS integration** — `check-in-to-pos` route attaches reservation context to orders
3. **Never query by metadata fields** — metadata is opaque JSONB for display/context, not for filtering

## 97. Seed Data Updates

### Location Hierarchy

Seed now creates proper site → venue hierarchy:
- **Site**: "Sunset Golf Resort" (physical address, files taxes)
- **Venue 1**: "Main Clubhouse" (under site)
- **Venue 2**: "South Course Pro Shop" (under site)

### Profit Centers & Terminals

Seed creates:
- 2 profit centers (one per venue)
- 2 terminals (one per profit center)

### Entitlement Access Modes

New `accessMode` column seeded as `'full'` for all enabled modules.

## 98. UXOPS Operations Architecture (Sessions UXOPS-01–14)

### Core Submodules in `packages/core/src/`

UXOPS promoted three operational concerns to core submodules (not in `modules/` — these are shared POS infrastructure):

| Submodule | Path | Purpose |
|-----------|------|---------|
| Drawer Sessions | `core/src/drawer-sessions/` | Server-persisted cash drawer sessions + events |
| POS Ops | `core/src/pos-ops/` | Comp/void-line commands with GL separation |
| Retail Close | `core/src/retail-close/` | End-of-day close workflow with Z-report |

These live in `core/` because both retail and F&B POS need them. The accounting module provides GL adapters that consume their events.

### GL Adapter Pattern

All UXOPS GL adapters follow the same pattern:

```typescript
// packages/modules/accounting/src/adapters/<name>-posting-adapter.ts
export async function handleXxxForAccounting(data: EventPayload): Promise<void> {
  try {
    const settings = await getAccountingSettings(data.tenantId);
    const lines = buildJournalLines(data, settings); // pure function
    await AccountingPostingApi.postEntry(syntheticCtx, {
      sourceModule: 'pos', // or 'fnb', 'settlement', etc.
      sourceReferenceId: data.id,
      lines,
      forcePost: true,
      hasControlAccountPermission: true,
    });
  } catch (err) {
    console.error(`[${adapterName}] GL posting failed:`, err);
    // NEVER throw — business operation must succeed regardless of GL state
  }
}
```

### Key Rules

1. **GL adapters NEVER throw** — all adapters wrap in try/catch. POS/business operations always succeed.
2. **`forcePost: true` + `hasControlAccountPermission: true`** — system-initiated GL postings bypass draft mode and control account restrictions
3. **Synthetic context** — event consumers create `{ user: { id: 'system' }, requestId: 'xxx-{entityId}' }`
4. **`sourceReferenceId` prevents double-posting** — unique partial index on `(tenantId, sourceModule, sourceReferenceId)`

## 99. Drawer Sessions

### Schema

```
drawer_sessions (one per terminal per business date)
├── drawer_session_events (append-only cash movements)
```

UNIQUE constraint: `(tenant_id, terminal_id, business_date)` — one drawer per terminal per day.

### Event Types

`paid_in` | `paid_out` | `cash_drop` | `drawer_open` | `no_sale`

### Expected Cash Formula

```
expected_cash = opening_balance + cash_sales - cash_refunds + paid_in - paid_out - cash_drops
```

### `useShift` Hook (Rewritten)

`apps/web/src/hooks/use-shift.ts` now calls server API first, falls back to localStorage for offline:

```typescript
const { data: session } = useQuery({
  queryKey: ['drawer-session', locationId, terminalId],
  queryFn: () => apiFetch(`/api/v1/drawer-sessions/active?...`),
});
```

### Key Rules

1. **Server-first, localStorage-fallback** — online = API calls, offline = localStorage queue
2. **Opening balance is change fund** — excluded from revenue calculations
3. **Events are append-only** — never UPDATE or DELETE drawer_session_events
4. **Permissions**: `shift.manage`, `cash.drawer`, `cash.drop`

## 100. Retail Close Batches

### Lifecycle

`open → in_progress → reconciled → posted → locked`

### Summary Aggregation

`startRetailClose` computes from orders + tenders for the terminal's business date:
- Gross/net sales, tax, discounts, voids, service charges, tips
- Tender breakdown by type
- Sales by department

### Over/Short GL

```
If short: Debit Cash Over/Short Expense, Credit Cash (variance amount)
If over:  Debit Cash (variance amount), Credit Cash Over/Short
```

Uses `settings.defaultCashOverShortAccountId`.

### Key Rules

1. **Cannot close without closing drawer first** — enforced by `startRetailClose`
2. **Z-report mirrors F&B pattern** — `buildRetailBatchJournalLines()` same approach as F&B `buildBatchJournalLines()`
3. **Batch is immutable after lock** — only `notes` can be updated on locked batches
4. **GL journal entry linked** — `retail_close_batches.gl_journal_entry_id` set after posting

## 101. Card Settlement Workflow

### Tables

```
payment_settlements (one per processor batch)
├── payment_settlement_lines (one per matched tender)
```

### GL Posting

```
Debit:  Bank Account (net amount = gross - fees)
Debit:  Processing Fee Expense (fee amount)
Credit: Undeposited Funds (gross amount)
```

Chargeback amounts net from gross before posting.

### Matching

Auto-matcher links settlement lines to tenders by date range + amount. Unmatched tenders flagged.

### Key Rules

1. **CSV import is universal** — processor APIs vary; CSV import works with all
2. **Idempotent** — UNIQUE on `(tenant, processor_name, processor_batch_id)`
3. **Warning on unmatched** — cannot post if critical tenders unmatched (overridable)

## 102. Tip Payout Workflow

### GL Posting

| Type | Debit | Credit |
|------|-------|--------|
| Cash payout | Tips Payable | Cash |
| Payroll | Tips Payable | Payroll Clearing |

### Balance Calculation

```sql
tip_balance = SUM(tenders.tip_amount WHERE employee_id = X)
            - SUM(tip_payouts.amount WHERE employee_id = X)
```

### Key Rules

1. **Cannot payout more than balance** — validated before insert
2. **Manager PIN required** — all payouts gated by `tips.payout` permission
3. **Void creates GL reversal** — `voidTipPayout` posts reversal entry
4. **Shift close reminder** — CloseShiftDialog shows outstanding tip amounts

## 103. Operations Dashboard & Tender Audit Trail

### Operations Dashboard (`/operations/operations-dashboard`)

4 query services power the dashboard:
- `getOperationsSummary`: KPIs (total sales, avg ticket, void/discount/comp rates)
- `getCashManagementDashboard`: active sessions, cash in/out, pending deposits
- `getDailyReconciliation`: 3-column Sales vs Tenders vs GL comparison
- `getTenderAuditTrail`: full tender lifecycle (tender → order → GL → settlement → deposit)

### Tender Audit Trail (`/operations/tender-audit/[id]`)

Vertical timeline showing every stage a tender passes through:
1. **Tender** — payment recorded
2. **Order** — linked order details
3. **GL Posting** — journal entry created
4. **Settlement** — matched to processor batch (non-cash only)
5. **Deposit** — included in bank deposit

### Key Rules

1. **Queries only, no mutations** — all operations queries are read-only
2. **Location + date filters** — all dashboards scoped to location and date range
3. **Hooks in `use-operations.ts`** — 4 React Query hooks with staleTime 15-30s
4. **Operations link in sidebar** — uses `Monitor` icon, group: 'Financials'

## 104. Event Dead Letter Queue

### Purpose

When events fail after max retries (3), they persist to `event_dead_letters` table instead of being silently dropped. Admin users can inspect, retry, or discard.

### Admin UI (`apps/admin/src/app/(admin)/events/`)

- List with filters: status, event type, consumer, date range
- Detail view: full JSON payload, error stack, attempt count
- Actions: Retry (re-publishes through pipeline), Resolve (with notes), Discard

### Key Rules

1. **Retry re-publishes fully** — goes through full event bus pipeline, not just the failed consumer
2. **Idempotency prevents double-processing** — processed_events table check still applies
3. **Stats cards** — total failed, by type, by consumer for quick triage
4. **Close checklist integration** — item #16 warns on unresolved dead letters

## 105. Audit Log Policy

### Mandate

Every command that creates, modifies, or reverses a financial transaction MUST call
`auditLog(ctx, action, entityType, entityId, changes?, metadata?)` after the transaction commits.

"Financial transaction" includes: tenders, refunds, voids, comps, tip adjustments,
journal entries, bill payments, receipt postings, drawer operations, cash drops,
deposit preparations, settlement recordings, voucher operations, and periodic COGS calculations.

### Which helper to use

| Context | Helper | Usage |
|---------|--------|-------|
| Route handler (has `RequestContext`) | `auditLog(ctx, ...)` | User-initiated actions |
| Event consumer / background job | `auditLogSystem(tenantId, ...)` | System-initiated actions |

### Required metadata

Every money-moving audit entry MUST include in its metadata:

```typescript
{
  amountCents?: number;       // or amountDollars for GL/AP/AR
  businessDate?: string;      // business date of the transaction
  locationId?: string;        // location where action occurred
  terminalId?: string;        // terminal ID (POS operations)
  managerApprover?: string;   // user ID if manager PIN was required
  reason?: string;            // for voids, comps, adjustments
}
```

### Audit coverage diagnostic

`getAuditCoverage(tenantId, dateRange)` compares financial transaction counts against audit entry counts per category (GL, tenders, AP, AR, orders). Any mismatch = gap. Surfaced on the accounting dashboard as a data integrity card and in the audit trail viewer at `/accounting/audit`.

### Key Rules

1. **Audit entries are append-only** — never UPDATE or DELETE `audit_log` rows
2. **`auditLog()` never throws** — wrapped in try/catch, failures logged but don't block the API response
3. **Commands that take `RequestContext` use `auditLog`** — commands that don't (background jobs) use `auditLogSystem`
4. **Retention** — `pruneAuditLog()` detaches monthly partitions after configurable retention period (default 90 days)
5. **Dual-tier** — tenant audit log (`audit_log`) for operational actions, platform admin audit log (`platform_admin_audit_log`) for admin portal actions

## 106. Cash Drawer Ownership (V1 — Strict Mode)

V1 enforces strict drawer-to-terminal binding:

- **One drawer session per terminal per business date** — enforced by UNIQUE constraint `(tenant_id, terminal_id, business_date)` on `drawer_sessions`
- A cashier CANNOT move their drawer to a different terminal
- To switch terminals: close drawer on Terminal A (with count), open new drawer on Terminal B
- Counts carry forward: the closing count from Terminal A becomes the basis for opening Terminal B
- Flexible drawer mode (drawer follows cashier across terminals) is a **V2 enhancement**

**UX implication**: if a cashier tries to open a drawer on Terminal B while they have one open on Terminal A, show: "You have an open drawer on Terminal A. Close it first to open here."

**Schema**: `drawer_sessions` has `terminal_id` (not employee-scoped). The `employee_id` column tracks who opened the session, but ownership is terminal-bound.

## 107. Offline Behavior Policy (V1)

V1 does NOT support offline payment processing. The policy is explicit:

- If network connectivity is lost, POS enters **read-only mode**
- Read-only mode allows: viewing open orders, browsing catalog, viewing shift info
- Read-only mode **BLOCKS**: placing orders, recording tenders, opening/closing drawers, cash drops, voids, comps, refunds, any GL-posting operation
- A persistent banner displays: "Offline — payments disabled until connection restored"
- When connectivity returns, banner clears automatically (polling-based detection)

**Runtime guard**: `TenderDialog.handleSubmit()` checks `navigator.onLine` before proceeding. If offline, shows toast error and returns early.

The typed offline queue (`packages/modules/fnb/src/helpers/offline-queue-types.ts`) exists as a V2 spec. Do not implement the queue or replay logic in V1.

**Future V2 option**: "cash-only offline" mode where cash tenders can be queued locally with temporary IDs and reconciled on reconnect. This requires: temp ID generation, dedup on reconnect, conflict resolution, and explicit UX for "pending sync" state.

## 108. Kitchen Waste Tracking (V1 — Boolean Only)

V1 captures `wasteTracking: boolean` on void-line-after-send events. This indicates that a kitchen item was wasted (prepared but voided).

Full waste tracking is deferred to V2 when F&B item voids are connected to inventory movements:

**Future additions:**
- `waste_reason` enum: overcooked, dropped, wrong_order, expired, quality, other
- `waste_quantity` (may differ from order quantity)
- `waste_cost_estimate_cents` (from item cost or recipe cost if inventory costing exists)
- Waste reporting: by item, category, server, daypart, reason
- Integration with inventory `shrink` movement type

The inventory module already supports `shrink` and `waste` movement types. When this integration is built, F&B void-with-waste should create an inventory shrink movement automatically.

## 109. Multi-Currency Roadmap

V1 is USD-only. Schema columns (`transaction_currency`, `exchange_rate` on `gl_journal_entries`, `supported_currencies` on `accounting_settings`) exist but are inert.

**Activation checklist (future session):**

1. Exchange rate source (manual entry or API like Open Exchange Rates)
2. `exchange_rates` table (date, from_currency, to_currency, rate)
3. Currency conversion at posting time (multiply by rate, store both original + base amounts)
4. Multi-currency P&L and Balance Sheet (unrealized gain/loss calculation)
5. Foreign currency revaluation workflow
6. Currency selector in invoice/bill creation
7. Remove `CurrencyMismatchError` guard (replace with conversion logic)

**Current behavior**: `postJournalEntry()` rejects any entry where `transactionCurrency !== 'USD'` with `CurrencyMismatchError`. This is intentional — it prevents accidental multi-currency entries until the full pipeline is ready.

## 98. ReconciliationReadApi — Cross-Module Read Boundary for Accounting

### Problem

The accounting module had 14 queries + 1 command that directly queried tables owned by other modules (orders, tenders, drawer_sessions, retail_close_batches, comp_events, payment_settlements, tip_payouts, deposit_slips, fnb_close_batches, inventory_movements, receiving_receipts, terminals, users). This created tight coupling that would block future microservice extraction.

### Solution

A 25-method `ReconciliationReadApi` singleton in `@oppsera/core/helpers/reconciliation-read-api.ts` following the same getter/setter pattern as `CatalogReadApi` and `AccountingPostingApi`. SQL stays in owning modules. Accounting calls the API.

### Architecture

```
Interface + types:        packages/core/src/helpers/reconciliation-read-api.ts
Bootstrap (wiring):       apps/web/src/lib/reconciliation-bootstrap.ts
Instrumentation:          apps/web/src/instrumentation.ts (calls initializeReconciliationReadApi)

Implementations:
  Orders (5 methods):     packages/modules/orders/src/reconciliation/index.ts
  Payments (17 methods):  packages/modules/payments/src/reconciliation/index.ts
  Inventory (2 methods):  packages/modules/inventory/src/reconciliation/index.ts
  F&B (1 method):         packages/modules/fnb/src/reconciliation/index.ts
```

### API Domains (25 methods)

| Domain | Methods | Module |
|--------|---------|--------|
| Orders | `getOrdersSummary`, `getTaxBreakdown`, `getTaxRemittanceData`, `getCompTotals`, `getOrderAuditCount` | orders |
| Tenders | `getTendersSummary`, `getTenderAuditTrail`, `getUnmatchedTenders`, `getTenderAuditCount` | payments |
| Settlements | `listSettlements`, `getSettlementDetail`, `getSettlementStatusCounts` | payments |
| Cash Ops | `getDrawerSessionStatus`, `getRetailCloseStatus`, `getCashOnHand`, `getOverShortTotal` | payments |
| Tips | `getTipBalances`, `listTipPayouts`, `getPendingTipCount`, `getOutstandingTipsCents` | payments |
| Deposits | `getDepositStatus` | payments |
| Location Close | `getLocationCloseStatus` | payments |
| F&B | `getFnbCloseStatus` | fnb |
| Inventory | `getInventoryMovementsSummary`, `getReceivingPurchasesTotals` | inventory |

### When to Add a New Method

Add a method to `ReconciliationReadApi` when:
1. An accounting query needs data from a table owned by another module
2. The data shape doesn't match an existing method's return type
3. No existing method covers the query's filter requirements (date range vs period, location scope, etc.)

Do NOT add a method when:
- The table is owned by the accounting module itself (GL, AP, AR, mappings, settings)
- An existing method already returns the needed data (use it directly)

### Key Patterns

```typescript
// In accounting queries — always use Promise.all for parallel execution:
const api = getReconciliationReadApi();
const [ordersSummary, tendersSummary, localData] = await Promise.all([
  api.getOrdersSummary(tenantId, startDate, endDate, locationId),
  api.getTendersSummary(tenantId, startDate, endDate, locationId),
  withTenant(tenantId, async (tx) => {
    // Local queries for accounting-owned tables (GL, settings, etc.)
    return { ... };
  }),
]);
```

### Contract Tests

Each module has contract tests verifying return shapes:
- `packages/modules/orders/src/reconciliation/__tests__/reconciliation.test.ts`
- `packages/modules/payments/src/reconciliation/__tests__/reconciliation.test.ts`
- `packages/modules/inventory/src/reconciliation/__tests__/reconciliation.test.ts`
- `packages/modules/fnb/src/reconciliation/__tests__/reconciliation.test.ts`

## 110. Transaction Type Registry & Custom Tender Types

### Schema

Two new tables (migration 0144):

1. **`gl_transaction_types`** — global registry of financial event types
   - System types: `tenant_id IS NULL`, 45 pre-seeded across 12 categories (tender, revenue, tax, tip, deposit, refund, settlement, ar, ap, inventory, membership, other)
   - Tenant custom types: `tenant_id IS NOT NULL`, created via `createTenantTenderType`
   - Fields: `code` (unique per scope), `name`, `category`, `description`, `default_debit_account_hint`, `default_credit_account_hint`, `sort_order`, `is_active`
   - Partial unique indexes: system scope `(code WHERE tenant_id IS NULL)`, tenant scope `(tenant_id, code WHERE tenant_id IS NOT NULL)`

2. **`tenant_tender_types`** — custom payment methods per tenant
   - Fields: `name`, `code`, `category` (external_card, external_cash, house_account, etc.), `posting_mode` (clearing/direct_bank/non_cash)
   - GL account references: `clearing_account_id`, `bank_account_id`, `fee_account_id`, `expense_account_id`
   - Reporting: `reporting_bucket` (include/exclude_revenue/comp)
   - Reference tracking: `requires_reference`, `reference_label`
   - Soft-delete via `is_active`

### Shared Constants

`packages/shared/src/constants/transaction-types.ts` exports:
- `SYSTEM_TRANSACTION_TYPES`: all 45 system types with code, name, description, account hints, sort order
- Type definitions: `TransactionTypeCategory`, `TenderPostingMode`, `TenderCategory`, `ReportingBucket`
- Display label helpers for UI

### Commands

| Command | File | Purpose |
|---|---|---|
| `createTenantTenderType` | `commands/create-tenant-tender-type.ts` | Create custom payment type (validates code uniqueness, creates in both tables) |
| `updateTenantTenderType` | `commands/update-tenant-tender-type.ts` | Update fields, syncs name/active to `gl_transaction_types` |
| `deactivateTenderType` | `commands/deactivate-tender-type.ts` | Soft-delete both records |

### Queries

| Query | File | Purpose |
|---|---|---|
| `getTransactionTypeMappings` | `queries/get-transaction-type-mappings.ts` | Join transaction types + GL mappings + tender type details |

### API Routes

- `GET /api/v1/accounting/mappings/transaction-types` — list with optional `?category=` filter
- `POST /api/v1/accounting/tender-types` — create custom tender type
- `PATCH /api/v1/accounting/tender-types/[id]` — update
- `DELETE /api/v1/accounting/tender-types/[id]` — deactivate (soft delete)

### Posting Mode Patterns

| Mode | Debit | Credit | Use Case |
|---|---|---|---|
| `clearing` | Clearing Account | Revenue | Card processors (settled later) |
| `direct_bank` | Bank Account | Revenue | Cash, checks (immediate) |
| `non_cash` | Expense Account | Revenue | Comps, vouchers |

### Frontend

- `CreateTenderTypeDialog`: portal-based modal, conditional GL account pickers per posting mode
- Integrated into `/accounting/mappings` Payment Types tab

## 111. Dashboard Reporting Fallback Chain

### Problem
CQRS read models (`rm_daily_sales`, `rm_item_sales`, etc.) may be empty when:
1. No events have been processed yet (new tenant, seed data)
2. Consumers haven't caught up (eventual consistency gap)

### Solution — 3-Tier Fallback

`getDashboardMetrics` in `packages/modules/reporting/src/queries/get-dashboard-metrics.ts`:

```
Tier 1: rm_daily_sales (CQRS read model, filtered by today's business date)
   ↓ if zero results
Tier 2: Operational tables (orders + tenders), filtered by today's business date
   ↓ if zero results
Tier 3: Operational tables, ALL TIME (no date filter)
```

Frontend labels update dynamically: "Total Sales Today" vs "Total Sales" based on which tier was used.

### Cents → Dollars at Consumer Boundary

Reporting event consumers MUST convert cents to dollars:
```typescript
// ✅ Correct — consumers convert at boundary
const totalDollars = eventData.totalCents / 100;

// ❌ Wrong — storing raw cents in NUMERIC(19,4) column
const totalDollars = eventData.totalCents; // 100x too large!
```

### Backfill Route

`POST /api/v1/reports/backfill` rebuilds `rm_daily_sales` and `rm_item_sales` from operational tables. Use for seed data or after fixing consumer bugs.

## 112. Onboarding System

### Architecture

```
/settings/onboarding (page.tsx → onboarding-content.tsx)
├── useOnboardingStatus (hook)
│   ├── localStorage: skippedPhases, manuallyCompleted, completedAt
│   ├── sessionStorage: API completion cache (stale-while-revalidate)
│   └── Parallel API checks (~15 calls, 5s timeout each)
├── OnboardingPhase (collapsible section with progress bar)
│   └── OnboardingStep (expandable card with action button/toggle)
└── SetupStatusBanner (dashboard, zero API calls)
```

### 10 Phases

| # | Phase | Steps | Module Gate |
|---|---|---|---|
| 1 | Organization & Locations | 4 | — |
| 2 | Users & Roles | 3 | — |
| 3 | Catalog & Products | 5 | catalog |
| 4 | Inventory & Vendors | 5 | inventory |
| 5 | Customer Data | 3 | customers |
| 6 | Accounting | 5 | accounting |
| 7 | POS Configuration | 4 | orders |
| 8 | F&B Setup | 6 | pos_fnb |
| 9 | Reporting & AI | 3 | reporting |
| 10 | Go Live Checklist | 4 | — |

### Auto-Detection

`useOnboardingStatus` fires parallel HEAD/GET requests to check if data exists:
- `GET /api/v1/profit-centers` → has profit centers?
- `GET /api/v1/terminals?limit=1` → has terminals?
- `GET /api/v1/catalog/items?limit=1` → has catalog items?
- etc.

Results cached in `sessionStorage('oppsera_onboarding_cache')` with 5-minute TTL.

### Go Live Logic

```
all_phases_complete: every non-skipped, enabled-module phase → all steps done
verify_gl: accounting disabled OR all accounting steps complete
test_order: manual toggle (user confirms they placed a test order)
final_review: auto-completes when all other go_live steps pass
```

### Dashboard Setup Status Banner

`SetupStatusBanner` in `dashboard-content.tsx`:
- Reads `localStorage('oppsera_onboarding_completed_at')` and `sessionStorage('oppsera_onboarding_cache')` only
- Zero API calls — purely reads cached state
- Green banner: "Your system is all set up" with go-live date
- Red banner: "Complete your business setup" with progress bar and percentage
- Links to `/settings/onboarding`

## 113. F&B Floor & Menu Hook Caching Patterns

### Module-Level Snapshot Cache (Floor)

```typescript
// Module-level — survives React Query GC and component unmounts
const _snapshotCache = new Map<string, { data: FloorPlanData; ts: number }>();
const SNAPSHOT_TTL = 30 * 60 * 1000; // 30 minutes

// In useFnbFloor:
const { data } = useQuery({
  queryKey: ['fnb-floor', roomId],
  queryFn: fetchFloor,
  initialData: () => _snapshotCache.get(roomId)?.data, // Instant cold start
  staleTime: 5 * 60 * 1000,
  gcTime: 30 * 60 * 1000,
  refetchInterval: 20 * 60 * 1000, // Floor plans rarely change
});
```

### In-Flight Promise Deduplication (Menu)

```typescript
let _menuFetchPromise: Promise<MenuData> | null = null;
let _menuCache: { data: MenuData; ts: number } | null = null;

function fetchMenu(tenantId: string, locationId: string): Promise<MenuData> {
  if (_menuCache && Date.now() - _menuCache.ts < 5 * 60 * 1000) {
    return Promise.resolve(_menuCache.data);
  }
  if (_menuFetchPromise) return _menuFetchPromise; // Deduplicate
  _menuFetchPromise = apiFetch('/api/v1/catalog/pos', { ... })
    .then(data => { _menuCache = { data, ts: Date.now() }; return data; })
    .finally(() => { _menuFetchPromise = null; });
  return _menuFetchPromise;
}
```

### Key Rules

1. Module-level caches survive component unmounts and React Query GC
2. `initialData` provides instant cold starts — no loading spinner on remount
3. F&B floor polls every 20 minutes (floor plans rarely change during shift)
4. F&B menu refreshes every 5 minutes with background fetch
5. Floor hook listens for POS visibility resume events for auto-refresh
6. Tab hook uses AbortController to cancel in-flight requests on unmount
7. Tab hook clears stale data on tab switch to prevent UI confusion

## 114. Intelligent AccountPicker Suggestions

### Suggestion Engine Architecture

`AccountPicker` in `apps/web/src/components/accounting/account-picker.tsx` provides two suggestion engines:

1. **Hint-based suggestions**: Static maps of role→account name patterns
   - `REVENUE_HINTS`: ["Sales", "Revenue", "Income"] for revenue role
   - `COGS_HINTS`: ["Cost of Goods", "COGS", "Cost of Sales"]
   - `INVENTORY_HINTS`: ["Inventory", "Merchandise"]
   - etc. for returns, discount, cash, clearing, fee, tax, expense roles

2. **Semantic grouping**: Dynamic mapping of department names to GL accounts
   - Builds `SEMANTIC_GROUPS` map from department name tokens (e.g., "Food", "Beverage", "Pro Shop")
   - Maps tokens to account names (e.g., "Food" → accounts containing "Food")
   - When user maps "Sandwiches" sub-department, suggests GL accounts in the same semantic group as "Food"

### Scoring

```
score = tokenOverlapCount / totalTokens
penalty = -0.1 for generic accounts ("Other Revenue", "Miscellaneous", "General")
final = score - penalty
```

Suggestions sorted by score descending, top 5 shown with "Suggested" badge.

### Portal-Based Dropdown

- Uses `createPortal` to `document.body` for z-index isolation
- Repositions on scroll/resize via `useEffect` with IntersectionObserver
- Closes on click-outside, Escape key, or blur

## 115. Guest Pay (QR Code Pay at Table)

### Architecture

```
Guest scans QR code → /(guest)/pay/[token]/ → Guest Pay page
  ├── Load session by token (GET /api/v1/fnb/guest-pay/[token])
  ├── Display check summary + tip selection
  ├── Member auth (optional) → charge to house account
  └── Payment → simulateGuestPayment (V1) → mark session paid
```

### Session Lifecycle

```
active → paid       (payment completed)
active → expired    (cron job: expireGuestPaySessions)
active → invalidated (manual: invalidateGuestPaySession)
active → superseded (new session created for same tab)
```

### Key Rules

1. Token is 256-bit base64url (crypto-random, unguessable)
2. Tip settings are SNAPSHOTTED at session creation — immutable for active session
3. Only one active session per tab — creating new one supersedes old
4. `/(guest)/` layout is independent — no sidebar, no auth, minimal JS
5. V1 uses `simulateGuestPayment` — no real payment processor integration yet

## 116. Member Portal App

### Architecture

Standalone Next.js 15 app at `apps/member-portal/` with independent auth:

```
[tenantSlug]/login → portal token → (portal)/ pages
```

### Auth Pattern

```typescript
// Portal token (NOT Supabase, NOT main app JWT)
const token = createPortalToken({ customerId, tenantId, membershipId });

// Middleware (separate from withMiddleware)
withPortalAuth(handler); // Validates portal JWT, sets ctx.customer
```

### Key Rules

1. Portal tokens are SEPARATE from main app JWTs
2. Portal does NOT use Supabase auth
3. Multi-tenant discovery via `[tenantSlug]/` dynamic routes
4. `PORTAL_DEV_BYPASS` env var for local dev
5. Portal calls main web app APIs via internal HTTP when needed

## 117. GL Remap Workflow

### Flow

```
1. User saves new GL mapping
2. If enable_auto_remap: tryAutoRemap() runs automatically
3. Manual: preview → confirm → execute batch remap
4. Each remap: void old GL entry + post new corrected GL entry
```

### Key Rules

1. Remap is idempotent via `sourceReferenceId`
2. Original GL entry is VOIDED (not deleted) — audit trail preserved
3. Auto-remap is opt-in via `accounting_settings.enable_auto_remap` (migration 0143)
4. Preview available regardless of auto-remap setting
5. Remap failures never block mapping save — logged, best-effort

## 118. COA Governance

### Account Merge

Reassigns all `gl_journal_lines` from source → target, deactivates source. Validates: same `accountType`, same `normalBalance`, not control accounts.

### CSV Import

Parses CSV → validates per row → creates accounts atomically. Invalid rows don't block valid ones. `dryRun: true` returns validation only.

### COA Health

`getCoaHealth(tenantId)` checks: orphan accounts, classification consistency, hierarchy depth (max 4), duplicates, inactive accounts with non-zero balances.

## 119. Admin Impersonation

### Flow

```
POST /api/v1/auth/impersonate { tenantId, userId }
→ Creates session row → Returns impersonation JWT
→ All API calls increment action_count + audit log with session ID
POST /api/v1/auth/impersonate/end → Sets endedAt
```

### Key Rules

1. Time-limited (auto-expire via `expires_at`)
2. ALL actions audit-logged with `impersonation_session_id`
3. `ImpersonationBanner` component shows active state in UI
4. Admin can only impersonate users in tenants they have access to
5. `useSearchParams` on `/impersonate` page MUST be wrapped in Suspense (Next.js 15)

## 120. F&B Payment Tier 3

### Payment Methods Added

| Method | Status | Backend | Frontend |
|---|---|---|---|
| Gift card | V1 (balance lookup) | `GET /fnb/payments/gift-card-balance?cardNumber=` | Balance display |
| House account | V1 | `chargeGuestMemberAccount` command | Member search + charge |
| Loyalty | Stub | Routes scaffolded | UI placeholder |
| NFC | Stub | Routes scaffolded | UI placeholder |
| QR code (Guest Pay) | V1 (simulated) | See §115 | Guest-facing page |

### FnbPaymentView

Expanded from 332 → 619 lines. Now includes:
- Payment adjustments panel
- Gift card balance check
- House account member lookup
- Fractional split tender support
- Enhanced cash keypad

---

## 121. Semantic Dual-Mode Pipeline Architecture

### Pipeline Modes

The semantic pipeline now supports two execution modes, selected automatically by the intent resolver:

| Mode | Trigger | Flow | Best For |
|---|---|---|---|
| **Mode A (Metrics)** | Question maps to registry metrics | intent → compile → execute → narrate | Known KPIs, standard metrics |
| **Mode B (SQL)** | Question requires arbitrary data access | intent → generate SQL → validate → execute → retry on failure → narrate | Ad-hoc queries, ERP data exploration |

### SQL Generation Safety Stack

Defense-in-depth for LLM-generated SQL (all layers required):

1. **RLS (primary)**: Postgres Row-Level Security filters by `tenant_id` — even if SQL is wrong, data is isolated
2. **SQL Validator**: `validateGeneratedSql()` blocks DDL, DML, dangerous functions, multi-statement injection
3. **Table Whitelist**: Only tables in the schema catalog are allowed
4. **Tenant Isolation**: `WHERE tenant_id = $1` is required in all queries
5. **Row Limit**: LIMIT clause required (max 500), except for aggregate queries (COUNT/SUM/AVG)

### SQL Validator Rules

```typescript
// sql-validator.ts — NEVER relax these rules
const rules = {
  maxLength: 10_000,       // chars
  maxRowLimit: 500,        // LIMIT value
  mustStartWith: /^(SELECT|WITH)\b/i,
  noDDL: true,             // CREATE, ALTER, DROP, TRUNCATE, etc.
  noDML: true,             // INSERT, UPDATE, DELETE, MERGE
  noTxControl: true,       // BEGIN, COMMIT, ROLLBACK
  noUtility: true,         // VACUUM, EXPLAIN, ANALYZE
  noDangerousFns: true,    // pg_sleep, set_config, dblink, etc.
  noComments: true,         // -- and /* */
  noSemicolons: true,      // multi-statement prevention (trailing ; stripped)
  requireTenantId: true,   // tenant_id = $1 in WHERE
  requireLimit: true,      // except aggregate-only queries
  tableWhitelist: true,    // only schema catalog tables
};
```

### SQL Auto-Retry Pattern

```
Failed SQL + Error message → LLM (sql-retry.ts) → Corrected SQL → Validate → Execute
```

- Max 1 retry (controls latency + token cost)
- Cumulative token/latency tracking across retries
- Corrected SQL is re-validated before execution
- If retry fails, falls back to ADVISOR MODE narrative

### LLM Response Cache vs Query Cache

| Cache | Key | TTL | Purpose |
|---|---|---|---|
| **Query Cache** | `(tenantId, sql, params)` | 5 min | Avoid re-executing identical SQL |
| **LLM Response Cache** | `(tenantId, promptHash, message+data, history)` | 5 min | Avoid re-generating identical narratives |

Both are in-memory LRU. Always check both before making calls.

### Post-Pipeline Enrichments

Run after execution, never block the response:
- `generateFollowUps()` — context-aware suggested questions
- `inferChartConfig()` — auto-detect chart type from data shape
- `scoreDataQuality()` — confidence score from row count, execution time, date range

---

## 122. PMS Module Architecture

### Module Structure

```
packages/modules/pms/
├── src/
│   ├── commands/          # 55+ commands (reservation lifecycle, housekeeping, etc.)
│   ├── queries/           # 60+ queries (calendar views, reports, etc.)
│   │   └── index.ts       # Barrel exports with types
│   ├── events/
│   │   ├── types.ts       # PMS_EVENTS constant + PmsEventType
│   │   ├── payloads.ts    # Event payload types
│   │   └── consumers.ts   # Calendar/occupancy projection consumers
│   ├── helpers/
│   │   ├── pricing-engine.ts          # Dynamic rate computation
│   │   ├── room-assignment-engine.ts  # Weighted room scoring
│   │   ├── bootstrap-properties.ts    # Location → property bootstrap
│   │   ├── template-renderer.ts       # Message template rendering
│   │   ├── sms-gateway.ts            # SMS sending (stub)
│   │   └── stripe-gateway.ts         # Payment processing (stub)
│   ├── jobs/              # Background jobs (nightly charges, no-show, auto-dirty)
│   ├── state-machines.ts  # Reservation + room status FSMs
│   ├── permissions.ts     # PMS_PERMISSIONS, PMS_ROLE_PERMISSIONS
│   ├── validation.ts      # All Zod schemas
│   ├── errors.ts          # PMS-specific error classes
│   ├── types.ts           # Enums + shared types
│   └── index.ts           # Module barrel exports
```

### Table Naming Convention

All PMS tables use the `pms_` prefix:
```
pms_properties, pms_room_types, pms_rooms, pms_rate_plans,
pms_reservations, pms_folios, pms_folio_entries, ...
```

CQRS read models use `rm_pms_` prefix:
```
rm_pms_calendar_segments, rm_pms_daily_occupancy,
rm_pms_revenue_by_room_type, rm_pms_housekeeping_productivity
```

### State Machines

```typescript
// Reservation lifecycle
const RESERVATION_TRANSITIONS = {
  confirmed:   ['checked_in', 'cancelled', 'no_show'],
  checked_in:  ['checked_out'],
  checked_out: [], // terminal
  cancelled:   [], // terminal
  no_show:     [], // terminal
};

// Room status lifecycle
const ROOM_STATUS_TRANSITIONS = {
  clean:      ['occupied', 'out_of_order', 'inspected'],
  occupied:   ['dirty'],
  dirty:      ['cleaning', 'out_of_order'],
  cleaning:   ['inspected', 'clean'],
  inspected:  ['clean', 'occupied'],
  out_of_order: ['dirty', 'clean'],
};
```

Use `assertReservationTransition(currentStatus, targetStatus)` — throws `InvalidStatusTransitionError` on invalid moves.

### Own Idempotency & Outbox

PMS has its own `pms_idempotency_keys` and `pms_outbox` tables (separate from core). This enables:
- Independent microservice extraction
- PMS-specific retry policies
- Isolated event processing

### Pricing Engine

`computeDynamicRate(context, rules)` evaluates pricing rules in priority order:
- Occupancy-based (high demand = higher rates)
- Day-of-week
- Lead-time (last-minute vs advance booking)
- Length-of-stay (longer = discount)
- Demand-based

Results logged to `pms_pricing_log` for audit.

### Room Assignment Engine

`scoreRoom(room, context, preferences)` computes a weighted score:
- Floor preference (matching guest's preferred floor)
- View preference
- Accessibility requirements
- Loyalty tier benefits
- Previous stay history (return guest gets same room)
- Room features match

`rankRooms(rooms, context)` sorts by score descending.

---

## 123. AI Training & Evaluation Platform

### Admin Train-AI Section

The admin app's "Train AI" section provides tools for improving AI response quality:

| Page | Purpose | API Route |
|---|---|---|
| Examples | Golden few-shot training data management | `/eval/examples` + `bulk-import` + `export` |
| Turns | Individual turn review + admin corrections | `/eval/turns/[id]` + `/promote-correction` |
| Batch Review | Bulk review workflows for pending turns | `/eval/batch-review` |
| Comparative | A/B comparison of pipeline versions | `/eval/comparative` (stub) |
| Conversations | Multi-turn conversation analysis | `/eval/conversations` |
| Cost | Token usage + cost analytics | `/eval/cost` |
| Experiments | A/B experiment management | `/eval/experiments` |
| Playground | Interactive testing sandbox | `/eval/playground` |
| Regression | Automated regression testing | `/eval/regression` |
| Safety | Safety evaluation engine | `/eval/safety` |

### `useEvalTraining()` Hook

Single hook centralizing all training operations:

```typescript
const {
  // Examples
  examples, createExample, updateExample, deleteExample,
  bulkImportExamples, exportExamples, getEffectiveness,
  // Batch Review
  batchReviewItems, submitBatchReview,
  // Experiments
  experiments, createExperiment, runExperiment,
  // Regression
  regressionResults, runRegression,
  // Cost
  costAnalytics,
  // Safety
  safetyResults, runSafetyEval,
  // Conversations
  conversations, analyzeConversation,
} = useEvalTraining();
```

### Example Effectiveness Tracking

Each golden example tracks its impact:
- How often it's retrieved as a few-shot example
- Whether turns using it score higher
- Admin rating of the example's quality

API: `GET /api/v1/eval/examples/[id]/effectiveness`

---

## 124. Import System Architecture

### Unified Import Framework

```
apps/web/src/lib/import-registry.ts     # Available import types
apps/web/src/components/import/          # Shared wizard components
apps/web/src/hooks/use-import-wizard.ts  # Wizard state management
apps/web/src/hooks/use-import-jobs.ts    # Background job tracking
apps/web/src/hooks/use-import-progress.ts # Progress monitoring
apps/web/src/hooks/use-import-completion.ts # Completion callbacks
```

### Import Types

| Type | Module | Validator | Parser |
|---|---|---|---|
| Catalog/Inventory | `@oppsera/module-catalog` | `inventory-import-validator.ts` | `inventory-import-parser.ts` |
| Customers | `@oppsera/module-customers` | CSV validation in command | `bulkImportCustomers` |
| Staff | Core | Via admin API | `use-staff-import.ts` |
| COA | `@oppsera/module-accounting` | `importCoaFromCsv` | Built-in CSV parser |

### Import Flow

1. **Upload**: User selects file type + uploads CSV/JSON
2. **Parse**: Column detection + mapping UI
3. **Validate**: Row-by-row validation with error reporting (partial imports supported)
4. **Preview**: Show valid rows + error summary
5. **Execute**: Background job processes rows in batches
6. **Complete**: Success/error summary with downloadable error report

### Key Rules

- Invalid rows don't block valid ones (partial import)
- All imports are idempotent via dedup keys
- Import logs stored per entity type (e.g., `list-catalog-import-logs`)
- Settings page at `/settings/data-imports` provides centralized access

---

## 125. Customer Tag Management

### Tag Types

| Type | Description | Implementation |
|---|---|---|
| Manual tags | User-applied labels | `applyTagToCustomer`, `removeTagFromCustomer` |
| Smart tags | Auto-applied via rules | `createSmartTagRule`, `evaluateSmartTags` |

### Smart Tag Rules

Rules define conditions that auto-tag customers:
- Condition types: visit count, spend threshold, last visit date, membership status
- Evaluation: periodic background job or on-demand via `evaluateSmartTags`
- History: `getSmartTagEvaluationHistory` tracks when rules fired
- Toggleable: `toggleSmartTagRule` enables/disables without deleting

### Tag Audit Trail

All tag operations are logged:
- `getTagAuditLog(tagId)` returns chronological history
- Tracks: who applied/removed, when, via rule or manual
- Tags use soft-delete (`archiveTag` / `unarchiveTag`)

---

## 126. Module Independence Pattern (PMS Example)

When creating new modules, follow the PMS module's pattern for maximum independence:

### Own Infrastructure Tables

```typescript
// Module-specific outbox (not shared with core)
export const pmsOutbox = pgTable('pms_outbox', { ... });

// Module-specific idempotency keys
export const pmsIdempotencyKeys = pgTable('pms_idempotency_keys', { ... });
```

### Own Audit Log

```typescript
export const pmsAuditLog = pgTable('pms_audit_log', { ... });
```

### Table Prefix

All tables use a consistent module prefix (`pms_`, `fnb_`, etc.) to:
- Avoid name collisions across modules
- Make SQL debugging easier (which module owns a table is obvious)
- Enable clean microservice extraction

### Permission Namespace

```typescript
export const PMS_PERMISSIONS = {
  'pms.properties.view': { ... },
  'pms.properties.manage': { ... },
  'pms.reservations.create': { ... },
  // ... always use module prefix
} as const;
```

### Export Structure

Module `index.ts` should export in this order:
1. Module metadata (`MODULE_KEY`, `MODULE_NAME`, `MODULE_VERSION`)
2. Schema re-exports (from `@oppsera/db`)
3. Validation schemas + input types
4. Permissions
5. Types + enums
6. State machines (if applicable)
7. Events (types + consumers)
8. Errors
9. Helpers
10. Commands (one per file)
11. Queries (barrel from `queries/index.ts`)
12. Background jobs

---

## 127. LLM Integration Best Practices

### System Prompt Conventions

1. **Output contract first**: State the expected output format (JSON, markdown) at the top of the system prompt
2. **CRITICAL RULES in caps**: Important constraints (SELECT only, tenant isolation) get capitalized headings
3. **Table distinctions**: When similar tables exist (users vs customers), explicitly document the difference
4. **Money conventions**: Always document which tables use cents vs dollars
5. **Common patterns**: Include SQL/code examples for the most common query types
6. **Context injection**: Append current date, tenant ID, user role, location at the bottom

### LLM Response Parsing

Always handle markdown fences and surrounding prose:

```typescript
function parseLLMResponse(raw: string): unknown {
  let cleaned = raw.trim();
  // Strip markdown fences
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
  }
  // Extract JSON from surrounding prose
  if (!cleaned.startsWith('{')) {
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) cleaned = jsonMatch[0];
  }
  return JSON.parse(cleaned);
}
```

### Error Handling for LLM Calls

- **Rate limit detection**: Check error message for "rate limit" and show user-friendly message
- **Never throw to user**: Wrap all LLM calls in try/catch, return graceful fallbacks
- **ADVISOR MODE**: When data queries fail, still call LLM with business context to provide advice
- **Token tracking**: Always accumulate `tokensInput` + `tokensOutput` across all LLM calls in a pipeline run
- **Latency tracking**: Record `startMs` before each LLM call, accumulate across pipeline

### Caching Strategy

- **Query results**: Cache SQL results for 5 minutes (data changes slowly)
- **LLM narratives**: Cache narrative responses keyed on question + data fingerprint
- **Never cache**: Intent resolution (context-dependent), validation results
- **Cache invalidation**: Admin API endpoint for manual cache flush per tenant

### Best-Effort Eval Capture

```typescript
// ALWAYS fire-and-forget — never block the response
void captureEvalTurnBestEffort({
  id: generateUlid(),  // pre-generate ID for fire-and-forget
  // ... capture data
}).catch(() => {}); // swallow errors silently
```

### RAG Few-Shot Injection

- Retrieve similar past queries as examples in system prompt
- Best-effort — RAG failure never blocks generation
- Filter by mode (SQL vs metrics) for relevance
- Limit to 3 examples to control prompt size

---

## Local Server Fix (Windows)

### Problem
Next.js dev server on Windows crashes with `EPERM: operation not permitted, open '.next/trace'` due to orphaned Node processes holding file locks.

### Fix Procedure
1. **Kill ALL Node via PowerShell** (bash `taskkill` cannot kill its own parent):
   ```powershell
   powershell.exe -NoProfile -Command 'Stop-Process -Name node -Force -ErrorAction SilentlyContinue'
   ```
2. **Wait**: `sleep 3`
3. **Verify zero processes**: `powershell.exe -NoProfile -Command 'Get-Process node -ErrorAction SilentlyContinue | Measure-Object | Select-Object -ExpandProperty Count'`
4. **Remove .next**: `rm -rf apps/web/.next`
5. **Restart**: `cd apps/web && NEXT_TELEMETRY_DISABLED=1 npx next dev --turbopack --port 3000`

### Rules to Prevent Recurrence
- **R1**: Always use `.cjs` extension for CommonJS scripts in packages with `"type": "module"` in `package.json`. Never use `.js` with `require()` in ESM packages.
- **R2**: Never create sibling dynamic route segments with different slug names (e.g., `[id]` and `[providerId]` under the same parent). Next.js App Router requires a single slug name per path segment level.
- **R3**: When killing Node processes on Windows, always use PowerShell `Stop-Process -Name node -Force`, never bash `taskkill /F /IM node.exe` (which runs inside Node and can't kill its own process tree).
- **R4**: After any abnormal dev server shutdown on Windows, always kill all Node processes and delete `.next` before restarting — partial `.next` state causes `middleware-manifest.json` / `routes-manifest.json` ENOENT errors.

---

## 128. Payment Gateway Architecture

### Provider Registry Pattern

Payment providers implement a common interface (`PaymentProvider`) and register via factory:

```typescript
// packages/modules/payments/src/providers/registry.ts
providerRegistry.register('cardpointe', (credentials, merchantId) => {
  return new CardPointeProvider(credentials, merchantId);
});
```

### Facade Pattern

All payment operations go through `PaymentsFacade` — a singleton with 8 methods:

```typescript
// Usage from any caller (POS, online, recurring)
const result = await paymentsFacade.sale(ctx, {
  amount: '100.00',        // dollar strings for gateway
  token: 'cardSecureToken',
  orderId: 'ORD-123',
  clientRequestId: ulid(), // per-operation idempotency
});
```

### Payment Intent Lifecycle

```
created → authorized → captured → voided
                    → declined
                    → error → resolved
       → refunded (partial or full)
```

### Provider Resolution Order

1. Resolve provider + credentials (read-only, OUTSIDE transaction)
2. Resolve merchant account (terminal-specific → location-specific → tenant default)
3. Enter `publishWithOutbox` transaction
4. Check idempotency (per-operation `clientRequestId`)
5. Call external provider API
6. Record transaction + update intent status
7. Emit event

### Key Rules

- **Provider resolution outside transactions** — keeps DB locks short, avoids holding connections during external API calls
- **Per-operation idempotency** — each void/refund/capture on the same intent has its own `clientRequestId`
- **Dollar strings for gateway, cents for POS** — gateways use dollar strings ("100.00"), POS uses integer cents. Convert at boundary: `(cents / 100).toFixed(2)`
- **Never expose raw decline codes** — use `interpretResponse()` which returns separate `userMessage` (for cardholder) and `operatorMessage` (for staff)
- **Encrypted credentials at rest** — AES-256-GCM via `encryptCredentials()`/`decryptCredentials()` helpers
- **Terminal-level MID routing** — terminals can be assigned to specific merchant accounts (not just location-level)

### Surcharge Compliance

```typescript
// 3-level scoping (most specific wins):
// 1. Terminal-specific settings
// 2. Location-specific settings
// 3. Tenant-wide settings
const settings = await resolveSurchargeSettings(tenantId, locationId, terminalId);
const surcharge = calculateSurcharge(amountCents, settings, cardType);
// Pure function with compliance checks: credit-only, debit exemption, prepaid exemption, state prohibition
```

---

## 129. ERP Workflow Engine

### Tier-Based Configuration

Business tiers control default automation levels:

| Tier | Behavior | Use Case |
|---|---|---|
| SMB | Automatic + invisible | Least friction, owner-operators |
| MID_MARKET | Automatic + visible | See what's happening, growing businesses |
| ENTERPRISE | Manual + approvals | Maximum control, multi-location |

### Workflow Config Resolution

```typescript
// Cascading fallback (most specific wins):
const config = await getWorkflowConfig(tenantId, 'accounting', 'journal_posting');
// 1. Check DB: erpWorkflowConfigs row for this tenant+module+workflow
// 2. Fall back: TIER_WORKFLOW_DEFAULTS[tenant.business_tier].accounting.journal_posting
// 3. Ultimate fallback: { autoMode: true, approvalRequired: false, userVisible: false }
```

### Key Rules

- **Always use the workflow engine** — never query `erpWorkflowConfigs` directly
- **Cache is tenant-scoped with 60s TTL** — call `invalidateWorkflowCache(tenantId)` after config changes
- **Cron limitations**: Vercel Hobby = daily only; 15-minute intervals require Vercel Pro
- **Close orchestrator is idempotent** — checks `erpCloseOrchestratorRuns` for existing run per tenant+businessDate
- **Business date logic for close times** — if close time < 12:00 (early morning), business date = yesterday

---

## 130. Role Access Scoping

### Three-Level Access Restriction

Roles can be restricted at location, profit center, or terminal level:

```
role_location_access       → restrict which locations a role can access
role_profit_center_access  → restrict which profit centers within allowed locations
role_terminal_access       → restrict which terminals within allowed profit centers
```

### Key Convention

**Empty table = unrestricted.** This is the opposite of permissions (which are additive):

- Role with NO rows in `role_location_access` → can see ALL locations
- Role with 1+ rows → restricted to ONLY those specific locations
- Same pattern for profit centers and terminals

### Query Pattern

```typescript
// Check if role has location access
const restrictions = await db.select().from(roleLocationAccess)
  .where(eq(roleLocationAccess.roleId, roleId));

// Empty = unrestricted
if (restrictions.length === 0) return allLocations;

// Otherwise, filter to only allowed locations
const allowedIds = restrictions.map(r => r.locationId);
return locations.filter(l => allowedIds.includes(l.id));
```

---

## 131. SuperAdmin Portal Conventions

### Separate Auth System

Platform admins use their own auth (JWT + bcrypt), completely separate from tenant users (Supabase Auth):

```typescript
// Admin context for calling core commands
const ctx = buildAdminCtx(session, tenantId);
// ctx.user.id = 'admin:{adminId}', ctx.isPlatformAdmin = true
```

### Permission Middleware

```typescript
export const GET = withAdminPermission(handler, {
  module: 'tenants',
  action: 'view',
});
// Checks platform_admin_role_permissions for the admin's assigned roles
```

### Timeline Writes (Fire-and-Forget)

```typescript
// ALWAYS fire-and-forget — never await, never throw
void writeTimelineEvent({
  tenantId,
  eventType: 'tenant.module.enabled',
  severity: 'info',
  actorId: adminId,
  metadata: { moduleKey, newMode },
});
// Errors are caught internally — timeline failures never break primary operations
```

### Financial Views are Read-Only

All admin financial support endpoints (orders, voids, refunds, GL issues, chargebacks, close batches) are investigative only — zero mutations. Use the tenant app for actual corrections.

### Health Scoring

```
Score starts at 100, with deductions:
  DLQ depth > 20: -25 (critical)
  DLQ depth > 5: -10 (elevated)
  DLQ unresolved > 24h: -15
  Error rate > 50/hr: -20
  Error rate > 10/hr: -10
  Unmapped GL events: -10
  Unposted GL > 5: -10
  No orders in 24h: -5
  Background job failures > 5: -10

Grade: A >= 90, B >= 75, C >= 60, D >= 40, F < 40
```

### Impersonation Safety

- Cannot impersonate platform admins or users of suspended tenants
- Max duration (default 60 minutes), action counting in audit log
- Restricted: no void/refund > $500, no accounting changes, no record deletion
- JWT includes `is_impersonation: true`, `impersonator_id`, `impersonation_session_id`
- Undismissible banner in tenant app during impersonation

---

## 132. POS Resilience Patterns

### Visibility Resume (Tablet Wake-from-Sleep)

POS tablets may sleep for extended periods. When the tab becomes visible after >30s:

1. Proactively refresh JWT if within 5 minutes of expiry (avoids 401 → refresh → retry)
2. Ping `/api/health` to warm Vercel serverless function (avoids cold start latency)
3. Dispatch `pos-visibility-resume` custom event on `window`

```typescript
// Any hook needing to refresh stale POS data:
useEffect(() => {
  const handler = () => { /* refresh data */ };
  window.addEventListener('pos-visibility-resume', handler);
  return () => window.removeEventListener('pos-visibility-resume', handler);
}, []);
```

### Connection Indicator

Three-state connection monitoring in POS header:
- `online` (green dot): health ping < 2s
- `slow` (amber, pulse animation): health ping > 2s
- `offline` (red WifiOff icon + label): health ping failed

Pings `/api/health` every 30s with `HEAD` request.

### Customer Cache

Module-level singleton (survives React unmount, NOT page refresh):
- Up to 500 customers, 5-min TTL
- Pre-warmed on POS layout mount
- `filterCustomersLocal()` for instant results
- `searchCustomersServer()` fallback with AbortController cancellation
- `isCacheComplete()` flag: if DB had <= 500 customers, local search is exhaustive

### Error Boundary

Mode-aware (shows "Retail POS Error" or "F&B POS Error"):
- Wraps each POS shell independently
- Preserves Zustand state on crash (data not lost)
- "Reload" button resets error boundary without losing state

---

## 133. Modifier Group Architecture

### Channel Visibility

Modifiers now support channel filtering:

```typescript
// catalog_modifier_groups.channel_visibility = ['pos', 'online', 'qr', 'kiosk']
// POS only shows modifiers where 'pos' is in channel_visibility
const posModifiers = allModifiers.filter(m =>
  m.channelVisibility?.includes('pos')
);
```

### Per-Assignment Overrides

The same modifier group can behave differently on different items:

```typescript
// catalog_item_modifier_groups (junction table) has:
// override_required, override_min_selections, override_max_selections,
// override_instruction_mode, prompt_order

// Resolution order:
// 1. Check junction table overrides (per-item behavior)
// 2. Fall back to modifier group defaults
const required = assignment.overrideRequired ?? group.required;
const min = assignment.overrideMinSelections ?? group.minSelections;
```

### Instruction Modes

Modifiers support instruction modes (none, extra, on_side):
- `allow_none`: customer can remove the modifier entirely
- `allow_extra`: customer can request extra (triggers `extra_price_delta`)
- `allow_on_side`: customer can request on the side

### Modifier Reporting

3 read model tables track modifier analytics:
- `rm_modifier_item_sales`: modifier × item × day (revenue, selection count, instruction breakdown)
- `rm_modifier_daypart`: modifier × daypart × day (for heatmap visualization)
- `rm_modifier_group_attach`: group-level attach rate (how often customers select from a group)

---

## 134. Explicit Column Selects in Queries

**Always use explicit column selects, never SELECT * on tables that receive frequent schema additions.**

Migration 0183 added columns to modifier tables, causing a 500 error in the item detail endpoint because the query used implicit `SELECT *` and the mapping type didn't include the new columns.

```typescript
// BAD — breaks when new columns are added:
const result = await tx.select().from(catalogModifierGroups).where(...);

// GOOD — explicit and stable:
const result = await tx.select({
  id: catalogModifierGroups.id,
  name: catalogModifierGroups.name,
  required: catalogModifierGroups.required,
  minSelections: catalogModifierGroups.minSelections,
  maxSelections: catalogModifierGroups.maxSelections,
}).from(catalogModifierGroups).where(...);
```

This is especially important for:
- Catalog tables (modifiers, items, categories) — frequently extended
- Payment tables — new columns for each gateway feature
- Tenant/settings tables — new configuration columns

---

## 135. CI/Build Lessons

### Destructured Array Default Values

```typescript
// BAD — undefined if string doesn't contain delimiter:
const [hours, minutes] = closeTime.split(':').map(Number);

// GOOD — always provide defaults:
const [hours = 0, minutes = 0] = closeTime.split(':').map(Number);
```

### Vercel Hobby Plan Cron

- Hobby: only `0 0 * * *` (daily at midnight UTC)
- Pro: up to every 1 minute (`* * * * *`)
- Any ERP auto-close or scheduled job design must account for the plan-specific interval

### ESLint `consistent-type-imports`

When adding `import type` statements, use the ESLint convention:

```typescript
// BAD — ESLint error on Vercel build:
import { MyType } from './types';

// GOOD:
import type { MyType } from './types';
```

### Test Mock Alignment

When module exports change (e.g., adding new commands/queries), test mocks must be updated:

```typescript
// If the real module now exports `newFunction`, mocks must include it:
vi.mock('@oppsera/module-payments', () => ({
  ...existingMocks,
  newFunction: vi.fn(), // Must be added when module export surface changes
}));
```

Use `mockReset()` instead of `clearAllMocks()` to clear `mockReturnValueOnce` queues between tests (gotcha #58).

---

## 131. Year Seed Script (`packages/db/src/seed-year.ts`)

### Purpose

Generates 366 days (~1 full year) of realistic transaction data for demo, reporting, and AI insights. Targets ~$800K–$1.2M total revenue with seasonal variation, tournament spikes, void rates, and cash/card mix.

### Usage

```bash
# Against local DB (.env.local):
pnpm tsx packages/db/src/seed-year.ts

# Against remote/production DB (.env.remote):
pnpm tsx packages/db/src/seed-year.ts --remote
```

### Key Characteristics

| Property | Value |
|---|---|
| Days | 366 (trailing from today) |
| Void rate | 8% |
| Cash ratio | 33% |
| Customer assignment | 40% of orders |
| Seasonal base | Summer $4K/day, Shoulder $2.8K/day, Winter $1.7K/day |
| Weekend multiplier | 1.4x |
| Tournament days | 5 scattered days at 3.5–5x revenue |
| Target avg order | ~$98–$120 (from weighted template combos) |
| Daily order range | 5–200 per day |
| Location split | 70% main venue / 30% secondary venue |
| Tips | Card orders get 15–22% tip; cash gets $0 |

### Deterministic PRNG

Uses `mulberry32(20260224)` seeded PRNG — same seed always produces same data. This means:
- Running twice produces **duplicate** orders (additive — no dedup)
- Safe for demo but should only be run once per clean DB
- Output is predictable for testing

### What It Creates

1. **Orders** (`orders` table) — with status `paid` or `voided`, business dates, terminal IDs
2. **Order lines** (`order_lines` table) — from weighted template combos (golf+cart+food, retail, etc.)
3. **Order line taxes** (`order_line_taxes` table) — Retail 7.5%, Food/Bev 8.25%
4. **Tenders** (`tenders` table) — cash or card, with tips on card payments
5. **Read models** (`rm_daily_sales`, `rm_item_sales`) — pre-aggregated via ON CONFLICT upsert
6. **Order counters** — safely incremented from MAX(existing) to avoid conflicts

### Additive-Only Safety

- **NEVER deletes, truncates, or drops** any existing data
- Reads existing tenant, locations, users, terminals, customers, catalog items
- Requires `pnpm db:seed` to have been run first (needs tenant + catalog data)
- Safe on production when used with `--remote` flag (adds data, doesn't modify existing)

### Order Templates (Weighted)

Templates are built dynamically from available catalog items:

| Template | Approx Value | Weight |
|---|---|---|
| Golf + cart + food + drinks | ~$131 | 5 (most common) |
| Golf + cart | ~$100 | 4 |
| Golf + food | ~$90 | 3 |
| 2x golf + 2x cart + 4 drinks | ~$232 | 3 |
| Big day (golf+retail+food) | ~$150+ | 2 |
| Retail combos | ~$40–80 | 1–2 |
| Food combos | ~$30–50 | 1–2 |

### Read Model Population

The script populates CQRS read models directly (bypassing event consumers):
- `rm_daily_sales`: daily aggregated sales per location (dollars, NUMERIC(19,4))
- `rm_item_sales`: per-item daily sales per location (dollars)
- Uses `ON CONFLICT ... DO UPDATE` for idempotent upserts

### Prerequisites

- Run `pnpm db:seed` first (creates tenant, locations, users, terminals, customers, catalog items)
- At least 2 locations (venues preferred) must exist
- At least 1 user and catalog items must exist
- `DATABASE_URL_ADMIN` or `DATABASE_URL` env var must be set

---

## 132. Portal Auth Scripts

### `tools/scripts/seed-portal-auth.ts`

Bulk-creates portal auth accounts for all customers with email addresses. Uses a shared bcrypt hash for password `member123`. Additive-only — skips customers that already have portal auth.

```bash
pnpm tsx tools/scripts/seed-portal-auth.ts           # local
pnpm tsx tools/scripts/seed-portal-auth.ts --remote   # production
```

### `tools/scripts/add-portal-member.ts`

One-off script to add a specific member with portal auth to the `sunset-golf` tenant. Creates customer record if needed, upserts portal auth with bcrypt password hash.

```bash
pnpm tsx tools/scripts/add-portal-member.ts --remote
```

---

## 133. Tenant Business Info & Content Blocks

### Schema

Two new tables (migration 0193):

- **`tenant_business_info`**: One row per tenant. Stores core identity (name, address, phone, email, logo), operations profile (access type, services/products offered, F&B level, rentals), online presence (website, booking, portal URLs, social links), and advanced metadata (industry type, business hours, year established, encrypted tax ID, photo gallery, promo video).
- **`tenant_content_blocks`**: Multiple rows per tenant, keyed by `block_key` (about, services_events, promotions, team). Stores rich text/HTML content for marketing pages.

### Backend

- **Queries**: `getBusinessInfo(tenantId)`, `getContentBlocks(tenantId)` — in `packages/core/src/settings/business-info.ts`
- **Commands**: `updateBusinessInfo(ctx, input)` (upsert pattern), `updateContentBlock(ctx, blockKey, content)` (upsert pattern)
- **Validation**: Zod schemas in `packages/shared/src/schemas/business-info.ts` — enums for access types, rental types, F&B levels, industry types, social platforms. Business hours with day/period structure. Photo gallery with sort order.
- **Tax ID**: stored encrypted (`taxIdEncrypted`), returned masked (`taxIdMasked` with bullet characters + last 4)
- **API routes**: `GET/PATCH /api/v1/settings/business-info`, `GET/PATCH /api/v1/settings/content-blocks`

### Frontend

- **Settings page**: `/settings/general` — code-split (thin `page.tsx` + `general-info-content.tsx`)
- **5 collapsible sections**: Business Information, Operations, Online Presence, Content Blocks, Advanced
- **Sub-components**: `BusinessHoursEditor` (7-day schedule with periods), `RichTextEditor` (contentEditable with bold/italic/link toolbar), `SocialLinksEditor` (platform icons + URL inputs), `TagInput` (token-based input for services/products)
- **Hook**: `useBusinessInfo()` — loads both business info + content blocks, provides `saveInfo()` and `saveBlock()` mutations with optimistic updates
- **Auto-save with dirty tracking**: section-level save buttons, success toasts

### Merchant Services Settings

New tabbed UI under `/settings/merchant-services` (was `/settings/payment-processors`):

- **ProvidersTab**: payment provider CRUD with credential management
- **MerchantAccountsTab**: merchant account CRUD with terminal assignment
- **DevicesTab**: physical terminal device management (HSN mapping)
- **TerminalsTab**: POS terminal assignment to merchant accounts
- **WalletsTab**: Apple Pay / Google Pay configuration

### Bug Fixes in This Commit

- **Modifiers page**: fixed category filter to use `g.categoryId` instead of `g.category_id` (Drizzle column name mismatch)
- **Inventory ItemEditDrawer**: fixed item type display using `getItemTypeGroup()` for correct grouping
- **Inventory ActivitySection**: fixed movements display to use `Number()` conversion on numeric fields and proper date formatting
- **F&B module index**: fixed duplicate `ReceiptData` export (renamed to `FnbReceiptData`)
- **Catalog import-inventory**: added `createdItemIds` to validation failure path to fix `publishWithOutbox` inference
- **PMS occupancy projector**: added type annotation for empty events array

---

## 134. Profit Centers & Terminal Selection API Consolidation

### Problem

The Profit Centers Settings page and Terminal Selection Screen each required 3+ sequential API calls to load data (locations → profit centers → terminals), creating waterfall latency and cascading loading states. Additionally, the terminal selection screen had no role-based access filtering — all users saw all terminals regardless of their role's access scope.

### Solution: Single-Fetch + Client-Side Filtering

Two new consolidated queries replace the N+3 cascading API calls:

#### `getSettingsData(tenantId)` — Settings Page

Single query returns all locations, profit centers, and terminals for the tenant:

```typescript
// packages/core/src/profit-centers/queries/get-settings-data.ts
export async function getSettingsData(tenantId: string): Promise<SettingsData> {
  return withTenant(tenantId, async (tx) => {
    const [locationRows, pcRows, terminalRows] = await Promise.all([
      tx.execute(sql`SELECT ... FROM locations ...`),
      tx.execute(sql`SELECT ... FROM terminal_locations ...`),
      tx.execute(sql`SELECT ... FROM terminals ...`),
    ]);
    return { locations, profitCenters, terminals };
  });
}
```

- **API route**: `GET /api/v1/profit-centers/settings-data` (entitlement: `platform_core`, permission: `settings.view`)
- **Frontend hook**: `useProfitCenterSettings()` — single fetch, client-side filtering via helper functions

#### `getTerminalSelectionAll(tenantId, roleId?)` — Terminal Selection Screen

Single query returns all selection data with role-based access filtering:

```typescript
// packages/core/src/profit-centers/queries/get-terminal-selection-all.ts
export async function getTerminalSelectionAll(
  tenantId: string,
  roleId?: string | null,
): Promise<TerminalSelectionAllData> {
  // Fetch role access restrictions + entity data in parallel
  const [accessRestrictions, entityData] = await Promise.all([
    roleId ? fetchRoleAccess(tenantId, roleId) : Promise.resolve(null),
    withTenant(tenantId, async (tx) => { /* 3 parallel queries */ }),
  ]);
  // Apply role-based access filtering (empty access table = unrestricted)
  if (accessRestrictions?.locationIds.length > 0) { /* filter locations */ }
  if (accessRestrictions?.profitCenterIds.length > 0) { /* filter PCs */ }
  if (accessRestrictions?.terminalIds.length > 0) { /* filter terminals */ }
  return { locations, profitCenters, terminals };
}
```

- **API route**: `GET /api/v1/terminal-session/all?roleId=xxx` (entitlement: `platform_core`)
- **Frontend hook**: `useTerminalSelection(options?)` — single fetch, derived lists via `useMemo`, auto-selects single options

### Key Rules

1. **All 3 entity queries run in parallel** inside `withTenant` — `Promise.all([...])`, never sequential
2. **Role access filtering is additive restriction** — empty `role_location_access` = unrestricted (see gotcha §349)
3. **Role access tables have no RLS** — fetched via global `db.query`, not `withTenant`. Entity data uses `withTenant` for RLS.
4. **Client-side filtering replaces cascading API calls** — `filterProfitCenters()`, `filterTerminalsByLocation()`, `filterTerminalsByPC()` are pure functions in `use-profit-center-settings.ts`
5. **`useTerminalSelection` auto-selects single options** — if only one site, venue, PC, or terminal exists, it's auto-selected via `useEffect` chains (same pattern as before, but now instant since data is local)

### `useProfitCenterSettings` Hook Pattern

```typescript
// apps/web/src/hooks/use-profit-center-settings.ts
export function useProfitCenterSettings() {
  // Single fetch → { locations, profitCenters, terminals }
}
export function filterProfitCenters(allPCs, locationId): ProfitCenter[]
export function filterTerminalsByLocation(allTerminals, allPCs, locationId): Terminal[]
export function filterTerminalsByPC(allTerminals, profitCenterId): Terminal[]
export function useVenuesBySite(locations): Map<string, LocationForSettings[]>
```

The orchestrator (`profit-centers-content.tsx`) uses these helpers for instant filtering when the user clicks through the location tree — no API calls after the initial load.

---

## 135. Merchant Services Settings — React Query Hooks

### Pattern

The merchant services UI under `/settings/merchant-services` uses React Query (`@tanstack/react-query`) instead of raw `useEffect` + `apiFetch` for all data fetching. This provides automatic caching, background refetching, and mutation invalidation.

### Hooks (`apps/web/src/hooks/use-payment-processors.ts`)

| Hook | Query Key | Purpose |
|---|---|---|
| `usePaymentProviders()` | `['payment-providers']` | List all providers with credential status + MID count |
| `useProviderCredentials(providerId)` | `['provider-credentials', id]` | Credentials for a specific provider (no decrypted values) |
| `useMerchantAccounts(providerId)` | `['merchant-accounts', id]` | Merchant accounts with setup details (HSN, ACH, processing opts) |
| `useTerminalAssignments()` | `['terminal-assignments']` | Terminal-to-MID assignments with enriched names |
| `useDeviceAssignments(providerId?)` | `['device-assignments', id]` | Physical terminal device assignments |
| `useSurchargeSettings(providerId?)` | `['surcharge-settings', id]` | Surcharge configuration per provider/location/terminal |
| `useMerchantAccountSetup(providerId, accountId)` | `['merchant-account-setup', pid, aid]` | Full setup data (account + credentials + sandbox flag) |
| `useVerifyCredentials(providerId)` | Mutation only | POST to verify all credentials for a provider |

### Mutation Hooks

- `usePaymentProcessorMutations()` — CRUD for providers, credentials, merchant accounts, terminal assignments. Each mutation invalidates relevant query keys.
- `useDeviceAssignmentMutations()` — assign, update, remove physical devices
- `useSurchargeMutations()` — save and delete surcharge settings

### MerchantAccountsTab — Setup Panel

The setup panel (`MerchantAccountSetupPanel`) provides comprehensive merchant account configuration:
- CardPointe API credentials (site, username, password, authorization key)
- ACH credentials (username, password) and Funding credentials
- Account settings (HSN, ACH MID, Funding MID)
- Terminal & processing options (card swipe, reader beep, production mode, manual entry, tip on device)
- Sandbox/UAT test data display (test card numbers, ACH routing numbers, AVS test codes)
- Verify credentials report showing status per MID/credential pair

### Backend Query (`packages/modules/payments/src/queries/get-provider-config.ts`)

Four optimized queries using subqueries to eliminate N+1:
- `listPaymentProviders()` — providers with `hasCredentials` boolean + `merchantAccountCount` via subquery
- `listProviderCredentials(providerId)` — credential info WITHOUT decrypted values
- `listMerchantAccounts(providerId)` — full setup details including HSN, ACH, processing options
- `listTerminalAssignments()` — enriched with terminal name + merchant display name via JOINs

---

## 136. Settings Page Consolidation

### Navigation Change

`/settings` now redirects to `/settings/general` via `router.replace()`. The `page.tsx` at `/settings/` is a thin redirect stub:

```typescript
// apps/web/src/app/(dashboard)/settings/page.tsx
export default function SettingsPage() {
  const router = useRouter();
  useEffect(() => { router.replace('/settings/general'); }, [router]);
  return <PageSkeleton />;
}
```

### Settings General Page — 6-Tab Layout

The `/settings/general` page (`general-info-content.tsx`) now contains a comprehensive 6-tab layout:

1. **Business Info**: Business information, operations, online presence, content blocks, advanced details (see §133)
2. **Users**: User management with invite, role assignment, status management
3. **Roles**: RBAC management with 75+ permissions grouped by category, role details sidebar, access scope (location/profit-center/terminal scoping)
4. **Modules**: Module enable/disable with grid/list view modes, status badges, plan tier display
5. **Dashboard**: Widget toggle configuration, customizable dashboard notes (localStorage)
6. **Audit Log**: Full audit log viewer with actor display, filterable

### Profile Completeness

The Business Info tab includes a profile completeness progress bar:
- Calculates filled/total fields across all sections
- Displays percentage with color coding (red < 30%, yellow < 70%, green ≥ 70%)
- Sticky save bar with Discard/Save buttons appears when changes are dirty

### Key Rules

1. **`/settings` is a redirect, not a page** — all settings content lives under `/settings/general`, `/settings/profit-centers`, `/settings/merchant-services`, etc.
2. **Tabs are URL-hash driven** — switching tabs updates `#tab-name` in the URL for bookmarkability
3. **Settings pages are all code-split** — thin `page.tsx` + heavy `*-content.tsx` per §107

---

## 137. Impersonation Safety Guards

### Pattern

Admin impersonation sessions have safety guards that restrict dangerous operations. Guards are implemented as assertion functions that throw `ImpersonationRestrictionError` (403) when violated.

### Guards (`packages/core/src/auth/impersonation-safety.ts`)

```typescript
isImpersonating(ctx: RequestContext): boolean
assertImpersonationCanVoid(ctx, amountCents): void      // blocks voids > $500
assertImpersonationCanRefund(ctx, amountCents): void     // blocks refunds > $500
assertImpersonationCanModifyAccounting(ctx): void         // blocks ALL accounting changes
assertImpersonationCanDelete(ctx): void                   // blocks ALL deletes
assertImpersonationCanModifyPermissions(ctx): void        // blocks permission changes
assertNotImpersonating(ctx, action: string): void         // blocks specified action entirely
```

### Key Rules

1. **Amount threshold is $500** — voids and refunds over $500 are blocked during impersonation
2. **Accounting is fully blocked** — no GL entries, no journal posting, no COA changes during impersonation
3. **Deletes are fully blocked** — no hard or soft deletes during impersonation
4. **Permission changes are fully blocked** — cannot modify roles or role assignments during impersonation
5. **`ImpersonationRestrictionError`** — code `IMPERSONATION_RESTRICTED`, HTTP 403, includes the attempted action in the message

### Test Coverage

Tests in `packages/core/src/__tests__/impersonation-safety.test.ts` cover:
- All guard functions with both normal and impersonating contexts
- Amount threshold boundary testing (exact $500 allowed, $500.01 blocked)
- Error class properties (code, status, message)

---

## 138. In-Memory Caching for Hot Auth & Middleware Paths

### Problem

POS and other high-frequency API paths call `validateToken()` and `resolveLocation()` on every request, each performing multiple sequential DB queries. At scale, these per-request DB round-trips add significant latency and connection pressure.

### Pattern: Module-Level TTL Cache

```typescript
const CACHE_TTL = 60_000; // 60 seconds
const cache = new Map<string, { data: T; ts: number }>();

function getCached(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache(key: string, data: T) {
  cache.set(key, { data, ts: Date.now() });
  // Prevent unbounded growth
  if (cache.size > MAX_SIZE) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
}
```

### Applied Instances

| Cache | Location | TTL | Max Size | Key |
|---|---|---|---|---|
| Auth user | `supabase-adapter.ts` | 60s | 200 | `authProviderId` |
| Location validation | `with-middleware.ts` | 60s | 500 | `tenantId:locationId` |
| Permission | `packages/core` | 15s | — | `tenantId:userId` |

### Key Rules

1. **Only cache immutable-ish data** — auth users, locations, and permissions change infrequently during a session. Never cache inventory on-hand, order state, or financial balances.
2. **Module-level `Map`** — survives across requests in the same serverless instance but dies on cold start (automatic cache invalidation).
3. **Bounded size** — always cap with FIFO eviction to prevent memory leaks. Delete the oldest entry (`cache.keys().next().value`) when the cap is hit.
4. **Check cache before DB** — cache hit returns immediately. Cache miss queries DB and populates cache before returning.
5. **TTL is 60s for auth/location** — matches the 15s permission cache TTL in spirit (frequent enough to catch deactivations).

---

## 139. Combine SQL Round-Trips in Transactions

### Problem

`publishWithOutbox` called `set_config('app.current_tenant_id', ...)` and optionally `set_config('app.current_location_id', ...)` as two sequential SQL statements — wasting a round-trip on every write transaction.

### Pattern

Combine independent `set_config` calls into a single SQL statement using PostgreSQL's ability to return multiple `set_config` results in one SELECT:

```typescript
if (ctx.locationId) {
  await tx.execute(sql`SELECT set_config('app.current_tenant_id', ${ctx.tenantId}, true), set_config('app.current_location_id', ${ctx.locationId}, true)`);
} else {
  await tx.execute(sql`SELECT set_config('app.current_tenant_id', ${ctx.tenantId}, true)`);
}
```

### Key Rules

1. **Always combine independent `set_config` calls** — never issue two sequential SELECTs for config when they can be one.
2. **Apply the same principle to any independent SQL statements** inside a transaction — fewer round-trips = lower latency.
3. **Use `Promise.all` for parallel JS-level work outside transactions** (e.g., fetching data needed before entering a transaction).

---

## 140. Place-and-Pay Single-Transaction Fast Path

### Problem

The original `place-and-pay` API route executed `placeOrder()` and `recordTender()` as two separate transactions — each with its own `set_config`, `fetchOrderForMutation`, idempotency pair, and `incrementVersion`. This caused ~8 redundant DB round-trips.

### Pattern

Combine both operations into a single transaction in the orchestration layer (`apps/web/`). The file `apps/web/src/app/api/v1/orders/[id]/place-and-pay/place-and-pay-fast.ts` shows this:

```typescript
export async function placeAndRecordTender(ctx, orderId, placeInput, tenderInput) {
  return db.transaction(async (tx) => {
    // 1x set_config (combined)
    // 1x fetchOrderForMutation (accepts ['open', 'placed'] to skip place if already done)
    // 1x order_lines fetch (shared by both operations)
    // Place if needed → build receipt snapshot → insert tender → 1x incrementVersion
    // Return combined result with events for both operations
  });
}
```

### Key Rules

1. **Single-transaction fast paths belong in `apps/web/`** — they are orchestration-layer code that imports from multiple modules, which is only allowed in the web app.
2. **Accept multiple statuses in `fetchOrderForMutation`** — `['open', 'placed']` lets the combined operation handle race conditions (order already placed by a concurrent preemptive call).
3. **Single `incrementVersion`** — covers both the place and tender mutations, saving a round-trip.
4. **Resolve external data BEFORE entering the transaction** — category names, modifier groups, GL settings should all be fetched before `db.transaction()` to keep the transaction window short.
5. **Fire-and-forget audit logs** — audit writes should NOT block the POS response. Use `auditLog(...).catch(() => {})` instead of `await auditLog(...)`.

---

## 141. Fire-and-Forget Audit Logs on POS Paths

### Problem

`await auditLog(ctx, ...)` in POS commands (`placeOrder`, `recordTender`) adds a DB write to the critical path. Audit logs are important but should never increase POS response latency.

### Pattern

```typescript
// Before (blocks response):
await auditLog(ctx, 'orders.order.placed', 'order', result.id);

// After (fire-and-forget):
auditLog(ctx, 'orders.order.placed', 'order', result.id).catch(() => {});
```

### Key Rules

1. **POS commands use fire-and-forget audit** — `placeOrder`, `recordTender`, `addLineItem`, and other POS-critical paths.
2. **Non-POS commands may still `await`** — admin operations, accounting entries, and batch processes can afford the latency.
3. **Always `.catch(() => {})` on fire-and-forget promises** — unhandled rejections crash the process.
4. **Audit log failures are acceptable** — audit is best-effort (existing pattern from gotcha #69). The critical business operation must always succeed.

---

## 142. Terminal Session Confirmation & Skip Scoping

### Problem

Terminal sessions persisted in `localStorage` survived across browser sessions and logins. A user could log out, log back in as a different user, and inherit the previous user's terminal session. The "skip terminal selection" flag also persisted in `localStorage`, allowing users to bypass terminal selection permanently.

### Pattern

Three-key terminal session lifecycle:

| Key | Storage | Purpose |
|---|---|---|
| `oppsera:terminal-session` | localStorage | Terminal session data (survives page refresh) |
| `oppsera:terminal-session-confirmed` | sessionStorage | Confirmation flag (current browser session only) |
| `oppsera:terminal-session-skipped` | sessionStorage | Skip flag (current browser session only) |

### Key Rules

1. **Session data is only trusted when confirmed** — `TerminalSessionProvider` only restores a cached terminal session from `localStorage` if `sessionStorage` has the `TERMINAL_CONFIRMED_KEY`. Without it, the user must re-select.
2. **Skip flag is session-scoped** — `TERMINAL_SKIP_KEY` in `sessionStorage` prevents the "skip once, bypass forever" bug. Closing the browser clears it.
3. **Login/logout clears ALL three keys** — use the exported `ALL_TERMINAL_KEYS` array to clear from both `localStorage` and `sessionStorage`.
4. **`setSession()` sets the confirmed flag** — when a user actively selects a terminal, both the session data (localStorage) and the confirmation flag (sessionStorage) are set.
5. **Revenue must tie back to terminals** — this is an accounting requirement. Never allow stale sessions to silently persist across logins.

---

## 143. Parallel Data Fetching in Commands

### Problem

Commands like `placeOrder` and `recordTender` fetched related data (lines, charges, discounts, tenders, reversals) sequentially — each query waiting for the previous one to complete.

### Pattern

Use `Promise.all` for independent queries within a transaction:

```typescript
// Before (sequential — 3 round-trips):
const lines = await tx.query...;
const charges = await tx.query...;
const discounts = await tx.query...;

// After (parallel — 1 round-trip wall-clock):
const [lines, charges, discounts] = await Promise.all([
  tx.query...,
  tx.query...,
  tx.query...,
]);
```

### Key Rules

1. **Queries that don't depend on each other should run in parallel** — order lines, charges, and discounts are independent reads.
2. **Keep independent reads inside the same transaction** — `Promise.all` within a `tx` context still shares the same transaction scope and RLS settings.
3. **Category/modifier resolution should also be parallel** — name resolution lookups after the main query can use `Promise.all`.
4. **Enrichment resolution is best-effort** — modifier group name resolution should be wrapped in `try/catch` and not block the operation.

---

## 144. Bootstrap Partial-Run Recovery

### Problem

If `bootstrapTenantCoa` created the `accounting_settings` row but crashed before creating GL accounts (network error, timeout, deploy), re-running bootstrap would short-circuit on the existing settings row and return 0 accounts — leaving the tenant in a broken state.

### Pattern

After finding existing settings, check if accounts also exist. If settings exist but accounts don't (partial run), delete the orphaned settings row and proceed with full bootstrap:

```typescript
const existingSettings = await getAccountingSettings(tenantId);
if (existingSettings) {
  const accounts = await listGlAccounts({ tenantId });
  if (accounts.length > 0) {
    return { accountCount: accounts.length }; // fully bootstrapped
  }
  // Partial run — settings exist but no accounts. Clean up and re-bootstrap.
  await tx.delete(accountingSettings).where(eq(...));
}
// Proceed with full bootstrap...
```

### Key Rules

1. **Idempotent bootstraps must verify COMPLETE state, not just partial markers** — checking only settings existence creates a false-positive for "already done."
2. **Delete orphaned state rather than patching** — it's safer to re-run the full bootstrap than to try to fill in missing pieces.
3. **Post-bootstrap verification** — the `BootstrapWizard` frontend now verifies `accountCount > 0` and shows a specific error if zero.
4. **React Query cache invalidation after bootstrap** — use both `invalidateQueries` AND `refetchQueries` (the latter blocks until data is returned) to prevent stale isBootstrapped checks.

---

## 145. Dark Mode: Opacity-Based Colors Only

### Problem

Components using explicit light/dark color pairs (e.g., `bg-red-100 text-red-700` for light, `dark:bg-red-900 dark:text-red-300` for dark) become unmaintainable and often break in the inverted gray scale theme.

### Pattern

Use opacity-based colors that work in both modes:

```tsx
// Before (breaks in dark mode or requires dark: prefix):
<div className="bg-red-100 text-red-700 border-red-200" />

// After (works in both modes):
<div className="bg-red-500/10 text-red-500 border-red-500/30" />
```

### Conversion Table

| Old Light Mode | Opacity-Based Universal |
|---|---|
| `bg-green-50 text-green-700` | `bg-green-500/10 text-green-500` |
| `bg-red-100 text-red-800` | `bg-red-500/10 text-red-500` |
| `bg-blue-100 text-blue-700` | `bg-blue-500/10 text-blue-500` |
| `bg-amber-100 text-amber-700` | `bg-amber-500/10 text-amber-500` |
| `bg-gray-100 text-gray-600` | `bg-gray-500/10 text-gray-500` |
| `bg-white` | `bg-surface` |
| `hover:bg-gray-50` | `hover:bg-gray-200/50` |

### Key Rules

1. **Never use `bg-white`** — always use `bg-surface` for theme-aware backgrounds.
2. **Never use `dark:` prefixed classes** — opacity-based colors adapt automatically.
3. **Status badges** use the `/10` background + `/30` border + `500` text pattern.
4. **Hover states** use `/50` opacity (e.g., `hover:bg-gray-200/50`).
5. **Dynamic backgrounds** — when color depends on runtime data, use a static lookup object instead of template literals:
   ```typescript
   const CARD_BG: Record<string, string> = {
     blue: 'bg-blue-500/10',
     green: 'bg-green-500/10',
     // ...
   };
   ```

---

## 146. API Route Field Name Mapping

### Problem

Backend query functions return field names matching the DB schema (e.g., `occupiedRooms`, `totalRevenueCents`, `outOfOrder`), but the frontend API contract expects different names (e.g., `roomsOccupied`, `roomRevenueCents`, `oooRooms`). Returning backend names directly couples the API contract to the database schema.

### Pattern

Add an explicit mapping layer in the API route between the backend query result and the response:

```typescript
const report = await getManagerFlashReport(ctx);
const mapped = {
  roomsOccupied: report.occupiedRooms,
  roomRevenueCents: report.totalRevenueCents,
  oooRooms: report.outOfOrder,
  // ...
};
return NextResponse.json({ data: mapped });
```

### Key Rules

1. **API routes own the response shape** — never let backend query return types leak directly to the frontend.
2. **Queries return DB-native names** — queries should use column names that match the schema.
3. **Frontend types define the contract** — the mapping layer translates between the two.
4. **This prevents breaking changes** — if a DB column is renamed, only the mapping layer changes, not the frontend.

---

## 147. Admin Portal UI Patterns

### Batch Operations

Admin list pages (dead letters, users, etc.) support batch operations:
- Checkbox selection on actionable rows (e.g., only failed items, not resolved ones)
- "Select All" header checkbox scoped to the current filter
- Batch action bar with count, action buttons, and clear
- Loading state per batch operation
- Error banner on partial failure

### Collapsible Sections

Detail pages use `CollapsibleSection` for long content:
```tsx
<CollapsibleSection title="Error Message" defaultOpen={true}>
  <pre>{errorMessage}</pre>
</CollapsibleSection>
```

### Status Badges

Reusable `StatusBadge` / `KeyStatusBadge` components with opacity-based colors:
```tsx
const colors: Record<string, string> = {
  active: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  failed: 'bg-red-500/10 text-red-400 border-red-500/30',
  resolved: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
};
```

### Admin Permission Granularity

Admin API routes use fine-grained permissions (not broad ones):
- `tenants.detail.view` (not `tenants.view`)
- `tenants.detail.manage` (not `tenants.edit`)
- `events.dlq.view` (not `tenants.view`)

---

## 148. F&B Host Stand Compact Layout

### Problem

The Host Stand page was too spacious for real-world tablet use — large paddings, oversized stats, and wasted vertical space.

### Pattern

Host Stand components use a compact, information-dense layout:

1. **StatsBar uses grouped flex, not grid** — two card groups ("Guest Metrics" and "Table Metrics") with vertical dividers between metrics inside each group. Values use `text-sm` (not `text-xl`), labels use `text-[9px]`.
2. **WaitlistPanel shows rank numbers** — each waitlist card gets a position number badge for quick visual scanning.
3. **Action buttons are role-stratified** — primary action (Seat/Check In) is solid green, secondary (Notify/No Show) is outlined, tertiary (Remove/Cancel) is icon-only (34x34px).
4. **Metadata as chips** — party size, wait time, seating preference shown as small rounded pills with background colors, not as text rows.
5. **Count badges only shown when > 0** — empty sections don't show "(0)" badges.
6. **42/58 split** — left panel (Waitlist) gets 42% width, right panel (Reservations + Rotation) gets 58%.

---

## 149. Accounting Settings 404 on Unconfigured Tenants

### Pattern

The `GET /api/v1/accounting/settings` route now returns 404 with message `"Accounting not configured — run bootstrap first"` when no settings row exists, instead of `{ data: null }`. This lets the frontend distinguish between "not configured" (show bootstrap wizard) and "configured but empty settings" (show settings form).

### Key Rule

API routes that return configuration objects should return 404 when the configuration doesn't exist — not `{ data: null }`. This follows the REST convention that missing resources are 404.

## 150. Host Module V2 Patterns

### Reservation State Machine
Use `validateReservationTransition(currentStatus, targetStatus)` from
`validation-host.ts` before any status change. Throws `ValidationError`
on invalid transition. Valid transitions defined in `RESERVATION_TRANSITIONS`.

### Wait-Time Estimation
Always call `estimateWaitTime()` when adding to waitlist. Store the quote
on the entry for accuracy tracking. Estimator uses 28-day rolling window
of turn times with fallback defaults.

### Table Assignment
`suggestTables()` returns top 3 scored suggestions. Always present to host
for confirmation — never auto-assign. Scoring: capacity fit (40%), preference
match (25%), server balance (20%), VIP/history (15%).

### Guest Notifications
SMS via fire-and-forget `sendGuestNotification()`. Record created synchronously,
dispatch async. Delivery tracked via provider webhook. Templates in
`notification-templates.ts` with `{variable}` interpolation.

### Guest Self-Service Pages
Public pages under `/guest/` force light mode, use minimal JS, 15s auto-poll.
Rate-limited to 10 req/min per IP. Guest tokens are 8-char alphanumeric.

### Host Settings
Settings stored as single JSONB blob under `module_key = 'fnb_host'` via
`getFnbSettings`/`updateFnbSettings`. Zod schema in `host-settings.ts` with
`.default()` on every field. Deep merge via `mergeHostSettings()` — only updates
explicitly provided top-level keys, preserving other sections.

## 151. Circuit Breaker on `apiFetch`

### Purpose
Prevents retry storms when the backend is down. After too many failures in a
sliding window, short-circuits all requests with a client-side error until a
cooldown expires.

### Configuration
```typescript
const CIRCUIT_BREAKER = {
  failureThreshold: 20,   // failures in window to trip
  windowMs: 30_000,       // sliding window size
  cooldownMs: 8_000,      // how long circuit stays open
};
```

### Rules
1. **Sliding window**: `_failureTimestamps[]` stores `Date.now()` of each failure.
   Old entries (> windowMs) are pruned before checking threshold.
2. **Auth bypass**: paths containing `/auth/` never count as failures — normal
   401s during login/signup must not trip the breaker.
3. **AbortError bypass**: `DOMException` with `name === 'AbortError'` (navigation
   cancellation) is not logged and not counted as a failure.
4. **Reset**: any successful non-auth response clears `_failureTimestamps`.
5. **Open circuit**: when tripped, `apiFetch` immediately throws
   `ApiError('SERVICE_UNAVAILABLE', 503)` without making a network request.
6. **Cooldown**: circuit re-closes after `cooldownMs` and allows one probe request.
7. **Cross-tab token refresh**: if a refresh fails but `localStorage` has newer
   tokens (another tab refreshed first), treat as success — don't clear tokens.

### Pattern
```typescript
// In api-client.ts
function recordFailure() {
  _failureTimestamps.push(Date.now());
}
function isCircuitOpen(): boolean {
  const now = Date.now();
  _failureTimestamps = _failureTimestamps.filter(t => now - t < CIRCUIT_BREAKER.windowMs);
  if (_failureTimestamps.length >= CIRCUIT_BREAKER.failureThreshold) {
    _circuitOpenUntil = now + CIRCUIT_BREAKER.cooldownMs;
    return true;
  }
  return now < _circuitOpenUntil;
}
```

## 152. API Route Consolidation via Dynamic `[action]` Segments

### Problem
Sibling action routes under a resource (e.g.,
`/reservations/[id]/cancel/route.ts`, `/reservations/[id]/check-in/route.ts`,
`/reservations/[id]/no-show/route.ts`) each contain identical middleware wiring,
auth checks, and error handling — only the command call differs.

### Pattern
Consolidate into a single dynamic route:
```
/api/v1/fnb/host/reservations/[id]/[action]/route.ts
```
The handler dispatches based on `params.action`:
```typescript
export async function POST(req, { params }) {
  const { id, action } = await params;
  return withMiddleware(async (ctx) => {
    switch (action) {
      case 'cancel':    return handleCancel(ctx, id, await req.json());
      case 'check-in':  return handleCheckIn(ctx, id);
      case 'confirm':   return handleConfirm(ctx, id);
      case 'complete':  return handleComplete(ctx, id);
      case 'seat':      return handleSeat(ctx, id, await req.json());
      case 'no-show':   return handleNoShow(ctx, id);
      default:          return NextResponse.json({ error: { code: 'NOT_FOUND' } }, { status: 404 });
    }
  }, { entitlement: 'pos_fnb', permission: 'fnb.host.manage' });
}
```

### Rules
1. All sibling actions must share the same middleware options (entitlement,
   permission). If permissions differ per action, use per-case
   `requirePermission()` inside the switch.
2. Keep the original route files as thin re-exports or delete them —
   never leave duplicate route handlers.
3. Use kebab-case for action names in URLs (`check-in`, `no-show`).
4. Always include a `default` case returning 404.
5. This reduced host module routes from 43 files to 14 dynamic handlers.

## 153. Usage Analytics — Buffer-and-Flush Pattern

### Architecture
Fire-and-forget usage tracking with zero impact on request latency.

```
recordUsage(event)  →  in-memory Map  →  30s flush  →  DB transaction
                        (5K overflow)       timer        (4 upserts)
```

### Buffer Key
`tenantId|moduleKey|hourBucket` — hour-granular aggregation. Each bucket
accumulates: `requestCount`, `writeCount`, `readCount`, `errorCount`,
`uniqueUsers` (Set), `totalDuration`, `maxDuration`, `workflows` (sub-map).

### Flush Rules
1. **Lazy start**: flush timer only starts on first `recordUsage()` call.
2. **Overflow trigger**: if buffer exceeds 5K entries, flush immediately.
3. **Atomic swap**: snapshot the buffer → replace with new Map → flush
   snapshot async. If flush fails, merge snapshot back into new buffer.
4. **Table existence check**: first flush verifies `rm_usage_*` tables exist.
   If not, discard buffer and stop timer permanently.
5. **CRITICAL — use `db.transaction()`**: never use `db.execute(sql\`BEGIN\`)`.
   With postgres.js pooling, each `execute()` can go to a different connection,
   leaving connections stuck in open transactions. Always use
   `db.transaction(async (tx) => { ... })`.
6. **Batch inserts**: chunk into groups of 50 to prevent query size explosion.
7. **Vercel timer**: `.unref()` on the interval so it doesn't prevent process
   shutdown.

### DB Tables
| Table | Granularity | Purpose |
|---|---|---|
| `rm_usage_hourly` | 1 row/tenant/module/hour | Raw aggregates |
| `rm_usage_daily` | 1 row/tenant/module/day | Avg duration, peak hour |
| `rm_usage_workflow_daily` | 1 row/tenant/module/workflow/day | Workflow-level detail |
| `rm_usage_module_adoption` | 1 row/tenant/module | First/last use, active days |

All use `ON CONFLICT ... DO UPDATE` with `GREATEST()` for max,
`+` for totals.

## 154. Accessibility Infrastructure

### Three Utility Hooks

#### `useDialogA11y(ref, isOpen, options)`
Wraps portal-based dialogs with WCAG 2.1 AA compliance:
- Sets `role`, `aria-modal`, `aria-labelledby`, `aria-describedby`
- Activates focus trap (delegates to `useFocusTrap`)
- Handles Escape key → `options.onClose`
- Hides sibling elements with `aria-hidden="true"` (inert tree)

```typescript
const dialogRef = useRef<HTMLDivElement>(null);
useDialogA11y(dialogRef, isOpen, {
  labelledBy: 'dialog-title',
  onClose: () => setOpen(false),
  role: 'dialog', // or 'alertdialog' for confirmations
});
```

#### `useFocusTrap(ref, isActive)`
Keyboard focus wrapping within a container:
- **Trap stack**: nested dialogs push/pop — only top-most handles Tab
- **First focus**: `[data-autofocus]` if present, else first focusable element
- **Tab wrapping**: Shift+Tab on first → last; Tab on last → first
- **Restoration**: on unmount, focus returns to previously focused element
- **Excluded**: `[tabindex="-1"]`, disabled, hidden (`offsetParent === null`)

#### `announce(message, priority?)`
ARIA live region for screen reader announcements:
- Two singleton nodes: `polite` (waits) + `assertive` (interrupts)
- Re-announce pattern: empty → `requestAnimationFrame` → set message
- Auto-clear after 5s to prevent stale announcements
- Nodes persist for app lifetime (shared across components)

### Rules
1. All portal-based dialogs (POS, settings, accounting) SHOULD use
   `useDialogA11y`. New dialogs MUST use it.
2. Pass the portal container ref, not an inner div — the ref must be
   ancestor of all dialog content.
3. Use `announce()` for form submission results, toast-like feedback,
   and async operation completions.
4. Never use `autofocus` HTML attribute — use `data-autofocus` instead
   (avoids ESLint `no-autofocus` warning).

### ESLint jsx-a11y Rules
Two-tier configuration in `eslint.config.mjs`:

| Tier | Severity | Rules |
|---|---|---|
| **Tier 1** (correctness) | `error` | `aria-props`, `aria-role`, `role-has-required-aria-props`, `alt-text`, `heading-has-content`, `tabindex-no-positive`, `no-redundant-roles` |
| **Tier 2** (incremental) | `warn` | `click-events-have-key-events`, `label-has-associated-control`, `no-static-element-interactions`, `interactive-supports-focus`, `mouse-events-have-key-events` |

Special: `anchor-is-valid: off` (conflicts with Next.js `<Link>`),
`no-autofocus: ['warn', { ignoreNonDOM: true }]`.

## 155. Permission Groups Configuration

### Structure
`apps/web/src/components/settings/permission-groups.ts` organizes 75+
permissions into a hierarchical structure for the role manager UI.

```typescript
type PermissionGroupEntry = {
  label: string;
  permissions?: string[];        // flat group
  subGroups?: PermissionSubGroup[]; // hierarchical group
};
type PermissionSubGroup = {
  label: string;
  permissions: string[];
};
```

### Rules
1. **Three-file update**: adding a permission requires changes to:
   - `packages/shared/src/permissions/permission-matrix.ts` (source of truth)
   - `permission-groups.ts` (UI structure)
   - `packages/db/src/seed.ts` (role defaults)
2. **Flat vs hierarchical**: small modules (Inventory, Golf) use `permissions[]`.
   Large modules (POS, F&B, Accounting, PMS) use `subGroups[]`.
3. **Category tabs**: `CATEGORY_TABS` array controls the tab filter bar
   (all/platform/pos/fnb/accounting/pms/etc.).
4. **Helper functions**:
   - `getAllGroupPerms(group)` — flattens any group to a string array
   - `getPermLabel(key)` — returns display description from `PERMISSION_BY_KEY`
   - `permMatchesSearch(permKey, group, sub, query)` — fuzzy search
5. **Permission keys are case-sensitive** — `orders.create` ≠ `Orders.Create`.

## 156. Feature Flags — Dual-Table Pattern

### Schema
```
feature_flags           (system definitions, platform-admin managed)
├── key (unique)
├── description
├── isEnabled (global default)
├── rolloutPercentage
└── metadata (JSONB)

feature_flag_overrides  (per-tenant overrides)
├── flagKey → feature_flags.key
├── tenantId
├── isEnabled (override)
└── reason
```

### Resolution Order
1. Check `feature_flag_overrides` for `(flagKey, tenantId)`.
2. If found, use override `isEnabled`.
3. If not found, use `feature_flags.isEnabled` (global default).
4. Rollout percentage: hash `tenantId` and compare to `rolloutPercentage`.

### Rules
1. **Flags are platform-level** — created/managed via SuperAdmin portal,
   not tenant self-service.
2. **Overrides require a reason** — admin must provide text explaining why
   a tenant gets a non-default value.
3. **Never delete flags** — deactivate with `isEnabled = false`. Overrides
   reference `flagKey` as FK.
4. **Cache**: flags are cached in middleware for the request lifetime.
   No separate LRU cache needed — they're small and rarely change.

## 157. Cold Start Parallelization

### Pattern
`instrumentation.ts` runs on Vercel cold start. Sequential lazy-imports
were adding ~800ms. Now uses `Promise.all` for independent imports:

```typescript
export async function register() {
  await Promise.all([
    import('@oppsera/core'),
    import('@oppsera/module-catalog'),
    import('@oppsera/module-orders'),
    import('@oppsera/module-payments'),
    import('@oppsera/module-inventory'),
    import('@oppsera/module-customers'),
    import('@oppsera/module-reporting'),
    import('@oppsera/module-semantic'),
    import('@oppsera/module-accounting'),
    import('@oppsera/module-pms'),
  ]);
  // Sequential: bootstrap singletons that depend on modules
  const { initializeAccountingPostingApi } = await import('./lib/accounting-bootstrap');
  await initializeAccountingPostingApi();
  // ... other singletons
}
```

### Rules
1. Only parallelize truly independent imports (no init-order dependency).
2. Singleton bootstrap (AccountingPostingApi, CatalogReadApi, etc.) MUST
   be sequential AFTER module imports — they call `setXxxApi()` on loaded modules.
3. Never `await` usage tracker start — it checks table existence and may
   fail on fresh DBs.

## 158. Cross-Tab Auth Token Coordination

### Problem
Multiple browser tabs share `localStorage` tokens. Tab A's token refresh
can race with Tab B's, causing both to use stale refresh tokens.

### Solution
1. **Deduplication**: `apiFetch` stores a single `refreshPromise` so
   concurrent 401s within the same tab share one refresh call.
2. **Cross-tab detection**: if a refresh fails with 401 but `localStorage`
   now has a newer `accessToken` than what we started with (another tab
   refreshed successfully), treat our refresh as a success and use the
   new tokens.
3. **signOut scope**: `supabase.auth.signOut({ scope: 'local' })` — clears
   only the current tab's session. Using `'global'` would revoke the
   refresh token for ALL tabs, breaking concurrent sessions.
4. **Final 401**: if refresh truly fails (no cross-tab rescue), clear all
   tokens and let the auth context redirect to login.

### Rules
- Always use `scope: 'local'` on signOut.
- Never assume a refresh failure means all sessions are invalid — check
  localStorage first.
- The `refreshPromise` singleton prevents thundering herd on 401.

## 159. Event Bus Resilience

### Problem
A slow or crashed event handler blocks the entire event processing pipeline,
causing upstream timeouts and cascading failures.

### Solution (implemented in `packages/core/src/events/event-bus.ts`)
1. **Handler timeout**: 30s per handler via `Promise.race` with a timeout
   promise. Timed-out handlers log an error but don't block other handlers.
2. **Concurrency limit**: max 10 concurrent handler executions. Excess
   handlers are queued and processed as slots free up.
3. **`Promise.allSettled` for deferred consumers**: non-critical consumers
   use `allSettled` so one failure doesn't abort the batch.
4. **Error isolation**: each handler wrapped in try/catch. Errors are
   logged with handler name + event type but never propagated to the
   publisher.

### Rules
- Critical consumers (GL posting, inventory deduction) run in the
  `publishWithOutbox` transaction — these are NOT subject to the timeout.
- Deferred consumers (reporting projections, usage tracking, timeline
  writes) run post-commit with timeout + isolation.
- Never throw from a deferred consumer — it's fire-and-forget.

## 160. Editable OPPS ERA LENS Narrative Template

### Schema
`semantic_narrative_config` table (migration 0197):
- `tenantId` (nullable — NULL = system default)
- `templateKey` ('narrative_system_prompt')
- `templateContent` (TEXT — full system prompt with `{{PLACEHOLDER}}` tokens)
- `isActive` (boolean)
- Unique constraint on `(tenant_id, template_key)`

### Placeholder Tokens
Templates use `{{VARIABLE_NAME}}` syntax, replaced at render time:
- `{{INDUSTRY_HINT}}` — business type context from lens
- `{{METRIC_CONTEXT}}` — metric definitions block
- `{{DATE_CONTEXT}}` — current date for relative date references
- `{{LENS_CONTEXT}}` — active lens description

### Caching
In-memory cache with 5-min TTL. Cache key: `tenantId ?? 'system'`.
Invalidated on template save.

### Rules
1. Always provide system-default template (NULL tenantId) as fallback.
2. Tenant template overrides the system default entirely — no merging.
3. Template validation: must contain at least `{{METRIC_CONTEXT}}` placeholder.
4. API: `GET/PUT /api/v1/semantic/narrative-config` (admin permission required).
5. Frontend: admin Train AI → AI Behavior page with Monaco-style editor.

## 161. DB Pool Tuning for Vercel Serverless

### Current Config (Vercel Pro)
```typescript
const pool = postgres(DATABASE_URL, {
  max: 3,                // per-instance (was 5, then 2, settled at 3)
  idle_timeout: 20,      // seconds before idle connection is closed
  max_lifetime: 300,     // 5 min max connection lifetime
  connect_timeout: 10,   // 10s connection timeout (Vercel cold starts)
  prepare: false,        // REQUIRED for Supavisor transaction mode
});
```

### Rules
1. **Never exceed `max: 3` on Vercel** — many concurrent instances × pool
   size = total connections. At 50 instances × 3 = 150 connections (within
   Supavisor's 600 pooler connection limit on Medium compute).
2. **`connect_timeout: 10`** — Vercel cold starts can take 5-7s. Without
   this, connections fail with "connection terminated" during burst traffic.
3. **`idle_timeout: 20`** — close idle connections quickly to free Supavisor
   slots. Vercel functions are short-lived.
4. **`max_lifetime: 300`** — prevents stale connections after Supavisor
   failover or Supabase maintenance.
5. **`prepare: false`** — ALWAYS required for Supavisor transaction mode.
   Without it, prepared statements fail silently.

## 162. Cache Scaling with LRU Eviction

### Pattern
All in-memory caches follow the same bounded-LRU pattern:

```typescript
const cache = new Map<string, { value: T; expiresAt: number }>();
const MAX_ENTRIES = 2000;

function set(key: string, value: T, ttlMs: number) {
  if (cache.size >= MAX_ENTRIES) {
    // Delete oldest entry (Map maintains insertion order)
    const firstKey = cache.keys().next().value;
    cache.delete(firstKey);
  }
  cache.set(key, { value, expiresAt: Date.now() + ttlMs });
}
function get(key: string): T | null {
  const entry = cache.get(key);
  if (!entry || Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  // Move to end for LRU (delete + re-set)
  cache.delete(key);
  cache.set(key, entry);
  return entry.value;
}
```

### Cache Inventory (Vercel Pro)
| Cache | Max Entries | TTL | Location |
|---|---|---|---|
| Auth user | 2,000 | 120s | `supabase-adapter.ts` |
| Permissions | 5,000 | 15s | `with-middleware.ts` |
| Locations | 2,000 | 60s | `with-middleware.ts` |
| Entitlements | 2,000 | 60s | `with-middleware.ts` |
| ERP workflow | 1,000 | 60s | `workflow-engine.ts` |
| Semantic rate limiter | 2,000 | 60s cleanup | `semantic-rate-limiter.ts` |
| Semantic query cache | 500 | 300s | `llm-cache.ts` |
| Frontend permissions | per-user | 30s | `use-auth.ts` |

### Rules
1. **Always bound Map size** — unbounded Maps are memory leaks on
   long-running Vercel instances. The ERP workflow cache and semantic
   rate limiter were both unbounded before the fix.
2. **Use Map insertion-order for FIFO eviction** — `Map.keys().next().value`
   gives the oldest entry. Delete + re-set on read for LRU behavior.
3. **Periodic cleanup for time-based Maps** — rate limiter and workflow
   cache use `setInterval` (30-60s) with `.unref()` to prune expired
   entries, preventing gradual memory growth.
4. **Never cache mutable state** — only cache slow-changing identity data
   (users, permissions, locations). Never cache orders, inventory, or
   financial data.

## 163. Supabase Auth — Combined Membership Query

### Before (3 sequential queries per request)
```typescript
const user = await tx.select().from(users).where(...);
const membership = await tx.select().from(tenantMemberships).where(...);
const tenant = await tx.select().from(tenants).where(...);
```

### After (1 combined query)
```typescript
const [row] = await tx.select({
  userId: users.id,
  email: users.email,
  displayName: users.displayName,
  tenantId: tenantMemberships.tenantId,
  systemRole: tenantMemberships.systemRole,
  tenantName: tenants.name,
  tenantSlug: tenants.slug,
}).from(users)
  .innerJoin(tenantMemberships, and(
    eq(tenantMemberships.userId, users.id),
    eq(tenantMemberships.isActive, true),
  ))
  .innerJoin(tenants, eq(tenants.id, tenantMemberships.tenantId))
  .where(eq(users.authProviderId, authProviderId))
  .limit(1);
```

### Rules
1. Always prefer a single JOIN query over sequential lookups when the
   results are used together in the same code path.
2. The auth hot path (every authenticated request) is the highest-priority
   optimization target — even 1 saved query × 1000 requests/min is
   significant.
3. Combined with the 2K-entry / 120s auth user cache, most requests
   skip the DB entirely.

## 164. POS Payment Race Condition Elimination

### Problem
The preemptive `placeOrder` pattern (fire placeOrder when TenderDialog
opens, complete tender when user clicks Pay) caused race conditions:
- If placeOrder was slow, tender would fire before order was placed
- Recovering from 409 "already placed" added complexity
- `amountGiven: 0` allowed accidental $0.00 tenders

### Solution
1. **Remove preemptive place-and-pay**: TenderDialog no longer fires
   `onPlaceOrder()` in a useEffect. The place-and-pay fast path handles
   both in a single transaction when the user clicks Pay.
2. **`amountGiven` minimum 1 cent**: Zod schema updated to
   `z.number().int().min(1)` — prevents $0.00 tenders at the validation
   layer.
3. **Single-transaction fast path**: `placeAndRecordTender()` combines
   both operations, eliminating the race entirely.

### Rules
- Never use preemptive async operations that can race with user actions.
- Validate at the schema level (Zod `.min(1)`) not just the UI level.
- The `placeAndRecordTender` fast path should be the default POS path.

## 165. Settings Lazy-Loading Pattern

### Problem
The Settings → General page imported all 6 tab components eagerly,
including heavy ones like the role editor (75+ permissions).

### Solution
```typescript
const BusinessInfoTab = dynamic(() => import('./tabs/BusinessInfoTab'), {
  loading: () => <TabSkeleton />,
});
const RolesTab = dynamic(() => import('./tabs/RolesTab'), {
  loading: () => <TabSkeleton />,
});
// ... other tabs
```

Each tab component is a default export in its own file. The parent
`general-info-content.tsx` renders only the active tab — other tabs'
chunks are never loaded.

### Rules
1. Apply to any page with tabs where individual tabs are >100 lines.
2. Each tab must be a separate file with `export default`.
3. Always provide a `loading` component (skeleton or spinner).
4. The tab state (which tab is active) lives in the parent — never
   in the lazy-loaded child.

## 166. PMS Housekeeping Staff Management

### Schema (migration 0202)
`pms_housekeepers_staff` table — links `pms_housekeepers` to `users` table
with scheduling and skill metadata:
- `housekeeperId` → `pms_housekeepers.id`
- `userId` → `users.id`
- `shiftPreference`, `maxRooms`, `skills` (JSONB), `certifications`
- `frontDeskAssigned` boolean for multi-role staff

### Conventions
1. **Display name resolution**: queries JOIN `users` table to resolve
   `displayName` for housekeeper lists. Never store denormalized names.
2. **Staff vs housekeeper**: `pms_housekeepers` is the operational entity
   (assignments, productivity). `pms_housekeepers_staff` is the HR link.
3. **Front desk assignment**: `frontDeskAssigned = true` allows the same
   user to appear in both housekeeping and front desk views.
4. **Skill matching**: `skills` JSONB array enables assignment suggestions
   based on room type requirements.

## 167. Lightweight Health Endpoint

### `/api/health` (public, unauthenticated)
```typescript
export async function GET() {
  return NextResponse.json({ status: 'ok' }, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
```

### Rules
1. **No DB queries** — the health endpoint must return instantly (~1ms).
   DB health is checked by `/api/admin/health` (authenticated).
2. **`no-store`** — prevents CDN/browser caching of health status.
3. **Used by**: POS visibility resume (`HEAD /api/health` to warm Vercel),
   circuit breaker probe (first request after cooldown), monitoring systems.
4. **Never add diagnostics** to the public endpoint — infrastructure
   details (DB latency, cache stats, commit SHA) stay in admin health.

## 168. Frontend Permission Caching

### Pattern
`use-auth.ts` caches the user's permission set client-side with 30s TTL:

```typescript
const permissionCache = useRef<{ perms: Set<string>; expiresAt: number } | null>(null);

function hasPermission(permission: string): boolean {
  if (!permissionCache.current || Date.now() > permissionCache.current.expiresAt) {
    permissionCache.current = {
      perms: new Set(user.permissions),
      expiresAt: Date.now() + 30_000,
    };
  }
  return permissionCache.current.perms.has(permission)
    || permissionCache.current.perms.has('*');
}
```

### Rules
1. **Ref-based, not state-based** — permission checks are synchronous and
   must not trigger re-renders.
2. **Wildcard check** — always check for `'*'` (Owner/Admin wildcard) in
   addition to the specific permission string.
3. **30s TTL** — matches the server-side 15s permission cache TTL with
   some buffer. Permission changes propagate within 30s on frontend.
4. **Never use for security-critical decisions** — frontend caching is
   for UI gating (show/hide buttons). Server-side `requirePermission()`
   middleware is the actual security boundary.

## 169. POS Batch Add-to-Cart Optimization

### Problem
Rapid item taps on POS (e.g., scanning barcodes, quick-menu buttons) fired
individual `POST /api/v1/orders/[id]/lines` calls per tap. Under load this
created N concurrent requests, each with its own `publishWithOutbox`
transaction.

### Solution
`usePOS.addItem()` is now **synchronous** — it returns `void`, not a Promise.
Each call creates an optimistic temp line (`id='temp-{ulid}'`) for instant
UI feedback, then queues the item in `batchQueue.current[]`.

```typescript
// Constants
const BATCH_DEBOUNCE_MS = 50;
const BATCH_MAX_SIZE = 20;

// addItem() — synchronous
function addItem(input: AddItemInput): void {
  const tempId = `temp-${ulid()}`;
  // ... create optimistic line for UI ...
  batchQueue.current.push({ input, tempId, reqId });

  if (batchQueue.current.length >= BATCH_MAX_SIZE) {
    flushBatch();  // immediate flush at max size
  } else {
    clearTimeout(batchTimer.current);
    batchTimer.current = setTimeout(flushBatch, BATCH_DEBOUNCE_MS);
  }
}
```

`flushBatch()` sends a single `POST /api/v1/orders/{orderId}/lines/batch`
with up to 20 items. Server returns `{ order, lines }`. Temp IDs are
replaced with real server IDs on the response.

### Rules
1. **Never `await addItem()`** — it's synchronous and returns void.
2. **Max 20 items per batch** — the server rejects batches larger than 20.
3. **Temp lines are optimistic** — if the batch fails, temp lines are removed
   and error is shown.
4. **Order must be open before batching** — `flushBatch()` checks order status.

## 170. Logout Deduplication Pattern

### Problem
Multiple concurrent logout triggers (token expiry + user click + cross-tab
event) could race, with a later logout clearing tokens set by an intervening
login/refresh.

### Solution
Module-level promise in `use-auth.ts`:
```typescript
let _logoutPromise: Promise<void> | null = null;

async function signOut() {
  if (_logoutPromise) {
    await _logoutPromise;  // share existing logout
    return;
  }
  _logoutPromise = (async () => {
    try {
      // clear tokens, redirect, etc.
    } finally {
      _logoutPromise = null;
    }
  })();
  await _logoutPromise;
}
```

### Rules
1. **Module-level, not React state** — the promise must survive component
   re-renders and be shared across all callers.
2. **Always reset in `finally`** — prevents permanent lock if logout throws.
3. **Never start a new logout if one is in progress** — just await the
   existing promise.

## 171. Pure Algorithm Services (Host Module V2)

### Pattern
Domain algorithms that score, estimate, or rank should be **pure functions**
with no DB access, no side effects, and no imports from `@oppsera/db`:

```
packages/modules/fnb/src/services/
├── wait-time-estimator.ts    # computeWaitTime(), getPartySizeBucket()
├── table-assigner.ts         # scoreTable(), rankTables(), suggestTables()
├── notification-service.ts   # getSmsProvider() — singleton, testable
└── notification-templates.ts # buildConfirmationSms(), buildReadySms()
```

### Wait-Time Estimator
- Input: pre-fetched `TurnTimeData`, `OccupancyData`, upcoming reservations,
  party size
- Output: `{ estimatedMinutes, confidence, factors }`
- Confidence thresholds: `>=50` = high, `>=20` = medium, `>=10` = low,
  `<10` = default
- Result clamped to 5–120 minutes, rounded to nearest 5

### Table Assigner
- 4-factor weighted scoring: capacity fit (0.40), seating preference (0.25),
  server balance (0.20), VIP preference (0.15)
- Each component returns 0–1.0, combined via weighted sum
- Table combinations get `COMBINATION_PENALTY = 0.85` applied
- Returns top 3 suggestions sorted by score descending

### Rules
1. **Never import DB schema in service files** — data must be pre-fetched
   by the calling command/query and passed as typed arguments.
2. **Keep scoring weights as named constants** — never inline magic numbers.
3. **All services must be individually testable** — no setup beyond
   constructing input data.
4. **Use `setSmsProvider()` for test injection** — never mock the module.

## 172. Member Portal Dark-Mode-Only Design

### Pattern
The member portal (`apps/member-portal/`) is dark-mode only — no light mode
toggle. `globals.css` sets `color-scheme: dark` on `:root`.

### Tailwind v4 `@theme` Block
```css
@theme {
  --color-surface: var(--surface);
  --color-surface-raised: var(--surface-raised);
  --color-background: var(--bg);
  --color-foreground: var(--fg);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-fg);
}
```
CSS custom properties are defined on `:root` with dark values only. Tailwind
v4 `@theme` maps these to utility classes (`bg-surface`, `text-foreground`).

### Rules
1. **Never add `@media (prefers-color-scheme: light)`** — the portal is
   exclusively dark.
2. **Use `bg-surface` and `bg-surface-raised`** for backgrounds, never
   `bg-white` or `bg-gray-900`.
3. **Accessibility features are included** — skip-link, focus-visible ring,
   and `prefers-reduced-motion` are in the portal's `globals.css`.
4. **Portal auth is independent** — portal JWT tokens (`createPortalToken()`)
   are separate from the main app auth.

## 173. SMS Provider Abstraction

### Pattern
```typescript
interface SmsProvider {
  send(to: string, body: string): Promise<{ externalId: string; status: string }>;
}

class ConsoleSmsProvider implements SmsProvider { /* logs to console */ }
class TwilioSmsProvider implements SmsProvider { /* HTTP POST to Twilio */ }

let _provider: SmsProvider | null = null;
export function getSmsProvider(): SmsProvider {
  if (!_provider) {
    _provider = (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN)
      ? new TwilioSmsProvider() : new ConsoleSmsProvider();
  }
  return _provider;
}
export function setSmsProvider(p: SmsProvider) { _provider = p; }
```

### Rules
1. **Env var detection at runtime** — never import Twilio SDK directly.
   ConsoleSmsProvider is the default for dev/test.
2. **`setSmsProvider()` for testing** — inject a mock provider, never
   `vi.mock()` the module.
3. **Twilio uses Basic Auth** — HTTP POST to
   `https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json`
   with `Authorization: Basic base64(sid:token)`. No SDK dependency.
4. **External IDs are tracked** — `send()` returns the provider's message ID
   for delivery tracking. Console provider returns `console_${Date.now()}`.

## 174. WCAG 2.1 AA Accessibility Conventions

### Skip Link
Every app's `globals.css` defines `.skip-link`:
```css
.skip-link {
  position: absolute; left: -9999px;
  /* On :focus → left: 1rem, top: 1rem, z-index: 999 */
}
```
Add `<a href="#main-content" class="skip-link">Skip to content</a>` as the
first child of `<body>`. The target `<main id="main-content">` must exist.

### Focus-Visible Ring
Global `*:focus-visible` applies a 2px outline at 2px offset using the
semantic token `--sem-ring` (#2563eb). Excludes elements with Tailwind
`focus-visible:ring-*` classes to avoid double-ring.

### Reduced Motion
`@media (prefers-reduced-motion: reduce)` disables ALL animations and
transitions globally (0.01ms duration). `scroll-behavior: auto`. Never
override with `!important` animation styles.

### Dialog Accessibility
All portal-based dialogs must use `useDialogA11y(ref, isOpen)`:
- Sets `role="dialog"`, `aria-modal="true"`
- Activates focus trap (via `useFocusTrap`)
- Hides sibling elements from screen readers

### Live Announcements
Use `announce(message, priority?)` from `lib/live-region.ts` for dynamic
content changes. Creates an `aria-live` region (polite by default, assertive
for errors).

### Component Rules
1. **Select**: `role="combobox"` + `aria-expanded` + `aria-haspopup="listbox"` +
   `aria-controls={listboxId}`. Options: `role="option"` + `aria-selected`.
2. **Decorative icons**: always add `aria-hidden="true"` to icons that are
   purely visual (chevrons, status dots, etc.).
3. **Interactive icons**: wrap in `<button>` with `aria-label` describing the
   action.
4. **Form fields**: use `<label>` with `htmlFor`, or `aria-label` for icon-only
   inputs.
5. **ESLint jsx-a11y**: 15 error rules (hard failures), 13 warning rules
   (soft). `anchor-is-valid` is off (conflicts with Next.js `<Link>`).

