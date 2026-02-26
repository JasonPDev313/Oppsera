'use client';

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useEntitlementsContext } from '@/components/entitlements-provider';
import { usePermissionsContext } from '@/components/permissions-provider';

export interface SectionTab {
  id: string;
  label: string;
  icon: LucideIcon;
  moduleKey?: string;
  requiredPermission?: string;
}

interface AccountingSectionLayoutProps {
  sectionTitle: string;
  tabs: SectionTab[];
  activeTabId: string;
  onTabChange: (id: string) => void;
  actions?: React.ReactNode;
  children: React.ReactNode;
}

export function AccountingSectionLayout({
  sectionTitle,
  tabs,
  activeTabId,
  onTabChange,
  actions,
  children,
}: AccountingSectionLayoutProps) {
  const { isModuleEnabled } = useEntitlementsContext();
  const { can } = usePermissionsContext();

  const visibleTabs = tabs.filter(
    (tab) =>
      (!tab.moduleKey || isModuleEnabled(tab.moduleKey)) &&
      (!tab.requiredPermission || can(tab.requiredPermission)),
  );

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1 text-sm text-muted-foreground">
        <Link href="/accounting" className="transition-colors hover:text-foreground">
          Accounting
        </Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="font-medium text-foreground">{sectionTitle}</span>
      </nav>

      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-semibold text-foreground">{sectionTitle}</h1>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>

      {/* Tab navigation */}
      <div className="border-b border-border">
        <nav className="-mb-px flex gap-6 overflow-x-auto">
          {visibleTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => onTabChange(tab.id)}
              className={`flex shrink-0 items-center gap-2 border-b-2 px-1 py-3 text-sm font-medium transition-colors ${
                activeTabId === tab.id
                  ? 'border-indigo-600 text-indigo-500'
                  : 'border-transparent text-muted-foreground hover:border-input hover:text-foreground'
              }`}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab content */}
      <div>{children}</div>
    </div>
  );
}
