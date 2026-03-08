'use client';

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  CheckCircle, ChevronRight, ChevronLeft, ChefHat, Sparkles,
  Monitor, Plus, Trash2, AlertTriangle, ArrowLeft, Settings2, ExternalLink,
  MapPin, Info,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/toast';
import { useAuthContext } from '@/components/auth-provider';
import { apiFetch } from '@/lib/api-client';
import { useDepartments, useAllCategories } from '@/hooks/use-catalog';
import {
  recommendRoutingForDepartments,
  findBestStation,
  NO_KDS_STATION_ID,
} from '@/lib/kds-routing-recommender';
import Link from 'next/link';

// ── Types ────────────────────────────────────────────────────────

interface DraftStation {
  localId: string;
  name: string;
  displayName: string;
  stationType: string;
  color: string;
}

interface CreatedStation {
  id: string;
  name: string;
  displayName: string;
  stationType: string;
  isActive: boolean;
}

interface AuditItem {
  id: string;
  name: string;
  itemType: string;
  categoryName: string | null;
  suggested: 'food' | 'beverage' | null;
}

interface VerifyCheck {
  key: string;
  pass: boolean;
  message: string;
}

type RoutingMode = 'single' | 'smart' | 'skip';

// ── Constants ────────────────────────────────────────────────────

const STEPS = ['Welcome', 'Kitchen Type', 'Stations', 'Menu Check', 'Routing', 'Go Live'];

const STATION_COLORS = [
  '#6366f1', '#f59e0b', '#14b8a6', '#e11d48', '#8b5cf6',
  '#22c55e', '#f97316', '#06b6d4', '#ec4899', '#64748b',
];

const STATION_COLOR_NAMES: Record<string, string> = {
  '#6366f1': 'Indigo',
  '#f59e0b': 'Amber',
  '#14b8a6': 'Teal',
  '#e11d48': 'Rose',
  '#8b5cf6': 'Purple',
  '#22c55e': 'Green',
  '#f97316': 'Orange',
  '#06b6d4': 'Cyan',
  '#ec4899': 'Pink',
  '#64748b': 'Slate',
};

const STATION_TYPE_LABELS: Record<string, string> = {
  prep: 'Prep / Kitchen',
  expo: 'Expo / Window',
  bar: 'Bar',
  grill: 'Grill',
  fry: 'Fryer',
  salad: 'Salad / Cold',
  dessert: 'Dessert / Pastry',
  pizza: 'Pizza',
  custom: 'Custom',
};

interface TemplateStation {
  name: string;
  displayName: string;
  stationType: string;
  color: string;
}

interface KdsTemplate {
  id: string;
  label: string;
  description: string;
  stations: TemplateStation[];
}

const KDS_TEMPLATES: KdsTemplate[] = [
  {
    id: 'single',
    label: 'Single Kitchen',
    description: 'One station handles all food orders',
    stations: [
      { name: 'Kitchen', displayName: 'Kitchen', stationType: 'prep', color: '#6366f1' },
    ],
  },
  {
    id: 'kitchen_bar',
    label: 'Kitchen + Bar',
    description: 'Separate food prep and drink prep',
    stations: [
      { name: 'Kitchen', displayName: 'Kitchen', stationType: 'prep', color: '#6366f1' },
      { name: 'Bar', displayName: 'Bar', stationType: 'bar', color: '#f59e0b' },
    ],
  },
  {
    id: 'kitchen_bar_expo',
    label: 'Kitchen + Bar + Expo',
    description: 'Full service with expeditor window',
    stations: [
      { name: 'Kitchen', displayName: 'Kitchen', stationType: 'prep', color: '#6366f1' },
      { name: 'Bar', displayName: 'Bar', stationType: 'bar', color: '#f59e0b' },
      { name: 'Expo', displayName: 'Expo', stationType: 'expo', color: '#14b8a6' },
    ],
  },
  {
    id: 'pizzeria',
    label: 'Pizzeria',
    description: 'Pizza station with prep and expo',
    stations: [
      { name: 'Pizza', displayName: 'Pizza', stationType: 'pizza', color: '#e11d48' },
      { name: 'Kitchen', displayName: 'Kitchen', stationType: 'prep', color: '#6366f1' },
      { name: 'Expo', displayName: 'Expo', stationType: 'expo', color: '#14b8a6' },
    ],
  },
  {
    id: 'custom',
    label: 'Custom',
    description: 'Start from scratch — add stations manually',
    stations: [],
  },
];

// ── Item type heuristic (reuses keyword approach from kds-routing-recommender) ──

const BEVERAGE_KEYWORDS = [
  'beer', 'wine', 'cocktail', 'drink', 'beverage', 'soda', 'juice',
  'smoothie', 'coffee', 'tea', 'espresso', 'latte', 'cappuccino',
  'water', 'lemonade', 'margarita', 'mojito', 'martini', 'mimosa',
  'spirit', 'liquor', 'ale', 'stout', 'ipa', 'cider', 'mocktail',
  'milkshake', 'shake', 'draft', 'bottle',
];

const NON_FOOD_KEYWORDS = [
  'apparel', 'clothing', 'shirt', 'hat', 'cap', 'shoe', 'shoes',
  'merchandise', 'merch', 'pro shop', 'gift card', 'gift certificate',
  'equipment', 'gear', 'supplies', 'rental', 'rentals',
  'lesson', 'lessons', 'instruction', 'clinic', 'membership',
  'greens fee', 'green fee', 'range', 'locker',
  'spa', 'massage', 'fitness', 'gym',
  'voucher', 'coupon', 'surcharge', 'gratuity', 'fee', 'fees',
];

function guessItemType(name: string): 'food' | 'beverage' | null {
  const lower = name.toLowerCase();
  const tokens = lower.replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);

  // Check if it's clearly non-food
  for (const kw of NON_FOOD_KEYWORDS) {
    if (kw.includes(' ') ? lower.includes(kw) : tokens.includes(kw)) return null;
  }

  // Check if it's a beverage
  for (const kw of BEVERAGE_KEYWORDS) {
    if (kw.includes(' ') ? lower.includes(kw) : tokens.includes(kw)) return 'beverage';
  }

  // Default suggestion: food (most common case for items that aren't clearly non-food)
  return 'food';
}

// ── Component ────────────────────────────────────────────────────

export default function KdsSetupContent() {
  const router = useRouter();
  const { toast } = useToast();
  const { locations } = useAuthContext();
  const [locationId, setLocationId] = useState(locations?.[0]?.id ?? '');
  const hasMultipleLocations = (locations?.length ?? 0) > 1;
  const locationName = locations?.find((l) => l.id === locationId)?.name ?? '';

  // Stable local ID generator (useRef survives HMR + StrictMode double-mount)
  const nextLocalId = useRef(1);
  const genLocalId = useCallback(() => `draft-${nextLocalId.current++}`, []);

  // Pre-fetch departments for Step 4 routing
  const { data: departments } = useDepartments();
  const { data: allCategories } = useAllCategories();

  // ── Wizard state ──
  const [step, setStep] = useState(0);
  const [templateKey, setTemplateKey] = useState<string | null>(null);
  const [stations, setStations] = useState<DraftStation[]>([]);
  const [createdStations, setCreatedStations] = useState<CreatedStation[]>([]);
  const [auditItems, setAuditItems] = useState<AuditItem[] | null>(null);
  const [itemTypeDecisions, setItemTypeDecisions] = useState<Record<string, 'food' | 'beverage' | 'retail'>>({});
  const [routingMode, setRoutingMode] = useState<RoutingMode>('smart');
  const [verifyChecks, setVerifyChecks] = useState<VerifyCheck[] | null>(null);
  const [isWorking, setIsWorking] = useState(false);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);

  // ── Step progression handlers ──

  const handleSelectTemplate = useCallback((id: string) => {
    setTemplateKey(id);
    const template = KDS_TEMPLATES.find((t) => t.id === id);
    if (template) {
      setStations(
        template.stations.map((s) => ({
          localId: genLocalId(),
          ...s,
        })),
      );
    }
  }, []);

  const handleAddStation = useCallback(() => {
    const colorIdx = stations.length % STATION_COLORS.length;
    setStations((prev) => [
      ...prev,
      {
        localId: genLocalId(),
        name: '',
        displayName: '',
        stationType: 'prep',
        color: STATION_COLORS[colorIdx]!,
      },
    ]);
  }, [stations.length]);

  const handleRemoveStation = useCallback((localId: string) => {
    setStations((prev) => prev.filter((s) => s.localId !== localId));
  }, []);

  const handleUpdateStation = useCallback((localId: string, updates: Partial<DraftStation>) => {
    setStations((prev) =>
      prev.map((s) => {
        if (s.localId !== localId) return s;
        const merged = { ...s, ...updates };
        // Sync displayName from name if displayName hasn't been independently set
        if (updates.name && !updates.displayName) {
          merged.displayName = updates.name;
        }
        return merged;
      }),
    );
  }, []);

  // Step 2 → 3: Create stations, then fetch audit
  const handleCreateStations = useCallback(async () => {
    if (stations.length === 0) {
      setErrorDetail('Add at least one station to continue.');
      return;
    }
    const unnamed = stations.find((s) => !s.name.trim());
    if (unnamed) {
      setErrorDetail('All stations need a name.');
      return;
    }
    setIsWorking(true);
    setErrorDetail(null);
    try {
      const created: CreatedStation[] = [];
      // Sequential to avoid pool exhaustion (gotcha #1)
      for (const draft of stations) {
        const res = await apiFetch<{ data: { id: string; name: string; displayName: string; stationType: string; isActive: boolean } }>(
          '/api/v1/fnb/stations',
          {
            method: 'POST',
            headers: { 'X-Location-Id': locationId },
            body: JSON.stringify({
              name: draft.name.trim(),
              displayName: draft.displayName.trim() || draft.name.trim(),
              stationType: draft.stationType,
              color: draft.color || undefined,
            }),
          },
        );
        created.push(res.data);
      }
      setCreatedStations(created);

      // Fetch menu audit data
      const audit = await apiFetch<{ data: Array<{ id: string; name: string; itemType: string; categoryName: string | null }> }>(
        '/api/v1/fnb/kds-setup/audit',
      );
      const withSuggestions: AuditItem[] = audit.data.map((item) => ({
        ...item,
        suggested: guessItemType(item.name),
      }));
      setAuditItems(withSuggestions);

      // Pre-fill decisions with suggestions
      const decisions: Record<string, 'food' | 'beverage' | 'retail'> = {};
      for (const item of withSuggestions) {
        if (item.suggested) {
          decisions[item.id] = item.suggested;
        }
      }
      setItemTypeDecisions(decisions);

      setStep(3);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('duplicate') || message.includes('unique') || message.includes('already exists')) {
        setErrorDetail(`A station with that name already exists at this location. Rename and try again.`);
      } else {
        setErrorDetail(message);
      }
      toast.error('Failed to create stations');
    } finally {
      setIsWorking(false);
    }
  }, [stations, locationId, toast]);

  // Step 3 → 4: Apply audit fixes
  const handleApplyAudit = useCallback(async () => {
    setIsWorking(true);
    setErrorDetail(null);
    try {
      // Only submit items where the user changed the type
      const updates = (auditItems ?? [])
        .filter((item) => {
          const decision = itemTypeDecisions[item.id];
          return decision && decision !== item.itemType;
        })
        .map((item) => ({
          itemId: item.id,
          itemType: itemTypeDecisions[item.id]!,
        }));

      if (updates.length > 0) {
        const res = await apiFetch<{ data: { updated: number; failed: Array<{ itemId: string; error: string }> } }>(
          '/api/v1/catalog/items/bulk-type',
          {
            method: 'POST',
            body: JSON.stringify({ updates }),
          },
        );
        const { updated, failed } = res.data;
        if (failed.length > 0) {
          toast.info(`Updated ${updated} item${updated !== 1 ? 's' : ''}, ${failed.length} failed`);
        } else {
          toast.success(`Updated ${updated} item${updated !== 1 ? 's' : ''}`);
        }
      }
      setStep(4);
    } catch (err) {
      setErrorDetail(err instanceof Error ? err.message : String(err));
      toast.error('Failed to update item types');
    } finally {
      setIsWorking(false);
    }
  }, [auditItems, itemTypeDecisions, toast]);

  // Step 4 → 5: Apply routing + verify
  const handleApplyRouting = useCallback(async () => {
    setIsWorking(true);
    setErrorDetail(null);
    try {
      if (routingMode === 'smart' && departments && departments.length > 0) {
        // Build department data for recommender
        const deptInput = departments.map((dept) => ({
          id: dept.id,
          name: dept.name,
          children: (allCategories ?? [])
            .filter((c) => c.parentId === dept.id)
            .map((c) => ({ id: c.id, name: c.name })),
        }));

        const recommendations = recommendRoutingForDepartments(deptInput);

        // Create routing rules for each recommendation
        for (const rec of recommendations) {
          if (rec.recommendedStationType === 'none') continue;
          const match = findBestStation(rec.recommendedStationType, createdStations);
          if (!match || match.id === NO_KDS_STATION_ID) continue;

          try {
            await apiFetch('/api/v1/fnb/kds-settings/routing-rules', {
              method: 'POST',
              headers: { 'X-Location-Id': locationId },
              body: JSON.stringify({
                ruleType: 'department',
                departmentId: rec.departmentId,
                stationId: match.id,
                priority: 10,
                ruleName: `${rec.departmentName} → ${match.name}`,
                clientRequestId: crypto.randomUUID(),
              }),
            });
          } catch {
            // Continue on individual rule failure — best effort
          }
        }
      }

      // Run verification (retry once on transient failure)
      let verify: { data: { checks: VerifyCheck[]; canLaunch: boolean } };
      try {
        verify = await apiFetch<{ data: { checks: VerifyCheck[]; canLaunch: boolean } }>(
          `/api/v1/fnb/kds-setup/verify`,
          { headers: { 'X-Location-Id': locationId } },
        );
      } catch {
        // Single retry after brief pause — handles transient DB pool exhaustion
        await new Promise((r) => setTimeout(r, 1500));
        verify = await apiFetch<{ data: { checks: VerifyCheck[]; canLaunch: boolean } }>(
          `/api/v1/fnb/kds-setup/verify`,
          { headers: { 'X-Location-Id': locationId } },
        );
      }
      setVerifyChecks(verify.data.checks);
      setStep(5);
    } catch (err) {
      setErrorDetail(err instanceof Error ? err.message : String(err));
      toast.error('Failed to configure routing');
    } finally {
      setIsWorking(false);
    }
  }, [routingMode, departments, allCategories, createdStations, locationId, toast]);

  // Load verify on direct navigation to step 5
  useEffect(() => {
    if (step === 5 && !verifyChecks) {
      apiFetch<{ data: { checks: VerifyCheck[]; canLaunch: boolean } }>(
        `/api/v1/fnb/kds-setup/verify`,
        { headers: { 'X-Location-Id': locationId } },
      ).then((res) => {
        setVerifyChecks(res.data.checks);
      }).catch((err) => {
        setErrorDetail(err instanceof Error ? err.message : 'Failed to run verification checks');
      });
    }
  }, [step, verifyChecks, locationId]);

  // Count how many items the user has decided to change
  const auditChangeCount = useMemo(
    () =>
      (auditItems ?? []).filter(
        (item) => itemTypeDecisions[item.id] && itemTypeDecisions[item.id] !== item.itemType,
      ).length,
    [auditItems, itemTypeDecisions],
  );

  const nonExpoStationCount = createdStations.filter((s) => s.stationType !== 'expo').length;

  // Derive canLaunch from verify checks (stations_active + food_items_exist must pass)
  const canLaunch = verifyChecks
    ? verifyChecks.filter((c) => c.key !== 'routing_configured').every((c) => c.pass)
    : false;

  // ── Render ──

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <Link
          href="/kds/settings"
          className="rounded-lg p-2 text-muted-foreground hover:bg-accent"
          aria-label="Back to KDS Settings"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-semibold text-foreground">KDS Setup Wizard</h1>
          <p className="text-sm text-muted-foreground">
            Get your kitchen display system up and running
          </p>
        </div>
        {/* Persistent location badge — always visible so users know which location they're configuring */}
        {step > 0 && locationName && (
          <div className="flex items-center gap-1.5 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3 py-1">
            <MapPin className="h-3.5 w-3.5 text-indigo-400" />
            <span className="text-xs font-medium text-indigo-400">{locationName}</span>
          </div>
        )}
      </div>

      {/* Progress */}
      <div className="mb-8 flex items-center gap-2">
        {STEPS.map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium ${
                i < step
                  ? 'bg-green-500/15 text-green-500'
                  : i === step
                    ? 'bg-indigo-600 text-white'
                    : 'bg-muted text-muted-foreground'
              }`}
            >
              {i < step ? <CheckCircle className="h-5 w-5" /> : i + 1}
            </div>
            {i < STEPS.length - 1 && (
              <div className={`h-0.5 w-8 ${i < step ? 'bg-green-500/40' : 'bg-muted'}`} />
            )}
          </div>
        ))}
      </div>

      {/* Error banner */}
      {errorDetail && (
        <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
          {errorDetail}
        </div>
      )}

      {/* ── Step 0: Welcome ── */}
      {step === 0 && (
        <div className="text-center space-y-4">
          <ChefHat className="mx-auto h-16 w-16 text-indigo-500" />
          <h2 className="text-xl font-semibold text-foreground">
            Let&apos;s Set Up Your Kitchen Display
          </h2>
          <p className="text-muted-foreground">
            We&apos;ll walk you through creating kitchen stations, making sure your menu items are
            configured correctly, and setting up order routing — all in a few simple steps.
          </p>

          {/* Location selector */}
          <div className="mx-auto max-w-sm rounded-lg border-2 border-indigo-500/30 bg-indigo-500/5 p-5 text-left">
            <div className="flex items-center gap-2 mb-3">
              <MapPin className="h-5 w-5 text-indigo-400" />
              <span className="text-sm font-semibold text-foreground">
                Which location is this KDS for?
              </span>
            </div>
            {hasMultipleLocations ? (
              <>
                <select
                  id="kds-setup-location"
                  value={locationId}
                  onChange={(e) => setLocationId(e.target.value)}
                  className="w-full rounded-lg border border-input bg-surface px-3 py-2.5 text-sm font-medium text-foreground focus:border-indigo-500 focus:outline-none"
                >
                  {locations?.map((loc) => (
                    <option key={loc.id} value={loc.id}>{loc.name}</option>
                  ))}
                </select>
                <div className="mt-3 flex gap-2 rounded-lg bg-amber-500/10 border border-amber-500/20 p-2.5">
                  <Info className="h-4 w-4 shrink-0 text-amber-400 mt-0.5" />
                  <p className="text-xs text-amber-300/90 leading-relaxed">
                    KDS stations only show orders from the <strong>same location</strong>. Pick the
                    location where your POS terminals ring up orders. Each location needs its own setup.
                  </p>
                </div>
              </>
            ) : (
              <p className="text-sm font-semibold text-indigo-400">{locationName}</p>
            )}
          </div>

          <button
            type="button"
            onClick={() => setStep(1)}
            disabled={!locationId}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-6 py-3 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            Get Started <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* ── Step 1: Kitchen Template ── */}
      {step === 1 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-foreground">Choose Your Kitchen Layout</h2>
          <p className="text-sm text-muted-foreground">
            Pick a template that matches your kitchen. You can customize stations in the next step.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {KDS_TEMPLATES.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => handleSelectTemplate(t.id)}
                className={`rounded-lg border-2 p-4 text-left transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1 ${
                  templateKey === t.id
                    ? 'border-indigo-600 bg-indigo-500/10'
                    : 'border-border hover:border-input'
                }`}
              >
                <h3 className="text-sm font-semibold text-foreground">{t.label}</h3>
                <p className="mt-1 text-xs text-muted-foreground">{t.description}</p>
                {t.stations.length > 0 && (
                  <div className="mt-2 flex gap-1.5">
                    {t.stations.map((s) => (
                      <span
                        key={s.name}
                        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
                        style={{ backgroundColor: `${s.color}20`, color: s.color }}
                      >
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: s.color }}
                        />
                        {s.displayName}
                      </span>
                    ))}
                  </div>
                )}
                {t.id === 'custom' && (
                  <div className="mt-2 text-xs text-muted-foreground italic">
                    You&apos;ll add stations in the next step
                  </div>
                )}
              </button>
            ))}
          </div>
          <div className="flex justify-between pt-4">
            <button
              type="button"
              onClick={() => setStep(0)}
              className="inline-flex items-center gap-1 rounded-lg border border-input px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-accent"
            >
              <ChevronLeft className="h-4 w-4" /> Back
            </button>
            <button
              type="button"
              onClick={() => templateKey && setStep(2)}
              disabled={!templateKey}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* ── Step 2: Station Review & Customize ── */}
      {step === 2 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-foreground">Review Your Stations</h2>
          <p className="text-sm text-muted-foreground">
            Customize station names, types, and colors. Add or remove as needed.
          </p>

          {stations.length === 0 && (
            <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              No stations yet. Click &ldquo;Add Station&rdquo; below to get started.
            </div>
          )}

          <div className="space-y-3">
            {stations.map((station) => (
              <div
                key={station.localId}
                className="rounded-lg border border-border p-4 space-y-3"
              >
                <div className="flex items-start gap-3">
                  <div
                    className="mt-1 h-4 w-4 rounded-full shrink-0"
                    style={{ backgroundColor: station.color }}
                  />
                  <div className="flex-1 space-y-2">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Station name"
                        value={station.name}
                        onChange={(e) =>
                          handleUpdateStation(station.localId, { name: e.target.value })
                        }
                        className="flex-1 rounded-lg border border-input bg-surface px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:outline-none"
                      />
                      <select
                        value={station.stationType}
                        onChange={(e) =>
                          handleUpdateStation(station.localId, { stationType: e.target.value })
                        }
                        className="rounded-lg border border-input bg-surface px-2 py-1.5 text-sm text-foreground focus:border-indigo-500 focus:outline-none"
                      >
                        {Object.entries(STATION_TYPE_LABELS).map(([value, label]) => (
                          <option key={value} value={value}>{label}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Color:</span>
                      <div className="flex gap-1">
                        {STATION_COLORS.map((c) => (
                          <button
                            key={c}
                            type="button"
                            onClick={() => handleUpdateStation(station.localId, { color: c })}
                            className={`h-5 w-5 rounded-full border-2 transition-transform focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1 ${
                              station.color === c ? 'border-foreground scale-110' : 'border-transparent'
                            }`}
                            style={{ backgroundColor: c }}
                            aria-label={STATION_COLOR_NAMES[c] ?? c}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveStation(station.localId)}
                    className="shrink-0 rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-red-400"
                    aria-label="Remove station"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={handleAddStation}
            className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-2 text-sm text-muted-foreground hover:bg-accent"
          >
            <Plus className="h-4 w-4" /> Add Station
          </button>

          <div className="flex justify-between pt-4">
            <button
              type="button"
              onClick={() => { setStep(1); setErrorDetail(null); }}
              className="inline-flex items-center gap-1 rounded-lg border border-input px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-accent"
            >
              <ChevronLeft className="h-4 w-4" /> Back
            </button>
            <button
              type="button"
              onClick={handleCreateStations}
              disabled={isWorking || stations.length === 0}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              {isWorking ? 'Creating stations...' : 'Create & Continue'}
            </button>
          </div>
        </div>
      )}

      {/* ── Step 3: Menu Audit ── */}
      {step === 3 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-foreground">Menu Item Check</h2>
          <p className="text-sm text-muted-foreground">
            Items must be typed as <strong>Food</strong> or <strong>Beverage</strong> to appear on
            KDS. We found items currently typed as &ldquo;Retail&rdquo; that may need updating.
          </p>

          {auditItems && auditItems.length === 0 && (
            <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-4 text-center">
              <CheckCircle className="mx-auto h-8 w-8 text-green-500" />
              <p className="mt-2 text-sm font-medium text-green-400">
                All items are already typed correctly — nothing to fix!
              </p>
            </div>
          )}

          {auditItems && auditItems.length > 0 && (
            <>
              {/* Bulk actions */}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const bulk: Record<string, 'food' | 'beverage' | 'retail'> = {};
                    for (const item of auditItems) bulk[item.id] = 'food';
                    setItemTypeDecisions(bulk);
                  }}
                  className="rounded-lg border border-input px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent"
                >
                  Mark All as Food
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const bulk: Record<string, 'food' | 'beverage' | 'retail'> = {};
                    for (const item of auditItems) bulk[item.id] = 'beverage';
                    setItemTypeDecisions(bulk);
                  }}
                  className="rounded-lg border border-input px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent"
                >
                  Mark All as Beverage
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const bulk: Record<string, 'food' | 'beverage' | 'retail'> = {};
                    for (const item of auditItems) bulk[item.id] = 'retail';
                    setItemTypeDecisions(bulk);
                  }}
                  className="rounded-lg border border-input px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent"
                >
                  Keep All as Retail
                </button>
              </div>

              {/* Item list */}
              <div className="max-h-80 space-y-1 overflow-y-auto rounded-lg border border-border">
                {auditItems.map((item) => {
                  const decision = itemTypeDecisions[item.id] ?? item.itemType;
                  return (
                    <div
                      key={item.id}
                      className="flex items-center gap-3 border-b border-border px-3 py-2 last:border-b-0"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">{item.name}</p>
                        {item.categoryName && (
                          <p className="truncate text-xs text-muted-foreground">
                            {item.categoryName}
                          </p>
                        )}
                      </div>
                      <div className="flex shrink-0 gap-1">
                        {(['food', 'beverage', 'retail'] as const).map((type) => (
                          <button
                            key={type}
                            type="button"
                            onClick={() =>
                              setItemTypeDecisions((prev) => ({ ...prev, [item.id]: type }))
                            }
                            className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                              decision === type
                                ? type === 'food'
                                  ? 'bg-green-500/20 text-green-400'
                                  : type === 'beverage'
                                    ? 'bg-blue-500/20 text-blue-400'
                                    : 'bg-muted text-muted-foreground'
                                : 'text-muted-foreground hover:bg-accent'
                            }`}
                          >
                            {type === 'food' ? 'Food' : type === 'beverage' ? 'Bev' : 'Retail'}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>

              {auditChangeCount > 0 && (
                <p className="text-xs text-muted-foreground">
                  {auditChangeCount} item{auditChangeCount > 1 ? 's' : ''} will be updated
                </p>
              )}
            </>
          )}

          <div className="flex justify-between pt-4">
            <button
              type="button"
              onClick={() => { setStep(2); setErrorDetail(null); }}
              className="inline-flex items-center gap-1 rounded-lg border border-input px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-accent"
            >
              <ChevronLeft className="h-4 w-4" /> Back
            </button>
            <button
              type="button"
              onClick={handleApplyAudit}
              disabled={isWorking}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              {isWorking
                ? 'Updating...'
                : auditChangeCount > 0
                  ? `Update & Continue`
                  : 'Continue'}
            </button>
          </div>
        </div>
      )}

      {/* ── Step 4: Routing ── */}
      {step === 4 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-foreground">Order Routing</h2>
          <p className="text-sm text-muted-foreground">
            How should orders be routed to your stations?
          </p>

          <div className="space-y-2">
            {nonExpoStationCount <= 1 && (
              <button
                type="button"
                onClick={() => setRoutingMode('single')}
                className={`w-full rounded-lg border-2 p-4 text-left transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1 ${
                  routingMode === 'single'
                    ? 'border-indigo-600 bg-indigo-500/10'
                    : 'border-border hover:border-input'
                }`}
              >
                <h3 className="text-sm font-semibold text-foreground">
                  Everything to one station
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  All food items go to your kitchen station. Simple and reliable.
                </p>
              </button>
            )}

            <button
              type="button"
              onClick={() => setRoutingMode('smart')}
              className={`w-full rounded-lg border-2 p-4 text-left transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1 ${
                routingMode === 'smart'
                  ? 'border-indigo-600 bg-indigo-500/10'
                  : 'border-border hover:border-input'
              }`}
            >
              <h3 className="text-sm font-semibold text-foreground">
                Smart routing by department
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Automatically route items based on catalog departments (e.g., drinks to Bar,
                grilled items to Grill). Uses your catalog hierarchy to decide.
              </p>
            </button>

            <button
              type="button"
              onClick={() => setRoutingMode('skip')}
              className={`w-full rounded-lg border-2 p-4 text-left transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1 ${
                routingMode === 'skip'
                  ? 'border-indigo-600 bg-indigo-500/10'
                  : 'border-border hover:border-input'
              }`}
            >
              <h3 className="text-sm font-semibold text-foreground">
                Skip — I&apos;ll set this up later
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                All items will route to the first available station. You can configure detailed
                routing rules in KDS Settings anytime.
              </p>
            </button>
          </div>

          <div className="flex justify-between pt-4">
            <button
              type="button"
              onClick={() => { setStep(3); setErrorDetail(null); }}
              className="inline-flex items-center gap-1 rounded-lg border border-input px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-accent"
            >
              <ChevronLeft className="h-4 w-4" /> Back
            </button>
            <button
              type="button"
              onClick={handleApplyRouting}
              disabled={isWorking}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              {isWorking ? 'Setting up routing...' : 'Continue'}
            </button>
          </div>
        </div>
      )}

      {/* ── Step 5: Verify & Go Live ── */}
      {step === 5 && (
        <div className="space-y-4">
          <div className="text-center">
            <Sparkles className="mx-auto h-16 w-16 text-green-500" />
            <h2 className="mt-4 text-xl font-semibold text-foreground">
              {canLaunch ? 'KDS is Ready!' : 'Almost There'}
            </h2>
            {locationName && (
              <p className="mt-1 text-sm text-muted-foreground">
                Kitchen display for <strong className="text-foreground">{locationName}</strong>
              </p>
            )}
          </div>

          {/* Verification checks */}
          <div className="rounded-lg border border-border divide-y divide-border">
            {verifyChecks ? (
              verifyChecks.map((check) => (
                <div key={check.key} className="flex items-center gap-3 px-4 py-3">
                  {check.pass ? (
                    <CheckCircle className="h-5 w-5 shrink-0 text-green-500" />
                  ) : check.key === 'routing_configured' ? (
                    <AlertTriangle className="h-5 w-5 shrink-0 text-amber-500" />
                  ) : (
                    <AlertTriangle className="h-5 w-5 shrink-0 text-red-500" />
                  )}
                  <span className="text-sm text-foreground">{check.message}</span>
                </div>
              ))
            ) : (
              <div className="flex items-center justify-center py-6">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted-foreground border-t-indigo-500" />
                <span className="ml-2 text-sm text-muted-foreground">Running checks...</span>
              </div>
            )}
          </div>

          {/* Action links */}
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => router.push('/kds')}
              disabled={!canLaunch}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-6 py-3 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              <Monitor className="h-4 w-4" /> Launch KDS
              <ExternalLink className="h-3.5 w-3.5" />
            </button>
            <Link
              href="/kds/settings"
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-input px-4 py-2.5 text-sm font-medium text-muted-foreground hover:bg-accent"
            >
              <Settings2 className="h-4 w-4" /> Go to KDS Settings
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
