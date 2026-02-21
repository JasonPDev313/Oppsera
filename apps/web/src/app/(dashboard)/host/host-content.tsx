'use client';

import { useState, useEffect } from 'react';
import { useAuthContext } from '@/components/auth-provider';
import { useFnbFloor } from '@/hooks/use-fnb-floor';
import { useFnbSections } from '@/hooks/use-fnb-sections';
import { useSectionActions } from '@/hooks/use-fnb-manager';
import { RotationQueue } from '@/components/fnb/host/RotationQueue';
import { CoverBalance } from '@/components/fnb/host/CoverBalance';
import { Users, LayoutGrid, ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function HostContent() {
  const { locations } = useAuthContext();
  const router = useRouter();
  const locationId = locations[0]?.id ?? '';
  const { tables } = useFnbFloor({ roomId: null });
  const { sections } = useFnbSections();
  const { advanceRotation, isActing } = useSectionActions();

  const today = new Date().toISOString().slice(0, 10);

  // Compute stats
  const totalCovers = tables.reduce((sum, t) => sum + (t.partySize ?? 0), 0);
  const seatedTables = tables.filter((t) => t.status !== 'available' && t.status !== 'dirty');
  const availableTables = tables.filter((t) => t.status === 'available');

  // Build server rotation from sections
  const rotationServers = sections
    .filter((s) => s.isActive)
    .map((s) => {
      const sectionTables = tables.filter((t) => t.sectionId === s.id);
      const covers = sectionTables.reduce((sum, t) => sum + (t.partySize ?? 0), 0);
      return {
        id: s.id,
        name: s.name,
        coverCount: covers,
        isNext: false, // Would come from rotation query
      };
    });
  if (rotationServers.length > 0) rotationServers[0]!.isNext = true;

  // Cover balance
  const coverBalanceData = rotationServers.map((s) => ({
    name: s.name,
    covers: s.coverCount,
    maxCovers: 30, // Configurable per location
  }));

  const handleAdvanceRotation = () => {
    advanceRotation(locationId, today);
  };

  return (
    <div className="h-[calc(100vh-64px)] flex flex-col" style={{ backgroundColor: 'var(--fnb-bg-primary)' }}>
      {/* Header */}
      <div
        className="flex items-center justify-between px-6 py-4 border-b shrink-0"
        style={{ backgroundColor: 'var(--fnb-bg-surface)', borderColor: 'rgba(148, 163, 184, 0.15)' }}
      >
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.push('/pos/fnb')}
            className="flex items-center justify-center rounded-lg h-8 w-8 transition-colors hover:opacity-80"
            style={{ backgroundColor: 'var(--fnb-bg-elevated)', color: 'var(--fnb-text-secondary)' }}
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5" style={{ color: 'var(--fnb-status-seated)' }} />
            <h1 className="text-lg font-bold" style={{ color: 'var(--fnb-text-primary)' }}>
              Host Stand
            </h1>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-center">
            <div className="text-lg font-bold font-mono" style={{ color: 'var(--fnb-text-primary)', fontFamily: 'var(--fnb-font-mono)' }}>
              {totalCovers}
            </div>
            <div className="text-[10px] uppercase" style={{ color: 'var(--fnb-text-muted)' }}>Covers</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold font-mono" style={{ color: 'var(--fnb-status-seated)', fontFamily: 'var(--fnb-font-mono)' }}>
              {seatedTables.length}
            </div>
            <div className="text-[10px] uppercase" style={{ color: 'var(--fnb-text-muted)' }}>Seated</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold font-mono" style={{ color: 'var(--fnb-status-available)', fontFamily: 'var(--fnb-font-mono)' }}>
              {availableTables.length}
            </div>
            <div className="text-[10px] uppercase" style={{ color: 'var(--fnb-text-muted)' }}>Available</div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        <RotationQueue
          servers={rotationServers}
          onAdvance={handleAdvanceRotation}
          disabled={isActing}
        />
        <CoverBalance servers={coverBalanceData} />

        {/* Table summary */}
        <div className="rounded-xl border p-4" style={{ borderColor: 'rgba(148, 163, 184, 0.15)', backgroundColor: 'var(--fnb-bg-surface)' }}>
          <div className="flex items-center gap-2 mb-3">
            <LayoutGrid className="h-4 w-4" style={{ color: 'var(--fnb-text-muted)' }} />
            <h3 className="text-sm font-bold" style={{ color: 'var(--fnb-text-primary)' }}>Table Status</h3>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {tables.map((table) => (
              <div
                key={table.tableId}
                className="rounded-lg p-2 text-center border"
                style={{
                  borderColor: `var(--fnb-status-${table.status ?? 'available'})`,
                  backgroundColor: `color-mix(in srgb, var(--fnb-status-${table.status ?? 'available'}) 10%, transparent)`,
                }}
              >
                <div className="text-xs font-bold" style={{ color: 'var(--fnb-text-primary)' }}>
                  {table.displayLabel}
                </div>
                <div className="text-[10px]" style={{ color: 'var(--fnb-text-muted)' }}>
                  {table.partySize ? `${table.partySize} guests` : table.status}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
