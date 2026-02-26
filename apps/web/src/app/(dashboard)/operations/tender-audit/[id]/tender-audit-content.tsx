'use client';

import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  XCircle,
  DollarSign,
  CreditCard,
  FileText,
  Building2,
  Receipt,
} from 'lucide-react';
import { useTenderAuditTrail } from '@/hooks/use-operations';

function formatMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

const STAGE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  tender: CreditCard,
  order: Receipt,
  gl_posting: FileText,
  settlement: Building2,
  deposit: DollarSign,
};

const STATUS_CONFIG = {
  complete: {
    icon: CheckCircle2,
    color: 'text-green-500',
    bg: 'bg-green-500/10',
    line: 'bg-green-300',
  },
  pending: {
    icon: Clock,
    color: 'text-amber-500',
    bg: 'bg-amber-500/10',
    line: 'bg-amber-300',
  },
  missing: {
    icon: XCircle,
    color: 'text-muted-foreground',
    bg: 'bg-muted',
    line: 'bg-muted',
  },
};

export default function TenderAuditContent() {
  const params = useParams();
  const router = useRouter();
  const tenderId = params?.id as string;

  const { data: trail, isLoading, error } = useTenderAuditTrail(tenderId);

  if (isLoading) {
    return (
      <div className="space-y-6 p-6">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="h-96 animate-pulse rounded-lg bg-muted" />
      </div>
    );
  }

  if (error || !trail) {
    return (
      <div className="p-6">
        <button
          onClick={() => router.back()}
          className="mb-4 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-6 text-center">
          <XCircle className="mx-auto h-8 w-8 text-red-400" />
          <p className="mt-2 text-sm text-red-500">
            {error ? 'Failed to load tender audit trail' : 'Tender not found'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <div>
          <h1 className="text-xl font-semibold">Tender Audit Trail</h1>
          <p className="text-sm text-muted-foreground">
            {trail.tenderType} — {formatMoney(trail.amountCents)}
            {trail.tipAmountCents > 0 && ` (+ ${formatMoney(trail.tipAmountCents)} tip)`}
          </p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-lg border bg-surface p-3">
          <div className="text-xs text-muted-foreground">Order</div>
          <div className="text-sm font-medium">{trail.orderNumber ? `#${trail.orderNumber}` : trail.orderId.slice(-8)}</div>
        </div>
        <div className="rounded-lg border bg-surface p-3">
          <div className="text-xs text-muted-foreground">Amount</div>
          <div className="text-sm font-medium">{formatMoney(trail.amountCents)}</div>
        </div>
        <div className="rounded-lg border bg-surface p-3">
          <div className="text-xs text-muted-foreground">Date</div>
          <div className="text-sm font-medium">{trail.businessDate}</div>
        </div>
        <div className="rounded-lg border bg-surface p-3">
          <div className="text-xs text-muted-foreground">Type</div>
          <div className="text-sm font-medium capitalize">{trail.tenderType.replace(/_/g, ' ')}</div>
        </div>
      </div>

      {/* Vertical Timeline */}
      <div className="rounded-lg border bg-surface p-6">
        <h2 className="mb-6 font-semibold">Lifecycle</h2>
        <div className="relative">
          {trail.steps.map((step, idx) => {
            const config = STATUS_CONFIG[step.status];
            const StatusIcon = config.icon;
            const StageIcon = STAGE_ICONS[step.stage] ?? FileText;
            const isLast = idx === trail.steps.length - 1;

            return (
              <div key={step.stage} className="relative flex gap-4 pb-8">
                {/* Timeline line */}
                {!isLast && (
                  <div
                    className={`absolute left-5 top-10 h-[calc(100%-2rem)] w-0.5 ${config.line}`}
                  />
                )}

                {/* Icon */}
                <div className={`relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${config.bg}`}>
                  <StageIcon className={`h-5 w-5 ${config.color}`} />
                </div>

                {/* Content */}
                <div className="flex-1 pt-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{step.label}</span>
                    <StatusIcon className={`h-4 w-4 ${config.color}`} />
                  </div>
                  {step.detail && (
                    <p className="mt-0.5 text-sm text-muted-foreground">{step.detail}</p>
                  )}
                  {step.timestamp && (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {new Date(step.timestamp).toLocaleString()}
                    </p>
                  )}
                  {step.referenceId && (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Ref: {step.referenceId.slice(-12)}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
