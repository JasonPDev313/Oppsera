'use client';

import { useState, useEffect } from 'react';
import { User, ChevronRight } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';

interface ServerOption {
  id: string;
  name: string;
  openTabCount: number;
}

interface TransferTargetPickerProps {
  locationId: string;
  excludeServerIds?: string[];
  onSelect: (serverId: string, serverName: string) => void;
  onCancel: () => void;
}

export function TransferTargetPicker({ locationId, excludeServerIds, onSelect, onCancel }: TransferTargetPickerProps) {
  const [allServers, setAllServers] = useState<ServerOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<ServerOption | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    apiFetch<{ data: ServerOption[] }>(`/api/v1/fnb/sections/servers${locationId ? `?locationId=${locationId}` : ''}`, { signal: controller.signal })
      .then((res) => { if (!controller.signal.aborted) setAllServers(res.data); })
      .catch(() => { if (!controller.signal.aborted) setAllServers([]); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => { controller.abort(); };
  }, [locationId]);

  // Filter out excluded servers and apply search — outside useEffect to avoid re-fetch
  const excludeSet = new Set(excludeServerIds ?? []);
  const filtered = allServers
    .filter((s) => !excludeSet.has(s.id))
    .filter((s) => !search || s.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-base font-semibold" style={{ color: 'var(--fnb-text-primary)' }}>
        Transfer to Server
      </h3>

      <input
        type="text"
        placeholder="Search servers..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full px-3 py-2 rounded-md text-sm outline-none"
        style={{
          background: 'var(--fnb-bg-primary)',
          color: 'var(--fnb-text-primary)',
          border: '1px solid var(--fnb-border-subtle)',
        }}
      />

      <div className="flex flex-col gap-1 max-h-75 overflow-y-auto">
        {loading && (
          <p className="text-sm py-4 text-center" style={{ color: 'var(--fnb-text-muted)' }}>
            Loading servers...
          </p>
        )}
        {!loading && filtered.length === 0 && (
          <p className="text-sm py-4 text-center" style={{ color: 'var(--fnb-text-muted)' }}>
            No servers found
          </p>
        )}
        {filtered.map((server) => {
          const isSelected = selected?.id === server.id;
          return (
            <button
              key={server.id}
              onClick={() => setSelected(isSelected ? null : server)}
              className="flex items-center gap-3 px-3 py-2.5 rounded-md text-left transition-colors"
              style={{
                background: isSelected ? 'var(--fnb-accent-primary-muted)' : 'var(--fnb-bg-elevated)',
                color: 'var(--fnb-text-primary)',
                outline: isSelected ? '2px solid var(--fnb-accent-primary)' : 'none',
              }}
            >
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                style={{ background: isSelected ? 'var(--fnb-accent-primary)' : 'var(--fnb-accent-primary-muted)' }}
              >
                <User size={16} style={{ color: isSelected ? '#fff' : 'var(--fnb-accent-primary)' }} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{server.name}</div>
                <div className="text-xs" style={{ color: 'var(--fnb-text-muted)' }}>
                  {server.openTabCount} open tab{server.openTabCount !== 1 ? 's' : ''}
                </div>
              </div>
              {isSelected && <ChevronRight size={16} style={{ color: 'var(--fnb-accent-primary)' }} />}
            </button>
          );
        })}
      </div>

      <div className="flex gap-2">
        <button
          onClick={onCancel}
          className="flex-1 px-3 py-2 rounded-md text-sm font-medium transition-colors"
          style={{
            background: 'transparent',
            color: 'var(--fnb-text-secondary)',
            border: '1px solid var(--fnb-border-subtle)',
          }}
        >
          Cancel
        </button>
        <button
          onClick={() => selected && onSelect(selected.id, selected.name)}
          disabled={!selected}
          className="flex-1 px-3 py-2 rounded-md text-sm font-semibold transition-colors"
          style={{
            background: selected ? 'var(--fnb-accent-primary)' : 'var(--fnb-bg-elevated)',
            color: selected ? '#fff' : 'var(--fnb-text-muted)',
          }}
        >
          {selected ? `Transfer to ${selected.name}` : 'Select a server'}
        </button>
      </div>
    </div>
  );
}
