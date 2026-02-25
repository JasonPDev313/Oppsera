'use client';

import { useEffect, useState } from 'react';
import { CreditCard, Package } from 'lucide-react';
import { usePricingPlans, useModulePricing } from '@/hooks/use-pricing';
import { PlanCard } from '@/components/pricing/PlanCard';
import { EditPlanModal } from '@/components/pricing/EditPlanModal';
import { ModulePricingTable } from '@/components/pricing/ModulePricingTable';
import type { PricingPlan } from '@/types/pricing';

type Tab = 'plans' | 'modules';

export default function PricingPage() {
  const [tab, setTab] = useState<Tab>('plans');
  const { plans, isLoading: plansLoading, load: loadPlans, updatePlan } = usePricingPlans();
  const { modules, isLoading: modulesLoading, load: loadModules, updateModule } = useModulePricing();
  const [editingPlan, setEditingPlan] = useState<PricingPlan | null>(null);

  useEffect(() => {
    loadPlans();
    loadModules();
  }, [loadPlans, loadModules]);

  const tabs: { key: Tab; label: string; icon: typeof CreditCard }[] = [
    { key: 'plans', label: 'Plans', icon: CreditCard },
    { key: 'modules', label: 'Module Pricing', icon: Package },
  ];

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Pricing Management</h1>
        <p className="text-sm text-slate-400 mt-1">
          Configure SaaS pricing tiers, per-seat costs, and module add-on pricing.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-slate-700 pb-px">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === key
                ? 'border-indigo-500 text-white'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
      </div>

      {/* Plans Tab */}
      {tab === 'plans' && (
        <div>
          {plansLoading && !plans.length ? (
            <div className="text-slate-400 text-sm">Loading plans...</div>
          ) : (
            <>
              {/* Summary */}
              <div className="mb-4 text-sm text-slate-400">
                {plans.reduce((sum, p) => sum + p.tenantCount, 0)} total subscriptions across{' '}
                {plans.length} plans
              </div>

              {/* Plan cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {plans.map((plan) => (
                  <PlanCard key={plan.id} plan={plan} onEdit={() => setEditingPlan(plan)} />
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Modules Tab */}
      {tab === 'modules' && (
        <div>
          {modulesLoading && !modules.length ? (
            <div className="text-slate-400 text-sm">Loading module pricing...</div>
          ) : modules.length === 0 ? (
            <div className="text-slate-400 text-sm">
              No module pricing configured yet. Module pricing rows are created when you configure add-on pricing for specific modules.
            </div>
          ) : (
            <ModulePricingTable modules={modules} onUpdate={updateModule} />
          )}
        </div>
      )}

      {/* Edit Plan Modal */}
      {editingPlan && (
        <EditPlanModal
          plan={editingPlan}
          onClose={() => setEditingPlan(null)}
          onSave={async (input) => {
            await updatePlan(editingPlan.id, input);
            setEditingPlan(null);
          }}
        />
      )}
    </div>
  );
}
