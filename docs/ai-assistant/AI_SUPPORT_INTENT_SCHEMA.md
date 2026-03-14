# AI Support Intent Schema & Training Data

> Generated from codebase analysis — grounded in actual OppsEra features

---

# SECTION 1 — RECOMMENDED SUPPORT BUCKETS

## 1. `how_to_workflow`

**Purpose:** Guide users through multi-step tasks they need to accomplish in the software.

**What belongs here:** "How do I ring up a sale?", "How do I create a reservation?", "How do I close the register?", "How do I run a P&L report?"

**Why it matters:** Highest-volume bucket. Most questions from new users will be how-to. Clean routing here deflects the most tickets.

**Best handled by:** Chatbot + guided workflow. The bot walks users through steps with UI element references (bold button names, menu paths). For complex multi-step workflows (period close, bank reconciliation), link to a KB article with screenshots.

**Split by product area:** Yes — `how_to_workflow.erp`, `how_to_workflow.pos`, `how_to_workflow.reservations`. The workflows are completely different per area.

---

## 2. `troubleshooting_error`

**Purpose:** Diagnose why something isn't working, showing an error, or behaving unexpectedly.

**What belongs here:** "Why is this invoice showing as unpaid?", "Why are inventory counts wrong?", "Why didn't the order send to KDS?", "Why am I getting double bookings?"

**Why it matters:** Second-highest volume. Users are frustrated — fast, accurate diagnosis prevents escalation. Many troubleshooting questions have deterministic root causes that can be checked programmatically.

**Best handled by:** Chatbot + check_configuration / check_live_status. The bot should check account state, permission state, or system status before answering. For hardware issues, escalate. For data mismatches, guide diagnostic steps.

**Split by product area:** Yes. ERP troubleshooting (GL posting errors, tax calc issues) is very different from POS troubleshooting (KDS routing, terminal offline) and reservation troubleshooting (availability conflicts, double bookings).

---

## 3. `transaction_corrections`

**Purpose:** Help users fix, reverse, or adjust completed transactions — voids, refunds, credit memos, journal corrections.

**What belongs here:** "How do I void a transaction?", "How do I issue a refund?", "How do I fix a journal entry posted to the wrong account?", "How do I edit an invoice after posting?"

**Why it matters:** High-risk bucket. Mistakes here affect financials. Many of these operations require manager PIN or elevated permissions. The bot must clearly communicate permission requirements and irreversibility.

**Best handled by:** Chatbot + guided workflow with permission check. The bot should verify the user has the right permission before walking them through the steps. For GL corrections, recommend escalation to someone with `accounting.manage` permission.

**Split by product area:** Yes. ERP corrections (journal entries, credit memos) vs POS corrections (voids, refunds, returns) vs reservation corrections (cancel, no-show fees, deposit refunds).

---

## 4. `billing_payments`

**Purpose:** Questions about payment processing, card transactions, deposits, prepayments, house accounts, gift cards, split payments.

**What belongs here:** "Why did the card decline?", "How do I split a check?", "How do I collect a deposit?", "How do I refund a deposit?"

**Why it matters:** Money-touching operations. Users need confidence the bot is giving correct information. Card decline reasons and payment failures have deterministic causes that can often be diagnosed from transaction status.

**Best handled by:** Chatbot + check_live_status for transaction lookups. For card declines, check the gateway response code. For deposit/refund questions, guide the workflow. For disputed charges or chargebacks, escalate to finance.

**Split by product area:** Partially. POS payments (cash/card/gift card/split tender) and reservation deposits (Stripe auth/capture for PMS, spa deposit rules) are different enough to warrant sub-intents.

---

## 5. `hardware_devices`

**Purpose:** Issues with physical hardware — receipt printers, cash drawers, card terminals, KDS displays.

**What belongs here:** "Receipt printer not printing", "Cash drawer not opening", "Card terminal offline", "KDS not receiving tickets"

**Why it matters:** Hardware issues cannot be resolved through software alone. The bot should run basic diagnostic checks (is the device configured? is it connected?) before escalating. Most hardware issues ultimately need hands-on troubleshooting.

**Best handled by:** Chatbot (initial diagnostics) → escalate_to_hardware_support. Check if device is configured in settings, check connection status. If basic checks pass, escalate.

**Split by product area:** No — hardware is hardware regardless of module. But sub-intents by device type (printer, drawer, terminal, KDS display).

---

## 6. `permissions_access`

**Purpose:** Questions about who can do what, why something is disabled/greyed out, how to grant or restrict access.

**What belongs here:** "How do I set user permissions?", "Why can't I void this order?", "Why is this button greyed out?", "How do I restrict employee access?"

**Why it matters:** Permission issues are the #1 source of "why can't I do X?" frustration. The bot can check the user's role and permissions to give a precise answer: "You need the `orders.void` permission, which is granted to Manager and above."

**Best handled by:** Chatbot + check_configuration. The bot should look up the user's role and the permission required for the action, then either explain why it's blocked or guide the admin to grant the permission.

**Split by product area:** No — the RBAC system is unified across all modules. But the 62 individual permissions span all product areas.

---

## 7. `reporting_analytics`

**Purpose:** Questions about running reports, understanding report data, exporting data, configuring dashboards.

**What belongs here:** "How do I run a P&L by location?", "How do I export to CSV?", "How do I run reports on bookings and no-shows?", "Where do I find the managers report?"

**Why it matters:** Reporting questions are usually quick to answer — point the user to the right report page and explain the filters. But misunderstanding report data can lead to bad business decisions, so accuracy matters.

**Best handled by:** Answer directly or surface KB article. Most reporting questions can be answered with a page path + filter instructions. Complex reports (consolidated P&L, budget vs actual) may need a KB article.

**Split by product area:** Yes — accounting reports, POS close/Z-report, PMS managers report, and spa analytics are all different.

---

## 8. `integrations_sync`

**Purpose:** Questions about connecting external systems, sync failures, data not flowing between systems.

**What belongs here:** "How do I connect to QuickBooks?", "Why is payroll data not syncing?", "How do I sync reservations with Google Calendar?", "How do I connect the card terminal?"

**Why it matters:** Integration questions often reveal feature gaps (OppsEra has no QuickBooks integration — the bot needs to say so clearly rather than hallucinate steps). For existing integrations (CardPointe, Stripe for PMS, Twilio), the bot can guide configuration.

**Best handled by:** Chatbot + check_configuration for existing integrations. For unsupported integrations, answer directly: "This integration is not currently available." Escalate for sync failures.

**Split by product area:** No — integrations are cross-cutting.

---

## 9. `inventory_order_management`

**Purpose:** Questions about inventory levels, receiving, transfers, purchase orders, stock alerts, and order lifecycle.

**What belongs here:** "How do I receive a purchase order?", "How do I transfer inventory between locations?", "Why are inventory counts not matching?", "Why aren't inventory counts updating after sales?"

**Why it matters:** Inventory discrepancies cause operational problems. The bot should understand the distinction between retail inventory and F&B inventory (same module, different UI views) and guide accordingly.

**Best handled by:** Chatbot + guided workflow for receiving/transfers. For count discrepancies, guide diagnostic steps (check movements history, reconciliation). For PO questions, note that OppsEra uses inventory receipts rather than formal POs.

**Split by product area:** Partially — retail inventory vs F&B inventory have different UIs but share the same module.

---

## 10. `reservations_availability`

**Purpose:** Questions about booking conflicts, availability rules, capacity limits, time slot management, waitlists.

**What belongs here:** "Why is this time slot not available?", "How do I block off tables/rooms?", "How do I set capacity limits?", "Why am I getting double bookings?", "How do I manage a waitlist?"

**Why it matters:** Availability conflicts are time-sensitive — a host or front desk agent needs an answer NOW, not after an escalation. Many conflicts have deterministic causes (rate restrictions, out-of-order rooms, booking engine config) that the bot can check.

**Best handled by:** Chatbot + check_live_status. The bot should check availability state, room/table status, and booking rules to explain why a slot is unavailable. For double-booking bugs, escalate.

**Split by product area:** Yes — PMS rooms, spa appointments, and F&B tables/waitlist all have different availability engines.

---

## 11. `account_configuration`

**Purpose:** Questions about setting up or changing system configuration — locations, departments, cost centers, tax rates, booking rules, menu items, rate plans.

**What belongs here:** "How do I add a new location?", "How do I set booking rules?", "How do I change menu items or pricing?", "How do I set cancellation windows?"

**Why it matters:** Configuration changes affect the entire system. The bot should guide users to the right settings page and warn about downstream effects (e.g., changing a tax rate doesn't retroactively change existing orders).

**Best handled by:** Chatbot + guided workflow. Walk users to the correct settings page. For high-impact changes (tax rates, GL mappings, rate plans), recommend review before saving.

**Split by product area:** Yes — ERP config (GL, tax, departments), POS config (menu, modifiers, quick menu), reservation config (rate plans, booking rules, deposit policies) are all different.

---

## 12. `notifications_communications`

**Purpose:** Questions about emails, texts, confirmations not being received, resending notifications.

**What belongs here:** "Why didn't the customer get their confirmation?", "How do I resend a confirmation?", "How do I set up email notifications?"

**Why it matters:** Communication failures erode customer trust. The bot should check if the message was sent (message log) and guide resending. For delivery failures (bounced email, invalid phone), explain the cause.

**Best handled by:** Chatbot + check_live_status (check message log). For resending, guide the workflow. For delivery infrastructure issues, escalate.

**Split by product area:** Partially — PMS and spa have different notification templates and triggers.

---

## Bucket Summary Matrix

| Bucket | Self-Serve | + KB Article | + Guided Workflow | Human Escalation |
|--------|-----------|-------------|-------------------|-----------------|
| `how_to_workflow` | Simple tasks | Complex multi-step | Yes, primary | Rare |
| `troubleshooting_error` | Known causes | Diagnostic guides | Check system state | Data corruption |
| `transaction_corrections` | — | Procedure docs | Yes, with permission check | GL corrections |
| `billing_payments` | Status lookups | Payment guides | Split/refund flows | Chargebacks, disputes |
| `hardware_devices` | Basic diagnostics | Setup guides | Connection checks | Physical issues |
| `permissions_access` | Permission lookups | Role guides | — | Custom role setup |
| `reporting_analytics` | Report navigation | Report explanations | — | Custom reports |
| `integrations_sync` | Config checks | Setup guides | Connection wizard | Sync failures |
| `inventory_order_management` | Stock lookups | Receiving guides | Transfer/receive flow | Count discrepancies |
| `reservations_availability` | Availability checks | Rule explanations | Booking flow | Double-booking bugs |
| `account_configuration` | Simple settings | Config guides | Setup wizard | Complex config |
| `notifications_communications` | Message log check | Template setup | Resend flow | Delivery infra |

---

# SECTION 2 — RECOMMENDED SUPPORT DATA SCHEMA

## Intent Record Schema

```typescript
interface SupportIntent {
  // === IDENTITY (mandatory) ===
  id: string;                          // ULID, auto-generated
  slug: string;                        // Unique, kebab-case (e.g., "how-to-ring-up-sale")

  // === CLASSIFICATION (mandatory) ===
  product_area: 'erp' | 'pos' | 'reservations' | 'cross_cutting';
  bucket: SupportBucket;               // One of the 12 controlled vocabulary buckets
  intent_name: string;                 // Unique intent identifier (e.g., "ring_up_sale")
  sub_intent?: string;                 // Optional refinement (e.g., "with_modifiers")

  // === CONTENT (mandatory) ===
  user_question: string;               // Original user-phrased question
  normalized_question: string;         // Clean, canonical version for retrieval
  question_pattern: string;            // Pipe-separated alternate phrasings for matching
  approved_answer_markdown: string;    // Canonical answer in markdown

  // === METADATA (mandatory) ===
  difficulty: 'easy' | 'medium' | 'hard';
  response_type: ActionType;           // Controlled vocabulary action type

  // === CONTEXT FLAGS (mandatory) ===
  needs_account_context: boolean;      // Requires knowing tenant/user state
  needs_location_context: boolean;     // Requires knowing which location
  needs_hardware_context: boolean;     // Requires knowing device configuration
  needs_permission_context: boolean;   // Requires knowing user's role/permissions

  // === ROUTING (optional but recommended) ===
  module_key?: string;                 // Maps to OppsEra module (fnb, orders, pms, spa, etc.)
  route?: string;                      // Maps to app route (/pos/fnb, /pms/reservations, etc.)
  likely_requires_escalation: boolean;
  escalation_target?: 'support' | 'finance' | 'admin' | 'hardware_support';

  // === RETRIEVAL AIDS (optional) ===
  keywords: string[];                  // For keyword search fallback
  entities: string[];                  // Domain objects referenced (invoice, tab, reservation, etc.)
  related_permissions?: string[];      // Permissions relevant to this intent

  // === KB INTEGRATION (optional) ===
  suggested_kb_article_type?: 'how_to' | 'troubleshooting' | 'reference' | 'video';
  suggested_workflow_type?: 'step_by_step' | 'checklist' | 'decision_tree' | 'diagnostic';

  // === LIFECYCLE (auto-managed) ===
  status: 'draft' | 'active' | 'stale' | 'archived';
  version: number;
  created_at: string;
  updated_at: string;

  // === ANALYTICS (populated over time) ===
  hit_count?: number;
  thumbs_up_count?: number;
  thumbs_down_count?: number;
  avg_confidence?: number;
  last_matched_at?: string;

  // === NOTES ===
  notes?: string;                      // Internal notes for reviewers
}
```

## Controlled Vocabulary Types

```typescript
type SupportBucket =
  | 'how_to_workflow'
  | 'troubleshooting_error'
  | 'billing_payments'
  | 'hardware_devices'
  | 'permissions_access'
  | 'reporting_analytics'
  | 'integrations_sync'
  | 'inventory_order_management'
  | 'reservations_availability'
  | 'account_configuration'
  | 'transaction_corrections'
  | 'notifications_communications';

type ActionType =
  | 'answer_directly'
  | 'ask_clarifying_question'
  | 'guide_workflow'
  | 'surface_kb_article'
  | 'check_configuration'
  | 'check_live_status'
  | 'escalate_to_support'
  | 'escalate_to_finance'
  | 'escalate_to_admin'
  | 'escalate_to_hardware_support';

type ProductArea = 'erp' | 'pos' | 'reservations' | 'cross_cutting';
```

## Field Priority for Retrieval & Routing

| Field | Retrieval | Routing | Analytics | Priority |
|-------|----------|---------|-----------|----------|
| `question_pattern` | **Primary** — pipe-separated fuzzy match | — | — | Critical |
| `normalized_question` | **Secondary** — semantic search | — | — | Critical |
| `bucket` | Bucket filter | **Primary** — determines handler | Aggregate by bucket | Critical |
| `product_area` | Area filter | Area routing | Aggregate by area | Critical |
| `module_key` | Context scoping | Module routing | Module analytics | High |
| `route` | Page-aware matching | — | Screen analytics | High |
| `response_type` | — | **Primary** — determines action | Action distribution | High |
| `keywords` | Keyword fallback | — | Keyword frequency | Medium |
| `entities` | Entity extraction | — | Entity analytics | Medium |
| `needs_*_context` | — | Context pre-fetch | — | Medium |
| `difficulty` | — | Escalation threshold | Complexity trends | Medium |
| `likely_requires_escalation` | — | Auto-escalate flag | Escalation rate | High |
| `related_permissions` | — | Permission check | — | Low |
| `hit_count` / thumbs | — | — | **Primary** for improvement | Analytics-only |

## Mapping to Existing `ai_support_answer_cards` Table

The intent schema maps to the existing answer card schema as follows:

| Intent Schema Field | Answer Card Column | Notes |
|----|----|----|
| `slug` | `slug` | Direct mapping |
| `question_pattern` | `questionPattern` | Direct mapping (pipe-separated) |
| `approved_answer_markdown` | `approvedAnswerMarkdown` | Direct mapping |
| `module_key` | `moduleKey` | Direct mapping |
| `route` | `route` | Direct mapping |
| `status` | `status` | Direct mapping |
| `version` | `version` | Direct mapping |
| `product_area`, `bucket`, `intent_name`, etc. | — | Stored in slug convention + answer markdown metadata |

The extended fields (`bucket`, `product_area`, `difficulty`, `response_type`, context flags, etc.) are **design-time metadata** used for organizing training data and analytics. They don't need separate DB columns — they can be encoded in the slug naming convention and tracked in the training data JSON file. The answer card table remains the runtime store.

### Slug Convention

Encode classification into slugs:
```
{product_area}-{bucket_short}-{intent_name}

Examples:
  pos-howto-ring-up-sale
  erp-troubleshoot-invoice-unpaid
  res-corrections-refund-deposit
  pos-hardware-receipt-printer-not-printing
```

This makes answer cards self-describing and filterable by slug prefix.
