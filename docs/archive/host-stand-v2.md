# Host Stand V2 — Roadmap & Feature Plan

## V1 (Current — Built)

### Schema (Migration 0194)
- `fnb_waitlist_entries` — waitlist queue with position, priority, VIP, elapsed time
- `fnb_reservations` — future bookings with date/time, duration, occasion, table assignment
- `fnb_host_settings` — per-location host configuration
- `fnb_wait_time_history` — historical data for wait time estimation algorithm

### Backend (10 commands, 6 queries)
- **Waitlist**: add, update, seat, remove, notify
- **Reservations**: create, update, cancel, no-show, check-in
- **Settings**: update host settings (upsert)
- **Queries**: dashboard (6 parallel queries), wait time estimate (historical + heuristic), table availability (scoring algorithm), host settings, waitlist list, reservations list

### Frontend
- Split-panel layout: Waitlist (left) + Reservations/Rotation (right)
- Stats bar with real-time KPIs (covers, waiting, avg wait, table status)
- Add Guest dialog with wait time estimate
- New Reservation dialog with date/time/occasion
- Seat Guest dialog with intelligent table suggestions (fit scoring)
- Server rotation queue with advance button

### API Routes (~13 routes under `/api/v1/fnb/host/`)
- Dashboard, waitlist CRUD, seat/notify actions
- Reservations CRUD, check-in/cancel/no-show actions
- Wait estimate, table availability, settings

---

## V2 Features (Future)

### 1. SMS Notifications (High Priority)
**Schema already provisioned**: `notification_count`, `last_notification_method` columns on `fnb_waitlist_entries`. `sms_provider`, `sms_from_number`, `sms_notify_template`, `sms_confirm_template` on `fnb_host_settings`.

**Implementation**:
- Integrate with Twilio or MessageBird SMS gateway
- `packages/modules/fnb/src/helpers/sms-gateway.ts` — provider abstraction
- Auto-notify when table ready (configurable template with `{guestName}`, `{partySize}`, `{tableLabel}`)
- Confirmation SMS when reservation created
- Two-way SMS: guest can reply "CANCEL" or "LATE X MIN"
- Notification preferences: SMS, in-app push, both
- SMS delivery tracking (sent, delivered, failed, replied)
- Rate limiting per phone number (prevent spam)

**Estimated tables**: None new — uses existing `fnb_host_settings` columns + `fnb_waitlist_entries.notification_count`

### 2. Online Waitlist & Reservations (High Priority)
**Schema already provisioned**: `enable_online_waitlist`, `enable_online_reservations` on `fnb_host_settings`. `source` column on entries supports `'online'`, `'google'`, `'opentable'`.

**Implementation**:
- Public-facing guest page: `/(guest)/waitlist/[tenantSlug]/` — no auth required
- Guest enters name, phone, party size → added to waitlist with `source: 'online'`
- Real-time position updates via polling (or SSE in V3)
- Public reservation page: `/(guest)/reserve/[tenantSlug]/`
- Time slot availability API based on table capacity + existing bookings
- Google Reserve integration (structured data for Google Maps "Reserve a table")
- Configurable booking window: `maxAdvanceBookingDays` (already in schema)
- Configurable slot intervals: `reservationSlotIntervalMinutes` (already in schema)
- Embed widget (iframe) for restaurant websites

### 3. Third-Party Integration (Medium Priority)
**Schema already provisioned**: `external_booking_id`, `channel` columns on `fnb_reservations`.

**Implementation**:
- OpenTable webhook receiver (new reservation → create in our system)
- Resy API sync (bidirectional availability + reservation)
- SevenRooms connector for enterprise restaurants
- Yelp Waitlist integration
- `fnb_reservation_channels` table — track which channels are connected
- Conflict resolution: when same slot booked on multiple channels
- Availability push: when table booked internally → update external channels
- Channel-specific confirmation templates

### 4. Guest Profiles & History (Medium Priority)
**Implementation**:
- Link waitlist/reservation entries to `customers` table via `customerId`
- Guest history panel in host stand: past visits, preferences, allergies, VIP notes
- Auto-populate known guest details from customer lookup
- Visit frequency tracking (first-time vs regular vs VIP)
- Guest preferences: preferred table, server, seating area
- Allergy/dietary alerts visible to host on check-in
- Guest communication history (past SMS, notes from previous visits)
- Birthday/anniversary reminders from customer profile

### 5. Deposits & Cancellation Policies (Medium Priority)
**Schema already provisioned**: `deposit_amount_cents`, `deposit_status` columns on `fnb_reservations`.

**Implementation**:
- Configurable deposit requirements (by party size, time slot, special events)
- Credit card hold via payment gateway (CardPointe integration exists)
- Auto-charge no-show fee after `noShowWindowMinutes`
- Cancellation policy engine: full refund > 24h, 50% < 24h, no refund < 2h
- `fnb_reservation_deposits` table — track deposit lifecycle
- Deposit refund on cancellation (auto or manual approval)
- Deposit applied to bill on check-in

### 6. Wait Time Intelligence (Low Priority — Enhancement)
**Implementation**:
- Machine learning model for wait time prediction (replace heuristic)
- Factors: party size, day of week, time of day, weather, events, reservation density
- Auto-quote: suggest wait time to host (currently manual quote)
- Guest-facing wait time display on online waitlist page
- Historical accuracy tracking: quoted vs actual wait times
- Seasonal/event adjustments
- Table turnover prediction based on current tab progress

### 7. Floor Plan Integration (Low Priority)
**Implementation**:
- Visual table assignment in Seat Guest dialog (Konva mini-canvas)
- Color-coded tables by status in host stand view
- Drag-and-drop table assignment from waitlist
- Section-aware seating (honor section assignments)
- Table combination support for large parties
- Real-time table status updates visible to host

### 8. Waitlist Management Enhancements (Low Priority)
**Implementation**:
- Drag-to-reorder waitlist (position override)
- Priority levels: normal, VIP, management override
- Party merge: combine two small parties at a shared table
- Estimated arrival tracking for call-ahead parties
- Queue analytics: average wait by party size, peak hours, no-show rate
- Waitlist capacity limits (configurable max queue length)
- Auto-clear stale entries after `staleClearMinutes`

---

## Migration Plan

### V2 Phase 1 (SMS + Online)
New migration needed:
```sql
-- No new tables needed — V1 migration already provisioned the columns
-- May need: fnb_sms_delivery_log for tracking
CREATE TABLE IF NOT EXISTS fnb_sms_delivery_log (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL,
  entry_type TEXT NOT NULL, -- 'waitlist' | 'reservation'
  entry_id TEXT NOT NULL,
  phone_number TEXT NOT NULL,
  message_type TEXT NOT NULL, -- 'notify' | 'confirm' | 'reminder' | 'cancel'
  provider TEXT NOT NULL, -- 'twilio' | 'messagebird'
  provider_message_id TEXT,
  status TEXT NOT NULL DEFAULT 'queued', -- queued, sent, delivered, failed, replied
  reply_text TEXT,
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### V2 Phase 2 (Integrations + Deposits)
New tables:
```sql
CREATE TABLE IF NOT EXISTS fnb_reservation_channels (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL,
  location_id TEXT NOT NULL,
  channel TEXT NOT NULL, -- 'opentable', 'resy', 'sevenrooms', 'yelp', 'google'
  is_active BOOLEAN NOT NULL DEFAULT true,
  config JSONB NOT NULL DEFAULT '{}',
  last_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fnb_reservation_deposits (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL,
  reservation_id TEXT NOT NULL REFERENCES fnb_reservations(id),
  amount_cents INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, authorized, captured, refunded, forfeited
  payment_intent_id TEXT,
  authorized_at TIMESTAMPTZ,
  captured_at TIMESTAMPTZ,
  refunded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

## Competitive Benchmarks

### Toast Tables
- Real-time table status with floor plan view
- Server rotation with automatic next-up
- Mobile host app (standalone tablet app)
- Google Reserve integration
- Online reservations with deposit support
- Two-way SMS notifications
- Waitlist with estimated wait times
- VIP tagging + guest profiles
- Table turn time tracking

### Lightspeed Restaurant
- Digital floor layout with multi-floor support
- Real-time table status (available/seated/dirty)
- Reservation integration (auto-creates order on seat)
- Online waitlist + SMS notifications
- Multi-channel reservations (OpenTable, Resy, SevenRooms)
- Guest history and preferences
- Revenue-per-table analytics

### Our V1 Parity
- [x] Real-time table status (via dashboard query)
- [x] Server rotation (round_robin, cover_balance, manual)
- [x] VIP tagging + priority queuing
- [x] Waitlist with position management
- [x] Wait time estimation (historical + heuristic)
- [x] Reservation management (create/check-in/cancel/no-show)
- [x] Table suggestion scoring (capacity + preference + rotation)
- [x] Guest occasion tracking (birthday, anniversary, etc)
- [ ] SMS notifications (V2 — columns provisioned)
- [ ] Online waitlist/reservations (V2 — columns provisioned)
- [ ] Third-party integrations (V2 — columns provisioned)
- [ ] Deposit/cancellation policies (V2 — columns provisioned)
- [ ] Guest profile deep integration (V2)
- [ ] Mobile host app (V3 — responsive web first)
- [ ] Floor plan visual seating (V2 — Konva mini-canvas)
