# OppsEra PMS Module — Reference Architecture (v1 Core with v2 Provisioning)

> Goal: A **calendar-first** Property Management System module (hotel/lodge) inside OppsEra’s modular monolith, delivering **instant drag-and-drop reservation operations** in v1, while provisioning clean hooks for v2 (booking engine, channels, payments, messaging automation, RMS rules).

---

## 1. Architectural Principles

### 1.1 Calendar-first performance
- Calendar views must be **read-model powered** (denormalized projections), not OLTP joins at runtime.
- All calendar interactions are **optimistic UI**, validated server-side with deterministic conflict checks.

### 1.2 Strong invariants, explicit lifecycles
- Reservations and room statuses are governed by **state machines**.
- All writes emit **domain events**; all critical actions are **audited**.

### 1.3 Multi-tenant from day one
- Every record includes `tenantId`.
- Tenant isolation enforced in:
  - DB constraints (FKs include `tenantId` where practical)
  - Query filters / RLS policy (if OppsEra uses RLS)
  - Service-layer guards

### 1.4 Versioned concurrency
- Reservation writes use **optimistic locking** (`version` integer).
- Calendar moves are atomic and idempotent (via `idempotencyKey`).

### 1.5 Bounded context & clean seams
- PMS is a bounded context: it owns rooms, availability, stays, folios.
- It integrates via events + narrow interfaces with:
  - Customers/CRM (guest profiles)
  - Accounting (posting/export later)
  - Payments (tokenization boundary)
  - Messaging (email/SMS automation)

---

## 2. Module Boundaries (Bounded Context)

### 2.1 PMS owns
- Property configuration (property/room types/rooms)
- Reservations (booking records)
- Stays (optional v1; can be folded into reservation initially)
- Housekeeping statuses
- Folios and charges (minimal v1)
- Calendar read models

### 2.2 PMS consumes
- **Identity/Auth** (OppsEra)
- **Users/RBAC** (OppsEra)
- Optional: shared **Customers** module (if exists). If not, PMS contains `pms_guests` (v1) and can later map to global customers.

### 2.3 PMS publishes
- Reservation events for other modules (reporting, messaging, payments hooks)
- Folio events for accounting/payment hooks

---

## 3. Service Decomposition (Inside Modular Monolith)

> Keep it simple: services are logical, not microservices.

### 3.1 Core services
- `PropertyService`
  - room type/room config, out-of-order rules
- `ReservationService`
  - create/edit/cancel/no-show/check-in/check-out
- `AvailabilityService`
  - conflict checks, occupancy rules, suggestions
- `CalendarService`
  - calendar read-model queries, move/resize operations
- `HousekeepingService`
  - room status transitions, task lists
- `FolioService`
  - nightly charges, adjustments, tax/fee application (minimal)

### 3.2 Supporting services
- `AuditService`
  - immutable audit log entries for all critical mutations
- `IdempotencyService`
  - safely retry drag/drop operations without double-writing
- `PolicyService` (v2)
  - cancellation/no-show rules, deposit schedules

---

## 4. Domain Model Overview

### 4.1 Primary aggregates (v1)
- **Reservation** (aggregate root)
  - invariants: no overlaps per room; valid transitions; date integrity
- **Room**
  - invariants: status transitions; out-of-order blocks assignment
- **Folio** (lightweight)
  - invariant: immutable ledger-style entries (don’t edit history; post adjustments)

### 4.2 Reservation state machine (v1)
Statuses:
- `HOLD` → `CONFIRMED` → `CHECKED_IN` → `CHECKED_OUT`
- `CONFIRMED` → `CANCELLED`
- `CONFIRMED` → `NO_SHOW`
Rules:
- Cannot check in if cancelled/no-show/checked-out
- Cannot check out unless checked-in
- No-show allowed only after arrival date/time threshold (policy)

### 4.3 Room status state machine (v1)
- `VACANT_CLEAN`
- `VACANT_DIRTY`
- `OCCUPIED`
- `OUT_OF_ORDER`
Rules:
- check-in sets room to `OCCUPIED`
- check-out sets room to `VACANT_DIRTY` (unless out-of-order)

---

## 5. Domain Events (v1 + v2 ready)

### 5.1 Reservation events
- `ReservationCreated`
- `ReservationUpdated`
- `ReservationMoved` (room or dates changed)
- `ReservationCancelled`
- `ReservationNoShowMarked`
- `ReservationCheckedIn`
- `ReservationCheckedOut`

### 5.2 Room/housekeeping events
- `RoomStatusChanged`
- `RoomOutOfOrderSet`
- `RoomOutOfOrderCleared`

### 5.3 Folio events
- `FolioCreated`
- `FolioChargePosted`
- `FolioAdjustmentPosted`
- `FolioClosed`

### 5.4 Integration events (v2)
- `BookingEngineReservationImported`
- `ChannelReservationImported`
- `PaymentAuthorizationRequested`
- `GuestMessageScheduled`

---

## 6. Data Strategy: OLTP + Read Models

### 6.1 OLTP tables (source of truth)
- rooms, room types, reservations, guests, folios, charges, audit log

### 6.2 Read models (speed)
- `rm_pms_calendar_segments`
  - one row per reservation x room x day (or segment) for fast week rendering
- `rm_pms_daily_occupancy`
  - occupancy counts by date for dashboards and availability quick checks

### 6.3 Projection strategy
- Write path emits events in a transaction (outbox pattern).
- Projectors consume events and upsert read models.
- Calendar UI queries read models only (no joins) for speed.

---

## 7. API Surface (high-level)

### 7.1 Core endpoints
- `POST /api/pms/reservations`
- `PATCH /api/pms/reservations/:id`
- `POST /api/pms/reservations/:id/cancel`
- `POST /api/pms/reservations/:id/check-in`
- `POST /api/pms/reservations/:id/check-out`
- `POST /api/pms/reservations/:id/no-show`

### 7.2 Calendar endpoints
- `GET /api/pms/calendar/week?start=YYYY-MM-DD`
- `POST /api/pms/calendar/move` (drag/drop)
- `POST /api/pms/calendar/resize`

### 7.3 Housekeeping endpoints
- `GET /api/pms/housekeeping/rooms?date=...`
- `POST /api/pms/rooms/:id/status`

---

## 8. Concurrency, Idempotency, and Integrity

### 8.1 Optimistic locking
- `pms_reservations.version` increments on each write.
- Writes require `If-Match: <version>` or payload `expectedVersion`.

### 8.2 Idempotency
- All calendar move/resize operations accept `idempotencyKey`.
- Server stores result keyed by `(tenantId, idempotencyKey)` for a retention window.

### 8.3 Atomic conflict checks
- Use an exclusion constraint (ideal) or transaction-level check:
  - Postgres `EXCLUDE USING gist (roomId WITH =, daterange(checkIn, checkOut) WITH &&)`
  - Or enforce via `pms_room_blocks` + serialized writes.

### 8.4 Auditability
- Every mutation writes:
  - `pms_audit_log` entry
  - event outbox entry

---

## 9. UI Architecture (OppsEra patterns)

### 9.1 Screen tree (v1)
- PMS Dashboard
- Reservations Calendar (command center)
- Reservation Drawer (create/edit)
- Rooms & Status (housekeeping view)
- Guests (search + profile)
- Folio (minimal)

### 9.2 Key UI components
- Calendar Grid (virtualized)
- Reservation Chip (draggable)
- Hover Quick Actions
- Side Drawer editor with validation
- Conflict modal with suggested alternatives
- Undo toast for moves/resizes

---

## 10. Background Jobs (provision now, implement later as needed)
- Nightly charge posting (optional v1)
- No-show marking task (policy-based)
- Pre-arrival message scheduling (v2)
- Sync jobs for OTA channels (v2)

---

## 11. Observability (minimum)
Metrics:
- calendar_week_load_ms
- reservation_write_ms
- calendar_move_success_rate
- conflict_rate
- projector_lag_seconds
Logs:
- reservation lifecycle actions with correlation IDs
Tracing:
- request → DB write → outbox enqueue → projection upsert

---

## 12. Implementation Plan (suggested)
### Milestone 1 — Data + services
- OLTP schema, basic services, invariants
### Milestone 2 — Calendar read model + UI
- projection tables, week view rendering, drag/drop
### Milestone 3 — Front desk workflows
- check-in/out, room moves, housekeeping toggles
### Milestone 4 — Folio minimal
- nightly charges, adjustments, receipts
### Milestone 5 — Hardening
- audit, idempotency, performance budgets, e2e tests

---

## 13. v2 Provisioning Hooks (don’t build, but don’t block)
- Reservation `sourceType` + `sourceRef` for channel/booking engine imports
- Payment intent references on folio (`paymentProvider`, `paymentTokenRef`)
- Messaging triggers on reservation events
- Rate plan & restriction engine tables scaffolded (empty in v1)

---
