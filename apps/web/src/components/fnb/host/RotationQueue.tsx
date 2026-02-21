'use client';

import { ArrowRight, User } from 'lucide-react';

interface ServerInRotation {
  id: string;
  name: string;
  coverCount: number;
  isNext: boolean;
}

interface RotationQueueProps {
  servers: ServerInRotation[];
  onAdvance: () => void;
  disabled?: boolean;
}

export function RotationQueue({ servers, onAdvance, disabled }: RotationQueueProps) {
  return (
    <div className="rounded-xl border p-4" style={{ borderColor: 'rgba(148, 163, 184, 0.15)', backgroundColor: 'var(--fnb-bg-surface)' }}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold" style={{ color: 'var(--fnb-text-primary)' }}>
          Server Rotation
        </h3>
        <button
          type="button"
          onClick={onAdvance}
          disabled={disabled}
          className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors hover:opacity-80 disabled:opacity-40"
          style={{ backgroundColor: 'var(--fnb-bg-elevated)', color: 'var(--fnb-text-secondary)' }}
        >
          Advance <ArrowRight className="h-3 w-3" />
        </button>
      </div>
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {servers.map((server, i) => (
          <div key={server.id} className="flex items-center gap-2 shrink-0">
            {i > 0 && <ArrowRight className="h-3 w-3 shrink-0" style={{ color: 'var(--fnb-text-muted)' }} />}
            <div
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 border"
              style={{
                borderColor: server.isNext ? 'var(--fnb-status-seated)' : 'rgba(148, 163, 184, 0.15)',
                backgroundColor: server.isNext
                  ? 'color-mix(in srgb, var(--fnb-status-seated) 10%, transparent)'
                  : 'var(--fnb-bg-elevated)',
              }}
            >
              <User className="h-3 w-3" style={{ color: server.isNext ? 'var(--fnb-status-seated)' : 'var(--fnb-text-muted)' }} />
              <span className="text-xs font-medium" style={{ color: 'var(--fnb-text-primary)' }}>
                {server.name}
              </span>
              <span className="text-[10px]" style={{ color: 'var(--fnb-text-muted)' }}>
                ({server.coverCount})
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
