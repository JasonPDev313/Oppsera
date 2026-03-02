'use client';

import { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Circle,
  Clock,
  AlertTriangle,
  SkipForward,
  Loader2,
  Play,
} from 'lucide-react';
import { useTenantOnboarding } from '@/hooks/use-tenant-management';

const STATUS_CONFIG = {
  pending: { icon: Circle, color: 'text-slate-400', bg: 'bg-slate-500/10', label: 'Pending' },
  in_progress: { icon: Clock, color: 'text-blue-400', bg: 'bg-blue-500/10', label: 'In Progress' },
  completed: { icon: CheckCircle2, color: 'text-emerald-400', bg: 'bg-emerald-500/10', label: 'Completed' },
  skipped: { icon: SkipForward, color: 'text-slate-500', bg: 'bg-slate-500/10', label: 'Skipped' },
  blocked: { icon: AlertTriangle, color: 'text-red-400', bg: 'bg-red-500/10', label: 'Blocked' },
} as const;

const NEXT_STATUS: Record<string, string> = {
  pending: 'in_progress',
  in_progress: 'completed',
};

interface Props {
  tenantId: string;
  industry: string | null;
}

export function OnboardingTab({ tenantId, industry }: Props) {
  const { data, isLoading, error, load, updateStep, initialize } = useTenantOnboarding(tenantId);
  const [initIndustry, setInitIndustry] = useState(industry ?? 'general');

  useEffect(() => { load(); }, [load]);

  if (isLoading && !data) {
    return <div className="flex items-center gap-2 text-slate-400 text-sm py-8"><Loader2 size={16} className="animate-spin" /> Loading onboarding...</div>;
  }

  if (error) {
    return <p className="text-red-400 text-sm">{error}</p>;
  }

  // No steps yet — show initialize UI
  if (!data || data.steps.length === 0) {
    return (
      <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
        <h3 className="text-lg font-medium text-white mb-2">Initialize Onboarding</h3>
        <p className="text-sm text-slate-400 mb-4">
          Set up the onboarding checklist for this tenant based on their industry.
        </p>
        <div className="flex items-end gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Industry</label>
            <select
              value={initIndustry}
              onChange={(e) => setInitIndustry(e.target.value)}
              className="bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white"
            >
              <option value="general">General</option>
              <option value="restaurant">Restaurant</option>
              <option value="hotel">Hotel</option>
              <option value="retail">Retail</option>
              <option value="spa">Spa / Wellness</option>
              <option value="marina">Marina</option>
            </select>
          </div>
          <button
            onClick={() => initialize(initIndustry)}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 transition-colors"
          >
            <Play size={14} />
            Initialize
          </button>
        </div>
      </div>
    );
  }

  // Group steps by stepGroup
  const groups = new Map<string, typeof data.steps>();
  for (const step of data.steps) {
    const group = groups.get(step.stepGroup) ?? [];
    group.push(step);
    groups.set(step.stepGroup, group);
  }

  return (
    <div className="space-y-6">
      {/* Progress bar */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 p-5">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-white">Onboarding Progress</span>
          <span className="text-sm font-bold text-white">{data.summary.progress}%</span>
        </div>
        <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-indigo-500 rounded-full transition-all duration-500"
            style={{ width: `${data.summary.progress}%` }}
          />
        </div>
        <div className="flex gap-4 mt-3 text-xs text-slate-400">
          <span>{data.summary.completed} / {data.summary.total} completed</span>
          {data.summary.blocked > 0 && <span className="text-red-400">{data.summary.blocked} blocked</span>}
          {data.summary.skipped > 0 && <span>{data.summary.skipped} skipped</span>}
        </div>
      </div>

      {/* Step groups */}
      {Array.from(groups.entries()).map(([groupName, steps]) => (
        <div key={groupName} className="bg-slate-800 rounded-xl border border-slate-700 p-5">
          <h3 className="text-sm font-semibold text-white mb-4 capitalize">{groupName.replace(/_/g, ' ')}</h3>
          <div className="space-y-2">
            {steps.map((step) => {
              const cfg = STATUS_CONFIG[step.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.pending;
              const Icon = cfg.icon;
              const nextStatus = NEXT_STATUS[step.status];

              return (
                <div key={step.id} className="flex items-center gap-3 group">
                  <button
                    onClick={() => nextStatus && updateStep(step.stepKey, nextStatus)}
                    disabled={!nextStatus}
                    className="shrink-0 disabled:cursor-default"
                    title={nextStatus ? `Mark as ${nextStatus.replace('_', ' ')}` : undefined}
                  >
                    <Icon size={18} className={`${cfg.color} ${nextStatus ? 'group-hover:opacity-70' : ''}`} />
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm ${step.status === 'completed' ? 'text-slate-500 line-through' : 'text-white'}`}>
                      {step.stepLabel}
                    </p>
                    {step.blockerNotes && (
                      <p className="text-xs text-red-400 mt-0.5">{step.blockerNotes}</p>
                    )}
                  </div>
                  <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.color}`}>
                    {cfg.label}
                  </span>
                  {/* Quick actions */}
                  {step.status !== 'completed' && step.status !== 'skipped' && (
                    <div className="shrink-0 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => updateStep(step.stepKey, 'skipped')}
                        className="text-xs text-slate-500 hover:text-slate-300 px-1.5 py-0.5 rounded bg-slate-700/50"
                        title="Skip"
                      >
                        Skip
                      </button>
                      {step.status !== 'blocked' && (
                        <button
                          onClick={() => {
                            const notes = prompt('Blocker notes:');
                            if (notes) updateStep(step.stepKey, 'blocked', notes);
                          }}
                          className="text-xs text-red-500 hover:text-red-300 px-1.5 py-0.5 rounded bg-slate-700/50"
                          title="Mark as blocked"
                        >
                          Block
                        </button>
                      )}
                    </div>
                  )}
                  {(step.status === 'completed' || step.status === 'skipped') && (
                    <button
                      onClick={() => updateStep(step.stepKey, 'pending')}
                      className="shrink-0 text-xs text-slate-500 hover:text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      Undo
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
