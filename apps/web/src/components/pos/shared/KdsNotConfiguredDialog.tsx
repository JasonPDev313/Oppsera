'use client';

import { memo } from 'react';
import { createPortal } from 'react-dom';
import { X, AlertTriangle, Wand2, MapPin } from 'lucide-react';

interface KdsNotConfiguredDialogProps {
  open: boolean;
  onClose: () => void;
  locationId?: string;
  locationName?: string;
  /** Whether the user has permission to configure KDS. Hides the setup link when false. */
  canSetup?: boolean;
}

/**
 * Dialog shown when a user tries to send an order to KDS but no KDS stations
 * exist at the current POS location. Explains the per-location requirement and
 * gives a direct link to the setup wizard (pre-selecting this location).
 */
export const KdsNotConfiguredDialog = memo(function KdsNotConfiguredDialog({
  open,
  onClose,
  locationId,
  locationName,
  canSetup = true,
}: KdsNotConfiguredDialogProps) {
  if (!open) return null;

  const wizardHref = locationId
    ? `/kds/setup?locationId=${encodeURIComponent(locationId)}`
    : '/kds/setup';

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <button
        type="button"
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
        aria-label="Close dialog"
      />

      {/* Panel */}
      <div
        className="relative mx-4 w-full max-w-md rounded-xl p-6"
        style={{ backgroundColor: 'var(--fnb-bg-surface, hsl(var(--surface)))' }}
      >
        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 rounded-lg p-1.5 transition-colors hover:opacity-80"
          style={{ color: 'var(--fnb-text-muted, hsl(var(--muted-foreground)))' }}
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Icon */}
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-500/15">
          <AlertTriangle className="h-7 w-7 text-amber-400" />
        </div>

        {/* Title */}
        <h2
          className="text-center text-lg font-semibold"
          style={{ color: 'var(--fnb-text-primary, hsl(var(--foreground)))' }}
        >
          KDS Not Set Up{locationName ? ` at ${locationName}` : ''}
        </h2>

        {/* Explanation */}
        <div className="mt-3 space-y-3">
          <p
            className="text-center text-sm leading-relaxed"
            style={{ color: 'var(--fnb-text-secondary, hsl(var(--muted-foreground)))' }}
          >
            There are no kitchen display stations configured for this location. Orders
            can&apos;t be sent to the kitchen until at least one KDS station is created.
          </p>

          {/* Key point */}
          <div
            className="flex items-start gap-2.5 rounded-lg p-3"
            style={{ backgroundColor: 'var(--fnb-bg-elevated, rgba(148, 163, 184, 0.06))' }}
          >
            <MapPin className="h-4 w-4 shrink-0 mt-0.5 text-indigo-400" />
            <p
              className="text-xs leading-relaxed"
              style={{ color: 'var(--fnb-text-muted, hsl(var(--muted-foreground)))' }}
            >
              KDS stations are <strong>per-location</strong>. Each location where you ring up
              orders needs its own KDS setup. Make sure you set up stations at the same
              location your POS is using.
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="mt-5 flex flex-col gap-2">
          {canSetup ? (
            <a
              href={wizardHref}
              className="flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium text-white"
              style={{ backgroundColor: '#6366f1' }}
            >
              <Wand2 className="h-4 w-4" />
              Set Up KDS{locationName ? ` for ${locationName}` : ''}
            </a>
          ) : (
            <p
              className="text-center text-xs leading-relaxed"
              style={{ color: 'var(--fnb-text-muted, hsl(var(--muted-foreground)))' }}
            >
              Ask a manager or admin to run the KDS Setup Wizard for this location.
            </p>
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors hover:opacity-80"
            style={{
              borderColor: 'var(--fnb-text-muted, rgba(148, 163, 184, 0.2))',
              color: 'var(--fnb-text-secondary, hsl(var(--muted-foreground)))',
            }}
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
});
