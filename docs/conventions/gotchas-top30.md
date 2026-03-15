# Top 30 Gotchas — On-Demand

> Read this file when you need the full top 30 gotchas. CLAUDE.md has the top 10 inline.
> For all 574 gotchas, see [gotchas-reference.md](gotchas-reference.md).

## Vercel DB Safety (PRODUCTION OUTAGE PREVENTION)
1. **NEVER fire-and-forget DB operations on Vercel** — any unawaited Promise touching the DB becomes a zombie connection when Vercel freezes the event loop. With `max: 2` pool, 2 zombies = total pool exhaustion = login failure. Use `try { await sideEffect(); } catch { /* log */ }` instead of `.catch(() => {})`. Caused 3 production outages (2026-02-27, 02-28, 03-01). See gotcha #466.
2. **Never use `setInterval` on Vercel** — timer callbacks fire after HTTP response, Vercel freezes event loop, DB queries become permanent zombies. See gotcha #471.
3. **Postgres timeouts via `ALTER DATABASE`, NEVER postgres.js `connection` param** — Supavisor rejects ALL connection startup params and kills the connection. See gotcha #473.
4. **`prepare: false` is REQUIRED for Supavisor** — postgres.js must set `prepare: false` when using Supabase's connection pooler in transaction mode. See gotcha #44.
5. **Connection pool `max: 2` on Vercel** — never set higher than 2-3 in serverless. Total connections = instances × max. See gotcha #45.

## Money Conversion (EVERY MODULE)
6. **Money: catalog/GL/AP/AR=dollars (NUMERIC), orders/payments=cents (INTEGER)** — convert with `Math.round(parseFloat(price) * 100)` for catalog→orders, `(cents / 100).toFixed(2)` for POS→GL. See gotcha #3.
7. **Drizzle `numeric` columns return strings** — always convert with `Number()` in query mappings. `"1.0000" !== 1` causes display bugs. See gotcha #35.
8. **Reporting consumers must convert cents to dollars** — read model columns are NUMERIC dollars, event payloads are INTEGER cents. Divide by 100 at boundary. See gotcha #286.

## Dark Mode (EVERY COMPONENT)
9. **Dark mode is DEFAULT, gray scale IS inverted** — BANNED: `bg-white` (use `bg-surface`), `text-gray-900` (use `text-foreground`), `border-gray-200` (use `border-border`), `dark:` prefixes. See gotcha #39 and `.claude/rules/dark-mode.md`.

## Cross-Module Safety
10. **Never add cross-module dependencies in package.json** — modules ONLY depend on `@oppsera/shared`, `@oppsera/db`, `@oppsera/core`. Use events or internal read APIs. See gotcha #40.
11. **Never query another module's tables in event consumers** — all needed data must be in the event payload. See gotcha #42.
12. **Event payloads must be self-contained** — consumers should NEVER query other modules' tables. See gotcha #50.

## GL / Accounting
13. **GL adapters NEVER throw** — GL failures log but never propagate. Business operations must always succeed. See gotcha #249.
14. **POS adapter never blocks tenders** — if GL mapping is missing, skip GL post and log to `gl_unmapped_events`. See gotcha #162.
15. **Posted journal entries are immutable** — void + create reversal. Never UPDATE. See gotcha #158.
16. **GL balance queries MUST include non-posted entry guard** — `(jl.id IS NULL OR je.id IS NOT NULL)` prevents draft entries from corrupting balances. See gotcha #441.

## POS Architecture
17. **POS layout dual-mounts both shells** — both Retail and F&B mount in `pos/layout.tsx`, toggle via CSS. Page files return `null`. See gotcha #8.
18. **POS `addItem()` is synchronous** — returns `void`, creates optimistic temp line instantly, batches via 50ms debounce. Never `await addItem()`. See gotcha #416.
19. **Tenders are append-only** — NEVER UPDATE financial fields. "Reversed" is a derived state. See gotcha #13.
20. **Inventory on-hand is ALWAYS computed** — `SUM(quantity_delta)` from movements. Never cache stock levels. See gotchas #18, #47.

## Database & Schema
21. **postgres.js returns RowList** — use `Array.from(result as Iterable<T>)`, never `.rows`. See gotcha #4.
22. **Always use parameterized SQL** — never string-interpolate. Use Drizzle `sql` template literals. See gotcha #23.
23. **Append-only tables** — `inventory_movements`, `audit_log`, `payment_journal_entries`, `ar_transactions` are never updated/deleted. See gotchas #5, #19, #26.

## Frontend
24. **Every dashboard page uses code-split pattern** — thin `page.tsx` wrapper with `next/dynamic` + `ssr: false`. Heavy content in `*-content.tsx`. See gotcha #107.
25. **`z.input<>` not `z.infer<>`** for function params when schema has `.default()`. See gotcha #1.
26. **Item typeGroup drives POS behavior** — always use `getItemTypeGroup()` from `@oppsera/shared`. See gotcha #9.

## Auth & Sessions
27. **`signOut()` must use `'local'` scope, never `'global'`** — `'global'` revokes ALL sessions across all devices. See gotcha #397.
28. **`validateToken()` must re-throw DB errors** — swallowing DB timeouts creates false 401s on cold starts. See gotcha #153.

## Testing
29. **`vi.clearAllMocks()` does NOT clear `mockReturnValueOnce` queues** — use `mockReset()`. See gotcha #58.
30. **Vitest coverage uses v8 provider** — run `pnpm test:coverage`. See gotcha #201.
