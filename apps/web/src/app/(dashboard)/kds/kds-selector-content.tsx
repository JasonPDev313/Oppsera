'use client';

import { useRouter } from 'next/navigation';
import { useStations } from '@/hooks/use-fnb-kitchen';
import { ArrowLeft } from 'lucide-react';

export default function KdsSelectorContent() {
  const router = useRouter();
  const { stations, isLoading } = useStations({});

  const kdsStations = stations.filter(
    (s) => s.stationType === 'prep' || s.stationType === 'bar',
  );

  return (
    <div className="flex flex-col h-screen" style={{ backgroundColor: 'var(--fnb-bg-primary)' }}>
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 py-3 border-b shrink-0"
        style={{ backgroundColor: 'var(--fnb-bg-surface)', borderColor: 'rgba(148, 163, 184, 0.15)' }}
      >
        <button
          type="button"
          onClick={() => router.push('/pos/fnb')}
          className="flex items-center justify-center rounded-lg h-10 w-10 transition-colors hover:opacity-80"
          style={{ backgroundColor: 'var(--fnb-bg-elevated)', color: 'var(--fnb-text-secondary)' }}
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-lg font-bold" style={{ color: 'var(--fnb-text-primary)' }}>
          Select KDS Station
        </h1>
      </div>

      {/* Station grid */}
      <div className="flex-1 overflow-y-auto p-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-8 w-8 border-2 rounded-full animate-spin"
              style={{ borderColor: 'var(--fnb-text-muted)', borderTopColor: 'var(--fnb-status-seated)' }} />
          </div>
        ) : kdsStations.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-sm" style={{ color: 'var(--fnb-text-muted)' }}>
              No KDS stations configured
            </p>
            <p className="text-xs mt-1" style={{ color: 'var(--fnb-text-muted)' }}>
              Create stations in Settings to use KDS
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 max-w-3xl mx-auto">
            {kdsStations.map((station) => (
              <button
                key={station.id}
                type="button"
                onClick={() => router.push(`/kds/${station.id}`)}
                className="flex flex-col items-center justify-center rounded-xl p-6 transition-colors hover:opacity-80"
                style={{
                  backgroundColor: 'var(--fnb-bg-surface)',
                  border: '1px solid rgba(148, 163, 184, 0.15)',
                  minHeight: '140px',
                }}
              >
                <div
                  className="flex items-center justify-center rounded-full mb-3"
                  style={{
                    width: '48px',
                    height: '48px',
                    backgroundColor: station.stationType === 'bar' ? 'var(--fnb-status-dessert)' : 'var(--fnb-status-seated)',
                    color: '#fff',
                  }}
                >
                  <span className="text-lg font-bold">
                    {station.name.charAt(0).toUpperCase()}
                  </span>
                </div>
                <span className="text-sm font-bold" style={{ color: 'var(--fnb-text-primary)' }}>
                  {station.name}
                </span>
                <span className="text-[10px] uppercase mt-1" style={{ color: 'var(--fnb-text-muted)' }}>
                  {station.stationType}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
