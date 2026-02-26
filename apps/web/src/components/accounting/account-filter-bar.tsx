'use client';

import { List, FolderTree } from 'lucide-react';
import { SearchInput } from '@/components/ui/search-input';

interface AccountFilterBarProps {
  search: string;
  onSearchChange: (value: string) => void;
  statusFilter: 'active' | 'inactive' | 'all';
  onStatusFilterChange: (value: 'active' | 'inactive' | 'all') => void;
  viewMode: 'flat' | 'tree';
  onToggleViewMode: () => void;
}

export function AccountFilterBar({
  search,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  viewMode,
  onToggleViewMode,
}: AccountFilterBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <SearchInput
        value={search}
        onChange={onSearchChange}
        placeholder="Search accounts..."
        className="w-64"
      />
      <div className="flex items-center gap-1 rounded-lg border border-border p-0.5">
        {(['active', 'inactive', 'all'] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onStatusFilterChange(s)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              statusFilter === s
                ? 'bg-indigo-500/10 text-indigo-500'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={onToggleViewMode}
        className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        {viewMode === 'flat' ? <List className="h-3.5 w-3.5" /> : <FolderTree className="h-3.5 w-3.5" />}
        {viewMode === 'flat' ? 'Flat List' : 'Tree View'}
      </button>
    </div>
  );
}
