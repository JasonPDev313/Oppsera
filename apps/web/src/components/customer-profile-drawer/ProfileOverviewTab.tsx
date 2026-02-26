'use client';

import { useState, useEffect } from 'react';
import {
  AlertTriangle,
  DollarSign,
  Calendar,
  TrendingUp,
  CreditCard,
  AlertCircle,
  Clock,
  User,
  Heart,
  Globe,
  Mail,
  Phone,
  MapPin,
  StickyNote,
} from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { HouseholdTreeView } from './HouseholdTreeView';
import type { CustomerProfileOverview } from '@/types/customers';

interface ProfileOverviewTabProps {
  customerId: string;
  profile: CustomerProfileOverview | null;
  onRefresh: () => void;
}

function formatCurrency(cents: number): string {
  return (cents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  });
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits[0] === '1') {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return phone;
}

function calculateAge(dobStr: string): number | null {
  const dob = new Date(dobStr);
  if (isNaN(dob.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const monthDiff = today.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
    age--;
  }
  return age;
}

const SEVERITY_STYLES = {
  critical: 'error',
  warning: 'warning',
  info: 'info',
} as const;

export function ProfileOverviewTab({
  customerId,
  profile,
}: ProfileOverviewTabProps) {
  if (!profile) {
    return (
      <div className="flex h-64 items-center justify-center">
        <LoadingSpinner label="Loading overview..." />
      </div>
    );
  }

  const {
    customer,
    contacts = [],
    identifiers = [],
    serviceFlags = [],
    activeAlerts = [],
    stats = { totalVisits: 0, avgSpendCents: 0, visitFrequency: '', lifetimeValueCents: 0, totalSpendCents: 0, lastVisitAt: null, revenueByCategory: {} },
    household,
    memberships,
  } = profile;

  // Extract contact info
  const primaryEmail = contacts.find((c) => c.contactType === 'email' && c.isPrimary)
    ?? contacts.find((c) => c.contactType === 'email');
  const primaryPhone = contacts.find((c) => c.contactType === 'phone' && c.isPrimary)
    ?? contacts.find((c) => c.contactType === 'phone');
  const primaryAddress = contacts.find((c) => c.contactType === 'address' && c.isPrimary)
    ?? contacts.find((c) => c.contactType === 'address');

  // Extract personal details from metadata
  const dob = customer.metadata?.dateOfBirth as string | undefined;
  const gender = customer.metadata?.gender as string | undefined;
  const anniversary = customer.metadata?.anniversary as string | undefined;
  const preferredLanguage = customer.metadata?.preferredLanguage as string | undefined;
  const hasPersonalDetails = dob || gender || anniversary || preferredLanguage;

  // Active identifiers
  const activeIdentifiers = identifiers.filter((id) => id.isActive);

  const hasContacts = primaryEmail || primaryPhone || primaryAddress || customer.email || customer.phone;

  return (
    <div className="space-y-5 p-6">
      {/* ── Service Flags ─────────────────────────────────────────────── */}
      {serviceFlags.length > 0 && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Service Flags
          </h3>
          <div className="flex flex-wrap gap-2">
            {serviceFlags.map((flag) => (
              <Badge key={flag.id} variant={SEVERITY_STYLES[flag.severity]}>
                {flag.severity === 'critical' && (
                  <AlertTriangle className="mr-1 h-3 w-3" aria-hidden="true" />
                )}
                {flag.flagType}
                {flag.notes && (
                  <span className="ml-1 opacity-75">- {flag.notes}</span>
                )}
              </Badge>
            ))}
          </div>
        </section>
      )}

      {/* ── Active Alerts ─────────────────────────────────────────────── */}
      {activeAlerts.length > 0 && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Active Alerts
          </h3>
          <div className="space-y-2">
            {activeAlerts.map((alert) => (
              <div
                key={alert.id}
                className={`flex items-start gap-2 rounded-lg border p-3 text-sm ${
                  alert.severity === 'critical'
                    ? 'border-red-500/30 bg-red-500/10 text-red-500'
                    : alert.severity === 'warning'
                      ? 'border-amber-500/30 bg-amber-500/10 text-amber-500'
                      : 'border-blue-500/30 bg-blue-500/10 text-blue-500'
                }`}
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <div>
                  <p className="font-medium">{alert.alertType}</p>
                  <p className="mt-0.5 opacity-80">{alert.message}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Personal Details ──────────────────────────────────────────── */}
      {hasPersonalDetails && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Personal Details
          </h3>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            {dob && (
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="text-muted-foreground">DOB</span>
                <span className="ml-auto text-foreground">
                  {formatDate(dob)}
                  {calculateAge(dob) != null && (
                    <span className="ml-1 text-muted-foreground">({calculateAge(dob)})</span>
                  )}
                </span>
              </div>
            )}
            {gender && (
              <div className="flex items-center gap-2 text-sm">
                <User className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="text-muted-foreground">Gender</span>
                <span className="ml-auto capitalize text-foreground">{gender}</span>
              </div>
            )}
            {anniversary && (
              <div className="flex items-center gap-2 text-sm">
                <Heart className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="text-muted-foreground">Anniversary</span>
                <span className="ml-auto text-foreground">{formatDate(anniversary)}</span>
              </div>
            )}
            {preferredLanguage && (
              <div className="flex items-center gap-2 text-sm">
                <Globe className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="text-muted-foreground">Language</span>
                <span className="ml-auto text-foreground">{preferredLanguage}</span>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ── Contact & Address ─────────────────────────────────────────── */}
      {hasContacts && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Contact
          </h3>
          <div className="space-y-1.5">
            {(primaryEmail || customer.email) && (
              <a
                href={`mailto:${primaryEmail?.value ?? customer.email}`}
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-indigo-500/10 hover:text-indigo-600"
              >
                <Mail className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="truncate">{primaryEmail?.value ?? customer.email}</span>
                {primaryEmail?.isPrimary && (
                  <Badge variant="indigo">Primary</Badge>
                )}
              </a>
            )}
            {(primaryPhone || customer.phone) && (
              <a
                href={`tel:${primaryPhone?.value ?? customer.phone}`}
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-indigo-500/10 hover:text-indigo-600"
              >
                <Phone className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span>{formatPhone(primaryPhone?.value ?? customer.phone ?? '')}</span>
                {primaryPhone?.isPrimary && (
                  <Badge variant="indigo">Primary</Badge>
                )}
              </a>
            )}
            {primaryAddress && (
              <div className="flex items-start gap-2 rounded-lg px-2 py-1.5 text-sm text-muted-foreground">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span>{primaryAddress.value}</span>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ── Identifiers ───────────────────────────────────────────────── */}
      {activeIdentifiers.length > 0 && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Identifiers
          </h3>
          <div className="flex flex-wrap gap-2">
            {activeIdentifiers.map((id) => (
              <div
                key={id.id}
                className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-sm"
              >
                <CreditCard className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                <span className="font-medium text-foreground">{id.value}</span>
                <span className="text-xs text-muted-foreground">{id.type.replace(/_/g, ' ')}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Stats Grid ────────────────────────────────────────────────── */}
      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Customer Stats
        </h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-border bg-surface p-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
              Total Visits
            </div>
            <p className="mt-1 text-xl font-semibold text-foreground">
              {stats.totalVisits.toLocaleString()}
            </p>
            {stats.lastVisitAt && (
              <p className="mt-0.5 text-xs text-muted-foreground">
                Last: {formatDate(stats.lastVisitAt)}
              </p>
            )}
          </div>
          <div className="rounded-lg border border-border bg-surface p-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <DollarSign className="h-3.5 w-3.5" aria-hidden="true" />
              Avg Spend
            </div>
            <p className="mt-1 text-xl font-semibold text-foreground">
              {formatCurrency(stats.avgSpendCents)}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {stats.visitFrequency}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-surface p-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" />
              Lifetime Value
            </div>
            <p className="mt-1 text-xl font-semibold text-foreground">
              {formatCurrency(stats.lifetimeValueCents)}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-surface p-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <CreditCard className="h-3.5 w-3.5" aria-hidden="true" />
              Total Spend
            </div>
            <p className="mt-1 text-xl font-semibold text-foreground">
              {formatCurrency(stats.totalSpendCents)}
            </p>
          </div>
        </div>
      </section>

      {/* ── Membership Card ───────────────────────────────────────────── */}
      {memberships?.active && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Membership
          </h3>
          <div className="flex items-center gap-2 rounded-lg border border-indigo-500/30 bg-indigo-500/10 p-3">
            <CreditCard className="h-5 w-5 text-indigo-600" aria-hidden="true" />
            <div>
              <p className="text-sm font-medium text-indigo-400">
                {memberships.active.planName}
              </p>
              <p className="text-xs text-indigo-400">
                Status: {memberships.active.status}
                {memberships.active.renewalDate && (
                  <> &middot; Renews {formatDate(memberships.active.renewalDate)}</>
                )}
              </p>
            </div>
          </div>
        </section>
      )}

      {/* ── Revenue Breakdown ─────────────────────────────────────────── */}
      {stats.revenueByCategory &&
        Object.keys(stats.revenueByCategory).length > 0 && (
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Revenue Breakdown
            </h3>
            <div className="space-y-2">
              {Object.entries(stats.revenueByCategory)
                .sort(([, a], [, b]) => b - a)
                .map(([category, cents]) => {
                  const totalCents = Object.values(stats.revenueByCategory).reduce(
                    (sum, v) => sum + v,
                    0,
                  );
                  const pct = totalCents > 0 ? (cents / totalCents) * 100 : 0;
                  return (
                    <div key={category}>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">{category}</span>
                        <span className="font-medium text-foreground">
                          {formatCurrency(cents)}
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 w-full rounded-full bg-muted">
                        <div
                          className="h-1.5 rounded-full bg-indigo-600"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
            </div>
          </section>
        )}

      {/* ── Household Tree ────────────────────────────────────────────── */}
      {household?.households && household.households.length > 0 && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Household
          </h3>
          <HouseholdTreeView
            households={household.households}
            currentCustomerId={customerId}
          />
        </section>
      )}

      {/* ── Notes ─────────────────────────────────────────────────────── */}
      {customer.notes && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Notes
          </h3>
          <div className="flex items-start gap-2 rounded-lg border border-border bg-muted p-3">
            <StickyNote className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm italic text-muted-foreground whitespace-pre-line">{customer.notes}</p>
          </div>
        </section>
      )}

      {/* ── Recent Activity ───────────────────────────────────────────── */}
      {customer && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Recent Activity
          </h3>
          <RecentActivity customerId={customerId} />
        </section>
      )}

      {/* ── Tags ──────────────────────────────────────────────────────── */}
      {customer.tags.length > 0 && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Segments & Tags
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {customer.tags.map((tag) => (
              <Badge key={tag} variant="indigo">
                {tag}
              </Badge>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// --- Internal: Recent Activity sub-component ---

function RecentActivity({ customerId }: { customerId: string }) {
  const [activities, setActivities] = useState<
    Array<{ id: string; activityType: string; title: string; createdAt: string }>
  >([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch<{
          data: Array<{
            id: string;
            activityType: string;
            title: string;
            createdAt: string;
          }>;
        }>(`/api/v1/customers/${customerId}/activities?limit=5`);
        if (!cancelled) setActivities(res.data);
      } catch {
        // Silently fail for overview
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [customerId]);

  if (isLoading) {
    return (
      <div className="py-4 text-center">
        <LoadingSpinner size="sm" />
      </div>
    );
  }

  if (!activities.length) {
    return <p className="py-2 text-sm text-muted-foreground">No recent activity.</p>;
  }

  return (
    <div className="space-y-2">
      {activities.map((activity) => (
        <div
          key={activity.id}
          className="flex items-start gap-2 text-sm"
        >
          <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-muted-foreground">{activity.title}</p>
            <p className="text-xs text-muted-foreground">
              {formatDateTime(activity.createdAt)}
            </p>
          </div>
          <Badge variant="neutral">{activity.activityType}</Badge>
        </div>
      ))}
    </div>
  );
}
