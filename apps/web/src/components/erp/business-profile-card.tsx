'use client';

import { MapPin, Users, Blocks, BookOpen } from 'lucide-react';
import type { TenantTierInfo } from '@/hooks/use-erp-config';
import { TierBadge } from './tier-badge';
import { VerticalIcon } from './vertical-icon';

function StatPill({ icon: Icon, value, label }: { icon: typeof MapPin; value: number; label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border px-3 py-2">
      <Icon className="h-4 w-4 text-muted-foreground" />
      <div>
        <p className="text-lg font-semibold text-foreground">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

export function BusinessProfileCard({ tier }: { tier: TenantTierInfo }) {
  const memberSince = new Date(tier.createdAt).toLocaleDateString('en-US', {
    month: 'short',
    year: 'numeric',
  });

  return (
    <div className="rounded-lg border border-border bg-surface p-6">
      {/* Header Row */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          {tier.verticalInfo && (
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-500/10">
              <VerticalIcon name={tier.verticalInfo.icon} className="h-5 w-5 text-indigo-600" />
            </div>
          )}
          <div>
            <p className="text-sm font-medium text-muted-foreground">
              {tier.verticalInfo?.name ?? tier.businessVertical.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
            </p>
            <h2 className="text-xl font-bold text-foreground">{tier.tenantName}</h2>
          </div>
        </div>
        <TierBadge tier={tier.businessTier} size="lg" />
      </div>

      {/* Description + member since */}
      <div className="mt-3">
        {tier.verticalInfo?.description && (
          <p className="text-sm text-muted-foreground">{tier.verticalInfo.description}</p>
        )}
        <p className="mt-1 text-xs text-muted-foreground">Member since {memberSince}</p>
        {tier.tierOverride && (
          <p className="mt-1 text-xs text-amber-500">
            Tier manually set{tier.tierOverrideReason ? `: ${tier.tierOverrideReason}` : ''}
          </p>
        )}
      </div>

      {/* Stats Grid */}
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatPill icon={MapPin} value={tier.locationCount} label="Locations" />
        <StatPill icon={Users} value={tier.userCount} label="Users" />
        <StatPill icon={Blocks} value={tier.enabledModuleCount} label="Modules" />
        <StatPill icon={BookOpen} value={tier.glAccountCount} label="GL Accounts" />
      </div>
    </div>
  );
}
