import { z } from 'zod';

// ── Constants ──────────────────────────────────────────────────

export const SERVICE_CATEGORIES = ['massage', 'facial', 'body', 'nail', 'hair', 'wellness', 'medspa', 'other'] as const;
export const EMPLOYMENT_TYPES = ['full_time', 'part_time', 'contractor', 'booth_rent'] as const;
export const PROFICIENCY_LEVELS = ['trainee', 'standard', 'advanced', 'master'] as const;
export const RESOURCE_TYPES = ['room', 'equipment', 'bed', 'chair', 'other'] as const;
export const APPOINTMENT_STATUSES = ['draft', 'reserved', 'confirmed', 'checked_in', 'in_service', 'completed', 'checked_out', 'canceled', 'no_show'] as const;
export const BOOKING_SOURCES = ['front_desk', 'online', 'phone', 'mobile_app', 'kiosk', 'walk_in', 'pms'] as const;
export const DEPOSIT_STATUSES = ['none', 'required', 'authorized', 'captured', 'refunded'] as const;
export const FLEXIBILITY_OPTIONS = ['exact', 'flexible_time', 'flexible_date', 'any'] as const;
export const WAITLIST_STATUSES = ['waiting', 'offered', 'booked', 'expired', 'canceled'] as const;
export const COMMISSION_TYPES = ['percentage', 'flat', 'tiered', 'sliding_scale'] as const;
export const COMMISSION_APPLIES_TO = ['service', 'retail', 'addon', 'tip', 'all'] as const;
export const PACKAGE_TYPES = ['session_bundle', 'credit_bundle', 'time_bundle', 'value_bundle'] as const;
export const PACKAGE_STATUSES = ['active', 'frozen', 'expired', 'exhausted', 'canceled'] as const;
export const FORM_TYPES = ['intake', 'consent', 'medical_history', 'covid', 'waiver', 'custom'] as const;
export const NOTE_TYPES = ['soap', 'progress', 'general', 'contraindication'] as const;
export const SEVERITY_LEVELS = ['mild', 'moderate', 'severe'] as const;
export const TASK_TYPES = ['cleanup', 'setup', 'inspection', 'restock'] as const;
export const TASK_STATUSES = ['pending', 'in_progress', 'completed', 'skipped'] as const;
export const TIME_OFF_STATUS = ['pending', 'approved', 'rejected'] as const;

const dollarAmountRegex = /^\d+(\.\d{1,2})?$/;
const timeRegex = /^\d{2}:\d{2}$/;

// ── Service Schemas ──────────────────────────────────────────

export const createServiceSchema = z.object({
  clientRequestId: z.string().optional(),
  categoryId: z.string().optional(),
  name: z.string().min(1).max(200),
  displayName: z.string().max(200).optional(),
  description: z.string().max(2000).optional(),
  category: z.enum(SERVICE_CATEGORIES),
  durationMinutes: z.number().int().min(5).max(480),
  bufferMinutes: z.number().int().min(0).max(120).default(0),
  cleanupMinutes: z.number().int().min(0).max(120).default(0),
  setupMinutes: z.number().int().min(0).max(120).default(0),
  price: z.string().regex(dollarAmountRegex, 'Must be dollar amount'),
  memberPrice: z.string().regex(dollarAmountRegex).optional(),
  peakPrice: z.string().regex(dollarAmountRegex).optional(),
  cost: z.string().regex(dollarAmountRegex).optional(),
  maxCapacity: z.number().int().min(1).max(50).default(1),
  isCouples: z.boolean().default(false),
  isGroup: z.boolean().default(false),
  minGroupSize: z.number().int().min(2).optional(),
  maxGroupSize: z.number().int().max(50).optional(),
  requiresIntake: z.boolean().default(false),
  requiresConsent: z.boolean().default(false),
  contraindications: z.array(z.string()).optional(),
  preparationInstructions: z.string().max(2000).optional(),
  aftercareInstructions: z.string().max(2000).optional(),
  catalogItemId: z.string().optional(),
  imageUrl: z.string().url().optional(),
  sortOrder: z.number().int().default(0),
});
export type CreateServiceInput = z.input<typeof createServiceSchema>;

export const updateServiceSchema = createServiceSchema.partial().extend({
  id: z.string(),
  expectedVersion: z.number().int().optional(),
});
export type UpdateServiceInput = z.input<typeof updateServiceSchema>;

export const createServiceCategorySchema = z.object({
  clientRequestId: z.string().optional(),
  name: z.string().min(1).max(100),
  parentId: z.string().optional(),
  description: z.string().max(500).optional(),
  icon: z.string().max(50).optional(),
  sortOrder: z.number().int().default(0),
});
export type CreateServiceCategoryInput = z.input<typeof createServiceCategorySchema>;

export const updateServiceCategorySchema = createServiceCategorySchema.partial().extend({
  id: z.string(),
});
export type UpdateServiceCategoryInput = z.input<typeof updateServiceCategorySchema>;

export const createAddonSchema = z.object({
  clientRequestId: z.string().optional(),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  durationMinutes: z.number().int().min(5).max(120),
  price: z.string().regex(dollarAmountRegex),
  memberPrice: z.string().regex(dollarAmountRegex).optional(),
  isStandalone: z.boolean().default(false),
  sortOrder: z.number().int().default(0),
});
export type CreateAddonInput = z.input<typeof createAddonSchema>;

export const updateAddonSchema = createAddonSchema.partial().extend({
  id: z.string(),
});
export type UpdateAddonInput = z.input<typeof updateAddonSchema>;

export const linkAddonToServiceSchema = z.object({
  serviceId: z.string(),
  addonId: z.string(),
  isDefault: z.boolean().default(false),
  priceOverride: z.string().regex(dollarAmountRegex).optional(),
});
export type LinkAddonToServiceInput = z.input<typeof linkAddonToServiceSchema>;

// ── Provider Schemas ──────────────────────────────────────────

export const createProviderSchema = z.object({
  clientRequestId: z.string().optional(),
  userId: z.string(),
  displayName: z.string().min(1).max(200),
  bio: z.string().max(2000).optional(),
  photoUrl: z.string().url().optional(),
  specialties: z.array(z.string()).optional(),
  certifications: z.array(z.object({
    name: z.string(),
    issuer: z.string().optional(),
    expiresAt: z.string().optional(),
  })).optional(),
  hireDate: z.string().optional(),
  employmentType: z.enum(EMPLOYMENT_TYPES).default('full_time'),
  isBookableOnline: z.boolean().default(true),
  acceptNewClients: z.boolean().default(true),
  maxDailyAppointments: z.number().int().min(1).max(50).optional(),
  breakDurationMinutes: z.number().int().min(0).max(120).default(30),
  color: z.string().max(20).optional(),
  sortOrder: z.number().int().default(0),
});
export type CreateProviderInput = z.input<typeof createProviderSchema>;

export const updateProviderSchema = createProviderSchema.partial().extend({
  id: z.string(),
});
export type UpdateProviderInput = z.input<typeof updateProviderSchema>;

export const providerAvailabilitySlotSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  startTime: z.string().regex(timeRegex),
  endTime: z.string().regex(timeRegex),
  locationId: z.string().optional(),
});
export type ProviderAvailabilitySlot = z.infer<typeof providerAvailabilitySlotSchema>;

export const setProviderAvailabilitySchema = z.object({
  providerId: z.string(),
  effectiveFrom: z.string(),
  effectiveUntil: z.string().optional(),
  slots: z.array(providerAvailabilitySlotSchema).min(1),
});
export type SetProviderAvailabilityInput = z.infer<typeof setProviderAvailabilitySchema>;

export const createProviderTimeOffSchema = z.object({
  clientRequestId: z.string().optional(),
  providerId: z.string(),
  startAt: z.string(),
  endAt: z.string(),
  reason: z.string().max(500).optional(),
  isAllDay: z.boolean().default(false),
});
export type CreateProviderTimeOffInput = z.input<typeof createProviderTimeOffSchema>;

export const setProviderServiceEligibilitySchema = z.object({
  providerId: z.string(),
  eligibilities: z.array(z.object({
    serviceId: z.string(),
    proficiencyLevel: z.enum(PROFICIENCY_LEVELS).default('standard'),
    customDurationMinutes: z.number().int().min(5).optional(),
    customPrice: z.string().regex(dollarAmountRegex).optional(),
  })),
});
export type SetProviderServiceEligibilityInput = z.input<typeof setProviderServiceEligibilitySchema>;

// ── Resource Schemas ──────────────────────────────────────────

export const createResourceSchema = z.object({
  clientRequestId: z.string().optional(),
  name: z.string().min(1).max(200),
  resourceType: z.enum(RESOURCE_TYPES),
  description: z.string().max(2000).optional(),
  capacity: z.number().int().min(1).max(50).default(1),
  locationId: z.string().optional(),
  bufferMinutes: z.number().int().min(0).max(120).default(0),
  cleanupMinutes: z.number().int().min(0).max(120).default(0),
  amenities: z.array(z.string()).optional(),
  photoUrl: z.string().url().optional(),
  sortOrder: z.number().int().default(0),
});
export type CreateResourceInput = z.input<typeof createResourceSchema>;

export const updateResourceSchema = createResourceSchema.partial().extend({
  id: z.string(),
});
export type UpdateResourceInput = z.input<typeof updateResourceSchema>;

// ── Appointment Schemas ──────────────────────────────────────────

export const appointmentItemSchema = z.object({
  serviceId: z.string(),
  addonId: z.string().optional(),
  providerId: z.string().optional(),
  resourceId: z.string().optional(),
  startAt: z.string(),
  endAt: z.string(),
  priceCents: z.number().int().min(0),
  memberPriceCents: z.number().int().min(0).optional(),
  finalPriceCents: z.number().int().min(0),
  discountAmountCents: z.number().int().min(0).default(0),
  discountReason: z.string().optional(),
  packageBalanceId: z.string().optional(),
  notes: z.string().max(1000).optional(),
});
export type AppointmentItemInput = z.input<typeof appointmentItemSchema>;

export const createAppointmentSchema = z.object({
  clientRequestId: z.string().optional(),
  customerId: z.string().optional(),
  guestName: z.string().max(200).optional(),
  guestEmail: z.string().email().optional(),
  guestPhone: z.string().max(30).optional(),
  locationId: z.string(),
  providerId: z.string().optional(),
  resourceId: z.string().optional(),
  startAt: z.string(),
  endAt: z.string(),
  bookingSource: z.enum(BOOKING_SOURCES).default('front_desk'),
  bookingChannel: z.string().optional(),
  notes: z.string().max(2000).optional(),
  internalNotes: z.string().max(2000).optional(),
  items: z.array(appointmentItemSchema).min(1),
  recurrenceRule: z.record(z.unknown()).optional(),
}).refine(
  (data) => data.customerId || data.guestName,
  { message: 'Either customerId or guestName is required' }
);
export type CreateAppointmentInput = z.input<typeof createAppointmentSchema>;

export const updateAppointmentSchema = z.object({
  id: z.string(),
  expectedVersion: z.number().int().optional(),
  providerId: z.string().optional(),
  resourceId: z.string().optional(),
  startAt: z.string().optional(),
  endAt: z.string().optional(),
  notes: z.string().max(2000).optional(),
  internalNotes: z.string().max(2000).optional(),
  items: z.array(appointmentItemSchema).optional(),
});
export type UpdateAppointmentInput = z.infer<typeof updateAppointmentSchema>;

export const rescheduleAppointmentSchema = z.object({
  id: z.string(),
  expectedVersion: z.number().int().optional(),
  newStartAt: z.string(),
  newEndAt: z.string(),
  newProviderId: z.string().optional(),
  newResourceId: z.string().optional(),
  reason: z.string().max(500).optional(),
});
export type RescheduleAppointmentInput = z.infer<typeof rescheduleAppointmentSchema>;

export const cancelAppointmentSchema = z.object({
  id: z.string(),
  expectedVersion: z.number().int().optional(),
  reason: z.string().max(500).optional(),
  chargeCancellationFee: z.boolean().default(false),
  waiveFee: z.boolean().default(false),
});
export type CancelAppointmentInput = z.input<typeof cancelAppointmentSchema>;

// ── Settings Schemas ──────────────────────────────────────────

export const updateSpaSettingsSchema = z.object({
  locationId: z.string().optional(),
  timezone: z.string().optional(),
  dayCloseTime: z.string().regex(timeRegex).optional(),
  defaultCurrency: z.string().length(3).optional(),
  taxInclusive: z.boolean().optional(),
  defaultBufferMinutes: z.number().int().min(0).max(120).optional(),
  defaultCleanupMinutes: z.number().int().min(0).max(120).optional(),
  defaultSetupMinutes: z.number().int().min(0).max(120).optional(),
  onlineBookingEnabled: z.boolean().optional(),
  waitlistEnabled: z.boolean().optional(),
  autoAssignProvider: z.boolean().optional(),
  rebookingWindowDays: z.number().int().min(1).max(365).optional(),
  notificationPreferences: z.record(z.unknown()).optional(),
  depositRules: z.record(z.unknown()).optional(),
  cancellationDefaults: z.record(z.unknown()).optional(),
  enterpriseMode: z.boolean().optional(),
});
export type UpdateSpaSettingsInput = z.infer<typeof updateSpaSettingsSchema>;

// ── Waitlist Schemas ──────────────────────────────────────────

export const addToWaitlistSchema = z.object({
  clientRequestId: z.string().optional(),
  customerId: z.string(),
  serviceId: z.string(),
  preferredProviderId: z.string().optional(),
  preferredDate: z.string().optional(),
  preferredTimeStart: z.string().regex(timeRegex).optional(),
  preferredTimeEnd: z.string().regex(timeRegex).optional(),
  flexibility: z.enum(FLEXIBILITY_OPTIONS).default('flexible_time'),
  priority: z.number().int().min(0).max(10).default(0),
  notes: z.string().max(500).optional(),
  expiresAt: z.string().optional(),
});
export type AddToWaitlistInput = z.input<typeof addToWaitlistSchema>;

// ── Commission Schemas ──────────────────────────────────────────

export const commissionTierSchema = z.object({
  threshold: z.number().min(0),
  rate: z.number().min(0).max(100),
});
export type CommissionTier = z.infer<typeof commissionTierSchema>;

export const createCommissionRuleSchema = z.object({
  clientRequestId: z.string().optional(),
  name: z.string().min(1).max(200),
  providerId: z.string().optional(),
  serviceId: z.string().optional(),
  serviceCategory: z.string().optional(),
  commissionType: z.enum(COMMISSION_TYPES),
  rate: z.number().min(0).max(100).optional(),
  flatAmount: z.string().regex(dollarAmountRegex).optional(),
  tiers: z.array(commissionTierSchema).optional(),
  appliesTo: z.enum(COMMISSION_APPLIES_TO).default('service'),
  effectiveFrom: z.string(),
  effectiveUntil: z.string().optional(),
  priority: z.number().int().default(0),
});
export type CreateCommissionRuleInput = z.input<typeof createCommissionRuleSchema>;

export const updateCommissionRuleSchema = createCommissionRuleSchema.partial().extend({
  id: z.string(),
});
export type UpdateCommissionRuleInput = z.input<typeof updateCommissionRuleSchema>;

// ── Package Schemas ──────────────────────────────────────────

export const packageServiceSchema = z.object({
  serviceId: z.string(),
  quantity: z.number().int().min(1),
});
export type PackageService = z.infer<typeof packageServiceSchema>;

export const createPackageDefinitionSchema = z.object({
  clientRequestId: z.string().optional(),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  packageType: z.enum(PACKAGE_TYPES),
  includedServices: z.array(packageServiceSchema).optional(),
  totalSessions: z.number().int().min(1).optional(),
  totalCredits: z.string().regex(dollarAmountRegex).optional(),
  totalValueCents: z.number().int().min(0).optional(),
  sellingPriceCents: z.number().int().min(0),
  validityDays: z.number().int().min(1).max(3650),
  isTransferable: z.boolean().default(false),
  isShareable: z.boolean().default(false),
  maxShares: z.number().int().min(1).max(10).default(1),
  autoRenew: z.boolean().default(false),
  renewalPriceCents: z.number().int().min(0).optional(),
  freezeAllowed: z.boolean().default(false),
  maxFreezeDays: z.number().int().min(0).optional(),
  sortOrder: z.number().int().default(0),
});
export type CreatePackageDefinitionInput = z.input<typeof createPackageDefinitionSchema>;

export const updatePackageDefinitionSchema = createPackageDefinitionSchema.partial().extend({
  id: z.string(),
});
export type UpdatePackageDefinitionInput = z.input<typeof updatePackageDefinitionSchema>;

// ── Intake Schemas ──────────────────────────────────────────

export const intakeFieldSchema = z.object({
  fieldId: z.string(),
  label: z.string(),
  type: z.enum(['text', 'textarea', 'select', 'multiselect', 'checkbox', 'radio', 'date', 'number', 'signature', 'file']),
  required: z.boolean().default(false),
  options: z.array(z.string()).optional(),
  placeholder: z.string().optional(),
  validation: z.record(z.unknown()).optional(),
});
export type IntakeField = z.input<typeof intakeFieldSchema>;

export const createIntakeFormTemplateSchema = z.object({
  clientRequestId: z.string().optional(),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  formType: z.enum(FORM_TYPES),
  fields: z.array(intakeFieldSchema).min(1),
  requiredForServices: z.union([z.literal('all'), z.array(z.string())]).optional(),
  isRequired: z.boolean().default(false),
});
export type CreateIntakeFormTemplateInput = z.input<typeof createIntakeFormTemplateSchema>;

export const submitIntakeResponseSchema = z.object({
  clientRequestId: z.string().optional(),
  templateId: z.string(),
  customerId: z.string(),
  appointmentId: z.string().optional(),
  responses: z.record(z.unknown()),
  signatureData: z.string().optional(),
});
export type SubmitIntakeResponseInput = z.infer<typeof submitIntakeResponseSchema>;

// ── Booking Widget Schemas ──────────────────────────────────────────

// Per-webapp customization JSONB sub-schemas
const businessIdentitySchema = z.object({
  businessName: z.string().max(200).optional(),
  tagline: z.string().max(300).optional(),
  description: z.string().max(2000).optional(),
  email: z.string().email().max(254).optional(),
  phone: z.string().max(30).optional(),
  website: z.string().url().max(2083).optional(),
}).optional();

const contactLocationSchema = z.object({
  addressLine1: z.string().max(200).optional(),
  addressLine2: z.string().max(200).optional(),
  city: z.string().max(100).optional(),
  state: z.string().max(100).optional(),
  postalCode: z.string().max(20).optional(),
  country: z.string().max(100).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  directionsUrl: z.string().url().max(2083).optional(),
  parkingInfo: z.string().max(500).optional(),
  accessibilityInfo: z.string().max(500).optional(),
}).optional();

const brandingSchema = z.object({
  faviconUrl: z.string().url().max(2083).optional(),
  bannerImageUrl: z.string().url().max(2083).optional(),
  primaryColor: z.string().max(20).optional(),
  secondaryColor: z.string().max(20).optional(),
  backgroundColor: z.string().max(20).optional(),
  textColor: z.string().max(20).optional(),
  fontFamily: z.string().max(100).optional(),
  buttonStyle: z.enum(['rounded', 'square', 'pill']).optional(),
  headerLayout: z.enum(['centered', 'left-aligned']).optional(),
}).optional();

const operationalSchema = z.object({
  timezoneDisplay: z.string().max(50).optional(),
  hoursOfOperation: z.array(z.object({
    day: z.enum(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']),
    periods: z.array(z.object({
      open: z.string().max(10),
      close: z.string().max(10),
    })),
  })).optional(),
  holidayNotice: z.string().max(500).optional(),
  specialInstructions: z.string().max(1000).optional(),
  healthSafetyNotice: z.string().max(1000).optional(),
}).optional();

const legalSchema = z.object({
  privacyPolicyUrl: z.string().url().max(2083).optional(),
  termsOfServiceUrl: z.string().url().max(2083).optional(),
  cancellationPolicyText: z.string().max(2000).optional(),
  consentCheckboxText: z.string().max(500).optional(),
  accessibilityStatementUrl: z.string().url().max(2083).optional(),
}).optional();

const seoSchema = z.object({
  metaTitle: z.string().max(200).optional(),
  metaDescription: z.string().max(500).optional(),
  ogImage: z.string().url().max(2083).optional(),
  canonicalUrl: z.string().url().max(2083).optional(),
}).optional();

export const updateBookingWidgetConfigSchema = z.object({
  locationId: z.string().optional(),
  theme: z.record(z.unknown()).optional(),
  logoUrl: z.string().url().optional(),
  welcomeMessage: z.string().max(500).optional(),
  bookingLeadTimeHours: z.number().int().min(0).max(168).optional(),
  maxAdvanceBookingDays: z.number().int().min(1).max(365).optional(),
  requireDeposit: z.boolean().optional(),
  depositType: z.enum(['percentage', 'flat']).optional(),
  depositValue: z.string().regex(dollarAmountRegex).optional(),
  cancellationWindowHours: z.number().int().min(0).max(168).optional(),
  cancellationFeeType: z.enum(['percentage', 'flat', 'none']).optional(),
  cancellationFeeValue: z.string().regex(dollarAmountRegex).optional(),
  showPrices: z.boolean().optional(),
  showProviderPhotos: z.boolean().optional(),
  allowProviderSelection: z.boolean().optional(),
  allowAddonSelection: z.boolean().optional(),
  customCss: z.string().max(10000).optional(),
  redirectUrl: z.string().url().optional(),
  // Per-webapp customization JSONB fields
  businessIdentity: businessIdentitySchema,
  contactLocation: contactLocationSchema,
  branding: brandingSchema,
  operational: operationalSchema,
  legal: legalSchema,
  seo: seoSchema,
  clientRequestId: z.string().optional(),
});
export type UpdateBookingWidgetConfigInput = z.infer<typeof updateBookingWidgetConfigSchema>;

// ── Availability Query Schemas ──────────────────────────────────────────

export const availabilityQuerySchema = z.object({
  serviceId: z.string(),
  locationId: z.string(),
  date: z.string(),
  providerId: z.string().optional(),
  resourceId: z.string().optional(),
  partySize: z.number().int().min(1).max(50).default(1),
});
export type AvailabilityQueryInput = z.input<typeof availabilityQuerySchema>;

// ── List Filters ──────────────────────────────────────────

export const serviceListFilterSchema = z.object({
  category: z.string().optional(),
  categoryId: z.string().optional(),
  isActive: z.boolean().optional(),
  isCouples: z.boolean().optional(),
  isGroup: z.boolean().optional(),
  search: z.string().optional(),
  minPrice: z.string().optional(),
  maxPrice: z.string().optional(),
  minDuration: z.number().int().optional(),
  maxDuration: z.number().int().optional(),
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(50),
});
export type ServiceListFilter = z.input<typeof serviceListFilterSchema>;

export const providerListFilterSchema = z.object({
  isActive: z.boolean().optional(),
  serviceId: z.string().optional(),
  search: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(50),
});
export type ProviderListFilter = z.input<typeof providerListFilterSchema>;

export const appointmentListFilterSchema = z.object({
  status: z.enum(APPOINTMENT_STATUSES).optional(),
  providerId: z.string().optional(),
  customerId: z.string().optional(),
  locationId: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  bookingSource: z.enum(BOOKING_SOURCES).optional(),
  search: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(50),
});
export type AppointmentListFilter = z.input<typeof appointmentListFilterSchema>;

// ── Clinical Notes Schemas ──────────────────────────────────────────

export const createClinicalNoteSchema = z.object({
  clientRequestId: z.string().optional(),
  appointmentId: z.string(),
  appointmentItemId: z.string().optional(),
  providerId: z.string(),
  customerId: z.string(),
  noteType: z.enum(NOTE_TYPES).default('soap'),
  subjective: z.string().max(5000).optional(),
  objective: z.string().max(5000).optional(),
  assessment: z.string().max(5000).optional(),
  plan: z.string().max(5000).optional(),
  generalNotes: z.string().max(5000).optional(),
  isConfidential: z.boolean().default(false),
  photos: z.array(z.string().url()).optional(),
});
export type CreateClinicalNoteInput = z.input<typeof createClinicalNoteSchema>;

// ── Contraindication Schemas ──────────────────────────────────────────

export const createContraindicationSchema = z.object({
  clientRequestId: z.string().optional(),
  customerId: z.string(),
  condition: z.string().min(1).max(500),
  severity: z.enum(SEVERITY_LEVELS).default('moderate'),
  affectedServices: z.array(z.string()).optional(),
  notes: z.string().max(2000).optional(),
});
export type CreateContraindicationInput = z.input<typeof createContraindicationSchema>;

// ── Room Turnover Schemas ──────────────────────────────────────────

export const createRoomTurnoverTaskSchema = z.object({
  clientRequestId: z.string().optional(),
  resourceId: z.string(),
  appointmentId: z.string().optional(),
  taskType: z.enum(TASK_TYPES),
  assignedTo: z.string().optional(),
  dueAt: z.string(),
  notes: z.string().max(1000).optional(),
  checklist: z.array(z.object({
    item: z.string(),
    completed: z.boolean().default(false),
  })).optional(),
});
export type CreateRoomTurnoverTaskInput = z.input<typeof createRoomTurnoverTaskSchema>;
