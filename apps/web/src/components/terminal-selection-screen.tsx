'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { MapPin, Building2, Store, Monitor, Shield, ChevronLeft, Settings, Plus } from 'lucide-react';
import { useTerminalSelection } from '@/hooks/use-terminal-selection';
import { useRoleSelection } from '@/hooks/use-role-selection';
import { useTerminalSession } from '@/components/terminal-session-provider';
import { useToast } from '@/components/ui/toast';

const selectClass =
  'w-full rounded-lg border border-input bg-surface px-3 py-3 text-base text-foreground focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50';

const LAST_TERMINAL_KEY = 'oppsera:last-terminal-session';

/** Save last selected terminal info for smart defaults */
function saveLastTerminal(session: { terminalId: string; terminalName?: string | null; locationName?: string | null }) {
  try {
    localStorage.setItem(LAST_TERMINAL_KEY, JSON.stringify(session));
  } catch { /* ignore */ }
}

/** Load last selected terminal info */
function loadLastTerminal(): { terminalId: string; terminalName?: string | null; locationName?: string | null } | null {
  try {
    const stored = localStorage.getItem(LAST_TERMINAL_KEY);
    if (stored) return JSON.parse(stored);
  } catch { /* ignore */ }
  return null;
}

export function TerminalSelectionScreen({ onSkip, isSwitching }: { onSkip?: () => void; isSwitching?: boolean }) {
  const roleSelection = useRoleSelection();
  const [phase, setPhase] = useState<'role' | 'terminal'>(
    // Skip role phase if only 1 role (auto-selected)
    'role',
  );

  // Phase 1 was completed or auto-skipped
  const roleReady = roleSelection.selectedRoleId !== null;
  const showRolePhase = roleSelection.hasMultipleRoles && phase === 'role';

  // Once roles load and there's only 1 (auto-selected), go straight to terminal phase.
  // Do NOT auto-skip if roles are empty due to an API error — show the error instead.
  // Must be in useEffect — calling setState during render causes a re-render loop.
  useEffect(() => {
    if (!roleSelection.isLoading && !roleSelection.error && !roleSelection.hasMultipleRoles && phase === 'role') {
      if (roleSelection.selectedRoleId || roleSelection.roles.length === 0) {
        setPhase('terminal');
      }
    }
  }, [roleSelection.isLoading, roleSelection.error, roleSelection.hasMultipleRoles, roleSelection.selectedRoleId, roleSelection.roles.length, phase]);

  const terminalSelection = useTerminalSelection({
    roleId: roleReady ? roleSelection.selectedRoleId : undefined,
    roleName: roleSelection.selectedRole?.roleName ?? null,
  });

  const { setSession } = useTerminalSession();
  const { toast } = useToast();

  const handleRoleNext = () => {
    if (roleSelection.selectedRoleId) {
      setPhase('terminal');
    }
  };

  const handleBackToRoles = () => {
    setPhase('role');
  };

  const [lastTerminal] = useState(() => loadLastTerminal());

  // Quick-resume: when user clicks "Continue where you left off", we set the
  // terminal ID and flag that a quick resume is pending. The useEffect below
  // waits for the state to settle (selectedTerminalId matches) then continues.
  const quickResumeRef = useRef<string | null>(null);
  const autoContinuedRef = useRef(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { buildSession } = terminalSelection;
  const handleContinue = useCallback(() => {
    const session = buildSession();
    if (!session) {
      toast.error('Unable to build session — please re-select your register.');
      return;
    }
    setIsSubmitting(true);
    try {
      saveLastTerminal({
        terminalId: session.terminalId,
        terminalName: session.terminalName,
        locationName: session.locationName,
      });
      setSession(session);
      const registerLabel = session.terminalName || 'your register';
      const locationLabel = session.locationName ? ` at ${session.locationName}` : '';
      toast.success(`You're now on ${registerLabel}${locationLabel}`);
    } catch {
      setIsSubmitting(false);
    }
  }, [buildSession, setSession, toast]);

  // Quick-resume: wait for cascade to settle, then continue
  useEffect(() => {
    if (
      quickResumeRef.current &&
      terminalSelection.selectedTerminalId === quickResumeRef.current &&
      terminalSelection.canContinue
    ) {
      quickResumeRef.current = null;
      handleContinue();
    }
  }, [terminalSelection.selectedTerminalId, terminalSelection.canContinue, handleContinue]);

  // Auto-continue when there's only one possible selection at every level
  // (e.g. fresh account with a single default profit center + terminal).
  // Skips the selection screen entirely — zero friction.
  // Disabled during mid-session switching so user can always choose manually.
  // Uses a ref to fire only once per mount — manual clicks are never blocked.
  const { canContinue, isLoading: termLoading } = terminalSelection;
  useEffect(() => {
    if (isSwitching || autoContinuedRef.current) return;
    if (!termLoading && canContinue && !roleSelection.isLoading && !roleSelection.hasMultipleRoles) {
      autoContinuedRef.current = true;
      handleContinue();
    }
  }, [termLoading, canContinue, roleSelection.isLoading, roleSelection.hasMultipleRoles, handleContinue, isSwitching]);

  if (roleSelection.isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-indigo-600" />
      </div>
    );
  }

  // ── Error: Role fetch failed ─────────────────────────────────────
  if (roleSelection.error && phase === 'role') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="w-full max-w-md rounded-xl border border-border bg-surface p-8 shadow-lg">
          <div className="mb-6 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-red-500/10">
              <Shield className="h-6 w-6 text-red-500" />
            </div>
            <h1 className="text-xl font-bold text-foreground">Unable to Load Roles</h1>
            <p className="mt-2 text-sm text-muted-foreground">{roleSelection.error}</p>
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={roleSelection.retry}
              disabled={roleSelection.isLoading}
              className="flex-1 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
            >
              {roleSelection.isLoading ? 'Retrying...' : 'Retry'}
            </button>
            <button
              type="button"
              onClick={() => setPhase('terminal')}
              className="flex-1 rounded-lg border border-border px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-accent"
            >
              Skip
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Phase 1: Role Selection ──────────────────────────────────────
  if (showRolePhase) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="w-full max-w-md rounded-xl border border-border bg-surface p-8 shadow-lg">
          {/* Header */}
          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600">
              <Shield className="h-6 w-6 text-white" />
            </div>
            <h1 className="text-xl font-bold text-foreground">Select Your Role</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Choose the role you want to work under for this session
            </p>
          </div>

          {/* Role cards */}
          <div className="mb-8 space-y-3">
            {roleSelection.roles.map((role) => (
              <button
                key={role.assignmentId}
                type="button"
                onClick={() => roleSelection.setSelectedRoleId(role.roleId)}
                className={`w-full rounded-lg border-2 px-4 py-3 text-left transition-all ${
                  roleSelection.selectedRoleId === role.roleId
                    ? 'border-indigo-600 bg-indigo-500/10 ring-1 ring-indigo-600'
                    : 'border-border hover:border-indigo-500/50 hover:bg-accent'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold text-foreground">
                      {role.roleName}
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {role.scope === 'tenant'
                        ? 'All Locations'
                        : role.locationName ?? 'Specific Location'}
                    </div>
                  </div>
                  <div
                    className={`flex h-5 w-5 items-center justify-center rounded-full border-2 ${
                      roleSelection.selectedRoleId === role.roleId
                        ? 'border-indigo-600 bg-indigo-600'
                        : 'border-border'
                    }`}
                  >
                    {roleSelection.selectedRoleId === role.roleId && (
                      <div className="h-2 w-2 rounded-full bg-white" />
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={handleRoleNext}
            disabled={!roleSelection.selectedRoleId}
            className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>
    );
  }

  // ── Phase 2: Terminal Selection ──────────────────────────────────
  const {
    sites,
    venues,
    profitCenters,
    terminals,
    selectedSiteId,
    selectedVenueId,
    selectedProfitCenterId,
    selectedTerminalId,
    setSelectedSiteId,
    setSelectedVenueId,
    setSelectedProfitCenterId,
    setSelectedTerminalId,
    effectiveLocationId,
    error: termError,
    retry: termRetry,
    noProfitCentersExist,
  } = terminalSelection;

  if (termLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-indigo-600" />
      </div>
    );
  }

  // ── Error: Terminal data fetch failed ─────────────────────────────
  if (termError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="w-full max-w-md rounded-xl border border-border bg-surface p-8 shadow-lg">
          <div className="mb-6 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-red-500/10">
              <Monitor className="h-6 w-6 text-red-500" />
            </div>
            <h1 className="text-xl font-bold text-foreground">Unable to Load Registers</h1>
            <p className="mt-2 text-sm text-muted-foreground">{termError}</p>
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={termRetry}
              className="flex-1 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-500"
            >
              Retry
            </button>
            {onSkip && (
              <button
                type="button"
                onClick={onSkip}
                className="flex-1 rounded-lg border border-border px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-accent"
              >
                Skip
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  const showVenues = venues.length > 0;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-surface p-8 shadow-lg">
        {/* Header */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600">
            <span className="text-lg font-bold text-white">O</span>
          </div>
          <h1 className="text-xl font-bold text-foreground">Select Your Register</h1>
          <p className="mt-1 text-sm text-foreground/70">
            Choose your working location and register to get started
          </p>
          {/* Show selected role badge */}
          {roleSelection.selectedRole && (
            <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-indigo-500/10 px-3 py-1 text-xs font-medium text-indigo-400">
              <Shield className="h-3 w-3" />
              {roleSelection.selectedRole.roleName}
            </div>
          )}
        </div>

        {/* Back to role selection */}
        {roleSelection.hasMultipleRoles && (
          <button
            type="button"
            onClick={handleBackToRoles}
            className="mb-5 flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-500"
          >
            <ChevronLeft className="h-4 w-4" />
            Change Role
          </button>
        )}

        {/* Quick resume — offer to continue with last register */}
        {lastTerminal && !noProfitCentersExist && terminals.length > 0 && terminals.some((t) => t.id === lastTerminal.terminalId) && (
          <div className="mb-6 rounded-lg border border-indigo-500/30 bg-indigo-500/5 p-4">
            <p className="text-sm font-medium text-foreground">Continue where you left off?</p>
            <p className="mt-1 text-sm text-foreground/70">
              {lastTerminal.locationName && `${lastTerminal.locationName} — `}{lastTerminal.terminalName || 'Last register'}
            </p>
            <button
              type="button"
              onClick={() => {
                quickResumeRef.current = lastTerminal.terminalId;
                setSelectedTerminalId(lastTerminal.terminalId);
              }}
              className="mt-3 w-full rounded-lg bg-indigo-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-indigo-500"
              style={{ minHeight: '44px' }}
            >
              Continue as {lastTerminal.terminalName || 'Last Register'}
            </button>
          </div>
        )}

        {/* No profit centers — offer setup or skip */}
        {noProfitCentersExist && (
          <div className="mb-6 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-center">
            <p className="text-sm font-medium text-amber-500">
              No register groups or registers have been configured yet.
            </p>
            <p className="mt-1 text-sm text-amber-500/70">
              Set up your locations and registers to get started, or skip for now.
            </p>
            <div className="mt-3 flex gap-2 justify-center">
              <Link
                href="/settings/profit-centers"
                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-500"
              >
                <Settings className="h-3.5 w-3.5" />
                Set Up Now
              </Link>
              <button
                type="button"
                onClick={onSkip}
                className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-accent"
              >
                Skip for Now
              </button>
            </div>
          </div>
        )}

        {/* Site (Location) */}
        <div className="mb-5">
          <label htmlFor="tss-site" className="mb-1.5 flex items-center gap-2 text-sm font-medium text-foreground">
            <MapPin className="h-4 w-4 text-indigo-600" />
            Location
          </label>
          <select
            id="tss-site"
            value={selectedSiteId ?? ''}
            onChange={(e) => setSelectedSiteId(e.target.value || null)}
            className={selectClass}
          >
            <option value="">Select a location...</option>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        {/* Venue (only shown when site has children) */}
        {showVenues && (
          <div className="mb-5">
            <label htmlFor="tss-venue" className="mb-1.5 flex items-center gap-2 text-sm font-medium text-foreground">
              <Building2 className="h-4 w-4 text-indigo-600" />
              Venue
            </label>
            <select
              id="tss-venue"
              value={selectedVenueId ?? ''}
              onChange={(e) => setSelectedVenueId(e.target.value || null)}
              disabled={!selectedSiteId}
              className={selectClass}
            >
              <option value="">
                {venues.length === 0
                  ? 'No venues available'
                  : 'Select a venue...'}
              </option>
              {venues.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Register Group (formerly Profit Center) */}
        <div className="mb-5">
          <label htmlFor="tss-profit-center" className="mb-1.5 flex items-center gap-2 text-sm font-medium text-foreground">
            <Store className="h-4 w-4 text-indigo-600" />
            Register Group
          </label>
          <select
            id="tss-profit-center"
            value={selectedProfitCenterId ?? ''}
            onChange={(e) => setSelectedProfitCenterId(e.target.value || null)}
            disabled={!effectiveLocationId}
            className={selectClass}
          >
            <option value="">
              {!effectiveLocationId
                ? showVenues
                  ? 'Select a venue first...'
                  : 'Select a location first...'
                : profitCenters.length === 0
                  ? 'No register groups available'
                  : 'Select a register group...'}
            </option>
            {profitCenters.map((pc) => (
              <option key={pc.id} value={pc.id}>
                {pc.name}
                {pc.code ? ` (${pc.code})` : ''}
              </option>
            ))}
          </select>
          {effectiveLocationId && profitCenters.length === 0 && !noProfitCentersExist && (
            <div className="mt-2 flex items-center gap-2">
              <Link
                href="/settings/profit-centers"
                className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-500"
              >
                <Plus className="h-3 w-3" />
                Add a register group
              </Link>
              <span className="text-xs text-foreground/60">or</span>
              <button type="button" onClick={onSkip} className="text-xs font-medium text-foreground/60 hover:text-foreground">
                skip for now
              </button>
            </div>
          )}
        </div>

        {/* Register (formerly Terminal) */}
        <div className="mb-8">
          <label htmlFor="tss-terminal" className="mb-1.5 flex items-center gap-2 text-sm font-medium text-foreground">
            <Monitor className="h-4 w-4 text-indigo-600" />
            Register
          </label>
          <select
            id="tss-terminal"
            value={selectedTerminalId ?? ''}
            onChange={(e) => setSelectedTerminalId(e.target.value || null)}
            disabled={!selectedProfitCenterId}
            className={selectClass}
          >
            <option value="">
              {!selectedProfitCenterId
                ? 'Select a register group first...'
                : terminals.length === 0
                  ? 'No registers available'
                  : 'Select a register...'}
            </option>
            {terminals.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
                {t.terminalNumber ? ` (#${t.terminalNumber})` : ''}
              </option>
            ))}
          </select>
          {selectedProfitCenterId && terminals.length === 0 && (
            <div className="mt-2 flex items-center gap-2">
              <Link
                href="/settings/profit-centers"
                className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-500"
              >
                <Plus className="h-3 w-3" />
                Add a register
              </Link>
              <span className="text-xs text-foreground/60">or</span>
              <button type="button" onClick={onSkip} className="text-xs font-medium text-foreground/60 hover:text-foreground">
                skip for now
              </button>
            </div>
          )}
        </div>

        {/* Continue */}
        <button
          type="button"
          onClick={handleContinue}
          disabled={!canContinue || isSubmitting}
          className="w-full rounded-lg bg-indigo-600 px-4 py-3 text-base font-semibold text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
          style={{ minHeight: '44px' }}
        >
          {isSubmitting ? 'Starting...' : 'Continue'}
        </button>
      </div>
    </div>
  );
}
