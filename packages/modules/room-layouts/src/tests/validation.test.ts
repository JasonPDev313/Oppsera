import { describe, it, expect } from 'vitest';
import {
  createRoomSchema,
  updateRoomSchema,
  saveDraftSchema,
  publishVersionSchema,
  createTemplateSchema,
  roomListFilterSchema,
} from '../validation';

describe('createRoomSchema', () => {
  it('accepts valid input with required fields', () => {
    const result = createRoomSchema.safeParse({
      name: 'Main Dining',
      locationId: 'loc_123',
      widthFt: 40,
      heightFt: 30,
    });
    expect(result.success).toBe(true);
  });

  it('accepts valid input with all optional fields', () => {
    const result = createRoomSchema.safeParse({
      name: 'Patio',
      locationId: 'loc_123',
      widthFt: 25.5,
      heightFt: 20,
      gridSizeFt: 0.5,
      scalePxPerFt: 30,
      unit: 'meters',
      defaultMode: 'banquet',
      description: 'Outdoor dining area',
      clientRequestId: 'req_abc',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing name', () => {
    const result = createRoomSchema.safeParse({
      locationId: 'loc_123',
      widthFt: 40,
      heightFt: 30,
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing locationId', () => {
    const result = createRoomSchema.safeParse({
      name: 'Main Dining',
      widthFt: 40,
      heightFt: 30,
    });
    expect(result.success).toBe(false);
  });

  it('rejects zero widthFt', () => {
    const result = createRoomSchema.safeParse({
      name: 'Main Dining',
      locationId: 'loc_123',
      widthFt: 0,
      heightFt: 30,
    });
    expect(result.success).toBe(false);
  });

  it('rejects negative heightFt', () => {
    const result = createRoomSchema.safeParse({
      name: 'Main Dining',
      locationId: 'loc_123',
      widthFt: 40,
      heightFt: -5,
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid unit', () => {
    const result = createRoomSchema.safeParse({
      name: 'Main Dining',
      locationId: 'loc_123',
      widthFt: 40,
      heightFt: 30,
      unit: 'yards',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid defaultMode', () => {
    const result = createRoomSchema.safeParse({
      name: 'Main Dining',
      locationId: 'loc_123',
      widthFt: 40,
      heightFt: 30,
      defaultMode: 'invalid_mode',
    });
    expect(result.success).toBe(false);
  });

  it('rejects name exceeding max length', () => {
    const result = createRoomSchema.safeParse({
      name: 'A'.repeat(201),
      locationId: 'loc_123',
      widthFt: 40,
      heightFt: 30,
    });
    expect(result.success).toBe(false);
  });

  it('rejects widthFt exceeding max', () => {
    const result = createRoomSchema.safeParse({
      name: 'Main Dining',
      locationId: 'loc_123',
      widthFt: 10000,
      heightFt: 30,
    });
    expect(result.success).toBe(false);
  });
});

describe('updateRoomSchema', () => {
  it('accepts empty object (no updates)', () => {
    const result = updateRoomSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('accepts partial updates', () => {
    const result = updateRoomSchema.safeParse({
      name: 'Updated Dining',
      widthFt: 50,
    });
    expect(result.success).toBe(true);
  });

  it('accepts nullable description', () => {
    const result = updateRoomSchema.safeParse({
      description: null,
    });
    expect(result.success).toBe(true);
  });

  it('accepts sortOrder', () => {
    const result = updateRoomSchema.safeParse({
      sortOrder: 5,
    });
    expect(result.success).toBe(true);
  });

  it('rejects negative sortOrder', () => {
    const result = updateRoomSchema.safeParse({
      sortOrder: -1,
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid unit', () => {
    const result = updateRoomSchema.safeParse({
      unit: 'cubits',
    });
    expect(result.success).toBe(false);
  });
});

describe('saveDraftSchema', () => {
  it('accepts valid snapshot object', () => {
    const result = saveDraftSchema.safeParse({
      snapshotJson: {
        formatVersion: 1,
        objects: [],
        layers: [],
        metadata: {
          lastEditedAt: '2026-01-01T00:00:00Z',
          lastEditedBy: 'user_123',
          objectCount: 0,
          totalCapacity: 0,
        },
      },
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing snapshotJson', () => {
    const result = saveDraftSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('accepts with clientRequestId', () => {
    const result = saveDraftSchema.safeParse({
      snapshotJson: { formatVersion: 1 },
      clientRequestId: 'req_xyz',
    });
    expect(result.success).toBe(true);
  });
});

describe('publishVersionSchema', () => {
  it('accepts empty object', () => {
    const result = publishVersionSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('accepts with publishNote', () => {
    const result = publishVersionSchema.safeParse({
      publishNote: 'Ready for dinner service',
    });
    expect(result.success).toBe(true);
  });

  it('rejects publishNote exceeding max length', () => {
    const result = publishVersionSchema.safeParse({
      publishNote: 'A'.repeat(501),
    });
    expect(result.success).toBe(false);
  });
});

describe('createTemplateSchema', () => {
  it('accepts valid input', () => {
    const result = createTemplateSchema.safeParse({
      name: 'Standard 10-Table',
      snapshotJson: { formatVersion: 1, objects: [] },
      widthFt: 40,
      heightFt: 30,
    });
    expect(result.success).toBe(true);
  });

  it('accepts with optional fields', () => {
    const result = createTemplateSchema.safeParse({
      name: 'Banquet Layout',
      description: 'Large banquet setup',
      category: 'banquet',
      snapshotJson: { formatVersion: 1, objects: [] },
      widthFt: 60,
      heightFt: 40,
      clientRequestId: 'req_abc',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing name', () => {
    const result = createTemplateSchema.safeParse({
      snapshotJson: { formatVersion: 1 },
      widthFt: 40,
      heightFt: 30,
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid category', () => {
    const result = createTemplateSchema.safeParse({
      name: 'Template',
      snapshotJson: { formatVersion: 1 },
      widthFt: 40,
      heightFt: 30,
      category: 'invalid',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing snapshotJson', () => {
    const result = createTemplateSchema.safeParse({
      name: 'Template',
      widthFt: 40,
      heightFt: 30,
    });
    expect(result.success).toBe(false);
  });
});

describe('roomListFilterSchema', () => {
  it('accepts empty object (uses defaults)', () => {
    const result = roomListFilterSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(50);
    }
  });

  it('accepts all filter fields', () => {
    const result = roomListFilterSchema.safeParse({
      locationId: 'loc_123',
      isActive: true,
      cursor: 'cursor_abc',
      limit: 25,
    });
    expect(result.success).toBe(true);
  });

  it('rejects limit below minimum', () => {
    const result = roomListFilterSchema.safeParse({
      limit: 0,
    });
    expect(result.success).toBe(false);
  });

  it('rejects limit above maximum', () => {
    const result = roomListFilterSchema.safeParse({
      limit: 101,
    });
    expect(result.success).toBe(false);
  });
});
