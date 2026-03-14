# OppsEra — Conventions Index

> **This is an index.** The full conventions document is at `docs/conventions/CONVENTIONS_FULL.md` (~12,811 lines, 261 numbered sections).
> Read only the sections you need by line range. Do NOT load the entire file into context.

---

## How to Use

1. Find the relevant section(s) below by topic or number
2. Read that section from `docs/conventions/CONVENTIONS_FULL.md` using the line range
3. Example: `Read file_path=docs/conventions/CONVENTIONS_FULL.md offset=313 limit=60` for §8 Commands

---

## Section Index

### Core Architecture (§1–§10)

| § | Section | Lines | Key Topics |
|---|---------|-------|------------|
| 1 | Monorepo Structure | 7–28 | pnpm, Turborepo, workspace layout |
| 2 | Database & Schema | 29–127 | Drizzle, postgres.js, table conventions, RLS, indexes |
| 3 | Auth & Request Context | 128–184 | Supabase Auth, JWT, RequestContext, DevAuthAdapter |
| 4 | API Routes | 185–248 | REST, JSON, camelCase, withMiddleware, response shapes |
| 5 | Error Handling | 249–267 | AppError, HTTP codes, error response format |
| 6 | Validation | 268–286 | Zod, runtime + TS inference |
| 7 | Singleton / Service Registry | 287–312 | Getter/setter pattern, module isolation |
| 8 | Commands (Write Operations) | 313–373 | publishWithOutbox, idempotency, optimistic locking |
| 9 | Event System | 374–434 | Outbox, naming, consumers, retry, dead letters |
| 10 | Audit Logging | 435–470 | Mandatory auditLog(), deferred work |

### Testing & Tooling (§11–§14)

| § | Section | Lines | Key Topics |
|---|---------|-------|------------|
| 11 | Testing | 471–626 | Vitest config, mocking, coverage, clearAllMocks vs mockReset |
| 12 | Exports & Imports | 627–657 | Barrel files, re-exports, import type |
| 13 | Permissions (RBAC) | 658–691 | 6 roles, permission strings, caching, location-scoped |
| 14 | Entitlements | 692–711 | Module gating, access modes |

### Frontend & TypeScript (§15–§20)

| § | Section | Lines | Key Topics |
|---|---------|-------|------------|
| 15 | Frontend (Next.js App Router) | 712–960 | Tailwind, shadcn, portals, code-split, dark mode, hooks |
| 16 | Naming Conventions | 961–979 | Files, variables, DB columns, events |
| 17 | Business Module Internal Structure | 980–1067 | Commands/, queries/, services/ layout |
| 18 | Location-Scoped Data | 1068–1084 | Multi-location filtering |
| 19 | Zod Schema Best Practices | 1085–1118 | `.input<>` vs `.infer<>`, `.default()` |
| 20 | Type Re-Export Scoping | 1119–1137 | `export type` doesn't create local bindings |

### Patterns & Conventions (§21–§30)

| § | Section | Lines | Key Topics |
|---|---------|-------|------------|
| 21 | Money Representation | 1138–1170 | Dollars vs cents, catalog/GL vs orders/payments |
| 22 | Idempotency Pattern | 1171–1220 | POS commands, clientRequestId, TOCTOU |
| 23 | Optimistic Locking | 1221–1279 | fetchOrderForMutation, incrementVersion |
| 24 | Receipt Snapshot | 1280–1325 | Frozen at placeOrder, immutable |
| 25 | Order Number Generation | 1326–1354 | Counters, sequence |
| 26 | Cross-Module Communication | 1355–1391 | Events, read APIs, never import modules |
| 27 | Business Date & Time Dimensions | 1392–1417 | Timezone, business date derivation |
| 28 | Fractional Quantities (F&B) | 1418–1447 | Decimal qty for F&B items |
| 29 | Catalog Schema Patterns | 1448–1548 | Items, categories, hierarchy, modifiers |
| 30 | Future Schema Warnings | 1549–1560 | Reserved columns, migration notes |

### POS & Payments (§31–§38)

| § | Section | Lines | Key Topics |
|---|---------|-------|------------|
| 31 | POS Frontend Architecture | 1561–1664 | Dual-mode, CSS-mounted, instant switching |
| 32 | POS Component Organization | 1665–1739 | Component tree, shared vs mode-specific |
| 33 | POS Hooks Pattern | 1740–1804 | usePOS, useCatalogForPOS, useShift |
| 34 | POS Frontend Types | 1805–1849 | typeGroup routing, barcode scanner |
| 35 | Tenders / Payments Architecture | 1850–1918 | Append-only, clientRequestId, GL allocation |
| 36 | SQL Injection Prevention | 1919–1962 | Parameterized queries, Drizzle sql template |
| 37 | Token Refresh & API Client | 1963–1985 | apiFetch, auth refresh |
| 38 | Environment & Credential Hygiene | 1986–2010 | .env, secrets, NEVER commit |

### Domain Modules — Core (§39–§64)

| § | Section | Lines | Key Topics |
|---|---------|-------|------------|
| 39 | Customers / Billing / AR | 2011–2097 | CRM, billing, house accounts, merge |
| 40 | Key Anti-Patterns to Avoid | 2098–2160 | Common mistakes, banned patterns |
| 41 | Inventory Architecture | 2161–2250 | Append-only movements, on-hand computation |
| 42 | Tenant Onboarding | 2251–2287 | Wizard, atomic provisioning |
| 43 | Current Project State | 2288–2573 | Module/feature inventory snapshot |
| 44 | Customer Profile Drawer | 2574–2681 | Drawer architecture, tabs |
| 45 | Module Independence | 2682–2728 | Microservice readiness, isolation |
| 46 | Mobile Responsiveness | 2729–2761 | 320px+, breakpoints |
| 47 | Connection Pooling & DB Config | 2762–2830 | max:2, prepare:false, Supavisor |
| 48 | Background Jobs | 2831–2936 | SKIP LOCKED, tenant fairness, lease/heartbeat |
| 49 | Scaling Strategy | 2937–3000 | Staged deployment, cost crossover |
| 50 | Observability | 3001–3148 | Sentry, pg_stat_statements, logging |
| 51 | Security | 3149–3228 | CSP, HSTS, rate limiting |
| 52 | Reporting / Read Model Architecture | 3229–3394 | Read models, consumers, CSV export |
| 53 | Receiving Module | 3395–3547 | Receipt lifecycle, shipping allocation |
| 54 | Vendor Management | 3548–3637 | Vendor CRUD, soft-delete |
| 55 | Purchase Orders (Schema Only) | 3638–3683 | PO schema, optimistic locking |
| 56 | Golf Reporting Module | 3684–3744 | Separate module, read models |
| 57 | Performance Optimization | 3745–3917 | Code-split, covering indexes, SWR |
| 58 | Catalog Item Change Log | 3918–3994 | Append-only, field-level diffs |
| 59 | Receiving Frontend | 3995–4058 | Receiving UI components |
| 60 | Unified Stock UI in Catalog | 4059–4124 | Inventory dialogs in catalog |
| 61 | POS Catalog Freshness | 4125–4154 | Cache invalidation |
| 62 | Dashboard Data Fetching | 4155–4182 | React Query, SWR patterns |
| 63 | Register Tab Customer Persistence | 4183–4206 | Tab state across refreshes |
| 64 | POS Tender placeOrder Race Recovery | 4207–4227 | 409 recovery, preemptive placeOrder |

### Semantic & AI (§65–§74)

| § | Section | Lines | Key Topics |
|---|---------|-------|------------|
| 65 | Semantic Layer Architecture | 4228–4259 | Dual-mode pipeline, SQL gen |
| 66 | LLM Integration Conventions | 4260–4292 | Prompt design, token budget |
| 67 | Semantic Security | 4293–4310 | PII masking, query validation |
| 68 | Chat UI (AI Insights) | 4311–4387 | Chat sidebar, session history |
| 69 | Observability (Semantic) | 4388–4403 | Latency tracking, error rates |
| 70 | Evaluation & Feedback | 4404–4425 | Training platform, examples |
| 71 | Semantic Lens | 4426–4447 | Narrative engine framework |
| 72 | Semantic Module Setup | 4448–4480 | Registry, config, dependencies |
| 73 | Admin App Architecture | 4481–4538 | RBAC, tenant mgmt, health scoring |
| 74 | THE OPPS ERA LENS — Narrative | 4539–4652 | Narrative framework (includes unnumbered Answer/Metrics subsections) |

### Accounting & GL (§75–§80)

| § | Section | Lines | Key Topics |
|---|---------|-------|------------|
| 75 | Room Layout Builder | 4653–4730 | Konva, 3-layer canvas, Zustand, templates |
| 76 | Accounting Core / GL | 4731–4935 | GL, COA, posting engine, financial statements |
| 77 | Accounts Payable (AP) | 4936–5044 | Bills, payments, FIFO allocation, aging |
| 78 | Accounts Receivable (AR) | 5045–5152 | Invoices, receipts, aging, customer ledger |
| 79 | Subledger Reconciliation | 5153–5179 | ReconciliationReadApi |
| 80 | Cross-Module Financial Posting | 5180–5235 | AccountingPostingApi, never import accounting |

### Infrastructure & Frontend Support (§81–§84)

| § | Section | Lines | Key Topics |
|---|---------|-------|------------|
| 81 | Auth Troubleshooting (Vercel) | 5236–5255 | Token refresh, cold start 401s |
| 82 | Frontend Query String Helper | 5256–5275 | URL params, search state |
| 83 | CI/CD Workflow | 5276–5303 | GitHub Actions, lint→type-check→test→build |
| 84 | Accounting Frontend Components | 5304–5319 | Component architecture |

### F&B & Operations (§85–§109)

| § | Section | Lines | Key Topics |
|---|---------|-------|------------|
| 85 | F&B POS Backend Module | 5320–5451 | 103 commands, 63 queries |
| 86 | F&B POS Frontend | 5452–5519 | Design tokens, CSS vars, Zustand |
| 87 | Profit Centers & Terminal Architecture | 5520–5632 | 9+ tables, hierarchy, session flow |
| 88 | Admin Tenant Management | 5633–5682 | Tenant CRUD, impersonation |
| 89 | Cross-Module Write APIs | 5683–5718 | Orchestration layer patterns |
| 90 | Entitlement Access Modes | 5719–5797 | off/view/full, dependency validation |
| 91 | Admin Portal RBAC | 5798–5840 | Platform admin roles |
| 92 | Admin User Management | 5841–5866 | User CRUD, role assignment |
| 93 | F&B POS Improvements | 5867–5904 | Iterative enhancements |
| 94 | Terminal Session Integration | 5905–5939 | 3-key localStorage, selection screen |
| 95 | User Management Tab | 5940–5959 | Settings UI |
| 96 | Order Metadata Support | 5960–5979 | JSONB metadata on orders |
| 97 | Seed Data Updates | 5980–5998 | Dev seed scripts |
| 98a | UXOPS Operations Architecture | 5999–6043 | Sessions UXOPS-01–14 |
| 99 | Drawer Sessions | 6044–6082 | Server-persisted shifts, cash control |
| 100 | Retail Close Batches | 6083–6111 | Start/lock/reconcile/post, Z-report |
| 101 | Card Settlement Workflow | 6112–6140 | CSV import, auto-match, GL posting |
| 102 | Tip Payout Workflow | 6141–6163 | Cash/payroll modes, balance tracking |
| 103 | Operations Dashboard & Tender Audit | 6164–6189 | Audit trail, dashboards |
| 104 | Event Dead Letter Queue | 6190–6208 | DB persistence, admin UI, retry |
| 105 | Audit Log Policy | 6209–6253 | Retention, query patterns |
| 106 | Cash Drawer Ownership (V1) | 6254–6267 | Strict mode |
| 107 | Offline Behavior Policy (V1) | 6268–6283 | Blocks tenders offline |
| 108 | Kitchen Waste Tracking (V1) | 6284–6298 | Boolean only |
| 109 | Multi-Currency Roadmap | 6299–6314 | Exchange rates, revaluation |
| 98b | ReconciliationReadApi | 6315–6386 | Cross-module read boundary for accounting |

### Systems & Configuration (§110–§135)

| § | Section | Lines | Key Topics |
|---|---------|-------|------------|
| 110 | Transaction Type Registry | 6387–6446 | 45 system types, dual-table, posting modes |
| 111 | Dashboard Reporting Fallback | 6447–6482 | Read model → operational table fallback |
| 112 | Onboarding System | 6483–6540 | 10 phases, auto-detection, Go Live checklist |
| 113 | F&B Floor & Menu Hook Caching | 6541–6588 | Snapshot cache, menu dedup |
| 114 | Intelligent AccountPicker | 6589–6621 | Suggestions engine |
| 115 | Guest Pay (QR Code) | 6622–6650 | QR code, member charge, lookup codes |
| 116 | Member Portal App | 6651–6678 | Standalone app, portal auth |
| 117 | GL Remap Workflow | 6679–6697 | Preview, batch remap |
| 118 | COA Governance | 6698–6711 | Merge, renumber, CSV import |
| 119 | Admin Impersonation | 6712–6730 | Safety guards |
| 120 | F&B Payment Tier 3 | 6731–6753 | Advanced payment features |
| 121 | Semantic Dual-Mode Pipeline | 6754–6824 | Fast path + full pipeline |
| 122 | PMS Module Architecture | 6825–6925 | Reservations, calendar, folios, state machines |
| 123 | AI Training & Evaluation | 6926–6979 | Training platform, batch review |
| 124 | Import System Architecture | 6980–7019 | CSV import, column mapping |
| 125 | Customer Tag Management | 7020–7124 | Smart tags, RFM, conflict resolution |
| 126 | Module Independence (PMS) | 7125–7180 | Cross-module event wiring |
| 127 | LLM Integration Best Practices | 7181–7245 | Prompt design, caching, streaming |
| — | Local Server Fix (Windows) | 7246–7275 | .next EPERM, node kill, restart |
| 128 | Payment Gateway Architecture | 7276–7344 | CardPointe, ACH, surcharges, provider registry |
| 129 | ERP Workflow Engine | 7345–7376 | Tier-based defaults, close orchestrator |
| 130 | Role Access Scoping | 7377–7413 | Location/PC/terminal junction tables |
| 131a | SuperAdmin Portal Conventions | 7414–7480 | Admin portal patterns |
| 132a | POS Resilience Patterns | 7481–7526 | Error recovery, retry |
| 133a | Modifier Group Architecture | 7527–7572 | Categories, channel visibility |
| 134a | Explicit Column Selects | 7573–7599 | Query optimization |
| 135a | CI/Build Lessons | 7600–7645 | Build pipeline fixes |
| 131b | Year Seed Script | 7646–7730 | seed-year.ts, additive-only |
| 132b | Portal Auth Scripts | 7731–7751 | Auth setup scripts |
| 133b | Tenant Business Info | 7752–7797 | Content blocks, tax masking |
| 134b | Profit Centers & Terminal Selection API | 7798–7879 | API consolidation |
| 135b | Merchant Services Settings | 7880–7924 | React Query hooks |

### Performance & UX (§136–§175)

| § | Section | Lines | Key Topics |
|---|---------|-------|------------|
| 136 | Settings Page Consolidation | 7925–7965 | 6-tab General layout, redirect |
| 137 | Impersonation Safety Guards | 7966–8000 | 6 assertion guards, action counting |
| 138 | In-Memory Caching for Hot Paths | 8001–8050 | Auth, location, permission cache |
| 139 | Combine SQL Round-Trips | 8051–8076 | Transaction batching |
| 140 | Place-and-Pay Single-Transaction | 8077–8108 | Fast path for simple orders |
| 141 | Fire-and-Forget Audit on POS Paths | 8109–8133 | Deferred audit logging |
| 142 | Terminal Session Confirm & Skip | 8134–8159 | Skip scoping |
| 143 | Parallel Data Fetching in Commands | 8160–8192 | Promise.all for reads |
| 144 | Bootstrap Partial-Run Recovery | 8193–8224 | Idempotent provisioning |
| 145 | Dark Mode: Opacity-Based Colors | 8225–8271 | Banned classes, conversion table |
| 146 | API Route Field Name Mapping | 8272–8301 | snake_case → camelCase |
| 147 | Admin Portal UI Patterns | 8302–8341 | Layout, navigation |
| 148 | F&B Host Stand Compact Layout | 8342–8360 | Touch-optimized layout |
| 149 | Accounting Settings 404 | 8361–8370 | Unconfigured tenant handling |
| 150 | Host Module V2 Patterns | 8371–8402 | Reservations, waitlist, table assigner |
| 151 | Circuit Breaker on `apiFetch` | 8403–8449 | Failure detection, fallback |
| 152 | API Route Consolidation | 8450–8490 | Dynamic `[action]` segments |
| 153 | Usage Analytics — Buffer-and-Flush | 8491–8531 | Tracker, workflow registry |
| 154 | Accessibility Infrastructure | 8532–8587 | Dialog a11y, focus trap, live region |
| 155 | Permission Groups Configuration | 8588–8620 | Group-based permissions |
| 156 | Feature Flags — Dual-Table | 8621–8654 | Definitions + tenant overrides |
| 157 | Cold Start Parallelization | 8655–8688 | Startup optimization |
| 158 | Cross-Tab Auth Token Coordination | 8689–8713 | BroadcastChannel |
| 159 | Event Bus Resilience | 8714–8737 | Consumer error isolation |
| 160 | Editable OPPS ERA LENS | 8738–8765 | Narrative template |
| 161 | DB Pool Tuning for Vercel | 8766–8791 | Serverless pool config |
| 162 | Cache Scaling with LRU Eviction | 8792–8846 | LRU, TTL, capacity |
| 163 | Supabase Auth — Combined Query | 8847–8884 | Membership lookup |
| 164 | POS Payment Race Elimination | 8885–8908 | Double-tap guard |
| 165 | Settings Lazy-Loading | 8909–8936 | Tab-level code-split |
| 166 | PMS Housekeeping Staff Mgmt | 8937–8956 | Cleaning types, workload queries |
| 167 | Lightweight Health Endpoint | 8957–8976 | /api/health |
| 168 | Frontend Permission Caching | 8977–9007 | Client-side cache |
| 169 | POS Batch Add-to-Cart | 9008–9051 | 50ms debounce, max 20 |
| 170 | Logout Deduplication | 9052–9086 | Prevent double signOut |
| 171 | Pure Algorithm Services (Host V2) | 9087–9123 | Wait-time estimator, table assigner |
| 172 | Member Portal Dark-Mode-Only | 9124–9153 | Portal design system |
| 173 | SMS Provider Abstraction | 9154–9186 | Provider registry, templates |
| 174 | WCAG 2.1 AA Accessibility | 9187–9232 | Standards compliance |
| 175 | Modern ERP Report UX Standard | 9233–9420 | KPI cards, collapsible, print, CSV |

### Advanced Patterns (§176–§200)

| § | Section | Lines | Key Topics |
|---|---------|-------|------------|
| §176 | KDS Settings Constants | 9421–9453 | Bump bar, alerts, performance targets |
| §177 | Discount GL Classification | 9454–9488 | 24 types, contra-revenue vs expense |
| §178 | PII Masking at LLM Boundary | 9489–9525 | Two-layer detection |
| §179 | Dual-Scoped Unique Indexes | 9526–9553 | System + tenant records |
| §180 | Admin Cross-Tenant Queries | 9554–9584 | withAdminDb, RLS bypass |
| §181 | KDS Routing — Priority Cascade | 9585–9607 | Item → category → department → fallback |
| §182 | Modifier Intelligence | 9608–9633 | Instruction suppression |
| §183 | Accounting Money Format | 9634–9665 | Formatting conventions |
| §184 | Service Charge Exemption | 9666–9682 | Exemption rules |
| §185 | GL Query Guard | 9683–9697 | Non-posted entry exclusion |
| §186 | Event Consumer Payload Validation | 9698–9736 | Zod safeParse, enrichment |
| §187 | Accounting Settings Auto-Ensure | 9737–9757 | Suspense account guarantee |
| §188 | GL Rounding Validation | 9758–9774 | Account type validation |
| §189 | Semantic Pipeline — Fast Path | 9775–9795 | Deterministic regex resolver |
| §190 | Semantic Pipeline — SSE Streaming | 9796–9820 | Streaming response |
| §191 | Anthropic Prompt Caching | 9821–9847 | SEM-02 |
| §192 | Semantic Intent Validation | 9848–9869 | Zod schema validation |
| §193 | RAG Few-Shot Dedup & Diversity | 9870–9883 | Deduplication |
| §194 | Semantic Plausibility Checker | 9884–9898 | SEM-09 |
| §195 | GL Close Checklist — Posting Gap | 9899–9918 | Detection of unposted events |
| §196 | POS Adapter — Mapping Fallback | 9919–9937 | Incomplete payment type handling |
| §197 | GL Memo-Only Self-Cancel Prevention | 9938–9951 | Zero-sum detection |
| §198 | Idempotency on Financial Commands | 9952–9971 | All financial commands |
| §199 | Tag Action Lifecycle | 9972–9985 | Smart tag triggers |
| §200 | LLM Adapter — Streaming | 9986–10004 | SSE support |

### Reference Patterns (§201–§231)

| § | Section | Lines | Key Topics |
|---|---------|-------|------------|
| §201 | GL Adapter Hardening (Canonical) | 10005–10121 | 15 adapters, canonical pattern, never throw |
| §202 | Event-to-GL Consumer Wiring Matrix | 10122–10182 | Full wiring map |
| §203 | GL Audit Checklist | 10183–10214 | New financial event checklist |
| §204 | Test Resilience Conventions | 10215–10261 | Flaky test prevention |
| §205 | Vercel Serverless DB Safety | 10262–10429 | 7 rules, fire-and-forget prevention |
| §206 | Pool Guard Infrastructure | 10430–10481 | Semaphore, circuit breaker, zombie tracking |
| §207 | Step-Up Authentication | 10482–10528 | HMAC-SHA256, category TTLs, PIN modal |
| §208 | Bot Detection & Replay Guards | 10529–10565 | Weighted scoring, nonce + timestamp |
| §209 | Receipt Engine Architecture | 10566–10612 | Builder pattern, renderers, tokenized links |
| §210 | Multi-Currency Engine | 10613–10643 | Exchange rates, functional amounts |
| §211 | Expense Management Lifecycle | 10644–10680 | Policies, approvals, GL posting |
| §212 | Project Costing | 10681–10715 | Tasks, cost allocation, profitability |
| §213 | Register Tab Sync | 10716–10752 | BroadcastChannel, SSE, version conflicts |
| §214 | PMS-POS Room Charge Integration | 10753–10798 | Room charge posting |
| §215 | F&B Host Orchestration | 10799–10934 | Server load, pacing, RevPASH, waitlist offers |
| §216 | Waitlist Config System | 10935–11051 | JSONB config, public APIs, cron sweep |
| §217 | Semantic Fast-Path + Schema Catalog | 11052–11103 | SWR-cached schema catalog |
| §218 | Admin Portal Operations | 11104–11192 | Health monitoring, audit, finance tools |
| §219 | Housekeeping Management | 11193–11221 | Cleaning types, workload queries |
| §220 | Retained Earnings + Journal Validation | 11222–11274 | FY close, rounding tolerance |
| §221 | Cross-Cutting Patterns | 11275–11355 | Read-model w/o outbox, deadlock-safe locking |
| §222 | KDS & Command Hardening | 11356–11400 | Serialized DB ops, nullable order_id |
| §223 | Middleware Reference | 11401–11476 | Full chain, options, error categories |
| §224 | Command Hardening Patterns | 11477–11541 | NaN guards, phase try/catch, bulk ops |
| §225 | Query Patterns Reference | 11542–11603 | Composite cursors, date filtering, CQRS |
| §226 | Cron & Distributed Lock | 11604–11674 | Lock mechanics, time budget, drain-outbox |
| §227 | F&B Realtime Architecture V2 | 11675–11720 | broadcastFnb, channel registry |
| §228 | React Frontend Patterns | 11721–11819 | Mode derivation, ref patterns, double-tap guard |
| §229 | Sentry & Observability | 11820–11856 | Init, PII scrubbing, error boundaries |
| §230 | Backup/Restore System | 11857–11902 | Direct connection, FK order, cursor export |
| §231 | Reporting Consumer Patterns | 11903–11948 | Cents→dollars, ON CONFLICT additive |

### Hardening Patterns (§232–§247) — Added 2026-03-05 through 2026-03-08

| § | Section | Lines | Key Topics |
|---|---------|-------|------------|
| §232 | Event Bus Inline Dispatch + Unclaim | 11949–11986 | Await dispatch, unclaim on failure, no fire-and-forget |
| §233 | Tenant ID Defense-in-Depth | 11987–12002 | tenantId in every UPDATE/DELETE WHERE |
| §234 | Hook Return Stabilization | 12003–12025 | useMemo on hook returns, useCallback for inline fns |
| §235 | KDS Polling Resilience | 12026–12079 | Generation counter, AbortController, transient suppression, visibility resume, stable poll ref |
| §236 | A11y Sweep Patterns | 12080–12124 | label/input association, backdrop suppress, touch a11y |
| §237 | Customer Profile Drawer V2 | 12125–12166 | Two-level nav, lazy tabs, focus trap, error boundary, legacy compat |
| §238 | GL Adapter Self-Canceling Guards | 12167–12189 | Same-account Dr/Cr abort, negative net guard, balance check |
| §239 | Tender Reversal: Mirror Original GL | 12190–12205 | Look up original entry, swap Dr/Cr per line |
| §240 | KDS Bump Two-Phase State Machine | 12206–12229 | ready→served, concurrent bump guard via WHERE |
| §241 | Advisory Locks for Aggregates | 12230–12242 | pg_advisory_xact_lock replaces invalid FOR UPDATE |
| §242 | RLS Migration Patterns | 12243–12273 | Idempotent policy creation, FORCE RLS, GUC key |
| §243 | KDS Category-Level Prep Times | 12274–12298 | XOR constraint, partial unique indexes, COALESCE |
| §244 | Compound Cursor Pagination | 12299–12321 | base64url cursor with sortVal+id, ILIKE escaping |
| §245 | Dialog State Reset on Re-open | 12322–12338 | useEffect([open]) to clear previous state |
| §246 | Emergency Cleanup Payment Verification | 12339–12356 | Verify SUM(tenders) >= total, location-scoped locks |
| §247 | Help Tip Pattern | 12357–12395 | Portal-mounted `?` popover, placement props, first-visit auto-open, 3-cycle pulse |

### Domain Patterns (§248–§261) — Updated 2026-03-14

| § | Section | Lines | Key Topics |
|---|---------|-------|------------|
| §248 | F&B Course Rule Hierarchy Resolver | 12396–12420 | 4-level scope resolution (item>category>sub_dept>dept), batch resolver, additive lockCourse |
| §249 | GL Posting Status Decoupling | 12421–12447 | pending/posted/failed lifecycle, best-effort updates, PermanentPostingError vs transient |
| §250 | GL Journal Source Idempotency Key | 12448–12481 | `{module}:{action}:{id}` format, 35+ adapters, partial unique index, DB-level dedup |
| §251 | Attrition Risk Score Pattern | 12482–12500 | INSERT-not-UPDATE history, 8 signal scores, compound cursor, platform-level (no RLS) |
| §252 | Settlement Tender Uniqueness | 12501–12516 | Partial unique index WHERE tender_id IS NOT NULL, defense-in-depth |
| §253 | KDS Operational Hardening | 12518–12590 | Terminal-session location, strict station identity, clear vs resolve, send/delete decoupling, multi-location KDS, customer board/recall/refire |
| §254 | Long-Running Accounting Recovery Flows | 12592–12622 | Smart resolve, GL backfill/remap/retry, reversal repost, serverless constraints, adapter error categorization, posting status lifecycle |
| §255 | Connection-Conserving Tiered Query Pattern | 12624–12641 | Tier 1 (required) + Tier 2 (enrichment) split, single withTenant for all enrichment, individual try/catch, warnOnce rate-limited logger |
| §256 | Pre-Transaction Routing with Atomic Commit | 12642–12659 | Pre-check → pre-transaction routing → atomic publishWithOutbox → post-transaction audit, no ghost sends/fires |
| §257 | Dispatch Attempt Tracking (Observability Table) | 12660–12679 | Purpose-built attempt log, failure_stage enum, JSONB diagnosis/errors, prior_attempt_id retry chains, partial failure index |
| §258 | Client-Side KDS Location Resolution and Structured Dispatch Errors | 12681–12728 | useKdsLocation priority chain, locationFellBack/locationDefaulted flags, LocationBanner, nav ?locationId, 422 kdsStatus body, non-throwing client dispatch errors |
| §259 | AI Support Module — Tiered RAG Architecture | 12729–12774 | Multi-tenant AI assistant, tiered evidence retrieval (T2–T7), streaming orchestrator, content guard sanitization, context snapshots |
| §260 | Shared Money Formatting Utilities | 12775–12797 | formatCents, formatCentsRaw, formatDollarsLocale, formatCentsLocale, formatDollarString, formatCompact |
| §261 | KDS Order Type Filtering Rules | 12798–12811 | allowed_order_types filter bypass for retail POS, F&B type requirements, migration 0318 backfill |

---

## Quick Section Lookup by Topic

| Topic | Sections |
|-------|----------|
| **Money (dollars vs cents)** | §21, §76, §183, §231, §260 |
| **Dark mode** | §15, §145, §172 |
| **GL / Accounting** | §76–§80, §84, §114, §117–§118, §149, §177, §183, §185, §187–§188, §195–§197, §201–§203, §220, §238–§239, §249–§250, §254 |
| **POS** | §31–§35, §57, §61–§64, §132a, §140–§141, §164, §169, §196, §228 |
| **F&B** | §28, §85–§86, §93, §98a, §99–§103, §108, §113, §120, §148, §150, §176, §181–§182, §215–§216, §222, §227, §240, §243, §246, §248 |
| **Vercel / Serverless** | §47, §81, §157, §161, §205–§206, §232, §255 |
| **Database / Schema** | §2, §18, §29–§30, §36, §47, §139, §179, §225, §241–§244 |
| **Auth / Security** | §3, §13–§14, §38, §51, §67, §81, §119, §137, §207–§208, §223, §233, §242 |
| **Events / Consumers** | §9, §26, §104, §159, §186, §202, §231, §232 |
| **Testing** | §11, §204 |
| **Reporting / Read Models** | §52, §56, §111, §153, §175, §231 |
| **Semantic / AI** | §65–§72, §74, §121, §123, §127, §160, §178, §189–§194, §200, §217, §259 |
| **PMS** | §122, §126, §166, §214, §219 |
| **Settings / Config** | §90, §95, §110, §112, §115–§116, §130, §134b, §135b, §136, §142, §149, §155–§156, §165 |
| **Inventory / Receiving** | §41, §53–§55, §58–§60 |
| **Customer / Tags** | §39, §44, §125, §199, §237 |
| **Admin Portal** | §73, §88, §91–§92, §119, §131a, §147, §180, §218, §229–§230, §251 |
| **Onboarding** | §42, §112, §144 |
| **Payments / Tenders** | §35, §64, §96, §101–§102, §128, §140, §198, §239, §252 |
| **Infrastructure / Cron** | §47–§49, §83, §157, §161–§162, §167, §206, §226, §254 |
| **Frontend Patterns** | §15, §57, §228, §234–§237, §245, §247, §258 |
| **A11y / Accessibility** | §154, §174, §236 |
| **KDS** | §176, §181, §222, §235, §240, §243, §253, §255–§258, §261 |

---

## Notes

- **Duplicate section numbers**: §98, §131–§135 each appear twice in the file (legacy numbering). Disambiguated as `a`/`b` suffixes above.
- **Unnumbered sections**: "Local Server Fix (Windows)" at line 7246 (between §127 and §128), and "Answer"/"Metrics in This Query" subsections within §74 at lines 4571–4652.
- **Full document**: `docs/conventions/CONVENTIONS_FULL.md` (~12,811 lines, 261 numbered sections)
- **Full gotchas reference**: `docs/conventions/gotchas-reference.md` (570 numbered gotchas)
- **What's Built / What's Next**: `docs/conventions/whats-built.md`

## Line Range Accuracy

Line ranges in this index are pinned to the last convention update (**2026-03-14**). They are only valid when CONVENTIONS_FULL.md has **not been edited** since that date.

**If line ranges are stale** (e.g., you read a section and the heading doesn't match):
1. Search by heading instead: `grep -n "^## §248" docs/conventions/CONVENTIONS_FULL.md`
2. Use the section number + title from this index — those are stable even when line numbers shift

**To rebuild this index** (run during deploy Step 3):
```bash
grep -n "^## " docs/conventions/CONVENTIONS_FULL.md
wc -l docs/conventions/CONVENTIONS_FULL.md
```
Then update: (a) line ranges in every table row, (b) line count in the header and Notes section, (c) the pinned date above.
