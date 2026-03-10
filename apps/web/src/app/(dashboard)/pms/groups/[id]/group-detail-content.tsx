'use client';

import { useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Users,
  Grid3X3,
  List,
  Receipt,
  TrendingUp,
  CheckCircle,
  XCircle,
  Copy,
  Save,
  RefreshCw,
  AlertTriangle,
} from 'lucide-react';
import { useFetch } from '@/hooks/use-fetch';
import { useMutation } from '@/hooks/use-mutation';
import type {
  GroupDetail,
  GroupRoomMatrixResult,
  GroupRoomMatrixRoomType,
  GroupRoomMatrixCell,
  GetGroupRoomingListResult,
  RoomingListReservation,
  GroupProjectedRevenueResult,
  GroupRevenueByRoomType,
} from '@oppsera/module-pms';

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatMoney(cents: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

function formatDate(d: string | null | undefined) {
  if (!d) return '—';
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function statusBadge(status: string) {
  const colors: Record<string, string> = {
    tentative: 'bg-amber-900/40 text-amber-300 border border-amber-700',
    definite: 'bg-green-900/40 text-green-300 border border-green-700',
    cancelled: 'bg-red-900/40 text-red-300 border border-red-700',
  };
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${colors[status] ?? 'bg-zinc-800 text-zinc-300'}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

function resvStatusBadge(status: string) {
  const colors: Record<string, string> = {
    CONFIRMED: 'bg-blue-900/40 text-blue-300',
    HOLD: 'bg-amber-900/40 text-amber-300',
    CHECKED_IN: 'bg-green-900/40 text-green-300',
    CHECKED_OUT: 'bg-zinc-700 text-zinc-300',
    CANCELLED: 'bg-red-900/40 text-red-300',
    NO_SHOW: 'bg-orange-900/40 text-orange-300',
  };
  return (
    <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${colors[status] ?? 'bg-zinc-800 text-zinc-300'}`}>
      {status.replace('_', ' ')}
    </span>
  );
}

// ── Tabs ──────────────────────────────────────────────────────────────────────

type Tab = 'info' | 'matrix' | 'rooming' | 'revenue';

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'info', label: 'Group Info', icon: <Users className="w-4 h-4" /> },
  { id: 'matrix', label: 'Room Matrix', icon: <Grid3X3 className="w-4 h-4" /> },
  { id: 'rooming', label: 'Rooming List', icon: <List className="w-4 h-4" /> },
  { id: 'revenue', label: 'Projected Revenue', icon: <TrendingUp className="w-4 h-4" /> },
];

// ── Group Info Tab ─────────────────────────────────────────────────────────────

function GroupInfoTab({ group, onSaved }: { group: GroupDetail; onSaved: () => void }) {
  const [form, setForm] = useState({
    name: group.name,
    groupCode: group.groupCode ?? '',
    groupType: group.groupType,
    contactName: group.contactName ?? '',
    contactEmail: group.contactEmail ?? '',
    contactPhone: group.contactPhone ?? '',
    source: group.source ?? '',
    market: group.market ?? '',
    bookingMethod: group.bookingMethod ?? '',
    ratePlanId: group.ratePlanId ?? '',
    negotiatedRate: group.negotiatedRateCents != null ? (group.negotiatedRateCents / 100).toFixed(2) : '',
    billingType: group.billingType,
    status: group.status,
    cutoffDate: group.cutoffDate ?? '',
    autoReleaseAtCutoff: group.autoReleaseAtCutoff,
    shoulderDatesEnabled: group.shoulderDatesEnabled,
    shoulderStartDate: group.shoulderStartDate ?? '',
    shoulderEndDate: group.shoulderEndDate ?? '',
    shoulderRate: group.shoulderRateCents != null ? (group.shoulderRateCents / 100).toFixed(2) : '',
    autoRoutePackagesToMaster: group.autoRoutePackagesToMaster,
    autoRouteSpecialsToMaster: group.autoRouteSpecialsToMaster,
    specialRequests: group.specialRequests ?? '',
    groupComments: group.groupComments ?? '',
    reservationComments: group.reservationComments ?? '',
    notes: group.notes ?? '',
  });

  const { mutate: save, isLoading, error } = useMutation(async (data: typeof form) => {
    const res = await fetch(`/api/v1/pms/groups/${group.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: data.name || undefined,
        groupCode: data.groupCode || undefined,
        groupType: data.groupType || undefined,
        contactName: data.contactName || null,
        contactEmail: data.contactEmail || null,
        contactPhone: data.contactPhone || null,
        source: data.source || null,
        market: data.market || null,
        bookingMethod: data.bookingMethod || null,
        negotiatedRateCents: data.negotiatedRate ? Math.round(parseFloat(data.negotiatedRate) * 100) : undefined,
        billingType: data.billingType || undefined,
        status: data.status || undefined,
        cutoffDate: data.cutoffDate || null,
        autoReleaseAtCutoff: data.autoReleaseAtCutoff,
        shoulderDatesEnabled: data.shoulderDatesEnabled,
        shoulderStartDate: data.shoulderStartDate || null,
        shoulderEndDate: data.shoulderEndDate || null,
        shoulderRateCents: data.shoulderRate ? Math.round(parseFloat(data.shoulderRate) * 100) : null,
        autoRoutePackagesToMaster: data.autoRoutePackagesToMaster,
        autoRouteSpecialsToMaster: data.autoRouteSpecialsToMaster,
        specialRequests: data.specialRequests || null,
        groupComments: data.groupComments || null,
        reservationComments: data.reservationComments || null,
        notes: data.notes || null,
        version: group.version,
      }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err?.error?.message ?? 'Save failed');
    }
    return res.json();
  });

  const handleSave = async () => {
    await save(form);
    onSaved();
  };

  const set = (key: keyof typeof form, value: unknown) =>
    setForm((f) => ({ ...f, [key]: value }));

  return (
    <div className="space-y-6">
      {error && (
        <div className="bg-red-900/30 border border-red-700 text-red-300 px-4 py-2 rounded text-sm flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {error.message}
        </div>
      )}

      {/* Core Fields */}
      <section>
        <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">Core Details</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <label className="block">
            <span className="text-xs text-zinc-400 mb-1 block">Group Name *</span>
            <input className="input w-full" value={form.name} onChange={(e) => set('name', e.target.value)} />
          </label>
          <label className="block">
            <span className="text-xs text-zinc-400 mb-1 block">Group Code</span>
            <input className="input w-full uppercase" value={form.groupCode} onChange={(e) => set('groupCode', e.target.value.toUpperCase())} maxLength={20} />
          </label>
          <label className="block">
            <span className="text-xs text-zinc-400 mb-1 block">Type</span>
            <select className="input w-full" value={form.groupType} onChange={(e) => set('groupType', e.target.value)}>
              {['tour', 'corporate', 'wedding', 'conference', 'sports', 'other'].map((t) => (
                <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs text-zinc-400 mb-1 block">Status</span>
            <select className="input w-full" value={form.status} onChange={(e) => set('status', e.target.value)}>
              {['tentative', 'definite', 'cancelled'].map((s) => (
                <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs text-zinc-400 mb-1 block">Billing Type</span>
            <select className="input w-full" value={form.billingType} onChange={(e) => set('billingType', e.target.value)}>
              {['individual', 'master', 'split'].map((b) => (
                <option key={b} value={b}>{b.charAt(0).toUpperCase() + b.slice(1)}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs text-zinc-400 mb-1 block">Negotiated Rate ($/night)</span>
            <input className="input w-full" type="number" min="0" step="0.01" value={form.negotiatedRate} onChange={(e) => set('negotiatedRate', e.target.value)} />
          </label>
        </div>
      </section>

      {/* Contact */}
      <section>
        <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">Contact</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <label className="block">
            <span className="text-xs text-zinc-400 mb-1 block">Contact Name</span>
            <input className="input w-full" value={form.contactName} onChange={(e) => set('contactName', e.target.value)} />
          </label>
          <label className="block">
            <span className="text-xs text-zinc-400 mb-1 block">Email</span>
            <input className="input w-full" type="email" value={form.contactEmail} onChange={(e) => set('contactEmail', e.target.value)} />
          </label>
          <label className="block">
            <span className="text-xs text-zinc-400 mb-1 block">Phone</span>
            <input className="input w-full" value={form.contactPhone} onChange={(e) => set('contactPhone', e.target.value)} />
          </label>
        </div>
      </section>

      {/* Booking Info */}
      <section>
        <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">Booking Info</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <label className="block">
            <span className="text-xs text-zinc-400 mb-1 block">Source</span>
            <input className="input w-full" value={form.source} onChange={(e) => set('source', e.target.value)} placeholder="direct, OTA, travel agent..." />
          </label>
          <label className="block">
            <span className="text-xs text-zinc-400 mb-1 block">Market</span>
            <input className="input w-full" value={form.market} onChange={(e) => set('market', e.target.value)} placeholder="leisure, corporate, SMERF..." />
          </label>
          <label className="block">
            <span className="text-xs text-zinc-400 mb-1 block">Booking Method</span>
            <input className="input w-full" value={form.bookingMethod} onChange={(e) => set('bookingMethod', e.target.value)} placeholder="phone, email, web..." />
          </label>
          <label className="block">
            <span className="text-xs text-zinc-400 mb-1 block">Cutoff Date</span>
            <input className="input w-full" type="date" value={form.cutoffDate} onChange={(e) => set('cutoffDate', e.target.value)} />
          </label>
        </div>
      </section>

      {/* Stay Options */}
      <section>
        <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">Stay Options</h3>
        <div className="space-y-3">
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={form.autoReleaseAtCutoff} onChange={(e) => set('autoReleaseAtCutoff', e.target.checked)} className="w-4 h-4 rounded" />
            <span className="text-sm text-zinc-300">Auto-release blocks at group cutoff date</span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={form.autoRoutePackagesToMaster} onChange={(e) => set('autoRoutePackagesToMaster', e.target.checked)} className="w-4 h-4 rounded" />
            <span className="text-sm text-zinc-300">Auto-route package charges to master folio</span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={form.autoRouteSpecialsToMaster} onChange={(e) => set('autoRouteSpecialsToMaster', e.target.checked)} className="w-4 h-4 rounded" />
            <span className="text-sm text-zinc-300">Auto-route special request charges to master folio</span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={form.shoulderDatesEnabled} onChange={(e) => set('shoulderDatesEnabled', e.target.checked)} className="w-4 h-4 rounded" />
            <span className="text-sm text-zinc-300">Enable shoulder dates</span>
          </label>
          {form.shoulderDatesEnabled && (
            <div className="ml-7 grid grid-cols-1 sm:grid-cols-3 gap-4">
              <label className="block">
                <span className="text-xs text-zinc-400 mb-1 block">Shoulder Start</span>
                <input className="input w-full" type="date" value={form.shoulderStartDate} onChange={(e) => set('shoulderStartDate', e.target.value)} />
              </label>
              <label className="block">
                <span className="text-xs text-zinc-400 mb-1 block">Shoulder End</span>
                <input className="input w-full" type="date" value={form.shoulderEndDate} onChange={(e) => set('shoulderEndDate', e.target.value)} />
              </label>
              <label className="block">
                <span className="text-xs text-zinc-400 mb-1 block">Shoulder Rate ($/night)</span>
                <input className="input w-full" type="number" min="0" step="0.01" value={form.shoulderRate} onChange={(e) => set('shoulderRate', e.target.value)} />
              </label>
            </div>
          )}
        </div>
      </section>

      {/* Comments */}
      <section>
        <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">Comments</h3>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <label className="block">
            <span className="text-xs text-zinc-400 mb-1 block">Special Requests</span>
            <textarea className="input w-full resize-none" rows={3} value={form.specialRequests} onChange={(e) => set('specialRequests', e.target.value)} />
          </label>
          <label className="block">
            <span className="text-xs text-zinc-400 mb-1 block">Group Comments</span>
            <textarea className="input w-full resize-none" rows={3} value={form.groupComments} onChange={(e) => set('groupComments', e.target.value)} />
          </label>
          <label className="block">
            <span className="text-xs text-zinc-400 mb-1 block">Reservation Comments (applied to all pickups)</span>
            <textarea className="input w-full resize-none" rows={3} value={form.reservationComments} onChange={(e) => set('reservationComments', e.target.value)} />
          </label>
          <label className="block">
            <span className="text-xs text-zinc-400 mb-1 block">Internal Notes</span>
            <textarea className="input w-full resize-none" rows={3} value={form.notes} onChange={(e) => set('notes', e.target.value)} />
          </label>
        </div>
      </section>

      <div className="flex justify-end">
        <button onClick={handleSave} disabled={isLoading} className="btn-primary flex items-center gap-2">
          <Save className="w-4 h-4" />
          {isLoading ? 'Saving…' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
}

// ── Room Matrix Tab ────────────────────────────────────────────────────────────

function RoomMatrixTab({ groupId }: { groupId: string }) {
  const { data, isLoading, error, mutate } = useFetch<{ data: GroupRoomMatrixResult }>(
    `/api/v1/pms/groups/${groupId}/matrix`,
  );

  if (isLoading) return <div className="text-zinc-400 text-sm py-8 text-center">Loading matrix…</div>;
  if (error) return <div className="text-red-400 text-sm py-8 text-center">Failed to load room matrix.</div>;

  const matrix = data?.data;
  if (!matrix) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-zinc-400">
          {formatDate(matrix.startDate)} → {formatDate(matrix.endDate)}
        </p>
        <button onClick={() => mutate()} className="btn-secondary flex items-center gap-1.5 text-sm">
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      {matrix.roomTypes.length === 0 && (
        <div className="text-center text-zinc-500 py-12">No room blocks set for this group.</div>
      )}

      {matrix.roomTypes.map((rt: GroupRoomMatrixRoomType) => (
        <div key={rt.roomTypeId} className="border border-zinc-700 rounded-lg overflow-hidden">
          <div className="bg-zinc-800 px-4 py-2 flex items-center justify-between">
            <span className="font-medium text-zinc-200 text-sm">{rt.roomTypeCode} — {rt.roomTypeName}</span>
            <div className="flex gap-6 text-xs text-zinc-400">
              <span>Blocked: <span className="text-zinc-200 font-medium">{rt.totals.roomsBlocked}</span></span>
              <span>Picked Up: <span className="text-zinc-200 font-medium">{rt.totals.roomsPickedUp}</span></span>
              <span>Available: <span className="text-zinc-200 font-medium">{rt.totals.totalAvailable}</span></span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-700 bg-zinc-900/50">
                  <th className="text-left px-4 py-2 text-xs text-zinc-400 font-medium">Date</th>
                  <th className="text-right px-4 py-2 text-xs text-zinc-400 font-medium">Available</th>
                  <th className="text-right px-4 py-2 text-xs text-zinc-400 font-medium">Blocked</th>
                  <th className="text-right px-4 py-2 text-xs text-zinc-400 font-medium">Picked Up</th>
                  <th className="text-right px-4 py-2 text-xs text-zinc-400 font-medium">Remaining</th>
                  <th className="text-center px-4 py-2 text-xs text-zinc-400 font-medium">Released</th>
                </tr>
              </thead>
              <tbody>
                {rt.cells.map((cell: GroupRoomMatrixCell) => {
                  const remaining = cell.roomsBlocked - cell.roomsPickedUp;
                  return (
                    <tr key={cell.blockDate} className="border-b border-zinc-800 hover:bg-zinc-800/30">
                      <td className="px-4 py-2 text-zinc-300">{formatDate(cell.blockDate)}</td>
                      <td className="px-4 py-2 text-right text-zinc-300">{cell.totalAvailable}</td>
                      <td className="px-4 py-2 text-right text-zinc-300">{cell.roomsBlocked}</td>
                      <td className="px-4 py-2 text-right text-green-400">{cell.roomsPickedUp}</td>
                      <td className={`px-4 py-2 text-right font-medium ${remaining > 0 ? 'text-amber-400' : 'text-zinc-500'}`}>
                        {remaining}
                      </td>
                      <td className="px-4 py-2 text-center">
                        {cell.released ? (
                          <span className="text-xs text-zinc-500">Released</span>
                        ) : (
                          <span className="text-xs text-zinc-600">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Rooming List Tab ───────────────────────────────────────────────────────────

function RoomingListTab({ groupId }: { groupId: string }) {
  const { data, isLoading, error } = useFetch<{ data: GetGroupRoomingListResult }>(
    `/api/v1/pms/groups/${groupId}/rooming-list`,
  );

  if (isLoading) return <div className="text-zinc-400 text-sm py-8 text-center">Loading rooming list…</div>;
  if (error) return <div className="text-red-400 text-sm py-8 text-center">Failed to load rooming list.</div>;

  const list = data?.data;
  if (!list) return null;

  const { summary, reservations } = list;

  return (
    <div className="space-y-4">
      {/* Summary row */}
      <div className="flex flex-wrap gap-4">
        {[
          { label: 'Total', value: summary.total, color: 'text-zinc-200' },
          { label: 'Confirmed', value: summary.confirmed, color: 'text-blue-400' },
          { label: 'Checked In', value: summary.checkedIn, color: 'text-green-400' },
          { label: 'Checked Out', value: summary.checkedOut, color: 'text-zinc-400' },
          { label: 'Cancelled', value: summary.cancelled, color: 'text-red-400' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-zinc-800 rounded-lg px-4 py-2 text-center min-w-[80px]">
            <div className={`text-xl font-bold ${color}`}>{value}</div>
            <div className="text-xs text-zinc-500">{label}</div>
          </div>
        ))}
      </div>

      {reservations.length === 0 && (
        <div className="text-center text-zinc-500 py-12">No reservations in this group yet.</div>
      )}

      {reservations.length > 0 && (
        <div className="overflow-x-auto border border-zinc-700 rounded-lg">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-700 bg-zinc-900/50">
                <th className="text-left px-4 py-2 text-xs text-zinc-400 font-medium">Guest</th>
                <th className="text-left px-4 py-2 text-xs text-zinc-400 font-medium">Room</th>
                <th className="text-left px-4 py-2 text-xs text-zinc-400 font-medium">Type</th>
                <th className="text-left px-4 py-2 text-xs text-zinc-400 font-medium">Check-In</th>
                <th className="text-left px-4 py-2 text-xs text-zinc-400 font-medium">Check-Out</th>
                <th className="text-right px-4 py-2 text-xs text-zinc-400 font-medium">Nights</th>
                <th className="text-right px-4 py-2 text-xs text-zinc-400 font-medium">Rate</th>
                <th className="text-right px-4 py-2 text-xs text-zinc-400 font-medium">Total</th>
                <th className="text-right px-4 py-2 text-xs text-zinc-400 font-medium">Balance</th>
                <th className="text-center px-4 py-2 text-xs text-zinc-400 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {reservations.map((r: RoomingListReservation) => (
                <tr key={r.reservationId} className="border-b border-zinc-800 hover:bg-zinc-800/30">
                  <td className="px-4 py-2">
                    <div className="text-zinc-200 font-medium">{r.guestFirstName} {r.guestLastName}</div>
                    {r.guestEmail && <div className="text-xs text-zinc-500">{r.guestEmail}</div>}
                  </td>
                  <td className="px-4 py-2 text-zinc-300">{r.roomNumber ?? <span className="text-zinc-600">Unassigned</span>}</td>
                  <td className="px-4 py-2 text-zinc-400 text-xs">{r.roomTypeCode}</td>
                  <td className="px-4 py-2 text-zinc-300">{formatDate(r.checkInDate)}</td>
                  <td className="px-4 py-2 text-zinc-300">{formatDate(r.checkOutDate)}</td>
                  <td className="px-4 py-2 text-right text-zinc-300">{r.nights}</td>
                  <td className="px-4 py-2 text-right text-zinc-300">{formatMoney(r.nightlyRateCents)}</td>
                  <td className="px-4 py-2 text-right text-zinc-200">{formatMoney(r.totalCents)}</td>
                  <td className={`px-4 py-2 text-right font-medium ${r.folioBalance > 0 ? 'text-amber-400' : 'text-zinc-400'}`}>
                    {formatMoney(r.folioBalance)}
                  </td>
                  <td className="px-4 py-2 text-center">{resvStatusBadge(r.status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Projected Revenue Tab ──────────────────────────────────────────────────────

function ProjectedRevenueTab({ groupId }: { groupId: string }) {
  const { data, isLoading, error } = useFetch<{ data: GroupProjectedRevenueResult }>(
    `/api/v1/pms/groups/${groupId}/projected-revenue`,
  );

  if (isLoading) return <div className="text-zinc-400 text-sm py-8 text-center">Loading revenue data…</div>;
  if (error) return <div className="text-red-400 text-sm py-8 text-center">Failed to load revenue data.</div>;

  const rev = data?.data;
  if (!rev) return null;

  const { totals } = rev;

  return (
    <div className="space-y-6">
      {/* Totals summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: 'Projected Rooms', value: String(totals.projectedRooms) },
          { label: 'Confirmed Rooms', value: String(totals.confirmedRooms) },
          { label: 'Pickup %', value: `${totals.pickupPct}%` },
          { label: 'Projected Revenue', value: formatMoney(totals.projectedRevenueCents) },
          { label: 'Confirmed Revenue', value: formatMoney(totals.confirmedRevenueCents) },
          { label: 'Revenue at Risk', value: formatMoney(totals.revenueAtRiskCents) },
        ].map(({ label, value }) => (
          <div key={label} className="bg-zinc-800 rounded-lg px-4 py-3">
            <div className="text-lg font-bold text-zinc-200">{value}</div>
            <div className="text-xs text-zinc-500 mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {/* By room type */}
      {rev.byRoomType.length > 0 && (
        <div className="overflow-x-auto border border-zinc-700 rounded-lg">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-700 bg-zinc-900/50">
                <th className="text-left px-4 py-2 text-xs text-zinc-400 font-medium">Room Type</th>
                <th className="text-right px-4 py-2 text-xs text-zinc-400 font-medium">Projected</th>
                <th className="text-right px-4 py-2 text-xs text-zinc-400 font-medium">Confirmed</th>
                <th className="text-right px-4 py-2 text-xs text-zinc-400 font-medium">Wash %</th>
                <th className="text-right px-4 py-2 text-xs text-zinc-400 font-medium">Proj. Revenue</th>
                <th className="text-right px-4 py-2 text-xs text-zinc-400 font-medium">Conf. Revenue</th>
                <th className="text-right px-4 py-2 text-xs text-zinc-400 font-medium">At Risk</th>
              </tr>
            </thead>
            <tbody>
              {rev.byRoomType.map((rt: GroupRevenueByRoomType) => (
                <tr key={rt.roomTypeId} className="border-b border-zinc-800 hover:bg-zinc-800/30">
                  <td className="px-4 py-2">
                    <span className="text-zinc-200 font-medium">{rt.roomTypeCode}</span>
                    <span className="text-zinc-500 text-xs ml-2">{rt.roomTypeName}</span>
                  </td>
                  <td className="px-4 py-2 text-right text-zinc-300">{rt.projectedRooms}</td>
                  <td className="px-4 py-2 text-right text-green-400">{rt.confirmedRooms}</td>
                  <td className={`px-4 py-2 text-right font-medium ${rt.washFactor > 0.3 ? 'text-red-400' : rt.washFactor > 0 ? 'text-amber-400' : 'text-zinc-500'}`}>
                    {Math.round(rt.washFactor * 100)}%
                  </td>
                  <td className="px-4 py-2 text-right text-zinc-300">{formatMoney(rt.projectedRevenueCents)}</td>
                  <td className="px-4 py-2 text-right text-green-400">{formatMoney(rt.confirmedRevenueCents)}</td>
                  <td className={`px-4 py-2 text-right font-medium ${rt.projectedRevenueCents - rt.confirmedRevenueCents > 0 ? 'text-amber-400' : 'text-zinc-500'}`}>
                    {formatMoney(rt.projectedRevenueCents - rt.confirmedRevenueCents)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {rev.byRoomType.length === 0 && (
        <div className="text-center text-zinc-500 py-12">No room blocks set for this group.</div>
      )}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function GroupDetailContent() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>('info');
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const { data, isLoading, error, mutate } = useFetch<{ data: GroupDetail }>(
    `/api/v1/pms/groups/${id}`,
  );
  const group = data?.data;

  const clearMessages = () => { setActionError(null); setActionSuccess(null); };

  const handleAction = useCallback(async (action: string, body?: Record<string, unknown>, label?: string) => {
    clearMessages();
    try {
      const res = await fetch(`/api/v1/pms/groups/${id}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body ?? {}),
      });
      if (!res.ok) {
        const err = await res.json();
        setActionError(err?.error?.message ?? `${label ?? action} failed`);
        return;
      }
      await mutate();
      setActionSuccess(`${label ?? action} completed successfully`);
    } catch {
      setActionError(`${label ?? action} failed`);
    }
  }, [id, mutate]);

  const handleCopy = useCallback(async () => {
    if (!group) return;
    const newName = window.prompt('Name for the copy:', `${group.name} (Copy)`);
    if (!newName) return;
    clearMessages();
    try {
      // Shift dates by 1 year as default
      const start = new Date(group.startDate);
      start.setFullYear(start.getFullYear() + 1);
      const end = new Date(group.endDate);
      end.setFullYear(end.getFullYear() + 1);
      const res = await fetch(`/api/v1/pms/groups/${id}/copy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          newName,
          newStartDate: start.toISOString().split('T')[0],
          newEndDate: end.toISOString().split('T')[0],
          copyBlocks: true,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        setActionError(err?.error?.message ?? 'Copy failed');
        return;
      }
      const result = await res.json();
      router.push(`/pms/groups/${result.data.newGroupId}`);
    } catch {
      setActionError('Copy failed');
    }
  }, [id, group, router]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    );
  }

  if (error || !group) {
    return (
      <div className="p-6">
        <div className="text-red-400">Failed to load group.</div>
      </div>
    );
  }

  const nights = Math.round(
    (new Date(group.endDate).getTime() - new Date(group.startDate).getTime()) / (1000 * 60 * 60 * 24),
  );

  return (
    <div className="flex flex-col gap-0 min-h-screen">
      {/* Header */}
      <div className="border-b border-zinc-800 bg-zinc-950 px-6 py-4">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1.5 text-sm text-zinc-400 hover:text-zinc-200 mb-3 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Groups
        </button>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-xl font-bold text-zinc-100">{group.name}</h1>
              {statusBadge(group.status)}
              {group.groupCode && (
                <span className="text-xs font-mono bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded border border-zinc-700">
                  {group.groupCode}
                </span>
              )}
              {group.confirmationNumber && (
                <span className="text-xs text-zinc-500">#{group.confirmationNumber}</span>
              )}
            </div>
            <div className="mt-1 text-sm text-zinc-400 flex flex-wrap gap-4">
              <span>{formatDate(group.startDate)} → {formatDate(group.endDate)} ({nights} nights)</span>
              {group.cutoffDate && <span>Cutoff: {formatDate(group.cutoffDate)}</span>}
              {group.corporateAccountName && <span>{group.corporateAccountName}</span>}
            </div>
            <div className="mt-2 flex flex-wrap gap-3 text-xs text-zinc-500">
              <span>Blocked: <span className="text-zinc-300 font-medium">{group.totalRoomsBlocked}</span></span>
              <span>Picked Up: <span className="text-zinc-300 font-medium">{group.roomsPickedUp}</span></span>
              <span>Pickup: <span className={`font-medium ${group.pickupPct >= 75 ? 'text-green-400' : group.pickupPct >= 50 ? 'text-amber-400' : 'text-zinc-300'}`}>{group.pickupPct}%</span></span>
              {group.negotiatedRateCents != null && (
                <span>Rate: <span className="text-zinc-300 font-medium">{formatMoney(group.negotiatedRateCents)}/night</span></span>
              )}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => handleAction('check-in', {}, 'Group Check-In')}
              disabled={group.status === 'cancelled'}
              className="btn-secondary flex items-center gap-1.5 text-sm disabled:opacity-40"
            >
              <CheckCircle className="w-4 h-4" /> Group Check-In
            </button>
            <button
              onClick={() => handleAction('check-out', {}, 'Group Check-Out')}
              disabled={group.status === 'cancelled'}
              className="btn-secondary flex items-center gap-1.5 text-sm disabled:opacity-40"
            >
              <Receipt className="w-4 h-4" /> Group Check-Out
            </button>
            <button
              onClick={handleCopy}
              className="btn-secondary flex items-center gap-1.5 text-sm"
            >
              <Copy className="w-4 h-4" /> Copy Booking
            </button>
            {group.status !== 'cancelled' && (
              <button
                onClick={() => {
                  if (window.confirm('Cancel this group and all associated reservations?')) {
                    handleAction('cancel', { cancelReservations: true, version: group.version }, 'Cancel Group');
                  }
                }}
                className="btn-secondary text-red-400 border-red-800 hover:bg-red-900/30 flex items-center gap-1.5 text-sm"
              >
                <XCircle className="w-4 h-4" /> Cancel Group
              </button>
            )}
          </div>
        </div>

        {/* Feedback messages */}
        {actionSuccess && (
          <div className="mt-3 bg-green-900/30 border border-green-700 text-green-300 px-3 py-2 rounded text-sm flex items-center gap-2">
            <CheckCircle className="w-4 h-4 shrink-0" /> {actionSuccess}
          </div>
        )}
        {actionError && (
          <div className="mt-3 bg-red-900/30 border border-red-700 text-red-300 px-3 py-2 rounded text-sm flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" /> {actionError}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="border-b border-zinc-800 bg-zinc-950 px-6">
        <div className="flex gap-0">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-400'
                  : 'border-transparent text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 p-6">
        {activeTab === 'info' && (
          <GroupInfoTab group={group} onSaved={() => { mutate(); setActionSuccess('Group saved.'); }} />
        )}
        {activeTab === 'matrix' && <RoomMatrixTab groupId={group.id} />}
        {activeTab === 'rooming' && <RoomingListTab groupId={group.id} />}
        {activeTab === 'revenue' && <ProjectedRevenueTab groupId={group.id} />}
      </div>
    </div>
  );
}
