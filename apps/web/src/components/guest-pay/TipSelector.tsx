'use client';

import { useState, useCallback } from 'react';

interface TipSettings {
  tipType: string;
  presets: number[];
  allowCustom: boolean;
  allowNoTip: boolean;
  calculationBase: string;
  roundingMode: string;
  maxTipPercent: number;
  maxTipAmountCents: number;
}

interface TipSelectorProps {
  tipSettings: TipSettings;
  baseCents: number;
  selectedTipCents: number;
  onTipChange: (tipCents: number) => void;
}

function roundTip(cents: number, mode: string): number {
  if (mode === 'nearest_5_cents') return Math.round(cents / 5) * 5;
  return Math.round(cents);
}

export function TipSelector({ tipSettings, baseCents, selectedTipCents, onTipChange }: TipSelectorProps) {
  const [activePreset, setActivePreset] = useState<number | 'custom' | 'none' | null>(null);
  const [customValue, setCustomValue] = useState('');
  const [showCustom, setShowCustom] = useState(false);

  const handlePreset = useCallback((percent: number) => {
    const raw = baseCents * (percent / 100);
    const rounded = roundTip(raw, tipSettings.roundingMode);
    const capped = Math.min(rounded, tipSettings.maxTipAmountCents);
    setActivePreset(percent);
    setShowCustom(false);
    onTipChange(capped);
  }, [baseCents, tipSettings, onTipChange]);

  const handleNoTip = useCallback(() => {
    setActivePreset('none');
    setShowCustom(false);
    onTipChange(0);
  }, [onTipChange]);

  const handleCustomToggle = useCallback(() => {
    setActivePreset('custom');
    setShowCustom(true);
  }, []);

  const handleCustomSubmit = useCallback(() => {
    const dollars = parseFloat(customValue);
    if (isNaN(dollars) || dollars < 0) return;
    const cents = Math.round(dollars * 100);
    const capped = Math.min(cents, tipSettings.maxTipAmountCents);
    // Validate max percent
    if (baseCents > 0 && (capped / baseCents) * 100 > tipSettings.maxTipPercent) {
      return; // Exceeds max
    }
    onTipChange(capped);
    setShowCustom(false);
  }, [customValue, baseCents, tipSettings, onTipChange]);

  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-900 mb-3">Add a Tip</h3>

      {/* Preset buttons */}
      <div className="flex gap-2">
        {tipSettings.presets.map((percent) => {
          const tipCents = roundTip(baseCents * (percent / 100), tipSettings.roundingMode);
          const isActive = activePreset === percent;
          return (
            <button
              key={percent}
              type="button"
              onClick={() => handlePreset(percent)}
              className={`flex-1 rounded-xl py-3 text-center transition-all ${
                isActive
                  ? 'bg-green-600 text-white shadow-md ring-2 ring-green-600 ring-offset-2'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              <div className="text-base font-bold">{percent}%</div>
              <div className="text-xs mt-0.5 opacity-75">${(tipCents / 100).toFixed(2)}</div>
            </button>
          );
        })}
      </div>

      {/* Custom + No Tip row */}
      <div className="flex gap-2 mt-2">
        {tipSettings.allowCustom && (
          <button
            type="button"
            onClick={handleCustomToggle}
            className={`flex-1 rounded-xl py-2.5 text-sm font-medium transition-all ${
              activePreset === 'custom'
                ? 'bg-green-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Custom
          </button>
        )}
        {tipSettings.allowNoTip && (
          <button
            type="button"
            onClick={handleNoTip}
            className={`flex-1 rounded-xl py-2.5 text-sm font-medium transition-all ${
              activePreset === 'none'
                ? 'bg-gray-800 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            No Tip
          </button>
        )}
      </div>

      {/* Custom input */}
      {showCustom && (
        <div className="mt-3 flex gap-2">
          <div className="relative flex-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              placeholder="0.00"
              value={customValue}
              onChange={(e) => setCustomValue(e.target.value)}
              className="w-full rounded-xl border border-gray-300 py-3 pl-7 pr-3 text-base text-gray-900 bg-white focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20"
              autoFocus
            />
          </div>
          <button
            type="button"
            onClick={handleCustomSubmit}
            className="rounded-xl bg-green-600 px-5 py-3 text-sm font-semibold text-white hover:bg-green-700 transition-colors"
          >
            Apply
          </button>
        </div>
      )}

      {/* Selected tip display */}
      {selectedTipCents > 0 && (
        <div className="mt-3 text-center">
          <span className="text-sm text-gray-500">
            Tip: <span className="font-semibold text-gray-900">${(selectedTipCents / 100).toFixed(2)}</span>
          </span>
        </div>
      )}
    </div>
  );
}
