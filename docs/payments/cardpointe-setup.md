# CardPointe Setup Guide

## Prerequisites

- An active CardPointe merchant account from CardConnect
- API credentials (site, username, password) for UAT and production
- A Hosted iFrame Tokenizer URL (for online/QR payments)

## Step 1: Obtain CardPointe Credentials

Contact your CardConnect sales rep or log into the CardPointe portal:

1. **UAT credentials**: Use site `fts-uat` for testing. Request a UAT MID from CardConnect.
2. **Production credentials**: Provided after underwriting approval.

You will need:
- **Site**: e.g., `fts-uat` (UAT) or `fts` (production)
- **Username**: API username
- **Password**: API password
- **Merchant ID (MID)**: Your processing merchant account ID

## Step 2: Set Encryption Key

Before configuring credentials, ensure the encryption key environment variable is set:

```bash
# Generate a 32-byte hex key
openssl rand -hex 32

# Add to .env.local (or Vercel environment variables)
PAYMENT_ENCRYPTION_KEY=<your-64-character-hex-string>
```

This key encrypts all stored API credentials at rest using AES-256-GCM.

## Step 3: Configure in Oppsera Admin

1. Navigate to **Settings > Merchant Processing**
2. Click **Add Provider**
3. Select **CardPointe** from the provider dropdown
4. Enter your site, username, and password
5. Click **Test Connection** — the system will call CardPointe's inquire endpoint to validate
6. If successful, click **Save**

## Step 4: Create Merchant Account (MID)

1. On the Merchant Processing page, click **Add Merchant Account**
2. Enter:
   - **Label**: e.g., "Main Processing" or "Restaurant MID"
   - **Merchant ID**: Your CardPointe MID
   - **Location** (optional): Assign to a specific venue/location
   - **Set as Default**: Check if this is the primary MID
3. Click **Save**

## Step 5: Assign MID to Terminals (Optional)

If you have multiple MIDs (e.g., separate MIDs for bar vs restaurant):

1. Go to **Settings > Merchant Processing > Terminal Assignments**
2. Select a terminal
3. Choose which MID to use for that terminal
4. Click **Save**

If no terminal assignment exists, the system falls back to the location default, then the tenant default.

## Step 6: Configure Hosted iFrame Tokenizer (Online Payments)

For QR pay-at-table and online payments:

1. Get your iFrame Tokenizer URL from CardConnect (e.g., `https://fts-uat.cardconnect.com/itoke/ajax-tokenizer.html`)
2. Configure your CSP headers to allow the iFrame domain
3. The tokenizer runs in an iframe on the guest-facing payment page
4. Card data is tokenized client-side — it never touches your server (PCI SAQ-A eligible)

## Step 7: Configure Webhook Endpoint

1. Contact CardConnect to register your webhook URL:
   ```
   https://your-domain.com/api/v1/payments/webhooks/cardpointe
   ```
2. CardConnect will provide IP ranges for allowlisting (optional but recommended)
3. The webhook handler:
   - Verifies source IP against CardConnect ranges
   - Logs the raw payload
   - Updates payment intent status (e.g., settlement confirmations)

## Step 8: Test with UAT Credentials

Before going live:

1. Ensure you're using UAT credentials (`fts-uat` site)
2. Run through each payment scenario:
   - **Sale**: Process a $1.00 charge → verify in CardPointe portal
   - **Auth + Capture**: Authorize $5.00, then capture $4.50 (partial capture)
   - **Void**: Void a same-day transaction before settlement
   - **Refund**: Refund a settled transaction
   - **Decline**: Use test card `4000000000000002` to trigger a decline
   - **Stored card**: Save a card, then charge using the profile token
3. Check the Transactions page in Oppsera — verify all statuses are correct
4. Run a settlement reconciliation check

## Step 9: Switch to Production

1. Go to **Settings > Merchant Processing**
2. Edit the provider credentials
3. Change site from `fts-uat` to your production site (e.g., `fts`)
4. Update username and password to production credentials
5. Update the Merchant ID to your production MID
6. Test with a small live transaction ($0.01 or $1.00)
7. Void the test transaction

## CardPointe Test Card Numbers

| Card | Number | Result |
|---|---|---|
| Visa (approve) | `4111111111111111` | Approved |
| Visa (decline) | `4000000000000002` | Declined |
| Mastercard | `5500000000000004` | Approved |
| Amex | `340000000000000` | Approved |
| Discover | `6011000000000000` | Approved |

Use expiry `1225` and CVV `123` for all test cards.
