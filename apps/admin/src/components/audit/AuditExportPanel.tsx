'use client';

import { useState, useEffect } from 'react';
import { Download, Loader2, AlertCircle } from 'lucide-react';
import { useAuditExport } from '@/hooks/use-audit';
import { adminFetch } from '@/lib/api-fetch';

interface TenantOption {
  id: string;
  name: string;
}

export function AuditExportPanel() {
  const [source, setSource] = useState<'platform' | 'tenant'>('platform');
  const [tenantId, setTenantId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [tenants, setTenants] = useState<TenantOption[]>([]);

  const { exportCsv, isExporting, error } = useAuditExport();

  // Load tenants for selector
  useEffect(() => {
    adminFetch<{ data: { items?: TenantOption[] } | TenantOption[] }>('/api/v1/tenants?limit=200')
      .then((json) => {
        const d = json.data;
        const list = (Array.isArray(d) ? d : d.items ?? []) as TenantOption[];
        setTenants(list);
      })
      .catch(() => {});
  }, []);

  // Validate date range
  const diffDays = dateFrom && dateTo
    ? (new Date(dateTo).getTime() - new Date(dateFrom).getTime()) / (1000 * 60 * 60 * 24)
    : 0;
  const isRangeValid = dateFrom && dateTo && diffDays > 0 && diffDays <= 90;
  const canExport = isRangeValid && (source === 'platform' || tenantId);

  const handleExport = () => {
    if (!canExport) return;
    exportCsv({
      source,
      tenant_id: source === 'tenant' ? tenantId : undefined,
      date_from: dateFrom,
      date_to: dateTo,
    });
  };

  return (
    <div className="max-w-lg">
      <div className="space-y-5">
        {/* Source */}
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-2">
            Source
          </label>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
              <input
                type="radio"
                name="source"
                checked={source === 'platform'}
                onChange={() => setSource('platform')}
                className="accent-indigo-600"
              />
              Platform Actions
            </label>
            <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
              <input
                type="radio"
                name="source"
                checked={source === 'tenant'}
                onChange={() => setSource('tenant')}
                className="accent-indigo-600"
              />
              Tenant Activity
            </label>
          </div>
        </div>

        {/* Tenant selector (when source = tenant) */}
        {source === 'tenant' && (
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Tenant
            </label>
            <select
              value={tenantId}
              onChange={(e) => setTenantId(e.target.value)}
              className="w-full bg-surface border border-border text-foreground text-sm rounded px-3 py-2"
            >
              <option value="">Select tenant...</option>
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* Date range */}
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            Date Range
          </label>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="flex-1 bg-surface border border-border text-foreground text-sm rounded px-3 py-2"
            />
            <span className="text-muted-foreground text-sm">to</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="flex-1 bg-surface border border-border text-foreground text-sm rounded px-3 py-2"
            />
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">
            Maximum range: 90 days
          </p>
          {dateFrom && dateTo && diffDays > 90 && (
            <p className="flex items-center gap-1 text-[10px] text-red-400 mt-1">
              <AlertCircle size={10} /> Range exceeds 90 days
            </p>
          )}
        </div>

        {/* Export button */}
        <button
          onClick={handleExport}
          disabled={!canExport || isExporting}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {isExporting ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Download size={14} />
          )}
          {isExporting ? 'Exporting...' : 'Export to CSV'}
        </button>

        {error && (
          <p className="flex items-center gap-1 text-xs text-red-400">
            <AlertCircle size={12} /> {error}
          </p>
        )}
      </div>
    </div>
  );
}
