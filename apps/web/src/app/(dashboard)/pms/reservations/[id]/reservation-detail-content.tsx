'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  LogIn,
  LogOut,
  XCircle,
  ArrowRightLeft,
  Plus,
  User,
  Mail,
  Phone,
  StickyNote,
  FileText,
} from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { Badge } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';

// ── Types ────────────────────────────────────────────────────────

interface Reservation {
  id: string;
  propertyId: string;
  guestId: string | null;
  primaryGuestJson: { firstName: string; lastName: string } | null;
  roomId: string | null;
  roomTypeId: string;
  ratePlanId: string | null;
  checkInDate: string;
  checkOutDate: string;
  adults: number;
  children: number;
  nights: number;
  nightlyRateCents: number;
  subtotalCents: number;
  taxCents: number;
  feeCents: number;
  totalCents: number;
  status: string;
  sourceType: string | null;
  internalNotes: string | null;
  guestNotes: string | null;
  version: number;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  roomNumber: string | null;
  roomFloor: string | null;
  roomTypeName: string | null;
  roomTypeCode: string | null;
  ratePlanName: string | null;
  ratePlanCode: string | null;
  guestFirstName: string | null;
  guestLastName: string | null;
  guestEmail: string | null;
  folioId: string | null;
  folioStatus: string | null;
  folioTotalCents: number | null;
}

interface FolioEntry {
  id: string;
  entryType: string;
  description: string;
  amountCents: number;
  sourceRef: string | null;
  postedAt: string;
  postedBy: string | null;
  runningBalanceCents: number;
}

interface FolioSummary {
  totalCharges: number;
  totalPayments: number;
  totalRefunds: number;
  balanceDue: number;
}

interface FolioData {
  id: string;
  reservationId: string | null;
  status: string;
  subtotalCents: number;
  taxCents: number;
  feeCents: number;
  totalCents: number;
  entries: FolioEntry[];
  summary: FolioSummary;
}

// ── Constants ────────────────────────────────────────────────────

const STATUS_BADGES: Record<string, { label: string; variant: string }> = {
  HOLD: { label: 'Hold', variant: 'warning' },
  CONFIRMED: { label: 'Confirmed', variant: 'success' },
  CHECKED_IN: { label: 'Checked In', variant: 'info' },
  CHECKED_OUT: { label: 'Checked Out', variant: 'neutral' },
  CANCELLED: { label: 'Cancelled', variant: 'error' },
  NO_SHOW: { label: 'No Show', variant: 'orange' },
};

const SOURCE_BADGES: Record<string, { label: string; variant: string }> = {
  DIRECT: { label: 'Direct', variant: 'indigo' },
  PHONE: { label: 'Phone', variant: 'purple' },
  WALKIN: { label: 'Walk-In', variant: 'orange' },
  BOOKING_ENGINE: { label: 'Online', variant: 'info' },
  OTA: { label: 'OTA', variant: 'neutral' },
};

const ENTRY_TYPE_LABELS: Record<string, string> = {
  ROOM_CHARGE: 'Room Charge',
  TAX: 'Tax',
  FEE: 'Fee',
  ADJUSTMENT: 'Adjustment',
  PAYMENT: 'Payment',
  REFUND: 'Refund',
};

// ── Helpers ──────────────────────────────────────────────────────

function formatMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function guestFullName(reservation: Reservation): string {
  if (reservation.guestFirstName && reservation.guestLastName) {
    return `${reservation.guestFirstName} ${reservation.guestLastName}`;
  }
  if (reservation.primaryGuestJson) {
    return `${reservation.primaryGuestJson.firstName} ${reservation.primaryGuestJson.lastName}`;
  }
  return '\u2014';
}

// ── Post Charge Dialog ───────────────────────────────────────────

function PostChargeDialog({
  open,
  onClose,
  folioId,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  folioId: string;
  onSuccess: () => void;
}) {
  const { toast } = useToast();
  const [entryType, setEntryType] = useState('FEE');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = useCallback(async () => {
    if (!description.trim() || !amount) return;
    const amountCents = Math.round(parseFloat(amount) * 100);
    if (isNaN(amountCents) || amountCents === 0) return;

    setIsSubmitting(true);
    try {
      await apiFetch(`/api/v1/pms/folios/${folioId}/entries`, {
        method: 'POST',
        body: JSON.stringify({
          entryType,
          description: description.trim(),
          amountCents,
        }),
      });
      toast.success('Charge posted successfully');
      setDescription('');
      setAmount('');
      setEntryType('FEE');
      onSuccess();
      onClose();
    } catch (err) {
      const e = err instanceof Error ? err : new Error('Failed to post charge');
      toast.error(e.message);
    } finally {
      setIsSubmitting(false);
    }
  }, [folioId, entryType, description, amount, toast, onSuccess, onClose]);

  if (!open) return null;

  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      onConfirm={handleSubmit}
      title="Post Charge"
      confirmLabel="Post"
      isLoading={isSubmitting}
    >
      <div className="mt-4 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">Type</label>
          <select
            value={entryType}
            onChange={(e) => setEntryType(e.target.value)}
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
          >
            <option value="ROOM_CHARGE">Room Charge</option>
            <option value="TAX">Tax</option>
            <option value="FEE">Fee</option>
            <option value="ADJUSTMENT">Adjustment</option>
            <option value="PAYMENT">Payment</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Description</label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. Mini bar charge"
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Amount ($)</label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            step="0.01"
            min="0"
            placeholder="0.00"
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
          />
        </div>
      </div>
    </ConfirmDialog>
  );
}

// ── Cancel Dialog ────────────────────────────────────────────────

function CancelDialog({
  open,
  onClose,
  reservationId,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  reservationId: string;
  onSuccess: () => void;
}) {
  const { toast } = useToast();
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = useCallback(async () => {
    setIsSubmitting(true);
    try {
      await apiFetch(`/api/v1/pms/reservations/${reservationId}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ reason: reason.trim() || undefined }),
      });
      toast.success('Reservation cancelled');
      setReason('');
      onSuccess();
      onClose();
    } catch (err) {
      const e = err instanceof Error ? err : new Error('Failed to cancel');
      toast.error(e.message);
    } finally {
      setIsSubmitting(false);
    }
  }, [reservationId, reason, toast, onSuccess, onClose]);

  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      onConfirm={handleSubmit}
      title="Cancel Reservation"
      description="Are you sure you want to cancel this reservation? This action cannot be undone."
      confirmLabel="Cancel Reservation"
      destructive
      isLoading={isSubmitting}
    >
      <div className="mt-4">
        <label className="block text-sm font-medium text-gray-700">
          Reason (optional)
        </label>
        <input
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Guest requested cancellation"
          className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
        />
      </div>
    </ConfirmDialog>
  );
}

// ── Move Room Dialog ─────────────────────────────────────────────

function MoveRoomDialog({
  open,
  onClose,
  reservationId,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  reservationId: string;
  onSuccess: () => void;
}) {
  const { toast } = useToast();
  const [newRoomId, setNewRoomId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = useCallback(async () => {
    if (!newRoomId.trim()) return;
    setIsSubmitting(true);
    try {
      await apiFetch(`/api/v1/pms/reservations/${reservationId}/move-room`, {
        method: 'POST',
        body: JSON.stringify({ newRoomId: newRoomId.trim() }),
      });
      toast.success('Room moved successfully');
      setNewRoomId('');
      onSuccess();
      onClose();
    } catch (err) {
      const e = err instanceof Error ? err : new Error('Failed to move room');
      toast.error(e.message);
    } finally {
      setIsSubmitting(false);
    }
  }, [reservationId, newRoomId, toast, onSuccess, onClose]);

  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      onConfirm={handleSubmit}
      title="Move Room"
      confirmLabel="Move"
      isLoading={isSubmitting}
    >
      <div className="mt-4">
        <label className="block text-sm font-medium text-gray-700">
          New Room ID
        </label>
        <input
          type="text"
          value={newRoomId}
          onChange={(e) => setNewRoomId(e.target.value)}
          placeholder="Enter the new room ID"
          className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
        />
      </div>
    </ConfirmDialog>
  );
}

// ── Folio Section ────────────────────────────────────────────────

function FolioSection({
  reservationId,
  folioId,
}: {
  reservationId: string;
  folioId: string | null;
}) {
  const [folio, setFolio] = useState<FolioData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showPostCharge, setShowPostCharge] = useState(false);

  const fetchFolio = useCallback(async () => {
    try {
      const res = await apiFetch<{ data: FolioData | null }>(
        `/api/v1/pms/reservations/${reservationId}/folio`,
      );
      setFolio(res.data);
    } catch {
      // no folio yet
    } finally {
      setIsLoading(false);
    }
  }, [reservationId]);

  useEffect(() => {
    fetchFolio();
  }, [fetchFolio]);

  if (isLoading) {
    return (
      <div className="rounded-lg border border-gray-200 bg-surface p-6">
        <div className="h-6 w-32 animate-pulse rounded bg-gray-200" />
        <div className="mt-4 space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-10 animate-pulse rounded bg-gray-100" />
          ))}
        </div>
      </div>
    );
  }

  if (!folio) {
    return (
      <div className="rounded-lg border border-gray-200 bg-surface p-6">
        <h2 className="text-lg font-semibold text-gray-900">Folio</h2>
        <p className="mt-2 text-sm text-gray-500">
          No folio has been created for this reservation yet.
        </p>
      </div>
    );
  }

  const effectiveFolioId = folioId ?? folio.id;

  return (
    <div className="rounded-lg border border-gray-200 bg-surface">
      {/* Folio Header */}
      <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
        <div className="flex items-center gap-3">
          <FileText className="h-5 w-5 text-gray-400" />
          <h2 className="text-lg font-semibold text-gray-900">Folio</h2>
          <Badge variant={folio.status === 'OPEN' ? 'success' : 'neutral'}>
            {folio.status}
          </Badge>
        </div>
        {folio.status === 'OPEN' && (
          <button
            type="button"
            onClick={() => setShowPostCharge(true)}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
          >
            <Plus className="h-3.5 w-3.5" />
            Post Charge
          </button>
        )}
      </div>

      {/* Entries Table */}
      {folio.entries.length === 0 ? (
        <div className="px-6 py-8 text-center text-sm text-gray-500">
          No folio entries yet.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                  Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                  Description
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-500">
                  Amount
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                  Date
                </th>
              </tr>
            </thead>
            <tbody>
              {folio.entries.map((entry) => {
                const isPayment = entry.entryType === 'PAYMENT' || entry.entryType === 'REFUND';
                return (
                  <tr
                    key={entry.id}
                    className="border-b border-gray-100 last:border-0"
                  >
                    <td className="px-6 py-3">
                      <Badge
                        variant={
                          entry.entryType === 'PAYMENT'
                            ? 'success'
                            : entry.entryType === 'REFUND'
                              ? 'error'
                              : 'neutral'
                        }
                      >
                        {ENTRY_TYPE_LABELS[entry.entryType] ?? entry.entryType}
                      </Badge>
                    </td>
                    <td className="px-6 py-3 text-sm text-gray-900">
                      {entry.description}
                    </td>
                    <td
                      className={`px-6 py-3 text-right text-sm font-medium ${
                        isPayment ? 'text-green-600' : 'text-gray-900'
                      }`}
                    >
                      {isPayment ? '-' : ''}
                      {formatMoney(Math.abs(entry.amountCents))}
                    </td>
                    <td className="px-6 py-3 text-sm text-gray-500">
                      {formatDateTime(entry.postedAt)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Folio Summary */}
      <div className="border-t border-gray-200 px-6 py-4">
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Subtotal</span>
            <span className="text-gray-900">{formatMoney(folio.subtotalCents)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Tax</span>
            <span className="text-gray-900">{formatMoney(folio.taxCents)}</span>
          </div>
          {folio.feeCents > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Fees</span>
              <span className="text-gray-900">{formatMoney(folio.feeCents)}</span>
            </div>
          )}
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Payments</span>
            <span className="text-green-600">
              -{formatMoney(folio.summary.totalPayments)}
            </span>
          </div>
          <div className="border-t border-gray-200 pt-2">
            <div className="flex justify-between">
              <span className="text-base font-semibold text-gray-900">
                Balance Due
              </span>
              <span
                className={`text-base font-semibold ${
                  folio.summary.balanceDue > 0 ? 'text-red-600' : 'text-green-600'
                }`}
              >
                {formatMoney(folio.summary.balanceDue)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Post Charge Dialog */}
      <PostChargeDialog
        open={showPostCharge}
        onClose={() => setShowPostCharge(false)}
        folioId={effectiveFolioId}
        onSuccess={fetchFolio}
      />
    </div>
  );
}

// ── Main Page Component ──────────────────────────────────────────

export default function ReservationDetailContent() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const reservationId = params.id as string;

  // ── State ────────────────────────────────────────────────────────
  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showCancel, setShowCancel] = useState(false);
  const [showMoveRoom, setShowMoveRoom] = useState(false);
  const [isCheckingIn, setIsCheckingIn] = useState(false);
  const [isCheckingOut, setIsCheckingOut] = useState(false);

  // ── Fetch reservation ─────────────────────────────────────────────
  const fetchReservation = useCallback(async () => {
    try {
      const res = await apiFetch<{ data: Reservation }>(
        `/api/v1/pms/reservations/${reservationId}`,
      );
      setReservation(res.data);
    } catch {
      // not found
    } finally {
      setIsLoading(false);
    }
  }, [reservationId]);

  useEffect(() => {
    fetchReservation();
  }, [fetchReservation]);

  // ── Actions ──────────────────────────────────────────────────────

  const handleCheckIn = useCallback(async () => {
    if (!reservation?.roomId) {
      toast.error('No room assigned. Please assign a room first.');
      return;
    }
    setIsCheckingIn(true);
    try {
      await apiFetch(`/api/v1/pms/reservations/${reservationId}/check-in`, {
        method: 'POST',
        body: JSON.stringify({ roomId: reservation.roomId, version: reservation.version }),
      });
      toast.success('Guest checked in successfully');
      fetchReservation();
    } catch (err) {
      const e = err instanceof Error ? err : new Error('Failed to check in');
      toast.error(e.message);
    } finally {
      setIsCheckingIn(false);
    }
  }, [reservationId, reservation, toast, fetchReservation]);

  const handleCheckOut = useCallback(async () => {
    setIsCheckingOut(true);
    try {
      await apiFetch(`/api/v1/pms/reservations/${reservationId}/check-out`, {
        method: 'POST',
        body: JSON.stringify({ version: reservation?.version }),
      });
      toast.success('Guest checked out successfully');
      fetchReservation();
    } catch (err) {
      const e = err instanceof Error ? err : new Error('Failed to check out');
      toast.error(e.message);
    } finally {
      setIsCheckingOut(false);
    }
  }, [reservationId, reservation, toast, fetchReservation]);

  // ── Loading state ────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="h-5 w-5 animate-pulse rounded bg-gray-200" />
          <div className="h-6 w-48 animate-pulse rounded bg-gray-200" />
        </div>
        <div className="space-y-4 rounded-lg border border-gray-200 bg-surface p-6">
          <div className="h-4 w-64 animate-pulse rounded bg-gray-200" />
          <div className="h-4 w-48 animate-pulse rounded bg-gray-200" />
          <div className="h-4 w-32 animate-pulse rounded bg-gray-200" />
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="space-y-3 rounded-lg border border-gray-200 bg-surface p-6 lg:col-span-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-5 animate-pulse rounded bg-gray-100" />
            ))}
          </div>
          <div className="space-y-3 rounded-lg border border-gray-200 bg-surface p-6">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-5 animate-pulse rounded bg-gray-100" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── Not found state ──────────────────────────────────────────────
  if (!reservation) {
    return (
      <div className="space-y-6">
        <button
          type="button"
          onClick={() => router.push('/pms/reservations')}
          className="flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Reservations
        </button>
        <div className="flex flex-col items-center justify-center rounded-lg border border-gray-200 bg-surface py-16">
          <XCircle className="h-12 w-12 text-gray-300" />
          <h3 className="mt-4 text-sm font-semibold text-gray-900">
            Reservation not found
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            The reservation you are looking for does not exist or has been removed.
          </p>
          <button
            type="button"
            onClick={() => router.push('/pms/reservations')}
            className="mt-4 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
          >
            Go to Reservations
          </button>
        </div>
      </div>
    );
  }

  const statusBadge = STATUS_BADGES[reservation.status] ?? {
    label: reservation.status,
    variant: 'neutral',
  };
  const sourceBadge = reservation.sourceType
    ? STATUS_BADGES[reservation.sourceType] ??
      SOURCE_BADGES[reservation.sourceType] ?? { label: reservation.sourceType, variant: 'neutral' }
    : null;

  const guest = guestFullName(reservation);

  return (
    <div className="space-y-6">
      {/* Back link */}
      <button
        type="button"
        onClick={() => router.push('/pms/reservations')}
        className="flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Reservations
      </button>

      {/* Reservation Header */}
      <div className="rounded-lg border border-gray-200 bg-surface p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-semibold text-gray-900">
                Reservation #{reservation.id.slice(-8).toUpperCase()}
              </h1>
              <Badge variant={statusBadge.variant}>{statusBadge.label}</Badge>
            </div>
            <p className="mt-1 text-lg text-gray-700">{guest}</p>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-gray-500">
              {sourceBadge && (
                <Badge variant={sourceBadge.variant}>{sourceBadge.label}</Badge>
              )}
              <span>Created: {formatDateTime(reservation.createdAt)}</span>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap gap-2">
            {reservation.status === 'CONFIRMED' && (
              <>
                <button
                  type="button"
                  onClick={handleCheckIn}
                  disabled={isCheckingIn}
                  className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
                >
                  <LogIn className="h-4 w-4" />
                  {isCheckingIn ? 'Checking In...' : 'Check In'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowCancel(true)}
                  className="flex items-center gap-2 rounded-lg border border-red-500/40 px-4 py-2 text-sm font-medium text-red-500 transition-colors hover:bg-red-500/10"
                >
                  <XCircle className="h-4 w-4" />
                  Cancel
                </button>
              </>
            )}
            {reservation.status === 'HOLD' && (
              <>
                <button
                  type="button"
                  onClick={handleCheckIn}
                  disabled={isCheckingIn}
                  className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
                >
                  <LogIn className="h-4 w-4" />
                  Confirm
                </button>
                <button
                  type="button"
                  onClick={() => setShowCancel(true)}
                  className="flex items-center gap-2 rounded-lg border border-red-500/40 px-4 py-2 text-sm font-medium text-red-500 transition-colors hover:bg-red-500/10"
                >
                  <XCircle className="h-4 w-4" />
                  Cancel
                </button>
              </>
            )}
            {reservation.status === 'CHECKED_IN' && (
              <>
                <button
                  type="button"
                  onClick={handleCheckOut}
                  disabled={isCheckingOut}
                  className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
                >
                  <LogOut className="h-4 w-4" />
                  {isCheckingOut ? 'Checking Out...' : 'Check Out'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowMoveRoom(true)}
                  className="flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                >
                  <ArrowRightLeft className="h-4 w-4" />
                  Move Room
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left: Reservation Details */}
        <div className="rounded-lg border border-gray-200 bg-surface p-6 lg:col-span-2">
          <h2 className="text-lg font-semibold text-gray-900">
            Reservation Details
          </h2>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <DetailRow label="Room Type" value={reservation.roomTypeName ?? '\u2014'} />
            <DetailRow
              label="Room Number"
              value={reservation.roomNumber ?? 'Unassigned'}
            />
            <DetailRow label="Check-In" value={formatDate(reservation.checkInDate)} />
            <DetailRow label="Check-Out" value={formatDate(reservation.checkOutDate)} />
            <DetailRow label="Nights" value={String(reservation.nights)} />
            <DetailRow
              label="Guests"
              value={`${reservation.adults} Adult${reservation.adults !== 1 ? 's' : ''}${
                reservation.children > 0
                  ? `, ${reservation.children} Child${reservation.children !== 1 ? 'ren' : ''}`
                  : ''
              }`}
            />
            {reservation.sourceType && (
              <DetailRow label="Source" value={reservation.sourceType} />
            )}
            {reservation.ratePlanName && (
              <DetailRow label="Rate Plan" value={reservation.ratePlanName} />
            )}
            <DetailRow
              label="Nightly Rate"
              value={formatMoney(reservation.nightlyRateCents)}
            />
            <DetailRow
              label="Total"
              value={formatMoney(reservation.totalCents)}
              highlight
            />
          </div>
        </div>

        {/* Right: Guest Info + Notes */}
        <div className="space-y-6">
          {/* Guest Info */}
          <div className="rounded-lg border border-gray-200 bg-surface p-6">
            <h2 className="text-lg font-semibold text-gray-900">Guest Info</h2>
            <div className="mt-4 space-y-3">
              <div className="flex items-center gap-3">
                <User className="h-4 w-4 text-gray-400" />
                <span className="text-sm text-gray-900">{guest}</span>
              </div>
              {reservation.guestEmail && (
                <div className="flex items-center gap-3">
                  <Mail className="h-4 w-4 text-gray-400" />
                  <span className="text-sm text-gray-900">
                    {reservation.guestEmail}
                  </span>
                </div>
              )}
              {reservation.primaryGuestJson && (
                <div className="flex items-center gap-3">
                  <Phone className="h-4 w-4 text-gray-400" />
                  <span className="text-sm text-gray-500">\u2014</span>
                </div>
              )}
            </div>
          </div>

          {/* Notes */}
          <div className="rounded-lg border border-gray-200 bg-surface p-6">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
              <StickyNote className="h-4 w-4 text-gray-400" />
              Notes
            </h2>
            {reservation.internalNotes ? (
              <div className="mt-3">
                <p className="text-xs font-medium text-gray-500">Internal Notes</p>
                <p className="mt-1 text-sm text-gray-700">
                  {reservation.internalNotes}
                </p>
              </div>
            ) : null}
            {reservation.guestNotes ? (
              <div className="mt-3">
                <p className="text-xs font-medium text-gray-500">Guest Notes</p>
                <p className="mt-1 text-sm text-gray-700">
                  {reservation.guestNotes}
                </p>
              </div>
            ) : null}
            {!reservation.internalNotes && !reservation.guestNotes && (
              <p className="mt-3 text-sm text-gray-500">No notes added.</p>
            )}
          </div>
        </div>
      </div>

      {/* Folio Section */}
      <FolioSection
        reservationId={reservationId}
        folioId={reservation.folioId}
      />

      {/* Cancel Dialog */}
      <CancelDialog
        open={showCancel}
        onClose={() => setShowCancel(false)}
        reservationId={reservationId}
        onSuccess={fetchReservation}
      />

      {/* Move Room Dialog */}
      <MoveRoomDialog
        open={showMoveRoom}
        onClose={() => setShowMoveRoom(false)}
        reservationId={reservationId}
        onSuccess={fetchReservation}
      />
    </div>
  );
}

// ── Detail Row Helper ────────────────────────────────────────────

function DetailRow({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div>
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <p
        className={`mt-0.5 text-sm ${
          highlight ? 'font-semibold text-gray-900' : 'text-gray-700'
        }`}
      >
        {value}
      </p>
    </div>
  );
}
