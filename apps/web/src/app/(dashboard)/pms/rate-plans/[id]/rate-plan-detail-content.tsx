'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  DollarSign,
  Plus,
  Pencil,
  X,
  Loader2,
  Calendar,
} from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { buildQueryString } from '@/lib/query-string';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/select';
import { useToast } from '@/components/ui/toast';

// ── Types ────────────────────────────────────────────────────────

interface RatePlanDetail {
  id: string;
  tenantId: string;
  propertyId: string;
  code: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  isActive: boolean;
  defaultNightlyRateCents: number | null;
  createdAt: string;
  updatedAt: string;
  prices: RatePlanPrice[];
}

interface RatePlanPrice {
  id: string;
  roomTypeId: string;
  roomTypeCode: string;
  roomTypeName: string;
  startDate: string;
  endDate: string;
  nightlyBaseCents: number;
}

interface RoomType {
  id: string;
  code: string;
  name: string;
}

interface PriceGroup {
  roomTypeId: string;
  roomTypeCode: string;
  roomTypeName: string;
  prices: RatePlanPrice[];
}

// ── Helpers ──────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

// ── Page Component ───────────────────────────────────────────────

export default function RatePlanDetailContent() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const ratePlanId = params.id as string;

  // ── State ─────────────────────────────────────────────────────
  const [ratePlan, setRatePlan] = useState<RatePlanDetail | null>(null);
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // Dialog state
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showSetRateDialog, setShowSetRateDialog] = useState(false);
  const [preselectedRoomTypeId, setPreselectedRoomTypeId] = useState('');

  // Toggle loading
  const [togglingActive, setTogglingActive] = useState(false);
  const [togglingDefault, setTogglingDefault] = useState(false);

  // ── Fetch rate plan ───────────────────────────────────────────
  const fetchRatePlan = useCallback(async () => {
    try {
      const res = await apiFetch<{ data: RatePlanDetail }>(
        `/api/v1/pms/rate-plans/${ratePlanId}`,
      );
      setRatePlan(res.data);
      setNotFound(false);
    } catch {
      setNotFound(true);
    } finally {
      setIsLoading(false);
    }
  }, [ratePlanId]);

  useEffect(() => {
    fetchRatePlan();
  }, [fetchRatePlan]);

  // ── Fetch room types (for Set Rate dialog) ────────────────────
  useEffect(() => {
    if (!ratePlan?.propertyId) return;
    let cancelled = false;
    (async () => {
      try {
        const qs = buildQueryString({ propertyId: ratePlan.propertyId });
        const res = await apiFetch<{
          data: RoomType[];
        }>(`/api/v1/pms/room-types${qs}`);
        if (!cancelled) setRoomTypes(res.data ?? []);
      } catch {
        // silently handle
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ratePlan?.propertyId]);

  // ── Group prices by room type ─────────────────────────────────
  const priceGroups = useMemo<PriceGroup[]>(() => {
    if (!ratePlan?.prices?.length) return [];
    const map = new Map<string, PriceGroup>();
    for (const price of ratePlan.prices) {
      if (!map.has(price.roomTypeId)) {
        map.set(price.roomTypeId, {
          roomTypeId: price.roomTypeId,
          roomTypeCode: price.roomTypeCode,
          roomTypeName: price.roomTypeName,
          prices: [],
        });
      }
      map.get(price.roomTypeId)!.prices.push(price);
    }
    return Array.from(map.values());
  }, [ratePlan?.prices]);

  // Room types that have no prices set
  const uncoveredRoomTypes = useMemo(() => {
    const coveredIds = new Set(priceGroups.map((g) => g.roomTypeId));
    return roomTypes.filter((rt) => !coveredIds.has(rt.id));
  }, [roomTypes, priceGroups]);

  // ── Toggle handlers ───────────────────────────────────────────
  const handleToggleActive = useCallback(async () => {
    if (!ratePlan || togglingActive) return;
    setTogglingActive(true);
    try {
      await apiFetch(`/api/v1/pms/rate-plans/${ratePlan.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !ratePlan.isActive }),
      });
      toast.success(
        ratePlan.isActive ? 'Rate plan deactivated' : 'Rate plan activated',
      );
      fetchRatePlan();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Failed to update status',
      );
    } finally {
      setTogglingActive(false);
    }
  }, [ratePlan, togglingActive, toast, fetchRatePlan]);

  const handleToggleDefault = useCallback(async () => {
    if (!ratePlan || togglingDefault) return;
    setTogglingDefault(true);
    try {
      await apiFetch(`/api/v1/pms/rate-plans/${ratePlan.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isDefault: !ratePlan.isDefault }),
      });
      toast.success(
        ratePlan.isDefault
          ? 'Removed as default rate plan'
          : 'Set as default rate plan',
      );
      fetchRatePlan();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Failed to update default status',
      );
    } finally {
      setTogglingDefault(false);
    }
  }, [ratePlan, togglingDefault, toast, fetchRatePlan]);

  // ── Set Rate dialog opener ────────────────────────────────────
  const openSetRate = useCallback((roomTypeId?: string) => {
    setPreselectedRoomTypeId(roomTypeId ?? '');
    setShowSetRateDialog(true);
  }, []);

  // ── Loading / Not Found ───────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (notFound || !ratePlan) {
    return (
      <div className="space-y-6">
        <button
          type="button"
          onClick={() => router.push('/pms/rate-plans')}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Rate Plans
        </button>
        <div className="flex flex-col items-center justify-center rounded-lg border border-border bg-surface py-16">
          <DollarSign className="h-12 w-12 text-muted-foreground" />
          <h3 className="mt-4 text-sm font-semibold text-foreground">
            Rate plan not found
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            This rate plan may have been deleted or you don&apos;t have access.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Back link */}
      <button
        type="button"
        onClick={() => router.push('/pms/rate-plans')}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Rate Plans
      </button>

      {/* ── Header Card ────────────────────────────────────────── */}
      <div className="rounded-lg border border-border bg-surface p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold text-foreground">
                {ratePlan.name}
              </h1>
              <Badge variant="indigo">{ratePlan.code}</Badge>
              {ratePlan.isDefault && <Badge variant="purple">Default</Badge>}
              <Badge variant={ratePlan.isActive ? 'success' : 'neutral'}>
                {ratePlan.isActive ? 'Active' : 'Inactive'}
              </Badge>
            </div>
            {ratePlan.description && (
              <p className="mt-1 text-sm text-muted-foreground">
                {ratePlan.description}
              </p>
            )}
            {ratePlan.defaultNightlyRateCents != null && (
              <p className="mt-1 text-sm text-muted-foreground">
                Default Rate:{' '}
                <span className="font-medium text-foreground">
                  {formatMoney(ratePlan.defaultNightlyRateCents)}
                </span>
                /night
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleToggleActive}
              disabled={togglingActive}
              className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-accent/50 disabled:opacity-50"
            >
              {togglingActive ? (
                <Loader2 className="inline h-3.5 w-3.5 animate-spin" />
              ) : ratePlan.isActive ? (
                'Deactivate'
              ) : (
                'Activate'
              )}
            </button>
            <button
              type="button"
              onClick={handleToggleDefault}
              disabled={togglingDefault}
              className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-accent/50 disabled:opacity-50"
            >
              {togglingDefault ? (
                <Loader2 className="inline h-3.5 w-3.5 animate-spin" />
              ) : ratePlan.isDefault ? (
                'Remove Default'
              ) : (
                'Set as Default'
              )}
            </button>
            <button
              type="button"
              onClick={() => setShowEditDialog(true)}
              className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-accent/50"
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit Details
            </button>
          </div>
        </div>
      </div>

      {/* ── Room Rates Section ─────────────────────────────────── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">Room Rates</h2>
          <button
            type="button"
            onClick={() => openSetRate()}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
          >
            <Plus className="h-4 w-4" />
            Set Rate
          </button>
        </div>

        {priceGroups.length === 0 && uncoveredRoomTypes.length === 0 && (
          <div className="flex flex-col items-center justify-center rounded-lg border border-border bg-surface py-12">
            <Calendar className="h-10 w-10 text-muted-foreground" />
            <h3 className="mt-3 text-sm font-semibold text-foreground">
              No rates configured
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Set nightly rates for each room type and date range.
            </p>
            <button
              type="button"
              onClick={() => openSetRate()}
              className="mt-4 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
            >
              Set Rate
            </button>
          </div>
        )}

        {/* Per room type price cards */}
        {priceGroups.map((group) => (
          <div
            key={group.roomTypeId}
            className="rounded-lg border border-border bg-surface"
          >
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <div className="flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium text-foreground">
                  {group.roomTypeName}
                </span>
                <Badge variant="neutral">{group.roomTypeCode}</Badge>
              </div>
              <button
                type="button"
                onClick={() => openSetRate(group.roomTypeId)}
                className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-accent/50"
              >
                <Plus className="h-3.5 w-3.5" />
                Set Rate
              </button>
            </div>

            {/* Desktop table */}
            <div className="hidden sm:block">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    <th className="px-6 py-3">Date Range</th>
                    <th className="px-6 py-3 text-right">Nightly Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {group.prices.map((price) => (
                    <tr
                      key={price.id}
                      className="border-b border-border last:border-b-0"
                    >
                      <td className="px-6 py-3 text-sm text-foreground">
                        {formatDate(price.startDate)} &ndash;{' '}
                        {formatDate(price.endDate)}
                      </td>
                      <td className="px-6 py-3 text-right text-sm font-medium text-foreground">
                        {formatMoney(price.nightlyBaseCents)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="block sm:hidden">
              {group.prices.map((price) => (
                <div
                  key={price.id}
                  className="flex items-center justify-between border-b border-border px-6 py-3 last:border-b-0"
                >
                  <span className="text-sm text-foreground">
                    {formatDate(price.startDate)} &ndash;{' '}
                    {formatDate(price.endDate)}
                  </span>
                  <span className="text-sm font-medium text-foreground">
                    {formatMoney(price.nightlyBaseCents)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* Uncovered room types */}
        {uncoveredRoomTypes.length > 0 && (
          <div className="rounded-lg border border-dashed border-border bg-surface p-6">
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">
                No rates set for:{' '}
              </span>
              {uncoveredRoomTypes.map((rt) => rt.name).join(', ')}
            </p>
            <button
              type="button"
              onClick={() => openSetRate()}
              className="mt-3 flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:text-indigo-500"
            >
              <Plus className="h-3.5 w-3.5" />
              Set Rate
            </button>
          </div>
        )}
      </div>

      {/* ── Edit Header Dialog ─────────────────────────────────── */}
      {showEditDialog && (
        <EditHeaderDialog
          ratePlan={ratePlan}
          onClose={() => setShowEditDialog(false)}
          onSaved={() => {
            setShowEditDialog(false);
            fetchRatePlan();
          }}
        />
      )}

      {/* ── Set Rate Dialog ────────────────────────────────────── */}
      {showSetRateDialog && (
        <SetRateDialog
          ratePlanId={ratePlan.id}
          roomTypes={roomTypes}
          preselectedRoomTypeId={preselectedRoomTypeId}
          onClose={() => setShowSetRateDialog(false)}
          onSaved={() => {
            setShowSetRateDialog(false);
            fetchRatePlan();
          }}
        />
      )}
    </div>
  );
}

// ── Edit Header Dialog ───────────────────────────────────────────

function EditHeaderDialog({
  ratePlan,
  onClose,
  onSaved,
}: {
  ratePlan: RatePlanDetail;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [name, setName] = useState(ratePlan.name);
  const [description, setDescription] = useState(ratePlan.description ?? '');
  const [defaultRateStr, setDefaultRateStr] = useState(
    ratePlan.defaultNightlyRateCents != null
      ? (ratePlan.defaultNightlyRateCents / 100).toFixed(2)
      : '',
  );
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = useCallback(async () => {
    setError(null);
    if (!name.trim()) {
      setError('Name is required');
      return;
    }

    let defaultNightlyRateCents: number | null | undefined;
    if (defaultRateStr.trim()) {
      const parsed = parseFloat(defaultRateStr);
      if (isNaN(parsed) || parsed < 0) {
        setError('Default rate must be a valid positive number');
        return;
      }
      defaultNightlyRateCents = Math.round(parsed * 100);
    } else {
      defaultNightlyRateCents = null;
    }

    setIsSubmitting(true);
    try {
      await apiFetch(`/api/v1/pms/rate-plans/${ratePlan.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          defaultNightlyRateCents,
        }),
      });
      toast.success('Rate plan updated');
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update');
    } finally {
      setIsSubmitting(false);
    }
  }, [ratePlan.id, name, description, toast, onSaved]);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-xl border border-border bg-surface p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">
            Edit Rate Plan
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-muted-foreground hover:bg-accent/50 hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-500">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">
              Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              autoFocus
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">
              Description
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Standard published rate"
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">
              Default Nightly Rate ($)
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                $
              </span>
              <input
                type="number"
                value={defaultRateStr}
                onChange={(e) => setDefaultRateStr(e.target.value)}
                placeholder="0.00"
                step="0.01"
                min="0"
                className="w-full rounded-lg border border-border bg-surface py-2 pl-7 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Fallback rate when no date-specific price exists. Leave blank for none.
            </p>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-accent/50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {isSubmitting ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ── Set Rate Dialog ──────────────────────────────────────────────

function SetRateDialog({
  ratePlanId,
  roomTypes,
  preselectedRoomTypeId,
  onClose,
  onSaved,
}: {
  ratePlanId: string;
  roomTypes: RoomType[];
  preselectedRoomTypeId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [roomTypeId, setRoomTypeId] = useState(preselectedRoomTypeId);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [rateStr, setRateStr] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const roomTypeOptions = useMemo(
    () => roomTypes.map((rt) => ({ value: rt.id, label: `${rt.name} (${rt.code})` })),
    [roomTypes],
  );

  const handleSubmit = useCallback(async () => {
    setError(null);

    if (!roomTypeId) {
      setError('Please select a room type');
      return;
    }
    if (!startDate) {
      setError('Start date is required');
      return;
    }
    if (!endDate) {
      setError('End date is required');
      return;
    }
    if (endDate <= startDate) {
      setError('End date must be after start date');
      return;
    }

    const parsed = parseFloat(rateStr);
    if (isNaN(parsed) || parsed < 0) {
      setError('Nightly rate must be a valid positive number');
      return;
    }
    const nightlyBaseCents = Math.round(parsed * 100);

    setIsSubmitting(true);
    try {
      await apiFetch(`/api/v1/pms/rate-plans/${ratePlanId}/prices`, {
        method: 'POST',
        body: JSON.stringify({
          roomTypeId,
          startDate,
          endDate,
          nightlyBaseCents,
        }),
      });
      toast.success(
        `Rate set: ${formatMoney(nightlyBaseCents)}/night`,
      );
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set rate');
    } finally {
      setIsSubmitting(false);
    }
  }, [ratePlanId, roomTypeId, startDate, endDate, rateStr, toast, onSaved]);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-xl border border-border bg-surface p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">Set Rate</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-muted-foreground hover:bg-accent/50 hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-500">
            {error}
          </div>
        )}

        <div className="space-y-4">
          {/* Room Type */}
          <div>
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

          {/* Date Range */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">
                Start Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">
                End Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                min={startDate || undefined}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* Nightly Rate */}
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">
              Nightly Rate ($) <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                $
              </span>
              <input
                type="number"
                value={rateStr}
                onChange={(e) => setRateStr(e.target.value)}
                placeholder="0.00"
                step="0.01"
                min="0"
                className="w-full rounded-lg border border-border bg-surface py-2 pl-7 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                autoFocus
              />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Per night before taxes
            </p>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-accent/50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {isSubmitting ? 'Saving...' : 'Set Rate'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
