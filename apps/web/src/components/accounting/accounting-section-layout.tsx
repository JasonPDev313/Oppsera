'use client';

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useEntitlementsContext } from '@/components/entitlements-provider';

export interface SectionTab {
  id: string;
  label: string;
  icon: LucideIcon;
  moduleKey?: string;
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

  const visibleTabs = tabs.filter(
    (tab) => !tab.moduleKey || isModuleEnabled(tab.moduleKey),
  );

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1 text-sm text-gray-500">
        <Link href="/accounting" className="transition-colors hover:text-gray-700">
          Accounting
        </Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="font-medium text-gray-900">{sectionTitle}</span>
      </nav>

      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-semibold text-gray-900">{sectionTitle}</h1>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>

      {/* Tab navigation */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex gap-6 overflow-x-auto">
          {visibleTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => onTabChange(tab.id)}
              className={`flex shrink-0 items-center gap-2 border-b-2 px-1 py-3 text-sm font-medium transition-colors ${
                activeTabId === tab.id
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
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
