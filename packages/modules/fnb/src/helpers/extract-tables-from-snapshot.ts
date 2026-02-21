/**
 * Extracts table entities from a floor plan snapshot JSON.
 * This bridges the room-layouts module (design-time) with the F&B module (runtime).
 *
 * Floor plan snapshots contain CanvasObject[] where type='table' objects
 * have TableProperties in their `properties` field.
 */

export interface FloorPlanTableEntry {
  floorPlanObjectId: string;
  tableNumber: number;
  displayLabel: string;
  capacityMin: number;
  capacityMax: number;
  shape: string;
  isCombinable: boolean;
  positionX: number;
  positionY: number;
  width: number;
  height: number;
  rotation: number;
}

interface SnapshotObject {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  name: string;
  properties: Record<string, unknown>;
}

interface Snapshot {
  formatVersion: number;
  objects: SnapshotObject[];
  layers?: unknown[];
  metadata?: Record<string, unknown>;
}

/**
 * Parse a floor plan snapshot and return table entries.
 * Filters to objects with type='table' and extracts TableProperties.
 */
export function extractTablesFromSnapshot(
  snapshotJson: Record<string, unknown>,
): FloorPlanTableEntry[] {
  const snapshot = snapshotJson as unknown as Snapshot;
  if (!snapshot?.objects || !Array.isArray(snapshot.objects)) {
    return [];
  }

  const tableObjects = snapshot.objects.filter((obj) => obj.type === 'table');

  // Collect explicitly numbered tables first to avoid collisions during auto-assignment
  const explicitNumbers = new Set<number>();
  const rawEntries = tableObjects.map((obj) => {
    const props = obj.properties ?? {};
    const tableNumber = parseInt(String(props.tableNumber ?? '0'), 10) || 0;
    if (tableNumber > 0) explicitNumbers.add(tableNumber);
    return { obj, tableNumber };
  });

  // Auto-assign numbers to tables that don't have one
  let nextAutoNumber = 1;
  function getNextAutoNumber(): number {
    while (explicitNumbers.has(nextAutoNumber)) nextAutoNumber++;
    const num = nextAutoNumber;
    explicitNumbers.add(num);
    nextAutoNumber++;
    return num;
  }

  return rawEntries.map(({ obj, tableNumber }) => {
    const props = obj.properties ?? {};
    const assignedNumber = tableNumber > 0 ? tableNumber : getNextAutoNumber();
    const seats = Number(props.seats ?? props.maxSeats ?? 4);
    const minSeats = Number(props.minSeats ?? 1);
    const maxSeats = Number(props.maxSeats ?? seats);
    const shape = String(props.shape ?? 'square');
    const isJoinable = props.isJoinable !== false;

    return {
      floorPlanObjectId: obj.id,
      tableNumber: assignedNumber,
      displayLabel: obj.name || `Table ${assignedNumber}`,
      capacityMin: Math.max(1, minSeats),
      capacityMax: Math.max(1, maxSeats),
      shape: normalizeShape(shape),
      isCombinable: isJoinable,
      positionX: obj.x,
      positionY: obj.y,
      width: obj.width,
      height: obj.height,
      rotation: obj.rotation,
    };
  });
}

function normalizeShape(shape: string): string {
  const mapping: Record<string, string> = {
    round: 'round',
    circle: 'round',
    square: 'square',
    rectangle: 'rectangle',
    rect: 'rectangle',
    oval: 'oval',
    ellipse: 'oval',
  };
  return mapping[shape.toLowerCase()] ?? 'square';
}
