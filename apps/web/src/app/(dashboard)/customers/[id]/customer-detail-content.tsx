'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import {
  ArrowLeft,
  Mail,
  Phone,
  DollarSign,
  CreditCard,
  MessageSquare,
  FileText,
  Plus,
  Crown,
  Star,
  Hash,
  Flag,
  User,
  Users,
  Activity,
  Settings,
  Shield,
  BookOpen,
  ClipboardList,
  Wallet,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast';
import { apiFetch } from '@/lib/api-client';
import type { CustomerHeaderData } from '@/types/customer-360';

// ── Lazy-loaded tab components ──────────────────────────────────────
const Overview360Tab = dynamic(
  () => import('@/components/customer-360/Overview360Tab'),
  { loading: () => <TabSkeleton /> },
);
const ContactIdentityTab = dynamic(
  () => import('@/components/customer-360/ContactIdentityTab'),
  { loading: () => <TabSkeleton /> },
);
const FinancialTab = dynamic(
  () => import('@/components/customer-360/FinancialTab'),
  { loading: () => <TabSkeleton /> },
);
const ActivityTab = dynamic(
  () => import('@/components/customer-360/ActivityTab'),
  { loading: () => <TabSkeleton /> },
);
const CommunicationTab = dynamic(
  () => import('@/components/customer-360/CommunicationTab'),
  { loading: () => <TabSkeleton /> },
);
const RelationshipsTab = dynamic(
  () => import('@/components/customer-360/RelationshipsTab'),
  { loading: () => <TabSkeleton /> },
);
const DocumentsTab = dynamic(
  () => import('@/components/customer-360/DocumentsTab'),
  { loading: () => <TabSkeleton /> },
);
const StoredValueTab = dynamic(
  () => import('@/components/customer-360/StoredValueTab'),
  { loading: () => <TabSkeleton /> },
);
const PrivilegesTab = dynamic(
  () => import('@/components/customer-360/PrivilegesTab'),
  { loading: () => <TabSkeleton /> },
);
const SettingsTab = dynamic(
  () => import('@/components/customer-360/SettingsTab'),
  { loading: () => <TabSkeleton /> },
);
const MembershipTab = dynamic(
  () => import('@/components/customer-360/MembershipTab'),
  { loading: () => <TabSkeleton /> },
);

// Placeholder tabs — render skeleton until future sessions implement them
function PlaceholderTab({ label }: { label: string }) {
  return (
    <div className="flex h-64 flex-col items-center justify-center gap-2 text-gray-400">
      <Settings className="h-8 w-8 animate-pulse" />
      <p className="text-sm">{label} — coming soon</p>
    </div>
  );
}

function TabSkeleton() {
  return (
    <div className="space-y-4 p-6">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="h-20 animate-pulse rounded-lg bg-gray-100" />
      ))}
    </div>
  );
}

// ── Tab definitions ─────────────────────────────────────────────────
const TABS = [
  { key: 'overview', label: 'Overview', icon: Activity },
  { key: 'contact', label: 'Contact & Identity', icon: User },
  { key: 'financial', label: 'Financial', icon: DollarSign },
  { key: 'stored_value', label: 'Stored Value', icon: Wallet },
  { key: 'membership', label: 'Membership', icon: Crown },
  { key: 'activity', label: 'Activity', icon: ClipboardList },
  { key: 'communication', label: 'Communication', icon: MessageSquare },
  { key: 'relationships', label: 'Relationships', icon: Users },
  { key: 'documents', label: 'Documents', icon: FileText },
  { key: 'privileges', label: 'Privileges', icon: Shield },
  { key: 'settings', label: 'Settings', icon: Settings },
] as const;

type TabKey = (typeof TABS)[number]['key'];

// ── Helpers ─────────────────────────────────────────────────────────
function formatMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatMoneyDollars(dollars: number): string {
  return dollars.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10)
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  if (digits.length === 11 && digits[0] === '1')
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  return phone;
}

const FLAG_COLORS: Record<string, string> = {
  critical: 'bg-red-100 text-red-800',
  high: 'bg-orange-100 text-orange-800',
  medium: 'bg-yellow-100 text-yellow-800',
  low: 'bg-blue-100 text-blue-800',
};

// ── Customer Header Component ───────────────────────────────────────
function CustomerProfileHeader({
  header,
  isLoading,
}: {
  header: CustomerHeaderData | null;
  isLoading: boolean;
}) {
  if (isLoading || !header) {
    return (
      <div className="border-b border-gray-200 bg-surface px-6 py-4">
        <div className="flex items-center gap-4">
          <div className="h-16 w-16 animate-pulse rounded-full bg-gray-200" />
          <div className="space-y-2">
            <div className="h-6 w-48 animate-pulse rounded bg-gray-200" />
            <div className="h-4 w-32 animate-pulse rounded bg-gray-100" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="border-b border-gray-200 bg-surface px-6 py-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        {/* Left: Avatar + Identity */}
        <div className="flex items-start gap-4">
          {header.profileImageUrl ? (
            <img
              src={header.profileImageUrl}
              alt={header.displayName}
              className="h-16 w-16 shrink-0 rounded-full object-cover ring-2 ring-indigo-100"
            />
          ) : (
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-lg font-semibold text-indigo-700 ring-2 ring-indigo-50">
              {getInitials(header.displayName)}
            </div>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-gray-900">
                {header.displayName}
              </h1>
              {header.memberNumber && (
                <span className="flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
                  <Hash className="h-3 w-3" />
                  {header.memberNumber}
                </span>
              )}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <Badge variant={header.status === 'active' ? 'success' : 'neutral'}>
                {header.status}
              </Badge>
              {header.activeMembership && (
                <Badge variant="indigo">
                  <Crown className="mr-1 h-3 w-3" />
                  {header.activeMembership.planName}
                </Badge>
              )}
              {header.taxExempt && <Badge variant="purple">Tax Exempt</Badge>}
              {header.loyaltyTier && (
                <Badge variant="warning">
                  <Star className="mr-1 h-3 w-3" />
                  {header.loyaltyTier}
                </Badge>
              )}
              {header.ghinNumber && (
                <span className="text-xs text-gray-500">
                  GHIN: {header.ghinNumber}
                </span>
              )}
            </div>
            {/* Contact pills */}
            <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-gray-600">
              {header.primaryEmail && (
                <a
                  href={`mailto:${header.primaryEmail}`}
                  className="flex items-center gap-1 hover:text-indigo-600"
                >
                  <Mail className="h-3.5 w-3.5 text-gray-400" />
                  <span className="max-w-50 truncate">
                    {header.primaryEmail}
                  </span>
                </a>
              )}
              {header.primaryPhone && (
                <a
                  href={`tel:${header.primaryPhone}`}
                  className="flex items-center gap-1 hover:text-indigo-600"
                >
                  <Phone className="h-3.5 w-3.5 text-gray-400" />
                  {header.primaryPhoneDisplay || formatPhone(header.primaryPhone)}
                </a>
              )}
            </div>
          </div>
        </div>

        {/* Right: Financial mini + flags */}
        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-4 text-sm">
            <div className="text-right">
              <div className="text-xs text-gray-500">Balance</div>
              <div
                className={`font-semibold ${header.outstandingBalance > 0 ? 'text-red-600' : 'text-gray-900'}`}
              >
                {formatMoneyDollars(header.outstandingBalance)}
              </div>
            </div>
            {header.creditLimit > 0 && (
              <div className="text-right">
                <div className="text-xs text-gray-500">Credit</div>
                <div className="font-semibold text-gray-900">
                  {formatMoneyDollars(header.creditLimit)}
                </div>
              </div>
            )}
            <div className="text-right">
              <div className="text-xs text-gray-500">Lifetime</div>
              <div className="font-semibold text-gray-900">
                {formatMoney(header.totalSpend)}
              </div>
            </div>
          </div>
          {/* Flag pills */}
          {header.activeFlags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {header.activeFlags.map((flag) => (
                <span
                  key={flag.id}
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${FLAG_COLORS[flag.severity] || FLAG_COLORS.low}`}
                >
                  <Flag className="h-3 w-3" />
                  {flag.flagType.replace(/_/g, ' ')}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Quick Actions Bar ───────────────────────────────────────────────
function QuickActionsBar({ customerId }: { customerId: string }) {
  const { toast } = useToast();
  const router = useRouter();

  const actions = [
    {
      label: 'Add Note',
      icon: Plus,
      onClick: () => toast.info('Add Note — coming in Session 3'),
    },
    {
      label: 'Send Message',
      icon: MessageSquare,
      onClick: () => toast.info('Send Message — coming in Session 3'),
    },
    {
      label: 'View Ledger',
      icon: BookOpen,
      onClick: () => router.push(`/customers/${customerId}?tab=financial`),
    },
  ];

  return (
    <div className="flex items-center gap-2 border-b border-gray-200 bg-surface px-6 py-2">
      {actions.map((action) => (
        <button
          key={action.label}
          type="button"
          onClick={action.onClick}
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900"
        >
          <action.icon className="h-4 w-4" />
          {action.label}
        </button>
      ))}
    </div>
  );
}

// ── Main Content ────────────────────────────────────────────────────
export default function CustomerDetailContent() {
  const params = useParams();
  const router = useRouter();
  const customerId = params.id as string;
  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [header, setHeader] = useState<CustomerHeaderData | null>(null);
  const [headerLoading, setHeaderLoading] = useState(true);

  // Fetch header data
  const fetchHeader = useCallback(async () => {
    if (!customerId) return;
    setHeaderLoading(true);
    try {
      const res = await apiFetch<{ data: CustomerHeaderData }>(`/api/v1/customers/${customerId}/header`);
      setHeader(res.data);
    } catch {
      // Header fetch failure is non-fatal — tabs still work
    } finally {
      setHeaderLoading(false);
    }
  }, [customerId]);

  // Fetch on mount
  useEffect(() => {
    fetchHeader();
  }, [fetchHeader]);

  const renderTabContent = () => {
    switch (activeTab) {
      case 'overview':
        return <Overview360Tab customerId={customerId} />;
      case 'contact':
        return <ContactIdentityTab customerId={customerId} />;
      case 'financial':
        return <FinancialTab customerId={customerId} />;
      case 'stored_value':
        return <StoredValueTab customerId={customerId} />;
      case 'membership':
        return <MembershipTab customerId={customerId} />;
      case 'activity':
        return <ActivityTab customerId={customerId} />;
      case 'communication':
        return <CommunicationTab customerId={customerId} />;
      case 'relationships':
        return <RelationshipsTab customerId={customerId} />;
      case 'documents':
        return <DocumentsTab customerId={customerId} />;
      case 'privileges':
        return <PrivilegesTab customerId={customerId} />;
      case 'settings':
        return <SettingsTab customerId={customerId} />;
      default:
        return null;
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* Back button */}
      <div className="flex items-center gap-2 border-b border-gray-200 bg-surface px-6 py-2">
        <button
          type="button"
          onClick={() => router.push('/customers')}
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-700"
        >
          <ArrowLeft className="h-4 w-4" />
          Customers
        </button>
      </div>

      {/* Header */}
      <CustomerProfileHeader header={header} isLoading={headerLoading} />

      {/* Quick Actions */}
      <QuickActionsBar customerId={customerId} />

      {/* Tab Navigation */}
      <div className="shrink-0 border-b border-gray-200 bg-surface">
        <nav className="flex overflow-x-auto px-6" aria-label="Profile tabs">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
                  activeTab === tab.key
                    ? 'border-indigo-600 text-indigo-600'
                    : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                }`}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto">{renderTabContent()}</div>
    </div>
  );
}
