# OppsEra PMS Module — Postgres Schema Starter (v1 Core + v2 Provisioning)

> This is a **starter schema** for a calendar-first PMS module. It prioritizes:
> - correctness (no overlaps)
> - speed (calendar read models)
> - auditability
> - multi-tenant readiness

Assumptions:
- Postgres
- `gen_ulid()` exists (or replace with your ID generator)
- All timestamps are `timestamptz` in UTC; property timezones stored per property
- Dates for stays use **local date** semantics (`date`)

---

## 0. Enums (suggested)
Use enums or lookup tables depending on OppsEra conventions.

### Reservation status
- HOLD
- CONFIRMED
- CHECKED_IN
- CHECKED_OUT
- CANCELLED
- NO_SHOW

### Room status
- VACANT_CLEAN
- VACANT_DIRTY
- OCCUPIED
- OUT_OF_ORDER

### Reservation source (v2-ready)
- DIRECT
- PHONE
- WALKIN
- BOOKING_ENGINE
- OTA

---

## 1. Properties (v1 can be single property; schema supports multi)

### Table: `pms_properties`
| Column | Type | Constraints |
|---|---|---|
| id | text | PK, default `gen_ulid()` |
| tenantId | text | NOT NULL |
| name | text | NOT NULL |
| timezone | text | NOT NULL (IANA tz) |
| currency | text | NOT NULL default 'USD' |
| addressJson | jsonb | NULL |
| isActive | boolean | NOT NULL default true |
| createdAt | timestamptz | NOT NULL default now() |
| createdBy | text | NOT NULL |
| updatedAt | timestamptz | NOT NULL default now() |
| updatedBy | text | NOT NULL |

Indexes:
- `(tenantId, isActive)`
- `(tenantId, name)`

---

## 2. Room Types + Rooms

### Table: `pms_room_types`
| Column | Type | Constraints |
|---|---|---|
| id | text | PK |
| tenantId | text | NOT NULL |
| propertyId | text | NOT NULL FK → pms_properties(id) |
| code | text | NOT NULL (unique within property) |
| name | text | NOT NULL |
| description | text | NULL |
| maxAdults | int | NOT NULL default 2 |
| maxChildren | int | NOT NULL default 0 |
| maxOccupancy | int | NOT NULL default 2 |
| bedsJson | jsonb | NULL (e.g., [{"type":"queen","count":1}]) |
| amenitiesJson | jsonb | NULL |
| isActive | boolean | NOT NULL default true |
| createdAt/By, updatedAt/By | ... | |

Constraints:
- Unique: `(tenantId, propertyId, code)`

Indexes:
- `(tenantId, propertyId, isActive)`

### Table: `pms_rooms`
| Column | Type | Constraints |
|---|---|---|
| id | text | PK |
| tenantId | text | NOT NULL |
| propertyId | text | NOT NULL FK |
| roomTypeId | text | NOT NULL FK → pms_room_types(id) |
| roomNumber | text | NOT NULL |
| floor | text | NULL |
| name | text | NULL (optional friendly name) |
| status | text | NOT NULL (room status enum) |
| isOutOfOrder | boolean | NOT NULL default false |
| outOfOrderReason | text | NULL |
| featuresJson | jsonb | NULL |
| isActive | boolean | NOT NULL default true |
| createdAt/By, updatedAt/By | ... | |

Constraints:
- Unique: `(tenantId, propertyId, roomNumber)`
- Optional: ensure `isOutOfOrder` aligns with status = OUT_OF_ORDER via app logic

Indexes:
- `(tenantId, propertyId, roomTypeId)`
- `(tenantId, propertyId, status)`

---

## 3. Rates (minimal v1)

### Table: `pms_rate_plans`
| Column | Type | Constraints |
|---|---|---|
| id | text | PK |
| tenantId | text | NOT NULL |
| propertyId | text | NOT NULL |
| code | text | NOT NULL |
| name | text | NOT NULL |
| description | text | NULL |
| currency | text | NOT NULL |
| isDefault | boolean | NOT NULL default false |
| isActive | boolean | NOT NULL default true |
| createdAt/By, updatedAt/By | ... | |

Constraints:
- Unique: `(tenantId, propertyId, code)`
- At most one default per property (enforce in app or partial unique index)

### Table: `pms_rate_plan_prices` (v1 simple nightly base)
| Column | Type | Constraints |
|---|---|---|
| id | text | PK |
| tenantId | text | NOT NULL |
| propertyId | text | NOT NULL |
| ratePlanId | text | NOT NULL |
| roomTypeId | text | NOT NULL |
| startDate | date | NOT NULL |
| endDate | date | NOT NULL (exclusive) |
| nightlyBaseCents | int | NOT NULL |
| createdAt/By, updatedAt/By | ... | |

Constraints:
- Unique: `(tenantId, ratePlanId, roomTypeId, startDate, endDate)` (or allow overlaps and pick latest via precedence rules)

Indexes:
- `(tenantId, propertyId, ratePlanId, roomTypeId, startDate)`

---

## 4. Guests (v1 lightweight CRM)

### Table: `pms_guests`
| Column | Type | Constraints |
|---|---|---|
| id | text | PK |
| tenantId | text | NOT NULL |
| propertyId | text | NOT NULL |
| firstName | text | NOT NULL |
| lastName | text | NOT NULL |
| email | text | NULL |
| phone | text | NULL |
| notes | text | NULL |
| preferencesJson | jsonb | NULL |
| createdAt/By, updatedAt/By | ... | |

Indexes:
- `(tenantId, propertyId, lastName, firstName)`
- `(tenantId, propertyId, email)` (btree, nullable)
- `(tenantId, propertyId, phone)` (btree, nullable)

---

## 5. Reservations (source of truth)

### Table: `pms_reservations`
| Column | Type | Constraints |
|---|---|---|
| id | text | PK |
| tenantId | text | NOT NULL |
| propertyId | text | NOT NULL |
| guestId | text | NULL FK → pms_guests(id) |
| primaryGuestJson | jsonb | NOT NULL (snapshot for portability) |
| status | text | NOT NULL |
| checkInDate | date | NOT NULL |
| checkOutDate | date | NOT NULL (exclusive) |
| adults | int | NOT NULL default 2 |
| children | int | NOT NULL default 0 |
| roomTypeId | text | NOT NULL |
| roomId | text | NULL (assigned room; can be null until assigned) |
| ratePlanId | text | NOT NULL |
| nightlyRateCents | int | NOT NULL (v1 fixed at booking time) |
| subtotalCents | int | NOT NULL |
| taxCents | int | NOT NULL default 0 |
| feeCents | int | NOT NULL default 0 |
| totalCents | int | NOT NULL |
| sourceType | text | NOT NULL default 'DIRECT' |
| sourceRef | text | NULL (v2: channel booking ID) |
| internalNotes | text | NULL |
| guestNotes | text | NULL |
| version | int | NOT NULL default 1 |
| createdAt/By, updatedAt/By | ... | |

Key constraints:
- `checkOutDate > checkInDate`
- Occupancy: `adults + children <= roomType.maxOccupancy` (app-level)
- Room overlap prevention: see next section

Indexes:
- `(tenantId, propertyId, status)`
- `(tenantId, propertyId, checkInDate)`
- `(tenantId, propertyId, roomId, checkInDate, checkOutDate)`
- `(tenantId, propertyId, roomTypeId, checkInDate, checkOutDate)`
- `(tenantId, propertyId, guestId, createdAt)`

### Preventing overlaps (recommended)
If you’re comfortable with Postgres exclusion constraints:

1) Enable extension:
- `btree_gist`

2) Add generated daterange (or store as daterange):
- `stayRange daterange GENERATED ALWAYS AS (daterange(checkInDate, checkOutDate, '[)')) STORED`

3) Exclusion constraint (only when roomId is not null and reservation is active-ish):
- Exclude overlaps on `(roomId, stayRange)` for statuses in HOLD/CONFIRMED/CHECKED_IN.

If partial exclusion by status is hard, alternative:
- Keep a separate table `pms_room_blocks` (next section) as the overlap-enforced table.

---

## 6. Room Blocks (recommended for clean overlap + housekeeping holds)
This is the “truth” table for room occupancy & blocks.

### Table: `pms_room_blocks`
| Column | Type | Constraints |
|---|---|---|
| id | text | PK |
| tenantId | text | NOT NULL |
| propertyId | text | NOT NULL |
| roomId | text | NOT NULL |
| startDate | date | NOT NULL |
| endDate | date | NOT NULL (exclusive) |
| blockType | text | NOT NULL (RESERVATION, MAINTENANCE, HOUSE_USE, HOLD) |
| reservationId | text | NULL FK → pms_reservations(id) |
| reason | text | NULL |
| createdAt/By | ... | |

Constraints:
- `endDate > startDate`
- Exclusion constraint to prevent overlaps:
  - `(roomId WITH =, daterange(startDate, endDate, '[)') WITH &&)`

Indexes:
- `(tenantId, propertyId, roomId, startDate)`
- `(tenantId, propertyId, blockType)`

Write rules:
- Reservation assignment/move/resize updates blocks in the same transaction.

---

## 7. Housekeeping

### Table: `pms_room_status_log`
| Column | Type | Constraints |
|---|---|---|
| id | text | PK |
| tenantId | text | NOT NULL |
| propertyId | text | NOT NULL |
| roomId | text | NOT NULL |
| businessDate | date | NOT NULL |
| fromStatus | text | NOT NULL |
| toStatus | text | NOT NULL |
| note | text | NULL |
| createdAt | timestamptz | NOT NULL default now() |
| createdBy | text | NOT NULL |

Indexes:
- `(tenantId, propertyId, businessDate)`
- `(tenantId, propertyId, roomId, businessDate)`

---

## 8. Folios (minimal v1)

### Table: `pms_folios`
| Column | Type | Constraints |
|---|---|---|
| id | text | PK |
| tenantId | text | NOT NULL |
| propertyId | text | NOT NULL |
| reservationId | text | NOT NULL FK |
| status | text | NOT NULL (OPEN, CLOSED) |
| currency | text | NOT NULL |
| subtotalCents | int | NOT NULL default 0 |
| taxCents | int | NOT NULL default 0 |
| feeCents | int | NOT NULL default 0 |
| totalCents | int | NOT NULL default 0 |
| createdAt/By, updatedAt/By | ... | |

Indexes:
- `(tenantId, propertyId, reservationId)`
- `(tenantId, propertyId, status)`

### Table: `pms_folio_entries` (ledger style)
| Column | Type | Constraints |
|---|---|---|
| id | text | PK |
| tenantId | text | NOT NULL |
| propertyId | text | NOT NULL |
| folioId | text | NOT NULL |
| entryType | text | NOT NULL (ROOM_CHARGE, TAX, FEE, ADJUSTMENT, PAYMENT, REFUND) |
| description | text | NOT NULL |
| amountCents | int | NOT NULL (positive = charge, negative = credit) |
| postedAt | timestamptz | NOT NULL default now() |
| postedBy | text | NOT NULL |
| sourceRef | text | NULL (v2: payment intent id, etc.) |

Indexes:
- `(tenantId, propertyId, folioId, postedAt)`
- `(tenantId, propertyId, entryType, postedAt)`

---

## 9. Audit + Idempotency + Outbox

### Table: `pms_audit_log`
| Column | Type | Constraints |
|---|---|---|
| id | text | PK |
| tenantId | text | NOT NULL |
| actorUserId | text | NOT NULL |
| entityType | text | NOT NULL (RESERVATION, ROOM, FOLIO, RATE_PLAN, etc.) |
| entityId | text | NOT NULL |
| action | text | NOT NULL |
| diffJson | jsonb | NOT NULL |
| occurredAt | timestamptz | NOT NULL default now() |
| correlationId | text | NULL |

Indexes:
- `(tenantId, entityType, entityId, occurredAt)`
- `(tenantId, actorUserId, occurredAt)`

### Table: `pms_idempotency_keys`
| Column | Type | Constraints |
|---|---|---|
| id | text | PK |
| tenantId | text | NOT NULL |
| key | text | NOT NULL |
| requestHash | text | NOT NULL |
| responseJson | jsonb | NOT NULL |
| createdAt | timestamptz | NOT NULL default now() |
| expiresAt | timestamptz | NOT NULL |

Constraint:
- Unique `(tenantId, key)`

### Table: `pms_outbox`
| Column | Type | Constraints |
|---|---|---|
| id | text | PK |
| tenantId | text | NOT NULL |
| eventType | text | NOT NULL |
| payloadJson | jsonb | NOT NULL |
| occurredAt | timestamptz | NOT NULL default now() |
| processedAt | timestamptz | NULL |
| attempts | int | NOT NULL default 0 |

Indexes:
- `(processedAt, occurredAt)`

---

## 10. Calendar Read Models (fast rendering)

### Table: `rm_pms_calendar_segments`
> One row per reservation-room-day segment for quick calendar grid fetch.

| Column | Type | Constraints |
|---|---|---|
| id | text | PK |
| tenantId | text | NOT NULL |
| propertyId | text | NOT NULL |
| roomId | text | NOT NULL |
| businessDate | date | NOT NULL |
| reservationId | text | NOT NULL |
| status | text | NOT NULL |
| guestName | text | NOT NULL |
| checkInDate | date | NOT NULL |
| checkOutDate | date | NOT NULL |
| sourceType | text | NOT NULL |
| colorKey | text | NULL (computed) |
| updatedAt | timestamptz | NOT NULL default now() |

Constraints:
- Unique `(tenantId, propertyId, roomId, businessDate)`

Indexes:
- `(tenantId, propertyId, businessDate)`
- `(tenantId, propertyId, roomId, businessDate)`

### Table: `rm_pms_daily_occupancy`
| Column | Type | Constraints |
|---|---|---|
| id | text | PK |
| tenantId | text | NOT NULL |
| propertyId | text | NOT NULL |
| businessDate | date | NOT NULL |
| roomsOccupied | int | NOT NULL |
| roomsAvailable | int | NOT NULL |
| arrivals | int | NOT NULL |
| departures | int | NOT NULL |
| updatedAt | timestamptz | NOT NULL |

Constraint:
- Unique `(tenantId, propertyId, businessDate)`

---

## 11. v2 Scaffold Tables (optional to create now)
- `pms_restrictions` (minStay, CTA/CTD, etc.)
- `pms_packages` + `pms_package_items`
- `pms_messages` + `pms_message_templates`
- `pms_channel_mappings` + `pms_channel_reservations`

Create these only if OppsEra prefers early migrations; otherwise define in the design spec as future.

---
