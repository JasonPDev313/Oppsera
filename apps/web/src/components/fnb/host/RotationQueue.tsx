'use client';

import { ArrowRight, User, SkipForward } from 'lucide-react';

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
  if (servers.length === 0) return null;

  return (
    <div
      className="rounded-xl px-4 py-3"
      style={{
        backgroundColor: 'var(--fnb-bg-surface)',
        border: 'var(--fnb-border-subtle)',
      }}
    >
      <div className="flex items-center justify-between mb-2.5">
        <span
          className="text-xs font-bold"
          style={{ color: 'var(--fnb-text-primary)' }}
        >
          Server Rotation
        </span>
        <button
          type="button"
          onClick={onAdvance}
          disabled={disabled}
          className="flex items-center gap-1 rounded-md px-2.5 text-[11px] font-semibold transition-all active:scale-95 disabled:opacity-40"
          style={{
            backgroundColor: 'var(--fnb-bg-elevated)',
            color: 'var(--fnb-text-secondary)',
            height: '28px',
          }}
        >
          <SkipForward size={11} />
          Advance
        </button>
      </div>

      <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
        {servers.map((server, i) => (
          <div key={server.id} className="flex items-center gap-1.5 shrink-0">
            {i > 0 && (
              <ArrowRight
                size={10}
                className="shrink-0"
                style={{ color: 'var(--fnb-text-disabled)' }}
              />
            )}
            <div
              className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5"
              style={{
                backgroundColor: server.isNext
                  ? 'rgba(59, 130, 246, 0.12)'
                  : 'var(--fnb-bg-elevated)',
                border: server.isNext
                  ? '1px solid rgba(59, 130, 246, 0.3)'
                  : 'var(--fnb-border-subtle)',
              }}
            >
              <User
                size={12}
                style={{
                  color: server.isNext ? 'var(--fnb-info)' : 'var(--fnb-text-muted)',
                }}
              />
              <span
                className="text-[11px] font-medium"
                style={{
                  color: server.isNext ? 'var(--fnb-info)' : 'var(--fnb-text-primary)',
                }}
              >
                {server.name}
              </span>
              <span
                className="text-[10px] tabular-nums"
                style={{
                  color: 'var(--fnb-text-muted)',
                  fontFamily: 'var(--fnb-font-mono)',
                }}
              >
                ({server.coverCount})
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
