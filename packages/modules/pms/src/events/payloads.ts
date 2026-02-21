/**
 * PMS domain event payload interfaces.
 * All payloads are self-contained — consumers never query other modules' tables.
 */

export interface ReservationCreatedPayload {
  reservationId: string;
  propertyId: string;
  guestId: string | null;
  guestName: string;
  roomId: string | null;
  roomTypeId: string;
  checkInDate: string;
  checkOutDate: string;
  status: string;
  sourceType: string;
  nightlyRateCents: number;
  totalCents: number;
  version: number;
}

export interface ReservationUpdatedPayload {
  reservationId: string;
  propertyId: string;
  version: number;
  changes: string[];
}

export interface ReservationMovedPayload {
  reservationId: string;
  propertyId: string;
  before: {
    roomId: string | null;
    checkInDate: string;
    checkOutDate: string;
  };
  after: {
    roomId: string | null;
    checkInDate: string;
    checkOutDate: string;
  };
  guestName: string;
  status: string;
  version: number;
  resized: boolean;
}

export interface ReservationCancelledPayload {
  reservationId: string;
  propertyId: string;
  guestName: string;
  roomId: string | null;
  checkInDate: string;
  checkOutDate: string;
  previousStatus: string;
  version: number;
}

export interface ReservationCheckedInPayload {
  reservationId: string;
  propertyId: string;
  guestName: string;
  roomId: string;
  checkInDate: string;
  checkOutDate: string;
  earlyCheckIn: boolean;
  version: number;
}

export interface ReservationCheckedOutPayload {
  reservationId: string;
  propertyId: string;
  guestName: string;
  roomId: string | null;
  checkInDate: string;
  checkOutDate: string;
  lateCheckOut: boolean;
  version: number;
}

export interface ReservationNoShowPayload {
  reservationId: string;
  propertyId: string;
  guestName: string;
  roomId: string | null;
  checkInDate: string;
  checkOutDate: string;
  version: number;
}

export interface RoomStatusChangedPayload {
  roomId: string;
  propertyId: string;
  fromStatus: string;
  toStatus: string;
  reason: string | null;
  businessDate: string;
}

export interface FolioChargePostedPayload {
  folioId: string;
  reservationId: string | null;
  entryId: string;
  entryType: string;
  amountCents: number;
}

export interface FolioClosedPayload {
  folioId: string;
  reservationId: string | null;
  totalCents: number;
}
