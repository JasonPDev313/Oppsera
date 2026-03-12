'use client';

import { useState, useEffect } from 'react';
import { AlertCircle } from 'lucide-react';
import { useChargebacks, type ChargebackFilters } from '@/hooks/use-finance';
import { formatCents, formatDate } from '@/lib/finance-helpers';
import { StatusBadge } from './StatusBadge';
import { Pagination } from './Pagination';
import type { GlobalFilters } from './FinanceFilterBar';

const CHARGEBACK_STATUSES = [
  { value: '', label: 'All Statuses' },
  { value: 'received', label: 'Received' },
  { value: 'under_review', label: 'Under Review' },
  { value: 'won', label: 'Won' },
  { value: 'lost', label: 'Lost' },
];

interface ChargebacksPanelProps {
  globalFilters: GlobalFilters;
}

export function ChargebacksPanel({ globalFilters }: ChargebacksPanelProps) {
  const { data, isLoading, error, load } = useChargebacks();

  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);

  const buildFilters = (p: number): ChargebackFilters => ({
    tenantId: globalFilters.tenantId || undefined,
    status: status || undefined,
    dateFrom: globalFilters.dateFrom || undefined,
    dateTo: globalFilters.dateTo || undefined,
    page: p,
    limit: 25,
  });

  // Reload when global filters change
  useEffect(() => {
    setPage(1);
    load(buildFilters(1));
  }, [globalFilters.tenantId, globalFilters.dateFrom, globalFilters.dateTo]);

  const handleSearch = () => {
    setPage(1);
    load(buildFilters(1));
  };

  const handlePageChange = (p: number) => {
    setPage(p);
    load(buildFilters(p));
  };

  const totalPages = data ? Math.ceil(data.total / data.limit) : 0;

  // Chargebacks typically have a 30-day response window from the business date
  const isPastDue = (dateStr: string | null) => {
    if (!dateStr) return false;
    const deadline = new Date(dateStr);
    deadline.setDate(deadline.getDate() + 30);
    return deadline < new Date();
  };

  return (
    <div className="space-y-4">
      {/* Panel-specific filters */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 p-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="cb-status" className="block text-xs text-slate-400 mb-1">Status</label>
            <select
              id="cb-status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
            >
              {CHARGEBACK_STATUSES.map((s) => (
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
        <div className="text-slate-500 text-sm text-center py-12">Loading chargebacks...</div>
      )}

      {/* Results */}
      {data && (
        <>
          <p className="text-xs text-slate-400">
            {data.total} chargeback{data.total !== 1 ? 's' : ''} found
          </p>

          {data.items.length === 0 ? (
            <div className="text-slate-500 text-sm text-center py-12">
              No chargebacks match your criteria.
            </div>
          ) : (
            <div className="space-y-2">
              {data.items.map((cb) => (
                <div
                  key={cb.id}
                  className="bg-slate-800 rounded-xl border border-slate-700 p-4 hover:border-slate-600 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <StatusBadge status={cb.status} />
                      <span className="text-white text-sm font-medium">
                        {formatCents(cb.chargeback_amount_cents)}
                      </span>
                      {cb.fee_amount_cents > 0 && (
                        <span className="text-xs text-red-400">
                          + {formatCents(cb.fee_amount_cents)} fee
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {cb.provider_case_id && (
                        <span className="text-xs text-slate-500 font-mono">
                          Case: {cb.provider_case_id}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-4 mt-2 text-xs text-slate-400">
                    <span>{cb.tenant_name}</span>
                    {cb.location_name && <span>{cb.location_name}</span>}
                    <span className="font-mono">Order #{cb.order_number}</span>
                    {cb.card_brand && (
                      <span>
                        {cb.card_brand} ****{cb.card_last4}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-4 mt-2 text-xs text-slate-500">
                    <span>Received: {formatDate(cb.created_at)}</span>
                    {cb.business_date && (
                      <span>Biz date: {formatDate(cb.business_date)}</span>
                    )}
                    {cb.resolution_date && (
                      <span>Resolved: {formatDate(cb.resolution_date)}</span>
                    )}
                  </div>

                  {cb.chargeback_reason && (
                    <p className="text-xs text-slate-300 mt-2">
                      Reason: {cb.chargeback_reason}
                    </p>
                  )}

                  {cb.resolution_reason && (
                    <p className="text-xs text-slate-400 mt-1">
                      Resolution: {cb.resolution_reason}
                    </p>
                  )}

                  {cb.customer_name && (
                    <p className="text-xs text-slate-500 mt-1">
                      Customer: {cb.customer_name}
                    </p>
                  )}

                  {/* Past due warning */}
                  {(cb.status === 'received' || cb.status === 'under_review') &&
                    cb.business_date &&
                    isPastDue(cb.business_date) && (
                      <div className="mt-2 flex items-center gap-1.5">
                        <AlertCircle size={12} className="text-red-400" />
                        <span className="text-xs font-medium text-red-400">
                          Response may be overdue
                        </span>
                      </div>
                    )}
                </div>
              ))}

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
