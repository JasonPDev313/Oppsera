'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { RefreshCw, Filter, Users, Clock, Building2 } from 'lucide-react';
import { useCustomerList } from '@/hooks/use-customers-admin';
import { useTenants } from '@/hooks/use-tenants';
import type { CustomerListItem } from '@/types/users';

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'active', label: 'Active' },
  { value: 'invited', label: 'Invited' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'locked', label: 'Locked' },
];

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { color: string; label: string }> = {
    active: { color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30', label: 'Active' },
    invited: { color: 'bg-blue-500/10 text-blue-400 border-blue-500/30', label: 'Invited' },
    inactive: { color: 'bg-slate-500/10 text-slate-400 border-slate-500/30', label: 'Inactive' },
    locked: { color: 'bg-red-500/10 text-red-400 border-red-500/30', label: 'Locked' },
  };
  const { color, label } = config[status] ?? { color: 'bg-slate-500/10 text-slate-400 border-slate-500/30', label: status };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border ${color}`}>
      {label}
    </span>
  );
}

export default function CustomerListPage() {
  const [tenantId, setTenantId] = useState('');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [allCustomers, setAllCustomers] = useState<CustomerListItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  const { tenants, isLoading: tenantsLoading } = useTenants();
  const { data, isLoading, error, load } = useCustomerList();

  const fetchPage = useCallback(
    async (nextCursor?: string) => {
      const params: Record<string, string> = {};
      if (tenantId) params.tenantId = tenantId;
      if (status) params.status = status;
      if (search) params.search = search;
      if (nextCursor) params.cursor = nextCursor;
      await load(params);
    },
    [load, tenantId, status, search],
  );

  useEffect(() => {
    setAllCustomers([]);
    setCursor(null);
    fetchPage();
  }, [tenantId, status, search, fetchPage]);

  useEffect(() => {
    if (!data) return;
    setAllCustomers((prev) => {
      const existingIds = new Set(prev.map((c) => c.id));
      const newOnes = data.items.filter((c) => !existingIds.has(c.id));
      return [...prev, ...newOnes];
    });
    setCursor(data.cursor);
    setHasMore(data.hasMore);
  }, [data]);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">Customers</h1>
          <p className="text-sm text-slate-400 mt-0.5">View and manage tenant users across all organizations</p>
        </div>
        <button
          onClick={() => { setAllCustomers([]); setCursor(null); fetchPage(); }}
          disabled={isLoading}
          className="flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors"
        >
          <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-6 p-4 bg-slate-800/50 rounded-xl border border-slate-700">
        <Filter size={14} className="text-slate-400" />

        <select
          value={tenantId}
          onChange={(e) => setTenantId(e.target.value)}
          disabled={tenantsLoading}
          className="bg-slate-800 border border-slate-700 text-white text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="">All Tenants</option>
          {tenants.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>

        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="bg-slate-800 border border-slate-700 text-white text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        <input
          type="search"
          placeholder="Search name, email, or username…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-40 bg-slate-800 border border-slate-700 text-white text-xs rounded-lg px-3 py-1.5 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 px-4 py-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="bg-slate-800/50 rounded-xl border border-slate-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-700">
              <th className="text-left px-4 py-3 text-slate-400 font-medium">Name</th>
              <th className="text-left px-4 py-3 text-slate-400 font-medium">Email</th>
              <th className="text-left px-4 py-3 text-slate-400 font-medium">Tenant</th>
              <th className="text-left px-4 py-3 text-slate-400 font-medium">Role</th>
              <th className="text-left px-4 py-3 text-slate-400 font-medium">Status</th>
              <th className="text-left px-4 py-3 text-slate-400 font-medium">Last Login</th>
            </tr>
          </thead>
          <tbody>
            {allCustomers.map((customer) => (
              <tr key={customer.id} className="border-b border-slate-700/50 hover:bg-slate-800/50 transition-colors">
                <td className="px-4 py-3">
                  <Link href={`/users/customers/${customer.id}`} className="text-white hover:text-indigo-400 font-medium">
                    {customer.displayName || customer.name}
                  </Link>
                  {customer.username && (
                    <p className="text-xs text-slate-500 mt-0.5">@{customer.username}</p>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-300 text-xs">{customer.email}</td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center gap-1 text-xs text-slate-300">
                    <Building2 size={10} className="text-slate-500" />
                    {customer.tenantName}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {customer.primaryRoleName ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded bg-slate-700 text-slate-300 text-xs">
                      {customer.primaryRoleName}
                    </span>
                  ) : (
                    <span className="text-slate-500 text-xs italic">None</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={customer.status} />
                </td>
                <td className="px-4 py-3 text-slate-400 text-xs">
                  {customer.lastLoginAt ? (
                    <span className="flex items-center gap-1">
                      <Clock size={10} />
                      {new Date(customer.lastLoginAt).toLocaleDateString()}
                    </span>
                  ) : (
                    <span className="text-slate-500 italic">Never</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {isLoading && (
          <div className="flex justify-center py-8">
            <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {!isLoading && allCustomers.length === 0 && (
          <div className="text-center py-16 text-slate-500">
            <Users size={32} className="mx-auto mb-3 opacity-50" />
            <p>No customers found.</p>
            <p className="text-xs mt-1">Try adjusting your filters or search query.</p>
          </div>
        )}
      </div>

      {/* Load More */}
      {hasMore && !isLoading && (
        <button
          onClick={() => fetchPage(cursor ?? undefined)}
          className="mt-4 w-full py-3 text-sm text-slate-400 hover:text-white border border-slate-700 rounded-xl hover:border-slate-600 transition-colors"
        >
          Load more
        </button>
      )}
    </div>
  );
}
