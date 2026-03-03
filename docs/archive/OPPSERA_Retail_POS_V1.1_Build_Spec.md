# OPPSERA — World-Class Retail POS V1.1

## Comprehensive Build Specification & Sequential Session Prompts

**Prepared for:** Jason Pearsall
**Date:** February 21, 2026
**Version:** 1.0
**Total Sessions:** 12

---

## Executive Summary

This document provides a comprehensive specification and build plan for upgrading OppsEra's existing Retail POS module from V1.0 to V1.1 (World-Class). The upgrade adds nine major feature blocks that transform the POS from a basic sales terminal into a competitive retail system on par with Square, Shopify POS, and Toast.

The work is organized into 12 sequential Claude sessions. Each session is self-contained with a complete prompt you can paste directly into Claude. Sessions are ordered by dependency chain: schema foundations first, then core features, then UX, then integration/polish.

---

## What Already Exists (Do Not Duplicate)

- Dual-mode POS shells (Retail + F&B) sharing one commerce engine (orders module)
- Retail POS: 4-level catalog nav, search, barcode scan, cart, hold/recall, discounts, service charges, price override, order history
- Payments module (cash V1) with GL posting via AccountingPostingApi
- Terminal config + shift state in localStorage (V1 — needs server upgrade)
- 36-table customer module with memberships, billing, AR, wallets, segments
- Full accounting stack: GL, COA, AP, AR, financial statements, close workflow
- Inventory module: append-only movements, receiving, vendor management, PO schema
- Reporting: CQRS read models, custom report builder, dashboards, AI insights integration

---

## V1.1 Feature Blocks

| # | Feature Block | Description | Sessions | Priority |
|---|---------------|-------------|----------|----------|
| 1 | Returns & Exchanges | Receipt lookup, return/exchange flows, refund routing, inventory restock | 2–3 | P0 — Critical |
| 2 | Gift Cards | Sell, redeem, balance check, liability accounting | 4 | P0 — Critical |
| 3 | Store Credit | Customer wallet, issue from returns, redeem at checkout | 4 | P0 — Critical |
| 4 | Promotions Engine | Rules, coupons, BOGO, stacking, server-side apply | 5–6 | P1 — High |
| 5 | Terminal + Drawer | Server-backed terminals, drawer sessions, blind close | 1 | P0 — Critical |
| 6 | Fulfillment Modes | Take-now, pickup, ship-from-store, split fulfillment | 7 | P1 — High |
| 7 | Receipts | Gift receipt, return receipt, email/SMS send stubs | 8 | P1 — High |
| 8 | Cross-Module Integration | PMS/tee sheet order push, reporting consumers, AI lens | 9–10 | P1 — High |
| 9 | RBAC + Audit + Security | Permissions, manager PIN, audit trail hardening | 11 | P0 — Critical |

---

## Session Dependency Graph

```
Session 1 (Schema + Terminals) ──► Session 2 (Returns Backend) ──► Session 3 (Returns Frontend)
Session 1 ──► Session 4 (Gift Cards + Store Credit) ──► Session 8 (Receipts)
Session 1 ──► Session 5 (Promotions Backend) ──► Session 6 (Promotions Frontend)
Session 1 ──► Session 7 (Fulfillment Modes)
Sessions 2–8 ──► Session 9 (Cross-Module: Reporting + Inventory)
Sessions 2–8 ──► Session 10 (Cross-Module: Service Modules + AI)
Sessions 1–10 ──► Session 11 (RBAC + Audit + Manager PIN)
Session 11 ──► Session 12 (Integration Testing + Polish)
```

---

## Session 1: Schema Foundation + Terminal & Drawer Hardening

**Objective:** Create all new database tables for V1.1 features and upgrade terminal/shift management from localStorage to server-backed.
**Dependencies:** None (first session)
**Estimated Scope:** Large (schema + backend + frontend)

### Scope

- All new Drizzle schema tables: `return_transactions`, `return_lines`, `gift_cards`, `gift_card_ledger`, `store_credit_accounts`, `store_credit_ledger`, `promotion_rules`, `order_promotions_applied`, `pos_terminals`, `pos_terminal_settings`, `cash_drawer_sessions`, `order_fulfillments`
- ALTER existing tables: `orders` (add `order_kind`, `original_order_id`, `return_transaction_id`), `order_lines` (add `fulfillment_mode`, `fulfillment_status`), `tenders` (ensure `tender_type` enum covers CASH, GIFT_CARD, STORE_CREDIT, CARD, HOUSE_ACCOUNT)
- SQL migration file with RLS policies for all new tables
- Indexes and constraints: unique `gift_card.card_number` per tenant, partial unique for one open drawer per terminal, append-only enforcement on ledger tables
- Server-backed terminal registration, settings, and drawer session commands/queries/routes
- Replace localStorage in `usePOSConfig` and `useShift` with server-backed hooks

### Deliverables

- Drizzle schema files for all new tables
- SQL migration (`0080_retail_pos_v11.sql`) with RLS
- Terminal + drawer backend: 8 commands, 4 queries, ~12 API routes
- Updated frontend hooks: `usePOSConfig`, `useShift`, `useTerminalSettings`, `useDrawerSession`
- Terminal registration + settings editor UI in POS Settings
- Drawer session UI: open, paid-in/out, close, blind close, over/short display

### Claude Prompt

```
# OPPSERA RETAIL POS V1.1 — SESSION 1: SCHEMA FOUNDATION + TERMINAL & DRAWER HARDENING

You are extending OppsEra, a multi-tenant modular-monolith ERP.
Read CLAUDE.md and CONVENTIONS.md first. Follow ALL existing patterns exactly.

## TASK 1: DATABASE SCHEMA (new tables)

Create Drizzle schema file: packages/db/src/schema/retail-pos-v11.ts

### New Tables

**return_transactions**
id, tenant_id, location_id, terminal_id, return_order_id (FK orders), original_order_id (FK orders), return_type ENUM('RETURN','EXCHANGE'), reason_code TEXT, reason_note TEXT, policy_snapshot JSONB, restock_complete BOOLEAN DEFAULT false, created_by TEXT NOT NULL, created_at TIMESTAMPTZ

**return_lines**
id, tenant_id, return_transaction_id (FK return_transactions), original_order_line_id (FK order_lines), catalog_item_id TEXT NOT NULL, catalog_item_name TEXT NOT NULL, qty NUMERIC NOT NULL, unit_price_cents INTEGER NOT NULL, refund_amount_cents INTEGER NOT NULL, restock_action ENUM('RESTOCK','SCRAP','DAMAGED','NO_RESTOCK'), condition_code TEXT, inventory_movement_id TEXT, created_at TIMESTAMPTZ

**gift_cards**
id, tenant_id, card_number TEXT NOT NULL, status ENUM('active','inactive','expired','voided') DEFAULT 'active', initial_balance_cents INTEGER NOT NULL, balance_cents INTEGER NOT NULL, currency TEXT DEFAULT 'USD', issued_order_id TEXT, issued_by TEXT, issued_at TIMESTAMPTZ, expires_at TIMESTAMPTZ, customer_id TEXT, metadata JSONB, created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ
UNIQUE INDEX on (tenant_id, card_number)

**gift_card_ledger** (append-only)
id, tenant_id, gift_card_id (FK gift_cards), entry_type ENUM('ISSUE','REDEEM','ADJUST','VOID'), amount_cents INTEGER NOT NULL, running_balance_cents INTEGER NOT NULL, order_id TEXT, tender_id TEXT, created_by TEXT NOT NULL, created_at TIMESTAMPTZ, metadata JSONB
NO UPDATE/DELETE RLS policies

**store_credit_accounts**
id, tenant_id, customer_id (FK customers) NOT NULL, balance_cents INTEGER NOT NULL DEFAULT 0, status ENUM('active','frozen','closed') DEFAULT 'active', created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ
UNIQUE INDEX on (tenant_id, customer_id)

**store_credit_ledger** (append-only)
id, tenant_id, account_id (FK store_credit_accounts), entry_type ENUM('ISSUE','REDEEM','ADJUST','VOID'), amount_cents INTEGER NOT NULL, running_balance_cents INTEGER NOT NULL, order_id TEXT, return_transaction_id TEXT, created_by TEXT NOT NULL, created_at TIMESTAMPTZ, metadata JSONB
NO UPDATE/DELETE RLS policies

**promotion_rules**
id, tenant_id, name TEXT NOT NULL, description TEXT, status ENUM('active','inactive','scheduled','expired') DEFAULT 'inactive', priority INTEGER DEFAULT 0, rule_type ENUM('percent_off','fixed_off','bogo','buy_x_get_y','threshold','category_discount','brand_discount'), conditions JSONB NOT NULL DEFAULT '{}', effects JSONB NOT NULL DEFAULT '{}', stackability JSONB DEFAULT '{"allowStacking":false,"stackGroup":null}', coupon_code TEXT, max_uses INTEGER, current_uses INTEGER DEFAULT 0, start_at TIMESTAMPTZ, end_at TIMESTAMPTZ, location_ids JSONB, created_by TEXT, created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ

**order_promotions_applied**
id, tenant_id, order_id (FK orders), promotion_rule_id (FK promotion_rules), coupon_code TEXT, discount_cents INTEGER NOT NULL, allocation JSONB NOT NULL, created_at TIMESTAMPTZ

**pos_terminals**
id, tenant_id, location_id (FK locations) NOT NULL, name TEXT NOT NULL, device_identifier TEXT, status ENUM('active','inactive') DEFAULT 'active', last_seen_at TIMESTAMPTZ, registered_by TEXT, created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ
UNIQUE INDEX on (tenant_id, location_id, name)

**pos_terminal_settings**
id, tenant_id, terminal_id (FK pos_terminals) NOT NULL UNIQUE, settings JSONB NOT NULL DEFAULT '{}', updated_at TIMESTAMPTZ, updated_by TEXT
Settings JSONB shape: { receiptPrinter, barcodeScanner, cashDrawer, customerDisplay, defaultTaxDisplay, roundingRule, autoLogoutMinutes, requireDrawerOpen }

**cash_drawer_sessions**
id, tenant_id, location_id (FK locations) NOT NULL, terminal_id (FK pos_terminals) NOT NULL, status ENUM('open','closed') DEFAULT 'open', opened_by TEXT NOT NULL, opened_at TIMESTAMPTZ NOT NULL, opening_float_cents INTEGER NOT NULL DEFAULT 0, closed_by TEXT, closed_at TIMESTAMPTZ, declared_cents INTEGER, expected_cents INTEGER, over_short_cents INTEGER, blind_close BOOLEAN DEFAULT false, paid_in_total_cents INTEGER DEFAULT 0, paid_out_total_cents INTEGER DEFAULT 0, notes TEXT, created_at TIMESTAMPTZ
PARTIAL UNIQUE INDEX: (tenant_id, terminal_id) WHERE status = 'open'

**cash_drawer_events**
id, tenant_id, drawer_session_id (FK cash_drawer_sessions) NOT NULL, event_type ENUM('paid_in','paid_out','cash_drop','float_adjustment'), amount_cents INTEGER NOT NULL, reason TEXT NOT NULL, created_by TEXT NOT NULL, created_at TIMESTAMPTZ

**order_fulfillments**
id, tenant_id, order_id (FK orders), order_line_id (FK order_lines), fulfillment_mode ENUM('take_now','pickup','ship') DEFAULT 'take_now', fulfillment_status ENUM('pending','ready','picked_up','shipped','delivered','canceled') DEFAULT 'pending', shipping_address JSONB, shipping_fee_cents INTEGER DEFAULT 0, tracking_number TEXT, notes TEXT, created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ

### ALTER existing tables
- orders: ADD order_kind TEXT DEFAULT 'SALE' CHECK IN ('SALE','RETURN','EXCHANGE'), ADD original_order_id TEXT REFERENCES orders(id), ADD return_transaction_id TEXT
- order_lines: ADD fulfillment_mode TEXT DEFAULT 'take_now', ADD fulfillment_status TEXT DEFAULT 'pending'

## TASK 2: SQL MIGRATION

Create migration 0080_retail_pos_v11.sql:
- All CREATE TABLE statements
- ALTER TABLE for orders + order_lines
- RLS: ENABLE ROW LEVEL SECURITY + FORCE on every table
- Standard 4 policies per table (select, insert, update, delete) using app.current_tenant_id
- Ledger tables (gift_card_ledger, store_credit_ledger, cash_drawer_events): SELECT + INSERT only (no update/delete policies)
- All indexes listed above

## TASK 3: TERMINAL + DRAWER BACKEND

Location: packages/modules/orders/src/ (extend existing module)

### Commands (one file each in commands/):
- registerTerminal(ctx, input) — create pos_terminal + default settings
- updateTerminalSettings(ctx, input) — update JSONB settings, optimistic lock
- deactivateTerminal(ctx, input) — soft-deactivate
- openDrawerSession(ctx, input) — validate no open session for terminal, create session
- recordDrawerEvent(ctx, input) — paid_in/paid_out/cash_drop, update running totals
- closeDrawerSession(ctx, input) — compute expected from tenders+events, calc over/short, support blind_close
- getDrawerExpected(ctx, input) — compute expected cash from tenders in session window

### Queries:
- getTerminalSettings(tenantId, terminalId)
- listTerminals(tenantId, locationId, filters)
- getCurrentDrawerSession(tenantId, terminalId)
- getDrawerSessionHistory(tenantId, terminalId, filters)

### API Routes under /api/v1/pos/terminals/ and /api/v1/pos/drawers/:
Standard REST. Use withMiddleware with entitlement: 'pos_retail'.
Permissions: pos.terminals.manage, pos.drawers.manage, pos.drawers.view

### Events:
- pos.terminal.registered.v1, pos.drawer.opened.v1, pos.drawer.closed.v1, pos.drawer.event.v1

## TASK 4: FRONTEND — TERMINAL + DRAWER

### Replace localStorage hooks:
- usePOSConfig: fetch terminal settings from API instead of localStorage. Keep same interface.
- useShift: rename to useDrawerSession. Fetch/mutate via API. Open/close/paid-in/paid-out.

### New Settings UI:
- Add "POS Terminals" page under Settings sidebar
- Terminal list with register button
- Terminal detail: settings editor (JSON-backed form with labeled fields)
- Drawer session panel: current session status, open/close buttons, paid-in/out dialog, session history table

### POS integration:
- On POS load: check for open drawer session. If none, prompt to open drawer before allowing sales.
- Drawer indicator in POS header: green dot = open, red = no session
- Close drawer flow: count screen, declare amount, show over/short, confirm

Follow ALL existing patterns: code-split pages, portal-based dialogs, useFetch/useMutation hooks, bg-surface colors, z-index conventions.
```

---

## Session 2: Returns & Exchanges Backend

**Objective:** Implement complete return/exchange backend logic including inventory integration and accounting entries.
**Dependencies:** Session 1 (schema + migration)
**Estimated Scope:** Large

### Scope

- Return transaction commands with full business logic
- Receipt/order lookup for returns
- Inventory movement integration (restock/scrap/damaged)
- Accounting entries for sales reversal, tax reversal, tender reversal
- Store credit issuance on return (wires to Session 4 store credit tables)
- API routes for return workflow
- Events for downstream consumers

### Deliverables

- 8 commands: `createReturnTransaction`, `addReturnLine`, `removeReturnLine`, `updateReturnLine`, `finalizeReturn`, `voidReturn`, `createExchange`, `finalizeExchange`
- 5 queries: `lookupOrderForReturn`, `getReturnTransaction`, `listReturns`, `getReturnPolicy`, `getReturnStats`
- ~10 API routes under `/api/v1/pos/returns/`
- Inventory integration: restock movements, shrink movements
- GL posting: revenue reversal, tax reversal, tender reversal or store credit liability
- Return policy engine: configurable per-tenant rules
- Zod validation schemas
- Events: `return.created.v1`, `return.finalized.v1`, `return.voided.v1`, `exchange.created.v1`

### Claude Prompt

```
# OPPSERA RETAIL POS V1.1 — SESSION 2: RETURNS & EXCHANGES BACKEND

Read CLAUDE.md and CONVENTIONS.md. Schema from Session 1 is in place.

## CONTEXT
The return_transactions, return_lines tables exist. orders table now has order_kind, original_order_id, return_transaction_id columns.

## TASK 1: RETURN POLICY ENGINE

Create packages/modules/orders/src/services/return-policy.ts:
- Configurable per-tenant return policy (store in tenant settings or a new return_policies table if needed)
- Policy rules: max_days_for_return (default 30), require_receipt (default false), require_manager_approval_without_receipt (default true), allow_cash_refund_without_receipt (default false), max_no_receipt_refund_cents (default 5000), allowed_refund_methods ['cash','store_credit','gift_card','original_tender']
- evaluateReturnPolicy(ctx, { originalOrder?, hasReceipt, lineItems }) returns { allowed, requiresManagerApproval, availableRefundMethods, denialReason? }

## TASK 2: RETURN COMMANDS

### createReturnTransaction(ctx, input)
- Input: { originalOrderId?, hasReceipt, returnType: 'RETURN'|'EXCHANGE', clientRequestId }
- If originalOrderId: validate order exists, belongs to tenant/location, status is 'paid' or 'placed'
- If no receipt: evaluate return policy, may require manager approval flag
- Create return_transactions row with policy_snapshot
- Create a new order with order_kind='RETURN', original_order_id=originalOrderId
- Emit return.created.v1

### addReturnLine(ctx, input)
- Input: { returnTransactionId, originalOrderLineId?, catalogItemId, catalogItemName, qty, unitPriceCents, reasonCode, reasonNote, restockAction, conditionCode }
- If from original order: validate line exists, qty <= original qty minus already-returned qty
- Track returned quantities to prevent over-returning
- Insert return_lines row
- Add negative line to the return order

### finalizeReturn(ctx, input)
- Input: { returnTransactionId, refundMethod: 'cash'|'store_credit'|'gift_card'|'original_tender', giftCardId?, managerId? }
- Validate all lines have restock action
- Compute total refund amount from return lines
- INVENTORY: For each line based on restockAction:
  - RESTOCK: create inventory_movement (type='return_restock', positive qty delta)
  - SCRAP/DAMAGED: create inventory_movement (type='shrink', qty=0, reason=condition)
  - NO_RESTOCK: skip inventory
- ACCOUNTING via AccountingPostingApi:
  - Reverse revenue: Debit Revenue, Credit Cash/StoreCredit/GiftCard liability
  - Reverse tax: Debit Tax Collected, Credit Cash/liability
- REFUND ROUTING:
  - cash: create tender with negative amount on return order, kick drawer
  - store_credit: call issueStoreCredit (Session 4 command, stub for now)
  - gift_card: call addGiftCardBalance (Session 4 command, stub for now)
  - original_tender: match original tender type, create reversal
- Place the return order (status -> 'placed' -> 'paid')
- Update return_transactions.restock_complete = true
- Emit return.finalized.v1 with full payload

### createExchange(ctx, input)
- Same as createReturnTransaction but returnType='EXCHANGE'
- Creates TWO orders: return order (order_kind='RETURN') + new sale order (order_kind='EXCHANGE')
- Both linked via return_transaction_id

### finalizeExchange(ctx, input)
- Finalize return side (same as finalizeReturn)
- Compute delta: newSaleTotal - returnRefundTotal
- If delta > 0: customer owes, proceed to payment on exchange order
- If delta < 0: customer gets refund of |delta|
- If delta = 0: even exchange, auto-complete both orders

## TASK 3: QUERIES

### lookupOrderForReturn(tenantId, { orderNumber?, barcode?, orderId? })
- Search by order number (exact or ILIKE), barcode scan, or direct ID
- Return full order with lines, tenders, and existing return history
- Include per-line "returnableQty" = originalQty - alreadyReturnedQty

### getReturnTransaction(tenantId, returnTransactionId)
- Full return with lines, original order summary, refund details

### listReturns(tenantId, filters)
- Cursor pagination, filter by location, date range, return type, status

## TASK 4: API ROUTES
/api/v1/pos/returns/ — POST create, GET list
/api/v1/pos/returns/[id] — GET detail
/api/v1/pos/returns/[id]/lines — POST add, PATCH update, DELETE remove
/api/v1/pos/returns/[id]/finalize — POST
/api/v1/pos/returns/lookup — GET (query params: orderNumber, barcode)
/api/v1/pos/exchanges/[id]/finalize — POST

Permissions: returns.create, returns.finalize, returns.void, returns.view

## TASK 5: STUB INTERFACES
Create stub functions that Session 4 will implement:
- issueStoreCreditFromReturn(ctx, { customerId, amountCents, returnTransactionId }) — for now just log + return mock
- addGiftCardBalance(ctx, { giftCardId, amountCents, returnTransactionId }) — stub

Make these swappable via singleton getter/setter pattern.
```

---

## Session 3: Returns & Exchanges Frontend

**Objective:** Build the complete return/exchange UX in the Retail POS, including receipt lookup, return cart, reason selection, restock actions, and refund method selection.
**Dependencies:** Session 2 (returns backend)
**Estimated Scope:** Large

### Scope

- Return/Exchange entry point in Retail POS
- Receipt lookup dialog with barcode scan support
- Return cart with line selection, reason codes, restock actions
- Refund method selection dialog
- Exchange flow with delta checkout
- Return receipt viewer

### Deliverables

- `useReturn` hook: full return workflow state machine
- `ReturnEntryDialog`: start return, choose receipt/no-receipt
- `ReceiptLookupDialog`: order number input + barcode scan, results list
- `ReturnCart` component: select items, qty, reason, restock action per line
- `RefundMethodDialog`: cash/store credit/gift card/original tender selection
- `ExchangeCart`: return items + new items side by side, delta display
- `ReturnReceiptViewer`: formatted return receipt
- Integration with existing POS layout and barcode scanner

### Claude Prompt

```
# OPPSERA RETAIL POS V1.1 — SESSION 3: RETURNS & EXCHANGES FRONTEND

Read CLAUDE.md and CONVENTIONS.md. Returns backend from Session 2 is complete.

## CONTEXT
API routes exist: /api/v1/pos/returns/*, /api/v1/pos/returns/lookup
Return workflow: create -> add lines -> finalize with refund method

## TASK 1: useReturn HOOK

Create apps/web/src/hooks/use-return.ts:

State machine states: idle | lookup | selecting_items | setting_reasons | choosing_refund | processing | complete | error

Interface:
- startReturn() — transition to lookup
- lookupOrder(query: string) — call lookup API, show results
- selectOrder(order) — load order lines with returnableQty
- toggleLineForReturn(lineId, qty?) — add/remove line from return cart
- setLineReason(lineId, reasonCode, reasonNote?) — set reason per line
- setLineRestockAction(lineId, action) — RESTOCK/SCRAP/DAMAGED/NO_RESTOCK
- setRefundMethod(method, options?) — cash/store_credit/gift_card/original_tender
- finalizeReturn() — call finalize API
- startExchange() — switch to exchange mode
- addExchangeItem(item) — add to exchange sale cart
- cancelReturn() — reset state

Expose: state, returnTransaction, originalOrder, selectedLines, refundTotal, exchangeDelta, isProcessing, error

## TASK 2: RETURN ENTRY POINT

Add "Return / Exchange" button to Retail POS header bar (next to Hold/Recall).
On click: open ReturnEntryDialog.

### ReturnEntryDialog (portal, z-60)
Two options: "Return with Receipt" and "Return without Receipt"
- With receipt: transition to ReceiptLookupDialog
- Without receipt: check policy, may show "Manager Approval Required" prompt

## TASK 3: RECEIPT LOOKUP

### ReceiptLookupDialog (portal, z-60)
- Search input: type order number or scan barcode
- Barcode scanner integration: reuse existing barcode-scan CustomEvent listener
- Results list: show matching orders with date, total, items preview
- Click order -> load full order with returnable quantities
- Show warning if order is outside return policy window

## TASK 4: RETURN CART

### ReturnCart component
- Display original order lines with checkboxes
- Each selected line shows:
  - Qty selector (1 to returnableQty)
  - Reason dropdown: defective, wrong_item, not_as_described, changed_mind, damaged_in_transit, other
  - Restock action: RESTOCK (default), SCRAP, DAMAGED, NO_RESTOCK
  - Condition code: new, opened, used, damaged
- Running total of refund amount
- "Next: Choose Refund Method" button

## TASK 5: REFUND METHOD

### RefundMethodDialog (portal, z-60)
- Options based on policy + original tender:
  - Cash refund (if allowed)
  - Store credit (always available)
  - Gift card (if customer has one or issue new)
  - Original tender (match original payment method)
- Show refund amount prominently
- For store credit: show customer name if attached, or prompt to attach customer
- Confirm button -> finalize return

## TASK 6: EXCHANGE FLOW

### ExchangeCart component
- Split view: left = return items, right = new items (uses existing catalog nav)
- Delta bar at bottom: "Return: $X | New Items: $Y | Balance Due: $Z" or "Credit: $Z"
- If balance due > 0: proceed to normal TenderDialog for the delta
- If credit: refund the difference via chosen method
- If even: auto-complete

## TASK 7: RETURN RECEIPT

Extend existing receipt viewer:
- Return receipt format: "RETURN" header, original order reference, returned items with reasons, refund method + amount
- Gift receipt variant: no prices shown

## INTEGRATION
- All dialogs use createPortal to document.body, z-60
- Match existing POS styling: bg-surface, border-gray-200, etc.
- Barcode scanner: listen for barcode-scan event during lookup phase
- Close all return dialogs when isActive becomes false (POS mode switch cleanup)
- Return button only visible when user has returns.create permission
```

---

## Session 4: Gift Cards + Store Credit Backend & Frontend

**Objective:** Implement gift card sell/redeem and store credit issue/redeem with full accounting integration.
**Dependencies:** Sessions 1–2 (schema + returns stubs)
**Estimated Scope:** Large

### Scope

- Gift card lifecycle: issue, redeem, balance check, void, expire
- Store credit lifecycle: issue from returns, manual issue, redeem, adjust
- Append-only ledgers for both with running balances
- Accounting: gift card liability, store credit liability
- POS integration: sell gift card as item, redeem at checkout
- Replace Session 2 stubs with real implementations

### Deliverables

- Gift card commands: `issueGiftCard`, `redeemGiftCard`, `checkBalance`, `adjustBalance`, `voidGiftCard`
- Store credit commands: `issueStoreCredit`, `redeemStoreCredit`, `adjustStoreCredit`, `getBalance`
- Gift card queries: `getGiftCardByNumber`, `getGiftCardLedger`, `listGiftCards`
- Store credit queries: `getStoreCreditBalance`, `getStoreCreditLedger`
- ~12 API routes under `/api/v1/pos/gift-cards/` and `/api/v1/pos/store-credit/`
- Accounting postings for issue + redeem of both instruments
- Frontend: `SellGiftCardDialog`, `RedeemGiftCardDialog`, `StoreCreditTender` component
- `TenderDialog` integration: gift card and store credit as payment methods
- Events: `gift_card.issued.v1`, `gift_card.redeemed.v1`, `store_credit.issued.v1`, `store_credit.redeemed.v1`

### Claude Prompt

```
# OPPSERA RETAIL POS V1.1 — SESSION 4: GIFT CARDS + STORE CREDIT

Read CLAUDE.md and CONVENTIONS.md. Schema from Session 1 exists. Return stubs from Session 2 need replacement.

## TASK 1: GIFT CARD BACKEND

### Commands (packages/modules/orders/src/commands/)

**issueGiftCard(ctx, input)**
- Input: { cardNumber, initialBalanceCents, customerId?, orderId?, clientRequestId }
- Generate card number if not provided (format: GC-XXXX-XXXX-XXXX)
- Create gift_cards row
- Create gift_card_ledger entry: type=ISSUE, amount=+initialBalance, running_balance=initialBalance
- ACCOUNTING: Debit Cash (or tender), Credit Gift Card Liability (new GL account 2300)
- Emit gift_card.issued.v1

**redeemGiftCard(ctx, input)**
- Input: { giftCardId, amountCents, orderId, tenderId, clientRequestId }
- Validate: card active, balance >= amount (partial redemption OK)
- Optimistic lock on gift_cards.balance_cents
- Update balance: balance_cents -= amountCents
- Create ledger entry: type=REDEEM, amount=-amountCents, running_balance=newBalance
- ACCOUNTING: Debit Gift Card Liability, Credit Revenue (or tender bridge per existing pattern)
- Emit gift_card.redeemed.v1

**checkGiftCardBalance(ctx, { cardNumber })**
- Lookup by card_number, return balance + status + expiry

**adjustGiftCardBalance(ctx, input)**
- Manager-only adjustment with reason
- Ledger entry: type=ADJUST
- Requires pos.gift_cards.adjust permission

**voidGiftCard(ctx, input)**
- Set status=voided, zero balance
- Ledger entry: type=VOID
- Reverse liability accounting

### Queries
- getGiftCardByNumber(tenantId, cardNumber) — with recent ledger entries
- getGiftCardLedger(tenantId, giftCardId, cursor?) — full transaction history
- listGiftCards(tenantId, filters) — status, location, date range

### API Routes: /api/v1/pos/gift-cards/
POST / (issue), GET /lookup?cardNumber=X, GET /[id], GET /[id]/ledger
POST /[id]/redeem, POST /[id]/adjust, POST /[id]/void

## TASK 2: STORE CREDIT BACKEND

### Commands

**issueStoreCredit(ctx, input)**
- Input: { customerId, amountCents, returnTransactionId?, reason?, clientRequestId }
- Get or create store_credit_accounts row for customer
- Update balance: balance_cents += amountCents
- Create store_credit_ledger entry: type=ISSUE, running_balance
- ACCOUNTING: Credit Store Credit Liability (GL account 2310)
- Emit store_credit.issued.v1

**redeemStoreCredit(ctx, input)**
- Input: { customerId, amountCents, orderId, tenderId, clientRequestId }
- Validate: account active, balance >= amount
- Update balance, create ledger entry: type=REDEEM
- ACCOUNTING: Debit Store Credit Liability
- Emit store_credit.redeemed.v1

**adjustStoreCredit(ctx, input)**
- Manager adjustment with reason, ledger entry: type=ADJUST

### Queries
- getStoreCreditBalance(tenantId, customerId)
- getStoreCreditLedger(tenantId, customerId, cursor?)

### API Routes: /api/v1/pos/store-credit/
GET /balance?customerId=X, POST /issue, POST /redeem, POST /adjust
GET /[accountId]/ledger

## TASK 3: REPLACE SESSION 2 STUBS

Wire the real issueStoreCredit and addGiftCardBalance into the return finalization flow.
Use the singleton getter/setter pattern — set the real implementations in the module bootstrap.

## TASK 4: TENDER INTEGRATION

Extend the existing recordTender command to support tender_type 'GIFT_CARD' and 'STORE_CREDIT':
- GIFT_CARD: call redeemGiftCard as part of tender recording
- STORE_CREDIT: call redeemStoreCredit as part of tender recording
- Both create the tender row AND the ledger entry atomically

Update TenderDialog to show available payment methods:
- Cash (existing)
- Gift Card (scan/enter card number, show balance, enter amount)
- Store Credit (show customer balance if customer attached, enter amount)
- Split tender: allow combining multiple methods

## TASK 5: FRONTEND

### SellGiftCardDialog (portal, z-60)
- Triggered from POS: "Sell Gift Card" button or scan gift card barcode
- Enter/scan card number, set denomination ($25, $50, $100, custom)
- Creates a special "Gift Card" line item in the cart (non-inventory, non-taxable)
- On payment: issueGiftCard called with the order

### RedeemGiftCardDialog (embedded in TenderDialog)
- Scan/enter card number
- Show current balance
- Enter redemption amount (default: order balance or card balance, whichever is less)
- Apply as tender

### StoreCreditSection (embedded in TenderDialog)
- Only shown if customer is attached to order
- Show current store credit balance
- Enter redemption amount
- Apply as tender

### useGiftCard hook
- issueGiftCard, redeemGiftCard, checkBalance, lookupCard

### useStoreCredit hook
- getBalance, redeem, issue
```

---

## Session 5: Promotions & Price Rules Engine Backend

**Objective:** Build a server-side promotions engine supporting percent off, fixed off, BOGO, buy X get Y, category promos, threshold promos, coupons, and stacking rules.
**Dependencies:** Session 1 (schema)
**Estimated Scope:** Large

### Scope

- Promotion rule CRUD with JSON conditions/effects
- Server-side promotion evaluation engine
- Deterministic application with priority + stacking rules
- Coupon code validation and tracking
- Order-level promotion application and allocation
- API routes for promotion management and application

### Deliverables

- Promotion engine: `evaluatePromotions(order, rules)` -> applied discounts
- 6 commands: `createPromotionRule`, `updatePromotionRule`, `activateRule`, `deactivateRule`, `applyPromotionsToOrder`, `applyCouponCode`
- 4 queries: `listPromotionRules`, `getPromotionRule`, `getApplicablePromotions`, `validateCouponCode`
- ~10 API routes
- Events: `promotion.applied.v1`, `promotion.created.v1`
- Zod schemas for rule conditions/effects

### Claude Prompt

```
# OPPSERA RETAIL POS V1.1 — SESSION 5: PROMOTIONS ENGINE BACKEND

Read CLAUDE.md and CONVENTIONS.md. promotion_rules and order_promotions_applied tables exist.

## TASK 1: PROMOTION RULE TYPES

Define the conditions/effects JSON shapes in packages/shared/src/types/promotions.ts:

### Rule Types + Conditions + Effects

**percent_off**: { conditions: { itemIds?, categoryIds?, brandIds?, minQty?, minSubtotalCents? }, effects: { percentOff: number, maxDiscountCents? } }

**fixed_off**: { conditions: { itemIds?, categoryIds?, minSubtotalCents? }, effects: { fixedOffCents: number } }

**bogo**: { conditions: { buyItemIds: string[], buyQty: number }, effects: { getItemIds: string[], getQty: number, discountPercent: 100 } }

**buy_x_get_y**: { conditions: { buyItemIds: string[], buyQty: number }, effects: { getItemIds: string[], getQty: number, discountPercent: number } }

**threshold**: { conditions: { minSubtotalCents: number }, effects: { percentOff?: number, fixedOffCents?: number } }

**category_discount**: { conditions: { categoryIds: string[], minQty?: number }, effects: { percentOff: number } }

### Stackability
{ allowStacking: boolean, stackGroup?: string, excludeWithCoupons?: boolean }

## TASK 2: PROMOTION ENGINE

Create packages/modules/orders/src/services/promotion-engine.ts:

### evaluatePromotions(orderLines, applicableRules) -> PromotionResult[]
- Sort rules by priority (lower number = higher priority)
- For each rule, check if order lines satisfy conditions
- Apply effects: compute discount per line (allocation)
- Stacking logic:
  - If rule.stackability.allowStacking = false, only apply if no other non-stackable rule applied
  - Same stackGroup rules are mutually exclusive (best discount wins)
  - Coupon rules: check excludeWithCoupons on other applied rules
- "Best discount wins" for non-stackable: compute all eligible, pick largest total
- Return: array of { ruleId, ruleName, discountCents, allocation: { lineId, discountCents }[] }

### Key rules:
- All computation is server-side. Client sends cart state, server returns discounts.
- Deterministic: same input always produces same output
- Per-line allocation: every discount cent is attributed to a specific order line
- Rounding: allocate proportionally, use remainder method for last cent

## TASK 3: COMMANDS

**createPromotionRule(ctx, input)** — validate JSON shapes, insert
**updatePromotionRule(ctx, input)** — optimistic lock, validate
**activatePromotionRule(ctx, input)** — set status=active, validate date range
**deactivatePromotionRule(ctx, input)** — set status=inactive
**applyPromotionsToOrder(ctx, { orderId })** — called during placeOrder flow:
  - Fetch active rules for location
  - Run evaluatePromotions
  - Insert order_promotions_applied rows
  - Update order discount fields
  - Persist allocation breakdown
**applyCouponCode(ctx, { orderId, couponCode })** — validate code, check max_uses, apply

## TASK 4: QUERIES + API

Queries: listPromotionRules, getPromotionRule, getApplicablePromotions (for a location+date), validateCouponCode

API Routes: /api/v1/pos/promotions/
CRUD routes + POST /apply (apply to order) + POST /validate-coupon
Settings routes: /api/v1/pos/promotions/rules/

Permissions: promotions.view, promotions.manage, promotions.apply
```

---

## Session 6: Promotions Frontend + POS Integration

**Objective:** Build the promotions management UI and integrate automatic/coupon promotions into the POS checkout flow.
**Dependencies:** Session 5 (promotions backend)
**Estimated Scope:** Medium

### Scope

- Promotions management page (CRUD rules)
- Coupon entry in POS
- Automatic promotion display in cart
- Best discount wins explanation tooltip
- Promotion application during checkout

### Deliverables

- Promotions settings page: list, create, edit rules with JSON form builder
- `usePromotions` hook: CRUD + apply + validate coupon
- POS cart integration: show applied promotions with breakdown
- `CouponEntryDialog`: manual entry + barcode scan
- `PromotionBadge`: show discount source on cart lines
- Auto-apply logic: call server on cart change, debounced

### Claude Prompt

```
# OPPSERA RETAIL POS V1.1 — SESSION 6: PROMOTIONS FRONTEND

Read CLAUDE.md and CONVENTIONS.md. Promotions backend from Session 5 is complete.

## TASK 1: PROMOTIONS MANAGEMENT UI

### Settings Page: /settings/promotions (code-split)
- List all promotion rules with status badges, date range, type, priority
- Create/Edit form:
  - Name, description, priority, date range (start_at, end_at)
  - Rule type selector (dropdown)
  - Dynamic conditions form based on rule_type:
    - Item picker (multi-select from catalog)
    - Category picker (multi-select from hierarchy)
    - Quantity threshold input
    - Subtotal threshold input (CurrencyInput)
  - Effects form:
    - Percent off (NumberInput with % suffix)
    - Fixed amount off (CurrencyInput)
    - Max discount cap (CurrencyInput, optional)
    - BOGO/BuyXGetY: buy qty + get qty + discount percent
  - Coupon code (optional text input)
  - Max uses (optional number)
  - Stackability toggles: allow stacking, stack group, exclude with coupons
  - Location scope: all locations or specific (multi-select)
- Activate/deactivate toggle
- Status lifecycle display

## TASK 2: POS INTEGRATION

### usePromotions hook (apps/web/src/hooks/use-promotions.ts)
- applyPromotions(orderId): call /api/v1/pos/promotions/apply
- applyCoupon(orderId, code): call /api/v1/pos/promotions/validate-coupon then apply
- removeCoupon(orderId, promotionId): remove applied promotion
- appliedPromotions: current list of applied promotions with allocation

### Cart Integration
- After each cart change (add/remove item, change qty): debounced call to applyPromotions (500ms)
- Display applied promotions in CartTotals:
  - Each promo as a line: "BOGO: Buy 2 Get 1 Free — -$5.99"
  - Coupon applied badge
  - Total savings summary
- Per-line: show PromotionBadge on lines that receive a discount
  - Small tag: "10% off" or "BOGO" with tooltip showing rule name

### CouponEntryDialog (portal, z-60)
- Text input + barcode scan listener
- Validate button -> show success/error
- Applied coupon shows as removable chip near cart total

### Best Discount Wins Tooltip
- When multiple promos are eligible but only one applies (non-stackable):
  - Show info icon next to applied promo
  - Tooltip: "This promotion saves you the most. Other eligible: [list]"

## TASK 3: SIDEBAR NAVIGATION
Add "Promotions" under Settings or POS section in sidebar nav.
Gate behind promotions.manage permission.

Follow all existing patterns: code-split, portal dialogs, bg-surface, useFetch/useMutation.
```

---

## Session 7: Retail Fulfillment Modes

**Objective:** Add support for take-now, pickup, and ship-from-store fulfillment at the order-line level.
**Dependencies:** Session 1 (schema)
**Estimated Scope:** Medium

### Scope

- Fulfillment mode assignment per order line
- Pickup flow: ready notification, customer pickup confirmation
- Ship-from-store: shipping address capture, fee, tracking
- Split fulfillment: mix take-now + pickup + ship on same order
- Fulfillment status tracking and management

### Deliverables

- Fulfillment commands: `setLineFulfillment`, `updateFulfillmentStatus`, `markReadyForPickup`, `confirmPickup`, `markShipped`
- Fulfillment queries: `listPendingFulfillments`, `getFulfillmentDetails`
- API routes under `/api/v1/pos/fulfillments/`
- POS integration: fulfillment mode selector per line in cart
- Fulfillment queue page: pending pickups and shipments
- Events: `fulfillment.ready.v1`, `fulfillment.completed.v1`

### Claude Prompt

```
# OPPSERA RETAIL POS V1.1 — SESSION 7: RETAIL FULFILLMENT MODES

Read CLAUDE.md and CONVENTIONS.md. order_fulfillments table exists from Session 1.

## TASK 1: FULFILLMENT BACKEND

### Commands (packages/modules/orders/src/commands/)

**setLineFulfillment(ctx, input)**
- Input: { orderId, orderLineId, fulfillmentMode: 'take_now'|'pickup'|'ship', shippingAddress?, shippingFeeCents? }
- Create/update order_fulfillments row
- If ship: validate shipping address, add shipping fee as service charge line
- Emit fulfillment.updated.v1

**updateFulfillmentStatus(ctx, input)**
- Input: { fulfillmentId, status: 'pending'|'ready'|'picked_up'|'shipped'|'delivered'|'canceled', trackingNumber? }
- Status transitions validated: pending->ready->picked_up, pending->shipped->delivered
- Emit fulfillment.status_changed.v1

**markReadyForPickup(ctx, { fulfillmentId })**
- Set status=ready, trigger notification stub (email/SMS)

**confirmPickup(ctx, { fulfillmentId })**
- Set status=picked_up, record timestamp

**markShipped(ctx, { fulfillmentId, trackingNumber })**
- Set status=shipped, save tracking

### Queries
- listPendingFulfillments(tenantId, locationId, filters) — all non-completed, grouped by mode
- getFulfillmentDetails(tenantId, fulfillmentId) — full details with order info

### API Routes: /api/v1/pos/fulfillments/
GET / (list pending), GET /[id], PATCH /[id]/status
POST /[id]/ready, POST /[id]/pickup, POST /[id]/ship

## TASK 2: POS CART INTEGRATION

### FulfillmentModeSelector component
- Per-line dropdown in cart: Take Now (default), Pickup, Ship
- Selecting "Ship" expands to show shipping address form + fee input
- Visual indicator per line: truck icon (ship), store icon (pickup), bag icon (take-now)

### Split Fulfillment Display
- Cart groups items by fulfillment mode with section headers
- Order summary shows: "3 items take-now, 1 pickup, 2 shipping"

## TASK 3: FULFILLMENT QUEUE PAGE

### /orders/fulfillments (code-split)
- Two tabs: "Pickup" and "Shipping"
- Pickup tab: list of ready-for-pickup orders with customer name, items, time
- Shipping tab: list of pending shipments with address, items
- Action buttons: Mark Ready, Confirm Pickup, Mark Shipped (with tracking input)
- Auto-refresh every 30 seconds

## TASK 4: NOTIFICATION STUBS
Create packages/modules/orders/src/services/notification-service.ts:
- sendPickupReadyNotification(ctx, { customerId, orderNumber, locationName }) — stub, log only
- sendShippingConfirmation(ctx, { customerId, orderNumber, trackingNumber }) — stub, log only
- Interface designed for future email/SMS provider integration
```

---

## Session 8: Receipts Enhancement

**Objective:** Extend the receipt system with gift receipts, return receipts, email/SMS send stubs, and reprint capability.
**Dependencies:** Sessions 2–4 (returns + gift cards)
**Estimated Scope:** Medium

### Scope

- Gift receipt format (no prices)
- Return receipt format with reason codes
- Exchange receipt with both sides
- Email receipt send (stub provider)
- SMS receipt send (stub provider)
- Reprint receipt from order history
- Receipt template configuration

### Deliverables

- Receipt generator service: `generateReceipt(order, format)`
- Receipt formats: standard, gift, return, exchange
- Email/SMS provider interface + stub implementations
- Receipt settings: logo, footer text, social links, policy text
- Reprint API endpoint
- Frontend: receipt format selector, email/SMS send dialog, receipt preview

### Claude Prompt

```
# OPPSERA RETAIL POS V1.1 — SESSION 8: RECEIPTS ENHANCEMENT

Read CLAUDE.md and CONVENTIONS.md. Returns and gift card flows exist.

## TASK 1: RECEIPT GENERATOR SERVICE

Create packages/modules/orders/src/services/receipt-generator.ts:

### generateReceipt(order, options)
- Options: { format: 'standard'|'gift'|'return'|'exchange', includeBarcode?: boolean }
- Returns: ReceiptData object with all fields for rendering

### Receipt Formats:
**Standard**: header (store name, address, phone), order number, date/time, cashier, items (name, qty, price, modifiers), subtotal, discounts, service charges, tax breakdown, total, payment method(s), change given, footer (return policy, thank you)

**Gift**: same as standard but NO PRICES on line items. Shows "Gift Receipt" header. Includes gift message if present. Barcode for return lookup.

**Return**: "RETURN" header, original order reference, returned items with reasons, refund method, refund amount, store credit balance (if applicable)

**Exchange**: "EXCHANGE" header, returned items section, new items section, delta amount, payment method for delta

### Receipt Settings (stored in terminal_settings or location settings)
- storeName, storeAddress, storePhone
- logoUrl (optional)
- footerText (return policy, hours, etc.)
- socialLinks
- receiptWidth (80mm default for thermal, 58mm optional)

## TASK 2: EMAIL/SMS STUBS

Create packages/modules/orders/src/services/receipt-delivery.ts:

### Interface:
interface ReceiptDeliveryProvider {
  sendEmailReceipt(to: string, receiptHtml: string, orderNumber: string): Promise<void>;
  sendSmsReceipt(to: string, receiptUrl: string, orderNumber: string): Promise<void>;
}

### Stub Implementation:
- Log the receipt delivery request
- Store in a receipt_delivery_log concept (or just audit log)
- Return success

### Singleton pattern: getReceiptDeliveryProvider() / setReceiptDeliveryProvider()

## TASK 3: API ROUTES

/api/v1/pos/receipts/[orderId] — GET receipt data
/api/v1/pos/receipts/[orderId]/send — POST { method: 'email'|'sms', destination: string }
/api/v1/pos/receipts/[orderId]/reprint — POST (log reprint event)

## TASK 4: FRONTEND

### Receipt enhancements in existing ReceiptViewer:
- Format selector tabs: Standard | Gift | Return
- Gift receipt: hide prices, show "Gift Receipt" watermark
- Return receipt: show return-specific sections

### SendReceiptDialog (portal, z-60)
- Triggered from order detail or after payment
- Two tabs: Email | SMS
- Email: input field (pre-filled if customer has email)
- SMS: phone input (pre-filled if customer has phone)
- Send button + success confirmation

### After-Payment Receipt Prompt
- After TenderDialog completes: "Receipt?" prompt with options:
  - Print (default)
  - Email
  - SMS
  - No Receipt
  - Gift Receipt
- Quick action buttons, auto-dismiss after 10 seconds

### Reprint
- In order history detail: "Reprint Receipt" button
- Calls reprint API (for audit trail)
```

---

## Session 9: Cross-Module Integration — Reporting, Inventory & Accounting

**Objective:** Wire all new POS V1.1 features into reporting read models, inventory consumers, and accounting GL postings.
**Dependencies:** Sessions 2–8 (all feature blocks)
**Estimated Scope:** Large

### Scope

- Reporting consumers for returns, gift cards, store credit, promotions
- Inventory consumers for return restocks
- Accounting GL postings for all new financial instruments
- Read model updates for new metrics
- Custom report fields for new data

### Deliverables

- New reporting consumers: `handleReturnFinalized`, `handleGiftCardIssued`, `handleGiftCardRedeemed`, `handleStoreCreditIssued`, `handlePromotionApplied`
- Updated `rm_daily_sales`: add `return_count`, `return_total`, `gift_card_issued`, `gift_card_redeemed`, `store_credit_issued`, `promo_discount_total`
- New read model: `rm_gift_card_summary` (balances, issuance, redemption by period)
- Inventory consumer: `handleReturnFinalized` -> create restock/shrink movements
- GL posting rules: gift card liability, store credit liability, return reversals
- Field catalog additions for custom report builder
- Updated dashboard metrics

### Claude Prompt

```
# OPPSERA RETAIL POS V1.1 — SESSION 9: CROSS-MODULE INTEGRATION (REPORTING + INVENTORY + ACCOUNTING)

Read CLAUDE.md and CONVENTIONS.md. All V1.1 feature backends are complete.

## TASK 1: REPORTING CONSUMERS

### New Event Consumers (packages/modules/reporting/src/consumers/)

**handleReturnFinalized** (return.finalized.v1)
- Upsert rm_daily_sales: increment return_count, return_total (NUMERIC dollars)
- Upsert rm_item_sales: per returned item, increment return_qty, return_revenue
- Use atomic idempotency pattern (processed_events check inside transaction)

**handleGiftCardIssued** (gift_card.issued.v1)
- Upsert rm_daily_sales: increment gift_card_issued_cents
- New rm_gift_card_summary: track daily issuance + outstanding liability

**handleGiftCardRedeemed** (gift_card.redeemed.v1)
- Upsert rm_daily_sales: increment gift_card_redeemed_cents
- Update rm_gift_card_summary: track daily redemption

**handleStoreCreditIssued** (store_credit.issued.v1)
- Upsert rm_daily_sales: increment store_credit_issued_cents

**handlePromotionApplied** (promotion.applied.v1)
- Upsert rm_daily_sales: increment promo_discount_total_cents
- Track per-promotion usage (new rm_promotion_summary read model if needed)

### Schema Changes
ALTER rm_daily_sales ADD COLUMNS:
- return_count INTEGER DEFAULT 0
- return_total NUMERIC(19,4) DEFAULT 0
- gift_card_issued NUMERIC(19,4) DEFAULT 0
- gift_card_redeemed NUMERIC(19,4) DEFAULT 0
- store_credit_issued NUMERIC(19,4) DEFAULT 0
- promo_discount_total NUMERIC(19,4) DEFAULT 0

Migration: 0081_reporting_v11_columns.sql

## TASK 2: INVENTORY CONSUMER

### handleReturnFinalized (return.finalized.v1)
- For each return line in event payload:
  - If restockAction = 'RESTOCK': create inventory_movement type='return_restock', qty=+returnQty
  - If restockAction = 'DAMAGED' or 'SCRAP': create inventory_movement type='shrink', qty=0, reason=condition
  - If restockAction = 'NO_RESTOCK': skip
- Use existing idempotency pattern (reference_type='return', reference_id=returnLineId)
- Emit inventory.movement.created.v1 for each movement

## TASK 3: ACCOUNTING GL POSTINGS

### Update POS Posting Adapter (packages/modules/accounting/src/adapters/pos-posting-adapter.ts)

Add handlers for new event types:

**handleGiftCardIssued** (gift_card.issued.v1)
- Debit: Cash/Tender account (from payment)
- Credit: Gift Card Liability (GL 2300)

**handleGiftCardRedeemed** (gift_card.redeemed.v1)
- Debit: Gift Card Liability (GL 2300)
- Credit: Revenue account (per existing tender->revenue pattern)

**handleStoreCreditIssued** (store_credit.issued.v1)
- Depends on source:
  - From return: Debit Revenue Reversal, Credit Store Credit Liability (GL 2310)
  - Manual issue: Debit appropriate expense, Credit Store Credit Liability

**handleStoreCreditRedeemed** (store_credit.redeemed.v1)
- Debit: Store Credit Liability (GL 2310)
- Credit: Revenue

**handleReturnFinalized** (return.finalized.v1)
- Debit: Revenue (reversal), Tax Collected (reversal)
- Credit: Cash/Store Credit Liability/Gift Card Liability (based on refund method)
- Must be balanced entry

### New GL Accounts (add to COA bootstrap templates)
- 2300: Gift Card Liability (Current Liabilities)
- 2310: Store Credit Liability (Current Liabilities)

## TASK 4: FIELD CATALOG + DASHBOARD

### Add fields to reporting_field_catalog:
- daily_sales.return_count, daily_sales.return_total
- daily_sales.gift_card_issued, daily_sales.gift_card_redeemed
- daily_sales.store_credit_issued
- daily_sales.promo_discount_total

### Update getDashboardMetrics query:
- Add "Returns Today" KPI card
- Add "Gift Card Liability" KPI (sum of outstanding balances)
- Add "Promotions Savings Today" KPI

### Update reports page MetricCards to include new metrics
```

---

## Session 10: Cross-Module Integration — Service Modules, Order Push & AI

**Objective:** Enable order push from service modules (PMS, tee sheet, court booking) to POS and integrate V1.1 features with the AI semantic layer.
**Dependencies:** Sessions 2–9 (all features + reporting)
**Estimated Scope:** Large

### Scope

- Order push API: external service modules can push orders to POS
- PMS integration: room charges route to POS for settlement
- Tee sheet integration: green fee orders pushed to POS
- Court booking integration: court fee orders pushed to POS
- Semantic layer: new metrics for returns, gift cards, store credit, promotions
- AI insights: V1.1-aware questions and narratives

### Deliverables

- Order push API: `POST /api/v1/pos/orders/push` with source module identification
- Service module order adapter: transforms external order format to OppsEra order format
- Event: `order.pushed.v1` for downstream tracking
- New semantic metrics: `return_rate`, `gift_card_liability`, `promo_savings`, `store_credit_outstanding`
- Updated semantic registry with V1.1 dimensions
- AI prompt updates for V1.1-aware insights

### Claude Prompt

```
# OPPSERA RETAIL POS V1.1 — SESSION 10: SERVICE MODULE ORDER PUSH + AI INTEGRATION

Read CLAUDE.md and CONVENTIONS.md. All V1.1 features and reporting integration are complete.

## TASK 1: ORDER PUSH API

### Concept
External service modules (PMS, tee sheet, court booking system) need to push orders to the POS for settlement. This creates a "pushed" order that appears in the POS queue for payment.

### API: POST /api/v1/pos/orders/push
Input:
{
  sourceModule: 'pms' | 'tee_sheet' | 'court_booking' | 'external',
  sourceReferenceId: string,  // external order/folio ID
  locationId: string,
  customerId?: string,
  items: [{
    catalogItemId?: string,  // if mapped to catalog
    name: string,
    description?: string,
    itemType: 'service' | 'retail' | 'fnb' | 'green_fee' | 'rental' | 'court_fee',
    qty: number,
    unitPriceCents: number,
    taxable: boolean,
    metadata?: Record<string, unknown>
  }],
  notes?: string,
  metadata?: {
    roomNumber?: string,
    teeTimeId?: string,
    courtBookingId?: string,
    guestName?: string,
    folioNumber?: string
  },
  clientRequestId: string
}

### Command: pushOrderToPOS(ctx, input)
- Validate source module is registered
- Map items: if catalogItemId provided, snapshot from catalog. If not, create ad-hoc line.
- Create order with source='pushed', status='open'
- Store source metadata for cross-reference
- Emit order.pushed.v1 with sourceModule, sourceReferenceId, orderId
- Return { orderId, orderNumber }

### POS Queue Integration
- Pushed orders appear in POS with a special badge: "PMS", "Tee Sheet", etc.
- Cashier reviews items, can add more items, then proceeds to payment
- After payment, emit tender.recorded.v1 (existing) which downstream modules can consume

### Service Module Registration
Create packages/modules/orders/src/services/module-registry.ts:
- Register known source modules with their callback URLs / event subscriptions
- Validate sourceModule on push

## TASK 2: POS FRONTEND — PUSHED ORDERS

### Pushed Orders Queue
- In Retail POS, add "Pushed Orders" tab/section showing orders from external modules
- Badge with count of pending pushed orders
- Click to load pushed order into cart
- Show source badge (PMS icon, golf icon, etc.) and metadata (room number, guest name)
- Cashier can modify (add items, apply discounts) before payment

## TASK 3: SEMANTIC LAYER INTEGRATION

### New Metrics (packages/modules/semantic/src/registry/retail-v11.ts)

Register these metrics in the semantic registry:

**return_rate**: Return count / Order count * 100 (percentage)
- Source: rm_daily_sales (return_count / order_count)
- Format: percentage, lowerIsBetter

**gift_card_liability**: Outstanding gift card balance
- Source: SUM(gift_cards.balance_cents) WHERE status='active'
- Format: currency

**gift_card_velocity**: Gift cards issued per day
- Source: rm_daily_sales.gift_card_issued
- Format: currency

**store_credit_outstanding**: Total store credit liability
- Source: SUM(store_credit_accounts.balance_cents) WHERE status='active'
- Format: currency

**promo_savings**: Total promotional discounts applied
- Source: rm_daily_sales.promo_discount_total
- Format: currency

**promo_usage_count**: Number of promotion applications
- Source: COUNT from order_promotions_applied
- Format: number

### New Dimensions
- return_reason: reason_code from return_lines
- refund_method: from return_transactions
- promo_name: from promotion_rules via order_promotions_applied
- fulfillment_mode: from order_fulfillments

### Registry Sync
Update syncRegistryToDb() to include new metrics and dimensions.
Run: pnpm --filter @oppsera/module-semantic semantic:sync
```

---

## Session 11: RBAC, Audit Trail & Manager PIN System

**Objective:** Add granular permissions for all V1.1 features, implement server-backed manager PIN override system, and ensure comprehensive audit logging.
**Dependencies:** Sessions 1–10 (all features)
**Estimated Scope:** Medium

### Scope

- New permission strings for all V1.1 operations
- Manager PIN system: server-backed, not localStorage
- PIN override workflow for restricted operations
- Audit trail for all sensitive operations
- Permission seeds for default roles

### Deliverables

- Permission strings: `returns.*`, `gift_cards.*`, `store_credit.*`, `promotions.*`, `pos.terminals.*`, `pos.drawers.*`, `fulfillments.*`
- Manager PIN: server-backed PIN storage (hashed), PIN verification API, PIN override dialog
- Audit log entries for: returns, exchanges, gift card adjustments, store credit adjustments, drawer operations, price overrides, promotion overrides
- Role permission seeds updated for all 6 system roles
- `ManagerPINDialog` component: universal override dialog for restricted operations

### Claude Prompt

```
# OPPSERA RETAIL POS V1.1 — SESSION 11: RBAC + AUDIT + MANAGER PIN

Read CLAUDE.md and CONVENTIONS.md. All V1.1 features are complete.

## TASK 1: NEW PERMISSIONS

Add to permission registry (packages/core/src/permissions/):

### Returns & Exchanges
- returns.create — initiate a return
- returns.finalize — complete a return with refund
- returns.void — void a completed return
- returns.view — view return history
- returns.no_receipt — process return without receipt (restricted)
- exchanges.create — initiate an exchange
- exchanges.finalize — complete an exchange

### Gift Cards
- gift_cards.sell — sell gift cards at POS
- gift_cards.redeem — redeem gift cards as payment
- gift_cards.view — view gift card balances/history
- gift_cards.adjust — manual balance adjustment (manager+)
- gift_cards.void — void a gift card (manager+)

### Store Credit
- store_credit.issue — issue store credit
- store_credit.redeem — redeem store credit
- store_credit.view — view balances
- store_credit.adjust — manual adjustment (manager+)

### Promotions
- promotions.view — view promotion rules
- promotions.manage — create/edit/activate/deactivate rules
- promotions.apply — apply promotions to orders
- promotions.override — override promotion logic (manager+)

### Terminals & Drawers
- pos.terminals.view — view terminal list
- pos.terminals.manage — register/configure terminals
- pos.drawers.open — open cash drawer session
- pos.drawers.close — close drawer session
- pos.drawers.view — view drawer history
- pos.drawers.paid_in_out — record paid-in/paid-out
- pos.drawers.blind_close — perform blind close (restricted)

### Fulfillment
- fulfillments.view — view fulfillment queue
- fulfillments.manage — update fulfillment status

## TASK 2: ROLE PERMISSION SEEDS

Update permission seeds for default roles:

**Owner**: * (all permissions)
**Manager**: all V1.1 permissions
**Supervisor**: returns.*, exchanges.*, gift_cards.sell/redeem/view, store_credit.issue/redeem/view, promotions.view/apply, pos.drawers.*, fulfillments.*
**Cashier**: returns.create/view, gift_cards.sell/redeem, store_credit.redeem, promotions.apply, pos.drawers.open/close/paid_in_out, fulfillments.view
**Server**: gift_cards.redeem, store_credit.redeem, fulfillments.view
**Staff**: fulfillments.view

## TASK 3: MANAGER PIN SYSTEM

### Backend
Create packages/core/src/auth/manager-pin.ts:

**Table**: manager_pins (or add pin_hash column to users table)
- id, tenant_id, user_id (FK users), pin_hash TEXT NOT NULL, created_at, updated_at
- PIN is 4-6 digit numeric, stored as bcrypt hash

**Commands**:
- setManagerPin(ctx, { userId, pin }) — hash + store, requires users.manage permission
- verifyManagerPin(ctx, { pin }) — verify against all managers at location, return { verified, managerId, managerName }
- removeManagerPin(ctx, { userId })

**API Routes**:
- POST /api/v1/auth/manager-pin/verify — { pin } -> { verified, managerId }
- POST /api/v1/auth/manager-pin/set — { userId, pin }

### Frontend: ManagerPINDialog (portal, z-70)
- Triggered when operation requires manager approval
- Numeric keypad (touch-friendly for tablets)
- 4-6 digit PIN entry with dots
- "Enter Manager PIN to authorize" header
- Shows operation description: "Authorize: Return without receipt ($45.00)"
- On verify: calls API, returns { authorized, managerId }
- Timeout: auto-close after 30 seconds
- Max attempts: 3, then lock for 60 seconds

### Integration Points (wrap these in requireManagerPIN check):
- Return without receipt
- Gift card manual adjustment
- Store credit manual adjustment
- Gift card void
- Price override above threshold
- Discount above threshold
- Drawer blind close
- Void order above threshold

## TASK 4: AUDIT TRAIL HARDENING

Ensure every sensitive operation writes to audit_log:

### Operations to audit:
- return.created, return.finalized, return.voided
- exchange.created, exchange.finalized
- gift_card.issued, gift_card.redeemed, gift_card.adjusted, gift_card.voided
- store_credit.issued, store_credit.redeemed, store_credit.adjusted
- promotion.applied, promotion.override
- drawer.opened, drawer.closed, drawer.paid_in, drawer.paid_out
- terminal.registered, terminal.settings_updated
- fulfillment.status_updated
- manager_pin.verified, manager_pin.failed

Include in audit metadata:
- For financial ops: amount, before/after balance
- For returns: original order reference, reason codes
- For manager overrides: managerId who authorized
- For drawer: opening/closing amounts, over/short
```

---

## Session 12: Integration Testing, Edge Cases & Polish

**Objective:** Final session — comprehensive integration testing, edge case handling, concurrency safety, and UX polish across all V1.1 features.
**Dependencies:** Sessions 1–11 (everything)
**Estimated Scope:** Large

### Scope

- Integration tests across all V1.1 features
- Edge case handling: partial returns, split tenders with gift cards, concurrent drawer access
- Void interactions with returns and gift cards
- Offline resilience patterns
- UX polish: loading states, error recovery, accessibility
- Documentation: updated CLAUDE.md with all V1.1 gotchas

### Deliverables

- Integration test suite: 50+ tests covering cross-feature flows
- Edge case handlers: partial return + partial gift card + cash split, void after return, exchange with promotion, return of promoted item
- Concurrency: optimistic locking on gift card balance, drawer session guards, promotion `max_uses` atomic decrement
- Updated CLAUDE.md: new gotchas for V1.1 features
- Updated CONVENTIONS.md: new patterns for returns, ledgers, fulfillment
- Error recovery: retry logic for failed GL postings, graceful degradation for notification stubs
- Accessibility: keyboard navigation for all POS dialogs, ARIA labels

### Claude Prompt

```
# OPPSERA RETAIL POS V1.1 — SESSION 12: INTEGRATION TESTING + EDGE CASES + POLISH

Read CLAUDE.md and CONVENTIONS.md. All V1.1 features are implemented.

## TASK 1: INTEGRATION TESTS

Write integration-style unit tests (using existing vi.mock patterns) for these cross-feature flows:

### Return Flows
- Return with cash refund: creates return order + negative tender + revenue reversal GL + restock movement
- Return with store credit: creates return + issues store credit + liability GL
- Return of promoted item: refund amount respects applied promotion (not full price)
- Partial return: 2 of 3 items, correct amounts
- Exchange even: return $20 item, buy $20 item, no payment needed
- Exchange with balance due: return $15, buy $25, customer pays $10
- Exchange with refund: return $25, buy $15, customer gets $10 back
- Return without receipt: policy evaluation + manager PIN required

### Gift Card Flows
- Sell gift card + redeem on same visit: issue GL + redeem GL balanced
- Partial gift card redemption: $50 card, $30 order, $20 remaining
- Gift card + cash split tender: gift card covers partial, cash covers rest
- Gift card expired: reject redemption
- Gift card void: zero balance + void GL entry

### Store Credit Flows
- Return -> store credit -> redemption in new order: full lifecycle
- Store credit + gift card + cash triple split: all three tenders

### Promotion Flows
- BOGO: buy 2 get 1 free, correct allocation across 3 lines
- Stacking: stackable promo + coupon applied together
- Non-stackable: two competing promos, best discount wins
- Coupon max uses: 10th use succeeds, 11th rejected
- Return of promoted item: discount allocated proportionally

### Drawer Flows
- Open -> paid-in -> sales -> paid-out -> close: expected amount computed correctly
- Blind close: declared vs expected, over/short calculation
- Concurrent drawer prevention: second open attempt rejected

### Fulfillment Flows
- Split fulfillment: 2 take-now + 1 pickup + 1 ship, all status transitions
- Pushed order from PMS: arrives in POS queue, add items, pay

## TASK 2: EDGE CASES & CONCURRENCY

### Gift Card Race Conditions
- Two simultaneous redemptions: optimistic lock on balance_cents prevents double-spend
- Test: concurrent redeemGiftCard with same card, one should fail with ConflictError

### Promotion Max Uses
- Atomic decrement: UPDATE promotion_rules SET current_uses = current_uses + 1 WHERE current_uses < max_uses
- If UPDATE affects 0 rows: promotion exhausted

### Drawer Session Guards
- Partial unique index enforces one open session per terminal at DB level
- Test: concurrent openDrawerSession, one should fail

### Void After Return
- If order has been partially returned, void should fail
- Add check in voidOrder: reject if any return_transactions reference this order

### Return of Voided Order
- Reject: cannot return a voided order

## TASK 3: DOCUMENTATION UPDATES

### Update CLAUDE.md — Add gotchas:
- Gift card balance uses optimistic locking — always check version on redemption
- Store credit ledger is append-only — never update/delete
- Return refund amounts respect applied promotions, not original prices
- Drawer expected calculation includes tenders + paid-in - paid-out in session window
- Pushed orders retain source metadata for cross-module reconciliation
- Manager PIN is bcrypt hashed, 3 attempt lockout
- Promotion engine runs server-side only — never trust client-computed discounts
- Fulfillment shipping fee adds a service charge line to the order
- Gift card and store credit are tender types, not order-level discounts

### Update CONVENTIONS.md — Add sections:
- Section for return transaction patterns
- Section for financial instrument ledgers (append-only patterns)
- Section for fulfillment status machine
- Section for manager PIN override pattern
- Section for order push from external modules

## TASK 4: UX POLISH

### Loading States
- All V1.1 dialogs: show LoadingSpinner during API calls
- Gift card balance check: inline loading while fetching
- Return lookup: skeleton loading for results
- Drawer close: progress indicator during computation

### Error Recovery
- Gift card redemption failure: show balance, suggest partial amount
- Return finalization failure: preserve cart state, show retry
- Promotion apply failure: fall back to no-promo pricing with warning

### Accessibility
- All dialogs: focus trap, Escape to close
- Manager PIN keypad: ARIA labels, keyboard number input
- Return reason dropdown: keyboard navigable
- Fulfillment status buttons: ARIA pressed state

### Touch Targets
- All POS buttons: minimum 44x44px touch target
- Manager PIN keys: 64x64px for easy tapping
- Return line checkboxes: 48px tap area
```

---

## Appendix A: Complete Schema Delta

Every new table, altered table, index, and constraint added by V1.1.

### New Tables (13)

| Table | Description |
|-------|-------------|
| `return_transactions` | Return/exchange header with policy snapshot |
| `return_lines` | Individual returned items with restock action |
| `gift_cards` | Gift card accounts with balance tracking |
| `gift_card_ledger` | Append-only gift card transaction history |
| `store_credit_accounts` | Customer store credit wallets |
| `store_credit_ledger` | Append-only store credit transaction history |
| `promotion_rules` | Promotion definitions with JSON conditions/effects |
| `order_promotions_applied` | Applied promotions per order with allocation |
| `pos_terminals` | Registered POS terminal devices |
| `pos_terminal_settings` | Per-terminal JSON configuration |
| `cash_drawer_sessions` | Drawer open/close lifecycle with counts |
| `cash_drawer_events` | Paid-in/out/drop events within a drawer session |
| `order_fulfillments` | Per-line fulfillment tracking (pickup/ship/take-now) |

### Altered Tables

| Table | Changes |
|-------|---------|
| `orders` | +`order_kind` (SALE\|RETURN\|EXCHANGE), +`original_order_id`, +`return_transaction_id` |
| `order_lines` | +`fulfillment_mode`, +`fulfillment_status` |
| `rm_daily_sales` | +`return_count`, +`return_total`, +`gift_card_issued`, +`gift_card_redeemed`, +`store_credit_issued`, +`promo_discount_total` |

### New GL Accounts

| Account | Name | Category |
|---------|------|----------|
| 2300 | Gift Card Liability | Current Liabilities |
| 2310 | Store Credit Liability | Current Liabilities |

### Key Constraints

- `UNIQUE (tenant_id, card_number)` on `gift_cards`
- `UNIQUE (tenant_id, customer_id)` on `store_credit_accounts`
- `UNIQUE (tenant_id, location_id, name)` on `pos_terminals`
- `PARTIAL UNIQUE (tenant_id, terminal_id) WHERE status='open'` on `cash_drawer_sessions`
- Append-only (SELECT+INSERT only RLS): `gift_card_ledger`, `store_credit_ledger`, `cash_drawer_events`

---

## Appendix B: Accounting Posting Matrix

Every financial action and its corresponding GL double-entry.

| Action | Debit | Credit | Notes |
|--------|-------|--------|-------|
| Gift Card Issued | Cash / Tender | 2300 GC Liability | Amount = card value |
| Gift Card Redeemed | 2300 GC Liability | Revenue | Partial OK |
| Store Credit Issued (return) | Revenue (reversal) | 2310 SC Liability | From return flow |
| Store Credit Redeemed | 2310 SC Liability | Revenue | Partial OK |
| Return (cash refund) | Revenue + Tax Collected | Cash | Full reversal |
| Return (store credit) | Revenue + Tax Collected | 2310 SC Liability | Issues store credit |
| Return (gift card) | Revenue + Tax Collected | 2300 GC Liability | Add to GC balance |
| Exchange (even) | No entry | No entry | Revenue swap |
| Exchange (balance due) | Cash/Tender | Revenue (delta) | Customer pays diff |

---

## Appendix C: Risks & Edge Cases Checklist

### Concurrency

- **Gift card double-spend**: optimistic locking on `balance_cents` column prevents two simultaneous redemptions
- **Drawer session**: partial unique index ensures only one open session per terminal at DB level
- **Promotion max_uses**: atomic `UPDATE...WHERE current_uses < max_uses` prevents over-allocation
- **Return qty tracking**: computed from `return_lines` SUM, not a mutable counter

### Voids & Reversals

- **Void after partial return**: blocked — cannot void an order that has been partially returned
- **Return of voided order**: blocked at `createReturnTransaction` validation
- **Gift card void**: zeroes balance, creates VOID ledger entry, reverses GL liability
- **Store credit void**: NOT supported in V1 (use adjustment for corrections)

### Split Tenders

- **Gift card + cash**: gift card redeemed first, cash covers remainder — both create tender rows
- **Store credit + gift card + cash**: processed in order, each creates tender row with proper GL
- **Refund to original tender**: matches `tender_type` and creates reversal — cash kicks drawer

### Offline & Network Failures

- **Drawer operations**: all server-backed — if offline, POS cannot open drawer (intentional for audit)
- **Gift card balance**: always checked server-side before redemption — no cached balance trust
- **Promotions**: server-side only — if unreachable, POS falls back to no-promo pricing with warning
- **Returns**: require server connectivity for all steps — no offline returns

### Data Integrity

- All ledgers (`gift_card_ledger`, `store_credit_ledger`, `cash_drawer_events`) are append-only with `running_balance`
- Ledger `running_balance` can be verified: SUM of all entries should equal current balance
- Return quantities are computed from `return_lines`, never stored as a mutable counter on `order_lines`
- Promotion allocation is persisted in `order_promotions_applied` for audit trail and return calculations
