'use client';

import { useMemo } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import type { AiAssistantContext } from '@oppsera/module-ai-support';

function deriveModuleKey(pathname: string): string | undefined {
  const segments = pathname.split('/').filter(Boolean);
  const routeToModule: Record<string, string> = {
    orders: 'orders',
    catalog: 'catalog',
    inventory: 'inventory',
    customers: 'customers',
    accounting: 'accounting',
    reports: 'reporting',
    pos: 'pos',
    settings: 'settings',
    insights: 'semantic',
    'food-beverage': 'fnb',
    kds: 'kds',
    marketing: 'marketing',
    membership: 'membership',
    spa: 'spa',
    golf: 'golf',
    purchasing: 'ap',
    receivables: 'ar',
    expenses: 'expenses',
    projects: 'project-costing',
  };
  return segments[0] ? routeToModule[segments[0]] : undefined;
}

function collectVisibleActions(): string[] {
  if (typeof document === 'undefined') return [];
  const elements = document.querySelectorAll('[data-ai-action]');
  return Array.from(elements)
    .map((el) => el.getAttribute('data-ai-action'))
    .filter((v): v is string => v !== null);
}

function getSelectedRecord(): Record<string, unknown> | undefined {
  if (typeof document === 'undefined') return undefined;
  const el = document.querySelector('[data-ai-record]');
  if (!el) return undefined;
  try {
    return JSON.parse(el.getAttribute('data-ai-record') || '{}') as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

/** Read locationId from the terminal session stored in localStorage (if active). */
function getTerminalLocationId(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    const stored = localStorage.getItem('oppsera:terminal-session');
    if (!stored) return undefined;
    const session = JSON.parse(stored) as { locationId?: string };
    return session.locationId || undefined;
  } catch {
    return undefined;
  }
}

export function useAiAssistantContext(): AiAssistantContext {
  const pathname = usePathname();
  const { user, tenant } = useAuth();
  const { roles, permissions } = usePermissions();

  // Derive role keys from the permissions hook (e.g. ['manager', 'cashier'])
  const roleKeys = useMemo(
    () => roles.flatMap((r) => (r.name ? [r.name.toLowerCase()] : [])),
    [roles],
  );

  // Derive permission keys for the AI context
  const permissionKeys = useMemo(
    () => Array.from(permissions),
    [permissions],
  );

  return useMemo(
    () => ({
      route: pathname,
      screenTitle: typeof document !== 'undefined' ? document.title : undefined,
      moduleKey: deriveModuleKey(pathname),
      tenantId: tenant?.id ?? '',
      locationId: getTerminalLocationId(),
      roleKeys,
      permissionKeys,
      // TenantProfile does not expose featureFlags or enabledModules today.
      // These will be populated once the /me response is extended.
      featureFlags: undefined,
      enabledModules: undefined,
      visibleActions: collectVisibleActions(),
      selectedRecord: getSelectedRecord(),
    }),
    // eslint-disable-next-line
    [pathname, tenant?.id, user?.id, roleKeys, permissionKeys],
  );
}
