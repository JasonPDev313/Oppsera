'use client';

interface ServerCovers {
  name: string;
  covers: number;
  maxCovers: number;
}

interface CoverBalanceProps {
  servers: ServerCovers[];
}

export function CoverBalance({ servers }: CoverBalanceProps) {
  const maxCov = Math.max(...servers.map((s) => s.covers), 1);

  if (servers.length === 0) return null;

  return (
    <div
      className="rounded-xl px-4 py-3"
      style={{
        backgroundColor: 'var(--fnb-bg-surface)',
        border: 'var(--fnb-border-subtle)',
      }}
    >
      <span
        className="text-xs font-bold block mb-2.5"
        style={{ color: 'var(--fnb-text-primary)' }}
      >
        Cover Balance
      </span>
      <div className="space-y-2">
        {servers.map((server) => {
          const pct = (server.covers / maxCov) * 100;
          return (
            <div key={server.name}>
              <div className="flex items-center justify-between mb-0.5">
                <span
                  className="text-[11px] font-medium"
                  style={{ color: 'var(--fnb-text-secondary)' }}
                >
                  {server.name}
                </span>
                <span
                  className="text-[11px] font-bold tabular-nums"
                  style={{
                    color: 'var(--fnb-text-muted)',
                    fontFamily: 'var(--fnb-font-mono)',
                  }}
                >
                  {server.covers}
                </span>
              </div>
              <div
                className="h-1.5 rounded-full overflow-hidden"
                style={{ backgroundColor: 'var(--fnb-bg-elevated)' }}
              >
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${pct}%`,
                    backgroundColor: 'var(--fnb-status-seated)',
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
