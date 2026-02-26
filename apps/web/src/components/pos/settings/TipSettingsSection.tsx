'use client';

import { memo, useState, useCallback } from 'react';
import { Plus, X, ChevronUp, ChevronDown } from 'lucide-react';
import type { POSTipSettings } from '@/types/pos';

interface TipSettingsSectionProps {
  tipEnabled: boolean;
  tipSettings: POSTipSettings | undefined;
  onUpdate: (updates: { tipEnabled?: boolean; tipSettings?: POSTipSettings }) => void;
}

const DEFAULT_TIP_SETTINGS: POSTipSettings = {
  enabled: false,
  percentageOptions: [15, 18, 20, 25],
  dollarAmounts: [],
  calculateBeforeTax: true,
  defaultSelectionIndex: null,
};

function EditableChip({
  value: _value,
  label,
  onRemove,
  onMoveUp,
  onMoveDown,
  isFirst,
  isLast,
}: {
  value: number;
  label: string;
  onRemove: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  isFirst: boolean;
  isLast: boolean;
}) {
  return (
    <div className="group flex items-center gap-1 rounded-lg bg-indigo-500/10 px-3 py-1.5 text-sm font-medium text-indigo-500">
      <span>{label}</span>
      <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
        {!isFirst && onMoveUp && (
          <button type="button" onClick={onMoveUp} className="rounded p-0.5 hover:bg-indigo-500/20">
            <ChevronUp className="h-3 w-3" />
          </button>
        )}
        {!isLast && onMoveDown && (
          <button type="button" onClick={onMoveDown} className="rounded p-0.5 hover:bg-indigo-500/20">
            <ChevronDown className="h-3 w-3" />
          </button>
        )}
        <button type="button" onClick={onRemove} className="rounded p-0.5 hover:bg-red-500/10 hover:text-red-500">
          <X className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

export const TipSettingsSection = memo(function TipSettingsSection({
  tipEnabled,
  tipSettings,
  onUpdate,
}: TipSettingsSectionProps) {
  const settings = tipSettings ?? DEFAULT_TIP_SETTINGS;
  const [addingPercent, setAddingPercent] = useState(false);
  const [addingDollar, setAddingDollar] = useState(false);
  const [newPercentValue, setNewPercentValue] = useState('');
  const [newDollarValue, setNewDollarValue] = useState('');

  const updateSettings = useCallback(
    (patch: Partial<POSTipSettings>) => {
      onUpdate({ tipSettings: { ...settings, ...patch } });
    },
    [settings, onUpdate],
  );

  const handleToggleEnabled = useCallback(() => {
    const newEnabled = !tipEnabled;
    onUpdate({
      tipEnabled: newEnabled,
      tipSettings: { ...settings, enabled: newEnabled },
    });
  }, [tipEnabled, settings, onUpdate]);

  // Percentage presets
  const addPercentage = useCallback(() => {
    const val = parseFloat(newPercentValue);
    if (!val || val <= 0 || val > 100) return;
    if (settings.percentageOptions.includes(val)) return;
    updateSettings({ percentageOptions: [...settings.percentageOptions, val] });
    setNewPercentValue('');
    setAddingPercent(false);
  }, [newPercentValue, settings.percentageOptions, updateSettings]);

  const removePercentage = useCallback(
    (idx: number) => {
      const next = settings.percentageOptions.filter((_, i) => i !== idx);
      const defaultIdx =
        settings.defaultSelectionIndex !== null && settings.defaultSelectionIndex >= next.length
          ? null
          : settings.defaultSelectionIndex;
      updateSettings({ percentageOptions: next, defaultSelectionIndex: defaultIdx });
    },
    [settings, updateSettings],
  );

  const movePercentage = useCallback(
    (idx: number, dir: -1 | 1) => {
      const arr = [...settings.percentageOptions];
      const target = idx + dir;
      if (target < 0 || target >= arr.length) return;
      const tmp = arr[idx]!;
      arr[idx] = arr[target]!;
      arr[target] = tmp;
      updateSettings({ percentageOptions: arr });
    },
    [settings.percentageOptions, updateSettings],
  );

  // Dollar amounts
  const addDollar = useCallback(() => {
    const val = parseFloat(newDollarValue);
    if (!val || val <= 0) return;
    if (settings.dollarAmounts.includes(val)) return;
    updateSettings({ dollarAmounts: [...settings.dollarAmounts, val] });
    setNewDollarValue('');
    setAddingDollar(false);
  }, [newDollarValue, settings.dollarAmounts, updateSettings]);

  const removeDollar = useCallback(
    (idx: number) => {
      updateSettings({ dollarAmounts: settings.dollarAmounts.filter((_, i) => i !== idx) });
    },
    [settings.dollarAmounts, updateSettings],
  );

  return (
    <details className="group" open>
      <summary className="flex cursor-pointer items-center gap-3 py-3 select-none">
        <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
        <div>
          <h4 className="text-sm font-semibold text-foreground">Tips</h4>
          <p className="text-xs text-muted-foreground">Configure tip prompts shown during payment</p>
        </div>
      </summary>

      <div className="space-y-4 pb-4 pl-7">
        {/* Enable toggle */}
        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={tipEnabled}
            onChange={handleToggleEnabled}
            className="h-4 w-4 rounded border-border text-indigo-600 focus:ring-indigo-500"
          />
          <span className="text-sm text-foreground">Enable tip prompts on payment</span>
        </label>

        {tipEnabled && (
          <>
            {/* Percentage presets */}
            <div>
              <label className="mb-2 block text-xs font-medium text-muted-foreground">Percentage Presets</label>
              <div className="flex flex-wrap gap-2">
                {settings.percentageOptions.map((pct, i) => (
                  <EditableChip
                    key={`pct-${pct}`}
                    value={pct}
                    label={`${pct}%`}
                    onRemove={() => removePercentage(i)}
                    onMoveUp={() => movePercentage(i, -1)}
                    onMoveDown={() => movePercentage(i, 1)}
                    isFirst={i === 0}
                    isLast={i === settings.percentageOptions.length - 1}
                  />
                ))}
                {addingPercent ? (
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      value={newPercentValue}
                      onChange={(e) => setNewPercentValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') addPercentage();
                        if (e.key === 'Escape') setAddingPercent(false);
                      }}
                      placeholder="e.g. 22"
                      className="w-16 rounded-md border border-border px-2 py-1 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      autoFocus
                    />
                    <span className="text-xs text-muted-foreground">%</span>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setAddingPercent(true)}
                    className="flex items-center gap-1 rounded-lg border border-dashed border-border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-indigo-400 hover:text-indigo-600"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Dollar amounts */}
            <div>
              <label className="mb-2 block text-xs font-medium text-muted-foreground">Dollar Amounts</label>
              <div className="flex flex-wrap gap-2">
                {settings.dollarAmounts.map((amt, i) => (
                  <EditableChip
                    key={`dollar-${amt}`}
                    value={amt}
                    label={`$${amt}`}
                    onRemove={() => removeDollar(i)}
                    isFirst={i === 0}
                    isLast={i === settings.dollarAmounts.length - 1}
                  />
                ))}
                {addingDollar ? (
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-muted-foreground">$</span>
                    <input
                      type="number"
                      value={newDollarValue}
                      onChange={(e) => setNewDollarValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') addDollar();
                        if (e.key === 'Escape') setAddingDollar(false);
                      }}
                      placeholder="e.g. 5"
                      className="w-16 rounded-md border border-border px-2 py-1 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      autoFocus
                    />
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setAddingDollar(true)}
                    className="flex items-center gap-1 rounded-lg border border-dashed border-border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-indigo-400 hover:text-indigo-600"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Calculate before tax */}
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={settings.calculateBeforeTax}
                onChange={() => updateSettings({ calculateBeforeTax: !settings.calculateBeforeTax })}
                className="h-4 w-4 rounded border-border text-indigo-600 focus:ring-indigo-500"
              />
              <span className="text-sm text-foreground">Calculate tip on pre-tax amount</span>
            </label>

            {/* Default selection */}
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Default Selection</label>
              <select
                value={settings.defaultSelectionIndex ?? ''}
                onChange={(e) =>
                  updateSettings({
                    defaultSelectionIndex: e.target.value === '' ? null : parseInt(e.target.value, 10),
                  })
                }
                className="rounded-md border border-border px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                <option value="">None (customer chooses)</option>
                {settings.percentageOptions.map((pct, i) => (
                  <option key={i} value={i}>
                    {pct}%
                  </option>
                ))}
              </select>
            </div>

            {/* Auto-gratuity — future */}
            <div className="rounded-lg border border-border bg-muted p-3 opacity-60">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-muted-foreground">Auto-Gratuity</span>
                <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-500">
                  Coming Soon
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Automatically add gratuity for parties of 6 or more
              </p>
            </div>
          </>
        )}
      </div>
    </details>
  );
});
