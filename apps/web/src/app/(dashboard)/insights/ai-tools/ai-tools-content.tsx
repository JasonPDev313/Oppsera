'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import {
  Sparkles,
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

// ── Tab groups ─────────────────────────────────────────────────────

const DAILY_TABS = [
  { key: 'watchlist' as const, label: 'Watchlist', icon: BarChart3 },
  { key: 'analysis' as const, label: 'Analysis', icon: Search },
  { key: 'reports' as const, label: 'Reports', icon: CalendarDays },
  { key: 'history' as const, label: 'History', icon: History },
];

const ADMIN_TABS = [
  { key: 'lenses' as const, label: 'Lenses', icon: Layers },
  { key: 'embeds' as const, label: 'Embeds', icon: Globe },
  { key: 'authoring' as const, label: 'Authoring', icon: Database },
];

type TabKey = (typeof DAILY_TABS)[number]['key'] | (typeof ADMIN_TABS)[number]['key'];

// ── Skeleton for lazy-loading tabs ─────────────────────────────────

function TabSkeleton() {
  return (
    <div className="flex items-center justify-center py-16">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-border border-t-primary" />
    </div>
  );
}

// ── Tab Button ─────────────────────────────────────────────────────

function TabButton({
  tab,
  isActive,
  onClick,
}: {
  tab: { key: string; label: string; icon: React.ComponentType<{ className?: string }> };
  isActive: boolean;
  onClick: () => void;
}) {
  const Icon = tab.icon;
  return (
    <button
      onClick={onClick}
      className={`
        inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors
        ${isActive
          ? 'border-primary text-primary'
          : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'}
      `}
    >
      <Icon className="h-4 w-4" />
      {tab.label}
    </button>
  );
}

// ── AiToolsContent ─────────────────────────────────────────────────

export default function AiToolsContent() {
  const [activeTab, setActiveTab] = useState<TabKey>('watchlist');

  return (
    <div className="space-y-0 p-6">
      {/* Compact header */}
      <div className="flex items-center gap-2.5 mb-4">
        <Sparkles className="h-5 w-5 text-primary" />
        <h1 className="text-lg font-semibold text-foreground">AI Tools</h1>
      </div>

      {/* Tab navigation with grouped sections */}
      <div className="border-b border-border">
        <nav className="-mb-px flex items-center gap-0 overflow-x-auto">
          {DAILY_TABS.map((tab) => (
            <TabButton
              key={tab.key}
              tab={tab}
              isActive={activeTab === tab.key}
              onClick={() => setActiveTab(tab.key)}
            />
          ))}

          {/* Visual separator */}
          <div className="mx-2 h-5 w-px bg-border shrink-0" />

          {ADMIN_TABS.map((tab) => (
            <TabButton
              key={tab.key}
              tab={tab}
              isActive={activeTab === tab.key}
              onClick={() => setActiveTab(tab.key)}
            />
          ))}
        </nav>
      </div>

      {/* Tab content — no extra chrome */}
      <div className="pt-4">
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
