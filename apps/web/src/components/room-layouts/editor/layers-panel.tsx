'use client';

import { useState, useRef, useCallback } from 'react';
import { Eye, EyeOff, Lock, Unlock, Plus, Trash2, GripVertical } from 'lucide-react';
import { useEditorStore } from '@/stores/room-layout-editor';

export function LayersPanel() {
  const { layers, updateLayer, addLayer, removeLayer, reorderLayers, objects, selectedIds, commitToHistory } = useEditorStore();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const dragItemRef = useRef<string | null>(null);
  const dragOverRef = useRef<string | null>(null);

  // Sort layers: highest sortOrder first (top layer rendered last = on top)
  const sortedLayers = [...layers].sort((a, b) => b.sortOrder - a.sortOrder);

  // Determine which layers contain selected objects
  const selectedLayerIds = new Set(
    objects.filter((o) => selectedIds.includes(o.id)).map((o) => o.layerId),
  );

  const handleDoubleClick = (layerId: string, name: string) => {
    setEditingId(layerId);
    setEditValue(name);
  };

  const handleRenameSubmit = () => {
    if (editingId && editValue.trim()) {
      updateLayer(editingId, { name: editValue.trim() });
      commitToHistory();
    }
    setEditingId(null);
  };

  const handleDragStart = (layerId: string) => {
    dragItemRef.current = layerId;
  };

  const handleDragOver = useCallback((e: React.DragEvent, layerId: string) => {
    e.preventDefault();
    dragOverRef.current = layerId;
  }, []);

  const handleDrop = useCallback(() => {
    const dragId = dragItemRef.current;
    const overId = dragOverRef.current;
    if (!dragId || !overId || dragId === overId) return;

    const currentOrder = sortedLayers.map((l) => l.id);
    const dragIndex = currentOrder.indexOf(dragId);
    const overIndex = currentOrder.indexOf(overId);
    if (dragIndex === -1 || overIndex === -1) return;

    currentOrder.splice(dragIndex, 1);
    currentOrder.splice(overIndex, 0, dragId);

    // Reverse because sortedLayers is highest-first, but reorderLayers expects index = sortOrder
    reorderLayers([...currentOrder].reverse());
    commitToHistory();
    dragItemRef.current = null;
    dragOverRef.current = null;
  }, [sortedLayers, reorderLayers, commitToHistory]);

  const handleDelete = (layerId: string) => {
    if (layerId === 'default') return;
    removeLayer(layerId);
    commitToHistory();
  };

  return (
    <div className="border-t border-border bg-surface">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Layers</h3>
        <button
          onClick={() => addLayer(`Layer ${layers.length + 1}`)}
          className="rounded p-1 text-muted-foreground hover:bg-accent/50 hover:text-foreground"
          title="Add Layer"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="max-h-48 overflow-y-auto">
        {sortedLayers.map((layer) => {
          const objectCount = objects.filter((o) => o.layerId === layer.id).length;
          const isHighlighted = selectedLayerIds.has(layer.id);

          return (
            <div
              key={layer.id}
              draggable
              onDragStart={() => handleDragStart(layer.id)}
              onDragOver={(e) => handleDragOver(e, layer.id)}
              onDrop={handleDrop}
              className={`flex items-center gap-1 px-2 py-1.5 text-sm hover:bg-accent/30 ${
                !layer.visible ? 'opacity-50' : ''
              } ${isHighlighted ? 'bg-indigo-500/10' : ''}`}
            >
              <GripVertical className="h-3 w-3 shrink-0 cursor-grab text-muted-foreground" />
              <button
                onClick={() => updateLayer(layer.id, { visible: !layer.visible })}
                className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                title={layer.visible ? 'Hide' : 'Show'}
              >
                {layer.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />}
              </button>
              <button
                onClick={() => updateLayer(layer.id, { locked: !layer.locked })}
                className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                title={layer.locked ? 'Unlock' : 'Lock'}
              >
                {layer.locked ? <Lock className="h-3.5 w-3.5 text-amber-500" /> : <Unlock className="h-3.5 w-3.5" />}
              </button>
              {editingId === layer.id ? (
                <input
                  type="text"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onBlur={handleRenameSubmit}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleRenameSubmit(); if (e.key === 'Escape') setEditingId(null); }}
                  autoFocus
                  className="flex-1 rounded border border-indigo-500/30 bg-surface px-1 py-0 text-xs text-foreground"
                />
              ) : (
                <span
                  className="flex-1 cursor-default truncate text-foreground"
                  onDoubleClick={() => handleDoubleClick(layer.id, layer.name)}
                >
                  {layer.name}
                </span>
              )}
              <span className="text-xs text-muted-foreground">{objectCount}</span>
              {layer.id !== 'default' && (
                <button
                  onClick={() => handleDelete(layer.id)}
                  className="rounded p-0.5 text-muted-foreground hover:text-red-500"
                  title="Delete Layer"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
