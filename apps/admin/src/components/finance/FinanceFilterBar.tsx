'use client';

import { useState, useCallback, useMemo } from 'react';
import { Calendar, Building2, X } from 'lucide-react';
import { useTenants } from '@/hooks/use-tenants';

type TimePeriod = 'today' | 'yesterday' | 'last7' | 'last30' | 'thisMonth' | 'custom' | '';

export interface GlobalFilters {
  tenantId: string;
  dateFrom: string;
  dateTo: string;
}

interface FinanceFilterBarProps {
  filters: GlobalFilters;
  onChange: (filters: GlobalFilters) => void;
}

function formatLocalDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getPresetDates(period: TimePeriod): { from: string; to: string } {
  const today = new Date();
  switch (period) {
    case 'today':
      return { from: formatLocalDate(today), to: formatLocalDate(today) };
    case 'yesterday': {
      const y = new Date(today);
      y.setDate(y.getDate() - 1);
      return { from: formatLocalDate(y), to: formatLocalDate(y) };
    }
    case 'last7': {
      const d = new Date(today);
      d.setDate(d.getDate() - 6);
      return { from: formatLocalDate(d), to: formatLocalDate(today) };
    }
    case 'last30': {
      const d = new Date(today);
      d.setDate(d.getDate() - 29);
      return { from: formatLocalDate(d), to: formatLocalDate(today) };
    }
    case 'thisMonth': {
      const first = new Date(today.getFullYear(), today.getMonth(), 1);
      return { from: formatLocalDate(first), to: formatLocalDate(today) };
    }
    default:
      return { from: '', to: '' };
  }
}

const PERIOD_OPTIONS: { value: TimePeriod; label: string }[] = [
  { value: '', label: 'All Time' },
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'last7', label: 'Last 7 Days' },
  { value: 'last30', label: 'Last 30 Days' },
  { value: 'thisMonth', label: 'This Month' },
  { value: 'custom', label: 'Custom Range' },
];

export function FinanceFilterBar({ filters, onChange }: FinanceFilterBarProps) {
  const { tenants } = useTenants();
  const [period, setPeriod] = useState<TimePeriod>('');

  const handleTenantChange = useCallback(
    (tenantId: string) => {
      onChange({ ...filters, tenantId });
    },
    [filters, onChange],
  );

  const handlePeriodChange = useCallback(
    (p: TimePeriod) => {
      setPeriod(p);
      if (p === 'custom') return;
      const { from, to } = getPresetDates(p);
      onChange({ ...filters, dateFrom: from, dateTo: to });
    },
    [filters, onChange],
  );

  const handleDateFromChange = useCallback(
    (dateFrom: string) => {
      setPeriod('custom');
      onChange({ ...filters, dateFrom });
    },
    [filters, onChange],
  );

  const handleDateToChange = useCallback(
    (dateTo: string) => {
      setPeriod('custom');
      onChange({ ...filters, dateTo });
    },
    [filters, onChange],
  );

  const handleClear = useCallback(() => {
    setPeriod('');
    onChange({ tenantId: '', dateFrom: '', dateTo: '' });
  }, [onChange]);

  const hasFilters = filters.tenantId || filters.dateFrom || filters.dateTo;

  const tenantName = useMemo(() => {
    if (!filters.tenantId) return null;
    return tenants.find((t) => t.id === filters.tenantId)?.name ?? null;
  }, [filters.tenantId, tenants]);

  return (
    <div className="bg-slate-800/50 rounded-xl border border-slate-700 px-4 py-3 mb-6">
      <div className="flex items-center gap-3 flex-wrap">
        {/* Tenant selector */}
        <div className="flex items-center gap-2">
          <Building2 size={14} className="text-slate-500 flex-shrink-0" />
          <select
            value={filters.tenantId}
            onChange={(e) => handleTenantChange(e.target.value)}
            className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none min-w-[180px]"
          >
            <option value="">All Tenants</option>
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>

        <div className="w-px h-6 bg-slate-700" />

        {/* Time period presets */}
        <div className="flex items-center gap-2">
          <Calendar size={14} className="text-slate-500 flex-shrink-0" />
          <div className="flex items-center gap-1">
            {PERIOD_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => handlePeriodChange(opt.value)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                  period === opt.value
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Custom date inputs (always visible when custom, or when dates are set manually) */}
        {(period === 'custom' || (period === '' && (filters.dateFrom || filters.dateTo))) && (
          <>
            <div className="w-px h-6 bg-slate-700" />
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={filters.dateFrom}
                onChange={(e) => handleDateFromChange(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
              />
              <span className="text-xs text-slate-500">to</span>
              <input
                type="date"
                value={filters.dateTo}
                onChange={(e) => handleDateToChange(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
              />
            </div>
          </>
        )}

        {/* Clear button */}
        {hasFilters && (
          <>
            <div className="w-px h-6 bg-slate-700" />
            <button
              onClick={handleClear}
              className="flex items-center gap-1 text-xs text-slate-400 hover:text-white transition-colors"
            >
              <X size={12} />
              Clear
            </button>
          </>
        )}
      </div>

      {/* Active filter summary */}
      {hasFilters && (
        <div className="flex items-center gap-2 mt-2 text-xs text-slate-500">
          <span>Filtering:</span>
          {tenantName && (
            <span className="bg-slate-700 rounded px-2 py-0.5 text-slate-300">
              {tenantName}
            </span>
          )}
          {filters.dateFrom && (
            <span className="bg-slate-700 rounded px-2 py-0.5 text-slate-300">
              From {filters.dateFrom}
            </span>
          )}
          {filters.dateTo && (
            <span className="bg-slate-700 rounded px-2 py-0.5 text-slate-300">
              To {filters.dateTo}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
