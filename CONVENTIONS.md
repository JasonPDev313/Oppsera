# OppsEra — Conventions Index

> **This is an index.** The full conventions document is at `docs/conventions/CONVENTIONS_FULL.md` (10,796 lines).
> Read only the sections you need by line range. Do NOT load the entire file into context.

---

## How to Use

1. Find the relevant section(s) below by topic or number
2. Read that section from `docs/conventions/CONVENTIONS_FULL.md` using the line range
3. Example: `Read file_path=docs/conventions/CONVENTIONS_FULL.md offset=150 limit=80` for §5

---

## Section Index

### Core Architecture (§1–§10)

| § | Section | Lines | Key Topics |
|---|---------|-------|------------|
| 1 | Monorepo Structure | 1–27 | pnpm, Turborepo, workspace layout |
| 2 | Database & Schema | 29–120 | Drizzle, postgres.js, table conventions, RLS, indexes |
| 3 | Package Dependency Rules | 122–155 | Module isolation, cross-module deps banned |
| 4 | TypeScript Conventions | 157–210 | strict mode, naming, Zod inference, barrels |
| 5 | API Layer | 212–290 | REST, JSON, camelCase, withMiddleware, response shapes |
| 6 | Command Pattern | 292–380 | publishWithOutbox, idempotency, optimistic locking |
| 7 | Query Pattern | 382–430 | withTenant, cursor pagination, limit+1 |
| 8 | Event System | 432–510 | Outbox, naming, consumers, retry, dead letters |
| 9 | Error Handling | 512–570 | AppError, HTTP codes, error response format |
| 10 | Logging & Observability | 572–620 | Structured JSON, Sentry, pg_stat_statements |

### Testing (§11–§12)

| § | Section | Lines | Key Topics |
|---|---------|-------|------------|
| 11 | Testing — Vitest | 622–700 | Config, mocking, coverage, clearAllMocks vs mockReset |
| 12 | Testing — Patterns | 702–760 | Unit vs integration, mock factories, test isolation |

### Auth & Security (§13–§14)

| § | Section | Lines | Key Topics |
|---|---------|-------|------------|
| 13 | Authentication | 762–830 | Supabase Auth, JWT, validateToken, DevAuthAdapter |
| 14 | RBAC & Permissions | 832–900 | Roles, permission strings, caching, location-scoped |

### Frontend (§15–§16)

| § | Section | Lines | Key Topics |
|---|---------|-------|------------|
| 15 | Frontend — Hooks & Data | 902–970 | useFetch, useMutation, apiFetch, React Query |
| 16 | Frontend — Components | 972–1050 | Tailwind, shadcn, portals, code-split, dark mode |

### Module Architecture (§17–§30)

| § | Section | Lines | Key Topics |
|---|---------|-------|------------|
| 17 | Catalog Module | 1052–1130 | Items, categories, hierarchy, archive semantics |
| 18 | Orders Module | 1132–1210 | Order lifecycle, line items, type-aware processing |
| 19 | Zod `.input<>` vs `.infer<>` | 1212–1240 | Function params with `.default()` |
| 20 | Export type bindings | 1242–1260 | `export type` doesn't create local bindings |
| 21 | Money conventions | 1262–1310 | Dollars vs cents, catalog/GL vs orders/payments |
| 22 | Inventory Module | 1312–1400 | Append-only movements, on-hand computation |
| 23 | Payments Module | 1402–1480 | Tenders, GL journals, reversals |
| 24 | Customer Module | 1482–1560 | CRM, billing/AR, profile drawer, merge |
| 25 | Reporting Module | 1562–1640 | Read models, consumers, CSV export |
| 26 | Receiving/Vendors | 1642–1720 | Receipt lifecycle, shipping allocation, vendor mgmt |
| 27 | Purchase Orders | 1722–1760 | Schema-only phase, optimistic locking |
| 28 | Package components | 1762–1810 | Sum-of-components pricing, allocation |
| 29 | Catalog frontend | 1812–1850 | Stock section, code-split, inventory dialogs |
| 30 | Speed improvements | 1852–1930 | Code-split, covering indexes, SWR dashboard |

### POS Architecture (§31–§38)

| § | Section | Lines | Key Topics |
|---|---------|-------|------------|
| 31 | POS dual-mode | 1932–2000 | Retail + F&B, CSS-mounted, instant switching |
| 32 | POS hooks | 2002–2060 | usePOS, useCatalogForPOS, useShift |
| 33 | POS item handling | 2062–2110 | typeGroup routing, barcode scanner |
| 34 | POS tenders | 2112–2170 | Append-only, clientRequestId, GL allocation |
| 35 | POS payment flow | 2172–2230 | TenderDialog, preemptive placeOrder, 409 recovery |
| 36 | POS batch line items | 2232–2280 | 50ms debounce, max 20, optimistic temp lines |
| 37 | POS display/UX | 2282–2340 | Font scale, error boundary, visibility resume |
| 38 | POS offline | 2342–2370 | V1 blocks tenders offline, typed queue for V2 |

### Domain Modules (§39–§64)

| § | Section | Lines | Key Topics |
|---|---------|-------|------------|
| 39 | Golf Reporting | 2372–2420 | Separate module, read models, consumers |
| 40 | Room Layouts | 2422–2520 | Konva, 3-layer canvas, Zustand, templates |
| 41 | Room Layout validation | 2522–2560 | Warning-based, error boundary, publish flow |
| 42 | Room Layout conventions | 2562–2620 | Dark mode, portal dialogs, version history |
| 43 | Mobile responsiveness | 2622–2650 | 320px+ requirement, breakpoints |
| 44 | PMS Module | 2652–2780 | Reservations, calendar, folios, state machines |
| 45 | PMS helpers | 2782–2850 | Pricing engine, room assignment, channels, loyalty |
| 46 | F&B POS Module | 2852–2980 | 103 commands, 63 queries, frontend phases |
| 47 | F&B conventions | 2982–3060 | Design tokens, CSS vars, Zustand routing |
| 48 | F&B floor/tab | 3062–3120 | CSS-mounted views, snapshot cache, menu dedup |
| 49 | Spa Module | 3122–3250 | Appointments, packages, commissions, booking |
| 50 | Spa conventions | 3252–3310 | State machine, conflict detection, dynamic pricing |
| 51 | Semantic Layer | 3312–3450 | Dual-mode pipeline, SQL gen, narrative engine |
| 52 | Semantic conventions | 3452–3540 | Registry SWR, cache keys, rate limiter |
| 53 | Semantic streaming | 3542–3600 | SSE pipeline, fast path, prompt caching |
| 54 | Semantic eval | 3602–3670 | Training platform, examples, batch review |
| 55 | Admin Portal | 3672–3780 | RBAC, tenant mgmt, impersonation, health scoring |
| 56 | Admin conventions | 3782–3840 | Fine-grained permissions, DLQ, batch ops |
| 57 | Customer Tags | 3842–3940 | Smart tags, RFM, conflict resolution, actions |
| 58 | Expense Management | 3942–3990 | Policies, approvals, GL posting, reimbursement |
| 59 | Project Costing | 3992–4040 | Tasks, cost allocation, profitability |
| 60 | Multi-Currency | 4042–4090 | Exchange rates, functional amounts, revaluation |
| 61 | Fixed Assets | 4092–4130 | Depreciation, disposal, monthly auto-depreciation |
| 62 | Budget System | 4132–4170 | Budget lifecycle, budget vs actual |
| 63 | Receipt Engine | 4172–4220 | Builder pattern, renderers, tokenized links |
| 64 | Guest Pay | 4222–4270 | QR code, member charge, lookup codes |

### Accounting & GL (§65–§80)

| § | Section | Lines | Key Topics |
|---|---------|-------|------------|
| 65 | Accounting Core | 4272–4380 | GL, COA, posting engine, financial statements |
| 66 | Accounting posting | 4382–4460 | Double-entry, period locking, control accounts |
| 67 | AP Module | 4462–4520 | Bills, payments, FIFO allocation, aging |
| 68 | AR Module | 4522–4580 | Invoices, receipts, aging, customer ledger |
| 69 | Subledger reconciliation | 4582–4630 | Cross-module via ReconciliationReadApi |
| 70 | Cross-module financial posting | 4632–4700 | AccountingPostingApi, never import accounting |
| 71 | GL adapters | 4702–4790 | 15 adapters, canonical pattern, never throw |
| 72 | GL unmapped events | 4792–4840 | Universal audit trail, close checklist |
| 73 | POS→GL pipeline | 4842–4920 | Subdepartment resolution, package splitting |
| 74 | Void/Return GL | 4922–4970 | Per-tender reversal, contra accounts |
| 75 | F&B GL | 4972–5020 | Category→account mapping, batch journal lines |
| 76 | Voucher/Membership GL | 5022–5080 | Deferred revenue, lifecycle GL entries |
| 77 | Chargeback GL | 5082–5120 | Received/won/lost lifecycle |
| 78 | Close workflow | 5122–5200 | Period status, checklist items, posting gaps |
| 79 | COA governance | 5202–5260 | Merge, renumber, CSV import, health dashboard |
| 80 | GL remap | 5262–5310 | Preview, batch remap, auto-remap setting |

### Operations & Close (§81–§97)

| § | Section | Lines | Key Topics |
|---|---------|-------|------------|
| 81 | Drawer sessions | 5312–5370 | Server-persisted shifts, events, cash control |
| 82 | Retail close batch | 5372–5430 | Start/lock/reconcile/post, Z-report |
| 83 | Comp vs discount GL | 5432–5470 | Expense vs contra-revenue, manager PIN |
| 84 | Card settlements | 5472–5530 | CSV import, auto-match, GL posting |
| 85 | Tip payouts | 5532–5580 | Cash/payroll modes, balance tracking |
| 86 | COGS posting | 5582–5620 | Tri-state: disabled/perpetual/periodic |
| 87 | Tax jurisdiction | 5622–5660 | Authority columns, remittance report |
| 88 | Dead letter queue | 5662–5710 | DB persistence, admin UI, retry |
| 89 | Deposit slips | 5712–5760 | Aggregate cash, GL, depends on all closes |
| 90 | Close checklist | 5762–5830 | 18+ items, computed live |
| 91 | Profit centers | 5832–5910 | terminal_locations table, Simple/Advanced mode |
| 92 | Terminal infrastructure | 5912–5960 | 9+ tables, hierarchy, session flow |
| 93 | Location hierarchy | 5962–6010 | Site → Venue → Profit Center → Terminal |
| 94 | Terminal session | 6012–6070 | 3-key localStorage, selection screen |
| 95 | Entitlement access modes | 6072–6130 | off/view/full, dependency validation |
| 96 | Payment gateway | 6132–6210 | CardPointe, ACH, surcharges, provider registry |
| 97 | ERP workflow engine | 6212–6270 | Tier-based defaults, close orchestrator, cron |

### Transaction Types & Modifiers (§98–§109)

| § | Section | Lines | Key Topics |
|---|---------|-------|------------|
| 98* | Transaction type registry | 6272–6330 | 45 system types, dual-table, posting modes |
| 98* | KDS settings | 6332–6400 | Bump bar, alerts, performance targets, routing |
| 99 | Modifier groups | 6402–6460 | Categories, channel visibility, per-assignment |
| 100 | Role access scoping | 6462–6500 | Location/PC/terminal junction tables |
| 101 | Onboarding system | 6502–6570 | 10 phases, auto-detection, Go Live checklist |
| 102 | Guest waitlist public | 6572–6610 | Rate-limited, no auth, 8-char tokens |
| 103 | Member portal | 6612–6660 | Standalone app, portal auth, dark-mode only |
| 104 | Discount GL classification | 6662–6730 | 24 types, contra-revenue vs expense |
| 105 | PII masking | 6732–6770 | Two-layer detection, semantic pipeline |
| 106 | Semantic authoring | 6772–6810 | Tenant-scoped metrics/dimensions |
| 107 | Admin backup | 6812–6860 | Dual-mode: filesystem + DB BYTEA |
| 108 | Accessibility | 6862–6920 | Dialog a11y, focus trap, live region, ESLint |
| 109 | UI components | 6922–6980 | Select combobox, form fields, dark mode |

### Settings & Performance (§110–§135)

| § | Section | Lines | Key Topics |
|---|---------|-------|------------|
| 110 | Settings page | 6982–7050 | 6-tab General layout, redirect, lazy tabs |
| 111 | Merchant services UI | 7052–7120 | 5-tab layout, React Query hooks |
| 112 | Business info | 7122–7180 | tenant_business_info, content blocks, tax masking |
| 113 | API consolidation | 7182–7230 | [action] dynamic routes, 43→14 handlers |
| 114 | Usage analytics | 7232–7290 | Tracker, workflow registry, action items |
| 115 | Feature flags | 7292–7330 | Dual-table, definitions + tenant overrides |
| 116 | Impersonation safety | 7332–7390 | 6 assertion guards, action counting |
| 117 | Performance caching | 7392–7460 | Auth cache, location cache, permission cache |
| 118 | Pool guard | 7462–7530 | Semaphore, circuit breaker, zombie tracking |
| 119 | Step-up auth | 7532–7580 | HMAC-SHA256, category TTLs, PIN modal |
| 120 | Bot detector | 7582–7620 | Weighted scoring, LRU cache |
| 121 | Replay guard | 7622–7660 | Nonce + timestamp, 5-min window |
| 122 | Security headers | 7662–7710 | CSP, HSTS, rate limiting |
| 123 | Deployment | 7712–7780 | Vercel stages, connection pooling, cron |
| 124 | Background jobs | 7782–7830 | SKIP LOCKED, tenant fairness, lease/heartbeat |
| 125 | Infrastructure | 7832–7900 | Container migration, K8s decision criteria |
| 126 | CI/CD | 7902–7940 | GitHub Actions, lint→type-check→test→build |
| 127 | Host Module V2 | 7942–8040 | Reservations, waitlist, table assigner, notifications |
| 128 | Host services | 8042–8110 | Wait-time estimator, SMS providers, templates |
| 129 | Register tab sync | 8112–8170 | BroadcastChannel, SSE, version conflicts |
| 130 | Web apps registry | 8172–8210 | Settings page driven by shared constants |
| 131* | Batch line items | 8212–8260 | POST /orders/[id]/lines/batch, POS queue |
| 131* | Bank reconciliation | 8262–8310 | Start/clear/adjust/complete, auto-populate |
| 132* | Recurring journals | 8312–8350 | Templates, frequency, auto-generation |
| 132* | F&B course routing | 8352–8390 | Station resolver, idempotent tickets |
| 133 | Inline modifier panel | 8392–8430 | Smart instruction suppression |
| 134 | Server lock banner | 8432–8460 | PIN unlock, FnB design tokens |
| 135* | Embeddable widgets | 8462–8500 | Token URLs, themes, view tracking |
| 135* | Format utilities | 8502–8530 | getInitials, formatPhone |

### Advanced Conventions (§136–§214)

| § | Section | Lines | Key Topics |
|---|---------|-------|------------|
| 136 | Dark mode overhaul | 8532–8590 | 494 files, opacity-based colors |
| 137 | Admin DB helper | 8592–8620 | withAdminDb, RLS bypass cascade |
| 138 | Onboarding tests | 8622–8660 | 750-line test suite |
| 139 | Transaction type fix script | 8662–8700 | fix-transaction-type-mappings.ts |
| 140–145 | Dark mode enforcement | 8702–8830 | Banned classes, conversion table, exceptions |
| 146–150 | Vercel DB safety | 8832–8960 | CRITICAL: fire-and-forget prevention rules |
| 151 | Distributed locks | 8962–9010 | withDistributedLock, Supavisor-safe |
| 152 | Deploy script mutex | 9012–9050 | File-based .deploy.lock, PID liveness |
| 153–160 | Reporting conventions | 9052–9250 | Read models, consumers, business date |
| 161–170 | Vendor/receiving conventions | 9252–9440 | Name uniqueness, soft-delete, cost tracking |
| 171–175 | Modern ERP report UX | 9442–9580 | KPI cards, collapsible sections, print, CSV |
| 176–185 | GL query patterns | 9582–9780 | Balance direction, non-posted guard, control accounts |
| 186–195 | Event consumer conventions | 9782–9960 | Zod safeParse, payload enrichment |
| 196–200 | Frontend conventions | 9962–10120 | Chat sidebar, session history, query string |
| 201–203 | GL event→consumer matrix | 10122–10250 | Full wiring map, adapter checklist |
| 204 | Semantic conventions | 10252–10350 | Schema catalog, intelligence modules |
| 205 | Vercel Serverless DB Safety | 10352–10450 | 7 rules for fire-and-forget prevention |
| 206–210 | PMS conventions | 10452–10600 | State machines, calendar, pricing, channels |
| 211–214 | Admin/tag/spa conventions | 10602–10796 | Admin eval, tag lifecycle, spa adapters |

---

## Quick Section Lookup by Topic

| Topic | Sections |
|-------|----------|
| **Money (dollars vs cents)** | §21, §65–§66, §73–§74, §153 |
| **Dark mode** | §16, §136, §140–§145 |
| **GL / Accounting** | §65–§80, §104, §176–§185, §201–§203 |
| **POS** | §31–§38, §131 |
| **F&B** | §46–§48, §75, §98 (KDS), §127–§128, §132–§134 |
| **Vercel / Serverless** | §123, §146–§150, §205 |
| **Database / Schema** | §2, §118, §151 |
| **Auth / Security** | §13–§14, §116, §119–§122 |
| **Events / Consumers** | §8, §88, §186–§195 |
| **Testing** | §11–§12, §138 |
| **Reporting / Read Models** | §25, §39, §153–§160 |
| **Semantic / AI** | §51–§54, §105–§106, §204 |
| **PMS** | §44–§45, §206–§210 |
| **Spa** | §49–§50, §211–§214 |
| **Settings / Config** | §110–§115, §130 |
| **Inventory / Receiving** | §22, §26–§27, §161–§170 |
| **Customer / Tags** | §24, §57, §211 |
| **Admin Portal** | §55–§56, §137 |

---

## Notes

- **Duplicate section numbers**: §98, §131, §132, §135 each appear twice (legacy numbering). Use line ranges to disambiguate.
- **Line ranges are approximate** — sections may vary by ±20 lines. Use the section heading text for precise navigation.
- **Full document**: `docs/conventions/CONVENTIONS_FULL.md` (10,796 lines)
- **Full gotchas reference**: `docs/conventions/gotchas-reference.md` (490 numbered gotchas)
- **What's Built / What's Next**: `docs/conventions/whats-built.md` (1,502 lines)
