# OppsEra

Multi-tenant SaaS ERP for SMBs (retail, restaurant, golf, hybrid). Modular monolith — modules own schema, communicate via events. Target: ~4,000 tenants, ~5,000 locations.

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
| Deployment | Vercel (Stage 1) → Docker/K8s (Stage 4) |

## Monorepo Structure

```
apps/web/           — Next.js frontend + API routes (src/app/api/v1/)
apps/admin/         — Platform admin panel
packages/shared/    — @oppsera/shared (types, Zod, utils)
packages/core/      — @oppsera/core (auth, RBAC, events, audit)
packages/db/        — @oppsera/db (Drizzle, schema, migrations)
packages/modules/*  — Domain modules (catalog, orders, payments, inventory, customers, reporting, fnb, accounting, ap, ar, spa, pms, semantic, etc.)
```

## Package Dependency Rule

```
@oppsera/shared        ← no internal deps
@oppsera/db            ← shared
@oppsera/core          ← shared, db
@oppsera/module-*      ← shared, db, core ONLY — NEVER another module
@oppsera/web           ← all packages (orchestration layer)
```

Shared helpers live in `@oppsera/core/helpers/`. Pure domain math in `@oppsera/shared/src/utils/`.

## Key Patterns (Summary)

- **Middleware**: `withMiddleware(handler, { entitlement, permission })` — authenticate → resolveTenant → resolveLocation → requireEntitlement → requirePermission → handler
- **Commands**: `publishWithOutbox(ctx, tx => { checkIdempotency → insert → buildEvent → saveIdempotencyKey })` then `auditLog()`
- **Queries**: `withTenant(tenantId, tx => { ...cursor pagination, limit+1 for hasMore })`
- **Optimistic locking**: `fetchOrderForMutation()` → mutate → `incrementVersion()`
- **API shapes**: List `{ data, meta: { cursor, hasMore } }`, Single `{ data }`, Error `{ error: { code, message } }`
- **Frontend hooks**: `useFetch<T>(url)` → `{ data, isLoading, error, mutate }`, `useMutation<I,R>(fn)`
- **POS dual-mode**: Both shells mount in `pos/layout.tsx`, toggle via CSS, `isActive` prop gates scanning
- **Events**: `{domain}.{entity}.{action}.v{N}`, transactional outbox, idempotent consumers, 3x retry

> Full code examples and details: [docs/conventions/architecture-reference.md](docs/conventions/architecture-reference.md)

## Money Rules

- **Catalog/GL/AP/AR** = dollars (NUMERIC string) | **Orders/Payments** = cents (INTEGER number)
- Catalog→Orders: `Math.round(parseFloat(price) * 100)` | POS→GL: `(cents / 100).toFixed(2)`
- Drizzle `numeric` returns strings — convert with `Number()`. All order math is integer-only.

## Multi-Tenancy

Every table: `id` (ULID), `tenant_id`, optional `location_id`, `created_at`, `updated_at`.
Defense-in-depth: app-level filtering + `withTenant()` + Postgres RLS.

## RBAC

6 roles: Owner (`*`), Manager, Supervisor, Cashier, Server, Staff. Permissions: `module.action` or `module.*`.

## Critical Gotchas (Top 10)

1. **NEVER fire-and-forget DB ops on Vercel** — unawaited DB Promises = zombie connections = pool exhaustion. Always `await`. See #466.
2. **Never `setInterval` on Vercel** — creates permanent DB zombies. See #471.
3. **`prepare: false` REQUIRED for Supavisor** — postgres.js + transaction mode pooler. See #44.
4. **Pool `max: 2` on Vercel** — total conns = instances × max. See #45.
5. **Money: dollars vs cents** — catalog/GL=dollars (NUMERIC), orders=cents (INTEGER). See #3.
6. **Drizzle numeric = strings** — always `Number()` convert. See #35.
7. **Dark mode is DEFAULT** — BANNED: `bg-white`, `text-gray-900`, `border-gray-200`, `dark:` prefixes. See `.claude/rules/dark-mode.md`.
8. **Never cross-module deps** — modules depend on shared/db/core ONLY. Events or read APIs for cross-module. See #40.
9. **GL adapters NEVER throw** — business ops must always succeed. See #249.
10. **postgres.js returns RowList** — use `Array.from(result as Iterable<T>)`, never `.rows`. See #4.

> Full top 30: [docs/conventions/gotchas-top30.md](docs/conventions/gotchas-top30.md) | All 490: [docs/conventions/gotchas-reference.md](docs/conventions/gotchas-reference.md)

## Migration Rules (Multi-Agent Safety)

1. Read `packages/db/migrations/meta/_journal.json` for highest `idx` before creating a migration
2. Update `_journal.json` in the same commit as the `.sql` file
3. File naming: `{0000}_{snake_case}.sql` (zero-padded, matching idx)
4. Use `IF NOT EXISTS` / `IF EXISTS` for idempotent DDL
5. `pnpm db:migrate` = local | `pnpm db:migrate:remote` = production

## Quick Commands

```bash
pnpm dev                  # Start dev server
pnpm --filter @oppsera/web dev:fix   # Fix Local Server (Windows)
pnpm build                # Build all
pnpm test                 # Run all tests
pnpm type-check           # TypeScript check
pnpm db:migrate           # Migrations (LOCAL)
pnpm db:migrate:remote    # Migrations (PRODUCTION)
pnpm db:seed              # Seed dev data
```

> CSS broken? See [docs/conventions/css-troubleshooting.md](docs/conventions/css-troubleshooting.md)

## Reference Documents (Read On-Demand)

| File | When to Read |
|---|---|
| [docs/conventions/architecture-reference.md](docs/conventions/architecture-reference.md) | Writing API routes, commands, queries, POS, events, cross-module code |
| [docs/conventions/infrastructure-reference.md](docs/conventions/infrastructure-reference.md) | Deployment, DB config, connection pooling, background jobs, observability |
| [docs/conventions/css-troubleshooting.md](docs/conventions/css-troubleshooting.md) | CSS not loading, page unstyled |
| [docs/conventions/gotchas-top30.md](docs/conventions/gotchas-top30.md) | Need full details on top 30 gotchas |
| [docs/conventions/gotchas-reference.md](docs/conventions/gotchas-reference.md) | All 490 gotchas |
| [docs/conventions/whats-built.md](docs/conventions/whats-built.md) | Complete module/feature inventory |
| [docs/conventions/CONVENTIONS_FULL.md](docs/conventions/CONVENTIONS_FULL.md) | Full dev conventions (214 sections) |
| [CONVENTIONS.md](CONVENTIONS.md) | Index into CONVENTIONS_FULL.md by section number |
