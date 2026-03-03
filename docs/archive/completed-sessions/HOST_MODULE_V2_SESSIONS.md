# OppsEra Host Module V2 — Executable Session Specs

> **Instructions for Claude:** Execute these sessions in order (HOST-01 through HOST-08). After each session, run all tests. If tests pass, proceed to the next session automatically. **Only stop if:**
> 1. A test fails that you cannot debug and resolve after 2 attempts
> 2. You have a genuine business-logic question that cannot be inferred from context
> 3. You need clarification on an integration point with an existing module
>
> If a test fails, debug it, fix it, re-run, and continue. Do not ask permission to proceed between sessions.
>
> **Before starting:** Read `CLAUDE.md` and `CONVENTIONS.md` in full. Every pattern, naming convention, and architectural decision in those files applies to this work.

---

## Pre-Session Context

### What Exists Today (V1)
The F&B module (`packages/modules/fnb/`) has 103 commands, 63 queries, 50+ schema tables. Relevant existing pieces:
- **Table Management**: `syncTablesFromFloorPlan`, `createTable`, `updateTable`, `seatTable`, `clearTable`, `combineTable`, `uncombineTable` in `packages/modules/fnb/src/commands/`
- **Server Sections**: `createSection`, `assignServer`, `cutServer`, `pickupSection`
- **Host Stand Frontend**: `HostContent` component at the `/host` F&B POS route with `StatsBar`, `WaitlistPanel`, `ReservationTimeline`, `CoverBalance`, `RotationQueue`
- **Floor Plan Viewer**: Read-only Konva component in Room Layouts module
- **F&B Floor View**: `FnbFloorView` with Layout mode (spatial canvas + zoom) and Grid mode
- **Customer Module**: Full CRM + Universal Profile at `packages/modules/customers/`
- **F&B Design Tokens**: `fnb-design-tokens.css` with color palette, table status colors
- **Existing F&B schema**: `packages/db/src/schema/fnb.ts` — 50+ tables including `fnbTables`, `fnbTableStatusHistory`, `fnbSections`, `fnbServerAssignments`, `fnbWaitlistEntries`, `fnbReservations`

### Architecture Rules (Non-Negotiable)
- All code in `packages/modules/fnb/` (extend the existing module, do NOT create a new one)
- Schema in `packages/db/src/schema/fnb.ts` (extend existing file)
- Commands: one file per command in `src/commands/`, re-exported via `commands/index.ts`
- Queries: one file per query in `src/queries/`, re-exported via `queries/index.ts`
- API routes under `apps/web/src/app/api/v1/fnb/host/`
- Frontend components under `apps/web/src/components/host/`
- Frontend page at `apps/web/src/app/(dashboard)/host/`
- Follow command pattern (`publishWithOutbox`, idempotency, `auditLog`)
- Follow query pattern (`withTenant`, cursor pagination, `limit + 1` for hasMore)
- Zod validation in route handlers, not commands
- Events are self-contained (no cross-module queries in consumers)
- Dark mode default, opacity-based colors (Convention §145)
- Code-split heavy pages (`next/dynamic` + `ssr: false`, Convention §57)
- Every table: `id` (ULID), `tenant_id`, `location_id`, `created_at`, `updated_at`

### Color Palette (from spec)
```
Primary:      #0A558C (Club Blue)
Secondary:    #E17C0E (Club Orange)
Tertiary:     #2A9D8F (Accent Teal)
Available:    #2D9D78
Reserved:     #457B9D
Occupied:     #E17C0E
Dirty:        #6C757D
Out of Service: #E63946
```

---

## SESSION HOST-01: Schema, State Machine & Core Commands

### Objective
Build the enhanced data model, reservation lifecycle state machine, waitlist enhancements, table turn tracking, and all backend commands/queries for the Host Module V2.

### Step 1: Examine Existing Schema

Before writing any code, read the existing FnB schema to understand what tables already exist:

```bash
cat packages/db/src/schema/fnb.ts | head -200
```

Look specifically for: `fnbReservations`, `fnbWaitlistEntries`, `fnbTables`, `fnbTableStatusHistory`. We will be extending or replacing these tables. If they exist with basic columns, we ALTER them. If they need fundamental restructuring, create new versions with migration to move data.

### Step 2: Schema Changes

Add to `packages/db/src/schema/fnb.ts`. If `fnbReservations` already exists, create a migration that ALTERs it. If it doesn't exist or is too basic, create it fresh.

**`fnbReservations` — Full reservation table:**

```typescript
export const fnbReservations = pgTable(
  'fnb_reservations',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id').notNull().references(() => tenants.id),
    locationId: text('location_id').notNull().references(() => locations.id),
    customerId: text('customer_id'),  // nullable — FK to customers for linked reservations
    guestName: text('guest_name').notNull(),
    guestEmail: text('guest_email'),
    guestPhone: text('guest_phone'),  // E.164 format, required for SMS
    partySize: integer('party_size').notNull(),
    reservationDate: text('reservation_date').notNull(),  // YYYY-MM-DD
    reservationTime: text('reservation_time').notNull(),   // HH:MM (24h)
    endTime: text('end_time'),  // estimated end, calculated from meal duration
    mealPeriod: text('meal_period').notNull(),  // breakfast | lunch | dinner | brunch
    status: text('status').notNull().default('booked'),
    tableIds: text('table_ids').array(),  // assigned table IDs
    serverId: text('server_id'),
    source: text('source').notNull().default('host'),  // host | phone | online | walk_in | external
    specialRequests: text('special_requests'),
    occasion: text('occasion'),  // birthday | anniversary | business | date_night | celebration
    tags: text('tags').array().default([]),
    seatingPreference: text('seating_preference'),  // indoor | outdoor | bar | booth | window | quiet
    checkedInAt: timestamp('checked_in_at', { withTimezone: true }),
    seatedAt: timestamp('seated_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    cancelledBy: text('cancelled_by'),
    cancellationReason: text('cancellation_reason'),
    noShowAt: timestamp('no_show_at', { withTimezone: true }),
    confirmationSentAt: timestamp('confirmation_sent_at', { withTimezone: true }),
    reminderSentAt: timestamp('reminder_sent_at', { withTimezone: true }),
    notes: text('notes'),  // internal staff notes
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: text('created_by'),
  },
  (table) => [
    index('idx_fnb_reservations_tenant').on(table.tenantId),
    index('idx_fnb_reservations_date').on(table.tenantId, table.locationId, table.reservationDate),
    index('idx_fnb_reservations_status').on(table.tenantId, table.locationId, table.status),
    index('idx_fnb_reservations_customer').on(table.tenantId, table.customerId),
  ],
);
```

**`fnbWaitlistEntries` — Enhanced waitlist:**

```typescript
export const fnbWaitlistEntries = pgTable(
  'fnb_waitlist_entries',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id').notNull().references(() => tenants.id),
    locationId: text('location_id').notNull().references(() => locations.id),
    customerId: text('customer_id'),
    guestName: text('guest_name').notNull(),
    guestPhone: text('guest_phone').notNull(),  // required for notifications
    partySize: integer('party_size').notNull(),
    quotedWaitMinutes: integer('quoted_wait_minutes').notNull(),
    actualWaitMinutes: integer('actual_wait_minutes'),  // set on seat/remove
    status: text('status').notNull().default('waiting'),
    // waiting | notified | seated | no_show | cancelled | left
    position: integer('position').notNull(),  // queue rank
    seatingPreference: text('seating_preference'),
    specialRequests: text('special_requests'),
    estimatedReadyAt: timestamp('estimated_ready_at', { withTimezone: true }),
    notifiedAt: timestamp('notified_at', { withTimezone: true }),
    seatedAt: timestamp('seated_at', { withTimezone: true }),
    notificationCount: integer('notification_count').notNull().default(0),
    source: text('source').notNull().default('host'),  // host | qr_code | online
    guestToken: text('guest_token'),  // URL-safe token for guest status page
    tableId: text('table_id'),  // assigned when seated
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: text('created_by'),
  },
  (table) => [
    index('idx_fnb_waitlist_tenant').on(table.tenantId),
    index('idx_fnb_waitlist_active').on(table.tenantId, table.locationId, table.status),
    uniqueIndex('idx_fnb_waitlist_token').on(table.guestToken),
  ],
);
```

**`fnbTableTurnLog` — Turn time analytics:**

```typescript
export const fnbTableTurnLog = pgTable(
  'fnb_table_turn_log',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id').notNull().references(() => tenants.id),
    locationId: text('location_id').notNull().references(() => locations.id),
    tableId: text('table_id').notNull(),
    partySize: integer('party_size').notNull(),
    mealPeriod: text('meal_period').notNull(),
    seatedAt: timestamp('seated_at', { withTimezone: true }).notNull(),
    clearedAt: timestamp('cleared_at', { withTimezone: true }),
    turnTimeMinutes: integer('turn_time_minutes'),
    dayOfWeek: integer('day_of_week').notNull(),  // 0=Sunday, 6=Saturday
    wasReservation: boolean('was_reservation').notNull().default(false),
    reservationId: text('reservation_id'),
    waitlistEntryId: text('waitlist_entry_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_fnb_turn_log_tenant').on(table.tenantId),
    index('idx_fnb_turn_log_analytics').on(table.tenantId, table.locationId, table.mealPeriod, table.dayOfWeek),
  ],
);
```

**`fnbGuestNotifications` — Notification audit trail:**

```typescript
export const fnbGuestNotifications = pgTable(
  'fnb_guest_notifications',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id').notNull().references(() => tenants.id),
    locationId: text('location_id').notNull().references(() => locations.id),
    referenceType: text('reference_type').notNull(),  // reservation | waitlist
    referenceId: text('reference_id').notNull(),
    notificationType: text('notification_type').notNull(),
    // confirmation | reminder | table_ready | running_late | cancellation | custom
    channel: text('channel').notNull(),  // sms | email | push
    recipientPhone: text('recipient_phone'),
    recipientEmail: text('recipient_email'),
    messageBody: text('message_body').notNull(),
    status: text('status').notNull().default('pending'),  // pending | sent | delivered | failed
    sentAt: timestamp('sent_at', { withTimezone: true }),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    errorMessage: text('error_message'),
    externalId: text('external_id'),  // provider message ID
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_fnb_notifications_ref').on(table.tenantId, table.referenceType, table.referenceId),
  ],
);
```

### Step 3: Migration

Create migration file. Read `packages/db/migrations/meta/_journal.json` first to get the next index number. Use `IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS` for idempotency per Convention.

The migration should:
1. Create `fnb_reservations` table (or ALTER existing with new columns)
2. Create `fnb_waitlist_entries` table (or ALTER existing)
3. Create `fnb_table_turn_log` table
4. Create `fnb_guest_notifications` table
5. Add all indexes
6. Add RLS policies (SELECT, INSERT, UPDATE, DELETE scoped to `tenant_id = current_setting('app.current_tenant_id')`)

### Step 4: Validation Schemas

Create `packages/modules/fnb/src/validation-host.ts`:

```typescript
import { z } from 'zod';

const phoneRegex = /^\+?[1-9]\d{1,14}$/;  // E.164-ish

export const RESERVATION_STATUSES = [
  'booked', 'confirmed', 'checked_in', 'partially_seated',
  'seated', 'completed', 'no_show', 'cancelled',
] as const;

export const MEAL_PERIODS = ['breakfast', 'lunch', 'dinner', 'brunch'] as const;
export const SEATING_PREFERENCES = ['indoor', 'outdoor', 'bar', 'booth', 'window', 'quiet', 'none'] as const;
export const OCCASIONS = ['birthday', 'anniversary', 'business', 'date_night', 'celebration', 'other'] as const;
export const RESERVATION_SOURCES = ['host', 'phone', 'online', 'walk_in', 'external'] as const;
export const WAITLIST_STATUSES = ['waiting', 'notified', 'seated', 'no_show', 'cancelled', 'left'] as const;

export const RESERVATION_TRANSITIONS: Record<string, readonly string[]> = {
  booked:           ['confirmed', 'checked_in', 'cancelled', 'no_show'],
  confirmed:        ['checked_in', 'cancelled', 'no_show'],
  checked_in:       ['seated', 'partially_seated', 'cancelled', 'no_show'],
  partially_seated: ['seated', 'cancelled'],
  seated:           ['completed'],
  completed:        [],
  no_show:          ['booked'],
  cancelled:        ['booked'],
};

export function validateReservationTransition(from: string, to: string): boolean {
  const allowed = RESERVATION_TRANSITIONS[from];
  if (!allowed) return false;
  return allowed.includes(to);
}

export const createReservationSchema = z.object({
  guestName: z.string().min(1).max(200),
  guestEmail: z.string().email().optional(),
  guestPhone: z.string().regex(phoneRegex, 'Invalid phone number format').optional(),
  customerId: z.string().optional(),
  partySize: z.number().int().min(1).max(99),
  reservationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  reservationTime: z.string().regex(/^\d{2}:\d{2}$/, 'Time must be HH:MM'),
  mealPeriod: z.enum(MEAL_PERIODS),
  source: z.enum(RESERVATION_SOURCES).default('host'),
  specialRequests: z.string().max(1000).optional(),
  occasion: z.enum(OCCASIONS).optional(),
  tags: z.array(z.string()).default([]),
  seatingPreference: z.enum(SEATING_PREFERENCES).optional(),
  tableIds: z.array(z.string()).optional(),
  serverId: z.string().optional(),
  notes: z.string().max(2000).optional(),
  clientRequestId: z.string().min(1).max(128).optional(),
});

export type CreateReservationInput = z.input<typeof createReservationSchema>;

export const updateReservationSchema = z.object({
  guestName: z.string().min(1).max(200).optional(),
  guestEmail: z.string().email().optional(),
  guestPhone: z.string().regex(phoneRegex).optional(),
  partySize: z.number().int().min(1).max(99).optional(),
  reservationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  reservationTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  mealPeriod: z.enum(MEAL_PERIODS).optional(),
  specialRequests: z.string().max(1000).optional(),
  occasion: z.enum(OCCASIONS).nullable().optional(),
  tags: z.array(z.string()).optional(),
  seatingPreference: z.enum(SEATING_PREFERENCES).nullable().optional(),
  tableIds: z.array(z.string()).optional(),
  serverId: z.string().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  expectedVersion: z.number().int().optional(),
  clientRequestId: z.string().min(1).max(128).optional(),
});

export const addToWaitlistSchema = z.object({
  guestName: z.string().min(1).max(200),
  guestPhone: z.string().regex(phoneRegex, 'Phone required for waitlist notifications'),
  customerId: z.string().optional(),
  partySize: z.number().int().min(1).max(99),
  seatingPreference: z.enum(SEATING_PREFERENCES).optional(),
  specialRequests: z.string().max(1000).optional(),
  source: z.enum(['host', 'qr_code', 'online'] as const).default('host'),
  clientRequestId: z.string().min(1).max(128).optional(),
});

export const seatReservationSchema = z.object({
  tableIds: z.array(z.string()).min(1),
  adjustedPartySize: z.number().int().min(1).max(99).optional(),
  clientRequestId: z.string().min(1).max(128).optional(),
});

export const cancelReservationSchema = z.object({
  reason: z.string().max(500).optional(),
  clientRequestId: z.string().min(1).max(128).optional(),
});
```

### Step 5: Commands

Create each command as a separate file in `packages/modules/fnb/src/commands/`. Follow the exact command pattern from Convention §8:

**Commands to build (one file each):**

1. **`create-reservation.ts`** — Validates no double-booking for same table/time. Links customer if `customerId` provided. Calculates `endTime` based on meal period default duration. Emits `fnb.reservation.created.v1`.

2. **`update-reservation.ts`** — Optimistic locking via `expectedVersion`. Uses `fetchReservationForMutation` helper (analogous to `fetchOrderForMutation`). Only updates provided fields (PATCH semantics). Increments `version`. Emits `fnb.reservation.updated.v1`.

3. **`confirm-reservation.ts`** — Transitions `booked → confirmed`. Uses `validateReservationTransition`. Sets `confirmationSentAt` if SMS triggered. Emits `fnb.reservation.status_changed.v1` with `{ oldStatus, newStatus }`.

4. **`check-in-reservation.ts`** — Transitions `booked|confirmed → checked_in`. Sets `checkedInAt`. Emits status_changed event.

5. **`seat-reservation.ts`** — Transitions `checked_in → seated` (or `partially_seated` if not all guests arrived — use `adjustedPartySize` < original `partySize`). Accepts `tableIds`, calls existing `seatTable` command for each table. Sets `seatedAt`. Creates `fnbTableTurnLog` entry with `seatedAt`. Emits status_changed event.

6. **`complete-reservation.ts`** — Transitions `seated → completed`. Sets `completedAt`. Calculates turn time and updates the `fnbTableTurnLog` entry. Emits status_changed event.

7. **`cancel-reservation.ts`** — Transitions any non-terminal status → `cancelled`. Sets `cancelledAt`, `cancelledBy`, `cancellationReason`. If table was assigned, frees the table. Emits `fnb.reservation.cancelled.v1`.

8. **`mark-no-show.ts`** — Transitions `booked|confirmed → no_show`. Sets `noShowAt`. Frees any assigned table. Emits status_changed event.

9. **`add-to-waitlist.ts`** — Calculates next `position` (MAX(position) + 1 for active entries at location). Generates `guestToken` (8 char alphanumeric, crypto-random). Calls wait-time estimation (if available, otherwise use a default). Stores `quotedWaitMinutes` and `estimatedReadyAt`. Emits `fnb.waitlist.added.v1`.

10. **`update-waitlist-entry.ts`** — Updates party size, preference, requests. Recalculates estimated wait if party size changed.

11. **`notify-waitlist-party.ts`** — Transitions `waiting → notified`. Sets `notifiedAt`, increments `notificationCount`. Creates a `fnbGuestNotifications` record with type `table_ready`. Emits `fnb.waitlist.notified.v1`. (Actual SMS send is fire-and-forget — create the notification record, dispatch async.)

12. **`seat-from-waitlist.ts`** — Transitions `waiting|notified → seated`. Accepts `tableIds`. Calculates `actualWaitMinutes` from `createdAt` to now. Calls `seatTable` for each table. Creates `fnbTableTurnLog` entry. Emits `fnb.waitlist.seated.v1`.

13. **`remove-from-waitlist.ts`** — Transitions to `cancelled` or `left`. Calculates `actualWaitMinutes`. Re-orders remaining positions. Emits `fnb.waitlist.removed.v1`.

14. **`record-table-turn.ts`** — Called when a table is cleared. Finds the open `fnbTableTurnLog` entry for this table (where `clearedAt` is null), sets `clearedAt` and calculates `turnTimeMinutes`. Emits `fnb.table.turn_completed.v1`.

15. **`send-guest-notification.ts`** — Generic notification dispatcher. Creates `fnbGuestNotifications` record. For V1, log the notification (actual SMS integration comes in HOST-03). Returns the notification record.

### Step 6: Queries

Create each in `packages/modules/fnb/src/queries/`:

1. **`list-reservations.ts`** — Filters: `date` (required), `mealPeriod` (optional), `status` (optional), `search` (guest name fuzzy). Cursor pagination. LEFT JOIN to `customers` for profile data (visit count, VIP tags). Returns sorted by `reservationTime ASC`.

2. **`get-reservation.ts`** — Single reservation with full details. JOIN customer profile, notification history, assigned table details.

3. **`get-upcoming-reservations.ts`** — Reservations for current location where `reservationDate = today` AND `reservationTime >= now - 30min` AND `status IN ('booked', 'confirmed', 'checked_in')`. Sorted by time ASC. Include VIP flag from customer tags. Limit configurable, default 20.

4. **`list-waitlist.ts`** — Active entries (`status IN ('waiting', 'notified')`), sorted by `position ASC`. Include customer profile if linked.

5. **`get-waitlist-entry.ts`** — Single entry with customer profile and notification history.

6. **`get-waitlist-stats.ts`** — Returns: `{ currentCount, avgWaitMinutes, longestWaitMinutes, nextEstimatedWait }`. Uses active entries only.

7. **`get-host-dashboard-metrics.ts`** — Aggregate metrics for the host stand header:
   - `coversSeated`: SUM of `partySize` for `status = 'seated' OR 'completed'` today
   - `coversExpected`: SUM of `partySize` for all non-cancelled reservations today
   - `tablesOccupied`: COUNT of tables with status `occupied`
   - `tablesTotal`: COUNT of all active tables at location
   - `avgWaitMinutes`: from waitlist stats
   - `reservationsRemaining`: COUNT of `booked|confirmed` for rest of day
   - `noShowCount`: COUNT of `no_show` today
   - `waitlistCount`: COUNT of active waitlist entries

8. **`get-table-turn-stats.ts`** — Avg turn time by party size bucket and meal period, for the last N days (default 28). Returns data needed for the wait-time estimator.

9. **`get-pre-shift-report.ts`** — For a given date + meal period:
   - All reservations with customer profiles
   - VIP arrivals (customers tagged VIP or with 10+ visits)
   - Allergy alerts (from customer preferences or reservation special_requests containing allergy keywords)
   - Large parties (partySize >= 6)
   - Special occasions
   - Server section assignments (from existing `fnbSections` + `fnbServerAssignments`)
   - Comparison vs. average: avg covers for this day-of-week + meal period from last 4 weeks

### Step 7: Events

Define in `packages/modules/fnb/src/events/host-events.ts`:

```typescript
export const HOST_EVENTS = {
  RESERVATION_CREATED: 'fnb.reservation.created.v1',
  RESERVATION_UPDATED: 'fnb.reservation.updated.v1',
  RESERVATION_STATUS_CHANGED: 'fnb.reservation.status_changed.v1',
  RESERVATION_CANCELLED: 'fnb.reservation.cancelled.v1',
  WAITLIST_ADDED: 'fnb.waitlist.added.v1',
  WAITLIST_NOTIFIED: 'fnb.waitlist.notified.v1',
  WAITLIST_SEATED: 'fnb.waitlist.seated.v1',
  WAITLIST_REMOVED: 'fnb.waitlist.removed.v1',
  TABLE_TURN_COMPLETED: 'fnb.table.turn_completed.v1',
} as const;
```

All event payloads must be self-contained per Convention §9. Include all fields needed for consumers without cross-module lookups.

### Step 8: Event Consumers

Create `packages/modules/fnb/src/consumers/host-consumers.ts`:

1. **Listen to `fnb.tab.closed.v1`** — When an F&B tab is closed, find the associated table and update its status to `payment_complete`. This triggers the "table about to turn" logic.

2. **Listen to `fnb.table.turn_completed.v1`** — Update the `fnbTableTurnLog` entry (this is the consumer that records analytics data for the turn-time estimator).

### Step 9: Module Index Exports

Update `packages/modules/fnb/src/index.ts` to export all new commands, queries, validation schemas, and event types.

### Step 10: Tests

Create `packages/modules/fnb/src/__tests__/host-reservations.test.ts` and `host-waitlist.test.ts`:

**Reservation tests (~25 tests):**
- Create reservation with valid data
- Create reservation rejects invalid phone format
- Create reservation rejects past date
- Create reservation rejects party size 0
- Create reservation idempotency (same clientRequestId returns same result)
- Update reservation with optimistic lock (correct version succeeds)
- Update reservation with stale version (throws ConflictError)
- Confirm reservation: booked → confirmed
- Confirm reservation: rejected from 'seated' status (invalid transition)
- Check-in reservation: confirmed → checked_in
- Seat reservation: checked_in → seated, creates turn log entry
- Complete reservation: seated → completed, calculates turn time
- Cancel reservation: any status → cancelled, frees table
- Mark no-show: booked → no_show
- Every invalid state transition throws ValidationError

**Waitlist tests (~15 tests):**
- Add to waitlist with valid data, position auto-calculated
- Add to waitlist generates guest token
- Notify waitlist party: waiting → notified
- Seat from waitlist: calculates actual wait time
- Remove from waitlist: re-orders positions
- Waitlist position ordering is correct after removal

**Query tests (~10 tests):**
- List reservations filters by date
- List reservations filters by meal period
- Get upcoming reservations excludes past
- Get dashboard metrics returns correct counts
- Get waitlist stats with empty waitlist

Run: `cd packages/modules/fnb && pnpm test`

### Completion Criteria
- [ ] 4 new schema tables (or ALTER extensions) in `fnb.ts`
- [ ] Migration file created and `_journal.json` updated
- [ ] Validation schemas with Zod in `validation-host.ts`
- [ ] 15 commands in `src/commands/`
- [ ] 9 queries in `src/queries/`
- [ ] Event types defined
- [ ] 2 event consumers
- [ ] Module index updated
- [ ] ~50 tests passing

**When all tests pass, proceed to HOST-02.**

---

## SESSION HOST-02: Wait-Time Estimation Engine & Table Assignment Intelligence

### Objective
Build the algorithmic services that power smart wait-time quotes and optimal table-to-party matching.

### Step 1: Wait-Time Estimator

Create `packages/modules/fnb/src/services/wait-time-estimator.ts`:

```typescript
export interface WaitTimeEstimate {
  estimatedMinutes: number;
  confidence: 'high' | 'medium' | 'low' | 'default';
  factors: {
    avgTurnTimeMinutes: number;
    occupancyPercent: number;
    tablesAvailableSoon: number;
    upcomingReservationClaims: number;
    dataPointCount: number;
  };
}

export interface EstimateWaitTimeInput {
  tenantId: string;
  locationId: string;
  partySize: number;
  mealPeriod: string;
  requestedAt?: Date;
}
```

**Algorithm (implement step by step):**

1. **Get party size bucket**: 1-2 = `small`, 3-4 = `medium`, 5-6 = `large`, 7+ = `xlarge`

2. **Query historical turn times**: From `fnbTableTurnLog`, get avg `turnTimeMinutes` filtered by:
   - Same location
   - Same meal period
   - Same party size bucket (capacity matching, not exact)
   - Last 28 days
   - Fallback: if < 10 data points for this bucket, widen to all sizes for this meal period. If still < 10, use defaults: `{ small: 45, medium: 60, large: 75, xlarge: 90 }`.

3. **Get current occupancy**: Query `fnbTables` for this location:
   - `totalTables`: count of tables with capacity >= partySize (or combinable)
   - `occupiedTables`: count of those that are in status `occupied`, `payment_complete`
   - `occupancyPercent` = occupiedTables / totalTables

4. **Count tables about to turn**: Tables where status = `payment_complete`, or where `seatedAt` + `avgTurnTime * 0.8` < now (80% through expected turn)

5. **Count upcoming reservation claims**: Reservations in next 2 hours with status `booked|confirmed|checked_in` that require a table matching this party size

6. **Calculate**:
   ```
   available_tables = totalTables - occupiedTables
   tables_about_to_free = count of tables about to turn
   effective_available = available_tables + tables_about_to_free
   reservation_claims = upcoming reservations needing this size
   net_available = effective_available - reservation_claims

   if net_available > 0:
     estimated_minutes = 0  // table available now or very soon
   else:
     turns_needed = abs(net_available) + 1
     estimated_minutes = avg_turn_time * (turns_needed / max(tables_about_to_free, 1))
   ```

7. **Round**: to nearest 5 minutes. Clamp to min 5, max 120.

8. **Confidence**: based on data point count for the avg turn time query:
   - 50+ = `high`
   - 20-49 = `medium`
   - 10-19 = `low`
   - <10 = `default` (using hardcoded defaults)

### Step 2: Table Assignment Scorer

Create `packages/modules/fnb/src/services/table-assigner.ts`:

```typescript
export interface TableSuggestion {
  tableIds: string[];
  tableNumbers: string[];
  combinedCapacity: number;
  score: number;
  reasoning: string;
  serverId?: string;
  serverName?: string;
}

export interface SuggestTablesInput {
  tenantId: string;
  locationId: string;
  partySize: number;
  seatingPreference?: string;
  isVip?: boolean;
  customerId?: string;
}
```

**Scoring algorithm:**

1. **Filter eligible tables**: Query all tables at location where `status = 'available'` and `capacity >= partySize`.

2. **Score each table (0.0 to 1.0)**:

   a. **Capacity fit (40% weight)**: `1 - ((capacity - partySize) / maxCapacityAtLocation)`. Perfect fit scores 1.0. A 6-top for a party of 2 scores low.

   b. **Seating preference match (25% weight)**: Compare guest preference against table's `location` or `tags` (from room layout data — patio tables tagged `outdoor`, etc.). Match = 1.0, no preference = 0.5, mismatch = 0.0.

   c. **Server balance (20% weight)**: Get covers-per-server for all active sections. Prefer sections with fewer current covers. `1 - (serverCurrentCovers / maxServerCovers)`.

   d. **VIP / preference (15% weight)**: If customer is VIP AND has a historically preferred table (from past `fnbTableTurnLog` entries linking `customerId`), that table gets 1.0. VIP without preference gets 0.5 for premium-tagged tables. Non-VIP = 0.5 baseline.

3. **Multi-table combinations**: If no single table fits, find pairs of adjacent/combinable tables (tables marked as combinable in the room layout). Score = average of individual scores * 0.85 penalty (combinations are less ideal).

4. **Sort by score descending**, return top 3.

5. **Generate reasoning string**: Human-readable explanation. Examples:
   - "Perfect fit: 4-top, matches outdoor preference, in Server Kim's section"
   - "Slightly oversized (6-top for 4), but matches booth preference"
   - "Combined tables 14+15, only option for party of 10"

### Step 3: Integration into Existing Commands

Update `add-to-waitlist.ts`:
- Import and call `estimateWaitTime()` to get the quote
- Store `quotedWaitMinutes` and `estimatedReadyAt` on the entry
- If estimator returns 0 minutes, the host can choose to seat immediately

Update `seat-reservation.ts` and `seat-from-waitlist.ts`:
- If no `tableIds` provided in input, call `suggestTables()` and return suggestions in the response
- If `tableIds` ARE provided, proceed with seating
- API response shape: `{ data: reservation, suggestions?: TableSuggestion[] }`

### Step 4: Queries

Add to `packages/modules/fnb/src/queries/`:

1. **`estimate-wait-time.ts`** — Thin wrapper around the estimator service. Used by the API route.

2. **`suggest-tables.ts`** — Thin wrapper around the assigner service. Used by the API route.

3. **`get-table-availability-forecast.ts`** — For the next N hours (default 4), estimate when each occupied table will become available. Returns: `{ tableId, tableNumber, capacity, estimatedAvailableAt, currentPartySize, seatedAt }[]`. Calculation: `seatedAt + avgTurnTimeForSize`.

### Step 5: Tests

Create `packages/modules/fnb/src/__tests__/host-estimator.test.ts`:

**Wait-time estimator tests (~15 tests):**
- Empty restaurant returns 0 wait
- 50% occupied, adequate turn data, returns reasonable estimate
- 100% occupied, 2 tables about to turn, factors them in
- Upcoming reservations reduce effective availability
- Party of 8 with no single table, estimates based on combination availability
- Less than 10 data points falls back to defaults with 'default' confidence
- 50+ data points returns 'high' confidence
- Estimate rounds to nearest 5 minutes
- Estimate clamped to 5-120 range

**Table assigner tests (~15 tests):**
- Single perfect-fit table scores highest
- Oversized table scores lower than perfect fit
- Seating preference match boosts score
- Server with fewer covers preferred
- VIP with historical table preference
- No available single table triggers combination logic
- Returns max 3 suggestions sorted by score
- Empty restaurant returns first 3 tables by capacity fit
- All tables occupied returns empty array

Run: `cd packages/modules/fnb && pnpm test`

### Completion Criteria
- [ ] Wait-time estimator service with configurable defaults
- [ ] Table assignment scorer with 4-factor scoring
- [ ] Integration with `add-to-waitlist`, `seat-reservation`, `seat-from-waitlist`
- [ ] 3 new queries
- [ ] ~30 tests passing

**When all tests pass, proceed to HOST-03.**

---

## SESSION HOST-03: API Routes & Notification Infrastructure

### Objective
Build all API routes and the SMS notification service with provider abstraction.

### Step 1: Notification Service

Create `packages/modules/fnb/src/services/notification-service.ts`:

```typescript
// Provider interface — allows swapping Twilio for another provider
export interface SmsProvider {
  sendSms(to: string, body: string, from: string): Promise<{ externalId: string; status: string }>;
}

// Console provider for development (logs to console, returns fake ID)
export class ConsoleSmsProvider implements SmsProvider {
  async sendSms(to: string, body: string, from: string) {
    console.log(`[SMS] To: ${to}, From: ${from}, Body: ${body}`);
    return { externalId: `console_${Date.now()}`, status: 'sent' };
  }
}

// Twilio provider for production
export class TwilioSmsProvider implements SmsProvider {
  constructor(
    private accountSid: string,
    private authToken: string,
  ) {}

  async sendSms(to: string, body: string, from: string) {
    // Use fetch to call Twilio REST API directly (no SDK dependency)
    const url = `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`;
    const auth = Buffer.from(`${this.accountSid}:${this.authToken}`).toString('base64');
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: to, From: from, Body: body }),
    });
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Twilio SMS failed: ${response.status} ${error}`);
    }
    const data = await response.json();
    return { externalId: data.sid, status: data.status };
  }
}

// Singleton pattern per Convention §7
let _smsProvider: SmsProvider | null = null;
export function getSmsProvider(): SmsProvider {
  if (!_smsProvider) {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    _smsProvider = (sid && token)
      ? new TwilioSmsProvider(sid, token)
      : new ConsoleSmsProvider();
  }
  return _smsProvider;
}
export function setSmsProvider(provider: SmsProvider): void {
  _smsProvider = provider;
}
```

Create `packages/modules/fnb/src/services/notification-templates.ts`:

```typescript
export const NOTIFICATION_TEMPLATES = {
  table_ready: {
    sms: 'Hi {guestName}! Your table at {venueName} is ready. Please return to the host stand within {expiryMinutes} minutes. View status: {statusUrl}',
  },
  reservation_confirmation: {
    sms: 'Confirmed: {guestName}, party of {partySize} at {venueName} on {date} at {time}. Reply CANCEL to cancel.',
  },
  reservation_reminder: {
    sms: 'Reminder: {guestName}, your reservation at {venueName} is today at {time} for {partySize}. Reply CANCEL to cancel.',
  },
  reservation_cancelled: {
    sms: 'Your reservation at {venueName} on {date} at {time} has been cancelled.',
  },
  waitlist_joined: {
    sms: 'Hi {guestName}! You\'re #{position} on the waitlist at {venueName}. Estimated wait: ~{waitMinutes} min. Track your spot: {statusUrl}',
  },
} as const;

export function renderTemplate(
  templateKey: keyof typeof NOTIFICATION_TEMPLATES,
  variables: Record<string, string | number>,
): string {
  let text = NOTIFICATION_TEMPLATES[templateKey].sms;
  for (const [key, value] of Object.entries(variables)) {
    text = text.replace(new RegExp(`\\{${key}\\}`, 'g'), String(value));
  }
  return text;
}
```

Update `send-guest-notification.ts` command to actually dispatch via the SMS provider (fire-and-forget pattern — create notification record first, dispatch async, update status on callback/error).

### Step 2: API Routes

Create routes under `apps/web/src/app/api/v1/fnb/host/`. Every route uses `withMiddleware` with appropriate permission and `pos_fnb` entitlement.

**Reservation routes:**

| # | Method | Path | Handler | Permission |
|---|--------|------|---------|-----------|
| 1 | POST | `/reservations/route.ts` | createReservation | fnb.host.manage |
| 2 | GET | `/reservations/route.ts` | listReservations | fnb.host.view |
| 3 | GET | `/reservations/[id]/route.ts` | getReservation | fnb.host.view |
| 4 | PATCH | `/reservations/[id]/route.ts` | updateReservation | fnb.host.manage |
| 5 | POST | `/reservations/[id]/confirm/route.ts` | confirmReservation | fnb.host.manage |
| 6 | POST | `/reservations/[id]/check-in/route.ts` | checkInReservation | fnb.host.manage |
| 7 | POST | `/reservations/[id]/seat/route.ts` | seatReservation | fnb.host.manage |
| 8 | POST | `/reservations/[id]/complete/route.ts` | completeReservation | fnb.host.manage |
| 9 | POST | `/reservations/[id]/cancel/route.ts` | cancelReservation | fnb.host.manage |
| 10 | POST | `/reservations/[id]/no-show/route.ts` | markNoShow | fnb.host.manage |
| 11 | GET | `/reservations/upcoming/route.ts` | getUpcomingReservations | fnb.host.view |

**Waitlist routes:**

| # | Method | Path | Handler | Permission |
|---|--------|------|---------|-----------|
| 12 | POST | `/waitlist/route.ts` | addToWaitlist | fnb.host.manage |
| 13 | GET | `/waitlist/route.ts` | listWaitlist | fnb.host.view |
| 14 | GET | `/waitlist/[id]/route.ts` | getWaitlistEntry | fnb.host.view |
| 15 | PATCH | `/waitlist/[id]/route.ts` | updateWaitlistEntry | fnb.host.manage |
| 16 | POST | `/waitlist/[id]/notify/route.ts` | notifyWaitlistParty | fnb.host.manage |
| 17 | POST | `/waitlist/[id]/seat/route.ts` | seatFromWaitlist | fnb.host.manage |
| 18 | POST | `/waitlist/[id]/remove/route.ts` | removeFromWaitlist | fnb.host.manage |
| 19 | GET | `/waitlist/stats/route.ts` | getWaitlistStats | fnb.host.view |

**Intelligence routes:**

| # | Method | Path | Handler | Permission |
|---|--------|------|---------|-----------|
| 20 | POST | `/estimate-wait/route.ts` | estimateWaitTime | fnb.host.view |
| 21 | POST | `/suggest-tables/route.ts` | suggestTables | fnb.host.manage |
| 22 | GET | `/availability-forecast/route.ts` | getTableAvailabilityForecast | fnb.host.view |

**Dashboard routes:**

| # | Method | Path | Handler | Permission |
|---|--------|------|---------|-----------|
| 23 | GET | `/dashboard/route.ts` | getHostDashboardMetrics | fnb.host.view |
| 24 | GET | `/pre-shift/route.ts` | getPreShiftReport | fnb.host.view |
| 25 | GET | `/turn-stats/route.ts` | getTableTurnStats | fnb.host.view |

**Notification routes:**

| # | Method | Path | Handler | Permission |
|---|--------|------|---------|-----------|
| 26 | POST | `/notifications/send/route.ts` | sendGuestNotification | fnb.host.manage |

**Guest self-service routes (PUBLIC — no auth):**

| # | Method | Path | Handler | Notes |
|---|--------|------|---------|-------|
| 27 | GET | `/guest/waitlist/[token]/route.ts` | getGuestWaitlistStatus | public: true |
| 28 | POST | `/guest/waitlist/join/route.ts` | guestJoinWaitlist | public: true, rate limited |
| 29 | PATCH | `/guest/waitlist/[token]/update/route.ts` | guestUpdateEntry | public: true |

For public routes, use `withMiddleware(handler, { public: true })`. Add basic rate limiting: check a counter per IP in memory (or use the existing sliding window rate limiter pattern).

### Step 3: Permissions

Update `packages/shared/src/permissions/permission-matrix.ts`:
```typescript
// Add to PERMISSION_MATRIX
'fnb.host.view': { description: 'View host stand, reservations, waitlist' },
'fnb.host.manage': { description: 'Create/edit reservations, manage waitlist' },
'fnb.host.notifications': { description: 'Send SMS notifications to guests' },
'fnb.host.analytics': { description: 'View host analytics and reports' },
```

Update `apps/web/src/app/(dashboard)/settings/settings-content.tsx` — add "Host Stand" sub-group under F&B POS.

Update `packages/db/src/seed.ts` — default role assignments:
- Owner/Manager: all 4 permissions
- Supervisor: view + manage + notifications
- Server: view only
- Cashier/Staff: view only

### Step 4: Tests

Create `apps/web/src/app/api/v1/fnb/host/__tests__/host-api.test.ts`:

**API contract tests (~20 tests):**
- POST /reservations creates reservation, returns 201
- GET /reservations filters by date
- GET /reservations/[id] returns full detail
- PATCH /reservations/[id] with wrong version returns 409
- POST /reservations/[id]/check-in transitions status
- POST /reservations/[id]/seat with tableIds succeeds
- POST /reservations/[id]/cancel returns cancelled reservation
- POST /waitlist creates entry with position and token
- GET /waitlist returns sorted by position
- POST /waitlist/[id]/notify updates status to notified
- POST /waitlist/[id]/seat calculates actual wait
- POST /estimate-wait returns estimate with confidence
- POST /suggest-tables returns scored suggestions
- GET /dashboard returns all metric fields
- GET /guest/waitlist/[token] returns public status (no auth)
- POST /guest/waitlist/join creates entry (public)
- Permission checks: server role cannot POST /reservations

Run: `pnpm test`

### Completion Criteria
- [ ] Notification service with provider abstraction (Console + Twilio)
- [ ] Notification templates with variable interpolation
- [ ] ~29 API route files
- [ ] Permission matrix updated
- [ ] Seed updated with role defaults
- [ ] ~20 API contract tests passing

**When all tests pass, proceed to HOST-04.**

---

## SESSION HOST-04: Host Stand Frontend — Layout, Floor Map & Card Lists

### Objective
Build the complete host stand frontend with iPad-first layout, embedded interactive floor map, and reservation/waitlist card lists.

### Step 1: Types

Create `apps/web/src/types/host.ts`:

Define TypeScript interfaces for all host data objects — reservations, waitlist entries, dashboard metrics, table suggestions, wait estimates, pre-shift report data. These should match the API response shapes exactly.

### Step 2: Hooks

Create `apps/web/src/hooks/use-host.ts`:

Build all data-fetching hooks using the existing `useFetch` / React Query patterns:

```typescript
// Data hooks (polling where noted)
export function useHostReservations(date: string, mealPeriod?: string, status?: string)
export function useHostWaitlist(locationId: string)  // polls every 5s
export function useHostDashboard(locationId: string)  // polls every 10s
export function useHostPreShift(locationId: string, mealPeriod: string)
export function useTableStatus(locationId: string)  // polls every 5s
export function useWaitTimeEstimate(partySize: number, mealPeriod: string)
export function useTableSuggestions(partySize: number, preferences?: string, customerId?: string)

// Mutation hooks
export function useReservationActions()
// Returns: { checkIn, seat, complete, cancel, markNoShow, confirm }
// Each returns { execute, isLoading, error }

export function useWaitlistActions()
// Returns: { add, notify, seat, remove, update }

export function useNotificationActions()
// Returns: { send, retry }
```

Polling hooks must use the Page Visibility API to pause when tab is hidden (same pattern as `useFnbFloor`).

### Step 3: Page Shell

Create the code-split page entry:

**`apps/web/src/app/(dashboard)/host/page.tsx`** — thin dynamic wrapper:
```typescript
'use client';
import dynamic from 'next/dynamic';
const HostStandContent = dynamic(() => import('./host-stand-content'), { ssr: false });
export default function HostPage() { return <HostStandContent />; }
```

**`apps/web/src/app/(dashboard)/host/host-stand-content.tsx`** — main host stand application. Uses the full-screen layout (no sidebar scroll).

### Step 4: Layout Components

All components in `apps/web/src/components/host/`:

**`HostStandLayout.tsx`**
- CSS Grid: `grid-template-rows: auto 1fr` (top bar + main content)
- Main content: `grid-template-columns: 380px 1fr`
- Full viewport height (`h-screen`), `overflow-hidden` on root
- Background: `bg-surface`

**`HostTopBar.tsx`**
- Left: date display + live clock (`useEffect` with 1s interval, cleanup on unmount)
- Center: Meal period pills — auto-select based on current time using configurable schedule (breakfast 6-10:30, lunch 11-15, dinner 17-22, brunch 10-14 weekends). User can override.
- Right: Stats chips from `useHostDashboard`:
  - Covers: `{seated}/{expected}` with progress ring
  - Tables: `{occupied}/{total}` with color indicator
  - Wait: `~{avgWait} min`
  - Remaining reservations badge
- Far right: View toggle (Map/Grid), Settings gear icon

**`HostLeftPanel.tsx`**
- Tab switcher: "Waitlist ({count})" | "Reservations ({count})" | "Pre-Shift"
- Count badges use opacity-based colors, hidden when 0
- Active tab has bottom border accent
- Scrollable content area below tabs
- Bottom fixed: "+ Walk-in" button (primary) and "+ Reservation" button (secondary)

### Step 5: Card List Components

**`WaitlistCardList.tsx`**
- Maps over waitlist entries from `useHostWaitlist`
- Each card (`WaitlistCard.tsx`):
  - Left edge: rank circle badge (28px, color: green if wait < 15m, amber 15-30m, red > 30m)
  - Body: guest name (bold, `text-sm`), party size chip, seating preference chip
  - Wait display: "Quoted: 20m · Waiting: 18m" with a thin progress bar underneath
  - Right: action buttons stacked vertically
    - "Seat" — solid green, 44px height
    - "Notify" — outlined, 44px
    - Remove — icon-only X button, 34px
  - Expand on tap: shows phone, special requests, customer link (if `customerId`)
- Empty state: centered illustration with "No guests waiting" and "+ Add Walk-in" CTA
- Skeleton loading: 3 card placeholders with shimmer

**`ReservationCardList.tsx`**
- Groups reservations by time slot (from `useHostReservations`)
- Time slot headers (`ReservationTimeHeader.tsx`): sticky within scroll, shows time + count
- Each card (`ReservationCard.tsx`):
  - Left: time display (large `text-lg` bold)
  - Center: guest name, party size chip, status badge (color-coded per status)
  - Indicators row: VIP star (gold), special requests icon, occasion icon, allergy alert icon (red)
  - Table chip (if pre-assigned): "T12" in blue
  - Right: primary action button that changes by status:
    - `booked` → "Check In" (green)
    - `confirmed` → "Check In" (green)
    - `checked_in` → "Seat" (green)
    - `seated` → "Complete" (outlined gray)
  - Overdue indicator: if reservation time is > 15 min past and status still `booked`, show red left border + "Late" badge
- Expand on tap: full details + mini customer profile card + table suggestion chips

**`PreShiftPanel.tsx`**
- Summary cards: total reservations, expected covers, VIP count, large party count
- Scrollable alert list (allergy alerts in red, large parties in amber, occasions in blue)
- VIP arrival details with customer visit history
- Staff assignment grid

### Step 6: Floor Map Integration

**`HostFloorMap.tsx`**
- Imports the `FloorPlanViewer` from Room Layouts module (read-only Konva canvas)
- Overlays a status layer on each table:
  - Color fill at 30% opacity based on table status
  - Table number + capacity label
  - If occupied: guest name + party size + elapsed time badge
  - If occupied: server name badge (small circle with initial)
- Available tables: subtle pulse animation via CSS keyframe on an HTML overlay div (not Konva animation — simpler, less CPU)
- Tap table → show `TablePopover` (positioned near table, viewport-clamped)
- Room tabs above if multiple rooms exist
- Auto-refresh: driven by `useTableStatus` polling (5s)
- Corner: status legend (collapsible) showing count per status

**`HostGridView.tsx`**
- Alternative table list view (when "Grid" selected in top bar)
- DataTable with columns: #, Capacity, Status (badge), Party, Server, Seated, Est. Remaining, Actions
- Sortable columns
- Row background at 5% opacity based on status color
- Inline action buttons per row

**`TablePopover.tsx`**
- Floating card positioned near the tapped table
- Shows: table info, current party details, server, elapsed time, estimated remaining
- For available tables: "Suggested Parties" list from `useTableSuggestions`
  - Each suggestion: guest name, source (Res/Wait), party size, score badge, "Seat Here" button
- For occupied: "Mark Clearing" and "Clear" buttons
- Dismiss: tap outside or close X

### Step 7: Modals

**`AddWalkInModal.tsx`**
- Portal-based modal (matches existing OppsEra modal patterns)
- Fields: Name (text), Phone (tel with format), Party Size (number stepper with +/- buttons, min 1 max 20)
- Optional: Seating Preference chips (Indoor, Outdoor, Bar, Booth, Window, Quiet)
- Shows estimated wait from `useWaitTimeEstimate` dynamically as party size changes
- Actions: "Add to Waitlist" (primary), "Seat Now" (secondary, shown only if tables available)
- Phone field: validates E.164 on blur, shows inline error

**`NewReservationModal.tsx`**
- Full reservation form in portal modal
- Fields: Date (date picker), Time (time picker in 15-min increments), Party Size (stepper), Guest Name, Phone, Email, Meal Period (auto from time, overridable), Seating Preference (chips), Occasion (dropdown), Special Requests (textarea), Internal Notes (textarea)
- Customer search: type-ahead input that calls customer search API after 2+ chars. On select, auto-fills name/phone/email and links customerId
- Table pre-assignment: optional "Assign Table" section showing suggestions from `useTableSuggestions`
- Conflict warning: if 3+ reservations already exist at this time, show amber warning
- Actions: "Save" (creates as booked) and "Save & Confirm" (creates + triggers confirmation SMS)

### Step 8: Design Details

All components use:
- `bg-surface` for card backgrounds (never `bg-white`)
- Opacity-based status colors per Convention §145
- `rounded-xl` (12px) for cards
- `p-3` (12px) padding on cards for density
- `text-sm` for values, `text-xs` for labels
- `gap-2` between elements within cards
- Touch targets ≥ 44px for all interactive elements
- `lucide-react` icons: `Users` (party), `Clock` (time), `Star` (VIP), `AlertTriangle` (allergy), `MapPin` (seating), `Phone` (contact)

### Step 9: Tests

Create `apps/web/src/components/host/__tests__/host-components.test.ts`:

**Component/hook tests (~15 tests):**
- HostTopBar renders live clock and stats
- WaitlistCardList renders entries in position order
- WaitlistCard shows correct wait-time color coding
- ReservationCardList groups by time slot
- ReservationCard shows correct action button per status
- ReservationCard shows "Late" badge when overdue
- AddWalkInModal validates phone format
- NewReservationModal auto-selects meal period from time
- useHostReservations filters by date and meal period
- useHostDashboard returns all metric fields
- Floor map view toggle switches between map and grid

Run: `pnpm test`

### Completion Criteria
- [ ] Types file with all host interfaces
- [ ] ~10 hooks (data + mutation)
- [ ] Code-split page entry
- [ ] Layout components (HostStandLayout, HostTopBar, HostLeftPanel)
- [ ] Card lists (WaitlistCardList, WaitlistCard, ReservationCardList, ReservationCard, PreShiftPanel)
- [ ] Floor map integration (HostFloorMap, HostGridView, TablePopover)
- [ ] Modals (AddWalkInModal, NewReservationModal)
- [ ] ~15 frontend tests passing

**When all tests pass, proceed to HOST-05.**

---

## SESSION HOST-05: Floor Map Interactions & Table Actions

### Objective
Build the drag-and-drop seating, table context menus, multi-room navigation, and interactive floor map features.

### Step 1: Drag-and-Drop Seating

Build `apps/web/src/components/host/DragSeatingController.tsx`:

Since we need to drag from HTML card list → Konva canvas, use an approach that works on iPad:

**Approach: "Select and Assign" (touch-friendly alternative to HTML5 drag):**
1. User taps a waitlist/reservation card → card enters "selected" state (blue highlight border, stays highlighted)
2. Floor map enters "assign mode" — available tables that fit the party size glow green with a pulsing border, tables too small show a subtle red indicator
3. User taps an available table on the floor map → `SeatConfirmDialog` appears
4. User confirms → seating action fires
5. Cancel: tap the selected card again, or tap "Cancel" in the assign mode banner

This approach is much better for iPad than HTML5 drag-and-drop which is unreliable on iOS.

**Implementation:**
- Zustand store slice or React context: `{ selectedPartyId: string | null, selectedPartyType: 'reservation' | 'waitlist' | null, assignMode: boolean }`
- When `assignMode` is true, `HostFloorMap` renders eligible tables with green glow overlay
- Banner at top of floor map: "Select a table for {guestName} (party of {size})" with Cancel button
- `SeatConfirmDialog`: shows party details + table details, confirm/cancel

Also support the traditional desktop drag if the device supports it (feature-detect `'draggable' in document.createElement('div')`).

### Step 2: Table Context Menu

Build `apps/web/src/components/host/TableContextMenu.tsx`:

Long-press on table (or right-click on desktop) shows a context menu:

```typescript
const TABLE_ACTIONS: Record<string, Array<{ label: string; icon: LucideIcon; action: string; variant?: string }>> = {
  available: [
    { label: 'Seat Walk-in', icon: UserPlus, action: 'seat_walkin' },
    { label: 'Assign Reservation', icon: CalendarCheck, action: 'assign_reservation' },
    { label: 'Combine Tables', icon: Combine, action: 'combine' },
    { label: 'Out of Service', icon: XCircle, action: 'oos', variant: 'destructive' },
  ],
  occupied: [
    { label: 'View Tab', icon: Receipt, action: 'view_tab' },
    { label: 'Mark Clearing', icon: Clock, action: 'mark_clearing' },
    { label: 'Transfer Server', icon: ArrowRightLeft, action: 'transfer' },
  ],
  payment_complete: [
    { label: 'Clear Table', icon: Check, action: 'clear' },
    { label: 'View Tab', icon: Receipt, action: 'view_tab' },
  ],
  reserved: [
    { label: 'View Reservation', icon: Calendar, action: 'view_reservation' },
    { label: 'Change Table', icon: ArrowRightLeft, action: 'change_table' },
  ],
  dirty: [
    { label: 'Mark Available', icon: Check, action: 'mark_available' },
    { label: 'Out of Service', icon: XCircle, action: 'oos' },
  ],
  out_of_service: [
    { label: 'Mark Available', icon: Check, action: 'mark_available' },
  ],
};
```

Position: floating near the long-pressed table, viewport-clamped. Uses portal.

### Step 3: Multi-Room Tabs

Build `apps/web/src/components/host/RoomTabBar.tsx`:

- Renders tab for each dining area/room at the location
- Each tab: room name + "{available}/{total}" count badge
- Active tab: bold + accent underline
- "All" tab: shows all rooms (floor map renders first room, others accessible by scrolling or switching)
- Data: from existing `useFnbRooms` hook or room layouts query

### Step 4: Floor Map Legend

Build `apps/web/src/components/host/FloorMapLegend.tsx`:

- Small collapsible panel in bottom-right corner of the floor map
- Status dot + label + count for each status
- Tap a status to filter/highlight only those tables
- Counts auto-update from `useTableStatus`

### Step 5: Seat Confirm Dialog

Build `apps/web/src/components/host/SeatConfirmDialog.tsx`:

- Portal modal shown when user assigns a party to a table
- Content:
  - Party info: name, size, source (reservation/waitlist), preferences
  - Table info: number, capacity, section, server
  - If from waitlist: shows actual wait time
  - If table is slightly oversized: "Note: seating party of 3 at 6-top"
- Actions: "Confirm & Seat" (primary green), "Cancel" (ghost)
- On confirm: calls `seatReservation` or `seatFromWaitlist` API, updates both card list and floor map optimistically

### Step 6: Table Status Animations

Add to `HostFloorMap.tsx`:

- **Available pulse**: HTML overlay div with CSS animation on matching table positions:
  ```css
  @keyframes host-available-pulse {
    0%, 100% { opacity: 0.3; transform: scale(1); }
    50% { opacity: 0.6; transform: scale(1.02); }
  }
  ```
- **Status change flash**: when a table changes status (detected via polling diff), briefly flash the table with a white overlay that fades out over 500ms
- **"About to turn" glow**: tables where elapsed > 80% of avg turn time get an amber border glow

### Step 7: Tests

**~12 tests:**
- Select-and-assign flow: select card → floor map enters assign mode → correct tables highlighted
- Table context menu shows correct actions per status
- SeatConfirmDialog renders party and table info
- Room tabs show correct counts
- Legend filter highlights correct tables
- Cancel assign mode deselects card

Run: `pnpm test`

### Completion Criteria
- [ ] Drag/select-and-assign seating system
- [ ] Table context menu with status-aware actions
- [ ] Multi-room tab navigation
- [ ] Floor map legend with filter
- [ ] Seat confirmation dialog
- [ ] Table status animations
- [ ] ~12 tests passing

**When all tests pass, proceed to HOST-06.**

---

## SESSION HOST-06: Guest Self-Service Page & Notification UX

### Objective
Build the public guest-facing waitlist status page and the host-side notification management interface.

### Step 1: Guest Waitlist Status Page

Create `apps/web/src/app/guest/waitlist/[token]/page.tsx`:

This is a PUBLIC page (no auth, no dashboard layout). Mobile-first design. **LIGHT MODE** — override the default dark mode by adding `className="light"` to the root element.

**Layout:**
- Centered card on gradient background
- Venue name at top (from tenant settings)
- Position indicator: large number with circle background, animated on change
- Wait estimate: text + progress bar (0% = just joined, 100% = ready)
- Party info: name, size, joined time
- "While You Wait" section: "View Menu" link (if configured)
- "Update Party Size" quick buttons
- "Leave Waitlist" text button at bottom (with confirmation)

**States:**
- `waiting`: default view with position + estimate
- `notified`: GREEN full-screen banner "YOUR TABLE IS READY!" with countdown timer (expiry minutes from settings), pulse animation, "Head to the host stand" instruction
- `seated`: "Enjoy your meal!" thank-you message
- `cancelled`/`left`: "Removed from waitlist" with option to rejoin
- `expired`: "Your spot expired" (if notified but didn't arrive in time)
- `loading`: skeleton
- `invalid_token`: "This link is no longer valid"

**Auto-refresh**: `setInterval` every 15 seconds. Pause when tab hidden (Page Visibility API). On status change to `notified`, increase poll to every 5s.

**Minimal bundle**: no Zustand, no heavy libraries. Just React + Tailwind. Use `apiFetch` pointed at the public API endpoint.

### Step 2: Guest Join Page

Create `apps/web/src/app/guest/waitlist/join/page.tsx`:

Accessible via QR code at the restaurant entrance. URL format: `/guest/waitlist/join?location={locationId}`.

**Form:**
- Venue name header
- "Current estimated wait: ~{minutes} min" (from public estimate endpoint)
- Name input
- Phone input (with country code prefix)
- Party size selector (tap buttons: 1, 2, 3, 4, 5, 6, 7, 8+, with 8+ showing a number input)
- Seating preference chips (optional): Indoor, Outdoor, Bar, Booth
- "Join Waitlist" button
- On success: redirect to status page `/guest/waitlist/{token}`

**Rate limiting**: The backend route already handles this. Frontend shows error message if rate limited.

### Step 3: Guest Layout

Create `apps/web/src/app/guest/layout.tsx`:

- No sidebar, no header, no auth
- Light mode forced
- Clean white background
- Max-width 480px centered
- Bottom padding for mobile safe area

### Step 4: Host Notification Center

Build `apps/web/src/components/host/NotificationCenter.tsx`:

Accessible from bell icon in `HostTopBar`. Shows as a slide-out panel (320px from right edge).

**Content:**
- Tab: "Sent" | "Incoming"
- **Sent tab**: List of recent notifications with:
  - Recipient name
  - Type badge (confirmation, reminder, table ready)
  - Status indicator: ✓ sent, ✓✓ delivered, ✗ failed
  - Timestamp
  - Failed items: "Retry" button
- **Incoming tab**: Guest SMS replies (if two-way SMS configured):
  - Guest name + phone
  - Message text
  - Auto-detected action: "CANCEL" → shows "Auto-cancelled" badge, "LATE" → shows "Running late" badge
  - Manual reply button (future — for now show "Reply via phone" with number)

### Step 5: Notification Composer

Build `apps/web/src/components/host/NotificationComposer.tsx`:

Triggered from reservation/waitlist card action buttons (e.g., "Notify" on waitlist).

- Shows pre-filled SMS template (from `renderTemplate`)
- Recipient phone number display
- Preview of the message
- Edit option (toggle to custom text)
- "Send SMS" button with loading state
- Success: green check + "Sent" toast
- Error: red alert + retry option
- If SMS not configured (no provider): show "SMS not configured — update in Settings" message with link to settings

### Step 6: Notification History on Cards

Enhance `ReservationCard.tsx` and `WaitlistCard.tsx`:
- In expanded view, show notification timeline:
  - Each notification: type icon + "Confirmation sent 2:30 PM ✓✓" or "Table ready sent 7:15 PM ✗ Failed"
  - Failed: inline retry button
- "Last notified: 3 min ago" badge on card header (if any notifications sent)

### Step 7: QR Code Display

Build `apps/web/src/components/host/QrCodeDisplay.tsx`:

Shows in host stand settings or as a printable overlay:
- Generates QR code image pointing to `/guest/waitlist/join?location={locationId}`
- Uses a lightweight QR library (`qrcode` npm package or inline SVG generator)
- Print button for posting at entrance
- Includes venue name text below QR code

### Step 8: Tests

**~12 tests:**
- Guest status page renders correct state for each waitlist status
- Guest status page auto-refreshes
- Guest join form validates required fields
- Guest join form submits and redirects to status page
- Notification composer renders correct template
- Notification center shows sent/incoming tabs
- QR code generates valid URL

Run: `pnpm test`

### Completion Criteria
- [ ] Guest waitlist status page (public, light mode, mobile-first)
- [ ] Guest waitlist join page (QR code entry)
- [ ] Guest layout (no auth, light mode)
- [ ] NotificationCenter slide-out panel
- [ ] NotificationComposer modal
- [ ] Notification history on reservation/waitlist cards
- [ ] QR code display component
- [ ] ~12 tests passing

**When all tests pass, proceed to HOST-07.**

---

## SESSION HOST-07: Analytics Dashboard & Enhanced Pre-Shift Report

### Objective
Build the host-specific analytics with charts and the enhanced pre-shift report.

### Step 1: Analytics Query

Create `packages/modules/fnb/src/queries/get-host-analytics.ts`:

Query that aggregates all analytics data in a single call. Uses the `fnbReservations`, `fnbWaitlistEntries`, `fnbTableTurnLog` tables.

```typescript
interface HostAnalyticsInput {
  tenantId: string;
  locationId: string;
  startDate: string;  // YYYY-MM-DD
  endDate: string;    // YYYY-MM-DD
  mealPeriod?: string;
}

interface HostAnalyticsResult {
  coversSummary: { actual: number; expected: number };
  waitTimeSummary: { avgQuotedMinutes: number; avgActualMinutes: number; accuracyPercent: number };
  turnTimeSummary: { totalTurns: number; avgMinutes: number; previousPeriodAvg: number };
  noShowSummary: { count: number; totalReservations: number; ratePercent: number };
  waitlistSummary: { totalAdded: number; totalSeated: number; conversionPercent: number };
  coversByHour: Array<{ hour: number; reservationCovers: number; walkInCovers: number }>;
  waitTimeScatter: Array<{ quotedMinutes: number; actualMinutes: number; partySize: number }>;
  turnTimeDistribution: Array<{ bucketLabel: string; count: number }>;
  noShowTrend: Array<{ date: string; count: number; movingAvg7d: number }>;
  peakHeatmap: Array<{ dayOfWeek: number; hour: number; covers: number }>;
}
```

Use raw SQL via `db.execute()` for the complex aggregations. Follow the `Array.from(result as Iterable<T>)` pattern for `db.execute()` results per Convention §2.

### Step 2: Analytics API Route

`GET /api/v1/fnb/host/analytics/route.ts` — permission: `fnb.host.analytics`

Query params: `startDate`, `endDate`, `mealPeriod` (optional).

### Step 3: Analytics Dashboard Component

Create `apps/web/src/components/host/HostAnalyticsDashboard.tsx`:

**Layout:**
- Full page or slide-in panel accessible from host stand settings
- Top: date range picker (quick selects: Today, Yesterday, Last 7 Days, Last 30 Days, Custom) + meal period filter
- KPI row: 5 cards in a flex row
- Charts: 2×2 grid below KPIs, + heatmap full-width at bottom

**KPI Cards** (`HostKpiCard.tsx`):
1. **Covers**: actual vs expected, with circular progress indicator
2. **Avg Wait Accuracy**: quoted vs actual, with ±delta indicator (green if within 5 min)
3. **Table Turns**: count with vs-previous-period arrow indicator
4. **No-Show Rate**: percentage with trend arrow
5. **Waitlist Conversion**: percentage with color indicator

Each card: `bg-surface`, `rounded-xl`, `p-4`, value in `text-2xl font-bold`, label in `text-xs text-gray-500`, delta/trend in small text with green/red color.

**Charts** (all using Recharts):

1. **CoversByHourChart.tsx** — `BarChart` with stacked bars (reservations blue, walk-ins teal). X-axis: hours. Y-axis: covers. Capacity line overlay if configured.

2. **WaitTimeAccuracyChart.tsx** — `ScatterChart`. X: quoted minutes, Y: actual minutes. 45° reference line (perfect accuracy). Dots colored by party size bucket. Tooltip: "Party of 4: Quoted 20m, Actual 25m".

3. **TurnTimeChart.tsx** — `BarChart` histogram. Buckets: 0-30m, 30-45m, 45-60m, 60-75m, 75-90m, 90m+. Color gradient from green (fast) to amber (slow).

4. **NoShowTrendChart.tsx** — `ComposedChart` with bars (daily count) + line (7-day moving average). Date x-axis.

5. **PeakHeatmap.tsx** — CSS Grid based heatmap (not Recharts). 7 rows (Mon-Sun) × 16 columns (6AM-10PM). Cell color intensity = covers. Tooltip on hover: "Tuesday 7PM: avg 42 covers".

### Step 4: Enhanced Pre-Shift Report

Enhance the existing `PreShiftPanel` from HOST-04:

Add `apps/web/src/components/host/PreShiftReportFull.tsx`:

This is a comprehensive version accessible via "Full Report" button on the PreShiftPanel.

**Sections:**
1. **Summary bar**: Total reservations, expected covers, VIP count, large party count — as horizontal stat cards
2. **Alerts** (`PreShiftAlerts.tsx`): Color-coded priority list
   - 🔴 HIGH: allergy alerts (from customer preferences where category = 'dietary'), large party needing table combination
   - 🟡 MEDIUM: special occasions (birthdays, anniversaries), first-time VIP guests
   - 🔵 INFO: general notes, seating preferences
3. **VIP Arrivals** (`VipArrivalsPanel.tsx`): For each VIP reservation:
   - Guest name, time, party size
   - Member since date, visit count, total spend
   - Preferred seating, usual order notes
   - Special instructions
4. **Tonight vs. Typical** comparison: % difference from average for this day-of-week + meal period. Staffing suggestion if significantly above average.
5. **Staff Assignments** (`StaffAssignmentsPanel.tsx`): Table grid by server section

**Print/Export**: "Print Report" button that opens browser print dialog with print-optimized CSS (`@media print` stylesheet).

### Step 5: Hook

Create `apps/web/src/hooks/use-host-analytics.ts`:

```typescript
export function useHostAnalytics(startDate: string, endDate: string, mealPeriod?: string)
export function usePreShiftReportFull(date: string, mealPeriod: string)
```

### Step 6: Tests

**~10 tests:**
- Analytics query returns all expected fields
- KPI cards render correct values
- Charts render without error with sample data
- Charts handle empty data gracefully
- Pre-shift report shows alerts sorted by severity
- Pre-shift VIP panel shows customer details
- Date range picker updates query params

Run: `pnpm test`

### Completion Criteria
- [ ] Analytics query with all aggregations
- [ ] Analytics API route
- [ ] Analytics dashboard with 5 KPIs + 5 charts
- [ ] Enhanced pre-shift report with alerts, VIPs, comparison
- [ ] Print-friendly CSS
- [ ] ~10 tests passing

**When all tests pass, proceed to HOST-08.**

---

## SESSION HOST-08: Settings, Integration Tests & Polish

### Objective
Final session — host module settings, comprehensive integration testing, event chain verification, UX polish, and documentation updates.

### Step 1: Host Settings Schema

Add to `packages/modules/fnb/src/services/host-settings.ts`:

```typescript
import { z } from 'zod';

export const hostSettingsSchema = z.object({
  reservations: z.object({
    slotMinutes: z.number().min(15).max(60).default(30),
    maxPartySize: z.number().min(1).max(99).default(20),
    advanceBookingDays: z.number().min(1).max(365).default(30),
    sameDayEnabled: z.boolean().default(true),
    requirePhone: z.boolean().default(false),
    defaultDurationMinutes: z.object({
      breakfast: z.number().default(45),
      brunch: z.number().default(60),
      lunch: z.number().default(60),
      dinner: z.number().default(90),
    }),
  }),
  waitlist: z.object({
    maxSize: z.number().min(1).max(200).default(50),
    noShowGraceMinutes: z.number().min(5).max(60).default(15),
    notifyExpiryMinutes: z.number().min(3).max(30).default(10),
    autoRemoveAfterExpiryMinutes: z.number().min(5).max(60).default(15),
  }),
  notifications: z.object({
    smsEnabled: z.boolean().default(false),
    autoConfirmation: z.boolean().default(false),
    autoReminder: z.boolean().default(false),
    reminderHoursBefore: z.number().min(1).max(48).default(4),
    smsFromNumber: z.string().nullable().default(null),
  }),
  estimation: z.object({
    enabled: z.boolean().default(true),
    defaultTurnMinutes: z.object({
      small: z.number().default(45),
      medium: z.number().default(60),
      large: z.number().default(75),
      xlarge: z.number().default(90),
    }),
  }),
  guestSelfService: z.object({
    waitlistEnabled: z.boolean().default(false),
    qrCodeEnabled: z.boolean().default(false),
    showMenuWhileWaiting: z.boolean().default(true),
  }),
  display: z.object({
    defaultView: z.enum(['map', 'grid']).default('map'),
    showElapsedTime: z.boolean().default(true),
    showServerOnTables: z.boolean().default(true),
    autoSelectMealPeriod: z.boolean().default(true),
    mealPeriodSchedule: z.object({
      breakfast: z.object({ start: z.string().default('06:00'), end: z.string().default('10:30') }),
      brunch: z.object({ start: z.string().default('10:00'), end: z.string().default('14:00') }),
      lunch: z.object({ start: z.string().default('11:00'), end: z.string().default('15:00') }),
      dinner: z.object({ start: z.string().default('17:00'), end: z.string().default('22:00') }),
    }),
  }),
});

export type HostSettings = z.infer<typeof hostSettingsSchema>;
export type HostSettingsInput = z.input<typeof hostSettingsSchema>;

export function getDefaultHostSettings(): HostSettings {
  return hostSettingsSchema.parse({});
}
```

Integrate with existing F&B settings storage. Store as JSONB in the existing `fnb_settings` table (or create a `fnb_host_settings` row if F&B settings uses a key-value pattern). Add API routes:
- `GET /api/v1/fnb/host/settings` — get host settings
- `PATCH /api/v1/fnb/host/settings` — update host settings

### Step 2: Settings UI

Create `apps/web/src/components/host/HostSettingsPanel.tsx`:

Add as a tab in the F&B settings page, or accessible via the gear icon on the host stand top bar.

**Sections (collapsible):**
1. **Reservations**: slot interval, max party, advance booking, duration defaults per meal
2. **Waitlist**: max size, grace period, expiry timers
3. **Notifications**: SMS toggle, auto-confirmation, auto-reminder, from-number input with "Test SMS" button
4. **Wait Estimation**: enable toggle, default turn time inputs per size bucket
5. **Guest Self-Service**: waitlist join enable, QR enable, menu while waiting
6. **Display**: default view, elapsed time on tables, server names, meal period schedule

Use existing OppsEra form patterns: `FormField` wrapper, toggle switches for booleans, number inputs with min/max constraints, time inputs for schedule.

### Step 3: Integration Test Suite

Create `apps/web/src/app/api/v1/fnb/host/__tests__/host-integration.test.ts`:

These tests verify the end-to-end event chains:

**Chain A: Full Reservation Lifecycle (~5 tests)**
```
createReservation → confirmReservation → checkInReservation → seatReservation → completeReservation
```
- Verify status transitions at each step
- Verify table status changes to 'occupied' on seat
- Verify turn log entry created on seat
- Verify turn log updated on complete
- Verify events emitted at each step

**Chain B: Waitlist to Seat (~4 tests)**
```
addToWaitlist → notifyWaitlistParty → seatFromWaitlist
```
- Verify position assigned correctly
- Verify guest token generated
- Verify notification record created on notify
- Verify actual wait time calculated on seat
- Verify table status updated

**Chain C: No-Show Handling (~3 tests)**
```
createReservation → (time passes) → markNoShow
```
- Verify no-show status set
- Verify table freed if was assigned
- Verify re-booking from no-show works

**Chain D: Cancellation (~3 tests)**
```
createReservation → seatReservation → cancelReservation (should fail — can't cancel seated)
createReservation → cancelReservation (from booked — succeeds, frees table)
```
- Verify invalid transitions rejected
- Verify cancellation reason stored
- Verify table freed

**Chain E: Estimation & Assignment (~3 tests)**
```
addToWaitlist → verify quotedWaitMinutes populated
suggestTables → verify scored results returned
seatFromWaitlist with suggested tableId → verify seating succeeds
```

**Edge cases (~4 tests):**
- Create reservation with duplicate clientRequestId returns idempotent result
- Update reservation with stale version returns 409
- Waitlist at max capacity returns error
- Public guest endpoint with invalid token returns 404

### Step 4: UX Polish Pass

Go through every component and apply these refinements:

**Micro-interactions:**
- Card hover: `transition-all duration-150 hover:-translate-y-px hover:shadow-md`
- Status badge: `transition-colors duration-300`
- Button press: `active:scale-[0.97] transition-transform`
- Toast: use existing `useToast` with appropriate variants
- Skeleton shimmer on all loading states (use pattern from existing `PageSkeleton`)

**Accessibility:**
- `aria-label` on all icon-only buttons
- Status badges: include icon alongside color (check for available, clock for occupied, x for OOS)
- `role="listbox"` on card lists, `role="option"` on cards
- Focus ring: `focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2`
- Screen reader: `aria-live="polite"` on stats that auto-update

**Performance:**
- Memoize table suggestions with `useMemo` keyed on partySize + preferences
- Debounce customer search in NewReservationModal (300ms)
- `useCallback` on all event handlers passed to child components
- Polling hooks: `document.hidden` check before fetching

**Edge cases:**
- SMS not configured: all notification buttons show tooltip "SMS not configured"
- No rooms configured: floor map shows "Set up your floor plan in Room Layouts" with link
- No reservations today: show encouraging empty state
- Timezone: display times in tenant timezone (use existing tenant timezone from settings)

### Step 5: CLAUDE.md Update

Add to CLAUDE.md under the appropriate section:

```markdown
- **Host Module V2** (Sessions HOST-01 through HOST-08):
  - **Schema**: 4 tables (fnb_reservations enhanced, fnb_waitlist_entries enhanced,
    fnb_table_turn_log, fnb_guest_notifications) in packages/db/src/schema/fnb.ts
  - **Migration**: [number from journal]
  - **Validation**: validation-host.ts with reservation state machine, Zod schemas
  - **15 commands**: createReservation, updateReservation, confirmReservation,
    checkInReservation, seatReservation, completeReservation, cancelReservation,
    markNoShow, addToWaitlist, updateWaitlistEntry, notifyWaitlistParty,
    seatFromWaitlist, removeFromWaitlist, recordTableTurn, sendGuestNotification
  - **12 queries**: listReservations, getReservation, getUpcomingReservations,
    listWaitlist, getWaitlistEntry, getWaitlistStats, getHostDashboardMetrics,
    getTableTurnStats, getPreShiftReport, getHostAnalytics, estimateWaitTime,
    suggestTables
  - **Services**: wait-time-estimator.ts (weighted algorithm), table-assigner.ts
    (4-factor scoring), notification-service.ts (Twilio + Console providers),
    notification-templates.ts, host-settings.ts
  - **~29 API routes** under /api/v1/fnb/host/
  - **3 public routes** under /api/v1/fnb/host/guest/ (waitlist status, join, update)
  - **Events**: 9 event types (reservation CRUD, waitlist lifecycle, table turns)
  - **2 consumers**: tab.closed → table status, table.turn_completed → turn log
  - **Frontend**: HostStandLayout (380px/1fr grid), HostTopBar (live clock, meal
    period pills, stats), HostLeftPanel (waitlist/reservation/pre-shift tabs),
    WaitlistCardList/Card, ReservationCardList/Card, PreShiftPanel, HostFloorMap
    (Konva viewer + status overlay), HostGridView, TablePopover, AddWalkInModal,
    NewReservationModal, DragSeatingController, TableContextMenu, RoomTabBar,
    FloorMapLegend, SeatConfirmDialog, HostAnalyticsDashboard (5 KPIs + 5 charts),
    PreShiftReportFull, NotificationCenter, NotificationComposer, GuestWaitlistPage,
    GuestWaitlistJoinPage, QrCodeDisplay, HostSettingsPanel
  - **Hooks**: useHostReservations, useHostWaitlist, useHostDashboard,
    useHostPreShift, useTableStatus (5s poll), useWaitTimeEstimate,
    useTableSuggestions, useReservationActions, useWaitlistActions,
    useNotificationActions, useHostAnalytics, usePreShiftReportFull
  - **Permissions**: fnb.host.view, fnb.host.manage, fnb.host.notifications,
    fnb.host.analytics
  - **Settings**: 25+ configurable options (reservations, waitlist, notifications,
    estimation, guest self-service, display)
  - **~120 tests** across backend commands, queries, API contracts, frontend
    components, integration flows
```

### Step 6: CONVENTIONS.md Update

Add Convention §150:

```markdown
## 150. Host Module V2 Patterns

### Reservation State Machine
Use `validateReservationTransition(currentStatus, targetStatus)` from
`validation-host.ts` before any status change. Throws `ValidationError`
on invalid transition. Valid transitions defined in `RESERVATION_TRANSITIONS`.

### Wait-Time Estimation
Always call `estimateWaitTime()` when adding to waitlist. Store the quote
on the entry for accuracy tracking. Estimator uses 28-day rolling window
of turn times with fallback defaults.

### Table Assignment
`suggestTables()` returns top 3 scored suggestions. Always present to host
for confirmation — never auto-assign. Scoring: capacity fit (40%), preference
match (25%), server balance (20%), VIP/history (15%).

### Guest Notifications
SMS via fire-and-forget `sendGuestNotification()`. Record created synchronously,
dispatch async. Delivery tracked via provider webhook. Templates in
`notification-templates.ts` with `{variable}` interpolation.

### Guest Self-Service Pages
Public pages under `/guest/` force light mode, use minimal JS, 15s auto-poll.
Rate-limited to 10 req/min per IP. Guest tokens are 8-char alphanumeric.
```

### Step 7: Final Verification

Run the complete test suite:
```bash
pnpm test
pnpm type-check
pnpm lint
```

Fix any issues found. Verify:
- [ ] All tests pass
- [ ] No TypeScript errors
- [ ] No lint errors
- [ ] CLAUDE.md updated
- [ ] CONVENTIONS.md updated
- [ ] Migration file correct and journal updated

### Completion Criteria
- [ ] Host settings schema, storage, API routes, and UI
- [ ] ~22 integration tests passing
- [ ] UX polish applied across all components
- [ ] Accessibility audit items complete
- [ ] CLAUDE.md fully updated with Host V2 summary
- [ ] CONVENTIONS.md §150 added
- [ ] Full test suite green: `pnpm test && pnpm type-check && pnpm lint`

---

## Post-Completion Verification

After all 8 sessions are complete, verify the full deliverable:

**Backend:**
- [ ] 4 schema tables with RLS
- [ ] 1 migration + journal entry
- [ ] 15 commands
- [ ] 12+ queries
- [ ] 2 services (estimator, assigner)
- [ ] 1 notification service + templates
- [ ] ~29 authenticated API routes + 3 public routes
- [ ] 9 event types + 2 consumers
- [ ] Settings schema + API

**Frontend:**
- [ ] Code-split host stand page
- [ ] ~25 components
- [ ] ~12 hooks
- [ ] Guest self-service pages (public)
- [ ] Analytics dashboard with 5 charts
- [ ] Settings panel

**Quality:**
- [ ] ~120 tests total
- [ ] TypeScript strict mode clean
- [ ] Lint clean
- [ ] Dark mode (opacity-based colors throughout)
- [ ] iPad touch targets ≥ 44px
- [ ] Accessibility labels on all interactive elements
