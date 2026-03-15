import { db, aiSupportAnswerCards } from '@oppsera/db';

// ─── Batch 3: 45 KDS (Kitchen Display System) Training Answer Cards ─────────
// Grounded in actual OppsEra KDS codebase. Inserted as 'draft' for admin review.

const TRAINING_CARDS_BATCH3 = [
  // ── 1. Order not showing on KDS ──
  {
    slug: 'kds-troubleshoot-order-not-showing',
    moduleKey: 'kds',
    route: '/kds',
    questionPattern:
      'order not showing on KDS|order missing from KDS|KDS not showing order|order didn\'t appear on KDS|why didn\'t this order show up on the KDS|KDS missing ticket|ticket not on KDS|order not on kitchen display',
    approvedAnswerMarkdown: `## Why Didn't This Order Show Up on the KDS?

### Most Common Causes

1. **Order was not sent to KDS** — The POS has a **Send to KDS** button. If the order was saved but not explicitly sent, it won't appear. For F&B tabs, the course must be fired (dispatched) to the kitchen.

2. **No routing rules match the items** — Each item is routed to a station based on the routing engine's priority cascade:
   - Item-level rule → Category rule → Sub-department rule → Department rule → Modifier rule → Fallback (first active non-expo station)
   - If no rules match AND no fallback station exists, items are silently unrouted.

3. **Station is paused** — If the station has **Pause Receiving** enabled, it is skipped during routing. Check station settings.

4. **Order type filter mismatch** — Stations can restrict which order types they accept (dine-in, takeout, delivery, etc.). If the order type doesn't match the station's \`allowedOrderTypes\`, items won't route there.

5. **Wrong location** — The KDS screen may be viewing a different location than where the order was placed. Check the location selector at the top of the KDS screen.

6. **Items are not food or beverage** — Only items with \`itemType\` of \`food\` or \`beverage\` are sent to the KDS. Retail merchandise items are excluded.

### How to Diagnose
- Go to **KDS** → **Order Status** to see the send tracking history
- Look for failed or orphaned sends (shown in the **Needs Attention** tab)
- Check **KDS Settings** → **Routing Rules** to verify item routing
- Check **KDS Settings** → **Diagnostics** for routing audit

### If the Order Was Already Sent
If the order was sent but isn't visible, the ticket may have been auto-cleared (stale ticket cleanup) or manually cleared. Check the **History** tab on the station view.`,
  },

  // ── 2. KDS not updating in real time ──
  {
    slug: 'kds-troubleshoot-not-updating-realtime',
    moduleKey: 'kds',
    route: '/kds',
    questionPattern:
      'KDS not updating|KDS not refreshing|KDS screen not updating in real time|KDS stuck|KDS not showing new orders|KDS delayed|KDS lag|KDS not live|real time KDS|KDS refresh issue',
    approvedAnswerMarkdown: `## Why Is the KDS Screen Not Updating in Real Time?

### How KDS Updates Work
The KDS uses a **dual update mechanism**:
1. **Polling** — The KDS screen polls the server every **8 seconds** for updated ticket data
2. **Realtime broadcast** — When a ticket is created, bumped, or modified, a broadcast signal triggers an immediate refresh on all KDS screens for that tenant

### Common Causes of Delayed Updates

1. **Internet connection** — If the device's connection is slow or intermittent, polls may fail. The KDS uses exponential backoff on failures (5s → 10s → 20s → 40s → 60s max).

2. **Tab is in background** — When the browser tab is hidden (minimized or switched), polling **pauses** to save resources. It resumes with an immediate fetch when the tab becomes visible again. Keep the KDS tab in the foreground.

3. **Broadcast missed** — The realtime broadcast is supplementary. If it's missed (network blip), the next poll cycle (within 8 seconds) will catch up.

4. **Browser performance** — On older or low-powered devices, the browser may throttle background JavaScript. Use a dedicated device for KDS.

### Troubleshooting
- Refresh the browser page to force a reconnect
- Check the device's internet connection
- Ensure the KDS browser tab is in the **foreground** and not minimized
- If using a tablet, disable power-saving or battery optimization for the browser app`,
  },

  // ── 3. Send order to specific station ──
  {
    slug: 'kds-howto-send-to-specific-station',
    moduleKey: 'kds',
    route: '/kds',
    questionPattern:
      'send order to specific KDS station|send to specific station|route to station|how do I send an order to a specific KDS station|choose which station|target a station|direct order to station',
    approvedAnswerMarkdown: `## How Do I Send an Order to a Specific KDS Station?

### Automatic Routing (Default)
Orders are automatically routed to stations based on **routing rules**. You don't manually pick a station — the routing engine assigns items to the correct station based on:

1. **Item-level rules** — Route a specific catalog item to a specific station
2. **Category rules** — Route all items in a category (e.g., "Desserts") to a station
3. **Sub-department rules** — Route by sub-department
4. **Department rules** — Route all items in a department (e.g., "Hot Kitchen") to a station
5. **Modifier rules** — Route items with a specific modifier to a station
6. **Fallback** — If no rules match, the item goes to the first active non-expo station

### Setting Up Routing Rules
1. Go to **KDS Settings** → **Routing Rules**
2. Click **New Rule**
3. Configure:
   - **Station** — which station receives the items
   - **Rule type** — item, category, sub-department, department, or modifier
   - **Target** — the specific item/category/department to match
   - **Priority** — higher number wins when multiple rules match
   - **Conditions** (optional) — restrict by order type, channel, or time of day
4. Save

### Example Setup
- "Grill Station" — department rule for "Hot Kitchen" items
- "Salad Station" — category rule for "Salads" and "Cold Apps"
- "Bar" — department rule for "Beverages"
- "Dessert Station" — category rule for "Desserts"

### Important
- **Expo stations** are excluded from routing — they show ALL tickets for monitoring
- Rules use **AND** logic for conditions (order type + channel + time must all match)
- Items with no matching rule fall back to the first active non-expo station`,
  },

  // ── 4. Know if order was successfully sent ──
  {
    slug: 'kds-howto-verify-send-success',
    moduleKey: 'kds',
    route: '/kds/order-status',
    questionPattern:
      'order successfully sent to KDS|verify KDS send|confirm KDS delivery|how do I know if an order was successfully sent to the KDS|KDS send status|was my order sent|did the order go through to KDS',
    approvedAnswerMarkdown: `## How Do I Know If an Order Was Successfully Sent to the KDS?

### KDS Order Status Screen
Go to **KDS** → **Order Status** to see the full send tracking history.

Each send is tracked with a status:
- **Queued** — Send is queued for delivery
- **Sent** — Successfully sent to the station
- **Delivered** — Confirmed delivered to the station
- **Displayed** — Confirmed visible on the KDS screen
- **Cleared** — Ticket was handled and cleared
- **Failed** — Send failed (see error details)
- **Orphaned** — Send was lost or unresolvable

### Tabs on the Order Status Screen
- **Active** — Currently queued, sent, delivered, or displayed sends
- **Needs Attention** — Failed or orphaned sends that need action
- **History** — Cleared, deleted, or completed sends

### Send Tracking Details
Click any send to see:
- Send type (initial, retry, manual resend, fire course, recall, reroute)
- Station name and ID
- Timestamp of each status transition
- Error details (if failed)
- Link to prior send (if this is a retry)

### From the POS
After pressing **Send to KDS**, the POS will show a success or error response. If the send fails, you'll see an error message with the specific reason.

### Dispatch Attempts
Every dispatch attempt (success or failure) is logged to the \`fnb_kds_dispatch_attempts\` table for full traceability.`,
  },

  // ── 5. Items missing from KDS ticket ──
  {
    slug: 'kds-troubleshoot-items-missing',
    moduleKey: 'kds',
    route: '/kds',
    questionPattern:
      'items missing from KDS ticket|KDS ticket missing items|some items not on KDS|partial order on KDS|why are some items missing from the KDS ticket|incomplete ticket KDS|not all items showing',
    approvedAnswerMarkdown: `## Why Are Some Items Missing from the KDS Ticket?

### Common Causes

1. **Items are not food or beverage** — Only items with \`itemType\` of \`food\` or \`beverage\` are sent to the KDS. Retail merchandise, gift cards, and service items are excluded automatically.

2. **Items routed to a different station** — The routing engine may have sent different items to different stations. Check other station screens — the "missing" items may be on a different prep station's display.

3. **Ghost-send guard** — If the same order is sent to KDS multiple times, items that were already sent in a previous dispatch are excluded to prevent duplicates. This is intentional.

4. **Course not yet fired** — In F&B tab mode, items belong to courses. Only the fired course's items are dispatched. Other courses remain pending until explicitly fired.

5. **Routing rule excluded the item** — A routing rule with an order type or time condition may have excluded certain items. Check **KDS Settings** → **Routing Rules**.

6. **Station paused** — If the target station for certain items has **Pause Receiving** enabled, those items are skipped.

### How to Check
- Open the order in the POS to see all line items
- Check **KDS** → **Order Status** to see which items were included in the dispatch
- Check other station screens for the missing items
- Review **KDS Settings** → **Diagnostics** for routing details`,
  },

  // ── 6. Same order appeared twice ──
  {
    slug: 'kds-troubleshoot-duplicate-order',
    moduleKey: 'kds',
    route: '/kds',
    questionPattern:
      'same order appeared twice on KDS|duplicate order KDS|order showing twice|KDS duplicate ticket|why did the same order appear twice|double order KDS|repeated order KDS',
    approvedAnswerMarkdown: `## Why Did the Same Order Appear Twice on the KDS?

### How Duplicates Are Prevented
OppsEra uses **idempotency keys** to prevent duplicate KDS tickets. Each dispatch creates a unique key per order+station combination. If the same dispatch is attempted again, the idempotency check blocks the duplicate.

### When Legitimate "Duplicates" Appear

1. **Resend** — A staff member manually resent the order to the KDS (via KDS Order Status → Retry, or Resend button). This creates a new ticket intentionally.

2. **Different courses** — In F&B tab mode, each fired course creates its own set of tickets. Course 1 and Course 2 from the same tab are separate dispatches — not duplicates.

3. **Modified order** — If an order was modified after the initial send, a re-send may create new tickets for the changed items.

4. **Event consumer + manual send** — The system has two dispatch paths: manual (Send to KDS button) and event-driven (\`order.placed.v1\` consumer). The idempotency key should prevent both from creating tickets, but if the key format differs, both could fire. Check KDS Order Status for multiple send entries.

### How to Handle
- **Clear** the duplicate ticket from the KDS (bump or void it)
- If duplicates happen repeatedly, check **KDS** → **Order Status** to see the send type (initial vs. retry vs. manual_resend) and identify the source`,
  },

  // ── 7. Bump / complete an order ──
  {
    slug: 'kds-howto-bump-complete-order',
    moduleKey: 'kds',
    route: '/kds',
    questionPattern:
      'bump order KDS|complete order KDS|clear order KDS|how do I bump or complete an order on the KDS|mark order done KDS|finish order KDS|KDS bump button',
    approvedAnswerMarkdown: `## How Do I Bump or Complete an Order on the KDS?

### Bumping Individual Items
1. On the KDS screen, find the ticket
2. Tap an individual item to mark it as **Ready**
3. The item changes appearance to indicate it's been completed
4. The UI updates optimistically (instant feedback) with a server sync 600ms later

### Bumping an Entire Ticket
1. Tap the **Bump** button on the ticket card (or use the bump bar shortcut)
2. All active items on that ticket at your station are marked **Ready**
3. The ticket moves to the history view

### Prep Station vs. Expo Behavior
- **Prep station bump** — Marks items as \`ready\` and ticket status as \`ready\`
- **Expo station bump** — Marks items as \`served\` and ticket status as \`served\` (final state)

### Auto-Bump
If the station has **Auto-bump on all ready** enabled in settings, the ticket automatically bumps to \`ready\` when the last item is marked ready — no manual bump needed.

### Bump Bar Support
KDS supports bump bar profiles with configurable key mappings for hands-free operation. Configure bump bar shortcuts in **KDS Settings** → **Bump Bar Profiles**.`,
  },

  // ── 8. Recall / un-bump ──
  {
    slug: 'kds-howto-recall-unbump',
    moduleKey: 'kds',
    route: '/kds',
    questionPattern:
      'recall order KDS|un-bump order|undo bump KDS|how do I recall or un-bump an order|bring back bumped order|KDS recall|undo completed order|unbump KDS|bring order back to KDS',
    approvedAnswerMarkdown: `## How Do I Recall or Un-bump an Order?

### Recall from History
1. On the KDS screen, switch to the **History** view (toggle at top of screen)
2. Find the bumped ticket
3. Tap the **Recall** button on the ticket
4. A dialog prompts you for a **reason** (e.g., "Wrong order", "Needs remake")
5. Confirm — the item moves back to \`pending\` status and reappears on the live KDS view

### Three Related Operations

| Action | What It Does | Use Case |
|--------|-------------|----------|
| **Recall** | Moves a \`ready\`/\`served\` item back to \`pending\` | Bumped by mistake |
| **Refire** | Resets an item to be remade (back to \`pending\`/\`cooking\`) | Item dropped, wrong order |
| **Callback** | Calls back an item from expo to prep | Expo bumped but kitchen needs to redo |

### How It Works
- Each recall/refire operation requires a **reason** (captured in the event log for audit)
- The item reappears on the live KDS view at the same station
- All three operations are tracked in the send event history

**Permission required:** \`kds.refire\``,
  },

  // ── 9. Route different items to different stations ──
  {
    slug: 'kds-howto-route-items-to-stations',
    moduleKey: 'kds',
    route: '/kds',
    questionPattern:
      'route different items to different KDS stations|route items to stations|KDS routing rules|how do I route different menu items to different KDS stations|item routing KDS|assign items to stations',
    approvedAnswerMarkdown: `## How Do I Route Different Menu Items to Different KDS Stations?

### Setting Up Routing Rules
1. Go to **KDS Settings** → **Routing Rules**
2. Create rules for each station. The routing engine checks rules in this priority order:

| Priority | Rule Type | Example |
|----------|-----------|---------|
| Highest | **Item** | "Wagyu Steak" → Grill Station |
| 2 | **Category** | "Salads" category → Cold Station |
| 3 | **Sub-department** | "Appetizers" sub-dept → Prep Station |
| 4 | **Department** | "Hot Kitchen" dept → Main Line |
| 5 | **Modifier** | "Gluten Free" modifier → Allergen Station |
| Lowest | **Fallback** | Everything else → first active non-expo station |

### Rule Conditions (Optional Filters)
Each rule can optionally be restricted by:
- **Order type** — Only apply for dine-in, takeout, delivery, etc.
- **Channel** — Only apply for specific order channels
- **Time of day** — Only apply during a time window (e.g., 22:00–06:00 for late-night menu)

All conditions use AND logic — all specified conditions must match.

### Priority Within Same Type
If two rules have the same type (e.g., both are category rules), the one with the higher **priority number** wins.

### Tips
- Start with department-level rules for broad routing, then add category or item rules for exceptions
- Use the **Diagnostics** tool in KDS Settings to test routing before going live
- Expo stations are automatically excluded from routing — they monitor all stations`,
  },

  // ── 10. Expo vs kitchen prep ──
  {
    slug: 'kds-howto-setup-expo-vs-prep',
    moduleKey: 'kds',
    route: '/kds',
    questionPattern:
      'expo vs kitchen prep|expo station KDS|expediter screen|how do I set up expo versus kitchen prep screens|KDS expo setup|expedition station|pass window KDS|expo vs prep station',
    approvedAnswerMarkdown: `## How Do I Set Up Expo Versus Kitchen Prep Screens?

### Station Types

| Type | Purpose | Routing |
|------|---------|---------|
| **Prep** | Kitchen staff work stations (grill, cold, fry, etc.) | Items are routed here by routing rules |
| **Expo** | Expediter/pass window — monitors ALL stations | Items are NEVER routed to expo; it reads from all prep stations |
| **Bar** | Bar prep station | Same as prep, but typed separately for reporting |

### How Expo Works
- The expo screen shows **all active tickets across all prep stations** for the location
- Items appear on expo as soon as they're visible on any prep station
- Bumping from expo marks items as \`served\` (final state), not just \`ready\`
- Expo is the last checkpoint before food leaves the kitchen

### Setting Up
1. Go to **KDS Settings** → **Stations**
2. Create your **prep stations** first (e.g., Grill, Cold, Fry, Dessert)
3. Create an **expo station** with type = \`expo\`
4. Optionally link prep stations to the expo using the \`supervisedByExpoId\` setting

### Supervised Stations
Setting \`supervisedByExpoId\` on a prep station means that station's tickets flow through the linked expo for final approval before being marked \`served\`.

### Show Other Station Items
Enable \`showOtherStationItems\` on a station to display items from other stations on the same ticket — useful for assembly-line awareness (e.g., expo sees what each station is working on).`,
  },

  // ── 11. Orders from wrong terminal or venue ──
  {
    slug: 'kds-troubleshoot-wrong-terminal-venue',
    moduleKey: 'kds',
    route: '/kds',
    questionPattern:
      'KDS showing orders from wrong terminal|KDS wrong venue|KDS wrong location|why is the KDS showing orders from the wrong terminal or venue|KDS location mismatch|KDS wrong restaurant|orders from other location on KDS',
    approvedAnswerMarkdown: `## Why Is the KDS Showing Orders from the Wrong Terminal or Venue?

### How KDS Location Is Determined
The KDS screen resolves its location using this priority chain:
1. **URL \`?locationId\` parameter** — if present and matches a known location
2. **Terminal session location** — from the device's terminal session
3. **First location** — defaults to the first location in the user's list
4. **Fallback** — empty (shows nothing)

### Common Causes

1. **No location specified** — If no \`locationId\` is in the URL and no terminal session is set, the KDS defaults to the user's first location, which may be wrong. Look for a **Location Banner** warning at the top of the screen.

2. **Terminal session points to wrong location** — The device's terminal session may be configured for a different venue. Re-register the terminal session with the correct location.

3. **Multi-venue user** — Users with access to multiple locations may see the wrong default. Use the **KDS location selector** to pick the correct venue.

4. **Parent/child venue** — The system allows cross-location access when a child venue is part of a parent site (for legacy configurations). This means a venue-level KDS may show site-level tickets.

### How to Fix
- Use the **location selector** on the KDS screen to pick the correct venue
- Set the \`?locationId\` parameter in the KDS URL for kiosk/dedicated devices
- Register a terminal session with the correct location in **Settings** → **Terminals**
- Check for the **LocationBanner** warning — it indicates the location was defaulted or fell back`,
  },

  // ── 12. Filter KDS by station, order type, or fulfillment mode ──
  {
    slug: 'kds-howto-filter-by-type',
    moduleKey: 'kds',
    route: '/kds',
    questionPattern:
      'filter KDS by station|filter KDS by order type|filter KDS by fulfillment|how do I filter the KDS by station order type or fulfillment mode|KDS filter|KDS order type filter|KDS fulfillment filter',
    approvedAnswerMarkdown: `## How Do I Filter the KDS by Station, Order Type, or Fulfillment Mode?

### Filter by Station
Each KDS screen is already station-specific — when you open a station's KDS view, you only see tickets routed to that station. To view a different station, use the **station selector** at the top of the KDS screen or navigate to the station from the KDS selector page.

The **All Stations** view (\`/kds/all\`) shows all active tickets across all stations for the selected location (up to 500 tickets).

### Filter by Order Type at the Station Level
Stations can be configured to only accept certain order types:
1. Go to **KDS Settings** → **Stations** → select a station
2. Set **Allowed Order Types** (dine-in, takeout, delivery, bar, quick-service)
3. If left empty, the station accepts all order types

### Filter by Order Type at the Routing Rule Level
Individual routing rules can also have an **order type condition**:
- A rule with \`orderTypeCondition: 'delivery'\` only applies to delivery orders
- Items from other order types skip that rule and try the next match

### Available Order Types
\`dine_in\`, \`bar\`, \`takeout\`, \`quick_service\`, \`delivery\`

### Bypass for Retail POS
When the order type is absent (retail POS without F&B tab), both station-level and rule-level order type filters are **bypassed** — the item routes normally. This prevents retail orders from being silently dropped.`,
  },

  // ── 13. Dine-in, takeout, delivery not separating ──
  {
    slug: 'kds-troubleshoot-order-types-not-separating',
    moduleKey: 'kds',
    route: '/kds',
    questionPattern:
      'dine-in takeout delivery not separating|order types mixed on KDS|KDS not separating order types|why are dine-in takeout and delivery orders not separating correctly|all orders on same KDS|order types mixed',
    approvedAnswerMarkdown: `## Why Are Dine-In, Takeout, and Delivery Orders Not Separating Correctly?

### Order Type Separation Requires Configuration
By default, **all order types go to all stations**. To separate them, you need to configure either station-level filters or routing rules.

### Option 1: Station-Level Filtering
1. Go to **KDS Settings** → **Stations**
2. For each station, set **Allowed Order Types**:
   - "Kitchen Dine-In" station → \`dine_in\`
   - "Kitchen Takeout" station → \`takeout\`, \`delivery\`
   - "Bar" station → \`bar\`
3. Items will only route to stations that accept their order type

### Option 2: Routing Rules with Order Type Conditions
1. Go to **KDS Settings** → **Routing Rules**
2. Create rules with \`orderTypeCondition\`:
   - Department "Hot Kitchen" + orderType "dine_in" → Grill Station A
   - Department "Hot Kitchen" + orderType "takeout" → Grill Station B
3. Set priority numbers so specific rules win over general ones

### Common Mistake
If your station's \`allowedOrderTypes\` is **empty** (the default), it accepts **all** order types. You must explicitly set the filter to restrict it.

### Check the Tab's Order Type
Ensure the F&B tab or order has the correct order type assigned. If the order type is not set on the tab, it bypasses all order type filters and routes to any matching station.`,
  },

  // ── 14. Change order of tickets ──
  {
    slug: 'kds-howto-change-ticket-order',
    moduleKey: 'kds',
    route: '/kds',
    questionPattern:
      'change order of tickets on KDS|rearrange KDS tickets|sort KDS tickets|how do I change the order of tickets on the KDS|KDS ticket order|KDS ticket sorting|reorder KDS tickets',
    approvedAnswerMarkdown: `## How Do I Change the Order of Tickets on the KDS?

### Automatic Priority Scoring
KDS tickets are automatically sorted by a **priority score** that considers multiple factors:

| Factor | Score Boost | Notes |
|--------|------------|-------|
| **Priority level** | ×1000 | Higher priority orders score higher |
| **Allergy flag** | +5,000 | Allergy tickets always surface to top |
| **Critical alert** | +4,000 | Tickets past critical time threshold |
| **VIP flag** | +3,000 | VIP orders get priority |
| **Pickup ETA < 5 min** | +3,000 | Imminent pickup orders are urgent |
| **Rush flag** | +2,000 | Rush orders |
| **Warning alert** | +1,500 | Tickets past warning time threshold |
| **Pickup ETA < 15 min** | +1,500 | Upcoming pickup orders |
| **Elapsed time** | +elapsed/2 (cap 1000) | Older tickets gradually rise |
| **Partial ready** | +800 | Tickets with some items done |
| **Pickup ETA < 30 min** | +500 | Approaching pickup |

### What This Means in Practice
- Allergy orders always appear first
- Late orders (past warning/critical thresholds) automatically rise to the top
- Rush and VIP orders are prioritized
- Takeout/delivery orders with imminent pickup times are boosted
- Within equal priority, older tickets appear first

### Manual Override
You cannot manually drag-and-drop tickets. To prioritize a specific order, mark it as **Rush** or **VIP** from the POS when creating or editing the order.`,
  },

  // ── 15. Prioritize rush or VIP orders ──
  {
    slug: 'kds-howto-prioritize-rush-vip',
    moduleKey: 'kds',
    route: '/kds',
    questionPattern:
      'prioritize rush order KDS|VIP order KDS|rush order on KDS|how do I prioritize rush or VIP orders on the KDS|KDS priority|urgent order KDS|expedite order KDS',
    approvedAnswerMarkdown: `## How Do I Prioritize Rush or VIP Orders on the KDS?

### Rush Orders
Mark an order as **Rush** from the POS when creating or editing the order. Rush orders receive a **+2,000 point** priority boost on the KDS, causing them to sort above normal orders.

### VIP Orders
Mark an order as **VIP** from the POS. VIP orders receive a **+3,000 point** priority boost.

### Allergy Orders
Orders flagged with an **allergy** marker receive the highest automatic boost at **+5,000 points** — these always appear at the top of the KDS.

### Priority Hierarchy on KDS
From highest to lowest automatic priority:
1. Allergy-flagged items (+5,000)
2. Critical-alert tickets — past the critical time threshold (+4,000)
3. VIP orders (+3,000)
4. Imminent pickup orders — pickup ETA < 5 minutes (+3,000)
5. Rush orders (+2,000)
6. Warning-alert tickets — past the warning time threshold (+1,500)
7. Normal orders (sorted by elapsed time)

### Visual Indicators
Rush and VIP tickets are visually distinguished on the KDS screen with color coding and labels, making them easy to spot at a glance.

### Station Rush Mode
Stations also support a **Rush Mode** toggle that can be enabled via the station settings. When a station is in rush mode, it signals to the team that the station is operating under high urgency.`,
  },

  // ── 16. Mark item as started, in progress, or ready ──
  {
    slug: 'kds-howto-mark-item-status',
    moduleKey: 'kds',
    route: '/kds',
    questionPattern:
      'mark item started KDS|mark item in progress|mark item ready KDS|how do I mark an item as started in progress or ready|KDS item status|start cooking KDS|item status on KDS',
    approvedAnswerMarkdown: `## How Do I Mark an Item as Started, In Progress, or Ready?

### Item Statuses
Each item on a KDS ticket goes through these statuses:

| Status | Meaning | How to Set |
|--------|---------|-----------|
| **Pending** | Not yet started | Default when ticket arrives |
| **Cooking** | In progress — started | Tap the item once to start |
| **Ready** | Completed by kitchen | Tap the item again (or bump) |
| **Served** | Bumped by expo | Expo bumps after plating |
| **Voided** | Cancelled | Voided from POS |

### Marking Items
1. **Start an item** — Tap the item on the KDS screen to change it from \`pending\` to \`cooking\`. The \`started_at\` timestamp is recorded.
2. **Mark ready** — Tap the item again (or use the bump action) to change it from \`cooking\` to \`ready\`. The \`ready_at\` timestamp is recorded.
3. **Bump entire ticket** — Tap the ticket's bump button to mark ALL active items as \`ready\` at once.

### Ticket Status Follows Items
The ticket's overall status updates automatically based on its items:
- When any item starts → ticket becomes \`in_progress\`
- When all items are ready → ticket becomes \`ready\`
- When bumped from expo → ticket becomes \`served\`

### Auto-Bump
If the station has **Auto-bump on all ready** enabled, the ticket automatically promotes to \`ready\` when the last item is marked ready.`,
  },

  // ── 17. Mark entire order complete ──
  {
    slug: 'kds-howto-mark-order-complete',
    moduleKey: 'kds',
    route: '/kds',
    questionPattern:
      'mark entire order complete KDS|complete whole order|finish order KDS|how do I mark an entire order as complete|KDS order complete|bump whole ticket|clear entire ticket',
    approvedAnswerMarkdown: `## How Do I Mark an Entire Order as Complete?

### Bump the Ticket
1. On the KDS screen, find the ticket
2. Tap the **Bump** button on the ticket card
3. All active items on that ticket at your station are marked as **Ready**
4. The ticket moves from the live view to the history view

### Prep vs. Expo Completion

| Station Type | Bump Result | Final Status |
|-------------|-------------|-------------|
| **Prep station** | Items → \`ready\`, Ticket → \`ready\` | Visible on expo |
| **Expo station** | Items → \`served\`, Ticket → \`served\` | Fully complete |

A **prep station bump** means "kitchen is done" — the ticket still shows on the expo screen for the expediter to verify and release.

An **expo bump** means "food has left the kitchen" — this is the final state.

### Keyboard / Bump Bar
If you have a bump bar configured, use the assigned key to bump the currently selected ticket. Configure shortcuts in **KDS Settings** → **Bump Bar Profiles**.

### Auto-Bump
Enable **Auto-bump on all ready** on a station to skip the manual bump step — the ticket auto-completes when the last item is individually marked ready.`,
  },

  // ── 18. Order stuck in "sent" status ──
  {
    slug: 'kds-troubleshoot-stuck-sent',
    moduleKey: 'kds',
    route: '/kds/order-status',
    questionPattern:
      'order stuck in sent status|KDS order stuck sent|ticket stuck sent|why is an order stuck in sent status|KDS sent not progressing|order still showing as sent',
    approvedAnswerMarkdown: `## Why Is an Order Stuck in "Sent" Status?

### What "Sent" Means
The \`sent\` status in KDS send tracking means the ticket was successfully created and dispatched to the station. It's waiting to be acknowledged as \`delivered\` or \`displayed\`.

### Common Causes

1. **KDS screen not open** — If no KDS screen is actively polling for that station, the ticket exists in the database but no client has picked it up. Open the station's KDS view to display it.

2. **Station offline** — The KDS device for that station may be offline, disconnected, or the browser tab may be closed/minimized.

3. **Wrong location** — The KDS screen may be viewing a different location than where the ticket was created.

4. **Polling paused** — If the KDS browser tab is in the background, polling is paused. Bring the tab to the foreground.

### How to Resolve
- Open the KDS screen for the target station
- Check that the station is viewing the correct location
- The ticket should appear on the next poll cycle (within 8 seconds)
- If it still doesn't appear, check **KDS** → **Order Status** → **Needs Attention** for any errors

### If the Ticket Exists But Won't Display
Go to **KDS** → **Order Status**, find the send, and try **Retry**. This creates a new tracking entry and may resolve any stuck state.`,
  },

  // ── 19. Order stuck in "in progress" or "ready" status ──
  {
    slug: 'kds-troubleshoot-stuck-in-progress',
    moduleKey: 'kds',
    route: '/kds',
    questionPattern:
      'order stuck in progress|order stuck ready|KDS ticket stuck|why is an order stuck in in progress or ready status|ticket won\'t clear|KDS order won\'t complete|ticket stuck ready',
    approvedAnswerMarkdown: `## Why Is an Order Stuck in "In Progress" or "Ready" Status?

### Stuck in "In Progress"
This means at least one item has been started but not all items are marked ready.

**Causes:**
- Some items haven't been bumped yet — check for unbumped items on the ticket
- An item may be on a **different station** — the ticket shows on your station for items routed to you, but other items on the same order may be at another station still in progress
- The ticket has been partially worked but forgotten

**Fix:** Mark the remaining items as ready, or bump the entire ticket.

### Stuck in "Ready"
This means all items at the prep station are ready, but the ticket hasn't been bumped from expo.

**Causes:**
- **No expo station** — If there's no expo station set up, tickets stay in \`ready\` at the prep station. Bump from the prep station to move to \`served\`.
- **Expo hasn't bumped** — The expediter needs to verify and bump the ticket from the expo screen
- **Expo screen not monitoring** — The expo screen may be offline or viewing a different location

**Fix:** Bump the ticket from the expo screen, or bump it from the prep station if no expo is configured.

### Auto-Clear for Old Tickets
If tickets are stuck for a long time, the **auto-clear stale tickets** cron job will void tickets older than the configured threshold (default 8 hours). You can also configure this in **KDS Settings** → **Location Settings** → **Stale Ticket Mode**.`,
  },

  // ── 20. Clear old or stuck orders ──
  {
    slug: 'kds-howto-clear-old-stuck-orders',
    moduleKey: 'kds',
    route: '/kds',
    questionPattern:
      'clear old orders from KDS|clear stuck orders KDS|remove old tickets KDS|how do I clear old or stuck orders from the KDS|clean up KDS|KDS stale tickets|clear stale KDS orders',
    approvedAnswerMarkdown: `## How Do I Clear Old or Stuck Orders from the KDS?

### Manual Clear
1. On the KDS screen, find the stuck ticket
2. Tap the **Bump** button to mark it as ready/served
3. The ticket moves to the history view

### Bulk Clear via Order Status
1. Go to **KDS** → **Order Status**
2. Switch to the **Active** or **Needs Attention** tab
3. Select multiple sends using checkboxes
4. Click **Bulk Clear** to clear all selected sends at once (up to 100 at a time)

### Automatic Stale Ticket Cleanup
The system has an automatic cleanup mechanism:
1. Go to **KDS Settings** → **Location Settings**
2. Set **Stale Ticket Mode** to \`auto_clear\`
3. Configure the **max age** (default 8 hours)

The auto-clear cron job will:
- Void items from **previous business dates** (always)
- Void same-day tickets older than the configured max age
- Skip tickets that are **held** (intentionally kept visible)

### Void from POS
Voiding or canceling an order from the POS sets the ticket items to \`voided\` status on the KDS, which removes them from the active view.

### Soft Delete via Order Status
Use **KDS** → **Order Status** → **Delete** (or Bulk Delete) to soft-delete send tracking entries. The historical data is preserved but the sends are removed from the active view.`,
  },

  // ── 21. Expo not showing completed items ──
  {
    slug: 'kds-troubleshoot-expo-not-showing-completed',
    moduleKey: 'kds',
    route: '/kds',
    questionPattern:
      'expo not showing completed items|expo screen missing items|expo not updating|why isn\'t the expo screen showing completed items from the kitchen|expo empty|expo not showing ready items',
    approvedAnswerMarkdown: `## Why Isn't the Expo Screen Showing Completed Items from the Kitchen?

### How Expo Works
The expo screen shows **all active tickets across all prep stations** for the location. It queries across all stations — it doesn't wait for items to be bumped. Tickets appear on expo as soon as they exist at any prep station.

### Common Causes

1. **Wrong location** — The expo screen may be viewing a different location than the prep stations. Check the location selector at the top of the screen. Look for a **LocationBanner** warning.

2. **No expo station created** — An expo station must be created in **KDS Settings** → **Stations** with type = \`expo\`. Without it, there's no expo endpoint to query.

3. **Expo screen not polling** — The expo screen polls every 10 seconds. If the tab is minimized or in the background, polling is paused. Bring the tab to the foreground.

4. **Tickets already served** — If tickets were bumped from a prep station and there's no expo supervision configured, they may have gone directly to \`served\` status and don't appear on expo.

### Verify Setup
1. Go to **KDS Settings** → **Stations**
2. Confirm an expo station exists for the correct location
3. Optionally link prep stations to the expo via \`supervisedByExpoId\`
4. Open the expo KDS screen and verify the location matches`,
  },

  // ── 22. Resend order to KDS ──
  {
    slug: 'kds-howto-resend-order',
    moduleKey: 'kds',
    route: '/kds/order-status',
    questionPattern:
      'resend order to KDS|retry KDS send|re-send to KDS|how do I resend an order to the KDS|KDS resend|send again to KDS|refire order to KDS',
    approvedAnswerMarkdown: `## How Do I Resend an Order to the KDS?

### From KDS Order Status
1. Go to **KDS** → **Order Status**
2. Find the original send (it may be in the **Needs Attention** tab if it failed)
3. Click **Retry**
4. The system creates a new tracking entry with \`send_type: 'retry'\`, links it to the original send via \`prior_send_token\`, and marks the original as cleared

### From the POS (F&B Tab)
For F&B tabs with course-based dispatch:
1. Open the tab in the POS
2. Use the **Resend to KDS** option
3. The system re-dispatches the course items, creating new tickets

### From the POS (Retail)
For retail POS orders:
1. Open the order
2. Press **Send to KDS** again
3. The **ghost-send guard** prevents duplicate items — only items not already present in existing KDS tickets will be sent

### Important Notes
- Resends create new KDS tickets — they don't modify existing ones
- The original send is tracked as cleared/superseded
- Each resend has full traceability via the send tracking history
- Resends use \`send_type: 'retry'\` or \`send_type: 'manual_resend'\` for tracking purposes`,
  },

  // ── 23. Delete or void an order already sent to KDS ──
  {
    slug: 'kds-howto-delete-void-sent-order',
    moduleKey: 'kds',
    route: '/kds',
    questionPattern:
      'delete order from KDS|void order on KDS|cancel order on KDS|how do I delete or void an order that was already sent to the KDS|remove order from KDS|KDS void ticket|KDS cancel ticket',
    approvedAnswerMarkdown: `## How Do I Delete or Void an Order That Was Already Sent to the KDS?

### Void from POS (Recommended)
1. Go to the POS and find the order
2. **Void** or **cancel** the order
3. The associated KDS ticket items are automatically set to \`voided\` status
4. Voided items disappear from the active KDS view

### Clear from KDS
1. On the KDS screen, find the ticket
2. Bump the ticket to move it to history
3. This doesn't void the order — it just removes it from the active display

### Soft Delete from Order Status
1. Go to **KDS** → **Order Status**
2. Find the send entry
3. Click **Delete** (or select multiple and use **Bulk Delete**)
4. This soft-deletes the send tracking entry — the data is preserved in history but removed from active views

### Important Distinctions

| Action | Effect on Order | Effect on KDS | Reversible? |
|--------|---------------|---------------|------------|
| **Void from POS** | Order voided | Items voided on KDS | No (audit trail preserved) |
| **Bump from KDS** | Order unchanged | Ticket moves to history | Yes (recall) |
| **Delete from Order Status** | Order unchanged | Send tracking entry soft-deleted | Data preserved in history |

### Partial Void
If you void individual items from an order in the POS, only those items are voided on the KDS — the rest of the ticket remains active.`,
  },

  // ── 24. Modified item or note not appearing ──
  {
    slug: 'kds-troubleshoot-modified-item-not-appearing',
    moduleKey: 'kds',
    route: '/kds',
    questionPattern:
      'modified item not on KDS|note not appearing on KDS|change not showing on KDS|why didn\'t a modified item or note appear on the KDS|KDS not showing update|edited order not on KDS|modification not on KDS',
    approvedAnswerMarkdown: `## Why Didn't a Modified Item or Note Appear on the KDS?

### KDS Tickets Are Point-in-Time Snapshots
When an order is sent to the KDS, the system creates ticket items with the data **at the time of dispatch**. Modifications made to the order after dispatch are **not automatically pushed** to existing KDS tickets.

### How to Get Modifications to Show

1. **Before sending** — Make all modifications before pressing "Send to KDS". The dispatch captures the current state of all items.

2. **After sending** — You need to **resend** the order:
   - For F&B tabs: Use **Resend to KDS** from the tab
   - For retail POS: Press **Send to KDS** again (the ghost-send guard will only send items that changed or are new)

3. **Special instructions / notes** — These must be present on the order line item at the time of dispatch. Notes added after sending won't appear on existing tickets.

### Modifiers
Modifiers are captured at dispatch time as part of the ticket item data. If modifiers are changed on the order after dispatch, the KDS ticket still shows the original modifiers. Resend to update.

### Course Changes (F&B)
Moving items between courses after a course has been fired requires refiring the affected courses.`,
  },

  // ── 25. Special instructions on KDS ──
  {
    slug: 'kds-howto-special-instructions',
    moduleKey: 'kds',
    route: '/kds',
    questionPattern:
      'special instructions on KDS|notes on KDS ticket|how do special instructions print or display on the KDS|KDS notes|KDS special requests|customer notes KDS|kitchen notes KDS',
    approvedAnswerMarkdown: `## How Do Special Instructions Print or Display on the KDS?

### How It Works
Special instructions and notes are captured as part of the ticket item data when the order is dispatched to the KDS.

### Adding Special Instructions
1. In the POS, add notes to individual order line items (e.g., "No onions", "Extra sauce", "Allergy: nuts")
2. When the order is sent to KDS, these notes are included on the corresponding ticket items
3. Notes display on the KDS ticket beneath the item name

### Allergy Flags
Items with allergy-related notes or flags receive special treatment:
- **+5,000 priority boost** — allergy tickets always sort to the top
- Visual highlighting on the KDS screen
- Audio alerts may trigger differently for allergy items

### Tab-Level Notes (F&B)
F&B tabs support table-level or tab-level notes. These appear on the ticket header (visible to all stations receiving items from that tab).

### Modifier Display
Modifiers (add-ons, removals, substitutions) display as sub-items beneath the main item on the KDS ticket. They're visually indented to distinguish them from the item name.

### Timing
Notes and special instructions are captured at **dispatch time**. Notes added to the order after the KDS send will not appear on existing tickets — resend the order to update.`,
  },

  // ── 26. Modifiers showing incorrectly ──
  {
    slug: 'kds-troubleshoot-modifiers-incorrect',
    moduleKey: 'kds',
    route: '/kds',
    questionPattern:
      'modifiers showing incorrectly on KDS|KDS modifiers wrong|modifiers not right on KDS|why are modifiers showing incorrectly on the KDS|KDS modifier display issue|wrong modifiers KDS',
    approvedAnswerMarkdown: `## Why Are Modifiers Showing Incorrectly on the KDS?

### Common Causes

1. **Modifier changed after dispatch** — The KDS captures modifiers at the time of dispatch. If modifiers were changed on the order after sending, the KDS still shows the original set. **Resend** the order to update.

2. **Modifier routing mismatch** — If a routing rule is set to route items based on modifiers (e.g., "Gluten Free" modifier → Allergen Station), the item appears on that station with all its modifiers, not just the triggering one. This is correct behavior.

3. **Display formatting** — Modifiers display as sub-items beneath the main item. If the KDS display is small or the font is large, modifiers may be truncated or hard to read. Adjust the display layout in station settings.

4. **Catalog data issue** — If modifiers are missing from the KDS entirely, verify they're correctly configured in the **Catalog** → **Modifier Groups** and assigned to the items.

### How Modifiers Route
Modifier-based routing rules check if **any** modifier on the item matches the rule's modifier ID. The item (with all its modifiers) routes to that station — individual modifiers are not split across stations.

### Verify
- Open the order in the POS and check the modifiers on each line item
- Check **KDS** → **Order Status** to see what was included in the dispatch
- If modifiers are consistently wrong, check the catalog modifier group configuration`,
  },

  // ── 27. Change font size or display layout ──
  {
    slug: 'kds-howto-change-display-layout',
    moduleKey: 'kds',
    route: '/kds',
    questionPattern:
      'change KDS font size|KDS display layout|KDS text size|how do I change the font size or display layout on the KDS|KDS layout settings|KDS appearance|customize KDS display',
    approvedAnswerMarkdown: `## How Do I Change the Font Size or Display Layout on the KDS?

### Station Display Configuration
Each station can have its own display configuration:
1. Go to **KDS Settings** → **Stations** → select a station
2. Adjust the display configuration settings for that station

### Browser-Level Zoom
For quick font size changes on a specific device:
- Use **Ctrl +** / **Ctrl -** (or **Cmd +** / **Cmd -** on Mac) to zoom in/out
- Use **Ctrl 0** to reset to default zoom
- This affects the entire page proportionally

### Full-Screen Mode
For dedicated KDS devices, use the browser's full-screen mode:
- Press **F11** (or **Fn + F11** on some keyboards)
- This hides the browser chrome and maximizes the KDS display area

### Device Recommendations
- Use a dedicated tablet or monitor for KDS
- Set the browser to auto-start in full-screen/kiosk mode
- Disable screen timeout / power saving on the device
- Use landscape orientation for maximum ticket visibility`,
  },

  // ── 28. Switch device into KDS mode ──
  {
    slug: 'kds-howto-switch-device-to-kds',
    moduleKey: 'kds',
    route: '/kds',
    questionPattern:
      'switch device to KDS mode|KDS mode on device|turn on KDS|how do I switch a device into KDS mode|set up KDS device|KDS tablet setup|dedicated KDS device|enable KDS mode',
    approvedAnswerMarkdown: `## How Do I Switch a Device Into KDS Mode?

### Navigate to KDS
1. Log in to OppsEra on the device
2. Go to **KDS** from the main navigation
3. The **KDS Selector** screen shows all available stations for your location
4. Select a station to open its KDS view

### Set Up as a Dedicated KDS Device
1. **Bookmark the station URL** — Each station has a unique URL (e.g., \`/kds?stationId=xxx&locationId=yyy\`). Bookmark this for quick access.
2. **Full-screen the browser** — Press F11 or use kiosk mode
3. **Disable screen timeout** — In the device's power settings, prevent the screen from sleeping
4. **Auto-launch on boot** — Configure the device to auto-open the browser to the KDS URL on startup

### Terminal Session Registration
For the device to be properly tracked:
1. The KDS view sends periodic **heartbeat** signals to the server
2. Heartbeats record: terminal ID, station ID, location ID, IP address, and last seen time
3. This allows you to monitor which devices are online from the admin side

### Multiple Stations on One Device
You can switch between stations using the station selector. However, each browser tab can only display one station at a time. To monitor multiple stations, open multiple tabs or use the **All Stations** view (\`/kds/all\`).`,
  },

  // ── 29. KDS device offline ──
  {
    slug: 'kds-troubleshoot-device-offline',
    moduleKey: 'kds',
    route: '/kds',
    questionPattern:
      'KDS device offline|KDS not connecting|KDS disconnected|why is the KDS device offline|KDS screen offline|KDS no connection|KDS can\'t connect',
    approvedAnswerMarkdown: `## Why Is the KDS Device Offline?

### Common Causes

1. **Internet connection lost** — The KDS requires an internet connection to poll the server. Check the device's Wi-Fi or ethernet connection.

2. **Browser tab closed or minimized** — If the KDS browser tab is closed, the device stops polling. If minimized, polling pauses until the tab is brought to the foreground.

3. **Device powered off or sleeping** — Check the device's power settings. Disable sleep/screen timeout for dedicated KDS devices.

4. **Session expired** — The user's authentication session may have expired. Refresh the page and log in again if prompted.

5. **Server unreachable** — The OppsEra server may be temporarily unavailable. The KDS uses exponential backoff on failures: 5s → 10s → 20s → 40s → 60s max. It will automatically reconnect when the server is available.

### How to Check Device Status
- KDS devices send **heartbeats** to the server. If heartbeats stop, the device is considered offline.
- Check the terminal heartbeat records to see the last seen time for each device.

### How to Recover
1. Check the device's internet connection
2. Open the KDS browser tab (bring to foreground if minimized)
3. Refresh the page if needed
4. If the session expired, log in again
5. The KDS will automatically resume polling and catch up on any missed tickets`,
  },

  // ── 30. KDS lagging or loading slowly ──
  {
    slug: 'kds-troubleshoot-lagging-slow',
    moduleKey: 'kds',
    route: '/kds',
    questionPattern:
      'KDS lagging|KDS loading slowly|KDS slow|why is the KDS lagging or loading slowly|KDS performance|KDS sluggish|KDS takes long to load|KDS unresponsive',
    approvedAnswerMarkdown: `## Why Is the KDS Lagging or Loading Slowly?

### Common Causes

1. **Too many active tickets** — If a station has hundreds of unbumped tickets, the query and rendering can slow down. Clear old/stuck tickets regularly.

2. **Weak internet connection** — Each poll cycle fetches ticket data from the server. Slow or unstable internet causes delays. Use a wired ethernet connection for reliability.

3. **Underpowered device** — Cheap tablets or old hardware may struggle to render many tickets simultaneously. Use a device with adequate RAM and processing power.

4. **Browser memory bloat** — Long-running browser sessions accumulate memory. Refresh the page periodically (or restart the browser daily).

5. **Multiple tabs** — Running multiple KDS tabs or other web applications on the same device splits resources.

### Performance Optimizations Built In
- Polling uses \`setTimeout\` chains (not \`setInterval\`) with a **generation counter** to prevent stale promise issues
- Exponential backoff on failures prevents request storms
- Ticket queries are limited to active tickets at a single station
- The All Stations view caps at 500 tickets

### Recommendations
- Bump tickets promptly to keep the active count low
- Enable **auto-clear stale tickets** in KDS location settings
- Use a dedicated device for KDS — don't share with POS or other apps
- Restart the browser once daily on dedicated KDS devices
- Use wired ethernet instead of Wi-Fi when possible`,
  },

  // ── 31. Reconnect after internet loss ──
  {
    slug: 'kds-howto-reconnect-after-internet-loss',
    moduleKey: 'kds',
    route: '/kds',
    questionPattern:
      'reconnect KDS after internet loss|KDS internet recovery|KDS reconnect|how do I reconnect a KDS screen after internet loss|KDS came back online|KDS wifi dropped',
    approvedAnswerMarkdown: `## How Do I Reconnect a KDS Screen After Internet Loss?

### Automatic Reconnection
The KDS has built-in resilience for internet drops:

1. **Exponential backoff** — When polling fails, the KDS retries with increasing intervals: 5s → 10s → 20s → 40s → 60s (capped). This prevents hammering the server.
2. **Automatic recovery** — When the connection is restored, the next poll cycle succeeds and the KDS resumes normal 8-second polling.
3. **Immediate catch-up** — On recovery, the KDS fetches all current active tickets, so no orders are missed.

### What to Do
In most cases, **do nothing** — the KDS will automatically reconnect and catch up.

### If It Doesn't Auto-Recover
1. Check the device's internet connection (Wi-Fi or ethernet)
2. **Refresh the browser page** — this resets the polling state and forces an immediate fetch
3. If the session expired during the outage, you may need to log in again

### Tab Visibility
If the browser tab was minimized during the outage, bring it to the foreground. Polling is paused when the tab is hidden and resumes with an immediate fetch when visible.

### No Data Loss
Orders sent to the KDS while the device was offline are stored on the server. They appear on the KDS as soon as polling resumes — nothing is lost.`,
  },

  // ── 32. Assign KDS device to venue or kitchen ──
  {
    slug: 'kds-howto-assign-device-to-venue',
    moduleKey: 'kds',
    route: '/kds',
    questionPattern:
      'assign KDS device to venue|assign KDS to kitchen|KDS device location|how do I assign a KDS device to a specific venue or kitchen|KDS location assignment|KDS venue setup',
    approvedAnswerMarkdown: `## How Do I Assign a KDS Device to a Specific Venue or Kitchen?

### Via URL Parameters
The simplest way to lock a device to a specific venue and station:
1. Navigate to the KDS with the location and station in the URL:
   \`/kds?locationId=YOUR_LOCATION_ID&stationId=YOUR_STATION_ID\`
2. Bookmark this URL on the device
3. The KDS will always open to that specific venue and station

### Via Terminal Session
1. Set up a **terminal session** for the device in **Settings** → **Terminals**
2. Assign the terminal to the correct **location**
3. The KDS uses the terminal session's location as its second-priority source (after URL params)

### Via KDS Selector
1. Open the KDS page
2. Use the **location selector** to pick the venue
3. Select the station from the list
4. The URL updates with the correct parameters — bookmark it

### Location Resolution Priority
The KDS resolves its location in this order:
1. URL \`?locationId\` parameter (highest priority)
2. Terminal session location
3. First location in the user's list (default)

### Multi-Venue Setup
For businesses with multiple locations:
- Each venue has its own set of stations
- Devices at each venue should have the correct \`locationId\` in their bookmarked URL
- The **LocationBanner** warns when the location was defaulted or fell back to an unexpected value`,
  },

  // ── 33. Multiple KDS screens for one kitchen ──
  {
    slug: 'kds-howto-multiple-screens-one-kitchen',
    moduleKey: 'kds',
    route: '/kds',
    questionPattern:
      'multiple KDS screens one kitchen|duplicate KDS screen|two screens same station|how do I set up multiple KDS screens for one kitchen|mirror KDS|KDS on two devices|same station two screens',
    approvedAnswerMarkdown: `## How Do I Set Up Multiple KDS Screens for One Kitchen?

### Same Station on Multiple Devices
You can open the same station's KDS view on multiple devices simultaneously:
1. Navigate to the same station URL on each device
2. Both devices will poll the same ticket data
3. Both show identical information (within the 8-second poll interval)
4. Bumping on one device is reflected on the other at the next poll cycle

This is useful for mounting multiple monitors in a large kitchen — all showing the same queue.

### Different Stations for One Kitchen
If you want to split the workload:
1. Create multiple **prep stations** in **KDS Settings** → **Stations** (e.g., "Hot Line", "Cold Line", "Grill")
2. Set up **routing rules** to send different items to different stations
3. Assign each KDS screen to its own station

### Combined Approaches
- **Station A** on two screens (both showing grill items) + **Station B** on one screen (salads)
- **All Stations view** (\`/kds/all\`) on a big monitor for kitchen manager oversight
- **Expo station** on a screen at the pass window

### Expo for Full Kitchen Overview
The expo station type shows ALL active tickets across ALL prep stations. Set up one expo screen at the pass window to monitor the entire kitchen's output.

### Terminal Heartbeats
Each device sends its own heartbeat, so you can track which devices are active for each station.`,
  },

  // ── 34. Orders going to printer instead of KDS ──
  {
    slug: 'kds-troubleshoot-orders-to-printer',
    moduleKey: 'kds',
    route: '/kds',
    questionPattern:
      'orders sent to printer instead of KDS|printer instead of KDS|KDS not receiving but printer is|why are orders being sent to the printer instead of the KDS|kitchen printing not KDS|print instead of display',
    approvedAnswerMarkdown: `## Why Are Orders Being Sent to the Printer Instead of the KDS?

### KDS and Printers Are Independent Systems
In OppsEra, the KDS (Kitchen Display System) and kitchen printers are **separate** systems. Sending to KDS is a distinct action from printing.

### Common Causes

1. **"Send to KDS" not pressed** — The POS has a specific **Send to KDS** button. If staff are using a "Print" button instead, the order goes to the printer but not the KDS.

2. **No KDS stations configured** — If no KDS stations are set up for the location, there's nowhere for the order to be routed. Check **KDS Settings** → **Stations**.

3. **Workflow habit** — Staff may be accustomed to the old printer workflow and not using the KDS send button. Train staff to use "Send to KDS" instead of or in addition to print.

### Using Both Together
You can use kitchen printers AND KDS simultaneously:
- Press **Send to KDS** to dispatch to the kitchen display
- Print a kitchen ticket for backup or reference
- Both actions are independent — one doesn't replace the other

### Transitioning from Printers to KDS
1. Set up KDS stations in **KDS Settings** → **Stations**
2. Configure routing rules in **KDS Settings** → **Routing Rules**
3. Train staff to use the **Send to KDS** button
4. Keep printers as backup during the transition period
5. Once comfortable, reduce reliance on printed kitchen tickets`,
  },

  // ── 35. Use both printers and KDS together ──
  {
    slug: 'kds-howto-use-printers-and-kds',
    moduleKey: 'kds',
    route: '/kds',
    questionPattern:
      'use kitchen printers and KDS together|both printers and KDS|KDS plus printer|how do I use both kitchen printers and KDS together|printer KDS hybrid|print and display',
    approvedAnswerMarkdown: `## How Do I Use Both Kitchen Printers and KDS Together?

### Independent Systems
Kitchen printers and the KDS are independent systems in OppsEra. You can use both simultaneously without conflict.

### Workflow Options

**Option 1: KDS Primary, Printer Backup**
- Send all orders to KDS via the **Send to KDS** button
- Print kitchen tickets only when the KDS is down or for specific needs
- This is the recommended hybrid approach

**Option 2: Both for Every Order**
- Send to KDS (digital display for kitchen staff)
- Print a paper ticket (physical reference or expo copy)
- Staff use KDS for workflow (bumping, timing) and paper for reference

**Option 3: Split by Station**
- Some stations use KDS (e.g., hot kitchen)
- Other stations use printers (e.g., bar with existing printer setup)
- Route items to KDS stations via routing rules; print for non-KDS stations

### Key Points
- Sending to KDS does **not** automatically print (and vice versa)
- Both are triggered from the POS by separate actions
- KDS tracking, timing, and alerts only work for items sent to KDS
- Printed tickets have no status tracking or timing features`,
  },

  // ── 36. See history of orders sent to KDS ──
  {
    slug: 'kds-howto-view-send-history',
    moduleKey: 'kds',
    route: '/kds/order-status',
    questionPattern:
      'history of KDS orders|KDS send history|KDS order history|how do I see the history of orders sent to the KDS|KDS past orders|KDS ticket history|view old KDS tickets',
    approvedAnswerMarkdown: `## How Do I See the History of Orders Sent to the KDS?

### KDS Order Status Screen
Go to **KDS** → **Order Status** for the complete send tracking history.

#### Tabs
- **Active** — Currently queued, sent, delivered, or displayed sends
- **Needs Attention** — Failed or orphaned sends requiring action
- **History** — Cleared, deleted, and completed sends

### Send Tracking Details
Each entry shows:
- **Order/Tab reference** — which order or F&B tab was sent
- **Station** — which station received the tickets
- **Send type** — initial, retry, manual_resend, fire_course, recall, reroute
- **Status** — current status with full event timeline
- **Timestamps** — created, sent, cleared, etc.
- **Actor** — who triggered the send

### Station History View
On any KDS station screen, toggle to the **History** view to see recently bumped tickets at that station. This shows tickets where all items are \`ready\` or \`served\`.

### Event Timeline
Click any send in Order Status to see the full event timeline:
- Each status transition is logged with: previous status, new status, actor type, actor ID, and timestamp
- This gives you a complete audit trail from dispatch to completion

### Expo History
The expo screen has a dedicated **History** view showing served tickets across all stations.`,
  },

  // ── 37. Which employee or terminal sent the order ──
  {
    slug: 'kds-howto-track-who-sent-order',
    moduleKey: 'kds',
    route: '/kds/order-status',
    questionPattern:
      'which employee sent order to KDS|which terminal sent to KDS|who sent to KDS|how do I tell which employee or terminal sent an order to the KDS|KDS sent by|KDS sender|track who sent KDS',
    approvedAnswerMarkdown: `## How Do I Tell Which Employee or Terminal Sent an Order to the KDS?

### Dispatch Attempt Tracking
Every KDS dispatch attempt (success or failure) is logged in the \`fnb_kds_dispatch_attempts\` table with:
- **User ID** — the authenticated user who triggered the dispatch
- **Terminal ID** — the device/terminal used
- **Timestamp** — when the dispatch occurred
- **Success/failure** — whether the dispatch succeeded
- **Error details** — if it failed, what went wrong

### Send Event Tracking
Each send status transition in \`fnb_kds_send_events\` records:
- **Actor type** — who/what caused the status change (user, system, cron)
- **Actor ID** — the specific user or process ID
- **Metadata** — additional context (e.g., reason for recall/refire)

### How to Look It Up
1. Go to **KDS** → **Order Status**
2. Find the send entry for the order
3. Click to view details
4. The event timeline shows who triggered each action

### Audit Trail
The platform audit log also captures KDS-related actions (sends, bumps, recalls, refires) with the user ID and timestamp. Check **Settings** → **Audit Log** for a cross-cutting view.`,
  },

  // ── 38. Track KDS send failures ──
  {
    slug: 'kds-howto-track-send-failures',
    moduleKey: 'kds',
    route: '/kds/order-status',
    questionPattern:
      'track KDS send failures|KDS errors|KDS send errors|how do I track KDS send failures or errors|KDS failed sends|KDS dispatch errors|KDS failure log',
    approvedAnswerMarkdown: `## How Do I Track KDS Send Failures or Errors?

### KDS Order Status — Needs Attention Tab
1. Go to **KDS** → **Order Status**
2. Switch to the **Needs Attention** tab
3. This shows all sends with \`failed\` or \`orphaned\` status that have \`needs_attention = true\`

### Failure Statuses

| Status | Meaning |
|--------|---------|
| **Failed** | The dispatch encountered an error (routing failure, database error, etc.) |
| **Orphaned** | The send was lost or became unresolvable (e.g., station removed) |

### Failure Details
Click a failed send to see:
- **Stuck reason** — the error code explaining why it failed
- **Event timeline** — full history of status transitions
- **Prior send token** — link to the original send if this was a retry

### Actions for Failed Sends
- **Retry** — Attempt to resend (creates a new tracking entry)
- **Clear** — Mark as handled (removes from Needs Attention)
- **Acknowledge** — Flag as seen without clearing
- **Bulk Clear** / **Bulk Delete** — Handle multiple failures at once

### Dispatch Attempts Log
The \`fnb_kds_dispatch_attempts\` table logs every dispatch attempt with success/failure status, independent of the send tracking. This provides a comprehensive failure log even for dispatches that fail before creating a send tracking entry.

### Proactive Monitoring
Failed sends are flagged with \`needs_attention = true\`, making them easy to filter and monitor. Consider checking the Needs Attention tab regularly during busy service periods.`,
  },

  // ── 39. Completed orders reappearing ──
  {
    slug: 'kds-troubleshoot-completed-orders-reappearing',
    moduleKey: 'kds',
    route: '/kds',
    questionPattern:
      'completed orders reappearing on KDS|bumped orders coming back|KDS orders reappearing|why are completed orders reappearing on the KDS|cleared tickets showing again|KDS tickets coming back',
    approvedAnswerMarkdown: `## Why Are Completed Orders Reappearing on the KDS?

### Common Causes

1. **Someone recalled the order** — A staff member may have used the **Recall** function (from KDS history) to bring a bumped ticket back. Check the send event history for recall actions.

2. **Order was resent** — The order may have been resent from the POS (manually or via the resend function), creating new tickets. Check **KDS** → **Order Status** for multiple send entries for the same order.

3. **Refire action** — A refire brings an item back for remaking. This is intentional — the item needs to be prepared again.

4. **New course fired** — For F&B tabs, a new course dispatch creates new tickets. These are new items from the same tab, not the same items reappearing.

5. **Event consumer duplicate** — In rare cases, the \`order.placed.v1\` event consumer may process the event after a manual send. The idempotency key should prevent this, but if it occurs, check Order Status for duplicate sends.

### How to Diagnose
1. Go to **KDS** → **Order Status**
2. Search for the order
3. Look at the **send type** column:
   - \`initial\` — first send
   - \`retry\` — failed send was retried
   - \`manual_resend\` — manually resent
   - \`recall\` — recalled from history
   - \`fire_course\` — new course fired
4. Check the **event timeline** for each send to see who triggered it`,
  },

  // ── 40. Configure timing, alerts, or color changes ──
  {
    slug: 'kds-howto-configure-timing-alerts',
    moduleKey: 'kds',
    route: '/kds',
    questionPattern:
      'configure KDS timing|KDS alerts|KDS color changes|how do I configure KDS timing alerts or color changes for delayed orders|KDS time warnings|KDS overdue alerts|KDS timer settings|KDS ticket aging',
    approvedAnswerMarkdown: `## How Do I Configure KDS Timing, Alerts, or Color Changes for Delayed Orders?

### Per-Station Time Thresholds
Each station has configurable time thresholds:
1. Go to **KDS Settings** → **Stations** → select a station
2. Configure the thresholds:

| Threshold | Default | Meaning |
|-----------|---------|---------|
| **Info** | 300s (5 min) | Normal aging indicator |
| **Warning** | 480s (8 min) | Ticket is getting old — visual color change |
| **Critical** | 720s (12 min) | Ticket is critically overdue — urgent visual + audio |

### Visual Changes
- **Normal** — Standard ticket appearance
- **Warning** — Ticket card changes color to indicate aging
- **Critical** — Ticket card shows urgent styling

The \`alertLevel\` is computed on the server based on elapsed time since \`sent_at\`, so all KDS screens show consistent alert states.

### Audio Alerts
The KDS plays audio tones for important events:
- **Warning tone** — 880Hz for 200ms when a ticket crosses the warning threshold
- **Critical tone** — 1200Hz for 400ms when a ticket crosses the critical threshold
- **Done chime** — Double-beep (660Hz + 880Hz) when all items on a ticket become ready

Audio alerts are:
- Rate-limited to one tone per type per 2 seconds (prevents alarm storms)
- Fired only once per ticket per threshold (tracked in memory)

### Alert Profiles
For more granular control, create **alert profiles** in **KDS Settings** → **Alert Profiles** and assign them to stations.

### Item Prep Times
Configure expected prep times per item in **KDS Settings** → **Item Prep Times**. These drive the \`estimatedPickupAt\` timestamp on tickets, which is used for priority scoring (imminent pickups are boosted).`,
  },

  // ── 41. Transfer order between stations ──
  {
    slug: 'kds-howto-transfer-between-stations',
    moduleKey: 'kds',
    route: '/kds',
    questionPattern:
      'transfer order between stations|move order to another station|reroute KDS order|how do I transfer an order from one prep station to another|KDS station transfer|move ticket to different station',
    approvedAnswerMarkdown: `## How Do I Transfer an Order from One Prep Station to Another?

### Rerouting
To move items from one station to another, you need to adjust the routing rules:
1. Go to **KDS Settings** → **Routing Rules**
2. Create or modify a rule to route the item(s) to the new station
3. Resend the order from the POS

### Manual Workaround
Currently, there is no one-tap "transfer to another station" button on the KDS screen. To move an in-progress ticket:

1. **Clear** the ticket at the current station (bump it)
2. **Update routing rules** if the change is permanent
3. **Resend** the order from the POS — the routing engine will route items to the correct station based on the updated rules

### If the Change Is Temporary
If you only need to reroute one order (not change the permanent routing):
1. Bump the ticket at the current station
2. Communicate the transfer verbally to the other station
3. The other station can view the order details via the expo screen or All Stations view

### Routing Rule Priority
If you need items to temporarily go to a different station, add a high-priority item-level rule for just those specific items. Remove the rule after the transfer is no longer needed.

### Future Enhancement
A direct "transfer to station" feature may be added in a future release. For now, use the routing rules + resend approach.`,
  },

  // ── 42. Canceled items still showing ──
  {
    slug: 'kds-troubleshoot-canceled-items-showing',
    moduleKey: 'kds',
    route: '/kds',
    questionPattern:
      'canceled items still showing on KDS|voided items on KDS|removed items still on KDS|why are canceled items still showing on the KDS|KDS showing canceled|KDS void not updating',
    approvedAnswerMarkdown: `## Why Are Canceled Items Still Showing on the KDS?

### How Cancellation Works
When an item is voided from the POS:
- The corresponding KDS ticket item is set to \`voided\` status
- Voided items should disappear from the active KDS view

### Common Causes of Canceled Items Persisting

1. **Polling delay** — The KDS updates every 8 seconds. The voided status may not have been fetched yet. Wait for the next poll cycle or refresh the page.

2. **Void happened at order level, not item level** — If the entire order was voided but the KDS ticket items weren't individually updated, some items may persist. Check the order status in the POS.

3. **Different order** — Verify that the items on the KDS are actually from the canceled order and not from a different order with similar items.

4. **Stale ticket** — If the ticket is very old, it may be from a previous session. Enable **auto-clear stale tickets** in KDS location settings to automatically clean up old tickets.

### How to Manually Clear
- **Bump** the ticket from the KDS to move it to history
- Use **KDS** → **Order Status** → **Clear** or **Delete** to remove the send tracking entry
- The auto-clear cron will eventually clean up stale tickets if configured

### Prevention
Ensure staff void items from the **POS** (not just verbally in the kitchen). The POS void triggers the KDS ticket item status update.`,
  },

  // ── 43. Partial completion for multi-item orders ──
  {
    slug: 'kds-howto-partial-completion',
    moduleKey: 'kds',
    route: '/kds',
    questionPattern:
      'partial completion multi-item order|some items done KDS|partial bump KDS|how do I handle partial completion for multi-item orders|KDS partial ready|some items ready not all',
    approvedAnswerMarkdown: `## How Do I Handle Partial Completion for Multi-Item Orders?

### Item-Level Bumping
You can mark individual items as ready without bumping the entire ticket:
1. On the KDS screen, tap an **individual item** to mark it as \`ready\`
2. The item changes status, but the ticket remains active with the remaining items
3. The ticket status updates to \`in_progress\` (some items done, some not)

### Ticket Status Progression

| Scenario | Ticket Status |
|----------|-------------|
| No items started | \`pending\` |
| Some items started | \`in_progress\` |
| All items ready | \`ready\` (auto-bump if enabled) |
| Bumped from expo | \`served\` |

### Auto-Bump on All Ready
If **Auto-bump on all ready** is enabled on the station:
- When the last item is marked ready, the ticket automatically bumps to \`ready\`
- No manual ticket-level bump is needed

If disabled, you must manually bump the ticket even after all items are individually ready.

### Multi-Station Tickets
A single order may create tickets at multiple stations. Each station only sees its own items:
- Station A has 3 items, Station B has 2 items
- Station A can bump its items independently of Station B
- The expo sees the combined state across all stations

### Priority Boost for Partial Ready
Tickets with some items ready get a **+800 priority boost**, so they sort higher — helping staff focus on completing partially done orders.`,
  },

  // ── 44. Set up KDS for different dayparts or menus ──
  {
    slug: 'kds-howto-setup-dayparts-menus',
    moduleKey: 'kds',
    route: '/kds',
    questionPattern:
      'KDS for different dayparts|KDS menu change|KDS breakfast lunch dinner|how do I set up KDS for different dayparts or menus|KDS time-based routing|KDS schedule|KDS daypart setup',
    approvedAnswerMarkdown: `## How Do I Set Up KDS for Different Dayparts or Menus?

### Time-Based Routing Rules
Routing rules support **time conditions** that allow different routing during different dayparts:

1. Go to **KDS Settings** → **Routing Rules**
2. Create rules with \`timeConditionStart\` and \`timeConditionEnd\`:
   - **Breakfast** (06:00–11:00): Route "Eggs" category → Breakfast Station
   - **Lunch** (11:00–15:00): Route "Sandwiches" → Main Line
   - **Dinner** (17:00–22:00): Route "Entrees" → Grill Station
   - **Late Night** (22:00–06:00): Route everything → Late Night Station

### Overnight Time Ranges
Time conditions handle overnight ranges correctly. A rule with \`timeConditionStart: '22:00'\` and \`timeConditionEnd: '06:00'\` applies from 10 PM to 6 AM.

### Multiple Rules for Same Items
You can create multiple rules for the same item or category with different time conditions and stations:
- "Burgers" 11:00–15:00 → Lunch Grill (priority 10)
- "Burgers" 17:00–22:00 → Dinner Grill (priority 10)
- "Burgers" fallback → Main Kitchen (priority 1)

### Station Activation
You can also **pause stations** during dayparts when they're not in use:
- Pause "Breakfast Station" at 11:00
- Unpause "Dinner Station" at 17:00
- Paused stations are skipped during routing

### Note
Daypart routing is based on the **current time at dispatch**, not the order time. Items are always routed based on when the "Send to KDS" button is pressed.`,
  },

  // ── 45. Test if station is receiving orders correctly ──
  {
    slug: 'kds-howto-test-station-receiving',
    moduleKey: 'kds',
    route: '/kds',
    questionPattern:
      'test KDS station receiving|verify KDS setup|test KDS routing|how do I test whether a station is receiving orders correctly|KDS test order|KDS setup verification|KDS diagnostic',
    approvedAnswerMarkdown: `## How Do I Test Whether a Station Is Receiving Orders Correctly?

### KDS Setup Verification
1. Go to **KDS Settings** → **Setup**
2. Click **Verify** to run the built-in KDS configuration checker
3. The system validates:
   - Stations exist and are active
   - Routing rules are configured
   - No conflicting rules
   - Fallback stations are available

### KDS Diagnostics
1. Go to **KDS Settings** → **Diagnostics**
2. This tool shows routing diagnostics — you can see how items would be routed based on current rules

### Manual Test
1. Create a test order in the POS with representative items
2. Press **Send to KDS**
3. Check each station's KDS screen to verify:
   - Items appeared on the correct station
   - Modifiers and notes are visible
   - Order type and table/ticket number are correct
4. Bump the test items to verify the bump workflow
5. Check the **KDS** → **Order Status** to verify send tracking

### Checklist for Station Setup
- [ ] Station exists in **KDS Settings** → **Stations** with correct location
- [ ] Station is **not paused** (Pause Receiving = off)
- [ ] Station type is correct (prep, expo, or bar)
- [ ] Routing rules exist for the items you want routed to this station
- [ ] Station's \`allowedOrderTypes\` includes the order type being used (or is empty for all types)
- [ ] KDS device is open to the correct station URL
- [ ] Terminal heartbeat is active (device is online)

### KDS Setup Audit
Use **KDS Settings** → **Setup** → **Audit** for a comprehensive audit of your KDS configuration, identifying potential issues and misconfigurations.`,
  },
];

// ─── Seed Function ───────────────────────────────────────────────────────────

export async function seedTrainingDataBatch3(tenantId: string | null = null) {
  await db
    .insert(aiSupportAnswerCards)
    .values(
      TRAINING_CARDS_BATCH3.map((c) => ({
        ...c,
        tenantId,
        status: 'draft' as const,
        version: 1,
      })),
    )
    .onConflictDoNothing();

  return {
    answerCardsInserted: TRAINING_CARDS_BATCH3.length,
    message: `Inserted ${TRAINING_CARDS_BATCH3.length} answer cards as draft. Review and activate from the admin portal at /ai-assistant/answers.`,
  };
}
