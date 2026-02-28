'use client';

import { useState, useCallback, useEffect } from 'react';
import {
  Settings,
  Shield,
  Bell,
  Heart,
  AlertTriangle,
  Plus,
  Trash2,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast';
import { apiFetch } from '@/lib/api-client';

// ── Types (inline, fetched from profile sub-resources) ──────────

interface CustomerPreference {
  id: string;
  category: string;
  key: string;
  value: string;
  source: string;
  confidencePercent: number | null;
}

interface CustomerServiceFlag {
  id: string;
  flagType: string;
  severity: string;
  description: string | null;
  isActive: boolean;
  createdAt: string;
}

interface CustomerConsent {
  id: string;
  consentType: string;
  status: string;
  grantedAt: string | null;
  revokedAt: string | null;
  expiresAt: string | null;
  channel: string | null;
}

interface ComplianceData {
  consents: CustomerConsent[];
  flags: CustomerServiceFlag[];
}

// ── Helpers ─────────────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(iso));
}

const PREFERENCE_CATEGORIES = [
  'food_beverage',
  'retail',
  'service',
  'facility',
  'general',
  'dietary',
  'communication',
  'scheduling',
];

const CATEGORY_LABELS: Record<string, string> = {
  food_beverage: 'Food & Beverage',
  retail: 'Retail',
  service: 'Service',
  facility: 'Facility',
  general: 'General',
  dietary: 'Dietary',
  communication: 'Communication',
  scheduling: 'Scheduling',
};

const CATEGORY_ICONS: Record<string, typeof Heart> = {
  food_beverage: Heart,
  dietary: Heart,
  communication: Bell,
  retail: Settings,
  service: Settings,
  facility: Settings,
  general: Settings,
  scheduling: Settings,
};

const FLAG_SEVERITY_COLORS: Record<string, string> = {
  critical: 'bg-red-500/20 text-red-500 border-red-500/30',
  high: 'bg-orange-500/20 text-orange-500 border-orange-500/30',
  medium: 'bg-yellow-500/20 text-yellow-500 border-yellow-500/30',
  low: 'bg-blue-500/20 text-blue-500 border-blue-500/30',
};

function consentStatusVariant(status: string): string {
  const map: Record<string, string> = {
    granted: 'success',
    revoked: 'error',
    expired: 'neutral',
    pending: 'warning',
  };
  return map[status] ?? 'neutral';
}

// ── Skeleton ────────────────────────────────────────────────────

function SkeletonCard() {
  return <div className="h-20 animate-pulse rounded-lg bg-muted" />;
}

// ── Main Tab ────────────────────────────────────────────────────

export default function SettingsTab({ customerId }: { customerId: string }) {
  const { toast } = useToast();
  const [section, setSection] = useState<'preferences' | 'flags' | 'consents'>('preferences');

  // Preferences state
  const [preferences, setPreferences] = useState<Record<string, CustomerPreference[]> | null>(null);
  const [prefsLoading, setPrefsLoading] = useState(true);
  const [, setPrefsError] = useState<Error | null>(null);

  // Compliance (flags + consents) state
  const [compliance, setCompliance] = useState<ComplianceData | null>(null);
  const [complianceLoading, setComplianceLoading] = useState(true);
  const [, setComplianceError] = useState<Error | null>(null);

  // Add preference form state
  const [showAddPref, setShowAddPref] = useState(false);
  const [newPrefCategory, setNewPrefCategory] = useState('general');
  const [newPrefKey, setNewPrefKey] = useState('');
  const [newPrefValue, setNewPrefValue] = useState('');
  const [addPrefLoading, setAddPrefLoading] = useState(false);

  // Fetch preferences
  const fetchPreferences = useCallback(async () => {
    setPrefsLoading(true);
    setPrefsError(null);
    try {
      const res = await apiFetch<{ data: Record<string, CustomerPreference[]> }>(
        `/api/v1/customers/${customerId}/preferences`
      );
      setPreferences(res.data);
    } catch (err) {
      setPrefsError(err instanceof Error ? err : new Error('Failed to load preferences'));
    } finally {
      setPrefsLoading(false);
    }
  }, [customerId]);

  // Fetch compliance
  const fetchCompliance = useCallback(async () => {
    setComplianceLoading(true);
    setComplianceError(null);
    try {
      const res = await apiFetch<{ data: ComplianceData }>(
        `/api/v1/customers/${customerId}/profile/compliance`
      );
      setCompliance(res.data);
    } catch (err) {
      setComplianceError(err instanceof Error ? err : new Error('Failed to load compliance'));
    } finally {
      setComplianceLoading(false);
    }
  }, [customerId]);

  useEffect(() => {
    fetchPreferences();
    fetchCompliance();
  }, [fetchPreferences, fetchCompliance]);

  // Add preference
  const handleAddPreference = async () => {
    if (!newPrefKey.trim() || !newPrefValue.trim()) {
      toast.error('Key and value are required');
      return;
    }
    setAddPrefLoading(true);
    try {
      await apiFetch(
        `/api/v1/customers/${customerId}/preferences`,
        {
          method: 'POST',
          body: JSON.stringify({
            category: newPrefCategory,
            key: newPrefKey.trim(),
            value: newPrefValue.trim(),
            source: 'manual',
          }),
        },
      );
      toast.success('Preference saved');
      setNewPrefKey('');
      setNewPrefValue('');
      setShowAddPref(false);
      fetchPreferences();
    } catch {
      toast.error('Failed to save preference');
    } finally {
      setAddPrefLoading(false);
    }
  };

  // Delete preference
  const handleDeletePreference = async (prefId: string) => {
    try {
      await apiFetch(
        `/api/v1/customers/${customerId}/preferences/${prefId}`,
        { method: 'DELETE' },
      );
      toast.success('Preference removed');
      fetchPreferences();
    } catch {
      toast.error('Failed to remove preference');
    }
  };

  const isLoading = prefsLoading || complianceLoading;

  if (isLoading && !preferences && !compliance) {
    return (
      <div className="space-y-4 p-6">
        {[...Array(4)].map((_, i) => <SkeletonCard key={i} />)}
      </div>
    );
  }

  const allPrefs = preferences ?? {};
  const allCategories = Object.keys(allPrefs).sort();
  const flags = compliance?.flags ?? [];
  const consents = compliance?.consents ?? [];
  const activeFlags = flags.filter((f) => f.isActive);

  return (
    <div className="space-y-6 p-6">
      {/* Section Tabs */}
      <div className="flex gap-1 rounded-lg bg-muted p-1">
        {[
          { key: 'preferences' as const, label: 'Preferences', icon: Settings },
          { key: 'flags' as const, label: `Service Flags (${activeFlags.length})`, icon: AlertTriangle },
          { key: 'consents' as const, label: 'Consents', icon: Shield },
        ].map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setSection(key)}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium transition-colors ${
              section === key
                ? 'bg-surface text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* Preferences Section */}
      {section === 'preferences' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">Customer Preferences</h3>
            <button
              type="button"
              onClick={() => setShowAddPref(!showAddPref)}
              className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Preference
            </button>
          </div>

          {/* Add form */}
          {showAddPref && (
            <div className="rounded-lg border border-border bg-surface p-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Category</label>
                  <select
                    value={newPrefCategory}
                    onChange={(e) => setNewPrefCategory(e.target.value)}
                    className="w-full rounded-md border border-input bg-surface px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    {PREFERENCE_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>{CATEGORY_LABELS[cat] ?? cat}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Key</label>
                  <input
                    type="text"
                    value={newPrefKey}
                    onChange={(e) => setNewPrefKey(e.target.value)}
                    placeholder="e.g., favorite_drink"
                    className="w-full rounded-md border border-input bg-surface px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Value</label>
                  <input
                    type="text"
                    value={newPrefValue}
                    onChange={(e) => setNewPrefValue(e.target.value)}
                    placeholder="e.g., Arnold Palmer"
                    className="w-full rounded-md border border-input bg-surface px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>
              <div className="mt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddPref(false)}
                  className="rounded-md border border-input px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleAddPreference}
                  disabled={addPrefLoading || !newPrefKey.trim() || !newPrefValue.trim()}
                  className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
                >
                  Save
                </button>
              </div>
            </div>
          )}

          {/* Preferences by category */}
          {allCategories.length === 0 ? (
            <div className="flex h-32 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border text-muted-foreground">
              <Settings className="h-6 w-6" />
              <p className="text-sm">No preferences set</p>
            </div>
          ) : (
            <div className="space-y-4">
              {allCategories.map((category) => {
                const prefs = allPrefs[category] ?? [];
                const Icon = CATEGORY_ICONS[category] ?? Settings;
                return (
                  <div key={category} className="rounded-lg border border-border bg-surface">
                    <div className="flex items-center gap-2 border-b border-border p-3">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                      <h4 className="text-xs font-semibold text-foreground">
                        {CATEGORY_LABELS[category] ?? category}
                      </h4>
                      <Badge variant="neutral" className="text-[10px]">{prefs.length}</Badge>
                    </div>
                    <div className="divide-y divide-border">
                      {prefs.map((pref) => (
                        <div key={pref.id} className="flex items-center justify-between px-3 py-2">
                          <div className="flex items-center gap-4">
                            <div>
                              <span className="text-xs font-medium text-foreground">
                                {pref.key.replace(/_/g, ' ')}
                              </span>
                              <span className="ml-2 text-xs text-foreground">{pref.value}</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <Badge variant="neutral" className="text-[10px]">{pref.source}</Badge>
                              {pref.confidencePercent != null && (
                                <span className="text-[10px] text-muted-foreground">
                                  {pref.confidencePercent}%
                                </span>
                              )}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleDeletePreference(pref.id)}
                            className="rounded p-1 text-muted-foreground hover:bg-red-500/10 hover:text-red-500"
                            title="Remove preference"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Service Flags Section */}
      {section === 'flags' && (
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-foreground">Service Flags</h3>
          {flags.length === 0 ? (
            <div className="flex h-32 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border text-muted-foreground">
              <AlertTriangle className="h-6 w-6" />
              <p className="text-sm">No service flags</p>
            </div>
          ) : (
            <div className="space-y-2">
              {flags.map((flag) => (
                <div
                  key={flag.id}
                  className={`flex items-center justify-between rounded-lg border p-3 ${
                    flag.isActive
                      ? FLAG_SEVERITY_COLORS[flag.severity] ?? 'bg-muted text-foreground border-border'
                      : 'bg-muted text-muted-foreground border-border'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <AlertTriangle className="h-4 w-4" />
                    <div>
                      <div className="text-sm font-medium">
                        {flag.flagType.replace(/_/g, ' ')}
                      </div>
                      {flag.description && (
                        <div className="text-xs opacity-80">{flag.description}</div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={flag.isActive ? 'warning' : 'neutral'}
                      className="text-[10px]"
                    >
                      {flag.isActive ? flag.severity : 'resolved'}
                    </Badge>
                    <span className="text-xs opacity-60">{formatDate(flag.createdAt)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Consents Section */}
      {section === 'consents' && (
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-foreground">Consent Records</h3>
          {consents.length === 0 ? (
            <div className="flex h-32 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border text-muted-foreground">
              <Shield className="h-6 w-6" />
              <p className="text-sm">No consent records</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="pb-2 pr-4 font-medium">Type</th>
                    <th className="pb-2 pr-4 font-medium">Status</th>
                    <th className="pb-2 pr-4 font-medium">Channel</th>
                    <th className="pb-2 pr-4 font-medium">Granted</th>
                    <th className="pb-2 pr-4 font-medium">Revoked</th>
                    <th className="pb-2 font-medium">Expires</th>
                  </tr>
                </thead>
                <tbody>
                  {consents.map((consent) => (
                    <tr key={consent.id} className="border-b border-border">
                      <td className="py-2 pr-4 font-medium text-foreground">
                        {consent.consentType.replace(/_/g, ' ')}
                      </td>
                      <td className="py-2 pr-4">
                        <Badge variant={consentStatusVariant(consent.status) as any}>
                          {consent.status}
                        </Badge>
                      </td>
                      <td className="py-2 pr-4 text-muted-foreground">{consent.channel ?? '-'}</td>
                      <td className="py-2 pr-4 text-muted-foreground">
                        {consent.grantedAt ? formatDate(consent.grantedAt) : '-'}
                      </td>
                      <td className="py-2 pr-4 text-muted-foreground">
                        {consent.revokedAt ? formatDate(consent.revokedAt) : '-'}
                      </td>
                      <td className="py-2 text-muted-foreground">
                        {consent.expiresAt ? formatDate(consent.expiresAt) : 'Never'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
