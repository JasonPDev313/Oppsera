# OppsEra PMS Module — Calendar Interaction Spec (v1 Core)

> This document defines the **UX + interaction contract** for the calendar-first PMS “Command Center”.
> It is intended to be directly implementable by an AI coding agent without ambiguity.

---

## 1. Calendar Concepts

### 1.1 Views (v1)
- **Week View** (primary)
- **Day View** (secondary)
- (Month view is v2)

### 1.2 Grid model
Rows:
- Rooms (one row per `roomId`), grouped optionally by room type

Columns:
- Dates (local property dates)

Cell:
- One cell per room per date

### 1.3 Reservation chip
A reservation is rendered as a **chip** spanning from `checkInDate` to `checkOutDate` (exclusive).
- The chip occupies:
  - checkInDate cell → up to the day before checkOutDate
- Visual:
  - left edge indicates arrival
  - right edge indicates departure
  - status badge and guest label

---

## 2. Performance Requirements

- Week view fetch must be a **single request**:
  - `GET /api/pms/calendar/week?start=YYYY-MM-DD`
- Target:
  - server response < 300ms for typical properties (<=200 rooms)
- Rendering:
  - virtualize rows if room count > 50
- Drag interactions:
  - UI updates optimistically within 16ms (1 frame)
  - server validation async; reconcile on error

---

## 3. Interaction Rules

## 3.1 Create reservation (quick create)
Methods:
1) Click an empty cell → opens “New Reservation” drawer with that date preselected
2) Click-drag across empty cells (same room) → selects date range → opens drawer

Constraints:
- Cannot create across `OUT_OF_ORDER` dates (if room is OOO that day)
- Must select at least 1 night (endDate > startDate)

---

## 3.2 Drag to move reservation (room and/or dates)

### Gesture
- Drag reservation chip from its current position to target cell.

### Operation semantics
A move can change:
- roomId (row change)
- checkInDate/checkOutDate (date shift)
Duration stays the same unless combined with resize.

### Validation constraints
Hard blocks:
- Overlaps with existing room blocks/reservations
- Target room is OUT_OF_ORDER for any date in range
- Reservation status is CANCELLED/NO_SHOW/CHECKED_OUT (non-movable)
Soft blocks (prompt):
- Moving a CHECKED_IN reservation (require confirmation)
- Moving across a housekeeping “inspection pending” flag (optional)

### Confirmation/Undo
- Default: apply optimistically, show toast:
  - “Reservation moved. Undo”
- If moving CHECKED_IN:
  - show confirm modal: “Move checked-in guest to room X?”
  - only apply after confirm

### Server call
`POST /api/pms/calendar/move`
Payload:
- `reservationId`
- `from`: { roomId, checkInDate, checkOutDate, version }
- `to`: { roomId, checkInDate }
- `idempotencyKey`

Response:
- updated reservation (new version)
- any reconciliation fields (e.g., roomId assignment changes)
Errors:
- `ROOM_ALREADY_BOOKED`
- `ROOM_OUT_OF_ORDER`
- `INVALID_STATUS_TRANSITION`
- `CONCURRENCY_CONFLICT`

---

## 3.3 Resize reservation (extend/shorten stay)

### Gesture
- Drag left edge (arrival) or right edge (departure)

### Rules
- Left resize adjusts checkInDate
- Right resize adjusts checkOutDate (exclusive)
- Cannot resize below 1 night
- Cannot resize if reservation is CANCELLED/NO_SHOW/CHECKED_OUT
- For CHECKED_IN:
  - allow extending only (shortening requires manager override in v2; in v1 block)

### Confirmation/Undo
- Apply optimistically with undo toast
- If extension crosses into blocked dates, reject with error tooltip and revert

### Server call
`POST /api/pms/calendar/resize`
Payload:
- `reservationId`
- `edge`: `LEFT` | `RIGHT`
- `from`: { checkInDate, checkOutDate, roomId, version }
- `to`: { checkInDate?, checkOutDate? } (only changed side)
- `idempotencyKey`

---

## 3.4 Split stay (v1 optional; v2 recommended)
If v1 includes it:
- Action: “Split stay” in reservation menu
- Creates:
  - Reservation A: original checkIn → splitDate
  - Reservation B: splitDate → original checkOut
- Room assignment may differ between A and B

If not in v1:
- Spec must explicitly block and defer.

---

## 4. Visual Language & Status Indicators

### 4.1 Color keys
Reservation chip color is derived from:
- status (primary)
- sourceType (secondary tint)
- payment flag (icon only; do not block v1)

### 4.2 Badges
- HOLD: “Hold”
- CONFIRMED: none (clean)
- CHECKED_IN: “In-house”
- CHECKED_OUT: “Departed”
- CANCELLED: “Cancelled” (greyed out; non-interactive)
- NO_SHOW: “No show” (greyed out; non-interactive)

### 4.3 Tooltips / hover
Hover shows:
- guest name
- dates
- room
- status
- balance indicator (optional)

---

## 5. Right-Click / Overflow Menu Actions

On reservation chip:
- Open reservation
- Check-in (if eligible)
- Check-out (if eligible)
- Cancel
- Mark no-show
- Move to another room (opens picker)
- Add internal note
- View audit trail

On room row:
- Set out-of-order
- Clear out-of-order
- Set housekeeping status: clean/dirty/inspected

---

## 6. Keyboard Shortcuts (v1 recommended)
- `N` = new reservation
- `/` = search guest/reservation
- `Esc` = close drawer
- Arrow keys navigate cells (optional)

---

## 7. Conflict Handling UX

### 7.1 Inline rejection
If drop is invalid:
- chip snaps back
- show tooltip near cursor:
  - “Room already booked for Feb 12–Feb 14”

### 7.2 Alternative suggestions (v2)
- “Try Room 204” suggestion list

---

## 8. Acceptance Criteria (minimum)

1. Week view loads with a single request and renders without blocking input.
2. Dragging a CONFIRMED reservation to an available slot updates UI immediately and persists after server confirms.
3. Dragging into an occupied range is rejected with `ROOM_ALREADY_BOOKED` and UI reverts.
4. Dragging into OUT_OF_ORDER dates is rejected with `ROOM_OUT_OF_ORDER`.
5. Resizing to zero nights is blocked client-side.
6. Resizing across a conflict is rejected and UI reverts with clear message.
7. CANCELLED/NO_SHOW/CHECKED_OUT reservations are not draggable or resizable.
8. CHECKED_IN moves require confirmation; without confirm no change occurs.
9. Undo restores the reservation to its prior room/dates and persists via server call.
10. Concurrency: if reservation version is stale, server returns `CONCURRENCY_CONFLICT` and UI refreshes reservation state.
11. All successful moves/resizes create audit log entries visible in reservation detail.
12. Calendar reflects changes within 1 second across clients (polling or websocket v2; v1 can refresh on action).

---

## 9. Data Contract for Week View

Request:
`GET /api/pms/calendar/week?start=YYYY-MM-DD`

Response:
- `startDate`, `endDate`
- `rooms`: [{roomId, roomNumber, roomTypeId, status, isOutOfOrder}]
- `segments`: [{roomId, businessDate, reservationId, status, guestName, checkInDate, checkOutDate, colorKey}]
- `meta`: counts, lastUpdatedAt

---

## 10. Notes for Engineering
- Use a read model (`rm_pms_calendar_segments`) as the primary query source.
- On reservation mutation, update OLTP then enqueue event; projector updates read model.
- UI can optimistically patch the local read model and reconcile later.

---
