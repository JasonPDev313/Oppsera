# Payment Gateway API Reference

All endpoints require authentication via `withMiddleware` and the `payments` entitlement.

## POST /api/v1/payments/authorize

Hold funds on a card without capturing.

**Permission**: `payments.transactions.create`

**Request**:
```json
{
  "clientRequestId": "auth-001",
  "amountCents": 5000,
  "token": "9418594164541111",
  "expiry": "1225",
  "cvv": "123",
  "currency": "USD",
  "paymentMethodType": "card",
  "ecomind": "E",
  "orderId": "order-abc",
  "customerId": "cust-123",
  "terminalId": "term-1",
  "name": "John Doe"
}
```

**Response** (201):
```json
{
  "data": {
    "id": "01JEXAMPLE000001",
    "status": "authorized",
    "amountCents": 5000,
    "currency": "USD",
    "providerReference": "123456789012",
    "cardLast4": "1111",
    "cardBrand": "visa",
    "authCode": "PPS123",
    "avsResponse": "Y",
    "cvvResponse": "M"
  }
}
```

## POST /api/v1/payments/capture

Capture a previously authorized payment.

**Permission**: `payments.transactions.create`

**Request**:
```json
{
  "clientRequestId": "cap-001",
  "paymentIntentId": "01JEXAMPLE000001",
  "amountCents": 4500
}
```

Note: `amountCents` is optional for full capture. Provide it for partial capture (must be <= authorized amount).

**Response** (200):
```json
{
  "data": {
    "id": "01JEXAMPLE000001",
    "status": "captured",
    "amountCents": 4500,
    "capturedAmountCents": 4500,
    "providerReference": "123456789012"
  }
}
```

## POST /api/v1/payments/sale

Combined authorize + capture in one step. Most common for POS payments.

**Permission**: `payments.transactions.create`

**Request**:
```json
{
  "clientRequestId": "sale-001",
  "amountCents": 1500,
  "token": "9418594164541111",
  "expiry": "1225",
  "tipCents": 200,
  "currency": "USD",
  "orderId": "order-xyz",
  "customerId": "cust-456",
  "paymentMethodType": "card",
  "paymentMethodId": "pm-stored-1",
  "metadata": { "source": "pos" }
}
```

Note: Provide either `token` (new card) or `paymentMethodId` (stored card), not both.

**Response** (201):
```json
{
  "data": {
    "id": "01JEXAMPLE000002",
    "status": "captured",
    "amountCents": 1500,
    "tipCents": 200,
    "currency": "USD",
    "providerReference": "123456789013",
    "cardLast4": "1111",
    "cardBrand": "visa",
    "authCode": "PPS456"
  }
}
```

## POST /api/v1/payments/void

Void a transaction (same-day, before settlement).

**Permission**: `payments.transactions.void`

**Request**:
```json
{
  "clientRequestId": "void-001",
  "paymentIntentId": "01JEXAMPLE000002"
}
```

**Response** (200):
```json
{
  "data": {
    "id": "01JEXAMPLE000002",
    "status": "voided",
    "providerReference": "123456789013"
  }
}
```

## POST /api/v1/payments/refund

Refund a captured/settled transaction. Supports partial refunds.

**Permission**: `payments.transactions.void`

**Request**:
```json
{
  "clientRequestId": "refund-001",
  "paymentIntentId": "01JEXAMPLE000002",
  "amountCents": 500
}
```

Note: `amountCents` is optional for full refund. Provide it for partial refund.

**Response** (200):
```json
{
  "data": {
    "id": "01JEXAMPLE000002",
    "status": "refunded",
    "refundedAmountCents": 500,
    "providerReference": "123456789014"
  }
}
```

## GET /api/v1/payments/transactions

Search and list payment intents with filters.

**Permission**: `payments.transactions.view`

**Query Parameters**:
| Param | Type | Description |
|---|---|---|
| `status` | string | Filter by status (authorized, captured, voided, etc.) |
| `dateFrom` | string (YYYY-MM-DD) | Start date |
| `dateTo` | string (YYYY-MM-DD) | End date |
| `amountMinCents` | number | Minimum amount filter |
| `amountMaxCents` | number | Maximum amount filter |
| `cardLast4` | string (4 chars) | Filter by last 4 digits |
| `customerId` | string | Filter by customer |
| `orderId` | string | Filter by order |
| `locationId` | string | Filter by location |
| `cursor` | string | Pagination cursor |
| `limit` | number (1-100, default 25) | Page size |

**Response** (200):
```json
{
  "data": [
    {
      "id": "01JEXAMPLE000001",
      "status": "captured",
      "amountCents": 5000,
      "currency": "USD",
      "paymentMethodType": "card",
      "cardLast4": "1111",
      "cardBrand": "visa",
      "providerReference": "123456789012",
      "orderId": "order-abc",
      "customerId": "cust-123",
      "createdAt": "2026-02-24T10:30:00.000Z"
    }
  ],
  "meta": {
    "cursor": "01JEXAMPLE000001",
    "hasMore": true
  }
}
```

## GET /api/v1/payments/transactions/:id

Get a single payment intent with full transaction history.

**Permission**: `payments.transactions.view`

**Response** (200):
```json
{
  "data": {
    "intent": {
      "id": "01JEXAMPLE000001",
      "status": "captured",
      "amountCents": 5000,
      "capturedAmountCents": 5000,
      "refundedAmountCents": 0,
      "currency": "USD",
      "paymentMethodType": "card",
      "cardLast4": "1111",
      "cardBrand": "visa",
      "orderId": "order-abc",
      "customerId": "cust-123",
      "locationId": "loc-1",
      "metadata": {},
      "createdAt": "2026-02-24T10:30:00.000Z",
      "updatedAt": "2026-02-24T10:30:01.000Z"
    },
    "transactions": [
      {
        "id": "txn-001",
        "type": "authorize",
        "status": "approved",
        "amountDollars": "50.00",
        "providerReference": "123456789012",
        "responseCode": "00",
        "responseText": "Approval",
        "createdAt": "2026-02-24T10:30:00.500Z"
      },
      {
        "id": "txn-002",
        "type": "capture",
        "status": "approved",
        "amountDollars": "50.00",
        "providerReference": "123456789012",
        "responseCode": "00",
        "responseText": "Approval",
        "createdAt": "2026-02-24T10:30:01.000Z"
      }
    ]
  }
}
```

## GET /api/v1/payments/failed

List failed payment intents (declined/error).

**Permission**: `payments.transactions.view`

**Query Parameters**:
| Param | Type | Description |
|---|---|---|
| `counts` | "true" | Return count summary only |
| `dateFrom` | string | Start date (default: 30 days ago) |
| `dateTo` | string | End date |
| `customerId` | string | Filter by customer |
| `locationId` | string | Filter by location |
| `cursor` | string | Pagination cursor |
| `limit` | number | Page size |

**Response** (200):
```json
{
  "data": [
    {
      "id": "01JEXAMPLE000003",
      "status": "declined",
      "amountCents": 2500,
      "currency": "USD",
      "paymentMethodType": "card",
      "cardLast4": "0002",
      "errorMessage": "Insufficient funds",
      "attemptCount": 1,
      "latestResponseText": "Decline",
      "createdAt": "2026-02-24T11:00:00.000Z"
    }
  ],
  "meta": { "cursor": null, "hasMore": false }
}
```

**Count-only response** (`?counts=true`):
```json
{
  "data": {
    "total": 5,
    "declined": 3,
    "error": 2
  }
}
```

## POST /api/v1/payments/failed/:id/retry

Retry a failed payment with the same or different card.

**Permission**: `payments.transactions.void` (write access)

**Request**:
```json
{
  "token": "9418594164549999",
  "paymentMethodType": "card"
}
```

Note: Omit `token` to retry with the original card. Provide `paymentMethodId` to use a stored card.

**Response** (201):
```json
{
  "data": {
    "id": "01JEXAMPLE000004",
    "status": "captured",
    "amountCents": 2500,
    "metadata": {
      "retryOf": "01JEXAMPLE000003",
      "originalIntentId": "01JEXAMPLE000003",
      "retryAttempt": true
    }
  }
}
```

## POST /api/v1/payments/failed/:id/resolve

Mark a failed payment as resolved or dismissed.

**Permission**: `payments.transactions.void` (write access)

**Request**:
```json
{
  "resolution": "resolved",
  "reason": "Customer paid with cash at the counter",
  "paidByOtherMeans": true,
  "otherMeansType": "cash"
}
```

**Response** (200):
```json
{
  "data": {
    "id": "01JEXAMPLE000003",
    "status": "resolved",
    "resolution": "resolved"
  }
}
```

## POST /api/v1/customers/:id/payment-methods

Save a card on file for a customer.

**Permission**: `payments.methods.manage`

**Request**:
```json
{
  "clientRequestId": "save-001",
  "token": "9418594164541111",
  "expiry": "1225",
  "nickname": "Personal Visa",
  "isDefault": true
}
```

## GET /api/v1/customers/:id/payment-methods

List stored payment methods for a customer.

**Permission**: `payments.methods.view`

## DELETE /api/v1/customers/:id/payment-methods/:methodId

Remove a stored payment method.

**Permission**: `payments.methods.manage`

## Error Responses

All errors follow the standard Oppsera error format:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "amountCents must be a positive integer",
    "details": [...]
  }
}
```

| Code | HTTP Status | Description |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Invalid input |
| `NOT_FOUND` | 404 | Intent/method not found |
| `INVALID_STATE` | 409 | Invalid status transition |
| `DUPLICATE_REQUEST` | 409 | Idempotency key conflict |
| `PROVIDER_ERROR` | 502 | Provider API returned an error |
| `PROVIDER_TIMEOUT` | 504 | Provider API timed out |
