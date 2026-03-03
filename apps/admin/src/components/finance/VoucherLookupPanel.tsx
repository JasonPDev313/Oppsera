'use client';

import { useState, useEffect } from 'react';
import { Search, Ticket } from 'lucide-react';
import { useVouchers, type VoucherFilters } from '@/hooks/use-finance';
import { useTenants } from '@/hooks/use-tenants';
import { formatCents, formatDate } from '@/lib/finance-helpers';
import { StatusBadge } from './StatusBadge';
import { Pagination } from './Pagination';

const VOUCHER_STATUSES = [
  { value: '', label: 'All Statuses' },
  { value: 'unredeemed', label: 'Unredeemed' },
  { value: 'partially_redeemed', label: 'Partially Redeemed' },
  { value: 'fully_redeemed', label: 'Fully Redeemed' },
  { value: 'expired', label: 'Expired' },
  { value: 'refunded', label: 'Refunded' },
];

const VOUCHER_TYPES = [
  { value: '', label: 'All Types' },
  { value: 'gift_card', label: 'Gift Card' },
  { value: 'store_credit', label: 'Store Credit' },
  { value: 'promotion', label: 'Promotion' },
  { value: 'certificate', label: 'Certificate' },
];

export function VoucherLookupPanel() {
  const { tenants } = useTenants();
  const { data, isLoading, error, load } = useVouchers();

  const [code, setCode] = useState('');
  const [tenantId, setTenantId] = useState('');
  const [status, setStatus] = useState('');
  const [voucherType, setVoucherType] = useState('');
  const [page, setPage] = useState(1);

  const buildFilters = (p: number): VoucherFilters => ({
    tenantId: tenantId || undefined,
    code: code || undefined,
    status: status || undefined,
    voucherType: voucherType || undefined,
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
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search by voucher code/number..."
            className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-10 pr-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
          />
        </div>
        <button
          onClick={handleSearch}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
        >
          Search
        </button>
      </div>

      {/* Filters */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 p-4">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
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
            <label className="block text-xs text-slate-400 mb-1">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
            >
              {VOUCHER_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Type</label>
            <select
              value={voucherType}
              onChange={(e) => setVoucherType(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
            >
              {VOUCHER_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
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
        <div className="text-slate-500 text-sm text-center py-12">Loading vouchers...</div>
      )}

      {/* Results */}
      {data && (
        <>
          <p className="text-xs text-slate-400">
            {data.total} voucher{data.total !== 1 ? 's' : ''} found
          </p>

          {data.items.length === 0 ? (
            <div className="text-slate-500 text-sm text-center py-12">
              No vouchers match your criteria.
            </div>
          ) : (
            <div className="space-y-2">
              {data.items.map((voucher) => {
                const remaining =
                  (voucher.voucher_amount_cents ?? 0) - (voucher.redeemed_amount_cents ?? 0);

                return (
                  <div
                    key={voucher.id}
                    className="bg-slate-800 rounded-xl border border-slate-700 p-4 hover:border-slate-600 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Ticket size={16} className="text-indigo-400 flex-shrink-0" />
                        <span className="text-white font-mono text-sm font-medium">
                          {voucher.voucher_number}
                        </span>
                        <StatusBadge status={voucher.redemption_status} />
                        {voucher.voucher_type_category && (
                          <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium border bg-slate-500/10 text-slate-400 border-slate-500/30 capitalize">
                            {voucher.voucher_type_category.replace(/_/g, ' ')}
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-slate-400">
                        {voucher.tenant_name}
                      </span>
                    </div>

                    {/* Amounts */}
                    <div className="grid grid-cols-3 gap-4 mt-3">
                      <div>
                        <p className="text-xs text-slate-500">Original</p>
                        <p className="text-sm text-white font-medium">
                          {formatCents(voucher.voucher_amount_cents)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500">Redeemed</p>
                        <p className="text-sm text-slate-300">
                          {formatCents(voucher.redeemed_amount_cents)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500">Remaining</p>
                        <p
                          className={`text-sm font-medium ${
                            remaining > 0 ? 'text-emerald-400' : 'text-slate-400'
                          }`}
                        >
                          {formatCents(remaining)}
                        </p>
                      </div>
                    </div>

                    {/* Details row */}
                    <div className="flex items-center gap-4 mt-3 text-xs text-slate-500">
                      {voucher.voucher_type_name && (
                        <span>Type: {voucher.voucher_type_name}</span>
                      )}
                      {voucher.validity_start_date && (
                        <span>
                          Valid: {formatDate(voucher.validity_start_date)}
                          {voucher.validity_end_date
                            ? ` - ${formatDate(voucher.validity_end_date)}`
                            : ' onwards'}
                        </span>
                      )}
                      {(voucher.customer_name || voucher.first_name) && (
                        <span>
                          Customer:{' '}
                          {voucher.customer_name ??
                            `${voucher.first_name ?? ''} ${voucher.last_name ?? ''}`.trim()}
                        </span>
                      )}
                      <span>Created: {formatDate(voucher.created_at)}</span>
                    </div>

                    {voucher.notes && (
                      <p className="text-xs text-slate-400 mt-2">{voucher.notes}</p>
                    )}
                  </div>
                );
              })}

              <Pagination
                page={page}
                totalPages={totalPages}
                onPageChange={handlePageChange}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
