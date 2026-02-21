import { z } from 'zod';

// ── Event type constants ────────────────────────────────────────

export const ROOM_LAYOUT_EVENTS = {
  ROOM_CREATED: 'room_layouts.room.created.v1',
  ROOM_UPDATED: 'room_layouts.room.updated.v1',
  ROOM_ARCHIVED: 'room_layouts.room.archived.v1',
  ROOM_RESTORED: 'room_layouts.room.restored.v1',
  VERSION_SAVED: 'room_layouts.version.saved.v1',
  VERSION_PUBLISHED: 'room_layouts.version.published.v1',
  VERSION_REVERTED: 'room_layouts.version.reverted.v1',
  TEMPLATE_CREATED: 'room_layouts.template.created.v1',
} as const;

// ── Event data schemas ──────────────────────────────────────────

export const RoomCreatedDataSchema = z.object({
  roomId: z.string(),
  locationId: z.string(),
  name: z.string(),
  slug: z.string(),
  widthFt: z.number(),
  heightFt: z.number(),
  unit: z.string(),
});

export const RoomUpdatedDataSchema = z.object({
  roomId: z.string(),
  locationId: z.string(),
  name: z.string(),
  changes: z.record(z.unknown()),
});

export const RoomArchivedDataSchema = z.object({
  roomId: z.string(),
  locationId: z.string(),
  name: z.string(),
  reason: z.string().nullable(),
});

export const RoomRestoredDataSchema = z.object({
  roomId: z.string(),
  locationId: z.string(),
  name: z.string(),
});

export const VersionSavedDataSchema = z.object({
  versionId: z.string(),
  roomId: z.string(),
  versionNumber: z.number(),
  objectCount: z.number(),
  totalCapacity: z.number(),
});

export const VersionPublishedDataSchema = z.object({
  versionId: z.string(),
  roomId: z.string(),
  versionNumber: z.number(),
  objectCount: z.number(),
  totalCapacity: z.number(),
  publishNote: z.string().nullable(),
});

export const VersionRevertedDataSchema = z.object({
  versionId: z.string(),
  roomId: z.string(),
  fromVersionNumber: z.number(),
  toVersionNumber: z.number(),
});

export const TemplateCreatedDataSchema = z.object({
  templateId: z.string(),
  name: z.string(),
  category: z.string(),
  objectCount: z.number(),
  totalCapacity: z.number(),
});
