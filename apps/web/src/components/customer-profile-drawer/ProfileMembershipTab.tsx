'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Crown,
  Gift,
  Shield,
  Clock,
  CheckCircle,
  XCircle,
  PauseCircle,
} from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { EmptyState } from '@/components/ui/empty-state';
import type {
  CustomerMembershipSummary,
  PrivilegeEntry,
} from '@/types/customers';

interface ProfileMembershipTabProps {
  customerId: string;
}

interface MembershipData {
  active: (CustomerMembershipSummary & { planName: string }) | null;
  history: CustomerMembershipSummary[];
  privileges: PrivilegeEntry[];
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

const STATUS_CONFIGS: Record<string, { variant: string; icon: React.ElementType }> = {
  active: { variant: 'success', icon: CheckCircle },
  paused: { variant: 'warning', icon: PauseCircle },
  canceled: { variant: 'error', icon: XCircle },
  expired: { variant: 'neutral', icon: Clock },
  pending: { variant: 'info', icon: Clock },
};

export function ProfileMembershipTab({ customerId }: ProfileMembershipTabProps) {
  const [data, setData] = useState<MembershipData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const res = await apiFetch<{ data: MembershipData }>(
        `/api/v1/customers/${customerId}/memberships`,
      );
      setData(res.data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load memberships'));
    } finally {
      setIsLoading(false);
    }
  }, [customerId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <LoadingSpinner label="Loading memberships..." />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6 text-center">
        <p className="text-sm text-red-500">Failed to load membership data.</p>
        <button
          type="button"
          onClick={fetchData}
          className="mt-2 text-sm font-medium text-indigo-400 hover:text-indigo-500"
        >
          Try again
        </button>
      </div>
    );
  }

  const { active = null, history = [], privileges = [] } = data;

  return (
    <div className="space-y-6 p-6">
      {/* Active Membership */}
      <section>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Current Membership
        </h3>
        {active ? (
          <div className="rounded-lg border border-indigo-500/30 bg-indigo-500/10 p-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <Crown className="h-5 w-5 text-indigo-400" aria-hidden="true" />
                <div>
                  <p className="text-sm font-semibold text-indigo-400">
                    {active.planName}
                  </p>
                  <Badge variant="success">Active</Badge>
                </div>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-indigo-400">Start Date</span>
                <p className="font-medium text-indigo-400">
                  {formatDate(active.startDate)}
                </p>
              </div>
              {active.endDate && (
                <div>
                  <span className="text-indigo-400">End Date</span>
                  <p className="font-medium text-indigo-400">
                    {formatDate(active.endDate)}
                  </p>
                </div>
              )}
              {active.renewalDate && (
                <div>
                  <span className="text-indigo-400">Next Renewal</span>
                  <p className="font-medium text-indigo-400">
                    {formatDate(active.renewalDate)}
                  </p>
                </div>
              )}
            </div>
          </div>
        ) : (
          <EmptyState
            icon={Crown}
            title="No active membership"
            description="This customer does not have an active membership plan."
          />
        )}
      </section>

      {/* Privileges / Benefits */}
      {privileges.length > 0 && (
        <section>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Benefits & Privileges
          </h3>
          <div className="space-y-2">
            {privileges.map((priv, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between rounded-lg border border-border px-3 py-2"
              >
                <div className="flex items-center gap-2">
                  {priv.privilegeType === 'discount' ? (
                    <Gift className="h-4 w-4 text-green-500" aria-hidden="true" />
                  ) : (
                    <Shield className="h-4 w-4 text-indigo-500" aria-hidden="true" />
                  )}
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {priv.privilegeType}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {typeof priv.value === 'number'
                        ? priv.privilegeType.includes('discount')
                          ? `${priv.value}%`
                          : String(priv.value)
                        : String(priv.value)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={priv.source === 'membership' ? 'indigo' : 'neutral'}>
                    {priv.source}
                  </Badge>
                  {priv.planName && (
                    <span className="text-xs text-muted-foreground">{priv.planName}</span>
                  )}
                  {priv.expiresAt && (
                    <span className="text-xs text-muted-foreground">
                      Exp: {formatDate(priv.expiresAt)}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Membership History */}
      {history.length > 0 && (
        <section>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Membership History
          </h3>
          <div className="space-y-2">
            {history.map((membership) => {
              const statusConfig = STATUS_CONFIGS[membership.status] || {
                variant: 'neutral',
                icon: Clock,
              };
              const StatusIcon = statusConfig.icon;
              return (
                <div
                  key={membership.id}
                  className="flex items-center justify-between rounded-lg border border-border px-3 py-2"
                >
                  <div className="flex items-center gap-2">
                    <StatusIcon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {membership.planName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(membership.startDate)}
                        {membership.endDate && <> - {formatDate(membership.endDate)}</>}
                      </p>
                    </div>
                  </div>
                  <Badge variant={statusConfig.variant}>{membership.status}</Badge>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
