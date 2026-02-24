import { z } from 'zod';

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

// ── Property ─────────────────────────────────────────────────────
export const createPropertySchema = z.object({
  name: z.string().min(1).max(200),
  timezone: z.string().min(1),
  currency: z.string().length(3).default('USD'),
  addressJson: z.record(z.unknown()).optional(),
  taxRatePct: z.number().min(0).max(100).default(0),
  checkInTime: z.string().regex(/^\d{2}:\d{2}$/).default('15:00'),
  checkOutTime: z.string().regex(/^\d{2}:\d{2}$/).default('11:00'),
  nightAuditTime: z.string().regex(/^\d{2}:\d{2}$/).default('03:00'),
});
export type CreatePropertyInput = z.input<typeof createPropertySchema>;

export const updatePropertySchema = z.object({
  name: z.string().min(1).max(200).optional(),
  timezone: z.string().min(1).optional(),
  currency: z.string().length(3).optional(),
  addressJson: z.record(z.unknown()).optional(),
  taxRatePct: z.number().min(0).max(100).optional(),
  checkInTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  checkOutTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  nightAuditTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
});
export type UpdatePropertyInput = z.input<typeof updatePropertySchema>;

// ── Room Type ────────────────────────────────────────────────────
export const createRoomTypeSchema = z.object({
  propertyId: z.string().min(1),
  code: z.string().min(1).max(20),
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  maxAdults: z.number().int().min(1).default(2),
  maxChildren: z.number().int().min(0).default(0),
  maxOccupancy: z.number().int().min(1).default(2),
  bedsJson: z
    .array(z.object({ type: z.string(), count: z.number().int().min(1) }))
    .optional(),
  amenitiesJson: z.array(z.string()).optional(),
  sortOrder: z.number().int().min(0).default(0),
});
export type CreateRoomTypeInput = z.input<typeof createRoomTypeSchema>;

export const updateRoomTypeSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().optional(),
  maxAdults: z.number().int().min(1).optional(),
  maxChildren: z.number().int().min(0).optional(),
  maxOccupancy: z.number().int().min(1).optional(),
  bedsJson: z
    .array(z.object({ type: z.string(), count: z.number().int().min(1) }))
    .optional(),
  amenitiesJson: z.array(z.string()).optional(),
  sortOrder: z.number().int().min(0).optional(),
});
export type UpdateRoomTypeInput = z.input<typeof updateRoomTypeSchema>;

// ── Room ─────────────────────────────────────────────────────────
export const createRoomSchema = z.object({
  propertyId: z.string().min(1),
  roomTypeId: z.string().min(1),
  roomNumber: z.string().min(1).max(20),
  floor: z.string().max(20).optional(),
  featuresJson: z.record(z.unknown()).optional(),
});
export type CreateRoomInput = z.input<typeof createRoomSchema>;

export const updateRoomSchema = z.object({
  roomNumber: z.string().min(1).max(20).optional(),
  floor: z.string().max(20).optional(),
  roomTypeId: z.string().min(1).optional(),
  featuresJson: z.record(z.unknown()).optional(),
});
export type UpdateRoomInput = z.input<typeof updateRoomSchema>;

export const updateRoomStatusSchema = z.object({
  status: z.enum(['VACANT_CLEAN', 'VACANT_DIRTY', 'OCCUPIED', 'OUT_OF_ORDER']),
  reason: z.string().optional(),
});
export type UpdateRoomStatusInput = z.input<typeof updateRoomStatusSchema>;

// ── Rate Plan ────────────────────────────────────────────────────
export const createRatePlanSchema = z.object({
  propertyId: z.string().min(1),
  code: z.string().min(1).max(20),
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  isDefault: z.boolean().default(false),
  defaultNightlyRateCents: z.number().int().min(0).optional(),
});
export type CreateRatePlanInput = z.input<typeof createRatePlanSchema>;

export const updateRatePlanSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().optional(),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional(),
  defaultNightlyRateCents: z.number().int().min(0).optional().nullable(),
});
export type UpdateRatePlanInput = z.input<typeof updateRatePlanSchema>;

export const setRatePlanPriceSchema = z.object({
  ratePlanId: z.string().min(1),
  roomTypeId: z.string().min(1),
  startDate: z.string().regex(dateRegex),
  endDate: z.string().regex(dateRegex),
  nightlyBaseCents: z.number().int().min(0),
}).refine((data) => data.endDate > data.startDate, {
  message: 'End date must be after start date',
  path: ['endDate'],
});
export type SetRatePlanPriceInput = z.input<typeof setRatePlanPriceSchema>;

// ── Guest ────────────────────────────────────────────────────────
export const createGuestSchema = z.object({
  propertyId: z.string().min(1),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  addressJson: z.record(z.unknown()).optional(),
  preferencesJson: z.record(z.unknown()).optional(),
  notes: z.string().optional(),
  isVip: z.boolean().default(false),
});
export type CreateGuestInput = z.input<typeof createGuestSchema>;

export const updateGuestSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  addressJson: z.record(z.unknown()).optional(),
  preferencesJson: z.record(z.unknown()).optional(),
  notes: z.string().optional(),
  isVip: z.boolean().optional(),
});
export type UpdateGuestInput = z.input<typeof updateGuestSchema>;

// ── Reservation ──────────────────────────────────────────────────
export const createReservationSchema = z
  .object({
    propertyId: z.string().min(1),
    guestId: z.string().optional(),
    primaryGuestJson: z.object({
      firstName: z.string().min(1),
      lastName: z.string().min(1),
      email: z.string().email().optional(),
      phone: z.string().optional(),
    }),
    checkInDate: z.string().regex(dateRegex),
    checkOutDate: z.string().regex(dateRegex),
    adults: z.number().int().min(1).default(1),
    children: z.number().int().min(0).default(0),
    roomTypeId: z.string().min(1),
    roomId: z.string().optional(),
    ratePlanId: z.string().min(1).optional(),
    nightlyRateCents: z.number().int().min(0).optional(),
    sourceType: z
      .enum(['DIRECT', 'PHONE', 'WALKIN', 'BOOKING_ENGINE', 'OTA'])
      .default('DIRECT'),
    internalNotes: z.string().optional(),
    guestNotes: z.string().optional(),
    status: z.enum(['HOLD', 'CONFIRMED']).default('CONFIRMED'),
    restrictionOverride: z.boolean().default(false),
  })
  .refine((data) => data.checkOutDate > data.checkInDate, {
    message: 'Check-out date must be after check-in date',
    path: ['checkOutDate'],
  });
export type CreateReservationInput = z.input<typeof createReservationSchema>;

export const updateReservationSchema = z.object({
  guestId: z.string().optional(),
  primaryGuestJson: z
    .object({
      firstName: z.string().min(1),
      lastName: z.string().min(1),
      email: z.string().email().optional(),
      phone: z.string().optional(),
    })
    .optional(),
  adults: z.number().int().min(1).optional(),
  children: z.number().int().min(0).optional(),
  nightlyRateCents: z.number().int().min(0).optional(),
  ratePlanId: z.string().min(1).optional(),
  internalNotes: z.string().optional(),
  guestNotes: z.string().optional(),
  version: z.number().int().min(1),
});
export type UpdateReservationInput = z.input<typeof updateReservationSchema>;

export const cancelReservationSchema = z.object({
  version: z.number().int().min(1),
  reason: z.string().optional(),
});
export type CancelReservationInput = z.input<typeof cancelReservationSchema>;

export const markNoShowSchema = z.object({
  version: z.number().int().min(1),
});
export type MarkNoShowInput = z.input<typeof markNoShowSchema>;

// ── Calendar Move ────────────────────────────────────────────────
export const calendarMoveSchema = z.object({
  reservationId: z.string().min(1),
  from: z.object({
    roomId: z.string().min(1),
    checkInDate: z.string().regex(dateRegex),
    checkOutDate: z.string().regex(dateRegex),
    version: z.number().int().min(1),
  }),
  to: z.object({
    roomId: z.string().min(1),
    checkInDate: z.string().regex(dateRegex),
  }),
  idempotencyKey: z.string().min(1),
});
export type CalendarMoveInput = z.input<typeof calendarMoveSchema>;

// ── Calendar Resize ──────────────────────────────────────────────
export const calendarResizeSchema = z.object({
  reservationId: z.string().min(1),
  edge: z.enum(['LEFT', 'RIGHT']),
  from: z.object({
    checkInDate: z.string().regex(dateRegex),
    checkOutDate: z.string().regex(dateRegex),
    roomId: z.string().min(1),
    version: z.number().int().min(1),
  }),
  to: z.object({
    checkInDate: z.string().regex(dateRegex).optional(),
    checkOutDate: z.string().regex(dateRegex).optional(),
  }),
  idempotencyKey: z.string().min(1),
});
export type CalendarResizeInput = z.input<typeof calendarResizeSchema>;

// ── Check-In / Check-Out ─────────────────────────────────────────
export const checkInSchema = z.object({
  roomId: z.string().min(1),
  version: z.number().int().min(1),
});
export type CheckInInput = z.input<typeof checkInSchema>;

export const checkOutSchema = z.object({
  version: z.number().int().min(1),
});
export type CheckOutInput = z.input<typeof checkOutSchema>;

// ── Room Move (Operational) ──────────────────────────────────────
export const moveRoomSchema = z.object({
  newRoomId: z.string().min(1),
  version: z.number().int().min(1),
});
export type MoveRoomInput = z.input<typeof moveRoomSchema>;

// ── Housekeeping ─────────────────────────────────────────────────
export const updateRoomHousekeepingSchema = z.object({
  status: z.enum(['VACANT_CLEAN', 'VACANT_DIRTY', 'OCCUPIED', 'OUT_OF_ORDER']),
  reason: z.string().optional(),
});
export type UpdateRoomHousekeepingInput = z.input<typeof updateRoomHousekeepingSchema>;

// ── Folio ────────────────────────────────────────────────────────
export const postFolioEntrySchema = z.object({
  entryType: z.enum([
    'ROOM_CHARGE',
    'TAX',
    'FEE',
    'ADJUSTMENT',
    'PAYMENT',
    'REFUND',
  ]),
  description: z.string().min(1),
  amountCents: z.number().int(),
  sourceRef: z.string().optional(),
});
export type PostFolioEntryInput = z.input<typeof postFolioEntrySchema>;

// ── Rate Restrictions ────────────────────────────────────────────
export const setRateRestrictionsSchema = z.object({
  propertyId: z.string().min(1),
  roomTypeId: z.string().min(1).optional(),
  ratePlanId: z.string().min(1).optional(),
  dates: z.array(
    z.object({
      date: z.string().regex(dateRegex),
      minStay: z.number().int().min(1).optional().nullable(),
      maxStay: z.number().int().min(1).optional().nullable(),
      cta: z.boolean().default(false),
      ctd: z.boolean().default(false),
      stopSell: z.boolean().default(false),
    }),
  ).min(1).max(365),
});
export type SetRateRestrictionsInput = z.input<typeof setRateRestrictionsSchema>;

export const clearRateRestrictionsSchema = z.object({
  propertyId: z.string().min(1),
  startDate: z.string().regex(dateRegex),
  endDate: z.string().regex(dateRegex),
  roomTypeId: z.string().min(1).optional(),
  ratePlanId: z.string().min(1).optional(),
}).refine((data) => data.endDate >= data.startDate, {
  message: 'End date must be on or after start date',
  path: ['endDate'],
});
export type ClearRateRestrictionsInput = z.input<typeof clearRateRestrictionsSchema>;

// ── Out of Order ─────────────────────────────────────────────────
export const setOutOfOrderSchema = z.object({
  reason: z.string().min(1),
  startDate: z.string().regex(dateRegex).optional(),
  endDate: z.string().regex(dateRegex).optional(),
});
export type SetOutOfOrderInput = z.input<typeof setOutOfOrderSchema>;

// ── Payment Methods ─────────────────────────────────────────────
export const savePaymentMethodSchema = z.object({
  guestId: z.string().min(1),
  gateway: z.string().default('stripe'),
  gatewayCustomerId: z.string().optional(),
  gatewayPaymentMethodId: z.string().min(1),
  cardLastFour: z.string().length(4).optional(),
  cardBrand: z.string().optional(),
  cardExpMonth: z.number().int().min(1).max(12).optional(),
  cardExpYear: z.number().int().min(2024).optional(),
  isDefault: z.boolean().default(false),
});
export type SavePaymentMethodInput = z.input<typeof savePaymentMethodSchema>;

// ── Payment Transactions ────────────────────────────────────────
export const chargeCardSchema = z.object({
  propertyId: z.string().min(1),
  reservationId: z.string().min(1),
  folioId: z.string().min(1),
  paymentMethodId: z.string().min(1),
  amountCents: z.number().int().min(1),
  description: z.string().optional(),
  idempotencyKey: z.string().min(1),
});
export type ChargeCardInput = z.input<typeof chargeCardSchema>;

export const authorizeDepositSchema = z.object({
  propertyId: z.string().min(1),
  reservationId: z.string().min(1),
  folioId: z.string().min(1).optional(),
  paymentMethodId: z.string().min(1),
  amountCents: z.number().int().min(1),
  idempotencyKey: z.string().min(1),
});
export type AuthorizeDepositInput = z.input<typeof authorizeDepositSchema>;

export const captureDepositSchema = z.object({
  transactionId: z.string().min(1),
  amountCents: z.number().int().min(1).optional(),
});
export type CaptureDepositInput = z.input<typeof captureDepositSchema>;

export const refundPaymentSchema = z.object({
  transactionId: z.string().min(1),
  amountCents: z.number().int().min(1).optional(),
  reason: z.string().optional(),
  idempotencyKey: z.string().min(1),
});
export type RefundPaymentInput = z.input<typeof refundPaymentSchema>;

// ── Deposit Policies ────────────────────────────────────────────
export const createDepositPolicySchema = z.object({
  propertyId: z.string().min(1),
  name: z.string().min(1).max(100),
  depositType: z.enum(['first_night', 'percentage', 'fixed_amount']).default('first_night'),
  percentagePct: z.number().min(0).max(100).optional(),
  fixedAmountCents: z.number().int().min(0).optional(),
  chargeTiming: z.enum(['at_booking', 'days_before_arrival']).default('at_booking'),
  daysBefore: z.number().int().min(1).optional(),
  isDefault: z.boolean().default(false),
});
export type CreateDepositPolicyInput = z.input<typeof createDepositPolicySchema>;

export const updateDepositPolicySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  depositType: z.enum(['first_night', 'percentage', 'fixed_amount']).optional(),
  percentagePct: z.number().min(0).max(100).optional().nullable(),
  fixedAmountCents: z.number().int().min(0).optional().nullable(),
  chargeTiming: z.enum(['at_booking', 'days_before_arrival']).optional(),
  daysBefore: z.number().int().min(1).optional().nullable(),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional(),
});
export type UpdateDepositPolicyInput = z.input<typeof updateDepositPolicySchema>;

// ── Cancellation Policies ───────────────────────────────────────
export const createCancellationPolicySchema = z.object({
  propertyId: z.string().min(1),
  name: z.string().min(1).max(100),
  penaltyType: z.enum(['none', 'first_night', 'percentage', 'fixed_amount']).default('none'),
  percentagePct: z.number().min(0).max(100).optional(),
  fixedAmountCents: z.number().int().min(0).optional(),
  deadlineHours: z.number().int().min(0).default(24),
  isDefault: z.boolean().default(false),
});
export type CreateCancellationPolicyInput = z.input<typeof createCancellationPolicySchema>;

export const updateCancellationPolicySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  penaltyType: z.enum(['none', 'first_night', 'percentage', 'fixed_amount']).optional(),
  percentagePct: z.number().min(0).max(100).optional().nullable(),
  fixedAmountCents: z.number().int().min(0).optional().nullable(),
  deadlineHours: z.number().int().min(0).optional(),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional(),
});
export type UpdateCancellationPolicyInput = z.input<typeof updateCancellationPolicySchema>;

// ── Message Templates ─────────────────────────────────────────

export const createMessageTemplateSchema = z.object({
  propertyId: z.string().min(1),
  templateKey: z.enum(['booking_confirmation', 'pre_arrival', 'post_stay', 'cancellation', 'check_in', 'check_out']),
  channel: z.enum(['email', 'sms']),
  subject: z.string().max(200).optional().nullable(),
  bodyTemplate: z.string().min(1).max(10000),
  isActive: z.boolean().default(true),
});
export type CreateMessageTemplateInput = z.input<typeof createMessageTemplateSchema>;

export const updateMessageTemplateSchema = z.object({
  subject: z.string().max(200).optional().nullable(),
  bodyTemplate: z.string().min(1).max(10000).optional(),
  isActive: z.boolean().optional(),
});
export type UpdateMessageTemplateInput = z.input<typeof updateMessageTemplateSchema>;

export const sendReservationMessageSchema = z.object({
  reservationId: z.string().min(1),
  templateKey: z.enum(['booking_confirmation', 'pre_arrival', 'post_stay', 'cancellation', 'check_in', 'check_out']),
  channel: z.enum(['email', 'sms']),
});
export type SendReservationMessageInput = z.input<typeof sendReservationMessageSchema>;

export const logCommunicationSchema = z.object({
  propertyId: z.string().min(1),
  guestId: z.string().min(1),
  reservationId: z.string().optional().nullable(),
  channel: z.enum(['email', 'sms', 'phone', 'internal']),
  direction: z.enum(['outbound', 'inbound']),
  messageType: z.enum(['confirmation', 'pre_arrival', 'post_stay', 'cancellation', 'request', 'complaint', 'note']),
  subject: z.string().max(200).optional().nullable(),
  body: z.string().min(1).max(50000),
  recipient: z.string().max(500).optional().nullable(),
});
export type LogCommunicationInput = z.input<typeof logCommunicationSchema>;

// ── Housekeepers ────────────────────────────────────────────────
export const createHousekeeperSchema = z.object({
  propertyId: z.string().min(1),
  userId: z.string().optional().nullable(),
  name: z.string().min(1).max(200),
  phone: z.string().max(50).optional().nullable(),
});
export type CreateHousekeeperInput = z.input<typeof createHousekeeperSchema>;

export const updateHousekeeperSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  phone: z.string().max(50).optional().nullable(),
  isActive: z.boolean().optional(),
});
export type UpdateHousekeeperInput = z.input<typeof updateHousekeeperSchema>;

// ── Housekeeping Assignments ────────────────────────────────────
export const assignHousekeepingSchema = z.object({
  propertyId: z.string().min(1),
  businessDate: z.string().min(1),
  assignments: z.array(z.object({
    roomId: z.string().min(1),
    housekeeperId: z.string().min(1),
    priority: z.number().int().min(0).default(0),
  })).min(1),
});
export type AssignHousekeepingInput = z.input<typeof assignHousekeepingSchema>;

export const completeCleaningSchema = z.object({
  notes: z.string().max(1000).optional().nullable(),
});
export type CompleteCleaningInput = z.input<typeof completeCleaningSchema>;

// ── Work Orders ─────────────────────────────────────────────────
export const createWorkOrderSchema = z.object({
  propertyId: z.string().min(1),
  roomId: z.string().optional().nullable(),
  title: z.string().min(1).max(500),
  description: z.string().max(5000).optional().nullable(),
  category: z.enum(['plumbing', 'electrical', 'hvac', 'furniture', 'general']).default('general'),
  priority: z.enum(['urgent', 'high', 'medium', 'low']).default('medium'),
  assignedTo: z.string().optional().nullable(),
  estimatedHours: z.number().positive().optional().nullable(),
  dueDate: z.string().optional().nullable(),
});
export type CreateWorkOrderInput = z.input<typeof createWorkOrderSchema>;

export const updateWorkOrderSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(5000).optional().nullable(),
  category: z.enum(['plumbing', 'electrical', 'hvac', 'furniture', 'general']).optional(),
  priority: z.enum(['urgent', 'high', 'medium', 'low']).optional(),
  status: z.enum(['open', 'in_progress', 'on_hold', 'completed', 'cancelled']).optional(),
  assignedTo: z.string().optional().nullable(),
  estimatedHours: z.number().positive().optional().nullable(),
  dueDate: z.string().optional().nullable(),
});
export type UpdateWorkOrderInput = z.input<typeof updateWorkOrderSchema>;

export const completeWorkOrderSchema = z.object({
  resolutionNotes: z.string().max(5000).optional().nullable(),
  actualHours: z.number().positive().optional().nullable(),
  partsCostCents: z.number().int().min(0).optional().nullable(),
});
export type CompleteWorkOrderInput = z.input<typeof completeWorkOrderSchema>;

export const addWorkOrderCommentSchema = z.object({
  comment: z.string().min(1).max(5000),
});
export type AddWorkOrderCommentInput = z.input<typeof addWorkOrderCommentSchema>;

// ── Rate Packages ──────────────────────────────────────────────────
export const createRatePackageSchema = z.object({
  propertyId: z.string().min(1),
  code: z.string().min(1).max(20),
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  ratePlanId: z.string().min(1).optional(),
  includesJson: z.array(z.object({
    itemCode: z.string().min(1),
    description: z.string().min(1),
    amountCents: z.number().int().min(0),
    entryType: z.string().min(1),
    frequency: z.enum(['per_night', 'per_stay', 'per_person_per_night']),
  })).default([]),
  isActive: z.boolean().default(true),
  clientRequestId: z.string().optional(),
});
export type CreateRatePackageInput = z.input<typeof createRatePackageSchema>;

export const updateRatePackageSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).nullish(),
  ratePlanId: z.string().min(1).nullish(),
  includesJson: z.array(z.object({
    itemCode: z.string().min(1),
    description: z.string().min(1),
    amountCents: z.number().int().min(0),
    entryType: z.string().min(1),
    frequency: z.enum(['per_night', 'per_stay', 'per_person_per_night']),
  })).optional(),
  isActive: z.boolean().optional(),
});
export type UpdateRatePackageInput = z.input<typeof updateRatePackageSchema>;

// ── Groups ────────────────────────────────────────────────────────

export const groupTypeEnum = z.enum([
  'tour',
  'corporate',
  'wedding',
  'conference',
  'sports',
  'other',
]);
export type GroupType = z.infer<typeof groupTypeEnum>;

export const groupStatusEnum = z.enum(['tentative', 'definite', 'cancelled']);
export type GroupStatus = z.infer<typeof groupStatusEnum>;

export const groupBillingTypeEnum = z.enum(['individual', 'master', 'split']);
export type GroupBillingType = z.infer<typeof groupBillingTypeEnum>;

export const createGroupSchema = z
  .object({
    propertyId: z.string().min(1),
    name: z.string().min(1).max(200),
    groupType: groupTypeEnum.default('other'),
    contactName: z.string().max(200).optional(),
    contactEmail: z.string().email().optional(),
    contactPhone: z.string().max(50).optional(),
    corporateAccountId: z.string().optional(),
    ratePlanId: z.string().optional(),
    negotiatedRateCents: z.number().int().min(0).optional(),
    startDate: z.string().regex(dateRegex),
    endDate: z.string().regex(dateRegex),
    cutoffDate: z.string().regex(dateRegex).optional(),
    status: groupStatusEnum.default('tentative'),
    billingType: groupBillingTypeEnum.default('individual'),
    notes: z.string().max(5000).optional(),
    clientRequestId: z.string().optional(),
  })
  .refine((data) => data.endDate > data.startDate, {
    message: 'End date must be after start date',
    path: ['endDate'],
  });
export type CreateGroupInput = z.input<typeof createGroupSchema>;

export const updateGroupSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  groupType: groupTypeEnum.optional(),
  contactName: z.string().max(200).nullish(),
  contactEmail: z.string().email().nullish(),
  contactPhone: z.string().max(50).nullish(),
  ratePlanId: z.string().nullish(),
  negotiatedRateCents: z.number().int().min(0).optional(),
  startDate: z.string().regex(dateRegex).optional(),
  endDate: z.string().regex(dateRegex).optional(),
  cutoffDate: z.string().regex(dateRegex).nullish(),
  status: groupStatusEnum.optional(),
  billingType: groupBillingTypeEnum.optional(),
  notes: z.string().max(5000).nullish(),
});
export type UpdateGroupInput = z.input<typeof updateGroupSchema>;

export const setGroupRoomBlocksSchema = z.object({
  groupId: z.string().min(1),
  blocks: z
    .array(
      z.object({
        roomTypeId: z.string().min(1),
        blockDate: z.string().regex(dateRegex),
        roomsBlocked: z.number().int().min(0),
      }),
    )
    .min(1),
});
export type SetGroupRoomBlocksInput = z.input<typeof setGroupRoomBlocksSchema>;

export const pickUpGroupRoomSchema = z
  .object({
    groupId: z.string().min(1),
    reservationInput: z.object({
      guestId: z.string().optional(),
      primaryGuestJson: z.object({
        firstName: z.string().min(1),
        lastName: z.string().min(1),
        email: z.string().email().optional(),
        phone: z.string().optional(),
      }),
      checkInDate: z.string().regex(dateRegex),
      checkOutDate: z.string().regex(dateRegex),
      adults: z.number().int().min(1).default(1),
      children: z.number().int().min(0).default(0),
      roomTypeId: z.string().min(1),
      roomId: z.string().optional(),
      ratePlanId: z.string().min(1).optional(),
      nightlyRateCents: z.number().int().min(0).optional(),
      sourceType: z
        .enum(['DIRECT', 'PHONE', 'WALKIN', 'BOOKING_ENGINE', 'OTA'])
        .default('DIRECT'),
      internalNotes: z.string().optional(),
      guestNotes: z.string().optional(),
      status: z.enum(['HOLD', 'CONFIRMED']).default('CONFIRMED'),
      restrictionOverride: z.boolean().default(false),
    }),
  })
  .refine(
    (data) => data.reservationInput.checkOutDate > data.reservationInput.checkInDate,
    {
      message: 'Check-out date must be after check-in date',
      path: ['reservationInput', 'checkOutDate'],
    },
  );
export type PickUpGroupRoomInput = z.input<typeof pickUpGroupRoomSchema>;

// ── Corporate Accounts ────────────────────────────────────────────

export const corporateBillingTypeEnum = z.enum([
  'direct_bill',
  'credit_card',
  'prepaid',
]);
export type CorporateBillingType = z.infer<typeof corporateBillingTypeEnum>;

export const createCorporateAccountSchema = z.object({
  propertyId: z.string().optional(),
  companyName: z.string().min(1).max(200),
  taxId: z.string().max(50).optional(),
  billingAddressJson: z.record(z.unknown()).optional(),
  contactName: z.string().max(200).optional(),
  contactEmail: z.string().email().optional(),
  contactPhone: z.string().max(50).optional(),
  defaultRatePlanId: z.string().optional(),
  negotiatedDiscountPct: z.number().min(0).max(100).optional(),
  billingType: corporateBillingTypeEnum.default('credit_card'),
  paymentTermsDays: z.number().int().min(0).optional(),
  creditLimitCents: z.number().int().min(0).optional(),
  notes: z.string().max(5000).optional(),
  clientRequestId: z.string().optional(),
});
export type CreateCorporateAccountInput = z.input<typeof createCorporateAccountSchema>;

export const updateCorporateAccountSchema = z.object({
  companyName: z.string().min(1).max(200).optional(),
  taxId: z.string().max(50).nullish(),
  billingAddressJson: z.record(z.unknown()).optional(),
  contactName: z.string().max(200).nullish(),
  contactEmail: z.string().email().nullish(),
  contactPhone: z.string().max(50).nullish(),
  defaultRatePlanId: z.string().nullish(),
  negotiatedDiscountPct: z.number().min(0).max(100).optional(),
  billingType: corporateBillingTypeEnum.optional(),
  paymentTermsDays: z.number().int().min(0).optional(),
  creditLimitCents: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
  notes: z.string().max(5000).nullish(),
});
export type UpdateCorporateAccountInput = z.input<typeof updateCorporateAccountSchema>;

export const setCorporateRateOverridesSchema = z.object({
  corporateAccountId: z.string().min(1),
  overrides: z
    .array(
      z.object({
        roomTypeId: z.string().min(1),
        negotiatedRateCents: z.number().int().min(0),
        startDate: z.string().regex(dateRegex).optional(),
        endDate: z.string().regex(dateRegex).optional(),
      }),
    )
    .min(1),
});
export type SetCorporateRateOverridesInput = z.input<typeof setCorporateRateOverridesSchema>;

// ── Pricing Rules ────────────────────────────────────────────────
export const pricingRuleTypeEnum = z.enum(['occupancy_threshold', 'day_of_week', 'lead_time', 'seasonal', 'event']);
export type PricingRuleType = z.infer<typeof pricingRuleTypeEnum>;

export const pricingAdjustmentTypeEnum = z.enum(['percentage', 'fixed']);
export type PricingAdjustmentType = z.infer<typeof pricingAdjustmentTypeEnum>;

export const pricingAdjustmentDirectionEnum = z.enum(['increase', 'decrease']);
export type PricingAdjustmentDirection = z.infer<typeof pricingAdjustmentDirectionEnum>;

export const pricingConditionsSchema = z.object({
  occupancyAbovePct: z.number().min(0).max(100).optional(),
  occupancyBelowPct: z.number().min(0).max(100).optional(),
  daysOfWeek: z.array(z.number().min(0).max(6)).optional(),
  leadTimeDaysMin: z.number().min(0).optional(),
  leadTimeDaysMax: z.number().min(0).optional(),
  dateRanges: z.array(z.object({
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  })).optional(),
  roomTypeIds: z.array(z.string()).optional(),
});
export type PricingConditions = z.infer<typeof pricingConditionsSchema>;

export const pricingAdjustmentsSchema = z.object({
  type: pricingAdjustmentTypeEnum,
  amount: z.number().min(0),
  direction: pricingAdjustmentDirectionEnum,
});
export type PricingAdjustments = z.infer<typeof pricingAdjustmentsSchema>;

export const createPricingRuleSchema = z.object({
  propertyId: z.string().min(1),
  name: z.string().min(1).max(200),
  ruleType: pricingRuleTypeEnum,
  priority: z.number().int().min(0).default(0),
  conditions: pricingConditionsSchema,
  adjustments: pricingAdjustmentsSchema,
  floorCents: z.number().int().min(0).optional(),
  ceilingCents: z.number().int().min(0).optional(),
  isActive: z.boolean().default(true),
  clientRequestId: z.string().optional(),
});
export type CreatePricingRuleInput = z.input<typeof createPricingRuleSchema>;

export const updatePricingRuleSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  ruleType: pricingRuleTypeEnum.optional(),
  priority: z.number().int().min(0).optional(),
  conditions: pricingConditionsSchema.optional(),
  adjustments: pricingAdjustmentsSchema.optional(),
  floorCents: z.number().int().min(0).nullable().optional(),
  ceilingCents: z.number().int().min(0).nullable().optional(),
  isActive: z.boolean().optional(),
});
export type UpdatePricingRuleInput = z.input<typeof updatePricingRuleSchema>;

export const runPricingEngineSchema = z.object({
  propertyId: z.string().min(1),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
export type RunPricingEngineInput = z.input<typeof runPricingEngineSchema>;

// ── Channel Manager ──────────────────────────────────────────────
export const channelCodeEnum = z.enum(['booking_com', 'expedia', 'airbnb', 'other']);
export type ChannelCode = z.infer<typeof channelCodeEnum>;

export const createChannelSchema = z.object({
  propertyId: z.string().min(1),
  channelCode: channelCodeEnum,
  displayName: z.string().min(1).max(200),
  apiCredentialsJson: z.record(z.unknown()).default({}),
  mappingJson: z.record(z.unknown()).default({}),
  isActive: z.boolean().default(true),
  clientRequestId: z.string().optional(),
});
export type CreateChannelInput = z.input<typeof createChannelSchema>;

export const updateChannelSchema = z.object({
  displayName: z.string().min(1).max(200).optional(),
  apiCredentialsJson: z.record(z.unknown()).optional(),
  mappingJson: z.record(z.unknown()).optional(),
  isActive: z.boolean().optional(),
});
export type UpdateChannelInput = z.input<typeof updateChannelSchema>;

export const syncChannelSchema = z.object({
  entityType: z.enum(['availability', 'rate', 'reservation', 'restriction']),
});
export type SyncChannelInput = z.input<typeof syncChannelSchema>;

// ── Booking Engine ───────────────────────────────────────────────
export const updateBookingEngineConfigSchema = z.object({
  propertyId: z.string().min(1),
  isActive: z.boolean().optional(),
  widgetThemeJson: z.record(z.unknown()).optional(),
  allowedRatePlanIds: z.array(z.string()).optional(),
  minLeadTimeHours: z.number().int().min(0).optional(),
  maxAdvanceDays: z.number().int().min(1).max(730).optional(),
  termsUrl: z.string().url().nullable().optional(),
  privacyUrl: z.string().url().nullable().optional(),
  confirmationTemplateId: z.string().nullable().optional(),
});
export type UpdateBookingEngineConfigInput = z.input<typeof updateBookingEngineConfigSchema>;

// ── Auto Room Assignment ────────────────────────────────────────
export const updateRoomAssignmentPreferencesSchema = z.object({
  propertyId: z.string().min(1),
  preferences: z.array(z.object({
    name: z.enum(['floor_preference', 'adjacency', 'accessibility', 'view', 'quiet']),
    weight: z.number().int().min(0).max(100),
    isActive: z.boolean().default(true),
  })).min(1),
});
export type UpdateRoomAssignmentPreferencesInput = z.input<typeof updateRoomAssignmentPreferencesSchema>;

export const runAutoAssignmentSchema = z.object({
  propertyId: z.string().min(1),
  targetDate: z.string().regex(dateRegex),
  reservationIds: z.array(z.string().min(1)).optional(),
});
export type RunAutoAssignmentInput = z.input<typeof runAutoAssignmentSchema>;

// ── Guest Self-Service Portal ────────────────────────────────────
export const createGuestPortalSessionSchema = z.object({
  reservationId: z.string().min(1),
  expiresInHours: z.number().int().min(1).max(720).optional(),
});
export type CreateGuestPortalSessionInput = z.input<typeof createGuestPortalSessionSchema>;

export const completePreCheckinSchema = z.object({
  guestDetails: z.object({
    email: z.string().email().optional(),
    phone: z.string().max(50).optional(),
    addressJson: z.record(z.unknown()).optional(),
  }).optional(),
  roomPreference: z.record(z.unknown()).optional(),
});
export type CompletePreCheckinInput = z.input<typeof completePreCheckinSchema>;

// ── Loyalty/Points ───────────────────────────────────────────────
export const createLoyaltyProgramSchema = z.object({
  name: z.string().min(1).max(200),
  pointsPerDollar: z.number().int().min(0).default(10),
  pointsPerNight: z.number().int().min(0).default(0),
  redemptionValueCents: z.number().int().min(0).default(1),
  tiersJson: z.array(z.object({
    name: z.string().min(1),
    minPoints: z.number().int().min(0),
    multiplier: z.number().min(1).default(1),
    perks: z.array(z.string()).default([]),
  })).default([]),
  isActive: z.boolean().default(true),
});
export type CreateLoyaltyProgramInput = z.input<typeof createLoyaltyProgramSchema>;

export const updateLoyaltyProgramSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  pointsPerDollar: z.number().int().min(0).optional(),
  pointsPerNight: z.number().int().min(0).optional(),
  redemptionValueCents: z.number().int().min(0).optional(),
  tiersJson: z.array(z.object({
    name: z.string().min(1),
    minPoints: z.number().int().min(0),
    multiplier: z.number().min(1).default(1),
    perks: z.array(z.string()).default([]),
  })).optional(),
  isActive: z.boolean().optional(),
});
export type UpdateLoyaltyProgramInput = z.input<typeof updateLoyaltyProgramSchema>;

export const enrollLoyaltyGuestSchema = z.object({
  guestId: z.string().min(1),
  programId: z.string().min(1),
});
export type EnrollLoyaltyGuestInput = z.input<typeof enrollLoyaltyGuestSchema>;

export const earnLoyaltyPointsSchema = z.object({
  memberId: z.string().min(1),
  points: z.number().int().min(1),
  reservationId: z.string().optional(),
  description: z.string().max(500).optional(),
});
export type EarnLoyaltyPointsInput = z.input<typeof earnLoyaltyPointsSchema>;

export const redeemLoyaltyPointsSchema = z.object({
  memberId: z.string().min(1),
  points: z.number().int().min(1),
  reservationId: z.string().optional(),
  description: z.string().max(500).optional(),
});
export type RedeemLoyaltyPointsInput = z.input<typeof redeemLoyaltyPointsSchema>;

export const adjustLoyaltyPointsSchema = z.object({
  memberId: z.string().min(1),
  points: z.number().int(),
  reason: z.string().min(1).max(500),
});
export type AdjustLoyaltyPointsInput = z.input<typeof adjustLoyaltyPointsSchema>;
