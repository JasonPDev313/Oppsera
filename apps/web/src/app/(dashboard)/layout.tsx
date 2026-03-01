'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Menu,
  X,
  LogOut,
  ChevronDown,
  PanelLeftClose,
  PanelLeftOpen,
  Sun,
  Moon,
  CalendarDays,
  Clock,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthContext } from '@/components/auth-provider';
import { EntitlementsProvider, useEntitlementsContext } from '@/components/entitlements-provider';
import { PermissionsProvider, usePermissionsContext } from '@/components/permissions-provider';
import { QueryProvider } from '@/components/query-provider';
import { useTheme } from '@/components/theme-provider';
import { ContextMenuProvider } from '@/components/context-menu-provider';
import { ProfileDrawerProvider, CustomerProfileDrawer } from '@/components/customer-profile-drawer';
import { ItemEditDrawerProvider } from '@/components/inventory/ItemEditDrawerContext';
import { ItemEditDrawer } from '@/components/inventory/ItemEditDrawer';
import { NavigationGuardProvider, useNavigationGuard } from '@/hooks/use-navigation-guard';
import { preloadPOSCatalog } from '@/hooks/use-catalog-for-pos';
import { apiFetch } from '@/lib/api-client';
import { TerminalSessionProvider, useTerminalSession, TERMINAL_SKIP_KEY } from '@/components/terminal-session-provider';
import { TerminalSelectionScreen } from '@/components/terminal-selection-screen';
import { getInitials } from '@oppsera/shared';
import { CommandPalette } from '@/components/command-palette';
import { ImpersonationBanner } from '@/components/impersonation-banner';
import type { NavItem } from '@/lib/navigation';
import { applyNavPreferences } from '@/lib/navigation-order';
import { useNavPreferences } from '@/hooks/use-nav-preferences';
import { useErpConfig } from '@/hooks/use-erp-config';
import { filterNavByTier } from '@/lib/navigation-filter';
import { AiAssistantStub } from '@/components/ai-assistant-stub';

const SIDEBAR_KEY = 'sidebar_collapsed';

/**
 * Module-level color palette — every top-level nav module gets a distinctive
 * color that works on both dark (#161b22) and light (#ffffff) backgrounds.
 * Used for: parent icons (always colored), active states, group header dots.
 *
 * COLOR REUSE STRATEGY
 * Colors are unique within each business vertical so that no two modules
 * sharing a customer's sidebar ever collide.  Modules from *different*
 * verticals (e.g., Golf vs Salon) may share a color since they'll never
 * appear together.
 *
 * ┌─ Core (always on) ──────────────────────────────────────────────┐
 * │  Dashboard · Customers · Reports · AI Insights · Payments       │
 * │  Accounting · Settings                                          │
 * ├─ Commerce ───────────────────────────────────────────────────────┤
 * │  Retail POS · F&B POS · Inventory · Sales History               │
 * │  Online Store · Procurement                                     │
 * ├─ Hospitality ────────────────────────────────────────────────────┤
 * │  Property Mgmt · Spa · Events · Reservations                    │
 * ├─ Golf ───────────────────────────────────────────────────────────┤
 * │  Golf                                                           │
 * ├─ People ─────────────────────────────────────────────────────────┤
 * │  Memberships · Marketing · HR · Scheduling                      │
 * └──────────────────────────────────────────────────────────────────┘
 *
 * Worst-case overlap (luxury resort + golf + full enterprise) ≈ 23
 * modules — the 24 colors below cover that with room to spare.
 *
 * If a future module isn't in this map, `getModuleColor()` picks one
 * deterministically from MODULE_FALLBACK_PALETTE via a hash so it
 * stays stable across renders / sessions.
 */
const MODULE_COLORS: Record<string, string> = {
  // ── Core (universal, always active) ───────────────────────────
  Dashboard:       '#3b82f6', // blue-500
  Customers:       '#ec4899', // pink-500
  Reports:         '#f59e0b', // amber-500
  'AI Insights':   '#a855f7', // purple-500
  Payments:        '#22c55e', // green-500
  Accounting:      '#64748b', // slate-500
  Settings:        '#94a3b8', // slate-400

  // ── Commerce ──────────────────────────────────────────────────
  'Retail POS':    '#10b981', // emerald-500
  'F&B POS':       '#f97316', // orange-500
  Inventory:       '#06b6d4', // cyan-500
  'Sales History': '#8b5cf6', // violet-500
  'Online Store':  '#6366f1', // indigo-500
  Procurement:     '#ca8a04', // yellow-600

  // ── Hospitality ───────────────────────────────────────────────
  'Property Mgmt': '#14b8a6', // teal-500
  Spa:             '#f43f5e', // rose-500
  Events:          '#d946ef', // fuchsia-500
  Reservations:    '#0ea5e9', // sky-500

  // ── Golf (only active with golf vertical) ─────────────────────
  Golf:            '#16a34a', // green-600

  // ── People / CRM ──────────────────────────────────────────────
  Memberships:     '#0891b2', // cyan-600
  Marketing:       '#db2777', // pink-600
  HR:              '#7c3aed', // violet-600
  Scheduling:      '#0d9488', // teal-600

  // ── Finance sub-modules (if promoted to top-level) ────────────
  Expenses:        '#b45309', // amber-700
  Projects:        '#4f46e5', // indigo-600
};

/** Fallback palette for modules not yet in MODULE_COLORS — provides
 *  deterministic (hash-based) color assignment so it's stable across
 *  renders and sessions. Every color here is distinct from the 24 above. */
const MODULE_FALLBACK_PALETTE = [
  '#e11d48', // rose-600
  '#9333ea', // purple-600
  '#2563eb', // blue-600
  '#059669', // emerald-600
  '#ea580c', // orange-600
  '#4338ca', // indigo-700
  '#be185d', // pink-700
  '#0e7490', // cyan-700
  '#15803d', // green-700
  '#b91c1c', // red-700
] as const;

/** Deterministic module color — looks up the hand-picked color first,
 *  falls back to a stable hash-based pick from the fallback palette. */
function getModuleColor(name: string): string {
  if (MODULE_COLORS[name]) return MODULE_COLORS[name];
  // djb2 hash → palette index (deterministic, no randomness)
  let hash = 5381;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) + hash + name.charCodeAt(i)) | 0;
  }
  return MODULE_FALLBACK_PALETTE[
    Math.abs(hash) % MODULE_FALLBACK_PALETTE.length
  ];
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
        <CalendarDays className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <span className="text-sm font-medium text-muted-foreground">{clock.date}</span>
      </div>
      <div className="hidden items-center gap-1.5 sm:flex">
        <Clock className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <span className="text-sm font-medium tabular-nums text-muted-foreground">{clock.time}</span>
      </div>
    </>
  );
}

function SidebarActions({
  visuallyCollapsed,
  isPinned,
  onToggleCollapse,
}: {
  visuallyCollapsed?: boolean;
  isPinned: boolean;
  onToggleCollapse: () => void;
}) {
  const { theme, toggleTheme } = useTheme();
  return (
    <div className={`border-t border-border ${visuallyCollapsed ? 'space-y-1 px-2 py-3' : 'space-y-1 px-3 py-3'}`}>
      <button
        type="button"
        onClick={toggleTheme}
        className={`flex w-full items-center rounded-lg text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground ${
          visuallyCollapsed ? 'justify-center px-2 py-2' : 'gap-3 px-3 py-2'
        }`}
        title={visuallyCollapsed ? (theme === 'dark' ? 'Light mode' : 'Dark mode') : undefined}
      >
        {theme === 'dark' ? (
          <>
            <Sun className="h-5 w-5 shrink-0" aria-hidden="true" />
            {!visuallyCollapsed && 'Light Mode'}
          </>
        ) : (
          <>
            <Moon className="h-5 w-5 shrink-0" aria-hidden="true" />
            {!visuallyCollapsed && 'Dark Mode'}
          </>
        )}
      </button>
      <button
        type="button"
        onClick={onToggleCollapse}
        className={`flex w-full items-center rounded-lg text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground ${
          visuallyCollapsed ? 'justify-center px-2 py-2' : 'gap-3 px-3 py-2'
        }`}
        title={visuallyCollapsed ? 'Expand sidebar' : (isPinned ? 'Collapse sidebar' : 'Expand sidebar')}
      >
        {isPinned ? (
          <>
            <PanelLeftClose className="h-5 w-5 shrink-0" aria-hidden="true" />
            {!visuallyCollapsed && 'Collapse'}
          </>
        ) : (
          <>
            <PanelLeftOpen className="h-5 w-5 shrink-0" aria-hidden="true" />
            {!visuallyCollapsed && 'Expand'}
          </>
        )}
      </button>
    </div>
  );
}

/** Pick the child whose href is the best (longest) prefix-match for the current pathname. */
function getBestMatchHref(
  children: ReadonlyArray<{ href: string }>,
  pathname: string,
): string | null {
  let best: string | null = null;
  for (const child of children) {
    if (pathname === child.href || pathname.startsWith(child.href + '/')) {
      if (!best || child.href.length > best.length) {
        best = child.href;
      }
    }
  }
  return best;
}

function SidebarContent({
  pathname,
  onLinkClick,
  userName,
  userEmail,
  onLogout,
  isModuleEnabled,
  can,
  navItems,
  collapsed,
  isPinned,
  onToggleCollapse,
}: {
  pathname: string;
  onLinkClick?: (e: React.MouseEvent) => void;
  userName: string;
  userEmail: string;
  onLogout: () => void;
  isModuleEnabled: (key: string) => boolean;
  can: (permission: string) => boolean;
  navItems: NavItem[];
  collapsed?: boolean;
  isPinned?: boolean;
  onToggleCollapse?: () => void;
}) {
  // Track which sections are expanded — initialized from current URL
  const [expandedSections, setExpandedSections] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    for (const item of navItems) {
      if (item.children) {
        const isActive =
          pathname.startsWith(item.href) ||
          item.children.some((child) => pathname.startsWith(child.href));
        if (isActive) initial.add(item.name);
      }
    }
    return initial;
  });

  // Auto-expand section when navigating to a child page
  const prevPathRef = useRef(pathname);
  useEffect(() => {
    if (pathname === prevPathRef.current) return;
    prevPathRef.current = pathname;
    for (const item of navItems) {
      if (item.children) {
        const isActive =
          pathname.startsWith(item.href) ||
          item.children.some((child) => pathname.startsWith(child.href));
        if (isActive) {
          setExpandedSections((prev) => {
            if (prev.has(item.name)) return prev;
            const next = new Set(prev);
            next.add(item.name);
            return next;
          });
        }
      }
    }
  }, [pathname]);

  const toggleSection = useCallback((name: string) => {
    setExpandedSections((prev) => {
      if (prev.has(name)) {
        return new Set<string>();
      }
      return new Set([name]);
    });
  }, []);

  // --- Collapsible group accordion state (Level-2 categories within a parent) ---
  // Single-open: only one group expanded per parent at a time.
  // To switch to multi-open, change value type to string[] and toggle individually.
  const GROUPS_KEY = 'sidebar_expanded_groups';
  // Read from localStorage in the initializer so the first client render
  // already has the correct expanded state — avoids a visible
  // collapse-then-expand flash. On the server, returns {}.
  const [expandedGroup, setExpandedGroup] = useState<Record<string, string | null>>(() => {
    if (typeof window === 'undefined') return {};
    try {
      const stored = localStorage.getItem(GROUPS_KEY);
      return stored ? JSON.parse(stored) : {};
    } catch { return {}; }
  });

  // Auto-expand the group containing the active route on navigation
  const prevGroupPathRef = useRef<string | null>(null);
  useEffect(() => {
    const isInitial = prevGroupPathRef.current === null;
    const pathChanged = prevGroupPathRef.current !== pathname;
    prevGroupPathRef.current = pathname;
    if (!isInitial && !pathChanged) return;
    for (const item of navItems) {
      if (!item.collapsibleGroups || !item.children) continue;
      const activeChild = item.children.find((c) => pathname.startsWith(c.href));
      if (activeChild?.group) {
        setExpandedGroup((prev) => {
          if (prev[item.name] === activeChild.group) return prev;
          const next = { ...prev, [item.name]: activeChild.group! };
          localStorage.setItem(GROUPS_KEY, JSON.stringify(next));
          return next;
        });
      }
    }
  }, [pathname]);

  const toggleGroup = useCallback((parentName: string, groupName: string) => {
    setExpandedGroup((prev) => {
      const next = {
        ...prev,
        [parentName]: prev[parentName] === groupName ? null : groupName,
      };
      localStorage.setItem(GROUPS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  return (
    <div className="flex h-full flex-col">
      {/* Logo */}
      <div className={`flex h-16 shrink-0 items-center border-b border-border ${collapsed ? 'justify-center px-2' : 'px-6'}`}>
        <Link href="/dashboard" className="flex items-center gap-2" onClick={onLinkClick}>
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-600">
            <span className="text-sm font-bold text-white">O</span>
          </div>
          {!collapsed && <span className="text-lg font-bold text-foreground">OppsEra</span>}
        </Link>
      </div>

      {/* Navigation */}
      <nav aria-label="Main navigation" className={`sidebar-scroll min-h-0 flex-1 space-y-1 overflow-y-auto py-4 ${collapsed ? 'px-2' : 'px-3'}`}>
        {navItems.map((item) => {
          const entitlementEnabled = !item.moduleKey || isModuleEnabled(item.moduleKey);
          const permissionGranted = !item.requiredPermission || can(item.requiredPermission);
          const isParentActive =
            item.href === '/dashboard'
              ? pathname === '/dashboard'
              : pathname.startsWith(item.href) ||
                (item.children?.some((child) => pathname.startsWith(child.href)) ?? false);
          const isExpanded = expandedSections.has(item.name);

          const moduleColor = getModuleColor(item.name);

          if (!entitlementEnabled || !permissionGranted) {
            return null;
          }

          if (item.children) {
            return (
              <div key={item.name} className={collapsed ? 'group/nav relative' : ''}>
                <button
                  type="button"
                  onClick={() => toggleSection(item.name)}
                  title={collapsed ? item.name : undefined}
                  aria-expanded={isExpanded}
                  aria-controls={collapsed ? undefined : `nav-section-${item.name.replace(/\s+/g, '-').toLowerCase()}`}
                  className={`group flex w-full items-center rounded-lg text-sm font-medium transition-colors ${
                    collapsed ? 'justify-center px-2 py-2.5' : 'gap-3 px-3 py-2.5'
                  } ${
                    isParentActive
                      ? ''
                      : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                  }`}
                  style={isParentActive ? { backgroundColor: `${moduleColor}15`, color: moduleColor } : undefined}
                >
                  <item.icon
                    className="h-5 w-5 shrink-0"
                    style={{ color: moduleColor }}
                    aria-hidden="true"
                  />
                  {!collapsed && (
                    <>
                      {item.name}
                      <ChevronDown
                        className={`ml-auto h-4 w-4 shrink-0 transition-transform ${
                          isExpanded ? 'rotate-180' : ''
                        } ${isParentActive ? '' : 'text-muted-foreground'}`}
                        style={isParentActive ? { color: moduleColor } : undefined}
                        aria-hidden="true"
                      />
                    </>
                  )}
                </button>
                {/* Expanded: inline children */}
                {isExpanded && !collapsed && (
                  <div id={`nav-section-${item.name.replace(/\s+/g, '-').toLowerCase()}`} className={`ml-6 mt-1 border-l border-border pl-3 ${item.collapsibleGroups ? '' : 'space-y-1'}`}>
                    {item.collapsibleGroups ? (
                      // Collapsible accordion groups (e.g., Property Mgmt categories)
                      (() => {
                        const filtered = item.children!.filter((child) =>
                          (!child.moduleKey || isModuleEnabled(child.moduleKey)) &&
                          (!child.requiredPermission || can(child.requiredPermission))
                        );
                        const bestMatch = getBestMatchHref(filtered, pathname);
                        const groups: Array<{ name: string; items: typeof filtered }> = [];
                        const seen = new Map<string, typeof filtered>();
                        for (const child of filtered) {
                          const g = child.group || 'Other';
                          if (!seen.has(g)) {
                            const items: typeof filtered = [];
                            seen.set(g, items);
                            groups.push({ name: g, items });
                          }
                          seen.get(g)!.push(child);
                        }
                        return groups
                          .filter((g) => g.items.length > 0)
                          .map((group, groupIdx) => {
                            const isGrpExpanded = expandedGroup[item.name] === group.name;
                            return (
                              <div key={group.name} className={groupIdx > 0 ? 'mt-3' : ''}>
                                <button
                                  type="button"
                                  onClick={() => toggleGroup(item.name, group.name)}
                                  className="mt-1 flex w-full items-center justify-between rounded-md px-3 py-1.5 text-[10px] font-medium tracking-widest text-muted-foreground transition-colors hover:text-foreground"
                                >
                                  <span className="flex items-center gap-2">
                                    <span className="inline-block h-1 w-1 rounded-full" style={{ backgroundColor: moduleColor }} />
                                    {group.name}
                                  </span>
                                  <ChevronDown
                                    className={`h-3 w-3 shrink-0 transition-transform ${isGrpExpanded ? '' : '-rotate-90'}`}
                                  />
                                </button>
                                {/* Gradient accent line */}
                                <div className="mx-3 h-px" style={{ background: `linear-gradient(to right, ${moduleColor}40, transparent)` }} />
                                {isGrpExpanded && (
                                  <div className="mt-0.5 space-y-0.5">
                                    {group.items.map((child) => {
                                      const isChildActive = child.href === bestMatch;
                                      return (
                                        <Link
                                          key={child.href}
                                          href={child.href}
                                          onClick={onLinkClick}
                                          aria-current={isChildActive ? 'page' : undefined}
                                          className={`block rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                                            isChildActive
                                              ? ''
                                              : 'text-muted-foreground hover:text-foreground'
                                          }`}
                                          style={isChildActive ? { color: moduleColor } : undefined}
                                        >
                                          {child.name}
                                        </Link>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          });
                      })()
                    ) : (
                      // Flat children with optional static group headers
                      (() => {
                        const filtered = item.children!.filter((child) =>
                          (!child.moduleKey || isModuleEnabled(child.moduleKey)) &&
                          (!child.requiredPermission || can(child.requiredPermission))
                        );
                        const bestMatch = getBestMatchHref(filtered, pathname);
                        let lastGroup: string | undefined;
                        let groupIdx = 0;
                        return filtered.map((child) => {
                          const isChildActive = child.href === bestMatch;
                          const showGroupHeader = child.group && child.group !== lastGroup;
                          if (showGroupHeader) groupIdx++;
                          lastGroup = child.group;
                          return (
                            <div key={child.href}>
                              {showGroupHeader && (
                                <div className={groupIdx > 1 ? 'mt-3' : ''}>
                                  <p className="mt-2 mb-0.5 flex items-center gap-2 px-3 text-[10px] font-medium text-muted-foreground tracking-widest">
                                    <span className="inline-block h-1 w-1 rounded-full" style={{ backgroundColor: moduleColor }} />
                                    {child.group}
                                  </p>
                                  <div className="mx-3 h-px" style={{ background: `linear-gradient(to right, ${moduleColor}40, transparent)` }} />
                                </div>
                              )}
                              <Link
                                href={child.href}
                                onClick={onLinkClick}
                                aria-current={isChildActive ? 'page' : undefined}
                                className={`group flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                                  isChildActive
                                    ? ''
                                    : 'text-muted-foreground hover:text-foreground'
                                }`}
                                style={isChildActive ? { color: moduleColor } : undefined}
                              >
                                <child.icon className="h-4 w-4 shrink-0" style={{ color: isChildActive ? moduleColor : undefined }} aria-hidden="true" />
                                {child.name}
                              </Link>
                            </div>
                          );
                        });
                      })()
                    )}
                  </div>
                )}
                {/* Collapsed: hover flyout — pl-3 creates invisible bridge so mouse can cross the gap */}
                {collapsed && (
                  <div className="absolute left-full top-0 z-50 hidden pl-3 group-hover/nav:block">
                    <div className="min-w-44 rounded-lg border border-border bg-surface py-1.5 shadow-lg">
                      <p className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-muted-foreground">
                        <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: moduleColor }} />
                        {item.name}
                      </p>
                      {(() => {
                        const filtered = item.children!.filter((child) =>
                          (!child.moduleKey || isModuleEnabled(child.moduleKey)) &&
                          (!child.requiredPermission || can(child.requiredPermission))
                        );
                        const bestMatch = getBestMatchHref(filtered, pathname);
                        let lastGroup: string | undefined;
                        return filtered.map((child) => {
                          const isChildActive = child.href === bestMatch;
                          const showGroupHeader = child.group && child.group !== lastGroup;
                          lastGroup = child.group;
                          return (
                            <div key={child.href}>
                              {showGroupHeader && (
                                <div className="border-t border-border">
                                  <p className="mt-1 flex items-center gap-2 px-3 py-1 text-[10px] font-medium tracking-widest text-muted-foreground">
                                    <span className="inline-block h-1 w-1 rounded-full" style={{ backgroundColor: moduleColor }} />
                                    {child.group}
                                  </p>
                                </div>
                              )}
                              <Link
                                href={child.href}
                                onClick={onLinkClick}
                                aria-current={isChildActive ? 'page' : undefined}
                                className={`flex items-center gap-2 px-3 py-2 text-sm font-medium transition-colors ${
                                  isChildActive
                                    ? ''
                                    : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                                }`}
                                style={isChildActive ? { backgroundColor: `${moduleColor}15`, color: moduleColor } : undefined}
                              >
                                <child.icon className="h-4 w-4 shrink-0" style={{ color: isChildActive ? moduleColor : undefined }} aria-hidden="true" />
                                {child.name}
                              </Link>
                            </div>
                          );
                        });
                      })()}
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
              aria-current={isParentActive ? 'page' : undefined}
              className={`group flex items-center rounded-lg text-sm font-medium transition-colors ${
                collapsed ? 'justify-center px-2 py-2.5' : 'gap-3 px-3 py-2.5'
              } ${
                isParentActive
                  ? ''
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              }`}
              style={isParentActive ? { backgroundColor: `${moduleColor}15`, color: moduleColor } : undefined}
            >
              <item.icon
                className="h-5 w-5 shrink-0"
                style={{ color: moduleColor }}
                aria-hidden="true"
              />
              {!collapsed && item.name}
            </Link>
          );
        })}
      </nav>

      {/* Sidebar actions: theme + expand/collapse (desktop only) */}
      {onToggleCollapse && (
        <SidebarActions visuallyCollapsed={collapsed} isPinned={!!isPinned} onToggleCollapse={onToggleCollapse} />
      )}

      {/* Sidebar footer */}
      <div className={`border-t border-border ${collapsed ? 'p-2' : 'p-4'}`}>
        <div className={`flex items-center ${collapsed ? 'justify-center' : 'gap-3'}`}>
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-600" title={collapsed ? userName : undefined}>
            <span className="text-sm font-medium text-white">{getInitials(userName)}</span>
          </div>
          {!collapsed && (
            <>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{userName}</p>
                <p className="truncate text-xs text-muted-foreground">{userEmail}</p>
              </div>
              <button
                type="button"
                onClick={onLogout}
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                aria-label="Sign out"
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
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
  const [collapsed, setCollapsed] = useState(true);
  const [hovered, setHovered] = useState(false);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, tenant, locations, isLoading, isAuthenticated, needsOnboarding, logout } = useAuthContext();
  const { isModuleEnabled, isLoading: entitlementsLoading } = useEntitlementsContext();
  const { can, isLoading: permissionsLoading } = usePermissionsContext();
  const { itemOrder } = useNavPreferences();
  const { guardedClick } = useNavigationGuard();
  const { configs: workflowConfigs, isLoading: erpConfigLoading } = useErpConfig();

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

  // Load collapsed/pinned state from localStorage (default: collapsed)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(SIDEBAR_KEY);
      // Only expand if explicitly set to 'false' (pinned open)
      if (stored === 'false') setCollapsed(false);
    }
  }, []);

  const toggleCollapse = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(SIDEBAR_KEY, String(next));
      // When pinning open (next=false), clear hover state since it's no longer relevant.
      // When collapsing (next=true), clear hover so sidebar collapses immediately.
      setHovered(false);
      return next;
    });
  }, []);

  // Hover handlers for auto-expand/collapse — only active when collapsed (not pinned open)
  const handleMouseEnter = useCallback(() => {
    if (!collapsed) return; // pinned open — hover is irrelevant
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    setHovered(true);
  }, [collapsed]);

  const handleMouseLeave = useCallback(() => {
    if (!collapsed) return; // pinned open — don't auto-collapse
    // Small delay to prevent flickering when mouse briefly crosses sidebar edge
    hoverTimeoutRef.current = setTimeout(() => {
      setHovered(false);
    }, 200);
  }, [collapsed]);

  // Cleanup hover timeout on unmount
  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    };
  }, []);

  // Sidebar is visually expanded when pinned open OR hovered
  const visuallyCollapsed = collapsed && !hovered;

  // Fullscreen toggle
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      document.documentElement.requestFullscreen();
    }
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
    // Use window.location for a hard navigation — avoids race with the
    // useEffect redirect and ensures all React state + query cache is torn
    // down cleanly (no stale cached data from the previous session).
    window.location.href = '/login';
  };

  // During auth or entitlements loading, show all modules — filter once both are loaded
  const checkModule = useCallback(
    (key: string) => (isLoading || entitlementsLoading) ? true : isModuleEnabled(key),
    [isLoading, entitlementsLoading, isModuleEnabled],
  );

  // Apply tenant nav preferences (order + visibility) — falls back to default order
  const orderedNav = useMemo(
    () => applyNavPreferences(itemOrder ?? [], checkModule),
    [itemOrder, checkModule],
  );

  // Second pass: filter by ERP workflow visibility (hides accounting for SMB, etc.)
  const filteredNav = useMemo(() => {
    if (erpConfigLoading || Object.keys(workflowConfigs).length === 0) return orderedNav;
    return filterNavByTier(orderedNav, workflowConfigs);
  }, [orderedNav, workflowConfigs, erpConfigLoading]);

  // Not loading but not authenticated → redirect handled by effect above
  if (!isLoading && (!isAuthenticated || !user || needsOnboarding)) {
    return null;
  }

  // Derive display values — use fallbacks during auth loading so the
  // sidebar renders immediately and the user can navigate right away.
  const tenantName = tenant?.name || 'OppsEra';
  const userName = user?.name || 'User';
  const userEmail = user?.email || '';
  // During loading, grant all permissions — filter once loaded
  const checkPermission = (isLoading || permissionsLoading) ? () => true : can;

  return (
    <ContextMenuProvider>
    <ProfileDrawerProvider>
    <ItemEditDrawerProvider>
    <div className="flex h-screen flex-col overflow-hidden bg-muted">
      <a href="#main-content" className="skip-link">Skip to main content</a>
      <ImpersonationBanner />
      <div className="flex flex-1 overflow-hidden">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 transition-opacity md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Mobile sidebar — always full width, never collapsed */}
      <div
        className={`fixed inset-y-0 left-0 z-50 w-64 transform overflow-visible bg-surface shadow-xl transition-transform duration-200 ease-in-out md:hidden ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Close button — only rendered when open to prevent ghost overlay on hamburger */}
        {sidebarOpen && (
          <div className="absolute right-0 top-0 -mr-12 pt-4">
            <button
              type="button"
              className="ml-1 flex h-10 w-10 items-center justify-center rounded-full focus:ring-2 focus:ring-white focus:outline-none"
              onClick={() => setSidebarOpen(false)}
              aria-label="Close navigation"
            >
              <X className="h-6 w-6 text-white" aria-hidden="true" />
            </button>
          </div>
        )}
        <SidebarContent
          pathname={pathname}
          onLinkClick={(e) => guardedClick(e, () => setSidebarOpen(false))}
          userName={userName}
          userEmail={userEmail}
          onLogout={handleLogout}
          isModuleEnabled={checkModule}
          can={checkPermission}
          navItems={filteredNav}
        />
      </div>

      {/* Desktop sidebar — z-40 keeps it above POS overlay backdrops (z-30)
          so the user can always click sidebar links, even when a payment
          picker or other POS overlay is open.
          Hover-to-expand: collapsed by default, expands on hover, collapses on mouse leave. */}
      <div
        className={`relative z-40 hidden md:flex md:shrink-0 transition-all duration-200 ease-in-out ${
          visuallyCollapsed ? 'md:w-16' : 'md:w-64'
        }`}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <div
          className={`flex flex-col border-r border-border bg-surface transition-all duration-200 ease-in-out ${
            visuallyCollapsed ? 'w-16' : 'w-64'
          }`}
        >
          <SidebarContent
            pathname={pathname}
            onLinkClick={(e) => guardedClick(e)}
            userName={userName}
            userEmail={userEmail}
            onLogout={handleLogout}
            isModuleEnabled={checkModule}
            can={checkPermission}
            navItems={filteredNav}
            collapsed={visuallyCollapsed}
            isPinned={!collapsed}
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
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-border bg-surface px-4 md:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              className="shrink-0 rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-foreground md:hidden"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open navigation"
            >
              <Menu className="h-5 w-5" aria-hidden="true" />
            </button>
            <span className="truncate text-sm font-semibold text-foreground md:hidden">{tenantName}</span>
            <span className="hidden text-sm font-semibold text-foreground md:block">
              {tenantName}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-2 md:gap-4">
            <div className="hidden sm:block">
              <AiAssistantStub />
            </div>
            <div className="hidden sm:block">
              <CommandPalette />
            </div>
            <button
              type="button"
              onClick={toggleFullscreen}
              className="hidden rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-foreground sm:block"
              aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            >
              {isFullscreen ? <Minimize2 className="h-5 w-5" aria-hidden="true" /> : <Maximize2 className="h-5 w-5" aria-hidden="true" />}
            </button>
            <LiveClockDisplay />
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-600 transition-colors hover:bg-indigo-700">
              <span className="text-sm font-medium text-white">{getInitials(userName)}</span>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main id="main-content" className={`flex-1 ${
          pathname.startsWith('/pos')
            ? 'overflow-hidden'
            : 'overflow-y-auto p-4 md:p-6'
        }`}>
          {children}
        </main>
      </div>

      {/* Customer Profile Drawer — always mounted, renders when open */}
      <CustomerProfileDrawer />
      {/* Item Edit Drawer — always mounted, renders when open */}
      <ItemEditDrawer />
      </div>
    </div>
    </ItemEditDrawerProvider>
    </ProfileDrawerProvider>
    </ContextMenuProvider>
  );
}

function TerminalSessionGate({ children }: { children: React.ReactNode }) {
  const { session, isLoading } = useTerminalSession();
  const { needsOnboarding, isLoading: authLoading, isAuthenticated } = useAuthContext();
  const [skipped, setSkipped] = useState(() => {
    if (typeof window === 'undefined') return false;
    // Skip flag is now sessionStorage — only valid for the current browser session.
    // Prevents the "skip once, bypass forever" bug from persisting across logins.
    try { return sessionStorage.getItem(TERMINAL_SKIP_KEY) === 'true'; } catch { return false; }
  });

  const handleSkip = useCallback(() => {
    setSkipped(true);
    try { sessionStorage.setItem(TERMINAL_SKIP_KEY, 'true'); } catch { /* ignore */ }
  }, []);

  // Bypass the terminal gate when auth is unresolved, user isn't logged in,
  // or tenant hasn't been provisioned yet — let DashboardLayoutInner handle
  // the redirect to /login or /onboard.
  if (authLoading || !isAuthenticated || needsOnboarding) return <>{children}</>;

  if (isLoading) return null;
  if (!session && !skipped) return <TerminalSelectionScreen onSkip={handleSkip} />;
  return <>{children}</>;
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <QueryProvider>
      <EntitlementsProvider>
        <PermissionsProvider>
          <NavigationGuardProvider>
            <TerminalSessionProvider>
              <TerminalSessionGate>
                <DashboardLayoutInner>{children}</DashboardLayoutInner>
              </TerminalSessionGate>
            </TerminalSessionProvider>
          </NavigationGuardProvider>
        </PermissionsProvider>
      </EntitlementsProvider>
    </QueryProvider>
  );
}
