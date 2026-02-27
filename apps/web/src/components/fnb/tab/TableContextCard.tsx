'use client';

import { MapPin, Users, Clock } from 'lucide-react';
import type { FnbTabDetail } from '@/types/fnb';

interface TableContextCardProps {
  tab: FnbTabDetail;
}

function formatSeatedTime(openedAt: string): string {
  const minutes = Math.floor((Date.now() - new Date(openedAt).getTime()) / 60000);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export function TableContextCard({ tab }: TableContextCardProps) {
  if (!tab.tableNumber) return null;

  return (
    <div
      className="flex items-center gap-3 px-3 py-1.5 shrink-0 rounded-lg mx-2 mt-1"
      style={{ backgroundColor: 'var(--fnb-bg-elevated)' }}
    >
      {/* Table badge */}
      <div className="flex items-center gap-1.5">
        <MapPin className="h-3.5 w-3.5" style={{ color: 'var(--fnb-text-muted)' }} />
        <span className="text-sm font-bold" style={{ color: 'var(--fnb-text-primary)' }}>
          Table {tab.tableNumber}
        </span>
      </div>

      <div className="h-3.5 w-px" style={{ backgroundColor: 'var(--fnb-bg-surface)' }} />

      {/* Server */}
      {tab.serverName && (
        <span className="text-xs" style={{ color: 'var(--fnb-text-secondary)' }}>
          {tab.serverName}
        </span>
      )}

      {/* Room */}
      {tab.roomName && (
        <span className="text-[10px] rounded-full px-1.5 py-0.5" style={{ backgroundColor: 'var(--fnb-bg-surface)', color: 'var(--fnb-text-muted)' }}>
          {tab.roomName}
        </span>
      )}

      {/* Party size */}
      {tab.partySize && (
        <div className="flex items-center gap-0.5" style={{ color: 'var(--fnb-text-secondary)' }}>
          <Users className="h-3 w-3" />
          <span className="text-xs font-semibold">{tab.partySize}</span>
        </div>
      )}

      {/* Time seated */}
      <div className="flex items-center gap-0.5 ml-auto" style={{ color: 'var(--fnb-text-muted)' }}>
        <Clock className="h-3 w-3" />
        <span className="text-xs">{formatSeatedTime(tab.openedAt)}</span>
      </div>
    </div>
  );
}
