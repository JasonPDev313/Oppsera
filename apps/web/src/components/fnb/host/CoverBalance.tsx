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
      className="rounded-xl px-4 py-3 bg-card border border-border shadow-sm"
      role="status"
      aria-live="polite"
      aria-label="Cover balance by server"
    >
      <span className="text-xs font-bold block mb-2.5 text-foreground">
        Cover Balance
      </span>
      <div className="space-y-2.5">
        {servers.map((server) => {
          const pct = (server.covers / maxCov) * 100;
          return (
            <div key={server.name}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-medium text-card-foreground">
                  {server.name}
                </span>
                <span className="text-[11px] font-bold tabular-nums text-muted-foreground">
                  {server.covers}
                </span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden bg-muted">
                <div
                  className="h-full rounded-full transition-all bg-blue-500"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
