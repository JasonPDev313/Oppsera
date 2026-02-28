'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Grid3X3, Search, Filter } from 'lucide-react';
import { useCapabilityMatrix } from '@/hooks/use-feature-flags';

const MODULE_KEYS = ['pos', 'catalog', 'crm', 'tee_sheet', 'fnb', 'inventory', 'accounting', 'reporting', 'membership', 'pms', 'events'];
const MODULE_INFO: Record<string, { label: string; description: string }> = {
  pos: { label: 'Retail POS', description: 'Point of sale for retail operations — orders, tenders, receipts, shifts' },
  catalog: { label: 'Product Catalog', description: 'Items, categories, modifiers, pricing, tax rules, barcode management' },
  crm: { label: 'Customer Management', description: 'CRM, billing accounts, memberships, loyalty, house accounts' },
  tee_sheet: { label: 'Tee Sheet', description: 'Golf tee-time reservations, bookings, player management' },
  fnb: { label: 'Food & Beverage POS', description: 'Restaurant POS — tabs, checks, courses, kitchen display, tips' },
  inventory: { label: 'Inventory', description: 'Stock tracking, receiving, vendors, purchase orders, movements' },
  accounting: { label: 'Accounting', description: 'General ledger, chart of accounts, journal entries, financial statements' },
  reporting: { label: 'Reports & Dashboards', description: 'Sales reports, custom report builder, dashboards, CSV export' },
  membership: { label: 'Memberships', description: 'Membership plans, billing cycles, privileges, member portal access' },
  pms: { label: 'Property Management', description: 'Reservations, room management, folios, housekeeping, channels' },
  events: { label: 'Events & Banquets', description: 'Event bookings, banquet management, group reservations' },
};

const MODE_STYLES: Record<string, { label: string; bg: string; text: string }> = {
  full: { label: '\u25CF', bg: 'bg-emerald-500/20', text: 'text-emerald-400' },
  view: { label: '\uD83D\uDC41', bg: 'bg-blue-500/20', text: 'text-blue-400' },
  off: { label: '\u25CC', bg: 'bg-slate-700/50', text: 'text-slate-500' },
};

export default function CapabilityMatrixPage() {
  const { rows, isLoading, error, load } = useCapabilityMatrix();
  const [search, setSearch] = useState('');
  const [industry, setIndustry] = useState('');
  const [status, setStatus] = useState('');

  useEffect(() => {
    load({ search: search || undefined, industry: industry || undefined, status: status || undefined });
  }, [load, search, industry, status]);

  return (
    <div className="p-6 max-w-[1600px]">
      <div className="flex items-center gap-3 mb-6">
        <Grid3X3 size={20} className="text-indigo-400" />
        <div>
          <h1 className="text-2xl font-bold text-white">Module Capability Matrix</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            Cross-tenant view of enabled modules. Click a cell to navigate to tenant detail.
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tenant..."
            className="w-full pl-9 pr-3 py-2 bg-slate-800 text-slate-200 rounded-lg text-sm border border-slate-700 placeholder:text-slate-500"
          />
        </div>
        <Filter size={14} className="text-slate-400" />
        <select
          value={industry}
          onChange={(e) => setIndustry(e.target.value)}
          className="bg-slate-800 text-slate-200 rounded-lg px-3 py-2 text-sm border border-slate-700"
        >
          <option value="">All Industries</option>
          <option value="golf">Golf</option>
          <option value="restaurant">Restaurant</option>
          <option value="hotel">Hotel</option>
          <option value="retail">Retail</option>
        </select>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="bg-slate-800 text-slate-200 rounded-lg px-3 py-2 text-sm border border-slate-700"
        >
          <option value="">All Statuses</option>
          <option value="active">Active</option>
          <option value="trial">Trial</option>
          <option value="pending">Pending</option>
          <option value="suspended">Suspended</option>
        </select>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mb-4 text-xs text-slate-400">
        <span className="flex items-center gap-1"><span className="text-emerald-400">{'\u25CF'}</span> Full</span>
        <span className="flex items-center gap-1"><span className="text-blue-400">{'\uD83D\uDC41'}</span> View</span>
        <span className="flex items-center gap-1"><span className="text-slate-500">{'\u25CC'}</span> Off</span>
      </div>

      {/* Matrix */}
      {error ? (
        <div className="text-center py-12">
          <p className="text-red-400 font-medium mb-1">Failed to load matrix</p>
          <p className="text-sm text-slate-500">{error}</p>
        </div>
      ) : isLoading && rows.length === 0 ? (
        <div className="text-center py-12 text-slate-400">Loading matrix...</div>
      ) : rows.length === 0 ? (
        <div className="text-center py-12 text-slate-400">No tenants found</div>
      ) : (
        <div className="bg-slate-800 rounded-lg border border-slate-700 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700 bg-slate-800/50">
                <th className="text-left px-4 py-3 font-medium text-slate-400 sticky left-0 bg-slate-800/50 z-10 min-w-[180px]">Tenant</th>
                {MODULE_KEYS.map((key) => {
                  const info = MODULE_INFO[key];
                  return (
                    <th key={key} className="text-center px-3 py-3 font-medium text-slate-400 min-w-[90px]" title={info?.description}>
                      <span className="text-xs leading-tight">{info?.label ?? key}</span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {rows.map((row) => (
                <tr key={row.tenantId} className="hover:bg-slate-700/30 transition-colors">
                  <td className="px-4 py-2.5 sticky left-0 bg-slate-800 z-10">
                    <Link href={`/tenants/${row.tenantId}`} className="text-indigo-400 hover:text-indigo-300 font-medium text-sm">
                      {row.tenantName}
                    </Link>
                    {row.industry && (
                      <span className="ml-2 text-xs text-slate-500 capitalize">{row.industry}</span>
                    )}
                  </td>
                  {MODULE_KEYS.map((key) => {
                    const mode = row.modules[key] ?? 'off';
                    const style = (MODE_STYLES[mode] ?? MODE_STYLES.off)!;
                    return (
                      <td key={key} className="text-center px-2 py-2.5">
                        <Link
                          href={`/tenants/${row.tenantId}?tab=modules`}
                          className={`inline-flex items-center justify-center w-8 h-8 rounded-lg ${style.bg} ${style.text} hover:opacity-80 transition-opacity text-sm`}
                          title={`${row.tenantName}: ${MODULE_INFO[key]?.label ?? key} = ${mode}`}
                        >
                          {style.label}
                        </Link>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
