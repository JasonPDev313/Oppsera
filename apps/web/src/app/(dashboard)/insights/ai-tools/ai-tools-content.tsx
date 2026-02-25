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
} from 'lucide-react';

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
  { key: 'watchlist', label: 'Watchlist', icon: BarChart3 },
  { key: 'analysis', label: 'Analysis Tools', icon: Search },
  { key: 'reports', label: 'Scheduled Reports', icon: CalendarDays },
  { key: 'lenses', label: 'Lenses', icon: Layers },
  { key: 'embeds', label: 'Embeds', icon: Globe },
  { key: 'authoring', label: 'Authoring', icon: Database },
  { key: 'history', label: 'History', icon: History },
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
