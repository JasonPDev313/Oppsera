'use client';

import { Badge } from '@/components/ui/badge';
import type { ReceiptStatus } from '@/types/receiving';

const statusConfig: Record<ReceiptStatus, { variant: 'warning' | 'success' | 'error'; label: string }> = {
  draft: { variant: 'warning', label: 'Draft' },
  posted: { variant: 'success', label: 'Posted' },
  voided: { variant: 'error', label: 'Voided' },
};

export function ReceiptStatusBadge({ status }: { status: ReceiptStatus }) {
  const config = statusConfig[status] ?? { variant: 'neutral' as const, label: status };
  return <Badge variant={config.variant}>{config.label}</Badge>;
}
