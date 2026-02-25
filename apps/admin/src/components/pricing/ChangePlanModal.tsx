'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Check, Users } from 'lucide-react';
import type { PricingPlan } from '@/types/pricing';

interface ChangePlanModalProps {
  plans: PricingPlan[];
  currentPlanId: string | null;
  currentSeatCount: number;
  onClose: () => void;
  onSave: (planId: string, seatCount: number, reason: string) => Promise<void>;
}

export function ChangePlanModal({
  plans,
  currentPlanId,
  currentSeatCount,
  onClose,
  onSave,
}: ChangePlanModalProps) {
  const [selectedPlanId, setSelectedPlanId] = useState(currentPlanId ?? plans[0]?.id ?? '');
  const [seatCount, setSeatCount] = useState(String(currentSeatCount));
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const selectedPlan = plans.find((p) => p.id === selectedPlanId);
  const seats = parseInt(seatCount, 10) || 1;
  const monthlyCost = selectedPlan
    ? (seats * selectedPlan.pricePerSeatCents + selectedPlan.baseFeeCents) / 100
    : 0;

  const seatExceedsMax = selectedPlan?.maxSeats ? seats > selectedPlan.maxSeats : false;
  const canSave = selectedPlanId && seats >= 1 && reason.trim().length > 0 && !seatExceedsMax;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      await onSave(selectedPlanId, seats, reason.trim());
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-slate-800 border border-slate-700 rounded-xl p-6 w-full max-w-lg shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-white">
            {currentPlanId ? 'Change Plan' : 'Assign Plan'}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X size={18} />
          </button>
        </div>

        {/* Plan selector */}
        <div className="space-y-2 mb-4">
          <label className="block text-sm text-slate-400">Select Plan</label>
          <div className="grid gap-2">
            {plans
              .filter((p) => p.isActive || p.id === currentPlanId)
              .map((plan) => {
                const isSelected = plan.id === selectedPlanId;
                const isCurrent = plan.id === currentPlanId;
                return (
                  <button
                    key={plan.id}
                    onClick={() => setSelectedPlanId(plan.id)}
                    className={`flex items-center justify-between p-3 rounded-lg border text-left transition-colors ${
                      isSelected
                        ? 'border-indigo-500 bg-indigo-500/10'
                        : 'border-slate-600 hover:border-slate-500'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {isSelected ? (
                        <div className="w-5 h-5 rounded-full bg-indigo-600 flex items-center justify-center">
                          <Check size={12} className="text-white" />
                        </div>
                      ) : (
                        <div className="w-5 h-5 rounded-full border-2 border-slate-500" />
                      )}
                      <div>
                        <span className="text-sm font-medium text-white">{plan.displayName}</span>
                        <span className="text-xs text-slate-400 ml-2 font-mono">{plan.tier}</span>
                        {isCurrent && (
                          <span className="text-xs text-emerald-400 ml-2">(current)</span>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm text-white">
                        ${(plan.pricePerSeatCents / 100).toFixed(2)}/seat
                      </div>
                      <div className="text-xs text-slate-400">
                        {plan.maxSeats ? `up to ${plan.maxSeats} seats` : 'unlimited seats'}
                      </div>
                    </div>
                  </button>
                );
              })}
          </div>
        </div>

        {/* Seat count */}
        <div className="mb-4">
          <label className="block text-sm text-slate-400 mb-1">
            <Users size={12} className="inline mr-1" />
            Number of seats
          </label>
          <input
            type="number"
            min="1"
            max={selectedPlan?.maxSeats ?? undefined}
            value={seatCount}
            onChange={(e) => setSeatCount(e.target.value)}
            className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:border-indigo-500 focus:outline-none"
          />
          {seatExceedsMax && (
            <p className="text-xs text-red-400 mt-1">
              Exceeds maximum of {selectedPlan?.maxSeats} seats for this plan
            </p>
          )}
          {selectedPlan?.maxSeats && !seatExceedsMax && (
            <p className="text-xs text-slate-500 mt-1">
              Max {selectedPlan.maxSeats} seats on the {selectedPlan.displayName} plan
            </p>
          )}
        </div>

        {/* Reason */}
        <div className="mb-4">
          <label className="block text-sm text-slate-400 mb-1">Reason for change</label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Customer requested upgrade to support more staff"
            rows={2}
            className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:border-indigo-500 focus:outline-none resize-none"
          />
        </div>

        {/* Cost preview */}
        <div className="p-3 bg-slate-900 rounded-lg border border-slate-700 mb-6">
          <p className="text-xs text-slate-400 mb-1">New monthly cost</p>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-white">${monthlyCost.toFixed(2)}</span>
            <span className="text-sm text-slate-400">/month</span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            {seats} seat{seats !== 1 ? 's' : ''} × ${selectedPlan ? (selectedPlan.pricePerSeatCents / 100).toFixed(2) : '0.00'}/seat
            {selectedPlan && selectedPlan.baseFeeCents > 0 && (
              <> + ${(selectedPlan.baseFeeCents / 100).toFixed(2)} base fee</>
            )}
          </p>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !canSave}
            className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-500 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving...' : currentPlanId ? 'Change Plan' : 'Assign Plan'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
