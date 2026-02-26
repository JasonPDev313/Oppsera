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
    <div className="rounded-xl px-4 py-3 bg-card border border-border shadow-sm">
      <div className="flex items-center justify-between mb-2.5">
        <span className="text-xs font-bold text-foreground">
          Server Rotation
        </span>
        <button
          type="button"
          onClick={onAdvance}
          disabled={disabled}
          className="flex items-center gap-1 rounded-lg px-2.5 h-7 text-[11px] font-semibold transition-all active:scale-95 disabled:opacity-40 bg-muted hover:bg-accent text-muted-foreground"
        >
          <SkipForward size={11} />
          Advance
        </button>
      </div>

      <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5" role="list" aria-live="polite" aria-label="Server rotation order">
        {servers.map((server, i) => (
          <div key={server.id} className="flex items-center gap-1.5 shrink-0">
            {i > 0 && (
              <ArrowRight size={10} className="shrink-0 text-muted-foreground/50" />
            )}
            <div
              role="listitem"
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 transition-colors duration-300 border ${
                server.isNext
                  ? 'bg-indigo-500/10 border-indigo-500/20'
                  : 'bg-muted border-border'
              }`}
            >
              <User
                size={12}
                className={server.isNext ? 'text-indigo-400' : 'text-muted-foreground'}
              />
              <span
                className={`text-[11px] font-medium ${
                  server.isNext ? 'text-indigo-400' : 'text-card-foreground'
                }`}
              >
                {server.name}
              </span>
              <span className="text-[10px] tabular-nums text-muted-foreground">
                ({server.coverCount})
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
