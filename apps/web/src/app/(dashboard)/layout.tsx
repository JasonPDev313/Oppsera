'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  Users,
  BarChart3,
  Settings,
  Menu,
  X,
  LogOut,
  ChevronDown,
  List,
  FolderTree,
  Receipt,
  UtensilsCrossed,
  ClipboardList,
  CreditCard,
  Crown,
  PanelLeftClose,
  PanelLeftOpen,
  Sun,
  Moon,
  CalendarDays,
  Clock,
  FileBarChart,
  LayoutGrid,
  Flag,
  PackageCheck,
  Truck,
  Sparkles,
  MessageSquare,
  Layers,
  History,
  Landmark,
  BookOpen,
  ArrowRightLeft,
  Building2,
  Scale,
  FileSpreadsheet,
  DollarSign,
  Lock,
  Wallet,
  Hotel,
  BedDouble,
  DoorOpen,
  ConciergeBell,
  Brush,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthContext } from '@/components/auth-provider';
import { EntitlementsProvider, useEntitlementsContext } from '@/components/entitlements-provider';
import { QueryProvider } from '@/components/query-provider';
import { useTheme } from '@/components/theme-provider';
import { ContextMenuProvider } from '@/components/context-menu-provider';
import { ProfileDrawerProvider, CustomerProfileDrawer } from '@/components/customer-profile-drawer';
import { ItemEditDrawerProvider } from '@/components/inventory/ItemEditDrawerContext';
import { ItemEditDrawer } from '@/components/inventory/ItemEditDrawer';
import { NavigationGuardProvider, useNavigationGuard } from '@/hooks/use-navigation-guard';
import { preloadPOSCatalog } from '@/hooks/use-catalog-for-pos';
import { apiFetch } from '@/lib/api-client';

const SIDEBAR_KEY = 'sidebar_collapsed';

interface SubNavItem {
  name: string;
  href: string;
  icon: typeof LayoutDashboard;
  moduleKey?: string;
}

interface NavItem {
  name: string;
  href: string;
  icon: typeof LayoutDashboard;
  moduleKey?: string;
  children?: SubNavItem[];
}

const navigation: NavItem[] = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Retail POS', href: '/pos/retail', icon: ShoppingCart, moduleKey: 'pos_retail' },
  { name: 'F&B POS', href: '/pos/fnb', icon: UtensilsCrossed, moduleKey: 'pos_restaurant' },
  {
    name: 'Inventory',
    href: '/catalog',
    icon: Package,
    moduleKey: 'catalog',
    children: [
      { name: 'Items', href: '/catalog', icon: List },
      { name: 'Hierarchy', href: '/catalog/hierarchy', icon: FolderTree },
      { name: 'Taxes', href: '/catalog/taxes', icon: Receipt },
      { name: 'Receiving', href: '/inventory/receiving', icon: PackageCheck },
      { name: 'Vendors', href: '/vendors', icon: Truck },
    ],
  },
  { name: 'Sales History', href: '/orders', icon: ClipboardList, moduleKey: 'pos_retail' },
  {
    name: 'Customers',
    href: '/customers',
    icon: Users,
    moduleKey: 'customers',
    children: [
      { name: 'All Customers', href: '/customers', icon: Users },
      { name: 'Memberships', href: '/customers/memberships', icon: Crown },
      { name: 'Billing', href: '/customers/billing', icon: CreditCard },
    ],
  },
  {
    name: 'Reports',
    href: '/reports',
    icon: BarChart3,
    moduleKey: 'reporting',
    children: [
      { name: 'Overview', href: '/reports', icon: BarChart3 },
      { name: 'Custom Reports', href: '/reports/custom', icon: FileBarChart },
      { name: 'Dashboards', href: '/dashboards', icon: LayoutGrid },
      { name: 'Golf Analytics', href: '/reports/golf', icon: Flag, moduleKey: 'golf_ops' },
    ],
  },
  {
    name: 'AI Insights',
    href: '/insights',
    icon: Sparkles,
    moduleKey: 'semantic',
    children: [
      { name: 'Chat', href: '/insights', icon: MessageSquare },
      { name: 'Lenses', href: '/insights/lenses', icon: Layers },
      { name: 'History', href: '/insights/history', icon: History },
    ],
  },
  {
    name: 'Property Mgmt',
    href: '/pms',
    icon: Hotel,
    moduleKey: 'pms',
    children: [
      { name: 'Calendar', href: '/pms/calendar', icon: CalendarDays },
      { name: 'Reservations', href: '/pms/reservations', icon: BedDouble },
      { name: 'Front Desk', href: '/pms/front-desk', icon: ConciergeBell },
      { name: 'Housekeeping', href: '/pms/housekeeping', icon: Brush },
      { name: 'Guests', href: '/pms/guests', icon: Users },
      { name: 'Rooms', href: '/pms/rooms', icon: DoorOpen },
      { name: 'Room Types', href: '/pms/room-types', icon: LayoutGrid },
      { name: 'Rate Plans', href: '/pms/rate-plans', icon: DollarSign },
    ],
  },
  {
    name: 'Accounting',
    href: '/accounting',
    icon: Landmark,
    moduleKey: 'accounting',
    children: [
      { name: 'Dashboard', href: '/accounting', icon: Landmark },
      { name: 'Chart of Accounts', href: '/accounting/accounts', icon: BookOpen },
      { name: 'Journal Entries', href: '/accounting/journals', icon: FileSpreadsheet },
      { name: 'GL Mappings', href: '/accounting/mappings', icon: ArrowRightLeft },
      { name: 'Bank Accounts', href: '/accounting/banks', icon: Building2 },
      { name: 'Reports', href: '/accounting/reports/trial-balance', icon: BarChart3 },
      { name: 'Statements', href: '/accounting/statements/profit-loss', icon: Scale },
      { name: 'AP Bills', href: '/ap/bills', icon: Receipt, moduleKey: 'ap' },
      { name: 'AP Payments', href: '/ap/payments', icon: DollarSign, moduleKey: 'ap' },
      { name: 'AR Invoices', href: '/ar/invoices', icon: Wallet, moduleKey: 'ar' },
      { name: 'AR Receipts', href: '/ar/receipts', icon: CreditCard, moduleKey: 'ar' },
      { name: 'Reconciliation', href: '/accounting/reconciliation', icon: ArrowRightLeft },
      { name: 'Period Close', href: '/accounting/close', icon: Lock },
    ],
  },
  {
    name: 'Settings',
    href: '/settings',
    icon: Settings,
    children: [
      { name: 'General', href: '/settings', icon: Settings },
      { name: 'Room Layouts', href: '/settings/room-layouts', icon: LayoutDashboard, moduleKey: 'room_layouts' },
    ],
  },
];

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function useLiveClock(): { time: string; date: string } {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!now) return { time: '', date: '' };

  return {
    time: now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true }),
    date: now.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' }),
  };
}

/** Isolated clock display — updates every second without re-rendering the parent layout. */
function LiveClockDisplay() {
  const clock = useLiveClock();
  return (
    <>
      <div className="hidden items-center gap-1.5 md:flex">
        <CalendarDays className="h-4 w-4 text-gray-400" />
        <span className="text-sm font-medium text-gray-600">{clock.date}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <Clock className="h-4 w-4 text-gray-400" />
        <span className="text-sm font-medium tabular-nums text-gray-600">{clock.time}</span>
      </div>
    </>
  );
}

function SidebarActions({
  collapsed,
  onToggleCollapse,
}: {
  collapsed?: boolean;
  onToggleCollapse: () => void;
}) {
  const { theme, toggleTheme } = useTheme();
  return (
    <div className={`border-t border-gray-200 ${collapsed ? 'space-y-1 px-2 py-3' : 'space-y-1 px-3 py-3'}`}>
      <button
        type="button"
        onClick={toggleTheme}
        className={`flex w-full items-center rounded-lg text-sm font-medium text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 ${
          collapsed ? 'justify-center px-2 py-2' : 'gap-3 px-3 py-2'
        }`}
        title={collapsed ? (theme === 'dark' ? 'Light mode' : 'Dark mode') : undefined}
      >
        {theme === 'dark' ? (
          <>
            <Sun className="h-5 w-5 shrink-0" />
            {!collapsed && 'Light Mode'}
          </>
        ) : (
          <>
            <Moon className="h-5 w-5 shrink-0" />
            {!collapsed && 'Dark Mode'}
          </>
        )}
      </button>
      <button
        type="button"
        onClick={onToggleCollapse}
        className={`flex w-full items-center rounded-lg text-sm font-medium text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 ${
          collapsed ? 'justify-center px-2 py-2' : 'gap-3 px-3 py-2'
        }`}
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {collapsed ? (
          <PanelLeftOpen className="h-5 w-5 shrink-0" />
        ) : (
          <>
            <PanelLeftClose className="h-5 w-5 shrink-0" />
            Collapse
          </>
        )}
      </button>
    </div>
  );
}

function SidebarContent({
  pathname,
  onLinkClick,
  userName,
  userEmail,
  onLogout,
  isModuleEnabled,
  collapsed,
  onToggleCollapse,
}: {
  pathname: string;
  onLinkClick?: (e: React.MouseEvent) => void;
  userName: string;
  userEmail: string;
  onLogout: () => void;
  isModuleEnabled: (key: string) => boolean;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}) {
  return (
    <div className="flex h-full flex-col">
      {/* Logo */}
      <div className={`flex h-16 shrink-0 items-center border-b border-gray-200 ${collapsed ? 'justify-center px-2' : 'px-6'}`}>
        <Link href="/dashboard" className="flex items-center gap-2" onClick={onLinkClick}>
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-600">
            <span className="text-sm font-bold text-white">O</span>
          </div>
          {!collapsed && <span className="text-lg font-bold text-gray-900">OppsEra</span>}
        </Link>
      </div>

      {/* Navigation */}
      <nav className={`flex-1 space-y-1 py-4 ${collapsed ? 'px-2' : 'px-3'}`}>
        {navigation.map((item) => {
          const enabled = !item.moduleKey || isModuleEnabled(item.moduleKey);
          const isParentActive =
            item.href === '/dashboard'
              ? pathname === '/dashboard'
              : pathname.startsWith(item.href) ||
                (item.children?.some((child) => pathname.startsWith(child.href)) ?? false);

          if (!enabled) {
            return null;
          }

          if (item.children) {
            return (
              <div key={item.name} className={collapsed ? 'group/nav relative' : ''}>
                <Link
                  href={item.href}
                  onClick={onLinkClick}
                  title={collapsed ? item.name : undefined}
                  className={`group flex w-full items-center rounded-lg text-sm font-medium transition-colors ${
                    collapsed ? 'justify-center px-2 py-2.5' : 'gap-3 px-3 py-2.5'
                  } ${
                    isParentActive
                      ? 'bg-indigo-50 text-indigo-600'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                  }`}
                >
                  <item.icon
                    className={`h-5 w-5 shrink-0 ${
                      isParentActive ? 'text-indigo-600' : 'text-gray-400 group-hover:text-gray-600'
                    }`}
                  />
                  {!collapsed && (
                    <>
                      {item.name}
                      <ChevronDown
                        className={`ml-auto h-4 w-4 shrink-0 transition-transform ${
                          isParentActive ? 'rotate-180 text-indigo-600' : 'text-gray-400'
                        }`}
                      />
                    </>
                  )}
                </Link>
                {/* Expanded: inline children */}
                {isParentActive && !collapsed && (
                  <div className="ml-6 mt-1 space-y-1 border-l border-gray-200 pl-3">
                    {item.children.filter((child) => !child.moduleKey || isModuleEnabled(child.moduleKey)).map((child) => {
                      const isChildActive =
                        child.href === '/catalog'
                          ? pathname === '/catalog' || pathname.startsWith('/catalog/items')
                          : pathname.startsWith(child.href);
                      return (
                        <Link
                          key={child.href}
                          href={child.href}
                          onClick={onLinkClick}
                          className={`group flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                            isChildActive
                              ? 'text-indigo-600'
                              : 'text-gray-500 hover:text-gray-900'
                          }`}
                        >
                          <child.icon className={`h-4 w-4 shrink-0 ${isChildActive ? 'text-indigo-600' : 'text-gray-400'}`} />
                          {child.name}
                        </Link>
                      );
                    })}
                  </div>
                )}
                {/* Collapsed: hover flyout — pl-3 creates invisible bridge so mouse can cross the gap */}
                {collapsed && (
                  <div className="absolute left-full top-0 z-50 hidden pl-3 group-hover/nav:block">
                    <div className="min-w-44 rounded-lg border border-gray-200 bg-surface py-1.5 shadow-lg">
                      <p className="px-3 py-1.5 text-xs font-semibold text-gray-400 uppercase">{item.name}</p>
                      {item.children.filter((child) => !child.moduleKey || isModuleEnabled(child.moduleKey)).map((child) => {
                        const isChildActive =
                          child.href === '/catalog'
                            ? pathname === '/catalog' || pathname.startsWith('/catalog/items')
                            : pathname.startsWith(child.href);
                        return (
                          <Link
                            key={child.href}
                            href={child.href}
                            onClick={onLinkClick}
                            className={`flex items-center gap-2 px-3 py-2 text-sm font-medium transition-colors ${
                              isChildActive
                                ? 'bg-indigo-50 text-indigo-600'
                                : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                            }`}
                          >
                            <child.icon className={`h-4 w-4 shrink-0 ${isChildActive ? 'text-indigo-600' : 'text-gray-400'}`} />
                            {child.name}
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          }

          return (
            <Link
              key={item.name}
              href={item.href}
              onClick={onLinkClick}
              title={collapsed ? item.name : undefined}
              className={`group flex items-center rounded-lg text-sm font-medium transition-colors ${
                collapsed ? 'justify-center px-2 py-2.5' : 'gap-3 px-3 py-2.5'
              } ${
                isParentActive
                  ? 'bg-indigo-50 text-indigo-600'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              }`}
            >
              <item.icon
                className={`h-5 w-5 shrink-0 ${
                  isParentActive ? 'text-indigo-600' : 'text-gray-400 group-hover:text-gray-600'
                }`}
              />
              {!collapsed && item.name}
            </Link>
          );
        })}
      </nav>

      {/* Sidebar actions: theme + collapse (desktop only) */}
      {onToggleCollapse && (
        <SidebarActions collapsed={collapsed} onToggleCollapse={onToggleCollapse} />
      )}

      {/* Sidebar footer */}
      <div className={`border-t border-gray-200 ${collapsed ? 'p-2' : 'p-4'}`}>
        <div className={`flex items-center ${collapsed ? 'justify-center' : 'gap-3'}`}>
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-600" title={collapsed ? userName : undefined}>
            <span className="text-sm font-medium text-white">{getInitials(userName)}</span>
          </div>
          {!collapsed && (
            <>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-900">{userName}</p>
                <p className="truncate text-xs text-gray-500">{userEmail}</p>
              </div>
              <button
                type="button"
                onClick={onLogout}
                className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                title="Sign out"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function DashboardLayoutInner({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, tenant, locations, isLoading, isAuthenticated, needsOnboarding, logout } = useAuthContext();
  const { isModuleEnabled } = useEntitlementsContext();
  const { guardedClick } = useNavigationGuard();

  // Preload POS catalog + category hierarchy + POS route chunks on login
  // so they're instant when the user navigates to POS or opens the edit drawer.
  useEffect(() => {
    if (isAuthenticated && locations.length > 0) {
      preloadPOSCatalog(locations[0]!.id);
      router.prefetch('/pos/retail');
      router.prefetch('/pos/fnb');
      // Warm the category hierarchy cache — used by item edit drawer dropdowns
      queryClient.prefetchQuery({
        queryKey: ['categories'],
        queryFn: () =>
          apiFetch<{ data: unknown[] }>('/api/v1/catalog/categories').then((r) => r.data),
        staleTime: 5 * 60_000,
      });
    }
  }, [isAuthenticated, locations, router, queryClient]);

  // Load collapsed state from localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(SIDEBAR_KEY);
      if (stored === 'true') setCollapsed(true);
    }
  }, []);

  const toggleCollapse = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(SIDEBAR_KEY, String(next));
      return next;
    });
  }, []);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace('/login');
    } else if (!isLoading && needsOnboarding) {
      router.replace('/onboard');
    }
  }, [isLoading, isAuthenticated, needsOnboarding, router]);

  const handleLogout = async () => {
    await logout();
    router.replace('/login');
  };

  // Not loading but not authenticated → redirect handled by effect above
  if (!isLoading && (!isAuthenticated || !user || needsOnboarding)) {
    return null;
  }

  // Derive display values — use fallbacks during auth loading so the
  // sidebar renders immediately and the user can navigate right away.
  const tenantName = tenant?.name || 'OppsEra';
  const userName = user?.name || 'User';
  const userEmail = user?.email || '';
  // During auth loading, show all modules — entitlements filter once loaded
  const checkModule = isLoading ? () => true : isModuleEnabled;

  return (
    <ContextMenuProvider>
    <ProfileDrawerProvider>
    <ItemEditDrawerProvider>
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 transition-opacity md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Mobile sidebar — always full width, never collapsed */}
      <div
        className={`fixed inset-y-0 left-0 z-50 w-64 transform bg-surface shadow-xl transition-transform duration-200 ease-in-out md:hidden ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="absolute right-0 top-0 -mr-12 pt-4">
          <button
            type="button"
            className="ml-1 flex h-10 w-10 items-center justify-center rounded-full focus:ring-2 focus:ring-white focus:outline-none"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="h-6 w-6 text-white" />
          </button>
        </div>
        <SidebarContent
          pathname={pathname}
          onLinkClick={(e) => guardedClick(e, () => setSidebarOpen(false))}
          userName={userName}
          userEmail={userEmail}
          onLogout={handleLogout}
          isModuleEnabled={checkModule}
        />
      </div>

      {/* Desktop sidebar — z-40 keeps it above POS overlay backdrops (z-30)
          so the user can always click sidebar links, even when a payment
          picker or other POS overlay is open. */}
      <div
        className={`relative z-40 hidden md:flex md:shrink-0 transition-all duration-200 ease-in-out ${
          collapsed ? 'md:w-16' : 'md:w-64'
        }`}
      >
        <div
          className={`flex flex-col border-r border-gray-200 bg-surface transition-all duration-200 ease-in-out ${
            collapsed ? 'w-16' : 'w-64'
          }`}
        >
          <SidebarContent
            pathname={pathname}
            onLinkClick={(e) => guardedClick(e)}
            userName={userName}
            userEmail={userEmail}
            onLogout={handleLogout}
            isModuleEnabled={checkModule}
            collapsed={collapsed}
            onToggleCollapse={toggleCollapse}
          />
        </div>
      </div>

      {/* Main content area — relative z-0 creates a stacking context so
          POS fixed/absolute overlays (z-30, z-40) stay scoped here and
          never paint above the sidebar (z-40). Portals to document.body
          (dialogs at z-50/z-60) are unaffected since they're outside this
          container. */}
      <div className="relative z-0 flex flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-gray-200 bg-surface px-4 md:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700 md:hidden"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu className="h-5 w-5" />
            </button>
            <span className="text-sm font-semibold text-gray-700 md:hidden">{tenantName}</span>
            <span className="hidden text-sm font-semibold text-gray-700 md:block">
              {tenantName}
            </span>
          </div>
          <div className="flex items-center gap-4">
            <LiveClockDisplay />
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-600 transition-colors hover:bg-indigo-700">
              <span className="text-sm font-medium text-white">{getInitials(userName)}</span>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className={`flex-1 ${
          pathname.startsWith('/pos')
            ? 'overflow-hidden'
            : 'overflow-y-auto p-4 md:p-6'
        }`}>
          {isLoading ? (
            <div className="flex h-full items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-indigo-600" />
            </div>
          ) : children}
        </main>
      </div>

      {/* Customer Profile Drawer — always mounted, renders when open */}
      <CustomerProfileDrawer />
      {/* Item Edit Drawer — always mounted, renders when open */}
      <ItemEditDrawer />
    </div>
    </ItemEditDrawerProvider>
    </ProfileDrawerProvider>
    </ContextMenuProvider>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <QueryProvider>
      <EntitlementsProvider>
        <NavigationGuardProvider>
          <DashboardLayoutInner>{children}</DashboardLayoutInner>
        </NavigationGuardProvider>
      </EntitlementsProvider>
    </QueryProvider>
  );
}
