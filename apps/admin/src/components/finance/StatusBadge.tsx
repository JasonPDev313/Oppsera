'use client';

const STATUS_COLORS: Record<string, string> = {
  // Order statuses
  open: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
  placed: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30',
  paid: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  voided: 'bg-red-500/10 text-red-400 border-red-500/30',
  held: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  partial: 'bg-amber-500/10 text-amber-400 border-amber-500/30',

  // Chargeback statuses
  received: 'bg-red-500/10 text-red-400 border-red-500/30',
  under_review: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  won: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  lost: 'bg-red-500/10 text-red-400 border-red-500/30',

  // Close batch statuses
  reconciled: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  posted: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  locked: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  in_progress: 'bg-blue-500/10 text-blue-400 border-blue-500/30',

  // Voucher statuses
  unredeemed: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
  partially_redeemed: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  fully_redeemed: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  expired: 'bg-slate-500/10 text-slate-400 border-slate-500/30',
  refunded: 'bg-orange-500/10 text-orange-400 border-orange-500/30',

  // Tender/refund statuses
  completed: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  pending: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  reversed: 'bg-red-500/10 text-red-400 border-red-500/30',
  failed: 'bg-red-500/10 text-red-400 border-red-500/30',

  // GL statuses
  draft: 'bg-amber-500/10 text-amber-400 border-amber-500/30',

  // Fallback
  default: 'bg-slate-500/10 text-slate-400 border-slate-500/30',
};

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export function StatusBadge({ status, className = '' }: StatusBadgeProps) {
  const colors = STATUS_COLORS[status] ?? STATUS_COLORS.default;
  const label = status.replace(/_/g, ' ');

  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium border capitalize ${colors} ${className}`}
    >
      {label}
    </span>
  );
}
