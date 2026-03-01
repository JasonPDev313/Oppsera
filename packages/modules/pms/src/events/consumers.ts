/**
 * PMS event consumer registration.
 * Re-exports handlers for use by the event bus in instrumentation.ts.
 */
export { handleCalendarProjection } from './projectors/calendar-projector';
export { handleOccupancyProjection } from './projectors/occupancy-projector';

// POS → PMS integration consumers (tender.recorded.v1)
export { handleRoomChargeTender, handleFolioSettlementTender } from '../consumers/pos-tender-consumer';
