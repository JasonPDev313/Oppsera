'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { RefreshCw, Filter, Plus, UserPlus, Shield, Clock } from 'lucide-react';
import { useStaffList } from '@/hooks/use-staff';
import type { StaffListItem, StaffStatus } from '@/types/users';

const STATUS_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'invited', label: 'Invited' },
  { value: 'suspended', label: 'Suspended' },
];

function StatusBadge({ status }: { status: StaffStatus }) {
  const config: Record<StaffStatus, { color: string; label: string }> = {
    active: { color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30', label: 'Active' },
    invited: { color: 'bg-blue-500/10 text-blue-400 border-blue-500/30', label: 'Invited' },
    suspended: { color: 'bg-amber-500/10 text-amber-400 border-amber-500/30', label: 'Suspended' },
    deleted: { color: 'bg-red-500/10 text-red-400 border-red-500/30', label: 'Deleted' },
  };
  const { color, label } = config[status] ?? config.active;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border ${color}`}>
      {label}
    </span>
  );
}

export default function StaffListPage() {
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [allStaff, setAllStaff] = useState<StaffListItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  const { data, isLoading, error, load } = useStaffList();

  const fetchPage = useCallback(
    async (nextCursor?: string) => {
      const params: Record<string, string> = {};
      if (status) params.status = status;
      if (search) params.search = search;
      if (nextCursor) params.cursor = nextCursor;
      await load(params);
    },
    [load, status, search],
  );

  useEffect(() => {
    setAllStaff([]);
    setCursor(null);
    fetchPage();
  }, [status, search, fetchPage]);

  useEffect(() => {
    if (!data) return;
    setAllStaff((prev) => {
      const existingIds = new Set(prev.map((s) => s.id));
      const newOnes = data.items.filter((s) => !existingIds.has(s.id));
      return [...prev, ...newOnes];
    });
    setCursor(data.cursor);
    setHasMore(data.hasMore);
  }, [data]);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">Staff</h1>
          <p className="text-sm text-slate-400 mt-0.5">Manage OppsEra team members and access</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => { setAllStaff([]); setCursor(null); fetchPage(); }}
            disabled={isLoading}
            className="flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors"
          >
            <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
            Refresh
          </button>
          <Link
            href="/users/staff/new"
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
          >
            <Plus size={14} />
            Add Staff
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-6 p-4 bg-slate-800/50 rounded-xl border border-slate-700">
        <Filter size={14} className="text-slate-400" />

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
          placeholder="Search name or email…"
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
              <th className="text-left px-4 py-3 text-slate-400 font-medium">Role(s)</th>
              <th className="text-left px-4 py-3 text-slate-400 font-medium">Status</th>
              <th className="text-left px-4 py-3 text-slate-400 font-medium">Last Login</th>
            </tr>
          </thead>
          <tbody>
            {allStaff.map((staff) => (
              <tr key={staff.id} className="border-b border-slate-700/50 hover:bg-slate-800/50 transition-colors">
                <td className="px-4 py-3">
                  <Link href={`/users/staff/${staff.id}`} className="text-white hover:text-indigo-400 font-medium">
                    {staff.name}
                  </Link>
                </td>
                <td className="px-4 py-3 text-slate-300">{staff.email}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {staff.roles.length > 0 ? (
                      staff.roles.map((r) => (
                        <span key={r.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-700 text-slate-300 text-xs">
                          <Shield size={10} />
                          {r.name}
                        </span>
                      ))
                    ) : (
                      <span className="text-slate-500 text-xs italic">No roles</span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={staff.status} />
                </td>
                <td className="px-4 py-3 text-slate-400 text-xs">
                  {staff.lastLoginAt ? (
                    <span className="flex items-center gap-1">
                      <Clock size={10} />
                      {new Date(staff.lastLoginAt).toLocaleDateString()}
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

        {!isLoading && allStaff.length === 0 && (
          <div className="text-center py-16 text-slate-500">
            <UserPlus size={32} className="mx-auto mb-3 opacity-50" />
            <p>No staff members found.</p>
            <p className="text-xs mt-1">Click &quot;Add Staff&quot; to invite your first team member.</p>
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
