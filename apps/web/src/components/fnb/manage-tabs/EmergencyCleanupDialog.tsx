'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, X } from 'lucide-react';

interface EmergencyCleanupDialogProps {
  open: boolean;
  onClose: () => void;
  onExecute: (input: {
    actions: {
      closePaidTabs?: boolean;
      releaseLocks?: boolean;
      voidStaleTabs?: boolean;
      staleThresholdMinutes?: number;
    };
    approverUserId: string;
    clientRequestId: string;
  }) => Promise<{ closedPaidTabs: string[]; releasedLocks: number; voidedStaleTabs: string[] }>;
  approverUserId: string;
}

export function EmergencyCleanupDialog({ open, onClose, onExecute, approverUserId }: EmergencyCleanupDialogProps) {
  const [closePaidTabs, setClosePaidTabs] = useState(true);
  const [releaseLocks, setReleaseLocks] = useState(true);
  const [voidStaleTabs, setVoidStaleTabs] = useState(false);
  const [staleThreshold, setStaleThreshold] = useState(240);
  const [executing, setExecuting] = useState(false);
  const [result, setResult] = useState<{ closedPaidTabs: string[]; releasedLocks: number; voidedStaleTabs: string[] } | null>(null);

  if (!open) return null;

  const anySelected = closePaidTabs || releaseLocks || voidStaleTabs;

  async function handleExecute() {
    setExecuting(true);
    try {
      const res = await onExecute({
        actions: {
          closePaidTabs,
          releaseLocks,
          voidStaleTabs,
          staleThresholdMinutes: voidStaleTabs ? staleThreshold : undefined,
        },
        approverUserId,
        clientRequestId: `emergency-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      });
      setResult(res);
    } catch {
      // handled by caller
    } finally {
      setExecuting(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div
        className="relative w-full max-w-md rounded-xl shadow-2xl p-6"
        style={{ background: 'var(--fnb-bg-surface)' }}
      >
        <button onClick={onClose} className="absolute top-4 right-4 p-1" style={{ color: 'var(--fnb-text-muted)' }}>
          <X size={18} />
        </button>

        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: 'rgba(239, 68, 68, 0.15)' }}>
            <AlertTriangle size={20} style={{ color: 'var(--fnb-status-dirty)' }} />
          </div>
          <div>
            <h2 className="text-lg font-bold" style={{ color: 'var(--fnb-text-primary)' }}>Emergency Cleanup</h2>
            <p className="text-xs" style={{ color: 'var(--fnb-text-muted)' }}>Resolve stuck tabs and locks</p>
          </div>
        </div>

        {result ? (
          <div className="flex flex-col gap-3">
            <h3 className="text-sm font-semibold" style={{ color: 'var(--fnb-status-available)' }}>Cleanup Complete</h3>
            <ul className="text-sm space-y-1" style={{ color: 'var(--fnb-text-secondary)' }}>
              <li>{result.closedPaidTabs.length} paid tab{result.closedPaidTabs.length !== 1 ? 's' : ''} closed</li>
              <li>{result.releasedLocks} lock{result.releasedLocks !== 1 ? 's' : ''} released</li>
              <li>{result.voidedStaleTabs.length} stale tab{result.voidedStaleTabs.length !== 1 ? 's' : ''} voided</li>
            </ul>
            <button
              onClick={onClose}
              className="w-full mt-2 px-4 py-2.5 rounded-lg text-sm font-medium"
              style={{ background: 'var(--fnb-accent-primary)', color: '#fff' }}
            >
              Done
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {/* Option: Close Paid Tabs */}
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={closePaidTabs}
                onChange={(e) => setClosePaidTabs(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded accent-indigo-500"
              />
              <div>
                <div className="text-sm font-medium" style={{ color: 'var(--fnb-text-primary)' }}>Close Fully Paid Tabs</div>
                <div className="text-xs" style={{ color: 'var(--fnb-text-muted)' }}>Close tabs where tenders cover the full order total</div>
              </div>
            </label>

            {/* Option: Release Locks */}
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={releaseLocks}
                onChange={(e) => setReleaseLocks(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded accent-indigo-500"
              />
              <div>
                <div className="text-sm font-medium" style={{ color: 'var(--fnb-text-primary)' }}>Release All Locks</div>
                <div className="text-xs" style={{ color: 'var(--fnb-text-muted)' }}>Clear all soft locks for this location</div>
              </div>
            </label>

            {/* Option: Void Stale Tabs */}
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={voidStaleTabs}
                onChange={(e) => setVoidStaleTabs(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded accent-indigo-500"
              />
              <div>
                <div className="text-sm font-medium" style={{ color: 'var(--fnb-text-primary)' }}>Void Stale Tabs</div>
                <div className="text-xs" style={{ color: 'var(--fnb-text-muted)' }}>Void tabs open longer than threshold</div>
              </div>
            </label>

            {voidStaleTabs && (
              <div className="ml-7">
                <label className="text-xs font-medium" style={{ color: 'var(--fnb-text-secondary)' }}>
                  Stale threshold: {staleThreshold} minutes ({Math.floor(staleThreshold / 60)}h {staleThreshold % 60}m)
                </label>
                <input
                  type="range"
                  min={30}
                  max={720}
                  step={30}
                  value={staleThreshold}
                  onChange={(e) => setStaleThreshold(Number(e.target.value))}
                  className="w-full mt-1 accent-indigo-500"
                />
              </div>
            )}

            <div className="flex gap-2 mt-2">
              <button
                onClick={onClose}
                className="flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors"
                style={{
                  background: 'transparent',
                  color: 'var(--fnb-text-secondary)',
                  border: '1px solid var(--fnb-border-subtle)',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleExecute}
                disabled={!anySelected || executing}
                className="flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors"
                style={{
                  background: anySelected ? 'var(--fnb-status-dirty)' : 'var(--fnb-bg-elevated)',
                  color: anySelected ? '#fff' : 'var(--fnb-text-muted)',
                  opacity: executing ? 0.6 : 1,
                }}
              >
                {executing ? 'Running...' : 'Execute Cleanup'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
