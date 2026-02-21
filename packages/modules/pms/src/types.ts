// ── Reservation Statuses ─────────────────────────────────────────
export const ReservationStatus = {
  HOLD: 'HOLD',
  CONFIRMED: 'CONFIRMED',
  CHECKED_IN: 'CHECKED_IN',
  CHECKED_OUT: 'CHECKED_OUT',
  CANCELLED: 'CANCELLED',
  NO_SHOW: 'NO_SHOW',
} as const;
export type ReservationStatus = (typeof ReservationStatus)[keyof typeof ReservationStatus];

// ── Room Statuses ────────────────────────────────────────────────
export const RoomStatus = {
  VACANT_CLEAN: 'VACANT_CLEAN',
  VACANT_DIRTY: 'VACANT_DIRTY',
  OCCUPIED: 'OCCUPIED',
  OUT_OF_ORDER: 'OUT_OF_ORDER',
} as const;
export type RoomStatus = (typeof RoomStatus)[keyof typeof RoomStatus];

// ── Room Block Types ─────────────────────────────────────────────
export const BlockType = {
  RESERVATION: 'RESERVATION',
  MAINTENANCE: 'MAINTENANCE',
  HOUSE_USE: 'HOUSE_USE',
  HOLD: 'HOLD',
} as const;
export type BlockType = (typeof BlockType)[keyof typeof BlockType];

// ── Reservation Source Types ─────────────────────────────────────
export const SourceType = {
  DIRECT: 'DIRECT',
  PHONE: 'PHONE',
  WALKIN: 'WALKIN',
  BOOKING_ENGINE: 'BOOKING_ENGINE',
  OTA: 'OTA',
} as const;
export type SourceType = (typeof SourceType)[keyof typeof SourceType];

// ── Folio Entry Types ────────────────────────────────────────────
export const FolioEntryType = {
  ROOM_CHARGE: 'ROOM_CHARGE',
  TAX: 'TAX',
  FEE: 'FEE',
  ADJUSTMENT: 'ADJUSTMENT',
  PAYMENT: 'PAYMENT',
  REFUND: 'REFUND',
} as const;
export type FolioEntryType = (typeof FolioEntryType)[keyof typeof FolioEntryType];

// ── Folio Statuses ───────────────────────────────────────────────
export const FolioStatus = {
  OPEN: 'OPEN',
  CLOSED: 'CLOSED',
} as const;
export type FolioStatus = (typeof FolioStatus)[keyof typeof FolioStatus];

// ── Calendar Resize Edge ─────────────────────────────────────────
export const ResizeEdge = {
  LEFT: 'LEFT',
  RIGHT: 'RIGHT',
} as const;
export type ResizeEdge = (typeof ResizeEdge)[keyof typeof ResizeEdge];

// ── Guest JSON shape ─────────────────────────────────────────────
export interface PrimaryGuestJson {
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
}
