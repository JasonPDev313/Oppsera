'use client';

import { useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  ShoppingCart,
  Loader2,
  Monitor,
  X,
  ChevronDown,
  CheckCircle,
} from 'lucide-react';
import { useAppointmentAction } from '@/hooks/use-spa';
import { useTerminalSelection } from '@/hooks/use-terminal-selection';
import { useTerminalSession } from '@/components/terminal-session-provider';

// ═══════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════

function formatMoney(cents: number): string {
  return (cents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  });
}

function SelectField({
  label,
  value,
  onChange,
  options,
  placeholder,
  disabled,
}: {
  label: string;
  value: string | null;
  onChange: (val: string | null) => void;
  options: Array<{ id: string; name: string }>;
  placeholder: string;
  disabled?: boolean;
}) {
  if (options.length === 0 && !disabled) return null;

  return (
    <div>
      <label className="block text-xs font-medium text-muted-foreground mb-1">{label}</label>
      <div className="relative">
        <select
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value || null)}
          disabled={disabled || options.length === 0}
          className="w-full appearance-none rounded-lg border border-input bg-surface px-3 py-2 pr-8 text-sm text-foreground transition-colors hover:border-border focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <option value="">{placeholder}</option>
          {options.map((opt) => (
            <option key={opt.id} value={opt.id}>{opt.name}</option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// CheckoutToPosDialog — shared between appointment detail + calendar
// ═══════════════════════════════════════════════════════════════════

export interface CheckoutToPosResult {
  orderId: string;
  tabNumber: number;
  terminalId: string;
  totalCents: number;
}

export interface CheckoutToPosDialogProps {
  open: boolean;
  onClose: () => void;
  appointmentId: string;
  serviceName: string;
  totalCents: number;
  onSuccess: (result: CheckoutToPosResult) => void;
}

export function CheckoutToPosDialog({
  open,
  onClose,
  appointmentId,
  serviceName,
  totalCents,
  onSuccess,
}: CheckoutToPosDialogProps) {
  const appointmentAction = useAppointmentAction();
  const { session: existingSession } = useTerminalSession();
  const termSel = useTerminalSelection();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Determine selected terminal ID — prefer the existing terminal session for fast path
  const selectedTerminalId = existingSession?.terminalId ?? termSel.selectedTerminalId;

  const canSubmit = !!selectedTerminalId && !isSubmitting;

  const handleSubmit = useCallback(() => {
    if (!selectedTerminalId) return;
    setIsSubmitting(true);
    setError(null);

    appointmentAction.mutate(
      {
        id: appointmentId,
        action: 'checkout-to-pos',
        body: { terminalId: selectedTerminalId },
      },
      {
        onSuccess: (result: unknown) => {
          setIsSubmitting(false);
          const data = (result as { data?: { orderId?: string; tabNumber?: number; totalCents?: number } })?.data;
          onSuccess({
            orderId: data?.orderId ?? '',
            tabNumber: data?.tabNumber ?? 1,
            terminalId: selectedTerminalId,
            totalCents: data?.totalCents ?? totalCents,
          });
        },
        onError: (err) => {
          setIsSubmitting(false);
          setError(err instanceof Error ? err.message : 'Failed to send to POS');
        },
      },
    );
  }, [selectedTerminalId, appointmentId, appointmentAction, onSuccess, totalCents]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
        role="presentation"
      />

      {/* Dialog */}
      <div
        className="relative w-full max-w-md rounded-xl border border-border bg-surface shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-label="Send to POS"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5 text-indigo-500" aria-hidden="true" />
            <h2 className="text-base font-semibold text-foreground">Send to POS</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          {/* Service summary */}
          <div className="rounded-lg border border-border bg-surface p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Service</span>
              <span className="text-sm font-medium text-foreground">{serviceName}</span>
            </div>
            <div className="flex items-center justify-between mt-1">
              <span className="text-sm text-muted-foreground">Total</span>
              <span className="text-sm font-semibold tabular-nums text-foreground">
                {formatMoney(totalCents)}
              </span>
            </div>
          </div>

          {/* Terminal selection */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Monitor className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <span className="text-sm font-medium text-foreground">Select Terminal</span>
            </div>

            {existingSession ? (
              <div className="rounded-lg border border-indigo-500/30 bg-indigo-500/10 p-3">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-indigo-500 shrink-0" aria-hidden="true" />
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {existingSession.terminalName || `Terminal ${existingSession.terminalNumber ?? ''}`}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {existingSession.profitCenterName}
                      {existingSession.locationName ? ` \u2022 ${existingSession.locationName}` : ''}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <>
                {termSel.isLoading ? (
                  <div className="flex items-center gap-2 py-2">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden="true" />
                    <span className="text-sm text-muted-foreground">Loading terminals...</span>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {termSel.sites.length > 1 && (
                      <SelectField
                        label="Site"
                        value={termSel.selectedSiteId}
                        onChange={termSel.setSelectedSiteId}
                        options={termSel.sites}
                        placeholder="Select site..."
                      />
                    )}
                    {termSel.venues.length > 1 && (
                      <SelectField
                        label="Venue"
                        value={termSel.selectedVenueId}
                        onChange={termSel.setSelectedVenueId}
                        options={termSel.venues}
                        placeholder="Select venue..."
                      />
                    )}
                    {termSel.profitCenters.length > 1 && (
                      <SelectField
                        label="Profit Center"
                        value={termSel.selectedProfitCenterId}
                        onChange={termSel.setSelectedProfitCenterId}
                        options={termSel.profitCenters}
                        placeholder="Select profit center..."
                      />
                    )}
                    <SelectField
                      label="Terminal"
                      value={termSel.selectedTerminalId}
                      onChange={termSel.setSelectedTerminalId}
                      options={termSel.terminals}
                      placeholder="Select terminal..."
                      disabled={!termSel.selectedProfitCenterId && termSel.profitCenters.length > 1}
                    />
                    {termSel.noProfitCentersExist && (
                      <p className="text-xs text-amber-500">
                        No terminals configured. Go to Settings &rarr; Profit Centers to set up terminals.
                      </p>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Error message */}
          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2">
              <p className="text-sm text-red-500">{error}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-border px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Sending...
              </>
            ) : (
              <>
                <ShoppingCart className="h-4 w-4" aria-hidden="true" />
                Send to POS
              </>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
