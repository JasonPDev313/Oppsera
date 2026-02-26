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

interface AdjustDialogProps {
  open: boolean;
  onClose: () => void;
  inventoryItemId: string;
  onSuccess: () => void;
}

export function AdjustDialog({ open, onClose, inventoryItemId, onSuccess }: AdjustDialogProps) {
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
      await apiFetch('/api/v1/inventory/adjust', {
        method: 'POST',
        body: JSON.stringify({
          inventoryItemId,
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
      <div className="relative w-full max-w-md rounded-lg bg-surface p-6 shadow-xl">
        <h3 className="text-lg font-semibold text-foreground">Adjust Inventory</h3>
        <p className="mt-1 text-sm text-muted-foreground">
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
              className="w-full rounded-lg border border-border px-3 py-2 text-sm text-foreground focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
            />
          </FormField>

          <FormField label="Reason" required error={errors.reason}>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Physical count correction"
              className="w-full rounded-lg border border-border px-3 py-2 text-sm text-foreground focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
            />
          </FormField>

          <FormField label="Business Date" required error={errors.businessDate}>
            <input
              type="date"
              value={businessDate}
              onChange={(e) => setBusinessDate(e.target.value)}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm text-foreground focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
            />
          </FormField>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={handleClose}
            disabled={isSubmitting}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className={`rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:outline-none ${
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
