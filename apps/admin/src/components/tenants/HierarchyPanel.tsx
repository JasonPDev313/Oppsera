'use client';

import { Plus } from 'lucide-react';

interface HierarchyPanelProps<T> {
  title: string;
  items: T[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreate?: () => void;
  onEdit?: (item: T) => void;
  renderItem: (item: T) => React.ReactNode;
  emptyMessage: string;
  disableCreate?: boolean;
}

export function HierarchyPanel<T extends { id: string }>({
  title,
  items,
  selectedId,
  onSelect,
  onCreate,
  onEdit,
  renderItem,
  emptyMessage,
  disableCreate,
}: HierarchyPanelProps<T>) {
  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700 flex flex-col min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-slate-700">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium text-white">{title}</h3>
          <span className="text-xs text-slate-500 tabular-nums">({items.length})</span>
        </div>
        {onCreate && !disableCreate && (
          <button
            onClick={onCreate}
            className="p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
            title={`Add ${title.slice(0, -1)}`}
          >
            <Plus size={14} />
          </button>
        )}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
        {items.length === 0 ? (
          <p className="text-xs text-slate-500 text-center py-8 px-2">{emptyMessage}</p>
        ) : (
          items.map((item) => (
            <button
              key={item.id}
              onClick={() => onSelect(item.id)}
              onDoubleClick={() => onEdit?.(item)}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                selectedId === item.id
                  ? 'bg-indigo-600/20 text-white border border-indigo-500/30'
                  : 'text-slate-300 hover:bg-slate-700/50 border border-transparent'
              }`}
            >
              {renderItem(item)}
            </button>
          ))
        )}
      </div>
    </div>
  );
}
