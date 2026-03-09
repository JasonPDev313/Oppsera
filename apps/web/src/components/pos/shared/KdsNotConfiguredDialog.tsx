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

        {/* Explanation — bullet points for easy scanning */}
        <div className="mt-4 space-y-3">
          <ul className="space-y-2 text-left">
            <li className="flex items-start gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
              <span
                className="text-sm leading-relaxed"
                style={{ color: 'var(--fnb-text-secondary, hsl(var(--foreground, 0 0% 90%)))' }}
              >
                No kitchen screens are set up at this location yet
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
              <span
                className="text-sm leading-relaxed"
                style={{ color: 'var(--fnb-text-secondary, hsl(var(--foreground, 0 0% 90%)))' }}
              >
                Orders can&apos;t reach the kitchen until KDS is set up
              </span>
            </li>
            <li className="flex items-start gap-2">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-indigo-400" />
              <span
                className="text-sm leading-relaxed"
                style={{ color: 'var(--fnb-text-secondary, hsl(var(--foreground, 0 0% 90%)))' }}
              >
                Each location needs its <strong>own</strong> KDS setup
              </span>
            </li>
          </ul>
        </div>

        {/* Actions */}
        <div className="mt-5 flex flex-col gap-3">
          {canSetup ? (
            <a
              href={wizardHref}
              className="flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 text-base font-semibold text-white"
              style={{ backgroundColor: '#6366f1', minHeight: '44px' }}
            >
              <Wand2 className="h-5 w-5" />
              Set Up KDS{locationName ? ` for ${locationName}` : ''}
            </a>
          ) : (
            <p
              className="text-center text-sm leading-relaxed"
              style={{ color: 'var(--fnb-text-secondary, hsl(var(--foreground, 0 0% 90%)))' }}
            >
              Ask a manager or admin to run the KDS Setup Wizard for this location.
            </p>
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border px-4 py-3 text-base font-medium transition-colors hover:opacity-80"
            style={{
              borderColor: 'var(--fnb-text-muted, rgba(148, 163, 184, 0.3))',
              color: 'var(--fnb-text-secondary, hsl(var(--foreground, 0 0% 90%)))',
              minHeight: '44px',
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
