'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft, Edit, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Select } from '@/components/ui/select';
import { CurrencyInput } from '@/components/ui/currency-input';
import { FormField } from '@/components/ui/form-field';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { DataTable } from '@/components/ui/data-table';
import { useCatalogItem, useTaxGroups, useItemTaxGroups, useModifierGroups } from '@/hooks/use-catalog';
import { useToast } from '@/components/ui/toast';
import { useAuthContext } from '@/components/auth-provider';
import { apiFetch } from '@/lib/api-client';
import {
  getItemTypeGroup,
  ITEM_TYPE_BADGES,
  type FnbMetadata,
  type RetailMetadata,
  type ServiceMetadata,
  type PackageMetadata,
  type CategoryRow,
} from '@/types/catalog';

// ---------- Extended types for the full item detail response ----------

interface LocationPrice {
  locationId: string;
  price: string;
}

interface ModifierGroupDetail {
  id: string;
  name: string;
  selectionType: string;
  isRequired: boolean;
  minSelections: number;
  maxSelections: number | null;
  modifiers: {
    id: string;
    name: string;
    priceAdjustment: string;
    sortOrder: number;
    isActive: boolean;
  }[];
}

interface ItemDetailResponse {
  id: string;
  sku: string | null;
  name: string;
  description: string | null;
  itemType: string;
  defaultPrice: string;
  cost: string | null;
  categoryId?: string | null;
  isTrackable: boolean;
  isActive: boolean;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  category?: { id: string; name: string } | null;
  taxCategory?: { id: string; name: string; rate: string } | null;
  modifierGroups?: ModifierGroupDetail[];
  locationPrices?: LocationPrice[];
}

// ---------- Helpers ----------

function formatCurrency(value: string | null | undefined): string {
  if (!value) return '-';
  return `$${Number(value).toFixed(2)}`;
}

function calcMargin(price: string | null, cost: string | null): string {
  if (!price || !cost) return '-';
  const p = Number(price);
  const c = Number(cost);
  if (p === 0) return '-';
  return `${(((p - c) / p) * 100).toFixed(1)}%`;
}

// ---------- Main page ----------

export default function ItemDetailPage() {
  const router = useRouter();
  const params = useParams();
  const itemId = params.id as string;
  const { toast } = useToast();
  const { locations } = useAuthContext();

  // Fetch item
  const { data: rawItem, isLoading: itemLoading, mutate: refetchItem } = useCatalogItem(itemId);
  const item = rawItem as unknown as ItemDetailResponse | null;

  // Categories for hierarchy path
  const [allCategories, setAllCategories] = useState<CategoryRow[]>([]);
  useEffect(() => {
    apiFetch<{ data: CategoryRow[] }>('/api/v1/catalog/categories?includeInactive=true')
      .then((res) => setAllCategories(res.data))
      .catch(() => {});
  }, []);

  // Build hierarchy path: Category > SubDepartment > Department
  const hierarchyPath = useMemo(() => {
    if (!item?.category) return '-';
    const map = new Map(allCategories.map((c) => [c.id, c]));
    const parts: string[] = [];
    let current: CategoryRow | undefined = map.get(item.category.id);
    while (current) {
      parts.unshift(current.name);
      current = current.parentId ? map.get(current.parentId) : undefined;
    }
    return parts.length > 0 ? parts.join(' > ') : '-';
  }, [item?.category, allCategories]);

  // Type grouping
  const typeGroup = item ? getItemTypeGroup(item.itemType, item.metadata) : 'retail';
  const typeBadge = ITEM_TYPE_BADGES[typeGroup];

  // ---------- Deactivate ----------

  const [showDeactivate, setShowDeactivate] = useState(false);
  const [deactivating, setDeactivating] = useState(false);

  const handleDeactivate = async () => {
    setDeactivating(true);
    try {
      await apiFetch(`/api/v1/catalog/items/${itemId}/deactivate`, { method: 'POST' });
      toast.success('Item deactivated');
      router.push('/catalog');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to deactivate item');
    } finally {
      setDeactivating(false);
      setShowDeactivate(false);
    }
  };

  // ---------- Tax Groups ----------

  const [taxLocationId, setTaxLocationId] = useState('');
  useEffect(() => {
    if (locations.length > 0 && !taxLocationId) {
      setTaxLocationId(locations[0]!.id);
    }
  }, [locations, taxLocationId]);

  const { data: availableTaxGroups, isLoading: taxGroupsLoading } = useTaxGroups(taxLocationId || undefined);
  const {
    data: assignedTaxGroups,
    isLoading: itemTaxLoading,
    mutate: refetchItemTaxGroups,
  } = useItemTaxGroups(itemId, taxLocationId || undefined);

  const [showTaxEdit, setShowTaxEdit] = useState(false);
  const [selectedTaxGroupIds, setSelectedTaxGroupIds] = useState<string[]>([]);
  const [savingTaxGroups, setSavingTaxGroups] = useState(false);

  useEffect(() => {
    if (assignedTaxGroups) {
      setSelectedTaxGroupIds(assignedTaxGroups.map((g) => g.taxGroupId));
    }
  }, [assignedTaxGroups]);

  const taxGroupOptions = useMemo(
    () => (availableTaxGroups ?? []).map((g) => ({ value: g.id, label: `${g.name} (${g.calculationMode})` })),
    [availableTaxGroups],
  );

  const effectiveTaxInfo = useMemo(() => {
    if (!assignedTaxGroups || assignedTaxGroups.length === 0 || !availableTaxGroups) return null;
    const groups = availableTaxGroups.filter((g) => assignedTaxGroups.some((a) => a.taxGroupId === g.id));
    if (groups.length === 0) return null;
    const totalRate = groups.reduce((sum, g) => sum + g.totalRate, 0);
    const mode = groups[0]?.calculationMode ?? 'unknown';
    return { totalRate: (totalRate * 100).toFixed(2), mode };
  }, [assignedTaxGroups, availableTaxGroups]);

  const handleSaveTaxGroups = async () => {
    setSavingTaxGroups(true);
    try {
      await apiFetch(`/api/v1/catalog/items/${itemId}/tax-groups?locationId=${taxLocationId}`, {
        method: 'PUT',
        body: JSON.stringify({ taxGroupIds: selectedTaxGroupIds }),
      });
      toast.success('Tax groups updated');
      setShowTaxEdit(false);
      refetchItemTaxGroups();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save tax groups');
    } finally {
      setSavingTaxGroups(false);
    }
  };

  // ---------- Location Prices ----------

  const locationPrices = (item?.locationPrices ?? []) as LocationPrice[];

  const [showAddPrice, setShowAddPrice] = useState(false);
  const [priceLocationId, setPriceLocationId] = useState('');
  const [priceValue, setPriceValue] = useState<number | null>(null);
  const [savingPrice, setSavingPrice] = useState(false);
  const [removePriceTarget, setRemovePriceTarget] = useState<{ locationId: string; locationName: string } | null>(null);
  const [removingPrice, setRemovingPrice] = useState(false);

  const locationOptions = useMemo(
    () => locations.map((l) => ({ value: l.id, label: l.name })),
    [locations],
  );

  const locationMap = useMemo(
    () => new Map(locations.map((l) => [l.id, l.name])),
    [locations],
  );

  const handleSetPrice = async () => {
    if (!priceLocationId || priceValue == null) return;
    setSavingPrice(true);
    try {
      await apiFetch(`/api/v1/catalog/items/${itemId}/prices`, {
        method: 'PUT',
        body: JSON.stringify({ locationId: priceLocationId, price: priceValue }),
      });
      toast.success('Location price set');
      setShowAddPrice(false);
      setPriceLocationId('');
      setPriceValue(null);
      refetchItem();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to set price');
    } finally {
      setSavingPrice(false);
    }
  };

  const handleRemovePrice = async () => {
    if (!removePriceTarget) return;
    setRemovingPrice(true);
    try {
      await apiFetch(`/api/v1/catalog/items/${itemId}/prices/${removePriceTarget.locationId}`, {
        method: 'DELETE',
      });
      toast.success('Location price removed');
      setRemovePriceTarget(null);
      refetchItem();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to remove price');
    } finally {
      setRemovingPrice(false);
    }
  };

  // ---------- Modifier groups (for F&B display) ----------

  const { data: allModifierGroups } = useModifierGroups();
  const modifierGroupMap = useMemo(
    () => new Map((allModifierGroups ?? []).map((g) => [g.id, g])),
    [allModifierGroups],
  );

  // ---------- Loading / Error ----------

  if (itemLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <LoadingSpinner size="lg" label="Loading item..." />
      </div>
    );
  }

  if (!item) {
    return (
      <div className="flex min-h-[400px] flex-col items-center justify-center gap-4">
        <p className="text-sm text-gray-500">Item not found</p>
        <button
          type="button"
          onClick={() => router.push('/catalog')}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          Back to Items
        </button>
      </div>
    );
  }

  // ---------- Metadata casting ----------

  const fnbMeta = typeGroup === 'fnb' ? (item.metadata as FnbMetadata | undefined) : undefined;
  const retailMeta = typeGroup === 'retail' ? (item.metadata as RetailMetadata | undefined) : undefined;
  const serviceMeta = typeGroup === 'service' ? (item.metadata as ServiceMetadata | undefined) : undefined;
  const packageMeta = typeGroup === 'package' ? (item.metadata as PackageMetadata | undefined) : undefined;

  // For F&B, resolve modifier group IDs to full objects
  const defaultModGroups = (fnbMeta?.defaultModifierGroupIds ?? [])
    .map((id) => {
      const fromItem = item.modifierGroups?.find((g) => g.id === id);
      if (fromItem) return fromItem;
      const fromAll = modifierGroupMap.get(id);
      return fromAll ?? null;
    })
    .filter(Boolean) as ModifierGroupDetail[];

  const optionalModGroups = (fnbMeta?.optionalModifierGroupIds ?? [])
    .map((id) => {
      const fromItem = item.modifierGroups?.find((g) => g.id === id);
      if (fromItem) return fromItem;
      const fromAll = modifierGroupMap.get(id);
      return fromAll ?? null;
    })
    .filter(Boolean) as ModifierGroupDetail[];

  // ---------- Render ----------

  return (
    <div className="space-y-6">
      {/* Back link */}
      <button
        type="button"
        onClick={() => router.push('/catalog')}
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Items
      </button>

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold text-gray-900">{item.name}</h1>
          <Badge variant={typeBadge.variant}>{typeBadge.label}</Badge>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.push(`/catalog/items/${itemId}/edit`)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700 focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            <Edit className="h-4 w-4" />
            Edit
          </button>
          {item.isActive && (
            <button
              type="button"
              onClick={() => setShowDeactivate(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/40 px-4 py-2 text-sm font-medium text-red-500 transition-colors hover:bg-red-500/10 focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 focus-visible:outline-none"
            >
              <Trash2 className="h-4 w-4" />
              Deactivate
            </button>
          )}
        </div>
      </div>

      {/* Inactive banner */}
      {!item.isActive && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
          This item is inactive
        </div>
      )}

      {/* Details card */}
      <div className="rounded-lg border border-gray-200 bg-surface p-6">
        <h2 className="mb-4 text-base font-semibold text-gray-900">Details</h2>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {/* Left column */}
          <div className="space-y-4">
            <DetailRow label="Name" value={item.name} />
            <DetailRow label="SKU" value={item.sku || '-'} mono />
            <DetailRow label="Description" value={item.description || '-'} />
            <DetailRow label="Type" value={typeBadge.label} />
            <DetailRow label="Hierarchy" value={hierarchyPath} />
          </div>
          {/* Right column */}
          <div className="space-y-4">
            <DetailRow label="Price" value={formatCurrency(item.defaultPrice)} />
            <DetailRow label="Cost" value={formatCurrency(item.cost)} />
            <DetailRow label="Margin" value={calcMargin(item.defaultPrice, item.cost)} />
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <span className="text-sm font-medium text-gray-500">Status</span>
              <Badge variant={item.isActive ? 'success' : 'neutral'}>
                {item.isActive ? 'Active' : 'Inactive'}
              </Badge>
            </div>
          </div>
        </div>
      </div>

      {/* Type-specific sections */}
      {typeGroup === 'fnb' && (
        <>
          {/* Modifiers card */}
          <div className="rounded-lg border border-gray-200 bg-surface p-6">
            <h2 className="mb-4 text-base font-semibold text-gray-900">Modifiers</h2>

            {defaultModGroups.length > 0 && (
              <div className="mb-4">
                <h3 className="mb-2 text-sm font-medium text-gray-700">Default Groups</h3>
                <div className="space-y-3">
                  {defaultModGroups.map((g) => (
                    <ModifierGroupCard key={g.id} group={g} />
                  ))}
                </div>
              </div>
            )}

            {optionalModGroups.length > 0 && (
              <div>
                <h3 className="mb-2 text-sm font-medium text-gray-700">Optional Groups</h3>
                <div className="space-y-3">
                  {optionalModGroups.map((g) => (
                    <ModifierGroupCard key={g.id} group={g} />
                  ))}
                </div>
              </div>
            )}

            {defaultModGroups.length === 0 && optionalModGroups.length === 0 && (
              <p className="text-sm text-gray-500">No modifier groups configured</p>
            )}
          </div>

          {/* F&B Options card */}
          <div className="rounded-lg border border-gray-200 bg-surface p-6">
            <h2 className="mb-4 text-base font-semibold text-gray-900">F&B Options</h2>
            <div className="space-y-3">
              <DetailRow
                label="Special Instructions"
                value={fnbMeta?.allowSpecialInstructions ? 'Yes' : 'No'}
              />
              <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                <span className="text-sm font-medium text-gray-500">Allowed Fractions</span>
                <div className="flex gap-1.5">
                  {fnbMeta?.allowedFractions && fnbMeta.allowedFractions.length > 0 ? (
                    fnbMeta.allowedFractions.map((f) => (
                      <Badge key={f} variant="info">
                        1/{f}
                      </Badge>
                    ))
                  ) : (
                    <span className="text-sm text-gray-900">None</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {typeGroup === 'retail' && (
        <>
          {/* Inventory card */}
          <div className="rounded-lg border border-gray-200 bg-surface p-6">
            <h2 className="mb-4 text-base font-semibold text-gray-900">Inventory</h2>
            <DetailRow label="Track Inventory" value={item.isTrackable ? 'Yes' : 'No'} />
          </div>

          {/* Option Sets card */}
          {retailMeta?.optionSets && retailMeta.optionSets.length > 0 && (
            <div className="rounded-lg border border-gray-200 bg-surface p-6">
              <h2 className="mb-4 text-base font-semibold text-gray-900">Option Sets</h2>
              <div className="space-y-4">
                {retailMeta.optionSets.map((set, idx) => (
                  <div key={idx} className="rounded-lg border border-gray-100 p-4">
                    <div className="mb-2 flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900">{set.name}</span>
                      {set.required && <Badge variant="warning">Required</Badge>}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {set.options.map((opt) => (
                        <Badge key={opt} variant="neutral">
                          {opt}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {typeGroup === 'service' && (
        <div className="rounded-lg border border-gray-200 bg-surface p-6">
          <h2 className="mb-4 text-base font-semibold text-gray-900">Service Details</h2>
          <div className="space-y-3">
            <DetailRow
              label="Duration"
              value={serviceMeta?.durationMinutes ? `${serviceMeta.durationMinutes} minutes` : '-'}
            />
            <DetailRow
              label="Requires Booking"
              value={serviceMeta?.requiresBooking ? 'Yes' : 'No'}
            />
          </div>
        </div>
      )}

      {typeGroup === 'package' && (
        <div className="rounded-lg border border-gray-200 bg-surface p-6">
          <h2 className="mb-4 text-base font-semibold text-gray-900">Package Components</h2>
          {packageMeta?.packageComponents && packageMeta.packageComponents.length > 0 ? (
            <>
              <DataTable
                columns={[
                  {
                    key: 'itemName',
                    header: 'Item Name',
                    render: (row) => (
                      <span className="font-medium text-gray-900">{row.itemName as string}</span>
                    ),
                  },
                  {
                    key: 'itemType',
                    header: 'Type',
                    render: (row) => {
                      const g = getItemTypeGroup(row.itemType as string);
                      const b = ITEM_TYPE_BADGES[g];
                      return <Badge variant={b.variant}>{b.label}</Badge>;
                    },
                  },
                  {
                    key: 'qty',
                    header: 'Qty',
                    render: (row) => <span>{String(row.qty)}</span>,
                  },
                ]}
                data={
                  packageMeta.packageComponents.map((c) => ({
                    ...c,
                    id: c.catalogItemId,
                  })) as (Record<string, unknown> & { id: string })[]
                }
              />
              <div className="mt-3 flex items-center justify-between text-sm text-gray-600">
                <span>
                  Total components: {packageMeta.packageComponents.reduce((sum, c) => sum + c.qty, 0)}
                </span>
                {packageMeta.pricingMode === 'fixed' && (
                  <Badge variant="info">Fixed Price</Badge>
                )}
                {packageMeta.pricingMode === 'sum_of_components' && (
                  <Badge variant="info">Sum of Components</Badge>
                )}
              </div>
            </>
          ) : (
            <p className="text-sm text-gray-500">No components configured</p>
          )}
        </div>
      )}

      {/* Tax Groups section */}
      <div className="rounded-lg border border-gray-200 bg-surface p-6">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-base font-semibold text-gray-900">Tax Groups</h2>
          <Select
            options={locationOptions}
            value={taxLocationId}
            onChange={(v) => setTaxLocationId(v as string)}
            placeholder="Select location..."
            className="w-full sm:w-64"
          />
        </div>

        {taxLocationId && (
          <>
            {itemTaxLoading || taxGroupsLoading ? (
              <div className="flex justify-center py-6">
                <LoadingSpinner size="sm" />
              </div>
            ) : (
              <>
                {assignedTaxGroups && assignedTaxGroups.length > 0 ? (
                  <DataTable
                    columns={[
                      {
                        key: 'taxGroupName',
                        header: 'Group Name',
                        render: (row) => (
                          <span className="font-medium text-gray-900">
                            {row.taxGroupName as string}
                          </span>
                        ),
                      },
                      {
                        key: 'calculationMode',
                        header: 'Mode',
                        render: (row) => (
                          <Badge variant="info">{row.calculationMode as string}</Badge>
                        ),
                      },
                      {
                        key: 'rates',
                        header: 'Rates',
                        render: (row) => {
                          const group = availableTaxGroups?.find(
                            (g) => g.id === (row.taxGroupId as string),
                          );
                          if (!group || !group.rates.length) return '-';
                          return group.rates.map((r) => r.name).join(', ');
                        },
                      },
                      {
                        key: 'totalRate',
                        header: 'Total Rate',
                        render: (row) => {
                          const group = availableTaxGroups?.find(
                            (g) => g.id === (row.taxGroupId as string),
                          );
                          if (!group) return '-';
                          return `${(group.totalRate * 100).toFixed(2)}%`;
                        },
                      },
                    ]}
                    data={
                      assignedTaxGroups as unknown as Record<string, unknown>[]
                    }
                    emptyMessage="No tax groups assigned"
                  />
                ) : (
                  <p className="py-4 text-center text-sm text-gray-500">
                    No tax groups assigned at this location
                  </p>
                )}

                <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    {effectiveTaxInfo && (
                      <p className="text-sm text-gray-600">
                        Effective tax rate at{' '}
                        <span className="font-medium">
                          {locationMap.get(taxLocationId) ?? taxLocationId}
                        </span>
                        : {effectiveTaxInfo.totalRate}% ({effectiveTaxInfo.mode})
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowTaxEdit(true)}
                    className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700 focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:outline-none"
                  >
                    Edit Tax Groups
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </div>

      {/* Location Prices section */}
      <div className="rounded-lg border border-gray-200 bg-surface p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">Location Prices</h2>
          <button
            type="button"
            onClick={() => setShowAddPrice(true)}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700 focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            Set Location Price
          </button>
        </div>

        {locationPrices.length > 0 ? (
          <DataTable
            columns={[
              {
                key: 'locationId',
                header: 'Location Name',
                render: (row) => (
                  <span className="font-medium text-gray-900">
                    {locationMap.get(row.locationId as string) ?? (row.locationId as string)}
                  </span>
                ),
              },
              {
                key: 'price',
                header: 'Override Price',
                render: (row) => formatCurrency(row.price as string),
              },
              {
                key: 'actions',
                header: '',
                width: '80px',
                render: (row) => (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setRemovePriceTarget({
                        locationId: row.locationId as string,
                        locationName: locationMap.get(row.locationId as string) ?? (row.locationId as string),
                      });
                    }}
                    className="text-sm font-medium text-red-600 hover:text-red-700"
                  >
                    Remove
                  </button>
                ),
              },
            ]}
            data={
              locationPrices.map((lp) => ({
                ...lp,
                id: lp.locationId,
              })) as (Record<string, unknown> & { id: string })[]
            }
            emptyMessage="No location price overrides"
          />
        ) : (
          <p className="py-4 text-center text-sm text-gray-500">No location price overrides</p>
        )}
      </div>

      {/* ---------- Dialogs ---------- */}

      {/* Deactivate dialog */}
      <ConfirmDialog
        open={showDeactivate}
        onClose={() => setShowDeactivate(false)}
        onConfirm={handleDeactivate}
        title="Deactivate Item"
        description={`Are you sure you want to deactivate "${item.name}"? This item will no longer appear in active listings.`}
        confirmLabel="Deactivate"
        destructive
        isLoading={deactivating}
      />

      {/* Edit Tax Groups dialog */}
      {showTaxEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50" onClick={() => setShowTaxEdit(false)} />
          <div className="relative w-full max-w-md rounded-lg bg-surface p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900">Edit Tax Groups</h3>
            <p className="mt-1 text-xs text-gray-500">
              All selected groups must use the same calculation mode (V1 constraint).
            </p>
            <div className="mt-4">
              <FormField label="Tax Groups">
                <Select
                  options={taxGroupOptions}
                  value={selectedTaxGroupIds}
                  onChange={(v) => setSelectedTaxGroupIds(v as string[])}
                  placeholder="Select tax groups..."
                  multiple
                />
              </FormField>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowTaxEdit(false);
                  if (assignedTaxGroups) {
                    setSelectedTaxGroupIds(assignedTaxGroups.map((g) => g.taxGroupId));
                  }
                }}
                disabled={savingTaxGroups}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:outline-none"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveTaxGroups}
                disabled={savingTaxGroups}
                className={`rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700 focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:outline-none ${
                  savingTaxGroups ? 'cursor-not-allowed opacity-50' : ''
                }`}
              >
                {savingTaxGroups ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Location Price dialog */}
      {showAddPrice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50" onClick={() => setShowAddPrice(false)} />
          <div className="relative w-full max-w-md rounded-lg bg-surface p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900">Set Location Price</h3>
            <div className="mt-4 space-y-4">
              <FormField label="Location" required>
                <Select
                  options={locationOptions}
                  value={priceLocationId}
                  onChange={(v) => setPriceLocationId(v as string)}
                  placeholder="Select location..."
                />
              </FormField>
              <FormField label="Price" required>
                <CurrencyInput
                  value={priceValue}
                  onChange={setPriceValue}
                  placeholder="0.00"
                />
              </FormField>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowAddPrice(false);
                  setPriceLocationId('');
                  setPriceValue(null);
                }}
                disabled={savingPrice}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:outline-none"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSetPrice}
                disabled={savingPrice || !priceLocationId || priceValue == null}
                className={`rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700 focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:outline-none ${
                  savingPrice || !priceLocationId || priceValue == null
                    ? 'cursor-not-allowed opacity-50'
                    : ''
                }`}
              >
                {savingPrice ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Remove Location Price dialog */}
      <ConfirmDialog
        open={!!removePriceTarget}
        onClose={() => setRemovePriceTarget(null)}
        onConfirm={handleRemovePrice}
        title="Remove Location Price"
        description={`Remove the price override for "${removePriceTarget?.locationName ?? ''}"? The default price will apply instead.`}
        confirmLabel="Remove"
        destructive
        isLoading={removingPrice}
      />
    </div>
  );
}

// ---------- Sub-components ----------

function DetailRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between border-b border-gray-100 pb-3">
      <span className="text-sm font-medium text-gray-500">{label}</span>
      <span className={`text-sm text-gray-900 ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  );
}

function ModifierGroupCard({ group }: { group: ModifierGroupDetail }) {
  return (
    <div className="rounded-lg border border-gray-100 p-4">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-sm font-medium text-gray-900">{group.name}</span>
        <Badge variant={group.isRequired ? 'warning' : 'neutral'}>
          {group.isRequired ? 'Required' : 'Optional'}
        </Badge>
        <Badge variant="info">{group.selectionType}</Badge>
      </div>
      {group.minSelections != null || group.maxSelections != null ? (
        <p className="mb-2 text-xs text-gray-500">
          Selections: {group.minSelections ?? 0}
          {group.maxSelections != null ? ` - ${group.maxSelections}` : '+'}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-1.5">
        {group.modifiers
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((m) => (
            <Badge key={m.id} variant={m.isActive ? 'neutral' : 'error'}>
              {m.name}
              {Number(m.priceAdjustment) !== 0 && (
                <span className="ml-1 text-xs">
                  ({Number(m.priceAdjustment) > 0 ? '+' : ''}
                  {formatCurrency(m.priceAdjustment)})
                </span>
              )}
            </Badge>
          ))}
      </div>
    </div>
  );
}
