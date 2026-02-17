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
export type LogCustomerCommunicationInput = z.infer<typeof logCustomerCommunicationSchema>;

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
  provider: z.enum(['stripe', 'square', 'toast', 'usga', 'mailchimp', 'hubspot', 'legacy_import', 'ghin', 'club_prophet', 'jonas']),
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
