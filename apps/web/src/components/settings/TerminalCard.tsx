'use client';

import type { Terminal } from '@oppsera/core/profit-centers';

interface Props {
  terminal: Terminal;
  onEdit: () => void;
}

export function TerminalCard({ terminal: t, onEdit }: Props) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="flex items-start justify-between">
        <span className="text-lg font-semibold text-foreground">{t.name}</span>
        <span
          className={`h-2.5 w-2.5 rounded-full ${t.isActive ? 'bg-green-500' : 'bg-muted-foreground/30'}`}
        />
      </div>

      {t.terminalNumber != null && (
        <p className="mt-1 text-xs text-muted-foreground">#{t.terminalNumber}</p>
      )}

      <div className="mt-3 space-y-1 text-sm text-muted-foreground">
        {t.ipAddress && <p>IP: {t.ipAddress}</p>}
        {t.deviceIdentifier && <p>Device: {t.deviceIdentifier}</p>}
      </div>

      <div className="mt-4">
        <button
          onClick={onEdit}
          className="rounded-md px-3 py-1 text-sm font-medium text-indigo-500 hover:bg-indigo-500/10"
        >
          Edit
        </button>
      </div>
    </div>
  );
}
