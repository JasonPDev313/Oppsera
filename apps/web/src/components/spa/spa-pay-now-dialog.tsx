'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  DollarSign,
  CreditCard,
  Banknote,
  FileText,
  Wallet,
  Loader2,
  Monitor,
  X,
  ChevronDown,
  CheckCircle,
} from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { useAppointmentAction } from '@/hooks/use-spa';
import { useTerminalSelection } from '@/hooks/use-terminal-selection';
import { useTerminalSession } from '@/components/terminal-session-provider';
import { useToast } from '@/components/ui/toast';
import { TenderDialog } from '@/components/pos/TenderDialog';
import type { Order, POSConfig, RecordTenderResult } from '@/types/pos';

// ═══════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════

type PaymentType = 'cash' | 'card' | 'check' | 'voucher';

type DialogStep = 'select' | 'creating' | 'tender';

interface SpaPayNowDialogProps {
  open: boolean;
  onClose: () => void;
  appointmentId: string;
  appointmentStatus: string;
  /** Service description to display */
  serviceName: string;
  /** If appointment already has an order, skip creation */
  existingOrderId: string | null;
  onPaymentComplete: () => void;
}

// ═══════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════

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

const PAYMENT_TYPES: Array<{ type: PaymentType; label: string; icon: typeof DollarSign }> = [
  { type: 'cash', label: 'Cash', icon: Banknote },
  { type: 'card', label: 'Card', icon: CreditCard },
  { type: 'check', label: 'Check', icon: FileText },
  { type: 'voucher', label: 'Voucher', icon: Wallet },
];

// ═══════════════════════════════════════════════════════════════════
// SpaPayNowDialog
// ═══════════════════════════════════════════════════════════════════

export function SpaPayNowDialog({
  open,
  onClose,
  appointmentId,
  appointmentStatus: _appointmentStatus,
  serviceName,
  existingOrderId,
  onPaymentComplete,
}: SpaPayNowDialogProps) {
  const { toast } = useToast();
  const appointmentAction = useAppointmentAction();
  const { session: existingSession } = useTerminalSession();
  const termSel = useTerminalSelection();

  const [step, setStep] = useState<DialogStep>('select');
  const [selectedPaymentType, setSelectedPaymentType] = useState<PaymentType>('cash');
  const [error, setError] = useState<string | null>(null);

  // Order fetched after checkout-to-pos
  const [order, setOrder] = useState<Order | null>(null);
  const [posConfig, setPosConfig] = useState<POSConfig | null>(null);

  // Track abort on unmount
  const abortRef = useRef<AbortController | null>(null);

  // Determine selected terminal ID
  const selectedTerminalId = existingSession?.terminalId ?? termSel.selectedTerminalId;

  // Resolve locationId: session has it directly; otherwise walk terminal → profitCenter → locationId
  const selectedLocationId = (() => {
    if (existingSession?.locationId) return existingSession.locationId;
    if (!termSel.selectedTerminalId) return '';
    const term = termSel.terminals.find((t) => t.id === termSel.selectedTerminalId);
    if (!term) return '';
    const pc = termSel.profitCenters.find((p) => p.id === term.profitCenterId);
    return pc?.locationId ?? '';
  })();

  const canProceed = !!selectedTerminalId;

  // Reset state when dialog opens/closes
  useEffect(() => {
    if (!open) {
      // Clean up on close
      abortRef.current?.abort();
      // Small delay to let animations finish before resetting
      const timer = setTimeout(() => {
        setStep('select');
        setSelectedPaymentType('cash');
        setError(null);
        setOrder(null);
        setPosConfig(null);
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [open]);

  // ── Step 2: Create order via checkout-to-pos, then fetch full Order ──

  const handleProceed = useCallback(async () => {
    if (!selectedTerminalId) return;
    setError(null);
    setStep('creating');

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      let orderId = existingOrderId;

      // If no existing order, create one via checkout-to-pos
      if (!orderId) {
        const checkoutResult = await new Promise<string>((resolve, reject) => {
          appointmentAction.mutate(
            {
              id: appointmentId,
              action: 'checkout-to-pos',
              body: { terminalId: selectedTerminalId },
            },
            {
              onSuccess: (result: unknown) => {
                const data = (result as { data?: { orderId?: string } })?.data;
                resolve(data?.orderId ?? '');
              },
              onError: (err) => {
                reject(err instanceof Error ? err : new Error('Failed to create order'));
              },
            },
          );
        });

        if (controller.signal.aborted) return;

        if (!checkoutResult) {
          setError('No order ID returned from checkout');
          setStep('select');
          return;
        }

        orderId = checkoutResult;
      }

      // Fetch the full Order object (TenderDialog requires it)
      const orderRes = await apiFetch<{ data: Order }>(`/api/v1/orders/${orderId}`, {
        headers: { 'X-Location-Id': selectedLocationId },
      });

      if (controller.signal.aborted) return;

      const fetchedOrder = orderRes.data;

      // Build minimal POSConfig
      const config: POSConfig = {
        posMode: 'retail',
        terminalId: selectedTerminalId,
        locationId: selectedLocationId,
        tipEnabled: false,
        receiptMode: 'ask',
        barcodeEnabled: false,
        kitchenSendEnabled: false,
      };

      setOrder(fetchedOrder);
      setPosConfig(config);
      setStep('tender');
    } catch (err) {
      if (controller.signal.aborted) return;
      setError(err instanceof Error ? err.message : 'Failed to create order');
      setStep('select');
    }
  }, [selectedTerminalId, selectedLocationId, existingOrderId, appointmentId, appointmentAction]);

  // ── Payment complete handler ──

  const handlePaymentComplete = useCallback((_result: RecordTenderResult) => {
    toast.success(`${serviceName} has been paid.`);
    onPaymentComplete();
    onClose();
  }, [serviceName, onPaymentComplete, onClose, toast]);

  if (!open) return null;

  // ── Step 3: TenderDialog ──
  if (step === 'tender' && order && posConfig) {
    return (
      <TenderDialog
        open
        onClose={() => {
          // Go back to select step if user closes tender without paying
          setStep('select');
          setOrder(null);
          setPosConfig(null);
        }}
        order={order}
        config={posConfig}
        tenderType={selectedPaymentType}
        onPaymentComplete={handlePaymentComplete}
      />
    );
  }

  // ── Step 1: Select terminal + payment type | Step 2: Creating spinner ──
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60"
        onClick={step === 'creating' ? undefined : onClose}
        role="presentation"
      />

      {/* Dialog */}
      <div
        className="relative w-full max-w-md rounded-xl border border-border bg-surface shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-label="Pay Now"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-green-500" aria-hidden="true" />
            <h2 className="text-base font-semibold text-foreground">Pay Now</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={step === 'creating'}
            className="rounded-lg p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {step === 'creating' ? (
          /* ── Creating order spinner ── */
          <div className="flex flex-col items-center justify-center px-5 py-12 gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-indigo-500" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">Creating order...</p>
          </div>
        ) : (
          /* ── Select terminal + payment type ── */
          <>
            <div className="px-5 py-4 space-y-4">
              {/* Service info */}
              <div className="rounded-lg border border-border bg-surface p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Service</span>
                  <span className="text-sm font-medium text-foreground">{serviceName}</span>
                </div>
              </div>

              {/* Payment type selection */}
              <div className="space-y-2">
                <span className="text-sm font-medium text-foreground">Payment Method</span>
                <div className="grid grid-cols-4 gap-2">
                  {PAYMENT_TYPES.map(({ type, label, icon: Icon }) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setSelectedPaymentType(type)}
                      className={`flex flex-col items-center gap-1.5 rounded-lg border p-3 text-xs font-medium transition-colors ${
                        selectedPaymentType === type
                          ? 'border-indigo-500 bg-indigo-500/10 text-indigo-500'
                          : 'border-border bg-surface text-muted-foreground hover:bg-accent hover:text-foreground'
                      }`}
                    >
                      <Icon className="h-5 w-5" />
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Terminal selection */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Monitor className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  <span className="text-sm font-medium text-foreground">Terminal</span>
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
                className="rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleProceed}
                disabled={!canProceed}
                className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <DollarSign className="h-4 w-4" aria-hidden="true" />
                Proceed to Payment
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
