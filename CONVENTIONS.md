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

### Dark Mode (Inverted Gray Scale)

Dark mode is the **default** (`:root` has `color-scheme: dark`). Light mode is opt-in via `.light` class. The gray scale is **inverted** in `globals.css` — in dark mode, `gray-900` maps to near-white (`#f0f6fc`) and `gray-50` maps to dark (`#1c2128`). Other color palettes (red, indigo, amber, etc.) are NOT inverted.

**Consequence:** Standard Tailwind dark mode assumptions break. `bg-gray-900 text-white` becomes near-white background with white text (invisible).

**Button color patterns that work in both modes:**

| Button Type         | Classes                                                      |
| ------------------- | ------------------------------------------------------------ |
| Primary             | `bg-indigo-600 text-white hover:bg-indigo-700`               |
| Destructive outline | `border border-red-500/40 text-red-500 hover:bg-red-500/10`  |
| Secondary/ghost     | `text-gray-600 hover:bg-gray-100` (inverted grays work here) |

**Theme-aware background:** Use `bg-surface` (CSS variable: dark `#161b22`, light `#ffffff`).

**Rule:** Use opacity-based colors (`red-500/40`, `red-500/10`) instead of static shades (`red-300`, `red-50`) for borders and hover states — these adapt naturally to both modes.

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
├── PackageConfirmDialog.tsx # Package component list with type badges
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
| `PackageLineItem` | "Includes: item1, item2, ..." from components    | None (qty=1)                   |

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
- Architecture: See CONVENTIONS.md §66-70 for full details
- Total: ~26 tables, ~41 commands, ~37 queries, ~72 API routes, ~175 tests

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

## 65. Room Layout Builder Architecture

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

## 66. Accounting Core / GL Architecture

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

## 67. Accounts Payable (AP) Architecture

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

## 68. Accounts Receivable (AR) Architecture

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

## 69. Subledger Reconciliation Pattern

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

## 70. Cross-Module Financial Posting Patterns

### Module → GL Flow

```
POS Tender → handleTenderForAccounting() → AccountingPostingApi.postEntry()
AP Bill    → postBill() → AccountingPostingApi.postEntry()
AP Payment → postPayment() → AccountingPostingApi.postEntry()
AR Invoice → postInvoice() → AccountingPostingApi.postEntry()
AR Receipt → postReceipt() → AccountingPostingApi.postEntry()
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
| `ap` | AP bills and payments |
| `ar` | AR invoices and receipts |
| `membership` | Future: membership billing |
| `payroll` | Future: payroll posting |

### Idempotency

All automated postings use `sourceReferenceId` (bill.id, invoice.id, tender.id). The unique partial index on `(tenantId, sourceModule, sourceReferenceId) WHERE sourceReferenceId IS NOT NULL` prevents double-posting. The posting engine returns the existing entry if a duplicate is detected.

---

## 48. Auth Troubleshooting (Vercel / Supabase)

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
- **Diagnostic endpoint**: `/api/v1/auth/debug` traces the full auth chain (DB connectivity, env vars, JWT verify, user lookup by `authProviderId`)
