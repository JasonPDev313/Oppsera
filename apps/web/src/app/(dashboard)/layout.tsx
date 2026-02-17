'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  Warehouse,
  Users,
  BarChart3,
  Settings,
  Menu,
  X,
  LogOut,
  Lock,
  ChevronDown,
  List,
  FolderTree,
  Receipt,
  Monitor,
  UtensilsCrossed,
  ClipboardList,
} from 'lucide-react';
import { useAuthContext } from '@/components/auth-provider';
import { useEntitlements } from '@/hooks/use-entitlements';

interface SubNavItem {
  name: string;
  href: string;
  icon: typeof LayoutDashboard;
}

interface NavItem {
  name: string;
  href: string;
  icon: typeof LayoutDashboard;
  moduleKey?: string;
  children?: SubNavItem[];
}

const navigation: NavItem[] = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  {
    name: 'POS',
    href: '/pos',
    icon: Monitor,
    moduleKey: 'pos_retail',
    children: [
      { name: 'Retail POS', href: '/pos/retail', icon: ShoppingCart },
      { name: 'F&B POS', href: '/pos/fnb', icon: UtensilsCrossed },
    ],
  },
  {
    name: 'Catalog',
    href: '/catalog',
    icon: Package,
    moduleKey: 'catalog',
    children: [
      { name: 'Items', href: '/catalog', icon: List },
      { name: 'Hierarchy', href: '/catalog/hierarchy', icon: FolderTree },
      { name: 'Taxes', href: '/catalog/taxes', icon: Receipt },
    ],
  },
  { name: 'Orders', href: '/orders', icon: ClipboardList, moduleKey: 'pos_retail' },
  { name: 'Inventory', href: '/inventory', icon: Warehouse, moduleKey: 'inventory' },
  { name: 'Customers', href: '/customers', icon: Users, moduleKey: 'customers' },
  { name: 'Reports', href: '/reports', icon: BarChart3, moduleKey: 'reporting' },
  { name: 'Settings', href: '/settings', icon: Settings },
];

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function SidebarContent({
  pathname,
  onLinkClick,
  userName,
  userEmail,
  onLogout,
  isModuleEnabled,
}: {
  pathname: string;
  onLinkClick?: () => void;
  userName: string;
  userEmail: string;
  onLogout: () => void;
  isModuleEnabled: (key: string) => boolean;
}) {
  return (
    <div className="flex h-full flex-col">
      {/* Logo */}
      <div className="flex h-16 shrink-0 items-center border-b border-gray-200 px-6">
        <Link href="/" className="flex items-center gap-2" onClick={onLinkClick}>
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600">
            <span className="text-sm font-bold text-white">O</span>
          </div>
          <span className="text-lg font-bold text-gray-900">OppsEra</span>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-3 py-4">
        {navigation.map((item) => {
          const enabled = !item.moduleKey || isModuleEnabled(item.moduleKey);
          const isParentActive =
            item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);

          if (!enabled) {
            return (
              <div
                key={item.name}
                className="group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-300 cursor-not-allowed"
                title="Enable this module in Settings"
              >
                <item.icon className="h-5 w-5 shrink-0 text-gray-300" />
                {item.name}
                <Lock className="ml-auto h-3.5 w-3.5 text-gray-300" />
              </div>
            );
          }

          if (item.children) {
            return (
              <div key={item.name}>
                <Link
                  href={item.href}
                  onClick={onLinkClick}
                  className={`group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
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
                  {item.name}
                  <ChevronDown
                    className={`ml-auto h-4 w-4 shrink-0 transition-transform ${
                      isParentActive ? 'rotate-180 text-indigo-600' : 'text-gray-400'
                    }`}
                  />
                </Link>
                {isParentActive && (
                  <div className="ml-6 mt-1 space-y-1 border-l border-gray-200 pl-3">
                    {item.children.map((child) => {
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
              </div>
            );
          }

          return (
            <Link
              key={item.name}
              href={item.href}
              onClick={onLinkClick}
              className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
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
              {item.name}
            </Link>
          );
        })}
      </nav>

      {/* Sidebar footer */}
      <div className="border-t border-gray-200 p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-600">
            <span className="text-sm font-medium text-white">{getInitials(userName)}</span>
          </div>
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
        </div>
      </div>
    </div>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const { user, tenant, isLoading, isAuthenticated, needsOnboarding, logout } = useAuthContext();
  const { isModuleEnabled } = useEntitlements();

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

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-indigo-600" />
      </div>
    );
  }

  if (!isAuthenticated || !user || needsOnboarding) {
    return null;
  }

  const tenantName = tenant?.name || 'OppsEra';
  const userName = user.name || 'User';
  const userEmail = user.email || '';

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 transition-opacity md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Mobile sidebar */}
      <div
        className={`fixed inset-y-0 left-0 z-50 w-64 transform bg-white shadow-xl transition-transform duration-200 ease-in-out md:hidden ${
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
          onLinkClick={() => setSidebarOpen(false)}
          userName={userName}
          userEmail={userEmail}
          onLogout={handleLogout}
          isModuleEnabled={isModuleEnabled}
        />
      </div>

      {/* Desktop sidebar */}
      <div className="hidden md:flex md:w-64 md:shrink-0">
        <div className="flex w-64 flex-col border-r border-gray-200 bg-white">
          <SidebarContent
            pathname={pathname}
            userName={userName}
            userEmail={userEmail}
            onLogout={handleLogout}
            isModuleEnabled={isModuleEnabled}
          />
        </div>
      </div>

      {/* Main content area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-gray-200 bg-white px-4 md:px-6">
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
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-600 transition-colors hover:bg-indigo-700">
              <span className="text-sm font-medium text-white">{getInitials(userName)}</span>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
