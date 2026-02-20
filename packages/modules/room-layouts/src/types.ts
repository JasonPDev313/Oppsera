import type { InferSelectModel } from 'drizzle-orm';
import type {
  floorPlanRooms,
  floorPlanVersions,
  floorPlanTemplatesV2,
} from './schema';

// ── DB row types ────────────────────────────────────────────────

export type FloorPlanRoom = InferSelectModel<typeof floorPlanRooms>;
export type FloorPlanVersion = InferSelectModel<typeof floorPlanVersions>;
export type FloorPlanTemplate = InferSelectModel<typeof floorPlanTemplatesV2>;

// ── Re-export shared canvas types ───────────────────────────────

export type {
  CanvasSnapshot,
  CanvasObject,
  ObjectType,
  ObjectStyle,
  LayerInfo,
  TableProperties,
  TableShape,
  TableStatus,
  BarProperties,
  StageProperties,
  ServiceZoneProperties,
  TextLabelProperties,
  BuffetProperties,
  RoomUnit,
  RoomMode,
  TemplateCategory,
  VersionStatus,
} from '@oppsera/shared';
