export const MODULE_KEY = 'room_layouts' as const;
export const MODULE_NAME = 'Room Layout Builder';
export const MODULE_VERSION = '0.1.0';

// Register event contracts (side-effect import)
import './events/contracts';

// Schema re-exports
export { floorPlanRooms, floorPlanVersions, floorPlanTemplatesV2 } from './schema';

// Types
export type {
  FloorPlanRoom,
  FloorPlanVersion,
  FloorPlanTemplate,
} from './types';

// Commands
export {
  createRoom,
  updateRoom,
  archiveRoom,
  unarchiveRoom,
  saveDraft,
  publishVersion,
  revertToVersion,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  applyTemplate,
  duplicateRoom,
} from './commands';

// Validation schemas + types
export {
  createRoomSchema,
  updateRoomSchema,
  saveDraftSchema,
  publishVersionSchema,
  createTemplateSchema,
  roomListFilterSchema,
} from './validation';
export type {
  CreateRoomInput,
  UpdateRoomInput,
  SaveDraftInput,
  PublishVersionInput,
  CreateTemplateInput,
  RoomListFilterInput,
} from './validation';

// Queries
export {
  listRooms,
  getRoom,
  getRoomForEditor,
  getVersionHistory,
  getVersion,
  listTemplates,
  getTemplate,
} from './queries';
export type {
  ListRoomsInput, ListRoomsResult, RoomListRow,
  RoomDetail,
  RoomEditorData,
  VersionHistoryInput, VersionHistoryResult, VersionHistoryRow,
  VersionDetail,
  ListTemplatesInput, ListTemplatesResult, TemplateListRow,
  TemplateDetail,
} from './queries';

// Event types
export { ROOM_LAYOUT_EVENTS } from './events/types';

// Helpers
export { computeSnapshotStats, generateRoomSlug, reassignObjectIds } from './helpers';
