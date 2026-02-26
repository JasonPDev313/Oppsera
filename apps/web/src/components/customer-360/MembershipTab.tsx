'use client';

import { useState, useMemo, lazy, Suspense } from 'react';
import {
  Crown,
  Users,
  CreditCard,
  Shield,
  BookOpen,
  Calendar,
  Hash,
  AlertCircle,
  CheckCircle,
  XCircle,
  PauseCircle,
  FileText,
  Target,
  Landmark,
} from 'lucide-react';

const DuesSubTab = lazy(() => import('./DuesSubTab'));
const StatementsSubTab = lazy(() => import('./StatementsSubTab'));
const MinimumsSubTab = lazy(() => import('./MinimumsSubTab'));
const InitiationSubTab = lazy(() => import('./InitiationSubTab'));

type SubTabKey = 'overview' | 'dues' | 'statements' | 'minimums' | 'initiation';

const SUB_TAB_CONFIG: { key: SubTabKey; label: string; icon: typeof Crown }[] = [
  { key: 'overview', label: 'Overview', icon: Crown },
  { key: 'dues', label: 'Dues', icon: CreditCard },
  { key: 'statements', label: 'Statements', icon: FileText },
  { key: 'minimums', label: 'Minimums', icon: Target },
  { key: 'initiation', label: 'Initiation', icon: Landmark },
];
import { Badge } from '@/components/ui/badge';
import { useMembershipAccounts, useMembershipAccount } from '@/hooks/use-membership';
import type {
  MembershipAccountListEntry,
  MembershipMemberEntry,
  MembershipClassEntry,
  MembershipBillingItemEntry,
  MembershipAuthorizedUserEntry,
} from '@/types/customer-360';

// ── Helpers ─────────────────────────────────────────────────────

function formatMoney(cents: number): string {
  const abs = Math.abs(cents);
  const formatted = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(abs / 100);
  if (cents < 0) return `(${formatted})`;
  return formatted;
}

function formatDate(iso: string | null): string {
  if (!iso) return '--';
  try {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

const STATUS_VARIANTS: Record<string, 'success' | 'warning' | 'destructive' | 'neutral'> = {
  active: 'success',
  suspended: 'warning',
  frozen: 'destructive',
  terminated: 'destructive',
  removed: 'destructive',
  expired: 'neutral',
  revoked: 'destructive',
};

const STATUS_ICONS: Record<string, typeof CheckCircle> = {
  active: CheckCircle,
  suspended: PauseCircle,
  frozen: XCircle,
  terminated: XCircle,
  removed: XCircle,
  expired: AlertCircle,
  revoked: XCircle,
};

function StatusBadge({ status }: { status: string }) {
  const variant = STATUS_VARIANTS[status] ?? 'neutral';
  const Icon = STATUS_ICONS[status];
  return (
    <Badge variant={variant}>
      {Icon && <Icon className="mr-1 h-3 w-3" />}
      {status}
    </Badge>
  );
}

const ROLE_LABELS: Record<string, string> = {
  primary: 'Primary',
  spouse: 'Spouse',
  dependent: 'Dependent',
  corporate_designee: 'Corporate Designee',
};

const FREQUENCY_LABELS: Record<string, string> = {
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  semi_annual: 'Semi-Annual',
  annual: 'Annual',
  one_time: 'One-Time',
};

// ── Section Components ──────────────────────────────────────────

function OverviewSection({
  accountNumber,
  status,
  startDate,
  endDate,
  primaryMemberName,
  autopayEnabled,
  creditLimitCents,
  holdCharging,
}: {
  accountNumber: string;
  status: string;
  startDate: string;
  endDate: string | null;
  primaryMemberName: string | null;
  autopayEnabled: boolean;
  creditLimitCents: number;
  holdCharging: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="mb-3 flex items-center gap-2">
        <Crown className="h-5 w-5 text-indigo-600" />
        <h3 className="text-sm font-semibold text-foreground">Account Overview</h3>
      </div>
      <div className="grid grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-3 lg:grid-cols-4">
        <div>
          <div className="text-xs text-muted-foreground">Account Number</div>
          <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
            <Hash className="h-3.5 w-3.5 text-muted-foreground" />
            {accountNumber}
          </div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Status</div>
          <div className="mt-0.5">
            <StatusBadge status={status} />
          </div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Start Date</div>
          <div className="flex items-center gap-1.5 text-sm text-foreground">
            <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
            {formatDate(startDate)}
          </div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">End Date</div>
          <div className="text-sm text-foreground">{formatDate(endDate)}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Primary Member</div>
          <div className="text-sm text-foreground">{primaryMemberName || '--'}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Autopay</div>
          <div className="text-sm text-foreground">
            {autopayEnabled ? (
              <span className="flex items-center gap-1 text-green-500">
                <CheckCircle className="h-3.5 w-3.5" /> Enabled
              </span>
            ) : (
              <span className="text-muted-foreground">Disabled</span>
            )}
          </div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Credit Limit</div>
          <div className="text-sm font-medium text-foreground">
            {creditLimitCents > 0 ? formatMoney(creditLimitCents) : '--'}
          </div>
        </div>
        {holdCharging && (
          <div>
            <div className="text-xs text-muted-foreground">Charging</div>
            <Badge variant="warning">Hold</Badge>
          </div>
        )}
      </div>
    </div>
  );
}

function MembersSection({ members }: { members: MembershipMemberEntry[] }) {
  if (members.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-surface p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-indigo-600" />
            <h3 className="text-sm font-semibold text-foreground">Members & Dependents</h3>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">No members on this account.</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-indigo-600" />
          <h3 className="text-sm font-semibold text-foreground">
            Members & Dependents ({members.length})
          </h3>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="pb-2 pr-4 font-medium">Name</th>
              <th className="pb-2 pr-4 font-medium">Role</th>
              <th className="pb-2 pr-4 font-medium">Member #</th>
              <th className="pb-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {members.map((m) => (
              <tr key={m.id}>
                <td className="py-2 pr-4 font-medium text-foreground">
                  {m.customerName || m.customerId}
                </td>
                <td className="py-2 pr-4">
                  <Badge variant={m.role === 'primary' ? 'indigo' : 'neutral'}>
                    {ROLE_LABELS[m.role] ?? m.role}
                  </Badge>
                </td>
                <td className="py-2 pr-4 text-muted-foreground">{m.memberNumber || '--'}</td>
                <td className="py-2">
                  <StatusBadge status={m.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ClassesSection({ classes }: { classes: MembershipClassEntry[] }) {
  if (classes.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-surface p-4">
        <div className="flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-indigo-600" />
          <h3 className="text-sm font-semibold text-foreground">Membership Classes</h3>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">No classes assigned.</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="mb-3 flex items-center gap-2">
        <BookOpen className="h-5 w-5 text-indigo-600" />
        <h3 className="text-sm font-semibold text-foreground">
          Membership Classes ({classes.length})
        </h3>
      </div>
      <div className="space-y-2">
        {classes.map((c) => (
          <div
            key={c.id}
            className={`flex items-center justify-between rounded-md border px-3 py-2 ${
              c.isArchived
                ? 'border-border bg-muted opacity-60'
                : 'border-border bg-surface'
            }`}
          >
            <div>
              <span className="text-sm font-medium text-foreground">{c.className}</span>
              {c.isArchived && (
                <Badge variant="neutral" className="ml-2">
                  Archived
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span>Effective: {formatDate(c.effectiveDate)}</span>
              {c.expirationDate && <span>Expires: {formatDate(c.expirationDate)}</span>}
              {c.billedThroughDate && (
                <span>Billed through: {formatDate(c.billedThroughDate)}</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function BillingItemsSection({ items }: { items: MembershipBillingItemEntry[] }) {
  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-surface p-4">
        <div className="flex items-center gap-2">
          <CreditCard className="h-5 w-5 text-indigo-600" />
          <h3 className="text-sm font-semibold text-foreground">Billing Plans</h3>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">No billing items configured.</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="mb-3 flex items-center gap-2">
        <CreditCard className="h-5 w-5 text-indigo-600" />
        <h3 className="text-sm font-semibold text-foreground">
          Billing Plans ({items.length})
        </h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="pb-2 pr-4 font-medium">Description</th>
              <th className="pb-2 pr-4 font-medium text-right">Amount</th>
              <th className="pb-2 pr-4 font-medium text-right">Discount</th>
              <th className="pb-2 pr-4 font-medium">Frequency</th>
              <th className="pb-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {items.map((item) => (
              <tr key={item.id} className={item.isActive ? '' : 'opacity-50'}>
                <td className="py-2 pr-4 text-foreground">
                  {item.description}
                  {item.isSubMemberItem && (
                    <Badge variant="neutral" className="ml-2">
                      Sub-Member
                    </Badge>
                  )}
                </td>
                <td className="py-2 pr-4 text-right font-medium text-foreground">
                  {formatMoney(item.amountCents)}
                </td>
                <td className="py-2 pr-4 text-right text-muted-foreground">
                  {item.discountCents > 0 ? formatMoney(item.discountCents) : '--'}
                </td>
                <td className="py-2 pr-4 text-muted-foreground">
                  {FREQUENCY_LABELS[item.frequency] ?? item.frequency}
                </td>
                <td className="py-2">
                  <Badge variant={item.isActive ? 'success' : 'neutral'}>
                    {item.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AuthorizedUsersSection({ users }: { users: MembershipAuthorizedUserEntry[] }) {
  if (users.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-surface p-4">
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-indigo-600" />
          <h3 className="text-sm font-semibold text-foreground">Authorized Users</h3>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">No authorized users.</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="mb-3 flex items-center gap-2">
        <Shield className="h-5 w-5 text-indigo-600" />
        <h3 className="text-sm font-semibold text-foreground">
          Authorized Users ({users.length})
        </h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="pb-2 pr-4 font-medium">Name</th>
              <th className="pb-2 pr-4 font-medium">Relationship</th>
              <th className="pb-2 pr-4 font-medium">Effective</th>
              <th className="pb-2 pr-4 font-medium">Expires</th>
              <th className="pb-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {users.map((u) => (
              <tr key={u.id}>
                <td className="py-2 pr-4 font-medium text-foreground">{u.name}</td>
                <td className="py-2 pr-4 text-muted-foreground">{u.relationship || '--'}</td>
                <td className="py-2 pr-4 text-muted-foreground">{formatDate(u.effectiveDate)}</td>
                <td className="py-2 pr-4 text-muted-foreground">{formatDate(u.expirationDate)}</td>
                <td className="py-2">
                  <StatusBadge status={u.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Account Card (for multi-account list) ───────────────────────

function AccountCard({
  entry,
  isSelected,
  onSelect,
}: {
  entry: MembershipAccountListEntry;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full rounded-lg border p-3 text-left transition-colors ${
        isSelected
          ? 'border-indigo-500/30 bg-indigo-500/10 ring-1 ring-indigo-500/30'
          : 'border-border bg-surface hover:border-input'
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Crown className="h-4 w-4 text-indigo-600" />
          <span className="text-sm font-semibold text-foreground">{entry.accountNumber}</span>
        </div>
        <StatusBadge status={entry.status} />
      </div>
      <div className="mt-1.5 flex items-center gap-4 text-xs text-muted-foreground">
        <span>{entry.primaryMemberName || 'No primary'}</span>
        <span>{entry.memberCount} member{entry.memberCount !== 1 ? 's' : ''}</span>
        {entry.autopayEnabled && <span className="text-green-500">Autopay</span>}
      </div>
    </button>
  );
}

// ── Main Component ──────────────────────────────────────────────

function SubTabSkeleton() {
  return (
    <div className="space-y-4 p-4">
      <div className="h-24 animate-pulse rounded-lg bg-muted" />
      <div className="h-24 animate-pulse rounded-lg bg-muted" />
    </div>
  );
}

export default function MembershipTab({ customerId }: { customerId: string }) {
  const { accounts, isLoading: listLoading, error: listError } = useMembershipAccounts({
    customerId,
  });
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [activeSubTab, setActiveSubTab] = useState<SubTabKey>('overview');

  // Auto-select first account when accounts load
  const activeAccountId = useMemo(() => {
    if (selectedAccountId && accounts.some((a) => a.id === selectedAccountId)) {
      return selectedAccountId;
    }
    return accounts.length > 0 ? accounts[0]!.id : null;
  }, [accounts, selectedAccountId]);

  const { account, isLoading: detailLoading, error: detailError } =
    useMembershipAccount(activeAccountId);

  // Loading state
  if (listLoading) {
    return (
      <div className="space-y-4 p-6">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-lg bg-muted" />
        ))}
      </div>
    );
  }

  // Error state
  if (listError) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2 p-6 text-muted-foreground">
        <AlertCircle className="h-8 w-8 text-red-400" />
        <p className="text-sm">Failed to load membership data</p>
        <p className="text-xs text-muted-foreground">{listError.message}</p>
      </div>
    );
  }

  // Empty state
  if (accounts.length === 0) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2 p-6 text-muted-foreground">
        <Crown className="h-8 w-8" />
        <p className="text-sm font-medium text-muted-foreground">No Membership Accounts</p>
        <p className="text-xs">This customer is not associated with any membership accounts.</p>
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Multi-account selector (only if > 1 account) */}
      {accounts.length > 1 && (
        <div className="mb-4">
          <div className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Membership Accounts ({accounts.length})
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {accounts.map((entry) => (
              <AccountCard
                key={entry.id}
                entry={entry}
                isSelected={entry.id === activeAccountId}
                onSelect={() => setSelectedAccountId(entry.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Sub-tab navigation */}
      {activeAccountId && (
        <div className="mb-4 flex gap-1 overflow-x-auto border-b border-border">
          {SUB_TAB_CONFIG.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setActiveSubTab(key)}
              className={`flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                activeSubTab === key
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-muted-foreground hover:border-input hover:text-foreground'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Sub-tab content */}
      {activeSubTab === 'overview' && (
        <>
          {/* Account detail */}
          {detailLoading && (
            <div className="space-y-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-20 animate-pulse rounded-lg bg-muted" />
              ))}
            </div>
          )}

          {detailError && (
            <div className="flex h-32 items-center justify-center text-sm text-red-500">
              Failed to load account details: {detailError.message}
            </div>
          )}

          {account && !detailLoading && (
            <div className="space-y-4">
              <OverviewSection
                accountNumber={account.accountNumber}
                status={account.status}
                startDate={account.startDate}
                endDate={account.endDate}
                primaryMemberName={account.primaryMemberName}
                autopayEnabled={account.autopayEnabled}
                creditLimitCents={account.creditLimitCents}
                holdCharging={account.holdCharging}
              />
              <MembersSection members={account.members} />
              <ClassesSection classes={account.classes} />
              <BillingItemsSection items={account.billingItems} />
              <AuthorizedUsersSection users={account.authorizedUsers} />
            </div>
          )}
        </>
      )}

      {activeSubTab === 'dues' && activeAccountId && (
        <Suspense fallback={<SubTabSkeleton />}>
          <DuesSubTab accountId={activeAccountId} />
        </Suspense>
      )}

      {activeSubTab === 'statements' && activeAccountId && (
        <Suspense fallback={<SubTabSkeleton />}>
          <StatementsSubTab accountId={activeAccountId} />
        </Suspense>
      )}

      {activeSubTab === 'minimums' && activeAccountId && (
        <Suspense fallback={<SubTabSkeleton />}>
          <MinimumsSubTab accountId={activeAccountId} />
        </Suspense>
      )}

      {activeSubTab === 'initiation' && activeAccountId && (
        <Suspense fallback={<SubTabSkeleton />}>
          <InitiationSubTab membershipAccountId={activeAccountId} />
        </Suspense>
      )}
    </div>
  );
}
