'use client';

import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  LogOut,
  Mail,
  Printer,
  FileText,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { formatCentsLocale } from '@oppsera/shared';
import { apiFetch } from '@/lib/api-client';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast';

// ── Types ────────────────────────────────────────────────────────

interface Reservation {
  id: string;
  primaryGuestJson: { firstName: string; lastName: string } | null;
  roomNumber: string | null;
  roomTypeName: string | null;
  checkInDate: string;
  checkOutDate: string;
  nights: number;
  nightlyRateCents: number;
  totalCents: number;
  guestEmail: string | null;
  version: number;
  confirmationNumber: string | null;
}

interface FolioEntry {
  id: string;
  entryType: string;
  description: string;
  amountCents: number;
  postedAt: string;
}

interface FolioSummary {
  totalCharges: number;
  totalPayments: number;
  totalRefunds: number;
  balanceDue: number;
}

interface FolioData {
  id: string;
  status: string;
  subtotalCents: number;
  taxCents: number;
  feeCents: number;
  totalCents: number;
  entries: FolioEntry[];
  summary: FolioSummary;
}

type FolioDelivery = 'print' | 'email' | 'both' | 'none';

// ── Helpers ──────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

const ENTRY_TYPE_LABELS: Record<string, string> = {
  ROOM_CHARGE: 'Room',
  TAX: 'Tax',
  FEE: 'Fee',
  ADJUSTMENT: 'Adj',
  PAYMENT: 'Payment',
  REFUND: 'Refund',
};

const DELIVERY_OPTIONS: { value: FolioDelivery; label: string; icon: React.ElementType }[] = [
  { value: 'email', label: 'Email Folio', icon: Mail },
  { value: 'print', label: 'Print Folio', icon: Printer },
  { value: 'both', label: 'Print & Email', icon: FileText },
  { value: 'none', label: 'Do Not Print / Email', icon: X },
];

// ── Component ───────────────────────────────────────────────────

export function CheckOutDrawer({
  open,
  onClose,
  reservation,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  reservation: Reservation;
  onSuccess: () => void;
}) {
  const { toast } = useToast();
  const [folio, setFolio] = useState<FolioData | null>(null);
  const [isFolioLoading, setIsFolioLoading] = useState(true);
  const [folioDelivery, setFolioDelivery] = useState<FolioDelivery>('email');
  const [checkoutNotes, setCheckoutNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showFolioEntries, setShowFolioEntries] = useState(false);
  const [balanceAcknowledged, setBalanceAcknowledged] = useState(false);

  // Fetch folio when drawer opens
  useEffect(() => {
    if (!open) {
      setFolio(null);
      setIsFolioLoading(true);
      setCheckoutNotes('');
      setFolioDelivery('email');
      setShowFolioEntries(false);
      setBalanceAcknowledged(false);
      return;
    }

    let cancelled = false;
    setIsFolioLoading(true);

    apiFetch<{ data: FolioData | null }>(
      `/api/v1/pms/reservations/${reservation.id}/folio`,
    )
      .then((res) => {
        if (!cancelled) setFolio(res.data);
      })
      .catch(() => {
        // no folio
      })
      .finally(() => {
        if (!cancelled) setIsFolioLoading(false);
      });

    return () => { cancelled = true; };
  }, [open, reservation.id]);

  // Escape key handler
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  const balanceDue = folio?.summary.balanceDue ?? 0;
  const hasOutstandingBalance = balanceDue > 0;
  const canCheckOut = !hasOutstandingBalance || balanceAcknowledged;

  const handleCheckOut = useCallback(async () => {
    if (!canCheckOut) return;
    setIsSubmitting(true);
    try {
      await apiFetch(`/api/v1/pms/reservations/${reservation.id}/check-out`, {
        method: 'POST',
        body: JSON.stringify({
          version: reservation.version,
          checkoutNotes: checkoutNotes.trim() || undefined,
          folioDelivery,
        }),
      });
      toast.success('Guest checked out successfully');
      onSuccess();
      onClose();
    } catch (err) {
      const e = err instanceof Error ? err : new Error('Failed to check out');
      toast.error(e.message);
    } finally {
      setIsSubmitting(false);
    }
  }, [reservation.id, reservation.version, checkoutNotes, folioDelivery, canCheckOut, toast, onSuccess, onClose]);

  if (!open) return null;

  const guest = reservation.primaryGuestJson
    ? `${reservation.primaryGuestJson.lastName}, ${reservation.primaryGuestJson.firstName}`
    : '\u2014';

  const confirmShort = reservation.confirmationNumber
    ? `#${reservation.confirmationNumber}`
    : `#${reservation.id.slice(-8).toUpperCase()}`;

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/60"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Guest Check-Out"
        tabIndex={-1}
        className="fixed right-0 top-0 z-50 flex h-full w-full max-w-[520px] flex-col border-l border-border bg-surface shadow-xl"
      >
        {/* ── Header ──────────────────────────────────────────── */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Guest Check-Out</h2>
            <p className="text-sm text-muted-foreground">
              Room {reservation.roomNumber ?? 'N/A'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* ── Scrollable Content ──────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

          {/* 1. Guest & Stay Summary */}
          <div className="rounded-lg border border-border bg-muted/30 p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-lg font-semibold text-foreground">{guest}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {formatDate(reservation.checkInDate)} &rarr; {formatDate(reservation.checkOutDate)}
                  <span className="ml-2">({reservation.nights} night{reservation.nights !== 1 ? 's' : ''})</span>
                </p>
              </div>
              <div className="text-right">
                <p className="text-lg font-semibold text-foreground">
                  {formatCentsLocale(reservation.totalCents)}
                </p>
                <p className="text-xs text-muted-foreground">Total Stay</p>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-muted-foreground">Confirmation: </span>
                <span className="font-medium text-foreground">{confirmShort}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Room Type: </span>
                <span className="font-medium text-foreground">{reservation.roomTypeName ?? '\u2014'}</span>
              </div>
              {reservation.guestEmail && (
                <div className="col-span-2">
                  <span className="text-muted-foreground">Email: </span>
                  <span className="font-medium text-foreground">{reservation.guestEmail}</span>
                </div>
              )}
            </div>
          </div>

          {/* 2. Folio Balance Gate */}
          <div className="rounded-lg border border-border p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">Folio Balance</h3>
              {isFolioLoading ? (
                <div className="h-5 w-20 animate-pulse rounded bg-muted" />
              ) : (
                <span
                  className={`text-lg font-bold ${
                    hasOutstandingBalance
                      ? 'text-red-500'
                      : balanceDue < 0
                        ? 'text-amber-500'
                        : 'text-green-500'
                  }`}
                >
                  {formatCentsLocale(balanceDue)}
                </span>
              )}
            </div>

            {!isFolioLoading && folio && (
              <div className="mt-3 space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Charges</span>
                  <span className="text-foreground">{formatCentsLocale(folio.summary.totalCharges)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Payments</span>
                  <span className="text-green-500">-{formatCentsLocale(folio.summary.totalPayments)}</span>
                </div>
                {folio.summary.totalRefunds > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Refunds</span>
                    <span className="text-red-400">{formatCentsLocale(folio.summary.totalRefunds)}</span>
                  </div>
                )}
              </div>
            )}

            {/* Outstanding balance warning */}
            {!isFolioLoading && hasOutstandingBalance && (
              <div className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
                <div className="flex items-start gap-2 text-sm text-amber-400">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>
                    <p className="font-medium">Outstanding balance of {formatCentsLocale(balanceDue)}</p>
                    <p className="mt-1 text-amber-400/80">
                      The folio has an unpaid balance. You can still proceed, but the balance will remain on the closed folio.
                    </p>
                  </div>
                </div>
                <label className="mt-3 flex items-center gap-2 text-sm text-foreground">
                  <input
                    type="checkbox"
                    checked={balanceAcknowledged}
                    onChange={(e) => setBalanceAcknowledged(e.target.checked)}
                    className="h-4 w-4 rounded border-border bg-surface text-indigo-600 focus:ring-indigo-500"
                  />
                  I acknowledge the outstanding balance
                </label>
              </div>
            )}

            {/* Folio entries preview (collapsible) */}
            {!isFolioLoading && folio && folio.entries.length > 0 && (
              <div className="mt-3">
                <button
                  type="button"
                  onClick={() => setShowFolioEntries((o) => !o)}
                  className="flex items-center gap-1.5 text-sm font-medium text-indigo-400 transition-colors hover:text-indigo-300"
                >
                  {showFolioEntries ? (
                    <ChevronUp className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5" />
                  )}
                  {showFolioEntries ? 'Hide' : 'View'} Folio Detail ({folio.entries.length} entries)
                </button>

                {showFolioEntries && (
                  <div className="mt-2 max-h-48 overflow-y-auto rounded border border-border">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-border bg-muted">
                          <th className="px-3 py-2 text-left font-medium text-muted-foreground">Type</th>
                          <th className="px-3 py-2 text-left font-medium text-muted-foreground">Description</th>
                          <th className="px-3 py-2 text-right font-medium text-muted-foreground">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {folio.entries.map((entry) => {
                          const isPayment = entry.entryType === 'PAYMENT' || entry.entryType === 'REFUND';
                          return (
                            <tr key={entry.id} className="border-b border-border last:border-0">
                              <td className="px-3 py-1.5">
                                <Badge variant={isPayment ? 'success' : 'neutral'}>
                                  {ENTRY_TYPE_LABELS[entry.entryType] ?? entry.entryType}
                                </Badge>
                              </td>
                              <td className="px-3 py-1.5 text-foreground">{entry.description}</td>
                              <td className={`px-3 py-1.5 text-right font-medium ${isPayment ? 'text-green-500' : 'text-foreground'}`}>
                                {isPayment ? '-' : ''}{formatCentsLocale(Math.abs(entry.amountCents))}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 3. Print / Email Options */}
          <div className="rounded-lg border border-border p-4">
            <h3 className="text-sm font-semibold text-foreground">Folio Delivery</h3>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {DELIVERY_OPTIONS.map((opt) => {
                const Icon = opt.icon;
                const isSelected = folioDelivery === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setFolioDelivery(opt.value)}
                    className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm transition-colors ${
                      isSelected
                        ? 'border-indigo-500 bg-indigo-500/10 text-indigo-400'
                        : 'border-border text-muted-foreground hover:border-border hover:bg-accent'
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {opt.label}
                  </button>
                );
              })}
            </div>
            {folioDelivery === 'email' && !reservation.guestEmail && (
              <p className="mt-2 text-xs text-amber-400">
                No email on file for this guest. The folio will be saved but not emailed.
              </p>
            )}
          </div>

          {/* 4. Checkout Comments */}
          <div className="rounded-lg border border-border p-4">
            <label htmlFor="checkout-notes" className="text-sm font-semibold text-foreground">
              Checkout Comments
            </label>
            <textarea
              id="checkout-notes"
              value={checkoutNotes}
              onChange={(e) => setCheckoutNotes(e.target.value)}
              rows={3}
              maxLength={2000}
              placeholder="Optional — departure notes, guest feedback, special requests for next stay..."
              className="mt-2 block w-full resize-y rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
            />
            <p className="mt-1 text-xs text-muted-foreground text-right">
              {checkoutNotes.length}/2000
            </p>
          </div>
        </div>

        {/* ── Footer ─────────────────────────────────────────── */}
        <div className="border-t border-border px-6 py-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="flex-1 rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleCheckOut}
              disabled={isSubmitting || isFolioLoading || !canCheckOut}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
            >
              <LogOut className="h-4 w-4" />
              {isSubmitting ? 'Checking Out...' : 'Check Out'}
            </button>
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}
