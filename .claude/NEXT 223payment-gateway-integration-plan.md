# Oppsera Payment Gateway Integration Plan

## CardPointe/CardConnect — First Provider Implementation

> **Architecture:** Payment-agnostic gateway with pluggable providers. CardPointe is the first provider; future providers (Square, Clover, Worldpay) swap in via settings — no code rewrite.

---

## Architecture Overview

### Core Principles

- **Never store PANs** — tokens only, via CardSecure + Hosted iFrame Tokenizer
- **Provider-agnostic facade** — `PaymentsFacade` routes to active provider per tenant/location
- **Idempotent everything** — `clientRequestId` on all payment operations, checked inside transactions
- **State machine for payment intents** — `created → authorized → captured → settled` (or → voided/refunded)
- **Transactional outbox** — all payment events published via `publishWithOutbox()`
- **Multi-tenant isolation** — RLS + `withTenant()` on every operation

### CardPointe API Quick Reference

| Endpoint | Purpose | Key Fields |
|----------|---------|------------|
| `PUT /auth` | Authorize (+ optional capture) | `merchid, account, amount, expiry, capture, orderid` |
| `PUT /capture` | Capture authorized transaction | `merchid, retref, amount` |
| `PUT /void` | Void unsettled transaction | `merchid, retref` |
| `PUT /refund` | Refund settled transaction | `merchid, retref, amount` |
| `GET /inquire/{retref}/{merchid}` | Check transaction status | Returns full auth response |
| `GET /inquireByOrderid/{orderid}/{merchid}` | Lookup by order ID | For timeout recovery |
| `PUT /voidByOrderId` | Void by order ID | For timeout recovery (retry 3x) |
| `PUT /capture` | Batch capture | `merchid, retref` |
| `GET /settlestat` | Settlement status | Batch/date filtering |
| `PUT /profile` | Create/update stored profile | `merchid, account, expiry, name, profileupdate` |
| `GET /profile/{profileid}/{acctid}/{merchid}` | Get stored profile | Returns token + card info |
| `DELETE /profile/{profileid}/{acctid}/{merchid}` | Delete profile | — |
| `PUT /sigcap` | Signature capture | `merchid, retref, signature` |

**Base URL:** `https://{site}.cardconnect.com/cardconnect/rest/`
**Auth:** HTTP Basic (`username:password` base64)
**Responses:** `respstat` = `A` (approved), `B` (retry), `C` (declined)

### Payment Touchpoint Map

| Touchpoint | Module | Integration Method |
|------------|--------|--------------------|
| F&B POS Pay | fnb | `PaymentsFacade.sale()` |
| F&B Split Pay | fnb | Multiple `PaymentsFacade.sale()` calls |
| F&B Tab Preauth | fnb | `PaymentsFacade.authorize()` → later `capture()` |
| F&B Tip Adjust | fnb | Tip adjustment via `capture()` with updated amount |
| Retail POS | orders | `PaymentsFacade.sale()` |
| Retail Returns | orders | `PaymentsFacade.refund()` |
| QR Pay-at-Table | fnb | Hosted iFrame → `PaymentsFacade.sale()` |
| Online Checkout | orders | Hosted iFrame → `PaymentsFacade.sale()` |
| Stored Cards | customers | `PaymentsFacade.tokenize()` + `createProfile()` |
| Autopay | memberships | `PaymentsFacade.sale()` with stored token |
| Recurring Dues | memberships | Scheduled job → `PaymentsFacade.sale()` |
| PMS Deposits | pms | `PaymentsFacade.authorize()` |
| Voids | all | `PaymentsFacade.void()` |
| Refunds | all | `PaymentsFacade.refund()` |
| Chargebacks | accounting | Webhook → GL posting |
| Settlement | accounting | Daily batch job + reconciliation |

---

## Session Prompts

Each session below is a self-contained prompt you can feed to Claude. Paste the session prompt along with your `CLAUDE.md` and `CONVENTIONS.md` files.

---

### SESSION 1: Foundation Schema & Core Types

**Paste this prompt to Claude:**

```
CONTEXT: We are building a payment-agnostic gateway module for Oppsera ERP. CardPointe/CardConnect is the first provider. Read CLAUDE.md and CONVENTIONS.md first.

OBJECTIVE: Create the database schema and TypeScript types for the payments module.

EXISTING TABLES TO REFERENCE (do NOT recreate — these already exist):
- `tenders` — payment records with provider_ref, card_last4, card_brand, amount_cents
- `tender_reversals` — voids/refunds linked to tenders
- `tender_signatures` — signature capture data
- `payment_settlements` — batch settlement tracking
- `payment_settlement_lines` — line-item settlement matching
- `chargebacks` — dispute tracking with lifecycle (received/won/lost)
- `customer_payment_methods` — stored tokens per customer
- `billing_accounts` — house accounts with autopay
- `autopay_profiles`, `autopay_runs`, `autopay_attempts`

NEW TABLES TO CREATE in `packages/modules/payments/src/schema.ts`:

1. `payment_providers` — catalog of available providers
   - id (ULID PK), tenant_id, code (unique per tenant: 'cardpointe', 'square', etc.), display_name, provider_type ('gateway'|'terminal'|'both'), is_active, config (jsonb — non-sensitive settings like sandbox mode), created_at, updated_at

2. `payment_provider_credentials` — encrypted credentials per tenant + optional location
   - id (ULID PK), tenant_id, provider_id (FK), location_id (nullable — null = tenant-wide default), merchant_id (the provider's merchant ID), credentials_encrypted (text — encrypted JSON blob: {username, password, site}), is_sandbox, is_active, created_at, updated_at
   - Unique constraint: (tenant_id, provider_id, location_id)

3. `payment_intents` — authorization lifecycle state machine
   - id (ULID PK), tenant_id, location_id, provider_id (FK), status ('created'|'authorized'|'capture_pending'|'captured'|'voided'|'refund_pending'|'refunded'|'declined'|'error'), amount_cents (integer, requested), currency (default 'USD'), authorized_amount_cents (nullable), captured_amount_cents (nullable), refunded_amount_cents (nullable), customer_id (nullable FK), order_id (nullable — our internal order ID), provider_order_id (text — sent to CardPointe as orderid for idempotent lookups), payment_method_type ('card'|'ach'|'token'|'terminal'), token (nullable — CardSecure token), card_last4 (nullable), card_brand (nullable), metadata (jsonb — arbitrary caller context), idempotency_key (text, unique per tenant), error_message (nullable), created_at, updated_at, created_by
   - Index on (tenant_id, status)
   - Index on (tenant_id, order_id)
   - Index on (tenant_id, provider_order_id)

4. `payment_transactions` — individual provider API call records (one intent can have multiple transactions: auth, capture, void)
   - id (ULID PK), tenant_id, payment_intent_id (FK), transaction_type ('authorization'|'capture'|'void'|'refund'|'inquiry'), provider_ref (text — CardPointe retref), auth_code (nullable), amount_cents (integer), response_status ('approved'|'declined'|'retry'|'error'), response_code (text — CardPointe respcode), response_text (text — CardPointe resptext), avs_response (nullable), cvv_response (nullable), provider_response (jsonb — full raw response), created_at
   - Index on (tenant_id, provider_ref)
   - Index on (payment_intent_id)

5. `payment_webhook_events` — webhook deduplication
   - id (ULID PK), tenant_id, provider_code (text), event_type (text), event_id (text — provider's event identifier), payload (jsonb), processed_at (nullable timestamp), error (nullable text), created_at
   - Unique constraint: (tenant_id, provider_code, event_id)

ALSO CREATE in `packages/modules/payments/src/validation.ts`:
- Zod schemas for all command inputs (authorize, capture, sale, void, refund, tokenize, createProfile)
- Export inferred TypeScript types

ALSO CREATE in `packages/modules/payments/src/events/types.ts`:
- Event type constants: PAYMENT_EVENTS = {
    AUTHORIZED: 'payment.authorized.v1',
    CAPTURED: 'payment.captured.v1',
    VOIDED: 'payment.voided.v1',
    REFUNDED: 'payment.refunded.v1',
    DECLINED: 'payment.declined.v1',
    SETTLED: 'payment.settled.v1',
    CHARGEBACK_RECEIVED: 'payment.chargeback.received.v1',
  }

CONVENTIONS TO FOLLOW:
- All IDs: ULID via $defaultFn(generateUlid)
- All tables: tenant_id NOT NULL with FK to tenants.id
- All tables: created_at/updated_at with timezone, defaultNow()
- Snake_case in Postgres, camelCase in TypeScript (Drizzle handles mapping)
- Indexes on tenant_id for every table
- Follow the exact schema pattern from CONVENTIONS.md

Create the migration SQL file as well: `packages/db/migrations/NNNN_payment_gateway_foundation.sql`
```

---

### SESSION 2: Provider Plugin Interface & CardPointe Client

**Paste this prompt to Claude:**

```
CONTEXT: Continuing payment gateway module. Session 1 created the schema. Read CLAUDE.md and CONVENTIONS.md.

OBJECTIVE: Build the abstract provider interface and CardPointe HTTP client implementation.

FILE 1: `packages/modules/payments/src/providers/interface.ts`

Create the PaymentProvider interface:

interface PaymentProvider {
  readonly code: string; // 'cardpointe', 'square', etc.

  // Core transaction operations
  authorize(request: AuthorizeRequest): Promise<AuthorizeResponse>;
  capture(request: CaptureRequest): Promise<CaptureResponse>;
  sale(request: SaleRequest): Promise<SaleResponse>; // auth + capture in one
  void(request: VoidRequest): Promise<VoidResponse>;
  refund(request: RefundRequest): Promise<RefundResponse>;

  // Status
  inquire(providerRef: string): Promise<InquireResponse>;
  inquireByOrderId(orderId: string): Promise<InquireResponse>;

  // Tokenization & profiles
  tokenize(request: TokenizeRequest): Promise<TokenizeResponse>;
  createProfile(request: CreateProfileRequest): Promise<CreateProfileResponse>;
  getProfile(profileId: string, acctId?: string): Promise<ProfileResponse>;
  deleteProfile(profileId: string, acctId?: string): Promise<void>;

  // Settlement
  getSettlementStatus(date: string): Promise<SettlementStatusResponse>;

  // Signature
  captureSignature(providerRef: string, signature: string): Promise<void>;

  // Timeout recovery
  voidByOrderId(orderId: string): Promise<VoidResponse>;
}

Define all request/response types. Key fields per operation:

AuthorizeRequest: { merchantId, amount (string, dollars), currency, token (CardSecure token), expiry, orderId (our idempotent order ID), capture ('Y'|'N'), ecomind ('E'|'R'|'T'), name?, address?, postal?, cvv2?, userfields? }

AuthorizeResponse: { providerRef (retref), authCode, amount, status ('approved'|'declined'|'retry'), responseCode (respcode), responseText, token, cardLast4 (from token), cardBrand, avsResponse, cvvResponse, rawResponse (full JSON) }

CaptureRequest: { merchantId, providerRef (retref), amount? (optional partial) }
VoidRequest: { merchantId, providerRef (retref) }
RefundRequest: { merchantId, providerRef (retref), amount? (optional partial) }

FILE 2: `packages/modules/payments/src/providers/cardpointe/client.ts`

CardPointe HTTP client:
- Constructor: { site, merchantId, username, password, sandbox }
- Base URL: `https://${site}.cardconnect.com/cardconnect/rest/`
- Auth: HTTP Basic header
- Methods for each endpoint (PUT /auth, PUT /capture, PUT /void, etc.)
- Request/response logging (redact sensitive fields: account, cvv2)
- Timeout: 30 seconds for auth, 15 seconds for others
- Retry logic for network errors only (not business declines):
  - Max 3 retries with exponential backoff (1s, 2s, 4s)
  - On timeout with no response: call inquireByOrderId first
  - If still no response: call voidByOrderId 3x

FILE 3: `packages/modules/payments/src/providers/cardpointe/provider.ts`

CardPointeProvider implements PaymentProvider:
- Maps our generic request types to CardPointe-specific API format
- Maps CardPointe responses back to our generic types
- Translates respstat: A → 'approved', B → 'retry', C → 'declined'
- Extracts card brand + last4 from token (CardSecure format: 9 + first 2 digits + ... + last 4)
- Handles CardPointe-specific error codes

FILE 4: `packages/modules/payments/src/providers/cardpointe/types.ts`

CardPointe-specific request/response interfaces matching their exact API:
- CardPointeAuthRequest, CardPointeAuthResponse, etc.
- All fields as strings (CardPointe API uses string amounts like "100.00")

FILE 5: `packages/modules/payments/src/providers/registry.ts`

ProviderRegistry — singleton that maps provider codes to factory functions:
- register(code: string, factory: (credentials) => PaymentProvider)
- get(code: string, credentials): PaymentProvider
- Pre-register 'cardpointe' provider

IMPORTANT:
- Use native fetch() for HTTP calls (Node 18+)
- Amount conversion: our system uses cents (integer), CardPointe uses dollar strings — convert in the provider mapping layer
- orderId sent to CardPointe should be our payment_intent.provider_order_id (max 19 chars, alphanumeric)
- Always include "receipt": "Y" in auth requests for receipt data
- For card-not-present: ecomind = "E" (ecommerce) or "R" (recurring)
- For card-present: ecomind = "T" (terminal) — but terminal integration uses separate Bolt API
```

---

### SESSION 3: PaymentsFacade & Core Commands

**Paste this prompt to Claude:**

```
CONTEXT: Continuing payment gateway module. Sessions 1-2 created schema + provider interface. Read CLAUDE.md and CONVENTIONS.md.

OBJECTIVE: Build the PaymentsFacade (public API) and core payment commands. This is the layer that all POS/online/recurring callers use.

FILE 1: `packages/modules/payments/src/facade.ts`

PaymentsFacade — singleton class that is the single entry point for all payment operations:

class PaymentsFacade {
  // Resolve which provider + credentials to use for this tenant/location
  private async resolveProvider(tenantId: string, locationId?: string): Promise<PaymentProvider>
  // Looks up active payment_provider_credentials for tenant + location fallback

  async authorize(ctx: RequestContext, input: AuthorizeInput): Promise<PaymentIntentResult>
  async capture(ctx: RequestContext, input: CaptureInput): Promise<PaymentIntentResult>
  async sale(ctx: RequestContext, input: SaleInput): Promise<PaymentIntentResult>
  async void(ctx: RequestContext, input: VoidInput): Promise<PaymentIntentResult>
  async refund(ctx: RequestContext, input: RefundInput): Promise<PaymentIntentResult>
  async tokenize(ctx: RequestContext, input: TokenizeInput): Promise<TokenResult>
  async createProfile(ctx: RequestContext, input: CreateProfileInput): Promise<ProfileResult>
  async inquire(ctx: RequestContext, paymentIntentId: string): Promise<PaymentIntentResult>
}

export const paymentsFacade = new PaymentsFacade();

FILE 2: `packages/modules/payments/src/commands/authorize.ts`

async function authorizePayment(ctx: RequestContext, input: AuthorizeInput): Promise<PaymentIntent>

Flow:
1. Inside publishWithOutbox(ctx, async (tx) => { ... }):
   a. Idempotency check (checkIdempotency with input.clientRequestId)
   b. Create payment_intent row: status='created', generate provider_order_id (ULID truncated to 19 chars)
   c. Resolve provider (outside tx is fine — credentials are read-only)
   d. Call provider.authorize({ ...input, orderId: intent.providerOrderId })
   e. Insert payment_transaction row with provider response
   f. Update payment_intent:
      - If approved: status='authorized', authorized_amount_cents, card_last4, card_brand
      - If declined: status='declined', error_message
      - If retry/error: status='error', error_message
   g. Build event: payment.authorized.v1 or payment.declined.v1
   h. Save idempotency key
   i. Return { result: intent, events }
2. Audit log

IMPORTANT — Timeout recovery:
- If provider call throws a timeout error:
  a. Call provider.inquireByOrderId(intent.providerOrderId)
  b. If found + approved: update intent to authorized
  c. If found + declined: update intent to declined
  d. If not found: call provider.voidByOrderId(intent.providerOrderId) 3x, set intent to 'error'

FILE 3: `packages/modules/payments/src/commands/capture.ts`

async function capturePayment(ctx: RequestContext, input: CaptureInput): Promise<PaymentIntent>

Flow:
1. Load payment_intent, verify status='authorized'
2. Call provider.capture({ providerRef, amount })
3. Insert payment_transaction
4. Update intent: status='captured', captured_amount_cents
5. Publish payment.captured.v1 event

FILE 4: `packages/modules/payments/src/commands/sale.ts`

async function salePayment(ctx: RequestContext, input: SaleInput): Promise<PaymentIntent>

Same as authorize but with capture='Y'. Creates intent, calls provider with capture flag, goes directly to 'captured' status.

FILE 5: `packages/modules/payments/src/commands/void-payment.ts`

async function voidPayment(ctx: RequestContext, input: VoidInput): Promise<PaymentIntent>

Flow:
1. Load payment_intent, verify status is 'authorized' or 'captured' (pre-settlement only)
2. Get provider_ref from latest payment_transaction
3. Call provider.void({ providerRef })
4. Insert payment_transaction (type='void')
5. Update intent: status='voided'
6. Publish payment.voided.v1

FILE 6: `packages/modules/payments/src/commands/refund.ts`

async function refundPayment(ctx: RequestContext, input: RefundInput): Promise<PaymentIntent>

Flow:
1. Load payment_intent, verify status is 'captured' (post-settlement)
2. Validate refund amount <= captured - already refunded
3. Call provider.refund({ providerRef, amount })
4. Insert payment_transaction (type='refund')
5. Update intent: status='refunded' (or 'captured' if partial), refunded_amount_cents += amount
6. Publish payment.refunded.v1

Note: CardPointe now does real-time refund authorizations. Refunds can be declined. Handle refund decline by setting status='error' with error_message.

FILE 7: `packages/modules/payments/src/helpers/amount.ts`

Utility functions:
- centsToDollars(cents: number): string — "100.00" format
- dollarsToCents(dollars: string): number — parse + round
- generateProviderOrderId(): string — ULID truncated to 19 alphanumeric chars

CONVENTIONS:
- Every command follows the publishWithOutbox + idempotency + auditLog pattern
- RequestContext as first arg
- Zod validation happens in route handlers, not commands
- Use tx (transaction handle) inside publishWithOutbox, not bare db
- Events are self-contained (include all relevant IDs in payload)
```

---

### SESSION 4: Tokenization & Customer Profiles

**Paste this prompt to Claude:**

```
CONTEXT: Continuing payment gateway module. Sessions 1-3 built schema, provider, facade. Read CLAUDE.md and CONVENTIONS.md.

OBJECTIVE: Implement card tokenization, customer payment profiles, and stored payment method management.

BACKGROUND — CardPointe tokenization flow:
1. Client-side: Hosted iFrame Tokenizer captures card → returns CardSecure token
2. Server-side: Use token in auth requests, or create a Profile for reuse
3. Profile = stored customer record on CardPointe side, holds multiple payment methods (acctids)
4. Profile format: "profileid/acctid" — e.g., "16178397535388255208/1"

EXISTING TABLE: `customer_payment_methods` already exists with columns:
- id, tenant_id, customer_id, provider, token, card_last4, card_brand, expiry_month, expiry_year, is_default, nickname, created_at, updated_at

We need to ADD columns to customer_payment_methods (migration):
- provider_profile_id (text, nullable) — CardPointe profileid
- provider_account_id (text, nullable) — CardPointe acctid
- payment_method_type ('card'|'ach')
- billing_address (jsonb, nullable)

FILE 1: `packages/modules/payments/src/commands/tokenize-card.ts`

async function tokenizeCard(ctx: RequestContext, input: TokenizeInput): Promise<TokenResult>

This is a pass-through to CardSecure. In practice, the Hosted iFrame already returns a token client-side. This command exists for server-side tokenization flows (e.g., importing cards, terminal reads).

Flow:
1. Resolve provider
2. Call provider.tokenize({ account, expiry })
3. Return { token, cardLast4, cardBrand, expiry }

FILE 2: `packages/modules/payments/src/commands/create-payment-profile.ts`

async function createPaymentProfile(ctx: RequestContext, input: CreateProfileInput): Promise<PaymentMethodResult>

Flow:
1. publishWithOutbox(ctx, async (tx) => { ... })
2. Idempotency check
3. Call provider.createProfile({ token, expiry, name, address, postal })
4. CardPointe returns { profileid, acctid, token }
5. Upsert customer_payment_methods row:
   - provider_profile_id = profileid
   - provider_account_id = acctid
   - token, card_last4 (extracted from token), card_brand, expiry
   - If is_default and customer has other methods, unset their is_default
6. Build event, save idempotency key
7. Audit log

FILE 3: `packages/modules/payments/src/commands/add-payment-method.ts`

async function addPaymentMethod(ctx: RequestContext, input: AddPaymentMethodInput): Promise<PaymentMethodResult>

For adding a second card to an existing profile:
1. Look up existing customer_payment_methods for this customer to find profileid
2. Call provider.createProfile({ profileupdate: 'Y', profile: existingProfileId, token, expiry })
3. Insert new customer_payment_methods row with new acctid
4. If is_default, unset others

FILE 4: `packages/modules/payments/src/commands/remove-payment-method.ts`

async function removePaymentMethod(ctx: RequestContext, input: RemoveMethodInput): Promise<void>

Flow:
1. Load customer_payment_methods row
2. Call provider.deleteProfile(profileId, acctId)
3. Soft-delete or hard-delete the row (soft = set deleted_at)
4. If was default, promote next method to default
5. Audit log

FILE 5: `packages/modules/payments/src/commands/set-default-payment-method.ts`

Simple: unset is_default on all customer's methods, set on target.

FILE 6: `packages/modules/payments/src/queries/list-payment-methods.ts`

Query: select from customer_payment_methods where customer_id = X, not deleted, ordered by is_default desc, created_at desc. Return masked card info (last4, brand, expiry, nickname).

MIGRATION: `packages/db/migrations/NNNN_payment_methods_profile_columns.sql`
- ALTER TABLE customer_payment_methods ADD COLUMN provider_profile_id TEXT;
- ALTER TABLE customer_payment_methods ADD COLUMN provider_account_id TEXT;
- ALTER TABLE customer_payment_methods ADD COLUMN payment_method_type TEXT DEFAULT 'card';
- ALTER TABLE customer_payment_methods ADD COLUMN billing_address JSONB;

IMPORTANT:
- Never store raw card numbers
- Token extraction: CardSecure token format = "9" + first 2 digits + masked + last 4
- Card brand detection from BIN (first 6 digits): Visa starts 4, MC starts 5/2, Amex starts 34/37, Discover starts 6011/65
- For recurring/autopay: store the CardPointe profile and use profile token in auth requests
```

---

### SESSION 5: F&B POS Integration

**Paste this prompt to Claude:**

```
CONTEXT: Continuing payment gateway module. Sessions 1-4 built core payment infrastructure. Read CLAUDE.md and CONVENTIONS.md.

OBJECTIVE: Integrate PaymentsFacade into the F&B POS payment flows. Replace direct tender creation with gateway-routed payments.

EXISTING F&B PAYMENT FLOW (from CLAUDE.md):
- Session 7: splitTender, startPaymentSession, completePaymentSession
- fnb_tabs hold the open check
- fnb_payment_sessions track the payment lifecycle
- fnb_tab_preauths track preauthorizations on bar tabs
- Tenders are created via tender.recorded.v1 event
- Tips are added post-payment
- Split payments = multiple tenders per tab

WHAT NEEDS TO CHANGE:

FILE 1: `packages/modules/fnb/src/commands/process-card-payment.ts` (NEW)

async function processCardPayment(ctx: RequestContext, input: ProcessCardPaymentInput)

Input: { tabId, amount_cents, token?, paymentMethodId?, tip_cents?, clientRequestId }

Flow:
1. Load fnb_tab, validate status
2. If token provided (new card): call paymentsFacade.sale(ctx, { amountCents: amount_cents + tip_cents, token, ... })
3. If paymentMethodId provided (stored card): load customer_payment_methods, use stored token, call paymentsFacade.sale()
4. If sale succeeds:
   a. Create tender record (existing pattern) with provider_ref = paymentIntent.providerRef
   b. Link tender to payment_intent_id
   c. If tip_cents > 0, create order_tip record
   d. Publish tender.recorded.v1 event (existing pattern — this triggers GL posting)
5. If sale fails: throw AppError with decline reason, do NOT create tender

FILE 2: `packages/modules/fnb/src/commands/preauthorize-tab.ts` (UPDATE existing)

For bar tab preauths (open a tab with a card hold):
1. Call paymentsFacade.authorize(ctx, { amountCents: preauth_amount, token, ... })
2. Store payment_intent_id on fnb_tab_preauths record
3. When tab closes: call paymentsFacade.capture() with final amount (including tip)
4. If capture amount > authorized amount: void original auth, run new sale for full amount

FILE 3: `packages/modules/fnb/src/commands/close-tab-with-preauth.ts` (NEW or UPDATE)

Flow:
1. Load tab + preauth
2. Calculate final amount (subtotal + tip + tax)
3. If final <= authorized: capture(retref, finalAmount)
4. If final > authorized: void original, sale for full amount with stored token
5. Create tender, publish events

FILE 4: `packages/modules/fnb/src/commands/void-tab-payment.ts` (UPDATE)

When voiding a tab payment:
1. Load tender + linked payment_intent
2. If payment_intent status = 'captured' and not yet settled: call paymentsFacade.void()
3. If already settled: call paymentsFacade.refund()
4. Create tender_reversal record
5. Publish events

FILE 5: `packages/modules/fnb/src/commands/process-split-payment.ts` (UPDATE)

Split payments (by seat, item, amount, even):
- Each split portion is a separate paymentsFacade.sale() call
- Each gets its own tender record
- If any portion fails, previous portions remain (don't auto-void — let staff decide)
- Track split_payment_session linking all intents

INTEGRATION NOTES:
- The existing tender.recorded.v1 consumer handles GL posting — no changes needed there
- Cash payments bypass PaymentsFacade entirely — only card/ach go through gateway
- Terminal payments (physical card reader) will use CardPointe's Bolt Terminal API in a future session — for now, support manual card entry (token from Hosted iFrame) and stored cards
- Payment type routing: if tender_type = 'cash', skip gateway. If 'card'/'ach', use gateway.

API ROUTES to update:
- POST /api/v1/fnb/tabs/[id]/pay — add payment_method handling
- POST /api/v1/fnb/tabs/[id]/preauth — use authorize flow
- POST /api/v1/fnb/tabs/[id]/close — use capture flow
- POST /api/v1/fnb/tabs/[id]/void — use void/refund flow
```

---

### SESSION 6: Retail POS Integration

**Paste this prompt to Claude:**

```
CONTEXT: Continuing payment gateway module. Session 5 did F&B POS. Read CLAUDE.md and CONVENTIONS.md.

OBJECTIVE: Integrate PaymentsFacade into Retail POS checkout, returns, and voids.

EXISTING RETAIL FLOW:
- orders module handles retail checkout
- order.placed.v1 triggers inventory, AR, etc.
- tender.recorded.v1 triggers GL posting
- Line-item returns supported via return_lines

FILE 1: `packages/modules/orders/src/commands/process-card-payment.ts` (NEW)

Similar to F&B but for retail orders:

Input: { orderId, amount_cents, token?, paymentMethodId?, clientRequestId }

Flow:
1. Load order, validate status (must be placed, not already fully paid)
2. Call paymentsFacade.sale(ctx, { amountCents, token/storedToken, orderId, ... })
3. On success: create tender record with payment_intent linkage
4. Publish tender.recorded.v1
5. If order is now fully paid, update order status

FILE 2: `packages/modules/orders/src/commands/process-return-refund.ts` (NEW)

Input: { orderId, returnLineIds, refundAmountCents, originalTenderId, clientRequestId }

Flow:
1. Load order + original tender + linked payment_intent
2. Validate refund amount <= original tender amount - already refunded
3. Call paymentsFacade.refund(ctx, { paymentIntentId, amountCents })
4. On success: create tender_reversal record
5. Publish events

FILE 3: `packages/modules/orders/src/commands/void-order-payment.ts` (UPDATE)

Same-day void (pre-settlement):
1. Load tender + payment_intent
2. Call paymentsFacade.void()
3. Create tender_reversal
4. Existing order.voided.v1 flow handles inventory reversal + GL

FILE 4: Update existing retail POS API routes:
- POST /api/v1/orders/[id]/pay — route card payments through gateway
- POST /api/v1/orders/[id]/refund — route refunds through gateway
- POST /api/v1/orders/[id]/void — route voids through gateway

IMPORTANT:
- Split tenders on retail: customer pays partly cash, partly card. Cash tender is direct. Card tender goes through gateway.
- Gift cards: separate tender type, does NOT go through PaymentsFacade (handled by gift card module)
- Existing GL posting consumers should continue working — they react to tender.recorded.v1 regardless of whether payment went through gateway
```

---

### SESSION 7: QR Pay-at-Table & Online Payments

**Paste this prompt to Claude:**

```
CONTEXT: Continuing payment gateway module. Read CLAUDE.md and CONVENTIONS.md.

OBJECTIVE: Implement QR code pay-at-table using CardPointe's Hosted iFrame Tokenizer, and the shared online payment component.

CARDPOINTE HOSTED iFrame TOKENIZER:
- URL: https://{site}.cardconnect.com/itoke/ajax-tokenizer.html
- Embeds as an <iframe> in your payment page
- Parameters: ?useexpiry=true&usecvv=true&css=... (customization)
- Returns token via window.postMessage: { message: "token_value", expiry: "MMYY", validationError: "" }
- Token is a CardSecure token ready for auth/sale requests
- PCI-compliant: card data never touches our servers

FILE 1: `apps/web/src/components/payments/cardpointe-iframe-tokenizer.tsx` (NEW)

React component that:
1. Renders an iframe pointing to CardPointe's hosted tokenizer
2. Accepts props: { site, onToken, onError, useExpiry, useCvv, style/css customization }
3. Listens for postMessage from iframe with token data
4. Calls onToken({ token, expiry }) when tokenization succeeds
5. Handles validation errors from iframe
6. Includes loading state while iframe loads

IMPORTANT: The iframe URL and site come from provider credentials — need an API endpoint to get the tokenizer config (site name only, NOT credentials) for the current tenant/location.

FILE 2: `apps/web/src/app/api/v1/payments/tokenizer-config/route.ts` (NEW)

GET endpoint that returns { site, iframeUrl } for the tenant's active CardPointe provider.
- Loads payment_provider_credentials for tenant
- Returns only the site name (non-sensitive)
- Returns the full iframe URL

FILE 3: `apps/web/src/app/guest-pay/[token]/page.tsx` (UPDATE existing)

QR pay-at-table guest page:
1. Guest scans QR code → lands on /guest-pay/{session_token}
2. Page loads tab summary (items, subtotal, tax, total)
3. Tip selection UI (preset percentages: 18%, 20%, 22%, custom)
4. Embedded CardPointe iFrame Tokenizer for card entry
5. "Pay" button:
   a. iFrame returns CardSecure token
   b. POST /api/v1/guest-pay/{token}/process with { token, expiry, tipCents }
   c. Server-side: calls paymentsFacade.sale()
   d. Show confirmation or error
6. Receipt confirmation page with option to email receipt

FILE 4: `apps/web/src/app/api/v1/guest-pay/[token]/process/route.ts` (NEW)

POST endpoint:
1. Validate session token (lookup guest_pay_sessions or fnb_payment_sessions)
2. Load associated tab/order
3. Call paymentsFacade.sale(ctx, { amountCents: total + tip, token, ecomind: 'E', ... })
4. Create tender + tip records
5. Mark session as completed
6. Return { success, receiptData }

FILE 5: `apps/web/src/components/payments/online-payment-form.tsx` (NEW)

Shared payment form component for any online checkout:
- CardPointe iFrame Tokenizer integration
- Amount display
- Optional: stored payment methods dropdown (if customer is logged in)
- Pay button with loading state
- Error display
- Success callback

This component is reused by:
- QR pay-at-table
- Online ordering checkout
- Member portal payment
- Invoice payment links

SECURITY:
- Guest pay session tokens must be time-limited (e.g., 2 hours)
- Rate-limit payment attempts per session (max 5 attempts)
- Never expose merchant credentials to client
- The iframe src domain must be validated (*.cardconnect.com)
- CORS: guest-pay endpoints must allow browser requests
```

---

### SESSION 8: Stored Payment Methods UI

**Paste this prompt to Claude:**

```
CONTEXT: Continuing payment gateway module. Read CLAUDE.md and CONVENTIONS.md.

OBJECTIVE: Build the customer/member-facing UI for managing stored payment methods.

FILE 1: `apps/web/src/app/api/v1/customers/[id]/payment-methods/route.ts`

CRUD endpoints:
- GET: list customer's stored payment methods (masked: last4, brand, expiry, nickname, isDefault)
- POST: add new payment method (receives token from iFrame, calls createPaymentProfile command)
- DELETE [methodId]: remove payment method (calls removePaymentMethod command)
- PATCH [methodId]: update (set default, change nickname)

FILE 2: `apps/web/src/components/customers/payment-methods-list.tsx`

React component:
- Lists stored cards with brand icon, •••• last4, expiry, default badge
- "Add Payment Method" button → opens dialog with iFrame
- "Set Default" action per card
- "Remove" action with confirmation
- Empty state: "No payment methods on file"

FILE 3: `apps/web/src/components/customers/add-payment-method-dialog.tsx`

Dialog component:
- Embeds CardPointe iFrame Tokenizer
- Optional: nickname field
- Optional: set as default checkbox
- On token received: POST to create payment profile
- Loading + success + error states

FILE 4: `apps/web/src/components/customers/payment-method-card.tsx`

Individual card display component:
- Brand icon (Visa, MC, Amex, Discover)
- •••• {last4}
- Expires {MM/YY}
- Default badge if applicable
- Actions dropdown: Set Default, Edit Nickname, Remove

These components are used in:
- Customer detail page (staff view)
- Member portal (self-service)
- Checkout flows (select stored card)

INTEGRATION:
- The customer detail page already exists — add a "Payment Methods" tab/section
- Permission check: staff need 'customers.payment_methods.manage' permission
- Self-service: members manage their own via member portal auth
```

---

### SESSION 9: Autopay & Recurring Billing Integration

**Paste this prompt to Claude:**

```
CONTEXT: Continuing payment gateway module. Read CLAUDE.md and CONVENTIONS.md.

OBJECTIVE: Integrate PaymentsFacade with the existing autopay and recurring membership billing system.

EXISTING TABLES:
- autopay_profiles: { customer_id, payment_method_id, billing_account_id, is_active, max_amount_cents }
- autopay_runs: { id, run_date, status, total_attempted, total_succeeded, total_failed }
- autopay_attempts: { run_id, customer_id, amount_cents, status, error_message, tender_id }
- membership_accounts: recurring dues billing
- billing_accounts: house accounts with autopay option

FILE 1: `packages/modules/memberships/src/jobs/process-autopay-run.ts` (UPDATE)

Scheduled job that runs daily (or on configured schedule):

Flow:
1. Create autopay_run record (status='processing')
2. Query all active autopay_profiles with outstanding balances
3. For each profile:
   a. Load customer's default payment method (customer_payment_methods)
   b. Calculate amount to charge (outstanding balance, capped at max_amount_cents)
   c. Call paymentsFacade.sale(systemCtx, {
        amountCents,
        token: paymentMethod.token,  // stored CardPointe token
        ecomind: 'R',  // recurring
        customerId,
        metadata: { autopayProfileId, billingAccountId }
      })
   d. Create autopay_attempt record with result
   e. If success: create tender, allocate to billing account (FIFO)
   f. If failed: log error, increment failure count
4. Update autopay_run totals
5. Send notifications for failures

IMPORTANT:
- Use ecomind = 'R' (recurring) for stored credential transactions
- Must handle Visa/MC recurring transaction requirements
- Retry logic: failed payments retry on day+3, day+5, day+7, then suspend autopay
- After 3 consecutive failures on a card: mark payment method as failed, notify customer
- Card Account Updater: CardPointe can auto-update expired cards — check for updated token on profile

FILE 2: `packages/modules/memberships/src/commands/charge-membership-dues.ts` (UPDATE)

For individual membership dues charges:
1. Load membership account + payment method
2. Call paymentsFacade.sale() with recurring ecomind
3. Create tender + billing event
4. Update membership billing status

FILE 3: `packages/modules/memberships/src/helpers/autopay-retry.ts` (NEW)

Retry strategy:
- exponentialBackoffDays = [3, 5, 7] (attempt on day+3, +5, +7 after failure)
- shouldRetry(attempt: AutopayAttempt): boolean
- nextRetryDate(attempt: AutopayAttempt): Date | null
- After max retries: suspend autopay profile, notify via email/push

FILE 4: `packages/modules/memberships/src/helpers/autopay-notifications.ts` (NEW)

Notification triggers:
- Payment failed (immediate): "Your payment of $X for [account] was declined. Please update your payment method."
- Payment method expiring (30 days before): "Your card ending in XXXX expires soon."
- Autopay suspended (after max retries): "Your autopay has been suspended due to repeated failures."

Use existing notification infrastructure (events → notification consumers).

SYSTEM CONTEXT:
For scheduled jobs (no logged-in user), create a system RequestContext:
- Use auditLogSystem() instead of auditLog()
- tenantId comes from the autopay profile
- No userId — system-initiated
```

---

### SESSION 10: Settlement Reconciliation & GL Posting

**Paste this prompt to Claude:**

```
CONTEXT: Continuing payment gateway module. Read CLAUDE.md and CONVENTIONS.md.

OBJECTIVE: Implement daily settlement fetching, transaction matching, and GL posting for payment settlements.

EXISTING TABLES:
- payment_settlements: { batch_id, provider, settled_date, total_amount_cents, status }
- payment_settlement_lines: { settlement_id, tender_id, amount_cents, fee_cents, net_cents }
- Accounting posting adapters exist for POS, void, return, F&B, etc.

FILE 1: `packages/modules/payments/src/jobs/fetch-daily-settlements.ts` (NEW)

Scheduled job — runs daily at configured time (e.g., 6 AM):

Flow:
1. For each active tenant with CardPointe credentials:
   a. Call provider.getSettlementStatus(yesterday's date)
   b. CardPointe returns batch settlement data with transaction details
   c. Create/update payment_settlement record
   d. For each transaction in settlement:
      - Match to our payment_transaction by retref (provider_ref)
      - Create payment_settlement_line linking settlement → tender
      - Record fee amount, net amount
   e. Flag any unmatched transactions (transactions in settlement not in our records)
   f. Flag any missing transactions (our captured transactions not in settlement)

FILE 2: `packages/modules/payments/src/commands/match-settlement.ts` (NEW)

async function matchSettlement(ctx, input: { settlementId, providerBatchData })

Matching logic:
1. For each provider transaction in the batch:
   a. Lookup payment_transactions by provider_ref
   b. If found: create settlement_line with matched tender_id
   c. If not found: create settlement_line with tender_id = null, flag for review
2. For captured payment_intents with no settlement match after 3 days: flag as "missing from settlement"
3. Calculate variance: sum(our_captured_amounts) vs sum(settlement_amounts)

FILE 3: `packages/modules/payments/src/commands/post-settlement-gl.ts` (NEW)

GL posting for settlement:
- Use existing AccountingPostingApi pattern
- Journal entry: DR Bank Account, CR Payment Clearing Account
- Separate entries for: fees (DR Processing Fees Expense, CR Bank Account)
- Chargebacks: DR Chargeback Loss, CR Bank Account
- Adjustments: appropriate accounts based on type

FILE 4: `packages/modules/payments/src/queries/settlement-report.ts` (NEW)

Query for settlement reconciliation UI:
- List settlements by date range
- Settlement detail: matched/unmatched transactions, fees, net amount
- Variance report: our records vs provider records
- Group by location if multi-location

CARDPOINTE SETTLEMENT API:
- GET /settlestat?merchid={mid}&date={MMDD}
- Returns: txns array with retref, amount, status, etc.
- Also: GET /funding?merchid={mid}&date={MMDD} for funding/deposit info

GL ACCOUNT MAPPING:
- Use existing payment_type_gl_defaults table for account mappings
- Add provider-specific GL mapping support (processing fees, chargebacks)
- The existing reconciliation waterfall (orders → tenders → settlements → deposits) should now include gateway settlement data
```

---

### SESSION 11: Webhook Handling

**Paste this prompt to Claude:**

```
CONTEXT: Continuing payment gateway module. Read CLAUDE.md and CONVENTIONS.md.

OBJECTIVE: Implement secure webhook receiver for CardPointe events (chargebacks, status updates, card account updates).

NOTE: CardPointe's webhook/notification capabilities are limited compared to Stripe. Primary webhook use cases:
1. Chargeback notifications (if configured)
2. Card Account Updater notifications (expired card updates)
3. Settlement notifications

FILE 1: `apps/web/src/app/api/webhooks/cardpointe/route.ts` (NEW)

POST endpoint:
1. Verify webhook authenticity (IP whitelist or shared secret — CardPointe uses IP-based auth)
2. Parse payload
3. Deduplication: check payment_webhook_events for existing event_id
4. If new: insert webhook_event, process
5. Return 200 OK (always — even if processing fails, to prevent retries of bad data)

FILE 2: `packages/modules/payments/src/webhooks/handlers.ts` (NEW)

Event handler router:
- processChargebackEvent(event): Create/update chargeback record, trigger GL posting
- processCardUpdateEvent(event): Update stored token on customer_payment_methods
- processSettlementEvent(event): Trigger settlement reconciliation job

FILE 3: `packages/modules/payments/src/webhooks/verify-webhook.ts` (NEW)

Verification:
- CardPointe webhooks: verify source IP is in CardPointe's known IP ranges
- Store allowed IPs in payment_provider_credentials config
- Log all webhook attempts (successful + rejected)

FILE 4: `packages/modules/payments/src/commands/process-chargeback.ts` (NEW or UPDATE)

The chargebacks table already exists. This command:
1. Receives chargeback data from webhook
2. Finds original payment_transaction by retref
3. Creates/updates chargeback record with lifecycle: received → under_review → won/lost
4. Publishes payment.chargeback.received.v1 event
5. GL posting via chargeback-posting-adapter (already exists)

FILE 5: `packages/modules/payments/src/commands/process-card-update.ts` (NEW)

Card Account Updater:
1. Receives updated card data (new token, new expiry)
2. Finds customer_payment_methods by old token
3. Updates token, expiry, card_last4 if changed
4. Audit log the update

SECURITY:
- Webhook endpoint should be rate-limited
- Log full payload for debugging (redact sensitive fields)
- Process asynchronously if possible (acknowledge immediately, process via queue)
- Idempotency: use event_id from webhook to prevent double-processing
```

---

### SESSION 12: Admin UI — Provider Setup & Configuration

**Paste this prompt to Claude:**

```
CONTEXT: Continuing payment gateway module. Read CLAUDE.md and CONVENTIONS.md.

OBJECTIVE: Build admin UI for configuring payment providers and credentials.

FILE 1: `apps/web/src/app/(dashboard)/settings/payments/page.tsx` (NEW)

Tenant-level payment settings page:
- Active provider display (CardPointe logo + status)
- Credentials form (per location or tenant-wide)
- Sandbox/Production toggle
- Test connection button
- Settlement schedule configuration

FILE 2: `apps/web/src/app/(dashboard)/settings/payments/credentials-form.tsx` (NEW)

Form component for CardPointe credentials:
- Merchant ID (text input)
- Username (text input)
- Password (password input, masked)
- Site (text input — e.g., "fts" for UAT, production site for live)
- Sandbox mode toggle
- "Test Connection" button: calls backend to do a inquireMerchant API call
- Save button: encrypts credentials server-side, stores in payment_provider_credentials

FILE 3: `apps/web/src/app/api/v1/settings/payments/route.ts` (NEW)

API endpoints:
- GET: return current provider config (without decrypted credentials)
- POST: save/update credentials (encrypt before storing)
- POST /test: test connection to provider (decrypt credentials, call provider's health check)
- DELETE: deactivate provider credentials

FILE 4: `apps/web/src/app/api/v1/settings/payments/test-connection/route.ts` (NEW)

Test connection flow:
1. Decrypt stored credentials (or use submitted ones for first-time setup)
2. Instantiate CardPointe client
3. Call inquireMerchant endpoint
4. Return success/failure with details

CREDENTIAL ENCRYPTION:
- Use AES-256-GCM encryption
- Encryption key from environment variable (PAYMENT_CREDENTIALS_KEY)
- Store as base64-encoded encrypted blob in credentials_encrypted column
- Decrypt only when instantiating provider client
- Never return decrypted credentials to frontend
- Helper: `packages/modules/payments/src/helpers/credential-encryption.ts`
  - encrypt(data: object, key: string): string
  - decrypt(encrypted: string, key: string): object

PERMISSIONS:
- Only tenant admins (role: 'admin') can view/edit payment settings
- Permission: 'settings.payments.manage'
- Audit log all credential changes (without logging the actual credential values)

MULTI-LOCATION SUPPORT:
- Tenant-wide default credentials (location_id = null)
- Location-specific override (location_id = specific location)
- UI: dropdown to select "All Locations" or specific location
- Resolution: if location has specific credentials, use those; otherwise fall back to tenant default
```

---

### SESSION 13: Admin UI — Transaction Management

**Paste this prompt to Claude:**

```
CONTEXT: Continuing payment gateway module. Read CLAUDE.md and CONVENTIONS.md.

OBJECTIVE: Build admin UI for searching, viewing, voiding, and refunding transactions.

FILE 1: `apps/web/src/app/(dashboard)/payments/transactions/page.tsx` (NEW)

Transaction search/list page:
- Filters: date range, status (all/authorized/captured/voided/refunded/declined), amount range, card last4, customer name
- Results table: date, amount, status badge, card info, customer, order link, actions
- Pagination (cursor-based)
- Export to CSV

FILE 2: `apps/web/src/app/(dashboard)/payments/transactions/[id]/page.tsx` (NEW)

Transaction detail page:
- Payment intent summary: status, amount, created, customer, order
- Timeline: list of payment_transactions (auth → capture → void/refund) with timestamps
- Card details: last4, brand, expiry, AVS/CVV results
- Provider details: retref, authcode, respcode, resptext
- Actions: Void (if capturable), Refund (if settled), Inquire (refresh status from provider)
- Settlement info (if matched)
- Related records: linked tender, order, tab

FILE 3: `apps/web/src/components/payments/transaction-actions.tsx` (NEW)

Action buttons/dialogs:
- Void: confirm dialog → calls void endpoint
- Refund: amount input (default: full, allow partial) → confirm → calls refund endpoint
- Inquire: calls provider to refresh status, updates UI
- Print receipt: generate receipt from transaction data

FILE 4: `apps/web/src/app/api/v1/payments/transactions/route.ts` (NEW)

API endpoints:
- GET: search payment_intents with filters, join payment_transactions for latest status
- GET /[id]: full detail with all transactions + settlement info
- POST /[id]/void: calls paymentsFacade.void()
- POST /[id]/refund: calls paymentsFacade.refund({ amount })
- POST /[id]/inquire: calls paymentsFacade.inquire() → provider.inquire(retref)

FILE 5: `packages/modules/payments/src/queries/search-transactions.ts` (NEW)

Query builder:
- Full-text search on customer name
- Filter by status, date range, amount range, card last4, location
- Join payment_transactions for provider_ref
- Join customers for customer info
- Efficient pagination with cursor

PERMISSIONS:
- 'payments.transactions.view' — see transaction list/details
- 'payments.transactions.void' — perform voids
- 'payments.transactions.refund' — perform refunds
- Staff see only their location's transactions unless they have multi-location access
```

---

### SESSION 14: Failed Payments Queue & Retry UI

**Paste this prompt to Claude:**

```
CONTEXT: Continuing payment gateway module. Read CLAUDE.md and CONVENTIONS.md.

OBJECTIVE: Build a failed payments queue for staff to review, retry, and resolve failed payment attempts.

FILE 1: `apps/web/src/app/(dashboard)/payments/failed/page.tsx` (NEW)

Failed payments queue:
- Lists payment_intents with status='declined' or 'error' from last 30 days
- Columns: date, customer, amount, reason (response text), attempts count, order/tab link, actions
- Filter by: date range, reason category, customer
- Sort by: date (newest first), amount
- Batch actions: bulk resolve/dismiss

FILE 2: `apps/web/src/components/payments/retry-payment-dialog.tsx` (NEW)

Retry dialog:
- Shows failed payment details
- Options:
  a. Retry with same card (if token still valid)
  b. Use different stored payment method (dropdown)
  c. Enter new card (embedded iFrame tokenizer)
  d. Mark as resolved (paid by other means — cash, check)
  e. Dismiss (write off / customer will not pay)
- On retry: creates new payment_intent linked to same order/tab

FILE 3: `apps/web/src/app/api/v1/payments/failed/route.ts` (NEW)

API endpoints:
- GET: query failed payment_intents with filters
- POST /[id]/retry: create new sale attempt
- POST /[id]/resolve: mark as manually resolved (reason required)
- POST /[id]/dismiss: mark as dismissed with reason

FILE 4: `packages/modules/payments/src/commands/retry-failed-payment.ts` (NEW)

Flow:
1. Load original failed payment_intent
2. Validate it's in a retriable state
3. Create new payment_intent with reference to original
4. Call paymentsFacade.sale() with new token or stored method
5. If success: link new tender to original order/tab
6. If fail again: update attempt count, keep in failed queue

FILE 5: `packages/modules/payments/src/commands/resolve-failed-payment.ts` (NEW)

Manual resolution:
1. Update original payment_intent: status='resolved', metadata += resolution details
2. Audit log with resolution reason
3. If staff indicates paid by other means: create appropriate tender (cash, check)

NOTIFICATIONS:
- When payment fails at POS: toast notification to staff immediately
- For online/autopay failures: add to failed queue + optional email to customer
- Dashboard widget: "X failed payments need attention" count badge
```

---

### SESSION 15: Testing & Error Scenarios

**Paste this prompt to Claude:**

```
CONTEXT: Continuing payment gateway module. Read CLAUDE.md and CONVENTIONS.md.

OBJECTIVE: Comprehensive test coverage for all payment operations. Follow the existing test patterns.

CARDPOINTE UAT TESTING:
- UAT site: "fts-uat" (or "fts" depending on config)
- Test MID: 496160873888
- Test credentials: username "testing", password "testing123"
- Amount-driven responses: specific amounts trigger specific responses
  - $10.00 = approved
  - $10.14 = declined (invalid account)
  - $10.51 = declined (insufficient funds)
  - $20.00+ with capture=Y then refund amount $1NNN = specific refund decline codes
- Test card: 4111111111111111 (Visa), expiry any future date

FILE 1: `packages/modules/payments/src/__tests__/authorize.test.ts`

Test cases:
- Successful authorization → payment_intent created with status='authorized'
- Declined card → payment_intent with status='declined', error_message populated
- Idempotent retry → returns same result for same clientRequestId
- Invalid input → AppError thrown before provider call
- Provider timeout → recovery via inquireByOrderId
- Provider timeout + no response → voidByOrderId called 3x

FILE 2: `packages/modules/payments/src/__tests__/capture.test.ts`

Test cases:
- Capture authorized intent → status='captured'
- Partial capture (lower amount) → captured_amount < authorized_amount
- Capture already captured → AppError
- Capture voided intent → AppError

FILE 3: `packages/modules/payments/src/__tests__/sale.test.ts`

Test cases:
- Successful sale → single intent, status='captured'
- Declined → status='declined'
- Idempotency

FILE 4: `packages/modules/payments/src/__tests__/void-payment.test.ts`

Test cases:
- Void authorized → status='voided'
- Void captured (pre-settlement) → status='voided'
- Void already voided → AppError
- Void settled (should fail) → AppError (use refund instead)

FILE 5: `packages/modules/payments/src/__tests__/refund.test.ts`

Test cases:
- Full refund → status='refunded', refunded_amount = captured_amount
- Partial refund → status='captured' still, refunded_amount partial
- Multiple partial refunds → cumulative tracking
- Refund exceeds captured → AppError
- Refund declined (new CardPointe refund auth feature) → error handling

FILE 6: `packages/modules/payments/src/providers/cardpointe/__tests__/provider.test.ts`

Provider-level tests (mock HTTP):
- Auth request formatting (amounts as dollar strings, correct fields)
- Response parsing (respstat mapping, card info extraction from token)
- Error handling for HTTP failures
- Timeout recovery sequence

FILE 7: `packages/modules/payments/src/__tests__/facade.test.ts`

Facade tests:
- Provider resolution (tenant default, location override)
- Credential decryption
- Routing to correct provider

TEST INFRASTRUCTURE:
- Use vitest (per CONVENTIONS.md)
- Mock the provider (don't call real CardPointe in unit tests)
- Mock `@oppsera/shared` for deterministic ULIDs
- Mock publishWithOutbox to capture events
- Use in-memory test patterns from CONVENTIONS.md
- For integration tests: use the mock provider, verify full flow including DB
```

---

### SESSION 16: Documentation & Rollout

**Paste this prompt to Claude:**

```
CONTEXT: Completing payment gateway module. All code sessions done. Read CLAUDE.md and CONVENTIONS.md.

OBJECTIVE: Create comprehensive documentation, feature flags, and rollout plan.

FILE 1: `docs/payments/README.md`

Architecture overview:
- Diagram: Client → PaymentsFacade → Provider → CardPointe API
- Module structure and file organization
- Data flow for each payment type (POS, online, recurring)
- State machine diagram for payment_intents
- Multi-tenant credential resolution

FILE 2: `docs/payments/cardpointe-setup.md`

Step-by-step setup guide:
1. Obtain CardPointe merchant account + API credentials
2. Configure credentials in Oppsera admin (Settings → Payments)
3. Test connection
4. Configure Hosted iFrame Tokenizer for online payments
5. Configure webhook endpoint
6. Enable payment processing per location
7. Test with UAT credentials before going live
8. Switch to production credentials

FILE 3: `docs/payments/api-reference.md`

Document all payment API endpoints:
- POST /api/v1/payments/authorize
- POST /api/v1/payments/capture
- POST /api/v1/payments/sale
- POST /api/v1/payments/void
- POST /api/v1/payments/refund
- GET /api/v1/payments/transactions
- GET /api/v1/payments/transactions/:id
- POST /api/v1/customers/:id/payment-methods
- GET /api/v1/customers/:id/payment-methods
- DELETE /api/v1/customers/:id/payment-methods/:methodId

Include request/response examples for each.

FILE 4: `docs/payments/troubleshooting.md`

Common issues:
- "Declined" responses: code table with common respcode values
- Timeout handling: explain inquireByOrderId + voidByOrderId flow
- Settlement mismatches: how to investigate
- Chargeback handling: lifecycle and GL impact
- Refund authorization declines (new CardPointe feature)
- PCI compliance checklist
- Hosted iFrame not loading: CORS, CSP, iframe policy issues

FILE 5: Feature flag configuration

Add to existing feature flags system:
- `payments.gateway.enabled` — master switch for gateway processing (default: false)
- `payments.gateway.online` — enable online payments / QR pay (default: false)
- `payments.gateway.recurring` — enable autopay through gateway (default: false)

Rollout plan:
1. Deploy with all flags OFF
2. Enable per-tenant in staging/UAT with test credentials
3. Staff testing: POS payments, voids, refunds
4. Enable online payments (QR pay)
5. Enable recurring billing
6. Monitor settlement reconciliation for 1 week
7. Production rollout: one tenant at a time
8. Monitor for 48 hours between tenant rollouts

FILE 6: `docs/payments/adding-a-provider.md`

Guide for adding a new provider (Square, Clover, Worldpay):
1. Implement PaymentProvider interface in `providers/{name}/`
2. Map provider-specific API to our generic types
3. Register in ProviderRegistry
4. Add provider to payment_providers catalog
5. Add credential form fields to admin UI
6. Test with provider's sandbox
7. Add provider-specific settlement fetching
```

---

## Open Questions for Your Team

Before starting implementation, confirm these decisions:

1. **Credential encryption key management** — Environment variable per deployment, or use a secrets manager (AWS KMS, Vault)?
2. **Terminal hardware** — Which CardPointe terminal devices for card-present POS? (Clover Flex, Ingenico Lane, etc.) This determines if we need the Bolt Terminal API integration.
3. **Multi-location providers** — Can different locations within a tenant use different payment providers, or is it always tenant-wide?
4. **Offline mode** — V1 blocks card payments when internet is down. Acceptable for launch?
5. **Preauth expiry** — How long to hold preauths before auto-void? CardPointe default is 7 days. Typical for F&B: 24-48 hours.
6. **Settlement batch time** — When does daily auto-close happen? Typically 3 AM local. Configurable per tenant?
7. **Autopay retry cadence** — How many retries for failed autopay? Recommended: 3 attempts over 7 days, then suspend.
8. **Refund window** — Maximum days after sale for refund? Provider-dependent but business policy matters.
9. **Level 2/3 data** — Capture enhanced interchange data for B2B transactions? Lower fees but more complexity.
10. **Chargeback workflow** — Auto-create dispute case in system, or just log for manual review?

---

## Risk Mitigation

| Risk | Severity | Mitigation |
|------|----------|------------|
| Duplicate charges | Critical | Idempotency keys on every operation, state machine prevents double-capture |
| PCI exposure | Critical | Never touch PAN, Hosted iFrame for web, tokens only in our DB |
| Credential leak | Critical | AES-256-GCM at rest, env-var key, audit all access |
| Provider timeout | High | inquireByOrderId → voidByOrderId 3x → error state |
| Settlement mismatch | Medium | Daily reconciliation job + unmatched alerts |
| Multi-tenant leak | Critical | RLS + app-level tenant filtering + audit log |
| Provider API changes | Medium | Versioned provider interface, adapter pattern |
| Chargeback losses | Medium | Real-time webhook processing, dispute tracking |
