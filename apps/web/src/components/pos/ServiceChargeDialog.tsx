'use client';

import { useState } from 'react';
import { POSSlidePanel } from './shared/POSSlidePanel';

function formatMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

// ── Quick Button ──────────────────────────────────────────────────

function QuickButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex-1 rounded-lg border border-gray-300 px-3 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-indigo-50 hover:border-indigo-300 hover:text-indigo-700 active:scale-[0.97]"
    >
      {label}
    </button>
  );
}

// ── Custom Charge Input ───────────────────────────────────────────

interface ServiceCharge {
  chargeType: string;
  name: string;
  calculationType: string;
  value: number;
  isTaxable: boolean;
}

function CustomChargeInput({ onAdd }: { onAdd: (charge: ServiceCharge) => void }) {
  const [chargeCalc, setChargeCalc] = useState<'percentage' | 'fixed'>('percentage');
  const [chargeValue, setChargeValue] = useState('');
  const [chargeName, setChargeName] = useState('');

  const handleAdd = () => {
    const val = parseFloat(chargeValue);
    if (isNaN(val) || val <= 0) return;
    const finalValue = chargeCalc === 'fixed' ? Math.round(val * 100) : val;
    onAdd({
      chargeType: 'service_charge',
      name: chargeName || 'Service Charge',
      calculationType: chargeCalc,
      value: finalValue,
      isTaxable: false,
    });
  };

  return (
    <div className="space-y-2 border-t border-gray-100 pt-3">
      <p className="text-xs font-medium text-gray-500 uppercase">Custom Charge</p>
      <input
        type="text"
        value={chargeName}
        onChange={(e) => setChargeName(e.target.value)}
        placeholder="Charge name (optional)"
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none"
      />
      <div className="flex gap-2">
        <select
          value={chargeCalc}
          onChange={(e) => setChargeCalc(e.target.value as 'percentage' | 'fixed')}
          className="rounded-lg border border-gray-300 px-2 py-2 text-sm text-gray-700 focus:border-indigo-500 focus:outline-none"
        >
          <option value="percentage">%</option>
          <option value="fixed">$</option>
        </select>
        <input
          type="number"
          value={chargeValue}
          onChange={(e) => setChargeValue(e.target.value)}
          placeholder={chargeCalc === 'percentage' ? 'e.g., 10' : 'e.g., 5.00'}
          min="0"
          step={chargeCalc === 'percentage' ? '1' : '0.01'}
          className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none"
        />
      </div>
      <button
        type="button"
        onClick={handleAdd}
        disabled={!chargeValue || parseFloat(chargeValue) <= 0}
        className="w-full rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-indigo-300"
      >
        Add Charge
      </button>
    </div>
  );
}

// ── Service Charge Dialog ─────────────────────────────────────────

export interface ServiceChargeDialogProps {
  open: boolean;
  onClose: () => void;
  subtotalCents: number;
  onAddCharge: (charge: ServiceCharge) => void;
}

export function ServiceChargeDialog({ open, onClose, subtotalCents, onAddCharge }: ServiceChargeDialogProps) {
  const handleQuick = (pct: number) => {
    onAddCharge({
      chargeType: 'service_charge',
      name: 'Service Charge',
      calculationType: 'percentage',
      value: pct,
      isTaxable: false,
    });
    onClose();
  };

  return (
    <POSSlidePanel open={open} onClose={onClose} title="Add Service Charge">
      <div className="space-y-3">
        <p className="text-sm text-gray-500">
          Subtotal: {formatMoney(subtotalCents)}
        </p>
        <div className="flex gap-2">
          <QuickButton label="10% Service" onClick={() => handleQuick(10)} />
          <QuickButton label="15% Service" onClick={() => handleQuick(15)} />
        </div>
        <CustomChargeInput
          onAdd={(charge) => {
            onAddCharge(charge);
            onClose();
          }}
        />
      </div>
    </POSSlidePanel>
  );
}
