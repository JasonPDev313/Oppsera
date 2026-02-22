# Stored Value UX Spec (Deferred — Post-Membership)

## Why deferred

The customer wallet model (`customer_wallet_accounts` with accountType: credit | loyalty | gift_card)
exists but Membership will extend the wallet with billing accounts, statement charges, and
balance topups. Building stored-value POS UX now would require refactoring after Membership.

## Planned screens (build after Membership wallet model is final)

### POS: Issue Gift Card

- Scan/enter card number -> set value -> select payment method -> issue
- GL: Dr Cash/Card, Cr Gift Card Liability

### POS: Redeem Gift Card

- Scan/enter card number -> check balance -> apply to tender
- GL: Dr Gift Card Liability, Cr Revenue

### POS: Check Balance

- Scan/enter -> display balance + transaction history

### POS: Store Credit

- Issue: manager PIN required -> set amount -> link to customer
- Redeem: same as gift card but sourced from store credit wallet

### Admin: Stored Value Management

- View all active gift cards / store credits
- Void/adjust (manager PIN + audit)
- Fraud controls: velocity limits, duplicate detection

## Data model extensions needed

- `stored_value_cards` table (card number, type, balance, status, customer link)
- `stored_value_transactions` table (issue, redeem, void, adjustment, expiry)
- Integration with `customer_wallet_accounts` (wallet is the balance, card is the physical/virtual token)

## GL Account Mapping

| Operation | Debit | Credit |
|-----------|-------|--------|
| Issue gift card (cash) | Cash | Gift Card Liability |
| Issue gift card (card) | Undeposited Funds | Gift Card Liability |
| Redeem gift card | Gift Card Liability | Revenue (sub-dept) |
| Issue store credit | Comp Expense / Returns | Store Credit Liability |
| Redeem store credit | Store Credit Liability | Revenue (sub-dept) |
| Gift card expiry (breakage) | Gift Card Liability | Breakage Income |

## Tender Type Integration

- New tender types: `gift_card`, `store_credit`
- Both reduce order balance like any other tender
- Both follow the same `recordTender` flow with additional balance check
- Partial redemption supported (use remainder as store credit balance)
