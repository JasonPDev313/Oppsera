'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { DollarSign, Plus, Tag } from 'lucide-react';
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

  // ── State ────────────────────────────────────────────────────────
  const [properties, setProperties] = useState<Property[]>([]);
  const [selectedPropertyId, setSelectedPropertyId] = useState('');
  const [ratePlans, setRatePlans] = useState<RatePlan[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPropertyId]);

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
            <span className="text-sm font-medium text-gray-900">
              {(row as RatePlan).name}
            </span>
            {(row as RatePlan).code && (
              <span className="ml-2 text-xs text-gray-400">
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
        key: 'description',
        header: 'Description',
        render: (row: RatePlanRow) => (
          <span className="text-sm text-gray-600">
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
          <span className="text-sm text-gray-500">
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
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600">
            <Tag className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Rate Plans</h1>
            <p className="text-sm text-gray-500">Manage pricing and rate plans</p>
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
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
          >
            <Plus className="h-4 w-4" />
            New Rate Plan
          </button>
        </div>
      </div>

      {/* Rate Plans Table */}
      {!isLoading && ratePlans.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-gray-200 bg-surface py-16">
          <DollarSign className="h-12 w-12 text-gray-300" />
          <h3 className="mt-4 text-sm font-semibold text-gray-900">No rate plans</h3>
          <p className="mt-1 text-sm text-gray-500">
            Create your first rate plan to start pricing rooms.
          </p>
          <button
            type="button"
            onClick={() => router.push('/pms/rate-plans?action=new')}
            className="mt-4 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
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
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
              >
                Load More
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
