'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useRouter, useSearchParams } from 'next/navigation';
import { DollarSign, Plus, Tag, X, Loader2 } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { buildQueryString } from '@/lib/query-string';
import { Badge } from '@/components/ui/badge';
import { DataTable } from '@/components/ui/data-table';
import { Select } from '@/components/ui/select';

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
  description: string | null;
  isDefault: boolean;
  isActive: boolean;
  defaultNightlyRateCents: number | null;
  createdAt: string;
  updatedAt: string;
}

// ── Helpers ──────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

// ── Page Component ───────────────────────────────────────────────

type RatePlanRow = RatePlan & Record<string, unknown>;

export default function RatePlansContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // ── State ────────────────────────────────────────────────────────
  const [properties, setProperties] = useState<Property[]>([]);
  const [selectedPropertyId, setSelectedPropertyId] = useState('');
  const [ratePlans, setRatePlans] = useState<RatePlan[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  // Create dialog
  const isDialogOpen = searchParams.get('action') === 'new';
  const [formCode, setFormCode] = useState('');
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formIsDefault, setFormIsDefault] = useState(false);
  const [formDefaultRate, setFormDefaultRate] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ── Load properties ───────────────────────────────────────────────
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

  // ── Load rate plans ──────────────────────────────────────────────
  const fetchRatePlans = useCallback(
    async (append = false) => {
      if (!selectedPropertyId) {
        setIsLoading(false);
        return;
      }
      if (!append) setIsLoading(true);
      try {
        const qs = buildQueryString({
          propertyId: selectedPropertyId,
          cursor: append ? cursor : undefined,
          limit: 50,
        });
        const res = await apiFetch<{
          data: RatePlan[];
          meta: { cursor: string | null; hasMore: boolean };
        }>(`/api/v1/pms/rate-plans${qs}`);

        const items = res.data ?? [];
        if (append) {
          setRatePlans((prev) => [...prev, ...items]);
        } else {
          setRatePlans(items);
        }
        setCursor(res.meta?.cursor ?? null);
        setHasMore(res.meta?.hasMore ?? false);
      } catch {
        // silently handle
      } finally {
        setIsLoading(false);
      }
    },
    [selectedPropertyId, cursor],
  );

  useEffect(() => {
    setRatePlans([]);
    setCursor(null);
    setHasMore(false);
    fetchRatePlans(false);
  }, [selectedPropertyId]);

  // ── Dialog handlers ──────────────────────────────────────────────
  useEffect(() => {
    if (isDialogOpen) {
      setFormCode('');
      setFormName('');
      setFormDescription('');
      setFormIsDefault(false);
      setFormDefaultRate('');
      setFormError(null);
    }
  }, [isDialogOpen]);

  const closeDialog = useCallback(() => {
    router.push('/pms/rate-plans', { scroll: false });
  }, [router]);

  const handleCreate = useCallback(async () => {
    setFormError(null);
    if (!formCode.trim()) {
      setFormError('Code is required');
      return;
    }
    if (!formName.trim()) {
      setFormError('Name is required');
      return;
    }
    const propId = selectedPropertyId || properties[0]?.id;
    if (!propId) {
      setFormError('No property available — please refresh the page');
      return;
    }

    setIsSubmitting(true);
    try {
      await apiFetch('/api/v1/pms/rate-plans', {
        method: 'POST',
        body: JSON.stringify({
          propertyId: propId,
          code: formCode.trim(),
          name: formName.trim(),
          description: formDescription.trim() || undefined,
          isDefault: formIsDefault,
          ...(formDefaultRate && parseFloat(formDefaultRate) > 0
            ? { defaultNightlyRateCents: Math.round(parseFloat(formDefaultRate) * 100) }
            : {}),
        }),
      });
      closeDialog();
      fetchRatePlans(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create rate plan';
      setFormError(msg);
    } finally {
      setIsSubmitting(false);
    }
  }, [formCode, formName, formDescription, formIsDefault, formDefaultRate, selectedPropertyId, properties, closeDialog, fetchRatePlans]);

  // ── Property dropdown options ──────────────────────────────────
  const propertyOptions = useMemo(
    () => properties.map((p) => ({ value: p.id, label: p.name })),
    [properties],
  );

  // ── Table columns ──────────────────────────────────────────────
  const columns = useMemo(
    () => [
      {
        key: 'name',
        header: 'Rate Plan',
        render: (row: RatePlanRow) => (
          <div>
            <span className="text-sm font-medium text-foreground">
              {(row as RatePlan).name}
            </span>
            {(row as RatePlan).code && (
              <span className="ml-2 text-xs text-muted-foreground">
                {(row as RatePlan).code}
              </span>
            )}
            {(row as RatePlan).isDefault && (
              <Badge variant="indigo" className="ml-2">
                Default
              </Badge>
            )}
          </div>
        ),
      },
      {
        key: 'defaultRate',
        header: 'Default Rate',
        width: '120px',
        render: (row: RatePlanRow) => {
          const cents = (row as RatePlan).defaultNightlyRateCents;
          return (
            <span className="text-sm text-foreground">
              {cents != null ? `$${(cents / 100).toFixed(2)}` : '\u2014'}
            </span>
          );
        },
      },
      {
        key: 'description',
        header: 'Description',
        render: (row: RatePlanRow) => (
          <span className="text-sm text-muted-foreground">
            {(row as RatePlan).description ?? '\u2014'}
          </span>
        ),
      },
      {
        key: 'status',
        header: 'Status',
        width: '100px',
        render: (row: RatePlanRow) => (
          <Badge variant={(row as RatePlan).isActive ? 'success' : 'neutral'}>
            {(row as RatePlan).isActive ? 'Active' : 'Inactive'}
          </Badge>
        ),
      },
      {
        key: 'updatedAt',
        header: 'Updated',
        width: '130px',
        render: (row: RatePlanRow) => (
          <span className="text-sm text-muted-foreground">
            {formatDate((row as RatePlan).updatedAt)}
          </span>
        ),
      },
    ],
    [],
  );

  const handleRowClick = useCallback(
    (row: RatePlanRow) => router.push(`/pms/rate-plans/${row.id}`),
    [router],
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-500/20 text-indigo-500">
            <Tag className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Rate Plans</h1>
            <p className="text-sm text-muted-foreground">Manage pricing and rate plans</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          {properties.length > 1 && (
            <Select
              options={propertyOptions}
              value={selectedPropertyId}
              onChange={(v) => setSelectedPropertyId(v as string)}
              placeholder="Select property"
              className="w-full sm:w-56"
            />
          )}
          <button
            type="button"
            onClick={() => router.push('/pms/rate-plans?action=new')}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
          >
            <Plus className="h-4 w-4" />
            New Rate Plan
          </button>
        </div>
      </div>

      {/* Rate Plans Table */}
      {!isLoading && ratePlans.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-border bg-surface py-16">
          <DollarSign className="h-12 w-12 text-muted-foreground" />
          <h3 className="mt-4 text-sm font-semibold text-foreground">No rate plans</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Create your first rate plan to start pricing rooms.
          </p>
          <button
            type="button"
            onClick={() => router.push('/pms/rate-plans?action=new')}
            className="mt-4 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
          >
            Create Rate Plan
          </button>
        </div>
      ) : (
        <>
          <DataTable
            columns={columns}
            data={ratePlans as RatePlanRow[]}
            isLoading={isLoading}
            emptyMessage="No rate plans found"
            onRowClick={handleRowClick}
          />
          {hasMore && (
            <div className="flex justify-center">
              <button
                type="button"
                onClick={() => fetchRatePlans(true)}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
              >
                Load More
              </button>
            </div>
          )}
        </>
      )}

      {/* Create Rate Plan Dialog */}
      {isDialogOpen &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div
              className="absolute inset-0 bg-black/40"
              onClick={closeDialog}
            />
            <div className="relative z-10 w-full max-w-md rounded-xl border border-border bg-surface p-6 shadow-xl">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-foreground">
                  New Rate Plan
                </h2>
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

              <div className="space-y-4">
                {/* Property (read-only for single property) */}
                <div>
                  <label className="mb-1 block text-sm font-medium text-foreground">
                    Property
                  </label>
                  {properties.length > 1 ? (
                    <Select
                      options={propertyOptions}
                      value={selectedPropertyId}
                      onChange={(v) => setSelectedPropertyId(v as string)}
                      placeholder="Select property"
                      className="w-full"
                    />
                  ) : (
                    <div className="w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground">
                      {properties[0]?.name ?? 'Loading...'}
                    </div>
                  )}
                </div>

                {/* Code */}
                <div>
                  <label className="mb-1 block text-sm font-medium text-foreground">
                    Code <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formCode}
                    onChange={(e) => setFormCode(e.target.value.toUpperCase())}
                    placeholder="e.g. RACK, WKND, PROMO"
                    maxLength={20}
                    className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    autoFocus
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Short code for this rate plan (e.g. RACK, WKND, PROMO)
                  </p>
                </div>

                {/* Name */}
                <div>
                  <label className="mb-1 block text-sm font-medium text-foreground">
                    Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="e.g. Rack Rate, Weekend Special"
                    maxLength={100}
                    className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                {/* Description */}
                <div>
                  <label className="mb-1 block text-sm font-medium text-foreground">
                    Description
                  </label>
                  <input
                    type="text"
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                    placeholder="e.g. Standard published rate"
                    className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                {/* Default Nightly Rate */}
                <div>
                  <label className="mb-1 block text-sm font-medium text-foreground">
                    Default Nightly Rate ($)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formDefaultRate}
                    onChange={(e) => setFormDefaultRate(e.target.value)}
                    placeholder="e.g. 125.00"
                    className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Fallback rate when no date-specific pricing is set
                  </p>
                </div>

                {/* Is Default */}
                <label className="flex items-center gap-2 text-sm text-foreground">
                  <input
                    type="checkbox"
                    checked={formIsDefault}
                    onChange={(e) => setFormIsDefault(e.target.checked)}
                    className="h-4 w-4 rounded border-border text-indigo-500 focus:ring-indigo-500"
                  />
                  Set as default rate plan for this property
                </label>
              </div>

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
                  onClick={handleCreate}
                  disabled={isSubmitting}
                  className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  {isSubmitting ? 'Creating...' : 'Create Rate Plan'}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
