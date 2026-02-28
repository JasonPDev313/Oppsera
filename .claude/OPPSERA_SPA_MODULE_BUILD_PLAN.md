# OppsEra Spa Module — Comprehensive Build Plan

## Executive Summary

This document defines the complete build plan for a world-class Spa Management module inside OppsEra. It is designed as a series of session prompts you can feed directly to Claude to build the module end-to-end — from database schema through business logic, API routes, frontend UX, customer-facing booking apps, and deep integration with every existing OppsEra module.

The plan is informed by competitive analysis of Zenoti (30,000+ businesses, $1B valuation), Mangomint (modern UX leader), Boulevard (client experience platform), Mindbody (60,000+ businesses), Book4Time (luxury/hotel spa leader), and SpaSoft (enterprise hotel spa). OppsEra's unfair advantage is that it already has POS, Inventory, Accounting, CRM, Memberships, PMS, and a Semantic AI layer — competitors have none of this depth.

---

## Competitive Gap Analysis: What We Must Match or Beat

### Table Stakes (Every Competitor Has These)
- Appointment calendar with multi-view (day/week/provider/room)
- Online booking widget with real-time availability
- Client profiles with treatment history
- POS checkout with tip handling
- Staff scheduling and commission tracking
- Membership/package management
- Automated reminders (email + SMS)
- Basic reporting (revenue, utilization)

### Differentiators We Must Build (Only Best-in-Class Have)
- **Zenoti**: AI-powered smart marketing, multi-center management, branded mobile app, advanced analytics dashboards, payroll integration, digital forms, kiosk check-in
- **Mangomint**: Intelligent waitlist that recommends from queue, two-way client texting, self-checkout, HIPAA compliance, service customization during booking
- **Boulevard**: Precision scheduling (provider + room + equipment conflict resolution), duo/group bookings, client experience journeys, integrated payments with deposits
- **Book4Time**: Hotel PMS integration, room charge posting, multi-property spa management, yield management
- **Mindbody**: Marketplace discovery, branded mobile apps, advanced resource management, automated marketing workflows

### OppsEra's Unfair Advantage (Competitors Cannot Match)
- Full double-entry GL accounting with 15+ posting adapters
- Real inventory management with BOM consumption, COGS, vendor management
- Enterprise CRM with 36 tables, smart tags, RFM scoring, predictive analytics
- PMS integration for hotel/resort spa room charging
- Semantic AI layer for natural language business insights
- Modular ERP architecture with event-driven cross-module integration

---

## Architecture Principles

### Module Boundaries
The Spa module (`@oppsera/module-spa`) owns spa-specific domain objects and orchestrates existing modules:

**Spa Owns (New Domain)**
- Services & Treatments catalog (duration, pricing, add-ons, resource requirements)
- Appointments (bookings, lifecycle, deposits, cancellation rules)
- Providers (spa-specific profile, skills, service eligibility, commission rules)
- Resources (rooms, equipment, capacity, buffers/cleanup)
- Intake & Consent (forms, contraindications, SOAP notes)
- Spa Operations (prep workflows, room turnover, provider tasking)
- Spa Reporting layer (utilization, rebooking, attachment rate)
- Online Booking engine (widget, portal, availability API)

**Spa Reuses / Integrates**
- `customers` → client profile, memberships, household, loyalty, tags, wallets
- `orders` → checkout, cart composition, service charges, discounts
- `payments` → deposits, card on file, cancellation fees, split tenders, tips
- `inventory` → product consumption per service (BOM) + retail sales
- `accounting` → revenue recognition, deferred revenue (packages), commissions payable, GL posting
- `pms` → hotel guest folio charges, room-charge posting, guest lookup
- `catalog` → retail items available for attachment at checkout
- `semantic` → AI insights for spa operations, demand forecasting

### Integration Contract Pattern
```
spa.appointment.created.v1    → payments (deposit intent), customers (visit tracking)
spa.appointment.checked_in.v1 → operations (room prep trigger)
spa.appointment.completed.v1  → orders (create POS cart), inventory (BOM consumption)
spa.appointment.closed.v1     → accounting (GL posting), customers (update stats)
spa.commission.calculated.v1  → accounting (commission payable GL entry)
spa.package.sold.v1           → accounting (deferred revenue entry)
spa.package.redeemed.v1       → accounting (revenue recognition)
```

### Key Design Decisions
- Spa has its own `spa_idempotency_keys` and `spa_outbox` tables (like PMS) for microservice extractability
- All monetary values: catalog-layer = NUMERIC(12,2) dollars, order-layer = INTEGER cents
- Every table: ULID PKs, tenant_id + RLS, created_at/updated_at
- Follows existing command/query separation, publishWithOutbox, withTenant patterns
- Frontend: code-split pages, dark-mode semantic tokens, custom hooks wrapping apiFetch

---

## Session Plan Overview

| Session | Title | Focus | Estimated Scope |
|---------|-------|-------|-----------------|
| 1 | Module Foundation & Schema | Package scaffolding, all DB tables, migrations, RLS, module registry | ~45 tables, 2 migrations |
| 2 | Services, Providers & Resources | CRUD commands/queries/routes/validation for core entities | ~20 commands, ~15 queries, ~25 routes |
| 3 | Appointment Engine Core | Scheduling engine, conflict detection, lifecycle state machine | ~15 commands, ~10 queries, ~15 routes |
| 4 | Calendar UI & Appointment Management | Frontend calendar views, booking flow, appointment management | 8+ pages, 15+ components, 6+ hooks |
| 5 | Online Booking Portal | Customer-facing booking web app, availability API, guest checkout | Standalone app or embedded widget |
| 6 | Deposits, Cancellations & Waitlist | Payment integration, cancellation policies, fee automation, waitlist | ~10 commands, ~5 queries |
| 7 | POS Checkout Orchestration | Appointment→cart flow, retail attachment, tips, provider attribution | ~8 commands, integration wiring |
| 8 | Commissions & Provider Payroll | Commission rules engine, calculation, ledger, payroll export | ~10 commands, ~6 queries |
| 9 | Packages, Memberships & Deferred Revenue | Package/session bundles, redemption, accounting integration | ~12 commands, ~8 queries |
| 10 | Inventory Consumption & Service BOM | Treatment product usage tracking, auto-deduction, cost analysis | ~6 commands, ~4 queries |
| 11 | Intake Forms, Consent & Clinical Notes | Digital forms builder, SOAP notes, contraindications, photo support | ~10 commands, ~6 queries |
| 12 | Marketing Automation & Guest Engagement | Rebooking engine, win-back campaigns, event triggers, loyalty hooks | ~8 commands, ~5 queries |
| 13 | Reporting, Analytics & AI Insights | Spa dashboards, KPI metrics, CQRS read models, semantic layer | ~15 queries, 4 read models |
| 14 | Operations & Workflow Automation | Room turnover, prep tasks, cleaning checklists, daily ops | ~8 commands, ~4 queries |
| 15 | Multi-Location & Enterprise Features | Cross-location memberships, consolidated reporting, franchise support | ~6 commands, ~8 queries |
| 16 | Testing, Polish & Production Readiness | Comprehensive tests, edge cases, performance optimization, docs | 300+ tests target |

---

## Session 1: Module Foundation & Schema

### Prompt for Claude

```
CONTEXT: I'm building a world-class Spa Management module for OppsEra ERP.
Feed CLAUDE.md and CONVENTIONS.md first for project context.

TASK: Build the Spa module foundation — package scaffolding, complete database
schema, migrations, RLS policies, and module registry integration.

REQUIREMENTS:

1. PACKAGE SCAFFOLDING
Create `packages/modules/spa/` following the exact module structure pattern:
- package.json with name "@oppsera/module-spa", exports ".": "./src/index.ts", "./*": "./src/*.ts"
- tsconfig.json extending base
- vitest.config.ts
- src/index.ts (barrel exports — leave mostly empty, will populate in later sessions)
- src/schema.ts (main schema — all Drizzle table definitions)
- src/schema-intake.ts (intake/consent tables)
- src/schema-operations.ts (operations/workflow tables)
- src/commands/ directory with index.ts
- src/queries/ directory with index.ts
- src/events/types.ts with all spa event type constants
- src/events/index.ts
- src/validation.ts (Zod schemas — leave minimal, expand later)
- src/__tests__/ directory

2. DATABASE SCHEMA (packages/db/src/schema/spa.ts — canonical, re-exported by module)
Create these spa-owned tables (all with ULID PKs, tenant_id, RLS-ready):

CORE TABLES:
- spa_settings — tenant-level config (booking rules, buffer defaults, deposit rules, 
  cancellation defaults, enterprise_mode boolean, timezone, day_close_time, 
  online_booking_enabled, waitlist_enabled, auto_assign_provider boolean,
  default_currency, tax_inclusive boolean, rebooking_window_days,
  notification_preferences JSONB)
- spa_services — treatment/service catalog (name, description, display_name,
  category: 'massage'|'facial'|'body'|'nail'|'hair'|'wellness'|'medspa'|'other',
  duration_minutes, buffer_minutes, cleanup_minutes, setup_minutes,
  price NUMERIC(12,2), member_price NUMERIC(12,2), peak_price NUMERIC(12,2),
  cost NUMERIC(12,2), max_capacity integer default 1, 
  is_couples boolean default false, is_group boolean default false,
  min_group_size, max_group_size,
  requires_intake boolean, requires_consent boolean,
  contraindications JSONB, preparation_instructions text,
  aftercare_instructions text, 
  catalog_item_id TEXT references catalog_items for retail product link,
  image_url, sort_order, is_active boolean, archived_at, archived_by)
- spa_service_categories — hierarchical categories (name, parent_id self-ref,
  description, sort_order, is_active, icon)
- spa_service_addons — add-on treatments (name, duration_minutes, price,
  member_price, is_standalone boolean, sort_order, is_active)
- spa_service_addon_links — junction: service ↔ addon (service_id, addon_id,
  is_default boolean, price_override NUMERIC(12,2))
- spa_providers — staff who perform services (user_id FK, display_name, bio,
  photo_url, specialties JSONB, certifications JSONB, hire_date,
  employment_type: 'full_time'|'part_time'|'contractor'|'booth_rent',
  is_bookable_online boolean, accept_new_clients boolean,
  max_daily_appointments integer, break_duration_minutes,
  color text for calendar display, sort_order, is_active)
- spa_provider_availability — recurring schedule (provider_id, day_of_week 0-6,
  start_time TIME, end_time TIME, location_id, effective_from date,
  effective_until date nullable, is_active)
- spa_provider_time_off — one-off blocks (provider_id, start_at TIMESTAMPTZ,
  end_at TIMESTAMPTZ, reason, is_all_day boolean, status: 'pending'|'approved'|'rejected',
  approved_by, approved_at)
- spa_provider_service_eligibility — junction: provider ↔ service (provider_id,
  service_id, proficiency_level: 'trainee'|'standard'|'advanced'|'master',
  custom_duration_minutes nullable override, custom_price nullable override)
- spa_resources — rooms/equipment (name, resource_type: 'room'|'equipment'|'bed'|'chair'|'other',
  description, capacity integer default 1, location_id, 
  buffer_minutes integer default 0, cleanup_minutes integer default 0,
  amenities JSONB, photo_url, is_active, sort_order)
- spa_service_resource_requirements — junction: service ↔ resource type needed
  (service_id, resource_id nullable for specific, resource_type for any-of-type,
  quantity integer default 1, is_mandatory boolean default true)

APPOINTMENT TABLES:
- spa_appointments — the core booking record (
  appointment_number TEXT generated like 'SPA-YYYYMMDD-XXXXXX',
  customer_id FK to customers, guest_name text nullable for walk-ins,
  guest_email, guest_phone,
  location_id, provider_id FK nullable (unassigned allowed),
  resource_id FK nullable,
  start_at TIMESTAMPTZ, end_at TIMESTAMPTZ,
  status: 'draft'|'reserved'|'confirmed'|'checked_in'|'in_service'|'completed'|'checked_out'|'canceled'|'no_show',
  booking_source: 'front_desk'|'online'|'phone'|'mobile_app'|'kiosk'|'walk_in'|'pms',
  booking_channel text nullable,
  notes text, internal_notes text,
  deposit_amount INTEGER cents, deposit_status: 'none'|'required'|'authorized'|'captured'|'refunded',
  deposit_payment_id text,
  cancellation_reason text, canceled_at TIMESTAMPTZ, canceled_by text,
  no_show_fee_charged boolean default false,
  checked_in_at TIMESTAMPTZ, checked_in_by text,
  service_started_at TIMESTAMPTZ, service_completed_at TIMESTAMPTZ,
  checked_out_at TIMESTAMPTZ,
  order_id text nullable FK to orders (created at checkout),
  pms_folio_id text nullable FK for hotel guest charges,
  recurrence_rule JSONB nullable,
  version INTEGER default 1,
  created_by, updated_by)
- spa_appointment_items — line items within appointment (appointment_id,
  service_id FK, addon_id FK nullable, provider_id FK,
  resource_id FK nullable, 
  start_at TIMESTAMPTZ, end_at TIMESTAMPTZ,
  price_cents INTEGER, member_price_cents INTEGER nullable,
  final_price_cents INTEGER, discount_amount_cents INTEGER default 0,
  discount_reason text,
  package_balance_id text nullable for package redemption,
  notes text, status: 'scheduled'|'in_progress'|'completed'|'canceled',
  sort_order)
- spa_appointment_history — audit trail (appointment_id, action text,
  old_status, new_status, changes JSONB, performed_by, performed_at TIMESTAMPTZ,
  reason text)
- spa_waitlist — queue for fully-booked slots (customer_id, service_id,
  preferred_provider_id nullable, preferred_date date, preferred_time_start TIME,
  preferred_time_end TIME, flexibility: 'exact'|'flexible_time'|'flexible_date'|'any',
  status: 'waiting'|'offered'|'booked'|'expired'|'canceled',
  offered_appointment_id nullable, priority integer default 0,
  notes text, expires_at TIMESTAMPTZ)

INTAKE & CONSENT TABLES (schema-intake.ts):
- spa_intake_form_templates — form definitions (name, description,
  form_type: 'intake'|'consent'|'medical_history'|'covid'|'waiver'|'custom',
  fields JSONB array of field definitions, 
  required_for_services JSONB array of service IDs or 'all',
  version integer, is_active, is_required boolean default false)
- spa_intake_responses — completed forms (template_id, customer_id,
  appointment_id nullable, responses JSONB, signed_at TIMESTAMPTZ,
  signature_data text, ip_address text, version integer)
- spa_clinical_notes — SOAP notes for treatments (appointment_id,
  appointment_item_id nullable, provider_id, customer_id,
  note_type: 'soap'|'progress'|'general'|'contraindication',
  subjective text, objective text, assessment text, plan text,
  general_notes text, is_confidential boolean default false,
  photos JSONB array of URLs)
- spa_contraindications — client medical flags (customer_id,
  condition text, severity: 'mild'|'moderate'|'severe',
  affected_services JSONB, notes text, reported_at TIMESTAMPTZ,
  reported_by, is_active boolean default true)

FINANCIAL TABLES:
- spa_commission_rules — (name, provider_id nullable for default,
  service_id nullable, service_category nullable,
  commission_type: 'percentage'|'flat'|'tiered'|'sliding_scale',
  rate NUMERIC(5,2) for percentage, flat_amount NUMERIC(12,2),
  tiers JSONB for tiered [{threshold, rate}],
  applies_to: 'service'|'retail'|'addon'|'tip'|'all',
  effective_from date, effective_until date nullable,
  is_active, priority integer for rule precedence)
- spa_commission_ledger — calculated commissions (provider_id,
  appointment_id, appointment_item_id nullable, order_id nullable,
  rule_id FK, commission_type text, base_amount_cents INTEGER,
  commission_amount_cents INTEGER, rate_applied NUMERIC(5,2),
  status: 'calculated'|'approved'|'paid'|'adjusted'|'voided',
  pay_period text, approved_by, approved_at, paid_at,
  adjustment_reason text, original_amount_cents INTEGER nullable)
- spa_package_definitions — spa-specific packages (name, description,
  package_type: 'session_bundle'|'credit_bundle'|'time_bundle'|'value_bundle',
  included_services JSONB array [{serviceId, quantity}],
  total_sessions INTEGER nullable, total_credits NUMERIC(12,2) nullable,
  total_value_cents INTEGER, selling_price_cents INTEGER,
  validity_days INTEGER, is_transferable boolean default false,
  is_shareable boolean default false, max_shares INTEGER default 1,
  auto_renew boolean default false, renewal_price_cents INTEGER nullable,
  freeze_allowed boolean, max_freeze_days INTEGER,
  is_active, sort_order)
- spa_package_balances — purchased instances (customer_id, package_def_id,
  purchase_date date, expiration_date date,
  sessions_total INTEGER, sessions_used INTEGER default 0,
  credits_total NUMERIC(12,2), credits_used NUMERIC(12,2) default 0,
  status: 'active'|'frozen'|'expired'|'exhausted'|'canceled',
  frozen_at TIMESTAMPTZ, frozen_until TIMESTAMPTZ,
  freeze_count INTEGER default 0,
  order_id text FK to purchase order,
  notes text)
- spa_package_redemptions — usage log (balance_id, appointment_id,
  appointment_item_id, sessions_redeemed INTEGER default 1,
  credits_redeemed NUMERIC(12,2) default 0,
  redeemed_at TIMESTAMPTZ, redeemed_by text, voided boolean default false)

OPERATIONS TABLES (schema-operations.ts):
- spa_room_turnover_tasks — cleanup/prep tasks (resource_id,
  appointment_id nullable, task_type: 'cleanup'|'setup'|'inspection'|'restock',
  assigned_to text, status: 'pending'|'in_progress'|'completed'|'skipped',
  due_at TIMESTAMPTZ, completed_at TIMESTAMPTZ, notes text,
  checklist JSONB array of items)
- spa_daily_operations — daily ops log (location_id, business_date date,
  opening_checklist JSONB, closing_checklist JSONB,
  opened_by text, opened_at TIMESTAMPTZ,
  closed_by text, closed_at TIMESTAMPTZ,
  notes text, incidents JSONB)

BOOKING ENGINE TABLES:
- spa_booking_widget_config — per-tenant/location booking customization (
  location_id, theme JSONB, logo_url, welcome_message text,
  booking_lead_time_hours INTEGER default 2,
  max_advance_booking_days INTEGER default 90,
  require_deposit boolean, deposit_type: 'percentage'|'flat',
  deposit_value NUMERIC(12,2),
  cancellation_window_hours INTEGER default 24,
  cancellation_fee_type: 'percentage'|'flat'|'none',
  cancellation_fee_value NUMERIC(12,2) default 0,
  show_prices boolean default true, show_provider_photos boolean default true,
  allow_provider_selection boolean default true,
  allow_addon_selection boolean default true,
  custom_css text, redirect_url text,
  is_active boolean default true)

MODULE INFRASTRUCTURE:
- spa_idempotency_keys — module-specific (like PMS pattern)
- spa_outbox — module-specific event outbox (like PMS pattern)

3. MIGRATION FILE
Create the migration SQL with:
- All CREATE TABLE IF NOT EXISTS statements
- All indexes (tenant_id on every table, plus business-critical: 
  appointments by date range, provider+date, customer, status;
  commission ledger by provider+period; package balances by customer+status)
- Composite unique constraints where needed
- RLS policies: FORCE ROW LEVEL SECURITY, 4 policies per table (SELECT/INSERT/UPDATE/DELETE)
  all matching tenant_id = current_setting('app.current_tenant_id')
- Check the migration journal for the next available number

4. MODULE REGISTRY
- Add 'spa' to MODULE_REGISTRY in the appropriate file
- Add entitlement key 'spa'
- Add feature flag 'spa_enabled'

5. EVENT TYPE CONSTANTS
In src/events/types.ts define:
export const SPA_EVENTS = {
  // Appointments
  APPOINTMENT_CREATED: 'spa.appointment.created.v1',
  APPOINTMENT_UPDATED: 'spa.appointment.updated.v1',
  APPOINTMENT_CONFIRMED: 'spa.appointment.confirmed.v1',
  APPOINTMENT_CHECKED_IN: 'spa.appointment.checked_in.v1',
  APPOINTMENT_SERVICE_STARTED: 'spa.appointment.service_started.v1',
  APPOINTMENT_COMPLETED: 'spa.appointment.completed.v1',
  APPOINTMENT_CHECKED_OUT: 'spa.appointment.checked_out.v1',
  APPOINTMENT_CANCELED: 'spa.appointment.canceled.v1',
  APPOINTMENT_NO_SHOW: 'spa.appointment.no_show.v1',
  APPOINTMENT_RESCHEDULED: 'spa.appointment.rescheduled.v1',
  // Checkout
  CHECKOUT_READY: 'spa.checkout.ready.v1',
  CHECKOUT_COMPLETED: 'spa.checkout.completed.v1',
  // Commissions  
  COMMISSION_CALCULATED: 'spa.commission.calculated.v1',
  COMMISSION_APPROVED: 'spa.commission.approved.v1',
  // Packages
  PACKAGE_SOLD: 'spa.package.sold.v1',
  PACKAGE_REDEEMED: 'spa.package.redeemed.v1',
  PACKAGE_EXPIRED: 'spa.package.expired.v1',
  // Waitlist
  WAITLIST_ADDED: 'spa.waitlist.added.v1',
  WAITLIST_OFFERED: 'spa.waitlist.offered.v1',
  // Operations
  ROOM_TURNOVER_COMPLETED: 'spa.room.turnover_completed.v1',
  // Intake
  INTAKE_COMPLETED: 'spa.intake.completed.v1',
  CONSENT_SIGNED: 'spa.consent.signed.v1',
} as const;

6. PERMISSION CONSTANTS
Define spa permissions following the pattern in CONVENTIONS.md §13:
- spa.view, spa.manage (top-level)
- spa.appointments.view, spa.appointments.create, spa.appointments.manage
- spa.services.view, spa.services.manage
- spa.providers.view, spa.providers.manage
- spa.resources.view, spa.resources.manage
- spa.commissions.view, spa.commissions.manage, spa.commissions.approve
- spa.packages.view, spa.packages.manage
- spa.reports.view, spa.reports.export
- spa.intake.view, spa.intake.manage
- spa.operations.view, spa.operations.manage
- spa.settings.view, spa.settings.manage
- spa.online_booking.manage

Add to PERMISSION_MATRIX, seed file, and settings UI permission groups.

7. SIDEBAR NAVIGATION
Add Spa section to sidebar with icon Sparkles (from lucide-react):
- Dashboard
- Calendar
- Appointments
- Services
- Providers
- Rooms & Resources
- Packages
- Clients (links to /customers filtered by spa visits)
- Reports
- Settings

Gate behind entitlement 'spa'.

DELIVERABLES:
- packages/modules/spa/ fully scaffolded
- Migration SQL file with all tables + RLS
- Module registered, permissions seeded, sidebar wired
- Event types defined
- Build passes, no type errors

DO NOT build commands, queries, or frontend yet — just the foundation.
```

---

## Session 2: Services, Providers & Resources CRUD

### Prompt for Claude

```
CONTEXT: OppsEra Spa Module — Session 2 of 16.
The module foundation (schema, migrations, RLS, module registry) was built in Session 1.
Feed CLAUDE.md and CONVENTIONS.md for project patterns.

TASK: Build complete CRUD for the three core entity types that everything else depends on:
Services/Treatments, Providers, and Resources (rooms/equipment).

REQUIREMENTS:

1. SERVICES & TREATMENTS

Validation schemas (src/validation.ts):
- createServiceSchema, updateServiceSchema
- createServiceCategorySchema, updateServiceCategorySchema
- createAddonSchema, updateAddonSchema
- linkAddonToServiceSchema

Commands (src/commands/):
- createService — full service definition with pricing, duration, resource requirements
- updateService — diff-only PATCH, version check
- archiveService / unarchiveService — soft archive pattern
- createServiceCategory — hierarchical categories
- updateServiceCategory
- createAddon — standalone add-on treatments
- updateAddon
- linkAddonToService / unlinkAddonFromService — junction management
- setServiceResourceRequirements — bulk set which resources a service needs
- reorderServices — update sort_order for display
- duplicateService — clone service with new name

Queries (src/queries/):
- listServices — cursor pagination, filters (category, status, active/archived, 
  price range, duration range, is_couples, is_group), search by name
- getService — full detail with addons, resource requirements, eligible providers
- listServiceCategories — tree structure with service counts
- getServiceCategory
- listAddons — with linked service counts
- getAddon
- getServiceMenu — public-facing formatted menu grouped by category, 
  with prices and durations (used by booking widget)

API Routes (apps/web/src/app/api/v1/spa/):
- /services — GET (list), POST (create)
- /services/[id] — GET, PATCH, DELETE (archive)
- /services/[id]/addons — GET, POST (link), DELETE (unlink)
- /services/[id]/resources — GET, PUT (set requirements)
- /services/[id]/duplicate — POST
- /services/categories — GET, POST
- /services/categories/[id] — GET, PATCH, DELETE
- /services/addons — GET, POST
- /services/addons/[id] — GET, PATCH, DELETE
- /services/menu — GET (public, for booking widget)
- /services/reorder — POST

All routes use withMiddleware with entitlement: 'spa' and appropriate permissions.

2. PROVIDERS

Validation schemas:
- createProviderSchema, updateProviderSchema
- setProviderAvailabilitySchema (array of day/time slots)
- createProviderTimeOffSchema
- setProviderServiceEligibilitySchema

Commands:
- createProvider — link to existing staff user, set spa-specific profile
- updateProvider — profile updates
- deactivateProvider / reactivateProvider
- setProviderAvailability — bulk replace recurring schedule for a provider
- createProviderTimeOff — request time off
- approveProviderTimeOff / rejectProviderTimeOff
- setProviderServiceEligibility — bulk set which services they can perform + proficiency
- updateProviderServiceEligibility — update single eligibility record

Queries:
- listProviders — with filters (active, specialties, available_for_service), 
  include service count, next available slot
- getProvider — full detail with availability, eligibility, performance stats
- getProviderAvailability — for a specific date range, returns available slots
  accounting for: recurring schedule, time off, existing appointments, buffer times
- getProviderSchedule — calendar view of a provider's appointments for date range
- listProviderTimeOff — with status filter
- getEligibleProviders — given a service_id and datetime, return available providers

API Routes:
- /providers — GET, POST
- /providers/[id] — GET, PATCH
- /providers/[id]/availability — GET (query by date range), PUT (set recurring)
- /providers/[id]/time-off — GET, POST
- /providers/[id]/time-off/[timeOffId] — PATCH (approve/reject)
- /providers/[id]/eligibility — GET, PUT (bulk set)
- /providers/[id]/schedule — GET (calendar data for date range)
- /providers/eligible — GET ?serviceId=xxx&datetime=xxx

3. RESOURCES (ROOMS & EQUIPMENT)

Validation schemas:
- createResourceSchema, updateResourceSchema

Commands:
- createResource
- updateResource
- deactivateResource / reactivateResource
- setResourceAvailability — if resources need scheduling (optional V1)

Queries:
- listResources — filter by type, location, active status
- getResource — with current utilization stats
- getAvailableResources — for service_id + datetime, return available resources
  that meet the service requirements

API Routes:
- /resources — GET, POST
- /resources/[id] — GET, PATCH
- /resources/available — GET ?serviceId=xxx&datetime=xxx

4. AVAILABILITY ENGINE (Critical Helper)
Build a shared availability helper: src/helpers/availability-engine.ts

This is THE most important piece of spa logic. It must:
- Calculate available time slots for a service given:
  - Service duration + buffer + cleanup + setup time
  - Provider availability (recurring schedule - time off - existing bookings)
  - Resource availability (capacity - existing bookings)
  - Business hours from spa_settings
  - Booking lead time from widget config
  - Max advance booking days
- Support "any available provider" mode
- Support "any available resource of type X" mode
- Handle couples bookings (2 providers + 2 resources simultaneously)
- Handle group bookings (1 provider + N resources)
- Return slots as [{startAt, endAt, providerId, resourceId}]
- Be efficient — this gets called heavily by the booking widget

Export as: getAvailableSlots(params: AvailabilityQuery): Promise<TimeSlot[]>

5. TESTS
Write tests for:
- Service CRUD commands (create, update, archive, duplicate)
- Provider availability calculation (recurring - time off - bookings)
- Resource conflict detection
- Availability engine (the critical helper)
- At least 50 tests total

DELIVERABLES:
- All commands, queries, routes for services, providers, resources
- Availability engine helper
- Validation schemas
- Tests
- No type errors, all routes wired
```

---

## Session 3: Appointment Engine Core

### Prompt for Claude

```
CONTEXT: OppsEra Spa Module — Session 3 of 16.
Services, Providers, Resources, and the Availability Engine are built.
Feed CLAUDE.md and CONVENTIONS.md.

TASK: Build the appointment scheduling engine — the heart of the spa module.

REQUIREMENTS:

1. APPOINTMENT STATE MACHINE
Define strict transitions in src/helpers/appointment-transitions.ts:

draft → reserved → confirmed → checked_in → in_service → completed → checked_out
                  confirmed → canceled
                  confirmed → no_show
                  reserved → canceled
                  checked_in → canceled (with fee)
                  in_service → completed (cannot cancel mid-service)

Use the same assertValidTransition pattern as PMS reservations.
Throw InvalidStatusTransitionError on invalid transitions.

2. APPOINTMENT COMMANDS (src/commands/)

createAppointment:
- Validate service exists, is active
- If provider specified: validate eligibility, check availability
- If resource specified: validate meets service requirements, check availability
- If no provider: auto-assign based on availability + proficiency
- If no resource: auto-assign based on availability + requirements
- Calculate end_at from start_at + service duration + addon durations
- Check for conflicts (provider double-book, resource double-book)
- Generate appointment_number (SPA-YYYYMMDD-XXXXXX from ULID)
- Create appointment + appointment_items
- Emit spa.appointment.created.v1 (with full service/provider/customer data)
- If deposit required: include deposit info in event for payments module

updateAppointment:
- Optimistic locking (version check)
- If time/provider/resource changed: re-validate availability
- Log changes to spa_appointment_history
- Emit spa.appointment.updated.v1

rescheduleAppointment:
- Convenience wrapper: validates new time, updates, logs reschedule reason
- Emit spa.appointment.rescheduled.v1

confirmAppointment:
- Transition reserved → confirmed
- Trigger confirmation notification event

checkInAppointment:
- Transition confirmed → checked_in
- Set checked_in_at, checked_in_by
- Validate any required intake forms are completed
- Emit spa.appointment.checked_in.v1

startService:
- Transition checked_in → in_service
- Set service_started_at
- Emit spa.appointment.service_started.v1

completeAppointment:
- Transition in_service → completed
- Set service_completed_at
- Emit spa.appointment.completed.v1

checkoutAppointment:
- Transition completed → checked_out (or completed → checked_out)
- This triggers the POS cart creation flow
- Set checked_out_at
- Emit spa.checkout.ready.v1 with all line items for POS cart

cancelAppointment:
- Validate transition allowed
- Set cancellation_reason, canceled_at, canceled_by
- Release provider and resource slots
- If deposit captured: determine refund eligibility based on cancellation policy
- Emit spa.appointment.canceled.v1

markNoShow:
- Transition confirmed → no_show
- If no-show fee configured: charge fee
- Emit spa.appointment.no_show.v1

addItemToAppointment:
- Add a service or addon to existing appointment
- Re-validate time/resource availability
- Recalculate end_at
- Version bump

removeItemFromAppointment:
- Remove line item
- Recalculate end_at
- Version bump

createRecurringAppointment:
- Create a series of appointments from a recurrence rule
- Validate all instances have availability
- Link via recurrence_rule on parent

bulkCreateAppointments:
- For group bookings: create N linked appointments
- For couples: create 2 linked appointments with paired providers/resources

3. APPOINTMENT QUERIES (src/queries/)

listAppointments:
- Cursor pagination
- Filters: date range, status, provider_id, resource_id, customer_id,
  booking_source, location_id
- Sort by start_at (default), created_at, status
- Include customer name, provider name, service names

getAppointment:
- Full detail with items, customer info, provider info, resource info,
  history log, intake status, deposit status

getAppointmentsByDate:
- Optimized for calendar views: returns all appointments for a date range
  with minimal fields needed for calendar rendering

getUpcomingAppointments:
- For a customer: their next N appointments
- For a provider: their schedule for today/tomorrow

getDailyOverview:
- Summary stats for a business date: total appointments, by status,
  revenue estimate, utilization percentage, provider load

searchAppointments:
- Full-text search across customer name, appointment number, notes

getAppointmentHistory:
- Audit trail for a specific appointment

4. APPOINTMENT API ROUTES

- /appointments — GET (list), POST (create)
- /appointments/[id] — GET, PATCH (update)
- /appointments/[id]/reschedule — POST
- /appointments/[id]/confirm — POST
- /appointments/[id]/check-in — POST
- /appointments/[id]/start-service — POST
- /appointments/[id]/complete — POST
- /appointments/[id]/checkout — POST
- /appointments/[id]/cancel — POST
- /appointments/[id]/no-show — POST
- /appointments/[id]/items — POST (add), DELETE (remove)
- /appointments/[id]/history — GET
- /appointments/calendar — GET (calendar-optimized, date range required)
- /appointments/daily-overview — GET ?date=YYYY-MM-DD
- /appointments/search — GET ?q=xxx
- /appointments/upcoming — GET ?customerId=xxx or ?providerId=xxx
- /appointments/recurring — POST (create series)
- /appointments/group — POST (bulk create for group/couples)

5. CONFLICT DETECTION ENGINE (src/helpers/conflict-detector.ts)
- detectProviderConflicts(providerId, startAt, endAt, excludeAppointmentId?)
- detectResourceConflicts(resourceId, startAt, endAt, excludeAppointmentId?)
- detectCustomerConflicts(customerId, startAt, endAt, excludeAppointmentId?)
- Returns: { hasConflict: boolean, conflicts: AppointmentConflict[] }
- Must account for buffer/cleanup times
- Used by all booking commands

6. EVENT CONSUMERS
Register consumers for:
- spa.appointment.created.v1 → customer module (log visit intent, update stats)
- spa.appointment.completed.v1 → prepare checkout data
- spa.appointment.canceled.v1 → customer module (update stats)
- spa.appointment.no_show.v1 → customer module (track no-show rate)

7. TESTS (50+ tests)
- State machine transitions (valid + invalid)
- Conflict detection (provider, resource, customer)
- Appointment CRUD
- Recurring appointment creation
- Group/couples booking
- Edge cases: overlapping buffers, midnight crossover, timezone handling

DELIVERABLES:
- Complete appointment engine with all commands/queries/routes
- State machine with transition validation
- Conflict detection engine
- Event consumers
- Tests
```

---

## Session 4: Calendar UI & Appointment Management Frontend

### Prompt for Claude

```
CONTEXT: OppsEra Spa Module — Session 4 of 16.
The full appointment engine backend is complete.
Feed CLAUDE.md and CONVENTIONS.md. Follow all dark-mode conventions strictly.

TASK: Build the spa frontend — calendar views, appointment management UI, 
service/provider/resource management pages.

REQUIREMENTS:

1. SPA DASHBOARD PAGE (/spa)
- Code-split: page.tsx thin wrapper + dashboard-content.tsx
- Today's overview: appointment count, revenue estimate, utilization %, 
  next available slot, no-shows today
- Quick actions: New Appointment, Walk-in, View Calendar
- Upcoming appointments list (next 5)
- Provider status cards (available/busy/off)
- Use React Query for data fetching (match dashboard pattern)

2. CALENDAR PAGE (/spa/calendar) — THE CRITICAL VIEW
This is the most important spa UI. Build a multi-view calendar:

Views (tabs):
a) Day View — vertical time grid (7am-9pm default, configurable)
   - Columns = providers (or resources, toggle)
   - Appointments as blocks with color = status, height = duration
   - Show breaks, time-off as grayed blocks
   - Click empty slot → new appointment dialog
   - Click appointment → appointment detail flyout
   - Drag to reschedule (stretch to resize duration)

b) Week View — 7-day horizontal grid
   - Rows = providers
   - Compact appointment blocks
   - Click to drill into day view

c) Provider View — focus on single provider
   - Full day timeline with all their appointments
   - Side panel with provider stats for the day

d) Resource View — focus on rooms/equipment
   - Columns = resources
   - Show room utilization

Implementation:
- Use a clean CSS Grid layout (NOT a heavy calendar library)
- 15-minute time slots
- Color coding: confirmed=indigo, checked_in=green, in_service=amber, 
  completed=green, canceled=red/strikethrough, no_show=red
- Time indicator line showing current time
- Filter bar: date picker, location selector, provider filter, status filter
- Mini-calendar in sidebar for date navigation

Hooks:
- useSpaCalendar(dateRange, view, filters) — fetches calendar data
- useSpaAppointment(id) — single appointment detail
- useSpaProviders() — provider list with status
- useSpaResources() — resource list

3. APPOINTMENT DETAIL FLYOUT (slide-in panel like Customer Profile Drawer)
- 500px slide-in from right
- Tabs: Details, Items, History, Notes, Intake
- Action buttons based on status: Confirm, Check-in, Start, Complete, 
  Checkout, Cancel, Reschedule, No-Show
- Status badge and timeline
- Customer quick info with link to full profile
- Provider and resource display

4. NEW APPOINTMENT DIALOG (multi-step)
Step 1: Select Service(s) — service picker grouped by category, with duration/price
Step 2: Select Provider — available providers for selected service/time, 
  or "Any Available"
Step 3: Select Date & Time — available slots grid (from availability engine)
Step 4: Select Customer — search existing or create new (walk-in option)
Step 5: Confirm — summary with deposit info if required
Step 6: Done — confirmation with options to add another, view calendar

5. SERVICES MANAGEMENT PAGE (/spa/services)
- Service list with categories as tabs/filter
- Create/edit service form (all fields from schema)
- Addon management
- Resource requirement assignment
- Drag to reorder
- Archive/unarchive

6. PROVIDERS MANAGEMENT PAGE (/spa/providers)
- Provider cards with photo, specialties, active status
- Create/edit provider form
- Availability schedule editor (weekly recurring grid)
- Time-off requests with approval workflow
- Service eligibility matrix (checkboxes: provider × service grid)

7. RESOURCES MANAGEMENT PAGE (/spa/resources)
- Resource list grouped by type (rooms/equipment)
- Create/edit form
- Current utilization indicator
- Capacity display

8. APPOINTMENTS LIST PAGE (/spa/appointments)
- DataTable with filters: date range, status, provider, customer, source
- Quick status actions inline
- Export to CSV
- Search

9. SPA SETTINGS PAGE (/spa/settings)
- Booking rules (buffers, lead time, advance booking)
- Cancellation policy config
- Deposit rules
- Online booking toggle
- Notification preferences
- Enterprise vs SMB mode toggle

10. COMPONENTS (apps/web/src/components/spa/)
- SpaCalendar (the main calendar component with views)
- AppointmentBlock (rendered block in calendar)
- AppointmentDetailFlyout
- NewAppointmentDialog (multi-step)
- ServicePicker
- ProviderPicker
- TimeSlotGrid (available slots display)
- CustomerSearchInline (quick search for booking)
- StatusBadge (appointment status with color)
- ProviderAvailabilityEditor
- ServiceEligibilityMatrix

All components MUST use semantic design tokens (bg-surface, text-foreground, 
border-border, etc.). NO bg-white, NO bg-gray-50, NO text-gray-900.

DELIVERABLES:
- 8+ pages, all code-split
- 15+ components
- 6+ custom hooks
- Calendar with 4 views
- Dark mode compliant
- No type errors
```

---

## Session 5: Online Booking Portal

### Prompt for Claude

```
CONTEXT: OppsEra Spa Module — Session 5 of 16.
Backend + staff-facing frontend are complete.
Feed CLAUDE.md and CONVENTIONS.md.

TASK: Build a customer-facing online booking experience — this is how spas 
make money and reduce phone calls. It must be beautiful and conversion-optimized.

REQUIREMENTS:

1. BOOKING WIDGET (embeddable component OR standalone route)
Option A: Standalone route at /book/[tenantSlug]/spa (recommended for V1)
Option B: Embeddable React widget that spas add to their website

Build as a public-facing flow (no auth required to browse, auth at checkout):

Step 1: Service Selection
- Services grouped by category with descriptions, durations, prices
- Add-on selection with service customization
- Beautiful cards with images
- Mobile-responsive grid
- Price display (configurable hide/show)

Step 2: Provider Selection (optional)
- Provider cards with photo, bio, specialties
- "Any Available" option (recommended, shown first)
- Only shows providers eligible for selected service
- If only 1 provider eligible, auto-select

Step 3: Date & Time Selection
- Calendar month view for date picking
- Available time slots for selected date (from availability engine API)
- Time slots grouped by morning/afternoon/evening
- Show provider name if specific provider selected
- Grayed out = unavailable, green = available
- Handle timezone display

Step 4: Your Details
- If returning customer: email lookup → prefill
- If new: name, email, phone, any required fields
- Required intake forms (if service requires)
- Notes/special requests field

Step 5: Confirm & Pay
- Booking summary: service, provider, date/time, price
- Deposit collection (if required by policy)
  - Card on file capture via Stripe (or your payment gateway)
  - Display cancellation policy
- Terms & conditions checkbox
- "Book Now" button

Step 6: Confirmation
- Confirmation with appointment number
- Add to calendar (iCal download link)
- "Book Another" option
- Account creation offer

2. PUBLIC API ROUTES (no auth required for browsing)
- GET /api/v1/spa/public/[tenantSlug]/menu — service menu
- GET /api/v1/spa/public/[tenantSlug]/providers — bookable providers
- GET /api/v1/spa/public/[tenantSlug]/availability — available slots
  ?serviceId=xxx&date=YYYY-MM-DD&providerId=xxx(optional)
- POST /api/v1/spa/public/[tenantSlug]/book — create booking
  (rate limited, CAPTCHA-ready, validates deposit)
- GET /api/v1/spa/public/[tenantSlug]/config — widget config (theme, policies)
- POST /api/v1/spa/public/[tenantSlug]/lookup — email lookup for returning clients

These routes bypass normal auth but:
- Resolve tenant from slug
- Rate limit (10 req/min for browsing, 3 req/min for booking)
- Validate tenant has spa_enabled + online_booking_enabled

3. GUEST SELF-SERVICE
- Booking confirmation page with manage link
- Manage booking page (reschedule, cancel, add notes)
- Token-based access (unique URL emailed to guest)
- Pre-arrival form completion

4. MOBILE-FIRST DESIGN
- The booking flow MUST be mobile-first (majority of spa bookings are mobile)
- Touch-friendly time slot selection
- Smooth step transitions (no full page reloads)
- Progress indicator showing steps
- Back button support

5. BOOKING WIDGET CONFIGURATION
Staff can customize via spa settings:
- Logo and brand colors
- Welcome message
- Which services to show online
- Which providers are bookable online
- Deposit requirements
- Cancellation policy text
- Custom CSS

6. EMBED CODE GENERATION
Generate an embed snippet that spas can add to their website:
<script src="https://app.oppsera.com/embed/spa-booking.js" 
  data-tenant="SLUG" data-location="LOC_ID"></script>

7. NOTIFICATIONS
Define event triggers for notification system:
- Booking confirmation (email + SMS)
- Booking reminder (24h before, configurable)
- Cancellation confirmation
- Reschedule confirmation
- Pre-arrival form reminder

(Actual notification sending can be stubbed — just emit the events with
the right payloads for a future notifications module to consume.)

DELIVERABLES:
- Complete booking flow (6 steps)
- Public API routes (6 routes)
- Guest self-service (manage booking)
- Mobile-responsive design
- Widget configuration
- Notification event definitions
```

---

## Session 6: Deposits, Cancellations & Waitlist

### Prompt for Claude

```
CONTEXT: OppsEra Spa Module — Session 6 of 16.
Feed CLAUDE.md and CONVENTIONS.md.

TASK: Build the revenue protection layer — deposits, cancellation fee automation,
and the intelligent waitlist system.

REQUIREMENTS:

1. DEPOSIT SYSTEM
Commands:
- requireDeposit — at booking time, create deposit intent via Payments module
- authorizeDeposit — authorize card hold (amount from policy: % or flat)
- captureDeposit — capture when no-show or late cancel
- refundDeposit — full/partial refund when legitimate cancel within window
- releaseDeposit — release authorization when appointment completes normally

Integration: Call into @oppsera/module-payments for actual payment operations.
Spa module tracks deposit_status on appointment + deposit_payment_id reference.

Deposit rules engine (src/helpers/deposit-rules.ts):
- Configurable per service, membership tier, booking source
- Default rules from spa_booking_widget_config
- Member exemptions (certain tiers skip deposits)
- Peak-time deposit multiplier option

2. CANCELLATION POLICY ENGINE (src/helpers/cancellation-engine.ts)
- Configurable cancellation windows (e.g., 24h, 48h, 72h)
- Fee calculation: percentage of service total or flat fee
- Tiered penalties: 50% if <24h, 100% if <2h, free if >48h
- Member exemptions (configurable by tier)
- First-time client grace (optional)
- Automatic fee charging when cancellation occurs
- Returns: { feeApplicable: boolean, feeAmountCents: number, reason: string }

Commands:
- configureCancellationPolicy — set policy rules per service/default
- processCancellation — evaluate policy, charge fee if applicable,
  release resources, notify customer

3. NO-SHOW HANDLING
Commands:
- markNoShow — after appointment time passes + grace period
- chargeNoShowFee — apply fee per policy
- bulkMarkNoShows — batch process for end-of-day (background job)

Background job:
- runNoShowMarking — runs after business close, finds appointments still 
  in 'confirmed' status after their end_at, marks as no_show

4. INTELLIGENT WAITLIST
Commands:
- addToWaitlist — customer requests slot for fully-booked time
- offerWaitlistSlot — when cancellation opens a slot, find best match
- acceptWaitlistOffer — customer accepts, auto-book
- declineWaitlistOffer — customer declines, offer to next
- expireWaitlistEntries — clean up old entries
- removeFromWaitlist — customer self-remove

Matching algorithm (src/helpers/waitlist-matcher.ts):
- When appointment cancels, find waitlist entries that match:
  1. Same service (required)
  2. Same provider preference (if specified, bonus points)
  3. Date/time within flexibility window
  4. Priority scoring: exact match > flexible time > flexible date > any
- Offer to highest priority match first
- Auto-expire offers after configurable window (e.g., 2 hours)
- If declined or expired, offer to next match

Queries:
- listWaitlist — filter by status, date range, service
- getWaitlistPosition — customer's position for a specific slot
- getWaitlistStats — conversion rate, avg wait time

5. CANCELLATION EVENT CONSUMER
When spa.appointment.canceled.v1 fires:
- Check waitlist for matching entries
- If match found: emit spa.waitlist.offered.v1
- The offer triggers notification to the waiting customer

6. TESTS (30+ tests)
- Deposit calculation with various policies
- Cancellation fee engine (in/out of window, member exempt, tiered)
- Waitlist matching algorithm
- No-show batch processing
- Edge cases: cancel after check-in, same-day cancellation, deposit refund timing

DELIVERABLES:
- Deposit system integrated with Payments module
- Cancellation policy engine with fee automation
- No-show detection and fee charging
- Intelligent waitlist with matching algorithm
- Background jobs for no-show processing
- All API routes, tests
```

---

## Session 7: POS Checkout Orchestration

### Prompt for Claude

```
CONTEXT: OppsEra Spa Module — Session 7 of 16.
Feed CLAUDE.md and CONVENTIONS.md.

TASK: Build the "money moment" — when a completed appointment converts to revenue.
This connects Spa to POS, Payments, and Accounting.

REQUIREMENTS:

1. CHECKOUT FLOW
When appointment reaches 'completed' status and staff clicks "Checkout":

a) Create POS Cart:
- Call into @oppsera/module-orders to create an order
- Map appointment items to order line items:
  - Each service → line item (type: 'service', metadata: {appointmentId, providerId})
  - Each addon → line item
  - Package redemptions → line items with $0 price + package reference
- Pre-populate gratuity suggestions
- Allow adding retail items at checkout (cross-sell moment!)

b) Provider Attribution:
- Each line item gets provider_id for commission tracking
- Multi-provider appointments: split revenue per provider
- Store attribution in appointment_items

c) Checkout orchestration command: checkoutAppointment
- Validate appointment is in 'completed' or 'checked_out' status
- Create order via orders module internal API
- Link order_id back to appointment
- Transition to 'checked_out'
- Emit spa.checkout.completed.v1 with full order + appointment data

2. TIP HANDLING
- Gratuity suggestions: 15%, 18%, 20%, 25%, custom
- Tips allocated per provider (if multi-provider, distribute by revenue share)
- Tips stored via existing payments/tenders module
- Commission rules may include tip commission

3. PACKAGE REDEMPTION AT CHECKOUT
When customer has active package balance:
- At checkout, show "Apply Package" option
- Deduct session/credits from package balance
- Create redemption record in spa_package_redemptions
- Line item shows full price crossed out with "Package" label
- Remaining balance shown to customer
- If partial package: can combine package + payment

4. MEMBERSHIP PRICING
When customer has active membership:
- Auto-detect membership via customer module integration
- Apply member_price instead of regular price
- Show "Member Discount" label
- Some memberships include N services per month:
  - Check membership privileges for included services
  - If included: $0 line item with membership reference
  - If exceeded: charge member_price

5. RETAIL ATTACHMENT (Cross-sell)
The checkout screen should prominently suggest retail products:
- Based on the service performed (e.g., facial → suggest skincare line)
- AI recommendation engine (future, stub the interface now):
  getRetailRecommendations(serviceId, customerId): Promise<CatalogItem[]>
- Staff can quick-add retail items from catalog
- Track retail attachment rate as a KPI

6. CHECKOUT UI ENHANCEMENTS
- Add a "Spa Checkout" button on the appointment detail flyout
- Opens POS in "spa checkout" mode:
  - Pre-populated with appointment services
  - Retail cross-sell panel
  - Package/membership auto-detection
  - Tip selection
  - Rebooking prompt after payment

7. REBOOKING PROMPT
After successful payment:
- Prompt: "Would you like to rebook?"
- Show suggested next appointment date (service-type based: 
  massage=4wks, facial=6wks, etc., configurable per service)
- One-click rebook with same provider/time preference
- Track rebooking rate

8. GL POSTING INTEGRATION
Create a spa-posting-adapter in accounting module:
- Subscribe to spa.checkout.completed.v1
- Post GL entries for:
  - Service Revenue (by service category → sub-department mapping)
  - Package Redemption (deferred revenue → earned revenue)
  - Membership Included Service (deferred revenue → earned revenue)
  - Commission Accrual (expense → liability)
- Follow the never-throw pattern of existing adapters

9. INVENTORY CONSUMPTION TRIGGER
When appointment completes, emit event data needed for inventory BOM:
- Each service has a "bill of materials" (products consumed during treatment)
- This will be built fully in Session 10, but wire the event now

10. TESTS (30+ tests)
- Checkout creates correct order line items
- Package redemption reduces balance correctly
- Membership pricing applied correctly
- Tip distribution for multi-provider
- GL posting triggers correctly
- Retail attachment tracking

DELIVERABLES:
- Checkout orchestration command connecting Spa → POS → Payments → Accounting
- Package redemption flow
- Membership pricing integration
- Retail cross-sell stub
- Rebooking prompt logic
- GL posting adapter
- Checkout UI in appointment flyout
```

---

## Session 8: Commissions & Provider Payroll

### Prompt for Claude

```
CONTEXT: OppsEra Spa Module — Session 8 of 16.
Feed CLAUDE.md and CONVENTIONS.md.

TASK: Build the commission calculation engine and provider payroll support.
Spa staff compensation is complex — this must handle all commission structures.

REQUIREMENTS:

1. COMMISSION RULES ENGINE (src/helpers/commission-engine.ts)

Support these commission types:
a) Percentage of service revenue (e.g., 40% of massage revenue)
b) Flat per-service (e.g., $25 per facial)
c) Tiered percentage (e.g., 40% up to $5K/month, 45% above $5K)
d) Sliding scale (e.g., based on utilization %)
e) Retail commission (separate rate for product sales)
f) Addon commission (rate for upsold add-ons)
g) Tip commission (optional, some structures include tip sharing)

Rule resolution priority:
1. Provider-specific + service-specific rule
2. Provider-specific + service-category rule
3. Provider-specific default rule
4. Service-specific default rule
5. Service-category default rule
6. Global default rule

calculateCommission(params):
- Resolve applicable rule
- Calculate commission amount
- Handle minimum guarantees
- Handle commission caps
- Return: { ruleId, rateApplied, baseAmount, commissionAmount, type }

2. COMMISSION COMMANDS

- createCommissionRule
- updateCommissionRule
- deactivateCommissionRule
- calculateAppointmentCommissions — runs at checkout, creates ledger entries
- approveCommissions — manager approval for a pay period
- bulkApproveCommissions — approve all for a provider/period
- adjustCommission — manual adjustment with reason
- voidCommission — void if appointment voided/refunded
- generatePayrollExport — CSV/XLSX export of commissions for payroll

3. COMMISSION QUERIES

- listCommissionRules — by provider, service, type
- getCommissionRule
- getProviderCommissions — for a provider + date range, with totals
- getCommissionSummary — aggregate by provider for pay period
- getCommissionLedger — full ledger with filters
- getPayrollReport — formatted for payroll export

4. COMMISSION EVENT CONSUMER
Subscribe to spa.checkout.completed.v1:
- For each appointment item in the checkout
- Resolve commission rule
- Calculate commission
- Insert into spa_commission_ledger
- Emit spa.commission.calculated.v1

5. PROVIDER PERFORMANCE DASHBOARD
Queries:
- getProviderPerformance — for a provider + date range:
  - Total revenue generated
  - Total commissions earned
  - Number of appointments
  - Average ticket value
  - Utilization % (booked hours / available hours)
  - Retail attachment rate
  - Rebooking rate
  - No-show rate
  - Top services performed
  - Revenue per available hour

- getProviderRanking — rank all providers by a metric
- getProviderProductivity — hours utilized / hours available by day/week

6. PROVIDER DASHBOARD UI
Add to provider detail page:
- Performance KPIs (cards)
- Revenue chart (line, by day/week/month)
- Commission earnings chart
- Service mix breakdown (donut)
- Comparison to team average

7. COMMISSION MANAGEMENT UI
- /spa/commissions page
- Period selector (week/bi-weekly/monthly)
- Provider list with totals
- Expandable rows showing individual commission line items
- Approve/adjust actions
- Export button for payroll
- Status filter: calculated, approved, paid, adjusted

8. API ROUTES
- /spa/commissions/rules — GET, POST
- /spa/commissions/rules/[id] — GET, PATCH, DELETE
- /spa/commissions — GET (ledger)
- /spa/commissions/summary — GET ?period=xxx
- /spa/commissions/approve — POST
- /spa/commissions/adjust — POST
- /spa/commissions/export — GET (CSV/XLSX)
- /spa/providers/[id]/performance — GET
- /spa/providers/ranking — GET
- /spa/providers/productivity — GET

9. GL INTEGRATION
Commission calculated → accounting module:
- Dr: Commission Expense (by provider/department)
- Cr: Commissions Payable (liability)
When paid: 
- Dr: Commissions Payable
- Cr: Cash/Bank

10. TESTS (40+ tests)
- Commission rule resolution (priority chain)
- Each commission type calculation
- Tiered commission breakpoints
- Multi-rule scenario
- Payroll export format
- Provider performance calculations

DELIVERABLES:
- Commission engine with all commission types
- Commission management commands/queries/routes
- Provider performance analytics
- Commission UI + Provider dashboard
- GL integration
- Payroll export
- Tests
```

---

## Session 9: Packages, Memberships & Deferred Revenue

### Prompt for Claude

```
CONTEXT: OppsEra Spa Module — Session 9 of 16.
Feed CLAUDE.md and CONVENTIONS.md.

TASK: Build the package/session bundle system and integrate with existing 
membership module for deferred revenue accounting.

REQUIREMENTS:

1. SPA PACKAGES (Built on spa_package_definitions + spa_package_balances)

Package Types:
a) Session Bundle — "10 massages for the price of 8"
b) Credit Bundle — "$500 credit for $400" (value-based)
c) Time Bundle — "10 hours of any service"
d) Value Bundle — fixed set of specific services

Commands:
- createPackageDefinition — define package terms
- updatePackageDefinition
- archivePackageDefinition
- purchasePackage — customer buys package:
  - Create balance record
  - Process payment via POS/payments
  - Post deferred revenue GL entry (Dr Cash, Cr Deferred Revenue)
  - Emit spa.package.sold.v1
- redeemPackageSession — use 1 session from balance:
  - Decrement sessions_used or credits_used
  - Post revenue recognition GL (Dr Deferred Revenue, Cr Service Revenue)
  - Emit spa.package.redeemed.v1
- freezePackage — pause (with business rules: max freeze days, max freeze count)
- unfreezePackage — resume
- cancelPackage — refund remaining balance pro-rata
- expirePackages — batch job: expire packages past expiration_date
- transferPackage — transfer balance to another customer (if transferable)
- sharePackage — allow household member to use (if shareable)

Queries:
- listPackageDefinitions — active packages for sale
- getPackageDefinition
- getCustomerPackages — all packages for a customer with balances
- getPackageBalance — single balance with redemption history
- getPackageUsageReport — utilization across all packages
- getExpiringPackages — packages expiring within N days (for marketing)

2. MEMBERSHIP INTEGRATION (with @oppsera/module-customers membership system)

The customer module already has membership_plans + memberships.
Spa needs to:
- Define which services are included in each membership tier
- Define how many included services per period (month/year)
- Track included service usage

New table (or JSONB on membership_plans):
- spa_membership_privileges — (membership_plan_id, service_id or category,
  included_quantity INTEGER per period, period: 'month'|'year',
  member_price_override NUMERIC(12,2) nullable,
  addon_discount_percentage NUMERIC(5,2) nullable)

Commands:
- setMembershipSpaPrivileges — define what's included
- checkMembershipUsage — how many included services used this period
- recordMembershipServiceUsage — track when included service is consumed

Queries:
- getMembershipSpaPrivileges — for a plan
- getMemberUsageThisPeriod — remaining included services
- getMemberSavingsReport — how much the member saved vs non-member pricing

3. DEFERRED REVENUE ACCOUNTING
This is where OppsEra dominates competitors.

Package sold:
- Dr: Cash/AR (selling_price_cents)
- Cr: Deferred Revenue — Spa Packages (selling_price_cents)

Package session redeemed:
- Calculate per-session value: total_value / total_sessions
- Dr: Deferred Revenue — Spa Packages (per_session_value)
- Cr: Service Revenue — [Service Category] (per_session_value)

Package expired with unused sessions:
- Dr: Deferred Revenue — Spa Packages (remaining_value)
- Cr: Package Breakage Income (remaining_value)

Create spa-package-posting-adapter.ts in accounting module.

4. PACKAGE PURCHASE UI
- Package browsing page: /spa/packages (public-facing too)
- Package cards with pricing, savings %, included services
- Purchase flow integrated with POS
- Customer account shows package balances

5. PACKAGE MANAGEMENT UI (staff-facing)
- /spa/packages/manage — definitions CRUD
- /spa/packages/balances — customer balance lookup
- Freeze/cancel/transfer actions
- Expiring packages alert panel

6. BACKGROUND JOBS
- expirePackages — daily job to expire past-due packages + GL posting
- expiringPackagesNotification — notify customers N days before expiration

7. TESTS (35+ tests)
- Package purchase → GL deferred revenue
- Session redemption → balance decrement → GL recognition
- Package expiration → breakage income
- Freeze/unfreeze business rules
- Membership included service tracking
- Pro-rata cancellation refund calculation

DELIVERABLES:
- Complete package system (definitions, purchase, redeem, freeze, expire)
- Membership integration for included services
- Deferred revenue GL posting
- Package UI (browsing + management)
- Background jobs
- Tests
```

---

## Session 10: Inventory Consumption & Service BOM

### Prompt for Claude

```
CONTEXT: OppsEra Spa Module — Session 10 of 16.
Feed CLAUDE.md and CONVENTIONS.md.

TASK: Build the service "bill of materials" system — tracking which products 
are consumed during each treatment for accurate COGS and inventory management.

REQUIREMENTS:

1. SERVICE BOM (Bill of Materials)

New table: spa_service_bom (service_id, inventory_item_id,
  quantity_per_service NUMERIC(10,4), unit text, is_estimated boolean,
  waste_factor NUMERIC(5,2) default 0, notes text)

Example: A 60-min massage consumes:
- 30ml massage oil
- 2 hot towels (laundry tracked)
- 1 face cradle cover

Commands:
- setServiceBOM — bulk set/replace BOM for a service
- addBOMItem / removeBOMItem / updateBOMItem
- consumeServiceInventory — called when appointment completes:
  - For each service in appointment, look up BOM
  - Create inventory movements via @oppsera/module-inventory
  - Movement type: 'spa_consumption', reference: appointmentId
  - Apply waste factor
- adjustConsumption — manual override if actual usage differed
- getConsumptionReport — cost analysis

Queries:
- getServiceBOM — BOM for a service
- getServiceCost — calculated from BOM: SUM(qty * unit_cost) per service
- getConsumptionByService — total consumption for date range
- getConsumptionByProduct — which products consumed most
- getCOGSByService — cost of goods sold per service type

2. EVENT CONSUMER
Subscribe to spa.appointment.completed.v1:
- Look up appointment items → services → BOMs
- Create inventory consumption movements
- This uses the existing inventory module's commands

3. COST ANALYSIS
New queries for enterprise operators:
- getServiceProfitability — revenue - COGS - commission = profit per service
- getServiceMarginReport — margin % by service, sorted
- getCostTrend — COGS trend over time (detect waste increases)
- getInventoryForecast — based on appointment bookings, predict inventory needs

4. UI ADDITIONS
- BOM editor on service detail page: table of products with quantities
- Product picker from inventory catalog
- Cost summary card on service detail
- Profitability report under /spa/reports

5. TESTS (20+ tests)
- BOM consumption creates correct inventory movements
- Cost calculation with waste factor
- Multi-service appointment consumption
- Profitability calculation
- Forecast accuracy

DELIVERABLES:
- Service BOM system
- Automatic inventory consumption on appointment completion
- Cost analysis queries
- BOM editor UI
- Profitability reports
- Tests
```

---

## Session 11: Intake Forms, Consent & Clinical Notes

### Prompt for Claude

```
CONTEXT: OppsEra Spa Module — Session 11 of 16.
Feed CLAUDE.md and CONVENTIONS.md.

TASK: Build digital intake forms, consent management, and clinical notes 
for HIPAA-aware spa operations (especially med spas).

REQUIREMENTS:

1. FORM BUILDER (Using JSONB field definitions)

spa_intake_form_templates.fields JSONB structure:
[{
  id: string,
  type: 'text'|'textarea'|'select'|'multiselect'|'checkbox'|'radio'|
        'date'|'number'|'signature'|'heading'|'paragraph'|'file_upload',
  label: string,
  placeholder?: string,
  required: boolean,
  options?: string[] (for select/radio/checkbox),
  validation?: { min?, max?, pattern?, maxLength? },
  conditionalOn?: { fieldId: string, value: string } (show/hide logic),
  section?: string (group fields into sections)
}]

Commands:
- createFormTemplate — define form with field definitions
- updateFormTemplate — edit (creates new version)
- activateFormTemplate / deactivateFormTemplate
- submitFormResponse — customer completes form:
  - Validate required fields
  - Store responses
  - If consent form: capture signature + timestamp
  - Link to appointment if applicable
  - Emit spa.intake.completed.v1 or spa.consent.signed.v1
- deleteFormResponse — GDPR compliance

Queries:
- listFormTemplates — by type, active status
- getFormTemplate — with all fields
- getCustomerForms — all completed forms for a customer
- getAppointmentForms — forms linked to an appointment
- checkFormCompleteness — for an appointment, are all required forms done?

2. CLINICAL NOTES (SOAP)

Commands:
- createClinicalNote — provider writes treatment notes
- updateClinicalNote — edit within time window
- lockClinicalNote — prevent further edits (after review period)

Queries:
- getCustomerClinicalHistory — all notes for a customer, chronological
- getAppointmentNotes — notes for a specific appointment
- searchClinicalNotes — text search across notes (provider access only)

3. CONTRAINDICATION MANAGEMENT

Commands:
- addContraindication — flag a medical condition
- updateContraindication
- resolveContraindication — mark as no longer applicable

Alert system:
- When booking a service, check customer's active contraindications
- If match: show warning to staff, block online booking if severe
- getContraindicationAlerts(customerId, serviceId): Alert[]

4. INTAKE FORM UI
- Form template builder (drag-and-drop field ordering)
- Form preview
- Customer-facing form renderer (works in booking portal too)
- Digital signature capture
- PDF generation of completed forms (for records)
- Contraindication warning badges in appointment view

5. PRE-ARRIVAL WORKFLOW
- When appointment confirmed, check required forms
- If incomplete: send pre-arrival email/SMS with form link
- Customer completes on phone/tablet before arrival
- Status shows on appointment: "Forms Complete" ✓ or "Forms Pending" ⚠

6. API ROUTES
- /spa/forms/templates — GET, POST
- /spa/forms/templates/[id] — GET, PATCH, DELETE
- /spa/forms/responses — POST (submit)
- /spa/forms/responses/[id] — GET, DELETE
- /spa/forms/customer/[customerId] — GET (all forms)
- /spa/forms/appointment/[appointmentId] — GET (appointment forms)
- /spa/forms/check/[appointmentId] — GET (completeness check)
- /spa/notes — POST (create note)
- /spa/notes/[id] — GET, PATCH
- /spa/notes/customer/[customerId] — GET (history)
- /spa/contraindications — GET, POST
- /spa/contraindications/[id] — PATCH
- /spa/contraindications/check — GET ?customerId=xxx&serviceId=xxx

7. TESTS (25+ tests)
- Form template validation
- Response submission with required fields
- Signature capture
- Contraindication alert matching
- Completeness check logic
- Note lock timing

DELIVERABLES:
- Form template builder (JSONB-based)
- Form renderer for customers
- Clinical notes CRUD
- Contraindication alert system
- Pre-arrival workflow
- All routes, tests
```

---

## Session 12: Marketing Automation & Guest Engagement

### Prompt for Claude

```
CONTEXT: OppsEra Spa Module — Session 12 of 16.
Feed CLAUDE.md and CONVENTIONS.md.

TASK: Build the marketing automation hooks and guest engagement features.
Most spa software is weak here — this is our opportunity to differentiate.

REQUIREMENTS:

1. REBOOKING ENGINE (src/helpers/rebooking-engine.ts)
- Each service has a recommended rebooking interval (configurable):
  massage=28 days, facial=42 days, etc. (stored on spa_services)
- After checkout, calculate suggested next date
- Check provider availability for that date
- Present one-tap rebook option
- If customer doesn't rebook within window → trigger win-back

Commands:
- generateRebookSuggestion(appointmentId): { suggestedDate, provider, service }
- createRebookReminder — schedule reminder N days after visit if not rebooked
- processRebookReminders — batch job to check and trigger notifications

Queries:
- getRebookingOverdue — customers past their rebooking window
- getRebookingRate — by service, provider, time period

2. CAMPAIGN EVENT TRIGGERS
Define triggers that fire marketing events (consumed by marketing module or webhook):

Trigger Events:
- spa.marketing.rebook_due.v1 — client hasn't rebooked within window
- spa.marketing.win_back.v1 — client hasn't visited in N days (configurable: 60/90/120)
- spa.marketing.birthday.v1 — upcoming birthday (from customer profile)
- spa.marketing.membership_expiring.v1 — membership renewal reminder
- spa.marketing.package_expiring.v1 — package about to expire
- spa.marketing.no_show_follow_up.v1 — follow up after no-show
- spa.marketing.first_visit_follow_up.v1 — follow up after first appointment
- spa.marketing.review_request.v1 — request review after appointment
- spa.marketing.loyalty_milestone.v1 — hit a spending/visit milestone
- spa.marketing.treatment_anniversary.v1 — 1 year since first treatment

Commands:
- configureMarketingTriggers — enable/disable triggers, set timing
- processMarketingTriggers — batch job that evaluates all triggers

3. CUSTOMER TAG INTEGRATION
Leverage the existing Intelligent Tag System:
- Auto-tag customers based on spa activity:
  - "Spa Regular" — visits monthly
  - "Spa VIP" — high spend
  - "Spa At Risk" — declining visit frequency  
  - "Massage Lover" — primary service type
  - Service-specific tags auto-generated

Define spa smart tag templates in the tag system:
- Connect to the existing smart tag evaluator
- Use spa-specific metrics (visit frequency, avg ticket, service preferences)

4. LOYALTY INTEGRATION
Connect to customer wallet/loyalty system:
- Earn points on spa services
- Redeem points for spa services
- Bonus points for packages/memberships
- Birthday double points

5. REFERRAL TRACKING
- Generate referral codes per customer
- Track referrals: who referred whom
- Apply referral rewards (discount or credit)
- Referral leaderboard

6. REVIEW/FEEDBACK COLLECTION
After appointment:
- Auto-send review request (email/SMS) after N hours (configurable)
- Star rating + text feedback
- NPS question (How likely to recommend?)
- Store feedback linked to appointment + provider
- Aggregate into provider performance scores

Commands:
- requestFeedback
- submitFeedback
- processReviewRequests — batch job

Queries:
- getProviderReviews — ratings for a provider
- getServiceReviews — ratings for a service
- getNPSScore — overall NPS
- getFeedbackOverview — summary stats

7. UI ADDITIONS
- Marketing triggers configuration page in spa settings
- Rebooking overdue list (actionable — click to book for customer)
- Win-back list with last visit date + suggested action
- Feedback/review display on provider profile
- NPS dashboard card

8. API ROUTES
- /spa/marketing/triggers — GET, PATCH (configure)
- /spa/marketing/rebook-overdue — GET
- /spa/marketing/win-back — GET
- /spa/marketing/process — POST (manual trigger processing)
- /spa/feedback — POST (submit)
- /spa/feedback/request — POST (send request)
- /spa/feedback/provider/[id] — GET
- /spa/feedback/overview — GET

9. BACKGROUND JOBS
- processRebookReminders — daily
- processMarketingTriggers — daily  
- processReviewRequests — hourly (after appointments)
- processWinBack — weekly

DELIVERABLES:
- Rebooking engine with suggestions
- 10+ marketing event triggers
- Customer tag integration
- Feedback/review collection system
- All routes, background jobs
- Tests (25+)
```

---

## Session 13: Reporting, Analytics & AI Insights

### Prompt for Claude

```
CONTEXT: OppsEra Spa Module — Session 13 of 16.
Feed CLAUDE.md and CONVENTIONS.md.

TASK: Build the reporting layer with CQRS read models, spa-specific KPI dashboards,
and integrate with the Semantic AI layer for natural language insights.

REQUIREMENTS:

1. CQRS READ MODELS (4 read model tables)

rm_spa_daily_operations:
- tenant_id, location_id, business_date
- total_appointments, completed_appointments, canceled_appointments, no_shows
- total_revenue_cents, service_revenue_cents, retail_revenue_cents, 
  addon_revenue_cents, tip_total_cents
- total_commission_cents
- average_ticket_cents
- utilization_percentage (booked hours / available hours)
- rebooking_rate (% who rebooked same day)
- retail_attachment_rate (% of appointments with retail sale)
- new_clients, returning_clients

rm_spa_provider_metrics:
- tenant_id, location_id, provider_id, business_date
- appointments_count, completed_count, canceled_count, no_shows
- revenue_cents, commission_cents, tip_cents
- utilization_percentage, revenue_per_hour_cents
- average_ticket_cents, retail_attachment_rate
- rebooking_rate

rm_spa_service_metrics:
- tenant_id, location_id, service_id, business_date
- bookings_count, completed_count
- revenue_cents, cost_cents (from BOM), margin_cents
- average_duration_minutes, average_addon_count
- online_booking_percentage

rm_spa_client_metrics:
- tenant_id, customer_id, last_updated
- total_visits, total_spend_cents, average_ticket_cents
- last_visit_date, days_since_last_visit
- favorite_service_id, favorite_provider_id
- lifetime_value_cents, predicted_next_visit_date
- rebooking_rate, no_show_rate
- packages_purchased, active_package_count

2. EVENT CONSUMERS FOR READ MODELS
- handleSpaAppointmentCompleted → update daily_operations + provider_metrics
- handleSpaCheckoutCompleted → update service_metrics + client_metrics + revenue
- handleSpaAppointmentCanceled → update cancellation stats
- handleSpaAppointmentNoShow → update no-show stats

3. KEY REPORTS

Queries:
- getSpaDashboardMetrics — today's KPIs for dashboard
- getDailyOperationsReport — date range with daily breakdown
- getProviderPerformanceReport — all providers ranked by key metrics
- getServicePerformanceReport — all services with profitability
- getClientRetentionReport — cohort analysis, churn rate
- getRevenueBreakdown — by service category, addon, retail, tips
- getUtilizationReport — by provider, room, time slot (heatmap data)
- getDemandHeatmap — booking density by day-of-week × time-of-day
- getYieldAnalysis — revenue per time slot (for dynamic pricing)
- getCancellationAnalysis — reasons, rates, revenue impact
- getPackageUtilizationReport — package usage vs expiration risk
- getMembershipROIReport — member vs non-member comparison
- getRetailAttachmentReport — cross-sell success by service
- getOnlineBookingReport — conversion funnel, source breakdown
- getWaitlistConversionReport — waitlist → booking conversion

4. SPA REPORTS UI (/spa/reports)
Code-split page with tabs:
- Overview — daily KPI cards + trend charts
- Revenue — breakdown chart + table
- Providers — performance ranking + drill-down
- Services — profitability table + margin chart
- Clients — retention cohort + top clients
- Utilization — heatmap + capacity chart
- Marketing — rebooking rate + win-back + NPS

Use Recharts for charts (already in the project).
Date range picker + location filter + compare period toggle.

5. SEMANTIC AI INTEGRATION
Register spa tables in the semantic layer so the AI can answer:
- "What was our spa revenue last month?"
- "Which provider has the highest rebooking rate?"
- "What's our most profitable massage?"
- "Show me spa utilization for this week"

Add spa schema tables to the semantic registry catalog builder.
Define spa-specific field catalog entries for the custom report builder.

6. SCHEDULED REPORTS
- Daily operations summary (email to managers)
- Weekly provider performance
- Monthly P&L by service category
- Package expiration alerts

(Build the scheduling infrastructure; actual email delivery can be stubbed.)

7. API ROUTES
- /spa/reports/dashboard — GET
- /spa/reports/daily-operations — GET + CSV export
- /spa/reports/providers — GET + CSV export
- /spa/reports/services — GET + CSV export
- /spa/reports/clients — GET + CSV export
- /spa/reports/utilization — GET
- /spa/reports/demand-heatmap — GET
- /spa/reports/revenue — GET
- /spa/reports/cancellations — GET
- /spa/reports/packages — GET
- /spa/reports/marketing — GET

DELIVERABLES:
- 4 CQRS read model tables with migration
- Event consumers to populate read models
- 15+ report queries
- Reports UI with 7 tabs
- Semantic AI integration
- Tests (30+)
```

---

## Session 14: Operations & Workflow Automation

### Prompt for Claude

```
CONTEXT: OppsEra Spa Module — Session 14 of 16.
Feed CLAUDE.md and CONVENTIONS.md.

TASK: Build the operational workflow layer — room turnover, daily checklists,
task management, and quality assurance.

REQUIREMENTS:

1. ROOM TURNOVER WORKFLOW
When appointment ends:
- Auto-create turnover task for the room
- Assign to housekeeping/attendant
- Checklist items (configurable per room):
  [ ] Strip linens
  [ ] Sanitize surfaces
  [ ] Restock supplies
  [ ] Set temperature
  [ ] Prepare for next service type
  [ ] Final inspection
- Track time-to-ready (KPI)
- Alert if room not ready before next appointment

2. DAILY OPERATIONS
Opening checklist:
  [ ] Turn on equipment
  [ ] Check room temperatures
  [ ] Verify supply stock
  [ ] Review day's schedule
  [ ] Confirm provider arrivals
  [ ] Test music/ambiance
  [ ] Set retail displays

Closing checklist:
  [ ] All rooms cleaned
  [ ] Equipment powered off
  [ ] Cash drawer reconciled
  [ ] End-of-day report reviewed
  [ ] Doors locked

Commands:
- startDayOperations / completeDayOperations
- completeChecklistItem
- reportIncident

3. PROVIDER PREP TASKS
Before each appointment, auto-generate prep tasks:
- Review client notes/preferences
- Check contraindications
- Prepare products (from BOM)
- Set room temperature/lighting preference
- Check for special requests

4. EQUIPMENT MAINTENANCE (Simple V1)
- Track equipment service dates
- Alert when maintenance due
- Log maintenance performed

5. UI ADDITIONS
- /spa/operations page: today's task board
- Kanban-style view: Pending → In Progress → Done
- Room status overview (ready/occupied/cleaning)
- Incident log

DELIVERABLES:
- Room turnover automation
- Daily opening/closing checklists
- Provider prep task generation
- Equipment maintenance tracking
- Operations UI
- Tests (20+)
```

---

## Session 15: Multi-Location & Enterprise Features

### Prompt for Claude

```
CONTEXT: OppsEra Spa Module — Session 15 of 16.
Feed CLAUDE.md and CONVENTIONS.md.

TASK: Build enterprise features for multi-location spa chains and franchises.

REQUIREMENTS:

1. MULTI-LOCATION MANAGEMENT
- Cross-location service catalog with location overrides (pricing, availability)
- Cross-location client profiles (shared customer records)
- Cross-location package redemption (use at any location)
- Cross-location gift cards
- Location-specific booking widgets with different configs

2. CONSOLIDATED REPORTING
- Multi-location dashboard: side-by-side comparison
- Rollup metrics across all locations
- Benchmark analytics: compare location performance
- Best practices identification (which location does what best)

3. DYNAMIC PRICING / YIELD MANAGEMENT
- Peak vs off-peak pricing (time-of-day, day-of-week)
- Demand-based price adjustments
- Last-minute discount slots
- Premium pricing for popular providers
- Holiday/event pricing rules

Commands:
- createPricingRule — define pricing conditions + adjustments
- evaluatePrice — given service + datetime + customer → final price

4. FRANCHISE SUPPORT (Light V1)
- Corporate-controlled service catalog (standard menu)
- Location-level customization within guardrails
- Franchise fee tracking (percentage of revenue)
- Corporate KPI dashboards

5. API + UI ADDITIONS
- /spa/enterprise page (gated by enterprise_mode)
- Multi-location selector throughout spa UI
- Consolidated reports
- Pricing rules manager
- Benchmark dashboard

DELIVERABLES:
- Multi-location features
- Dynamic pricing engine
- Consolidated reporting
- Franchise support
- Enterprise UI
- Tests (25+)
```

---

## Session 16: Testing, Polish & Production Readiness

### Prompt for Claude

```
CONTEXT: OppsEra Spa Module — Session 16 of 16 (FINAL).
Feed CLAUDE.md and CONVENTIONS.md.

TASK: Comprehensive testing, edge case handling, performance optimization,
and production readiness validation.

REQUIREMENTS:

1. TEST COVERAGE TARGET: 300+ tests across all domains
Fill gaps in test coverage:
- Appointment state machine edge cases
- Commission calculation edge cases
- Package expiration/freeze/transfer combinations
- Calendar conflict detection stress tests
- Availability engine with complex schedules
- GL posting accuracy validation
- Multi-location data isolation
- Permission enforcement for all routes
- Idempotency for all write operations
- Error handling for all failure paths

2. PERFORMANCE OPTIMIZATION
- Calendar query optimization (the most-hit endpoint):
  - Covering indexes for date range + provider + status
  - Consider materialized view for calendar data
- Availability engine caching:
  - Cache provider schedules (invalidate on change)
  - Cache resource availability (short TTL)
- Booking widget API:
  - Rate limiting
  - Response caching with short TTL for availability

3. SEED DATA
Create spa seed data (add to packages/db/src/seed.ts):
- 5 service categories, 15 services, 8 addons
- 6 providers with availability schedules
- 4 rooms, 3 equipment resources
- 2 package definitions
- 3 commission rules
- 50 sample appointments across various statuses
- Intake form templates (general intake, consent, medical history)

4. ONBOARDING INTEGRATION
Update tenant onboarding wizard:
- If business_type includes 'spa' or user enables spa module:
  - Bootstrap default spa settings
  - Create default service categories
  - Create default intake form templates
  - Create default commission rules
  - Set up default cancellation/deposit policies

5. DOCUMENTATION
Update CLAUDE.md with:
- Spa module entry in modules table
- Key spa architecture decisions
- Spa event types and cross-module flow
- Spa permission list

6. PRODUCTION CHECKLIST
Validate:
[ ] All tables have RLS policies
[ ] All routes have permission checks
[ ] All commands use publishWithOutbox
[ ] All queries use withTenant
[ ] No fire-and-forget DB operations
[ ] All financial calculations use integer cents
[ ] Idempotency on all write operations
[ ] Audit logging on all state changes
[ ] Error handling follows AppError pattern
[ ] No raw SQL without parameterization
[ ] Calendar loads < 2 seconds
[ ] Booking widget loads < 1 second
[ ] Build passes with no type errors
[ ] All tests pass

DELIVERABLES:
- 300+ tests passing
- Seed data for spa
- Onboarding integration
- CLAUDE.md updated
- Performance validated
- Production readiness confirmed
```

---

## Appendix A: Complete Schema Reference

All table names with column counts for reference during builds:

| Table | Columns | Key Relationships |
|-------|---------|-------------------|
| spa_settings | ~20 | tenants |
| spa_services | ~30 | spa_service_categories, catalog_items |
| spa_service_categories | ~7 | self-referential |
| spa_service_addons | ~8 | — |
| spa_service_addon_links | ~5 | spa_services, spa_service_addons |
| spa_providers | ~18 | users (staff) |
| spa_provider_availability | ~9 | spa_providers, locations |
| spa_provider_time_off | ~10 | spa_providers |
| spa_provider_service_eligibility | ~6 | spa_providers, spa_services |
| spa_resources | ~12 | locations |
| spa_service_resource_requirements | ~6 | spa_services, spa_resources |
| spa_appointments | ~35 | customers, spa_providers, spa_resources, orders |
| spa_appointment_items | ~15 | spa_appointments, spa_services, spa_service_addons |
| spa_appointment_history | ~8 | spa_appointments |
| spa_waitlist | ~13 | customers, spa_services, spa_providers |
| spa_intake_form_templates | ~10 | — |
| spa_intake_responses | ~9 | spa_intake_form_templates, customers |
| spa_clinical_notes | ~12 | spa_appointments, spa_providers, customers |
| spa_contraindications | ~9 | customers |
| spa_commission_rules | ~14 | spa_providers, spa_services |
| spa_commission_ledger | ~16 | spa_providers, spa_appointments, orders |
| spa_package_definitions | ~18 | — |
| spa_package_balances | ~14 | customers, spa_package_definitions, orders |
| spa_package_redemptions | ~9 | spa_package_balances, spa_appointments |
| spa_service_bom | ~7 | spa_services, inventory_items |
| spa_room_turnover_tasks | ~11 | spa_resources, spa_appointments |
| spa_daily_operations | ~10 | locations |
| spa_booking_widget_config | ~20 | locations |
| spa_membership_privileges | ~7 | membership_plans, spa_services |
| spa_pricing_rules | ~12 | spa_services, locations |
| spa_feedback | ~12 | spa_appointments, customers, spa_providers |
| spa_idempotency_keys | ~5 | — |
| spa_outbox | ~6 | — |
| rm_spa_daily_operations | ~15 | — (read model) |
| rm_spa_provider_metrics | ~14 | — (read model) |
| rm_spa_service_metrics | ~12 | — (read model) |
| rm_spa_client_metrics | ~14 | — (read model) |

**Total: ~37 spa-owned tables + 4 read models = 41 tables**

---

## Appendix B: Event Catalog

| Event | Emitter | Consumers |
|-------|---------|-----------|
| spa.appointment.created.v1 | createAppointment | customers (visit intent), payments (deposit) |
| spa.appointment.confirmed.v1 | confirmAppointment | notifications |
| spa.appointment.checked_in.v1 | checkInAppointment | operations (room prep) |
| spa.appointment.completed.v1 | completeAppointment | inventory (BOM consumption), reporting |
| spa.appointment.canceled.v1 | cancelAppointment | waitlist (offer slot), customers, payments (refund) |
| spa.appointment.no_show.v1 | markNoShow | customers, payments (no-show fee) |
| spa.appointment.rescheduled.v1 | rescheduleAppointment | notifications |
| spa.checkout.ready.v1 | checkoutAppointment | POS (cart creation) |
| spa.checkout.completed.v1 | POS checkout flow | accounting (GL), commissions, reporting |
| spa.commission.calculated.v1 | commission engine | accounting (GL) |
| spa.package.sold.v1 | purchasePackage | accounting (deferred revenue) |
| spa.package.redeemed.v1 | redeemPackageSession | accounting (revenue recognition) |
| spa.package.expired.v1 | expirePackages job | accounting (breakage income) |
| spa.waitlist.offered.v1 | waitlist matcher | notifications |
| spa.intake.completed.v1 | submitFormResponse | appointment (update form status) |
| spa.marketing.*.v1 | trigger processor | marketing module / notifications |

---

## Appendix C: Permission Matrix

| Permission | Owner | Manager | Supervisor | Cashier | Server | Staff |
|------------|-------|---------|------------|---------|--------|-------|
| spa.view | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| spa.manage | ✓ | ✓ | — | — | — | — |
| spa.appointments.view | ✓ | ✓ | ✓ | ✓ | — | ✓ |
| spa.appointments.create | ✓ | ✓ | ✓ | ✓ | — | — |
| spa.appointments.manage | ✓ | ✓ | ✓ | — | — | — |
| spa.services.view | ✓ | ✓ | ✓ | ✓ | — | ✓ |
| spa.services.manage | ✓ | ✓ | — | — | — | — |
| spa.providers.view | ✓ | ✓ | ✓ | ✓ | — | ✓ |
| spa.providers.manage | ✓ | ✓ | — | — | — | — |
| spa.resources.view | ✓ | ✓ | ✓ | ✓ | — | ✓ |
| spa.resources.manage | ✓ | ✓ | — | — | — | — |
| spa.commissions.view | ✓ | ✓ | ✓ | — | — | — |
| spa.commissions.manage | ✓ | ✓ | — | — | — | — |
| spa.commissions.approve | ✓ | ✓ | — | — | — | — |
| spa.packages.view | ✓ | ✓ | ✓ | ✓ | — | ✓ |
| spa.packages.manage | ✓ | ✓ | — | — | — | — |
| spa.reports.view | ✓ | ✓ | ✓ | — | — | — |
| spa.reports.export | ✓ | ✓ | — | — | — | — |
| spa.intake.view | ✓ | ✓ | ✓ | — | — | ✓ |
| spa.intake.manage | ✓ | ✓ | ✓ | — | — | — |
| spa.operations.view | ✓ | ✓ | ✓ | — | — | ✓ |
| spa.operations.manage | ✓ | ✓ | ✓ | — | — | — |
| spa.settings.view | ✓ | ✓ | — | — | — | — |
| spa.settings.manage | ✓ | ✓ | — | — | — | — |
| spa.online_booking.manage | ✓ | ✓ | — | — | — | — |

---

## Appendix D: Integration Map

```
┌─────────────────────────────────────────────────────────┐
│                    SPA MODULE                            │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────┐ │
│  │Scheduling│ │ Checkout │ │Packages  │ │ Marketing │ │
│  │ Engine   │ │Orchestr. │ │& Members │ │ Triggers  │ │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └─────┬─────┘ │
└───────┼─────────────┼────────────┼─────────────┼───────┘
        │             │            │             │
   ┌────▼────┐   ┌────▼────┐ ┌────▼────┐  ┌────▼────┐
   │Customers│   │  POS /  │ │Accounting│  │  Smart  │
   │  CRM    │   │ Orders  │ │   GL     │  │  Tags   │
   └─────────┘   └────┬────┘ └─────────┘  └─────────┘
                      │
                 ┌────▼────┐   ┌─────────┐   ┌─────────┐
                 │Payments │   │Inventory│   │   PMS   │
                 │Tenders  │   │  BOM    │   │ Folios  │
                 └─────────┘   └─────────┘   └─────────┘
                                              
   ┌─────────┐   ┌─────────┐
   │Semantic │   │Reporting│
   │   AI    │   │  CQRS   │
   └─────────┘   └─────────┘
```

---

## How to Use This Document

1. **Start a new Claude session for each numbered session (1-16)**
2. **Always feed CLAUDE.md and CONVENTIONS.md first** — this ensures Claude follows your project patterns
3. **Copy the entire prompt block** for the session you're building
4. **Review output**, then continue to next session
5. Sessions are designed to build on each other — complete them in order
6. Each session should be completable in 1-2 Claude conversations
7. Test and commit after each session before moving to the next

**Total estimated build**: 16 sessions × 1-2 conversations each = 16-32 Claude sessions

**Competitive result**: When complete, OppsEra Spa will have deeper ERP integration than any standalone spa software, matching Zenoti's feature breadth while surpassing it in accounting, inventory, and AI insights — capabilities that $1B Zenoti still doesn't offer natively.
