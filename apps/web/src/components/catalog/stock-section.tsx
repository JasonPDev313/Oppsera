'use client';

import { useState, useCallback, useMemo } from 'react';
import { PackagePlus, SlidersHorizontal, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { DataTable } from '@/components/ui/data-table';
import { Select } from '@/components/ui/select';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { ReceiveDialog } from '@/components/inventory/receive-dialog';
import { AdjustDialog } from '@/components/inventory/adjust-dialog';
import { ShrinkDialog } from '@/components/inventory/shrink-dialog';
import { useInventoryForCatalogItem } from '@/hooks/use-inventory-for-catalog-item';
import { useMovements } from '@/hooks/use-inventory';
import { useAuthContext } from '@/components/auth-provider';
import type { InventoryItem, InventoryMovement } from '@/types/inventory';

// ── Helpers ───────────────────────────────────────────────────────

function formatQty(val: number | string): string {
  const n = typeof val === 'string' ? parseFloat(val) : val;
  if (Number.isNaN(n)) return '\u2014';
  if (Number.isInteger(n)) return n.toString();
  return n.toFixed(2);
}

function formatCurrency(val: string | null): string {
  if (!val) return '\u2014';
  return `$${Number(val).toFixed(2)}`;
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

function getStockColor(item: InventoryItem): string {
  if (item.onHand < 0) return 'text-red-500';
  const reorderPoint = item.reorderPoint ? parseFloat(item.reorderPoint) : null;
  if (reorderPoint !== null && item.onHand <= reorderPoint) return 'text-amber-500';
  return 'text-green-500';
}

function getStatusBadge(status: string) {
  switch (status) {
    case 'active': return <Badge variant="success">Active</Badge>;
    case 'discontinued': return <Badge variant="warning">Discontinued</Badge>;
    case 'archived': return <Badge variant="neutral">Archived</Badge>;
    default: return <Badge variant="neutral">{status}</Badge>;
  }
}

const MOVEMENT_BADGES: Record<string, { label: string; variant: string }> = {
  receive: { label: 'Receive', variant: 'success' },
  sale: { label: 'Sale', variant: 'error' },
  void_reversal: { label: 'Void Reversal', variant: 'info' },
  adjustment: { label: 'Adjustment', variant: 'purple' },
  transfer_in: { label: 'Transfer In', variant: 'success' },
  transfer_out: { label: 'Transfer Out', variant: 'orange' },
  shrink: { label: 'Shrink', variant: 'error' },
  waste: { label: 'Waste', variant: 'error' },
  return: { label: 'Return', variant: 'info' },
  initial: { label: 'Initial', variant: 'neutral' },
  conversion: { label: 'Conversion', variant: 'indigo' },
};

function getMovementBadge(type: string) {
  const badge = MOVEMENT_BADGES[type] || { label: type, variant: 'neutral' };
  return <Badge variant={badge.variant}>{badge.label}</Badge>;
}

// ── Types ─────────────────────────────────────────────────────────

type MovementRow = InventoryMovement & Record<string, unknown>;

interface StockSectionProps {
  catalogItemId: string;
  isTrackable: boolean;
}

// ── Component ─────────────────────────────────────────────────────

export function StockSection({ catalogItemId, isTrackable }: StockSectionProps) {
  const { locations } = useAuthContext();

  // Location selector
  const [locationId, setLocationId] = useState(() => locations[0]?.id ?? '');

  const locationOptions = useMemo(
    () => locations.map((l) => ({ value: l.id, label: l.name })),
    [locations],
  );

  // Inventory data
  const {
    data: invItem,
    isLoading: invLoading,
    mutate: refetchInv,
  } = useInventoryForCatalogItem(isTrackable ? catalogItemId : null, locationId || undefined);

  // Movement history — only fetch when we have the inventory item ID
  const {
    data: movements,
    isLoading: movementsLoading,
    hasMore: movementsHasMore,
    loadMore: loadMoreMovements,
    mutate: refetchMovements,
  } = useMovements(invItem?.id ?? null);

  // Dialog state
  const [showReceive, setShowReceive] = useState(false);
  const [showAdjust, setShowAdjust] = useState(false);
  const [showShrink, setShowShrink] = useState(false);

  const handleActionSuccess = useCallback(() => {
    refetchInv();
    refetchMovements();
  }, [refetchInv, refetchMovements]);

  // Movement table columns
  const movementColumns = useMemo(() => [
    {
      key: 'createdAt',
      header: 'Date',
      render: (row: MovementRow) => (
        <span className="text-sm text-muted-foreground">{formatDateTime(row.createdAt)}</span>
      ),
    },
    {
      key: 'movementType',
      header: 'Type',
      render: (row: MovementRow) => getMovementBadge(row.movementType),
    },
    {
      key: 'quantityDelta',
      header: 'Qty Delta',
      render: (row: MovementRow) => {
        const delta = parseFloat(row.quantityDelta);
        const isPositive = delta > 0;
        return (
          <span className={`font-semibold ${isPositive ? 'text-green-500' : 'text-red-500'}`}>
            {isPositive ? '+' : ''}{formatQty(delta)}
          </span>
        );
      },
    },
    {
      key: 'unitCost',
      header: 'Cost',
      render: (row: MovementRow) => (
        <span className="text-sm text-muted-foreground">{formatCurrency(row.unitCost)}</span>
      ),
    },
    {
      key: 'referenceType',
      header: 'Reference',
      render: (row: MovementRow) => (
        <span className="text-sm text-muted-foreground">
          {row.referenceType ? `${row.referenceType}` : '\u2014'}
        </span>
      ),
    },
    {
      key: 'reason',
      header: 'Reason',
      render: (row: MovementRow) => (
        <span className="text-sm text-muted-foreground">{row.reason || '\u2014'}</span>
      ),
    },
    {
      key: 'source',
      header: 'Source',
      render: (row: MovementRow) => (
        <Badge variant="neutral">{row.source}</Badge>
      ),
    },
    {
      key: 'employeeId',
      header: 'Employee',
      render: (row: MovementRow) => (
        <span className="text-sm text-muted-foreground">{row.employeeId || '\u2014'}</span>
      ),
    },
  ], []);

  // Don't render at all if item is not trackable
  if (!isTrackable) {
    return (
      <div className="rounded-lg border border-border bg-surface p-6">
        <h2 className="text-base font-semibold text-foreground">Inventory</h2>
        <p className="mt-2 text-sm text-muted-foreground">Inventory tracking is disabled for this item.</p>
      </div>
    );
  }

  return (
    <>
      {/* Stock header with location selector and actions */}
      <div className="rounded-lg border border-border bg-surface p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-base font-semibold text-foreground">Stock</h2>
          <div className="flex flex-wrap items-center gap-3">
            {locations.length > 1 && (
              <Select
                options={locationOptions}
                value={locationId}
                onChange={(v) => setLocationId(v as string)}
                placeholder="Select location..."
                className="w-full sm:w-64"
              />
            )}
            {invItem && (
              <>
                <button
                  type="button"
                  onClick={() => setShowReceive(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500 focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:outline-none"
                >
                  <PackagePlus className="h-3.5 w-3.5" />
                  Receive
                </button>
                <button
                  type="button"
                  onClick={() => setShowAdjust(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-input px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:outline-none"
                >
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                  Adjust
                </button>
                <button
                  type="button"
                  onClick={() => setShowShrink(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/40 px-3 py-1.5 text-sm font-medium text-red-500 transition-colors hover:bg-red-500/10 focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 focus-visible:outline-none"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Shrink
                </button>
              </>
            )}
          </div>
        </div>

        {invLoading ? (
          <div className="flex justify-center py-8">
            <LoadingSpinner size="sm" />
          </div>
        ) : !invItem ? (
          <p className="mt-4 text-sm text-muted-foreground">
            No inventory record at this location. Stock records are auto-created when this product is sold or received here.
          </p>
        ) : (
          <>
            {/* Stats cards */}
            <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
              <div className="rounded-lg border border-border bg-surface p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">On Hand</p>
                <p className={`mt-1 text-2xl font-bold ${getStockColor(invItem)}`}>
                  {formatQty(invItem.onHand)}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">{invItem.baseUnit}</p>
              </div>
              <div className="rounded-lg border border-border bg-surface p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Reorder Point</p>
                <p className="mt-1 text-2xl font-bold text-foreground">
                  {invItem.reorderPoint ? formatQty(invItem.reorderPoint) : '\u2014'}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">{invItem.baseUnit}</p>
              </div>
              <div className="rounded-lg border border-border bg-surface p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Par Level</p>
                <p className="mt-1 text-2xl font-bold text-foreground">
                  {invItem.parLevel ? formatQty(invItem.parLevel) : '\u2014'}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">{invItem.baseUnit}</p>
              </div>
              <div className="rounded-lg border border-border bg-surface p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Costing Method</p>
                <p className="mt-1 text-2xl font-bold text-foreground capitalize">
                  {invItem.costingMethod}
                </p>
                {invItem.standardCost && (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Standard: {formatCurrency(invItem.standardCost)}
                  </p>
                )}
              </div>
            </div>

            {/* Stock details */}
            <div className="mt-4 grid grid-cols-1 gap-x-8 gap-y-2 md:grid-cols-2">
              <DetailRow label="Status" value={getStatusBadge(invItem.status)} />
              <DetailRow label="Base Unit" value={invItem.baseUnit} />
              <DetailRow label="Purchase Unit" value={invItem.purchaseUnit} />
              <DetailRow label="Purchase to Base Ratio" value={invItem.purchaseToBaseRatio} />
              <DetailRow label="Reorder Quantity" value={invItem.reorderQuantity ? formatQty(invItem.reorderQuantity) : '\u2014'} />
              <DetailRow label="Allow Negative" value={invItem.allowNegative ? 'Yes' : 'No'} />
            </div>
          </>
        )}
      </div>

      {/* Movement History */}
      {invItem && (
        <div className="rounded-lg border border-border bg-surface">
          <div className="border-b border-border px-6 py-4">
            <h2 className="text-base font-semibold text-foreground">Movement History</h2>
          </div>
          <div className="p-6">
            <DataTable
              columns={movementColumns}
              data={movements as MovementRow[]}
              isLoading={movementsLoading}
              emptyMessage="No movements recorded yet"
            />
            {movementsHasMore && (
              <div className="mt-4 flex justify-center">
                <button
                  type="button"
                  onClick={loadMoreMovements}
                  className="rounded-lg border border-input px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
                >
                  Load More
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Dialogs */}
      {invItem && (
        <>
          <ReceiveDialog
            open={showReceive}
            onClose={() => setShowReceive(false)}
            inventoryItemId={invItem.id}
            onSuccess={handleActionSuccess}
          />
          <AdjustDialog
            open={showAdjust}
            onClose={() => setShowAdjust(false)}
            inventoryItemId={invItem.id}
            onSuccess={handleActionSuccess}
          />
          <ShrinkDialog
            open={showShrink}
            onClose={() => setShowShrink(false)}
            inventoryItemId={invItem.id}
            onSuccess={handleActionSuccess}
          />
        </>
      )}
    </>
  );
}

// ── Sub-components ────────────────────────────────────────────────

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: string | React.ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between border-b border-border py-2">
      <span className="text-sm font-medium text-muted-foreground">{label}</span>
      {typeof value === 'string' ? (
        <span className="text-sm text-foreground">{value}</span>
      ) : (
        value
      )}
    </div>
  );
}
