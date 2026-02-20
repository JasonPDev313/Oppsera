'use client';

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { generateUlid } from '@oppsera/shared';
import type { CanvasObject, CanvasSnapshot, LayerInfo } from '@oppsera/shared';

// ── Types ────────────────────────────────────────────────────────

interface RoomMeta {
  roomId: string;
  roomName: string;
  widthFt: number;
  heightFt: number;
  gridSizeFt: number;
  scalePxPerFt: number;
  unit: string;
}

interface HistoryEntry {
  objects: CanvasObject[];
  layers: LayerInfo[];
}

const MAX_HISTORY = 50;

const DEFAULT_LAYER: LayerInfo = {
  id: 'default',
  name: 'Main',
  visible: true,
  locked: false,
  sortOrder: 0,
};

// ── State Interface ──────────────────────────────────────────────

export interface EditorState {
  // Room metadata
  roomId: string | null;
  roomName: string;
  widthFt: number;
  heightFt: number;
  gridSizeFt: number;
  scalePxPerFt: number;
  unit: string;

  // Canvas objects
  objects: CanvasObject[];
  layers: LayerInfo[];

  // Selection
  selectedIds: string[];
  hoveredId: string | null;

  // Tool state
  activeTool: 'select' | 'pan' | 'text';

  // History (undo/redo)
  history: HistoryEntry[];
  historyIndex: number;

  // UI state
  zoom: number;
  panOffset: { x: number; y: number };
  showGrid: boolean;
  snapToGrid: boolean;
  isPalettePanelOpen: boolean;
  isInspectorPanelOpen: boolean;
  isLayersPanelOpen: boolean;

  // Dirty tracking
  isDirty: boolean;
  lastSavedAt: string | null;
  isSaving: boolean;
  isPublishing: boolean;

  // Actions — Object CRUD
  addObject: (obj: Omit<CanvasObject, 'id'>) => void;
  updateObject: (id: string, updates: Partial<CanvasObject>) => void;
  updateObjects: (updates: Array<{ id: string; changes: Partial<CanvasObject> }>) => void;
  removeObjects: (ids: string[]) => void;

  // Actions — Selection
  setSelection: (ids: string[]) => void;
  addToSelection: (id: string) => void;
  removeFromSelection: (id: string) => void;
  clearSelection: () => void;
  selectAll: () => void;
  setHoveredId: (id: string | null) => void;

  // Actions — Layers
  addLayer: (name: string) => void;
  removeLayer: (id: string) => void;
  updateLayer: (id: string, updates: Partial<LayerInfo>) => void;
  reorderLayers: (layerIds: string[]) => void;

  // Actions — History
  commitToHistory: () => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;

  // Actions — Viewport
  setZoom: (zoom: number) => void;
  setPanOffset: (offset: { x: number; y: number }) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  zoomToFit: () => void;

  // Actions — Tool
  setActiveTool: (tool: 'select' | 'pan' | 'text') => void;

  // Actions — UI Toggles
  togglePalettePanel: () => void;
  toggleInspectorPanel: () => void;
  toggleLayersPanel: () => void;
  toggleGrid: () => void;
  toggleSnap: () => void;

  // Actions — Initialization
  loadFromSnapshot: (snapshot: CanvasSnapshot, roomMeta: RoomMeta) => void;
  getSnapshot: () => CanvasSnapshot;

  // Actions — Persistence
  setDirty: (dirty: boolean) => void;
  setSaving: (saving: boolean) => void;
  setPublishing: (publishing: boolean) => void;
  setLastSavedAt: (at: string) => void;
  setRoomName: (name: string) => void;
}

// ── Store ────────────────────────────────────────────────────────

export const useEditorStore = create<EditorState>()(
  immer((set, get) => ({
    // Room metadata
    roomId: null,
    roomName: '',
    widthFt: 40,
    heightFt: 30,
    gridSizeFt: 1,
    scalePxPerFt: 20,
    unit: 'ft',

    // Canvas objects
    objects: [],
    layers: [DEFAULT_LAYER],

    // Selection
    selectedIds: [],
    hoveredId: null,

    // Tool state
    activeTool: 'select',

    // History
    history: [],
    historyIndex: -1,

    // UI state
    zoom: 1,
    panOffset: { x: 0, y: 0 },
    showGrid: true,
    snapToGrid: true,
    isPalettePanelOpen: true,
    isInspectorPanelOpen: true,
    isLayersPanelOpen: false,

    // Dirty tracking
    isDirty: false,
    lastSavedAt: null,
    isSaving: false,
    isPublishing: false,

    // ── Object CRUD ──────────────────────────────────────────────

    addObject: (obj) =>
      set((state) => {
        const newObj: CanvasObject = { ...obj, id: generateUlid() };
        state.objects.push(newObj);
        state.isDirty = true;
      }),

    updateObject: (id, updates) =>
      set((state) => {
        const idx = state.objects.findIndex((o) => o.id === id);
        if (idx !== -1) {
          Object.assign(state.objects[idx]!, updates);
          state.isDirty = true;
        }
      }),

    updateObjects: (updates) =>
      set((state) => {
        for (const { id, changes } of updates) {
          const idx = state.objects.findIndex((o) => o.id === id);
          if (idx !== -1) {
            Object.assign(state.objects[idx]!, changes);
          }
        }
        state.isDirty = true;
      }),

    removeObjects: (ids) =>
      set((state) => {
        const idSet = new Set(ids);
        state.objects = state.objects.filter((o) => !idSet.has(o.id));
        state.selectedIds = state.selectedIds.filter((id) => !idSet.has(id));
        state.isDirty = true;
      }),

    // ── Selection ────────────────────────────────────────────────

    setSelection: (ids) =>
      set((state) => {
        state.selectedIds = ids;
      }),

    addToSelection: (id) =>
      set((state) => {
        if (!state.selectedIds.includes(id)) {
          state.selectedIds.push(id);
        }
      }),

    removeFromSelection: (id) =>
      set((state) => {
        state.selectedIds = state.selectedIds.filter((sid) => sid !== id);
      }),

    clearSelection: () =>
      set((state) => {
        state.selectedIds = [];
      }),

    selectAll: () =>
      set((state) => {
        state.selectedIds = state.objects
          .filter((o) => o.visible && !o.locked)
          .map((o) => o.id);
      }),

    setHoveredId: (id) =>
      set((state) => {
        state.hoveredId = id;
      }),

    // ── Layers ───────────────────────────────────────────────────

    addLayer: (name) =>
      set((state) => {
        const maxSort = Math.max(0, ...state.layers.map((l) => l.sortOrder));
        state.layers.push({
          id: generateUlid(),
          name,
          visible: true,
          locked: false,
          sortOrder: maxSort + 1,
        });
        state.isDirty = true;
      }),

    removeLayer: (id) =>
      set((state) => {
        if (id === 'default') return; // cannot remove default layer
        // Move objects from removed layer to default
        for (const obj of state.objects) {
          if (obj.layerId === id) {
            obj.layerId = 'default';
          }
        }
        state.layers = state.layers.filter((l) => l.id !== id);
        state.isDirty = true;
      }),

    updateLayer: (id, updates) =>
      set((state) => {
        const idx = state.layers.findIndex((l) => l.id === id);
        if (idx !== -1) {
          Object.assign(state.layers[idx]!, updates);
          state.isDirty = true;
        }
      }),

    reorderLayers: (layerIds) =>
      set((state) => {
        const layerMap = new Map(state.layers.map((l) => [l.id, l]));
        state.layers = layerIds
          .map((id, i) => {
            const layer = layerMap.get(id);
            if (layer) {
              layer.sortOrder = i;
              return layer;
            }
            return null;
          })
          .filter(Boolean) as LayerInfo[];
        state.isDirty = true;
      }),

    // ── History ──────────────────────────────────────────────────

    commitToHistory: () =>
      set((state) => {
        const entry: HistoryEntry = {
          objects: JSON.parse(JSON.stringify(state.objects)),
          layers: JSON.parse(JSON.stringify(state.layers)),
        };
        // Truncate any redo entries
        const newHistory = state.history.slice(0, state.historyIndex + 1);
        newHistory.push(entry);
        // Cap at MAX_HISTORY
        if (newHistory.length > MAX_HISTORY) {
          newHistory.shift();
        }
        state.history = newHistory;
        state.historyIndex = newHistory.length - 1;
      }),

    undo: () =>
      set((state) => {
        if (state.historyIndex <= 0) return;
        // If we're at the latest commit, save current state first
        if (state.historyIndex === state.history.length - 1) {
          const current: HistoryEntry = {
            objects: JSON.parse(JSON.stringify(state.objects)),
            layers: JSON.parse(JSON.stringify(state.layers)),
          };
          if (state.history.length === state.historyIndex + 1) {
            state.history.push(current);
          }
        }
        state.historyIndex -= 1;
        const entry = state.history[state.historyIndex]!;
        state.objects = JSON.parse(JSON.stringify(entry.objects));
        state.layers = JSON.parse(JSON.stringify(entry.layers));
        state.selectedIds = [];
        state.isDirty = true;
      }),

    redo: () =>
      set((state) => {
        if (state.historyIndex >= state.history.length - 1) return;
        state.historyIndex += 1;
        const entry = state.history[state.historyIndex]!;
        state.objects = JSON.parse(JSON.stringify(entry.objects));
        state.layers = JSON.parse(JSON.stringify(entry.layers));
        state.selectedIds = [];
        state.isDirty = true;
      }),

    canUndo: () => {
      const { historyIndex } = get();
      return historyIndex > 0;
    },

    canRedo: () => {
      const { historyIndex, history } = get();
      return historyIndex < history.length - 1;
    },

    // ── Viewport ─────────────────────────────────────────────────

    setZoom: (zoom) =>
      set((state) => {
        state.zoom = Math.min(5, Math.max(0.1, zoom));
      }),

    setPanOffset: (offset) =>
      set((state) => {
        state.panOffset = offset;
      }),

    zoomIn: () =>
      set((state) => {
        state.zoom = Math.min(5, state.zoom * 1.2);
      }),

    zoomOut: () =>
      set((state) => {
        state.zoom = Math.max(0.1, state.zoom / 1.2);
      }),

    zoomToFit: () =>
      set((state) => {
        state.zoom = 1;
        state.panOffset = { x: 0, y: 0 };
      }),

    // ── Tool ────────────────────────────────────────────────────

    setActiveTool: (tool) =>
      set((state) => {
        state.activeTool = tool;
        if (tool !== 'select') {
          state.selectedIds = [];
        }
      }),

    // ── UI Toggles ──────────────────────────────────────────────

    togglePalettePanel: () =>
      set((state) => {
        state.isPalettePanelOpen = !state.isPalettePanelOpen;
      }),

    toggleInspectorPanel: () =>
      set((state) => {
        state.isInspectorPanelOpen = !state.isInspectorPanelOpen;
      }),

    toggleLayersPanel: () =>
      set((state) => {
        state.isLayersPanelOpen = !state.isLayersPanelOpen;
      }),

    toggleGrid: () =>
      set((state) => {
        state.showGrid = !state.showGrid;
      }),

    toggleSnap: () =>
      set((state) => {
        state.snapToGrid = !state.snapToGrid;
      }),

    // ── Initialization ──────────────────────────────────────────

    loadFromSnapshot: (snapshot, roomMeta) =>
      set((state) => {
        state.roomId = roomMeta.roomId;
        state.roomName = roomMeta.roomName;
        state.widthFt = roomMeta.widthFt;
        state.heightFt = roomMeta.heightFt;
        state.gridSizeFt = roomMeta.gridSizeFt;
        state.scalePxPerFt = roomMeta.scalePxPerFt;
        state.unit = roomMeta.unit;

        state.objects = snapshot.objects ?? [];
        state.layers = snapshot.layers?.length ? snapshot.layers : [DEFAULT_LAYER];

        // Reset state
        state.selectedIds = [];
        state.hoveredId = null;
        state.activeTool = 'select';
        state.zoom = 1;
        state.panOffset = { x: 0, y: 0 };
        state.isDirty = false;
        state.lastSavedAt = null;
        state.isSaving = false;
        state.isPublishing = false;

        // Initialize history with loaded state
        const entry: HistoryEntry = {
          objects: JSON.parse(JSON.stringify(state.objects)),
          layers: JSON.parse(JSON.stringify(state.layers)),
        };
        state.history = [entry];
        state.historyIndex = 0;
      }),

    getSnapshot: () => {
      const { objects, layers } = get();
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
      return {
        formatVersion: 1 as const,
        objects: JSON.parse(JSON.stringify(objects)),
        layers: JSON.parse(JSON.stringify(layers)),
        metadata: {
          lastEditedAt: new Date().toISOString(),
          lastEditedBy: '',
          objectCount: objects.length,
          totalCapacity,
        },
      };
    },

    // ── Persistence ─────────────────────────────────────────────

    setDirty: (dirty) =>
      set((state) => {
        state.isDirty = dirty;
      }),

    setSaving: (saving) =>
      set((state) => {
        state.isSaving = saving;
      }),

    setPublishing: (publishing) =>
      set((state) => {
        state.isPublishing = publishing;
      }),

    setLastSavedAt: (at) =>
      set((state) => {
        state.lastSavedAt = at;
        state.isDirty = false;
      }),

    setRoomName: (name) =>
      set((state) => {
        state.roomName = name;
      }),
  })),
);

// ── Stage ref (outside store to avoid serialization / test issues) ──
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _stageRef: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function setEditorStageRef(ref: any) { _stageRef = ref; }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getEditorStageRef(): any { return _stageRef; }
