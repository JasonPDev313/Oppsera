import {
  pgTable,
  text,
  integer,
  bigint,
  boolean,
  timestamp,
  date,
  index,
  uniqueIndex,
  jsonb,
  numeric,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { generateUlid } from '@oppsera/shared';
import { tenants } from './core';

// ── Customers ───────────────────────────────────────────────────
export const customers = pgTable(
  'customers',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    type: text('type').notNull().default('person'),
    email: text('email'),
    phone: text('phone'),
    firstName: text('first_name'),
    lastName: text('last_name'),
    organizationName: text('organization_name'),
    displayName: text('display_name').notNull(),
    notes: text('notes'),
    tags: jsonb('tags').notNull().default('[]'),
    marketingConsent: boolean('marketing_consent').notNull().default(false),
    taxExempt: boolean('tax_exempt').notNull().default(false),
    taxExemptCertificateNumber: text('tax_exempt_certificate_number'),
    totalVisits: integer('total_visits').notNull().default(0),
    totalSpend: bigint('total_spend', { mode: 'number' }).notNull().default(0),
    lastVisitAt: timestamp('last_visit_at', { withTimezone: true }),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: text('created_by'),

    // ── Universal Customer Profile fields ──
    dateOfBirth: date('date_of_birth'),
    gender: text('gender'),
    anniversary: date('anniversary'),
    preferredLanguage: text('preferred_language').default('en'),
    preferredContactMethod: text('preferred_contact_method'),
    emergencyContactName: text('emergency_contact_name'),
    emergencyContactPhone: text('emergency_contact_phone'),
    profileImageUrl: text('profile_image_url'),
    communicationOptIns: jsonb('communication_opt_ins')
      .notNull()
      .default('{"email": false, "sms": false, "push": false}'),
    riskFlags: jsonb('risk_flags').notNull().default('[]'),
    complianceData: jsonb('compliance_data'),
    aiFields: jsonb('ai_fields'),
    behavioralProfile: jsonb('behavioral_profile'),
    status: text('status').notNull().default('active'),
    walletBalanceCents: integer('wallet_balance_cents').notNull().default(0),
    doNotContactReasons: jsonb('do_not_contact_reasons').notNull().default('[]'),
    preferredTimeOfDay: text('preferred_time_of_day'),
    preferredChannelPriority: jsonb('preferred_channel_priority'),
    loyaltyTier: text('loyalty_tier'),
    loyaltyPointsBalance: integer('loyalty_points_balance').notNull().default(0),
    loyaltyEnrollmentDate: date('loyalty_enrollment_date'),
    acquisitionSource: text('acquisition_source'),
    referralSource: text('referral_source'),
    campaignSource: text('campaign_source'),
    utmData: jsonb('utm_data'),
    lastStaffInteractionId: text('last_staff_interaction_id'),
    favoriteStaffId: text('favorite_staff_id'),
    socialMediaHandles: jsonb('social_media_handles'),
    handicapIndex: numeric('handicap_index', { precision: 4, scale: 1 }),

    // ── Customer Gap fields (migration 0027) ──
    prefix: text('prefix'),
    suffix: text('suffix'),
    nickname: text('nickname'),
    homePhone: text('home_phone'),
    ghinNumber: text('ghin_number'),
    projectedRounds: integer('projected_rounds'),
  },
  (table) => [
    // NOTE: partial unique indexes (WHERE email IS NOT NULL / WHERE phone IS NOT NULL)
    // are created via raw SQL in migration. Regular indexes here for query support.
    index('idx_customers_tenant_email')
      .on(table.tenantId, table.email)
      .where(sql`email IS NOT NULL`),
    index('idx_customers_tenant_phone')
      .on(table.tenantId, table.phone)
      .where(sql`phone IS NOT NULL`),
    index('idx_customers_tenant_display_name').on(table.tenantId, table.displayName),
    index('idx_customers_tenant_last_visit').on(table.tenantId, table.lastVisitAt),
  ],
);

// ── Customer Relationships ──────────────────────────────────────
export const customerRelationships = pgTable(
  'customer_relationships',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    parentCustomerId: text('parent_customer_id')
      .notNull()
      .references(() => customers.id),
    childCustomerId: text('child_customer_id')
      .notNull()
      .references(() => customers.id),
    relationshipType: text('relationship_type').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_customer_relationships_parent').on(table.tenantId, table.parentCustomerId),
    index('idx_customer_relationships_child').on(table.tenantId, table.childCustomerId),
    uniqueIndex('uq_customer_relationships_tenant_parent_child_type').on(
      table.tenantId,
      table.parentCustomerId,
      table.childCustomerId,
      table.relationshipType,
    ),
  ],
);

// ── Customer Identifiers ────────────────────────────────────────
export const customerIdentifiers = pgTable(
  'customer_identifiers',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    customerId: text('customer_id')
      .notNull()
      .references(() => customers.id),
    type: text('type').notNull(),
    value: text('value').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_customer_identifiers_tenant_customer').on(table.tenantId, table.customerId),
    uniqueIndex('uq_customer_identifiers_tenant_type_value').on(
      table.tenantId,
      table.type,
      table.value,
    ),
  ],
);

// ── Customer Activity Log ───────────────────────────────────────
export const customerActivityLog = pgTable(
  'customer_activity_log',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    customerId: text('customer_id')
      .notNull()
      .references(() => customers.id),
    activityType: text('activity_type').notNull(),
    title: text('title').notNull(),
    details: text('details'),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: text('created_by'),
  },
  (table) => [
    index('idx_customer_activity_log_tenant_customer_created').on(
      table.tenantId,
      table.customerId,
      table.createdAt,
    ),
  ],
);

// ── Membership Plans ────────────────────────────────────────────
export const membershipPlans = pgTable(
  'membership_plans',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    name: text('name').notNull(),
    description: text('description'),
    billingInterval: text('billing_interval').notNull().default('monthly'),
    priceCents: integer('price_cents').notNull(),
    billingEnabled: boolean('billing_enabled').notNull().default(true),
    privileges: jsonb('privileges').notNull().default('[]'),
    rules: jsonb('rules'),
    isActive: boolean('is_active').notNull().default(true),

    // ── Membership gap fields (migration 0032) ──
    taxGroupId: text('tax_group_id'),
    processFeeRate: numeric('process_fee_rate'),
    processFeeAmountCents: integer('process_fee_amount_cents'),
    enableOnlineSale: boolean('enable_online_sale').notNull().default(false),
    teeSheetColor: text('tee_sheet_color'),
    termsAndConditions: text('terms_and_conditions'),
    cancellationPolicy: text('cancellation_policy'),
    prorateOnSale: boolean('prorate_on_sale').notNull().default(false),
    maxAssignments: integer('max_assignments'),
    expirationStrategy: jsonb('expiration_strategy'),
    eligibleForLoyalty: boolean('eligible_for_loyalty').notNull().default(false),
    eligibleForAwards: boolean('eligible_for_awards').notNull().default(false),
    awardsPercentage: numeric('awards_percentage'),
    displaySequence: integer('display_sequence').notNull().default(0),
    accountType: text('account_type'),
    requireCcForTeeReservations: text('require_cc_for_tee_reservations'),
    requireCcForActivityReservations: text('require_cc_for_activity_reservations'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_membership_plans_tenant_active').on(table.tenantId, table.isActive),
  ],
);

// ── Customer Memberships (plan enrollment) ──────────────────────
export const customerMemberships = pgTable(
  'customer_memberships',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    customerId: text('customer_id')
      .notNull()
      .references(() => customers.id),
    planId: text('plan_id')
      .notNull()
      .references(() => membershipPlans.id),
    billingAccountId: text('billing_account_id').notNull(), // NO DB-level FK — cross-table, enforced in app
    status: text('status').notNull().default('pending'),
    startDate: date('start_date').notNull(),
    endDate: date('end_date'),
    renewalDate: date('renewal_date'),
    cancelReason: text('cancel_reason'),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_customer_memberships_tenant_customer').on(table.tenantId, table.customerId),
    index('idx_customer_memberships_tenant_billing').on(table.tenantId, table.billingAccountId),
    index('idx_customer_memberships_tenant_status').on(table.tenantId, table.status),
    index('idx_customer_memberships_tenant_renewal').on(table.tenantId, table.renewalDate),
  ],
);

// ── Membership Billing Events ───────────────────────────────────
export const membershipBillingEvents = pgTable(
  'membership_billing_events',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    membershipId: text('membership_id')
      .notNull()
      .references(() => customerMemberships.id),
    eventType: text('event_type').notNull(),
    billingPeriodStart: date('billing_period_start').notNull(),
    billingPeriodEnd: date('billing_period_end').notNull(),
    amountCents: integer('amount_cents').notNull(),
    arTransactionId: text('ar_transaction_id'),
    failureReason: text('failure_reason'),
    attemptNumber: integer('attempt_number').notNull().default(1),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_membership_billing_events_tenant_membership_period').on(
      table.tenantId,
      table.membershipId,
      table.billingPeriodStart,
    ),
    index('idx_membership_billing_events_tenant_type').on(table.tenantId, table.eventType),
  ],
);

// ── Billing Accounts ────────────────────────────────────────────
export const billingAccounts = pgTable(
  'billing_accounts',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    name: text('name').notNull(),
    primaryCustomerId: text('primary_customer_id')
      .notNull()
      .references(() => customers.id),
    status: text('status').notNull().default('active'),
    collectionStatus: text('collection_status').notNull().default('normal'),
    creditLimitCents: bigint('credit_limit_cents', { mode: 'number' }),
    currentBalanceCents: bigint('current_balance_cents', { mode: 'number' }).notNull().default(0),
    billingCycle: text('billing_cycle').notNull().default('monthly'),
    statementDayOfMonth: integer('statement_day_of_month'),
    dueDays: integer('due_days').notNull().default(30),
    lateFeePolicyId: text('late_fee_policy_id'),
    autoPayEnabled: boolean('auto_pay_enabled').notNull().default(false),
    taxExempt: boolean('tax_exempt').notNull().default(false),
    taxExemptCertificateNumber: text('tax_exempt_certificate_number'),
    authorizationRules: jsonb('authorization_rules'),
    billingEmail: text('billing_email'),
    billingContactName: text('billing_contact_name'),
    billingAddress: text('billing_address'),
    glArAccountCode: text('gl_ar_account_code').notNull().default('1200'),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_billing_accounts_tenant_customer').on(table.tenantId, table.primaryCustomerId),
    index('idx_billing_accounts_tenant_status').on(table.tenantId, table.status),
    index('idx_billing_accounts_tenant_collection').on(table.tenantId, table.collectionStatus),
  ],
);

// ── Billing Account Members ─────────────────────────────────────
export const billingAccountMembers = pgTable(
  'billing_account_members',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    billingAccountId: text('billing_account_id')
      .notNull()
      .references(() => billingAccounts.id),
    customerId: text('customer_id')
      .notNull()
      .references(() => customers.id),
    role: text('role').notNull(),
    chargeAllowed: boolean('charge_allowed').notNull().default(true),
    spendingLimitCents: bigint('spending_limit_cents', { mode: 'number' }),
    permissions: jsonb('permissions')
      .notNull()
      .default(
        '{"canCharge": true, "canViewStatements": false, "canManageMembers": false, "canEditProfile": false}',
      ),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_billing_account_members_tenant_account').on(
      table.tenantId,
      table.billingAccountId,
    ),
    index('idx_billing_account_members_tenant_customer').on(table.tenantId, table.customerId),
    uniqueIndex('uq_billing_account_members_tenant_account_customer').on(
      table.tenantId,
      table.billingAccountId,
      table.customerId,
    ),
  ],
);

// ── AR Transactions (accounts receivable ledger — append-only) ──
export const arTransactions = pgTable(
  'ar_transactions',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    billingAccountId: text('billing_account_id')
      .notNull()
      .references(() => billingAccounts.id),
    type: text('type').notNull(),
    amountCents: bigint('amount_cents', { mode: 'number' }).notNull(),
    dueDate: date('due_date'),
    referenceType: text('reference_type'),
    referenceId: text('reference_id'),
    customerId: text('customer_id'),
    glJournalEntryId: text('gl_journal_entry_id'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: text('created_by').notNull(),
  },
  (table) => [
    index('idx_ar_transactions_tenant_account_created').on(
      table.tenantId,
      table.billingAccountId,
      table.createdAt,
    ),
    index('idx_ar_transactions_tenant_account_due').on(
      table.tenantId,
      table.billingAccountId,
      table.dueDate,
    ),
    index('idx_ar_transactions_tenant_type').on(table.tenantId, table.type),
    index('idx_ar_transactions_reference').on(table.referenceType, table.referenceId),
  ],
);

// ── AR Allocations (payment-to-charge mapping) ──────────────────
export const arAllocations = pgTable(
  'ar_allocations',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    paymentTransactionId: text('payment_transaction_id')
      .notNull()
      .references(() => arTransactions.id),
    chargeTransactionId: text('charge_transaction_id')
      .notNull()
      .references(() => arTransactions.id),
    amountCents: bigint('amount_cents', { mode: 'number' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_ar_allocations_tenant_payment').on(table.tenantId, table.paymentTransactionId),
    index('idx_ar_allocations_tenant_charge').on(table.tenantId, table.chargeTransactionId),
    uniqueIndex('uq_ar_allocations_tenant_payment_charge').on(
      table.tenantId,
      table.paymentTransactionId,
      table.chargeTransactionId,
    ),
  ],
);

// ── Statements (monthly snapshots) ──────────────────────────────
export const statements = pgTable(
  'statements',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    billingAccountId: text('billing_account_id')
      .notNull()
      .references(() => billingAccounts.id),
    periodStart: date('period_start').notNull(),
    periodEnd: date('period_end').notNull(),
    openingBalanceCents: bigint('opening_balance_cents', { mode: 'number' }).notNull(),
    chargesCents: bigint('charges_cents', { mode: 'number' }).notNull(),
    paymentsCents: bigint('payments_cents', { mode: 'number' }).notNull(),
    lateFeesCents: bigint('late_fees_cents', { mode: 'number' }).notNull().default(0),
    closingBalanceCents: bigint('closing_balance_cents', { mode: 'number' }).notNull(),
    dueDate: date('due_date').notNull(),
    status: text('status').notNull().default('open'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_statements_tenant_account_period').on(
      table.tenantId,
      table.billingAccountId,
      table.periodEnd,
    ),
    index('idx_statements_tenant_status').on(table.tenantId, table.status),
    uniqueIndex('uq_statements_tenant_account_period').on(
      table.tenantId,
      table.billingAccountId,
      table.periodStart,
      table.periodEnd,
    ),
  ],
);

// ── Late Fee Policies ───────────────────────────────────────────
export const lateFeePolicies = pgTable(
  'late_fee_policies',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    name: text('name').notNull(),
    type: text('type').notNull(),
    value: numeric('value', { precision: 12, scale: 4 }).notNull(),
    graceDays: integer('grace_days').notNull().default(0),
    maxFeeCents: bigint('max_fee_cents', { mode: 'number' }),

    // ── Late fee gap fields (migration 0028) ──
    feeAmountCents: bigint('fee_amount_cents', { mode: 'number' }),
    thresholdAmountCents: bigint('threshold_amount_cents', { mode: 'number' }),
    minimumFeeCents: bigint('minimum_fee_cents', { mode: 'number' }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_late_fee_policies_tenant').on(table.tenantId)],
);

// ── Customer Privileges (manual overrides) ──────────────────────
export const customerPrivileges = pgTable(
  'customer_privileges',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    customerId: text('customer_id')
      .notNull()
      .references(() => customers.id),
    privilegeType: text('privilege_type').notNull(),
    value: jsonb('value').notNull(),
    reason: text('reason'),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: text('created_by').notNull(),
  },
  (table) => [
    index('idx_customer_privileges_tenant_customer').on(table.tenantId, table.customerId),
    index('idx_customer_privileges_tenant_customer_type').on(
      table.tenantId,
      table.customerId,
      table.privilegeType,
    ),
  ],
);

// ── Pricing Tiers (member vs public pricing) ────────────────────
export const pricingTiers = pgTable(
  'pricing_tiers',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    name: text('name').notNull(),
    description: text('description'),
    rules: jsonb('rules'),
    isDefault: boolean('is_default').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_pricing_tiers_tenant_name').on(table.tenantId, table.name),
    index('idx_pricing_tiers_tenant_default').on(table.tenantId, table.isDefault),
  ],
);

// ── Customer Contacts ─────────────────────────────────────────────
export const customerContacts = pgTable(
  'customer_contacts',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    customerId: text('customer_id')
      .notNull()
      .references(() => customers.id),
    contactType: text('contact_type').notNull(),
    label: text('label'),
    value: text('value').notNull(),
    isPrimary: boolean('is_primary').notNull().default(false),
    isVerified: boolean('is_verified').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_customer_contacts_tenant_customer_type').on(
      table.tenantId,
      table.customerId,
      table.contactType,
    ),
  ],
);

// ── Customer Preferences ──────────────────────────────────────────
export const customerPreferences = pgTable(
  'customer_preferences',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    customerId: text('customer_id')
      .notNull()
      .references(() => customers.id),
    category: text('category').notNull(),
    key: text('key').notNull(),
    value: text('value').notNull(),
    source: text('source').notNull().default('manual'),
    confidence: numeric('confidence', { precision: 3, scale: 2 }),
    inferenceVersion: text('inference_version'),
    lastInferredAt: timestamp('last_inferred_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    updatedBy: text('updated_by'),
  },
  (table) => [
    index('idx_customer_preferences_tenant_customer_category').on(
      table.tenantId,
      table.customerId,
      table.category,
    ),
    uniqueIndex('uq_customer_preferences_tenant_customer_category_key').on(
      table.tenantId,
      table.customerId,
      table.category,
      table.key,
    ),
  ],
);

// ── Customer Documents ────────────────────────────────────────────
export const customerDocuments = pgTable(
  'customer_documents',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    customerId: text('customer_id')
      .notNull()
      .references(() => customers.id),
    documentType: text('document_type').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    storageKey: text('storage_key').notNull(),
    mimeType: text('mime_type').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    uploadedAt: timestamp('uploaded_at', { withTimezone: true }).notNull().defaultNow(),
    uploadedBy: text('uploaded_by').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
  },
  (table) => [
    index('idx_customer_documents_tenant_customer_type').on(
      table.tenantId,
      table.customerId,
      table.documentType,
    ),
  ],
);

// ── Customer Communications ───────────────────────────────────────
export const customerCommunications = pgTable(
  'customer_communications',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    customerId: text('customer_id')
      .notNull()
      .references(() => customers.id),
    channel: text('channel').notNull(),
    direction: text('direction').notNull().default('outbound'),
    subject: text('subject'),
    body: text('body'),
    campaignId: text('campaign_id'),
    status: text('status').notNull().default('sent'),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: text('created_by'),
  },
  (table) => [
    index('idx_customer_communications_tenant_customer_created').on(
      table.tenantId,
      table.customerId,
      table.createdAt,
    ),
    index('idx_customer_communications_tenant_channel_status').on(
      table.tenantId,
      table.channel,
      table.status,
    ),
  ],
);

// ── Customer Service Flags ────────────────────────────────────────
export const customerServiceFlags = pgTable(
  'customer_service_flags',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    customerId: text('customer_id')
      .notNull()
      .references(() => customers.id),
    flagType: text('flag_type').notNull(),
    severity: text('severity').notNull().default('info'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: text('created_by').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
  },
  (table) => [
    index('idx_customer_service_flags_tenant_customer').on(table.tenantId, table.customerId),
    index('idx_customer_service_flags_tenant_flag_type').on(table.tenantId, table.flagType),
  ],
);

// ── Customer Consents ─────────────────────────────────────────────
export const customerConsents = pgTable(
  'customer_consents',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    customerId: text('customer_id')
      .notNull()
      .references(() => customers.id),
    consentType: text('consent_type').notNull(),
    status: text('status').notNull(),
    grantedAt: timestamp('granted_at', { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    source: text('source').notNull().default('manual'),
    ipAddress: text('ip_address'),
    documentId: text('document_id'),
  },
  (table) => [
    index('idx_customer_consents_tenant_customer_type').on(
      table.tenantId,
      table.customerId,
      table.consentType,
    ),
    uniqueIndex('uq_customer_consents_tenant_customer_type').on(
      table.tenantId,
      table.customerId,
      table.consentType,
    ),
  ],
);

// ── Customer External IDs ─────────────────────────────────────────
export const customerExternalIds = pgTable(
  'customer_external_ids',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    customerId: text('customer_id')
      .notNull()
      .references(() => customers.id),
    provider: text('provider').notNull(),
    externalId: text('external_id').notNull(),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_customer_external_ids_tenant_provider_external').on(
      table.tenantId,
      table.provider,
      table.externalId,
    ),
    index('idx_customer_external_ids_tenant_customer_provider').on(
      table.tenantId,
      table.customerId,
      table.provider,
    ),
  ],
);

// ── Customer Auth Accounts ────────────────────────────────────────
export const customerAuthAccounts = pgTable(
  'customer_auth_accounts',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    customerId: text('customer_id')
      .notNull()
      .references(() => customers.id),
    provider: text('provider').notNull(),
    authProviderUserId: text('auth_provider_user_id'),
    isActive: boolean('is_active').notNull().default(false),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_customer_auth_accounts_tenant_customer_provider').on(
      table.tenantId,
      table.customerId,
      table.provider,
    ),
  ],
);

// ── Customer Wallet Accounts ──────────────────────────────────────
export const customerWalletAccounts = pgTable(
  'customer_wallet_accounts',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    customerId: text('customer_id')
      .notNull()
      .references(() => customers.id),
    walletType: text('wallet_type').notNull(),
    balanceCents: integer('balance_cents').notNull().default(0),
    currency: text('currency').notNull().default('USD'),
    externalRef: text('external_ref'),
    status: text('status').notNull().default('active'),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_customer_wallet_accounts_tenant_customer_type').on(
      table.tenantId,
      table.customerId,
      table.walletType,
    ),
    index('idx_customer_wallet_accounts_tenant_customer_status').on(
      table.tenantId,
      table.customerId,
      table.status,
    ),
  ],
);

// ── Customer Alerts ───────────────────────────────────────────────
export const customerAlerts = pgTable(
  'customer_alerts',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    customerId: text('customer_id')
      .notNull()
      .references(() => customers.id),
    alertType: text('alert_type').notNull(),
    severity: text('severity').notNull().default('info'),
    message: text('message').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    dismissedAt: timestamp('dismissed_at', { withTimezone: true }),
    dismissedBy: text('dismissed_by'),
  },
  (table) => [
    index('idx_customer_alerts_tenant_customer_active').on(
      table.tenantId,
      table.customerId,
      table.isActive,
    ),
    index('idx_customer_alerts_tenant_type_active').on(
      table.tenantId,
      table.alertType,
      table.isActive,
    ),
  ],
);

// ── Customer Scores ───────────────────────────────────────────────
export const customerScores = pgTable(
  'customer_scores',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    customerId: text('customer_id')
      .notNull()
      .references(() => customers.id),
    scoreType: text('score_type').notNull(),
    score: numeric('score', { precision: 5, scale: 2 }).notNull(),
    computedAt: timestamp('computed_at', { withTimezone: true }).notNull().defaultNow(),
    modelVersion: text('model_version'),
    metadata: jsonb('metadata'),
  },
  (table) => [
    uniqueIndex('uq_customer_scores_tenant_customer_type').on(
      table.tenantId,
      table.customerId,
      table.scoreType,
    ),
    index('idx_customer_scores_tenant_type_score').on(
      table.tenantId,
      table.scoreType,
      table.score,
    ),
  ],
);

// ── Customer Metrics Daily ────────────────────────────────────────
export const customerMetricsDaily = pgTable(
  'customer_metrics_daily',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    customerId: text('customer_id')
      .notNull()
      .references(() => customers.id),
    date: date('date').notNull(),
    visits: integer('visits').notNull().default(0),
    spendCents: integer('spend_cents').notNull().default(0),
    orders: integer('orders').notNull().default(0),
    durationMinutes: integer('duration_minutes').notNull().default(0),
    categoryBreakdown: jsonb('category_breakdown').notNull().default('{}'),
  },
  (table) => [
    uniqueIndex('uq_customer_metrics_daily_tenant_customer_date').on(
      table.tenantId,
      table.customerId,
      table.date,
    ),
    index('idx_customer_metrics_daily_tenant_date').on(table.tenantId, table.date),
  ],
);

// ── Customer Metrics Lifetime ─────────────────────────────────────
export const customerMetricsLifetime = pgTable(
  'customer_metrics_lifetime',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    customerId: text('customer_id')
      .notNull()
      .references(() => customers.id),
    totalVisits: integer('total_visits').notNull().default(0),
    totalSpendCents: integer('total_spend_cents').notNull().default(0),
    lastVisitAt: timestamp('last_visit_at', { withTimezone: true }),
    firstVisitAt: timestamp('first_visit_at', { withTimezone: true }),
    avgSpendCents: integer('avg_spend_cents').notNull().default(0),
    lifetimeValueCents: integer('lifetime_value_cents').notNull().default(0),
    visitFrequency: text('visit_frequency'),
    avgVisitDurationMinutes: integer('avg_visit_duration_minutes'),
    topCategory: text('top_category'),
    categoryBreakdown: jsonb('category_breakdown').notNull().default('{}'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_customer_metrics_lifetime_tenant_customer').on(
      table.tenantId,
      table.customerId,
    ),
  ],
);

// ── Customer Merge History ────────────────────────────────────────
export const customerMergeHistory = pgTable(
  'customer_merge_history',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    primaryCustomerId: text('primary_customer_id')
      .notNull()
      .references(() => customers.id),
    mergedCustomerId: text('merged_customer_id').notNull(),
    mergedAt: timestamp('merged_at', { withTimezone: true }).notNull().defaultNow(),
    mergedBy: text('merged_by').notNull(),
    snapshot: jsonb('snapshot').notNull(),
  },
  (table) => [
    index('idx_customer_merge_history_tenant_primary').on(
      table.tenantId,
      table.primaryCustomerId,
    ),
    index('idx_customer_merge_history_tenant_merged').on(
      table.tenantId,
      table.mergedCustomerId,
    ),
  ],
);

// ── Customer Households ───────────────────────────────────────────
export const customerHouseholds = pgTable(
  'customer_households',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    name: text('name').notNull(),
    householdType: text('household_type').notNull(),
    primaryCustomerId: text('primary_customer_id')
      .notNull()
      .references(() => customers.id),
    billingAccountId: text('billing_account_id'),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_customer_households_tenant_primary').on(
      table.tenantId,
      table.primaryCustomerId,
    ),
    index('idx_customer_households_tenant_type').on(table.tenantId, table.householdType),
  ],
);

// ── Customer Household Members ────────────────────────────────────
export const customerHouseholdMembers = pgTable(
  'customer_household_members',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    householdId: text('household_id')
      .notNull()
      .references(() => customerHouseholds.id),
    customerId: text('customer_id')
      .notNull()
      .references(() => customers.id),
    role: text('role').notNull(),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
    leftAt: timestamp('left_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('uq_customer_household_members_tenant_household_customer').on(
      table.tenantId,
      table.householdId,
      table.customerId,
    ),
    index('idx_customer_household_members_tenant_customer').on(
      table.tenantId,
      table.customerId,
    ),
  ],
);

// ── Customer Visits ───────────────────────────────────────────────
export const customerVisits = pgTable(
  'customer_visits',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    customerId: text('customer_id')
      .notNull()
      .references(() => customers.id),
    checkInAt: timestamp('check_in_at', { withTimezone: true }).notNull().defaultNow(),
    checkOutAt: timestamp('check_out_at', { withTimezone: true }),
    durationMinutes: integer('duration_minutes'),
    location: text('location'),
    checkInMethod: text('check_in_method').notNull().default('manual'),
    staffId: text('staff_id'),
    notes: text('notes'),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_customer_visits_tenant_customer_checkin').on(
      table.tenantId,
      table.customerId,
      table.checkInAt,
    ),
    index('idx_customer_visits_tenant_checkin').on(table.tenantId, table.checkInAt),
    index('idx_customer_visits_tenant_location_checkin').on(
      table.tenantId,
      table.location,
      table.checkInAt,
    ),
  ],
);

// ── Customer Incidents ────────────────────────────────────────────
export const customerIncidents = pgTable(
  'customer_incidents',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    customerId: text('customer_id')
      .notNull()
      .references(() => customers.id),
    incidentType: text('incident_type').notNull(),
    severity: text('severity').notNull().default('medium'),
    status: text('status').notNull().default('open'),
    subject: text('subject').notNull(),
    description: text('description'),
    resolution: text('resolution'),
    compensationCents: integer('compensation_cents'),
    compensationType: text('compensation_type'),
    staffInvolvedIds: jsonb('staff_involved_ids').notNull().default('[]'),
    relatedOrderId: text('related_order_id'),
    relatedVisitId: text('related_visit_id'),
    reportedBy: text('reported_by').notNull(),
    resolvedBy: text('resolved_by'),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_customer_incidents_tenant_customer_created').on(
      table.tenantId,
      table.customerId,
      table.createdAt,
    ),
    index('idx_customer_incidents_tenant_status').on(table.tenantId, table.status),
    index('idx_customer_incidents_tenant_type_created').on(
      table.tenantId,
      table.incidentType,
      table.createdAt,
    ),
    index('idx_customer_incidents_tenant_severity').on(table.tenantId, table.severity),
  ],
);

// ── Customer Segments ─────────────────────────────────────────────
export const customerSegments = pgTable(
  'customer_segments',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    name: text('name').notNull(),
    description: text('description'),
    segmentType: text('segment_type').notNull(),
    rules: jsonb('rules'),
    isActive: boolean('is_active').notNull().default(true),
    memberCount: integer('member_count').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: text('created_by').notNull(),
  },
  (table) => [
    uniqueIndex('uq_customer_segments_tenant_name').on(table.tenantId, table.name),
    index('idx_customer_segments_tenant_type_active').on(
      table.tenantId,
      table.segmentType,
      table.isActive,
    ),
  ],
);

// ── Customer Segment Memberships ──────────────────────────────────
export const customerSegmentMemberships = pgTable(
  'customer_segment_memberships',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    segmentId: text('segment_id')
      .notNull()
      .references(() => customerSegments.id),
    customerId: text('customer_id')
      .notNull()
      .references(() => customers.id),
    addedAt: timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),
    addedBy: text('added_by'),
    removedAt: timestamp('removed_at', { withTimezone: true }),
  },
  (table) => [
    index('idx_customer_segment_memberships_tenant_segment_customer').on(
      table.tenantId,
      table.segmentId,
      table.customerId,
    ),
    index('idx_customer_segment_memberships_tenant_customer').on(
      table.tenantId,
      table.customerId,
    ),
  ],
);

// ── Customer Payment Methods ──────────────────────────────────────
export const customerPaymentMethods = pgTable(
  'customer_payment_methods',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    customerId: text('customer_id')
      .notNull()
      .references(() => customers.id),
    paymentType: text('payment_type').notNull(),
    token: text('token').notNull(),
    brand: text('brand'),
    last4: text('last4'),
    expiryMonth: integer('expiry_month'),
    expiryYear: integer('expiry_year'),
    billingAccountId: text('billing_account_id'),
    isDefault: boolean('is_default').notNull().default(false),
    status: text('status').notNull().default('active'),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_customer_payment_methods_tenant_customer_status').on(
      table.tenantId,
      table.customerId,
      table.status,
    ),
    uniqueIndex('uq_customer_payment_methods_tenant_token').on(table.tenantId, table.token),
  ],
);
