# Oppsera F&B POS — Build Sessions

> **Purpose:** A series of self-contained Claude session prompts designed to iteratively build a world-class restaurant / F&B POS module on top of the existing Oppsera platform. Each session produces production-grade specs, DDL, and integration details.
>
> **How to use:** Deploy each session sequentially to Claude along with the current `CLAUDE.md` (schema) and `CONVENTIONS.md`. After each session, merge the outputs into your codebase and update `CLAUDE.md` before the next session.
>
> **Key principle:** This is where the **retail POS** and **restaurant POS** diverge. Retail keeps the current order flow. Restaurant gets its own floor-plan-driven, course-aware, kitchen-routed, seat-level experience — but both share the same foundational tables (orders, order_lines, tenders, catalog, departments).

---

## Session Map (Recommended Order)

| # | Session | Domain | Depends On |
|---|---------|--------|------------|
| 1 | Table Management & Floor Plan Extension | Floor plan → live tables | — |
| 2 | Server Sections & Shift Model | Labor → floor assignment | 1 |
| 3 | Tabs, Checks & Seat Lifecycle | Core ordering divergence | 1, 2 |
| 4 | Course Pacing, Hold/Fire & Kitchen Tickets | Kitchen routing | 3 |
| 5 | KDS Stations & Expo | Real-time kitchen display | 4 |
| 6 | Modifiers, 86 Board & Menu Availability | Menu engine | 3 |
| 7 | Split Checks, Merged Tabs & Payment Flows | Payment divergence | 3 |
| 8 | Pre-Auth Bar Tabs & Card-on-File | Bar operations | 7 |
| 9 | Tips, Tip Pooling & Gratuity Rules | Tip lifecycle | 7 |
| 10 | Close Batch, Z-Report & Cash Control | End-of-day | 7, 9 |
| 11 | GL Posting & Accounting Wiring | Accounting integration | 10 |
| 12 | F&B POS Settings Module | Backend configuration | All |
| 13 | Real-Time Sync, Concurrency & Offline | Infrastructure | 3, 5 |
| 14 | Receipts, Printer Routing & Chit Design | Output layer | 4, 7 |
| 15 | F&B Reporting Read Models | Analytics | 10, 11 |
| 16 | UX Screen Map & Interaction Flows | Frontend spec | All |

---

## SESSION 1 — Table Management & Floor Plan Extension

### Prompt

```
You are a Staff Product Architect + Principal Full-Stack Engineer working on Oppsera, a multi-tenant SaaS POS platform.

CONTEXT: We have an existing floor plan system with these tables:
- floor_plan_rooms (id, tenant_id, location_id, name, slug, width_ft, height_ft, grid_size_ft, scale_px_per_ft, default_mode, current_version_id, draft_version_id, capacity, sort_order, is_active)
- floor_plan_versions (id, tenant_id, room_id, version_number, status, snapshot_json, object_count, total_capacity, published_at)
- floor_plan_templates_v2 (id, tenant_id, name, snapshot_json, width_ft, height_ft, object_count, total_capacity)

We also have terminal_locations which represent POS revenue centers.

TASK: Design the **Table Management** layer for our F&B POS module. This must EXTEND the existing floor plan system — do NOT recreate it.

Requirements:
1. Tables as first-class entities extracted from the floor plan snapshot_json:
   - table_number (unique per room), display_label, capacity_min, capacity_max
   - table_type: standard | bar_seat | communal | booth | high_top | patio
   - shape: round | square | rectangle | custom
   - physical position (x, y, width, height, rotation from snapshot)
   - section_id (FK to server sections — stub for now, full in Session 2)
   - is_combinable (can this table be merged with adjacent)

2. Live table status tracking (separate from the design-time floor plan):
   - status: available | reserved | seated | ordered | entrees_fired | dessert | check_presented | paid | dirty | blocked
   - current_tab_id (FK to tabs — stub for now)
   - current_server_user_id
   - seated_at, party_size, estimated_turn_time_minutes
   - guest_names (optional, for host stand)
   - Status history log for analytics

3. Table combines:
   - A combine_group that links 2+ tables into one logical table
   - When combined, one table is "primary" and holds the tab
   - Combine/uncombine must update live status atomically

4. Waitlist integration point (stub only — just the FK and status):
   - waitlist_entry_id on the table status when seating from waitlist

Deliver:
A) ALTER statements for floor_plan_rooms if needed
B) New tables with full DDL (constraints, indexes, CHECK constraints)
C) Index rationale for hot paths: "show me all tables in room X with status", "find available tables for party of 4", "which tables belong to server Y"
D) The event_outbox events this domain emits (table_status_changed, table_combined, table_uncombined)
E) Concurrency notes: how do we prevent two hosts from seating the same table simultaneously?

Database rules:
- tenant_id on every row
- ULIDs via gen_ulid()
- created_at, updated_at timestamps
- Money in _cents (integer)
- CHECK constraints for enums
- Indexes on every hot query path
```

---

## SESSION 2 — Server Sections & Shift Model

### Prompt

```
You are a Staff Product Architect + Principal Full-Stack Engineer working on Oppsera, a multi-tenant SaaS POS platform.

CONTEXT: We have these existing tables relevant to this session:
- users (id, email, name, pos_pin, override_pin, employee_color)
- roles / role_assignments / role_permissions (RBAC system)
- memberships (user_id, tenant_id, status) — tenant membership
- employee_time_entries (employee_id, role_id, clock_in_time, clock_out_time, clock_in_source, approval_status)
- terminals (id, tenant_id, terminal_location_id, title)
- terminal_locations (id, tenant_id, title, tips_applicable)

From Session 1 we now also have:
- fnb_tables (id, tenant_id, room_id, section_id, table_number, ...)
- fnb_table_live_status (id, tenant_id, table_id, status, current_server_user_id, ...)

TASK: Design the **Server Sections & F&B Shift Model** that powers server-to-table assignment, section rotation, and the restaurant-specific shift lifecycle.

Requirements:

1. Sections:
   - A section is a named group of tables within a room (e.g., "Patio Section A", "Bar Rail")
   - Sections belong to a room (floor_plan_room_id)
   - Each section can be assigned to one or more servers per shift
   - Section assignment = which server owns which tables for tip/order routing
   - Sections can overlap V2 (a table in two sections) — for V1 a table belongs to exactly one section

2. Server Section Assignments:
   - Assign server (user_id) to section for a shift/date
   - Support "cut" — server is cut from the floor but keeps their open tabs
   - Support "pickup" — another server takes over a section mid-shift
   - Track assignment history for tip reconciliation

3. F&B Shift Lifecycle:
   - Extend or wrap employee_time_entries for restaurant context
   - A server's "shift" includes: section assignments, open tabs, tip pool membership, sidework checklist (V2 stub)
   - Shift open → serving → cut → closing (still has open tabs) → closed
   - "Checkout" process: server can't clock out until all tabs closed + cash drop done

4. Host Stand View (data model only):
   - Which tables are available, which servers have capacity
   - "Next up" rotation tracking (round-robin seat assignment to balance covers)
   - Covers-per-server counter (real-time)

5. Permissions overlay:
   - New permissions: manage_sections, assign_servers, override_section_assignment, view_all_sections
   - These integrate with existing role_permissions

Deliver:
A) New tables with full DDL
B) ALTER statements for any existing tables
C) Index rationale for: "show all servers on floor now with their section + open tab count", "which server has fewest covers?", "all assignments for server X on date Y"
D) Events: server_assigned_to_section, server_cut, section_picked_up
E) How this integrates with existing employee_time_entries (wrapper? extension? separate?)
F) API endpoints list (REST) for section CRUD, assignment CRUD, host-stand queries

Database rules: tenant_id everywhere, ULIDs, created_at/updated_at, CHECK constraints for status enums.
```

---

## SESSION 3 — Tabs, Checks & Seat Lifecycle

### Prompt

```
You are a Staff Product Architect + Principal Full-Stack Engineer working on Oppsera, a multi-tenant SaaS POS platform.

CONTEXT: This is the CRITICAL session where the restaurant POS diverges from the retail POS.

Existing order system:
- orders (id, tenant_id, location_id, order_number, status [open|held|placed|paid|voided], source, customer_id, subtotal, tax_total, service_charge_total, discount_total, total, business_date, terminal_id, employee_id, tab_name, table_number, primary_order_id, version)
- order_lines (id, tenant_id, location_id, order_id, catalog_item_id, qty, unit_price, line_subtotal, line_tax, line_total, modifiers jsonb, special_instructions, seat_number, meal_course_id, combo_parent_line_id)
- order_seats (id, tenant_id, order_id, seat_number, customer_id, customer_name, tab_name)
- order_tips, order_charges, order_discounts (existing)

From previous sessions: fnb_tables, fnb_table_live_status, fnb_sections, fnb_server_assignments

TASK: Design the **Tab / Check** lifecycle that sits ON TOP of the existing orders system. The restaurant "tab" is an orchestration layer — underneath, it still creates orders and order_lines. But the tab adds: seat tracking, course management, split/merge, transfer, and a state machine that differs from retail.

CRITICAL DESIGN DECISION: A tab is NOT a new table replacing orders. A tab is a restaurant-context wrapper that references one or more orders. One tab = one check = one "order" in most cases. But split checks create multiple orders from one tab, and merged tabs consolidate.

Requirements:

1. Tab Entity:
   - id, tenant_id, location_id, tab_number (auto-increment per location per business_date)
   - tab_type: dine_in | bar | takeout | quick_service
   - status: open | ordering | sent_to_kitchen | in_progress | check_requested | split | paying | closed | voided | transferred
   - table_id (nullable — bar tabs have no table)
   - server_user_id (the owning server)
   - opened_by, opened_at
   - party_size, guest_name (bar tabs)
   - primary_order_id (FK to orders — the main order for this tab)
   - service_type: dine_in | takeout | to_go (affects tax in some jurisdictions)
   - current_course_number (which course is active for new items)
   - version (optimistic concurrency)
   - Linked to fnb_table_live_status when dine-in

2. Seat Management:
   - Seats are numbered positions at a tab (1, 2, 3...)
   - Each order_line has a seat_number (already exists on order_lines)
   - Seat-level operations: "move item to seat 3", "split by seat"
   - order_seats already exists — leverage it, extend if needed
   - Guest names per seat (for fine dining)

3. Course Management:
   - meal_courses already exists (id, tenant_id, title, display_sequence)
   - Each order_line already has meal_course_id
   - NEW: course_status per tab: unsent | sent | fired | served
   - Hold/fire: a course can be "held" and then "fired" on command
   - "Send" = release to kitchen; "Fire" = start cooking NOW
   - Default courses: Apps, Entrees, Desserts (configurable)

4. Tab Operations:
   - Open tab (create tab + order)
   - Add items (add order_lines to the tab's order)
   - Send to kitchen (batch of unsent items)
   - Void item (before/after send — different flows)
   - Comp item (discount to zero with reason)
   - Transfer tab to another server
   - Transfer tab to another table
   - Move items between tabs
   - Merge two tabs into one
   - Split tab into multiple checks (creates new orders, reassigns order_lines)
   - Reopen closed tab (permission required)

5. Split Check Model:
   - When splitting, create child orders from the parent
   - Split strategies: by_seat, by_item, equal_split, custom_amount
   - Each split check can be paid independently
   - Track split_from_tab_id, split_strategy, split_details_json

6. Version / Concurrency:
   - Tab.version increments on every mutation
   - All mutations must include expected_version (CAS)
   - Reject stale writes with 409 Conflict

Deliver:
A) New tables: fnb_tabs, fnb_tab_courses (course status per tab), fnb_tab_splits, fnb_tab_transfers (audit)
B) ALTER statements for orders and order_lines if needed
C) Full DDL with constraints and indexes
D) State machine diagram (text) for tab lifecycle
E) Events: tab_opened, tab_items_added, tab_sent_to_kitchen, tab_course_fired, tab_split, tab_merged, tab_transferred, tab_closed, tab_voided
F) Hot path indexes: "all open tabs for server X", "all open tabs at table Y", "tab by tab_number for business_date"
G) How this relates to the existing orders table — mapping doc

Database rules: tenant_id everywhere, ULIDs, created_at/updated_at, CHECK constraints, version column for concurrency, money in _cents.
```

---

## SESSION 4 — Course Pacing, Hold/Fire & Kitchen Tickets

### Prompt

```
You are a Staff Product Architect + Principal Full-Stack Engineer working on Oppsera, a multi-tenant SaaS POS platform.

CONTEXT:
Existing:
- order_line_preparations (id, tenant_id, order_line_id, quantity, status [pending|preparing|ready|served|voided], docket_number, docket_id, push_date_time, kds_setting, preparation_instructions)
- order_preparation_dockets (id, tenant_id, primary_order_id, docket_number, preparation_instructions)
- printers (id, tenant_id, title, tag, mac_address, serial_number, metadata)
- print_jobs (id, tenant_id, printer_id, order_id, order_detail_preparation_id, print_job_type, is_printed, printed_at)
- meal_courses (id, tenant_id, title, display_sequence)

From Session 3: fnb_tabs, fnb_tab_courses (with hold/fire status)

TASK: Design the **Kitchen Ticket & Course Pacing** system. This is the heart of restaurant operations — items flow from the server's tab through course pacing into kitchen routing.

Requirements:

1. Kitchen Tickets:
   - A kitchen ticket is a batch of items sent to the kitchen at once
   - ticket_number (sequential per business_date per location)
   - Contains one or more order_lines grouped by course
   - Status: pending | in_progress | ready | served | voided
   - Tracks: sent_at, started_at, ready_at, served_at, voided_at
   - Links back to tab_id and order_id

2. Kitchen Ticket Items:
   - Each item on a ticket references an order_line_id
   - item_status: pending | cooking | ready | served | voided
   - modifier_summary (denormalized for KDS display)
   - seat_number (denormalized for expo)
   - course_name (denormalized for KDS grouping)
   - Special flags: rush, allergy, vip

3. Course Pacing Engine:
   - When server hits "Send" on a tab:
     a) All items in the current course that are unsent get batched into a kitchen ticket
     b) If course is "held", items are queued but NOT sent
     c) When server "fires" a held course, a ticket is created and sent
   - "Send All" sends all unsent items across all courses
   - "Fire Next Course" fires the next held course in sequence
   - Automatic pacing (V2 stub): after course N is served, auto-fire course N+1 with configurable delay

4. Kitchen Modifications After Send:
   - ADD item to existing ticket (creates a delta chit: "ADD: Caesar Salad Seat 2")
   - VOID item from ticket (creates a delta chit: "VOID: Burger Seat 3 — wrong order")
   - MODIFY item (void old + add new, delta chit shows both)
   - Rush an item (changes priority, delta chit: "RUSH: Pasta Seat 1")
   - These delta chits are separate print/KDS events

5. Ticket Routing:
   - Each item routes to one or more kitchen stations (Session 5 detail)
   - For now, define the routing rule model:
     - catalog_item_id → station_id (primary routing)
     - modifier can change routing (e.g., "make it a wrap" routes to a different station)
     - department/subdepartment can be fallback routing
   - A single ticket may produce multiple station-specific chits

6. Expo Aggregation:
   - Expo sees all items for a ticket across all stations
   - Expo tracks: all items ready? → ticket is "ready" → mark served
   - Expo is the quality gate before food leaves the kitchen

Deliver:
A) New tables: fnb_kitchen_tickets, fnb_kitchen_ticket_items, fnb_kitchen_routing_rules, fnb_kitchen_delta_chits
B) ALTER statements for order_line_preparations / order_preparation_dockets if we extend them vs. replace
C) Full DDL with constraints, indexes
D) State machine for ticket lifecycle and item lifecycle
E) Events: ticket_created, ticket_item_status_changed, ticket_ready, ticket_served, delta_chit_created
F) Pacing algorithm pseudocode (send/hold/fire logic)
G) Index rationale for KDS queries: "all active tickets for station X", "all pending items for expo", "ticket by ticket_number"

Database rules: tenant_id, ULIDs, timestamps, CHECK constraints, money in _cents.
```

---

## SESSION 5 — KDS Stations & Expo

### Prompt

```
You are a Staff Product Architect + Principal Full-Stack Engineer working on Oppsera, a multi-tenant SaaS POS platform.

CONTEXT:
From Session 4: fnb_kitchen_tickets, fnb_kitchen_ticket_items, fnb_kitchen_routing_rules, fnb_kitchen_delta_chits

TASK: Design the **KDS (Kitchen Display System) Station** configuration, real-time display model, and expo workflow.

Requirements:

1. Station Configuration:
   - Stations: grill, fry, sauté, salad, pizza, dessert, bar, expo, custom
   - Each station has: name, display_name, station_type (prep | expo | bar), color, sort_order
   - Station belongs to a location (and optionally a terminal_location for grouping)
   - A station can be linked to one or more physical KDS displays (tablet/screen)
   - A station can have a fallback station (if station offline, route to fallback)
   - Printer association: each station can have a backup printer for when KDS is down

2. KDS Display Model:
   - What each station screen shows:
     - Active tickets filtered to items routed to this station
     - Items grouped by ticket, sorted by time (oldest first / priority)
     - Each item shows: item name, modifiers, quantity, seat#, course, special flags, time elapsed
     - Color coding: normal (white), rush (red), allergy (yellow), VIP (blue)
   - Bump: mark item as "ready" at this station
   - Recall: un-bump (bring item back)
   - Timing: configurable warning thresholds (yellow at 8min, red at 12min)

3. Expo Station:
   - Sees ALL items for a ticket across all stations
   - Shows per-item station-readiness (grill: ready, fry: cooking, salad: ready)
   - Expo bumps the entire ticket when all items ready
   - Expo can "call back" to a station if quality issue
   - Expo triggers the "ready for pickup / serve" notification

4. Station Metrics (for read model):
   - Avg ticket time per station
   - Items bumped per hour
   - Tickets past threshold count

5. Real-Time Requirements:
   - KDS displays subscribe to a WebSocket/SSE channel per station
   - Events that trigger KDS refresh: ticket_created, ticket_item_status_changed, delta_chit_created, ticket_voided
   - Payload should include enough data for the KDS to render without re-fetching
   - Offline KDS: if connection drops, reconnect and replay missed events (or full reload)

Deliver:
A) New tables: fnb_kitchen_stations, fnb_station_display_configs, fnb_station_metrics_snapshot
B) Full DDL
C) WebSocket channel design: topic naming, payload shapes, subscription model
D) KDS screen component spec (what data each card shows, layout description)
E) Expo workflow state machine
F) Index rationale for real-time queries
G) Events consumed and produced by KDS subsystem

Database rules: tenant_id, ULIDs, timestamps.
```

---

## SESSION 6 — Modifiers, 86 Board & Menu Availability

### Prompt

```
You are a Staff Product Architect + Principal Full-Stack Engineer working on Oppsera, a multi-tenant SaaS POS platform.

CONTEXT:
Existing modifier system:
- catalog_modifier_groups (id, tenant_id, name, selection_type [single|multi], is_required, min_selections, max_selections)
- catalog_modifiers (id, tenant_id, modifier_group_id, name, price_adjustment, sort_order, is_active)
- catalog_item_modifier_groups (catalog_item_id, modifier_group_id, is_default)
- catalog_items (id, tenant_id, category_id, name, default_price, item_type, is_trackable, price_includes_tax, archived_at)
- catalog_categories (id, tenant_id, parent_id, name, sort_order, is_active)
- catalog_pricing_schedules (time-based pricing)
- departments, sub-departments (via department_settings)

TASK: Design the **Menu Availability, 86 Board & Modifier Enhancement** layer for F&B POS. This is where the restaurant menu engine diverges from the retail catalog.

Requirements:

1. 86 Board (Item Unavailability):
   - Mark items as "86'd" (unavailable) in real-time
   - 86 can be: manual (manager decision), inventory-triggered (V2), or time-expired
   - 86 scope: per-location (global 86) or per-station
   - When an item is 86'd, it appears greyed/struck on POS, cannot be added to orders
   - Auto-un-86 at start of next business day (configurable)
   - 86 log with who/when/why for accountability

2. Time-Based Menu Availability:
   - Breakfast menu (6am-11am), Lunch (11am-3pm), Dinner (3pm-close), Late Night (10pm-2am)
   - Items and categories can have availability windows
   - Availability = day_of_week + time_range + optional date_range (seasonal)
   - Menu periods are configurable in settings
   - Outside availability window, items are hidden or greyed (configurable)

3. Modifier Enhancements for F&B:
   - Forced modifier flow: item "Steak" forces "Temperature" group (required, single-select: rare/medium/well)
   - Nested modifiers (V2 stub): "Side" modifier → if "Salad" selected → force "Dressing" sub-modifier
   - Modifier price can be: fixed_amount, percentage_of_item, or free
   - "No" modifiers: ability to say "no onions" — effectively a $0 modifier that prints on ticket
   - Modifier availability: a modifier can also be 86'd
   - Modifier kitchen routing: some modifiers change which station an item routes to

4. Allergen System:
   - Predefined allergen list: gluten, dairy, nuts, shellfish, eggs, soy, fish, sesame, sulfites, custom
   - Items can be tagged with allergens they contain
   - Modifiers can add/remove allergens (e.g., "gluten-free bun" removes gluten)
   - Allergen flag appears on kitchen tickets and KDS
   - Server-side allergen alert when adding flagged item to a tab with a noted allergy

5. Item Prep Notes Presets:
   - Configurable preset notes per item or globally: "extra sauce", "on the side", "light", "heavy", "split plate"
   - Server can also type free-form notes
   - Notes print on kitchen ticket

Deliver:
A) New tables: fnb_eighty_six_log, fnb_menu_availability_windows, fnb_menu_periods, fnb_item_allergens, fnb_allergen_definitions, fnb_prep_note_presets
B) ALTER statements for catalog_items, catalog_modifiers if extending
C) Full DDL with constraints and indexes
D) Events: item_eighty_sixed, item_restored, menu_period_changed
E) Query patterns: "all available items for location X at 7:30pm on a Tuesday", "all 86'd items right now"
F) How this integrates with the ordering flow from Session 3 (validation on add-to-tab)

Database rules: tenant_id, ULIDs, timestamps, CHECK constraints.
```

---

## SESSION 7 — Split Checks, Merged Tabs & Payment Flows

### Prompt

```
You are a Staff Product Architect + Principal Full-Stack Engineer working on Oppsera, a multi-tenant SaaS POS platform.

CONTEXT:
Existing payment system:
- tenders (id, tenant_id, location_id, order_id, tender_type, tender_sequence, amount, tip_amount, change_given, status [captured|pending|voided|refunded], business_date, provider_ref, card_last4, card_brand, employee_id, terminal_id, allocation_snapshot jsonb)
- tender_reversals (id, original_tender_id, order_id, reversal_type, amount, reason, refund_method, status)
- order_tips (id, order_id, amount_cents, employee_id, terminal_id, payment_method_id)
- order_discounts (id, order_id, type, value, amount, reason, created_by)
- order_charges (id, order_id, charge_type, name, calculation_type, value, amount, is_taxable, tax_amount)
- orders.total, orders.subtotal, orders.tax_total, orders.discount_total, orders.service_charge_total

From Session 3: fnb_tabs with split model, fnb_tab_splits

TASK: Design the **F&B Payment Flow** including split checks, merged tab payment, and the restaurant-specific payment UX data model.

Requirements:

1. Payment Initiation:
   - Server hits "Close Tab" or "Present Check"
   - Tab status → check_presented
   - Print/display the check (subtotal, tax, service charge, total, tip line)
   - Check can be presented per-seat (fine dining) or for the whole tab

2. Split Check Payment:
   - Split strategies with full implementation detail:
     a) By Seat: each seat becomes its own check (own order, own payment)
     b) By Item: drag items to check A or check B
     c) Equal Split: total ÷ N people (handle remainders — first check gets the extra cent)
     d) Custom Amount: "Guest 1 pays $50, Guest 2 pays the rest"
   - Each split check is independently payable
   - A split check can itself be split further (recursive, but cap at 2 levels V1)
   - Partial payment on a split: pay $30 of a $45 check, remaining balance stays open
   - Rejoin: unsplit back into one check (only if no payments applied yet)

3. Multi-Tender Payment:
   - A single check can be paid with multiple tenders (card + cash, two cards, etc.)
   - Tender sequence: first card → remainder on second card → change on cash
   - Existing tenders table handles this (tender_sequence)

4. Service Charges:
   - Auto-gratuity rules: party_size >= N → add X% service charge
   - Service charge is an order_charge with charge_type = 'service_charge'
   - Service charge can be taxable or not (configurable)
   - Separate from tips (service charge is mandatory, tip is voluntary)
   - Banquet/event service charges (already exist in events module — ensure compatibility)

5. Discount/Comp on Tab:
   - Item-level comp: zero out one item with reason
   - Tab-level discount: percentage or fixed amount off the whole tab
   - Must fire order_discounts / order_charges as appropriate
   - Comp requires permission (comp_item, comp_check)
   - Discount requires permission (apply_discount)
   - Manager override PIN for amounts above threshold

6. Void vs. Refund:
   - Void: before payment, remove item/check entirely (reverses everything)
   - Refund: after payment, return money (creates tender_reversal)
   - Both require permission + reason
   - Post-close void: reopen tab → void → reclose (audit trail)

7. Payment Completion:
   - When all tenders sum to check total (or exceed for change):
     - Tab status → closed
     - Table status → paid → dirty (auto-transition after configurable delay)
     - Trigger accounting posting event
   - If payment fails (card decline): tab stays at paying status, server can retry or switch tender

Deliver:
A) New tables if needed (fnb_split_checks may need detail beyond Session 3 stub, fnb_auto_gratuity_rules, fnb_payment_sessions)
B) ALTER statements for existing tables
C) Full DDL
D) Payment state machine (per-check)
E) Split check algorithm pseudocode (especially equal split with remainder handling)
F) Events: check_presented, payment_started, tender_applied, payment_completed, payment_failed, check_comped, check_discounted, check_voided, check_refunded
G) Index rationale for: "all unpaid checks for tab X", "payment history for order Y"
H) How this maps to existing tenders table (no new payment table — extend the tender flow)

Database rules: tenant_id, ULIDs, timestamps, CHECK constraints, money in _cents (never float).
```

---

## SESSION 8 — Pre-Auth Bar Tabs & Card-on-File

### Prompt

```
You are a Staff Product Architect + Principal Full-Stack Engineer working on Oppsera, a multi-tenant SaaS POS platform.

CONTEXT:
Existing:
- tenders (with provider_ref, card_last4, card_brand, status)
- customer_payment_methods (id, customer_id, payment_type, token, brand, last4, expiry_month, expiry_year, billing_account_id, is_default, status)
- fnb_tabs (from Session 3)

TASK: Design the **Pre-Auth Bar Tab** model. This is the classic "open a tab with your credit card" bar workflow.

Requirements:

1. Pre-Authorization Flow:
   - Guest hands bartender their card
   - System creates a pre-auth hold for configurable amount (default $50, max $200)
   - Card is tokenized (via payment processor) and token stored against the tab
   - Pre-auth is NOT a charge — it's a hold that will be captured or released
   - Tab is now "open with card on file"

2. Tab with Card on File:
   - Card token stored on the tab (encrypted reference)
   - Display card last4 + brand on the tab for identification
   - Multiple cards can be on file for one tab (group scenarios)
   - If card is lost: settle tab with stored token, no physical card needed

3. Capture / Close:
   - When tab closes: capture the actual amount (which may differ from pre-auth)
   - If actual < pre-auth: capture actual, release remainder
   - If actual > pre-auth by more than configurable % (e.g., 20%): require server confirmation or manager approval
   - Add tip to capture amount (or adjust after initial capture within time window)

4. Walkout / Abandonment:
   - If guest leaves without closing: configurable auto-close behavior
     a) Auto-close after X hours with Y% auto-gratuity
     b) Alert manager for manual close
   - Capture the pre-auth amount (or actual tab amount, whichever is less)
   - Flag as "walkout" for reporting

5. Tip Adjustment Window:
   - After capture, allow tip adjustment within configurable hours (typically 24-48h)
   - Tip adjustment = incremental capture on the same auth
   - After window closes, tips are "finalized" and posted to accounting

6. "Start a Tab" UX Data:
   - Tab can be started: with card (pre-auth), without card (cash tab), with customer lookup (billing account)
   - Card-on-file is optional, not required for all tab types

Deliver:
A) New tables: fnb_tab_preauths, fnb_tip_adjustments
B) ALTER statements for fnb_tabs if needed
C) Full DDL
D) Pre-auth lifecycle state machine: created → authorized → captured → adjusted → finalized | voided | expired
E) Events: preauth_created, preauth_captured, tip_adjusted, tip_finalized, tab_walkout
F) Security notes: how card tokens are stored (reference only, not raw card data)
G) Integration points with payment processor (abstract — not processor-specific)

Database rules: tenant_id, ULIDs, timestamps, CHECK constraints, money in _cents.
```

---

## SESSION 9 — Tips, Tip Pooling & Gratuity Rules

### Prompt

```
You are a Staff Product Architect + Principal Full-Stack Engineer working on Oppsera, a multi-tenant SaaS POS platform.

CONTEXT:
Existing:
- order_tips (id, order_id, amount_cents, employee_id, terminal_id, payment_method_id, applied_to_payment_method_id)
- tip_ledger_entries (id, employee_id, description, entity_id, entity_type, amount_cents)
- tip_sharing_rules (id, from_employee_id, to_employee_id, percentage, amount_cents)
- cash_tips (id, employee_id, amount_cents)
- terminal_location_tip_suggestions (id, terminal_location_id, tip_type [percentage|amount], tip_percentage, tip_amount_cents)

TASK: Design the **Tip Management** system for F&B POS — tip collection, pooling, sharing, and reporting.

Requirements:

1. Tip Collection:
   - Tips come from: credit card (on tender), cash (declared), and auto-gratuity (service charge treated as tip in some jurisdictions)
   - Tip belongs to a server (the tab's server) by default
   - Tip suggestions on payment screen: configurable percentages (15%, 18%, 20%, 25%) and custom amount
   - Tip on signature (post-capture adjustment from Session 8)

2. Tip Pooling:
   - Pool types: no_pool | full_pool | percentage_pool | points_pool
   - Full pool: all tips go into a pool, distributed by hours worked or points
   - Percentage pool: servers keep X%, Y% goes to pool for support staff
   - Points pool: roles have point values (server=10, busser=5, bartender=8), pool distributed by points × hours
   - Pool scope: per-shift, per-day, per-location
   - Pool participants: configurable by role

3. Tip Sharing (Tip Out):
   - Server declares tip-outs to busser, food runner, bartender at shift end
   - Can be: fixed amount, percentage of tips, or percentage of sales
   - Tip sharing rules can be preset (configurable) or manual
   - tip_sharing_rules already exists — extend or integrate

4. Cash Tip Declaration:
   - Servers declare cash tips at shift end (for tax compliance)
   - Minimum declaration rules (e.g., must declare at least 8% of cash sales)
   - Cash tip declaration is part of the "checkout" workflow

5. Tip Reporting:
   - Per-server per-shift: total tips (card + cash), tip rate (tips/sales)
   - Tip pool distribution log
   - Tip-out summary
   - Payroll export: tips per employee per pay period

6. Tip Accounting:
   - Credit card tips: liability (tips payable) until disbursed
   - Cash tips: declared for reporting, no GL impact (already in employee's hands)
   - Tip pool adjustments: redistribute from server accounts to support staff
   - Auto-gratuity: may be treated as service charge revenue OR tip depending on jurisdiction (configurable)

Deliver:
A) New tables: fnb_tip_pools, fnb_tip_pool_participants, fnb_tip_pool_distributions, fnb_tip_declarations, fnb_tip_out_entries
B) ALTER/extend existing tip tables where appropriate
C) Full DDL
D) Tip pool distribution algorithm pseudocode (points-based)
E) Events: tip_collected, tip_declared, tip_pool_distributed, tip_out_recorded
F) GL posting entries for tip scenarios
G) Integration with Session 10 (close batch) and Session 11 (accounting)

Database rules: tenant_id, ULIDs, timestamps, money in _cents.
```

---

## SESSION 10 — Close Batch, Z-Report & Cash Control

### Prompt

```
You are a Staff Product Architect + Principal Full-Stack Engineer working on Oppsera, a multi-tenant SaaS POS platform.

CONTEXT:
Existing:
- day_end_closings (id, tenant_id, terminal_id, closing_date, employee_id, float_amount_cents, note, amount_data jsonb)
- day_end_closing_payment_types (id, day_end_closing_id, payment_type, amount_cents)
- day_end_closing_cash_counts (id, closing_payment_type_id, denomination counts, total_amount_cents)
- drawer_events (id, tenant_id, terminal_id, employee_id, created_at)

TASK: Design the **Close Batch / Z-Report / Cash Control** system for F&B POS. This is the end-of-day reconciliation flow that bridges operations to accounting.

Requirements:

1. Close Batch Lifecycle:
   - A "close batch" is per-location per-business_date (NOT per terminal for F&B — servers roam)
   - Status: open → in_progress → reconciled → posted → locked
   - Close batch locks in: all closed tabs, all payments, all tips, all cash events
   - Cannot close batch if open tabs exist (force-close or alert)
   - Multiple partial closes per day (lunch close, dinner close) → V2 stub

2. Z-Report Data Model:
   - Gross sales (by department, subdepartment, category)
   - Net sales (gross - discounts - comps - voids)
   - Tax collected (by tax group)
   - Tips collected (card tips, declared cash tips)
   - Payment totals by tender type (cash, each card brand, gift card, house account, etc.)
   - Voids count + total
   - Comps count + total
   - Discounts count + total by type
   - Service charges collected
   - Covers count (total guests served)
   - Average check amount
   - Cash accountability: expected cash = starting float + cash sales + cash tips - cash payouts - cash drops
   - Over/short amount

3. Cash Drawer Management:
   - Starting float (beginning of day/shift)
   - Cash drops during shift (take excess cash to safe)
   - Paid-outs (cash expenses from drawer — vendor payments, emergency purchases)
   - End-of-day cash count (by denomination — already exists in day_end_closing_cash_counts)
   - Over/short calculation: counted - expected
   - Blind count option: cashier counts without seeing expected (configurable)

4. Server Checkout:
   - Each server does a "checkout" before end of shift:
     - All tabs must be closed or transferred
     - Cash owed = cash payments received - cash tips kept
     - Due to house = cash collected - float (if applicable)
     - Tip declaration
     - Signature/acknowledgment

5. Deposit Slip:
   - After close batch: generate deposit record
   - Deposit = cash to bank + check payments (if any)
   - Track: deposit_date, deposit_amount, bank_reference, verified_by

6. Posting Trigger:
   - Close batch triggers the accounting posting (Session 11)
   - Posting is atomic: all-or-nothing for the batch
   - If posting fails: batch stays at "reconciled" status, retry available

Deliver:
A) New tables: fnb_close_batches, fnb_close_batch_summaries, fnb_server_checkouts, fnb_cash_drops, fnb_cash_paid_outs, fnb_deposit_slips
B) ALTER/extend existing day_end_closings tables
C) Full DDL
D) Z-report calculation logic (pseudocode or SQL)
E) Cash accountability formula
F) Events: close_batch_started, server_checked_out, close_batch_reconciled, close_batch_posted, deposit_recorded
G) State machine for close batch lifecycle
H) Index rationale: "close batch for location X on date Y", "all server checkouts for batch Z"

Database rules: tenant_id, ULIDs, timestamps, money in _cents, CHECK constraints.
```

---

## SESSION 11 — GL Posting & Accounting Wiring

### Prompt

```
You are a Staff Product Architect + Principal Full-Stack Engineer working on Oppsera, a multi-tenant SaaS POS platform.

CONTEXT:
Existing accounting infrastructure:
- payment_journal_entries (id, tenant_id, location_id, reference_type, reference_id, order_id, entries jsonb, business_date, source_module, posting_status, posted_at, gl_dimensions jsonb, recognition_status, deferred_revenue_account_code)
- journal_entry_configurations (id, tenant_id, entity_id, entity_type, debit_chart_of_account_id, credit_chart_of_account_id, classification_id, vendor_id, memo, use_item_cost, terminal_location_id)
- chart_of_account_associations (id, tenant_id, entity_id, entity_type, chart_of_account_id, classification_id, is_quickbook_sync, account_type)
- chart_of_account_classifications (id, tenant_id, code, name)

From Session 10: fnb_close_batches, fnb_close_batch_summaries

TASK: Design the **GL Posting Spec** for F&B POS — the complete accounting wiring that connects every restaurant transaction to the general ledger.

Requirements:

1. Posting Sources:
   - Individual payment (real-time posting): each tender creates a journal entry
   - Close batch (batch posting): summary-level entries per business date
   - Configurable: real-time vs. batch posting per location
   - Void/refund: reversal entries that offset the original

2. Journal Entry Scenarios (provide full debit/credit for each):
   a) Cash payment for a dine-in tab ($100 food + $8 tax + $18 tip)
   b) Credit card payment split between two cards ($60 + $40) with $15 tip on card 1
   c) Tab with comp ($25 item comped by manager) + remaining paid by card
   d) Void after close (tab was $80, fully voided next day — reversal)
   e) Service charge on large party (20% auto-grat on $500 tab)
   f) Gift card partial payment ($30 gift card + $20 cash on $50 tab)
   g) Employee meal (comp with specific GL treatment)
   h) Cash over/short at close ($5 short in drawer)

3. GL Account Mappings:
   - Revenue mapping: department → GL revenue account (e.g., Food dept → 4100, Bar dept → 4200)
   - Sub-department override (e.g., Food > Appetizers → 4110 if configured)
   - Tax collected → Tax Payable liability accounts (per tax group)
   - Tips (credit card) → Tips Payable (liability) → cleared when paid to employee
   - Tips (cash) → memo only (already in employee's hands)
   - Payments: Cash → Cash on Hand (asset); Credit Card → Undeposited Funds (asset)
   - Discounts → Contra-Revenue (4900) or Discount Expense (6100) — configurable
   - Comps → Comp Expense (6200) with sub-coding by reason
   - Service Charges → Service Charge Revenue (4500) or liability (configurable)
   - Cash Over/Short → Over/Short Expense (6300)
   - Gift Card redemption → reduce Gift Card Liability

4. Mapping Tables:
   - Must support: tenant-level defaults, location-level overrides, department-level overrides
   - Hierarchy: item-level > sub-department > department > location default > tenant default
   - Same hierarchy for tax account mapping

5. Idempotency:
   - posting_key = (tenant_id, source_type, source_id, version)
   - If a posting is retried, it must not double-post
   - Use existing payment_journal_entries or extend it

6. Reversal Strategy:
   - Void creates a mirror-image reversal entry (debit ↔ credit)
   - Reversal references the original posting
   - Partial refund: reversal for the refunded amount only

Deliver:
A) New tables: fnb_gl_account_mappings (with hierarchy), fnb_posting_log (if extending payment_journal_entries)
B) ALTER statements for existing accounting tables
C) Full DDL
D) Complete journal entry examples (all 8 scenarios above) as debit/credit tables
E) Mapping resolution algorithm (item → subdept → dept → location → tenant)
F) Idempotency implementation detail
G) Events: posting_created, posting_reversed, posting_failed
H) Reconciliation query: "show me all unposted close batches" and "all reversals for business_date X"

Database rules: tenant_id, ULIDs, timestamps, money in _cents.
```

---

## SESSION 12 — F&B POS Settings Module

### Prompt

```
You are a Staff Product Architect + Principal Full-Stack Engineer working on Oppsera, a multi-tenant SaaS POS platform.

CONTEXT:
Existing:
- tenant_settings (id, tenant_id, location_id, module_key, setting_key, value jsonb)
- department_settings (id, tenant_id, department_id, setting_key, setting_value jsonb)
- payroll_configurations (various payroll-specific fields)

TASK: Design the **F&B POS Settings Module** — a comprehensive backend settings area that configures every aspect of restaurant operations.

Requirements: Define EVERY setting with its key, data type, default value, validation rule, and which UI section it belongs to. Group into submodules:

1. **General Settings** (module_key: 'fnb_general')
   - business_day_cutoff_time (time, default: "03:00", when the business date rolls over)
   - default_service_type (enum: dine_in|takeout|quick_service, default: dine_in)
   - rounding_rule (enum: none|nearest_5|nearest_10, default: none)
   - covers_tracking_enabled (boolean, default: true)
   - require_table_for_dine_in (boolean, default: true)
   - require_customer_for_tab (boolean, default: false)
   - auto_print_check_on_close (boolean, default: true)
   - currency_code (string, default: "USD")

2. **Floor Plan & Table Settings** (module_key: 'fnb_floor')
   - table_turn_time_defaults (json: {2-top: 45, 4-top: 60, 6-top: 75, 8-top: 90})
   - dirty_table_auto_reset_minutes (integer, default: 5)
   - auto_assign_server_by_section (boolean, default: true)
   - show_elapsed_time_on_tables (boolean, default: true)
   - table_status_colors (json: {available: "#4CAF50", seated: "#2196F3", ...})

3. **Ordering Settings** (module_key: 'fnb_ordering')
   - default_courses (json array of course names, default: ["Apps","Entrees","Desserts"])
   - auto_fire_single_course (boolean, default: true — if only one course, auto-send)
   - require_seat_number (boolean, default: false)
   - allow_open_price_items (boolean, default: false)
   - comp_reasons (json array, default: ["Manager Comp","Quality Issue","Long Wait","VIP"])
   - void_reasons (json array, default: ["Wrong Item","Quality","Customer Changed Mind","Duplicate"])
   - item_note_presets (json array, default: ["Extra Sauce","On The Side","No Onions","Gluten Free","Split Plate"])

4. **Kitchen Settings** (module_key: 'fnb_kitchen')
   - kds_warning_threshold_seconds (integer, default: 480)
   - kds_critical_threshold_seconds (integer, default: 720)
   - kds_bump_behavior (enum: remove|move_to_done, default: remove)
   - expo_mode_enabled (boolean, default: true)
   - auto_print_on_kds_failure (boolean, default: true)
   - delta_chit_enabled (boolean, default: true)
   - course_pacing_auto_fire (boolean, default: false — V2)

5. **Payment Settings** (module_key: 'fnb_payment')
   - tip_suggestions (json array, default: [15, 18, 20, 25])
   - tip_suggestion_type (enum: percentage|amount, default: percentage)
   - tip_adjustment_window_hours (integer, default: 48)
   - auto_gratuity_party_size_threshold (integer, default: 6)
   - auto_gratuity_percentage (decimal, default: 20.0)
   - preauth_default_amount_cents (integer, default: 5000)
   - preauth_max_amount_cents (integer, default: 20000)
   - preauth_overage_alert_percentage (decimal, default: 20.0)
   - walkout_auto_close_hours (integer, default: 4)
   - walkout_auto_gratuity_percentage (decimal, default: 20.0)
   - allow_no_sale_drawer_open (boolean, default: false)
   - require_reason_for_void (boolean, default: true)
   - require_manager_for_void_after_send (boolean, default: true)

6. **Tip Pooling Settings** (module_key: 'fnb_tips')
   - tip_pool_type (enum: none|full|percentage|points, default: none)
   - tip_pool_percentage_to_pool (decimal, default: 0)
   - tip_pool_distribution_method (enum: hours|points|equal, default: hours)
   - minimum_cash_tip_declaration_percentage (decimal, default: 8.0)
   - tip_out_presets (json: [{role: "busser", percentage: 3}, {role: "bartender", percentage: 5}])

7. **Accounting Settings** (module_key: 'fnb_accounting')
   - posting_timing (enum: realtime|batch, default: batch)
   - default_revenue_gl_account (string)
   - default_tax_liability_gl_account (string)
   - default_tips_payable_gl_account (string)
   - default_cash_gl_account (string)
   - default_card_clearing_gl_account (string)
   - discount_gl_treatment (enum: contra_revenue|expense, default: contra_revenue)
   - comp_gl_account (string)
   - over_short_gl_account (string)
   - service_charge_gl_treatment (enum: revenue|liability, default: revenue)

8. **Receipt Settings** (module_key: 'fnb_receipts')
   - receipt_header_lines (json array of strings)
   - receipt_footer_lines (json array of strings)
   - show_item_modifiers_on_receipt (boolean, default: true)
   - show_server_name_on_receipt (boolean, default: true)
   - show_table_number_on_receipt (boolean, default: true)
   - default_receipt_delivery (enum: print|email|sms|none, default: print)
   - merchant_copy_auto_print (boolean, default: true)

9. **Hardware Settings** (module_key: 'fnb_hardware')
   - device_heartbeat_interval_seconds (integer, default: 30)
   - offline_mode_enabled (boolean, default: false)
   - offline_max_queued_orders (integer, default: 50)
   - offline_payment_allowed (boolean, default: false)

Deliver:
A) Full settings schema (using existing tenant_settings table with module_key + setting_key)
B) Settings validation rules (JSON schema or pseudocode)
C) Default seed data SQL (INSERT statements for all defaults)
D) Settings UI screen map (submodule → screen → fields)
E) Settings hierarchy: tenant-level default → location-level override
F) API endpoints for settings CRUD
G) Migration strategy: how to add these settings to existing tenants

Database rules: Use existing tenant_settings table pattern. No new tables unless justified.
```

---

## SESSION 13 — Real-Time Sync, Concurrency & Offline

### Prompt

```
You are a Staff Product Architect + Principal Full-Stack Engineer working on Oppsera, a multi-tenant SaaS POS platform.

CONTEXT: All F&B POS entities from Sessions 1-12. Key concurrency hotspots:
- Table status (multiple hosts seating)
- Tab mutations (multiple servers/terminals editing)
- KDS updates (multiple stations bumping)
- Payment processing (split checks being paid simultaneously)

Existing:
- event_outbox (id, tenant_id, event_type, event_id, idempotency_key, payload jsonb, occurred_at, published_at)
- orders.version (optimistic concurrency)
- fnb_tabs.version (from Session 3)

TASK: Design the **Real-Time Sync, Concurrency Control & Offline Strategy** for F&B POS.

Requirements:

1. WebSocket / SSE Architecture:
   - Channel topology: per-location, per-terminal, per-station, per-floor
   - Which events flow on which channels
   - Payload design: full entity vs. delta vs. event-only (trigger refetch)
   - Reconnection strategy: on reconnect, client requests events since last_event_id
   - Backpressure: if client is slow, buffer or drop non-critical events

2. Optimistic Concurrency (all mutatable F&B entities):
   - Tab: version-gated CAS on all mutations
   - Table status: version-gated
   - Kitchen ticket: version-gated (bump/recall)
   - What happens on conflict: 409 → client refetches → retries with new version

3. Soft Locking:
   - When a server opens a tab for editing on their terminal, acquire a soft lock
   - Soft lock = (tab_id, user_id, terminal_id, locked_at, expires_at)
   - If another terminal tries to edit: show "Tab is being edited by [Server Name] on [Terminal]"
   - Lock auto-expires after 30 seconds of inactivity (heartbeat to renew)
   - Manager can force-break locks

4. Offline Queue (V1 minimal):
   - What can happen offline: view floor plan, view open tabs, add items to tab (queued)
   - What CANNOT happen offline: payments, voids, close batch, KDS bump
   - Queue structure: ordered list of mutations with timestamps
   - Reconciliation on reconnect:
     a) Replay queued mutations in order
     b) If conflict (version mismatch): present conflict to user for resolution
     c) If tab was closed by another terminal while offline: reject queued mutations, alert user

5. Event Fan-Out:
   - Outbox → event bus → channel router
   - Events must be delivered in-order per entity (tab_id ordering key)
   - At-least-once delivery with client-side dedup (event_id)

6. Terminal Session Model:
   - Terminal connects with: tenant_id, location_id, terminal_id, user_id
   - Session tracks: connected_at, last_heartbeat, subscribed_channels
   - On disconnect: release soft locks, update terminal status

Deliver:
A) WebSocket channel taxonomy (topic names, who subscribes, what events)
B) Event payload schemas (at least 5 key events with full JSON shape)
C) Soft lock table DDL + API
D) Offline queue client-side schema
E) Reconciliation algorithm pseudocode
F) Sequence diagrams (text) for: concurrent tab edit, KDS bump race, offline reconnect
G) Performance considerations: expected event volume, fan-out ratio

Database rules: tenant_id, ULIDs, timestamps.
```

---

## SESSION 14 — Receipts, Printer Routing & Chit Design

### Prompt

```
You are a Staff Product Architect + Principal Full-Stack Engineer working on Oppsera, a multi-tenant SaaS POS platform.

CONTEXT:
Existing: printers, print_jobs, order_line_preparations
From Sessions 4-5: fnb_kitchen_tickets, fnb_kitchen_stations, fnb_kitchen_delta_chits

TASK: Design the **Receipt & Chit Printing** system for F&B POS — guest checks, kitchen chits, bar chits, expo chits, and receipt output.

Requirements:

1. Print Job Types for F&B:
   - guest_check: the bill presented to the guest
   - kitchen_chit: new order ticket sent to a kitchen station
   - bar_chit: order ticket sent to bar station
   - delta_chit: modification ticket (ADD/VOID/RUSH/MODIFY)
   - expo_chit: summary ticket for expo station
   - receipt: post-payment receipt (merchant + customer copy)
   - cash_drop_receipt: receipt for cash drops
   - close_batch_report: Z-report printout

2. Printer Routing Rules:
   - kitchen station → printer mapping (each station has a designated printer)
   - Fallback: if station printer offline, route to backup printer or expo printer
   - Receipt printer: per-terminal assignment (already exists in terminals.receipt_printer_id)
   - Remote printing: kitchen printer in back of house, receipt printer at POS terminal

3. Chit Layout Spec (for each type, describe the content blocks):
   - Kitchen Chit: header (ticket#, table#, server, time, course), items with mods/notes, seat numbers, special flags
   - Delta Chit: header + "*** ADD ***" or "*** VOID ***" callout + affected items
   - Guest Check: restaurant name, server, table, date/time, itemized list by seat (optional), subtotal, tax, service charge, total, tip line, footer
   - Receipt: same as guest check + payment details, tip amount, total with tip, card last4

4. Digital Receipt Options:
   - Email receipt (use existing communication_mailers infrastructure)
   - SMS receipt link (V2 stub)
   - QR code on printed receipt linking to digital copy (V2 stub)

5. Reprint / Audit:
   - Any chit can be reprinted
   - Reprint is logged (who, when, which job)
   - Print failure detection and retry

Deliver:
A) ALTER print_jobs if needed, new tables for F&B print routing rules
B) Full DDL
C) Chit layout specs (text/ASCII mock for each type)
D) Printer routing algorithm pseudocode
E) Events: print_job_created, print_job_completed, print_job_failed
F) Integration with KDS fallback (Session 5)

Database rules: tenant_id, ULIDs, timestamps.
```

---

## SESSION 15 — F&B Reporting Read Models

### Prompt

```
You are a Staff Product Architect + Principal Full-Stack Engineer working on Oppsera, a multi-tenant SaaS POS platform.

CONTEXT:
Existing read model tables:
- rm_daily_sales (location_id, business_date, order_count, gross_sales, discount_total, tax_total, net_sales, tender_cash, tender_card, void_count, avg_order_value)
- rm_item_sales (location_id, business_date, catalog_item_id, quantity_sold, gross_revenue, quantity_voided)
- rm_customer_activity (customer_id, total_visits, total_spend, last_visit_at)

Existing reporting infrastructure:
- report_definitions, report_snapshots, reporting_field_catalog
- semantic_metrics, semantic_dimensions, semantic_lenses (semantic layer)

TASK: Design the **F&B-Specific Reporting Read Models** that power restaurant analytics dashboards.

Requirements: Create read model tables and semantic layer entries for:

1. rm_fnb_server_performance:
   - Per server per business_date: covers, total_sales, avg_check, tip_total, tip_percentage, tables_turned, avg_turn_time_minutes, comps, voids

2. rm_fnb_table_turns:
   - Per table per business_date: turns_count, avg_party_size, avg_turn_time_minutes, avg_check_cents, total_revenue_cents, peak_hour_turns

3. rm_fnb_kitchen_performance:
   - Per station per business_date: tickets_processed, avg_ticket_time_seconds, items_bumped, items_voided, tickets_past_threshold, peak_hour

4. rm_fnb_daypart_sales:
   - Per location per business_date per daypart (breakfast/lunch/dinner/late_night): covers, order_count, gross_sales, net_sales, avg_check, top_items_json

5. rm_fnb_menu_mix:
   - Per item per business_date: quantity_sold, percentage_of_total_items, revenue, percentage_of_total_revenue, food_cost_percentage (V2), category, department

6. rm_fnb_discount_comp_analysis:
   - Per business_date: total_discounts, discount_by_type_json, total_comps, comp_by_reason_json, void_count, void_by_reason_json, discount_as_pct_of_sales

7. rm_fnb_hourly_sales:
   - Per location per business_date per hour: covers, order_count, sales_cents, labor_cost_cents (V2 stub)

Deliver:
A) Full DDL for all read model tables
B) Materialization strategy: event-driven (on tab_closed, payment_completed) vs. scheduled batch
C) Semantic layer entries: metrics + dimensions that map to these tables
D) Dashboard specs: which read models power which dashboard tiles
E) Events consumed for materialization
F) Index rationale for dashboard queries

Database rules: tenant_id, ULIDs, timestamps.
```

---

## SESSION 16 — UX Screen Map & Interaction Flows

### Prompt

```
You are a Staff Product Architect + Principal Full-Stack Engineer + Senior UX Architect working on Oppsera, a multi-tenant SaaS POS platform.

CONTEXT: All F&B POS entities and systems from Sessions 1-15 are now designed. This session produces the UX screen map and interaction flows that tie everything together.

TASK: Design the **complete UX Screen Map** for the F&B POS module, showing how it diverges from the retail POS while sharing common infrastructure.

Requirements:

1. Navigation Architecture:
   - How does a user switch between "Retail POS mode" and "Restaurant POS mode"?
   - Shared screens vs. restaurant-only screens
   - Terminal-level mode selection (a terminal is configured as retail OR restaurant)

2. Screen Inventory (for each screen: purpose, key components, data sources, primary actions):

   A) **Floor Plan View** (restaurant home screen)
      - Room selector (tabs for each dining area)
      - Table grid with live status colors
      - Table cards: table#, status, server, party size, elapsed time
      - Actions: seat table, view tab, transfer, combine tables
      - Waitlist sidebar (V2 stub)

   B) **Tab View** (the main ordering screen)
      - Left: menu browser (dept > subdept > category > items)
      - Center: current tab with seat columns and course rows
      - Right: tab summary (subtotal, tax, charges, total)
      - Quick actions: send, hold, fire, void, comp, discount, transfer, split
      - Modifier popup (when item requires modifiers)
      - Seat selector (tap to assign item to seat)
      - Course selector (tap to set course for next items)

   C) **KDS Station View** (kitchen display)
      - Ticket cards in time-order (oldest left, newest right)
      - Each card: ticket#, table#, server, elapsed time, items with mods
      - Color coding for priority
      - Bump button per item and per ticket
      - Header: station name, tickets pending count, avg time

   D) **Expo View** (kitchen display variant)
      - All-station ticket view
      - Per-item readiness indicator (which station has bumped)
      - Ticket-level bump (send to service)
      - Call-back button (send item back to station)

   E) **Payment Screen**
      - Check summary
      - Split options (by seat, by item, equal, custom)
      - Tender selection (cash, card, gift card, house account)
      - Tip prompt (configurable suggestions)
      - Split check navigation (tab between checks)

   F) **Server Dashboard**
      - My tables (quick grid of server's assigned tables with status)
      - My open tabs (list with totals and elapsed time)
      - My tips today (running total)
      - Quick actions: new tab, pickup table, checkout

   G) **Host Stand View**
      - Availability board (all tables with status)
      - Next-up rotation (which server gets next table)
      - Waitlist (V2)
      - Cover count per server

   H) **Manager Dashboard**
      - Live covers, open tabs, sales so far today
      - 86 board
      - Alert feed (long-open tabs, voids, walkouts)
      - Close batch launcher

   I) **Close Batch Screen**
      - Status of all open items (tabs, cash drops, checkouts)
      - Cash count entry
      - Over/short display
      - Confirm and post

   J) **Settings Screens** (from Session 12)
      - Navigation to all settings submodules
      - Form layouts per submodule

3. Interaction Flows (step-by-step with screen transitions):

   Flow 1: **Seat Guests → Order → Send → Fire → Split Pay → Close**
   Flow 2: **Open Bar Tab with Card → Add Items → Present Check → Tip Adjust → Close**
   Flow 3: **Transfer Tab Between Servers**
   Flow 4: **Void Item After Kitchen Send (Delta Chit)**
   Flow 5: **End-of-Day Close Batch and GL Posting**
   Flow 6: **86 an Item Mid-Service**

4. Responsive Considerations:
   - Primary: iPad landscape (POS terminal)
   - Secondary: iPad portrait (server handheld)
   - KDS: large wall-mounted display (simplified, no scrolling)
   - Manager dashboard: desktop browser

Deliver:
A) Screen inventory table (screen name, URL path, key components, access roles)
B) Component reuse map (what's shared with retail POS, what's restaurant-only)
C) All 6 interaction flows as step-by-step sequences with screen references
D) Wireframe descriptions (text) for the 3 most critical screens (Floor Plan, Tab View, KDS)
E) Permission matrix: which roles see which screens
F) Navigation structure (sidebar/tab items for restaurant mode)
```

---

## Post-Session Integration Checklist

After completing all 16 sessions, consolidate:

- [ ] Merge all DDL into a migration file
- [ ] Update CLAUDE.md with all new/altered tables
- [ ] Update CONVENTIONS.md with F&B POS architectural decisions
- [ ] Create a seed data script for default settings (Session 12)
- [ ] Create a permission seed script for F&B roles
- [ ] Build event catalog document (all events across all sessions)
- [ ] Build API route manifest
- [ ] Build read model materialization job specs
- [ ] Review all indexes for conflicts or redundancies
- [ ] Cross-session FK validation (ensure all references resolve)

---

## Appendix: Schema Snapshot of Existing Tables Referenced

The following existing tables are touched across sessions. Keep this list updated as you merge:

| Table | Sessions That Reference It | Modification Type |
|-------|---------------------------|-------------------|
| floor_plan_rooms | 1, 2 | ALTER (add default_mode context) |
| floor_plan_versions | 1 | Read only |
| orders | 3, 7, 10 | ALTER (add fnb_tab_id) |
| order_lines | 3, 4, 6 | ALTER (add course_status) |
| order_seats | 3, 7 | May extend |
| tenders | 7, 8, 11 | Read/write existing |
| tender_reversals | 7, 11 | Read/write existing |
| order_tips | 9 | Extend |
| order_discounts | 7 | Read/write existing |
| order_charges | 7 | Read/write existing |
| printers | 5, 14 | Read only |
| print_jobs | 14 | ALTER or extend |
| order_line_preparations | 4 | May ALTER or wrap |
| meal_courses | 3, 4 | Read/extend |
| day_end_closings | 10 | Extend |
| drawer_events | 10 | Extend |
| employee_time_entries | 2 | Wrap |
| users | 2, 3 | Read only |
| roles / role_permissions | 2 | Add new permissions |
| tenant_settings | 12 | Write new keys |
| event_outbox | 13 | Write new event types |
| payment_journal_entries | 11 | Write new source types |
| journal_entry_configurations | 11 | May extend |
| catalog_items | 6 | ALTER (allergens, availability) |
| catalog_modifier_groups | 6 | May extend |
| catalog_modifiers | 6 | May extend |
| terminal_locations | 2, 5 | Read |
| terminals | 2, 13 | Read |
| rm_daily_sales | 15 | Read model pattern |
