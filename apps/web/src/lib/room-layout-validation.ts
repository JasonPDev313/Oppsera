import type { CanvasObject, ObjectType } from '@oppsera/shared';

// ── Valid object types ─────────────────────────────────────────────
const VALID_OBJECT_TYPES: ObjectType[] = [
  'table', 'chair', 'wall', 'door', 'window', 'stage', 'bar', 'buffet',
  'dance_floor', 'divider', 'text_label', 'decoration', 'service_zone', 'station',
];

// ── Validation result ──────────────────────────────────────────────
export interface ValidationIssue {
  level: 'error' | 'warning';
  field: string;
  message: string;
}

// ── Room validation ────────────────────────────────────────────────
export function validateRoom(input: {
  name: string;
  widthFt: number;
  heightFt: number;
  gridSizeFt: number;
  scalePxPerFt: number;
}): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!input.name || input.name.trim().length === 0) {
    issues.push({ level: 'error', field: 'name', message: 'Room name is required' });
  } else if (input.name.trim().length > 100) {
    issues.push({ level: 'error', field: 'name', message: 'Room name must be 100 characters or less' });
  }

  if (input.widthFt < 5 || input.widthFt > 500) {
    issues.push({ level: 'error', field: 'widthFt', message: 'Width must be between 5 and 500 ft' });
  }

  if (input.heightFt < 5 || input.heightFt > 500) {
    issues.push({ level: 'error', field: 'heightFt', message: 'Height must be between 5 and 500 ft' });
  }

  if (input.gridSizeFt < 0.25 || input.gridSizeFt > 10) {
    issues.push({ level: 'error', field: 'gridSizeFt', message: 'Grid size must be between 0.25 and 10 ft' });
  }

  if (input.scalePxPerFt < 5 || input.scalePxPerFt > 100) {
    issues.push({ level: 'error', field: 'scalePxPerFt', message: 'Scale must be between 5 and 100 px/ft' });
  }

  return issues;
}

// ── Object validation ──────────────────────────────────────────────
export function validateObjects(
  objects: CanvasObject[],
  roomWidthFt: number,
  roomHeightFt: number,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Check for duplicate IDs
  const idSet = new Set<string>();
  for (const obj of objects) {
    if (idSet.has(obj.id)) {
      issues.push({ level: 'error', field: `object.${obj.id}`, message: `Duplicate object ID: ${obj.id}` });
    }
    idSet.add(obj.id);
  }

  for (const obj of objects) {
    // Valid type
    if (!VALID_OBJECT_TYPES.includes(obj.type)) {
      issues.push({ level: 'error', field: `object.${obj.id}.type`, message: `Invalid object type: ${obj.type}` });
    }

    // Position within bounds (warning only)
    if (obj.x < 0 || obj.y < 0 || obj.x > roomWidthFt || obj.y > roomHeightFt) {
      issues.push({ level: 'warning', field: `object.${obj.id}.position`, message: `Object "${obj.name}" is outside room bounds` });
    }

    // Table-specific validation
    if (obj.type === 'table') {
      const seats = (obj.properties as { seats?: number }).seats;
      if (typeof seats !== 'number' || seats < 1) {
        issues.push({ level: 'warning', field: `object.${obj.id}.seats`, message: `Table "${obj.name}" should have at least 1 seat` });
      }
    }
  }

  return issues;
}

// ── Publish validation ─────────────────────────────────────────────
export function validateForPublish(
  objects: CanvasObject[],
  roomWidthFt: number,
  roomHeightFt: number,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Must have at least 1 object
  if (objects.length === 0) {
    issues.push({ level: 'error', field: 'objects', message: 'Room must have at least 1 object to publish' });
  }

  // Tables should have table numbers
  const tables = objects.filter((o) => o.type === 'table');
  for (const table of tables) {
    const tableNumber = (table.properties as { tableNumber?: string }).tableNumber;
    if (!tableNumber || tableNumber.trim() === '') {
      issues.push({ level: 'warning', field: `object.${table.id}.tableNumber`, message: `Table "${table.name}" has no table number` });
    }
  }

  // Total capacity > 0
  let totalCapacity = 0;
  for (const obj of objects) {
    if (obj.type === 'table') {
      const seats = (obj.properties as { seats?: number }).seats;
      if (typeof seats === 'number') totalCapacity += seats;
    } else if (obj.type === 'bar') {
      const seatCount = (obj.properties as { seatCount?: number }).seatCount;
      if (typeof seatCount === 'number') totalCapacity += seatCount;
    }
  }
  if (totalCapacity === 0 && tables.length > 0) {
    issues.push({ level: 'warning', field: 'capacity', message: 'Total seating capacity is 0' });
  }

  // Check for overlapping tables (warning)
  for (let i = 0; i < tables.length; i++) {
    for (let j = i + 1; j < tables.length; j++) {
      const a = tables[i]!;
      const b = tables[j]!;
      if (
        a.x < b.x + b.width && a.x + a.width > b.x &&
        a.y < b.y + b.height && a.y + a.height > b.y
      ) {
        issues.push({
          level: 'warning',
          field: `overlap.${a.id}.${b.id}`,
          message: `Tables "${a.name}" and "${b.name}" overlap`,
        });
      }
    }
  }

  // Also run object validation
  issues.push(...validateObjects(objects, roomWidthFt, roomHeightFt));

  return issues;
}

// ── Helpers ────────────────────────────────────────────────────────
export function hasErrors(issues: ValidationIssue[]): boolean {
  return issues.some((i) => i.level === 'error');
}

export function hasWarnings(issues: ValidationIssue[]): boolean {
  return issues.some((i) => i.level === 'warning');
}
