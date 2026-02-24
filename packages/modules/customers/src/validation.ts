import { z } from 'zod';

export const createCustomerSchema = z.object({
  type: z.enum(['person', 'organization']).default('person'),
  email: z.string().email().toLowerCase().trim().optional(),
  phone: z.string().trim().min(7).optional(),
  firstName: z.string().trim().max(100).optional(),
  lastName: z.string().trim().max(100).optional(),
  organizationName: z.string().trim().max(200).optional(),
  notes: z.string().max(2000).optional(),
  tags: z.array(z.string()).optional(),
  marketingConsent: z.boolean().optional(),
  taxExempt: z.boolean().optional(),
  taxExemptCertificateNumber: z.string().optional(),
  dateOfBirth: z.string().optional(),
  gender: z.enum(['male', 'female', 'non_binary', 'prefer_not_to_say', 'other']).optional(),
  anniversary: z.string().optional(),
  preferredLanguage: z.string().optional(),
  preferredContactMethod: z.enum(['email', 'phone', 'sms']).optional(),
  emergencyContactName: z.string().max(200).optional(),
  emergencyContactPhone: z.string().optional(),
  status: z.enum(['active', 'inactive', 'prospect', 'lead', 'suspended', 'banned', 'deceased', 'archived']).optional(),
  acquisitionSource: z.enum(['walk_in', 'referral', 'website', 'social_media', 'event', 'advertising', 'partner', 'import', 'other']).optional(),
  referralSource: z.string().optional(),
  campaignSource: z.string().optional(),
  utmData: z.record(z.string()).optional(),
  handicapIndex: z.number().min(0).max(54).optional(),
  socialMediaHandles: z.record(z.string()).optional(),
  clientRequestId: z.string().optional(),
});
export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;

export const updateCustomerSchema = z.object({
  email: z.string().email().toLowerCase().trim().optional().nullable(),
  phone: z.string().trim().min(7).optional().nullable(),
  firstName: z.string().trim().max(100).optional().nullable(),
  lastName: z.string().trim().max(100).optional().nullable(),
  organizationName: z.string().trim().max(200).optional().nullable(),
  displayName: z.string().trim().max(200).optional(),
  notes: z.string().max(2000).optional().nullable(),
  tags: z.array(z.string()).optional(),
  marketingConsent: z.boolean().optional(),
  taxExempt: z.boolean().optional(),
  taxExemptCertificateNumber: z.string().optional().nullable(),
  dateOfBirth: z.string().optional().nullable(),
  gender: z.enum(['male', 'female', 'non_binary', 'prefer_not_to_say', 'other']).optional().nullable(),
  anniversary: z.string().optional().nullable(),
  preferredLanguage: z.string().optional().nullable(),
  preferredContactMethod: z.enum(['email', 'phone', 'sms']).optional().nullable(),
  emergencyContactName: z.string().max(200).optional().nullable(),
  emergencyContactPhone: z.string().optional().nullable(),
  status: z.enum(['active', 'inactive', 'prospect', 'lead', 'suspended', 'banned', 'deceased', 'archived']).optional().nullable(),
  acquisitionSource: z.enum(['walk_in', 'referral', 'website', 'social_media', 'event', 'advertising', 'partner', 'import', 'other']).optional().nullable(),
  referralSource: z.string().optional().nullable(),
  campaignSource: z.string().optional().nullable(),
  utmData: z.record(z.string()).optional().nullable(),
  handicapIndex: z.number().min(0).max(54).optional().nullable(),
  socialMediaHandles: z.record(z.string()).optional().nullable(),
  profileImageUrl: z.string().url().optional().nullable(),
  communicationOptIns: z.object({ email: z.boolean(), sms: z.boolean(), push: z.boolean() }).optional(),
  riskFlags: z.array(z.string()).optional(),
  doNotContactReasons: z.array(z.string()).optional(),
  preferredTimeOfDay: z.enum(['morning', 'afternoon', 'evening', 'any']).optional().nullable(),
  preferredChannelPriority: z.array(z.string()).optional().nullable(),
  loyaltyTier: z.enum(['bronze', 'silver', 'gold', 'platinum', 'diamond']).optional().nullable(),
  favoriteStaffId: z.string().optional().nullable(),
  clientRequestId: z.string().optional(),
});
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;

export const addCustomerIdentifierSchema = z.object({
  customerId: z.string().min(1),
  type: z.enum(['member_number', 'card', 'barcode', 'qr', 'wristband', 'external']),
  value: z.string().min(1),
  clientRequestId: z.string().optional(),
});
export type AddCustomerIdentifierInput = z.infer<typeof addCustomerIdentifierSchema>;

export const addCustomerNoteSchema = z.object({
  customerId: z.string().min(1),
  title: z.string().min(1).max(200),
  details: z.string().max(5000).optional(),
});
export type AddCustomerNoteInput = z.infer<typeof addCustomerNoteSchema>;

export const mergeCustomersSchema = z.object({
  primaryId: z.string().min(1),
  duplicateId: z.string().min(1),
  clientRequestId: z.string().optional(),
});
export type MergeCustomersInput = z.infer<typeof mergeCustomersSchema>;

export const searchCustomersSchema = z.object({
  search: z.string().optional(),
  identifier: z.string().optional(),
  limit: z.number().int().min(1).max(50).default(10),
});
export type SearchCustomersInput = z.infer<typeof searchCustomersSchema>;

export const createMembershipPlanSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  billingInterval: z.enum(['monthly', 'annual', 'none']).default('monthly'),
  priceCents: z.number().int().min(0),
  billingEnabled: z.boolean().default(true),
  privileges: z.array(z.object({ type: z.string(), value: z.unknown() })).optional(),
  rules: z.record(z.unknown()).optional(),
  clientRequestId: z.string().optional(),
});
export type CreateMembershipPlanInput = z.infer<typeof createMembershipPlanSchema>;

export const updateMembershipPlanSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional().nullable(),
  billingEnabled: z.boolean().optional(),
  privileges: z.array(z.object({ type: z.string(), value: z.unknown() })).optional(),
  rules: z.record(z.unknown()).optional().nullable(),
  isActive: z.boolean().optional(),
  clientRequestId: z.string().optional(),
});
export type UpdateMembershipPlanInput = z.infer<typeof updateMembershipPlanSchema>;

export const enrollMemberSchema = z.object({
  customerId: z.string().min(1),
  planId: z.string().min(1),
  billingAccountId: z.string().min(1),
  startDate: z.string().optional(), // date string, defaults to today
  clientRequestId: z.string().optional(),
});
export type EnrollMemberInput = z.infer<typeof enrollMemberSchema>;

export const updateMembershipStatusSchema = z.object({
  membershipId: z.string().min(1),
  action: z.enum(['pause', 'cancel', 'reactivate', 'expire']),
  reason: z.string().optional(),
  clientRequestId: z.string().optional(),
});
export type UpdateMembershipStatusInput = z.infer<typeof updateMembershipStatusSchema>;

export const assignCustomerPrivilegeSchema = z.object({
  customerId: z.string().min(1),
  privilegeType: z.string().min(1),
  value: z.unknown(),
  reason: z.string().optional(),
  expiresAt: z.string().optional(), // ISO datetime
  clientRequestId: z.string().optional(),
});
export type AssignCustomerPrivilegeInput = z.infer<typeof assignCustomerPrivilegeSchema>;

export const createBillingAccountSchema = z.object({
  name: z.string().min(1).max(200),
  primaryCustomerId: z.string().min(1),
  creditLimitCents: z.number().int().optional().nullable(),
  billingCycle: z.enum(['monthly', 'none']).default('monthly'),
  statementDayOfMonth: z.number().int().min(1).max(28).optional(),
  dueDays: z.number().int().min(0).default(30),
  lateFeePolicyId: z.string().optional(),
  taxExempt: z.boolean().optional(),
  taxExemptCertificateNumber: z.string().optional(),
  authorizationRules: z.record(z.unknown()).optional(),
  billingEmail: z.string().email().optional(),
  billingContactName: z.string().optional(),
  billingAddress: z.string().optional(),
  glArAccountCode: z.string().default('1200'),
  clientRequestId: z.string().optional(),
});
export type CreateBillingAccountInput = z.infer<typeof createBillingAccountSchema>;

export const updateBillingAccountSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  creditLimitCents: z.number().int().optional().nullable(),
  statementDayOfMonth: z.number().int().min(1).max(28).optional().nullable(),
  dueDays: z.number().int().min(0).optional(),
  lateFeePolicyId: z.string().optional().nullable(),
  autoPayEnabled: z.boolean().optional(),
  taxExempt: z.boolean().optional(),
  taxExemptCertificateNumber: z.string().optional().nullable(),
  authorizationRules: z.record(z.unknown()).optional().nullable(),
  billingEmail: z.string().email().optional().nullable(),
  billingContactName: z.string().optional().nullable(),
  billingAddress: z.string().optional().nullable(),
  status: z.enum(['active', 'suspended', 'closed']).optional(),
  collectionStatus: z.enum(['normal', 'reminder_sent', 'final_notice', 'sent_to_collections']).optional(),
  clientRequestId: z.string().optional(),
});
export type UpdateBillingAccountInput = z.infer<typeof updateBillingAccountSchema>;

export const addBillingAccountMemberSchema = z.object({
  billingAccountId: z.string().min(1),
  customerId: z.string().min(1),
  role: z.enum(['authorized', 'dependent', 'employee']),
  chargeAllowed: z.boolean().default(true),
  spendingLimitCents: z.number().int().optional().nullable(),
  clientRequestId: z.string().optional(),
});
export type AddBillingAccountMemberInput = z.infer<typeof addBillingAccountMemberSchema>;

export const recordArTransactionSchema = z.object({
  billingAccountId: z.string().min(1),
  type: z.enum(['charge', 'payment', 'adjustment', 'writeoff']),
  amountCents: z.number().int(),
  dueDate: z.string().optional(),
  customerId: z.string().optional(),
  referenceType: z.string().optional(),
  referenceId: z.string().optional(),
  notes: z.string().optional(),
  clientRequestId: z.string().optional(),
});
export type RecordArTransactionInput = z.infer<typeof recordArTransactionSchema>;

export const recordArPaymentSchema = z.object({
  billingAccountId: z.string().min(1),
  amountCents: z.number().int().positive(),
  notes: z.string().optional(),
  clientRequestId: z.string().optional(),
});
export type RecordArPaymentInput = z.infer<typeof recordArPaymentSchema>;

export const generateStatementSchema = z.object({
  billingAccountId: z.string().min(1),
  periodStart: z.string(), // date string
  periodEnd: z.string(),   // date string
  clientRequestId: z.string().optional(),
});
export type GenerateStatementInput = z.infer<typeof generateStatementSchema>;

// ── Customer Contacts ───────────────────────────────────────────
export const addCustomerContactSchema = z.object({
  customerId: z.string().min(1),
  contactType: z.enum(['email', 'phone', 'address', 'social_media']),
  label: z.string().max(50).optional(),
  value: z.string().min(1),
  isPrimary: z.boolean().default(false),
  clientRequestId: z.string().optional(),
});
export type AddCustomerContactInput = z.infer<typeof addCustomerContactSchema>;

export const updateCustomerContactSchema = z.object({
  contactId: z.string().min(1),
  label: z.string().max(50).optional().nullable(),
  value: z.string().min(1).optional(),
  isPrimary: z.boolean().optional(),
  isVerified: z.boolean().optional(),
});
export type UpdateCustomerContactInput = z.infer<typeof updateCustomerContactSchema>;

// ── Customer Preferences ────────────────────────────────────────
export const setCustomerPreferenceSchema = z.object({
  customerId: z.string().min(1),
  category: z.enum(['food_bev', 'golf', 'retail', 'service', 'facility', 'general', 'dietary']),
  key: z.string().min(1).max(100),
  value: z.string().min(1).max(500),
  source: z.enum(['manual', 'inferred', 'imported']).default('manual'),
  confidence: z.number().min(0).max(1).optional(),
  clientRequestId: z.string().optional(),
});
export type SetCustomerPreferenceInput = z.infer<typeof setCustomerPreferenceSchema>;

export const deleteCustomerPreferenceSchema = z.object({
  customerId: z.string().min(1),
  preferenceId: z.string().min(1),
});
export type DeleteCustomerPreferenceInput = z.infer<typeof deleteCustomerPreferenceSchema>;

// ── Customer Documents ──────────────────────────────────────────
export const addCustomerDocumentSchema = z.object({
  customerId: z.string().min(1),
  documentType: z.enum(['contract', 'waiver', 'id_verification', 'membership_agreement', 'tax_form', 'medical_waiver', 'photo', 'photo_gallery', 'statement', 'other']),
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  storageKey: z.string().min(1),
  mimeType: z.string().min(1),
  sizeBytes: z.number().int().positive(),
  expiresAt: z.string().optional(), // ISO datetime
  clientRequestId: z.string().optional(),
});
export type AddCustomerDocumentInput = z.infer<typeof addCustomerDocumentSchema>;

// ── Customer Communications ─────────────────────────────────────
export const logCustomerCommunicationSchema = z.object({
  customerId: z.string().min(1),
  channel: z.enum(['email', 'sms', 'push', 'in_app', 'phone_call', 'letter']),
  direction: z.enum(['outbound', 'inbound']).default('outbound'),
  subject: z.string().max(500).optional(),
  body: z.string().max(5000).optional(),
  status: z.enum(['queued', 'sent', 'delivered', 'opened', 'clicked', 'bounced', 'failed']).default('sent'),
  metadata: z.record(z.unknown()).optional(),
  clientRequestId: z.string().optional(),
});
export type LogCustomerCommunicationInput = z.input<typeof logCustomerCommunicationSchema>;

// ── Customer Service Flags ──────────────────────────────────────
export const addServiceFlagSchema = z.object({
  customerId: z.string().min(1),
  flagType: z.enum(['vip', 'high_maintenance', 'allergy', 'dietary', 'complaint_history', 'requires_manager', 'celebrity', 'staff_family', 'birthday_today', 'anniversary_today', 'medical_condition', 'accessibility_need']),
  severity: z.enum(['info', 'warning', 'critical']).default('info'),
  notes: z.string().max(1000).optional(),
  expiresAt: z.string().optional(), // ISO datetime
  clientRequestId: z.string().optional(),
});
export type AddServiceFlagInput = z.infer<typeof addServiceFlagSchema>;

export const removeServiceFlagSchema = z.object({
  flagId: z.string().min(1),
});
export type RemoveServiceFlagInput = z.infer<typeof removeServiceFlagSchema>;

// ── Customer Consents ───────────────────────────────────────────
export const recordConsentSchema = z.object({
  customerId: z.string().min(1),
  consentType: z.enum(['marketing_email', 'marketing_sms', 'terms_of_service', 'privacy_policy', 'waiver', 'photo_release', 'data_processing', 'age_verification']),
  status: z.enum(['granted', 'revoked']),
  source: z.enum(['manual', 'web_form', 'in_person', 'imported', 'customer_portal']).default('manual'),
  ipAddress: z.string().optional(),
  documentId: z.string().optional(),
  clientRequestId: z.string().optional(),
});
export type RecordConsentInput = z.infer<typeof recordConsentSchema>;

// ── Customer External IDs ───────────────────────────────────────
export const addExternalIdSchema = z.object({
  customerId: z.string().min(1),
  provider: z.enum(['stripe', 'square', 'toast', 'usga', 'mailchimp', 'hubspot', 'legacy_import', 'ghin', 'club_prophet', 'jonas', 'pms']),
  externalId: z.string().min(1),
  metadata: z.record(z.unknown()).optional(),
  clientRequestId: z.string().optional(),
});
export type AddExternalIdInput = z.infer<typeof addExternalIdSchema>;

// ── Customer Wallet Accounts ────────────────────────────────────
export const createWalletAccountSchema = z.object({
  customerId: z.string().min(1),
  walletType: z.enum(['gift_card', 'loyalty_points', 'credit', 'deposit', 'refund_credit']),
  balanceCents: z.number().int().default(0),
  currency: z.string().default('USD'),
  externalRef: z.string().optional(),
  expiresAt: z.string().optional(), // ISO datetime
  clientRequestId: z.string().optional(),
});
export type CreateWalletAccountInput = z.infer<typeof createWalletAccountSchema>;

export const adjustWalletBalanceSchema = z.object({
  walletAccountId: z.string().min(1),
  amountCents: z.number().int(), // positive = credit, negative = debit
  reason: z.string().max(500).optional(),
  clientRequestId: z.string().optional(),
});
export type AdjustWalletBalanceInput = z.infer<typeof adjustWalletBalanceSchema>;

// ── Customer Alerts ─────────────────────────────────────────────
export const createAlertSchema = z.object({
  customerId: z.string().min(1),
  alertType: z.enum(['balance_overdue', 'membership_expiring', 'vip_arrival', 'allergy', 'payment_failed', 'waiver_expiring', 'birthday', 'custom']),
  severity: z.enum(['info', 'warning', 'critical']).default('info'),
  message: z.string().min(1).max(500),
  expiresAt: z.string().optional(), // ISO datetime
  metadata: z.record(z.unknown()).optional(),
  clientRequestId: z.string().optional(),
});
export type CreateAlertInput = z.infer<typeof createAlertSchema>;

export const dismissAlertSchema = z.object({
  alertId: z.string().min(1),
});
export type DismissAlertInput = z.infer<typeof dismissAlertSchema>;

// ── Customer Households ─────────────────────────────────────────
export const createHouseholdSchema = z.object({
  name: z.string().min(1).max(200),
  householdType: z.enum(['family', 'corporate', 'tournament_group', 'league_team', 'social_group', 'other']),
  primaryCustomerId: z.string().min(1),
  billingAccountId: z.string().optional(),
  clientRequestId: z.string().optional(),
});
export type CreateHouseholdInput = z.infer<typeof createHouseholdSchema>;

export const addHouseholdMemberSchema = z.object({
  householdId: z.string().min(1),
  customerId: z.string().min(1),
  role: z.enum(['primary', 'spouse', 'dependent', 'employee', 'captain', 'member', 'guest']),
  clientRequestId: z.string().optional(),
});
export type AddHouseholdMemberInput = z.infer<typeof addHouseholdMemberSchema>;

export const removeHouseholdMemberSchema = z.object({
  householdId: z.string().min(1),
  customerId: z.string().min(1),
});
export type RemoveHouseholdMemberInput = z.infer<typeof removeHouseholdMemberSchema>;

// ── Customer Visits ─────────────────────────────────────────────
export const recordVisitSchema = z.object({
  customerId: z.string().min(1),
  location: z.enum(['pro_shop', 'restaurant', 'bar', 'course', 'driving_range', 'simulator', 'pool', 'fitness', 'locker_room', 'event_space', 'lobby', 'other']).optional(),
  checkInMethod: z.enum(['manual', 'card_scan', 'rfid', 'qr_code', 'pos_attachment', 'tee_sheet']).default('manual'),
  staffId: z.string().optional(),
  notes: z.string().max(1000).optional(),
  metadata: z.record(z.unknown()).optional(),
  clientRequestId: z.string().optional(),
});
export type RecordVisitInput = z.infer<typeof recordVisitSchema>;

export const checkOutVisitSchema = z.object({
  visitId: z.string().min(1),
});
export type CheckOutVisitInput = z.infer<typeof checkOutVisitSchema>;

// ── Customer Incidents ──────────────────────────────────────────
export const createIncidentSchema = z.object({
  customerId: z.string().min(1),
  incidentType: z.enum(['complaint', 'refund_request', 'injury_report', 'behavioral_issue', 'policy_violation', 'chargeback_dispute', 'property_damage', 'service_failure', 'compliment', 'other']),
  severity: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  subject: z.string().min(1).max(200),
  description: z.string().max(5000).optional(),
  compensationCents: z.number().int().optional(),
  compensationType: z.enum(['credit', 'refund', 'comp_item', 'discount', 'gift_card', 'apology_only', 'none']).optional(),
  staffInvolvedIds: z.array(z.string()).default([]),
  relatedOrderId: z.string().optional(),
  relatedVisitId: z.string().optional(),
  clientRequestId: z.string().optional(),
});
export type CreateIncidentInput = z.infer<typeof createIncidentSchema>;

export const updateIncidentSchema = z.object({
  incidentId: z.string().min(1),
  status: z.enum(['open', 'investigating', 'resolved', 'escalated', 'closed']).optional(),
  resolution: z.string().max(5000).optional(),
  compensationCents: z.number().int().optional(),
  compensationType: z.enum(['credit', 'refund', 'comp_item', 'discount', 'gift_card', 'apology_only', 'none']).optional(),
});
export type UpdateIncidentInput = z.infer<typeof updateIncidentSchema>;

// ── Customer Segments ───────────────────────────────────────────
export const createSegmentSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  segmentType: z.enum(['manual', 'rule_based', 'ai_computed']).default('manual'),
  rules: z.record(z.unknown()).optional(),
  clientRequestId: z.string().optional(),
});
export type CreateSegmentInput = z.infer<typeof createSegmentSchema>;

export const addToSegmentSchema = z.object({
  segmentId: z.string().min(1),
  customerId: z.string().min(1),
  clientRequestId: z.string().optional(),
});
export type AddToSegmentInput = z.infer<typeof addToSegmentSchema>;

export const removeFromSegmentSchema = z.object({
  segmentId: z.string().min(1),
  customerId: z.string().min(1),
});
export type RemoveFromSegmentInput = z.infer<typeof removeFromSegmentSchema>;

// ── Customer 360 — Structured Contact Schemas (Session 1) ────────

const emailTypeEnum = z.enum(['personal', 'billing', 'spouse', 'corporate', 'other']);
const phoneTypeEnum = z.enum(['mobile', 'home', 'work', 'sms', 'other']);
const addressTypeEnum = z.enum(['mailing', 'billing', 'home', 'work', 'seasonal', 'other']);

export const addCustomerEmailSchema = z.object({
  customerId: z.string().min(1),
  email: z.string().email().trim(),
  type: emailTypeEnum.default('personal'),
  isPrimary: z.boolean().default(false),
  canReceiveStatements: z.boolean().default(true),
  canReceiveMarketing: z.boolean().default(false),
  clientRequestId: z.string().optional(),
});
export type AddCustomerEmailInput = z.input<typeof addCustomerEmailSchema>;

export const updateCustomerEmailSchema = z.object({
  emailId: z.string().min(1),
  email: z.string().email().trim().optional(),
  type: emailTypeEnum.optional(),
  isPrimary: z.boolean().optional(),
  canReceiveStatements: z.boolean().optional(),
  canReceiveMarketing: z.boolean().optional(),
});
export type UpdateCustomerEmailInput = z.infer<typeof updateCustomerEmailSchema>;

export const removeCustomerEmailSchema = z.object({
  emailId: z.string().min(1),
});
export type RemoveCustomerEmailInput = z.infer<typeof removeCustomerEmailSchema>;

export const addCustomerPhoneSchema = z.object({
  customerId: z.string().min(1),
  phoneE164: z.string().min(7).max(20).trim(),
  phoneDisplay: z.string().max(30).optional(),
  type: phoneTypeEnum.default('mobile'),
  isPrimary: z.boolean().default(false),
  canReceiveSms: z.boolean().default(false),
  clientRequestId: z.string().optional(),
});
export type AddCustomerPhoneInput = z.input<typeof addCustomerPhoneSchema>;

export const updateCustomerPhoneSchema = z.object({
  phoneId: z.string().min(1),
  phoneE164: z.string().min(7).max(20).trim().optional(),
  phoneDisplay: z.string().max(30).optional().nullable(),
  type: phoneTypeEnum.optional(),
  isPrimary: z.boolean().optional(),
  canReceiveSms: z.boolean().optional(),
});
export type UpdateCustomerPhoneInput = z.infer<typeof updateCustomerPhoneSchema>;

export const removeCustomerPhoneSchema = z.object({
  phoneId: z.string().min(1),
});
export type RemoveCustomerPhoneInput = z.infer<typeof removeCustomerPhoneSchema>;

export const addCustomerAddressSchema = z.object({
  customerId: z.string().min(1),
  type: addressTypeEnum.default('mailing'),
  label: z.string().max(50).optional(),
  line1: z.string().min(1).max(200),
  line2: z.string().max(200).optional(),
  line3: z.string().max(200).optional(),
  city: z.string().min(1).max(100),
  state: z.string().max(50).optional(),
  postalCode: z.string().max(20).optional(),
  county: z.string().max(100).optional(),
  country: z.string().max(2).default('US'),
  isPrimary: z.boolean().default(false),
  seasonalStartMonth: z.number().int().min(1).max(12).optional(),
  seasonalEndMonth: z.number().int().min(1).max(12).optional(),
  clientRequestId: z.string().optional(),
});
export type AddCustomerAddressInput = z.input<typeof addCustomerAddressSchema>;

export const updateCustomerAddressSchema = z.object({
  addressId: z.string().min(1),
  type: addressTypeEnum.optional(),
  label: z.string().max(50).optional().nullable(),
  line1: z.string().min(1).max(200).optional(),
  line2: z.string().max(200).optional().nullable(),
  line3: z.string().max(200).optional().nullable(),
  city: z.string().min(1).max(100).optional(),
  state: z.string().max(50).optional().nullable(),
  postalCode: z.string().max(20).optional().nullable(),
  county: z.string().max(100).optional().nullable(),
  country: z.string().max(2).optional(),
  isPrimary: z.boolean().optional(),
  seasonalStartMonth: z.number().int().min(1).max(12).optional().nullable(),
  seasonalEndMonth: z.number().int().min(1).max(12).optional().nullable(),
});
export type UpdateCustomerAddressInput = z.infer<typeof updateCustomerAddressSchema>;

export const removeCustomerAddressSchema = z.object({
  addressId: z.string().min(1),
});
export type RemoveCustomerAddressInput = z.infer<typeof removeCustomerAddressSchema>;

export const addEmergencyContactSchema = z.object({
  customerId: z.string().min(1),
  name: z.string().min(1).max(200),
  relationship: z.string().max(100).optional(),
  phoneE164: z.string().min(7).max(20),
  phoneDisplay: z.string().max(30).optional(),
  email: z.string().email().optional(),
  notes: z.string().max(500).optional(),
  isPrimary: z.boolean().default(false),
  clientRequestId: z.string().optional(),
});
export type AddEmergencyContactInput = z.input<typeof addEmergencyContactSchema>;

export const updateEmergencyContactSchema = z.object({
  contactId: z.string().min(1),
  name: z.string().min(1).max(200).optional(),
  relationship: z.string().max(100).optional().nullable(),
  phoneE164: z.string().min(7).max(20).optional(),
  phoneDisplay: z.string().max(30).optional().nullable(),
  email: z.string().email().optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
  isPrimary: z.boolean().optional(),
});
export type UpdateEmergencyContactInput = z.infer<typeof updateEmergencyContactSchema>;

export const removeEmergencyContactSchema = z.object({
  contactId: z.string().min(1),
});
export type RemoveEmergencyContactInput = z.infer<typeof removeEmergencyContactSchema>;

export const updateCustomerMemberNumberSchema = z.object({
  customerId: z.string().min(1),
  memberNumber: z.string().min(1).max(50).optional().nullable(),
});
export type UpdateCustomerMemberNumberInput = z.infer<typeof updateCustomerMemberNumberSchema>;

// ── Session 2: Customer Financial Engine ──────────────────────────

const accountTypeEnum = z.enum(['house', 'corporate', 'member', 'group', 'event']);
const billingCycleEnum = z.enum(['monthly', 'quarterly', 'annual', 'none']);
const autopayStrategyEnum = z.enum(['full_balance', 'minimum_due', 'fixed_amount']);
const ledgerAdjustmentTypeEnum = z.enum(['credit_memo', 'manual_charge', 'writeoff', 'adjustment']);
const holdTypeEnum = z.enum(['hold', 'frozen']);

export const createFinancialAccountSchema = z.object({
  customerId: z.string().min(1),
  name: z.string().min(1).max(200),
  accountType: accountTypeEnum.default('house'),
  creditLimitCents: z.number().int().min(0).optional().nullable(),
  billingCycle: billingCycleEnum.default('monthly'),
  dueDays: z.number().int().min(0).default(30),
  billingEmail: z.string().email().optional().nullable(),
  billingContactName: z.string().max(200).optional().nullable(),
  billingAddress: z.string().max(500).optional().nullable(),
  currency: z.string().max(3).default('USD'),
  clientRequestId: z.string().optional(),
});
export type CreateFinancialAccountInput = z.input<typeof createFinancialAccountSchema>;

export const updateFinancialAccountSchema = z.object({
  accountId: z.string().min(1),
  name: z.string().min(1).max(200).optional(),
  status: z.enum(['active', 'suspended', 'closed']).optional(),
  creditLimitCents: z.number().int().min(0).optional().nullable(),
  billingCycle: billingCycleEnum.optional(),
  dueDays: z.number().int().min(0).optional(),
  billingEmail: z.string().email().optional().nullable(),
  autopayStrategy: autopayStrategyEnum.optional().nullable(),
  autopayFixedAmountCents: z.number().int().min(0).optional().nullable(),
  autopayPaymentMethodId: z.string().optional().nullable(),
  clientRequestId: z.string().optional(),
});
export type UpdateFinancialAccountInput = z.input<typeof updateFinancialAccountSchema>;

export const adjustLedgerSchema = z.object({
  billingAccountId: z.string().min(1),
  type: ledgerAdjustmentTypeEnum,
  amountCents: z.number().int(),
  notes: z.string().max(2000).optional(),
  reason: z.string().max(500).optional(),
  approvedBy: z.string().optional(),
  clientRequestId: z.string().optional(),
});
export type AdjustLedgerInput = z.input<typeof adjustLedgerSchema>;

export const transferBetweenAccountsSchema = z.object({
  fromAccountId: z.string().min(1),
  toAccountId: z.string().min(1),
  amountCents: z.number().int().positive(),
  reason: z.string().min(1).max(500),
  clientRequestId: z.string().optional(),
});
export type TransferBetweenAccountsInput = z.input<typeof transferBetweenAccountsSchema>;

export const configureAutopaySchema = z.object({
  accountId: z.string().min(1),
  strategy: autopayStrategyEnum.nullable(),
  fixedAmountCents: z.number().int().min(0).optional().nullable(),
  paymentMethodId: z.string().optional().nullable(),
  clientRequestId: z.string().optional(),
});
export type ConfigureAutopayInput = z.input<typeof configureAutopaySchema>;

export const recordCustomerAuditEntrySchema = z.object({
  customerId: z.string().min(1),
  actionType: z.string().min(1).max(100),
  beforeJson: z.record(z.unknown()).optional().nullable(),
  afterJson: z.record(z.unknown()).optional().nullable(),
  reason: z.string().max(1000).optional(),
});
export type RecordCustomerAuditEntryInput = z.input<typeof recordCustomerAuditEntrySchema>;

export const placeFinancialHoldSchema = z.object({
  accountId: z.string().min(1),
  holdType: holdTypeEnum,
  reason: z.string().min(1).max(500),
  clientRequestId: z.string().optional(),
});
export type PlaceFinancialHoldInput = z.input<typeof placeFinancialHoldSchema>;

export const liftFinancialHoldSchema = z.object({
  accountId: z.string().min(1),
  reason: z.string().min(1).max(500),
  clientRequestId: z.string().optional(),
});
export type LiftFinancialHoldInput = z.input<typeof liftFinancialHoldSchema>;

export const updateCreditLimitSchema = z.object({
  accountId: z.string().min(1),
  newCreditLimitCents: z.number().int().min(0),
  reason: z.string().min(1).max(500),
  approvedBy: z.string().optional(),
  clientRequestId: z.string().optional(),
});
export type UpdateCreditLimitInput = z.input<typeof updateCreditLimitSchema>;

// ── Session 3: Activity + Communication + Relationships + Documents ──

export const sendCustomerMessageSchema = z.object({
  customerId: z.string().min(1),
  channel: z.enum(['internal_note', 'chat', 'email', 'sms', 'statement']),
  direction: z.enum(['inbound', 'outbound', 'system']).default('outbound'),
  subject: z.string().max(500).optional(),
  body: z.string().min(1).max(10000),
  metaJson: z.record(z.unknown()).optional(),
  clientRequestId: z.string().optional(),
});
export type SendCustomerMessageInput = z.input<typeof sendCustomerMessageSchema>;

export const addCustomerNoteV2Schema = z.object({
  customerId: z.string().min(1),
  content: z.string().min(1).max(5000),
  isPinned: z.boolean().default(false),
  visibility: z.enum(['internal', 'shared', 'customer_visible']).default('internal'),
  clientRequestId: z.string().optional(),
});
export type AddCustomerNoteV2Input = z.input<typeof addCustomerNoteV2Schema>;

export const updateCustomerNoteSchema = z.object({
  noteId: z.string().min(1),
  content: z.string().min(1).max(5000).optional(),
  isPinned: z.boolean().optional(),
  visibility: z.enum(['internal', 'shared', 'customer_visible']).optional(),
});
export type UpdateCustomerNoteInput = z.infer<typeof updateCustomerNoteSchema>;

export const removeCustomerNoteSchema = z.object({
  noteId: z.string().min(1),
});
export type RemoveCustomerNoteInput = z.infer<typeof removeCustomerNoteSchema>;

export const updateRelationshipSchema = z.object({
  relationshipId: z.string().min(1),
  isPrimary: z.boolean().optional(),
  effectiveDate: z.string().optional().nullable(),
  expirationDate: z.string().optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});
export type UpdateRelationshipInput = z.infer<typeof updateRelationshipSchema>;

export const removeRelationshipSchema = z.object({
  relationshipId: z.string().min(1),
});
export type RemoveRelationshipInput = z.infer<typeof removeRelationshipSchema>;

export const uploadCustomerFileSchema = z.object({
  customerId: z.string().min(1),
  documentType: z.enum(['contract', 'waiver', 'id_verification', 'membership_agreement', 'tax_form', 'medical_waiver', 'photo', 'photo_gallery', 'statement', 'other']),
  name: z.string().min(1).max(200),
  storageKey: z.string().min(1),
  mimeType: z.string().min(1),
  sizeBytes: z.number().int().positive(),
  description: z.string().max(1000).optional(),
  tagsJson: z.array(z.string()).optional(),
  expiresAt: z.string().optional(),
  clientRequestId: z.string().optional(),
});
export type UploadCustomerFileInput = z.input<typeof uploadCustomerFileSchema>;

export const deleteCustomerFileSchema = z.object({
  documentId: z.string().min(1),
});
export type DeleteCustomerFileInput = z.infer<typeof deleteCustomerFileSchema>;

// ── Session 4: Stored Value + Discounts ───────────────────────────

const instrumentTypeEnum = z.enum([
  'gift_card', 'credit_book', 'raincheck', 'range_card',
  'rounds_card', 'prepaid_balance', 'punchcard', 'award',
]);
export const issueStoredValueSchema = z.object({
  customerId: z.string().optional(),
  instrumentType: instrumentTypeEnum,
  code: z.string().min(1).max(50),
  initialValueCents: z.number().int().min(0).default(0),
  unitCount: z.number().int().positive().optional(),
  liabilityGlAccountId: z.string().optional(),
  description: z.string().max(500).optional(),
  expiresAt: z.string().optional(),
  metaJson: z.record(z.unknown()).optional(),
  clientRequestId: z.string().optional(),
});
export type IssueStoredValueInput = z.input<typeof issueStoredValueSchema>;

export const redeemStoredValueSchema = z.object({
  instrumentId: z.string().min(1),
  amountCents: z.number().int().positive(),
  unitDelta: z.number().int().optional(),
  sourceModule: z.string().optional(),
  sourceId: z.string().optional(),
  reason: z.string().max(500).optional(),
  clientRequestId: z.string().optional(),
});
export type RedeemStoredValueInput = z.input<typeof redeemStoredValueSchema>;

export const reloadStoredValueSchema = z.object({
  instrumentId: z.string().min(1),
  amountCents: z.number().int().positive(),
  unitDelta: z.number().int().optional(),
  reason: z.string().max(500).optional(),
  clientRequestId: z.string().optional(),
});
export type ReloadStoredValueInput = z.input<typeof reloadStoredValueSchema>;

export const transferStoredValueSchema = z.object({
  sourceInstrumentId: z.string().min(1),
  targetInstrumentId: z.string().min(1),
  amountCents: z.number().int().positive(),
  approvedBy: z.string().min(1), // PIN required
  reason: z.string().max(500).optional(),
  clientRequestId: z.string().optional(),
});
export type TransferStoredValueInput = z.input<typeof transferStoredValueSchema>;

export const voidStoredValueSchema = z.object({
  instrumentId: z.string().min(1),
  approvedBy: z.string().min(1), // PIN required
  reason: z.string().max(500).optional(),
  clientRequestId: z.string().optional(),
});
export type VoidStoredValueInput = z.input<typeof voidStoredValueSchema>;

// ── Discount Rules ───────────────────────────────────────────────

export const createDiscountRuleSchema = z.object({
  scopeType: z.enum(['global', 'membership_class', 'customer', 'segment']).default('global'),
  customerId: z.string().optional(),
  membershipClassId: z.string().optional(),
  segmentId: z.string().optional(),
  priority: z.number().int().min(1).max(9999).default(100),
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  effectiveDate: z.string().optional(),
  expirationDate: z.string().optional(),
  ruleJson: z.object({
    conditions: z.array(z.record(z.unknown())),
    actions: z.array(z.record(z.unknown())),
    maxUsesPerPeriod: z.number().int().optional(),
    maxUsesPerCustomer: z.number().int().optional(),
    stackable: z.boolean().default(true),
  }),
  clientRequestId: z.string().optional(),
});
export type CreateDiscountRuleInput = z.input<typeof createDiscountRuleSchema>;

export const updateDiscountRuleSchema = z.object({
  ruleId: z.string().min(1),
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).optional(),
  priority: z.number().int().min(1).max(9999).optional(),
  effectiveDate: z.string().optional().nullable(),
  expirationDate: z.string().optional().nullable(),
  ruleJson: z.object({
    conditions: z.array(z.record(z.unknown())),
    actions: z.array(z.record(z.unknown())),
    maxUsesPerPeriod: z.number().int().optional(),
    maxUsesPerCustomer: z.number().int().optional(),
    stackable: z.boolean().optional(),
  }).optional(),
});
export type UpdateDiscountRuleInput = z.infer<typeof updateDiscountRuleSchema>;

export const toggleDiscountRuleSchema = z.object({
  ruleId: z.string().min(1),
  isActive: z.boolean(),
});
export type ToggleDiscountRuleInput = z.infer<typeof toggleDiscountRuleSchema>;

// ── CSV Import Schemas ──────────────────────────────────────────

export const detectColumnsSchema = z.object({
  csvContent: z.string().min(1, 'CSV content is required'),
});
export type DetectColumnsInput = z.infer<typeof detectColumnsSchema>;

export const validateImportSchema = z.object({
  csvContent: z.string().min(1),
  mappings: z.array(z.object({
    sourceHeader: z.string(),
    targetField: z.string().nullable(),
    confidence: z.number().min(0).max(100),
    method: z.enum(['alias', 'ai', 'manual', 'unmapped']),
    reasoning: z.string().nullable().optional(),
  })),
  transforms: z.array(z.object({
    type: z.enum(['split_name', 'split_address']),
    sourceHeader: z.string(),
  })).optional().default([]),
});
export type ValidateImportInput = z.infer<typeof validateImportSchema>;

export const executeImportSchema = z.object({
  csvContent: z.string().min(1),
  mappings: z.array(z.object({
    sourceHeader: z.string(),
    targetField: z.string().nullable(),
    confidence: z.number().min(0).max(100),
    method: z.enum(['alias', 'ai', 'manual', 'unmapped']),
    reasoning: z.string().nullable().optional(),
  })),
  transforms: z.array(z.object({
    type: z.enum(['split_name', 'split_address']),
    sourceHeader: z.string(),
  })).optional().default([]),
  duplicateResolutions: z.record(z.string(), z.enum(['skip', 'update', 'create_new'])).optional().default({}),
  fileName: z.string().min(1),
  fileSizeBytes: z.number().optional(),
});

// ── Tag Management ──────────────────────────────────────────────────────────

export const createTagSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).max(100).optional(),
  description: z.string().max(500).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#6366f1'),
  icon: z.string().max(50).optional(),
  tagType: z.enum(['manual', 'smart']).default('manual'),
  category: z.enum(['behavior', 'lifecycle', 'demographic', 'operational']).optional(),
  displayOrder: z.number().int().min(0).default(0),
  metadata: z.record(z.unknown()).optional(),
  clientRequestId: z.string().optional(),
});
export type CreateTagInput = z.input<typeof createTagSchema>;

export const updateTagSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional().nullable(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  icon: z.string().max(50).optional().nullable(),
  category: z.enum(['behavior', 'lifecycle', 'demographic', 'operational']).optional().nullable(),
  displayOrder: z.number().int().min(0).optional(),
  metadata: z.record(z.unknown()).optional(),
});
export type UpdateTagInput = z.input<typeof updateTagSchema>;

export const archiveTagSchema = z.object({
  reason: z.string().max(500).optional(),
});
export type ArchiveTagInput = z.input<typeof archiveTagSchema>;

export const applyTagToCustomerSchema = z.object({
  tagId: z.string().min(1),
  expiresAt: z.string().optional(),
  clientRequestId: z.string().optional(),
});
export type ApplyTagToCustomerInput = z.input<typeof applyTagToCustomerSchema>;

export const removeTagFromCustomerSchema = z.object({
  reason: z.string().max(500).optional(),
});
export type RemoveTagFromCustomerInput = z.input<typeof removeTagFromCustomerSchema>;

const smartTagConditionSchema = z.object({
  metric: z.string().min(1),
  operator: z.enum(['gt', 'gte', 'lt', 'lte', 'eq', 'neq', 'between', 'in', 'not_in', 'contains', 'is_null', 'is_not_null']),
  value: z.union([z.number(), z.string(), z.boolean(), z.array(z.string()), z.tuple([z.number(), z.number()])]),
  unit: z.string().optional(),
});

const smartTagConditionGroupSchema = z.object({
  conditions: z.array(smartTagConditionSchema).min(1),
});

export const createSmartTagRuleSchema = z.object({
  tagId: z.string().min(1),
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  evaluationMode: z.enum(['scheduled', 'event_driven', 'hybrid']).default('scheduled'),
  scheduleCron: z.string().max(50).optional(),
  conditions: z.array(smartTagConditionGroupSchema).min(1),
  autoRemove: z.boolean().default(true),
  cooldownHours: z.number().int().min(0).optional(),
  priority: z.number().int().min(1).max(9999).default(100),
  clientRequestId: z.string().optional(),
});
export type CreateSmartTagRuleInput = z.input<typeof createSmartTagRuleSchema>;

export const updateSmartTagRuleSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).optional().nullable(),
  evaluationMode: z.enum(['scheduled', 'event_driven', 'hybrid']).optional(),
  scheduleCron: z.string().max(50).optional().nullable(),
  conditions: z.array(smartTagConditionGroupSchema).min(1).optional(),
  autoRemove: z.boolean().optional(),
  cooldownHours: z.number().int().min(0).optional().nullable(),
  priority: z.number().int().min(1).max(9999).optional(),
});
export type UpdateSmartTagRuleInput = z.input<typeof updateSmartTagRuleSchema>;

export const toggleSmartTagRuleSchema = z.object({
  isActive: z.boolean(),
});
export type ToggleSmartTagRuleInput = z.input<typeof toggleSmartTagRuleSchema>;
