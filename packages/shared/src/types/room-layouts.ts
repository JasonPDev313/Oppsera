// ── Object Types ────────────────────────────────────────────────

export type ObjectType =
  | 'table'
  | 'chair'
  | 'wall'
  | 'door'
  | 'window'
  | 'stage'
  | 'bar'
  | 'buffet'
  | 'dance_floor'
  | 'divider'
  | 'text_label'
  | 'decoration'
  | 'service_zone'
  | 'station';

// ── Object Style ────────────────────────────────────────────────

export interface ObjectStyle {
  fill: string;
  stroke: string;
  strokeWidth: number;
  opacity: number;
  cornerRadius?: number;
}

// ── Canvas Object ───────────────────────────────────────────────

export interface CanvasObject {
  id: string;
  type: ObjectType;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  layerId: string;
  zIndex: number;
  locked: boolean;
  visible: boolean;
  name: string;
  properties: Record<string, unknown>;
  style: ObjectStyle;
}

// ── Layer Info ───────────────────────────────────────────────────

export interface LayerInfo {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  sortOrder: number;
}

// ── Canvas Snapshot ──────────────────────────────────────────────

export interface CanvasSnapshot {
  formatVersion: 1;
  objects: CanvasObject[];
  layers: LayerInfo[];
  metadata: {
    lastEditedAt: string;
    lastEditedBy: string;
    objectCount: number;
    totalCapacity: number;
  };
}

// ── Table Properties ────────────────────────────────────────────

export type TableShape = 'round' | 'square' | 'rectangle' | 'oval';

export type TableStatus = 'available' | 'reserved' | 'occupied' | 'blocked';

export interface TableProperties {
  tableNumber: string;
  shape: TableShape;
  seats: number;
  minSeats: number;
  maxSeats: number;
  status: TableStatus;
  section: string;
  serverAssignment: string;
  isJoinable: boolean;
}

// ── Bar Properties ──────────────────────────────────────────────

export interface BarProperties {
  barName: string;
  seatCount: number;
  hasServiceWell: boolean;
}

// ── Stage Properties ────────────────────────────────────────────

export interface StageProperties {
  stageName: string;
  stageType: 'performance' | 'presentation' | 'dance';
  hasCurtain: boolean;
}

// ── Service Zone Properties ─────────────────────────────────────

export interface ServiceZoneProperties {
  zoneName: string;
  zoneType: 'server' | 'bus' | 'host' | 'kitchen' | 'custom';
  assignedTo: string;
  color: string;
}

// ── Text Label Properties ───────────────────────────────────────

export interface TextLabelProperties {
  text: string;
  fontSize: number;
  fontFamily: string;
  fontWeight: 'normal' | 'bold';
  textAlign: 'left' | 'center' | 'right';
}

// ── Buffet Properties ───────────────────────────────────────────

export interface BuffetProperties {
  stationName: string;
  stationType: 'hot' | 'cold' | 'dessert' | 'beverage' | 'custom';
}

// ── Station Properties ──────────────────────────────────────────

export type StationType = 'pos_terminal' | 'wait_station' | 'bus_station' | 'host_stand' | 'bar_station';

export interface StationProperties {
  stationName: string;
  stationType: StationType;
  terminalId: string;
}

// ── Room Unit ───────────────────────────────────────────────────

export type RoomUnit = 'feet' | 'meters';

// ── Room Mode ───────────────────────────────────────────────────

export type RoomMode = 'dining' | 'banquet' | 'cocktail' | 'theater' | 'custom';

// ── Template Category ───────────────────────────────────────────

export type TemplateCategory = 'dining' | 'banquet' | 'bar' | 'patio' | 'custom';

// ── Version Status ──────────────────────────────────────────────

export type VersionStatus = 'draft' | 'published' | 'archived';
