'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { Search, Plus, Check, X, FileEdit, Eye, ChevronDown } from 'lucide-react';
import { useBusinessTypeList, useCategories } from '@/hooks/use-business-types';

export default function BusinessTypesPage() {
  const { items, isLoading, error, hasMore, load, loadMore } = useBusinessTypeList();
  const { categories, load: loadCategories } = useCategories();

  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [systemFilter, setSystemFilter] = useState('');
  const [signupFilter, setSignupFilter] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const buildParams = useCallback(() => {
    const params: Record<string, string> = {};
    if (search) params.search = search;
    if (categoryId) params.categoryId = categoryId;
    if (statusFilter === 'active') params.isActive = 'true';
    if (statusFilter === 'inactive') params.isActive = 'false';
    if (systemFilter === 'system') params.isSystem = 'true';
    if (systemFilter === 'custom') params.isSystem = 'false';
    if (signupFilter === 'visible') params.showAtSignup = 'true';
    if (signupFilter === 'hidden') params.showAtSignup = 'false';
    return params;
  }, [search, categoryId, statusFilter, systemFilter, signupFilter]);

  const doLoad = useCallback(() => {
    load(buildParams());
  }, [load, buildParams]);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  // Debounce search, immediate load for filter changes
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      doLoad();
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [doLoad]);

  const handleLoadMore = () => {
    loadMore(buildParams());
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Business Types</h1>
          <p className="text-sm text-slate-400 mt-1">
            Manage business type blueprints for tenant provisioning
          </p>
        </div>
        <Link
          href="/business-types/new"
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          <Plus size={16} />
          New Business Type
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Search name or slug..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
        </div>

        <FilterDropdown
          value={categoryId}
          onChange={setCategoryId}
          options={[
            { value: '', label: 'All Categories' },
            ...categories.map((c) => ({ value: c.id, label: c.name })),
          ]}
        />

        <FilterDropdown
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { value: '', label: 'All Status' },
            { value: 'active', label: 'Active' },
            { value: 'inactive', label: 'Inactive' },
          ]}
        />

        <FilterDropdown
          value={systemFilter}
          onChange={setSystemFilter}
          options={[
            { value: '', label: 'All Origins' },
            { value: 'system', label: 'System' },
            { value: 'custom', label: 'Custom' },
          ]}
        />

        <FilterDropdown
          value={signupFilter}
          onChange={setSignupFilter}
          options={[
            { value: '', label: 'All Signup' },
            { value: 'visible', label: 'Signup Visible' },
            { value: 'hidden', label: 'Signup Hidden' },
          ]}
        />
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-red-400 text-sm mb-4">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="border-b border-slate-700">
                <th className="px-4 py-3 text-slate-400 font-medium">Name</th>
                <th className="px-4 py-3 text-slate-400 font-medium">Category</th>
                <th className="px-4 py-3 text-slate-400 font-medium">Status</th>
                <th className="px-4 py-3 text-slate-400 font-medium">Signup</th>
                <th className="px-4 py-3 text-slate-400 font-medium">Origin</th>
                <th className="px-4 py-3 text-slate-400 font-medium text-center">Published</th>
                <th className="px-4 py-3 text-slate-400 font-medium text-center">Draft</th>
                <th className="px-4 py-3 text-slate-400 font-medium text-right">Modules</th>
                <th className="px-4 py-3 text-slate-400 font-medium text-right">Roles</th>
                <th className="px-4 py-3 text-slate-400 font-medium text-center">Accounting</th>
                <th className="px-4 py-3 text-slate-400 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {items.map((bt) => (
                <tr key={bt.id} className="hover:bg-slate-700/30 transition-colors">
                  <td className="px-4 py-3">
                    <Link
                      href={`/business-types/${bt.id}`}
                      className="text-white font-medium hover:text-indigo-400 transition-colors"
                    >
                      {bt.name}
                    </Link>
                    <p className="text-xs text-slate-500 mt-0.5">{bt.slug}</p>
                  </td>
                  <td className="px-4 py-3">
                    {bt.categoryName ? (
                      <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-slate-700 text-slate-300">
                        {bt.categoryName}
                      </span>
                    ) : (
                      <span className="text-slate-600">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <StatusPill active={bt.isActive} />
                  </td>
                  <td className="px-4 py-3">
                    <SignupPill visible={bt.showAtSignup} />
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                        bt.isSystem
                          ? 'bg-violet-500/20 text-violet-400'
                          : 'bg-slate-700 text-slate-300'
                      }`}
                    >
                      {bt.isSystem ? 'System' : 'Custom'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {bt.publishedVersionNumber ? (
                      <span className="text-sm text-white font-mono">v{bt.publishedVersionNumber}</span>
                    ) : (
                      <span className="text-slate-600">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {bt.hasDraft ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-amber-500/20 text-amber-400">
                        <FileEdit size={12} />
                        Draft
                      </span>
                    ) : (
                      <span className="text-slate-600">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-300">
                    {bt.moduleCount}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-300">
                    {bt.roleCount}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {bt.accountingConfigured ? (
                      <Check size={16} className="inline text-emerald-400" />
                    ) : (
                      <X size={16} className="inline text-slate-600" />
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/business-types/${bt.id}`}
                      className="inline-flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
                    >
                      <Eye size={14} />
                      View
                    </Link>
                  </td>
                </tr>
              ))}

              {!isLoading && items.length === 0 && (
                <tr>
                  <td colSpan={11} className="px-4 py-12 text-center text-slate-500">
                    No business types found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="px-4 py-6 text-center text-slate-400 text-sm">Loading...</div>
        )}

        {/* Load More */}
        {hasMore && !isLoading && (
          <div className="px-4 py-3 border-t border-slate-700 text-center">
            <button
              onClick={handleLoadMore}
              className="text-sm text-indigo-400 hover:text-indigo-300 font-medium transition-colors"
            >
              Load more
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function StatusPill({ active }: { active: boolean }) {
  return (
    <span
      className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
        active
          ? 'bg-emerald-500/20 text-emerald-400'
          : 'bg-slate-700 text-slate-400'
      }`}
    >
      {active ? 'Active' : 'Inactive'}
    </span>
  );
}

function SignupPill({ visible }: { visible: boolean }) {
  return (
    <span
      className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
        visible
          ? 'bg-sky-500/20 text-sky-400'
          : 'bg-slate-700 text-slate-500'
      }`}
    >
      {visible ? 'Visible' : 'Hidden'}
    </span>
  );
}

function FilterDropdown({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none bg-slate-800 border border-slate-700 rounded-lg pl-3 pr-8 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown
        size={14}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none"
      />
    </div>
  );
}
