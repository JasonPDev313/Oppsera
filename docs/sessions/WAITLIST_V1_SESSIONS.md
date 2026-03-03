# Waitlist V1 — Session Plan

## Audit Summary

### What Already Exists (Extensive)

The F&B waitlist is **heavily built** — far more than the prompt assumed. This fundamentally changes the session plan. Here's the inventory:

| Layer | Status | What's There |
|---|---|---|
| **Schema** (`fnb_waitlist_entries`) | BUILT | Full table with status lifecycle (`waiting→notified→seated→cancelled→left→expired→no_show`), party size, priority, VIP flag, position, seating preference, guest contact, guest token, auto-promotion offer columns (`offered_table_id`, `offered_at`, `offer_expires_at`, `offer_declined_count`) |
| **Host Settings** (`fnb_host_settings`) | BUILT | `allowOnlineWaitlist`, `requirePhoneForWaitlist`, SMS templates. Also JSONB host settings with `waitlist.*` and `guestSelfService.*` subsections (max size, grace period, auto-remove, priority tags, quoted time, etc.) |
| **Commands (13)** | BUILT | `addToWaitlist`, `hostAddToWaitlist`, `updateWaitlistEntry`, `hostUpdateWaitlistEntry`, `notifyWaitlistGuest`, `notifyWaitlistParty`, `seatFromWaitlist`, `hostSeatFromWaitlist`, `removeFromWaitlist`, `hostRemoveFromWaitlist`, `offerTableToWaitlist`, `acceptTableOffer`, `declineTableOffer` |
| **Queries (5)** | BUILT | `getWaitlist`, `hostListWaitlist`, `hostGetWaitlistEntry`, `hostGetWaitlistStats`, `listWaitlistByCustomer` |
| **Services** | BUILT | `waitlist-promoter.ts` (pure scoring: position + VIP + priority + fit − declines), `wait-time-estimator.ts` (28-day rolling window), `notification-service.ts` (Twilio SMS via `SmsProvider` interface), `notification-templates.ts` (pre-built `waitlist_joined` + `table_ready` templates) |
| **Events (8)** | BUILT | `fnb.waitlist.{added,notified,seated,removed,table_offered,offer_accepted,offer_declined,offer_expired}.v1` |
| **Consumer** | BUILT | `handle-table-available-for-waitlist.ts` — auto-promotes when table becomes available (race-condition guarded, reservation hold check, uses `rankWaitlistForTable`) |
| **Host API (9 routes)** | BUILT | Full CRUD + notify + seat + offer/accept/decline + stats |
| **Guest Public API (3 routes)** | BUILT | `POST /guest/waitlist/join` (rate-limited, token generation), `GET /guest/waitlist/estimate`, `GET|DELETE /guest/waitlist/[token]` |
| **Guest Webapp** | BUILT | Join form (`join-content.tsx`), status tracker (`[token]/page.tsx`) with position circle, progress bar, notified banner with countdown, leave confirmation |
| **Host Stand UI** | BUILT | `WaitlistPanel`, `AddGuestDialog`, `SeatGuestDialog`, `SeatConfirmDialog`, `NotificationComposer`, `QrCodeDisplay`, `StatsBar` — all wired into the host stand layout |
| **Tests** | BUILT | `host-waitlist.test.ts`, `waitlist-auto-promotion.test.ts`, `host-api.test.ts`, `host-stand.test.ts` |

### What's Missing (The V1 Gaps)

The existing system is functional but **operator-hostile** — everything is hardcoded. There's no backend config tool, no branding, no operator customization. The guest webapp is a single hardcoded theme with hardcoded fields.

| Gap | Description | Priority |
|---|---|---|
| **Backend Config Tool** | No admin UI for configuring the waitlist. Host settings exist in JSONB but no settings page exposes them. No branding config at all. | P0 |
| **Branded Guest Webapp** | Current join form uses hardcoded `indigo-500` gradient, hardcoded field set, hardcoded seating options `['Indoor', 'Outdoor', 'Bar', 'Booth']`, hardcoded party sizes `[1-8]`. No operator branding. | P0 |
| **Waitlist Config Schema** | A dedicated config table (like `spa_booking_widget_config`) for branding, form fields, notification templates, queue rules. The existing `fnb_host_settings` JSONB covers operational rules but NOT branding/form/notification config. | P0 |
| **Tenant-Slug Public Routes** | Current guest routes use `?location=UUID` param. No slug-based routing like spa (`/book/[tenantSlug]/spa`). No `resolve-tenant` for waitlist. | P1 |
| **SSE for Real-Time Updates** | Current status page polls every 5-15 seconds. The prompt spec calls for SSE. | P1 |
| **Embed Mode** | No iframe/embed variant of the guest webapp. Spa has full embed pattern to copy. | P1 |
| **Custom Fields** | No support for operator-defined form fields (member number, hotel room, etc.) | P1 |
| **SMS Template Customization UI** | Templates exist in code (`notification-templates.ts`) but operators can't edit them. `fnb_host_settings` has `smsWaitlistAddedTemplate` column but no UI. | P1 |
| **Two-Way SMS** | No inbound SMS handling (guest replies "cancel", "late", "here"). | P2 |
| **Waitlist Analytics Dashboard** | Stats query exists (`hostGetWaitlistStats`) but no dedicated analytics page. No read models for historical trends. | P2 |
| **Pacing Rules** | Settings schema has `pacing` section but no enforcement in the join flow. | P2 |
| **"Check Wait" Without Joining** | `GET /guest/waitlist/estimate` exists but isn't exposed in the guest webapp UI before the join form. | P2 |
| **Grace Period Auto-Remove** | Settings exist (`autoRemoveAfterExpiryMinutes`) but no cron/consumer to enforce it. | P2 |
| **QR Code Generation** | `QrCodeDisplay` component exists but uses a generic URL. Need per-location branded QR. | P3 |
| **Post-Seating Micro-Survey** | Not built. | P3 |
| **A/B Test SMS Templates** | Not built. | P3 |
| **Custom CSS Injection** | Not built for waitlist (spa has the pattern). | P3 |

### Reference Architecture: Spa Booking Config

The spa module provides the exact pattern to follow:

| Aspect | Spa Pattern | Waitlist Equivalent |
|---|---|---|
| **Config table** | `spa_booking_widget_config` — separate from `spa_settings` | New `fnb_waitlist_config` table |
| **JSONB blobs** | `branding`, `businessIdentity`, `contactLocation`, `operational`, `legal`, `seo` | `branding`, `formConfig`, `notificationConfig`, `queueConfig`, `contentConfig` |
| **Public routes** | `/api/v1/spa/public/[tenantSlug]/config` via `resolveTenantBySlug()` | `/api/v1/fnb/public/[tenantSlug]/waitlist/config` |
| **Admin UI** | `booking-content.tsx` — two-column layout (config panel + embed/share) | New `waitlist-config-content.tsx` — same pattern |
| **Guest webapp** | `/(guest)/book/[tenantSlug]/spa/` with `booking-content.tsx` | `/(guest)/waitlist/[tenantSlug]/` — refactor existing pages |
| **Embed** | `/(guest)/book/[tenantSlug]/spa/embed/` with stripped layout | `/(guest)/waitlist/[tenantSlug]/embed/` |
| **Token management** | Appointment number as token | Existing `guest_token` (base64url) — keep as-is |

---

## Revised Session Plan

### Design Decisions (Taken Liberties)

1. **Don't rebuild the service layer** — 13 commands, 5 queries, 3 services, 8 events, 1 consumer already work. Extend, don't rewrite.
2. **Add a dedicated config table** — `fnb_waitlist_config` (mirrors `spa_booking_widget_config`) for branding + form + notifications. Keep operational settings in `fnb_host_settings` JSONB where they already live.
3. **Slug-based routing for public** — new `/(guest)/waitlist/[tenantSlug]/` routes. Keep existing `?location=UUID` routes as backward-compatible aliases (QR codes already printed).
4. **SSE is not worth the complexity for V1** — Vercel's serverless model makes true SSE unreliable. The existing adaptive polling (5s notified / 15s waiting + visibility-change reload) is already good enough. Revisit SSE when moving to Docker/K8s (Stage 4). This is a deliberate departure from the prompt.
5. **Embed mode follows spa pattern exactly** — `/(guest)/waitlist/[tenantSlug]/embed/` with stripped layout.
6. **Two-way SMS is V2** — requires webhook ingress (Twilio → our API) which has infrastructure implications. Not V1.
7. **Pacing enforcement in V1** — simple: check count of entries created in the last N minutes before allowing a new join. No separate pacing_rules table.

---

### Session 1: Waitlist Config Schema & Migration

**Goal:** Create the `fnb_waitlist_config` table and seed defaults. This is the foundation — everything else reads from this config.

**Model routing:** Haiku for migration file creation, Sonnet for schema design.

#### Tasks

1. **Read** `packages/db/migrations/meta/_journal.json` for current highest migration idx
2. **Create Drizzle schema** in `packages/db/src/schema/fnb.ts`:

```
fnb_waitlist_config
├── id (ULID PK)
├── tenant_id (FK, NOT NULL)
├── location_id (FK, nullable — null = tenant-wide default)
├── enabled (boolean, default false)
├── slug_override (text, nullable — for vanity URLs like /waitlist/joes-grill)
│
├── ── Form Config (JSONB, default {}) ──
├── form_config: {
│     minPartySize: 1,
│     maxPartySize: 20,
│     requirePhone: true,
│     enableSeatingPreference: true,
│     seatingOptions: ["Indoor", "Outdoor", "Bar", "Patio"],
│     enableOccasion: false,
│     occasionOptions: ["Birthday", "Anniversary", "Business", "Date Night"],
│     enableNotes: true,
│     notesMaxLength: 500,
│     customFields: [],          // {label, type, required, options?}[]
│     termsText: null
│   }
│
├── ── Notification Config (JSONB, default {}) ──
├── notification_config: {
│     confirmationTemplate: "Hi {guest_name}! You're #{position} ...",
│     readyTemplate: "Hi {guest_name}! Your table at {venue_name} is ready! ...",
│     cancellationTemplate: "Hi {guest_name}, your waitlist spot has been cancelled.",
│     reminderEnabled: false,
│     reminderTemplate: null,
│     reminderAfterMinutes: 30,
│     graceMinutes: 10,
│     autoRemoveAfterGrace: true,
│     enableTwoWaySms: false     // V2
│   }
│
├── ── Queue Config (JSONB, default {}) ──
├── queue_config: {
│     maxCapacity: 50,
│     estimationMethod: "auto",  // "auto" | "manual"
│     autoPromotionEnabled: true,
│     promotionLogic: "first_in_line", // "first_in_line" | "best_fit" | "priority_first"
│     priorityLevels: ["Normal", "VIP"],
│     pacingEnabled: false,
│     pacingMaxPerInterval: 10,
│     pacingIntervalMinutes: 30,
│     allowCheckWaitBeforeJoining: true
│   }
│
├── ── Branding (JSONB, default {}) ──
├── branding: {
│     logoUrl: null,
│     primaryColor: "#6366f1",
│     secondaryColor: "#3b82f6",
│     accentColor: "#22c55e",
│     backgroundColor: null,
│     backgroundImageUrl: null,
│     fontFamily: "Inter",
│     welcomeHeadline: "Join Our Waitlist",
│     welcomeSubtitle: "We'll text you when your table is ready",
│     footerText: null,
│     customCss: null
│   }
│
├── ── Content Config (JSONB, default {}) ──
├── content_config: {
│     whileYouWaitEnabled: false,
│     whileYouWaitType: "text",  // "text" | "menu_link" | "specials"
│     whileYouWaitContent: null,
│     whileYouWaitUrl: null
│   }
│
├── ── Operating Hours (JSONB, default {}) ──
├── operating_hours: {
│     useBusinessHours: true,    // if true, inherit from location hours
│     customHours: null          // override: {dayOfWeek: {open, close}}[]
│   }
│
├── created_at, updated_at
└── UNIQUE(tenant_id, location_id)  // one config per location (null = default)
```

3. **Create migration file** `{next_idx}_waitlist_config.sql` — idempotent with `IF NOT EXISTS`
4. **Update** `_journal.json`
5. **Create config service** in `packages/modules/fnb/src/queries/get-waitlist-config.ts` and `packages/modules/fnb/src/commands/update-waitlist-config.ts`:
   - `getWaitlistConfig(tenantId, locationId)` — returns config with defaults merged
   - `updateWaitlistConfig(ctx, input)` — upsert, validates via Zod, publishes `fnb.waitlist.settings_updated.v1`
6. **Add Zod schemas** to `packages/modules/fnb/src/validation-host.ts`:
   - `waitlistConfigSchema` — full validation with defaults on every field
   - `updateWaitlistConfigSchema` — partial (all fields optional)
7. **Export** from `packages/modules/fnb/src/index.ts`
8. **Write tests** for config defaults, validation, upsert behavior

#### Outputs
- Migration file
- Drizzle schema addition
- Config query + command + Zod schemas
- Tests passing

---

### Session 2: Public Route Refactor (Tenant Slug + Config Endpoint)

**Goal:** Add slug-based public routing for the waitlist, a config endpoint that returns branding + form config, and a tenant resolver — mirroring the spa pattern.

**Model routing:** Sonnet for multi-file route work.

#### Tasks

1. **Create** `apps/web/src/app/api/v1/fnb/public/[tenantSlug]/resolve-waitlist-tenant.ts`:
   - `resolveWaitlistTenant(tenantSlug)` — admin client, checks tenant active + waitlist enabled
   - Returns `{ tenantId, tenantName, locationId, tenantSlug }` or null
   - Mirror `apps/web/src/app/api/v1/spa/public/resolve-tenant.ts` exactly

2. **Create** `apps/web/src/app/api/v1/fnb/public/[tenantSlug]/waitlist/config/route.ts`:
   - `GET` — returns public-safe config (branding, form config, content config, operating hours)
   - Strips internal fields (queue_config details, notification templates)
   - Rate-limited via `RATE_LIMITS.publicRead`
   - Response: `{ data: { branding, form, content, operatingHours, venueName, estimatedWait } }`

3. **Create** `apps/web/src/app/api/v1/fnb/public/[tenantSlug]/waitlist/join/route.ts`:
   - `POST` — guest joins waitlist (mirrors existing `guest/waitlist/join` but with slug-based tenant resolution + config-driven validation)
   - Validates party size against `formConfig.minPartySize` / `maxPartySize`
   - Validates required fields per config
   - Checks capacity against `queueConfig.maxCapacity`
   - Checks pacing limits if `pacingEnabled`
   - Returns `{ data: { token, position, estimatedMinutes } }`
   - Rate-limited via `RATE_LIMITS.publicWrite`

4. **Create** `apps/web/src/app/api/v1/fnb/public/[tenantSlug]/waitlist/status/[token]/route.ts`:
   - `GET` — guest status (position, estimate, status, branding)
   - `DELETE` — guest cancels
   - Rate-limited

5. **Create** `apps/web/src/app/api/v1/fnb/public/[tenantSlug]/waitlist/estimate/route.ts`:
   - `GET` — check wait without joining
   - Returns `{ data: { estimatedMinutes, queueLength, accepting } }`

6. **Keep existing** `/api/v1/guest/waitlist/*` routes working — backward compatibility for existing QR codes

7. **Write tests** for all new routes (happy path, rate limit, invalid slug, disabled waitlist, capacity full, pacing exceeded)

#### Outputs
- Tenant resolver
- 4 new public API routes
- Tests passing

---

### Session 3: Branded Guest Webapp

**Goal:** Refactor the guest webapp to be config-driven and operator-branded. New slug-based routes, keep existing token routes working.

**Model routing:** Sonnet for multi-file frontend work.

#### Tasks

1. **Create** `apps/web/src/app/(guest)/waitlist/[tenantSlug]/page.tsx`:
   - Fetches config from `/api/v1/fnb/public/[tenantSlug]/waitlist/config`
   - Renders branded join form driven by config (colors, logo, fields, options)
   - Shows current wait estimate before joining (if `allowCheckWaitBeforeJoining`)
   - Submits to new slug-based join endpoint
   - On success, redirects to `/(guest)/waitlist/[tenantSlug]/status/[token]`

2. **Create** `apps/web/src/app/(guest)/waitlist/[tenantSlug]/status/[token]/page.tsx`:
   - Config-driven status tracker with operator branding
   - Same adaptive polling pattern (5s notified / 15s waiting)
   - Branding: gradient uses `primaryColor` + `secondaryColor`, logo displayed, custom footer
   - "While you wait" content block from `contentConfig`
   - Cancel flow

3. **Create** `apps/web/src/app/(guest)/waitlist/[tenantSlug]/embed/layout.tsx`:
   - Stripped layout for iframe embedding (mirrors spa embed layout)
   - `fixed inset-0 z-50 overflow-auto bg-surface`

4. **Create** `apps/web/src/app/(guest)/waitlist/[tenantSlug]/embed/page.tsx`:
   - Same as main page but passes `isEmbed={true}`
   - Custom CSS injection with sanitization (copy spa pattern: strip `<script>`, `javascript:`, `expression()`, `@import`, `data:` URIs)

5. **Refactor existing** `join-content.tsx` and `[token]/page.tsx`:
   - Extract shared components: `WaitlistJoinForm`, `WaitlistStatusTracker`, `PositionCircle`, `WaitProgress`, `NotifiedBanner`
   - Old routes (`/waitlist/join?location=UUID`) continue to work using existing non-branded components
   - New routes (`/waitlist/[tenantSlug]`) use branded variants

6. **Design requirements** (from the prompt, taken seriously):
   - Join form: minimal fields visible, optional fields in expandable "More options" section
   - Position tracker: subtle fade animation on position number change (CSS transition)
   - Notified banner: pulsing green with countdown timer (already exists, apply branding)
   - Loading skeleton: smooth shimmer (already exists)
   - Error states: styled, not raw text (already exists for invalid token)
   - Empty state: "Waitlist Full" or "Waitlist Closed" with operator messaging
   - 320px minimum width tested

#### Outputs
- 4 new guest-facing pages (join, status, embed layout, embed page)
- Shared extracted components
- Backward-compatible existing routes
- Config-driven branding applied

---

### Session 4: Backend Configuration UI

**Goal:** Admin settings interface for operators to configure every aspect of the waitlist. Mirror spa `booking-content.tsx` pattern — two-column layout with config panel + embed/share.

**Model routing:** Sonnet for complex dashboard UI.

#### Tasks

1. **Create** `apps/web/src/app/(dashboard)/host/waitlist-config/page.tsx` and `waitlist-config-content.tsx`:
   - Two-column layout: left = config sections, right = embed code + QR + preview link
   - Same `config` / `draft` / `current` state pattern as spa booking config
   - `useFetch` for loading, `useMutation` for saving

2. **Config sections** (collapsible, like spa):

   **General Settings**
   - Enable/disable waitlist toggle
   - Operating hours (inherit from business hours or custom)
   - Max capacity slider (1–200)
   - Wait estimation method radio (auto / manual)

   **Guest Form**
   - Party size min/max (number inputs)
   - Require phone toggle
   - Seating preference toggle + editable options list
   - Occasion toggle + editable options list
   - Notes toggle + max length
   - Custom fields builder (add/remove/reorder — label, type, required, options for select)
   - Terms/disclaimer textarea

   **Notifications**
   - SMS confirmation template with merge tag helper (clickable tags insert `{guest_name}`, `{position}`, etc.)
   - SMS ready template with merge tags
   - SMS cancellation template
   - Optional reminder toggle + template + delay minutes
   - Grace period minutes slider (5–30)
   - Auto-remove after grace toggle

   **Queue Management**
   - Priority levels list editor
   - Auto-promotion toggle
   - Promotion logic select (FIFO / best fit / priority first)
   - Pacing toggle + max per interval + interval minutes
   - Allow check wait before joining toggle

   **Branding**
   - Logo URL input (with preview)
   - Color pickers: primary, secondary, accent, background
   - Background image URL
   - Font family select (Inter, Plus Jakarta Sans, DM Sans, Poppins, System)
   - Welcome headline + subtitle text inputs
   - Footer text
   - Custom CSS textarea with warning

   **Content**
   - "While you wait" toggle
   - Content type select (text / menu link / specials)
   - Content body textarea or URL input

3. **Embed & Share panel** (right column):
   - Direct link: `{origin}/waitlist/{tenantSlug}` with copy button
   - Embed iframe code with copy button
   - QR code preview (rendered client-side, downloadable as PNG)
   - "Open preview" button (opens guest webapp in new tab)

4. **API routes**:
   - `GET /api/v1/fnb/host/waitlist-config/route.ts` — returns config (permission: `pos_fnb.host.manage`)
   - `PATCH /api/v1/fnb/host/waitlist-config/route.ts` — updates config (permission: `pos_fnb.host.manage`)

5. **Navigation** — add "Waitlist Config" to host settings navigation (check `apps/web/src/lib/navigation.ts`)

#### Outputs
- Full admin config page with all 6 sections
- Embed/share panel with QR code
- API routes for config CRUD
- Navigation wired up

---

### Session 5: Host Stand Enhancements

**Goal:** Enhance the existing host stand waitlist panel with config-driven behavior, improved UX, and analytics bar.

**Model routing:** Sonnet for cross-component host stand work.

#### Tasks

1. **Enhance** `WaitlistPanel.tsx`:
   - Color-coded status badges: Waiting (blue), Notified (amber), Grace Period (orange + countdown), Expired (red)
   - Each entry shows: name, party size, elapsed wait, quoted wait, seating preference, VIP badge, priority level, notes preview (truncated)
   - One-tap actions: Seat, Notify, Edit, Cancel, Bump Up, Bump Down
   - Inline edit mode (tap Edit → fields become editable in-place)
   - VIP/priority flagging (with manager approval if required by config)

2. **Enhance** `StatsBar.tsx`:
   - Current queue size, avg wait time, longest wait, abandonment count today
   - Data from `hostGetWaitlistStats` (already built)

3. **Guest profile peek**:
   - When phone matches an existing `fnb_guest_profiles` entry, show inline: visit count, segment tag, preferences, reliability score
   - Uses `getGuestProfile` query (already built)

4. **Config-aware behavior**:
   - Respect `queueConfig.maxCapacity` — show "Queue Full" badge when at capacity
   - Respect `queueConfig.priorityLevels` — priority selector shows operator-configured levels
   - Respect `notificationConfig.graceMinutes` — countdown uses config value

5. **Auto-promotion visibility**:
   - When `autoPromotionEnabled`, show a small indicator on entries that were auto-promoted
   - When an offer is pending, show the offered table number and expiry countdown

#### Outputs
- Enhanced waitlist panel with color-coded statuses
- Guest profile peek integration
- Config-driven behavior
- Analytics bar data

---

### Session 6: Grace Period Enforcement & Pacing

**Goal:** Wire up the missing enforcement logic — auto-remove expired entries, enforce pacing limits.

**Model routing:** Haiku for focused service logic.

#### Tasks

1. **Create** `packages/modules/fnb/src/commands/expire-waitlist-entries.ts`:
   - Called on a schedule (API route hit by Vercel cron, or consumer on a timer event)
   - Finds entries where `status = 'notified'` AND `notifiedAt + graceMinutes < now()`
   - If `autoRemoveAfterGrace` is true: set status → `expired`, recompute positions, publish event
   - If false: just flag as overdue (let host decide)

2. **Create** cron API route `apps/web/src/app/api/v1/cron/waitlist-sweep/route.ts`:
   - `GET` (Vercel cron) — sweep all tenants for expired entries
   - Batch process (not one-by-one) for efficiency
   - Uses `createAdminClient()` (cron has no user context)

3. **Enforce pacing** in the join flow:
   - In the slug-based join route, before inserting: count entries created in the last `pacingIntervalMinutes` for this location
   - If count >= `pacingMaxPerInterval`, return `{ error: { code: 'PACING_LIMIT', message: 'We're at capacity right now. Please try again in a few minutes.' } }`

4. **Wire** `vercel.json` cron (or note it for manual setup):
   - `POST /api/v1/cron/waitlist-sweep` every 2 minutes

5. **Tests** for expiry sweep and pacing enforcement

#### Outputs
- Grace period auto-expiry command
- Cron route for sweep
- Pacing enforcement in join flow
- Tests passing

---

### Session 7: Analytics Read Models & Dashboard

**Goal:** Waitlist analytics — historical trends, quote accuracy, abandonment tracking.

**Model routing:** Sonnet for schema + consumer + dashboard.

#### Tasks

1. **Create read model table** `rm_fnb_waitlist_metrics`:
   - Aggregates per location per business_date: total_joined, total_seated, total_cancelled, total_no_show, total_abandoned (left), avg_wait_minutes, avg_quoted_minutes, quote_accuracy_pct, peak_hour, party_size_distribution (JSONB), source_distribution (JSONB)

2. **Create event consumer** `handle-waitlist-for-metrics.ts`:
   - Listens to `fnb.waitlist.{added,seated,removed}.v1`
   - Upserts into `rm_fnb_waitlist_metrics` (increment counters, recalculate averages)

3. **Create** dashboard analytics route `GET /api/v1/fnb/host/waitlist/analytics/route.ts`:
   - Date range filter
   - Returns: time series (daily), summary KPIs, party size distribution, peak demand heatmap data

4. **Create** analytics UI component — could be a section on the waitlist config page or a separate page:
   - KPI cards: Avg Wait, Quote Accuracy, Conversion Rate, Abandonment Rate
   - Chart: daily volume (joined vs seated vs abandoned)
   - Heatmap: demand by hour of day / day of week

5. **Migration** for `rm_fnb_waitlist_metrics` + `_journal.json` update

#### Outputs
- Read model table + migration
- Event consumer for metrics
- Analytics API route
- Dashboard analytics UI

---

## Session Dependency Graph

```
Session 1 (Config Schema)
    │
    ├──→ Session 2 (Public Routes)
    │        │
    │        └──→ Session 3 (Branded Guest Webapp)
    │
    ├──→ Session 4 (Backend Config UI)
    │
    ├──→ Session 5 (Host Stand Enhancements)
    │
    └──→ Session 6 (Grace Period + Pacing)

Session 1 ──→ Session 7 (Analytics) [can start after Session 1, independent of 2-6]
```

Sessions 2-6 all depend on Session 1 (config schema). Sessions 2→3 are sequential. Sessions 4, 5, 6 are independent of each other and can run in any order after Session 1.

---

## What We're NOT Building in V1

| Feature | Reason | When |
|---|---|---|
| **SSE real-time updates** | Vercel serverless can't hold connections. Adaptive polling at 5s/15s is good enough. | V2 (Docker/K8s) |
| **Two-way SMS** | Requires Twilio webhook ingress, message parsing, intent detection. Infrastructure overhead. | V2 |
| **Multi-language support** | Requires i18n framework, translation management. Significant effort for low initial demand. | V2 |
| **A/B test SMS templates** | Need statistical significance engine, variant tracking. Over-engineered for launch. | V2 |
| **Post-seating micro-survey** | Nice-to-have, not essential for launch. | V2 |
| **Google Reserve integration** | Requires Google partnership and API approval. | V2+ |
| **WhatsApp messaging** | Requires WhatsApp Business API setup. | V2+ |
| **Custom CSS injection** | Built for spa, easy to add later. Included in schema but UI deferred. | V1.1 |

---

## File Inventory (New + Modified)

### New Files

```
packages/db/migrations/{idx}_waitlist_config.sql
packages/db/migrations/{idx}_waitlist_metrics_read_model.sql

packages/modules/fnb/src/commands/update-waitlist-config.ts
packages/modules/fnb/src/commands/expire-waitlist-entries.ts
packages/modules/fnb/src/queries/get-waitlist-config.ts
packages/modules/fnb/src/consumers/handle-waitlist-for-metrics.ts

apps/web/src/app/api/v1/fnb/public/[tenantSlug]/resolve-waitlist-tenant.ts
apps/web/src/app/api/v1/fnb/public/[tenantSlug]/waitlist/config/route.ts
apps/web/src/app/api/v1/fnb/public/[tenantSlug]/waitlist/join/route.ts
apps/web/src/app/api/v1/fnb/public/[tenantSlug]/waitlist/status/[token]/route.ts
apps/web/src/app/api/v1/fnb/public/[tenantSlug]/waitlist/estimate/route.ts
apps/web/src/app/api/v1/fnb/host/waitlist-config/route.ts
apps/web/src/app/api/v1/cron/waitlist-sweep/route.ts
apps/web/src/app/api/v1/fnb/host/waitlist/analytics/route.ts

apps/web/src/app/(guest)/waitlist/[tenantSlug]/page.tsx
apps/web/src/app/(guest)/waitlist/[tenantSlug]/join-content.tsx
apps/web/src/app/(guest)/waitlist/[tenantSlug]/status/[token]/page.tsx
apps/web/src/app/(guest)/waitlist/[tenantSlug]/status/[token]/status-content.tsx
apps/web/src/app/(guest)/waitlist/[tenantSlug]/embed/layout.tsx
apps/web/src/app/(guest)/waitlist/[tenantSlug]/embed/page.tsx

apps/web/src/app/(dashboard)/host/waitlist-config/page.tsx
apps/web/src/app/(dashboard)/host/waitlist-config/waitlist-config-content.tsx
```

### Modified Files

```
packages/db/src/schema/fnb.ts                          (add fnbWaitlistConfig table)
packages/db/migrations/meta/_journal.json               (new migration entries)
packages/modules/fnb/src/index.ts                       (export new commands/queries)
packages/modules/fnb/src/validation-host.ts             (add config Zod schemas)
packages/modules/fnb/src/events/host-events.ts          (add SETTINGS_UPDATED event)

apps/web/src/components/fnb/host/WaitlistPanel.tsx      (color-coded statuses, actions)
apps/web/src/components/fnb/host/StatsBar.tsx            (analytics bar)
apps/web/src/lib/navigation.ts                          (add waitlist config nav)
```

---

## Success Criteria

By the end of all 7 sessions:

1. An operator can configure their waitlist fully from the backend settings — form fields, branding, notifications, queue rules, content — without code changes
2. A guest can scan a QR code or visit a branded URL and join the waitlist from their phone in under 30 seconds
3. The guest sees their real-time position and estimated wait (polling, not SSE)
4. The guest receives SMS when their table is ready (using existing notification service)
5. The guest can cancel from their phone (one tap)
6. The host can manage the full queue from the existing host stand (enhanced)
7. Seating from waitlist is atomic (table locked, check opened, events published — already works)
8. Auto-promotion fires when a table frees (already works)
9. Queue positions recalculate on every state change (already works)
10. Analytics track wait accuracy, abandonment, conversion, peak times
11. The webapp works standalone and as an embeddable iframe widget
12. Operator branding (colors, logo, fonts, content) is fully applied
13. All existing QR codes and URLs continue to work (backward compatible)
14. Type-check and tests pass after every session
