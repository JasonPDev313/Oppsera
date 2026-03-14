'use client';

import {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  Component,
  type ReactNode,
  type ErrorInfo,
} from 'react';
import { createPortal } from 'react-dom';
import dynamic from 'next/dynamic';
import {
  X,
  ExternalLink,
  Mail,
  Phone,
  Star,
  Hash,
  Flag,
  Crown,
  Activity,
  User,
  DollarSign,
  MessageSquare,
  Settings,
  Calendar,
  AlertTriangle,
  RefreshCw,
  type LucideIcon,
} from 'lucide-react';
import { useProfileDrawer } from './ProfileDrawerContext';
import { useCustomerHeader } from '@/hooks/use-customer-360';
import { getInitials, formatPhone, formatCents, formatDollarsLocale } from '@oppsera/shared';
import { Badge } from '@/components/ui/badge';
import type { CustomerHeaderData } from '@/types/customer-360';

// ── Lazy-loaded customer-360 tab components ───────────────────────
const Overview360Tab = dynamic(
  () => import('@/components/customer-360/Overview360Tab'),
  { ssr: false, loading: () => <TabSkeleton /> },
);
const ContactIdentityTab = dynamic(
  () => import('@/components/customer-360/ContactIdentityTab'),
  { ssr: false, loading: () => <TabSkeleton /> },
);
const RelationshipsTab = dynamic(
  () => import('@/components/customer-360/RelationshipsTab'),
  { ssr: false, loading: () => <TabSkeleton /> },
);
const FinancialTab = dynamic(
  () => import('@/components/customer-360/FinancialTab'),
  { ssr: false, loading: () => <TabSkeleton /> },
);
const StoredValueTab = dynamic(
  () => import('@/components/customer-360/StoredValueTab'),
  { ssr: false, loading: () => <TabSkeleton /> },
);
const PrivilegesTab = dynamic(
  () => import('@/components/customer-360/PrivilegesTab'),
  { ssr: false, loading: () => <TabSkeleton /> },
);
const MembershipTab = dynamic(
  () => import('@/components/customer-360/MembershipTab'),
  { ssr: false, loading: () => <TabSkeleton /> },
);
const ActivityTab = dynamic(
  () => import('@/components/customer-360/ActivityTab'),
  { ssr: false, loading: () => <TabSkeleton /> },
);
const OrdersTab = dynamic(
  () => import('@/components/customer-360/OrdersTab'),
  { ssr: false, loading: () => <TabSkeleton /> },
);
const ReservationsTab = dynamic(
  () => import('@/components/customer-360/ReservationsTab'),
  { ssr: false, loading: () => <TabSkeleton /> },
);
const CommunicationTab = dynamic(
  () => import('@/components/customer-360/CommunicationTab'),
  { ssr: false, loading: () => <TabSkeleton /> },
);
const DocumentsTab = dynamic(
  () => import('@/components/customer-360/DocumentsTab'),
  { ssr: false, loading: () => <TabSkeleton /> },
);
const SettingsTab = dynamic(
  () => import('@/components/customer-360/SettingsTab'),
  { ssr: false, loading: () => <TabSkeleton /> },
);

function TabSkeleton() {
  return (
    <div className="space-y-4 p-5">
      {[...Array(3)].map((_, i) => (
        <div key={i} className="h-16 animate-pulse rounded-lg bg-muted" />
      ))}
    </div>
  );
}

// ── Error Boundary ───────────────────────────────────────────────

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Changing this key resets the boundary */
  resetKey: string;
  onRetry?: () => void;
}

interface ErrorBoundaryState {
  error: Error | null;
}

class TabErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[CustomerProfileDrawer] Tab render error:', error, info.componentStack);
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col items-center justify-center gap-3 p-8 text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-500/10">
            <AlertTriangle className="h-5 w-5 text-red-500" aria-hidden="true" />
          </div>
          <p className="text-sm font-medium text-foreground">Something went wrong</p>
          <p className="max-w-xs text-xs text-muted-foreground">
            {this.state.error.message || 'An unexpected error occurred while loading this section.'}
          </p>
          <button
            type="button"
            onClick={() => {
              this.setState({ error: null });
              this.props.onRetry?.();
            }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-500/10 px-3 py-1.5 text-xs font-medium text-indigo-500 transition-colors hover:bg-indigo-500/20"
          >
            <RefreshCw className="h-3 w-3" aria-hidden="true" />
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ── Navigation structure ──────────────────────────────────────────

interface SubTab {
  key: string;
  label: string;
}

interface NavSection {
  key: string;
  label: string;
  icon: LucideIcon;
  subTabs: SubTab[];
}

const NAV_SECTIONS: NavSection[] = [
  {
    key: 'overview',
    label: 'Overview',
    icon: Activity,
    subTabs: [],
  },
  {
    key: 'profile',
    label: 'Profile',
    icon: User,
    subTabs: [
      { key: 'contact', label: 'Contact & Identity' },
      { key: 'relationships', label: 'Relationships' },
    ],
  },
  {
    key: 'financial',
    label: 'Financial',
    icon: DollarSign,
    subTabs: [
      { key: 'accounts', label: 'Accounts & Ledger' },
      { key: 'stored_value', label: 'Stored Value' },
      { key: 'privileges', label: 'Privileges' },
    ],
  },
  {
    key: 'membership',
    label: 'Membership',
    icon: Crown,
    subTabs: [],
  },
  {
    key: 'activity',
    label: 'Activity',
    icon: Calendar,
    subTabs: [
      { key: 'timeline', label: 'Timeline' },
      { key: 'orders', label: 'Orders' },
      { key: 'reservations', label: 'Reservations' },
    ],
  },
  {
    key: 'communication',
    label: 'Comms',
    icon: MessageSquare,
    subTabs: [
      { key: 'messages', label: 'Messages' },
      { key: 'documents', label: 'Documents' },
    ],
  },
  {
    key: 'settings',
    label: 'Settings',
    icon: Settings,
    subTabs: [],
  },
];

type SectionKey = (typeof NAV_SECTIONS)[number]['key'];

const LEGACY_TAB_MAP: Record<string, { section: SectionKey; subTab?: string }> = {
  overview: { section: 'overview' },
  contact: { section: 'profile', subTab: 'contact' },
  profile: { section: 'profile', subTab: 'contact' },
  relationships: { section: 'profile', subTab: 'relationships' },
  financial: { section: 'financial', subTab: 'accounts' },
  stored_value: { section: 'financial', subTab: 'stored_value' },
  privileges: { section: 'financial', subTab: 'privileges' },
  payments: { section: 'financial', subTab: 'accounts' },
  membership: { section: 'membership' },
  activity: { section: 'activity', subTab: 'timeline' },
  orders: { section: 'activity', subTab: 'orders' },
  reservations: { section: 'activity', subTab: 'reservations' },
  communication: { section: 'communication', subTab: 'messages' },
  comms: { section: 'communication', subTab: 'messages' },
  notes: { section: 'communication', subTab: 'messages' },
  documents: { section: 'communication', subTab: 'documents' },
  files: { section: 'communication', subTab: 'documents' },
  settings: { section: 'settings' },
  preferences: { section: 'settings' },
  compliance: { section: 'settings' },
  tags: { section: 'settings' },
};

// ── Helpers ───────────────────────────────────────────────────────

const formatMoney = formatCents;
const formatMoneyDollars = formatDollarsLocale;

const FLAG_COLORS: Record<string, string> = {
  critical: 'bg-red-500/20 text-red-500',
  high: 'bg-orange-500/20 text-orange-500',
  medium: 'bg-yellow-500/20 text-yellow-500',
  low: 'bg-blue-500/20 text-blue-500',
};

// Focusable element selector for focus trap
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// ── Compact Header ───────────────────────────────────────────────

function DrawerHeader({
  customerId,
  header,
  isLoading,
  close,
}: {
  customerId: string | null;
  header: CustomerHeaderData | null;
  isLoading: boolean;
  close: () => void;
}) {
  return (
    <div className="shrink-0 border-b border-border px-5 py-3.5">
      {/* Row 1: Avatar + Name + Actions */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          {/* Avatar */}
          {isLoading || !header ? (
            <div className="h-12 w-12 shrink-0 animate-pulse rounded-full bg-muted" />
          ) : header.profileImageUrl ? (
            <img
              src={header.profileImageUrl}
              alt={header.displayName}
              className="h-12 w-12 shrink-0 rounded-full object-cover ring-2 ring-indigo-500/20"
            />
          ) : (
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-indigo-500/20 text-sm font-semibold text-indigo-400 ring-2 ring-indigo-500/10">
              {getInitials(header.displayName)}
            </div>
          )}

          {/* Name + badges */}
          <div className="min-w-0 flex-1">
            {isLoading || !header ? (
              <>
                <div className="h-5 w-36 animate-pulse rounded bg-muted" />
                <div className="mt-1.5 h-4 w-24 animate-pulse rounded bg-muted" />
              </>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <h2 className="truncate text-base font-semibold leading-tight text-foreground">
                    {header.displayName}
                  </h2>
                  {header.memberNumber && (
                    <span className="flex shrink-0 items-center gap-0.5 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                      <Hash className="h-2.5 w-2.5" aria-hidden="true" />
                      {header.memberNumber}
                    </span>
                  )}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <Badge variant={header.status === 'active' ? 'success' : 'neutral'}>
                    {header.status}
                  </Badge>
                  {header.activeMembership && (
                    <Badge variant="indigo">
                      <Crown className="mr-1 h-3 w-3" aria-hidden="true" />
                      {header.activeMembership.planName}
                    </Badge>
                  )}
                  {header.taxExempt && <Badge variant="purple">Tax Exempt</Badge>}
                  {header.loyaltyTier && (
                    <Badge variant="warning">
                      <Star className="mr-1 h-3 w-3" aria-hidden="true" />
                      {header.loyaltyTier}
                    </Badge>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex shrink-0 items-center gap-0.5">
          {customerId && (
            <a
              href={`/customers/${customerId}`}
              className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              title="Open full profile"
              aria-label="Open full customer profile page"
            >
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
            </a>
          )}
          <button
            type="button"
            onClick={close}
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label="Close customer profile"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Row 2: Contact + Financial summary */}
      {header && (
        <div className="mt-2.5 flex items-center justify-between gap-4">
          {/* Contact pills */}
          <div className="flex items-center gap-3 text-xs text-muted-foreground min-w-0">
            {header.primaryEmail && (
              <a
                href={`mailto:${header.primaryEmail}`}
                className="flex items-center gap-1 truncate hover:text-indigo-500"
                aria-label={`Email ${header.primaryEmail}`}
              >
                <Mail className="h-3 w-3 shrink-0" aria-hidden="true" />
                <span className="truncate max-w-35">{header.primaryEmail}</span>
              </a>
            )}
            {header.primaryPhone && (
              <a
                href={`tel:${header.primaryPhone}`}
                className="flex items-center gap-1 hover:text-indigo-500"
                aria-label={`Call ${header.primaryPhoneDisplay || header.primaryPhone}`}
              >
                <Phone className="h-3 w-3 shrink-0" aria-hidden="true" />
                {header.primaryPhoneDisplay || formatPhone(header.primaryPhone)}
              </a>
            )}
          </div>

          {/* Financial mini */}
          <div className="flex shrink-0 items-center gap-3 text-xs">
            <div className="text-right">
              <span className="text-muted-foreground">Bal </span>
              <span className={`font-semibold ${header.outstandingBalance > 0 ? 'text-red-500' : 'text-foreground'}`}>
                {formatMoneyDollars(header.outstandingBalance)}
              </span>
            </div>
            {header.creditLimit > 0 && (
              <div className="text-right">
                <span className="text-muted-foreground">Credit </span>
                <span className="font-semibold text-foreground">
                  {formatMoneyDollars(header.creditLimit)}
                </span>
              </div>
            )}
            <div className="text-right">
              <span className="text-muted-foreground">LTV </span>
              <span className="font-semibold text-foreground">
                {formatMoney(header.totalSpend)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Row 3: Flags */}
      {header && header.activeFlags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1" role="list" aria-label="Active customer flags">
          {header.activeFlags.map((flag) => (
            <span
              key={flag.id}
              role="listitem"
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${FLAG_COLORS[flag.severity] || FLAG_COLORS.low}`}
            >
              <Flag className="h-2.5 w-2.5" aria-hidden="true" />
              {flag.flagType.replace(/_/g, ' ')}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Left Vertical Nav ────────────────────────────────────────────

function VerticalNav({
  activeSection,
  onSelect,
}: {
  activeSection: SectionKey;
  onSelect: (key: SectionKey) => void;
}) {
  return (
    <nav className="flex w-13 shrink-0 flex-col border-r border-border bg-surface py-1" aria-label="Profile sections">
      {NAV_SECTIONS.map((section) => {
        const Icon = section.icon;
        const isActive = activeSection === section.key;
        return (
          <button
            key={section.key}
            type="button"
            onClick={() => onSelect(section.key as SectionKey)}
            aria-current={isActive ? 'true' : undefined}
            className={`group relative mx-1 my-0.5 flex flex-col items-center gap-0.5 rounded-lg px-1 py-2 transition-colors ${
              isActive
                ? 'bg-indigo-500/15 text-indigo-500'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground'
            }`}
            title={section.label}
          >
            {isActive && (
              <div className="absolute left-0 top-1/2 h-5 w-0.75 -translate-y-1/2 rounded-r-full bg-indigo-500" />
            )}
            <Icon className="h-4 w-4" aria-hidden="true" />
            <span className="text-[9px] font-medium leading-none">{section.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

// ── Horizontal Sub-Tab Bar ───────────────────────────────────────

function SubTabBar({
  subTabs,
  activeSubTab,
  onSelect,
}: {
  subTabs: SubTab[];
  activeSubTab: string;
  onSelect: (key: string) => void;
}) {
  if (subTabs.length === 0) return null;

  return (
    <div className="shrink-0 border-b border-border bg-surface" role="tablist" aria-label="Sub-section tabs">
      <nav className="flex px-4">
        {subTabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={activeSubTab === tab.key}
            onClick={() => onSelect(tab.key)}
            className={`shrink-0 border-b-2 px-3 py-2 text-xs font-medium transition-colors ${
              activeSubTab === tab.key
                ? 'border-indigo-500 text-indigo-500'
                : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </nav>
    </div>
  );
}

// ── Tab Content Router ───────────────────────────────────────────

function TabContent({
  customerId,
  section,
  subTab,
}: {
  customerId: string;
  section: SectionKey;
  subTab: string;
}) {
  switch (section) {
    case 'overview':
      return <Overview360Tab customerId={customerId} />;

    case 'profile':
      switch (subTab) {
        case 'relationships':
          return <RelationshipsTab customerId={customerId} />;
        default:
          return <ContactIdentityTab customerId={customerId} />;
      }

    case 'financial':
      switch (subTab) {
        case 'stored_value':
          return <StoredValueTab customerId={customerId} />;
        case 'privileges':
          return <PrivilegesTab customerId={customerId} />;
        default:
          return <FinancialTab customerId={customerId} />;
      }

    case 'membership':
      return <MembershipTab customerId={customerId} />;

    case 'activity':
      switch (subTab) {
        case 'orders':
          return <OrdersTab customerId={customerId} />;
        case 'reservations':
          return <ReservationsTab customerId={customerId} />;
        default:
          return <ActivityTab customerId={customerId} />;
      }

    case 'communication':
      switch (subTab) {
        case 'documents':
          return <DocumentsTab customerId={customerId} />;
        default:
          return <CommunicationTab customerId={customerId} />;
      }

    case 'settings':
      return <SettingsTab customerId={customerId} />;

    default:
      return null;
  }
}

// ── Main Drawer ──────────────────────────────────────────────────

export function CustomerProfileDrawer() {
  const { state, close } = useProfileDrawer();
  const { isOpen, customerId, initialTab } = state;

  const [activeSection, setActiveSection] = useState<SectionKey>('overview');
  const [activeSubTabs, setActiveSubTabs] = useState<Record<string, string>>({});
  const [isVisible, setIsVisible] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [mounted, setMounted] = useState(false);

  const drawerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<Element | null>(null);
  const prevCustomerIdRef = useRef<string | null>(null);

  const { data: header, isLoading, error, mutate } = useCustomerHeader(
    isOpen ? customerId : null,
  );

  // SSR-safe mount detection
  useEffect(() => { setMounted(true); }, []);

  // Current section definition — NAV_SECTIONS is a non-empty const array
  const currentSection = useMemo(
    () => NAV_SECTIONS.find((s) => s.key === activeSection) ?? NAV_SECTIONS[0]!,
    [activeSection],
  );

  // Current active sub-tab for the active section
  const currentSubTab = useMemo(() => {
    if (currentSection.subTabs.length === 0) return '';
    return activeSubTabs[currentSection.key] ?? currentSection.subTabs[0]?.key ?? '';
  }, [currentSection, activeSubTabs]);

  // Error boundary reset key — changes when section/subtab/customer changes
  const errorBoundaryKey = `${customerId}-${activeSection}-${currentSubTab}`;

  // Reset state when customer changes (prevents stale sub-tabs from previous customer)
  useEffect(() => {
    if (customerId && customerId !== prevCustomerIdRef.current) {
      setActiveSubTabs({});
      prevCustomerIdRef.current = customerId;
    }
  }, [customerId]);

  // Handle initial tab from context (supports legacy tab keys)
  useEffect(() => {
    if (!isOpen) return;
    if (initialTab) {
      const mapped = LEGACY_TAB_MAP[initialTab];
      if (mapped) {
        setActiveSection(mapped.section as SectionKey);
        if (mapped.subTab) {
          setActiveSubTabs((prev) => ({ ...prev, [mapped.section]: mapped.subTab! }));
        }
        return;
      }
    }
    setActiveSection('overview');
  }, [initialTab, isOpen, customerId]);

  // Scroll to top on section / sub-tab change
  useEffect(() => {
    scrollRef.current?.scrollTo(0, 0);
  }, [activeSection, currentSubTab]);

  // Handle section change
  const handleSectionChange = useCallback((key: SectionKey) => {
    setActiveSection(key);
  }, []);

  // Handle sub-tab change
  const handleSubTabChange = useCallback(
    (key: string) => {
      setActiveSubTabs((prev) => ({ ...prev, [activeSection]: key }));
    },
    [activeSection],
  );

  // Slide animation + focus capture/restore
  useEffect(() => {
    if (isOpen) {
      // Capture the element that triggered the drawer so we can restore focus on close
      triggerRef.current = document.activeElement;
      setIsVisible(true);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setIsAnimating(true);
          // Move focus into the drawer after animation starts
          drawerRef.current?.focus();
        });
      });
    } else {
      setIsAnimating(false);
      const timer = setTimeout(() => {
        setIsVisible(false);
        // Restore focus to the element that opened the drawer
        if (triggerRef.current instanceof HTMLElement) {
          triggerRef.current.focus();
          triggerRef.current = null;
        }
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Focus trap — keep Tab cycling inside the drawer
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        close();
        return;
      }

      if (e.key === 'Tab' && drawerRef.current) {
        const focusable = drawerRef.current.querySelectorAll(FOCUSABLE);
        if (focusable.length === 0) return;
        const first = focusable[0] as HTMLElement;
        const last = focusable[focusable.length - 1] as HTMLElement;

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    },
    [close],
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, handleKeyDown]);

  // Lock body scroll — also cleans up on unmount
  useEffect(() => {
    if (isOpen) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [isOpen]);

  if (!mounted || !isVisible) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label="Customer profile">
      {/* Backdrop — pointer-events disabled during close animation to prevent click-through */}
      <div
        className={`fixed inset-0 transition-opacity duration-300 ${
          isAnimating ? 'bg-black/30' : 'pointer-events-none bg-black/0'
        }`}
        onClick={isAnimating ? close : undefined}
        aria-hidden="true"
      />

      {/* Drawer panel */}
      <div
        ref={drawerRef}
        tabIndex={-1}
        className={`relative flex h-full w-[56%] min-w-135 max-w-200 flex-col bg-surface shadow-2xl outline-none transition-transform duration-300 ease-in-out ${
          isAnimating ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <DrawerHeader
          customerId={customerId}
          header={header}
          isLoading={isLoading}
          close={close}
        />

        {/* Body: Left nav + Right content */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left vertical nav */}
          <VerticalNav
            activeSection={activeSection}
            onSelect={handleSectionChange}
          />

          {/* Right content area */}
          <div className="flex flex-1 flex-col overflow-hidden">
            {/* Horizontal sub-tab bar */}
            <SubTabBar
              subTabs={currentSection.subTabs}
              activeSubTab={currentSubTab}
              onSelect={handleSubTabChange}
            />

            {/* Scrollable content */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto" role="tabpanel">
              {error ? (
                <div className="flex flex-col items-center justify-center gap-3 p-8 text-center">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-500/10">
                    <AlertTriangle className="h-5 w-5 text-red-500" aria-hidden="true" />
                  </div>
                  <p className="text-sm font-medium text-foreground">
                    Failed to load customer profile
                  </p>
                  <button
                    type="button"
                    onClick={() => mutate()}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-500/10 px-3 py-1.5 text-xs font-medium text-indigo-500 transition-colors hover:bg-indigo-500/20"
                  >
                    <RefreshCw className="h-3 w-3" aria-hidden="true" />
                    Try again
                  </button>
                </div>
              ) : !customerId ? null : (
                <TabErrorBoundary resetKey={errorBoundaryKey}>
                  <TabContent
                    customerId={customerId}
                    section={activeSection}
                    subTab={currentSubTab}
                  />
                </TabErrorBoundary>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
