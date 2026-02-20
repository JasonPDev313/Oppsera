import { describe, it, expect, beforeEach } from 'vitest';
import { useEditorStore } from '../room-layout-editor';
import type { CanvasObject, CanvasSnapshot, LayerInfo } from '@oppsera/shared';

const state = () => useEditorStore.getState();

function makeObject(overrides: Partial<CanvasObject> = {}): Omit<CanvasObject, 'id'> {
  return {
    type: 'table',
    x: 100,
    y: 100,
    width: 48,
    height: 48,
    rotation: 0,
    layerId: 'default',
    zIndex: 0,
    locked: false,
    visible: true,
    name: 'Table 1',
    properties: { shape: 'round', seats: 4 },
    style: { fill: '#e2e8f0', stroke: '#64748b', strokeWidth: 1, opacity: 1 },
    ...overrides,
  };
}

function makeSnapshot(objects: CanvasObject[] = [], layers?: LayerInfo[]): CanvasSnapshot {
  return {
    formatVersion: 1,
    objects,
    layers: layers ?? [{ id: 'default', name: 'Main', visible: true, locked: false, sortOrder: 0 }],
    metadata: {
      lastEditedAt: '2025-01-01T00:00:00.000Z',
      lastEditedBy: 'user1',
      objectCount: objects.length,
      totalCapacity: 0,
    },
  };
}

const roomMeta = {
  roomId: 'room-1',
  roomName: 'Test Room',
  widthFt: 40,
  heightFt: 30,
  gridSizeFt: 1,
  scalePxPerFt: 20,
  unit: 'ft',
};

describe('Room Layout Editor Store — Extended', () => {
  beforeEach(() => {
    state().loadFromSnapshot(makeSnapshot(), roomMeta);
  });

  // ── Dirty Tracking ───────────────────────────────────────────────

  describe('Dirty tracking', () => {
    it('starts clean after load', () => {
      expect(state().isDirty).toBe(false);
    });

    it('marks dirty on addObject', () => {
      state().addObject(makeObject());
      expect(state().isDirty).toBe(true);
    });

    it('marks dirty on updateObject', () => {
      state().addObject(makeObject());
      state().setDirty(false);
      const id = state().objects[0]!.id;
      state().updateObject(id, { x: 500 });
      expect(state().isDirty).toBe(true);
    });

    it('marks dirty on removeObjects', () => {
      state().addObject(makeObject());
      state().setDirty(false);
      state().removeObjects([state().objects[0]!.id]);
      expect(state().isDirty).toBe(true);
    });

    it('setDirty explicitly', () => {
      state().setDirty(true);
      expect(state().isDirty).toBe(true);
      state().setDirty(false);
      expect(state().isDirty).toBe(false);
    });

    it('setLastSavedAt clears dirty', () => {
      state().addObject(makeObject());
      expect(state().isDirty).toBe(true);
      state().setLastSavedAt('2025-01-01T00:00:00Z');
      expect(state().isDirty).toBe(false);
      expect(state().lastSavedAt).toBe('2025-01-01T00:00:00Z');
    });
  });

  // ── Persistence ──────────────────────────────────────────────────

  describe('Persistence actions', () => {
    it('setSaving', () => {
      expect(state().isSaving).toBe(false);
      state().setSaving(true);
      expect(state().isSaving).toBe(true);
      state().setSaving(false);
      expect(state().isSaving).toBe(false);
    });

    it('setPublishing', () => {
      expect(state().isPublishing).toBe(false);
      state().setPublishing(true);
      expect(state().isPublishing).toBe(true);
    });

    it('setRoomName', () => {
      state().setRoomName('New Name');
      expect(state().roomName).toBe('New Name');
    });
  });

  // ── Tool State ───────────────────────────────────────────────────

  describe('Tool state', () => {
    it('starts with select tool', () => {
      expect(state().activeTool).toBe('select');
    });

    it('changes active tool', () => {
      state().setActiveTool('pan');
      expect(state().activeTool).toBe('pan');
    });

    it('clears selection when switching away from select', () => {
      state().addObject(makeObject());
      state().setSelection([state().objects[0]!.id]);
      state().setActiveTool('pan');
      expect(state().selectedIds).toEqual([]);
    });

    it('keeps selection when switching to select', () => {
      state().addObject(makeObject());
      state().setSelection([state().objects[0]!.id]);
      state().setActiveTool('select');
      expect(state().selectedIds).toHaveLength(1);
    });
  });

  // ── Hover State ──────────────────────────────────────────────────

  describe('Hover state', () => {
    it('sets hovered ID', () => {
      state().setHoveredId('obj-1');
      expect(state().hoveredId).toBe('obj-1');
    });

    it('clears hovered ID', () => {
      state().setHoveredId('obj-1');
      state().setHoveredId(null);
      expect(state().hoveredId).toBeNull();
    });
  });

  // ── Snapshot Roundtrip ───────────────────────────────────────────

  describe('Snapshot roundtrip', () => {
    it('preserves all objects through save/load cycle', () => {
      state().addObject(makeObject({ name: 'T1', x: 10, y: 20 }));
      state().addObject(makeObject({ type: 'wall', name: 'W1', x: 0, y: 0, width: 200, height: 10 }));
      state().addObject(makeObject({ type: 'door', name: 'D1', x: 30, y: 0 }));

      const snapshot = state().getSnapshot();
      expect(snapshot.objects).toHaveLength(3);
      expect(snapshot.metadata.objectCount).toBe(3);

      // Load into a fresh state
      state().loadFromSnapshot(snapshot, roomMeta);
      expect(state().objects).toHaveLength(3);
      expect(state().objects[0]!.name).toBe('T1');
      expect(state().objects[0]!.x).toBe(10);
      expect(state().objects[1]!.type).toBe('wall');
      expect(state().objects[2]!.type).toBe('door');
    });

    it('preserves layers through roundtrip', () => {
      state().addLayer('Floor 2');
      state().addLayer('Decorations');

      const snapshot = state().getSnapshot();
      expect(snapshot.layers).toHaveLength(3);

      state().loadFromSnapshot(snapshot, roomMeta);
      expect(state().layers).toHaveLength(3);
      expect(state().layers[1]!.name).toBe('Floor 2');
      expect(state().layers[2]!.name).toBe('Decorations');
    });

    it('deep clones objects (no shared references)', () => {
      state().addObject(makeObject());
      const snapshot = state().getSnapshot();
      snapshot.objects[0]!.x = 999;
      expect(state().objects[0]!.x).toBe(100); // original unchanged
    });

    it('computes capacity for tables and bars', () => {
      state().addObject(makeObject({ type: 'table', properties: { seats: 6 } }));
      state().addObject(makeObject({ type: 'table', properties: { seats: 4 } }));
      state().addObject(makeObject({ type: 'bar', properties: { seatCount: 12 } }));
      state().addObject(makeObject({ type: 'wall' })); // should not count

      const snapshot = state().getSnapshot();
      expect(snapshot.metadata.totalCapacity).toBe(22);
    });
  });

  // ── Layer Visibility Filtering ───────────────────────────────────

  describe('Layer visibility', () => {
    it('updating layer visibility affects state', () => {
      state().updateLayer('default', { visible: false });
      expect(state().layers[0]!.visible).toBe(false);
    });

    it('locking a layer is persisted', () => {
      state().updateLayer('default', { locked: true });
      expect(state().layers[0]!.locked).toBe(true);
    });
  });

  // ── UI Panel Toggles ─────────────────────────────────────────────

  describe('UI panel toggles', () => {
    it('toggles inspector panel', () => {
      expect(state().isInspectorPanelOpen).toBe(true);
      state().toggleInspectorPanel();
      expect(state().isInspectorPanelOpen).toBe(false);
      state().toggleInspectorPanel();
      expect(state().isInspectorPanelOpen).toBe(true);
    });

    it('toggles layers panel', () => {
      expect(state().isLayersPanelOpen).toBe(false);
      state().toggleLayersPanel();
      expect(state().isLayersPanelOpen).toBe(true);
    });
  });

  // ── Zoom Bounds ──────────────────────────────────────────────────

  describe('Zoom bounds', () => {
    it('clamps zoom in to max 5', () => {
      state().setZoom(4.5);
      state().zoomIn(); // 4.5 * 1.2 = 5.4, should clamp
      expect(state().zoom).toBe(5);
    });

    it('clamps zoom out to min 0.1', () => {
      state().setZoom(0.15);
      state().zoomOut(); // 0.15 / 1.2 = 0.125
      state().zoomOut(); // 0.125 / 1.2 = 0.104
      state().zoomOut(); // 0.104 / 1.2 = 0.087, should clamp
      expect(state().zoom).toBeGreaterThanOrEqual(0.1);
    });

    it('sets pan offset', () => {
      state().setPanOffset({ x: 50, y: -30 });
      expect(state().panOffset).toEqual({ x: 50, y: -30 });
    });
  });

  // ── History Edge Cases ───────────────────────────────────────────

  describe('History edge cases', () => {
    it('undo at beginning does nothing', () => {
      state().undo();
      expect(state().objects).toHaveLength(0);
      expect(state().historyIndex).toBe(0);
    });

    it('redo at end does nothing', () => {
      state().redo();
      expect(state().objects).toHaveLength(0);
    });

    it('marks dirty after undo', () => {
      state().addObject(makeObject());
      state().setDirty(false);
      state().commitToHistory();
      state().undo();
      expect(state().isDirty).toBe(true);
    });

    it('marks dirty after redo', () => {
      state().addObject(makeObject());
      state().commitToHistory();
      state().undo();
      state().setDirty(false);
      state().redo();
      expect(state().isDirty).toBe(true);
    });

    it('clears selection on undo', () => {
      state().addObject(makeObject());
      state().setSelection([state().objects[0]!.id]);
      state().commitToHistory();
      state().undo();
      expect(state().selectedIds).toEqual([]);
    });
  });
});
