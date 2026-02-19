'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle, Calendar, Plus, Trash2 } from 'lucide-react';
import { CollapsibleSection } from '../shared/CollapsibleSection';
import { Badge } from '@/components/ui/badge';
import { useAuthContext } from '@/components/auth-provider';
import { useTaxGroups, useItemTaxGroups } from '@/hooks/use-catalog';
import type { ItemFormState } from '../ItemEditDrawer';

const DAYS_OF_WEEK = [
  { key: 'mon', label: 'M' },
  { key: 'tue', label: 'T' },
  { key: 'wed', label: 'W' },
  { key: 'thu', label: 'T' },
  { key: 'fri', label: 'F' },
  { key: 'sat', label: 'S' },
  { key: 'sun', label: 'S' },
] as const;

interface PricingSchedule {
  id: string;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  days: string[];
  overridePrice: string;
  isActive: boolean;
}

interface PricingSectionProps {
  form: ItemFormState;
  onUpdate: (updates: Partial<ItemFormState>) => void;
  onUpdateMetadata: (key: string, value: unknown) => void;
  itemId: string;
}

export function PricingSection({ form, onUpdate, onUpdateMetadata, itemId }: PricingSectionProps) {
  const { locations } = useAuthContext();
  const locationId = locations[0]?.id;
  const { data: availableTaxGroups } = useTaxGroups(locationId);
  const { data: assignedTaxGroups } = useItemTaxGroups(itemId, locationId);

  const price = parseFloat(form.defaultPrice) || 0;
  const cost = parseFloat(form.cost) || 0;

  // Compute combined tax rate from assigned groups
  const totalTaxRate = useMemo(() => {
    if (!assignedTaxGroups || !availableTaxGroups) return 0;
    let rate = 0;
    for (const assigned of assignedTaxGroups) {
      const full = availableTaxGroups.find((g) => g.id === assigned.taxGroupId);
      if (full) rate += full.totalRate;
    }
    return rate;
  }, [assignedTaxGroups, availableTaxGroups]);

  // Tax mode comes from the item's priceIncludesTax flag
  const effectiveMode: 'inclusive' | 'exclusive' = form.priceIncludesTax ? 'inclusive' : 'exclusive';

  // Exclusive: compute after-tax price (what customer pays)
  const afterTaxPrice = useMemo(() => {
    if (!price || totalTaxRate === 0 || effectiveMode !== 'exclusive') return null;
    return (price * (1 + totalTaxRate)).toFixed(2);
  }, [price, totalTaxRate, effectiveMode]);

  // Inclusive: compute base price (price before tax)
  const basePrice = useMemo(() => {
    if (!price || totalTaxRate === 0 || effectiveMode !== 'inclusive') return null;
    return (price / (1 + totalTaxRate)).toFixed(2);
  }, [price, totalTaxRate, effectiveMode]);

  const margin = useMemo(() => {
    if (!price || !cost) return null;
    return ((price - cost) / price * 100).toFixed(1);
  }, [price, cost]);

  const costWarning = cost > 0 && price > 0 && cost > price;
  const freeWarning = price === 0 && form.defaultPrice !== '';

  // Pricing schedules from metadata
  const schedules = useMemo(
    () => ((form.metadata?.pricingSchedules as PricingSchedule[]) ?? []),
    [form.metadata?.pricingSchedules],
  );

  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const [newSchedule, setNewSchedule] = useState<Omit<PricingSchedule, 'id'>>({
    startDate: '',
    endDate: '',
    startTime: '',
    endTime: '',
    days: [],
    overridePrice: '',
    isActive: true,
  });

  const addSchedule = () => {
    if (!newSchedule.overridePrice || !newSchedule.startDate) return;
    const schedule: PricingSchedule = {
      ...newSchedule,
      id: crypto.randomUUID(),
    };
    onUpdateMetadata('pricingSchedules', [...schedules, schedule]);
    setNewSchedule({ startDate: '', endDate: '', startTime: '', endTime: '', days: [], overridePrice: '', isActive: true });
    setShowScheduleForm(false);
  };

  const removeSchedule = (id: string) => {
    onUpdateMetadata('pricingSchedules', schedules.filter((s) => s.id !== id));
  };

  const toggleScheduleActive = (id: string) => {
    onUpdateMetadata('pricingSchedules', schedules.map((s) =>
      s.id === id ? { ...s, isActive: !s.isActive } : s,
    ));
  };

  const toggleDay = (day: string) => {
    setNewSchedule((prev) => ({
      ...prev,
      days: prev.days.includes(day) ? prev.days.filter((d) => d !== day) : [...prev.days, day],
    }));
  };

  return (
    <CollapsibleSection id="pricing" title="Pricing">
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          {/* Sale Price */}
          <div>
            <label htmlFor="edit-price" className="mb-1 block text-xs font-medium text-gray-700">
              Sale Price <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">$</span>
              <input
                id="edit-price"
                type="number"
                step="0.01"
                min="0"
                value={form.defaultPrice}
                onChange={(e) => onUpdate({ defaultPrice: e.target.value })}
                className="w-full rounded-lg border border-gray-300 bg-surface py-2 pl-7 pr-3 text-sm text-right focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>
          </div>

          {/* Cost */}
          <div>
            <label htmlFor="edit-cost" className="mb-1 block text-xs font-medium text-gray-700">
              Item Cost
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">$</span>
              <input
                id="edit-cost"
                type="number"
                step="0.01"
                min="0"
                value={form.cost}
                onChange={(e) => onUpdate({ cost: e.target.value })}
                placeholder="0.00"
                className={`w-full rounded-lg border bg-surface py-2 pl-7 pr-3 text-sm text-right focus:outline-none focus:ring-2 ${
                  costWarning
                    ? 'border-amber-400 focus:border-amber-500 focus:ring-amber-500/20'
                    : 'border-gray-300 focus:border-indigo-500 focus:ring-indigo-500/20'
                }`}
              />
            </div>
          </div>
        </div>

        {/* Margin display */}
        {margin !== null && (
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <span>Margin:</span>
            <span className={`font-medium ${
              Number(margin) < 0 ? 'text-red-600' : Number(margin) < 20 ? 'text-amber-600' : 'text-green-600'
            }`}>
              {margin}%
            </span>
          </div>
        )}

        {/* Warnings */}
        {costWarning && (
          <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            Cost exceeds sale price — this item will sell at a loss
          </div>
        )}
        {freeWarning && (
          <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            Sale price is $0.00 — this item is free
          </div>
        )}

        {/* Pricing Schedules */}
        <div className="border-t border-gray-100 pt-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar className="h-3.5 w-3.5 text-gray-400" />
              <span className="text-xs font-medium text-gray-700">Pricing Schedules</span>
              {schedules.length > 0 && (
                <Badge variant="default" className="text-[10px]">{schedules.length}</Badge>
              )}
            </div>
            <button
              type="button"
              onClick={() => setShowScheduleForm(!showScheduleForm)}
              className="flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-700"
            >
              <Plus className="h-3 w-3" />
              Add
            </button>
          </div>

          {/* Existing schedules */}
          {schedules.length > 0 && (
            <div className="mt-2 space-y-1.5">
              {schedules.map((sched) => (
                <div
                  key={sched.id}
                  className={`flex items-center justify-between rounded-lg border px-3 py-2 ${
                    sched.isActive ? 'border-gray-200 bg-gray-50' : 'border-gray-100 bg-gray-50 opacity-50'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-gray-900">${sched.overridePrice}</span>
                      {!sched.isActive && <Badge variant="default" className="text-[10px]">Inactive</Badge>}
                    </div>
                    <p className="text-[11px] text-gray-500">
                      {sched.startDate}{sched.endDate ? ` — ${sched.endDate}` : ''}
                      {sched.startTime ? ` ${sched.startTime}` : ''}
                      {sched.endTime ? `–${sched.endTime}` : ''}
                      {sched.days.length > 0 && sched.days.length < 7 ? ` (${sched.days.join(', ')})` : ''}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => toggleScheduleActive(sched.id)}
                      className="rounded p-1 text-gray-400 hover:text-gray-600"
                      title={sched.isActive ? 'Deactivate' : 'Activate'}
                    >
                      <span className="text-[10px] font-medium">{sched.isActive ? 'ON' : 'OFF'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => removeSchedule(sched.id)}
                      className="rounded p-1 text-gray-400 hover:text-red-500"
                      title="Remove schedule"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* New schedule form */}
          {showScheduleForm && (
            <div className="mt-2 space-y-2 rounded-lg border border-indigo-200 bg-indigo-50/30 p-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-0.5 block text-[11px] text-gray-600">Start Date</label>
                  <input
                    type="date"
                    value={newSchedule.startDate}
                    onChange={(e) => setNewSchedule((p) => ({ ...p, startDate: e.target.value }))}
                    className="w-full rounded border border-gray-300 bg-surface px-2 py-1.5 text-xs focus:border-indigo-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-0.5 block text-[11px] text-gray-600">End Date</label>
                  <input
                    type="date"
                    value={newSchedule.endDate}
                    onChange={(e) => setNewSchedule((p) => ({ ...p, endDate: e.target.value }))}
                    className="w-full rounded border border-gray-300 bg-surface px-2 py-1.5 text-xs focus:border-indigo-500 focus:outline-none"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-0.5 block text-[11px] text-gray-600">Start Time</label>
                  <input
                    type="time"
                    value={newSchedule.startTime}
                    onChange={(e) => setNewSchedule((p) => ({ ...p, startTime: e.target.value }))}
                    className="w-full rounded border border-gray-300 bg-surface px-2 py-1.5 text-xs focus:border-indigo-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-0.5 block text-[11px] text-gray-600">End Time</label>
                  <input
                    type="time"
                    value={newSchedule.endTime}
                    onChange={(e) => setNewSchedule((p) => ({ ...p, endTime: e.target.value }))}
                    className="w-full rounded border border-gray-300 bg-surface px-2 py-1.5 text-xs focus:border-indigo-500 focus:outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="mb-0.5 block text-[11px] text-gray-600">Days of Week</label>
                <div className="flex gap-1">
                  {DAYS_OF_WEEK.map((day) => (
                    <button
                      key={day.key}
                      type="button"
                      onClick={() => toggleDay(day.key)}
                      className={`h-7 w-7 rounded-full text-xs font-medium transition-colors ${
                        newSchedule.days.includes(day.key)
                          ? 'bg-indigo-600 text-white'
                          : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                      }`}
                    >
                      {day.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="mb-0.5 block text-[11px] text-gray-600">Override Price</label>
                <div className="relative">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-500">$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={newSchedule.overridePrice}
                    onChange={(e) => setNewSchedule((p) => ({ ...p, overridePrice: e.target.value }))}
                    placeholder="0.00"
                    className="w-full rounded border border-gray-300 bg-surface py-1.5 pl-5 pr-2 text-xs text-right focus:border-indigo-500 focus:outline-none"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowScheduleForm(false)}
                  className="rounded px-3 py-1 text-xs font-medium text-gray-600 hover:text-gray-900"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={addSchedule}
                  disabled={!newSchedule.overridePrice || !newSchedule.startDate}
                  className="rounded bg-indigo-600 px-3 py-1 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  Add Schedule
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Price Includes Tax toggle */}
        <div className="border-t border-gray-100 pt-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.priceIncludesTax}
              onChange={(e) => onUpdate({ priceIncludesTax: e.target.checked })}
              className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
            <span className="text-xs font-medium text-gray-700">Price Includes Tax</span>
          </label>
          <p className="mt-1 ml-6 text-[11px] text-gray-400">
            {form.priceIncludesTax
              ? 'The sale price already includes tax — tax will be extracted at checkout'
              : 'Tax will be added on top of the sale price at checkout'}
          </p>
        </div>

        {/* Tax Price Display */}
        <div className="border-t border-gray-100 pt-3">
          {totalTaxRate > 0 ? (
            <>
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-gray-700">Tax Calculation</span>
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
                  effectiveMode === 'inclusive'
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-green-100 text-green-700'
                }`}>
                  {effectiveMode === 'inclusive' ? 'Tax Inclusive' : 'Tax Exclusive'}
                </span>
              </div>
              {effectiveMode === 'inclusive' && basePrice && (
                <div className="mt-1.5 rounded-lg border border-blue-100 bg-blue-50/50 px-3 py-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-600">Base price</span>
                    <span className="font-semibold text-gray-900">${basePrice}</span>
                  </div>
                  <div className="mt-0.5 flex items-center justify-between text-[11px] text-gray-500">
                    <span>{(totalTaxRate * 100).toFixed(2)}% tax included</span>
                    <span>${(price - parseFloat(basePrice)).toFixed(2)} tax</span>
                  </div>
                </div>
              )}
              {effectiveMode === 'exclusive' && afterTaxPrice && (
                <div className="mt-1.5 rounded-lg border border-green-100 bg-green-50/50 px-3 py-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-600">Customer pays</span>
                    <span className="font-semibold text-gray-900">${afterTaxPrice}</span>
                  </div>
                  <div className="mt-0.5 flex items-center justify-between text-[11px] text-gray-500">
                    <span>{(totalTaxRate * 100).toFixed(2)}% tax added</span>
                    <span>${(parseFloat(afterTaxPrice) - price).toFixed(2)} tax</span>
                  </div>
                </div>
              )}
            </>
          ) : (
            <p className="text-[11px] text-gray-400">
              No tax groups assigned — assign in Tax section to see price breakdown
            </p>
          )}
        </div>
      </div>
    </CollapsibleSection>
  );
}
