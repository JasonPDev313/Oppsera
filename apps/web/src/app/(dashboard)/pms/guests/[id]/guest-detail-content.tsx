'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  User,
  Mail,
  Phone,
  MapPin,
  Star,
  Calendar,
  Loader2,
  StickyNote,
  Pencil,
  Check,
  X,
} from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast';

// ── Types ────────────────────────────────────────────────────────

interface GuestReservation {
  id: string;
  confirmationNumber: string | null;
  roomTypeName: string | null;
  roomNumber: string | null;
  checkInDate: string;
  checkOutDate: string;
  status: string;
  nightlyRateCents: number;
  totalCents: number;
}

interface GuestDetail {
  id: string;
  tenantId: string;
  propertyId: string;
  customerId: string | null;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  addressJson: { line1?: string; line2?: string; city?: string; state?: string; zip?: string; country?: string } | null;
  preferencesJson: Record<string, unknown> | null;
  notes: string | null;
  totalStays: number;
  lastStayDate: string | null;
  isVip: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
  recentReservations: GuestReservation[];
}

// ── Constants ────────────────────────────────────────────────────

const RES_STATUS_BADGES: Record<string, { label: string; variant: string }> = {
  HOLD: { label: 'Hold', variant: 'warning' },
  CONFIRMED: { label: 'Confirmed', variant: 'success' },
  CHECKED_IN: { label: 'Checked In', variant: 'info' },
  CHECKED_OUT: { label: 'Checked Out', variant: 'neutral' },
  CANCELLED: { label: 'Cancelled', variant: 'error' },
  NO_SHOW: { label: 'No Show', variant: 'orange' },
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

function formatAddress(addr: GuestDetail['addressJson']): string | null {
  if (!addr) return null;
  const parts = [addr.line1, addr.line2, addr.city, addr.state, addr.zip, addr.country].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : null;
}

// ── Component ────────────────────────────────────────────────────

export default function GuestDetailContent() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const guestId = Array.isArray(params.id) ? params.id[0] : (params.id ?? '');

  const [guest, setGuest] = useState<GuestDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edit state
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({ firstName: '', lastName: '', email: '', phone: '', notes: '' });
  const [isSaving, setIsSaving] = useState(false);

  const fetchGuest = useCallback(async (signal?: AbortSignal) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ data: GuestDetail }>(`/api/v1/pms/guests/${guestId}`, { signal });
      setGuest(res.data);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setError('Failed to load guest');
    } finally {
      setIsLoading(false);
    }
  }, [guestId]);

  useEffect(() => {
    const ac = new AbortController();
    fetchGuest(ac.signal);
    return () => ac.abort();
  }, [fetchGuest]);

  const startEdit = useCallback(() => {
    if (!guest) return;
    setEditForm({
      firstName: guest.firstName,
      lastName: guest.lastName,
      email: guest.email ?? '',
      phone: guest.phone ?? '',
      notes: guest.notes ?? '',
    });
    setIsEditing(true);
  }, [guest]);

  const cancelEdit = useCallback(() => {
    setIsEditing(false);
  }, []);

  const saveEdit = useCallback(async () => {
    if (!guest) return;
    const trimmedFirst = editForm.firstName.trim();
    const trimmedLast = editForm.lastName.trim();
    if (!trimmedFirst || !trimmedLast) {
      toast.error('First and last name are required');
      return;
    }
    setIsSaving(true);
    try {
      await apiFetch(`/api/v1/pms/guests/${guestId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          firstName: trimmedFirst,
          lastName: trimmedLast,
          email: editForm.email.trim() || null,
          phone: editForm.phone.trim() || null,
          notes: editForm.notes.trim() || null,
        }),
      });
      toast.success('Guest updated');
      setIsEditing(false);
      fetchGuest();
    } catch (err) {
      const e = err instanceof Error ? err : new Error('Failed to update guest');
      toast.error(e.message);
    } finally {
      setIsSaving(false);
    }
  }, [guest, guestId, editForm, fetchGuest, toast]);

  // ── Loading / Error ──

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !guest) {
    return (
      <div className="space-y-4">
        <button onClick={() => router.push('/pms/guests')} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to Guests
        </button>
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-500">
          {error ?? 'Guest not found'}
        </div>
      </div>
    );
  }

  const address = formatAddress(guest.addressJson);

  return (
    <div className="space-y-6">
      {/* Back button + Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/pms/guests')} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <User className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-xl font-semibold text-foreground">
            {guest.firstName} {guest.lastName}
          </h1>
          {guest.isVip && (
            <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
          )}
        </div>
        <div className="flex items-center gap-2">
          {isEditing ? (
            <>
              <button onClick={cancelEdit} className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent/50">
                <X className="h-3.5 w-3.5" /> Cancel
              </button>
              <button onClick={saveEdit} disabled={isSaving} className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50">
                {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                Save
              </button>
            </>
          ) : (
            <button onClick={startEdit} className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent/50">
              <Pencil className="h-3.5 w-3.5" /> Edit
            </button>
          )}
        </div>
      </div>

      {/* Guest Info Card */}
      <div className="rounded-lg border border-border bg-surface p-5">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Guest Information
        </h2>
        {isEditing ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="edit-firstName" className="mb-1 block text-xs font-medium text-muted-foreground">First Name</label>
              <input id="edit-firstName" type="text" value={editForm.firstName} onChange={(e) => setEditForm((f) => ({ ...f, firstName: e.target.value }))} className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground focus:border-indigo-500/30 focus:outline-none focus:ring-1 focus:ring-indigo-300" />
            </div>
            <div>
              <label htmlFor="edit-lastName" className="mb-1 block text-xs font-medium text-muted-foreground">Last Name</label>
              <input id="edit-lastName" type="text" value={editForm.lastName} onChange={(e) => setEditForm((f) => ({ ...f, lastName: e.target.value }))} className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground focus:border-indigo-500/30 focus:outline-none focus:ring-1 focus:ring-indigo-300" />
            </div>
            <div>
              <label htmlFor="edit-email" className="mb-1 block text-xs font-medium text-muted-foreground">Email</label>
              <input id="edit-email" type="email" value={editForm.email} onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))} className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground focus:border-indigo-500/30 focus:outline-none focus:ring-1 focus:ring-indigo-300" />
            </div>
            <div>
              <label htmlFor="edit-phone" className="mb-1 block text-xs font-medium text-muted-foreground">Phone</label>
              <input id="edit-phone" type="tel" value={editForm.phone} onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))} className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground focus:border-indigo-500/30 focus:outline-none focus:ring-1 focus:ring-indigo-300" />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="edit-notes" className="mb-1 block text-xs font-medium text-muted-foreground">Notes</label>
              <textarea id="edit-notes" rows={3} value={editForm.notes} onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))} className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground focus:border-indigo-500/30 focus:outline-none focus:ring-1 focus:ring-indigo-300" />
            </div>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <InfoRow icon={<User className="h-4 w-4" />} label="Name" value={`${guest.firstName} ${guest.lastName}`} />
            <InfoRow icon={<Mail className="h-4 w-4" />} label="Email" value={guest.email} />
            <InfoRow icon={<Phone className="h-4 w-4" />} label="Phone" value={guest.phone} />
            {address && <InfoRow icon={<MapPin className="h-4 w-4" />} label="Address" value={address} />}
            <InfoRow icon={<Calendar className="h-4 w-4" />} label="Total Stays" value={String(guest.totalStays)} />
            <InfoRow icon={<Calendar className="h-4 w-4" />} label="Last Stay" value={guest.lastStayDate ? formatDate(guest.lastStayDate) : null} />
            {guest.notes && (
              <div className="sm:col-span-2">
                <InfoRow icon={<StickyNote className="h-4 w-4" />} label="Notes" value={guest.notes} />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Preferences */}
      {guest.preferencesJson && Object.keys(guest.preferencesJson).length > 0 && (
        <div className="rounded-lg border border-border bg-surface p-5">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Preferences
          </h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {Object.entries(guest.preferencesJson).map(([key, value]) => (
              <div key={key} className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}:</span>
                <span className="text-foreground">{typeof value === 'object' ? JSON.stringify(value) : String(value)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stay History */}
      <div className="rounded-lg border border-border bg-surface p-5">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Stay History
        </h2>
        {guest.recentReservations.length === 0 ? (
          <p className="text-sm text-muted-foreground">No reservation history.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] border-collapse">
              <thead>
                <tr>
                  <th className="border-b border-border px-3 py-2 text-left text-xs font-medium text-muted-foreground">Confirmation</th>
                  <th className="border-b border-border px-3 py-2 text-left text-xs font-medium text-muted-foreground">Room Type</th>
                  <th className="border-b border-border px-3 py-2 text-left text-xs font-medium text-muted-foreground">Room</th>
                  <th className="border-b border-border px-3 py-2 text-left text-xs font-medium text-muted-foreground">Check-in</th>
                  <th className="border-b border-border px-3 py-2 text-left text-xs font-medium text-muted-foreground">Check-out</th>
                  <th className="border-b border-border px-3 py-2 text-center text-xs font-medium text-muted-foreground">Status</th>
                  <th className="border-b border-border px-3 py-2 text-right text-xs font-medium text-muted-foreground">Rate/Night</th>
                  <th className="border-b border-border px-3 py-2 text-right text-xs font-medium text-muted-foreground">Total</th>
                </tr>
              </thead>
              <tbody>
                {guest.recentReservations.map((r) => {
                  const badge = RES_STATUS_BADGES[r.status] ?? { label: r.status, variant: 'neutral' };
                  return (
                    <tr
                      key={r.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => router.push(`/pms/reservations/${r.id}`)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); router.push(`/pms/reservations/${r.id}`); } }}
                      className="cursor-pointer hover:bg-accent/30 transition-colors"
                    >
                      <td className="border-b border-border px-3 py-2.5 text-sm text-foreground">
                        {r.confirmationNumber ?? '\u2014'}
                      </td>
                      <td className="border-b border-border px-3 py-2.5 text-sm text-muted-foreground">
                        {r.roomTypeName ?? '\u2014'}
                      </td>
                      <td className="border-b border-border px-3 py-2.5 text-sm text-muted-foreground">
                        {r.roomNumber ?? '\u2014'}
                      </td>
                      <td className="border-b border-border px-3 py-2.5 text-sm text-muted-foreground">
                        {formatDate(r.checkInDate)}
                      </td>
                      <td className="border-b border-border px-3 py-2.5 text-sm text-muted-foreground">
                        {formatDate(r.checkOutDate)}
                      </td>
                      <td className="border-b border-border px-3 py-2.5 text-center">
                        <Badge variant={badge.variant as 'success' | 'warning' | 'error' | 'info' | 'neutral' | 'orange'}>
                          {badge.label}
                        </Badge>
                      </td>
                      <td className="border-b border-border px-3 py-2.5 text-right text-sm text-muted-foreground">
                        {formatMoney(r.nightlyRateCents)}
                      </td>
                      <td className="border-b border-border px-3 py-2.5 text-right text-sm font-medium text-foreground">
                        {formatMoney(r.totalCents)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Meta */}
      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span>Created {formatDate(guest.createdAt)}</span>
        <span>Updated {formatDate(guest.updatedAt)}</span>
        <span>ID: {guest.id}</span>
      </div>
    </div>
  );
}

// ── Info Row ──────────────────────────────────────────────────────

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | null }) {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-0.5 text-muted-foreground">{icon}</span>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm text-foreground">{value ?? '\u2014'}</p>
      </div>
    </div>
  );
}
