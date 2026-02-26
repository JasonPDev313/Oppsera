'use client';

import { useMemo } from 'react';
import { Users, Clock, Plus } from 'lucide-react';
import type { FnbTableWithStatus } from '@/types/fnb';
import { FNB_TABLE_STATUS_COLORS, FNB_TABLE_STATUS_LABELS } from '@/types/fnb';

interface TableGridViewProps {
  tables: FnbTableWithStatus[];
  selectedTableId: string | null;
  onTap: (tableId: string) => void;
  onLongPress?: (tableId: string) => void;
  onAddTab?: (tableId: string) => void;
  onContextMenu?: (tableId: string) => void;
  /** When provided, only show tables in this set */
  filteredTableIds?: Set<string>;
}

function formatElapsed(seatedAt: string | null): string {
  if (!seatedAt) return '';
  const minutes = Math.floor((Date.now() - new Date(seatedAt).getTime()) / 60000);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h${minutes % 60}m`;
}

export function TableGridView({ tables, selectedTableId, onTap, onLongPress, onAddTab, onContextMenu, filteredTableIds }: TableGridViewProps) {
  const sorted = useMemo(() => {
    const base = filteredTableIds
      ? tables.filter((t) => filteredTableIds.has(t.tableId))
      : tables;
    return [...base].sort((a, b) => a.tableNumber - b.tableNumber);
  }, [tables, filteredTableIds]);

  return (
    <div className="flex flex-wrap gap-3 p-4 content-start">
      {sorted.map((table) => {
        const statusColor = FNB_TABLE_STATUS_COLORS[table.status] ?? '#6b7280';
        const statusLabel = FNB_TABLE_STATUS_LABELS[table.status] ?? table.status;
        const elapsed = formatElapsed(table.seatedAt);
        const isSelected = table.tableId === selectedTableId;

        const handlePointerDown = () => {
          if (!onLongPress) return;
          const timer = setTimeout(() => onLongPress(table.tableId), 500);
          const up = () => { clearTimeout(timer); window.removeEventListener('pointerup', up); };
          window.addEventListener('pointerup', up);
        };

        return (
          <button
            key={table.tableId}
            type="button"
            onClick={() => onTap(table.tableId)}
            onPointerDown={handlePointerDown}
            onContextMenu={(e) => { if (onContextMenu) { e.preventDefault(); onContextMenu(table.tableId); } }}
            className={`
              group relative flex flex-col items-center justify-center
              border-2 transition-all select-none
              rounded-lg w-[100px] h-[90px]
              ${isSelected ? 'ring-2 ring-blue-500 ring-offset-2 scale-105' : ''}
            `}
            style={{
              borderColor: statusColor,
              backgroundColor: `${statusColor}15`,
            }}
          >
            {/* Table number */}
            <span className="font-bold leading-none text-lg text-foreground">
              {table.tableNumber}
            </span>

            {/* Status label */}
            <span
              className="font-medium uppercase tracking-wider mt-0.5 text-[9px]"
              style={{ color: statusColor }}
            >
              {statusLabel}
            </span>

            {/* Party size badge */}
            {table.partySize != null && table.partySize > 0 && (
              <span className="absolute top-1 right-1 flex items-center gap-0.5 text-[9px] text-gray-500">
                <Users className="h-2.5 w-2.5" />
                {table.partySize}
              </span>
            )}

            {/* Timer badge */}
            {elapsed && (
              <span className="absolute bottom-1 right-1 flex items-center gap-0.5 text-[9px] text-gray-400">
                <Clock className="h-2.5 w-2.5" />
                {elapsed}
              </span>
            )}

            {/* Combined indicator */}
            {table.combineGroupId && (
              <span className="absolute top-1 left-1 h-2 w-2 rounded-full bg-amber-500" title="Combined" />
            )}

            {/* Add tab "+" button — visible on hover */}
            {onAddTab && (
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => { e.stopPropagation(); onAddTab(table.tableId); }}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); onAddTab(table.tableId); } }}
                onPointerDown={(e) => e.stopPropagation()}
                className="absolute -bottom-1.5 -right-1.5 flex items-center justify-center rounded-full w-5 h-5 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity shadow-md bg-green-600 text-white"
                title="Add new tab"
              >
                <Plus className="h-3 w-3" />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
