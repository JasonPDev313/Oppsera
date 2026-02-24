# Adding a New Payment Provider

This guide covers how to integrate a new payment gateway (e.g., Square, Clover, Worldpay) into the Oppsera payments module.

## Overview

The payments module uses a provider-agnostic architecture. All payment operations go through the `PaymentProvider` interface. Adding a new provider means implementing this interface and registering it.

## Step 1: Create the Provider Directory

```
packages/modules/payments/src/providers/{provider-name}/
├── index.ts     # Provider class implementing PaymentProvider
└── client.ts    # HTTP client for the provider's API
```

## Step 2: Implement the PaymentProvider Interface

The interface is defined in `providers/interface.ts`:

```typescript
export interface PaymentProvider {
  code: string;

  // Core payment operations
  authorize(input: AuthorizeInput): Promise<AuthorizeResult>;
  capture(input: CaptureInput): Promise<CaptureResult>;
  sale(input: SaleInput): Promise<SaleResult>;
  void(input: VoidInput): Promise<VoidResult>;
  refund(input: RefundInput): Promise<RefundResult>;

  // Inquiry
  inquire(retref: string): Promise<InquireResult>;
  inquireByOrderId(orderId: string): Promise<InquireResult>;

  // Tokenization
  tokenize(input: TokenizeInput): Promise<TokenizeResult>;

  // Customer profiles (stored cards)
  createProfile(input: CreateProfileInput): Promise<ProfileResult>;
  getProfile(profileId: string): Promise<ProfileResult>;
  deleteProfile(profileId: string): Promise<void>;

  // Settlement
  getSettlementStatus(date: string): Promise<SettlementResult>;

  // Optional
  captureSignature(retref: string, signature: string): Promise<void>;
  voidByOrderId(orderId: string): Promise<VoidResult>;
}
```

### Implementation Notes

- **Input/output types**: Map from the provider's API format to the generic types in `providers/interface.ts`
- **Amount format**: The interface uses dollar strings (e.g., "10.00"). Convert from/to provider-specific formats internally.
- **Error handling**: Throw `AppError` with appropriate codes (`PROVIDER_ERROR`, `PROVIDER_TIMEOUT`)
- **Timeout handling**: Implement `inquireByOrderId` for timeout recovery. This is critical for POS reliability.

## Step 3: Create the HTTP Client

```typescript
// providers/{name}/client.ts
export class MyProviderClient {
  private baseUrl: string;
  private apiKey: string;

  constructor(credentials: ProviderCredentials, merchantId: string) {
    this.baseUrl = `https://api.myprovider.com/v1`;
    this.apiKey = credentials.apiKey;
  }

  async post<T>(endpoint: string, body: unknown): Promise<T> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      throw new AppError('PROVIDER_ERROR', `Provider returned ${response.status}`, 502);
    }

    return response.json() as T;
  }
}
```

### Timeout & Retry Considerations

- Set a reasonable timeout (30s default, configurable)
- Implement retry only for idempotent operations (inquire, getProfile)
- Never retry `authorize` or `sale` — use `inquireByOrderId` instead
- Throw a typed error (e.g., `MyProviderTimeoutError`) so the command layer can detect timeouts

## Step 4: Register the Provider

In `providers/registry.ts`, add your provider:

```typescript
import { MyProvider } from './{name}';

providerRegistry.register('{name}', (credentials, merchantId) => {
  return new MyProvider(credentials, merchantId);
});
```

The registry lazily instantiates providers — the factory function is only called when a payment is processed.

## Step 5: Add Provider to Database Catalog

Insert a row into `payment_providers`:

```sql
INSERT INTO payment_providers (id, tenant_id, code, display_name, is_active, created_at, updated_at)
VALUES (generate_ulid(), NULL, '{name}', 'My Provider', true, NOW(), NOW());
```

Or add to the seed script for new tenants.

## Step 6: Add Credential Form Fields

In the admin UI (`apps/web/src/app/(dashboard)/settings/merchant-processing/`):

1. Update the provider configuration form to show fields specific to your provider
2. The credential shape is flexible — `payment_provider_credentials.credentials` is an encrypted JSON blob
3. Each provider can have different required fields (API key, secret, site URL, etc.)

Example credential shape:
```typescript
// CardPointe
{ site: string, username: string, password: string }

// Square
{ accessToken: string, locationId: string }

// Stripe
{ secretKey: string, publishableKey: string }
```

## Step 7: Test with Sandbox

1. Get sandbox/UAT credentials from the provider
2. Run through the full lifecycle:
   - Tokenize a test card
   - Authorize → Capture
   - Sale (combined)
   - Void (same-day)
   - Refund (next-day)
   - Save card profile → Charge stored card → Delete profile
   - Settlement status inquiry
3. Test error scenarios:
   - Declined cards
   - Timeout (mock with network delay)
   - Invalid credentials
   - Expired tokens

## Step 8: Add Settlement Fetching

Implement `getSettlementStatus(date)` to fetch settlement batch data:

- Map the provider's settlement report to `SettlementResult`
- The settlement reconciliation service calls this daily
- Store results in `payment_settlements` for GL matching

## Testing Checklist

- [ ] All 14 interface methods implemented
- [ ] Provider registered in registry
- [ ] HTTP client handles timeouts gracefully
- [ ] Error responses mapped to standard error codes
- [ ] Amount conversion correct (cents ↔ provider format)
- [ ] Card brand detection works with provider's token format
- [ ] Settlement data maps correctly
- [ ] Webhook handling (if provider supports callbacks)
- [ ] Credential encryption/decryption works
- [ ] Unit tests for provider-specific response mapping
- [ ] Integration test with sandbox credentials

## Architecture Principles

1. **Never throw from the provider constructor** — providers are instantiated lazily and must not fail at creation time
2. **Provider code is lowercase, no spaces** — e.g., `cardpointe`, `square`, `worldpay`
3. **Credentials are opaque to the command layer** — the command layer passes encrypted credentials to `resolveProvider()`, which decrypts and creates the provider instance
4. **One provider per `payment_providers` row** — each tenant can have multiple providers configured, but each merchant account maps to exactly one provider
5. **The command layer is provider-agnostic** — `authorize.ts`, `capture.ts`, etc. never import provider-specific code
