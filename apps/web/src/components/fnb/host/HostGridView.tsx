'use client';

import { Users, Clock } from 'lucide-react';
import type { HostTableItem } from '@/hooks/use-fnb-host';
import { useAssignMode } from './AssignModeContext';

interface HostGridViewProps {
  tables: HostTableItem[];
  onSeatTable?: (tableId: string) => void;
  onClearTable?: (tableId: string) => void;
}

const STATUS_LABELS: Record<string, string> = {
  available: 'Available',
  seated: 'Seated',
  reserved: 'Reserved',
  dirty: 'Dirty',
  blocked: 'Blocked',
};

const STATUS_DOT_COLORS: Record<string, string> = {
  available: 'var(--fnb-status-available)',
  seated: 'var(--fnb-status-seated)',
  reserved: 'var(--fnb-status-reserved)',
  dirty: 'var(--fnb-danger)',
  blocked: 'var(--fnb-text-disabled)',
};

export function formatElapsed(seatedAt: string | null): string {
  if (!seatedAt) return '—';
  const ms = Date.now() - new Date(seatedAt).getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

export function HostGridView({ tables, onSeatTable, onClearTable }: HostGridViewProps) {
  const { assignMode, selectedParty } = useAssignMode();

  if (tables.length === 0) {
    return (
      <div
        className="flex items-center justify-center h-full"
        style={{ color: 'var(--fnb-text-muted)' }}
      >
        <span className="text-xs">No tables to display</span>
      </div>
    );
  }

  const sortedTables = [...tables].sort((a, b) => a.tableNumber - b.tableNumber);

  return (
    <div className="h-full overflow-y-auto">
      <table className="w-full" aria-label="Table grid">
        <thead>
          <tr>
            {['Table', 'Status', 'Capacity', 'Server', 'Time', 'Action'].map((h) => (
              <th
                key={h}
                className="text-left text-[10px] font-bold uppercase tracking-wider px-3 py-2 sticky top-0"
                style={{
                  color: 'var(--fnb-text-muted)',
                  backgroundColor: 'var(--fnb-bg-surface)',
                  borderBottom: 'var(--fnb-border-subtle)',
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedTables.map((table) => {
            const status = table.status ?? 'available';
            const isEligible =
              assignMode &&
              selectedParty &&
              status === 'available' &&
              table.capacityMax >= selectedParty.partySize;

            return (
              <tr
                key={table.id}
                style={{
                  borderBottom: 'var(--fnb-border-subtle)',
                  backgroundColor: isEligible
                    ? 'color-mix(in srgb, var(--fnb-status-available) 8%, transparent)'
                    : 'transparent',
                }}
              >
                <td className="px-3 py-2">
                  <span
                    className="text-xs font-bold"
                    style={{ color: 'var(--fnb-text-primary)' }}
                  >
                    {table.tableNumber}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1.5">
                    <div
                      className="w-2 h-2 rounded-full shrink-0 transition-colors duration-300"
                      style={{ backgroundColor: STATUS_DOT_COLORS[status] ?? 'var(--fnb-text-disabled)' }}
                    />
                    <span className="text-[11px]" style={{ color: 'var(--fnb-text-secondary)' }}>
                      {STATUS_LABELS[status] ?? status}
                    </span>
                  </div>
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1">
                    <Users size={11} style={{ color: 'var(--fnb-text-muted)' }} />
                    <span
                      className="text-[11px] tabular-nums"
                      style={{ color: 'var(--fnb-text-secondary)', fontFamily: 'var(--fnb-font-mono)' }}
                    >
                      {table.capacityMin === table.capacityMax ? table.capacityMax : `${table.capacityMin}–${table.capacityMax}`}
                    </span>
                  </div>
                </td>
                <td className="px-3 py-2">
                  <span className="text-[11px]" style={{ color: 'var(--fnb-text-secondary)' }}>
                    {table.serverName ?? '—'}
                  </span>
                </td>
                <td className="px-3 py-2">
                  {status === 'seated' ? (
                    <div className="flex items-center gap-1">
                      <Clock size={11} style={{ color: 'var(--fnb-text-muted)' }} />
                      <span
                        className="text-[11px] tabular-nums"
                        style={{ color: 'var(--fnb-text-secondary)', fontFamily: 'var(--fnb-font-mono)' }}
                      >
                        {formatElapsed(table.seatedAt)}
                      </span>
                    </div>
                  ) : (
                    <span className="text-[11px]" style={{ color: 'var(--fnb-text-disabled)' }}>—</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  {isEligible && onSeatTable ? (
                    <button
                      type="button"
                      onClick={() => onSeatTable(table.id)}
                      className="text-[10px] font-semibold rounded px-2 py-1 transition-all active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 outline-none"
                      style={{
                        backgroundColor: 'var(--fnb-status-available)',
                        color: '#fff',
                      }}
                    >
                      Assign
                    </button>
                  ) : status === 'available' && onSeatTable && !assignMode ? (
                    <button
                      type="button"
                      onClick={() => onSeatTable(table.id)}
                      className="text-[10px] font-semibold rounded px-2 py-1 transition-all active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 outline-none"
                      style={{
                        backgroundColor: 'color-mix(in srgb, var(--fnb-status-available) 15%, transparent)',
                        color: 'var(--fnb-status-available)',
                      }}
                    >
                      Seat
                    </button>
                  ) : status === 'dirty' && onClearTable ? (
                    <button
                      type="button"
                      onClick={() => onClearTable(table.id)}
                      className="text-[10px] font-semibold rounded px-2 py-1 transition-all active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 outline-none"
                      style={{
                        backgroundColor: 'color-mix(in srgb, var(--fnb-danger) 12%, transparent)',
                        color: 'var(--fnb-danger)',
                      }}
                    >
                      Clear
                    </button>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
