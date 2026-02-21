'use client';

import { useState } from 'react';
import type { FnbTableWithStatus, FnbTableStatus } from '@/types/fnb';
import { FNB_TABLE_STATUS_COLORS, FNB_TABLE_STATUS_LABELS } from '@/types/fnb';
import { Users, Clock, ChevronRight } from 'lucide-react';

type SidebarMode = 'my-tables' | 'stats' | 'waitlist';

interface ContextSidebarProps {
  mode: SidebarMode;
  onModeChange: (mode: SidebarMode) => void;
  tables: FnbTableWithStatus[];
  mySectionOnly: boolean;
  currentUserId?: string;
  onTableTap: (tableId: string) => void;
}

function formatElapsed(seatedAt: string | null): string {
  if (!seatedAt) return '';
  const minutes = Math.floor((Date.now() - new Date(seatedAt).getTime()) / 60000);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h${minutes % 60}m`;
}

export function ContextSidebar({ mode, onModeChange, tables, mySectionOnly, currentUserId, onTableTap }: ContextSidebarProps) {
  const [expandedStatus, setExpandedStatus] = useState<string | null>('seated');

  const filteredTables = mySectionOnly && currentUserId
    ? tables.filter((t) => t.currentServerUserId === currentUserId)
    : tables;

  // Group tables by status for stats
  const statusGroups = filteredTables.reduce<Record<string, FnbTableWithStatus[]>>((acc, t) => {
    acc[t.status] = acc[t.status] ?? [];
    acc[t.status]!.push(t);
    return acc;
  }, {});

  const activeTables = filteredTables.filter((t) =>
    !['available', 'dirty', 'blocked'].includes(t.status)
  );

  const modes: { key: SidebarMode; label: string }[] = [
    { key: 'my-tables', label: 'My Tables' },
    { key: 'stats', label: 'Stats' },
    { key: 'waitlist', label: 'Waitlist' },
  ];

  return (
    <div
      className="hidden sm:flex flex-col h-full border-l"
      style={{
        width: '260px',
        backgroundColor: 'var(--fnb-bg-surface)',
        borderColor: 'rgba(148, 163, 184, 0.15)',
      }}
    >
      {/* Mode tabs */}
      <div className="flex border-b" style={{ borderColor: 'rgba(148, 163, 184, 0.15)' }}>
        {modes.map((m) => (
          <button
            key={m.key}
            type="button"
            onClick={() => onModeChange(m.key)}
            className="flex-1 py-2.5 text-xs font-semibold transition-colors"
            style={{
              color: mode === m.key ? 'var(--fnb-text-primary)' : 'var(--fnb-text-muted)',
              borderBottom: mode === m.key ? '2px solid var(--fnb-status-seated)' : '2px solid transparent',
            }}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-2">
        {mode === 'my-tables' && (
          <div className="flex flex-col gap-1">
            {activeTables.length === 0 && (
              <p className="text-xs p-3 text-center" style={{ color: 'var(--fnb-text-muted)' }}>
                No active tables
              </p>
            )}
            {activeTables.map((table) => {
              const color = FNB_TABLE_STATUS_COLORS[table.status] ?? '#6b7280';
              return (
                <button
                  key={table.tableId}
                  type="button"
                  onClick={() => onTableTap(table.tableId)}
                  className="flex items-center gap-3 rounded-lg p-2.5 text-left transition-colors hover:opacity-80"
                  style={{ backgroundColor: 'var(--fnb-bg-elevated)' }}
                >
                  <div
                    className="flex items-center justify-center rounded-md font-bold text-sm"
                    style={{
                      width: '36px',
                      height: '36px',
                      borderColor: color,
                      border: `2px solid ${color}`,
                      color: 'var(--fnb-text-primary)',
                    }}
                  >
                    {table.tableNumber}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium" style={{ color }}>
                        {FNB_TABLE_STATUS_LABELS[table.status]}
                      </span>
                      {table.partySize && (
                        <span className="flex items-center gap-0.5 text-[10px]" style={{ color: 'var(--fnb-text-muted)' }}>
                          <Users className="h-2.5 w-2.5" /> {table.partySize}
                        </span>
                      )}
                    </div>
                    {table.seatedAt && (
                      <span className="flex items-center gap-0.5 text-[10px] fnb-mono mt-0.5" style={{ color: 'var(--fnb-text-muted)' }}>
                        <Clock className="h-2.5 w-2.5" /> {formatElapsed(table.seatedAt)}
                      </span>
                    )}
                  </div>
                  <ChevronRight className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--fnb-text-muted)' }} />
                </button>
              );
            })}
          </div>
        )}

        {mode === 'stats' && (
          <div className="flex flex-col gap-1">
            {Object.entries(statusGroups).map(([status, group]) => {
              const s = status as FnbTableStatus;
              return (
              <div key={status}>
                <button
                  type="button"
                  onClick={() => setExpandedStatus(expandedStatus === status ? null : status)}
                  className="flex items-center justify-between w-full rounded-lg p-2.5 text-left transition-colors hover:opacity-80"
                  style={{ backgroundColor: 'var(--fnb-bg-elevated)' }}
                >
                  <span className="text-xs font-semibold" style={{ color: FNB_TABLE_STATUS_COLORS[s] ?? '#6b7280' }}>
                    {FNB_TABLE_STATUS_LABELS[s] ?? status}
                  </span>
                  <span className="text-xs font-bold fnb-mono" style={{ color: 'var(--fnb-text-primary)' }}>
                    {group.length}
                  </span>
                </button>
                {expandedStatus === status && (
                  <div className="ml-3 mt-1 flex flex-col gap-0.5">
                    {group.map((t) => (
                      <button
                        key={t.tableId}
                        type="button"
                        onClick={() => onTableTap(t.tableId)}
                        className="text-left text-xs py-1 px-2 rounded hover:opacity-80"
                        style={{ color: 'var(--fnb-text-secondary)' }}
                      >
                        Table {t.tableNumber} {t.partySize ? `(${t.partySize})` : ''}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              );
            })}
          </div>
        )}

        {mode === 'waitlist' && (
          <p className="text-xs p-3 text-center" style={{ color: 'var(--fnb-text-muted)' }}>
            Waitlist coming soon
          </p>
        )}
      </div>
    </div>
  );
}
