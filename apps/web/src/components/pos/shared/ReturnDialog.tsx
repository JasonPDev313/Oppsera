'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X, Search, ChevronRight, Minus, Plus, Check, RotateCcw } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { useToast } from '@/components/ui/toast';
import type { Order } from '@/types/pos';

// ── Types ─────────────────────────────────────────────────────────

interface ReturnDialogProps {
  open: boolean;
  onClose: () => void;
  onComplete: () => void;
}

interface ReturnLineSelection {
  lineId: string;
  maxQty: number;
  returnQty: number;
  reason: string;
  lineName: string;
  unitPrice: number;
}

type Step = 'find' | 'select' | 'reason' | 'confirm';

function formatMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function generateClientRequestId(): string {
  return `ret-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ── Return Dialog ─────────────────────────────────────────────────

export function ReturnDialog({ open, onClose, onComplete }: ReturnDialogProps) {
  const { toast } = useToast();

  // Wizard state
  const [step, setStep] = useState<Step>('find');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Order[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [returnLines, setReturnLines] = useState<ReturnLineSelection[]>([]);
  const [globalReason, setGlobalReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Reset on open/close
  useEffect(() => {
    if (open) {
      setStep('find');
      setSearchQuery('');
      setSearchResults([]);
      setSelectedOrder(null);
      setReturnLines([]);
      setGlobalReason('');
    }
  }, [open]);

  // ── Step 1: Find Order ───────────────────────────────────────────

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    try {
      const q = encodeURIComponent(searchQuery.trim());
      const result = await apiFetch<{ items: Order[] }>(`/api/v1/orders?search=${q}&limit=10&status=placed,paid`);
      setSearchResults(result.items ?? []);
    } catch {
      toast.error('Failed to search orders');
    } finally {
      setIsSearching(false);
    }
  }, [searchQuery, toast]);

  const handleSelectOrder = useCallback(async (order: Order) => {
    // Fetch full order details
    try {
      const full = await apiFetch<Order>(`/api/v1/orders/${order.id}`);
      setSelectedOrder(full);
      // Pre-populate return line selections from order lines
      const lines: ReturnLineSelection[] = (full.lines ?? []).map((line) => ({
        lineId: line.id,
        maxQty: Number(line.qty),
        returnQty: 0,
        reason: '',
        lineName: line.catalogItemName ?? 'Unknown',
        unitPrice: line.unitPrice,
      }));
      setReturnLines(lines);
      setStep('select');
    } catch {
      toast.error('Failed to load order details');
    }
  }, [toast]);

  // ── Step 2: Select Items ─────────────────────────────────────────

  const updateReturnQty = useCallback((lineId: string, delta: number) => {
    setReturnLines((prev) =>
      prev.map((rl) =>
        rl.lineId === lineId
          ? { ...rl, returnQty: Math.max(0, Math.min(rl.maxQty, rl.returnQty + delta)) }
          : rl,
      ),
    );
  }, []);

  const selectedCount = useMemo(
    () => returnLines.filter((rl) => rl.returnQty > 0).length,
    [returnLines],
  );

  const returnTotal = useMemo(
    () => returnLines.reduce((sum, rl) => sum + rl.returnQty * rl.unitPrice, 0),
    [returnLines],
  );

  // ── Step 3: Reason ───────────────────────────────────────────────

  const handleApplyGlobalReason = useCallback(() => {
    if (!globalReason.trim()) return;
    setReturnLines((prev) =>
      prev.map((rl) =>
        rl.returnQty > 0 && !rl.reason.trim()
          ? { ...rl, reason: globalReason.trim() }
          : rl,
      ),
    );
  }, [globalReason]);

  const allReasonsProvided = useMemo(
    () => returnLines.filter((rl) => rl.returnQty > 0).every((rl) => rl.reason.trim().length > 0),
    [returnLines],
  );

  // ── Step 4: Confirm & Submit ─────────────────────────────────────

  const handleSubmit = useCallback(async () => {
    if (!selectedOrder) return;
    setIsSubmitting(true);
    try {
      const payload = {
        clientRequestId: generateClientRequestId(),
        returnLines: returnLines
          .filter((rl) => rl.returnQty > 0)
          .map((rl) => ({
            originalLineId: rl.lineId,
            qty: rl.returnQty,
            reason: rl.reason.trim(),
          })),
      };

      await apiFetch(`/api/v1/orders/${selectedOrder.id}/return`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      toast.success(`Return processed for ${formatMoney(returnTotal)}`);
      onComplete();
      onClose();
    } catch {
      toast.error('Failed to process return');
    } finally {
      setIsSubmitting(false);
    }
  }, [selectedOrder, returnLines, returnTotal, toast, onComplete, onClose]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="return-dialog-title">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 flex h-[600px] w-full max-w-lg flex-col rounded-xl bg-surface shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div className="flex items-center gap-2">
            <RotateCcw className="h-5 w-5 text-indigo-600" aria-hidden="true" />
            <h2 id="return-dialog-title" className="text-lg font-semibold text-foreground">Process Return</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-md p-1 text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-2 border-b border-border px-6 py-2">
          {(['find', 'select', 'reason', 'confirm'] as Step[]).map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              {i > 0 && <ChevronRight className="h-3 w-3 text-muted-foreground" aria-hidden="true" />}
              <span
                className={`text-xs font-medium ${
                  s === step ? 'text-indigo-600' : 'text-muted-foreground'
                }`}
              >
                {s === 'find' ? 'Find Order' : s === 'select' ? 'Select Items' : s === 'reason' ? 'Reason' : 'Confirm'}
              </span>
            </div>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* ── Step 1: Find Order ──────────────────────────────── */}
          {step === 'find' && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Search by order number, customer name, or receipt number.
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
                  placeholder="Order # or customer name..."
                  className="flex-1 rounded-lg border border-input px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={handleSearch}
                  disabled={isSearching || !searchQuery.trim()}
                  className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  <Search className="h-4 w-4" />
                  Search
                </button>
              </div>

              {isSearching && (
                <p className="text-center text-sm text-muted-foreground">Searching...</p>
              )}

              {searchResults.length > 0 && (
                <div className="space-y-1">
                  {searchResults.map((order) => (
                    <button
                      key={order.id}
                      type="button"
                      onClick={() => handleSelectOrder(order)}
                      className="flex w-full items-center justify-between rounded-lg border border-border px-4 py-3 text-left transition-colors hover:bg-accent"
                    >
                      <div>
                        <span className="text-sm font-semibold text-foreground">
                          #{order.orderNumber}
                        </span>
                        {order.customerName && (
                          <span className="ml-2 text-sm text-muted-foreground">{order.customerName}</span>
                        )}
                        <p className="text-xs text-muted-foreground">
                          {order.lines?.length ?? 0} items &middot; {formatMoney(order.total)}
                        </p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </button>
                  ))}
                </div>
              )}

              {!isSearching && searchResults.length === 0 && searchQuery.trim() && (
                <p className="text-center text-sm text-muted-foreground">No orders found</p>
              )}
            </div>
          )}

          {/* ── Step 2: Select Items ───────────────────────────── */}
          {step === 'select' && selectedOrder && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Select items and quantities to return from order #{selectedOrder.orderNumber}.
              </p>
              {returnLines.map((rl) => (
                <div
                  key={rl.lineId}
                  className={`flex items-center justify-between rounded-lg border px-4 py-3 ${
                    rl.returnQty > 0 ? 'border-indigo-500/30 bg-indigo-500/10' : 'border-border'
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-foreground truncate block">{rl.lineName}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatMoney(rl.unitPrice)} each &middot; Max: {rl.maxQty}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => updateReturnQty(rl.lineId, -1)}
                      disabled={rl.returnQty <= 0}
                      className="flex h-7 w-7 items-center justify-center rounded border border-input text-muted-foreground hover:bg-accent disabled:opacity-30"
                    >
                      <Minus className="h-3 w-3" />
                    </button>
                    <span className="min-w-6 text-center text-sm font-semibold">{rl.returnQty}</span>
                    <button
                      type="button"
                      onClick={() => updateReturnQty(rl.lineId, 1)}
                      disabled={rl.returnQty >= rl.maxQty}
                      className="flex h-7 w-7 items-center justify-center rounded border border-input text-muted-foreground hover:bg-accent disabled:opacity-30"
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── Step 3: Reason ─────────────────────────────────── */}
          {step === 'reason' && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">Provide a reason for each returned item.</p>

              {/* Global reason */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={globalReason}
                  onChange={(e) => setGlobalReason(e.target.value)}
                  placeholder="Apply reason to all items..."
                  className="flex-1 rounded-lg border border-input px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleApplyGlobalReason}
                  disabled={!globalReason.trim()}
                  className="rounded-lg bg-muted px-3 py-2 text-sm font-medium text-foreground hover:bg-accent disabled:opacity-50"
                >
                  Apply All
                </button>
              </div>

              {/* Per-line reasons */}
              {returnLines.filter((rl) => rl.returnQty > 0).map((rl) => (
                <div key={rl.lineId} className="space-y-1">
                  <label className="text-xs font-medium text-foreground">
                    {rl.lineName} (x{rl.returnQty})
                  </label>
                  <input
                    type="text"
                    value={rl.reason}
                    onChange={(e) => {
                      const val = e.target.value;
                      setReturnLines((prev) =>
                        prev.map((r) => (r.lineId === rl.lineId ? { ...r, reason: val } : r)),
                      );
                    }}
                    placeholder="Reason for return..."
                    className="w-full rounded-lg border border-input px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                  />
                </div>
              ))}
            </div>
          )}

          {/* ── Step 4: Confirm ────────────────────────────────── */}
          {step === 'confirm' && selectedOrder && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Review the return details below.
              </p>

              <div className="rounded-lg border border-border divide-y divide-border">
                <div className="px-4 py-3">
                  <span className="text-xs font-medium text-muted-foreground">Order</span>
                  <p className="text-sm font-semibold text-foreground">#{selectedOrder.orderNumber}</p>
                </div>
                {returnLines.filter((rl) => rl.returnQty > 0).map((rl) => (
                  <div key={rl.lineId} className="flex items-center justify-between px-4 py-3">
                    <div>
                      <span className="text-sm font-medium text-foreground">{rl.lineName}</span>
                      <p className="text-xs text-muted-foreground">x{rl.returnQty} &middot; {rl.reason}</p>
                    </div>
                    <span className="text-sm font-semibold text-foreground">
                      {formatMoney(rl.returnQty * rl.unitPrice)}
                    </span>
                  </div>
                ))}
                <div className="flex items-center justify-between bg-muted px-4 py-3">
                  <span className="text-sm font-semibold text-foreground">Refund Total</span>
                  <span className="text-base font-bold text-indigo-600">{formatMoney(returnTotal)}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border px-6 py-4">
          <div>
            {step !== 'find' && (
              <button
                type="button"
                onClick={() => {
                  const steps: Step[] = ['find', 'select', 'reason', 'confirm'];
                  const idx = steps.indexOf(step);
                  if (idx > 0) setStep(steps[idx - 1]!);
                }}
                className="text-sm font-medium text-muted-foreground hover:text-foreground"
              >
                Back
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
            {step === 'select' && (
              <button
                type="button"
                onClick={() => setStep('reason')}
                disabled={selectedCount === 0}
                className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                Next ({selectedCount} items)
                <ChevronRight className="h-4 w-4" />
              </button>
            )}
            {step === 'reason' && (
              <button
                type="button"
                onClick={() => setStep('confirm')}
                disabled={!allReasonsProvided}
                className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                Review
                <ChevronRight className="h-4 w-4" />
              </button>
            )}
            {step === 'confirm' && (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="flex items-center gap-1.5 rounded-lg bg-red-600 px-5 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                <Check className="h-4 w-4" />
                {isSubmitting ? 'Processing...' : `Process Return ${formatMoney(returnTotal)}`}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
