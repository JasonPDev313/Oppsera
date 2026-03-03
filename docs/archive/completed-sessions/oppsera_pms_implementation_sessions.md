# OppsEra PMS Module — Implementation Sessions

> **Purpose:** 18 sequential sessions for building a complete Property Management System (PMS) module inside OppsEra. Copy-paste each session into Claude Opus in order. Each session builds on the prior and produces working, production-grade code.
>
> **Architecture:** Calendar-first PMS with drag-and-drop reservation management, read-model powered grid, front desk workflows, housekeeping, folios, and guest profiles. Follows OppsEra's modular monolith patterns (Drizzle ORM, Next.js 15 App Router, transactional outbox events, RBAC).
>
> **Total sessions:** 18 (11 backend → 7 frontend/hardening)
> - Sessions 1–6: Database, domain types, core services, reservation CRUD, calendar move/resize
> - Sessions 7–8: Front desk workflows, housekeeping, folios
> - Sessions 9–11: Events, read model projectors, calendar API, permissions, background jobs, seed data
> - Sessions 12–17: Frontend — layout, calendar grid, drag-and-drop, reservation drawer, front desk UI, housekeeping/guests/folio views
> - Session 18: Hardening — audit, tests, performance validation, observability, security review

---

## Pre-Session Checklist

Before **every** session, attach these files to the Claude conversation:
1. `CONVENTIONS.md` — OppsEra project conventions (5000+ lines, critical)
2. `CLAUDE.md` — existing database schema (for reference on existing tables and patterns)

For **Sessions 1–11** (backend), also attach:
3. `oppsera_pms_db_schema_starter.md` — PMS schema reference
4. `oppsera_pms_reference_architecture.md` — architecture spec
5. `oppsera_pms_calendar_interaction_spec.md` — calendar UX contract

For **Sessions 12–18** (frontend + hardening), also attach:
3. `oppsera_pms_calendar_interaction_spec.md` — calendar UX contract (required)
4. `oppsera_pms_reference_architecture.md` — architecture spec (recommended)

---

## ALDC Requirements Coverage Matrix

| # | Requirement | Primary Session(s) | Notes |
|---|---|---|---|
| 1 | Domain events for all major lifecycle actions | S9 (events + projectors), S5–S8 (emit in commands) | Every command emits via `publishWithOutbox`; payloads defined in S9 |
| 2 | State machines with allowed transitions | S2 (define), S5–S8 (enforce) | `RESERVATION_TRANSITIONS`, `ROOM_STATUS_TRANSITIONS` with `assertTransition()` |
| 3 | Idempotency and concurrency control | S2 (types), S5–S6 (impl), S18 (test) | `idempotencyKey` on calendar ops; `version` optimistic locking on all res writes |
| 4 | Permission matrix table (actions × roles) | S2 (define), S11 (seed roles) | 5 roles × 28 permissions; encoded as `PMS_ROLE_PERMISSIONS` |
| 5 | Standardized API error contracts | S2 (error classes), S6 (doc table) | 7 PMS-specific error codes extending `AppError` |
| 6 | Migration and seed data strategy | S1 (migration), S11 (seed + strategy doc) | Single additive migration; idempotent seed; rollback = drop `pms_*` |
| 7 | Observability: logs, metrics, tracing | S18 (full), S9 (projector lag) | Structured logs, histograms, counters, correlation IDs, Sentry |
| 8 | Security and PII handling model | S4 (PII rules), S18 (security review) | Guest PII redacted in audit; permission-gated API responses |
| 9 | Responsive/mobile behavior requirements | S7 (doc), S13 (grid), S16 (tablet) | iPad-first for front desk; 44px touch targets; responsive panels |
| 10 | Background jobs and async processing | S8 (spec), S11 (implement) | Nightly charge posting, auto no-show, housekeeping auto-dirty |
| 11 | Bounded context relative to other modules | S4 (guest↔customer), S9 (events) | PMS owns rooms/stays/folios; integrates via events + internal APIs |
| 12 | Extension hooks for future modules | S4 (customerId), S8 (GL hook), S18 (doc) | `EXTENSION_HOOKS.md` covers OTA, payments, messaging, RMS, multi-property |
| 13 | Performance budgets and scalability | S10 (calendar perf), S18 (budgets table) | <300ms calendar, <500ms writes, <16ms drag frame, <2s projection lag |
| 14 | Acceptance criteria for each module | Every session | Each session ends with explicit checkbox-style acceptance criteria |
| 15 | Timezone and localization rules | S1 (DATE vs TIMESTAMPTZ), S3 (doc) | Property `timezone` governs display; DATEs are local; timestamps are UTC |

---

# SESSION 1 — Database Schema & Drizzle ORM Definitions

## Context

You are building a **Property Management System (PMS)** module for OppsEra. This is Session 1 of 18. You are creating the database foundation.

## Attached Files

- `CONVENTIONS.md` (project conventions — follow exactly)
- `CLAUDE.md` (existing DB schema — for reference on existing tables and patterns)
- `oppsera_pms_db_schema_starter.md` (PMS schema starter — use as primary reference)
- `oppsera_pms_reference_architecture.md` (architecture spec)

## Your Task

Create the complete database layer for the PMS module:

### 1. Migration File: `packages/db/migrations/NNNN_pms_module.sql`

Use the next available migration number based on existing migrations. Create ALL PMS tables in a single migration file. Follow these rules:

**Tables to create (in dependency order):**

1. `pms_properties` — property/hotel configuration
2. `pms_room_types` — room type definitions (bed config, occupancy)
3. `pms_rooms` — individual room units
4. `pms_rate_plans` — rate plan definitions
5. `pms_rate_plan_prices` — nightly rate prices per room type per date range
6. `pms_guests` — lightweight guest profiles
7. `pms_reservations` — core reservation records (source of truth)
8. `pms_room_blocks` — room occupancy blocks (overlap enforcement via exclusion constraint)
9. `pms_folios` — guest folios linked to reservations
10. `pms_folio_entries` — ledger-style folio charges/credits
11. `pms_room_status_log` — housekeeping status change audit trail
12. `pms_audit_log` — PMS-specific audit log
13. `pms_idempotency_keys` — idempotency for calendar operations
14. `pms_outbox` — domain event outbox
15. `rm_pms_calendar_segments` — calendar read model (one row per reservation-room-day)
16. `rm_pms_daily_occupancy` — occupancy dashboard read model

**Schema rules (from CONVENTIONS.md):**
- All column names in **snake_case** in Postgres
- Every tenant-scoped table has: `id TEXT PK DEFAULT gen_ulid()`, `tenant_id TEXT NOT NULL`, `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`
- Include `updated_at` where records are mutable
- Use `TEXT` for all IDs (ULIDs)
- Use `INTEGER` for monetary amounts (cents)
- Use `DATE` for stay dates (local property dates)
- Use `TIMESTAMPTZ` for timestamps
- Add appropriate foreign key constraints
- Add the exclusion constraint on `pms_room_blocks` using `btree_gist`:
  - `EXCLUDE USING gist (room_id WITH =, daterange(start_date, end_date, '[)') WITH &&) WHERE (block_type IN ('RESERVATION', 'MAINTENANCE', 'HOLD'))`
- Add `CHECK (check_out_date > check_in_date)` on reservations
- Add `version INTEGER NOT NULL DEFAULT 1` on reservations for optimistic locking
- Include `stay_range` as a generated column on reservations: `daterange(check_in_date, check_out_date, '[)')` STORED

**Indexes to include:**
- All foreign keys should be indexed
- Composite indexes for common query patterns (tenant_id + property_id + date ranges)
- The calendar read model needs: `(tenant_id, property_id, business_date)` and `UNIQUE (tenant_id, property_id, room_id, business_date)`
- The daily occupancy needs: `UNIQUE (tenant_id, property_id, business_date)`

**Important:** Enable `btree_gist` extension at the top of the migration if not already enabled.

### 2. Drizzle Schema: `packages/modules/pms/src/schema.ts`

Create the Drizzle ORM schema definitions for ALL tables. Follow these conventions:

```typescript
import { pgTable, text, integer, boolean, date, timestamp, jsonb, index, uniqueIndex, check } from 'drizzle-orm/pg-core';
import { generateUlid } from '@oppsera/shared';
import { tenants } from '@oppsera/db';
```

- Use `camelCase` for TypeScript property names
- Use `snake_case` strings for column mapping: `text('tenant_id')`
- Use `.$defaultFn(generateUlid)` for ID generation
- Use `.references(() => parentTable.id)` for foreign keys
- Export each table as a named constant
- Group related tables: split into `schema.ts` (core), `schema-rates.ts` (rates), `schema-folios.ts` (folios), `schema-read-models.ts` (read models) if the single file exceeds 400 lines

### 3. Package Setup: `packages/modules/pms/package.json`

```json
{
  "name": "@oppsera/module-pms",
  "version": "0.0.1",
  "private": true,
  "exports": {
    ".": "./src/index.ts",
    "./*": "./src/*.ts"
  },
  "dependencies": {
    "@oppsera/core": "workspace:*",
    "@oppsera/db": "workspace:*",
    "@oppsera/shared": "workspace:*",
    "drizzle-orm": "*",
    "zod": "*"
  }
}
```

Also create `tsconfig.json` extending the base config.

### 4. Module Index: `packages/modules/pms/src/index.ts`

Create the initial barrel export file (will be expanded in later sessions).

## Acceptance Criteria

- [ ] Migration file creates all 16 tables with correct constraints and indexes
- [ ] `btree_gist` extension is enabled
- [ ] Exclusion constraint on `pms_room_blocks` prevents overlapping blocks for the same room
- [ ] `pms_reservations` has `version` column and `check_out_date > check_in_date` CHECK constraint
- [ ] Calendar read model has unique constraint on `(tenant_id, property_id, room_id, business_date)`
- [ ] Drizzle schema matches the SQL migration exactly
- [ ] All tables follow OppsEra naming conventions (snake_case SQL, camelCase TypeScript)
- [ ] Package.json and tsconfig.json are correctly configured

## Do NOT do in this session

- Do not create any service logic, commands, or queries
- Do not create API routes
- Do not create frontend code
- Do not create seed data (that comes in Session 11)

---

# SESSION 2 — Domain Types, Enums, State Machines & Validation Schemas

## Context

You are building the PMS module for OppsEra. This is Session 2 of 18. Session 1 created the database schema and Drizzle ORM definitions. Now you are defining the domain types, state machines, and validation layer.

## Attached Files

- `CONVENTIONS.md`, `CLAUDE.md`
- `oppsera_pms_reference_architecture.md` (state machine definitions)
- `oppsera_pms_calendar_interaction_spec.md` (interaction constraints)

## Your Task

### 1. Domain Enums: `packages/modules/pms/src/types.ts`

Define TypeScript enums/constants for:

```typescript
// Reservation statuses
export const ReservationStatus = {
  HOLD: 'HOLD',
  CONFIRMED: 'CONFIRMED',
  CHECKED_IN: 'CHECKED_IN',
  CHECKED_OUT: 'CHECKED_OUT',
  CANCELLED: 'CANCELLED',
  NO_SHOW: 'NO_SHOW',
} as const;
export type ReservationStatus = (typeof ReservationStatus)[keyof typeof ReservationStatus];

// Room statuses
export const RoomStatus = { ... } as const; // VACANT_CLEAN, VACANT_DIRTY, OCCUPIED, OUT_OF_ORDER

// Room block types
export const BlockType = { ... } as const; // RESERVATION, MAINTENANCE, HOUSE_USE, HOLD

// Reservation source types
export const SourceType = { ... } as const; // DIRECT, PHONE, WALKIN, BOOKING_ENGINE, OTA

// Folio entry types
export const FolioEntryType = { ... } as const; // ROOM_CHARGE, TAX, FEE, ADJUSTMENT, PAYMENT, REFUND

// Folio statuses
export const FolioStatus = { ... } as const; // OPEN, CLOSED

// Calendar resize edge
export const ResizeEdge = { ... } as const; // LEFT, RIGHT
```

### 2. State Machines: `packages/modules/pms/src/state-machines.ts`

Implement explicit state machines with allowed transitions:

**Reservation State Machine:**
```
HOLD → CONFIRMED
HOLD → CANCELLED
CONFIRMED → CHECKED_IN
CONFIRMED → CANCELLED
CONFIRMED → NO_SHOW
CHECKED_IN → CHECKED_OUT
```

Implementation pattern:
```typescript
export const RESERVATION_TRANSITIONS: Record<ReservationStatus, ReservationStatus[]> = {
  HOLD: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['CHECKED_IN', 'CANCELLED', 'NO_SHOW'],
  CHECKED_IN: ['CHECKED_OUT'],
  CHECKED_OUT: [],
  CANCELLED: [],
  NO_SHOW: [],
};

export function canTransition(from: ReservationStatus, to: ReservationStatus): boolean { ... }
export function assertTransition(from: ReservationStatus, to: ReservationStatus): void { ... } // throws ConflictError
```

**Room Status State Machine:**
```
VACANT_CLEAN → OCCUPIED (check-in)
VACANT_CLEAN → VACANT_DIRTY (manual)
VACANT_CLEAN → OUT_OF_ORDER
VACANT_DIRTY → VACANT_CLEAN (cleaned)
VACANT_DIRTY → OUT_OF_ORDER
OCCUPIED → VACANT_DIRTY (check-out)
OCCUPIED → OUT_OF_ORDER (emergency)
OUT_OF_ORDER → VACANT_DIRTY (returned to service)
OUT_OF_ORDER → VACANT_CLEAN (returned cleaned)
```

Implement the same `canTransition` / `assertTransition` pattern.

**Define which reservation statuses are "active" (occupy rooms):**
```typescript
export const ACTIVE_RESERVATION_STATUSES: ReservationStatus[] = ['HOLD', 'CONFIRMED', 'CHECKED_IN'];
```

**Define which reservation statuses are "immovable" on the calendar:**
```typescript
export const IMMOVABLE_STATUSES: ReservationStatus[] = ['CANCELLED', 'NO_SHOW', 'CHECKED_OUT'];
```

### 3. PMS-Specific Error Codes: `packages/modules/pms/src/errors.ts`

Define PMS-specific error subclasses extending OppsEra's `AppError`:

```typescript
import { ConflictError, ValidationError } from '@oppsera/shared';

// Conflict errors (409)
export class RoomAlreadyBookedError extends ConflictError {
  constructor(roomId: string, startDate: string, endDate: string) {
    super(`Room ${roomId} is already booked for ${startDate}–${endDate}`, 'ROOM_ALREADY_BOOKED');
  }
}

export class RoomOutOfOrderError extends ConflictError { ... } // ROOM_OUT_OF_ORDER
export class InvalidStatusTransitionError extends ConflictError { ... } // INVALID_STATUS_TRANSITION
export class ConcurrencyConflictError extends ConflictError { ... } // CONCURRENCY_CONFLICT
export class ReservationNotMovableError extends ConflictError { ... } // RESERVATION_NOT_MOVABLE
export class FolioNotOpenError extends ConflictError { ... } // FOLIO_NOT_OPEN
```

### 4. Validation Schemas: `packages/modules/pms/src/validation.ts`

Create Zod schemas for all command inputs. Follow the OppsEra pattern: `safeParse()` in route handlers, throw `ValidationError` with field details.

```typescript
import { z } from 'zod';

// Property
export const createPropertySchema = z.object({
  name: z.string().min(1).max(200),
  timezone: z.string().min(1), // IANA timezone
  currency: z.string().length(3).default('USD'),
  addressJson: z.record(z.unknown()).optional(),
});
export type CreatePropertyInput = z.infer<typeof createPropertySchema>;

// Room Type
export const createRoomTypeSchema = z.object({
  propertyId: z.string().min(1),
  code: z.string().min(1).max(20),
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  maxAdults: z.number().int().min(1).default(2),
  maxChildren: z.number().int().min(0).default(0),
  maxOccupancy: z.number().int().min(1).default(2),
  bedsJson: z.array(z.object({ type: z.string(), count: z.number().int().min(1) })).optional(),
  amenitiesJson: z.array(z.string()).optional(),
});

// Room
export const createRoomSchema = z.object({ ... });
export const updateRoomStatusSchema = z.object({ ... });

// Rate Plan
export const createRatePlanSchema = z.object({ ... });
export const setRatePlanPriceSchema = z.object({ ... });

// Guest
export const createGuestSchema = z.object({ ... });
export const updateGuestSchema = z.object({ ... });

// Reservation
export const createReservationSchema = z.object({
  propertyId: z.string().min(1),
  guestId: z.string().optional(),
  primaryGuestJson: z.object({
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    email: z.string().email().optional(),
    phone: z.string().optional(),
  }),
  checkInDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  checkOutDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  adults: z.number().int().min(1).default(1),
  children: z.number().int().min(0).default(0),
  roomTypeId: z.string().min(1),
  roomId: z.string().optional(), // null = unassigned
  ratePlanId: z.string().min(1),
  nightlyRateCents: z.number().int().min(0),
  sourceType: z.enum(['DIRECT', 'PHONE', 'WALKIN', 'BOOKING_ENGINE', 'OTA']).default('DIRECT'),
  internalNotes: z.string().optional(),
  guestNotes: z.string().optional(),
}).refine(data => data.checkOutDate > data.checkInDate, {
  message: 'Check-out date must be after check-in date',
  path: ['checkOutDate'],
});
export type CreateReservationInput = z.infer<typeof createReservationSchema>;

// Calendar move
export const calendarMoveSchema = z.object({
  reservationId: z.string().min(1),
  from: z.object({
    roomId: z.string().min(1),
    checkInDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    checkOutDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    version: z.number().int().min(1),
  }),
  to: z.object({
    roomId: z.string().min(1),
    checkInDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }),
  idempotencyKey: z.string().min(1),
});

// Calendar resize
export const calendarResizeSchema = z.object({
  reservationId: z.string().min(1),
  edge: z.enum(['LEFT', 'RIGHT']),
  from: z.object({
    checkInDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    checkOutDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    roomId: z.string().min(1),
    version: z.number().int().min(1),
  }),
  to: z.object({
    checkInDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    checkOutDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  }),
  idempotencyKey: z.string().min(1),
});

// Check-in / Check-out
export const checkInSchema = z.object({
  roomId: z.string().min(1), // must assign room at check-in if not already
  version: z.number().int().min(1),
});

export const checkOutSchema = z.object({
  version: z.number().int().min(1),
});

// Housekeeping
export const updateRoomHousekeepingSchema = z.object({
  status: z.enum(['VACANT_CLEAN', 'VACANT_DIRTY', 'OCCUPIED', 'OUT_OF_ORDER']),
  reason: z.string().optional(), // required if OUT_OF_ORDER
});

// Folio
export const postFolioEntrySchema = z.object({
  entryType: z.enum(['ROOM_CHARGE', 'TAX', 'FEE', 'ADJUSTMENT', 'PAYMENT', 'REFUND']),
  description: z.string().min(1),
  amountCents: z.number().int(), // positive = charge, negative = credit
  sourceRef: z.string().optional(),
});
```

### 5. Event Type Constants: `packages/modules/pms/src/events/types.ts`

```typescript
export const PMS_EVENTS = {
  RESERVATION_CREATED: 'pms.reservation.created.v1',
  RESERVATION_UPDATED: 'pms.reservation.updated.v1',
  RESERVATION_MOVED: 'pms.reservation.moved.v1',
  RESERVATION_CANCELLED: 'pms.reservation.cancelled.v1',
  RESERVATION_CHECKED_IN: 'pms.reservation.checked_in.v1',
  RESERVATION_CHECKED_OUT: 'pms.reservation.checked_out.v1',
  RESERVATION_NO_SHOW: 'pms.reservation.no_show.v1',
  ROOM_STATUS_CHANGED: 'pms.room.status_changed.v1',
  ROOM_OUT_OF_ORDER_SET: 'pms.room.out_of_order_set.v1',
  ROOM_OUT_OF_ORDER_CLEARED: 'pms.room.out_of_order_cleared.v1',
  FOLIO_CREATED: 'pms.folio.created.v1',
  FOLIO_CHARGE_POSTED: 'pms.folio.charge_posted.v1',
  FOLIO_CLOSED: 'pms.folio.closed.v1',
} as const;
```

### 6. Permission Constants: `packages/modules/pms/src/permissions.ts`

Define the full RBAC permission matrix:

```typescript
export const PMS_PERMISSIONS = {
  // Property
  PROPERTY_VIEW: 'pms.property.view',
  PROPERTY_MANAGE: 'pms.property.manage',
  // Rooms
  ROOMS_VIEW: 'pms.rooms.view',
  ROOMS_MANAGE: 'pms.rooms.manage',
  // Reservations
  RESERVATIONS_VIEW: 'pms.reservations.view',
  RESERVATIONS_CREATE: 'pms.reservations.create',
  RESERVATIONS_EDIT: 'pms.reservations.edit',
  RESERVATIONS_CANCEL: 'pms.reservations.cancel',
  // Front Desk
  FRONT_DESK_CHECK_IN: 'pms.front_desk.check_in',
  FRONT_DESK_CHECK_OUT: 'pms.front_desk.check_out',
  FRONT_DESK_NO_SHOW: 'pms.front_desk.no_show',
  // Calendar
  CALENDAR_VIEW: 'pms.calendar.view',
  CALENDAR_MOVE: 'pms.calendar.move',
  CALENDAR_RESIZE: 'pms.calendar.resize',
  // Housekeeping
  HOUSEKEEPING_VIEW: 'pms.housekeeping.view',
  HOUSEKEEPING_MANAGE: 'pms.housekeeping.manage',
  // Guests
  GUESTS_VIEW: 'pms.guests.view',
  GUESTS_MANAGE: 'pms.guests.manage',
  // Folio
  FOLIO_VIEW: 'pms.folio.view',
  FOLIO_POST_CHARGES: 'pms.folio.post_charges',
  FOLIO_POST_PAYMENTS: 'pms.folio.post_payments',
  // Rates
  RATES_VIEW: 'pms.rates.view',
  RATES_MANAGE: 'pms.rates.manage',
} as const;
```

**Permission matrix (actions × roles):**

| Permission | GM/Admin | Front Desk | Housekeeping | Revenue Mgr | Read-Only |
|---|---|---|---|---|---|
| property.view | ✓ | ✓ | – | ✓ | ✓ |
| property.manage | ✓ | – | – | – | – |
| rooms.view | ✓ | ✓ | ✓ | ✓ | ✓ |
| rooms.manage | ✓ | – | – | – | – |
| reservations.view | ✓ | ✓ | – | ✓ | ✓ |
| reservations.create | ✓ | ✓ | – | ✓ | – |
| reservations.edit | ✓ | ✓ | – | ✓ | – |
| reservations.cancel | ✓ | ✓ | – | – | – |
| front_desk.check_in | ✓ | ✓ | – | – | – |
| front_desk.check_out | ✓ | ✓ | – | – | – |
| front_desk.no_show | ✓ | ✓ | – | – | – |
| calendar.view | ✓ | ✓ | – | ✓ | ✓ |
| calendar.move | ✓ | ✓ | – | – | – |
| calendar.resize | ✓ | ✓ | – | – | – |
| housekeeping.view | ✓ | ✓ | ✓ | – | ✓ |
| housekeeping.manage | ✓ | – | ✓ | – | – |
| guests.view | ✓ | ✓ | – | ✓ | ✓ |
| guests.manage | ✓ | ✓ | – | – | – |
| folio.view | ✓ | ✓ | – | ✓ | ✓ |
| folio.post_charges | ✓ | ✓ | – | – | – |
| folio.post_payments | ✓ | ✓ | – | – | – |
| rates.view | ✓ | – | – | ✓ | ✓ |
| rates.manage | ✓ | – | – | ✓ | – |

Encode this as a `PMS_ROLE_PERMISSIONS` constant.

## Acceptance Criteria

- [ ] All enum types are exhaustive and use `as const` pattern
- [ ] State machines define every valid transition; `assertTransition()` throws `InvalidStatusTransitionError`
- [ ] `ACTIVE_RESERVATION_STATUSES` and `IMMOVABLE_STATUSES` are correctly defined
- [ ] All PMS error classes extend `AppError` subclasses with unique error codes
- [ ] Zod schemas validate all inputs with appropriate constraints
- [ ] `createReservationSchema` enforces `checkOutDate > checkInDate`
- [ ] Calendar move/resize schemas include `idempotencyKey` and `version`
- [ ] Event type constants follow `pms.{entity}.{action}.v1` naming
- [ ] Permission matrix covers all 5 roles and all actions

## Do NOT do in this session

- Do not create service implementations
- Do not create API routes
- Do not create frontend code

---

# SESSION 3 — Property, Room Type & Room Services + API Routes

## Context

Session 3 of 18. Sessions 1–2 created the schema, types, state machines, and validation. Now you are building the property configuration services and their API routes.

## Attached Files

- `CONVENTIONS.md`, `CLAUDE.md`
- All three PMS spec files

## Your Task

### 1. Property Service Commands

Create in `packages/modules/pms/src/commands/`:

**`create-property.ts`**
- Receives `RequestContext` + `CreatePropertyInput`
- Uses `publishWithOutbox` pattern
- Validates timezone is valid IANA timezone
- Returns created property
- Emits `pms.property.created.v1` event

**`update-property.ts`**
- PATCH semantics (only update provided fields)
- Audit logs changes

### 2. Room Type Commands

**`create-room-type.ts`**
- Validates `propertyId` exists and belongs to tenant
- Validates `code` uniqueness within property
- Validates `maxOccupancy >= maxAdults` (logical constraint)

**`update-room-type.ts`**
- PATCH semantics
- Cannot change `code` if rooms exist using this type (or handle migration)

### 3. Room Commands

**`create-room.ts`**
- Validates `propertyId` and `roomTypeId` exist
- Validates `roomNumber` uniqueness within property
- Default status: `VACANT_CLEAN`

**`update-room.ts`**
- Cannot change `roomTypeId` if active reservations exist for this room

**`set-room-out-of-order.ts`**
- Sets `isOutOfOrder = true`, `status = OUT_OF_ORDER`
- Requires `reason`
- Creates room blocks for the OOO period (if date range provided) or indefinite
- Emits `pms.room.out_of_order_set.v1`
- Must check for conflicting reservations and return them as warnings (not auto-cancel in v1)

**`clear-room-out-of-order.ts`**
- Sets `isOutOfOrder = false`, `status = VACANT_DIRTY`
- Removes the OOO room block
- Emits `pms.room.out_of_order_cleared.v1`

### 4. Queries

Create in `packages/modules/pms/src/queries/`:

**`list-properties.ts`** — list properties for tenant (v1: typically 1)
**`get-property.ts`** — get single property by ID
**`list-room-types.ts`** — list room types for a property
**`get-room-type.ts`** — get single room type
**`list-rooms.ts`** — list rooms for a property, with optional filters (status, roomTypeId, isOutOfOrder)
**`get-room.ts`** — get single room with room type info

All queries must:
- Filter by `tenantId` (from `ctx.tenantId`)
- Support cursor-based pagination where applicable
- Return data directly (no service class wrapper needed — OppsEra uses function-per-operation)

### 5. API Routes

Create in `apps/web/src/app/api/v1/pms/`:

```
api/v1/pms/
├── properties/
│   ├── route.ts              # GET (list), POST (create)
│   └── [id]/
│       └── route.ts          # GET, PATCH
├── room-types/
│   ├── route.ts              # GET (list, ?propertyId=), POST
│   └── [id]/
│       └── route.ts          # GET, PATCH
├── rooms/
│   ├── route.ts              # GET (list, ?propertyId=&status=&roomTypeId=), POST
│   └── [id]/
│       ├── route.ts          # GET, PATCH
│       ├── out-of-order/
│       │   └── route.ts      # POST (set OOO), DELETE (clear OOO)
│       └── status/
│           └── route.ts      # POST (update housekeeping status)
```

Every route must:
- Use `withMiddleware` with appropriate `permission` and `entitlement: 'pms'`
- Parse and validate body with Zod `safeParse()` → throw `ValidationError` on failure
- Return `{ data: ... }` envelope
- Audit log state changes

**Example route pattern:**
```typescript
export const POST = withMiddleware(
  async (request, ctx) => {
    const body = await request.json();
    const parsed = createPropertySchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError('Validation failed', parsed.error.issues.map(i => ({ field: i.path.join('.'), message: i.message })));
    }
    const result = await createProperty(ctx, parsed.data);
    return NextResponse.json({ data: result }, { status: 201 });
  },
  { permission: PMS_PERMISSIONS.PROPERTY_MANAGE, entitlement: 'pms' },
);
```

### 6. Timezone & Localization Rules

- All `DATE` columns store **local property dates** (the date at the property, not UTC)
- All `TIMESTAMPTZ` columns store UTC timestamps
- The property's `timezone` field determines how to convert between them
- API responses include dates as `YYYY-MM-DD` strings and timestamps as ISO 8601 UTC
- The frontend converts timestamps to property-local display using the property timezone
- Document these rules in a comment block at the top of the property service

## Acceptance Criteria

- [ ] All commands use `publishWithOutbox` pattern
- [ ] All commands receive `RequestContext` as first argument
- [ ] Room number uniqueness is enforced within a property
- [ ] Room type code uniqueness is enforced within a property
- [ ] OOO set/clear updates both room status and room blocks
- [ ] All API routes use `withMiddleware` with correct permissions
- [ ] All routes validate input with Zod and return proper error envelopes
- [ ] Timezone handling rules are documented
- [ ] Queries support cursor-based pagination

---

# SESSION 4 — Rate Plan & Guest Services + API Routes

## Context

Session 4 of 18. Sessions 1–3 built the schema, types, and property/room infrastructure. Now you are building rate plans and guest profile management.

## Attached Files

- `CONVENTIONS.md`, `CLAUDE.md`
- PMS spec files

## Your Task

### 1. Rate Plan Commands

Create in `packages/modules/pms/src/commands/`:

**`create-rate-plan.ts`**
- Validates `propertyId` belongs to tenant
- Validates `code` uniqueness within property
- If `isDefault = true`, ensure no other default exists for the property (or unset the previous one)
- Emits `pms.rate_plan.created.v1`

**`update-rate-plan.ts`**
- PATCH semantics
- Handle `isDefault` toggle (at most one default per property)

**`set-rate-plan-prices.ts`**
- Upserts nightly rates for a rate plan × room type × date range
- Input: `{ ratePlanId, roomTypeId, startDate, endDate, nightlyBaseCents }`
- Validates date range (endDate > startDate)
- Handles overlapping date ranges: newest entry wins at query time (or replace/split existing ranges — pick a strategy and document it)

### 2. Rate Lookup Query

**`get-nightly-rate.ts`**
- Given `ratePlanId`, `roomTypeId`, `date` → returns applicable `nightlyBaseCents`
- Resolution: find the price row where `startDate <= date < endDate`
- If multiple overlapping rows exist, pick the one with the latest `createdAt`
- If no price found, return `null` (caller handles default/error)

**`get-rate-plan-prices.ts`**
- Lists all price rows for a rate plan, optionally filtered by room type and date range

### 3. Guest Commands

**`create-guest.ts`**
- Creates a `pms_guests` record
- If a reservation is being created simultaneously, the reservation command calls this internally
- Basic dedup: if `email` matches an existing guest for this property, return the existing one (soft match, not a hard constraint)

**`update-guest.ts`**
- PATCH semantics on guest profile

**`search-guests.ts`** (query)
- Search by `firstName`, `lastName`, `email`, or `phone`
- Use `ILIKE` for name search, exact match for email/phone
- Return paginated results with stay count from reservations

**`get-guest.ts`** (query)
- Get guest profile with stay history (last N reservations)

### 4. API Routes

```
api/v1/pms/
├── rate-plans/
│   ├── route.ts                  # GET (list, ?propertyId=), POST
│   └── [id]/
│       ├── route.ts              # GET, PATCH
│       └── prices/
│           └── route.ts          # GET (list prices), POST (set prices)
├── guests/
│   ├── route.ts                  # GET (search, ?q=&propertyId=), POST
│   └── [id]/
│       └── route.ts              # GET (profile + history), PATCH
```

### 5. Guest ↔ Customer Bounded Context

Document the boundary:
- PMS owns `pms_guests` as its own lightweight CRM for v1
- In v2, `pms_guests` can link to OppsEra's `customers` table via an optional `customerId` field
- Add `customer_id TEXT NULL` to `pms_guests` schema (nullable, not enforced in v1)
- The internal API pattern should expose `getPmsGuestReadApi()` for other modules to look up guest info if needed

### 6. PII Handling

- Guest `email`, `phone`, `firstName`, `lastName` are PII
- Document in the module: these fields must never be logged in plain text
- Audit log entries for guest changes should hash or omit PII values in the `diffJson`
- API responses should include PII only when the requesting user has `pms.guests.view` permission

## Acceptance Criteria

- [ ] Rate plan `isDefault` uniqueness is enforced (one default per property)
- [ ] Rate plan prices support date ranges and handle overlaps via "latest wins"
- [ ] `get-nightly-rate` resolves the correct price for a given date
- [ ] Guest search supports name (ILIKE), email, and phone lookup
- [ ] Guest creation has soft dedup on email
- [ ] Guest profile includes stay history
- [ ] PII handling rules are documented
- [ ] `customer_id` field exists on `pms_guests` as a v2 hook
- [ ] All routes use appropriate permissions and Zod validation

---

# SESSION 5 — Reservation Service (Core CRUD, State Machine, Overlap Prevention)

## Context

Session 5 of 18. This is the most critical backend session. You are building the reservation service — the core domain aggregate.

## Attached Files

- `CONVENTIONS.md`, `CLAUDE.md`
- All three PMS spec files (especially the architecture and calendar interaction specs)

## Your Task

### 1. Create Reservation Command: `commands/create-reservation.ts`

This is the most complex command. It must:

1. **Validate all references** (property, room type, rate plan, guest if provided, room if provided)
2. **Validate dates** (checkOutDate > checkInDate, both must be future or today for walk-ins)
3. **Validate occupancy** (adults + children <= room type maxOccupancy)
4. **Calculate totals:**
   - Count nights: `(checkOutDate - checkInDate)` in days
   - `subtotalCents = nights × nightlyRateCents`
   - `taxCents` = apply property tax rules (v1: simple flat percentage from property settings or zero)
   - `feeCents` = 0 (v1)
   - `totalCents = subtotalCents + taxCents + feeCents`
5. **Check availability** (if `roomId` is provided):
   - Query `pms_room_blocks` for overlapping blocks on this room
   - If overlap exists, throw `RoomAlreadyBookedError`
   - Check room is not OUT_OF_ORDER
6. **Create reservation** with status = `CONFIRMED` (or `HOLD` if explicitly requested)
7. **Create room block** (if room assigned):
   - Insert into `pms_room_blocks` with `blockType = 'RESERVATION'`
   - The exclusion constraint provides a DB-level safety net
8. **Create folio** (auto-create an OPEN folio for the reservation)
9. **Emit event** `pms.reservation.created.v1` with full payload
10. **Audit log** the creation

All of this happens inside a single `publishWithOutbox` transaction.

### 2. Update Reservation Command: `commands/update-reservation.ts`

PATCH semantics. Can update:
- `guestId`, `primaryGuestJson`
- `adults`, `children` (re-validate occupancy)
- `internalNotes`, `guestNotes`
- `nightlyRateCents` (recalculate totals)
- `ratePlanId`

**Cannot** update via this command: dates, room, or status (use dedicated commands).

Requires `version` for optimistic locking. Increments `version` on success.

### 3. Cancel Reservation Command: `commands/cancel-reservation.ts`

1. Validate current status allows transition to `CANCELLED`
2. Update status → `CANCELLED`
3. **Remove room block** (if room was assigned)
4. **Close folio** (if open, post any cancellation fees if applicable — v1 can skip fees)
5. Emit `pms.reservation.cancelled.v1`
6. Increment version

### 4. No-Show Command: `commands/mark-no-show.ts`

1. Validate status is `CONFIRMED`
2. Validate the check-in date has passed (or is today + past a configurable threshold hour)
3. Update status → `NO_SHOW`
4. Remove room block
5. Close folio
6. Emit `pms.reservation.no_show.v1`

### 5. Availability Service: `commands/check-availability.ts`

Expose a reusable function (not a command, a helper):

```typescript
export async function checkRoomAvailability(
  tx: Transaction,
  tenantId: string,
  roomId: string,
  startDate: string,  // YYYY-MM-DD
  endDate: string,    // YYYY-MM-DD (exclusive)
  excludeReservationId?: string,  // for moves/resizes
): Promise<{ available: boolean; conflicts: Array<{ reservationId: string; startDate: string; endDate: string }> }>
```

Query `pms_room_blocks` using daterange overlap check:
```sql
SELECT * FROM pms_room_blocks
WHERE tenant_id = $1
  AND room_id = $2
  AND daterange(start_date, end_date, '[)') && daterange($3, $4, '[)')
  AND ($5 IS NULL OR reservation_id != $5)
```

Also:
```typescript
export async function checkRoomNotOutOfOrder(
  tx: Transaction,
  tenantId: string,
  roomId: string,
): Promise<void>  // throws RoomOutOfOrderError if OOO
```

### 6. Suggest Available Rooms: `queries/suggest-rooms.ts`

Given a date range and room type, suggest available rooms:
```typescript
export async function suggestAvailableRooms(
  ctx: RequestContext,
  propertyId: string,
  roomTypeId: string,
  checkInDate: string,
  checkOutDate: string,
  limit?: number,
): Promise<Array<{ roomId: string; roomNumber: string; floor: string | null }>>
```

Find all rooms of the type that have NO overlapping blocks in the date range.

### 7. Reservation Queries

**`list-reservations.ts`**
- Filter by: `propertyId`, `status`, `checkInDate` range, `guestId`, `roomId`
- Sort by: `checkInDate` (default), `createdAt`
- Cursor-based pagination
- Include guest snapshot and room info

**`get-reservation.ts`**
- Full reservation detail with guest, room, room type, rate plan, folio summary

### 8. Concurrency Control

Document and implement:
- Every reservation write checks `WHERE version = $expectedVersion`
- If 0 rows updated → throw `ConcurrencyConflictError`
- Version increments on every successful write
- Pattern:

```typescript
const [updated] = await tx
  .update(pmsReservations)
  .set({ ...changes, version: sql`version + 1`, updatedAt: new Date() })
  .where(
    and(
      eq(pmsReservations.id, reservationId),
      eq(pmsReservations.tenantId, ctx.tenantId),
      eq(pmsReservations.version, expectedVersion),
    )
  )
  .returning();

if (!updated) {
  throw new ConcurrencyConflictError(reservationId);
}
```

## Acceptance Criteria

- [ ] Create reservation validates all references, occupancy, and dates
- [ ] Create reservation calculates totals correctly (nights × rate + tax)
- [ ] Create reservation checks availability via room blocks if room assigned
- [ ] Room block exclusion constraint provides DB-level overlap safety
- [ ] Cancel removes room block and closes folio
- [ ] No-show validates check-in date has passed
- [ ] All status transitions go through `assertTransition()`
- [ ] All reservation writes use optimistic locking via `version`
- [ ] `ConcurrencyConflictError` thrown when version mismatch
- [ ] `checkRoomAvailability` correctly handles the `excludeReservationId` parameter for moves
- [ ] `suggestAvailableRooms` returns rooms with no overlapping blocks
- [ ] Auto-created folio is linked to reservation
- [ ] All commands use `publishWithOutbox` pattern

---

# SESSION 6 — Reservation API Routes + Calendar Move/Resize Endpoints

## Context

Session 6 of 18. Session 5 built the reservation service. Now you are creating the API routes for reservation CRUD and the critical calendar move/resize operations.

## Attached Files

- `CONVENTIONS.md`, `CLAUDE.md`
- `oppsera_pms_calendar_interaction_spec.md` (must follow exactly for move/resize)
- `oppsera_pms_reference_architecture.md`

## Your Task

### 1. Reservation CRUD Routes

```
api/v1/pms/
├── reservations/
│   ├── route.ts                    # GET (list), POST (create)
│   └── [id]/
│       ├── route.ts                # GET (detail), PATCH (update)
│       ├── cancel/
│       │   └── route.ts            # POST
│       └── no-show/
│           └── route.ts            # POST
```

POST create must:
- Accept `createReservationSchema` body
- Return created reservation with folio ID
- Status 201

GET list must:
- Accept query params: `propertyId` (required), `status`, `fromDate`, `toDate`, `guestId`, `roomId`, `cursor`, `limit`
- Return `{ data: [...], cursor: "..." }`

### 2. Calendar Move Command: `commands/move-reservation.ts`

**This is a critical path command.** Follow the calendar interaction spec exactly.

1. **Idempotency check** (via `idempotencyKey`) — inside transaction
2. **Load reservation** with current version
3. **Version check** — compare `from.version` with DB version → `ConcurrencyConflictError`
4. **Status check** — reject if status in `IMMOVABLE_STATUSES`
5. **Compute new dates:**
   - Keep same duration
   - New `checkInDate` = `to.checkInDate`
   - New `checkOutDate` = `to.checkInDate` + originalDuration
6. **Check availability** on new room + new date range (exclude current reservation)
7. **Check room not OOO**
8. **Update reservation:** new `roomId`, `checkInDate`, `checkOutDate`, increment `version`
9. **Update room block:** delete old block, insert new block (in same tx)
10. **Recalculate totals** if date range changed (different number of nights)
11. **Emit** `pms.reservation.moved.v1` with before/after snapshot
12. **Save idempotency key**
13. **Audit log**

### 3. Calendar Resize Command: `commands/resize-reservation.ts`

1. **Idempotency check**
2. **Load + version check + status check**
3. **Determine change:**
   - `edge = LEFT` → change `checkInDate` (to.checkInDate)
   - `edge = RIGHT` → change `checkOutDate` (to.checkOutDate)
4. **Validate** new range still >= 1 night
5. **For CHECKED_IN reservations:**
   - LEFT resize: block (cannot change check-in date after check-in)
   - RIGHT resize: allow extend only (new checkOutDate >= old checkOutDate), block shortening in v1
6. **Check availability** on the newly added date range only (not the whole range)
7. **Check room not OOO** for new dates
8. **Update reservation** (new dates, version++, recalculate totals)
9. **Update room block** (adjust dates)
10. **Emit** `pms.reservation.moved.v1` (reuse same event type, include `resized: true` flag)
11. **Save idempotency key**

### 4. Calendar Move/Resize API Routes

```
api/v1/pms/
├── calendar/
│   ├── move/
│   │   └── route.ts              # POST
│   └── resize/
│       └── route.ts              # POST
```

**Move endpoint:**
```typescript
export const POST = withMiddleware(
  async (request, ctx) => {
    const body = await request.json();
    const parsed = calendarMoveSchema.safeParse(body);
    // ... validate
    const result = await moveReservation(ctx, parsed.data);
    return NextResponse.json({ data: result });
  },
  { permission: PMS_PERMISSIONS.CALENDAR_MOVE, entitlement: 'pms' },
);
```

**Response shape (move):**
```json
{
  "data": {
    "reservation": {
      "id": "...",
      "roomId": "...",
      "checkInDate": "2025-03-15",
      "checkOutDate": "2025-03-18",
      "version": 3,
      "status": "CONFIRMED",
      "subtotalCents": 45000,
      "totalCents": 48150
    }
  }
}
```

**Error responses:**
```json
{ "error": { "code": "ROOM_ALREADY_BOOKED", "message": "Room 101 is already booked for 2025-03-15–2025-03-17" } }
{ "error": { "code": "ROOM_OUT_OF_ORDER", "message": "Room 101 is out of order" } }
{ "error": { "code": "CONCURRENCY_CONFLICT", "message": "Reservation was modified by another user. Please refresh." } }
{ "error": { "code": "RESERVATION_NOT_MOVABLE", "message": "Cannot move a cancelled reservation" } }
```

### 5. Undo Support

The undo action from the calendar UI is just another move/resize call with the `from` and `to` reversed. No special server endpoint needed. The client tracks the previous state and issues a reverse move.

Document this in a comment at the top of the move command.

### 6. Standardized Error Response Contract

Document in `packages/modules/pms/src/errors.ts`:

```typescript
/**
 * PMS Error Codes (used in API error responses):
 *
 * | Code                        | HTTP | When                                    |
 * |-----------------------------|------|-----------------------------------------|
 * | ROOM_ALREADY_BOOKED         | 409  | Room+date overlap detected              |
 * | ROOM_OUT_OF_ORDER           | 409  | Target room is OOO                      |
 * | INVALID_STATUS_TRANSITION   | 409  | Status change not allowed               |
 * | CONCURRENCY_CONFLICT        | 409  | Version mismatch on write               |
 * | RESERVATION_NOT_MOVABLE     | 409  | Status is terminal (cancelled, etc.)    |
 * | FOLIO_NOT_OPEN              | 409  | Folio already closed                    |
 * | VALIDATION_ERROR            | 400  | Input validation failure                |
 * | NOT_FOUND                   | 404  | Entity not found                        |
 */
```

## Acceptance Criteria

- [ ] Move preserves reservation duration when shifting dates
- [ ] Move works for room-only changes (same dates, different room)
- [ ] Move works for date-only changes (same room, different dates)
- [ ] Move works for combined room + date changes
- [ ] Resize LEFT changes checkInDate, RIGHT changes checkOutDate
- [ ] Resize blocks shortening a CHECKED_IN reservation
- [ ] Resize to < 1 night is rejected
- [ ] Both move and resize use idempotency keys
- [ ] Both use optimistic locking via version
- [ ] Availability checks exclude the current reservation (self-conflict prevention)
- [ ] Room block is atomically updated in the same transaction
- [ ] Totals are recalculated when night count changes
- [ ] All 4 error codes return correct HTTP status and message
- [ ] Undo behavior is documented (reverse move/resize)

---

# SESSION 7 — Front Desk Workflows (Check-In, Check-Out, Room Move)

## Context

Session 7 of 18. You are building the front desk operational commands — the daily workflows a desk clerk uses.

## Attached Files

- `CONVENTIONS.md`, `CLAUDE.md`
- PMS spec files

## Your Task

### 1. Check-In Command: `commands/check-in.ts`

1. Load reservation, verify `tenantId`
2. `assertTransition(current.status, 'CHECKED_IN')`
3. **Room assignment enforcement:** room MUST be assigned at check-in
   - If `roomId` already set on reservation → use it
   - If not → `input.roomId` is required (front desk picks a room)
   - Validate room belongs to property, correct room type, not OOO
4. **Check availability** (if room is being assigned at check-in time)
5. **Create room block** if not already created
6. **Update reservation** status → `CHECKED_IN`, version++
7. **Update room** status → `OCCUPIED` (using room state machine transition)
8. **Post room charges to folio:**
   - For each night of the stay, post a `ROOM_CHARGE` folio entry
   - Post applicable tax entries
   - (v1: post all nights upfront; v2 can do nightly posting)
9. **Emit** `pms.reservation.checked_in.v1`
10. **Audit log** with actor

**Early check-in handling:**
- If check-in date is tomorrow but guest arrives today, the command should still work
- Adjust `checkInDate` to today (with a flag `earlyCheckIn: true` in audit)
- Recalculate totals for the extra night
- Update room block accordingly

### 2. Check-Out Command: `commands/check-out.ts`

1. Load reservation, verify tenant
2. `assertTransition(current.status, 'CHECKED_OUT')`
3. **Update reservation** status → `CHECKED_OUT`, version++
4. **Update room** status → `VACANT_DIRTY` (checkout always dirties the room)
5. **Remove room block** (the stay is complete — block is no longer needed for future availability; or keep it as historical record but mark it ended)
   - Decision: **keep the block** with `blockType = 'RESERVATION'` for historical queries, but it won't conflict with future bookings because the exclusion constraint only applies to active block types. Add `is_active BOOLEAN DEFAULT true` or filter by reservation status in queries.
   - Simpler approach for v1: leave the block as-is; exclusion constraint already scopes to active block types via partial index or app logic. Document the approach chosen.
6. **Close folio** — set folio status to `CLOSED`
   - Before closing, validate all charges are posted
   - In v1, payment is not enforced at checkout (folio can close with balance)
7. **Emit** `pms.reservation.checked_out.v1`

**Late check-out handling:**
- If today > original checkOutDate, add extra night charges before closing folio
- Extend `checkOutDate` to today + 1 (or to today if checking out same day)
- Update room block to reflect extended stay

### 3. Room Move Command: `commands/move-room.ts`

This is different from calendar move — it's an operational "swap room" for a checked-in guest:

1. Load reservation (must be `CHECKED_IN`)
2. Validate new room: same property, not OOO, available for remaining dates
3. **Update reservation** `roomId` to new room, version++
4. **Update room blocks:** adjust the block to the new room
5. **Update old room** status → `VACANT_DIRTY`
6. **Update new room** status → `OCCUPIED`
7. **Add folio adjustment** if rate differs for new room type (v1: manual adjustment only)
8. **Emit** `pms.reservation.moved.v1`
9. **Audit log** with old/new room

### 4. API Routes

```
api/v1/pms/
├── reservations/
│   └── [id]/
│       ├── check-in/
│       │   └── route.ts          # POST
│       ├── check-out/
│       │   └── route.ts          # POST
│       └── move-room/
│           └── route.ts          # POST { newRoomId, version }
```

### 5. Split Stay Support (v1 Decision)

**Decision for v1: Defer split stays.**

Document the following in a `SPLIT_STAYS.md` or as a block comment:
- Split stays (guest changes room mid-stay) are handled in v1 as: cancel original reservation (partial), create new reservation for remaining dates in new room
- This is a manual process for the front desk in v1
- v2 will implement proper split stay with linked reservation groups (`parentReservationId`)
- The schema already supports this via the `primary_reservation_id` pattern if needed

### 6. Responsive / Mobile Behavior (Document)

Add to the module's README or a design doc:
- Front desk check-in/check-out must work on tablet (iPad) at minimum
- Critical actions (check-in, check-out) should have large touch targets (min 44px)
- The room assignment picker during check-in should show room availability inline
- Confirmation dialogs for destructive actions (cancel, no-show) use full modals, not toasts

## Acceptance Criteria

- [ ] Check-in enforces room assignment (either pre-assigned or provided at check-in)
- [ ] Check-in sets room status to OCCUPIED
- [ ] Check-in posts room charges + tax to folio
- [ ] Early check-in adjusts dates and recalculates totals
- [ ] Check-out sets room to VACANT_DIRTY
- [ ] Check-out closes folio
- [ ] Late check-out adds extra night charges
- [ ] Room move validates new room availability for remaining dates
- [ ] Room move updates both old and new room statuses
- [ ] All commands use optimistic locking
- [ ] All commands emit domain events
- [ ] Split stays are explicitly deferred to v2 with documentation

---

# SESSION 8 — Housekeeping & Folio Services + API Routes

## Context

Session 8 of 18. You are building the housekeeping management and folio charge posting services.

## Attached Files

- `CONVENTIONS.md`, `CLAUDE.md`
- PMS spec files

## Your Task

### 1. Housekeeping Commands

**`update-room-status.ts`**
1. Load room, verify tenant
2. Validate transition via room status state machine (`assertRoomTransition`)
3. If transitioning to `OUT_OF_ORDER`, require `reason`
4. Update room status
5. **Log to `pms_room_status_log`** with `businessDate`, `fromStatus`, `toStatus`
6. Emit `pms.room.status_changed.v1`

**Auto-status rules (implement as helper functions, called by check-in/check-out):**
- On check-in: room → `OCCUPIED`
- On check-out: room → `VACANT_DIRTY`
- These are already handled in Session 7 commands but extract the logic into a shared helper:

```typescript
export async function transitionRoomStatus(
  tx: Transaction,
  tenantId: string,
  roomId: string,
  toStatus: RoomStatus,
  actorId: string,
  businessDate: string,
  reason?: string,
): Promise<void>
```

### 2. Housekeeping Queries

**`list-housekeeping-rooms.ts`**
- Input: `propertyId`, `date` (business date), optional `status` filter
- Returns: rooms with current status, room type, reservation info (who's checked in, who's departing)
- This is the "housekeeping board" query

```typescript
interface HousekeepingRoomRow {
  roomId: string;
  roomNumber: string;
  roomTypeName: string;
  floor: string | null;
  status: RoomStatus;
  isOutOfOrder: boolean;
  currentGuest: { name: string; checkOutDate: string } | null;
  arrivingGuest: { name: string; checkInDate: string } | null;
  departingToday: boolean;
  arrivingToday: boolean;
}
```

Build this as a single efficient query joining rooms → reservations (for current/arriving guests).

### 3. Folio Commands

**`post-folio-entry.ts`**
1. Load folio, verify it's `OPEN`
2. Validate entry type
3. Insert `pms_folio_entries` row
4. **Recalculate folio totals** (denormalized on `pms_folios`):
   ```typescript
   subtotalCents = SUM(entries WHERE type IN (ROOM_CHARGE, ADJUSTMENT) AND amount > 0)
   taxCents = SUM(entries WHERE type = TAX)
   feeCents = SUM(entries WHERE type = FEE)
   totalCents = subtotalCents + taxCents + feeCents
   // Note: payments/refunds reduce balance but don't change total
   ```
5. Emit `pms.folio.charge_posted.v1`

**`close-folio.ts`**
1. Load folio, verify it's `OPEN`
2. Set status → `CLOSED`
3. Emit `pms.folio.closed.v1`

**`post-nightly-charges.ts`** (used by check-in and background jobs)
- Given a reservation, post room charges for a date range:
  ```typescript
  for each night in [checkInDate, checkOutDate):
    post ROOM_CHARGE: "Room charge - {date}" = nightlyRateCents
    post TAX: "Tax - {date}" = calculated tax
  ```

### 4. Folio Queries

**`get-folio.ts`**
- Returns folio with all entries, sorted by `postedAt`
- Include running balance calculation
- Include payment summary (total charges vs total payments)

**`get-folio-by-reservation.ts`**
- Lookup folio by `reservationId`

### 5. API Routes

```
api/v1/pms/
├── housekeeping/
│   └── rooms/
│       └── route.ts                # GET (list, ?propertyId=&date=&status=)
├── rooms/
│   └── [id]/
│       └── status/
│           └── route.ts            # POST { status, reason? }  (already created in S3, add handler)
├── folios/
│   └── [id]/
│       ├── route.ts                # GET (folio detail with entries)
│       └── entries/
│           └── route.ts            # POST (post entry)
├── reservations/
│   └── [id]/
│       └── folio/
│           └── route.ts            # GET (folio by reservation)
```

### 6. GL Posting Hook (v2 Provision)

Document the extension point:
- When `pms.folio.charge_posted.v1` events are consumed by a future GL adapter, it will create journal entries
- The adapter pattern follows OppsEra's existing POS → GL bridge (`handleTenderForAccounting`)
- Folio entries include `sourceRef` for linking to payment providers in v2

### 7. Background Job: Nightly Charge Posting

Define the job spec (implement in Session 11):
- **Name:** `pms.nightly-charge-posting`
- **Schedule:** Daily at property's configured night audit time (default 3:00 AM property-local)
- **Logic:**
  1. Find all `CHECKED_IN` reservations for the property
  2. For each, check if today's room charge has been posted to the folio
  3. If not, post the charge + tax
- This is the alternative to posting all charges at check-in (v2 refinement)

## Acceptance Criteria

- [ ] Room status transitions go through the state machine
- [ ] Status changes are logged to `pms_room_status_log`
- [ ] Housekeeping board query returns room status + guest info efficiently
- [ ] Folio entries are posted with correct types and amounts
- [ ] Folio totals are recalculated after each entry
- [ ] Folio cannot be edited after closing (`FolioNotOpenError`)
- [ ] Nightly charge posting helper works for arbitrary date ranges
- [ ] GL posting extension point is documented
- [ ] Nightly charge background job is specified

---

# SESSION 9 — Domain Events, Outbox Integration & Read Model Projectors

## Context

Session 9 of 18. You are connecting the domain events to OppsEra's event system and building the projectors that keep the calendar read models in sync.

## Attached Files

- `CONVENTIONS.md`, `CLAUDE.md`
- PMS spec files

## Your Task

### 1. Event Payload Definitions: `events/payloads.ts`

Define TypeScript interfaces for each event's data payload. Events must be **self-contained** per OppsEra conventions:

```typescript
export interface ReservationCreatedPayload {
  reservationId: string;
  propertyId: string;
  guestId: string | null;
  guestName: string;
  roomId: string | null;
  roomTypeId: string;
  checkInDate: string;
  checkOutDate: string;
  status: ReservationStatus;
  sourceType: string;
  nightlyRateCents: number;
  totalCents: number;
  version: number;
}

export interface ReservationMovedPayload {
  reservationId: string;
  propertyId: string;
  before: {
    roomId: string | null;
    checkInDate: string;
    checkOutDate: string;
  };
  after: {
    roomId: string | null;
    checkInDate: string;
    checkOutDate: string;
  };
  guestName: string;
  status: ReservationStatus;
  version: number;
  resized: boolean;
}

// ... define payloads for all PMS_EVENTS
```

### 2. Event Builder Helper: `events/build-pms-event.ts`

Create a helper that wraps `buildEventFromContext` for PMS-specific events:

```typescript
export function buildPmsEvent(
  ctx: RequestContext,
  eventType: string,
  data: Record<string, unknown>,
): EventEnvelope {
  return buildEventFromContext(ctx, eventType, data);
}
```

### 3. Calendar Read Model Projector: `events/projectors/calendar-projector.ts`

This is the most important projector. It maintains `rm_pms_calendar_segments`.

**On `ReservationCreated` / `ReservationMoved` / `ReservationCheckedIn`:**
1. Delete all existing segments for this reservation
2. If reservation has a `roomId` and status is active:
   - For each date in `[checkInDate, checkOutDate)`:
     - Upsert a segment row: `{ roomId, businessDate, reservationId, status, guestName, checkInDate, checkOutDate, sourceType, colorKey }`
3. Determine `colorKey` from status + sourceType

**On `ReservationCancelled` / `ReservationNoShow` / `ReservationCheckedOut`:**
1. Delete all segments for this reservation
2. (Checked-out reservations are removed from calendar segments — they're historical)

**Color key mapping:**
```typescript
function computeColorKey(status: ReservationStatus, sourceType: string): string {
  switch (status) {
    case 'HOLD': return 'hold';      // amber
    case 'CONFIRMED': return 'confirmed'; // blue
    case 'CHECKED_IN': return 'in-house'; // green
    case 'CHECKED_OUT': return 'departed'; // gray
    case 'CANCELLED': return 'cancelled'; // gray-striped
    case 'NO_SHOW': return 'no-show';    // red-gray
  }
}
```

### 4. Occupancy Read Model Projector: `events/projectors/occupancy-projector.ts`

Maintains `rm_pms_daily_occupancy`.

**Strategy:** On any reservation event, recalculate the affected date range:

```typescript
async function recalculateOccupancy(
  tx: Transaction,
  tenantId: string,
  propertyId: string,
  startDate: string,
  endDate: string,
): Promise<void> {
  // For each date in range:
  //   roomsOccupied = COUNT DISTINCT room_id FROM pms_room_blocks WHERE date in range AND blockType = 'RESERVATION' AND reservation is active
  //   roomsAvailable = total rooms - roomsOccupied - OOO rooms
  //   arrivals = COUNT reservations with checkInDate = date
  //   departures = COUNT reservations with checkOutDate = date
  //   UPSERT into rm_pms_daily_occupancy
}
```

### 5. Event Consumer Registration: `events/consumers.ts`

Register consumers following OppsEra's consumer pattern:

```typescript
export function registerPmsEventConsumers(): void {
  const bus = getEventBus();
  
  bus.subscribe(PMS_EVENTS.RESERVATION_CREATED, 'pms-calendar-projector', handleCalendarProjection);
  bus.subscribe(PMS_EVENTS.RESERVATION_MOVED, 'pms-calendar-projector', handleCalendarProjection);
  bus.subscribe(PMS_EVENTS.RESERVATION_CANCELLED, 'pms-calendar-projector', handleCalendarProjection);
  bus.subscribe(PMS_EVENTS.RESERVATION_CHECKED_IN, 'pms-calendar-projector', handleCalendarProjection);
  bus.subscribe(PMS_EVENTS.RESERVATION_CHECKED_OUT, 'pms-calendar-projector', handleCalendarProjection);
  bus.subscribe(PMS_EVENTS.RESERVATION_NO_SHOW, 'pms-calendar-projector', handleCalendarProjection);
  
  // Occupancy projector
  bus.subscribe(PMS_EVENTS.RESERVATION_CREATED, 'pms-occupancy-projector', handleOccupancyProjection);
  // ... etc
}
```

### 6. Consumer Idempotency

Each consumer must check `processed_events` table before processing:
```typescript
async function handleCalendarProjection(event: EventEnvelope): Promise<void> {
  // Check if already processed
  const processed = await checkProcessedEvent(event.eventId, 'pms-calendar-projector');
  if (processed) return;
  
  // Process...
  
  // Mark processed
  await markEventProcessed(event.eventId, 'pms-calendar-projector');
}
```

### 7. Observability: Projector Lag Metric

Document metric:
- `pms_projector_lag_seconds` — time between event `occurredAt` and projector processing completion
- Log warning if lag > 5 seconds
- This helps detect when read models are stale

## Acceptance Criteria

- [ ] All PMS events have defined payload interfaces
- [ ] Calendar projector creates/deletes segments correctly for all reservation events
- [ ] Calendar segments use `[checkInDate, checkOutDate)` exclusive range
- [ ] Occupancy projector recalculates affected date range on any reservation change
- [ ] Color keys map correctly from status + source
- [ ] Consumer idempotency prevents duplicate processing
- [ ] All consumers are registered in `registerPmsEventConsumers()`
- [ ] Projector lag metric is defined

---

# SESSION 10 — Calendar Week View API + Daily Occupancy Endpoint

## Context

Session 10 of 18. You are building the calendar query endpoints that power the frontend calendar grid.

## Attached Files

- `CONVENTIONS.md`, `CLAUDE.md`
- `oppsera_pms_calendar_interaction_spec.md` (response contract defined in §9)

## Your Task

### 1. Calendar Week View Query: `queries/calendar-week.ts`

**This is the highest-performance query in the module.** It must be < 300ms for properties with up to 200 rooms.

```typescript
export async function getCalendarWeek(
  ctx: RequestContext,
  propertyId: string,
  startDate: string, // Monday of the week (or any start date)
): Promise<CalendarWeekResponse>
```

**Query strategy:**
1. Calculate `endDate` = startDate + 7 days
2. **Rooms query:** Get all active rooms for the property, ordered by room type then room number
3. **Segments query:** Get all `rm_pms_calendar_segments` where `businessDate BETWEEN startDate AND endDate - 1`
4. **OOO blocks query:** Get all `pms_room_blocks` where `blockType = 'MAINTENANCE'` or room `isOutOfOrder = true` for the date range

**Do NOT join at query time.** Read from denormalized read model only.

**Response shape (must match calendar interaction spec §9):**
```typescript
interface CalendarWeekResponse {
  startDate: string;
  endDate: string;
  rooms: Array<{
    roomId: string;
    roomNumber: string;
    roomTypeId: string;
    roomTypeName: string;
    floor: string | null;
    status: RoomStatus;
    isOutOfOrder: boolean;
  }>;
  segments: Array<{
    roomId: string;
    businessDate: string;
    reservationId: string;
    status: ReservationStatus;
    guestName: string;
    checkInDate: string;
    checkOutDate: string;
    sourceType: string;
    colorKey: string;
  }>;
  oooBlocks: Array<{
    roomId: string;
    startDate: string;
    endDate: string;
    reason: string | null;
  }>;
  meta: {
    totalRooms: number;
    occupancyByDate: Record<string, { occupied: number; available: number; arrivals: number; departures: number }>;
    lastUpdatedAt: string;
  };
}
```

### 2. Calendar Day View Query: `queries/calendar-day.ts`

Same pattern but for a single date. Lighter query:
```typescript
export async function getCalendarDay(
  ctx: RequestContext,
  propertyId: string,
  date: string,
): Promise<CalendarDayResponse>
```

### 3. Daily Occupancy Query: `queries/daily-occupancy.ts`

```typescript
export async function getDailyOccupancy(
  ctx: RequestContext,
  propertyId: string,
  startDate: string,
  endDate: string,
): Promise<Array<DailyOccupancyRow>>
```

Read directly from `rm_pms_daily_occupancy`.

### 4. API Routes

```
api/v1/pms/
├── calendar/
│   ├── week/
│   │   └── route.ts              # GET ?propertyId=&start=YYYY-MM-DD
│   ├── day/
│   │   └── route.ts              # GET ?propertyId=&date=YYYY-MM-DD
│   ├── move/
│   │   └── route.ts              # POST (already in Session 6)
│   └── resize/
│       └── route.ts              # POST (already in Session 6)
├── occupancy/
│   └── route.ts                  # GET ?propertyId=&startDate=&endDate=
```

### 5. Performance Optimization

Document the performance strategy:

**Index usage:**
- `rm_pms_calendar_segments` primary query: `WHERE tenant_id = $1 AND property_id = $2 AND business_date >= $3 AND business_date < $4`
  - Covered by index on `(tenant_id, property_id, business_date)`
- Rooms query: `WHERE tenant_id = $1 AND property_id = $2 AND is_active = true ORDER BY room_type_id, room_number`
  - Covered by index on `(tenant_id, property_id, is_active)`

**Query count:** The week view should execute at most 3 queries:
1. Rooms list (cached after first load if no changes)
2. Calendar segments for date range
3. OOO blocks for date range

**Result size estimates:**
- 200 rooms × 7 days = 1,400 max segment rows (typically ~40% occupied = 560 rows)
- JSON response: ~50-100KB
- Should be well under 300ms target

**Scalability assumption:** v1 targets single properties up to 500 rooms. For larger properties (1000+), we would need pagination by room type groups or virtualized room ranges.

### 6. Fallback: Direct Query Mode

If the read model is stale (projector lag), provide a fallback query that hits OLTP tables:

```typescript
export async function getCalendarWeekDirect(
  ctx: RequestContext,
  propertyId: string,
  startDate: string,
): Promise<CalendarWeekResponse>
```

This joins `pms_reservations` → `pms_rooms` directly. Slower but always accurate. The frontend can use this if `meta.lastUpdatedAt` is too old.

## Acceptance Criteria

- [ ] Week view returns all data in a single API call
- [ ] Response matches the contract from the calendar interaction spec
- [ ] Segments include all fields needed for chip rendering
- [ ] OOO blocks are separate from reservation segments
- [ ] Occupancy meta is included per-date
- [ ] Query uses read model tables only (no OLTP joins)
- [ ] Performance: < 300ms for 200 rooms × 7 days
- [ ] Maximum 3 DB queries per request
- [ ] Day view works for single-date queries
- [ ] Fallback direct query mode exists for stale read models

---

# SESSION 11 — Permissions, Background Jobs & Seed Data

## Context

Session 11 of 18. You are building the infrastructure layer: RBAC setup, background jobs, and seed data for testing.

## Attached Files

- `CONVENTIONS.md`, `CLAUDE.md`
- PMS spec files

## Your Task

### 1. Entitlement Registration

Add `pms` to OppsEra's module key registry:

```typescript
// In the appropriate entitlements config or seed
{
  moduleKey: 'pms',
  planTier: 'standard',
  isEnabled: true,
  limits: { maxProperties: 1, maxRooms: 500 },
}
```

### 2. Role Seed Data

Create default PMS roles for the tenant seed:

```typescript
const PMS_ROLES = [
  {
    name: 'PMS General Manager',
    description: 'Full access to all PMS features',
    permissions: Object.values(PMS_PERMISSIONS),
  },
  {
    name: 'PMS Front Desk Agent',
    description: 'Reservation management, check-in/out, guest management',
    permissions: [
      PMS_PERMISSIONS.PROPERTY_VIEW,
      PMS_PERMISSIONS.ROOMS_VIEW,
      PMS_PERMISSIONS.RESERVATIONS_VIEW,
      PMS_PERMISSIONS.RESERVATIONS_CREATE,
      PMS_PERMISSIONS.RESERVATIONS_EDIT,
      PMS_PERMISSIONS.RESERVATIONS_CANCEL,
      PMS_PERMISSIONS.FRONT_DESK_CHECK_IN,
      PMS_PERMISSIONS.FRONT_DESK_CHECK_OUT,
      PMS_PERMISSIONS.FRONT_DESK_NO_SHOW,
      PMS_PERMISSIONS.CALENDAR_VIEW,
      PMS_PERMISSIONS.CALENDAR_MOVE,
      PMS_PERMISSIONS.CALENDAR_RESIZE,
      PMS_PERMISSIONS.HOUSEKEEPING_VIEW,
      PMS_PERMISSIONS.GUESTS_VIEW,
      PMS_PERMISSIONS.GUESTS_MANAGE,
      PMS_PERMISSIONS.FOLIO_VIEW,
      PMS_PERMISSIONS.FOLIO_POST_CHARGES,
      PMS_PERMISSIONS.FOLIO_POST_PAYMENTS,
    ],
  },
  {
    name: 'PMS Housekeeping',
    description: 'Room status management',
    permissions: [
      PMS_PERMISSIONS.ROOMS_VIEW,
      PMS_PERMISSIONS.HOUSEKEEPING_VIEW,
      PMS_PERMISSIONS.HOUSEKEEPING_MANAGE,
    ],
  },
  {
    name: 'PMS Revenue Manager',
    description: 'Rate management and reporting',
    permissions: [
      PMS_PERMISSIONS.PROPERTY_VIEW,
      PMS_PERMISSIONS.ROOMS_VIEW,
      PMS_PERMISSIONS.RESERVATIONS_VIEW,
      PMS_PERMISSIONS.RESERVATIONS_CREATE,
      PMS_PERMISSIONS.RESERVATIONS_EDIT,
      PMS_PERMISSIONS.CALENDAR_VIEW,
      PMS_PERMISSIONS.GUESTS_VIEW,
      PMS_PERMISSIONS.FOLIO_VIEW,
      PMS_PERMISSIONS.RATES_VIEW,
      PMS_PERMISSIONS.RATES_MANAGE,
    ],
  },
  {
    name: 'PMS Read Only',
    description: 'View-only access to PMS data',
    permissions: [
      PMS_PERMISSIONS.PROPERTY_VIEW,
      PMS_PERMISSIONS.ROOMS_VIEW,
      PMS_PERMISSIONS.RESERVATIONS_VIEW,
      PMS_PERMISSIONS.CALENDAR_VIEW,
      PMS_PERMISSIONS.HOUSEKEEPING_VIEW,
      PMS_PERMISSIONS.GUESTS_VIEW,
      PMS_PERMISSIONS.FOLIO_VIEW,
      PMS_PERMISSIONS.RATES_VIEW,
    ],
  },
];
```

### 3. Background Jobs

**`jobs/nightly-charge-posting.ts`**
- Cron: daily at 3:00 AM (property-local, converted to UTC based on property timezone)
- Logic:
  1. Find all properties for the tenant
  2. For each property, find all `CHECKED_IN` reservations
  3. For each reservation, check if today's room charge exists in folio entries
  4. If not, post room charge + tax for today
- Uses synthetic RequestContext (system actor)
- Idempotent: checks before posting

**`jobs/no-show-marking.ts`**
- Cron: daily at configurable time (default: 6:00 PM property-local)
- Logic:
  1. Find all `CONFIRMED` reservations where `checkInDate < today` (past arrival date)
  2. Optionally apply a grace period (e.g., if check-in date was yesterday, mark no-show)
  3. For each, execute `markNoShow` command
- Configurable: tenant setting for auto-no-show threshold

**`jobs/housekeeping-auto-dirty.ts`** (optional v1)
- Cron: daily early morning
- Logic: for all rooms with `CHECKED_OUT` reservations from yesterday, ensure room is `VACANT_DIRTY`
- Mostly handled by check-out command, but this catches edge cases

### 4. Seed Data Script: `packages/db/seeds/pms-seed.ts`

Create realistic test data:

```typescript
// 1 Property
const property = {
  name: 'Lakeside Lodge & Resort',
  timezone: 'America/New_York',
  currency: 'USD',
};

// 5 Room Types
const roomTypes = [
  { code: 'STD', name: 'Standard Room', maxAdults: 2, maxChildren: 1, maxOccupancy: 3, beds: [{ type: 'queen', count: 1 }] },
  { code: 'DLX', name: 'Deluxe Room', maxAdults: 2, maxChildren: 2, maxOccupancy: 4, beds: [{ type: 'queen', count: 2 }] },
  { code: 'STE', name: 'Suite', maxAdults: 2, maxChildren: 2, maxOccupancy: 4, beds: [{ type: 'king', count: 1 }, { type: 'sofa', count: 1 }] },
  { code: 'FAM', name: 'Family Room', maxAdults: 2, maxChildren: 3, maxOccupancy: 5, beds: [{ type: 'queen', count: 1 }, { type: 'bunk', count: 1 }] },
  { code: 'PRS', name: 'Presidential Suite', maxAdults: 2, maxChildren: 2, maxOccupancy: 4, beds: [{ type: 'king', count: 1 }] },
];

// 30 Rooms (distributed across types)
// STD: 101-110, DLX: 201-208, STE: 301-305, FAM: 401-404, PRS: 501-503

// 1 Default Rate Plan with prices
// STD: $149, DLX: $199, STE: $299, FAM: $249, PRS: $499

// 10 Guests with varied profiles

// 15-20 Reservations spanning next 30 days:
// - Mix of CONFIRMED, CHECKED_IN, HOLD statuses
// - Some with room assignments, some unassigned
// - Realistic date spreads (weekends busier)
// - 1-2 OOO rooms
// - A few reservations that have been cancelled
```

### 5. Migration Strategy Document

Add to the module README:
- Migration runs via `pnpm db:migrate`
- PMS tables are additive (no changes to existing OppsEra tables)
- Read model tables are ephemeral — can be dropped and rebuilt from events
- Seed data is idempotent (check before insert)
- Rollback: drop all `pms_*` and `rm_pms_*` tables

## Acceptance Criteria

- [ ] `pms` entitlement is registered
- [ ] 5 PMS roles created with correct permission sets matching the matrix from Session 2
- [ ] Nightly charge posting job is idempotent and uses synthetic context
- [ ] No-show marking job has configurable threshold
- [ ] Seed data creates a realistic property with 30 rooms and 15+ reservations
- [ ] Seed data is idempotent
- [ ] Migration strategy is documented

---

# SESSION 12 — Frontend: PMS Layout, Navigation, Types & API Hooks

## Context

Session 12 of 18. You are starting the frontend build. This session establishes the PMS page structure, TypeScript types, and data-fetching hooks.

## Attached Files

- `CONVENTIONS.md`, `CLAUDE.md`
- `oppsera_pms_calendar_interaction_spec.md`
- `oppsera_pms_reference_architecture.md`

## Your Task

### 1. Navigation Registration

Add PMS to the sidebar navigation in OppsEra:

```typescript
{
  name: 'Property',
  href: '/pms',
  icon: Building2, // from lucide-react
  moduleKey: 'pms',
  children: [
    { name: 'Calendar', href: '/pms/calendar' },
    { name: 'Reservations', href: '/pms/reservations' },
    { name: 'Front Desk', href: '/pms/front-desk' },
    { name: 'Guests', href: '/pms/guests' },
    { name: 'Housekeeping', href: '/pms/housekeeping' },
    { name: 'Rooms', href: '/pms/rooms' },
    { name: 'Rate Plans', href: '/pms/rates' },
    { name: 'Settings', href: '/pms/settings' },
  ],
}
```

### 2. Page Structure

```
apps/web/src/app/(dashboard)/pms/
├── page.tsx                          # PMS Dashboard (redirect to calendar)
├── calendar/
│   └── page.tsx                      # Calendar command center
├── reservations/
│   ├── page.tsx                      # Reservation list
│   ├── new/page.tsx                  # Create reservation
│   └── [id]/
│       ├── page.tsx                  # Reservation detail
│       └── edit/page.tsx             # Edit reservation
├── front-desk/
│   └── page.tsx                      # Front desk dashboard (arrivals/departures/in-house)
├── guests/
│   ├── page.tsx                      # Guest search/list
│   └── [id]/page.tsx                 # Guest profile
├── housekeeping/
│   └── page.tsx                      # Housekeeping board
├── rooms/
│   ├── page.tsx                      # Room list/management
│   └── [id]/page.tsx                 # Room detail
├── rates/
│   ├── page.tsx                      # Rate plan list
│   └── [id]/page.tsx                 # Rate plan detail + prices
└── settings/
    └── page.tsx                      # Property settings
```

Each `page.tsx` is a thin wrapper using `next/dynamic` with `ssr: false`:
```typescript
'use client';
import dynamic from 'next/dynamic';
const CalendarContent = dynamic(() => import('./calendar-content'), { ssr: false });
export default function CalendarPage() { return <CalendarContent />; }
```

### 3. TypeScript Types: `apps/web/src/types/pms.ts`

Define all frontend types matching the API response shapes:

```typescript
// Enums (mirror backend)
export type ReservationStatus = 'HOLD' | 'CONFIRMED' | 'CHECKED_IN' | 'CHECKED_OUT' | 'CANCELLED' | 'NO_SHOW';
export type RoomStatus = 'VACANT_CLEAN' | 'VACANT_DIRTY' | 'OCCUPIED' | 'OUT_OF_ORDER';
export type SourceType = 'DIRECT' | 'PHONE' | 'WALKIN' | 'BOOKING_ENGINE' | 'OTA';
export type FolioEntryType = 'ROOM_CHARGE' | 'TAX' | 'FEE' | 'ADJUSTMENT' | 'PAYMENT' | 'REFUND';
export type ResizeEdge = 'LEFT' | 'RIGHT';

// API response types
export interface PropertyRow { ... }
export interface RoomTypeRow { ... }
export interface RoomRow { ... }
export interface RatePlanRow { ... }
export interface GuestRow { ... }
export interface ReservationRow { ... }
export interface FolioRow { ... }
export interface FolioEntryRow { ... }

// Calendar types
export interface CalendarWeekResponse { ... } // match Session 10 response shape
export interface CalendarSegment { ... }
export interface CalendarRoom { ... }
export interface OooBlock { ... }

// Status display helpers
export const RESERVATION_STATUS_CONFIG: Record<ReservationStatus, { label: string; color: string; badge: string }> = {
  HOLD: { label: 'Hold', color: 'bg-amber-500', badge: 'warning' },
  CONFIRMED: { label: 'Confirmed', color: 'bg-blue-500', badge: 'info' },
  CHECKED_IN: { label: 'In-House', color: 'bg-green-500', badge: 'success' },
  CHECKED_OUT: { label: 'Departed', color: 'bg-gray-400', badge: 'neutral' },
  CANCELLED: { label: 'Cancelled', color: 'bg-gray-300', badge: 'neutral' },
  NO_SHOW: { label: 'No Show', color: 'bg-red-400', badge: 'error' },
};

export const ROOM_STATUS_CONFIG: Record<RoomStatus, { label: string; color: string }> = { ... };
```

### 4. API Hooks: `apps/web/src/hooks/use-pms.ts`

Create data-fetching hooks following OppsEra patterns:

```typescript
// Property
export function useProperty(propertyId: string | null) { ... }
export function useProperties() { ... }

// Rooms
export function useRooms(propertyId: string | null, filters?: { status?: RoomStatus; roomTypeId?: string }) { ... }
export function useRoom(roomId: string | null) { ... }
export function useRoomTypes(propertyId: string | null) { ... }

// Reservations
export function useReservations(propertyId: string | null, filters?: ReservationFilters) { ... }
export function useReservation(id: string | null) { ... }

// Calendar
export function useCalendarWeek(propertyId: string | null, startDate: string | null) {
  const url = propertyId && startDate
    ? `/api/v1/pms/calendar/week?propertyId=${propertyId}&start=${startDate}`
    : null;
  return useFetch<CalendarWeekResponse>(url);
}

// Guests
export function useGuests(propertyId: string | null, search?: string) { ... }
export function useGuest(id: string | null) { ... }

// Housekeeping
export function useHousekeepingRooms(propertyId: string | null, date: string | null) { ... }

// Folio
export function useFolio(folioId: string | null) { ... }
export function useReservationFolio(reservationId: string | null) { ... }

// Rate Plans
export function useRatePlans(propertyId: string | null) { ... }

// Mutations
export function usePmsMutations() {
  return {
    createReservation: useMutation<CreateReservationInput, ReservationRow>('/api/v1/pms/reservations', 'POST'),
    updateReservation: useMutation<...>(...),
    calendarMove: useMutation<CalendarMoveInput, ReservationRow>('/api/v1/pms/calendar/move', 'POST'),
    calendarResize: useMutation<CalendarResizeInput, ReservationRow>('/api/v1/pms/calendar/resize', 'POST'),
    checkIn: (id: string) => useMutation<CheckInInput, ReservationRow>(`/api/v1/pms/reservations/${id}/check-in`, 'POST'),
    checkOut: (id: string) => useMutation<...>(...),
    // ... etc
  };
}
```

### 5. Property Context Provider

Since v1 targets a single property, create a context that loads and provides the active property:

```typescript
// apps/web/src/contexts/pms-property-context.tsx
export function PmsPropertyProvider({ children }: { children: React.ReactNode }) {
  const { data: properties } = useProperties();
  const activeProperty = properties?.[0] ?? null; // v1: first property
  
  return (
    <PmsPropertyContext.Provider value={{ property: activeProperty, isLoading: !properties }}>
      {children}
    </PmsPropertyContext.Provider>
  );
}

export function usePmsProperty() { return useContext(PmsPropertyContext); }
```

Wrap all PMS pages with this provider in a layout:
```typescript
// apps/web/src/app/(dashboard)/pms/layout.tsx
export default function PmsLayout({ children }) {
  return <PmsPropertyProvider>{children}</PmsPropertyProvider>;
}
```

## Acceptance Criteria

- [ ] PMS navigation appears in sidebar when `pms` entitlement is active
- [ ] All page routes are created with thin `page.tsx` + dynamic content pattern
- [ ] TypeScript types match all API response shapes
- [ ] Status display configs provide consistent color/label mapping
- [ ] API hooks follow OppsEra's `useFetch` pattern with conditional fetching
- [ ] Calendar week hook returns typed `CalendarWeekResponse`
- [ ] Property context provider loads active property for all PMS pages
- [ ] PMS layout wraps children with property provider

---

# SESSION 13 — Frontend: Calendar Grid & Week View

## Context

Session 13 of 18. You are building the calendar grid — the PMS "command center." This session focuses on rendering; drag-and-drop comes in Session 14.

## Attached Files

- `CONVENTIONS.md`, `CLAUDE.md`
- `oppsera_pms_calendar_interaction_spec.md` (primary reference for this session)

## Your Task

### 1. Calendar Page: `calendar-content.tsx`

The calendar page layout:
- **Top bar:** Date navigation (prev/next week), view toggle (Day/Week), today button, occupancy summary
- **Grid area:** Room rows × date columns
- **Optional sidebar:** Room type group filters

### 2. Calendar Grid Component: `components/pms/calendar-grid.tsx`

Build a performant grid:

**Structure:**
```
┌─────────────┬───────────────┬───────────────┬─── ... ───┐
│ Room Type/# │  Mon 03/15    │  Tue 03/16    │           │
├─────────────┼───────────────┼───────────────┼─── ... ───┤
│ STD - 101   │ ████ Smith ██ │ █████████████ │           │
│ STD - 102   │               │   ██ Jones ██ │ ████████  │
│ STD - 103   │ [OOO]         │ [OOO]         │           │
├─────────────┼───────────────┼───────────────┼─── ... ───┤
│ DLX - 201   │               │ ████ Brown ██ │ ████████  │
│ DLX - 202   │ ██████████████████████████████████████████│
└─────────────┴───────────────┴───────────────┴─── ... ───┘
```

**Grid rendering rules:**
- Rows grouped by room type with collapsible headers
- Columns are dates (7 for week view)
- Fixed left column (room labels) with horizontal scroll for dates
- Today's column highlighted

**Row virtualization:**
- If > 50 rooms, virtualize rows (only render visible rows + buffer)
- Use a virtualization library or manual implementation with `IntersectionObserver`
- Each row height: 40px (compact) or 48px (comfortable)

**Cell rendering:**
- Empty cell: light background, click target for quick create
- OOO cell: hatched/striped pattern with "OOO" label
- Reservation segment: rendered as a chip spanning across cells

### 3. Reservation Chip Component: `components/pms/reservation-chip.tsx`

The chip spans from `checkInDate` to `checkOutDate - 1` (exclusive end):

**Visual:**
- Left rounded edge on arrival date
- Right rounded edge on departure date - 1
- Background color from `colorKey` (status-based)
- Text: guest last name (truncated to fit)
- Status badge (small icon or letter)
- Interactive: shows cursor change on hover

**Positioning:**
- Chips are absolutely positioned within the grid
- Calculate left offset from `checkInDate` relative to grid start
- Calculate width from number of nights × cell width
- Handle chips that extend beyond the visible week (clip but indicate continuation)

**Hover tooltip:**
```
Guest: John Smith
Room: 101 (Standard)
Mar 15 → Mar 18 (3 nights)
Status: Confirmed
Source: Direct
```

### 4. Calendar Data Processing

Transform the API response into renderable grid data:

```typescript
interface ProcessedCalendarData {
  dates: string[];  // ['2025-03-15', '2025-03-16', ...]
  roomGroups: Array<{
    roomType: { id: string; name: string };
    rooms: Array<{
      room: CalendarRoom;
      chips: Array<{
        reservationId: string;
        guestName: string;
        startCol: number;  // column index where chip starts
        spanCols: number;  // number of columns to span
        status: ReservationStatus;
        colorKey: string;
        checkInDate: string;
        checkOutDate: string;
        isArrival: boolean;  // starts within this week
        isDeparture: boolean; // ends within this week
      }>;
      oooRanges: Array<{ startCol: number; spanCols: number; reason: string | null }>;
    }>;
  }>;
}
```

### 5. Occupancy Header

Above the grid, show per-date occupancy:
```
Mon 15    Tue 16    Wed 17    Thu 18    Fri 19    Sat 20    Sun 21
18/30     22/30     25/30     28/30     30/30     27/30     20/30
 60%       73%       83%       93%      100%       90%       67%
```

Color code: green < 70%, amber 70-90%, red > 90%.

### 6. Date Navigation

- **Prev/Next buttons:** shift week by 7 days
- **Today button:** jump to current week
- **Date picker:** click on the date range label to open a calendar picker for jumping to any week
- URL state: sync `?start=YYYY-MM-DD` to URL for shareable links

### 7. Empty State

If no property exists yet, show an empty state:
```
"Set up your property to get started"
[Create Property] button
```

### 8. Loading State

While calendar data loads:
- Show skeleton grid with pulsing cells
- Room labels column loads first (from cached rooms query)
- Chips appear after segments load

### 9. Keyboard Shortcuts

```typescript
useEffect(() => {
  const handler = (e: KeyboardEvent) => {
    if (e.key === 'n' && !isInputFocused()) openNewReservation();
    if (e.key === '/' && !isInputFocused()) openSearch();
    if (e.key === 'Escape') closeDrawer();
  };
  window.addEventListener('keydown', handler);
  return () => window.removeEventListener('keydown', handler);
}, []);
```

## Acceptance Criteria

- [ ] Week view renders 7 date columns with room rows
- [ ] Rooms are grouped by room type with collapsible groups
- [ ] Reservation chips span correct number of columns (checkIn to checkOut exclusive)
- [ ] Chips show guest name, are colored by status
- [ ] Hover shows tooltip with reservation details
- [ ] OOO ranges are visually distinct (hatched pattern)
- [ ] Today's column is highlighted
- [ ] Date navigation updates the grid and URL
- [ ] Occupancy summary shows per-date stats with color coding
- [ ] Virtualization activates for properties > 50 rooms
- [ ] Empty cells are clickable (prepare for quick create in Session 15)
- [ ] Loading skeleton renders during data fetch
- [ ] Keyboard shortcuts work (N, /, Esc)

---

# SESSION 14 — Frontend: Drag-and-Drop & Resize Interactions

## Context

Session 14 of 18. This is the most technically challenging frontend session. You are implementing drag-and-drop move and resize for the calendar.

## Attached Files

- `CONVENTIONS.md`, `CLAUDE.md`
- `oppsera_pms_calendar_interaction_spec.md` (follow EXACTLY — this is the contract)

## Your Task

### 1. Drag-and-Drop Framework

Use a lightweight approach — do NOT use a heavy library like react-beautiful-dnd. Instead use:
- Native HTML5 drag-and-drop API, OR
- Pointer events (`pointerdown`, `pointermove`, `pointerup`) for more control

**Recommended: Pointer events approach** for better control over:
- Visual feedback during drag
- Custom hit testing (snap to grid cells)
- Touch support

### 2. Drag to Move Interaction: `hooks/use-calendar-drag.ts`

```typescript
export function useCalendarDrag(
  calendarData: ProcessedCalendarData,
  onMove: (payload: CalendarMovePayload) => Promise<void>,
  onResize: (payload: CalendarResizePayload) => Promise<void>,
) {
  // State
  const [dragState, setDragState] = useState<DragState | null>(null);
  // ... 
}

interface DragState {
  type: 'move' | 'resize';
  reservationId: string;
  originalPosition: { roomId: string; checkInDate: string; checkOutDate: string };
  currentPosition: { roomId: string; startCol: number };  // current drag position
  edge?: 'LEFT' | 'RIGHT';  // for resize
  isValid: boolean;  // whether current position is valid
  invalidReason?: string;  // "Room already booked for Mar 12-14"
}
```

**Move gesture:**
1. `pointerdown` on reservation chip → start drag
2. `pointermove` → calculate which grid cell the pointer is over
3. Snap to cell grid (compute target room + target date)
4. **Client-side validation:**
   - Check if target cells overlap any existing chips
   - Check if target room has OOO for any date in range
   - Check reservation status (IMMOVABLE → don't start drag)
5. Show visual feedback:
   - Ghost chip at new position (semi-transparent)
   - Green highlight if valid, red if invalid
   - Tooltip with error reason if invalid
6. `pointerup` → if valid position:
   - If status is `CHECKED_IN` → show confirm modal, wait for confirm
   - Otherwise → apply optimistically, show undo toast

### 3. Optimistic Update Pattern

```typescript
async function handleMove(payload: CalendarMovePayload) {
  // 1. Save previous state for undo
  const previousState = cloneDeep(calendarData);
  
  // 2. Optimistically update local calendar data
  updateCalendarLocally(payload);
  
  // 3. Show undo toast
  const undoTimer = showUndoToast('Reservation moved', () => {
    // Undo: restore previous state + send reverse move to server
    restoreCalendarData(previousState);
    sendReverseMove(payload);
  });
  
  // 4. Send to server
  try {
    const result = await calendarMove(payload);
    // 5. Reconcile: update local data with server response (new version, recalculated amounts)
    reconcileWithServer(result);
  } catch (error) {
    // 6. Revert on error
    restoreCalendarData(previousState);
    clearUndoToast(undoTimer);
    
    if (error.code === 'ROOM_ALREADY_BOOKED') {
      showErrorTooltip(payload.to.roomId, payload.to.checkInDate, error.message);
    } else if (error.code === 'CONCURRENCY_CONFLICT') {
      showToast('Reservation was modified. Refreshing...', 'warning');
      refetchCalendar();
    } else {
      showToast(error.message, 'error');
    }
  }
}
```

### 4. Resize Interaction

**Gesture:**
- Hover over left or right edge of chip → cursor changes to `col-resize`
- `pointerdown` on edge → start resize
- `pointermove` → extend/retract the chip edge
- Show the new date as the user drags
- Snap to column boundaries

**Client-side validation (before server call):**
- Cannot resize below 1 night
- CHECKED_IN: left edge (checkInDate) is locked; right edge can only extend, not shorten
- Check for OOO and overlap conflicts on newly exposed dates

### 5. Conflict Detection (Client-Side)

Build a fast in-memory conflict checker:

```typescript
function checkConflict(
  calendarData: ProcessedCalendarData,
  targetRoomId: string,
  targetStartDate: string,
  targetEndDate: string,
  excludeReservationId: string,
): { hasConflict: boolean; reason?: string } {
  // Find the room in calendar data
  // Check if any existing chip (excluding the one being moved) overlaps
  // Check if any OOO block overlaps
  // Return result
}
```

This provides instant feedback during drag. Server still validates definitively.

### 6. Visual Feedback Components

**Ghost Chip:** Semi-transparent copy of the reservation chip that follows the cursor during drag

**Drop Target Highlight:** Cells in the target range highlight green (valid) or red (invalid)

**Snap Back Animation:** If drop is invalid, chip animates back to original position (CSS transition)

**Undo Toast:**
```typescript
function UndoToast({ message, onUndo, duration = 8000 }) {
  // Auto-dismiss after 8 seconds
  // "Reservation moved. [Undo]" with countdown indicator
}
```

### 7. Confirm Modal (for CHECKED_IN moves)

```typescript
function MoveCheckedInConfirmModal({ reservation, targetRoom, onConfirm, onCancel }) {
  return (
    <ConfirmDialog
      open={true}
      title="Move Checked-In Guest?"
      description={`Move ${reservation.guestName} from Room ${reservation.roomNumber} to Room ${targetRoom.roomNumber}?`}
      onConfirm={onConfirm}
      onClose={onCancel}
      confirmLabel="Move Guest"
    />
  );
}
```

### 8. Idempotency Key Generation

Generate unique idempotency keys for each drag operation:

```typescript
function generateIdempotencyKey(): string {
  return `cal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
```

### 9. Performance: 16ms Frame Budget

- Drag calculations must complete within 16ms (one frame at 60fps)
- Pre-compute cell positions on mount and window resize
- Use `requestAnimationFrame` for smooth ghost chip positioning
- Avoid re-rendering the entire grid during drag — only update the ghost chip and target highlight

### 10. Touch Support

- All pointer events work for both mouse and touch
- On touch devices, long-press (300ms) initiates drag (to distinguish from scroll)
- Show visual indicator during long-press
- Cancel drag on scroll

## Acceptance Criteria (from calendar interaction spec)

1. [ ] Dragging a CONFIRMED reservation to an available slot updates UI immediately and persists after server confirms
2. [ ] Dragging into an occupied range is rejected with `ROOM_ALREADY_BOOKED` and UI reverts
3. [ ] Dragging into OUT_OF_ORDER dates is rejected with `ROOM_OUT_OF_ORDER`
4. [ ] Resizing to zero nights is blocked client-side
5. [ ] Resizing across a conflict is rejected and UI reverts with clear message
6. [ ] CANCELLED/NO_SHOW/CHECKED_OUT reservations are not draggable or resizable
7. [ ] CHECKED_IN moves require confirmation modal; without confirm no change occurs
8. [ ] Undo restores the reservation to its prior room/dates and persists via server call
9. [ ] Concurrency: if version is stale, UI refreshes reservation state
10. [ ] All successful moves/resizes create audit log entries (verified via reservation detail)
11. [ ] UI updates within 16ms during drag operations
12. [ ] Touch devices support long-press to initiate drag

---

# SESSION 15 — Frontend: Reservation Drawer, Quick Create & Right-Click Menu

## Context

Session 15 of 18. You are building the reservation create/edit UI and the calendar context menus.

## Attached Files

- `CONVENTIONS.md`, `CLAUDE.md`
- `oppsera_pms_calendar_interaction_spec.md` (§3.1 for quick create, §5 for menus)

## Your Task

### 1. Reservation Drawer: `components/pms/reservation-drawer.tsx`

A side drawer (right-side panel) for creating and editing reservations.

**Create mode fields:**
- Guest search (autocomplete from existing guests) or quick-add new guest
- Check-in date (date picker)
- Check-out date (date picker)
- Room type (dropdown)
- Room assignment (dropdown, filtered by type + availability, or "Auto-assign")
- Rate plan (dropdown)
- Nightly rate (currency input, pre-filled from rate plan)
- Adults / Children (number inputs)
- Source type (dropdown: Direct, Phone, Walk-in)
- Internal notes (textarea)
- Guest notes (textarea)

**Calculated fields (live update):**
- Number of nights
- Subtotal (nights × rate)
- Tax estimate
- Total

**Validation:**
- Check-out > check-in
- Adults + children <= room type max occupancy
- Rate > 0

**Edit mode:**
- Same form, pre-filled with existing data
- Some fields may be read-only based on status (e.g., dates locked if CHECKED_IN)
- Show diff indicator on changed fields

### 2. Quick Create from Calendar

Two interaction paths (from calendar interaction spec §3.1):

**Single cell click:**
- Open reservation drawer with:
  - `checkInDate` = clicked date
  - `checkOutDate` = clicked date + 1
  - `roomId` = clicked room (pre-selected)

**Click-drag across empty cells:**
- Open reservation drawer with:
  - `checkInDate` = first selected date
  - `checkOutDate` = last selected date + 1
  - `roomId` = the room row dragged across

Implementation:
```typescript
// In calendar grid
function handleCellClick(roomId: string, date: string) {
  openDrawer({
    mode: 'create',
    prefill: { roomId, checkInDate: date, checkOutDate: addDays(date, 1) },
  });
}

function handleCellRangeDrag(roomId: string, startDate: string, endDate: string) {
  openDrawer({
    mode: 'create',
    prefill: { roomId, checkInDate: startDate, checkOutDate: addDays(endDate, 1) },
  });
}
```

### 3. Guest Quick-Add Inline

When creating a reservation, allow inline guest creation:
- Guest search field with "Create new guest" option at bottom
- Clicking "Create new" expands inline fields: first name, last name, email, phone
- Creates guest record as part of the reservation creation (or just before)

### 4. Room Availability Indicator

In the room dropdown, show availability status:
```
Room 101 (Standard) ✓ Available
Room 102 (Standard) ✗ Booked Mar 15-18
Room 103 (Standard) ✗ Out of Order
Room 201 (Deluxe) ✓ Available
```

Fetch availability for the selected date range when dates change.

### 5. Right-Click / Overflow Menu on Reservation Chips

From calendar interaction spec §5:

```typescript
function ReservationContextMenu({ reservation, position, onClose }) {
  const menuItems = [
    { label: 'Open Reservation', icon: ExternalLink, action: () => navigateToReservation(reservation.id) },
    // Conditional items based on status:
    reservation.status === 'CONFIRMED' && { label: 'Check In', icon: LogIn, action: () => handleCheckIn(reservation.id) },
    reservation.status === 'CHECKED_IN' && { label: 'Check Out', icon: LogOut, action: () => handleCheckOut(reservation.id) },
    reservation.status === 'CONFIRMED' && { label: 'Cancel', icon: X, action: () => handleCancel(reservation.id), destructive: true },
    reservation.status === 'CONFIRMED' && { label: 'Mark No-Show', icon: UserX, action: () => handleNoShow(reservation.id), destructive: true },
    { label: 'Move to Room...', icon: ArrowRightLeft, action: () => openRoomPicker(reservation.id) },
    { label: 'Add Note', icon: StickyNote, action: () => openNoteDialog(reservation.id) },
    { label: 'View Audit Trail', icon: History, action: () => openAuditTrail(reservation.id) },
  ].filter(Boolean);

  return <ContextMenu items={menuItems} position={position} onClose={onClose} />;
}
```

### 6. Right-Click Menu on Room Row

```typescript
function RoomContextMenu({ room, position, onClose }) {
  const menuItems = [
    room.isOutOfOrder
      ? { label: 'Clear Out of Order', action: () => clearOOO(room.id) }
      : { label: 'Set Out of Order', action: () => setOOO(room.id) },
    { label: 'Set Clean', action: () => setRoomStatus(room.id, 'VACANT_CLEAN') },
    { label: 'Set Dirty', action: () => setRoomStatus(room.id, 'VACANT_DIRTY') },
  ];
  // ...
}
```

### 7. Confirmation Dialogs

Create confirm dialogs for destructive actions:

```typescript
// Cancel reservation
<ConfirmDialog
  title="Cancel Reservation?"
  description={`Cancel reservation for ${guestName}? This action cannot be undone.`}
  destructive
  confirmLabel="Cancel Reservation"
/>

// No-show
<ConfirmDialog
  title="Mark as No-Show?"
  description={`Mark ${guestName}'s reservation as a no-show?`}
  destructive
  confirmLabel="Mark No-Show"
/>
```

## Acceptance Criteria

- [ ] Reservation drawer opens for create and edit modes
- [ ] Quick create from single cell click pre-fills date + room
- [ ] Quick create from cell range drag pre-fills date range + room
- [ ] Guest search autocomplete works with "Create new" option
- [ ] Room dropdown shows availability for selected dates
- [ ] Calculated totals update live as inputs change
- [ ] Right-click on chip shows context menu with status-appropriate actions
- [ ] Right-click on room row shows housekeeping/OOO actions
- [ ] Destructive actions (cancel, no-show) require confirmation dialog
- [ ] Drawer closes on Escape key
- [ ] Form validation prevents submission of invalid data

---

# SESSION 16 — Frontend: Front Desk Dashboard & Check-In/Out Flows

## Context

Session 16 of 18. You are building the front desk operational screens — the daily workflow for desk clerks.

## Attached Files

- `CONVENTIONS.md`, `CLAUDE.md`
- PMS spec files

## Your Task

### 1. Front Desk Dashboard: `front-desk/front-desk-content.tsx`

Three-panel dashboard for today's operations:

**Panel 1: Arrivals (Expected Today)**
- List of reservations with `checkInDate = today` and `status = CONFIRMED`
- Show: guest name, room type, room assignment (or "Unassigned"), arrival time (if tracked)
- Action button: [Check In] for each
- Sort by: room number (assigned first), then by guest name

**Panel 2: In-House (Currently Checked In)**
- List of reservations with `status = CHECKED_IN`
- Show: guest name, room number, check-in date, expected check-out date
- Highlight if departing today
- Action: [Check Out] for departing, [View] for others

**Panel 3: Departures (Expected Today)**
- List of reservations with `checkOutDate = today` and `status = CHECKED_IN`
- Show: guest name, room number, balance (from folio)
- Action: [Check Out]

**Header stats:**
```
Arrivals: 8 | In-House: 22 | Departures: 5 | Available: 8 rooms
```

### 2. Check-In Flow

When [Check In] is clicked:

**Step 1: Room Assignment (if not pre-assigned)**
- Show room picker modal filtered to available rooms of the correct type
- Suggest rooms (from `suggestAvailableRooms` API)
- Show room features (floor, bed config, amenities)

**Step 2: Confirm Check-In**
- Show summary: Guest, Room, Dates, Rate, Total
- Confirm button

**Step 3: Execute**
- Call `POST /api/v1/pms/reservations/:id/check-in`
- On success:
  - Update dashboard lists (remove from arrivals, add to in-house)
  - Show success toast
  - Optionally: print registration card (v2)

**Early check-in:**
- If today is before `checkInDate`, show warning: "This is an early check-in. An extra night will be charged."
- Require confirmation

### 3. Check-Out Flow

When [Check Out] is clicked:

**Step 1: Folio Review**
- Show folio summary: total charges, total payments, balance
- If balance > 0: "Outstanding balance: $X.XX" with warning
- v1: allow checkout with balance (payment collected externally)
- v2: require payment or authorization

**Step 2: Confirm Check-Out**
- Confirm button: "Complete Check-Out"

**Step 3: Execute**
- Call `POST /api/v1/pms/reservations/:id/check-out`
- On success:
  - Update dashboard lists
  - Show success toast: "Room 101 checked out. Room marked as dirty."

**Late check-out:**
- If today is after `checkOutDate`, show: "This is a late check-out. Extra night charges will be added."
- Require confirmation

### 4. No-Show Action

Available from arrivals list for past-due check-ins:
- Show confirmation: "Mark as no-show? Room block will be released."
- Call API
- Update lists

### 5. Quick Search Bar

At top of front desk page:
- Search by guest name, reservation ID, room number
- Instant results dropdown
- Navigate to reservation detail or guest profile

### 6. Responsive / Tablet Layout

The front desk dashboard MUST work well on iPad (1024px width):
- Three panels stack vertically on tablet portrait
- Side-by-side on landscape
- All touch targets >= 44px
- Large, readable fonts for room numbers and guest names
- Check-in/check-out buttons are prominently sized

## Acceptance Criteria

- [ ] Dashboard shows arrivals, in-house, and departures for today
- [ ] Header stats show correct counts
- [ ] Check-in flow handles room assignment for unassigned reservations
- [ ] Check-in shows early check-in warning when applicable
- [ ] Check-out shows folio summary with balance
- [ ] Check-out shows late check-out warning when applicable
- [ ] No-show requires confirmation
- [ ] Quick search finds by guest name, reservation ID, or room number
- [ ] Dashboard updates after each action (optimistic + refetch)
- [ ] Layout works on iPad in both portrait and landscape
- [ ] Touch targets are at least 44px

---

# SESSION 17 — Frontend: Housekeeping Board, Guest Search & Folio View

## Context

Session 17 of 18. You are building the remaining PMS screens: housekeeping management, guest profiles, and folio detail.

## Attached Files

- `CONVENTIONS.md`, `CLAUDE.md`
- PMS spec files

## Your Task

### 1. Housekeeping Board: `housekeeping/housekeeping-content.tsx`

Grid or list view of all rooms with current status:

**Layout options (togglable):**
- **Grid view:** Room cards organized by floor/section
- **List view:** Table with sortable columns

**Each room shows:**
- Room number (large)
- Room type
- Current status (color-coded badge: green=clean, amber=dirty, blue=occupied, red=OOO)
- Guest name (if occupied)
- Departing today flag
- Arriving today flag

**Quick actions per room:**
- Click room → toggle status cycle: dirty → clean → inspected (v2: inspected is tracked)
- For v1: toggle between `VACANT_DIRTY` → `VACANT_CLEAN`
- Cannot change `OCCUPIED` rooms via this board (check-out handles that)
- OOO rooms: show set/clear option

**Filters:**
- Status filter: All, Dirty, Clean, Occupied, OOO
- Floor filter (if floors are used)
- Room type filter
- "Departures only" toggle (show only rooms with guests checking out today)

**Summary bar:**
```
Clean: 12 | Dirty: 8 | Occupied: 22 | OOO: 2 | Total: 44
```

### 2. Guest Search & List: `guests/guests-content.tsx`

- Search input (debounced 300ms)
- Search by name, email, or phone
- Results table: name, email, phone, total stays, last visit date
- Click to navigate to guest profile

### 3. Guest Profile: `guests/[id]/guest-profile-content.tsx`

**Profile header:**
- Name, email, phone
- Tags (v2)
- Edit button

**Stay history:**
- Table of reservations: dates, room, status, total
- Sort by most recent
- Click to navigate to reservation detail

**Notes / Preferences (v2 hook):**
- Show preferences JSON as readable key-value pairs
- Notes field

### 4. Folio Detail View: `components/pms/folio-detail.tsx`

Used both as a standalone page and embedded in reservation detail.

**Folio header:**
- Guest name, reservation dates, room
- Folio status (OPEN/CLOSED badge)
- Totals: Charges, Tax, Fees, Payments, Balance

**Entries table:**
| Date | Description | Type | Amount |
|---|---|---|---|
| Mar 15 | Room charge - Mar 15 | ROOM_CHARGE | $149.00 |
| Mar 15 | Tax - Mar 15 | TAX | $14.90 |
| Mar 16 | Room charge - Mar 16 | ROOM_CHARGE | $149.00 |
| Mar 16 | Tax - Mar 16 | TAX | $14.90 |
| Mar 17 | Minibar | ADJUSTMENT | $12.50 |
| **Balance** | | | **$339.30** |

**Actions (if folio is OPEN):**
- [Post Charge] → opens form: description, amount, type
- [Post Payment] → opens form: amount, reference (v1: manual entry)
- [Close Folio] → confirmation required

### 5. Reservation Detail Page: `reservations/[id]/reservation-detail-content.tsx`

Full reservation view:

**Header:**
- Status badge, guest name, reservation ID
- Action buttons: based on status (Check In, Check Out, Cancel, No-Show, Edit)

**Details section:**
- Dates, room, room type, rate plan, rate, source
- Guest info (name, email, phone)
- Notes (internal + guest)

**Folio section:**
- Embedded folio detail component
- Link to full folio page

**Audit trail:**
- Timeline of changes: created, modified, moved, status changes
- Each entry shows: timestamp, actor, action, details/diff

### 6. Room List & Detail

**Room list:** `rooms/rooms-content.tsx`
- Table: room number, room type, floor, status, current guest
- Filters: room type, status, floor
- Actions: edit, set OOO

**Room detail:** `rooms/[id]/room-detail-content.tsx`
- Room info, type, features
- Current status with history (from `pms_room_status_log`)
- Current/upcoming reservations for this room

### 7. Rate Plan Pages

**Rate plan list:** `rates/rates-content.tsx`
- Table of rate plans with default indicator
- Create new rate plan button

**Rate plan detail:** `rates/[id]/rate-plan-content.tsx`
- Rate plan info
- Price matrix: room types × date ranges
- Edit prices inline or via form

## Acceptance Criteria

- [ ] Housekeeping board shows all rooms with color-coded status
- [ ] Quick status toggle works (dirty → clean) with instant feedback
- [ ] Housekeeping filters work for status, floor, room type
- [ ] Guest search returns results within 300ms of typing
- [ ] Guest profile shows stay history
- [ ] Folio detail shows all entries with running balance
- [ ] Folio charge/payment posting works for open folios
- [ ] Reservation detail shows full info + embedded folio + audit trail
- [ ] Room list and detail pages work with filters
- [ ] Rate plan detail shows price matrix by room type

---

# SESSION 18 — Hardening: Audit, Testing, Performance & Observability

## Context

Session 18 of 18. Final session. You are hardening the module for production: comprehensive audit logging, tests, performance validation, and observability.

## Attached Files

- `CONVENTIONS.md`, `CLAUDE.md`
- PMS spec files

## Your Task

### 1. Comprehensive Audit Logging

Verify every state-changing operation writes to `pms_audit_log`:

**Audit entries required for:**
- Reservation: created, updated, moved, resized, cancelled, checked-in, checked-out, no-show
- Room: status changed, OOO set/cleared, created, updated
- Folio: created, charge posted, payment posted, closed
- Guest: created, updated
- Rate plan: created, updated, price changed
- Property: created, updated

**Audit entry format:**
```typescript
{
  entityType: 'RESERVATION',
  entityId: reservationId,
  action: 'reservation.moved',
  diffJson: {
    roomId: { before: 'room_abc', after: 'room_def' },
    checkInDate: { before: '2025-03-15', after: '2025-03-16' },
  },
  correlationId: requestId,
}
```

**PII in audit logs:**
- Guest name changes: log as `{ before: '[REDACTED]', after: '[REDACTED]' }` or hash
- Email/phone changes: log field name but not values

### 2. Idempotency Implementation

Verify the idempotency layer works correctly:

**Test scenarios:**
- Send same calendar move with same `idempotencyKey` twice → second returns cached result
- Send same move with different `idempotencyKey` → processed as separate operations
- Expired idempotency keys are cleaned up (TTL: 24 hours)

**Implementation verification:**
```typescript
// In move command:
const existing = await tx.select().from(pmsIdempotencyKeys)
  .where(and(
    eq(pmsIdempotencyKeys.tenantId, ctx.tenantId),
    eq(pmsIdempotencyKeys.key, input.idempotencyKey),
    gt(pmsIdempotencyKeys.expiresAt, new Date()),
  ));
if (existing.length > 0) {
  return JSON.parse(existing[0].responseJson);
}
```

### 3. Unit Tests

Create tests in `packages/modules/pms/src/__tests__/`:

**`reservation-state-machine.test.ts`**
- Test all valid transitions
- Test all invalid transitions throw `InvalidStatusTransitionError`
- Test `ACTIVE_RESERVATION_STATUSES` and `IMMOVABLE_STATUSES`

**`availability.test.ts`**
- Test overlap detection with various scenarios:
  - No overlap → available
  - Exact overlap → conflict
  - Partial overlap (start or end) → conflict
  - Adjacent (checkout = checkin of next) → no conflict (half-day boundary)
  - Self-overlap exclusion (for moves)

**`create-reservation.test.ts`**
- Valid creation → success with correct totals
- Missing required fields → validation error
- Occupancy exceeded → error
- Room already booked → `RoomAlreadyBookedError`
- Room OOO → `RoomOutOfOrderError`

**`move-reservation.test.ts`**
- Valid move to empty room → success
- Move to occupied room → `ROOM_ALREADY_BOOKED`
- Move cancelled reservation → `RESERVATION_NOT_MOVABLE`
- Version conflict → `CONCURRENCY_CONFLICT`
- Idempotent retry → returns cached result

**`calendar-projector.test.ts`**
- Reservation created → segments created for each night
- Reservation cancelled → segments deleted
- Reservation moved → old segments deleted, new segments created
- Segment count matches number of nights

### 4. Integration Tests (if test DB available)

**`calendar-week.integration.test.ts`**
- Seed a property with rooms and reservations
- Query week view
- Verify response matches expected shape
- Verify performance < 300ms

### 5. E2E Test Scenarios (document for manual or Playwright)

```
1. Create property → add room types → add rooms → add rate plan → set prices
2. Create reservation via calendar quick-create → verify chip appears
3. Drag reservation to new room → verify move persists
4. Resize reservation (extend) → verify dates update
5. Check in guest → verify room turns occupied, charges posted to folio
6. Check out guest → verify room turns dirty, folio closes
7. Cancel reservation → verify chip disappears, room block released
8. Mark no-show → verify status updates
9. Housekeeping: mark room clean → verify status updates on calendar
10. Two users: move same reservation simultaneously → one gets concurrency error
```

### 6. Performance Budgets

Document and verify:

| Operation | Target | Measurement |
|---|---|---|
| Calendar week view (200 rooms) | < 300ms server | API response time |
| Calendar move (optimistic) | < 16ms UI | Frame budget |
| Calendar move (server) | < 500ms | API response time |
| Reservation create | < 500ms | API response time |
| Check-in | < 500ms | API response time |
| Housekeeping board load | < 300ms | API response time |
| Guest search | < 200ms | API response time |
| Read model projection lag | < 2s | Event → read model update |

### 7. Observability

**Metrics to track:**
```typescript
// Server-side
pms_calendar_week_load_ms        // histogram
pms_reservation_write_ms         // histogram
pms_calendar_move_success_count  // counter
pms_calendar_move_conflict_count // counter
pms_projector_lag_seconds        // gauge
pms_occupancy_rate               // gauge per property per date

// Client-side (analytics events)
pms_calendar_drag_started       // count
pms_calendar_drag_completed     // count
pms_calendar_drag_cancelled     // count (user cancelled or error)
```

**Structured logging:**
Every PMS API request should log:
```json
{
  "module": "pms",
  "action": "calendar.move",
  "tenantId": "...",
  "propertyId": "...",
  "reservationId": "...",
  "durationMs": 142,
  "success": true,
  "correlationId": "..."
}
```

**Tracing points:**
- API request → service command → DB write → outbox enqueue → projection update
- Each step should carry the same `correlationId` (from `requestId`)

### 8. Security Review

Verify:
- [ ] All API routes check `tenantId` — no cross-tenant data access
- [ ] All routes require authentication (no `{ public: true }` on PMS routes)
- [ ] All routes check permissions via `withMiddleware`
- [ ] Guest PII is not logged in plain text
- [ ] Rate information is not exposed to housekeeping role
- [ ] Room assignment cannot be changed by housekeeping role
- [ ] Version/idempotency keys prevent replay attacks

### 9. Extension Hooks Documentation

Create `packages/modules/pms/EXTENSION_HOOKS.md`:

```markdown
# PMS Extension Hooks (v2 Roadmap)

## Booking Engine Integration
- `pms_reservations.source_type` = 'BOOKING_ENGINE'
- `pms_reservations.source_ref` stores external booking ID
- Subscribe to `pms.reservation.created.v1` for availability sync

## Channel Manager / OTA
- Future tables: `pms_channel_mappings`, `pms_channel_reservations`
- `source_type` = 'OTA', `source_ref` = channel booking reference
- Two-way sync via events

## Payment Integration
- `pms_folio_entries.source_ref` stores payment intent ID
- `pms_folios` can add `payment_provider`, `payment_token_ref` columns
- Events: `pms.folio.charge_posted.v1` for payment capture triggers

## Messaging Automation
- Subscribe to reservation events for email/SMS triggers
- Future table: `pms_message_templates`, `pms_message_log`

## Revenue Management
- Future tables: `pms_restrictions` (min stay, CTA/CTD)
- `pms_rate_plan_prices` can add yield management columns
- Rate engine hook in reservation create flow

## GL Integration
- `pms.folio.charge_posted.v1` → AccountingPostingApi
- Same adapter pattern as POS → GL bridge

## Multi-Property
- All tables already have `property_id`
- Property selector in UI replaces single-property context
- Cross-property reporting via `rm_pms_daily_occupancy` aggregation
```

### 10. Final Module Index

Update `packages/modules/pms/src/index.ts` with all exports:

```typescript
// Schema
export * from './schema';

// Types & enums
export * from './types';
export * from './errors';
export * from './permissions';

// State machines
export * from './state-machines';

// Validation
export * from './validation';

// Commands
export { createProperty } from './commands/create-property';
export { createReservation } from './commands/create-reservation';
export { moveReservation } from './commands/move-reservation';
export { resizeReservation } from './commands/resize-reservation';
// ... all other commands

// Queries
export { getCalendarWeek } from './queries/calendar-week';
export { listReservations } from './queries/list-reservations';
// ... all other queries

// Events
export { PMS_EVENTS } from './events/types';
export { registerPmsEventConsumers } from './events/consumers';

// Internal API
export { getPmsReadApi, type PmsReadApi } from './internal-api';
```

## Acceptance Criteria

- [ ] Every state-changing operation has an audit log entry
- [ ] PII is redacted/hashed in audit logs
- [ ] Idempotency prevents duplicate calendar operations
- [ ] State machine tests cover all transitions (valid and invalid)
- [ ] Availability tests cover all overlap scenarios including adjacent bookings
- [ ] Move/resize tests cover success, conflict, concurrency, and idempotency
- [ ] Calendar projector tests verify correct segment creation/deletion
- [ ] E2E test scenarios are documented
- [ ] Performance budgets are defined and verifiable
- [ ] Observability metrics and logging patterns are implemented
- [ ] Security checklist passes
- [ ] Extension hooks document covers all v2 integration points
- [ ] Module index exports everything needed
- [ ] Module is ready for production deployment

---

# Appendix: Session Dependencies

```
Session 1 (Schema) ─────────────────────────────────────────────────┐
Session 2 (Types/Validation) ────────────────────────────────────┐  │
Session 3 (Property/Room Services) ──────────────────────────┐   │  │
Session 4 (Rate Plan/Guest Services) ────────────────────┐   │   │  │
Session 5 (Reservation Service) ◄────────────────────────┤   │   │  │
Session 6 (Reservation API + Calendar Move/Resize) ◄─────┤   │   │  │
Session 7 (Front Desk Workflows) ◄───────────────────────┤   │   │  │
Session 8 (Housekeeping + Folio) ◄───────────────────────┘   │   │  │
Session 9 (Events + Projectors) ◄─────────────────────────────┤   │  │
Session 10 (Calendar Read Model API) ◄────────────────────────┤   │  │
Session 11 (Permissions + Jobs + Seed) ◄──────────────────────┘   │  │
                                                                   │  │
Session 12 (Frontend: Layout + Types + Hooks) ◄────────────────────┤  │
Session 13 (Frontend: Calendar Grid) ◄────────────────────────────┤  │
Session 14 (Frontend: Drag-and-Drop) ◄────────────────────────────┤  │
Session 15 (Frontend: Drawer + Menus) ◄────────────────────────────┤  │
Session 16 (Frontend: Front Desk) ◄────────────────────────────────┤  │
Session 17 (Frontend: Housekeeping + Guests + Folio) ◄─────────────┘  │
Session 18 (Hardening: Tests + Audit + Performance) ◄─────────────────┘
```

**Estimated effort per session:** 2-4 hours of focused AI-assisted coding

**Total estimated effort:** ~45-65 hours of implementation
