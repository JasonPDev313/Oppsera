import { ConflictError } from '@oppsera/shared';

/**
 * PMS Error Codes (used in API error responses):
 *
 * | Code                        | HTTP | When                                    |
 * |-----------------------------|------|-----------------------------------------|
 * | ROOM_ALREADY_BOOKED         | 409  | Room+date overlap detected              |
 * | ROOM_OUT_OF_ORDER           | 409  | Target room is OOO                      |
 * | INVALID_STATUS_TRANSITION   | 409  | Status change not allowed               |
 * | CONCURRENCY_CONFLICT        | 409  | Version mismatch on write               |
 * | RESERVATION_NOT_MOVABLE     | 409  | Status is terminal (cancelled, etc.)    |
 * | FOLIO_NOT_OPEN              | 409  | Folio already closed                    |
 * | VALIDATION_ERROR            | 400  | Input validation failure                |
 * | NOT_FOUND                   | 404  | Entity not found                        |
 */

export class RoomAlreadyBookedError extends ConflictError {
  constructor(roomId: string, startDate: string, endDate: string) {
    super(`Room ${roomId} is already booked for ${startDate}–${endDate}`);
    this.code = 'ROOM_ALREADY_BOOKED';
  }
}

export class RoomOutOfOrderError extends ConflictError {
  constructor(roomId: string) {
    super(`Room ${roomId} is out of order`);
    this.code = 'ROOM_OUT_OF_ORDER';
  }
}

export class InvalidStatusTransitionError extends ConflictError {
  constructor(entity: string, from: string, to: string) {
    super(`Cannot transition ${entity} from ${from} to ${to}`);
    this.code = 'INVALID_STATUS_TRANSITION';
  }
}

export class ConcurrencyConflictError extends ConflictError {
  constructor(entityId: string) {
    super(`Entity ${entityId} was modified by another user. Please refresh and try again.`);
    this.code = 'CONCURRENCY_CONFLICT';
  }
}

export class ReservationNotMovableError extends ConflictError {
  constructor(status: string) {
    super(`Cannot move a ${status.toLowerCase()} reservation`);
    this.code = 'RESERVATION_NOT_MOVABLE';
  }
}

export class FolioNotOpenError extends ConflictError {
  constructor(folioId: string) {
    super(`Folio ${folioId} is already closed`);
    this.code = 'FOLIO_NOT_OPEN';
  }
}
