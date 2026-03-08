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
  getWebAppsGroupedByModule,
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
  locationId: string | undefined,
): string | null {
  if (app.defaultStatus === 'coming_soon') return null;

  if (app.urlSource === 'env' && app.envVar) {
    const base = ENV_VALUES[app.envVar] || '';
    if (!base) return null;
    if (app.key === 'member-portal' && tenantSlug) return `${base}/${tenantSlug}`;
    return base;
  }

  if (app.urlSource === 'origin' && app.urlPath) {
    let resolvedPath = app.urlPath;
    if (tenantSlug) resolvedPath = resolvedPath.replace('{tenantSlug}', tenantSlug);
    if (locationId) resolvedPath = resolvedPath.replace('{locationId}', locationId);
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

// ── Module helpers ──
function getModuleName(moduleKey: string): string {
  const def = MODULE_REGISTRY.find((m) => m.key === moduleKey);
  return def?.name ?? moduleKey;
}

function getModuleDescription(moduleKey: string): string | undefined {
  const def = MODULE_REGISTRY.find((m) => m.key === moduleKey);
  return def?.description;
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

function CategoryTag({ category }: { category: string }) {
  const label = category === 'customer_facing' ? 'Customer-Facing'
    : category === 'staff_tools' ? 'Staff Tool'
    : 'Integration';
  return (
    <span className="text-[11px] font-medium px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
      {label}
    </span>
  );
}

interface WebAppCardProps {
  app: WebAppDefinition;
  tenantSlug: string | undefined;
  locationId: string | undefined;
}

function WebAppCard({ app, tenantSlug, locationId }: WebAppCardProps) {
  const router = useRouter();
  const Icon = resolveIcon(app.icon);
  const url = resolveAppUrl(app, tenantSlug, locationId);
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

      <div className="flex flex-wrap gap-1 mb-4">
        <CategoryTag category={app.category} />
      </div>

      <div className="mt-auto">
        {status === 'active' && url && (
          <div className="space-y-3">
            <div className="bg-muted border border-border rounded-md px-3 py-2">
              {/* eslint-disable-next-line jsx-a11y/label-has-associated-control */}
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

// ── Category filter ──

const CATEGORY_OPTIONS: { value: WebAppCategory | null; label: string }[] = [
  { value: null, label: 'All' },
  { value: 'customer_facing', label: 'Customer-Facing' },
  { value: 'staff_tools', label: 'Staff Tools' },
];

interface CategoryFilterProps {
  selected: WebAppCategory | null;
  onSelect: (cat: WebAppCategory | null) => void;
  counts: { all: number; customer_facing: number; staff_tools: number };
}

function CategoryFilter({ selected, onSelect, counts }: CategoryFilterProps) {
  return (
    <div className="flex gap-1 bg-muted rounded-lg p-1">
      {CATEGORY_OPTIONS.map((opt) => {
        const count = opt.value === null ? counts.all
          : opt.value === 'customer_facing' ? counts.customer_facing
          : counts.staff_tools;
        if (count === 0 && opt.value !== null) return null;
        return (
          <button
            key={opt.value ?? 'all'}
            onClick={() => onSelect(opt.value)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              selected === opt.value
                ? 'bg-surface text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {opt.label}
            <span className="ml-1.5 text-xs opacity-70">{count}</span>
          </button>
        );
      })}
    </div>
  );
}

// ── Module filter bar ──

interface ModuleFilterBarProps {
  selectedModule: string | null;
  onSelect: (moduleKey: string | null) => void;
  moduleCounts: Record<string, number>;
  totalCount: number;
}

function ModuleFilterBar({ selectedModule, onSelect, moduleCounts, totalCount }: ModuleFilterBarProps) {
  const moduleKeys = useMemo(() => {
    return Object.keys(moduleCounts).sort((a, b) =>
      getModuleName(a).localeCompare(getModuleName(b)),
    );
  }, [moduleCounts]);

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
        All Modules
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

// ── Module section ──

interface ModuleSectionProps {
  moduleKey: string;
  apps: WebAppDefinition[];
  tenantSlug: string | undefined;
  locationId: string | undefined;
}

function ModuleSection({ moduleKey, apps, tenantSlug, locationId }: ModuleSectionProps) {
  if (apps.length === 0) return null;
  const desc = getModuleDescription(moduleKey);

  return (
    <div>
      <div className="mb-3">
        <h2 className="text-lg font-semibold text-foreground">{getModuleName(moduleKey)}</h2>
        {desc && <p className="text-sm text-muted-foreground">{desc}</p>}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {apps.map((app) => (
          <WebAppCard key={app.key} app={app} tenantSlug={tenantSlug} locationId={locationId} />
        ))}
      </div>
    </div>
  );
}

// ── Main content ──

export default function WebAppsContent() {
  const { tenant, locations } = useAuthContext();
  const locationId = locations?.[0]?.id;
  const { isModuleEnabled } = useEntitlementsContext();
  const [selectedCategory, setSelectedCategory] = useState<WebAppCategory | null>(null);
  const [selectedModule, setSelectedModule] = useState<string | null>(null);

  // Visible apps = those with at least one requiredModule enabled
  const visibleApps = useMemo(() => {
    return WEB_APP_REGISTRY.filter((app) =>
      app.requiredModules.some((m) => isModuleEnabled(m)),
    );
  }, [isModuleEnabled]);

  // Category counts (computed from all visible apps, before module filter)
  const categoryCounts = useMemo(() => {
    let customerFacing = 0;
    let staffTools = 0;
    for (const app of visibleApps) {
      if (app.category === 'customer_facing') customerFacing++;
      else if (app.category === 'staff_tools') staffTools++;
    }
    return { all: visibleApps.length, customer_facing: customerFacing, staff_tools: staffTools };
  }, [visibleApps]);

  // Filter by category first
  const categoryFilteredApps = useMemo(() => {
    if (selectedCategory === null) return visibleApps;
    return visibleApps.filter((app) => app.category === selectedCategory);
  }, [visibleApps, selectedCategory]);

  // Group by primary module (after category filter)
  const moduleGroups = useMemo(() => {
    return getWebAppsGroupedByModule([...categoryFilteredApps]);
  }, [categoryFilteredApps]);

  // Per-module counts for filter pills (reflects current category filter)
  const moduleCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const group of moduleGroups) {
      counts[group.moduleKey] = group.apps.length;
    }
    return counts;
  }, [moduleGroups]);

  const totalCount = useMemo(() => {
    return categoryFilteredApps.length;
  }, [categoryFilteredApps]);

  // Filtered groups based on selected module
  const filteredGroups = useMemo(() => {
    if (selectedModule === null) return moduleGroups;
    return moduleGroups.filter((g) => g.moduleKey === selectedModule);
  }, [moduleGroups, selectedModule]);

  // Reset module filter when category changes and the module no longer has apps
  function handleCategoryChange(cat: WebAppCategory | null) {
    setSelectedCategory(cat);
    setSelectedModule(null);
  }

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Web Apps</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage customer-facing and staff web applications, organized by module.
        </p>
      </div>

      <div className="space-y-3">
        <CategoryFilter
          selected={selectedCategory}
          onSelect={handleCategoryChange}
          counts={categoryCounts}
        />
        <ModuleFilterBar
          selectedModule={selectedModule}
          onSelect={setSelectedModule}
          moduleCounts={moduleCounts}
          totalCount={totalCount}
        />
      </div>

      <div className="space-y-8">
        {filteredGroups.map((group) => (
          <ModuleSection
            key={group.moduleKey}
            moduleKey={group.moduleKey}
            apps={group.apps}
            tenantSlug={tenant?.slug}
            locationId={locationId}
          />
        ))}
      </div>

      {filteredGroups.length === 0 && (
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
