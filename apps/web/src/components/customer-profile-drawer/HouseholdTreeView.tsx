'use client';

import { Home, Crown, User } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { CustomerHousehold } from '@/types/customers';
import { useProfileDrawer } from './ProfileDrawerContext';

interface HouseholdTreeViewProps {
  households: CustomerHousehold[];
  currentCustomerId: string;
}

export function HouseholdTreeView({ households, currentCustomerId }: HouseholdTreeViewProps) {
  const { open } = useProfileDrawer();

  if (!households.length) return null;

  return (
    <div className="space-y-3">
      {households.map((household) => {
        const sortedMembers = [...household.members].sort((a, b) => {
          if (a.customerId === household.primaryCustomerId) return -1;
          if (b.customerId === household.primaryCustomerId) return 1;
          return a.role.localeCompare(b.role);
        });

        return (
          <div
            key={household.id}
            className="rounded-lg border border-border bg-muted p-3"
          >
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
              <Home className="h-4 w-4 text-muted-foreground" />
              <span>{household.name}</span>
              <Badge variant="neutral">{household.householdType}</Badge>
            </div>
            <div className="ml-2 space-y-1 border-l-2 border-border pl-3">
              {sortedMembers.map((member, idx) => {
                const isPrimary = member.customerId === household.primaryCustomerId;
                const isCurrent = member.customerId === currentCustomerId;
                const isLast = idx === sortedMembers.length - 1;

                return (
                  <div key={member.id} className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {isLast ? '\u2514' : '\u251C'}
                    </span>
                    {isPrimary ? (
                      <Crown className="h-3.5 w-3.5 text-amber-500" />
                    ) : (
                      <User className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        if (!isCurrent) {
                          open(member.customerId, { tab: 'overview' });
                        }
                      }}
                      disabled={isCurrent}
                      className={`text-sm ${
                        isCurrent
                          ? 'font-semibold text-foreground'
                          : 'text-indigo-600 hover:text-indigo-500 hover:underline'
                      }`}
                    >
                      {member.customerDisplayName ?? member.customerId}
                    </button>
                    <span className="text-xs text-muted-foreground">
                      ({member.role})
                    </span>
                    {isPrimary && (
                      <Badge variant="warning">Primary</Badge>
                    )}
                    {member.leftAt && (
                      <Badge variant="neutral">Left</Badge>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
