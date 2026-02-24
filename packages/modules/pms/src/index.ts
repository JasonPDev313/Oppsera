export const MODULE_KEY = 'pms' as const;
export const MODULE_NAME = 'Property Management System';
export const MODULE_VERSION = '0.0.1';

// Schema re-exports (from @oppsera/db)
export {
  pmsProperties,
  pmsRoomTypes,
  pmsRooms,
  pmsRatePlans,
  pmsRatePlanPrices,
  pmsGuests,
  pmsReservations,
  pmsRoomBlocks,
  pmsFolios,
  pmsFolioEntries,
  pmsRoomStatusLog,
  pmsAuditLog,
  pmsIdempotencyKeys,
  pmsOutbox,
  rmPmsCalendarSegments,
  rmPmsDailyOccupancy,
} from '@oppsera/db';

// Validation schemas
export {
  createPropertySchema,
  updatePropertySchema,
  createRoomTypeSchema,
  updateRoomTypeSchema,
  createRoomSchema,
  updateRoomSchema,
  updateRoomStatusSchema,
  createRatePlanSchema,
  updateRatePlanSchema,
  setRatePlanPriceSchema,
  createGuestSchema,
  updateGuestSchema,
  createReservationSchema,
  updateReservationSchema,
  cancelReservationSchema,
  markNoShowSchema,
  calendarMoveSchema,
  calendarResizeSchema,
  checkInSchema,
  checkOutSchema,
  moveRoomSchema,
  updateRoomHousekeepingSchema,
  postFolioEntrySchema,
  setOutOfOrderSchema,
} from './validation';

export type {
  CreatePropertyInput,
  UpdatePropertyInput,
  CreateRoomTypeInput,
  UpdateRoomTypeInput,
  CreateRoomInput,
  UpdateRoomInput,
  UpdateRoomStatusInput,
  CreateRatePlanInput,
  UpdateRatePlanInput,
  SetRatePlanPriceInput,
  CreateGuestInput,
  UpdateGuestInput,
  CreateReservationInput,
  UpdateReservationInput,
  CancelReservationInput,
  MarkNoShowInput,
  CalendarMoveInput,
  CalendarResizeInput,
  CheckInInput,
  CheckOutInput,
  MoveRoomInput,
  UpdateRoomHousekeepingInput,
  PostFolioEntryInput,
  SetOutOfOrderInput,
} from './validation';

// Permissions
export { PMS_PERMISSIONS, PMS_ROLE_PERMISSIONS, PMS_ROLES } from './permissions';
export type { PmsPermission } from './permissions';

// Types
export {
  ReservationStatus,
  RoomStatus,
  BlockType,
  SourceType,
  FolioEntryType,
  FolioStatus,
  ResizeEdge,
} from './types';
export type { PrimaryGuestJson } from './types';

// State machines
export {
  RESERVATION_TRANSITIONS,
  ACTIVE_RESERVATION_STATUSES,
  IMMOVABLE_STATUSES,
  canTransitionReservation,
  assertReservationTransition,
  ROOM_STATUS_TRANSITIONS,
  canTransitionRoom,
  assertRoomTransition,
} from './state-machines';

// Events
export { PMS_EVENTS } from './events/types';
export type { PmsEventType } from './events/types';
export { handleCalendarProjection, handleOccupancyProjection } from './events/consumers';
export type * from './events/payloads';

// Errors
export {
  RoomAlreadyBookedError,
  RoomOutOfOrderError,
  InvalidStatusTransitionError,
  ConcurrencyConflictError,
  ReservationNotMovableError,
  FolioNotOpenError,
} from './errors';

// Helpers
export { bootstrapPropertiesFromLocations } from './helpers/bootstrap-properties';

// Commands
export { createProperty } from './commands/create-property';
export { updateProperty } from './commands/update-property';
export { createRoomType } from './commands/create-room-type';
export { updateRoomType } from './commands/update-room-type';
export { createRoom } from './commands/create-room';
export { updateRoom } from './commands/update-room';
export { setRoomOutOfOrder } from './commands/set-room-out-of-order';
export { clearRoomOutOfOrder } from './commands/clear-room-out-of-order';
export { updateRoomHousekeeping } from './commands/update-room-housekeeping';
export { createRatePlan } from './commands/create-rate-plan';
export { updateRatePlan } from './commands/update-rate-plan';
export { setRatePlanPrices } from './commands/set-rate-plan-prices';
export { createGuest } from './commands/create-guest';
export { updateGuest } from './commands/update-guest';
export { createReservation } from './commands/create-reservation';
export { updateReservation } from './commands/update-reservation';
export { cancelReservation } from './commands/cancel-reservation';
export { markNoShow } from './commands/mark-no-show';
export { moveReservation } from './commands/move-reservation';
export { resizeReservation } from './commands/resize-reservation';
export { checkIn } from './commands/check-in';
export { checkOut } from './commands/check-out';
export { moveRoom } from './commands/move-room';
export { updateRoomStatus } from './commands/update-room-status';
export { postFolioEntry } from './commands/post-folio-entry';
export { closeFolio } from './commands/close-folio';

// Queries
export {
  listProperties,
  getProperty,
  listRoomTypes,
  getRoomType,
  listRooms,
  getRoom,
  listRatePlans,
  getRatePlan,
  getNightlyRate,
  getRatePlanPrices,
  searchGuests,
  getGuest,
  listReservations,
  getReservation,
  suggestAvailableRooms,
  listHousekeepingRooms,
  getFolio,
  getFolioByReservation,
  getCalendarWeek,
  getCalendarDay,
  getDailyOccupancy,
} from './queries';

export type {
  PropertyListItem,
  ListPropertiesResult,
  PropertyDetail,
  RoomTypeListItem,
  ListRoomTypesResult,
  RoomTypeDetail,
  RoomListItem,
  ListRoomsResult,
  RoomDetail,
  RatePlanListItem,
  ListRatePlansResult,
  RatePlanDetail,
  RatePlanPrice,
  NightlyRateResult,
  RatePlanPriceRow,
  GuestSearchItem,
  SearchGuestsResult,
  GuestDetail,
  GuestReservationSummary,
  CalendarWeekResponse,
  CalendarRoom,
  CalendarSegment,
  OooBlock,
  OccupancyByDate,
  CalendarDayResponse,
  UnassignedReservation,
  DailyOccupancyRow,
} from './queries';

// Background Jobs
export {
  runNightlyChargePosting,
  runNoShowMarking,
  runHousekeepingAutoDirty,
} from './jobs';
export type {
  NightlyChargeResult,
  NoShowResult,
  AutoDirtyResult,
} from './jobs';
