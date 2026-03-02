'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, CheckCircle, XCircle, X, ChevronRight } from 'lucide-react';
import { ManagerPinModal } from '../manager/ManagerPinModal';

type ActionType = 'void' | 'transfer' | 'close';
type ReasonCode = 'server_leaving' | 'end_of_shift' | 'stale_tab' | 'error_correction' | 'other';

interface BulkActionConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  actionType: ActionType;
  selectedCount: number;
  totalBalance: number;
  requirePin: boolean;
  onVerifyPin: (pin: string) => Promise<boolean>;
  onExecute: (reasonCode: ReasonCode, reasonText?: string) => Promise<{
    succeeded: string[];
    failed: Array<{ tabId: string; error: string }>;
  }>;
}

const ACTION_LABELS: Record<ActionType, string> = {
  void: 'Void',
  transfer: 'Transfer',
  close: 'Close',
};

const ACTION_COLORS: Record<ActionType, string> = {
  void: 'var(--fnb-status-dirty)',
  transfer: 'var(--fnb-accent-primary)',
  close: '#f59e0b',
};

const REASON_OPTIONS: { code: ReasonCode; label: string }[] = [
  { code: 'server_leaving', label: 'Server Leaving' },
  { code: 'end_of_shift', label: 'End of Shift' },
  { code: 'stale_tab', label: 'Stale Tab' },
  { code: 'error_correction', label: 'Error Correction' },
  { code: 'other', label: 'Other' },
];

function formatMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function getRiskLevel(count: number, balance: number): { label: string; color: string } {
  if (count > 10 || balance > 100000) return { label: 'High', color: 'var(--fnb-status-dirty)' };
  if (count > 3 || balance > 25000) return { label: 'Medium', color: '#f59e0b' };
  return { label: 'Low', color: 'var(--fnb-status-available)' };
}

type Step = 'summary' | 'pin' | 'reason' | 'execute';

export function BulkActionConfirmDialog({
  open,
  onClose,
  actionType,
  selectedCount,
  totalBalance,
  requirePin,
  onVerifyPin,
  onExecute,
}: BulkActionConfirmDialogProps) {
  const [step, setStep] = useState<Step>('summary');
  const [pinError, setPinError] = useState<string | null>(null);
  const [reasonCode, setReasonCode] = useState<ReasonCode>('end_of_shift');
  const [reasonText, setReasonText] = useState('');
  const [executing, setExecuting] = useState(false);
  const [result, setResult] = useState<{ succeeded: string[]; failed: Array<{ tabId: string; error: string }> } | null>(null);

  if (!open) return null;

  const risk = getRiskLevel(selectedCount, totalBalance);
  const actionLabel = ACTION_LABELS[actionType];
  const actionColor = ACTION_COLORS[actionType];

  function handleNext() {
    if (step === 'summary') {
      setStep(requirePin ? 'pin' : 'reason');
    } else if (step === 'reason') {
      handleExecute();
    }
  }

  async function handlePinVerify(pin: string): Promise<boolean> {
    setPinError(null);
    const ok = await onVerifyPin(pin);
    if (ok) {
      setStep('reason');
      return true;
    }
    setPinError('Invalid PIN');
    return false;
  }

  async function handleExecute() {
    setStep('execute');
    setExecuting(true);
    try {
      const res = await onExecute(reasonCode, reasonText || undefined);
      setResult(res);
    } catch {
      setResult({ succeeded: [], failed: [{ tabId: '', error: 'Unexpected error' }] });
    } finally {
      setExecuting(false);
    }
  }

  function handleDone() {
    setStep('summary');
    setReasonCode('end_of_shift');
    setReasonText('');
    setResult(null);
    setPinError(null);
    onClose();
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={step !== 'execute' ? handleDone : undefined} />
      <div
        className="relative w-full max-w-md rounded-xl shadow-2xl p-6"
        style={{ background: 'var(--fnb-bg-surface)' }}
      >
        <button
          onClick={handleDone}
          className="absolute top-4 right-4 p-1"
          style={{ color: 'var(--fnb-text-muted)' }}
        >
          <X size={18} />
        </button>

        {/* Step: Summary */}
        {step === 'summary' && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center"
                style={{ background: `color-mix(in srgb, ${actionColor} 15%, transparent)` }}
              >
                <AlertTriangle size={20} style={{ color: actionColor }} />
              </div>
              <div>
                <h2 className="text-lg font-bold" style={{ color: 'var(--fnb-text-primary)' }}>
                  {actionLabel} {selectedCount} Tab{selectedCount !== 1 ? 's' : ''}
                </h2>
                <p className="text-xs" style={{ color: 'var(--fnb-text-muted)' }}>Review before proceeding</p>
              </div>
            </div>

            <div className="rounded-lg p-4 flex flex-col gap-2" style={{ background: 'var(--fnb-bg-primary)' }}>
              <div className="flex justify-between text-sm">
                <span style={{ color: 'var(--fnb-text-secondary)' }}>Tabs selected</span>
                <span className="font-semibold" style={{ color: 'var(--fnb-text-primary)' }}>{selectedCount}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span style={{ color: 'var(--fnb-text-secondary)' }}>Total balance</span>
                <span className="font-semibold tabular-nums" style={{ color: 'var(--fnb-text-primary)' }}>
                  {formatMoney(totalBalance)}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span style={{ color: 'var(--fnb-text-secondary)' }}>Risk level</span>
                <span
                  className="text-xs px-2 py-0.5 rounded-full font-medium"
                  style={{ color: risk.color, background: `color-mix(in srgb, ${risk.color} 15%, transparent)` }}
                >
                  {risk.label}
                </span>
              </div>
            </div>

            <button
              onClick={handleNext}
              className="w-full px-4 py-2.5 rounded-lg text-sm font-medium flex items-center justify-center gap-2"
              style={{ background: actionColor, color: '#fff' }}
            >
              Continue <ChevronRight size={16} />
            </button>
          </div>
        )}

        {/* Step: PIN */}
        {step === 'pin' && (
          <ManagerPinModal
            open={true}
            onClose={handleDone}
            onVerify={handlePinVerify}
            error={pinError}
            title={`Manager Override — ${actionLabel}`}
          />
        )}

        {/* Step: Reason */}
        {step === 'reason' && (
          <div className="flex flex-col gap-4">
            <h2 className="text-lg font-bold" style={{ color: 'var(--fnb-text-primary)' }}>Select Reason</h2>

            <div className="flex flex-col gap-2">
              {REASON_OPTIONS.map((opt) => (
                <label key={opt.code} className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="radio"
                    name="reason"
                    checked={reasonCode === opt.code}
                    onChange={() => setReasonCode(opt.code)}
                    className="w-4 h-4 accent-indigo-500"
                  />
                  <span className="text-sm" style={{ color: 'var(--fnb-text-primary)' }}>{opt.label}</span>
                </label>
              ))}
            </div>

            {reasonCode === 'other' && (
              <textarea
                placeholder="Describe the reason..."
                value={reasonText}
                onChange={(e) => setReasonText(e.target.value)}
                rows={2}
                className="w-full px-3 py-2 rounded-md text-sm outline-none resize-none"
                style={{
                  background: 'var(--fnb-bg-primary)',
                  color: 'var(--fnb-text-primary)',
                  border: '1px solid var(--fnb-border-subtle)',
                }}
              />
            )}

            <div className="flex gap-2">
              <button
                onClick={() => setStep(requirePin ? 'pin' : 'summary')}
                className="flex-1 px-4 py-2.5 rounded-lg text-sm font-medium"
                style={{ background: 'transparent', color: 'var(--fnb-text-secondary)', border: '1px solid var(--fnb-border-subtle)' }}
              >
                Back
              </button>
              <button
                onClick={handleNext}
                disabled={reasonCode === 'other' && !reasonText.trim()}
                className="flex-1 px-4 py-2.5 rounded-lg text-sm font-medium"
                style={{
                  background: actionColor,
                  color: '#fff',
                  opacity: reasonCode === 'other' && !reasonText.trim() ? 0.5 : 1,
                }}
              >
                Execute {actionLabel}
              </button>
            </div>
          </div>
        )}

        {/* Step: Execute */}
        {step === 'execute' && (
          <div className="flex flex-col gap-4">
            {executing ? (
              <>
                <h2 className="text-lg font-bold" style={{ color: 'var(--fnb-text-primary)' }}>
                  {actionLabel}ing Tabs...
                </h2>
                <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: 'var(--fnb-bg-primary)' }}>
                  <div
                    className="h-full rounded-full animate-pulse"
                    style={{ background: actionColor, width: '60%' }}
                  />
                </div>
                <p className="text-sm text-center" style={{ color: 'var(--fnb-text-muted)' }}>
                  Processing {selectedCount} tab{selectedCount !== 1 ? 's' : ''}...
                </p>
              </>
            ) : result ? (
              <>
                <div className="flex items-center gap-3">
                  {result.failed.length === 0 ? (
                    <CheckCircle size={24} style={{ color: 'var(--fnb-status-available)' }} />
                  ) : (
                    <AlertTriangle size={24} style={{ color: '#f59e0b' }} />
                  )}
                  <h2 className="text-lg font-bold" style={{ color: 'var(--fnb-text-primary)' }}>
                    {result.failed.length === 0 ? 'Complete' : 'Partial Success'}
                  </h2>
                </div>

                <div className="flex flex-col gap-2 text-sm" style={{ color: 'var(--fnb-text-secondary)' }}>
                  {result.succeeded.length > 0 && (
                    <div className="flex items-center gap-2">
                      <CheckCircle size={14} style={{ color: 'var(--fnb-status-available)' }} />
                      <span>{result.succeeded.length} tab{result.succeeded.length !== 1 ? 's' : ''} {actionLabel.toLowerCase()}ed</span>
                    </div>
                  )}
                  {result.failed.length > 0 && (
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <XCircle size={14} style={{ color: 'var(--fnb-status-dirty)' }} />
                        <span>{result.failed.length} failed</span>
                      </div>
                      <ul className="ml-6 text-xs space-y-0.5" style={{ color: 'var(--fnb-text-muted)' }}>
                        {result.failed.slice(0, 5).map((f, i) => (
                          <li key={i}>{f.error}</li>
                        ))}
                        {result.failed.length > 5 && <li>...and {result.failed.length - 5} more</li>}
                      </ul>
                    </div>
                  )}
                </div>

                <button
                  onClick={handleDone}
                  className="w-full px-4 py-2.5 rounded-lg text-sm font-medium"
                  style={{ background: 'var(--fnb-accent-primary)', color: '#fff' }}
                >
                  Done
                </button>
              </>
            ) : null}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
