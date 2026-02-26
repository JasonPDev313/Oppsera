'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { Users, Plus, X, Loader2, Calendar } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { buildQueryString } from '@/lib/query-string';
import { Badge } from '@/components/ui/badge';
import { DataTable } from '@/components/ui/data-table';
import { SearchInput } from '@/components/ui/search-input';
import { Select } from '@/components/ui/select';
import { EmptyState } from '@/components/ui/empty-state';

// ── Types ────────────────────────────────────────────────────────

interface Property {
  id: string;
  name: string;
}

interface RatePlan {
  id: string;
  propertyId: string;
  code: string;
  name: string;
  isDefault: boolean;
}

interface Group {
  id: string;
  name: string;
  type: string;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  startDate: string;
  endDate: string;
  cutoffDate: string | null;
  status: string;
  roomsBlocked: number;
  roomsPickedUp: number;
  pickupPercentage: number;
  ratePlanId: string | null;
  ratePlanName: string | null;
  negotiatedRateCents: number | null;
  billingType: string | null;
  notes: string | null;
  createdAt: string;
}

// ── Constants ────────────────────────────────────────────────────

const GROUP_TYPE_OPTIONS = [
  { value: 'tour', label: 'Tour' },
  { value: 'corporate', label: 'Corporate' },
  { value: 'wedding', label: 'Wedding' },
  { value: 'conference', label: 'Conference' },
  { value: 'sports', label: 'Sports' },
  { value: 'other', label: 'Other' },
];

const BILLING_TYPE_OPTIONS = [
  { value: 'individual', label: 'Individual' },
  { value: 'master', label: 'Master Account' },
  { value: 'split', label: 'Split' },
];

const STATUS_BADGES: Record<string, { label: string; variant: string }> = {
  tentative: { label: 'Tentative', variant: 'warning' },
  definite: { label: 'Definite', variant: 'success' },
  cancelled: { label: 'Cancelled', variant: 'error' },
};

// ── Helpers ──────────────────────────────────────────────────────

function formatGroupType(type: string): string {
  const match = GROUP_TYPE_OPTIONS.find((o) => o.value === type);
  return match ? match.label : type.charAt(0).toUpperCase() + type.slice(1);
}

// ── Page Component ───────────────────────────────────────────────

type GroupRow = Group & Record<string, unknown>;

export default function GroupsContent() {
  const router = useRouter();

  // ── State ────────────────────────────────────────────────────────
  const [properties, setProperties] = useState<Property[]>([]);
  const [selectedPropertyId, setSelectedPropertyId] = useState('');
  const [groups, setGroups] = useState<Group[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // Filter
  const [search, setSearch] = useState('');

  // Create group dialog
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [ratePlans, setRatePlans] = useState<RatePlan[]>([]);
  const [dialogDataLoading, setDialogDataLoading] = useState(false);

  // Form fields
  const [formName, setFormName] = useState('');
  const [formType, setFormType] = useState('corporate');
  const [formContactName, setFormContactName] = useState('');
  const [formContactEmail, setFormContactEmail] = useState('');
  const [formContactPhone, setFormContactPhone] = useState('');
  const [formStartDate, setFormStartDate] = useState('');
  const [formEndDate, setFormEndDate] = useState('');
  const [formCutoffDate, setFormCutoffDate] = useState('');
  const [formRatePlanId, setFormRatePlanId] = useState('');
  const [formNegotiatedRate, setFormNegotiatedRate] = useState('');
  const [formBillingType, setFormBillingType] = useState('individual');
  const [formNotes, setFormNotes] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ── Load properties ─────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch<{ data: Property[] }>('/api/v1/pms/properties');
        if (cancelled) return;
        const items = res.data ?? [];
        setProperties(items);
        if (items.length > 0 && !selectedPropertyId) {
          setSelectedPropertyId(items[0]!.id);
        }
      } catch {
        // silently handle
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ── Load groups ───────────────────────────────────────────────
  const fetchGroups = useCallback(
    async (cursorVal?: string) => {
      if (!selectedPropertyId) return;
      const isAppend = !!cursorVal;
      if (isAppend) setIsLoadingMore(true);
      else setIsLoading(true);

      try {
        const qs = buildQueryString({
          propertyId: selectedPropertyId,
          cursor: cursorVal || undefined,
          limit: 20,
        });
        const res = await apiFetch<{
          data: Group[];
          meta: { cursor: string | null; hasMore: boolean };
        }>(`/api/v1/pms/groups${qs}`);

        const items = res.data ?? [];
        const meta = res.meta ?? { cursor: null, hasMore: false };

        if (isAppend) {
          setGroups((prev) => [...prev, ...items]);
        } else {
          setGroups(items);
        }
        setCursor(meta.cursor);
        setHasMore(meta.hasMore);
      } catch {
        // silently handle
      } finally {
        if (isAppend) setIsLoadingMore(false);
        else setIsLoading(false);
      }
    },
    [selectedPropertyId],
  );

  useEffect(() => {
    fetchGroups();
  }, [fetchGroups]);

  const handleLoadMore = useCallback(() => {
    if (cursor && !isLoadingMore) {
      fetchGroups(cursor);
    }
  }, [cursor, isLoadingMore, fetchGroups]);

  // ── Load rate plans when dialog opens ───────────────────────────
  useEffect(() => {
    if (!isDialogOpen || !selectedPropertyId) return;
    let cancelled = false;
    setDialogDataLoading(true);
    (async () => {
      try {
        const qs = buildQueryString({ propertyId: selectedPropertyId, limit: 100 });
        const res = await apiFetch<{ data: RatePlan[] }>(`/api/v1/pms/rate-plans${qs}`);
        if (cancelled) return;
        setRatePlans(res.data ?? []);
      } catch (err) {
        console.error('[PMS Groups] Failed to load rate plans:', err);
      } finally {
        if (!cancelled) setDialogDataLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isDialogOpen, selectedPropertyId]);

  // ── Reset form when dialog opens ───────────────────────────────
  const openDialog = useCallback(() => {
    setFormName('');
    setFormType('corporate');
    setFormContactName('');
    setFormContactEmail('');
    setFormContactPhone('');
    setFormStartDate('');
    setFormEndDate('');
    setFormCutoffDate('');
    setFormRatePlanId('');
    setFormNegotiatedRate('');
    setFormBillingType('individual');
    setFormNotes('');
    setFormError(null);
    setIsDialogOpen(true);
  }, []);

  const closeDialog = useCallback(() => {
    setIsDialogOpen(false);
  }, []);

  // ── Submit ────────────────────────────────────────────────────
  const handleCreateGroup = useCallback(async () => {
    setFormError(null);
    if (!formName.trim()) { setFormError('Group name is required'); return; }
    if (!formStartDate) { setFormError('Start date is required'); return; }
    if (!formEndDate) { setFormError('End date is required'); return; }
    if (formEndDate < formStartDate) { setFormError('End date must be on or after start date'); return; }
    if (formCutoffDate && formCutoffDate > formStartDate) { setFormError('Cutoff date must be on or before start date'); return; }
    if (!selectedPropertyId) { setFormError('No property selected'); return; }

    setIsSubmitting(true);
    const payload: Record<string, unknown> = {
      propertyId: selectedPropertyId,
      name: formName.trim(),
      type: formType,
      startDate: formStartDate,
      endDate: formEndDate,
      billingType: formBillingType,
    };
    if (formContactName.trim()) payload.contactName = formContactName.trim();
    if (formContactEmail.trim()) payload.contactEmail = formContactEmail.trim();
    if (formContactPhone.trim()) payload.contactPhone = formContactPhone.trim();
    if (formCutoffDate) payload.cutoffDate = formCutoffDate;
    if (formRatePlanId) payload.ratePlanId = formRatePlanId;
    if (formNegotiatedRate && parseFloat(formNegotiatedRate) > 0) {
      payload.negotiatedRateCents = Math.round(parseFloat(formNegotiatedRate) * 100);
    }
    if (formNotes.trim()) payload.notes = formNotes.trim();

    try {
      await apiFetch('/api/v1/pms/groups', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      closeDialog();
      fetchGroups();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create group';
      setFormError(msg);
    } finally {
      setIsSubmitting(false);
    }
  }, [
    formName, formType, formContactName, formContactEmail, formContactPhone,
    formStartDate, formEndDate, formCutoffDate, formRatePlanId,
    formNegotiatedRate, formBillingType, formNotes,
    selectedPropertyId, closeDialog, fetchGroups,
  ]);

  // ── Client-side search filter ─────────────────────────────────
  const filteredGroups = useMemo(() => {
    if (!search) return groups;
    const q = search.toLowerCase();
    return groups.filter((g) => {
      const name = g.name.toLowerCase();
      const contact = (g.contactName ?? '').toLowerCase();
      return name.includes(q) || contact.includes(q);
    });
  }, [groups, search]);

  // ── Property dropdown options ─────────────────────────────────
  const propertyOptions = useMemo(
    () => properties.map((p) => ({ value: p.id, label: p.name })),
    [properties],
  );

  // ── Table columns ─────────────────────────────────────────────
  const columns = useMemo(
    () => [
      {
        key: 'name',
        header: 'Group Name',
        render: (row: GroupRow) => (
          <span className="text-sm font-medium text-foreground">
            {(row as Group).name}
          </span>
        ),
      },
      {
        key: 'type',
        header: 'Type',
        width: '120px',
        render: (row: GroupRow) => (
          <span className="text-sm text-foreground">
            {formatGroupType((row as Group).type)}
          </span>
        ),
      },
      {
        key: 'contactName',
        header: 'Contact',
        render: (row: GroupRow) => (
          <span className="text-sm text-foreground">
            {(row as Group).contactName ?? '\u2014'}
          </span>
        ),
      },
      {
        key: 'dates',
        header: 'Dates',
        width: '180px',
        render: (row: GroupRow) => {
          const g = row as Group;
          return (
            <span className="text-sm text-foreground">
              {g.startDate} &ndash; {g.endDate}
            </span>
          );
        },
      },
      {
        key: 'status',
        header: 'Status',
        width: '110px',
        render: (row: GroupRow) => {
          const s = (row as Group).status;
          const badge = STATUS_BADGES[s] ?? { label: s, variant: 'neutral' };
          return <Badge variant={badge.variant}>{badge.label}</Badge>;
        },
      },
      {
        key: 'roomsBlocked',
        header: 'Blocked',
        width: '80px',
        render: (row: GroupRow) => (
          <span className="text-sm text-foreground tabular-nums">
            {(row as Group).roomsBlocked}
          </span>
        ),
      },
      {
        key: 'roomsPickedUp',
        header: 'Picked Up',
        width: '90px',
        render: (row: GroupRow) => (
          <span className="text-sm text-foreground tabular-nums">
            {(row as Group).roomsPickedUp}
          </span>
        ),
      },
      {
        key: 'pickupPercentage',
        header: 'Pickup %',
        width: '90px',
        render: (row: GroupRow) => {
          const pct = (row as Group).pickupPercentage;
          const color =
            pct >= 75
              ? 'text-green-500'
              : pct >= 50
                ? 'text-amber-500'
                : 'text-foreground';
          return (
            <span className={`text-sm font-medium tabular-nums ${color}`}>
              {pct}%
            </span>
          );
        },
      },
    ],
    [],
  );

  const handleRowClick = useCallback(
    (row: GroupRow) => router.push(`/pms/groups/${row.id}`),
    [router],
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-500/20 text-indigo-500">
            <Users className="h-5 w-5" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Groups</h1>
        </div>
        <div className="flex items-center gap-3">
          {properties.length > 1 && (
            <Select
              options={propertyOptions}
              value={selectedPropertyId}
              onChange={(v) => setSelectedPropertyId(v as string)}
              placeholder="Select property"
              className="w-full sm:w-48"
            />
          )}
          <button
            type="button"
            onClick={openDialog}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
          >
            <Plus className="h-4 w-4" />
            Create Group
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search groups by name or contact..."
          className="w-full md:w-72"
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch('')}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Clear
          </button>
        )}
      </div>

      {/* Table */}
      {!isLoading && filteredGroups.length === 0 && !search ? (
        <EmptyState
          icon={Users}
          title="No groups yet"
          description="Group bookings and allotments will appear here once created"
          action={{
            label: 'Create Group',
            onClick: openDialog,
          }}
        />
      ) : (
        <>
          <DataTable
            columns={columns}
            data={filteredGroups as GroupRow[]}
            isLoading={isLoading}
            emptyMessage="No groups match your search"
            onRowClick={handleRowClick}
          />
          {hasMore && (
            <div className="flex justify-center">
              <button
                type="button"
                onClick={handleLoadMore}
                disabled={isLoadingMore}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isLoadingMore ? 'Loading...' : 'Load More'}
              </button>
            </div>
          )}
        </>
      )}

      {/* Create Group Dialog */}
      {isDialogOpen &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* Backdrop */}
            <div
              className="absolute inset-0 bg-black/40"
              onClick={closeDialog}
            />
            {/* Panel */}
            <div className="relative z-10 w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl border border-border bg-surface p-6 shadow-xl">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-foreground">Create Group</h2>
                <button
                  type="button"
                  onClick={closeDialog}
                  className="rounded p-1 text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {formError && (
                <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-500">
                  {formError}
                </div>
              )}

              {dialogDataLoading ? (
                <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading...
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Group Name */}
                  <div>
                    <label className="mb-1 block text-sm font-medium text-foreground">
                      Group Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      placeholder="e.g. Smith Wedding Party"
                      className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      autoFocus
                    />
                  </div>

                  {/* Group Type */}
                  <div>
                    <label className="mb-1 block text-sm font-medium text-foreground">
                      Type <span className="text-red-500">*</span>
                    </label>
                    <Select
                      options={GROUP_TYPE_OPTIONS}
                      value={formType}
                      onChange={(v) => setFormType(v as string)}
                      placeholder="Select type"
                    />
                  </div>

                  {/* Contact Info */}
                  <div>
                    <label className="mb-1 block text-sm font-medium text-foreground">Contact Name</label>
                    <input
                      type="text"
                      value={formContactName}
                      onChange={(e) => setFormContactName(e.target.value)}
                      placeholder="Jane Smith"
                      className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 block text-sm font-medium text-foreground">Contact Email</label>
                      <input
                        type="email"
                        value={formContactEmail}
                        onChange={(e) => setFormContactEmail(e.target.value)}
                        placeholder="jane@example.com"
                        className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-foreground">Contact Phone</label>
                      <input
                        type="tel"
                        value={formContactPhone}
                        onChange={(e) => setFormContactPhone(e.target.value)}
                        placeholder="+1 555-0100"
                        className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                    </div>
                  </div>

                  {/* Dates */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 block text-sm font-medium text-foreground">
                        Start Date <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="date"
                        value={formStartDate}
                        onChange={(e) => setFormStartDate(e.target.value)}
                        className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-foreground">
                        End Date <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="date"
                        value={formEndDate}
                        onChange={(e) => setFormEndDate(e.target.value)}
                        min={formStartDate || undefined}
                        className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                    </div>
                  </div>

                  {/* Cutoff Date */}
                  <div>
                    <label className="mb-1 block text-sm font-medium text-foreground">
                      Cutoff Date
                    </label>
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
                      <input
                        type="date"
                        value={formCutoffDate}
                        onChange={(e) => setFormCutoffDate(e.target.value)}
                        max={formStartDate || undefined}
                        className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Last date unbooked rooms in the block are released
                    </p>
                  </div>

                  {/* Rate Plan + Negotiated Rate */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 block text-sm font-medium text-foreground">Rate Plan</label>
                      {ratePlans.length === 0 ? (
                        <p className="py-2 text-xs text-muted-foreground">
                          None available
                        </p>
                      ) : (
                        <Select
                          options={ratePlans.map((rp) => ({
                            value: rp.id,
                            label: `${rp.name} (${rp.code})`,
                          }))}
                          value={formRatePlanId}
                          onChange={(v) => setFormRatePlanId(v as string)}
                          placeholder="Select rate plan"
                        />
                      )}
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-foreground">Negotiated Rate ($)</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={formNegotiatedRate}
                        onChange={(e) => setFormNegotiatedRate(e.target.value)}
                        placeholder="149.00"
                        className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                    </div>
                  </div>

                  {/* Billing Type */}
                  <div>
                    <label className="mb-1 block text-sm font-medium text-foreground">Billing Type</label>
                    <Select
                      options={BILLING_TYPE_OPTIONS}
                      value={formBillingType}
                      onChange={(v) => setFormBillingType(v as string)}
                      placeholder="Select billing type"
                    />
                  </div>

                  {/* Notes */}
                  <div>
                    <label className="mb-1 block text-sm font-medium text-foreground">Notes</label>
                    <textarea
                      value={formNotes}
                      onChange={(e) => setFormNotes(e.target.value)}
                      placeholder="Optional notes about this group booking..."
                      rows={3}
                      className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={closeDialog}
                  className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-accent/50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleCreateGroup}
                  disabled={isSubmitting}
                  className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  {isSubmitting ? 'Creating...' : 'Create Group'}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
