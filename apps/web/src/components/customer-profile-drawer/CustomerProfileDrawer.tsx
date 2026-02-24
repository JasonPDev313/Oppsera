'use client';

import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, ExternalLink, Mail, Phone, Wallet, Star, MapPin } from 'lucide-react';
import { useProfileDrawer } from './ProfileDrawerContext';
import { useCustomerProfile } from '@/hooks/use-customers';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { ProfileOverviewTab } from './ProfileOverviewTab';
import { ProfileIdentityTab } from './ProfileIdentityTab';
import { ProfileActivityTab } from './ProfileActivityTab';
import { ProfileFinancialTab } from './ProfileFinancialTab';
import { ProfileMembershipTab } from './ProfileMembershipTab';
import { ProfilePreferencesTab } from './ProfilePreferencesTab';
import { ProfileNotesTab } from './ProfileNotesTab';
import { ProfileDocumentsTab } from './ProfileDocumentsTab';
import { ProfileCommunicationsTab } from './ProfileCommunicationsTab';
import { ProfileTagsTab } from './ProfileTagsTab';
import { ProfileComplianceTab } from './ProfileComplianceTab';
import { ProfilePaymentMethodsTab } from './ProfilePaymentMethodsTab';
import type { CustomerProfileOverview } from '@/types/customers';

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'profile', label: 'Profile' },
  { key: 'activity', label: 'Activity' },
  { key: 'financial', label: 'Financial' },
  { key: 'payments', label: 'Payments' },
  { key: 'membership', label: 'Membership' },
  { key: 'preferences', label: 'Preferences' },
  { key: 'notes', label: 'Notes' },
  { key: 'files', label: 'Files' },
  { key: 'comms', label: 'Comms' },
  { key: 'tags', label: 'Tags' },
  { key: 'compliance', label: 'Compliance' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function formatCurrency(cents: number): string {
  return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
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

// ── Header Hero Card ──────────────────────────────────────────────

function DrawerHeader({
  customerId,
  profile,
  close,
}: {
  customerId: string | null;
  profile: CustomerProfileOverview | null;
  close: () => void;
}) {
  const customer = profile?.customer ?? null;
  const profileImageUrl = customer?.metadata?.profileImageUrl as string | undefined;

  // Extract primary contact info from profile contacts
  const primaryEmail = profile?.contacts?.find((c) => c.contactType === 'email' && c.isPrimary)
    ?? profile?.contacts?.find((c) => c.contactType === 'email');
  const primaryPhone = profile?.contacts?.find((c) => c.contactType === 'phone' && c.isPrimary)
    ?? profile?.contacts?.find((c) => c.contactType === 'phone');
  const primaryAddress = profile?.contacts?.find((c) => c.contactType === 'address' && c.isPrimary)
    ?? profile?.contacts?.find((c) => c.contactType === 'address');

  // Find member number from identifiers
  const memberIdentifier = profile?.identifiers?.find(
    (id) => id.isActive && (id.type === 'member_number' || id.type === 'member_id'),
  );

  const walletBalance = (customer?.metadata?.walletBalanceCents as number) ?? 0;
  const loyaltyTier = customer?.metadata?.loyaltyTier as string | undefined;

  return (
    <div className="shrink-0 border-b border-gray-200 px-6 py-4">
      {/* Row 1: Avatar + Name + Actions */}
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-4">
          {/* Avatar */}
          {customer ? (
            profileImageUrl ? (
              <img
                src={profileImageUrl}
                alt={customer.displayName}
                className="h-14 w-14 shrink-0 rounded-full object-cover ring-2 ring-indigo-100"
              />
            ) : (
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-base font-semibold text-indigo-700 ring-2 ring-indigo-50">
                {getInitials(customer.displayName)}
              </div>
            )
          ) : (
            <div className="h-14 w-14 shrink-0 animate-pulse rounded-full bg-gray-200" />
          )}

          {/* Name + Meta */}
          <div className="min-w-0">
            {customer ? (
              <>
                <h2 className="text-lg font-semibold leading-tight text-gray-900">
                  {customer.displayName}
                </h2>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  {memberIdentifier && (
                    <span className="text-xs font-medium text-gray-500">
                      #{memberIdentifier.value}
                    </span>
                  )}
                  {memberIdentifier && profile?.memberships?.active && (
                    <span className="text-gray-300">&middot;</span>
                  )}
                  {profile?.memberships?.active && (
                    <Badge variant="indigo">
                      {profile.memberships.active.planName}
                    </Badge>
                  )}
                  {customer.taxExempt && (
                    <Badge variant="purple">Tax Exempt</Badge>
                  )}
                  {profile?.currentVisit && (
                    <Badge variant="success">Checked In</Badge>
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="h-5 w-40 animate-pulse rounded bg-gray-200" />
                <div className="mt-2 h-4 w-24 animate-pulse rounded bg-gray-100" />
              </>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex shrink-0 items-center gap-1">
          {customerId && (
            <a
              href={`/customers/${customerId}`}
              className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
              title="Open full profile"
            >
              <ExternalLink className="h-4 w-4" />
            </a>
          )}
          <button
            type="button"
            onClick={close}
            className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Row 2: Contact details + balance (only when loaded) */}
      {customer && (
        <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs text-gray-600">
          {/* Email */}
          {(primaryEmail || customer.email) && (
            <a
              href={`mailto:${primaryEmail?.value ?? customer.email}`}
              className="flex items-center gap-1.5 truncate hover:text-indigo-600"
            >
              <Mail className="h-3.5 w-3.5 shrink-0 text-gray-400" />
              <span className="truncate">{primaryEmail?.value ?? customer.email}</span>
            </a>
          )}

          {/* Phone */}
          {(primaryPhone || customer.phone) && (
            <a
              href={`tel:${primaryPhone?.value ?? customer.phone}`}
              className="flex items-center gap-1.5 truncate hover:text-indigo-600"
            >
              <Phone className="h-3.5 w-3.5 shrink-0 text-gray-400" />
              <span className="truncate">{formatPhone(primaryPhone?.value ?? customer.phone ?? '')}</span>
            </a>
          )}

          {/* Address */}
          {primaryAddress && (
            <div className="col-span-2 flex items-center gap-1.5 truncate">
              <MapPin className="h-3.5 w-3.5 shrink-0 text-gray-400" />
              <span className="truncate">{primaryAddress.value}</span>
            </div>
          )}

          {/* Wallet balance */}
          {walletBalance > 0 && (
            <div className="flex items-center gap-1.5">
              <Wallet className="h-3.5 w-3.5 shrink-0 text-gray-400" />
              <span className="font-medium text-gray-900">
                Balance: {formatCurrency(walletBalance)}
              </span>
            </div>
          )}

          {/* Loyalty tier */}
          {loyaltyTier && (
            <div className="flex items-center gap-1.5">
              <Star className="h-3.5 w-3.5 shrink-0 text-amber-400" />
              <span className="font-medium text-gray-900">{loyaltyTier}</span>
            </div>
          )}
        </div>
      )}

      {/* Row 3: Tags (first 3) */}
      {customer && customer.tags.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1">
          {customer.tags.slice(0, 3).map((tag) => (
            <Badge key={tag} variant="neutral">{tag}</Badge>
          ))}
          {customer.tags.length > 3 && (
            <span className="text-xs text-gray-400">+{customer.tags.length - 3} more</span>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Drawer ──────────────────────────────────────────────────

export function CustomerProfileDrawer() {
  const { state, close } = useProfileDrawer();
  const { isOpen, customerId, initialTab } = state;
  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [isVisible, setIsVisible] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);

  const { data: profile, isLoading, error, mutate } = useCustomerProfile(
    isOpen ? customerId : null,
  );

  // Handle initial tab from context
  useEffect(() => {
    if (initialTab && TABS.some((t) => t.key === initialTab)) {
      setActiveTab(initialTab as TabKey);
    } else if (isOpen) {
      setActiveTab('overview');
    }
  }, [initialTab, isOpen, customerId]);

  // Handle slide-in animation
  useEffect(() => {
    if (isOpen) {
      setIsVisible(true);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setIsAnimating(true);
        });
      });
    } else {
      setIsAnimating(false);
      const timer = setTimeout(() => setIsVisible(false), 300);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Escape key handler
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    },
    [close],
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, handleKeyDown]);

  // Lock body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [isOpen]);

  if (!isVisible || typeof document === 'undefined') return null;

  const renderTabContent = () => {
    if (!customerId) return null;

    switch (activeTab) {
      case 'overview':
        return <ProfileOverviewTab customerId={customerId} profile={profile} onRefresh={mutate} />;
      case 'profile':
        return <ProfileIdentityTab customerId={customerId} />;
      case 'activity':
        return <ProfileActivityTab customerId={customerId} />;
      case 'financial':
        return <ProfileFinancialTab customerId={customerId} />;
      case 'payments':
        return <ProfilePaymentMethodsTab customerId={customerId} />;
      case 'membership':
        return <ProfileMembershipTab customerId={customerId} />;
      case 'preferences':
        return <ProfilePreferencesTab customerId={customerId} />;
      case 'notes':
        return <ProfileNotesTab customerId={customerId} />;
      case 'files':
        return <ProfileDocumentsTab customerId={customerId} />;
      case 'comms':
        return <ProfileCommunicationsTab customerId={customerId} />;
      case 'tags':
        return <ProfileTagsTab customerId={customerId} />;
      case 'compliance':
        return <ProfileComplianceTab customerId={customerId} />;
      default:
        return null;
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        className={`fixed inset-0 transition-opacity duration-300 ${
          isAnimating ? 'bg-black/30' : 'bg-black/0'
        }`}
        onClick={close}
      />

      {/* Drawer panel */}
      <div
        className={`relative flex h-full w-1/2 max-w-full flex-col bg-surface shadow-2xl transition-transform duration-300 ease-in-out ${
          isAnimating ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Hero Header */}
        <DrawerHeader customerId={customerId} profile={profile} close={close} />

        {/* Tab bar */}
        <div className="shrink-0 border-b border-gray-200">
          <nav className="flex overflow-x-auto px-6" aria-label="Profile tabs">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`shrink-0 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
                  activeTab === tab.key
                    ? 'border-indigo-600 text-indigo-600'
                    : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Content area */}
        <div className="flex-1 overflow-y-auto">
          {isLoading && activeTab === 'overview' ? (
            <div className="flex h-64 items-center justify-center">
              <LoadingSpinner label="Loading profile..." />
            </div>
          ) : error ? (
            <div className="p-6 text-center">
              <p className="text-sm text-red-600">
                Failed to load customer profile.
              </p>
              <button
                type="button"
                onClick={mutate}
                className="mt-2 text-sm font-medium text-indigo-600 hover:text-indigo-700"
              >
                Try again
              </button>
            </div>
          ) : (
            renderTabContent()
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
