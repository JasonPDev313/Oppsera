# Host Stand + Table Orchestration Engine — Session Plan

## Phase 0: System Audit Report

### 1. Existing Schema Inventory

#### F&B Tables (`packages/db/src/schema/fnb.ts`)

| Table | Status | Key Fields |
|---|---|---|
| `fnb_tables` | **BUILT** | id, tenantId, locationId, roomId→floor_plan_rooms, sectionId, floorPlanObjectId, tableNumber, displayLabel, capacityMin/Max, tableType, shape, position/size, isCombinable, isActive |
| `fnb_table_live_status` | **BUILT** | id, tenantId, tableId→fnb_tables, **status** (state machine), currentTabId, currentServerUserId, seatedAt, partySize, estimatedTurnTimeMinutes, guestNames, waitlistEntryId, combineGroupId, **version** (optimistic lock) |
| `fnb_table_status_history` | **BUILT** | id, tenantId, tableId, oldStatus, newStatus, changedBy, partySize, serverUserId, tabId, metadata jsonb, changedAt |
| `fnb_table_combine_groups` | **BUILT** | id, tenantId, locationId, status, primaryTableId, combinedCapacity |
| `fnb_table_combine_members` | **BUILT** | id, tenantId, combineGroupId, tableId, isPrimary |
| `fnb_sections` | **BUILT** | id, tenantId, locationId, roomId, name, color, sortOrder, isActive |
| `fnb_server_assignments` | **BUILT** | id, tenantId, locationId, sectionId, serverUserId, businessDate, status (active/cut/picked_up) |
| `fnb_my_section_tables` | **BUILT** | per-server daily table claims |
| `fnb_shift_extensions` | **BUILT** | enriches time entry with F&B data (covers, sales, tips) |
| `fnb_rotation_tracker` | **BUILT** | next-server rotation state per location/date |
| `fnb_tabs` | **BUILT** | full tab/check lifecycle with status, tableId, serverUserId, partySize, businessDate, version lock |
| `fnb_tab_items` | **BUILT** | line items with status (draft/sent/fired/served/voided) |
| `fnb_tab_courses` | **BUILT** | course pacing per tab |
| `fnb_reservations` | **BUILT** | full reservation with status, date/time, party, customer, table/server assignment, deposit, VIP, source, channel |
| `fnb_waitlist_entries` | **BUILT** | full waitlist with status, position, priority, VIP, customer, notifications, seating tracking |
| `fnb_host_settings` | **BUILT** | per-location settings (turn time, wait method, rotation, pacing, SMS templates, etc.) |
| `fnb_wait_time_history` | **BUILT** | ML training data (quoted vs actual wait, party, dayOfWeek, hourOfDay) |
| `fnb_table_turn_log` | **BUILT** | per-turn analytics (partySize, mealPeriod, seatedAt, clearedAt, turnTimeMinutes, dayOfWeek) |
| `fnb_guest_notifications` | **BUILT** | SMS/email audit trail (polymorphic referenceType/Id, status, externalId) |
| `fnb_payment_sessions` | **BUILT** | payment flow per tab |
| `rm_fnb_server_performance` | **BUILT** | CQRS read model — per server/date metrics |
| `rm_fnb_table_turns` | **BUILT** | CQRS read model — per table/date turn metrics |

#### Room Layouts (`packages/db/src/schema/room-layouts.ts`)

| Table | Status | Key Fields |
|---|---|---|
| `floor_plan_rooms` | **BUILT** | id, tenantId, locationId, name, slug, widthFt, heightFt, currentVersionId, draftVersionId, capacity |
| `floor_plan_versions` | **BUILT** | id, tenantId, roomId, versionNumber, status (draft/published/archived), snapshotJson (JSONB) |
| `floor_plan_templates_v2` | **BUILT** | id, tenantId, name, category, snapshotJson |

#### PMS (`packages/db/src/schema/pms.ts`) — Hotel context, separate from F&B

| Table | Status | Notes |
|---|---|---|
| `pms_reservations` | **BUILT** | Hotel reservations — different domain from F&B reservations |
| `pms_rooms` | **BUILT** | Hotel rooms, not restaurant tables |
| `pms_guests` | **BUILT** | Hotel guest profiles |

### 2. Existing State Machines

#### F&B Table Live Status (`fnb_table_live_status.status`)
```
TABLE_STATUSES = ['available', 'reserved', 'seated', 'ordered', 'entrees_fired',
                  'dessert', 'check_presented', 'paid', 'dirty', 'blocked']
```
**Assessment:** 10-state machine is already rich. The prompt's proposed machine (AVAILABLE → RESERVED → SEATED → ORDERING → COURSED → PAYMENT_PENDING → CLOSING → DIRTY → AVAILABLE + OUT_OF_SERVICE) maps closely but uses different names. The existing names are better because they're already used in CSS design tokens, UI components, and 1,011 tests. **We will NOT rename these states — we will map the prompt's intent onto existing states.**

Mapping:
| Prompt State | Existing State | Notes |
|---|---|---|
| AVAILABLE | `available` | Same |
| RESERVED | `reserved` | Same |
| SEATED | `seated` | Same |
| ORDERING | `ordered` | Already exists |
| COURSED | `entrees_fired` + `dessert` | More granular in existing — keep both |
| PAYMENT_PENDING | `check_presented` | Already exists |
| CLOSING | `paid` | Already exists |
| DIRTY | `dirty` | Same |
| OUT_OF_SERVICE | `blocked` | Already exists |

#### F&B Reservation Status
```
HOST_RESERVATION_STATUSES = ['booked', 'confirmed', 'checked_in', 'partially_seated',
                             'seated', 'completed', 'no_show', 'canceled']
```
Transitions:
```
booked → confirmed | checked_in | canceled | no_show
confirmed → checked_in | canceled | no_show
checked_in → seated | partially_seated | canceled | no_show
partially_seated → seated | canceled
seated → completed
no_show → booked (re-book)
canceled → booked (re-book)
```

#### F&B Waitlist Status
```
HOST_WAITLIST_STATUSES = ['waiting', 'notified', 'seated', 'no_show', 'canceled', 'left']
```
Transitions:
```
waiting → notified | seated | canceled | left | no_show
notified → seated | canceled | left | no_show
seated, no_show, canceled, left → (terminal)
```

### 3. Existing Events

**Host Events** (`packages/modules/fnb/src/events/host-events.ts`):
- `fnb.reservation.created.v1`
- `fnb.reservation.updated.v1`
- `fnb.reservation.status_changed.v1`
- `fnb.reservation.cancelled.v1`
- `fnb.waitlist.added.v1`
- `fnb.waitlist.notified.v1`
- `fnb.waitlist.seated.v1`
- `fnb.waitlist.removed.v1`
- `fnb.table.turn_completed.v1`

**Table Events** (`packages/modules/fnb/src/events/types.ts`):
- `fnb.table.status_changed.v1`
- `fnb.table.synced_from_floor_plan.v1`
- `fnb.table.combined/uncombined.v1`
- `fnb.table.created/updated.v1`
- `fnb.tab.opened/closed/voided/transferred.v1`
- `fnb.payment.check_presented/completed.v1`
- `fnb.kds.item_bumped/ticket_bumped.v1`
- `fnb.rotation.advanced.v1`

### 4. Existing Service Functions

**Pure Algorithms** (`packages/modules/fnb/src/services/`):

| File | Functions | Status |
|---|---|---|
| `table-assigner.ts` | `scoreCapacityFit()`, `scoreSeatingPreference()`, `scoreServerBalance()`, `scoreVipPreference()`, `generateReasoning()`, `scoreTable()`, `findCombinations()`, `computeTableSuggestions()` | **BUILT** — 4-factor weighted scoring, returns top 3 suggestions |
| `wait-time-estimator.ts` | `getPartySizeBucket()`, `getConfidence()`, `computeWaitTime()` | **BUILT** — rolling average with confidence bands |
| `notification-service.ts` | `getSmsProvider()`, `setSmsProvider()`, Console + Twilio providers | **BUILT** — provider abstraction |
| `notification-templates.ts` | `buildConfirmationSms()`, `buildReadySms()` | **BUILT** — template interpolation |
| `host-settings.ts` | `hostSettingsSchema` (Zod), `getDefaultHostSettings()`, `mergeHostSettings()` | **BUILT** — comprehensive 14-section settings schema |
| `kds-routing-engine.ts` | `matchItem()` — deterministic priority cascade | **BUILT** |

**Commands** (V2 generation — the ones we build on):

| Command | Status | Notes |
|---|---|---|
| `hostCreateReservation` | **BUILT** | Inserts with meal period inference, tags, serverId |
| `hostUpdateReservation` | **BUILT** | PATCH with optimistic locking |
| `confirmReservation` | **BUILT** | State machine: booked/checked_in → confirmed |
| `checkInReservationV2` | **BUILT** | State machine: booked/confirmed → checked_in |
| `seatReservation` | **BUILT** | Dual-mode: suggest or seat; inserts turn log |
| `completeReservation` | **BUILT** | seated → completed; closes turn log |
| `cancelReservationV2` | **BUILT** | State machine validated |
| `markNoShow` | **BUILT** | State machine validated |
| `hostAddToWaitlist` | **BUILT** | Smart quote via estimateWaitTime, guest token |
| `hostUpdateWaitlistEntry` | **BUILT** | PATCH with status validation |
| `hostSeatFromWaitlist` | **BUILT** | Dual-mode: suggest or seat; turn log; position recompute |
| `hostRemoveFromWaitlist` | **BUILT** | Reason tracking, position decrement |
| `notifyWaitlistGuest` | **BUILT** | Status → notified, notification count |
| `recordTableTurn` | **BUILT** | Closes turn log entry, emits event |
| `updateTableStatus` | **BUILT** | With version-based optimistic locking |
| `seatTable` | **BUILT** | Convenience wrapper for status=seated |
| `clearTable` | **BUILT** | Status → dirty → available |
| `syncTablesFromFloorPlan` | **BUILT** | Bridge from room-layouts to F&B |
| `combineTables` / `uncombineTables` | **BUILT** | Combine group lifecycle |
| Sections/Servers (create, assign, cut, pickup) | **BUILT** | All 5 commands |
| Tab lifecycle (open, close, void, transfer, reopen) | **BUILT** | Full lifecycle |

**Queries** (V2 generation):

| Query | Status |
|---|---|
| `getHostDashboard` | **BUILT** — waitlist + reservations + table summary + servers + stats |
| `hostGetDashboardMetrics` | **BUILT** — aggregate KPIs |
| `hostListReservations` | **BUILT** — paginated with filters |
| `hostGetReservation` | **BUILT** — full detail |
| `hostGetUpcomingReservations` | **BUILT** — today's confirmed/checked_in |
| `hostGetPreShiftReport` | **BUILT** — meal period summary |
| `hostListWaitlist` | **BUILT** — active entries sorted by position |
| `hostGetWaitlistEntry` | **BUILT** — full detail + notification history |
| `hostGetWaitlistStats` | **BUILT** — queue depth metrics |
| `getFloorPlanWithLiveStatus` | **BUILT** — room + snapshot + live table status |
| `getAvailableTables` | **BUILT** — filtered by capacity |
| `getTableAvailability` | **BUILT** — ranked by fit score |
| `suggestTables` | **BUILT** — DB wrapper for `computeTableSuggestions()` |
| `getHostSettings` | **BUILT** |
| `hostGetTableTurnStats` | **BUILT** — averages by meal period + party bucket |
| `getHostAnalytics` | **BUILT** |

**Event Consumers**:
| Consumer | Status |
|---|---|
| `handleTabClosedForHost` | **BUILT** — updates turn log on tab close |
| `handleTurnCompletedForHost` | **BUILT** — records to wait_time_history |

### 5. Existing API Routes

All under `/api/v1/fnb/host/` — **43 routes consolidated to 14 dynamic handlers** (§152 pattern):

- Reservations: CRUD + check-in + confirm + complete + seat + cancel + no-show (via `[action]` route)
- Waitlist: CRUD + notify + seat + remove + stats
- Dashboard, metrics, pre-shift, turn-stats, analytics, settings
- Guest self-service: join, status lookup by token, update

### 6. Existing Frontend

**Host Stand page** (`/host`): `host-content.tsx` with 23 components:
- `HostFloorMap` / `HostGridView` / `HostLayoutView` — dual view modes
- `WaitlistPanel`, `PreShiftPanel`, `StatsBar`, `ReservationTimeline`
- `NewReservationDialog`, `SeatGuestDialog`, `SeatConfirmDialog`, `AddGuestDialog`
- `RotationQueue`, `CoverBalance`, `FloorMapLegend`
- `TablePopover`, `TableContextMenu`, `NotificationCenter`, `NotificationComposer`
- `QrCodeDisplay`, `RoomTabBar`, `AssignModeContext`
- `FeaturePlaceholder` — shows roadmap items not yet built

**Feature Roadmap** (`feature-roadmap.ts`): 16 planned stories across SMS, AI, Channel, Loyalty, RT, Offline, Pickup, Deposit categories — all marked as V2/V3 future work.

### 7. What's Built vs What's Missing (Gap Analysis)

| Feature Area | Built | Missing / Needs Enhancement |
|---|---|---|
| **A. Table State Machine** | 10-state machine with optimistic locking, history, combine groups | **No atomic seating transaction** — `seatTable` doesn't create a POS check in the same transaction. No `SELECT FOR UPDATE` on table row during seat. |
| **B. Reservation Engine** | Full CRUD, state machine, 8-status lifecycle, dual-mode seating | **No conflict detection** — overlapping time slots not checked. **No pacing guard** — `pacingMaxCoversPerSlot` exists in settings but not enforced. **No turn window validation** — no check against historical turn averages. |
| **C. Waitlist Engine** | Full CRUD, estimation, guest tokens, notify, seat, positions | **No auto-promotion** — when table frees up, no automatic offer to next waitlist entry. **Wait estimate does not account for upcoming reservations claiming tables.** Position recalc exists but only on seat/remove, not on status change. |
| **D. Seating Orchestration** | `seatReservation` and `hostSeatFromWaitlist` exist as dual-mode commands | **NOT atomic** — does not lock table row (SELECT FOR UPDATE), does not create POS check, does not validate table is available before seating. Double-seat protection is weak (no row lock). Walk-in seating path not unified. |
| **E. POS Integration** | Tab lifecycle complete, `handleTabClosedForHost` closes turn log | **No consumer for TABLE_SEATED → auto-open tab**. Table status doesn't auto-progress with tab lifecycle (ORDERING when items fired, CHECK_PRESENTED when check printed). CHECK_CLOSED doesn't auto-mark table DIRTY. |
| **F. Room Layout Sync** | `syncTablesFromFloorPlan` bridges design→runtime, `getFloorPlanWithLiveStatus` provides live data | **No event-driven refresh** — floor view polls every 5-15s. No reservation ghost blocks on timeline. No estimated turn timers per table. No server section boundaries. |
| **G. Server Load Balancing** | `scoreServerBalance()` pure function, rotation tracker, cover tracking | **No `server_load_snapshot` table** — load computed ad-hoc from tabs query. No `recommendServer()` standalone function. Balance considers active checks only, not covers or section density. |
| **H. Predictive Turn Engine** | `fnb_table_turn_log` + `fnb_wait_time_history` exist, `computeWaitTime()` uses rolling averages | **V1 only** — no daypart/party-size breakdown in prediction. No server velocity factor. No alcohol presence detection. Rolling average is global, not per-table-type. |
| **I. Revenue Optimization** | `pacingMaxCoversPerSlot` in settings, `rm_fnb_table_turns` read model | **No `reservation_pacing_rules` table** — pacing is a single number, not time-window-based. No `calculateRevPASH()`. No dynamic yield control. No kitchen capacity check. |
| **J. Guest Intelligence** | `customerId` on reservations/waitlist, `customerVisitCount` tracked | **No aggregated guest profile query** — no efficient join across reservations + checks for visit_count, avg_ticket, favorites, preferred_tables, no_show_rate. No composite indexes for this. |
| **K. Analytics/Reporting** | `rm_fnb_table_turns`, `rm_fnb_server_performance`, `hostGetDashboardMetrics`, `getHostAnalytics` | **Missing**: RevPASH calculation, seating efficiency metric, waitlist accuracy delta (quoted vs actual). Read models don't capture covers per hour or no-show rate time series. |

### 8. Naming Conventions Established

- Table names: `fnb_` prefix for all F&B tables, `rm_fnb_` for read models
- Events: `fnb.{entity}.{action}.v1`
- Commands: `host` prefix for V2 generation (e.g., `hostCreateReservation`)
- Services: pure functions in `services/`, DB-free, testable
- Validation: all Zod schemas in `validation-host.ts`
- Settings: JSONB blob via `hostSettingsSchema` with 14 sections

### 9. Conflicts with Session Plan Goals

1. **Table state naming**: Prompt uses `ORDERING`/`COURSED`/`PAYMENT_PENDING`/`CLOSING` — existing uses `ordered`/`entrees_fired`+`dessert`/`check_presented`/`paid`. **Resolution: Keep existing names.**
2. **Separate module**: Prompt implies new module — existing code lives in `packages/modules/fnb/`. **Resolution: Build within fnb module, not a new package.**
3. **"No stubs" rule vs existing V1/V2 coexistence**: V1 commands still exist alongside V2. **Resolution: V2 is the canonical path; V1 commands remain for backward compat but are not extended.**
4. **`SELECT FOR UPDATE` on seating**: Existing `seatReservation`/`hostSeatFromWaitlist` do `FOR UPDATE` on the reservation/waitlist row but NOT on the table live status row. **Resolution: Add table row locking in the atomic seating transaction.**

---

## Phase 1: Implementation Sessions

### Session Dependency Graph

```
S1 (Atomic Seating) ─────────┬──→ S4 (POS Integration)
                              │
S2 (Reservation Conflicts) ──┤──→ S5 (Auto-Promotion)
                              │
S3 (Pacing Engine) ──────────┘

S4 (POS Integration) ────────┬──→ S6 (Server Load Snapshot)
                              │
S5 (Auto-Promotion) ─────────┤──→ S8 (Revenue Optimization)
                              │
S6 (Server Load Snapshot) ───┤──→ S7 (Predictive Turn V2)
                              │
S7 (Predictive Turn V2) ─────┘──→ S9 (Guest Intelligence)

S8 (Revenue Optimization) ───┬──→ S10 (Analytics & Read Models)
S9 (Guest Intelligence) ─────┘

S10 (Analytics & Read Models) ──→ DONE
```

**Critical path**: S1 → S4 → S6 → S7 → S10
**Parallelizable**: S2 + S3 can run in parallel with S1. S8 + S9 can run in parallel.

---

### Session 1: Atomic Seating Transaction

**Goal:** Create a single, atomic database transaction that locks the table, validates availability, assigns a server, creates a POS tab, links the source (reservation/waitlist/walk-in), updates table status, and publishes events — preventing double-seating under concurrency.

**Prerequisites:** None (builds on existing infrastructure)

**Complexity:** L

**Files to create or modify:**
```
packages/modules/fnb/src/commands/atomic-seat-party.ts          — NEW
packages/modules/fnb/src/commands/host-seat-from-waitlist.ts     — MODIFY (delegate to atomic)
packages/modules/fnb/src/commands/seat-reservation.ts            — MODIFY (delegate to atomic)
packages/modules/fnb/src/validation-host.ts                      — MODIFY (add atomicSeatPartySchema)
packages/modules/fnb/src/events/host-events.ts                   — MODIFY (add PARTY_SEATED event)
packages/modules/fnb/src/__tests__/atomic-seat-party.test.ts     — NEW
```

**Schema changes:**
None — uses existing `fnb_table_live_status` (already has `version` column for optimistic locking) and `fnb_tabs`.

**Service functions:**
```typescript
// packages/modules/fnb/src/commands/atomic-seat-party.ts
export async function atomicSeatParty(
  ctx: RequestContext,
  input: {
    tableIds: string[];               // 1+ tables (supports combined seating)
    partySize: number;
    guestNames?: string;
    serverUserId?: string;            // optional override; auto-resolved if omitted
    sourceType: 'reservation' | 'waitlist' | 'walk_in';
    sourceId?: string;                // reservationId or waitlistEntryId
    clientRequestId?: string;
  }
): Promise<{
  tabId: string;
  tableStatuses: Array<{ tableId: string; version: number }>;
  serverUserId: string;
}>
```

**Events:**
- `fnb.party.seated.v1` — `{ tabId, tableIds, partySize, serverUserId, sourceType, sourceId, businessDate }` — emitted after atomic commit

**API routes:**
- `POST /api/v1/fnb/host/seat` — unified seating endpoint (request body: `{ tableIds, partySize, guestNames?, serverUserId?, sourceType, sourceId?, clientRequestId? }`)

**Test cases:**
1. Seat walk-in party — creates tab, updates table status to `seated`, emits events
2. Seat from reservation — links reservationId, updates reservation status to `seated`
3. Seat from waitlist — links waitlistEntryId, updates waitlist status to `seated`, recomputes positions
4. Double-seat protection — concurrent seat attempts on same table; second fails with 409 Conflict
5. Multi-table seating — seats party across 2 combined tables
6. Server auto-resolution — when serverUserId omitted, resolves from rotation tracker or section assignment
7. Idempotency — same clientRequestId returns same result without re-executing
8. Table not available — reject if table status is not `available` or `reserved`
9. Optimistic lock conflict — version mismatch on `fnb_table_live_status` triggers retry guidance

**Acceptance criteria:**
- [ ] Single DB transaction: `SELECT FOR UPDATE` on `fnb_table_live_status` → validate status → open tab → insert turn log → update table status → update source (reservation/waitlist) → outbox events → commit
- [ ] No partial state: if any step fails, entire transaction rolls back
- [ ] `handleTabClosedForHost` consumer still works (turn log closed on tab close)
- [ ] Existing `seatReservation` and `hostSeatFromWaitlist` delegate to `atomicSeatParty` for the actual seating step
- [ ] All existing host tests still pass

**Migration safety:**
- Additive: no schema changes
- Backfill needed: no
- Consumer updates needed: no (new event, new consumer wired later in S4)

---

### Session 2: Reservation Conflict Detection & Turn Window Validation

**Goal:** Prevent double-booking by detecting overlapping reservations for the same table/time, and validate that requested durations align with historical turn time averages.

**Prerequisites:** None (can run in parallel with S1)

**Complexity:** M

**Files to create or modify:**
```
packages/modules/fnb/src/commands/host-create-reservation.ts      — MODIFY (add conflict check)
packages/modules/fnb/src/commands/host-update-reservation.ts      — MODIFY (add conflict check)
packages/modules/fnb/src/queries/check-reservation-conflicts.ts   — NEW
packages/modules/fnb/src/queries/get-turn-time-averages.ts        — NEW
packages/modules/fnb/src/services/reservation-conflict-checker.ts — NEW (pure function)
packages/modules/fnb/src/validation-host.ts                       — MODIFY (add conflict types)
packages/modules/fnb/src/__tests__/reservation-conflicts.test.ts  — NEW
```

**Schema changes:**
Add index for efficient conflict detection:
```sql
-- Migration 0257_reservation_conflict_index.sql
CREATE INDEX IF NOT EXISTS idx_fnb_reservations_conflict_check
  ON fnb_reservations (tenant_id, location_id, reservation_date, assigned_table_id)
  WHERE status NOT IN ('canceled', 'no_show', 'completed');
```

**Service functions:**
```typescript
// Pure function — no DB access
export function detectConflicts(
  proposed: { tableIds: string[]; date: string; startTime: string; durationMinutes: number },
  existing: Array<{ id: string; tableId: string; startTime: string; endTime: string; partySize: number }>
): Array<{ reservationId: string; tableId: string; overlapMinutes: number }>

// Query
export async function checkReservationConflicts(
  tenantId: string, locationId: string,
  input: { date: string; startTime: string; durationMinutes: number; tableIds: string[]; excludeReservationId?: string }
): Promise<ConflictResult[]>

// Query
export async function getTurnTimeAverages(
  tenantId: string, locationId: string,
  input: { mealPeriod?: string; dayOfWeek?: number; partySizeBucket?: string }
): Promise<{ avgMinutes: number; p75Minutes: number; p90Minutes: number; sampleSize: number }>
```

**Events:**
None — queries only.

**API routes:**
- `GET /api/v1/fnb/host/reservations/conflicts?date=&startTime=&durationMinutes=&tableIds=` — check conflicts before booking

**Test cases:**
1. No conflict — reservation at non-overlapping time passes
2. Full overlap — same table, same time slot rejected
3. Partial overlap — 30 min overlap detected with correct minutes
4. Buffer time — 10-minute buffer (from settings) between consecutive reservations
5. Canceled reservations excluded — canceled/no_show/completed don't count as conflicts
6. Multi-table conflict — party of 6 across 2 tables; one table conflicts
7. Turn time validation — requested 60 min duration but P75 is 90 min → warning (not error)
8. Update conflict — updating reservation to new time doesn't conflict with itself

**Acceptance criteria:**
- [ ] `hostCreateReservation` checks conflicts when `tableIds` provided; returns `{ conflicts: [...] }` in response if any found (does not reject — host can override)
- [ ] `hostUpdateReservation` checks conflicts for modified date/time/table; excludes self
- [ ] Turn time P75 used as recommended minimum duration; warning surfaced to host
- [ ] Index makes conflict query < 5ms for 1,000 active reservations

**Migration safety:**
- Additive: new index only
- Backfill needed: no
- Consumer updates needed: no

---

### Session 3: Pacing Engine

**Goal:** Enforce covers-per-interval limits to prevent kitchen/service overwhelm, with per-meal-period configuration and manager override capability.

**Prerequisites:** None (can run in parallel with S1 and S2)

**Complexity:** M

**Files to create or modify:**
```
packages/db/src/schema/fnb.ts                                     — MODIFY (add fnb_pacing_rules)
packages/modules/fnb/src/commands/upsert-pacing-rule.ts           — NEW
packages/modules/fnb/src/commands/delete-pacing-rule.ts           — NEW
packages/modules/fnb/src/queries/get-pacing-availability.ts       — NEW
packages/modules/fnb/src/queries/list-pacing-rules.ts             — NEW
packages/modules/fnb/src/services/pacing-evaluator.ts             — NEW (pure function)
packages/modules/fnb/src/validation-host.ts                       — MODIFY (add pacing schemas)
packages/modules/fnb/src/events/host-events.ts                    — MODIFY (add pacing events)
packages/modules/fnb/src/__tests__/pacing-engine.test.ts          — NEW
packages/db/migrations/0257_pacing_rules.sql                      — NEW
```

**Schema changes:**
```typescript
// packages/db/src/schema/fnb.ts
export const fnbPacingRules = pgTable('fnb_pacing_rules', {
  id: text('id').primaryKey().$defaultFn(generateUlid),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  locationId: text('location_id').notNull().references(() => locations.id),
  mealPeriod: text('meal_period'),              // null = all periods
  dayOfWeek: integer('day_of_week'),            // 0-6, null = all days
  intervalStartTime: text('interval_start_time'),// HH:MM, null = whole period
  intervalEndTime: text('interval_end_time'),    // HH:MM
  maxCovers: integer('max_covers').notNull(),
  maxReservations: integer('max_reservations'),  // null = no limit
  minPartySize: integer('min_party_size'),       // restrict to parties >= N
  priority: integer('priority').notNull().default(0),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy: text('created_by'),
}, (table) => [
  index('idx_fnb_pacing_rules_tenant_location').on(table.tenantId, table.locationId),
]);
```

**Service functions:**
```typescript
// Pure function — no DB access
export function evaluatePacing(
  rules: PacingRule[],
  existingCovers: Array<{ time: string; covers: number }>,
  proposed: { time: string; partySize: number; mealPeriod: string; dayOfWeek: number }
): { allowed: boolean; remainingCapacity: number; appliedRule: PacingRule | null; reason?: string }

// Query
export async function getPacingAvailability(
  tenantId: string, locationId: string,
  input: { date: string; mealPeriod?: string }
): Promise<Array<{ intervalStart: string; intervalEnd: string; maxCovers: number; bookedCovers: number; remaining: number }>>
```

**Events:**
- `fnb.pacing.rule_updated.v1` — emitted on rule create/update/delete

**API routes:**
- `GET /api/v1/fnb/host/pacing/availability?date=&mealPeriod=` — time slots with remaining capacity
- `GET /api/v1/fnb/host/pacing/rules` — list rules
- `POST /api/v1/fnb/host/pacing/rules` — create rule
- `PATCH /api/v1/fnb/host/pacing/rules/:id` — update rule
- `DELETE /api/v1/fnb/host/pacing/rules/:id` — delete rule

**Test cases:**
1. Within limits — booking passes when under maxCovers
2. At capacity — booking rejected when interval is full
3. Meal period scoping — lunch rule doesn't affect dinner bookings
4. Day-of-week scoping — Saturday-only rule doesn't affect Tuesday
5. Priority resolution — more specific rule overrides general
6. Manager override — booking with `overridePacing: true` bypasses limits
7. No rules — all bookings pass when no pacing rules configured
8. Multi-interval view — availability endpoint returns correct remaining for each slot

**Acceptance criteria:**
- [ ] `hostCreateReservation` evaluates pacing rules and returns warning when at/over capacity (does not hard-reject unless > 150% capacity)
- [ ] Availability endpoint returns per-interval remaining covers for host stand calendar view
- [ ] Rules support granular scoping (meal period + day + time window)
- [ ] Manager can override with explicit flag

**Migration safety:**
- Additive: new table only
- Backfill needed: no
- Consumer updates needed: no

---

### Session 4: POS Integration — Event-Driven Status Progression

**Goal:** Wire table status changes to POS tab lifecycle events: TABLE_SEATED → auto-open tab, tab items fired → table status `ordered`, check presented → `check_presented`, tab closed → table `dirty`.

**Prerequisites:** Session 1 (Atomic Seating)

**Complexity:** L

**Files to create or modify:**
```
packages/modules/fnb/src/consumers/host-consumers.ts              — MODIFY (add new consumers)
packages/modules/fnb/src/consumers/handle-tab-status-for-table.ts — NEW
packages/modules/fnb/src/commands/auto-progress-table-status.ts   — NEW
packages/modules/fnb/src/events/host-events.ts                    — MODIFY (add TABLE_CLEARED, TABLE_DIRTY events)
packages/modules/fnb/src/events/types.ts                          — MODIFY (verify events exist)
packages/modules/fnb/src/__tests__/pos-integration.test.ts        — NEW
```

**Schema changes:**
Add `dirtySince` column to `fnb_table_live_status`:
```sql
-- Migration 0258_table_dirty_since.sql
ALTER TABLE fnb_table_live_status ADD COLUMN IF NOT EXISTS dirty_since TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_fnb_table_live_status_dirty
  ON fnb_table_live_status (tenant_id, dirty_since)
  WHERE status = 'dirty' AND dirty_since IS NOT NULL;
```

**Service functions:**
```typescript
// Command — called by event consumers
export async function autoProgressTableStatus(
  ctx: RequestContext,
  input: {
    tableId: string;
    targetStatus: string;
    triggeredBy: string;           // event type that caused this
    tabId?: string;
    clearFields?: boolean;         // true when going to dirty/available
  }
): Promise<void>

// Consumer for fnb.tab.closed.v1
export async function handleTabClosedForTableStatus(data: TabClosedConsumerData): Promise<void>

// Consumer for fnb.course.sent.v1
export async function handleCourseSentForTableStatus(data: CourseSentConsumerData): Promise<void>

// Consumer for fnb.payment.check_presented.v1
export async function handleCheckPresentedForTableStatus(data: CheckPresentedData): Promise<void>

// Consumer for fnb.payment.completed.v1
export async function handlePaymentCompletedForTableStatus(data: PaymentCompletedData): Promise<void>
```

**Events:**
- `fnb.table.auto_progressed.v1` — `{ tableId, fromStatus, toStatus, triggeredBy }` — emitted whenever an event consumer auto-advances table status

**API routes:**
- `POST /api/v1/fnb/tables/:id/mark-clean` — busser marks table clean (dirty → available)

**Test cases:**
1. Tab closed → table status becomes `dirty`, `dirtySince` set, `currentTabId` cleared
2. Course sent → table status becomes `ordered` (only if current status is `seated`)
3. Entrees fired → table status becomes `entrees_fired` (only if ordered or seated)
4. Check presented → table status becomes `check_presented`
5. Payment completed → table status becomes `paid`
6. Mark clean → busser marks dirty table as `available`, `dirtySince` cleared
7. Status only advances forward — `check_presented` event when table is already `paid` is ignored
8. Orphan protection — if tab closes but table has no matching `currentTabId`, log warning but don't crash
9. Consumer idempotency — duplicate event delivery is silently skipped

**Acceptance criteria:**
- [ ] Table status auto-progresses through the meal lifecycle based on POS events, no manual status changes needed after seating
- [ ] Busser can mark table clean via dedicated endpoint
- [ ] `dirtySince` timestamp enables "time since dirty" display on host stand
- [ ] All status transitions emit events for floor plan real-time updates
- [ ] Consumers are idempotent — replay-safe

**Migration safety:**
- Additive: one new column
- Backfill needed: no (existing dirty tables won't have `dirtySince` — acceptable)
- Consumer updates needed: yes — new consumer registrations needed in event wiring

---

### Session 5: Waitlist Auto-Promotion

**Goal:** When a table becomes available (status changes from `dirty` to `available`), automatically evaluate the waitlist and offer the table to the best-matching party.

**Prerequisites:** Session 1 (Atomic Seating), Session 2 (Conflict Detection)

**Complexity:** M

**Files to create or modify:**
```
packages/modules/fnb/src/consumers/handle-table-available-for-waitlist.ts  — NEW
packages/modules/fnb/src/services/waitlist-promoter.ts                     — NEW (pure function)
packages/modules/fnb/src/commands/offer-table-to-waitlist.ts               — NEW
packages/modules/fnb/src/commands/accept-table-offer.ts                    — NEW
packages/modules/fnb/src/commands/decline-table-offer.ts                   — NEW
packages/modules/fnb/src/validation-host.ts                                — MODIFY (add offer schemas)
packages/modules/fnb/src/events/host-events.ts                            — MODIFY (add offer events)
packages/db/src/schema/fnb.ts                                              — MODIFY (add offer tracking)
packages/modules/fnb/src/__tests__/waitlist-auto-promotion.test.ts         — NEW
packages/db/migrations/0259_waitlist_offers.sql                            — NEW
```

**Schema changes:**
```typescript
// Add to fnb_waitlist_entries
offeredTableId: text('offered_table_id'),
offeredAt: timestamp('offered_at', { withTimezone: true }),
offerExpiresAt: timestamp('offer_expires_at', { withTimezone: true }),
offerDeclinedCount: integer('offer_declined_count').notNull().default(0),
```

**Service functions:**
```typescript
// Pure function — no DB access
export function rankWaitlistForTable(
  entries: WaitlistEntry[],
  table: { id: string; capacityMin: number; capacityMax: number; tableType: string },
  settings: { priorityEnabled: boolean; notifyExpiryMinutes: number }
): Array<{ entryId: string; score: number; reasons: string[] }>

// Consumer: fnb.table.status_changed.v1 WHERE newStatus = 'available'
export async function handleTableAvailableForWaitlist(data: TableStatusChangedData): Promise<void>

// Command
export async function offerTableToWaitlist(
  ctx: RequestContext,
  input: { waitlistEntryId: string; tableId: string; expiryMinutes?: number }
): Promise<void>
```

**Events:**
- `fnb.waitlist.table_offered.v1` — `{ entryId, tableId, expiresAt }`
- `fnb.waitlist.offer_accepted.v1` — `{ entryId, tableId }`
- `fnb.waitlist.offer_declined.v1` — `{ entryId, tableId, reason }`
- `fnb.waitlist.offer_expired.v1` — `{ entryId, tableId }`

**API routes:**
- `POST /api/v1/fnb/host/waitlist/:id/offer` — manually offer a specific table
- `POST /api/v1/fnb/host/waitlist/:id/accept-offer` — guest/host accepts offer
- `POST /api/v1/fnb/host/waitlist/:id/decline-offer` — guest/host declines offer

**Test cases:**
1. Table becomes available → top waitlist match offered
2. Party too large — skipped for table, next match offered
3. Priority ordering — VIP party offered before non-VIP
4. No waitlist entries — table remains available, no action
5. Offer expiry — offer not accepted within window → auto-expire, offer to next
6. Decline → re-offer — declined offer moves to next matching entry
7. Accept → atomic seat — accepting triggers `atomicSeatParty` flow
8. Multiple tables freed — each gets independent waitlist evaluation
9. Reservation claims — table reserved for upcoming reservation within 30 min is NOT offered to waitlist
10. Wait estimate recalculation — all remaining waitlist entries get updated estimates after promotion

**Acceptance criteria:**
- [ ] Table status change to `available` triggers automatic waitlist evaluation
- [ ] Best-matching waitlist entry is offered the table (considering party size, priority, VIP, wait time)
- [ ] Offer has configurable expiry (from `hostSettings.waitlist.notifyExpiryMinutes`)
- [ ] Expired/declined offers cascade to next eligible entry
- [ ] Accepting an offer triggers `atomicSeatParty` (S1)
- [ ] Reservation claims within 30 minutes block waitlist offers for that table
- [ ] All remaining waitlist estimates recalculated after any promotion

**Migration safety:**
- Additive: new columns on existing table (all nullable)
- Backfill needed: no
- Consumer updates needed: yes — new consumer for `fnb.table.status_changed.v1`

---

### Session 6: Server Load Snapshot & Intelligent Assignment

**Goal:** Create a materialized server load snapshot for efficient load-balancing queries, and a `recommendServer()` function that considers active checks, covers, section density, and section capacity.

**Prerequisites:** Session 4 (POS Integration — so we know which servers have active tabs)

**Complexity:** M

**Files to create or modify:**
```
packages/db/src/schema/fnb.ts                                      — MODIFY (add fnb_server_load_snapshots)
packages/modules/fnb/src/commands/refresh-server-load-snapshot.ts   — NEW
packages/modules/fnb/src/queries/get-server-load-snapshot.ts        — NEW
packages/modules/fnb/src/services/server-recommender.ts             — NEW (pure function)
packages/modules/fnb/src/validation-host.ts                         — MODIFY (add schemas)
packages/modules/fnb/src/events/host-events.ts                      — MODIFY (add snapshot event)
packages/modules/fnb/src/__tests__/server-load-balancing.test.ts    — NEW
packages/db/migrations/0260_server_load_snapshots.sql               — NEW
```

**Schema changes:**
```typescript
export const fnbServerLoadSnapshots = pgTable('fnb_server_load_snapshots', {
  id: text('id').primaryKey().$defaultFn(generateUlid),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  locationId: text('location_id').notNull().references(() => locations.id),
  serverUserId: text('server_user_id').notNull(),
  businessDate: date('business_date').notNull(),
  openTabCount: integer('open_tab_count').notNull().default(0),
  activeSeatedCount: integer('active_seated_count').notNull().default(0),
  totalCoverCount: integer('total_cover_count').notNull().default(0),
  avgTicketCents: integer('avg_ticket_cents').notNull().default(0),
  sectionId: text('section_id'),
  sectionCapacity: integer('section_capacity'),
  lastRefreshedAt: timestamp('last_refreshed_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_fnb_server_load_tenant_location_date').on(table.tenantId, table.locationId, table.businessDate),
]);
```

**Service functions:**
```typescript
// Pure function — no DB access
export function recommendServer(
  tableId: string,
  serverLoads: ServerLoadSnapshot[],
  sectionAssignments: Array<{ sectionId: string; serverUserId: string; tableIds: string[] }>,
  settings: { method: 'round_robin' | 'cover_balance' | 'manual'; maxCoverDifference: number }
): { serverUserId: string; score: number; reason: string } | null

// Command — refreshes snapshot for all active servers at a location
export async function refreshServerLoadSnapshot(ctx: RequestContext, locationId: string): Promise<void>
```

**Events:**
- `fnb.server_load.refreshed.v1` — emitted after snapshot refresh

**API routes:**
- `GET /api/v1/fnb/host/server-load?locationId=` — current server loads
- `POST /api/v1/fnb/host/server-load/refresh` — force refresh
- `GET /api/v1/fnb/host/recommend-server?tableId=` — get recommended server for a table

**Test cases:**
1. Cover balance — server with fewest covers recommended
2. Section affinity — table in section A prefers server assigned to section A
3. Cut server excluded — servers with `status='cut'` not recommended
4. Manager override — explicit serverUserId in seating bypasses recommendation
5. Equal loads — tie-breaker uses rotation order
6. Empty floor — first server in rotation recommended
7. Snapshot refresh — correctly aggregates from open tabs + live status
8. Max cover difference — triggers rebalance warning when exceeded

**Acceptance criteria:**
- [ ] `atomicSeatParty` (S1) uses `recommendServer()` when no serverUserId provided
- [ ] Snapshot is refreshed on each seating and tab close event (via consumer)
- [ ] Host stand UI can display per-server load metrics
- [ ] Algorithm considers section ownership, not just raw counts

**Migration safety:**
- Additive: new table
- Backfill needed: no (empty on first use, populated by refresh command)
- Consumer updates needed: yes — refresh triggered by seating/tab events

---

### Session 7: Predictive Turn Engine V2

**Goal:** Enhance turn time predictions with per-table-type, per-daypart, per-party-size breakdowns. Add server velocity factor and structured data for future ML model swap.

**Prerequisites:** Session 6 (Server Load — needs server velocity data)

**Complexity:** M

**Files to create or modify:**
```
packages/db/src/schema/fnb.ts                                       — MODIFY (add fnb_turn_time_aggregates)
packages/modules/fnb/src/consumers/handle-turn-for-aggregates.ts    — NEW
packages/modules/fnb/src/services/turn-time-predictor.ts            — NEW (pure function)
packages/modules/fnb/src/queries/get-turn-time-prediction.ts        — NEW
packages/modules/fnb/src/validation-host.ts                          — MODIFY (add prediction schemas)
packages/modules/fnb/src/__tests__/turn-time-predictor.test.ts       — NEW
packages/db/migrations/0261_turn_time_aggregates.sql                 — NEW
```

**Schema changes:**
```typescript
export const fnbTurnTimeAggregates = pgTable('fnb_turn_time_aggregates', {
  id: text('id').primaryKey().$defaultFn(generateUlid),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  locationId: text('location_id').notNull().references(() => locations.id),
  tableType: text('table_type'),                // null = all types
  mealPeriod: text('meal_period'),              // null = all periods
  dayOfWeek: integer('day_of_week'),            // 0-6, null = all days
  partySizeBucket: text('party_size_bucket'),   // small/medium/large/xlarge, null = all
  avgMinutes: integer('avg_minutes').notNull(),
  p50Minutes: integer('p50_minutes').notNull(),
  p75Minutes: integer('p75_minutes').notNull(),
  p90Minutes: integer('p90_minutes').notNull(),
  sampleCount: integer('sample_count').notNull(),
  serverAvgMinutes: integer('server_avg_minutes'), // per-server velocity
  lastComputedAt: timestamp('last_computed_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_fnb_turn_agg_lookup').on(
    table.tenantId, table.locationId, table.tableType,
    table.mealPeriod, table.dayOfWeek, table.partySizeBucket
  ),
]);
```

**Service functions:**
```typescript
// Pure function — no DB access
export function predictTurnTime(
  aggregates: TurnTimeAggregate[],
  input: { tableType: string; mealPeriod: string; dayOfWeek: number; partySize: number; serverUserId?: string },
  settings: { historicalWeight: number; defaultTurnMinutes: Record<string, number> }
): { predictedMinutes: number; confidence: 'high' | 'medium' | 'low' | 'default'; factors: string[] }
```

**Events:**
None — consumer updates existing `fnb.table.turn_completed.v1`.

**API routes:**
- `GET /api/v1/fnb/host/predict-turn?tableId=&partySize=&mealPeriod=` — predicted turn time

**Test cases:**
1. Exact match — table type + meal period + day + party bucket all match → high confidence
2. Partial match — fallback to broader aggregates (no day-of-week match)
3. No data — falls back to `defaultTurnMinutes` from settings → `default` confidence
4. Server velocity — server with 20% faster avg adjusts prediction down
5. Large party penalty — xlarge bucket gets higher prediction
6. Weekend multiplier — Saturday predictions use dayOfWeekMultiplier from settings
7. Sample count thresholds — <10 samples → low confidence, <20 → medium, >=50 → high

**Acceptance criteria:**
- [ ] `computeWaitTime()` (existing V1) enhanced to use aggregates when available, falling back to simple averages
- [ ] Turn log consumer computes and upserts aggregates on each turn completion
- [ ] Host stand shows estimated remaining time per seated table
- [ ] Predictions structured for future ML model swap (input/output contract is stable)

**Migration safety:**
- Additive: new table
- Backfill needed: optional — can backfill from existing `fnb_table_turn_log` data
- Consumer updates needed: yes — new logic in `handleTurnCompletedForHost`

---

### Session 8: Revenue Optimization — RevPASH & Dynamic Yield

**Goal:** Calculate Revenue Per Available Seat Hour (RevPASH) and provide dynamic pacing adjustment recommendations based on real-time demand signals.

**Prerequisites:** Session 5 (Auto-Promotion), Session 3 (Pacing Engine)

**Complexity:** M

**Files to create or modify:**
```
packages/modules/fnb/src/services/revpash-calculator.ts              — NEW (pure function)
packages/modules/fnb/src/queries/get-revpash-metrics.ts              — NEW
packages/modules/fnb/src/queries/get-yield-recommendations.ts        — NEW
packages/modules/fnb/src/services/yield-advisor.ts                   — NEW (pure function)
packages/modules/fnb/src/validation-host.ts                          — MODIFY (add RevPASH schemas)
packages/modules/fnb/src/__tests__/revenue-optimization.test.ts      — NEW
```

**Schema changes:**
None — calculated from existing `rm_fnb_table_turns` + `fnb_tabs` + `fnb_pacing_rules`.

**Service functions:**
```typescript
// Pure function
export function calculateRevPASH(
  totalRevenueCents: number,
  availableSeats: number,
  hoursInPeriod: number
): { revpash: number; formattedRevpash: string }

// Pure function
export function generateYieldRecommendations(
  currentPacing: PacingRule[],
  actualDemand: Array<{ interval: string; bookedCovers: number; walkinCovers: number }>,
  turnTimeAverages: TurnTimeAggregate[],
  settings: { targetRevpash: number; maxOverbookPercent: number }
): Array<{ interval: string; recommendation: 'increase' | 'decrease' | 'hold'; suggestedMaxCovers: number; reason: string }>
```

**Events:**
None — query-only functions.

**API routes:**
- `GET /api/v1/fnb/host/analytics/revpash?date=&mealPeriod=` — RevPASH for a period
- `GET /api/v1/fnb/host/analytics/yield-recommendations?date=` — pacing adjustment suggestions

**Test cases:**
1. RevPASH calculation — $5,000 revenue / 50 seats / 4 hours = $25/seat-hour
2. Zero revenue — returns 0, not NaN
3. Yield increase — low demand + high RevPASH target → recommend opening more covers
4. Yield decrease — kitchen overwhelmed → recommend restricting covers
5. Hold recommendation — demand matches target → no change
6. Weekend vs weekday — different targets produce different recommendations
7. Combine with pacing — recommendations reference existing pacing rules

**Acceptance criteria:**
- [ ] RevPASH calculated per room, per meal period, per date
- [ ] Yield advisor produces actionable recommendations (not just raw numbers)
- [ ] Recommendations reference specific pacing rules to adjust
- [ ] Manager can view and act on recommendations from host stand

**Migration safety:**
- Additive: no schema changes
- Backfill needed: no
- Consumer updates needed: no

---

### Session 9: Guest Intelligence

**Goal:** Aggregate guest data across reservations, waitlist entries, and checks into efficient queryable profiles for host stand display.

**Prerequisites:** Session 7 (Turn Engine — needs turn data for guest patterns)

**Complexity:** M

**Files to create or modify:**
```
packages/db/src/schema/fnb.ts                                       — MODIFY (add fnb_guest_profiles)
packages/modules/fnb/src/consumers/handle-guest-profile-update.ts   — NEW
packages/modules/fnb/src/queries/get-guest-profile.ts               — NEW
packages/modules/fnb/src/queries/search-guest-profiles.ts           — NEW
packages/modules/fnb/src/services/guest-profile-aggregator.ts       — NEW (pure function)
packages/modules/fnb/src/validation-host.ts                          — MODIFY (add guest schemas)
packages/modules/fnb/src/__tests__/guest-intelligence.test.ts        — NEW
packages/db/migrations/0262_guest_profiles.sql                       — NEW
```

**Schema changes:**
```typescript
export const fnbGuestProfiles = pgTable('fnb_guest_profiles', {
  id: text('id').primaryKey().$defaultFn(generateUlid),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  locationId: text('location_id').notNull().references(() => locations.id),
  customerId: text('customer_id'),               // FK to customers module (nullable for anonymous)
  guestPhone: text('guest_phone'),               // for matching non-customer guests
  guestEmail: text('guest_email'),
  guestName: text('guest_name'),
  visitCount: integer('visit_count').notNull().default(0),
  noShowCount: integer('no_show_count').notNull().default(0),
  cancelCount: integer('cancel_count').notNull().default(0),
  avgTicketCents: integer('avg_ticket_cents'),
  totalSpendCents: integer('total_spend_cents').notNull().default(0),
  lastVisitDate: date('last_visit_date'),
  firstVisitDate: date('first_visit_date'),
  preferredTables: text('preferred_tables'),      // comma-separated table numbers
  preferredServer: text('preferred_server'),       // serverUserId
  seatingPreference: text('seating_preference'),   // indoor/outdoor/booth/etc.
  frequentItems: jsonb('frequent_items'),          // top 5 items [{catalogItemId, name, count}]
  tags: jsonb('tags'),                             // string[] — allergies, VIP, etc.
  notes: text('notes'),
  lastComputedAt: timestamp('last_computed_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_fnb_guest_profiles_customer').on(table.tenantId, table.customerId),
  index('idx_fnb_guest_profiles_phone').on(table.tenantId, table.guestPhone),
  index('idx_fnb_guest_profiles_email').on(table.tenantId, table.guestEmail),
]);
```

**Service functions:**
```typescript
// Pure function
export function aggregateGuestProfile(
  reservations: Array<{ status: string; date: string; tableId?: string; partySize: number }>,
  waitlistEntries: Array<{ status: string; date: string; seatedTableId?: string }>,
  closedTabs: Array<{ totalCents: number; items: Array<{ catalogItemId: string; name: string }> }>,
): GuestProfileData

// Query
export async function getGuestProfile(
  tenantId: string, locationId: string,
  input: { customerId?: string; guestPhone?: string; guestEmail?: string }
): Promise<GuestProfile | null>

// Query
export async function searchGuestProfiles(
  tenantId: string, locationId: string,
  input: { search: string; limit?: number }
): Promise<GuestProfile[]>
```

**Events:**
Consumer triggers: `fnb.tab.closed.v1`, `fnb.reservation.status_changed.v1`, `fnb.waitlist.seated.v1`

**API routes:**
- `GET /api/v1/fnb/host/guests/profile?customerId=|phone=|email=` — lookup guest profile
- `GET /api/v1/fnb/host/guests/search?q=` — search by name/phone/email
- `PATCH /api/v1/fnb/host/guests/:id/notes` — update host notes/tags on guest

**Test cases:**
1. First visit — profile created with visitCount=1
2. Repeat guest — visitCount incremented, avgTicket recalculated
3. No-show tracking — noShowCount incremented, no_show_rate derivable
4. Preferred table detection — most-visited table noted
5. Phone matching — guest without customerId matched by phone number
6. Frequent items — top 5 items computed from tab history
7. Search — fuzzy name match returns correct profiles
8. VIP auto-tag — guest with >10 visits or >$500 avg ticket auto-tagged VIP

**Acceptance criteria:**
- [ ] Guest profile available at host stand when seating (shows visit history, preferences, no-show risk)
- [ ] Profile updated automatically via event consumers (no manual refresh)
- [ ] No N+1 queries — efficient aggregation with composite indexes
- [ ] Search supports partial name, phone, email matching

**Migration safety:**
- Additive: new table
- Backfill needed: optional — can backfill from existing reservation/tab history
- Consumer updates needed: yes — new consumers for tab close and reservation status change

---

### Session 10: Analytics Read Models & Dashboard Metrics

**Goal:** Build comprehensive analytics read models for RevPASH, covers per hour, seating efficiency, waitlist accuracy, server performance scores, and no-show rate — powering the host stand dashboard.

**Prerequisites:** Session 8 (Revenue Optimization), Session 9 (Guest Intelligence)

**Complexity:** L

**Files to create or modify:**
```
packages/db/src/schema/fnb.ts                                         — MODIFY (add 3 read model tables)
packages/modules/fnb/src/consumers/handle-host-analytics.ts           — NEW
packages/modules/fnb/src/queries/get-host-analytics-dashboard.ts      — NEW (replace simple version)
packages/modules/fnb/src/queries/get-seating-efficiency.ts            — NEW
packages/modules/fnb/src/queries/get-waitlist-accuracy.ts             — NEW
packages/modules/fnb/src/queries/get-covers-per-hour.ts               — NEW
packages/modules/fnb/src/queries/get-no-show-trends.ts                — NEW
packages/modules/fnb/src/services/analytics-aggregator.ts             — NEW (pure function)
packages/modules/fnb/src/validation-host.ts                           — MODIFY (add analytics schemas)
packages/modules/fnb/src/__tests__/host-analytics.test.ts             — NEW
packages/db/migrations/0263_host_analytics_read_models.sql            — NEW
```

**Schema changes:**
```typescript
// Read model: per-location per-date per-hour host metrics
export const rmFnbHostHourly = pgTable('rm_fnb_host_hourly', {
  id: text('id').primaryKey().$defaultFn(generateUlid),
  tenantId: text('tenant_id').notNull(),
  locationId: text('location_id').notNull(),
  businessDate: date('business_date').notNull(),
  hour: integer('hour').notNull(),                  // 0-23
  coversSeated: integer('covers_seated').notNull().default(0),
  tablesSeated: integer('tables_seated').notNull().default(0),
  tablesCleared: integer('tables_cleared').notNull().default(0),
  revenueCents: integer('revenue_cents').notNull().default(0),
  avgTurnMinutes: integer('avg_turn_minutes'),
  availableSeats: integer('available_seats'),        // capacity snapshot
  waitlistAdded: integer('waitlist_added').notNull().default(0),
  waitlistSeated: integer('waitlist_seated').notNull().default(0),
  reservationsBooked: integer('reservations_booked').notNull().default(0),
  reservationsSeated: integer('reservations_seated').notNull().default(0),
  reservationsNoShow: integer('reservations_no_show').notNull().default(0),
  walkinCount: integer('walkin_count').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_rm_fnb_host_hourly_lookup').on(table.tenantId, table.locationId, table.businessDate, table.hour),
]);

// Read model: waitlist accuracy tracking
export const rmFnbWaitlistAccuracy = pgTable('rm_fnb_waitlist_accuracy', {
  id: text('id').primaryKey().$defaultFn(generateUlid),
  tenantId: text('tenant_id').notNull(),
  locationId: text('location_id').notNull(),
  businessDate: date('business_date').notNull(),
  mealPeriod: text('meal_period'),
  totalQuotes: integer('total_quotes').notNull().default(0),
  quotedTotalMinutes: integer('quoted_total_minutes').notNull().default(0),
  actualTotalMinutes: integer('actual_total_minutes').notNull().default(0),
  withinFiveMin: integer('within_five_min').notNull().default(0),      // quotes accurate within 5 min
  overEstimated: integer('over_estimated').notNull().default(0),
  underEstimated: integer('under_estimated').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_rm_fnb_waitlist_accuracy_lookup').on(table.tenantId, table.locationId, table.businessDate),
]);

// Read model: seating efficiency per date
export const rmFnbSeatingEfficiency = pgTable('rm_fnb_seating_efficiency', {
  id: text('id').primaryKey().$defaultFn(generateUlid),
  tenantId: text('tenant_id').notNull(),
  locationId: text('location_id').notNull(),
  businessDate: date('business_date').notNull(),
  mealPeriod: text('meal_period'),
  totalTurns: integer('total_turns').notNull().default(0),
  avgCapacityUtilization: integer('avg_capacity_utilization'),  // percentage (0-100)
  avgTurnMinutes: integer('avg_turn_minutes'),
  revpashCents: integer('revpash_cents'),                       // cents per seat per hour
  totalCovers: integer('total_covers').notNull().default(0),
  totalRevenueCents: integer('total_revenue_cents').notNull().default(0),
  availableSeatHours: integer('available_seat_hours'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_rm_fnb_seating_eff_lookup').on(table.tenantId, table.locationId, table.businessDate),
]);
```

**Service functions:**
```typescript
// Pure function
export function computeSeatingEfficiency(
  turns: Array<{ partySize: number; tableCapacity: number; durationMinutes: number; revenueCents: number }>,
  totalSeats: number,
  periodHours: number,
): SeatingEfficiencyMetrics

// Pure function
export function computeWaitlistAccuracy(
  entries: Array<{ quotedMinutes: number; actualMinutes: number }>,
): WaitlistAccuracyMetrics
```

**Events:**
Consumers for: `fnb.party.seated.v1`, `fnb.tab.closed.v1`, `fnb.table.turn_completed.v1`, `fnb.reservation.status_changed.v1`, `fnb.waitlist.seated.v1`

**API routes:**
- `GET /api/v1/fnb/host/analytics/dashboard?date=` — comprehensive dashboard (all metrics)
- `GET /api/v1/fnb/host/analytics/covers-per-hour?date=` — hourly cover chart data
- `GET /api/v1/fnb/host/analytics/seating-efficiency?dateFrom=&dateTo=` — efficiency trends
- `GET /api/v1/fnb/host/analytics/waitlist-accuracy?dateFrom=&dateTo=` — accuracy trends
- `GET /api/v1/fnb/host/analytics/no-show-trends?dateFrom=&dateTo=` — no-show analysis

**Test cases:**
1. Hourly metrics — correctly bucketed by hour
2. RevPASH — computed correctly from revenue / seats / hours
3. Waitlist accuracy — quoted vs actual delta tracked, within-5-min percentage
4. Seating efficiency — capacity utilization = avg(partySize/tableCapacity)
5. No-show rate — noShowCount / totalReservations per period
6. Covers per hour — peak hour identification
7. Consumer idempotency — replay-safe upserts
8. Zero data — returns zeros, not errors or nulls
9. Multi-meal-period — metrics broken down by meal period
10. Server performance scores — ranking by covers, revenue, turn speed

**Acceptance criteria:**
- [ ] Host stand dashboard shows: RevPASH, covers/hour, avg turn time, seating efficiency %, waitlist accuracy %, no-show rate %
- [ ] All metrics update in near-real-time via event consumers
- [ ] Historical trend charts powered by read model queries
- [ ] Consumers use atomic upsert pattern (ON CONFLICT DO UPDATE)
- [ ] Read models follow existing `rm_fnb_*` naming convention

**Migration safety:**
- Additive: 3 new tables
- Backfill needed: optional — can backfill from existing event history
- Consumer updates needed: yes — 5 new consumer registrations

---

## Migration Summary

| Migration | Session | Table(s) | Type |
|---|---|---|---|
| `0257_reservation_conflict_index.sql` | S2 | `fnb_reservations` (index only) | Additive |
| `0258_pacing_rules.sql` | S3 | `fnb_pacing_rules` | Additive |
| `0259_table_dirty_since.sql` | S4 | `fnb_table_live_status` (column) | Additive |
| `0260_waitlist_offers.sql` | S5 | `fnb_waitlist_entries` (columns) | Additive |
| `0261_server_load_snapshots.sql` | S6 | `fnb_server_load_snapshots` | Additive |
| `0262_turn_time_aggregates.sql` | S7 | `fnb_turn_time_aggregates` | Additive |
| `0263_guest_profiles.sql` | S9 | `fnb_guest_profiles` | Additive |
| `0264_host_analytics_read_models.sql` | S10 | `rm_fnb_host_hourly`, `rm_fnb_waitlist_accuracy`, `rm_fnb_seating_efficiency` | Additive |

**All migrations are additive** — no breaking changes, no column renames, no data loss. Safe to deploy without downtime.

---

## Session Execution Order

```
Phase A (parallel):
  S1: Atomic Seating Transaction         [L]
  S2: Reservation Conflict Detection     [M]
  S3: Pacing Engine                      [M]

Phase B (requires S1):
  S4: POS Integration                    [L]

Phase C (requires S1 + S2):
  S5: Waitlist Auto-Promotion            [M]

Phase D (requires S4):
  S6: Server Load Snapshot               [M]

Phase E (requires S6):
  S7: Predictive Turn Engine V2          [M]

Phase F (parallel, requires S3+S5 and S7 respectively):
  S8: Revenue Optimization               [M]
  S9: Guest Intelligence                 [M]

Phase G (requires S8+S9):
  S10: Analytics & Read Models           [L]
```

**Total: 10 sessions, 4 Large + 6 Medium**
**Critical path: S1 → S4 → S6 → S7 → S10 (5 sessions)**
