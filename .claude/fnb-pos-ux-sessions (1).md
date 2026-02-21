# Oppsera F&B POS — UX/UI Build Sessions (17–28)

> **Purpose:** A continuation of Sessions 1–16 (backend specs). These sessions produce the **frontend experience layer** — production-grade UX architecture, component code, design system, and screen implementations for a world-class restaurant POS.
>
> **How to use:** Deploy each session sequentially to Claude along with the current `CLAUDE.md`, `CONVENTIONS.md`, and the Session 16 screen map output. Each session produces working component code, design tokens, and integration wiring.
>
> **Key principle:** The POS is **floor-centric, not cart-centric.** The home screen is the room layout, not a product menu. Everything flows: TABLE → TAB → ORDER → KITCHEN → PAYMENT. Touch speed under pressure is the #1 design constraint.

---

## Session Map (Recommended Order)

| # | Session | Domain | Depends On |
|---|---------|--------|------------|
| 17 | Industry Research + Design System Foundation | Design tokens, color system, type scale, touch targets | 16 |
| 18 | Floor Plan Home Screen (Room Layout) | Primary POS screen — table grid, status, sections | 17 |
| 19 | Tab / Check Screen + Seat Management | 3-pane ordering screen, seat rail, course rows | 17, 18 |
| 20 | Order Entry + Menu Navigation (Touch-First) | Menu browser, modifiers, quick items, speed patterns | 17, 19 |
| 21 | KDS Station + Expo Views | Kitchen display, ticket cards, bump flow, delta chits | 17 |
| 22 | Split Checks + Merge UX | Split modes, drag-drop items, check panels | 19 |
| 23 | Payment + Tips UX | Tender grid, tip prompt, split payment, fast-close | 19, 22 |
| 24 | Manager + Host Overlays | Overrides, transfers, comp/void, host stand, waitlist | 18, 19 |
| 25 | Real-Time State + Data Hooks | WebSocket transport, optimistic updates, conflict UI | All screens |
| 26 | Component Architecture + Shared Library | Package structure, component tree, route map | All screens |
| 27 | Responsive Adaptations + Handheld Mode | Breakpoints, condensed layouts, drawer patterns | All screens |
| 28 | Integration Testing Flows + Performance Audit | E2E flows, touch perf, 60fps floor, lighthouse | All |

---

## SESSION 17 — Industry Research + Design System Foundation

### Prompt

```
You are a Senior Product Designer + Staff UX Architect specializing in high-performance restaurant POS systems (Toast, Lightspeed Restaurant, Square Restaurants, TouchBistro).

CONTEXT: You are designing the frontend experience layer for Oppsera's F&B POS module. The backend is fully specced (Sessions 1–16 produced table management, tabs/checks/seats, kitchen tickets, KDS, split checks, payments, tips, close batch, GL posting, settings, real-time sync, printer routing, and reporting). You are now building the UX/UI system that sits on top.

The system is used by servers, bartenders, managers, hosts, cashiers, and expo staff — under pressure, on touchscreens, during peak service hours. Speed and clarity are non-negotiable.

TASK: Deliver TWO things in this session:

---

### PART A: Industry UX Pattern Analysis

Research and synthesize the common UX patterns across top restaurant POS systems (Toast, Lightspeed, Square Restaurants, TouchBistro, Aloha, Micros). For each pattern, explain WHY it exists operationally:

1. Floor Plan Interactions
   - How do Toast/Lightspeed present table maps?
   - What info is visible at glance vs. on tap?
   - How do they handle multi-room navigation?
   - Why do all of them default to floor view (not menu)?

2. Table Status Color Systems
   - Compare color systems across 3+ platforms
   - What's the typical status progression?
   - How do they communicate urgency (long-wait, check requested)?
   - Why do most use 6-9 discrete statuses?

3. Order Entry Patterns
   - Menu hierarchy: dept → category → item (why 3 levels max?)
   - Quick items / favorites (why are these critical for bar?)
   - Modifier workflow: forced vs. optional (why forced modifiers block navigation?)
   - Seat assignment during order entry (inline vs. after)

4. Course Firing UX
   - Hold / Fire / Send mental model
   - Why does Toast separate "send" from "fire"?
   - Visual status per course (unsent, sent, cooking, ready, served)

5. Split Check UX
   - By seat (most common) vs. by item vs. equal
   - Drag-and-drop vs. tap-to-move (which wins on touch?)
   - Why do all platforms show running totals per check during split?

6. Payment UX
   - Large tender buttons (why minimum 64px tap targets?)
   - Tip prompt placement (before vs. after tender select)
   - Bartender fast-close (why do bars need a 1-tap close?)

7. Navigation Structure
   - Floor → Tab → Menu → Pay (linear with back-steps)
   - How do platforms handle "interrupted flow" (server pulled away mid-order)?
   - Context persistence (returning to a tab keeps state)

8. Alert / Timer Patterns
   - Time-since-seated timers
   - Kitchen delay alerts
   - How do they avoid alert fatigue? (progressive escalation, not constant noise)

9. Gesture Vocabulary
   - Which gestures are universal across POS platforms?
   - Tap (primary), long-press (context menu), swipe (limited use)
   - Why do most POS systems AVOID swipe? (accidental activation under pressure)

Deliver as: A structured reference document with pattern name, platforms that use it, operational reason, and our design decision (adopt/adapt/skip).

---

### PART B: Design System Foundation

Define the complete visual design system for the Oppsera F&B POS:

1. Color System
   - Background tiers: `bg-primary`, `bg-surface`, `bg-elevated`, `bg-overlay`
   - Table status palette (9 statuses with hex values, rationale for each):
     - Available, Reserved, Seated, Ordered, Entrées Fired, Dessert, Check Presented, Paid, Dirty
   - Semantic colors: `success`, `warning`, `danger`, `info`, `neutral`
   - Text hierarchy: `text-primary`, `text-secondary`, `text-muted`, `text-disabled`
   - Accent / brand color usage (minimal — this is an operational tool, not a marketing page)
   - Dark theme ONLY (standard for POS — reduces glare in dim restaurants)

2. Typography Scale
   - Font stack (system fonts for speed — no web font loading on POS terminals)
   - Scale: `xs` (10px), `sm` (12px), `base` (14px), `lg` (16px), `xl` (20px), `2xl` (24px), `3xl` (32px)
   - Monospace for: prices, table numbers, timers, ticket numbers
   - Weight hierarchy: 400 (body), 500 (labels), 600 (emphasis), 700 (headings/badges)
   - Line heights optimized for touch readability

3. Touch Target Standards
   - Minimum tap target: 44×44px (Apple HIG) — we use 48×48px for POS
   - Primary action buttons: minimum 56px height
   - Tender / payment buttons: minimum 64px height
   - Spacing between targets: minimum 8px gap
   - Thumb zone mapping for tablet landscape and portrait
   - "Dead zones" — areas near edges where accidental taps happen

4. Button Hierarchy
   - Primary: filled, high-contrast (Send, Fire, Pay)
   - Secondary: outlined (Hold, Split, Transfer)
   - Tertiary: ghost/text (Void, Comp, Cancel) — require confirmation
   - Destructive: red-tinted (Void, Delete) — always require confirmation or long-press
   - Icon-only: toolbar actions (print, search, bell)

5. Status Indicators
   - Pill badges: solid background + white text for statuses
   - Dot indicators: small colored dots for inline status
   - Timer badges: monospace, color-shifts at thresholds (green < 15m, yellow < 30m, red > 30m)
   - Progress bars: course completion, kitchen ticket age

6. Iconography
   - Lucide icon set (consistent, open source, works at 16-24px)
   - POS-specific icons needed: table, seat, course, fire, hold, split, bump, 86, comp

7. Motion / Animation Principles
   - Duration: 150ms for micro-interactions, 250ms for transitions, 0ms for real-time updates
   - Easing: ease-out for enters, ease-in for exits
   - What animates: status changes (color transition), new ticket arrival (slide-in), bump (scale-out)
   - What NEVER animates: floor plan load, tab open, payment screen (instant for speed)
   - Real-time updates: items appear instantly, no fade-in (latency = confusion)

8. Spacing System
   - Base unit: 4px
   - Scale: 4, 8, 12, 16, 20, 24, 32, 48, 64
   - Panel gutters: 16px
   - Card internal padding: 12-16px
   - Section margins: 24px

Deliver as: A design tokens file (CSS custom properties) AND a reference document with visual examples described in enough detail for implementation.
```

---

## SESSION 18 — Floor Plan Home Screen (Room Layout)

### Prompt

```
You are a Senior Product Designer + Staff Frontend Architect building the Oppsera F&B POS.

CONTEXT: Session 17 delivered the design system (colors, type, touch targets, buttons, status indicators). The backend has: floor_plan_rooms, floor_plan_versions (with snapshot_json containing table positions), fnb_tables, fnb_table_live_status, fnb_sections.

The floor plan is the MOST IMPORTANT screen in the system. It's the server's home base. It must communicate the state of the entire restaurant in a single glance.

TASK: Design and spec the **Floor Plan Home Screen** in production-level detail.

---

### Requirements:

1. **Screen Layout (tablet landscape — primary target)**

   ```
   ┌─────────────────────────────────────────────────────────────────┐
   │ TopBar: Location · Shift Status · User/PIN · Search · Alerts   │
   ├──────────┬──────────────────────────────────────┬───────────────┤
   │          │                                      │               │
   │  Room    │         Floor Canvas                 │   Sidebar     │
   │  Tabs    │    (table nodes at exact positions)  │  (contextual) │
   │          │                                      │               │
   │  Main    │   ┌──┐  ┌────┐  ┌──┐               │  My Tables    │
   │  Patio   │   │1 │  │ 2  │  │3 │               │  or           │
   │  Bar     │   └──┘  └────┘  └──┘               │  Stats        │
   │  Private │                                      │  or           │
   │          │   ┌────┐  ┌──┐  ┌────┐             │  Waitlist     │
   │          │   │ 4  │  │5 │  │ 6  │             │               │
   │          │   └────┘  └──┘  └────┘             │               │
   │          │                                      │               │
   │          │   ┌──────────────────────┐          │               │
   │          │   │     BAR  (12 seats)  │          │               │
   │          │   └──────────────────────┘          │               │
   ├──────────┴──────────────────────────────────────┴───────────────┤
   │ BottomDock: Active Tabs (3) · New Tab · Quick Actions · Covers │
   └─────────────────────────────────────────────────────────────────┘
   ```

2. **TopBar Components**
   - `LocationSwitcher`: dropdown (multi-location operators)
   - `ShiftStatusChip`: "Dinner · 47 covers" — tap to see shift detail
   - `UserPinSwitch`: current user avatar + quick-switch via PIN
   - `GlobalSearchButton`: search tables, tabs, items, guests
   - `NotificationsBell`: unread count badge, tap for alert drawer

3. **Room Selector Tabs**
   - Vertical pill tabs on left edge
   - Each room shows: name + open table count badge (e.g., "Patio (3/8)")
   - "All Rooms" option at top (shows combined mini-map)
   - Active room is highlighted
   - Long-press room tab → room settings shortcut (manager only)

4. **Floor Canvas**
   - Tables rendered at positions from `snapshot_json` (x, y, width, height, rotation)
   - Table shapes: round (circle), square, rectangle, booth (rounded rect), bar (long rect)
   - Scale: `scale_px_per_ft` from room settings
   - Section overlays: subtle colored backgrounds behind tables in each server's section
   - Section labels: small text near section boundary

5. **TableNode Component (critical — most repeated component)**

   Each table shows AT A GLANCE (no tap required):
   - Table number (large, centered, bold monospace)
   - Status color (full background fill — not just a border)
   - Party size indicator: "3/4" (guests / capacity)
   - Server initial badge (small circle, top-right: "M" for Maria)
   - Time badge (bottom: "24m" — time since seated, monospace)
   - Course indicator (bottom-left: small dots showing course progress)
   - Alert icon (pulsing if check_requested or waiting > threshold)

   Space is tight. The table node must communicate all this in ~80×80px minimum.

   Detailed spec:
   - Background: solid status color at 15% opacity
   - Border: 2px solid status color
   - Table number: 16px bold monospace, white
   - Party size: 9px, status color, below table number
   - Server badge: 18px circle, top-right, server's assigned color
   - Timer: 10px monospace, bottom-center
   - Course dots: 4px circles (hollow = not started, filled = sent, green = ready)
   - Alert: 12px pulsing icon, overlaid top-left

6. **Table Interactions**
   - **Tap** → Open tab screen for that table (or seat-guests modal if available)
   - **Long-press (500ms)** → Quick action menu:
     - Seat Guests (party size keypad)
     - View Tab
     - Transfer to Server (server list)
     - Combine Tables (tap second table)
     - Mark Clean / Dirty
     - Block Table
   - **Drag** → Initiate table combine (drag table A onto table B)
   - Combined tables show a visual link (dashed line connecting them)

7. **Sidebar Modes** (toggle via bottom dock or automatic)
   - **My Tables**: Server's assigned tables as a compact list (table#, status, timer, total)
   - **Stats**: Live covers, avg turn time, revenue, open tabs count
   - **Waitlist** (V2): Queue with party size, wait time, quoted time
   - Sidebar collapses to icon strip on smaller tablets

8. **Bottom Dock**
   - `ActiveTabsButton`: "3 Open Tabs" — tap to see list overlay
   - `NewTabButton`: "New Tab" — opens tab without table (takeout, bar walk-in)
   - `QuickActionsMenu`: ⚡ icon — recent tables, repeat last action
   - `CoverCounter`: "47/120 covers" — live count vs. total capacity

9. **Section Filtering**
   - "My Section" toggle: dims all tables outside server's section
   - Server color legend: small colored dots with server initials at bottom of room tabs
   - Manager view: all sections visible, colored overlays

10. **Real-Time Behavior**
    - Table status changes animate (color cross-fade, 200ms)
    - New seating: brief scale-up pulse on table node
    - Timer updates every 60s (not every second — avoid jitter)
    - WebSocket topic: `tables.{locationId}` — granular per-table updates
    - If WebSocket disconnects: subtle top banner "Reconnecting..." with retry countdown

Deliver:
A) Complete component tree with props for every component
B) CSS custom properties (using Session 17 design tokens)
C) Interaction state machine for TableNode (available → seated → ordered → ... → dirty → available)
D) Responsive behavior: tablet landscape (primary), tablet portrait (sidebar collapses), large display (expanded)
E) Accessibility: screen reader labels for table status, keyboard navigation for testing
F) Performance notes: memoization strategy for 50+ table nodes, keyed updates, avoid full-canvas re-render
```

---

## SESSION 19 — Tab / Check Screen + Seat Management

### Prompt

```
You are a Senior Product Designer + Staff Frontend Architect building the Oppsera F&B POS.

CONTEXT: Session 18 delivered the floor plan home screen. When a server taps a table, they land on the Tab / Check screen. The backend has: fnb_tabs, fnb_tab_seats, orders, order_lines, order_line_preparations, meal_courses.

This is the WORKHORSE screen. Servers spend 60%+ of their time here. It must be fast, clear, and support complex operations (multi-seat, multi-course, modifiers) without overwhelming the user.

TASK: Design and spec the **Tab / Check Screen** with full seat and course management.

---

### Requirements:

1. **Three-Pane Layout (tablet landscape)**

   ```
   ┌──────────────────────────────────────────────────────────────────┐
   │ TabHeader: Table 4 · Dine-In · Party: 3 · Maria · 24m · $146   │
   ├────────┬───────────────────────────────────┬─────────────────────┤
   │        │                                   │                     │
   │ Seat   │    Order Ticket                   │   Menu Panel        │
   │ Rail   │    (grouped by seat + course)     │   (dept→cat→items)  │
   │        │                                   │                     │
   │ S1 ●   │  ┌ Course 1: Apps ──── SENT ──┐  │   [Appetizers]      │
   │ S2 ●   │  │ S1  Caesar Salad    $14     │  │   [Entrees]         │
   │ S3 ○   │  │     - No croutons           │  │   [Desserts]        │
   │        │  │ S2  Calamari        $16     │  │   [Drinks]          │
   │ +Add   │  └─────────────────────────────┘  │                     │
   │        │                                   │   Item Grid:        │
   │        │  ┌ Course 2: Entrees ── HELD ─┐  │   ┌────┬────┬────┐  │
   │        │  │ S1  NY Strip        $48     │  │   │Caes│Soup│Brus│  │
   │        │  │     - Med, sub mash         │  │   │    │    │    │  │
   │        │  │ S2  Grilled Salmon  $36     │  │   ├────┼────┼────┤  │
   │        │  │     - GF, no butter         │  │   │Cala│Wing│Ncho│  │
   │        │  │ S3  Chicken Marsala $32     │  │   │    │    │    │  │
   │        │  └─────────────────────────────┘  │   └────┴────┴────┘  │
   │        │                                   │                     │
   ├────────┴───────────────────────────────────┴─────────────────────┤
   │ ActionBar: [Send All] [Fire Next] [Hold] │ Void·Comp·Split·Pay  │
   └──────────────────────────────────────────────────────────────────┘
   ```

2. **TabHeader**
   - Table number + type badge (Dine-In, Bar, Takeout)
   - Party size with +/- controls
   - Server name (tap to transfer)
   - Timer (since tab opened)
   - Running total (updates live as items are added)
   - Tab number (#1042)
   - Back arrow → return to floor plan (context preserved)

3. **Seat Rail (Left Pane, ~80px wide)**
   - Vertical list of seat chips: "S1", "S2", "S3"
   - Active seat highlighted (items added go to this seat)
   - Tap seat → filter order ticket to that seat only
   - Tap active seat again → show all seats
   - Each seat chip shows:
     - Seat number
     - Filled dot (has items) vs hollow dot (empty)
     - Item count badge
   - `+ Add Seat` button at bottom
   - Long-press seat → seat actions: remove, move items, rename
   - Drag item from order ticket onto seat chip → reassign seat

4. **Order Ticket (Center Pane)**
   - Items grouped by COURSE, then by SEAT within course
   - Course sections:
     - Course header: "Course 1: Appetizers" + status badge (UNSENT / SENT / COOKING / READY)
     - Hold / Fire / Send buttons inline with course header
     - Items indented under course
   - Each OrderLine shows:
     - Seat indicator (colored dot matching seat chip)
     - Item name (14px, weight 500)
     - Modifiers below item name (12px, muted color, italic)
     - Price (right-aligned, monospace)
     - Status icon (left edge): hollow circle (unsent), arrow (sent), flame (fired), check (ready)
     - Tap item → expand: qty controls, note entry, void/comp/move actions
     - Swipe left on item → quick void (with confirmation for sent items)
   - NEW (unsent) items have a subtle left-border accent to distinguish from sent items
   - Voided items show strikethrough + "VOID" badge

5. **Course Management**
   - Default courses: Apps → Entrees → Desserts (configurable in settings)
   - "Course Selector" above menu panel: buttons for each course
   - Items added go to the selected course
   - Course header actions:
     - **Send**: sends unsent items in this course to kitchen (creates kitchen ticket)
     - **Hold**: marks course as held (kitchen sees it but doesn't start)
     - **Fire**: tells kitchen to start this course NOW (most common mid-service action)
   - Visual course timeline: horizontal dots at top of order ticket showing course progression

6. **Handling the "Interrupted Server" Flow**
   - Server starts entering order for Table 4
   - Gets pulled away to Table 7
   - Taps back button → floor plan
   - Table 4 shows "unsent items" indicator (pulsing border)
   - Taps Table 4 → returns to EXACT state (same seat selected, same course, unsent items preserved)
   - Unsent items stored in local draft state (useOrderDraft hook)
   - Draft auto-expires after configurable timeout (default 30 minutes)

7. **Multi-Tab on Same Table**
   - Rare but needed: separate checks on same table from the start
   - Tab selector appears in header: "Tab A | Tab B | +"
   - Each tab has its own seats and items
   - Used for: separate parties at communal table, split from the start

Deliver:
A) Full component tree with props and state
B) Interaction patterns: add item to seat, change course, send to kitchen, void sent item
C) Optimistic UI spec: what updates immediately vs. waits for server confirmation
D) Keyboard shortcuts (for terminals with keyboards): S1-S9 seat select, C1-C3 course select, Enter=send
E) Animation spec: item add (slide-in from right), void (strikethrough + fade), send (status icon animate)
F) Error states: kitchen reject, version conflict (another server modified tab), network failure
```

---

## SESSION 20 — Order Entry + Menu Navigation (Touch-First)

### Prompt

```
You are a Senior Product Designer + Staff Frontend Architect building the Oppsera F&B POS.

CONTEXT: Session 19 delivered the tab/check screen. The Menu Panel lives in the right pane of that screen. The backend has: catalog_items, catalog_modifier_groups, catalog_modifiers, departments, sub_departments, categories.

Order entry is where speed is measured in SECONDS. A skilled server enters a 4-top's full order in under 60 seconds. Every extra tap costs money.

TASK: Design and spec the **Order Entry + Menu Navigation** system optimized for touch speed.

---

### Requirements:

1. **Menu Panel Layout (right pane, ~320px wide)**

   ```
   ┌─────────────────────────┐
   │ 🔍 Search...            │
   ├─────────────────────────┤
   │ Dept: [Apps][Entrees]   │
   │       [Desserts][Drinks]│
   ├─────────────────────────┤
   │ Cat: Salads · Soups ·   │
   │      Shareables         │
   ├─────────────────────────┤
   │ ┌────┐ ┌────┐ ┌────┐   │
   │ │Caes│ │Wdge│ │Grdn│   │
   │ │$14 │ │$12 │ │$11 │   │
   │ ├────┤ ├────┤ ├────┤   │
   │ │Soup│ │Onin│ │Brus│   │
   │ │$9  │ │$13 │ │$14 │   │
   │ └────┘ └────┘ └────┘   │
   ├─────────────────────────┤
   │ Quick: Water·Coffee·    │
   │        Bread·Soda       │
   └─────────────────────────┘
   ```

2. **Department Tabs** (top of menu panel)
   - Horizontal scrolling pills
   - Tap dept → shows categories for that dept
   - Badge on dept if it has 86'd items (strikethrough count)
   - Configurable dept order (drag-sort in settings)
   - Color-coded by department color (from catalog settings)

3. **Category Sub-Tabs**
   - Horizontal scrolling below dept tabs
   - Smaller, text-only
   - Tap category → filters item grid
   - "All" option shows all items in dept

4. **Item Grid**
   - 3-column grid (adjustable: 2, 3, or 4 columns via settings)
   - Each item tile:
     - Item name (truncated to 2 lines max)
     - Price (bottom-right, monospace)
     - 86'd overlay: red X + "86'd" badge (item still visible but disabled)
     - Color tint matching department color (subtle)
     - Minimum tile size: 80×72px
   - Tap item → one of two behaviors:
     - If NO forced modifiers → item added to current seat/course instantly (1-tap add)
     - If forced modifiers exist → modifier drawer opens

5. **Modifier Drawer (slides up from bottom, half-screen)**

   ```
   ┌─────────────────────────────────────────┐
   │ NY Strip 12oz                    $48.00 │
   ├─────────────────────────────────────────┤
   │ Temperature* (pick 1)     ← FORCED      │
   │ [Rare] [MR] [Med] [MW] [Well]          │
   ├─────────────────────────────────────────┤
   │ Side* (pick 1)            ← FORCED      │
   │ [Fries] [Mash] [Salad] [Veg] [Rice]   │
   ├─────────────────────────────────────────┤
   │ Add-Ons (pick any)        ← OPTIONAL    │
   │ [Mushrooms +$3] [Onion Ring +$4]       │
   │ [Bleu Cheese Crust +$6]                │
   ├─────────────────────────────────────────┤
   │ Notes: [                              ] │
   ├─────────────────────────────────────────┤
   │ Qty: [-] 1 [+]    [Cancel]  [Add $48] │
   └─────────────────────────────────────────┘
   ```

   - Forced modifier groups shown FIRST with asterisk
   - "Add" button DISABLED until all forced modifiers selected
   - Selected modifiers get filled/highlighted state
   - Price adjustments shown inline (+$3)
   - Running total updates as modifiers are selected
   - Notes field: free text for kitchen (e.g., "allergy - no nuts")
   - Quantity controls with repeat shortcut

6. **Search**
   - Tap search → full-width search input with on-screen keyboard
   - Fuzzy matching by item name, PLU code, or barcode
   - Results appear as list (not grid) for faster scanning
   - Debounce: 300ms
   - "No results" state with "86'd items hidden" note if applicable
   - Recent searches shown when search is empty

7. **Quick Items Row (bottom of menu panel)**
   - Configurable per-user (bartender's quick items ≠ server's)
   - 1-tap add, no modifiers (water, coffee, bread, etc.)
   - Horizontal scroll, 4 visible at a time
   - Settings: drag-sort to customize

8. **Speed Optimizations**
   - **Repeat Last**: button in action bar — adds the last item again with same modifiers
   - **Modifier Memory**: if server always picks "Medium" for steaks, remember and pre-select (opt-in setting)
   - **Fast Drink Entry**: Drinks dept defaults to 1-tap add (most drinks have no forced modifiers)
   - **Quantity Bump**: tap an already-added item in order ticket → qty increments (instead of re-navigating menu)
   - **Seat Auto-Advance**: after adding item, optionally auto-advance to next seat (setting)

9. **86'd Items**
   - 86'd items are visible but greyed out with red "86" overlay
   - Tap 86'd item → toast: "Item is 86'd" with manager override option
   - Manager override: PIN entry → allows adding 86'd item with audit log
   - Un-86 from manager dashboard updates all terminals in real-time

10. **Allergen Indicators**
    - Items with allergen tags show small icons: 🥜 🌾 🥛 🐟 🥚 🌱
    - Tap allergen icon → full allergen detail
    - Configurable: show/hide allergen icons on item tiles

Deliver:
A) Full component tree for MenuPanel and ModifierDrawer
B) Item selection flow: 3 scenarios (no mods, forced mods, optional mods)
C) Performance: virtualized item grid spec (for menus with 200+ items)
D) Search UX: fuzzy match algorithm recommendation + debounce spec
E) Quick items configuration UI (settings screen)
F) Tap-count analysis: "Add a steak with temp and side" in how many taps?
```

---

## SESSION 21 — KDS Station + Expo Views

### Prompt

```
You are a Senior Product Designer + Staff Frontend Architect building the Oppsera F&B POS.

CONTEXT: Sessions 4-5 specified kitchen tickets, KDS stations, and expo logic. This session designs the KITCHEN-FACING displays — wall-mounted screens that cooks and expediters use. These screens have ZERO navigation complexity. They show tickets and allow bumping. That's it.

KDS design is FUNDAMENTALLY different from server-facing POS:
- No menu. No payment. No table management.
- Large text (read from 3-6 feet away)
- Touch targets for gloved/wet hands (extra large)
- Time-critical: tickets that are late must SCREAM

TASK: Design and spec the **KDS Station View** and **Expo View**.

---

### Requirements:

1. **KDS Station View Layout**

   ```
   ┌──────────────────────────────────────────────────────────────────┐
   │ GRILL STATION              4 tickets · avg 5:12 · ▲ 2 priority  │
   ├──────┬──────┬──────┬──────┬──────┬──────┬──────┬────────────────┤
   │      │      │      │      │      │      │      │                │
   │ KT-  │ KT-  │ KT-  │ DELTA│ KT-  │      │      │    [empty     │
   │ 1087 │ 1088 │ 1089 │ !!!! │ 1090 │      │      │     slots]    │
   │      │      │      │      │      │      │      │                │
   │ T4   │ T2   │ Bar  │ T4   │ T6   │      │      │                │
   │ 8:23 │ 5:10 │ 2:34 │ 0:15 │ 0:02 │      │      │                │
   │      │      │      │      │      │      │      │                │
   │ items│ items│ items│ ADD  │ items│      │      │                │
   │      │      │      │      │      │      │      │                │
   │[BUMP]│[BUMP]│[BUMP]│[ACK] │[BUMP]│      │      │                │
   └──────┴──────┴──────┴──────┴──────┴──────┴──────┴────────────────┘
   ```

2. **Ticket Card Design (single card, ~200px wide on large display)**
   - Ticket number: 14px bold monospace
   - Table + Server: 12px, below ticket number
   - Timer: LARGE (24px monospace, color-coded):
     - Green: 0-8 min (on time)
     - Yellow: 8-12 min (getting slow)
     - Red: 12+ min (LATE — pulsing border)
     - Thresholds configurable per station
   - Timer bar: 4px strip below header, fills left-to-right, color matches timer
   - Items list:
     - Each item: 14px, bold
     - Modifiers: 12px, orange/amber, italic
     - Seat number: 10px, cyan badge
     - Per-item status: dot (pending=gray, cooking=orange, ready=green)
   - Delta tickets (ADD/VOID/MODIFY):
     - Red pulsing border
     - "DELTA" badge instead of ticket number
     - Red header background
     - ADD items prefixed with "*** ADD ***"
     - VOID items prefixed with "*** VOID ***" and strikethrough
   - Bump button: full-width at bottom, 64px tall, green "BUMP ✓"
   - Recall button: small, below bump, "RECALL ↩"

3. **Ticket Ordering**
   - Left-to-right, oldest first
   - New tickets slide in from right
   - Bumped tickets scale-out to left and disappear
   - Delta tickets for existing tables sort NEXT TO the original ticket
   - Recalled tickets re-appear at original position

4. **Station Header**
   - Station name (large, left-aligned)
   - Ticket count
   - Average completion time
   - Priority count (tickets over red threshold)
   - All-day count button → shows summary: "Strips: 4, Salmon: 3, Chicken: 2"

5. **Expo View (different from station view)**
   - Shows ALL tickets across ALL stations
   - Each ticket card shows per-item STATION readiness:
     - "Grill ✓ | Fry ⏳ | Sauté ✓" — which stations have bumped their items
   - Expo bumps the WHOLE ticket when all stations are ready
   - "Call Back" button → sends item back to station with alert
   - "Rush" button → marks ticket as priority across all stations

6. **Sound / Haptic Alerts**
   - New ticket: short chime (configurable tone)
   - Delta ticket: urgent double-chime
   - Red threshold crossed: persistent beep until acknowledged
   - All sounds configurable (on/off/volume per station)

7. **All-Day Summary (accessible from header)**
   - Counts of each item currently on open tickets
   - Grouped by category
   - Used by cooks to plan prep
   - Updates in real-time as tickets are bumped

8. **Multi-Station Layout (large wall display)**
   - Option to show 2 stations side-by-side on one screen
   - Horizontal split with station header per section
   - Independent scrolling per section

Deliver:
A) KDS Station component tree
B) Expo View component tree
C) Timer color-coding system with configurable thresholds
D) Ticket lifecycle animation spec (arrive → age → bump → gone)
E) Delta ticket visual treatment (must be IMPOSSIBLE to miss)
F) Accessibility: high-contrast mode for bright kitchen environments
G) Performance: rendering 20+ ticket cards at 60fps with real-time updates
```

---

## SESSION 22 — Split Checks + Merge UX

### Prompt

```
You are a Senior Product Designer + Staff Frontend Architect building the Oppsera F&B POS.

CONTEXT: Session 7 specified split check backend (by_seat, by_item, equal_split, custom_amount). This session designs the UX for splitting and merging checks — a high-stress, high-accuracy operation that servers perform under time pressure.

TASK: Design and spec the **Split Check** and **Merge Tab** UX.

---

### Requirements:

1. **Entry Point**
   - "Split" button in TabActionBar → opens SplitCheckPage as full-screen overlay
   - Tab must have 2+ items to split

2. **Split Mode Selector (top bar)**
   - Four mode buttons: [By Seat] [By Item] [Equal Split] [Custom Amount]
   - Default: "By Seat" (most common)
   - Mode switch resets the workspace

3. **By Seat Mode (default, most common)**
   - Auto-creates one check per seat with that seat's items
   - Workspace shows side-by-side check panels
   - Each check panel: seat label, items list, subtotal, tax, total
   - Shared items (not assigned to a seat) go to "Shared" panel
   - Drag shared items to a specific check
   - "Even Split Shared" button: distributes shared item cost equally

4. **By Item Mode**
   - All items shown in a left "source" panel
   - Multiple check panels on right (start with 2, + to add more)
   - Drag items from source to check panels
   - Item can only be on ONE check (moved, not copied)
   - Running totals update as items are moved

5. **Equal Split Mode**
   - Number selector: "Split into [2] [3] [4] [5] [Custom] checks"
   - Preview shows each check's amount
   - No item movement needed
   - Tax distributed proportionally

6. **Custom Amount Mode**
   - Keypad entry for each check's amount
   - "Remaining" display shows unallocated amount
   - Validation: sum of checks must equal tab total
   - Auto-calculate: button to evenly split the remaining

7. **Visual Design**
   - Check panels: card style, side-by-side horizontal scroll
   - Active check (being edited): elevated shadow, blue border
   - Completed checks (paid): green border, "PAID ✓" badge
   - Color-coded check numbers: Check 1 (blue), Check 2 (green), Check 3 (orange), Check 4 (purple)
   - Drag handles on items (small grip icon)
   - Drop zones highlight on drag-over

8. **Bottom Action Bar**
   - "Back to Tab" — cancel split, return to tab
   - "Validate Split" — confirms totals match, locks the split
   - "Proceed to Payment" — opens payment screen for first unpaid check
   - Check navigation: tabs for each check on payment screen

9. **Merge Tabs UX**
   - Accessed from Tab Header → "Merge" action
   - Select source tab (shows list of other open tabs at this table or nearby tables)
   - Preview merged tab with items from both
   - Confirm → items move, source tab closes
   - Conflict handling: if source tab has sent items, warn about kitchen coordination

Deliver:
A) SplitCheckPage component tree
B) Drag-and-drop interaction spec (touch-optimized: long-press to pick up, drag, release)
C) Split validation rules (totals must match, no orphan items)
D) State management: split state as local draft until "Validate" is pressed
E) Animation: item move (slide from source to target panel)
F) Edge cases: 1 item tabs (can't split), already-paid items, gift cards, discounts during split
```

---

## SESSION 23 — Payment + Tips UX

### Prompt

```
You are a Senior Product Designer + Staff Frontend Architect building the Oppsera F&B POS.

CONTEXT: Sessions 7-9 specified payment flows, pre-auth, tips, and tip pooling. This session designs the payment UX — the final step of every tab. Speed is critical: every second the payment screen is open is a second the table isn't turning.

TASK: Design and spec the **Payment Screen** and **Tip Prompt** UX.

---

### Requirements:

1. **Payment Screen Layout**

   ```
   ┌──────────────────────────────────────────────────────────────┐
   │ PAYMENT — Table 4 · Check 1 of 2                            │
   ├──────────────────────────┬───────────────────────────────────┤
   │                          │                                   │
   │   Check Summary          │   Tender Buttons                  │
   │                          │                                   │
   │   Caesar Salad    $14    │   ┌──────────┐  ┌──────────┐     │
   │   NY Strip        $48    │   │          │  │          │     │
   │   ─────────────────      │   │   CASH   │  │   CARD   │     │
   │   Subtotal:    $62.00    │   │          │  │          │     │
   │   Tax (8.5%):   $5.27    │   └──────────┘  └──────────┘     │
   │   ─────────────────      │   ┌──────────┐  ┌──────────┐     │
   │   TOTAL:       $67.27    │   │  GIFT    │  │  HOUSE   │     │
   │                          │   │  CARD    │  │  ACCT    │     │
   │   Applied:      $0.00    │   └──────────┘  └──────────┘     │
   │   REMAINING:   $67.27    │                                   │
   │                          │   [Comp] [Discount] [SvcCharge]   │
   │                          │                                   │
   ├──────────────────────────┴───────────────────────────────────┤
   │ [← Back to Tab]                    [Print Check] [Close Tab] │
   └──────────────────────────────────────────────────────────────┘
   ```

2. **Tender Buttons**
   - Large: minimum 80×80px (thumb-friendly)
   - Card: tap → triggers card reader, shows "Insert/Tap Card" modal
   - Cash: tap → cash amount keypad (with quick buttons: exact, $20, $50, $100)
   - Gift Card: tap → scan/swipe or manual entry
   - House Account: tap → customer search → select account
   - Custom tenders: configurable (employee meal, comp card, etc.)

3. **Cash Keypad**
   - Large numpad (64px buttons)
   - Quick amount buttons at top: [Exact] [$20] [$50] [$100]
   - Change calculation shown live as amount is entered
   - "Pay" button disabled until amount >= remaining

4. **Tip Prompt (after tender, before finalize)**
   - Customer-facing (flip screen or customer display):
     - Suggested tips: [18%] [20%] [22%] [Custom] [No Tip]
     - Dollar amounts shown below percentages
     - Custom → keypad for tip amount
   - Server-facing (bartender fast-close):
     - Tip entry after card runs: keypad with signed receipt reference
     - "Adjust Later" button for busy service (tip added during checkout)

5. **Split Payment (multi-tender on one check)**
   - After first tender applied, "Remaining" updates
   - Second tender button appears for remainder
   - Payment log shows: "Visa ****4521: $40.00 | Cash: $27.27"
   - Mix-and-match: card + cash, two cards, card + gift card

6. **Bartender Fast-Close**
   - Bar tab with pre-auth: "Close Tab" button in tab action bar
   - 1-tap flow: captures pre-auth amount, shows tip prompt, done
   - If total > pre-auth: shows "Amount exceeds pre-auth by $X — additional authorization needed"
   - Tip adjustment window: tips can be adjusted for 24-48 hours after close (configurable)

7. **Comp / Discount / Service Charge (secondary actions)**
   - Comp: select items → "Comp" → reason selector (manager, VIP, error) → requires manager PIN if over threshold
   - Discount: percentage or dollar amount → applies to check total or selected items
   - Service Charge: auto-applied based on settings (large party auto-grat) or manual add

8. **Receipt Options**
   - After payment: "Receipt?" modal
   - Options: [Print] [Email] [Text (V2)] [No Receipt]
   - Email: pull from customer profile or manual entry
   - Print: routes to receipt printer for this station

9. **Post-Payment**
   - Check shows "PAID ✓" badge
   - If split: next unpaid check auto-opens
   - If all checks paid: tab auto-closes, table status → "Paid"
   - Return to floor plan with table status updated

Deliver:
A) PaymentPage component tree
B) Tip prompt component (customer-facing and server-facing variants)
C) Cash keypad with change calculation logic
D) Multi-tender state machine
E) Bartender fast-close flow (step-by-step, minimize taps)
F) Error handling: card declined, partial payment failures, network issues during payment
G) Receipt routing logic (which printer, based on station/location)
```

---

## SESSION 24 — Manager + Host Overlays

### Prompt

```
You are a Senior Product Designer + Staff Frontend Architect building the Oppsera F&B POS.

CONTEXT: Manager and host actions overlay on top of existing screens. They are modal operations — triggered by specific actions, resolved, then dismissed. The backend has permissions, role-based access, and audit logging.

TASK: Design and spec all **Manager Overlays** and **Host Stand** components.

---

### Requirements:

1. **Manager Override Modal**
   - Triggered by: void after send, comp over threshold, 86 override, refund, discount over threshold
   - Flow: action button → "Manager Authorization Required" modal → PIN keypad → reason selector → confirm
   - PIN keypad: 10-digit pad, 48px buttons, masked input
   - Reason selector: dropdown with configurable reasons per action type
   - Success: action proceeds, audit log entry created
   - Failure: "Invalid PIN" shake animation, 3 attempts then lockout

2. **Transfer Table/Tab Modal**
   - Source: current server
   - Target: list of active servers (filtered by section if applicable)
   - Each server shows: name, current table count, open tab count
   - Confirm → tab server_user_id updates, floor plan updates, both servers notified

3. **Comp/Void Modal**
   - Two tabs: "Comp" and "Void"
   - Comp: select items → comp reason → manager PIN (if over threshold)
   - Void: select items → void reason → manager PIN (always required for sent items)
   - Comped items: show original price with "COMP" badge, price zeroed
   - Voided items: strikethrough, removed from kitchen (delta chit sent)

4. **Seat Guests Modal (from floor plan)**
   - Party size: large number pad (1-20)
   - Server assignment: auto (rotation) or manual select
   - Guest name (optional)
   - Special notes (optional): "Birthday", "VIP", "Allergy"
   - Confirm → table status changes, tab opens, server notified

5. **Host Stand View (full screen, host role)**
   - All tables across all rooms in a compact grid
   - Emphasis on availability + turn times
   - Server rotation queue: "Next up: Maria (2 tables) → James (3 tables)"
   - Cover balance: bar chart showing covers per server
   - Quick seat: tap available table → seat guests modal
   - Wait time estimator: based on avg turn time for each table size

6. **Manager Dashboard (full screen, manager role)**
   - Real-time KPIs: covers, revenue, avg check, table turns, labor cost
   - 86 Board: items currently 86'd with un-86 action
   - Alert Feed: long-open tabs (>2hr), large voids, walkouts, drawer alerts
   - Server Performance: covers per server, avg check per server, tip percentage
   - Close Batch launcher with pre-flight checks

7. **Waitlist Panel (V2 stub)**
   - Side panel on host stand view
   - Add party: name, size, phone, quoted wait
   - Queue with estimated wait times
   - Notify action (SMS V2)
   - Seat from waitlist → auto-fills seat guests modal

Deliver:
A) Component trees for each modal/overlay
B) Manager PIN challenge as reusable component (used across 5+ flows)
C) Permission matrix: which roles see which overlays
D) Notification spec: how is the target server notified of transfers?
E) Host rotation algorithm (configurable: round-robin, cover-balance, manual)
F) Manager dashboard data sources (which read models from Session 15)
```

---

## SESSION 25 — Real-Time State + Data Hooks

### Prompt

```
You are a Staff Frontend Architect + Senior Systems Engineer building the Oppsera F&B POS.

CONTEXT: Sessions 13 specified WebSocket channels, event fan-out, soft locking, and offline queue. This session designs the frontend state management and real-time data layer that powers every screen.

Every screen in the POS depends on real-time data. Two servers can look at the same table. The floor plan must update when a table is seated from another terminal. Kitchen tickets must appear instantly. This session is the INFRASTRUCTURE that makes all screens work.

TASK: Design and spec the **real-time state management and data hooks architecture**.

---

### Requirements:

1. **Real-Time Transport Hook**
   ```
   usePosRealtime({ locationId, terminalId })
   ```
   - WebSocket connection to `wss://api.oppsera.com/pos/realtime`
   - Subscribes to channels:
     - `tables.{locationId}` — table status changes
     - `tabs.{locationId}` — tab opens, closes, modifications
     - `kitchen.{locationId}` — ticket status changes
     - `payments.{locationId}` — payment completions
     - `alerts.{locationId}` — 86 board, manager alerts
   - Reconnection: exponential backoff (1s, 2s, 4s, 8s, max 30s)
   - Heartbeat: ping every 30s, disconnect if no pong in 10s
   - Event ordering: sequence number per entity, client reorders if needed
   - Dedup: event_id + idempotency, client ignores already-processed events
   - Connection status exposed: `connected | reconnecting | disconnected`

2. **Domain Hooks (one per data domain)**

   `useFloorLayout(roomId)` — static layout (tables, positions, sections)
   - Fetches once, caches, refetches on room edit
   - Returns: `{ tables, sections, isLoading, error }`

   `useTableStatuses(locationId)` — live table statuses
   - Initial fetch + WebSocket updates
   - Granular: only re-renders components for CHANGED tables
   - Returns: `{ statuses: Map<tableId, status>, getStatus(tableId) }`

   `useTab(tabId)` — single tab with all lines, seats, courses
   - Full fetch on mount + WebSocket delta updates
   - Optimistic: local mutations applied immediately, rolled back on error
   - Version tracking: CAS pattern, 409 → refetch → retry
   - Returns: `{ tab, lines, seats, courses, isLoading, mutate, version }`

   `useOrderDraft(tabId)` — unsent items staging area
   - Pure client-side state (not persisted to server until "Send")
   - Items accumulate as server taps menu
   - "Send" promotes draft → server → kitchen ticket
   - Auto-save to localStorage as backup (30-minute expiry)
   - Returns: `{ draftLines, addItem, removeItem, updateModifiers, send, clear }`

   `useMenu(locationId)` — menu tree with 86 status
   - Cached aggressively (menu changes rarely)
   - 86 updates via WebSocket (instant)
   - Returns: `{ departments, categories, items, quickItems, isItem86d(itemId) }`

   `usePayments(tabId)` — payment state for a tab
   - Tenders applied, remaining balance, tip status
   - Returns: `{ payments, remaining, tipStatus, applyTender, adjustTip }`

   `useTabLock(tabId)` — soft lock for concurrent editing
   - Acquires lock on tab open, heartbeat every 15s, releases on leave
   - If locked by another: shows "Edited by Maria on Terminal 3" banner
   - Manager force-break: PIN → takes over lock
   - Returns: `{ isLocked, lockedBy, acquireLock, releaseLock, forceBreak }`

   `useKitchenTickets(stationId)` — for KDS screens
   - Live ticket list with real-time bumps
   - Returns: `{ tickets, bumpItem, bumpTicket, recallTicket }`

   `usePermissions(userId)` — role-based permission checks
   - Cached on login, refreshed on role change
   - Returns: `{ can(action), requiresOverride(action), role }`

   `useManagerOverride()` — reusable PIN challenge
   - Returns: `{ challenge(action, callback), isOpen, close }`

3. **Optimistic Update Pattern**
   - Add item to tab: appears in UI instantly → API call → if fail, roll back + toast
   - Bump kitchen ticket: bumped immediately → API call → if fail, un-bump + toast
   - Table status: updated immediately → API call → if fail, revert + toast
   - ALL mutations use version-based CAS: send current version, expect 409 on conflict

4. **Conflict Resolution UI**
   - 409 response → refetch latest state → show diff to user
   - Simple conflicts (item added by another server): auto-merge, toast "Maria added 2 items"
   - Complex conflicts (void by another server): modal with options

5. **Offline Behavior (V1 minimal)**
   - Detect offline: WebSocket disconnect + fetch failures
   - Top banner: "OFFLINE — Orders will queue" (red, persistent)
   - Allowed offline: view floor, view tabs, add items (queued)
   - Blocked offline: payments, voids, close batch (show disabled state + reason)
   - On reconnect: replay queue in order, present conflicts

6. **Performance Requirements**
   - Floor plan with 50 tables: full render < 100ms
   - Single table status update: re-render only that TableNode (< 16ms)
   - Tab with 30 items: scroll at 60fps
   - Menu with 500 items: virtualized grid, search results < 100ms
   - WebSocket message processing: < 5ms per event

Deliver:
A) Hook API signatures with full TypeScript types
B) WebSocket message schema (event types, payloads)
C) Optimistic update + rollback pattern (code-level pseudocode)
D) Conflict resolution decision tree
E) Offline queue data structure and reconciliation algorithm
F) Performance benchmarks and measurement strategy
```

---

## SESSION 26 — Component Architecture + Shared Library

### Prompt

```
You are a Staff Frontend Architect building the Oppsera F&B POS.

CONTEXT: Sessions 17-25 designed all screens and hooks. This session defines the production component architecture: what's shared, what's module-specific, folder structure, routing, and testing strategy.

TASK: Define the **complete component architecture** for the F&B POS frontend.

---

### Requirements:

1. **Package Structure**
   ```
   packages/
     ui/                          # @oppsera/ui — shared primitives
       Button, IconButton, Chip, Pill, Tabs, Drawer, Modal,
       Toast, List, VirtualList, Keypad, PinEntry, StatusBadge,
       Timer, SearchInput, NumPad, DropZone
     pos-ui/                      # @oppsera/pos-ui — POS-specific components
       TableNode, SeatRail, OrderTicket, CourseSection, OrderLine,
       TenderGrid, SplitWorkspace, TicketCard, ModifierPicker

   apps/web/modules/fnb-pos/
     screens/
       FloorHomePage.tsx
       TabPage.tsx
       ActiveTabsPage.tsx
       SplitCheckPage.tsx
       PaymentPage.tsx
       KDSStationPage.tsx
       ExpoPage.tsx
       HostStandPage.tsx
       ManagerDashboardPage.tsx
       CloseBatchPage.tsx
       SettingsPage.tsx
     components/
       floor/ (FloorCanvas, TableNode, RoomTabs, SectionOverlay)
       tab/ (TabHeader, SeatRail, OrderTicket, CourseSection, OrderLine)
       menu/ (MenuPanel, DeptTabs, CategoryTabs, ItemGrid, ModifierDrawer, QuickItems)
       kitchen/ (TicketCard, DeltaBadge, BumpButton, AllDaySummary, TimerBar)
       payment/ (TenderButtons, CashKeypad, TipPrompt, ReceiptOptions)
       manager/ (OverrideModal, TransferModal, CompVoidModal, SeatGuestsModal)
       shared/ (TopBar, BottomDock, ContextSidebar)
     hooks/
       usePosRealtime.ts
       useFloorLayout.ts
       useTableStatuses.ts
       useTab.ts
       useOrderDraft.ts
       useMenu.ts
       usePayments.ts
       useTabLock.ts
       useKitchenTickets.ts
       usePermissions.ts
       useManagerOverride.ts
     store/
       posStore.ts (Zustand or similar — session-level state)
     types/
       pos.types.ts (Tab, OrderLine, TableStatus, KitchenTicket, etc.)
   ```

2. **Route Map**
   ```
   /pos                          → redirect to /pos/floor
   /pos/floor                    → FloorHomePage
   /pos/floor/:roomId            → FloorHomePage (specific room)
   /pos/tabs                     → ActiveTabsPage
   /pos/tab/:tabId               → TabPage
   /pos/tab/:tabId/split         → SplitCheckPage
   /pos/tab/:tabId/pay           → PaymentPage
   /pos/tab/:tabId/pay/:checkId  → PaymentPage (specific check)
   /pos/kds/:stationId           → KDSStationPage
   /pos/expo                     → ExpoPage
   /pos/host                     → HostStandPage
   /pos/manager                  → ManagerDashboardPage
   /pos/close                    → CloseBatchPage
   /pos/settings/*               → SettingsPage (sub-routes)
   ```

3. **Shared vs Module-Specific Decision Rules**
   - `@oppsera/ui`: used by ALL modules (retail, restaurant, back-office)
   - `@oppsera/pos-ui`: used by BOTH retail and restaurant POS
   - `fnb-pos/components`: ONLY restaurant POS (course sections, KDS, expo, seat rail)
   - Decision criteria: if retail POS would also use it → pos-ui. If restaurant-only → fnb-pos.

4. **State Management Architecture**
   - Server state: React Query (TanStack Query) for all API data
   - Real-time: WebSocket events invalidate React Query cache selectively
   - Local UI state: Zustand store for:
     - Current user session
     - Active terminal config
     - Draft order state
     - Split check workspace
     - UI preferences (sidebar open, grid columns)
   - NO Redux. Too much boilerplate for a POS app.

5. **Testing Strategy**
   - E2E (Playwright): 6 critical flows
     1. Seat guests → open tab → add items → send to kitchen → pay → close
     2. Bar tab with pre-auth → close → tip adjust
     3. Split check by seat → pay each check
     4. Void item after send (delta chit)
     5. Manager override (comp, void, transfer)
     6. Close batch → reconcile → post
   - Component tests (Vitest + Testing Library): all interactive components
   - Hook tests (Vitest): optimistic update + rollback scenarios
   - Visual regression: Chromatic or similar for design system components
   - Performance tests: Lighthouse CI for key screens

Deliver:
A) Complete folder structure
B) Component dependency graph (which components use which hooks)
C) Shared vs. module boundary decisions with rationale
D) Route map with auth guards and role checks
E) State management diagram (React Query + Zustand + WebSocket flow)
F) Testing matrix: what's tested at each level
```

---

## SESSION 27 — Responsive Adaptations + Handheld Mode

### Prompt

```
You are a Senior Product Designer + Staff Frontend Architect building the Oppsera F&B POS.

CONTEXT: The primary target is iPad landscape (POS terminal). But servers also use handheld tablets, and KDS runs on large wall displays. This session adapts all screens across breakpoints.

TASK: Define the **responsive design system** for all breakpoints.

---

### Requirements:

1. **Breakpoints**
   - Handheld: < 640px (iPhone, small Android)
   - Small tablet: 640–834px (iPad Mini portrait)
   - Tablet landscape: 834–1194px (iPad Air/Pro landscape — PRIMARY)
   - Large tablet/desktop: > 1194px (iPad Pro 12.9" landscape, desktop)
   - KDS display: 1920×1080 (fixed, wall-mounted, no scroll)

2. **Floor Plan — Handheld Mode**
   - Room tabs become horizontal scroll at top
   - Table grid becomes vertical list (table cards, not positioned)
   - Each card: table#, status color, server, party, timer, total
   - Tap card → tab page
   - Sidebar → becomes bottom sheet
   - Bottom dock → sticky footer with 3 core actions

3. **Tab Page — Handheld Mode**
   - 3-pane collapses to single pane with swipe/tab navigation:
     - Tab 1: Order ticket (center pane becomes full screen)
     - Tab 2: Menu (right pane becomes full screen with "Add to Seat X" sticky footer)
     - Tab 3: Tab summary
   - Seat rail: horizontal scroll strip at top of order ticket
   - Course sections: collapsible accordion
   - Action bar: bottom sheet with most-used actions visible

4. **Payment — Handheld Mode**
   - Check summary collapses to total-only header
   - Tender buttons: 2-column grid, full width
   - Tip prompt: full-screen overlay
   - Keypad: full-screen numpad

5. **KDS — Large Display Mode**
   - No scroll. All tickets visible or paginated.
   - Maximum 8 tickets visible at once
   - Ticket cards: wider (240px), larger text (16-18px items)
   - Timer: 32px for readability from 6+ feet
   - Bump button: full card width, 80px tall
   - Touch targets: 72px minimum (gloved hands)

6. **Desktop Mode (manager dashboard)**
   - Manager dashboard: multi-column KPI cards
   - Floor plan: larger canvas, zoom controls
   - Settings: standard sidebar + content layout
   - Active tabs list: data table with sorting/filtering

7. **Orientation Handling**
   - iPad portrait: supported but not primary
   - Tab page in portrait: menu panel becomes slide-out drawer from right
   - Floor plan in portrait: table list mode (like handheld but with more room)
   - KDS: landscape locked

Deliver:
A) Breakpoint-by-breakpoint layout specs for each screen
B) Component adaptation patterns (3-pane → tabs, sidebar → bottom sheet, etc.)
C) Touch target adjustments per breakpoint
D) CSS container query strategy (vs media queries)
E) Orientation lock recommendations per screen
F) Testing matrix: which breakpoints need visual regression tests
```

---

## SESSION 28 — Integration Testing Flows + Performance Audit

### Prompt

```
You are a Staff Frontend Architect + QA Lead building the Oppsera F&B POS.

CONTEXT: Sessions 17-27 delivered the complete UX/UI system. This final session validates everything works together and meets performance targets.

TASK: Define the **integration test suite** and **performance audit criteria**.

---

### Requirements:

1. **Critical E2E Flows (Playwright)**

   Flow 1: Full Dine-In Service
   - Login via PIN → floor plan loads → tap available table → seat guests (party 4)
   - Tab opens → select Seat 1 → add Caesar Salad → select Seat 2 → add Calamari
   - Set Course 2 → add NY Strip (select Medium, sub mashed) → add Grilled Salmon
   - Send Course 1 → verify kitchen ticket appears on KDS
   - Fire Course 2 → verify delta ticket
   - KDS: bump all items → verify expo readiness
   - Split check by seat → pay Check 1 with card → pay Check 2 with cash
   - Verify tab closed, table status → Paid → Mark dirty → Mark clean → Available
   - Total test time target: < 120 seconds automated

   Flow 2: Bar Tab with Pre-Auth
   - Open non-table tab → enter customer name → swipe card for pre-auth
   - Add 3 drinks (1-tap each) → send to bar
   - Add 2 more drinks later → send
   - Close tab → capture pre-auth → tip prompt → adjust tip after 2 hours
   - Verify tip adjustment window enforcement

   Flow 3: Manager Override Chain
   - Server attempts void of sent item → override modal → manager PIN → select reason
   - Verify delta VOID ticket on KDS
   - Server attempts comp over threshold → override modal → manager PIN
   - Verify audit log entries

   Flow 4: Split + Multi-Tender
   - Tab with 6 items across 3 seats → split by seat → 3 checks
   - Check 1: card payment
   - Check 2: cash payment with change
   - Check 3: gift card partial + card remainder
   - Verify all tenders recorded, tab closed

   Flow 5: Close Batch
   - Manager opens close batch → verify all open items listed
   - Force-close any open tabs
   - Enter cash count → verify over/short calculation
   - Approve server checkouts → post to GL
   - Verify batch locked, GL entries created

   Flow 6: Real-Time Multi-Terminal
   - Terminal A: seat table, start order
   - Terminal B: verify table status updated on floor plan
   - Terminal A: send to kitchen
   - KDS terminal: verify ticket appears
   - Terminal B: attempt to edit same tab → verify lock warning
   - KDS: bump ticket → verify expo status → verify server notification

2. **Performance Audit Criteria**

   Floor Plan:
   - Initial load: < 2s (cold), < 500ms (cached)
   - 50 tables rendering: < 100ms
   - Single table update: < 16ms (one frame)
   - WebSocket event → UI update: < 100ms

   Tab Page:
   - Open tab: < 500ms
   - Add item (no mods): < 100ms perceived
   - Add item (with mods): modifier drawer in < 200ms
   - Send to kitchen: < 300ms round-trip feedback

   Menu:
   - Search results: < 150ms after debounce
   - Department switch: < 100ms
   - 500 items grid: smooth 60fps scroll (virtualized)

   KDS:
   - New ticket appear: < 200ms from send
   - Bump: < 100ms feedback
   - 20 tickets on screen: 60fps scroll/reorder

   Payment:
   - Payment screen open: < 300ms
   - Card tender → result: dependent on processor (show loading state)
   - Tip calculation: instant (client-side)

3. **Accessibility Audit**
   - All interactive elements: keyboard navigable
   - Status colors: not sole indicator (always paired with text/icon)
   - Screen reader: table status read as "Table 4, seated, 3 guests, server Maria, 24 minutes"
   - Focus management: modal traps focus, returns on close
   - Motion: respects `prefers-reduced-motion`
   - Contrast: WCAG AA minimum (4.5:1 text, 3:1 UI components)

4. **Error Scenario Tests**
   - Network disconnect mid-order → offline banner → queue items → reconnect → sync
   - Card reader timeout → retry prompt → manual entry fallback
   - WebSocket reconnect → event replay → no duplicate items
   - Concurrent void by two servers → conflict resolution modal
   - Kitchen printer offline → alert to manager → manual ticket option

Deliver:
A) Playwright test specs for all 6 flows (step-by-step with assertions)
B) Performance benchmark suite (Lighthouse CI config + custom timing)
C) Accessibility checklist per screen
D) Error scenario test matrix
E) CI/CD integration notes: when do these tests run? (PR check vs nightly)
F) Load testing: simulated 10 terminals + 3 KDS stations + 1 expo hitting same location
```

---

## Post-Session Checklist (After All 28 Sessions)

After completing Sessions 17-28, validate:

- [ ] Design tokens file created (CSS custom properties)
- [ ] All 10 screens fully specced (component tree + props + states)
- [ ] All hooks defined with TypeScript signatures
- [ ] Route map finalized with auth guards
- [ ] Component library packages defined (@oppsera/ui, @oppsera/pos-ui)
- [ ] Folder structure matches monorepo conventions
- [ ] 6 E2E flows specced with step-by-step assertions
- [ ] Performance targets defined for every screen
- [ ] Responsive specs for 5 breakpoints
- [ ] Accessibility audit checklist complete
- [ ] KDS/Expo optimized for large display + gloved interaction
- [ ] Offline behavior documented
- [ ] Real-time conflict resolution UX defined
- [ ] Manager override flow reusable across all contexts
- [ ] Quick service mode adaptation documented (Session 27 appendix)

---

## Key Architectural Decisions (Reference)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Primary target | iPad landscape | 90%+ of restaurant POS terminals |
| Theme | Dark only | Industry standard — reduces glare in dim restaurants |
| State management | React Query + Zustand | Server state separate from UI state, no Redux boilerplate |
| Real-time | WebSocket + event-driven | Sub-200ms updates required for floor plan and KDS |
| Menu rendering | Virtualized grid | Menus with 200-500 items need smooth scroll |
| Touch targets | 48px min (64px for payments) | Exceeds Apple HIG 44px, accounts for speed + stress |
| Fonts | System stack | No web font loading latency on POS hardware |
| Animations | < 200ms or 0ms | Operational speed > visual delight |
| Offline | V1: queue adds, block payments | Safety first — never risk payment errors offline |
| Testing | Playwright E2E + Vitest unit | Critical flows automated, component tests for regressions |
