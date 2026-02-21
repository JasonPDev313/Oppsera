'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowRightLeft, X, User } from 'lucide-react';

interface ServerOption {
  id: string;
  name: string;
  tabCount: number;
  tableCount: number;
}

interface TransferModalProps {
  open: boolean;
  onClose: () => void;
  onTransfer: (toServerUserId: string) => void;
  servers: ServerOption[];
  currentServerId: string;
  transferLabel: string;
  disabled?: boolean;
}

export function TransferModal({
  open,
  onClose,
  onTransfer,
  servers,
  currentServerId,
  transferLabel,
  disabled,
}: TransferModalProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (!open) return null;

  const availableServers = servers.filter((s) => s.id !== currentServerId);

  return createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{ zIndex: 'var(--fnb-z-modal)' } as React.CSSProperties}
    >
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div
        className="relative rounded-2xl p-5 w-96 shadow-2xl max-h-[80vh] flex flex-col"
        style={{ backgroundColor: 'var(--fnb-bg-surface)' }}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <ArrowRightLeft className="h-5 w-5" style={{ color: 'var(--fnb-status-ordered)' }} />
            <h3 className="text-sm font-bold" style={{ color: 'var(--fnb-text-primary)' }}>
              {transferLabel}
            </h3>
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded hover:opacity-80" style={{ color: 'var(--fnb-text-muted)' }}>
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-2 mb-4">
          {availableServers.length === 0 ? (
            <p className="text-xs text-center py-4" style={{ color: 'var(--fnb-text-muted)' }}>
              No other servers available
            </p>
          ) : (
            availableServers.map((server) => (
              <button
                key={server.id}
                type="button"
                onClick={() => setSelectedId(server.id)}
                className="w-full flex items-center justify-between rounded-lg px-3 py-2.5 border transition-colors"
                style={{
                  borderColor: selectedId === server.id ? 'var(--fnb-status-seated)' : 'rgba(148, 163, 184, 0.15)',
                  backgroundColor: selectedId === server.id
                    ? 'color-mix(in srgb, var(--fnb-status-seated) 10%, transparent)'
                    : 'var(--fnb-bg-elevated)',
                }}
              >
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4" style={{ color: 'var(--fnb-text-muted)' }} />
                  <span className="text-sm font-medium" style={{ color: 'var(--fnb-text-primary)' }}>
                    {server.name}
                  </span>
                </div>
                <span className="text-[10px]" style={{ color: 'var(--fnb-text-muted)' }}>
                  {server.tabCount} tabs · {server.tableCount} tables
                </span>
              </button>
            ))
          )}
        </div>

        <button
          type="button"
          onClick={() => selectedId && onTransfer(selectedId)}
          disabled={!selectedId || disabled}
          className="w-full rounded-lg py-2.5 text-sm font-bold text-white transition-colors hover:opacity-90 disabled:opacity-40"
          style={{ backgroundColor: 'var(--fnb-status-seated)' }}
        >
          Transfer
        </button>
      </div>
    </div>,
    document.body,
  );
}
