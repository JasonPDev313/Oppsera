'use client';

import { useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { FormField } from '@/components/ui/form-field';
import { useToast } from '@/components/ui/toast';
import { apiFetch } from '@/lib/api-client';

function todayISO(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

interface ReceiveDialogProps {
  open: boolean;
  onClose: () => void;
  inventoryItemId: string;
  onSuccess: () => void;
}

export function ReceiveDialog({ open, onClose, inventoryItemId, onSuccess }: ReceiveDialogProps) {
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
      await apiFetch('/api/v1/inventory/receive', {
        method: 'POST',
        body: JSON.stringify({
          inventoryItemId,
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
      <div className="relative w-full max-w-md rounded-lg bg-surface p-6 shadow-xl">
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
