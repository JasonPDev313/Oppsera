import { describe, it, expect, beforeEach } from 'vitest';
import { useEditorStore } from '../room-layout-editor';
import type { CanvasObject, CanvasSnapshot, LayerInfo } from '@oppsera/shared';

// Helper to always get fresh state
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

describe('Room Layout Editor Store', () => {
  beforeEach(() => {
    state().loadFromSnapshot(makeSnapshot(), roomMeta);
  });

  // ── Object CRUD ──────────────────────────────────────────────

  describe('Object CRUD', () => {
    it('adds an object', () => {
      state().addObject(makeObject());
      expect(state().objects).toHaveLength(1);
      expect(state().objects[0]!.id).toBeDefined();
      expect(state().objects[0]!.type).toBe('table');
      expect(state().isDirty).toBe(true);
    });

    it('updates an object', () => {
      state().addObject(makeObject());
      const id = state().objects[0]!.id;
      state().updateObject(id, { x: 200, y: 300 });
      expect(state().objects[0]!.x).toBe(200);
      expect(state().objects[0]!.y).toBe(300);
    });

    it('updates multiple objects', () => {
      state().addObject(makeObject());
      state().addObject(makeObject({ name: 'Table 2' }));
      const [obj1, obj2] = state().objects;
      state().updateObjects([
        { id: obj1!.id, changes: { x: 10 } },
        { id: obj2!.id, changes: { x: 20 } },
      ]);
      expect(state().objects[0]!.x).toBe(10);
      expect(state().objects[1]!.x).toBe(20);
    });

    it('removes objects', () => {
      state().addObject(makeObject());
      state().addObject(makeObject({ name: 'Table 2' }));
      const id1 = state().objects[0]!.id;
      state().removeObjects([id1]);
      expect(state().objects).toHaveLength(1);
      expect(state().objects[0]!.name).toBe('Table 2');
    });

    it('clears selection when removing selected objects', () => {
      state().addObject(makeObject());
      const id = state().objects[0]!.id;
      state().setSelection([id]);
      expect(state().selectedIds).toEqual([id]);
      state().removeObjects([id]);
      expect(state().selectedIds).toEqual([]);
    });
  });

  // ── Selection ──────────────────────────────────────────────────

  describe('Selection', () => {
    it('sets selection', () => {
      state().addObject(makeObject());
      const id = state().objects[0]!.id;
      state().setSelection([id]);
      expect(state().selectedIds).toEqual([id]);
    });

    it('adds to selection', () => {
      state().addObject(makeObject());
      state().addObject(makeObject({ name: 'Table 2' }));
      const [obj1, obj2] = state().objects;
      state().setSelection([obj1!.id]);
      state().addToSelection(obj2!.id);
      expect(state().selectedIds).toEqual([obj1!.id, obj2!.id]);
    });

    it('does not add duplicates to selection', () => {
      state().addObject(makeObject());
      const id = state().objects[0]!.id;
      state().setSelection([id]);
      state().addToSelection(id);
      expect(state().selectedIds).toEqual([id]);
    });

    it('removes from selection', () => {
      state().addObject(makeObject());
      state().addObject(makeObject({ name: 'Table 2' }));
      const [obj1, obj2] = state().objects;
      state().setSelection([obj1!.id, obj2!.id]);
      state().removeFromSelection(obj1!.id);
      expect(state().selectedIds).toEqual([obj2!.id]);
    });

    it('clears selection', () => {
      state().addObject(makeObject());
      state().setSelection([state().objects[0]!.id]);
      state().clearSelection();
      expect(state().selectedIds).toEqual([]);
    });

    it('selects all visible unlocked objects', () => {
      state().addObject(makeObject());
      state().addObject(makeObject({ visible: false }));
      state().addObject(makeObject({ locked: true }));
      state().addObject(makeObject({ name: 'Visible' }));
      state().selectAll();
      expect(state().selectedIds).toHaveLength(2);
    });
  });

  // ── Layers ─────────────────────────────────────────────────────

  describe('Layers', () => {
    it('starts with default layer', () => {
      expect(state().layers).toHaveLength(1);
      expect(state().layers[0]!.name).toBe('Main');
    });

    it('adds a layer', () => {
      state().addLayer('Floor');
      expect(state().layers).toHaveLength(2);
      expect(state().layers[1]!.name).toBe('Floor');
      expect(state().layers[1]!.sortOrder).toBe(1);
    });

    it('prevents removing default layer', () => {
      state().removeLayer('default');
      expect(state().layers).toHaveLength(1);
    });

    it('moves objects to default when removing a layer', () => {
      state().addLayer('Temp');
      const layerId = state().layers[1]!.id;
      state().addObject(makeObject({ layerId }));
      state().removeLayer(layerId);
      expect(state().objects[0]!.layerId).toBe('default');
      expect(state().layers).toHaveLength(1);
    });

    it('updates a layer', () => {
      state().updateLayer('default', { name: 'Ground Floor' });
      expect(state().layers[0]!.name).toBe('Ground Floor');
    });

    it('reorders layers', () => {
      state().addLayer('Layer 2');
      state().addLayer('Layer 3');
      const ids = state().layers.map((l) => l.id);
      state().reorderLayers([ids[2]!, ids[0]!, ids[1]!]);
      expect(state().layers[0]!.sortOrder).toBe(0);
      expect(state().layers[1]!.sortOrder).toBe(1);
      expect(state().layers[2]!.sortOrder).toBe(2);
    });
  });

  // ── History ────────────────────────────────────────────────────

  describe('History (Undo/Redo)', () => {
    it('commits to history', () => {
      state().commitToHistory();
      expect(state().history).toHaveLength(2); // initial + commit
      expect(state().historyIndex).toBe(1);
    });

    it('undoes a change', () => {
      state().addObject(makeObject());
      state().commitToHistory();
      expect(state().objects).toHaveLength(1);

      state().undo();
      expect(state().objects).toHaveLength(0);
    });

    it('redoes after undo', () => {
      state().addObject(makeObject());
      state().commitToHistory();

      state().undo();
      expect(state().objects).toHaveLength(0);

      state().redo();
      expect(state().objects).toHaveLength(1);
    });

    it('canUndo returns correct value', () => {
      expect(state().canUndo()).toBe(false);
      state().commitToHistory();
      expect(state().canUndo()).toBe(true);
    });

    it('canRedo returns correct value', () => {
      expect(state().canRedo()).toBe(false);
      state().commitToHistory();
      state().undo();
      expect(state().canRedo()).toBe(true);
    });

    it('truncates redo history on new commit', () => {
      state().addObject(makeObject());
      state().commitToHistory();

      state().undo();
      state().addObject(makeObject({ name: 'New' }));
      state().commitToHistory();

      expect(state().canRedo()).toBe(false);
    });

    it('caps history at MAX_HISTORY entries', () => {
      for (let i = 0; i < 60; i++) {
        state().addObject(makeObject({ name: `T${i}` }));
        state().commitToHistory();
      }
      expect(state().history.length).toBeLessThanOrEqual(50);
    });
  });

  // ── Snapshot ───────────────────────────────────────────────────

  describe('Snapshot', () => {
    it('loads from snapshot', () => {
      const obj: CanvasObject = {
        id: 'obj-1',
        type: 'table',
        x: 50,
        y: 50,
        width: 48,
        height: 48,
        rotation: 0,
        layerId: 'default',
        zIndex: 0,
        locked: false,
        visible: true,
        name: 'Loaded Table',
        properties: { seats: 4 },
        style: { fill: '#fff', stroke: '#000', strokeWidth: 1, opacity: 1 },
      };
      const snapshot = makeSnapshot([obj]);

      state().loadFromSnapshot(snapshot, roomMeta);

      expect(state().objects).toHaveLength(1);
      expect(state().objects[0]!.name).toBe('Loaded Table');
      expect(state().roomName).toBe('Test Room');
      expect(state().widthFt).toBe(40);
      expect(state().isDirty).toBe(false);
    });

    it('gets snapshot with capacity calculation', () => {
      state().addObject(makeObject({ properties: { seats: 4 } }));
      state().addObject(makeObject({ type: 'bar', properties: { seatCount: 8 } }));

      const snapshot = state().getSnapshot();
      expect(snapshot.formatVersion).toBe(1);
      expect(snapshot.objects).toHaveLength(2);
      expect(snapshot.metadata.objectCount).toBe(2);
      expect(snapshot.metadata.totalCapacity).toBe(12);
    });

    it('resets state on load', () => {
      state().addObject(makeObject());
      state().setSelection([state().objects[0]!.id]);
      state().setZoom(2);

      state().loadFromSnapshot(makeSnapshot(), roomMeta);
      expect(state().objects).toHaveLength(0);
      expect(state().selectedIds).toEqual([]);
      expect(state().zoom).toBe(1);
      expect(state().isDirty).toBe(false);
    });
  });

  // ── Viewport ───────────────────────────────────────────────────

  describe('Viewport', () => {
    it('zooms in', () => {
      const initialZoom = state().zoom;
      state().zoomIn();
      expect(state().zoom).toBeGreaterThan(initialZoom);
    });

    it('zooms out', () => {
      const initialZoom = state().zoom;
      state().zoomOut();
      expect(state().zoom).toBeLessThan(initialZoom);
    });

    it('clamps zoom to min/max', () => {
      state().setZoom(0.01);
      expect(state().zoom).toBe(0.1);
      state().setZoom(100);
      expect(state().zoom).toBe(5);
    });

    it('resets on zoomToFit', () => {
      state().setZoom(3);
      state().setPanOffset({ x: 100, y: 100 });
      state().zoomToFit();
      expect(state().zoom).toBe(1);
      expect(state().panOffset).toEqual({ x: 0, y: 0 });
    });
  });

  // ── UI Toggles ─────────────────────────────────────────────────

  describe('UI Toggles', () => {
    it('toggles grid', () => {
      expect(state().showGrid).toBe(true);
      state().toggleGrid();
      expect(state().showGrid).toBe(false);
    });

    it('toggles snap', () => {
      expect(state().snapToGrid).toBe(true);
      state().toggleSnap();
      expect(state().snapToGrid).toBe(false);
    });

    it('toggles palette panel', () => {
      expect(state().isPalettePanelOpen).toBe(true);
      state().togglePalettePanel();
      expect(state().isPalettePanelOpen).toBe(false);
    });
  });
});
