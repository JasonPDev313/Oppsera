'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, X, CheckCircle } from 'lucide-react';
import { InlinePinPad } from './InlinePinPad';

interface EmergencyCleanupDialogProps {
  open: boolean;
  onClose: () => void;
  /** Matches mgr.runEmergencyCleanup signature from use-manage-tabs */
  onExecute: (input: {
    actions: {
      closePaidTabs?: boolean;
      releaseLocks?: boolean;
      voidStaleTabs?: boolean;
      markAbandoned?: boolean;
      staleThresholdMinutes?: number;
      abandonedThresholdMinutes?: number;
    };
    approverUserId: string;
    clientRequestId: string;
  }) => Promise<{
    paidTabsClosed: number;
    locksReleased: number;
    staleTabsVoided: number;
    staleTabsAbandoned: number;
  }>;
  locationId: string;
  verifyPin: (pin: string, actionType: string) => Promise<{ verified: boolean; userId: string; userName: string }>;
}

interface CleanupResult {
  paidTabsClosed: number;
  locksReleased: number;
  staleTabsVoided: number;
  staleTabsAbandoned: number;
}

type Step = 'options' | 'pin' | 'executing' | 'result';

export function EmergencyCleanupDialog({ open, onClose, onExecute, verifyPin }: EmergencyCleanupDialogProps) {
  const [closePaidTabs, setClosePaidTabs] = useState(true);
  const [releaseLocks, setReleaseLocks] = useState(true);
  const [voidStaleTabs, setVoidStaleTabs] = useState(false);
  const [staleThreshold, setStaleThreshold] = useState(240);
  const [markAbandoned, setMarkAbandoned] = useState(false);
  const [abandonedThreshold, setAbandonedThreshold] = useState(480);

  const [step, setStep] = useState<Step>('options');
  const [pinError, setPinError] = useState<string | null>(null);
  const [approver, setApprover] = useState<{ userId: string; userName: string } | null>(null);
  // Step machine drives the UI via step === 'executing' / 'result'
  const [result, setResult] = useState<CleanupResult | null>(null);

  if (!open) return null;

  const anySelected = closePaidTabs || releaseLocks || voidStaleTabs || markAbandoned;

  function handleContinue() {
    // Always require PIN for emergency cleanup
    setStep('pin');
  }

  async function handlePinVerify(pin: string): Promise<boolean> {
    setPinError(null);
    try {
      const res = await verifyPin(pin, 'emergency_cleanup');
      if (res.verified) {
        setApprover({ userId: res.userId, userName: res.userName });
        // PIN verified — execute immediately
        await executeCleanup(res.userId);
        return true;
      }
      setPinError('Invalid PIN');
      return false;
    } catch {
      setPinError('Verification failed');
      return false;
    }
  }

  async function executeCleanup(approverUserId: string) {
    setStep('executing');
    try {
      const res = await onExecute({
        actions: {
          closePaidTabs,
          releaseLocks,
          voidStaleTabs,
          markAbandoned,
          staleThresholdMinutes: voidStaleTabs ? staleThreshold : undefined,
          abandonedThresholdMinutes: markAbandoned ? abandonedThreshold : undefined,
        },
        approverUserId,
        clientRequestId: crypto.randomUUID(),
      });
      setResult(res);
      setStep('result');
    } catch {
      setResult({ paidTabsClosed: 0, locksReleased: 0, staleTabsVoided: 0, staleTabsAbandoned: 0 });
      setStep('result');
    }
  }

  function handleDone() {
    // Reset state for next open
    setStep('options');
    setResult(null);
    setApprover(null);
    setPinError(null);
    setClosePaidTabs(true);
    setReleaseLocks(true);
    setVoidStaleTabs(false);
    setMarkAbandoned(false);
    setStaleThreshold(240);
    setAbandonedThreshold(480);
    onClose();
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
      <div className="absolute inset-0 bg-black/60" onClick={step === 'options' ? handleDone : undefined} />
      <div
        className={`relative w-full rounded-xl shadow-2xl p-6 ${step === 'pin' ? 'max-w-lg' : 'max-w-md'}`}
        style={{ background: 'var(--fnb-bg-surface)' }}
      >
        <button type="button" aria-label="Close dialog" onClick={handleDone} className="absolute top-4 right-4 p-1" style={{ color: 'var(--fnb-text-muted)' }}>
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

        {/* Step: Options */}
        {step === 'options' && (
          <div className="flex flex-col gap-4">
            {/* Option: Close Paid Tabs */}
            {/* eslint-disable-next-line jsx-a11y/label-has-associated-control */}
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
            {/* eslint-disable-next-line jsx-a11y/label-has-associated-control */}
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
            {/* eslint-disable-next-line jsx-a11y/label-has-associated-control */}
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
                <label htmlFor="cleanup-stale-threshold" className="text-xs font-medium" style={{ color: 'var(--fnb-text-secondary)' }}>
                  Stale threshold: {staleThreshold} min ({Math.floor(staleThreshold / 60)}h {staleThreshold % 60}m)
                </label>
                <input
                  id="cleanup-stale-threshold"
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

            {/* NEW: Option: Mark Abandoned Tabs */}
            {/* eslint-disable-next-line jsx-a11y/label-has-associated-control */}
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={markAbandoned}
                onChange={(e) => setMarkAbandoned(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded accent-indigo-500"
              />
              <div>
                <div className="text-sm font-medium" style={{ color: 'var(--fnb-text-primary)' }}>Mark Abandoned Tabs</div>
                <div className="text-xs" style={{ color: 'var(--fnb-text-muted)' }}>Mark inactive tabs as abandoned after threshold</div>
              </div>
            </label>

            {markAbandoned && (
              <div className="ml-7">
                <label htmlFor="cleanup-abandoned-threshold" className="text-xs font-medium" style={{ color: 'var(--fnb-text-secondary)' }}>
                  Abandoned threshold: {abandonedThreshold} min ({Math.floor(abandonedThreshold / 60)}h {abandonedThreshold % 60}m)
                </label>
                <input
                  id="cleanup-abandoned-threshold"
                  type="range"
                  min={120}
                  max={1440}
                  step={30}
                  value={abandonedThreshold}
                  onChange={(e) => setAbandonedThreshold(Number(e.target.value))}
                  className="w-full mt-1 accent-indigo-500"
                />
              </div>
            )}

            <div className="flex gap-2 mt-2">
              <button
                type="button"
                onClick={handleDone}
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
                type="button"
                onClick={handleContinue}
                disabled={!anySelected}
                className="flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors"
                style={{
                  background: anySelected ? 'var(--fnb-status-dirty)' : 'var(--fnb-bg-elevated)',
                  color: anySelected ? '#fff' : 'var(--fnb-text-muted)',
                }}
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {/* Step: PIN verification (inline — no portal) */}
        {step === 'pin' && (
          <InlinePinPad
            onVerify={handlePinVerify}
            onBack={() => setStep('options')}
            error={pinError}
            title="Manager Override — Emergency Cleanup"
          />
        )}

        {/* Step: Executing */}
        {step === 'executing' && (
          <div className="flex flex-col gap-4 items-center py-6">
            <h3 className="text-sm font-semibold" style={{ color: 'var(--fnb-text-primary)' }}>Running Cleanup...</h3>
            <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: 'var(--fnb-bg-primary)' }}>
              <div
                className="h-full rounded-full animate-pulse"
                style={{ background: 'var(--fnb-status-dirty)', width: '60%' }}
              />
            </div>
            {approver && (
              <p className="text-xs" style={{ color: 'var(--fnb-text-muted)' }}>
                Approved by {approver.userName}
              </p>
            )}
          </div>
        )}

        {/* Step: Result */}
        {step === 'result' && result && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <CheckCircle size={18} style={{ color: 'var(--fnb-status-available)' }} />
              <h3 className="text-sm font-semibold" style={{ color: 'var(--fnb-status-available)' }}>Cleanup Complete</h3>
            </div>
            <ul className="text-sm space-y-1" style={{ color: 'var(--fnb-text-secondary)' }}>
              <li>{result.paidTabsClosed} paid tab{result.paidTabsClosed !== 1 ? 's' : ''} closed</li>
              <li>{result.locksReleased} lock{result.locksReleased !== 1 ? 's' : ''} released</li>
              <li>{result.staleTabsVoided} stale tab{result.staleTabsVoided !== 1 ? 's' : ''} voided</li>
              <li>{result.staleTabsAbandoned} tab{result.staleTabsAbandoned !== 1 ? 's' : ''} marked abandoned</li>
            </ul>
            <button
              type="button"
              onClick={handleDone}
              className="w-full mt-2 px-4 py-2.5 rounded-lg text-sm font-medium"
              style={{ background: 'var(--fnb-accent-primary)', color: '#fff' }}
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
