'use client';

interface MemberAccountBannerProps {
  displayName: string;
  onChargeToAccount: () => void;
}

/**
 * Path A banner: auto-detected member linked to the tab.
 * Shown at the top of the review page.
 */
export function MemberAccountBanner({ displayName, onChargeToAccount }: MemberAccountBannerProps) {
  return (
    <div className="mx-4 mb-4 rounded-xl bg-green-50 border border-green-200 px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="h-7 w-7 shrink-0 rounded-full bg-green-600 flex items-center justify-center">
            <span className="text-white text-xs font-bold">
              {displayName.charAt(0).toUpperCase()}
            </span>
          </div>
          <p className="text-sm font-medium text-green-800 truncate">
            Welcome back, {displayName}
          </p>
        </div>
        <button
          type="button"
          onClick={onChargeToAccount}
          className="shrink-0 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700 transition-colors"
        >
          Charge to Account
        </button>
      </div>
    </div>
  );
}
