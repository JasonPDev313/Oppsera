'use client';

import { useEffect } from 'react';
import { useTenantEntitlements } from '@/hooks/use-tenant-management';

const PLAN_TIERS = ['standard', 'professional', 'enterprise'] as const;

export function EntitlementToggleList({ tenantId }: { tenantId: string }) {
  const { entitlements, isLoading, error, load, toggle } = useTenantEntitlements(tenantId);

  useEffect(() => {
    load();
  }, [load]);

  if (isLoading && entitlements.length === 0) {
    return <p className="text-slate-500 text-sm py-8 text-center">Loading entitlements...</p>;
  }
  if (error) {
    return <p className="text-red-400 text-sm py-4">{error}</p>;
  }

  return (
    <div className="space-y-2">
      {entitlements.map((ent) => (
        <div
          key={ent.moduleKey}
          className={`flex items-center gap-4 px-4 py-3 rounded-lg border transition-colors ${
            ent.isEnabled
              ? 'bg-slate-800 border-slate-700'
              : 'bg-slate-800/50 border-slate-700/50'
          }`}
        >
          {/* Toggle */}
          <button
            onClick={() => toggle(ent.moduleKey, !ent.isEnabled, ent.planTier)}
            className={`relative w-10 h-5 rounded-full transition-colors ${
              ent.isEnabled ? 'bg-indigo-600' : 'bg-slate-600'
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
                ent.isEnabled ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <p className={`text-sm font-medium ${ent.isEnabled ? 'text-white' : 'text-slate-500'}`}>
              {ent.moduleName}
            </p>
            <p className="text-xs text-slate-500 truncate">{ent.moduleDescription}</p>
          </div>

          {/* Plan Tier */}
          <select
            value={ent.planTier}
            onChange={(e) => toggle(ent.moduleKey, ent.isEnabled, e.target.value)}
            disabled={!ent.isEnabled}
            className="bg-slate-900 border border-slate-600 rounded text-xs text-slate-300 px-2 py-1 disabled:opacity-40 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            {PLAN_TIERS.map((tier) => (
              <option key={tier} value={tier} className="capitalize">
                {tier}
              </option>
            ))}
          </select>

          {/* Module Key */}
          <span className="text-xs font-mono text-slate-600 hidden lg:block w-28 text-right">
            {ent.moduleKey}
          </span>
        </div>
      ))}
    </div>
  );
}
