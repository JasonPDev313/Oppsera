'use client';

import { useTenants } from '@/hooks/use-tenants';

interface Props {
  value: string;
  onChange: (tenantId: string) => void;
}

export function TenantSelector({ value, onChange }: Props) {
  const { tenants, isLoading } = useTenants();

  return (
    <div className="flex items-center gap-2">
      <label className="text-xs text-slate-400 whitespace-nowrap">Tenant</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={isLoading}
        className="bg-slate-800 border border-slate-700 text-white text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
      >
        <option value="">All tenants</option>
        {tenants.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
    </div>
  );
}
