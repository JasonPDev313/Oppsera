'use client';

import { memo, useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Plus,
  Trash2,
  Copy,
  Search,
  ChevronLeft,
  ChevronRight,
  Package,
  FolderOpen,
  Zap,
} from 'lucide-react';
import type { CatalogItemForPOS } from '@/types/pos';
import type { QuickMenuTile, QuickMenuPage } from '@/components/pos/shared/QuickMenuGrid';

// ── Constants ────────────────────────────────────────────────────────

const GRID_COLS = 8;
const GRID_ROWS = 5;
const PRESET_COLORS = [
  '#6366f1', // indigo
  '#10b981', // emerald
  '#f59e0b', // amber
  '#f43f5e', // rose
  '#0ea5e9', // sky
  '#8b5cf6', // violet
  '#f97316', // orange
  '#64748b', // slate
];

const EMPTY_PAGE: QuickMenuPage = {
  id: 'page-1',
  label: 'Page 1',
  tiles: [],
};

// ── Storage helpers ──────────────────────────────────────────────────

function loadQuickMenuPages(locationId: string): QuickMenuPage[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(`pos_quick_menu_${locationId}`);
    return raw ? (JSON.parse(raw) as QuickMenuPage[]) : [];
  } catch {
    return [];
  }
}

function saveQuickMenuPages(locationId: string, pages: QuickMenuPage[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(`pos_quick_menu_${locationId}`, JSON.stringify(pages));
  } catch { /* storage full */ }
}

// ── Helper ───────────────────────────────────────────────────────────

function getContrastColor(hexColor: string): string {
  const r = parseInt(hexColor.slice(1, 3), 16);
  const g = parseInt(hexColor.slice(3, 5), 16);
  const b = parseInt(hexColor.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? '#1f2937' : '#ffffff';
}

function generateId() {
  return `tile-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

// ── Tile Type Picker ─────────────────────────────────────────────────

interface TileTypePickerProps {
  allItems: CatalogItemForPOS[];
  onAdd: (tile: QuickMenuTile) => void;
  onClose: () => void;
}

function TileTypePicker({ allItems, onAdd, onClose }: TileTypePickerProps) {
  const [mode, setMode] = useState<'item' | 'category' | 'action'>('item');
  const [search, setSearch] = useState('');

  const filteredItems = useMemo(() => {
    if (!search.trim()) return allItems.slice(0, 50);
    const q = search.toLowerCase();
    return allItems.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        (item.sku && item.sku.toLowerCase().includes(q)) ||
        (item.barcode && item.barcode.includes(q)),
    ).slice(0, 50);
  }, [allItems, search]);

  const categories = useMemo(() => {
    const catMap = new Map<string, string>();
    for (const item of allItems) {
      if (item.categoryId && !catMap.has(item.categoryId)) {
        catMap.set(item.categoryId, item.categoryId);
      }
    }
    return Array.from(catMap.entries()).map(([id]) => id);
  }, [allItems]);

  const actions = [
    { id: 'open_drawer', label: 'Open Drawer' },
    { id: 'no_sale', label: 'No Sale' },
    { id: 'hold_order', label: 'Hold Order' },
    { id: 'recall_order', label: 'Recall Order' },
    { id: 'discount', label: 'Discount' },
    { id: 'void_last', label: 'Void Last Item' },
  ];

  return (
    <div className="flex flex-col gap-3">
      {/* Mode tabs */}
      <div className="flex gap-1 rounded-lg bg-muted p-1">
        {([
          { key: 'item' as const, label: 'Items', icon: Package },
          { key: 'category' as const, label: 'Categories', icon: FolderOpen },
          { key: 'action' as const, label: 'Actions', icon: Zap },
        ]).map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setMode(tab.key)}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
              mode === tab.key
                ? 'bg-surface text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <tab.icon className="h-3.5 w-3.5" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Search (items only) */}
      {mode === 'item' && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search items..."
            className="w-full rounded-md border border-border py-1.5 pl-9 pr-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            autoFocus
          />
        </div>
      )}

      {/* Results list */}
      <div className="max-h-48 overflow-y-auto rounded-md border border-border">
        {mode === 'item' &&
          filteredItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                onAdd({
                  id: generateId(),
                  type: 'item',
                  label: item.name,
                  color: PRESET_COLORS[0],
                  catalogItemId: item.id,
                });
                onClose();
              }}
              className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-accent"
            >
              <span className="truncate">{item.name}</span>
              <span className="ml-2 shrink-0 text-xs text-muted-foreground">{formatPrice(item.price)}</span>
            </button>
          ))}

        {mode === 'category' &&
          categories.map((catId) => (
            <button
              key={catId}
              type="button"
              onClick={() => {
                onAdd({
                  id: generateId(),
                  type: 'category',
                  label: catId,
                  color: PRESET_COLORS[4],
                  categoryId: catId,
                });
                onClose();
              }}
              className="flex w-full items-center px-3 py-2 text-left text-sm hover:bg-accent"
            >
              <FolderOpen className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
              {catId}
            </button>
          ))}

        {mode === 'action' &&
          actions.map((action) => (
            <button
              key={action.id}
              type="button"
              onClick={() => {
                onAdd({
                  id: generateId(),
                  type: 'action',
                  label: action.label,
                  color: PRESET_COLORS[7],
                  action: action.id,
                });
                onClose();
              }}
              className="flex w-full items-center px-3 py-2 text-left text-sm hover:bg-accent"
            >
              <Zap className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
              {action.label}
            </button>
          ))}

        {mode === 'item' && filteredItems.length === 0 && (
          <p className="px-3 py-4 text-center text-xs text-muted-foreground">No items found</p>
        )}
      </div>
    </div>
  );
}

// ── Tile Inspector ───────────────────────────────────────────────────

interface TileInspectorProps {
  tile: QuickMenuTile;
  onUpdate: (updates: Partial<QuickMenuTile>) => void;
  onDelete: () => void;
  onDuplicate: () => void;
}

function TileInspector({ tile, onUpdate, onDelete, onDuplicate }: TileInspectorProps) {
  return (
    <div className="space-y-4">
      <h4 className="text-sm font-semibold text-foreground">Tile Properties</h4>

      {/* Label */}
      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">Label</label>
        <input
          type="text"
          value={tile.label}
          onChange={(e) => onUpdate({ label: e.target.value })}
          className="w-full rounded-md border border-border px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      </div>

      {/* Color */}
      <div>
        <label className="mb-2 block text-xs font-medium text-muted-foreground">Color</label>
        <div className="flex flex-wrap gap-2">
          {PRESET_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              onClick={() => onUpdate({ color })}
              className={`h-7 w-7 rounded-full border-2 transition-all ${
                tile.color === color ? 'border-gray-900 scale-110' : 'border-transparent hover:scale-105'
              }`}
              style={{ backgroundColor: color }}
            />
          ))}
        </div>
      </div>

      {/* Size */}
      <div>
        <label className="mb-2 block text-xs font-medium text-muted-foreground">Size (columns)</label>
        <div className="flex gap-2">
          {[1, 2, 3, 4].map((span) => (
            <button
              key={span}
              type="button"
              onClick={() => onUpdate({ colSpan: span })}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                (tile.colSpan ?? 1) === span
                  ? 'bg-indigo-600 text-white'
                  : 'bg-muted text-muted-foreground hover:bg-accent'
              }`}
            >
              {span}
            </button>
          ))}
        </div>
      </div>

      {/* Row span */}
      <div>
        <label className="mb-2 block text-xs font-medium text-muted-foreground">Height (rows)</label>
        <div className="flex gap-2">
          {[1, 2].map((span) => (
            <button
              key={span}
              type="button"
              onClick={() => onUpdate({ rowSpan: span })}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                (tile.rowSpan ?? 1) === span
                  ? 'bg-indigo-600 text-white'
                  : 'bg-muted text-muted-foreground hover:bg-accent'
              }`}
            >
              {span === 1 ? 'Normal' : 'Tall'}
            </button>
          ))}
        </div>
      </div>

      {/* Type badge */}
      <div className="flex items-center gap-2 rounded-md bg-muted px-3 py-2">
        <span className="text-xs text-muted-foreground">Type:</span>
        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium capitalize text-muted-foreground">
          {tile.type}
        </span>
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-2">
        <button
          type="button"
          onClick={onDuplicate}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-input px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent"
        >
          <Copy className="h-3 w-3" />
          Duplicate
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-red-500/30 px-3 py-1.5 text-xs font-medium text-red-500 transition-colors hover:bg-red-500/10"
        >
          <Trash2 className="h-3 w-3" />
          Delete
        </button>
      </div>
    </div>
  );
}

// ── Quick Menu Editor (Full Overlay) ─────────────────────────────────

interface QuickMenuEditorProps {
  open: boolean;
  onClose: () => void;
  locationId: string;
  allItems: CatalogItemForPOS[];
}

export const QuickMenuEditor = memo(function QuickMenuEditor({
  open,
  onClose,
  locationId,
  allItems,
}: QuickMenuEditorProps) {
  const [pages, setPages] = useState<QuickMenuPage[]>(() => {
    const saved = loadQuickMenuPages(locationId);
    return saved.length > 0 ? saved : [{ ...EMPTY_PAGE }];
  });
  const [pageIndex, setPageIndex] = useState(0);
  const [selectedTileId, setSelectedTileId] = useState<string | null>(null);
  const [showTilePicker, setShowTilePicker] = useState(false);
  const hasUnsavedRef = useRef(false);

  const currentPage = pages[pageIndex] ?? pages[0];
  const selectedTile = currentPage?.tiles.find((t) => t.id === selectedTileId) ?? null;

  // Save handler
  const handleSave = useCallback(() => {
    saveQuickMenuPages(locationId, pages);
    hasUnsavedRef.current = false;
  }, [locationId, pages]);

  // Auto-save on every change
  useEffect(() => {
    if (hasUnsavedRef.current) {
      handleSave();
    }
  }, [pages, handleSave]);

  // Mark dirty
  const markDirty = useCallback(() => {
    hasUnsavedRef.current = true;
  }, []);

  // Add tile
  const addTile = useCallback(
    (tile: QuickMenuTile) => {
      setPages((prev) => {
        const next = [...prev];
        const existing = next[pageIndex];
        if (!existing) return prev;
        next[pageIndex] = { id: existing.id, label: existing.label, tiles: [...existing.tiles, tile] };
        return next;
      });
      setSelectedTileId(tile.id);
      markDirty();
    },
    [pageIndex, markDirty],
  );

  // Update tile
  const updateTile = useCallback(
    (tileId: string, updates: Partial<QuickMenuTile>) => {
      setPages((prev) => {
        const next = [...prev];
        const existing = next[pageIndex];
        if (!existing) return prev;
        next[pageIndex] = {
          id: existing.id,
          label: existing.label,
          tiles: existing.tiles.map((t) =>
            t.id === tileId ? { ...t, ...updates } : t,
          ),
        };
        return next;
      });
      markDirty();
    },
    [pageIndex, markDirty],
  );

  // Delete tile
  const deleteTile = useCallback(
    (tileId: string) => {
      setPages((prev) => {
        const next = [...prev];
        const existing = next[pageIndex];
        if (!existing) return prev;
        next[pageIndex] = {
          id: existing.id,
          label: existing.label,
          tiles: existing.tiles.filter((t) => t.id !== tileId),
        };
        return next;
      });
      if (selectedTileId === tileId) setSelectedTileId(null);
      markDirty();
    },
    [pageIndex, selectedTileId, markDirty],
  );

  // Duplicate tile
  const duplicateTile = useCallback(
    (tileId: string) => {
      if (!currentPage) return;
      const tile = currentPage.tiles.find((t) => t.id === tileId);
      if (!tile) return;
      const newTile = { ...tile, id: generateId() };
      addTile(newTile);
    },
    [currentPage, addTile],
  );

  // Add page
  const addPage = useCallback(() => {
    const newPage: QuickMenuPage = {
      id: `page-${Date.now()}`,
      label: `Page ${pages.length + 1}`,
      tiles: [],
    };
    setPages((prev) => [...prev, newPage]);
    setPageIndex(pages.length);
    markDirty();
  }, [pages.length, markDirty]);

  // Delete page
  const deletePage = useCallback(
    (idx: number) => {
      if (pages.length <= 1) return;
      setPages((prev) => prev.filter((_, i) => i !== idx));
      setPageIndex((prev) => Math.min(prev, pages.length - 2));
      markDirty();
    },
    [pages.length, markDirty],
  );

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col bg-surface">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-border px-6 py-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Quick Menu Editor</h2>
          <p className="text-xs text-muted-foreground">
            Design your custom Hot Sellers grid. Changes save automatically.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              handleSave();
              onClose();
            }}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
          >
            Done
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-2 text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Main area: Grid + Inspector */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: Grid preview */}
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-6">
          {/* 8-column preview grid */}
          <div
            className="grid gap-2 rounded-lg border border-border bg-muted p-4"
            style={{
              gridTemplateColumns: `repeat(${GRID_COLS}, 1fr)`,
              gridTemplateRows: `repeat(${GRID_ROWS}, 60px)`,
            }}
          >
            {currentPage?.tiles.map((tile) => {
              const isSelected = tile.id === selectedTileId;
              const bgColor = tile.color || '#e0e7ff';
              const textColor = getContrastColor(bgColor);

              return (
                <button
                  key={tile.id}
                  type="button"
                  onClick={() => setSelectedTileId(isSelected ? null : tile.id)}
                  className={`flex flex-col items-center justify-center gap-0.5 rounded-lg p-1 text-center transition-all ${
                    isSelected ? 'ring-2 ring-indigo-500 ring-offset-2' : 'hover:opacity-90'
                  }`}
                  style={{
                    gridColumn: `span ${tile.colSpan ?? 1}`,
                    gridRow: `span ${tile.rowSpan ?? 1}`,
                    backgroundColor: bgColor,
                    color: textColor,
                  }}
                >
                  <span className="truncate w-full text-xs font-semibold leading-tight">
                    {tile.label}
                  </span>
                  <span className="text-[9px] opacity-70 capitalize">{tile.type}</span>
                </button>
              );
            })}

            {/* Empty cell button — add tile */}
            {(currentPage?.tiles.length ?? 0) < GRID_COLS * GRID_ROWS && (
              <button
                type="button"
                onClick={() => setShowTilePicker(true)}
                className="flex items-center justify-center rounded-lg border-2 border-dashed border-border text-muted-foreground transition-colors hover:border-indigo-400 hover:text-indigo-500"
              >
                <Plus className="h-5 w-5" />
              </button>
            )}
          </div>

          {/* Page navigation */}
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setPageIndex((i) => Math.max(i - 1, 0))}
              disabled={pageIndex === 0}
              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent disabled:opacity-30"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>

            <div className="flex items-center gap-2">
              {pages.map((page, i) => (
                <button
                  key={page.id}
                  type="button"
                  onClick={() => setPageIndex(i)}
                  className={`h-2 rounded-full transition-colors ${
                    i === pageIndex ? 'w-6 bg-indigo-500' : 'w-2 bg-muted hover:bg-muted-foreground'
                  }`}
                />
              ))}
              <button
                type="button"
                onClick={addPage}
                className="flex h-6 w-6 items-center justify-center rounded-full border border-dashed border-border text-muted-foreground transition-colors hover:border-indigo-400 hover:text-indigo-500"
              >
                <Plus className="h-3 w-3" />
              </button>
            </div>

            <button
              type="button"
              onClick={() => setPageIndex((i) => Math.min(i + 1, pages.length - 1))}
              disabled={pageIndex === pages.length - 1}
              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent disabled:opacity-30"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {/* Page label + delete */}
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={currentPage?.label ?? ''}
              onChange={(e) => {
                setPages((prev) => {
                  const next = [...prev];
                  const existing = next[pageIndex];
                  if (!existing) return prev;
                  next[pageIndex] = { id: existing.id, label: e.target.value, tiles: existing.tiles };
                  return next;
                });
                markDirty();
              }}
              className="rounded-md border border-border px-3 py-1 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            {pages.length > 1 && (
              <button
                type="button"
                onClick={() => deletePage(pageIndex)}
                className="rounded-md p-1.5 text-red-400 transition-colors hover:bg-red-500/10 hover:text-red-500"
                title="Delete this page"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Add tile picker */}
          {showTilePicker && (
            <div className="rounded-lg border border-border bg-surface p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <h4 className="text-sm font-semibold text-foreground">Add Tile</h4>
                <button
                  type="button"
                  onClick={() => setShowTilePicker(false)}
                  className="rounded-md p-1 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <TileTypePicker
                allItems={allItems}
                onAdd={addTile}
                onClose={() => setShowTilePicker(false)}
              />
            </div>
          )}
        </div>

        {/* Right: Inspector */}
        <div className="w-72 shrink-0 border-l border-border bg-muted p-4 overflow-y-auto">
          {selectedTile ? (
            <TileInspector
              tile={selectedTile}
              onUpdate={(updates) => updateTile(selectedTile.id, updates)}
              onDelete={() => deleteTile(selectedTile.id)}
              onDuplicate={() => duplicateTile(selectedTile.id)}
            />
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="mb-3 rounded-full bg-muted p-3">
                <Package className="h-5 w-5 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium text-muted-foreground">Select a tile</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Click a tile in the grid to edit its properties
              </p>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
});
