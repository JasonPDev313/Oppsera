# OppsEra — Customer 360 + Club Membership & Billing Suite

**The Master Session Prompt.** Feed the relevant session to Claude at the start of each build session. §0–§11 and §A–§L are shared context for ALL sessions.

---

## 0. Session Contract

You are building the **Customer Profile (Customer 360)** and **Club Membership & Billing Suite** for OppsEra — a multi-tenant SaaS platform for country clubs, golf courses, and hospitality businesses.

### System Philosophy
- **Customer is the core identity.** Every person in the system is a customer first.
- **Membership is an optional overlay (submodule).** A customer can exist without membership. Membership enriches a customer with dues, plans, initiation financing, minimums, and club-specific billing.
- **Financial relationships attach to Customer Financial Accounts (AR subledger).** The unified ledger lives at the customer level. Membership charges flow INTO the customer ledger.
- POS, reservations, loyalty, billing, stored value, discounts, privileges, communications, and documents all reference Customer — NOT membership.

The system must support: retail customers, restaurant guests, golf players, house account customers, members, families/households, organizations, corporate accounts, and hospitality guests (future-proof).

### Design North Star
**Salesforce Customer 360 + Toast customer profile + Stripe billing console + banking-grade financing.** That combination does not currently exist in one platform. We build it.

### UX Architecture Pattern — Every workspace follows:
```
Workspace
  → Summary Cards (balance, credit utilization, status, risk)
  → Quick Actions Bar (contextual, role-aware)
  → Tabs (domain-organized, lazy-loaded)
  → Timeline / Ledger (append-only financial history)
  → Related Panels (cross-module context)
```

### Performance Requirements (Non-Negotiable)
- Perceived profile load < 1.5 seconds
- Header + overview skeleton loads instantly
- Tabs lazy load via `next/dynamic` with `ssr: false`
- Query segmentation: identity header query → overview summary query → tab-specific queries on demand
- Cache: `customer_header` + `customer_overview`, invalidate on relevant mutations

---

## 1. Tech Stack (Non-Negotiable)

| Layer | Choice | Key Gotchas |
|-------|--------|-------------|
| Monorepo | pnpm workspaces + Turborepo | `workspace:*` protocol |
| Framework | Next.js 15 App Router | `'use client'` on all interactive components |
| ORM | Drizzle (NOT Prisma) | `postgres.js` driver; `db.execute()` returns RowList — use `Array.from(result as Iterable<T>)` |
| DB | Postgres via Supabase | RLS on every tenant-scoped table; `prepare: false` mandatory (Supavisor) |
| Validation | Zod | `safeParse()` always; throw `ValidationError` with field-level details |
| IDs | ULID | `$defaultFn(generateUlid)` on every `id` column |
| Money | INTEGER cents in ledger/billing; `NUMERIC(12,2)` dollars in GL | Use `toCents()`, `toDollars()`, `formatMoney()` from `@oppsera/shared` |
| Events | Transactional outbox | `publishWithOutbox(ctx, fn)` — callback returns `{ result, events }` |
| Tests | Vitest | `vi.hoisted()` mocks; see §B for patterns |
| Styling | Tailwind v4 (dark-mode-first, inverted gray scale) | Use opacity-based colors; never `bg-gray-900 text-white` |

---

## 2. Module Structure

### Customer Module (existing, being extended)
```
packages/modules/customers/
├── src/
│   ├── schema.ts                    # customers (existing)
│   ├── schema-contacts.ts           # customer_emails, customer_phones, customer_addresses (NEW)
│   ├── schema-financial.ts          # customer_financial_accounts, customer_ledger_entries (EXTEND)
│   ├── schema-relationships.ts      # customer_relationships, customer_emergency_contacts
│   ├── schema-preferences.ts        # customer_preferences, customer_flags
│   ├── schema-communication.ts      # customer_messages
│   ├── schema-files.ts              # customer_files
│   ├── schema-stored-value.ts       # stored_value_instruments, stored_value_transactions
│   ├── schema-discounts.ts          # discount_rules, discount_rule_usage
│   ├── commands/
│   │   ├── create-customer.ts
│   │   ├── update-customer.ts
│   │   ├── manage-contacts.ts       # add/update/remove emails, phones, addresses
│   │   ├── manage-financial-account.ts
│   │   ├── record-ledger-entry.ts
│   │   ├── manage-payment-methods.ts
│   │   ├── manage-relationships.ts
│   │   ├── manage-preferences.ts
│   │   ├── manage-flags.ts
│   │   ├── issue-stored-value.ts
│   │   ├── redeem-stored-value.ts
│   │   ├── manage-discount-rules.ts
│   │   └── ...
│   ├── queries/
│   │   ├── get-customer-header.ts   # Fast: identity + status + balance summary
│   │   ├── get-customer-overview.ts # Snapshot cards data
│   │   ├── get-customer-ledger.ts   # Unified ledger (paginated, filtered)
│   │   ├── get-customer-360.ts      # Full profile aggregation
│   │   ├── list-customers.ts
│   │   ├── search-customers.ts      # Fast search by name/email/phone/member#
│   │   └── ...
│   ├── consumers/
│   ├── services/
│   │   ├── discount-engine.ts       # Rule evaluation + priority resolution
│   │   └── stored-value-engine.ts
│   ├── events/
│   ├── internal-api.ts              # getCustomersReadApi()
│   ├── validation.ts
│   ├── __tests__/
│   └── index.ts
```

### Membership Module (new, overlays customer)
```
packages/modules/membership/
├── src/
│   ├── schema.ts                    # membership_accounts, membership_members, membership_accounting_settings
│   ├── schema-plans.ts              # membership_plans, membership_subscriptions, membership_billing_items
│   ├── schema-minimums.ts           # minimum_policies, buckets, eligibility, rollups
│   ├── schema-initiation.ts         # initiation_contracts, amort_schedule
│   ├── schema-autopay.ts            # autopay_profiles, runs, attempts
│   ├── commands/
│   │   ├── create-membership-account.ts
│   │   ├── add-member.ts
│   │   ├── assign-plan.ts
│   │   ├── create-initiation-contract.ts
│   │   ├── configure-autopay.ts
│   │   ├── compute-minimums.ts
│   │   ├── generate-statement.ts
│   │   ├── close-billing-cycle.ts
│   │   ├── bill-initiation-installment.ts
│   │   ├── apply-late-fee.ts
│   │   ├── run-autopay-batch.ts
│   │   ├── freeze-membership.ts
│   │   ├── set-charging-hold.ts
│   │   ├── adjust-credit.ts
│   │   └── ...
│   ├── queries/
│   │   ├── list-membership-accounts.ts
│   │   ├── get-membership-account.ts
│   │   ├── get-member-ledger.ts     # Filtered view of customer_ledger_entries for membership charges
│   │   ├── get-statement.ts
│   │   ├── get-aging-report.ts
│   │   ├── get-minimum-progress.ts
│   │   ├── get-initiation-schedule.ts
│   │   └── ...
│   ├── consumers/
│   │   ├── handle-house-charge-posted.ts
│   │   └── handle-tender-recorded.ts
│   ├── services/
│   │   ├── amortization.ts
│   │   ├── proration.ts
│   │   ├── minimum-engine.ts
│   │   ├── statement-builder.ts
│   │   └── autopay-retry.ts
│   ├── events/
│   ├── internal-api.ts              # getMembershipReadApi()
│   ├── validation.ts
│   ├── __tests__/
│   └── index.ts
```

### Frontend Structure
```
apps/web/src/
├── app/(dashboard)/customers/
│   ├── page.tsx                     # Customer list
│   └── [id]/
│       └── page.tsx                 # Customer 360 Profile
├── app/(dashboard)/membership/
│   ├── page.tsx                     # Member accounts list (links to customer/[id] with membership context)
│   ├── plans/page.tsx
│   ├── billing/page.tsx             # Billing Command Center
│   ├── risk/page.tsx
│   └── reports/page.tsx
├── app/(dashboard)/member-portal/
│   └── page.tsx
├── components/
│   ├── customer/
│   │   ├── profile/                 # Header, overview cards, quick actions
│   │   ├── contact/                 # Multi-email, multi-phone, multi-address managers
│   │   ├── financial/               # Ledger, accounts, payment methods, statements
│   │   ├── activity/                # Purchase history, playing history, visit log
│   │   ├── communication/           # Timeline feed, compose
│   │   ├── relationships/           # Family tree, corporate links
│   │   ├── privileges/              # Golf, charging, facility access, flags
│   │   ├── preferences/             # Directory, comms, operational toggles
│   │   ├── documents/               # File manager
│   │   ├── stored-value/            # Gift cards, credit books, etc.
│   │   └── discounts/               # Rules display, customer overrides
│   ├── membership/
│   │   ├── workspace/               # Membership-specific summary + tabs
│   │   ├── billing/                 # Billing wizard + statements
│   │   ├── minimums/                # Progress bars, compliance
│   │   ├── financing/               # Amort schedule, payoff calc
│   │   ├── risk/                    # Aging, holds, delinquency
│   │   ├── pos-integration/         # Charge-to-member POS flow
│   │   ├── portal/                  # Member portal components
│   │   └── shared/
│   └── shared/                      # Reusable grids, cards, badges
├── hooks/
│   ├── use-customer.ts
│   ├── use-customer-ledger.ts
│   ├── use-customer-contacts.ts
│   ├── use-customer-financial.ts
│   ├── use-customer-relationships.ts
│   ├── use-stored-value.ts
│   ├── use-discount-rules.ts
│   ├── use-membership-accounts.ts
│   ├── use-membership-account.ts
│   ├── use-member-ledger.ts
│   ├── use-membership-plans.ts
│   ├── use-membership-billing.ts
│   ├── use-minimum-progress.ts
│   ├── use-initiation-contract.ts
│   ├── use-membership-risk.ts
│   ├── use-autopay.ts
│   └── use-membership-reports.ts
├── stores/
│   └── membership-billing-store.ts
└── types/
    ├── customer.ts
    └── membership.ts
```

---

## 3. Customer Data Model (Phase 1 — Sessions 1–4)

### 3.1 Table Conventions (Every Table)

```typescript
id: text('id').primaryKey().$defaultFn(generateUlid),
tenantId: text('tenant_id').notNull().references(() => tenants.id),
createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
// + locationId where location-specific
// + createdBy where user-initiated
```

Postgres columns: `snake_case`. TypeScript: `camelCase`. Index on `tenantId` always.

### 3.2 Core Customer Tables

**`customers`** (existing — extend if needed)
- `type` (individual|organization), `status` (active|suspended|prospect|inactive)
- `firstName`, `lastName`, `displayName`, `nickname`
- `dob`, `gender`, `photoAssetId`
- `memberNumber` (nullable, unique per tenant where not null)
- `tags` (JSONB), `source` (pos|booking|import|online|referral|walk_in)
- `referredByCustomerId`, `referredByOrgId`
- `notesSummary`
- Indexes: `(tenantId, memberNumber)` unique where not null; `(tenantId, lastName, firstName)`; `(tenantId, status)`

**`customer_emails`**
- `customerId` (FK), `email`, `emailNormalized`
- `type` (personal|billing|spouse|corporate|other)
- `isPrimary`, `isVerified`, `canReceiveStatements`, `canReceiveMarketing`
- Index: `(tenantId, emailNormalized)`, `(tenantId, customerId)`

**`customer_phones`**
- `customerId` (FK), `phoneE164`
- `type` (mobile|home|work|sms|other)
- `isPrimary`, `isVerified`, `canReceiveSms`
- Index: `(tenantId, phoneE164)`, `(tenantId, customerId)`

**`customer_addresses`**
- `customerId` (FK), `type` (mailing|billing|home|work|seasonal|other)
- `line1`, `line2`, `line3`, `city`, `state`, `postalCode`, `county`, `country`
- `isPrimary`
- Index: `(tenantId, customerId, type)`

**`customer_emergency_contacts`**
- `customerId` (FK), `name`, `relationship`, `phoneE164`, `notes`

**`customer_relationships`**
- `customerId`, `relatedCustomerId`
- `relationshipType` (spouse|child|dependent|buddy|corporate_designee|employer|guardian)
- `isPrimary`, `effectiveDate`, `expirationDate`, `notes`
- Index: `(tenantId, customerId)`, `(tenantId, relatedCustomerId)`

**`customer_preferences`**
- `customerId` (FK, one-to-one)
- Directory: `directoryShowFirstName`, `directoryShowLastName`, `directoryShowEmail`, `directoryShowPhone`, `directoryHidden`
- Operational: `disableOnlineTeeBooking`, `disableOnlineReservations`, `serviceChargeExempt`, `noGuestsAllowed`
- Communication: `preferredContactMethod`, `marketingOptIn`, `commsJson` (JSONB)

**`customer_flags`**
- `customerId` (FK), `flagType` (billing|medical|profile|operational)
- `title`, `description`, `isActive`, `createdBy`
- Index: `(tenantId, customerId, isActive)`, `(tenantId, flagType)`

**`customer_messages`**
- `customerId` (FK), `channel` (internal_note|chat|email|sms|statement|autopay_event)
- `direction` (inbound|outbound|system), `subject`, `body`
- `metaJson` (JSONB), `sentAt`, `createdBy`
- Index: `(tenantId, customerId, createdAt DESC)`

**`customer_files`**
- `customerId` (FK), `storageKey`, `fileName`, `mimeType`, `sizeBytes`
- `uploadedBy`, `uploadedAt`, `tagsJson` (JSONB), `expiresAt`, `version`
- Index: `(tenantId, customerId, uploadedAt DESC)`

### 3.3 Customer Financial Tables

**`customer_financial_accounts`** — AR subledger. Customers can have multiple.
- `customerId` (FK), `accountType` (ar|house|dues|initiation|minimums|deposit|stored_value|locker|event|merchandise_credit|other)
- `name` (display), `status` (open|closed|hold)
- `creditLimitCents`, `currency`
- `autopayEnabled`, `autopayStrategy` (full_balance|minimum_due|fixed_amount|selected_accounts)
- `autopayFixedAmountCents`, `autopayPaymentMethodId`
- `billingContactEmailId`, `billingAddressId`
- Index: `(tenantId, customerId)`, `(tenantId, customerId, accountType)`

**`customer_ledger_entries`** — **THE UNIFIED LEDGER. Append-only.**
- `customerId` (FK), `financialAccountId` (FK)
- `entryType` (charge|payment|credit|adjustment|transfer|interest|late_fee|minimum_shortfall|deposit|stored_value_issue|stored_value_redeem|refund|void|dues_charge|initiation_charge|initiation_interest|house_charge|writeoff)
- `sourceModule` (pos|membership|accounting|stored_value|reservations|manual|fnb|golf|retail|payments)
- `sourceId`, `occurredAt`, `postedAt`, `businessDate`
- `amountCents` (signed: positive = charge, negative = credit)
- `currency`, `description`, `status` (pending|posted|void|refunded)
- `departmentId`, `subDepartmentId`, `locationId`, `profitCenterId`, `categoryId`
- `memberId` (nullable — which family member incurred this)
- `glJournalEntryId`, `metaJson` (JSONB), `createdBy`, `approvedBy`
- Index: `(tenantId, customerId, occurredAt DESC)`, `(tenantId, financialAccountId, occurredAt DESC)`, `(tenantId, sourceModule, sourceId)`

**CRITICAL: Never UPDATE or DELETE from `customer_ledger_entries`. Corrections are new entries.**

**`payment_methods`** — Lives at customer level (not membership level).
- `customerId` (FK), `type` (card|ach)
- `tokenProvider`, `tokenRef`, `last4`, `expMonth`, `expYear`, `cardholderName`
- `billingAddressId`, `isDefault`, `status` (active|expired|removed)
- Index: `(tenantId, customerId)`

**`customer_audit_log`**
- `customerId` (FK), `actorUserId`, `actionType`, `beforeJson`, `afterJson`, `occurredAt`
- Index: `(tenantId, customerId, occurredAt DESC)`

### 3.4 Stored Value Tables

**`stored_value_instruments`**
- `customerId` (FK), `instrumentType` (gift_card|credit_book|raincheck|range_card|rounds_card|prepaid_balance|punchcard|award)
- `code` (unique per tenant), `status` (open|closed|expired|void)
- `issuedAt`, `expiresAt`, `initialValueCents`, `currentBalanceCents`
- `unitCount` (for count-based), `liabilityGlAccountId`, `metaJson`
- Index: `(tenantId, code)` unique, `(tenantId, customerId)`

**`stored_value_transactions`**
- `instrumentId` (FK), `customerId` (FK)
- `txnType` (issue|redeem|reload|transfer|void|refund)
- `occurredAt`, `amountCents` (signed), `unitDelta` (signed, nullable)
- `sourceModule`, `sourceId`, `ledgerEntryId`, `metaJson`
- Index: `(tenantId, instrumentId, occurredAt DESC)`

### 3.5 Discount / Entitlement Tables

**`discount_rules`**
- `scopeType` (global|membership_class|customer), `customerId` (nullable), `membershipClassId` (nullable)
- `priority` (int), `name`, `isActive`, `effectiveDate`, `expirationDate`
- `ruleJson` (JSONB — conditions: dept/subdept/category/item, time windows, quantity, thresholds, usage limits, member-only; actions: percent_off, fixed_amount_off, cap_amount)
- Index: `(tenantId, scopeType, isActive)`, `(tenantId, customerId)`

**Discount Hierarchy**: 1) Item override → 2) Membership class → 3) Customer-specific → 4) Promotion → 5) Manual POS → 6) Default pricing. **Discounts ≠ Comps.**

**`discount_rule_usage`** — For usage limits.
- `ruleId`, `customerId`, `periodKey`, `usesCount`, `amountDiscountedCents`

---

## 4. Membership Data Model (Phase 2 — Sessions 5–12)

> Membership tables REFERENCE `customers`, `customer_financial_accounts`, `customer_ledger_entries`, and `payment_methods`. They do NOT duplicate them.

**`membership_accounts`** — Billing account for family/household.
- `accountNumber` (unique per tenant), `status` (active|suspended|frozen|terminated)
- `startDate`, `endDate`, `primaryMemberId` (FK → customers)
- `billingEmail`, `billingAddressJson` (JSONB)
- `statementDayOfMonth`, `paymentTermsDays`
- `autopayEnabled`, `autopayProfileId`, `creditLimitCents`, `holdCharging`
- `billingAccountId` (FK → customer_financial_accounts)
- `customerId` (FK → customers — billing-responsible)

**`membership_members`** — Members on an account.
- `membershipAccountId` (FK), `customerId` (FK → customers)
- `role` (primary|spouse|dependent|corporate_designee), `chargePrivileges`, `memberNumber`, `status`

**`membership_plans`** — Plan definitions.
- `name`, `duesAmountCents`, `billingFrequency` (monthly|quarterly|annual)
- `prorationPolicy` (daily|half_month|none), `minMonthsCommitment`, `glDuesRevenueAccountId`, `taxable`

**`membership_subscriptions`** — Active plan assignment.
- `membershipAccountId`, `planId`, `status`, `effectiveStart`, `effectiveEnd`, `nextBillDate`

**`membership_classes`** — Class-based tiers.
- `membershipAccountId`, `className`, `effectiveDate`, `expirationDate`, `billedThroughDate`, `isArchived`

**`membership_billing_items`** — Repeat billing items.
- `membershipAccountId`, `classId`, `description`, `amountCents`, `discountCents`, `frequency`
- `taxRateId`, `deferredRevenueEnabled`, `glRevenueAccountId`, `glDeferredAccountId`
- `prorationEnabled`, `seasonalJson`, `isSubMemberItem`, `notes`

**`membership_authorized_users`** — Non-member proxies.
- `membershipAccountId`, `name`, `relationship`, `privilegesJson`, `effectiveDate`, `expirationDate`

**`initiation_contracts`** — One per account.
- `membershipAccountId`, `contractDate`, `initiationFeeCents`
- `downPaymentCents`, `financedPrincipalCents`, `aprBps`, `termMonths`
- `paymentDayOfMonth`, `status` (active|paid_off|defaulted|cancelled)
- `recognitionPolicySnapshot` (JSONB — freeze at creation)
- GL account FKs

**`initiation_amort_schedule`** — Amortization lines.
- `initiationContractId`, `periodIndex`, `dueDate`
- `paymentCents`, `principalCents`, `interestCents`
- `status` (scheduled|billed|paid|late|waived), `arInvoiceLineId`

**`minimum_policies`** / **`minimum_buckets`** / **`minimum_eligibility_rules`** / **`minimum_period_rollups`**
(Full definitions in §6)

**`statements`** / **`statement_lines`** — Monthly consolidated invoices with immutable line snapshots.

**`autopay_profiles`** / **`autopay_runs`** / **`autopay_attempts`** — Payment execution infrastructure.

**`membership_accounting_settings`** — Tenant-level: club model, recognition policy, GL defaults, autopay config.

---

## 5. Accounting Policy Engine

All accounting driven by `membership_accounting_settings`, NOT code forks.

### For-Profit Club:
```
Contract creation:  Dr Notes Receivable  /  Cr Deferred Revenue OR Initiation Revenue
Each period:        Dr AR / Cr Interest Income (interest);  reduce Notes Receivable (principal)
If deferred:        Dr Deferred Revenue / Cr Initiation Revenue (straight-line over N months)
```

### Member-Owned Club:
```
Contract creation:  Dr Notes Receivable  /  Cr Capital Contribution (equity) OR Deferred Revenue
Interest income still posts to Interest Income
```

**CRITICAL**: Snapshot recognition policy on `initiation_contracts.recognitionPolicySnapshot` at creation. Existing contracts use frozen policy even if tenant changes settings later.

---

## 6. Minimums Engine

**Posted Revenue** = posted lines from `customer_ledger_entries` AFTER discounts, EXCLUDING voids/returns. Configurable exclusions: tax, tips, service charges, dues/fees.

**Allocation Methods**: First Match Wins (default), Proportional, Priority Order.

**Shortfall**: `requiredCents - satisfiedCents` → write `customer_ledger_entries` with `entryType: 'minimum_shortfall'`.

**Rollover**: none (default), monthly_to_monthly, within_quarter.

---

## 7. Member Ledger Flow (Unified Architecture)

All membership charges flow through `customer_ledger_entries`:

| Source | Entry Type | How It Gets There |
|--------|-----------|-------------------|
| POS house charge | `house_charge` | Consumer: `house.charge.posted.v1` |
| Monthly dues | `dues_charge` | Command: `close-billing-cycle` |
| Initiation installment | `initiation_charge` + `initiation_interest` | Command: `bill-initiation-installment` |
| Minimum shortfall | `minimum_shortfall` | Command: `compute-minimums` |
| Late fee | `late_fee` | Command: `apply-late-fee` |
| Manual credit | `credit` | Command: `adjust-credit` (manager PIN) |
| Payment mirror | `payment` | Consumer or autopay |
| Write-off | `writeoff` | Command (manager PIN + audit) |
| Stored value issue | `stored_value_issue` | Command: `issue-stored-value` |
| Stored value redeem | `stored_value_redeem` | Consumer: POS redemption |

**AR invoices GENERATED from ledger at statement close.** Ledger = source of truth; AR = formal view.

---

## 8. Event Contracts

```
# Customer events
customer.created.v1, customer.updated.v1, customer.status_changed.v1
customer.financial_account.updated.v1, customer.ledger_entry.posted.v1
customer.message.sent.v1, payment_method.updated.v1
stored_value.issued.v1, stored_value.redeemed.v1, discount_rule.updated.v1

# POS events (consumed)
house.charge.posted.v1, tender.recorded.v1

# Membership events (emitted)
membership.account.created.v1, membership.member.added.v1
membership.dues.billed.v1, membership.plan.changed.v1
membership.initiation.installment.billed.v1, membership.initiation.contract.created.v1
membership.minimums.computed.v1, membership.statement.issued.v1
membership.autopay.attempted.v1, membership.autopay.failed.v1
membership.account.hold_changed.v1
```

Self-contained payloads, idempotency keys, all dimensions. Consumers NEVER query another module's tables.

---

## 9. Security & Permissions

### Customer Permissions
```
customer.view               — view profiles, contacts, activity
customer.manage             — create/edit customers, contacts, preferences
customer.financial.view     — view ledger, balances, payment methods
customer.financial.manage   — adjustments, transfers, issue stored value
customer.financial.admin    — write-offs, credit limit changes (manager PIN)
customer.communication      — send messages, add notes
customer.reports            — analytics, exports
```

### Membership Permissions (Entitlement: `club_membership`)
```
club_membership.view          — view accounts, statements, ledger
club_membership.manage        — create accounts, assign plans, configure
club_membership.billing       — close cycles, generate statements, run autopay
club_membership.adjustments   — credits, write-offs, hold overrides (manager PIN)
club_membership.reports       — aging, minimums, initiation portfolio
club_membership.portal        — member self-service
```

Role defaults: owner=all, manager=all except portal, accounting=view+billing+reports, front_desk=view+manage, member=portal only.

Manager PIN required for: credits/adjustments, write-offs, credit limit changes, lifting holds, editing initiation terms, stored value transfers/voids.

All financial actions → `auditLog(ctx, ...)` AFTER transaction succeeds.

---

## 10. Discount & Entitlement Engine

Hierarchy: 1) Item override → 2) Membership class → 3) Customer-specific → 4) Promotion → 5) Manual POS → 6) Default. **Discounts ≠ Comps.**

Rule capabilities: dept/subdept/category/item scope, time windows, quantity rules, spend thresholds, usage limits, member-only toggle, conflict resolution (priority or best-for-customer), simulator.

---

## 11. Privileges & Access

**Golf**: tee time, advance window, guest allowance, course access, day/time restrictions.
**Charging**: charge account, credit limit, manager override, past-due holds.
**Facility**: pool, fitness, tennis, dining, guest access.
**Flags**: billing, medical, profile, operational → header badges + overview alerts + inline markers.

---

# SESSION PLAN

Each session: schema → commands → queries → API routes → hooks → components → pages. Every session ships something demo-able.

---

## Session 1: Customer Core Identity + 360 Profile Shell

**Establishes the customer as the center of the system.**

### Backend
- **Schema**: `customers` (extend), `customer_emails`, `customer_phones`, `customer_addresses`, `customer_emergency_contacts`, `customer_preferences`, `customer_flags`
- **Migration**: `NNNN_customer_identity.sql` + RLS
- **Commands**: `createCustomer`, `updateCustomer`, `addEmail`, `updateEmail`, `removeEmail`, `addPhone`, `updatePhone`, `removePhone`, `addAddress`, `updateAddress`, `removeAddress`, `updatePreferences`, `addFlag`, `updateFlag`, `deactivateFlag`
- **Queries**: `getCustomerHeader` (fast: name, status, photo, member#, primary email/phone, balance summary), `getCustomerOverview` (snapshot cards), `listCustomers` (cursor-paginated, filterable), `searchCustomers` (fuzzy: name/email/phone/member#)
- **API Routes** (~18): CRUD customer, CRUD contacts, preferences, flags, search
- **Events**: `customer.created.v1`, `customer.updated.v1`, `customer.status_changed.v1`

### Frontend

**Customer List** (`/customers`)
- DataTable: Name, Email, Phone, Status, Member #, Tags, Last Activity, Balance
- Filters: status, tags, source, has membership, has balance
- Fast search (debounced), quick-create modal

**Customer 360 Profile** (`/customers/[id]`)

*Header Bar (always visible, loads first):*
- Customer ID, Full Name, Photo/Avatar
- Primary Email, Primary Phone, Member Number (if present)
- Status Badge, Balance summary mini, Flag badges as colored pills

*Quick Actions Bar:*
- Charge, Add Note, Send Message, Add Payment Method, View Ledger
- Suspend/Reinstate, Add Membership (if none), Issue Stored Value

*Master Tab Layout:*

| Tab | Content | Session |
|-----|---------|---------|
| **Overview** | Snapshot cards + behavioral intelligence | 1 |
| **Contact & Identity** | Multi-email/phone/address + emergency + club-specific (locker/GHIN) | 1 |
| **Financial** | Accounts, Unified Ledger, Payment Methods, Statements, Adjustments | 2 |
| **Membership** | Full membership overlay (visible only if customer has membership) | 5 |
| **Activity** | Purchase history, playing history, visits, reservations, favorites | 3 |
| **Privileges & Access** | Golf, charging, facility, flags | 4 |
| **Relationships** | Family tree, corporate links, buddy list | 3 |
| **Communication** | Unified timeline, compose | 3 |
| **Preferences** | Directory, comms, operational toggles | 1 |
| **Documents** | Files, agreements, waivers | 3 |
| **Settings** | Status, holds, privileges, risk controls (admin) | 4 |

*Overview Dashboard:*
- Cards: Balance (breakdown), Membership Status, Credit Limit Usage, Last Visit, Lifetime Spend, Upcoming Reservations, Flags/Alerts, Autopay Status, GHIN Handicap
- Behavior Intelligence: top items, favorite departments, preferred times, avg ticket, frequency, churn risk (simple heuristic)

*Contact & Identity Tab:*
- Identity card (photo, name, DOB, gender, member#, source, referred by, tags)
- Multi-email manager (add/edit/remove, primary, statement/marketing toggles per email)
- Multi-phone manager (add/edit/remove, primary, SMS toggle)
- Multi-address manager (by type, primary per type)
- Emergency contact card
- Club-specific: locker #, bag rack #, GHIN #

*Preferences Tab:*
- Directory visibility toggles
- Communication preferences per channel
- Marketing opt-in/out
- Operational: disable online booking, service charge exempt, no guests

*Hooks*: `useCustomer(id)`, `useCustomerOverview(id)`, `useCustomers()`, `useSearchCustomers(query)`, `useCustomerContacts(id)`
*Components*: `CustomerHeader`, `CustomerQuickActions`, `CustomerOverviewCards`, `ContactIdentityPanel`, `MultiContactManager`, `AddressManager`, `FlagsPanel`, `PreferencesPanel`

---

## Session 2: Customer Financial Engine

**Activates the financial backbone. Unified ledger, accounts, payment methods.**

### Backend
- **Schema**: `customer_financial_accounts`, `customer_ledger_entries`, `payment_methods`, `customer_audit_log`
- **Migration**: `NNNN_customer_financial.sql` + RLS
- **Commands**: `createFinancialAccount`, `updateFinancialAccount`, `recordLedgerEntry`, `adjustLedger`, `transferBetweenAccounts`, `addPaymentMethod`, `updatePaymentMethod`, `removePaymentMethod`, `configureAutopay`
- **Queries**: `getFinancialAccountsSummary`, `getCustomerLedger` (paginated, filterable), `getPaymentMethods`, `getCustomerAgingSummary`
- **API Routes** (~14)
- **Events**: `customer.financial_account.updated.v1`, `customer.ledger_entry.posted.v1`, `payment_method.updated.v1`

### Frontend — Financial Tab (sub-tabs)

*Accounts Summary:* Card per account (type, balance, credit limit, status, autopay). Total balance. Quick actions.

*Unified Ledger:* Full timeline — Date, Description, Type, Source, Account, Amount, Status, GL Ref. Filters: date range, location, dept, type, account, status, reference search. Color-coded by type. Infinite scroll. Actions: Add adjustment, Transfer, Apply credit, Export, Print.

*Payment Methods:* Card per method (icon, last4, expiry, status, default). Add/update/remove. Expiration warnings.

*Statements & Invoices:* History list (ID, period, balance, due date, status, PDF link, delivery status). Placeholder until membership billing generates.

*Adjustments & Transfers:* Adjustment form (manager PIN if over threshold), Transfer form (from → to), history log.

*Hooks*: `useCustomerFinancial(id)`, `useCustomerLedger(id, filters)`, `usePaymentMethods(id)`
*Components*: `AccountSummaryPanel`, `LedgerGrid`, `PaymentMethodsPanel`, `AutopaySettingsPanel`, `AdjustmentForm`, `TransferForm`, `AuditLogDrawer`

---

## Session 3: Activity + Communication + Relationships + Documents

**CRM-grade history, messaging, family, files.**

### Backend
- **Schema**: `customer_relationships`, `customer_messages`, `customer_files`
- **Migration**: `NNNN_customer_activity.sql` + RLS
- **Commands**: `addRelationship`, `updateRelationship`, `removeRelationship`, `sendMessage`, `addNote`, `uploadFile`, `deleteFile`
- **Queries**: `getCustomerActivity`, `getPurchaseHistory`, `getPlayingHistory`, `getRelationships`, `getCommunicationTimeline`, `getCustomerFiles`
- **API Routes** (~12)
- **Events**: `customer.message.sent.v1`

### Frontend

*Activity Tab:* Purchase history grid (Order ID, Date, Total, Payment, Status, View Receipt), Playing history grid (Booking ID, Tee Date, Holes, Price, Check-in, Payment), Visit/check-in log, Reservations, Favorites/insights.

*Communication Tab:* Timeline feed (newest first), filter by type, compose (note/email/SMS), attach files, internal vs customer-visible separation.

*Relationships Tab:* List (linked name, type, dates, primary), family/org tree, quick add (search or create + link), billing roll-up indicator.

*Documents Tab:* File grid (name, type, size, uploader, date, expiry), upload (drag-and-drop), tags, provision: versions, expiration reminders.

*Hooks/Components*: `PurchaseHistoryGrid`, `PlayingHistoryGrid`, `ActivityTimeline`, `CommunicationFeed`, `ComposeMessage`, `RelationshipManager`, `RelationshipTree`, `DocumentsManager`

---

## Session 4: Stored Value + Discounts + Privileges + Settings

**Business logic engines.**

### Backend
- **Schema**: `stored_value_instruments`, `stored_value_transactions`, `discount_rules`, `discount_rule_usage`
- **Migration**: `NNNN_customer_business.sql` + RLS
- **Services**: `stored-value-engine.ts`, `discount-engine.ts`
- **Commands**: `issueStoredValue`, `redeemStoredValue`, `reloadStoredValue`, `transferStoredValue` (PIN), `voidStoredValue` (PIN), `createDiscountRule`, `updateDiscountRule`, `deactivateDiscountRule`
- **Queries**: `getStoredValueInstruments`, `getStoredValueTransactions`, `getApplicableDiscountRules`, `getCustomerPrivileges`, `simulateDiscount`
- **API Routes** (~14)
- **Events**: `stored_value.issued.v1`, `stored_value.redeemed.v1`, `discount_rule.updated.v1`

### Frontend

*Financial → Stored Value sub-tab:* Instrument list (type, code, status, balance/units, dates). Drill-down: transaction history. Actions: Issue, Reload, Transfer (PIN), Void (PIN).

*Privileges & Access Tab:* Golf privileges card, Charging privileges card, Facility access checklist, Flags management (list, add, deactivate), "Discount Rules Applied" summary (sources: membership class, customer-specific), Add customer-specific rule builder.

*Settings Tab:* Status management (change with reason), Financial holds (place/lift, history), Privilege toggles, Risk controls (spending limits, auto-disable).

*Discount Rules Admin* (`/settings/discount-rules`): Full rules engine, rule builder, simulator.

*Hooks/Components*: `StoredValuePanel`, `StoredValueDetail`, `PrivilegesPanel`, `FlagsManager`, `DiscountRulesPanel`, `DiscountRuleBuilder`, `DiscountSimulator`, `SettingsPanel`

---

## Session 5: Membership Core + Member List + Membership Tab

**The membership overlay. Links accounts to customers.**

### Backend
- **Schema**: `membership_accounts`, `membership_members`, `membership_classes`, `membership_billing_items`, `membership_authorized_users`, `membership_accounting_settings`
- **Migration**: `NNNN_membership_core.sql` + RLS
- **Commands**: `createMembershipAccount`, `updateMembershipAccount`, `addMember`, `removeMember`, `addMembershipClass`, `updateClass`, `archiveClass`, `addBillingItem`, `updateBillingItem`, `addAuthorizedUser`, `updateAuthorizedUser`
- **Consumer**: `handleHouseChargePosted` → writes `customer_ledger_entries`, checks credit limit
- **Queries**: `listMembershipAccounts` (THE member list), `getMembershipAccount`, `getMemberLedger` (filtered customer ledger for membership entry types)
- **API Routes** (~16)
- **Events**: `membership.account.created.v1`, `membership.member.added.v1`
- **Internal API**: `getMembershipReadApi()` — `getAccountByCustomerId()`, `checkChargePrivileges()`

### Frontend

**Member Accounts List** (`/membership`)
- DataTable: Account #, Primary Member (linked to Customer 360), Status, Plan, Balance Due, Autopay, Credit Utilization
- Filters: status, plan, balance, autopay, class. Search by account#/name/member#.
- **Click row → `/customers/[customerId]?tab=membership`** (Customer 360 with Membership tab focused)
- Quick-create: link existing customer or create new

**Customer 360 → Membership Tab** (visible only when customer has membership)

Sub-tabs:
| Sub-tab | Content |
|---------|---------|
| Overview | Membership ID, status, dates, primary member, billing party |
| Classes | Grid: name, dates, billed-through, archived. Add/edit/archive. |
| Billing Plans | Grid: description, amount, discount, frequency, tax, GL, proration. CRUD. |
| Members & Dependents | Members with roles, privileges, limits. Add/remove/edit. Links to their Customer 360. |
| Authorized Users | Non-member users: name, relationship, privileges, dates. CRUD. |
| Charges & Ledger | Membership-filtered unified ledger |
| Statements | (Session 6) |
| Initiation | (Session 8) |
| Minimums | (Session 7) |
| Autopay | (Session 9) |

**POS Charge-to-Member Flow:**
- `MemberSearchModal` — fast lookup, shows balance + credit remaining
- `MemberChargeConfirmation` — balance preview, credit limit warning, minimum eligibility indicator

*Hooks/Components*: `MembershipOverview`, `ClassesGrid`, `BillingPlanGrid`, `MemberDependentTable`, `AuthorizedUsersTable`, `MemberSearchModal`, `MemberChargeConfirmation`

---

## Session 6: Dues Engine + Statements

### Backend
- **Schema**: `membership_plans`, `membership_subscriptions`, `statements`, `statement_lines`
- **Services**: `proration.ts`, `statement-builder.ts`
- **Commands**: `createMembershipPlan`, `updateMembershipPlan`, `assignPlan`, `changePlan`, `closeBillingCycle`, `generateStatement`
- **Queries**: `listMembershipPlans`, `getStatement`, `listStatements`
- **API Routes** (~12), **Events**, **Background Job**: monthly billing cycle

### Frontend
- Plans management (`/membership/plans`)
- Membership Tab → Statements sub-tab (list, detail drill-through)
- **Premium Statement Layout**: header, financial summary, categorized charges, minimum progress (placeholder), initiation (placeholder), payment instructions, QR code
- Dues sub-tab: current plan, subscription timeline, plan change comparison

*Components*: `PlanCard`, `PlanComparisonModal`, `StatementList`, `StatementDetail`, `StatementPDF`

---

## Session 7: Minimums Engine + Progress UX

### Backend
- **Schema**: `minimum_policies`, `minimum_buckets`, `minimum_eligibility_rules`, `minimum_period_rollups`
- **Service**: `minimum-engine.ts`
- **Commands/Queries/API Routes** (~10)

### Frontend
- Membership Tab → Minimums sub-tab: progress ring, per-bucket bars (green/amber/red), eligible vs ineligible breakdown, predictive shortfall, trend line
- Minimums Compliance Dashboard (`/membership/reports`): tenant-wide compliance, traffic light table, CSV export

*Components*: `BucketProgressBar`, `MinimumsSummaryRing`, `ShortfallForecast`, `SpendBreakdown`, `ComplianceDashboard`

---

## Session 8: Initiation Financing + Accounting Visibility

### Backend
- **Schema**: `initiation_contracts`, `initiation_amort_schedule`
- **Service**: `amortization.ts`
- **GL Integration**: policy-driven journal entries per §5

### Frontend
- Membership Tab → Initiation sub-tab: contract summary (donut chart), amort table, payment timeline, payoff calculator (date picker + slider), contract actions (PIN)
- Accounting reports: deferred revenue schedule, notes receivable portfolio, GL reconciliation

*Components*: `ContractSummaryCard`, `AmortScheduleTable`, `PayoffCalculator`, `PayoffSlider`, `DeferredRevenueSchedule`, `NotesReceivableTable`, `ReconciliationView`

---

## Session 9: Autopay + Dunning + Risk Management

### Backend
- **Schema**: `autopay_profiles`, `autopay_runs`, `autopay_attempts`
- **Service**: `autopay-retry.ts`
- **Background Jobs**: autopay batch, late fees, dunning

### Frontend
- Membership Tab → Autopay sub-tab: payment method, attempt timeline
- Membership Tab → Risk sub-tab: credit limit, holds, collections
- Risk Dashboard (`/membership/risk`): summary cards, aging (stacked bar), at-risk table (traffic light), autopay failure queue, collections timeline

*Components*: `PaymentMethodCard`, `AttemptTimeline`, `AgingChart`, `RiskTable`, `FailureQueue`, `HoldManagementPanel`, `CollectionsTimeline`

---

## Session 10: Billing Command Center + Segmentation

### Backend
- **Commands**: `previewBillingCycle`, `executeBillingStep`

### Frontend
**Billing Command Center** (`/membership/billing`) — 7-step wizard:
1. Preview Dues (diff vs last month)
2. Preview Initiation (late contracts highlighted)
3. Compute Minimums ("12 members projected to miss")
4. Exception Review (include/exclude per account)
5. Generate Statements (GL impact sidebar)
6. Run Autopay (real-time progress)
7. Review & Close (export report)

Preview before commit. GL impact sidebar. Bulk actions. Full audit trail.

**Segmentation**: member/guest/non-member auto-tagging, filter dimension on all reports.

*Store*: `membership-billing-store.ts` (Zustand)
*Components*: `BillingWizardShell`, 7 step components, `GlImpactSidebar`

---

## Session 11: Reporting + Predictive Insights

### Backend
- Read models: aging, compliance, spend, portfolio, churn, segmentation
- Predictive Insights Service (heuristics)

### Frontend
- Reports (`/membership/reports`): 6 tabs with KPI cards + charts + tables + CSV export
- Predictive Insights Panel (collapsible, appears on dashboard/360/billing/risk): projected misses, delinquency risk, failure trends, credit limit alerts

*Components*: `InsightsPanel`, `InsightCard`, chart/table components per report

---

## Session 12: Member Portal + Final Polish

### Backend
- Member-facing API routes (scoped to own account)

### Frontend
- **Member Portal** (`/member-portal`): mobile-first, balance, statements, minimums, initiation, autopay, QR code payment
- **Final Polish**: end-to-end flow verification, PDF generation, cross-navigation (member list → Customer 360 → Membership tab), sidebar nav, permission gating, loading skeletons

---

# APPENDICES

## A. Command Pattern
```typescript
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import { checkIdempotency, saveIdempotencyKey } from '../helpers/idempotency';
import type { RequestContext } from '@oppsera/core/auth/context';

export async function createMembershipAccount(ctx: RequestContext, input: CreateMembershipAccountInput) {
  const account = await publishWithOutbox(ctx, async (tx) => {
    const idempotencyCheck = await checkIdempotency(tx, ctx.tenantId, input.clientRequestId, 'createMembershipAccount');
    if (idempotencyCheck.isDuplicate) return { result: idempotencyCheck.originalResult as any, events: [] };

    const [created] = await tx.insert(membershipAccounts).values({
      tenantId: ctx.tenantId, ...input,
    }).returning();

    const event = buildEventFromContext(ctx, 'membership.account.created.v1', { accountId: created!.id });
    await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'createMembershipAccount', created);
    return { result: created!, events: [event] };
  });

  await auditLog(ctx, 'membership.account.created', 'membership_account', account.id);
  return account;
}
```

## B. Consumer Pattern
```typescript
const CONSUMER_NAME = 'membership.handleHouseChargePosted';

export async function handleHouseChargePosted(event: EventEnvelope): Promise<void> {
  await withTenant(event.tenantId, async (tx) => {
    const inserted = await (tx as any).execute(sql`
      INSERT INTO processed_events (id, tenant_id, event_id, consumer_name, processed_at)
      VALUES (${generateUlid()}, ${event.tenantId}, ${event.eventId}, ${CONSUMER_NAME}, NOW())
      ON CONFLICT (event_id, consumer_name) DO NOTHING
      RETURNING id
    `);
    const rows = Array.from(inserted as Iterable<{ id: string }>);
    if (rows.length === 0) return;
    // Write customer_ledger_entries, check credit limit, GL posting
  });
}
```

## C. Testing Pattern
```typescript
const { mockInsert, mockSelect, mockPublishWithOutbox } = vi.hoisted(() => {
  function makeSelectChain(result: unknown[] = []) {
    const chain: Record<string, ReturnType<typeof vi.fn>> = {};
    chain.from = vi.fn().mockReturnValue(chain);
    chain.where = vi.fn().mockReturnValue(chain);
    chain.orderBy = vi.fn().mockReturnValue(chain);
    chain.limit = vi.fn().mockReturnValue(chain);
    chain.leftJoin = vi.fn().mockReturnValue(chain);
    chain.then = vi.fn((resolve: (v: unknown) => void) => resolve(result));
    return chain;
  }
  return { mockInsert: vi.fn(), mockSelect: vi.fn(() => makeSelectChain()), mockPublishWithOutbox: vi.fn() };
});
vi.mock('@oppsera/db', () => ({ db: { insert: mockInsert, select: mockSelect } }));
vi.mock('@oppsera/core/events/publish-with-outbox', () => ({ publishWithOutbox: mockPublishWithOutbox }));
```

## D. API Route Pattern
```typescript
export const POST = withMiddleware(
  async (request, ctx) => {
    const body = await request.json();
    const parsed = createMembershipAccountSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError('Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })));
    }
    const result = await createMembershipAccount(ctx, parsed.data);
    return NextResponse.json({ data: result }, { status: 201 });
  },
  { permission: 'club_membership.manage', entitlement: 'club_membership' },
);
```

## E. Existing Infrastructure (DO NOT Rebuild)
| Entity | Package | Usage |
|--------|---------|-------|
| `customers` | `@oppsera/module-customers` | Core identity — EXTENDED in Sessions 1-4 |
| `billing_accounts` | `@oppsera/module-customers` | Evolved into `customer_financial_accounts` |
| `ar_transactions` / `ar_allocations` | `@oppsera/module-customers` | Append-only AR, FIFO allocation |
| `gl_journal_entries` / `gl_journal_lines` | GL module | All financial GL postings |
| `chart_of_accounts` | GL module | GL account FKs |
| `orders` / `order_lines` | `@oppsera/module-orders` | House charges via events only |
| `tenants` / `locations` | `@oppsera/core` | Multi-tenancy |
| `background_jobs` | `@oppsera/core` | Billing runs, autopay batches |
| `audit_log` | `@oppsera/core` | All financial actions |

**Cross-module rules**: Events for writes, internal read APIs for lookups, never import another module's schema.

## F. Edge Cases
1. Mid-month join → prorate dues + minimums
2. Plan upgrade/downgrade → credit remaining, charge new prorated
3. Freeze → configurable: no dues? no minimums?
4. Family sub-accounts → per-member charge limits
5. Guest charges → map to host member
6. Split charges → POS handles; only house portion reaches ledger
7. Refunds/voids → negative ledger entry, recalc minimums
8. Multiple locations → tagged by profitCenterId/locationId
9. Write-offs → Dr Bad Debt / Cr AR, manager PIN + audit
10. Extra principal → recalculate amort, payoff quote
11. Customer without membership → full 360 works, no Membership tab
12. Multiple financial accounts → own balance/aging/hold, total in header

## G. Anti-Patterns (NEVER)
1. Never bypass unified ledger
2. Never UPDATE/DELETE ledger entries — append-only
3. Never query POS/orders from membership — events only
4. Never store money as floats
5. Never compute GL without balancing
6. Never skip credit limit check
7. Never skip policy snapshot on initiation contracts
8. Never compute minimums from gross revenue
9. Never put audit logging inside publishWithOutbox
10. Never skip idempotency on consumers
11. Never put membership schema in customer module
12. Never duplicate customer data in membership tables

## H. Frontend Patterns
- Code-split: `page.tsx` → `next/dynamic` → `*-content.tsx` with `ssr: false`
- Sidebar: Customers + Memberships (Accounts, Plans, Billing, Risk, Reports)
- Responsive: desktop+tablet admin, mobile-first portal
- Dark mode: `bg-surface`, opacity colors
- Manager PIN: `ManagerPinModal` pattern
- Summary cards: 4-across desktop, 2×2 tablet, stacked mobile
- Financial amounts: right-aligned, negatives red parentheses
- Grids: filters, export, pagination, column reorder
- Drawers/modals for edits (avoid navigation churn)
- Tabs lazy-loaded with independent skeletons

## I. Reporting (Read Models)
| Report | Key | Source |
|--------|-----|--------|
| Aging | tenant+account | statement.issued, payment |
| Minimum compliance | tenant+account+period | minimums.computed |
| Spend by category | tenant+account+dept+period | house.charge.posted |
| Initiation portfolio | tenant+contract | installment.billed, payment |
| Churn | tenant+plan+month | subscription changes |
| Revenue segmentation | tenant+location+date | order.placed |
| Customer LTV | tenant+customer | all ledger entries |

`rm_` prefixed tables, CQRS, upsert-by-natural-key.

## J. Navigation
```
Sidebar:
├── Customers → /customers (list) → /customers/[id] (360 Profile)
├── Memberships
│   ├── /membership (member list → click → /customers/[id]?tab=membership)
│   ├── /membership/plans
│   ├── /membership/billing
│   ├── /membership/risk
│   └── /membership/reports
├── Member Portal → /member-portal
└── Settings → /settings/discount-rules
```

## K. Session Dependency Map
```
Phase 1: Customer Foundation
  Session 1: Identity + 360 Shell ───────────────────┐
      ├── Session 2: Financial Engine                  │
      ├── Session 3: Activity + Comms + Relationships  │
      └── Session 4: Stored Value + Discounts          │
                                                       │
Phase 2: Membership Overlay                            │
  Session 5: Membership Core ──────────────────────────┘
      ├── Session 6: Dues + Statements
      │       ├── Session 7: Minimums
      │       │       └── Session 10: Billing Center ──┐
      │       └── Session 8: Initiation               │
      │               └── Session 10 ─────────────────┘
      └── Session 9: Autopay + Risk
              └── Session 10: Billing Center
  Session 11: Reporting + Insights (requires 5-10)
  Session 12: Member Portal + Polish (requires 5-11)
```

Sessions 2-4 parallel after 1. Sessions 6-9 partially parallel after 5.

## L. V1 vs V2 Provisions
**V1**: Everything in Sessions 1-12.
**V2 (provisioned, UI deferred)**: Saved views, e-signatures, document versions, seasonal billing, loyalty points, reservation deep integration, push notifications, ML churn prediction, multi-currency, batch import/export, custom fields per tenant.
