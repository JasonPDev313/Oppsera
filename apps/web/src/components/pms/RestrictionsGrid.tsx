'use client';

import { useState, useMemo, useCallback } from 'react';
import { ShieldBan, Trash2, Save, ChevronLeft, ChevronRight } from 'lucide-react';
import { useRateRestrictions, usePmsMutations } from '@/hooks/use-pms';
import type { RateRestriction } from '@/hooks/use-pms';

interface RestrictionsGridProps {
  propertyId: string;
  roomTypes: Array<{ id: string; code: string; name: string }>;
  ratePlans: Array<{ id: string; code: string; name: string }>;
}

interface PendingRestriction {
  date: string;
  minStay: number | null;
  maxStay: number | null;
  cta: boolean;
  ctd: boolean;
  stopSell: boolean;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatDayOfWeek(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short' });
}

function getDateRange(startDate: string, days: number): string[] {
  const result: string[] = [];
  const start = new Date(startDate + 'T00:00:00');
  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    result.push(d.toISOString().split('T')[0]!);
  }
  return result;
}

function todayString(): string {
  return new Date().toISOString().split('T')[0]!;
}

export default function RestrictionsGrid({ propertyId, roomTypes, ratePlans }: RestrictionsGridProps) {
  const [selectedRoomTypeId, setSelectedRoomTypeId] = useState<string>('');
  const [selectedRatePlanId, setSelectedRatePlanId] = useState<string>('');
  const [startDate, setStartDate] = useState(() => todayString());
  const [daysToShow] = useState(14);
  const [pendingChanges, setPendingChanges] = useState<Map<string, PendingRestriction>>(new Map());
  const [saving, setSaving] = useState(false);

  const dates = useMemo(() => getDateRange(startDate, daysToShow), [startDate, daysToShow]);
  const endDate = dates[dates.length - 1]!;

  const { data: restrictions, isLoading, mutate: refreshRestrictions } = useRateRestrictions(
    propertyId,
    dates[0] ?? null,
    endDate,
    selectedRoomTypeId || undefined,
    selectedRatePlanId || undefined,
  );

  const mutations = usePmsMutations(propertyId);

  // Index restrictions by date for fast lookup
  const restrictionsByDate = useMemo(() => {
    const map = new Map<string, RateRestriction>();
    for (const r of restrictions) {
      map.set(r.restrictionDate, r);
    }
    return map;
  }, [restrictions]);

  // Navigate dates
  const goBack = useCallback(() => {
    const d = new Date(startDate + 'T00:00:00');
    d.setDate(d.getDate() - 7);
    setStartDate(d.toISOString().split('T')[0]!);
  }, [startDate]);

  const goForward = useCallback(() => {
    const d = new Date(startDate + 'T00:00:00');
    d.setDate(d.getDate() + 7);
    setStartDate(d.toISOString().split('T')[0]!);
  }, [startDate]);

  const goToday = useCallback(() => {
    setStartDate(todayString());
  }, []);

  // Toggle a restriction flag for a date
  const toggleFlag = useCallback(
    (dateStr: string, flag: 'cta' | 'ctd' | 'stopSell') => {
      setPendingChanges((prev) => {
        const next = new Map(prev);
        const existing = next.get(dateStr);
        const current = existing ?? {
          date: dateStr,
          minStay: restrictionsByDate.get(dateStr)?.minStay ?? null,
          maxStay: restrictionsByDate.get(dateStr)?.maxStay ?? null,
          cta: restrictionsByDate.get(dateStr)?.cta ?? false,
          ctd: restrictionsByDate.get(dateStr)?.ctd ?? false,
          stopSell: restrictionsByDate.get(dateStr)?.stopSell ?? false,
        };
        next.set(dateStr, { ...current, [flag]: !current[flag] });
        return next;
      });
    },
    [restrictionsByDate],
  );

  // Set min/max stay for a date
  const setStay = useCallback(
    (dateStr: string, field: 'minStay' | 'maxStay', value: number | null) => {
      setPendingChanges((prev) => {
        const next = new Map(prev);
        const existing = next.get(dateStr);
        const current = existing ?? {
          date: dateStr,
          minStay: restrictionsByDate.get(dateStr)?.minStay ?? null,
          maxStay: restrictionsByDate.get(dateStr)?.maxStay ?? null,
          cta: restrictionsByDate.get(dateStr)?.cta ?? false,
          ctd: restrictionsByDate.get(dateStr)?.ctd ?? false,
          stopSell: restrictionsByDate.get(dateStr)?.stopSell ?? false,
        };
        next.set(dateStr, { ...current, [field]: value });
        return next;
      });
    },
    [restrictionsByDate],
  );

  // Get effective value for a date (pending change > saved)
  const getEffective = useCallback(
    (dateStr: string): PendingRestriction => {
      const pending = pendingChanges.get(dateStr);
      if (pending) return pending;
      const saved = restrictionsByDate.get(dateStr);
      return {
        date: dateStr,
        minStay: saved?.minStay ?? null,
        maxStay: saved?.maxStay ?? null,
        cta: saved?.cta ?? false,
        ctd: saved?.ctd ?? false,
        stopSell: saved?.stopSell ?? false,
      };
    },
    [pendingChanges, restrictionsByDate],
  );

  // Save all pending changes
  const handleSave = useCallback(async () => {
    if (pendingChanges.size === 0) return;
    setSaving(true);
    try {
      const datesPayload = Array.from(pendingChanges.values());
      await mutations.setRestrictions.mutateAsync({
        propertyId,
        roomTypeId: selectedRoomTypeId || undefined,
        ratePlanId: selectedRatePlanId || undefined,
        dates: datesPayload,
      });
      setPendingChanges(new Map());
      refreshRestrictions();
    } finally {
      setSaving(false);
    }
  }, [pendingChanges, propertyId, selectedRoomTypeId, selectedRatePlanId, mutations.setRestrictions, refreshRestrictions]);

  // Clear all restrictions in current view
  const handleClearAll = useCallback(async () => {
    if (!confirm('Clear all restrictions in the current date range?')) return;
    setSaving(true);
    try {
      await mutations.clearRestrictions.mutateAsync({
        propertyId,
        startDate: dates[0]!,
        endDate,
        roomTypeId: selectedRoomTypeId || undefined,
        ratePlanId: selectedRatePlanId || undefined,
      });
      setPendingChanges(new Map());
      refreshRestrictions();
    } finally {
      setSaving(false);
    }
  }, [propertyId, dates, endDate, selectedRoomTypeId, selectedRatePlanId, mutations.clearRestrictions, refreshRestrictions]);

  const hasPendingChanges = pendingChanges.size > 0;

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={selectedRoomTypeId}
          onChange={(e) => { setSelectedRoomTypeId(e.target.value); setPendingChanges(new Map()); }}
          className="rounded-md border border-input bg-surface px-3 py-1.5 text-sm"
        >
          <option value="">All Room Types</option>
          {roomTypes.map((rt) => (
            <option key={rt.id} value={rt.id}>{rt.code} — {rt.name}</option>
          ))}
        </select>

        <select
          value={selectedRatePlanId}
          onChange={(e) => { setSelectedRatePlanId(e.target.value); setPendingChanges(new Map()); }}
          className="rounded-md border border-input bg-surface px-3 py-1.5 text-sm"
        >
          <option value="">All Rate Plans</option>
          {ratePlans.map((rp) => (
            <option key={rp.id} value={rp.id}>{rp.code} — {rp.name}</option>
          ))}
        </select>

        <div className="ml-auto flex items-center gap-1">
          <button onClick={goBack} className="rounded p-1 hover:bg-gray-200/50" title="Previous week" aria-label="Previous week">
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>
          <button onClick={goToday} className="rounded px-2 py-1 text-xs hover:bg-gray-200/50">
            Today
          </button>
          <button onClick={goForward} className="rounded p-1 hover:bg-gray-200/50" title="Next week" aria-label="Next week">
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Action Bar */}
      <div className="flex items-center gap-2">
        {hasPendingChanges && (
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            <Save className="h-3.5 w-3.5" />
            Save {pendingChanges.size} change{pendingChanges.size > 1 ? 's' : ''}
          </button>
        )}
        <button
          onClick={handleClearAll}
          disabled={saving || restrictions.length === 0}
          className="inline-flex items-center gap-1.5 rounded-md border border-red-500/40 px-3 py-1.5 text-sm text-red-500 hover:bg-red-500/10 disabled:opacity-50"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Clear Range
        </button>
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">Loading restrictions...</div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="sticky left-0 z-10 bg-muted/50 px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                  Restriction
                </th>
                {dates.map((d) => {
                  const isWeekend = [0, 6].includes(new Date(d + 'T00:00:00').getDay());
                  return (
                    <th
                      key={d}
                      className={`min-w-[72px] px-2 py-2 text-center text-xs font-medium ${isWeekend ? 'bg-muted/50' : ''}`}
                    >
                      <div className="text-muted-foreground">{formatDayOfWeek(d)}</div>
                      <div className="text-foreground">{formatDate(d)}</div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {/* Stop Sell row */}
              <tr className="border-b border-border">
                <td className="sticky left-0 z-10 bg-surface px-3 py-2 font-medium">
                  <span className="inline-flex items-center gap-1">
                    <ShieldBan className="h-3.5 w-3.5 text-red-500" />
                    Stop Sell
                  </span>
                </td>
                {dates.map((d) => {
                  const eff = getEffective(d);
                  const isPending = pendingChanges.has(d);
                  return (
                    <td key={d} className="px-2 py-2 text-center">
                      <button
                        onClick={() => toggleFlag(d, 'stopSell')}
                        className={`inline-flex h-7 w-7 items-center justify-center rounded ${
                          eff.stopSell
                            ? 'bg-red-500/20 text-red-500 ring-1 ring-red-500/30'
                            : 'bg-muted text-muted-foreground hover:bg-accent'
                        } ${isPending ? 'ring-2 ring-indigo-400' : ''}`}
                        title={eff.stopSell ? 'Stop sell active' : 'No stop sell'}
                      >
                        {eff.stopSell ? '✕' : '—'}
                      </button>
                    </td>
                  );
                })}
              </tr>

              {/* CTA row */}
              <tr className="border-b border-border">
                <td className="sticky left-0 z-10 bg-surface px-3 py-2 font-medium">CTA</td>
                {dates.map((d) => {
                  const eff = getEffective(d);
                  const isPending = pendingChanges.has(d);
                  return (
                    <td key={d} className="px-2 py-2 text-center">
                      <button
                        onClick={() => toggleFlag(d, 'cta')}
                        className={`inline-flex h-7 w-7 items-center justify-center rounded text-xs ${
                          eff.cta
                            ? 'bg-amber-500/20 text-amber-500 ring-1 ring-amber-500/30'
                            : 'bg-muted text-muted-foreground hover:bg-accent'
                        } ${isPending ? 'ring-2 ring-indigo-400' : ''}`}
                        title={eff.cta ? 'Closed to arrival' : 'Open to arrival'}
                      >
                        {eff.cta ? '✕' : '—'}
                      </button>
                    </td>
                  );
                })}
              </tr>

              {/* CTD row */}
              <tr className="border-b border-border">
                <td className="sticky left-0 z-10 bg-surface px-3 py-2 font-medium">CTD</td>
                {dates.map((d) => {
                  const eff = getEffective(d);
                  const isPending = pendingChanges.has(d);
                  return (
                    <td key={d} className="px-2 py-2 text-center">
                      <button
                        onClick={() => toggleFlag(d, 'ctd')}
                        className={`inline-flex h-7 w-7 items-center justify-center rounded text-xs ${
                          eff.ctd
                            ? 'bg-amber-500/20 text-amber-500 ring-1 ring-amber-500/30'
                            : 'bg-muted text-muted-foreground hover:bg-accent'
                        } ${isPending ? 'ring-2 ring-indigo-400' : ''}`}
                        title={eff.ctd ? 'Closed to departure' : 'Open to departure'}
                      >
                        {eff.ctd ? '✕' : '—'}
                      </button>
                    </td>
                  );
                })}
              </tr>

              {/* Min Stay row */}
              <tr className="border-b border-border">
                <td className="sticky left-0 z-10 bg-surface px-3 py-2 font-medium">Min Stay</td>
                {dates.map((d) => {
                  const eff = getEffective(d);
                  const isPending = pendingChanges.has(d);
                  return (
                    <td key={d} className="px-2 py-2 text-center">
                      <input
                        type="number"
                        min={0}
                        max={30}
                        value={eff.minStay ?? ''}
                        placeholder="—"
                        onChange={(e) => {
                          const val = e.target.value === '' ? null : parseInt(e.target.value, 10);
                          setStay(d, 'minStay', val && val > 0 ? val : null);
                        }}
                        className={`h-7 w-14 rounded border border-border bg-surface px-1 text-center text-xs ${
                          isPending ? 'ring-2 ring-indigo-400' : ''
                        }`}
                      />
                    </td>
                  );
                })}
              </tr>

              {/* Max Stay row */}
              <tr>
                <td className="sticky left-0 z-10 bg-surface px-3 py-2 font-medium">Max Stay</td>
                {dates.map((d) => {
                  const eff = getEffective(d);
                  const isPending = pendingChanges.has(d);
                  return (
                    <td key={d} className="px-2 py-2 text-center">
                      <input
                        type="number"
                        min={0}
                        max={365}
                        value={eff.maxStay ?? ''}
                        placeholder="—"
                        onChange={(e) => {
                          const val = e.target.value === '' ? null : parseInt(e.target.value, 10);
                          setStay(d, 'maxStay', val && val > 0 ? val : null);
                        }}
                        className={`h-7 w-14 rounded border border-border bg-surface px-1 text-center text-xs ${
                          isPending ? 'ring-2 ring-indigo-400' : ''
                        }`}
                      />
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded bg-red-500/20 ring-1 ring-red-500/30" />
          Stop Sell — no bookings allowed
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded bg-amber-500/20 ring-1 ring-amber-500/30" />
          CTA/CTD — closed to arrival/departure
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded ring-2 ring-indigo-400" />
          Unsaved change
        </span>
      </div>
    </div>
  );
}
