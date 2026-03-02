'use client';

import { useState, useMemo } from 'react';
import {
  Copy,
  ExternalLink,
  Check,
  Globe,
  Settings2,
  UserCircle,
  QrCode,
  ClipboardList,
  ShoppingCart,
  CalendarCheck,
  Hotel,
  CalendarDays,
  UtensilsCrossed,
  Monitor,
  LayoutGrid,
  DoorOpen,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAuthContext } from '@/components/auth-provider';
import { useEntitlementsContext } from '@/components/entitlements-provider';
import {
  WEB_APP_REGISTRY,
  WEB_APP_CATEGORY_LABELS,
  getSortedWebApps,
  type WebAppDefinition,
  type WebAppCategory,
} from '@oppsera/shared';
import { MODULE_REGISTRY } from '@oppsera/core/entitlements/registry';

// ── Icon lookup (registry stores string names, frontend resolves) ──
const ICON_MAP: Record<string, LucideIcon> = {
  UserCircle,
  QrCode,
  ClipboardList,
  ShoppingCart,
  CalendarCheck,
  Hotel,
  CalendarDays,
  UtensilsCrossed,
  Monitor,
  LayoutGrid,
  DoorOpen,
};

function resolveIcon(name: string): LucideIcon {
  return ICON_MAP[name] ?? Globe;
}

// ── Env var static map (Next.js inlines NEXT_PUBLIC_* at build time) ──
const ENV_VALUES: Record<string, string> = {
  NEXT_PUBLIC_MEMBER_PORTAL_URL: process.env.NEXT_PUBLIC_MEMBER_PORTAL_URL ?? '',
  NEXT_PUBLIC_PORTAL_URL: process.env.NEXT_PUBLIC_PORTAL_URL ?? '',
  NEXT_PUBLIC_ADMIN_URL: process.env.NEXT_PUBLIC_ADMIN_URL ?? '',
};

function resolveAppUrl(
  app: WebAppDefinition,
  tenantSlug: string | undefined,
): string | null {
  if (app.defaultStatus === 'coming_soon') return null;

  if (app.urlSource === 'env' && app.envVar) {
    const base = ENV_VALUES[app.envVar] || '';
    if (!base) return null;
    // Member portal appends tenant slug
    if (app.key === 'member-portal' && tenantSlug) return `${base}/${tenantSlug}`;
    return base;
  }

  if (app.urlSource === 'origin' && app.urlPath) {
    // Interpolate {tenantSlug} placeholder if present
    const resolvedPath = tenantSlug
      ? app.urlPath.replace('{tenantSlug}', tenantSlug)
      : app.urlPath;
    if (typeof window === 'undefined') return resolvedPath;
    return `${window.location.origin}${resolvedPath}`;
  }

  return null;
}

type AppStatus = 'active' | 'not_configured' | 'coming_soon';

function resolveStatus(app: WebAppDefinition, url: string | null): AppStatus {
  if (app.defaultStatus === 'coming_soon') return 'coming_soon';
  if (app.urlSource === 'env' && !url) return 'not_configured';
  return 'active';
}

// ── Module name resolution ──
function getModuleName(moduleKey: string): string {
  const def = MODULE_REGISTRY.find((m) => m.key === moduleKey);
  return def?.name ?? moduleKey;
}

// ── Subcomponents ──

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      onClick={handleCopy}
      className="inline-flex items-center gap-1 text-sm text-indigo-500 hover:text-indigo-400 transition-colors"
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? 'Copied' : 'Copy link'}
    </button>
  );
}

function StatusBadge({ status }: { status: AppStatus }) {
  const map: Record<AppStatus, { label: string; className: string }> = {
    active: { label: 'Active', className: 'bg-green-500/10 text-green-500 border-green-500/30' },
    not_configured: { label: 'Not Configured', className: 'bg-amber-500/10 text-amber-500 border-amber-500/30' },
    coming_soon: { label: 'Coming Soon', className: 'bg-muted text-muted-foreground border-border' },
  };
  const badge = map[status];
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${badge.className}`}>
      {badge.label}
    </span>
  );
}

function ModuleTag({ moduleKey }: { moduleKey: string }) {
  return (
    <span className="text-[11px] font-medium px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
      {getModuleName(moduleKey)}
    </span>
  );
}

interface WebAppCardProps {
  app: WebAppDefinition;
  tenantSlug: string | undefined;
}

function WebAppCard({ app, tenantSlug }: WebAppCardProps) {
  const router = useRouter();
  const Icon = resolveIcon(app.icon);
  const url = resolveAppUrl(app, tenantSlug);
  const status = resolveStatus(app, url);

  return (
    <div className="bg-surface border border-border rounded-lg p-5 flex flex-col">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div
            className={`h-10 w-10 rounded-lg flex items-center justify-center ${
              status === 'active'
                ? 'bg-indigo-500/10 text-indigo-500'
                : 'bg-muted text-muted-foreground'
            }`}
          >
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground">{app.name}</h3>
            <StatusBadge status={status} />
          </div>
        </div>
      </div>

      <p className="text-sm text-muted-foreground mb-3">{app.description}</p>

      {/* Module tags */}
      <div className="flex flex-wrap gap-1 mb-4">
        {app.associatedModules.map((m) => (
          <ModuleTag key={m} moduleKey={m} />
        ))}
      </div>

      <div className="mt-auto">
        {status === 'active' && url && (
          <div className="space-y-3">
            <div className="bg-muted border border-border rounded-md px-3 py-2">
              <label className="block text-xs font-medium text-muted-foreground mb-1">URL</label>
              <div className="flex items-center justify-between gap-2">
                <code className="text-sm text-foreground truncate">{url}</code>
                <CopyButton text={url} />
              </div>
            </div>

            {app.helpTextActive && (
              <p className="text-xs text-muted-foreground">{app.helpTextActive}</p>
            )}

            <div className="flex gap-2">
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-500 transition-colors"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Open
              </a>
              {app.settingsRoute && (
                <button
                  onClick={() => router.push(app.settingsRoute!)}
                  className="inline-flex items-center gap-1.5 text-sm bg-surface border border-border text-foreground px-3 py-1.5 rounded-lg hover:bg-accent transition-colors"
                >
                  <Settings2 className="h-3.5 w-3.5" />
                  Configure
                </button>
              )}
            </div>
          </div>
        )}

        {status === 'not_configured' && app.helpTextNotConfigured && (
          <p className="text-xs text-amber-500 bg-amber-500/10 border border-amber-500/30 rounded-md px-3 py-2">
            {app.helpTextNotConfigured}
          </p>
        )}
      </div>
    </div>
  );
}

// ── Filter bar ──

interface FilterBarProps {
  selectedModule: string | null;
  onSelect: (moduleKey: string | null) => void;
  moduleCounts: Record<string, number>;
  enabledModules: Set<string>;
}

function FilterBar({ selectedModule, onSelect, moduleCounts, enabledModules }: FilterBarProps) {
  // Get all module keys that have visible apps, sorted by module name
  const moduleKeys = useMemo(() => {
    return Object.keys(moduleCounts)
      .filter((k) => enabledModules.has(k))
      .sort((a, b) => getModuleName(a).localeCompare(getModuleName(b)));
  }, [moduleCounts, enabledModules]);

  const totalCount = useMemo(() => {
    // Count unique visible apps across all enabled modules
    const seen = new Set<string>();
    for (const app of WEB_APP_REGISTRY) {
      if (app.requiredModules.some((m) => enabledModules.has(m))) {
        seen.add(app.key);
      }
    }
    return seen.size;
  }, [enabledModules]);

  return (
    <div className="flex flex-wrap gap-2">
      <button
        onClick={() => onSelect(null)}
        className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
          selectedModule === null
            ? 'bg-indigo-600 text-white'
            : 'bg-muted text-muted-foreground hover:bg-accent'
        }`}
      >
        All
        <span className="ml-1.5 text-xs opacity-70">{totalCount}</span>
      </button>
      {moduleKeys.map((moduleKey) => (
        <button
          key={moduleKey}
          onClick={() => onSelect(moduleKey)}
          className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
            selectedModule === moduleKey
              ? 'bg-indigo-600 text-white'
              : 'bg-muted text-muted-foreground hover:bg-accent'
          }`}
        >
          {getModuleName(moduleKey)}
          <span className="ml-1.5 text-xs opacity-70">{moduleCounts[moduleKey]}</span>
        </button>
      ))}
    </div>
  );
}

// ── Category section ──

interface CategorySectionProps {
  category: WebAppCategory;
  apps: WebAppDefinition[];
  tenantSlug: string | undefined;
}

function CategorySection({ category, apps, tenantSlug }: CategorySectionProps) {
  if (apps.length === 0) return null;

  return (
    <div>
      <h2 className="text-lg font-semibold text-foreground mb-3">
        {WEB_APP_CATEGORY_LABELS[category]}
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {apps.map((app) => (
          <WebAppCard key={app.key} app={app} tenantSlug={tenantSlug} />
        ))}
      </div>
    </div>
  );
}

// ── Main content ──

export default function WebAppsContent() {
  const { tenant } = useAuthContext();
  const { isModuleEnabled } = useEntitlementsContext();
  const [selectedModule, setSelectedModule] = useState<string | null>(null);

  // Build the set of enabled modules (for filtering pills and visibility)
  const enabledModules = useMemo(() => {
    const set = new Set<string>();
    for (const app of WEB_APP_REGISTRY) {
      for (const m of app.associatedModules) {
        if (isModuleEnabled(m)) set.add(m);
      }
    }
    return set;
  }, [isModuleEnabled]);

  // Visible apps = those with at least one requiredModule enabled
  const visibleApps = useMemo(() => {
    return getSortedWebApps().filter((app) =>
      app.requiredModules.some((m) => isModuleEnabled(m)),
    );
  }, [isModuleEnabled]);

  // Per-module counts (how many visible apps list that module)
  const moduleCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const app of visibleApps) {
      for (const m of app.associatedModules) {
        if (enabledModules.has(m)) {
          counts[m] = (counts[m] ?? 0) + 1;
        }
      }
    }
    return counts;
  }, [visibleApps, enabledModules]);

  // Filtered apps based on selected module
  const filteredApps = useMemo(() => {
    if (selectedModule === null) return visibleApps;
    return visibleApps.filter((app) => app.associatedModules.includes(selectedModule));
  }, [visibleApps, selectedModule]);

  // Group by category for "All" view
  const categories: WebAppCategory[] = ['customer_facing', 'staff_tools', 'integrations'];
  const appsByCategory = useMemo(() => {
    const map: Record<WebAppCategory, WebAppDefinition[]> = {
      customer_facing: [],
      staff_tools: [],
      integrations: [],
    };
    for (const app of filteredApps) {
      map[app.category].push(app);
    }
    return map;
  }, [filteredApps]);

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Web Apps</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage customer-facing and staff web applications. Filter by module to find relevant apps.
        </p>
      </div>

      <FilterBar
        selectedModule={selectedModule}
        onSelect={setSelectedModule}
        moduleCounts={moduleCounts}
        enabledModules={enabledModules}
      />

      {selectedModule === null ? (
        // Grouped by category
        <div className="space-y-8">
          {categories.map((cat) => (
            <CategorySection
              key={cat}
              category={cat}
              apps={appsByCategory[cat]}
              tenantSlug={tenant?.slug}
            />
          ))}
        </div>
      ) : (
        // Flat grid for module filter
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredApps.map((app) => (
            <WebAppCard key={app.key} app={app} tenantSlug={tenant?.slug} />
          ))}
        </div>
      )}

      {filteredApps.length === 0 && (
        <div className="text-center py-12">
          <Globe className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-50" />
          <p className="text-muted-foreground text-sm">
            No web apps available for this filter. Enable more modules to see additional apps.
          </p>
        </div>
      )}
    </div>
  );
}
