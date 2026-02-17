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

  const { customer, contacts, identifiers, serviceFlags, activeAlerts, stats, household, memberships } = profile;

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
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
            Service Flags
          </h3>
          <div className="flex flex-wrap gap-2">
            {serviceFlags.map((flag) => (
              <Badge key={flag.id} variant={SEVERITY_STYLES[flag.severity]}>
                {flag.severity === 'critical' && (
                  <AlertTriangle className="mr-1 h-3 w-3" />
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
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
            Active Alerts
          </h3>
          <div className="space-y-2">
            {activeAlerts.map((alert) => (
              <div
                key={alert.id}
                className={`flex items-start gap-2 rounded-lg border p-3 text-sm ${
                  alert.severity === 'critical'
                    ? 'border-red-200 bg-red-50 text-red-800'
                    : alert.severity === 'warning'
                      ? 'border-amber-200 bg-amber-50 text-amber-800'
                      : 'border-blue-200 bg-blue-50 text-blue-800'
                }`}
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
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
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
            Personal Details
          </h3>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            {dob && (
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                <span className="text-gray-500">DOB</span>
                <span className="ml-auto text-gray-900">
                  {formatDate(dob)}
                  {calculateAge(dob) != null && (
                    <span className="ml-1 text-gray-500">({calculateAge(dob)})</span>
                  )}
                </span>
              </div>
            )}
            {gender && (
              <div className="flex items-center gap-2 text-sm">
                <User className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                <span className="text-gray-500">Gender</span>
                <span className="ml-auto capitalize text-gray-900">{gender}</span>
              </div>
            )}
            {anniversary && (
              <div className="flex items-center gap-2 text-sm">
                <Heart className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                <span className="text-gray-500">Anniversary</span>
                <span className="ml-auto text-gray-900">{formatDate(anniversary)}</span>
              </div>
            )}
            {preferredLanguage && (
              <div className="flex items-center gap-2 text-sm">
                <Globe className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                <span className="text-gray-500">Language</span>
                <span className="ml-auto text-gray-900">{preferredLanguage}</span>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ── Contact & Address ─────────────────────────────────────────── */}
      {hasContacts && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
            Contact
          </h3>
          <div className="space-y-1.5">
            {(primaryEmail || customer.email) && (
              <a
                href={`mailto:${primaryEmail?.value ?? customer.email}`}
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-gray-700 transition-colors hover:bg-indigo-50 hover:text-indigo-600"
              >
                <Mail className="h-4 w-4 shrink-0 text-gray-400" />
                <span className="truncate">{primaryEmail?.value ?? customer.email}</span>
                {primaryEmail?.isPrimary && (
                  <Badge variant="indigo">Primary</Badge>
                )}
              </a>
            )}
            {(primaryPhone || customer.phone) && (
              <a
                href={`tel:${primaryPhone?.value ?? customer.phone}`}
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-gray-700 transition-colors hover:bg-indigo-50 hover:text-indigo-600"
              >
                <Phone className="h-4 w-4 shrink-0 text-gray-400" />
                <span>{formatPhone(primaryPhone?.value ?? customer.phone ?? '')}</span>
                {primaryPhone?.isPrimary && (
                  <Badge variant="indigo">Primary</Badge>
                )}
              </a>
            )}
            {primaryAddress && (
              <div className="flex items-start gap-2 rounded-lg px-2 py-1.5 text-sm text-gray-700">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                <span>{primaryAddress.value}</span>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ── Identifiers ───────────────────────────────────────────────── */}
      {activeIdentifiers.length > 0 && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
            Identifiers
          </h3>
          <div className="flex flex-wrap gap-2">
            {activeIdentifiers.map((id) => (
              <div
                key={id.id}
                className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm"
              >
                <CreditCard className="h-3.5 w-3.5 text-gray-400" />
                <span className="font-medium text-gray-900">{id.value}</span>
                <span className="text-xs text-gray-500">{id.type.replace(/_/g, ' ')}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Stats Grid ────────────────────────────────────────────────── */}
      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
          Customer Stats
        </h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-gray-200 bg-surface p-3">
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <Calendar className="h-3.5 w-3.5" />
              Total Visits
            </div>
            <p className="mt-1 text-xl font-semibold text-gray-900">
              {stats.totalVisits.toLocaleString()}
            </p>
            {stats.lastVisitAt && (
              <p className="mt-0.5 text-xs text-gray-500">
                Last: {formatDate(stats.lastVisitAt)}
              </p>
            )}
          </div>
          <div className="rounded-lg border border-gray-200 bg-surface p-3">
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <DollarSign className="h-3.5 w-3.5" />
              Avg Spend
            </div>
            <p className="mt-1 text-xl font-semibold text-gray-900">
              {formatCurrency(stats.avgSpendCents)}
            </p>
            <p className="mt-0.5 text-xs text-gray-500">
              {stats.visitFrequency}
            </p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-surface p-3">
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <TrendingUp className="h-3.5 w-3.5" />
              Lifetime Value
            </div>
            <p className="mt-1 text-xl font-semibold text-gray-900">
              {formatCurrency(stats.lifetimeValueCents)}
            </p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-surface p-3">
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <CreditCard className="h-3.5 w-3.5" />
              Total Spend
            </div>
            <p className="mt-1 text-xl font-semibold text-gray-900">
              {formatCurrency(stats.totalSpendCents)}
            </p>
          </div>
        </div>
      </section>

      {/* ── Membership Card ───────────────────────────────────────────── */}
      {memberships?.active && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
            Membership
          </h3>
          <div className="flex items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 p-3">
            <CreditCard className="h-5 w-5 text-indigo-600" />
            <div>
              <p className="text-sm font-medium text-indigo-900">
                {memberships.active.planName}
              </p>
              <p className="text-xs text-indigo-700">
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
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
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
                        <span className="text-gray-700">{category}</span>
                        <span className="font-medium text-gray-900">
                          {formatCurrency(cents)}
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 w-full rounded-full bg-gray-100">
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
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
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
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
            Notes
          </h3>
          <div className="flex items-start gap-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
            <StickyNote className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
            <p className="text-sm italic text-gray-700 whitespace-pre-line">{customer.notes}</p>
          </div>
        </section>
      )}

      {/* ── Recent Activity ───────────────────────────────────────────── */}
      {customer && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
            Recent Activity
          </h3>
          <RecentActivity customerId={customerId} />
        </section>
      )}

      {/* ── Tags ──────────────────────────────────────────────────────── */}
      {customer.tags.length > 0 && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
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
    return <p className="py-2 text-sm text-gray-500">No recent activity.</p>;
  }

  return (
    <div className="space-y-2">
      {activities.map((activity) => (
        <div
          key={activity.id}
          className="flex items-start gap-2 text-sm"
        >
          <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400" />
          <div className="min-w-0 flex-1">
            <p className="text-gray-700">{activity.title}</p>
            <p className="text-xs text-gray-500">
              {formatDateTime(activity.createdAt)}
            </p>
          </div>
          <Badge variant="neutral">{activity.activityType}</Badge>
        </div>
      ))}
    </div>
  );
}
