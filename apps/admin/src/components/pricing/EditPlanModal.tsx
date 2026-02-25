'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import type { PricingPlan, UpdatePlanInput } from '@/types/pricing';

interface EditPlanModalProps {
  plan: PricingPlan;
  onClose: () => void;
  onSave: (input: UpdatePlanInput) => Promise<void>;
}

export function EditPlanModal({ plan, onClose, onSave }: EditPlanModalProps) {
  const [pricePerSeat, setPricePerSeat] = useState(String(plan.pricePerSeatCents / 100));
  const [maxSeats, setMaxSeats] = useState(plan.maxSeats ? String(plan.maxSeats) : '');
  const [baseFee, setBaseFee] = useState(String(plan.baseFeeCents / 100));
  const [isActive, setIsActive] = useState(plan.isActive);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({
        pricePerSeatCents: Math.round(parseFloat(pricePerSeat) * 100),
        maxSeats: maxSeats ? parseInt(maxSeats, 10) : null,
        baseFeeCents: Math.round(parseFloat(baseFee || '0') * 100),
        isActive,
      });
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-slate-800 border border-slate-700 rounded-xl p-6 w-full max-w-md shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-white">
            Edit {plan.displayName} Plan
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X size={18} />
          </button>
        </div>

        {/* Form */}
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-slate-400 mb-1">Price per seat ($/month)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={pricePerSeat}
              onChange={(e) => setPricePerSeat(e.target.value)}
              className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:border-indigo-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-sm text-slate-400 mb-1">
              Max seats (leave empty for unlimited)
            </label>
            <input
              type="number"
              min="1"
              value={maxSeats}
              onChange={(e) => setMaxSeats(e.target.value)}
              placeholder="Unlimited"
              className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:border-indigo-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-sm text-slate-400 mb-1">Base fee ($/month)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={baseFee}
              onChange={(e) => setBaseFee(e.target.value)}
              className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:border-indigo-500 focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              id="plan-active"
              className="w-4 h-4 rounded border-slate-600 bg-slate-900 text-indigo-600 focus:ring-indigo-500"
            />
            <label htmlFor="plan-active" className="text-sm text-slate-300">
              Plan is active (visible for new subscriptions)
            </label>
          </div>
        </div>

        {/* Preview */}
        <div className="mt-4 p-3 bg-slate-900 rounded-lg border border-slate-700">
          <p className="text-xs text-slate-400 mb-1">Monthly cost preview</p>
          <p className="text-sm text-white">
            {maxSeats || '∞'} seats × ${pricePerSeat || '0'}/seat
            {parseFloat(baseFee || '0') > 0 && ` + $${baseFee} base`}
            {maxSeats && (
              <>
                {' = '}
                <span className="font-semibold text-emerald-400">
                  $
                  {(
                    parseInt(maxSeats || '0') * parseFloat(pricePerSeat || '0') +
                    parseFloat(baseFee || '0')
                  ).toFixed(2)}
                  /mo max
                </span>
              </>
            )}
          </p>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-500 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
