'use client';

import { useState } from 'react';
import { ArrowLeft, Send, Ban, Plus, Trash2 } from 'lucide-react';
import { ReceiptStatusBadge } from './receipt-status-badge';
import { Select } from '@/components/ui/select';
import type { Receipt, ReceiptCharge, Vendor } from '@/types/receiving';

interface ReceiptHeaderProps {
  receipt: Receipt;
  vendors: Vendor[];
  onBack: () => void;
  onHeaderChange: (field: string, value: unknown) => void;
  onPost: () => void;
  onVoid: () => void;
  canPost: boolean;
  onAddCharge?: (charge: { chargeType?: string; description?: string; amount: number; glAccountCode?: string; glAccountName?: string }) => Promise<void>;
  onUpdateCharge?: (chargeId: string, updates: Partial<ReceiptCharge>) => Promise<void>;
  onRemoveCharge?: (chargeId: string) => Promise<void>;
}

const FREIGHT_MODE_OPTIONS = [
  { value: 'allocate', label: 'Allocate to Items' },
  { value: 'expense', label: 'Expense to GL' },
];

const ALLOCATION_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'by_cost', label: 'By Cost' },
  { value: 'by_qty', label: 'By Quantity' },
  { value: 'by_weight', label: 'By Weight' },
  { value: 'by_volume', label: 'By Volume' },
  { value: 'manual', label: 'Manual' },
];

const CHARGE_TYPE_OPTIONS = [
  { value: 'shipping', label: 'Shipping' },
  { value: 'freight', label: 'Freight' },
  { value: 'handling', label: 'Handling' },
  { value: 'other', label: 'Other' },
];

function formatMoney(value: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
}

export function ReceiptHeader({
  receipt,
  vendors,
  onBack,
  onHeaderChange,
  onPost,
  onVoid,
  canPost,
  onAddCharge,
  onRemoveCharge,
}: ReceiptHeaderProps) {
  const isDraft = receipt.status === 'draft';
  const vendorOptions = vendors.map((v) => ({ value: v.id, label: v.name }));
  const isExpenseMode = receipt.freightMode === 'expense';
  const charges = receipt.charges ?? [];

  // ── New Charge Form State ─────────────────────────────────────
  const [showAddCharge, setShowAddCharge] = useState(false);
  const [newChargeAmount, setNewChargeAmount] = useState('');
  const [newChargeType, setNewChargeType] = useState('shipping');
  const [newChargeDesc, setNewChargeDesc] = useState('');
  const [newChargeGlCode, setNewChargeGlCode] = useState('');
  const [newChargeGlName, setNewChargeGlName] = useState('');

  const handleAddCharge = async () => {
    const amount = parseFloat(newChargeAmount);
    if (!amount || amount <= 0 || !onAddCharge) return;
    await onAddCharge({
      chargeType: newChargeType,
      description: newChargeDesc || undefined,
      amount,
      glAccountCode: isExpenseMode && newChargeGlCode ? newChargeGlCode : undefined,
      glAccountName: isExpenseMode && newChargeGlName ? newChargeGlName : undefined,
    });
    setNewChargeAmount('');
    setNewChargeDesc('');
    setNewChargeGlCode('');
    setNewChargeGlName('');
    setShowAddCharge(false);
  };

  return (
    <div className="space-y-4">
      {/* Top bar: back button, receipt number, status, actions */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={onBack}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-semibold text-foreground">
                {receipt.receiptNumber}
              </h1>
              <ReceiptStatusBadge status={receipt.status} />
            </div>
            <p className="text-sm text-muted-foreground">
              {receipt.vendorName} | {receipt.receivedDate}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isDraft && (
            <button
              type="button"
              onClick={onPost}
              disabled={!canPost}
              className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Send className="h-4 w-4" />
              Post Receipt
            </button>
          )}
          {receipt.status === 'posted' && (
            <button
              type="button"
              onClick={onVoid}
              className="flex items-center gap-2 rounded-lg border border-red-500/30 px-4 py-2 text-sm font-medium text-red-500 hover:bg-red-500/10 transition-colors"
            >
              <Ban className="h-4 w-4" />
              Void
            </button>
          )}
        </div>
      </div>

      {/* Editable header fields (draft only) */}
      {isDraft && (
        <div className="space-y-4">
          {/* Row 1: Core fields */}
          <div className="grid grid-cols-1 gap-4 rounded-lg border border-border bg-surface p-4 sm:grid-cols-2 lg:grid-cols-5">
            {/* Vendor */}
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                Vendor
              </label>
              <Select
                options={vendorOptions}
                value={receipt.vendorId}
                onChange={(v) => onHeaderChange('vendorId', v)}
                className="w-full"
              />
            </div>

            {/* Invoice # */}
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                Invoice #
              </label>
              <input
                type="text"
                value={receipt.vendorInvoiceNumber ?? ''}
                onChange={(e) =>
                  onHeaderChange(
                    'vendorInvoiceNumber',
                    e.target.value || null,
                  )
                }
                placeholder="Optional"
                className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
              />
            </div>

            {/* Received Date */}
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                Received Date
              </label>
              <input
                type="date"
                value={receipt.receivedDate}
                onChange={(e) => onHeaderChange('receivedDate', e.target.value)}
                className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
              />
            </div>

            {/* Freight Mode */}
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                Freight Mode
              </label>
              <Select
                options={FREIGHT_MODE_OPTIONS}
                value={receipt.freightMode ?? 'allocate'}
                onChange={(v) => onHeaderChange('freightMode', v)}
                className="w-full"
              />
            </div>

            {/* Allocation Method (only in ALLOCATE mode) */}
            {!isExpenseMode && (
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">
                  Allocation
                </label>
                <Select
                  options={ALLOCATION_OPTIONS}
                  value={receipt.shippingAllocationMethod}
                  onChange={(v) => onHeaderChange('shippingAllocationMethod', v)}
                  className="w-full"
                />
              </div>
            )}
          </div>

          {/* Row 2: Charges section */}
          <div className="rounded-lg border border-border bg-surface p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-foreground">
                {isExpenseMode ? 'Freight / Shipping Charges (Expense to GL)' : 'Freight / Shipping Charges'}
              </h3>
              {onAddCharge && (
                <button
                  type="button"
                  onClick={() => setShowAddCharge(true)}
                  className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-indigo-600 hover:bg-indigo-500/10 transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Charge
                </button>
              )}
            </div>

            {/* Existing charges */}
            {charges.length > 0 ? (
              <div className="space-y-2">
                {charges.map((charge) => (
                  <div
                    key={charge.id}
                    className="flex items-center gap-3 rounded-md border border-border bg-muted/50 px-3 py-2"
                  >
                    <span className="rounded bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground capitalize">
                      {charge.chargeType}
                    </span>
                    {charge.description && (
                      <span className="text-sm text-muted-foreground truncate flex-1">
                        {charge.description}
                      </span>
                    )}
                    {isExpenseMode && charge.glAccountCode && (
                      <span className="text-xs text-muted-foreground">
                        GL: {charge.glAccountCode}
                      </span>
                    )}
                    <span className="ml-auto text-sm font-medium text-foreground tabular-nums">
                      {formatMoney(charge.amount)}
                    </span>
                    {onRemoveCharge && (
                      <button
                        type="button"
                        onClick={() => onRemoveCharge(charge.id)}
                        className="rounded p-1 text-muted-foreground hover:bg-red-500/10 hover:text-red-500 transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))}
                {/* Total */}
                <div className="flex items-center justify-end gap-2 pt-1 border-t border-border">
                  <span className="text-xs font-medium text-muted-foreground uppercase">
                    Total Charges
                  </span>
                  <span className="text-sm font-semibold text-foreground tabular-nums">
                    {formatMoney(charges.reduce((s, c) => s + c.amount, 0))}
                  </span>
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                No charges added. {isExpenseMode ? 'Add shipping/freight charges to expense to GL accounts.' : 'Add charges to allocate across receipt lines.'}
              </p>
            )}

            {/* Add charge form */}
            {showAddCharge && (
              <div className="mt-3 rounded-md border border-indigo-500/30 bg-indigo-500/10 p-3 space-y-2">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <div>
                    <label className="block text-xs text-muted-foreground mb-0.5">Type</label>
                    <select
                      value={newChargeType}
                      onChange={(e) => setNewChargeType(e.target.value)}
                      className="w-full rounded border border-border px-2 py-1.5 text-sm"
                    >
                      {CHARGE_TYPE_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-muted-foreground mb-0.5">Amount</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={newChargeAmount}
                      onChange={(e) => setNewChargeAmount(e.target.value)}
                      placeholder="0.00"
                      className="w-full rounded border border-border px-2 py-1.5 text-sm"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs text-muted-foreground mb-0.5">Description</label>
                    <input
                      type="text"
                      value={newChargeDesc}
                      onChange={(e) => setNewChargeDesc(e.target.value)}
                      placeholder="Optional"
                      className="w-full rounded border border-border px-2 py-1.5 text-sm"
                    />
                  </div>
                </div>

                {/* GL account fields (EXPENSE mode only) */}
                {isExpenseMode && (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs text-muted-foreground mb-0.5">GL Account Code</label>
                      <input
                        type="text"
                        value={newChargeGlCode}
                        onChange={(e) => setNewChargeGlCode(e.target.value)}
                        placeholder="e.g., 5100"
                        className="w-full rounded border border-border px-2 py-1.5 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-muted-foreground mb-0.5">GL Account Name</label>
                      <input
                        type="text"
                        value={newChargeGlName}
                        onChange={(e) => setNewChargeGlName(e.target.value)}
                        placeholder="e.g., Freight Expense"
                        className="w-full rounded border border-border px-2 py-1.5 text-sm"
                      />
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleAddCharge}
                    disabled={!newChargeAmount || parseFloat(newChargeAmount) <= 0}
                    className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors"
                  >
                    Add
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowAddCharge(false)}
                    className="rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Read-only charges display for non-draft */}
      {!isDraft && charges.length > 0 && (
        <div className="rounded-lg border border-border bg-surface p-4">
          <h3 className="text-sm font-medium text-foreground mb-2">
            Charges ({receipt.freightMode === 'expense' ? 'Expensed to GL' : 'Allocated to Items'})
          </h3>
          <div className="space-y-1.5">
            {charges.map((charge) => (
              <div key={charge.id} className="flex items-center gap-3 text-sm">
                <span className="rounded bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground capitalize">
                  {charge.chargeType}
                </span>
                {charge.description && (
                  <span className="text-muted-foreground">{charge.description}</span>
                )}
                {charge.glAccountCode && (
                  <span className="text-xs text-muted-foreground">GL: {charge.glAccountCode}</span>
                )}
                <span className="ml-auto font-medium tabular-nums">{formatMoney(charge.amount)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
