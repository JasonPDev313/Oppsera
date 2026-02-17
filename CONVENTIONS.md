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
- `db.execute()` returns a **RowList** (array-like iterable), NOT `{ rows: [...] }`. Always use `Array.from(result as Iterable<T>)` to convert.

### Table Conventions

Every tenant-scoped table includes:

| Column | Type | Notes |
|---|---|---|
| `id` | `TEXT` | ULID, 26-char, sortable. Generated via `$defaultFn(generateUlid)` |
| `tenant_id` | `TEXT NOT NULL` | FK to `tenants.id` |
| `location_id` | `TEXT` | Nullable; only when location-specific |
| `created_at` | `TIMESTAMPTZ NOT NULL` | `.defaultNow()` |
| `updated_at` | `TIMESTAMPTZ NOT NULL` | `.defaultNow()` |
| `created_by` | `TEXT` | Nullable for system records |

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
    tenantId: text('tenant_id').notNull().references(() => tenants.id),
    name: text('name').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_my_table_tenant').on(table.tenantId),
  ],
);
```

### Composite Primary Keys (Partitioned Tables)

For partitioned tables (e.g., `audit_log`), use `primaryKey({ columns: [...] })` instead of `.primaryKey()` on a single column:

```typescript
(table) => [
  primaryKey({ columns: [table.id, table.createdAt] }),
]
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

| Error Class | Code | HTTP Status |
|---|---|---|
| `ValidationError` | `VALIDATION_ERROR` | 400 |
| `AuthenticationError` | `AUTHENTICATION_REQUIRED` | 401 |
| `AuthorizationError` | `AUTHORIZATION_DENIED` | 403 |
| `NotFoundError` | `NOT_FOUND` | 404 |
| `ConflictError` | `CONFLICT` | 409 |
| `TenantSuspendedError` | `TENANT_SUSPENDED` | 403 |
| `MembershipInactiveError` | `MEMBERSHIP_INACTIVE` | 403 |
| `ModuleNotEnabledError` | `MODULE_NOT_ENABLED` | 403 |

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
  eventId: string;        // ULID
  eventType: string;      // domain.entity.action.vN
  occurredAt: string;     // ISO 8601
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
     sql: Object.assign(vi.fn((...args: unknown[]) => args), {
       raw: vi.fn((str: string) => str),
     }),
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
   expect(sqlArg).toContain('entity_type');  // fails!

   // CORRECT — stringify to inspect contents
   const sqlArg = JSON.stringify(mockExecute.mock.calls[0]);
   expect(sqlArg).toContain('entity_type');  // works
   ```

8. **Idempotency mocks use in-transaction pattern.** Since `checkIdempotency` now runs inside `publishWithOutbox`, mock it via `mockSelectReturns` (the tx.select chain), not `db.query.idempotencyKeys.findFirst`:
   ```typescript
   // Mock a duplicate request inside transaction
   mockSelectReturns([{
     tenantId: TENANT_A,
     clientRequestId: 'req_dup',
     resultPayload: { id: 'cached_order' },
     expiresAt: new Date(Date.now() + 86400000),
   }]);
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
import { roles, rolePermissions, tenants } from '@oppsera/db';  // schema tables
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

| Button Type | Classes |
|---|---|
| Primary | `bg-indigo-600 text-white hover:bg-indigo-700` |
| Destructive outline | `border border-red-500/40 text-red-500 hover:bg-red-500/10` |
| Secondary/ghost | `text-gray-600 hover:bg-gray-100` (inverted grays work here) |

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

| Component | Props | Notes |
|---|---|---|
| `Badge` | `variant`, `children` | 8 color variants (success, warning, error, neutral, info, indigo, purple, orange) |
| `LoadingSpinner` | `size`, `label` | sm/md/lg sizes |
| `EmptyState` | `icon`, `title`, `description`, `action` | Centered placeholder |
| `SearchInput` | `value`, `onChange`, `placeholder` | 300ms debounced with clear button |
| `CurrencyInput` | `value`, `onChange`, `error` | $ prefix, 2 decimal formatting |
| `ConfirmDialog` | `open`, `onClose`, `onConfirm`, `title`, `destructive` | Portal-based modal |
| `Toast` / `useToast` | `toast.success()`, `toast.error()`, `toast.info()` | Provider + context pattern |
| `FormField` | `label`, `required`, `error`, `helpText`, `children` | Slot-based form wrapper |
| `Select` | `options`, `value`, `onChange`, `multiple` | Single/multi with search for 6+ options |
| `DataTable` | `columns`, `data`, `isLoading`, `onRowClick` | Desktop table + mobile cards, skeleton loading |

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
  moduleKey?: string;      // For entitlement gating
  children?: SubNavItem[]; // Expandable sub-menu
}
```

Disabled modules show a lock icon. Active parent expands to show children with indented links.

---

## 16. Naming Conventions

| Context | Convention | Example |
|---|---|---|
| Postgres columns | snake_case | `tenant_id`, `created_at` |
| TypeScript properties | camelCase | `tenantId`, `createdAt` |
| API response keys | camelCase | `{ "entityType": "role" }` |
| Table names | snake_case, plural | `roles`, `role_assignments` |
| Drizzle table variables | camelCase, plural | `roles`, `roleAssignments` |
| Event types | dot.separated.vN | `order.placed.v1` |
| Audit actions | dot.separated | `role.created`, `role.updated` |
| Permission strings | resource.action | `users.manage`, `settings.view` |
| Module keys | snake_case | `platform_core`, `pos_retail` |
| Migration files | NNNN_description.sql | `0003_audit_log_partitioning.sql` |
| Test files | `__tests__/*.test.ts` | `__tests__/audit.test.ts` |
| ID prefixes (display) | lowercase entity abbreviation | `tnt_`, `usr_`, `loc_`, `rol_` |

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

| Layer | Format | Type | Example |
|---|---|---|---|
| Catalog (prices, costs) | Dollars | `NUMERIC(12,2)` / string | `"29.99"` |
| Orders (totals, line amounts) | Cents | `INTEGER` | `2999` |
| Tenders (amounts, change, tips) | Cents | `INTEGER` | `2999` |
| GL Journal Entries | Cents | `INTEGER` | `2999` |

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
      'open',                   // required status
      input.expectedVersion,    // optional — 409 if mismatch
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
  await tx.execute(
    sql`SELECT * FROM orders WHERE id = ${orderId} AND tenant_id = ${tenantId} FOR UPDATE`
  ) as Iterable<SnakeCaseRow>
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
  lines: orderLines.map(l => ({
    name: l.catalogItemName,
    qty: l.qty,
    unitPrice: l.unitPrice,
    lineTotal: l.lineTotal,
    taxes: lineTaxes.filter(t => t.orderLineId === l.id),
  })),
  charges: orderCharges,
  discounts: orderDiscounts,
  subtotal, taxTotal, chargeTotal, discountTotal, total,
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
businessDate: date       // trading day
terminalId: text         // which register
employeeId: text         // who created the order
shiftId: text           // which shift (V2)
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
allowedFractions: [0.25, 0.5, 0.75, 1]  // default: [1]
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
    catalogItemId: text('catalog_item_id').notNull().references(() => catalogItems.id, { onDelete: 'cascade' }),
    modifierGroupId: text('modifier_group_id').notNull().references(() => catalogModifierGroups.id, { onDelete: 'cascade' }),
    isDefault: boolean('is_default').notNull().default(false),
  },
  (table) => [primaryKey({ columns: [table.catalogItemId, table.modifierGroupId] })],
);
```

**Rule:** The junction table is the canonical source of truth. Metadata may reference the same IDs for backward compat, but reads should query the junction table.

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

| ID | Module | Issue | Action When Building |
|---|---|---|---|
| M3 | Reporting | `rm_daily_sales.netSales` formula should be `grossSales - discounts - refunds` | Use standard restaurant accounting formula, not `total - taxTotal` |
| M4 | Reporting | `rm_item_sales.quantitySold` should be `NUMERIC(10,4)` not `INTEGER` | F&B supports fractional qty (0.5 portions) — match `order_lines.qty` type |
| m1 | POS Config | Session 11 onboarding doesn't seed POS terminal config | Add terminal/drawer seeding when `POSConfig` schema is built (Session 13+) |

---

## 31. POS Frontend Architecture

### Dual-Mode Design

Two POS shells (`/pos/retail` and `/pos/fnb`) share one commerce engine (orders module). Either shell can sell any item type — a retail POS can sell F&B items (opens modifier dialog), and an F&B POS can sell retail items (direct add or option picker).

### Fullscreen Layout Pattern

POS pages use a **fullscreen overlay** that covers the dashboard sidebar:

```typescript
// apps/web/src/app/(dashboard)/pos/layout.tsx
// Fixed overlay: covers everything, including the (dashboard) sidebar
<div className="fixed inset-0 z-50 flex flex-col bg-gray-50">
  <TopBar />      {/* h-12: location, terminal, employee, clock, exit */}
  <div className="flex-1 overflow-hidden">{children}</div>
</div>
```

The top bar displays: location name, terminal ID, employee name (abbreviated), live clock, and exit button.

### Universal Item Tap Handler

**Every POS shell must use the same routing logic** — switch on `typeGroup`, never on raw `item.type`:

```typescript
function handleItemTap(item: CatalogItemForPOS): string {
  switch (item.typeGroup) {
    case 'fnb':     return 'openModifierDialog';
    case 'retail': {
      const meta = item.metadata as RetailMetadata | undefined;
      if (meta?.optionSets?.length) return 'openOptionPicker';
      return 'directAdd';
    }
    case 'service': return 'directAdd';
    case 'package': return 'openPackageConfirm';
  }
}
```

**Rule:** Always use `getItemTypeGroup()` from `@oppsera/shared` to derive the group. The mapping includes `green_fee` and `rental` as retail.

### Shell Differences (Retail vs F&B)

| Feature | Retail | F&B |
|---|---|---|
| Cart label | "Cart" | "Ticket" |
| Primary action | "Place & Pay" | "Send & Pay" |
| Tile size | `normal` (w-28 h-28) | `large` (w-36 h-36) |
| Tab size | `normal` | `large` |
| Grid columns | 2-5 | 2-4 |
| Search position | Top of left panel | Bottom of left panel |
| Repeat last | No | Yes (duplicates last line with modifiers) |

### Barcode Scanner Integration

Keyboard wedge scanners emit fast keystrokes. Detection via `keydown` listener on `window`:

```typescript
const SCAN_THRESHOLD = 50;  // ms between keystrokes
const MIN_LENGTH = 4;       // minimum barcode length

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

| Renderer | Shows | Qty Controls |
|---|---|---|
| `FnbLineItem` | Modifiers, special instructions, fraction picker | +/- cycling `allowedFractions` |
| `RetailLineItem` | Selected options (Size: M, Color: Blue) | None (qty=1) |
| `ServiceLineItem` | Duration from metadata | None (qty=1) |
| `PackageLineItem` | "Includes: item1, item2, ..." from components | None (qty=1) |

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
const pos = usePOS(config);
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

### useCatalogForPOS

```typescript
const catalog = useCatalogForPOS(locationId);
// catalog.departments, catalog.nav, catalog.currentItems, catalog.breadcrumb
// catalog.searchQuery, catalog.setSearchQuery, catalog.lookupByBarcode(code)
// catalog.favorites, catalog.toggleFavorite(id), catalog.recentItems, catalog.addToRecent(id)
```

Loads ALL categories + active items on mount. Builds hierarchy maps for O(1) navigation. Favorites in localStorage, recents in memory (capped at 20).

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
  id: string; name: string; sku: string | null; barcode: string | null;
  type: string;                    // raw backend type (food, retail, green_fee, etc.)
  typeGroup: ItemTypeGroup;        // derived via getItemTypeGroup()
  price: number;                   // cents (converted from catalog dollars)
  isTrackInventory: boolean; onHand: number | null;
  metadata: Record<string, unknown>;
  categoryId: string; departmentId: string;  // departmentId resolved by walking parent chain
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
| Tender Type | Debit Account | Code |
|---|---|---|
| cash | Cash on Hand | 1010 |
| card | Undeposited Funds | 1020 |
| gift_card | Gift Card Liability | 2200 |
| store_credit | Store Credit Liability | 2300 |
| house_account | Accounts Receivable | 1200 |

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
dotenv.config({ path: '../../.env.local' });  // local overrides first
dotenv.config({ path: '../../.env' });         // fallback
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

| Sub-Resource | Table | Key Fields |
|---|---|---|
| Contacts | `customer_contacts` | type (email/phone/address/social), isPrimary, isVerified |
| Preferences | `customer_preferences` | category, key, value, source (manual/inferred/imported), confidence |
| Documents | `customer_documents` | fileType, fileUrl, expiresAt |
| Communications | `customer_communications` | channel (email/sms/phone/push), direction, status |
| Service Flags | `customer_service_flags` | flagType, severity (info/warning/critical), isActive |
| Consents | `customer_consents` | consentType, status (granted/revoked), source |
| External IDs | `customer_external_ids` | provider, externalId |
| Wallets | `customer_wallet_accounts` | accountType (credit/loyalty/gift_card), currency, balanceCents |
| Alerts | `customer_alerts` | alertType, severity, isDismissed |
| Households | `customer_households` + `_members` | householdType, role (head/spouse/child/other), isPrimary |
| Visits | `customer_visits` | checkInAt, checkOutAt, checkInMethod, locationId |
| Incidents | `customer_incidents` | incidentType, severity, resolution, compensationType |
| Segments | `customer_segments` + `_memberships` | segmentType (static/dynamic/smart/manual) |
| Scores | `customer_scores` | scoreType (ltv/risk/churn/engagement), value, model |

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
- ~22 API routes under /api/v1/customers/[id]/profile/* and sub-resources
- 22 event types emitted (customer.contact.added.v1, customer.wallet.adjusted.v1, etc.)
- 11 hooks: useCustomerProfile, useCustomerFinancial, useCustomerPreferences, useCustomerActivityTab, useCustomerNotes, useCustomerDocuments, useCustomerCommunications, useCustomerCompliance, useCustomerSegments, useCustomerIntegrations, useCustomerAnalytics
- Customer Profile Drawer: 15 components, portal-based 560px slide-in panel, 11 tabs (Overview, Identity, Activity, Financial, Membership, Preferences, Notes, Documents, Communications, Tags, Compliance)
- ProfileDrawerContext: React Context provider with `useProfileDrawer()` hook (`open(customerId, { tab, source })`, `close()`)
- HouseholdTreeView: hierarchical display with Unicode branch chars, primary member crown icon, clickable member navigation

### Test Coverage
569 tests: 134 core + 68 catalog + 52 orders + 22 shared + 100 customers (44 Session 16 + 56 Session 16.5) + 183 web (75 POS + 66 tenders + 42 inventory) + 10 db

### What's Next
- Reporting module (Session 17)

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

| Endpoint | Tab | Method |
|---|---|---|
| `profile` | Overview | GET |
| `profile/financial` | Financial | GET |
| `profile/activity` | Activity | GET |
| `profile/notes` | Notes | GET |
| `profile/documents` | Documents | GET |
| `profile/preferences` | Preferences | GET |
| `profile/communications` | Communications | GET |
| `profile/compliance` | Compliance | GET |
| `profile/segments` | Tags | GET |
| `profile/integrations` | Identity | GET |
| `profile/analytics` | Overview (scores) | GET |

### Customer Frontend Types

Types live in `apps/web/src/types/customers.ts`. Key Session 16.5 types:

```typescript
CustomerContact, CustomerPreference, CustomerDocument, CustomerCommunication,
CustomerServiceFlag, CustomerConsent, CustomerExternalId, CustomerWalletAccount,
CustomerAlert, CustomerScore, CustomerHousehold, CustomerHouseholdMember,
CustomerVisit, CustomerIncident, CustomerSegmentMembership,
CustomerProfileStats, CustomerProfileOverview, CustomerFinancial
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

**Rule:** Never use `customer.metadata.X as string` (unsafe cast). Never render `unknown` directly as ReactNode.
