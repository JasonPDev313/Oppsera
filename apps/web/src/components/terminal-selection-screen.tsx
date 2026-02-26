'use client';

import { useState } from 'react';
import Link from 'next/link';
import { MapPin, Building2, Store, Monitor, Shield, ChevronLeft, Settings, Plus } from 'lucide-react';
import { useTerminalSelection } from '@/hooks/use-terminal-selection';
import { useRoleSelection } from '@/hooks/use-role-selection';
import { useTerminalSession } from '@/components/terminal-session-provider';

const selectClass =
  'w-full rounded-lg border border-input bg-surface px-3 py-2.5 text-sm text-foreground focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50';

export function TerminalSelectionScreen({ onSkip }: { onSkip?: () => void }) {
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
  if (!roleSelection.isLoading && !roleSelection.error && !roleSelection.hasMultipleRoles && phase === 'role') {
    // Auto-selected — move to terminal phase
    if (roleSelection.selectedRoleId || roleSelection.roles.length === 0) {
      setPhase('terminal');
    }
  }

  const terminalSelection = useTerminalSelection({
    roleId: roleReady ? roleSelection.selectedRoleId : undefined,
    roleName: roleSelection.selectedRole?.roleName ?? null,
  });

  const { setSession } = useTerminalSession();

  const handleRoleNext = () => {
    if (roleSelection.selectedRoleId) {
      setPhase('terminal');
    }
  };

  const handleBackToRoles = () => {
    setPhase('role');
  };

  const handleContinue = () => {
    const session = terminalSelection.buildSession();
    if (session) {
      setSession(session);
    }
  };

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
              onClick={() => window.location.reload()}
              className="flex-1 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-500"
            >
              Retry
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
    canContinue,
    isLoading: terminalLoading,
    noProfitCentersExist,
  } = terminalSelection;

  if (terminalLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-indigo-600" />
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
          <h1 className="text-xl font-bold text-foreground">Select Your Terminal</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Choose your working location and terminal to get started
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

        {/* No profit centers — offer setup or skip */}
        {noProfitCentersExist && (
          <div className="mb-6 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-center">
            <p className="text-sm font-medium text-amber-500">
              No profit centers or terminals have been configured yet.
            </p>
            <p className="mt-1 text-xs text-amber-500/70">
              Set up your locations and terminals to get started, or skip for now.
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
          <label className="mb-1.5 flex items-center gap-2 text-sm font-medium text-foreground">
            <MapPin className="h-4 w-4 text-indigo-600" />
            Location
          </label>
          <select
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
            <label className="mb-1.5 flex items-center gap-2 text-sm font-medium text-foreground">
              <Building2 className="h-4 w-4 text-indigo-600" />
              Venue
            </label>
            <select
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

        {/* Profit Center */}
        <div className="mb-5">
          <label className="mb-1.5 flex items-center gap-2 text-sm font-medium text-foreground">
            <Store className="h-4 w-4 text-indigo-600" />
            Profit Center
          </label>
          <select
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
                  ? 'No profit centers available'
                  : 'Select a profit center...'}
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
                Add a profit center
              </Link>
              <span className="text-xs text-muted-foreground">or</span>
              <button type="button" onClick={onSkip} className="text-xs font-medium text-muted-foreground hover:text-foreground">
                skip for now
              </button>
            </div>
          )}
        </div>

        {/* Terminal */}
        <div className="mb-8">
          <label className="mb-1.5 flex items-center gap-2 text-sm font-medium text-foreground">
            <Monitor className="h-4 w-4 text-indigo-600" />
            Terminal
          </label>
          <select
            value={selectedTerminalId ?? ''}
            onChange={(e) => setSelectedTerminalId(e.target.value || null)}
            disabled={!selectedProfitCenterId}
            className={selectClass}
          >
            <option value="">
              {!selectedProfitCenterId
                ? 'Select a profit center first...'
                : terminals.length === 0
                  ? 'No terminals available'
                  : 'Select a terminal...'}
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
                Add a terminal
              </Link>
              <span className="text-xs text-muted-foreground">or</span>
              <button type="button" onClick={onSkip} className="text-xs font-medium text-muted-foreground hover:text-foreground">
                skip for now
              </button>
            </div>
          )}
        </div>

        {/* Continue */}
        <button
          type="button"
          onClick={handleContinue}
          disabled={!canContinue}
          className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Continue
        </button>
      </div>
    </div>
  );
}
