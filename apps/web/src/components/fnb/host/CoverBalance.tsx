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

  return (
    <div className="rounded-xl border p-4" style={{ borderColor: 'rgba(148, 163, 184, 0.15)', backgroundColor: 'var(--fnb-bg-surface)' }}>
      <h3 className="text-sm font-bold mb-3" style={{ color: 'var(--fnb-text-primary)' }}>
        Cover Balance
      </h3>
      <div className="space-y-2">
        {servers.map((server) => {
          const pct = (server.covers / maxCov) * 100;
          return (
            <div key={server.name}>
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-xs font-medium" style={{ color: 'var(--fnb-text-secondary)' }}>
                  {server.name}
                </span>
                <span className="text-xs font-mono" style={{ color: 'var(--fnb-text-muted)', fontFamily: 'var(--fnb-font-mono)' }}>
                  {server.covers}
                </span>
              </div>
              <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--fnb-bg-elevated)' }}>
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
