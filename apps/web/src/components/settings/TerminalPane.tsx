'use client';

import { useState } from 'react';
import { MoreVertical, Plus } from 'lucide-react';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import type { Terminal } from '@oppsera/core/profit-centers';

interface Props {
  terminals: Terminal[] | null;
  isLoading: boolean;
  onAdd: () => void;
  onEdit: (id: string) => void;
  onDeactivate: (id: string) => void;
  disabled?: boolean;
  emptyMessage?: string;
}

function PaneSkeleton() {
  return (
    <div className="flex-1 space-y-1 p-2">
      {[1, 2, 3].map((i) => (
        <div key={i} className="h-9 w-full animate-pulse rounded bg-muted0/10" />
      ))}
    </div>
  );
}

export function TerminalPane({
  terminals,
  isLoading,
  onAdd,
  onEdit,
  onDeactivate,
  disabled,
  emptyMessage = 'No terminals yet',
}: Props) {
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [deactivateId, setDeactivateId] = useState<string | null>(null);

  const items = terminals ?? [];

  return (
    <div className="flex flex-col rounded-lg border border-border bg-surface">
      <div className="border-b border-border px-4 py-3">
        <h3 className="text-sm font-semibold text-foreground">Terminals</h3>
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <PaneSkeleton />
        ) : disabled ? (
          <p className="px-4 py-6 text-center text-xs text-muted-foreground">
            {emptyMessage}
          </p>
        ) : items.length === 0 ? (
          <p className="px-4 py-6 text-center text-xs text-muted-foreground">
            No terminals yet
          </p>
        ) : (
          items.map((t) => (
            <div
              key={t.id}
              className="relative flex items-center justify-between px-4 py-2.5 text-sm transition-colors hover:bg-muted0/10"
            >
              <div className="flex flex-1 items-center gap-2 overflow-hidden">
                <span
                  className={`truncate ${!t.isActive ? 'text-muted-foreground line-through' : 'text-foreground'}`}
                >
                  {t.name}
                </span>
                {t.terminalNumber != null && (
                  <span className="shrink-0 rounded bg-muted0/10 px-1.5 py-0.5 text-xs text-muted-foreground">
                    #{t.terminalNumber}
                  </span>
                )}
                {t.deviceIdentifier && (
                  <span className="hidden shrink-0 truncate text-xs text-muted-foreground sm:inline">
                    {t.deviceIdentifier}
                  </span>
                )}
              </div>
              <div className="relative">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuOpen(menuOpen === t.id ? null : t.id);
                  }}
                  className="rounded p-1 text-muted-foreground hover:text-muted-foreground"
                >
                  <MoreVertical className="h-4 w-4" />
                </button>
                {menuOpen === t.id && (
                  <div className="absolute right-0 top-full z-10 w-32 rounded-lg border border-border bg-surface py-1 shadow-lg">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setMenuOpen(null);
                        onEdit(t.id);
                      }}
                      className="w-full px-3 py-1.5 text-left text-sm text-foreground hover:bg-muted0/10"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setMenuOpen(null);
                        setDeactivateId(t.id);
                      }}
                      className="w-full px-3 py-1.5 text-left text-sm text-red-500 hover:bg-red-500/10"
                    >
                      Deactivate
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="border-t border-border p-3">
        <button
          type="button"
          onClick={onAdd}
          disabled={disabled}
          className="flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-gray-400/50 px-3 py-2 text-sm text-muted-foreground transition-colors hover:border-indigo-500/50 hover:text-indigo-500 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-gray-400/50 disabled:hover:text-muted-foreground"
        >
          <Plus className="h-4 w-4" /> Add Terminal
        </button>
      </div>

      <ConfirmDialog
        open={!!deactivateId}
        onClose={() => setDeactivateId(null)}
        onConfirm={() => {
          if (deactivateId) onDeactivate(deactivateId);
          setDeactivateId(null);
        }}
        title="Deactivate Terminal?"
        description="This will hide it from new selections. Existing transactions will not be affected."
        confirmLabel="Deactivate"
        destructive
      />
    </div>
  );
}
