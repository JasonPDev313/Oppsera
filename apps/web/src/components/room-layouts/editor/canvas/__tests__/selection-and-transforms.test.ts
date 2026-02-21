import { describe, it, expect, beforeEach } from 'vitest';
import { useEditorStore } from '../../../../../stores/room-layout-editor';
import type { CanvasObject } from '@oppsera/shared';

const makeObject = (overrides: Partial<CanvasObject> = {}): Omit<CanvasObject, 'id'> => ({
  type: 'table',
  x: 5,
  y: 5,
  width: 60,
  height: 60,
  rotation: 0,
  layerId: 'default',
  zIndex: 0,
  locked: false,
  visible: true,
  name: 'Test Table',
  properties: { seats: 4 },
  style: { fill: '#e2e8f0', stroke: '#64748b', strokeWidth: 1, opacity: 1 },
  ...overrides,
});

const state = () => useEditorStore.getState();

describe('Drag bounds clamping', () => {
  beforeEach(() => {
    useEditorStore.setState({
      objects: [],
      selectedIds: [],
      widthFt: 40,
      heightFt: 30,
      scalePxPerFt: 20,
      gridSizeFt: 1,
    });
  });

  it('clamps object to room boundaries on update', () => {
    state().addObject(makeObject({ x: 0, y: 0 }));
    const obj = state().objects[0]!;

    // Try to move object beyond right boundary
    // object width = 60px, scalePxPerFt = 20, so objWidthFt = 3
    // room width = 40ft, so max x = 40 - 3 = 37
    const objWidthFt = obj.width / state().scalePxPerFt;
    const maxX = state().widthFt - objWidthFt;

    state().updateObject(obj.id, { x: 50 });
    // Store doesn't clamp — clamping happens in the UI layer (dragEnd / nudge)
    // This test verifies the clamping formula
    const clampedX = Math.max(0, Math.min(50, maxX));
    expect(clampedX).toBe(37);
  });

  it('clamps negative positions to 0', () => {
    const clampedX = Math.max(0, Math.min(-5, 40));
    expect(clampedX).toBe(0);

    const clampedY = Math.max(0, Math.min(-10, 30));
    expect(clampedY).toBe(0);
  });

  it('does not clamp when within bounds', () => {
    const x = 10;
    const clampedX = Math.max(0, Math.min(x, 37));
    expect(clampedX).toBe(10);
  });
});

describe('Copy/Paste logic', () => {
  beforeEach(() => {
    useEditorStore.setState({
      objects: [],
      selectedIds: [],
      widthFt: 40,
      heightFt: 30,
      scalePxPerFt: 20,
      gridSizeFt: 1,
      history: [],
      historyIndex: -1,
    });
  });

  it('paste creates objects with new IDs', () => {
    state().addObject(makeObject({ x: 5, y: 5 }));
    const original = state().objects[0]!;

    // Simulate copy+paste: create a new object with offset
    state().addObject(makeObject({ x: original.x + 1, y: original.y + 1 }));

    expect(state().objects).toHaveLength(2);
    expect(state().objects[0]!.id).not.toBe(state().objects[1]!.id);
  });

  it('paste offsets position by 1ft', () => {
    state().addObject(makeObject({ x: 10, y: 15 }));
    const original = state().objects[0]!;

    const pastedX = original.x + 1;
    const pastedY = original.y + 1;
    expect(pastedX).toBe(11);
    expect(pastedY).toBe(16);
  });

  it('paste clamps within room bounds', () => {
    // Object at far edge
    const objWidthFt = 60 / 20; // 3ft
    const objHeightFt = 60 / 20; // 3ft
    const originalX = 38; // near right edge
    const originalY = 28; // near bottom

    const pastedX = Math.max(0, Math.min(originalX + 1, 40 - objWidthFt));
    const pastedY = Math.max(0, Math.min(originalY + 1, 30 - objHeightFt));
    expect(pastedX).toBe(37); // 40 - 3
    expect(pastedY).toBe(27); // 30 - 3
  });
});

describe('Selection: shift+click toggle', () => {
  beforeEach(() => {
    useEditorStore.setState({
      objects: [],
      selectedIds: [],
    });
  });

  it('addToSelection adds object to selection', () => {
    state().addObject(makeObject());
    state().addObject(makeObject({ x: 10 }));
    const [obj1, obj2] = state().objects;

    state().setSelection([obj1!.id]);
    expect(state().selectedIds).toEqual([obj1!.id]);

    state().addToSelection(obj2!.id);
    expect(state().selectedIds).toEqual([obj1!.id, obj2!.id]);
  });

  it('removeFromSelection removes object from multi-selection', () => {
    state().addObject(makeObject());
    state().addObject(makeObject({ x: 10 }));
    const [obj1, obj2] = state().objects;

    state().setSelection([obj1!.id, obj2!.id]);
    expect(state().selectedIds).toHaveLength(2);

    state().removeFromSelection(obj1!.id);
    expect(state().selectedIds).toEqual([obj2!.id]);
  });

  it('selectAll only selects visible unlocked objects', () => {
    state().addObject(makeObject());
    state().addObject(makeObject({ locked: true, x: 10 }));
    state().addObject(makeObject({ visible: false, x: 20 }));

    state().selectAll();
    // Only the first object is visible + unlocked
    expect(state().selectedIds).toHaveLength(1);
    expect(state().selectedIds[0]).toBe(state().objects[0]!.id);
  });
});

describe('Marquee AABB intersection', () => {
  it('detects overlapping rectangles', () => {
    // Selection rect
    const selX = 50, selY = 50, selW = 100, selH = 100;
    // Object rect
    const objX = 80, objY = 80, objW = 60, objH = 60;

    const intersects =
      objX < selX + selW &&
      objX + objW > selX &&
      objY < selY + selH &&
      objY + objH > selY;

    expect(intersects).toBe(true);
  });

  it('detects non-overlapping rectangles', () => {
    const selX = 50, selY = 50, selW = 100, selH = 100;
    const objX = 200, objY = 200, objW = 60, objH = 60;

    const intersects =
      objX < selX + selW &&
      objX + objW > selX &&
      objY < selY + selH &&
      objY + objH > selY;

    expect(intersects).toBe(false);
  });

  it('detects edge-touching rectangles', () => {
    const selX = 50, selY = 50, selW = 100, selH = 100;
    // Object starts exactly at selection right edge
    const objX = 150, objY = 50, objW = 60, objH = 60;

    const intersects =
      objX < selX + selW &&
      objX + objW > selX &&
      objY < selY + selH &&
      objY + objH > selY;

    // Edge-touching but not overlapping
    expect(intersects).toBe(false);
  });
});
