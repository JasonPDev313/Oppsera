'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Star,
  Plus,
  Search,
  Award,
  X,
  Loader2,
  ChevronDown,
  ChevronRight,
  Users,
  TrendingUp,
  Minus,
} from 'lucide-react';
import { useAuthContext } from '@/components/auth-provider';
import { apiFetch } from '@/lib/api-client';
import { buildQueryString } from '@/lib/query-string';
import { Badge } from '@/components/ui/badge';

// ── Types ────────────────────────────────────────────────────────

interface LoyaltyTier {
  name: string;
  minPoints: number;
  multiplier: number;
}

interface LoyaltyProgram {
  id: string;
  name: string;
  pointsPerDollar: number;
  pointsPerNight: number;
  redemptionValueCents: number;
  tiers: LoyaltyTier[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface LoyaltyMember {
  id: string;
  guestId: string;
  guestName: string;
  programId: string;
  programName: string;
  pointsBalance: number;
  lifetimePoints: number;
  currentTier: string | null;
  enrolledAt: string;
}

interface LoyaltyTransaction {
  id: string;
  memberId: string;
  type: 'earn' | 'redeem' | 'adjust' | 'expire';
  points: number;
  description: string;
  reservationId: string | null;
  createdAt: string;
}

// ── Helpers ──────────────────────────────────────────────────────

function formatCentsToDollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatNumber(n: number): string {
  return n.toLocaleString('en-US');
}

// ── Tabs ─────────────────────────────────────────────────────────

type Tab = 'programs' | 'members';

// ── Main Component ───────────────────────────────────────────────

export default function LoyaltyContent() {
  useAuthContext();

  const [activeTab, setActiveTab] = useState<Tab>('programs');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/20 text-amber-500">
            <Award className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Loyalty Programs</h1>
            <p className="text-sm text-muted-foreground">Manage loyalty programs and member rewards</p>
          </div>
        </div>
      </div>

      {/* Tab Bar */}
      <div className="flex gap-1 rounded-lg border border-border bg-surface p-1">
        <button
          type="button"
          onClick={() => setActiveTab('programs')}
          className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'programs'
              ? 'bg-indigo-600 text-white'
              : 'text-muted-foreground hover:bg-gray-200/50 hover:text-foreground'
          }`}
        >
          <Star className="h-4 w-4" aria-hidden="true" />
          Programs
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('members')}
          className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'members'
              ? 'bg-indigo-600 text-white'
              : 'text-muted-foreground hover:bg-gray-200/50 hover:text-foreground'
          }`}
        >
          <Users className="h-4 w-4" aria-hidden="true" />
          Members
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'programs' ? <ProgramsTab /> : <MembersTab />}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// ── Programs Tab ─────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════

function ProgramsTab() {
  const [programs, setPrograms] = useState<LoyaltyProgram[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProgram, setEditingProgram] = useState<LoyaltyProgram | null>(null);

  const fetchPrograms = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ data: LoyaltyProgram[] }>(
        '/api/v1/pms/loyalty/programs',
      );
      setPrograms(res.data ?? []);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setError('Failed to load loyalty programs');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPrograms();
  }, [fetchPrograms]);

  const openCreate = useCallback(() => {
    setEditingProgram(null);
    setDialogOpen(true);
  }, []);

  const openEdit = useCallback((program: LoyaltyProgram) => {
    setEditingProgram(program);
    setDialogOpen(true);
  }, []);

  const handleDialogClose = useCallback(() => {
    setDialogOpen(false);
    setEditingProgram(null);
  }, []);

  const handleSaved = useCallback(() => {
    handleDialogClose();
    fetchPrograms();
  }, [handleDialogClose, fetchPrograms]);

  return (
    <>
      {/* Action bar */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={openCreate}
          className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Create Program
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-500">
          {error}
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
        </div>
      )}

      {/* Empty state */}
      {!isLoading && programs.length === 0 && !error && (
        <div className="flex flex-col items-center justify-center rounded-lg border border-border bg-surface py-16">
          <Award className="h-12 w-12 text-muted-foreground" aria-hidden="true" />
          <h3 className="mt-4 text-sm font-semibold text-foreground">No loyalty programs</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Create your first loyalty program to start rewarding guests.
          </p>
          <button
            type="button"
            onClick={openCreate}
            className="mt-4 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
          >
            Create Program
          </button>
        </div>
      )}

      {/* Programs list */}
      {!isLoading && programs.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-border bg-surface">
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted">
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Name
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Pts / $
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Pts / Night
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Redemption Value
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Tiers
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Status
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground w-20" />
                </tr>
              </thead>
              <tbody>
                {programs.map((p) => (
                  <tr
                    key={p.id}
                    className="border-b border-border transition-colors last:border-0 hover:bg-accent"
                  >
                    <td className="px-4 py-3">
                      <span className="text-sm font-medium text-foreground">{p.name}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-sm text-foreground">{p.pointsPerDollar}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-sm text-foreground">{p.pointsPerNight}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-sm text-foreground">
                        {formatCentsToDollars(p.redemptionValueCents)} / pt
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-sm text-foreground">{p.tiers.length}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Badge variant={p.isActive ? 'success' : 'neutral'}>
                        {p.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => openEdit(p)}
                        className="rounded-lg border border-border px-3 py-1 text-xs font-medium text-muted-foreground hover:bg-gray-200/50"
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile card layout */}
          <div className="space-y-3 p-4 md:hidden">
            {programs.map((p) => (
              <div
                key={p.id}
                className="rounded-lg border border-border p-4 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground">{p.name}</span>
                  <Badge variant={p.isActive ? 'success' : 'neutral'}>
                    {p.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                  <div>Pts/$: <span className="text-foreground">{p.pointsPerDollar}</span></div>
                  <div>Pts/Night: <span className="text-foreground">{p.pointsPerNight}</span></div>
                  <div>Value: <span className="text-foreground">{formatCentsToDollars(p.redemptionValueCents)}/pt</span></div>
                  <div>Tiers: <span className="text-foreground">{p.tiers.length}</span></div>
                </div>
                <button
                  type="button"
                  onClick={() => openEdit(p)}
                  className="w-full rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-gray-200/50"
                >
                  Edit
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Create / Edit Dialog */}
      {dialogOpen && (
        <ProgramDialog
          program={editingProgram}
          onClose={handleDialogClose}
          onSaved={handleSaved}
        />
      )}
    </>
  );
}

// ══════════════════════════════════════════════════════════════════
// ── Program Create/Edit Dialog ───────────────────────────────────
// ══════════════════════════════════════════════════════════════════

function ProgramDialog({
  program,
  onClose,
  onSaved,
}: {
  program: LoyaltyProgram | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = program !== null;

  const [name, setName] = useState(program?.name ?? '');
  const [pointsPerDollar, setPointsPerDollar] = useState(
    program?.pointsPerDollar?.toString() ?? '1',
  );
  const [pointsPerNight, setPointsPerNight] = useState(
    program?.pointsPerNight?.toString() ?? '100',
  );
  const [redemptionValueCents, setRedemptionValueCents] = useState(
    program ? (program.redemptionValueCents / 100).toFixed(2) : '0.01',
  );
  const [isActive, setIsActive] = useState(program?.isActive ?? true);
  const [tiers, setTiers] = useState<LoyaltyTier[]>(
    program?.tiers?.length ? program.tiers : [{ name: 'Base', minPoints: 0, multiplier: 1 }],
  );

  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const addTier = useCallback(() => {
    setTiers((prev) => [
      ...prev,
      { name: '', minPoints: 0, multiplier: 1 },
    ]);
  }, []);

  const removeTier = useCallback((idx: number) => {
    setTiers((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const updateTier = useCallback(
    (idx: number, field: keyof LoyaltyTier, value: string | number) => {
      setTiers((prev) =>
        prev.map((t, i) => (i === idx ? { ...t, [field]: value } : t)),
      );
    },
    [],
  );

  const handleSubmit = useCallback(async () => {
    setFormError(null);

    if (!name.trim()) {
      setFormError('Name is required');
      return;
    }

    const ppd = parseFloat(pointsPerDollar);
    const ppn = parseFloat(pointsPerNight);
    const rvc = Math.round(parseFloat(redemptionValueCents) * 100);

    if (isNaN(ppd) || ppd < 0) {
      setFormError('Points per dollar must be a non-negative number');
      return;
    }
    if (isNaN(ppn) || ppn < 0) {
      setFormError('Points per night must be a non-negative number');
      return;
    }
    if (isNaN(rvc) || rvc <= 0) {
      setFormError('Redemption value must be greater than zero');
      return;
    }

    for (let i = 0; i < tiers.length; i++) {
      const t = tiers[i]!;
      if (!t.name.trim()) {
        setFormError(`Tier ${i + 1}: name is required`);
        return;
      }
      if (t.minPoints < 0) {
        setFormError(`Tier ${i + 1}: min points must be non-negative`);
        return;
      }
      if (t.multiplier <= 0) {
        setFormError(`Tier ${i + 1}: multiplier must be greater than zero`);
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const body = {
        name: name.trim(),
        pointsPerDollar: ppd,
        pointsPerNight: ppn,
        redemptionValueCents: rvc,
        tiers,
        isActive,
      };

      if (isEdit && program) {
        await apiFetch(`/api/v1/pms/loyalty/programs/${program.id}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
      } else {
        await apiFetch('/api/v1/pms/loyalty/programs', {
          method: 'POST',
          body: JSON.stringify(body),
        });
      }
      onSaved();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save program';
      setFormError(msg);
    } finally {
      setIsSubmitting(false);
    }
  }, [name, pointsPerDollar, pointsPerNight, redemptionValueCents, tiers, isActive, isEdit, program, onSaved]);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl border border-border bg-surface p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">
            {isEdit ? 'Edit Program' : 'Create Program'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-muted-foreground hover:bg-gray-200/50 hover:text-muted-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {formError && (
          <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-500">
            {formError}
          </div>
        )}

        <div className="space-y-4">
          {/* Name */}
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">
              Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Gold Rewards"
              maxLength={100}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              autoFocus
            />
          </div>

          {/* Points per dollar */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">
                Points per Dollar
              </label>
              <input
                type="number"
                step="0.1"
                min="0"
                value={pointsPerDollar}
                onChange={(e) => setPointsPerDollar(e.target.value)}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">
                Points per Night
              </label>
              <input
                type="number"
                step="1"
                min="0"
                value={pointsPerNight}
                onChange={(e) => setPointsPerNight(e.target.value)}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* Redemption value */}
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">
              Redemption Value ($ per point)
            </label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={redemptionValueCents}
              onChange={(e) => setRedemptionValueCents(e.target.value)}
              placeholder="0.01"
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Dollar value of each point when redeemed (e.g. 0.01 = 1 cent per point)
            </p>
          </div>

          {/* Active toggle */}
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="h-4 w-4 rounded border-border text-indigo-600 focus:ring-indigo-500"
            />
            Program is active
          </label>

          {/* Tiers */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-sm font-medium text-foreground">Tiers</label>
              <button
                type="button"
                onClick={addTier}
                className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-gray-200/50"
              >
                <Plus className="h-3 w-3" aria-hidden="true" />
                Add Tier
              </button>
            </div>
            <div className="space-y-2">
              {tiers.map((tier, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-2 rounded-lg border border-border bg-muted p-3"
                >
                  <div className="flex-1 space-y-2">
                    <input
                      type="text"
                      value={tier.name}
                      onChange={(e) => updateTier(idx, 'name', e.target.value)}
                      placeholder="Tier name"
                      className="w-full rounded border border-border bg-surface px-2 py-1 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] uppercase tracking-wide text-muted-foreground">
                          Min Points
                        </label>
                        <input
                          type="number"
                          min="0"
                          value={tier.minPoints}
                          onChange={(e) =>
                            updateTier(idx, 'minPoints', parseInt(e.target.value, 10) || 0)
                          }
                          className="w-full rounded border border-border bg-surface px-2 py-1 text-sm text-foreground focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] uppercase tracking-wide text-muted-foreground">
                          Multiplier
                        </label>
                        <input
                          type="number"
                          step="0.1"
                          min="0.1"
                          value={tier.multiplier}
                          onChange={(e) =>
                            updateTier(idx, 'multiplier', parseFloat(e.target.value) || 1)
                          }
                          className="w-full rounded border border-border bg-surface px-2 py-1 text-sm text-foreground focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                      </div>
                    </div>
                  </div>
                  {tiers.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeTier(idx)}
                      className="shrink-0 rounded p-1 text-muted-foreground hover:bg-red-500/10 hover:text-red-500"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-gray-200/50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {isSubmitting
              ? isEdit
                ? 'Saving...'
                : 'Creating...'
              : isEdit
                ? 'Save Changes'
                : 'Create Program'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ══════════════════════════════════════════════════════════════════
// ── Members Tab ──────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════

function MembersTab() {
  // Search
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Data
  const [members, setMembers] = useState<LoyaltyMember[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  // Expanded row
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Dialogs
  const [adjustMember, setAdjustMember] = useState<LoyaltyMember | null>(null);
  const [earnMember, setEarnMember] = useState<LoyaltyMember | null>(null);
  const [enrollOpen, setEnrollOpen] = useState(false);

  const handleSearchChange = useCallback((value: string) => {
    setSearchInput(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearchTerm(value.trim());
    }, 300);
  }, []);

  const fetchMembers = useCallback(
    async (append = false) => {
      setIsLoading(true);
      setError(null);
      try {
        const qs = buildQueryString({
          search: searchTerm || undefined,
          cursor: append ? cursor : undefined,
          limit: 25,
        });
        const res = await apiFetch<{
          data: LoyaltyMember[];
          meta: { cursor: string | null; hasMore: boolean };
        }>(`/api/v1/pms/loyalty/members${qs}`);

        if (append) {
          setMembers((prev) => [...prev, ...res.data]);
        } else {
          setMembers(res.data ?? []);
        }
        setCursor(res.meta?.cursor ?? null);
        setHasMore(res.meta?.hasMore ?? false);
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setError('Failed to load members');
      } finally {
        setIsLoading(false);
      }
    },
    [searchTerm, cursor],
  );

  useEffect(() => {
    setCursor(null);
    setHasMore(false);
    fetchMembers(false);
  }, [searchTerm]); // eslint-disable-line

  const toggleExpanded = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  const handleAdjusted = useCallback(() => {
    setAdjustMember(null);
    fetchMembers(false);
  }, [fetchMembers]);

  const handleEarned = useCallback(() => {
    setEarnMember(null);
    fetchMembers(false);
  }, [fetchMembers]);

  const handleEnrolled = useCallback(() => {
    setEnrollOpen(false);
    fetchMembers(false);
  }, [fetchMembers]);

  return (
    <>
      {/* Action bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search by guest name..."
            className="w-full rounded-lg border border-border bg-surface py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-300 focus:outline-none focus:ring-1 focus:ring-indigo-300"
          />
        </div>
        <button
          type="button"
          onClick={() => setEnrollOpen(true)}
          className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Enroll Guest
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-500">
          {error}
        </div>
      )}

      {/* Loading */}
      {isLoading && members.length === 0 && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
        </div>
      )}

      {/* Empty state */}
      {!isLoading && members.length === 0 && !error && (
        <div className="flex flex-col items-center justify-center rounded-lg border border-border bg-surface py-16">
          <Users className="h-12 w-12 text-muted-foreground" aria-hidden="true" />
          <h3 className="mt-4 text-sm font-semibold text-foreground">No loyalty members</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {searchTerm
              ? 'No members match your search.'
              : 'Enroll guests in a loyalty program to get started.'}
          </p>
        </div>
      )}

      {/* Members table */}
      {members.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-border bg-surface">
          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted">
                  <th className="w-8 px-2 py-3" />
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Guest
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Program
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Balance
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Lifetime
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Tier
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Enrolled
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground w-48">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <MemberRow
                    key={m.id}
                    member={m}
                    isExpanded={expandedId === m.id}
                    onToggle={() => toggleExpanded(m.id)}
                    onAdjust={() => setAdjustMember(m)}
                    onEarn={() => setEarnMember(m)}
                  />
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile card layout */}
          <div className="space-y-3 p-4 md:hidden">
            {members.map((m) => (
              <MemberCard
                key={m.id}
                member={m}
                isExpanded={expandedId === m.id}
                onToggle={() => toggleExpanded(m.id)}
                onAdjust={() => setAdjustMember(m)}
                onEarn={() => setEarnMember(m)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Load more */}
      {hasMore && !isLoading && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => fetchMembers(true)}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Load More
          </button>
        </div>
      )}

      {isLoading && members.length > 0 && (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden="true" />
        </div>
      )}

      {/* Adjust Points Dialog */}
      {adjustMember && (
        <AdjustPointsDialog
          member={adjustMember}
          onClose={() => setAdjustMember(null)}
          onSaved={handleAdjusted}
        />
      )}

      {/* Earn Points Dialog */}
      {earnMember && (
        <EarnPointsDialog
          member={earnMember}
          onClose={() => setEarnMember(null)}
          onSaved={handleEarned}
        />
      )}

      {/* Enroll Guest Dialog */}
      {enrollOpen && (
        <EnrollDialog
          onClose={() => setEnrollOpen(false)}
          onSaved={handleEnrolled}
        />
      )}
    </>
  );
}

// ══════════════════════════════════════════════════════════════════
// ── Member Row (Desktop) ─────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════

function MemberRow({
  member,
  isExpanded,
  onToggle,
  onAdjust,
  onEarn,
}: {
  member: LoyaltyMember;
  isExpanded: boolean;
  onToggle: () => void;
  onAdjust: () => void;
  onEarn: () => void;
}) {
  return (
    <>
      <tr
        className="border-b border-border transition-colors last:border-0 cursor-pointer hover:bg-accent"
        onClick={onToggle}
      >
        <td className="px-2 py-3 text-center">
          {isExpanded ? (
            <ChevronDown className="mx-auto h-4 w-4 text-muted-foreground" aria-hidden="true" />
          ) : (
            <ChevronRight className="mx-auto h-4 w-4 text-muted-foreground" aria-hidden="true" />
          )}
        </td>
        <td className="px-4 py-3">
          <span className="text-sm font-medium text-foreground">{member.guestName}</span>
        </td>
        <td className="px-4 py-3">
          <span className="text-sm text-foreground">{member.programName}</span>
        </td>
        <td className="px-4 py-3 text-right">
          <span className="text-sm font-semibold text-foreground">
            {formatNumber(member.pointsBalance)}
          </span>
        </td>
        <td className="px-4 py-3 text-right">
          <span className="text-sm text-muted-foreground">
            {formatNumber(member.lifetimePoints)}
          </span>
        </td>
        <td className="px-4 py-3">
          {member.currentTier ? (
            <Badge variant="purple">{member.currentTier}</Badge>
          ) : (
            <span className="text-sm text-muted-foreground">{'\u2014'}</span>
          )}
        </td>
        <td className="px-4 py-3">
          <span className="text-sm text-muted-foreground">{formatDate(member.enrolledAt)}</span>
        </td>
        <td className="px-4 py-3 text-right">
          <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={onEarn}
              className="flex items-center gap-1 rounded-md border border-green-500/30 px-2 py-1 text-xs font-medium text-green-500 hover:bg-green-500/10"
            >
              <TrendingUp className="h-3 w-3" aria-hidden="true" />
              Earn
            </button>
            <button
              type="button"
              onClick={onAdjust}
              className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-gray-200/50"
            >
              <Minus className="h-3 w-3" aria-hidden="true" />
              Adjust
            </button>
          </div>
        </td>
      </tr>
      {isExpanded && (
        <tr>
          <td colSpan={8} className="bg-muted px-4 py-0">
            <MemberTransactions memberId={member.id} />
          </td>
        </tr>
      )}
    </>
  );
}

// ══════════════════════════════════════════════════════════════════
// ── Member Card (Mobile) ─────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════

function MemberCard({
  member,
  isExpanded,
  onToggle,
  onAdjust,
  onEarn,
}: {
  member: LoyaltyMember;
  isExpanded: boolean;
  onToggle: () => void;
  onAdjust: () => void;
  onEarn: () => void;
}) {
  return (
    <div className="rounded-lg border border-border p-4">
      <div className="cursor-pointer" onClick={onToggle}>
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-foreground">{member.guestName}</span>
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          )}
        </div>
        <div className="mt-1 text-xs text-muted-foreground">{member.programName}</div>
        <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
          <div>
            <div className="text-muted-foreground">Balance</div>
            <div className="font-semibold text-foreground">
              {formatNumber(member.pointsBalance)}
            </div>
          </div>
          <div>
            <div className="text-muted-foreground">Lifetime</div>
            <div className="text-foreground">{formatNumber(member.lifetimePoints)}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Tier</div>
            <div className="text-foreground">{member.currentTier ?? '\u2014'}</div>
          </div>
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={onEarn}
          className="flex flex-1 items-center justify-center gap-1 rounded-md border border-green-500/30 px-2 py-1.5 text-xs font-medium text-green-500 hover:bg-green-500/10"
        >
          <TrendingUp className="h-3 w-3" aria-hidden="true" />
          Earn
        </button>
        <button
          type="button"
          onClick={onAdjust}
          className="flex flex-1 items-center justify-center gap-1 rounded-md border border-border px-2 py-1.5 text-xs font-medium text-muted-foreground hover:bg-gray-200/50"
        >
          <Minus className="h-3 w-3" aria-hidden="true" />
          Adjust
        </button>
      </div>
      {isExpanded && (
        <div className="mt-3 border-t border-border pt-3">
          <MemberTransactions memberId={member.id} />
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// ── Member Transactions (Expandable Detail) ──────────────────────
// ══════════════════════════════════════════════════════════════════

function MemberTransactions({ memberId }: { memberId: string }) {
  const [transactions, setTransactions] = useState<LoyaltyTransaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  const fetchTransactions = useCallback(
    async (append = false) => {
      setIsLoading(true);
      try {
        const qs = buildQueryString({
          cursor: append ? cursor : undefined,
          limit: 20,
        });
        const res = await apiFetch<{
          data: LoyaltyTransaction[];
          meta: { cursor: string | null; hasMore: boolean };
        }>(`/api/v1/pms/loyalty/members/${memberId}/transactions${qs}`);

        if (append) {
          setTransactions((prev) => [...prev, ...res.data]);
        } else {
          setTransactions(res.data ?? []);
        }
        setCursor(res.meta?.cursor ?? null);
        setHasMore(res.meta?.hasMore ?? false);
      } catch {
        // silently handle
      } finally {
        setIsLoading(false);
      }
    },
    [memberId, cursor],
  );

  useEffect(() => {
    fetchTransactions(false);
  }, [memberId]); // eslint-disable-line

  const typeColors: Record<string, string> = {
    earn: 'success',
    redeem: 'warning',
    adjust: 'info',
    expire: 'error',
  };

  if (isLoading && transactions.length === 0) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden="true" />
      </div>
    );
  }

  if (transactions.length === 0) {
    return (
      <div className="py-4 text-center text-sm text-muted-foreground">
        No transactions yet.
      </div>
    );
  }

  return (
    <div className="py-3">
      <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Recent Transactions
      </h4>
      <div className="space-y-1">
        {transactions.map((t) => (
          <div
            key={t.id}
            className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm"
          >
            <div className="flex items-center gap-3">
              <Badge variant={typeColors[t.type] ?? 'neutral'}>
                {t.type}
              </Badge>
              <span className="text-foreground">{t.description}</span>
              {t.reservationId && (
                <span className="text-xs text-muted-foreground">Res: {t.reservationId}</span>
              )}
            </div>
            <div className="flex items-center gap-4">
              <span
                className={`font-medium ${
                  t.points >= 0 ? 'text-green-500' : 'text-red-500'
                }`}
              >
                {t.points >= 0 ? '+' : ''}
                {formatNumber(t.points)}
              </span>
              <span className="text-xs text-muted-foreground">{formatDate(t.createdAt)}</span>
            </div>
          </div>
        ))}
      </div>
      {hasMore && (
        <div className="mt-2 flex justify-center">
          <button
            type="button"
            onClick={() => fetchTransactions(true)}
            disabled={isLoading}
            className="rounded-md border border-border px-3 py-1 text-xs font-medium text-muted-foreground hover:bg-gray-200/50 disabled:opacity-50"
          >
            {isLoading ? 'Loading...' : 'Load More'}
          </button>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// ── Adjust Points Dialog ─────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════

function AdjustPointsDialog({
  member,
  onClose,
  onSaved,
}: {
  member: LoyaltyMember;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [points, setPoints] = useState('');
  const [description, setDescription] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = useCallback(async () => {
    setFormError(null);
    const parsedPoints = parseInt(points, 10);
    if (isNaN(parsedPoints) || parsedPoints === 0) {
      setFormError('Points must be a non-zero number');
      return;
    }
    if (!description.trim()) {
      setFormError('Description is required');
      return;
    }

    setIsSubmitting(true);
    try {
      await apiFetch(`/api/v1/pms/loyalty/members/${member.id}/adjust`, {
        method: 'POST',
        body: JSON.stringify({
          points: parsedPoints,
          description: description.trim(),
        }),
      });
      onSaved();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to adjust points';
      setFormError(msg);
    } finally {
      setIsSubmitting(false);
    }
  }, [points, description, member.id, onSaved]);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative z-10 w-full max-w-sm rounded-xl border border-border bg-surface p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">Adjust Points</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-muted-foreground hover:bg-gray-200/50 hover:text-muted-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="mb-4 text-sm text-muted-foreground">
          Adjusting points for <span className="font-medium text-foreground">{member.guestName}</span>.
          Current balance: <span className="font-medium text-foreground">{formatNumber(member.pointsBalance)}</span>.
        </p>

        {formError && (
          <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-500">
            {formError}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">
              Points <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              value={points}
              onChange={(e) => setPoints(e.target.value)}
              placeholder="e.g. -500 or 200"
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              autoFocus
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Use negative for deductions, positive for additions
            </p>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">
              Description <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Manual correction, Courtesy credit"
              maxLength={200}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-gray-200/50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {isSubmitting ? 'Adjusting...' : 'Adjust Points'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ══════════════════════════════════════════════════════════════════
// ── Earn Points Dialog ───────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════

function EarnPointsDialog({
  member,
  onClose,
  onSaved,
}: {
  member: LoyaltyMember;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [points, setPoints] = useState('');
  const [reservationId, setReservationId] = useState('');
  const [description, setDescription] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = useCallback(async () => {
    setFormError(null);
    const parsedPoints = parseInt(points, 10);
    if (isNaN(parsedPoints) || parsedPoints <= 0) {
      setFormError('Points must be a positive number');
      return;
    }
    if (!description.trim()) {
      setFormError('Description is required');
      return;
    }

    setIsSubmitting(true);
    try {
      await apiFetch(`/api/v1/pms/loyalty/members/${member.id}/earn`, {
        method: 'POST',
        body: JSON.stringify({
          points: parsedPoints,
          reservationId: reservationId.trim() || undefined,
          description: description.trim(),
        }),
      });
      onSaved();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to earn points';
      setFormError(msg);
    } finally {
      setIsSubmitting(false);
    }
  }, [points, reservationId, description, member.id, onSaved]);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative z-10 w-full max-w-sm rounded-xl border border-border bg-surface p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">Earn Points</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-muted-foreground hover:bg-gray-200/50 hover:text-muted-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="mb-4 text-sm text-muted-foreground">
          Earning points for <span className="font-medium text-foreground">{member.guestName}</span>.
          Current balance: <span className="font-medium text-foreground">{formatNumber(member.pointsBalance)}</span>.
        </p>

        {formError && (
          <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-500">
            {formError}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">
              Points <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              min="1"
              value={points}
              onChange={(e) => setPoints(e.target.value)}
              placeholder="e.g. 500"
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              autoFocus
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">
              Reservation ID
            </label>
            <input
              type="text"
              value={reservationId}
              onChange={(e) => setReservationId(e.target.value)}
              placeholder="Optional"
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">
              Description <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Stay bonus, Promotion award"
              maxLength={200}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-gray-200/50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {isSubmitting ? 'Earning...' : 'Earn Points'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ══════════════════════════════════════════════════════════════════
// ── Enroll Guest Dialog ──────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════

function EnrollDialog({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const [guestId, setGuestId] = useState('');
  const [programId, setProgramId] = useState('');
  const [programs, setPrograms] = useState<LoyaltyProgram[]>([]);
  const [isLoadingPrograms, setIsLoadingPrograms] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch<{ data: LoyaltyProgram[] }>(
          '/api/v1/pms/loyalty/programs',
        );
        if (cancelled) return;
        const active = (res.data ?? []).filter((p) => p.isActive);
        setPrograms(active);
        if (active.length > 0 && !programId) {
          setProgramId(active[0]!.id);
        }
      } catch {
        // silently handle
      } finally {
        if (!cancelled) setIsLoadingPrograms(false);
      }
    })();
    return () => { cancelled = true; };
  }, []); // eslint-disable-line

  const handleSubmit = useCallback(async () => {
    setFormError(null);
    if (!guestId.trim()) {
      setFormError('Guest ID is required');
      return;
    }
    if (!programId) {
      setFormError('Please select a program');
      return;
    }

    setIsSubmitting(true);
    try {
      await apiFetch('/api/v1/pms/loyalty/members/enroll', {
        method: 'POST',
        body: JSON.stringify({
          guestId: guestId.trim(),
          programId,
        }),
      });
      onSaved();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to enroll guest';
      setFormError(msg);
    } finally {
      setIsSubmitting(false);
    }
  }, [guestId, programId, onSaved]);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative z-10 w-full max-w-sm rounded-xl border border-border bg-surface p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">Enroll Guest</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-muted-foreground hover:bg-gray-200/50 hover:text-muted-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {formError && (
          <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-500">
            {formError}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">
              Guest ID <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={guestId}
              onChange={(e) => setGuestId(e.target.value)}
              placeholder="Enter guest ID"
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              autoFocus
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">
              Program <span className="text-red-500">*</span>
            </label>
            {isLoadingPrograms ? (
              <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Loading programs...
              </div>
            ) : programs.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No active programs. Create one first.
              </p>
            ) : (
              <select
                value={programId}
                onChange={(e) => setProgramId(e.target.value)}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                {programs.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-gray-200/50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting || programs.length === 0}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {isSubmitting ? 'Enrolling...' : 'Enroll Guest'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
