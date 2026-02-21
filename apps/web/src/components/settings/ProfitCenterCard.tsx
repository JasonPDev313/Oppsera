'use client';

import { useRouter } from 'next/navigation';
import { Monitor, MapPin } from 'lucide-react';
import type { ProfitCenter } from '@oppsera/core/profit-centers';

interface Props {
  profitCenter: ProfitCenter;
  onEdit: () => void;
}

export function ProfitCenterCard({ profitCenter: pc, onEdit }: Props) {
  const router = useRouter();

  return (
    <div className="rounded-lg border border-gray-200 bg-surface p-4">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg font-semibold text-gray-900">{pc.name}</span>
        </div>
        <span
          className={`h-2.5 w-2.5 rounded-full ${pc.isActive ? 'bg-green-500' : 'bg-gray-300'}`}
        />
      </div>

      {pc.code && (
        <p className="mt-1 text-xs text-gray-400">Code: {pc.code}</p>
      )}

      <div className="mt-3 flex items-center gap-1 text-sm text-gray-600">
        <Monitor className="h-4 w-4" />
        <span>{pc.terminalCount} Terminal{pc.terminalCount !== 1 ? 's' : ''}</span>
      </div>

      {pc.locationName && (
        <div className="mt-1 flex items-center gap-1 text-sm text-gray-500">
          <MapPin className="h-3.5 w-3.5" />
          <span>{pc.locationName}</span>
        </div>
      )}

      <div className="mt-4 flex items-center gap-2">
        <button
          onClick={onEdit}
          className="rounded-md px-3 py-1 text-sm font-medium text-indigo-600 hover:bg-indigo-50"
        >
          Edit
        </button>
        <button
          onClick={() => router.push(`/settings/profit-centers/${pc.id}`)}
          className="rounded-md px-3 py-1 text-sm font-medium text-gray-600 hover:bg-gray-100"
        >
          Terminals &rarr;
        </button>
      </div>
    </div>
  );
}
