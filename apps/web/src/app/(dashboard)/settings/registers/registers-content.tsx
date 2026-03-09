'use client';

import { useState, useEffect } from 'react';
import { Monitor, MapPin, Store, Circle, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api-client';

interface TerminalInfo {
  id: string;
  name: string;
  terminalNumber: number | null;
  profitCenterName: string;
  locationName: string;
  locationId: string;
}

interface AllData {
  locations: Array<{ id: string; name: string; locationType: string; parentLocationId: string | null }>;
  profitCenters: Array<{ id: string; name: string; code: string | null; locationId: string }>;
  terminals: Array<{ id: string; name: string; terminalNumber: number | null; profitCenterId: string }>;
}

export default function RegistersContent() {
  const [terminals, setTerminals] = useState<TerminalInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await apiFetch<{ data: AllData }>('/api/v1/terminal-session/all');
        const data = res.data;

        // Flatten into a displayable list
        const list: TerminalInfo[] = [];
        for (const terminal of data.terminals) {
          const pc = data.profitCenters.find((p) => p.id === terminal.profitCenterId);
          if (!pc) continue;
          const loc = data.locations.find((l) => l.id === pc.locationId);
          list.push({
            id: terminal.id,
            name: terminal.name,
            terminalNumber: terminal.terminalNumber,
            profitCenterName: pc.name,
            locationName: loc?.name ?? 'Unknown',
            locationId: pc.locationId,
          });
        }
        setTerminals(list);
      } catch {
        // silently fail — page will show empty state
      }
      setIsLoading(false);
    })();
  }, []);

  // Group terminals by location
  const grouped = terminals.reduce<Record<string, { locationName: string; terminals: TerminalInfo[] }>>((acc, t) => {
    if (!acc[t.locationId]) {
      acc[t.locationId] = { locationName: t.locationName, terminals: [] };
    }
    acc[t.locationId]!.terminals.push(t);
    return acc;
  }, {});

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/settings"
            className="rounded-lg p-2 text-muted-foreground hover:bg-accent"
            aria-label="Back to Settings"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Registers</h1>
            <p className="mt-1 text-sm text-foreground/70">
              View all registers across your locations.
            </p>
          </div>
        </div>
        <Link
          href="/settings/profit-centers"
          className="inline-flex items-center gap-2 rounded-lg border border-input px-4 py-2 text-sm font-medium text-foreground/70 hover:bg-accent"
        >
          <Store className="h-4 w-4" />
          Manage Register Groups
        </Link>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground border-t-indigo-500" />
        </div>
      )}

      {!isLoading && terminals.length === 0 && (
        <div className="rounded-lg border border-border bg-surface p-8 text-center">
          <Monitor className="mx-auto h-12 w-12 text-muted-foreground/40" />
          <p className="mt-3 text-sm font-medium text-foreground">No registers found</p>
          <p className="mt-1 text-sm text-foreground/60">
            Set up register groups and registers in your profit center settings.
          </p>
          <Link
            href="/settings/profit-centers"
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500"
          >
            Set Up Now
          </Link>
        </div>
      )}

      {!isLoading && Object.entries(grouped).map(([locId, group]) => (
        <div key={locId} className="rounded-lg border border-border bg-surface overflow-hidden">
          {/* Location header */}
          <div className="flex items-center gap-2 border-b border-border bg-muted/30 px-4 py-3">
            <MapPin className="h-4 w-4 text-indigo-400" />
            <h2 className="text-sm font-semibold text-foreground">{group.locationName}</h2>
            <span className="text-xs text-foreground/50">{group.terminals.length} register{group.terminals.length !== 1 ? 's' : ''}</span>
          </div>

          {/* Terminal list */}
          <div className="divide-y divide-border">
            {group.terminals.map((t) => (
              <div key={t.id} className="flex items-center gap-4 px-4 py-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10">
                  <Monitor className="h-5 w-5 text-emerald-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">
                    {t.name}
                    {t.terminalNumber != null && (
                      <span className="ml-1.5 text-foreground/50">#{t.terminalNumber}</span>
                    )}
                  </p>
                  <p className="text-xs text-foreground/60">
                    <Store className="inline h-3 w-3 mr-1" />
                    {t.profitCenterName}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <Circle className="h-2 w-2 fill-emerald-400 text-emerald-400" />
                  <span className="text-xs text-foreground/60">Available</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
