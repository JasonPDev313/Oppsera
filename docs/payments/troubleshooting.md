# Payment Troubleshooting Guide

## Declined Responses

When a payment is declined, the `responseCode` and `responseText` fields provide details.

### Common CardPointe Response Codes

| Code | Meaning | Action |
|---|---|---|
| `00` | Approval | N/A (success) |
| `05` | Do not honor | Customer should contact their bank |
| `14` | Invalid card number | Re-enter card or try a different card |
| `41` | Lost card | Do not retry — card may be stolen |
| `43` | Stolen card | Do not retry — card reported stolen |
| `51` | Insufficient funds | Customer needs to add funds or use different card |
| `54` | Expired card | Customer should use a non-expired card |
| `57` | Transaction not permitted | Card type may not be accepted for this transaction type |
| `61` | Exceeds withdrawal limit | Try a smaller amount or customer contacts bank |
| `65` | Activity limit exceeded | Too many transactions — wait and retry |
| `91` | Issuer unavailable | Retry after a few minutes |
| `96` | System malfunction | Retry after a few minutes |

### Response Status Codes

| respstat | Meaning |
|---|---|
| `A` | Approved |
| `B` | Retry — temporary failure, safe to retry |
| `C` | Declined — do not retry without customer action |

## Timeout Handling

Payment timeouts are critical — a charge may have been approved by the processor even though we didn't receive the response.

### How Timeouts Work

1. Oppsera sends auth request to CardPointe
2. CardPointe forwards to processor
3. If the HTTP response times out (default: 30s):
   - Intent is updated to `error` status
   - A `CardPointeTimeoutError` is thrown
4. **Recovery flow**:
   - Call `inquireByOrderId(providerOrderId)` to check if CardPointe processed it
   - If processed and approved → update intent to `authorized`/`captured`
   - If not found → safe to void or retry
   - If processed and declined → update intent to `declined`

### Automatic Recovery

The webhook handler also catches timeout cases — if CardPointe sends a webhook for a transaction that timed out on our end, the handler updates the intent status.

### Manual Recovery

From the Transactions page:
1. Find the payment with status `error`
2. Click **Refresh Status** — this calls `inquire` on the provider
3. The system updates the intent based on the provider's response

## Settlement Mismatches

Settlement reconciliation compares expected vs actual amounts.

### Common Causes

| Issue | Cause | Resolution |
|---|---|---|
| Missing settlement | Transaction voided after cutoff | Will appear in next day's settlement |
| Amount mismatch | Partial capture or refund not reflected | Check transaction history for captures/refunds |
| Extra settlement line | Webhook-initiated transaction | Check webhook event log |
| Duplicate settlement | Retry created a second charge | Void the duplicate via provider portal |

### Investigation Steps

1. Go to **Payments > Transactions**
2. Filter by date range matching the settlement batch
3. Compare each settlement line against the transaction list
4. For unmatched items, check the provider's portal directly
5. Use the **Settlement Reconciliation** view in the Accounting module

## Chargeback Handling

Chargebacks follow this lifecycle:

```
received → under_review → won | lost
```

### When a Chargeback is Received

1. System creates a `chargebacks` record
2. GL entry posted: Dr Chargeback Expense / Cr Undeposited Funds
3. Notification sent to the manager dashboard

### Resolution

- **Won** (reversed in your favor): GL reversal entry posted
- **Lost** (upheld): If processor fee applies, additional fee GL entry posted

### Best Practices

- Respond to chargebacks within the processor's deadline (usually 7-14 days)
- Keep receipt/signature data for disputes
- Enable signature capture for transactions over configurable threshold

## Refund Authorization Declines

Some card issuers now decline refund authorizations. When this happens:

1. The refund intent transitions to `declined` instead of `refunded`
2. Check the response code — it may indicate:
   - Card account closed
   - Card expired since original purchase
   - Issuer does not support refund authorization
3. Resolution options:
   - Issue a check refund to the customer
   - Try refund to a different card
   - Use the **Resolve** flow to mark as handled by other means

## PCI Compliance Checklist

Oppsera is designed for PCI SAQ-A compliance (card data never enters your environment):

- [ ] Card numbers are tokenized by CardPointe Hosted iFrame Tokenizer (client-side)
- [ ] Tokens are used for all server-side API calls — raw PANs are never stored
- [ ] Credentials are encrypted at rest (AES-256-GCM)
- [ ] API communication uses HTTPS/TLS 1.2+
- [ ] Webhook payloads are redacted before logging (account, CVV, token masked)
- [ ] Admin UI never displays full card numbers
- [ ] `PAYMENT_ENCRYPTION_KEY` is stored as environment variable, never in code
- [ ] Access to payment settings requires `payments.settings.manage` permission
- [ ] Transaction search requires `payments.transactions.view` permission

## Hosted iFrame Not Loading

### CORS Issues

The CardPointe iFrame Tokenizer loads from a different domain. Ensure your CSP headers allow it:

```
frame-src https://*.cardconnect.com;
script-src https://*.cardconnect.com;
```

### iframe Policy

Check that your `X-Frame-Options` header allows embedding. The tokenizer page itself must be renderable in an iframe.

### Mixed Content

Ensure your site is served over HTTPS. Browsers block mixed content (HTTPS page loading HTTP iframe).

### Network/Firewall

If in a corporate network, ensure outbound HTTPS access to `*.cardconnect.com` is allowed.

## Common Error Messages

| Error | Cause | Fix |
|---|---|---|
| `PROVIDER_NOT_CONFIGURED` | No provider credentials for this tenant | Set up credentials in Settings > Merchant Services |
| `NO_MERCHANT_ACCOUNT` | No MID found for the terminal/location | Create a merchant account or assign a terminal |
| `CREDENTIAL_DECRYPTION_FAILED` | `PAYMENT_ENCRYPTION_KEY` changed | Re-save credentials with the current key |
| `DUPLICATE_REQUEST` | Same `clientRequestId` used twice | Generate a unique ID for each request |
| `INVALID_STATE` | Invalid status transition | Check the payment intent state machine |
