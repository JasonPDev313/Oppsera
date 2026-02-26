'use client';

import { useState } from 'react';
import { Copy, Plus, Trash2 } from 'lucide-react';
import type { BusinessHours } from '@oppsera/shared';

const DAYS = [
  { key: 'mon', label: 'Monday' },
  { key: 'tue', label: 'Tuesday' },
  { key: 'wed', label: 'Wednesday' },
  { key: 'thu', label: 'Thursday' },
  { key: 'fri', label: 'Friday' },
  { key: 'sat', label: 'Saturday' },
  { key: 'sun', label: 'Sunday' },
] as const;

type DayKey = (typeof DAYS)[number]['key'];

interface DayHours {
  closed: boolean;
  periods: Array<{ open: string; close: string }>;
}

const DEFAULT_PERIOD = { open: '09:00', close: '17:00' };

function getDay(hours: BusinessHours, key: DayKey): DayHours {
  const existing = hours[key];
  if (existing) return existing as DayHours;
  return { closed: true, periods: [] };
}

// Generate 15-min increment options
const TIME_OPTIONS: string[] = [];
for (let h = 0; h < 24; h++) {
  for (let m = 0; m < 60; m += 15) {
    TIME_OPTIONS.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
  }
}

function formatTime(t: string): string {
  const [hStr = '0', mStr = '0'] = t.split(':');
  const h = parseInt(hStr, 10);
  const m = mStr;
  const suffix = h >= 12 ? 'PM' : 'AM';
  const display = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${display}:${m} ${suffix}`;
}

interface BusinessHoursEditorProps {
  value: BusinessHours;
  onChange: (hours: BusinessHours) => void;
  disabled?: boolean;
}

export function BusinessHoursEditor({ value, onChange, disabled = false }: BusinessHoursEditorProps) {
  const [sameEveryDay, setSameEveryDay] = useState(false);

  function updateDay(key: DayKey, update: Partial<DayHours>) {
    const current = getDay(value, key);
    const next = { ...current, ...update };

    if (sameEveryDay) {
      const all: BusinessHours = {};
      for (const d of DAYS) {
        (all as Record<string, DayHours>)[d.key] = { ...next };
      }
      onChange(all);
    } else {
      onChange({ ...value, [key]: next });
    }
  }

  function toggleClosed(key: DayKey) {
    const current = getDay(value, key);
    const newClosed = !current.closed;
    updateDay(key, {
      closed: newClosed,
      periods: newClosed ? [] : [{ ...DEFAULT_PERIOD }],
    });
  }

  function addPeriod(key: DayKey) {
    const current = getDay(value, key);
    if (current.periods.length >= 3) return;
    updateDay(key, { periods: [...current.periods, { ...DEFAULT_PERIOD }] });
  }

  function removePeriod(key: DayKey, idx: number) {
    const current = getDay(value, key);
    updateDay(key, { periods: current.periods.filter((_, i) => i !== idx) });
  }

  function updatePeriod(key: DayKey, idx: number, field: 'open' | 'close', val: string) {
    const current = getDay(value, key);
    const periods = current.periods.map((p, i) => (i === idx ? { ...p, [field]: val } : p));
    updateDay(key, { periods });
  }

  function copyToAll() {
    const monHours = getDay(value, 'mon');
    const all: BusinessHours = {};
    for (const d of DAYS) {
      (all as Record<string, DayHours>)[d.key] = { ...monHours, periods: monHours.periods.map((p) => ({ ...p })) };
    }
    onChange(all);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={sameEveryDay}
            onChange={(e) => setSameEveryDay(e.target.checked)}
            disabled={disabled}
            className="h-4 w-4 rounded border-input text-indigo-500 focus:ring-indigo-500"
          />
          Same every day
        </label>
        <button
          type="button"
          onClick={copyToAll}
          disabled={disabled}
          className="flex items-center gap-1 text-xs text-indigo-500 hover:text-indigo-500 disabled:opacity-50"
        >
          <Copy className="h-3 w-3" />
          Copy Monday to all
        </button>
      </div>

      <div className="space-y-2">
        {DAYS.map(({ key, label }) => {
          const day = getDay(value, key);
          if (sameEveryDay && key !== 'mon') return null;

          return (
            <div key={key} className="flex items-start gap-3 rounded-md border border-border bg-surface p-2.5">
              <div className="w-24 shrink-0 pt-1.5 text-sm font-medium text-foreground">
                {sameEveryDay ? 'All days' : label}
              </div>

              <label className="flex shrink-0 items-center gap-1.5 pt-1.5">
                <input
                  type="checkbox"
                  checked={day.closed}
                  onChange={() => toggleClosed(key)}
                  disabled={disabled}
                  className="h-3.5 w-3.5 rounded border-input text-muted-foreground focus:ring-gray-400"
                />
                <span className="text-xs text-muted-foreground">Closed</span>
              </label>

              {!day.closed && (
                <div className="flex flex-1 flex-col gap-1.5">
                  {day.periods.map((period, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <select
                        value={period.open}
                        onChange={(e) => updatePeriod(key, idx, 'open', e.target.value)}
                        disabled={disabled}
                        className="rounded border border-input bg-surface px-2 py-1 text-sm"
                      >
                        {TIME_OPTIONS.map((t) => (
                          <option key={t} value={t}>{formatTime(t)}</option>
                        ))}
                      </select>
                      <span className="text-xs text-muted-foreground">to</span>
                      <select
                        value={period.close}
                        onChange={(e) => updatePeriod(key, idx, 'close', e.target.value)}
                        disabled={disabled}
                        className="rounded border border-input bg-surface px-2 py-1 text-sm"
                      >
                        {TIME_OPTIONS.map((t) => (
                          <option key={t} value={t}>{formatTime(t)}</option>
                        ))}
                      </select>
                      {day.periods.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removePeriod(key, idx)}
                          disabled={disabled}
                          className="p-0.5 text-muted-foreground hover:text-red-500"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                  {day.periods.length < 3 && (
                    <button
                      type="button"
                      onClick={() => addPeriod(key)}
                      disabled={disabled}
                      className="flex items-center gap-1 text-xs text-indigo-500 hover:text-indigo-500"
                    >
                      <Plus className="h-3 w-3" />
                      Add hours
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
