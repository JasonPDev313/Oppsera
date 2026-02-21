import { registerContracts } from '@oppsera/core/events/contracts';
import {
  RoomCreatedDataSchema,
  RoomUpdatedDataSchema,
  RoomArchivedDataSchema,
  RoomRestoredDataSchema,
  VersionSavedDataSchema,
  VersionPublishedDataSchema,
  VersionRevertedDataSchema,
  TemplateCreatedDataSchema,
} from './types';

registerContracts({
  moduleName: 'room-layouts',
  emits: [
    { eventType: 'room_layouts.room.created.v1', dataSchema: RoomCreatedDataSchema },
    { eventType: 'room_layouts.room.updated.v1', dataSchema: RoomUpdatedDataSchema },
    { eventType: 'room_layouts.room.archived.v1', dataSchema: RoomArchivedDataSchema },
    { eventType: 'room_layouts.room.restored.v1', dataSchema: RoomRestoredDataSchema },
    { eventType: 'room_layouts.version.saved.v1', dataSchema: VersionSavedDataSchema },
    { eventType: 'room_layouts.version.published.v1', dataSchema: VersionPublishedDataSchema },
    { eventType: 'room_layouts.version.reverted.v1', dataSchema: VersionRevertedDataSchema },
    { eventType: 'room_layouts.template.created.v1', dataSchema: TemplateCreatedDataSchema },
  ],
  consumes: [],
});
