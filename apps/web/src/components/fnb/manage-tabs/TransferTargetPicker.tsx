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

export function TransferTargetPicker({ locationId, excludeServerIds = [], onSelect, onCancel }: TransferTargetPickerProps) {
  const [servers, setServers] = useState<ServerOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    apiFetch<{ data: ServerOption[] }>('/api/v1/fnb/sections/servers', {
      headers: locationId ? { 'X-Location-Id': locationId } : undefined,
    })
      .then((res) => setServers(res.data.filter((s) => !excludeServerIds.includes(s.id))))
      .catch(() => setServers([]))
      .finally(() => setLoading(false));
  }, [locationId, excludeServerIds]);

  const filtered = search
    ? servers.filter((s) => s.name.toLowerCase().includes(search.toLowerCase()))
    : servers;

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

      <div className="flex flex-col gap-1 max-h-[300px] overflow-y-auto">
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
        {filtered.map((server) => (
          <button
            key={server.id}
            onClick={() => onSelect(server.id, server.name)}
            className="flex items-center gap-3 px-3 py-2.5 rounded-md text-left transition-colors"
            style={{
              background: 'var(--fnb-bg-elevated)',
              color: 'var(--fnb-text-primary)',
            }}
          >
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
              style={{ background: 'var(--fnb-accent-primary-muted)' }}
            >
              <User size={16} style={{ color: 'var(--fnb-accent-primary)' }} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{server.name}</div>
              <div className="text-xs" style={{ color: 'var(--fnb-text-muted)' }}>
                {server.openTabCount} open tab{server.openTabCount !== 1 ? 's' : ''}
              </div>
            </div>
            <ChevronRight size={16} style={{ color: 'var(--fnb-text-muted)' }} />
          </button>
        ))}
      </div>

      <button
        onClick={onCancel}
        className="w-full px-3 py-2 rounded-md text-sm font-medium transition-colors"
        style={{
          background: 'transparent',
          color: 'var(--fnb-text-secondary)',
          border: '1px solid var(--fnb-border-subtle)',
        }}
      >
        Cancel
      </button>
    </div>
  );
}
