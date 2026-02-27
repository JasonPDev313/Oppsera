'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import {
  Wrench,
  BarChart3,
  Search,
  CalendarDays,
  Layers,
  Globe,
  Database,
  History,
  Info,
} from 'lucide-react';
import { ToolGuide } from '@/components/insights/ToolGuide';

// ── Lazy-load each tab content ─────────────────────────────────────

const WatchlistContent = dynamic(() => import('../watchlist/watchlist-content'), {
  loading: () => <TabSkeleton />,
  ssr: false,
});

const ToolsContent = dynamic(() => import('../tools/tools-content'), {
  loading: () => <TabSkeleton />,
  ssr: false,
});

const ReportsContent = dynamic(() => import('../reports/reports-content'), {
  loading: () => <TabSkeleton />,
  ssr: false,
});

const LensesContent = dynamic(() => import('../lenses/lenses-content'), {
  loading: () => <TabSkeleton />,
  ssr: false,
});

const EmbedsContent = dynamic(() => import('../embeds/embeds-content'), {
  loading: () => <TabSkeleton />,
  ssr: false,
});

const AuthoringContent = dynamic(() => import('../authoring/authoring-content'), {
  loading: () => <TabSkeleton />,
  ssr: false,
});

const HistoryContent = dynamic(() => import('../history/history-content'), {
  loading: () => <TabSkeleton />,
  ssr: false,
});

// ── Tab definitions ────────────────────────────────────────────────

const TABS = [
  {
    key: 'watchlist',
    label: 'Watchlist',
    icon: BarChart3,
    color: 'text-emerald-500',
    hint: 'Pin key metrics and track trends at a glance',
  },
  {
    key: 'analysis',
    label: 'Analysis Tools',
    icon: Search,
    color: 'text-blue-500',
    hint: 'Root cause, correlations, forecast, and what-if analysis',
  },
  {
    key: 'reports',
    label: 'Scheduled Reports',
    icon: CalendarDays,
    color: 'text-purple-500',
    hint: 'Set up automated AI-powered report delivery',
  },
  {
    key: 'lenses',
    label: 'Lenses',
    icon: Layers,
    color: 'text-indigo-500',
    hint: 'Pre-configured analysis contexts for specific domains',
  },
  {
    key: 'embeds',
    label: 'Embeds',
    icon: Globe,
    color: 'text-teal-500',
    hint: 'Create embeddable insight widgets for external sites',
  },
  {
    key: 'authoring',
    label: 'Authoring',
    icon: Database,
    color: 'text-orange-500',
    hint: 'Define custom metrics and dimensions for the AI layer',
  },
  {
    key: 'history',
    label: 'History',
    icon: History,
    color: 'text-rose-500',
    hint: 'Review, reopen, and export past conversations',
  },
] as const;

type TabKey = (typeof TABS)[number]['key'];

// ── Skeleton for lazy-loading tabs ─────────────────────────────────

function TabSkeleton() {
  return (
    <div className="flex items-center justify-center py-16">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-border border-t-primary" />
    </div>
  );
}

// ── AiToolsContent ─────────────────────────────────────────────────

export default function AiToolsContent() {
  const [activeTab, setActiveTab] = useState<TabKey>('watchlist');

  const activeTabDef = TABS.find((t) => t.key === activeTab);

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center">
          <Wrench className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-foreground">AI Tools</h1>
          <p className="text-sm text-muted-foreground">
            Watchlists, analysis, reports, lenses, and more
          </p>
        </div>
      </div>

      {/* Overview guide */}
      <ToolGuide
        storageKey="ai-tools-overview"
        useCases={[
          'Track key business metrics',
          'Diagnose performance changes',
          'Automate report delivery',
          'Build custom AI queries',
        ]}
        steps={[
          { label: 'Choose a tool', detail: 'Select a tab below to access the tool you need.' },
          { label: 'Configure', detail: 'Set up metrics, schedules, or analysis parameters.' },
          { label: 'Get insights', detail: 'View results, export data, or share with your team.' },
        ]}
        example="Start with the Watchlist tab to pin your most important KPIs, then use Analysis Tools to investigate any unusual changes."
      />

      {/* Horizontal tab navigation */}
      <div className="border-b border-border">
        <nav className="-mb-px flex gap-1 overflow-x-auto">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`
                  inline-flex shrink-0 items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors
                  ${isActive
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'}
                `}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Active tab description */}
      {activeTabDef && (
        <div className="flex items-start gap-2 px-1">
          <Info className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground">{activeTabDef.hint}</p>
        </div>
      )}

      {/* Tab content */}
      <div>
        {activeTab === 'watchlist' && <WatchlistContent embedded />}
        {activeTab === 'analysis' && <ToolsContent embedded />}
        {activeTab === 'reports' && <ReportsContent embedded />}
        {activeTab === 'lenses' && <LensesContent embedded />}
        {activeTab === 'embeds' && <EmbedsContent embedded />}
        {activeTab === 'authoring' && <AuthoringContent embedded />}
        {activeTab === 'history' && <HistoryContent embedded />}
      </div>
    </div>
  );
}
