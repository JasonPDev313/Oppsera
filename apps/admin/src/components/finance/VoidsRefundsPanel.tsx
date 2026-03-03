'use client';

import { useState, useEffect } from 'react';
import { Ban, RotateCcw, ArrowRight } from 'lucide-react';
import {
  useVoids,
  useRefunds,
  type VoidFilters,
  type RefundFilters,
} from '@/hooks/use-finance';
import { useTenants } from '@/hooks/use-tenants';
import { formatCents, formatDateTime } from '@/lib/finance-helpers';
import { Pagination } from './Pagination';

type SubTab = 'voids' | 'refunds' | 'all';

interface VoidsRefundsPanelProps {
  onViewOrder: (orderId: string) => void;
}

export function VoidsRefundsPanel({ onViewOrder }: VoidsRefundsPanelProps) {
  const { tenants } = useTenants();
  const voids = useVoids();
  const refunds = useRefunds();

  const [subTab, setSubTab] = useState<SubTab>('voids');
  const [tenantId, setTenantId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [amountMin, setAmountMin] = useState('');
  const [voidPage, setVoidPage] = useState(1);
  const [refundPage, setRefundPage] = useState(1);

  const baseVoidFilters: VoidFilters = {
    tenantId: tenantId || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    amountMin: amountMin ? Number(amountMin) : undefined,
  };

  const baseRefundFilters: RefundFilters = {
    tenantId: tenantId || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    amountMin: amountMin ? Number(amountMin) : undefined,
  };

  useEffect(() => {
    voids.load({ ...baseVoidFilters, page: 1 });
    refunds.load({ ...baseRefundFilters, page: 1 });
  }, []);

  const handleSearch = () => {
    setVoidPage(1);
    setRefundPage(1);
    voids.load({ ...baseVoidFilters, page: 1 });
    refunds.load({ ...baseRefundFilters, page: 1 });
  };

  const handleVoidPage = (p: number) => {
    setVoidPage(p);
    voids.load({ ...baseVoidFilters, page: p });
  };

  const handleRefundPage = (p: number) => {
    setRefundPage(p);
    refunds.load({ ...baseRefundFilters, page: p });
  };

  const voidTotalPages = voids.data ? Math.ceil(voids.data.total / voids.data.limit) : 0;
  const refundTotalPages = refunds.data ? Math.ceil(refunds.data.total / refunds.data.limit) : 0;

  const SUB_TABS: { key: SubTab; label: string; count?: number }[] = [
    {
      key: 'voids',
      label: 'Voids',
      count: voids.data?.total,
    },
    {
      key: 'refunds',
      label: 'Refunds',
      count: refunds.data?.total,
    },
    {
      key: 'all',
      label: 'All',
    },
  ];

  return (
    <div className="space-y-4">
      {/* Sub tabs */}
      <div className="flex items-center gap-1">
        {SUB_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setSubTab(tab.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              subTab === tab.key
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span className="ml-1.5 text-xs opacity-70">({tab.count})</span>
            )}
          </button>
        ))}
      </div>

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

      {/* Error states */}
      {voids.error && (subTab === 'voids' || subTab === 'all') && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3">
          <p className="text-sm text-red-400">{voids.error}</p>
        </div>
      )}
      {refunds.error && (subTab === 'refunds' || subTab === 'all') && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3">
          <p className="text-sm text-red-400">{refunds.error}</p>
        </div>
      )}

      {/* Voids list */}
      {(subTab === 'voids' || subTab === 'all') && (
        <div>
          {subTab === 'all' && (
            <h3 className="text-sm font-medium text-white mb-2 flex items-center gap-2">
              <Ban size={14} className="text-red-400" /> Voids
            </h3>
          )}

          {voids.isLoading && !voids.data && (
            <div className="text-slate-500 text-sm text-center py-12">Loading voids...</div>
          )}

          {voids.data && voids.data.items.length === 0 && (
            <div className="text-slate-500 text-sm text-center py-12">No voided orders found.</div>
          )}

          {voids.data && voids.data.items.length > 0 && (
            <div className="space-y-2">
              {voids.data.items.map((item) => (
                <div
                  key={item.id}
                  className="bg-slate-800 rounded-xl border border-slate-700 p-4 hover:border-slate-600 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium border bg-red-500/10 text-red-400 border-red-500/30">
                        VOID
                      </span>
                      <span className="text-white font-mono text-xs">{item.order_number}</span>
                      <span className="text-white text-sm font-medium">
                        {formatCents(item.total)}
                      </span>
                    </div>
                    <button
                      onClick={() => onViewOrder(item.id)}
                      className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
                    >
                      View Order <ArrowRight size={12} />
                    </button>
                  </div>
                  <div className="flex items-center gap-4 mt-2 text-xs text-slate-400">
                    <span>{item.tenant_name}</span>
                    <span>{item.location_name}</span>
                    <span>
                      Voided by {item.voided_by_name ?? 'Unknown'} on{' '}
                      {formatDateTime(item.voided_at)}
                    </span>
                  </div>
                  {item.void_reason && (
                    <p className="text-xs text-red-400/80 mt-1.5">
                      Reason: {item.void_reason}
                    </p>
                  )}
                </div>
              ))}

              <Pagination
                page={voidPage}
                totalPages={voidTotalPages}
                onPageChange={handleVoidPage}
              />
            </div>
          )}
        </div>
      )}

      {/* Refunds list */}
      {(subTab === 'refunds' || subTab === 'all') && (
        <div>
          {subTab === 'all' && (
            <h3 className="text-sm font-medium text-white mb-2 mt-4 flex items-center gap-2">
              <RotateCcw size={14} className="text-orange-400" /> Refunds
            </h3>
          )}

          {refunds.isLoading && !refunds.data && (
            <div className="text-slate-500 text-sm text-center py-12">Loading refunds...</div>
          )}

          {refunds.data && refunds.data.items.length === 0 && (
            <div className="text-slate-500 text-sm text-center py-12">No refunds found.</div>
          )}

          {refunds.data && refunds.data.items.length > 0 && (
            <div className="space-y-2">
              {refunds.data.items.map((item) => (
                <div
                  key={item.id}
                  className="bg-slate-800 rounded-xl border border-slate-700 p-4 hover:border-slate-600 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium border bg-orange-500/10 text-orange-400 border-orange-500/30">
                        REFUND
                      </span>
                      <span className="text-white font-mono text-xs">{item.order_number}</span>
                      <span className="text-white text-sm font-medium">
                        {formatCents(item.amount)}
                      </span>
                      <span className="text-xs text-slate-500">
                        of {formatCents(item.order_total)} original
                      </span>
                    </div>
                    <button
                      onClick={() => onViewOrder(item.order_id)}
                      className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
                    >
                      View Order <ArrowRight size={12} />
                    </button>
                  </div>
                  <div className="flex items-center gap-4 mt-2 text-xs text-slate-400">
                    <span>{item.tenant_name}</span>
                    <span>{item.location_name}</span>
                    {item.created_by_name && <span>By {item.created_by_name}</span>}
                    <span>{formatDateTime(item.created_at)}</span>
                    {item.card_brand && (
                      <span>
                        {item.card_brand} ****{item.card_last4}
                      </span>
                    )}
                  </div>
                  {item.reason && (
                    <p className="text-xs text-orange-400/80 mt-1.5">
                      Reason: {item.reason}
                    </p>
                  )}
                </div>
              ))}

              <Pagination
                page={refundPage}
                totalPages={refundTotalPages}
                onPageChange={handleRefundPage}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
