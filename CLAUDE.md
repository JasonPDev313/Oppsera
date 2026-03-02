# OppsEra

## What Is It?

Multi-tenant SaaS ERP for SMBs (retail, restaurant, golf, hybrid). Modular monolith — modules own their schema, communicate via events, extractable to microservices later. Target: ~4,000 tenants, ~5,000 locations.

## Tech Stack

| Layer | Choice |
|---|---|
| Monorepo | Turborepo + pnpm 9 |
| Frontend | Next.js 15 App Router, React 19, TypeScript strict, Tailwind v4 |
| Validation | Zod (runtime + TS inference) |
| Database | Postgres 16 with RLS |
| ORM | Drizzle (NOT Prisma) |
| DB driver | postgres (postgres.js, NOT pg) |
| Auth | Supabase Auth (V1), JWT-based |
| Icons | lucide-react |
| Testing | Vitest |
| API | REST, JSON, camelCase keys |
| Job System | Postgres-backed (SKIP LOCKED), no external queue dependency |
| Caching | Redis (Stage 2+), in-memory LRU (Stage 1) |
| Deployment | Vercel → Docker Compose → K8s (staged, see infra/MIGRATION_PLAN.md) |

## Modules

| Module | Key | Phase | Status |
|---|---|---|---|
| Platform Core (auth, RBAC, entitlements, events, audit) | platform_core | V1 | Done |
| Product Catalog (items, categories, modifiers, pricing, tax) | catalog | V1 | Done |
| Retail POS (orders, line items, discounts, tax calc) | orders | V1 | Done (backend + frontend) |
| Payments / Tenders + Gateway | payments | V1 | Done (cash V1 + CardPointe gateway + ACH + surcharges) |
| Inventory | inventory | V1 | Done (movements + receiving + vendor management) |
| Customer Management | customers | V1 | Done (CRM + Universal Profile + Intelligent Tag System) |
| Reporting / Exports | reporting | V1 | Done (complete: backend + frontend + custom builder + dashboards) |
| F&B POS (dual-mode, shares orders module) | pos_fnb | V1 | Done (frontend + backend module) |
| Restaurant KDS | kds | V1 | Done (settings infrastructure + station routing) |
| Golf Reporting | golf_reporting | V1 | Done (read models + consumers + frontend) |
| Room Layouts | room_layouts | V1 | Done (editor + templates + versioning) |
| Accounting Core (GL, COA, posting, reports, statements) | accounting | V1 | Done |
| Accounts Payable (bills, payments, vendors, aging) | ap | V1 | Done |
| Accounts Receivable v0 (invoices, receipts, aging) | ar | V1 | Done |
| Spa Management (appointments, packages, commissions) | spa | V1 | Done (scheduling, availability, online booking, packages, commissions, dynamic pricing) |
| Expense Management (policies, approvals, reimbursements) | expenses | V1 | Done (lifecycle, GL posting, policies, approvals) |
| Project Costing (projects, tasks, cost allocation) | project_costing | V1 | Done (project lifecycle, GL allocation, profitability) |
| Golf Operations | golf_ops | V2 | Planned |
| AI Insights (Semantic Layer) | semantic | V1 | Done (dual-mode pipeline + SQL generation + RAG + eval training platform) |
| Property Management (PMS) | pms | V1 | Done (reservations, calendar, folios, housekeeping, yield mgmt, channels, loyalty, POS integration) |
| ERP Workflow Engine | erp | V1 | Done (tier-based workflow defaults, close orchestrator, cron) |
| SuperAdmin Portal | admin_portal | V1 | Done (spec: 14 sessions, 120 API routes — implementation pending) |

## Monorepo Structure

```
oppsera/
├── apps/
│   ├── web/                          # Next.js frontend + API routes
│   │   ├── src/app/(auth)/           # Auth pages (login, signup, onboard)
│   │   ├── src/app/(dashboard)/      # Main app with sidebar layout
│   │   │   ├── pos/                  # Dual-mode POS (retail + F&B)
│   │   │   ├── orders/               # Order history + detail
│   │   │   └── insights/             # AI Insights chat + history + lenses
│   │   ├── src/app/api/v1/           # API route handlers (incl. /semantic/)
│   │   ├── src/components/           # UI, POS, semantic, insights components
│   │   ├── src/hooks/                # React hooks (incl. use-semantic-chat, use-feedback)
│   │   ├── src/lib/                  # Utilities (api-client)
│   │   └── src/types/                # Frontend type definitions
│   └── admin/                        # Platform admin panel (eval QA, tenant mgmt, user mgmt)
│       ├── src/app/(admin)/train-ai/ # AI training: examples, turns, batch review, experiments, playground, regression, safety, cost
│       ├── src/app/(admin)/tenants/  # Tenant management (list, detail, org hierarchy, entitlements)
│       ├── src/app/(admin)/users/    # User management (staff invite/suspend, customer search)
│       ├── src/app/api/v1/eval/      # Admin eval API routes
│       ├── src/app/api/v1/admin/     # Admin staff + customer API routes
│       ├── src/app/api/v1/tenants/   # Admin tenant CRUD + hierarchy API routes
│       ├── src/app/api/auth/         # Admin auth (JWT + bcrypt, separate from tenant auth)
│       ├── src/components/           # AdminSidebar, EvalTurnCard, tenants/, PlanViewer, etc.
│       ├── src/lib/                  # admin-audit, admin-context, admin-permissions, staff/customer queries
│       └── src/hooks/                # use-admin-auth, use-eval, use-tenants, use-staff, use-customers-admin
├── packages/
│   ├── shared/                       # @oppsera/shared — types, Zod schemas, utils, constants
│   ├── core/                         # @oppsera/core — auth, RBAC, events, audit, entitlements
│   ├── db/                           # @oppsera/db — Drizzle client, schema, migrations, seed
│   └── modules/
│       ├── catalog/                  # @oppsera/module-catalog — IMPLEMENTED
│       ├── orders/                   # @oppsera/module-orders — IMPLEMENTED
│       ├── payments/                 # @oppsera/module-payments — IMPLEMENTED (cash V1)
│       ├── inventory/                # @oppsera/module-inventory — IMPLEMENTED (movements ledger + events)
│       ├── customers/                # @oppsera/module-customers — IMPLEMENTED (CRM + Universal Profile)
│       ├── reporting/                # @oppsera/module-reporting — IMPLEMENTED (queries + consumers + CSV)
│       ├── golf-reporting/           # @oppsera/module-golf-reporting — IMPLEMENTED (golf analytics)
│       ├── semantic/                 # @oppsera/module-semantic — IMPLEMENTED (AI insights + dual-mode pipeline)
│       ├── pms/                      # @oppsera/module-pms — IMPLEMENTED (property management)
│       ├── kds/                      # @oppsera/module-kds — scaffolded
│       ├── golf-ops/                 # @oppsera/module-golf-ops — scaffolded
│       ├── accounting/               # @oppsera/module-accounting — IMPLEMENTED (GL, COA, posting, statements)
│       ├── ap/                       # @oppsera/module-ap — IMPLEMENTED (bills, payments, vendors, aging)
│       ├── ar/                       # @oppsera/module-ar — IMPLEMENTED (invoices, receipts, aging)
│       ├── fnb/                      # @oppsera/module-fnb — IMPLEMENTED (F&B POS domain: 103 commands, 63 queries, 1011 tests)
│       └── marketing/               # @oppsera/module-marketing — scaffolded
├── tools/scripts/
├── scripts/                          # Utility scripts (switch-env.sh)
├── CONVENTIONS.md                    # Development conventions INDEX (full version: docs/conventions/CONVENTIONS_FULL.md)
├── turbo.json
└── docker-compose.yml
```

## Package Dependencies

```
@oppsera/shared        ← no internal deps (Zod, ulid)
@oppsera/db            ← shared (Drizzle, postgres.js)
@oppsera/core          ← shared, db (Supabase, jsonwebtoken)
@oppsera/module-*      ← shared, db, core ONLY (Drizzle, Zod) — NEVER another module
@oppsera/web           ← all packages (orchestration layer — only place that imports multiple modules)
```

**NOTE**: Cross-module deps were eliminated in the architecture decoupling pass. Shared helpers (`checkIdempotency`, `saveIdempotencyKey`, `fetchOrderForMutation`, `incrementVersion`, `calculateTaxes`, `CatalogReadApi`) now live in `@oppsera/core/helpers/`. Pure domain math with no external deps (`computePackageAllocations`) lives in `@oppsera/shared/src/utils/`. Order and catalog modules provide thin re-exports for backward compat. Event payloads are self-contained: `order.placed.v1` includes `customerId` and `lines[]`, `order.voided.v1` includes `locationId`/`businessDate`/`total`, `tender.recorded.v1` includes `customerId`, `lines[]` (with `subDepartmentId`, `taxGroupId`, `packageComponents`), and `paymentMethod` alias.

## Key Architectural Patterns

### Middleware Chain
Every API route uses `withMiddleware(handler, options)`:
```
authenticate → resolveTenant → resolveLocation → requireEntitlement → requirePermission → handler
```
Options: `{ entitlement: 'catalog', permission: 'catalog.view' }`
Special mode: `{ authenticated: true, requireTenant: false }` for pre-tenant endpoints (onboarding).

### Command Pattern (Write Operations)
```typescript
async function createThing(ctx: RequestContext, input: ValidatedInput) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Idempotency check INSIDE the transaction (prevents race conditions)
    const idempotencyCheck = await checkIdempotency(tx, ctx.tenantId, input.clientRequestId, 'createThing');
    if (idempotencyCheck.isDuplicate) return { result: idempotencyCheck.originalResult as any, events: [] };

    // validate references, insert row
    const [created] = await tx.insert(table).values({...}).returning();
    const event = buildEventFromContext(ctx, 'module.entity.created.v1', {...});

    // Save idempotency key INSIDE the same transaction
    await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'createThing', created);
    return { result: created!, events: [event] };
  });

  await auditLog(ctx, 'module.entity.created', 'entity_type', result.id);
  return result;
}
```

### Query Pattern (Read Operations)
```typescript
async function listThings(input: ListInput): Promise<ListResult> {
  return withTenant(input.tenantId, async (tx) => {
    // build conditions, cursor pagination, limit+1 for hasMore
    const rows = await tx.select().from(table).where(and(...conditions))
      .orderBy(desc(table.id)).limit(limit + 1);
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    return { items, cursor: hasMore ? items[items.length-1]!.id : null, hasMore };
  });
}
```

### Optimistic Locking (Mutable Aggregates)
```typescript
// For commands that mutate existing aggregates (orders, etc.)
const order = await fetchOrderForMutation(tx, tenantId, orderId, 'open', expectedVersion?);
// ... mutate ...
await incrementVersion(tx, order.id);
```

### API Response Shapes
```typescript
// Success (list): { data: [...], meta: { cursor, hasMore } }
// Success (single): { data: {...} }
// Success (create): { data: {...} } with status 201
// Error: { error: { code: "VALIDATION_ERROR", message: "...", details: [...] } }
```

### Frontend Data Hooks
Custom hooks wrapping `apiFetch` with loading/error states. Pattern: `useFetch<T>(url)` returns `{ data, isLoading, error, mutate }`. Mutations use `useMutation<TInput, TResult>(fn)`.

### POS Dual-Mode Architecture
Two POS shells (Retail + F&B) share one commerce engine (orders module). Either sells any item type. Both are mounted simultaneously in `pos/layout.tsx` and toggled via CSS for instant switching (no route transition). Each receives an `isActive` prop to gate barcode scanning and dismiss portal dialogs when inactive.

| Hook | Purpose |
|---|---|
| `usePOSConfig(locationId, mode)` | Terminal config from localStorage (V1) |
| `usePOS(config)` | Order lifecycle state machine (add/remove items, place, void, hold/recall) |
| `useCatalogForPOS(locationId)` | Full catalog + 4-layer hierarchy navigation + search + barcode + favorites |
| `useShift(locationId, terminalId)` | Shift open/close, paid-in/out, drawer (localStorage V1) |
| `useOrders(filters)` | Order list with cursor pagination |

Universal item tap handler routes by `typeGroup`:
- `fnb` → open modifier dialog
- `retail` with options → open option picker
- `retail` without options → direct add
- `service` → direct add
- `package` → open package confirm

### Money: Dollars vs Cents
- **Catalog** stores prices/costs as `NUMERIC(12,2)` (dollars, string in TS)
- **Orders/Payments** store all amounts as `INTEGER` (cents, number in TS)
- **GL / AP / AR** store amounts as `NUMERIC(12,2)` (dollars, string in TS)
- **Receiving / Landed Cost** stores as `NUMERIC(12,4)` (dollars, 4-decimal precision)
- Convert at catalog→orders boundary: `Math.round(parseFloat(price) * 100)`
- Convert at POS→GL boundary: `(amountCents / 100).toFixed(2)`
- All order-layer arithmetic is integer-only — no floating point
- All GL/AP/AR arithmetic uses `Number()` conversion + `.toFixed(2)` at update time

## Multi-Tenancy

Every domain table has: `id` (ULID), `tenant_id`, optional `location_id`, `created_at`, `updated_at`.
Defense-in-depth: app-level filtering + `withTenant()` wrapper + Postgres RLS.

## RBAC

6 system roles: Owner (`*`), Manager, Supervisor, Cashier, Server, Staff.
Permission strings: `module.action` or `module.*` for wildcards. Cached 60s in Redis.
Role assignments can be tenant-wide or location-specific.

POS-specific permissions: `orders.create`, `orders.void`, `price.override`, `discounts.apply`, `charges.manage`, `cash.drawer`, `shift.manage`, `returns.create`, `tenders.create`, `tenders.view`.

## Event System

Naming: `{domain}.{entity}.{action}.v{N}` (e.g., `catalog.item.created.v1`)
Transactional outbox pattern. Consumers are idempotent. 3x retry with exponential backoff.

### Cross-Module Event Flow
```
catalog.item.created.v1  → inventory (auto-create inventory item)
order.placed.v1          → inventory (deduct stock, type-aware) + customers (AR charge if house account, update visit/spend stats)
order.voided.v1          → inventory (reverse stock) + tenders (reverse payments) + customers (AR void reversal)
tender.recorded.v1       → orders (mark paid when fully paid) + customers (AR payment + FIFO allocation if house account) + accounting (GL posting with subdepartment-resolved revenue)
```

### Internal Read APIs (Sync Cross-Module)
For synchronous lookups during transactions (not eventual consistency):
```typescript
const catalogApi = getCatalogReadApi();
const posItem = await catalogApi.getItemForPOS(tenantId, itemId, locationId);
// Returns: { id, sku, barcode, name, itemType, unitPriceCents, taxInfo, metadata, categoryId, subDepartmentId }
```

For accounting reconciliation queries (orders, tenders, settlements, tips, inventory, F&B):
```typescript
const api = getReconciliationReadApi();
const [ordersSummary, tendersSummary] = await Promise.all([
  api.getOrdersSummary(tenantId, startDate, endDate, locationId),
  api.getTendersSummary(tenantId, startDate, endDate, locationId),
]);
```

Internal APIs are read-only, use singleton getter/setter, and are the only exception to events-only cross-module rule.

## Deployment & Infrastructure

### Staged Deployment Path (Updated Feb 2026)
```
Stage 1 (10 locations):     Vercel Pro + Supabase Pro Micro (~$45/mo)
Stage 2 (100 locations):    + Supabase Medium compute + read replica + Redis (~$175/mo)
Stage 3 (1,000 locations):  + Supabase Large compute (~$505/mo) — still on Vercel
Stage 4 (5,000 locations):  AWS ECS + RDS + ElastiCache (~$1,195/mo) — containers win
```
Cost crossover at ~2,000-3,000 locations (NOT ~100 as previously estimated).
Real migration drivers: compliance, cold starts, log retention — not cost.
See `infra/MIGRATION_PLAN.md` and `infra/LIMITS_AND_MIGRATION.ts` for full analysis.

### Connection Pooling (Vercel + Supavisor)
```typescript
// postgres.js config for Vercel serverless
const pool = postgres(DATABASE_URL, {
  max: 2,              // low per-instance (many concurrent instances)
  prepare: false,       // REQUIRED for Supavisor transaction mode
  idle_timeout: 20,
  max_lifetime: 300,
});
```

### Postgres Tuning
```
statement_timeout = 30s
idle_in_transaction_session_timeout = 60s
lock_timeout = 5s
```
Per-table autovacuum for write-heavy tables (orders, inventory_movements, event_outbox):
`autovacuum_vacuum_scale_factor = 0.05, autovacuum_analyze_scale_factor = 0.02`

### Background Jobs
Postgres-native job system using `SKIP LOCKED` (no pg-boss/BullMQ/Redis at Stage 1):
- Tables: `background_jobs`, `background_job_attempts`, `scheduled_jobs`
- JobWorker polls with `FOR UPDATE SKIP LOCKED` for lock-free concurrency
- Tenant fairness: `maxJobsPerTenantPerPoll` cap prevents noisy neighbors
- Lease + heartbeat mechanism for crash recovery
- On Vercel: Vercel Cron pings `/api/v1/internal/drain-jobs` every minute as safety net

### Tenant Tiers
```
small:      ≤5 locations, 100 req/min, 10 concurrent jobs
medium:     ≤20 locations, 500 req/min, 25 concurrent jobs
large:      ≤100 locations, 2000 req/min, 50 concurrent jobs
enterprise: unlimited, 5000 req/min, 100 concurrent jobs
```

### Observability
- **Sentry** for error tracking + performance tracing (Stage 1)
- **pg_stat_statements** enabled from day 1 — review weekly for top-20 slowest queries
- Structured JSON logging with `tenantId`, `requestId`, `duration` on every request
- Stock alerts: `inventory.low_stock.v1`, `inventory.negative.v1` events for monitoring

## Critical Gotchas (Top 30 — Production Safety)

> Full list of all 490 gotchas: [docs/conventions/gotchas-reference.md](docs/conventions/gotchas-reference.md)

### Vercel DB Safety (PRODUCTION OUTAGE PREVENTION)
1. **NEVER fire-and-forget DB operations on Vercel** — any unawaited Promise touching the DB becomes a zombie connection when Vercel freezes the event loop. With `max: 2` pool, 2 zombies = total pool exhaustion = login failure. Use `try { await sideEffect(); } catch { /* log */ }` instead of `.catch(() => {})`. Caused 3 production outages (2026-02-27, 02-28, 03-01). See gotcha #466.
2. **Never use `setInterval` on Vercel** — timer callbacks fire after HTTP response, Vercel freezes event loop, DB queries become permanent zombies. See gotcha #471.
3. **Postgres timeouts via `ALTER DATABASE`, NEVER postgres.js `connection` param** — Supavisor rejects ALL connection startup params and kills the connection. See gotcha #473.
4. **`prepare: false` is REQUIRED for Supavisor** — postgres.js must set `prepare: false` when using Supabase's connection pooler in transaction mode. See gotcha #44.
5. **Connection pool `max: 2` on Vercel** — never set higher than 2-3 in serverless. Total connections = instances × max. See gotcha #45.

### Money Conversion (EVERY MODULE)
6. **Money: catalog/GL/AP/AR=dollars (NUMERIC), orders/payments=cents (INTEGER)** — convert with `Math.round(parseFloat(price) * 100)` for catalog→orders, `(cents / 100).toFixed(2)` for POS→GL. See gotcha #3.
7. **Drizzle `numeric` columns return strings** — always convert with `Number()` in query mappings. `"1.0000" !== 1` causes display bugs. See gotcha #35.
8. **Reporting consumers must convert cents to dollars** — read model columns are NUMERIC dollars, event payloads are INTEGER cents. Divide by 100 at boundary. See gotcha #286.

### Dark Mode (EVERY COMPONENT)
9. **Dark mode is DEFAULT, gray scale IS inverted** — BANNED: `bg-white` (use `bg-surface`), `text-gray-900` (use `text-foreground`), `border-gray-200` (use `border-border`), `dark:` prefixes. See gotcha #39 and `.claude/rules/dark-mode.md`.

### Cross-Module Safety
10. **Never add cross-module dependencies in package.json** — modules ONLY depend on `@oppsera/shared`, `@oppsera/db`, `@oppsera/core`. Use events or internal read APIs. See gotcha #40.
11. **Never query another module's tables in event consumers** — all needed data must be in the event payload. See gotcha #42.
12. **Event payloads must be self-contained** — consumers should NEVER query other modules' tables. See gotcha #50.

### GL / Accounting
13. **GL adapters NEVER throw** — GL failures log but never propagate. Business operations must always succeed. See gotcha #249.
14. **POS adapter never blocks tenders** — if GL mapping is missing, skip GL post and log to `gl_unmapped_events`. See gotcha #162.
15. **Posted journal entries are immutable** — void + create reversal. Never UPDATE. See gotcha #158.
16. **GL balance queries MUST include non-posted entry guard** — `(jl.id IS NULL OR je.id IS NOT NULL)` prevents draft entries from corrupting balances. See gotcha #441.

### POS Architecture
17. **POS layout dual-mounts both shells** — both Retail and F&B mount in `pos/layout.tsx`, toggle via CSS. Page files return `null`. See gotcha #8.
18. **POS `addItem()` is synchronous** — returns `void`, creates optimistic temp line instantly, batches via 50ms debounce. Never `await addItem()`. See gotcha #416.
19. **Tenders are append-only** — NEVER UPDATE financial fields. "Reversed" is a derived state. See gotcha #13.
20. **Inventory on-hand is ALWAYS computed** — `SUM(quantity_delta)` from movements. Never cache stock levels. See gotchas #18, #47.

### Database & Schema
21. **postgres.js returns RowList** — use `Array.from(result as Iterable<T>)`, never `.rows`. See gotcha #4.
22. **Always use parameterized SQL** — never string-interpolate. Use Drizzle `sql` template literals. See gotcha #23.
23. **Append-only tables** — `inventory_movements`, `audit_log`, `payment_journal_entries`, `ar_transactions` are never updated/deleted. See gotchas #5, #19, #26.

### Frontend
24. **Every dashboard page uses code-split pattern** — thin `page.tsx` wrapper with `next/dynamic` + `ssr: false`. Heavy content in `*-content.tsx`. See gotcha #107.
25. **`z.input<>` not `z.infer<>`** for function params when schema has `.default()`. See gotcha #1.
26. **Item typeGroup drives POS behavior** — always use `getItemTypeGroup()` from `@oppsera/shared`. See gotcha #9.

### Auth & Sessions
27. **`signOut()` must use `'local'` scope, never `'global'`** — `'global'` revokes ALL sessions across all devices. See gotcha #397.
28. **`validateToken()` must re-throw DB errors** — swallowing DB timeouts creates false 401s on cold starts. See gotcha #153.

### Testing
29. **`vi.clearAllMocks()` does NOT clear `mockReturnValueOnce` queues** — use `mockReset()`. See gotcha #58.
30. **Vitest coverage uses v8 provider** — run `pnpm test:coverage`. See gotcha #201.

## Reference Documents

Detailed reference docs live in `docs/conventions/` — read on demand, not upfront:

| File | Contents |
|---|---|
| [docs/conventions/whats-built.md](docs/conventions/whats-built.md) | Complete inventory of all modules, tests, migrations, features (1,500 lines) |
| [docs/conventions/gotchas-reference.md](docs/conventions/gotchas-reference.md) | All 490 numbered gotchas with full details (508 lines) |
| [docs/conventions/CONVENTIONS_FULL.md](docs/conventions/CONVENTIONS_FULL.md) | Full development conventions — 214 sections (10,796 lines) |

**CONVENTIONS.md at the project root is an INDEX** — it lists all 214 convention sections with line numbers pointing into `CONVENTIONS_FULL.md`. When you need a specific convention, find the section number in the index, then read only that section from the full file.

## Migration Rules (IMPORTANT — Multi-Agent Safety)

Multiple agents work on this codebase concurrently. Migrations are a **serialized resource** — two agents creating the same numbered migration causes journal conflicts that silently skip migrations in production.

1. **Before creating a migration file**, read `packages/db/migrations/meta/_journal.json` to find the highest `idx`. Your new migration uses `idx + 1`.
2. **Always update `_journal.json` in the same commit** as the new `.sql` file. A migration without a journal entry will be silently ignored by `pnpm db:migrate`.
3. **Never assume the next number** — another agent may have created one since your last check. Always re-read the journal right before writing.
4. **Migration file naming**: `{number}_{snake_case_description}.sql` where `{number}` is zero-padded to 4 digits matching the journal `idx` offset (currently 0-based: idx 0 = file 0000).
5. **Use `IF NOT EXISTS` / `IF EXISTS`** for all DDL (`CREATE TABLE IF NOT EXISTS`, `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, `DROP TABLE IF EXISTS`) so migrations are idempotent and safe to re-run.
6. **Local vs Remote migrations**:
   - `pnpm db:migrate` → runs against local DB (`.env.local`, port 54322)
   - `pnpm db:migrate:remote` → runs against production Supabase (`.env.remote`)
   - Always specify which target when asking for migrations to be run

## Quick Commands

```bash
pnpm dev                  # Start dev server
pnpm --filter @oppsera/web dev:fix   # Fix Local Server — kill Node, clean .next, restart (Windows)
pnpm build                # Build all packages
pnpm test                 # Run all tests
pnpm test:coverage        # Run tests with coverage reporting
pnpm lint                 # Lint all packages
pnpm type-check           # TypeScript check all packages
pnpm db:migrate           # Run DB migrations (LOCAL)
pnpm db:migrate:remote    # Run DB migrations (PRODUCTION)
pnpm db:seed              # Seed development data
pnpm tsx packages/db/src/seed-year.ts          # Seed 366 days of transactions (LOCAL)
pnpm tsx packages/db/src/seed-year.ts --remote # Seed 366 days of transactions (PRODUCTION)
pnpm tsx tools/scripts/seed-portal-auth.ts     # Create portal auth for all customers (LOCAL)
pnpm tsx tools/scripts/seed-portal-auth.ts --remote  # Portal auth (PRODUCTION)
```

### Troubleshooting: CSS Not Loading (Windows)

If the page renders unstyled (raw text, no layout), Tailwind utility classes aren't being generated. This is a recurring Windows-specific issue with Tailwind v4's native binary + Turbopack cache corruption.

**Quick fix (90% of cases):**
```bash
taskkill /F /IM node.exe          # Kill all Node (Windows file locks prevent .next deletion)
rm -rf apps/web/.next             # Delete corrupted Turbopack cache
pnpm dev                          # Restart dev server
# Then Ctrl+Shift+R in browser    # Hard refresh to bypass browser cache
```

**Verify CSS is healthy:**
```bash
# After dev server starts, check the CSS file size (should be ~185KB, NOT ~12KB)
curl -s http://localhost:3000/dashboard | grep -oP 'href="(/[^"]*\.css[^"]*)"'
# Then fetch that URL and check size:
curl -s http://localhost:3000/<css-url> | wc -c
```

**If CSS is still broken after clean restart:**
```bash
# 1. Verify Tailwind oxide native binary loads (should print "Scanner")
node -e "console.log(Object.keys(require('@tailwindcss/oxide')))"

# 2. If oxide fails, reinstall
pnpm install

# 3. Verify @source directive exists in globals.css (REQUIRED for monorepo)
head -2 apps/web/src/app/globals.css
# Must show: @import 'tailwindcss';
#            @source "../../";

# 4. Nuclear option — full cache wipe
rm -rf apps/web/.next node_modules/.cache
pnpm dev
```

**Root causes:**
- `.next/trace` EPERM file locks (Windows antivirus / lingering Node processes)
- Tailwind v4 oxide WASM fallback (returns 0 scan results on Windows)
- Missing `@source "../../"` directive (monorepo files not scanned)
- Turbopack caching stale empty CSS from a previous broken session
