'use client';

import { useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, PackagePlus, SlidersHorizontal, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { DataTable } from '@/components/ui/data-table';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { FormField } from '@/components/ui/form-field';
import { Select } from '@/components/ui/select';
import { useInventoryItem, useMovements } from '@/hooks/use-inventory';
import { useToast } from '@/components/ui/toast';
import { apiFetch } from '@/lib/api-client';
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

function todayISO(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getStockColor(item: InventoryItem): string {
  if (item.onHand < 0) return 'text-red-600';
  const reorderPoint = item.reorderPoint ? parseFloat(item.reorderPoint) : null;
  if (reorderPoint !== null && item.onHand <= reorderPoint) return 'text-amber-600';
  return 'text-green-600';
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

const shrinkTypeOptions = [
  { value: 'waste', label: 'Waste' },
  { value: 'theft', label: 'Theft' },
  { value: 'damage', label: 'Damage' },
  { value: 'expiry', label: 'Expiry' },
  { value: 'other', label: 'Other' },
];

// ── ReceiveDialog ─────────────────────────────────────────────────

function ReceiveDialog({
  open,
  onClose,
  itemId,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  itemId: string;
  onSuccess: () => void;
}) {
  const { toast } = useToast();
  const [quantity, setQuantity] = useState('');
  const [unitCost, setUnitCost] = useState('');
  const [reason, setReason] = useState('');
  const [businessDate, setBusinessDate] = useState(todayISO());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const resetForm = useCallback(() => {
    setQuantity('');
    setUnitCost('');
    setReason('');
    setBusinessDate(todayISO());
    setErrors({});
  }, []);

  const handleClose = useCallback(() => {
    resetForm();
    onClose();
  }, [resetForm, onClose]);

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    const qty = parseFloat(quantity);
    if (!quantity || Number.isNaN(qty) || qty <= 0) {
      newErrors.quantity = 'Quantity must be a positive number';
    }
    if (unitCost) {
      const cost = parseFloat(unitCost);
      if (Number.isNaN(cost) || cost < 0) {
        newErrors.unitCost = 'Unit cost must be a non-negative number';
      }
    }
    if (!businessDate) {
      newErrors.businessDate = 'Business date is required';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setIsSubmitting(true);
    try {
      await apiFetch(`/api/v1/inventory/receive`, {
        method: 'POST',
        body: JSON.stringify({
          inventoryItemId: itemId,
          quantity: parseFloat(quantity),
          unitCost: unitCost ? parseFloat(unitCost) : undefined,
          reason: reason || undefined,
          businessDate,
        }),
      });
      toast.success('Stock received successfully');
      handleClose();
      onSuccess();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to receive stock');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/50" onClick={handleClose} />
      <div className="relative w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <h3 className="text-lg font-semibold text-gray-900">Receive Stock</h3>
        <p className="mt-1 text-sm text-gray-500">
          Record incoming inventory for this item.
        </p>

        <div className="mt-4 space-y-4">
          <FormField label="Quantity" required error={errors.quantity}>
            <input
              type="number"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="0"
              min="0"
              step="any"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
            />
          </FormField>

          <FormField label="Unit Cost" error={errors.unitCost} helpText="Cost per unit in dollars">
            <input
              type="number"
              value={unitCost}
              onChange={(e) => setUnitCost(e.target.value)}
              placeholder="0.00"
              min="0"
              step="0.01"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
            />
          </FormField>

          <FormField label="Reason">
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Purchase order #1234"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
            />
          </FormField>

          <FormField label="Business Date" required error={errors.businessDate}>
            <input
              type="date"
              value={businessDate}
              onChange={(e) => setBusinessDate(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
            />
          </FormField>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={handleClose}
            disabled={isSubmitting}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className={`rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700 focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:outline-none ${
              isSubmitting ? 'cursor-not-allowed opacity-50' : ''
            }`}
          >
            {isSubmitting ? 'Receiving...' : 'Receive'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ── AdjustDialog ──────────────────────────────────────────────────

function AdjustDialog({
  open,
  onClose,
  itemId,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  itemId: string;
  onSuccess: () => void;
}) {
  const { toast } = useToast();
  const [quantityDelta, setQuantityDelta] = useState('');
  const [reason, setReason] = useState('');
  const [businessDate, setBusinessDate] = useState(todayISO());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const resetForm = useCallback(() => {
    setQuantityDelta('');
    setReason('');
    setBusinessDate(todayISO());
    setErrors({});
  }, []);

  const handleClose = useCallback(() => {
    resetForm();
    onClose();
  }, [resetForm, onClose]);

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    const delta = parseFloat(quantityDelta);
    if (!quantityDelta || Number.isNaN(delta) || delta === 0) {
      newErrors.quantityDelta = 'Quantity delta is required and cannot be zero';
    }
    if (!reason.trim()) {
      newErrors.reason = 'Reason is required for adjustments';
    }
    if (!businessDate) {
      newErrors.businessDate = 'Business date is required';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setIsSubmitting(true);
    try {
      await apiFetch(`/api/v1/inventory/adjust`, {
        method: 'POST',
        body: JSON.stringify({
          inventoryItemId: itemId,
          quantityDelta: parseFloat(quantityDelta),
          reason: reason.trim(),
          businessDate,
        }),
      });
      toast.success('Inventory adjusted successfully');
      handleClose();
      onSuccess();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to adjust inventory');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/50" onClick={handleClose} />
      <div className="relative w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <h3 className="text-lg font-semibold text-gray-900">Adjust Inventory</h3>
        <p className="mt-1 text-sm text-gray-500">
          Manually adjust the stock quantity. Use negative values to reduce.
        </p>

        <div className="mt-4 space-y-4">
          <FormField label="Quantity Delta" required error={errors.quantityDelta} helpText="Positive to add, negative to subtract">
            <input
              type="number"
              value={quantityDelta}
              onChange={(e) => setQuantityDelta(e.target.value)}
              placeholder="e.g. -5 or 10"
              step="any"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
            />
          </FormField>

          <FormField label="Reason" required error={errors.reason}>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Physical count correction"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
            />
          </FormField>

          <FormField label="Business Date" required error={errors.businessDate}>
            <input
              type="date"
              value={businessDate}
              onChange={(e) => setBusinessDate(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
            />
          </FormField>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={handleClose}
            disabled={isSubmitting}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className={`rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700 focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:outline-none ${
              isSubmitting ? 'cursor-not-allowed opacity-50' : ''
            }`}
          >
            {isSubmitting ? 'Adjusting...' : 'Adjust'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ── ShrinkDialog ──────────────────────────────────────────────────

function ShrinkDialog({
  open,
  onClose,
  itemId,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  itemId: string;
  onSuccess: () => void;
}) {
  const { toast } = useToast();
  const [quantity, setQuantity] = useState('');
  const [shrinkType, setShrinkType] = useState('waste');
  const [reason, setReason] = useState('');
  const [businessDate, setBusinessDate] = useState(todayISO());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const resetForm = useCallback(() => {
    setQuantity('');
    setShrinkType('waste');
    setReason('');
    setBusinessDate(todayISO());
    setErrors({});
  }, []);

  const handleClose = useCallback(() => {
    resetForm();
    onClose();
  }, [resetForm, onClose]);

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    const qty = parseFloat(quantity);
    if (!quantity || Number.isNaN(qty) || qty <= 0) {
      newErrors.quantity = 'Quantity must be a positive number';
    }
    if (!shrinkType) {
      newErrors.shrinkType = 'Shrink type is required';
    }
    if (!reason.trim()) {
      newErrors.reason = 'Reason is required for shrink records';
    }
    if (!businessDate) {
      newErrors.businessDate = 'Business date is required';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setIsSubmitting(true);
    try {
      await apiFetch(`/api/v1/inventory/shrink`, {
        method: 'POST',
        body: JSON.stringify({
          inventoryItemId: itemId,
          quantity: parseFloat(quantity),
          shrinkType,
          reason: reason.trim(),
          businessDate,
        }),
      });
      toast.success('Shrink recorded successfully');
      handleClose();
      onSuccess();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to record shrink');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/50" onClick={handleClose} />
      <div className="relative w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <h3 className="text-lg font-semibold text-gray-900">Record Shrink</h3>
        <p className="mt-1 text-sm text-gray-500">
          Record lost, wasted, damaged, or stolen inventory.
        </p>

        <div className="mt-4 space-y-4">
          <FormField label="Quantity" required error={errors.quantity}>
            <input
              type="number"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="0"
              min="0"
              step="any"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
            />
          </FormField>

          <FormField label="Shrink Type" required error={errors.shrinkType}>
            <Select
              options={shrinkTypeOptions}
              value={shrinkType}
              onChange={(v) => setShrinkType(v as string)}
              placeholder="Select type..."
            />
          </FormField>

          <FormField label="Reason" required error={errors.reason}>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Expired product, dropped on floor"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
            />
          </FormField>

          <FormField label="Business Date" required error={errors.businessDate}>
            <input
              type="date"
              value={businessDate}
              onChange={(e) => setBusinessDate(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
            />
          </FormField>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={handleClose}
            disabled={isSubmitting}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className={`rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 focus-visible:outline-none ${
              isSubmitting ? 'cursor-not-allowed opacity-50' : ''
            }`}
          >
            {isSubmitting ? 'Recording...' : 'Record Shrink'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ── Detail Row helper ─────────────────────────────────────────────

function DetailRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string | React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between border-b border-gray-100 pb-3">
      <span className="text-sm font-medium text-gray-500">{label}</span>
      {typeof value === 'string' ? (
        <span className={`text-sm text-gray-900 ${mono ? 'font-mono' : ''}`}>{value}</span>
      ) : (
        value
      )}
    </div>
  );
}

// ── Movement history row type ─────────────────────────────────────

type MovementRow = InventoryMovement & Record<string, unknown>;

// ── Main Page Component ───────────────────────────────────────────

export default function InventoryDetailPage() {
  const params = useParams();
  const router = useRouter();
  const itemId = params.id as string;

  const { data: item, isLoading: itemLoading, mutate: refetchItem } = useInventoryItem(itemId);
  const {
    data: movements,
    isLoading: movementsLoading,
    hasMore: movementsHasMore,
    loadMore: loadMoreMovements,
    mutate: refetchMovements,
  } = useMovements(itemId);

  const [showReceive, setShowReceive] = useState(false);
  const [showAdjust, setShowAdjust] = useState(false);
  const [showShrink, setShowShrink] = useState(false);

  const handleActionSuccess = useCallback(() => {
    refetchItem();
    refetchMovements();
  }, [refetchItem, refetchMovements]);

  // Movement table columns
  const movementColumns = [
    {
      key: 'createdAt',
      header: 'Date',
      render: (row: MovementRow) => (
        <span className="text-sm text-gray-600">{formatDateTime(row.createdAt)}</span>
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
          <span className={`font-semibold ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
            {isPositive ? '+' : ''}{formatQty(delta)}
          </span>
        );
      },
    },
    {
      key: 'unitCost',
      header: 'Cost',
      render: (row: MovementRow) => (
        <span className="text-sm text-gray-500">{formatCurrency(row.unitCost)}</span>
      ),
    },
    {
      key: 'referenceType',
      header: 'Reference',
      render: (row: MovementRow) => (
        <span className="text-sm text-gray-500">
          {row.referenceType ? `${row.referenceType}` : '\u2014'}
        </span>
      ),
    },
    {
      key: 'reason',
      header: 'Reason',
      render: (row: MovementRow) => (
        <span className="text-sm text-gray-500">{row.reason || '\u2014'}</span>
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
        <span className="text-sm text-gray-500">{row.employeeId || '\u2014'}</span>
      ),
    },
  ];

  // Loading state
  if (itemLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <LoadingSpinner size="lg" label="Loading inventory item..." />
      </div>
    );
  }

  // Not found state
  if (!item) {
    return (
      <div className="flex min-h-[400px] flex-col items-center justify-center gap-4">
        <p className="text-sm text-gray-500">Inventory item not found</p>
        <button
          type="button"
          onClick={() => router.push('/inventory')}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          Back to Inventory
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Back link */}
      <button
        type="button"
        onClick={() => router.push('/inventory')}
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Inventory
      </button>

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold text-gray-900">{item.name}</h1>
          {getStatusBadge(item.status)}
          <Badge variant="info">{item.itemType}</Badge>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setShowReceive(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700 focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            <PackagePlus className="h-4 w-4" />
            Receive
          </button>
          <button
            type="button"
            onClick={() => setShowAdjust(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            <SlidersHorizontal className="h-4 w-4" />
            Adjust
          </button>
          <button
            type="button"
            onClick={() => setShowShrink(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-50 focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            <Trash2 className="h-4 w-4" />
            Record Shrink
          </button>
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">On Hand</p>
          <p className={`mt-1 text-2xl font-bold ${getStockColor(item)}`}>
            {formatQty(item.onHand)}
          </p>
          <p className="mt-0.5 text-xs text-gray-400">{item.baseUnit}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Reorder Point</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">
            {item.reorderPoint ? formatQty(item.reorderPoint) : '\u2014'}
          </p>
          <p className="mt-0.5 text-xs text-gray-400">{item.baseUnit}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Par Level</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">
            {item.parLevel ? formatQty(item.parLevel) : '\u2014'}
          </p>
          <p className="mt-0.5 text-xs text-gray-400">{item.baseUnit}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Costing Method</p>
          <p className="mt-1 text-2xl font-bold text-gray-900 capitalize">
            {item.costingMethod}
          </p>
          {item.standardCost && (
            <p className="mt-0.5 text-xs text-gray-400">
              Standard: {formatCurrency(item.standardCost)}
            </p>
          )}
        </div>
      </div>

      {/* Details card */}
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="mb-4 text-base font-semibold text-gray-900">Item Details</h2>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div className="space-y-4">
            <DetailRow label="Name" value={item.name} />
            <DetailRow label="SKU" value={item.sku || '\u2014'} mono />
            <DetailRow label="Item Type" value={item.itemType} />
            <DetailRow label="Status" value={getStatusBadge(item.status)} />
            <DetailRow label="Track Inventory" value={item.trackInventory ? 'Yes' : 'No'} />
          </div>
          <div className="space-y-4">
            <DetailRow label="Base Unit" value={item.baseUnit} />
            <DetailRow label="Purchase Unit" value={item.purchaseUnit} />
            <DetailRow label="Purchase to Base Ratio" value={item.purchaseToBaseRatio} />
            <DetailRow label="Reorder Quantity" value={item.reorderQuantity ? formatQty(item.reorderQuantity) : '\u2014'} />
            <DetailRow label="Allow Negative" value={item.allowNegative ? 'Yes' : 'No'} />
          </div>
        </div>
      </div>

      {/* Movement history */}
      <div className="rounded-lg border border-gray-200 bg-white">
        <div className="border-b border-gray-200 px-6 py-4">
          <h2 className="text-base font-semibold text-gray-900">Movement History</h2>
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
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
              >
                Load More
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Dialogs */}
      <ReceiveDialog
        open={showReceive}
        onClose={() => setShowReceive(false)}
        itemId={itemId}
        onSuccess={handleActionSuccess}
      />
      <AdjustDialog
        open={showAdjust}
        onClose={() => setShowAdjust(false)}
        itemId={itemId}
        onSuccess={handleActionSuccess}
      />
      <ShrinkDialog
        open={showShrink}
        onClose={() => setShowShrink(false)}
        itemId={itemId}
        onSuccess={handleActionSuccess}
      />
    </div>
  );
}
