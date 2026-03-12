# CLAUDE MASTER SESSION PLAN — Build **OppsEra Rental Operations** Module

You are acting as a **Principal ERP Product Architect + Staff Full-Stack Engineer + Rental Operations Systems Designer + Principal Data Modeler**.

Your job is to design and implement a **production-grade, ERP-native, multi-tenant Equipment Rental / Rental Operations module** for **OppsEra**.

This module must be able to support many rental verticals using **one unified horizontal rental engine** with configurable rules and vertical presets.

It must support businesses renting:
- canoes
- kayaks
- golf clubs
- bikes and scooters
- AV and camera equipment
- tools and construction equipment
- trailers
- small vehicles / utility carts
- boats / watercraft
- sports and activity gear
- clothing / fashion items
- technology / IT equipment
- baby / childcare rentals
- furniture / storage inventory
- health / medical equipment
- and future rental categories not yet defined

The correct approach is **not** to build separate modules for each category.
The correct approach is to build **one core Rental Operations module** with:
- shared domain primitives
- shared availability engine
- shared reservation / order / return workflows
- shared pricing / deposits / accounting integration
- shared inspection / maintenance concepts
- configurable business rules
- configurable vertical presets

---

# PRODUCT CONTEXT

OppsEra is an ERP platform.
This rental module must integrate tightly with existing and future ERP domains such as:
- catalog / item master
- customer / CRM
- inventory
- pricing
- accounting / GL / AR
- payments
- POS
- documents / e-sign
- maintenance / service
- reporting / semantic layer
- workflow / automation / notification systems

This is **not** a standalone booking widget.
This is a full rental operations engine that must work across walk-in, counter, web, mobile, routed-delivery, and contract-driven rental businesses.

---

# COMPETITIVE DESIGN INPUTS

Use modern rental software patterns seen in products such as:
- **Booqable** — strong in online bookings, inventory tracking, real-time availability, quotes/contracts/invoices, barcodes/QR, bundles, POS, payments, website booking, and multi-location controls
- **Quipli** — strong in equipment rental operations, dispatch, scheduling, maintenance, payments, and field/logistics workflows
- **EZRentOut** — strong in order lifecycle tracking, customer portal patterns, availability visibility, maintenance/work orders, multi-location operations, and utilization tracking
- **Point of Rental** — strong in enterprise rental operations, CRM, dispatch, e-commerce, contracts, inventory control, and advanced operational workflows

Do **not** clone any one competitor.
Instead, synthesize the strongest patterns into an **ERP-native OppsEra module**.

---

# REQUIRED ARCHITECTURAL STANDARDS

You must follow the existing OppsEra standards from `CLAUDE.md`, `CONVENTIONS.md`, and the established platform architecture.

Assume the following unless explicitly contradicted by project files:
- Next.js 15 App Router
- React 19
- TypeScript strict
- Drizzle ORM (NOT Prisma)
- DB driver: `postgres` (postgres.js, NOT `pg`)
- Postgres 16 with RLS
- Supabase Auth (V1), JWT-based
- Supavisor connection pooler — `prepare: false` REQUIRED
- modular monolith architecture
- domain ownership by module
- event-driven integration using transactional outbox pattern
- ULID IDs everywhere
- tenant-scoped data everywhere (`tenant_id` on every table)
- strong auditability via `auditLog()` on every write
- optimistic locking via `fetchForMutation()` → mutate → `incrementVersion()`
- deterministic APIs and services
- no unsafe cross-tenant assumptions
- no direct cross-module schema leakage — modules depend on shared/db/core ONLY, never another module
- Zod for all runtime validation + TypeScript type inference

Follow existing project conventions for:
- file structure
- API design — `withMiddleware(handler, { entitlement, permission })` pattern
- auth — Supabase Auth, middleware chain: authenticate → resolveTenant → resolveLocation → requireEntitlement → requirePermission → handler
- validation — Zod schemas co-located with routes
- RLS — app-level filtering + `withTenant()` wrapper + Postgres RLS policies
- query patterns — `withTenant(tenantId, tx => { ...cursor pagination, limit+1 for hasMore })`
- write services — `publishWithOutbox(ctx, tx => { checkIdempotency → insert → buildEvent → saveIdempotencyKey })` then `auditLog()`
- event publication — `{domain}.{entity}.{action}.v{N}`, transactional outbox, idempotent consumers, 3x retry
- UI conventions — Tailwind v4, lucide-react icons, dark mode DEFAULT
- action naming — REST, JSON, camelCase keys
- type naming — TypeScript strict, no `any` unless suppressed with eslint-disable comment
- migration naming — `{0000}_{snake_case}.sql`, zero-padded idx matching `_journal.json`
- API shapes — List `{ data, meta: { cursor, hasMore } }`, Single `{ data }`, Error `{ error: { code, message } }`
- Frontend hooks — `useFetch<T>(url)` → `{ data, isLoading, error, mutate }`, `useMutation<I,R>(fn)`

If current project conventions differ from assumptions above, adapt to the real project conventions without lowering architectural quality.

---

# OPPSERA-SPECIFIC TECHNICAL MANDATES

These are non-negotiable platform constraints. Violating any of these will cause production failures.

## Money Rules
- **Catalog / GL / AP / AR** = dollars (NUMERIC string)
- **Orders / Payments / Rental charges** = cents (INTEGER number)
- Catalog→Orders conversion: `Math.round(parseFloat(price) * 100)`
- Display conversion: `(cents / 100).toFixed(2)`
- Drizzle `numeric` returns strings — always convert with `Number()`
- All rental order math MUST be integer-only (cents). No floating point.

## Database / Connection Gotchas
- **NEVER fire-and-forget DB ops on Vercel** — unawaited DB Promises = zombie connections = pool exhaustion. Always `await`.
- **NEVER use `setInterval` on Vercel** — creates permanent DB zombies. Hold expiry, cleanup jobs, and polling MUST use cron-based approach (drain-outbox pattern or Vercel cron).
- **`prepare: false` REQUIRED** for postgres.js + Supavisor transaction mode pooler.
- **Pool `max: 2`** on Vercel — total conns = instances × max.
- **postgres.js returns RowList** — use `Array.from(result as Iterable<T>)`, never `.rows`.
- **GL adapters NEVER throw** — business ops (rental checkout, return, damage charge) must always succeed even if GL posting fails.

## Dark Mode UI Mandate
Dark mode is the DEFAULT and ONLY mode. The following are **BANNED**:
- `bg-white`, `text-gray-900`, `border-gray-200`
- `dark:` prefixes
- Any hardcoded light-mode colors

Use semantic tokens: `bg-surface`, `text-foreground`, `text-muted-foreground`, `border-border`, `bg-accent`, etc.

## Module Boundary Enforcement
- Rental Operations module lives at `packages/modules/rental-ops/`
- It may depend on: `@oppsera/shared`, `@oppsera/db`, `@oppsera/core`
- It must NEVER import from another module package directly
- Cross-module communication: events (outbox) or read APIs only
- Catalog items, customers, payments, accounting, inventory are referenced by ID — never by direct import

## Migration Safety
- Read `packages/db/migrations/meta/_journal.json` for highest `idx` before creating any migration
- Update `_journal.json` in the same commit as the `.sql` file
- `when` timestamps MUST use `Date.now()` — production watermark is ~1772292944406. Synthetic/backdated timestamps get silently skipped by Drizzle.
- NEVER edit a migration file after it has been applied — Drizzle tracks by content hash.
- Use `IF NOT EXISTS` / `IF EXISTS` for idempotent DDL
- Verify with `node scripts/check-migrations.cjs` after creating migrations

## Existing Modules to Integrate With (Not Import From)
The following modules already exist and must be integrated via events or read APIs:
- `catalog` — item master, categories, pricing (dollars/strings)
- `customers` — CRM, customer master, contacts
- `inventory` — location stock, transfers
- `payments` — payment processing, deposits, refunds
- `orders` — order lifecycle, line items (cents/integers)
- `accounting` — GL, AR, journal entries
- `ap` — accounts payable (vendor repairs, maintenance costs)
- `spa` — has appointment/reservation patterns to reference as prior art
- `pms` — has reservation/calendar/list patterns to reference as prior art
- `semantic` — reporting/analytics layer
- `kds` — has event-driven state machine patterns to reference

## Existing UI Patterns to Reuse
- **SPA Reservations** — Quick Reserve / Calendar / List tab pattern (just built). Rental Operations should follow the same 3-tab submodule pattern for its reservation views.
- **PMS Calendar** — Drag-and-drop grid, day/week views, condensed view. Reference for calendar/availability board.
- **PMS ReservationListView** — DataTable with status filters, date range, search, cursor pagination. Reference for rental order list.
- **SPA Appointment Detail** — Status timeline, action buttons, service lines. Reference for rental order detail.
- **DataTable** component at `@/components/ui/data-table` — standard filterable table pattern
- **ActionMenu** component at `@/components/ui/action-menu` — row-level action dropdowns
- **EmptyState** component at `@/components/ui/empty-state` — empty list states

## Hold Expiry Strategy (Vercel-Safe)
Rental holds MUST NOT use `setInterval` or `setTimeout` for expiry. Instead:
- Store `expires_at` timestamp on the hold row
- Availability queries filter out expired holds at read time: `WHERE expires_at > NOW() OR status != 'held'`
- A Vercel cron job (or drain-outbox consumer) runs periodically to clean up expired holds and release inventory
- This is the same pattern used for the outbox drain — battle-tested on this platform

## Concurrency Strategy for Availability
- Use **Postgres advisory locks** (`pg_advisory_xact_lock`) keyed on `(tenant_id, product_id)` or `(tenant_id, asset_id)` during reservation confirmation
- This prevents double-booking without table-level locks
- Advisory locks are already used in the KDS module for bump state machines — proven pattern
- For pooled inventory: `SELECT ... FOR UPDATE` on the inventory count row within the transaction
- For serialized assets: advisory lock on asset_id during assignment

---

# CORE PRODUCT THESIS

Build **OppsEra Rental Operations** as a **single horizontal rental engine** with configurable vertical policy packs.

That means:
- the same engine should work for serialized gear, quantity-based inventory, bundles, add-ons, services, and routed fulfillment
- a kayak rental shop and a camera rental shop should use the same core engine
- a tool rental company and a golf rental counter should share the same reservation / checkout / return / billing backbone
- vertical behavior should come from configuration, rule sets, inspection templates, pricing rules, and preset workflows

The engine must support both:
1. **simple, fast rental counter workflows**
2. **complex, enterprise-grade rental operations**

---

# HIGH-LEVEL MODULE GOALS

OppsEra Rental Operations must allow a business to:

1. define rentable products
2. define rentable serialized assets and pooled inventory
3. define kits / bundles / packages
4. expose availability internally and externally
5. create inquiries, quotes, reservations, contracts, and rental orders
6. collect deposits, pre-auths, and payments
7. perform pickup, staging, delivery, dispatch, checkout, and return workflows
8. track condition, inspections, damage, loss, and maintenance
9. issue invoices, credits, and damage charges
10. synchronize operational and financial events into ERP reporting and accounting

---

# CRITICAL IMPLEMENTATION PRINCIPLES

## 1. Availability must be deterministic
This module fails if availability is wrong.
The design must prevent double-booking and race conditions.

## 2. Asset identity must be first-class
The system must handle both:
- exact serialized asset assignment
- pooled quantity-based availability

## 3. Accounting integrity matters
Deposits, waivers, rental charges, late fees, damage charges, and refunds must post cleanly into ERP accounting.

## 4. Returns are not trivial
Partial returns, damaged returns, missing components, inspection holds, and maintenance quarantine must be supported.

## 5. Multi-location cannot be an afterthought
Many rental businesses need cross-location transfers, dispatch, route handling, or branch-level stock control.

## 6. Configuration beats vertical fragmentation
The module must scale across industries through rules, templates, presets, and policies — not by hardcoding industry-specific logic everywhere.

---

# DELIVERABLE EXPECTATION FOR THIS MASTER PLAN

This session plan must drive Claude through a **full production-grade design and implementation sequence**.

For each session, Claude must:
- analyze current project context first
- inspect existing conventions and adjacent modules
- produce concrete deliverables
- avoid breaking existing architecture
- keep all work additive, deterministic, and enterprise-ready

Each session should end with:
- what was completed
- risks / open questions
- what to validate manually
- what the next session should build on

---

# TARGET MODULE NAME

**Rental Operations**

This is broader and better than “equipment rentals,” because it supports:
- equipment
- assets
- kits
- accessories
- protection plans
- services
- delivery / pickup
- long-term rental agreements
- future hybrid sale + rental workflows

---

# CORE DOMAIN SCOPE

The module must cover the following domains:

## A. Rental Product Master
Defines what is rentable.

## B. Rental Asset Master
Defines specific serialized units where applicable.

## C. Bundle / Kit Management
Supports fixed kits and dynamic kits.

## D. Availability Engine
Determines what is available, where, when, and under what constraints.

## E. Quote / Reservation / Contract / Order Lifecycle
Manages the commercial and operational lifecycle.

## F. Fulfillment / Checkout / Dispatch / Return
Manages the physical handoff and return lifecycle.

## G. Inspection / Condition / Damage / Maintenance
Tracks asset health and operational readiness.

## H. Pricing / Deposits / Billing
Drives the financial model.

## I. Customer Portal / E-Commerce Hooks
Allows self-serve digital booking and account access.

## J. ERP Integration Layer
Synchronizes accounting, customer, inventory, CRM, and reporting concerns.

---

# UNIVERSAL RENTAL PATTERNS THE MODULE MUST SUPPORT

The engine must support these inventory modes:

## 1. Serialized Rentals
Examples:
- canoe #102
- specific camera body serial SN-4451
- golf set #14
- trailer VIN-linked unit

## 2. Pooled Quantity Rentals
Examples:
- 40 folding chairs
- 12 life jackets
- 20 helmets
- 8 projectors by model pool

## 3. Bundles / Kits
Examples:
- DSLR kit = body + lens + battery + bag
- kayak package = kayak + paddle + life jacket
- golf rental = club set + bag + rangefinder
- AV event kit = speakers + cables + stands + mixer

## 4. Asset + Service Packages
Examples:
- kayak rental + shuttle service
- AV rental + setup labor
- construction rental + delivery + pickup
- camera rental + training / on-site support

## 5. Long-Term Rental / Contract Rental
Examples:
- medical equipment monthly rental
- long-term trailer rental
- baby gear rental for extended stays

## 6. Counter / Walk-In Rental
Examples:
- golf pro shop rental
- bike rental counter
- marina kiosk rental

## 7. Routed Fulfillment Rental
Examples:
- event equipment delivery
- tools / construction site drop-off
- furniture delivery and pickup

---

# CORE FUNCTIONAL SPECIFICATION

## 1. Rental Product Master
Each rental product must support:
- id
- tenant_id
- sku / item code
- display name
- internal name
- category
- subcategory
- rental_type (`serialized`, `pooled`, `bundle`, `service`, `consumable`, `hybrid`)
- description
- long description
- media / image set
- tags
- specs / attributes (JSON or normalized strategy per platform conventions)
- make / model / brand
- tax class
- accounting class
- pricing class
- damage waiver eligibility
- default deposit rule
- min rental duration
- max rental duration
- default pickup buffer
- default return turnaround buffer
- lead time requirements
- age restriction policy ref
- document requirement policy ref
- insurance requirement policy ref
- operator / license requirement policy ref
- maintenance class
- allowed locations
- delivery eligible flag
- web-visible flag
- active flag

## 2. Rental Asset Master
For serialized assets:
- id
- tenant_id
- rental_product_id
- asset_code
- serial_number
- barcode / QR / RFID identifier
- ownership status
- acquisition date
- acquisition cost
- current_location_id
- home_location_id
- current_status
- current_condition_grade
- meter_type (`hours`, `miles`, `km`, `cycles`, `none`)
- current_meter_value
- warranty / registration metadata if relevant
- insurance metadata if relevant
- maintenance_plan_id
- service_due_at
- inspection_due_at
- retirement candidate flag
- notes
- photo set
- active flag

## 3. Bundle / Kit Definition
Support:
- fixed bundle definitions
- optional accessories
- required components
- dynamic compatible substitutions
- quantity rules per component
- pricing behavior (`included`, `optional`, `override`, `discounted`)
- availability strategy for bundle reservation

## 4. Availability Engine
Availability must evaluate:
- location
- product or exact asset
- requested start date/time
- requested end date/time
- prep buffers
- turnaround buffers
- existing reservations / holds / confirmed orders
- maintenance holds
- inspection holds
- transfer holds
- quarantine / damage lockouts
- bundle component availability
- same-day / cutoff policies
- override permissions

## 5. Quote / Reservation / Contract / Order Lifecycle
Must support at least:
- inquiry
- quote
- draft reservation
- held reservation
- confirmed reservation
- contract signed / pending
- ready for fulfillment
- checked out / delivered
- partial return
- returned pending inspection
- closed
- canceled
- no-show

## 6. Fulfillment Lifecycle
Must support:
- pick / stage workflows
- asset assignment
- pre-release inspection
- document verification
- pickup handoff
- delivery manifest
- driver proof-of-delivery
- return intake
- partial return intake
- post-return inspection
- damage assessment
- quarantine or maintenance routing

## 7. Inspection / Damage / Maintenance
Must support:
- pre-checkout inspections
- return inspections
- checklist templates by product class
- photo capture
- damage notes
- customer responsibility attribution
- maintenance work orders
- meter-based maintenance
- date-based maintenance
- parts / labor tracking hooks
- vendor repair hooks
- asset downtime reasons

## 8. Pricing / Billing
Must support:
- hourly pricing
- daily pricing
- weekly pricing
- monthly pricing
- duration discounts
- quantity discounts
- contract pricing
- seasonal / event pricing
- location pricing
- bundle pricing
- deposit rules
- damage waiver fees
- delivery / pickup charges
- labor / setup fees
- cleaning fees
- fuel / consumable charges
- late fees
- meter / usage overage charges
- replacement fees
- refund rules
- manual override with audit log

## 9. Customer / Account Layer
Must support:
- B2C and B2B customers
- contacts and roles
- rental history
- saved documents
- saved licenses / insurance / certifications
- pricing tier
- credit limit / account terms
- risk / blacklist flags
- notes and interactions
- marketing consent / communication preferences

## 10. Customer Portal / Web Hooks
Must support:
- browse rental catalog
- check availability
- build quote / booking request
- reserve and pay online
- upload documents
- sign documents
- view orders and invoices
- request extension
- request return / pickup
- rebook favorites
- portal messaging / notifications

## 11. ERP Integration Requirements
Must integrate with:
- catalog
- CRM / customer master
- inventory and locations
- accounting / GL / AR
- taxes
- payments
- POS
- documents / e-sign
- service / maintenance
- reporting / semantic layer

---

# MAJOR ENGINEERING RISK AREAS

Claude must treat these as high-risk design areas and solve them carefully:

1. **double-booking prevention** — advisory locks on asset/product during confirmation, not optimistic retry
2. **availability race conditions under concurrent checkout** — `pg_advisory_xact_lock` keyed on `(tenant_id, asset_id)` or `(tenant_id, product_id)` within a single transaction
3. **bundle component conflicts** — bundle reservation must atomically reserve ALL components or fail entirely (no partial bundle holds)
4. **cross-location availability correctness** — availability queries must scope to `location_id`, transfers must create transit holds at both origin and destination
5. **partial returns** — line-level return tracking, not order-level. Each `rental_order_line` tracks its own return status independently
6. **late fee calculation accuracy** — integer math only (cents), never floating point. Late fee = `rateCentsPerDay * overdueDays`. No rounding drift.
7. **deposit accounting integrity** — deposits are AR liabilities until applied. Deposit collection, application, and refund must each emit separate GL events. GL adapters never throw.
8. **contract status vs operational status drift** — contract status and order status are separate fields. A contract can be `signed` while the order is still `draft`. State machine must enforce valid transitions independently.
9. **asset quarantine and maintenance blocking logic** — quarantined/maintenance assets must be excluded from availability calculations at the query level, not just at checkout validation
10. **long-term extension colliding with future reservations** — extension approval must check downstream availability the same way initial reservation does (full availability engine check, not just date comparison)
11. **pooled inventory shortages** — `SELECT ... FOR UPDATE` on pool count during reservation. Availability check + decrement must be atomic.
12. **exact serialized assignment vs deferred assignment behavior** — deferred assignment means the product is reserved but no specific asset is locked. Assignment happens at checkout/staging. The availability engine must count "assigned" and "product-reserved-but-unassigned" separately.
13. **Vercel connection exhaustion** — every DB call must be `await`ed. No fire-and-forget. Pool max: 2. Complex transactions must be kept short.
14. **money representation drift** — rental rate cards store dollars (NUMERIC/string). Order lines store cents (INTEGER). The conversion boundary must be explicit and tested.
15. **hold expiry without setInterval** — holds expire via read-time filtering + periodic cron cleanup. No timers.
16. **tenant data leakage** — every query must go through `withTenant()`. RLS is defense-in-depth, not primary. Test with multi-tenant seed data.

---

# REQUIRED DOMAIN ENTITIES

Claude must design the final data model around a set like the following, adapted to platform conventions.

**Every table MUST include:** `id` (ULID), `tenant_id`, optional `location_id`, `created_at`, `updated_at`.
**Write-contended tables MUST include:** `version` (integer, for optimistic locking).
**Money columns:** rate cards / catalog = `numeric` (dollars, stored as string). Order lines / charges = `integer` (cents).

Core tables:
- `rental_products` — what is rentable (links to catalog item by reference ID, not FK)
- `rental_product_variants` (optional if needed)
- `rental_assets` — serialized units with barcode/serial/condition tracking
- `rental_bundles` — kit/package definitions
- `rental_bundle_components` — components within a bundle (quantity, required/optional, pricing behavior)
- `rental_rate_cards` — pricing tiers (hourly/daily/weekly/monthly rates in dollars/numeric)
- `rental_rate_rules` — duration discounts, seasonal overrides, location-specific pricing
- `rental_quotes` — commercial quotes before reservation
- `rental_quote_lines` — line items on quotes (price in cents)
- `rental_reservations` — confirmed bookings with availability holds
- `rental_reservation_lines` — line-level detail per reservation
- `rental_holds` — temporary availability locks with `expires_at` timestamp
- `rental_contracts` — legal/waiver documents linked to reservations
- `rental_orders` — operational orders (created from confirmed reservations). **All money in cents.**
- `rental_order_lines` — line items on orders (price_cents, qty, etc.)
- `rental_asset_assignments` — which specific asset is assigned to which order line
- `rental_fulfillments` — checkout/pickup/delivery events
- `rental_dispatch_runs` (later phase if needed)
- `rental_returns` — return intake events
- `rental_return_lines` — per-line return status (supports partial returns)
- `rental_inspections` — inspection events linked to returns or maintenance
- `rental_inspection_results` — checklist results per inspection
- `rental_damage_reports` — damage findings with photos, responsibility attribution
- `rental_maintenance_plans` — preventive maintenance schedules
- `rental_work_orders` — maintenance/repair work orders
- `rental_location_policies` — per-location configuration overrides
- `rental_document_requirements` — required documents by product class
- `rental_customer_policies` — customer-tier pricing, credit limits, blacklist flags
- `rental_usage_meter_readings` — hour/mile/cycle readings per asset
- `rental_extensions` — extension requests and approvals
- `rental_vertical_presets` — industry preset configurations (kayak shop, camera rental, etc.)

**Not stored in rental module tables (referenced by ID only):**
- Customers — owned by `customers` module
- Catalog items — owned by `catalog` module
- Payment records — owned by `payments` module
- GL journal entries — owned by `accounting` module
- Inventory locations — owned by `inventory` module

If project conventions call for different naming or modular table ownership strategies, adapt while preserving the same functional coverage.

---

# REQUIRED STATUS MODELS

## Asset Status
At minimum support:
- `available`
- `reserved`
- `staged`
- `checked_out`
- `in_transit`
- `returned_pending_inspection`
- `in_cleaning`
- `in_maintenance`
- `quarantined`
- `lost`
- `retired`

## Reservation / Order Status
At minimum support:
- `inquiry`
- `quote`
- `draft`
- `held`
- `confirmed`
- `ready`
- `out`
- `partially_returned`
- `returned`
- `inspected`
- `closed`
- `canceled`
- `no_show`

## Inspection Result Status
At minimum support:
- `pass`
- `pass_with_notes`
- `damage_found`
- `unsafe`
- `missing_components`

---

# SESSION-BY-SESSION BUILD PLAN

---

## SESSION 1 — Discovery, Gap Analysis, and Module Boundary Definition

### Objective
Understand the current OppsEra codebase and define exactly where Rental Operations lives.

### Claude Instructions
1. Inspect the current codebase structure and identify:
   - existing modules in `packages/modules/` (currently 23 modules — see CLAUDE.md)
   - item / catalog structures in `packages/modules/catalog/`
   - customer / CRM structures in `packages/modules/customers/`
   - inventory structures in `packages/modules/inventory/`
   - accounting integration patterns in `packages/modules/accounting/` — especially GL adapter pattern (adapters NEVER throw)
   - document patterns (if any exist)
   - payment patterns in `packages/modules/payments/`
   - event / outbox patterns in `packages/core/src/events/` — `publishWithOutbox`, transactional outbox
   - existing UI route conventions in `apps/web/src/app/(dashboard)/`
   - auth / permission patterns in `packages/core/src/auth/` — `withMiddleware`, RBAC (6 roles: Owner, Manager, Supervisor, Cashier, Server, Staff)
   - RLS patterns in existing migrations
   - SPA reservation/calendar patterns (recently refactored to Quick Reserve / Calendar / List tabs) — **use as direct prior art**
   - PMS reservation patterns (Quick Reserve / Calendar / List tabs, drag-and-drop grid) — **use as direct prior art**
   - KDS event-driven state machine pattern — **use as prior art for rental order state machine**
2. Determine how Rental Operations should fit into the modular monolith:
   - Module package: `packages/modules/rental-ops/`
   - Schema in: `packages/db/src/schema/rental-ops.ts`
   - Web routes: `apps/web/src/app/(dashboard)/rentals/`
   - API routes: `apps/web/src/app/api/v1/rentals/`
   - Navigation: new top-level nav entry in `apps/web/src/lib/navigation.ts`
3. Identify reusable existing capabilities vs what must be built new.
4. Produce a **Module Boundary Decision Document**.

### Deliverables
- Rental Operations module boundary
- dependency map showing which existing modules are referenced (by ID/event, never import)
- reused modules / services list
- risks and assumptions
- proposed folder structure matching OppsEra conventions
- initial entity map
- explicit anti-patterns to avoid (cross-module imports, fire-and-forget DB ops, setInterval, money type confusion)

### Output format
- Current-state findings
- Module boundary recommendation
- Dependency strategy
- Folder / file structure proposal
- Risks / unknowns
- Recommended next session

---

## SESSION 2 — Domain Model and Ubiquitous Language

### Objective
Establish the domain model and core vocabulary.

### Claude Instructions
Define the core domain concepts and relationships for:
- product
- asset
- pooled inventory
- bundle
- quote
- reservation
- hold
- contract
- rental order
- assignment
- fulfillment
- return
- inspection
- damage
- maintenance
- extension
- pricing rule
- document requirement

Clarify distinctions such as:
- product vs asset
- quote vs reservation vs order
- hold vs confirmed booking
- checkout vs fulfillment
- return vs inspection close
- damage charge vs deposit hold vs waiver

### Deliverables
- ubiquitous language glossary
- aggregate / entity / value-object proposal
- lifecycle diagrams
- invariants / business rules
- conflict-prone concepts called out clearly

### Output format
- Glossary
- Domain entities and relationships
- Lifecycle descriptions
- Invariants
- Recommended next session

---

## SESSION 3 — Relational Data Model and Migration Plan

### Objective
Design the production-grade relational schema.

### Claude Instructions
Design the schema for V1 with:
- tables — every table gets `id` (ULID text PK), `tenant_id` (text NOT NULL), `created_at` (timestamptz DEFAULT now()), `updated_at` (timestamptz DEFAULT now())
- optional `location_id` (text) on tables that are location-scoped
- primary keys — ULID text, not serial/UUID
- foreign keys where appropriate — but cross-module references are ID-only (no FK to catalog, customers, payments, etc.)
- indexes — composite indexes on `(tenant_id, ...)` for all query patterns. GIN indexes on JSONB columns if used.
- unique constraints — e.g., `(tenant_id, asset_code)`, `(tenant_id, reservation_number)`
- optimistic locking — `version integer NOT NULL DEFAULT 1` on write-contended tables (orders, reservations, assets)
- audit columns — `created_by`, `updated_by` where needed
- tenant scoping — `tenant_id` on every table, RLS policies added
- NO soft deletes — OppsEra uses status fields (e.g., `status = 'canceled'`), not `deleted_at`
- JSON vs normalized — prefer normalized. Use JSONB only for truly dynamic data (inspection checklist results, custom attributes/specs)
- **Money columns**: rate cards = `numeric(12,2)` (dollars, Drizzle returns as string). Order/charge lines = `integer` (cents).

Special attention:
- availability correctness — indexes on `(tenant_id, product_id, start_date, end_date, status)` for reservation overlap queries
- high-read operational queries — compound indexes for dashboard queries (e.g., overdue returns: `(tenant_id, status, expected_return_at)`)
- assignment history — `rental_asset_assignments` tracks full history, not just current assignment
- return and inspection history — immutable records, never overwritten
- rate rule flexibility — JSONB for rule conditions, normalized for rate values
- hold expiry — `expires_at` column on `rental_holds`, indexed for cron cleanup queries

### Migration Safety
- Read `packages/db/migrations/meta/_journal.json` for current highest `idx` BEFORE designing migration sequence
- Plan migrations in dependency order (products → assets → bundles → rate cards → reservations → orders → etc.)
- Each migration uses `IF NOT EXISTS` / `IF EXISTS` for idempotent DDL
- `when` timestamps use `Date.now()` — NEVER synthetic/backdated
- Verify with `node scripts/check-migrations.cjs` after creation

### Deliverables
- ERD-level written schema design
- table-by-table field definitions with exact Drizzle column types
- index plan (composite indexes for all major query patterns)
- migration sequencing plan with dependency order
- seed data / preset strategy (vertical presets for kayak, camera, tools, etc.)

### Output format
- Schema overview
- Table definitions with column types and constraints
- Index and constraint strategy
- Migration sequence with `_journal.json` idx planning
- Validation notes
- Recommended next session

---

## SESSION 4 — Availability Engine Design

### Objective
Design the deterministic availability engine. This is the hardest and most critical component.

### Claude Instructions
Design how the system decides availability for:
- serialized assets — exact asset booking vs deferred assignment
- pooled quantity inventory — count-based availability with atomic decrement
- bundles — all-or-nothing component availability (bundle fails if ANY component unavailable)
- products with prep / turnaround time — buffer windows that block availability
- assets under maintenance or quarantine — excluded from availability at query level
- multi-location inventory — location-scoped queries, no cross-location bleed
- deferred assignment vs exact asset booking — product-level reservation that doesn't lock a specific asset until staging/checkout

You must explicitly design:
- **hold mechanics** — `rental_holds` table with `expires_at`, created during booking flow, converted to reservation on confirmation
- **expiration mechanics** — NO setInterval. Expired holds filtered at read time (`WHERE expires_at > NOW()`). Cron job cleans up stale rows periodically.
- **concurrency strategy** — `pg_advisory_xact_lock(tenant_id_hash, product_id_hash)` during reservation confirmation. This prevents double-booking without table-level locks. Already proven in KDS module.
- **pooled inventory concurrency** — `SELECT pool_available FROM rental_product_pools WHERE ... FOR UPDATE` within the transaction, decrement atomically
- **conflict detection** — overlapping date range query: `WHERE product_id = $1 AND status IN ('held','confirmed','out') AND start_date < $end AND end_date > $start`
- **query patterns** — availability search must be fast (indexed). Use `EXPLAIN ANALYZE` guidance for the composite index design.
- **derived availability** — compute availability from reservations + holds + maintenance + assignments at query time. No separate "available count" that can drift.
- **override permissions** — `rental.availability.override` permission for overbooking. Audit logged.
- **extension conflict handling** — extension = availability check for the delta period using the same engine. If conflict, deny or queue for manager approval.

### Vercel-Specific Constraints
- Advisory lock transactions must be SHORT — acquire lock, check availability, create reservation, release. No long-running transactions.
- All DB calls `await`ed. No fire-and-forget.
- Pool max: 2. Complex availability checks with multiple queries should use a single transaction, not multiple round-trips.

### Deliverables
- availability engine design with exact query patterns
- state transition rules for holds → reservations → orders
- reservation hold algorithm with expiry strategy
- concurrency and race condition prevention strategy (advisory locks + FOR UPDATE)
- recommended service interfaces / APIs following `withTenant()` and `publishWithOutbox()` patterns

### Output format
- Availability architecture
- Reservation / hold rules
- Conflict detection strategy with SQL query sketches
- Concurrency strategy with advisory lock design
- Hold expiry cron design
- Open risks
- Recommended next session

---

## SESSION 5 — Pricing, Deposits, and Billing Engine Design

### Objective
Design pricing and financial behavior. **Money representation is critical — get this wrong and everything downstream breaks.**

### Claude Instructions

#### Money Rules (Non-Negotiable)
- **Rate cards** store prices in **dollars** as `numeric(12,2)` — Drizzle returns these as **strings**
- **Order lines, charges, deposits, fees** store amounts in **cents** as **integers**
- Conversion boundary: `Math.round(parseFloat(rateDollars) * 100)` when creating order lines from rate cards
- Display conversion: `(cents / 100).toFixed(2)` or `(cents / 100).toLocaleString(...)`
- All math on order/charge amounts is **integer-only**. No floating point anywhere in billing.
- Late fee example: `rateCentsPerDay * overdueDays` (integer × integer = integer)

Design a pricing model supporting:
- hourly / daily / weekly / monthly (rate card tiers, stored in dollars/numeric)
- stepped duration pricing (e.g., first 4 hours = $X, full day = $Y, 3+ days = $Z/day)
- seasonal pricing (date-range overrides on rate cards)
- weekend / peak pricing (day-of-week multipliers)
- location-specific pricing (rate card per location)
- customer-tier pricing (discount rules by customer policy)
- contract pricing (negotiated rates stored per contract)
- bundle pricing (`included`, `optional`, `override`, `discounted` per component)
- add-ons and fees (damage waivers, cleaning fees, fuel charges — all in cents on order)
- labor and logistics fees (delivery, pickup, setup — cents)
- deposits (pre-auth or collected amount — cents, tracked as AR liability)
- waivers (damage waiver fee — cents, optional per product class)
- late fees (cents per day/hour, calculated from `expected_return_at` vs actual)
- damage charges (cents, from inspection → damage report → charge)
- meter overages (cents per unit over allowance)
- manual price override with audit (`auditLog()` on every override, requires `rental.pricing.override` permission)

Also define accounting event implications for:
- deposit collection — GL event: debit Cash, credit Deposit Liability. **GL adapter NEVER throws.**
- deposit release — GL event: debit Deposit Liability, credit Revenue or Refund
- invoice issuance — GL event: debit AR, credit Revenue
- payment capture — GL event: debit Cash, credit AR
- refunds — GL event: debit Refund Expense, credit Cash
- damage charges — GL event: debit AR, credit Damage Recovery Revenue
- late fees — GL event: debit AR, credit Late Fee Revenue
- revenue categorization — by rental product class / accounting class

### Deliverables
- pricing engine spec with explicit dollars→cents conversion boundaries
- rate card model (dollars/numeric in DB, string in TypeScript)
- fee model (cents/integer in DB, number in TypeScript)
- deposit / waiver model with AR liability tracking
- billing event model with GL event definitions
- ERP accounting integration notes (GL adapter pattern — never throws)

### Output format
- Pricing model with money type annotations on every field
- Data model updates
- Billing lifecycle
- Accounting mapping notes with GL event definitions
- Risks / assumptions
- Recommended next session

---

## SESSION 6 — Quote, Reservation, Contract, and Order Workflow Design

### Objective
Unify commercial and operational lifecycle design.

### Claude Instructions
Define the lifecycle from:
- inquiry
- quote
- hold
- reservation
- contract / waiver
- payment / deposit
- operational order
- fulfillment readiness
- closeout

Explicitly decide:
- whether quote and reservation are separate aggregates
- when order is created
- when contract is required
- when assignment is allowed
- what can still be edited after confirmation
- approval / override cases

### Deliverables
- workflow design
- state machine diagrams
- service boundaries
- edit / mutation rules by status
- audit requirements

### Output format
- Lifecycle model
- State changes
- Mutability rules
- Audit / event requirements
- Recommended next session

---

## SESSION 7 — Checkout, Pickup, Delivery, Dispatch, and Return Workflows

### Objective
Design physical operations workflows.

### Claude Instructions
Design workflows for:
- counter pickup
- staged pickup
- same-day walk-in rental
- scheduled delivery
- route-based fulfillment
- return intake
- partial return
- wrong-location return
- missing item return
- damaged return

Decide how the system records:
- signatures
- photos
- meter readings
- checklists
- proof of delivery
- failed delivery attempts
- exceptions and overrides

#### POS Integration for Counter Rentals
Counter/walk-in rentals need a "Send to POS" flow for payment collection. Study existing SPA patterns:
- `CheckoutToPosDialog` — sends line items to POS terminal for payment
- `SpaPayNowDialog` — direct payment capture without POS terminal
The rental module needs equivalent flows: build a rental order → send to POS for payment → on payment confirmation, update rental order status to `paid`. Design both POS-terminal and direct-pay paths.

### Deliverables
- operational workflow spec
- field / mobile workflow recommendations
- status update model
- dispatch-ready future hooks
- return exception handling spec
- POS integration design for counter rentals

### Output format
- Workflow maps
- Required states / data capture
- Exception handling
- UI needs
- Recommended next session

---

## SESSION 8 — Inspection, Condition, Damage, and Maintenance Design

### Objective
Design operational asset health workflows.

### Claude Instructions
Design the system for:
- pre-checkout inspections
- post-return inspections
- product-class inspection templates
- damage reports
- maintenance work orders
- preventive maintenance
- meter-based service scheduling
- quarantine states
- asset readiness rules

Define what is required vs optional for V1.

### Deliverables
- inspection model
- condition taxonomy
- damage report model
- maintenance model
- quarantine / readiness rules

### Output format
- Inspection design
- Damage design
- Maintenance design
- V1 vs later-phase split
- Recommended next session

---

## SESSION 9 — ERP Integration Design

### Objective
Define how Rental Operations integrates with the rest of OppsEra.

### Claude Instructions
Design integration touchpoints with:
- catalog / item master
- CRM / customer master
- inventory
- payments
- accounting / GL / AR
- POS
- document / file storage
- notifications
- reporting / semantic layer

Decide what Rental Operations owns directly vs references externally.

#### Customer Sync Strategy
Walk-in rental customers must sync to the `customers` module. Study `packages/core/src/sync/pms-customer-sync.ts` as prior art. Emit `rental.customer.created.v1`, upsert via customers module API, store `customer_id` back on rental record. Match by email/phone to avoid duplicates.

#### Notification Design
Emit domain events for: reservation confirmation, pickup reminder (24h), overdue return alert, extension decision, damage charge, hold expiry warning. Let a notification consumer handle delivery — do NOT build delivery into the rental module.

### Deliverables
- integration contract map
- event map
- ownership boundaries
- accounting posting triggers
- semantic / reporting event needs
- customer sync strategy (modeled on PMS pattern in `pms-customer-sync.ts`)
- notification event catalog with trigger conditions

### Output format
- Integration matrix
- Event list
- Ownership decisions
- Customer sync design
- Notification event catalog
- Risks / dependencies
- Recommended next session

---

## SESSION 10 — Roles, Permissions, Auditability, and RLS

### Objective
Design secure operational access using OppsEra's existing RBAC system.

### Claude Instructions
OppsEra uses 6 fixed roles: **Owner (`*`), Manager, Supervisor, Cashier, Server, Staff**. Permissions follow the pattern `module.action` or `module.*`.

Map rental operations capabilities to these existing roles:
- **Owner** — `rental.*` (full access)
- **Manager** — `rental.products.manage`, `rental.assets.manage`, `rental.orders.manage`, `rental.pricing.override`, `rental.availability.override`, `rental.damage.charge`, `rental.refunds.approve`
- **Supervisor** — `rental.orders.manage`, `rental.checkout.perform`, `rental.returns.perform`, `rental.inspections.perform`, `rental.damage.report`
- **Cashier** — `rental.orders.view`, `rental.checkout.perform`, `rental.returns.perform`, `rental.availability.view`
- **Server** — `rental.orders.view`, `rental.availability.view`
- **Staff** — `rental.availability.view`

Permission naming convention: `rental.{entity}.{action}`. Examples:
- `rental.products.view`, `rental.products.manage`
- `rental.assets.view`, `rental.assets.manage`
- `rental.orders.view`, `rental.orders.manage`, `rental.orders.cancel`
- `rental.checkout.perform`, `rental.returns.perform`
- `rental.inspections.perform`, `rental.damage.report`, `rental.damage.charge`
- `rental.pricing.view`, `rental.pricing.override`
- `rental.availability.view`, `rental.availability.override`
- `rental.refunds.approve`, `rental.writeoffs.approve`
- `rental.reports.view`

Design:
- RLS approach — app-level `withTenant()` + Postgres RLS policies on all rental tables. Defense-in-depth.
- tenant scoping — `tenant_id` on every table, every query. No exceptions.
- location scoping — `location_id` filtering where applicable. Manager can see all locations, Cashier sees only their assigned location.
- sensitive action approvals — pricing override, overbooking override, damage charge, refund, write-off all require specific permissions + `auditLog()` entry
- audit logs — `auditLog()` on every write operation using existing `@oppsera/core` audit system
- financial override permissions — `rental.pricing.override` for manual price changes, `rental.refunds.approve` for refunds over threshold
- damage / refund / write-off permissions — separate permissions per action, not bundled

### Deliverables
- permission list following `rental.{entity}.{action}` convention
- role-to-permission mapping using existing 6 OppsEra roles
- RLS strategy (app-level + Postgres policies)
- audit event strategy using existing `auditLog()` pattern
- admin override strategy with permission + audit requirements

### Output format
- Permissions list
- Role mapping table
- RLS migration SQL
- Audit design
- Recommended next session

---

## SESSION 11 — API Design (Read + Write Services)

### Objective
Design the module API layer.

### Claude Instructions
Design APIs / service actions for:
- product and asset setup
- availability search
- quote creation
- reservation holds
- reservation confirmation
- contract generation / signature state updates
- checkout / delivery / return
- inspection / damage
- maintenance actions
- pricing preview
- extension requests
- customer portal actions

Follow existing OppsEra conventions.

#### Idempotency Key Strategy
Define explicit idempotency keys for each write operation to prevent duplicate processing:
- **Create hold**: `(tenantId, customerId, productId, startDate)` — prevents duplicate holds for the same customer/product/date
- **Confirm reservation**: `(tenantId, holdId)` — hold can only be confirmed once
- **Create order**: `(tenantId, reservationId)` — reservation can only produce one order
- **Checkout**: `(tenantId, orderId, assetId)` — asset can only be checked out once per order
- **Return**: `(tenantId, assignmentId)` — assignment can only be returned once
- **Create inspection**: `(tenantId, returnId, assetId)` — one inspection per asset per return
- **Damage charge**: `(tenantId, inspectionId, damageLineIdx)` — one charge per damage finding
- **Extension**: `(tenantId, orderId, extensionRequestId)` — one extension per request

Each key is passed to `checkIdempotency()` at the start of the command and saved via `saveIdempotencyKey()` at the end.

### Deliverables
- endpoint / action map
- request / response schema guidance
- validation rules
- idempotency key definitions per operation
- optimistic locking needs

### Output format
- API map
- Validation rules
- Idempotency key table (operation → key components)
- Error handling guidance
- Recommended next session

---

## SESSION 12 — UI / UX Information Architecture and Screen Inventory

### Objective
Design the frontend information architecture following existing OppsEra patterns.

### Claude Instructions

#### Navigation Structure
Add a top-level nav entry in `apps/web/src/lib/navigation.ts`:
```
Rental Operations → /rentals
  moduleKey: 'rental'
  collapsibleGroups: true
  children:
    Operations:
      Dashboard     → /rentals
      Reservations  → /rentals/calendar  (Quick Reserve | Calendar | List tabs — same pattern as SPA/PMS)
      Checkout      → /rentals/checkout
      Returns       → /rentals/returns
    Catalog:
      Products      → /rentals/products
      Assets        → /rentals/assets
      Bundles       → /rentals/bundles
      Rate Cards    → /rentals/rate-cards
    Maintenance:
      Inspections   → /rentals/inspections
      Work Orders   → /rentals/work-orders
    Reports & Config:
      Reports       → /rentals/reports
      Settings      → /rentals/settings
```

#### Route Structure
All routes under `apps/web/src/app/(dashboard)/rentals/`:
- `/rentals` — dashboard (summary cards, upcoming pickups, overdue returns, utilization)
- `/rentals/calendar` — Reservations hub with Quick Reserve / Calendar / List tabs (mirror SPA pattern)
- `/rentals/checkout` — checkout/pickup workflow
- `/rentals/returns` — return intake workflow
- `/rentals/products` — product catalog admin (DataTable + detail pages)
- `/rentals/products/[id]` — product detail
- `/rentals/assets` — asset inventory admin (DataTable + detail pages)
- `/rentals/assets/[id]` — asset detail with activity timeline
- `/rentals/bundles` — bundle/kit builder
- `/rentals/rate-cards` — pricing admin
- `/rentals/inspections` — inspection queue
- `/rentals/work-orders` — maintenance queue
- `/rentals/reports` — operational reports
- `/rentals/settings` — module configuration, vertical presets, policies
- `/rentals/orders/[id]` — order detail with status timeline, lines, payments, inspections

API routes under `apps/web/src/app/api/v1/rentals/`:
- All use `withMiddleware(handler, { entitlement: 'rental', permission: 'rental.xxx.xxx' })`

#### UI Component Patterns to Reuse
- **DataTable** — `@/components/ui/data-table` for all list views
- **ActionMenu** — `@/components/ui/action-menu` for row actions
- **EmptyState** — `@/components/ui/empty-state` for empty lists
- **SearchInput** — `@/components/ui/search-input` for text search
- **Select** — `@/components/ui/select` for filter dropdowns
- **PageSkeleton** — `@/components/ui/page-skeleton` for loading states
- **Quick Reserve / Calendar / List** tab pattern — mirror exactly from SPA Reservations
- **Status badges** — colored pill badges by status (same pattern as SPA/PMS)
- **Context menus** — right-click actions on calendar blocks (same as SPA calendar)

#### Availability Search UX
The availability search is the primary customer-facing and operator-facing interaction. Design it as **product-first, then date**:
1. Operator/customer selects a **location** (dropdown, defaults to current)
2. Selects a **date range** (start date + end date pickers, or duration selector)
3. System shows **all products available** for that range at that location — with available quantity, thumbnail, and price
4. Optional: text search/filter by product name or category within results
5. Clicking a product shows detail with exact available assets (if serialized) or available count (if pooled)

This is NOT a calendar-first view (that's the Reservations tab). This is a search/shop flow — think "show me what I can rent June 15-18 at the Marina." The Quick Reserve tab should embed this search inline.

#### Dark Mode Mandate
All UI uses semantic Tailwind tokens only: `bg-surface`, `text-foreground`, `text-muted-foreground`, `border-border`, `bg-accent`, `bg-indigo-600` for primary actions. NO `bg-white`, `text-gray-900`, `dark:` prefixes.

Focus on making this feel ERP-native, fast, and operator-friendly.

### Deliverables
- screen inventory with exact route paths
- navigation config structure
- page hierarchy
- primary actions by screen
- critical tables / cards / timelines / forms
- component reuse map (which existing components to use)

### Output format
- IA overview
- Screen list with routes
- Navigation config
- Key workflows by screen
- Component reuse map
- UI priorities for V1
- Recommended next session

---

## SESSION 13 — V1 Build Order and Milestone Breakdown

### Objective
Turn the design into an implementation plan.

### Claude Instructions
Create a milestone plan that is realistic and low-risk.
Each milestone should include:
- objective
- files / schema / services / UI involved
- dependencies
- test considerations
- rollout notes

### Deliverables
- milestone sequence
- dependency-aware build order
- what can ship in V1 vs V1.1
- high-risk milestone callouts

### Output format
- Milestones 0-N
- per-milestone deliverables
- sequencing rationale
- recommended next session

---

## SESSION 14 — Database Migrations and Initial Scaffolding

### Objective
Begin implementation. First real code lands.

### Claude Instructions
Generate initial production-grade scaffolding for:
- Drizzle schema file: `packages/db/src/schema/rental-ops.ts` — all tables with correct column types, ULID PKs, tenant_id, timestamps, version columns
- Migration files: `packages/db/migrations/0NNN_rental_ops_*.sql` — read `_journal.json` for current highest idx first. Use `IF NOT EXISTS`. `when` = `Date.now()`.
- Update `_journal.json` with new migration entries
- Core types: `packages/modules/rental-ops/src/types/` — Zod schemas + inferred TypeScript types
- Module folder structure:
  ```
  packages/modules/rental-ops/
    src/
      commands/    — write operations (publishWithOutbox pattern)
      queries/     — read operations (withTenant pattern)
      events/      — event definitions ({domain}.{entity}.{action}.v{N})
      types/       — Zod schemas + TS types
      helpers/     — pure domain logic (pricing math, availability checks)
    package.json   — deps on @oppsera/shared, @oppsera/db, @oppsera/core ONLY
  ```
- Event definitions: `rental.reservation.created.v1`, `rental.order.checked_out.v1`, `rental.return.completed.v1`, etc.
- Enums: asset status, reservation status, order status, inspection result — as TypeScript union types + Zod enums
- Seed preset scaffolding for vertical presets (kayak shop, camera rental, tool rental, etc.)

#### Seed Data Strategy
Create realistic seed data for testing the availability engine, pricing engine, and multi-location scenarios:
- **2 tenants** — one kayak/outdoor rental shop, one AV/camera equipment rental
- **2 locations per tenant** — different addresses, different product mixes
- **Mix of serialized + pooled products** — kayaks (serialized with individual asset codes), life jackets (pooled quantity), cameras (serialized), tripods (pooled)
- **Overlapping reservations** — at least 3 reservations that overlap in date ranges to test conflict detection
- **Active holds** — 2 held (one near expiry), 1 expired (for cleanup testing)
- **Rate cards** — hourly, daily, weekly tiers per product. At least one seasonal override.
- **At least 1 bundle** — "kayak adventure package" = kayak + paddle + life jacket
- **1 asset in maintenance** — to verify availability exclusion
- **1 checked-out order with overdue return** — `expected_return_at` in the past
- Seed script location: `packages/db/src/seeds/rental-ops-seed.ts` (additive-only, run after `pnpm db:seed`)

### Critical Checks Before Writing Migrations
1. `cat packages/db/migrations/meta/_journal.json | tail -5` — get current highest idx
2. Plan migration idx numbers sequentially from there
3. Use `Date.now()` for `when` timestamps
4. After creating, run `node scripts/check-migrations.cjs` to verify

### Deliverables
- concrete code / migration output
- file tree matching OppsEra conventions
- implementation notes
- any TODO markers for next sessions

### Output format
- exact files created / modified with paths
- code blocks
- migration order with idx numbers
- `_journal.json` entries
- manual validation checklist (including `pnpm type-check` and `node scripts/check-migrations.cjs`)
- recommended next session

---

## SESSION 15 — Product / Asset / Bundle Admin Build

### Objective
Implement core admin setup workflows.

### Claude Instructions
Build:
- rental products admin
- rental assets admin
- bundle / package management
- base policy fields
- barcode / QR identifiers
- location assignment support

### Deliverables
- schema refinements if needed
- write services
- read views
- admin UI
- validation rules

### Output format
- files created / changed
- code
- test checklist
- recommended next session

---

## SESSION 16 — Availability Search + Reservation Hold Implementation

### Objective
Implement the hardest core engine first. Get this right or everything else fails.

### Claude Instructions
Build:
- **Availability search service** — `packages/modules/rental-ops/src/queries/check-availability.ts`
  - Input: `{ tenantId, locationId, productId?, startDate, endDate, quantity? }`
  - Output: `{ available: boolean, availableQuantity: number, assets?: Asset[], conflicts?: Conflict[] }`
  - Query pattern: `withTenant(tenantId, tx => { ... })` with composite index-backed overlap query
  - Must exclude: active reservations, holds (non-expired), maintenance, quarantine, transit
  - Must respect: turnaround buffers, prep time, cutoff policies
- **Hold creation service** — `packages/modules/rental-ops/src/commands/create-hold.ts`
  - Pattern: `publishWithOutbox(ctx, tx => { checkIdempotency → checkAvailability → createHold → buildEvent → saveIdempotencyKey })`
  - `expires_at` = `Date.now() + holdDurationMs` (configurable per tenant, default 15 min)
  - Event: `rental.hold.created.v1`
  - Must use `pg_advisory_xact_lock` on product_id to prevent race conditions
- **Hold expiry cleanup** — NOT setInterval. Two-pronged:
  1. Read-time filtering: availability queries add `AND (holds.expires_at > NOW() OR holds.status != 'held')`
  2. Cron cleanup: API route or drain-outbox consumer that runs `UPDATE rental_holds SET status = 'expired' WHERE expires_at < NOW() AND status = 'held'`
- **Reservation confirmation service** — converts hold → reservation with advisory lock
  - Pattern: `publishWithOutbox(ctx, tx => { acquireAdvisoryLock → verifyHoldNotExpired → checkAvailabilityAgain → createReservation → expireHold → buildEvent })`
  - Event: `rental.reservation.confirmed.v1`
- **Availability search API route** — `apps/web/src/app/api/v1/rentals/availability/route.ts`
  - `withMiddleware(handler, { entitlement: 'rental', permission: 'rental.availability.view' })`
- **Initial calendar / availability UI** — follow SPA Reservations pattern (Quick Reserve / Calendar / List tabs)
  - Route: `apps/web/src/app/(dashboard)/rentals/calendar/`
  - Quick Reserve = condensed availability grid
  - Calendar = timeline/grid view of reservations
  - List = DataTable of reservations with filters

### Vercel Safety
- Every DB call `await`ed
- Advisory lock transactions kept as short as possible
- No fire-and-forget
- Pool max: 2 — single transaction for check + create

### Deliverables
- availability engine implementation with advisory lock concurrency
- hold logic with expiry (read-time filter + cron cleanup)
- reservation confirmation with double-check
- API routes with middleware
- UI for searching availability (3-tab pattern)
- audit and logging notes

### Output format
- files created / changed
- code with exact file paths
- concurrency notes (advisory lock key design)
- manual test plan (concurrent booking test, hold expiry test, bundle availability test)
- recommended next session

---

## SESSION 17 — Quote / Reservation / Contract / Order UI and Services

### Objective
Implement commercial lifecycle.

### Claude Instructions
Build:
- quote creation and editing
- reservation confirmation
- contract packet linkage
- status timeline
- order detail page
- core state transitions

### Deliverables
- services
- UI screens
- validation
- event publication
- audit trail

### Output format
- files created / changed
- code
- test checklist
- recommended next session

---

## SESSION 18 — Checkout / Return / Inspection Implementation

### Objective
Implement operational execution workflows.

### Claude Instructions
Build:
- pickup / checkout actions
- scanning support hooks
- return intake actions
- partial return support
- inspection workflow
- damage capture
- condition updates
- asset state updates

#### Barcode/QR Scanning Workflow
Checkout and return screens need a scan-to-lookup flow:
- **Checkout**: scan asset barcode → find asset → verify it's assigned to this order (or auto-assign if deferred) → confirm checkout. If asset not found or already checked out, show error inline.
- **Return**: scan asset barcode → find active assignment → pull up the order → confirm return + trigger inspection. Support scanning multiple assets in sequence for multi-item returns.
- Use a text input with `autoFocus` that receives scanner input (scanners emit keystrokes). No camera-based scanning for V1.
- Fallback: manual asset code entry for damaged/unreadable barcodes.

#### POS Payment Flow
Counter rentals need "Send to POS" integration (same pattern as SPA's `CheckoutToPosDialog`):
- Build rental order with line items (in cents) → send to POS terminal → on payment event, mark order as `paid`
- Also support direct payment capture (`RentalPayNowDialog`) for locations without POS terminals

### Deliverables
- operational services
- UI flows
- damage / inspection model usage
- audit events
- barcode scan-to-lookup implementation for checkout and return
- POS payment integration (Send to POS + direct pay)

### Output format
- files created / changed
- code
- exception case checklist
- recommended next session

---

## SESSION 19 — Pricing / Billing / Deposit Integration Implementation

### Objective
Implement finance-critical behavior.

### Claude Instructions
Build:
- rate card application
- deposit calculations
- waiver fees
- late fee calculation hooks
- invoiceable charge generation
- accounting event emission
- refund / release hooks

### Deliverables
- pricing services
- charge engine
- accounting integration events
- admin pricing UI where in scope

### Output format
- files created / changed
- code
- finance validation checklist
- recommended next session

---

## SESSION 20 — Customer Portal / Online Booking Foundations

### Objective
Implement self-serve booking foundations.

### Claude Instructions
Build foundational portal features for:
- catalog browsing
- availability search
- booking request / reservation initiation
- document upload hooks
- payment / deposit handoff hooks
- order history view
- extension request entrypoint

### Deliverables
- portal routes / screens
- portal-safe APIs
- customer auth assumptions
- permission boundaries

### Output format
- files created / changed
- code
- validation notes
- recommended next session

---

## SESSION 21 — Reporting, Audit, and Operational Dashboards

### Objective
Add operational visibility.

### Claude Instructions
Design and build first-pass reporting for:
- utilization
- upcoming pickups
- overdue returns
- damage incidents
- maintenance queue
- revenue by category / location
- asset status mix
- hold / conversion funnel

### Deliverables
- read APIs
- reporting views
- semantic layer notes
- dashboard UI

### Output format
- files created / changed
- code
- metrics definitions
- recommended next session

---

## SESSION 22 — Hardening Pass

### Objective
Review for correctness, safety, and maintainability against OppsEra production standards.

### Claude Instructions
Perform a hardening pass across the module and explicitly review:

#### Concurrency & Data Integrity
- race conditions in availability checks — verify advisory locks on all reservation/hold paths
- broken state transitions — verify state machine rejects invalid transitions
- optimistic locking gaps — verify `version` column checked on all write-contended tables
- missing `checkIdempotency` calls on any write command
- unawaited DB operations — search for any `db.` call without `await` (lethal on Vercel)
- any `setInterval` or `setTimeout` usage (banned on Vercel)

#### Security
- missing `withTenant()` on any query (tenant leakage)
- missing `withMiddleware()` on any API route (auth bypass)
- missing permission checks on sensitive actions (pricing override, damage charge, refund)
- location leakage — verify location-scoped queries filter by `location_id`
- missing audit events on sensitive writes

#### Database
- missing indexes on high-read queries (availability overlap, overdue returns, dashboard aggregates)
- missing composite indexes on `(tenant_id, ...)` patterns
- incorrect money types (dollars stored as integer, or cents stored as numeric)
- postgres.js result handling — any `.rows` usage instead of `Array.from()`
- `prepare: false` verified in all connection configs

#### Financial
- pricing edge cases — zero-duration rental, overnight boundary, DST transitions
- deposit accounting — deposit collection/release/refund all have GL events
- late fee calculation — integer math only, no floating point
- damage charge → GL event chain complete
- GL adapters never throw — verify all accounting calls are try/catch with fallback

#### Operational
- return edge cases — partial return, wrong-location return, missing items
- extension edge cases — downstream collision detection working
- hold expiry — read-time filtering + cron cleanup both implemented
- bundle availability — all-or-nothing check, no partial bundle holds
- event naming — all follow `rental.{entity}.{action}.v{N}` convention

#### UI
- dark mode compliance — no `bg-white`, `text-gray-900`, `dark:` anywhere
- workflow friction — minimize clicks for high-frequency operations (checkout, return)
- loading states — all async operations show skeleton/spinner
- error states — all API errors surface user-friendly messages

### Deliverables
- hardening findings categorized by severity (critical / high / medium / low)
- corrective code changes
- performance notes (query plans for hot paths)
- risk register with mitigations

### Output format
- findings table with severity
- exact fixes with file paths and code
- manual regression checklist
- `pnpm type-check` and `pnpm test` results
- recommended next session

---

## SESSION 23 — Test Strategy and UAT Plan

### Objective
Define how to validate the module comprehensively.

### Claude Instructions
Create a comprehensive test plan covering:
- unit tests
- service tests
- integration tests
- RLS / permission tests
- concurrency tests
- pricing tests
- return / damage tests
- multi-location tests
- portal tests
- UAT scenarios by industry type

### Deliverables
- test matrix
- highest-risk test cases
- seed scenarios
- UAT scripts

### Output format
- test strategy
- critical scenarios
- recommended automation priorities
- production readiness checklist

---

# REQUIRED V1 SCREEN LIST

Claude should design toward this minimum V1 screen inventory:

## Internal Admin / Ops
- Rental Dashboard
- Rental Products List
- Rental Product Detail / Edit
- Rental Assets List
- Rental Asset Detail / Activity
- Bundle / Package Builder
- Availability Search / Calendar
- Quote Builder
- Reservation / Order Detail
- Contract / Documents Panel
- Pickup / Checkout Screen
- Return Intake Screen
- Inspection / Damage Screen
- Rate Card Admin
- Maintenance Queue
- Overdue / Exception Queue
- Reporting Dashboard

## Portal / External
- Rental Catalog
- Product Detail
- Availability Search
- Cart / Booking Request
- Checkout / Deposit
- Customer Documents Upload
- Order History
- Order Detail
- Extension Request

---

# REQUIRED CORE USER JOURNEYS TO SUPPORT

Claude must ensure the design covers these user journeys:

## Journey 1 — Web self-serve booking
Customer browses catalog → checks dates → sees availability → books → uploads docs → pays deposit → gets confirmation.

## Journey 2 — Counter walk-in rental
Agent searches product → checks same-day availability → assigns asset → captures docs and deposit → checks out quickly.

## Journey 3 — Large quoted order
CSR builds quote with delivery and accessories → customer approves → contract signed → deposit collected → reservation operationalized.

## Journey 4 — Routed delivery order
Operations team stages assets → dispatches driver → captures proof of delivery → status updates flow back into ERP.

## Journey 5 — Partial damaged return
Customer returns part of the order → missing / damaged item flagged → inspection performed → deposit partially retained or damage invoice created.

## Journey 6 — Extension request
Customer requests more time → engine checks downstream availability → reprices → extension approved or denied.

---

# REQUIRED CONFIGURATION / POLICY LAYER

The module must be highly configurable. Claude should design a policy/rules approach for:
- age restrictions
- required documents
- required waivers
- required insurance
- deposit rules
- damage waiver rules
- same-day cutoff rules
- min / max rental duration
- turnaround buffers
- late fee calculation policies
- maintenance lockout policies
- return location policies
- override approval policies
- discount permissions
- extension permissions
- shortage / overbooking policy if ever enabled later

---

# REQUIRED REPORTING / KPI DEFINITIONS

Claude should include semantic and reporting definitions for:
- utilization rate
- revenue per asset
- revenue per product class
- overdue return rate
- damage rate
- maintenance downtime percent
- booking conversion rate
- quote-to-order conversion
- location performance
- idle inventory value
- extension frequency
- deposit liability balance

---

# IMPLEMENTATION STYLE RULES

When generating code in later sessions, Claude must:
- follow existing OppsEra file and naming conventions exactly
- prefer additive, safe changes
- avoid speculative abstractions unless clearly justified
- keep functions cohesive and deterministic
- use explicit typing everywhere — no `any` unless suppressed with `// eslint-disable-next-line @typescript-eslint/no-explicit-any`
- keep write-path logic in command files (`commands/*.ts`), not scattered across UI or API routes
- keep read-path logic in query files (`queries/*.ts`) using `withTenant()` pattern
- publish domain events through `publishWithOutbox()` — never fire-and-forget
- include `auditLog()` on all critical writes
- include Zod validation on all API inputs
- include `withMiddleware()` with correct entitlement + permission on all API routes
- use `checkIdempotency()` and `saveIdempotencyKey()` on all write commands
- use optimistic locking (`version` column) on write-contended entities
- design for future extraction but not premature microservices
- avoid weak placeholder code unless clearly labeled with `// TODO: SESSION N` markers
- all money: rate cards = dollars (numeric/string), orders = cents (integer/number)
- all DB calls must be `await`ed — no fire-and-forget on Vercel
- all UI must use semantic Tailwind tokens — no hardcoded light-mode colors
- test with Vitest (not Jest)
- `pnpm type-check` must pass after every session's changes

---

# WHAT NOT TO DO

Claude must avoid these mistakes:

## Domain Mistakes
- do not build separate modules for each industry — one horizontal engine with vertical presets
- do not treat rental as only an e-commerce flow — this is full operational lifecycle
- do not ignore accounting effects of deposits and damage — every money movement needs a GL event
- do not hand-wave concurrency in availability — advisory locks, not hope
- do not hardcode category-specific behavior into core domain logic — use configuration/rules
- do not skip auditability on sensitive actions — `auditLog()` on every write
- do not tie everything to one fulfillment model — counter, delivery, and routed must coexist
- do not make bundle availability naïve — all-or-nothing component check, atomic
- do not build a beautiful UI on top of an incorrect reservation engine — correctness first
- do not create cross-module coupling that violates OppsEra modular boundaries — events and read APIs only

## OppsEra-Specific Anti-Patterns (Will Cause Production Failures)
- **NEVER fire-and-forget a DB query** — unawaited Promises = zombie connections = pool exhaustion on Vercel
- **NEVER use `setInterval` or `setTimeout` for hold expiry** — lethal on Vercel serverless. Use cron + read-time filtering.
- **NEVER mix dollars and cents** — rate cards = dollars (numeric/string). Orders = cents (integer). The conversion boundary is explicit.
- **NEVER use `.rows` on postgres.js results** — use `Array.from(result as Iterable<T>)`
- **NEVER import from another module package** — `rental-ops` depends on `shared`, `db`, `core` ONLY
- **NEVER use `bg-white`, `text-gray-900`, or `dark:` prefixes** — dark mode is default and only mode
- **NEVER use floating-point math for money** — integer cents only for all calculations
- **NEVER skip `checkIdempotency` on write operations** — all commands use the idempotency pattern
- **NEVER create a migration with synthetic/backdated `when` timestamp** — production watermark is ~1772292944406. Use `Date.now()`.
- **NEVER edit a migration file after it has been applied** — Drizzle tracks by content hash
- **NEVER skip `withTenant()` on queries** — every query must be tenant-scoped. RLS is defense-in-depth, not primary.
- **NEVER let a GL adapter throw** — business operations (checkout, return, damage charge) must succeed even if GL posting fails

---

# V1 / V2 STRATEGY

## V1 must include
- rental product and asset master
- pooled + serialized inventory support
- availability engine
- reservation holds
- quotes / reservations / orders
- contracts / document hooks
- deposits / pricing basics
- pickup / checkout / return
- inspections / damage basics
- multi-location basics
- reporting basics
- ERP accounting event integration basics

## V1.1 / V2 can include
- advanced dispatch routing
- telematics / IoT integrations
- advanced dynamic bundle substitution
- highly advanced maintenance planning
- marketplace / channel integrations
- advanced forecasting / AI suggestions
- sub-rental / third-party sourcing
- route optimization
- advanced recurring billing for long-term rentals

---

# FINAL EXECUTION INSTRUCTION TO CLAUDE

For each session:
1. first inspect the real project files and conventions
2. explain what assumptions are confirmed vs unconfirmed
3. produce high-confidence output only
4. keep work aligned to OppsEra architecture
5. end with exact next-step recommendation

When writing implementation code:
- output exact file paths
- output exact code
- include schema/migration changes
- include validation and auth
- include notes on manual verification
- include notes on hardening concerns

When uncertain:
- prefer the safer, more deterministic architecture
- call out the uncertainty clearly
- propose the least risky implementation path first

---

# OPTIONAL FOLLOW-UP PROMPTS TO USE AFTER EACH SESSION

After Claude completes any session, use one or more of these short follow-ups:

## Hardening follow-up
**Now harden this design / implementation. Look for race conditions, bad assumptions, missing indexes, weak validation, missing permissions, edge cases, and any architectural drift from OppsEra conventions. Specifically check: unawaited DB ops, setInterval usage, money type confusion (dollars vs cents), missing withTenant(), missing auditLog(), advisory lock coverage, GL adapter throw safety, dark mode violations, and postgres.js RowList handling. Make it more production-grade.**

## ERP-integration follow-up
**Now review this specifically through the lens of ERP integrity: accounting (GL adapters never throw, deposit liability tracking, revenue categorization), auditability (auditLog on every write), customer/account ownership (customers module owns customer data — reference by ID only), inventory ownership (inventory module — reference by ID only), reporting (semantic layer events), and long-term maintainability (no cross-module imports). Tighten anything weak.**

## UI-operator follow-up
**Now review this through the lens of a high-volume rental operator. Simplify friction, reduce clicks, improve clarity, and make the workflows fast and operationally realistic. Verify dark mode compliance (no bg-white, text-gray-900, dark: prefixes). Check that all list views use DataTable with cursor pagination and status filter tabs. Verify loading/error/empty states on all async views.**

## Multi-location follow-up
**Now review this through the lens of multi-location rental operations with transfers, branch-level stock, and wrong-location returns. Verify location_id scoping on all relevant queries. Check that availability engine respects location boundaries. Verify transit holds block availability at both origin and destination. Strengthen anything weak.**

## Portal follow-up
**Now review this through the lens of customer self-serve booking and portal usability. Improve safety, simplicity, and conversion. Verify all portal API routes have proper auth (portal provider). Ensure no tenant data leakage through portal endpoints. Check that hold expiry is properly communicated to the customer.**

## Vercel safety follow-up
**Now review all code for Vercel serverless safety. Search for: unawaited DB operations, setInterval/setTimeout, long-running transactions, fire-and-forget patterns, connection pool violations (max: 2), and missing prepare: false. Every DB call must be awaited. No timers. Transactions must be short.**

---

# SUCCESS CRITERIA

This module is successful if OppsEra can credibly support rental businesses across multiple industries with:
- one unified engine
- correct availability
- clean fulfillment workflows
- proper asset tracking
- strong accounting hooks
- strong operational controls
- ERP-native integration
- extensible configuration rather than vertical fragmentation

