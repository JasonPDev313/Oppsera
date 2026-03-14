'use client';

import { useMemo } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
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

export function useAiAssistantContext(): AiAssistantContext {
  const pathname = usePathname();
  const { user, tenant } = useAuth();

  return useMemo(
    () => ({
      route: pathname,
      screenTitle: typeof document !== 'undefined' ? document.title : undefined,
      moduleKey: deriveModuleKey(pathname),
      tenantId: tenant?.id ?? '',
      // LocationProfile lives in locations[], not directly on user — omit until
      // a location-selection context (e.g. terminal session) exposes it here.
      locationId: undefined,
      // AuthUserProfile does not carry roles/permissions — those are enforced
      // server-side via RBAC. Provide an empty array to satisfy the required
      // roleKeys field; enrich when the /me endpoint is extended.
      roleKeys: [],
      permissionKeys: undefined,
      // TenantProfile does not expose featureFlags or enabledModules today.
      // These will be populated once the /me response is extended.
      featureFlags: undefined,
      enabledModules: undefined,
      visibleActions: collectVisibleActions(),
      selectedRecord: getSelectedRecord(),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pathname, tenant?.id, user?.id],
  );
}
