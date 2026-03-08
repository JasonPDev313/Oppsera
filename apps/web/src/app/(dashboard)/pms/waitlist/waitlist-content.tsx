'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  ClipboardList,
  Plus,
  X,
  Loader2,
  MoreHorizontal,
  Send,
  Trash2,
  Clock,
  Users,
  TrendingUp,
  Timer,
  Save,
} from 'lucide-react';
import { useProperties, useRoomTypes } from '@/hooks/use-pms';
import { apiFetch } from '@/lib/api-client';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/select';
import { EmptyState } from '@/components/ui/empty-state';
import { useToast } from '@/components/ui/toast';

// ═══════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════

interface WaitlistEntry {
  id: string;
  propertyId: string;
  guestName: string;
  guestEmail: string | null;
  guestPhone: string | null;
  roomTypeId: string;
  roomTypeName: string | null;
  checkInDate: string;
  checkOutDate: string;
  adults: number;
  children: number;
  flexibility: string;
  priority: number;
  hasDeposit: boolean;
  isLoyaltyMember: boolean;
  status: string;
  notes: string | null;
  rateOverrideCents: number | null;
  offerExpiresAt: string | null;
  bookedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface WaitlistStats {
  waiting: number;
  offered: number;
  booked: number;
  expired: number;
  canceled: number;
  conversionRate: number;
  avgWaitMinutes: number;
}

interface WaitlistConfig {
  id: string;
  propertyId: string;
  enabled: boolean;
  offerExpiryHours: number;
  autoOffer: boolean;
  headline: string;
  subtitle: string;
  primaryColor: string;
  accentColor: string;
  logoUrl: string;
  requireEmail: boolean;
  requirePhone: boolean;
  showRates: boolean;
  maxAdvanceDays: number;
  termsText: string;
}

// ═══════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'waiting', label: 'Waiting' },
  { value: 'offered', label: 'Offered' },
  { value: 'booked', label: 'Booked' },
  { value: 'expired', label: 'Expired' },
  { value: 'canceled', label: 'Canceled' },
];

const STATUS_BADGES: Record<string, { label: string; variant: string }> = {
  waiting: { label: 'Waiting', variant: 'warning' },
  offered: { label: 'Offered', variant: 'info' },
  booked: { label: 'Booked', variant: 'success' },
  expired: { label: 'Expired', variant: 'neutral' },
  canceled: { label: 'Canceled', variant: 'error' },
};

const FLEXIBILITY_OPTIONS = [
  { value: 'exact', label: 'Exact Dates' },
  { value: 'plus_minus_1', label: '+/- 1 Day' },
  { value: 'plus_minus_3', label: '+/- 3 Days' },
  { value: 'plus_minus_7', label: '+/- 1 Week' },
  { value: 'any', label: 'Any Dates' },
];

const FLEXIBILITY_LABELS: Record<string, string> = {
  exact: 'Exact',
  plus_minus_1: '+/- 1d',
  plus_minus_3: '+/- 3d',
  plus_minus_7: '+/- 1w',
  any: 'Flexible',
};

const ACTIVE_STATUSES = ['waiting', 'offered'];
const HISTORY_STATUSES = ['booked', 'expired', 'canceled'];

// ═══════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatShortDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatWaitTime(createdAt: string): string {
  const created = new Date(createdAt).getTime();
  const now = Date.now();
  const diffMs = now - created;
  if (diffMs < 0) return '0m';

  const totalMinutes = Math.floor(diffMs / 60_000);
  if (totalMinutes < 60) return `${totalMinutes}m`;

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours < 24) return `${hours}h ${minutes}m`;

  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return `${days}d ${remHours}h`;
}

function formatAvgWait(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h < 24) return `${h}h ${m}m`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}

function _formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function priorityBadge(priority: number): { label: string; variant: string } {
  if (priority >= 7) return { label: `P${priority} High`, variant: 'error' };
  if (priority >= 4) return { label: `P${priority} Med`, variant: 'warning' };
  return { label: `P${priority}`, variant: 'neutral' };
}

// ═══════════════════════════════════════════════════════════════════
// Data Fetching
// ═══════════════════════════════════════════════════════════════════

function fetchWaitlist(propertyId: string, status?: string) {
  const qs = status
    ? `?propertyId=${propertyId}&status=${status}`
    : `?propertyId=${propertyId}`;
  return apiFetch<{ data: WaitlistEntry[] }>(`/api/v1/pms/waitlist${qs}`);
}

function fetchStats(propertyId: string) {
  return apiFetch<{ data: WaitlistStats }>(`/api/v1/pms/waitlist/stats?propertyId=${propertyId}`);
}

function fetchConfig(propertyId: string) {
  return apiFetch<{ data: WaitlistConfig }>(`/api/v1/pms/waitlist/config?propertyId=${propertyId}`);
}

// ═══════════════════════════════════════════════════════════════════
// Add to Waitlist Dialog
// ═══════════════════════════════════════════════════════════════════

interface AddDialogProps {
  open: boolean;
  onClose: () => void;
  propertyId: string;
  roomTypeOptions: { value: string; label: string }[];
  onCreated: () => void;
}

function AddToWaitlistDialog({ open, onClose, propertyId, roomTypeOptions, onCreated }: AddDialogProps) {
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);

  const [guestName, setGuestName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [roomTypeId, setRoomTypeId] = useState('');
  const [checkInDate, setCheckInDate] = useState('');
  const [checkOutDate, setCheckOutDate] = useState('');
  const [adults, setAdults] = useState(1);
  const [children, setChildren] = useState(0);
  const [flexibility, setFlexibility] = useState('exact');
  const [priority, setPriority] = useState(3);
  const [hasDeposit, setHasDeposit] = useState(false);
  const [notes, setNotes] = useState('');

  const resetForm = useCallback(() => {
    setGuestName('');
    setGuestEmail('');
    setGuestPhone('');
    setRoomTypeId('');
    setCheckInDate('');
    setCheckOutDate('');
    setAdults(1);
    setChildren(0);
    setFlexibility('exact');
    setPriority(3);
    setHasDeposit(false);
    setNotes('');
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!guestName.trim()) {
      toast.error('Guest name is required');
      return;
    }
    if (!roomTypeId) {
      toast.error('Please select a room type');
      return;
    }
    if (!checkInDate || !checkOutDate) {
      toast.error('Check-in and check-out dates are required');
      return;
    }
    if (new Date(checkOutDate) <= new Date(checkInDate)) {
      toast.error('Check-out must be after check-in');
      return;
    }

    setIsSaving(true);
    try {
      await apiFetch('/api/v1/pms/waitlist', {
        method: 'POST',
        body: JSON.stringify({
          propertyId,
          guestName: guestName.trim(),
          guestEmail: guestEmail.trim() || null,
          guestPhone: guestPhone.trim() || null,
          roomTypeId,
          checkInDate,
          checkOutDate,
          adults,
          children,
          flexibility,
          priority,
          hasDeposit,
          notes: notes.trim() || null,
        }),
      });
      toast.success('Guest added to waitlist');
      resetForm();
      onClose();
      onCreated();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to add to waitlist';
      toast.error(msg);
    } finally {
      setIsSaving(false);
    }
  }, [propertyId, guestName, guestEmail, guestPhone, roomTypeId, checkInDate, checkOutDate, adults, children, flexibility, priority, hasDeposit, notes, toast, resetForm, onClose, onCreated]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
        role="button"
        tabIndex={-1}
        aria-label="Close dialog"
      />

      <div className="relative z-10 mx-4 w-full max-w-lg rounded-xl border border-border bg-surface shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-lg font-semibold text-foreground">Add to Waitlist</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-muted-foreground hover:bg-accent/50 hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-[70vh] space-y-4 overflow-y-auto px-6 py-4">
          {/* Guest Name */}
          <div>
            <label htmlFor="wl-guest-name" className="mb-1 block text-sm font-medium text-foreground">
              Guest Name <span className="text-red-500">*</span>
            </label>
            <input
              id="wl-guest-name"
              type="text"
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              placeholder="Full name"
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          {/* Email + Phone */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="wl-email" className="mb-1 block text-sm font-medium text-foreground">Email</label>
              <input
                id="wl-email"
                type="email"
                value={guestEmail}
                onChange={(e) => setGuestEmail(e.target.value)}
                placeholder="guest@example.com"
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label htmlFor="wl-phone" className="mb-1 block text-sm font-medium text-foreground">Phone</label>
              <input
                id="wl-phone"
                type="tel"
                value={guestPhone}
                onChange={(e) => setGuestPhone(e.target.value)}
                placeholder="(555) 123-4567"
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* Room Type */}
          <div>
            {/* eslint-disable-next-line jsx-a11y/label-has-associated-control */}
            <label className="mb-1 block text-sm font-medium text-foreground">
              Room Type <span className="text-red-500">*</span>
            </label>
            <Select
              options={roomTypeOptions}
              value={roomTypeId}
              onChange={(v) => setRoomTypeId(v as string)}
              placeholder="Select room type"
              className="w-full"
            />
          </div>

          {/* Check-in / Check-out */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="wl-checkin" className="mb-1 block text-sm font-medium text-foreground">
                Check-in <span className="text-red-500">*</span>
              </label>
              <input
                id="wl-checkin"
                type="date"
                value={checkInDate}
                onChange={(e) => setCheckInDate(e.target.value)}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label htmlFor="wl-checkout" className="mb-1 block text-sm font-medium text-foreground">
                Check-out <span className="text-red-500">*</span>
              </label>
              <input
                id="wl-checkout"
                type="date"
                value={checkOutDate}
                onChange={(e) => setCheckOutDate(e.target.value)}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* Adults / Children */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="wl-adults" className="mb-1 block text-sm font-medium text-foreground">Adults</label>
              <input
                id="wl-adults"
                type="number"
                min={1}
                max={10}
                value={adults}
                onChange={(e) => setAdults(Math.max(1, Number(e.target.value)))}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label htmlFor="wl-children" className="mb-1 block text-sm font-medium text-foreground">Children</label>
              <input
                id="wl-children"
                type="number"
                min={0}
                max={10}
                value={children}
                onChange={(e) => setChildren(Math.max(0, Number(e.target.value)))}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* Flexibility */}
          <div>
            {/* eslint-disable-next-line jsx-a11y/label-has-associated-control */}
            <label className="mb-1 block text-sm font-medium text-foreground">Flexibility</label>
            <Select
              options={FLEXIBILITY_OPTIONS}
              value={flexibility}
              onChange={(v) => setFlexibility(v as string)}
              className="w-full"
            />
          </div>

          {/* Priority */}
          <div>
            <label htmlFor="wl-priority" className="mb-1 block text-sm font-medium text-foreground">
              Priority: {priority}
            </label>
            <input
              id="wl-priority"
              type="range"
              min={0}
              max={10}
              value={priority}
              onChange={(e) => setPriority(Number(e.target.value))}
              className="w-full accent-indigo-500"
            />
            <div className="mt-1 flex justify-between text-xs text-muted-foreground">
              <span>0 (Low)</span>
              <span>5 (Medium)</span>
              <span>10 (High)</span>
            </div>
          </div>

          {/* Deposit */}
          <div className="flex items-center gap-3">
            <input
              id="wl-deposit"
              type="checkbox"
              checked={hasDeposit}
              onChange={(e) => setHasDeposit(e.target.checked)}
              className="h-4 w-4 rounded border-border accent-indigo-500"
            />
            <label htmlFor="wl-deposit" className="text-sm font-medium text-foreground">
              Deposit collected
            </label>
          </div>

          {/* Notes */}
          <div>
            <label htmlFor="wl-notes" className="mb-1 block text-sm font-medium text-foreground">Notes</label>
            <textarea
              id="wl-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Special requests, preferences..."
              rows={3}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-border px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-accent/50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSaving}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
          >
            {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
            Add to Waitlist
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ═══════════════════════════════════════════════════════════════════
// Offer Slot Dialog
// ═══════════════════════════════════════════════════════════════════

interface OfferDialogProps {
  open: boolean;
  onClose: () => void;
  entry: WaitlistEntry | null;
  defaultExpiryHours: number;
  onOffered: () => void;
}

function OfferSlotDialog({ open, onClose, entry, defaultExpiryHours, onOffered }: OfferDialogProps) {
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [rateOverride, setRateOverride] = useState('');
  const [expiryHours, setExpiryHours] = useState(defaultExpiryHours);

  useEffect(() => {
    if (open && entry) {
      setRateOverride(entry.rateOverrideCents ? (entry.rateOverrideCents / 100).toFixed(2) : '');
      setExpiryHours(defaultExpiryHours);
    }
  }, [open, entry, defaultExpiryHours]);

  const handleSubmit = useCallback(async () => {
    if (!entry) return;

    setIsSaving(true);
    try {
      const rateOverrideCents = rateOverride
        ? Math.round(Number(rateOverride) * 100)
        : null;

      await apiFetch(`/api/v1/pms/waitlist/${entry.id}/offer`, {
        method: 'POST',
        body: JSON.stringify({
          rateOverrideCents,
          expiryHours,
        }),
      });
      toast.success('Offer sent to guest');
      onClose();
      onOffered();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to send offer';
      toast.error(msg);
    } finally {
      setIsSaving(false);
    }
  }, [entry, rateOverride, expiryHours, toast, onClose, onOffered]);

  if (!open || !entry) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
        role="button"
        tabIndex={-1}
        aria-label="Close dialog"
      />

      <div className="relative z-10 mx-4 w-full max-w-md rounded-xl border border-border bg-surface shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-lg font-semibold text-foreground">Offer Slot</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-muted-foreground hover:bg-accent/50 hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 px-6 py-4">
          {/* Entry summary */}
          <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
            <p className="font-medium text-foreground">{entry.guestName}</p>
            <p className="text-muted-foreground">
              {entry.roomTypeName ?? 'Room'} &middot; {formatShortDate(entry.checkInDate)} - {formatShortDate(entry.checkOutDate)}
            </p>
            <p className="text-muted-foreground">
              {entry.adults} adult{entry.adults !== 1 ? 's' : ''}{entry.children > 0 ? `, ${entry.children} child${entry.children !== 1 ? 'ren' : ''}` : ''}
            </p>
          </div>

          {/* Rate Override */}
          <div>
            <label htmlFor="offer-rate" className="mb-1 block text-sm font-medium text-foreground">
              Rate Override (optional)
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
              <input
                id="offer-rate"
                type="number"
                step="0.01"
                min="0"
                value={rateOverride}
                onChange={(e) => setRateOverride(e.target.value)}
                placeholder="Use default rate"
                className="w-full rounded-lg border border-border bg-surface py-2 pl-7 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Leave blank to use the standard nightly rate</p>
          </div>

          {/* Expiry Hours */}
          <div>
            <label htmlFor="offer-expiry" className="mb-1 block text-sm font-medium text-foreground">
              Offer Expires In (hours)
            </label>
            <input
              id="offer-expiry"
              type="number"
              min={1}
              max={168}
              value={expiryHours}
              onChange={(e) => setExpiryHours(Math.max(1, Number(e.target.value)))}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-border px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-accent/50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSaving}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
          >
            {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
            <Send className="h-4 w-4" />
            Send Offer
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ═══════════════════════════════════════════════════════════════════
// Actions Dropdown
// ═══════════════════════════════════════════════════════════════════

interface ActionsDropdownProps {
  entry: WaitlistEntry;
  onOffer: (entry: WaitlistEntry) => void;
  onRemove: (entry: WaitlistEntry) => void;
}

function ActionsDropdown({ entry, onOffer, onRemove }: ActionsDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isOpen]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent/50 hover:text-foreground"
        aria-label="Actions"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>

      {isOpen && (
        <div className="absolute right-0 z-20 mt-1 w-40 rounded-lg border border-border bg-surface py-1 shadow-lg">
          {entry.status === 'waiting' && (
            <button
              onClick={() => { setIsOpen(false); onOffer(entry); }}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-accent/50"
            >
              <Send className="h-4 w-4" />
              Offer Slot
            </button>
          )}
          <button
            onClick={() => { setIsOpen(false); onRemove(entry); }}
            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-500 hover:bg-accent/50"
          >
            <Trash2 className="h-4 w-4" />
            Remove
          </button>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// KPI Card
// ═══════════════════════════════════════════════════════════════════

interface KpiCardProps {
  icon: React.ElementType;
  label: string;
  value: string | number;
  color: string;
}

function KpiCard({ icon: Icon, label, value, color }: KpiCardProps) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-center gap-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${color}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <p className="text-xl font-bold text-foreground">{value}</p>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Waitlist Table
// ═══════════════════════════════════════════════════════════════════

interface WaitlistTableProps {
  entries: WaitlistEntry[];
  isLoading: boolean;
  showActions: boolean;
  showBookedAt: boolean;
  onOffer: (entry: WaitlistEntry) => void;
  onRemove: (entry: WaitlistEntry) => void;
}

function WaitlistTable({ entries, isLoading, showActions, showBookedAt, onOffer, onRemove }: WaitlistTableProps) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 rounded-lg border border-border p-4">
            <div className="h-4 w-28 animate-pulse rounded bg-muted" />
            <div className="h-4 w-20 animate-pulse rounded bg-muted" />
            <div className="h-4 w-24 animate-pulse rounded bg-muted" />
            <div className="h-4 w-16 animate-pulse rounded bg-muted" />
            <div className="h-4 w-16 animate-pulse rounded bg-muted" />
          </div>
        ))}
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <EmptyState
        icon={ClipboardList}
        title="No waitlist entries"
        description="There are no entries matching the current filters."
      />
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/30">
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">Guest Name</th>
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">Room Type</th>
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">Check-in</th>
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">Check-out</th>
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">Flexibility</th>
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">Priority</th>
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">
              {showBookedAt ? 'Resolved' : 'Wait Time'}
            </th>
            {showActions && (
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">Actions</th>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {entries.map((entry) => {
            const statusBadge = STATUS_BADGES[entry.status] ?? STATUS_BADGES.waiting!;
            const priBadge = priorityBadge(entry.priority);

            return (
              <tr key={entry.id} className="transition-colors hover:bg-muted/20">
                <td className="px-4 py-3">
                  <div>
                    <span className="font-medium text-foreground">{entry.guestName}</span>
                    {(entry.guestEmail || entry.guestPhone) && (
                      <p className="text-xs text-muted-foreground">
                        {entry.guestEmail ?? entry.guestPhone}
                      </p>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 text-foreground">
                  {entry.roomTypeName ?? '-'}
                </td>
                <td className="px-4 py-3 text-foreground">
                  {formatShortDate(entry.checkInDate)}
                </td>
                <td className="px-4 py-3 text-foreground">
                  {formatShortDate(entry.checkOutDate)}
                </td>
                <td className="px-4 py-3 text-foreground">
                  {FLEXIBILITY_LABELS[entry.flexibility] ?? entry.flexibility}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <Badge variant={priBadge.variant}>{priBadge.label}</Badge>
                    {entry.hasDeposit && (
                      <span className="text-xs text-green-500" title="Deposit collected">$</span>
                    )}
                    {entry.isLoyaltyMember && (
                      <span className="text-xs text-amber-500" title="Loyalty member">L</span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <Badge variant={statusBadge.variant}>{statusBadge.label}</Badge>
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {showBookedAt && entry.bookedAt
                    ? formatDate(entry.bookedAt)
                    : formatWaitTime(entry.createdAt)}
                </td>
                {showActions && (
                  <td className="px-4 py-3 text-right">
                    <ActionsDropdown entry={entry} onOffer={onOffer} onRemove={onRemove} />
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Settings Tab
// ═══════════════════════════════════════════════════════════════════

interface SettingsTabProps {
  propertyId: string;
}

function SettingsTab({ propertyId }: SettingsTabProps) {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [_config, setConfig] = useState<WaitlistConfig | null>(null);

  // Form state
  const [enabled, setEnabled] = useState(false);
  const [offerExpiryHours, setOfferExpiryHours] = useState(24);
  const [autoOffer, setAutoOffer] = useState(false);
  const [headline, setHeadline] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [primaryColor, setPrimaryColor] = useState('#4F46E5');
  const [accentColor, setAccentColor] = useState('#818CF8');
  const [logoUrl, setLogoUrl] = useState('');
  const [requireEmail, setRequireEmail] = useState(true);
  const [requirePhone, setRequirePhone] = useState(false);
  const [showRates, setShowRates] = useState(false);
  const [maxAdvanceDays, setMaxAdvanceDays] = useState(90);
  const [termsText, setTermsText] = useState('');

  const loadConfig = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await fetchConfig(propertyId);
      const c = result.data;
      setConfig(c);
      setEnabled(c.enabled);
      setOfferExpiryHours(c.offerExpiryHours);
      setAutoOffer(c.autoOffer);
      setHeadline(c.headline);
      setSubtitle(c.subtitle);
      setPrimaryColor(c.primaryColor);
      setAccentColor(c.accentColor);
      setLogoUrl(c.logoUrl);
      setRequireEmail(c.requireEmail);
      setRequirePhone(c.requirePhone);
      setShowRates(c.showRates);
      setMaxAdvanceDays(c.maxAdvanceDays);
      setTermsText(c.termsText);
    } catch {
      // Config may not exist yet — use defaults
      setConfig(null);
    } finally {
      setIsLoading(false);
    }
  }, [propertyId]);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    try {
      await apiFetch('/api/v1/pms/waitlist/config', {
        method: 'PUT',
        body: JSON.stringify({
          propertyId,
          enabled,
          offerExpiryHours,
          autoOffer,
          headline: headline.trim(),
          subtitle: subtitle.trim(),
          primaryColor,
          accentColor,
          logoUrl: logoUrl.trim(),
          requireEmail,
          requirePhone,
          showRates,
          maxAdvanceDays,
          termsText: termsText.trim(),
        }),
      });
      toast.success('Waitlist settings saved');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save settings';
      toast.error(msg);
    } finally {
      setIsSaving(false);
    }
  }, [propertyId, enabled, offerExpiryHours, autoOffer, headline, subtitle, primaryColor, accentColor, logoUrl, requireEmail, requirePhone, showRates, maxAdvanceDays, termsText, toast]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-10 w-full animate-pulse rounded bg-muted" />
        ))}
      </div>
    );
  }

  const inputClass = 'w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500';

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* General */}
      <div className="rounded-xl border border-border bg-surface p-6">
        <h3 className="mb-4 text-base font-semibold text-foreground">General</h3>

        <div className="space-y-4">
          {/* Enabled */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">Enable Waitlist</p>
              <p className="text-xs text-muted-foreground">Allow guests to join the waitlist for sold-out dates</p>
            </div>
            <button
              onClick={() => setEnabled(!enabled)}
              className={`relative h-6 w-11 rounded-full transition-colors ${enabled ? 'bg-indigo-600' : 'bg-muted'}`}
              role="switch"
              aria-checked={enabled}
            >
              <span
                className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-foreground transition-transform ${enabled ? 'translate-x-5' : 'translate-x-0'}`}
              />
            </button>
          </div>

          {/* Offer Expiry */}
          <div>
            <label htmlFor="cfg-expiry" className="mb-1 block text-sm font-medium text-foreground">
              Offer Expiry (hours)
            </label>
            <input
              id="cfg-expiry"
              type="number"
              min={1}
              max={168}
              value={offerExpiryHours}
              onChange={(e) => setOfferExpiryHours(Math.max(1, Number(e.target.value)))}
              className={inputClass}
            />
            <p className="mt-1 text-xs text-muted-foreground">How long guests have to accept an offer before it expires</p>
          </div>

          {/* Auto Offer */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">Auto-Offer</p>
              <p className="text-xs text-muted-foreground">Automatically send offers when rooms become available</p>
            </div>
            <button
              onClick={() => setAutoOffer(!autoOffer)}
              className={`relative h-6 w-11 rounded-full transition-colors ${autoOffer ? 'bg-indigo-600' : 'bg-muted'}`}
              role="switch"
              aria-checked={autoOffer}
            >
              <span
                className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-foreground transition-transform ${autoOffer ? 'translate-x-5' : 'translate-x-0'}`}
              />
            </button>
          </div>
        </div>
      </div>

      {/* Branding */}
      <div className="rounded-xl border border-border bg-surface p-6">
        <h3 className="mb-4 text-base font-semibold text-foreground">Branding</h3>

        <div className="space-y-4">
          <div>
            <label htmlFor="cfg-headline" className="mb-1 block text-sm font-medium text-foreground">Headline</label>
            <input
              id="cfg-headline"
              type="text"
              value={headline}
              onChange={(e) => setHeadline(e.target.value)}
              placeholder="Join our waitlist"
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="cfg-subtitle" className="mb-1 block text-sm font-medium text-foreground">Subtitle</label>
            <input
              id="cfg-subtitle"
              type="text"
              value={subtitle}
              onChange={(e) => setSubtitle(e.target.value)}
              placeholder="We'll notify you when a room becomes available"
              className={inputClass}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="cfg-primary" className="mb-1 block text-sm font-medium text-foreground">Primary Color</label>
              <div className="flex items-center gap-2">
                <input
                  id="cfg-primary"
                  type="color"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="h-9 w-12 cursor-pointer rounded border border-border bg-surface"
                />
                <input
                  type="text"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className={`${inputClass} flex-1`}
                />
              </div>
            </div>
            <div>
              <label htmlFor="cfg-accent" className="mb-1 block text-sm font-medium text-foreground">Accent Color</label>
              <div className="flex items-center gap-2">
                <input
                  id="cfg-accent"
                  type="color"
                  value={accentColor}
                  onChange={(e) => setAccentColor(e.target.value)}
                  className="h-9 w-12 cursor-pointer rounded border border-border bg-surface"
                />
                <input
                  type="text"
                  value={accentColor}
                  onChange={(e) => setAccentColor(e.target.value)}
                  className={`${inputClass} flex-1`}
                />
              </div>
            </div>
          </div>

          <div>
            <label htmlFor="cfg-logo" className="mb-1 block text-sm font-medium text-foreground">Logo URL</label>
            <input
              id="cfg-logo"
              type="url"
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              placeholder="https://example.com/logo.png"
              className={inputClass}
            />
          </div>
        </div>
      </div>

      {/* Form Settings */}
      <div className="rounded-xl border border-border bg-surface p-6">
        <h3 className="mb-4 text-base font-semibold text-foreground">Form Settings</h3>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">Require Email</p>
              <p className="text-xs text-muted-foreground">Guests must provide an email address</p>
            </div>
            <button
              onClick={() => setRequireEmail(!requireEmail)}
              className={`relative h-6 w-11 rounded-full transition-colors ${requireEmail ? 'bg-indigo-600' : 'bg-muted'}`}
              role="switch"
              aria-checked={requireEmail}
            >
              <span
                className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-foreground transition-transform ${requireEmail ? 'translate-x-5' : 'translate-x-0'}`}
              />
            </button>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">Require Phone</p>
              <p className="text-xs text-muted-foreground">Guests must provide a phone number</p>
            </div>
            <button
              onClick={() => setRequirePhone(!requirePhone)}
              className={`relative h-6 w-11 rounded-full transition-colors ${requirePhone ? 'bg-indigo-600' : 'bg-muted'}`}
              role="switch"
              aria-checked={requirePhone}
            >
              <span
                className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-foreground transition-transform ${requirePhone ? 'translate-x-5' : 'translate-x-0'}`}
              />
            </button>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">Show Rates</p>
              <p className="text-xs text-muted-foreground">Display nightly rates on the waitlist form</p>
            </div>
            <button
              onClick={() => setShowRates(!showRates)}
              className={`relative h-6 w-11 rounded-full transition-colors ${showRates ? 'bg-indigo-600' : 'bg-muted'}`}
              role="switch"
              aria-checked={showRates}
            >
              <span
                className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-foreground transition-transform ${showRates ? 'translate-x-5' : 'translate-x-0'}`}
              />
            </button>
          </div>

          <div>
            <label htmlFor="cfg-maxdays" className="mb-1 block text-sm font-medium text-foreground">
              Max Advance Days
            </label>
            <input
              id="cfg-maxdays"
              type="number"
              min={1}
              max={365}
              value={maxAdvanceDays}
              onChange={(e) => setMaxAdvanceDays(Math.max(1, Number(e.target.value)))}
              className={inputClass}
            />
            <p className="mt-1 text-xs text-muted-foreground">How far ahead guests can request dates</p>
          </div>

          <div>
            <label htmlFor="cfg-terms" className="mb-1 block text-sm font-medium text-foreground">
              Terms &amp; Conditions
            </label>
            <textarea
              id="cfg-terms"
              value={termsText}
              onChange={(e) => setTermsText(e.target.value)}
              placeholder="By joining the waitlist, you agree to..."
              rows={4}
              className={inputClass}
            />
          </div>
        </div>
      </div>

      {/* Save */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="flex items-center gap-2 rounded-lg bg-indigo-600 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
        >
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save Settings
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════════════════════════

export default function WaitlistContent() {
  const { toast } = useToast();
  const { data: properties, isLoading: propsLoading } = useProperties();
  const [selectedPropertyId, setSelectedPropertyId] = useState('');
  const [activeTab, setActiveTab] = useState<'queue' | 'history' | 'settings'>('queue');

  // Filters
  const [statusFilter, setStatusFilter] = useState('');
  const [roomTypeFilter, setRoomTypeFilter] = useState('');

  // Data
  const [entries, setEntries] = useState<WaitlistEntry[]>([]);
  const [stats, setStats] = useState<WaitlistStats | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [configExpiryHours, setConfigExpiryHours] = useState(24);

  // Dialogs
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [offerEntry, setOfferEntry] = useState<WaitlistEntry | null>(null);

  // Room types
  const { data: roomTypes } = useRoomTypes(selectedPropertyId || null);

  // Auto-select first property
  useEffect(() => {
    if (properties.length > 0 && !selectedPropertyId) {
      setSelectedPropertyId(properties[0]!.id);
    }
  }, [properties, selectedPropertyId]);

  const propertyOptions = useMemo(
    () => properties.map((p) => ({ value: p.id, label: p.name })),
    [properties],
  );

  const roomTypeOptions = useMemo(
    () => roomTypes.map((rt) => ({ value: rt.id, label: rt.name })),
    [roomTypes],
  );

  const roomTypeFilterOptions = useMemo(
    () => [{ value: '', label: 'All Room Types' }, ...roomTypeOptions],
    [roomTypeOptions],
  );

  // ── Data Loading ──────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    if (!selectedPropertyId) return;
    setIsLoading(true);
    try {
      const [entriesResult, statsResult] = await Promise.all([
        fetchWaitlist(selectedPropertyId, statusFilter || undefined),
        fetchStats(selectedPropertyId),
      ]);
      setEntries(entriesResult.data);
      setStats(statsResult.data);
    } catch {
      // API may not exist yet
      setEntries([]);
      setStats(null);
    } finally {
      setIsLoading(false);
    }
  }, [selectedPropertyId, statusFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Load config expiry for offer dialog default
  useEffect(() => {
    if (!selectedPropertyId) return;
    fetchConfig(selectedPropertyId)
      .then((r) => setConfigExpiryHours(r.data.offerExpiryHours))
      .catch(() => setConfigExpiryHours(24));
  }, [selectedPropertyId]);

  // ── Filtered Entries ──────────────────────────────────────────────

  const filteredEntries = useMemo(() => {
    let filtered = entries;

    // Tab-based filtering
    if (activeTab === 'queue') {
      filtered = filtered.filter((e) => ACTIVE_STATUSES.includes(e.status));
    } else if (activeTab === 'history') {
      filtered = filtered.filter((e) => HISTORY_STATUSES.includes(e.status));
    }

    // Room type filter
    if (roomTypeFilter) {
      filtered = filtered.filter((e) => e.roomTypeId === roomTypeFilter);
    }

    return filtered;
  }, [entries, activeTab, roomTypeFilter]);

  // ── Handlers ──────────────────────────────────────────────────────

  const handleRemove = useCallback(async (entry: WaitlistEntry) => {
    if (!confirm(`Remove ${entry.guestName} from the waitlist?`)) return;

    try {
      await apiFetch(`/api/v1/pms/waitlist/${entry.id}`, { method: 'DELETE' });
      toast.success('Entry removed from waitlist');
      loadData();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to remove entry';
      toast.error(msg);
    }
  }, [toast, loadData]);

  // ── Render ────────────────────────────────────────────────────────

  if (propsLoading) {
    return (
      <div className="space-y-6">
        <div className="h-7 w-48 animate-pulse rounded bg-muted" />
        <div className="grid grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
        <div className="h-64 animate-pulse rounded-xl bg-muted" />
      </div>
    );
  }

  if (properties.length === 0) {
    return (
      <EmptyState
        icon={ClipboardList}
        title="No properties configured"
        description="Create a property in the PMS settings to manage your waitlist."
      />
    );
  }

  const tabs = [
    { key: 'queue' as const, label: 'Active Queue' },
    { key: 'history' as const, label: 'History' },
    { key: 'settings' as const, label: 'Settings' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <ClipboardList className="h-6 w-6 text-indigo-500" />
          <h1 className="text-xl font-bold text-foreground">Waitlist Management</h1>
        </div>

        <div className="flex items-center gap-3">
          {/* Property Selector */}
          {properties.length > 1 && (
            <div className="w-56">
              <Select
                options={propertyOptions}
                value={selectedPropertyId}
                onChange={(v) => setSelectedPropertyId(v as string)}
                placeholder="Select property"
              />
            </div>
          )}

          <button
            onClick={() => setAddDialogOpen(true)}
            disabled={!selectedPropertyId}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            Add to Waitlist
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <KpiCard
          icon={Clock}
          label="Waiting"
          value={stats?.waiting ?? 0}
          color="bg-amber-500/10 text-amber-500"
        />
        <KpiCard
          icon={Send}
          label="Offered"
          value={stats?.offered ?? 0}
          color="bg-blue-500/10 text-blue-500"
        />
        <KpiCard
          icon={Users}
          label="Booked"
          value={stats?.booked ?? 0}
          color="bg-green-500/10 text-green-500"
        />
        <KpiCard
          icon={TrendingUp}
          label="Conversion Rate"
          value={stats ? `${stats.conversionRate.toFixed(1)}%` : '0%'}
          color="bg-indigo-500/10 text-indigo-500"
        />
        <KpiCard
          icon={Timer}
          label="Avg Wait"
          value={stats ? formatAvgWait(stats.avgWaitMinutes) : '0m'}
          color="bg-purple-500/10 text-purple-500"
        />
      </div>

      {/* Tab Bar */}
      <div className="flex items-center gap-6 border-b border-border">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`border-b-2 px-1 pb-3 text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? 'border-indigo-500 text-indigo-500'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'settings' ? (
        <SettingsTab propertyId={selectedPropertyId} />
      ) : (
        <>
          {/* Filter Bar */}
          <div className="flex flex-wrap items-center gap-3">
            {activeTab === 'queue' && (
              <div className="w-44">
                <Select
                  options={STATUS_OPTIONS.filter((o) =>
                    !o.value || ACTIVE_STATUSES.includes(o.value),
                  )}
                  value={statusFilter}
                  onChange={(v) => setStatusFilter(v as string)}
                  placeholder="All Statuses"
                />
              </div>
            )}
            {activeTab === 'history' && (
              <div className="w-44">
                <Select
                  options={STATUS_OPTIONS.filter((o) =>
                    !o.value || HISTORY_STATUSES.includes(o.value),
                  )}
                  value={statusFilter}
                  onChange={(v) => setStatusFilter(v as string)}
                  placeholder="All Statuses"
                />
              </div>
            )}
            <div className="w-48">
              <Select
                options={roomTypeFilterOptions}
                value={roomTypeFilter}
                onChange={(v) => setRoomTypeFilter(v as string)}
                placeholder="All Room Types"
              />
            </div>
            <span className="text-sm text-muted-foreground">
              {filteredEntries.length} {filteredEntries.length === 1 ? 'entry' : 'entries'}
            </span>
          </div>

          {/* Table */}
          <WaitlistTable
            entries={filteredEntries}
            isLoading={isLoading}
            showActions={activeTab === 'queue'}
            showBookedAt={activeTab === 'history'}
            onOffer={(entry) => setOfferEntry(entry)}
            onRemove={handleRemove}
          />
        </>
      )}

      {/* Dialogs */}
      <AddToWaitlistDialog
        open={addDialogOpen}
        onClose={() => setAddDialogOpen(false)}
        propertyId={selectedPropertyId}
        roomTypeOptions={roomTypeOptions}
        onCreated={loadData}
      />

      <OfferSlotDialog
        open={!!offerEntry}
        onClose={() => setOfferEntry(null)}
        entry={offerEntry}
        defaultExpiryHours={configExpiryHours}
        onOffered={loadData}
      />
    </div>
  );
}
