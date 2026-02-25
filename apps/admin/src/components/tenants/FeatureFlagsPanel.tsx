'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, Flag, ToggleLeft, ToggleRight } from 'lucide-react';
import { useFeatureFlags, type FeatureFlagItem } from '@/hooks/use-feature-flags';

const RISK_COLORS: Record<string, string> = {
  low: 'text-emerald-400',
  medium: 'text-amber-400',
  high: 'text-red-400',
};

const RISK_LABELS: Record<string, string> = {
  low: 'Low Risk',
  medium: 'Med Risk',
  high: 'High Risk',
};

export function FeatureFlagsPanel({ tenantId }: { tenantId: string }) {
  const { flags, isLoading, load, toggle } = useFeatureFlags(tenantId);
  const [confirmFlag, setConfirmFlag] = useState<FeatureFlagItem | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);

  useEffect(() => { load(); }, [load]);

  const handleToggle = async (flag: FeatureFlagItem) => {
    // High-risk flags need confirmation
    if (flag.riskLevel === 'high' && !flag.isEnabled) {
      setConfirmFlag(flag);
      return;
    }
    setToggling(flag.flagKey);
    try {
      await toggle(flag.flagKey, !flag.isEnabled);
    } finally {
      setToggling(null);
    }
  };

  const confirmHighRisk = async () => {
    if (!confirmFlag) return;
    setToggling(confirmFlag.flagKey);
    try {
      await toggle(confirmFlag.flagKey, true);
    } finally {
      setToggling(null);
      setConfirmFlag(null);
    }
  };

  if (isLoading && flags.length === 0) {
    return <div className="text-sm text-slate-500 py-4">Loading feature flags...</div>;
  }

  if (flags.length === 0) {
    return (
      <div className="text-center py-6">
        <Flag className="mx-auto h-6 w-6 text-slate-500 mb-2" />
        <p className="text-sm text-slate-400">No feature flags defined</p>
      </div>
    );
  }

  // Group flags by module
  const grouped: Record<string, FeatureFlagItem[]> = {};
  for (const flag of flags) {
    const key = flag.moduleKey ?? 'general';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(flag);
  }

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-medium text-slate-300 flex items-center gap-2">
        <Flag size={14} />
        Feature Flags
      </h3>

      <div className="space-y-2">
        {Object.entries(grouped).map(([module, moduleFlags]) => (
          <div key={module} className="bg-slate-800/50 rounded-lg border border-slate-700 overflow-hidden">
            <div className="px-3 py-2 bg-slate-800 border-b border-slate-700">
              <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">{module}</span>
            </div>
            <div className="divide-y divide-slate-700/50">
              {moduleFlags.map((flag) => (
                <div key={flag.flagKey} className="flex items-center gap-3 px-3 py-2.5">
                  <button
                    onClick={() => handleToggle(flag)}
                    disabled={toggling === flag.flagKey}
                    className={`shrink-0 transition-colors ${
                      flag.isEnabled ? 'text-emerald-400 hover:text-emerald-300' : 'text-slate-500 hover:text-slate-400'
                    }`}
                  >
                    {flag.isEnabled ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-200">{flag.displayName}</p>
                    {flag.description && (
                      <p className="text-xs text-slate-500 mt-0.5 truncate">{flag.description}</p>
                    )}
                  </div>
                  <span className={`text-xs font-medium ${RISK_COLORS[flag.riskLevel] ?? 'text-slate-400'}`}>
                    {RISK_LABELS[flag.riskLevel] ?? flag.riskLevel}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* High-risk confirmation dialog */}
      {confirmFlag && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-slate-800 rounded-xl shadow-xl p-6 w-full max-w-md border border-slate-700">
            <h3 className="text-lg font-semibold text-slate-100 mb-3 flex items-center gap-2">
              <AlertTriangle size={18} className="text-red-400" />
              Enable High-Risk Flag
            </h3>
            <p className="text-sm text-slate-400 mb-2">
              You are about to enable <strong className="text-slate-200">{confirmFlag.displayName}</strong>.
            </p>
            <p className="text-sm text-red-400 mb-4">
              This flag is marked as high-risk. Enabling it may have significant impact on the tenant.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmFlag(null)}
                className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200"
              >
                Cancel
              </button>
              <button
                onClick={confirmHighRisk}
                disabled={toggling === confirmFlag.flagKey}
                className="px-4 py-2 text-sm rounded-lg font-medium bg-red-600 text-white hover:bg-red-500 transition-colors"
              >
                {toggling ? 'Enabling...' : 'Enable Flag'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
