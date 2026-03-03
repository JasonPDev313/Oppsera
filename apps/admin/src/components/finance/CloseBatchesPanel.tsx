'use client';

import { useState, useEffect } from 'react';
import { AlertCircle } from 'lucide-react';
import { useCloseBatches, type CloseBatchFilters } from '@/hooks/use-finance';
import { useTenants } from '@/hooks/use-tenants';
import { formatDate, formatDateTime, hoursOpen } from '@/lib/finance-helpers';
import { StatusBadge } from './StatusBadge';
import { Pagination } from './Pagination';

export function CloseBatchesPanel() {
  const { tenants } = useTenants();
  const { data, isLoading, error, load } = useCloseBatches();

  const [tenantId, setTenantId] = useState('');
  const [locationId, setLocationId] = useState('');
  const [businessDate, setBusinessDate] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);

  const buildFilters = (p: number): CloseBatchFilters => ({
    tenantId: tenantId || undefined,
    locationId: locationId || undefined,
    businessDate: businessDate || undefined,
    status: statusFilter || undefined,
    page: p,
    limit: 25,
  });

  useEffect(() => {
    load(buildFilters(1));
  }, []);

  const handleSearch = () => {
    setPage(1);
    load(buildFilters(1));
  };

  const handlePageChange = (p: number) => {
    setPage(p);
    load(buildFilters(p));
  };

  const totalPages = data ? Math.ceil(data.total / data.limit) : 0;

  const STATUS_OPTIONS = [
    { value: '', label: 'All' },
    { value: 'open', label: 'Open' },
    { value: 'in_progress', label: 'In Progress' },
    { value: 'reconciled', label: 'Reconciled' },
    { value: 'posted', label: 'Posted' },
    { value: 'locked', label: 'Locked' },
  ];

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 p-4">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Tenant</label>
            <select
              value={tenantId}
              onChange={(e) => setTenantId(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
            >
              <option value="">All Tenants</option>
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Location ID</label>
            <input
              type="text"
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
              placeholder="Location ID"
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Business Date</label>
            <input
              type="date"
              value={businessDate}
              onChange={(e) => setBusinessDate(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <button
              onClick={handleSearch}
              className="w-full px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
            >
              Search
            </button>
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {/* Loading */}
      {isLoading && !data && (
        <div className="text-slate-500 text-sm text-center py-12">Loading close batches...</div>
      )}

      {/* Results */}
      {data && (
        <>
          <p className="text-xs text-slate-400">
            {data.total} batch{data.total !== 1 ? 'es' : ''} found
          </p>

          {data.items.length === 0 ? (
            <div className="text-slate-500 text-sm text-center py-12">
              No close batches match your criteria.
            </div>
          ) : (
            <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700 bg-slate-800/50">
                    <th className="text-left px-4 py-3 font-medium text-slate-400 text-xs">
                      Status
                    </th>
                    <th className="text-left px-4 py-3 font-medium text-slate-400 text-xs">
                      Type
                    </th>
                    <th className="text-left px-4 py-3 font-medium text-slate-400 text-xs">
                      Tenant
                    </th>
                    <th className="text-left px-4 py-3 font-medium text-slate-400 text-xs">
                      Location
                    </th>
                    <th className="text-left px-4 py-3 font-medium text-slate-400 text-xs">
                      Business Date
                    </th>
                    <th className="text-left px-4 py-3 font-medium text-slate-400 text-xs">
                      Opened
                    </th>
                    <th className="text-left px-4 py-3 font-medium text-slate-400 text-xs">
                      Closed
                    </th>
                    <th className="text-left px-4 py-3 font-medium text-slate-400 text-xs">
                      Duration
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700">
                  {data.items.map((batch) => (
                    <tr
                      key={batch.id}
                      className="hover:bg-slate-700/50 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <StatusBadge status={batch.status} />
                          {batch.is_overdue && (
                            <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium border bg-red-500/10 text-red-400 border-red-500/30">
                              <AlertCircle size={10} />
                              OVERDUE
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium border ${
                            batch.batch_type === 'fnb'
                              ? 'bg-purple-500/10 text-purple-400 border-purple-500/30'
                              : 'bg-sky-500/10 text-sky-400 border-sky-500/30'
                          }`}
                        >
                          {batch.batch_type === 'fnb' ? 'F&B' : 'Retail'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-300 text-xs">
                        {batch.tenant_name}
                      </td>
                      <td className="px-4 py-3 text-slate-400 text-xs">
                        {batch.location_name}
                      </td>
                      <td className="px-4 py-3 text-white text-xs">
                        {formatDate(batch.business_date)}
                      </td>
                      <td className="px-4 py-3 text-slate-400 text-xs">
                        {formatDateTime(batch.started_at)}
                      </td>
                      <td className="px-4 py-3 text-slate-400 text-xs">
                        {batch.reconciled_at
                          ? formatDateTime(batch.reconciled_at)
                          : batch.locked_at
                            ? formatDateTime(batch.locked_at)
                            : '\u2014'}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {batch.status === 'open' ? (
                          <span className={batch.is_overdue ? 'text-red-400 font-medium' : 'text-amber-400'}>
                            {hoursOpen(batch.started_at)}
                          </span>
                        ) : (
                          <span className="text-slate-500">\u2014</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="px-4 py-3 border-t border-slate-700">
                <Pagination
                  page={page}
                  totalPages={totalPages}
                  onPageChange={handlePageChange}
                />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
