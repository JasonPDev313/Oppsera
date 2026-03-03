'use client';

import { useState, useEffect } from 'react';
import { AlertTriangle, Clock, XCircle } from 'lucide-react';
import { useGLIssues, type GLIssueFilters } from '@/hooks/use-finance';
import { useTenants } from '@/hooks/use-tenants';
import { formatDate, formatDateTime } from '@/lib/finance-helpers';
import { StatusBadge } from './StatusBadge';

type IssueType = 'all' | 'unmapped' | 'unposted' | 'failed';

export function GLIssuesPanel() {
  const { tenants } = useTenants();
  const { data, isLoading, error, load } = useGLIssues();

  const [issueType, setIssueType] = useState<IssueType>('all');
  const [tenantId, setTenantId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const buildFilters = (): GLIssueFilters => ({
    tenantId: tenantId || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  });

  useEffect(() => {
    load(buildFilters());
  }, []);

  const handleSearch = () => {
    load(buildFilters());
  };

  return (
    <div className="space-y-4">
      {/* Stat cards */}
      {data && (
        <div className="grid grid-cols-3 gap-4">
          <button
            onClick={() => setIssueType(issueType === 'unmapped' ? 'all' : 'unmapped')}
            className={`rounded-xl border p-4 text-left transition-colors ${
              issueType === 'unmapped'
                ? 'bg-amber-500/10 border-amber-500/30'
                : 'bg-slate-800 border-slate-700 hover:border-slate-600'
            }`}
          >
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle size={14} className="text-amber-400" />
              <p className="text-xs font-medium text-slate-400">Unmapped Events</p>
            </div>
            <p className="text-2xl font-bold text-amber-400">{data.stats.unmappedCount}</p>
          </button>

          <button
            onClick={() => setIssueType(issueType === 'unposted' ? 'all' : 'unposted')}
            className={`rounded-xl border p-4 text-left transition-colors ${
              issueType === 'unposted'
                ? 'bg-blue-500/10 border-blue-500/30'
                : 'bg-slate-800 border-slate-700 hover:border-slate-600'
            }`}
          >
            <div className="flex items-center gap-2 mb-1">
              <Clock size={14} className="text-blue-400" />
              <p className="text-xs font-medium text-slate-400">Unposted Entries</p>
            </div>
            <p className="text-2xl font-bold text-blue-400">{data.stats.unpostedCount}</p>
          </button>

          <button
            onClick={() => setIssueType(issueType === 'failed' ? 'all' : 'failed')}
            className={`rounded-xl border p-4 text-left transition-colors ${
              issueType === 'failed'
                ? 'bg-red-500/10 border-red-500/30'
                : 'bg-slate-800 border-slate-700 hover:border-slate-600'
            }`}
          >
            <div className="flex items-center gap-2 mb-1">
              <XCircle size={14} className="text-red-400" />
              <p className="text-xs font-medium text-slate-400">Failed Postings</p>
            </div>
            <p className="text-2xl font-bold text-red-400">{data.stats.failedCount}</p>
          </button>
        </div>
      )}

      {/* Filters */}
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
        <div className="text-slate-500 text-sm text-center py-12">Loading GL issues...</div>
      )}

      {data && (
        <>
          {/* Unmapped Events */}
          {(issueType === 'all' || issueType === 'unmapped') && (
            <div>
              <h3 className="text-sm font-medium text-white mb-2 flex items-center gap-2">
                <AlertTriangle size={14} className="text-amber-400" />
                Unmapped Events ({data.unmappedEvents.length})
              </h3>
              {data.unmappedEvents.length === 0 ? (
                <div className="text-slate-500 text-sm text-center py-8">
                  No unmapped events.
                </div>
              ) : (
                <div className="space-y-2">
                  {data.unmappedEvents.map((item) => (
                    <div
                      key={String(item.id)}
                      className="bg-slate-800 rounded-xl border border-slate-700 p-4"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <AlertTriangle size={14} className="text-amber-400 flex-shrink-0" />
                          <span className="text-white text-xs font-medium">
                            {String(item.tenant_name ?? '')}
                          </span>
                          <span className="text-slate-400 text-xs font-mono">
                            {String(item.event_type ?? '')}
                          </span>
                        </div>
                        <span className="text-xs text-slate-500">
                          {formatDateTime(item.created_at as string | null)}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 mt-2 text-xs text-slate-500">
                        {item.entity_type != null && (
                          <span>
                            Entity: {String(item.entity_type)} / {String(item.entity_id ?? '')}
                          </span>
                        )}
                        {item.source_module != null && (
                          <span>Module: {String(item.source_module)}</span>
                        )}
                      </div>
                      {item.reason != null && (
                        <p className="text-xs text-amber-400/80 mt-1.5">
                          Reason: {String(item.reason)}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Unposted Entries */}
          {(issueType === 'all' || issueType === 'unposted') && (
            <div>
              <h3 className="text-sm font-medium text-white mb-2 flex items-center gap-2">
                <Clock size={14} className="text-blue-400" />
                Unposted Entries ({data.unpostedEntries.length})
              </h3>
              {data.unpostedEntries.length === 0 ? (
                <div className="text-slate-500 text-sm text-center py-8">
                  No unposted journal entries.
                </div>
              ) : (
                <div className="space-y-2">
                  {data.unpostedEntries.map((item) => (
                    <div
                      key={String(item.id)}
                      className="bg-slate-800 rounded-xl border border-slate-700 p-4"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Clock size={14} className="text-blue-400 flex-shrink-0" />
                          <span className="text-white text-xs font-medium">
                            {String(item.tenant_name ?? '')}
                          </span>
                          <span className="text-white text-xs font-mono">
                            {String(item.journal_number ?? '')}
                          </span>
                          <StatusBadge status="draft" />
                        </div>
                        <span className="text-xs text-slate-500">
                          {formatDate(item.business_date as string | null)}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 mt-2 text-xs text-slate-500">
                        {item.source_module != null && (
                          <span>Module: {String(item.source_module)}</span>
                        )}
                        {item.posting_period != null && (
                          <span>Period: {String(item.posting_period)}</span>
                        )}
                        <span>
                          Created {formatDateTime(item.created_at as string | null)}
                        </span>
                      </div>
                      {item.memo != null && (
                        <p className="text-xs text-slate-400 mt-1.5">{String(item.memo)}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Failed Postings */}
          {(issueType === 'all' || issueType === 'failed') && (
            <div>
              <h3 className="text-sm font-medium text-white mb-2 flex items-center gap-2">
                <XCircle size={14} className="text-red-400" />
                Failed Postings ({data.failedPostings.length})
              </h3>
              {data.failedPostings.length === 0 ? (
                <div className="text-slate-500 text-sm text-center py-8">
                  No failed postings.
                </div>
              ) : (
                <div className="space-y-2">
                  {data.failedPostings.map((item) => (
                    <div
                      key={String(item.id)}
                      className="bg-slate-800 rounded-xl border border-slate-700 p-4"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <XCircle size={14} className="text-red-400 flex-shrink-0" />
                          <span className="text-white text-xs font-medium">
                            {String(item.tenant_name ?? '')}
                          </span>
                          <span className="text-white text-xs font-mono">
                            {String(item.journal_number ?? '')}
                          </span>
                          <StatusBadge status="voided" />
                        </div>
                        <span className="text-xs text-slate-500">
                          {formatDateTime(item.voided_at as string | null)}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 mt-2 text-xs text-slate-500">
                        {item.source_module != null && (
                          <span>Module: {String(item.source_module)}</span>
                        )}
                        {item.business_date != null && (
                          <span>
                            Biz date: {formatDate(item.business_date as string | null)}
                          </span>
                        )}
                      </div>
                      {item.void_reason != null && (
                        <p className="text-xs text-red-400/80 mt-1.5">
                          Reason: {String(item.void_reason)}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
