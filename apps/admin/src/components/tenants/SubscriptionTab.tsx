'use client';

import { useEffect, useState } from 'react';
import { CreditCard, Users, TrendingUp, Clock, AlertCircle } from 'lucide-react';
import { useTenantSubscription, usePricingPlans } from '@/hooks/use-pricing';
import { ChangePlanModal } from '@/components/pricing/ChangePlanModal';

interface SubscriptionTabProps {
  tenantId: string;
}

export function SubscriptionTab({ tenantId }: SubscriptionTabProps) {
  const { subscription, changeLog, isLoading, error, load, changeSubscription, createSubscription } =
    useTenantSubscription(tenantId);
  const { plans, load: loadPlans } = usePricingPlans();
  const [showChangePlan, setShowChangePlan] = useState(false);

  useEffect(() => {
    load();
    loadPlans();
  }, [load, loadPlans]);

  if (isLoading && !subscription) {
    return <p className="text-slate-500 text-sm">Loading subscription...</p>;
  }

  if (error) {
    return <p className="text-red-400 text-sm">{error}</p>;
  }

  // No subscription yet
  if (!subscription) {
    return (
      <div>
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-8 text-center">
          <AlertCircle size={32} className="mx-auto text-amber-400 mb-3" />
          <h3 className="text-lg font-semibold text-white mb-2">No Subscription</h3>
          <p className="text-sm text-slate-400 mb-4">
            This tenant does not have a pricing plan assigned yet.
          </p>
          <button
            onClick={() => setShowChangePlan(true)}
            className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-500 transition-colors"
          >
            Assign Plan
          </button>
        </div>

        {showChangePlan && (
          <ChangePlanModal
            plans={plans}
            currentPlanId={null}
            currentSeatCount={1}
            onClose={() => setShowChangePlan(false)}
            onSave={async (planId, seatCount, reason) => {
              await createSubscription(planId, seatCount, reason);
              setShowChangePlan(false);
            }}
          />
        )}
      </div>
    );
  }

  const usagePercent = subscription.plan.maxSeats
    ? Math.round((subscription.activeSeatCount / subscription.plan.maxSeats) * 100)
    : 0;

  return (
    <div className="space-y-6">
      {/* Plan summary + Change button */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-indigo-600/20 flex items-center justify-center">
              <CreditCard size={20} className="text-indigo-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">{subscription.plan.displayName}</h3>
              <span className="text-xs text-slate-400 font-mono">{subscription.plan.tier}</span>
            </div>
          </div>
          <button
            onClick={() => setShowChangePlan(true)}
            className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-500 transition-colors"
          >
            Change Plan
          </button>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            icon={Users}
            label="Seats"
            value={`${subscription.activeSeatCount} / ${subscription.seatCount}`}
            subLabel={subscription.plan.maxSeats ? `max ${subscription.plan.maxSeats}` : 'unlimited'}
          />
          <StatCard
            icon={TrendingUp}
            label="Monthly Cost"
            value={`$${(subscription.monthlyTotalCents / 100).toFixed(2)}`}
            subLabel="per month"
          />
          <StatCard
            icon={CreditCard}
            label="Per Seat"
            value={`$${(subscription.plan.pricePerSeatCents / 100).toFixed(2)}`}
            subLabel="per seat/month"
          />
          <StatCard
            icon={Clock}
            label="Status"
            value={subscription.status}
            subLabel={subscription.currentPeriodStart ? `since ${new Date(subscription.currentPeriodStart).toLocaleDateString()}` : ''}
          />
        </div>

        {/* Seat usage bar */}
        {subscription.plan.maxSeats && (
          <div className="mt-4">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
              <span>Seat Usage</span>
              <span>{usagePercent}%</span>
            </div>
            <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  usagePercent >= 90 ? 'bg-red-500' : usagePercent >= 70 ? 'bg-amber-500' : 'bg-emerald-500'
                }`}
                style={{ width: `${Math.min(usagePercent, 100)}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-slate-500 mt-1">
              <span>{subscription.activeSeatCount} active users</span>
              <span>{subscription.seatCount} purchased seats</span>
            </div>
          </div>
        )}

        {/* Notes */}
        {subscription.notes && (
          <div className="mt-4 p-3 bg-slate-900 rounded-lg border border-slate-700 text-sm text-slate-300">
            {subscription.notes}
          </div>
        )}
      </div>

      {/* Change Log */}
      {changeLog.length > 0 && (
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
          <h3 className="text-sm font-medium text-slate-300 mb-4">Change History</h3>
          <div className="space-y-3">
            {changeLog.map((entry) => (
              <div
                key={entry.id}
                className="flex items-start gap-3 text-sm border-l-2 border-slate-600 pl-3"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <ChangeTypeBadge type={entry.changeType} />
                    <span className="text-slate-500">
                      {new Date(entry.createdAt).toLocaleString()}
                    </span>
                  </div>
                  {entry.reason && (
                    <p className="text-slate-400 mt-0.5">{entry.reason}</p>
                  )}
                  <p className="text-slate-500 text-xs mt-0.5">by {entry.changedBy}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Change Plan Modal */}
      {showChangePlan && (
        <ChangePlanModal
          plans={plans}
          currentPlanId={subscription.plan.id}
          currentSeatCount={subscription.seatCount}
          onClose={() => setShowChangePlan(false)}
          onSave={async (planId, seatCount, reason) => {
            await changeSubscription({
              pricingPlanId: planId,
              seatCount,
              reason,
            });
            setShowChangePlan(false);
          }}
        />
      )}
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  subLabel,
}: {
  icon: typeof Users;
  label: string;
  value: string;
  subLabel: string;
}) {
  return (
    <div className="bg-slate-900 rounded-lg p-3">
      <div className="flex items-center gap-1.5 mb-1">
        <Icon size={12} className="text-slate-400" />
        <span className="text-xs text-slate-400">{label}</span>
      </div>
      <p className="text-lg font-semibold text-white">{value}</p>
      <p className="text-xs text-slate-500">{subLabel}</p>
    </div>
  );
}

function ChangeTypeBadge({ type }: { type: string }) {
  const styles: Record<string, string> = {
    tier_upgrade: 'bg-emerald-500/20 text-emerald-400',
    tier_downgrade: 'bg-amber-500/20 text-amber-400',
    seat_change: 'bg-blue-500/20 text-blue-400',
    addon_change: 'bg-purple-500/20 text-purple-400',
    price_override: 'bg-red-500/20 text-red-400',
    subscription_created: 'bg-indigo-500/20 text-indigo-400',
  };

  const labels: Record<string, string> = {
    tier_upgrade: 'Upgrade',
    tier_downgrade: 'Downgrade',
    seat_change: 'Seats Changed',
    addon_change: 'Add-ons Changed',
    price_override: 'Price Override',
    subscription_created: 'Created',
  };

  return (
    <span className={`text-xs px-2 py-0.5 rounded-full ${styles[type] ?? 'bg-slate-600/30 text-slate-400'}`}>
      {labels[type] ?? type}
    </span>
  );
}
