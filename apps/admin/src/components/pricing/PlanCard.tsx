'use client';

import { Users, Edit2, Crown, Building2, Rocket } from 'lucide-react';
import type { PricingPlan } from '@/types/pricing';

const TIER_COLORS: Record<string, string> = {
  SMB: 'border-emerald-500/40',
  MID_MARKET: 'border-blue-500/40',
  ENTERPRISE: 'border-purple-500/40',
};

const TIER_ICONS: Record<string, typeof Users> = {
  SMB: Building2,
  MID_MARKET: Crown,
  ENTERPRISE: Rocket,
};

interface PlanCardProps {
  plan: PricingPlan;
  onEdit: () => void;
}

export function PlanCard({ plan, onEdit }: PlanCardProps) {
  const Icon = TIER_ICONS[plan.tier] ?? Building2;
  const borderColor = TIER_COLORS[plan.tier] ?? 'border-slate-600';

  return (
    <div
      className={`bg-slate-800 rounded-xl border-2 ${borderColor} p-6 flex flex-col relative`}
    >
      {/* Edit button */}
      <button
        onClick={onEdit}
        className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
        title="Edit plan"
      >
        <Edit2 size={14} />
      </button>

      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-lg bg-slate-700 flex items-center justify-center">
          <Icon size={20} className="text-slate-300" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-white">{plan.displayName}</h3>
          <span className="text-xs text-slate-400 font-mono">{plan.tier}</span>
        </div>
      </div>

      {/* Price */}
      <div className="mb-4">
        <span className="text-3xl font-bold text-white">
          ${(plan.pricePerSeatCents / 100).toFixed(0)}
        </span>
        <span className="text-slate-400 text-sm"> / seat / month</span>
      </div>

      {/* Limits */}
      <div className="mb-4 space-y-2">
        <div className="flex items-center gap-2 text-sm">
          <Users size={14} className="text-slate-400" />
          <span className="text-slate-300">
            {plan.maxSeats ? `Up to ${plan.maxSeats} seats` : 'Unlimited seats'}
          </span>
        </div>
        {plan.baseFeeCents > 0 && (
          <div className="text-sm text-slate-400">
            + ${(plan.baseFeeCents / 100).toFixed(2)} base fee/mo
          </div>
        )}
      </div>

      {/* Features */}
      <ul className="space-y-1.5 mb-4 flex-1">
        {(plan.features as string[]).map((feat, i) => (
          <li key={i} className="text-sm text-slate-300 flex items-start gap-2">
            <span className="text-emerald-400 mt-0.5">&#10003;</span>
            {feat}
          </li>
        ))}
      </ul>

      {/* Tenant count */}
      <div className="pt-4 border-t border-slate-700">
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-400">Active subscriptions</span>
          <span className="text-white font-semibold">{plan.tenantCount}</span>
        </div>
      </div>

      {/* Active status */}
      {!plan.isActive && (
        <div className="mt-2 text-xs text-amber-400 bg-amber-500/10 rounded px-2 py-1 text-center">
          Plan is inactive
        </div>
      )}
    </div>
  );
}
