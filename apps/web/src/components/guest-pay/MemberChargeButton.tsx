'use client';

interface MemberChargeButtonProps {
  memberName: string;
  totalCents: number;
  availableCreditCents: number | null;
  onCharge: () => void;
  onCancel: () => void;
  disabled?: boolean;
}

export function MemberChargeButton({
  memberName,
  totalCents,
  availableCreditCents,
  onCharge,
  onCancel,
  disabled,
}: MemberChargeButtonProps) {
  const insufficientCredit = availableCreditCents != null && totalCents > availableCreditCents;

  return (
    <div className="space-y-3">
      {/* Member badge */}
      <div className="flex items-center gap-2 rounded-xl bg-green-500/10 border border-green-500/30 px-4 py-3">
        <div className="h-8 w-8 rounded-full bg-green-600 flex items-center justify-center">
          <span className="text-white text-sm font-bold">
            {memberName.charAt(0).toUpperCase()}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-green-500 truncate">{memberName}</p>
          {availableCreditCents != null && (
            <p className="text-xs text-green-500/80">
              Available: ${(availableCreditCents / 100).toFixed(2)}
            </p>
          )}
        </div>
      </div>

      {/* Insufficient credit warning */}
      {insufficientCredit && (
        <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 px-4 py-3">
          <p className="text-sm text-amber-500">
            This charge exceeds your available credit. Please see your server for alternative payment.
          </p>
        </div>
      )}

      {/* Charge button */}
      <button
        type="button"
        onClick={onCharge}
        disabled={disabled || insufficientCredit}
        className="w-full rounded-2xl bg-green-600 py-4 text-base font-bold text-white shadow-lg transition-all hover:bg-green-700 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Charge ${(totalCents / 100).toFixed(2)} to Account
      </button>

      {/* Cancel */}
      <button
        type="button"
        onClick={onCancel}
        disabled={disabled}
        className="w-full py-2 text-sm text-muted-foreground hover:text-foreground"
      >
        Cancel
      </button>
    </div>
  );
}
