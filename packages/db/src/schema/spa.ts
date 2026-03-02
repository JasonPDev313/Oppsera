import {
  pgTable,
  text,
  integer,
  boolean,
  date,
  timestamp,
  numeric,
  jsonb,
  index,
  uniqueIndex,
  time,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { generateUlid } from '@oppsera/shared';
import { tenants, users, locations } from './core';
import { customers } from './customers';
import { catalogItems } from './catalog';
import { orders } from './orders';

// ── Spa Settings ──────────────────────────────────────────────────
export const spaSettings = pgTable(
  'spa_settings',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    locationId: text('location_id').references(() => locations.id),
    timezone: text('timezone').notNull().default('America/New_York'),
    dayCloseTime: text('day_close_time').notNull().default('00:00'),
    defaultCurrency: text('default_currency').notNull().default('USD'),
    taxInclusive: boolean('tax_inclusive').notNull().default(false),
    defaultBufferMinutes: integer('default_buffer_minutes').notNull().default(15),
    defaultCleanupMinutes: integer('default_cleanup_minutes').notNull().default(10),
    defaultSetupMinutes: integer('default_setup_minutes').notNull().default(5),
    onlineBookingEnabled: boolean('online_booking_enabled').notNull().default(false),
    waitlistEnabled: boolean('waitlist_enabled').notNull().default(true),
    autoAssignProvider: boolean('auto_assign_provider').notNull().default(true),
    rebookingWindowDays: integer('rebooking_window_days').notNull().default(90),
    notificationPreferences: jsonb('notification_preferences').$type<Record<string, unknown>>(),
    depositRules: jsonb('deposit_rules').$type<Record<string, unknown>>(),
    cancellationDefaults: jsonb('cancellation_defaults').$type<Record<string, unknown>>(),
    enterpriseMode: boolean('enterprise_mode').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_spa_settings_tenant').on(table.tenantId),
    uniqueIndex('uq_spa_settings_tenant_location')
      .on(table.tenantId, table.locationId)
      .where(sql`location_id IS NOT NULL`),
  ],
);

// ── Spa Service Categories ────────────────────────────────────────
export const spaServiceCategories = pgTable(
  'spa_service_categories',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    name: text('name').notNull(),
    parentId: text('parent_id'),
    description: text('description'),
    icon: text('icon'),
    sortOrder: integer('sort_order').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_spa_service_categories_tenant').on(table.tenantId),
    index('idx_spa_service_categories_parent').on(table.tenantId, table.parentId),
  ],
);

// ── Spa Services ──────────────────────────────────────────────────
export const spaServices = pgTable(
  'spa_services',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    categoryId: text('category_id').references(() => spaServiceCategories.id),
    name: text('name').notNull(),
    displayName: text('display_name'),
    description: text('description'),
    category: text('category').notNull(), // massage, facial, body, nail, hair, wellness, medspa, other
    durationMinutes: integer('duration_minutes').notNull(),
    bufferMinutes: integer('buffer_minutes').notNull().default(0),
    cleanupMinutes: integer('cleanup_minutes').notNull().default(0),
    setupMinutes: integer('setup_minutes').notNull().default(0),
    price: numeric('price', { precision: 12, scale: 2 }).notNull(),
    memberPrice: numeric('member_price', { precision: 12, scale: 2 }),
    peakPrice: numeric('peak_price', { precision: 12, scale: 2 }),
    cost: numeric('cost', { precision: 12, scale: 2 }),
    maxCapacity: integer('max_capacity').notNull().default(1),
    isCouples: boolean('is_couples').notNull().default(false),
    isGroup: boolean('is_group').notNull().default(false),
    minGroupSize: integer('min_group_size'),
    maxGroupSize: integer('max_group_size'),
    requiresIntake: boolean('requires_intake').notNull().default(false),
    requiresConsent: boolean('requires_consent').notNull().default(false),
    contraindications: jsonb('contraindications').$type<string[]>(),
    preparationInstructions: text('preparation_instructions'),
    aftercareInstructions: text('aftercare_instructions'),
    catalogItemId: text('catalog_item_id').references(() => catalogItems.id),
    imageUrl: text('image_url'),
    sortOrder: integer('sort_order').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    archivedBy: text('archived_by'),
    archivedReason: text('archived_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: text('created_by'),
  },
  (table) => [
    index('idx_spa_services_tenant').on(table.tenantId),
    index('idx_spa_services_category').on(table.tenantId, table.categoryId),
    index('idx_spa_services_active').on(table.tenantId, table.isActive),
  ],
);

// ── Spa Service Addons ────────────────────────────────────────────
export const spaServiceAddons = pgTable(
  'spa_service_addons',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    name: text('name').notNull(),
    description: text('description'),
    durationMinutes: integer('duration_minutes').notNull(),
    price: numeric('price', { precision: 12, scale: 2 }).notNull(),
    memberPrice: numeric('member_price', { precision: 12, scale: 2 }),
    isStandalone: boolean('is_standalone').notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_spa_service_addons_tenant').on(table.tenantId)],
);

// ── Spa Service Addon Links ───────────────────────────────────────
export const spaServiceAddonLinks = pgTable(
  'spa_service_addon_links',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    serviceId: text('service_id')
      .notNull()
      .references(() => spaServices.id),
    addonId: text('addon_id')
      .notNull()
      .references(() => spaServiceAddons.id),
    isDefault: boolean('is_default').notNull().default(false),
    priceOverride: numeric('price_override', { precision: 12, scale: 2 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_spa_service_addon_links_service').on(table.tenantId, table.serviceId),
    uniqueIndex('uq_spa_service_addon_links').on(table.tenantId, table.serviceId, table.addonId),
  ],
);

// ── Spa Providers ─────────────────────────────────────────────────
export const spaProviders = pgTable(
  'spa_providers',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    displayName: text('display_name').notNull(),
    bio: text('bio'),
    photoUrl: text('photo_url'),
    specialties: jsonb('specialties').$type<string[]>(),
    certifications: jsonb('certifications').$type<
      Array<{ name: string; issuer?: string; expiresAt?: string }>
    >(),
    hireDate: date('hire_date'),
    employmentType: text('employment_type').notNull().default('full_time'), // full_time, part_time, contractor, booth_rent
    isBookableOnline: boolean('is_bookable_online').notNull().default(true),
    acceptNewClients: boolean('accept_new_clients').notNull().default(true),
    maxDailyAppointments: integer('max_daily_appointments'),
    breakDurationMinutes: integer('break_duration_minutes').notNull().default(30),
    color: text('color'),
    sortOrder: integer('sort_order').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_spa_providers_tenant').on(table.tenantId),
    uniqueIndex('uq_spa_providers_user').on(table.tenantId, table.userId),
  ],
);

// ── Spa Provider Availability ─────────────────────────────────────
export const spaProviderAvailability = pgTable(
  'spa_provider_availability',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    providerId: text('provider_id')
      .notNull()
      .references(() => spaProviders.id),
    dayOfWeek: integer('day_of_week').notNull(), // 0-6
    startTime: time('start_time').notNull(),
    endTime: time('end_time').notNull(),
    locationId: text('location_id').references(() => locations.id),
    effectiveFrom: date('effective_from').notNull(),
    effectiveUntil: date('effective_until'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_spa_provider_availability_provider').on(table.tenantId, table.providerId),
    index('idx_spa_provider_availability_day').on(table.tenantId, table.providerId, table.dayOfWeek),
  ],
);

// ── Spa Provider Time Off ─────────────────────────────────────────
export const spaProviderTimeOff = pgTable(
  'spa_provider_time_off',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    providerId: text('provider_id')
      .notNull()
      .references(() => spaProviders.id),
    startAt: timestamp('start_at', { withTimezone: true }).notNull(),
    endAt: timestamp('end_at', { withTimezone: true }).notNull(),
    reason: text('reason'),
    isAllDay: boolean('is_all_day').notNull().default(false),
    status: text('status').notNull().default('pending'), // pending, approved, rejected
    approvedBy: text('approved_by'),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_spa_provider_time_off_provider').on(table.tenantId, table.providerId),
    index('idx_spa_provider_time_off_range').on(
      table.tenantId,
      table.providerId,
      table.startAt,
      table.endAt,
    ),
  ],
);

// ── Spa Provider Service Eligibility ──────────────────────────────
export const spaProviderServiceEligibility = pgTable(
  'spa_provider_service_eligibility',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    providerId: text('provider_id')
      .notNull()
      .references(() => spaProviders.id),
    serviceId: text('service_id')
      .notNull()
      .references(() => spaServices.id),
    proficiencyLevel: text('proficiency_level').notNull().default('standard'), // trainee, standard, advanced, master
    customDurationMinutes: integer('custom_duration_minutes'),
    customPrice: numeric('custom_price', { precision: 12, scale: 2 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_spa_provider_service_eligibility_provider').on(table.tenantId, table.providerId),
    uniqueIndex('uq_spa_provider_service_eligibility').on(
      table.tenantId,
      table.providerId,
      table.serviceId,
    ),
  ],
);

// ── Spa Resources ─────────────────────────────────────────────────
export const spaResources = pgTable(
  'spa_resources',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    name: text('name').notNull(),
    resourceType: text('resource_type').notNull(), // room, equipment, bed, chair, other
    description: text('description'),
    capacity: integer('capacity').notNull().default(1),
    locationId: text('location_id').references(() => locations.id),
    bufferMinutes: integer('buffer_minutes').notNull().default(0),
    cleanupMinutes: integer('cleanup_minutes').notNull().default(0),
    amenities: jsonb('amenities').$type<string[]>(),
    photoUrl: text('photo_url'),
    isActive: boolean('is_active').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_spa_resources_tenant').on(table.tenantId),
    index('idx_spa_resources_type').on(table.tenantId, table.resourceType),
    index('idx_spa_resources_location').on(table.tenantId, table.locationId),
  ],
);

// ── Spa Service Resource Requirements ─────────────────────────────
export const spaServiceResourceRequirements = pgTable(
  'spa_service_resource_requirements',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    serviceId: text('service_id')
      .notNull()
      .references(() => spaServices.id),
    resourceId: text('resource_id').references(() => spaResources.id),
    resourceType: text('resource_type'), // any of type (room, equipment, bed, chair, other)
    quantity: integer('quantity').notNull().default(1),
    isMandatory: boolean('is_mandatory').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_spa_service_resource_requirements_service').on(table.tenantId, table.serviceId),
  ],
);

// ── Spa Appointments ──────────────────────────────────────────────
export const spaAppointments = pgTable(
  'spa_appointments',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    appointmentNumber: text('appointment_number').notNull(),
    customerId: text('customer_id').references(() => customers.id),
    guestName: text('guest_name'),
    guestEmail: text('guest_email'),
    guestPhone: text('guest_phone'),
    locationId: text('location_id').references(() => locations.id),
    providerId: text('provider_id').references(() => spaProviders.id),
    resourceId: text('resource_id').references(() => spaResources.id),
    startAt: timestamp('start_at', { withTimezone: true }).notNull(),
    endAt: timestamp('end_at', { withTimezone: true }).notNull(),
    status: text('status').notNull().default('draft'), // draft, reserved, confirmed, checked_in, in_service, completed, checked_out, canceled, no_show
    bookingSource: text('booking_source').notNull().default('front_desk'), // front_desk, online, phone, mobile_app, kiosk, walk_in, pms
    bookingChannel: text('booking_channel'),
    notes: text('notes'),
    internalNotes: text('internal_notes'),
    depositAmountCents: integer('deposit_amount_cents').notNull().default(0),
    depositStatus: text('deposit_status').notNull().default('none'), // none, required, authorized, captured, refunded
    depositPaymentId: text('deposit_payment_id'),
    cancellationReason: text('cancellation_reason'),
    canceledAt: timestamp('canceled_at', { withTimezone: true }),
    canceledBy: text('canceled_by'),
    noShowFeeCharged: boolean('no_show_fee_charged').notNull().default(false),
    checkedInAt: timestamp('checked_in_at', { withTimezone: true }),
    checkedInBy: text('checked_in_by'),
    serviceStartedAt: timestamp('service_started_at', { withTimezone: true }),
    serviceCompletedAt: timestamp('service_completed_at', { withTimezone: true }),
    checkedOutAt: timestamp('checked_out_at', { withTimezone: true }),
    orderId: text('order_id').references(() => orders.id),
    pmsFolioId: text('pms_folio_id'),
    recurrenceRule: jsonb('recurrence_rule').$type<Record<string, unknown>>(),
    confirmationEmailSentAt: timestamp('confirmation_email_sent_at', { withTimezone: true }),
    reminderEmailSentAt: timestamp('reminder_email_sent_at', { withTimezone: true }),
    version: integer('version').notNull().default(1),
    createdBy: text('created_by'),
    updatedBy: text('updated_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_spa_appointments_location_time').on(
      table.tenantId,
      table.locationId,
      table.startAt,
      table.endAt,
    ),
    index('idx_spa_appointments_customer').on(table.tenantId, table.customerId),
    index('idx_spa_appointments_provider_time').on(
      table.tenantId,
      table.providerId,
      table.startAt,
    ),
    index('idx_spa_appointments_status').on(table.tenantId, table.status),
    uniqueIndex('uq_spa_appointments_number').on(table.tenantId, table.appointmentNumber),
  ],
);

// ── Spa Appointment Items ─────────────────────────────────────────
export const spaAppointmentItems = pgTable(
  'spa_appointment_items',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    appointmentId: text('appointment_id')
      .notNull()
      .references(() => spaAppointments.id),
    serviceId: text('service_id')
      .notNull()
      .references(() => spaServices.id),
    addonId: text('addon_id').references(() => spaServiceAddons.id),
    providerId: text('provider_id').references(() => spaProviders.id),
    resourceId: text('resource_id').references(() => spaResources.id),
    startAt: timestamp('start_at', { withTimezone: true }).notNull(),
    endAt: timestamp('end_at', { withTimezone: true }).notNull(),
    priceCents: integer('price_cents').notNull(),
    memberPriceCents: integer('member_price_cents'),
    finalPriceCents: integer('final_price_cents').notNull(),
    discountAmountCents: integer('discount_amount_cents').notNull().default(0),
    discountReason: text('discount_reason'),
    packageBalanceId: text('package_balance_id'),
    notes: text('notes'),
    status: text('status').notNull().default('scheduled'), // scheduled, in_progress, completed, canceled
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_spa_appointment_items_appointment').on(table.tenantId, table.appointmentId),
    index('idx_spa_appointment_items_provider_time').on(
      table.tenantId,
      table.providerId,
      table.startAt,
    ),
  ],
);

// ── Spa Appointment History ───────────────────────────────────────
export const spaAppointmentHistory = pgTable(
  'spa_appointment_history',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    appointmentId: text('appointment_id')
      .notNull()
      .references(() => spaAppointments.id),
    action: text('action').notNull(),
    oldStatus: text('old_status'),
    newStatus: text('new_status'),
    changes: jsonb('changes').$type<Record<string, unknown>>(),
    performedBy: text('performed_by'),
    performedAt: timestamp('performed_at', { withTimezone: true }).notNull().defaultNow(),
    reason: text('reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_spa_appointment_history_appointment').on(table.tenantId, table.appointmentId),
  ],
);

// ── Spa Waitlist ──────────────────────────────────────────────────
export const spaWaitlist = pgTable(
  'spa_waitlist',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    customerId: text('customer_id').references(() => customers.id),
    serviceId: text('service_id').references(() => spaServices.id),
    preferredProviderId: text('preferred_provider_id').references(() => spaProviders.id),
    preferredDate: date('preferred_date'),
    preferredTimeStart: time('preferred_time_start'),
    preferredTimeEnd: time('preferred_time_end'),
    flexibility: text('flexibility').notNull().default('flexible_time'), // exact, flexible_time, flexible_date, any
    status: text('status').notNull().default('waiting'), // waiting, offered, booked, expired, canceled
    offeredAppointmentId: text('offered_appointment_id').references(() => spaAppointments.id),
    priority: integer('priority').notNull().default(0),
    notes: text('notes'),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_spa_waitlist_status').on(table.tenantId, table.status),
    index('idx_spa_waitlist_customer').on(table.tenantId, table.customerId),
  ],
);

// ── Spa Intake Form Templates ─────────────────────────────────────
export const spaIntakeFormTemplates = pgTable(
  'spa_intake_form_templates',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    name: text('name').notNull(),
    description: text('description'),
    formType: text('form_type').notNull(), // intake, consent, medical_history, covid, waiver, custom
    fields: jsonb('fields')
      .notNull()
      .$type<
        Array<{
          key: string;
          label: string;
          type: string;
          required?: boolean;
          options?: string[];
        }>
      >(),
    requiredForServices: jsonb('required_for_services').$type<string[] | 'all'>(),
    version: integer('version').notNull().default(1),
    isActive: boolean('is_active').notNull().default(true),
    isRequired: boolean('is_required').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_spa_intake_form_templates_tenant').on(table.tenantId),
    index('idx_spa_intake_form_templates_type').on(table.tenantId, table.formType),
  ],
);

// ── Spa Intake Responses ──────────────────────────────────────────
export const spaIntakeResponses = pgTable(
  'spa_intake_responses',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    templateId: text('template_id')
      .notNull()
      .references(() => spaIntakeFormTemplates.id),
    customerId: text('customer_id')
      .notNull()
      .references(() => customers.id),
    appointmentId: text('appointment_id').references(() => spaAppointments.id),
    responses: jsonb('responses').notNull().$type<Record<string, unknown>>(),
    signedAt: timestamp('signed_at', { withTimezone: true }),
    signatureData: text('signature_data'),
    ipAddress: text('ip_address'),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_spa_intake_responses_customer').on(table.tenantId, table.customerId),
    index('idx_spa_intake_responses_appointment').on(table.tenantId, table.appointmentId),
  ],
);

// ── Spa Clinical Notes ────────────────────────────────────────────
export const spaClinicalNotes = pgTable(
  'spa_clinical_notes',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    appointmentId: text('appointment_id')
      .notNull()
      .references(() => spaAppointments.id),
    appointmentItemId: text('appointment_item_id').references(() => spaAppointmentItems.id),
    providerId: text('provider_id')
      .notNull()
      .references(() => spaProviders.id),
    customerId: text('customer_id')
      .notNull()
      .references(() => customers.id),
    noteType: text('note_type').notNull().default('soap'), // soap, progress, general, contraindication
    subjective: text('subjective'),
    objective: text('objective'),
    assessment: text('assessment'),
    plan: text('plan'),
    generalNotes: text('general_notes'),
    isConfidential: boolean('is_confidential').notNull().default(false),
    photos: jsonb('photos').$type<string[]>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_spa_clinical_notes_appointment').on(table.tenantId, table.appointmentId),
    index('idx_spa_clinical_notes_customer').on(table.tenantId, table.customerId),
  ],
);

// ── Spa Contraindications ─────────────────────────────────────────
export const spaContraindications = pgTable(
  'spa_contraindications',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    customerId: text('customer_id')
      .notNull()
      .references(() => customers.id),
    condition: text('condition').notNull(),
    severity: text('severity').notNull().default('moderate'), // mild, moderate, severe
    affectedServices: jsonb('affected_services').$type<string[]>(),
    notes: text('notes'),
    reportedAt: timestamp('reported_at', { withTimezone: true }).notNull().defaultNow(),
    reportedBy: text('reported_by'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_spa_contraindications_customer').on(table.tenantId, table.customerId),
  ],
);

// ── Spa Commission Rules ──────────────────────────────────────────
export const spaCommissionRules = pgTable(
  'spa_commission_rules',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    name: text('name').notNull(),
    providerId: text('provider_id').references(() => spaProviders.id), // null = default rule
    serviceId: text('service_id').references(() => spaServices.id),
    serviceCategory: text('service_category'),
    commissionType: text('commission_type').notNull(), // percentage, flat, tiered, sliding_scale
    rate: numeric('rate', { precision: 5, scale: 2 }),
    flatAmount: numeric('flat_amount', { precision: 12, scale: 2 }),
    tiers: jsonb('tiers').$type<Array<{ threshold: number; rate: number }>>(),
    appliesTo: text('applies_to').notNull().default('service'), // service, retail, addon, tip, all
    effectiveFrom: date('effective_from').notNull(),
    effectiveUntil: date('effective_until'),
    isActive: boolean('is_active').notNull().default(true),
    priority: integer('priority').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_spa_commission_rules_tenant').on(table.tenantId),
    index('idx_spa_commission_rules_provider').on(table.tenantId, table.providerId),
  ],
);

// ── Spa Commission Ledger ─────────────────────────────────────────
export const spaCommissionLedger = pgTable(
  'spa_commission_ledger',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    providerId: text('provider_id')
      .notNull()
      .references(() => spaProviders.id),
    appointmentId: text('appointment_id').references(() => spaAppointments.id),
    appointmentItemId: text('appointment_item_id').references(() => spaAppointmentItems.id),
    orderId: text('order_id').references(() => orders.id),
    ruleId: text('rule_id')
      .notNull()
      .references(() => spaCommissionRules.id),
    commissionType: text('commission_type').notNull(),
    baseAmountCents: integer('base_amount_cents').notNull(),
    commissionAmountCents: integer('commission_amount_cents').notNull(),
    rateApplied: numeric('rate_applied', { precision: 5, scale: 2 }),
    status: text('status').notNull().default('calculated'), // calculated, approved, paid, adjusted, voided
    payPeriod: text('pay_period'),
    approvedBy: text('approved_by'),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    adjustmentReason: text('adjustment_reason'),
    originalAmountCents: integer('original_amount_cents'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_spa_commission_ledger_provider').on(table.tenantId, table.providerId),
    index('idx_spa_commission_ledger_pay_period').on(
      table.tenantId,
      table.providerId,
      table.payPeriod,
    ),
    index('idx_spa_commission_ledger_status').on(table.tenantId, table.status),
  ],
);

// ── Spa Package Definitions ───────────────────────────────────────
export const spaPackageDefinitions = pgTable(
  'spa_package_definitions',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    name: text('name').notNull(),
    description: text('description'),
    packageType: text('package_type').notNull(), // session_bundle, credit_bundle, time_bundle, value_bundle
    includedServices: jsonb('included_services').$type<
      Array<{ serviceId: string; quantity: number }>
    >(),
    totalSessions: integer('total_sessions'),
    totalCredits: numeric('total_credits', { precision: 12, scale: 2 }),
    totalValueCents: integer('total_value_cents'),
    sellingPriceCents: integer('selling_price_cents').notNull(),
    validityDays: integer('validity_days').notNull(),
    isTransferable: boolean('is_transferable').notNull().default(false),
    isShareable: boolean('is_shareable').notNull().default(false),
    maxShares: integer('max_shares').notNull().default(1),
    autoRenew: boolean('auto_renew').notNull().default(false),
    renewalPriceCents: integer('renewal_price_cents'),
    freezeAllowed: boolean('freeze_allowed').notNull().default(false),
    maxFreezeDays: integer('max_freeze_days'),
    isActive: boolean('is_active').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_spa_package_definitions_tenant').on(table.tenantId)],
);

// ── Spa Package Balances ──────────────────────────────────────────
export const spaPackageBalances = pgTable(
  'spa_package_balances',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    customerId: text('customer_id')
      .notNull()
      .references(() => customers.id),
    packageDefId: text('package_def_id')
      .notNull()
      .references(() => spaPackageDefinitions.id),
    purchaseDate: date('purchase_date').notNull(),
    expirationDate: date('expiration_date').notNull(),
    sessionsTotal: integer('sessions_total'),
    sessionsUsed: integer('sessions_used').notNull().default(0),
    creditsTotal: numeric('credits_total', { precision: 12, scale: 2 }),
    creditsUsed: numeric('credits_used', { precision: 12, scale: 2 }).notNull().default('0'),
    status: text('status').notNull().default('active'), // active, frozen, expired, exhausted, canceled
    frozenAt: timestamp('frozen_at', { withTimezone: true }),
    frozenUntil: timestamp('frozen_until', { withTimezone: true }),
    freezeCount: integer('freeze_count').notNull().default(0),
    orderId: text('order_id').references(() => orders.id),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_spa_package_balances_customer').on(table.tenantId, table.customerId),
    index('idx_spa_package_balances_customer_status').on(
      table.tenantId,
      table.customerId,
      table.status,
    ),
  ],
);

// ── Spa Package Redemptions ───────────────────────────────────────
export const spaPackageRedemptions = pgTable(
  'spa_package_redemptions',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    balanceId: text('balance_id')
      .notNull()
      .references(() => spaPackageBalances.id),
    appointmentId: text('appointment_id').references(() => spaAppointments.id),
    appointmentItemId: text('appointment_item_id').references(() => spaAppointmentItems.id),
    sessionsRedeemed: integer('sessions_redeemed').notNull().default(1),
    creditsRedeemed: numeric('credits_redeemed', { precision: 12, scale: 2 }).notNull().default('0'),
    redeemedAt: timestamp('redeemed_at', { withTimezone: true }).notNull().defaultNow(),
    redeemedBy: text('redeemed_by'),
    voided: boolean('voided').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_spa_package_redemptions_balance').on(table.tenantId, table.balanceId),
  ],
);

// ── Spa Room Turnover Tasks ───────────────────────────────────────
export const spaRoomTurnoverTasks = pgTable(
  'spa_room_turnover_tasks',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    resourceId: text('resource_id')
      .notNull()
      .references(() => spaResources.id),
    appointmentId: text('appointment_id').references(() => spaAppointments.id),
    taskType: text('task_type').notNull(), // cleanup, setup, inspection, restock
    assignedTo: text('assigned_to'),
    status: text('status').notNull().default('pending'), // pending, in_progress, completed, skipped
    dueAt: timestamp('due_at', { withTimezone: true }).notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    notes: text('notes'),
    checklist: jsonb('checklist').$type<Array<{ item: string; completed: boolean }>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_spa_room_turnover_tasks_resource').on(table.tenantId, table.resourceId),
    index('idx_spa_room_turnover_tasks_status').on(table.tenantId, table.status),
  ],
);

// ── Spa Daily Operations ──────────────────────────────────────────
export const spaDailyOperations = pgTable(
  'spa_daily_operations',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    locationId: text('location_id')
      .notNull()
      .references(() => locations.id),
    businessDate: date('business_date').notNull(),
    openingChecklist: jsonb('opening_checklist').$type<
      Array<{ item: string; completed: boolean; completedBy?: string }>
    >(),
    closingChecklist: jsonb('closing_checklist').$type<
      Array<{ item: string; completed: boolean; completedBy?: string }>
    >(),
    openedBy: text('opened_by'),
    openedAt: timestamp('opened_at', { withTimezone: true }),
    closedBy: text('closed_by'),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    notes: text('notes'),
    incidents: jsonb('incidents').$type<
      Array<{ description: string; severity: string; reportedBy: string; reportedAt: string }>
    >(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_spa_daily_operations_location').on(table.tenantId, table.locationId),
    uniqueIndex('uq_spa_daily_operations_date').on(
      table.tenantId,
      table.locationId,
      table.businessDate,
    ),
  ],
);

// ── Spa Booking Widget Config ─────────────────────────────────────
export const spaBookingWidgetConfig = pgTable(
  'spa_booking_widget_config',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    locationId: text('location_id').references(() => locations.id),
    theme: jsonb('theme').$type<Record<string, unknown>>(),
    logoUrl: text('logo_url'),
    welcomeMessage: text('welcome_message'),
    bookingLeadTimeHours: integer('booking_lead_time_hours').notNull().default(2),
    maxAdvanceBookingDays: integer('max_advance_booking_days').notNull().default(90),
    requireDeposit: boolean('require_deposit').notNull().default(false),
    depositType: text('deposit_type').notNull().default('percentage'), // percentage, flat
    depositValue: numeric('deposit_value', { precision: 12, scale: 2 }).notNull().default('0'),
    cancellationWindowHours: integer('cancellation_window_hours').notNull().default(24),
    cancellationFeeType: text('cancellation_fee_type').notNull().default('none'), // percentage, flat, none
    cancellationFeeValue: numeric('cancellation_fee_value', { precision: 12, scale: 2 })
      .notNull()
      .default('0'),
    showPrices: boolean('show_prices').notNull().default(true),
    showProviderPhotos: boolean('show_provider_photos').notNull().default(true),
    allowProviderSelection: boolean('allow_provider_selection').notNull().default(true),
    allowAddonSelection: boolean('allow_addon_selection').notNull().default(true),
    customCss: text('custom_css'),
    redirectUrl: text('redirect_url'),
    // Per-webapp customization JSONB columns (override tenant-level business info)
    businessIdentity: jsonb('business_identity')
      .notNull()
      .default({})
      .$type<Record<string, unknown>>(),
    contactLocation: jsonb('contact_location')
      .notNull()
      .default({})
      .$type<Record<string, unknown>>(),
    branding: jsonb('branding')
      .notNull()
      .default({})
      .$type<Record<string, unknown>>(),
    operational: jsonb('operational')
      .notNull()
      .default({})
      .$type<Record<string, unknown>>(),
    legal: jsonb('legal')
      .notNull()
      .default({})
      .$type<Record<string, unknown>>(),
    seo: jsonb('seo')
      .notNull()
      .default({})
      .$type<Record<string, unknown>>(),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_spa_booking_widget_config_tenant').on(table.tenantId)],
);

// ── Spa Idempotency Keys ──────────────────────────────────────────
export const spaIdempotencyKeys = pgTable(
  'spa_idempotency_keys',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    key: text('key').notNull(),
    operation: text('operation').notNull(),
    result: jsonb('result').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('uq_spa_idempotency_keys').on(table.tenantId, table.key, table.operation)],
);

// ── Spa Outbox ────────────────────────────────────────────────────
export const spaOutbox = pgTable(
  'spa_outbox',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    eventType: text('event_type').notNull(),
    payload: jsonb('payload').notNull(),
    status: text('status').notNull().default('pending'), // pending, processing, published, failed
    publishedAt: timestamp('published_at', { withTimezone: true }),
    failedAt: timestamp('failed_at', { withTimezone: true }),
    retryCount: integer('retry_count').notNull().default(0),
    maxRetries: integer('max_retries').notNull().default(3),
    error: text('error'),
    claimedBy: text('claimed_by'),
    claimedAt: timestamp('claimed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_spa_outbox_tenant_status').on(table.tenantId, table.status),
    index('idx_spa_outbox_status_created').on(table.status, table.createdAt),
  ],
);
