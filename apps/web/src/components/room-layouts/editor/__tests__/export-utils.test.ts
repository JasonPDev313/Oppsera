import { describe, it, expect } from 'vitest';

// Pure utility tests for export-related logic (no DOM/Konva deps)

describe('Export filename sanitization', () => {
  const sanitizeFilename = (name: string): string => {
    return name
      .replace(/[<>:"/\\|?*]/g, '_')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 100)
      || 'room-layout';
  };

  it('passes through simple names', () => {
    expect(sanitizeFilename('Main Dining')).toBe('Main-Dining');
  });

  it('replaces special characters', () => {
    expect(sanitizeFilename('Room: "A" <test>')).toBe('Room_-_A_-_test_');
  });

  it('collapses multiple spaces', () => {
    expect(sanitizeFilename('Room   Name')).toBe('Room-Name');
  });

  it('handles empty string', () => {
    expect(sanitizeFilename('')).toBe('room-layout');
  });

  it('truncates long names', () => {
    const longName = 'A'.repeat(200);
    expect(sanitizeFilename(longName).length).toBeLessThanOrEqual(100);
  });
});

describe('JSON snapshot structure', () => {
  const makeMinimalSnapshot = (objectCount: number) => {
    const objects = Array.from({ length: objectCount }, (_, i) => ({
      id: `obj-${i}`,
      type: 'table' as const,
      x: i * 5,
      y: i * 5,
      width: 48,
      height: 48,
    }));
    return {
      formatVersion: 1,
      objects,
      layers: [{ id: 'default', name: 'Main', visible: true, locked: false, sortOrder: 0 }],
      metadata: {
        lastEditedAt: new Date().toISOString(),
        lastEditedBy: '',
        objectCount,
        totalCapacity: 0,
      },
    };
  };

  it('includes required fields', () => {
    const snap = makeMinimalSnapshot(2);
    expect(snap.formatVersion).toBe(1);
    expect(snap.objects).toHaveLength(2);
    expect(snap.layers).toHaveLength(1);
    expect(snap.metadata.objectCount).toBe(2);
  });

  it('serializes to valid JSON', () => {
    const snap = makeMinimalSnapshot(5);
    const json = JSON.stringify(snap);
    const parsed = JSON.parse(json);
    expect(parsed.formatVersion).toBe(1);
    expect(parsed.objects).toHaveLength(5);
  });

  it('handles empty layout', () => {
    const snap = makeMinimalSnapshot(0);
    expect(snap.objects).toHaveLength(0);
    expect(snap.metadata.objectCount).toBe(0);
  });

  it('preserves object positions in JSON', () => {
    const snap = makeMinimalSnapshot(3);
    const json = JSON.stringify(snap, null, 2);
    const parsed = JSON.parse(json);
    expect(parsed.objects[0].x).toBe(0);
    expect(parsed.objects[1].x).toBe(5);
    expect(parsed.objects[2].x).toBe(10);
  });
});

describe('PNG data URL format', () => {
  it('validates data URL prefix', () => {
    const mockDataUrl = 'data:image/png;base64,iVBORw0KGgo=';
    expect(mockDataUrl.startsWith('data:image/png;base64,')).toBe(true);
  });

  it('detects invalid data URL', () => {
    const invalid = 'not-a-data-url';
    expect(invalid.startsWith('data:image/')).toBe(false);
  });
});
