'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Save, Trash2, ArrowLeft } from 'lucide-react';
import { DndContext, useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import type { DragEndEvent } from '@dnd-kit/core';
import { FormField } from '@/components/ui/form-field';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DashboardTile } from '@/components/dashboards/dashboard-tile';
import { AddTileModal } from '@/components/dashboards/add-tile-modal';
import {
  useSaveDashboard,
  useDeleteDashboard,
} from '@/hooks/use-dashboards';
import { useCustomReports, useRunReport } from '@/hooks/use-custom-reports';
import type {
  DashboardTile as DashboardTileType,
  SavedDashboard,
  RunReportResult,
} from '@/types/custom-reports';

// ── Constants ────────────────────────────────────────────────
const ROW_HEIGHT_PX = 80;
const GRID_COLS = 12;

// ── Props ────────────────────────────────────────────────────
interface DashboardBuilderProps {
  dashboardId?: string;
  initialData?: SavedDashboard;
}

// ── Draggable Tile Wrapper ───────────────────────────────────
interface DraggableTileProps {
  tile: DashboardTileType;
  index: number;
  data: RunReportResult | null;
  isLoading: boolean;
  onRemove: () => void;
  onEdit: () => void;
}

function DraggableTile({
  tile,
  index,
  data,
  isLoading,
  onRemove,
  onEdit,
}: DraggableTileProps) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: `tile-${index}`,
    data: { index },
  });

  const style: React.CSSProperties = {
    gridColumn: `${tile.position.x + 1} / span ${tile.size.w}`,
    gridRow: `${tile.position.y + 1} / span ${tile.size.h}`,
    height: tile.size.h * ROW_HEIGHT_PX,
    transform: CSS.Translate.toString(transform),
    zIndex: transform ? 10 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <DashboardTile
        tile={tile}
        data={data}
        isLoading={isLoading}
        isEditing
        onRemove={onRemove}
        onEdit={onEdit}
        dragHandleProps={{ ...listeners, ...attributes }}
      />
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────
export function DashboardBuilder({
  dashboardId,
  initialData,
}: DashboardBuilderProps) {
  const router = useRouter();
  const { mutate: saveDashboard, isLoading: isSaving } = useSaveDashboard();
  const { mutate: deleteDashboard, isLoading: isDeleting } = useDeleteDashboard();
  const { items: savedReports } = useCustomReports();
  const { mutate: runReport } = useRunReport();

  // ── Form state ───────────────────────────────────────────
  const [name, setName] = useState(initialData?.name ?? '');
  const [description, setDescription] = useState(initialData?.description ?? '');
  const [tiles, setTiles] = useState<DashboardTileType[]>(initialData?.tiles ?? []);

  // ── Tile data ────────────────────────────────────────────
  const [tileData, setTileData] = useState<Map<number, RunReportResult>>(new Map());
  const [tileLoading, setTileLoading] = useState<Set<number>>(new Set());

  // ── Modal state ──────────────────────────────────────────
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  // Sync initial data when it arrives
  useEffect(() => {
    if (initialData) {
      setName(initialData.name);
      setDescription(initialData.description ?? '');
      setTiles(initialData.tiles);
    }
  }, [initialData]);

  // ── Fetch tile data ──────────────────────────────────────
  const fetchedRef = useRef<Set<string>>(new Set());

  const fetchTileData = useCallback(
    async (tileIndex: number, reportId: string) => {
      setTileLoading((prev) => new Set(prev).add(tileIndex));
      try {
        const result = await runReport({ reportId });
        if (result) {
          setTileData((prev) => {
            const next = new Map(prev);
            next.set(tileIndex, result);
            return next;
          });
        }
      } finally {
        setTileLoading((prev) => {
          const next = new Set(prev);
          next.delete(tileIndex);
          return next;
        });
      }
    },
    [runReport],
  );

  // Fetch data for each tile on mount / when tiles change
  useEffect(() => {
    tiles.forEach((tile, idx) => {
      const key = `${idx}-${tile.reportId}`;
      if (!fetchedRef.current.has(key)) {
        fetchedRef.current.add(key);
        fetchTileData(idx, tile.reportId);
      }
    });
  }, [tiles, fetchTileData]);

  // ── Tile CRUD ────────────────────────────────────────────
  const handleAddTile = (tile: DashboardTileType) => {
    const newIndex = tiles.length;
    setTiles((prev) => [...prev, tile]);
    // Fetch data for the new tile
    fetchTileData(newIndex, tile.reportId);
  };

  const handleRemoveTile = (index: number) => {
    setTiles((prev) => prev.filter((_, i) => i !== index));
    setTileData((prev) => {
      const next = new Map(prev);
      next.delete(index);
      // Re-index entries above the removed index
      const reindexed = new Map<number, RunReportResult>();
      for (const [k, v] of next) {
        reindexed.set(k > index ? k - 1 : k, v);
      }
      return reindexed;
    });
    // Clear fetched cache so re-fetching works correctly after re-index
    fetchedRef.current.clear();
  };

  const handleEditTile = (_index: number) => {
    // For V1, editing a tile opens the add modal with pre-filled data
    // Future enhancement: open an edit-specific modal
  };

  // ── Drag & Drop ──────────────────────────────────────────
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, delta } = event;
    const tileIndex = (active.data.current as { index: number }).index;
    if (delta.x === 0 && delta.y === 0) return;

    setTiles((prev) =>
      prev.map((tile, i) => {
        if (i !== tileIndex) return tile;

        // Calculate grid cell delta from pixel delta
        // Each column = container width / 12, approximate with delta
        const gridRef = document.getElementById('dashboard-grid');
        const colWidth = gridRef ? gridRef.clientWidth / GRID_COLS : 80;
        const dxCols = Math.round(delta.x / colWidth);
        const dyRows = Math.round(delta.y / ROW_HEIGHT_PX);

        const newX = Math.max(0, Math.min(GRID_COLS - tile.size.w, tile.position.x + dxCols));
        const newY = Math.max(0, tile.position.y + dyRows);

        return {
          ...tile,
          position: { x: newX, y: newY },
        };
      }),
    );
  };

  // ── Save ─────────────────────────────────────────────────
  const handleSave = async () => {
    if (!name.trim()) return;

    const result = await saveDashboard({
      id: dashboardId,
      name: name.trim(),
      description: description.trim() || undefined,
      tiles,
    });

    if (result) {
      router.push(`/dashboards/${result.id}`);
    }
  };

  // ── Delete ───────────────────────────────────────────────
  const handleDelete = async () => {
    if (!dashboardId) return;
    const result = await deleteDashboard(dashboardId);
    if (result !== null) {
      router.push('/dashboards');
    }
  };

  // ── Compute grid rows needed ─────────────────────────────
  const maxRow = tiles.reduce(
    (max, t) => Math.max(max, t.position.y + t.size.h),
    4, // minimum 4 rows
  );

  return (
    <div className="flex min-h-screen flex-col">
      {/* Header */}
      <div className="border-b border-border bg-surface px-6 py-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.push('/dashboards')}
            className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label="Back to dashboards"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="text-lg font-semibold text-foreground">
            {dashboardId ? 'Edit Dashboard' : 'New Dashboard'}
          </h1>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <FormField label="Name" required>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Dashboard name"
              className="w-full rounded-lg border border-input px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </FormField>
          <FormField label="Description">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description"
              rows={1}
              className="w-full resize-none rounded-lg border border-input px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </FormField>
        </div>

        <div className="mt-4">
          <button
            type="button"
            onClick={() => setAddModalOpen(true)}
            className="inline-flex items-center gap-2 rounded-lg border border-input px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            <Plus className="h-4 w-4" />
            Add Tile
          </button>
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-auto px-6 py-4">
        {tiles.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-border py-20">
            <p className="text-sm text-muted-foreground">No tiles yet.</p>
            <button
              type="button"
              onClick={() => setAddModalOpen(true)}
              className="mt-3 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
            >
              <Plus className="h-4 w-4" />
              Add Your First Tile
            </button>
          </div>
        ) : (
          <DndContext onDragEnd={handleDragEnd}>
            <div
              id="dashboard-grid"
              className="grid gap-4"
              style={{
                gridTemplateColumns: `repeat(${GRID_COLS}, 1fr)`,
                gridTemplateRows: `repeat(${maxRow}, ${ROW_HEIGHT_PX}px)`,
              }}
            >
              {tiles.map((tile, idx) => (
                <DraggableTile
                  key={`${idx}-${tile.reportId}`}
                  tile={tile}
                  index={idx}
                  data={tileData.get(idx) ?? null}
                  isLoading={tileLoading.has(idx)}
                  onRemove={() => handleRemoveTile(idx)}
                  onEdit={() => handleEditTile(idx)}
                />
              ))}
            </div>
          </DndContext>
        )}
      </div>

      {/* Sticky bottom bar */}
      <div className="sticky bottom-0 border-t border-border bg-surface px-6 py-3">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => router.push('/dashboards')}
            className="rounded-lg border border-input px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Cancel
          </button>
          <div className="flex items-center gap-3">
            {dashboardId && (
              <button
                type="button"
                onClick={() => setDeleteConfirmOpen(true)}
                disabled={isDeleting}
                className="inline-flex items-center gap-2 rounded-lg border border-red-500/40 px-4 py-2 text-sm font-medium text-red-500 transition-colors hover:bg-red-500/10"
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </button>
            )}
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving || !name.trim()}
              className={`inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:outline-none ${
                isSaving || !name.trim() ? 'cursor-not-allowed opacity-50' : ''
              }`}
            >
              <Save className="h-4 w-4" />
              {isSaving ? 'Saving...' : 'Save Dashboard'}
            </button>
          </div>
        </div>
      </div>

      {/* Add Tile Modal */}
      <AddTileModal
        open={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        onAdd={handleAddTile}
        savedReports={savedReports}
        existingTileCount={tiles.length}
      />

      {/* Delete Confirm Dialog */}
      <ConfirmDialog
        open={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        onConfirm={handleDelete}
        title="Delete Dashboard"
        description="Are you sure you want to delete this dashboard? This action cannot be undone."
        confirmLabel="Delete"
        destructive
        isLoading={isDeleting}
      />
    </div>
  );
}
