'use client';

import { useState, useEffect } from 'react';
import { Search, Filter, ExternalLink } from 'lucide-react';
import { useOrderSearch, type OrderSearchFilters } from '@/hooks/use-finance';
import { useTenants } from '@/hooks/use-tenants';
import { formatCents, formatDate } from '@/lib/finance-helpers';
import { StatusBadge } from './StatusBadge';
import { Pagination } from './Pagination';

const ORDER_STATUSES = [
  { value: '', label: 'All Statuses' },
  { value: 'open', label: 'Open' },
  { value: 'placed', label: 'Placed' },
  { value: 'paid', label: 'Paid' },
  { value: 'voided', label: 'Voided' },
  { value: 'held', label: 'Held' },
];

interface OrderSearchPanelProps {
  onSelectOrder: (orderId: string) => void;
}

export function OrderSearchPanel({ onSelectOrder }: OrderSearchPanelProps) {
  const { data, isLoading, error, load } = useOrderSearch();
  const { tenants } = useTenants();

  // Filters
  const [orderNumber, setOrderNumber] = useState('');
  const [tenantId, setTenantId] = useState('');
  const [status, setStatus] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [amountMin, setAmountMin] = useState('');
  const [amountMax, setAmountMax] = useState('');
  const [hasVoids, setHasVoids] = useState(false);
  const [hasRefunds, setHasRefunds] = useState(false);
  const [page, setPage] = useState(1);
  const [showFilters, setShowFilters] = useState(false);

  const buildFilters = (p: number): OrderSearchFilters => ({
    orderNumber: orderNumber || undefined,
    tenantId: tenantId || undefined,
    status: status || undefined,
    businessDateFrom: dateFrom || undefined,
    businessDateTo: dateTo || undefined,
    amountMin: amountMin ? Number(amountMin) : undefined,
    amountMax: amountMax ? Number(amountMax) : undefined,
    hasVoids: hasVoids || undefined,
    hasRefunds: hasRefunds || undefined,
    page: p,
    limit: 25,
  });

  // Initial load
  useEffect(() => {
    load(buildFilters(1));
  }, []);

  const handleSearch = () => {
    setPage(1);
    load(buildFilters(1));
  };

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    load(buildFilters(newPage));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
  };

  const totalPages = data ? Math.ceil(data.total / data.limit) : 0;

  return (
    <div className="space-y-4">
      {/* Search bar */}
      <div className="flex gap-3">
        <div className="flex-1 relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            value={orderNumber}
            onChange={(e) => setOrderNumber(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search by order number..."
            className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-10 pr-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
          />
        </div>
        <button
          onClick={() => setShowFilters((v) => !v)}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
            showFilters
              ? 'bg-indigo-600 text-white'
              : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
          }`}
        >
          <Filter size={14} />
          Filters
        </button>
        <button
          onClick={handleSearch}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
        >
          Search
        </button>
      </div>

      {/* Filters row */}
      {showFilters && (
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Tenant</label>
              <select
                value={tenantId}
                onChange={(e) => setTenantId(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
              >
                <option value="">All Tenants</option>
                {tenants.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
              >
                {ORDER_STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Date From</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Date To</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Amount Min (cents)</label>
              <input
                type="number"
                value={amountMin}
                onChange={(e) => setAmountMin(e.target.value)}
                placeholder="0"
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Amount Max (cents)</label>
              <input
                type="number"
                value={amountMax}
                onChange={(e) => setAmountMax(e.target.value)}
                placeholder="99999"
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
              />
            </div>
            <div className="flex items-end gap-4 col-span-2">
              <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={hasVoids}
                  onChange={(e) => setHasVoids(e.target.checked)}
                  className="rounded border-slate-600 bg-slate-700 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-0"
                />
                Has Voids
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={hasRefunds}
                  onChange={(e) => setHasRefunds(e.target.checked)}
                  className="rounded border-slate-600 bg-slate-700 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-0"
                />
                Has Refunds
              </label>
            </div>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {/* Loading */}
      {isLoading && !data && (
        <div className="text-slate-500 text-sm text-center py-12">Loading...</div>
      )}

      {/* Results */}
      {data && (
        <>
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-400">
              {data.total} order{data.total !== 1 ? 's' : ''} found
              {isLoading && ' (refreshing...)'}
            </p>
          </div>

          {data.items.length === 0 ? (
            <div className="text-slate-500 text-sm text-center py-12">
              No orders match your search criteria.
            </div>
          ) : (
            <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700 bg-slate-800/50">
                    <th className="text-left px-4 py-3 font-medium text-slate-400">
                      Order #
                    </th>
                    <th className="text-left px-4 py-3 font-medium text-slate-400">
                      Tenant
                    </th>
                    <th className="text-left px-4 py-3 font-medium text-slate-400">
                      Location
                    </th>
                    <th className="text-right px-4 py-3 font-medium text-slate-400">
                      Total
                    </th>
                    <th className="text-left px-4 py-3 font-medium text-slate-400">
                      Status
                    </th>
                    <th className="text-left px-4 py-3 font-medium text-slate-400">
                      Date
                    </th>
                    <th className="text-left px-4 py-3 font-medium text-slate-400">
                      Employee
                    </th>
                    <th className="text-right px-4 py-3 font-medium text-slate-400" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700">
                  {data.items.map((order) => (
                    <tr
                      key={order.id}
                      onClick={() => onSelectOrder(order.id)}
                      className="hover:bg-slate-700/50 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-3">
                        <span className="font-mono text-white text-xs">
                          {order.order_number}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-300 text-xs">
                        {order.tenant_name}
                      </td>
                      <td className="px-4 py-3 text-slate-400 text-xs">
                        {order.location_name}
                      </td>
                      <td className="px-4 py-3 text-right text-white text-xs font-medium">
                        {formatCents(order.total)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <StatusBadge status={order.status} />
                          {order.status === 'voided' && order.void_reason && (
                            <span className="text-xs text-red-400 truncate max-w-[100px]" title={order.void_reason}>
                              {order.void_reason}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-400 text-xs">
                        {formatDate(order.business_date)}
                      </td>
                      <td className="px-4 py-3 text-slate-400 text-xs">
                        {order.employee_name ?? '\u2014'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <ExternalLink
                          size={14}
                          className="text-slate-500 hover:text-indigo-400 transition-colors"
                        />
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
