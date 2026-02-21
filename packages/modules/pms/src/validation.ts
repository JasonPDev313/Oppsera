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

// ── Out of Order ─────────────────────────────────────────────────
export const setOutOfOrderSchema = z.object({
  reason: z.string().min(1),
  startDate: z.string().regex(dateRegex).optional(),
  endDate: z.string().regex(dateRegex).optional(),
});
export type SetOutOfOrderInput = z.input<typeof setOutOfOrderSchema>;
