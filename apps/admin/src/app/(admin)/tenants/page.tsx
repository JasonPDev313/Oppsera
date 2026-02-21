'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Search, Plus } from 'lucide-react';
import { useTenantList } from '@/hooks/use-tenant-management';
import { TenantStatusBadge } from '@/components/tenants/TenantStatusBadge';
import { CreateTenantModal } from '@/components/tenants/CreateTenantModal';
import type { CreateTenantInput } from '@/types/tenant';

const STATUS_TABS = ['', 'active', 'trial', 'suspended'] as const;
const STATUS_LABELS: Record<string, string> = { '': 'All', active: 'Active', trial: 'Trial', suspended: 'Suspended' };

export default function TenantsPage() {
  const { tenants, isLoading, error, hasMore, load, loadMore, create } = useTenantList();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  const doLoad = useCallback(() => {
    const params: Record<string, string> = {};
    if (search) params.search = search;
    if (status) params.status = status;
    load(params);
  }, [load, search, status]);

  useEffect(() => {
    doLoad();
  }, [doLoad]);

  const handleCreate = async (input: CreateTenantInput) => {
    const result = await create(input);
    setShowCreate(false);
    doLoad();
    return result;
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Tenants</h1>
          <p className="text-sm text-slate-400 mt-1">Manage customer organizations</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          <Plus size={16} />
          New Tenant
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 mb-5">
        <div className="relative flex-1 max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Search name or slug..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
        </div>
        <div className="flex gap-1">
          {STATUS_TABS.map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-colors ${
                status === s
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              {STATUS_LABELS[s]}
            </button>
          ))}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-red-400 text-sm mb-4">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
        <table className="w-full text-sm text-left">
          <thead>
            <tr className="border-b border-slate-700">
              <th className="px-4 py-3 text-slate-400 font-medium">Name</th>
              <th className="px-4 py-3 text-slate-400 font-medium">Slug</th>
              <th className="px-4 py-3 text-slate-400 font-medium">Status</th>
              <th className="px-4 py-3 text-slate-400 font-medium text-right">Sites</th>
              <th className="px-4 py-3 text-slate-400 font-medium text-right">Venues</th>
              <th className="px-4 py-3 text-slate-400 font-medium text-right">PCs</th>
              <th className="px-4 py-3 text-slate-400 font-medium text-right">Terminals</th>
              <th className="px-4 py-3 text-slate-400 font-medium text-right">Users</th>
              <th className="px-4 py-3 text-slate-400 font-medium">Created</th>
            </tr>
          </thead>
          <tbody>
            {tenants.map((t) => (
              <tr key={t.id} className="border-b border-slate-700/50 hover:bg-slate-700/30 transition-colors">
                <td className="px-4 py-3">
                  <Link href={`/tenants/${t.id}`} className="text-white font-medium hover:text-indigo-400 transition-colors">
                    {t.name}
                  </Link>
                </td>
                <td className="px-4 py-3 text-slate-400 font-mono text-xs">{t.slug}</td>
                <td className="px-4 py-3"><TenantStatusBadge status={t.status} /></td>
                <td className="px-4 py-3 text-slate-300 text-right tabular-nums">{t.siteCount}</td>
                <td className="px-4 py-3 text-slate-300 text-right tabular-nums">{t.venueCount}</td>
                <td className="px-4 py-3 text-slate-300 text-right tabular-nums">{t.profitCenterCount}</td>
                <td className="px-4 py-3 text-slate-300 text-right tabular-nums">{t.terminalCount}</td>
                <td className="px-4 py-3 text-slate-300 text-right tabular-nums">{t.userCount}</td>
                <td className="px-4 py-3 text-slate-400 text-xs">{new Date(t.createdAt).toLocaleDateString()}</td>
              </tr>
            ))}
            {tenants.length === 0 && !isLoading && (
              <tr>
                <td colSpan={9} className="px-4 py-12 text-center text-slate-500">
                  No tenants found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Loading / Load More */}
      {isLoading && (
        <p className="text-center text-slate-500 text-sm py-4">Loading...</p>
      )}
      {hasMore && !isLoading && (
        <div className="flex justify-center mt-4">
          <button
            onClick={() => {
              const params: Record<string, string> = {};
              if (search) params.search = search;
              if (status) params.status = status;
              loadMore(params);
            }}
            className="text-sm text-indigo-400 hover:text-indigo-300 transition-colors"
          >
            Load more
          </button>
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <CreateTenantModal
          onClose={() => setShowCreate(false)}
          onCreate={handleCreate}
        />
      )}
    </div>
  );
}
