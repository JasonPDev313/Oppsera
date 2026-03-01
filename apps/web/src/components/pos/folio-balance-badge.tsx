'use client';

import { useState, useEffect } from 'react';
import { DoorOpen } from 'lucide-react';
import type { PosFolioSummary } from '@/hooks/use-pms-pos';

interface FolioBalanceBadgeProps {
  folioId: string;
  guestName?: string | null;
  getFolio: (folioId: string) => Promise<PosFolioSummary | null>;
}

export function FolioBalanceBadge({ folioId, guestName, getFolio }: FolioBalanceBadgeProps) {
  const [folio, setFolio] = useState<PosFolioSummary | null>(null);

  useEffect(() => {
    let cancelled = false;
    getFolio(folioId).then((f) => {
      if (!cancelled) setFolio(f);
    });
    return () => { cancelled = true; };
  }, [folioId, getFolio]);

  if (!folio) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-indigo-500/10 px-1.5 py-0.5 text-[10px] font-medium text-indigo-500">
        <DoorOpen className="h-3 w-3" aria-hidden="true" />
        {guestName ?? 'Room'}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-indigo-500/10 px-1.5 py-0.5 text-[10px] font-medium text-indigo-500"
          title={`Folio: ${folio.guestName} — Room ${folio.roomNumber} — Balance: $${(folio.balanceCents / 100).toFixed(2)}`}>
      <DoorOpen className="h-3 w-3" aria-hidden="true" />
      Rm {folio.roomNumber}: ${(folio.balanceCents / 100).toFixed(2)}
    </span>
  );
}
