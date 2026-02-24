# Payment Gateway Module

## Architecture Overview

```
Client (POS / Web / QR Pay / Autopay)
    |
    v
PaymentsFacade  (packages/modules/payments/src/facade.ts)
    |
    v
Command Layer   (authorize / capture / sale / void / refund)
    |
    +---> Provider Resolution  (terminal → location → tenant)
    |
    v
Provider Interface  (packages/modules/payments/src/providers/interface.ts)
    |
    v
CardPointe Provider  (providers/cardpointe/)
    |
    v
CardConnect REST API  (https://{site}.cardconnect.com/cardconnect/rest/)
```

## Module Structure

```
packages/modules/payments/src/
├── facade.ts                   # PaymentsFacade — single entry point for all operations
├── gateway-validation.ts       # Zod schemas for all gateway inputs
├── index.ts                    # Module exports
├── commands/
│   ├── authorize.ts            # Auth-only (hold funds)
│   ├── capture.ts              # Capture a prior authorization
│   ├── sale.ts                 # Combined auth + capture
│   ├── void.ts                 # Void a transaction
│   ├── refund.ts               # Full or partial refund
│   ├── tokenize.ts             # Tokenize a card number
│   ├── save-payment-method.ts  # Store card on file
│   ├── remove-payment-method.ts# Delete stored card
│   ├── resolve-failed-payment.ts  # Mark failed payment as resolved
│   └── retry-failed-payment.ts    # Retry a declined/error payment
├── providers/
│   ├── interface.ts            # PaymentProvider interface (14 methods)
│   ├── registry.ts             # ProviderRegistry singleton
│   └── cardpointe/
│       ├── index.ts            # CardPointeProvider implementation
│       └── client.ts           # HTTP client with retry/timeout
├── helpers/
│   ├── amount.ts               # centsToDollars, dollarsToCents, card brand detection
│   ├── credentials.ts          # AES-256-GCM encryption/decryption
│   └── resolve-provider.ts     # 3-tier MID resolution chain
├── events/
│   └── gateway-types.ts        # Event constants, status transitions
├── queries/
│   ├── search-transactions.ts  # Paginated transaction search
│   ├── get-transaction.ts      # Single intent + transactions
│   └── failed-payments.ts      # Failed payment queue queries
├── webhooks/
│   ├── verify-webhook.ts       # Source verification + payload redaction
│   └── process-webhook.ts      # Status update from provider callbacks
├── settlement/
│   └── settlement-service.ts   # Daily settlement reconciliation
├── recurring/
│   └── recurring-billing.ts    # Autopay scheduling + execution
└── reconciliation/
    └── index.ts                # ReconciliationReadApi implementation
```

## Data Flow

### POS Payment (Sale)

1. Cashier taps "Pay" in POS → TenderDialog opens
2. Card swiped/tapped at terminal → tokenized by CardPointe
3. Frontend calls `POST /api/v1/payments/sale` with token + amount
4. `PaymentsFacade.sale()` → resolves provider via terminal MID assignment
5. Creates `payment_intents` row (status: `created`)
6. Calls `CardPointeProvider.sale()` → CardConnect `/auth` endpoint with `capture: 'Y'`
7. On approval: updates intent to `captured`, creates `payment_transactions` row
8. Emits `payment.gateway.captured.v1` event
9. Returns result to frontend → TenderDialog shows success

### Online Payment (QR Pay-at-Table)

1. Guest scans QR code → loads guest pay page
2. Card details entered in CardPointe Hosted iFrame Tokenizer
3. Token returned client-side (PCI-compliant — card data never touches our server)
4. Frontend calls `POST /api/v1/payments/sale` with token
5. Same flow as POS from step 4 onward

### Pre-Auth + Capture (Bar Tab)

1. Open tab: `POST /api/v1/payments/authorize` (hold $X on card)
2. Intent created with status `authorized`
3. Close tab: `POST /api/v1/payments/capture` with final amount
4. Intent transitions to `captured`

### Recurring (Autopay)

1. Customer's stored profile token used
2. Scheduled job calls `PaymentsFacade.sale()` with profile token
3. Same provider flow — no manual card entry needed

## Payment Intent State Machine

```
                 +---> declined
                 |
  created -------+---> authorized ---+---> capture_pending ---> captured --+---> voided
                 |                   |                                      |
                 +---> error         +---> voided                          +---> refund_pending ---> refunded
                 |
                 +---> captured (sale = auth+capture)
```

Terminal states: `voided`, `refunded`, `declined`, `resolved`

Transitions are enforced by `assertIntentTransition()` — invalid transitions throw.

## Multi-Tenant Credential Resolution

Provider credentials are resolved in a 3-tier cascade:

1. **Terminal-level**: `terminal_merchant_assignments` — specific terminal uses a specific MID
2. **Location-level**: `payment_merchant_accounts` with `isDefault = true` for the location
3. **Tenant-level**: `payment_merchant_accounts` with `isDefault = true` and no location filter

This allows:
- Different MIDs per terminal (e.g., bar vs restaurant at same venue)
- Different MIDs per location (e.g., each golf course)
- A single tenant-wide default for simple setups

Credentials are encrypted at rest using AES-256-GCM (`PAYMENT_ENCRYPTION_KEY` env var).

## Schema Tables

| Table | Purpose |
|---|---|
| `payment_providers` | Registered providers (cardpointe, etc.) |
| `payment_provider_credentials` | Encrypted API credentials per provider |
| `payment_merchant_accounts` | MID configurations per tenant/location |
| `terminal_merchant_assignments` | Terminal → MID assignments |
| `payment_intents` | Payment lifecycle tracking |
| `payment_transactions` | Append-only provider API call log |
| `payment_webhook_events` | Inbound webhook log |

## Money Convention

- **Payment intents**: amounts in cents (INTEGER) — matches orders layer
- **Provider interface**: amounts in dollars (string, e.g., "10.00") — matches CardConnect API
- Conversion at module boundary: `centsToDollars()` and `dollarsToCents()`
